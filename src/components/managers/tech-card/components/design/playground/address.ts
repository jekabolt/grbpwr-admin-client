import { useCallback, useEffect } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';

import { PLAYGROUND_WF_PARAM, type StepId } from '../core/chain';
import type { WorkflowKey } from './registry/types';

/**
 * ═══ `?wf=` — WHICH WORKFLOW IS OPEN, AND HOW THE ADDRESS MOVES (C-01, C-05, G-01) ═══════════════
 *
 * The playground screen is the one writer of `?wf=`; the rail (`useStepAddress`) deletes it when it
 * leaves the step, and the legacy `?step=aside` is rewritten once (`useLegacyStepRewrite`). All
 * three writers live in this file, so the history rules below have one home.
 *
 *  · OPENING A WORKFLOW FROM THE GRID IS A HISTORY ENTRY (`openFromGrid`, `push`): the browser's
 *    Back returns to the grid, as it would from any page opened out of a list. The pushed entry
 *    carries `FROM_GRID` in its state — «the entry under me is the grid I was opened from».
 *  · WORKFLOW → WORKFLOW REPLACES AND KEEPS THE MARK (`setWf`, the recall intake): the grid is still
 *    under the entry, whichever workflow it now names.
 *  · |→ (`backToGrid`) walks one entry back when this entry carries the mark, and otherwise writes
 *    the grid over this entry: a link that landed straight on a workflow has no grid under it, and
 *    walking back there would leave the card.
 *  · THE RAIL LEAVING A MARKED ENTRY FIRST POPS IT (`useStepAddress`), then replaces the revealed
 *    grid entry with the new step. Replacing the child in place left the grid behind it as an
 *    orphan: Back from the new step landed on the playground grid instead of leaving the card.
 *  · Any other writer that replaces (a colourway deep link) keeps whatever state the entry has.
 *    Typing in a workflow's form touches no address at all (drafts live in memory).
 */
export function useWorkflowAddress(): {
  asked: string;
  setWf: (key: WorkflowKey | null) => void;
  openFromGrid: (key: WorkflowKey) => void;
  backToGrid: () => void;
} {
  const [params, setParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const fromGrid = isFromGrid(location.state);

  const write = useCallback(
    (key: WorkflowKey | null, how: 'push' | 'replace' | 'keep-mark') =>
      setParams(
        (prev) => {
          const p = new URLSearchParams(prev);
          if (key) p.set(PLAYGROUND_WF_PARAM, key);
          else p.delete(PLAYGROUND_WF_PARAM);
          return p;
        },
        how === 'push'
          ? { state: { [FROM_GRID]: true } }
          : how === 'keep-mark'
            ? { replace: true, state: { [FROM_GRID]: true } }
            : { replace: true },
      ),
    [setParams],
  );

  // A workflow replacing a workflow keeps the grid under it; the grid itself is never marked.
  const setWf = useCallback(
    (key: WorkflowKey | null) => write(key, key && fromGrid ? 'keep-mark' : 'replace'),
    [write, fromGrid],
  );
  const openFromGrid = useCallback((key: WorkflowKey) => write(key, 'push'), [write]);

  const backToGrid = useCallback(() => {
    if (fromGrid) navigate(-1);
    else write(null, 'replace');
  }, [fromGrid, navigate, write]);

  return {
    asked: (params.get(PLAYGROUND_WF_PARAM) ?? '').trim(),
    setWf,
    openFromGrid,
    backToGrid,
  };
}

/**
 * ═══ THE RAIL'S WRITE: `?step=` REPLACED, `?wf=` DROPPED WHEN THE STEP IS LEFT ═══════════════════
 *
 * `replace`, as the prototype's `replaceState`: Back leaves the card, it does not walk the rail
 * backwards one cell at a time. `?wf=` belongs to the playground screen and does not outlive its
 * step.
 *
 * ⚠ LEAVING A WORKFLOW OPENED FROM THE GRID POPS IT FIRST. That entry was PUSHED over the grid, so a
 * replace would turn it into the new step and leave the grid underneath — the one entry the rail's
 * `replace` promises never to leave. The pop is asynchronous (`popstate`), so the replace waits for
 * it and reads the address it revealed, not the one this render saw.
 */
export function useStepAddress(): (next: StepId) => void {
  const [, setParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const fromGrid = isFromGrid(location.state);

  return useCallback(
    (next: StepId) => {
      const edit = (p: URLSearchParams) => {
        p.set('step', next);
        if (next !== 'playground') p.delete(PLAYGROUND_WF_PARAM);
        return p;
      };
      if (next === 'playground' || !fromGrid) {
        // Staying on the step keeps the entry's mark; leaving an unmarked entry has none to keep.
        setParams((prev) => edit(new URLSearchParams(prev)), {
          replace: true,
          state: next === 'playground' && fromGrid ? { [FROM_GRID]: true } : undefined,
        });
        return;
      }
      let done = false;
      let timer = 0;
      const land = () => {
        if (done) return;
        done = true;
        window.removeEventListener('popstate', land);
        window.clearTimeout(timer);
        const search = edit(new URLSearchParams(window.location.search));
        navigate({ search: `?${search}` }, { replace: true });
      };
      window.addEventListener('popstate', land);
      // A pop that never comes (a browser that refused it) must not leave the rail dead.
      timer = window.setTimeout(land, 1000);
      navigate(-1);
    },
    [fromGrid, navigate, setParams],
  );
}

/**
 * ═══ `?step=aside` IS REWRITTEN ONCE, AND THE LEGACY STEP OWNS BOTH PARAMETERS (G-01, Codex 3) ═══
 *
 * The old address maps to one complete new address, `step=playground&wf=change_color` — a `?wf=`
 * that rode along with it (a stale link, a hand-edited one) does not override the destination the
 * legacy step names. `replace`: the old address is not an entry to come back to.
 */
export function useLegacyStepRewrite(legacy: { step: StepId; wf: string } | null): void {
  const [, setParams] = useSearchParams();
  useEffect(() => {
    if (!legacy) return;
    setParams(
      (prev) => {
        const p = new URLSearchParams(prev);
        p.set('step', legacy.step);
        p.set(PLAYGROUND_WF_PARAM, legacy.wf);
        return p;
      },
      { replace: true },
    );
  }, [legacy, setParams]);
}

/** The scope of a workflow's runs in the idempotency ledger (`render/run-ledger.ts`). */
export function playgroundRunScope(key: WorkflowKey): string {
  return `playground:${key}`;
}

/** The mark on a history entry pushed by opening a workflow from the grid. */
const FROM_GRID = 'playgroundFromGrid';

export function isFromGrid(state: unknown): boolean {
  return (
    typeof state === 'object' &&
    state !== null &&
    (state as Record<string, unknown>)[FROM_GRID] === true
  );
}
