import type { StoredSeam } from 'lib/seams';

import { rowExactAnchorSig } from '../../assembly-seams/seams-store';
import { bindingScopes, scopeKeyOfBinding } from '../../bom-purpose';
import { rollGoodsScopes } from '../../piece-block-refs';
import type { PatternImportDxfPhaseEZeroConnectPendingHandoffV1 } from './cad-table-zero-connect-post-save-owner-v1';
import type { PatternImportDxfPhaseESavedPatternRowV1 } from './saved-pattern-row-resolver-v1';
import { matchesPatternImportDxfPhaseEZeroConnectFreshSavedOperationInputsV1 } from './zero-connect-fresh-saved-operation-binding-v1';

export const PATTERN_IMPORT_DXF_PHASE_E_ZERO_CONNECT_SECOND_SAVE_COMPLETION_V1 =
  'pattern-import-dxf-phase-e-zero-connect-second-save-completion/1' as const;

type OperationLike = Readonly<{
  historyKey?: string | null;
  operationNumber?: number | null;
  inputKeys?: readonly string[] | null;
  seamKeys?: readonly string[] | null;
}>;

export type PatternImportDxfPhaseEZeroConnectSecondSaveCardV1 = Readonly<{
  id?: number | null;
  lockVersion?: number | null;
  operations?: readonly OperationLike[] | null;
  patterns?: readonly PatternImportDxfPhaseESavedPatternRowV1[] | null;
  bomItems?: Parameters<typeof rollGoodsScopes>[0] | null;
}>;

export type PatternImportDxfPhaseEZeroConnectSecondSaveCompletionBlockerV1 = Readonly<{
  code:
    | 'second-save-completion-owner-superseded'
    | 'second-save-completion-pending-invalid'
    | 'second-save-completion-save-unconfirmed'
    | 'second-save-completion-card-mismatch'
    | 'second-save-completion-source-mismatch'
    | 'second-save-completion-lock-mismatch'
    | 'second-save-completion-live-operation-mismatch'
    | 'second-save-completion-saved-operation-mismatch'
    | 'second-save-completion-stored-seam-mismatch';
  detail: string;
}>;

export type PatternImportDxfPhaseEZeroConnectSecondSaveCompletionResultV1 =
  | Readonly<{
      ok: true;
      completedPending: PatternImportDxfPhaseEZeroConnectPendingHandoffV1;
      nextPending: null;
      blocker: null;
    }>
  | Readonly<{
      ok: false;
      completedPending: null;
      nextPending: PatternImportDxfPhaseEZeroConnectPendingHandoffV1 | null;
      blocker: PatternImportDxfPhaseEZeroConnectSecondSaveCompletionBlockerV1;
    }>;

function blocked(
  pending: PatternImportDxfPhaseEZeroConnectPendingHandoffV1 | null,
  code: PatternImportDxfPhaseEZeroConnectSecondSaveCompletionBlockerV1['code'],
  detail: string,
): PatternImportDxfPhaseEZeroConnectSecondSaveCompletionResultV1 {
  return Object.freeze({
    ok: false as const,
    completedPending: null,
    nextPending: pending,
    blocker: Object.freeze({ code, detail }),
  });
}

function exactAttachedSeamKeys(
  seamKeys: readonly string[] | null | undefined,
  expected: string,
): boolean {
  return (
    Array.isArray(seamKeys) &&
    seamKeys.length === 1 &&
    typeof seamKeys[0] === 'string' &&
    seamKeys[0] === expected
  );
}

function matchingOperation(
  operations: readonly OperationLike[],
  predicate: (operation: OperationLike) => boolean,
): OperationLike | null {
  const matches = operations.filter(predicate);
  return matches.length === 1 ? matches[0]! : null;
}

