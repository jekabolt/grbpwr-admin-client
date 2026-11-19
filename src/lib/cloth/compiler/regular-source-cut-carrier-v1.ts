import cdt2d from 'cdt2d';
import robustOrientation from 'robust-orientation';

import type { AuthoredPressHingeTargetV1 } from './pressed-crease-bend-rest-v1';
import { seamSegmentIsCoveredByMeshV1 } from '../mesh/triangulation/seam-point-embedding-v1';
import type { Vec2Mm } from '../domain/garment-assembly-ir';
import {
  CLOTH_MESH_IR_VERSION,
  measureClothMeshQuality,
  type ClothMeshIR,
} from '../mesh/cloth-mesh-ir';
import type { SourceCutMassTransferMeshV1 } from '../mesh/triangulation/source-cut-mass-transfer-v1';

type Piece = Readonly<{
  pieceId: string;
  ringMm: readonly Vec2Mm[];
  /** The triangular lattice is evaluated in this source-local frame. */
  angleDeg: number;
  phaseX: number;
  phaseY: number;
  pressAxes?: readonly Readonly<{
    lineMm: readonly [Vec2Mm, Vec2Mm];
    angleRad: number;
    maximumHingeLengthMm: number;
  }>[];
}>;

const side = (a: Vec2Mm, b: Vec2Mm, c: Vec2Mm) =>
  (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);

function intersect(subject: readonly Vec2Mm[], triangle: readonly Vec2Mm[]): Vec2Mm[] {
  let vertices = [...subject];
  for (const [index, a] of triangle.entries()) {
    const b = triangle[(index + 1) % 3];
    const next: Vec2Mm[] = [];
    for (const [corner, p] of vertices.entries()) {
      const q = vertices[(corner + 1) % vertices.length];
      const s = side(a, b, p);
      const t = side(a, b, q);
      if (s >= 0) next.push(p);
      if (s >= 0 !== t >= 0) {
        const fraction = s / (s - t);
        next.push([p[0] + (q[0] - p[0]) * fraction, p[1] + (q[1] - p[1]) * fraction]);
      }
    }
    vertices = next;
  }
  return vertices;
}

function enclosedArea(vertices: readonly Vec2Mm[]): number {
  const [first] = vertices;
  return first
    ? vertices
        .slice(1, -1)
        .reduce((area, p, index) => area + Math.abs(side(first, p, vertices[index + 2])) / 2, 0)
    : 0;
}

function bounds(points: readonly Vec2Mm[]) {
  return {
    minX: Math.min(...points.map(([x]) => x)),
    maxX: Math.max(...points.map(([x]) => x)),
    minY: Math.min(...points.map(([, y]) => y)),
    maxY: Math.max(...points.map(([, y]) => y)),
  };
}

function refinePressCarrier(
  grid: [number, number][],
  axes: NonNullable<Piece['pressAxes']>,
  pieceId: string,
  cut: SourceCutMassTransferMeshV1,
  hasMaterial: (face: readonly Vec2Mm[]) => boolean,
  remainingTests: number,
) {
  const ids = new Map(grid.map(([x, y], i) => [`${x}:${y}`, i]));
  const add = ([x, y]: Vec2Mm) => {
    const key = `${x}:${y}`;
    const current = ids.get(key);
    if (current !== undefined) return current;
    const next = grid.length;
    ids.set(key, next);
    grid.push([x, y]);
    return next;
  };
  const targets = axes.map(({ lineMm: [a, b], maximumHingeLengthMm, angleRad }) => {
    const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const count = Math.ceil(length / maximumHingeLengthMm);
    if (
      !Number.isSafeInteger(count) ||
      count < 1 ||
      count > 512 ||
      !seamSegmentIsCoveredByMeshV1(cut.verticesMm, cut.triangles, a, b)
    )
      throw new RangeError('The press axis must be a bounded line inside its original cut.');
    const axis = Math.abs(b[0] - a[0]) >= Math.abs(b[1] - a[1]) ? 0 : 1;
    const along = grid.flatMap((point, i) => {
      const t = (point[axis] - a[axis]) / (b[axis] - a[axis]);
      return t > 0 && t < 1 && robustOrientation(a, b, point) === 0 ? [{ t, i }] : [];
    });
    for (let i = 0; i <= count; i++) {
      const t = i / count;
      const point =
        i === 0
          ? a
          : i === count
            ? b
            : ([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t] as const);
      along.push({ t, i: add(point) });
    }
    const walk = [...new Set(along.sort((p, q) => p.t - q.t).map(({ i }) => i))];
    return {
      pieceId,
      angleRad,
      edges: walk.slice(1).map((end, i) => [walk[i], end] as [number, number]),
    };
  });
  const hingeEdges = targets.flatMap((target) => target.edges);
  const extraTests = (grid.length * 2 * cut.triangles.length) / 3;
  if (extraTests > remainingTests)
    throw new RangeError('Press hinge refinement exceeds the carrier candidate work budget.');
  const faces = cdt2d(grid, hingeEdges, { delaunay: true, interior: true, exterior: true });
  // Open axes constrain edges without delimiting material. Clip only against the original cut.
  const retained = faces.filter((face) => hasMaterial(face.map((id) => grid[id])));
  const used = new Set(retained.flat());
  const remap = new Map<number, number>();
  const verticesMm: Vec2Mm[] = [];
  for (const [id, point] of grid.entries()) {
    if (!used.has(id)) continue;
    remap.set(id, remap.size);
    verticesMm.push(point);
  }
  const facesLocal = retained.flatMap((face) => face.map((id) => remap.get(id)!));
  const hingeTargets: AuthoredPressHingeTargetV1[] = [];
  for (const target of targets) {
    const edges = target.edges.map(([a, b]) => {
      const from = remap.get(a),
        to = remap.get(b);
      if (from === undefined || to === undefined)
        throw new RangeError('The press axis was not retained on its material carrier.');
      return [from, to] as const;
    });
    hingeTargets.push({ ...target, edges });
  }
  return { verticesMm, facesLocal, hingeTargets, triangleTests: extraTests };
}

