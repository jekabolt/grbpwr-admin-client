import {
  MAKEHUMAN_FULL_BODY_JOINT_OVERLAY_GROUPS_V4,
  type MakeHumanFullBodyJointOverlayAxisV4,
  type MakeHumanFullBodyJointOverlayChannelDescriptorV4,
} from 'lib/cloth/body/makehuman-full-body-joint-overlay-runtime-v4';

import {
  MODEL_OPEN_REFERENCE_FULL_BODY_POSE_LIMITS_V4,
  modelOpenReferenceFullBodyPoseUpdateArmV4,
  modelOpenReferenceFullBodyPoseUpdateBodyV4,
  snapshotModelOpenReferenceFullBodyPoseV4,
  type ModelOpenReferenceFullBodyPoseArmFieldV4,
  type ModelOpenReferenceFullBodyPoseBodyFieldV4,
  type ModelOpenReferenceFullBodyPoseV4,
} from './model-open-reference-full-body-pose-control-v4';
import type { ModelOpenReferenceJointSelectionV5 } from './model-open-reference-joint-pose-control-v5';

export const MODEL_OPEN_REFERENCE_JOINT_RING_CONTRACT_V6 =
  'model-open-reference-joint-ring-contract/v6' as const;

export interface ModelOpenReferenceJointRingDraggingV6 {
  readonly status: 'dragging';
  readonly selection: ModelOpenReferenceJointSelectionV5;
  readonly axis: MakeHumanFullBodyJointOverlayAxisV4;
  /**
   * Converts a positive local-axis ring delta to the canonical semantic-channel direction.
   * This already accounts for right-side contribution signs; `sideMirrorSign` is metadata and
   * must not be multiplied into the drag a second time.
   */
  readonly ringToSemanticSign: -1 | 1;
  readonly startPose: ModelOpenReferenceFullBodyPoseV4;
  readonly draftPose: ModelOpenReferenceFullBodyPoseV4;
  readonly startSemanticDegrees: number;
  readonly previousPointerAngleDegrees: number;
  readonly accumulatedRingDegrees: number;
}

export interface ModelOpenReferenceJointRingSettledV6 {
  readonly status: 'committed' | 'cancelled';
  readonly selection: ModelOpenReferenceJointSelectionV5;
  readonly pose: ModelOpenReferenceFullBodyPoseV4;
}

function finiteDegrees(value: number, label: string): number {
  if (!Number.isFinite(value)) throw new RangeError(`${label} must be finite.`);
  return Object.is(value, -0) ? 0 : value;
}

/** Normalizes to [-180, 180); an exact half-turn resolves to -180 deterministically. */
export function modelOpenReferenceJointRingNormalizeDegreesV6(value: number): number {
  const finite = finiteDegrees(value, 'Ring angle');
  const normalized = ((((finite + 180) % 360) + 360) % 360) - 180;
  return Object.is(normalized, -0) ? 0 : normalized;
}

/** Returns the shortest signed sample-to-sample delta, safe across the ±180 seam. */
export function modelOpenReferenceJointRingDeltaDegreesV6(
  previousDegrees: number,
  currentDegrees: number,
): number {
  return modelOpenReferenceJointRingNormalizeDegreesV6(
    finiteDegrees(currentDegrees, 'Current ring angle') -
      finiteDegrees(previousDegrees, 'Previous ring angle'),
  );
}

/**
 * Screen-space angle with positive counter-clockwise rotation. Screen Y is inverted deliberately.
 */
export function modelOpenReferenceJointRingPointerAngleDegreesV6(options: {
  readonly centerX: number;
  readonly centerY: number;
  readonly pointerX: number;
  readonly pointerY: number;
}): number {
  const centerX = finiteDegrees(options.centerX, 'Ring center X');
  const centerY = finiteDegrees(options.centerY, 'Ring center Y');
  const pointerX = finiteDegrees(options.pointerX, 'Ring pointer X');
  const pointerY = finiteDegrees(options.pointerY, 'Ring pointer Y');
  const x = pointerX - centerX;
  const y = centerY - pointerY;
  if (Math.hypot(x, y) <= Number.EPSILON) {
    throw new RangeError('Ring pointer must not coincide with the projected joint center.');
  }
  return modelOpenReferenceJointRingNormalizeDegreesV6((Math.atan2(y, x) * 180) / Math.PI);
}

function canonicalDescriptor(selection: ModelOpenReferenceJointSelectionV5) {
  const group = MAKEHUMAN_FULL_BODY_JOINT_OVERLAY_GROUPS_V4.find(
    ({ id }) => id === selection.groupId,
  );
  const descriptor = group?.channelDescriptors.find(({ channel }) => channel === selection.channel);
  if (!group || !descriptor) {
    throw new RangeError('Joint ring selection is outside the canonical group/channel allowlist.');
  }
  return descriptor;
}

/**
 * Derives the direction from the canonical compiler contributions. The mirror metadata is not an
 * additional multiplier: right-side X channels already carry negative contribution weights.
 */
export function modelOpenReferenceJointRingSemanticSignV6(
  descriptor: MakeHumanFullBodyJointOverlayChannelDescriptorV4,
): -1 | 1 {
  const contributionSum = descriptor.contributions.reduce((sum, { weight }) => sum + weight, 0);
  if (!Number.isFinite(contributionSum) || Math.abs(Math.abs(contributionSum) - 1) > 1e-9) {
    throw new RangeError('Joint ring channel contributions must resolve to a signed unit weight.');
  }
  return contributionSum < 0 ? -1 : 1;
}

