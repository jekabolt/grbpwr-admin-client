import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from 'react';

// ONE SAVE, STAGED (phase 19).
//
// THE DAMAGE THIS FIXES: ten sub-panels own their own RPC and their own save button, and the header
// `save` covers none of them. Edit the size chart, press the header save, lose the size chart. It
// is the single biggest source of lost work on the card, and no amount of styling addresses it.
//
// The fix is deliberately NOT a rewrite of ten mutations. A panel keeps its local state and keeps
// its mutation; it just hands that mutation to the header instead of firing it. `commit` is the
// panel's existing call, curried — which is what makes this phase reviewable, and what lets panels
// convert one at a time (see the rollout in 19-save-model.md).
//
// Scoped to ONE card via context, not a global store: two cards open in two tabs must not share
// staging.
//
// ─── WHY THIS IS TWO CONTEXTS ────────────────────────────────────────────────────────────────
// A panel stages from inside a useEffect, so whatever it reads from context lands in that effect's
// dep list. With ONE context the value object changes identity on every stage → the effect re-runs
// → it stages again → forever. That is not theoretical: the first cut of this file did exactly that
// and a panel went into a render explosion on the first keystroke. `yarn build:check` cannot see it
// (it is a runtime loop, not a type error), which is precisely why it is split here instead of
// being left as a rule for panel authors to remember.
//
// So: ACTIONS are identity-stable for the life of the provider and are what panels use. The
// changing `changes` array lives in its own context that only the header subscribes to.

export type StagedChange = {
  /** Stable identity: 'sizeChart' | `recipe:${colorwayId}` | … Re-staging the same key replaces it. */
  key: string;
  /** What changed, in the operator's words — 'размерная таблица — 6 cells'. The PANEL computes this
   *  because only the panel knows what it is holding. */
  label: string;
  /** Commit order (see COMMIT_ORDER). Lower goes first. */
  order: number;
  /** The panel's own mutation, curried over its current state. */
  commit: () => Promise<void>;
  /** Return the panel to pristine after a successful commit. Runs only on success.
   *  NOT optional in practice: a panel that stays dirty after committing immediately re-stages
   *  itself, and the header then reports an unsaved change that is already saved. */
  settle?: () => void;
  /** Serializable state for the refresh-restore path (19.6). Omit and the change simply does not
   *  survive a reload — which is the honest outcome for a panel that cannot rebuild itself. */
  snapshot?: unknown;
};

// Commit order. A colourway recipe references BOM lines the card body may have just added, so the
// parent goes first: committing a child against a stale parent is how orphan references are made.
export const COMMIT_ORDER = {
  cardBody: 0,
  styleFacts: 10,
  sizeChart: 10,
  assembly: 20,
  packaging: 20,
  recipe: 30,
  labDip: 30,
  samples: 40,
  substitutions: 40,
  devExpenses: 40,
} as const;

export type CommitOutcome = {
  /** Changes that committed, in the order they went. */
  committed: StagedChange[];
  /** The one that refused, if any. Everything from here on stays staged. */
  failed?: { change: StagedChange; error: unknown };
};

export type PersistedStaging = Array<{ key: string; label: string; snapshot: unknown }>;

/** Identity-stable for the provider's lifetime — safe in a useEffect dep list. */
type StagingActions = {
  stage: (change: StagedChange) => void;
  unstage: (key: string) => void;
  /** Commit every staged change in order, stopping at the first failure. */
  commitAll: () => Promise<CommitOutcome>;
  /** Snapshot persisted by a previous session for this key, consumed once. */
  takeSnapshot: (key: string) => unknown;
  /** Everything currently staged, serialized — the draft autosave writes this alongside the form. */
  serialize: () => PersistedStaging;
  /** Seed the restorable snapshots from a persisted draft. */
  hydrate: (persisted: PersistedStaging | null) => void;
  clear: () => void;
};

const ActionsContext = createContext<StagingActions | null>(null);
const ChangesContext = createContext<StagedChange[]>([]);

