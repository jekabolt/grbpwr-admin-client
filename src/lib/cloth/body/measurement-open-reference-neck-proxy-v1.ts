import type { BodyPoseKind } from './contracts';
import {
  evaluateMeasurementOpenReferenceDisplayQualityWithSelfIntersectionV1,
  type MeasurementOpenReferenceDisplayQualityGateResultV1,
} from './measurement-open-reference-display-quality-gate-v1';
import {
  measureMeshPlaneSectionPerimetersV1,
  type MeshPlaneSectionLoopV1,
  type MeshPlaneSectionVec3V1,
} from './mesh-plane-section-perimeter-v1';

export const MEASUREMENT_OPEN_REFERENCE_NECK_PROXY_V1 =
  'measurement-open-reference-neck-proxy/v1' as const;

export interface MeasurementOpenReferenceNeckProxyPolicyV1 {
  readonly minimumRadialScale: number;
  readonly maximumRadialScale: number;
  readonly maximumAxialRadiusM: number;
  readonly stationDistanceRadiusRatio: number;
  readonly minimumAxialRadiusM: number;
  readonly maximumResidualMm: number;
  readonly maximumProtectedDriftMm: number;
  readonly sectionWeldToleranceM: number;
}

/**
 * The radial envelope is only a deformation-safety limit. It has no population calibration.
 * The 0.5 mm closure threshold matches the other procedural section proxies.
 */
export const DEFAULT_MEASUREMENT_OPEN_REFERENCE_NECK_PROXY_POLICY_V1 = Object.freeze({
  minimumRadialScale: 0.9,
  maximumRadialScale: 1.1,
  maximumAxialRadiusM: 0.03,
  stationDistanceRadiusRatio: 0.45,
  minimumAxialRadiusM: 0.012,
  maximumResidualMm: 0.5,
  maximumProtectedDriftMm: 0.5,
  sectionWeldToleranceM: 0.00002,
} satisfies MeasurementOpenReferenceNeckProxyPolicyV1);

export interface MeasurementOpenReferenceNeckRigHeadsV1 {
  readonly neck01: MeshPlaneSectionVec3V1;
  readonly neck02: MeshPlaneSectionVec3V1;
  readonly head: MeshPlaneSectionVec3V1;
}

export interface MeasurementOpenReferenceNeckProtectedSectionV1 {
  readonly originM: MeshPlaneSectionVec3V1;
  readonly normal: MeshPlaneSectionVec3V1;
}

export interface MeasurementOpenReferenceRigMidNeckStationV1 {
  readonly name: 'rigMidNeckStation';
  /** The per-basis core-rig `neck02` rest head. */
  readonly originM: MeshPlaneSectionVec3V1;
  /** Unit vector from the `neck01` rest head to the `head` rest head. */
  readonly normal: MeshPlaneSectionVec3V1;
  readonly neck01HeadM: MeshPlaneSectionVec3V1;
  readonly headHeadM: MeshPlaneSectionVec3V1;
  readonly neckLengthM: number;
  readonly neck01DistanceM: number;
  readonly headDistanceM: number;
  readonly axialRadiusM: number;
}

export type MeasurementOpenReferenceNeckDiagnosticCodeV1 =
  | 'head-clearance-failed'
  | 'input-invalid'
  | 'local-quality-unsafe'
  | 'protected-neighbour-failed'
  | 'residual-exceeded'
  | 'section-invalid'
  | 'section-loop-count-invalid'
  | 'station-invalid'
  | 'station-too-close'
  | 'target-invalid'
  | 'target-limited';

export interface MeasurementOpenReferenceNeckDiagnosticV1 {
  readonly code: MeasurementOpenReferenceNeckDiagnosticCodeV1;
  readonly message: string;
}

export type MeasurementOpenReferenceNeckStatusV1 =
  | 'unrequested'
  | 'represented'
  | 'limited'
  | 'notApplied';

export interface MeasurementOpenReferenceNeckAdmissionV1 {
  readonly status: 'notEvaluated' | 'admitted' | 'rejected';
  readonly closedLoopCount: number | null;
  readonly aboveHeadPlaneLoopVertexCount: number | null;
  readonly jawClearanceMm: number | null;
  readonly baseCircumferenceMm: number | null;
}

export interface MeasurementOpenReferenceNeckScalarCheckV1 {
  readonly status: 'measured' | 'notMeasured' | 'failed';
  readonly baselineMm: number | null;
  readonly achievedMm: number | null;
  readonly driftMm: number | null;
  readonly message: string | null;
}

export interface MeasurementOpenReferenceNeckHeadPlaneCheckV1 {
  readonly status: 'measured' | 'notMeasured' | 'failed';
  readonly vertexCount: number | null;
  readonly maximumDisplacementM: number | null;
  readonly exactZeroDisplacement: boolean | null;
  readonly message: string | null;
}

