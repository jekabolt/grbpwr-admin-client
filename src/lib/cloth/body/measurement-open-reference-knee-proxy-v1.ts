import type { MakeHumanCoreRigBundleV1 } from './makehuman-core-rig-pose-research-v1';
import type { BodyPoseKind } from './contracts';
import type { OpenReferenceLimbCircumferenceModeV1 } from './measurement-open-reference-limb-circumference-solver-v1';
import type { MakeHumanOpenReferenceBasisV1 } from './measurement-open-reference-display-v1';
import {
  deriveOpenReferenceLimbSectionStationsV1,
  type OpenReferenceLimbSectionStationV1,
} from './measurement-open-reference-limb-section-station-v1';
import {
  measureMeshPlaneSectionPerimetersV1,
  type MeshPlaneSectionVec3V1,
} from './mesh-plane-section-perimeter-v1';

export const MEASUREMENT_OPEN_REFERENCE_KNEE_PROXY_V1 =
  'measurement-open-reference-knee-proxy/v1' as const;

export interface MeasurementOpenReferenceKneeProxyPolicyV1 {
  readonly minimumRadialScale: number;
  readonly maximumRadialScale: number;
  readonly maximumAxialRadiusM: number;
  readonly protectedDistanceRadiusRatio: number;
  readonly minimumAxialRadiusM: number;
  readonly binarySearchIterations: number;
  readonly maximumResidualMm: number;
  readonly maximumProtectedDriftMm: number;
  readonly bilateralResponseRatioLimit: number;
}

/**
 * The 0.90..1.10 interval is a visual deformation-safety bound, not a calibrated body range.
 * The 0.5 mm residual/drift tolerance matches the procedural torso-proxy tolerance: a smooth
 * spatial field cannot honestly use the 0.1 mm delta-mode closure threshold.
 */
export const DEFAULT_MEASUREMENT_OPEN_REFERENCE_KNEE_PROXY_POLICY_V1 = Object.freeze({
  minimumRadialScale: 0.9,
  maximumRadialScale: 1.1,
  maximumAxialRadiusM: 0.06,
  protectedDistanceRadiusRatio: 0.45,
  minimumAxialRadiusM: 0.025,
  binarySearchIterations: 18,
  maximumResidualMm: 0.5,
  maximumProtectedDriftMm: 0.5,
  bilateralResponseRatioLimit: 1.5,
} satisfies MeasurementOpenReferenceKneeProxyPolicyV1);

export interface MeasurementOpenReferenceKneeProxyProtectedStationV1 {
  readonly originM: MeshPlaneSectionVec3V1;
  readonly normal: MeshPlaneSectionVec3V1;
}

export interface MeasurementOpenReferenceKneeProxyStationV1 {
  readonly side: 'negative' | 'positive';
  /** Display-space head of core-rig lowerleg01.L/R. */
  readonly originM: MeshPlaneSectionVec3V1;
  /** Display-space upperleg01-head to foot-head axis. */
  readonly normal: MeshPlaneSectionVec3V1;
  readonly thigh: MeasurementOpenReferenceKneeProxyProtectedStationV1;
  readonly calf: MeasurementOpenReferenceKneeProxyProtectedStationV1;
  readonly thighDistanceM: number;
  readonly calfDistanceM: number;
  readonly axialRadiusM: number;
}

export type MeasurementOpenReferenceKneeProxyDiagnosticCodeV1 =
  | 'bilateral-response-unsafe'
  | 'direction-response-invalid'
  | 'pose-not-admitted'
  | 'protected-drift-exceeded'
  | 'residual-exceeded'
  | 'section-invalid'
  | 'station-invalid'
  | 'station-too-close'
  | 'target-limited';

export interface MeasurementOpenReferenceKneeProxyDiagnosticV1 {
  readonly severity: 'warning';
  readonly code: MeasurementOpenReferenceKneeProxyDiagnosticCodeV1;
  readonly measurementKey: 'kneeCircumferenceMm';
  readonly message: string;
}

export interface MeasurementOpenReferenceKneeProxyBilateralMmV1 {
  readonly negative: number;
  readonly positive: number;
  readonly average: number;
}

export interface MeasurementOpenReferenceKneeProxyProtectedDriftMmV1 {
  readonly thighNegative: number;
  readonly thighPositive: number;
  readonly calfNegative: number;
  readonly calfPositive: number;
  readonly maximum: number;
}

