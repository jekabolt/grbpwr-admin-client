import {
  computeMeshSurfaceGeodesicV1,
  DEFAULT_MESH_SURFACE_GEODESIC_POLICY_V1,
} from 'lib/cloth/body/mesh-surface-geodesic-v1';
import {
  meshSurfaceEdgePointV1,
  meshSurfaceVertexPointV1,
  type MeshSurfacePointV1,
  type MeshSurfaceVec3V1,
} from 'lib/cloth/body/mesh-surface-path-v1';
import {
  createMeshSurfaceAdjacencyV1,
  meshSurfaceVertexTrianglesV1,
  type MeshSurfaceAdjacencyV1,
} from 'lib/cloth/body/mesh-surface-topology-v1';
import type { ClothMeshPieceRange } from 'lib/cloth/mesh/cloth-mesh-ir';

export type DeformedClothSurfaceTapeHitV1 = Readonly<{
  /** Global triangle index, in units of faces rather than flat index entries. */
  triangleIndex: number;
  /** Weights in the original order of that face's three indices. */
  barycentric: readonly [number, number, number];
}>;

type Triangle = readonly [number, number, number];

type LocalHit = Readonly<{
  triangle: number;
  positionM: MeshSurfaceVec3V1;
  boundary: MeshSurfacePointV1 | null;
}>;

const MAX_PIECE_MESH_SIZE = DEFAULT_MESH_SURFACE_GEODESIC_POLICY_V1.maximumGraphNodes;

function contains(offset: number, count: number, length: number): boolean {
  return (
    Number.isSafeInteger(offset) &&
    Number.isSafeInteger(count) &&
    offset >= 0 &&
    count > 0 &&
    count <= MAX_PIECE_MESH_SIZE &&
    offset <= length - count
  );
}

function faceAt(indices: Uint32Array, face: number): Triangle {
  const offset = face * 3;
  return [indices[offset], indices[offset + 1], indices[offset + 2]];
}

function readHit(
  hit: DeformedClothSurfaceTapeHitV1,
  piece: ClothMeshPieceRange,
  indices: Uint32Array,
  positions: Float64Array,
): LocalHit | null {
  if (
    !hit ||
    !Number.isSafeInteger(hit.triangleIndex) ||
    hit.triangleIndex < piece.triangleOffset ||
    hit.triangleIndex >= piece.triangleOffset + piece.triangleCount ||
    !Array.isArray(hit.barycentric) ||
    hit.barycentric.length !== 3
  )
    return null;
  const [a, b, c] = hit.barycentric;
  const weights = [a, b, c];
  if (!weights.every((weight) => Number.isFinite(weight) && weight >= 0 && weight <= 1))
    return null;
  const sum = a + b + c;
  if (Math.abs(sum - 1) > Number.EPSILON * 8) return null;

  const triangle = hit.triangleIndex - piece.triangleOffset;
  const face = faceAt(indices, triangle);
  const [x, y, z] = face.map((vertex) => vertex * 3);
  const coordinate = (axis: number) =>
    (a * positions[x + axis] + b * positions[y + axis] + c * positions[z + axis]) / sum;
  const positionM = [coordinate(0), coordinate(1), coordinate(2)] as const;
  const corners = [0, 1, 2].filter((corner) => weights[corner] > 0);
  if (corners.length === 1)
    return { triangle, positionM, boundary: meshSurfaceVertexPointV1(face[corners[0]]) };
  if (corners.length === 2) {
    const [first, second] = corners;
    const boundary = meshSurfaceEdgePointV1(face[first], face[second], weights[second] / sum);
    // A rounded endpoint would lose a strictly positive original edge weight.
    if (boundary.kind !== 'edge' || boundary.t <= 0 || boundary.t >= 1) return null;
    return { triangle, positionM, boundary };
  }
  return { triangle, positionM, boundary: null };
}

function nondegenerate(positions: Float64Array, [a, b, c]: Triangle): boolean {
  const ax = positions[a * 3];
  const ay = positions[a * 3 + 1];
  const az = positions[a * 3 + 2];
  const bx = positions[b * 3] - ax;
  const by = positions[b * 3 + 1] - ay;
  const bz = positions[b * 3 + 2] - az;
  const cx = positions[c * 3] - ax;
  const cy = positions[c * 3 + 1] - ay;
  const cz = positions[c * 3 + 2] - az;
  const normal = Math.hypot(by * cz - bz * cy, bz * cx - bx * cz, bx * cy - by * cx);
  const edgeScale = Math.max(
    bx * bx + by * by + bz * bz,
    cx * cx + cy * cy + cz * cz,
    (bx - cx) ** 2 + (by - cy) ** 2 + (bz - cz) ** 2,
  );
  return normal > edgeScale * Number.EPSILON * 16;
}

