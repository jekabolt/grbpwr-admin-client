import {
  createMeshSurfacePathV1,
  evaluateMeshSurfacePathV1,
  meshSurfaceEdgePointV1,
  meshSurfaceVertexPointV1,
  type MeshSurfacePathV1,
  type MeshSurfacePointV1,
  type MeshSurfaceVec3V1,
} from './mesh-surface-path-v1';
import {
  meshSurfaceTopologyMatchesIndicesV1,
  type MeshSurfaceTopologyV1,
} from './mesh-surface-topology-v1';

export const MESH_SURFACE_GEODESIC_V1 = 'mesh-surface-geodesic/v1' as const;

export interface MeshSurfaceGeodesicRegionV1 {
  readonly minimumM?: MeshSurfaceVec3V1;
  readonly maximumM?: MeshSurfaceVec3V1;
  readonly vertexMask?: Uint8Array;
}

export interface MeshSurfaceGeodesicPolicyV1 {
  readonly corridorRings: number;
  readonly steinerPointsPerEdge: number;
  readonly retryCorridorRings: number;
  readonly retrySteinerPointsPerEdge: number;
  readonly maximumGraphNodes: number;
}

export const DEFAULT_MESH_SURFACE_GEODESIC_POLICY_V1 = Object.freeze({
  corridorRings: 3,
  steinerPointsPerEdge: 4,
  retryCorridorRings: 6,
  retrySteinerPointsPerEdge: 8,
  maximumGraphNodes: 100_000,
} satisfies MeshSurfaceGeodesicPolicyV1);

export type MeshSurfaceGeodesicFailureCodeV1 =
  | 'anchor-check-failed'
  | 'corridor-empty'
  | 'geodesic-not-converged'
  | 'self-intersection'
  | 'symmetry-mismatch'
  | 'taut-not-outside'
  | 'topology-mismatch';

export type MeshSurfaceGeodesicSegmentV1 =
  | Readonly<{ kind: 'surface'; path: MeshSurfacePathV1 }>
  | Readonly<{ kind: 'air'; from: MeshSurfacePointV1; to: MeshSurfacePointV1 }>;

export interface MeshSurfaceGeodesicStatsV1 {
  readonly buildMs: number;
  readonly attempts: number;
  readonly corridorRings: number;
  readonly steinerPointsPerEdge: number;
  readonly seedVertexCount: number;
  readonly corridorVertexCount: number;
  readonly corridorTriangleCount: number;
  readonly graphNodeCount: number;
  readonly stripTriangleCount: number;
  readonly rejectedCandidateLengthM: number | null;
}

export type MeshSurfaceGeodesicResultV1 =
  | Readonly<{
      ok: true;
      version: typeof MESH_SURFACE_GEODESIC_V1;
      path: MeshSurfacePathV1;
      segments: readonly MeshSurfaceGeodesicSegmentV1[];
      chordLengthM: number;
      tautLengthM: number;
      geodesicLengthM: number;
      edgeDijkstraLengthM: number;
      stats: MeshSurfaceGeodesicStatsV1;
    }>
  | Readonly<{
      ok: false;
      version: typeof MESH_SURFACE_GEODESIC_V1;
      code: MeshSurfaceGeodesicFailureCodeV1;
      stats: MeshSurfaceGeodesicStatsV1;
    }>;

interface Vec2 {
  readonly x: number;
  readonly y: number;
}

interface GraphLink {
  readonly node: number;
  readonly triangle: number;
  readonly length: number;
}

interface SeedResult {
  readonly vertices: readonly number[];
  readonly lengthM: number;
}

interface AttemptResult {
  readonly path: MeshSurfacePathV1;
  readonly graphLengthM: number;
  readonly corridorVertexCount: number;
  readonly corridorTriangleCount: number;
  readonly graphNodeCount: number;
  readonly stripTriangleCount: number;
}

type AttemptOutcome =
  | Readonly<{ ok: true; result: AttemptResult }>
  | Readonly<{
      ok: false;
      code: Extract<
        MeshSurfaceGeodesicFailureCodeV1,
        'corridor-empty' | 'geodesic-not-converged' | 'self-intersection'
      >;
      candidateLengthM?: number;
    }>;

interface Portal {
  readonly left: Vec2;
  readonly right: Vec2;
  readonly leftVertex: number | null;
  readonly rightVertex: number | null;
  readonly index: number;
}

interface FunnelApex {
  readonly point: Vec2;
  readonly surfacePoint: MeshSurfacePointV1;
  readonly portalIndex: number;
}

class MinHeap {
  private readonly nodes: number[] = [];
  private readonly distances: number[] = [];

  get size(): number {
    return this.nodes.length;
  }

  push(node: number, distance: number): void {
    let index = this.nodes.length;
    this.nodes.push(node);
    this.distances.push(distance);
    while (index > 0) {
      const parent = (index - 1) >> 1;
      if (this.distances[parent] <= distance) break;
      this.nodes[index] = this.nodes[parent];
      this.distances[index] = this.distances[parent];
      index = parent;
    }
    this.nodes[index] = node;
    this.distances[index] = distance;
  }

  pop(): readonly [node: number, distance: number] | null {
    if (this.nodes.length === 0) return null;
    const node = this.nodes[0];
    const distance = this.distances[0];
    const lastNode = this.nodes.pop()!;
    const lastDistance = this.distances.pop()!;
    if (this.nodes.length > 0) {
      let index = 0;
      while (true) {
        const left = index * 2 + 1;
        if (left >= this.nodes.length) break;
        const right = left + 1;
        const child =
          right < this.nodes.length && this.distances[right] < this.distances[left] ? right : left;
        if (this.distances[child] >= lastDistance) break;
        this.nodes[index] = this.nodes[child];
        this.distances[index] = this.distances[child];
        index = child;
      }
      this.nodes[index] = lastNode;
      this.distances[index] = lastDistance;
    }
    return [node, distance];
  }
}

function pointAt(positionsM: Float32Array, vertex: number): MeshSurfaceVec3V1 {
  const offset = vertex * 3;
  return [positionsM[offset], positionsM[offset + 1], positionsM[offset + 2]];
}

function pointPosition(point: MeshSurfacePointV1, positionsM: Float32Array): MeshSurfaceVec3V1 {
  if (point.kind === 'vertex') return pointAt(positionsM, point.vertex);
  const a = pointAt(positionsM, point.a);
  const b = pointAt(positionsM, point.b);
  return [
    a[0] + (b[0] - a[0]) * point.t,
    a[1] + (b[1] - a[1]) * point.t,
    a[2] + (b[2] - a[2]) * point.t,
  ];
}

