import type { BodyPoseKind } from './contracts';
import { createMakeHumanAnteriorChestShoulderModesResearchV1 } from './makehuman-anterior-chest-shoulder-modes-research-v1';
import {
  loadMakeHumanTorsoShapeDeltaBundleV1,
  type MakeHumanTorsoShapeDeltaBundleV1,
} from './makehuman-torso-shape-delta-bundle-v1';
import { createMakeHumanUniformWaistHipModesV1 } from './makehuman-uniform-waist-hip-modes-v1';
import type {
  MeasurementOpenReferenceBetaTorsoWorkerOptionsV1,
  MeasurementOpenReferenceBetaTorsoWorkerRequestV1,
  MeasurementOpenReferenceBetaTorsoWorkerResponseV1,
  MeasurementOpenReferenceBetaTorsoWorkerResultV1,
} from './measurement-open-reference-beta-torso-worker-protocol-v1';
import { solveOpenReferenceChestShoulderResearchV1 } from './measurement-open-reference-chest-shoulder-research-v1';
import { type MakeHumanOpenReferenceBasisV1 } from './measurement-open-reference-display-v1';
import { applyOpenReferenceUnderBustRibcageResearchV1 } from './measurement-open-reference-underbust-ribcage-research-v1';
import { solveMeasurementOpenReferenceHighHipProxyV1 } from './measurement-open-reference-high-hip-proxy-v1';
import {
  solveMeasurementOpenReferenceNeckProxyV1,
  type MeasurementOpenReferenceNeckRigHeadsV1,
} from './measurement-open-reference-neck-proxy-v1';
import { solveMeasurementOpenReferenceTorsoDepthProxyV1 } from './measurement-open-reference-torso-depth-proxy-v1';
import {
  loadMakeHumanFemaleBustDeltaBundleV1,
  type MakeHumanFemaleBustDeltaBundleV1,
} from './makehuman-female-bust-delta-bundle-v1';
import {
  measureFemaleTorsoSectionGirthMmV1,
  solveMeasurementOpenReferenceFemaleTorsoStageV1,
  type MeasurementOpenReferenceFemaleTorsoStageResultV1,
} from './measurement-open-reference-female-torso-stage-v1';
import { measureMeshHorizontalSectionTapeGirthMmV1 } from './mesh-plane-section-tape-girth-v1';

export const MEASUREMENT_OPEN_REFERENCE_BETA_TORSO_WORKER_MEASURE_V1 =
  'measurement-open-reference-beta-torso-worker/v1' as const;

type WorkerFactoryV1 = () => Worker;

export interface MeasurementOpenReferenceBetaTorsoInWorkerOptionsV1
  extends Omit<MeasurementOpenReferenceBetaTorsoWorkerOptionsV1, 'basisKind'> {
  readonly basis: MakeHumanOpenReferenceBasisV1;
  readonly signal?: AbortSignal;
  readonly loadTorsoBundle?: () => Promise<MakeHumanTorsoShapeDeltaBundleV1>;
  /** Synchronous path only; the module worker loads the female bust bundle itself. */
  readonly loadFemaleBustBundle?: () => Promise<MakeHumanFemaleBustDeltaBundleV1>;
}

function abortError(): Error {
  if (typeof DOMException !== 'undefined') return new DOMException('Aborted', 'AbortError');
  const error = new Error('Aborted');
  error.name = 'AbortError';
  return error;
}

type HighHipWorkerFieldsV1 = Pick<
  MeasurementOpenReferenceBetaTorsoWorkerResultV1,
  | 'highHipStatus'
  | 'highHipRepresented'
  | 'highHipLimited'
  | 'highHipStationOriginM'
  | 'highHipModeResult'
  | 'highHipDiagnostics'
>;

const UNREQUESTED_HIGH_HIP_V1: HighHipWorkerFieldsV1 = Object.freeze({
  highHipStatus: 'unrequested' as const,
  highHipRepresented: false,
  highHipLimited: false,
  highHipDiagnostics: Object.freeze([]),
});

