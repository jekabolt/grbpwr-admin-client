import {
  compileMakeHumanCloLikePoseDisplayV3,
  MAKEHUMAN_CLO_LIKE_POSE_CHANNELS_V3,
  type MakeHumanCloLikeArmControlsV3,
  type MakeHumanCloLikePoseInputV3,
} from './makehuman-clo-like-pose-display-v3';
import type {
  MakeHumanCoreRigBasisKindV1,
  MakeHumanCoreRigBundleV1,
} from './makehuman-core-rig-pose-research-v1';
import {
  poseMakeHumanCoreRigPositionsLocalResearchV3,
  type MakeHumanLocalAnatomicalRotationV3,
} from './makehuman-local-joint-frame-research-v3';
import { deriveMakeHumanUniformWaistHipRigAnchorsMResearchV1 } from './makehuman-waist-hip-rig-anchor-research-v1';
import type { CanonicalBodyMeasurementsMm } from './measurement-adapter';
import {
  createMakeHumanDisplayPoseResourceLoaderV1,
  type MeasurementOpenReferenceDisplayPoseResourcesV1,
} from './measurement-open-reference-display-pose-runtime-v1';
import { MEASUREMENT_OPEN_REFERENCE_DISPLAY_POSE_RUNTIME_METADATA_V1 } from './measurement-open-reference-display-pose-v1';
import {
  snapshotMeasurementSurfaceMeshV1,
  type MakeHumanOpenReferenceBasisV1,
} from './measurement-open-reference-display-v1';
import type { MeasurementOpenReferenceUniformWaistHipRuntimeResultV1 } from './measurement-open-reference-uniform-waist-hip-runtime-v1';
import type { MeasurementSurfaceMeshV1 } from './measurement-watertight-surface-v1';

export const MAKEHUMAN_FULL_BODY_LOCAL_FK_RUNTIME_V3 =
  'makehuman-full-body-local-fk-runtime/v3' as const;

export const MAKEHUMAN_FULL_BODY_LOCAL_FK_LIMITS_V3 = MAKEHUMAN_CLO_LIKE_POSE_CHANNELS_V3;
export type MakeHumanFullBodyLocalFkArmV3 = MakeHumanCloLikeArmControlsV3;
export type MakeHumanFullBodyLocalFkPoseV3 = MakeHumanCloLikePoseInputV3;

export interface MakeHumanFullBodyLocalFkResultV3 {
  readonly version: typeof MAKEHUMAN_FULL_BODY_LOCAL_FK_RUNTIME_V3;
  readonly basisKind: MakeHumanCoreRigBasisKindV1;
  readonly pose: MakeHumanFullBodyLocalFkPoseV3;
  readonly rotations: readonly MakeHumanLocalAnatomicalRotationV3[];
  readonly positions: Float32Array;
  readonly maximumJointPivotResidual: number;
  readonly claims: {
    readonly displayOnly: true;
    readonly localForwardKinematicsApplied: boolean;
    readonly conservativeUiEnvelopeApplied: true;
    readonly clinicalAnatomicalRangeAuthority: false;
    readonly inverseKinematicsApplied: false;
    readonly garmentPairEvaluated: false;
    readonly fitClaimEligible: false;
    readonly runtimeCollisionEligible: false;
    readonly productionAuthority: false;
  };
}

export interface MeasurementOpenReferenceFullBodyLocalFkRuntimeResultV3 {
  readonly version: typeof MAKEHUMAN_FULL_BODY_LOCAL_FK_RUNTIME_V3;
  readonly input: MakeHumanFullBodyLocalFkPoseV3;
  readonly sourceRevision: string;
  readonly displayMesh: MeasurementSurfaceMeshV1;
  readonly maximumJointPivotResidualM: number;
  readonly source: {
    readonly rigSha256: string;
    readonly anchorSha256: string;
    readonly poseResourcesLoaded: boolean;
  };
  readonly claims: MakeHumanFullBodyLocalFkResultV3['claims'];
}

const FK_APPLIED_CLAIMS = Object.freeze({
  displayOnly: true as const,
  localForwardKinematicsApplied: true as const,
  conservativeUiEnvelopeApplied: true as const,
  clinicalAnatomicalRangeAuthority: false as const,
  inverseKinematicsApplied: false as const,
  garmentPairEvaluated: false as const,
  fitClaimEligible: false as const,
  runtimeCollisionEligible: false as const,
  productionAuthority: false as const,
});

const FK_BYPASSED_CLAIMS = Object.freeze({
  ...FK_APPLIED_CLAIMS,
  localForwardKinematicsApplied: false as const,
});

export function validateMakeHumanFullBodyLocalFkPoseV3(
  value: unknown,
): MakeHumanFullBodyLocalFkPoseV3 {
  return compileMakeHumanCloLikePoseDisplayV3(value).input;
}

