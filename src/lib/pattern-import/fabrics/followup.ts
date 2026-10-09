// The follow-up of an import apply (MF-C, M3 / W1): the two calls the card makes after a DXF lands
// and its pieces are matched, so the consumption norm "from patterns", costing and the QR viewer see
// the imported sheet at once instead of after someone opens "∑ piece areas".
//
//   per imported scope, in order: SaveTechCardPieceAreas → PutTechCardPatternSizeIndex
//
// Both are SEPARATE calls after the card save (K1: only the save is a transaction), so:
//   · they run only when the save answered 'ok' — never against a form the server has not seen;
//   · a failure is a warning on that row with a retry, never a rollback of what apply wrote;
//   · scopes run one after another (five concurrent writes into one card race for one row).
// The real calls (piece-areas.ts `publishPieceAreas`, pattern-size-index.ts
// `publishPatternSizeIndex`, the same code the Patterns tab uses) come in through `FollowUpDeps`, so
// the probe drives this with fakes and checks the order.
import type { ApplyResult, CardDraft } from '../types';

export type FollowUpStep = 'areas' | 'sizeIndex';
export type FollowUpState = 'waiting' | 'running' | 'ok' | 'failed';
export type FollowUpCell = { state: FollowUpState; detail: string };
export type FollowUpTarget = {
  scopeKey: string;
  label: string;
  /** The manifest's final cut layer for this scope's file ('1'): areas must be measured on it. */
  cutLayer: string;
};
export type FollowUpRow = FollowUpTarget & { areas: FollowUpCell; sizeIndex: FollowUpCell };

export type StepAnswer = { ok: true; detail: string } | { ok: false; reason: string };
export type FollowUpDeps = {
  areas: (t: FollowUpTarget) => Promise<StepAnswer>;
  sizeIndex: (t: FollowUpTarget) => Promise<StepAnswer>;
};

const WAITING: FollowUpCell = { state: 'waiting', detail: '' };

/**
 * The scopes to follow up after an apply, or null when nothing may run: the apply failed, wrote
 * nothing (a re-apply of the same import stays zero-diff, F7), or the card did not save.
 */
export function followUpTargets(draft: CardDraft, result: ApplyResult): FollowUpTarget[] | null {
  if (!result.ok || !result.writes || result.save !== 'ok') return null;
  return draft.scopes.map((s) => ({
    scopeKey: s.target.scopeKey,
    label: s.target.label || s.target.scopeKey,
    cutLayer: s.manifest.layers.cut,
  }));
}

export const initialRows = (targets: readonly FollowUpTarget[]): FollowUpRow[] =>
  targets.map((t) => ({ ...t, areas: { ...WAITING }, sizeIndex: { ...WAITING } }));

/** Rows after a retry request: the named cells go back to waiting, the rest keep their answer. */
export function retryRows(
  rows: readonly FollowUpRow[],
  only?: { scopeKey?: string; step?: FollowUpStep },
): FollowUpRow[] {
  return rows.map((r) => {
    if (only?.scopeKey && r.scopeKey !== only.scopeKey) return r;
    const next = { ...r };
    for (const step of ['areas', 'sizeIndex'] as const) {
      if (only?.step && step !== only.step) continue;
      if (next[step].state !== 'ok') next[step] = { ...WAITING };
    }
    return next;
  });
}

/** Every waiting cell resolved as failed with one reason (the card never became ready). */
export const failWaiting = (rows: readonly FollowUpRow[], reason: string): FollowUpRow[] =>
  rows.map((r) => ({
    ...r,
    areas: r.areas.state === 'waiting' ? { state: 'failed', detail: reason } : r.areas,
    sizeIndex: r.sizeIndex.state === 'waiting' ? { state: 'failed', detail: reason } : r.sizeIndex,
  }));

export const followUpPending = (rows: readonly FollowUpRow[]) =>
  rows.some((r) =>
    [r.areas, r.sizeIndex].some((c) => c.state === 'waiting' || c.state === 'running'),
  );

/**
 * Runs every WAITING cell, scope by scope, areas before the size index. Never throws: a dep that
 * throws is a failed cell. `onUpdate` gets a fresh array after every state change.
 */
export async function runFollowUp(
  start: readonly FollowUpRow[],
  deps: FollowUpDeps,
  onUpdate: (rows: FollowUpRow[]) => void = () => {},
): Promise<FollowUpRow[]> {
  let rows = start.map((r) => ({ ...r }));
  const set = (i: number, step: FollowUpStep, cell: FollowUpCell) => {
    rows = rows.map((r, j) => (j === i ? { ...r, [step]: cell } : r));
    onUpdate(rows);
  };
  for (let i = 0; i < rows.length; i++) {
    for (const step of ['areas', 'sizeIndex'] as const) {
      if (rows[i][step].state !== 'waiting') continue;
      set(i, step, { state: 'running', detail: '' });
      let ans: StepAnswer;
      try {
        ans = await deps[step](rows[i]);
      } catch (e) {
        ans = { ok: false, reason: e instanceof Error ? e.message : String(e) };
      }
      set(
        i,
        step,
        ans.ok ? { state: 'ok', detail: ans.detail } : { state: 'failed', detail: ans.reason },
      );
    }
  }
  return rows;
}
