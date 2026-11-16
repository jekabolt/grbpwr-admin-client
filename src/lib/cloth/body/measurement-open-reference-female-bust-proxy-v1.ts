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

export const MEASUREMENT_OPEN_REFERENCE_FEMALE_BUST_PROXY_V1 =
  'measurement-open-reference-female-bust-proxy/v1' as const;

export interface MeasurementOpenReferenceFemaleBustProxyPolicyV1 {
  /** Signed sparse-field deformation-safety endpoint, not a calibrated body range. */
  readonly minimumCoefficient: -1;
  /** Signed sparse-field deformation-safety endpoint, not a calibrated body range. */
  readonly maximumCoefficient: 1.5;
  readonly maximumBandCoefficientMagnitude: number;
  readonly apexSearchStepM: number;
  readonly binarySearchIterations: number;
  readonly qualitySearchIterations: number;
  readonly maximumChestResidualMm: number;
  readonly maximumUnderBustResidualMm: number;
  readonly maximumClosureRounds: number;
}

export const DEFAULT_MEASUREMENT_OPEN_REFERENCE_FEMALE_BUST_PROXY_POLICY_V1 = Object.freeze({
  minimumCoefficient: -1 as const,
  maximumCoefficient: 1.5 as const,
  maximumBandCoefficientMagnitude: 0.18,
  apexSearchStepM: 0.001,
  binarySearchIterations: 18,
  qualitySearchIterations: 14,
  maximumChestResidualMm: 1,
  maximumUnderBustResidualMm: 0.5,
  maximumClosureRounds: 3,
} satisfies MeasurementOpenReferenceFemaleBustProxyPolicyV1);

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
  readonly claims: typeof CLAIMS;
}

const CLAIMS = Object.freeze({
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
});

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
    'maximumBandCoefficientMagnitude',
    'apexSearchStepM',
    'maximumChestResidualMm',
    'maximumUnderBustResidualMm',
  ] as const) {
    if (!Number.isFinite(policy[key]) || policy[key] <= 0) {
      throw new RangeError(`${key} must be finite and positive.`);
    }
  }
  if (policy.maximumBandCoefficientMagnitude > 0.25) {
    throw new RangeError('maximumBandCoefficientMagnitude exceeds the admitted envelope.');
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
  readonly xRadius: number;
  readonly zRadius: number;
  readonly bandRadiusM: number;
}

function bandSupport(options: {
  readonly sourcePositionsM: Float32Array;
  readonly triangleIndices: Uint16Array | Uint32Array;
  readonly underBustStationOriginM: MeshPlaneSectionVec3V1;
  readonly heightMm: number;
}): BandSupportV1 {
  const loop = selectedLoop({
    positionsM: options.sourcePositionsM,
    triangleIndices: options.triangleIndices,
    originM: options.underBustStationOriginM,
  });
  const [centerX, stationY, centerZ] = loop.centroidM;
  return Object.freeze({
    centerX,
    centerZ,
    stationY,
    xRadius: Math.max(...loop.pointsM.map((point) => Math.abs(point[0] - centerX)), 0.001),
    zRadius: Math.max(...loop.pointsM.map((point) => Math.abs(point[2] - centerZ)), 0.001),
    bandRadiusM: Math.max(0.04, Math.min(0.075, options.heightMm / 25_000)),
  });
}

function applyBand(
  sourcePositionsM: Float32Array,
  support: BandSupportV1,
  coefficient: number,
): Float32Array {
  const result = sourcePositionsM.slice();
  if (coefficient === 0) return result;
  for (let vertex = 0; vertex < result.length / 3; vertex += 1) {
    const offset = vertex * 3;
    const x = sourcePositionsM[offset];
    const y = sourcePositionsM[offset + 1];
    const z = sourcePositionsM[offset + 2];
    if (
      Math.abs(x - support.centerX) > support.xRadius * 1.2 ||
      Math.abs(z - support.centerZ) > support.zRadius * 1.25
    ) {
      continue;
    }
    const weight = smoothstep01(1 - Math.abs(y - support.stationY) / support.bandRadiusM);
    if (weight <= 0) continue;
    result[offset] = x + (x - support.centerX) * coefficient * weight;
    result[offset + 2] = z + (z - support.centerZ) * coefficient * weight;
  }
  return result;
}