function currentSavedDxfRowMatchesPending(
  pending: Extract<
    PatternImportDxfPhaseEZeroConnectPendingHandoffV1,
    { status: 'in-memory-final-seam-attached-awaiting-second-save' }
  >,
  savedCard: PatternImportDxfPhaseEZeroConnectSecondSaveCardV1,
): boolean {
  const expected = pending.refreshedAuthoringAuthority.row;
  if (
    expected.techCardId !== pending.catalog.techCardId ||
    expected.scopeKey !== pending.catalog.scopeKey ||
    pending.refreshedAuthoringAuthority.sourceFileId !== pending.catalog.sourceFileId ||
    pending.refreshedAuthoringAuthority.catalogCanonicalSha256 !==
      pending.catalog.canonicalSha256 ||
    pending.refreshedAuthoringAuthority.sizeSelectionCanonicalSha256 !==
      pending.catalog.sizeSelectionCanonicalSha256
  )
    return false;
  const scopes = rollGoodsScopes(savedCard.bomItems ?? []);
  if (scopes.filter(({ key }) => key === expected.scopeKey).length !== 1) return false;
  const patterns = savedCard.patterns ?? [];
  const bindings = bindingScopes(scopes, patterns);
  const matches = patterns.filter(
    (pattern) =>
      scopeKeyOfBinding(pattern.fabricPurpose, pattern.bomLineKey, bindings) === expected.scopeKey,
  );
  if (matches.length !== 1) return false;
  const current = matches[0]!;
  return (
    current.lineKey?.trim() === expected.patternLineKey &&
    current.savedRowRevision === expected.revision &&
    current.url === expected.url &&
    current.sizeBytes === expected.sizeBytes &&
    current.sha256 === expected.sha256
  );
}

/**
 * Proves the non-atomic second save from its completed save signal, exact N+1 card readback and
 * matching server/form rows. Local attachment alone is deliberately insufficient.
 */
