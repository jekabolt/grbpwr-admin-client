import { type MakeHumanTorsoShapeDeltaBundleV1 } from './makehuman-torso-shape-delta-bundle-v1';
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
  createMeasurementOpenReferenceLimbSubsetRuntimeV1,
  type MeasurementOpenReferenceLimbSubsetRuntimeResultV1,
} from './measurement-open-reference-limb-subset-runtime-v1';
import {
  snapshotMeasurementSurfaceMeshV1,
  type MakeHumanOpenReferenceBasisV1,
} from './measurement-open-reference-display-v1';
import type { MeasurementOpenReferenceUniformWaistHipRuntimeResultV1 } from './measurement-open-reference-uniform-waist-hip-runtime-v1';

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
  'chestDepthMm',
  'waistDepthMm',
  'hipDepthMm',
  'armLengthMm',
  'bicepCircumferenceMm',
  'wristCircumferenceMm',
  'thighCircumferenceMm',
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
  readonly sourceRevisionSuffix: string;
  readonly claims: {
    readonly visualReferenceOnly: true;
    readonly geometricProxyOnly: true;
    readonly exactHeightOnly: true;
    readonly chestCircumferencePosteriorHeldFixed: true;
    readonly underBustIndependentRibcageBand: true;
    readonly torsoDepthSymmetricSectionProxyOnly: true;
    readonly torsoDepthFrontBackDistributionCalibrated: false;
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
export type MeasurementOpenReferenceBetaShapeLengthPackLoaderV1 =
  () => Promise<MakeHuman2PoseCompatibleLengthPackV1>;
export type MeasurementOpenReferenceBetaShapePoseResourcesLoaderV1 =
  () => Promise<MeasurementOpenReferenceDisplayPoseResourcesV1>;
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

/**
 * Product-visible beta visual response. It promotes only locally bounded CC0 directions that keep
 * the existing quality/closure rollback. armLengthMm is at most a bounded skeleton-centerline
 * visual proxy; inseam stays explicitly unrepresented because no reviewed crotch landmark exists.
 */
export async function createMeasurementOpenReferenceBetaShapeRuntimeV1(options: {
  readonly basis: MakeHumanOpenReferenceBasisV1;
  readonly measurements: CanonicalBodyMeasurementsMm;
  readonly waistHipRuntime: MeasurementOpenReferenceUniformWaistHipRuntimeResultV1;
  readonly loadTorsoBundle?: MeasurementOpenReferenceBetaShapeTorsoBundleLoaderV1;
  readonly createLimbRuntime?: typeof createMeasurementOpenReferenceLimbSubsetRuntimeV1;
  readonly loadLengthPack?: MeasurementOpenReferenceBetaShapeLengthPackLoaderV1;
  readonly loadPoseResources?: MeasurementOpenReferenceBetaShapePoseResourcesLoaderV1;
  readonly createArmLengthRuntime?: typeof createMakeHuman2ArmLengthProxyRuntimeResearchV1;
  readonly selfIntersectionPolicy?: MeasurementSurfaceSelfIntersectionPolicyV1;
  readonly evaluateQualityGate?: MeasurementOpenReferenceBetaShapeQualityGateEvaluatorV1;
  readonly createTorsoShape?: typeof createMeasurementOpenReferenceBetaTorsoInWorkerV1;
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
  let shapedRuntime = withDisplayPositions(
    options.waistHipRuntime,
    options.waistHipRuntime.displayMesh.positions,
  );
  const diagnostics: string[] = [];

  try {
    const torso = await (
      options.createTorsoShape ?? createMeasurementOpenReferenceBetaTorsoInWorkerV1
    )({
      basis: options.basis,
      measurements: options.measurements,
      sourcePositionsM: shapedRuntime.displayMesh.positions,
      triangleIndices: shapedRuntime.displayMesh.indices,
      loadTorsoBundle: options.loadTorsoBundle,
      signal: options.signal,
    });
    diagnostics.push(
      ...torso.ribcageDiagnostics,
      ...torso.chestShoulderDiagnostics,
      ...torso.depthDiagnostics.map(({ measurementKey, code }) => `${measurementKey}:${code}`),
    );
    represented.push(
      ...torso.ribcageRepresentedMeasurements,
      ...torso.chestShoulderRepresentedMeasurements,
      ...torso.depthRepresentedMeasurements,
    );
    limited.push(...torso.chestShoulderLimitedMeasurements, ...torso.depthLimitedMeasurements);
    if (
      torso.ribcageRepresentedMeasurements.length > 0 ||
      torso.chestShoulderRepresentedMeasurements.length > 0 ||
      torso.chestShoulderLimitedMeasurements.length > 0 ||
      torso.depthRepresentedMeasurements.length > 0 ||
      torso.depthLimitedMeasurements.length > 0
    ) {
      shapedRuntime = withDisplayPositions(shapedRuntime, torso.positionsM);
    }
  } catch (reason: unknown) {
    if (reason instanceof Error && reason.name === 'AbortError') throw reason;
    diagnostics.push(
      `chest-shoulder-runtime-unavailable:${reason instanceof Error ? reason.message : String(reason)}`,
    );
  }

  let limbStatus: MeasurementOpenReferenceLimbSubsetRuntimeResultV1['status'] = 'unrepresented';
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
    diagnostics.push(
      `limb-runtime-unavailable:${reason instanceof Error ? reason.message : String(reason)}`,
    );
  }

  try {
    const [lengthPack, poseResources] = await Promise.all([
      (options.loadLengthPack ?? loadMakeHuman2PoseCompatibleLengthPackV1)(),
      (options.loadPoseResources ?? loadBetaShapePoseResourcesV1)(),
    ]);
    const armLength = measuredBetaShapeStageV1('compile-arm-length', () =>
      (options.createArmLengthRuntime ?? createMakeHuman2ArmLengthProxyRuntimeResearchV1)({
        basis: options.basis,
        rigBundle: poseResources.rig,
        pack: lengthPack,
        armLengthMm: options.measurements.armLengthMm,
        heightMm: options.measurements.heightMm,
      }),
    );
    if (armLength.ok) {
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
  const finalQualityGate = await evaluateQualityGate({
    uniformPositionsM: shapedRuntime.openReference.mesh.positions,
    personalizedPositionsM: shapedRuntime.displayMesh.positions,
    triangleIndices: shapedRuntime.displayMesh.indices,
    admittedBasisRevision,
    selfIntersectionPolicy: options.selfIntersectionPolicy,
    signal: options.signal,
  });
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
      options.measurements.bicepCircumferenceMm,
      options.measurements.wristCircumferenceMm,
      options.measurements.thighCircumferenceMm,
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
    sourceRevisionSuffix: suffix(representedVisualControls, limitedVisualControls),
    claims: CLAIMS,
  });
}