function distance(left: MeshSurfaceVec3V1, right: MeshSurfaceVec3V1): number {
  return Math.hypot(left[0] - right[0], left[1] - right[1], left[2] - right[2]);
}

function distance2(left: Vec2, right: Vec2): number {
  return Math.hypot(left.x - right.x, left.y - right.y);
}

function pointTriangles(
  point: MeshSurfacePointV1,
  topology: MeshSurfaceTopologyV1,
): readonly number[] {
  if (point.kind === 'vertex') return [...topology.vertexTriangles[point.vertex]];
  const right = new Set(topology.vertexTriangles[point.b]);
  return [...topology.vertexTriangles[point.a]].filter((triangle) => right.has(triangle));
}

function pointCornerDistances(
  point: MeshSurfacePointV1,
  topology: MeshSurfaceTopologyV1,
  positionsM: Float32Array,
): ReadonlyMap<number, number> {
  const position = pointPosition(point, positionsM);
  const distances = new Map<number, number>();
  for (const triangle of pointTriangles(point, topology)) {
    for (const vertex of topology.triangleIndices.subarray(triangle * 3, triangle * 3 + 3)) {
      const value = distance(position, pointAt(positionsM, vertex));
      distances.set(vertex, Math.min(distances.get(vertex) ?? Number.POSITIVE_INFINITY, value));
    }
  }
  return distances;
}

function edgeDijkstra(
  start: MeshSurfacePointV1,
  end: MeshSurfacePointV1,
  topology: MeshSurfaceTopologyV1,
  positionsM: Float32Array,
): SeedResult | null {
  const starts = pointCornerDistances(start, topology, positionsM);
  const ends = pointCornerDistances(end, topology, positionsM);
  if (starts.size === 0 || ends.size === 0) return null;
  const distances = new Float64Array(topology.vertexCount);
  distances.fill(Number.POSITIVE_INFINITY);
  const parents = new Int32Array(topology.vertexCount);
  parents.fill(-1);
  const heap = new MinHeap();
  for (const [vertex, value] of starts) {
    distances[vertex] = value;
    heap.push(vertex, value);
  }
  let goal = -1;
  let goalLength = Number.POSITIVE_INFINITY;
  while (heap.size > 0) {
    const popped = heap.pop()!;
    const [vertex, current] = popped;
    if (current !== distances[vertex]) continue;
    const terminal = ends.get(vertex);
    if (terminal !== undefined && current + terminal < goalLength) {
      goal = vertex;
      goalLength = current + terminal;
    }
    if (current >= goalLength) break;
    const from = pointAt(positionsM, vertex);
    for (const neighbour of topology.vertexNeighbours[vertex]) {
      const candidate = current + distance(from, pointAt(positionsM, neighbour));
      if (candidate >= distances[neighbour]) continue;
      distances[neighbour] = candidate;
      parents[neighbour] = vertex;
      heap.push(neighbour, candidate);
    }
  }
  if (goal < 0) return null;
  const vertices: number[] = [];
  for (let vertex = goal; vertex >= 0; vertex = parents[vertex]) vertices.push(vertex);
  vertices.reverse();
  return { vertices: Object.freeze(vertices), lengthM: goalLength };
}

function regionContains(
  vertex: number,
  positionsM: Float32Array,
  region: MeshSurfaceGeodesicRegionV1 | undefined,
): boolean {
  if (!region) return true;
  if (region.vertexMask && region.vertexMask[vertex] !== 1) return false;
  const point = pointAt(positionsM, vertex);
  if (region.minimumM && point.some((value, axis) => value < region.minimumM![axis])) return false;
  if (region.maximumM && point.some((value, axis) => value > region.maximumM![axis])) return false;
  return true;
}

function corridorVertices(
  seed: readonly number[],
  rings: number,
  topology: MeshSurfaceTopologyV1,
  positionsM: Float32Array,
  region: MeshSurfaceGeodesicRegionV1 | undefined,
): Uint8Array {
  const distanceByVertex = new Int32Array(topology.vertexCount);
  distanceByVertex.fill(-1);
  const queue: number[] = [];
  for (const vertex of seed) {
    if (distanceByVertex[vertex] >= 0) continue;
    distanceByVertex[vertex] = 0;
    queue.push(vertex);
  }
  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const vertex = queue[cursor];
    const ring = distanceByVertex[vertex];
    if (ring >= rings) continue;
    for (const neighbour of topology.vertexNeighbours[vertex]) {
      if (distanceByVertex[neighbour] >= 0) continue;
      distanceByVertex[neighbour] = ring + 1;
      queue.push(neighbour);
    }
  }
  const mask = new Uint8Array(topology.vertexCount);
  queue.forEach((vertex) => {
    if (regionContains(vertex, positionsM, region)) mask[vertex] = 1;
  });
  return mask;
}

function pointInTriangle(
  point: MeshSurfacePointV1,
  triangle: number,
  topology: MeshSurfaceTopologyV1,
) {
  return pointTriangles(point, topology).includes(triangle);
}

function addUndirectedLink(
  adjacency: GraphLink[][],
  left: number,
  right: number,
  triangle: number,
  positions: readonly MeshSurfaceVec3V1[],
): void {
  if (left === right) return;
  const length = distance(positions[left], positions[right]);
  adjacency[left].push({ node: right, triangle, length });
  adjacency[right].push({ node: left, triangle, length });
}

function extractStrip(segmentTriangles: readonly number[]): readonly number[] | null {
  const strip: number[] = [];
  for (const triangle of segmentTriangles) {
    if (strip[strip.length - 1] === triangle) continue;
    if (strip.length >= 2 && strip[strip.length - 2] === triangle) {
      strip.pop();
      continue;
    }
    if (strip.includes(triangle)) return null;
    strip.push(triangle);
  }
  return strip.length > 0 ? Object.freeze(strip) : null;
}

function triangleVertices(triangle: number, topology: MeshSurfaceTopologyV1): readonly number[] {
  return [...topology.triangleIndices.subarray(triangle * 3, triangle * 3 + 3)];
}

function triangleAreaSquared(
  triangle: number,
  topology: MeshSurfaceTopologyV1,
  positionsM: Float32Array,
): number {
  const vertices = triangleVertices(triangle, topology);
  const a = pointAt(positionsM, vertices[0]);
  const b = pointAt(positionsM, vertices[1]);
  const c = pointAt(positionsM, vertices[2]);
  const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const ac = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  const cross = [
    ab[1] * ac[2] - ab[2] * ac[1],
    ab[2] * ac[0] - ab[0] * ac[2],
    ab[0] * ac[1] - ab[1] * ac[0],
  ];
  return cross[0] * cross[0] + cross[1] * cross[1] + cross[2] * cross[2];
}