/** Start from the native cuts and keep exactly the occupied faces of the regular carrier. */
export function compileRegularSourceCutCarrierV1(
  input: Readonly<{
    sourceFingerprint: string;
    pieces: readonly Piece[];
    spacingMm: number;
    maximumTriangleTests: number;
  }>,
  signal?: AbortSignal,
) {
  const { pieces, sourceFingerprint, spacingMm, maximumTriangleTests } = input;
  if (
    !sourceFingerprint ||
    pieces.length < 1 ||
    pieces.length > 64 ||
    new Set(pieces.map(({ pieceId }) => pieceId)).size !== pieces.length ||
    !(spacingMm > 0 && Number.isFinite(spacingMm)) ||
    !Number.isSafeInteger(maximumTriangleTests) ||
    maximumTriangleTests < 1 ||
    maximumTriangleTests > 20_000_000
  )
    throw new RangeError('Invalid source cut carrier input or work budget.');
  const pieceRanges: ClothMeshIR['pieceRanges'][number][] = [];
  const positions: number[] = [];
  const triangles: number[] = [];
  const cuts = new Map<string, { cut: SourceCutMassTransferMeshV1; maxSurfaceTriangles: number }>();
  const pressHingeTargets: AuthoredPressHingeTargetV1[] = [];
  let admittedTests = 0;

  for (const { pieceId, ringMm, angleDeg, phaseX, phaseY, pressAxes } of pieces) {
    signal?.throwIfAborted();
    if (
      !pieceId ||
      ringMm.length < 3 ||
      ringMm.length > 4096 ||
      !Number.isFinite(angleDeg) ||
      ![phaseX, phaseY].every((phase) => phase >= 0 && phase < 1) ||
      ringMm.some((point) => point.length !== 2 || !point.every(Number.isFinite))
    )
      throw new RangeError(
        'The regular carrier requires a bounded exact cut ring and lattice frame.',
      );
    const native: [number, number][] = ringMm.map(([x, y]) => [x, y]);
    const edges: [number, number][] = native.map((_, index) => [
      index,
      (index + 1) % native.length,
    ]);
    const sourceFaces = cdt2d(native, edges, { delaunay: true, interior: true, exterior: false });
    const angle = (Math.PI * angleDeg) / 180;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const rotated: Vec2Mm[] = native.map(([x, y]) => [x * cos + y * sin, -x * sin + y * cos]);
    const ringBounds = bounds(rotated);
    const rowHeight = (Math.sqrt(3) * spacingMm) / 2;
    const startY = Math.floor(ringBounds.minY / rowHeight - phaseY);
    const endY = Math.ceil(ringBounds.maxY / rowHeight - phaseY);
    const minX = ringBounds.minX / spacingMm - phaseX;
    const maxX = ringBounds.maxX / spacingMm - phaseX;
    // x depends on the row offset, while the maximum row width does not.
    const maximumColumns = Math.ceil(maxX - minX) + 3;
    const tests = (endY - startY) * maximumColumns * sourceFaces.length * 2;
    if (
      sourceFaces.length === 0 ||
      ![startY, endY, Math.floor(minX), Math.ceil(maxX), tests].every(Number.isSafeInteger) ||
      tests < 1 ||
      admittedTests + tests > maximumTriangleTests
    )
      throw new RangeError('The native ring exceeds the regular carrier candidate work budget.');
    admittedTests += tests;
    const source = sourceFaces.map((ids) => {
      const points = ids.map((id) => rotated[id]);
      return { points, ...bounds(points) };
    });
    const hasMaterial = (triangle: readonly Vec2Mm[]) => {
      const box = bounds(triangle);
      return source.some(
        (face) =>
          face.minX <= box.maxX &&
          face.maxX >= box.minX &&
          face.minY <= box.maxY &&
          face.maxY >= box.minY &&
          enclosedArea(intersect(face.points, triangle)) > 0,
      );
    };
    const vertexOffset = positions.length / 2;
    const triangleOffset = triangles.length / 3;
    const gridVertices = new Map<string, number>();
    const at = (x: number, y: number): Vec2Mm => [
      (x + y * 0.5 + phaseX) * spacingMm,
      (y + phaseY) * rowHeight,
    ];
    for (let y = startY; y < endY; y++) {
      signal?.throwIfAborted();
      const startX = Math.floor(minX - (y + 1) * 0.5);
      const endX = Math.ceil(maxX - y * 0.5);
      for (let x = startX; x < endX; x++) {
        const p = at(x, y);
        const q = at(x + 1, y);
        const r = at(x + 1, y + 1);
        const s = at(x, y + 1);
        for (const triangle of [
          [p, q, s],
          [q, r, s],
        ]) {
          if (!hasMaterial(triangle)) continue;
          for (const [nx, ny] of triangle) {
            const key = nx + ':' + ny;
            let index = gridVertices.get(key);
            if (index === undefined) {
              index = positions.length / 2;
              gridVertices.set(key, index);
              positions.push(nx * cos - ny * sin, nx * sin + ny * cos);
            }
            triangles.push(index);
          }
        }
      }
    }
    const cut = { verticesMm: native, triangles: Uint32Array.from(sourceFaces.flat()) };
    if (pressAxes && pressAxes.length > 8)
      throw new RangeError('Press hinge refinement exceeds the per-piece axis budget.');
    let vertexCount = gridVertices.size;
    if (pressAxes?.length) {
      const grid: [number, number][] = Array.from({ length: gridVertices.size }, (_, i) => [
        positions[2 * (vertexOffset + i)],
        positions[2 * (vertexOffset + i) + 1],
      ]);
      const refined = refinePressCarrier(
        grid,
        pressAxes,
        pieceId,
        cut,
        (face) => hasMaterial(face.map(([x, y]) => [x * cos + y * sin, -x * sin + y * cos])),
        maximumTriangleTests - admittedTests,
      );
      admittedTests += refined.triangleTests;
      positions.length = vertexOffset * 2;
      triangles.length = triangleOffset * 3;
      for (const point of refined.verticesMm) positions.push(...point);
      for (const index of refined.facesLocal) triangles.push(vertexOffset + index);
      pressHingeTargets.push(...refined.hingeTargets);
      vertexCount = refined.verticesMm.length;
    }
    const triangleCount = triangles.length / 3 - triangleOffset;
    if (triangleCount < 1) throw new RangeError('The source cut has no occupied carrier faces.');
    pieceRanges.push({
      pieceId,
      vertexOffset,
      vertexCount,
      triangleOffset,
      triangleCount,
    });
    cuts.set(pieceId, {
      cut,
      maxSurfaceTriangles: 20_000,
    });
  }
  const restPositions2Mm = Float32Array.from(positions);
  const faceIndices = Uint32Array.from(triangles);
  const mesh: ClothMeshIR = {
    schemaVersion: CLOTH_MESH_IR_VERSION,
    sourceAssemblyFingerprint: sourceFingerprint,
    sourceUnits: 'mm',
    restPositions2Mm,
    triangles: faceIndices,
    pieceRanges,
    boundarySamples: [],
    seams: [],
    quality: pressHingeTargets.length
      ? measureClothMeshQuality(restPositions2Mm, faceIndices)
      : {
          degenerateTriangles: 0,
          minTriangleAngleDegrees: 59.99,
          maxEdgeRatio: 1.00001,
          maxBoundaryErrorMm: 0,
        },
  };
  return { mesh, cuts, materialPositionsMm: Float64Array.from(positions), pressHingeTargets };
}
