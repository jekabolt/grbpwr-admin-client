import type { PatternImportDxfProductPhaseEAuthoringCatalogV1 } from 'lib/cloth/domain/pattern-import-dxf-product-phase-e-authoring-catalog-v1';
import type { PatternImportDxfProductPhaseEAssemblyProjectionV1 } from 'lib/pattern-import/dxf-product-phase-e-assembly-workbench-v1';

import {
  isPatternImportDxfPhaseEZeroConnectAuthoringRefreshOwnerV1,
  type PatternImportDxfPhaseEZeroConnectAuthoringHandoffRequestV1,
} from './cad-table-zero-connect-authoring-handoff-v1';
import { isPatternImportDxfPhaseECadTableZeroConnectAuthoringRequestV1 } from './cad-table-zero-connect-controller-v1';
import {
  isPatternImportDxfPhaseEZeroConnectPreparedAuthorityV1,
  type PatternImportDxfPhaseEZeroConnectPreparedAuthorityV1,
} from './cad-table-zero-connect-phase-e-authority-v1';
import type { PatternImportDxfPhaseECadTableZeroConnectCandidateV1 } from './cad-table-zero-connect-session-v1';
import {
  PATTERN_IMPORT_DXF_PHASE_E_ZERO_CONNECT_POST_SAVE_SEAM_LINK_CLAIMS_V1,
  PATTERN_IMPORT_DXF_PHASE_E_ZERO_CONNECT_POST_SAVE_SEAM_LINK_V1,
  type PatternImportDxfPhaseEZeroConnectPostSaveSeamFinalReceiptV1,
  type PatternImportDxfPhaseEZeroConnectPostSaveSeamLinkBlockerV1,
  type PatternImportDxfPhaseEZeroConnectSavedDraftOperationReceiptV1,
} from './cad-table-zero-connect-post-save-seam-link-v1';

export const PATTERN_IMPORT_DXF_PHASE_E_ZERO_CONNECT_POST_SAVE_OWNER_V1 =
  'pattern-import-dxf-phase-e-zero-connect-post-save-owner/1' as const;
export const PATTERN_IMPORT_DXF_PHASE_E_ZERO_CONNECT_PENDING_HANDOFF_V1 =
  'pattern-import-dxf-phase-e-zero-connect-pending-handoff/1' as const;

export const PATTERN_IMPORT_DXF_PHASE_E_ZERO_CONNECT_POST_SAVE_OWNER_CLAIMS_V1 = Object.freeze({
  existingOperationsFieldIsSoleAttachmentOwner: true,
  sameSessionHistoryCorrelationRequired: true,
  positiveOperationNumberRequired: true,
  explicitStoredSeamDirectionRequired: true,
  submittedSeamKeyAcceptedAsFinal: false,
  strictSeamEchoRequired: true,
  syntheticOperationIdentityCreated: false,
  autosaveRequested: false,
  operationAndSeamWritesAtomic: false,
  exactSidecarCreated: false,
  pendingEvidenceRetainedInMemoryOnly: true,
  pendingEvidenceRetainedAfterSeamAttach: true,
  pendingEvidenceReconstructed: false,
} as const);

type PatternImportDxfPhaseEZeroConnectPendingHandoffCommonV1 = Readonly<{
  schemaVersion: typeof PATTERN_IMPORT_DXF_PHASE_E_ZERO_CONNECT_PENDING_HANDOFF_V1;
  historyKey: string;
  candidate: PatternImportDxfPhaseECadTableZeroConnectCandidateV1;
  catalog: PatternImportDxfProductPhaseEAuthoringCatalogV1;
  projection: PatternImportDxfProductPhaseEAssemblyProjectionV1;
  authoringAuthority: PatternImportDxfPhaseEZeroConnectAuthoringHandoffRequestV1['authoringAuthority'];
  authoringAuthorityRefresh: PatternImportDxfPhaseEZeroConnectAuthoringHandoffRequestV1['authoringAuthorityRefresh'];
  durableOperationId: null;
}>;

