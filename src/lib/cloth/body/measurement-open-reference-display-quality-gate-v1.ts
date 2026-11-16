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
    readonly localGeometryQualityOnly: true;
    readonly selfIntersectionEvaluated: false;
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
