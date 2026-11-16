import {
  validateMeasurementSurfaceSelfIntersectionV1,
  type MeasurementSurfaceIntersectionKindV1,
  type MeasurementSurfaceSelfIntersectionPolicyV1,
  type MeasurementSurfaceSelfIntersectionReportV1,
} from './measurement-surface-self-intersection-v1';

export const MEASUREMENT_OPEN_REFERENCE_DISPLAY_QUALITY_GATE_V1 =
  'measurement-open-reference-display-quality-gate/v1' as const;

export interface MeasurementOpenReferenceDisplayQualityPolicyV1 {
  readonly maximumVertexCount: number;
  readonly maximumTriangleCount: number;
  readonly minimumEdgeStretch: number;
  readonly maximumEdgeStretch: number;
  readonly minimumTriangleAreaRatio: number;
  readonly maximumTriangleAreaRatio: number;
  readonly minimumTriangleAspectRetention: number;
  readonly maximumFlippedTriangleCount: number;
}

export const DEFAULT_MEASUREMENT_OPEN_REFERENCE_DISPLAY_QUALITY_POLICY_V1 = Object.freeze({
  maximumVertexCount: 20_000,
  maximumTriangleCount: 30_000,
  minimumEdgeStretch: 0.45,
  maximumEdgeStretch: 2.5,
  minimumTriangleAreaRatio: 0.2,
  maximumTriangleAreaRatio: 4,
  minimumTriangleAspectRetention: 0.4,
  maximumFlippedTriangleCount: 0,
} satisfies MeasurementOpenReferenceDisplayQualityPolicyV1);

export type MeasurementOpenReferenceDisplayQualityFailureCodeV1 =
  | 'budget-exceeded'
  | 'edge-compression-unsafe'
  | 'edge-stretch-unsafe'
  | 'input-invalid'
  | 'new-self-intersection'
  | 'self-intersection-evaluation-failed'
  | 'triangle-area-compression-unsafe'
  | 'triangle-area-stretch-unsafe'
  | 'triangle-aspect-unsafe'
  | 'triangle-orientation-unsafe';

export interface MeasurementOpenReferenceDisplayQualityMetricsV1 {
  readonly vertexCount: number;
  readonly triangleCount: number;
  readonly uniqueEdgeCount: number;
  readonly minimumEdgeStretch: number;
  readonly maximumEdgeStretch: number;
  readonly minimumTriangleAreaRatio: number;
  readonly maximumTriangleAreaRatio: number;
  readonly minimumTriangleAspectRetention: number;
  readonly minimumOutputTriangleAspectQuality: number;
  readonly flippedTriangleCount: number;
}

export interface MeasurementOpenReferenceDisplayQualityGateResultV1 {
  readonly version: typeof MEASUREMENT_OPEN_REFERENCE_DISPLAY_QUALITY_GATE_V1;
  readonly safe: boolean;
  readonly reasons: readonly MeasurementOpenReferenceDisplayQualityFailureCodeV1[];
  readonly metrics: MeasurementOpenReferenceDisplayQualityMetricsV1;
  readonly policy: MeasurementOpenReferenceDisplayQualityPolicyV1;
  readonly claims: {
    readonly localGeometryQualityOnly: boolean;
    readonly selfIntersectionEvaluated: boolean;
    readonly anatomicalAccuracyClaimed: false;
    readonly fitClaimEligible: false;
    readonly runtimeCollisionEligible: false;
  };
}

const CLAIMS = Object.freeze({
  localGeometryQualityOnly: true as const,
  selfIntersectionEvaluated: false as const,
  anatomicalAccuracyClaimed: false as const,
  fitClaimEligible: false as const,
  runtimeCollisionEligible: false as const,
});

const SELF_INTERSECTION_CLAIMS = Object.freeze({
  localGeometryQualityOnly: false as const,
  selfIntersectionEvaluated: true as const,
  anatomicalAccuracyClaimed: false as const,
  fitClaimEligible: false as const,
  runtimeCollisionEligible: false as const,
});

const FAILED_SELF_INTERSECTION_CLAIMS = Object.freeze({
  ...SELF_INTERSECTION_CLAIMS,
  selfIntersectionEvaluated: false as const,
});