export type PatternImportDxfPhaseEZeroConnectPendingHandoffV1 = Readonly<
  PatternImportDxfPhaseEZeroConnectPendingHandoffCommonV1 &
    (
      | Readonly<{ status: 'in-memory-awaiting-save-direction-and-seam-link' }>
      | Readonly<{
          status: 'in-memory-final-seam-attached-awaiting-second-save';
          savedOperationNumber: number;
          finalSeamKey: string;
          afterSeamAttachCardLockVersion: number;
          refreshedAuthoringAuthority: PatternImportDxfPhaseEZeroConnectPreparedAuthorityV1;
        }>
    )
>;

export type PatternImportDxfPhaseEZeroConnectPostSaveOwnerRequestV1 = Readonly<{
  schemaVersion: typeof PATTERN_IMPORT_DXF_PHASE_E_ZERO_CONNECT_POST_SAVE_OWNER_V1;
  candidate: PatternImportDxfPhaseECadTableZeroConnectCandidateV1;
  catalog: PatternImportDxfProductPhaseEAuthoringCatalogV1;
  projection: PatternImportDxfProductPhaseEAssemblyProjectionV1;
  authoringAuthority: PatternImportDxfPhaseEZeroConnectAuthoringHandoffRequestV1['authoringAuthority'];
  authoringAuthorityRefresh: PatternImportDxfPhaseEZeroConnectAuthoringHandoffRequestV1['authoringAuthorityRefresh'];
  /** No default is permitted at this boundary; the current-operation action must choose it. */
  direction: 'same' | 'reversed';
}>;

export type PatternImportDxfPhaseEZeroConnectPostSaveOwnerBlockerV1 = Readonly<{
  code:
    | PatternImportDxfPhaseEZeroConnectPostSaveSeamLinkBlockerV1['code']
    | 'zero-connect-seam-link-owner-unavailable'
    | 'zero-connect-seam-link-owner-frozen'
    | 'zero-connect-seam-link-request-invalid'
    | 'zero-connect-seam-link-direction-required'
    | 'zero-connect-seam-link-operation-pending-save'
    | 'zero-connect-seam-link-operation-correlation-ambiguous'
    | 'zero-connect-seam-link-operation-changed'
    | 'zero-connect-seam-link-geometry-unavailable'
    | 'zero-connect-seam-link-authority-unavailable'
    | 'zero-connect-seam-link-card-lock-unavailable'
    | 'zero-connect-seam-link-owner-superseded';
  detail: string;
}>;

export type PatternImportDxfPhaseEZeroConnectPostSaveOwnerResultV1 =
  | Readonly<{
      ok: true;
      status: 'final-echoed-seam-key-attached';
      historyKey: string;
      operationNumber: number;
      seamKey: string;
      blocker: null;
      claims: typeof PATTERN_IMPORT_DXF_PHASE_E_ZERO_CONNECT_POST_SAVE_OWNER_CLAIMS_V1;
    }>
  | Readonly<{
      ok: false;
      status: 'pending' | 'blocked';
      historyKey: string | null;
      operationNumber: number | null;
      seamKey: string | null;
      blocker: PatternImportDxfPhaseEZeroConnectPostSaveOwnerBlockerV1;
      claims: typeof PATTERN_IMPORT_DXF_PHASE_E_ZERO_CONNECT_POST_SAVE_OWNER_CLAIMS_V1;
    }>;

export type PatternImportDxfPhaseEZeroConnectPostSaveOwnerV1 =
  | Readonly<{
      status: 'available';
      link: (
        request: PatternImportDxfPhaseEZeroConnectPostSaveOwnerRequestV1,
      ) => Promise<PatternImportDxfPhaseEZeroConnectPostSaveOwnerResultV1>;
    }>
  | Readonly<{
      status: 'unavailable';
      blocker: PatternImportDxfPhaseEZeroConnectPostSaveOwnerBlockerV1;
    }>;

declare const postSaveLifecycleTicketBrand: unique symbol;
export type PatternImportDxfPhaseEZeroConnectPostSaveLifecycleTicketV1 = Readonly<{
  signal: AbortSignal;
  sequence: number;
  readonly [postSaveLifecycleTicketBrand]: never;
}>;