function hasConnectedFaceFans(topology: MeshSurfaceAdjacencyV1): boolean {
  const { triangleIndices, triangleNeighbours } = topology;
  const visited = new Uint32Array(topology.triangleCount);
  for (let vertex = 0; vertex < topology.vertexCount; vertex += 1) {
    const incident = meshSurfaceVertexTrianglesV1(topology, vertex);
    if (incident.length === 0) return false;
    const stamp = vertex + 1;
    const pending = [incident[0]];
    visited[incident[0]] = stamp;
    let count = 0;
    while (pending.length) {
      const triangle = pending.pop()!;
      const offset = triangle * 3;
      const corner = triangleIndices.subarray(offset, offset + 3).indexOf(vertex);
      count += 1;
      for (const edge of [corner, (corner + 2) % 3]) {
        const neighbour = triangleNeighbours[offset + edge];
        if (neighbour < 0 || visited[neighbour] === stamp) continue;
        visited[neighbour] = stamp;
        pending.push(neighbour);
      }
    }
    if (count !== incident.length) return false;
  }
  return true;
}

function isConnectedOpenSurface(topology: MeshSurfaceAdjacencyV1): boolean {
  if (!topology.edgeTriangles.some((face) => face === -1)) return false;
  const visited = new Uint8Array(topology.triangleCount);
  const pending = [0];
  visited[0] = 1;
  let count = 0;
  while (pending.length) {
    const triangle = pending.pop()!;
    count += 1;
    for (const neighbour of topology.triangleNeighbours.subarray(triangle * 3, triangle * 3 + 3)) {
      if (neighbour < 0 || visited[neighbour]) continue;
      visited[neighbour] = 1;
      pending.push(neighbour);
    }
  }
  return count === topology.triangleCount && hasConnectedFaceFans(topology);
}

function sameBoundary(left: MeshSurfacePointV1 | null, right: MeshSurfacePointV1 | null): boolean {
  if (left?.kind === 'vertex') return right?.kind === 'vertex' && left.vertex === right.vertex;
  return (
    left?.kind === 'edge' &&
    right?.kind === 'edge' &&
    left.a === right.a &&
    left.b === right.b &&
    left.t === right.t
  );
}

/**
 * Measure along one connected open cloth piece. Keep edge/vertex hits on original indices
 * and promote each interior hit to a vertex by subdividing just its own face in the local copy.
 */
export function measureDeformedClothSurfaceTapeV1(
  input: Readonly<{
    positionsM: Float32Array;
    triangles: Uint32Array;
    pieceRange: ClothMeshPieceRange;
    start: DeformedClothSurfaceTapeHitV1;
    end: DeformedClothSurfaceTapeHitV1;
  }>,
): number | null {
  const { positionsM, triangles, pieceRange } = input;
  if (
    !(positionsM instanceof Float32Array) ||
    !(triangles instanceof Uint32Array) ||
    positionsM.length % 3 !== 0 ||
    triangles.length % 3 !== 0 ||
    !pieceRange ||
    typeof pieceRange.pieceId !== 'string' ||
    !pieceRange.pieceId.trim() ||
    !contains(pieceRange.vertexOffset, pieceRange.vertexCount, positionsM.length / 3) ||
    !contains(pieceRange.triangleOffset, pieceRange.triangleCount, triangles.length / 3)
  )
    return null;

  const { vertexOffset, vertexCount, triangleOffset, triangleCount } = pieceRange;
  const positions = Float64Array.from(
    positionsM.subarray(vertexOffset * 3, (vertexOffset + vertexCount) * 3),
  );
  if (!positions.every(Number.isFinite)) return null;
  const indices = new Uint32Array(triangleCount * 3);
  for (let index = 0; index < indices.length; index += 1) {
    const vertex = triangles[triangleOffset * 3 + index] - vertexOffset;
    if (vertex < 0 || vertex >= vertexCount) return null;
    indices[index] = vertex;
  }

  const faceKeys = new Set<string>();
  for (let face = 0; face < triangleCount; face += 1) {
    const triangle = faceAt(indices, face);
    if (!nondegenerate(positions, triangle)) return null;
    const key = [...triangle].sort((left, right) => left - right).join(',');
    if (faceKeys.has(key)) return null;
    faceKeys.add(key);
  }

  const start = readHit(input.start, pieceRange, indices, positions);
  const end = readHit(input.end, pieceRange, indices, positions);
  if (!start || !end) return null;

  const sameFace = start.triangle === end.triangle;
  const interiors = sameFace
    ? []
    : [start, end].filter((hit) => !hit.boundary).sort((a, b) => a.triangle - b.triangle);
  const expandedPositions = new Float64Array(positions.length + 3 * interiors.length);
  const expandedIndices = new Uint32Array(indices.length + 6 * interiors.length);
  expandedPositions.set(positions);
  expandedIndices.set(indices);
  const anchorVertices = new Map<LocalHit, number>();
  for (const [index, hit] of interiors.entries()) {
    const vertex = vertexCount + index;
    expandedPositions.set(hit.positionM, vertex * 3);
    const [a, b, c] = faceAt(indices, hit.triangle);
    const splits = [
      [a, b, vertex],
      [b, c, vertex],
      [c, a, vertex],
    ] as const;
    if (!splits.every((triangle) => nondegenerate(expandedPositions, triangle))) return null;
    expandedIndices.set(splits[0], hit.triangle * 3);
    expandedIndices.set([...splits[1], ...splits[2]], indices.length + index * 6);
    anchorVertices.set(hit, vertex);
  }

  const adjacency = createMeshSurfaceAdjacencyV1({
    positionsM: expandedPositions,
    triangleIndices: expandedIndices,
  });
  if (!adjacency.ok || !isConnectedOpenSurface(adjacency.topology)) return null;

  if (sameFace)
    return Math.hypot(
      start.positionM[0] - end.positionM[0],
      start.positionM[1] - end.positionM[1],
      start.positionM[2] - end.positionM[2],
    );
  if (sameBoundary(start.boundary, end.boundary)) return 0;

  const route = computeMeshSurfaceGeodesicV1({
    topology: adjacency.topology,
    positionsM: expandedPositions,
    triangleIndices: expandedIndices,
    start: start.boundary ?? meshSurfaceVertexPointV1(anchorVertices.get(start)!),
    end: end.boundary ?? meshSurfaceVertexPointV1(anchorVertices.get(end)!),
    taut: false,
  });
  return route.ok &&
    route.segments.every(({ kind }) => kind === 'surface') &&
    Number.isFinite(route.geodesicLengthM) &&
    route.geodesicLengthM > 0
    ? route.geodesicLengthM
    : null;
}

