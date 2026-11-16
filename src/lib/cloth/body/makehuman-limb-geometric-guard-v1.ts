import type { MakeHumanLocalJointVec3V3 } from './makehuman-local-joint-frame-research-v3';

export const MAKEHUMAN_LIMB_GEOMETRIC_GUARD_V1 = 'makehuman-limb-geometric-guard/v1' as const;

export type MakeHumanLimbGeometricGuardObstacleKindV1 = 'opposite-limb' | 'torso';

export interface MakeHumanLimbGeometricGuardObstacleV1 {
  readonly id: string;
  readonly kind: MakeHumanLimbGeometricGuardObstacleKindV1;
  readonly startM: MakeHumanLocalJointVec3V3;
  readonly endM: MakeHumanLocalJointVec3V3;
  readonly radiusM: number;
}

export interface MakeHumanLimbGeometricGuardCandidateV1 {
  readonly rootM: MakeHumanLocalJointVec3V3;
  readonly middleM: MakeHumanLocalJointVec3V3;
  readonly endM: MakeHumanLocalJointVec3V3;
  /** Optional distal hand/foot endpoint. Both terminal fields must be supplied together. */
  readonly terminalM?: MakeHumanLocalJointVec3V3;
  readonly upperRadiusM: number;
  readonly lowerRadiusM: number;
  readonly terminalRadiusM?: number;
}

export interface MakeHumanLimbGeometricGuardContactV1 {
  readonly obstacleId: string;
  readonly obstacleKind: MakeHumanLimbGeometricGuardObstacleKindV1;
  readonly activeSegment: 'upper' | 'lower' | 'terminal';
  readonly distanceM: number;
  readonly requiredClearanceM: number;
}

export interface MakeHumanLimbGeometricGuardResultV1 {
  readonly version: typeof MAKEHUMAN_LIMB_GEOMETRIC_GUARD_V1;
  readonly admissible: boolean;
  readonly contacts: readonly MakeHumanLimbGeometricGuardContactV1[];
  readonly minimumClearanceM: number;
  readonly claims: Readonly<{
    capsuleGeometryEvaluated: true;
    oppositeLimbEvaluated: boolean;
    torsoEvaluated: boolean;
    meshCollisionEvaluated: false;
    clinicalAnatomicalRangeAuthority: false;
    productionAuthority: false;
  }>;
}

export interface MakeHumanFixedRootSupportGuardResultV1 {
  readonly admissible: boolean;
  readonly supportedSide: 'left' | 'right' | 'both' | null;
  readonly leftLiftM: number;
  readonly rightLiftM: number;
  readonly maximumSupportLiftM: number;
  readonly claims: Readonly<{
    fixedRootSupportInvariantEvaluated: true;
    groundPlaneProjectionOnly: true;
    balanceOrDynamicsEvaluated: false;
    clinicalAnatomicalRangeAuthority: false;
    productionAuthority: false;
  }>;
}

const EPSILON = 1e-12;

function finitePoint(value: MakeHumanLocalJointVec3V3, label: string) {
  if (value.length !== 3 || !value.every(Number.isFinite)) {
    throw new RangeError(`${label} must contain three finite values.`);
  }
  return value;
}

function subtract(left: readonly number[], right: readonly number[]) {
  return [left[0] - right[0], left[1] - right[1], left[2] - right[2]] as const;
}

function dot(left: readonly number[], right: readonly number[]) {
  return left[0] * right[0] + left[1] * right[1] + left[2] * right[2];
}

function normalized(value: MakeHumanLocalJointVec3V3, label: string) {
  finitePoint(value, label);
  const magnitude = Math.hypot(value[0], value[1], value[2]);
  if (magnitude <= EPSILON) throw new RangeError(`${label} must be non-zero.`);
  return [value[0] / magnitude, value[1] / magnitude, value[2] / magnitude] as const;
}

function clamp01(value: number) {
  return Math.min(1, Math.max(0, value));
}

function lerp(
  start: MakeHumanLocalJointVec3V3,
  end: MakeHumanLocalJointVec3V3,
  fraction: number,
): MakeHumanLocalJointVec3V3 {
  return [
    start[0] + (end[0] - start[0]) * fraction,
    start[1] + (end[1] - start[1]) * fraction,
    start[2] + (end[2] - start[2]) * fraction,
  ];
}

