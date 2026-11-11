// KEEPS THE STEPS' FOLD LINKS TRUE TO THE SERVER. A fold row is written by an RPC at once, its link to
// a step only by the deferred autosave of the whole card. Two ways that goes wrong, both mended here:
//
// - a reload between the two: the row is stored, the link never was. The link is owed in this
//   browser's ledger (card-owed.ts) and the next card read puts it back on its step, the way the
//   seam links come back;
// - a fold removed elsewhere (another tab): its key stays on a step of this form and the next save is
//   refused for naming an unknown fold. A key that leaves the server's list leaves the steps.

import type { common_TechCard } from 'api/proto-http/admin';
import type { StoredFold } from 'lib/folds';
import { useEffect, useRef } from 'react';
import { useFormContext } from 'react-hook-form';
import { clearLinkOwed, owedLinks, planOwedLinks, type OwedLink } from '../card-owed';
import { useTechCardAutosave } from '../design/autosave-contract';
import type { TechCardFormData } from '../schema';
import { useFoldsStore, type FoldPendingOp } from './folds-store';
import { stepsWithoutFolds } from './use-fold-writes';

/** The ledger entries for folds just put on a step; a step without a number cannot be found again. */
export function owedFoldLinks(
  operations: readonly { operationNumber?: number }[],
  foldKeys: readonly string[],
  stepIndex: number | null,
  now: number,
): OwedLink[] {
  if (stepIndex === null) return [];
  const op = operations[stepIndex]?.operationNumber ?? 0;
  if (op <= 0) return [];
  return [...new Set(foldKeys)].map((key) => ({ op, field: 'foldKeys', key, at: now }));
}

type FoldOp = { operationNumber?: number; foldKeys?: string[] };

/**
 * The seam replay, judged per step: a fold key counts as linked only on the step it is owed to. A
 * replacement can move a reused key to another step, and the stored card still names the old one;
 * such a key leaves its old step in the form and goes on the owed one.
 */
export function planFoldReplay(
  links: readonly OwedLink[],
  stored: readonly FoldOp[],
  form: readonly FoldOp[],
  rows: readonly StoredFold[],
  now: number,
): {
  attach: { index: number; key: string }[];
  detach: { index: number; key: string }[];
  drop: OwedLink[];
} {
  const out = { attach: [], detach: [], drop: [] } as ReturnType<typeof planFoldReplay>;
  const seamRows = rows.map((row) => ({ seamKey: row.foldKey }));
  for (const link of links) {
    const away = (op: FoldOp) => op.operationNumber !== link.op;
    const strip = (op: FoldOp) =>
      away(op) ? { ...op, foldKeys: (op.foldKeys ?? []).filter((k) => k !== link.key) } : op;
    const plan = planOwedLinks(
      [link],
      stored.filter((op) => !away(op)) as never,
      form.map(strip) as never,
      seamRows,
      now,
    );
    out.drop.push(...plan.drop);
    for (const { index, key } of plan.attach) {
      out.attach.push({ index, key });
      form.forEach((op, i) => {
        if (away(op) && op.foldKeys?.includes(key)) out.detach.push({ index: i, key });
      });
    }
  }
  return out;
}

/** Keys the server's list no longer holds; a row still in flight is not gone. */
export function goneFoldKeys(
  prev: readonly StoredFold[],
  next: readonly StoredFold[],
  pending: Record<string, FoldPendingOp>,
): string[] {
  const now = new Set(next.map((row) => row.foldKey));
  return prev
    .map((row) => row.foldKey)
    .filter((key) => !now.has(key) && pending[key]?.kind !== 'upsert');
}

export function useFoldLinksKeep(techCard: common_TechCard | undefined) {
  const form = useFormContext<TechCardFormData>();
  const autosave = useTechCardAutosave();
  const autosaveRef = useRef(autosave);
  autosaveRef.current = autosave;
  const cardId = techCard?.id;
  const autosaveOff = autosave.status === 'off';

  useEffect(() => {
    if (!cardId || !form) return;
    return useFoldsStore.subscribe((s, prev) => {
      if (s.cardId !== cardId || prev.cardId !== cardId || s.server === prev.server) return;
      const gone = goneFoldKeys(prev.server, s.server, s.pending);
      if (!gone.length) return;
      for (const key of gone) clearLinkOwed(cardId, key, 'foldKeys');
      for (const { index, foldKeys } of stepsWithoutFolds(form.getValues('operations') ?? [], gone))
        form.setValue(`operations.${index}.foldKeys`, foldKeys, { shouldDirty: true });
    });
  }, [cardId, form]);

  // Every card read comes through here; the timeout lets the hydrate and the form take the card first.
  useEffect(() => {
    if (!cardId || !form || autosaveOff || !owedLinks(cardId, ['foldKeys']).length) return;
    const timer = window.setTimeout(() => {
      const folds = useFoldsStore.getState();
      if (folds.cardId !== cardId) return;
      const plan = planFoldReplay(
        owedLinks(cardId, ['foldKeys']),
        (techCard?.techCard?.operations ?? []) as FoldOp[],
        (form.getValues('operations') ?? []) as FoldOp[],
        folds.server,
        Date.now(),
      );
      for (const link of plan.drop) clearLinkOwed(cardId, link.key, 'foldKeys');
      for (const { index, key } of plan.detach) {
        const current = form.getValues(`operations.${index}.foldKeys`) ?? [];
        form.setValue(
          `operations.${index}.foldKeys`,
          current.filter((k) => k !== key),
          { shouldDirty: true },
        );
      }
      for (const { index, key } of plan.attach) {
        const current = form.getValues(`operations.${index}.foldKeys`) ?? [];
        form.setValue(`operations.${index}.foldKeys`, [...current, key], { shouldDirty: true });
      }
      if (plan.attach.length) autosaveRef.current.request('fold-step');
    }, 0);
    return () => window.clearTimeout(timer);
  }, [cardId, techCard, autosaveOff, form]);
}