function highHipNotApplied(message: string): HighHipWorkerFieldsV1 {
  return Object.freeze({
    highHipStatus: 'notApplied' as const,
    highHipRepresented: false,
    highHipLimited: false,
    highHipDiagnostics: Object.freeze([
      Object.freeze({ code: 'section-invalid' as const, message }),
    ]),
  });
}

type NeckWorkerFieldsV1 = Pick<
  MeasurementOpenReferenceBetaTorsoWorkerResultV1,
  | 'neckStatus'
  | 'neckRepresented'
  | 'neckLimited'
  | 'neckBaselineCircumferenceMm'
  | 'neckAchievedCircumferenceMm'
  | 'neckDiagnostics'
>;

type TorsoBeforeNeckResultV1 = Omit<
  MeasurementOpenReferenceBetaTorsoWorkerResultV1,
  keyof NeckWorkerFieldsV1 | 'positionsBeforeNeckM'
>;

const UNREQUESTED_NECK_V1: NeckWorkerFieldsV1 = Object.freeze({
  neckStatus: 'unrequested' as const,
  neckRepresented: false,
  neckLimited: false,
  neckDiagnostics: Object.freeze([]),
});

function neckNotApplied(message: string): NeckWorkerFieldsV1 {
  return Object.freeze({
    neckStatus: 'notApplied' as const,
    neckRepresented: false,
    neckLimited: false,
    neckDiagnostics: Object.freeze([Object.freeze({ code: 'station-invalid' as const, message })]),
  });
}

type TorsoModesV1 = ReturnType<typeof createMakeHumanAnteriorChestShoulderModesResearchV1>;

/** Under-bust drift above this after the depth proxy is reported; numerical, not a claim. */
const FEMALE_DEPTH_UNDERBUST_DRIFT_MM = 0.5;
/** Apex-plane drift above this after the depth proxy is reported; numerical, not a claim. */
const FEMALE_DEPTH_CHEST_DRIFT_MM = 1;
/**
 * Clipped depth support on female: it may reach this share of the apex-to-under-bust gap. The
 * protected-drift check of the depth proxy still holds the under-bust plane within 0.5 mm.
 */
const FEMALE_DEPTH_UNDERBUST_SUPPORT_FRACTION = 1;

type FemaleCommonFieldsV1 = Pick<
  MeasurementOpenReferenceBetaTorsoWorkerResultV1,
  | 'ribcageRepresentedMeasurements'
  | 'ribcageLimitedMeasurements'
  | 'ribcageDiagnostics'
  | 'chestShoulderRepresentedMeasurements'
  | 'chestShoulderLimitedMeasurements'
  | 'chestShoulderDiagnostics'
>;

function femaleSectionDriftMm(options: {
  readonly beforeM: Float32Array;
  readonly afterM: Float32Array;
  readonly triangleIndices: Uint16Array | Uint32Array;
  readonly originM: readonly [number, number, number];
  /** The bust is typed and solved as a tape (hull) girth, so its drift is measured as one. */
  readonly tape?: boolean;
}): number {
  if (options.tape) {
    const tape = (positionsM: Float32Array) =>
      measureMeshHorizontalSectionTapeGirthMmV1({
        positionsM,
        triangleIndices: options.triangleIndices,
        originM: options.originM,
      });
    const before = tape(options.beforeM);
    const after = tape(options.afterM);
    return before == null || after == null ? Number.POSITIVE_INFINITY : Math.abs(after - before);
  }
  try {
    return Math.abs(
      measureFemaleTorsoSectionGirthMmV1({
        positionsM: options.afterM,
        triangleIndices: options.triangleIndices,
        originM: options.originM,
      }) -
        measureFemaleTorsoSectionGirthMmV1({
          positionsM: options.beforeM,
          triangleIndices: options.triangleIndices,
          originM: options.originM,
        }),
    );
  } catch {
    return Number.POSITIVE_INFINITY;
  }
}

