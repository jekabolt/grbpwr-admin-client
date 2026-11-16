import {
  evaluateMeasurementOpenReferenceDisplayQualityWithSelfIntersectionV1,
  type MeasurementOpenReferenceDisplayQualityGateResultV1,
} from './measurement-open-reference-display-quality-gate-v1';
import {
  measureMeshPlaneSectionPerimetersV1,
  type MeshPlaneSectionLoopV1,
  type MeshPlaneSectionVec3V1,
} from './mesh-plane-section-perimeter-v1';

export const MEASUREMENT_OPEN_REFERENCE_HIGH_HIP_PROXY_V1 =
  'measurement-open-reference-high-hip-proxy/v1' as const;

/**
 * The project measurement protocol defines high hip as a horizontal plane 100 mm below the
 * natural waist. This is the protocol definition, not a fitted or calibrated offset; an explicit
 * `waistToHighHipMm` measurement replaces it.
 */
export const MEASUREMENT_OPEN_REFERENCE_HIGH_HIP_PROTOCOL_WAIST_DROP_MM_V1 = 100;

export interface MeasurementOpenReferenceHighHipProxyPolicyV1 {
  /** Deformation-safety bound on the section scale (not a calibrated circumference range). */
  readonly minimumScale: number;
  /** Deformation-safety bound on the section scale (not a calibrated circumference range). */
  readonly maximumScale: number;
  readonly maximumVerticalRadiusM: number;
  /** Below this vertical support the band would be a visible ridge, so the proxy is not applied. */
  readonly minimumVerticalRadiusM: number;
  /** Vertical radius = fraction x distance to the nearer of the waist and hip stations. */
  readonly stationDistanceRadiusFraction: number;
  readonly binarySearchIterations: number;
  readonly maximumCircumferenceResidualMm: number;
  readonly maximumProtectedDriftMm: number;
  readonly minimumDirectionalResponseMm: number;
  readonly minimumMonotonicStepMm: number;
}

/**
 * Same envelope family as the torso-depth proxy. The 0.5 mm residual/drift tolerance is a
 * proxy tolerance, deliberately looser than the 0.1 mm waist/hip solver policy: a smoothstep
 * section scale cannot hit 0.1 mm on triangle-sampled loops without overfitting the band, and the
 * proxy is a visual reference only. The +/-10% scale is a deformation-safety limit with no
 * population evidence behind it.
 */
export const DEFAULT_MEASUREMENT_OPEN_REFERENCE_HIGH_HIP_PROXY_POLICY_V1 = Object.freeze({
  minimumScale: 0.9,
  maximumScale: 1.1,
  maximumVerticalRadiusM: 0.075,
  minimumVerticalRadiusM: 0.006,
  stationDistanceRadiusFraction: 0.45,
  binarySearchIterations: 18,
  maximumCircumferenceResidualMm: 0.5,
  maximumProtectedDriftMm: 0.5,
  minimumDirectionalResponseMm: 0.25,
  minimumMonotonicStepMm: 0.01,
} satisfies MeasurementOpenReferenceHighHipProxyPolicyV1);

export type MeasurementOpenReferenceHighHipStatusV1 =
  | 'unrequested'
  | 'represented'
  | 'limited'
  | 'notApplied';

export type MeasurementOpenReferenceHighHipDiagnosticCodeV1 =
  | 'closure-unsafe'
  | 'combined-quality-unsafe'
  | 'direction-response-invalid'
  | 'input-invalid'
  | 'residual-unsafe'
  | 'section-invalid'
  | 'station-order'
  | 'target-limited'
  | 'target-unreachable';

export interface MeasurementOpenReferenceHighHipDiagnosticV1 {
  readonly code: MeasurementOpenReferenceHighHipDiagnosticCodeV1;
  readonly message: string;
}

export interface MeasurementOpenReferenceHighHipStationV1 {
  readonly originM: MeshPlaneSectionVec3V1;
  readonly verticalRadiusM: number;
  readonly waistDropMm: number;
  readonly waistDistanceM: number;
  readonly hipDistanceM: number;
}

export type MeasurementOpenReferenceHighHipStationResolutionV1 =
  | Readonly<{ ok: true; station: MeasurementOpenReferenceHighHipStationV1 }>
  | Readonly<{ ok: false; diagnostic: MeasurementOpenReferenceHighHipDiagnosticV1 }>;

