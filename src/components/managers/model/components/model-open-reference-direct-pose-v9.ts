import type { MakeHumanCloLikeArmControlsV3 } from 'lib/cloth/body/makehuman-clo-like-pose-display-v3';
import type { MakeHumanFullBodyLocalFkPoseV4 } from 'lib/cloth/body/makehuman-full-body-local-fk-runtime-v4';
import {
  MAKEHUMAN_SHOULDER_POSTURE_ENVELOPE_V4,
  type MakeHumanFullBodyHeadControlsV4,
  type MakeHumanFullBodyPoseInputV4,
  type MakeHumanShoulderPostureControlsV4,
} from 'lib/cloth/body/makehuman-full-body-pose-v4';
import type {
  MakeHumanLegBodyPartIkControlsV1,
  MakeHumanLegBodyPartIkSideV1,
} from 'lib/cloth/body/makehuman-leg-body-part-ik-v1';

import {
  MODEL_OPEN_REFERENCE_FULL_BODY_NEUTRAL_POSE_V4,
  modelOpenReferenceFullBodyPoseGeometryEqualV4,
  snapshotModelOpenReferenceFullBodyPoseV4,
  type ModelOpenReferenceFullBodyPoseArmSideV4,
  type ModelOpenReferenceFullBodyPoseV4,
} from './model-open-reference-full-body-pose-control-v4';

export const MODEL_OPEN_REFERENCE_DIRECT_POSE_V9 = 'model-open-reference-direct-pose/v9' as const;

/** A new viewport gesture owns the draft and must invalidate any older asynchronous commit. */
export function modelOpenReferenceBeginDirectPoseGestureV9(
  updateStatus: 'idle' | 'building' | 'error',
  cancelBuild: () => void,
): boolean {
  if (updateStatus !== 'building') return false;
  cancelBuild();
  return true;
}

export interface ModelOpenReferenceDirectPoseV9 extends ModelOpenReferenceFullBodyPoseV4 {
  readonly headPitchDeg: number;
  readonly headYawDeg: number;
  readonly headSideDeg: number;
  readonly shoulderProtractionDeg: number;
  readonly shoulderElevationDeg: number;
  readonly shoulderLevelDeg: number;
  readonly legMode: 'linked' | 'independent';
  readonly leftLeg: MakeHumanLegBodyPartIkControlsV1;
  readonly rightLeg: MakeHumanLegBodyPartIkControlsV1;
}

const ZERO_LEG: MakeHumanLegBodyPartIkControlsV1 = Object.freeze({
  hipForwardDeg: 0,
  hipSideDeg: 0,
  kneeBendDeg: 0,
  ankleBendDeg: 0,
});

export const MODEL_OPEN_REFERENCE_DIRECT_NEUTRAL_POSE_V9: ModelOpenReferenceDirectPoseV9 =
  Object.freeze({
    ...MODEL_OPEN_REFERENCE_FULL_BODY_NEUTRAL_POSE_V4,
    headPitchDeg: 0,
    headYawDeg: 0,
    headSideDeg: 0,
    shoulderProtractionDeg: 0,
    shoulderElevationDeg: 0,
    shoulderLevelDeg: 0,
    legMode: 'linked',
    leftLeg: ZERO_LEG,
    rightLeg: ZERO_LEG,
  });

function freezeLeg(leg: MakeHumanLegBodyPartIkControlsV1) {
  return Object.freeze({ ...leg });
}

export function snapshotModelOpenReferenceDirectPoseV9(
  pose: ModelOpenReferenceDirectPoseV9,
): ModelOpenReferenceDirectPoseV9 {
  const upperBody = snapshotModelOpenReferenceFullBodyPoseV4(pose);
  return Object.freeze({
    ...upperBody,
    headPitchDeg: pose.headPitchDeg,
    headYawDeg: pose.headYawDeg,
    headSideDeg: pose.headSideDeg,
    shoulderProtractionDeg: pose.shoulderProtractionDeg,
    shoulderElevationDeg: pose.shoulderElevationDeg,
    shoulderLevelDeg: pose.shoulderLevelDeg,
    legMode: pose.legMode,
    leftLeg: freezeLeg(pose.leftLeg),
    rightLeg: freezeLeg(pose.rightLeg),
  });
}

function legEqual(left: MakeHumanLegBodyPartIkControlsV1, right: MakeHumanLegBodyPartIkControlsV1) {
  return (
    left.hipForwardDeg === right.hipForwardDeg &&
    left.hipSideDeg === right.hipSideDeg &&
    left.kneeBendDeg === right.kneeBendDeg &&
    left.ankleBendDeg === right.ankleBendDeg
  );
}