/** Squared closest distance between two finite 3D line segments. */
export function makeHumanSegmentDistanceSquaredV1(
  firstStart: MakeHumanLocalJointVec3V3,
  firstEnd: MakeHumanLocalJointVec3V3,
  secondStart: MakeHumanLocalJointVec3V3,
  secondEnd: MakeHumanLocalJointVec3V3,
): number {
  const p1 = finitePoint(firstStart, 'firstStart');
  const q1 = finitePoint(firstEnd, 'firstEnd');
  const p2 = finitePoint(secondStart, 'secondStart');
  const q2 = finitePoint(secondEnd, 'secondEnd');
  const d1 = subtract(q1, p1);
  const d2 = subtract(q2, p2);
  const r = subtract(p1, p2);
  const a = dot(d1, d1);
  const e = dot(d2, d2);
  const f = dot(d2, r);
  let firstFraction = 0;
  let secondFraction = 0;

  if (a <= EPSILON && e <= EPSILON) return dot(r, r);
  if (a <= EPSILON) {
    secondFraction = clamp01(f / e);
  } else {
    const c = dot(d1, r);
    if (e <= EPSILON) {
      firstFraction = clamp01(-c / a);
    } else {
      const b = dot(d1, d2);
      const denominator = a * e - b * b;
      firstFraction = denominator <= EPSILON ? 0 : clamp01((b * f - c * e) / denominator);
      secondFraction = (b * firstFraction + f) / e;
      if (secondFraction < 0) {
        secondFraction = 0;
        firstFraction = clamp01(-c / a);
      } else if (secondFraction > 1) {
        secondFraction = 1;
        firstFraction = clamp01((b - c) / a);
      }
    }
  }

  const closestDelta = [
    r[0] + d1[0] * firstFraction - d2[0] * secondFraction,
    r[1] + d1[1] * firstFraction - d2[1] * secondFraction,
    r[2] + d1[2] * firstFraction - d2[2] * secondFraction,
  ] as const;
  return Math.max(0, dot(closestDelta, closestDelta));
}

/**
 * Conservative capsule guard for direct limb manipulation. The proximal 30% of the upper limb is
 * excluded only from torso checks because a shoulder/hip is expected to join the torso. Opposite
 * limb checks always use the complete chain, including an optional hand/foot terminal capsule.
 */
export function evaluateMakeHumanLimbGeometricGuardV1(options: {
  readonly candidate: MakeHumanLimbGeometricGuardCandidateV1;
  readonly obstacles: readonly MakeHumanLimbGeometricGuardObstacleV1[];
  readonly clearanceM?: number;
}): MakeHumanLimbGeometricGuardResultV1 {
  const { candidate } = options;
  finitePoint(candidate.rootM, 'candidate.rootM');
  finitePoint(candidate.middleM, 'candidate.middleM');
  finitePoint(candidate.endM, 'candidate.endM');
  const hasTerminalM = candidate.terminalM !== undefined;
  const hasTerminalRadius = candidate.terminalRadiusM !== undefined;
  if (hasTerminalM !== hasTerminalRadius) {
    throw new RangeError('candidate terminalM and terminalRadiusM must be supplied together.');
  }
  if (candidate.terminalM) finitePoint(candidate.terminalM, 'candidate.terminalM');
  for (const [label, radius] of [
    ['candidate.upperRadiusM', candidate.upperRadiusM],
    ['candidate.lowerRadiusM', candidate.lowerRadiusM],
    ...(candidate.terminalRadiusM === undefined
      ? []
      : ([['candidate.terminalRadiusM', candidate.terminalRadiusM]] as const)),
  ] as const) {
    if (!Number.isFinite(radius) || radius <= 0) throw new RangeError(`${label} must be positive.`);
  }
  const clearanceM = options.clearanceM ?? 0;
  if (!Number.isFinite(clearanceM) || clearanceM < 0) {
    throw new RangeError('clearanceM must be finite and non-negative.');
  }

  const contacts: MakeHumanLimbGeometricGuardContactV1[] = [];
  let minimumClearanceM = Number.POSITIVE_INFINITY;
  let oppositeLimbEvaluated = false;
  let torsoEvaluated = false;
  for (const obstacle of options.obstacles) {
    if (!obstacle.id) throw new RangeError('guard obstacle id must not be empty.');
    finitePoint(obstacle.startM, `${obstacle.id}.startM`);
    finitePoint(obstacle.endM, `${obstacle.id}.endM`);
    if (!Number.isFinite(obstacle.radiusM) || obstacle.radiusM <= 0) {
      throw new RangeError(`${obstacle.id}.radiusM must be positive.`);
    }
    if (obstacle.kind === 'opposite-limb') oppositeLimbEvaluated = true;
    else if (obstacle.kind === 'torso') torsoEvaluated = true;
    else throw new RangeError(`Unsupported guard obstacle kind ${String(obstacle.kind)}.`);

    const upperStart =
      obstacle.kind === 'torso' ? lerp(candidate.rootM, candidate.middleM, 0.3) : candidate.rootM;
    const activeSegments: ReadonlyArray<{
      readonly id: MakeHumanLimbGeometricGuardContactV1['activeSegment'];
      readonly startM: MakeHumanLocalJointVec3V3;
      readonly endM: MakeHumanLocalJointVec3V3;
      readonly radiusM: number;
    }> = [
      {
        id: 'upper' as const,
        startM: upperStart,
        endM: candidate.middleM,
        radiusM: candidate.upperRadiusM,
      },
      {
        id: 'lower' as const,
        startM: candidate.middleM,
        endM: candidate.endM,
        radiusM: candidate.lowerRadiusM,
      },
      ...(candidate.terminalM && candidate.terminalRadiusM
        ? [
            {
              id: 'terminal' as const,
              startM: candidate.endM,
              endM: candidate.terminalM,
              radiusM: candidate.terminalRadiusM,
            },
          ]
        : []),
    ];
    for (const active of activeSegments) {
      const distanceM = Math.sqrt(
        makeHumanSegmentDistanceSquaredV1(
          active.startM,
          active.endM,
          obstacle.startM,
          obstacle.endM,
        ),
      );
      const requiredClearanceM = active.radiusM + obstacle.radiusM + clearanceM;
      minimumClearanceM = Math.min(minimumClearanceM, distanceM - requiredClearanceM);
      if (distanceM + 1e-9 < requiredClearanceM) {
        contacts.push(
          Object.freeze({
            obstacleId: obstacle.id,
            obstacleKind: obstacle.kind,
            activeSegment: active.id,
            distanceM,
            requiredClearanceM,
          }),
        );
      }
    }
  }

  return Object.freeze({
    version: MAKEHUMAN_LIMB_GEOMETRIC_GUARD_V1,
    admissible: contacts.length === 0,
    contacts: Object.freeze(contacts),
    minimumClearanceM,
    claims: Object.freeze({
      capsuleGeometryEvaluated: true,
      oppositeLimbEvaluated,
      torsoEvaluated,
      meshCollisionEvaluated: false,
      clinicalAnatomicalRangeAuthority: false,
      productionAuthority: false,
    }),
  });
}