interface MeasurementOpenReferenceKneeProxyResultBaseV1 {
  readonly version: typeof MEASUREMENT_OPEN_REFERENCE_KNEE_PROXY_V1;
  readonly role: 'CC0_OPEN_REFERENCE_A_POSE_KNEE_GEOMETRIC_PROXY';
  readonly positionsM: Float32Array;
  readonly requestedTargetMm: number;
  readonly diagnostics: readonly MeasurementOpenReferenceKneeProxyDiagnosticV1[];
  readonly claims: {
    readonly visualReferenceOnly: true;
    readonly rigJointStationOnly: true;
    readonly geometricPlaneLoopOnly: true;
    readonly radialScaleVisualSafetyBound: true;
    readonly circumferenceRangeCalibrated: false;
    readonly canonicalMeasurementSemanticMatchClaimed: false;
    readonly anatomicalTapePathEquivalent: false;
    readonly measurementProtocolEquivalent: false;
    readonly realBodyValidationClaimed: false;
    readonly fitClaimEligible: false;
    readonly runtimeCollisionEligible: false;
    readonly collisionCandidateEligible: false;
    readonly nonAPoseSupported: false;
    readonly selfIntersection: 'not-evaluated-after-deformation';
  };
}

export type MeasurementOpenReferenceKneeProxyResultV1 =
  | (MeasurementOpenReferenceKneeProxyResultBaseV1 & {
      readonly status: 'notApplied';
      readonly appliedTargetMm: null;
      readonly radialScale: 1;
      readonly baselineMm: MeasurementOpenReferenceKneeProxyBilateralMmV1 | null;
      readonly achievedMm: null;
      readonly absoluteResidualMm: null;
      readonly protectedDriftMm: null;
    })
  | (MeasurementOpenReferenceKneeProxyResultBaseV1 & {
      readonly status: 'limited' | 'represented';
      readonly appliedTargetMm: number;
      readonly radialScale: number;
      readonly baselineMm: MeasurementOpenReferenceKneeProxyBilateralMmV1;
      readonly achievedMm: MeasurementOpenReferenceKneeProxyBilateralMmV1;
      readonly absoluteResidualMm: number;
      readonly protectedDriftMm: MeasurementOpenReferenceKneeProxyProtectedDriftMmV1;
    });

const CLAIMS = Object.freeze({
  visualReferenceOnly: true as const,
  rigJointStationOnly: true as const,
  geometricPlaneLoopOnly: true as const,
  radialScaleVisualSafetyBound: true as const,
  circumferenceRangeCalibrated: false as const,
  canonicalMeasurementSemanticMatchClaimed: false as const,
  anatomicalTapePathEquivalent: false as const,
  measurementProtocolEquivalent: false as const,
  realBodyValidationClaimed: false as const,
  fitClaimEligible: false as const,
  runtimeCollisionEligible: false as const,
  collisionCandidateEligible: false as const,
  nonAPoseSupported: false as const,
  selfIntersection: 'not-evaluated-after-deformation' as const,
});

function diagnostic(
  code: MeasurementOpenReferenceKneeProxyDiagnosticCodeV1,
  message: string,
): MeasurementOpenReferenceKneeProxyDiagnosticV1 {
  return Object.freeze({
    severity: 'warning' as const,
    code,
    measurementKey: 'kneeCircumferenceMm' as const,
    message,
  });
}

function finiteVec(value: readonly number[], label: string): void {
  if (value.length !== 3 || !value.every(Number.isFinite)) {
    throw new TypeError(`${label} must contain three finite coordinates.`);
  }
}

