import type { MakeHumanFemaleBustDeltaBundleV1 } from './makehuman-female-bust-delta-bundle-v1';
import type {
  MakeHumanOpenReferenceBasisKindV1,
  MakeHumanOpenReferenceBasisV1,
} from './measurement-open-reference-display-v1';
import {
  evaluateMeasurementOpenReferenceDisplayQualityV1,
  type MeasurementOpenReferenceDisplayQualityGateResultV1,
} from './measurement-open-reference-display-quality-gate-v1';
import {
  measureMeshPlaneSectionPerimetersV1,
  type MeshPlaneSectionLoopV1,
  type MeshPlaneSectionVec3V1,
} from './mesh-plane-section-perimeter-v1';
import { meshPlaneSectionLoopTapePerimeterMV1 } from './mesh-plane-section-tape-girth-v1';

export const MEASUREMENT_OPEN_REFERENCE_FEMALE_BUST_PROXY_V1 =
  'measurement-open-reference-female-bust-proxy/v1' as const;

export interface MeasurementOpenReferenceFemaleBustProxyPolicyV1 {
  /** Authored min-cup end of the signed field: deformation-safety constant, not calibrated. */
  readonly minimumCoefficient: -1;
  /** Reversed-field (extrapolated) end: deformation-safety constant, not calibrated. */
  readonly maximumCoefficient: 1.5;
  /** Lower ribcage-band bound: deformation-safety constant, not calibrated. */
  readonly minimumBandCoefficient: number;
  /** Upper ribcage-band bound: deformation-safety constant, not calibrated. */
  readonly maximumBandCoefficient: number;
  /** Upper ribcage-band fade: deformation-safety constant, not calibrated. */
  readonly bandUpperFadeM: number;
  /** Lateral ribcage-band fade: deformation-safety constant, not calibrated. */
  readonly bandLateralFade: number;
  /**
   * Fades the reversed (c > 0) field to zero from the bust plane down to the under-bust station.
   * Deformation-safety constant, not calibrated. `false` restores the field without this fold.
   */
  readonly positiveSideFoldFalloff: boolean;
  /** Numerical search step, not a body claim. */
  readonly apexSearchStepM: number;
  /** Numerical solver budget, not a body claim. */
  readonly binarySearchIterations: number;
  /** Numerical solver budget, not a body claim. */
  readonly qualitySearchIterations: number;
  /** Numerical closure tolerance, not a body claim. */
  readonly maximumChestResidualMm: number;
  /** Numerical closure tolerance, not a body claim. */
  readonly maximumUnderBustResidualMm: number;
  /** Numerical solver budget, not a body claim. */
  readonly maximumClosureRounds: number;
}

/** Admitted ribcage-band envelope: deformation-safety constants, not calibrated. */
const BAND_COEFFICIENT_ENVELOPE = Object.freeze({ minimum: -0.3, maximum: 0.1 });

export const DEFAULT_MEASUREMENT_OPEN_REFERENCE_FEMALE_BUST_PROXY_POLICY_V1 = Object.freeze({
  minimumCoefficient: -1 as const,
  maximumCoefficient: 1.5 as const,
  // Deformation-safety constants, not calibrated. The positive band side is bounded tighter
  // because a wider ribcage band failed the local quality gate above +0.10.
  minimumBandCoefficient: BAND_COEFFICIENT_ENVELOPE.minimum,
  maximumBandCoefficient: BAND_COEFFICIENT_ENVELOPE.maximum,
  bandUpperFadeM: 0.08,
  bandLateralFade: 0.3,
  // Deformation-safety constant, not calibrated. One-line switch back to the unfolded field.
  positiveSideFoldFalloff: true,
  apexSearchStepM: 0.001,
  binarySearchIterations: 18,
  qualitySearchIterations: 14,
  maximumChestResidualMm: 1,
  maximumUnderBustResidualMm: 0.5,
  maximumClosureRounds: 8,
} satisfies MeasurementOpenReferenceFemaleBustProxyPolicyV1);

/** Alternating one-dimensional closure rounds after Newton. Numerical budget, not a body claim. */
const MAXIMUM_FINISH_ROUNDS = 4;

export type MeasurementOpenReferenceFemaleBustProxyStatusV1 =
  | 'unrequested'
  | 'represented'
  | 'limited'
  | 'notApplicable'
  | 'notApplied';

export type MeasurementOpenReferenceFemaleBustProxyDiagnosticCodeV1 =
  | 'basis-not-applicable'
  | 'coefficient-endpoint'
  | 'direction-response-invalid'
  | 'input-invalid'
  | 'quality-fraction-limited'
  | 'section-invalid'
  | 'target-invalid'
  | 'underbust-closure-limited'
  | 'underbust-endpoint';

export interface MeasurementOpenReferenceFemaleBustProxyDiagnosticV1 {
  readonly code: MeasurementOpenReferenceFemaleBustProxyDiagnosticCodeV1;
  readonly measurementKey: 'chestCircumferenceMm' | 'underBustCircumferenceMm';
  readonly message: string;
}

export interface MeasurementOpenReferenceFemaleBustApexStationV1 {
  readonly originM: MeshPlaneSectionVec3V1;
  readonly baselineGirthMm: number;
  readonly underBustY: number;
  readonly armpitMergeY: number;
  readonly sampledPlaneCount: number;
}

export interface MeasurementOpenReferenceFemaleBustModeResultV1 {
  readonly requestedTargetMm: number;
  readonly achievedMm: number;
  readonly absoluteResidualMm: number;
  readonly coefficient: number;
  readonly safeFraction: number;
  readonly endpoint: boolean;
  readonly fullestSectionOffsetMm: number;
  readonly armpitLineGirthMm: number;
  readonly solveIterations: number;
}

export interface MeasurementOpenReferenceFemaleBustUnderBustResultV1 {
  readonly status: MeasurementOpenReferenceFemaleBustProxyStatusV1;
  readonly requestedTargetMm: number | null;
  readonly achievedMm: number | null;
  readonly absoluteResidualMm: number | null;
  readonly coefficient: number;
  readonly closureRounds: number;
}

