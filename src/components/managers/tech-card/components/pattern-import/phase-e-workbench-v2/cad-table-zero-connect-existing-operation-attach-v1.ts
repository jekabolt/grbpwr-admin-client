import type { common_TechCard } from 'api/proto-http/admin';
import { fromWire, type StoredSeam } from 'lib/seams';
import { rowExactAnchorSig } from '../../assembly-seams/seams-store';

import type { PatternImportDxfPhaseEZeroConnectAuthoringHandoffRequestV1 } from './cad-table-zero-connect-authoring-handoff-v1';
import { isPatternImportDxfPhaseECadTableZeroConnectAuthoringRequestV1 } from './cad-table-zero-connect-controller-v1';

export const PATTERN_IMPORT_DXF_PHASE_E_ZERO_CONNECT_EXISTING_OPERATION_ATTACH_V1 =
  'pattern-import-dxf-phase-e-zero-connect-existing-operation-attach/1' as const;

export const PATTERN_IMPORT_DXF_PHASE_E_ZERO_CONNECT_EXISTING_OPERATION_ATTACH_CLAIMS_V1 =
  Object.freeze({
    existingOperationsFieldIsSoleOwner: true,
    exactSavedEmptyOperationRequired: true,
    seamAndOperationLinkWrittenAtomically: true,
    existingSeamAcceptWriterReused: true,
    appendOperationCalled: false,
    freshSavedCardReadbackRequired: true,
    requestsAutosave: false,
    productionReady: true,
  } as const);