export interface MeasurementOpenReferenceHighHipModeResultV1 {
  readonly targetCircumferenceMm: number;
  readonly boundedTargetCircumferenceMm: number;
  readonly baselineCircumferenceMm: number;
  readonly achievedCircumferenceMm: number;
  readonly sectionScale: number;
  readonly fraction: number;
  readonly maximumProtectedPerimeterDriftMm: number;
  readonly maximumProtectedDepthDriftMm: number;
  readonly shoulderChordDriftMm: number;
}

export interface MeasurementOpenReferenceHighHipProxyResultV1 {
  readonly version: typeof MEASUREMENT_OPEN_REFERENCE_HIGH_HIP_PROXY_V1;
  readonly role: 'CC0_OPEN_REFERENCE_BOUNDED_VISUAL_PROXY';
  readonly status: MeasurementOpenReferenceHighHipStatusV1;
  readonly positionsM: Float32Array;
  readonly station?: MeasurementOpenReferenceHighHipStationV1;
  readonly modeResult?: MeasurementOpenReferenceHighHipModeResultV1;
  readonly diagnostics: readonly MeasurementOpenReferenceHighHipDiagnosticV1[];
  readonly qualityGate?: MeasurementOpenReferenceDisplayQualityGateResultV1;
  readonly claims: typeof CLAIMS;
}

const CLAIMS = Object.freeze({
  visualReferenceOnly: true as const,
  geometricProxyOnly: true as const,
  uniformHorizontalSectionScaleOnly: true as const,
  deformationSafetyBoundOnly: true as const,
  circumferenceRangeCalibrated: false as const,
  stationFromProtocolOffsetNotLandmark: true as const,
  canonicalMeasurementSemanticMatchClaimed: false as const,
  anatomicalTapePathEquivalent: false as const,
  populationRepresentativenessClaimed: false as const,
  fitClaimEligible: false as const,
  runtimeCollisionEligible: false as const,
});

type StationSnapshotV1 = Readonly<{
  depthMm: number;
  perimeterMm: number;
  centerX: number;
  centerZ: number;
  radiusX: number;
}>;

function policySnapshot(
  input: Partial<MeasurementOpenReferenceHighHipProxyPolicyV1> | undefined,
): MeasurementOpenReferenceHighHipProxyPolicyV1 {
  const policy = { ...DEFAULT_MEASUREMENT_OPEN_REFERENCE_HIGH_HIP_PROXY_POLICY_V1, ...input };
  if (
    !Number.isFinite(policy.minimumScale) ||
    !Number.isFinite(policy.maximumScale) ||
    policy.minimumScale <= 0 ||
    policy.minimumScale >= 1 ||
    policy.maximumScale <= 1 ||
    policy.maximumScale > 1.25
  ) {
    throw new RangeError('High-hip scale envelope is invalid.');
  }
  if (
    !Number.isSafeInteger(policy.binarySearchIterations) ||
    policy.binarySearchIterations < 1 ||
    policy.binarySearchIterations > 32
  ) {
    throw new RangeError('binarySearchIterations must be an integer within 1..32.');
  }
  if (
    !Number.isFinite(policy.stationDistanceRadiusFraction) ||
    policy.stationDistanceRadiusFraction <= 0 ||
    policy.stationDistanceRadiusFraction >= 0.5
  ) {
    throw new RangeError('stationDistanceRadiusFraction must be within (0, 0.5).');
  }
  for (const key of [
    'maximumVerticalRadiusM',
    'minimumVerticalRadiusM',
    'maximumCircumferenceResidualMm',
    'maximumProtectedDriftMm',
    'minimumDirectionalResponseMm',
    'minimumMonotonicStepMm',
  ] as const) {
    if (!Number.isFinite(policy[key]) || policy[key] <= 0) {
      throw new RangeError(`${key} must be finite and positive.`);
    }
  }
  if (policy.minimumVerticalRadiusM > policy.maximumVerticalRadiusM) {
    throw new RangeError('minimumVerticalRadiusM must not exceed maximumVerticalRadiusM.');
  }
  return Object.freeze(policy);
}

function validateMesh(positionsM: Float32Array, triangleIndices: Uint16Array | Uint32Array): void {
  if (!(positionsM instanceof Float32Array) || positionsM.length === 0 || positionsM.length % 3) {
    throw new TypeError('sourcePositionsM must be a non-empty XYZ Float32Array.');
  }
  if (!(triangleIndices instanceof Uint16Array) && !(triangleIndices instanceof Uint32Array)) {
    throw new TypeError('triangleIndices must be Uint16Array or Uint32Array.');
  }
  if (triangleIndices.length === 0 || triangleIndices.length % 3) {
    throw new RangeError('triangleIndices must contain complete triangles.');
  }
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
      measured.ok ? 'High-hip section selection failed.' : measured.errors.join('; '),
    );
  }
  return measured.selectedLoop;
}

