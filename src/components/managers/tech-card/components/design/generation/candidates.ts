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
 * nothing. A sheet already cut on the server is the pick, always — the local one is then ignored.
 * Since 82-INPUT-REDESIGN the pick is made by a three-tap quiz (`candidate-quiz.tsx`), and the
 * candidates never stand on the bench as tiles; «none of these» is remembered as a rejection.
 */

export type FlatCandidates = {
  /** The candidate sheets' ids, in the run's order. */
  ids: number[];
  /** The picked one; 0 = none yet. */
  picked: number;
  /** The quiz ended on «none of these» (this browser): no sheet is picked, none is cut. */
  rejected: boolean;
  /** The pick is a cut sheet (server truth): it cannot be changed here. */
  cut: boolean;
  /** The bench cards of the picked candidate's family (its edits, its «save as new» siblings) —
   *  what stays on the bench once a pick is made. Empty when nothing is picked. */
  family: number[];
};

/**
 * THE CANDIDATE A PICTURE GREW FROM: back along `replacedBy` (an edit that took its place) and
 * `derivedFrom` (a «save as new» of it) while the parent is in the same run. Bounded by `seen`.
 */
function originsOf(pictures: readonly common_DesignPicture[]): (id: number) => number {
  const byId = new Map<number, common_DesignPicture>();
  for (const p of pictures) if ((p.id ?? 0) > 0 && !byId.has(p.id ?? 0)) byId.set(p.id ?? 0, p);
  const prevOf = new Map<number, number>();
  for (const p of pictures) {
    const next = p.replacedBy ?? 0;
    if (next > 0 && next !== p.id && byId.has(next) && !prevOf.has(next))
      prevOf.set(next, p.id ?? 0);
  }
  return (id: number) => {
    let cur = id;
    const seen = new Set<number>([cur]);
    for (;;) {
      const back = prevOf.get(cur) ?? byId.get(cur)?.derivedFrom ?? 0;
      if (back <= 0 || back === cur || !byId.has(back) || seen.has(back)) return cur;
      seen.add(back);
      cur = back;
    }
  };
}

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

/** «none of these» is stored as -1; `clearCandidatePick` asks again. */
const NONE_PICKED = -1;

export function rejectCandidates(card: number, runId: number): void {
  writePick(card, runId, NONE_PICKED);
}

export function clearCandidatePick(card: number, runId: number): void {
  writePick(card, runId, 0);
}

export function pickCandidate(card: number, runId: number, pictureId: number): void {
  if (pictureId <= 0) return;
  writePick(card, runId, pictureId);
}

function writePick(card: number, runId: number, pictureId: number): void {
  if (card <= 0 || runId <= 0) return;
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
  // SERVER TRUTH FIRST: a candidate already cut (it has pieces on the server) IS the pick, whatever
  // this browser remembers — and then no other candidate is offered or cut automatically.
  const origin = originsOf(run?.pictures ?? []);
  const familyOf = (picked: number) => ids.filter((id) => origin(id) === origin(picked));
  const cut = drawn.cards.find((c) => c.members.length > 0)?.picture.id ?? 0;
  if (cut > 0) return { ids, picked: cut, cut: true, rejected: false, family: familyOf(cut) };
  // The stored pick may since have been edited (a head now stands in its place) or got a «save as
  // new» sibling: it is resolved through its family, never lost.
  const stored = picks[String(run?.id ?? 0)] ?? 0;
  if (stored <= 0)
    return { ids, picked: 0, cut: false, rejected: stored === NONE_PICKED, family: [] };
  const picked = ids.includes(stored)
    ? stored
    : ids.find((id) => origin(id) === origin(stored)) ?? 0;
  return { ids, picked, cut: false, rejected: false, family: picked ? familyOf(picked) : [] };
}

export function isGrey(picture: common_DesignPicture): boolean {
  return (picture.flags ?? []).some((f) => f.trim().toLowerCase() === 'grey');
}
