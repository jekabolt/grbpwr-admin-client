import {
  DEFAULT_MEASUREMENT_PARTITIONED_SURFACE_CONTACT_BUDGET_V1,
  type MeasurementPartitionedSurfaceContactBudgetV1,
  validateMeasurementPartitionedSurfaceSelfIntersectionV1,
  validateMeasurementReferenceSurfaceClearanceV1,
  validateMeasurementReferenceSurfaceIntersectionsV1,
} from '../../body/measurement-surface-self-intersection-v1';
import { TRIANGLE_INDICES_GPU_V1 } from '../../compiler/material-package';
import type { SourceCutCarrierMaterialPackV1 } from '../../compiler/source-cut-carrier-material-v1';
import { prepareSourceCutSurfaceProjectionV1 } from './source-cut-surface-projection-v1';

const axes = [0, 1, 2] as const;
const sortedPair = (a: number, b: number) => (a < b ? `${a}/${b}` : `${b}/${a}`);

function cutCornerKey(
  sourceVertices: number[],
  sourceMask: number,
  carrierVertices: number[],
  weights: Float64Array,
) {
  if (sourceMask < 1 || sourceMask > 7)
    throw new RangeError('Cut corner has invalid source support.');
  const activeCarrier = carrierVertices.filter((_, i) => weights[i] > 0);
  if (activeCarrier.length === 1) return `carrier/${activeCarrier[0]}`;
  const activeSource = sourceVertices.filter((_, i) => (sourceMask & (1 << i)) !== 0);
  if (activeSource.length === 1) return `source/${activeSource[0]}`;
  if (activeSource.length === 2 && activeCarrier.length === 2)
    return `crossing/${sortedPair(activeSource[0], activeSource[1])}/${sortedPair(activeCarrier[0], activeCarrier[1])}`;
  throw new RangeError('Cut corner has no supported vertex or edge provenance.');
}

function checkPieceTopology(triangles: Uint32Array, vertexOffset: number, vertexCount: number) {
  const edges = new Map<string, { from: number; to: number; interior: boolean }>();
  const parents = Uint32Array.from({ length: vertexCount }, (_, i) => i);
  function find(vertex: number) {
    let root = vertex;
    while (parents[root] !== root) root = parents[root];
    while (parents[vertex] !== vertex) {
      const parent = parents[vertex];
      parents[vertex] = root;
      vertex = parent;
    }
    return root;
  }
  for (let i = 0; i < triangles.length; i += 3) {
    for (const j of axes) {
      const from = triangles[i + j];
      const to = triangles[i + ((j + 1) % 3)];
      if (from === to) throw new RangeError('A clipped contact triangle lost a corner.');
      const a = find(from - vertexOffset);
      const b = find(to - vertexOffset);
      parents[Math.max(a, b)] = Math.min(a, b);
      const key = sortedPair(from, to);
      const previous = edges.get(key);
      if (!previous) edges.set(key, { from, to, interior: false });
      else {
        if (previous.interior || previous.from === from)
          throw new RangeError('An edge of the clipped contact mesh has inconsistent incidence.');
        previous.interior = true;
      }
    }
  }
  const boundary = new Map<number, number>();
  const incoming = new Set<number>();
  for (const { from, to, interior } of edges.values()) {
    if (interior) continue;
    if (boundary.has(from) || incoming.has(to))
      throw new RangeError('The clipped material boundary branches.');
    boundary.set(from, to);
    incoming.add(to);
  }
  let loops = 0;
  while (boundary.size > 0) {
    const start = boundary.keys().next().value!;
    let current = start;
    do {
      const next = boundary.get(current);
      if (next === undefined) throw new RangeError('The clipped material boundary is open.');
      boundary.delete(current);
      current = next;
    } while (current !== start);
    loops++;
  }
  const representativeVertices: number[] = [];
  for (let i = 0; i < parents.length; i++) {
    if (parents[i] === i) representativeVertices.push(vertexOffset + i);
  }
  return { boundaryLoops: loops, representativeVertices };
}

