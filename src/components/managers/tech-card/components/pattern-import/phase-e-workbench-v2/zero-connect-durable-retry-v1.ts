import type { DxfProductSavedRowIdentityV1 } from 'lib/pattern-import/dxf-product-saved-reprocess-owner-v1';

import type { PatternImportDxfPhaseEZeroConnectPendingHandoffV1 } from './cad-table-zero-connect-post-save-owner-v1';
import {
  PATTERN_IMPORT_DXF_PHASE_E_ZERO_CONNECT_DURABLE_PERSIST_REQUEST_V1,
  type PatternImportDxfPhaseEZeroConnectDurablePersistRequestV1,
  type PatternImportDxfPhaseEZeroConnectDurableResultV1,
} from './zero-connect-durable-composite-v4';

type CompletedPending = Extract<
  PatternImportDxfPhaseEZeroConnectPendingHandoffV1,
  { status: 'in-memory-final-seam-attached-awaiting-second-save' }
>;

export type PatternImportDxfPhaseEZeroConnectDurableRetryStateV1 = Readonly<{
  pending: CompletedPending;
  row: DxfProductSavedRowIdentityV1;
  attempt: number;
  status: 'ready' | 'persisting' | 'blocked';
  blocker: PatternImportDxfPhaseEZeroConnectDurableResultV1['blocker'];
}>;

type Persist = (
  request: PatternImportDxfPhaseEZeroConnectDurablePersistRequestV1,
  signal: AbortSignal,
) => Promise<PatternImportDxfPhaseEZeroConnectDurableResultV1>;

export function capturePatternImportDxfPhaseEZeroConnectDurableRetryV1(
  pending: CompletedPending,
  row: DxfProductSavedRowIdentityV1,
): PatternImportDxfPhaseEZeroConnectDurableRetryStateV1 {
  return Object.freeze({
    pending,
    row: Object.freeze({ ...row }),
    attempt: 1,
    status: 'ready' as const,
    blocker: null,
  });
}

export function startPatternImportDxfPhaseEZeroConnectDurableRetryV1(
  state: PatternImportDxfPhaseEZeroConnectDurableRetryStateV1,
): PatternImportDxfPhaseEZeroConnectDurableRetryStateV1 | null {
  if (state.status !== 'ready') return null;
  return Object.freeze({ ...state, status: 'persisting' as const, blocker: null });
}

export function isPatternImportDxfPhaseEZeroConnectDurableRetryableV1(
  state: PatternImportDxfPhaseEZeroConnectDurableRetryStateV1,
): boolean {
  return (
    state.status === 'blocked' &&
    state.blocker !== null &&
    (state.blocker.code === 'durable-persist-failed' ||
      state.blocker.code === 'durable-transaction-blocked' ||
      state.blocker.code === 'durable-transport-failed')
  );
}

export function retryPatternImportDxfPhaseEZeroConnectDurableRetryV1(
  state: PatternImportDxfPhaseEZeroConnectDurableRetryStateV1,
): PatternImportDxfPhaseEZeroConnectDurableRetryStateV1 {
  if (!isPatternImportDxfPhaseEZeroConnectDurableRetryableV1(state)) return state;
  return Object.freeze({
    ...state,
    attempt: state.attempt + 1,
    status: 'ready' as const,
    blocker: null,
  });
}

export async function executePatternImportDxfPhaseEZeroConnectDurableRetryV1(
  state: PatternImportDxfPhaseEZeroConnectDurableRetryStateV1,
  persist: Persist,
  signal: AbortSignal,
): Promise<
  | Readonly<{
      ok: true;
      result: Extract<PatternImportDxfPhaseEZeroConnectDurableResultV1, { ok: true }>;
      next: null;
    }>
  | Readonly<{
      ok: false;
      result: Extract<PatternImportDxfPhaseEZeroConnectDurableResultV1, { ok: false }>;
      next: PatternImportDxfPhaseEZeroConnectDurableRetryStateV1;
    }>
> {
  let result: PatternImportDxfPhaseEZeroConnectDurableResultV1;
  try {
    result = await persist(
      {
        schemaVersion: PATTERN_IMPORT_DXF_PHASE_E_ZERO_CONNECT_DURABLE_PERSIST_REQUEST_V1,
        pending: state.pending,
        row: state.row,
      },
      signal,
    );
  } catch (error) {
    result = Object.freeze({
      ok: false as const,
      session: null,
      compositeOperationBindingId: null,
      blocker: Object.freeze({
        code: signal.aborted ? 'durable-cancelled' : 'durable-transport-failed',
        detail: signal.aborted
          ? 'The durable exact-geometry transaction was cancelled.'
          : error instanceof Error
            ? `The durable exact-geometry transaction failed: ${error.message}`
            : 'The durable exact-geometry transaction failed.',
      }),
    });
  }
  if (result.ok) return Object.freeze({ ok: true as const, result, next: null });
  return Object.freeze({
    ok: false as const,
    result,
    next: Object.freeze({ ...state, status: 'blocked' as const, blocker: result.blocker }),
  });
}
