import {
  MAKEHUMAN_CLO_LIKE_POSE_CHANNELS_V3,
  type MakeHumanCloLikeTorsoControlsV3,
} from './makehuman-clo-like-pose-display-v3';
import type {
  MakeHumanLocalJointMatrix3V3,
  MakeHumanLocalJointVec3V3,
} from './makehuman-local-joint-frame-research-v3';

export const MAKEHUMAN_TORSO_AIM_IK_V1 = 'makehuman-torso-aim-ik/v1' as const;

export interface MakeHumanTorsoAimIkInputV1 {
  /** Chest/spine pivot kept fixed by this position-only interaction. */
  readonly torsoPivotM: MakeHumanLocalJointVec3V3;
  /** Current head marker at pointerdown. */
  readonly headM: MakeHumanLocalJointVec3V3;
  /** Row-major orthonormal matrix whose columns are current torso local X/Y/Z axes. */
  readonly torsoLocalToWorld: MakeHumanLocalJointMatrix3V3;
  readonly targetHeadM: MakeHumanLocalJointVec3V3;
  /** Snapshot this value on pointerdown and reuse it for every pointermove. */
  readonly currentTorso: MakeHumanCloLikeTorsoControlsV3;
}

export type MakeHumanTorsoAimIkClampReasonV1 =
  | 'target-radius-mismatch'
  | 'torso-flexion-limit'
  | 'torso-side-bend-limit';

