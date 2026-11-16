import {
  makeHumanFullBodyJointOverlayMeasurementFingerprintV4,
  MAKEHUMAN_FULL_BODY_JOINT_OVERLAY_GROUPS_V4,
  type MakeHumanFullBodyJointOverlayAxisV4,
  type MakeHumanFullBodyJointOverlayContributionV4,
  type MakeHumanFullBodyJointOverlayRotationComponentV4,
} from './makehuman-full-body-joint-overlay-runtime-v4';
import { deriveMakeHumanElbowBindNeutralizationV1 } from './makehuman-elbow-bind-neutralization-v1';
import {
  makeHumanFullBodyLocalFkRotationsV4,
  validateMakeHumanFullBodyLocalFkPoseV4,
  type MakeHumanFullBodyLocalFkPoseV4,
} from './makehuman-full-body-local-fk-runtime-v4';
import {
  poseMakeHumanCoreRigDisplayOverlayLocalResearchV4,
  type MakeHumanLocalJointMatrix3V3,
  type MakeHumanLocalJointVec3V3,
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
import type { MakeHumanOpenReferenceBasisV1 } from './measurement-open-reference-display-v1';
import type { MeasurementOpenReferenceUniformWaistHipRuntimeResultV1 } from './measurement-open-reference-uniform-waist-hip-runtime-v1';

export const MAKEHUMAN_FULL_BODY_JOINT_OVERLAY_RUNTIME_V5 =
  'makehuman-full-body-joint-overlay-runtime/v5' as const;

export type MakeHumanFullBodyJointOverlayGroupIdV5 =
  | (typeof MAKEHUMAN_FULL_BODY_JOINT_OVERLAY_GROUPS_V4)[number]['id']
  | 'head-group'
  | 'left-hip-group'
  | 'right-hip-group'
  | 'left-knee'
  | 'right-knee'
  | 'left-ankle'
  | 'right-ankle';

export type MakeHumanFullBodyJointOverlayChannelV5 =
  | (typeof MAKEHUMAN_FULL_BODY_JOINT_OVERLAY_GROUPS_V4)[number]['channelDescriptors'][number]['channel']
  | 'headPitchDeg'
  | 'headYawDeg'
  | 'headSideDeg'
  | 'hipForwardDeg'
  | 'hipSideDeg'
  | 'kneeBendDeg'
  | 'ankleBendDeg';

export interface MakeHumanFullBodyJointOverlayChannelDescriptorV5 {
  readonly channel: MakeHumanFullBodyJointOverlayChannelV5;
  readonly axis: MakeHumanFullBodyJointOverlayAxisV4;
  readonly sideMirrorSign: -1 | 1;
  readonly contributions: readonly MakeHumanFullBodyJointOverlayContributionV4[];
}

interface MakeHumanFullBodyJointOverlayGroupDefinitionV5 {
  readonly id: MakeHumanFullBodyJointOverlayGroupIdV5;
  readonly label: string;
  readonly side: 'center' | 'left' | 'right';
  readonly markerBone: string;
  readonly sourceBones: readonly string[];
  readonly allowedAxes: readonly MakeHumanFullBodyJointOverlayAxisV4[];
  readonly channelDescriptors: readonly MakeHumanFullBodyJointOverlayChannelDescriptorV5[];
}

function contribution(
  bone: string,
  component: MakeHumanFullBodyJointOverlayRotationComponentV4,
  weight: number,
): MakeHumanFullBodyJointOverlayContributionV4 {
  return Object.freeze({ bone, component, weight });
}

function descriptor(options: {
  channel: MakeHumanFullBodyJointOverlayChannelV5;
  axis: MakeHumanFullBodyJointOverlayAxisV4;
  sideMirrorSign: -1 | 1;
  contributions: readonly MakeHumanFullBodyJointOverlayContributionV4[];
}): MakeHumanFullBodyJointOverlayChannelDescriptorV5 {
  return Object.freeze({ ...options, contributions: Object.freeze([...options.contributions]) });
}

function group(options: {
  id: MakeHumanFullBodyJointOverlayGroupIdV5;
  label: string;
  side: 'center' | 'left' | 'right';
  markerBone: string;
  channelDescriptors: readonly MakeHumanFullBodyJointOverlayChannelDescriptorV5[];
}): MakeHumanFullBodyJointOverlayGroupDefinitionV5 {
  return Object.freeze({
    ...options,
    sourceBones: Object.freeze([
      ...new Set(
        options.channelDescriptors.flatMap(({ contributions }) =>
          contributions.map(({ bone }) => bone),
        ),
      ),
    ]),
    allowedAxes: Object.freeze([...new Set(options.channelDescriptors.map(({ axis }) => axis))]),
    channelDescriptors: Object.freeze([...options.channelDescriptors]),
  });
}

const LEGACY_GROUPS_V5: readonly MakeHumanFullBodyJointOverlayGroupDefinitionV5[] =
  MAKEHUMAN_FULL_BODY_JOINT_OVERLAY_GROUPS_V4.map((legacy) =>
    Object.freeze({
      ...legacy,
      channelDescriptors: Object.freeze(
        legacy.channelDescriptors.map((channel) =>
          Object.freeze({
            ...channel,
            contributions: Object.freeze([...channel.contributions]),
          }),
        ),
      ),
    }),
  );

const HEAD_DISTRIBUTION = Object.freeze([
  Object.freeze({ bone: 'neck01', weight: 0.35 }),
  Object.freeze({ bone: 'neck02', weight: 0.4 }),
  Object.freeze({ bone: 'neck03', weight: 0.25 }),
] as const);

function headContributions(component: MakeHumanFullBodyJointOverlayRotationComponentV4) {
  return HEAD_DISTRIBUTION.map(({ bone, weight }) => contribution(bone, component, weight));
}

export const MAKEHUMAN_FULL_BODY_JOINT_OVERLAY_GROUPS_V5 = Object.freeze([
  ...LEGACY_GROUPS_V5,
  group({
    id: 'head-group',
    label: 'head / neck group',
    side: 'center',
    markerBone: 'head',
    channelDescriptors: Object.freeze([
      descriptor({
        channel: 'headPitchDeg',
        axis: 'x',
        sideMirrorSign: 1,
        contributions: headContributions('transverseXBendDeg'),
      }),
      descriptor({
        channel: 'headYawDeg',
        axis: 'y',
        sideMirrorSign: 1,
        contributions: headContributions('longitudinalTwistDeg'),
      }),
      descriptor({
        channel: 'headSideDeg',
        axis: 'z',
        sideMirrorSign: 1,
        contributions: headContributions('transverseZBendDeg'),
      }),
    ]),
  }),
  group({
    id: 'left-hip-group',
    label: 'left hip / upper-leg group',
    side: 'left',
    markerBone: 'upperleg01.L',
    channelDescriptors: Object.freeze([
      descriptor({
        channel: 'hipForwardDeg',
        axis: 'z',
        sideMirrorSign: 1,
        contributions: Object.freeze([contribution('upperleg01.L', 'transverseZBendDeg', -1)]),
      }),
      descriptor({
        channel: 'hipSideDeg',
        axis: 'x',
        sideMirrorSign: -1,
        contributions: Object.freeze([contribution('upperleg01.L', 'transverseXBendDeg', -1)]),
      }),
    ]),
  }),
  group({
    id: 'right-hip-group',
    label: 'right hip / upper-leg group',
    side: 'right',
    markerBone: 'upperleg01.R',
    channelDescriptors: Object.freeze([
      descriptor({
        channel: 'hipForwardDeg',
        axis: 'z',
        sideMirrorSign: 1,
        contributions: Object.freeze([contribution('upperleg01.R', 'transverseZBendDeg', -1)]),
      }),
      descriptor({
        channel: 'hipSideDeg',
        axis: 'x',
        sideMirrorSign: -1,
        contributions: Object.freeze([contribution('upperleg01.R', 'transverseXBendDeg', 1)]),
      }),
    ]),
  }),
  group({
    id: 'left-knee',
    label: 'left knee',
    side: 'left',
    markerBone: 'lowerleg01.L',
    channelDescriptors: Object.freeze([
      descriptor({
        channel: 'kneeBendDeg',
        axis: 'z',
        sideMirrorSign: 1,
        contributions: Object.freeze([contribution('lowerleg01.L', 'transverseZBendDeg', 1)]),
      }),
    ]),
  }),
  group({
    id: 'right-knee',
    label: 'right knee',
    side: 'right',
    markerBone: 'lowerleg01.R',
    channelDescriptors: Object.freeze([
      descriptor({
        channel: 'kneeBendDeg',
        axis: 'z',
        sideMirrorSign: 1,
        contributions: Object.freeze([contribution('lowerleg01.R', 'transverseZBendDeg', 1)]),
      }),
    ]),
  }),
  group({
    id: 'left-ankle',
    label: 'left ankle',
    side: 'left',
    markerBone: 'foot.L',
    channelDescriptors: Object.freeze([
      descriptor({
        channel: 'ankleBendDeg',
        axis: 'z',
        sideMirrorSign: 1,
        contributions: Object.freeze([contribution('foot.L', 'transverseZBendDeg', 1)]),
      }),
    ]),
  }),
  group({
    id: 'right-ankle',
    label: 'right ankle',
    side: 'right',
    markerBone: 'foot.R',
    channelDescriptors: Object.freeze([
      descriptor({
        channel: 'ankleBendDeg',
        axis: 'z',
        sideMirrorSign: 1,
        contributions: Object.freeze([contribution('foot.R', 'transverseZBendDeg', 1)]),
      }),
    ]),
  }),
] as const);

export interface MakeHumanFullBodyJointOverlayGroupV5
  extends MakeHumanFullBodyJointOverlayGroupDefinitionV5 {
  readonly headM: MakeHumanLocalJointVec3V3;
  readonly tailM: MakeHumanLocalJointVec3V3;
  readonly localToWorld: MakeHumanLocalJointMatrix3V3;
  readonly localAxes: Readonly<{
    x: MakeHumanLocalJointVec3V3;
    y: MakeHumanLocalJointVec3V3;
    z: MakeHumanLocalJointVec3V3;
  }>;
}

interface MakeHumanFullBodyJointOverlayBindingV5 {
  readonly basisKind: Exclude<MakeHumanOpenReferenceBasisV1['kind'], 'base'>;
  readonly measurementFingerprint: string;
  readonly bodySourceRevision: string;
  readonly rigSha256: string;
  readonly anchorSha256: string;
  readonly pose: MakeHumanFullBodyLocalFkPoseV4;
}

interface MakeHumanFullBodyJointOverlayClaimsV5 {
  readonly optionalEditorOverlay: true;
  readonly bodyDisplayUsableWithoutOverlay: true;
  readonly displayOnly: true;
  readonly authenticatedLowerBodyAndNeckBones: true;
  readonly inverseKinematicsApplied: false;
  readonly garmentPairEvaluated: false;
  readonly fitClaimEligible: false;
  readonly runtimeCollisionEligible: false;
  readonly productionAuthority: false;
}

export interface MakeHumanFullBodyJointOverlayReadyV5 {
  readonly version: typeof MAKEHUMAN_FULL_BODY_JOINT_OVERLAY_RUNTIME_V5;
  readonly status: 'ready';
  readonly sourceRevision: string;
  readonly binding: MakeHumanFullBodyJointOverlayBindingV5;
  readonly groups: readonly MakeHumanFullBodyJointOverlayGroupV5[];
  readonly maximumJointPivotResidualM: number;
  readonly source: Readonly<{
    rigSha256: string;
    anchorSha256: string;
    resourcesAuthenticated: true;
  }>;
  readonly claims: MakeHumanFullBodyJointOverlayClaimsV5;
}

export interface MakeHumanFullBodyJointOverlayUnavailableV5 {
  readonly version: typeof MAKEHUMAN_FULL_BODY_JOINT_OVERLAY_RUNTIME_V5;
  readonly status: 'unavailable';
  readonly sourceRevision: string;
  readonly binding: MakeHumanFullBodyJointOverlayBindingV5;
  readonly groups: readonly [];
  readonly maximumJointPivotResidualM: null;
  readonly source: Readonly<{
    rigSha256: string;
    anchorSha256: string;
    resourcesAuthenticated: boolean;
  }>;
  readonly error: Readonly<{
    code: 'overlay-evaluation-failed' | 'pose-resources-unavailable';
    message: string;
  }>;
  readonly claims: MakeHumanFullBodyJointOverlayClaimsV5;
}

export type MakeHumanFullBodyJointOverlayRuntimeResultV5 =
  | MakeHumanFullBodyJointOverlayReadyV5
  | MakeHumanFullBodyJointOverlayUnavailableV5;

const CLAIMS: MakeHumanFullBodyJointOverlayClaimsV5 = Object.freeze({
  optionalEditorOverlay: true,
  bodyDisplayUsableWithoutOverlay: true,
  displayOnly: true,
  authenticatedLowerBodyAndNeckBones: true,
  inverseKinematicsApplied: false,
  garmentPairEvaluated: false,
  fitClaimEligible: false,
  runtimeCollisionEligible: false,
  productionAuthority: false,
});
const EMPTY_GROUPS = Object.freeze([]) as readonly [];
const loadAuthenticatedResourcesV5 = createMakeHumanDisplayPoseResourceLoaderV1();

export function makeHumanFullBodyJointOverlayMeasurementFingerprintV5(
  measurements: CanonicalBodyMeasurementsMm,
) {
  return makeHumanFullBodyJointOverlayMeasurementFingerprintV4(measurements);
}

function exactString(value: string, label: string) {
  if (typeof value !== 'string' || value.length === 0 || value.trim() !== value) {
    throw new RangeError(`${label} must be a non-empty trimmed string.`);
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
  basis: MakeHumanOpenReferenceBasisV1;
  measurements: CanonicalBodyMeasurementsMm;
  proxyRuntime: MeasurementOpenReferenceUniformWaistHipRuntimeResultV1;
  rotationCount: number;
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
    throw new Error('Joint overlay V5 binding is invalid.');
  }
  for (let index = 0; index < indices.length; index += 1) {
    if (indices[index] !== basis.indices[index]) {
      throw new Error('Joint overlay V5 indices do not match the basis.');
    }
  }
  if (
    proxyRuntime.status === 'error' &&
    (options.rotationCount !== 0 || !exactFallback(proxyRuntime))
  ) {
    throw new Error('Joint overlay V5 fallback is invalid for the requested pose.');
  }
}

function vector(value: MakeHumanLocalJointVec3V3): MakeHumanLocalJointVec3V3 {
  return Object.freeze([value[0], value[1], value[2]] as const);
}

export function makeHumanFullBodyJointOverlayGroupsFromBonesV5(
  bones: readonly MakeHumanPosedLocalBoneOverlayV4[],
): readonly MakeHumanFullBodyJointOverlayGroupV5[] {
  const byName = new Map(bones.map((bone) => [bone.bone, bone]));
  return Object.freeze(
    MAKEHUMAN_FULL_BODY_JOINT_OVERLAY_GROUPS_V5.map((definition) => {
      const marker = byName.get(definition.markerBone);
      if (!marker) throw new Error(`Joint overlay V5 marker ${definition.markerBone} is missing.`);
      for (const sourceBone of definition.sourceBones) {
        if (!byName.has(sourceBone)) {
          throw new Error(`Joint overlay V5 source bone ${sourceBone} is missing.`);
        }
      }
      return Object.freeze({
        ...definition,
        headM: vector(marker.headM),
        tailM: vector(marker.tailM),
        localToWorld: Object.freeze([...marker.localToWorld]) as MakeHumanLocalJointMatrix3V3,
        localAxes: Object.freeze({
          x: Object.freeze([
            marker.localToWorld[0],
            marker.localToWorld[3],
            marker.localToWorld[6],
          ] as const),
          y: Object.freeze([
            marker.localToWorld[1],
            marker.localToWorld[4],
            marker.localToWorld[7],
          ] as const),
          z: Object.freeze([
            marker.localToWorld[2],
            marker.localToWorld[5],
            marker.localToWorld[8],
          ] as const),
        }),
      });
    }),
  );
}

function unavailable(options: {
  sourceRevision: string;
  binding: MakeHumanFullBodyJointOverlayBindingV5;
  code: MakeHumanFullBodyJointOverlayUnavailableV5['error']['code'];
  resourcesAuthenticated: boolean;
  reason: unknown;
}): MakeHumanFullBodyJointOverlayUnavailableV5 {
  const metadata = MEASUREMENT_OPEN_REFERENCE_DISPLAY_POSE_RUNTIME_METADATA_V1;
  return Object.freeze({
    version: MAKEHUMAN_FULL_BODY_JOINT_OVERLAY_RUNTIME_V5,
    status: 'unavailable',
    sourceRevision: options.sourceRevision,
    binding: options.binding,
    groups: EMPTY_GROUPS,
    maximumJointPivotResidualM: null,
    source: Object.freeze({
      rigSha256: metadata.rigSha256,
      anchorSha256: metadata.anchorSha256,
      resourcesAuthenticated: options.resourcesAuthenticated,
    }),
    error: Object.freeze({
      code: options.code,
      message: options.reason instanceof Error ? options.reason.message : 'Overlay unavailable.',
    }),
    claims: CLAIMS,
  });
}

/** Evaluates all V4 pose channels and returns arm, torso, head, hip, knee, and ankle markers. */
export async function createMakeHumanFullBodyJointOverlayRuntimeV5(options: {
  readonly basis: MakeHumanOpenReferenceBasisV1;
  readonly measurements: CanonicalBodyMeasurementsMm;
  readonly proxyRuntime: MeasurementOpenReferenceUniformWaistHipRuntimeResultV1;
  readonly input: unknown;
  readonly sourceRevision: string;
  readonly loadResources?: () => Promise<MeasurementOpenReferenceDisplayPoseResourcesV1>;
}): Promise<MakeHumanFullBodyJointOverlayRuntimeResultV5> {
  const pose = validateMakeHumanFullBodyLocalFkPoseV4(options.input);
  if (options.basis.kind === 'base') throw new Error('Joint overlay V5 binding is invalid.');
  const semanticRotations = makeHumanFullBodyLocalFkRotationsV4(pose, options.basis.kind);
  const measurementFingerprint = makeHumanFullBodyJointOverlayMeasurementFingerprintV5(
    options.measurements,
  );
  const bodySourceRevision = exactString(options.sourceRevision, 'sourceRevision');
  validateBinding({ ...options, rotationCount: semanticRotations.length });
  const metadata = MEASUREMENT_OPEN_REFERENCE_DISPLAY_POSE_RUNTIME_METADATA_V1;
  const binding = Object.freeze({
    basisKind: options.basis.kind as Exclude<MakeHumanOpenReferenceBasisV1['kind'], 'base'>,
    measurementFingerprint,
    bodySourceRevision,
    rigSha256: metadata.rigSha256,
    anchorSha256: metadata.anchorSha256,
    pose,
  });
  const sourceRevision = `${bodySourceRevision};jointOverlayRuntime=${MAKEHUMAN_FULL_BODY_JOINT_OVERLAY_RUNTIME_V5};measurementFingerprint=${measurementFingerprint};overlayPose=${encodeURIComponent(JSON.stringify(pose))};jointOverlayRigSha256=${metadata.rigSha256};jointOverlayAnchorSha256=${metadata.anchorSha256}`;
  const snapshot = Object.freeze({
    basisKind: binding.basisKind,
    sourceMinimumY: options.basis.sourceMinimumY,
    sourceMaximumY: options.basis.sourceMaximumY,
    heightMm: options.measurements.heightMm,
    modeResults: Object.freeze(
      options.proxyRuntime.modeResults.map((result) => Object.freeze({ ...result })),
    ),
  });

  let resources: MeasurementOpenReferenceDisplayPoseResourcesV1;
  try {
    resources = await (options.loadResources ?? loadAuthenticatedResourcesV5)();
  } catch (reason: unknown) {
    return unavailable({
      sourceRevision,
      binding,
      code: 'pose-resources-unavailable',
      resourcesAuthenticated: false,
      reason,
    });
  }

  try {
    const anchors = deriveMakeHumanUniformWaistHipRigAnchorsMResearchV1({
      rigBundle: resources.rig,
      anchorDeltaBundle: resources.anchors,
      basisKind: snapshot.basisKind,
      sourceMinimumY: snapshot.sourceMinimumY,
      sourceMaximumY: snapshot.sourceMaximumY,
      heightMm: snapshot.heightMm,
      modeResults: snapshot.modeResults,
    });
    const coherentAnchors = applyMakeHuman2ArmLengthProxyToRigAnchorsMResearchV1({
      armProxy: options.proxyRuntime.poseCompatibleArmLengthProxy,
      rigBundle: resources.rig,
      basisKind: snapshot.basisKind,
      headsM: anchors.headsM,
      tailsM: anchors.tailsM,
      rollDirections: anchors.rollDirections,
    });
    const elbowNeutralization = deriveMakeHumanElbowBindNeutralizationV1({
      bundle: resources.rig,
      basisKind: snapshot.basisKind,
      heads: coherentAnchors.headsM,
      tails: coherentAnchors.tailsM,
      rollDirections: coherentAnchors.rollDirections,
      rigSha256: metadata.rigSha256,
    });
    const rotations = makeHumanFullBodyLocalFkRotationsV4(
      pose,
      options.basis.kind,
      elbowNeutralization,
    );
    const overlay = poseMakeHumanCoreRigDisplayOverlayLocalResearchV4({
      bundle: resources.rig,
      basisKind: snapshot.basisKind,
      heads: coherentAnchors.headsM,
      tails: coherentAnchors.tailsM,
      rollDirections: coherentAnchors.rollDirections,
      rotations,
    });
    if (
      !Number.isFinite(overlay.maximumJointPivotResidualM) ||
      overlay.maximumJointPivotResidualM < 0 ||
      overlay.maximumJointPivotResidualM > 1e-7
    ) {
      throw new Error('Joint overlay V5 pivot-continuity gate failed.');
    }
    return Object.freeze({
      version: MAKEHUMAN_FULL_BODY_JOINT_OVERLAY_RUNTIME_V5,
      status: 'ready',
      sourceRevision,
      binding,
      groups: makeHumanFullBodyJointOverlayGroupsFromBonesV5(overlay.bones),
      maximumJointPivotResidualM: overlay.maximumJointPivotResidualM,
      source: Object.freeze({
        rigSha256: metadata.rigSha256,
        anchorSha256: metadata.anchorSha256,
        resourcesAuthenticated: true as const,
      }),
      claims: CLAIMS,
    });
  } catch (reason: unknown) {
    return unavailable({
      sourceRevision,
      binding,
      code: 'overlay-evaluation-failed',
      resourcesAuthenticated: true,
      reason,
    });
  }
}