function stationSnapshot(options: {
  readonly positionsM: Float32Array;
  readonly triangleIndices: Uint16Array | Uint32Array;
  readonly originM: MeshPlaneSectionVec3V1;
}): StationSnapshotV1 {
  const loop = selectedLoop(options);
  let minimumX = Number.POSITIVE_INFINITY;
  let maximumX = Number.NEGATIVE_INFINITY;
  let minimumZ = Number.POSITIVE_INFINITY;
  let maximumZ = Number.NEGATIVE_INFINITY;
  for (const point of loop.pointsM) {
    minimumX = Math.min(minimumX, point[0]);
    maximumX = Math.max(maximumX, point[0]);
    minimumZ = Math.min(minimumZ, point[2]);
    maximumZ = Math.max(maximumZ, point[2]);
  }
  return Object.freeze({
    depthMm: (maximumZ - minimumZ) * 1000,
    perimeterMm: loop.perimeterM * 1000,
    centerX: (minimumX + maximumX) / 2,
    centerZ: (minimumZ + maximumZ) / 2,
    radiusX: Math.max((maximumX - minimumX) / 2, 0.001),
  });
}

function smoothstep01(value: number): number {
  const bounded = Math.min(1, Math.max(0, value));
  return bounded * bounded * (3 - 2 * bounded);
}

/** Same weight family as the torso-depth proxy: flat to 0.7 r, smoothstep to zero at r. */
function verticalWeight(distanceM: number, radiusM: number): number {
  const normalized = Math.abs(distanceM) / radiusM;
  if (normalized <= 0.7) return 1;
  return smoothstep01((1 - normalized) / 0.3);
}

/** Keeps hanging arms/hands out of the band: flat to 1.15 rx, faded out by 1.45 rx. */
function horizontalWeight(distanceM: number, radiusM: number): number {
  const normalized = Math.abs(distanceM) / radiusM;
  if (normalized <= 1.15) return 1;
  return smoothstep01((1.45 - normalized) / 0.3);
}

function applyUniformSectionScale(options: {
  readonly sourcePositionsM: Float32Array;
  readonly originM: MeshPlaneSectionVec3V1;
  readonly snapshot: StationSnapshotV1;
  readonly verticalRadiusM: number;
  readonly scale: number;
}): Float32Array {
  const result = options.sourcePositionsM.slice();
  for (let vertex = 0; vertex < result.length / 3; vertex += 1) {
    const offset = vertex * 3;
    const yWeight = verticalWeight(
      result[offset + 1] - options.originM[1],
      options.verticalRadiusM,
    );
    if (yWeight <= 0) continue;
    const xWeight = horizontalWeight(
      result[offset] - options.snapshot.centerX,
      options.snapshot.radiusX,
    );
    const weight = yWeight * xWeight;
    if (weight <= 0) continue;
    const factor = 1 + (options.scale - 1) * weight;
    result[offset] =
      options.snapshot.centerX + (result[offset] - options.snapshot.centerX) * factor;
    result[offset + 2] =
      options.snapshot.centerZ + (result[offset + 2] - options.snapshot.centerZ) * factor;
  }
  return result;
}

function shoulderChordMm(
  positionsM: Float32Array,
  vertices: Readonly<{ negative: number; positive: number }> | undefined,
): number | null {
  if (!vertices) return null;
  const negative = vertices.negative * 3;
  const positive = vertices.positive * 3;
  if (
    negative < 0 ||
    positive < 0 ||
    negative + 2 >= positionsM.length ||
    positive + 2 >= positionsM.length
  ) {
    return null;
  }
  return (
    Math.hypot(
      positionsM[positive] - positionsM[negative],
      positionsM[positive + 1] - positionsM[negative + 1],
      positionsM[positive + 2] - positionsM[negative + 2],
    ) * 1000
  );
}

function maximum(values: readonly number[]): number {
  return values.length === 0 ? 0 : Math.max(...values);
}

function diagnostic(
  code: MeasurementOpenReferenceHighHipDiagnosticCodeV1,
  message: string,
): MeasurementOpenReferenceHighHipDiagnosticV1 {
  return Object.freeze({ code, message });
}