function withFemaleDepthRecheck<T extends FemaleCommonFieldsV1>(options: {
  readonly common: T;
  readonly beforeM: Float32Array;
  readonly afterM: Float32Array;
  readonly triangleIndices: Uint16Array | Uint32Array;
  readonly underBustStationOriginM: readonly [number, number, number];
  readonly apexStationOriginM: readonly [number, number, number];
}): T {
  const drift = (originM: readonly [number, number, number], tape = false) =>
    femaleSectionDriftMm({
      beforeM: options.beforeM,
      afterM: options.afterM,
      triangleIndices: options.triangleIndices,
      originM,
      tape,
    });
  const ribcageRepresented = [...options.common.ribcageRepresentedMeasurements];
  const ribcageLimited = [...(options.common.ribcageLimitedMeasurements ?? [])];
  const ribcageDiagnostics = [...options.common.ribcageDiagnostics];
  const chestRepresented = [...options.common.chestShoulderRepresentedMeasurements];
  const chestLimited = [...options.common.chestShoulderLimitedMeasurements];
  const chestDiagnostics = [...options.common.chestShoulderDiagnostics];
  if (
    ribcageRepresented.includes('underBustCircumferenceMm') &&
    drift(options.underBustStationOriginM) > FEMALE_DEPTH_UNDERBUST_DRIFT_MM
  ) {
    ribcageRepresented.splice(ribcageRepresented.indexOf('underBustCircumferenceMm'), 1);
    ribcageLimited.push('underBustCircumferenceMm');
    ribcageDiagnostics.push('underBustCircumferenceMm:female-bust-depth-crosstalk-limited');
  }
  if (
    chestRepresented.includes('chestCircumferenceMm') &&
    drift(options.apexStationOriginM, true) > FEMALE_DEPTH_CHEST_DRIFT_MM
  ) {
    chestRepresented.splice(chestRepresented.indexOf('chestCircumferenceMm'), 1);
    chestLimited.push('chestCircumferenceMm');
    chestDiagnostics.push('chestCircumferenceMm:female-bust-depth-crosstalk-limited');
  }
  return {
    ...options.common,
    ribcageRepresentedMeasurements: Object.freeze(ribcageRepresented),
    ribcageLimitedMeasurements: Object.freeze(ribcageLimited),
    ribcageDiagnostics: Object.freeze(ribcageDiagnostics),
    chestShoulderRepresentedMeasurements: Object.freeze(chestRepresented),
    chestShoulderLimitedMeasurements: Object.freeze(chestLimited),
    chestShoulderDiagnostics: Object.freeze(chestDiagnostics),
  };
}