function cross2(a: Vec2, b: Vec2, c: Vec2): number {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}

function same2(left: Vec2, right: Vec2, epsilon: number): boolean {
  return Math.abs(left.x - right.x) <= epsilon && Math.abs(left.y - right.y) <= epsilon;
}

function thirdVertex(vertices: readonly number[], a: number, b: number): number | null {
  return vertices.find((vertex) => vertex !== a && vertex !== b) ?? null;
}

function pointInLayout(point: MeshSurfacePointV1, layout: ReadonlyMap<number, Vec2>): Vec2 | null {
  if (point.kind === 'vertex') return layout.get(point.vertex) ?? null;
  const a = layout.get(point.a);
  const b = layout.get(point.b);
  if (!a || !b) return null;
  return { x: a.x + (b.x - a.x) * point.t, y: a.y + (b.y - a.y) * point.t };
}

function unfoldStrip(
  stripInput: readonly number[],
  start: MeshSurfacePointV1,
  end: MeshSurfacePointV1,
  topology: MeshSurfaceTopologyV1,
  positionsM: Float32Array,
): { readonly portals: readonly Portal[]; readonly epsilon: number } | null {
  const strip = stripInput.filter(
    (triangle) => triangleAreaSquared(triangle, topology, positionsM) !== 0,
  );
  if (strip.length === 0) return null;
  const firstVertices = triangleVertices(strip[0], topology);
  const firstA = pointAt(positionsM, firstVertices[0]);
  const firstB = pointAt(positionsM, firstVertices[1]);
  const firstC = pointAt(positionsM, firstVertices[2]);
  const ab = distance(firstA, firstB);
  if (ab === 0) return null;
  const ac = distance(firstA, firstC);
  const bc = distance(firstB, firstC);
  const cx = (ac * ac - bc * bc + ab * ab) / (2 * ab);
  const cy = Math.sqrt(Math.max(0, ac * ac - cx * cx));
  if (cy === 0) return null;
  const layouts: Map<number, Vec2>[] = [
    new Map([
      [firstVertices[0], { x: 0, y: 0 }],
      [firstVertices[1], { x: ab, y: 0 }],
      [firstVertices[2], { x: cx, y: cy }],
    ]),
  ];
  let maximumCoordinate = Math.max(ab, Math.abs(cx), cy);
  for (let index = 1; index < strip.length; index += 1) {
    const previousVertices = triangleVertices(strip[index - 1], topology);
    const vertices = triangleVertices(strip[index], topology);
    const shared = previousVertices.filter((vertex) => vertices.includes(vertex));
    if (shared.length !== 2) return null;
    const [aVertex, bVertex] = shared;
    const previousThird = thirdVertex(previousVertices, aVertex, bVertex);
    const nextThird = thirdVertex(vertices, aVertex, bVertex);
    if (previousThird === null || nextThird === null) return null;
    const previousLayout = layouts[index - 1];
    const a = previousLayout.get(aVertex)!;
    const b = previousLayout.get(bVertex)!;
    const previousPoint = previousLayout.get(previousThird)!;
    const edgeLength = distance2(a, b);
    if (edgeLength === 0) return null;
    const nextPosition = pointAt(positionsM, nextThird);
    const da = distance(pointAt(positionsM, aVertex), nextPosition);
    const db = distance(pointAt(positionsM, bVertex), nextPosition);
    const along = (da * da - db * db + edgeLength * edgeLength) / (2 * edgeLength);
    const height = Math.sqrt(Math.max(0, da * da - along * along));
    if (height === 0) return null;
    const ux = (b.x - a.x) / edgeLength;
    const uy = (b.y - a.y) / edgeLength;
    const base = { x: a.x + ux * along, y: a.y + uy * along };
    const plus = { x: base.x - uy * height, y: base.y + ux * height };
    const minus = { x: base.x + uy * height, y: base.y - ux * height };
    const nextPoint = cross2(a, b, previousPoint) >= 0 ? minus : plus;
    layouts.push(
      new Map([
        [aVertex, a],
        [bVertex, b],
        [nextThird, nextPoint],
      ]),
    );
    maximumCoordinate = Math.max(maximumCoordinate, Math.abs(nextPoint.x), Math.abs(nextPoint.y));
  }
  const start2 = pointInLayout(start, layouts[0]);
  const end2 = pointInLayout(end, layouts[layouts.length - 1]);
  if (!start2 || !end2) return null;
  const epsilon = Math.max(1, maximumCoordinate) * Number.EPSILON * 128;
  const portals: Portal[] = [
    { left: start2, right: start2, leftVertex: null, rightVertex: null, index: 0 },
  ];
  for (let index = 1; index < strip.length; index += 1) {
    const previousVertices = triangleVertices(strip[index - 1], topology);
    const vertices = triangleVertices(strip[index], topology);
    const shared = previousVertices.filter((vertex) => vertices.includes(vertex));
    if (shared.length !== 2) return null;
    const [aVertex, bVertex] = shared;
    const layout = layouts[index];
    const a = layout.get(aVertex)!;
    const b = layout.get(bVertex)!;
    const nextThird = thirdVertex(vertices, aVertex, bVertex)!;
    const nextPoint = layout.get(nextThird)!;
    const nextOnLeft = cross2(a, b, nextPoint) > 0;
    portals.push({
      left: nextOnLeft ? b : a,
      right: nextOnLeft ? a : b,
      leftVertex: nextOnLeft ? bVertex : aVertex,
      rightVertex: nextOnLeft ? aVertex : bVertex,
      index,
    });
  }
  portals.push({
    left: end2,
    right: end2,
    leftVertex: null,
    rightVertex: null,
    index: strip.length,
  });
  return { portals: Object.freeze(portals), epsilon };
}

