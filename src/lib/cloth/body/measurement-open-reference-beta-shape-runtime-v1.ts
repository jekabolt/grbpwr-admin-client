import {
  loadMakeHumanLimbCircumferenceDeltaBundleV1,
  type MakeHumanLimbCircumferenceDeltaBundleV1,
} from './makehuman-limb-circumference-delta-bundle-v1';
import { createMakeHumanLimbCircumferenceUniformModesV1 } from './makehuman-limb-circumference-uniform-modes-v1';
import { type MakeHumanTorsoShapeDeltaBundleV1 } from './makehuman-torso-shape-delta-bundle-v1';
import type { MakeHumanFemaleBustDeltaBundleV1 } from './makehuman-female-bust-delta-bundle-v1';
import {
  applyMakeHuman2ArmLengthProxyToDisplayPositionsMResearchV1,
  createMakeHuman2ArmLengthProxyRuntimeResearchV1,
  type MakeHuman2ArmLengthProxyAppliedV1,
} from './makehuman2-pose-compatible-length-runtime-v1';
import {
  loadMakeHuman2PoseCompatibleLengthPackV1,
  MAKEHUMAN2_POSE_COMPATIBLE_LENGTH_PACK_METADATA_V1,
  type MakeHuman2PoseCompatibleLengthPackV1,
} from './makehuman2-pose-compatible-length-pack-v1';
import type { CanonicalBodyMeasurementsMm } from './measurement-adapter';
import type { MeasurementOpenReferenceDisplayQualityGateResultV1 } from './measurement-open-reference-display-quality-gate-v1';
import { evaluateMeasurementOpenReferenceDisplayQualityInWorkerV1 } from './measurement-open-reference-display-quality-worker-v1';
import type { MeasurementSurfaceSelfIntersectionPolicyV1 } from './measurement-surface-self-intersection-v1';
import { createMeasurementOpenReferenceBetaTorsoInWorkerV1 } from './measurement-open-reference-beta-torso-worker-v1';
import {
  createMakeHumanDisplayPoseResourceLoaderV1,
  type MeasurementOpenReferenceDisplayPoseResourcesV1,
} from './measurement-open-reference-display-pose-runtime-v1';
import {
  deriveMeasurementOpenReferenceKneeProxyStationsV1,
  resolveMeasurementOpenReferenceKneeRigStationsV1,
  type MeasurementOpenReferenceKneeRigStationV1,
} from './measurement-open-reference-knee-proxy-v1';
import { solveMeasurementOpenReferenceKneeProxyInWorkerV1 } from './measurement-open-reference-knee-proxy-worker-v1';
import {
  resolveMeasurementOpenReferenceNeckRigHeadsV1,
  resolveMeasurementOpenReferenceNeckSectionStationV1,
  type MeasurementOpenReferenceNeckProtectedSectionV1,
  type MeasurementOpenReferenceNeckRigHeadsV1,
} from './measurement-open-reference-neck-proxy-v1';
import {
  createMeasurementOpenReferenceLimbSubsetRuntimeV1,
  type MeasurementOpenReferenceLimbSubsetRuntimeResultV1,
} from './measurement-open-reference-limb-subset-runtime-v1';
import type { OpenReferenceLimbCircumferenceModeV1 } from './measurement-open-reference-limb-circumference-solver-v1';
import {
  snapshotMeasurementSurfaceMeshV1,
  type MakeHumanOpenReferenceBasisV1,
} from './measurement-open-reference-display-v1';
import type { MeasurementOpenReferenceUniformWaistHipRuntimeResultV1 } from './measurement-open-reference-uniform-waist-hip-runtime-v1';
import { measureMeshPlaneSectionPerimetersV1 } from './mesh-plane-section-perimeter-v1';

export const MEASUREMENT_OPEN_REFERENCE_BETA_SHAPE_RUNTIME_V1 =
  'measurement-open-reference-beta-shape-runtime/v1' as const;
export const MEASUREMENT_OPEN_REFERENCE_BETA_SHAPE_STAGE_MEASURE_V1 =
  'measurement-open-reference-beta-shape-stage/v1' as const;

function measuredBetaShapeStageV1<T>(stage: string, operation: () => T): T {
  const clock = globalThis.performance;
  const startedAt = clock?.now();
  try {
    return operation();
  } finally {
    if (clock && startedAt != null && typeof clock.measure === 'function') {
      try {
        clock.measure(MEASUREMENT_OPEN_REFERENCE_BETA_SHAPE_STAGE_MEASURE_V1, {
          start: startedAt,
          end: clock.now(),
          detail: Object.freeze({ stage }),
        });
      } catch {
        // Performance diagnostics must never affect shape admission.
      }
    }
  }
}

export class MeasurementOpenReferenceBetaShapeSafetyErrorV1 extends Error {
  readonly code = 'admitted-basis-self-intersection-evaluation-failed' as const;

  constructor() {
    super('Admitted basis self-intersection evaluation did not complete safely.');
    this.name = 'MeasurementOpenReferenceBetaShapeSafetyErrorV1';
  }
}

export const MEASUREMENT_OPEN_REFERENCE_BETA_SHAPE_KEYS_V1 = Object.freeze([
  'heightMm',
  'shoulderBreadthMm',
  'chestCircumferenceMm',
  'underBustCircumferenceMm',
  'waistCircumferenceMm',
  'hipCircumferenceMm',
  'highHipCircumferenceMm',
  'chestDepthMm',
  'waistDepthMm',
  'hipDepthMm',
  'armLengthMm',
  'neckCircumferenceMm',
  'bicepCircumferenceMm',
  'wristCircumferenceMm',
  'thighCircumferenceMm',
  'kneeCircumferenceMm',
  'calfCircumferenceMm',
  'ankleCircumferenceMm',
] as const);

export type MeasurementOpenReferenceBetaShapeKeyV1 =
  (typeof MEASUREMENT_OPEN_REFERENCE_BETA_SHAPE_KEYS_V1)[number];

