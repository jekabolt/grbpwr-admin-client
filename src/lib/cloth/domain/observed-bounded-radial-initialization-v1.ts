import {
  decodeTriangleRestFrameGpuV1,
  TRIANGLE_REST_FRAME_GPU_V1,
} from '../compiler/material-package';
import {
  evaluateTriangleStrain,
  type TrianglePositions,
  type Vec3,
} from '../runtime/cpu/triangle-strain-oracle';
import type { DxfProductTwoPanelSkirtAnnularMappingAcceptanceV1 } from './dxf-product-two-panel-skirt-annular-mapping-parameters-v1';
import type { DxfProductTwoPanelSkirtPlacementSemanticsRequestV1 } from './dxf-product-two-panel-skirt-placement-semantics-v1';
import {
  evaluateGarmentBodySectionCompatibilityPreflightV1,
  GARMENT_BODY_SECTION_COMPATIBILITY_PREFLIGHT_V1,
  type GarmentBodySectionCompatibilityResultV1,
} from './garment-body-section-compatibility-preflight-v1';

export const OBSERVED_BOUNDED_RADIAL_INITIALIZATION_POLICY_V1 = Object.freeze({
  id: 'observed-body-bounded-radial-initialization',
  revision: 'observed-body-bounded-radial-initialization-v1',
} as const);
export const OBSERVED_BOUNDED_RADIAL_INITIALIZATION_V1 =
  'observed-bounded-radial-initialization/1' as const;
const MAX_SCALE = 1.01;
const CLEARANCE_M = 0.01;
const COORDINATE_BOUND_M = 100;
const LIMITS = Object.freeze({
  maxAbsEdgeStretchDelta: 0.01,
  maxAbsAreaScaleDelta: 0.02,
  minNormalizedOrientationDot: 0.999,
  maxAbsWarpGreenStrain: 0.01,
  maxAbsWeftGreenStrain: 0.01,
  maxAbsShear: 0.01,
});
export type ObservedBoundedRadialInitializationAcceptanceV1 = Pick<
  DxfProductTwoPanelSkirtAnnularMappingAcceptanceV1,
  keyof typeof LIMITS
>;
export type ObservedBoundedRadialInitializationInputV1 = Readonly<{
  localPositions3M: Float32Array;
  garmentTriangles: Uint32Array;
  bodyPositions3M: Float32Array;
  bodyTriangles: Uint16Array | Uint32Array;
  translationM: readonly [number, number, number];
  garmentWaistYM: number;
  garmentHemYM: number;
  triangleRestFrames: ArrayBuffer;
  acceptance: ObservedBoundedRadialInitializationAcceptanceV1;
}>;
export type ObservedBoundedRadialInitializationMaterialMetricsV1 = Readonly<{
  maximumAbsoluteEdgeStretchDelta: number;
  maximumAbsoluteAreaScaleDelta: number;
  minimumNormalizedOrientationDot: number;
  maximumAbsoluteWarpGreenStrain: number;
  maximumAbsoluteWeftGreenStrain: number;
  maximumAbsoluteShear: number;
}>;
export type ObservedBoundedRadialInitializationReportV1 = Readonly<{
  version: typeof OBSERVED_BOUNDED_RADIAL_INITIALIZATION_V1;
  policy: typeof OBSERVED_BOUNDED_RADIAL_INITIALIZATION_POLICY_V1;
  radialScale: number;
  requiredRadialScale: number;
  maximumRadialScale: 1.01;
  applied: boolean;
  float32SafetyMarginM: number;
  baselineSection: GarmentBodySectionCompatibilityResultV1;
  candidateSection: GarmentBodySectionCompatibilityResultV1;
  materialMetrics: ObservedBoundedRadialInitializationMaterialMetricsV1;
  materialLimits: ObservedBoundedRadialInitializationAcceptanceV1;
  passed: boolean;
  blockers: readonly string[];
  claims: Readonly<{
    worldInitialPositionsOnly: true;
    localRestAndTopologyMutated: false;
    sampledSectionClearanceOnly: true;
    continuousClearanceProven: false;
    sourceAuthority: false;
    bodyAuthority: false;
    seamAuthority: false;
    collisionEvaluated: false;
    initializationAuthority: false;
    runtimeAuthority: false;
  }>;
}>;
export type ObservedBoundedRadialInitializationResultV1 = Readonly<{
  positions3M: Float32Array;
  report: ObservedBoundedRadialInitializationReportV1;
}>;