function finiteOrigin(
  origin: MeshPlaneSectionVec3V1 | undefined,
): origin is MeshPlaneSectionVec3V1 {
  return Array.isArray(origin) && origin.length === 3 && origin.every(Number.isFinite);
}

/**
 * Places the high-hip station `waistToHighHipMm` (protocol default 100 mm) below the waist
 * station. It must lie strictly between the waist and hip stations and leave at least the minimum
 * vertical support; otherwise the proxy is not applied (`station-order`). No fallback station.
 */
export function resolveMeasurementOpenReferenceHighHipStationV1(options: {
  readonly waistStationOriginM: MeshPlaneSectionVec3V1;
  readonly hipStationOriginM: MeshPlaneSectionVec3V1;
  readonly waistToHighHipMm?: number;
  readonly policy?: Partial<MeasurementOpenReferenceHighHipProxyPolicyV1>;
}): MeasurementOpenReferenceHighHipStationResolutionV1 {
  const policy = policySnapshot(options.policy);
  if (!finiteOrigin(options.waistStationOriginM) || !finiteOrigin(options.hipStationOriginM)) {
    return Object.freeze({
      ok: false as const,
      diagnostic: diagnostic('input-invalid', 'Waist or hip station is missing.'),
    });
  }
  const waistDropMm =
    options.waistToHighHipMm ?? MEASUREMENT_OPEN_REFERENCE_HIGH_HIP_PROTOCOL_WAIST_DROP_MM_V1;
  if (!Number.isFinite(waistDropMm) || waistDropMm <= 0) {
    return Object.freeze({
      ok: false as const,
      diagnostic: diagnostic('input-invalid', 'Waist-to-high-hip offset is invalid.'),
    });
  }
  const waistY = options.waistStationOriginM[1];
  const hipY = options.hipStationOriginM[1];
  const stationY = waistY - waistDropMm / 1000;
  const waistDistanceM = waistY - stationY;
  const hipDistanceM = stationY - hipY;
  const verticalRadiusM = Math.min(
    policy.maximumVerticalRadiusM,
    policy.stationDistanceRadiusFraction * Math.min(waistDistanceM, hipDistanceM),
  );
  if (
    !(hipY < stationY && stationY < waistY) ||
    !Number.isFinite(verticalRadiusM) ||
    verticalRadiusM < policy.minimumVerticalRadiusM
  ) {
    return Object.freeze({
      ok: false as const,
      diagnostic: diagnostic(
        'station-order',
        'High-hip station is not safely between the waist and hip stations.',
      ),
    });
  }
  const t = waistDistanceM / (waistY - hipY);
  const stationZ =
    options.waistStationOriginM[2] +
    (options.hipStationOriginM[2] - options.waistStationOriginM[2]) * t;
  return Object.freeze({
    ok: true as const,
    station: Object.freeze({
      originM: Object.freeze([0, stationY, stationZ]) as MeshPlaneSectionVec3V1,
      verticalRadiusM,
      waistDropMm,
      waistDistanceM,
      hipDistanceM,
    }),
  });
}

/**
 * Applies a narrow visual proxy for the high-hip circumference: a uniform XZ section scale about
 * the high-hip loop centre, smoothstep-weighted in Y. The +/-10% envelope is a deformation-safety
 * bound (`circumferenceRangeCalibrated: false`), not a calibrated or fit claim. On any failure only
 * the high-hip change is dropped; the input positions (waist/hip/depth) are returned untouched.
 */
