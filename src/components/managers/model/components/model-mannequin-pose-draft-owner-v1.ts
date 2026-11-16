import type { ModelOpenReferenceDirectPoseV9 } from './model-open-reference-direct-pose-v9';
import {
  createModelMannequinPoseDocumentV2,
  decodeModelMannequinPoseDocumentV2,
  encodeModelMannequinPoseDocumentV2,
  fingerprintModelMannequinPoseDocumentV2,
  type ModelMannequinPoseDocumentV2,
} from './model-mannequin-pose-document-v2';

export type ModelMannequinPoseRevisionV1 = string;
export type ModelMannequinPoseDraftPhaseV1 = 'unloaded' | 'ready' | 'saving' | 'conflict' | 'error';

export interface StoredModelMannequinPoseV1 {
  readonly document: ModelMannequinPoseDocumentV2;
  /** Decimal uint64 represented as a string so JavaScript cannot lose revision precision. */
  readonly revision: ModelMannequinPoseRevisionV1;
  /** Lowercase SHA-256 hex of the canonical V2 JSON, without the `sha256:` prefix. */
  readonly canonicalSha256: string;
}

export type ModelMannequinPoseLoadResultV1 =
  | Readonly<{ kind: 'absent' }>
  | Readonly<{ kind: 'found'; stored: StoredModelMannequinPoseV1 }>;

export interface PutModelMannequinPoseRequestV1 {
  readonly operationId: number;
  readonly modelId: number;
  readonly pose: ModelMannequinPoseDocumentV2;
  readonly canonicalPayload: string;
  readonly canonicalSha256: string;
  readonly expectedRevision?: ModelMannequinPoseRevisionV1;
}

export type PutModelMannequinPoseResultV1 =
  | Readonly<{ kind: 'saved'; stored: StoredModelMannequinPoseV1 }>
  | Readonly<{ kind: 'conflict'; current: StoredModelMannequinPoseV1 }>
  | Readonly<{
      kind: 'rejected';
      failure: 'transient' | 'permanent';
      message: string;
    }>;

export interface ModelMannequinPoseDraftSnapshotV1 {
  readonly phase: ModelMannequinPoseDraftPhaseV1;
  readonly draft: ModelMannequinPoseDocumentV2;
  readonly baseline: ModelMannequinPoseDocumentV2 | null;
  readonly revision: ModelMannequinPoseRevisionV1 | null;
  readonly dirty: boolean;
  readonly editing: boolean;
  readonly canUndo: boolean;
  readonly conflict: StoredModelMannequinPoseV1 | null;
  readonly error: string | null;
}

export interface ModelMannequinPoseDraftOwnerV1 {
  getSnapshot(): ModelMannequinPoseDraftSnapshotV1;
  subscribe(listener: () => void): () => void;
  bindModelId(modelId: number): void;
  loadRemote(result: ModelMannequinPoseLoadResultV1): Promise<void>;
  beginEdit(): void;
  updateEdit(pose: ModelOpenReferenceDirectPoseV9): void;
  commitEdit(): void;
  cancelEdit(): void;
  applyEdit(pose: ModelOpenReferenceDirectPoseV9): void;
  undo(): void;
  reset(): void;
  beginSave(): Promise<PutModelMannequinPoseRequestV1>;
  acceptSaveResult(
    request: PutModelMannequinPoseRequestV1,
    result: PutModelMannequinPoseResultV1,
  ): Promise<void>;
  rebaseDraftOnConflict(): void;
  discardDraftForConflict(): void;
  clearError(): void;
}

interface MutableOwnerStateV1 {
  phase: ModelMannequinPoseDraftPhaseV1;
  draft: ModelMannequinPoseDocumentV2;
  baseline: ModelMannequinPoseDocumentV2 | null;
  revision: ModelMannequinPoseRevisionV1 | null;
  history: ModelMannequinPoseDocumentV2[];
  editStart: ModelMannequinPoseDocumentV2 | null;
  conflict: StoredModelMannequinPoseV1 | null;
  error: string | null;
  inFlight: PutModelMannequinPoseRequestV1 | null;
}

const SHA256_HEX = /^[0-9a-f]{64}$/;
const UINT64_DECIMAL = /^(0|[1-9][0-9]*)$/;
const HISTORY_LIMIT = 50;

function canonicalDocument(value: ModelMannequinPoseDocumentV2) {
  return decodeModelMannequinPoseDocumentV2(value);
}