/** Geometry equality deliberately ignores linked/independent editor modes. */
export function modelOpenReferenceDirectPoseGeometryEqualV9(
  left: ModelOpenReferenceDirectPoseV9 | null,
  right: ModelOpenReferenceDirectPoseV9 | null,
): boolean {
  if (left === null || right === null) return left === right;
  return (
    modelOpenReferenceFullBodyPoseGeometryEqualV4(left, right) &&
    left.headPitchDeg === right.headPitchDeg &&
    left.headYawDeg === right.headYawDeg &&
    left.headSideDeg === right.headSideDeg &&
    left.shoulderProtractionDeg === right.shoulderProtractionDeg &&
    left.shoulderElevationDeg === right.shoulderElevationDeg &&
    left.shoulderLevelDeg === right.shoulderLevelDeg &&
    legEqual(left.leftLeg, right.leftLeg) &&
    legEqual(left.rightLeg, right.rightLeg)
  );
}

export function modelOpenReferenceDirectRuntimePoseV9(
  pose: ModelOpenReferenceDirectPoseV9,
): MakeHumanFullBodyLocalFkPoseV4 {
  const torso = {
    torsoFlexionDeg: pose.bodyFlexionDegrees,
    torsoSideBendDeg: pose.bodySideBendDegrees,
    torsoTwistDeg: pose.bodyTwistDegrees,
  } as const;
  const arms =
    pose.armMode === 'linked'
      ? {
          symmetry: 'bilateral' as const,
          arm: modelOpenReferenceDirectArmForIkV9(pose, 'left'),
        }
      : {
          symmetry: 'independent' as const,
          leftArm: modelOpenReferenceDirectArmForIkV9(pose, 'left'),
          rightArm: modelOpenReferenceDirectArmForIkV9(pose, 'right'),
        };
  const legs =
    pose.legMode === 'linked'
      ? { legSymmetry: 'bilateral' as const, leg: freezeLeg(pose.leftLeg) }
      : {
          legSymmetry: 'independent' as const,
          leftLeg: freezeLeg(pose.leftLeg),
          rightLeg: freezeLeg(pose.rightLeg),
        };
  return Object.freeze({
    ...torso,
    ...arms,
    headPitchDeg: pose.headPitchDeg,
    headYawDeg: pose.headYawDeg,
    headSideDeg: pose.headSideDeg,
    shoulderProtractionDeg: pose.shoulderProtractionDeg,
    shoulderElevationDeg: pose.shoulderElevationDeg,
    shoulderLevelDeg: pose.shoulderLevelDeg,
    ...legs,
  }) as MakeHumanFullBodyPoseInputV4;
}

export function modelOpenReferenceDirectArmForIkV9(
  pose: ModelOpenReferenceDirectPoseV9,
  side: ModelOpenReferenceFullBodyPoseArmSideV4,
): MakeHumanCloLikeArmControlsV3 {
  const arm = side === 'left' ? pose.leftArm : pose.rightArm;
  return Object.freeze({
    shoulderRaiseDeg: arm.shoulderRaiseDegrees,
    shoulderForwardDeg: arm.shoulderForwardDegrees,
    elbowBendDeg: arm.elbowBendDegrees,
    wristBendDeg: arm.wristBendDegrees,
  });
}

export function modelOpenReferenceDirectApplyArmIkV9(
  pose: ModelOpenReferenceDirectPoseV9,
  side: ModelOpenReferenceFullBodyPoseArmSideV4,
  arm: MakeHumanCloLikeArmControlsV3,
): ModelOpenReferenceDirectPoseV9 {
  const nextArm = Object.freeze({
    shoulderRaiseDegrees: arm.shoulderRaiseDeg,
    shoulderForwardDegrees: arm.shoulderForwardDeg,
    elbowBendDegrees: arm.elbowBendDeg,
    wristBendDegrees: arm.wristBendDeg,
  });
  return snapshotModelOpenReferenceDirectPoseV9(
    pose.armMode === 'linked'
      ? { ...pose, leftArm: nextArm, rightArm: nextArm }
      : { ...pose, [side === 'left' ? 'leftArm' : 'rightArm']: nextArm },
  );
}

export function modelOpenReferenceDirectLegForIkV9(
  pose: ModelOpenReferenceDirectPoseV9,
  side: MakeHumanLegBodyPartIkSideV1,
): MakeHumanLegBodyPartIkControlsV1 {
  return freezeLeg(side === 'left' ? pose.leftLeg : pose.rightLeg);
}

export function modelOpenReferenceDirectApplyLegIkV9(
  pose: ModelOpenReferenceDirectPoseV9,
  side: MakeHumanLegBodyPartIkSideV1,
  leg: MakeHumanLegBodyPartIkControlsV1,
): ModelOpenReferenceDirectPoseV9 {
  const nextLeg = freezeLeg(leg);
  return snapshotModelOpenReferenceDirectPoseV9(
    pose.legMode === 'linked'
      ? { ...pose, leftLeg: nextLeg, rightLeg: nextLeg }
      : { ...pose, [side === 'left' ? 'leftLeg' : 'rightLeg']: nextLeg },
  );
}

