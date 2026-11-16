import type {
  MakeHumanLocalJointMatrix3V3,
  MakeHumanLocalJointVec3V3,
} from './makehuman-local-joint-frame-research-v3';
import {
  evaluateMakeHumanLimbGeometricGuardV1,
  type MakeHumanLimbGeometricGuardObstacleV1,
  type MakeHumanLimbGeometricGuardResultV1,
} from './makehuman-limb-geometric-guard-v1';

export const MAKEHUMAN_LEG_BODY_PART_IK_V1 = 'makehuman-leg-body-part-ik/v1' as const;

export type MakeHumanLegBodyPartIkSideV1 = 'left' | 'right';

export interface MakeHumanLegBodyPartIkControlsV1 {
  readonly hipForwardDeg: number;
  readonly hipSideDeg: number;
  readonly kneeBendDeg: number;
  readonly ankleBendDeg: number;
}

export const MAKEHUMAN_LEG_BODY_PART_IK_ENVELOPE_V1 = Object.freeze({
  hipForwardDeg: Object.freeze({ minimumDeg: -45, maximumDeg: 60, stepDeg: 1 }),
  hipSideDeg: Object.freeze({ minimumDeg: -25, maximumDeg: 25, stepDeg: 1 }),
  kneeBendDeg: Object.freeze({ minimumDeg: 0, maximumDeg: 120, stepDeg: 1 }),
  ankleBendDeg: Object.freeze({ minimumDeg: -30, maximumDeg: 45, stepDeg: 1 }),
} as const);

export interface MakeHumanLegBodyPartIkInputV1 {
  readonly side: MakeHumanLegBodyPartIkSideV1;
  readonly hipM: MakeHumanLocalJointVec3V3;
  readonly kneeM: MakeHumanLocalJointVec3V3;
  readonly ankleM: MakeHumanLocalJointVec3V3;
  /** Row-major orthonormal matrix whose columns are the hip's current local X/Y/Z axes. */
  readonly hipLocalToWorld: MakeHumanLocalJointMatrix3V3;
  readonly targetAnkleM: MakeHumanLocalJointVec3V3;
  /**
   * Pose represented by the supplied joints/frame. Snapshot it on pointerdown and reuse it for
   * every pointermove while changing only targetAnkleM.
   */
  readonly currentLeg?: MakeHumanLegBodyPartIkControlsV1;
  /** Retained because a position-only ankle target cannot infer foot orientation. */
  readonly ankleBendDeg?: number;
  /** Optional conservative capsule guard supplied by the authenticated live rig. */
  readonly geometricGuard?: Readonly<{
    readonly obstacles: readonly MakeHumanLimbGeometricGuardObstacleV1[];
    readonly upperLegRadiusM?: number;
    readonly lowerLegRadiusM?: number;
    readonly clearanceM?: number;
    /** Last pose accepted during this pointer gesture; currentLeg is the pointerdown fallback. */
    readonly lastAdmissibleLeg?: MakeHumanLegBodyPartIkControlsV1;
  }>;
}

export type MakeHumanLegBodyPartIkClampReasonV1 =
  | 'target-too-close'
  | 'target-too-far'
  | 'hip-forward-limit'
  | 'hip-side-limit'
  | 'knee-bend-limit'
  | 'geometric-self-overlap';