export type PatternImportDxfPhaseEZeroConnectPostSaveLifecycleOwnerV1 = Readonly<{
  bindCurrent: (pending: PatternImportDxfPhaseEZeroConnectPendingHandoffV1 | null) => void;
  begin: (
    pending: PatternImportDxfPhaseEZeroConnectPendingHandoffV1,
  ) => PatternImportDxfPhaseEZeroConnectPostSaveLifecycleTicketV1 | null;
  isCurrent: (
    ticket: PatternImportDxfPhaseEZeroConnectPostSaveLifecycleTicketV1,
    pending: PatternImportDxfPhaseEZeroConnectPendingHandoffV1,
  ) => boolean;
  finish: (ticket: PatternImportDxfPhaseEZeroConnectPostSaveLifecycleTicketV1) => void;
  dispose: () => void;
}>;

export type PatternImportDxfPhaseEZeroConnectPostSaveLifecycleSlotV1 = {
  current: PatternImportDxfPhaseEZeroConnectPostSaveLifecycleOwnerV1 | null;
};

type PostSaveLifecycleTicketState = Readonly<{
  owner: PatternImportDxfPhaseEZeroConnectPostSaveLifecycleOwnerV1;
  pending: PatternImportDxfPhaseEZeroConnectPendingHandoffV1;
  controller: AbortController;
}>;

type PostSaveLifecycleOwnerState = {
  sequence: number;
  boundPending: PatternImportDxfPhaseEZeroConnectPendingHandoffV1 | null;
  active: PatternImportDxfPhaseEZeroConnectPostSaveLifecycleTicketV1 | null;
  disposed: boolean;
};

const postSaveLifecycleTicketStates = new WeakMap<object, PostSaveLifecycleTicketState>();
const postSaveLifecycleOwnerStates = new WeakMap<object, PostSaveLifecycleOwnerState>();

/** One current cancellable owner for the entire refresh → seam RPC → attach transition. */
export function createPatternImportDxfPhaseEZeroConnectPostSaveLifecycleOwnerV1(): PatternImportDxfPhaseEZeroConnectPostSaveLifecycleOwnerV1 {
  const owner = Object.freeze({
    bindCurrent(pending: PatternImportDxfPhaseEZeroConnectPendingHandoffV1 | null) {
      const state = postSaveLifecycleOwnerStates.get(owner);
      if (!state || state.disposed) return;
      state.boundPending = pending;
      if (!state.active) return;
      const activeState = postSaveLifecycleTicketStates.get(state.active);
      if (activeState?.pending === pending) return;
      activeState?.controller.abort();
      state.active = null;
    },
    begin(pending: PatternImportDxfPhaseEZeroConnectPendingHandoffV1) {
      const state = postSaveLifecycleOwnerStates.get(owner);
      if (!state || state.disposed || state.boundPending !== pending) return null;
      if (state.active) {
        postSaveLifecycleTicketStates.get(state.active)?.controller.abort();
        state.active = null;
      }
      const sequence = state.sequence + 1;
      if (!Number.isSafeInteger(sequence) || sequence <= 0) {
        state.disposed = true;
        return null;
      }
      const controller = new AbortController();
      const ticket = Object.freeze({
        signal: controller.signal,
        sequence,
      }) as PatternImportDxfPhaseEZeroConnectPostSaveLifecycleTicketV1;
      postSaveLifecycleTicketStates.set(ticket, Object.freeze({ owner, pending, controller }));
      state.sequence = sequence;
      state.active = ticket;
      return ticket;
    },
    isCurrent(
      ticket: PatternImportDxfPhaseEZeroConnectPostSaveLifecycleTicketV1,
      pending: PatternImportDxfPhaseEZeroConnectPendingHandoffV1,
    ) {
      const state = postSaveLifecycleOwnerStates.get(owner);
      const ticketState = postSaveLifecycleTicketStates.get(ticket);
      return Boolean(
        state &&
          ticketState &&
          !state.disposed &&
          !ticket.signal.aborted &&
          ticketState.owner === owner &&
          ticketState.pending === pending &&
          state.boundPending === pending &&
          state.active === ticket,
      );
    },
    finish(ticket: PatternImportDxfPhaseEZeroConnectPostSaveLifecycleTicketV1) {
      const state = postSaveLifecycleOwnerStates.get(owner);
      if (state?.active === ticket) state.active = null;
    },
    dispose() {
      const state = postSaveLifecycleOwnerStates.get(owner);
      if (!state || state.disposed) return;
      if (state.active) postSaveLifecycleTicketStates.get(state.active)?.controller.abort();
      state.active = null;
      state.boundPending = null;
      state.disposed = true;
    },
  });
  postSaveLifecycleOwnerStates.set(owner, {
    sequence: 0,
    boundPending: null,
    active: null,
    disposed: false,
  });
  return owner;
}

