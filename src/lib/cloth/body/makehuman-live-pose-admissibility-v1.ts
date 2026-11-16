import {
  evaluateMakeHumanFixedRootSupportGuardV1,
  evaluateMakeHumanLimbGeometricGuardV1,
  type MakeHumanLimbGeometricGuardContactV1,
  type MakeHumanLimbGeometricGuardObstacleV1,
} from './makehuman-limb-geometric-guard-v1';
import type {
  MakeHumanLocalJointMatrix3V3,
  MakeHumanLocalJointVec3V3,
  MakeHumanPosedLocalBoneOverlayV4,
} from './makehuman-local-joint-frame-research-v3';

export const MAKEHUMAN_LIVE_POSE_ADMISSIBILITY_V1 = 'makehuman-live-pose-admissibility/v1' as const;

export type MakeHumanLivePoseBlockerV1 =
  | 'left-arm-overlap'
  | 'right-arm-overlap'
  | 'left-leg-overlap'
  | 'right-leg-overlap'
  | 'left-elbow-direction'
  | 'right-elbow-direction'
  | 'left-knee-direction'
  | 'right-knee-direction'
  | 'no-grounded-foot'
  | 'foot-below-ground';

export interface MakeHumanSignedHingeDirectionReceiptV1 {
  readonly id: 'left-elbow' | 'right-elbow' | 'left-knee' | 'right-knee';
  readonly signedBendDeg: number;
  readonly offPlaneDeg: number;
  readonly admissible: boolean;
}

export interface MakeHumanLivePoseAdmissibilityResultV1 {
  readonly version: typeof MAKEHUMAN_LIVE_POSE_ADMISSIBILITY_V1;
  readonly admissible: boolean;
  readonly blockers: readonly MakeHumanLivePoseBlockerV1[];
  readonly contacts: readonly MakeHumanLimbGeometricGuardContactV1[];
  readonly hinges: readonly MakeHumanSignedHingeDirectionReceiptV1[];
  readonly ground: Readonly<{
    referenceM: number;
    toleranceM: number;
    leftFootM: number;
    rightFootM: number;
    leftSupported: boolean;
    rightSupported: boolean;
  }>;
  readonly claims: Readonly<{
    authenticatedRigGeometryEvaluated: true;
    limbCapsulesEvaluated: true;
    signedHingeDirectionEvaluated: true;
    groundedSupportEvaluated: true;
    meshCollisionEvaluated: false;
    clinicalAnatomicalRangeAuthority: false;
    productionAuthority: false;
  }>;
}

const CLAIMS = Object.freeze({
  authenticatedRigGeometryEvaluated: true as const,
  limbCapsulesEvaluated: true as const,
  signedHingeDirectionEvaluated: true as const,
  groundedSupportEvaluated: true as const,
  meshCollisionEvaluated: false as const,
  clinicalAnatomicalRangeAuthority: false as const,
  productionAuthority: false as const,
});

function distance(left: MakeHumanLocalJointVec3V3, right: MakeHumanLocalJointVec3V3): number {
  return Math.hypot(left[0] - right[0], left[1] - right[1], left[2] - right[2]);
}

function midpoint(
  left: MakeHumanLocalJointVec3V3,
  right: MakeHumanLocalJointVec3V3,
): MakeHumanLocalJointVec3V3 {
  return Object.freeze([
    (left[0] + right[0]) / 2,
    (left[1] + right[1]) / 2,
    (left[2] + right[2]) / 2,
  ] as const);
}

function interpolate(
  start: MakeHumanLocalJointVec3V3,
  end: MakeHumanLocalJointVec3V3,
  fraction: number,
): MakeHumanLocalJointVec3V3 {
  return Object.freeze([
    start[0] + (end[0] - start[0]) * fraction,
    start[1] + (end[1] - start[1]) * fraction,
    start[2] + (end[2] - start[2]) * fraction,
  ] as const);
}

function subtract(
  left: MakeHumanLocalJointVec3V3,
  right: MakeHumanLocalJointVec3V3,
): MakeHumanLocalJointVec3V3 {
  return Object.freeze([left[0] - right[0], left[1] - right[1], left[2] - right[2]] as const);
}