export function solveMeasurementOpenReferenceHighHipProxyV1(options: {
  readonly sourcePositionsM: Float32Array;
  readonly triangleIndices: Uint16Array | Uint32Array;
  readonly targetCircumferenceMm?: number;
  readonly waistToHighHipMm?: number;
  readonly waistStationOriginM: MeshPlaneSectionVec3V1;
  readonly hipStationOriginM: MeshPlaneSectionVec3V1;
  /** Extra stations that must not move (underBust; chest depth station when depth is requested). */
  readonly protectedStationOriginsM?: readonly MeshPlaneSectionVec3V1[];
  readonly shoulderVertices?: Readonly<{ negative: number; positive: number }>;
  readonly policy?: Partial<MeasurementOpenReferenceHighHipProxyPolicyV1>;
}): MeasurementOpenReferenceHighHipProxyResultV1 {
  validateMesh(options.sourcePositionsM, options.triangleIndices);
  const policy = policySnapshot(options.policy);
  const original = options.sourcePositionsM;
  const finish = (
    status: MeasurementOpenReferenceHighHipStatusV1,
    diagnostics: readonly MeasurementOpenReferenceHighHipDiagnosticV1[],
    extra: Partial<
      Pick<
        MeasurementOpenReferenceHighHipProxyResultV1,
        'positionsM' | 'station' | 'modeResult' | 'qualityGate'
      >
    > = {},
  ): MeasurementOpenReferenceHighHipProxyResultV1 =>
    Object.freeze({
      version: MEASUREMENT_OPEN_REFERENCE_HIGH_HIP_PROXY_V1,
      role: 'CC0_OPEN_REFERENCE_BOUNDED_VISUAL_PROXY' as const,
      status,
      positionsM: extra.positionsM ?? original.slice(),
      ...(extra.station ? { station: extra.station } : {}),
      ...(extra.modeResult ? { modeResult: extra.modeResult } : {}),
      ...(extra.qualityGate ? { qualityGate: extra.qualityGate } : {}),
      diagnostics: Object.freeze([...diagnostics]),
      claims: CLAIMS,
    });

  const requestedTargetMm = options.targetCircumferenceMm;
  if (requestedTargetMm == null) return finish('unrequested', []);
  if (!Number.isFinite(requestedTargetMm) || requestedTargetMm <= 0) {
    return finish('notApplied', [
      diagnostic('target-unreachable', 'High-hip circumference target is invalid.'),
    ]);
  }
  const resolution = resolveMeasurementOpenReferenceHighHipStationV1({
    waistStationOriginM: options.waistStationOriginM,
    hipStationOriginM: options.hipStationOriginM,
    waistToHighHipMm: options.waistToHighHipMm,
    policy,
  });
  if (!resolution.ok) return finish('notApplied', [resolution.diagnostic]);
  const { station } = resolution;

  const protectedOrigins: MeshPlaneSectionVec3V1[] = [
    options.waistStationOriginM,
    options.hipStationOriginM,
    ...(options.protectedStationOriginsM ?? []).filter(finiteOrigin),
  ];
  let baseline: StationSnapshotV1;
  let protectedBaselines: StationSnapshotV1[];
  try {
    baseline = stationSnapshot({
      positionsM: original,
      triangleIndices: options.triangleIndices,
      originM: station.originM,
    });
    protectedBaselines = protectedOrigins.map((originM) =>
      stationSnapshot({ positionsM: original, triangleIndices: options.triangleIndices, originM }),
    );
  } catch (reason: unknown) {
    return finish(
      'notApplied',
      [diagnostic('section-invalid', reason instanceof Error ? reason.message : String(reason))],
      { station },
    );
  }

  const boundedTargetMm = Math.min(
    baseline.perimeterMm * policy.maximumScale,
    Math.max(baseline.perimeterMm * policy.minimumScale, requestedTargetMm),
  );
  const endpointWasLimited = Math.abs(boundedTargetMm - requestedTargetMm) > 1e-9;
  const requestedDeltaMm = boundedTargetMm - baseline.perimeterMm;
  const limitedDiagnostic = diagnostic(
    'target-limited',
    'High-hip target was limited to the nearest deformation-safety endpoint.',
  );
  if (Math.abs(requestedDeltaMm) <= policy.maximumCircumferenceResidualMm) {
    return finish(
      endpointWasLimited ? 'limited' : 'represented',
      endpointWasLimited ? [limitedDiagnostic] : [],
      {
        positionsM: original.slice(),
        station,
        modeResult: Object.freeze({
          targetCircumferenceMm: requestedTargetMm,
          boundedTargetCircumferenceMm: boundedTargetMm,
          baselineCircumferenceMm: baseline.perimeterMm,
          achievedCircumferenceMm: baseline.perimeterMm,
          sectionScale: 1,
          fraction: 1,
          maximumProtectedPerimeterDriftMm: 0,
          maximumProtectedDepthDriftMm: 0,
          shoulderChordDriftMm: 0,
        }),
      },
    );
  }

  const shoulderBaselineMm = shoulderChordMm(original, options.shoulderVertices);
  const candidateAtFraction = (fraction: number) => {
    const targetMm = baseline.perimeterMm + requestedDeltaMm * fraction;
    let low = policy.minimumScale;
    let high = policy.maximumScale;
    let best: { positionsM: Float32Array; snapshot: StationSnapshotV1; scale: number } | undefined;
    let bestError = Number.POSITIVE_INFINITY;
    for (let iteration = 0; iteration < policy.binarySearchIterations; iteration += 1) {
      const scale = (low + high) / 2;
      const candidate = applyUniformSectionScale({
        sourcePositionsM: original,
        originM: station.originM,
        snapshot: baseline,
        verticalRadiusM: station.verticalRadiusM,
        scale,
      });
      const measured = stationSnapshot({
        positionsM: candidate,
        triangleIndices: options.triangleIndices,
        originM: station.originM,
      });
      const error = measured.perimeterMm - targetMm;
      if (Math.abs(error) < Math.abs(bestError)) {
        best = { positionsM: candidate, snapshot: measured, scale };
        bestError = error;
      }
      if (error < 0) low = scale;
      else high = scale;
    }
    if (!best) throw new Error('High-hip section search produced no candidate.');
    return Object.freeze({ ...best, targetMm });
  };

  let failureCode: MeasurementOpenReferenceHighHipDiagnosticCodeV1 = 'residual-unsafe';
  for (let shrink = 0; shrink <= 12; shrink += 1) {
    const fraction = shrink === 0 ? 1 : 1 - shrink / 13;
    let candidate: ReturnType<typeof candidateAtFraction>;
    try {
      candidate = candidateAtFraction(fraction);
    } catch {
      failureCode = 'section-invalid';
      continue;
    }
    if (
      Math.abs(candidate.snapshot.perimeterMm - candidate.targetMm) >
      policy.maximumCircumferenceResidualMm
    ) {
      failureCode = 'residual-unsafe';
      continue;
    }
    // Closure: re-measure waist, hip and every protected (depth/underBust) station.
    const perimeterDrifts: number[] = [];
    const depthDrifts: number[] = [];
    try {
      protectedOrigins.forEach((originM, index) => {
        const measured = stationSnapshot({
          positionsM: candidate.positionsM,
          triangleIndices: options.triangleIndices,
          originM,
        });
        perimeterDrifts.push(
          Math.abs(measured.perimeterMm - protectedBaselines[index].perimeterMm),
        );
        depthDrifts.push(Math.abs(measured.depthMm - protectedBaselines[index].depthMm));
      });
    } catch {
      failureCode = 'section-invalid';
      continue;
    }
    const shoulderCandidateMm = shoulderChordMm(candidate.positionsM, options.shoulderVertices);
    const shoulderChordDriftMm =
      shoulderBaselineMm == null || shoulderCandidateMm == null
        ? 0
        : Math.abs(shoulderCandidateMm - shoulderBaselineMm);
    if (
      maximum(perimeterDrifts) > policy.maximumProtectedDriftMm ||
      maximum(depthDrifts) > policy.maximumProtectedDriftMm ||
      shoulderChordDriftMm > policy.maximumProtectedDriftMm
    ) {
      failureCode = 'closure-unsafe';
      continue;
    }
    const qualityGate = evaluateMeasurementOpenReferenceDisplayQualityWithSelfIntersectionV1({
      uniformPositionsM: original,
      personalizedPositionsM: candidate.positionsM,
      triangleIndices: options.triangleIndices,
    });
    if (!qualityGate.safe) {
      failureCode = 'combined-quality-unsafe';
      continue;
    }
    const signedResponseMm =
      Math.sign(requestedDeltaMm) * (candidate.snapshot.perimeterMm - baseline.perimeterMm);
    if (
      signedResponseMm < policy.minimumDirectionalResponseMm ||
      signedResponseMm + policy.minimumMonotonicStepMm <
        Math.abs(requestedDeltaMm) * fraction - policy.maximumCircumferenceResidualMm
    ) {
      failureCode = 'direction-response-invalid';
      continue;
    }
    const limited = endpointWasLimited || fraction !== 1;
    return finish(limited ? 'limited' : 'represented', limited ? [limitedDiagnostic] : [], {
      positionsM: candidate.positionsM,
      station,
      qualityGate,
      modeResult: Object.freeze({
        targetCircumferenceMm: requestedTargetMm,
        boundedTargetCircumferenceMm: boundedTargetMm,
        baselineCircumferenceMm: baseline.perimeterMm,
        achievedCircumferenceMm: candidate.snapshot.perimeterMm,
        sectionScale: candidate.scale,
        fraction,
        maximumProtectedPerimeterDriftMm: maximum(perimeterDrifts),
        maximumProtectedDepthDriftMm: maximum(depthDrifts),
        shoulderChordDriftMm,
      }),
    });
  }

  return finish(
    'notApplied',
    [diagnostic(failureCode, 'No safe visible high-hip response was found; high hip rolled back.')],
    { station },
  );
}