/** A reserved identity must never silently fall back to the legacy rigid recipe. */
export function isObservedBoundedRadialInitializationPolicyV1(
  policy: Readonly<{ id: string; revision: string }>,
): boolean {
  if (policy.id !== OBSERVED_BOUNDED_RADIAL_INITIALIZATION_POLICY_V1.id) return false;
  if (policy.revision !== OBSERVED_BOUNDED_RADIAL_INITIALIZATION_POLICY_V1.revision)
    throw new TypeError('Unsupported observed bounded radial initialization policy revision.');
  return true;
}
/** Exact recipe fields; the 10 mm world clearance remains the authored 8 mm + 2 mm thickness. */
export function assertObservedBoundedRadialInitializationPolicyV1(
  policy: DxfProductTwoPanelSkirtPlacementSemanticsRequestV1['policy'],
): void {
  if (
    !isObservedBoundedRadialInitializationPolicyV1(policy) ||
    policy.authoredClearanceM !== 0.008 ||
    policy.clothThicknessM !== 0.002 ||
    policy.mapping.kind !== 'authored-annular-sector-conical' ||
    policy.mapping.id !== 'canonical-medium-authored-annular-mapping' ||
    policy.mapping.revision !== 'canonical-medium-authored-annular-mapping-v1' ||
    policy.retention.kind !== 'waist-boundary-support' ||
    policy.retention.id !== 'canonical-medium-waist-boundary-support' ||
    policy.retention.revision !== 'canonical-medium-waist-boundary-support-v1'
  )
    fail('Observed bounded radial initialization requires the exact authored recipe.');
}
function fail(message: string): never {
  throw new TypeError(message);
}
function finite(value: number, name: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) fail(`${name} must be finite.`);
  return value;
}
function fixed(buffer: ArrayBufferLike, name: string): asserts buffer is ArrayBuffer {
  if (!(buffer instanceof ArrayBuffer) || ('resizable' in buffer && buffer.resizable))
    fail(`${name} must use a fixed, unshared ArrayBuffer.`);
}
function positions(value: Float32Array, maximum: number, name: string): Float32Array {
  if (!(value instanceof Float32Array) || !value.length || value.length % 3)
    fail(`${name} must contain complete Float32 XYZ vertices.`);
  if (value.length / 3 > maximum) fail(`${name} exceeds its vertex cap.`);
  fixed(value.buffer, name);
  const result = value.slice();
  for (const v of result)
    if (!Number.isFinite(v) || Math.abs(v) > COORDINATE_BOUND_M)
      fail(`${name} contains a nonfinite or out-of-bounds coordinate.`);
  return result;
}
function triangles<T extends Uint16Array | Uint32Array>(
  value: T,
  vertices: number,
  maximum: number,
  name: string,
): Uint32Array {
  if (
    !(value instanceof Uint16Array || value instanceof Uint32Array) ||
    !value.length ||
    value.length % 3
  )
    fail(`${name} must contain complete triangle indices.`);
  if (value.length / 3 > maximum) fail(`${name} exceeds its triangle cap.`);
  fixed(value.buffer, name);
  const result = Uint32Array.from(value);
  for (const v of result) if (v >= vertices) fail(`${name} contains an out-of-range index.`);
  return result;
}
function materialLimits(
  authored: ObservedBoundedRadialInitializationAcceptanceV1,
): ObservedBoundedRadialInitializationAcceptanceV1 {
  if (!authored || typeof authored !== 'object') fail('Authored acceptance is missing.');
  const result: Record<keyof typeof LIMITS, number> = { ...LIMITS };
  for (const key of Object.keys(LIMITS) as (keyof typeof LIMITS)[]) {
    const value = finite(authored[key], `acceptance.${key}`);
    if (value < 0 || (key === 'minNormalizedOrientationDot' && value > 1))
      fail(`acceptance.${key} is outside its valid interval.`);
    result[key] =
      key === 'minNormalizedOrientationDot'
        ? Math.max(LIMITS[key], value)
        : Math.min(LIMITS[key], value);
  }
  return Object.freeze(result);
}
function point(p: Float32Array, index: number): Vec3 {
  return [p[index * 3]!, p[index * 3 + 1]!, p[index * 3 + 2]!];
}
function subtract(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}
function normal(p: TrianglePositions): Vec3 {
  const a = subtract(p[1], p[0]),
    b = subtract(p[2], p[0]);
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}
function metrics(
  local: Float32Array,
  candidate: Float32Array,
  indices: Uint32Array,
  frames: ArrayBuffer,
): ObservedBoundedRadialInitializationMaterialMetricsV1 {
  let edge = 0,
    area = 0,
    orientation = 1,
    warp = 0,
    weft = 0,
    shear = 0;
  for (let t = 0; t < indices.length / 3; t++) {
    const ids = [indices[t * 3]!, indices[t * 3 + 1]!, indices[t * 3 + 2]!] as const;
    const p: TrianglePositions = [
      point(candidate, ids[0]),
      point(candidate, ids[1]),
      point(candidate, ids[2]),
    ];
    const reference: TrianglePositions = [
      point(local, ids[0]),
      point(local, ids[1]),
      point(local, ids[2]),
    ];
    const frame = decodeTriangleRestFrameGpuV1(frames, t);
    const [a, b, c, d] = frame.inverseRestMatrixInvM;
    const det = a * d - b * c;
    if (
      ![a, b, c, d, det, frame.restAreaM2].every(Number.isFinite) ||
      det === 0 ||
      frame.restAreaM2 <= 0
    )
      fail('Triangle rest frame is nonfinite or degenerate.');
    // Invert the existing inverse Dm; never derive rest lengths from the corrected candidate.
    const e1 = [d / det, -c / det],
      e2 = [-b / det, a / det];
    const restLengths = [
      Math.hypot(...e1),
      Math.hypot(e2[0]! - e1[0]!, e2[1]! - e1[1]!),
      Math.hypot(...e2),
    ];
    for (let e = 0; e < 3; e++) {
      const rest = restLengths[e]!;
      if (!Number.isFinite(rest) || rest <= 0) fail('Rest edge is invalid.');
      edge = Math.max(edge, Math.abs(Math.hypot(...subtract(p[(e + 1) % 3]!, p[e]!)) / rest - 1));
    }
    const n = normal(p),
      old = normal(reference),
      length = Math.hypot(...n),
      oldLength = Math.hypot(...old);
    if (!(length > 0 && oldLength > 0)) fail('Local or world triangle is degenerate.');
    area = Math.max(area, Math.abs(length / (2 * frame.restAreaM2) - 1));
    orientation = Math.min(
      orientation,
      (n[0] * old[0] + n[1] * old[1] + n[2] * old[2]) / (length * oldLength),
    );
    const strain = evaluateTriangleStrain(p, {
      ...frame,
      warpDirectionRest: [0, 1],
      weftDirectionRest: [-1, 0],
    });
    warp = Math.max(warp, Math.abs(strain.warp));
    weft = Math.max(weft, Math.abs(strain.weft));
    shear = Math.max(shear, Math.abs(strain.shear));
  }
  if (![edge, area, orientation, warp, weft, shear].every(Number.isFinite))
    fail('Material metrics are nonfinite.');
  return Object.freeze({
    maximumAbsoluteEdgeStretchDelta: edge,
    maximumAbsoluteAreaScaleDelta: area,
    minimumNormalizedOrientationDot: orientation,
    maximumAbsoluteWarpGreenStrain: warp,
    maximumAbsoluteWeftGreenStrain: weft,
    maximumAbsoluteShear: shear,
  });
}

