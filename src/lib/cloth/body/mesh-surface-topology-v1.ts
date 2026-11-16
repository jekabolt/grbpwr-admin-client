export const MESH_SURFACE_TOPOLOGY_V1 = 'mesh-surface-topology/v1' as const;

export interface MeshSurfaceTopologyInputV1 {
  readonly positionsM: Float32Array;
  readonly triangleIndices: Uint16Array | Uint32Array;
}

export interface MeshSurfaceTopologyV1 {
  readonly version: typeof MESH_SURFACE_TOPOLOGY_V1;
  readonly topologyHash: string;
  readonly vertexCount: number;
  readonly triangleCount: number;
  readonly edgeCount: number;
  readonly triangleIndices: Uint32Array;
  readonly triangleEdges: Uint32Array;
  readonly edgeVertices: Uint32Array;
  readonly edgeTriangles: readonly Uint32Array[];
  readonly vertexEdges: readonly Uint32Array[];
  readonly vertexNeighbours: readonly Uint32Array[];
  readonly vertexTriangles: readonly Uint32Array[];
  readonly triangleNeighbours: readonly Uint32Array[];
  readonly mirrorVertexMap: Uint32Array;
  readonly midlineVertexOrder: readonly Uint32Array[];
}

export type MeshSurfaceTopologyFailureCodeV1 =
  | 'input-invalid'
  | 'non-manifold'
  | 'symmetry-mismatch';