export interface MeasurementOpenReferenceNeckProtectedNeighboursV1 {
  readonly neck01Section: MeasurementOpenReferenceNeckScalarCheckV1;
  readonly headPlaneVertices: MeasurementOpenReferenceNeckHeadPlaneCheckV1;
  readonly shoulderChord: MeasurementOpenReferenceNeckScalarCheckV1;
  readonly chestStationPerimeter: MeasurementOpenReferenceNeckScalarCheckV1;
}

export interface MeasurementOpenReferenceNeckProxyResultV1 {
  readonly version: typeof MEASUREMENT_OPEN_REFERENCE_NECK_PROXY_V1;
  readonly role: 'CC0_OPEN_REFERENCE_A_POSE_MID_NECK_GEOMETRIC_PROXY';
  readonly status: MeasurementOpenReferenceNeckStatusV1;
  readonly positionsM: Float32Array;
  readonly requestedTargetMm: number | null;
  readonly appliedTargetMm: number | null;
  readonly baselineCircumferenceMm: number | null;
  /** Circumference of the returned positions, not a rejected candidate. */
  readonly achievedCircumferenceMm: number | null;
  readonly absoluteResidualMm: number | null;
  readonly radialScale: number;
  readonly station: MeasurementOpenReferenceRigMidNeckStationV1 | null;
  readonly admission: MeasurementOpenReferenceNeckAdmissionV1;
  readonly protectedNeighbours: MeasurementOpenReferenceNeckProtectedNeighboursV1;
  readonly qualityGate: MeasurementOpenReferenceDisplayQualityGateResultV1 | null;
  readonly diagnostics: readonly MeasurementOpenReferenceNeckDiagnosticV1[];
  readonly claims: typeof CLAIMS;
}

export type MeasurementOpenReferenceNeckAdmissionResultV1 =
  | Readonly<{
      ok: true;
      station: MeasurementOpenReferenceRigMidNeckStationV1;
      admission: MeasurementOpenReferenceNeckAdmissionV1;
      loop: MeshPlaneSectionLoopV1;
      flatRadiusM: number;
    }>
  | Readonly<{
      ok: false;
      station: MeasurementOpenReferenceRigMidNeckStationV1 | null;
      admission: MeasurementOpenReferenceNeckAdmissionV1;
      diagnostic: MeasurementOpenReferenceNeckDiagnosticV1;
    }>;

const CLAIMS = Object.freeze({
  visualReferenceOnly: true as const,
  rigMidNeckStationOnly: true as const,
  geometricPlaneLoopOnly: true as const,
  deformationSafetyBoundOnly: true as const,
  circumferenceRangeCalibrated: false as const,
  fitClaimEligible: false as const,
  anatomicalLandmarkEquivalent: false as const,
  anatomicalTapePathEquivalent: false as const,
  measurementProtocolEquivalent: false as const,
  realBodyValidationClaimed: false as const,
  nonAPoseSupported: false as const,
  localQualityAndSelfIntersectionRequired: true as const,
});

const NOT_EVALUATED_ADMISSION = Object.freeze({
  status: 'notEvaluated' as const,
  closedLoopCount: null,
  aboveHeadPlaneLoopVertexCount: null,
  jawClearanceMm: null,
  baseCircumferenceMm: null,
});

function scalarNotMeasured(message: string): MeasurementOpenReferenceNeckScalarCheckV1 {
  return Object.freeze({
    status: 'notMeasured' as const,
    baselineMm: null,
    achievedMm: null,
    driftMm: null,
    message,
  });
}

function neighboursNotMeasured(message: string): MeasurementOpenReferenceNeckProtectedNeighboursV1 {
  return Object.freeze({
    neck01Section: scalarNotMeasured(message),
    headPlaneVertices: Object.freeze({
      status: 'notMeasured' as const,
      vertexCount: null,
      maximumDisplacementM: null,
      exactZeroDisplacement: null,
      message,
    }),
    shoulderChord: scalarNotMeasured(message),
    chestStationPerimeter: scalarNotMeasured(message),
  });
}

function diagnostic(
  code: MeasurementOpenReferenceNeckDiagnosticCodeV1,
  message: string,
): MeasurementOpenReferenceNeckDiagnosticV1 {
  return Object.freeze({ code, message });
}