function sameDocument(
  left: ModelMannequinPoseDocumentV2 | null,
  right: ModelMannequinPoseDocumentV2 | null,
) {
  if (left === null || right === null) return left === right;
  return encodeModelMannequinPoseDocumentV2(left) === encodeModelMannequinPoseDocumentV2(right);
}

function validModelId(value: number) {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new RangeError('modelId must be a positive safe integer.');
  }
  return value;
}

function validRevision(value: string): ModelMannequinPoseRevisionV1 {
  if (
    !UINT64_DECIMAL.test(value) ||
    BigInt(value) <= 0n ||
    BigInt(value) > 18_446_744_073_709_551_615n
  ) {
    throw new RangeError('A stored mannequin pose revision must be a positive decimal uint64.');
  }
  return value;
}

async function canonicalStoredPose(
  value: StoredModelMannequinPoseV1,
): Promise<StoredModelMannequinPoseV1> {
  const document = canonicalDocument(value.document);
  const revision = validRevision(value.revision);
  if (!SHA256_HEX.test(value.canonicalSha256)) {
    throw new RangeError('canonicalSha256 must be 64 lowercase hexadecimal characters.');
  }
  const expected = (await fingerprintModelMannequinPoseDocumentV2(document)).slice(
    'sha256:'.length,
  );
  if (expected !== value.canonicalSha256) {
    throw new RangeError('Stored mannequin pose fingerprint does not match its canonical payload.');
  }
  return Object.freeze({ document, revision, canonicalSha256: expected });
}

function snapshotOf(state: MutableOwnerStateV1): ModelMannequinPoseDraftSnapshotV1 {
  return Object.freeze({
    phase: state.phase,
    draft: state.draft,
    baseline: state.baseline,
    revision: state.revision,
    dirty: state.baseline !== null && !sameDocument(state.draft, state.baseline),
    editing: state.editStart !== null,
    canUndo: state.editStart !== null || state.history.length > 0,
    conflict: state.conflict,
    error: state.error,
  });
}