export interface MeasurementOpenReferenceBetaShapeRuntimeResultV1 {
  readonly version: typeof MEASUREMENT_OPEN_REFERENCE_BETA_SHAPE_RUNTIME_V1;
  readonly role: 'CC0_OPEN_REFERENCE_BETA_VISUAL_SHAPE';
  readonly status: 'error' | 'partial' | 'represented' | 'unrepresented';
  /** Proxy-compatible owner snapshot consumed by FK, live-pose and joint-overlay runtimes. */
  readonly fkProxyRuntime: MeasurementOpenReferenceUniformWaistHipRuntimeResultV1;
  readonly representedVisualControls: readonly MeasurementOpenReferenceBetaShapeKeyV1[];
  /** Bounded visible endpoints that must not be reported as the requested exact value. */
  readonly limitedVisualControls?: readonly MeasurementOpenReferenceBetaShapeKeyV1[];
  readonly unrepresentedRequiredControls: readonly 'inseamMm'[];
  readonly chestShoulderDiagnostics: readonly string[];
  readonly limbStatus: MeasurementOpenReferenceLimbSubsetRuntimeResultV1['status'];
  readonly limbSectionModes?: readonly OpenReferenceLimbCircumferenceModeV1[];
  readonly torsoSectionStations?: Readonly<{
    chest?: readonly [number, number, number];
    underBust?: readonly [number, number, number];
    waist?: readonly [number, number, number];
    /** Protocol high-hip station (waist minus waistToHighHipMm), present when high hip ran. */
    highHip?: readonly [number, number, number];
    hip?: readonly [number, number, number];
  }>;
  /** Rig-only knee planes (lowerleg01 heads); present whenever the core rig resolves. */
  readonly kneeSectionStations?: readonly MeasurementOpenReferenceKneeRigStationV1[];
  /**
   * The neck proxy's own rig mid-neck plane (origin neck02 head, normal neck01->head); present
   * whenever the core rig resolves, so the guide draws the same section the proxy solves.
   */
  readonly neckSectionStation?: MeasurementOpenReferenceNeckProtectedSectionV1;
  readonly sourceRevisionSuffix: string;
  readonly claims: {
    readonly visualReferenceOnly: true;
    readonly geometricProxyOnly: true;
    readonly exactHeightOnly: true;
    readonly chestCircumferencePosteriorHeldFixed: true;
    readonly underBustIndependentRibcageBand: true;
    readonly torsoDepthSymmetricSectionProxyOnly: true;
    readonly torsoDepthFrontBackDistributionCalibrated: false;
    readonly highHipSectionProxyOnly: true;
    readonly kneeRadialSectionProxyOnly: true;
    readonly neckRadialSectionProxyOnly: true;
    readonly circumferenceRangeCalibrated: false;
    readonly armLengthCenterlineProxyOnly: true;
    readonly sleeveLengthRepresented: false;
    readonly inseamRepresented: false;
    readonly canonicalMeasurementSemanticMatchClaimed: false;
    readonly anatomicalTapePathEquivalent: false;
    readonly measurementProtocolEquivalent: false;
    readonly populationRepresentativenessClaimed: false;
    readonly realBodyValidationClaimed: false;
    readonly garmentFitClaimed: false;
    readonly fitClaimEligible: false;
    readonly runtimeCollisionEligible: false;
    readonly collisionCandidateEligible: false;
    readonly productionAuthority: false;
  };
}

export type MeasurementOpenReferenceBetaShapeTorsoBundleLoaderV1 =
  () => Promise<MakeHumanTorsoShapeDeltaBundleV1>;
export type MeasurementOpenReferenceBetaShapeFemaleBustBundleLoaderV1 =
  () => Promise<MakeHumanFemaleBustDeltaBundleV1>;
export type MeasurementOpenReferenceBetaShapeLengthPackLoaderV1 =
  () => Promise<MakeHuman2PoseCompatibleLengthPackV1>;
export type MeasurementOpenReferenceBetaShapePoseResourcesLoaderV1 =
  () => Promise<MeasurementOpenReferenceDisplayPoseResourcesV1>;
export type MeasurementOpenReferenceBetaShapeLimbBundleLoaderV1 =
  () => Promise<MakeHumanLimbCircumferenceDeltaBundleV1>;
export type MeasurementOpenReferenceBetaShapeQualityGateEvaluatorV1 = (options: {
  readonly uniformPositionsM: Float32Array;
  readonly personalizedPositionsM: Float32Array;
  readonly triangleIndices: Uint16Array | Uint32Array;
  readonly selfIntersectionPolicy?: MeasurementSurfaceSelfIntersectionPolicyV1;
  readonly admittedBasisRevision?: string;
  readonly signal?: AbortSignal;
}) => Promise<MeasurementOpenReferenceDisplayQualityGateResultV1>;

const loadBetaShapePoseResourcesV1 = createMakeHumanDisplayPoseResourceLoaderV1();

const CLAIMS = Object.freeze({
  visualReferenceOnly: true as const,
  geometricProxyOnly: true as const,
  exactHeightOnly: true as const,
  chestCircumferencePosteriorHeldFixed: true as const,
  underBustIndependentRibcageBand: true as const,
  torsoDepthSymmetricSectionProxyOnly: true as const,
  torsoDepthFrontBackDistributionCalibrated: false as const,
  highHipSectionProxyOnly: true as const,
  kneeRadialSectionProxyOnly: true as const,
  neckRadialSectionProxyOnly: true as const,
  circumferenceRangeCalibrated: false as const,
  armLengthCenterlineProxyOnly: true as const,
  sleeveLengthRepresented: false as const,
  inseamRepresented: false as const,
  canonicalMeasurementSemanticMatchClaimed: false as const,
  anatomicalTapePathEquivalent: false as const,
  measurementProtocolEquivalent: false as const,
  populationRepresentativenessClaimed: false as const,
  realBodyValidationClaimed: false as const,
  garmentFitClaimed: false as const,
  fitClaimEligible: false as const,
  runtimeCollisionEligible: false as const,
  collisionCandidateEligible: false as const,
  productionAuthority: false as const,
});