/** Shared pure torso pipeline used by both the module worker and the synchronous fallback. */
export function solveMeasurementOpenReferenceBetaTorsoV1(options: {
  readonly basis: MakeHumanOpenReferenceBasisV1;
  readonly sourcePositionsM: Float32Array;
  readonly triangleIndices: Uint16Array | Uint32Array;
  readonly measurements: MeasurementOpenReferenceBetaTorsoWorkerOptionsV1['measurements'];
  readonly highHipCircumferenceMm?: number;
  readonly neckCircumferenceMm?: number;
  readonly neckRigHeads?: MeasurementOpenReferenceNeckRigHeadsV1;
  readonly neckPose?: BodyPoseKind;
  readonly torsoBundle: MakeHumanTorsoShapeDeltaBundleV1;
  /** Female basis: the bust proxy replaces the under-bust band and the anterior chest field. */
  readonly femaleBustBundle?: MakeHumanFemaleBustDeltaBundleV1;
  /** Female basis whose bust bundle failed to load: the legacy chest path runs and says why. */
  readonly femaleBustUnavailableReason?: string;
  readonly solveDepthProxy?: typeof solveMeasurementOpenReferenceTorsoDepthProxyV1;
  readonly solveHighHipProxy?: typeof solveMeasurementOpenReferenceHighHipProxyV1;
  readonly solveNeckProxy?: typeof solveMeasurementOpenReferenceNeckProxyV1;
}): MeasurementOpenReferenceBetaTorsoWorkerResultV1 {
  const modes = createMakeHumanAnteriorChestShoulderModesResearchV1({
    basis: options.basis,
    measurements: options.measurements,
    bundle: options.torsoBundle,
  });
  const beforeNeck = solveTorsoBeforeNeckV1(options, modes);
  // Fast path: no neck request performs no neck mesh work and keeps array identity.
  if (options.neckCircumferenceMm == null) {
    return Object.freeze({ ...beforeNeck, ...UNREQUESTED_NECK_V1 });
  }

  // Order: ... -> depth -> high hip -> neck. Neck is the last torso stage and touches only the
  // mid-neck band; chest station and shoulder chord are its protected neighbours.
  let neckFields: NeckWorkerFieldsV1;
  let positionsM = beforeNeck.positionsM;
  let positionsBeforeNeckM: Float32Array | undefined;
  try {
    if (!options.neckRigHeads) throw new Error('Core-rig neck heads are unavailable.');
    const shoulderMode = modes.modes.find(
      ({ measurementKey }) => measurementKey === 'shoulderBreadthMm',
    );
    const neck = (options.solveNeckProxy ?? solveMeasurementOpenReferenceNeckProxyV1)({
      sourcePositionsM: beforeNeck.positionsM,
      triangleIndices: options.triangleIndices,
      pose: options.neckPose ?? 'A',
      targetCircumferenceMm: options.neckCircumferenceMm,
      rigHeads: options.neckRigHeads,
      ...(beforeNeck.chestStationOriginM
        ? {
            chestStation: Object.freeze({
              originM: beforeNeck.chestStationOriginM,
              normal: Object.freeze([0, 1, 0] as const),
            }),
          }
        : {}),
      ...(shoulderMode?.shoulderVertices
        ? { shoulderVertices: shoulderMode.shoulderVertices }
        : {}),
    });
    const applied = neck.status === 'represented' || neck.status === 'limited';
    if (applied && neck.positionsM !== beforeNeck.positionsM) {
      positionsBeforeNeckM = beforeNeck.positionsM;
      positionsM = neck.positionsM;
    }
    neckFields = Object.freeze({
      neckStatus: neck.status,
      neckRepresented: neck.status === 'represented',
      neckLimited: neck.status === 'limited',
      ...(neck.baselineCircumferenceMm == null
        ? {}
        : { neckBaselineCircumferenceMm: neck.baselineCircumferenceMm }),
      ...(neck.achievedCircumferenceMm == null
        ? {}
        : { neckAchievedCircumferenceMm: neck.achievedCircumferenceMm }),
      neckDiagnostics: neck.diagnostics,
    });
  } catch (reason: unknown) {
    // A failing neck never blanks the preview or rolls back the earlier torso stages.
    neckFields = neckNotApplied(reason instanceof Error ? reason.message : String(reason));
  }
  return Object.freeze({
    ...beforeNeck,
    positionsM,
    ...(positionsBeforeNeckM ? { positionsBeforeNeckM } : {}),
    ...neckFields,
  });
}