export function modelOpenReferenceDirectApplyTorsoIkV9(
  pose: ModelOpenReferenceDirectPoseV9,
  torso: Readonly<{
    torsoFlexionDeg: number;
    torsoSideBendDeg: number;
    torsoTwistDeg: number;
  }>,
): ModelOpenReferenceDirectPoseV9 {
  return snapshotModelOpenReferenceDirectPoseV9({
    ...pose,
    bodyFlexionDegrees: torso.torsoFlexionDeg,
    bodySideBendDegrees: torso.torsoSideBendDeg,
    bodyTwistDegrees: torso.torsoTwistDeg,
  });
}

export function modelOpenReferenceDirectApplyHeadV9(
  pose: ModelOpenReferenceDirectPoseV9,
  head: MakeHumanFullBodyHeadControlsV4,
): ModelOpenReferenceDirectPoseV9 {
  return snapshotModelOpenReferenceDirectPoseV9({ ...pose, ...head });
}

export function modelOpenReferenceDirectShoulderPostureV9(
  pose: ModelOpenReferenceDirectPoseV9,
): MakeHumanShoulderPostureControlsV4 {
  return Object.freeze({
    shoulderProtractionDeg: pose.shoulderProtractionDeg,
    shoulderElevationDeg: pose.shoulderElevationDeg,
    shoulderLevelDeg: pose.shoulderLevelDeg,
  });
}

export function modelOpenReferenceDirectApplyShoulderPostureV9(
  pose: ModelOpenReferenceDirectPoseV9,
  posture: MakeHumanShoulderPostureControlsV4,
): ModelOpenReferenceDirectPoseV9 {
  return snapshotModelOpenReferenceDirectPoseV9({ ...pose, ...posture });
}

function quantizeShoulderPostureChannelV9(
  value: number,
  definition: Readonly<{ minimumDeg: number; maximumDeg: number; stepDeg: number }>,
) {
  const clamped = Math.min(definition.maximumDeg, Math.max(definition.minimumDeg, value));
  const quantized =
    definition.minimumDeg +
    Math.round((clamped - definition.minimumDeg) / definition.stepDeg) * definition.stepDeg;
  return Object.is(quantized, -0) ? 0 : quantized;
}

/**
 * Converts direct shoulder-marker travel into conservative shoulder-girdle channels. The stage
 * supplies a world-space target on its camera-facing drag plane: vertical travel controls common
 * elevation while arms are linked and side-specific level while independent; anterior travel is
 * world -Z and controls protraction in either mode.
 */
export function modelOpenReferenceDirectSolveShoulderPostureDragV9(options: {
  readonly side: ModelOpenReferenceFullBodyPoseArmSideV4;
  readonly linked: boolean;
  readonly sourceM: readonly [number, number, number];
  readonly targetM: readonly [number, number, number];
  readonly current: MakeHumanShoulderPostureControlsV4;
}): MakeHumanShoulderPostureControlsV4 {
  const deltaY = options.targetM[1] - options.sourceM[1];
  const deltaZ = options.targetM[2] - options.sourceM[2];
  const sideSign = options.side === 'left' ? 1 : -1;
  const commonElevation = options.linked
    ? options.current.shoulderElevationDeg + deltaY * 60
    : options.current.shoulderElevationDeg;
  const level = options.linked
    ? options.current.shoulderLevelDeg
    : options.current.shoulderLevelDeg + deltaY * 40 * sideSign;
  return Object.freeze({
    shoulderProtractionDeg: quantizeShoulderPostureChannelV9(
      options.current.shoulderProtractionDeg - deltaZ * 80,
      MAKEHUMAN_SHOULDER_POSTURE_ENVELOPE_V4.shoulderProtractionDeg,
    ),
    shoulderElevationDeg: quantizeShoulderPostureChannelV9(
      commonElevation,
      MAKEHUMAN_SHOULDER_POSTURE_ENVELOPE_V4.shoulderElevationDeg,
    ),
    shoulderLevelDeg: quantizeShoulderPostureChannelV9(
      level,
      MAKEHUMAN_SHOULDER_POSTURE_ENVELOPE_V4.shoulderLevelDeg,
    ),
  });
}

export function modelOpenReferenceDirectToggleSymmetryV9(
  pose: ModelOpenReferenceDirectPoseV9,
): ModelOpenReferenceDirectPoseV9 {
  if (pose.armMode === 'linked' && pose.legMode === 'linked') {
    return snapshotModelOpenReferenceDirectPoseV9({
      ...pose,
      armMode: 'independent',
      legMode: 'independent',
    });
  }
  return snapshotModelOpenReferenceDirectPoseV9({
    ...pose,
    armMode: 'linked',
    rightArm: pose.leftArm,
    legMode: 'linked',
    rightLeg: pose.leftLeg,
  });
}