/** Build indexed contact geometry by original vertex and edge identities. */
export function prepareSourceCutContactMeshV1(
  material: SourceCutCarrierMaterialPackV1,
  maxSurfaceTriangles: number,
) {
  const draw = prepareSourceCutSurfaceProjectionV1(material, maxSurfaceTriangles);
  const { strideBytes, offsets } = TRIANGLE_INDICES_GPU_V1;
  const faces = new DataView(material.base.triangleIndices);
  const indices = new Uint32Array(
    3 * draw.drawRanges.reduce((sum, range) => sum + range.triangleCount, 0),
  );
  const sourceCorners: number[] = [];
  const components: { pieceId: string; vertex: number }[] = [];
  const topology: ((typeof draw.drawRanges)[number] &
    Readonly<{ vertexCount: number; boundaryLoops: number }>)[] = [];
  for (const [pieceIndex, piece] of material.pieces.entries()) {
    const surface = piece.surface!;
    const drawRange = draw.drawRanges[pieceIndex];
    if (
      surface.sourceCornerSupportMasks.length !== drawRange.triangleCount * 3 ||
      surface.sourceTriangleVertices.length % 3 !== 0
    )
      throw new RangeError('Cut surface provenance is incomplete.');
    const pieceCoordinates = new Map<string, number>();
    const vertexOffset = sourceCorners.length;
    for (let index = 0; index < drawRange.triangleCount; index++) {
      const sourceTriangle = surface.sourceTriangleIndices[index];
      if (sourceTriangle * 3 + 2 >= surface.sourceTriangleVertices.length)
        throw new RangeError('Cut fragment references an unavailable source triangle.');
      const vertices = axes.map(
        (axis) => surface.sourceTriangleVertices[sourceTriangle * 3 + axis],
      );
      const carrierOffset =
        (piece.carrierTriangleOffset + surface.carrierTriangleIndices[index]) * strideBytes;
      const carrierVertices = [offsets.vertex0, offsets.vertex1, offsets.vertex2].map((offset) =>
        faces.getUint32(carrierOffset + offset, true),
      );
      for (const corner of axes) {
        const item = index * 3 + corner;
        const firstWeight = item * 3;
        const key = cutCornerKey(
          vertices,
          surface.sourceCornerSupportMasks[item],
          carrierVertices,
          surface.cornerWeights.subarray(firstWeight, firstWeight + 3),
        );
        const globalItem = drawRange.triangleOffset * 3 + item;
        let vertex = pieceCoordinates.get(key);
        if (vertex === undefined) {
          vertex = sourceCorners.length;
          sourceCorners.push(globalItem);
          pieceCoordinates.set(key, vertex);
        }
        indices[globalItem] = vertex;
      }
    }
    const start = drawRange.triangleOffset * 3;
    const { boundaryLoops, representativeVertices } = checkPieceTopology(
      indices.subarray(start, start + drawRange.triangleCount * 3),
      vertexOffset,
      pieceCoordinates.size,
    );
    for (const vertex of representativeVertices)
      components.push({ pieceId: piece.pieceId, vertex });
    topology.push(
      Object.freeze({
        ...drawRange,
        vertexCount: pieceCoordinates.size,
        boundaryLoops,
      }),
    );
  }

  function project(currentPositionsMInvMass: Float32Array) {
    const expanded = draw.project(currentPositionsMInvMass);
    const positionsM = new Float32Array(sourceCorners.length * 3);
    for (const [vertex, corner] of sourceCorners.entries())
      positionsM.set(expanded.subarray(corner * 3, corner * 3 + 3), vertex * 3);
    let maximumJoinedCornerDifferenceM = 0;
    for (const [corner, vertex] of indices.entries()) {
      const a = corner * 3;
      const b = vertex * 3;
      maximumJoinedCornerDifferenceM = Math.max(
        maximumJoinedCornerDifferenceM,
        Math.hypot(
          expanded[a] - positionsM[b],
          expanded[a + 1] - positionsM[b + 1],
          expanded[a + 2] - positionsM[b + 2],
        ),
      );
    }
    return { positionsM, maximumJoinedCornerDifferenceM };
  }

  function contactPositions(currentPositionsMInvMass: Float32Array) {
    const frame = project(currentPositionsMInvMass);
    if (frame.maximumJoinedCornerDifferenceM !== 0)
      throw new RangeError('Projected contact corners disagree with the draw surface.');
    return frame.positionsM;
  }

  function combineWithReference(
    currentPositionsMInvMass: Float32Array,
    referencePositionsM: Float32Array,
    referenceTriangles: Uint32Array,
  ) {
    const referenceVertexCount = referencePositionsM.length / 3;
    const referenceTriangleCount = referenceTriangles.length / 3;
    const budget = DEFAULT_MEASUREMENT_PARTITIONED_SURFACE_CONTACT_BUDGET_V1;
    if (
      !Number.isInteger(referenceVertexCount) ||
      referenceVertexCount < 3 ||
      !Number.isInteger(referenceTriangleCount) ||
      referenceTriangleCount < 1 ||
      referenceVertexCount + sourceCorners.length > budget.maxVertices ||
      referenceTriangleCount + indices.length / 3 > budget.maxTriangles ||
      referencePositionsM.byteLength +
        sourceCorners.length * 12 +
        referenceTriangles.byteLength +
        indices.byteLength >
        budget.maxInputBytes
    )
      throw new RangeError('Reference and cut surface exceed valid geometry bounds.');
    const cutPositions = contactPositions(currentPositionsMInvMass);
    const positions = new Float32Array(referencePositionsM.length + cutPositions.length);
    positions.set(referencePositionsM);
    positions.set(cutPositions, referencePositionsM.length);
    const triangles = new Uint32Array(referenceTriangles.length + indices.length);
    triangles.set(referenceTriangles);
    for (let i = 0; i < indices.length; i++)
      triangles[referenceTriangles.length + i] = referenceVertexCount + indices[i];
    const partitions = [
      { vertexCount: referenceVertexCount, triangleCount: referenceTriangleCount },
      ...topology,
    ];
    return { positions, triangles, partitions, cutPositions };
  }

  return {
    triangles: indices.slice(),
    topology: Object.freeze(topology),
    project,
    triangleCornerSupports(triangle: number) {
      const first = triangle * 3;
      if (!Number.isSafeInteger(triangle) || first < 0 || first + 2 >= indices.length)
        throw new RangeError('Contact triangle is outside the prepared cut.');
      return axes.map((corner) => {
        const vertex = indices[first + corner];
        return { vertex, ...draw.cornerSupport(sourceCorners[vertex]) };
      });
    },
    validateSelfIntersection(
      currentPositionsMInvMass: Float32Array,
      budget?: MeasurementPartitionedSurfaceContactBudgetV1,
    ) {
      return validateMeasurementPartitionedSurfaceSelfIntersectionV1(
        contactPositions(currentPositionsMInvMass),
        indices,
        topology,
        budget,
      );
    },
    validateReferenceIntersections(
      currentPositionsMInvMass: Float32Array,
      referencePositionsM: Float32Array,
      referenceTriangles: Uint32Array,
    ) {
      const geometry = combineWithReference(
        currentPositionsMInvMass,
        referencePositionsM,
        referenceTriangles,
      );
      return validateMeasurementReferenceSurfaceIntersectionsV1(
        geometry.positions,
        geometry.triangles,
        geometry.partitions,
      );
    },
    validateReferenceClearance(
      currentPositionsMInvMass: Float32Array,
      referencePositionsM: Float32Array,
      referenceTriangles: Uint32Array,
      minimumClearanceM: number,
    ) {
      const geometry = combineWithReference(
        currentPositionsMInvMass,
        referencePositionsM,
        referenceTriangles,
      );
      const clearance = validateMeasurementReferenceSurfaceClearanceV1(
        geometry.positions,
        geometry.triangles,
        geometry.partitions,
        minimumClearanceM,
      );
      const componentSamples = components.map(({ pieceId, vertex }) => ({
        pieceId,
        vertex,
        positionM: [
          geometry.cutPositions[vertex * 3],
          geometry.cutPositions[vertex * 3 + 1],
          geometry.cutPositions[vertex * 3 + 2],
        ] as const,
      }));
      return { clearance, componentSamples };
    },
  };
}