function poseField(
  selection: ModelOpenReferenceJointSelectionV5,
): ModelOpenReferenceFullBodyPoseBodyFieldV4 | ModelOpenReferenceFullBodyPoseArmFieldV4 {
  if (selection.channel === 'torsoFlexionDeg') return 'bodyFlexionDegrees';
  if (selection.channel === 'torsoSideBendDeg') return 'bodySideBendDegrees';
  if (selection.channel === 'torsoTwistDeg') return 'bodyTwistDegrees';
  if (selection.channel === 'shoulderRaiseDeg') return 'shoulderRaiseDegrees';
  if (selection.channel === 'shoulderForwardDeg') return 'shoulderForwardDegrees';
  if (selection.channel === 'elbowBendDeg') return 'elbowBendDegrees';
  return 'wristBendDegrees';
}

export function modelOpenReferenceJointRingChannelValueV6(
  pose: ModelOpenReferenceFullBodyPoseV4,
  selection: ModelOpenReferenceJointSelectionV5,
): number {
  const field = poseField(selection);
  if (
    field === 'bodyFlexionDegrees' ||
    field === 'bodySideBendDegrees' ||
    field === 'bodyTwistDegrees'
  ) {
    return pose[field];
  }
  const arm = selection.groupId.startsWith('right-') ? pose.rightArm : pose.leftArm;
  return arm[field];
}

function updateChannel(
  pose: ModelOpenReferenceFullBodyPoseV4,
  selection: ModelOpenReferenceJointSelectionV5,
  value: number,
): ModelOpenReferenceFullBodyPoseV4 {
  const field = poseField(selection);
  const updated =
    field === 'bodyFlexionDegrees' ||
    field === 'bodySideBendDegrees' ||
    field === 'bodyTwistDegrees'
      ? modelOpenReferenceFullBodyPoseUpdateBodyV4(pose, field, value)
      : modelOpenReferenceFullBodyPoseUpdateArmV4(
          pose,
          selection.groupId.startsWith('right-') ? 'right' : 'left',
          field,
          value,
        );
  if (!updated) throw new RangeError('Joint ring produced a non-canonical pose step.');
  return updated;
}

function quantizedSemanticValue(options: {
  readonly startDegrees: number;
  readonly semanticDeltaDegrees: number;
  readonly min: number;
  readonly max: number;
  readonly step: number;
}): number {
  const magnitude = Math.abs(options.semanticDeltaDegrees);
  // A sub-half-step movement is treated as pointer jitter. Exact half-steps advance in the drag
  // direction, making positive and negative drags symmetric around the starting pose.
  const stepCount =
    magnitude < options.step / 2
      ? 0
      : Math.sign(options.semanticDeltaDegrees) * Math.floor(magnitude / options.step + 0.5);
  return Math.min(
    options.max,
    Math.max(options.min, options.startDegrees + stepCount * options.step),
  );
}

export function modelOpenReferenceJointRingBeginV6(options: {
  readonly pose: ModelOpenReferenceFullBodyPoseV4;
  readonly selection: ModelOpenReferenceJointSelectionV5;
  readonly pointerAngleDegrees: number;
}): ModelOpenReferenceJointRingDraggingV6 {
  const descriptor = canonicalDescriptor(options.selection);
  const startPose = snapshotModelOpenReferenceFullBodyPoseV4(options.pose);
  return Object.freeze({
    status: 'dragging',
    selection: Object.freeze({ ...options.selection }),
    axis: descriptor.axis,
    ringToSemanticSign: modelOpenReferenceJointRingSemanticSignV6(descriptor),
    startPose,
    draftPose: startPose,
    startSemanticDegrees: modelOpenReferenceJointRingChannelValueV6(startPose, options.selection),
    previousPointerAngleDegrees: modelOpenReferenceJointRingNormalizeDegreesV6(
      options.pointerAngleDegrees,
    ),
    accumulatedRingDegrees: 0,
  });
}

export function modelOpenReferenceJointRingMoveV6(
  transaction: ModelOpenReferenceJointRingDraggingV6,
  pointerAngleDegrees: number,
): ModelOpenReferenceJointRingDraggingV6 {
  if (transaction.status !== 'dragging') throw new RangeError('Joint ring drag is not active.');
  const normalizedPointerAngle = modelOpenReferenceJointRingNormalizeDegreesV6(pointerAngleDegrees);
  const sampleDelta = modelOpenReferenceJointRingDeltaDegreesV6(
    transaction.previousPointerAngleDegrees,
    normalizedPointerAngle,
  );
  const accumulatedRingDegrees = transaction.accumulatedRingDegrees + sampleDelta;
  const field = poseField(transaction.selection);
  const limit = MODEL_OPEN_REFERENCE_FULL_BODY_POSE_LIMITS_V4[field];
  const nextValue = quantizedSemanticValue({
    startDegrees: transaction.startSemanticDegrees,
    semanticDeltaDegrees: accumulatedRingDegrees * transaction.ringToSemanticSign,
    min: limit.min,
    max: limit.max,
    step: limit.step,
  });
  return Object.freeze({
    ...transaction,
    previousPointerAngleDegrees: normalizedPointerAngle,
    accumulatedRingDegrees,
    draftPose: updateChannel(transaction.startPose, transaction.selection, nextValue),
  });
}

export function modelOpenReferenceJointRingFinishV6(
  transaction: ModelOpenReferenceJointRingDraggingV6,
  outcome: 'commit' | 'cancel',
): ModelOpenReferenceJointRingSettledV6 {
  if (transaction.status !== 'dragging') throw new RangeError('Joint ring drag is not active.');
  return Object.freeze({
    status: outcome === 'commit' ? 'committed' : 'cancelled',
    selection: transaction.selection,
    pose: outcome === 'commit' ? transaction.draftPose : transaction.startPose,
  });
}
