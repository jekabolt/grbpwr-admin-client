export const MESH_PLANE_SECTION_PERIMETER_V1 = 'mesh-plane-section-perimeter/v1' as const;

export type MeshPlaneSectionVec3V1 = readonly [number, number, number];

export type MeshPlaneSectionSelectionV1 =
  | Readonly<{
      kind: 'nearest-seed';
      seedM: MeshPlaneSectionVec3V1;
    }>
  | Readonly<{
      kind: 'side';
      axis: MeshPlaneSectionVec3V1;
      side: 'negative' | 'positive';
    }>;

export interface MeshPlaneSectionPolicyV1 {
  readonly planeToleranceM: number;
  readonly weldToleranceM: number;
  readonly minimumLoopPerimeterM: number;
  readonly maximumTriangleCount: number;
  readonly maximumIntersectionSegmentCount: number;
}

export const DEFAULT_MESH_PLANE_SECTION_POLICY_V1 = Object.freeze({
  planeToleranceM: 1e-8,
  weldToleranceM: 1e-6,
  minimumLoopPerimeterM: 1e-5,
  maximumTriangleCount: 250_000,
  maximumIntersectionSegmentCount: 250_000,
} satisfies MeshPlaneSectionPolicyV1);

/** Where a section point lies on the mesh: edge `a < b` at `t`; a vertex hit is `{ a: v, b: v, t: 0 }`. */
export interface MeshPlaneSectionCrossingV1 {
  readonly a: number;
  readonly b: number;
  readonly t: number;
}

export interface MeshPlaneSectionLoopV1 {
  readonly pointsM: readonly MeshPlaneSectionVec3V1[];
  /** Present only when the call asked for `includeCrossings`; aligned with `pointsM`. */
  readonly crossings?: readonly MeshPlaneSectionCrossingV1[];
  readonly centroidM: MeshPlaneSectionVec3V1;
  readonly perimeterM: number;
}

export interface MeshPlaneSectionStatsV1 {
  readonly triangleCount: number;
  readonly intersectedTriangleCount: number;
  readonly segmentCount: number;
  readonly weldedNodeCount: number;
  readonly bucketCandidateComparisons: number;
}

const CLAIMS = Object.freeze({
  geometricPlaneLoopOnly: true as const,
  anatomicalTapePathEquivalent: false as const,
  measurementProtocolEquivalent: false as const,
  populationRepresentativenessClaimed: false as const,
  fitClaimEligible: false as const,
  runtimeCollisionEligible: false as const,
  collisionCandidateEligible: false as const,
});

export type MeshPlaneSectionFailureCodeV1 =
  | 'budget-exceeded'
  | 'coplanar-triangle'
  | 'input-invalid'
  | 'no-section'
  | 'open-or-branching-section'
  | 'selection-not-found';

export type MeshPlaneSectionResultV1 =
  | Readonly<{
      ok: true;
      version: typeof MESH_PLANE_SECTION_PERIMETER_V1;
      loops: readonly MeshPlaneSectionLoopV1[];
      selectedLoop: MeshPlaneSectionLoopV1 | null;
      stats: MeshPlaneSectionStatsV1;
      claims: typeof CLAIMS;
    }>
  | Readonly<{
      ok: false;
      version: typeof MESH_PLANE_SECTION_PERIMETER_V1;
      code: MeshPlaneSectionFailureCodeV1;
      errors: readonly string[];
      stats: MeshPlaneSectionStatsV1;
      claims: typeof CLAIMS;
    }>;

interface MutableStats {
  triangleCount: number;
  intersectedTriangleCount: number;
  segmentCount: number;
  weldedNodeCount: number;
  bucketCandidateComparisons: number;
}

interface SegmentPoints {
  readonly a: MeshPlaneSectionVec3V1;
  readonly b: MeshPlaneSectionVec3V1;
}

function frozenStats(stats: MutableStats): MeshPlaneSectionStatsV1 {
  return Object.freeze({ ...stats });
}