export function resolvePatternImportDxfPhaseEZeroConnectSecondSaveCompletionV1(input: {
  pending: PatternImportDxfPhaseEZeroConnectPendingHandoffV1 | null;
  baselineSavedAt: number | null;
  completedSavedAt: number | null | undefined;
  autosaveStatus: string;
  currentTechCardId: number | null | undefined;
  savedCard: PatternImportDxfPhaseEZeroConnectSecondSaveCardV1 | null | undefined;
  liveOperations: readonly OperationLike[];
  storedSeamCardId: number | null | undefined;
  storedSeamLockVersion: number | null | undefined;
  storedSeams: readonly StoredSeam[];
}): PatternImportDxfPhaseEZeroConnectSecondSaveCompletionResultV1 {
  const { pending } = input;
  if (
    !pending ||
    pending.status !== 'in-memory-final-seam-attached-awaiting-second-save' ||
    !Number.isSafeInteger(pending.savedOperationNumber) ||
    pending.savedOperationNumber <= 0 ||
    !Number.isSafeInteger(pending.afterSeamAttachCardLockVersion) ||
    pending.afterSeamAttachCardLockVersion < 0 ||
    !/^[A-Za-z0-9][A-Za-z0-9._:/#-]{0,255}$/.test(pending.finalSeamKey)
  )
    return blocked(
      pending,
      'second-save-completion-pending-invalid',
      'A current attached zero-connect handoff is required before its second save can complete.',
    );
  if (
    input.autosaveStatus !== 'saved' ||
    !Number.isFinite(input.baselineSavedAt) ||
    !Number.isFinite(input.completedSavedAt) ||
    (input.completedSavedAt ?? 0) <= (input.baselineSavedAt ?? 0)
  )
    return blocked(
      pending,
      'second-save-completion-save-unconfirmed',
      'The ordinary second card save has not completed after the seam was attached.',
    );
  const cardId = pending.catalog.techCardId;
  if (
    !Number.isSafeInteger(cardId) ||
    cardId <= 0 ||
    input.currentTechCardId !== cardId ||
    input.savedCard?.id !== cardId
  )
    return blocked(
      pending,
      'second-save-completion-card-mismatch',
      'The saved-card readback does not belong to the pending zero-connect handoff.',
    );
  if (!input.savedCard || !currentSavedDxfRowMatchesPending(pending, input.savedCard))
    return blocked(
      pending,
      'second-save-completion-source-mismatch',
      'The current saved card no longer contains one exact saved-DXF source row for this handoff.',
    );
  const expectedLock = pending.afterSeamAttachCardLockVersion + 1;
  if (!Number.isSafeInteger(expectedLock) || input.savedCard.lockVersion !== expectedLock)
    return blocked(
      pending,
      'second-save-completion-lock-mismatch',
      'The saved-card readback is not the exact ordinary save immediately after the seam write.',
    );
  const expectedInputs = pending.candidate.connection.sides.map(({ pieceLineKey }) =>
    pieceLineKey.trim(),
  ) as [string, string];
  if (!expectedInputs[0] || !expectedInputs[1] || expectedInputs[0] === expectedInputs[1])
    return blocked(
      pending,
      'second-save-completion-pending-invalid',
      'The pending zero-connect handoff no longer contains two distinct ordered pieces.',
    );
  const live = matchingOperation(
    input.liveOperations,
    ({ historyKey }) => historyKey === pending.historyKey,
  );
  if (
    !live ||
    live.operationNumber !== pending.savedOperationNumber ||
    !matchesPatternImportDxfPhaseEZeroConnectFreshSavedOperationInputsV1(
      live.inputKeys,
      expectedInputs,
    ) ||
    !exactAttachedSeamKeys(live.seamKeys, pending.finalSeamKey)
  )
    return blocked(
      pending,
      'second-save-completion-live-operation-mismatch',
      'The current Assembly Order row no longer exactly matches the attached pending handoff.',
    );
  const saved = matchingOperation(
    input.savedCard.operations ?? [],
    ({ operationNumber }) => operationNumber === pending.savedOperationNumber,
  );
  if (
    !saved ||
    !matchesPatternImportDxfPhaseEZeroConnectFreshSavedOperationInputsV1(
      saved.inputKeys,
      expectedInputs,
    ) ||
    !exactAttachedSeamKeys(saved.seamKeys, pending.finalSeamKey)
  )
    return blocked(
      pending,
      'second-save-completion-saved-operation-mismatch',
      'The saved-card readback does not contain the exact operation and echoed seam key.',
    );
  const storedSeamMatches = input.storedSeams.filter(
    ({ seamKey }) => seamKey === pending.finalSeamKey,
  );
  const storedSeam = storedSeamMatches.length === 1 ? storedSeamMatches[0]! : null;
  const expectedStoredSeam = pending.echoedStoredSeam;
  if (
    input.storedSeamCardId !== cardId ||
    !Number.isSafeInteger(input.storedSeamLockVersion) ||
    (input.storedSeamLockVersion ?? -1) < pending.afterSeamAttachCardLockVersion ||
    (input.storedSeamLockVersion ?? Infinity) > expectedLock ||
    !storedSeam ||
    !expectedStoredSeam ||
    expectedStoredSeam.seamKey !== pending.finalSeamKey ||
    storedSeam.status !== 'confirmed' ||
    storedSeam.stale === true ||
    storedSeam.kind !== expectedStoredSeam.kind ||
    storedSeam.direction !== expectedStoredSeam.direction ||
    storedSeam.source !== expectedStoredSeam.source ||
    storedSeam.anchoredSize !== expectedStoredSeam.anchoredSize ||
    storedSeam.note !== expectedStoredSeam.note ||
    rowExactAnchorSig(storedSeam) !== rowExactAnchorSig(expectedStoredSeam)
  )
    return blocked(
      pending,
      'second-save-completion-stored-seam-mismatch',
      'The current seam store does not contain the confirmed non-stale echoed StoredSeam.',
    );
  return Object.freeze({
    ok: true as const,
    completedPending: pending,
    nextPending: null,
    blocker: null,
  });
}

export function blocksPatternImportDxfPhaseEZeroConnectNextConnectionV1(
  pending: PatternImportDxfPhaseEZeroConnectPendingHandoffV1 | null,
  operations: readonly OperationLike[],
): boolean {
  return Boolean(pending && operations.some(({ historyKey }) => historyKey === pending.historyKey));
}

export type PatternImportDxfPhaseEZeroConnectSecondSaveCompletionOwnerV1 = Readonly<{
  bindCurrent: (
    pending: PatternImportDxfPhaseEZeroConnectPendingHandoffV1 | null,
    savedAt: number | null | undefined,
  ) => void;
  complete: (
    input: Omit<
      Parameters<typeof resolvePatternImportDxfPhaseEZeroConnectSecondSaveCompletionV1>[0],
      'baselineSavedAt'
    > & {
      currentPending: PatternImportDxfPhaseEZeroConnectPendingHandoffV1 | null;
    },
  ) => PatternImportDxfPhaseEZeroConnectSecondSaveCompletionResultV1;
  dispose: () => void;
}>;

export type PatternImportDxfPhaseEZeroConnectSecondSaveCompletionSlotV1 = {
  current: PatternImportDxfPhaseEZeroConnectSecondSaveCompletionOwnerV1 | null;
};

type OwnerState = {
  pending: PatternImportDxfPhaseEZeroConnectPendingHandoffV1 | null;
  baselineSavedAt: number | null;
  disposed: boolean;
};

const ownerStates = new WeakMap<object, OwnerState>();

/** Retains the save timestamp observed at attachment and consumes only that exact pending once. */
export function createPatternImportDxfPhaseEZeroConnectSecondSaveCompletionOwnerV1(): PatternImportDxfPhaseEZeroConnectSecondSaveCompletionOwnerV1 {
  const owner = Object.freeze({
    bindCurrent(
      pending: PatternImportDxfPhaseEZeroConnectPendingHandoffV1 | null,
      savedAt: number | null | undefined,
    ) {
      const state = ownerStates.get(owner);
      if (!state || state.disposed || state.pending === pending) return;
      state.pending = pending;
      state.baselineSavedAt =
        pending?.status === 'in-memory-final-seam-attached-awaiting-second-save' &&
        Number.isFinite(savedAt)
          ? savedAt ?? null
          : null;
    },
    complete(
      input: Omit<
        Parameters<typeof resolvePatternImportDxfPhaseEZeroConnectSecondSaveCompletionV1>[0],
        'baselineSavedAt'
      > & {
        currentPending: PatternImportDxfPhaseEZeroConnectPendingHandoffV1 | null;
      },
    ) {
      const state = ownerStates.get(owner);
      if (
        !state ||
        state.disposed ||
        !state.pending ||
        input.pending !== state.pending ||
        input.currentPending !== state.pending
      )
        return blocked(
          input.currentPending,
          'second-save-completion-owner-superseded',
          'The pending zero-connect completion was replaced or its owner was unmounted.',
        );
      const result = resolvePatternImportDxfPhaseEZeroConnectSecondSaveCompletionV1({
        ...input,
        baselineSavedAt: state.baselineSavedAt,
      });
      if (result.ok) {
        state.pending = null;
        state.baselineSavedAt = null;
      }
      return result;
    },
    dispose() {
      const state = ownerStates.get(owner);
      if (!state || state.disposed) return;
      state.pending = null;
      state.baselineSavedAt = null;
      state.disposed = true;
    },
  });
  ownerStates.set(owner, { pending: null, baselineSavedAt: null, disposed: false });
  return owner;
}

export function activatePatternImportDxfPhaseEZeroConnectSecondSaveCompletionV1(
  slot: PatternImportDxfPhaseEZeroConnectSecondSaveCompletionSlotV1,
  pending: PatternImportDxfPhaseEZeroConnectPendingHandoffV1 | null,
  savedAt: number | null | undefined,
): PatternImportDxfPhaseEZeroConnectSecondSaveCompletionOwnerV1 {
  slot.current?.dispose();
  const owner = createPatternImportDxfPhaseEZeroConnectSecondSaveCompletionOwnerV1();
  owner.bindCurrent(pending, savedAt);
  slot.current = owner;
  return owner;
}

export function deactivatePatternImportDxfPhaseEZeroConnectSecondSaveCompletionV1(
  slot: PatternImportDxfPhaseEZeroConnectSecondSaveCompletionSlotV1,
  owner: PatternImportDxfPhaseEZeroConnectSecondSaveCompletionOwnerV1,
): void {
  if (slot.current === owner) slot.current = null;
  owner.dispose();
}