function cross(
  left: MakeHumanLocalJointVec3V3,
  right: MakeHumanLocalJointVec3V3,
): MakeHumanLocalJointVec3V3 {
  return Object.freeze([
    left[1] * right[2] - left[2] * right[1],
    left[2] * right[0] - left[0] * right[2],
    left[0] * right[1] - left[1] * right[0],
  ] as const);
}

function normalized(value: MakeHumanLocalJointVec3V3, label: string): MakeHumanLocalJointVec3V3 {
  const magnitude = Math.hypot(...value);
  if (!Number.isFinite(magnitude) || magnitude <= 1e-8) {
    throw new Error(`Live pose admissibility cannot derive ${label}.`);
  }
  return Object.freeze(value.map((component) => component / magnitude) as [number, number, number]);
}

function offset(
  point: MakeHumanLocalJointVec3V3,
  direction: MakeHumanLocalJointVec3V3,
  distanceM: number,
): MakeHumanLocalJointVec3V3 {
  return Object.freeze([
    point[0] + direction[0] * distanceM,
    point[1] + direction[1] * distanceM,
    point[2] + direction[2] * distanceM,
  ] as const);
}

function requiredBone(
  byName: ReadonlyMap<string, MakeHumanPosedLocalBoneOverlayV4>,
  name: string,
): MakeHumanPosedLocalBoneOverlayV4 {
  const bone = byName.get(name);
  if (!bone) throw new Error(`Live pose admissibility requires authenticated rig bone ${name}.`);
  return bone;
}

function obstacle(options: {
  id: string;
  kind: MakeHumanLimbGeometricGuardObstacleV1['kind'];
  startM: MakeHumanLocalJointVec3V3;
  endM: MakeHumanLocalJointVec3V3;
  radiusM: number;
}): MakeHumanLimbGeometricGuardObstacleV1 {
  return Object.freeze({ ...options });
}

function appendBlocker(
  blockers: MakeHumanLivePoseBlockerV1[],
  blocker: MakeHumanLivePoseBlockerV1,
) {
  if (!blockers.includes(blocker)) blockers.push(blocker);
}

function transpose(matrix: MakeHumanLocalJointMatrix3V3): MakeHumanLocalJointMatrix3V3 {
  return Object.freeze([
    matrix[0],
    matrix[3],
    matrix[6],
    matrix[1],
    matrix[4],
    matrix[7],
    matrix[2],
    matrix[5],
    matrix[8],
  ] as const);
}

function multiply(
  left: MakeHumanLocalJointMatrix3V3,
  right: MakeHumanLocalJointMatrix3V3,
): MakeHumanLocalJointMatrix3V3 {
  const value = new Array<number>(9);
  for (let row = 0; row < 3; row += 1) {
    for (let column = 0; column < 3; column += 1) {
      value[row * 3 + column] =
        left[row * 3] * right[column] +
        left[row * 3 + 1] * right[column + 3] +
        left[row * 3 + 2] * right[column + 6];
    }
  }
  return Object.freeze(value as unknown as MakeHumanLocalJointMatrix3V3);
}

function rotationVector(matrix: MakeHumanLocalJointMatrix3V3): MakeHumanLocalJointVec3V3 {
  const cosine = Math.min(1, Math.max(-1, (matrix[0] + matrix[4] + matrix[8] - 1) / 2));
  const angle = Math.acos(cosine);
  if (angle <= 1e-8) return Object.freeze([0, 0, 0] as const);
  const sine = Math.sin(angle);
  if (Math.abs(sine) <= 1e-8) {
    throw new Error('Live pose hinge direction cannot resolve a 180-degree frame delta.');
  }
  const scale = angle / (2 * sine);
  return Object.freeze([
    (matrix[7] - matrix[5]) * scale,
    (matrix[2] - matrix[6]) * scale,
    (matrix[3] - matrix[1]) * scale,
  ] as const);
}