export function createNeutralMakeHumanFullBodyLocalFkPoseV3(): MakeHumanFullBodyLocalFkPoseV3 {
  return Object.freeze({
    torsoFlexionDeg: 0,
    torsoSideBendDeg: 0,
    torsoTwistDeg: 0,
    symmetry: 'bilateral' as const,
    arm: Object.freeze({
      shoulderRaiseDeg: 0,
      shoulderForwardDeg: 0,
      elbowBendDeg: 0,
      wristBendDeg: 0,
    }),
  });
}

export function makeHumanFullBodyLocalFkRotationsV3(
  value: unknown,
): readonly MakeHumanLocalAnatomicalRotationV3[] {
  return compileMakeHumanCloLikePoseDisplayV3(value).rotations;
}

/** Low-level evaluator for already-shaped positions and matching rig anchors. */
export function poseMakeHumanFullBodyLocalFkV3(options: {
  readonly bundle: MakeHumanCoreRigBundleV1;
  readonly basisKind: MakeHumanCoreRigBasisKindV1;
  readonly positions: Float32Array;
  readonly heads: Float32Array;
  readonly tails: Float32Array;
  readonly rollDirections: Float32Array;
  readonly pose: unknown;
}): MakeHumanFullBodyLocalFkResultV3 {
  const pose = validateMakeHumanFullBodyLocalFkPoseV3(options.pose);
  const rotations = makeHumanFullBodyLocalFkRotationsV3(pose);
  const result = poseMakeHumanCoreRigPositionsLocalResearchV3({
    bundle: options.bundle,
    basisKind: options.basisKind,
    positions: options.positions,
    heads: options.heads,
    tails: options.tails,
    rollDirections: options.rollDirections,
    rotations,
  });
  return Object.freeze({
    version: MAKEHUMAN_FULL_BODY_LOCAL_FK_RUNTIME_V3,
    basisKind: options.basisKind,
    pose,
    rotations,
    positions: result.positions,
    maximumJointPivotResidual: result.maximumJointPivotResidual,
    claims: FK_APPLIED_CLAIMS,
  });
}

const loadAuthenticatedFullBodyResourcesV3 = createMakeHumanDisplayPoseResourceLoaderV1();

function validateSourceRevision(sourceRevision: string): string {
  if (
    typeof sourceRevision !== 'string' ||
    sourceRevision.length === 0 ||
    sourceRevision.trim() !== sourceRevision
  ) {
    throw new RangeError('sourceRevision must be a non-empty trimmed string.');
  }
  return sourceRevision;
}

function assertHighLevelBinding(
  options: {
    readonly basis: MakeHumanOpenReferenceBasisV1;
    readonly measurements: CanonicalBodyMeasurementsMm;
    readonly proxyRuntime: MeasurementOpenReferenceUniformWaistHipRuntimeResultV1;
  },
  allowVerifiedProxyFallback: boolean,
): void {
  const { basis, measurements, proxyRuntime } = options;
  if (
    basis.kind === 'base' ||
    (proxyRuntime.status === 'error' && !allowVerifiedProxyFallback) ||
    proxyRuntime.openReference.pose !== 'A' ||
    proxyRuntime.openReference.provenance.basis.kind !== basis.kind ||
    !Number.isFinite(measurements.heightMm) ||
    measurements.heightMm <= 0
  ) {
    throw new Error('Full-body local FK basis, measurements, or proxy binding is invalid.');
  }
  const positions = proxyRuntime.displayMesh.positions;
  const indices = proxyRuntime.displayMesh.indices;
  if (
    !(positions instanceof Float32Array) ||
    !(indices instanceof Uint32Array) ||
    positions.length !== basis.positionsSourceUnits.length ||
    indices.length !== basis.indices.length ||
    !positions.every(Number.isFinite)
  ) {
    throw new Error('Full-body local FK shaped display mesh topology is invalid.');
  }
  for (let index = 0; index < indices.length; index += 1) {
    if (indices[index] !== basis.indices[index]) {
      throw new Error('Full-body local FK shaped display mesh indices do not match the basis.');
    }
  }

  if (proxyRuntime.status === 'error') {
    const fallbackMesh = proxyRuntime.openReference.mesh;
    const exactFallback =
      proxyRuntime.representedGeometricProxies.length === 0 &&
      proxyRuntime.modeResults.length === 0 &&
      fallbackMesh.positions.length === positions.length &&
      fallbackMesh.indices.length === indices.length &&
      positions.every((value, index) => value === fallbackMesh.positions[index]) &&
      indices.every((value, index) => value === fallbackMesh.indices[index]);
    if (!exactFallback) {
      throw new Error('Full-body local FK proxy fallback does not match the open-reference mesh.');
    }
  }
}

