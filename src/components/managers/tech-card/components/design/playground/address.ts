import { useCallback } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';

import { PLAYGROUND_WF_PARAM } from '../core/chain';
import type { WorkflowKey } from './registry/types';

/**
 * ═══ `?wf=` — WHICH WORKFLOW IS OPEN, AND HOW THE ADDRESS MOVES (C-01, C-05) ═════════════════════
 *
 * The playground screen is the one writer of `?wf=` (the studio tab only deletes it when the rail
 * leaves the step, and rewrites the legacy `?step=aside` once — both `replace`).
 *
 *  · OPENING A WORKFLOW FROM THE GRID IS A HISTORY ENTRY (`openFromGrid`, `push`): the browser's
 *    Back returns to the grid, as it would from any page opened out of a list. The pushed entry
 *    carries `FROM_GRID` in its state.
 *  · EVERYTHING ELSE REPLACES (`setWf`): the recall intake opening the workflow of a past run, and
 *    any other writer. Typing in a workflow's form touches no address at all (drafts live in memory).
 *  · |→ (`backToGrid`) walks one entry back when this entry carries `FROM_GRID` — the entry under
 *    it is then the grid it was opened from — and otherwise writes the grid over this entry: a link
 *    that landed straight on a workflow has no grid under it, and walking back there would leave
 *    the card. Any later `replace` on the entry (the rail, a colourway deep link, a recall) drops
 *    the mark, so a stale «the grid is under me» is never acted on.
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

  const write = useCallback(
    (key: WorkflowKey | null, push: boolean) =>
      setParams(
        (prev) => {
          const p = new URLSearchParams(prev);
          if (key) p.set(PLAYGROUND_WF_PARAM, key);
          else p.delete(PLAYGROUND_WF_PARAM);
          return p;
        },
        push ? { state: { [FROM_GRID]: true } } : { replace: true },
      ),
    [setParams],
  );

  const setWf = useCallback((key: WorkflowKey | null) => write(key, false), [write]);
  const openFromGrid = useCallback((key: WorkflowKey) => write(key, true), [write]);

  const fromGrid = isFromGrid(location.state);
  const backToGrid = useCallback(() => {
    if (fromGrid) navigate(-1);
    else write(null, false);
  }, [fromGrid, navigate, write]);

  return {
    asked: (params.get(PLAYGROUND_WF_PARAM) ?? '').trim(),
    setWf,
    openFromGrid,
    backToGrid,
  };
}

/** The mark on a history entry pushed by opening a workflow from the grid. */
const FROM_GRID = 'playgroundFromGrid';

function isFromGrid(state: unknown): boolean {
  return (
    typeof state === 'object' &&
    state !== null &&
    (state as Record<string, unknown>)[FROM_GRID] === true
  );
}