/** Installs a fresh owner for one React effect setup, including a StrictMode replay setup. */
export function activatePatternImportDxfPhaseEZeroConnectPostSaveLifecycleV1(
  slot: PatternImportDxfPhaseEZeroConnectPostSaveLifecycleSlotV1,
  pending: PatternImportDxfPhaseEZeroConnectPendingHandoffV1 | null,
): PatternImportDxfPhaseEZeroConnectPostSaveLifecycleOwnerV1 {
  slot.current?.dispose();
  const owner = createPatternImportDxfPhaseEZeroConnectPostSaveLifecycleOwnerV1();
  owner.bindCurrent(pending);
  slot.current = owner;
  return owner;
}

/** Cleans up only the effect setup that owns this capability; a replayed setup remains current. */
export function deactivatePatternImportDxfPhaseEZeroConnectPostSaveLifecycleV1(
  slot: PatternImportDxfPhaseEZeroConnectPostSaveLifecycleSlotV1,
  owner: PatternImportDxfPhaseEZeroConnectPostSaveLifecycleOwnerV1,
): void {
  if (slot.current === owner) slot.current = null;
  owner.dispose();
}

export type PatternImportDxfPhaseEZeroConnectSeamLinkAuthorityRefreshResultV1 =
  | Readonly<{
      ok: true;
      authority: PatternImportDxfPhaseEZeroConnectPreparedAuthorityV1;
      blocker: null;
    }>
  | Readonly<{
      ok: false;
      authority: null;
      blocker: PatternImportDxfPhaseEZeroConnectPostSaveOwnerBlockerV1;
    }>;

const refreshedAuthorityByOwner = new WeakMap<
  object,
  PatternImportDxfPhaseEZeroConnectPreparedAuthorityV1
>();

function authorityMatchesCatalog(
  authority: PatternImportDxfPhaseEZeroConnectPreparedAuthorityV1,
  catalog: PatternImportDxfProductPhaseEAuthoringCatalogV1,
): boolean {
  return (
    isPatternImportDxfPhaseEZeroConnectPreparedAuthorityV1(authority) &&
    authority.row.techCardId === catalog.techCardId &&
    authority.row.scopeKey === catalog.scopeKey &&
    authority.catalogCanonicalSha256 === catalog.canonicalSha256 &&
    authority.sizeSelectionCanonicalSha256 === catalog.sizeSelectionCanonicalSha256 &&
    authority.sourceFileId === catalog.sourceFileId
  );
}

