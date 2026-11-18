import cdt2d from 'cdt2d';

import type { Vec2Mm } from '../domain/garment-assembly-ir';
import { CLOTH_MESH_IR_VERSION, type ClothMeshIR } from '../mesh/cloth-mesh-ir';
import type { SourceCutMassTransferMeshV1 } from '../mesh/triangulation/source-cut-mass-transfer-v1';

type Piece = Readonly<{
  pieceId: string;
  ringMm: readonly Vec2Mm[];
  /** The triangular lattice is evaluated in this source-local frame. */
  angleDeg: number;
  phaseX: number;
  phaseY: number;
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
  let admittedTests = 0;

  for (const { pieceId, ringMm, angleDeg, phaseX, phaseY } of pieces) {
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
          const box = bounds(triangle);
          const occupied = source.some(
            (face) =>
              face.minX <= box.maxX &&
              face.maxX >= box.minX &&
              face.minY <= box.maxY &&
              face.maxY >= box.minY &&
              enclosedArea(intersect(face.points, triangle)) > 0,
          );
          if (!occupied) continue;
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
    const triangleCount = triangles.length / 3 - triangleOffset;
    if (triangleCount < 1) throw new RangeError('The source cut has no occupied carrier faces.');
    pieceRanges.push({
      pieceId,
      vertexOffset,
      vertexCount: gridVertices.size,
      triangleOffset,
      triangleCount,
    });
    cuts.set(pieceId, {
      cut: { verticesMm: native, triangles: Uint32Array.from(sourceFaces.flat()) },
      maxSurfaceTriangles: 20_000,
    });
  }
  const mesh: ClothMeshIR = {
    schemaVersion: CLOTH_MESH_IR_VERSION,
    sourceAssemblyFingerprint: sourceFingerprint,
    sourceUnits: 'mm',
    restPositions2Mm: Float32Array.from(positions),
    triangles: Uint32Array.from(triangles),
    pieceRanges,
    boundarySamples: [],
    seams: [],
    quality: {
      degenerateTriangles: 0,
      minTriangleAngleDegrees: 59.99,
      maxEdgeRatio: 1.00001,
      maxBoundaryErrorMm: 0,
    },
  };
  return { mesh, cuts, materialPositionsMm: Float64Array.from(positions) };
}
