import type { CanonicalBodyMeasurementsMm } from './measurement-adapter';
import {
  evaluateMeasurementOpenReferenceDisplayQualityWithSelfIntersectionV1,
  type MeasurementOpenReferenceDisplayQualityGateResultV1,
} from './measurement-open-reference-display-quality-gate-v1';
import {
  measureMeshPlaneSectionPerimetersV1,
  type MeshPlaneSectionLoopV1,
  type MeshPlaneSectionVec3V1,
} from './mesh-plane-section-perimeter-v1';

export const MEASUREMENT_OPEN_REFERENCE_TORSO_DEPTH_PROXY_V1 =
  'measurement-open-reference-torso-depth-proxy/v1' as const;

export const MEASUREMENT_OPEN_REFERENCE_TORSO_DEPTH_KEYS_V1 = Object.freeze([
  'chestDepthMm',
  'waistDepthMm',
  'hipDepthMm',
] as const);

export type MeasurementOpenReferenceTorsoDepthKeyV1 =
  (typeof MEASUREMENT_OPEN_REFERENCE_TORSO_DEPTH_KEYS_V1)[number];

export interface MeasurementOpenReferenceTorsoDepthStationV1 {
  readonly measurementKey: MeasurementOpenReferenceTorsoDepthKeyV1;
  readonly originM: MeshPlaneSectionVec3V1;
}

export interface MeasurementOpenReferenceTorsoDepthProxyPolicyV1 {
  readonly minimumScale: number;
  readonly maximumScale: number;
  readonly maximumVerticalRadiusM: number;
  readonly binarySearchIterations: number;
  readonly maximumDepthResidualMm: number;
  readonly maximumCircumferenceDriftMm: number;
  readonly maximumCrossTalkMm: number;
  readonly minimumDirectionalResponseMm: number;
  readonly minimumMonotonicStepMm: number;
}

export const DEFAULT_MEASUREMENT_OPEN_REFERENCE_TORSO_DEPTH_PROXY_POLICY_V1 = Object.freeze({
  minimumScale: 0.9,
  maximumScale: 1.1,
  maximumVerticalRadiusM: 0.075,
  binarySearchIterations: 18,
  maximumDepthResidualMm: 0.5,
  maximumCircumferenceDriftMm: 0.5,
  maximumCrossTalkMm: 0.5,
  minimumDirectionalResponseMm: 0.25,
  minimumMonotonicStepMm: 0.01,
} satisfies MeasurementOpenReferenceTorsoDepthProxyPolicyV1);

export type MeasurementOpenReferenceTorsoDepthDiagnosticCodeV1 =
  | 'combined-quality-unsafe'
  | 'cross-talk-unsafe'
  | 'direction-response-invalid'
  | 'input-invalid'
  | 'perimeter-preservation-unsafe'
  | 'protected-station-unsafe'
  | 'section-invalid'
  | 'target-limited'
  | 'target-unreachable';

export interface MeasurementOpenReferenceTorsoDepthDiagnosticV1 {
  readonly code: MeasurementOpenReferenceTorsoDepthDiagnosticCodeV1;
  readonly measurementKey: MeasurementOpenReferenceTorsoDepthKeyV1;
  readonly message: string;
}

export interface MeasurementOpenReferenceTorsoDepthModeResultV1 {
  readonly measurementKey: MeasurementOpenReferenceTorsoDepthKeyV1;
  readonly targetDepthMm: number;
  readonly boundedTargetDepthMm: number;
  readonly baselineDepthMm: number;
  readonly achievedDepthMm: number;
  readonly baselinePerimeterMm: number;
  readonly achievedPerimeterMm: number;
  readonly depthCoefficient: number;
  readonly widthCoefficient: number;
  readonly maximumSiblingDepthDriftMm: number;
  readonly maximumSiblingPerimeterDriftMm: number;
  readonly maximumProtectedPerimeterDriftMm: number;
  readonly shoulderChordDriftMm: number;
}