function failure(
  code: MeshPlaneSectionFailureCodeV1,
  errors: readonly string[],
  stats: MutableStats,
): MeshPlaneSectionResultV1 {
  return Object.freeze({
    ok: false as const,
    version: MESH_PLANE_SECTION_PERIMETER_V1,
    code,
    errors: Object.freeze([...new Set(errors)]),
    stats: frozenStats(stats),
    claims: CLAIMS,
  });
}

function finiteVec(value: MeshPlaneSectionVec3V1, label: string): void {
  if (value.length !== 3 || !value.every(Number.isFinite)) {
    throw new TypeError(`${label} must contain exactly three finite coordinates.`);
  }
}

function normalized(value: MeshPlaneSectionVec3V1, label: string): MeshPlaneSectionVec3V1 {
  finiteVec(value, label);
  const length = Math.hypot(value[0], value[1], value[2]);
  if (!Number.isFinite(length) || length <= Number.EPSILON) {
    throw new RangeError(`${label} must have non-zero finite length.`);
  }
  return [value[0] / length, value[1] / length, value[2] / length];
}

function snapshotPolicy(
  input: Partial<MeshPlaneSectionPolicyV1> | undefined,
): MeshPlaneSectionPolicyV1 {
  const policy = { ...DEFAULT_MESH_PLANE_SECTION_POLICY_V1, ...input };
  if (!Number.isFinite(policy.planeToleranceM) || policy.planeToleranceM <= 0) {
    throw new RangeError('planeToleranceM must be finite and positive.');
  }
  if (!Number.isFinite(policy.weldToleranceM) || policy.weldToleranceM <= 0) {
    throw new RangeError('weldToleranceM must be finite and positive.');
  }
  if (policy.weldToleranceM < policy.planeToleranceM) {
    throw new RangeError('weldToleranceM must be at least planeToleranceM.');
  }
  if (!Number.isFinite(policy.minimumLoopPerimeterM) || policy.minimumLoopPerimeterM <= 0) {
    throw new RangeError('minimumLoopPerimeterM must be finite and positive.');
  }
  for (const key of ['maximumTriangleCount', 'maximumIntersectionSegmentCount'] as const) {
    if (!Number.isSafeInteger(policy[key]) || policy[key] <= 0) {
      throw new RangeError(`${key} must be a positive safe integer.`);
    }
  }
  return Object.freeze(policy);
}

function pointAt(positionsM: Float32Array, vertex: number): MeshPlaneSectionVec3V1 {
  const offset = vertex * 3;
  return [positionsM[offset], positionsM[offset + 1], positionsM[offset + 2]];
}

function signedDistance(
  point: MeshPlaneSectionVec3V1,
  origin: MeshPlaneSectionVec3V1,
  normal: MeshPlaneSectionVec3V1,
): number {
  return (
    (point[0] - origin[0]) * normal[0] +
    (point[1] - origin[1]) * normal[1] +
    (point[2] - origin[2]) * normal[2]
  );
}

