import type { PatternImportDxfProductPhaseEAuthoringCatalogV1 } from 'lib/cloth/domain/pattern-import-dxf-product-phase-e-authoring-catalog-v1';
import type { PatternImportDxfProductPhaseEAssemblyProjectionV1 } from 'lib/pattern-import/dxf-product-phase-e-assembly-workbench-v1';

import type { PatternImportDxfPhaseECadTableZeroConnectCandidateV1 } from './cad-table-zero-connect-session-v1';
import type {
  PatternImportDxfPhaseEZeroConnectPostSaveSeamFinalReceiptV1,
  PatternImportDxfPhaseEZeroConnectPostSaveSeamLinkBlockerV1,
  PatternImportDxfPhaseEZeroConnectSavedDraftOperationReceiptV1,
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
  pendingEvidenceReconstructed: false,
} as const);

export type PatternImportDxfPhaseEZeroConnectPendingHandoffV1 = Readonly<{
  schemaVersion: typeof PATTERN_IMPORT_DXF_PHASE_E_ZERO_CONNECT_PENDING_HANDOFF_V1;
  status: 'in-memory-awaiting-save-direction-and-seam-link';
  historyKey: string;
  candidate: PatternImportDxfPhaseECadTableZeroConnectCandidateV1;
  catalog: PatternImportDxfProductPhaseEAuthoringCatalogV1;
  projection: PatternImportDxfProductPhaseEAssemblyProjectionV1;
  durableOperationId: null;
}>;

export type PatternImportDxfPhaseEZeroConnectPostSaveOwnerRequestV1 = Readonly<{
  schemaVersion: typeof PATTERN_IMPORT_DXF_PHASE_E_ZERO_CONNECT_POST_SAVE_OWNER_V1;
  candidate: PatternImportDxfPhaseECadTableZeroConnectCandidateV1;
  catalog: PatternImportDxfProductPhaseEAuthoringCatalogV1;
  projection: PatternImportDxfProductPhaseEAssemblyProjectionV1;
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
    | 'zero-connect-seam-link-geometry-unavailable';
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

type OperationLike = Readonly<{
  historyKey?: string;
  operationNumber?: number;
  seamKeys?: readonly string[];
}>;

/** Retains the exact gesture evidence above a zero-operation host that is about to unmount. */
export function createPatternImportDxfPhaseEZeroConnectPendingHandoffV1(input: {
  historyKey: string;
  candidate: PatternImportDxfPhaseECadTableZeroConnectCandidateV1;
  catalog: PatternImportDxfProductPhaseEAuthoringCatalogV1;
  projection: PatternImportDxfProductPhaseEAssemblyProjectionV1;
}): PatternImportDxfPhaseEZeroConnectPendingHandoffV1 | null {
  if (
    !input.historyKey ||
    input.historyKey !== input.candidate?.operation?.sessionOperationId ||
    input.candidate.operation.operationNumber !== 0 ||
    input.candidate.operation.authoringOperationId !== null
  )
    return null;
  return Object.freeze({
    schemaVersion: PATTERN_IMPORT_DXF_PHASE_E_ZERO_CONNECT_PENDING_HANDOFF_V1,
    status: 'in-memory-awaiting-save-direction-and-seam-link' as const,
    historyKey: input.historyKey,
    candidate: input.candidate,
    catalog: input.catalog,
    projection: input.projection,
    durableOperationId: null,
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
