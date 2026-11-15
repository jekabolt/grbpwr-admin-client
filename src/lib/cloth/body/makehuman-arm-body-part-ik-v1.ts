import {
  MAKEHUMAN_CLO_LIKE_POSE_CHANNELS_V3,
  type MakeHumanCloLikeArmControlsV3,
} from './makehuman-clo-like-pose-display-v3';
import type { MakeHumanArmSideSeamAssistResultV1 } from './makehuman-arm-side-seam-assist-v1';
import type { MakeHumanFullBodyLocalFkPoseV3 } from './makehuman-full-body-local-fk-runtime-v3';
import type {
  MakeHumanLocalJointMatrix3V3,
  MakeHumanLocalJointVec3V3,
} from './makehuman-local-joint-frame-research-v3';

export const MAKEHUMAN_ARM_BODY_PART_IK_V1 = 'makehuman-arm-body-part-ik/v1' as const;

export type MakeHumanArmBodyPartIkSideV1 = 'left' | 'right';

export interface MakeHumanArmBodyPartIkInputV1 {
  readonly side: MakeHumanArmBodyPartIkSideV1;
  readonly shoulderM: MakeHumanLocalJointVec3V3;
  readonly elbowM: MakeHumanLocalJointVec3V3;
  readonly wristM: MakeHumanLocalJointVec3V3;
  /** Row-major orthonormal matrix whose columns are the shoulder's local X/Y/Z axes. */
  readonly shoulderLocalToWorld: MakeHumanLocalJointMatrix3V3;
  readonly targetWristM: MakeHumanLocalJointVec3V3;
  /**
   * Pose represented by the supplied joints/frame. Keep this drag-start snapshot stable across
   * pointer-move calls while changing targetWristM.
   */
  readonly currentArm?: MakeHumanCloLikeArmControlsV3;
  /** Retained because this solver does not infer hand orientation from a position-only target. */
  readonly wristBendDeg?: number;
  /** Optional authenticated-rig snap used when the pointer approaches the outer hip side seam. */
  readonly sideSeamAssist?: MakeHumanArmSideSeamAssistResultV1;
}

export type MakeHumanArmBodyPartIkClampReasonV1 =
  | 'target-too-close'
  | 'target-too-far'
  | 'shoulder-raise-limit'
  | 'shoulder-forward-limit'
  | 'elbow-bend-limit';

export interface MakeHumanArmBodyPartIkResultV1 {
  readonly version: typeof MAKEHUMAN_ARM_BODY_PART_IK_V1;
  readonly side: MakeHumanArmBodyPartIkSideV1;
  readonly arm: MakeHumanCloLikeArmControlsV3;
  readonly requestedTargetWristM: MakeHumanLocalJointVec3V3;
  readonly achievedTargetWristM: MakeHumanLocalJointVec3V3;
  readonly targetErrorM: number;
  readonly status: 'reached' | 'clamped';
  readonly interaction: 'free-target' | 'side-seam-snap';
  readonly sideSeamAssistApplied: boolean;
  readonly clampReasons: readonly MakeHumanArmBodyPartIkClampReasonV1[];
  readonly lengthsM: Readonly<{
    upperArm: number;
    lowerArm: number;
    requestedReach: number;
    solvedReach: number;
  }>;
  readonly claims: Readonly<{
    bodyPartInverseKinematicsApplied: true;
    sideSeamAssistApplied: boolean;
    positionTargetOnly: true;
    productInteractionEnvelopeApplied: true;
    clinicalAnatomicalRangeAuthority: false;
    garmentPairEvaluated: false;
    fitClaimEligible: false;
    runtimeCollisionEligible: false;
    productionAuthority: false;
  }>;
}