function withDisplayPositions(
  source: MeasurementOpenReferenceUniformWaistHipRuntimeResultV1,
  positions: Float32Array,
  qualityGate: MeasurementOpenReferenceDisplayQualityGateResultV1 | null = source.qualityGate,
  poseCompatibleArmLengthProxy:
    | MakeHuman2ArmLengthProxyAppliedV1
    | undefined = source.poseCompatibleArmLengthProxy,
): MeasurementOpenReferenceUniformWaistHipRuntimeResultV1 {
  return Object.freeze({
    ...source,
    displayMesh: snapshotMeasurementSurfaceMeshV1({
      ...source.displayMesh,
      positions,
      byteLength: positions.byteLength + source.displayMesh.indices.byteLength,
    }),
    qualityGate,
    poseCompatibleArmLengthProxy,
  });
}

/** A late, locally gated proxy that the final global gate may drop alone (risk R4). */
interface DroppableBetaShapeStageV1 {
  readonly key: 'highHipCircumferenceMm' | 'kneeCircumferenceMm' | 'neckCircumferenceMm';
  readonly beforeM: Float32Array;
  readonly afterM: Float32Array;
}

/**
 * Every non-empty subset of the droppable stages, singles first, keeping the input order inside a
 * size class (two stages: [a], [b], [a, b]).
 */
function droppableStageCandidates(
  stages: readonly DroppableBetaShapeStageV1[],
): (readonly DroppableBetaShapeStageV1[])[] {
  const subsets: DroppableBetaShapeStageV1[][] = [];
  for (let mask = 1; mask < 1 << stages.length; mask += 1) {
    subsets.push(stages.filter((_, index) => (mask & (1 << index)) !== 0));
  }
  return subsets
    .map((subset, order) => ({ subset, order }))
    .sort((left, right) => left.subset.length - right.subset.length || left.order - right.order)
    .map(({ subset }) => subset);
}

/** Removes the stages' own displacement; later additive stages (limbs, knee) stay in place. */
function withoutBetaShapeStages(
  positionsM: Float32Array,
  stages: readonly DroppableBetaShapeStageV1[],
): Float32Array {
  const next = positionsM.slice();
  for (const stage of stages) {
    if (stage.beforeM.length !== next.length || stage.afterM.length !== next.length) {
      throw new Error(`${stage.key} rollback topology does not match the display mesh.`);
    }
    for (let index = 0; index < next.length; index += 1) {
      const delta = stage.afterM[index] - stage.beforeM[index];
      if (delta !== 0) next[index] -= delta;
    }
  }
  return next;
}

function removeKey(
  keys: MeasurementOpenReferenceBetaShapeKeyV1[],
  key: MeasurementOpenReferenceBetaShapeKeyV1,
): void {
  for (let index = keys.length - 1; index >= 0; index -= 1) {
    if (keys[index] === key) keys.splice(index, 1);
  }
}

function stableKeys(keys: readonly MeasurementOpenReferenceBetaShapeKeyV1[]) {
  const order = new Map(
    MEASUREMENT_OPEN_REFERENCE_BETA_SHAPE_KEYS_V1.map((key, index) => [key, index]),
  );
  return Object.freeze(
    [...new Set(keys)].sort((left, right) => order.get(left)! - order.get(right)!),
  );
}

function suffix(
  keys: readonly MeasurementOpenReferenceBetaShapeKeyV1[],
  limited: readonly MeasurementOpenReferenceBetaShapeKeyV1[],
): string {
  const limitedSuffix = limited.length > 0 ? `;limited=${limited.join(',')}` : '';
  const armLengthSuffix = limited.includes('armLengthMm')
    ? `armLengthMm=limited-centerline-proxy;lengthPackSha256=${MAKEHUMAN2_POSE_COMPATIBLE_LENGTH_PACK_METADATA_V1.sha256}`
    : 'armLengthMm=unrepresented';
  return `${MEASUREMENT_OPEN_REFERENCE_BETA_SHAPE_RUNTIME_V1};represented=${keys.join(',')}${limitedSuffix};${armLengthSuffix};inseamMm=unrepresented`;
}

type MeasurementOpenReferenceBetaShapeRuntimeOptionsV1 = Parameters<
  typeof createBetaShapeRuntimeOnceV1
>[0];

function withoutTorsoDepth(
  measurements: CanonicalBodyMeasurementsMm,
): CanonicalBodyMeasurementsMm | undefined {
  if (
    measurements.chestDepthMm == null &&
    measurements.waistDepthMm == null &&
    measurements.hipDepthMm == null
  ) {
    return undefined;
  }
  const {
    chestDepthMm: _chestDepthMm,
    waistDepthMm: _waistDepthMm,
    hipDepthMm: _hipDepthMm,
    ...rest
  } = measurements;
  return Object.freeze(rest);
}

function hasFinalGlobalQualityRollback(
  result: MeasurementOpenReferenceBetaShapeRuntimeResultV1,
): boolean {
  return result.chestShoulderDiagnostics.includes('beta-final-global-quality-rollback');
}

function measureUnshapedBaseChestMm(
  options: MeasurementOpenReferenceBetaShapeRuntimeOptionsV1,
  result: MeasurementOpenReferenceBetaShapeRuntimeResultV1,
): number | undefined {
  const stationOriginM = result.torsoSectionStations?.chest;
  if (!stationOriginM) return undefined;
  const mesh = options.waistHipRuntime.openReference.mesh;
  try {
    const section = measureMeshPlaneSectionPerimetersV1({
      positionsM: mesh.positions,
      triangleIndices: mesh.indices,
      planeOriginM: stationOriginM,
      planeNormal: [0, 1, 0],
      selection: { kind: 'nearest-seed', seedM: stationOriginM },
      policy: { weldToleranceM: 0.00002 },
    });
    const measuredMm =
      section.ok && section.selectedLoop ? section.selectedLoop.perimeterM * 1000 : Number.NaN;
    return Number.isFinite(measuredMm) && measuredMm > 0 ? measuredMm : undefined;
  } catch {
    return undefined;
  }
}

function withChestTarget(
  measurements: CanonicalBodyMeasurementsMm,
  chestCircumferenceMm: number,
): CanonicalBodyMeasurementsMm {
  return Object.freeze({ ...measurements, chestCircumferenceMm });
}

