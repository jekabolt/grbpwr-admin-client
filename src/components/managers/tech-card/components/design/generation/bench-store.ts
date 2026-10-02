import { useSyncExternalStore } from 'react';

/**
 * ═══ WHICH RUN THE WORKBENCH HOLDS, AND WHO IS WORKING ON IT (26.09, O-53 review) ═══════════════
 *
 * The latest-generation workbench under GENERATE (`latest-generation.tsx`) follows the newest flat
 * run — but only while nobody is working on the run it shows. Codex, review of O-53: a newer run
 * landing on a poll replaced the shown run, so an open editor unmounted without its unsaved-work
 * question, and a split finished into a run the workbench no longer showed. The rule now (coordinator,
 * 26.09):
 *   · while a run-scoped surface is open — EDIT or SPLIT on a tile, the zoom viewer — the shown run is
 *     PINNED: a newer run does not replace it and nothing under the surface unmounts;
 *   · a surface opened on the SHOWN run makes the pin sticky: when it closes and a newer run exists,
 *     the workbench stays where the work was done and says «newer run ready · show ›»;
 *   · a surface on another run (a history tile, the viewer opened elsewhere) only HOLDS the workbench
 *     while it is open — the history row it stands in must not turn into «on the bench» under it;
 *   · «show ›», this tab's GENERATE and archiving the pinned run let go — an archival OBSERVED on a
 *     read that contains the run (27.09, D-49): newer rows pushing it off the band's first page are
 *     not archival, and from then on the workbench reads it by id (`useRunById`).
 *
 * A STORE, NOT A PROP: the writers are the tiles of two hosts (the workbench and the history — both
 * draw `RunTile`), the two split modals and this tab's GENERATE (`useStartRun`); the readers are the
 * workbench and the history, which stand in different blocks of the step. And a store is written
 * SYNCHRONOUSLY from the click that opens a surface, so the pin exists before any band read can
 * re-render the workbench — an effect would leave that window open.
 *
 * Per card: `StudioTab` keeps its blocks mounted across a card switch, and a pin of one card must never
 * hold the workbench of another.
 */

export type BenchPin = {
  runId: number;
  /** Outlives its surfaces: the work was done on the shown run, and it stays in view afterwards. */
  sticky: boolean;
};

export type BenchState = {
  /** The run the workbench shows now; 0 — none, or the workbench is not mounted. */
  shown: number;
  pin: BenchPin | null;
  /** Open run-scoped surfaces anywhere on the step: key → the run the surface works on. */
  surfaces: ReadonlyMap<string, number>;
};

const EMPTY: BenchState = { shown: 0, pin: null, surfaces: new Map() };
const cards = new Map<number, BenchState>();
const listeners = new Set<() => void>();

function read(card: number): BenchState {
  return cards.get(card) ?? EMPTY;
}