function normalize(value: readonly number[], label: string): MeshPlaneSectionVec3V1 {
  finiteVec(value, label);
  const length = Math.hypot(value[0], value[1], value[2]);
  if (!Number.isFinite(length) || length < 1e-9) throw new RangeError(`${label} is degenerate.`);
  return Object.freeze([value[0] / length, value[1] / length, value[2] / length]);
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

function snapshotPolicy(
  input: Partial<MeasurementOpenReferenceKneeProxyPolicyV1> | undefined,
): MeasurementOpenReferenceKneeProxyPolicyV1 {
  const policy = { ...DEFAULT_MEASUREMENT_OPEN_REFERENCE_KNEE_PROXY_POLICY_V1, ...input };
  if (
    !Number.isFinite(policy.minimumRadialScale) ||
    !Number.isFinite(policy.maximumRadialScale) ||
    policy.minimumRadialScale <= 0 ||
    policy.minimumRadialScale >= 1 ||
    policy.maximumRadialScale <= 1
  ) {
    throw new RangeError('Radial scales must straddle 1 within 0..2.');
  }
  for (const key of [
    'maximumAxialRadiusM',
    'protectedDistanceRadiusRatio',
    'minimumAxialRadiusM',
    'maximumResidualMm',
    'maximumProtectedDriftMm',
  ] as const) {
    if (!Number.isFinite(policy[key]) || policy[key] <= 0) {
      throw new RangeError(`${key} must be finite and positive.`);
    }
  }
  if (policy.protectedDistanceRadiusRatio >= 0.5) {
    throw new RangeError('protectedDistanceRadiusRatio must stay below 0.5.');
  }
  if (policy.minimumAxialRadiusM > policy.maximumAxialRadiusM) {
    throw new RangeError('minimumAxialRadiusM cannot exceed maximumAxialRadiusM.');
  }
  if (!Number.isSafeInteger(policy.binarySearchIterations) || policy.binarySearchIterations < 1) {
    throw new RangeError('binarySearchIterations must be a positive integer.');
  }
  if (
    !Number.isFinite(policy.bilateralResponseRatioLimit) ||
    policy.bilateralResponseRatioLimit < 1
  ) {
    throw new RangeError('bilateralResponseRatioLimit must be at least 1.');
  }
  return Object.freeze(policy);
}

function validateMesh(positionsM: Float32Array, triangleIndices: Uint16Array | Uint32Array): void {
  if (!(positionsM instanceof Float32Array) || positionsM.length === 0 || positionsM.length % 3) {
    throw new TypeError('positionsM must be a non-empty XYZ Float32Array.');
  }
  if (!positionsM.every(Number.isFinite)) {
    throw new TypeError('positionsM contains a non-finite coordinate.');
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

function protectedStation(
  station: OpenReferenceLimbSectionStationV1,
): MeasurementOpenReferenceKneeProxyProtectedStationV1 {
  return Object.freeze({
    originM: Object.freeze([...station.originM]) as unknown as MeshPlaneSectionVec3V1,
    normal: Object.freeze([...station.normal]) as unknown as MeshPlaneSectionVec3V1,
  });
}

function boneHeadDisplayM(options: {
  readonly bundle: MakeHumanCoreRigBundleV1;
  readonly basis: MakeHumanOpenReferenceBasisV1;
  readonly heightMm: number;
  readonly boneName: string;
}): MeshPlaneSectionVec3V1 {
  const bone = options.bundle.bones.findIndex(({ name }) => name === options.boneName);
  if (bone < 0) throw new Error(`Core rig is missing ${options.boneName}.`);
  const anchors = options.bundle.bases.find(({ kind }) => kind === options.basis.kind);
  if (!anchors) throw new Error(`Core rig is missing basis ${options.basis.kind}.`);
  const sourceHeight = options.basis.sourceMaximumY - options.basis.sourceMinimumY;
  if (!Number.isFinite(sourceHeight) || sourceHeight <= 0) {
    throw new Error('Open-reference basis height is invalid.');
  }
  const scaleMPerSourceUnit = options.heightMm / 1000 / sourceHeight;
  const offset = bone * 3;
  return Object.freeze([
    anchors.headsSourceUnits[offset] * scaleMPerSourceUnit,
    (anchors.headsSourceUnits[offset + 1] - options.basis.sourceMinimumY) * scaleMPerSourceUnit,
    anchors.headsSourceUnits[offset + 2] * scaleMPerSourceUnit,
  ]);
}

export interface MeasurementOpenReferenceKneeRigStationV1 {
  readonly side: 'negative' | 'positive';
  /** Display-space head of core-rig lowerleg01.L/R. */
  readonly originM: MeshPlaneSectionVec3V1;
  /** Display-space upperleg01-head to foot-head axis. */
  readonly normal: MeshPlaneSectionVec3V1;
}

/**
 * Rig-only knee planes (no mesh, no limb modes) in the uniformly height-scaled display space,
 * sorted negative then positive. Shared by the solver stations and the measurement guide.
 */
export function resolveMeasurementOpenReferenceKneeRigStationsV1(options: {
  readonly basis: MakeHumanOpenReferenceBasisV1;
  readonly heightMm: number;
  readonly rig: MakeHumanCoreRigBundleV1;
}): readonly [MeasurementOpenReferenceKneeRigStationV1, MeasurementOpenReferenceKneeRigStationV1] {
  if (!Number.isFinite(options.heightMm) || options.heightMm <= 0) {
    throw new RangeError('heightMm must be finite and positive.');
  }
  const stations = (['L', 'R'] as const).map((suffix) => {
    const originM = boneHeadDisplayM({
      ...options,
      bundle: options.rig,
      boneName: `lowerleg01.${suffix}`,
    });
    const upperM = boneHeadDisplayM({
      ...options,
      bundle: options.rig,
      boneName: `upperleg01.${suffix}`,
    });
    const footM = boneHeadDisplayM({
      ...options,
      bundle: options.rig,
      boneName: `foot.${suffix}`,
    });
    const normal = normalize(subtract(footM, upperM), `knee ${suffix} leg axis`);
    const side = originM[0] < 0 ? ('negative' as const) : ('positive' as const);
    return Object.freeze({ side, originM, normal });
  });
  stations.sort((left, right) => left.side.localeCompare(right.side));
  if (stations[0].side === stations[1].side) {
    throw new Error('Core rig knee stations do not split across display X=0.');
  }
  return Object.freeze(stations) as unknown as readonly [
    MeasurementOpenReferenceKneeRigStationV1,
    MeasurementOpenReferenceKneeRigStationV1,
  ];
}

/**
 * Builds the two rig-knee stations in the uniformly height-scaled display space. Thigh and calf
 * station modes are required only as protected geometric stations; no delta is applied here.
 */
export function deriveMeasurementOpenReferenceKneeProxyStationsV1(options: {
  readonly positionsM: Float32Array;
  readonly basis: MakeHumanOpenReferenceBasisV1;
  readonly heightMm: number;
  readonly rig: MakeHumanCoreRigBundleV1;
  readonly thighMode: OpenReferenceLimbCircumferenceModeV1;
  readonly calfMode: OpenReferenceLimbCircumferenceModeV1;
  readonly policy?: Partial<MeasurementOpenReferenceKneeProxyPolicyV1>;
}): readonly [
  MeasurementOpenReferenceKneeProxyStationV1,
  MeasurementOpenReferenceKneeProxyStationV1,
] {
  if (!Number.isFinite(options.heightMm) || options.heightMm <= 0) {
    throw new RangeError('heightMm must be finite and positive.');
  }
  if (options.thighMode.measurementKey !== 'thighCircumferenceMm') {
    throw new TypeError('thighMode must own thighCircumferenceMm.');
  }
  if (options.calfMode.measurementKey !== 'calfCircumferenceMm') {
    throw new TypeError('calfMode must own calfCircumferenceMm.');
  }
  if (
    options.rig.visibleVertexCount * 3 !== options.positionsM.length ||
    options.basis.positionsSourceUnits.length !== options.positionsM.length ||
    options.rig.sourceUnitScaleToM !== options.basis.sourceUnitScaleToM
  ) {
    throw new Error('Rig, basis, and display mesh topology do not match.');
  }
  const policy = snapshotPolicy(options.policy);
  const thighBySide = new Map(
    deriveOpenReferenceLimbSectionStationsV1({
      positionsM: options.positionsM,
      mode: options.thighMode,
    }).map((station) => [station.side, station]),
  );
  const calfBySide = new Map(
    deriveOpenReferenceLimbSectionStationsV1({
      positionsM: options.positionsM,
      mode: options.calfMode,
    }).map((station) => [station.side, station]),
  );

  const rigStations = resolveMeasurementOpenReferenceKneeRigStationsV1(options);
  const stations = rigStations.map(({ side, originM, normal }) => {
    const thigh = thighBySide.get(side);
    const calf = calfBySide.get(side);
    if (!thigh || !calf) throw new Error(`${side} protected limb stations are incomplete.`);
    const thighDistanceM = Math.abs(dot(subtract(thigh.originM, originM), normal));
    const calfDistanceM = Math.abs(dot(subtract(calf.originM, originM), normal));
    const axialRadiusM = Math.min(
      policy.maximumAxialRadiusM,
      policy.protectedDistanceRadiusRatio * thighDistanceM,
      policy.protectedDistanceRadiusRatio * calfDistanceM,
    );
    return Object.freeze({
      side,
      originM,
      normal,
      thigh: protectedStation(thigh),
      calf: protectedStation(calf),
      thighDistanceM,
      calfDistanceM,
      axialRadiusM,
    });
  });
  return Object.freeze(stations) as unknown as readonly [
    MeasurementOpenReferenceKneeProxyStationV1,
    MeasurementOpenReferenceKneeProxyStationV1,
  ];
}

interface MeasuredSection {
  readonly perimeterMm: number;
  readonly centroidM: MeshPlaneSectionVec3V1;
}

function measureSection(options: {
  readonly positionsM: Float32Array;
  readonly triangleIndices: Uint16Array | Uint32Array;
  readonly originM: MeshPlaneSectionVec3V1;
  readonly normal: MeshPlaneSectionVec3V1;
  readonly seedM?: MeshPlaneSectionVec3V1;
}): MeasuredSection {
  const measured = measureMeshPlaneSectionPerimetersV1({
    positionsM: options.positionsM,
    triangleIndices: options.triangleIndices,
    planeOriginM: options.originM,
    planeNormal: options.normal,
    selection: { kind: 'nearest-seed', seedM: options.seedM ?? options.originM },
  });
  if (!measured.ok || !measured.selectedLoop) {
    throw new Error(measured.ok ? 'Section loop selection failed.' : measured.errors.join('; '));
  }
  const perimeterMm = measured.selectedLoop.perimeterM * 1000;
  if (!Number.isFinite(perimeterMm) || perimeterMm <= 0) {
    throw new Error('Section loop perimeter is invalid.');
  }
  return Object.freeze({
    perimeterMm,
    centroidM: measured.selectedLoop.centroidM,
  });
}

function bilateral(values: ReadonlyMap<'negative' | 'positive', number>) {
  const negative = values.get('negative');
  const positive = values.get('positive');
  if (negative == null || positive == null) throw new Error('Bilateral sections are incomplete.');
  return Object.freeze({
    negative,
    positive,
    average: (negative + positive) / 2,
  });
}

function measureKnees(options: {
  readonly positionsM: Float32Array;
  readonly triangleIndices: Uint16Array | Uint32Array;
  readonly stations: readonly MeasurementOpenReferenceKneeProxyStationV1[];
  readonly seeds?: ReadonlyMap<'negative' | 'positive', MeshPlaneSectionVec3V1>;
}): {
  readonly value: MeasurementOpenReferenceKneeProxyBilateralMmV1;
  readonly centroids: ReadonlyMap<'negative' | 'positive', MeshPlaneSectionVec3V1>;
} {
  const values = new Map<'negative' | 'positive', number>();
  const centroids = new Map<'negative' | 'positive', MeshPlaneSectionVec3V1>();
  options.stations.forEach((station) => {
    const measured = measureSection({
      positionsM: options.positionsM,
      triangleIndices: options.triangleIndices,
      originM: station.originM,
      normal: station.normal,
      seedM: options.seeds?.get(station.side),
    });
    values.set(station.side, measured.perimeterMm);
    centroids.set(station.side, measured.centroidM);
  });
  return Object.freeze({ value: bilateral(values), centroids });
}

interface ProtectedMeasurements {
  readonly thighNegative: number;
  readonly thighPositive: number;
  readonly calfNegative: number;
  readonly calfPositive: number;
}

function measureProtected(options: {
  readonly positionsM: Float32Array;
  readonly triangleIndices: Uint16Array | Uint32Array;
  readonly stations: readonly MeasurementOpenReferenceKneeProxyStationV1[];
}): ProtectedMeasurements {
  const values = new Map<string, number>();
  options.stations.forEach((station) => {
    (['thigh', 'calf'] as const).forEach((kind) => {
      const protectedValue = station[kind];
      values.set(
        `${kind}:${station.side}`,
        measureSection({
          positionsM: options.positionsM,
          triangleIndices: options.triangleIndices,
          originM: protectedValue.originM,
          normal: protectedValue.normal,
        }).perimeterMm,
      );
    });
  });
  const get = (kind: 'thigh' | 'calf', side: 'negative' | 'positive') => {
    const value = values.get(`${kind}:${side}`);
    if (value == null) throw new Error('Protected section measurements are incomplete.');
    return value;
  };
  return Object.freeze({
    thighNegative: get('thigh', 'negative'),
    thighPositive: get('thigh', 'positive'),
    calfNegative: get('calf', 'negative'),
    calfPositive: get('calf', 'positive'),
  });
}

function smoothstep(value: number): number {
  const t = Math.min(1, Math.max(0, value));
  return t * t * (3 - 2 * t);
}

function sectionFlatRadii(options: {
  readonly positionsM: Float32Array;
  readonly triangleIndices: Uint16Array | Uint32Array;
  readonly stations: readonly MeasurementOpenReferenceKneeProxyStationV1[];
}): ReadonlyMap<'negative' | 'positive', number> {
  const result = new Map<'negative' | 'positive', number>();
  options.stations.forEach((station) => {
    let maximumCrossingVertexDistanceM = 0;
    let crossingTriangleCount = 0;
    for (let offset = 0; offset < options.triangleIndices.length; offset += 3) {
      const vertices = [
        options.triangleIndices[offset],
        options.triangleIndices[offset + 1],
        options.triangleIndices[offset + 2],
      ];
      const meanX = vertices.reduce((sum, vertex) => sum + options.positionsM[vertex * 3], 0) / 3;
      if (station.side === 'negative' ? meanX >= 0 : meanX <= 0) continue;
      const distances = vertices.map((vertex) => {
        const positionOffset = vertex * 3;
        return dot(
          [
            options.positionsM[positionOffset] - station.originM[0],
            options.positionsM[positionOffset + 1] - station.originM[1],
            options.positionsM[positionOffset + 2] - station.originM[2],
          ],
          station.normal,
        );
      });
      if (Math.min(...distances) > 0 || Math.max(...distances) < 0) continue;
      crossingTriangleCount += 1;
      maximumCrossingVertexDistanceM = Math.max(
        maximumCrossingVertexDistanceM,
        ...distances.map(Math.abs),
      );
    }
    if (crossingTriangleCount === 0 || maximumCrossingVertexDistanceM <= 0) {
      throw new Error(`${station.side} knee station has no crossing triangle support.`);
    }
    if (maximumCrossingVertexDistanceM >= station.axialRadiusM) {
      throw new Error(`${station.side} knee station support exceeds its axial radius.`);
    }
    // Every triangle intersecting the station plane receives full radial scale at all vertices.
    // The remaining axial span fades with smoothstep, so the measured station loop realizes the
    // requested radial scale without a mesh-resolution-dependent half-strength endpoint.
    result.set(station.side, maximumCrossingVertexDistanceM);
  });
  return result;
}

function applyRadialScale(options: {
  readonly sourcePositionsM: Float32Array;
  readonly stations: readonly MeasurementOpenReferenceKneeProxyStationV1[];
  readonly centroids: ReadonlyMap<'negative' | 'positive', MeshPlaneSectionVec3V1>;
  readonly flatRadiiM: ReadonlyMap<'negative' | 'positive', number>;
  readonly radialScale: number;
}): Float32Array {
  const result = options.sourcePositionsM.slice();
  for (let vertex = 0; vertex < result.length / 3; vertex += 1) {
    const offset = vertex * 3;
    const x = options.sourcePositionsM[offset];
    const side = x < 0 ? ('negative' as const) : x > 0 ? ('positive' as const) : null;
    if (side == null) continue;
    const station = options.stations.find((candidate) => candidate.side === side);
    const center = options.centroids.get(side);
    const flatRadiusM = options.flatRadiiM.get(side);
    if (!station || !center || flatRadiusM == null) {
      throw new Error('Bilateral radial field is incomplete.');
    }
    const relative = [
      options.sourcePositionsM[offset] - center[0],
      options.sourcePositionsM[offset + 1] - center[1],
      options.sourcePositionsM[offset + 2] - center[2],
    ] as const;
    const axial = dot(relative, station.normal);
    const absoluteAxial = Math.abs(axial);
    if (absoluteAxial >= station.axialRadiusM) continue;
    const weight =
      absoluteAxial <= flatRadiusM
        ? 1
        : 1 - smoothstep((absoluteAxial - flatRadiusM) / (station.axialRadiusM - flatRadiusM));
    const scaleDelta = (options.radialScale - 1) * weight;
    const radial = [
      relative[0] - axial * station.normal[0],
      relative[1] - axial * station.normal[1],
      relative[2] - axial * station.normal[2],
    ];
    result[offset] += radial[0] * scaleDelta;
    result[offset + 1] += radial[1] * scaleDelta;
    result[offset + 2] += radial[2] * scaleDelta;
  }
  return result;
}

function drift(
  baseline: ProtectedMeasurements,
  achieved: ProtectedMeasurements,
): MeasurementOpenReferenceKneeProxyProtectedDriftMmV1 {
  const value = {
    thighNegative: Math.abs(achieved.thighNegative - baseline.thighNegative),
    thighPositive: Math.abs(achieved.thighPositive - baseline.thighPositive),
    calfNegative: Math.abs(achieved.calfNegative - baseline.calfNegative),
    calfPositive: Math.abs(achieved.calfPositive - baseline.calfPositive),
  };
  return Object.freeze({ ...value, maximum: Math.max(...Object.values(value)) });
}

function notApplied(options: {
  readonly sourcePositionsM: Float32Array;
  readonly requestedTargetMm: number;
  readonly diagnostics: readonly MeasurementOpenReferenceKneeProxyDiagnosticV1[];
  readonly baselineMm?: MeasurementOpenReferenceKneeProxyBilateralMmV1 | null;
}): MeasurementOpenReferenceKneeProxyResultV1 {
  return Object.freeze({
    version: MEASUREMENT_OPEN_REFERENCE_KNEE_PROXY_V1,
    role: 'CC0_OPEN_REFERENCE_A_POSE_KNEE_GEOMETRIC_PROXY' as const,
    status: 'notApplied' as const,
    positionsM: options.sourcePositionsM.slice(),
    requestedTargetMm: options.requestedTargetMm,
    appliedTargetMm: null,
    radialScale: 1 as const,
    baselineMm: options.baselineMm ?? null,
    achievedMm: null,
    absoluteResidualMm: null,
    protectedDriftMm: null,
    diagnostics: Object.freeze([...options.diagnostics]),
    claims: CLAIMS,
  });
}

/**
 * Pure A-pose knee proxy. Both rig-knee loops use one bounded radial scale and are solved against
 * their averaged circumference. A failed residual, bilateral response, or protected-station
 * closure returns an owned copy of the undeformed input.
 */
export function solveMeasurementOpenReferenceKneeProxyV1(options: {
  readonly positionsM: Float32Array;
  readonly triangleIndices: Uint16Array | Uint32Array;
  readonly pose: BodyPoseKind;
  readonly targetMm: number;
  readonly stations: readonly [
    MeasurementOpenReferenceKneeProxyStationV1,
    MeasurementOpenReferenceKneeProxyStationV1,
  ];
  readonly policy?: Partial<MeasurementOpenReferenceKneeProxyPolicyV1>;
}): MeasurementOpenReferenceKneeProxyResultV1 {
  validateMesh(options.positionsM, options.triangleIndices);
  if (!Number.isFinite(options.targetMm) || options.targetMm <= 0) {
    throw new RangeError('targetMm must be finite and positive.');
  }
  const policy = snapshotPolicy(options.policy);
  if (options.pose !== 'A') {
    return notApplied({
      sourcePositionsM: options.positionsM,
      requestedTargetMm: options.targetMm,
      diagnostics: [diagnostic('pose-not-admitted', 'Knee proxy is disabled outside the A pose.')],
    });
  }
  if (
    options.stations.length !== 2 ||
    new Set(options.stations.map(({ side }) => side)).size !== 2
  ) {
    return notApplied({
      sourcePositionsM: options.positionsM,
      requestedTargetMm: options.targetMm,
      diagnostics: [diagnostic('station-invalid', 'Exactly two bilateral stations are required.')],
    });
  }
  if (
    options.stations.some(
      ({ axialRadiusM }) =>
        !Number.isFinite(axialRadiusM) || axialRadiusM < policy.minimumAxialRadiusM,
    )
  ) {
    return notApplied({
      sourcePositionsM: options.positionsM,
      requestedTargetMm: options.targetMm,
      diagnostics: [
        diagnostic('station-too-close', 'Knee and protected limb stations are too close.'),
      ],
    });
  }

  let baseline: ReturnType<typeof measureKnees>;
  let protectedBaseline: ProtectedMeasurements;
  let flatRadiiM: ReadonlyMap<'negative' | 'positive', number>;
  try {
    baseline = measureKnees({
      positionsM: options.positionsM,
      triangleIndices: options.triangleIndices,
      stations: options.stations,
    });
    protectedBaseline = measureProtected({
      positionsM: options.positionsM,
      triangleIndices: options.triangleIndices,
      stations: options.stations,
    });
    flatRadiiM = sectionFlatRadii({
      positionsM: options.positionsM,
      triangleIndices: options.triangleIndices,
      stations: options.stations,
    });
  } catch (reason: unknown) {
    return notApplied({
      sourcePositionsM: options.positionsM,
      requestedTargetMm: options.targetMm,
      diagnostics: [
        diagnostic(
          'section-invalid',
          reason instanceof Error ? reason.message : 'Knee section measurement failed.',
        ),
      ],
    });
  }

  const evaluate = (radialScale: number) => {
    const positionsM = applyRadialScale({
      sourcePositionsM: options.positionsM,
      stations: options.stations,
      centroids: baseline.centroids,
      flatRadiiM,
      radialScale,
    });
    return Object.freeze({
      radialScale,
      positionsM,
      measured: measureKnees({
        positionsM,
        triangleIndices: options.triangleIndices,
        stations: options.stations,
        seeds: baseline.centroids,
      }).value,
    });
  };

  let decrease: ReturnType<typeof evaluate>;
  let increase: ReturnType<typeof evaluate>;
  try {
    decrease = evaluate(policy.minimumRadialScale);
    increase = evaluate(policy.maximumRadialScale);
  } catch (reason: unknown) {
    return notApplied({
      sourcePositionsM: options.positionsM,
      requestedTargetMm: options.targetMm,
      baselineMm: baseline.value,
      diagnostics: [
        diagnostic(
          'section-invalid',
          reason instanceof Error ? reason.message : 'Knee endpoint measurement failed.',
        ),
      ],
    });
  }
  const monotonic =
    decrease.measured.negative < baseline.value.negative &&
    decrease.measured.positive < baseline.value.positive &&
    baseline.value.negative < increase.measured.negative &&
    baseline.value.positive < increase.measured.positive;
  if (!monotonic) {
    return notApplied({
      sourcePositionsM: options.positionsM,
      requestedTargetMm: options.targetMm,
      baselineMm: baseline.value,
      diagnostics: [
        diagnostic('direction-response-invalid', 'Knee radial endpoints are not monotonic.'),
      ],
    });
  }

  const lowerTargetMm = decrease.measured.average;
  const upperTargetMm = increase.measured.average;
  const appliedTargetMm = Math.min(upperTargetMm, Math.max(lowerTargetMm, options.targetMm));
  const limited = appliedTargetMm !== options.targetMm;
  let solved =
    appliedTargetMm === lowerTargetMm
      ? decrease
      : appliedTargetMm === upperTargetMm
        ? increase
        : null;
  if (solved == null && Math.abs(appliedTargetMm - baseline.value.average) <= 1e-9) {
    solved = Object.freeze({
      radialScale: 1,
      positionsM: options.positionsM.slice(),
      measured: baseline.value,
    });
  }
  if (solved == null) {
    let lowScale = appliedTargetMm < baseline.value.average ? policy.minimumRadialScale : 1;
    let highScale = appliedTargetMm < baseline.value.average ? 1 : policy.maximumRadialScale;
    let best = evaluate((lowScale + highScale) / 2);
    for (let iteration = 0; iteration < policy.binarySearchIterations; iteration += 1) {
      const candidate = evaluate((lowScale + highScale) / 2);
      if (
        Math.abs(candidate.measured.average - appliedTargetMm) <
        Math.abs(best.measured.average - appliedTargetMm)
      ) {
        best = candidate;
      }
      if (candidate.measured.average < appliedTargetMm) lowScale = candidate.radialScale;
      else highScale = candidate.radialScale;
    }
    solved = best;
  }

  const absoluteResidualMm = Math.abs(solved.measured.average - appliedTargetMm);
  if (absoluteResidualMm > policy.maximumResidualMm) {
    return notApplied({
      sourcePositionsM: options.positionsM,
      requestedTargetMm: options.targetMm,
      baselineMm: baseline.value,
      diagnostics: [
        diagnostic(
          'residual-exceeded',
          `Knee proxy residual ${absoluteResidualMm.toFixed(3)} mm exceeds the closure tolerance.`,
        ),
      ],
    });
  }
  const sideResponses = [
    Math.abs(solved.measured.negative - baseline.value.negative),
    Math.abs(solved.measured.positive - baseline.value.positive),
  ];
  if (
    Math.max(...sideResponses) > policy.maximumResidualMm &&
    (Math.min(...sideResponses) <= Number.EPSILON ||
      Math.max(...sideResponses) / Math.min(...sideResponses) > policy.bilateralResponseRatioLimit)
  ) {
    return notApplied({
      sourcePositionsM: options.positionsM,
      requestedTargetMm: options.targetMm,
      baselineMm: baseline.value,
      diagnostics: [
        diagnostic('bilateral-response-unsafe', 'Knee side responses exceed the bilateral ratio.'),
      ],
    });
  }

  let protectedDriftMm: MeasurementOpenReferenceKneeProxyProtectedDriftMmV1;
  try {
    protectedDriftMm = drift(
      protectedBaseline,
      measureProtected({
        positionsM: solved.positionsM,
        triangleIndices: options.triangleIndices,
        stations: options.stations,
      }),
    );
  } catch (reason: unknown) {
    return notApplied({
      sourcePositionsM: options.positionsM,
      requestedTargetMm: options.targetMm,
      baselineMm: baseline.value,
      diagnostics: [
        diagnostic(
          'section-invalid',
          reason instanceof Error ? reason.message : 'Protected section closure failed.',
        ),
      ],
    });
  }
  if (protectedDriftMm.maximum > policy.maximumProtectedDriftMm) {
    return notApplied({
      sourcePositionsM: options.positionsM,
      requestedTargetMm: options.targetMm,
      baselineMm: baseline.value,
      diagnostics: [
        diagnostic(
          'protected-drift-exceeded',
          `Protected limb drift ${protectedDriftMm.maximum.toFixed(3)} mm exceeds tolerance.`,
        ),
      ],
    });
  }

  const diagnostics = limited
    ? [diagnostic('target-limited', 'Knee target is outside the visual safety bound.')]
    : [];
  return Object.freeze({
    version: MEASUREMENT_OPEN_REFERENCE_KNEE_PROXY_V1,
    role: 'CC0_OPEN_REFERENCE_A_POSE_KNEE_GEOMETRIC_PROXY' as const,
    status: limited ? ('limited' as const) : ('represented' as const),
    positionsM: solved.positionsM,
    requestedTargetMm: options.targetMm,
    appliedTargetMm,
    radialScale: solved.radialScale,
    baselineMm: baseline.value,
    achievedMm: solved.measured,
    absoluteResidualMm,
    protectedDriftMm,
    diagnostics: Object.freeze(diagnostics),
    claims: CLAIMS,
  });
}
