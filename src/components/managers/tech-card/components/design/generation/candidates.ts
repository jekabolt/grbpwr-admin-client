import type { common_DesignPicture, common_DesignRun } from 'api/proto-http/admin';
import { useSyncExternalStore } from 'react';

import type { OutputPlan } from './run-gallery';

/**
 * ═══ FLAT CANDIDATES — ONE PRESS, SEVERAL SHEETS, ONE PICKED (flat route, 05.10) ═══════════════
 *
 * A garment-sheet flat run (`layout = one`) buys several candidate sheets (`requested_outputs` > 1);
 * the server does not cut any of them. The designer picks one on the workbench and only that one
 * goes on to the split / `put into sides` flow — the bench's auto-cut (T26) never touches the
 * others. A legacy one-output run has no candidates and is cut as before.
 *
 * The pick is the designer's per run, kept in this browser (localStorage, best effort): it writes
 * nothing, and a sheet that was already cut counts as picked without it.
 */

export type FlatCandidates = {
  /** The candidate sheets' ids, in the run's order. */
  ids: number[];
  /** The picked one; 0 = none yet. */
  picked: number;
};

export function isCandidateRun(run: common_DesignRun | null | undefined): boolean {
  if (!run) return false;
  return (
    (run.kind ?? '').trim().toLowerCase() === 'flat' &&
    (run.params?.layout ?? 'one') !== 'per_view' &&
    (run.requestedOutputs ?? 0) > 1
  );
}

const KEY = (card: number) => `grbpwr.design.flat.pick.${card}`;
const cache = new Map<number, Record<string, number>>();
const listeners = new Set<() => void>();
const NONE: Record<string, number> = {};

function readPicks(card: number): Record<string, number> {
  const hit = cache.get(card);
  if (hit) return hit;
  let picks = NONE;
  try {
    const raw = window.localStorage.getItem(KEY(card));
    const v = raw ? (JSON.parse(raw) as unknown) : null;
    if (v && typeof v === 'object') picks = v as Record<string, number>;
  } catch {
    /* no storage — nothing picked */
  }
  cache.set(card, picks);
  return picks;
}

export function pickCandidate(card: number, runId: number, pictureId: number): void {
  if (card <= 0 || runId <= 0 || pictureId <= 0) return;
  const next = { ...readPicks(card), [String(runId)]: pictureId };
  cache.set(card, next);
  try {
    window.localStorage.setItem(KEY(card), JSON.stringify(next));
  } catch {
    /* the session still remembers */
  }
  listeners.forEach((l) => l());
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
};

export function usePicks(card: number): Record<string, number> {
  const read = () => readPicks(card);
  return useSyncExternalStore(subscribe, read, read);
}

/**
 * The candidates of a run as the bench draws them (`drawn` = the bench plan before the cut pieces
 * take their sheets' places, so a cut sheet is still a card here). `null` = not a candidate run.
 */
export function candidatesOf(
  run: common_DesignRun | null | undefined,
  drawn: OutputPlan | null | undefined,
  picks: Record<string, number>,
): FlatCandidates | null {
  if (!isCandidateRun(run) || !drawn) return null;
  const ids = drawn.cards.map((c) => c.picture.id ?? 0).filter((id) => id > 0);
  if (ids.length < 2) return null;
  const stored = picks[String(run?.id ?? 0)] ?? 0;
  const cut = drawn.cards.find((c) => c.members.length > 0)?.picture.id ?? 0;
  const picked = ids.includes(stored) ? stored : cut;
  return { ids, picked };
}

export function isGrey(picture: common_DesignPicture): boolean {
  return (picture.flags ?? []).some((f) => f.trim().toLowerCase() === 'grey');
}
