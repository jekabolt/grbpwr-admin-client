export const MESH_SURFACE_TOPOLOGY_V1 = 'mesh-surface-topology/v1' as const;

export type MeshSurfacePositionsV1 = Float32Array | Float64Array;

export interface MeshSurfaceTopologyInputV1 {
  readonly positionsM: Float32Array;
  readonly triangleIndices: Uint16Array | Uint32Array;
}

/**
 * Adjacency is stored as CSR (compressed rows): the items of vertex `v` are
 * `vertexTriangles[vertexTriangleOffsets[v] .. vertexTriangleOffsets[v + 1])`, each run ascending.
 * `vertexEdges` and `vertexNeighbours` share `vertexEdgeOffsets` and are paired: within a row,
 * sorted by neighbour, `vertexEdges[i]` is the edge to `vertexNeighbours[i]`. Fixed-stride tables use `-1` for "no triangle across a boundary".
 */
export interface MeshSurfaceAdjacencyV1 {
  readonly version: typeof MESH_SURFACE_TOPOLOGY_V1;
  readonly topologyHash: string;
  readonly vertexCount: number;
  readonly triangleCount: number;
  readonly edgeCount: number;
  /** Stride 3. */
  readonly triangleIndices: Uint32Array;
  /** Stride 3; local edge i joins corners i and (i + 1) % 3. */
  readonly triangleEdges: Uint32Array;
  /** Stride 2, `a < b`. */
  readonly edgeVertices: Uint32Array;
  /** Stride 2, ascending; `-1` when the edge is on a boundary. */
  readonly edgeTriangles: Int32Array;
  /** Stride 3, aligned with `triangleEdges`; `-1` across a boundary edge. */
  readonly triangleNeighbours: Int32Array;
  /** Length `vertexCount + 1`. */
  readonly vertexTriangleOffsets: Uint32Array;
  readonly vertexTriangles: Uint32Array;
  /** Length `vertexCount + 1`; rows of `vertexEdges` and `vertexNeighbours`. */
  readonly vertexEdgeOffsets: Uint32Array;
  readonly vertexEdges: Uint32Array;
  readonly vertexNeighbours: Uint32Array;
}

export interface MeshSurfaceTopologyV1 extends MeshSurfaceAdjacencyV1 {
  readonly mirrorVertexMap: Uint32Array;
  readonly midlineVertexOrder: readonly Uint32Array[];
}

/** A view of one vertex's triangles; allocates a view, so keep it off hot loops. */
export function meshSurfaceVertexTrianglesV1(
  topology: MeshSurfaceAdjacencyV1,
  vertex: number,
): Uint32Array {
  return topology.vertexTriangles.subarray(
    topology.vertexTriangleOffsets[vertex],
    topology.vertexTriangleOffsets[vertex + 1],
  );
}

/** A view of one vertex's neighbours; allocates a view, so keep it off hot loops. */
export function meshSurfaceVertexNeighboursV1(
  topology: MeshSurfaceAdjacencyV1,
  vertex: number,
): Uint32Array {
  return topology.vertexNeighbours.subarray(
    topology.vertexEdgeOffsets[vertex],
    topology.vertexEdgeOffsets[vertex + 1],
  );
}

export type MeshSurfaceTopologyFailureCodeV1 =
  | 'input-invalid'
  | 'non-manifold'
  | 'symmetry-mismatch';

type MeshSurfaceBuildResultV1<T extends MeshSurfaceAdjacencyV1> =
  | Readonly<{ ok: true; topology: T; buildMs: number; cached: boolean }>
  | Readonly<{
      ok: false;
      code: MeshSurfaceTopologyFailureCodeV1;
      errors: readonly string[];
      buildMs: number;
    }>;

export type MeshSurfaceTopologyResultV1 = MeshSurfaceBuildResultV1<MeshSurfaceTopologyV1>;
export type MeshSurfaceAdjacencyResultV1 = MeshSurfaceBuildResultV1<MeshSurfaceAdjacencyV1>;

interface CachedTopology {
  readonly triangleIndices: Uint32Array;
  readonly topology: MeshSurfaceTopologyV1;
}

const topologyCache = new Map<string, CachedTopology[]>();