/**
 * Converts an infrastructure failure around the whole-body validator into the same typed,
 * fail-closed result as an in-validator exception. The local gate still runs so an already unsafe
 * candidate keeps its more specific local reasons.
 */
export function measurementOpenReferenceDisplayQualitySelfIntersectionFailureV1(options: {
  readonly uniformPositionsM: Float32Array;
  readonly personalizedPositionsM: Float32Array;
  readonly triangleIndices: Uint16Array | Uint32Array;
  readonly policy?: Partial<MeasurementOpenReferenceDisplayQualityPolicyV1>;
}): MeasurementOpenReferenceDisplayQualityGateResultV1 {
  const local = evaluateMeasurementOpenReferenceDisplayQualityV1(options);
  if (!local.safe) return local;
  return Object.freeze({
    ...local,
    safe: false,
    reasons: Object.freeze(['self-intersection-evaluation-failed'] as const),
    claims: FAILED_SELF_INTERSECTION_CLAIMS,
  });
}

export interface MeasurementOpenReferenceSelfIntersectionDeltaV1 {
  readonly safe: boolean;
  readonly admittedBasisIntersectionCount: number;
  readonly candidateIntersectionCount: number;
  readonly admittedInheritedPairCount: number;
  readonly newPairCount: number;
  readonly escalatedToProperCrossingCount: number;
  readonly admittedBasisReport: MeasurementSurfaceSelfIntersectionReportV1;
  readonly candidateReport: MeasurementSurfaceSelfIntersectionReportV1;
}

const admittedBasisReportCache = new WeakMap<
  Float32Array,
  Map<string, MeasurementSurfaceSelfIntersectionReportV1>
>();
const admittedBasisRevisionReportCache = new Map<
  string,
  MeasurementSurfaceSelfIntersectionReportV1
>();
const MAX_ADMITTED_BASIS_REVISION_CACHE_ENTRIES = 8;

function topologySignature(indices: Uint32Array): string {
  let hash = 2_166_136_261;
  for (const vertex of indices) {
    hash ^= vertex;
    hash = Math.imul(hash, 16_777_619);
  }
  return `${indices.length}:${hash >>> 0}`;
}

function uniformlyScaledBasisGeometrySignature(positions: Float32Array): string {
  let minimumY = Number.POSITIVE_INFINITY;
  let maximumY = Number.NEGATIVE_INFINITY;
  for (let offset = 1; offset < positions.length; offset += 3) {
    minimumY = Math.min(minimumY, positions[offset]);
    maximumY = Math.max(maximumY, positions[offset]);
  }
  const height = maximumY - minimumY;
  if (!Number.isFinite(height) || height <= 0) return 'invalid';
  let hash = 2_166_136_261;
  for (let offset = 0; offset < positions.length; offset += 3) {
    for (const normalized of [
      positions[offset] / height,
      (positions[offset + 1] - minimumY) / height,
      positions[offset + 2] / height,
    ]) {
      hash ^= Math.round(normalized * 10_000_000);
      hash = Math.imul(hash, 16_777_619);
    }
  }
  return `${positions.length}:${hash >>> 0}`;
}

function admittedBasisReport(
  positions: Float32Array,
  indices: Uint32Array,
  policy: MeasurementSurfaceSelfIntersectionPolicyV1 | undefined,
  admittedBasisRevision: string | undefined,
): MeasurementSurfaceSelfIntersectionReportV1 {
  if (policy !== undefined) {
    return validateMeasurementSurfaceSelfIntersectionV1(positions, indices, policy);
  }
  const signature = `${topologySignature(indices)}:${uniformlyScaledBasisGeometrySignature(positions)}`;
  const revisionCacheKey = admittedBasisRevision
    ? `${admittedBasisRevision}:${signature}`
    : undefined;
  const revisionCached = revisionCacheKey
    ? admittedBasisRevisionReportCache.get(revisionCacheKey)
    : undefined;
  if (revisionCached) return revisionCached;
  const cachedByTopology = admittedBasisReportCache.get(positions);
  const cached = cachedByTopology?.get(signature);
  if (cached) return cached;
  const report = validateMeasurementSurfaceSelfIntersectionV1(positions, indices);
  const next = cachedByTopology ?? new Map<string, MeasurementSurfaceSelfIntersectionReportV1>();
  next.set(signature, report);
  if (!cachedByTopology) admittedBasisReportCache.set(positions, next);
  if (revisionCacheKey) {
    if (admittedBasisRevisionReportCache.size >= MAX_ADMITTED_BASIS_REVISION_CACHE_ENTRIES) {
      const oldest = admittedBasisRevisionReportCache.keys().next().value;
      if (oldest !== undefined) admittedBasisRevisionReportCache.delete(oldest);
    }
    admittedBasisRevisionReportCache.set(revisionCacheKey, report);
  }
  return report;
}