export function createModelMannequinPoseDraftOwnerV1(options: {
  readonly modelId?: number;
  readonly neutralPose: ModelOpenReferenceDirectPoseV9;
}): ModelMannequinPoseDraftOwnerV1 {
  let modelId = options.modelId === undefined ? null : validModelId(options.modelId);
  const neutral = createModelMannequinPoseDocumentV2(options.neutralPose);
  const listeners = new Set<() => void>();
  let operationId = 0;
  const state: MutableOwnerStateV1 = {
    phase: 'unloaded',
    draft: neutral,
    baseline: null,
    revision: null,
    history: [],
    editStart: null,
    conflict: null,
    error: null,
    inFlight: null,
  };

  function emit() {
    listeners.forEach((listener) => listener());
  }

  function requireLoaded() {
    if (state.phase === 'unloaded')
      throw new Error('Load the remote mannequin pose before editing.');
  }

  function requireNoEdit() {
    if (state.editStart !== null) throw new Error('Finish or cancel the active pose edit first.');
  }

  function setDraft(document: ModelMannequinPoseDocumentV2) {
    state.draft = canonicalDocument(document);
  }

  function pushHistory(document: ModelMannequinPoseDocumentV2) {
    state.history.push(document);
    if (state.history.length > HISTORY_LIMIT) state.history.shift();
  }

  return Object.freeze({
    getSnapshot: () => snapshotOf(state),

    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    bindModelId(nextModelId) {
      const valid = validModelId(nextModelId);
      if (modelId !== null && modelId !== valid) {
        throw new Error('The mannequin pose owner is already bound to another model.');
      }
      modelId = valid;
    },

    async loadRemote(result) {
      if (state.inFlight !== null) throw new Error('Cannot replace remote state during a save.');
      const stored = result.kind === 'found' ? await canonicalStoredPose(result.stored) : null;
      state.phase = 'ready';
      state.draft = stored?.document ?? neutral;
      state.baseline = stored?.document ?? neutral;
      state.revision = stored?.revision ?? null;
      state.history = [];
      state.editStart = null;
      state.conflict = null;
      state.error = null;
      emit();
    },

    beginEdit() {
      requireLoaded();
      if (state.phase === 'conflict') throw new Error('Resolve the remote pose conflict first.');
      if (state.editStart !== null) throw new Error('A pose edit is already active.');
      state.editStart = state.draft;
      emit();
    },

    updateEdit(pose) {
      requireLoaded();
      if (state.editStart === null) throw new Error('Begin a pose edit before updating it.');
      setDraft(createModelMannequinPoseDocumentV2(pose));
      emit();
    },

    commitEdit() {
      requireLoaded();
      if (state.editStart === null) throw new Error('There is no active pose edit to commit.');
      const start = state.editStart;
      state.editStart = null;
      if (!sameDocument(start, state.draft)) pushHistory(start);
      emit();
    },

    cancelEdit() {
      requireLoaded();
      if (state.editStart === null) return;
      setDraft(state.editStart);
      state.editStart = null;
      emit();
    },

    applyEdit(pose) {
      requireLoaded();
      requireNoEdit();
      const next = createModelMannequinPoseDocumentV2(pose);
      if (sameDocument(next, state.draft)) return;
      pushHistory(state.draft);
      setDraft(next);
      emit();
    },

    undo() {
      requireLoaded();
      if (state.editStart !== null) {
        setDraft(state.editStart);
        state.editStart = null;
        emit();
        return;
      }
      const previous = state.history.pop();
      if (!previous) return;
      setDraft(previous);
      emit();
    },

    reset() {
      requireLoaded();
      requireNoEdit();
      if (sameDocument(neutral, state.draft)) return;
      pushHistory(state.draft);
      setDraft(neutral);
      emit();
    },

    async beginSave() {
      requireLoaded();
      requireNoEdit();
      if (modelId === null) throw new Error('Bind the created model ID before saving its pose.');
      const boundModelId = modelId;
      if (state.phase === 'conflict') throw new Error('Resolve the remote pose conflict first.');
      if (state.inFlight !== null) throw new Error('A mannequin pose save is already in flight.');
      if (state.baseline === null || sameDocument(state.draft, state.baseline)) {
        throw new Error('The mannequin pose has no unsaved changes.');
      }
      const pose = canonicalDocument(state.draft);
      const canonicalPayload = encodeModelMannequinPoseDocumentV2(pose);
      const canonicalSha256 = (await fingerprintModelMannequinPoseDocumentV2(pose)).slice(
        'sha256:'.length,
      );
      const request: PutModelMannequinPoseRequestV1 = Object.freeze({
        operationId: ++operationId,
        modelId: boundModelId,
        pose,
        canonicalPayload,
        canonicalSha256,
        ...(state.revision === null ? {} : { expectedRevision: state.revision }),
      });
      state.inFlight = request;
      state.phase = 'saving';
      state.error = null;
      emit();
      return request;
    },

    async acceptSaveResult(request, result) {
      if (state.inFlight?.operationId !== request.operationId || state.inFlight !== request) {
        throw new Error('Cannot apply a stale or foreign mannequin pose save result.');
      }
      if (result.kind === 'rejected') {
        state.inFlight = null;
        state.phase = 'error';
        state.error = result.message;
        emit();
        return;
      }
      const stored = await canonicalStoredPose(
        result.kind === 'saved' ? result.stored : result.current,
      );
      state.inFlight = null;
      state.error = null;
      if (result.kind === 'conflict') {
        state.phase = 'conflict';
        state.conflict = stored;
        emit();
        return;
      }

      const requestStillCurrent =
        encodeModelMannequinPoseDocumentV2(state.draft) === request.canonicalPayload;
      state.baseline = stored.document;
      state.revision = stored.revision;
      state.conflict = null;
      state.phase = 'ready';
      if (requestStillCurrent) {
        state.draft = stored.document;
        state.history = [];
      }
      emit();
    },

    rebaseDraftOnConflict() {
      requireLoaded();
      requireNoEdit();
      if (state.phase !== 'conflict' || state.conflict === null) {
        throw new Error('There is no mannequin pose conflict to rebase.');
      }
      state.baseline = state.conflict.document;
      state.revision = state.conflict.revision;
      state.conflict = null;
      state.phase = 'ready';
      state.error = null;
      emit();
    },

    discardDraftForConflict() {
      requireLoaded();
      requireNoEdit();
      if (state.phase !== 'conflict' || state.conflict === null) {
        throw new Error('There is no mannequin pose conflict to discard.');
      }
      state.draft = state.conflict.document;
      state.baseline = state.conflict.document;
      state.revision = state.conflict.revision;
      state.history = [];
      state.conflict = null;
      state.phase = 'ready';
      state.error = null;
      emit();
    },

    clearError() {
      requireLoaded();
      if (state.phase !== 'error') return;
      state.phase = 'ready';
      state.error = null;
      emit();
    },
  } satisfies ModelMannequinPoseDraftOwnerV1);
}