function policySnapshot(
  input: Partial<MeasurementOpenReferenceNeckProxyPolicyV1> | undefined,
): MeasurementOpenReferenceNeckProxyPolicyV1 {
  const policy = { ...DEFAULT_MEASUREMENT_OPEN_REFERENCE_NECK_PROXY_POLICY_V1, ...input };
  if (
    !Number.isFinite(policy.minimumRadialScale) ||
    !Number.isFinite(policy.maximumRadialScale) ||
    policy.minimumRadialScale <= 0 ||
    policy.minimumRadialScale >= 1 ||
    policy.maximumRadialScale <= 1 ||
    policy.maximumRadialScale > 1.25
  ) {
    throw new RangeError('Neck radial scales must straddle 1 within the safety envelope.');
  }
  for (const key of [
    'maximumAxialRadiusM',
    'stationDistanceRadiusRatio',
    'minimumAxialRadiusM',
    'maximumResidualMm',
    'maximumProtectedDriftMm',
    'sectionWeldToleranceM',
  ] as const) {
    if (!Number.isFinite(policy[key]) || policy[key] <= 0) {
      throw new RangeError(`${key} must be finite and positive.`);
    }
  }
  if (policy.stationDistanceRadiusRatio >= 0.5) {
    throw new RangeError('stationDistanceRadiusRatio must stay below 0.5.');
  }
  if (policy.minimumAxialRadiusM > policy.maximumAxialRadiusM) {
    throw new RangeError('minimumAxialRadiusM cannot exceed maximumAxialRadiusM.');
  }
  return Object.freeze(policy);
}

function finiteVec(value: readonly number[], label: string): void {
  if (value.length !== 3 || !value.every(Number.isFinite)) {
    throw new TypeError(`${label} must contain three finite coordinates.`);
  }
}

function frozenVec(value: readonly number[]): MeshPlaneSectionVec3V1 {
  return Object.freeze([value[0], value[1], value[2]]);
}

function subtract(
  left: MeshPlaneSectionVec3V1,
  right: MeshPlaneSectionVec3V1,
): MeshPlaneSectionVec3V1 {
  return [left[0] - right[0], left[1] - right[1], left[2] - right[2]];
}

function dot(left: readonly number[], right: readonly number[]): number {
  return left[0] * right[0] + left[1] * right[1] + left[2] * right[2];
}

function length(value: readonly number[]): number {
  return Math.hypot(value[0], value[1], value[2]);
}

function normalize(value: MeshPlaneSectionVec3V1): MeshPlaneSectionVec3V1 {
  const magnitude = length(value);
  if (!Number.isFinite(magnitude) || magnitude < 1e-9) {
    throw new RangeError('Rig neck axis is degenerate.');
  }
  return frozenVec([value[0] / magnitude, value[1] / magnitude, value[2] / magnitude]);
}

function validateMesh(positionsM: Float32Array, triangleIndices: Uint16Array | Uint32Array): void {
  if (!(positionsM instanceof Float32Array) || positionsM.length === 0 || positionsM.length % 3) {
    throw new TypeError('sourcePositionsM must be a non-empty XYZ Float32Array.');
  }
  if (!positionsM.every(Number.isFinite)) {
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
    throw new RangeError('triangleIndices contains an invalid vertex.');
  }
}

function resolveStation(options: {
  readonly rigHeads: MeasurementOpenReferenceNeckRigHeadsV1;
  readonly policy: MeasurementOpenReferenceNeckProxyPolicyV1;
}):
  | Readonly<{ ok: true; station: MeasurementOpenReferenceRigMidNeckStationV1 }>
  | Readonly<{ ok: false; diagnostic: MeasurementOpenReferenceNeckDiagnosticV1 }> {
  try {
    finiteVec(options.rigHeads.neck01, 'neck01 rest head');
    finiteVec(options.rigHeads.neck02, 'neck02 rest head');
    finiteVec(options.rigHeads.head, 'head rest head');
    const neck01HeadM = frozenVec(options.rigHeads.neck01);
    const originM = frozenVec(options.rigHeads.neck02);
    const headHeadM = frozenVec(options.rigHeads.head);
    const normal = normalize(subtract(headHeadM, neck01HeadM));
    const neck01DistanceM = length(subtract(originM, neck01HeadM));
    const headDistanceM = length(subtract(originM, headHeadM));
    const neckLengthM = length(subtract(headHeadM, neck01HeadM));
    const axialRadiusM = Math.min(
      options.policy.maximumAxialRadiusM,
      options.policy.stationDistanceRadiusRatio * Math.min(neck01DistanceM, headDistanceM),
    );
    if (
      !Number.isFinite(neckLengthM) ||
      neckLengthM <= 0 ||
      !Number.isFinite(neck01DistanceM) ||
      !Number.isFinite(headDistanceM)
    ) {
      throw new Error('Rig neck distances are invalid.');
    }
    return Object.freeze({
      ok: true as const,
      station: Object.freeze({
        name: 'rigMidNeckStation' as const,
        originM,
        normal,
        neck01HeadM,
        headHeadM,
        neckLengthM,
        neck01DistanceM,
        headDistanceM,
        axialRadiusM,
      }),
    });
  } catch (reason: unknown) {
    return Object.freeze({
      ok: false as const,
      diagnostic: diagnostic(
        'station-invalid',
        reason instanceof Error ? reason.message : 'Rig mid-neck station is invalid.',
      ),
    });
  }
}

