import { describe, expect, it } from 'vitest';

import {
  MODEL_OPEN_REFERENCE_DIRECT_NEUTRAL_POSE_V9,
  modelOpenReferenceDirectApplyLegIkV9,
  modelOpenReferenceDirectApplyShoulderPostureV9,
  modelOpenReferenceBeginDirectPoseGestureV9,
  modelOpenReferenceDirectPoseGeometryEqualV9,
  modelOpenReferenceDirectRuntimePoseV9,
  modelOpenReferenceDirectSolveShoulderPostureDragV9,
  modelOpenReferenceDirectToggleSymmetryV9,
} from './model-open-reference-direct-pose-v9';

describe('model open-reference direct pose v9', () => {
  it('invalidates an older asynchronous build only when a new gesture supersedes it', () => {
    let cancellations = 0;
    const cancelBuild = () => {
      cancellations += 1;
    };
    expect(modelOpenReferenceBeginDirectPoseGestureV9('idle', cancelBuild)).toBe(false);
    expect(modelOpenReferenceBeginDirectPoseGestureV9('error', cancelBuild)).toBe(false);
    expect(modelOpenReferenceBeginDirectPoseGestureV9('building', cancelBuild)).toBe(true);
    expect(cancellations).toBe(1);
  });

  it('compiles the neutral editor pose to the extended runtime contract', () => {
    const runtime = modelOpenReferenceDirectRuntimePoseV9(
      MODEL_OPEN_REFERENCE_DIRECT_NEUTRAL_POSE_V9,
    );
    expect(runtime.symmetry).toBe('bilateral');
    expect(runtime.legSymmetry).toBe('bilateral');
    expect(runtime.headPitchDeg).toBe(0);
    expect(runtime.shoulderProtractionDeg).toBe(0);
    expect(runtime.shoulderElevationDeg).toBe(0);
    expect(runtime.shoulderLevelDeg).toBe(0);
  });

  it('maps linked shoulder-marker travel to live common elevation and protraction', () => {
    const posture = modelOpenReferenceDirectSolveShoulderPostureDragV9({
      side: 'left',
      linked: true,
      sourceM: [0.2, 1.5, 0],
      targetM: [0.2, 1.6, -0.08],
      current: {
        shoulderProtractionDeg: 0,
        shoulderElevationDeg: 0,
        shoulderLevelDeg: 0,
      },
    });
    expect(posture).toEqual({
      shoulderProtractionDeg: 6,
      shoulderElevationDeg: 6,
      shoulderLevelDeg: 0,
    });
    const changed = modelOpenReferenceDirectApplyShoulderPostureV9(
      MODEL_OPEN_REFERENCE_DIRECT_NEUTRAL_POSE_V9,
      posture,
    );
    expect(
      modelOpenReferenceDirectPoseGeometryEqualV9(
        changed,
        MODEL_OPEN_REFERENCE_DIRECT_NEUTRAL_POSE_V9,
      ),
    ).toBe(false);
  });

  it('uses side-specific vertical travel for shoulder level in independent mode', () => {
    const current = {
      shoulderProtractionDeg: 0,
      shoulderElevationDeg: 2,
      shoulderLevelDeg: 0,
    } as const;
    const left = modelOpenReferenceDirectSolveShoulderPostureDragV9({
      side: 'left',
      linked: false,
      sourceM: [0.2, 1.5, 0],
      targetM: [0.2, 1.6, 0],
      current,
    });
    const right = modelOpenReferenceDirectSolveShoulderPostureDragV9({
      side: 'right',
      linked: false,
      sourceM: [-0.2, 1.5, 0],
      targetM: [-0.2, 1.6, 0],
      current,
    });
    expect(left).toMatchObject({ shoulderElevationDeg: 2, shoulderLevelDeg: 4 });
    expect(right).toMatchObject({ shoulderElevationDeg: 2, shoulderLevelDeg: -4 });
  });

  it('preserves the opposite leg in independent mode and links both in symmetry mode', () => {
    const independent = modelOpenReferenceDirectToggleSymmetryV9(
      MODEL_OPEN_REFERENCE_DIRECT_NEUTRAL_POSE_V9,
    );
    const changed = modelOpenReferenceDirectApplyLegIkV9(independent, 'right', {
      hipForwardDeg: 20,
      hipSideDeg: 5,
      kneeBendDeg: 35,
      ankleBendDeg: 0,
    });
    expect(changed.leftLeg).toEqual(MODEL_OPEN_REFERENCE_DIRECT_NEUTRAL_POSE_V9.leftLeg);
    expect(changed.rightLeg.kneeBendDeg).toBe(35);
    expect(modelOpenReferenceDirectPoseGeometryEqualV9(changed, independent)).toBe(false);

    const linked = modelOpenReferenceDirectToggleSymmetryV9(changed);
    expect(linked.legMode).toBe('linked');
    expect(linked.rightLeg).toEqual(linked.leftLeg);
  });
});