function evaluateSignedHinge(options: {
  readonly id: MakeHumanSignedHingeDirectionReceiptV1['id'];
  readonly jointBone: string;
  readonly parentBone: string;
  readonly semanticDirection: -1 | 1;
  readonly candidateByName: ReadonlyMap<string, MakeHumanPosedLocalBoneOverlayV4>;
  readonly neutralByName: ReadonlyMap<string, MakeHumanPosedLocalBoneOverlayV4>;
}): MakeHumanSignedHingeDirectionReceiptV1 {
  const candidateJoint = requiredBone(options.candidateByName, options.jointBone);
  const candidateParent = requiredBone(options.candidateByName, options.parentBone);
  const neutralJoint = requiredBone(options.neutralByName, options.jointBone);
  const neutralParent = requiredBone(options.neutralByName, options.parentBone);
  const candidateLocal = multiply(
    transpose(candidateParent.localToWorld),
    candidateJoint.localToWorld,
  );
  const neutralLocal = multiply(transpose(neutralParent.localToWorld), neutralJoint.localToWorld);
  const delta = multiply(candidateLocal, transpose(neutralLocal));
  const vector = rotationVector(delta);
  const expectedAxis = Object.freeze([neutralLocal[2], neutralLocal[5], neutralLocal[8]] as const);
  const signedRadians =
    vector[0] * expectedAxis[0] + vector[1] * expectedAxis[1] + vector[2] * expectedAxis[2];
  const totalRadians = Math.hypot(...vector);
  const offPlaneRadians = Math.sqrt(
    Math.max(0, totalRadians * totalRadians - signedRadians * signedRadians),
  );
  const signedBendDeg = (signedRadians * options.semanticDirection * 180) / Math.PI;
  const offPlaneDeg = (offPlaneRadians * 180) / Math.PI;
  return Object.freeze({
    id: options.id,
    signedBendDeg,
    offPlaneDeg,
    admissible: signedBendDeg >= -1.5 && offPlaneDeg <= 2,
  });
}

/**
 * Checks elbow and knee deltas in each joint's authenticated neutral parent frame. Removing the
 * candidate parent transform makes the result invariant to torso, shoulder-girdle, and hip pose.
 */
export function evaluateMakeHumanSignedHingeDirectionsV1(options: {
  readonly bones: readonly MakeHumanPosedLocalBoneOverlayV4[];
  readonly neutralBones: readonly MakeHumanPosedLocalBoneOverlayV4[];
}): readonly MakeHumanSignedHingeDirectionReceiptV1[] {
  const candidateByName = new Map(options.bones.map((bone) => [bone.bone, bone]));
  const neutralByName = new Map(options.neutralBones.map((bone) => [bone.bone, bone]));
  const hinges: readonly (readonly [
    MakeHumanSignedHingeDirectionReceiptV1['id'],
    string,
    string,
    -1 | 1,
  ])[] = [
    ['left-elbow', 'lowerarm01.L', 'upperarm02.L', -1],
    ['right-elbow', 'lowerarm01.R', 'upperarm02.R', -1],
    ['left-knee', 'lowerleg01.L', 'upperleg02.L', 1],
    ['right-knee', 'lowerleg01.R', 'upperleg02.R', 1],
  ];
  return Object.freeze(
    hinges.map(([id, jointBone, parentBone, semanticDirection]) =>
      evaluateSignedHinge({
        id,
        jointBone,
        parentBone,
        semanticDirection,
        candidateByName,
        neutralByName,
      }),
    ),
  );
}

/**
 * Fast product-interaction guard for live direct manipulation. It intentionally evaluates a
 * conservative skeleton/capsule envelope rather than claiming mesh collision authority.
 */
