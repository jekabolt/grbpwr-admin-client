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
// staging. That is also why the provider takes the card key — the persisted snapshots are per card.

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
  /** Return the panel to pristine after a successful commit, if it holds state the header cannot
   *  reach. Called only on success. */
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

type StagingContextValue = {
  changes: StagedChange[];
  stage: (change: StagedChange) => void;
  unstage: (key: string) => void;
  isStaged: (key: string) => boolean;
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

export type PersistedStaging = Array<{ key: string; label: string; snapshot: unknown }>;

const StagingContext = createContext<StagingContextValue | null>(null);

export function TechCardStagingProvider({ children }: { children: ReactNode }) {
  const [changes, setChanges] = useState<StagedChange[]>([]);
  // Snapshots restored from localStorage, waiting for their panel to mount and claim them. A ref,
  // not state: claiming one must not re-render every other panel.
  const restorable = useRef<Map<string, unknown>>(new Map());

  const stage = useCallback((change: StagedChange) => {
    setChanges((prev) => {
      const rest = prev.filter((c) => c.key !== change.key);
      // Re-staging REPLACES: `commit` closes over the panel's current state, so a stale closure
      // would commit the edit before last. This is why panels stage on every edit, not once.
      return [...rest, change].sort((a, b) => a.order - b.order || a.key.localeCompare(b.key));
    });
  }, []);

  const unstage = useCallback((key: string) => {
    setChanges((prev) =>
      prev.some((c) => c.key === key) ? prev.filter((c) => c.key !== key) : prev,
    );
  }, []);

  const isStaged = useCallback((key: string) => changes.some((c) => c.key === key), [changes]);

  const commitAll = useCallback(async (): Promise<CommitOutcome> => {
    // Snapshot the list: a panel re-staging mid-commit (a re-render on its own mutation settling)
    // must not change what this run is committing.
    const queue = [...changes].sort((a, b) => a.order - b.order || a.key.localeCompare(b.key));
    const committed: StagedChange[] = [];
    for (const change of queue) {
      try {
        await change.commit();
      } catch (error) {
        // Stop. Everything not yet committed stays staged, including this one — the caller names it.
        return { committed, failed: { change, error } };
      }
      committed.push(change);
      change.settle?.();
      setChanges((prev) => prev.filter((c) => c.key !== change.key));
    }
    return { committed };
  }, [changes]);

  const takeSnapshot = useCallback((key: string) => {
    const value = restorable.current.get(key);
    restorable.current.delete(key);
    return value;
  }, []);

  const serialize = useCallback(
    (): PersistedStaging =>
      changes
        .filter((c) => c.snapshot !== undefined)
        .map((c) => ({ key: c.key, label: c.label, snapshot: c.snapshot })),
    [changes],
  );

  const hydrate = useCallback((persisted: PersistedStaging | null) => {
    restorable.current = new Map((persisted ?? []).map((p) => [p.key, p.snapshot]));
  }, []);

  const clear = useCallback(() => {
    setChanges([]);
    restorable.current.clear();
  }, []);

  const value = useMemo(
    () => ({
      changes,
      stage,
      unstage,
      isStaged,
      commitAll,
      takeSnapshot,
      serialize,
      hydrate,
      clear,
    }),
    [changes, stage, unstage, isStaged, commitAll, takeSnapshot, serialize, hydrate, clear],
  );

  return <StagingContext.Provider value={value}>{children}</StagingContext.Provider>;
}

/**
 * Staging for a sub-panel. Returns null OUTSIDE a provider rather than throwing, so a panel that is
 * also rendered somewhere else (the product manager reuses several) keeps working un-staged.
 */
export function useTechCardStaging(): StagingContextValue | null {
  return useContext(StagingContext);
}

/**
 * The header's view. Throws outside a provider, because the header is only ever inside one and a
 * silent null there would mean a save button that saves nothing.
 */
export function useTechCardStagingRequired(): StagingContextValue {
  const ctx = useContext(StagingContext);
  if (!ctx)
    throw new Error('useTechCardStagingRequired must be used inside TechCardStagingProvider');
  return ctx;
}
