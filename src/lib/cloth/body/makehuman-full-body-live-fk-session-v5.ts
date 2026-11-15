import type { MakeHumanCoreRigBasisKindV1 } from './makehuman-core-rig-pose-research-v1';
import {
  createMakeHumanArmSideSeamAssistV1,
  type MakeHumanArmSideSeamAssistResultV1,
} from './makehuman-arm-side-seam-assist-v1';
import {
  createNeutralMakeHumanFullBodyLocalFkPoseV4,
  makeHumanFullBodyLocalFkRotationsV4,
  poseMakeHumanFullBodyLocalFkV4,
  validateMakeHumanFullBodyLocalFkPoseV4,
  type MakeHumanFullBodyLocalFkPoseV4,
} from './makehuman-full-body-local-fk-runtime-v4';
import {
  poseMakeHumanCoreRigDisplayOverlayLocalResearchV4,
  type MakeHumanPosedLocalBoneOverlayV4,
} from './makehuman-local-joint-frame-research-v3';
import { deriveMakeHumanUniformWaistHipRigAnchorsMResearchV1 } from './makehuman-waist-hip-rig-anchor-research-v1';
import { applyMakeHuman2ArmLengthProxyToRigAnchorsMResearchV1 } from './makehuman2-pose-compatible-length-runtime-v1';
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

export const MAKEHUMAN_FULL_BODY_LIVE_FK_SESSION_V5 =
  'makehuman-full-body-live-fk-session/v5' as const;

export interface MakeHumanFullBodyLiveFkFrameV5 {
  readonly pose: MakeHumanFullBodyLocalFkPoseV4;
  readonly positions: Float32Array;
  readonly jointOverlay: readonly MakeHumanPosedLocalBoneOverlayV4[];
  readonly maximumJointPivotResidualM: number;
}

export interface MakeHumanFullBodyLiveFkSessionV5 {
  readonly version: typeof MAKEHUMAN_FULL_BODY_LIVE_FK_SESSION_V5;
  readonly sourceRevision: string;
  readonly basisKind: MakeHumanCoreRigBasisKindV1;
  readonly vertexCount: number;
  readonly indexCount: number;
  readonly groundReferenceM: number;
  readonly baselineAnklesM: Readonly<{
    left: MakeHumanPosedLocalBoneOverlayV4['headM'];
    right: MakeHumanPosedLocalBoneOverlayV4['headM'];
  }>;
  readonly neutralJointOverlay: readonly MakeHumanPosedLocalBoneOverlayV4[];
  readonly sideSeamAssists: Readonly<{
    left: MakeHumanArmSideSeamAssistResultV1;
    right: MakeHumanArmSideSeamAssistResultV1;
  }>;
  readonly solve: (pose: unknown) => MakeHumanFullBodyLiveFkFrameV5;
  readonly claims: typeof CLAIMS;
}

const CLAIMS = Object.freeze({
  displayOnly: true as const,
  synchronousPoseFrames: true as const,
  sourceMeshIsImmutable: true as const,
  lowerBodyChannelsApplied: true as const,
  authenticatedNeckChannelsApplied: true as const,
  inverseKinematicsApplied: false as const,
  clinicalAnatomicalRangeAuthority: false as const,
  garmentPairEvaluated: false as const,
  fitClaimEligible: false as const,
  runtimeCollisionEligible: false as const,
});
const loadAuthenticatedResourcesV5 = createMakeHumanDisplayPoseResourceLoaderV1();

function boundRevision(value: string): string {
  if (typeof value !== 'string' || value.length === 0 || value.trim() !== value) {
    throw new RangeError('Live FK V5 sourceRevision must be a non-empty trimmed string.');
  }
  const metadata = MEASUREMENT_OPEN_REFERENCE_DISPLAY_POSE_RUNTIME_METADATA_V1;
  return `${value};liveFkSession=${MAKEHUMAN_FULL_BODY_LIVE_FK_SESSION_V5};displayPoseRigSha256=${metadata.rigSha256};displayPoseAnchorSha256=${metadata.anchorSha256}`;
}