function interpolatePlaneEdge(
  a: MeshPlaneSectionVec3V1,
  b: MeshPlaneSectionVec3V1,
  distanceA: number,
  distanceB: number,
): MeshPlaneSectionVec3V1 {
  const denominator = distanceA - distanceB;
  const t = denominator === 0 ? 0.5 : distanceA / denominator;
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

function distanceSquared(a: MeshPlaneSectionVec3V1, b: MeshPlaneSectionVec3V1): number {
  const x = a[0] - b[0];
  const y = a[1] - b[1];
  const z = a[2] - b[2];
  return x * x + y * y + z * z;
}

/**
 * Half-open triangle/plane policy:
 * - a fully coplanar triangle is rejected because it has no unique perimeter contribution;
 * - a coplanar edge is emitted once per incident triangle and deduplicated after welding;
 * - a lone on-plane vertex is emitted only when the opposite edge crosses the plane;
 * - tangent point contacts contribute no segment.
 */
function intersectTriangle(
  points: readonly [MeshPlaneSectionVec3V1, MeshPlaneSectionVec3V1, MeshPlaneSectionVec3V1],
  distances: readonly [number, number, number],
  tolerance: number,
): SegmentPoints | 'coplanar' | null {
  const onPlane = distances.map((value) => Math.abs(value) <= tolerance);
  const count = onPlane.filter(Boolean).length;
  if (count === 3) return 'coplanar';
  if (count === 2) {
    const indices = onPlane.flatMap((value, index) => (value ? [index] : []));
    return { a: points[indices[0]], b: points[indices[1]] };
  }
  if (count === 1) {
    const onIndex = onPlane.findIndex(Boolean);
    const others = [0, 1, 2].filter((index) => index !== onIndex);
    if (distances[others[0]] * distances[others[1]] >= 0) return null;
    return {
      a: points[onIndex],
      b: interpolatePlaneEdge(
        points[others[0]],
        points[others[1]],
        distances[others[0]],
        distances[others[1]],
      ),
    };
  }
  const positive = distances.some((value) => value > tolerance);
  const negative = distances.some((value) => value < -tolerance);
  if (!positive || !negative) return null;
  const intersections: MeshPlaneSectionVec3V1[] = [];
  for (const [aIndex, bIndex] of [
    [0, 1],
    [1, 2],
    [2, 0],
  ] as const) {
    if (distances[aIndex] * distances[bIndex] >= 0) continue;
    intersections.push(
      interpolatePlaneEdge(points[aIndex], points[bIndex], distances[aIndex], distances[bIndex]),
    );
  }
  if (intersections.length !== 2) return null;
  return { a: intersections[0], b: intersections[1] };
}

function edgeCrossing(
  vertexA: number,
  vertexB: number,
  distanceA: number,
  distanceB: number,
): MeshPlaneSectionCrossingV1 {
  const denominator = distanceA - distanceB;
  const t = denominator === 0 ? 0.5 : distanceA / denominator;
  return vertexA < vertexB
    ? Object.freeze({ a: vertexA, b: vertexB, t })
    : Object.freeze({ a: vertexB, b: vertexA, t: 1 - t });
}

function vertexCrossing(vertex: number): MeshPlaneSectionCrossingV1 {
  return Object.freeze({ a: vertex, b: vertex, t: 0 });
}

/**
 * Opt-in companion of `intersectTriangle`: the same branches in the same order, returning where the
 * segment's `a` and `b` lie on the mesh. Called only for a triangle `intersectTriangle` accepted.
 */
function intersectTriangleCrossings(
  vertices: readonly [number, number, number],
  distances: readonly [number, number, number],
  tolerance: number,
): readonly [MeshPlaneSectionCrossingV1, MeshPlaneSectionCrossingV1] {
  const onPlane = distances.map((value) => Math.abs(value) <= tolerance);
  const count = onPlane.filter(Boolean).length;
  if (count === 2) {
    const indices = onPlane.flatMap((value, index) => (value ? [index] : []));
    return [vertexCrossing(vertices[indices[0]]), vertexCrossing(vertices[indices[1]])];
  }
  if (count === 1) {
    const onIndex = onPlane.findIndex(Boolean);
    const others = [0, 1, 2].filter((index) => index !== onIndex);
    return [
      vertexCrossing(vertices[onIndex]),
      edgeCrossing(
        vertices[others[0]],
        vertices[others[1]],
        distances[others[0]],
        distances[others[1]],
      ),
    ];
  }
  const crossings: MeshPlaneSectionCrossingV1[] = [];
  for (const [aIndex, bIndex] of [
    [0, 1],
    [1, 2],
    [2, 0],
  ] as const) {
    if (distances[aIndex] * distances[bIndex] >= 0) continue;
    crossings.push(
      edgeCrossing(vertices[aIndex], vertices[bIndex], distances[aIndex], distances[bIndex]),
    );
  }
  return [crossings[0], crossings[1]];
}

class SpatialWelder {
  readonly points: MeshPlaneSectionVec3V1[] = [];
  readonly buckets = new Map<string, number[]>();
  comparisons = 0;

  constructor(readonly tolerance: number) {}

  private cell(point: MeshPlaneSectionVec3V1): readonly [number, number, number] {
    return [
      Math.floor(point[0] / this.tolerance),
      Math.floor(point[1] / this.tolerance),
      Math.floor(point[2] / this.tolerance),
    ];
  }

  private key(x: number, y: number, z: number): string {
    return `${x}:${y}:${z}`;
  }

  add(point: MeshPlaneSectionVec3V1): number {
    const cell = this.cell(point);
    const toleranceSquared = this.tolerance * this.tolerance;
    let match = Number.POSITIVE_INFINITY;
    for (let dx = -1; dx <= 1; dx += 1) {
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dz = -1; dz <= 1; dz += 1) {
          for (const candidate of this.buckets.get(
            this.key(cell[0] + dx, cell[1] + dy, cell[2] + dz),
          ) ?? []) {
            this.comparisons += 1;
            if (distanceSquared(point, this.points[candidate]) <= toleranceSquared) {
              match = Math.min(match, candidate);
            }
          }
        }
      }
    }
    if (Number.isFinite(match)) return match;
    const index = this.points.length;
    this.points.push(Object.freeze([...point]) as unknown as MeshPlaneSectionVec3V1);
    const key = this.key(cell[0], cell[1], cell[2]);
    const bucket = this.buckets.get(key) ?? [];
    bucket.push(index);
    this.buckets.set(key, bucket);
    return index;
  }
}

