import { describe, expect, it } from 'vitest';

import {
  modelOpenReferenceDirectJointRingBeginV9,
  modelOpenReferenceDirectJointRingFinishV9,
  modelOpenReferenceDirectJointRingMoveV9,
  modelOpenReferenceDirectJointSelectionV9,
} from './model-open-reference-direct-joint-ring-v9';
import {
  MODEL_OPEN_REFERENCE_DIRECT_NEUTRAL_POSE_V9,
  snapshotModelOpenReferenceDirectPoseV9,
} from './model-open-reference-direct-pose-v9';

describe('model open-reference direct joint ring v9', () => {
  it('exposes the missing head-yaw and lower-body hinge channels as local rings', () => {
    expect(modelOpenReferenceDirectJointSelectionV9('head-group')).toEqual({
      groupId: 'head-group',
      channel: 'headYawDeg',
    });
    expect(modelOpenReferenceDirectJointSelectionV9('left-hip-group')).toEqual({
      groupId: 'left-hip-group',
      channel: 'hipForwardDeg',
    });
    expect(modelOpenReferenceDirectJointSelectionV9('left-knee')).toEqual({
      groupId: 'left-knee',
      channel: 'kneeBendDeg',
    });
    expect(modelOpenReferenceDirectJointSelectionV9('left-ankle')).toEqual({
      groupId: 'left-ankle',
      channel: 'ankleBendDeg',
    });
  });

  it('changes head yaw without disturbing position-driven pitch and side channels', () => {
    const pose = snapshotModelOpenReferenceDirectPoseV9({
      ...MODEL_OPEN_REFERENCE_DIRECT_NEUTRAL_POSE_V9,
      headPitchDeg: 12,
      headSideDeg: -6,
    });
    const moved = modelOpenReferenceDirectJointRingMoveV9(
      modelOpenReferenceDirectJointRingBeginV9({
        pose,
        selection: modelOpenReferenceDirectJointSelectionV9('head-group'),
        pointerAngleDegrees: 0,
      }),
      18,
    );
    expect(moved.axis).toBe('y');
    expect(moved.draftPose).toMatchObject({
      headPitchDeg: 12,
      headYawDeg: 18,
      headSideDeg: -6,
    });
  });

  it('maps the anterior elbow gesture through the negative physical-Z ring', () => {
    const started = modelOpenReferenceDirectJointRingBeginV9({
      pose: MODEL_OPEN_REFERENCE_DIRECT_NEUTRAL_POSE_V9,
      selection: modelOpenReferenceDirectJointSelectionV9('left-elbow'),
      pointerAngleDegrees: 0,
    });
    const moved = modelOpenReferenceDirectJointRingMoveV9(started, -40);

    expect(started.axis).toBe('z');
    expect(started.ringToSemanticSign).toBe(-1);
    expect(moved.draftPose.leftArm.elbowBendDegrees).toBe(40);
    expect(moved.draftPose.rightArm.elbowBendDegrees).toBe(40);
  });

  it('straightens both linked elbows to exact neutral in one ordinary ring sweep', () => {
    const maximallyFlexed = snapshotModelOpenReferenceDirectPoseV9({
      ...MODEL_OPEN_REFERENCE_DIRECT_NEUTRAL_POSE_V9,
      leftArm: {
        ...MODEL_OPEN_REFERENCE_DIRECT_NEUTRAL_POSE_V9.leftArm,
        elbowBendDegrees: 100,
      },
      rightArm: {
        ...MODEL_OPEN_REFERENCE_DIRECT_NEUTRAL_POSE_V9.rightArm,
        elbowBendDegrees: 100,
      },
    });
    const moved = modelOpenReferenceDirectJointRingMoveV9(
      modelOpenReferenceDirectJointRingBeginV9({
        pose: maximallyFlexed,
        selection: modelOpenReferenceDirectJointSelectionV9('left-elbow'),
        pointerAngleDegrees: 0,
      }),
      55,
    ).draftPose;

    expect(moved.leftArm.elbowBendDegrees).toBe(0);
    expect(moved.rightArm.elbowBendDegrees).toBe(0);
    expect(moved.leftArm.elbowBendDegrees).toBeGreaterThanOrEqual(0);
    expect(moved.rightArm.elbowBendDegrees).toBeGreaterThanOrEqual(0);
  });

  it('detents the terminal straightening zone to zero but keeps low flexion selectable', () => {
    const bent = snapshotModelOpenReferenceDirectPoseV9({
      ...MODEL_OPEN_REFERENCE_DIRECT_NEUTRAL_POSE_V9,
      leftArm: {
        ...MODEL_OPEN_REFERENCE_DIRECT_NEUTRAL_POSE_V9.leftArm,
        elbowBendDegrees: 30,
      },
      rightArm: {
        ...MODEL_OPEN_REFERENCE_DIRECT_NEUTRAL_POSE_V9.rightArm,
        elbowBendDegrees: 30,
      },
    });
    const straightened = modelOpenReferenceDirectJointRingMoveV9(
      modelOpenReferenceDirectJointRingBeginV9({
        pose: bent,
        selection: modelOpenReferenceDirectJointSelectionV9('left-elbow'),
        pointerAngleDegrees: 0,
      }),
      2,
    ).draftPose;
    const lowFlexion = modelOpenReferenceDirectJointRingMoveV9(
      modelOpenReferenceDirectJointRingBeginV9({
        pose: MODEL_OPEN_REFERENCE_DIRECT_NEUTRAL_POSE_V9,
        selection: modelOpenReferenceDirectJointSelectionV9('left-elbow'),
        pointerAngleDegrees: 0,
      }),
      -10,
    ).draftPose;

    expect(straightened.leftArm.elbowBendDegrees).toBe(0);
    expect(straightened.rightArm.elbowBendDegrees).toBe(0);
    expect(lowFlexion.leftArm.elbowBendDegrees).toBe(10);
    expect(lowFlexion.rightArm.elbowBendDegrees).toBe(10);
  });

  it.each([
    ['left', 'left-elbow'],
    ['right', 'right-elbow'],
  ] as const)('straightens only the selected %s elbow when arms are independent', (_, selected) => {
    const independent = snapshotModelOpenReferenceDirectPoseV9({
      ...MODEL_OPEN_REFERENCE_DIRECT_NEUTRAL_POSE_V9,
      armMode: 'independent',
      leftArm: {
        ...MODEL_OPEN_REFERENCE_DIRECT_NEUTRAL_POSE_V9.leftArm,
        elbowBendDegrees: 100,
      },
      rightArm: {
        ...MODEL_OPEN_REFERENCE_DIRECT_NEUTRAL_POSE_V9.rightArm,
        elbowBendDegrees: 100,
      },
    });
    const moved = modelOpenReferenceDirectJointRingMoveV9(
      modelOpenReferenceDirectJointRingBeginV9({
        pose: independent,
        selection: modelOpenReferenceDirectJointSelectionV9(selected),
        pointerAngleDegrees: 0,
      }),
      55,
    ).draftPose;

    expect(moved[selected.startsWith('left') ? 'leftArm' : 'rightArm'].elbowBendDegrees).toBe(0);
    expect(moved[selected.startsWith('left') ? 'rightArm' : 'leftArm'].elbowBendDegrees).toBe(100);
  });

  it('applies ankle and knee rings symmetrically or independently and clamps their envelopes', () => {
    const linkedAnkle = modelOpenReferenceDirectJointRingMoveV9(
      modelOpenReferenceDirectJointRingBeginV9({
        pose: MODEL_OPEN_REFERENCE_DIRECT_NEUTRAL_POSE_V9,
        selection: modelOpenReferenceDirectJointSelectionV9('left-ankle'),
        pointerAngleDegrees: 0,
      }),
      20,
    ).draftPose;
    expect(linkedAnkle.leftLeg.ankleBendDeg).toBe(20);
    expect(linkedAnkle.rightLeg.ankleBendDeg).toBe(20);

    const independent = snapshotModelOpenReferenceDirectPoseV9({
      ...MODEL_OPEN_REFERENCE_DIRECT_NEUTRAL_POSE_V9,
      legMode: 'independent',
    });
    const rightKnee = modelOpenReferenceDirectJointRingMoveV9(
      modelOpenReferenceDirectJointRingBeginV9({
        pose: independent,
        selection: modelOpenReferenceDirectJointSelectionV9('right-knee'),
        pointerAngleDegrees: 0,
      }),
      160,
    ).draftPose;
    expect(rightKnee.leftLeg.kneeBendDeg).toBe(0);
    expect(rightKnee.rightLeg.kneeBendDeg).toBe(120);
  });

  it('restores the exact starting full-body pose when a new-joint ring is cancelled', () => {
    const started = modelOpenReferenceDirectJointRingBeginV9({
      pose: MODEL_OPEN_REFERENCE_DIRECT_NEUTRAL_POSE_V9,
      selection: modelOpenReferenceDirectJointSelectionV9('left-hip-group'),
      pointerAngleDegrees: 0,
    });
    const moved = modelOpenReferenceDirectJointRingMoveV9(started, -25);
    expect(moved.draftPose.leftLeg.hipForwardDeg).toBe(25);
    expect(modelOpenReferenceDirectJointRingFinishV9(moved, 'cancel').pose).toEqual(
      MODEL_OPEN_REFERENCE_DIRECT_NEUTRAL_POSE_V9,
    );
  });
});