function funnelApexes(
  portals: readonly Portal[],
  start: MeshSurfacePointV1,
  end: MeshSurfacePointV1,
  epsilon: number,
): readonly FunnelApex[] {
  const portalPoint = (index: number, side: 'left' | 'right'): MeshSurfacePointV1 => {
    const vertex = side === 'left' ? portals[index].leftVertex : portals[index].rightVertex;
    if (vertex !== null) return meshSurfaceVertexPointV1(vertex);
    return index === 0 ? start : end;
  };
  const result: FunnelApex[] = [{ point: portals[0].left, surfacePoint: start, portalIndex: 0 }];
  let apex = portals[0].left;
  let left = apex;
  let right = apex;
  let apexIndex = 0;
  let leftIndex = 0;
  let rightIndex = 0;
  for (let index = 1; index < portals.length; index += 1) {
    const portal = portals[index];
    if (cross2(apex, right, portal.right) <= epsilon) {
      if (same2(apex, right, epsilon) || cross2(apex, left, portal.right) > epsilon) {
        right = portal.right;
        rightIndex = index;
      } else {
        result.push({
          point: left,
          surfacePoint: portalPoint(leftIndex, 'left'),
          portalIndex: leftIndex,
        });
        apex = left;
        apexIndex = leftIndex;
        left = apex;
        right = apex;
        leftIndex = apexIndex;
        rightIndex = apexIndex;
        index = apexIndex;
        continue;
      }
    }
    if (cross2(apex, left, portal.left) >= -epsilon) {
      if (same2(apex, left, epsilon) || cross2(apex, right, portal.left) < -epsilon) {
        left = portal.left;
        leftIndex = index;
      } else {
        result.push({
          point: right,
          surfacePoint: portalPoint(rightIndex, 'right'),
          portalIndex: rightIndex,
        });
        apex = right;
        apexIndex = rightIndex;
        left = apex;
        right = apex;
        leftIndex = apexIndex;
        rightIndex = apexIndex;
        index = apexIndex;
      }
    }
  }
  result.push({
    point: portals[portals.length - 1].left,
    surfacePoint: end,
    portalIndex: portals.length - 1,
  });
  return Object.freeze(result);
}

function sameSurfacePoint(left: MeshSurfacePointV1, right: MeshSurfacePointV1): boolean {
  if (left.kind !== right.kind) return false;
  return left.kind === 'vertex'
    ? left.vertex === (right as typeof left).vertex
    : left.a === (right as typeof left).a &&
        left.b === (right as typeof left).b &&
        left.t === (right as typeof left).t;
}

function portalIntersection(
  from: Vec2,
  to: Vec2,
  portal: Portal,
  epsilon: number,
): MeshSurfacePointV1 | null {
  if (portal.leftVertex === null || portal.rightVertex === null) return null;
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const px = portal.right.x - portal.left.x;
  const py = portal.right.y - portal.left.y;
  const denominator = dx * py - dy * px;
  if (Math.abs(denominator) <= epsilon) {
    if (same2(to, portal.left, epsilon)) return meshSurfaceVertexPointV1(portal.leftVertex);
    if (same2(to, portal.right, epsilon)) return meshSurfaceVertexPointV1(portal.rightVertex);
    return null;
  }
  const rx = portal.left.x - from.x;
  const ry = portal.left.y - from.y;
  const lineT = (rx * py - ry * px) / denominator;
  const portalT = (rx * dy - ry * dx) / denominator;
  if (lineT < -epsilon || lineT > 1 + epsilon || portalT < -epsilon || portalT > 1 + epsilon) {
    return null;
  }
  const endpointEpsilon = Math.sqrt(Number.EPSILON);
  const clampedPortalT =
    portalT <= endpointEpsilon ? 0 : portalT >= 1 - endpointEpsilon ? 1 : portalT;
  return meshSurfaceEdgePointV1(
    portal.leftVertex,
    portal.rightVertex,
    Math.max(0, Math.min(1, clampedPortalT)),
  );
}

function reconstructSurfacePoints(
  apexes: readonly FunnelApex[],
  portals: readonly Portal[],
  epsilon: number,
): readonly MeshSurfacePointV1[] | null {
  const points: MeshSurfacePointV1[] = [];
  const append = (point: MeshSurfacePointV1) => {
    if (
      !points.some(
        (existing, index) => index === points.length - 1 && sameSurfacePoint(existing, point),
      )
    ) {
      points.push(point);
    }
  };
  apexes.slice(0, -1).forEach((from, apexIndex) => {
    const to = apexes[apexIndex + 1];
    append(from.surfacePoint);
    for (let portalIndex = from.portalIndex + 1; portalIndex <= to.portalIndex; portalIndex += 1) {
      const crossing = portalIntersection(from.point, to.point, portals[portalIndex], epsilon);
      if (crossing) append(crossing);
    }
  });
  append(apexes[apexes.length - 1].surfacePoint);
  return points.length >= 2 ? Object.freeze(points) : null;
}

function cornerAngle(
  vertex: number,
  left: number,
  right: number,
  positionsM: Float32Array,
): number {
  const origin = pointAt(positionsM, vertex);
  const a = pointAt(positionsM, left);
  const b = pointAt(positionsM, right);
  const ax = a[0] - origin[0];
  const ay = a[1] - origin[1];
  const az = a[2] - origin[2];
  const bx = b[0] - origin[0];
  const by = b[1] - origin[1];
  const bz = b[2] - origin[2];
  const denominator = Math.hypot(ax, ay, az) * Math.hypot(bx, by, bz);
  if (denominator === 0) return 0;
  return Math.acos(Math.max(-1, Math.min(1, (ax * bx + ay * by + az * bz) / denominator)));
}

interface FanFace {
  readonly triangle: number;
  readonly startVertex: number;
  readonly endVertex: number;
  readonly startAngle: number;
  readonly angle: number;
}

function vertexFan(
  vertex: number,
  topology: MeshSurfaceTopologyV1,
  positionsM: Float32Array,
): { readonly faces: readonly FanFace[]; readonly total: number } | null {
  const triangles = [...topology.vertexTriangles[vertex]];
  if (triangles.length < 2) return null;
  const others = new Map<number, readonly [number, number]>();
  triangles.forEach((triangle) => {
    const pair = triangleVertices(triangle, topology).filter((candidate) => candidate !== vertex);
    others.set(triangle, [pair[0], pair[1]]);
  });
  const startTriangle = Math.min(...triangles);
  const startPair = others.get(startTriangle)!;
  let boundary = Math.min(...startPair);
  let triangle = startTriangle;
  const visited = new Set<number>();
  const faces: FanFace[] = [];
  let angle = 0;
  while (!visited.has(triangle)) {
    visited.add(triangle);
    const pair = others.get(triangle)!;
    const endVertex = pair[0] === boundary ? pair[1] : pair[0];
    const faceAngle = cornerAngle(vertex, boundary, endVertex, positionsM);
    faces.push({
      triangle,
      startVertex: boundary,
      endVertex,
      startAngle: angle,
      angle: faceAngle,
    });
    angle += faceAngle;
    const candidates = triangles.filter(
      (candidate) => !visited.has(candidate) && others.get(candidate)!.includes(endVertex),
    );
    if (candidates.length === 0) break;
    triangle = Math.min(...candidates);
    boundary = endVertex;
  }
  if (faces.length !== triangles.length) return null;
  return { faces: Object.freeze(faces), total: angle };
}