function signedDistance(
  position: readonly number[],
  originM: MeshPlaneSectionVec3V1,
  normal: MeshPlaneSectionVec3V1,
): number {
  return dot(
    [position[0] - originM[0], position[1] - originM[1], position[2] - originM[2]],
    normal,
  );
}

function sectionFlatRadiusM(options: {
  readonly positionsM: Float32Array;
  readonly triangleIndices: Uint16Array | Uint32Array;
  readonly station: MeasurementOpenReferenceRigMidNeckStationV1;
}): number {
  let maximum = 0;
  let crossingTriangleCount = 0;
  for (let index = 0; index < options.triangleIndices.length; index += 3) {
    const distances = [0, 1, 2].map((corner) => {
      const offset = options.triangleIndices[index + corner] * 3;
      return signedDistance(
        [
          options.positionsM[offset],
          options.positionsM[offset + 1],
          options.positionsM[offset + 2],
        ],
        options.station.originM,
        options.station.normal,
      );
    });
    if (Math.min(...distances) > 0 || Math.max(...distances) < 0) continue;
    crossingTriangleCount += 1;
    maximum = Math.max(maximum, ...distances.map(Math.abs));
  }
  if (crossingTriangleCount === 0 || maximum <= 0) {
    throw new Error('Mid-neck station has no crossing triangle support.');
  }
  return maximum;
}

/**
 * Resolves the rig-only station and performs the mesh admission without trying another plane.
 */
export function inspectMeasurementOpenReferenceNeckAdmissionV1(options: {
  readonly sourcePositionsM: Float32Array;
  readonly triangleIndices: Uint16Array | Uint32Array;
  readonly rigHeads: MeasurementOpenReferenceNeckRigHeadsV1;
  readonly policy?: Partial<MeasurementOpenReferenceNeckProxyPolicyV1>;
}): MeasurementOpenReferenceNeckAdmissionResultV1 {
  validateMesh(options.sourcePositionsM, options.triangleIndices);
  const policy = policySnapshot(options.policy);
  const resolved = resolveStation({ rigHeads: options.rigHeads, policy });
  if (!resolved.ok) {
    return Object.freeze({
      ok: false as const,
      station: null,
      admission: Object.freeze({ ...NOT_EVALUATED_ADMISSION, status: 'rejected' as const }),
      diagnostic: resolved.diagnostic,
    });
  }
  const { station } = resolved;
  const measured = measureMeshPlaneSectionPerimetersV1({
    positionsM: options.sourcePositionsM,
    triangleIndices: options.triangleIndices,
    planeOriginM: station.originM,
    planeNormal: station.normal,
    selection: { kind: 'nearest-seed', seedM: station.originM },
    policy: { weldToleranceM: policy.sectionWeldToleranceM },
  });
  if (!measured.ok || !measured.selectedLoop) {
    return Object.freeze({
      ok: false as const,
      station,
      admission: Object.freeze({
        status: 'rejected' as const,
        closedLoopCount: measured.ok ? measured.loops.length : 0,
        aboveHeadPlaneLoopVertexCount: null,
        jawClearanceMm: null,
        baseCircumferenceMm: null,
      }),
      diagnostic: diagnostic(
        'section-invalid',
        measured.ok ? 'Mid-neck nearest-seed loop is missing.' : measured.errors.join('; '),
      ),
    });
  }
  const loop = measured.selectedLoop;
  const clearancesM = loop.pointsM.map(
    (point) => -signedDistance(point, station.headHeadM, station.normal),
  );
  const aboveHeadPlaneLoopVertexCount = clearancesM.filter((value) => value < 0).length;
  const admission = Object.freeze({
    status: 'admitted' as const,
    closedLoopCount: measured.loops.length,
    aboveHeadPlaneLoopVertexCount,
    jawClearanceMm: Math.min(...clearancesM) * 1000,
    baseCircumferenceMm: loop.perimeterM * 1000,
  });
  if (measured.loops.length !== 1) {
    return Object.freeze({
      ok: false as const,
      station,
      admission: Object.freeze({ ...admission, status: 'rejected' as const }),
      diagnostic: diagnostic(
        'section-loop-count-invalid',
        `Mid-neck plane produced ${measured.loops.length} closed loops.`,
      ),
    });
  }
  if (aboveHeadPlaneLoopVertexCount !== 0 || (admission.jawClearanceMm ?? -1) < 0) {
    return Object.freeze({
      ok: false as const,
      station,
      admission: Object.freeze({ ...admission, status: 'rejected' as const }),
      diagnostic: diagnostic(
        'head-clearance-failed',
        'Mid-neck loop reaches above the head plane.',
      ),
    });
  }
  if (station.axialRadiusM < policy.minimumAxialRadiusM) {
    return Object.freeze({
      ok: false as const,
      station,
      admission: Object.freeze({ ...admission, status: 'rejected' as const }),
      diagnostic: diagnostic('station-too-close', 'Rig neck stations are too close.'),
    });
  }
  try {
    const flatRadiusM = sectionFlatRadiusM({
      positionsM: options.sourcePositionsM,
      triangleIndices: options.triangleIndices,
      station,
    });
    if (flatRadiusM >= station.axialRadiusM) {
      throw new Error('Mid-neck crossing support reaches outside the axial radius.');
    }
    return Object.freeze({ ok: true as const, station, admission, loop, flatRadiusM });
  } catch (reason: unknown) {
    return Object.freeze({
      ok: false as const,
      station,
      admission: Object.freeze({ ...admission, status: 'rejected' as const }),
      diagnostic: diagnostic(
        'section-invalid',
        reason instanceof Error ? reason.message : 'Mid-neck crossing support is invalid.',
      ),
    });
  }
}