/** Refreshes the genuine PR411 capability once and retains only its verified opaque result. */
export async function refreshPatternImportDxfPhaseEZeroConnectSeamLinkAuthorityV1(
  request: PatternImportDxfPhaseEZeroConnectPostSaveOwnerRequestV1,
  signal: AbortSignal,
): Promise<PatternImportDxfPhaseEZeroConnectSeamLinkAuthorityRefreshResultV1> {
  if (
    signal.aborted ||
    !authorityMatchesCatalog(request.authoringAuthority, request.catalog) ||
    !isPatternImportDxfPhaseEZeroConnectAuthoringRefreshOwnerV1(request.authoringAuthorityRefresh, {
      authority: request.authoringAuthority,
      catalog: request.catalog,
      projection: request.projection,
    })
  )
    return Object.freeze({
      ok: false as const,
      authority: null,
      blocker: Object.freeze({
        code: 'zero-connect-seam-link-authority-unavailable' as const,
        detail: 'The exact saved-DXF authoring capability is absent, stale or cancelled.',
      }),
    });
  const cached = refreshedAuthorityByOwner.get(request.authoringAuthorityRefresh);
  if (cached) return Object.freeze({ ok: true as const, authority: cached, blocker: null });
  const refreshed = await request.authoringAuthorityRefresh.refresh(signal);
  if (
    !refreshed.ok ||
    signal.aborted ||
    !authorityMatchesCatalog(refreshed.authority, request.catalog)
  )
    return Object.freeze({
      ok: false as const,
      authority: null,
      blocker: Object.freeze({
        code: 'zero-connect-seam-link-authority-unavailable' as const,
        detail: refreshed.ok
          ? 'The refreshed saved-DXF authoring authority no longer matches this exact connection.'
          : refreshed.blocker.detail,
      }),
    });
  refreshedAuthorityByOwner.set(request.authoringAuthorityRefresh, refreshed.authority);
  return Object.freeze({ ok: true as const, authority: refreshed.authority, blocker: null });
}

type OperationLike = Readonly<{
  historyKey?: string;
  operationNumber?: number;
  seamKeys?: readonly string[];
  inputKeys?: readonly string[];
}>;

/** Retains the exact gesture evidence above a zero-operation host that is about to unmount. */
export function createPatternImportDxfPhaseEZeroConnectPendingHandoffV1(input: {
  historyKey: string;
  request: PatternImportDxfPhaseEZeroConnectAuthoringHandoffRequestV1;
}): PatternImportDxfPhaseEZeroConnectPendingHandoffV1 | null {
  const { request } = input;
  if (
    !input.historyKey ||
    !isPatternImportDxfPhaseECadTableZeroConnectAuthoringRequestV1(request) ||
    input.historyKey !== request.candidate.operation.sessionOperationId ||
    request.candidate.operation.operationNumber !== 0 ||
    request.candidate.operation.authoringOperationId !== null
  )
    return null;
  return Object.freeze({
    schemaVersion: PATTERN_IMPORT_DXF_PHASE_E_ZERO_CONNECT_PENDING_HANDOFF_V1,
    status: 'in-memory-awaiting-save-direction-and-seam-link' as const,
    historyKey: input.historyKey,
    candidate: request.candidate,
    catalog: request.catalog,
    projection: request.projection,
    authoringAuthority: request.authoringAuthority,
    authoringAuthorityRefresh: request.authoringAuthorityRefresh,
    durableOperationId: null,
  });
}

/**
 * Advances the retained in-memory evidence only after a verified seam echo and a fresh card lock.
 * It remains pending because attaching a key to the form is not the ordinary second save.
 */