function elapsed(startedAt: number): number {
  return performance.now() - startedAt;
}

function topologyHash(vertexCount: number, indices: Uint16Array | Uint32Array): string {
  let first = 0x811c9dc5;
  let second = 0x9e3779b9;
  for (let index = 0; index < indices.length; index += 1) {
    const value = indices[index];
    first = Math.imul(first ^ value, 0x01000193) >>> 0;
    second = Math.imul(second ^ (value + 0x7ed55d16), 0x85ebca6b) >>> 0;
  }
  return `${vertexCount}:${indices.length}:${first.toString(16).padStart(8, '0')}${second
    .toString(16)
    .padStart(8, '0')}`;
}

function sameIndices(left: Uint32Array, right: Uint16Array | Uint32Array): boolean {
  if (left.length !== right.length) return false;
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) return false;
  }
  return true;
}

function mirrorMap(positionsM: Float32Array, vertexCount: number): Uint32Array | string {
  // Exact matching on the float bit patterns; -0 is folded into +0.
  const bits = new Uint32Array(positionsM.buffer, positionsM.byteOffset, vertexCount * 3);
  const normal = (value: number) => (value === 0x80000000 ? 0 : value);
  let size = 1;
  while (size < vertexCount * 2) size *= 2;
  const mask = size - 1;
  const table = new Int32Array(size).fill(-1);
  const find = (x: number, y: number, z: number): number => {
    let hash = Math.imul(x ^ 0x9e3779b9, 0x85ebca6b);
    hash = Math.imul(hash ^ y, 0xc2b2ae35);
    hash = Math.imul(hash ^ z, 0x27d4eb2f);
    for (let slot = (hash ^ (hash >>> 15)) & mask; ; slot = (slot + 1) & mask) {
      const vertex = table[slot];
      if (vertex < 0) return -1 - slot;
      const offset = vertex * 3;
      if (
        normal(bits[offset]) === x &&
        normal(bits[offset + 1]) === y &&
        normal(bits[offset + 2]) === z
      ) {
        return vertex;
      }
    }
  };
  for (let vertex = 0; vertex < vertexCount; vertex += 1) {
    const offset = vertex * 3;
    const found = find(normal(bits[offset]), normal(bits[offset + 1]), normal(bits[offset + 2]));
    if (found >= 0) return 'Mirror construction requires unique exact vertex coordinates.';
    table[-1 - found] = vertex;
  }
  const mirror = new Uint32Array(vertexCount);
  for (let vertex = 0; vertex < vertexCount; vertex += 1) {
    const offset = vertex * 3;
    const found = find(
      normal((bits[offset] ^ 0x80000000) >>> 0),
      normal(bits[offset + 1]),
      normal(bits[offset + 2]),
    );
    if (found < 0) return `Vertex ${vertex} has no exact reflected partner.`;
    mirror[vertex] = found;
  }
  return mirror;
}

function orderedMidlineComponents(
  positionsM: Float32Array,
  neighbourOffsets: Uint32Array,
  neighbourData: Uint32Array,
): readonly Uint32Array[] | null {
  const midline = new Set<number>();
  for (let vertex = 0; vertex < positionsM.length / 3; vertex += 1) {
    if (positionsM[vertex * 3] === 0) midline.add(vertex);
  }
  const adjacency = new Map<number, number[]>();
  for (const vertex of midline) {
    const neighbours = [
      ...neighbourData.subarray(neighbourOffsets[vertex], neighbourOffsets[vertex + 1]),
    ].filter((candidate) => midline.has(candidate));
    if (neighbours.length > 2) return null;
    adjacency.set(
      vertex,
      neighbours.sort((left, right) => left - right),
    );
  }
  const remaining = new Set(midline);
  const components: Uint32Array[] = [];
  while (remaining.size > 0) {
    const candidates = [...remaining].sort((left, right) => left - right);
    const start =
      candidates.find((vertex) => (adjacency.get(vertex)?.length ?? 0) <= 1) ?? candidates[0];
    const order: number[] = [];
    let previous = -1;
    let current = start;
    while (remaining.has(current)) {
      order.push(current);
      remaining.delete(current);
      const next = (adjacency.get(current) ?? []).find((vertex) => vertex !== previous);
      if (next === undefined || next === start) break;
      previous = current;
      current = next;
    }
    components.push(Uint32Array.from(order));
  }
  components.sort((left, right) => right.length - left.length || left[0] - right[0]);
  return Object.freeze(components);
}

