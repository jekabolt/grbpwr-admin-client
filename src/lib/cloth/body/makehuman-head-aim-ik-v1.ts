import {
  MAKEHUMAN_FULL_BODY_HEAD_ENVELOPE_V4,
  type MakeHumanFullBodyHeadControlsV4,
} from './makehuman-full-body-pose-v4';
import type {
  MakeHumanLocalJointMatrix3V3,
  MakeHumanLocalJointVec3V3,
} from './makehuman-local-joint-frame-research-v3';

export const MAKEHUMAN_HEAD_AIM_IK_V1 = 'makehuman-head-aim-ik/v1' as const;

export interface MakeHumanHeadAimIkInputV1 {
  readonly neckPivotM: MakeHumanLocalJointVec3V3;
  readonly headTipM: MakeHumanLocalJointVec3V3;
  readonly headLocalToWorld: MakeHumanLocalJointMatrix3V3;
  readonly targetHeadTipM: MakeHumanLocalJointVec3V3;
  readonly currentHead: MakeHumanFullBodyHeadControlsV4;
}

export interface MakeHumanHeadAimIkResultV1 {
  readonly version: typeof MAKEHUMAN_HEAD_AIM_IK_V1;
  readonly head: MakeHumanFullBodyHeadControlsV4;
  readonly requestedTargetHeadTipM: MakeHumanLocalJointVec3V3;
  readonly achievedTargetHeadTipM: MakeHumanLocalJointVec3V3;
  readonly targetErrorM: number;
  readonly status: 'reached' | 'clamped';
  readonly clampReasons: readonly (
    | 'target-radius-mismatch'
    | 'head-pitch-limit'
    | 'head-side-limit'
  )[];
}

const EPSILON_M = 1e-6;
const DEG = 180 / Math.PI;
const RAD = Math.PI / 180;

