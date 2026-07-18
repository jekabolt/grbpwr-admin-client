import { adminService } from 'api/api';
import { common_Colorway, common_ColorwayLifecycleStatus } from 'api/proto-http/admin';
import { useSnackBarStore } from 'lib/stores/store';
import { useCallback, useMemo, useState } from 'react';

const ACTIVE: common_ColorwayLifecycleStatus = 'COLORWAY_LIFECYCLE_STATUS_ACTIVE';
const HIDDEN: common_ColorwayLifecycleStatus = 'COLORWAY_LIFECYCLE_STATUS_HIDDEN';

interface Args {
  items: common_Colorway[];
  setItems: React.Dispatch<React.SetStateAction<common_Colorway[]>>;
}

// "hid 8 products" on a clean run; "hid 8 of 9 — 1 failed" when the batch was partial.
function summarize(verb: string, ok: number, total: number, fail: number): string {
  if (fail === 0) return `${verb} ${ok} ${ok === 1 ? 'product' : 'products'}`;
  return `${verb} ${ok} of ${total} — ${fail} failed`;
}

// Multi-select + bulk lifecycle actions for the catalog grid.
//
// No bulk-hide RPC exists backend-side, so a batch is a loop of the per-product
// TransitionColorwayStatus, awaited together (allSettled → tolerate partial failure), summarised in ONE
// toast. Each success returns the fresh colourway (new status + lockVersion); we splice those straight
// back into the list so states refresh in place without a refetch — the catalog list is local state,
// not a React Query cache, so there is no query to invalidate.
export function useCatalogSelection({ items, setItems }: Args) {
  const { showMessage } = useSnackBarStore();
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState(false);

  const enterSelection = useCallback(() => setSelectionMode(true), []);
  const clearSelection = useCallback(() => setSelectedIds(new Set()), []);
  const exitSelection = useCallback(() => {
    setSelectionMode(false);
    setSelectedIds(new Set());
  }, []);

  const toggle = useCallback((id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const pageIds = useMemo(
    () => items.map((i) => i.id).filter((id): id is number => id != null),
    [items],
  );
  const allOnPageSelected = pageIds.length > 0 && pageIds.every((id) => selectedIds.has(id));

  const selectAllOnPage = useCallback(() => {
    setSelectedIds((prev) => {
      const everySelected = pageIds.length > 0 && pageIds.every((id) => prev.has(id));
      return everySelected ? new Set() : new Set(pageIds);
    });
  }, [pageIds]);

  const selectedProducts = useMemo(
    () => items.filter((i) => i.id != null && selectedIds.has(i.id)),
    [items, selectedIds],
  );
  // Only ACTIVE colourways can be hidden, only HIDDEN ones can be unhidden — so the batch acts on the
  // applicable subset of the selection and the buttons show that exact count.
  const hideable = useMemo(
    () => selectedProducts.filter((p) => p.status === ACTIVE),
    [selectedProducts],
  );
  const unhideable = useMemo(
    () => selectedProducts.filter((p) => p.status === HIDDEN),
    [selectedProducts],
  );

  const runBulk = useCallback(
    async (targets: common_Colorway[], target: common_ColorwayLifecycleStatus, verb: string) => {
      const valid = targets.filter((t) => t.id != null);
      if (!valid.length || busy) return;
      setBusy(true);
      try {
        const results = await Promise.allSettled(
          valid.map((p) =>
            adminService.TransitionColorwayStatus({
              colorwayId: p.id,
              expectedVersion: p.lockVersion ?? 0,
              target,
            }),
          ),
        );

        const updatedById = new Map<number, common_Colorway>();
        const succeededIds = new Set<number>();
        let ok = 0;
        let fail = 0;
        results.forEach((r, i) => {
          const src = valid[i];
          if (r.status === 'fulfilled') {
            ok += 1;
            if (src.id != null) succeededIds.add(src.id);
            const updated = r.value.colorway;
            if (updated?.id != null) updatedById.set(updated.id, updated);
            else if (src.id != null) updatedById.set(src.id, { ...src, status: target });
          } else {
            fail += 1;
          }
        });

        if (updatedById.size) {
          setItems((prev) =>
            prev.map((it) =>
              it.id != null && updatedById.has(it.id) ? updatedById.get(it.id)! : it,
            ),
          );
        }
        // Drop the ones that succeeded; leave any failures selected so the operator can retry.
        setSelectedIds((prev) => {
          const next = new Set(prev);
          succeededIds.forEach((id) => next.delete(id));
          if (next.size === 0) setSelectionMode(false);
          return next;
        });

        showMessage(summarize(verb, ok, valid.length, fail), fail ? 'error' : 'success');
      } finally {
        setBusy(false);
      }
    },
    [busy, setItems, showMessage],
  );

  const hideSelected = useCallback(() => runBulk(hideable, HIDDEN, 'hid'), [runBulk, hideable]);
  const unhideSelected = useCallback(
    () => runBulk(unhideable, ACTIVE, 'unhid'),
    [runBulk, unhideable],
  );

  const isSelected = useCallback((id?: number) => id != null && selectedIds.has(id), [selectedIds]);

  return {
    selectionMode,
    enterSelection,
    exitSelection,
    toggle,
    isSelected,
    selectAllOnPage,
    clearSelection,
    allOnPageSelected,
    selectedCount: selectedIds.size,
    totalOnPage: pageIds.length,
    hideableCount: hideable.length,
    unhideableCount: unhideable.length,
    hideSelected,
    unhideSelected,
    busy,
  };
}