function failure(
  startedAt: number,
  code: MeshSurfaceTopologyFailureCodeV1,
  errors: readonly string[],
): Extract<MeshSurfaceTopologyResultV1, { ok: false }> {
  return Object.freeze({
    ok: false as const,
    code,
    errors: Object.freeze([...errors]),
    buildMs: elapsed(startedAt),
  });
}

export function meshSurfaceTopologyMatchesIndicesV1(
  topology: MeshSurfaceAdjacencyV1,
  triangleIndices: Uint16Array | Uint32Array,
): boolean {
  return sameIndices(topology.triangleIndices, triangleIndices);
}

/** Indexed adjacency for an arbitrary surface; per-hit subdivisions are never put in the body cache. */
export function createMeshSurfaceAdjacencyV1(
  input: Readonly<{
    positionsM: MeshSurfacePositionsV1;
    triangleIndices: Uint16Array | Uint32Array;
  }>,
): MeshSurfaceAdjacencyResultV1 {
  return buildMeshSurfaceTopology(input, 'adjacency');
}

export function createMeshSurfaceTopologyV1(
  input: MeshSurfaceTopologyInputV1,
): MeshSurfaceTopologyResultV1 {
  return buildMeshSurfaceTopology(input, 'symmetric');
}

type MeshSurfaceAdjacencyInputV1 = Readonly<{
  positionsM: MeshSurfacePositionsV1;
  triangleIndices: Uint16Array | Uint32Array;
}>;

