import { describe, expect, it } from 'vitest';

import {
  MAKEHUMAN_ARM_BODY_PART_IK_FULL_EXTENSION_DETENT_DEG_V1,
  solveMakeHumanArmBodyPartIkV1,
} from './makehuman-arm-body-part-ik-v1';

const UPPER_ARM_M = 0.3;
const LOWER_ARM_M = 0.25;
const IDENTITY_FRAME = [1, 0, 0, 0, 1, 0, 0, 0, 1] as const;

function reachForElbowBend(elbowBendDeg: number) {
  const radians = (elbowBendDeg * Math.PI) / 180;
  return Math.sqrt(
    UPPER_ARM_M ** 2 + LOWER_ARM_M ** 2 + 2 * UPPER_ARM_M * LOWER_ARM_M * Math.cos(radians),
  );
}

function solve(side: 'left' | 'right', targetReachM: number) {
  const currentBendRadians = Math.PI / 3;
  return solveMakeHumanArmBodyPartIkV1({
    side,
    shoulderM: [0, 0, 0],
    elbowM: [0, UPPER_ARM_M, 0],
    wristM: [
      LOWER_ARM_M * Math.sin(currentBendRadians),
      UPPER_ARM_M + LOWER_ARM_M * Math.cos(currentBendRadians),
      0,
    ],
    shoulderLocalToWorld: IDENTITY_FRAME,
    targetWristM: [0, targetReachM, 0],
    currentArm: {
      shoulderRaiseDeg: 0,
      shoulderForwardDeg: 0,
      elbowBendDeg: 60,
      wristBendDeg: 0,
    },
  });
}

describe('MakeHuman arm body-part IK full-extension detent', () => {
  it.each(['left', 'right'] as const)(
    'makes a visibly straight %s arm exact zero without allowing hyperextension',
    (side) => {
      const detented = solve(
        side,
        reachForElbowBend(MAKEHUMAN_ARM_BODY_PART_IK_FULL_EXTENSION_DETENT_DEG_V1 - 3),
      );
      const beyondReach = solve(side, UPPER_ARM_M + LOWER_ARM_M + 0.1);

      expect(detented.arm.elbowBendDeg).toBe(0);
      expect(detented.arm.elbowBendDeg).toBeGreaterThanOrEqual(0);
      expect(beyondReach.arm.elbowBendDeg).toBe(0);
      expect(beyondReach.arm.elbowBendDeg).toBeGreaterThanOrEqual(0);
      expect(beyondReach.clampReasons).toContain('target-too-far');
    },
  );

  it('preserves intentional flexion immediately beyond the neutral detent', () => {
    const intentionalBend = MAKEHUMAN_ARM_BODY_PART_IK_FULL_EXTENSION_DETENT_DEG_V1 + 1;
    const solved = solve('left', reachForElbowBend(intentionalBend));

    expect(solved.arm.elbowBendDeg).toBe(intentionalBend);
  });
});