export interface MakeHumanLegBodyPartIkResultV1 {
  readonly version: typeof MAKEHUMAN_LEG_BODY_PART_IK_V1;
  readonly side: MakeHumanLegBodyPartIkSideV1;
  readonly leg: MakeHumanLegBodyPartIkControlsV1;
  readonly requestedTargetAnkleM: MakeHumanLocalJointVec3V3;
  readonly achievedKneeM: MakeHumanLocalJointVec3V3;
  readonly achievedTargetAnkleM: MakeHumanLocalJointVec3V3;
  readonly targetErrorM: number;
  readonly status: 'reached' | 'clamped';
  readonly interaction: 'free-target' | 'last-admissible-clamp';
  readonly clampReasons: readonly MakeHumanLegBodyPartIkClampReasonV1[];
  readonly geometricGuard: MakeHumanLimbGeometricGuardResultV1 | null;
  readonly lengthsM: Readonly<{
    thigh: number;
    shin: number;
    requestedReach: number;
    solvedReach: number;
  }>;
  readonly claims: Readonly<{
    bodyPartInverseKinematicsApplied: true;
    positionTargetOnly: true;
    productInteractionEnvelopeApplied: true;
    geometricSelfOverlapGuardApplied: boolean;
    lastAdmissiblePoseRetained: boolean;
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
function claims(guardApplied: boolean, lastAdmissiblePoseRetained: boolean) {
  return Object.freeze({
    bodyPartInverseKinematicsApplied: true as const,
    positionTargetOnly: true as const,
    productInteractionEnvelopeApplied: true as const,
    geometricSelfOverlapGuardApplied: guardApplied,
    lastAdmissiblePoseRetained,
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
    throw new RangeError('hipLocalToWorld must contain nine finite values.');
  }
  const columns = [
    [value[0], value[3], value[6]],
    [value[1], value[4], value[7]],
    [value[2], value[5], value[8]],
  ] as const;
  for (let column = 0; column < 3; column += 1) {
    if (Math.abs(dot(columns[column], columns[column]) - 1) > ORTHONORMAL_TOLERANCE) {
      throw new RangeError('hipLocalToWorld must be orthonormal.');
    }
    for (let other = column + 1; other < 3; other += 1) {
      if (Math.abs(dot(columns[column], columns[other])) > ORTHONORMAL_TOLERANCE) {
        throw new RangeError('hipLocalToWorld must be orthonormal.');
      }
    }
  }
  const determinant =
    value[0] * (value[4] * value[8] - value[5] * value[7]) -
    value[1] * (value[3] * value[8] - value[5] * value[6]) +
    value[2] * (value[3] * value[7] - value[4] * value[6]);
  if (Math.abs(determinant - 1) > ORTHONORMAL_TOLERANCE) {
    throw new RangeError('hipLocalToWorld must be right-handed.');
  }
  return value;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

type EnvelopeChannel = keyof typeof MAKEHUMAN_LEG_BODY_PART_IK_ENVELOPE_V1;

function clampChannel(value: number, channel: EnvelopeChannel) {
  const definition = MAKEHUMAN_LEG_BODY_PART_IK_ENVELOPE_V1[channel];
  const bounded = clamp(value, definition.minimumDeg, definition.maximumDeg);
  const snapped =
    definition.minimumDeg +
    Math.round((bounded - definition.minimumDeg) / definition.stepDeg) * definition.stepDeg;
  const normalized = Object.is(snapped, -0) ? 0 : snapped;
  return Object.freeze({ value: normalized, clamped: Math.abs(normalized - value) > 1e-7 });
}

function admittedCurrentLeg(
  value: MakeHumanLegBodyPartIkControlsV1 | undefined,
): MakeHumanLegBodyPartIkControlsV1 {
  const candidate =
    value ?? Object.freeze({ hipForwardDeg: 0, hipSideDeg: 0, kneeBendDeg: 0, ankleBendDeg: 0 });
  for (const channel of ['hipForwardDeg', 'hipSideDeg', 'kneeBendDeg', 'ankleBendDeg'] as const) {
    if (!Number.isFinite(candidate[channel]) || clampChannel(candidate[channel], channel).clamped) {
      throw new RangeError(`currentLeg.${channel} is outside the envelope.`);
    }
  }
  return candidate;
}

function rotateLegLocal(
  point: MakeHumanLocalJointVec3V3,
  hipX: number,
  hipZ: number,
): MakeHumanLocalJointVec3V3 {
  const afterX: MakeHumanLocalJointVec3V3 = [
    point[0],
    Math.cos(hipX) * point[1] - Math.sin(hipX) * point[2],
    Math.sin(hipX) * point[1] + Math.cos(hipX) * point[2],
  ];
  return [
    Math.cos(hipZ) * afterX[0] - Math.sin(hipZ) * afterX[1],
    Math.sin(hipZ) * afterX[0] + Math.cos(hipZ) * afterX[1],
    afterX[2],
  ];
}

function forwardLegLocal(options: {
  readonly side: MakeHumanLegBodyPartIkSideV1;
  readonly thighLength: number;
  readonly shinLength: number;
  readonly hipForwardDeg: number;
  readonly hipSideDeg: number;
  readonly kneeBendDeg: number;
}): Readonly<{
  knee: MakeHumanLocalJointVec3V3;
  ankle: MakeHumanLocalJointVec3V3;
}> {
  const sideSign = options.side === 'left' ? 1 : -1;
  const hipX = sideSign * options.hipForwardDeg * RAD;
  const hipZ = options.hipSideDeg * RAD;
  const kneeX = sideSign * options.kneeBendDeg * RAD;
  const beforeHip: MakeHumanLocalJointVec3V3 = [
    0,
    options.thighLength + options.shinLength * Math.cos(kneeX),
    options.shinLength * Math.sin(kneeX),
  ];
  return Object.freeze({
    knee: rotateLegLocal([0, options.thighLength, 0], hipX, hipZ),
    ankle: rotateLegLocal(beforeHip, hipX, hipZ),
  });
}

function sameLeg(left: MakeHumanLegBodyPartIkControlsV1, right: MakeHumanLegBodyPartIkControlsV1) {
  return (
    left.hipForwardDeg === right.hipForwardDeg &&
    left.hipSideDeg === right.hipSideDeg &&
    left.kneeBendDeg === right.kneeBendDeg &&
    left.ankleBendDeg === right.ankleBendDeg
  );
}

/**
 * Solves a deterministic position-only two-bone leg target in the hip marker's current local
 * frame. It is suitable for a live pointer session: keep joints, frame, and currentLeg fixed for
 * the whole gesture and update only targetAnkleM. Limits are product interaction limits, not
 * clinical anatomical evidence.
 */
export function solveMakeHumanLegBodyPartIkV1(
  input: MakeHumanLegBodyPartIkInputV1,
): MakeHumanLegBodyPartIkResultV1 {
  if (input.side !== 'left' && input.side !== 'right') {
    throw new RangeError('Leg IK side must be left or right.');
  }
  const hipM = vector(input.hipM, 'hipM');
  const kneeM = vector(input.kneeM, 'kneeM');
  const ankleM = vector(input.ankleM, 'ankleM');
  const targetAnkleM = vector(input.targetAnkleM, 'targetAnkleM');
  const hipLocalToWorld = validatedFrame(input.hipLocalToWorld);
  const dragStartLeg = admittedCurrentLeg(input.currentLeg);
  const thighLength = length(subtract(kneeM, hipM));
  const shinLength = length(subtract(ankleM, kneeM));
  if (thighLength <= EPSILON_M || shinLength <= EPSILON_M) {
    throw new RangeError('Leg IK requires non-degenerate thigh and shin segments.');
  }

  const requestedTargetLocal = worldToLocal(hipLocalToWorld, subtract(targetAnkleM, hipM));
  const requestedReach = length(requestedTargetLocal);
  if (!Number.isFinite(requestedReach) || requestedReach <= EPSILON_M) {
    throw new RangeError('Leg IK target must not coincide with the hip.');
  }

  const clampReasons: MakeHumanLegBodyPartIkClampReasonV1[] = [];
  const minimumReach = Math.abs(thighLength - shinLength);
  const maximumReach = thighLength + shinLength;
  const solvedReach = clamp(requestedReach, minimumReach, maximumReach);
  if (requestedReach < minimumReach) clampReasons.push('target-too-close');
  if (requestedReach > maximumReach) clampReasons.push('target-too-far');

  const direction: MakeHumanLocalJointVec3V3 = [
    requestedTargetLocal[0] / requestedReach,
    requestedTargetLocal[1] / requestedReach,
    requestedTargetLocal[2] / requestedReach,
  ];
  const kneeRadians = Math.acos(
    clamp(
      (solvedReach * solvedReach - thighLength * thighLength - shinLength * shinLength) /
        (2 * thighLength * shinLength),
      -1,
      1,
    ),
  );
  const bendOffsetRadians = Math.atan2(
    shinLength * Math.sin(kneeRadians),
    thighLength + shinLength * Math.cos(kneeRadians),
  );
  const sideSign = input.side === 'left' ? 1 : -1;
  const targetLocalX = Math.asin(clamp(direction[2], -1, 1));
  const hipForward = clampChannel(
    dragStartLeg.hipForwardDeg + sideSign * targetLocalX * DEG - bendOffsetRadians * DEG,
    'hipForwardDeg',
  );
  const hipSide = clampChannel(
    dragStartLeg.hipSideDeg + Math.atan2(-direction[0], direction[1]) * DEG,
    'hipSideDeg',
  );
  const kneeBend = clampChannel(kneeRadians * DEG, 'kneeBendDeg');
  const ankleBend = clampChannel(input.ankleBendDeg ?? dragStartLeg.ankleBendDeg, 'ankleBendDeg');
  if (hipForward.clamped) clampReasons.push('hip-forward-limit');
  if (hipSide.clamped) clampReasons.push('hip-side-limit');
  if (kneeBend.clamped) clampReasons.push('knee-bend-limit');

  const candidateLeg = Object.freeze({
    hipForwardDeg: hipForward.value,
    hipSideDeg: hipSide.value,
    kneeBendDeg: kneeBend.value,
    ankleBendDeg: ankleBend.value,
  });
  const achievedGeometry = (pose: MakeHumanLegBodyPartIkControlsV1) => {
    if (sameLeg(pose, dragStartLeg)) {
      return Object.freeze({ kneeM, ankleM });
    }
    const local = forwardLegLocal({
      side: input.side,
      thighLength,
      shinLength,
      hipForwardDeg: pose.hipForwardDeg - dragStartLeg.hipForwardDeg,
      hipSideDeg: pose.hipSideDeg - dragStartLeg.hipSideDeg,
      kneeBendDeg: pose.kneeBendDeg,
    });
    return Object.freeze({
      kneeM: vector(add(hipM, localToWorld(hipLocalToWorld, local.knee)), 'achievedKneeM'),
      ankleM: vector(add(hipM, localToWorld(hipLocalToWorld, local.ankle)), 'achievedTargetAnkleM'),
    });
  };
  const candidateGeometry = achievedGeometry(candidateLeg);
  let geometricGuard: MakeHumanLimbGeometricGuardResultV1 | null = null;
  if (input.geometricGuard) {
    const defaultRadiusM = Math.min(thighLength, shinLength) * 0.09;
    geometricGuard = evaluateMakeHumanLimbGeometricGuardV1({
      candidate: {
        rootM: hipM,
        middleM: candidateGeometry.kneeM,
        endM: candidateGeometry.ankleM,
        upperRadiusM: input.geometricGuard.upperLegRadiusM ?? defaultRadiusM,
        lowerRadiusM: input.geometricGuard.lowerLegRadiusM ?? defaultRadiusM * 0.8,
      },
      obstacles: input.geometricGuard.obstacles,
      clearanceM: input.geometricGuard.clearanceM,
    });
  }
  const guardRejected = geometricGuard !== null && !geometricGuard.admissible;
  if (guardRejected) clampReasons.push('geometric-self-overlap');
  const leg = guardRejected
    ? admittedCurrentLeg(input.geometricGuard?.lastAdmissibleLeg ?? dragStartLeg)
    : candidateLeg;
  const achieved = guardRejected ? achievedGeometry(leg) : candidateGeometry;
  const achievedKneeM = achieved.kneeM;
  const achievedTargetAnkleM = achieved.ankleM;
  const targetErrorM = length(subtract(achievedTargetAnkleM, targetAnkleM));

  return Object.freeze({
    version: MAKEHUMAN_LEG_BODY_PART_IK_V1,
    side: input.side,
    leg,
    requestedTargetAnkleM: targetAnkleM,
    achievedKneeM,
    achievedTargetAnkleM,
    targetErrorM,
    status: clampReasons.length === 0 && targetErrorM <= 0.01 ? 'reached' : 'clamped',
    interaction: guardRejected ? 'last-admissible-clamp' : 'free-target',
    clampReasons: Object.freeze([...new Set(clampReasons)]),
    geometricGuard,
    lengthsM: Object.freeze({ thigh: thighLength, shin: shinLength, requestedReach, solvedReach }),
    claims: claims(input.geometricGuard !== undefined, guardRejected),
  });
}

export interface MakeHumanIndependentLegPoseV1 {
  readonly symmetry: 'independent';
  readonly leftLeg: MakeHumanLegBodyPartIkControlsV1;
  readonly rightLeg: MakeHumanLegBodyPartIkControlsV1;
}

/** Applies one IK result without mutating the opposite leg. */
export function applyMakeHumanLegBodyPartIkV1(
  pose: MakeHumanIndependentLegPoseV1,
  result: MakeHumanLegBodyPartIkResultV1,
): MakeHumanIndependentLegPoseV1 {
  return result.side === 'left'
    ? Object.freeze({ ...pose, leftLeg: result.leg })
    : Object.freeze({ ...pose, rightLeg: result.leg });
}