export interface MeasurementOpenReferenceTorsoDepthProxyResultV1 {
  readonly version: typeof MEASUREMENT_OPEN_REFERENCE_TORSO_DEPTH_PROXY_V1;
  readonly role: 'CC0_OPEN_REFERENCE_BOUNDED_VISUAL_PROXY';
  readonly positionsM: Float32Array;
  readonly representedMeasurements: readonly MeasurementOpenReferenceTorsoDepthKeyV1[];
  readonly limitedMeasurements: readonly MeasurementOpenReferenceTorsoDepthKeyV1[];
  readonly modeResults: readonly MeasurementOpenReferenceTorsoDepthModeResultV1[];
  readonly diagnostics: readonly MeasurementOpenReferenceTorsoDepthDiagnosticV1[];
  readonly qualityGate: MeasurementOpenReferenceDisplayQualityGateResultV1;
  readonly claims: {
    readonly visualReferenceOnly: true;
    readonly geometricProxyOnly: true;
    readonly symmetricSectionProxyOnly: true;
    readonly circumferencePreservedAtProxyStation: true;
    readonly frontBackDistributionCalibrated: false;
    readonly canonicalMeasurementSemanticMatchClaimed: false;
    readonly anatomicalTapePathEquivalent: false;
    readonly populationRepresentativenessClaimed: false;
    readonly fitClaimEligible: false;
    readonly runtimeCollisionEligible: false;
  };
}

