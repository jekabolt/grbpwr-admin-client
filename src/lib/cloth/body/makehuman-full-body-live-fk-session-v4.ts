import type { MakeHumanCoreRigBasisKindV1 } from './makehuman-core-rig-pose-research-v1';
import {
  createMakeHumanArmSideSeamAssistV1,
  type MakeHumanArmSideSeamAssistResultV1,
} from './makehuman-arm-side-seam-assist-v1';
import {
  poseMakeHumanFullBodyLocalFkV3,
  validateMakeHumanFullBodyLocalFkPoseV3,
  type MakeHumanFullBodyLocalFkPoseV3,
} from './makehuman-full-body-local-fk-runtime-v3';
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

export const MAKEHUMAN_FULL_BODY_LIVE_FK_SESSION_V4 =
  'makehuman-full-body-live-fk-session/v4' as const;

export interface MakeHumanFullBodyLiveFkFrameV4 {
  readonly pose: MakeHumanFullBodyLocalFkPoseV3;
  readonly positions: Float32Array;
  readonly maximumJointPivotResidualM: number;
}

export interface MakeHumanFullBodyLiveFkSessionV4 {
  readonly version: typeof MAKEHUMAN_FULL_BODY_LIVE_FK_SESSION_V4;
  readonly sourceRevision: string;
  readonly basisKind: MakeHumanCoreRigBasisKindV1;
  readonly vertexCount: number;
  readonly indexCount: number;
  readonly sideSeamAssists: Readonly<{
    left: MakeHumanArmSideSeamAssistResultV1;
    right: MakeHumanArmSideSeamAssistResultV1;
  }>;
  readonly solve: (pose: unknown) => MakeHumanFullBodyLiveFkFrameV4;
  readonly claims: {
    readonly displayOnly: true;
    readonly synchronousPoseFrames: true;
    readonly sourceMeshIsImmutable: true;
    readonly inverseKinematicsApplied: false;
    readonly clinicalAnatomicalRangeAuthority: false;
    readonly garmentPairEvaluated: false;
    readonly fitClaimEligible: false;
    readonly runtimeCollisionEligible: false;
  };
}

const CLAIMS = Object.freeze({
  displayOnly: true as const,
  synchronousPoseFrames: true as const,
  sourceMeshIsImmutable: true as const,
  inverseKinematicsApplied: false as const,
  clinicalAnatomicalRangeAuthority: false as const,
  garmentPairEvaluated: false as const,
  fitClaimEligible: false as const,
  runtimeCollisionEligible: false as const,
});

const loadAuthenticatedResourcesV4 = createMakeHumanDisplayPoseResourceLoaderV1();

function sourceRevision(value: string): string {
  if (typeof value !== 'string' || value.length === 0 || value.trim() !== value) {
    throw new RangeError('Live FK sourceRevision must be a non-empty trimmed string.');
  }
  const metadata = MEASUREMENT_OPEN_REFERENCE_DISPLAY_POSE_RUNTIME_METADATA_V1;
  return `${value};liveFkSession=${MAKEHUMAN_FULL_BODY_LIVE_FK_SESSION_V4};displayPoseRigSha256=${metadata.rigSha256};displayPoseAnchorSha256=${metadata.anchorSha256}`;
}

