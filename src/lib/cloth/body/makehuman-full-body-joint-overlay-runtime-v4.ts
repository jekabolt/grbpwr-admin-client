import {
  makeHumanFullBodyLocalFkRotationsV3,
  validateMakeHumanFullBodyLocalFkPoseV3,
  type MakeHumanFullBodyLocalFkPoseV3,
} from './makehuman-full-body-local-fk-runtime-v3';
import {
  poseMakeHumanCoreRigDisplayOverlayLocalResearchV4,
  type MakeHumanLocalJointMatrix3V3,
  type MakeHumanLocalJointVec3V3,
  type MakeHumanPosedLocalBoneOverlayV4,
} from './makehuman-local-joint-frame-research-v3';
import { deriveMakeHumanUniformWaistHipRigAnchorsMResearchV1 } from './makehuman-waist-hip-rig-anchor-research-v1';
import {
  CANONICAL_BODY_MEASUREMENTS_VERSION,
  type CanonicalBodyMeasurementsMm,
} from './measurement-adapter';
import {
  createMakeHumanDisplayPoseResourceLoaderV1,
  type MeasurementOpenReferenceDisplayPoseResourcesV1,
} from './measurement-open-reference-display-pose-runtime-v1';
import { MEASUREMENT_OPEN_REFERENCE_DISPLAY_POSE_RUNTIME_METADATA_V1 } from './measurement-open-reference-display-pose-v1';
import type { MakeHumanOpenReferenceBasisV1 } from './measurement-open-reference-display-v1';
import type { MeasurementOpenReferenceUniformWaistHipRuntimeResultV1 } from './measurement-open-reference-uniform-waist-hip-runtime-v1';

export const MAKEHUMAN_FULL_BODY_JOINT_OVERLAY_RUNTIME_V4 =
  'makehuman-full-body-joint-overlay-runtime/v4' as const;

export type MakeHumanFullBodyJointOverlayGroupIdV4 =
  | 'torso-group'
  | 'left-shoulder-group'
  | 'right-shoulder-group'
  | 'left-elbow'
  | 'right-elbow'
  | 'left-wrist'
  | 'right-wrist';
export type MakeHumanFullBodyJointOverlayChannelV4 =
  | 'torsoFlexionDeg'
  | 'torsoSideBendDeg'
  | 'torsoTwistDeg'
  | 'shoulderRaiseDeg'
  | 'shoulderForwardDeg'
  | 'elbowBendDeg'
  | 'wristBendDeg';
export type MakeHumanFullBodyJointOverlayAxisV4 = 'x' | 'y' | 'z';
export type MakeHumanFullBodyJointOverlayRotationComponentV4 =
  | 'transverseXBendDeg'
  | 'longitudinalTwistDeg'
  | 'transverseZBendDeg';

export interface MakeHumanFullBodyJointOverlayContributionV4 {
  readonly bone: string;
  readonly component: MakeHumanFullBodyJointOverlayRotationComponentV4;
  /** Signed semantic-channel multiplier used by the canonical pose compiler. */
  readonly weight: number;
}

export interface MakeHumanFullBodyJointOverlayChannelDescriptorV4 {
  readonly channel: MakeHumanFullBodyJointOverlayChannelV4;
  readonly axis: MakeHumanFullBodyJointOverlayAxisV4;
  /** Component sign produced by sagittal mirroring from a left-side source rotation. */
  readonly sideMirrorSign: -1 | 1;
  readonly contributions: readonly MakeHumanFullBodyJointOverlayContributionV4[];
}

interface MakeHumanFullBodyJointOverlayGroupDefinitionV4 {
  readonly id: MakeHumanFullBodyJointOverlayGroupIdV4;
  readonly label: string;
  readonly side: 'center' | 'left' | 'right';
  readonly markerBone: string;
  readonly sourceBones: readonly string[];
  readonly allowedAxes: readonly MakeHumanFullBodyJointOverlayAxisV4[];
  readonly channelDescriptors: readonly MakeHumanFullBodyJointOverlayChannelDescriptorV4[];
}

function contribution(
  bone: string,
  component: MakeHumanFullBodyJointOverlayRotationComponentV4,
  weight: number,
): MakeHumanFullBodyJointOverlayContributionV4 {
  return Object.freeze({ bone, component, weight });
}

function channelDescriptor(options: {
  channel: MakeHumanFullBodyJointOverlayChannelV4;
  axis: MakeHumanFullBodyJointOverlayAxisV4;
  sideMirrorSign: -1 | 1;
  contributions: readonly MakeHumanFullBodyJointOverlayContributionV4[];
}): MakeHumanFullBodyJointOverlayChannelDescriptorV4 {
  return Object.freeze({ ...options, contributions: Object.freeze([...options.contributions]) });
}