export function markPatternImportDxfPhaseEZeroConnectPendingSeamAttachedV1(
  pending: PatternImportDxfPhaseEZeroConnectPendingHandoffV1 | null,
  finalReceipt: PatternImportDxfPhaseEZeroConnectPostSaveSeamFinalReceiptV1,
  afterSeamAttachCardLockVersion: number,
  refreshedAuthoringAuthority: PatternImportDxfPhaseEZeroConnectPreparedAuthorityV1,
): PatternImportDxfPhaseEZeroConnectPendingHandoffV1 | null {
  const operation = finalReceipt?.operation;
  if (
    !pending ||
    pending.status !== 'in-memory-awaiting-save-direction-and-seam-link' ||
    !operation ||
    finalReceipt.schemaVersion !== PATTERN_IMPORT_DXF_PHASE_E_ZERO_CONNECT_POST_SAVE_SEAM_LINK_V1 ||
    finalReceipt.status !== 'final-echoed-seam-key-ready-for-operation-attach' ||
    finalReceipt.claims !== PATTERN_IMPORT_DXF_PHASE_E_ZERO_CONNECT_POST_SAVE_SEAM_LINK_CLAIMS_V1 ||
    finalReceipt.nextCommand?.seamKey !== finalReceipt.finalSeamKey ||
    operation.historyKey !== pending.historyKey ||
    !Number.isSafeInteger(operation.operationNumber) ||
    operation.operationNumber <= 0 ||
    !Number.isSafeInteger(afterSeamAttachCardLockVersion) ||
    afterSeamAttachCardLockVersion < 0 ||
    finalReceipt.seamWriteLockVersion !== afterSeamAttachCardLockVersion ||
    !/^[A-Za-z0-9][A-Za-z0-9._:/#-]{0,255}$/.test(finalReceipt.finalSeamKey ?? '') ||
    !authorityMatchesCatalog(refreshedAuthoringAuthority, pending.catalog)
  )
    return null;
  return Object.freeze({
    ...pending,
    status: 'in-memory-final-seam-attached-awaiting-second-save' as const,
    savedOperationNumber: operation.operationNumber,
    finalSeamKey: finalReceipt.finalSeamKey,
    afterSeamAttachCardLockVersion,
    refreshedAuthoringAuthority,
  });
}

/** Projects retained evidence onto the live row by history key, never by selected index alone. */
export function patternImportDxfPhaseEZeroConnectPendingForOperationV1(
  pending: PatternImportDxfPhaseEZeroConnectPendingHandoffV1 | null,
  operation: OperationLike | null | undefined,
): PatternImportDxfPhaseEZeroConnectPendingHandoffV1 | null {
  return pending && operation?.historyKey === pending.historyKey ? pending : null;
}

export type PatternImportDxfPhaseEZeroConnectSavedOperationResolutionV1 =
  | Readonly<{
      ok: true;
      operationIndex: number;
      savedOperation: PatternImportDxfPhaseEZeroConnectSavedDraftOperationReceiptV1;
      blocker: null;
    }>
  | Readonly<{
      ok: false;
      operationIndex: null;
      savedOperation: null;
      blocker: PatternImportDxfPhaseEZeroConnectPostSaveOwnerBlockerV1;
    }>;

export type PatternImportDxfPhaseEZeroConnectOperationSeamAttachPlanV1 =
  | Readonly<{
      ok: true;
      operationIndex: number;
      seamKeys: readonly string[];
      changed: boolean;
      blocker: null;
    }>
  | Readonly<{
      ok: false;
      operationIndex: null;
      seamKeys: null;
      changed: false;
      blocker: PatternImportDxfPhaseEZeroConnectPostSaveOwnerBlockerV1;
    }>;

function blocked(
  code: PatternImportDxfPhaseEZeroConnectPostSaveOwnerBlockerV1['code'],
  detail: string,
): PatternImportDxfPhaseEZeroConnectSavedOperationResolutionV1 {
  return Object.freeze({
    ok: false as const,
    operationIndex: null,
    savedOperation: null,
    blocker: Object.freeze({ code, detail }),
  });
}

/** Re-reads the live form and admits exactly one same-session row with a positive server number. */
export function resolvePatternImportDxfPhaseEZeroConnectSavedOperationV1(
  operations: readonly OperationLike[],
  candidate: PatternImportDxfPhaseECadTableZeroConnectCandidateV1,
): PatternImportDxfPhaseEZeroConnectSavedOperationResolutionV1 {
  const historyKey = candidate?.operation?.sessionOperationId ?? '';
  if (!historyKey)
    return blocked(
      'zero-connect-seam-link-request-invalid',
      'The zero-connect candidate has no same-session history correlation.',
    );
  const matches = operations.flatMap((operation, operationIndex) =>
    operation.historyKey === historyKey ? [{ operation, operationIndex }] : [],
  );
  if (matches.length !== 1)
    return blocked(
      'zero-connect-seam-link-operation-correlation-ambiguous',
      matches.length
        ? 'More than one live Assembly Order row has the zero-connect history key.'
        : 'The same-session zero-connect Assembly Order row is no longer present.',
    );
  const match = matches[0]!;
  const operationNumber = match.operation.operationNumber ?? 0;
  if (!Number.isSafeInteger(operationNumber) || operationNumber <= 0)
    return blocked(
      'zero-connect-seam-link-operation-pending-save',
      'Save the new Assembly Order operation before linking its seam.',
    );
  return Object.freeze({
    ok: true as const,
    operationIndex: match.operationIndex,
    savedOperation: Object.freeze({
      status: 'same-session-saved-draft-operation' as const,
      historyKey,
      operationNumber,
    }),
    blocker: null,
  });
}

/** Revalidates the opaque lifecycle capability and the live exact ordered operation inputs. */
export function resolvePatternImportDxfPhaseEZeroConnectCurrentPostSaveAttemptV1(input: {
  lifecycle: PatternImportDxfPhaseEZeroConnectPostSaveLifecycleOwnerV1;
  ticket: PatternImportDxfPhaseEZeroConnectPostSaveLifecycleTicketV1;
  pending: PatternImportDxfPhaseEZeroConnectPendingHandoffV1;
  currentPending: PatternImportDxfPhaseEZeroConnectPendingHandoffV1 | null;
  operations: readonly OperationLike[];
}): PatternImportDxfPhaseEZeroConnectSavedOperationResolutionV1 {
  if (
    input.currentPending !== input.pending ||
    input.pending.status !== 'in-memory-awaiting-save-direction-and-seam-link' ||
    !input.lifecycle.isCurrent(input.ticket, input.pending)
  )
    return blocked(
      'zero-connect-seam-link-owner-superseded',
      'The current exact seam-link attempt was cancelled or superseded.',
    );
  const saved = resolvePatternImportDxfPhaseEZeroConnectSavedOperationV1(
    input.operations,
    input.pending.candidate,
  );
  if (!saved.ok) return saved;
  const expected = input.pending.candidate.connection.sides.map(({ pieceLineKey }) => pieceLineKey);
  const currentInputs = input.operations[saved.operationIndex]?.inputKeys;
  if (
    !Array.isArray(currentInputs) ||
    currentInputs.length !== 2 ||
    expected[0] === expected[1] ||
    currentInputs[0] !== expected[0] ||
    currentInputs[1] !== expected[1]
  )
    return blocked(
      'zero-connect-seam-link-operation-changed',
      'The current saved operation no longer owns the selected ordered piece pair.',
    );
  return saved;
}

/**
 * Rechecks the live row after the non-atomic seam RPC and prepares the one existing-form mutation.
 * A move/save between the two phases fails closed instead of attaching by a stale position.
 */
export function planPatternImportDxfPhaseEZeroConnectOperationSeamAttachV1(
  operations: readonly OperationLike[],
  finalReceipt: PatternImportDxfPhaseEZeroConnectPostSaveSeamFinalReceiptV1,
): PatternImportDxfPhaseEZeroConnectOperationSeamAttachPlanV1 {
  const { historyKey, operationNumber } = finalReceipt.operation;
  const matches = operations.flatMap((operation, operationIndex) =>
    operation.historyKey === historyKey ? [{ operation, operationIndex }] : [],
  );
  if (
    matches.length !== 1 ||
    matches[0]!.operation.operationNumber !== operationNumber ||
    operationNumber <= 0
  )
    return Object.freeze({
      ok: false as const,
      operationIndex: null,
      seamKeys: null,
      changed: false as const,
      blocker: Object.freeze({
        code: 'zero-connect-seam-link-operation-changed' as const,
        detail:
          'The Assembly Order row changed after the seam write; its echoed key was not attached.',
      }),
    });
  const match = matches[0]!;
  const current = (match.operation.seamKeys ?? []).map((key) => key.trim()).filter(Boolean);
  const seamKeys = current.includes(finalReceipt.finalSeamKey)
    ? current
    : [...current, finalReceipt.finalSeamKey];
  return Object.freeze({
    ok: true as const,
    operationIndex: match.operationIndex,
    seamKeys: Object.freeze(seamKeys),
    changed: seamKeys.length !== current.length,
    blocker: null,
  });
}