function solveTorsoBeforeNeckV1(
  options: Parameters<typeof solveMeasurementOpenReferenceBetaTorsoV1>[0],
  modes: TorsoModesV1,
): TorsoBeforeNeckResultV1 {
  const { torsoBundle } = options;
  let female: MeasurementOpenReferenceFemaleTorsoStageResultV1 | undefined;
  let torsoPositionsM: Float32Array;
  let chestStationOriginM: readonly [number, number, number];
  let common: Omit<
    MeasurementOpenReferenceBetaTorsoWorkerResultV1,
    | 'positionsM'
    | 'positionsBeforeHighHipM'
    | 'depthRepresentedMeasurements'
    | 'depthLimitedMeasurements'
    | 'depthModeResults'
    | 'depthDiagnostics'
    | keyof HighHipWorkerFieldsV1
    | keyof NeckWorkerFieldsV1
    | 'positionsBeforeNeckM'
  >;
  const shoulderVertices = modes.modes.find(
    ({ measurementKey }) => measurementKey === 'shoulderBreadthMm',
  )?.shoulderVertices;
  const shoulderChordFields = shoulderVertices
    ? {
        shoulderChordVertices: Object.freeze({
          negative: shoulderVertices.negative,
          positive: shoulderVertices.positive,
        }),
      }
    : {};
  if (options.basis.kind === 'female' && options.femaleBustBundle) {
    const chestMode = modes.modes.find(
      ({ measurementKey }) => measurementKey === 'chestCircumferenceMm',
    );
    if (!chestMode?.chestStationOriginM) {
      throw new Error('Chest section station is missing.');
    }
    // The legacy chest station is the last torso-only plane below the arm merge: the armpit line.
    female = solveMeasurementOpenReferenceFemaleTorsoStageV1({
      basis: options.basis,
      sourcePositionsM: options.sourcePositionsM,
      triangleIndices: options.triangleIndices,
      measurements: options.measurements,
      modes: modes.modes,
      underBustStationOriginM: modes.underBustStationOriginM,
      armpitLineOriginM: chestMode.chestStationOriginM,
      bustBundle: options.femaleBustBundle,
    });
    torsoPositionsM = female.positionsM;
    chestStationOriginM = female.chestStationOriginM;
    common = {
      chestStationOriginM,
      underBustStationOriginM: modes.underBustStationOriginM,
      ...shoulderChordFields,
      ribcageRepresentedMeasurements: female.ribcageRepresentedMeasurements,
      ribcageLimitedMeasurements: female.ribcageLimitedMeasurements,
      ribcageDiagnostics: Object.freeze([...modes.diagnostics, ...female.ribcageDiagnostics]),
      chestShoulderRepresentedMeasurements: female.chestShoulderRepresentedMeasurements,
      chestShoulderLimitedMeasurements: female.chestShoulderLimitedMeasurements,
      chestShoulderDiagnostics: female.chestShoulderDiagnostics,
      femaleBust: female.femaleBust,
    };
  } else {
    const ribcage = applyOpenReferenceUnderBustRibcageResearchV1({
      sourcePositionsM: options.sourcePositionsM,
      triangleIndices: options.triangleIndices,
      measurements: options.measurements,
      stationOriginM: modes.underBustStationOriginM,
    });
    const chestShoulder = solveOpenReferenceChestShoulderResearchV1({
      sourcePositionsM: ribcage.positionsM,
      triangleIndices: options.triangleIndices,
      measurements: options.measurements,
      modes: modes.modes,
    });
    const chestMode = modes.modes.find(
      ({ measurementKey }) => measurementKey === 'chestCircumferenceMm',
    );
    if (!chestMode?.chestStationOriginM) {
      throw new Error('Chest section station is missing.');
    }
    torsoPositionsM = chestShoulder.positionsM;
    chestStationOriginM = chestMode.chestStationOriginM;
    common = {
      chestStationOriginM: chestMode.chestStationOriginM,
      underBustStationOriginM: modes.underBustStationOriginM,
      ...shoulderChordFields,
      ribcageRepresentedMeasurements: ribcage.representedMeasurements,
      ribcageDiagnostics: Object.freeze([
        ...modes.diagnostics,
        ...ribcage.diagnostics,
        ...(options.basis.kind === 'female' && options.femaleBustUnavailableReason != null
          ? [`female-bust-unavailable:${options.femaleBustUnavailableReason}`]
          : []),
      ]),
      chestShoulderRepresentedMeasurements: chestShoulder.representedMeasurements,
      chestShoulderLimitedMeasurements: chestShoulder.limitedMeasurements,
      chestShoulderDiagnostics: chestShoulder.diagnostics,
    };
  }
  const depthRequested = [
    options.measurements.chestDepthMm,
    options.measurements.waistDepthMm,
    options.measurements.hipDepthMm,
  ].some((value) => value != null);
  const highHipRequested = options.highHipCircumferenceMm != null;
  if (!depthRequested && !highHipRequested) {
    return Object.freeze({
      positionsM: torsoPositionsM,
      ...common,
      depthRepresentedMeasurements: Object.freeze([]),
      depthLimitedMeasurements: Object.freeze([]),
      depthModeResults: Object.freeze([]),
      depthDiagnostics: Object.freeze([]),
      ...UNREQUESTED_HIGH_HIP_V1,
    });
  }

  let stations:
    | Readonly<{
        shoulderVertices: Readonly<{ negative: number; positive: number }>;
        waistStationOriginM: readonly [number, number, number];
        hipStationOriginM: readonly [number, number, number];
      }>
    | undefined;
  let stationError = 'Torso depth proxy stations are incomplete.';
  try {
    const waistHipModes = createMakeHumanUniformWaistHipModesV1({
      basis: options.basis,
      heightMm: options.measurements.heightMm,
      bundle: torsoBundle,
    });
    const shoulderMode = modes.modes.find(
      ({ measurementKey }) => measurementKey === 'shoulderBreadthMm',
    );
    const waistMode = waistHipModes.modes.find(
      ({ measurementKey }) => measurementKey === 'waistCircumferenceMm',
    );
    const hipMode = waistHipModes.modes.find(
      ({ measurementKey }) => measurementKey === 'hipCircumferenceMm',
    );
    if (shoulderMode?.shoulderVertices && waistMode && hipMode) {
      stations = Object.freeze({
        shoulderVertices: shoulderMode.shoulderVertices,
        waistStationOriginM: waistMode.stationOriginM,
        hipStationOriginM: hipMode.stationOriginM,
      });
    }
  } catch (reason: unknown) {
    // The depth path keeps its pre-high-hip contract (throw); high hip alone degrades to notApplied.
    if (depthRequested) throw reason;
    stationError = reason instanceof Error ? reason.message : String(reason);
  }
  if (!stations) {
    if (depthRequested) throw new Error(stationError);
    return Object.freeze({
      positionsM: torsoPositionsM,
      ...common,
      depthRepresentedMeasurements: Object.freeze([]),
      depthLimitedMeasurements: Object.freeze([]),
      depthModeResults: Object.freeze([]),
      depthDiagnostics: Object.freeze([]),
      ...highHipNotApplied(stationError),
    });
  }

  // Order: waist/hip (input) -> ribcage/chest/shoulder -> depth -> high hip.
  const solveDepth = options.solveDepthProxy ?? solveMeasurementOpenReferenceTorsoDepthProxyV1;
  const depthInput: Parameters<typeof solveMeasurementOpenReferenceTorsoDepthProxyV1>[0] = {
    sourcePositionsM: torsoPositionsM,
    triangleIndices: options.triangleIndices,
    measurements: options.measurements,
    stations: [
      { measurementKey: 'chestDepthMm', originM: chestStationOriginM },
      { measurementKey: 'waistDepthMm', originM: stations.waistStationOriginM },
      { measurementKey: 'hipDepthMm', originM: stations.hipStationOriginM },
    ],
    protectedStationOriginsM: [modes.underBustStationOriginM],
    shoulderVertices: stations.shoulderVertices,
  };
  let depth: ReturnType<typeof solveMeasurementOpenReferenceTorsoDepthProxyV1> | undefined;
  if (!depthRequested) {
    depth = undefined;
  } else if (!female || options.measurements.chestDepthMm == null) {
    depth = solveDepth(depthInput);
  } else {
    // §5 step 4 on female: the apex plane sits close above the under-bust plane, so the default
    // protected support (0.45 of that gap) leaves the depth field no visible response. Run the
    // depth field at the apex plane first, re-measure under bust, and only when it moved more
    // than 0.5 mm clip the support at the under-bust station (protected, support ends there)
    // and report it. The bust solve is never re-entered.
    const free = solveDepth({ ...depthInput, protectedStationOriginsM: [] });
    if (
      female.ribcageRepresentedMeasurements.length + female.ribcageLimitedMeasurements.length ===
        0 ||
      femaleSectionDriftMm({
        beforeM: torsoPositionsM,
        afterM: free.positionsM,
        triangleIndices: options.triangleIndices,
        originM: modes.underBustStationOriginM,
      }) <= FEMALE_DEPTH_UNDERBUST_DRIFT_MM
    ) {
      depth = free;
    } else {
      depth = solveDepth({
        ...depthInput,
        protectedSupportFraction: FEMALE_DEPTH_UNDERBUST_SUPPORT_FRACTION,
      });
      common = {
        ...common,
        ribcageDiagnostics: Object.freeze([
          ...common.ribcageDiagnostics,
          'chestDepthMm:female-bust-depth-support-clipped-at-underbust',
        ]),
      };
    }
  }
  const depthFields = {
    depthRepresentedMeasurements: depth?.representedMeasurements ?? Object.freeze([]),
    depthLimitedMeasurements: depth?.limitedMeasurements ?? Object.freeze([]),
    depthModeResults: depth?.modeResults ?? Object.freeze([]),
    depthDiagnostics: depth?.diagnostics ?? Object.freeze([]),
  };
  const afterDepthPositionsM = depth?.positionsM ?? torsoPositionsM;
  if (female && depth && afterDepthPositionsM !== torsoPositionsM) {
    // §5 step 4: the depth proxy is perimeter-preserving and its vertical support already stops
    // short of the protected under-bust station. Re-measure both bust planes once and report any
    // drift honestly; never loop back into the bust solve.
    common = withFemaleDepthRecheck({
      common,
      beforeM: torsoPositionsM,
      afterM: afterDepthPositionsM,
      triangleIndices: options.triangleIndices,
      underBustStationOriginM: modes.underBustStationOriginM,
      apexStationOriginM: chestStationOriginM,
    });
  }
  if (!highHipRequested) {
    return Object.freeze({
      positionsM: afterDepthPositionsM,
      ...common,
      ...depthFields,
      ...UNREQUESTED_HIGH_HIP_V1,
    });
  }

  let positionsM = afterDepthPositionsM;
  let positionsBeforeHighHipM: Float32Array | undefined;
  let highHipFields: HighHipWorkerFieldsV1;
  try {
    const highHip = (options.solveHighHipProxy ?? solveMeasurementOpenReferenceHighHipProxyV1)({
      sourcePositionsM: afterDepthPositionsM,
      triangleIndices: options.triangleIndices,
      targetCircumferenceMm: options.highHipCircumferenceMm,
      waistToHighHipMm: options.measurements.waistToHighHipMm,
      waistStationOriginM: stations.waistStationOriginM,
      hipStationOriginM: stations.hipStationOriginM,
      protectedStationOriginsM: [
        modes.underBustStationOriginM,
        ...(depthRequested ? [chestStationOriginM] : []),
      ],
      shoulderVertices: stations.shoulderVertices,
    });
    const applied = highHip.status === 'represented' || highHip.status === 'limited';
    if (applied) {
      positionsM = highHip.positionsM;
      positionsBeforeHighHipM = afterDepthPositionsM;
    }
    highHipFields = Object.freeze({
      highHipStatus: highHip.status,
      highHipRepresented: highHip.status === 'represented',
      highHipLimited: highHip.status === 'limited',
      ...(highHip.station ? { highHipStationOriginM: highHip.station.originM } : {}),
      ...(highHip.modeResult ? { highHipModeResult: highHip.modeResult } : {}),
      highHipDiagnostics: highHip.diagnostics,
    });
  } catch (reason: unknown) {
    // A failing high hip never blanks the preview or rolls back waist/hip/depth.
    highHipFields = highHipNotApplied(reason instanceof Error ? reason.message : String(reason));
  }
  return Object.freeze({
    positionsM,
    ...(positionsBeforeHighHipM && positionsBeforeHighHipM !== positionsM
      ? { positionsBeforeHighHipM }
      : {}),
    ...common,
    ...depthFields,
    ...highHipFields,
  });
}