export function TechCardStagingProvider({ children }: { children: ReactNode }) {
  const [changes, setChanges] = useState<StagedChange[]>([]);
  // The actions read through this ref, so none of them has to depend on `changes` — which is what
  // keeps every callback below stable across a stage.
  const changesRef = useRef<StagedChange[]>([]);
  changesRef.current = changes;
  // Snapshots restored from localStorage, waiting for their panel to mount and claim them. A ref,
  // not state: claiming one must not re-render every other panel.
  const restorable = useRef<Map<string, unknown>>(new Map());

  const actions = useMemo<StagingActions>(() => {
    const sortQueue = (list: StagedChange[]) =>
      [...list].sort((a, b) => a.order - b.order || a.key.localeCompare(b.key));

    return {
      stage: (change) =>
        setChanges((prev) => {
          const existing = prev.find((c) => c.key === change.key);
          // Bail out when nothing a reader can see has moved. `commit` is a fresh closure on every
          // render, so comparing it would always report a change and defeat the point; the label and
          // order are what the header renders, and the closure is swapped in regardless below.
          if (
            existing &&
            existing.label === change.label &&
            existing.order === change.order &&
            existing.snapshot === change.snapshot
          ) {
            // Same visible state, newer closure: replace in place WITHOUT a new array identity, so
            // the header does not re-render and no dependent effect re-fires.
            const idx = prev.indexOf(existing);
            prev[idx] = change;
            return prev;
          }
          // Re-staging REPLACES: `commit` closes over the panel's state at the render that staged
          // it, so a stale closure would commit the edit before last.
          return sortQueue([...prev.filter((c) => c.key !== change.key), change]);
        }),

      unstage: (key) =>
        setChanges((prev) =>
          prev.some((c) => c.key === key) ? prev.filter((c) => c.key !== key) : prev,
        ),

      commitAll: async () => {
        // Snapshot the queue: a panel re-staging mid-commit (its own mutation settling) must not
        // change what this run is committing.
        const queue = sortQueue(changesRef.current);
        const committed: StagedChange[] = [];
        for (const change of queue) {
          try {
            await change.commit();
          } catch (error) {
            // Stop. Everything not yet committed stays staged, including this one — the caller
            // names it in the partial-failure banner.
            return { committed, failed: { change, error } };
          }
          committed.push(change);
          change.settle?.();
          setChanges((prev) => prev.filter((c) => c.key !== change.key));
        }
        return { committed };
      },

      takeSnapshot: (key) => {
        const value = restorable.current.get(key);
        restorable.current.delete(key);
        return value;
      },

      serialize: () =>
        changesRef.current
          .filter((c) => c.snapshot !== undefined)
          .map((c) => ({ key: c.key, label: c.label, snapshot: c.snapshot })),

      hydrate: (persisted) => {
        restorable.current = new Map((persisted ?? []).map((p) => [p.key, p.snapshot]));
      },

      clear: () => {
        setChanges([]);
        restorable.current.clear();
      },
    };
  }, []);

  return (
    <ActionsContext.Provider value={actions}>
      <ChangesContext.Provider value={changes}>{children}</ChangesContext.Provider>
    </ActionsContext.Provider>
  );
}

/**
 * Staging for a sub-panel. Identity-stable, so putting it in a useEffect dep list is safe — see the
 * two-contexts note above. Returns null OUTSIDE a provider rather than throwing, so a panel that is
 * also rendered elsewhere (the product manager reuses several) keeps working un-staged.
 */
export function useTechCardStaging(): StagingActions | null {
  return useContext(ActionsContext);
}

/**
 * Read-only subscription to the staged list, for a panel that needs to SHOW what is staged (the
 * samples board marks tiles whose sample has pending edits).
 *
 * Deliberately separate from the actions: this value changes on every stage, so it must never end up
 * in the dep list of the effect that stages — that is the render explosion the note at the top of
 * this file describes. Read it during render, not inside a staging effect.
 */
export function useStagedChanges(): StagedChange[] {
  return useContext(ChangesContext);
}

/**
 * The current snapshot staged under a key, if any. Lets a panel re-open a sample it staged and
 * closed and find its own pending edits, without subscribing the staging effect to the whole list.
 */
export function useStagedSnapshot(): (key: string) => unknown {
  const changes = useContext(ChangesContext);
  return useCallback((key: string) => changes.find((c) => c.key === key)?.snapshot, [changes]);
}

/**
 * The header's view: the actions PLUS the live list. Throws outside a provider, because the header
 * is only ever inside one and a silent null there would mean a save button that saves nothing.
 */
export function useTechCardStagingRequired(): StagingActions & { changes: StagedChange[] } {
  const actions = useContext(ActionsContext);
  const changes = useContext(ChangesContext);
  if (!actions)
    throw new Error('useTechCardStagingRequired must be used inside TechCardStagingProvider');
  return { ...actions, changes };
}