function pairKey(triangleA: number, triangleB: number): string {
  return `${triangleA}:${triangleB}`;
}

function isProperCrossingEscalation(
  admittedKind: MeasurementSurfaceIntersectionKindV1,
  candidateKind: MeasurementSurfaceIntersectionKindV1,
): boolean {
  return candidateKind === 'proper-crossing' && admittedKind !== 'proper-crossing';
}

/**
 * Compares whole-body intersections against the exact admitted basis topology. Existing basis
 * contacts are inherited, including harmless classifier movement between touching and coplanar
 * overlap. A new triangle pair or an inherited pair escalating to a proper crossing is unsafe.
 */
export function evaluateMeasurementOpenReferenceSelfIntersectionDeltaV1(options: {
  readonly admittedBasisPositionsM: Float32Array;
  readonly candidatePositionsM: Float32Array;
  readonly triangleIndices: Uint16Array | Uint32Array;
  readonly policy?: MeasurementSurfaceSelfIntersectionPolicyV1;
  /** Exact authenticated basis revision; uniform height scaling preserves its pair topology. */
  readonly admittedBasisRevision?: string;
}): MeasurementOpenReferenceSelfIntersectionDeltaV1 {
  const indices =
    options.triangleIndices instanceof Uint32Array
      ? options.triangleIndices
      : Uint32Array.from(options.triangleIndices);
  const basisReport = admittedBasisReport(
    options.admittedBasisPositionsM,
    indices,
    options.policy,
    options.admittedBasisRevision,
  );
  const candidateReport =
    options.candidatePositionsM === options.admittedBasisPositionsM
      ? basisReport
      : validateMeasurementSurfaceSelfIntersectionV1(
          options.candidatePositionsM,
          indices,
          options.policy,
        );
  const admittedByPair = new Map(
    basisReport.intersections.map(({ triangleA, triangleB, kind }) => [
      pairKey(triangleA, triangleB),
      kind,
    ]),
  );
  let admittedInheritedPairCount = 0;
  let newPairCount = 0;
  let escalatedToProperCrossingCount = 0;
  for (const { triangleA, triangleB, kind } of candidateReport.intersections) {
    const admittedKind = admittedByPair.get(pairKey(triangleA, triangleB));
    if (admittedKind === undefined) {
      newPairCount += 1;
    } else if (isProperCrossingEscalation(admittedKind, kind)) {
      escalatedToProperCrossingCount += 1;
    } else {
      admittedInheritedPairCount += 1;
    }
  }
  return Object.freeze({
    safe: newPairCount === 0 && escalatedToProperCrossingCount === 0,
    admittedBasisIntersectionCount: basisReport.intersectionCount,
    candidateIntersectionCount: candidateReport.intersectionCount,
    admittedInheritedPairCount,
    newPairCount,
    escalatedToProperCrossingCount,
    admittedBasisReport: basisReport,
    candidateReport,
  });
}

type Point = readonly [number, number, number];

function finitePositive(value: number, label: string): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError(`${label} must be finite and positive.`);
  }
}