function groupDefinition(options: {
  id: MakeHumanFullBodyJointOverlayGroupIdV4;
  label: string;
  side: 'center' | 'left' | 'right';
  markerBone: string;
  channelDescriptors: readonly MakeHumanFullBodyJointOverlayChannelDescriptorV4[];
}): MakeHumanFullBodyJointOverlayGroupDefinitionV4 {
  const sourceBones = Object.freeze([
    ...new Set(
      options.channelDescriptors.flatMap(({ contributions }) =>
        contributions.map(({ bone }) => bone),
      ),
    ),
  ]);
  const allowedAxes = Object.freeze([
    ...new Set(options.channelDescriptors.map(({ axis }) => axis)),
  ]);
  return Object.freeze({
    ...options,
    sourceBones,
    allowedAxes,
    channelDescriptors: Object.freeze([...options.channelDescriptors]),
  });
}

const SPINE_DISTRIBUTION_V4 = Object.freeze([
  Object.freeze({ bone: 'spine01', weight: 0.15 }),
  Object.freeze({ bone: 'spine02', weight: 0.2 }),
  Object.freeze({ bone: 'spine03', weight: 0.25 }),
  Object.freeze({ bone: 'spine04', weight: 0.25 }),
  Object.freeze({ bone: 'spine05', weight: 0.15 }),
] as const);

function spineContributions(
  component: MakeHumanFullBodyJointOverlayRotationComponentV4,
): readonly MakeHumanFullBodyJointOverlayContributionV4[] {
  return SPINE_DISTRIBUTION_V4.map(({ bone, weight }) => contribution(bone, component, weight));
}

export const MAKEHUMAN_FULL_BODY_JOINT_OVERLAY_GROUPS_V4 = Object.freeze([
  groupDefinition({
    id: 'torso-group',
    label: 'torso group',
    side: 'center',
    markerBone: 'spine03',
    channelDescriptors: Object.freeze([
      channelDescriptor({
        channel: 'torsoFlexionDeg',
        axis: 'x',
        sideMirrorSign: -1,
        contributions: spineContributions('transverseXBendDeg'),
      }),
      channelDescriptor({
        channel: 'torsoSideBendDeg',
        axis: 'z',
        sideMirrorSign: 1,
        contributions: spineContributions('transverseZBendDeg'),
      }),
      channelDescriptor({
        channel: 'torsoTwistDeg',
        axis: 'y',
        sideMirrorSign: -1,
        contributions: spineContributions('longitudinalTwistDeg'),
      }),
    ]),
  }),
  groupDefinition({
    id: 'left-shoulder-group',
    label: 'left shoulder / upper-arm group',
    side: 'left',
    markerBone: 'upperarm01.L',
    channelDescriptors: Object.freeze([
      channelDescriptor({
        channel: 'shoulderRaiseDeg',
        axis: 'x',
        sideMirrorSign: -1,
        contributions: Object.freeze([
          contribution('shoulder01.L', 'transverseXBendDeg', 0.2),
          contribution('upperarm01.L', 'transverseXBendDeg', 0.8),
        ]),
      }),
      channelDescriptor({
        channel: 'shoulderForwardDeg',
        axis: 'z',
        sideMirrorSign: 1,
        contributions: Object.freeze([contribution('upperarm01.L', 'transverseZBendDeg', 1)]),
      }),
    ]),
  }),
  groupDefinition({
    id: 'right-shoulder-group',
    label: 'right shoulder / upper-arm group',
    side: 'right',
    markerBone: 'upperarm01.R',
    channelDescriptors: Object.freeze([
      channelDescriptor({
        channel: 'shoulderRaiseDeg',
        axis: 'x',
        sideMirrorSign: -1,
        contributions: Object.freeze([
          contribution('shoulder01.R', 'transverseXBendDeg', -0.2),
          contribution('upperarm01.R', 'transverseXBendDeg', -0.8),
        ]),
      }),
      channelDescriptor({
        channel: 'shoulderForwardDeg',
        axis: 'z',
        sideMirrorSign: 1,
        contributions: Object.freeze([contribution('upperarm01.R', 'transverseZBendDeg', 1)]),
      }),
    ]),
  }),
  groupDefinition({
    id: 'left-elbow',
    label: 'left elbow',
    side: 'left',
    markerBone: 'lowerarm01.L',
    channelDescriptors: Object.freeze([
      channelDescriptor({
        channel: 'elbowBendDeg',
        axis: 'z',
        sideMirrorSign: 1,
        contributions: Object.freeze([contribution('lowerarm01.L', 'transverseZBendDeg', -1)]),
      }),
    ]),
  }),
  groupDefinition({
    id: 'right-elbow',
    label: 'right elbow',
    side: 'right',
    markerBone: 'lowerarm01.R',
    channelDescriptors: Object.freeze([
      channelDescriptor({
        channel: 'elbowBendDeg',
        axis: 'z',
        sideMirrorSign: 1,
        contributions: Object.freeze([contribution('lowerarm01.R', 'transverseZBendDeg', -1)]),
      }),
    ]),
  }),
  groupDefinition({
    id: 'left-wrist',
    label: 'left wrist',
    side: 'left',
    markerBone: 'wrist.L',
    channelDescriptors: Object.freeze([
      channelDescriptor({
        channel: 'wristBendDeg',
        axis: 'z',
        sideMirrorSign: 1,
        contributions: Object.freeze([contribution('wrist.L', 'transverseZBendDeg', 1)]),
      }),
    ]),
  }),
  groupDefinition({
    id: 'right-wrist',
    label: 'right wrist',
    side: 'right',
    markerBone: 'wrist.R',
    channelDescriptors: Object.freeze([
      channelDescriptor({
        channel: 'wristBendDeg',
        axis: 'z',
        sideMirrorSign: 1,
        contributions: Object.freeze([contribution('wrist.R', 'transverseZBendDeg', 1)]),
      }),
    ]),
  }),
] as const);

