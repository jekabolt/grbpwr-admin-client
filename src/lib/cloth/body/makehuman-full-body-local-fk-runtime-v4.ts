import type {
  MakeHumanCoreRigBasisKindV1,
  MakeHumanCoreRigBundleV1,
} from './makehuman-core-rig-pose-research-v1';
import {
  applyMakeHumanElbowBindNeutralizationV1,
  deriveMakeHumanElbowBindNeutralizationV1,
  type MakeHumanElbowBindNeutralizationV1,
} from './makehuman-elbow-bind-neutralization-v1';
import {
  compileMakeHumanFullBodyPoseV4,
  createNeutralMakeHumanFullBodyPoseV4,
  type MakeHumanFullBodyPoseInputV4,
} from './makehuman-full-body-pose-v4';
import { poseMakeHumanCoreRigPositionsLocalResearchV3 } from './makehuman-local-joint-frame-research-v3';
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
import type { MeasurementSurfaceMeshV1 } from './measurement-watertight-surface-v1';

export const MAKEHUMAN_FULL_BODY_LOCAL_FK_RUNTIME_V4 =
  'makehuman-full-body-local-fk-runtime/v4' as const;

export type MakeHumanFullBodyLocalFkPoseV4 = MakeHumanFullBodyPoseInputV4;

export interface MakeHumanFullBodyLocalFkClaimsV4 {
  readonly displayOnly: true;
  readonly localForwardKinematicsApplied: boolean;
  readonly conservativeUiEnvelopeApplied: true;
  readonly lowerBodyChannelsApplied: true;
  readonly authenticatedNeckChannelsApplied: true;
  readonly clinicalAnatomicalRangeAuthority: false;
  readonly inverseKinematicsApplied: false;
  readonly garmentPairEvaluated: false;
  readonly fitClaimEligible: false;
  readonly runtimeCollisionEligible: false;
  readonly productionAuthority: false;
}

export interface MakeHumanFullBodyLocalFkResultV4 {
  readonly version: typeof MAKEHUMAN_FULL_BODY_LOCAL_FK_RUNTIME_V4;
  readonly basisKind: MakeHumanCoreRigBasisKindV1;
  readonly pose: MakeHumanFullBodyLocalFkPoseV4;
  readonly positions: Float32Array;
  readonly maximumJointPivotResidual: number;
  readonly claims: MakeHumanFullBodyLocalFkClaimsV4;
}

export interface MeasurementOpenReferenceFullBodyLocalFkRuntimeResultV4 {
  readonly version: typeof MAKEHUMAN_FULL_BODY_LOCAL_FK_RUNTIME_V4;
  readonly input: MakeHumanFullBodyLocalFkPoseV4;
  readonly sourceRevision: string;
  readonly displayMesh: MeasurementSurfaceMeshV1;
  readonly maximumJointPivotResidualM: number;
  readonly source: Readonly<{
    rigSha256: string;
    anchorSha256: string;
    poseResourcesLoaded: boolean;
  }>;
  readonly claims: MakeHumanFullBodyLocalFkClaimsV4;
}

const FK_APPLIED_CLAIMS = Object.freeze({
  displayOnly: true as const,
  localForwardKinematicsApplied: true as const,
  conservativeUiEnvelopeApplied: true as const,
  lowerBodyChannelsApplied: true as const,
  authenticatedNeckChannelsApplied: true as const,
  clinicalAnatomicalRangeAuthority: false as const,
  inverseKinematicsApplied: false as const,
  garmentPairEvaluated: false as const,
  fitClaimEligible: false as const,
  runtimeCollisionEligible: false as const,
  productionAuthority: false as const,
});
const loadAuthenticatedResourcesV4 = createMakeHumanDisplayPoseResourceLoaderV1();

export function validateMakeHumanFullBodyLocalFkPoseV4(value: unknown) {
  return compileMakeHumanFullBodyPoseV4(value).input;
}

export { createNeutralMakeHumanFullBodyPoseV4 as createNeutralMakeHumanFullBodyLocalFkPoseV4 };