/** Pure diagnostic candidate. The caller must authenticate owners and rerun full contact/self/W gates. */
export function buildObservedBoundedRadialInitializationV1(
  input: ObservedBoundedRadialInitializationInputV1,
): ObservedBoundedRadialInitializationResultV1 {
  const local = positions(input.localPositions3M, 2_000, 'localPositions3M');
  const body = positions(input.bodyPositions3M, 20_000, 'bodyPositions3M');
  if (!(input.garmentTriangles instanceof Uint32Array)) fail('garmentTriangles must be Uint32.');
  const indices = triangles(input.garmentTriangles, local.length / 3, 5_000, 'garmentTriangles');
  const bodyIndices = triangles(input.bodyTriangles, body.length / 3, 30_000, 'bodyTriangles');
  fixed(input.triangleRestFrames, 'triangleRestFrames');
  if (
    input.triangleRestFrames.byteLength !==
    (indices.length / 3) * TRIANGLE_REST_FRAME_GPU_V1.strideBytes
  )
    fail('Triangle rest-frame byte count differs from topology.');
  const frames = input.triangleRestFrames.slice(0);
  if (!Array.isArray(input.translationM) || input.translationM.length !== 3)
    fail('Expected translation XYZ.');
  const translation: Vec3 = [input.translationM[0], input.translationM[1], input.translationM[2]];
  translation.forEach((v) => {
    if (Math.abs(finite(v, 'translationM')) > COORDINATE_BOUND_M)
      fail('Translation exceeds bound.');
  });
  const waist = finite(input.garmentWaistYM, 'garmentWaistYM'),
    hem = finite(input.garmentHemYM, 'garmentHemYM');
  if (
    waist !== translation[1] ||
    !(hem < waist) ||
    Math.max(Math.abs(waist), Math.abs(hem)) > COORDINATE_BOUND_M
  )
    fail('Expected waist-origin translation and ordered bounded world section interval.');
  const limits = materialLimits(input.acceptance);
  const world = (scale: number) =>
    Float32Array.from(local, (v, i) =>
      Math.fround(v * (i % 3 === 1 ? 1 : scale) + translation[i % 3]!),
    );
  const baseline = world(1);
  const section = (p: Float32Array) =>
    evaluateGarmentBodySectionCompatibilityPreflightV1({
      schemaVersion: GARMENT_BODY_SECTION_COMPATIBILITY_PREFLIGHT_V1,
      bodyPositionsM: body,
      bodyTriangles: bodyIndices,
      garmentPositionsM: p,
      garmentTriangles: indices,
      verticalAxisOriginM: translation,
      garmentWaistYM: waist,
      garmentHemYM: hem,
      policy: {
        sectionCount: 33,
        requiredRadialClearanceM: CLEARANCE_M,
        maximumCircumferentialStretchDelta: 0.01,
      },
    });
  const baselineSection = section(baseline);
  let maximumMagnitudeXZ = 0;
  for (let i = 0; i < local.length; i++)
    if (i % 3 !== 1)
      maximumMagnitudeXZ = Math.max(
        maximumMagnitudeXZ,
        Math.abs(translation[i % 3]!) + MAX_SCALE * Math.abs(local[i]!),
      );
  // Rounding a normal Float32 costs <= |x|*2^-24 per coordinate. Compare the independently
  // rounded baseline and candidate: sqrt(2)*(1+sMax)*bound. Y is bit-identical, hence section
  // interpolation weights are unchanged. Add a binary64 arithmetic bound, then use the existing
  // 1 micrometre comparison tolerance as a POSITIVE safety floor, never a relaxed gate.
  const float32SafetyMarginM = Math.max(
    1e-6,
    Math.SQRT2 * (1 + MAX_SCALE) * Math.max(maximumMagnitudeXZ * 2 ** -24, 2 ** -150) +
      16 * Number.EPSILON * Math.max(1, maximumMagnitudeXZ),
  );
  const blockers: string[] = [];
  let requiredRadialScale = 1;
  if (!baselineSection.ok) blockers.push('baseline-section-invalid');
  else if (!baselineSection.summary.initialClearanceQualified) {
    for (const s of baselineSection.sections)
      requiredRadialScale = Math.max(
        requiredRadialScale,
        (s.requiredGarmentRadiusM + float32SafetyMarginM) / s.garment.envelope.minimumRadiusM,
      );
  }
  if (!Number.isFinite(requiredRadialScale)) fail('Required radial scale is nonfinite.');
  if (requiredRadialScale > MAX_SCALE) blockers.push('radial-scale-over-budget');
  const radialScale = requiredRadialScale <= MAX_SCALE ? requiredRadialScale : 1;
  const candidate = radialScale === 1 ? baseline : world(radialScale);
  const candidateSection = section(candidate);
  if (!candidateSection.ok) blockers.push('candidate-section-invalid');
  else if (
    candidateSection.status !== 'compatible-with-authored-clearance' ||
    !candidateSection.summary.initialClearanceQualified
  )
    blockers.push('candidate-section-clearance-not-met');
  const measured = metrics(local, candidate, indices, frames);
  const comparisons = [
    [
      measured.maximumAbsoluteEdgeStretchDelta > limits.maxAbsEdgeStretchDelta,
      'material-edge-stretch-over-budget',
    ],
    [
      measured.maximumAbsoluteAreaScaleDelta > limits.maxAbsAreaScaleDelta,
      'material-area-scale-over-budget',
    ],
    [
      measured.minimumNormalizedOrientationDot < limits.minNormalizedOrientationDot,
      'material-orientation-not-qualified',
    ],
    [
      measured.maximumAbsoluteWarpGreenStrain > limits.maxAbsWarpGreenStrain,
      'material-warp-green-over-budget',
    ],
    [
      measured.maximumAbsoluteWeftGreenStrain > limits.maxAbsWeftGreenStrain,
      'material-weft-green-over-budget',
    ],
    [measured.maximumAbsoluteShear > limits.maxAbsShear, 'material-shear-over-budget'],
  ] as const;
  for (const [blocked, code] of comparisons) if (blocked) blockers.push(code);
  return Object.freeze({
    positions3M: candidate,
    report: Object.freeze({
      version: OBSERVED_BOUNDED_RADIAL_INITIALIZATION_V1,
      policy: OBSERVED_BOUNDED_RADIAL_INITIALIZATION_POLICY_V1,
      radialScale,
      requiredRadialScale,
      maximumRadialScale: MAX_SCALE,
      applied: radialScale !== 1,
      float32SafetyMarginM,
      baselineSection,
      candidateSection,
      materialMetrics: measured,
      materialLimits: limits,
      passed: blockers.length === 0,
      blockers: Object.freeze(blockers),
      claims: Object.freeze({
        worldInitialPositionsOnly: true,
        localRestAndTopologyMutated: false,
        sampledSectionClearanceOnly: true,
        continuousClearanceProven: false,
        sourceAuthority: false,
        bodyAuthority: false,
        seamAuthority: false,
        collisionEvaluated: false,
        initializationAuthority: false,
        runtimeAuthority: false,
      } as const),
    }),
  });
}