function smoothstep01(value: number): number {
  const bounded = Math.min(1, Math.max(0, value));
  return bounded * bounded * (3 - 2 * bounded);
}

function applyRadialScale(options: {
  readonly sourcePositionsM: Float32Array;
  readonly station: MeasurementOpenReferenceRigMidNeckStationV1;
  readonly centroidM: MeshPlaneSectionVec3V1;
  readonly flatRadiusM: number;
  readonly radialScale: number;
}): Float32Array {
  const result = options.sourcePositionsM.slice();
  for (let vertex = 0; vertex < result.length / 3; vertex += 1) {
    const offset = vertex * 3;
    const relative = [
      options.sourcePositionsM[offset] - options.centroidM[0],
      options.sourcePositionsM[offset + 1] - options.centroidM[1],
      options.sourcePositionsM[offset + 2] - options.centroidM[2],
    ] as const;
    const axial = dot(relative, options.station.normal);
    const absoluteAxial = Math.abs(axial);
    if (absoluteAxial >= options.station.axialRadiusM) continue;
    const weight =
      absoluteAxial <= options.flatRadiusM
        ? 1
        : 1 -
          smoothstep01(
            (absoluteAxial - options.flatRadiusM) /
              (options.station.axialRadiusM - options.flatRadiusM),
          );
    const radial = [
      relative[0] - axial * options.station.normal[0],
      relative[1] - axial * options.station.normal[1],
      relative[2] - axial * options.station.normal[2],
    ];
    const scaleDelta = (options.radialScale - 1) * weight;
    result[offset] += radial[0] * scaleDelta;
    result[offset + 1] += radial[1] * scaleDelta;
    result[offset + 2] += radial[2] * scaleDelta;
  }
  return result;
}

function measureSelectedSection(options: {
  readonly positionsM: Float32Array;
  readonly triangleIndices: Uint16Array | Uint32Array;
  readonly station: MeasurementOpenReferenceNeckProtectedSectionV1;
  readonly seedM?: MeshPlaneSectionVec3V1;
  readonly weldToleranceM: number;
}): MeshPlaneSectionLoopV1 {
  const measured = measureMeshPlaneSectionPerimetersV1({
    positionsM: options.positionsM,
    triangleIndices: options.triangleIndices,
    planeOriginM: options.station.originM,
    planeNormal: options.station.normal,
    selection: { kind: 'nearest-seed', seedM: options.seedM ?? options.station.originM },
    policy: { weldToleranceM: options.weldToleranceM },
  });
  if (!measured.ok || !measured.selectedLoop) {
    throw new Error(
      measured.ok ? 'Protected section loop is missing.' : measured.errors.join('; '),
    );
  }
  return measured.selectedLoop;
}

function shoulderChordMm(
  positionsM: Float32Array,
  vertices: Readonly<{ negative: number; positive: number }>,
): number {
  const negative = vertices.negative * 3;
  const positive = vertices.positive * 3;
  if (
    !Number.isSafeInteger(vertices.negative) ||
    !Number.isSafeInteger(vertices.positive) ||
    negative < 0 ||
    positive < 0 ||
    negative + 2 >= positionsM.length ||
    positive + 2 >= positionsM.length
  ) {
    throw new RangeError('Shoulder chord vertices are invalid.');
  }
  return (
    Math.hypot(
      positionsM[positive] - positionsM[negative],
      positionsM[positive + 1] - positionsM[negative + 1],
      positionsM[positive + 2] - positionsM[negative + 2],
    ) * 1000
  );
}