export interface MeasurementOpenReferenceFemaleBustProxyResultV1 {
  readonly version: typeof MEASUREMENT_OPEN_REFERENCE_FEMALE_BUST_PROXY_V1;
  readonly role: 'CC0_OPEN_REFERENCE_SIGNED_FEMALE_BUST_VISUAL_PROXY';
  readonly status: MeasurementOpenReferenceFemaleBustProxyStatusV1;
  readonly positionsM: Float32Array;
  readonly apexStation?: MeasurementOpenReferenceFemaleBustApexStationV1;
  readonly modeResult?: MeasurementOpenReferenceFemaleBustModeResultV1;
  readonly underBust: MeasurementOpenReferenceFemaleBustUnderBustResultV1;
  readonly diagnostics: readonly MeasurementOpenReferenceFemaleBustProxyDiagnosticV1[];
  readonly qualityGate?: MeasurementOpenReferenceDisplayQualityGateResultV1;
  readonly claims: MeasurementOpenReferenceFemaleBustProxyClaimsV1;
}

const BASE_CLAIMS = Object.freeze({
  visualReferenceOnly: true as const,
  femaleBasisOnly: true as const,
  signedMakeHumanField: true as const,
  positiveSideIsExtrapolation: true as const,
  apexPlaneFromMaximumGeometricGirth: true as const,
  deformationSafetyBoundOnly: true as const,
  circumferenceRangeCalibrated: false as const,
  canonicalMeasurementSemanticMatchClaimed: false as const,
  anatomicalTapePathEquivalent: false as const,
  populationRepresentativenessClaimed: false as const,
  fitClaimEligible: false as const,
  runtimeCollisionEligible: false as const,
  selfIntersection: 'not-evaluated-after-deformation' as const,
  underBustBand: 'ribcage-plateau-ours' as const,
  positiveSideHeightFalloff: 'apex-to-armpit-line-smoothstep-ours' as const,
  underBustMissingMode: 'proportional-ribcage-ours' as const,
});

const CLAIMS_WITH_FOLD = Object.freeze({
  ...BASE_CLAIMS,
  positiveSideFoldFalloff: 'underbust-to-apex-smoothstep-ours' as const,
});

const CLAIMS_WITHOUT_FOLD = Object.freeze({
  ...BASE_CLAIMS,
  positiveSideFoldFalloff: 'not-applied' as const,
});

export type MeasurementOpenReferenceFemaleBustProxyClaimsV1 =
  | typeof CLAIMS_WITH_FOLD
  | typeof CLAIMS_WITHOUT_FOLD;

function diagnostic(
  code: MeasurementOpenReferenceFemaleBustProxyDiagnosticCodeV1,
  measurementKey: MeasurementOpenReferenceFemaleBustProxyDiagnosticV1['measurementKey'],
  message: string,
): MeasurementOpenReferenceFemaleBustProxyDiagnosticV1 {
  return Object.freeze({ code, measurementKey, message });
}

function snapshotPolicy(
  input: Partial<MeasurementOpenReferenceFemaleBustProxyPolicyV1> | undefined,
): MeasurementOpenReferenceFemaleBustProxyPolicyV1 {
  const policy = {
    ...DEFAULT_MEASUREMENT_OPEN_REFERENCE_FEMALE_BUST_PROXY_POLICY_V1,
    ...input,
  };
  if (policy.minimumCoefficient !== -1 || policy.maximumCoefficient !== 1.5) {
    throw new RangeError('Female bust coefficient endpoints must remain -1 and 1.5.');
  }
  for (const key of [
    'bandUpperFadeM',
    'bandLateralFade',
    'apexSearchStepM',
    'maximumChestResidualMm',
    'maximumUnderBustResidualMm',
  ] as const) {
    if (!Number.isFinite(policy[key]) || policy[key] <= 0) {
      throw new RangeError(`${key} must be finite and positive.`);
    }
  }
  if (
    !Number.isFinite(policy.minimumBandCoefficient) ||
    policy.minimumBandCoefficient >= 0 ||
    policy.minimumBandCoefficient < BAND_COEFFICIENT_ENVELOPE.minimum
  ) {
    throw new RangeError(
      'minimumBandCoefficient must be negative and within the admitted envelope.',
    );
  }
  if (
    !Number.isFinite(policy.maximumBandCoefficient) ||
    policy.maximumBandCoefficient <= 0 ||
    policy.maximumBandCoefficient > BAND_COEFFICIENT_ENVELOPE.maximum
  ) {
    throw new RangeError(
      'maximumBandCoefficient must be positive and within the admitted envelope.',
    );
  }
  if (typeof policy.positiveSideFoldFalloff !== 'boolean') {
    throw new TypeError('positiveSideFoldFalloff must be a boolean.');
  }
  for (const key of [
    'binarySearchIterations',
    'qualitySearchIterations',
    'maximumClosureRounds',
  ] as const) {
    if (!Number.isSafeInteger(policy[key]) || policy[key] < 1 || policy[key] > 32) {
      throw new RangeError(`${key} must be an integer within 1..32.`);
    }
  }
  return Object.freeze(policy);
}

function validateMesh(positionsM: Float32Array, triangleIndices: Uint16Array | Uint32Array): void {
  if (
    !(positionsM instanceof Float32Array) ||
    positionsM.length === 0 ||
    positionsM.length % 3 !== 0 ||
    !positionsM.every(Number.isFinite)
  ) {
    throw new TypeError('sourcePositionsM must be a finite non-empty XYZ Float32Array.');
  }
  if (
    (!(triangleIndices instanceof Uint16Array) && !(triangleIndices instanceof Uint32Array)) ||
    triangleIndices.length === 0 ||
    triangleIndices.length % 3 !== 0
  ) {
    throw new TypeError('triangleIndices must contain complete typed-array triangles.');
  }
  const vertexCount = positionsM.length / 3;
  if (triangleIndices.some((vertex) => vertex >= vertexCount)) {
    throw new RangeError('triangleIndices contains an invalid vertex.');
  }
}

function finiteOrigin(value: MeshPlaneSectionVec3V1): boolean {
  return value.length === 3 && value.every(Number.isFinite);
}