export interface MakeHumanFullBodyJointOverlayGroupV4 {
  readonly id: MakeHumanFullBodyJointOverlayGroupIdV4;
  readonly label: string;
  readonly side: 'center' | 'left' | 'right';
  readonly markerBone: string;
  readonly sourceBones: readonly string[];
  readonly allowedAxes: readonly MakeHumanFullBodyJointOverlayAxisV4[];
  readonly channelDescriptors: readonly MakeHumanFullBodyJointOverlayChannelDescriptorV4[];
  readonly headM: MakeHumanLocalJointVec3V3;
  readonly tailM: MakeHumanLocalJointVec3V3;
  readonly localToWorld: MakeHumanLocalJointMatrix3V3;
  readonly localAxes: Readonly<{
    x: MakeHumanLocalJointVec3V3;
    y: MakeHumanLocalJointVec3V3;
    z: MakeHumanLocalJointVec3V3;
  }>;
}

interface MakeHumanFullBodyJointOverlayBindingV4 {
  readonly basisKind: Exclude<MakeHumanOpenReferenceBasisV1['kind'], 'base'>;
  readonly measurementFingerprint: string;
  readonly bodySourceRevision: string;
  readonly rigSha256: string;
  readonly anchorSha256: string;
  readonly pose: MakeHumanFullBodyLocalFkPoseV3;
}

interface MakeHumanFullBodyJointOverlayClaimsV4 {
  readonly optionalEditorOverlay: true;
  readonly bodyDisplayUsableWithoutOverlay: true;
  readonly displayOnly: true;
  readonly inverseKinematicsApplied: false;
  readonly garmentPairEvaluated: false;
  readonly fitClaimEligible: false;
  readonly runtimeCollisionEligible: false;
  readonly productionAuthority: false;
}

export interface MakeHumanFullBodyJointOverlayReadyV4 {
  readonly version: typeof MAKEHUMAN_FULL_BODY_JOINT_OVERLAY_RUNTIME_V4;
  readonly status: 'ready';
  readonly sourceRevision: string;
  readonly binding: MakeHumanFullBodyJointOverlayBindingV4;
  readonly groups: readonly MakeHumanFullBodyJointOverlayGroupV4[];
  readonly maximumJointPivotResidualM: number;
  readonly source: Readonly<{
    rigSha256: string;
    anchorSha256: string;
    resourcesAuthenticated: true;
  }>;
  readonly claims: MakeHumanFullBodyJointOverlayClaimsV4;
}

export interface MakeHumanFullBodyJointOverlayUnavailableV4 {
  readonly version: typeof MAKEHUMAN_FULL_BODY_JOINT_OVERLAY_RUNTIME_V4;
  readonly status: 'unavailable';
  readonly sourceRevision: string;
  readonly binding: MakeHumanFullBodyJointOverlayBindingV4;
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
  readonly claims: MakeHumanFullBodyJointOverlayClaimsV4;
}