function chestFallbackResult(options: {
  readonly original: MeasurementOpenReferenceBetaShapeRuntimeResultV1;
  readonly retry: MeasurementOpenReferenceBetaShapeRuntimeResultV1;
  readonly mode: 'halved' | 'removed';
  readonly depthRemoved: boolean;
}): MeasurementOpenReferenceBetaShapeRuntimeResultV1 {
  const represented: MeasurementOpenReferenceBetaShapeKeyV1[] = [];
  for (const key of options.retry.representedVisualControls) {
    if (key !== 'chestCircumferenceMm') represented.push(key);
  }
  const limited: MeasurementOpenReferenceBetaShapeKeyV1[] = [];
  for (const key of options.retry.limitedVisualControls ?? []) {
    if (key !== 'chestCircumferenceMm') limited.push(key);
  }
  if (options.mode === 'halved') limited.push('chestCircumferenceMm');
  const representedVisualControls = stableKeys(represented);
  const limitedVisualControls = stableKeys(limited);
  const depthDiagnostics = options.depthRemoved
    ? [
        ...options.original.chestShoulderDiagnostics.filter((code) =>
          /^(chestDepthMm|waistDepthMm|hipDepthMm):/.test(code),
        ),
        'beta-final-depth-subset-rollback',
      ]
    : [];
  const retryDiagnostics =
    options.mode === 'removed'
      ? options.retry.chestShoulderDiagnostics.filter(
          (code) => !code.startsWith('chestCircumferenceMm:'),
        )
      : options.retry.chestShoulderDiagnostics;
  return Object.freeze({
    ...options.retry,
    status: options.retry.status === 'represented' ? ('partial' as const) : options.retry.status,
    representedVisualControls,
    limitedVisualControls,
    chestShoulderDiagnostics: Object.freeze([
      ...depthDiagnostics,
      'beta-final-chest-subset-rollback',
      `chestCircumferenceMm:beta-final-target-${options.mode}`,
      ...retryDiagnostics,
    ]),
    sourceRevisionSuffix: suffix(representedVisualControls, limitedVisualControls),
  });
}

/**
 * Product-visible beta visual response. It promotes only locally bounded CC0 directions that keep
 * the existing quality/closure rollback. armLengthMm is at most a bounded skeleton-centerline
 * visual proxy; inseam stays explicitly unrepresented because no reviewed crotch landmark exists.
 *
 * Optional torso depth is the newest, least-calibrated control. When the shaped mesh fails the
 * final global quality gate while depth was requested, only the depth subset is rolled back: the
 * runtime is solved again without depth and keeps the chest/shoulder, limb and arm-length
 * response if that solve passes. Depth controls then stay requested but unapplied. If the gate
 * remains unsafe, chest is retried halfway to the measured unshaped-base girth, then at that base
 * girth. A passing halfway response is limited; a base-girth response leaves chest unapplied.
 */
export async function createMeasurementOpenReferenceBetaShapeRuntimeV1(
  options: MeasurementOpenReferenceBetaShapeRuntimeOptionsV1,
): Promise<MeasurementOpenReferenceBetaShapeRuntimeResultV1> {
  const result = await createBetaShapeRuntimeOnceV1(options);
  if (!hasFinalGlobalQualityRollback(result)) return result;

  const depthFree = withoutTorsoDepth(options.measurements);
  let retryMeasurements = options.measurements;
  let failedResult = result;
  if (depthFree) {
    const retry = await createBetaShapeRuntimeOnceV1({ ...options, measurements: depthFree });
    if (!hasFinalGlobalQualityRollback(retry)) {
      return Object.freeze({
        ...retry,
        // Depth was requested but is not applied, so a fully represented retry is still partial.
        status: retry.status === 'represented' ? ('partial' as const) : retry.status,
        chestShoulderDiagnostics: Object.freeze([
          ...result.chestShoulderDiagnostics.filter((code) =>
            /^(chestDepthMm|waistDepthMm|hipDepthMm):/.test(code),
          ),
          'beta-final-depth-subset-rollback',
          ...retry.chestShoulderDiagnostics,
        ]),
      });
    }
    retryMeasurements = depthFree;
    failedResult = retry;
  }

  const requestedChestMm = options.measurements.chestCircumferenceMm;
  const baseChestMm = measureUnshapedBaseChestMm(options, failedResult);
  if (!Number.isFinite(requestedChestMm) || baseChestMm == null) return result;

  const halfwayChestMm = baseChestMm + (requestedChestMm - baseChestMm) / 2;
  const halfwayRetry = await createBetaShapeRuntimeOnceV1({
    ...options,
    measurements: withChestTarget(retryMeasurements, halfwayChestMm),
  });
  const halfwayApplied =
    halfwayRetry.representedVisualControls.includes('chestCircumferenceMm') ||
    (halfwayRetry.limitedVisualControls ?? []).includes('chestCircumferenceMm');
  if (!hasFinalGlobalQualityRollback(halfwayRetry) && halfwayApplied) {
    return chestFallbackResult({
      original: result,
      retry: halfwayRetry,
      mode: 'halved',
      depthRemoved: depthFree != null,
    });
  }

  const removedRetry = await createBetaShapeRuntimeOnceV1({
    ...options,
    measurements: withChestTarget(retryMeasurements, baseChestMm),
  });
  if (!hasFinalGlobalQualityRollback(removedRetry)) {
    return chestFallbackResult({
      original: result,
      retry: removedRetry,
      mode: 'removed',
      depthRemoved: depthFree != null,
    });
  }
  // Female: the bust proxy also carries the ribcage band. Before the whole body is rolled back,
  // drop the band too (no under-bust target, chest at the unshaped base girth).
  const { underBustCircumferenceMm: _underBust, ...withoutUnderBust } = retryMeasurements;
  if (options.basis.kind === 'female' && retryMeasurements.underBustCircumferenceMm != null) {
    const bustDroppedRetry = await createBetaShapeRuntimeOnceV1({
      ...options,
      measurements: withChestTarget(withoutUnderBust as CanonicalBodyMeasurementsMm, baseChestMm),
    });
    if (!hasFinalGlobalQualityRollback(bustDroppedRetry)) {
      return bustDroppedResult({
        original: result,
        retry: chestFallbackResult({
          original: result,
          retry: bustDroppedRetry,
          mode: 'removed',
          depthRemoved: depthFree != null,
        }),
      });
    }
  }
  return result;
}

