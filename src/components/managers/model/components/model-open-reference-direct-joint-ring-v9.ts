import { type MakeHumanFullBodyJointOverlayAxisV4 } from 'lib/cloth/body/makehuman-full-body-joint-overlay-runtime-v4';
import {
  MAKEHUMAN_FULL_BODY_JOINT_OVERLAY_GROUPS_V5,
  type MakeHumanFullBodyJointOverlayChannelDescriptorV5,
  type MakeHumanFullBodyJointOverlayChannelV5,
  type MakeHumanFullBodyJointOverlayGroupIdV5,
} from 'lib/cloth/body/makehuman-full-body-joint-overlay-runtime-v5';
import { MAKEHUMAN_FULL_BODY_HEAD_ENVELOPE_V4 } from 'lib/cloth/body/makehuman-full-body-pose-v4';
import { MAKEHUMAN_LEG_BODY_PART_IK_ENVELOPE_V1 } from 'lib/cloth/body/makehuman-leg-body-part-ik-v1';
import { MAKEHUMAN_ELBOW_NEUTRAL_ASSIST_V1 } from 'lib/cloth/body/makehuman-elbow-neutral-assist-v1';

import {
  MODEL_OPEN_REFERENCE_FULL_BODY_POSE_LIMITS_V4,
  type ModelOpenReferenceFullBodyPoseArmFieldV4,
  type ModelOpenReferenceFullBodyPoseBodyFieldV4,
} from './model-open-reference-full-body-pose-control-v4';
import {
  modelOpenReferenceJointRingDeltaDegreesV6,
  modelOpenReferenceJointRingNormalizeDegreesV6,
} from './model-open-reference-joint-ring-contract-v6';
import {
  snapshotModelOpenReferenceDirectPoseV9,
  type ModelOpenReferenceDirectPoseV9,
} from './model-open-reference-direct-pose-v9';

export const MODEL_OPEN_REFERENCE_DIRECT_JOINT_RING_V9 =
  'model-open-reference-direct-joint-ring/v9' as const;

export interface ModelOpenReferenceDirectJointSelectionV9 {
  readonly groupId: MakeHumanFullBodyJointOverlayGroupIdV5;
  readonly channel: MakeHumanFullBodyJointOverlayChannelV5;
}

export interface ModelOpenReferenceDirectJointRingDraggingV9 {
  readonly status: 'dragging';
  readonly selection: ModelOpenReferenceDirectJointSelectionV9;
  readonly axis: MakeHumanFullBodyJointOverlayAxisV4;
  readonly ringToSemanticSign: -1 | 1;
  readonly startPose: ModelOpenReferenceDirectPoseV9;
  readonly draftPose: ModelOpenReferenceDirectPoseV9;
  readonly startSemanticDegrees: number;
  readonly previousPointerAngleDegrees: number;
  readonly accumulatedRingDegrees: number;
}

export interface ModelOpenReferenceDirectJointRingSettledV9 {
  readonly status: 'committed' | 'cancelled';
  readonly selection: ModelOpenReferenceDirectJointSelectionV9;
  readonly pose: ModelOpenReferenceDirectPoseV9;
}

const DEFAULT_CHANNELS: Readonly<
  Partial<Record<MakeHumanFullBodyJointOverlayGroupIdV5, MakeHumanFullBodyJointOverlayChannelV5>>
> = Object.freeze({
  'head-group': 'headYawDeg',
  'left-hip-group': 'hipForwardDeg',
  'right-hip-group': 'hipForwardDeg',
  'left-knee': 'kneeBendDeg',
  'right-knee': 'kneeBendDeg',
  'left-ankle': 'ankleBendDeg',
  'right-ankle': 'ankleBendDeg',
});

function groupDefinition(groupId: MakeHumanFullBodyJointOverlayGroupIdV5) {
  const group = MAKEHUMAN_FULL_BODY_JOINT_OVERLAY_GROUPS_V5.find(({ id }) => id === groupId);
  if (!group) throw new RangeError(`Unknown direct-pose joint group ${groupId}.`);
  return group;
}

export function modelOpenReferenceDirectJointSelectionV9(
  groupId: MakeHumanFullBodyJointOverlayGroupIdV5,
  channel?: MakeHumanFullBodyJointOverlayChannelV5,
): ModelOpenReferenceDirectJointSelectionV9 {
  const group = groupDefinition(groupId);
  const preferred = channel ?? DEFAULT_CHANNELS[groupId];
  const selected =
    preferred && group.channelDescriptors.some((descriptor) => descriptor.channel === preferred)
      ? preferred
      : group.channelDescriptors[0].channel;
  return Object.freeze({ groupId, channel: selected });
}

function descriptor(selection: ModelOpenReferenceDirectJointSelectionV9) {
  const group = groupDefinition(selection.groupId);
  const selected = group.channelDescriptors.find(({ channel }) => channel === selection.channel);
  if (!selected) throw new RangeError('Direct-pose joint selection is outside the allowlist.');
  return selected;
}