function selectedLoop(options: {
  readonly positionsM: Float32Array;
  readonly triangleIndices: Uint16Array | Uint32Array;
  readonly originM: MeshPlaneSectionVec3V1;
}): MeshPlaneSectionLoopV1 {
  const measured = measureMeshPlaneSectionPerimetersV1({
    positionsM: options.positionsM,
    triangleIndices: options.triangleIndices,
    planeOriginM: options.originM,
    planeNormal: [0, 1, 0],
    selection: { kind: 'nearest-seed', seedM: options.originM },
    policy: { weldToleranceM: 0.00002 },
  });
  if (!measured.ok || !measured.selectedLoop) {
    throw new Error(
      measured.ok ? 'Female bust section selection failed.' : measured.errors.join('; '),
    );
  }
  if (!Number.isFinite(measured.selectedLoop.perimeterM) || measured.selectedLoop.perimeterM <= 0) {
    throw new Error('Female bust section perimeter is invalid.');
  }
  return measured.selectedLoop;
}

function girthMm(options: {
  readonly positionsM: Float32Array;
  readonly triangleIndices: Uint16Array | Uint32Array;
  readonly originM: MeshPlaneSectionVec3V1;
}): number {
  return selectedLoop(options).perimeterM * 1000;
}

/** Tape girth: the hull bridges the cleavage the raw loop dips into; the typed bust is a tape. */
function tapeGirthMm(options: {
  readonly positionsM: Float32Array;
  readonly triangleIndices: Uint16Array | Uint32Array;
  readonly originM: MeshPlaneSectionVec3V1;
}): number {
  return meshPlaneSectionLoopTapePerimeterMV1(selectedLoop(options)) * 1000;
}

/**
 * Finds the fixed horizontal plane of maximum torso-loop girth between the under-bust station and
 * the armpit merge. This is a geometric plane on the admitted display, not a detected landmark.
 */
export function findMeasurementOpenReferenceFemaleBustApexPlaneV1(options: {
  readonly positionsM: Float32Array;
  readonly triangleIndices: Uint16Array | Uint32Array;
  readonly underBustStationOriginM: MeshPlaneSectionVec3V1;
  readonly armpitMergeStationOriginM: MeshPlaneSectionVec3V1;
  readonly policy?: Partial<MeasurementOpenReferenceFemaleBustProxyPolicyV1>;
}): MeasurementOpenReferenceFemaleBustApexStationV1 {
  validateMesh(options.positionsM, options.triangleIndices);
  const policy = snapshotPolicy(options.policy);
  if (
    !finiteOrigin(options.underBustStationOriginM) ||
    !finiteOrigin(options.armpitMergeStationOriginM)
  ) {
    throw new TypeError('Female bust search stations must contain finite coordinates.');
  }
  const underBustY = options.underBustStationOriginM[1];
  const armpitMergeY = options.armpitMergeStationOriginM[1];
  if (!(underBustY < armpitMergeY)) {
    throw new RangeError('Under-bust station must be below the armpit merge.');
  }
  const span = armpitMergeY - underBustY;
  const steps = Math.max(1, Math.ceil(span / policy.apexSearchStepM));
  let bestOrigin: MeshPlaneSectionVec3V1 | undefined;
  let bestGirthMm = Number.NEGATIVE_INFINITY;
  for (let step = 0; step <= steps; step += 1) {
    const t = step / steps;
    const originM = Object.freeze([
      options.underBustStationOriginM[0] +
        (options.armpitMergeStationOriginM[0] - options.underBustStationOriginM[0]) * t,
      underBustY + span * t,
      options.underBustStationOriginM[2] +
        (options.armpitMergeStationOriginM[2] - options.underBustStationOriginM[2]) * t,
    ]) as MeshPlaneSectionVec3V1;
    const measuredMm = girthMm({ ...options, originM });
    if (measuredMm > bestGirthMm) {
      bestGirthMm = measuredMm;
      bestOrigin = originM;
    }
  }
  if (!bestOrigin) throw new Error('Female bust apex-plane search produced no section.');
  return Object.freeze({
    originM: bestOrigin,
    baselineGirthMm: bestGirthMm,
    underBustY,
    armpitMergeY,
    sampledPlaneCount: steps + 1,
  });
}

function smoothstep01(value: number): number {
  const bounded = Math.min(1, Math.max(0, value));
  return bounded * bounded * (3 - 2 * bounded);
}

interface BandSupportV1 {
  readonly centerX: number;
  readonly centerZ: number;
  readonly stationY: number;
  readonly bandRadiusM: number;
  readonly armpitLineY: number;
  readonly torsoTable: readonly TorsoTableEntryV1[];
}

interface TorsoTableEntryV1 {
  readonly y: number;
  readonly centerX: number;
  readonly centerZ: number;
  readonly xRadius: number;
  readonly zRadius: number;
}

/** Longest lower band tail: deformation-safety constant, not calibrated. */
const BAND_TAIL_MAXIMUM_M = 0.075;
/** Torso-width sampling step: numerical resolution, not a body claim. */
const TORSO_TABLE_STEP_M = 0.002;

/**
 * The triangles that can cut a horizontal plane between `minimumY` and `maximumY` on any
 * candidate mesh. The ribcage band moves vertices only in x and z and the signed field moves
 * them in y by at most `reachM`, so every other triangle never meets those planes. Order is kept,
 * so a section over this subset is bit-identical to one over the whole mesh. Numerical speed-up
 * only, not a body claim.
 */
function trianglesNearHeights(options: {
  readonly positionsM: Float32Array;
  readonly triangleIndices: Uint16Array | Uint32Array;
  readonly minimumY: number;
  readonly maximumY: number;
  readonly reachM: number;
}): Uint32Array {
  const lowLimit = options.minimumY - options.reachM;
  const highLimit = options.maximumY + options.reachM;
  const kept: number[] = [];
  for (let offset = 0; offset < options.triangleIndices.length; offset += 3) {
    const a = options.triangleIndices[offset];
    const b = options.triangleIndices[offset + 1];
    const c = options.triangleIndices[offset + 2];
    const ya = options.positionsM[a * 3 + 1];
    const yb = options.positionsM[b * 3 + 1];
    const yc = options.positionsM[c * 3 + 1];
    if (Math.max(ya, yb, yc) < lowLimit || Math.min(ya, yb, yc) > highLimit) continue;
    kept.push(a, b, c);
  }
  return Uint32Array.from(kept);
}

