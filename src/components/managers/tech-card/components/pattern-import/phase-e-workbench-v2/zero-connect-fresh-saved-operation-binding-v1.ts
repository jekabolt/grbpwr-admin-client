import type { PatternImportDxfPhaseEZeroConnectPendingHandoffV1 } from './cad-table-zero-connect-post-save-owner-v1';

export const PATTERN_IMPORT_DXF_PHASE_E_ZERO_CONNECT_FRESH_SAVED_OPERATION_BINDING_V1 =
  'pattern-import-dxf-phase-e-zero-connect-fresh-saved-operation-binding/1' as const;

export type PatternImportDxfPhaseEZeroConnectFreshSavedOperationV1 = Readonly<{
  operationNumber?: number | null;
  inputKeys?: readonly string[] | null;
}>;

export type PatternImportDxfPhaseEZeroConnectFreshSavedOperationBindingResultV1 =
  | Readonly<{
      ok: true;
      operation: PatternImportDxfPhaseEZeroConnectFreshSavedOperationV1;
      blocker: null;
    }>
  | Readonly<{
      ok: false;
      operation: null;
      blocker: Readonly<{
        code:
          | 'fresh-saved-operation-pending-invalid'
          | 'fresh-saved-card-lock-mismatch'
          | 'fresh-saved-operation-not-exact'
          | 'fresh-saved-operation-inputs-mismatch';
        detail: string;
      }>;
    }>;

/** The ordinary save must preserve the selected pair's exact order; sorting is not authority. */
export function matchesPatternImportDxfPhaseEZeroConnectFreshSavedOperationInputsV1(
  inputKeys: readonly string[] | null | undefined,
  candidatePieceLineKeys: readonly [string, string],
): boolean {
  return (
    Array.isArray(inputKeys) &&
    inputKeys.length === 2 &&
    candidatePieceLineKeys[0] !== candidatePieceLineKeys[1] &&
    inputKeys[0] === candidatePieceLineKeys[0] &&
    inputKeys[1] === candidatePieceLineKeys[1]
  );
}

/** Resolves only the current attached pending's unique positive saved operation. */
export function resolvePatternImportDxfPhaseEZeroConnectFreshSavedOperationBindingV1(input: {
  pending: PatternImportDxfPhaseEZeroConnectPendingHandoffV1 | null;
  currentCardLockVersion: number | null | undefined;
  operations: readonly PatternImportDxfPhaseEZeroConnectFreshSavedOperationV1[];
}): PatternImportDxfPhaseEZeroConnectFreshSavedOperationBindingResultV1 {
  const { pending, operations } = input;
  if (
    !pending ||
    pending.status !== 'in-memory-final-seam-attached-awaiting-second-save' ||
    !Number.isSafeInteger(pending.savedOperationNumber) ||
    pending.savedOperationNumber <= 0
  )
    return Object.freeze({
      ok: false as const,
      operation: null,
      blocker: Object.freeze({
        code: 'fresh-saved-operation-pending-invalid' as const,
        detail:
          'A current attached zero-connect pending with a positive operation number is required.',
      }),
    });
  if (
    !Number.isSafeInteger(input.currentCardLockVersion) ||
    input.currentCardLockVersion !== pending.afterSeamAttachCardLockVersion
  )
    return Object.freeze({
      ok: false as const,
      operation: null,
      blocker: Object.freeze({
        code: 'fresh-saved-card-lock-mismatch' as const,
        detail: 'The fresh saved card must be the exact seam-write lock version.',
      }),
    });
  const matches = operations.filter(
    ({ operationNumber }) => operationNumber === pending.savedOperationNumber,
  );
  if (matches.length !== 1)
    return Object.freeze({
      ok: false as const,
      operation: null,
      blocker: Object.freeze({
        code: 'fresh-saved-operation-not-exact' as const,
        detail: 'The fresh saved card must contain exactly one matching positive operation.',
      }),
    });
  const expected = pending.candidate.connection.sides.map(({ pieceLineKey }) => pieceLineKey) as [
    string,
    string,
  ];
  if (
    !matchesPatternImportDxfPhaseEZeroConnectFreshSavedOperationInputsV1(
      matches[0]!.inputKeys,
      expected,
    )
  )
    return Object.freeze({
      ok: false as const,
      operation: null,
      blocker: Object.freeze({
        code: 'fresh-saved-operation-inputs-mismatch' as const,
        detail: 'The fresh saved operation no longer owns the selected ordered piece pair.',
      }),
    });
  return Object.freeze({ ok: true as const, operation: matches[0]!, blocker: null });
}