function directionAngleInFace(
  apex: number,
  target: MeshSurfacePointV1,
  face: FanFace,
  positionsM: Float32Array,
): number {
  const origin = pointAt(positionsM, apex);
  const start = pointAt(positionsM, face.startVertex);
  const targetPosition = pointPosition(target, positionsM);
  const sx = start[0] - origin[0];
  const sy = start[1] - origin[1];
  const sz = start[2] - origin[2];
  const tx = targetPosition[0] - origin[0];
  const ty = targetPosition[1] - origin[1];
  const tz = targetPosition[2] - origin[2];
  const denominator = Math.hypot(sx, sy, sz) * Math.hypot(tx, ty, tz);
  if (denominator === 0) return face.startAngle;
  const within = Math.acos(Math.max(-1, Math.min(1, (sx * tx + sy * ty + sz * tz) / denominator)));
  return face.startAngle + Math.min(face.angle, within);
}

function apexCheck(
  points: readonly MeshSurfacePointV1[],
  apexVertices: ReadonlySet<number>,
  topology: MeshSurfaceTopologyV1,
  positionsM: Float32Array,
): boolean {
  for (let index = 1; index < points.length - 1; index += 1) {
    const point = points[index];
    if (point.kind !== 'vertex' || !apexVertices.has(point.vertex)) continue;
    const fan = vertexFan(point.vertex, topology, positionsM);
    if (!fan) return false;
    const incomingFaces = new Set(pointTriangles(points[index - 1], topology));
    const outgoingFaces = new Set(pointTriangles(points[index + 1], topology));
    const incoming = fan.faces
      .filter(({ triangle }) => incomingFaces.has(triangle))
      .map((face) => directionAngleInFace(point.vertex, points[index - 1], face, positionsM));
    const outgoing = fan.faces
      .filter(({ triangle }) => outgoingFaces.has(triangle))
      .map((face) => directionAngleInFace(point.vertex, points[index + 1], face, positionsM));
    const tolerance = Math.sqrt(Number.EPSILON) * fan.faces.length * 8;
    const valid = incoming.some((left) =>
      outgoing.some((right) => {
        const forward = (((right - left) % fan.total) + fan.total) % fan.total;
        return forward + tolerance >= Math.PI && fan.total - forward + tolerance >= Math.PI;
      }),
    );
    if (!valid) return false;
  }
  return true;
}

function pathHasRepeatedPoint(points: readonly MeshSurfacePointV1[]): boolean {
  for (let left = 0; left < points.length; left += 1) {
    for (let right = left + 2; right < points.length; right += 1) {
      if (sameSurfacePoint(points[left], points[right])) return true;
    }
  }
  return false;
}

function surfacePolylineLength(
  points: readonly MeshSurfacePointV1[],
  positionsM: Float32Array,
): number {
  let lengthM = 0;
  for (let index = 1; index < points.length; index += 1) {
    lengthM += distance(
      pointPosition(points[index - 1], positionsM),
      pointPosition(points[index], positionsM),
    );
  }
  return lengthM;
}