function measuredScalar(
  baselineMm: number,
  achievedMm: number,
  maximumDriftMm: number,
): MeasurementOpenReferenceNeckScalarCheckV1 {
  const driftMm = Math.abs(achievedMm - baselineMm);
  const passed = driftMm <= maximumDriftMm;
  return Object.freeze({
    status: passed ? ('measured' as const) : ('failed' as const),
    baselineMm,
    achievedMm,
    driftMm,
    message: passed ? null : `Protected drift ${driftMm.toFixed(3)} mm exceeds tolerance.`,
  });
}

function protectedNeighbours(options: {
  readonly sourcePositionsM: Float32Array;
  readonly candidatePositionsM: Float32Array;
  readonly triangleIndices: Uint16Array | Uint32Array;
  readonly station: MeasurementOpenReferenceRigMidNeckStationV1;
  readonly chestStation?: MeasurementOpenReferenceNeckProtectedSectionV1;
  readonly shoulderVertices?: Readonly<{ negative: number; positive: number }>;
  readonly policy: MeasurementOpenReferenceNeckProxyPolicyV1;
}): MeasurementOpenReferenceNeckProtectedNeighboursV1 {
  const neck01Station = Object.freeze({
    originM: options.station.neck01HeadM,
    normal: options.station.normal,
  });
  let neck01Section: MeasurementOpenReferenceNeckScalarCheckV1;
  try {
    const baseline = measureSelectedSection({
      positionsM: options.sourcePositionsM,
      triangleIndices: options.triangleIndices,
      station: neck01Station,
      weldToleranceM: options.policy.sectionWeldToleranceM,
    });
    const achieved = measureSelectedSection({
      positionsM: options.candidatePositionsM,
      triangleIndices: options.triangleIndices,
      station: neck01Station,
      seedM: baseline.centroidM,
      weldToleranceM: options.policy.sectionWeldToleranceM,
    });
    neck01Section = measuredScalar(
      baseline.perimeterM * 1000,
      achieved.perimeterM * 1000,
      options.policy.maximumProtectedDriftMm,
    );
  } catch (reason: unknown) {
    neck01Section = Object.freeze({
      ...scalarNotMeasured('Protected neck01 section could not be measured.'),
      status: 'failed' as const,
      message: reason instanceof Error ? reason.message : 'Protected neck01 section failed.',
    });
  }

  const aboveHeadVertices: number[] = [];
  let maximumDisplacementM = 0;
  for (let vertex = 0; vertex < options.sourcePositionsM.length / 3; vertex += 1) {
    const offset = vertex * 3;
    const source = [
      options.sourcePositionsM[offset],
      options.sourcePositionsM[offset + 1],
      options.sourcePositionsM[offset + 2],
    ] as const;
    if (signedDistance(source, options.station.headHeadM, options.station.normal) <= 0) continue;
    aboveHeadVertices.push(vertex);
    maximumDisplacementM = Math.max(
      maximumDisplacementM,
      Math.hypot(
        options.candidatePositionsM[offset] - source[0],
        options.candidatePositionsM[offset + 1] - source[1],
        options.candidatePositionsM[offset + 2] - source[2],
      ),
    );
  }
  const exactZeroDisplacement = aboveHeadVertices.every((vertex) => {
    const offset = vertex * 3;
    return (
      options.candidatePositionsM[offset] === options.sourcePositionsM[offset] &&
      options.candidatePositionsM[offset + 1] === options.sourcePositionsM[offset + 1] &&
      options.candidatePositionsM[offset + 2] === options.sourcePositionsM[offset + 2]
    );
  });
  const headPlaneVertices = Object.freeze({
    status: exactZeroDisplacement ? ('measured' as const) : ('failed' as const),
    vertexCount: aboveHeadVertices.length,
    maximumDisplacementM,
    exactZeroDisplacement,
    message: exactZeroDisplacement ? null : 'A vertex above the head plane moved.',
  });

  let shoulderChord: MeasurementOpenReferenceNeckScalarCheckV1;
  if (!options.shoulderVertices) {
    shoulderChord = scalarNotMeasured('Shoulder vertices were not provided.');
  } else {
    try {
      shoulderChord = measuredScalar(
        shoulderChordMm(options.sourcePositionsM, options.shoulderVertices),
        shoulderChordMm(options.candidatePositionsM, options.shoulderVertices),
        options.policy.maximumProtectedDriftMm,
      );
    } catch (reason: unknown) {
      shoulderChord = Object.freeze({
        ...scalarNotMeasured('Shoulder chord could not be measured.'),
        status: 'failed' as const,
        message: reason instanceof Error ? reason.message : 'Shoulder chord check failed.',
      });
    }
  }

  let chestStationPerimeter: MeasurementOpenReferenceNeckScalarCheckV1;
  if (!options.chestStation) {
    chestStationPerimeter = scalarNotMeasured('Chest station was not provided.');
  } else {
    try {
      finiteVec(options.chestStation.originM, 'chest station origin');
      finiteVec(options.chestStation.normal, 'chest station normal');
      const baseline = measureSelectedSection({
        positionsM: options.sourcePositionsM,
        triangleIndices: options.triangleIndices,
        station: options.chestStation,
        weldToleranceM: options.policy.sectionWeldToleranceM,
      });
      const achieved = measureSelectedSection({
        positionsM: options.candidatePositionsM,
        triangleIndices: options.triangleIndices,
        station: options.chestStation,
        seedM: baseline.centroidM,
        weldToleranceM: options.policy.sectionWeldToleranceM,
      });
      chestStationPerimeter = measuredScalar(
        baseline.perimeterM * 1000,
        achieved.perimeterM * 1000,
        options.policy.maximumProtectedDriftMm,
      );
    } catch (reason: unknown) {
      chestStationPerimeter = Object.freeze({
        ...scalarNotMeasured('Chest station perimeter could not be measured.'),
        status: 'failed' as const,
        message: reason instanceof Error ? reason.message : 'Chest station check failed.',
      });
    }
  }
  return Object.freeze({
    neck01Section,
    headPlaneVertices,
    shoulderChord,
    chestStationPerimeter,
  });
}