export interface MakeHumanTorsoAimIkResultV1 {
  readonly version: typeof MAKEHUMAN_TORSO_AIM_IK_V1;
  readonly torso: MakeHumanCloLikeTorsoControlsV3;
  readonly requestedTargetHeadM: MakeHumanLocalJointVec3V3;
  readonly achievedTargetHeadM: MakeHumanLocalJointVec3V3;
  readonly targetErrorM: number;
  readonly status: 'reached' | 'clamped';
  readonly clampReasons: readonly MakeHumanTorsoAimIkClampReasonV1[];
  readonly claims: Readonly<{
    bodyPartInverseKinematicsApplied: true;
    positionTargetOnly: true;
    fixedLengthTorsoAimApproximation: true;
    productInteractionEnvelopeApplied: true;
    headNeckArticulationApplied: false;
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
const CLAIMS = Object.freeze({
  bodyPartInverseKinematicsApplied: true as const,
  positionTargetOnly: true as const,
  fixedLengthTorsoAimApproximation: true as const,
  productInteractionEnvelopeApplied: true as const,
  headNeckArticulationApplied: false as const,
  clinicalAnatomicalRangeAuthority: false as const,
  garmentPairEvaluated: false as const,
  fitClaimEligible: false as const,
  runtimeCollisionEligible: false as const,
  productionAuthority: false as const,
});

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
    throw new RangeError('torsoLocalToWorld must contain nine finite values.');
  }
  const columns = [
    [value[0], value[3], value[6]],
    [value[1], value[4], value[7]],
    [value[2], value[5], value[8]],
  ] as const;
  for (let column = 0; column < 3; column += 1) {
    if (Math.abs(dot(columns[column], columns[column]) - 1) > ORTHONORMAL_TOLERANCE) {
      throw new RangeError('torsoLocalToWorld must be orthonormal.');
    }
    for (let other = column + 1; other < 3; other += 1) {
      if (Math.abs(dot(columns[column], columns[other])) > ORTHONORMAL_TOLERANCE) {
        throw new RangeError('torsoLocalToWorld must be orthonormal.');
      }
    }
  }
  const determinant =
    value[0] * (value[4] * value[8] - value[5] * value[7]) -
    value[1] * (value[3] * value[8] - value[5] * value[6]) +
    value[2] * (value[3] * value[7] - value[4] * value[6]);
  if (Math.abs(determinant - 1) > ORTHONORMAL_TOLERANCE) {
    throw new RangeError('torsoLocalToWorld must be right-handed.');
  }
  return value;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function admittedCurrentTorso(value: MakeHumanCloLikeTorsoControlsV3) {
  const result = { ...value };
  for (const channel of ['torsoFlexionDeg', 'torsoSideBendDeg', 'torsoTwistDeg'] as const) {
    const definition = MAKEHUMAN_CLO_LIKE_POSE_CHANNELS_V3[channel];
    const channelValue = result[channel];
    const stepIndex = (channelValue - definition.minimumDeg) / definition.stepDeg;
    if (
      !Number.isFinite(channelValue) ||
      channelValue < definition.minimumDeg ||
      channelValue > definition.maximumDeg ||
      Math.abs(stepIndex - Math.round(stepIndex)) > 1e-9
    ) {
      throw new RangeError(`currentTorso.${channel} is outside the envelope.`);
    }
  }
  return Object.freeze(result);
}

function clampChannel(
  value: number,
  channel: 'torsoFlexionDeg' | 'torsoSideBendDeg',
): Readonly<{ value: number; clamped: boolean }> {
  const definition = MAKEHUMAN_CLO_LIKE_POSE_CHANNELS_V3[channel];
  const bounded = clamp(value, definition.minimumDeg, definition.maximumDeg);
  const snapped =
    definition.minimumDeg +
    Math.round((bounded - definition.minimumDeg) / definition.stepDeg) * definition.stepDeg;
  const normalized = Object.is(snapped, -0) ? 0 : snapped;
  return Object.freeze({ value: normalized, clamped: Math.abs(normalized - value) > 1e-7 });
}

function rotateXThenZ(
  point: MakeHumanLocalJointVec3V3,
  xDeg: number,
  zDeg: number,
): MakeHumanLocalJointVec3V3 {
  const x = xDeg * RAD;
  const z = zDeg * RAD;
  const afterX: MakeHumanLocalJointVec3V3 = [
    point[0],
    Math.cos(x) * point[1] - Math.sin(x) * point[2],
    Math.sin(x) * point[1] + Math.cos(x) * point[2],
  ];
  return [
    Math.cos(z) * afterX[0] - Math.sin(z) * afterX[1],
    Math.sin(z) * afterX[0] + Math.cos(z) * afterX[1],
    afterX[2],
  ];
}

/**
 * A fixed-length, position-only torso aim solver for direct chest/head dragging. It maps the target
 * onto the existing flexion and side-bend channels and intentionally preserves torso twist. The
 * present rig has no independent neck/head channels, so this function reports that limitation
 * explicitly instead of fabricating head articulation.
 */
export function solveMakeHumanTorsoAimIkV1(
  input: MakeHumanTorsoAimIkInputV1,
): MakeHumanTorsoAimIkResultV1 {
  const pivotM = vector(input.torsoPivotM, 'torsoPivotM');
  const headM = vector(input.headM, 'headM');
  const targetHeadM = vector(input.targetHeadM, 'targetHeadM');
  const frame = validatedFrame(input.torsoLocalToWorld);
  const currentTorso = admittedCurrentTorso(input.currentTorso);
  const currentLocal = worldToLocal(frame, subtract(headM, pivotM));
  const targetLocal = worldToLocal(frame, subtract(targetHeadM, pivotM));
  const currentRadius = length(currentLocal);
  const targetRadius = length(targetLocal);
  if (currentRadius <= EPSILON_M || targetRadius <= EPSILON_M) {
    throw new RangeError('Torso aim requires non-degenerate current and target head vectors.');
  }

  const currentPitch = Math.atan2(currentLocal[2], currentLocal[1]);
  const targetPitch = Math.atan2(targetLocal[2], targetLocal[1]);
  const currentSide = Math.atan2(-currentLocal[0], Math.hypot(currentLocal[1], currentLocal[2]));
  const targetSide = Math.atan2(-targetLocal[0], Math.hypot(targetLocal[1], targetLocal[2]));
  const flexion = clampChannel(
    currentTorso.torsoFlexionDeg + (targetPitch - currentPitch) * DEG,
    'torsoFlexionDeg',
  );
  const sideBend = clampChannel(
    currentTorso.torsoSideBendDeg + (targetSide - currentSide) * DEG,
    'torsoSideBendDeg',
  );
  const clampReasons: MakeHumanTorsoAimIkClampReasonV1[] = [];
  if (Math.abs(targetRadius - currentRadius) > 0.005) clampReasons.push('target-radius-mismatch');
  if (flexion.clamped) clampReasons.push('torso-flexion-limit');
  if (sideBend.clamped) clampReasons.push('torso-side-bend-limit');

  const torso = Object.freeze({
    torsoFlexionDeg: flexion.value,
    torsoSideBendDeg: sideBend.value,
    torsoTwistDeg: currentTorso.torsoTwistDeg,
  });
  const achievedLocal = rotateXThenZ(
    currentLocal,
    torso.torsoFlexionDeg - currentTorso.torsoFlexionDeg,
    torso.torsoSideBendDeg - currentTorso.torsoSideBendDeg,
  );
  const achievedTargetHeadM = vector(
    add(pivotM, localToWorld(frame, achievedLocal)),
    'achievedTargetHeadM',
  );
  const targetErrorM = length(subtract(achievedTargetHeadM, targetHeadM));

  return Object.freeze({
    version: MAKEHUMAN_TORSO_AIM_IK_V1,
    torso,
    requestedTargetHeadM: targetHeadM,
    achievedTargetHeadM,
    targetErrorM,
    status: clampReasons.length === 0 && targetErrorM <= 0.01 ? 'reached' : 'clamped',
    clampReasons: Object.freeze([...new Set(clampReasons)]),
    claims: CLAIMS,
  });
}