function loopFromNodeIds(
  nodeIds: readonly number[],
  points: readonly MeshPlaneSectionVec3V1[],
  crossings: readonly MeshPlaneSectionCrossingV1[] | null,
): MeshPlaneSectionLoopV1 {
  const loopPoints = nodeIds.map((node) => points[node]);
  let perimeterM = 0;
  const centroid = [0, 0, 0];
  loopPoints.forEach((point, index) => {
    const next = loopPoints[(index + 1) % loopPoints.length];
    perimeterM += Math.sqrt(distanceSquared(point, next));
    centroid[0] += point[0];
    centroid[1] += point[1];
    centroid[2] += point[2];
  });
  const centroidM = Object.freeze(
    centroid.map((value) => value / loopPoints.length),
  ) as unknown as MeshPlaneSectionVec3V1;
  if (crossings) {
    return Object.freeze({
      pointsM: Object.freeze(loopPoints),
      crossings: Object.freeze(nodeIds.map((node) => crossings[node])),
      centroidM,
      perimeterM,
    });
  }
  return Object.freeze({
    pointsM: Object.freeze(loopPoints),
    centroidM,
    perimeterM,
  });
}

function selectLoop(
  loops: readonly MeshPlaneSectionLoopV1[],
  selection: MeshPlaneSectionSelectionV1 | undefined,
  planeOriginM: MeshPlaneSectionVec3V1,
): MeshPlaneSectionLoopV1 | null | undefined {
  if (!selection) return null;
  if (selection.kind === 'nearest-seed') {
    finiteVec(selection.seedM, 'selection.seedM');
    return loops.reduce((best, loop) =>
      distanceSquared(loop.centroidM, selection.seedM) <
      distanceSquared(best.centroidM, selection.seedM)
        ? loop
        : best,
    );
  }
  const axis = normalized(selection.axis, 'selection.axis');
  const sign = selection.side === 'positive' ? 1 : -1;
  const candidates = loops
    .map((loop) => ({
      loop,
      projection:
        ((loop.centroidM[0] - planeOriginM[0]) * axis[0] +
          (loop.centroidM[1] - planeOriginM[1]) * axis[1] +
          (loop.centroidM[2] - planeOriginM[2]) * axis[2]) *
        sign,
    }))
    .filter(({ projection }) => projection > 0)
    .sort((left, right) => right.projection - left.projection);
  return candidates[0]?.loop;
}

function positionsAreFinite(positionsM: Float32Array): boolean {
  for (let offset = 0; offset < positionsM.length; offset += 1) {
    if (!Number.isFinite(positionsM[offset])) return false;
  }
  return true;
}