function bandSupport(options: {
  readonly sourcePositionsM: Float32Array;
  readonly triangleIndices: Uint16Array | Uint32Array;
  readonly underBustStationOriginM: MeshPlaneSectionVec3V1;
  readonly armpitLineOriginM: MeshPlaneSectionVec3V1;
  readonly heightMm: number;
}): BandSupportV1 {
  const loop = selectedLoop({
    positionsM: options.sourcePositionsM,
    triangleIndices: options.triangleIndices,
    originM: options.underBustStationOriginM,
  });
  const [centerX, stationY, centerZ] = loop.centroidM;
  // Lower band tail radius: deformation-safety constant, not calibrated.
  const bandRadiusM = Math.max(0.04, Math.min(BAND_TAIL_MAXIMUM_M, options.heightMm / 25_000));
  const tableStepM = TORSO_TABLE_STEP_M;
  const tableStartY = stationY - bandRadiusM - tableStepM;
  const armpitLineY = options.armpitLineOriginM[1];
  const tableSteps = Math.max(1, Math.ceil((armpitLineY - tableStartY) / tableStepM));
  const torsoTable: TorsoTableEntryV1[] = [];
  for (let step = 0; step <= tableSteps; step += 1) {
    const y = Math.min(armpitLineY, tableStartY + step * tableStepM);
    if (torsoTable.at(-1)?.y === y) continue;
    const torsoLoop = selectedLoop({
      positionsM: options.sourcePositionsM,
      triangleIndices: options.triangleIndices,
      originM: [options.armpitLineOriginM[0], y, options.armpitLineOriginM[2]],
    });
    const [loopCenterX, , loopCenterZ] = torsoLoop.centroidM;
    torsoTable.push(
      Object.freeze({
        y,
        centerX: loopCenterX,
        centerZ: loopCenterZ,
        xRadius: Math.max(
          ...torsoLoop.pointsM.map((point) => Math.abs(point[0] - loopCenterX)),
          0.001,
        ),
        zRadius: Math.max(
          ...torsoLoop.pointsM.map((point) => Math.abs(point[2] - loopCenterZ)),
          0.001,
        ),
      }),
    );
  }
  return Object.freeze({
    centerX,
    centerZ,
    stationY,
    bandRadiusM,
    armpitLineY,
    torsoTable: Object.freeze(torsoTable),
  });
}

function torsoWidthAt(support: BandSupportV1, y: number): TorsoTableEntryV1 {
  const table = support.torsoTable;
  const first = table[0];
  const last = table[table.length - 1];
  if (y <= first.y) return first;
  if (y >= last.y) return last;
  let low = 0;
  let high = table.length - 1;
  while (high - low > 1) {
    const middle = Math.floor((low + high) / 2);
    if (table[middle].y <= y) low = middle;
    else high = middle;
  }
  const before = table[low];
  const after = table[high];
  const fraction = (y - before.y) / (after.y - before.y);
  return {
    y,
    centerX: before.centerX + (after.centerX - before.centerX) * fraction,
    centerZ: before.centerZ + (after.centerZ - before.centerZ) * fraction,
    xRadius: before.xRadius + (after.xRadius - before.xRadius) * fraction,
    zRadius: before.zRadius + (after.zRadius - before.zRadius) * fraction,
  };
}

function applyBand(
  sourcePositionsM: Float32Array,
  support: BandSupportV1,
  coefficient: number,
  policy: MeasurementOpenReferenceFemaleBustProxyPolicyV1,
): Float32Array {
  const result = sourcePositionsM.slice();
  if (coefficient === 0) return result;
  for (let vertex = 0; vertex < result.length / 3; vertex += 1) {
    const offset = vertex * 3;
    const x = sourcePositionsM[offset];
    const y = sourcePositionsM[offset + 1];
    const z = sourcePositionsM[offset + 2];
    const verticalWeight =
      y < support.stationY
        ? smoothstep01(1 - (support.stationY - y) / support.bandRadiusM)
        : y <= support.armpitLineY
          ? 1
          : smoothstep01(1 - (y - support.armpitLineY) / policy.bandUpperFadeM);
    if (verticalWeight <= 0) continue;
    const torso = torsoWidthAt(support, Math.min(y, support.armpitLineY));
    const normalizedRadius = Math.max(
      Math.abs(x - torso.centerX) / torso.xRadius,
      Math.abs(z - torso.centerZ) / torso.zRadius,
    );
    const lateralWeight = 1 - smoothstep01((normalizedRadius - 1) / policy.bandLateralFade);
    const weight = verticalWeight * lateralWeight;
    if (weight <= 0) continue;
    result[offset] = x + (x - support.centerX) * coefficient * weight;
    result[offset + 2] = z + (z - support.centerZ) * coefficient * weight;
  }
  return result;
}

/**
 * Height weight of the signed field at one source vertex. The authored side (c <= 0) is applied
 * verbatim (weight 1 everywhere). The reversed side (c > 0) is ours: it fades out above the bust
 * plane toward the armpit line and, with the fold, below the bust plane toward the under-bust
 * station. Both fades are deformation-safety constants, not calibrated.
 */
export function measurementOpenReferenceFemaleBustFieldWeightV1(options: {
  readonly coefficient: number;
  readonly sourceY: number;
  readonly underBustY: number;
  readonly apexY: number;
  readonly armpitY: number;
  readonly positiveSideFold: boolean;
}): number {
  if (!(options.coefficient > 0)) return 1;
  const { sourceY, underBustY, apexY, armpitY } = options;
  const upperWeight =
    sourceY <= apexY
      ? 1
      : sourceY >= armpitY
        ? 0
        : smoothstep01(1 - (sourceY - apexY) / (armpitY - apexY));
  const lowerWeight =
    !options.positiveSideFold || sourceY >= apexY
      ? 1
      : sourceY <= underBustY
        ? 0
        : smoothstep01((sourceY - underBustY) / (apexY - underBustY));
  return upperWeight * lowerWeight;
}