function bustDroppedResult(options: {
  readonly original: MeasurementOpenReferenceBetaShapeRuntimeResultV1;
  readonly retry: MeasurementOpenReferenceBetaShapeRuntimeResultV1;
}): MeasurementOpenReferenceBetaShapeRuntimeResultV1 {
  const representedVisualControls = stableKeys(
    options.retry.representedVisualControls.filter((key) => key !== 'underBustCircumferenceMm'),
  );
  const limitedVisualControls = stableKeys(
    (options.retry.limitedVisualControls ?? []).filter((key) => key !== 'underBustCircumferenceMm'),
  );
  return Object.freeze({
    ...options.retry,
    status: options.retry.status === 'represented' ? ('partial' as const) : options.retry.status,
    representedVisualControls,
    limitedVisualControls,
    chestShoulderDiagnostics: Object.freeze([
      'beta-final-bust-subset-rollback',
      'underBustCircumferenceMm:beta-final-target-removed',
      ...options.retry.chestShoulderDiagnostics.filter(
        (code) => code !== 'underbust-missing:proportional-ribcage',
      ),
    ]),
    sourceRevisionSuffix: suffix(representedVisualControls, limitedVisualControls),
  });
}

async function createBetaShapeRuntimeOnceV1(options: {
  readonly basis: MakeHumanOpenReferenceBasisV1;
  readonly measurements: CanonicalBodyMeasurementsMm;
  readonly waistHipRuntime: MeasurementOpenReferenceUniformWaistHipRuntimeResultV1;
  readonly loadTorsoBundle?: MeasurementOpenReferenceBetaShapeTorsoBundleLoaderV1;
  readonly loadFemaleBustBundle?: MeasurementOpenReferenceBetaShapeFemaleBustBundleLoaderV1;
  readonly createLimbRuntime?: typeof createMeasurementOpenReferenceLimbSubsetRuntimeV1;
  readonly loadLengthPack?: MeasurementOpenReferenceBetaShapeLengthPackLoaderV1;
  readonly loadPoseResources?: MeasurementOpenReferenceBetaShapePoseResourcesLoaderV1;
  readonly createArmLengthRuntime?: typeof createMakeHuman2ArmLengthProxyRuntimeResearchV1;
  readonly selfIntersectionPolicy?: MeasurementSurfaceSelfIntersectionPolicyV1;
  readonly evaluateQualityGate?: MeasurementOpenReferenceBetaShapeQualityGateEvaluatorV1;
  readonly createTorsoShape?: typeof createMeasurementOpenReferenceBetaTorsoInWorkerV1;
  readonly loadLimbBundle?: MeasurementOpenReferenceBetaShapeLimbBundleLoaderV1;
  readonly solveKneeProxy?: typeof solveMeasurementOpenReferenceKneeProxyInWorkerV1;
  readonly signal?: AbortSignal;
}): Promise<MeasurementOpenReferenceBetaShapeRuntimeResultV1> {
  const admittedBasisRevision =
    options.waistHipRuntime.openReference.provenance.basis.derivedBasisSha256;
  const represented: MeasurementOpenReferenceBetaShapeKeyV1[] = ['heightMm'];
  const limited: MeasurementOpenReferenceBetaShapeKeyV1[] = [];
  represented.push(
    ...options.waistHipRuntime.representedGeometricProxies.filter(
      (key): key is 'waistCircumferenceMm' | 'hipCircumferenceMm' =>
        key === 'waistCircumferenceMm' || key === 'hipCircumferenceMm',
    ),
  );
  const baselineRepresented = Object.freeze([...represented]);
  let chestStationOriginM: readonly [number, number, number] | undefined;
  let underBustStationOriginM: readonly [number, number, number] | undefined;
  let highHipStationOriginM: readonly [number, number, number] | undefined;
  let highHipStage: DroppableBetaShapeStageV1 | undefined;
  let kneeStage: DroppableBetaShapeStageV1 | undefined;
  let neckStage: DroppableBetaShapeStageV1 | undefined;
  let poseResourcesPromise: Promise<MeasurementOpenReferenceDisplayPoseResourcesV1> | undefined;
  const poseResources = () =>
    (poseResourcesPromise ??= (options.loadPoseResources ?? loadBetaShapePoseResourcesV1)());
  let shapedRuntime = withDisplayPositions(
    options.waistHipRuntime,
    options.waistHipRuntime.displayMesh.positions,
  );
  const diagnostics: string[] = [];

  // Neck needs the rig rest heads before the torso worker runs; resolved only when requested.
  const neckTargetMm = options.measurements.neckCircumferenceMm;
  let neckRigHeads: MeasurementOpenReferenceNeckRigHeadsV1 | undefined;
  if (neckTargetMm != null) {
    try {
      const { rig } = await poseResources();
      neckRigHeads = resolveMeasurementOpenReferenceNeckRigHeadsV1({
        basis: options.basis,
        heightMm: options.measurements.heightMm,
        rig,
      });
    } catch (reason: unknown) {
      if (reason instanceof Error && reason.name === 'AbortError') throw reason;
      // The torso worker reports neck as notApplied without rig heads.
    }
  }

  try {
    const torso = await (
      options.createTorsoShape ?? createMeasurementOpenReferenceBetaTorsoInWorkerV1
    )({
      basis: options.basis,
      measurements: options.measurements,
      sourcePositionsM: shapedRuntime.displayMesh.positions,
      triangleIndices: shapedRuntime.displayMesh.indices,
      ...(options.measurements.highHipCircumferenceMm == null
        ? {}
        : { highHipCircumferenceMm: options.measurements.highHipCircumferenceMm }),
      ...(neckTargetMm == null
        ? {}
        : {
            neckCircumferenceMm: neckTargetMm,
            neckPose: shapedRuntime.openReference.pose,
            ...(neckRigHeads ? { neckRigHeads } : {}),
          }),
      loadTorsoBundle: options.loadTorsoBundle,
      ...(options.loadFemaleBustBundle
        ? { loadFemaleBustBundle: options.loadFemaleBustBundle }
        : {}),
      signal: options.signal,
    });
    diagnostics.push(
      ...torso.ribcageDiagnostics,
      ...torso.chestShoulderDiagnostics,
      ...torso.depthDiagnostics.map(({ measurementKey, code }) => `${measurementKey}:${code}`),
      ...torso.highHipDiagnostics.map(({ code }) => `highHipCircumferenceMm:${code}`),
      ...torso.neckDiagnostics.map(({ code }) => `neckCircumferenceMm:${code}`),
    );
    chestStationOriginM = torso.chestStationOriginM;
    underBustStationOriginM = torso.underBustStationOriginM;
    highHipStationOriginM = torso.highHipStationOriginM;
    represented.push(
      ...torso.ribcageRepresentedMeasurements,
      ...torso.chestShoulderRepresentedMeasurements,
      ...torso.depthRepresentedMeasurements,
      ...(torso.highHipRepresented ? (['highHipCircumferenceMm'] as const) : []),
      ...(torso.neckRepresented ? (['neckCircumferenceMm'] as const) : []),
    );
    limited.push(
      ...(torso.ribcageLimitedMeasurements ?? []),
      ...torso.chestShoulderLimitedMeasurements,
      ...torso.depthLimitedMeasurements,
      ...(torso.highHipLimited ? (['highHipCircumferenceMm'] as const) : []),
      ...(torso.neckLimited ? (['neckCircumferenceMm'] as const) : []),
    );
    const highHipApplied = torso.highHipRepresented || torso.highHipLimited;
    const neckApplied = torso.neckRepresented || torso.neckLimited;
    if (
      torso.ribcageRepresentedMeasurements.length > 0 ||
      (torso.ribcageLimitedMeasurements?.length ?? 0) > 0 ||
      torso.chestShoulderRepresentedMeasurements.length > 0 ||
      torso.chestShoulderLimitedMeasurements.length > 0 ||
      torso.depthRepresentedMeasurements.length > 0 ||
      torso.depthLimitedMeasurements.length > 0 ||
      highHipApplied ||
      neckApplied
    ) {
      shapedRuntime = withDisplayPositions(shapedRuntime, torso.positionsM);
      if (highHipApplied && torso.positionsBeforeHighHipM) {
        highHipStage = Object.freeze({
          key: 'highHipCircumferenceMm' as const,
          beforeM: torso.positionsBeforeHighHipM,
          // Neck runs after high hip: end the high-hip delta where neck starts.
          afterM: torso.positionsBeforeNeckM ?? torso.positionsM,
        });
      }
      if (neckApplied && torso.positionsBeforeNeckM) {
        neckStage = Object.freeze({
          key: 'neckCircumferenceMm' as const,
          beforeM: torso.positionsBeforeNeckM,
          afterM: torso.positionsM,
        });
      }
    }
  } catch (reason: unknown) {
    if (reason instanceof Error && reason.name === 'AbortError') throw reason;
    diagnostics.push(
      `chest-shoulder-runtime-unavailable:${reason instanceof Error ? reason.message : String(reason)}`,
    );
  }

  let limbStatus: MeasurementOpenReferenceLimbSubsetRuntimeResultV1['status'] = 'unrepresented';
  let limbSectionModes: readonly OpenReferenceLimbCircumferenceModeV1[] = Object.freeze([]);
  try {
    const limb = await (
      options.createLimbRuntime ?? createMeasurementOpenReferenceLimbSubsetRuntimeV1
    )({
      basis: options.basis,
      measurements: options.measurements,
      waistHipRuntime: shapedRuntime,
      signal: options.signal,
    });
    limbStatus = limb.status;
    limbSectionModes = limb.sectionModes ?? Object.freeze([]);
    represented.push(
      ...limb.representedGeometricProxies.filter(
        (
          key,
        ): key is
          | 'bicepCircumferenceMm'
          | 'wristCircumferenceMm'
          | 'thighCircumferenceMm'
          | 'calfCircumferenceMm'
          | 'ankleCircumferenceMm' =>
          key === 'bicepCircumferenceMm' ||
          key === 'wristCircumferenceMm' ||
          key === 'thighCircumferenceMm' ||
          key === 'calfCircumferenceMm' ||
          key === 'ankleCircumferenceMm',
      ),
    );
    limited.push(
      ...(limb.limitedGeometricProxies ?? []).filter(
        (
          key,
        ): key is
          | 'bicepCircumferenceMm'
          | 'wristCircumferenceMm'
          | 'thighCircumferenceMm'
          | 'calfCircumferenceMm'
          | 'ankleCircumferenceMm' =>
          key === 'bicepCircumferenceMm' ||
          key === 'wristCircumferenceMm' ||
          key === 'thighCircumferenceMm' ||
          key === 'calfCircumferenceMm' ||
          key === 'ankleCircumferenceMm',
      ),
    );
    diagnostics.push(
      ...(limb.diagnostics ?? []).map(
        ({ code, measurementKey }) => `${measurementKey ?? 'limb'}:${code}`,
      ),
    );
    if (
      limb.representedGeometricProxies.length > 0 ||
      (limb.limitedGeometricProxies?.length ?? 0) > 0
    ) {
      shapedRuntime = withDisplayPositions(shapedRuntime, limb.displayMesh.positions);
    }
  } catch (reason: unknown) {
    if (reason instanceof Error && reason.name === 'AbortError') throw reason;
    limbStatus = 'error';
    limbSectionModes = Object.freeze([]);
    diagnostics.push(
      `limb-runtime-unavailable:${reason instanceof Error ? reason.message : String(reason)}`,
    );
  }

  let kneeSectionStations: readonly MeasurementOpenReferenceKneeRigStationV1[] | undefined;
  try {
    const { rig } = await poseResources();
    kneeSectionStations = resolveMeasurementOpenReferenceKneeRigStationsV1({
      basis: options.basis,
      heightMm: options.measurements.heightMm,
      rig,
    });
  } catch (reason: unknown) {
    if (reason instanceof Error && reason.name === 'AbortError') throw reason;
    // Guide-only data: the guide keeps its analytical knee band when the rig is unavailable.
  }
  let neckSectionStation: MeasurementOpenReferenceNeckProtectedSectionV1 | undefined;
  try {
    const { rig } = await poseResources();
    neckSectionStation =
      resolveMeasurementOpenReferenceNeckSectionStationV1(
        neckRigHeads ??
          resolveMeasurementOpenReferenceNeckRigHeadsV1({
            basis: options.basis,
            heightMm: options.measurements.heightMm,
            rig,
          }),
      ) ?? undefined;
  } catch (reason: unknown) {
    if (reason instanceof Error && reason.name === 'AbortError') throw reason;
    // Guide-only data: without the rig the neck guide is simply not drawn.
  }

  // Knee runs after the limb runtime and its final closure, on the shaped legs (spec §2.2).
  const kneeTargetMm = options.measurements.kneeCircumferenceMm;
  if (kneeTargetMm != null) {
    try {
      const [{ rig }, limbBundle] = await Promise.all([
        poseResources(),
        (options.loadLimbBundle ?? loadMakeHumanLimbCircumferenceDeltaBundleV1)(),
      ]);
      const beforeM = shapedRuntime.displayMesh.positions;
      const stations = measuredBetaShapeStageV1('derive-knee-stations', () => {
        // Uniform (not localized) protected modes, so the knee stations never depend on which
        // limb fields happen to be filled in.
        const { modes } = createMakeHumanLimbCircumferenceUniformModesV1({
          basis: options.basis,
          heightMm: options.measurements.heightMm,
          bundle: limbBundle,
        });
        const thighMode = modes.find(
          ({ measurementKey }) => measurementKey === 'thighCircumferenceMm',
        );
        const calfMode = modes.find(
          ({ measurementKey }) => measurementKey === 'calfCircumferenceMm',
        );
        if (!thighMode || !calfMode) throw new Error('Knee protected limb modes are missing.');
        return deriveMeasurementOpenReferenceKneeProxyStationsV1({
          positionsM: beforeM,
          basis: options.basis,
          heightMm: options.measurements.heightMm,
          rig,
          thighMode,
          calfMode,
        });
      });
      const knee = await (
        options.solveKneeProxy ?? solveMeasurementOpenReferenceKneeProxyInWorkerV1
      )(
        {
          positionsM: beforeM,
          triangleIndices: shapedRuntime.displayMesh.indices,
          pose: shapedRuntime.openReference.pose,
          targetMm: kneeTargetMm,
          stations,
        },
        options.signal,
      );
      diagnostics.push(...knee.diagnostics.map(({ code }) => `kneeCircumferenceMm:${code}`));
      if (knee.status === 'represented' || knee.status === 'limited') {
        (knee.status === 'represented' ? represented : limited).push('kneeCircumferenceMm');
        shapedRuntime = withDisplayPositions(shapedRuntime, knee.positionsM);
        kneeStage = Object.freeze({
          key: 'kneeCircumferenceMm' as const,
          beforeM,
          afterM: shapedRuntime.displayMesh.positions,
        });
      }
    } catch (reason: unknown) {
      if (reason instanceof Error && reason.name === 'AbortError') throw reason;
      diagnostics.push(
        `kneeCircumferenceMm:runtime-unavailable:${reason instanceof Error ? reason.message : String(reason)}`,
      );
    }
  }

  const positionsBeforeArmLengthM = shapedRuntime.displayMesh.positions;
  let appliedArmLength: MakeHuman2ArmLengthProxyAppliedV1 | undefined;
  try {
    const [lengthPack, { rig }] = await Promise.all([
      (options.loadLengthPack ?? loadMakeHuman2PoseCompatibleLengthPackV1)(),
      poseResources(),
    ]);
    const armLength = measuredBetaShapeStageV1('compile-arm-length', () =>
      (options.createArmLengthRuntime ?? createMakeHuman2ArmLengthProxyRuntimeResearchV1)({
        basis: options.basis,
        rigBundle: rig,
        pack: lengthPack,
        armLengthMm: options.measurements.armLengthMm,
        heightMm: options.measurements.heightMm,
      }),
    );
    if (armLength.ok) {
      appliedArmLength = armLength;
      const positionsM = measuredBetaShapeStageV1('apply-arm-length', () =>
        applyMakeHuman2ArmLengthProxyToDisplayPositionsMResearchV1({
          basis: options.basis,
          sourcePositionsM: shapedRuntime.displayMesh.positions,
          armProxy: armLength,
        }),
      );
      limited.push('armLengthMm');
      diagnostics.push(
        armLength.targetStatus === 'bounded-endpoint'
          ? 'armLengthMm:centerline-proxy-limited-to-bounded-endpoint'
          : 'armLengthMm:centerline-proxy-applied',
      );
      shapedRuntime = withDisplayPositions(
        shapedRuntime,
        positionsM,
        shapedRuntime.qualityGate,
        armLength,
      );
    } else {
      diagnostics.push(`armLengthMm:centerline-proxy-unavailable:${armLength.code}`);
    }
  } catch (reason: unknown) {
    if (reason instanceof Error && reason.name === 'AbortError') throw reason;
    diagnostics.push(
      `arm-length-runtime-unavailable:${reason instanceof Error ? reason.message : String(reason)}`,
    );
  }

  const evaluateQualityGate =
    options.evaluateQualityGate ?? evaluateMeasurementOpenReferenceDisplayQualityInWorkerV1;
  let finalQualityGate = await evaluateQualityGate({
    uniformPositionsM: shapedRuntime.openReference.mesh.positions,
    personalizedPositionsM: shapedRuntime.displayMesh.positions,
    triangleIndices: shapedRuntime.displayMesh.indices,
    admittedBasisRevision,
    selfIntersectionPolicy: options.selfIntersectionPolicy,
    signal: options.signal,
  });
  const droppableStages = [kneeStage, neckStage, highHipStage].filter(
    (stage): stage is DroppableBetaShapeStageV1 => stage != null,
  );
  if (!finalQualityGate.safe && droppableStages.length > 0) {
    // R4: drop the late proxies alone (knee, neck, high hip; then pairs; then all) before the
    // global rollback, so one failing station never wipes waist/hip, depth or limbs.
    for (const dropped of droppableStageCandidates(droppableStages)) {
      const withoutStagesM = withoutBetaShapeStages(positionsBeforeArmLengthM, dropped);
      const candidateM = appliedArmLength
        ? applyMakeHuman2ArmLengthProxyToDisplayPositionsMResearchV1({
            basis: options.basis,
            sourcePositionsM: withoutStagesM,
            armProxy: appliedArmLength,
          })
        : withoutStagesM;
      const candidateGate = await evaluateQualityGate({
        uniformPositionsM: shapedRuntime.openReference.mesh.positions,
        personalizedPositionsM: candidateM,
        triangleIndices: shapedRuntime.displayMesh.indices,
        admittedBasisRevision,
        selfIntersectionPolicy: options.selfIntersectionPolicy,
        signal: options.signal,
      });
      if (!candidateGate.safe) continue;
      for (const { key } of dropped) {
        removeKey(represented, key);
        removeKey(limited, key);
        diagnostics.push(`${key}:beta-final-quality-rollback`);
      }
      shapedRuntime = withDisplayPositions(shapedRuntime, candidateM, candidateGate);
      finalQualityGate = candidateGate;
      break;
    }
  }
  if (finalQualityGate.safe) {
    shapedRuntime = withDisplayPositions(
      shapedRuntime,
      shapedRuntime.displayMesh.positions,
      finalQualityGate,
    );
  } else {
    diagnostics.push('beta-final-global-quality-rollback');
    if (
      finalQualityGate.reasons.includes('new-self-intersection') ||
      finalQualityGate.reasons.includes('self-intersection-evaluation-failed')
    ) {
      diagnostics.push('beta-final-self-intersection-rollback');
    }
    represented.length = 0;
    represented.push(...baselineRepresented);
    limited.length = 0;
    limbStatus = 'unrepresented';
    limbSectionModes = Object.freeze([]);
    const rollbackQualityGate = await evaluateQualityGate({
      uniformPositionsM: options.waistHipRuntime.openReference.mesh.positions,
      personalizedPositionsM: options.waistHipRuntime.displayMesh.positions,
      triangleIndices: options.waistHipRuntime.displayMesh.indices,
      admittedBasisRevision,
      selfIntersectionPolicy: options.selfIntersectionPolicy,
      signal: options.signal,
    });
    if (rollbackQualityGate.safe) {
      shapedRuntime = withDisplayPositions(
        options.waistHipRuntime,
        options.waistHipRuntime.displayMesh.positions,
        rollbackQualityGate,
      );
    } else {
      diagnostics.push('beta-final-admitted-basis-fallback');
      represented.length = 0;
      represented.push('heightMm');
      const admittedBasisQualityGate = await evaluateQualityGate({
        uniformPositionsM: options.waistHipRuntime.openReference.mesh.positions,
        personalizedPositionsM: options.waistHipRuntime.openReference.mesh.positions,
        triangleIndices: options.waistHipRuntime.openReference.mesh.indices,
        admittedBasisRevision,
        selfIntersectionPolicy: options.selfIntersectionPolicy,
        signal: options.signal,
      });
      if (
        !admittedBasisQualityGate.safe ||
        !admittedBasisQualityGate.claims.selfIntersectionEvaluated
      ) {
        throw new MeasurementOpenReferenceBetaShapeSafetyErrorV1();
      }
      shapedRuntime = Object.freeze({
        ...withDisplayPositions(
          options.waistHipRuntime,
          options.waistHipRuntime.openReference.mesh.positions,
          admittedBasisQualityGate,
          undefined,
        ),
        status: 'unrepresented' as const,
        representedGeometricProxies: Object.freeze([]),
        modeResults: Object.freeze([]),
        poseCompatibleArmLengthProxy: undefined,
      });
    }
  }

  const representedVisualControls = stableKeys(represented);
  const limitedVisualControls = stableKeys(limited);
  const requestedCount =
    6 +
    (options.measurements.underBustCircumferenceMm == null ? 0 : 1) +
    [
      options.measurements.chestDepthMm,
      options.measurements.waistDepthMm,
      options.measurements.hipDepthMm,
      options.measurements.highHipCircumferenceMm,
      options.measurements.neckCircumferenceMm,
      options.measurements.bicepCircumferenceMm,
      options.measurements.wristCircumferenceMm,
      options.measurements.thighCircumferenceMm,
      options.measurements.kneeCircumferenceMm,
      options.measurements.calfCircumferenceMm,
      options.measurements.ankleCircumferenceMm,
    ].filter((value) => value != null).length;
  const status =
    representedVisualControls.length === requestedCount
      ? ('represented' as const)
      : representedVisualControls.length > 1
        ? ('partial' as const)
        : diagnostics.length > 0
          ? ('error' as const)
          : ('unrepresented' as const);
  const waistStationOriginM = options.waistHipRuntime.sectionModes?.find(
    ({ measurementKey }) => measurementKey === 'waistCircumferenceMm',
  )?.stationOriginM;
  const hipStationOriginM = options.waistHipRuntime.sectionModes?.find(
    ({ measurementKey }) => measurementKey === 'hipCircumferenceMm',
  )?.stationOriginM;

  return Object.freeze({
    version: MEASUREMENT_OPEN_REFERENCE_BETA_SHAPE_RUNTIME_V1,
    role: 'CC0_OPEN_REFERENCE_BETA_VISUAL_SHAPE' as const,
    status,
    fkProxyRuntime: shapedRuntime,
    representedVisualControls,
    limitedVisualControls,
    unrepresentedRequiredControls: Object.freeze(['inseamMm'] as const),
    chestShoulderDiagnostics: Object.freeze(diagnostics),
    limbStatus,
    limbSectionModes,
    torsoSectionStations: Object.freeze({
      chest: chestStationOriginM,
      underBust: underBustStationOriginM,
      waist: waistStationOriginM,
      highHip: highHipStationOriginM,
      hip: hipStationOriginM,
    }),
    kneeSectionStations,
    neckSectionStation,
    sourceRevisionSuffix: suffix(representedVisualControls, limitedVisualControls),
    claims: CLAIMS,
  });
}