const STABLE_ID = /^[A-Za-z0-9][A-Za-z0-9._:/#-]{0,255}$/;

type OperationLike = Readonly<{
  historyKey?: string;
  operationNumber?: number;
  seamKeys?: readonly string[];
  inputKeys?: readonly string[];
}>;

export type PatternImportDxfPhaseEZeroConnectExistingOperationPendingV1 = Readonly<{
  schemaVersion: typeof PATTERN_IMPORT_DXF_PHASE_E_ZERO_CONNECT_EXISTING_OPERATION_ATTACH_V1;
  status: 'existing-empty-operation-awaiting-direction-and-atomic-link';
  techCardId: number;
  capturedCardLockVersion: number;
  historyKey: string;
  operationNumber: number;
  orderedInputKeys: readonly [string, string];
  request: PatternImportDxfPhaseEZeroConnectAuthoringHandoffRequestV1;
}>;

export type PatternImportDxfPhaseEZeroConnectExistingOperationAttachBlockerV1 = Readonly<{
  code:
    | 'existing-operation-request-invalid'
    | 'existing-operation-card-mismatch'
    | 'existing-operation-writer-stale'
    | 'existing-operation-selection-mismatch'
    | 'existing-operation-ambiguous'
    | 'existing-operation-not-empty'
    | 'existing-operation-input-mismatch'
    | 'existing-operation-readback-mismatch';
  detail: string;
}>;

export type PatternImportDxfPhaseEZeroConnectExistingOperationCaptureResultV1 =
  | Readonly<{
      ok: true;
      pending: PatternImportDxfPhaseEZeroConnectExistingOperationPendingV1;
      operationIndex: number;
      blocker: null;
    }>
  | Readonly<{
      ok: false;
      pending: null;
      operationIndex: null;
      blocker: PatternImportDxfPhaseEZeroConnectExistingOperationAttachBlockerV1;
    }>;

export type PatternImportDxfPhaseEZeroConnectExistingOperationReadbackResultV1 =
  | Readonly<{
      ok: true;
      seamKey: string;
      cardLockVersion: number;
      blocker: null;
    }>
  | Readonly<{
      ok: false;
      seamKey: null;
      cardLockVersion: null;
      blocker: PatternImportDxfPhaseEZeroConnectExistingOperationAttachBlockerV1;
    }>;

export type PatternImportDxfPhaseEZeroConnectExistingOperationOwnerResultV1 =
  | Readonly<{
      ok: true;
      status: 'atomic-seam-and-operation-link-confirmed';
      historyKey: string;
      operationNumber: number;
      seamKey: string;
      blocker: null;
      claims: typeof PATTERN_IMPORT_DXF_PHASE_E_ZERO_CONNECT_EXISTING_OPERATION_ATTACH_CLAIMS_V1;
    }>
  | Readonly<{
      ok: false;
      status: 'blocked';
      historyKey: string | null;
      operationNumber: number | null;
      seamKey: null;
      blocker: PatternImportDxfPhaseEZeroConnectExistingOperationAttachBlockerV1;
      claims: typeof PATTERN_IMPORT_DXF_PHASE_E_ZERO_CONNECT_EXISTING_OPERATION_ATTACH_CLAIMS_V1;
    }>;

export type PatternImportDxfPhaseEZeroConnectExistingOperationOwnerV1 =
  | Readonly<{
      status: 'available';
      link: (
        pending: PatternImportDxfPhaseEZeroConnectExistingOperationPendingV1,
        direction: 'same' | 'reversed',
      ) => Promise<PatternImportDxfPhaseEZeroConnectExistingOperationOwnerResultV1>;
      /** Abandon a captured gesture only before its atomic writer has started. */
      cancel: (pending: PatternImportDxfPhaseEZeroConnectExistingOperationPendingV1) => boolean;
    }>
  | Readonly<{
      status: 'unavailable';
      blocker: PatternImportDxfPhaseEZeroConnectExistingOperationAttachBlockerV1;
    }>;

function blocked(
  code: PatternImportDxfPhaseEZeroConnectExistingOperationAttachBlockerV1['code'],
  detail: string,
): Extract<PatternImportDxfPhaseEZeroConnectExistingOperationCaptureResultV1, { ok: false }> {
  return Object.freeze({
    ok: false as const,
    pending: null,
    operationIndex: null,
    blocker: Object.freeze({ code, detail }),
  });
}

function readbackBlocked(
  code: PatternImportDxfPhaseEZeroConnectExistingOperationAttachBlockerV1['code'],
  detail: string,
): Extract<PatternImportDxfPhaseEZeroConnectExistingOperationReadbackResultV1, { ok: false }> {
  return Object.freeze({
    ok: false as const,
    seamKey: null,
    cardLockVersion: null,
    blocker: Object.freeze({ code, detail }),
  });
}

function exactKeys(actual: readonly string[] | undefined, expected: readonly string[]): boolean {
  return (
    Array.isArray(actual) &&
    actual.length === expected.length &&
    actual.every((key, index) => key === expected[index])
  );
}

function rawEmpty(keys: readonly string[] | undefined): boolean {
  return !keys || keys.length === 0;
}

export function capturePatternImportDxfPhaseEZeroConnectExistingOperationPendingV1(input: {
  request: PatternImportDxfPhaseEZeroConnectAuthoringHandoffRequestV1;
  techCardId: number | undefined;
  selectedIndex: number;
  liveOperations: readonly OperationLike[];
  savedCard: common_TechCard | null | undefined;
  seamWriterCardId: number | undefined;
  seamWriterLockVersion: number | null | undefined;
}): PatternImportDxfPhaseEZeroConnectExistingOperationCaptureResultV1 {
  const { request } = input;
  if (!isPatternImportDxfPhaseECadTableZeroConnectAuthoringRequestV1(request))
    return blocked(
      'existing-operation-request-invalid',
      'The exact edge selection request is absent or stale.',
    );
  const techCardId = input.techCardId ?? 0;
  const cardLockVersion = input.savedCard?.lockVersion ?? -1;
  if (
    !Number.isSafeInteger(techCardId) ||
    techCardId <= 0 ||
    request.catalog.techCardId !== techCardId ||
    input.savedCard?.id !== techCardId
  )
    return blocked(
      'existing-operation-card-mismatch',
      'The selected operation and exact DXF do not belong to the same saved tech card.',
    );
  if (
    input.seamWriterCardId !== techCardId ||
    !Number.isSafeInteger(cardLockVersion) ||
    cardLockVersion < 0 ||
    input.seamWriterLockVersion !== cardLockVersion
  )
    return blocked(
      'existing-operation-writer-stale',
      'The saved card or seam writer moved before this connection was captured.',
    );
  const selected = input.liveOperations[input.selectedIndex];
  const operationNumber = selected?.operationNumber ?? 0;
  const historyKey = selected?.historyKey ?? '';
  if (
    !selected ||
    !Number.isSafeInteger(operationNumber) ||
    operationNumber <= 0 ||
    !STABLE_ID.test(historyKey)
  )
    return blocked(
      'existing-operation-selection-mismatch',
      'Select one saved Assembly Order operation before connecting exact edges.',
    );
  const liveMatches = input.liveOperations.filter(
    (operation) =>
      operation.operationNumber === operationNumber && operation.historyKey === historyKey,
  );
  const savedMatches = (input.savedCard?.techCard?.operations ?? []).filter(
    (operation) => operation.operationNumber === operationNumber,
  );
  if (liveMatches.length !== 1 || savedMatches.length !== 1)
    return blocked(
      'existing-operation-ambiguous',
      'The saved Assembly Order operation identity is missing or ambiguous.',
    );
  if (!rawEmpty(selected.seamKeys) || !rawEmpty(savedMatches[0]!.seamKeys))
    return blocked(
      'existing-operation-not-empty',
      'Direct Connect can attach only to the exact saved operation that still has no seams.',
    );
  const orderedInputKeys = request.candidate.connection.sides.map(({ pieceLineKey }) =>
    pieceLineKey.trim(),
  ) as [string, string];
  if (
    !STABLE_ID.test(orderedInputKeys[0]) ||
    !STABLE_ID.test(orderedInputKeys[1]) ||
    orderedInputKeys[0] === orderedInputKeys[1] ||
    !exactKeys(selected.inputKeys, orderedInputKeys) ||
    !exactKeys(savedMatches[0]!.inputKeys, orderedInputKeys)
  )
    return blocked(
      'existing-operation-input-mismatch',
      'The selected saved operation no longer owns the exact ordered piece pair.',
    );
  return Object.freeze({
    ok: true as const,
    pending: Object.freeze({
      schemaVersion: PATTERN_IMPORT_DXF_PHASE_E_ZERO_CONNECT_EXISTING_OPERATION_ATTACH_V1,
      status: 'existing-empty-operation-awaiting-direction-and-atomic-link' as const,
      techCardId,
      capturedCardLockVersion: cardLockVersion,
      historyKey,
      operationNumber,
      orderedInputKeys: Object.freeze([...orderedInputKeys]) as readonly [string, string],
      request,
    }),
    operationIndex: input.selectedIndex,
    blocker: null,
  });
}

export function revalidatePatternImportDxfPhaseEZeroConnectExistingOperationPendingV1(
  pending: PatternImportDxfPhaseEZeroConnectExistingOperationPendingV1,
  input: Omit<
    Parameters<typeof capturePatternImportDxfPhaseEZeroConnectExistingOperationPendingV1>[0],
    'request'
  >,
): PatternImportDxfPhaseEZeroConnectExistingOperationCaptureResultV1 {
  const current = capturePatternImportDxfPhaseEZeroConnectExistingOperationPendingV1({
    ...input,
    request: pending.request,
  });
  if (
    !current.ok ||
    current.pending.historyKey !== pending.historyKey ||
    current.pending.operationNumber !== pending.operationNumber ||
    current.pending.capturedCardLockVersion !== pending.capturedCardLockVersion ||
    current.pending.orderedInputKeys[0] !== pending.orderedInputKeys[0] ||
    current.pending.orderedInputKeys[1] !== pending.orderedInputKeys[1]
  )
    return current.ok
      ? blocked(
          'existing-operation-selection-mismatch',
          'The selected saved operation changed after the exact edge gesture.',
        )
      : current;
  return current;
}

export function verifyPatternImportDxfPhaseEZeroConnectExistingOperationReadbackV1(input: {
  pending: PatternImportDxfPhaseEZeroConnectExistingOperationPendingV1;
  accepted: Readonly<{ ok: true; key: string }> | Readonly<{ ok: false; why: string }>;
  expectedSeam: StoredSeam;
  freshCard: common_TechCard | null | undefined;
}): PatternImportDxfPhaseEZeroConnectExistingOperationReadbackResultV1 {
  const { pending, accepted, expectedSeam, freshCard } = input;
  const lockVersion = freshCard?.lockVersion ?? -1;
  const matches = (freshCard?.techCard?.operations ?? []).filter(
    (operation) => operation.operationNumber === pending.operationNumber,
  );
  // A lost/ambiguous RPC answer may still have committed. In that case the freshly read exact
  // operation is the only authority allowed to recover its sole final key; the cached gesture is
  // never sent a second time.
  const acceptedKey = accepted.ok
    ? accepted.key
    : matches.length === 1 && matches[0]!.seamKeys?.length === 1
      ? matches[0]!.seamKeys![0]!
      : '';
  if (!STABLE_ID.test(acceptedKey))
    return readbackBlocked(
      'existing-operation-readback-mismatch',
      accepted.ok ? 'The atomic seam writer returned an invalid seam key.' : accepted.why,
    );
  const storedMatches = (freshCard?.seams ?? [])
    .map((row) => fromWire(row))
    .filter((row): row is StoredSeam => row?.seamKey === acceptedKey);
  const stored = storedMatches.length === 1 ? storedMatches[0]! : null;
  if (
    freshCard?.id !== pending.techCardId ||
    !Number.isSafeInteger(lockVersion) ||
    lockVersion <= pending.capturedCardLockVersion ||
    matches.length !== 1 ||
    !exactKeys(matches[0]!.inputKeys, pending.orderedInputKeys) ||
    !exactKeys(matches[0]!.seamKeys, [acceptedKey]) ||
    !stored ||
    stored.status !== 'confirmed' ||
    stored.stale === true ||
    stored.kind !== expectedSeam.kind ||
    stored.direction !== expectedSeam.direction ||
    stored.source !== expectedSeam.source ||
    stored.anchoredSize !== expectedSeam.anchoredSize ||
    stored.note !== expectedSeam.note ||
    JSON.stringify(stored.sideA) !== JSON.stringify(expectedSeam.sideA) ||
    JSON.stringify(stored.sideB) !== JSON.stringify(expectedSeam.sideB) ||
    rowExactAnchorSig(stored) !== rowExactAnchorSig(expectedSeam)
  )
    return readbackBlocked(
      'existing-operation-readback-mismatch',
      'The fresh saved card did not echo the exact confirmed seam row and operation link.',
    );
  return Object.freeze({
    ok: true as const,
    seamKey: acceptedKey,
    cardLockVersion: lockVersion,
    blocker: null,
  });
}

const attachExecutions = new WeakMap<
  object,
  Readonly<{ direction: 'same' | 'reversed'; execution: Promise<unknown> }>
>();

/** Read a retained gesture without starting it. `undefined` means no write has started. */
export function readPatternImportDxfPhaseEZeroConnectExistingOperationAttachOnceV1<T>(
  pending: PatternImportDxfPhaseEZeroConnectExistingOperationPendingV1,
  direction: 'same' | 'reversed',
): Promise<T> | null | undefined {
  const existing = attachExecutions.get(pending) as
    | Readonly<{ direction: 'same' | 'reversed'; execution: Promise<T> }>
    | undefined;
  if (!existing) return undefined;
  return existing.direction === direction ? existing.execution : null;
}

/** One retained gesture can issue at most one atomic seam+operation-link RPC. */
export function executePatternImportDxfPhaseEZeroConnectExistingOperationAttachOnceV1<T>(
  pending: PatternImportDxfPhaseEZeroConnectExistingOperationPendingV1,
  direction: 'same' | 'reversed',
  run: () => Promise<T>,
): Promise<T> | null {
  const existing = readPatternImportDxfPhaseEZeroConnectExistingOperationAttachOnceV1<T>(
    pending,
    direction,
  );
  if (existing !== undefined) return existing;
  const execution = Promise.resolve().then(run);
  attachExecutions.set(pending, Object.freeze({ direction, execution }));
  return execution;
}
