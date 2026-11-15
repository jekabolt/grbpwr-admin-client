import { describe, expect, it, vi } from 'vitest';

import {
  MODEL_OPEN_REFERENCE_DIRECT_NEUTRAL_POSE_V9,
  type ModelOpenReferenceDirectPoseV9,
} from './model-open-reference-direct-pose-v9';
import {
  createModelMannequinPoseDocumentV2,
  fingerprintModelMannequinPoseDocumentV2,
} from './model-mannequin-pose-document-v2';
import {
  createModelMannequinPoseDraftOwnerV1,
  type StoredModelMannequinPoseV1,
} from './model-mannequin-pose-draft-owner-v1';

const POSE_A: ModelOpenReferenceDirectPoseV9 = {
  ...MODEL_OPEN_REFERENCE_DIRECT_NEUTRAL_POSE_V9,
  bodyFlexionDegrees: 8,
  headYawDeg: 12,
};
const POSE_B: ModelOpenReferenceDirectPoseV9 = {
  ...MODEL_OPEN_REFERENCE_DIRECT_NEUTRAL_POSE_V9,
  bodyFlexionDegrees: 12,
  legMode: 'independent',
  rightLeg: { hipForwardDeg: 15, hipSideDeg: 4, kneeBendDeg: 30, ankleBendDeg: -5 },
};
const POSE_C: ModelOpenReferenceDirectPoseV9 = {
  ...MODEL_OPEN_REFERENCE_DIRECT_NEUTRAL_POSE_V9,
  bodyTwistDegrees: -7,
  headSideDeg: -9,
};

async function stored(
  pose: ModelOpenReferenceDirectPoseV9,
  revision: string,
): Promise<StoredModelMannequinPoseV1> {
  const document = createModelMannequinPoseDocumentV2(pose);
  return {
    document,
    revision,
    canonicalSha256: (await fingerprintModelMannequinPoseDocumentV2(document)).slice(
      'sha256:'.length,
    ),
  };
}