function snapshotPolicy(
  input: Partial<MeasurementOpenReferenceDisplayQualityPolicyV1> | undefined,
): MeasurementOpenReferenceDisplayQualityPolicyV1 {
  const value = { ...DEFAULT_MEASUREMENT_OPEN_REFERENCE_DISPLAY_QUALITY_POLICY_V1, ...input };
  for (const key of ['maximumVertexCount', 'maximumTriangleCount'] as const) {
    if (!Number.isSafeInteger(value[key]) || value[key] <= 0) {
      throw new RangeError(`${key} must be a positive safe integer.`);
    }
  }
  finitePositive(value.minimumEdgeStretch, 'minimumEdgeStretch');
  finitePositive(value.maximumEdgeStretch, 'maximumEdgeStretch');
  finitePositive(value.minimumTriangleAreaRatio, 'minimumTriangleAreaRatio');
  finitePositive(value.maximumTriangleAreaRatio, 'maximumTriangleAreaRatio');
  finitePositive(value.minimumTriangleAspectRetention, 'minimumTriangleAspectRetention');
  if (
    value.minimumEdgeStretch > 1 ||
    value.maximumEdgeStretch < 1 ||
    value.minimumTriangleAreaRatio > 1 ||
    value.maximumTriangleAreaRatio < 1 ||
    value.minimumTriangleAspectRetention > 1
  ) {
    throw new RangeError('Quality policy bounds must contain the uniform baseline value 1.');
  }
  if (
    !Number.isSafeInteger(value.maximumFlippedTriangleCount) ||
    value.maximumFlippedTriangleCount < 0
  ) {
    throw new RangeError('maximumFlippedTriangleCount must be a non-negative safe integer.');
  }
  return Object.freeze(value);
}

function point(positions: Float32Array, vertex: number): Point {
  const offset = vertex * 3;
  return [positions[offset], positions[offset + 1], positions[offset + 2]];
}

function subtract(left: Point, right: Point): Point {
  return [left[0] - right[0], left[1] - right[1], left[2] - right[2]];
}

function dot(left: Point, right: Point): number {
  return left[0] * right[0] + left[1] * right[1] + left[2] * right[2];
}

function cross(left: Point, right: Point): Point {
  return [
    left[1] * right[2] - left[2] * right[1],
    left[2] * right[0] - left[0] * right[2],
    left[0] * right[1] - left[1] * right[0],
  ];
}

function length(value: Point): number {
  return Math.hypot(value[0], value[1], value[2]);
}

function aspectQuality(a: Point, b: Point, c: Point, doubleArea: number): number {
  const ab = length(subtract(a, b));
  const bc = length(subtract(b, c));
  const ca = length(subtract(c, a));
  const squaredSum = ab * ab + bc * bc + ca * ca;
  return squaredSum === 0 ? 0 : (2 * Math.sqrt(3) * doubleArea) / squaredSum;
}

function emptyMetrics(vertexCount: number, triangleCount: number) {
  return {
    vertexCount,
    triangleCount,
    uniqueEdgeCount: 0,
    minimumEdgeStretch: 0,
    maximumEdgeStretch: 0,
    minimumTriangleAreaRatio: 0,
    maximumTriangleAreaRatio: 0,
    minimumTriangleAspectRetention: 0,
    minimumOutputTriangleAspectQuality: 0,
    flippedTriangleCount: 0,
  } satisfies MeasurementOpenReferenceDisplayQualityMetricsV1;
}

function result(
  reasons: readonly MeasurementOpenReferenceDisplayQualityFailureCodeV1[],
  metrics: MeasurementOpenReferenceDisplayQualityMetricsV1,
  policy: MeasurementOpenReferenceDisplayQualityPolicyV1,
): MeasurementOpenReferenceDisplayQualityGateResultV1 {
  return Object.freeze({
    version: MEASUREMENT_OPEN_REFERENCE_DISPLAY_QUALITY_GATE_V1,
    safe: reasons.length === 0,
    reasons: Object.freeze([...new Set(reasons)]),
    metrics: Object.freeze({ ...metrics }),
    policy,
    claims: CLAIMS,
  });
}

/**
 * Compares a personalized mesh with the same topology's uniformly height-scaled CC0 basis.
 * This is a bounded local distortion guard only; it deliberately does not claim to detect
 * self-intersections, anatomical correctness, garment fit, or collision suitability.
 */