const CLAIMS = Object.freeze({
  visualReferenceOnly: true as const,
  geometricProxyOnly: true as const,
  symmetricSectionProxyOnly: true as const,
  circumferencePreservedAtProxyStation: true as const,
  frontBackDistributionCalibrated: false as const,
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
  input: Partial<MeasurementOpenReferenceTorsoDepthProxyPolicyV1> | undefined,
): MeasurementOpenReferenceTorsoDepthProxyPolicyV1 {
  const policy = { ...DEFAULT_MEASUREMENT_OPEN_REFERENCE_TORSO_DEPTH_PROXY_POLICY_V1, ...input };
  if (
    !Number.isFinite(policy.minimumScale) ||
    !Number.isFinite(policy.maximumScale) ||
    policy.minimumScale <= 0 ||
    policy.minimumScale >= 1 ||
    policy.maximumScale <= 1 ||
    policy.maximumScale > 1.25
  ) {
    throw new RangeError('Torso-depth scale envelope is invalid.');
  }
  if (
    !Number.isSafeInteger(policy.binarySearchIterations) ||
    policy.binarySearchIterations < 1 ||
    policy.binarySearchIterations > 32
  ) {
    throw new RangeError('binarySearchIterations must be an integer within 1..32.');
  }
  for (const key of [
    'maximumVerticalRadiusM',
    'maximumDepthResidualMm',
    'maximumCircumferenceDriftMm',
    'maximumCrossTalkMm',
    'minimumDirectionalResponseMm',
    'minimumMonotonicStepMm',
  ] as const) {
    if (!Number.isFinite(policy[key]) || policy[key] <= 0) {
      throw new RangeError(`${key} must be finite and positive.`);
    }
  }
  return Object.freeze(policy);
}

function validateMesh(positionsM: Float32Array, triangleIndices: Uint16Array | Uint32Array): void {
  if (!(positionsM instanceof Float32Array) || positionsM.length === 0 || positionsM.length % 3) {
    throw new TypeError('sourcePositionsM must be a non-empty XYZ Float32Array.');
  }
  if (![...positionsM].every(Number.isFinite)) {
    throw new TypeError('sourcePositionsM contains a non-finite coordinate.');
  }
  if (!(triangleIndices instanceof Uint16Array) && !(triangleIndices instanceof Uint32Array)) {
    throw new TypeError('triangleIndices must be Uint16Array or Uint32Array.');
  }
  if (triangleIndices.length === 0 || triangleIndices.length % 3) {
    throw new RangeError('triangleIndices must contain complete triangles.');
  }
  const vertexCount = positionsM.length / 3;
  if ([...triangleIndices].some((vertex) => vertex >= vertexCount)) {
    throw new RangeError('triangleIndices contains an out-of-range vertex.');
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
    throw new Error(measured.ok ? 'Torso section selection failed.' : measured.errors.join('; '));
  }
  return measured.selectedLoop;
}

function stationSnapshot(options: {
  readonly positionsM: Float32Array;
  readonly triangleIndices: Uint16Array | Uint32Array;
  readonly originM: MeshPlaneSectionVec3V1;
}): StationSnapshotV1 {
  const loop = selectedLoop(options);
  const minimumZ = Math.min(...loop.pointsM.map((point) => point[2]));
  const maximumZ = Math.max(...loop.pointsM.map((point) => point[2]));
  const minimumX = Math.min(...loop.pointsM.map((point) => point[0]));
  const maximumX = Math.max(...loop.pointsM.map((point) => point[0]));
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

function verticalWeight(distanceM: number, radiusM: number): number {
  const normalized = Math.abs(distanceM) / radiusM;
  if (normalized <= 0.7) return 1;
  return smoothstep01((1 - normalized) / 0.3);
}

function horizontalWeight(distanceM: number, radiusM: number): number {
  const normalized = Math.abs(distanceM) / radiusM;
  if (normalized <= 1.15) return 1;
  return smoothstep01((1.45 - normalized) / 0.3);
}

function applySectionScale(options: {
  readonly sourcePositionsM: Float32Array;
  readonly originM: MeshPlaneSectionVec3V1;
  readonly snapshot: StationSnapshotV1;
  readonly verticalRadiusM: number;
  readonly widthCoefficient: number;
  readonly depthCoefficient: number;
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
    result[offset] =
      options.snapshot.centerX +
      (result[offset] - options.snapshot.centerX) * (1 + (options.widthCoefficient - 1) * weight);
    result[offset + 2] =
      options.snapshot.centerZ +
      (result[offset + 2] - options.snapshot.centerZ) *
        (1 + (options.depthCoefficient - 1) * weight);
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
  code: MeasurementOpenReferenceTorsoDepthDiagnosticCodeV1,
  measurementKey: MeasurementOpenReferenceTorsoDepthKeyV1,
  message: string,
): MeasurementOpenReferenceTorsoDepthDiagnosticV1 {
  return Object.freeze({ code, measurementKey, message });
}

function safeLocalQualityGate(options: {
  readonly sourcePositionsM: Float32Array;
  readonly candidatePositionsM: Float32Array;
  readonly triangleIndices: Uint16Array | Uint32Array;
}): MeasurementOpenReferenceDisplayQualityGateResultV1 {
  return evaluateMeasurementOpenReferenceDisplayQualityWithSelfIntersectionV1({
    uniformPositionsM: options.sourcePositionsM,
    personalizedPositionsM: options.candidatePositionsM,
    triangleIndices: options.triangleIndices,
  });
}

function verticalRadiusM(options: {
  readonly station: MeasurementOpenReferenceTorsoDepthStationV1;
  readonly allStations: readonly MeasurementOpenReferenceTorsoDepthStationV1[];
  readonly protectedStationOriginsM: readonly MeshPlaneSectionVec3V1[];
  readonly maximumVerticalRadiusM: number;
  readonly protectedSupportFraction: number;
}): number {
  const siblingDistances = options.allStations
    .filter(({ measurementKey }) => measurementKey !== options.station.measurementKey)
    .map(({ originM }) => Math.abs(originM[1] - options.station.originM[1]))
    .filter((distance) => distance > 0.001);
  const protectedDistances = options.protectedStationOriginsM
    .map((originM) => Math.abs(originM[1] - options.station.originM[1]))
    .filter((distance) => distance > 0.001);
  // Rounding is monotone, so min(d) * 0.45 === min(d * 0.45): the default stays byte-identical.
  const radii = [
    ...siblingDistances.map((distance) => distance * 0.45),
    ...protectedDistances.map((distance) => distance * options.protectedSupportFraction),
  ];
  return Math.min(options.maximumVerticalRadiusM, radii.length ? Math.min(...radii) : 0.16 * 0.45);
}

/**
 * Applies a deliberately narrow visual proxy: a symmetric front/back section scale paired with
 * an X compensation that keeps the already solved circumference. The +/-10% envelope is a visual
 * safety bound, not a calibrated population model or a fit claim.
 */
export function solveMeasurementOpenReferenceTorsoDepthProxyV1(options: {
  readonly sourcePositionsM: Float32Array;
  readonly triangleIndices: Uint16Array | Uint32Array;
  readonly measurements: Partial<
    Pick<CanonicalBodyMeasurementsMm, MeasurementOpenReferenceTorsoDepthKeyV1>
  >;
  readonly stations: readonly MeasurementOpenReferenceTorsoDepthStationV1[];
  readonly protectedStationOriginsM?: readonly MeshPlaneSectionVec3V1[];
  readonly shoulderVertices?: Readonly<{ negative: number; positive: number }>;
  /**
   * Share of the distance to a protected station that the vertical support may reach (default
   * 0.45, as for sibling stations). The female bust path raises it to let the support end at the
   * under-bust plane; the protected-drift check still holds that plane within tolerance.
   */
  readonly protectedSupportFraction?: number;
  readonly policy?: Partial<MeasurementOpenReferenceTorsoDepthProxyPolicyV1>;
}): MeasurementOpenReferenceTorsoDepthProxyResultV1 {
  validateMesh(options.sourcePositionsM, options.triangleIndices);
  const policy = policySnapshot(options.policy);
  if (
    options.protectedSupportFraction != null &&
    !(options.protectedSupportFraction > 0 && options.protectedSupportFraction <= 1)
  ) {
    throw new RangeError('protectedSupportFraction must be in (0, 1].');
  }
  const original = options.sourcePositionsM.slice();
  let positionsM: Float32Array = original.slice();
  const represented: MeasurementOpenReferenceTorsoDepthKeyV1[] = [];
  const limited: MeasurementOpenReferenceTorsoDepthKeyV1[] = [];
  const modeResults: MeasurementOpenReferenceTorsoDepthModeResultV1[] = [];
  const diagnostics: MeasurementOpenReferenceTorsoDepthDiagnosticV1[] = [];
  const protectedOrigins = options.protectedStationOriginsM ?? [];
  const stationByKey = new Map<
    MeasurementOpenReferenceTorsoDepthKeyV1,
    MeasurementOpenReferenceTorsoDepthStationV1
  >();
  for (const key of MEASUREMENT_OPEN_REFERENCE_TORSO_DEPTH_KEYS_V1) {
    const matches = options.stations.filter(({ measurementKey }) => measurementKey === key);
    if (matches.length === 1 && matches[0].originM.every(Number.isFinite)) {
      stationByKey.set(key, matches[0]);
    }
  }

  for (const measurementKey of MEASUREMENT_OPEN_REFERENCE_TORSO_DEPTH_KEYS_V1) {
    const requestedTargetMm = options.measurements[measurementKey];
    if (requestedTargetMm == null) continue;
    if (!Number.isFinite(requestedTargetMm) || requestedTargetMm <= 0) {
      diagnostics.push(
        diagnostic('target-unreachable', measurementKey, 'Depth target is invalid.'),
      );
      continue;
    }
    const station = stationByKey.get(measurementKey);
    if (!station) {
      diagnostics.push(diagnostic('input-invalid', measurementKey, 'Depth station is missing.'));
      continue;
    }
    const radiusM = verticalRadiusM({
      station,
      allStations: [...stationByKey.values()],
      protectedStationOriginsM: protectedOrigins,
      maximumVerticalRadiusM: policy.maximumVerticalRadiusM,
      protectedSupportFraction: options.protectedSupportFraction ?? 0.45,
    });
    if (!Number.isFinite(radiusM) || radiusM < 0.006) {
      diagnostics.push(
        diagnostic('input-invalid', measurementKey, 'Depth station has no safe vertical support.'),
      );
      continue;
    }

    let baseline: StationSnapshotV1;
    const siblingBaselines = new Map<MeasurementOpenReferenceTorsoDepthKeyV1, StationSnapshotV1>();
    const protectedBaselines: StationSnapshotV1[] = [];
    try {
      baseline = stationSnapshot({
        positionsM,
        triangleIndices: options.triangleIndices,
        originM: station.originM,
      });
      for (const sibling of stationByKey.values()) {
        if (sibling.measurementKey === measurementKey) continue;
        siblingBaselines.set(
          sibling.measurementKey,
          stationSnapshot({
            positionsM,
            triangleIndices: options.triangleIndices,
            originM: sibling.originM,
          }),
        );
      }
      for (const originM of protectedOrigins) {
        protectedBaselines.push(
          stationSnapshot({ positionsM, triangleIndices: options.triangleIndices, originM }),
        );
      }
    } catch (reason: unknown) {
      diagnostics.push(
        diagnostic(
          'section-invalid',
          measurementKey,
          reason instanceof Error ? reason.message : String(reason),
        ),
      );
      continue;
    }

    const boundedTargetDepthMm = Math.min(
      baseline.depthMm * policy.maximumScale,
      Math.max(baseline.depthMm * policy.minimumScale, requestedTargetMm),
    );
    const endpointWasLimited = Math.abs(boundedTargetDepthMm - requestedTargetMm) > 1e-9;
    const requestedDeltaMm = boundedTargetDepthMm - baseline.depthMm;
    if (Math.abs(requestedDeltaMm) <= policy.maximumDepthResidualMm) {
      represented.push(measurementKey);
      modeResults.push(
        Object.freeze({
          measurementKey,
          targetDepthMm: requestedTargetMm,
          boundedTargetDepthMm,
          baselineDepthMm: baseline.depthMm,
          achievedDepthMm: baseline.depthMm,
          baselinePerimeterMm: baseline.perimeterMm,
          achievedPerimeterMm: baseline.perimeterMm,
          depthCoefficient: 1,
          widthCoefficient: 1,
          maximumSiblingDepthDriftMm: 0,
          maximumSiblingPerimeterDriftMm: 0,
          maximumProtectedPerimeterDriftMm: 0,
          shoulderChordDriftMm: 0,
        }),
      );
      continue;
    }

    const shoulderBaselineMm = shoulderChordMm(positionsM, options.shoulderVertices);
    const candidateAtFraction = (fraction: number) => {
      const depthTargetMm = baseline.depthMm + requestedDeltaMm * fraction;
      const depthCoefficient = depthTargetMm / baseline.depthMm;
      let low = policy.minimumScale;
      let high = policy.maximumScale;
      let bestPositions: Float32Array = positionsM;
      let bestSnapshot = baseline;
      let bestWidth = 1;
      let bestDrift = Number.POSITIVE_INFINITY;
      for (let iteration = 0; iteration < policy.binarySearchIterations; iteration += 1) {
        const widthCoefficient = (low + high) / 2;
        const candidate = applySectionScale({
          sourcePositionsM: positionsM,
          originM: station.originM,
          snapshot: baseline,
          verticalRadiusM: radiusM,
          widthCoefficient,
          depthCoefficient,
        });
        const measured = stationSnapshot({
          positionsM: candidate,
          triangleIndices: options.triangleIndices,
          originM: station.originM,
        });
        const drift = measured.perimeterMm - baseline.perimeterMm;
        if (Math.abs(drift) < Math.abs(bestDrift)) {
          bestPositions = candidate;
          bestSnapshot = measured;
          bestWidth = widthCoefficient;
          bestDrift = drift;
        }
        if (drift < 0) low = widthCoefficient;
        else high = widthCoefficient;
      }
      return Object.freeze({
        positionsM: bestPositions,
        snapshot: bestSnapshot,
        widthCoefficient: bestWidth,
        depthCoefficient,
      });
    };

    let accepted:
      | Readonly<{
          positionsM: Float32Array;
          snapshot: StationSnapshotV1;
          widthCoefficient: number;
          depthCoefficient: number;
          siblingDepthDriftMm: number;
          siblingPerimeterDriftMm: number;
          protectedPerimeterDriftMm: number;
          shoulderChordDriftMm: number;
          fraction: number;
        }>
      | undefined;
    let failureCode: MeasurementOpenReferenceTorsoDepthDiagnosticCodeV1 =
      'perimeter-preservation-unsafe';
    for (let shrink = 0; shrink <= 12; shrink += 1) {
      const fraction = shrink === 0 ? 1 : 1 - shrink / 13;
      let candidate: ReturnType<typeof candidateAtFraction>;
      try {
        candidate = candidateAtFraction(fraction);
      } catch {
        failureCode = 'section-invalid';
        continue;
      }
      const depthResidualMm = Math.abs(
        candidate.snapshot.depthMm - (baseline.depthMm + requestedDeltaMm * fraction),
      );
      const perimeterDriftMm = Math.abs(candidate.snapshot.perimeterMm - baseline.perimeterMm);
      if (
        depthResidualMm > policy.maximumDepthResidualMm ||
        perimeterDriftMm > policy.maximumCircumferenceDriftMm
      ) {
        failureCode = 'perimeter-preservation-unsafe';
        continue;
      }
      const siblingDepthDrifts: number[] = [];
      const siblingPerimeterDrifts: number[] = [];
      try {
        for (const sibling of stationByKey.values()) {
          const siblingBaseline = siblingBaselines.get(sibling.measurementKey);
          if (!siblingBaseline) continue;
          const measured = stationSnapshot({
            positionsM: candidate.positionsM,
            triangleIndices: options.triangleIndices,
            originM: sibling.originM,
          });
          siblingDepthDrifts.push(Math.abs(measured.depthMm - siblingBaseline.depthMm));
          siblingPerimeterDrifts.push(Math.abs(measured.perimeterMm - siblingBaseline.perimeterMm));
        }
      } catch {
        failureCode = 'section-invalid';
        continue;
      }
      if (
        maximum(siblingDepthDrifts) > policy.maximumCrossTalkMm ||
        maximum(siblingPerimeterDrifts) > policy.maximumCrossTalkMm
      ) {
        failureCode = 'cross-talk-unsafe';
        continue;
      }
      const protectedPerimeterDrifts: number[] = [];
      try {
        protectedOrigins.forEach((originM, index) => {
          const measured = stationSnapshot({
            positionsM: candidate.positionsM,
            triangleIndices: options.triangleIndices,
            originM,
          });
          protectedPerimeterDrifts.push(
            Math.abs(measured.perimeterMm - protectedBaselines[index].perimeterMm),
          );
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
        maximum(protectedPerimeterDrifts) > policy.maximumCrossTalkMm ||
        shoulderChordDriftMm > policy.maximumCrossTalkMm
      ) {
        failureCode = 'protected-station-unsafe';
        continue;
      }
      const qualityGate = safeLocalQualityGate({
        sourcePositionsM: original,
        candidatePositionsM: candidate.positionsM,
        triangleIndices: options.triangleIndices,
      });
      if (!qualityGate.safe) {
        failureCode = 'combined-quality-unsafe';
        continue;
      }
      const signedResponseMm =
        Math.sign(requestedDeltaMm) * (candidate.snapshot.depthMm - baseline.depthMm);
      if (
        signedResponseMm < policy.minimumDirectionalResponseMm ||
        signedResponseMm + policy.minimumMonotonicStepMm < Math.abs(requestedDeltaMm) * fraction
      ) {
        failureCode = 'direction-response-invalid';
        continue;
      }
      accepted = Object.freeze({
        ...candidate,
        siblingDepthDriftMm: maximum(siblingDepthDrifts),
        siblingPerimeterDriftMm: maximum(siblingPerimeterDrifts),
        protectedPerimeterDriftMm: maximum(protectedPerimeterDrifts),
        shoulderChordDriftMm,
        fraction,
      });
      break;
    }

    if (!accepted) {
      diagnostics.push(
        diagnostic(failureCode, measurementKey, 'No visible safe torso-depth response was found.'),
      );
      continue;
    }
    positionsM = accepted.positionsM;
    const safeEndpointReached = accepted.fraction === 1;
    if (endpointWasLimited || !safeEndpointReached) {
      limited.push(measurementKey);
      diagnostics.push(
        diagnostic(
          'target-limited',
          measurementKey,
          'Depth target was limited to the nearest safe bounded visual endpoint.',
        ),
      );
    } else {
      represented.push(measurementKey);
    }
    modeResults.push(
      Object.freeze({
        measurementKey,
        targetDepthMm: requestedTargetMm,
        boundedTargetDepthMm,
        baselineDepthMm: baseline.depthMm,
        achievedDepthMm: accepted.snapshot.depthMm,
        baselinePerimeterMm: baseline.perimeterMm,
        achievedPerimeterMm: accepted.snapshot.perimeterMm,
        depthCoefficient: accepted.depthCoefficient,
        widthCoefficient: accepted.widthCoefficient,
        maximumSiblingDepthDriftMm: accepted.siblingDepthDriftMm,
        maximumSiblingPerimeterDriftMm: accepted.siblingPerimeterDriftMm,
        maximumProtectedPerimeterDriftMm: accepted.protectedPerimeterDriftMm,
        shoulderChordDriftMm: accepted.shoulderChordDriftMm,
      }),
    );
  }

  let qualityGate = safeLocalQualityGate({
    sourcePositionsM: original,
    candidatePositionsM: positionsM,
    triangleIndices: options.triangleIndices,
  });
  if (!qualityGate.safe) {
    positionsM = original.slice();
    represented.length = 0;
    limited.length = 0;
    modeResults.length = 0;
    for (const measurementKey of MEASUREMENT_OPEN_REFERENCE_TORSO_DEPTH_KEYS_V1) {
      if (options.measurements[measurementKey] == null) continue;
      diagnostics.push(
        diagnostic(
          'combined-quality-unsafe',
          measurementKey,
          'Combined torso-depth quality gate rolled back the depth subset.',
        ),
      );
    }
    qualityGate = safeLocalQualityGate({
      sourcePositionsM: original,
      candidatePositionsM: positionsM,
      triangleIndices: options.triangleIndices,
    });
  }

  return Object.freeze({
    version: MEASUREMENT_OPEN_REFERENCE_TORSO_DEPTH_PROXY_V1,
    role: 'CC0_OPEN_REFERENCE_BOUNDED_VISUAL_PROXY' as const,
    positionsM,
    representedMeasurements: Object.freeze(represented),
    limitedMeasurements: Object.freeze(limited),
    modeResults: Object.freeze(modeResults),
    diagnostics: Object.freeze(diagnostics),
    qualityGate,
    claims: CLAIMS,
  });
}