function boundSourceRevision(sourceRevision: string, pose: MakeHumanFullBodyLocalFkPoseV3): string {
  const metadata = MEASUREMENT_OPEN_REFERENCE_DISPLAY_POSE_RUNTIME_METADATA_V1;
  return `${sourceRevision};fullBodyLocalFkRuntime=${MAKEHUMAN_FULL_BODY_LOCAL_FK_RUNTIME_V3};runtimePose=${encodeURIComponent(JSON.stringify(pose))};displayPoseRigSha256=${metadata.rigSha256};displayPoseAnchorSha256=${metadata.anchorSha256}`;
}

/**
 * Preserves a verified neutral fallback without pose assets, or applies bounded local FK after the
 * final waist/hip display mesh. It owns no garment state, collision authority, persistence, IK,
 * deployment, or fit claim.
 */
export async function createMeasurementOpenReferenceFullBodyLocalFkRuntimeV3(options: {
  readonly basis: MakeHumanOpenReferenceBasisV1;
  readonly measurements: CanonicalBodyMeasurementsMm;
  readonly proxyRuntime: MeasurementOpenReferenceUniformWaistHipRuntimeResultV1;
  readonly input: unknown;
  readonly sourceRevision: string;
  readonly loadResources?: () => Promise<MeasurementOpenReferenceDisplayPoseResourcesV1>;
}): Promise<MeasurementOpenReferenceFullBodyLocalFkRuntimeResultV3> {
  const input = validateMakeHumanFullBodyLocalFkPoseV3(options.input);
  const rotations = makeHumanFullBodyLocalFkRotationsV3(input);
  const sourceRevision = boundSourceRevision(validateSourceRevision(options.sourceRevision), input);
  assertHighLevelBinding(options, rotations.length === 0);
  const metadata = MEASUREMENT_OPEN_REFERENCE_DISPLAY_POSE_RUNTIME_METADATA_V1;
  // Snapshot every value read after the optional asynchronous resource boundary. Caller mutation
  // cannot change which shaped mesh or anchor coefficients are posed mid-build.
  const binding = Object.freeze({
    basisKind: options.basis.kind,
    sourceMinimumY: options.basis.sourceMinimumY,
    sourceMaximumY: options.basis.sourceMaximumY,
    heightMm: options.measurements.heightMm,
    displayMesh: snapshotMeasurementSurfaceMeshV1(options.proxyRuntime.displayMesh),
    modeResults: Object.freeze(
      options.proxyRuntime.modeResults.map((result) => Object.freeze({ ...result })),
    ),
  });

  if (rotations.length === 0) {
    return Object.freeze({
      version: MAKEHUMAN_FULL_BODY_LOCAL_FK_RUNTIME_V3,
      input,
      sourceRevision,
      displayMesh: binding.displayMesh,
      maximumJointPivotResidualM: 0,
      source: Object.freeze({
        rigSha256: metadata.rigSha256,
        anchorSha256: metadata.anchorSha256,
        poseResourcesLoaded: false,
      }),
      claims: FK_BYPASSED_CLAIMS,
    });
  }

  const resources = await (options.loadResources ?? loadAuthenticatedFullBodyResourcesV3)();
  const anchors = deriveMakeHumanUniformWaistHipRigAnchorsMResearchV1({
    rigBundle: resources.rig,
    anchorDeltaBundle: resources.anchors,
    basisKind: binding.basisKind,
    sourceMinimumY: binding.sourceMinimumY,
    sourceMaximumY: binding.sourceMaximumY,
    heightMm: binding.heightMm,
    modeResults: binding.modeResults,
  });
  const posed = poseMakeHumanFullBodyLocalFkV3({
    bundle: resources.rig,
    basisKind: binding.basisKind,
    positions: binding.displayMesh.positions,
    heads: anchors.headsM,
    tails: anchors.tailsM,
    rollDirections: anchors.rollDirections,
    pose: input,
  });
  if (
    !Number.isFinite(posed.maximumJointPivotResidual) ||
    posed.maximumJointPivotResidual < 0 ||
    posed.maximumJointPivotResidual > 1e-7
  ) {
    throw new Error('Full-body local FK joint-pivot continuity gate failed.');
  }
  return Object.freeze({
    version: MAKEHUMAN_FULL_BODY_LOCAL_FK_RUNTIME_V3,
    input,
    sourceRevision,
    displayMesh: snapshotMeasurementSurfaceMeshV1({
      ...binding.displayMesh,
      positions: posed.positions,
    }),
    maximumJointPivotResidualM: posed.maximumJointPivotResidual,
    source: Object.freeze({
      rigSha256: metadata.rigSha256,
      anchorSha256: metadata.anchorSha256,
      poseResourcesLoaded: true,
    }),
    claims: FK_APPLIED_CLAIMS,
  });
}