export type MakeHumanFullBodyJointOverlayRuntimeResultV4 =
  | MakeHumanFullBodyJointOverlayReadyV4
  | MakeHumanFullBodyJointOverlayUnavailableV4;

const CLAIMS: MakeHumanFullBodyJointOverlayClaimsV4 = Object.freeze({
  optionalEditorOverlay: true,
  bodyDisplayUsableWithoutOverlay: true,
  displayOnly: true,
  inverseKinematicsApplied: false,
  garmentPairEvaluated: false,
  fitClaimEligible: false,
  runtimeCollisionEligible: false,
  productionAuthority: false,
});
const EMPTY_GROUPS = Object.freeze([]) as readonly [];
const loadAuthenticatedOverlayResourcesV4 = createMakeHumanDisplayPoseResourceLoaderV1();

function exactString(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.length === 0 || value.trim() !== value) {
    throw new RangeError(`${label} must be a non-empty trimmed string.`);
  }
  return value;
}

function fnv1a32(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

export function makeHumanFullBodyJointOverlayMeasurementFingerprintV4(
  measurements: CanonicalBodyMeasurementsMm,
): string {
  const canonical = Object.entries(measurements).sort(([left], [right]) =>
    left.localeCompare(right),
  );
  if (
    canonical.length === 0 ||
    canonical.some(
      ([key, value]) =>
        key.length === 0 ||
        (key === 'schemaVersion'
          ? value !== CANONICAL_BODY_MEASUREMENTS_VERSION
          : typeof value !== 'number' || !Number.isFinite(value) || value <= 0),
    )
  ) {
    throw new RangeError('Overlay measurements must contain finite positive canonical values.');
  }
  return `fnv1a32:${fnv1a32(JSON.stringify(canonical))}`;
}

function overlaySourceRevision(options: {
  bodySourceRevision: string;
  measurementFingerprint: string;
  pose: MakeHumanFullBodyLocalFkPoseV3;
}): string {
  const metadata = MEASUREMENT_OPEN_REFERENCE_DISPLAY_POSE_RUNTIME_METADATA_V1;
  return `${options.bodySourceRevision};jointOverlayRuntime=${MAKEHUMAN_FULL_BODY_JOINT_OVERLAY_RUNTIME_V4};measurementFingerprint=${options.measurementFingerprint};overlayPose=${encodeURIComponent(JSON.stringify(options.pose))};jointOverlayRigSha256=${metadata.rigSha256};jointOverlayAnchorSha256=${metadata.anchorSha256}`;
}

function exactVerifiedFallback(
  proxyRuntime: MeasurementOpenReferenceUniformWaistHipRuntimeResultV1,
): boolean {
  const positions = proxyRuntime.displayMesh.positions;
  const indices = proxyRuntime.displayMesh.indices;
  const fallback = proxyRuntime.openReference.mesh;
  return (
    proxyRuntime.representedGeometricProxies.length === 0 &&
    proxyRuntime.modeResults.length === 0 &&
    fallback.positions.length === positions.length &&
    fallback.indices.length === indices.length &&
    positions.every((value, index) => value === fallback.positions[index]) &&
    indices.every((value, index) => value === fallback.indices[index])
  );
}

function validateBinding(options: {
  basis: MakeHumanOpenReferenceBasisV1;
  measurements: CanonicalBodyMeasurementsMm;
  proxyRuntime: MeasurementOpenReferenceUniformWaistHipRuntimeResultV1;
  rotationCount: number;
}): void {
  const { basis, measurements, proxyRuntime } = options;
  const positions = proxyRuntime.displayMesh.positions;
  const indices = proxyRuntime.displayMesh.indices;
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
    throw new Error('Joint overlay basis, measurements, or proxy binding is invalid.');
  }
  for (let index = 0; index < indices.length; index += 1) {
    if (indices[index] !== basis.indices[index]) {
      throw new Error('Joint overlay display mesh indices do not match the basis.');
    }
  }
  if (
    proxyRuntime.status === 'error' &&
    (options.rotationCount !== 0 || !exactVerifiedFallback(proxyRuntime))
  ) {
    throw new Error('Joint overlay proxy fallback is invalid for the requested pose.');
  }
}

function vector(value: MakeHumanLocalJointVec3V3): MakeHumanLocalJointVec3V3 {
  return Object.freeze([value[0], value[1], value[2]] as const);
}

function axes(matrix: MakeHumanLocalJointMatrix3V3) {
  return Object.freeze({
    x: Object.freeze([matrix[0], matrix[3], matrix[6]] as const),
    y: Object.freeze([matrix[1], matrix[4], matrix[7]] as const),
    z: Object.freeze([matrix[2], matrix[5], matrix[8]] as const),
  });
}