function applySignedDelta(options: {
  readonly positionsM: Float32Array;
  readonly sourcePositionsM: Float32Array;
  readonly deltaBundle: MakeHumanFemaleBustDeltaBundleV1;
  readonly coefficient: number;
  readonly scaleMPerSourceUnit: number;
  readonly falloff: {
    readonly underBustY: number;
    readonly apexY: number;
    readonly armpitY: number;
    readonly positiveSideFold: boolean;
  };
}): Float32Array {
  const result = options.positionsM.slice();
  if (options.coefficient === 0) return result;
  for (let record = 0; record < options.deltaBundle.vertexIndices.length; record += 1) {
    const vertexOffset = options.deltaBundle.vertexIndices[record] * 3;
    const deltaOffset = record * 3;
    const weight = measurementOpenReferenceFemaleBustFieldWeightV1({
      coefficient: options.coefficient,
      sourceY: options.sourcePositionsM[vertexOffset + 1],
      ...options.falloff,
    });
    if (weight <= 0) continue;
    const scale = options.coefficient * options.scaleMPerSourceUnit * weight;
    result[vertexOffset] -= options.deltaBundle.deltasSourceUnits[deltaOffset] * scale;
    result[vertexOffset + 1] -= options.deltaBundle.deltasSourceUnits[deltaOffset + 1] * scale;
    result[vertexOffset + 2] -= options.deltaBundle.deltasSourceUnits[deltaOffset + 2] * scale;
  }
  return result;
}

interface ScalarSolveV1 {
  readonly coefficient: number;
  readonly achievedMm: number;
  readonly endpoint: boolean;
}

function solveMonotonicCoefficient(options: {
  readonly minimum: number;
  readonly maximum: number;
  readonly targetMm: number;
  readonly iterations: number;
  readonly measure: (coefficient: number) => number;
}): ScalarSolveV1 {
  const minimumMm = options.measure(options.minimum);
  const maximumMm = options.measure(options.maximum);
  if (!Number.isFinite(minimumMm) || !Number.isFinite(maximumMm) || maximumMm <= minimumMm) {
    throw new Error('Signed coefficient response is not increasing.');
  }
  if (options.targetMm <= minimumMm) {
    return Object.freeze({ coefficient: options.minimum, achievedMm: minimumMm, endpoint: true });
  }
  if (options.targetMm >= maximumMm) {
    return Object.freeze({ coefficient: options.maximum, achievedMm: maximumMm, endpoint: true });
  }
  let low = options.minimum;
  let high = options.maximum;
  let bestCoefficient = low;
  let bestAchievedMm = minimumMm;
  for (let iteration = 0; iteration < options.iterations; iteration += 1) {
    const coefficient = (low + high) / 2;
    const achievedMm = options.measure(coefficient);
    if (Math.abs(achievedMm - options.targetMm) < Math.abs(bestAchievedMm - options.targetMm)) {
      bestCoefficient = coefficient;
      bestAchievedMm = achievedMm;
    }
    if (achievedMm < options.targetMm) low = coefficient;
    else high = coefficient;
  }
  return Object.freeze({
    coefficient: bestCoefficient,
    achievedMm: bestAchievedMm,
    endpoint:
      Math.abs(bestCoefficient - options.minimum) < 1e-9 ||
      Math.abs(bestCoefficient - options.maximum) < 1e-9,
  });
}

function emptyUnderBust(
  status: MeasurementOpenReferenceFemaleBustProxyStatusV1,
  requestedTargetMm: number | null,
): MeasurementOpenReferenceFemaleBustUnderBustResultV1 {
  return Object.freeze({
    status,
    requestedTargetMm,
    achievedMm: null,
    absoluteResidualMm: null,
    coefficient: 0,
    closureRounds: 0,
  });
}

/**
 * Solves the female-only signed sparse field at the fixed maximum-girth plane. Positive
 * coefficients reverse the authored field and are explicitly an extrapolation. The [-1, 1.5]
 * field interval and the [-0.30, +0.10] ribcage-band interval are deformation-safety bounds only;
 * they carry no calibrated circumference claim. When the quality gate rejects the solved pair, the
 * field is scaled back to the largest locally safe fraction while the band is re-solved for the
 * under-bust target at every fraction step, so under bust gives way only at its own band bound.
 */