export function evaluateMakeHumanLivePoseAdmissibilityV1(options: {
  readonly bones: readonly MakeHumanPosedLocalBoneOverlayV4[];
  readonly neutralBones: readonly MakeHumanPosedLocalBoneOverlayV4[];
  readonly groundReferenceM: number;
  readonly baselineAnklesM: Readonly<{
    left: MakeHumanLocalJointVec3V3;
    right: MakeHumanLocalJointVec3V3;
  }>;
}): MakeHumanLivePoseAdmissibilityResultV1 {
  if (!Number.isFinite(options.groundReferenceM)) {
    throw new RangeError('Live pose ground reference must be finite.');
  }
  const byName = new Map(options.bones.map((bone) => [bone.bone, bone]));
  const spine01 = requiredBone(byName, 'spine01');
  const spine05 = requiredBone(byName, 'spine05');
  const leftShoulder = requiredBone(byName, 'upperarm01.L');
  const rightShoulder = requiredBone(byName, 'upperarm01.R');
  const leftHip = requiredBone(byName, 'upperleg01.L');
  const rightHip = requiredBone(byName, 'upperleg01.R');
  const shoulderWidth = distance(leftShoulder.headM, rightShoulder.headM);
  const hipWidth = distance(leftHip.headM, rightHip.headM);
  const hipCenter = midpoint(leftHip.headM, rightHip.headM);
  const shoulderCenter = midpoint(leftShoulder.headM, rightShoulder.headM);
  const torsoRadiusM = Math.max(shoulderWidth * 0.2, hipWidth * 0.3);
  const flankRadiusM = Math.max(shoulderWidth * 0.16, hipWidth * 0.22);
  const depthRadiusM = Math.max(shoulderWidth * 0.13, hipWidth * 0.18);
  const depthOffsetM = Math.max(shoulderWidth * 0.11, hipWidth * 0.15);
  const lateralAxis = normalized(
    subtract(leftShoulder.headM, rightShoulder.headM),
    'posed torso lateral axis',
  );
  const spineAxis = normalized(subtract(shoulderCenter, hipCenter), 'posed torso spine axis');
  const depthAxis = normalized(cross(lateralAxis, spineAxis), 'posed torso depth axis');
  const leftFlankStart = interpolate(hipCenter, leftHip.headM, 0.5);
  const leftFlankEnd = interpolate(shoulderCenter, leftShoulder.headM, 0.55);
  const rightFlankStart = interpolate(hipCenter, rightHip.headM, 0.5);
  const rightFlankEnd = interpolate(shoulderCenter, rightShoulder.headM, 0.55);
  const shoulderCapStart = interpolate(shoulderCenter, leftShoulder.headM, 0.76);
  const shoulderCapEnd = interpolate(shoulderCenter, rightShoulder.headM, 0.76);
  const torsoObstacles: readonly MakeHumanLimbGeometricGuardObstacleV1[] = Object.freeze([
    obstacle({
      id: 'torso-core',
      kind: 'torso',
      startM: hipCenter,
      endM: shoulderCenter,
      radiusM: torsoRadiusM,
    }),
    obstacle({
      id: 'torso-left-flank',
      kind: 'torso',
      startM: leftFlankStart,
      endM: leftFlankEnd,
      radiusM: flankRadiusM,
    }),
    obstacle({
      id: 'torso-shoulder-cap',
      kind: 'torso',
      startM: shoulderCapStart,
      endM: shoulderCapEnd,
      radiusM: depthRadiusM,
    }),
    obstacle({
      id: 'torso-right-flank',
      kind: 'torso',
      startM: rightFlankStart,
      endM: rightFlankEnd,
      radiusM: flankRadiusM,
    }),
    ...([-1, 1] as const).flatMap((depthSign) => {
      const directionM = depthSign * depthOffsetM;
      const shellId = depthSign < 0 ? 'negative' : 'positive';
      return [
        obstacle({
          id: `torso-depth-${shellId}-core`,
          kind: 'torso',
          startM: offset(hipCenter, depthAxis, directionM),
          endM: offset(shoulderCenter, depthAxis, directionM),
          radiusM: depthRadiusM,
        }),
        obstacle({
          id: `torso-depth-${shellId}-left-flank`,
          kind: 'torso',
          startM: offset(leftFlankStart, depthAxis, directionM),
          endM: offset(leftFlankEnd, depthAxis, directionM),
          radiusM: flankRadiusM,
        }),
        obstacle({
          id: `torso-depth-${shellId}-right-flank`,
          kind: 'torso',
          startM: offset(rightFlankStart, depthAxis, directionM),
          endM: offset(rightFlankEnd, depthAxis, directionM),
          radiusM: flankRadiusM,
        }),
        obstacle({
          id: `torso-depth-${shellId}-shoulder-cap`,
          kind: 'torso',
          startM: offset(shoulderCapStart, depthAxis, directionM),
          endM: offset(shoulderCapEnd, depthAxis, directionM),
          radiusM: depthRadiusM,
        }),
      ];
    }),
  ]);
  const bodyScaleM = distance(spine01.headM, spine05.tailM);
  const clearanceM = Math.max(0.002, bodyScaleM * 0.006);
  const blockers: MakeHumanLivePoseBlockerV1[] = [];
  const contacts: MakeHumanLimbGeometricGuardContactV1[] = [];
  const hinges = evaluateMakeHumanSignedHingeDirectionsV1({
    bones: options.bones,
    neutralBones: options.neutralBones,
  });
  for (const hinge of hinges) {
    if (!hinge.admissible) appendBlocker(blockers, `${hinge.id}-direction`);
  }

  const arm = (side: 'left' | 'right') => {
    const suffix = side === 'left' ? '.L' : '.R';
    const oppositeSuffix = side === 'left' ? '.R' : '.L';
    const upper = requiredBone(byName, `upperarm01${suffix}`);
    const lower = requiredBone(byName, `lowerarm01${suffix}`);
    const wrist = requiredBone(byName, `wrist${suffix}`);
    const oppositeUpper = requiredBone(byName, `upperarm01${oppositeSuffix}`);
    const oppositeLower = requiredBone(byName, `lowerarm01${oppositeSuffix}`);
    const oppositeWrist = requiredBone(byName, `wrist${oppositeSuffix}`);
    const upperLength = distance(upper.headM, lower.headM);
    const lowerLength = distance(lower.headM, wrist.headM);
    const handLength = distance(wrist.headM, wrist.tailM);
    const oppositeUpperLength = distance(oppositeUpper.headM, oppositeLower.headM);
    const oppositeLowerLength = distance(oppositeLower.headM, oppositeWrist.headM);
    const oppositeHandLength = distance(oppositeWrist.headM, oppositeWrist.tailM);
    const result = evaluateMakeHumanLimbGeometricGuardV1({
      candidate: {
        rootM: upper.headM,
        middleM: lower.headM,
        endM: wrist.headM,
        terminalM: wrist.tailM,
        upperRadiusM: Math.max(0.008, upperLength * 0.075),
        lowerRadiusM: Math.max(0.007, lowerLength * 0.07),
        terminalRadiusM: Math.max(0.006, handLength * 0.11),
      },
      obstacles: [
        ...torsoObstacles,
        obstacle({
          id: `${side}-opposite-upper-arm`,
          kind: 'opposite-limb',
          startM: oppositeUpper.headM,
          endM: oppositeLower.headM,
          radiusM: Math.max(0.008, oppositeUpperLength * 0.075),
        }),
        obstacle({
          id: `${side}-opposite-lower-arm`,
          kind: 'opposite-limb',
          startM: oppositeLower.headM,
          endM: oppositeWrist.headM,
          radiusM: Math.max(0.007, oppositeLowerLength * 0.07),
        }),
        obstacle({
          id: `${side}-opposite-hand`,
          kind: 'opposite-limb',
          startM: oppositeWrist.headM,
          endM: oppositeWrist.tailM,
          radiusM: Math.max(0.006, oppositeHandLength * 0.11),
        }),
      ],
      clearanceM,
    });
    contacts.push(...result.contacts);
    if (!result.admissible) appendBlocker(blockers, `${side}-arm-overlap`);
  };

  const leg = (side: 'left' | 'right') => {
    const suffix = side === 'left' ? '.L' : '.R';
    const oppositeSuffix = side === 'left' ? '.R' : '.L';
    const upper = requiredBone(byName, `upperleg01${suffix}`);
    const lower = requiredBone(byName, `lowerleg01${suffix}`);
    const foot = requiredBone(byName, `foot${suffix}`);
    const oppositeUpper = requiredBone(byName, `upperleg01${oppositeSuffix}`);
    const oppositeLower = requiredBone(byName, `lowerleg01${oppositeSuffix}`);
    const oppositeFoot = requiredBone(byName, `foot${oppositeSuffix}`);
    const upperLength = distance(upper.headM, lower.headM);
    const lowerLength = distance(lower.headM, foot.headM);
    const footLength = distance(foot.headM, foot.tailM);
    const oppositeUpperLength = distance(oppositeUpper.headM, oppositeLower.headM);
    const oppositeLowerLength = distance(oppositeLower.headM, oppositeFoot.headM);
    const oppositeFootLength = distance(oppositeFoot.headM, oppositeFoot.tailM);
    const result = evaluateMakeHumanLimbGeometricGuardV1({
      candidate: {
        rootM: upper.headM,
        middleM: lower.headM,
        endM: foot.headM,
        terminalM: foot.tailM,
        upperRadiusM: Math.max(0.015, upperLength * 0.1),
        lowerRadiusM: Math.max(0.012, lowerLength * 0.085),
        terminalRadiusM: Math.max(0.01, footLength * 0.09),
      },
      obstacles: [
        ...torsoObstacles,
        obstacle({
          id: `${side}-opposite-upper-leg`,
          kind: 'opposite-limb',
          startM: oppositeUpper.headM,
          endM: oppositeLower.headM,
          radiusM: Math.max(0.015, oppositeUpperLength * 0.1),
        }),
        obstacle({
          id: `${side}-opposite-lower-leg`,
          kind: 'opposite-limb',
          startM: oppositeLower.headM,
          endM: oppositeFoot.headM,
          radiusM: Math.max(0.012, oppositeLowerLength * 0.085),
        }),
        obstacle({
          id: `${side}-opposite-foot`,
          kind: 'opposite-limb',
          startM: oppositeFoot.headM,
          endM: oppositeFoot.tailM,
          radiusM: Math.max(0.01, oppositeFootLength * 0.09),
        }),
      ],
      clearanceM,
    });
    contacts.push(...result.contacts);
    if (!result.admissible) appendBlocker(blockers, `${side}-leg-overlap`);
  };

  arm('left');
  arm('right');
  leg('left');
  leg('right');

  const leftFoot = requiredBone(byName, 'foot.L');
  const rightFoot = requiredBone(byName, 'foot.R');
  const leftFootM = Math.min(leftFoot.headM[1], leftFoot.tailM[1]);
  const rightFootM = Math.min(rightFoot.headM[1], rightFoot.tailM[1]);
  const averageLegLengthM =
    (distance(leftHip.headM, requiredBone(byName, 'lowerleg01.L').headM) +
      distance(requiredBone(byName, 'lowerleg01.L').headM, leftFoot.headM) +
      distance(rightHip.headM, requiredBone(byName, 'lowerleg01.R').headM) +
      distance(requiredBone(byName, 'lowerleg01.R').headM, rightFoot.headM)) /
    2;
  const toleranceM = Math.max(0.008, averageLegLengthM * 0.018);
  const support = evaluateMakeHumanFixedRootSupportGuardV1({
    baselineLeftAnkleM: options.baselineAnklesM.left,
    baselineRightAnkleM: options.baselineAnklesM.right,
    candidateLeftAnkleM: leftFoot.headM,
    candidateRightAnkleM: rightFoot.headM,
    groundNormalM: Object.freeze([0, 1, 0] as const),
    maximumSupportLiftM: toleranceM,
  });
  const leftSupported = support.supportedSide === 'left' || support.supportedSide === 'both';
  const rightSupported = support.supportedSide === 'right' || support.supportedSide === 'both';
  if (!support.admissible) appendBlocker(blockers, 'no-grounded-foot');
  if (
    leftFootM < options.groundReferenceM - toleranceM ||
    rightFootM < options.groundReferenceM - toleranceM
  ) {
    appendBlocker(blockers, 'foot-below-ground');
  }

  return Object.freeze({
    version: MAKEHUMAN_LIVE_POSE_ADMISSIBILITY_V1,
    admissible: blockers.length === 0,
    blockers: Object.freeze(blockers),
    contacts: Object.freeze(contacts),
    hinges,
    ground: Object.freeze({
      referenceM: options.groundReferenceM,
      toleranceM,
      leftFootM,
      rightFootM,
      leftSupported,
      rightSupported,
    }),
    claims: CLAIMS,
  });
}