function steinerAttempt(options: {
  readonly topology: MeshSurfaceTopologyV1;
  readonly positionsM: Float32Array;
  readonly start: MeshSurfacePointV1;
  readonly end: MeshSurfacePointV1;
  readonly seed: readonly number[];
  readonly region?: MeshSurfaceGeodesicRegionV1;
  readonly rings: number;
  readonly steinerPointsPerEdge: number;
  readonly maximumGraphNodes: number;
}): AttemptOutcome {
  const corridor = corridorVertices(
    options.seed,
    options.rings,
    options.topology,
    options.positionsM,
    options.region,
  );
  const corridorTriangles: number[] = [];
  for (let triangle = 0; triangle < options.topology.triangleCount; triangle += 1) {
    const vertices = triangleVertices(triangle, options.topology);
    if (vertices.every((vertex) => corridor[vertex] === 1)) corridorTriangles.push(triangle);
  }
  if (corridorTriangles.length === 0) return { ok: false, code: 'corridor-empty' };
  const corridorEdges = new Set<number>();
  corridorTriangles.forEach((triangle) => {
    for (const edge of options.topology.triangleEdges.subarray(triangle * 3, triangle * 3 + 3)) {
      corridorEdges.add(edge);
    }
  });
  const nodePoints: MeshSurfacePointV1[] = [options.start, options.end];
  const nodePositions: MeshSurfaceVec3V1[] = [
    pointPosition(options.start, options.positionsM),
    pointPosition(options.end, options.positionsM),
  ];
  const edgeNodes = new Map<number, number[]>();
  for (const edge of corridorEdges) {
    const a = options.topology.edgeVertices[edge * 2];
    const b = options.topology.edgeVertices[edge * 2 + 1];
    const nodes: number[] = [];
    for (let sample = 1; sample <= options.steinerPointsPerEdge; sample += 1) {
      const point = meshSurfaceEdgePointV1(a, b, sample / (options.steinerPointsPerEdge + 1));
      nodes.push(nodePoints.length);
      nodePoints.push(point);
      nodePositions.push(pointPosition(point, options.positionsM));
    }
    edgeNodes.set(edge, nodes);
  }
  if (nodePoints.length > options.maximumGraphNodes) {
    return { ok: false, code: 'geodesic-not-converged' };
  }
  const adjacency = Array.from({ length: nodePoints.length }, () => [] as GraphLink[]);
  for (const triangle of corridorTriangles) {
    const nodes: number[] = [];
    for (const edge of options.topology.triangleEdges.subarray(triangle * 3, triangle * 3 + 3)) {
      nodes.push(...(edgeNodes.get(edge) ?? []));
    }
    if (pointInTriangle(options.start, triangle, options.topology)) nodes.push(0);
    if (pointInTriangle(options.end, triangle, options.topology)) nodes.push(1);
    for (let left = 0; left < nodes.length; left += 1) {
      for (let right = left + 1; right < nodes.length; right += 1) {
        const leftPoint = nodePoints[nodes[left]];
        const rightPoint = nodePoints[nodes[right]];
        if (
          leftPoint.kind === 'edge' &&
          rightPoint.kind === 'edge' &&
          leftPoint.a === rightPoint.a &&
          leftPoint.b === rightPoint.b
        ) {
          continue;
        }
        addUndirectedLink(adjacency, nodes[left], nodes[right], triangle, nodePositions);
      }
    }
  }
  const distances = new Float64Array(nodePoints.length);
  distances.fill(Number.POSITIVE_INFINITY);
  distances[0] = 0;
  const parents = new Int32Array(nodePoints.length);
  parents.fill(-1);
  const parentTriangles = new Int32Array(nodePoints.length);
  parentTriangles.fill(-1);
  const heap = new MinHeap();
  heap.push(0, 0);
  while (heap.size > 0) {
    const popped = heap.pop()!;
    const [node, current] = popped;
    if (current !== distances[node]) continue;
    if (node === 1) break;
    for (const link of adjacency[node]) {
      const candidate = current + link.length;
      if (candidate >= distances[link.node]) continue;
      distances[link.node] = candidate;
      parents[link.node] = node;
      parentTriangles[link.node] = link.triangle;
      heap.push(link.node, candidate);
    }
  }
  if (!Number.isFinite(distances[1])) return { ok: false, code: 'geodesic-not-converged' };
  const nodes: number[] = [];
  const segmentTriangles: number[] = [];
  for (let node = 1; node >= 0; node = parents[node]) {
    nodes.push(node);
    if (parentTriangles[node] >= 0) segmentTriangles.push(parentTriangles[node]);
    if (node === 0) break;
  }
  if (nodes[nodes.length - 1] !== 0) return { ok: false, code: 'geodesic-not-converged' };
  nodes.reverse();
  segmentTriangles.reverse();
  const strip = extractStrip(segmentTriangles);
  if (!strip) return { ok: false, code: 'self-intersection' };
  const unfolded = unfoldStrip(
    strip,
    options.start,
    options.end,
    options.topology,
    options.positionsM,
  );
  if (!unfolded) return { ok: false, code: 'geodesic-not-converged' };
  const apexes = funnelApexes(unfolded.portals, options.start, options.end, unfolded.epsilon);
  const surfacePoints = reconstructSurfacePoints(apexes, unfolded.portals, unfolded.epsilon);
  if (!surfacePoints) return { ok: false, code: 'geodesic-not-converged' };
  if (pathHasRepeatedPoint(surfacePoints)) {
    return {
      ok: false,
      code: 'self-intersection',
      candidateLengthM: surfacePolylineLength(surfacePoints, options.positionsM),
    };
  }
  let path: MeshSurfacePathV1;
  try {
    path = createMeshSurfacePathV1({ topology: options.topology, points: surfacePoints });
  } catch {
    return { ok: false, code: 'geodesic-not-converged' };
  }
  const apexVertices = new Set(
    apexes.flatMap(({ surfacePoint }) =>
      surfacePoint.kind === 'vertex' ? [surfacePoint.vertex] : [],
    ),
  );
  if (!apexCheck(surfacePoints, apexVertices, options.topology, options.positionsM)) {
    return {
      ok: false,
      code: 'geodesic-not-converged',
      candidateLengthM: surfacePolylineLength(surfacePoints, options.positionsM),
    };
  }
  return {
    ok: true,
    result: {
      path,
      graphLengthM: distances[1],
      corridorVertexCount: corridor.reduce((sum, value) => sum + value, 0),
      corridorTriangleCount: corridorTriangles.length,
      graphNodeCount: nodePoints.length,
      stripTriangleCount: strip.length,
    },
  };
}

function validPolicy(input: Partial<MeshSurfaceGeodesicPolicyV1> | undefined) {
  const policy = { ...DEFAULT_MESH_SURFACE_GEODESIC_POLICY_V1, ...input };
  for (const key of [
    'corridorRings',
    'steinerPointsPerEdge',
    'retryCorridorRings',
    'retrySteinerPointsPerEdge',
    'maximumGraphNodes',
  ] as const) {
    if (!Number.isSafeInteger(policy[key]) || policy[key] <= 0) {
      throw new RangeError(`${key} must be a positive safe integer.`);
    }
  }
  return Object.freeze(policy);
}

interface TriangleGrid {
  readonly minimum: MeshSurfaceVec3V1;
  readonly cellSize: number;
  readonly dimensions: readonly [number, number, number];
  readonly cells: ReadonlyMap<number, Uint32Array>;
}

const triangleGridCache = new WeakMap<Float32Array, WeakMap<MeshSurfaceTopologyV1, TriangleGrid>>();

function gridCellKey(
  x: number,
  y: number,
  z: number,
  dimensions: readonly [number, number, number],
): number {
  return (z * dimensions[1] + y) * dimensions[0] + x;
}

function triangleGrid(positionsM: Float32Array, topology: MeshSurfaceTopologyV1): TriangleGrid {
  const byTopology = triangleGridCache.get(positionsM);
  const cached = byTopology?.get(topology);
  if (cached) return cached;
  const minimum = [
    Number.POSITIVE_INFINITY,
    Number.POSITIVE_INFINITY,
    Number.POSITIVE_INFINITY,
  ] as [number, number, number];
  const maximum = [
    Number.NEGATIVE_INFINITY,
    Number.NEGATIVE_INFINITY,
    Number.NEGATIVE_INFINITY,
  ] as [number, number, number];
  for (let offset = 0; offset < positionsM.length; offset += 3) {
    for (let axis = 0; axis < 3; axis += 1) {
      minimum[axis] = Math.min(minimum[axis], positionsM[offset + axis]);
      maximum[axis] = Math.max(maximum[axis], positionsM[offset + axis]);
    }
  }
  const extent = maximum.map((value, axis) => value - minimum[axis]);
  const targetCellsOnLongestAxis = Math.max(1, Math.ceil(Math.cbrt(topology.triangleCount)));
  const cellSize = Math.max(...extent) / targetCellsOnLongestAxis;
  const dimensions = extent.map((value) => Math.max(1, Math.ceil(value / cellSize))) as [
    number,
    number,
    number,
  ];
  const mutableCells = new Map<number, number[]>();
  for (let triangle = 0; triangle < topology.triangleCount; triangle += 1) {
    const vertices = triangleVertices(triangle, topology);
    const triangleMinimum = [0, 1, 2].map((axis) =>
      Math.min(...vertices.map((vertex) => positionsM[vertex * 3 + axis])),
    );
    const triangleMaximum = [0, 1, 2].map((axis) =>
      Math.max(...vertices.map((vertex) => positionsM[vertex * 3 + axis])),
    );
    const from = triangleMinimum.map((value, axis) =>
      Math.max(0, Math.floor((value - minimum[axis]) / cellSize)),
    );
    const to = triangleMaximum.map((value, axis) =>
      Math.min(dimensions[axis] - 1, Math.floor((value - minimum[axis]) / cellSize)),
    );
    for (let z = from[2]; z <= to[2]; z += 1) {
      for (let y = from[1]; y <= to[1]; y += 1) {
        for (let x = from[0]; x <= to[0]; x += 1) {
          const key = gridCellKey(x, y, z, dimensions);
          const triangles = mutableCells.get(key) ?? [];
          triangles.push(triangle);
          mutableCells.set(key, triangles);
        }
      }
    }
  }
  const grid = Object.freeze({
    minimum: Object.freeze(minimum) as MeshSurfaceVec3V1,
    cellSize,
    dimensions: Object.freeze(dimensions) as readonly [number, number, number],
    cells: new Map(
      [...mutableCells].map(([key, triangles]) => [key, Uint32Array.from(triangles)] as const),
    ),
  });
  const cache = byTopology ?? new WeakMap<MeshSurfaceTopologyV1, TriangleGrid>();
  cache.set(topology, grid);
  triangleGridCache.set(positionsM, cache);
  return grid;
}