function validateBinding(options: {
  readonly basis: MakeHumanOpenReferenceBasisV1;
  readonly measurements: CanonicalBodyMeasurementsMm;
  readonly proxyRuntime: MeasurementOpenReferenceUniformWaistHipRuntimeResultV1;
  readonly resources: MeasurementOpenReferenceDisplayPoseResourcesV1;
}): void {
  const { basis, measurements, proxyRuntime, resources } = options;
  if (
    basis.kind === 'base' ||
    proxyRuntime.status === 'error' ||
    proxyRuntime.openReference.pose !== 'A' ||
    proxyRuntime.openReference.provenance.basis.kind !== basis.kind ||
    !Number.isFinite(measurements.heightMm) ||
    measurements.heightMm <= 0 ||
    !resources.rig.bases.some(({ kind }) => kind === basis.kind)
  ) {
    throw new Error('Live FK basis, measurements, proxy, or rig binding is invalid.');
  }
  const { positions, indices } = proxyRuntime.displayMesh;
  if (
    !(positions instanceof Float32Array) ||
    !(indices instanceof Uint32Array) ||
    positions.length !== resources.rig.visibleVertexCount * 3 ||
    positions.length !== basis.positionsSourceUnits.length ||
    indices.length !== basis.indices.length ||
    !positions.every(Number.isFinite)
  ) {
    throw new Error('Live FK source mesh topology is invalid.');
  }
  for (let index = 0; index < indices.length; index += 1) {
    if (indices[index] !== basis.indices[index]) {
      throw new Error('Live FK source mesh indices do not match the basis.');
    }
  }
}

/**
 * Loads and binds the authenticated rig once, then exposes synchronous pose solves for animation
 * frames. Every frame starts from the same immutable shaped mesh, so dragging cannot accumulate
 * numerical deformation or mutate the production preview owner.
 */
export async function createMakeHumanFullBodyLiveFkSessionV4(options: {
  readonly basis: MakeHumanOpenReferenceBasisV1;
  readonly measurements: CanonicalBodyMeasurementsMm;
  readonly proxyRuntime: MeasurementOpenReferenceUniformWaistHipRuntimeResultV1;
  readonly sourceRevision: string;
  readonly loadResources?: () => Promise<MeasurementOpenReferenceDisplayPoseResourcesV1>;
}): Promise<MakeHumanFullBodyLiveFkSessionV4> {
  const resources = await (options.loadResources ?? loadAuthenticatedResourcesV4)();
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
  const boundRevision = sourceRevision(options.sourceRevision);
  const sideSeamAssists = Object.freeze({
    left: createMakeHumanArmSideSeamAssistV1({
      bundle: resources.rig,
      basisKind: options.basis.kind,
      heads: anchors.headsM,
      tails: anchors.tailsM,
      rollDirections: anchors.rollDirections,
      side: 'left',
    }),
    right: createMakeHumanArmSideSeamAssistV1({
      bundle: resources.rig,
      basisKind: options.basis.kind,
      heads: anchors.headsM,
      tails: anchors.tailsM,
      rollDirections: anchors.rollDirections,
      side: 'right',
    }),
  });

  const solve = (poseInput: unknown): MakeHumanFullBodyLiveFkFrameV4 => {
    const pose = validateMakeHumanFullBodyLocalFkPoseV3(poseInput);
    const posed = poseMakeHumanFullBodyLocalFkV3({
      bundle: resources.rig,
      basisKind: options.basis.kind,
      positions: sourceMesh.positions,
      heads: anchors.headsM,
      tails: anchors.tailsM,
      rollDirections: anchors.rollDirections,
      pose,
    });
    if (
      posed.positions.length !== sourceMesh.positions.length ||
      !Number.isFinite(posed.maximumJointPivotResidual) ||
      posed.maximumJointPivotResidual < 0 ||
      posed.maximumJointPivotResidual > 1e-7
    ) {
      throw new Error('Live FK frame failed its topology or joint-pivot continuity gate.');
    }
    return Object.freeze({
      pose,
      positions: posed.positions,
      maximumJointPivotResidualM: posed.maximumJointPivotResidual,
    });
  };

  return Object.freeze({
    version: MAKEHUMAN_FULL_BODY_LIVE_FK_SESSION_V4,
    sourceRevision: boundRevision,
    basisKind: options.basis.kind,
    vertexCount: resources.rig.visibleVertexCount,
    indexCount: sourceMesh.indices.length,
    sideSeamAssists,
    solve,
    claims: CLAIMS,
  });
}