const EPSILON_M = 1e-6;
const ORTHONORMAL_TOLERANCE = 1e-5;
const DEG = 180 / Math.PI;
const RAD = Math.PI / 180;
function claims(sideSeamAssistApplied: boolean) {
  return Object.freeze({
    bodyPartInverseKinematicsApplied: true as const,
    sideSeamAssistApplied,
    positionTargetOnly: true as const,
    productInteractionEnvelopeApplied: true as const,
    clinicalAnatomicalRangeAuthority: false as const,
    garmentPairEvaluated: false as const,
    fitClaimEligible: false as const,
    runtimeCollisionEligible: false as const,
    productionAuthority: false as const,
  });
}

function vector(value: ArrayLike<number>, label: string): MakeHumanLocalJointVec3V3 {
  if (value.length !== 3) throw new RangeError(`${label} must contain exactly three values.`);
  const result = [value[0], value[1], value[2]] as const;
  if (!result.every(Number.isFinite)) throw new RangeError(`${label} must be finite.`);
  return Object.freeze(result);
}

function subtract(
  left: MakeHumanLocalJointVec3V3,
  right: MakeHumanLocalJointVec3V3,
): MakeHumanLocalJointVec3V3 {
  return [left[0] - right[0], left[1] - right[1], left[2] - right[2]];
}

function add(
  left: MakeHumanLocalJointVec3V3,
  right: MakeHumanLocalJointVec3V3,
): MakeHumanLocalJointVec3V3 {
  return [left[0] + right[0], left[1] + right[1], left[2] + right[2]];
}

function length(value: MakeHumanLocalJointVec3V3): number {
  return Math.hypot(value[0], value[1], value[2]);
}

function dot(left: readonly number[], right: readonly number[]): number {
  return left[0] * right[0] + left[1] * right[1] + left[2] * right[2];
}

function localToWorld(
  matrix: MakeHumanLocalJointMatrix3V3,
  point: MakeHumanLocalJointVec3V3,
): MakeHumanLocalJointVec3V3 {
  return [
    matrix[0] * point[0] + matrix[1] * point[1] + matrix[2] * point[2],
    matrix[3] * point[0] + matrix[4] * point[1] + matrix[5] * point[2],
    matrix[6] * point[0] + matrix[7] * point[1] + matrix[8] * point[2],
  ];
}

function worldToLocal(
  matrix: MakeHumanLocalJointMatrix3V3,
  point: MakeHumanLocalJointVec3V3,
): MakeHumanLocalJointVec3V3 {
  return [
    matrix[0] * point[0] + matrix[3] * point[1] + matrix[6] * point[2],
    matrix[1] * point[0] + matrix[4] * point[1] + matrix[7] * point[2],
    matrix[2] * point[0] + matrix[5] * point[1] + matrix[8] * point[2],
  ];
}