function gridCandidatesForSegment(
  from: MeshSurfaceVec3V1,
  to: MeshSurfaceVec3V1,
  grid: TriangleGrid,
): ReadonlySet<number> {
  const minimum = from.map((value, axis) => Math.min(value, to[axis]));
  const maximum = from.map((value, axis) => Math.max(value, to[axis]));
  const cellFrom = minimum.map((value, axis) =>
    Math.max(0, Math.floor((value - grid.minimum[axis]) / grid.cellSize)),
  );
  const cellTo = maximum.map((value, axis) =>
    Math.min(grid.dimensions[axis] - 1, Math.floor((value - grid.minimum[axis]) / grid.cellSize)),
  );
  const triangles = new Set<number>();
  for (let z = cellFrom[2]; z <= cellTo[2]; z += 1) {
    for (let y = cellFrom[1]; y <= cellTo[1]; y += 1) {
      for (let x = cellFrom[0]; x <= cellTo[0]; x += 1) {
        for (const triangle of grid.cells.get(gridCellKey(x, y, z, grid.dimensions)) ?? []) {
          triangles.add(triangle);
        }
      }
    }
  }
  return triangles;
}

function rayTriangleParameter(
  origin: MeshSurfaceVec3V1,
  direction: MeshSurfaceVec3V1,
  triangle: number,
  topology: MeshSurfaceTopologyV1,
  positionsM: Float32Array,
): number | null {
  const vertices = triangleVertices(triangle, topology);
  const a = pointAt(positionsM, vertices[0]);
  const b = pointAt(positionsM, vertices[1]);
  const c = pointAt(positionsM, vertices[2]);
  const edge1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const edge2 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  const p = [
    direction[1] * edge2[2] - direction[2] * edge2[1],
    direction[2] * edge2[0] - direction[0] * edge2[2],
    direction[0] * edge2[1] - direction[1] * edge2[0],
  ];
  const determinant = edge1[0] * p[0] + edge1[1] * p[1] + edge1[2] * p[2];
  const epsilon = Number.EPSILON * 1024;
  if (Math.abs(determinant) <= epsilon) return null;
  const inverse = 1 / determinant;
  const tVector = [origin[0] - a[0], origin[1] - a[1], origin[2] - a[2]];
  const u = (tVector[0] * p[0] + tVector[1] * p[1] + tVector[2] * p[2]) * inverse;
  if (u < -epsilon || u > 1 + epsilon) return null;
  const q = [
    tVector[1] * edge1[2] - tVector[2] * edge1[1],
    tVector[2] * edge1[0] - tVector[0] * edge1[2],
    tVector[0] * edge1[1] - tVector[1] * edge1[0],
  ];
  const v = (direction[0] * q[0] + direction[1] * q[1] + direction[2] * q[2]) * inverse;
  if (v < -epsilon || u + v > 1 + epsilon) return null;
  return (edge2[0] * q[0] + edge2[1] * q[1] + edge2[2] * q[2]) * inverse;
}

function midpointOutside(
  from: MeshSurfaceVec3V1,
  to: MeshSurfaceVec3V1,
  topology: MeshSurfaceTopologyV1,
  positionsM: Float32Array,
): boolean {
  const midpoint: MeshSurfaceVec3V1 = [
    (from[0] + to[0]) / 2,
    (from[1] + to[1]) / 2,
    (from[2] + to[2]) / 2,
  ];
  const direction: MeshSurfaceVec3V1 = [1, Math.SQRT2, Math.sqrt(3)];
  const hits: number[] = [];
  for (let triangle = 0; triangle < topology.triangleCount; triangle += 1) {
    const parameter = rayTriangleParameter(midpoint, direction, triangle, topology, positionsM);
    if (parameter !== null && parameter > 0) hits.push(parameter);
  }
  hits.sort((left, right) => left - right);
  let uniqueHits = 0;
  let previous = Number.NEGATIVE_INFINITY;
  for (const hit of hits) {
    const epsilon = Math.max(1, Math.abs(hit)) * Number.EPSILON * 2048;
    if (Math.abs(hit - previous) <= epsilon) continue;
    uniqueHits += 1;
    previous = hit;
  }
  return uniqueHits % 2 === 0;
}

function segmentOutside(
  from: MeshSurfacePointV1,
  to: MeshSurfacePointV1,
  topology: MeshSurfaceTopologyV1,
  positionsM: Float32Array,
  grid: TriangleGrid,
): boolean {
  const fromPosition = pointPosition(from, positionsM);
  const toPosition = pointPosition(to, positionsM);
  const direction: MeshSurfaceVec3V1 = [
    toPosition[0] - fromPosition[0],
    toPosition[1] - fromPosition[1],
    toPosition[2] - fromPosition[2],
  ];
  const parameterEpsilon = Number.EPSILON * 4096;
  for (const triangle of gridCandidatesForSegment(fromPosition, toPosition, grid)) {
    const parameter = rayTriangleParameter(fromPosition, direction, triangle, topology, positionsM);
    if (parameter !== null && parameter > parameterEpsilon && parameter < 1 - parameterEpsilon) {
      return false;
    }
  }
  return midpointOutside(fromPosition, toPosition, topology, positionsM);
}

