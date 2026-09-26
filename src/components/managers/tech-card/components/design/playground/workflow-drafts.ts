import { useCallback, useRef, useState } from 'react';

import { initialDraft } from './registry/common';
import type { Draft, WorkflowDef, WorkflowKey } from './registry/types';

/**
 * ═══ THE DRAFTS OF THE PLAYGROUND — one per workflow, one card, and they die with the card (C-03) ═
 *
 * The pattern of `./drafts.ts`, widened from one table to one draft per workflow: switching from
 * Change a Color to Remove Background and back keeps what was laid on each form. Nothing reaches the
 * server except inside `StartDesignRun.params`, and nothing is seeded from the past.
 *
 * ⚠ THEY DIE WITH THE CARD, NOT WITH THE TAB (invariant 12). `StudioTab` is not remounted between
 * card A and card B, and A's pictures under B's GENERATE buy a run against the wrong card. So the
 * store carries the card it was filled for and empties itself IN THE BODY OF THE RENDER the moment
 * that number changes — never in an effect, whose one committed frame is enough to press a button.
 *
 * ⚠ THE MAP IS MIRRORED IN A REF. Two writes in one task (a paste answered in two chunks, a recall
 * landing beside a field's own change) must compose, not overwrite each other from the same stale
 * render.
 */
export type WorkflowDrafts = {
  /** The draft of one workflow: what was laid on it, or its fresh initial state. */
  of: (def: WorkflowDef) => Draft;
  /** Write one workflow's draft through a function of its latest value. */
  update: (def: WorkflowDef, fn: (draft: Draft) => Draft) => void;
  /** Replace one workflow's draft whole (recall). */
  put: (key: WorkflowKey, draft: Draft) => void;
};

type Store = Readonly<Partial<Record<WorkflowKey, Draft>>>;

const NONE: Store = {};

/** One fresh draft per workflow, so an untouched form reads the SAME object render after render. */
const initials = new WeakMap<WorkflowDef, Draft>();
function fresh(def: WorkflowDef): Draft {
  let draft = initials.get(def);
  if (!draft) {
    draft = initialDraft(def.run);
    initials.set(def, draft);
  }
  return draft;
}

export function useWorkflowDrafts(techCardId: number | undefined): WorkflowDrafts {
  const [store, setStore] = useState<Store>(NONE);
  const latest = useRef<Store>(store);
  latest.current = store;

  const shownCard = useRef(techCardId);
  if (shownCard.current !== techCardId) {
    shownCard.current = techCardId;
    if (Object.keys(store).length) {
      latest.current = NONE;
      setStore(NONE);
    }
  }

  const write = useCallback((next: Store) => {
    latest.current = next;
    setStore(next);
  }, []);

  const of = useCallback((def: WorkflowDef): Draft => store[def.key] ?? fresh(def), [store]);

  const update = useCallback(
    (def: WorkflowDef, fn: (draft: Draft) => Draft) => {
      const prev = latest.current;
      write({ ...prev, [def.key]: fn(prev[def.key] ?? fresh(def)) });
    },
    [write],
  );

  const put = useCallback(
    (key: WorkflowKey, draft: Draft) => {
      write({ ...latest.current, [key]: draft });
    },
    [write],
  );

  return { of, update, put };
}