function hasFailedNeighbour(checks: MeasurementOpenReferenceNeckProtectedNeighboursV1): boolean {
  return Object.values(checks).some(({ status }) => status === 'failed');
}

/**
 * Pure, unwired A-pose mid-neck proxy. No neck-base value, alias, ratio, or fallback plane is used.
 * Any closure or quality failure returns the caller's undeformed positions.
 */
export function solveMeasurementOpenReferenceNeckProxyV1(options: {
  readonly sourcePositionsM: Float32Array;
  readonly triangleIndices: Uint16Array | Uint32Array;
  readonly pose: BodyPoseKind;
  readonly targetCircumferenceMm?: number;
  readonly rigHeads: MeasurementOpenReferenceNeckRigHeadsV1;
  readonly chestStation?: MeasurementOpenReferenceNeckProtectedSectionV1;
  readonly shoulderVertices?: Readonly<{ negative: number; positive: number }>;
  readonly policy?: Partial<MeasurementOpenReferenceNeckProxyPolicyV1>;
}): MeasurementOpenReferenceNeckProxyResultV1 {
  const target = options.targetCircumferenceMm;
  const finish = (
    input: Partial<MeasurementOpenReferenceNeckProxyResultV1> &
      Pick<MeasurementOpenReferenceNeckProxyResultV1, 'status'>,
  ): MeasurementOpenReferenceNeckProxyResultV1 =>
    Object.freeze({
      version: MEASUREMENT_OPEN_REFERENCE_NECK_PROXY_V1,
      role: 'CC0_OPEN_REFERENCE_A_POSE_MID_NECK_GEOMETRIC_PROXY' as const,
      status: input.status,
      positionsM: input.positionsM ?? options.sourcePositionsM,
      requestedTargetMm: input.requestedTargetMm ?? target ?? null,
      appliedTargetMm: input.appliedTargetMm ?? null,
      baselineCircumferenceMm: input.baselineCircumferenceMm ?? null,
      achievedCircumferenceMm: input.achievedCircumferenceMm ?? null,
      absoluteResidualMm: input.absoluteResidualMm ?? null,
      radialScale: input.radialScale ?? 1,
      station: input.station ?? null,
      admission: input.admission ?? NOT_EVALUATED_ADMISSION,
      protectedNeighbours:
        input.protectedNeighbours ?? neighboursNotMeasured('Neck proxy was not evaluated.'),
      qualityGate: input.qualityGate ?? null,
      diagnostics: Object.freeze([...(input.diagnostics ?? [])]),
      claims: CLAIMS,
    });

  // The unwired fast path performs no mesh work and preserves exact array identity.
  if (target == null)
    return finish({ status: 'unrequested', positionsM: options.sourcePositionsM });
  validateMesh(options.sourcePositionsM, options.triangleIndices);
  const policy = policySnapshot(options.policy);
  if (!Number.isFinite(target) || target <= 0) {
    return finish({
      status: 'notApplied',
      diagnostics: [diagnostic('target-invalid', 'Neck circumference target must be positive.')],
    });
  }
  if (options.pose !== 'A') {
    return finish({
      status: 'notApplied',
      diagnostics: [diagnostic('input-invalid', 'Neck proxy is disabled outside the A pose.')],
    });
  }

  const admitted = inspectMeasurementOpenReferenceNeckAdmissionV1({
    sourcePositionsM: options.sourcePositionsM,
    triangleIndices: options.triangleIndices,
    rigHeads: options.rigHeads,
    policy,
  });
  if (!admitted.ok) {
    return finish({
      status: 'notApplied',
      station: admitted.station,
      admission: admitted.admission,
      baselineCircumferenceMm: admitted.admission.baseCircumferenceMm,
      achievedCircumferenceMm: admitted.admission.baseCircumferenceMm,
      diagnostics: [admitted.diagnostic],
    });
  }

  const baselineCircumferenceMm = admitted.admission.baseCircumferenceMm;
  if (baselineCircumferenceMm == null || baselineCircumferenceMm <= 0) {
    return finish({
      status: 'notApplied',
      station: admitted.station,
      admission: admitted.admission,
      diagnostics: [diagnostic('section-invalid', 'Mid-neck baseline is invalid.')],
    });
  }
  const requestedScale = target / baselineCircumferenceMm;
  const radialScale = Math.min(
    policy.maximumRadialScale,
    Math.max(policy.minimumRadialScale, requestedScale),
  );
  const limited = radialScale !== requestedScale;
  const appliedTargetMm = baselineCircumferenceMm * radialScale;
  const candidatePositionsM = applyRadialScale({
    sourcePositionsM: options.sourcePositionsM,
    station: admitted.station,
    centroidM: admitted.loop.centroidM,
    flatRadiusM: admitted.flatRadiusM,
    radialScale,
  });

  let achievedCircumferenceMm: number;
  try {
    achievedCircumferenceMm =
      measureSelectedSection({
        positionsM: candidatePositionsM,
        triangleIndices: options.triangleIndices,
        station: admitted.station,
        seedM: admitted.loop.centroidM,
        weldToleranceM: policy.sectionWeldToleranceM,
      }).perimeterM * 1000;
  } catch (reason: unknown) {
    return finish({
      status: 'notApplied',
      station: admitted.station,
      admission: admitted.admission,
      baselineCircumferenceMm,
      achievedCircumferenceMm: baselineCircumferenceMm,
      diagnostics: [
        diagnostic(
          'section-invalid',
          reason instanceof Error ? reason.message : 'Deformed mid-neck section is invalid.',
        ),
      ],
    });
  }
  const absoluteResidualMm = Math.abs(achievedCircumferenceMm - appliedTargetMm);
  if (absoluteResidualMm > policy.maximumResidualMm) {
    return finish({
      status: 'notApplied',
      station: admitted.station,
      admission: admitted.admission,
      baselineCircumferenceMm,
      achievedCircumferenceMm: baselineCircumferenceMm,
      diagnostics: [
        diagnostic(
          'residual-exceeded',
          `Neck residual ${absoluteResidualMm.toFixed(3)} mm exceeds tolerance.`,
        ),
      ],
    });
  }

  const checks = protectedNeighbours({
    sourcePositionsM: options.sourcePositionsM,
    candidatePositionsM,
    triangleIndices: options.triangleIndices,
    station: admitted.station,
    chestStation: options.chestStation,
    shoulderVertices: options.shoulderVertices,
    policy,
  });
  if (hasFailedNeighbour(checks)) {
    return finish({
      status: 'notApplied',
      station: admitted.station,
      admission: admitted.admission,
      baselineCircumferenceMm,
      achievedCircumferenceMm: baselineCircumferenceMm,
      protectedNeighbours: checks,
      diagnostics: [
        diagnostic('protected-neighbour-failed', 'A protected neck neighbour check failed.'),
      ],
    });
  }

  const qualityGate = evaluateMeasurementOpenReferenceDisplayQualityWithSelfIntersectionV1({
    uniformPositionsM: options.sourcePositionsM,
    personalizedPositionsM: candidatePositionsM,
    triangleIndices: options.triangleIndices,
  });
  if (!qualityGate.safe) {
    return finish({
      status: 'notApplied',
      station: admitted.station,
      admission: admitted.admission,
      baselineCircumferenceMm,
      achievedCircumferenceMm: baselineCircumferenceMm,
      protectedNeighbours: checks,
      qualityGate,
      diagnostics: [diagnostic('local-quality-unsafe', 'Neck quality check failed.')],
    });
  }

  return finish({
    status: limited ? 'limited' : 'represented',
    positionsM: candidatePositionsM,
    appliedTargetMm,
    baselineCircumferenceMm,
    achievedCircumferenceMm,
    absoluteResidualMm,
    radialScale,
    station: admitted.station,
    admission: admitted.admission,
    protectedNeighbours: checks,
    qualityGate,
    diagnostics: limited
      ? [diagnostic('target-limited', 'Neck target is outside the deformation-safety bound.')]
      : [],
  });
}