/** Female only: the bundle or the reason it is unavailable (the legacy chest path then runs). */
export async function loadFemaleBustBundleForTorsoV1(
  load: () => Promise<MakeHumanFemaleBustDeltaBundleV1> = loadMakeHumanFemaleBustDeltaBundleV1,
): Promise<
  | { readonly femaleBustBundle: MakeHumanFemaleBustDeltaBundleV1 }
  | { readonly femaleBustUnavailableReason: string }
> {
  try {
    return { femaleBustBundle: await load() };
  } catch (reason: unknown) {
    return {
      femaleBustUnavailableReason: reason instanceof Error ? reason.message : String(reason),
    };
  }
}

async function solveSynchronously(
  options: MeasurementOpenReferenceBetaTorsoInWorkerOptionsV1,
): Promise<MeasurementOpenReferenceBetaTorsoWorkerResultV1> {
  const torsoBundle = await (options.loadTorsoBundle ?? loadMakeHumanTorsoShapeDeltaBundleV1)();
  const femaleBust =
    options.basis.kind === 'female'
      ? await loadFemaleBustBundleForTorsoV1(options.loadFemaleBustBundle)
      : undefined;
  return solveMeasurementOpenReferenceBetaTorsoV1({
    ...femaleBust,
    basis: options.basis,
    sourcePositionsM: options.sourcePositionsM,
    triangleIndices: options.triangleIndices,
    measurements: options.measurements,
    ...(options.highHipCircumferenceMm == null
      ? {}
      : { highHipCircumferenceMm: options.highHipCircumferenceMm }),
    ...(options.neckCircumferenceMm == null
      ? {}
      : { neckCircumferenceMm: options.neckCircumferenceMm }),
    ...(options.neckRigHeads ? { neckRigHeads: options.neckRigHeads } : {}),
    ...(options.neckPose ? { neckPose: options.neckPose } : {}),
    torsoBundle,
  });
}

