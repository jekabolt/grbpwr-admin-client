import { useCallback, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';

import { PLAYGROUND_WF_PARAM, type StepId } from '../core/chain';
import type { WorkflowKey } from './registry/types';

/**
 * ═══ `?wf=` — WHICH WORKFLOW IS OPEN, AND WHY IT NEVER MAKES A HISTORY ENTRY (G-01 r2) ════════════
 *
 * The playground screen is the one writer of `?wf=`; the rail (`useStepAddress`) deletes it when it
 * leaves the step, and the legacy `?step=aside` is rewritten once (`useLegacyStepRewrite`). All
 * three writers live in this file, and ALL THREE REPLACE.
 *
 * WHY NOT A HISTORY ENTRY PER OPENED WORKFLOW. C-05 pushed one, so the browser's Back returned from
 * a workflow to the grid. Two review rounds then found that every OTHER way out of that pushed entry
 * — a rail cell, a top-level card tab, a recall, a remount — had to pop it first and replace what the
 * pop revealed, and a pop is asynchronous: a double click queued two pops and left the card, a late
 * `popstate` lost the chosen step, a top-level tab stranded the grid under the new tab. Each fix was
 * another piece of choreography around one push. The owner's rule is simplicity, so the push is gone:
 *
 *  · |→ on the workflow card is THE way back to the grid (it was already the one drawn door);
 *  · the browser's Back leaves the playground exactly as it did before C-05 — the card's steps are
 *    one entry, the rail has always replaced, and now nothing inside the step pushes either;
 *  · nothing waits for `popstate`, so nothing can race, double-navigate or strand an entry, under
 *    StrictMode or a double click: every write is one idempotent `replace`.
 *
 * Typing in a workflow's form touches no address at all (drafts live in memory).
 */
export function useWorkflowAddress(): {
  asked: string;
  /** Open a workflow (from the grid, a recall or a link), or `null` for the grid. */
  setWf: (key: WorkflowKey | null) => void;
} {
  const [params, setParams] = useSearchParams();

  const setWf = useCallback(
    (key: WorkflowKey | null) =>
      setParams(
        (prev) => {
          const p = new URLSearchParams(prev);
          if (key) p.set(PLAYGROUND_WF_PARAM, key);
          else p.delete(PLAYGROUND_WF_PARAM);
          return p;
        },
        { replace: true },
      ),
    [setParams],
  );

  return { asked: (params.get(PLAYGROUND_WF_PARAM) ?? '').trim(), setWf };
}

/**
 * ═══ THE RAIL'S WRITE: `?step=` REPLACED, `?wf=` DROPPED WHEN THE STEP IS LEFT ═══════════════════
 *
 * `replace`, as the prototype's `replaceState`: Back leaves the card, it does not walk the rail
 * backwards one cell at a time. `?wf=` belongs to the playground screen and does not outlive its
 * step.
 *
 * `wf` — a door that leads to ONE WORKFLOW of the playground rather than to the step (C-10: a door
 * to 3D on a server where STEP 5 is the tile `image_to_3d`): step and workflow in one write, so no
 * frame shows the grid between them. Without it the playground's own `?wf=` is left as it is.
 */
export function useStepAddress(): (next: StepId, wf?: WorkflowKey) => void {
  const [, setParams] = useSearchParams();
  return useCallback(
    (next: StepId, wf?: WorkflowKey) =>
      setParams(
        (prev) => {
          const p = new URLSearchParams(prev);
          p.set('step', next);
          if (next !== 'playground') p.delete(PLAYGROUND_WF_PARAM);
          else if (wf) p.set(PLAYGROUND_WF_PARAM, wf);
          return p;
        },
        { replace: true },
      ),
    [setParams],
  );
}

/**
 * ═══ `?step=aside` IS REWRITTEN ONCE, AND THE LEGACY STEP OWNS BOTH PARAMETERS (G-01, Codex 3) ═══
 *
 * The same for `?step=threed` on a server where STEP 5 left the rail (C-10, `legacyStep`):
 * `step=playground&wf=image_to_3d`.
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