describe('model mannequin pose draft owner v1', () => {
  it('loads absence as a clean neutral baseline and supports transactional edit, cancel and undo', async () => {
    const owner = createModelMannequinPoseDraftOwnerV1({
      modelId: 7,
      neutralPose: MODEL_OPEN_REFERENCE_DIRECT_NEUTRAL_POSE_V9,
    });
    const listener = vi.fn();
    const unsubscribe = owner.subscribe(listener);
    await owner.loadRemote({ kind: 'absent' });
    expect(owner.getSnapshot()).toMatchObject({ phase: 'ready', dirty: false, revision: null });

    owner.beginEdit();
    owner.updateEdit(POSE_A);
    expect(owner.getSnapshot()).toMatchObject({ editing: true, dirty: true, canUndo: true });
    owner.cancelEdit();
    expect(owner.getSnapshot()).toMatchObject({ editing: false, dirty: false });

    owner.beginEdit();
    owner.updateEdit(POSE_A);
    owner.commitEdit();
    expect(owner.getSnapshot()).toMatchObject({ editing: false, dirty: true, canUndo: true });
    owner.undo();
    expect(owner.getSnapshot()).toMatchObject({ dirty: false, canUndo: false });
    expect(listener).toHaveBeenCalled();
    unsubscribe();
  });

  it('builds a canonical first-write request without an expected revision', async () => {
    const owner = createModelMannequinPoseDraftOwnerV1({
      modelId: 9,
      neutralPose: MODEL_OPEN_REFERENCE_DIRECT_NEUTRAL_POSE_V9,
    });
    await owner.loadRemote({ kind: 'absent' });
    owner.applyEdit(POSE_A);
    const request = await owner.beginSave();

    expect(request).toMatchObject({ modelId: 9, operationId: 1 });
    expect(request.expectedRevision).toBeUndefined();
    expect(request.canonicalPayload).toBe(JSON.stringify(request.pose));
    expect(request.canonicalSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(owner.getSnapshot().phase).toBe('saving');
  });

  it('loads and saves with an exact uint64 optimistic revision', async () => {
    const owner = createModelMannequinPoseDraftOwnerV1({
      modelId: 11,
      neutralPose: MODEL_OPEN_REFERENCE_DIRECT_NEUTRAL_POSE_V9,
    });
    await owner.loadRemote({ kind: 'found', stored: await stored(POSE_A, '9007199254740993') });
    owner.applyEdit(POSE_B);
    const request = await owner.beginSave();
    expect(request.expectedRevision).toBe('9007199254740993');

    await owner.acceptSaveResult(request, {
      kind: 'saved',
      stored: await stored(POSE_B, '9007199254740994'),
    });
    expect(owner.getSnapshot()).toMatchObject({
      phase: 'ready',
      dirty: false,
      revision: '9007199254740994',
      canUndo: false,
    });
  });

  it('does not lose a newer local edit when an older request succeeds', async () => {
    const owner = createModelMannequinPoseDraftOwnerV1({
      modelId: 12,
      neutralPose: MODEL_OPEN_REFERENCE_DIRECT_NEUTRAL_POSE_V9,
    });
    await owner.loadRemote({ kind: 'found', stored: await stored(POSE_A, '1') });
    owner.applyEdit(POSE_B);
    const request = await owner.beginSave();
    owner.applyEdit(POSE_C);

    await owner.acceptSaveResult(request, { kind: 'saved', stored: await stored(POSE_B, '2') });
    expect(owner.getSnapshot()).toMatchObject({
      phase: 'ready',
      dirty: true,
      revision: '2',
      draft: { pose: POSE_C },
      baseline: { pose: POSE_B },
    });
  });

  it('preserves the draft on conflict and supports explicit rebase before retry', async () => {
    const owner = createModelMannequinPoseDraftOwnerV1({
      modelId: 13,
      neutralPose: MODEL_OPEN_REFERENCE_DIRECT_NEUTRAL_POSE_V9,
    });
    await owner.loadRemote({ kind: 'found', stored: await stored(POSE_A, '4') });
    owner.applyEdit(POSE_B);
    const request = await owner.beginSave();
    await owner.acceptSaveResult(request, {
      kind: 'conflict',
      current: await stored(POSE_C, '5'),
    });
    expect(owner.getSnapshot()).toMatchObject({
      phase: 'conflict',
      dirty: true,
      revision: '4',
      draft: { pose: POSE_B },
      conflict: { revision: '5', document: { pose: POSE_C } },
    });

    owner.rebaseDraftOnConflict();
    const retry = await owner.beginSave();
    expect(retry.expectedRevision).toBe('5');
    expect(retry.pose.pose).toEqual(POSE_B);
  });

  it('can discard a conflicting draft in favour of the server value', async () => {
    const owner = createModelMannequinPoseDraftOwnerV1({
      modelId: 14,
      neutralPose: MODEL_OPEN_REFERENCE_DIRECT_NEUTRAL_POSE_V9,
    });
    await owner.loadRemote({ kind: 'found', stored: await stored(POSE_A, '1') });
    owner.applyEdit(POSE_B);
    const request = await owner.beginSave();
    await owner.acceptSaveResult(request, {
      kind: 'conflict',
      current: await stored(POSE_C, '2'),
    });
    owner.discardDraftForConflict();

    expect(owner.getSnapshot()).toMatchObject({
      phase: 'ready',
      dirty: false,
      revision: '2',
      canUndo: false,
      draft: { pose: POSE_C },
    });
  });

  it('keeps a rejected draft retryable and rejects stale results or corrupt remote state', async () => {
    const owner = createModelMannequinPoseDraftOwnerV1({
      modelId: 15,
      neutralPose: MODEL_OPEN_REFERENCE_DIRECT_NEUTRAL_POSE_V9,
    });
    await expect(
      owner.loadRemote({
        kind: 'found',
        stored: {
          ...(await stored(POSE_A, '1')),
          canonicalSha256: '0'.repeat(64),
        },
      }),
    ).rejects.toThrow(/fingerprint does not match/);

    await owner.loadRemote({ kind: 'absent' });
    owner.applyEdit(POSE_A);
    const request = await owner.beginSave();
    await owner.acceptSaveResult(request, {
      kind: 'rejected',
      failure: 'transient',
      message: 'offline',
    });
    expect(owner.getSnapshot()).toMatchObject({ phase: 'error', dirty: true, error: 'offline' });
    owner.clearError();
    const retry = await owner.beginSave();
    await expect(
      owner.acceptSaveResult(request, { kind: 'saved', stored: await stored(POSE_A, '1') }),
    ).rejects.toThrow(/stale or foreign/);
    expect(retry.operationId).toBe(2);
  });

  it('reset is undoable', async () => {
    const owner = createModelMannequinPoseDraftOwnerV1({
      modelId: 16,
      neutralPose: MODEL_OPEN_REFERENCE_DIRECT_NEUTRAL_POSE_V9,
    });
    await owner.loadRemote({ kind: 'found', stored: await stored(POSE_A, '1') });
    owner.reset();
    expect(owner.getSnapshot()).toMatchObject({ dirty: true, canUndo: true });
    owner.undo();
    expect(owner.getSnapshot()).toMatchObject({ dirty: false, draft: { pose: POSE_A } });
  });
});