/** Recover indexed topology from the displayed cut's compiler-owned corner identities. */
export function measureProjectedDeformedClothSurfaceTapeV1(
  input: Readonly<{
    positionsM: Float32Array;
    pieceRange: Pick<ClothMeshPieceRange, 'pieceId' | 'triangleOffset' | 'triangleCount'>;
    cornerRepresentative: (corner: number) => number;
    start: DeformedClothSurfaceTapeHitV1;
    end: DeformedClothSurfaceTapeHitV1;
  }>,
): number | null {
  const { positionsM, pieceRange, start, end, cornerRepresentative } = input;
  const { pieceId, triangleOffset, triangleCount } = pieceRange;
  if (
    positionsM.length % 9 !== 0 ||
    !contains(triangleOffset, triangleCount, positionsM.length / 9) ||
    [start, end].some(
      ({ triangleIndex }) =>
        triangleIndex < triangleOffset || triangleIndex >= triangleOffset + triangleCount,
    )
  )
    return null;

  const firstCorner = triangleOffset * 3;
  const triangles = new Uint32Array(triangleCount * 3);
  const indexedPositions = new Float32Array(triangles.length * 3);
  let vertexCount = 0;
  for (let index = 0; index < triangles.length; index += 1) {
    const corner = firstCorner + index;
    const owned = cornerRepresentative(corner) - firstCorner;
    if (!Number.isSafeInteger(owned) || owned < 0 || owned > index) return null;
    if (owned === index) {
      indexedPositions.set(positionsM.subarray(corner * 3, corner * 3 + 3), vertexCount * 3);
      triangles[index] = vertexCount;
      vertexCount += 1;
      continue;
    }
    const vertex = triangles[owned];
    if (
      cornerRepresentative(firstCorner + owned) !== firstCorner + owned ||
      positionsM[corner * 3] !== indexedPositions[vertex * 3] ||
      positionsM[corner * 3 + 1] !== indexedPositions[vertex * 3 + 1] ||
      positionsM[corner * 3 + 2] !== indexedPositions[vertex * 3 + 2]
    )
      return null;
    triangles[index] = vertex;
  }
  return measureDeformedClothSurfaceTapeV1({
    positionsM: indexedPositions.subarray(0, vertexCount * 3),
    triangles,
    pieceRange: { pieceId, triangleOffset: 0, triangleCount, vertexOffset: 0, vertexCount },
    start: { ...start, triangleIndex: start.triangleIndex - triangleOffset },
    end: { ...end, triangleIndex: end.triangleIndex - triangleOffset },
  });
}