function validateBinding(options: {
  readonly basis: MakeHumanOpenReferenceBasisV1;
  readonly measurements: CanonicalBodyMeasurementsMm;
  readonly proxyRuntime: MeasurementOpenReferenceUniformWaistHipRuntimeResultV1;
  readonly resources: MeasurementOpenReferenceDisplayPoseResourcesV1;
}) {
  const { basis, measurements, proxyRuntime, resources } = options;
  const { positions, indices } = proxyRuntime.displayMesh;
  if (
    basis.kind === 'base' ||
    proxyRuntime.status === 'error' ||
    proxyRuntime.openReference.pose !== 'A' ||
    proxyRuntime.openReference.provenance.basis.kind !== basis.kind ||
    !Number.isFinite(measurements.heightMm) ||
    measurements.heightMm <= 0 ||
    !resources.rig.bases.some(({ kind }) => kind === basis.kind) ||
    !(positions instanceof Float32Array) ||
    !(indices instanceof Uint32Array) ||
    positions.length !== resources.rig.visibleVertexCount * 3 ||
    positions.length !== basis.positionsSourceUnits.length ||
    indices.length !== basis.indices.length ||
    !positions.every(Number.isFinite)
  ) {
    throw new Error('Live FK V5 basis, measurements, proxy, or rig binding is invalid.');
  }
  for (let index = 0; index < indices.length; index += 1) {
    if (indices[index] !== basis.indices[index]) {
      throw new Error('Live FK V5 source mesh indices do not match the basis.');
    }
  }
}