export function makeHumanFullBodyLocalFkRotationsV4(
  value: unknown,
  basisKind?: MakeHumanCoreRigBasisKindV1,
  elbowNeutralization?: MakeHumanElbowBindNeutralizationV1,
) {
  const rotations = compileMakeHumanFullBodyPoseV4(value, {
    basisKind: basisKind === 'base' ? 'neutral' : basisKind,
  }).rotations;
  return elbowNeutralization
    ? applyMakeHumanElbowBindNeutralizationV1(rotations, elbowNeutralization)
    : rotations;
}

/** Low-level evaluator for an already-shaped mesh and matching authenticated rig anchors. */
export function poseMakeHumanFullBodyLocalFkV4(options: {
  readonly bundle: MakeHumanCoreRigBundleV1;
  readonly basisKind: MakeHumanCoreRigBasisKindV1;
  readonly positions: Float32Array;
  readonly heads: Float32Array;
  readonly tails: Float32Array;
  readonly rollDirections: Float32Array;
  readonly pose: unknown;
  readonly elbowNeutralization?: MakeHumanElbowBindNeutralizationV1;
}): MakeHumanFullBodyLocalFkResultV4 {
  const compiled = compileMakeHumanFullBodyPoseV4(options.pose, {
    basisKind: options.basisKind === 'base' ? 'neutral' : options.basisKind,
  });
  const result = poseMakeHumanCoreRigPositionsLocalResearchV3({
    bundle: options.bundle,
    basisKind: options.basisKind,
    positions: options.positions,
    heads: options.heads,
    tails: options.tails,
    rollDirections: options.rollDirections,
    rotations: options.elbowNeutralization
      ? applyMakeHumanElbowBindNeutralizationV1(compiled.rotations, options.elbowNeutralization)
      : compiled.rotations,
  });
  return Object.freeze({
    version: MAKEHUMAN_FULL_BODY_LOCAL_FK_RUNTIME_V4,
    basisKind: options.basisKind,
    pose: compiled.input,
    positions: result.positions,
    maximumJointPivotResidual: result.maximumJointPivotResidual,
    claims: FK_APPLIED_CLAIMS,
  });
}

function exactSourceRevision(value: string): string {
  if (typeof value !== 'string' || value.length === 0 || value.trim() !== value) {
    throw new RangeError('sourceRevision must be a non-empty trimmed string.');
  }
  return value;
}

function exactFallback(proxyRuntime: MeasurementOpenReferenceUniformWaistHipRuntimeResultV1) {
  const positions = proxyRuntime.displayMesh.positions;
  const indices = proxyRuntime.displayMesh.indices;
  const fallback = proxyRuntime.openReference.mesh;
  return (
    proxyRuntime.representedGeometricProxies.length === 0 &&
    proxyRuntime.modeResults.length === 0 &&
    positions.length === fallback.positions.length &&
    indices.length === fallback.indices.length &&
    positions.every((value, index) => value === fallback.positions[index]) &&
    indices.every((value, index) => value === fallback.indices[index])
  );
}

function validateBinding(options: {
  readonly basis: MakeHumanOpenReferenceBasisV1;
  readonly measurements: CanonicalBodyMeasurementsMm;
  readonly proxyRuntime: MeasurementOpenReferenceUniformWaistHipRuntimeResultV1;
  readonly rotationCount: number;
}) {
  const { basis, measurements, proxyRuntime } = options;
  const { positions, indices } = proxyRuntime.displayMesh;
  if (
    basis.kind === 'base' ||
    proxyRuntime.openReference.pose !== 'A' ||
    proxyRuntime.openReference.provenance.basis.kind !== basis.kind ||
    !Number.isFinite(measurements.heightMm) ||
    measurements.heightMm <= 0 ||
    !(positions instanceof Float32Array) ||
    !(indices instanceof Uint32Array) ||
    positions.length !== basis.positionsSourceUnits.length ||
    indices.length !== basis.indices.length ||
    !positions.every(Number.isFinite)
  ) {
    throw new Error('Full-body V4 FK basis, measurements, or proxy binding is invalid.');
  }
  for (let index = 0; index < indices.length; index += 1) {
    if (indices[index] !== basis.indices[index]) {
      throw new Error('Full-body V4 FK indices do not match the basis.');
    }
  }
  if (
    proxyRuntime.status === 'error' &&
    (options.rotationCount !== 0 || !exactFallback(proxyRuntime))
  ) {
    throw new Error('Full-body V4 FK proxy fallback is invalid for the requested pose.');
  }
}

