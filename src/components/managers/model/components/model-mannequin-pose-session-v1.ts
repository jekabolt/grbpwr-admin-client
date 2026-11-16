import { encodeModelMannequinPoseDocumentV2 } from './model-mannequin-pose-document-v2';
import type {
  ModelMannequinPoseDraftOwnerV1,
  ModelMannequinPoseDraftSnapshotV1,
} from './model-mannequin-pose-draft-owner-v1';
import type { ModelOpenReferenceDirectPoseV9 } from './model-open-reference-direct-pose-v9';
import type {
  ModelOpenReferenceDirectPoseBindingV9,
  ModelOpenReferenceDirectPosePersistenceV1,
} from './model-open-reference-preview';

export interface ModelMannequinPosePersistenceViewV1 {
  readonly statusText: string;
  readonly errorText: string | null;
  readonly showSave: boolean;
  readonly canSave: boolean;
  readonly saving: boolean;
  readonly conflict: boolean;
}

export function modelMannequinPosePersistenceViewV1(options: {
  readonly snapshot: ModelMannequinPoseDraftSnapshotV1;
  readonly canWrite: boolean;
  readonly mutationPending: boolean;
}): ModelMannequinPosePersistenceViewV1 {
  const { snapshot, canWrite, mutationPending } = options;
  const saving = mutationPending || snapshot.phase === 'saving';
  const conflict = snapshot.phase === 'conflict';
  const statusText = saving
    ? 'pose · saving'
    : conflict
      ? 'pose · conflict · unsaved'
      : snapshot.dirty
        ? 'pose · unsaved'
        : snapshot.revision
          ? 'pose · saved'
          : 'pose · not saved';
  return Object.freeze({
    statusText,
    errorText: snapshot.phase === 'error' ? snapshot.error : null,
    showSave: canWrite,
    canSave:
      canWrite &&
      snapshot.dirty &&
      !snapshot.editing &&
      !saving &&
      (snapshot.phase === 'ready' || snapshot.phase === 'error'),
    saving,
    conflict,
  });
}

/**
 * Adapts the page-owned session draft to the viewport without introducing another history owner.
 * This binding deliberately exposes no save operation: pose persistence has no backend contract.
 */
export function createModelMannequinPoseSessionBindingV1(
  owner: ModelMannequinPoseDraftOwnerV1,
  snapshot: ModelMannequinPoseDraftSnapshotV1,
  persistence?: ModelOpenReferenceDirectPosePersistenceV1,
): ModelOpenReferenceDirectPoseBindingV9 {
  if (snapshot.phase === 'unloaded') {
    throw new Error('Load the mannequin pose session before binding the viewport.');
  }

  const currentPose = () => owner.getSnapshot().draft.pose;

  return Object.freeze({
    document: snapshot.draft,
    canonicalKey: encodeModelMannequinPoseDocumentV2(snapshot.draft),
    dirty: snapshot.dirty,
    canUndo: snapshot.canUndo,
    onBeginGesture: () => owner.beginEdit(),
    onUpdateGesture: (pose: ModelOpenReferenceDirectPoseV9) => owner.updateEdit(pose),
    onFinishGesture: (outcome: 'commit' | 'cancel', pose: ModelOpenReferenceDirectPoseV9) => {
      if (outcome === 'cancel') {
        owner.cancelEdit();
        return;
      }
      owner.updateEdit(pose);
      owner.commitEdit();
    },
    onDiscreteEdit: (pose: ModelOpenReferenceDirectPoseV9) => owner.applyEdit(pose),
    onUndo: () => {
      owner.undo();
      return currentPose();
    },
    onReset: () => {
      owner.reset();
      return currentPose();
    },
    ...(persistence ? { persistence } : {}),
  });
}