function applySignedDelta(options: {
  readonly positionsM: Float32Array;
  readonly deltaBundle: MakeHumanFemaleBustDeltaBundleV1;
  readonly coefficient: number;
  readonly scaleMPerSourceUnit: number;
}): Float32Array {
  const result = options.positionsM.slice();
  for (let record = 0; record < options.deltaBundle.vertexIndices.length; record += 1) {
    const vertexOffset = options.deltaBundle.vertexIndices[record] * 3;
    const deltaOffset = record * 3;
    result[vertexOffset] -=
      options.coefficient *
      options.deltaBundle.deltasSourceUnits[deltaOffset] *
      options.scaleMPerSourceUnit;
    result[vertexOffset + 1] -=
      options.coefficient *
      options.deltaBundle.deltasSourceUnits[deltaOffset + 1] *
      options.scaleMPerSourceUnit;
    result[vertexOffset + 2] -=
      options.coefficient *
      options.deltaBundle.deltasSourceUnits[deltaOffset + 2] *
      options.scaleMPerSourceUnit;
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
 * interval is only a deformation-safety bound; it carries no calibrated circumference claim.
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
      claims: CLAIMS,
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

  let apexStation: MeasurementOpenReferenceFemaleBustApexStationV1;
  let support: BandSupportV1;
  try {
    apexStation =
      options.apexStation ??
      findMeasurementOpenReferenceFemaleBustApexPlaneV1({
        positionsM: original,
        triangleIndices: options.triangleIndices,
        underBustStationOriginM: options.underBustStationOriginM,
        armpitMergeStationOriginM: options.armpitMergeStationOriginM,
        policy,
      });
    support = bandSupport({
      sourcePositionsM: original,
      triangleIndices: options.triangleIndices,
      underBustStationOriginM: options.underBustStationOriginM,
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

  const sourceHeight = options.basis.sourceMaximumY - options.basis.sourceMinimumY;
  const scaleMPerSourceUnit = options.heightMm / 1000 / sourceHeight;
  if (!Number.isFinite(scaleMPerSourceUnit) || scaleMPerSourceUnit <= 0) {
    throw new Error('Female bust source-to-display scale is invalid.');
  }
  const candidate = (bandCoefficient: number, bustCoefficient: number) =>
    applySignedDelta({
      positionsM: applyBand(original, support, bandCoefficient),
      deltaBundle: options.deltaBundle,
      coefficient: bustCoefficient,
      scaleMPerSourceUnit,
    });
  const measureApex = (positionsM: Float32Array) =>
    girthMm({ positionsM, triangleIndices: options.triangleIndices, originM: apexStation.originM });
  const measureUnderBust = (positionsM: Float32Array) =>
    girthMm({
      positionsM,
      triangleIndices: options.triangleIndices,
      originM: options.underBustStationOriginM,
    });

  const diagnostics: MeasurementOpenReferenceFemaleBustProxyDiagnosticV1[] = [];
  let bandCoefficient = 0;
  let bustCoefficient = 0;
  let safeFraction = 1;
  let chestEndpoint = false;
  let underBustEndpoint = false;
  let finalPositions = original;
  let finalQualityGate: MeasurementOpenReferenceDisplayQualityGateResultV1 | undefined;
  let closureRounds = 0;
  try {
    for (let round = 1; round <= policy.maximumClosureRounds; round += 1) {
      closureRounds = round;
      if (requestedUnderBustMm != null) {
        const bandSolve = solveMonotonicCoefficient({
          minimum: -policy.maximumBandCoefficientMagnitude,
          maximum: policy.maximumBandCoefficientMagnitude,
          targetMm: requestedUnderBustMm,
          iterations: policy.binarySearchIterations,
          measure: (coefficient) => measureUnderBust(candidate(coefficient, bustCoefficient)),
        });
        bandCoefficient = bandSolve.coefficient;
        underBustEndpoint ||= bandSolve.endpoint;
      }

      const chestSolve = solveMonotonicCoefficient({
        minimum: policy.minimumCoefficient,
        maximum: policy.maximumCoefficient,
        targetMm: requestedTargetMm,
        iterations: policy.binarySearchIterations,
        measure: (coefficient) => measureApex(candidate(bandCoefficient, coefficient)),
      });
      bustCoefficient = chestSolve.coefficient;
      chestEndpoint = chestSolve.endpoint;
      safeFraction = 1;
      finalPositions = candidate(bandCoefficient, bustCoefficient);
      finalQualityGate = evaluateMeasurementOpenReferenceDisplayQualityV1({
        uniformPositionsM: original,
        personalizedPositionsM: finalPositions,
        triangleIndices: options.triangleIndices,
      });
      if (!finalQualityGate.safe) {
        const zeroCandidate = candidate(bandCoefficient, 0);
        const zeroGate = evaluateMeasurementOpenReferenceDisplayQualityV1({
          uniformPositionsM: original,
          personalizedPositionsM: zeroCandidate,
          triangleIndices: options.triangleIndices,
        });
        if (!zeroGate.safe) throw new Error('Under-bust band has no locally safe baseline.');
        let low = 0;
        let high = 1;
        let bestPositions = zeroCandidate;
        let bestGate = zeroGate;
        for (let iteration = 0; iteration < policy.qualitySearchIterations; iteration += 1) {
          const fraction = (low + high) / 2;
          const trial = candidate(bandCoefficient, bustCoefficient * fraction);
          const gate = evaluateMeasurementOpenReferenceDisplayQualityV1({
            uniformPositionsM: original,
            personalizedPositionsM: trial,
            triangleIndices: options.triangleIndices,
          });
          if (gate.safe) {
            low = fraction;
            bestPositions = trial;
            bestGate = gate;
          } else {
            high = fraction;
          }
        }
        safeFraction = low;
        bustCoefficient *= safeFraction;
        finalPositions = bestPositions;
        finalQualityGate = bestGate;
      }
      if (
        requestedUnderBustMm == null ||
        Math.abs(measureUnderBust(finalPositions) - requestedUnderBustMm) <=
          policy.maximumUnderBustResidualMm
      ) {
        break;
      }
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
  const achievedUnderBustMm =
    requestedUnderBustMm == null ? null : measureUnderBust(finalPositions);
  const underBustResidualMm =
    requestedUnderBustMm == null || achievedUnderBustMm == null
      ? null
      : Math.abs(achievedUnderBustMm - requestedUnderBustMm);
  const qualityLimited = safeFraction < 1 - 1e-6;
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
  const underBustClosureLimited =
    underBustResidualMm != null && underBustResidualMm > policy.maximumUnderBustResidualMm;
  if (underBustClosureLimited) {
    diagnostics.push(
      diagnostic(
        'underbust-closure-limited',
        'underBustCircumferenceMm',
        'Under-bust closure stopped after three rounds.',
      ),
    );
  }
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
      closureRounds,
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
