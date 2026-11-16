import { describe, expect, it } from 'vitest';

import { encodeModelMannequinPoseDocumentV2 } from './model-mannequin-pose-document-v2';
import { createModelMannequinPoseDraftOwnerV1 } from './model-mannequin-pose-draft-owner-v1';
import {
  createModelMannequinPoseSessionBindingV1,
  modelMannequinPosePersistenceViewV1,
} from './model-mannequin-pose-session-v1';
import {
  MODEL_OPEN_REFERENCE_DIRECT_NEUTRAL_POSE_V9,
  type ModelOpenReferenceDirectPoseV9,
} from './model-open-reference-direct-pose-v9';

const FIRST_POSE: ModelOpenReferenceDirectPoseV9 = Object.freeze({
  ...MODEL_OPEN_REFERENCE_DIRECT_NEUTRAL_POSE_V9,
  bodyFlexionDegrees: 8,
});
const LAST_POSE: ModelOpenReferenceDirectPoseV9 = Object.freeze({
  ...MODEL_OPEN_REFERENCE_DIRECT_NEUTRAL_POSE_V9,
  bodyFlexionDegrees: 12,
  headYawDeg: 6,
});

async function readyOwner() {
  const owner = createModelMannequinPoseDraftOwnerV1({
    modelId: 31,
    neutralPose: MODEL_OPEN_REFERENCE_DIRECT_NEUTRAL_POSE_V9,
  });
  await owner.loadRemote({ kind: 'absent' });
  return owner;
}

describe('model mannequin pose session binding v1', () => {
  it('groups every live update in one gesture into one undo entry', async () => {
    const owner = await readyOwner();
    const binding = createModelMannequinPoseSessionBindingV1(owner, owner.getSnapshot());

    binding.onBeginGesture();
    binding.onUpdateGesture(FIRST_POSE);
    binding.onUpdateGesture(LAST_POSE);
    binding.onFinishGesture('commit', LAST_POSE);

    expect(owner.getSnapshot()).toMatchObject({
      dirty: true,
      editing: false,
      canUndo: true,
      draft: { pose: LAST_POSE },
    });
    expect(createModelMannequinPoseSessionBindingV1(owner, owner.getSnapshot()).onUndo()).toEqual(
      MODEL_OPEN_REFERENCE_DIRECT_NEUTRAL_POSE_V9,
    );
    expect(owner.getSnapshot()).toMatchObject({ dirty: false, canUndo: false });
  });

  it('rolls a cancelled live gesture back without adding history', async () => {
    const owner = await readyOwner();
    const binding = createModelMannequinPoseSessionBindingV1(owner, owner.getSnapshot());

    binding.onBeginGesture();
    binding.onUpdateGesture(LAST_POSE);
    binding.onFinishGesture('cancel', LAST_POSE);

    expect(owner.getSnapshot()).toMatchObject({
      dirty: false,
      editing: false,
      canUndo: false,
      draft: { pose: MODEL_OPEN_REFERENCE_DIRECT_NEUTRAL_POSE_V9 },
    });
  });

  it('keeps reset and undo external to the viewport and exposes a canonical render key', async () => {
    const owner = await readyOwner();
    owner.applyEdit(LAST_POSE);
    let binding = createModelMannequinPoseSessionBindingV1(owner, owner.getSnapshot());
    expect(binding.canonicalKey).toBe(encodeModelMannequinPoseDocumentV2(binding.document));

    expect(binding.onReset()).toEqual(MODEL_OPEN_REFERENCE_DIRECT_NEUTRAL_POSE_V9);
    binding = createModelMannequinPoseSessionBindingV1(owner, owner.getSnapshot());
    expect(binding.onUndo()).toEqual(LAST_POSE);
  });

  it('exposes durable save only to model writers and labels clean/dirty state truthfully', async () => {
    const owner = await readyOwner();
    const clean = owner.getSnapshot();
    expect(
      modelMannequinPosePersistenceViewV1({
        snapshot: clean,
        canWrite: true,
        mutationPending: false,
      }),
    ).toMatchObject({ statusText: 'pose · not saved', showSave: true, canSave: false });

    owner.applyEdit(LAST_POSE);
    const dirty = owner.getSnapshot();
    expect(
      modelMannequinPosePersistenceViewV1({
        snapshot: dirty,
        canWrite: true,
        mutationPending: false,
      }),
    ).toMatchObject({ statusText: 'pose · unsaved', showSave: true, canSave: true });
    expect(
      modelMannequinPosePersistenceViewV1({
        snapshot: dirty,
        canWrite: false,
        mutationPending: false,
      }),
    ).toMatchObject({ statusText: 'pose · unsaved', showSave: false, canSave: false });
  });
});