function buildMeshSurfaceTopology(
  input: MeshSurfaceTopologyInputV1,
  mode: 'symmetric',
): MeshSurfaceTopologyResultV1;
function buildMeshSurfaceTopology(
  input: MeshSurfaceAdjacencyInputV1,
  mode: 'adjacency',
): MeshSurfaceAdjacencyResultV1;
function buildMeshSurfaceTopology(
  input: MeshSurfaceAdjacencyInputV1,
  mode: 'symmetric' | 'adjacency',
): MeshSurfaceAdjacencyResultV1 {
  const startedAt = performance.now();
  const { positionsM } = input;
  const symmetricPositions = positionsM instanceof Float32Array ? positionsM : null;
  if (
    (!symmetricPositions && (mode === 'symmetric' || !(positionsM instanceof Float64Array))) ||
    positionsM.length % 3 !== 0
  )
    return failure(startedAt, 'input-invalid', [
      mode === 'symmetric'
        ? 'positionsM must be a complete XYZ Float32Array.'
        : 'positionsM must be a complete XYZ float array.',
    ]);
  if (
    (!(input.triangleIndices instanceof Uint16Array) &&
      !(input.triangleIndices instanceof Uint32Array)) ||
    input.triangleIndices.length === 0 ||
    input.triangleIndices.length % 3 !== 0
  ) {
    return failure(startedAt, 'input-invalid', [
      'triangleIndices must be a non-empty triangle index array.',
    ]);
  }
  for (let index = 0; index < input.positionsM.length; index += 1) {
    if (!Number.isFinite(input.positionsM[index])) {
      return failure(startedAt, 'input-invalid', ['positionsM contains a non-finite coordinate.']);
    }
  }

  const vertexCount = input.positionsM.length / 3;
  const hash = topologyHash(vertexCount, input.triangleIndices);
  for (const cached of (mode === 'symmetric' ? topologyCache.get(hash) : undefined) ?? []) {
    if (sameIndices(cached.triangleIndices, input.triangleIndices)) {
      return Object.freeze({
        ok: true as const,
        topology: cached.topology,
        buildMs: elapsed(startedAt),
        cached: true,
      });
    }
  }

  const triangleIndices = Uint32Array.from(input.triangleIndices);
  const triangleCount = triangleIndices.length / 3;
  // Validate and count vertex -> triangle incidence in one pass.
  const vertexTriangleOffsets = new Uint32Array(vertexCount + 1);
  for (let triangle = 0; triangle < triangleCount; triangle += 1) {
    const offset = triangle * 3;
    const v0 = triangleIndices[offset];
    const v1 = triangleIndices[offset + 1];
    const v2 = triangleIndices[offset + 2];
    if (
      v0 >= vertexCount ||
      v1 >= vertexCount ||
      v2 >= vertexCount ||
      v0 === v1 ||
      v1 === v2 ||
      v2 === v0
    ) {
      return failure(startedAt, 'input-invalid', [
        `Triangle ${triangle} has invalid or repeated vertices.`,
      ]);
    }
    vertexTriangleOffsets[v0 + 1] += 1;
    vertexTriangleOffsets[v1 + 1] += 1;
    vertexTriangleOffsets[v2 + 1] += 1;
  }
  for (let vertex = 0; vertex < vertexCount; vertex += 1) {
    vertexTriangleOffsets[vertex + 1] += vertexTriangleOffsets[vertex];
  }
  // Triangles are appended in ascending order, so each CSR row is sorted.
  const vertexTriangleData = new Uint32Array(triangleIndices.length);
  const vertexTriangleCursor = vertexTriangleOffsets.slice(0, vertexCount);
  for (let triangle = 0; triangle < triangleCount; triangle += 1) {
    const offset = triangle * 3;
    vertexTriangleData[vertexTriangleCursor[triangleIndices[offset]]++] = triangle;
    vertexTriangleData[vertexTriangleCursor[triangleIndices[offset + 1]]++] = triangle;
    vertexTriangleData[vertexTriangleCursor[triangleIndices[offset + 2]]++] = triangle;
  }

  // Edges, discovered from the lower endpoint with a stamp array instead of a hash map.
  const maximumEdges = triangleIndices.length;
  const edgeVerticesScratch = new Uint32Array(maximumEdges * 2);
  const edgeTrianglesScratch = new Int32Array(maximumEdges * 2).fill(-1);
  const triangleEdges = new Uint32Array(triangleIndices.length);
  const stampOwner = new Int32Array(vertexCount).fill(-1);
  const stampEdge = new Uint32Array(vertexCount);
  let edgeCount = 0;
  for (let vertex = 0; vertex < vertexCount; vertex += 1) {
    const rowEnd = vertexTriangleOffsets[vertex + 1];
    for (let cursor = vertexTriangleOffsets[vertex]; cursor < rowEnd; cursor += 1) {
      const triangle = vertexTriangleData[cursor];
      const offset = triangle * 3;
      for (let local = 0; local < 3; local += 1) {
        const rawA = triangleIndices[offset + local];
        const rawB = triangleIndices[offset + (local === 2 ? 0 : local + 1)];
        const low = rawA < rawB ? rawA : rawB;
        if (low !== vertex) continue;
        const high = rawA < rawB ? rawB : rawA;
        let edge: number;
        if (stampOwner[high] === vertex) {
          edge = stampEdge[high];
        } else {
          edge = edgeCount;
          edgeCount += 1;
          stampOwner[high] = vertex;
          stampEdge[high] = edge;
          edgeVerticesScratch[edge * 2] = low;
          edgeVerticesScratch[edge * 2 + 1] = high;
        }
        if (edgeTrianglesScratch[edge * 2] < 0) {
          edgeTrianglesScratch[edge * 2] = triangle;
        } else if (edgeTrianglesScratch[edge * 2 + 1] < 0) {
          edgeTrianglesScratch[edge * 2 + 1] = triangle;
        } else {
          return failure(startedAt, 'non-manifold', [
            `Edge ${low}-${high} has more than 2 incident triangles.`,
          ]);
        }
        triangleEdges[offset + local] = edge;
      }
    }
  }
  const edgeVertices = edgeVerticesScratch.slice(0, edgeCount * 2);
  const edgeTriangles = edgeTrianglesScratch.slice(0, edgeCount * 2);

  // Vertex -> (neighbour, edge) rows, CSR; each row sorted by neighbour, edges paired.
  const vertexEdgeOffsets = new Uint32Array(vertexCount + 1);
  for (let index = 0; index < edgeCount * 2; index += 1) {
    vertexEdgeOffsets[edgeVertices[index] + 1] += 1;
  }
  for (let vertex = 0; vertex < vertexCount; vertex += 1) {
    vertexEdgeOffsets[vertex + 1] += vertexEdgeOffsets[vertex];
  }
  const vertexEdgeData = new Uint32Array(edgeCount * 2);
  const vertexNeighbourData = new Uint32Array(edgeCount * 2);
  const vertexEdgeCursor = vertexEdgeOffsets.slice(0, vertexCount);
  for (let edge = 0; edge < edgeCount; edge += 1) {
    const a = edgeVertices[edge * 2];
    const b = edgeVertices[edge * 2 + 1];
    const atA = vertexEdgeCursor[a]++;
    vertexEdgeData[atA] = edge;
    vertexNeighbourData[atA] = b;
    const atB = vertexEdgeCursor[b]++;
    vertexEdgeData[atB] = edge;
    vertexNeighbourData[atB] = a;
  }
  for (let vertex = 0; vertex < vertexCount; vertex += 1) {
    // Insertion sort of each short row by neighbour, carrying the edge ids along.
    const from = vertexEdgeOffsets[vertex];
    const to = vertexEdgeOffsets[vertex + 1];
    for (let index = from + 1; index < to; index += 1) {
      const neighbour = vertexNeighbourData[index];
      const edge = vertexEdgeData[index];
      let cursor = index - 1;
      while (cursor >= from && vertexNeighbourData[cursor] > neighbour) {
        vertexNeighbourData[cursor + 1] = vertexNeighbourData[cursor];
        vertexEdgeData[cursor + 1] = vertexEdgeData[cursor];
        cursor -= 1;
      }
      vertexNeighbourData[cursor + 1] = neighbour;
      vertexEdgeData[cursor + 1] = edge;
    }
  }
  const triangleNeighbours = new Int32Array(triangleCount * 3);
  for (let triangle = 0; triangle < triangleCount; triangle += 1) {
    for (let local = 0; local < 3; local += 1) {
      const edge = triangleEdges[triangle * 3 + local];
      const left = edgeTriangles[edge * 2];
      triangleNeighbours[triangle * 3 + local] =
        left === triangle ? edgeTriangles[edge * 2 + 1] : left;
    }
  }

  const adjacency = {
    version: MESH_SURFACE_TOPOLOGY_V1,
    topologyHash: hash,
    vertexCount,
    triangleCount,
    edgeCount,
    triangleIndices,
    triangleEdges,
    edgeVertices,
    edgeTriangles,
    triangleNeighbours,
    vertexTriangleOffsets,
    vertexTriangles: vertexTriangleData,
    vertexEdgeOffsets,
    vertexEdges: vertexEdgeData,
    vertexNeighbours: vertexNeighbourData,
  } satisfies MeshSurfaceAdjacencyV1;

  if (mode === 'adjacency') {
    return Object.freeze({
      ok: true as const,
      topology: Object.freeze(adjacency),
      buildMs: elapsed(startedAt),
      cached: false,
    });
  }
  if (!symmetricPositions)
    return failure(startedAt, 'input-invalid', ['positionsM must be a complete XYZ Float32Array.']);

  // Mirror map: open-addressing hash over exact float bit patterns (no string keys).
  const mirrorVertexMap = mirrorMap(symmetricPositions, vertexCount);
  if (typeof mirrorVertexMap === 'string') {
    return failure(startedAt, 'symmetry-mismatch', [mirrorVertexMap]);
  }

  const midlineVertexOrder = orderedMidlineComponents(
    symmetricPositions,
    vertexEdgeOffsets,
    vertexNeighbourData,
  );
  if (!midlineVertexOrder) {
    return failure(startedAt, 'symmetry-mismatch', ['The exact midline graph branches.']);
  }

  const topology = Object.freeze({ ...adjacency, mirrorVertexMap, midlineVertexOrder });
  const entries = topologyCache.get(hash) ?? [];
  entries.push({ triangleIndices, topology });
  topologyCache.set(hash, entries);
  return Object.freeze({
    ok: true as const,
    topology,
    buildMs: elapsed(startedAt),
    cached: false,
  });
}