/**
 * Fixed-root editor invariant: a linked bilateral leg edit may move both feet only while at least
 * one ankle stays near its pointerdown ground-plane height. This is a UI support constraint, not a
 * physical balance or clinical claim.
 */
export function evaluateMakeHumanFixedRootSupportGuardV1(options: {
  readonly baselineLeftAnkleM: MakeHumanLocalJointVec3V3;
  readonly baselineRightAnkleM: MakeHumanLocalJointVec3V3;
  readonly candidateLeftAnkleM: MakeHumanLocalJointVec3V3;
  readonly candidateRightAnkleM: MakeHumanLocalJointVec3V3;
  readonly groundNormalM: MakeHumanLocalJointVec3V3;
  readonly maximumSupportLiftM?: number;
}): MakeHumanFixedRootSupportGuardResultV1 {
  const normal = normalized(options.groundNormalM, 'groundNormalM');
  const maximumSupportLiftM = options.maximumSupportLiftM ?? 0.03;
  if (!Number.isFinite(maximumSupportLiftM) || maximumSupportLiftM < 0) {
    throw new RangeError('maximumSupportLiftM must be finite and non-negative.');
  }
  const lift = (
    baseline: MakeHumanLocalJointVec3V3,
    candidate: MakeHumanLocalJointVec3V3,
    label: string,
  ) => {
    finitePoint(baseline, `baseline${label}AnkleM`);
    finitePoint(candidate, `candidate${label}AnkleM`);
    return Math.abs(dot(subtract(candidate, baseline), normal));
  };
  const leftLiftM = lift(options.baselineLeftAnkleM, options.candidateLeftAnkleM, 'Left');
  const rightLiftM = lift(options.baselineRightAnkleM, options.candidateRightAnkleM, 'Right');
  const leftSupported = leftLiftM <= maximumSupportLiftM;
  const rightSupported = rightLiftM <= maximumSupportLiftM;
  return Object.freeze({
    admissible: leftSupported || rightSupported,
    supportedSide:
      leftSupported && rightSupported
        ? 'both'
        : leftSupported
          ? 'left'
          : rightSupported
            ? 'right'
            : null,
    leftLiftM,
    rightLiftM,
    maximumSupportLiftM,
    claims: Object.freeze({
      fixedRootSupportInvariantEvaluated: true,
      groundPlaneProjectionOnly: true,
      balanceOrDynamicsEvaluated: false,
      clinicalAnatomicalRangeAuthority: false,
      productionAuthority: false,
    }),
  });
}