export function solveMeasurementOpenReferenceFemaleBustProxyV1(options: {
  readonly basis: Pick<
    MakeHumanOpenReferenceBasisV1,
    'kind' | 'positionsSourceUnits' | 'sourceMinimumY' | 'sourceMaximumY'
  >;
  readonly sourcePositionsM: Float32Array;
  readonly triangleIndices: Uint16Array | Uint32Array;
  readonly deltaBundle: MakeHumanFemaleBustDeltaBundleV1;
  readonly heightMm: number;
  readonly targetCircumferenceMm?: number;
  readonly targetUnderBustCircumferenceMm?: number;
  readonly underBustStationOriginM: MeshPlaneSectionVec3V1;
  readonly armpitMergeStationOriginM: MeshPlaneSectionVec3V1;
  readonly apexStation?: MeasurementOpenReferenceFemaleBustApexStationV1;
  readonly policy?: Partial<MeasurementOpenReferenceFemaleBustProxyPolicyV1>;
}): MeasurementOpenReferenceFemaleBustProxyResultV1 {
  validateMesh(options.sourcePositionsM, options.triangleIndices);
  const policy = snapshotPolicy(options.policy);
  const original = options.sourcePositionsM;
  const requestedTargetMm = options.targetCircumferenceMm;
  const requestedUnderBustMm = options.targetUnderBustCircumferenceMm;
  const finish = (optionsFinish: {
    readonly status: MeasurementOpenReferenceFemaleBustProxyStatusV1;
    readonly positionsM?: Float32Array;
    readonly apexStation?: MeasurementOpenReferenceFemaleBustApexStationV1;
    readonly modeResult?: MeasurementOpenReferenceFemaleBustModeResultV1;
    readonly underBust?: MeasurementOpenReferenceFemaleBustUnderBustResultV1;
    readonly diagnostics?: readonly MeasurementOpenReferenceFemaleBustProxyDiagnosticV1[];
    readonly qualityGate?: MeasurementOpenReferenceDisplayQualityGateResultV1;
  }): MeasurementOpenReferenceFemaleBustProxyResultV1 =>
    Object.freeze({
      version: MEASUREMENT_OPEN_REFERENCE_FEMALE_BUST_PROXY_V1,
      role: 'CC0_OPEN_REFERENCE_SIGNED_FEMALE_BUST_VISUAL_PROXY' as const,
      status: optionsFinish.status,
      positionsM: optionsFinish.positionsM ?? original,
      ...(optionsFinish.apexStation ? { apexStation: optionsFinish.apexStation } : {}),
      ...(optionsFinish.modeResult ? { modeResult: optionsFinish.modeResult } : {}),
      underBust:
        optionsFinish.underBust ??
        emptyUnderBust(
          requestedUnderBustMm == null ? 'unrequested' : 'notApplicable',
          requestedUnderBustMm ?? null,
        ),
      diagnostics: Object.freeze([...(optionsFinish.diagnostics ?? [])]),
      ...(optionsFinish.qualityGate ? { qualityGate: optionsFinish.qualityGate } : {}),
      claims: policy.positiveSideFoldFalloff ? CLAIMS_WITH_FOLD : CLAIMS_WITHOUT_FOLD,
    });

  if (options.basis.kind !== 'female') {
    const status = requestedTargetMm == null ? 'unrequested' : 'notApplicable';
    return finish({
      status,
      diagnostics:
        status === 'notApplicable'
          ? [
              diagnostic(
                'basis-not-applicable',
                'chestCircumferenceMm',
                'Female bust proxy does not apply to this basis.',
              ),
            ]
          : [],
    });
  }
  if (requestedTargetMm == null) return finish({ status: 'unrequested' });
  if (!Number.isFinite(requestedTargetMm) || requestedTargetMm <= 0) {
    return finish({
      status: 'notApplied',
      diagnostics: [
        diagnostic('target-invalid', 'chestCircumferenceMm', 'Chest target is invalid.'),
      ],
    });
  }
  if (
    requestedUnderBustMm != null &&
    (!Number.isFinite(requestedUnderBustMm) || requestedUnderBustMm <= 0)
  ) {
    return finish({
      status: 'notApplied',
      underBust: emptyUnderBust('notApplied', requestedUnderBustMm),
      diagnostics: [
        diagnostic('target-invalid', 'underBustCircumferenceMm', 'Under-bust target is invalid.'),
      ],
    });
  }
  if (!Number.isFinite(options.heightMm) || options.heightMm <= 0) {
    return finish({
      status: 'notApplied',
      diagnostics: [diagnostic('input-invalid', 'chestCircumferenceMm', 'Height is invalid.')],
    });
  }
  if (
    options.basis.positionsSourceUnits.length !== original.length ||
    options.deltaBundle.visibleBodyVertexCount * 3 !== original.length
  ) {
    throw new Error('Female basis, sparse delta, and display mesh topology do not match.');
  }

  const sourceHeight = options.basis.sourceMaximumY - options.basis.sourceMinimumY;
  const scaleMPerSourceUnit = options.heightMm / 1000 / sourceHeight;
  if (!Number.isFinite(scaleMPerSourceUnit) || scaleMPerSourceUnit <= 0) {
    throw new Error('Female bust source-to-display scale is invalid.');
  }
  let maximumFieldDeltaY = 0;
  for (let record = 0; record < options.deltaBundle.vertexIndices.length; record += 1) {
    maximumFieldDeltaY = Math.max(
      maximumFieldDeltaY,
      Math.abs(options.deltaBundle.deltasSourceUnits[record * 3 + 1]),
    );
  }
  // Every section below is horizontal between the lowest band-table row and the armpit line.
  // The extra millimetre covers plane and weld tolerances; numerical, not a body claim.
  const sectionTriangles = trianglesNearHeights({
    positionsM: original,
    triangleIndices: options.triangleIndices,
    minimumY: Math.min(
      options.underBustStationOriginM[1] - BAND_TAIL_MAXIMUM_M - TORSO_TABLE_STEP_M,
      options.apexStation?.originM[1] ?? Number.POSITIVE_INFINITY,
    ),
    maximumY: Math.max(
      options.armpitMergeStationOriginM[1],
      options.apexStation?.originM[1] ?? Number.NEGATIVE_INFINITY,
    ),
    reachM:
      maximumFieldDeltaY *
        scaleMPerSourceUnit *
        Math.max(-policy.minimumCoefficient, policy.maximumCoefficient) +
      0.001,
  });

  let apexStation: MeasurementOpenReferenceFemaleBustApexStationV1;
  let support: BandSupportV1;
  try {
    apexStation =
      options.apexStation ??
      findMeasurementOpenReferenceFemaleBustApexPlaneV1({
        positionsM: original,
        triangleIndices: sectionTriangles,
        underBustStationOriginM: options.underBustStationOriginM,
        armpitMergeStationOriginM: options.armpitMergeStationOriginM,
        policy,
      });
    support = bandSupport({
      sourcePositionsM: original,
      triangleIndices: sectionTriangles,
      underBustStationOriginM: options.underBustStationOriginM,
      armpitLineOriginM: options.armpitMergeStationOriginM,
      heightMm: options.heightMm,
    });
  } catch (reason: unknown) {
    return finish({
      status: 'notApplied',
      diagnostics: [
        diagnostic(
          'section-invalid',
          'chestCircumferenceMm',
          reason instanceof Error ? reason.message : String(reason),
        ),
      ],
    });
  }

  const candidate = (bandCoefficient: number, bustCoefficient: number) =>
    applySignedDelta({
      positionsM: applyBand(original, support, bandCoefficient, policy),
      sourcePositionsM: original,
      deltaBundle: options.deltaBundle,
      coefficient: bustCoefficient,
      scaleMPerSourceUnit,
      falloff: {
        underBustY: options.underBustStationOriginM[1],
        apexY: apexStation.originM[1],
        armpitY: options.armpitMergeStationOriginM[1],
        positiveSideFold: policy.positiveSideFoldFalloff,
      },
    });
  const measureApex = (positionsM: Float32Array) =>
    tapeGirthMm({ positionsM, triangleIndices: sectionTriangles, originM: apexStation.originM });
  const measureUnderBust = (positionsM: Float32Array) =>
    girthMm({
      positionsM,
      triangleIndices: sectionTriangles,
      originM: options.underBustStationOriginM,
    });
  const measureArmpitLine = (positionsM: Float32Array) =>
    girthMm({
      positionsM,
      triangleIndices: sectionTriangles,
      originM: options.armpitMergeStationOriginM,
    });
  const qualityOf = (positionsM: Float32Array) =>
    evaluateMeasurementOpenReferenceDisplayQualityV1({
      uniformPositionsM: original,
      personalizedPositionsM: positionsM,
      triangleIndices: options.triangleIndices,
    });

  const diagnostics: MeasurementOpenReferenceFemaleBustProxyDiagnosticV1[] = [];
  let bandCoefficient = 0;
  let bustCoefficient = 0;
  let safeFraction = 1;
  let chestEndpoint = false;
  let finalPositions = original;
  let finalQualityGate: MeasurementOpenReferenceDisplayQualityGateResultV1 | undefined;
  let solveIterations = 0;
  const bandMinimum = policy.minimumBandCoefficient;
  const bandMaximum = policy.maximumBandCoefficient;
  const atBandEndpoint = (coefficient: number) =>
    Math.abs(coefficient - bandMinimum) < 1e-9 || Math.abs(coefficient - bandMaximum) < 1e-9;
  const atBustEndpoint = (coefficient: number) =>
    Math.abs(coefficient - policy.minimumCoefficient) < 1e-9 ||
    Math.abs(coefficient - policy.maximumCoefficient) < 1e-9;
  const solveBandForUnderBust = (targetMm: number, bust: number) =>
    solveMonotonicCoefficient({
      minimum: bandMinimum,
      maximum: bandMaximum,
      targetMm,
      iterations: policy.binarySearchIterations,
      measure: (coefficient) => measureUnderBust(candidate(coefficient, bust)),
    });
  const solveBustForChest = (band: number) =>
    solveMonotonicCoefficient({
      minimum: policy.minimumCoefficient,
      maximum: policy.maximumCoefficient,
      targetMm: requestedTargetMm,
      iterations: policy.binarySearchIterations,
      measure: (coefficient) => measureApex(candidate(band, coefficient)),
    });
  try {
    if (requestedUnderBustMm != null) {
      const residuals = (band: number, bust: number) => {
        const positionsM = candidate(band, bust);
        return Object.freeze({
          underBustMm: measureUnderBust(positionsM) - requestedUnderBustMm,
          chestMm: measureApex(positionsM) - requestedTargetMm,
        });
      };
      const closed = (value: ReturnType<typeof residuals>) =>
        Math.abs(value.underBustMm) <= policy.maximumUnderBustResidualMm &&
        Math.abs(value.chestMm) <= policy.maximumChestResidualMm;
      let residual = residuals(bandCoefficient, bustCoefficient);
      for (let iteration = 0; iteration < policy.maximumClosureRounds; iteration += 1) {
        // Finite-difference steps: numerical resolution, not a body claim.
        const bandStep = 0.002;
        const bustStep = 0.01;
        const bandResidual = residuals(bandCoefficient + bandStep, bustCoefficient);
        const bustResidual = residuals(bandCoefficient, bustCoefficient + bustStep);
        const underBustByBand = (bandResidual.underBustMm - residual.underBustMm) / bandStep;
        const underBustByBust = (bustResidual.underBustMm - residual.underBustMm) / bustStep;
        const chestByBand = (bandResidual.chestMm - residual.chestMm) / bandStep;
        const chestByBust = (bustResidual.chestMm - residual.chestMm) / bustStep;
        const determinant = underBustByBand * chestByBust - underBustByBust * chestByBand;
        if (!Number.isFinite(determinant) || Math.abs(determinant) < 1e-9) {
          throw new Error('Signed coefficient response is not increasing.');
        }
        const bandDelta =
          (-residual.underBustMm * chestByBust + residual.chestMm * underBustByBust) / determinant;
        const bustDelta =
          (-underBustByBand * residual.chestMm + chestByBand * residual.underBustMm) / determinant;
        bandCoefficient = Math.max(bandMinimum, Math.min(bandMaximum, bandCoefficient + bandDelta));
        bustCoefficient = Math.max(
          policy.minimumCoefficient,
          Math.min(policy.maximumCoefficient, bustCoefficient + bustDelta),
        );
        residual = residuals(bandCoefficient, bustCoefficient);
        solveIterations = iteration + 1;
        if (closed(residual)) break;
        if (atBandEndpoint(bandCoefficient) || atBustEndpoint(bustCoefficient)) break;
      }

      // One-dimensional finish when Newton stopped at a bound or did not close: hold the field,
      // solve the band for under bust; hold the band, solve the field for chest; alternate.
      if (!closed(residual)) {
        for (let round = 0; round < MAXIMUM_FINISH_ROUNDS; round += 1) {
          const previousBand = bandCoefficient;
          const previousBust = bustCoefficient;
          bandCoefficient = solveBandForUnderBust(
            requestedUnderBustMm,
            bustCoefficient,
          ).coefficient;
          bustCoefficient = solveBustForChest(bandCoefficient).coefficient;
          residual = residuals(bandCoefficient, bustCoefficient);
          solveIterations += 1;
          if (Math.abs(residual.underBustMm) <= policy.maximumUnderBustResidualMm) break;
          if (
            Math.abs(bandCoefficient - previousBand) < 1e-9 &&
            Math.abs(bustCoefficient - previousBust) < 1e-9
          ) {
            break;
          }
        }
      }
      chestEndpoint = atBustEndpoint(bustCoefficient);
    } else {
      const bandSolve = solveMonotonicCoefficient({
        minimum: bandMinimum,
        maximum: bandMaximum,
        targetMm: requestedTargetMm,
        iterations: policy.binarySearchIterations,
        measure: (coefficient) => measureApex(candidate(coefficient, 0)),
      });
      bandCoefficient = bandSolve.coefficient;
      solveIterations = 1;
      if (bandSolve.endpoint) {
        const chestSolve = solveBustForChest(bandCoefficient);
        bustCoefficient = chestSolve.coefficient;
        chestEndpoint = chestSolve.endpoint;
      }
    }

    finalPositions = candidate(bandCoefficient, bustCoefficient);
    finalQualityGate = qualityOf(finalPositions);
    if (!finalQualityGate.safe) {
      // Joint fraction: the field is scaled back while, at every fraction step, the band is
      // re-solved for the requested under bust. Without an under-bust request the band stays.
      const bandAt = (bust: number) =>
        requestedUnderBustMm == null
          ? bandCoefficient
          : solveBandForUnderBust(requestedUnderBustMm, bust).coefficient;
      const zeroBand = bandAt(0);
      const zeroCandidate = candidate(zeroBand, 0);
      const zeroGate = qualityOf(zeroCandidate);
      if (!zeroGate.safe) throw new Error('Under-bust band has no locally safe baseline.');
      let low = 0;
      let high = 1;
      let bestBand = zeroBand;
      let bestPositions = zeroCandidate;
      let bestGate = zeroGate;
      for (let iteration = 0; iteration < policy.qualitySearchIterations; iteration += 1) {
        const fraction = (low + high) / 2;
        const trialBust = bustCoefficient * fraction;
        const trialBand = bandAt(trialBust);
        const trial = candidate(trialBand, trialBust);
        const gate = qualityOf(trial);
        if (gate.safe) {
          low = fraction;
          bestBand = trialBand;
          bestPositions = trial;
          bestGate = gate;
        } else {
          high = fraction;
        }
      }
      safeFraction = low;
      bustCoefficient *= safeFraction;
      bandCoefficient = bestBand;
      finalPositions = bestPositions;
      finalQualityGate = bestGate;
    }
  } catch (reason: unknown) {
    return finish({
      status: 'notApplied',
      apexStation,
      diagnostics: [
        diagnostic(
          /increasing/u.test(reason instanceof Error ? reason.message : String(reason))
            ? 'direction-response-invalid'
            : 'section-invalid',
          'chestCircumferenceMm',
          reason instanceof Error ? reason.message : String(reason),
        ),
      ],
    });
  }

  const achievedMm = measureApex(finalPositions);
  const absoluteResidualMm = Math.abs(achievedMm - requestedTargetMm);
  const achievedUnderBustMm = measureUnderBust(finalPositions);
  const underBustResidualMm =
    requestedUnderBustMm == null ? null : Math.abs(achievedUnderBustMm - requestedUnderBustMm);
  const underBustEndpoint = requestedUnderBustMm != null && atBandEndpoint(bandCoefficient);
  const qualityLimited = safeFraction < 1 - 1e-6;
  let fullestSectionY = options.underBustStationOriginM[1];
  let fullestSectionGirthMm = Number.NEGATIVE_INFINITY;
  for (
    let y = options.underBustStationOriginM[1];
    y <= options.armpitMergeStationOriginM[1] + 1e-9;
    y += 0.001
  ) {
    const sectionGirthMm = girthMm({
      positionsM: finalPositions,
      triangleIndices: sectionTriangles,
      originM: [options.armpitMergeStationOriginM[0], y, options.armpitMergeStationOriginM[2]],
    });
    if (sectionGirthMm > fullestSectionGirthMm) {
      fullestSectionGirthMm = sectionGirthMm;
      fullestSectionY = y;
    }
  }
  const fullestSectionOffsetMm = (fullestSectionY - apexStation.originM[1]) * 1000;
  const armpitLineGirthMm = measureArmpitLine(finalPositions);
  if (chestEndpoint) {
    diagnostics.push(
      diagnostic(
        'coefficient-endpoint',
        'chestCircumferenceMm',
        'Chest target reached a deformation-safety endpoint.',
      ),
    );
  }
  if (qualityLimited) {
    diagnostics.push(
      diagnostic(
        'quality-fraction-limited',
        'chestCircumferenceMm',
        'Chest target was limited to the locally safe fraction.',
      ),
    );
  }
  if (underBustEndpoint) {
    diagnostics.push(
      diagnostic(
        'underbust-endpoint',
        'underBustCircumferenceMm',
        'Under-bust target reached a deformation-safety endpoint.',
      ),
    );
  }
  // The band is re-solved for under bust after every field change, so a residual above tolerance
  // away from the band bound means the closure itself failed; it is never reported represented.
  const underBustClosureLimited =
    underBustResidualMm != null && underBustResidualMm > policy.maximumUnderBustResidualMm;
  if (underBustClosureLimited) {
    diagnostics.push(
      diagnostic(
        'underbust-closure-limited',
        'underBustCircumferenceMm',
        'Under-bust closure did not reach tolerance.',
      ),
    );
  }
  // Safety net only: away from an endpoint the last step always re-solves the field for chest.
  const limited =
    chestEndpoint || qualityLimited || absoluteResidualMm > policy.maximumChestResidualMm;
  return finish({
    status: limited ? 'limited' : 'represented',
    positionsM: finalPositions,
    apexStation,
    modeResult: Object.freeze({
      requestedTargetMm,
      achievedMm,
      absoluteResidualMm,
      coefficient: bustCoefficient,
      safeFraction,
      endpoint: chestEndpoint,
      fullestSectionOffsetMm,
      armpitLineGirthMm,
      solveIterations,
    }),
    underBust: Object.freeze({
      status:
        requestedUnderBustMm == null
          ? ('unrequested' as const)
          : underBustEndpoint || underBustClosureLimited
            ? ('limited' as const)
            : ('represented' as const),
      requestedTargetMm: requestedUnderBustMm ?? null,
      achievedMm: achievedUnderBustMm,
      absoluteResidualMm: underBustResidualMm,
      coefficient: bandCoefficient,
      closureRounds: solveIterations,
    }),
    diagnostics,
    qualityGate: finalQualityGate,
  });
}

export function isFemaleBustProxyApplicableV1(
  basisKind: MakeHumanOpenReferenceBasisKindV1,
): basisKind is 'female' {
  return basisKind === 'female';
}