export function evaluateMeasurementOpenReferenceDisplayQualityV1(options: {
  readonly uniformPositionsM: Float32Array;
  readonly personalizedPositionsM: Float32Array;
  readonly triangleIndices: Uint16Array | Uint32Array;
  readonly policy?: Partial<MeasurementOpenReferenceDisplayQualityPolicyV1>;
}): MeasurementOpenReferenceDisplayQualityGateResultV1 {
  let policy: MeasurementOpenReferenceDisplayQualityPolicyV1;
  try {
    policy = snapshotPolicy(options.policy);
  } catch {
    policy = DEFAULT_MEASUREMENT_OPEN_REFERENCE_DISPLAY_QUALITY_POLICY_V1;
    return result(['input-invalid'], emptyMetrics(0, 0), policy);
  }
  const vertexCount = options.uniformPositionsM.length / 3;
  const triangleCount = options.triangleIndices.length / 3;
  if (
    !(options.uniformPositionsM instanceof Float32Array) ||
    !(options.personalizedPositionsM instanceof Float32Array) ||
    (!(options.triangleIndices instanceof Uint16Array) &&
      !(options.triangleIndices instanceof Uint32Array)) ||
    options.uniformPositionsM.length === 0 ||
    options.uniformPositionsM.length % 3 !== 0 ||
    options.personalizedPositionsM.length !== options.uniformPositionsM.length ||
    options.triangleIndices.length === 0 ||
    options.triangleIndices.length % 3 !== 0 ||
    !options.uniformPositionsM.every(Number.isFinite) ||
    !options.personalizedPositionsM.every(Number.isFinite)
  ) {
    return result(['input-invalid'], emptyMetrics(vertexCount, triangleCount), policy);
  }
  if (vertexCount > policy.maximumVertexCount || triangleCount > policy.maximumTriangleCount) {
    return result(['budget-exceeded'], emptyMetrics(vertexCount, triangleCount), policy);
  }
  if (options.triangleIndices.some((vertex) => vertex >= vertexCount)) {
    return result(['input-invalid'], emptyMetrics(vertexCount, triangleCount), policy);
  }

  let minimumEdgeStretch = Number.POSITIVE_INFINITY;
  let maximumEdgeStretch = 0;
  let minimumTriangleAreaRatio = Number.POSITIVE_INFINITY;
  let maximumTriangleAreaRatio = 0;
  let minimumTriangleAspectRetention = Number.POSITIVE_INFINITY;
  let minimumOutputTriangleAspectQuality = Number.POSITIVE_INFINITY;
  let flippedTriangleCount = 0;
  const seenEdges = new Set<number>();

  for (let offset = 0; offset < options.triangleIndices.length; offset += 3) {
    const vertices = [
      options.triangleIndices[offset],
      options.triangleIndices[offset + 1],
      options.triangleIndices[offset + 2],
    ] as const;
    const uniform = vertices.map((vertex) =>
      point(options.uniformPositionsM, vertex),
    ) as unknown as readonly [Point, Point, Point];
    const personalized = vertices.map((vertex) =>
      point(options.personalizedPositionsM, vertex),
    ) as unknown as readonly [Point, Point, Point];
    const uniformNormal = cross(subtract(uniform[1], uniform[0]), subtract(uniform[2], uniform[0]));
    const personalizedNormal = cross(
      subtract(personalized[1], personalized[0]),
      subtract(personalized[2], personalized[0]),
    );
    const uniformArea2 = length(uniformNormal);
    const personalizedArea2 = length(personalizedNormal);
    if (!(uniformArea2 > Number.EPSILON) || !(personalizedArea2 > Number.EPSILON)) {
      return result(['input-invalid'], emptyMetrics(vertexCount, triangleCount), policy);
    }
    const areaRatio = personalizedArea2 / uniformArea2;
    minimumTriangleAreaRatio = Math.min(minimumTriangleAreaRatio, areaRatio);
    maximumTriangleAreaRatio = Math.max(maximumTriangleAreaRatio, areaRatio);
    const uniformAspect = aspectQuality(uniform[0], uniform[1], uniform[2], uniformArea2);
    const personalizedAspect = aspectQuality(
      personalized[0],
      personalized[1],
      personalized[2],
      personalizedArea2,
    );
    const aspectRetention = personalizedAspect / uniformAspect;
    minimumTriangleAspectRetention = Math.min(minimumTriangleAspectRetention, aspectRetention);
    minimumOutputTriangleAspectQuality = Math.min(
      minimumOutputTriangleAspectQuality,
      personalizedAspect,
    );
    if (dot(uniformNormal, personalizedNormal) <= 0) flippedTriangleCount += 1;

    for (const [leftIndex, rightIndex] of [
      [0, 1],
      [1, 2],
      [2, 0],
    ] as const) {
      const left = vertices[leftIndex];
      const right = vertices[rightIndex];
      const low = Math.min(left, right);
      const high = Math.max(left, right);
      const edgeKey = low * vertexCount + high;
      if (seenEdges.has(edgeKey)) continue;
      seenEdges.add(edgeKey);
      const uniformLength = length(subtract(uniform[leftIndex], uniform[rightIndex]));
      const personalizedLength = length(
        subtract(personalized[leftIndex], personalized[rightIndex]),
      );
      if (!(uniformLength > Number.EPSILON) || !Number.isFinite(personalizedLength)) {
        return result(['input-invalid'], emptyMetrics(vertexCount, triangleCount), policy);
      }
      const stretch = personalizedLength / uniformLength;
      minimumEdgeStretch = Math.min(minimumEdgeStretch, stretch);
      maximumEdgeStretch = Math.max(maximumEdgeStretch, stretch);
    }
  }

  const metrics = {
    vertexCount,
    triangleCount,
    uniqueEdgeCount: seenEdges.size,
    minimumEdgeStretch,
    maximumEdgeStretch,
    minimumTriangleAreaRatio,
    maximumTriangleAreaRatio,
    minimumTriangleAspectRetention,
    minimumOutputTriangleAspectQuality,
    flippedTriangleCount,
  } satisfies MeasurementOpenReferenceDisplayQualityMetricsV1;
  const reasons: MeasurementOpenReferenceDisplayQualityFailureCodeV1[] = [];
  if (minimumEdgeStretch < policy.minimumEdgeStretch) reasons.push('edge-compression-unsafe');
  if (maximumEdgeStretch > policy.maximumEdgeStretch) reasons.push('edge-stretch-unsafe');
  if (minimumTriangleAreaRatio < policy.minimumTriangleAreaRatio) {
    reasons.push('triangle-area-compression-unsafe');
  }
  if (maximumTriangleAreaRatio > policy.maximumTriangleAreaRatio) {
    reasons.push('triangle-area-stretch-unsafe');
  }
  if (minimumTriangleAspectRetention < policy.minimumTriangleAspectRetention) {
    reasons.push('triangle-aspect-unsafe');
  }
  if (flippedTriangleCount > policy.maximumFlippedTriangleCount) {
    reasons.push('triangle-orientation-unsafe');
  }
  return result(reasons, metrics, policy);
}