function groupsFromBones(
  bones: readonly MakeHumanPosedLocalBoneOverlayV4[],
): readonly MakeHumanFullBodyJointOverlayGroupV4[] {
  const byName = new Map(bones.map((bone) => [bone.bone, bone]));
  return Object.freeze(
    MAKEHUMAN_FULL_BODY_JOINT_OVERLAY_GROUPS_V4.map((definition) => {
      const marker = byName.get(definition.markerBone);
      if (!marker)
        throw new Error(`Joint overlay marker bone ${definition.markerBone} is missing.`);
      for (const sourceBone of definition.sourceBones) {
        if (!byName.has(sourceBone)) {
          throw new Error(`Joint overlay source bone ${sourceBone} is missing.`);
        }
      }
      return Object.freeze({
        ...definition,
        headM: vector(marker.headM),
        tailM: vector(marker.tailM),
        localToWorld: Object.freeze([...marker.localToWorld]) as MakeHumanLocalJointMatrix3V3,
        localAxes: axes(marker.localToWorld),
      });
    }),
  );
}

function unavailable(options: {
  sourceRevision: string;
  binding: MakeHumanFullBodyJointOverlayBindingV4;
  code: MakeHumanFullBodyJointOverlayUnavailableV4['error']['code'];
  resourcesAuthenticated: boolean;
  reason: unknown;
}): MakeHumanFullBodyJointOverlayUnavailableV4 {
  const metadata = MEASUREMENT_OPEN_REFERENCE_DISPLAY_POSE_RUNTIME_METADATA_V1;
  return Object.freeze({
    version: MAKEHUMAN_FULL_BODY_JOINT_OVERLAY_RUNTIME_V4,
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
      message:
        options.reason instanceof Error
          ? options.reason.message
          : 'Joint overlay is temporarily unavailable.',
    }),
    claims: CLAIMS,
  });
}

/** Resource/evaluation failures return `unavailable`; they never revoke the body display. */
export async function createMakeHumanFullBodyJointOverlayRuntimeV4(options: {
  readonly basis: MakeHumanOpenReferenceBasisV1;
  readonly measurements: CanonicalBodyMeasurementsMm;
  readonly proxyRuntime: MeasurementOpenReferenceUniformWaistHipRuntimeResultV1;
  readonly input: unknown;
  readonly sourceRevision: string;
  readonly loadResources?: () => Promise<MeasurementOpenReferenceDisplayPoseResourcesV1>;
}): Promise<MakeHumanFullBodyJointOverlayRuntimeResultV4> {
  const pose = validateMakeHumanFullBodyLocalFkPoseV3(options.input);
  const rotations = makeHumanFullBodyLocalFkRotationsV3(pose);
  const measurementFingerprint = makeHumanFullBodyJointOverlayMeasurementFingerprintV4(
    options.measurements,
  );
  const bodySourceRevision = exactString(options.sourceRevision, 'sourceRevision');
  validateBinding({ ...options, rotationCount: rotations.length });
  const metadata = MEASUREMENT_OPEN_REFERENCE_DISPLAY_POSE_RUNTIME_METADATA_V1;
  const binding = Object.freeze({
    basisKind: options.basis.kind as Exclude<MakeHumanOpenReferenceBasisV1['kind'], 'base'>,
    measurementFingerprint,
    bodySourceRevision,
    rigSha256: metadata.rigSha256,
    anchorSha256: metadata.anchorSha256,
    pose,
  });
  const sourceRevision = overlaySourceRevision({
    bodySourceRevision,
    measurementFingerprint,
    pose,
  });
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
    resources = await (options.loadResources ?? loadAuthenticatedOverlayResourcesV4)();
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
    const overlay = poseMakeHumanCoreRigDisplayOverlayLocalResearchV4({
      bundle: resources.rig,
      basisKind: snapshot.basisKind,
      heads: anchors.headsM,
      tails: anchors.tailsM,
      rollDirections: anchors.rollDirections,
      rotations,
    });
    if (
      !Number.isFinite(overlay.maximumJointPivotResidualM) ||
      overlay.maximumJointPivotResidualM < 0 ||
      overlay.maximumJointPivotResidualM > 1e-7
    ) {
      throw new Error('Joint overlay pivot-continuity gate failed.');
    }
    return Object.freeze({
      version: MAKEHUMAN_FULL_BODY_JOINT_OVERLAY_RUNTIME_V4,
      status: 'ready',
      sourceRevision,
      binding,
      groups: groupsFromBones(overlay.bones),
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