function semanticSign(descriptor: MakeHumanFullBodyJointOverlayChannelDescriptorV5): -1 | 1 {
  const contributionSum = descriptor.contributions.reduce((sum, { weight }) => sum + weight, 0);
  if (!Number.isFinite(contributionSum) || Math.abs(Math.abs(contributionSum) - 1) > 1e-9) {
    throw new RangeError('Direct-pose ring contributions must resolve to a signed unit weight.');
  }
  return contributionSum < 0 ? -1 : 1;
}

const LEGACY_FIELDS = Object.freeze({
  torsoFlexionDeg: 'bodyFlexionDegrees',
  torsoSideBendDeg: 'bodySideBendDegrees',
  torsoTwistDeg: 'bodyTwistDegrees',
  shoulderRaiseDeg: 'shoulderRaiseDegrees',
  shoulderForwardDeg: 'shoulderForwardDegrees',
  elbowBendDeg: 'elbowBendDegrees',
  wristBendDeg: 'wristBendDegrees',
} as const);

type LegacyChannelV9 = keyof typeof LEGACY_FIELDS;

// In a straight side view the corrected elbow's local ring is nearly edge-on, so a normal
// tangential sweep reports only a few physical degrees. Gain is direction-scoped to straightening;
// flex placement keeps its one-degree semantic precision and the zero clamp blocks hyperextension.
const ELBOW_RING_INTERACTION_GAIN_V9 = MAKEHUMAN_ELBOW_NEUTRAL_ASSIST_V1.ringStraighteningGain;

function isLegacyChannel(
  channel: MakeHumanFullBodyJointOverlayChannelV5,
): channel is LegacyChannelV9 {
  return channel in LEGACY_FIELDS;
}

function limit(channel: MakeHumanFullBodyJointOverlayChannelV5) {
  if (isLegacyChannel(channel)) {
    return MODEL_OPEN_REFERENCE_FULL_BODY_POSE_LIMITS_V4[LEGACY_FIELDS[channel]];
  }
  if (channel in MAKEHUMAN_FULL_BODY_HEAD_ENVELOPE_V4) {
    const value =
      MAKEHUMAN_FULL_BODY_HEAD_ENVELOPE_V4[
        channel as keyof typeof MAKEHUMAN_FULL_BODY_HEAD_ENVELOPE_V4
      ];
    return Object.freeze({ min: value.minimumDeg, max: value.maximumDeg, step: value.stepDeg });
  }
  const value =
    MAKEHUMAN_LEG_BODY_PART_IK_ENVELOPE_V1[
      channel as keyof typeof MAKEHUMAN_LEG_BODY_PART_IK_ENVELOPE_V1
    ];
  return Object.freeze({ min: value.minimumDeg, max: value.maximumDeg, step: value.stepDeg });
}

function channelValue(
  pose: ModelOpenReferenceDirectPoseV9,
  selection: ModelOpenReferenceDirectJointSelectionV9,
): number {
  const { channel, groupId } = selection;
  if (channel === 'torsoFlexionDeg') return pose.bodyFlexionDegrees;
  if (channel === 'torsoSideBendDeg') return pose.bodySideBendDegrees;
  if (channel === 'torsoTwistDeg') return pose.bodyTwistDegrees;
  if (channel === 'headPitchDeg' || channel === 'headYawDeg' || channel === 'headSideDeg') {
    return pose[channel];
  }
  if (
    channel === 'shoulderRaiseDeg' ||
    channel === 'shoulderForwardDeg' ||
    channel === 'elbowBendDeg' ||
    channel === 'wristBendDeg'
  ) {
    const arm = groupId.startsWith('right-') ? pose.rightArm : pose.leftArm;
    return arm[LEGACY_FIELDS[channel]];
  }
  const leg = groupId.startsWith('right-') ? pose.rightLeg : pose.leftLeg;
  return leg[channel];
}

function updateLegacyBody(
  pose: ModelOpenReferenceDirectPoseV9,
  field: ModelOpenReferenceFullBodyPoseBodyFieldV4,
  value: number,
) {
  return snapshotModelOpenReferenceDirectPoseV9({ ...pose, [field]: value });
}

function updateLegacyArm(
  pose: ModelOpenReferenceDirectPoseV9,
  side: 'left' | 'right',
  field: ModelOpenReferenceFullBodyPoseArmFieldV4,
  value: number,
) {
  const selected = side === 'left' ? pose.leftArm : pose.rightArm;
  const nextArm = Object.freeze({ ...selected, [field]: value });
  return snapshotModelOpenReferenceDirectPoseV9(
    pose.armMode === 'linked'
      ? { ...pose, leftArm: nextArm, rightArm: nextArm }
      : { ...pose, [side === 'left' ? 'leftArm' : 'rightArm']: nextArm },
  );
}