function validatedFrame(value: MakeHumanLocalJointMatrix3V3): MakeHumanLocalJointMatrix3V3 {
  if (value.length !== 9 || !value.every(Number.isFinite)) {
    throw new RangeError('shoulderLocalToWorld must contain nine finite values.');
  }
  const columns = [
    [value[0], value[3], value[6]],
    [value[1], value[4], value[7]],
    [value[2], value[5], value[8]],
  ] as const;
  for (let column = 0; column < 3; column += 1) {
    if (Math.abs(dot(columns[column], columns[column]) - 1) > ORTHONORMAL_TOLERANCE) {
      throw new RangeError('shoulderLocalToWorld must be orthonormal.');
    }
    for (let other = column + 1; other < 3; other += 1) {
      if (Math.abs(dot(columns[column], columns[other])) > ORTHONORMAL_TOLERANCE) {
        throw new RangeError('shoulderLocalToWorld must be orthonormal.');
      }
    }
  }
  const determinant =
    value[0] * (value[4] * value[8] - value[5] * value[7]) -
    value[1] * (value[3] * value[8] - value[5] * value[6]) +
    value[2] * (value[3] * value[7] - value[4] * value[6]);
  if (Math.abs(determinant - 1) > ORTHONORMAL_TOLERANCE) {
    throw new RangeError('shoulderLocalToWorld must be right-handed.');
  }
  return value;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function clampChannel(
  value: number,
  channel: keyof typeof MAKEHUMAN_CLO_LIKE_POSE_CHANNELS_V3,
): Readonly<{ value: number; clamped: boolean; snapped: boolean }> {
  const definition = MAKEHUMAN_CLO_LIKE_POSE_CHANNELS_V3[channel];
  const bounded = clamp(value, definition.minimumDeg, definition.maximumDeg);
  const snapped =
    definition.minimumDeg +
    Math.round((bounded - definition.minimumDeg) / definition.stepDeg) * definition.stepDeg;
  const normalized = Object.is(snapped, -0) ? 0 : snapped;
  return Object.freeze({
    value: normalized,
    clamped: Math.abs(bounded - value) > 1e-7,
    snapped: Math.abs(normalized - bounded) > 1e-7,
  });
}

function admittedCurrentArm(value: MakeHumanCloLikeArmControlsV3 | undefined) {
  const candidate =
    value ??
    Object.freeze({
      shoulderRaiseDeg: 0,
      shoulderForwardDeg: 0,
      elbowBendDeg: 0,
      wristBendDeg: 0,
    });
  for (const channel of [
    'shoulderRaiseDeg',
    'shoulderForwardDeg',
    'elbowBendDeg',
    'wristBendDeg',
  ] as const) {
    const admitted = clampChannel(candidate[channel], channel);
    if (admitted.clamped || admitted.snapped) {
      throw new RangeError(`currentArm.${channel} is outside the envelope.`);
    }
  }
  return candidate;
}

function forwardWristLocal(options: {
  readonly side: MakeHumanArmBodyPartIkSideV1;
  readonly upperArmLength: number;
  readonly lowerArmLength: number;
  readonly shoulderRaiseDeg: number;
  readonly shoulderForwardDeg: number;
  readonly elbowBendDeg: number;
}): MakeHumanLocalJointVec3V3 {
  const sideSign = options.side === 'left' ? 1 : -1;
  const shoulderX = sideSign * options.shoulderRaiseDeg * RAD;
  const shoulderZ = options.shoulderForwardDeg * RAD;
  const elbowZ = -options.elbowBendDeg * RAD;
  const beforeShoulder: MakeHumanLocalJointVec3V3 = [
    -options.lowerArmLength * Math.sin(elbowZ),
    options.upperArmLength + options.lowerArmLength * Math.cos(elbowZ),
    0,
  ];
  const afterX: MakeHumanLocalJointVec3V3 = [
    beforeShoulder[0],
    Math.cos(shoulderX) * beforeShoulder[1] - Math.sin(shoulderX) * beforeShoulder[2],
    Math.sin(shoulderX) * beforeShoulder[1] + Math.cos(shoulderX) * beforeShoulder[2],
  ];
  return [
    Math.cos(shoulderZ) * afterX[0] - Math.sin(shoulderZ) * afterX[1],
    Math.sin(shoulderZ) * afterX[0] + Math.cos(shoulderZ) * afterX[1],
    afterX[2],
  ];
}

/**
 * Solves a deterministic position-only two-bone arm target in the shoulder marker's local frame.
 * Shoulder raise uses local X while shoulder-forward and elbow flex use the rig's local Z plane.
 * Targets outside the reachable/product envelope are projected to the closest admitted pose.
 */
export function solveMakeHumanArmBodyPartIkV1(
  input: MakeHumanArmBodyPartIkInputV1,
): MakeHumanArmBodyPartIkResultV1 {
  if (input.side !== 'left' && input.side !== 'right') {
    throw new RangeError('Arm IK side must be left or right.');
  }
  const shoulderM = vector(input.shoulderM, 'shoulderM');
  const elbowM = vector(input.elbowM, 'elbowM');
  const wristM = vector(input.wristM, 'wristM');
  const targetWristM = vector(input.targetWristM, 'targetWristM');
  const shoulderLocalToWorld = validatedFrame(input.shoulderLocalToWorld);
  const dragStartArm = admittedCurrentArm(input.currentArm);
  const upperArmLength = length(subtract(elbowM, shoulderM));
  const lowerArmLength = length(subtract(wristM, elbowM));
  if (upperArmLength <= EPSILON_M || lowerArmLength <= EPSILON_M) {
    throw new RangeError('Arm IK requires non-degenerate upper and lower arm segments.');
  }

  const requestedTargetLocal = worldToLocal(
    shoulderLocalToWorld,
    subtract(targetWristM, shoulderM),
  );
  const requestedReach = length(requestedTargetLocal);
  if (!Number.isFinite(requestedReach) || requestedReach <= EPSILON_M) {
    throw new RangeError('Arm IK target must not coincide with the shoulder.');
  }

  const clampReasons: MakeHumanArmBodyPartIkClampReasonV1[] = [];
  const minimumReach = Math.abs(upperArmLength - lowerArmLength);
  const maximumReach = upperArmLength + lowerArmLength;
  const solvedReach = clamp(requestedReach, minimumReach, maximumReach);

  if (input.sideSeamAssist) {
    const assist = input.sideSeamAssist;
    if (
      assist.side !== input.side ||
      !assist.metrics.sideSeamEligible ||
      !Number.isFinite(assist.activationRadiusM) ||
      assist.activationRadiusM <= 0 ||
      length(subtract(assist.shoulderM, shoulderM)) > assist.activationRadiusM
    ) {
      throw new Error('Arm IK side-seam assist does not match the active authenticated arm.');
    }
    const snapDistanceM = length(subtract(targetWristM, assist.wristM));
    if (snapDistanceM <= assist.activationRadiusM) {
      const retainedWrist = clampChannel(
        input.wristBendDeg ?? dragStartArm.wristBendDeg,
        'wristBendDeg',
      );
      const arm = admittedCurrentArm(
        Object.freeze({ ...assist.arm, wristBendDeg: retainedWrist.value }),
      );
      return Object.freeze({
        version: MAKEHUMAN_ARM_BODY_PART_IK_V1,
        side: input.side,
        arm,
        requestedTargetWristM: targetWristM,
        achievedTargetWristM: assist.wristM,
        targetErrorM: snapDistanceM,
        status: 'reached',
        interaction: 'side-seam-snap',
        sideSeamAssistApplied: true,
        clampReasons: Object.freeze([]),
        lengthsM: Object.freeze({
          upperArm: upperArmLength,
          lowerArm: lowerArmLength,
          requestedReach,
          solvedReach: length(subtract(assist.wristM, shoulderM)),
        }),
        claims: claims(true),
      });
    }
  }
  if (requestedReach < minimumReach) clampReasons.push('target-too-close');
  if (requestedReach > maximumReach) clampReasons.push('target-too-far');

  const targetDirection: MakeHumanLocalJointVec3V3 = [
    requestedTargetLocal[0] / requestedReach,
    requestedTargetLocal[1] / requestedReach,
    requestedTargetLocal[2] / requestedReach,
  ];
  const elbowRadians = Math.acos(
    clamp(
      (solvedReach * solvedReach -
        upperArmLength * upperArmLength -
        lowerArmLength * lowerArmLength) /
        (2 * upperArmLength * lowerArmLength),
      -1,
      1,
    ),
  );
  const sideSign = input.side === 'left' ? 1 : -1;
  const bentLocalX = lowerArmLength * Math.sin(elbowRadians);
  const bentLocalY = upperArmLength + lowerArmLength * Math.cos(elbowRadians);
  const targetLocalZ = targetDirection[2] * solvedReach;
  const shoulderRaiseDeltaRadians = Math.asin(
    clamp(targetLocalZ / Math.max(EPSILON_M, bentLocalY), -1, 1),
  );
  const raisedLocalY = Math.cos(shoulderRaiseDeltaRadians) * bentLocalY;
  const targetAngleRadians = Math.atan2(
    targetDirection[1] * solvedReach,
    targetDirection[0] * solvedReach,
  );
  const bentAngleRadians = Math.atan2(raisedLocalY, bentLocalX);
  const rawShoulderForwardDeg =
    dragStartArm.shoulderForwardDeg +
    Math.atan2(
      Math.sin(targetAngleRadians - bentAngleRadians),
      Math.cos(targetAngleRadians - bentAngleRadians),
    ) *
      DEG;
  const rawShoulderRaiseDeg =
    dragStartArm.shoulderRaiseDeg + sideSign * shoulderRaiseDeltaRadians * DEG;
  const rawElbowBendDeg = elbowRadians * DEG;

  const shoulderRaise = clampChannel(rawShoulderRaiseDeg, 'shoulderRaiseDeg');
  const shoulderForward = clampChannel(rawShoulderForwardDeg, 'shoulderForwardDeg');
  const elbowBend = clampChannel(rawElbowBendDeg, 'elbowBendDeg');
  const wristBend = clampChannel(input.wristBendDeg ?? dragStartArm.wristBendDeg, 'wristBendDeg');
  if (shoulderRaise.clamped) clampReasons.push('shoulder-raise-limit');
  if (shoulderForward.clamped) clampReasons.push('shoulder-forward-limit');
  if (elbowBend.clamped) clampReasons.push('elbow-bend-limit');

  const arm = Object.freeze({
    shoulderRaiseDeg: shoulderRaise.value,
    shoulderForwardDeg: shoulderForward.value,
    elbowBendDeg: elbowBend.value,
    wristBendDeg: wristBend.value,
  });
  const achievedLocal = forwardWristLocal({
    side: input.side,
    upperArmLength,
    lowerArmLength,
    shoulderRaiseDeg: arm.shoulderRaiseDeg - dragStartArm.shoulderRaiseDeg,
    shoulderForwardDeg: arm.shoulderForwardDeg - dragStartArm.shoulderForwardDeg,
    elbowBendDeg: arm.elbowBendDeg,
  });
  const achievedTargetWristM = vector(
    add(shoulderM, localToWorld(shoulderLocalToWorld, achievedLocal)),
    'achievedTargetWristM',
  );
  const targetErrorM = length(subtract(achievedTargetWristM, targetWristM));
  // One-degree channel quantization can create a small miss even without a limit clamp.
  const quantizationToleranceM = Math.max(
    0.002,
    (upperArmLength + lowerArmLength) * Math.sin(0.5 * RAD) * 2,
  );
  const status =
    clampReasons.length === 0 && targetErrorM <= quantizationToleranceM ? 'reached' : 'clamped';

  return Object.freeze({
    version: MAKEHUMAN_ARM_BODY_PART_IK_V1,
    side: input.side,
    arm,
    requestedTargetWristM: targetWristM,
    achievedTargetWristM,
    targetErrorM,
    status,
    interaction: 'free-target',
    sideSeamAssistApplied: false,
    clampReasons: Object.freeze([...new Set(clampReasons)]),
    lengthsM: Object.freeze({
      upperArm: upperArmLength,
      lowerArm: lowerArmLength,
      requestedReach,
      solvedReach,
    }),
    claims: claims(false),
  });
}

/** Applies a solved arm without mutating the opposite side of an independent pose. */
export function applyMakeHumanArmBodyPartIkV1(options: {
  readonly pose: MakeHumanFullBodyLocalFkPoseV3;
  readonly side: MakeHumanArmBodyPartIkSideV1;
  readonly arm: MakeHumanCloLikeArmControlsV3;
}): MakeHumanFullBodyLocalFkPoseV3 {
  const arm = Object.freeze({ ...options.arm });
  if (options.pose.symmetry === 'bilateral') {
    return Object.freeze({ ...options.pose, arm });
  }
  return Object.freeze({
    ...options.pose,
    [options.side === 'left' ? 'leftArm' : 'rightArm']: arm,
  });
}