function boundRevision(sourceRevision: string, pose: MakeHumanFullBodyLocalFkPoseV4) {
  const metadata = MEASUREMENT_OPEN_REFERENCE_DISPLAY_POSE_RUNTIME_METADATA_V1;
  return `${exactSourceRevision(sourceRevision)};fullBodyLocalFkRuntime=${MAKEHUMAN_FULL_BODY_LOCAL_FK_RUNTIME_V4};runtimePose=${encodeURIComponent(JSON.stringify(pose))};displayPoseRigSha256=${metadata.rigSha256};displayPoseAnchorSha256=${metadata.anchorSha256}`;
}

/** High-level V4 display runtime. Persistence, collision, and fit claims stay out of scope. */
export async function createMeasurementOpenReferenceFullBodyLocalFkRuntimeV4(options: {
  readonly basis: MakeHumanOpenReferenceBasisV1;
  readonly measurements: CanonicalBodyMeasurementsMm;
  readonly proxyRuntime: MeasurementOpenReferenceUniformWaistHipRuntimeResultV1;
  readonly input: unknown;
  readonly sourceRevision: string;
  readonly loadResources?: () => Promise<MeasurementOpenReferenceDisplayPoseResourcesV1>;
}): Promise<MeasurementOpenReferenceFullBodyLocalFkRuntimeResultV4> {
  const compiled = compileMakeHumanFullBodyPoseV4(options.input);
  validateBinding({ ...options, rotationCount: compiled.rotations.length });
  const metadata = MEASUREMENT_OPEN_REFERENCE_DISPLAY_POSE_RUNTIME_METADATA_V1;
  const sourceRevision = boundRevision(options.sourceRevision, compiled.input);
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
  const resources = await (options.loadResources ?? loadAuthenticatedResourcesV4)();
  const anchors = deriveMakeHumanUniformWaistHipRigAnchorsMResearchV1({
    rigBundle: resources.rig,
    anchorDeltaBundle: resources.anchors,
    basisKind: binding.basisKind,
    sourceMinimumY: binding.sourceMinimumY,
    sourceMaximumY: binding.sourceMaximumY,
    heightMm: binding.heightMm,
    modeResults: binding.modeResults,
  });
  const coherentAnchors = applyMakeHuman2ArmLengthProxyToRigAnchorsMResearchV1({
    armProxy: options.proxyRuntime.poseCompatibleArmLengthProxy,
    rigBundle: resources.rig,
    basisKind: binding.basisKind,
    headsM: anchors.headsM,
    tailsM: anchors.tailsM,
    rollDirections: anchors.rollDirections,
  });
  const elbowNeutralization = deriveMakeHumanElbowBindNeutralizationV1({
    bundle: resources.rig,
    basisKind: binding.basisKind,
    heads: coherentAnchors.headsM,
    tails: coherentAnchors.tailsM,
    rollDirections: coherentAnchors.rollDirections,
    rigSha256: metadata.rigSha256,
  });
  const posed = poseMakeHumanFullBodyLocalFkV4({
    bundle: resources.rig,
    basisKind: binding.basisKind,
    positions: binding.displayMesh.positions,
    heads: coherentAnchors.headsM,
    tails: coherentAnchors.tailsM,
    rollDirections: coherentAnchors.rollDirections,
    pose: compiled.input,
    elbowNeutralization,
  });
  if (
    !Number.isFinite(posed.maximumJointPivotResidual) ||
    posed.maximumJointPivotResidual < 0 ||
    posed.maximumJointPivotResidual > 1e-7
  ) {
    throw new Error('Full-body V4 FK joint-pivot continuity gate failed.');
  }
  return Object.freeze({
    version: MAKEHUMAN_FULL_BODY_LOCAL_FK_RUNTIME_V4,
    input: compiled.input,
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