/**
 * Production final-composition gate. The local deformation checks remain unchanged, then the
 * complete body is checked for self-intersection regressions relative to its admitted basis.
 * Validator errors and work-budget exhaustion reject the candidate rather than bypassing it.
 */
export function evaluateMeasurementOpenReferenceDisplayQualityWithSelfIntersectionV1(options: {
  readonly uniformPositionsM: Float32Array;
  readonly personalizedPositionsM: Float32Array;
  readonly triangleIndices: Uint16Array | Uint32Array;
  readonly policy?: Partial<MeasurementOpenReferenceDisplayQualityPolicyV1>;
  readonly selfIntersectionPolicy?: MeasurementSurfaceSelfIntersectionPolicyV1;
  /** Exact authenticated basis revision used only for the bounded baseline report cache. */
  readonly admittedBasisRevision?: string;
}): MeasurementOpenReferenceDisplayQualityGateResultV1 {
  const local = evaluateMeasurementOpenReferenceDisplayQualityV1(options);
  if (!local.safe) return local;
  try {
    const delta = evaluateMeasurementOpenReferenceSelfIntersectionDeltaV1({
      admittedBasisPositionsM: options.uniformPositionsM,
      candidatePositionsM: options.personalizedPositionsM,
      triangleIndices: options.triangleIndices,
      policy: options.selfIntersectionPolicy,
      admittedBasisRevision: options.admittedBasisRevision,
    });
    const reasons = delta.safe
      ? local.reasons
      : ([...local.reasons, 'new-self-intersection'] as const);
    return Object.freeze({
      ...local,
      safe: reasons.length === 0,
      reasons: Object.freeze([...new Set(reasons)]),
      claims: SELF_INTERSECTION_CLAIMS,
    });
  } catch {
    return measurementOpenReferenceDisplayQualitySelfIntersectionFailureV1(options);
  }
}
