import type { AddModelResponse, common_ModelInsert } from 'api/proto-http/admin';

import type { ModelMannequinPoseDraftOwnerV1 } from './model-mannequin-pose-draft-owner-v1';
import {
  putModelMannequinPoseV1,
  type ModelMannequinPoseAdminServiceV1,
} from './model-mannequin-pose-transport-v1';

export type ModelCreatePoseHandoffPendingV1 =
  | Readonly<{
      kind: 'pose-retry';
      modelId: number;
      message: string;
    }>
  | Readonly<{
      kind: 'created-id-missing';
      message: string;
    }>;

export type ModelCreatePoseHandoffResultV1 =
  | Readonly<{ kind: 'complete'; modelId: number }>
  | ModelCreatePoseHandoffPendingV1;

type ModelCreatePoseRetryPendingV1 = Extract<
  ModelCreatePoseHandoffPendingV1,
  { readonly kind: 'pose-retry' }
>;

function validCreatedModelId(value: number | undefined): value is number {
  return Number.isSafeInteger(value) && (value ?? 0) > 0;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'The mannequin pose could not be saved.';
}

function poseRetryReceipt(modelId: number, error: unknown): ModelCreatePoseRetryPendingV1 {
  return Object.freeze({
    kind: 'pose-retry',
    modelId,
    message: `Model #${modelId} was added, but its mannequin pose was not saved. Retry saves only the current pose to this model and will not add another model. Model fields are locked and are not resubmitted. ${errorMessage(error)}`,
  });
}

function isTransientWriteFailure(error: unknown): boolean {
  const status = (error as { status?: number } | null | undefined)?.status;
  return status === undefined || status === 408 || status === 429 || status >= 500;
}

/**
 * Persists a newly-created model's dirty owner through the same canonical request and strict wire
 * validation used by the existing-detail pose transport.
 */
export async function saveCreatedModelMannequinPoseV1(options: {
  readonly service: ModelMannequinPoseAdminServiceV1;
  readonly owner: ModelMannequinPoseDraftOwnerV1;
  readonly modelId: number;
}): Promise<void> {
  const { service, owner, modelId } = options;
  owner.bindModelId(modelId);
  const before = owner.getSnapshot();
  if (before.phase === 'error') owner.clearError();
  if (before.phase === 'conflict') owner.rebaseDraftOnConflict();

  const request = await owner.beginSave();
  let result: Awaited<ReturnType<typeof putModelMannequinPoseV1>>;
  try {
    result = await putModelMannequinPoseV1(service, request);
  } catch (error) {
    await owner.acceptSaveResult(request, {
      kind: 'rejected',
      failure: isTransientWriteFailure(error) ? 'transient' : 'permanent',
      message: errorMessage(error),
    });
    throw error;
  }
  await owner.acceptSaveResult(request, result);

  const after = owner.getSnapshot();
  if (after.phase === 'conflict') {
    throw new Error(
      'The saved pose changed while the new model was being created. Retry the pose.',
    );
  }
  if (after.dirty) {
    throw new Error('The model was created, but its latest mannequin pose is still unsaved.');
  }
}

/**
 * Retries only the durable pose write named by an existing create receipt. It intentionally has no
 * model payload or AddModel dependency, so form validation and later field edits cannot affect it.
 */
export async function retryCreatedModelMannequinPoseV1(options: {
  readonly pending: ModelCreatePoseRetryPendingV1;
  readonly poseOwner: ModelMannequinPoseDraftOwnerV1;
  readonly saveCreatedPose: (
    owner: ModelMannequinPoseDraftOwnerV1,
    modelId: number,
  ) => Promise<void>;
}): Promise<ModelCreatePoseHandoffResultV1> {
  const { pending, poseOwner, saveCreatedPose } = options;
  poseOwner.bindModelId(pending.modelId);
  try {
    await saveCreatedPose(poseOwner, pending.modelId);
    return Object.freeze({ kind: 'complete', modelId: pending.modelId });
  } catch (error) {
    return poseRetryReceipt(pending.modelId, error);
  }
}

/**
 * One-way create receipt. Once AddModel returns an ID, every later attempt is constrained to that
 * model's pose resource and can never create a duplicate model.
 */
export async function submitModelCreateWithPoseHandoffV1(options: {
  readonly model: common_ModelInsert;
  readonly pending: ModelCreatePoseHandoffPendingV1 | null;
  readonly poseOwner: ModelMannequinPoseDraftOwnerV1;
  readonly poseRpcEnabled: boolean;
  readonly createModel: (model: common_ModelInsert) => Promise<AddModelResponse>;
  readonly saveCreatedPose: (
    owner: ModelMannequinPoseDraftOwnerV1,
    modelId: number,
  ) => Promise<void>;
}): Promise<ModelCreatePoseHandoffResultV1> {
  const { model, pending, poseOwner, poseRpcEnabled, createModel, saveCreatedPose } = options;
  if (pending?.kind === 'created-id-missing') return pending;

  if (pending?.kind === 'pose-retry') {
    return retryCreatedModelMannequinPoseV1({ pending, poseOwner, saveCreatedPose });
  }

  const response = await createModel(model);
  if (!validCreatedModelId(response.id)) {
    return Object.freeze({
      kind: 'created-id-missing',
      message:
        'The model was added, but the server did not return its ID. Model fields are locked. Open the model list before editing its pose; submitting again could create a duplicate.',
    });
  }
  const modelId = response.id;

  poseOwner.bindModelId(modelId);
  if (!poseRpcEnabled || !poseOwner.getSnapshot().dirty) {
    return Object.freeze({ kind: 'complete', modelId });
  }

  try {
    await saveCreatedPose(poseOwner, modelId);
    return Object.freeze({ kind: 'complete', modelId });
  } catch (error) {
    return poseRetryReceipt(modelId, error);
  }
}
