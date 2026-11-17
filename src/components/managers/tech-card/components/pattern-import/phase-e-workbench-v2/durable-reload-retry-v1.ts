export type PatternImportDxfPhaseEDurableReloadBlockerV1 = Readonly<{
  code: string;
  detail: string;
  retryable: boolean;
}>;

export type PatternImportDxfPhaseEDurableReloadRetryStateV1 = Readonly<{
  key: string;
  generation: number;
  attempt: number;
  status: 'ready' | 'restoring' | 'blocked';
  blocker: PatternImportDxfPhaseEDurableReloadBlockerV1 | null;
}>;

export function createPatternImportDxfPhaseEDurableReloadRetryV1(
  key: string,
  generation = 1,
): PatternImportDxfPhaseEDurableReloadRetryStateV1 {
  return Object.freeze({ key, generation, attempt: 1, status: 'ready' as const, blocker: null });
}

export function startPatternImportDxfPhaseEDurableReloadRetryV1(
  state: PatternImportDxfPhaseEDurableReloadRetryStateV1,
): PatternImportDxfPhaseEDurableReloadRetryStateV1 | null {
  if (state.status !== 'ready') return null;
  return Object.freeze({ ...state, status: 'restoring' as const, blocker: null });
}

/** Only the current non-aborted effect generation may publish a reload refusal. */
export function blockPatternImportDxfPhaseEDurableReloadRetryV1(
  current: PatternImportDxfPhaseEDurableReloadRetryStateV1 | null,
  expected: Readonly<{
    key: string;
    generation: number;
    attempt: number;
    signal: AbortSignal;
  }>,
  blocker: PatternImportDxfPhaseEDurableReloadBlockerV1,
): PatternImportDxfPhaseEDurableReloadRetryStateV1 | null {
  if (
    !current ||
    expected.signal.aborted ||
    current.key !== expected.key ||
    current.generation !== expected.generation ||
    current.attempt !== expected.attempt ||
    current.status !== 'restoring'
  )
    return current;
  return Object.freeze({ ...current, status: 'blocked' as const, blocker: Object.freeze(blocker) });
}

export function retryPatternImportDxfPhaseEDurableReloadRetryV1(
  state: PatternImportDxfPhaseEDurableReloadRetryStateV1,
): PatternImportDxfPhaseEDurableReloadRetryStateV1 {
  if (state.status !== 'blocked' || !state.blocker?.retryable) return state;
  return Object.freeze({
    ...state,
    attempt: state.attempt + 1,
    status: 'ready' as const,
    blocker: null,
  });
}