function measureMeshPlaneSectionPerimetersInternalV1(
  options: {
    readonly positionsM: Float32Array;
    readonly triangleIndices: Uint16Array | Uint32Array;
    readonly planeOriginM: MeshPlaneSectionVec3V1;
    readonly planeNormal: MeshPlaneSectionVec3V1;
    readonly selection?: MeshPlaneSectionSelectionV1;
    readonly policy?: Partial<MeshPlaneSectionPolicyV1>;
    readonly includeCrossings?: boolean;
  },
  preparedVertexCount?: number,
): MeshPlaneSectionResultV1 {
  const stats: MutableStats = {
    triangleCount: 0,
    intersectedTriangleCount: 0,
    segmentCount: 0,
    weldedNodeCount: 0,
    bucketCandidateComparisons: 0,
  };
  let policy: MeshPlaneSectionPolicyV1;
  let normal: MeshPlaneSectionVec3V1;
  try {
    policy = snapshotPolicy(options.policy);
    finiteVec(options.planeOriginM, 'planeOriginM');
    normal = normalized(options.planeNormal, 'planeNormal');
    if (
      !(options.positionsM instanceof Float32Array) ||
      options.positionsM.length === 0 ||
      options.positionsM.length % 3 !== 0
    ) {
      throw new TypeError('positionsM must be a non-empty XYZ Float32Array.');
    }
    if (!positionsAreFinite(options.positionsM)) {
      throw new TypeError('positionsM contains a non-finite coordinate.');
    }
    if (
      !(options.triangleIndices instanceof Uint16Array) &&
      !(options.triangleIndices instanceof Uint32Array)
    ) {
      throw new TypeError('triangleIndices must be Uint16Array or Uint32Array.');
    }
    if (options.triangleIndices.length === 0 || options.triangleIndices.length % 3 !== 0) {
      throw new RangeError('triangleIndices must contain complete triangles.');
    }
    stats.triangleCount = options.triangleIndices.length / 3;
    if (stats.triangleCount > policy.maximumTriangleCount) {
      return failure(
        'budget-exceeded',
        ['Triangle count exceeds the bounded section budget.'],
        stats,
      );
    }
    const vertexCount = options.positionsM.length / 3;
    if (preparedVertexCount !== undefined && preparedVertexCount !== vertexCount) {
      throw new RangeError('Prepared section topology does not match positions.');
    }
    if (preparedVertexCount === undefined) {
      for (const vertex of options.triangleIndices) {
        if (vertex >= vertexCount)
          throw new RangeError('triangleIndices contains an out-of-range vertex.');
      }
    }
  } catch (reason: unknown) {
    return failure(
      'input-invalid',
      [reason instanceof Error ? reason.message : String(reason)],
      stats,
    );
  }

  const welder = new SpatialWelder(policy.weldToleranceM);
  const nodeCrossings: MeshPlaneSectionCrossingV1[] | null = options.includeCrossings ? [] : null;
  const segmentKeys = new Set<string>();
  const segments: [number, number][] = [];
  for (let triangle = 0; triangle < stats.triangleCount; triangle += 1) {
    const offset = triangle * 3;
    const points = [
      pointAt(options.positionsM, options.triangleIndices[offset]),
      pointAt(options.positionsM, options.triangleIndices[offset + 1]),
      pointAt(options.positionsM, options.triangleIndices[offset + 2]),
    ] as const;
    const distances = points.map((point) =>
      signedDistance(point, options.planeOriginM, normal),
    ) as unknown as readonly [number, number, number];
    const intersection = intersectTriangle(points, distances, policy.planeToleranceM);
    if (intersection === 'coplanar') {
      stats.weldedNodeCount = welder.points.length;
      stats.bucketCandidateComparisons = welder.comparisons;
      return failure(
        'coplanar-triangle',
        [`Triangle ${triangle} is coplanar with the section plane.`],
        stats,
      );
    }
    if (!intersection) continue;
    stats.intersectedTriangleCount += 1;
    let a: number;
    let b: number;
    if (nodeCrossings) {
      const [crossingA, crossingB] = intersectTriangleCrossings(
        [
          options.triangleIndices[offset],
          options.triangleIndices[offset + 1],
          options.triangleIndices[offset + 2],
        ],
        distances,
        policy.planeToleranceM,
      );
      a = welder.add(intersection.a);
      if (a === nodeCrossings.length) nodeCrossings.push(crossingA);
      b = welder.add(intersection.b);
      if (b === nodeCrossings.length) nodeCrossings.push(crossingB);
    } else {
      a = welder.add(intersection.a);
      b = welder.add(intersection.b);
    }
    if (a === b) continue;
    const key = a < b ? `${a}:${b}` : `${b}:${a}`;
    if (segmentKeys.has(key)) continue;
    segmentKeys.add(key);
    segments.push(a < b ? [a, b] : [b, a]);
    if (segments.length > policy.maximumIntersectionSegmentCount) {
      stats.segmentCount = segments.length;
      stats.weldedNodeCount = welder.points.length;
      stats.bucketCandidateComparisons = welder.comparisons;
      return failure(
        'budget-exceeded',
        ['Intersection segment count exceeds the bounded section budget.'],
        stats,
      );
    }
  }

  stats.segmentCount = segments.length;
  stats.weldedNodeCount = welder.points.length;
  stats.bucketCandidateComparisons = welder.comparisons;
  if (segments.length === 0)
    return failure('no-section', ['The plane does not cut the mesh.'], stats);

  const adjacency = new Map<number, number[]>();
  for (const [a, b] of segments) {
    const fromA = adjacency.get(a) ?? [];
    fromA.push(b);
    adjacency.set(a, fromA);
    const fromB = adjacency.get(b) ?? [];
    fromB.push(a);
    adjacency.set(b, fromB);
  }
  for (const [node, neighbours] of adjacency) {
    neighbours.sort((left, right) => left - right);
    if (neighbours.length !== 2) {
      return failure(
        'open-or-branching-section',
        [`Section node ${node} has degree ${neighbours.length}; expected exactly two.`],
        stats,
      );
    }
  }

  const visited = new Set<number>();
  const loops: MeshPlaneSectionLoopV1[] = [];
  for (const start of [...adjacency.keys()].sort((left, right) => left - right)) {
    if (visited.has(start)) continue;
    const nodeIds: number[] = [];
    let previous = -1;
    let current = start;
    for (let step = 0; step <= adjacency.size; step += 1) {
      if (current === start && nodeIds.length > 0) break;
      if (visited.has(current)) {
        return failure(
          'open-or-branching-section',
          ['A section component revisits a node before closing its loop.'],
          stats,
        );
      }
      visited.add(current);
      nodeIds.push(current);
      const neighbours = adjacency.get(current)!;
      const next = neighbours[0] === previous ? neighbours[1] : neighbours[0];
      previous = current;
      current = next;
    }
    if (current !== start || nodeIds.length < 3) {
      return failure(
        'open-or-branching-section',
        ['A section component did not close into a loop of at least three nodes.'],
        stats,
      );
    }
    const loop = loopFromNodeIds(nodeIds, welder.points, nodeCrossings);
    if (!Number.isFinite(loop.perimeterM) || loop.perimeterM < policy.minimumLoopPerimeterM) {
      return failure(
        'open-or-branching-section',
        ['A section loop is degenerate or below the minimum perimeter.'],
        stats,
      );
    }
    loops.push(loop);
  }

  loops.sort(
    (left, right) =>
      left.centroidM[0] - right.centroidM[0] ||
      left.centroidM[1] - right.centroidM[1] ||
      left.centroidM[2] - right.centroidM[2] ||
      left.perimeterM - right.perimeterM,
  );
  let selectedLoop: MeshPlaneSectionLoopV1 | null | undefined;
  try {
    selectedLoop = selectLoop(loops, options.selection, options.planeOriginM);
  } catch (reason: unknown) {
    return failure(
      'input-invalid',
      [reason instanceof Error ? reason.message : String(reason)],
      stats,
    );
  }
  if (selectedLoop === undefined) {
    return failure('selection-not-found', ['No section loop matches the requested side.'], stats);
  }
  return Object.freeze({
    ok: true as const,
    version: MESH_PLANE_SECTION_PERIMETER_V1,
    loops: Object.freeze(loops),
    selectedLoop,
    stats: frozenStats(stats),
    claims: CLAIMS,
  });
}

