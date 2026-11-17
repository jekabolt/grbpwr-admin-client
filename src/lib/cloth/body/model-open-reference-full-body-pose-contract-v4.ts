import { MAKEHUMAN_CLO_LIKE_POSE_CHANNELS_V3 } from './makehuman-clo-like-pose-display-v3';

export const MODEL_OPEN_REFERENCE_FULL_BODY_POSE_LIMITS_V4 = Object.freeze({
  bodyFlexionDegrees: Object.freeze({
    min: MAKEHUMAN_CLO_LIKE_POSE_CHANNELS_V3.torsoFlexionDeg.minimumDeg,
    max: MAKEHUMAN_CLO_LIKE_POSE_CHANNELS_V3.torsoFlexionDeg.maximumDeg,
    step: MAKEHUMAN_CLO_LIKE_POSE_CHANNELS_V3.torsoFlexionDeg.stepDeg,
  }),
  bodySideBendDegrees: Object.freeze({
    min: MAKEHUMAN_CLO_LIKE_POSE_CHANNELS_V3.torsoSideBendDeg.minimumDeg,
    max: MAKEHUMAN_CLO_LIKE_POSE_CHANNELS_V3.torsoSideBendDeg.maximumDeg,
    step: MAKEHUMAN_CLO_LIKE_POSE_CHANNELS_V3.torsoSideBendDeg.stepDeg,
  }),
  bodyTwistDegrees: Object.freeze({
    min: MAKEHUMAN_CLO_LIKE_POSE_CHANNELS_V3.torsoTwistDeg.minimumDeg,
    max: MAKEHUMAN_CLO_LIKE_POSE_CHANNELS_V3.torsoTwistDeg.maximumDeg,
    step: MAKEHUMAN_CLO_LIKE_POSE_CHANNELS_V3.torsoTwistDeg.stepDeg,
  }),
  shoulderRaiseDegrees: Object.freeze({
    min: MAKEHUMAN_CLO_LIKE_POSE_CHANNELS_V3.shoulderRaiseDeg.minimumDeg,
    max: MAKEHUMAN_CLO_LIKE_POSE_CHANNELS_V3.shoulderRaiseDeg.maximumDeg,
    step: MAKEHUMAN_CLO_LIKE_POSE_CHANNELS_V3.shoulderRaiseDeg.stepDeg,
  }),
  shoulderForwardDegrees: Object.freeze({
    min: MAKEHUMAN_CLO_LIKE_POSE_CHANNELS_V3.shoulderForwardDeg.minimumDeg,
    max: MAKEHUMAN_CLO_LIKE_POSE_CHANNELS_V3.shoulderForwardDeg.maximumDeg,
    step: MAKEHUMAN_CLO_LIKE_POSE_CHANNELS_V3.shoulderForwardDeg.stepDeg,
  }),
  elbowBendDegrees: Object.freeze({
    min: MAKEHUMAN_CLO_LIKE_POSE_CHANNELS_V3.elbowBendDeg.minimumDeg,
    max: MAKEHUMAN_CLO_LIKE_POSE_CHANNELS_V3.elbowBendDeg.maximumDeg,
    step: MAKEHUMAN_CLO_LIKE_POSE_CHANNELS_V3.elbowBendDeg.stepDeg,
  }),
  wristBendDegrees: Object.freeze({
    min: MAKEHUMAN_CLO_LIKE_POSE_CHANNELS_V3.wristBendDeg.minimumDeg,
    max: MAKEHUMAN_CLO_LIKE_POSE_CHANNELS_V3.wristBendDeg.maximumDeg,
    step: MAKEHUMAN_CLO_LIKE_POSE_CHANNELS_V3.wristBendDeg.stepDeg,
  }),
} as const);

export type ModelOpenReferenceFullBodyPoseBodyFieldV4 =
  'bodyFlexionDegrees' | 'bodySideBendDegrees' | 'bodyTwistDegrees';
export type ModelOpenReferenceFullBodyPoseArmFieldV4 =
  'shoulderRaiseDegrees' | 'shoulderForwardDegrees' | 'elbowBendDegrees' | 'wristBendDegrees';
export type ModelOpenReferenceFullBodyPoseArmSideV4 = 'left' | 'right';

export interface ModelOpenReferenceFullBodyArmPoseV4 {
  readonly shoulderRaiseDegrees: number;
  readonly shoulderForwardDegrees: number;
  readonly elbowBendDegrees: number;
  readonly wristBendDegrees: number;
}

export interface ModelOpenReferenceFullBodyPoseV4 {
  readonly bodyFlexionDegrees: number;
  readonly bodySideBendDegrees: number;
  readonly bodyTwistDegrees: number;
  readonly armMode: 'linked' | 'independent';
  readonly leftArm: ModelOpenReferenceFullBodyArmPoseV4;
  readonly rightArm: ModelOpenReferenceFullBodyArmPoseV4;
}