/** Authenticated, immutable-source live FK session for the extended V4 pose schema. */
export async function createMakeHumanFullBodyLiveFkSessionV5(options: {
  readonly basis: MakeHumanOpenReferenceBasisV1;
  readonly measurements: CanonicalBodyMeasurementsMm;
  readonly proxyRuntime: MeasurementOpenReferenceUniformWaistHipRuntimeResultV1;
  readonly sourceRevision: string;
  readonly loadResources?: () => Promise<MeasurementOpenReferenceDisplayPoseResourcesV1>;
}): Promise<MakeHumanFullBodyLiveFkSessionV5> {
  const resources = await (options.loadResources ?? loadAuthenticatedResourcesV5)();
  validateBinding({ ...options, resources });
  const sourceMesh = snapshotMeasurementSurfaceMeshV1(options.proxyRuntime.displayMesh);
  const anchors = deriveMakeHumanUniformWaistHipRigAnchorsMResearchV1({
    rigBundle: resources.rig,
    anchorDeltaBundle: resources.anchors,
    basisKind: options.basis.kind,
    sourceMinimumY: options.basis.sourceMinimumY,
    sourceMaximumY: options.basis.sourceMaximumY,
    heightMm: options.measurements.heightMm,
    modeResults: Object.freeze(
      options.proxyRuntime.modeResults.map((result) => Object.freeze({ ...result })),
    ),
  });
  const coherentAnchors = applyMakeHuman2ArmLengthProxyToRigAnchorsMResearchV1({
    armProxy: options.proxyRuntime.poseCompatibleArmLengthProxy,
    rigBundle: resources.rig,
    basisKind: options.basis.kind,
    headsM: anchors.headsM,
    tailsM: anchors.tailsM,
    rollDirections: anchors.rollDirections,
  });
  const sourceRevision = boundRevision(options.sourceRevision);
  const sideSeamAssists = Object.freeze({
    left: createMakeHumanArmSideSeamAssistV1({
      bundle: resources.rig,
      basisKind: options.basis.kind,
      heads: coherentAnchors.headsM,
      tails: coherentAnchors.tailsM,
      rollDirections: coherentAnchors.rollDirections,
      side: 'left',
      minimumOuterHipClearanceRatio: options.proxyRuntime.poseCompatibleArmLengthProxy
        ? 0.1
        : undefined,
      maximumVerticalErrorRatio: options.proxyRuntime.poseCompatibleArmLengthProxy
        ? 0.25
        : undefined,
    }),
    right: createMakeHumanArmSideSeamAssistV1({
      bundle: resources.rig,
      basisKind: options.basis.kind,
      heads: coherentAnchors.headsM,
      tails: coherentAnchors.tailsM,
      rollDirections: coherentAnchors.rollDirections,
      side: 'right',
      minimumOuterHipClearanceRatio: options.proxyRuntime.poseCompatibleArmLengthProxy
        ? 0.1
        : undefined,
      maximumVerticalErrorRatio: options.proxyRuntime.poseCompatibleArmLengthProxy
        ? 0.25
        : undefined,
    }),
  });
  const neutralOverlay = poseMakeHumanCoreRigDisplayOverlayLocalResearchV4({
    bundle: resources.rig,
    basisKind: options.basis.kind,
    heads: coherentAnchors.headsM,
    tails: coherentAnchors.tailsM,
    rollDirections: coherentAnchors.rollDirections,
    rotations: makeHumanFullBodyLocalFkRotationsV4(
      createNeutralMakeHumanFullBodyLocalFkPoseV4(),
      options.basis.kind,
    ),
  });
  const neutralFeet = neutralOverlay.bones.filter(
    ({ bone }) => bone === 'foot.L' || bone === 'foot.R',
  );
  if (neutralFeet.length !== 2) {
    throw new Error('Live FK V5 requires authenticated left and right foot ground anchors.');
  }
  const groundReferenceM = Math.min(
    ...neutralFeet.flatMap(({ headM, tailM }) => [headM[1], tailM[1]]),
  );
  const leftNeutralFoot = neutralFeet.find(({ bone }) => bone === 'foot.L')!;
  const rightNeutralFoot = neutralFeet.find(({ bone }) => bone === 'foot.R')!;
  const baselineAnklesM = Object.freeze({
    left: leftNeutralFoot.headM,
    right: rightNeutralFoot.headM,
  });

  const solve = (poseInput: unknown): MakeHumanFullBodyLiveFkFrameV5 => {
    const pose = validateMakeHumanFullBodyLocalFkPoseV4(poseInput);
    const jointOverlay = poseMakeHumanCoreRigDisplayOverlayLocalResearchV4({
      bundle: resources.rig,
      basisKind: options.basis.kind,
      heads: coherentAnchors.headsM,
      tails: coherentAnchors.tailsM,
      rollDirections: coherentAnchors.rollDirections,
      rotations: makeHumanFullBodyLocalFkRotationsV4(pose, options.basis.kind),
    });
    const posed = poseMakeHumanFullBodyLocalFkV4({
      bundle: resources.rig,
      basisKind: options.basis.kind,
      positions: sourceMesh.positions,
      heads: coherentAnchors.headsM,
      tails: coherentAnchors.tailsM,
      rollDirections: coherentAnchors.rollDirections,
      pose,
    });
    if (
      posed.positions.length !== sourceMesh.positions.length ||
      !Number.isFinite(posed.maximumJointPivotResidual) ||
      posed.maximumJointPivotResidual < 0 ||
      posed.maximumJointPivotResidual > 1e-7
    ) {
      throw new Error('Live FK V5 frame failed its topology or joint-pivot continuity gate.');
    }
    return Object.freeze({
      pose,
      positions: posed.positions,
      jointOverlay: jointOverlay.bones,
      maximumJointPivotResidualM: posed.maximumJointPivotResidual,
    });
  };

  return Object.freeze({
    version: MAKEHUMAN_FULL_BODY_LIVE_FK_SESSION_V5,
    sourceRevision,
    basisKind: options.basis.kind,
    vertexCount: resources.rig.visibleVertexCount,
    indexCount: sourceMesh.indices.length,
    groundReferenceM,
    baselineAnklesM,
    neutralJointOverlay: neutralOverlay.bones,
    sideSeamAssists,
    solve,
    claims: CLAIMS,
  });
}