export function measureMeshPlaneSectionPerimetersV1(options: {
  readonly positionsM: Float32Array;
  readonly triangleIndices: Uint16Array | Uint32Array;
  readonly planeOriginM: MeshPlaneSectionVec3V1;
  readonly planeNormal: MeshPlaneSectionVec3V1;
  readonly selection?: MeshPlaneSectionSelectionV1;
  readonly policy?: Partial<MeshPlaneSectionPolicyV1>;
  /** Opt-in: attach `crossings` to every loop. Off by default; the default path allocates nothing extra. */
  readonly includeCrossings?: boolean;
}): MeshPlaneSectionResultV1 {
  return measureMeshPlaneSectionPerimetersInternalV1(options);
}

export interface PreparedMeshPlaneSectionTopologyResearchV1 {
  readonly vertexCount: number;
  readonly triangleCount: number;
}

const preparedTopologyIndices = new WeakMap<
  PreparedMeshPlaneSectionTopologyResearchV1,
  Uint32Array
>();

/** Research-only immutable topology preflight; geometric section semantics remain in the V1 core. */
export function prepareMeshPlaneSectionTopologyResearchV1(options: {
  readonly vertexCount: number;
  readonly triangleIndices: Uint16Array | Uint32Array;
}): PreparedMeshPlaneSectionTopologyResearchV1 {
  if (!Number.isSafeInteger(options.vertexCount) || options.vertexCount <= 0) {
    throw new RangeError('Prepared section vertexCount must be a positive safe integer.');
  }
  if (
    !(options.triangleIndices instanceof Uint16Array) &&
    !(options.triangleIndices instanceof Uint32Array)
  ) {
    throw new TypeError('Prepared section indices must be Uint16Array or Uint32Array.');
  }
  if (options.triangleIndices.length === 0 || options.triangleIndices.length % 3 !== 0) {
    throw new RangeError('Prepared section indices must contain complete triangles.');
  }
  const triangleIndices = Uint32Array.from(options.triangleIndices);
  for (const vertex of triangleIndices) {
    if (vertex >= options.vertexCount) {
      throw new RangeError('Prepared section indices contain an out-of-range vertex.');
    }
  }
  const prepared = Object.freeze({
    vertexCount: options.vertexCount,
    triangleCount: triangleIndices.length / 3,
  });
  preparedTopologyIndices.set(prepared, triangleIndices);
  return prepared;
}

export function measurePreparedMeshPlaneSectionPerimetersResearchV1(options: {
  readonly topology: PreparedMeshPlaneSectionTopologyResearchV1;
  readonly positionsM: Float32Array;
  readonly planeOriginM: MeshPlaneSectionVec3V1;
  readonly planeNormal: MeshPlaneSectionVec3V1;
  readonly selection?: MeshPlaneSectionSelectionV1;
  readonly policy?: Partial<MeshPlaneSectionPolicyV1>;
}): MeshPlaneSectionResultV1 {
  const triangleIndices = preparedTopologyIndices.get(options.topology);
  if (!triangleIndices) {
    throw new TypeError('Prepared section topology was not created by the research preflight.');
  }
  return measureMeshPlaneSectionPerimetersInternalV1(
    {
      positionsM: options.positionsM,
      triangleIndices,
      planeOriginM: options.planeOriginM,
      planeNormal: options.planeNormal,
      selection: options.selection,
      policy: options.policy,
    },
    options.topology.vertexCount,
  );
}
