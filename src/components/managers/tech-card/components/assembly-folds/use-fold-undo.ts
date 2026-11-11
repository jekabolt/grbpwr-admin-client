// The glue of fold-undo.ts: watches the form's pieces and steps, writes the rows back through the
// normal fold upsert once a card read holds the piece again, and puts the links on the steps with the
// D5 ledger behind them. A refused write is said where every fold write refusal is said (the upsert's
// own notice); the piece stays, the capture goes. Draws nothing.

import type { common_TechCard } from 'api/proto-http/admin';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useFormContext } from 'react-hook-form';
import { clearLinkOwed, markLinkOwed } from '../card-owed';
import { useTechCardAutosave, type AutosaveStatus } from '../design/autosave-contract';
import type { TechCardFormData } from '../schema';
import {
  dropFoldUndo,
  emptyFoldUndo,
  foldUndoBaseline,
  foldUndoMoved,
  foldUndoScrub,
  loadFoldUndo,
  planFoldUndo,
  saveFoldUndo,
  undoLinkWrites,
  type FoldUndoEntry,
  type FoldUndoState,
} from './fold-undo';
import { foldRowsOf, useFoldsStore } from './folds-store';
import { useFoldWrites } from './use-fold-writes';

const SETTLED = new Set<AutosaveStatus>(['saved', 'idle', 'off']);

const watched = (name: string) =>
  name === 'pieces' ||
  name.startsWith('pieces.') ||
  name === 'operations' ||
  name.startsWith('operations.');

export function useFoldUndo(techCard: common_TechCard | undefined) {
  const form = useFormContext<TechCardFormData>();
  const autosave = useTechCardAutosave();
  const cardId = techCard?.id;
  const writes = useFoldWrites(
    cardId,
    techCard?.techCard?.approvalState === 'TECH_CARD_APPROVAL_STATE_RELEASED',
  );
  const state = useRef<FoldUndoState | null>(null);
  const busy = useRef(new Set<string>());
  const [tick, setTick] = useState(0);
  // The context hands a new object on every provider render; the form behind it is one.
  const live = useRef({ form, autosave, writes });
  live.current = { form, autosave, writes };
  const control = form?.control;

  const commit = useCallback((next: FoldUndoState) => {
    const before = state.current;
    state.current = next;
    if (next.entries === before?.entries) return;
    saveFoldUndo(next.cardId, next.entries);
    setTick((t) => t + 1);
  }, []);

  /** Rows stored again (or never gone): links back on their steps, owed until a read shows them. */
  const finish = useCallback((id: number, entries: readonly FoldUndoEntry[]) => {
    const { form: f, autosave: a } = live.current;
    const ops = f.getValues('operations') ?? [];
    const rows = foldRowsOf(useFoldsStore.getState());
    const { attach, owed } = undoLinkWrites(entries, ops, rows, Date.now());
    for (const { index, key } of attach) {
      const keys = f.getValues(`operations.${index}.foldKeys`) ?? [];
      f.setValue(`operations.${index}.foldKeys`, [...keys, key], { shouldDirty: true });
    }
    for (const link of owed) {
      clearLinkOwed(id, link.key, 'foldKeys');
      markLinkOwed(id, link);
    }
    if (attach.length) a.request('fold-step');
  }, []);

  useEffect(() => {
    const f = live.current.form;
    if (!cardId || !f) return;
    busy.current = new Set();
    commit(
      foldUndoBaseline(
        { ...emptyFoldUndo(cardId), entries: loadFoldUndo(cardId, Date.now()) },
        f.getValues('pieces') ?? [],
        f.getValues('operations') ?? [],
      ),
    );
    let queued = false;
    let reset = false;
    const subscription = f.watch((_values, { name }) => {
      if (name === undefined) reset = true;
      else if (!watched(name)) return;
      if (queued) return;
      queued = true;
      queueMicrotask(() => {
        queued = false;
        const current = state.current;
        if (current?.cardId !== cardId) return;
        const pieces = f.getValues('pieces') ?? [];
        const ops = f.getValues('operations') ?? [];
        const folds = useFoldsStore.getState();
        const rows = foldRowsOf(folds);
        const next = reset
          ? foldUndoBaseline(current, pieces, ops)
          : foldUndoMoved(current, pieces, ops, rows, Date.now());
        reset = false;
        commit(next);
        if (folds.cardId !== cardId) return;
        for (const { index, foldKeys } of foldUndoScrub(next, ops, rows)) {
          f.setValue(`operations.${index}.foldKeys`, foldKeys, { shouldDirty: true });
        }
      });
    });
    return () => {
      subscription.unsubscribe();
      state.current = null;
    };
  }, [cardId, control, commit]);

  // Every card read, autosave turn and capture change comes through here.
  useEffect(() => {
    const current = state.current;
    const f = live.current.form;
    const folds = useFoldsStore.getState();
    if (!cardId || !f || current?.cardId !== cardId || folds.cardId !== cardId) return;
    const plan = planFoldUndo(current, {
      formPieces: f.getValues('pieces') ?? [],
      readPieces: techCard?.techCard ? techCard.techCard.pieces ?? [] : null,
      rows: foldRowsOf(folds),
      pending: folds.pending,
      saving: autosave.status === 'saving',
      settled: SETTLED.has(autosave.status),
      now: Date.now(),
      busy: busy.current,
    });
    if (plan.done.length)
      finish(
        cardId,
        plan.done.map((key) => current.entries[key]),
      );
    if (plan.done.length || plan.drop.length) {
      commit(dropFoldUndo(current, [...plan.done, ...plan.drop]));
    }
    if (!plan.upsert.length) return;
    const sent = plan.writing.map((key) => [key, current.entries[key]] as const);
    for (const [key] of sent) busy.current.add(key);
    void live.current.writes.upsert(plan.upsert).then((ok) => {
      for (const [key] of sent) busy.current.delete(key);
      const now = state.current;
      if (now?.cardId !== cardId) return;
      // A redo while the write flew captured the piece anew: that capture is not this one's to drop.
      const same = sent.filter(([key, entry]) => now.entries[key] === entry);
      if (ok)
        finish(
          cardId,
          same.map(([, entry]) => entry),
        );
      commit(
        dropFoldUndo(
          now,
          same.map(([key]) => key),
        ),
      );
    });
  }, [cardId, techCard, autosave.status, tick, commit, finish]);
}