function transferableRequest(
  options: MeasurementOpenReferenceBetaTorsoInWorkerOptionsV1,
): readonly [MeasurementOpenReferenceBetaTorsoWorkerRequestV1, Transferable[]] {
  const sourcePositionsM = options.sourcePositionsM.slice();
  const triangleIndices = options.triangleIndices.slice();
  return [
    {
      id: 1,
      type: 'solve',
      options: {
        basisKind: options.basis.kind,
        sourcePositionsM,
        triangleIndices,
        measurements: options.measurements,
        ...(options.highHipCircumferenceMm == null
          ? {}
          : { highHipCircumferenceMm: options.highHipCircumferenceMm }),
        ...(options.neckCircumferenceMm == null
          ? {}
          : { neckCircumferenceMm: options.neckCircumferenceMm }),
        ...(options.neckRigHeads ? { neckRigHeads: options.neckRigHeads } : {}),
        ...(options.neckPose ? { neckPose: options.neckPose } : {}),
      },
    },
    [sourcePositionsM.buffer, triangleIndices.buffer],
  ];
}

export function createMeasurementOpenReferenceBetaTorsoInWorkerV1(
  options: MeasurementOpenReferenceBetaTorsoInWorkerOptionsV1,
  createWorker: WorkerFactoryV1 = () =>
    new Worker(new URL('./measurement-open-reference-beta-torso.worker.ts', import.meta.url), {
      type: 'module',
    }),
): Promise<MeasurementOpenReferenceBetaTorsoWorkerResultV1> {
  if (options.signal?.aborted) return Promise.reject(abortError());
  if (typeof Worker === 'undefined' || options.loadTorsoBundle || options.loadFemaleBustBundle) {
    return solveSynchronously(options);
  }

  return new Promise((resolve, reject) => {
    const worker = createWorker();
    const startedAt = performance.now();
    let settled = false;
    const cleanup = () => {
      options.signal?.removeEventListener('abort', abort);
      worker.terminate();
    };
    const finish = (operation: () => void) => {
      if (settled) return;
      settled = true;
      cleanup();
      operation();
    };
    const abort = () => finish(() => reject(abortError()));
    worker.onmessage = (event: MessageEvent<MeasurementOpenReferenceBetaTorsoWorkerResponseV1>) => {
      const response = event.data;
      try {
        performance.measure(MEASUREMENT_OPEN_REFERENCE_BETA_TORSO_WORKER_MEASURE_V1, {
          start: startedAt,
          end: performance.now(),
          detail: Object.freeze({ workerDurationMs: response.durationMs }),
        });
      } catch {
        // Timing evidence is diagnostic only.
      }
      if (response.type === 'result') finish(() => resolve(response.value));
      else finish(() => reject(new Error(response.message)));
    };
    worker.onerror = (event) =>
      finish(() => reject(new Error((event as ErrorEvent).message || 'beta torso worker error')));
    options.signal?.addEventListener('abort', abort, { once: true });
    const [request, transfer] = transferableRequest(options);
    worker.postMessage(request, transfer);
  });
}
