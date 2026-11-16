import type {
  AddModelResponse,
  PutModelMannequinPoseRequest,
  common_ModelInsert,
} from 'api/proto-http/admin';
import { describe, expect, it, vi } from 'vitest';

import {
  MODEL_OPEN_REFERENCE_DIRECT_NEUTRAL_POSE_V9,
  type ModelOpenReferenceDirectPoseV9,
} from './model-open-reference-direct-pose-v9';
import {
  retryCreatedModelMannequinPoseV1,
  saveCreatedModelMannequinPoseV1,
  submitModelCreateWithPoseHandoffV1,
  type ModelCreatePoseHandoffPendingV1,
} from './model-create-pose-handoff-v1';
import { createModelMannequinPoseDraftOwnerV1 } from './model-mannequin-pose-draft-owner-v1';
import type { ModelMannequinPoseAdminServiceV1 } from './model-mannequin-pose-transport-v1';

const MODEL = Object.freeze({ name: 'create pose handoff' }) as common_ModelInsert;
const DIRTY_POSE: ModelOpenReferenceDirectPoseV9 = Object.freeze({
  ...MODEL_OPEN_REFERENCE_DIRECT_NEUTRAL_POSE_V9,
  headYawDeg: 12,
});

async function createOwner(dirty: boolean) {
  const owner = createModelMannequinPoseDraftOwnerV1({
    neutralPose: MODEL_OPEN_REFERENCE_DIRECT_NEUTRAL_POSE_V9,
  });
  await owner.loadRemote({ kind: 'absent' });
  if (dirty) owner.applyEdit(DIRTY_POSE);
  return owner;
}

function serviceWithPut(
  put: (request: PutModelMannequinPoseRequest) => Promise<unknown>,
): ModelMannequinPoseAdminServiceV1 {
  return {
    GetModelMannequinPose: vi.fn(async () => ({ storedPose: undefined })),
    PutModelMannequinPose: vi.fn(async (request) => {
      await put(request);
      return {
        storedPose: {
          modelId: request.modelId,
          pose: request.pose,
          revision: '1',
          updatedAt: '2026-11-16T00:00:00Z',
          updatedBy: 'unit-test',
        },
      };
    }),
  };
}

describe('new model pose handoff v1', () => {
  it('roundtrips a dirty create-session pose to the returned model ID', async () => {
    const owner = await createOwner(true);
    const createModel = vi.fn<() => Promise<AddModelResponse>>(async () => ({ id: 8403 }));
    const service = serviceWithPut(async () => undefined);
    const saveCreatedPose = vi.fn((poseOwner, modelId) =>
      saveCreatedModelMannequinPoseV1({ service, owner: poseOwner, modelId }),
    );

    await expect(
      submitModelCreateWithPoseHandoffV1({
        model: MODEL,
        pending: null,
        poseOwner: owner,
        poseRpcEnabled: true,
        createModel,
        saveCreatedPose,
      }),
    ).resolves.toEqual({ kind: 'complete', modelId: 8403 });
    expect(createModel).toHaveBeenCalledTimes(1);
    expect(service.PutModelMannequinPose).toHaveBeenCalledTimes(1);
    expect(service.PutModelMannequinPose).toHaveBeenCalledWith(
      expect.objectContaining({ modelId: 8403 }),
    );
    expect(owner.getSnapshot()).toMatchObject({ phase: 'ready', dirty: false, revision: '1' });
  });

  it('skips pose PUT for an unchanged neutral create-session pose', async () => {
    const owner = await createOwner(false);
    const createModel = vi.fn(async () => ({ id: 8404 }));
    const saveCreatedPose = vi.fn(async () => undefined);

    await expect(
      submitModelCreateWithPoseHandoffV1({
        model: MODEL,
        pending: null,
        poseOwner: owner,
        poseRpcEnabled: true,
        createModel,
        saveCreatedPose,
      }),
    ).resolves.toEqual({ kind: 'complete', modelId: 8404 });
    expect(createModel).toHaveBeenCalledTimes(1);
    expect(saveCreatedPose).not.toHaveBeenCalled();
  });

  it('keeps dirty create-session pose writes behind the production RPC flag', async () => {
    const owner = await createOwner(true);
    const createModel = vi.fn(async () => ({ id: 8406 }));
    const saveCreatedPose = vi.fn(async () => undefined);

    await expect(
      submitModelCreateWithPoseHandoffV1({
        model: MODEL,
        pending: null,
        poseOwner: owner,
        poseRpcEnabled: false,
        createModel,
        saveCreatedPose,
      }),
    ).resolves.toEqual({ kind: 'complete', modelId: 8406 });
    expect(createModel).toHaveBeenCalledTimes(1);
    expect(saveCreatedPose).not.toHaveBeenCalled();
  });

  it('fails closed after a successful create response without a durable ID', async () => {
    const owner = await createOwner(true);
    const createModel = vi.fn(async () => ({ id: undefined }));
    const saveCreatedPose = vi.fn(async () => undefined);

    const first = await submitModelCreateWithPoseHandoffV1({
      model: MODEL,
      pending: null,
      poseOwner: owner,
      poseRpcEnabled: true,
      createModel,
      saveCreatedPose,
    });
    expect(first).toMatchObject({ kind: 'created-id-missing' });
    expect((first as ModelCreatePoseHandoffPendingV1).message).toMatch(/create a duplicate/);

    await expect(
      submitModelCreateWithPoseHandoffV1({
        model: MODEL,
        pending: first as ModelCreatePoseHandoffPendingV1,
        poseOwner: owner,
        poseRpcEnabled: true,
        createModel,
        saveCreatedPose,
      }),
    ).resolves.toBe(first);
    expect(createModel).toHaveBeenCalledTimes(1);
    expect(saveCreatedPose).not.toHaveBeenCalled();
  });

  it('retries only the pose against the existing ID after a pose PUT failure', async () => {
    const owner = await createOwner(true);
    const createModel = vi.fn(async () => ({ id: 8405 }));
    let putAttempt = 0;
    const service = serviceWithPut(async () => {
      putAttempt += 1;
      if (putAttempt === 1) throw new Error('pose gateway unavailable');
    });
    const saveCreatedPose = (poseOwner: typeof owner, modelId: number) =>
      saveCreatedModelMannequinPoseV1({ service, owner: poseOwner, modelId });

    const first = await submitModelCreateWithPoseHandoffV1({
      model: MODEL,
      pending: null,
      poseOwner: owner,
      poseRpcEnabled: true,
      createModel,
      saveCreatedPose,
    });
    expect(first).toMatchObject({ kind: 'pose-retry', modelId: 8405 });
    expect((first as ModelCreatePoseHandoffPendingV1).message).toMatch(/will not add another/);
    expect(owner.getSnapshot()).toMatchObject({ phase: 'error', dirty: true });

    await expect(
      retryCreatedModelMannequinPoseV1({
        pending: first as Extract<ModelCreatePoseHandoffPendingV1, { readonly kind: 'pose-retry' }>,
        poseOwner: owner,
        saveCreatedPose,
      }),
    ).resolves.toEqual({ kind: 'complete', modelId: 8405 });
    expect(createModel).toHaveBeenCalledTimes(1);
    expect(service.PutModelMannequinPose).toHaveBeenCalledTimes(2);
  });
});