function tautSegments(
  path: MeshSurfacePathV1,
  topology: MeshSurfaceTopologyV1,
  positionsM: Float32Array,
): { readonly segments: readonly MeshSurfaceGeodesicSegmentV1[]; readonly lengthM: number } | null {
  const grid = triangleGrid(positionsM, topology);
  const segments: MeshSurfaceGeodesicSegmentV1[] = [];
  let lengthM = 0;
  for (let index = 0; index < path.points.length - 1; ) {
    let target = index + 1;
    for (let candidate = path.points.length - 1; candidate >= index + 2; candidate -= 1) {
      if (segmentOutside(path.points[index], path.points[candidate], topology, positionsM, grid)) {
        target = candidate;
        break;
      }
    }
    if (target > index + 1) {
      if (!segmentOutside(path.points[index], path.points[target], topology, positionsM, grid)) {
        return null;
      }
      segments.push(
        Object.freeze({ kind: 'air' as const, from: path.points[index], to: path.points[target] }),
      );
      lengthM += distance(
        pointPosition(path.points[index], positionsM),
        pointPosition(path.points[target], positionsM),
      );
    } else {
      const surface = createMeshSurfacePathV1({
        topology,
        points: [path.points[index], path.points[target]],
      });
      segments.push(Object.freeze({ kind: 'surface' as const, path: surface }));
      lengthM += evaluateMeshSurfacePathV1({ path: surface, topology, positionsM }).lengthM;
    }
    index = target;
  }
  return { segments: Object.freeze(segments), lengthM };
}

function stats(
  startedAt: number,
  seedVertexCount: number,
  attempt: AttemptResult | null,
  attempts: number,
  rings: number,
  steiner: number,
  rejectedCandidateLengthM: number | null = null,
): MeshSurfaceGeodesicStatsV1 {
  return Object.freeze({
    buildMs: performance.now() - startedAt,
    attempts,
    corridorRings: rings,
    steinerPointsPerEdge: steiner,
    seedVertexCount,
    corridorVertexCount: attempt?.corridorVertexCount ?? 0,
    corridorTriangleCount: attempt?.corridorTriangleCount ?? 0,
    graphNodeCount: attempt?.graphNodeCount ?? 0,
    stripTriangleCount: attempt?.stripTriangleCount ?? 0,
    rejectedCandidateLengthM,
  });
}

function failed(
  startedAt: number,
  code: MeshSurfaceGeodesicFailureCodeV1,
  seedVertexCount = 0,
  attempt: AttemptResult | null = null,
  attempts = 0,
  rings = 0,
  steiner = 0,
  rejectedCandidateLengthM: number | null = null,
): MeshSurfaceGeodesicResultV1 {
  return Object.freeze({
    ok: false as const,
    version: MESH_SURFACE_GEODESIC_V1,
    code,
    stats: stats(
      startedAt,
      seedVertexCount,
      attempt,
      attempts,
      rings,
      steiner,
      rejectedCandidateLengthM,
    ),
  });
}

export function computeMeshSurfaceGeodesicV1(options: {
  readonly topology: MeshSurfaceTopologyV1;
  readonly positionsM: Float32Array;
  readonly triangleIndices: Uint16Array | Uint32Array;
  readonly start: MeshSurfacePointV1;
  readonly end: MeshSurfacePointV1;
  readonly region?: MeshSurfaceGeodesicRegionV1;
  readonly policy?: Partial<MeshSurfaceGeodesicPolicyV1>;
  readonly taut?: boolean;
}): MeshSurfaceGeodesicResultV1 {
  const startedAt = performance.now();
  if (
    options.positionsM.length !== options.topology.vertexCount * 3 ||
    !meshSurfaceTopologyMatchesIndicesV1(options.topology, options.triangleIndices)
  ) {
    return failed(startedAt, 'topology-mismatch');
  }
  let policy: MeshSurfaceGeodesicPolicyV1;
  try {
    policy = validPolicy(options.policy);
  } catch {
    return failed(startedAt, 'geodesic-not-converged');
  }
  if (
    options.region?.vertexMask &&
    options.region.vertexMask.length !== options.topology.vertexCount
  ) {
    return failed(startedAt, 'corridor-empty');
  }
  const seed = edgeDijkstra(options.start, options.end, options.topology, options.positionsM);
  if (!seed) return failed(startedAt, 'geodesic-not-converged');
  let attempts = 1;
  let rings = policy.corridorRings;
  let steiner = policy.steinerPointsPerEdge;
  let outcome = steinerAttempt({
    ...options,
    seed: seed.vertices,
    rings,
    steinerPointsPerEdge: steiner,
    maximumGraphNodes: policy.maximumGraphNodes,
  });
  if (!outcome.ok) {
    attempts = 2;
    rings = policy.retryCorridorRings;
    steiner = policy.retrySteinerPointsPerEdge;
    outcome = steinerAttempt({
      ...options,
      seed: seed.vertices,
      rings,
      steinerPointsPerEdge: steiner,
      maximumGraphNodes: policy.maximumGraphNodes,
    });
  }
  if (!outcome.ok) {
    return failed(
      startedAt,
      outcome.code,
      seed.vertices.length,
      null,
      attempts,
      rings,
      steiner,
      outcome.candidateLengthM ?? null,
    );
  }
  const attempt = outcome.result;
  const evaluation = evaluateMeshSurfacePathV1({
    path: attempt.path,
    topology: options.topology,
    positionsM: options.positionsM,
  });
  const chordLengthM = distance(
    pointPosition(options.start, options.positionsM),
    pointPosition(options.end, options.positionsM),
  );
  const taut = options.taut
    ? tautSegments(attempt.path, options.topology, options.positionsM)
    : {
        segments: Object.freeze([Object.freeze({ kind: 'surface' as const, path: attempt.path })]),
        lengthM: evaluation.lengthM,
      };
  if (!taut) {
    return failed(
      startedAt,
      'taut-not-outside',
      seed.vertices.length,
      attempt,
      attempts,
      rings,
      steiner,
    );
  }
  return Object.freeze({
    ok: true as const,
    version: MESH_SURFACE_GEODESIC_V1,
    path: attempt.path,
    segments: taut.segments,
    chordLengthM,
    tautLengthM: taut.lengthM,
    geodesicLengthM: evaluation.lengthM,
    edgeDijkstraLengthM: seed.lengthM,
    stats: stats(startedAt, seed.vertices.length, attempt, attempts, rings, steiner),
  });
}