function updateChannel(
  pose: ModelOpenReferenceDirectPoseV9,
  selection: ModelOpenReferenceDirectJointSelectionV9,
  value: number,
) {
  const { channel, groupId } = selection;
  if (channel === 'torsoFlexionDeg') return updateLegacyBody(pose, 'bodyFlexionDegrees', value);
  if (channel === 'torsoSideBendDeg') return updateLegacyBody(pose, 'bodySideBendDegrees', value);
  if (channel === 'torsoTwistDeg') return updateLegacyBody(pose, 'bodyTwistDegrees', value);
  if (channel === 'headPitchDeg' || channel === 'headYawDeg' || channel === 'headSideDeg') {
    return snapshotModelOpenReferenceDirectPoseV9({ ...pose, [channel]: value });
  }
  if (
    channel === 'shoulderRaiseDeg' ||
    channel === 'shoulderForwardDeg' ||
    channel === 'elbowBendDeg' ||
    channel === 'wristBendDeg'
  ) {
    return updateLegacyArm(
      pose,
      groupId.startsWith('right-') ? 'right' : 'left',
      LEGACY_FIELDS[channel],
      value,
    );
  }
  const side = groupId.startsWith('right-') ? 'right' : 'left';
  const selected = side === 'left' ? pose.leftLeg : pose.rightLeg;
  const nextLeg = Object.freeze({ ...selected, [channel]: value });
  return snapshotModelOpenReferenceDirectPoseV9(
    pose.legMode === 'linked'
      ? { ...pose, leftLeg: nextLeg, rightLeg: nextLeg }
      : { ...pose, [side === 'left' ? 'leftLeg' : 'rightLeg']: nextLeg },
  );
}

function quantizedValue(options: {
  readonly startDegrees: number;
  readonly semanticDeltaDegrees: number;
  readonly min: number;
  readonly max: number;
  readonly step: number;
}) {
  const magnitude = Math.abs(options.semanticDeltaDegrees);
  const stepCount =
    magnitude < options.step / 2
      ? 0
      : Math.sign(options.semanticDeltaDegrees) * Math.floor(magnitude / options.step + 0.5);
  return Math.min(
    options.max,
    Math.max(options.min, options.startDegrees + stepCount * options.step),
  );
}

export function modelOpenReferenceDirectJointRingBeginV9(options: {
  readonly pose: ModelOpenReferenceDirectPoseV9;
  readonly selection: ModelOpenReferenceDirectJointSelectionV9;
  readonly pointerAngleDegrees: number;
}): ModelOpenReferenceDirectJointRingDraggingV9 {
  const selectedDescriptor = descriptor(options.selection);
  const startPose = snapshotModelOpenReferenceDirectPoseV9(options.pose);
  return Object.freeze({
    status: 'dragging',
    selection: Object.freeze({ ...options.selection }),
    axis: selectedDescriptor.axis,
    ringToSemanticSign: semanticSign(selectedDescriptor),
    startPose,
    draftPose: startPose,
    startSemanticDegrees: channelValue(startPose, options.selection),
    previousPointerAngleDegrees: modelOpenReferenceJointRingNormalizeDegreesV6(
      options.pointerAngleDegrees,
    ),
    accumulatedRingDegrees: 0,
  });
}

export function modelOpenReferenceDirectJointRingMoveV9(
  transaction: ModelOpenReferenceDirectJointRingDraggingV9,
  pointerAngleDegrees: number,
): ModelOpenReferenceDirectJointRingDraggingV9 {
  const normalized = modelOpenReferenceJointRingNormalizeDegreesV6(pointerAngleDegrees);
  const accumulatedRingDegrees =
    transaction.accumulatedRingDegrees +
    modelOpenReferenceJointRingDeltaDegreesV6(transaction.previousPointerAngleDegrees, normalized);
  const envelope = limit(transaction.selection.channel);
  const semanticDeltaDegrees = accumulatedRingDegrees * transaction.ringToSemanticSign;
  const interactionGain =
    transaction.selection.channel === 'elbowBendDeg' && semanticDeltaDegrees < 0
      ? ELBOW_RING_INTERACTION_GAIN_V9
      : 1;
  const quantized = quantizedValue({
    startDegrees: transaction.startSemanticDegrees,
    semanticDeltaDegrees: semanticDeltaDegrees * interactionGain,
    ...envelope,
  });
  const value =
    transaction.selection.channel === 'elbowBendDeg' &&
    semanticDeltaDegrees < 0 &&
    quantized <= MAKEHUMAN_ELBOW_NEUTRAL_ASSIST_V1.ringNeutralDetentMaximumDeg
      ? 0
      : quantized;
  return Object.freeze({
    ...transaction,
    previousPointerAngleDegrees: normalized,
    accumulatedRingDegrees,
    draftPose: updateChannel(transaction.startPose, transaction.selection, value),
  });
}

export function modelOpenReferenceDirectJointRingFinishV9(
  transaction: ModelOpenReferenceDirectJointRingDraggingV9,
  outcome: 'commit' | 'cancel',
): ModelOpenReferenceDirectJointRingSettledV9 {
  return Object.freeze({
    status: outcome === 'commit' ? 'committed' : 'cancelled',
    selection: transaction.selection,
    pose: outcome === 'commit' ? transaction.draftPose : transaction.startPose,
  });
}