function vector(value: ArrayLike<number>, label: string): MakeHumanLocalJointVec3V3 {
  if (value.length !== 3) throw new RangeError(`${label} must contain exactly three values.`);
  const result = [value[0], value[1], value[2]] as const;
  if (!result.every(Number.isFinite)) throw new RangeError(`${label} must be finite.`);
  return result;
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

function length(value: MakeHumanLocalJointVec3V3) {
  return Math.hypot(value[0], value[1], value[2]);
}

function frame(value: MakeHumanLocalJointMatrix3V3): MakeHumanLocalJointMatrix3V3 {
  if (value.length !== 9 || !value.every(Number.isFinite)) {
    throw new RangeError('headLocalToWorld must contain nine finite values.');
  }
  const x = [value[0], value[3], value[6]];
  const y = [value[1], value[4], value[7]];
  const z = [value[2], value[5], value[8]];
  const dot = (left: number[], right: number[]) =>
    left[0] * right[0] + left[1] * right[1] + left[2] * right[2];
  if (
    Math.abs(dot(x, x) - 1) > 1e-5 ||
    Math.abs(dot(y, y) - 1) > 1e-5 ||
    Math.abs(dot(z, z) - 1) > 1e-5 ||
    Math.abs(dot(x, y)) > 1e-5 ||
    Math.abs(dot(x, z)) > 1e-5 ||
    Math.abs(dot(y, z)) > 1e-5
  ) {
    throw new RangeError('headLocalToWorld must be orthonormal.');
  }
  return value;
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

function channel(value: number, name: 'headPitchDeg' | 'headSideDeg') {
  const definition = MAKEHUMAN_FULL_BODY_HEAD_ENVELOPE_V4[name];
  const bounded = Math.min(definition.maximumDeg, Math.max(definition.minimumDeg, value));
  const snapped =
    definition.minimumDeg +
    Math.round((bounded - definition.minimumDeg) / definition.stepDeg) * definition.stepDeg;
  return Object.freeze({
    value: Object.is(snapped, -0) ? 0 : snapped,
    clamped: Math.abs(snapped - value) > 1e-7,
  });
}

function validateHead(value: MakeHumanFullBodyHeadControlsV4) {
  for (const name of ['headPitchDeg', 'headYawDeg', 'headSideDeg'] as const) {
    const definition = MAKEHUMAN_FULL_BODY_HEAD_ENVELOPE_V4[name];
    if (
      !Number.isFinite(value[name]) ||
      value[name] < definition.minimumDeg ||
      value[name] > definition.maximumDeg
    ) {
      throw new RangeError(`currentHead.${name} is outside the envelope.`);
    }
  }
  return value;
}

function rotate(point: MakeHumanLocalJointVec3V3, pitchDeg: number, sideDeg: number) {
  const pitch = pitchDeg * RAD;
  const side = sideDeg * RAD;
  const afterPitch: MakeHumanLocalJointVec3V3 = [
    point[0],
    Math.cos(pitch) * point[1] - Math.sin(pitch) * point[2],
    Math.sin(pitch) * point[1] + Math.cos(pitch) * point[2],
  ];
  return [
    Math.cos(side) * afterPitch[0] - Math.sin(side) * afterPitch[1],
    Math.sin(side) * afterPitch[0] + Math.cos(side) * afterPitch[1],
    afterPitch[2],
  ] as MakeHumanLocalJointVec3V3;
}

/** Position-only head aim. Yaw is retained because twisting cannot be inferred from one endpoint. */
export function solveMakeHumanHeadAimIkV1(
  input: MakeHumanHeadAimIkInputV1,
): MakeHumanHeadAimIkResultV1 {
  const pivot = vector(input.neckPivotM, 'neckPivotM');
  const tip = vector(input.headTipM, 'headTipM');
  const target = vector(input.targetHeadTipM, 'targetHeadTipM');
  const localFrame = frame(input.headLocalToWorld);
  const currentHead = validateHead(input.currentHead);
  const currentLocal = worldToLocal(localFrame, subtract(tip, pivot));
  const targetLocal = worldToLocal(localFrame, subtract(target, pivot));
  const currentRadius = length(currentLocal);
  const targetRadius = length(targetLocal);
  if (currentRadius <= EPSILON_M || targetRadius <= EPSILON_M) {
    throw new RangeError('Head aim requires non-degenerate current and target vectors.');
  }
  const currentPitch = Math.atan2(currentLocal[2], currentLocal[1]);
  const targetPitch = Math.atan2(targetLocal[2], targetLocal[1]);
  const currentSide = Math.atan2(-currentLocal[0], Math.hypot(currentLocal[1], currentLocal[2]));
  const targetSide = Math.atan2(-targetLocal[0], Math.hypot(targetLocal[1], targetLocal[2]));
  const pitch = channel(
    currentHead.headPitchDeg + (targetPitch - currentPitch) * DEG,
    'headPitchDeg',
  );
  const side = channel(currentHead.headSideDeg + (targetSide - currentSide) * DEG, 'headSideDeg');
  const reasons: MakeHumanHeadAimIkResultV1['clampReasons'][number][] = [];
  if (Math.abs(targetRadius - currentRadius) > 0.005) reasons.push('target-radius-mismatch');
  if (pitch.clamped) reasons.push('head-pitch-limit');
  if (side.clamped) reasons.push('head-side-limit');
  const head = Object.freeze({
    headPitchDeg: pitch.value,
    headYawDeg: currentHead.headYawDeg,
    headSideDeg: side.value,
  });
  const achievedLocal = rotate(
    currentLocal,
    head.headPitchDeg - currentHead.headPitchDeg,
    head.headSideDeg - currentHead.headSideDeg,
  );
  const achieved = vector(add(pivot, localToWorld(localFrame, achievedLocal)), 'achieved');
  const targetErrorM = length(subtract(achieved, target));
  return Object.freeze({
    version: MAKEHUMAN_HEAD_AIM_IK_V1,
    head,
    requestedTargetHeadTipM: target,
    achievedTargetHeadTipM: achieved,
    targetErrorM,
    status: reasons.length === 0 && targetErrorM <= 0.01 ? 'reached' : 'clamped',
    clampReasons: Object.freeze([...new Set(reasons)]),
  });
}