export type MeshSurfaceTopologyResultV1 =
  | Readonly<{ ok: true; topology: MeshSurfaceTopologyV1; buildMs: number; cached: boolean }>
  | Readonly<{
      ok: false;
      code: MeshSurfaceTopologyFailureCodeV1;
      errors: readonly string[];
      buildMs: number;
    }>;

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
  for (const value of indices) {
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

function coordinateKey(x: number, y: number, z: number): string {
  return `${x === 0 ? 0 : x}|${y === 0 ? 0 : y}|${z === 0 ? 0 : z}`;
}

function sortedUnique(values: number[]): Uint32Array {
  values.sort((left, right) => left - right);
  let write = 0;
  for (const value of values) {
    if (write > 0 && values[write - 1] === value) continue;
    values[write] = value;
    write += 1;
  }
  return Uint32Array.from(values.slice(0, write));
}

function orderedMidlineComponents(
  positionsM: Float32Array,
  vertexNeighbours: readonly Uint32Array[],
): readonly Uint32Array[] | null {
  const midline = new Set<number>();
  for (let vertex = 0; vertex < positionsM.length / 3; vertex += 1) {
    if (positionsM[vertex * 3] === 0) midline.add(vertex);
  }
  const adjacency = new Map<number, number[]>();
  for (const vertex of midline) {
    const neighbours = [...vertexNeighbours[vertex]].filter((candidate) => midline.has(candidate));
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
): MeshSurfaceTopologyResultV1 {
  return Object.freeze({
    ok: false as const,
    code,
    errors: Object.freeze([...errors]),
    buildMs: elapsed(startedAt),
  });
}

export function meshSurfaceTopologyMatchesIndicesV1(
  topology: MeshSurfaceTopologyV1,
  triangleIndices: Uint16Array | Uint32Array,
): boolean {
  return sameIndices(topology.triangleIndices, triangleIndices);
}

export function createMeshSurfaceTopologyV1(
  input: MeshSurfaceTopologyInputV1,
): MeshSurfaceTopologyResultV1 {
  const startedAt = performance.now();
  if (!(input.positionsM instanceof Float32Array) || input.positionsM.length % 3 !== 0) {
    return failure(startedAt, 'input-invalid', ['positionsM must be a complete XYZ Float32Array.']);
  }
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
  for (const coordinate of input.positionsM) {
    if (!Number.isFinite(coordinate)) {
      return failure(startedAt, 'input-invalid', ['positionsM contains a non-finite coordinate.']);
    }
  }

  const vertexCount = input.positionsM.length / 3;
  const hash = topologyHash(vertexCount, input.triangleIndices);
  for (const cached of topologyCache.get(hash) ?? []) {
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
  const vertexEdges = Array.from({ length: vertexCount }, () => [] as number[]);
  const vertexNeighbours = Array.from({ length: vertexCount }, () => [] as number[]);
  const vertexTriangles = Array.from({ length: vertexCount }, () => [] as number[]);
  const edgeVertices: number[] = [];
  const edgeTriangles: number[][] = [];
  const triangleEdges = new Uint32Array(triangleIndices.length);
  const edgeMap = new Map<number, number>();

  for (let triangle = 0; triangle < triangleCount; triangle += 1) {
    const offset = triangle * 3;
    const vertices = [
      triangleIndices[offset],
      triangleIndices[offset + 1],
      triangleIndices[offset + 2],
    ] as const;
    if (
      vertices.some((vertex) => vertex >= vertexCount) ||
      vertices[0] === vertices[1] ||
      vertices[1] === vertices[2] ||
      vertices[2] === vertices[0]
    ) {
      return failure(startedAt, 'input-invalid', [
        `Triangle ${triangle} has invalid or repeated vertices.`,
      ]);
    }
    for (const vertex of vertices) vertexTriangles[vertex].push(triangle);
    const pairs = [
      [vertices[0], vertices[1]],
      [vertices[1], vertices[2]],
      [vertices[2], vertices[0]],
    ] as const;
    pairs.forEach(([rawA, rawB], localEdge) => {
      const a = Math.min(rawA, rawB);
      const b = Math.max(rawA, rawB);
      const key = a * vertexCount + b;
      let edge = edgeMap.get(key);
      if (edge === undefined) {
        edge = edgeTriangles.length;
        edgeMap.set(key, edge);
        edgeVertices.push(a, b);
        edgeTriangles.push([]);
        vertexEdges[a].push(edge);
        vertexEdges[b].push(edge);
        vertexNeighbours[a].push(b);
        vertexNeighbours[b].push(a);
      }
      edgeTriangles[edge].push(triangle);
      triangleEdges[offset + localEdge] = edge;
    });
  }

  const nonManifoldEdge = edgeTriangles.findIndex((triangles) => triangles.length > 2);
  if (nonManifoldEdge >= 0) {
    return failure(startedAt, 'non-manifold', [
      `Edge ${nonManifoldEdge} has ${edgeTriangles[nonManifoldEdge].length} incident triangles.`,
    ]);
  }

  const triangleNeighbours = Array.from({ length: triangleCount }, () => [] as number[]);
  edgeTriangles.forEach((triangles) => {
    if (triangles.length !== 2) return;
    triangleNeighbours[triangles[0]].push(triangles[1]);
    triangleNeighbours[triangles[1]].push(triangles[0]);
  });

  const coordinateVertices = new Map<string, number>();
  for (let vertex = 0; vertex < vertexCount; vertex += 1) {
    const offset = vertex * 3;
    const key = coordinateKey(
      input.positionsM[offset],
      input.positionsM[offset + 1],
      input.positionsM[offset + 2],
    );
    if (coordinateVertices.has(key)) {
      return failure(startedAt, 'symmetry-mismatch', [
        'Mirror construction requires unique exact vertex coordinates.',
      ]);
    }
    coordinateVertices.set(key, vertex);
  }
  const mirrorVertexMap = new Uint32Array(vertexCount);
  for (let vertex = 0; vertex < vertexCount; vertex += 1) {
    const offset = vertex * 3;
    const mirror = coordinateVertices.get(
      coordinateKey(
        -input.positionsM[offset],
        input.positionsM[offset + 1],
        input.positionsM[offset + 2],
      ),
    );
    if (mirror === undefined) {
      return failure(startedAt, 'symmetry-mismatch', [
        `Vertex ${vertex} has no exact reflected partner.`,
      ]);
    }
    mirrorVertexMap[vertex] = mirror;
  }

  const frozenVertexNeighbours = Object.freeze(vertexNeighbours.map(sortedUnique));
  const midlineVertexOrder = orderedMidlineComponents(input.positionsM, frozenVertexNeighbours);
  if (!midlineVertexOrder) {
    return failure(startedAt, 'symmetry-mismatch', ['The exact midline graph branches.']);
  }

  const topology = Object.freeze({
    version: MESH_SURFACE_TOPOLOGY_V1,
    topologyHash: hash,
    vertexCount,
    triangleCount,
    edgeCount: edgeTriangles.length,
    triangleIndices,
    triangleEdges,
    edgeVertices: Uint32Array.from(edgeVertices),
    edgeTriangles: Object.freeze(edgeTriangles.map((values) => Uint32Array.from(values))),
    vertexEdges: Object.freeze(vertexEdges.map(sortedUnique)),
    vertexNeighbours: frozenVertexNeighbours,
    vertexTriangles: Object.freeze(vertexTriangles.map(sortedUnique)),
    triangleNeighbours: Object.freeze(triangleNeighbours.map(sortedUnique)),
    mirrorVertexMap,
    midlineVertexOrder,
  } satisfies MeshSurfaceTopologyV1);
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
