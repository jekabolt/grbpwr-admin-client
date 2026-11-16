import { describe, expect, it } from 'vitest';

import { modelOpenReferenceTemporaryAppliedHistoryCommitV9 } from './model-open-reference-direct-pose-control-v9';
import {
  MODEL_OPEN_REFERENCE_DIRECT_NEUTRAL_POSE_V9,
  type ModelOpenReferenceDirectPoseV9,
} from './model-open-reference-direct-pose-v9';

const FIRST_DRAFT: ModelOpenReferenceDirectPoseV9 = Object.freeze({
  ...MODEL_OPEN_REFERENCE_DIRECT_NEUTRAL_POSE_V9,
  bodyFlexionDegrees: 4,
});
const COMMITTED_POSE: ModelOpenReferenceDirectPoseV9 = Object.freeze({
  ...MODEL_OPEN_REFERENCE_DIRECT_NEUTRAL_POSE_V9,
  bodyFlexionDegrees: 12,
});

describe('temporary V9 applied-pose undo history', () => {
  it('records one undo entry for one applied commit, not one entry per live draft update', () => {
    let state: {
      readonly history: readonly ModelOpenReferenceDirectPoseV9[];
      readonly previousApplied: ModelOpenReferenceDirectPoseV9 | null;
      readonly suppress: boolean;
    } = {
      history: [] as readonly ModelOpenReferenceDirectPoseV9[],
      previousApplied: MODEL_OPEN_REFERENCE_DIRECT_NEUTRAL_POSE_V9,
      suppress: false,
    };

    // Pointer-move draft updates do not enter the applied-pose history transition.
    for (const draft of [FIRST_DRAFT, COMMITTED_POSE]) {
      expect(draft).not.toEqual(state.previousApplied);
      expect(state.history).toHaveLength(0);
    }

    state = modelOpenReferenceTemporaryAppliedHistoryCommitV9({
      ...state,
      nextApplied: COMMITTED_POSE,
    });
    expect(state.history).toEqual([MODEL_OPEN_REFERENCE_DIRECT_NEUTRAL_POSE_V9]);
    expect(state.history.at(-1)).toEqual(MODEL_OPEN_REFERENCE_DIRECT_NEUTRAL_POSE_V9);
  });

  it('suppresses the commit produced by undo instead of creating a redo-shaped entry', () => {
    const state = modelOpenReferenceTemporaryAppliedHistoryCommitV9({
      history: [],
      previousApplied: COMMITTED_POSE,
      nextApplied: MODEL_OPEN_REFERENCE_DIRECT_NEUTRAL_POSE_V9,
      suppress: true,
    });

    expect(state.history).toHaveLength(0);
    expect(state.previousApplied).toEqual(MODEL_OPEN_REFERENCE_DIRECT_NEUTRAL_POSE_V9);
    expect(state.suppress).toBe(false);
  });
});