function write(card: number, next: BenchState) {
  if (!next.shown && !next.pin && next.surfaces.size === 0) cards.delete(card);
  else cards.set(card, next);
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** The whole state of one card — the workbench reads it. */
export function useBench(card: number): BenchState {
  return useSyncExternalStore(
    subscribe,
    () => read(card),
    () => EMPTY,
  );
}

/** Only the run on the workbench — the history reads this, and re-renders only when it changes. */
export function useBenchRun(card: number): number {
  return useSyncExternalStore(
    subscribe,
    () => read(card).shown,
    () => 0,
  );
}

/** The workbench says which run it shows (after its commit; 0 when it leaves). */
export function publishShown(card: number, runId: number) {
  const s = read(card);
  if (s.shown === runId) return;
  write(card, { ...s, shown: runId });
}

/**
 * A surface opened on `runId` — called from the click that opens it. On the shown run it pins that run
 * sticky; on any other run it holds the shown run for as long as the surface is open.
 */
export function openSurface(card: number, key: string, runId: number) {
  if (!card) return;
  const s = read(card);
  const surfaces = new Map(s.surfaces).set(key, runId);
  let pin = s.pin;
  if (!pin && s.shown) pin = { runId: s.shown, sticky: runId === s.shown };
  else if (pin && !pin.sticky && runId === pin.runId) pin = { ...pin, sticky: true };
  write(card, { ...s, surfaces, pin });
}

/** The surface is gone — closed, or its host unmounted under it. Idempotent. */
export function closeSurface(card: number, key: string) {
  const s = read(card);
  if (!s.surfaces.has(key)) return;
  const surfaces = new Map(s.surfaces);
  surfaces.delete(key);
  write(card, { ...s, surfaces });
}

/**
 * Pin the shown run: sticky — the zoom opened from the workbench itself; not sticky — the viewer
 * opened elsewhere and only holds it. Never downgrades a sticky pin.
 */
export function pinShown(card: number, sticky: boolean) {
  const s = read(card);
  if (!s.shown) return;
  if (s.pin && (s.pin.sticky || !sticky)) return;
  write(card, { ...s, pin: { runId: s.pin?.runId ?? s.shown, sticky } });
}

/** Follow the newest again — «show ›», the pinned run archived, the workbench gone. */
export function releasePin(card: number) {
  const s = read(card);
  if (!s.pin) return;
  write(card, { ...s, pin: null });
}

/**
 * This tab's GENERATE filed a flat run: the workbench goes to it. Not a release — the answer can
 * arrive after a surface was opened, and an open surface keeps its run until it closes; from then on
 * nothing keeps the pin.
 */
export function unstickPin(card: number) {
  const s = read(card);
  if (!s.pin?.sticky) return;
  write(card, { ...s, pin: { ...s.pin, sticky: false } });
}

/* ═══ WHICH RUN THE PERSON PUT ON THE BENCH (03.10, owner item 9) ════════════════════════════════
 *
 * Owner: the history is a grid of each run's pictures with one «put on bench» per run, and a click on
 * any tile sends that run to the bench (LATEST GENERATION). So the workbench no longer follows only
 * the newest run: it shows, in this order, the PINNED run (a surface is open on it), the run the
 * person PUT on the bench, and the newest flat run. The choice is per card and survives a reload
 * (browser storage, every access guarded: a private window or blocked storage just forgets it).
 * This tab's GENERATE, «show ›», archiving the chosen run, or the choice becoming the newest run
 * anyway let it go — from then on the bench follows the newest again.
 */

const CHOICE_KEY = (card: number) => `grbpwr.design.bench.flat.${card}`;
/** card → chosen run id; a card read once from storage is cached here (0 = no choice). */
const choices = new Map<number, number>();

function storedChoice(card: number): number {
  try {
    const raw = window.localStorage.getItem(CHOICE_KEY(card));
    const id = raw ? Number(raw) : 0;
    return Number.isInteger(id) && id > 0 ? id : 0;
  } catch {
    return 0;
  }
}

/** The chosen run of a card, outside React (the store's own reads, and the probe). */
export function readBenchChoice(card: number): number {
  return readChoice(card);
}

function readChoice(card: number): number {
  if (!card) return 0;
  let id = choices.get(card);
  if (id === undefined) {
    id = storedChoice(card);
    choices.set(card, id);
  }
  return id;
}

function writeChoice(card: number, runId: number) {
  if (!card || readChoice(card) === runId) return;
  choices.set(card, runId);
  try {
    if (runId > 0) window.localStorage.setItem(CHOICE_KEY(card), String(runId));
    else window.localStorage.removeItem(CHOICE_KEY(card));
  } catch {
    // Storage refused: the choice still holds for this page.
  }
  listeners.forEach((listener) => listener());
}

/** The run the person put on this card's bench; 0 — none, the bench follows the newest. */
export function useBenchChoice(card: number): number {
  return useSyncExternalStore(
    subscribe,
    () => readChoice(card),
    () => 0,
  );
}

/**
 * «put on bench» from the history: the workbench shows `runId` from now on. A pin some earlier work
 * left goes — the person asked for this run — but an open surface keeps the run it works on until it
 * closes (`openSurface` pins again on the next one).
 */
export function putOnBench(card: number, runId: number) {
  if (!card || runId <= 0) return;
  const s = read(card);
  if (s.pin && s.surfaces.size === 0) write(card, { ...s, pin: null });
  writeChoice(card, runId);
}

/** Forget the choice — the bench follows the newest flat run again. */
export function clearBenchChoice(card: number) {
  writeChoice(card, 0);
}

/**
 * WHICH RUN THE WORKBENCH HOLDS ON TO, before the newest: the pinned run, else the chosen one; 0 —
 * none, it shows the newest. A choice equal to the newest holds nothing it would not show anyway.
 */
export function heldRunId(pin: BenchPin | null, chosen: number, newestId: number): number {
  if (pin) return pin.runId;
  return chosen > 0 && chosen !== newestId ? chosen : 0;
}
