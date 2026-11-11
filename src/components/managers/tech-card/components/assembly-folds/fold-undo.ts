// UNDO OF A PIECE DELETE BRINGS ITS FOLDS BACK. A card save that drops a piece deletes the piece's
// fold rows and takes their keys off the steps (backend 9028526). Undo puts the piece back with the
// same line key, and its folds would stay gone. So:
//
// - a piece that leaves the form leaves a capture: its fold rows as the store holds them, and the steps
//   that close each of them (by the step's row identity and its number);
// - the piece coming back arms the capture. Once a card read holds the piece again (the server refuses a
//   fold of a piece it does not have), the rows the store lacks are written back, and the links go on
//   their steps, owed in the D5 ledger until a read shows them;
// - a row the store still holds was never deleted (undo before the autosave): nothing is written.
//
// Line keys are minted once (ULIDs), so the same key reappears only through undo / redo. An armed
// capture is kept in this browser too, so a reload between the undo and the write still finishes it.
// Pure logic; use-fold-undo.ts is the glue.

import type { StoredFold } from 'lib/folds';
import type { OwedLink } from '../card-owed';
import { owedFoldLinks } from './fold-links-keep';
import { foldStepBlocked } from './fold-step';
import type { FoldPendingOp } from './folds-store';
import { stepsWithoutFolds } from './use-fold-writes';

const norm = (key: string | null | undefined) => (key ?? '').trim().toUpperCase();

type UndoPiece = { lineKey?: string | null };
type UndoOp = {
  historyKey?: string;
  operationNumber?: number;
  foldKeys?: string[];
  operationType?: string;
  zone?: string;
  inputKeys?: string[];
  outputUnitKey?: string;
};

/**
 * What a step is: its kind, zone, inputs and output. A reloaded page has no identity of the old page's
 * steps (the wire carries none; historyKey is minted per page), and the number is the server's to
 * change. This is all that can find the step again.
 */
const shapeOf = (op: UndoOp) =>
  [
    op.operationType ?? '',
    op.zone ?? '',
    [...new Set((op.inputKeys ?? []).map(norm))].sort().join(','),
    norm(op.outputUnitKey),
  ].join('|');

/** A step that closed a fold: its row identity on this page, its number and what it is. */
type StepRef = { stepKey: string; op: number; shape: string };
export type FoldUndoLink = StepRef & {
  foldKey: string;
  /** Captured on another page: the step is found by what it is, never by its row identity. */
  byShape?: boolean;
};

export type FoldUndoEntry = {
  /** The piece's line key as the form holds it. */
  pieceKey: string;
  rows: StoredFold[];
  links: FoldUndoLink[];
  /** The piece is back in the form: the rows are owed to the server. */
  armed: boolean;
  /** Taken from this browser's storage after a reload; kept until RESUME_TTL_MS. */
  resumed?: boolean;
  /** When the capture was taken or armed, ms. */
  at: number;
};

export type FoldUndoState = {
  cardId: number;
  /** The piece keys last seen in the form (normalised); null before the first look. */
  pieces: string[] | null;
  /** The steps that close each fold key, as last seen in the form. */
  links: Record<string, StepRef[]>;
  /** By normalised piece key. */
  entries: Record<string, FoldUndoEntry>;
};

export const emptyFoldUndo = (cardId: number): FoldUndoState => ({
  cardId,
  pieces: null,
  links: {},
  entries: {},
});

const pieceKeysOf = (pieces: readonly UndoPiece[]) =>
  pieces.map((piece) => norm(piece.lineKey)).filter(Boolean);

function linksOf(ops: readonly UndoOp[]): Record<string, StepRef[]> {
  const out: Record<string, StepRef[]> = {};
  for (const op of ops) {
    for (const key of new Set(op.foldKeys ?? [])) {
      (out[key] ??= []).push({
        stepKey: op.historyKey ?? '',
        op: op.operationNumber ?? 0,
        shape: shapeOf(op),
      });
    }
  }
  return out;
}

/** The form was reset (a card read, a save settling): look again, capture nothing, arm nothing. */
export function foldUndoBaseline(
  state: FoldUndoState,
  pieces: readonly UndoPiece[],
  ops: readonly UndoOp[],
): FoldUndoState {
  return { ...state, pieces: pieceKeysOf(pieces), links: linksOf(ops) };
}

/**
 * The form's pieces or steps changed. A piece that left is captured from the store and from the steps
 * as they were before this change; one that came back arms its capture.
 */
export function foldUndoMoved(
  state: FoldUndoState,
  pieces: readonly UndoPiece[],
  ops: readonly UndoOp[],
  storeRows: readonly StoredFold[],
  now: number,
): FoldUndoState {
  const next = foldUndoBaseline(state, pieces, ops);
  if (state.pieces === null) return next;
  const before = new Set(state.pieces);
  const after = new Set(next.pieces);
  let entries = state.entries;
  const put = (key: string, entry: FoldUndoEntry | null) => {
    entries = { ...entries };
    if (entry) entries[key] = entry;
    else delete entries[key];
  };

  for (const key of before) {
    if (after.has(key)) continue;
    const prev = entries[key];
    const held = new Set(storeRows.map((row) => row.foldKey));
    // A row the store no longer holds was deleted with an earlier save of this delete: carried on.
    const rows = [
      ...storeRows.filter((row) => norm(row.pieceKey) === key),
      ...(prev?.rows ?? []).filter((row) => !held.has(row.foldKey)),
    ];
    if (!rows.length) {
      if (prev) put(key, null);
      continue;
    }
    const links = rows.flatMap((row): FoldUndoLink[] => {
      const seen = state.links[row.foldKey];
      if (seen?.length) return seen.map((ref) => ({ ...ref, foldKey: row.foldKey }));
      return (prev?.links ?? []).filter((link) => link.foldKey === row.foldKey);
    });
    const pieceKey =
      prev?.pieceKey ?? rows.find((row) => norm(row.pieceKey) === key)?.pieceKey ?? key;
    put(key, { pieceKey, rows, links, armed: false, at: now });
  }

  for (const key of after) {
    const entry = entries[key];
    if (!before.has(key) && entry && !entry.armed) put(key, { ...entry, armed: true, at: now });
  }

  return entries === state.entries ? next : { ...next, entries };
}

export function dropFoldUndo(state: FoldUndoState, keys: readonly string[]): FoldUndoState {
  if (!keys.some((key) => state.entries[key])) return state;
  const entries = { ...state.entries };
  for (const key of keys) delete entries[key];
  return { ...state, entries };
}

export type FoldUndoWorld = {
  formPieces: readonly UndoPiece[];
  /** The pieces of the last card read; null while there is none. */
  readPieces: readonly UndoPiece[] | null;
  /** The store's rows with the pending writes laid over them. */
  rows: readonly StoredFold[];
  pending: Readonly<Record<string, FoldPendingOp>>;
  /** A card save is on the wire. */
  saving: boolean;
  /**
   * The autosave rests (saved / idle / off). Right after an undo the card read on screen may still be
   * the one from before the delete's save; the undo's own unsaved change says so.
   */
  settled: boolean;
  now: number;
  /** Captures whose write is already out. */
  busy?: ReadonlySet<string>;
};

export type FoldUndoPlan = {
  /** The rows to write back, in one call. */
  upsert: StoredFold[];
  /** The captures that write carries. */
  writing: string[];
  /** Captures with nothing left to write: every row is stored. */
  done: string[];
  /** Resumed captures past their time: nobody's undo any more. */
  drop: string[];
};

export function planFoldUndo(state: FoldUndoState, world: FoldUndoWorld): FoldUndoPlan {
  const plan: FoldUndoPlan = { upsert: [], writing: [], done: [], drop: [] };
  const inForm = new Set(pieceKeysOf(world.formPieces));
  const inRead = world.readPieces ? new Set(pieceKeysOf(world.readPieces)) : null;
  const held = new Set(world.rows.map((row) => row.foldKey));
  for (const [key, entry] of Object.entries(state.entries)) {
    if (!entry.armed || world.busy?.has(key)) continue;
    // A read without the piece proves nothing: the reloaded page may have read the card before the
    // undo's save committed. Line keys are ULIDs, so this fires only if that very piece comes back.
    if (entry.resumed && world.now - entry.at > RESUME_TTL_MS) {
      plan.drop.push(key);
      continue;
    }
    if (!inForm.has(key) || !inRead?.has(key)) continue;
    if (entry.rows.some((row) => world.pending[row.foldKey])) continue;
    const missing = entry.rows.filter((row) => !held.has(row.foldKey));
    if (!missing.length) {
      if (world.settled) plan.done.push(key);
    } else if (!world.saving) {
      plan.upsert.push(...missing);
      plan.writing.push(key);
    }
  }
  return plan;
}

/** The step a link goes back on, or -1: by row identity on this page, by what it is after a reload. */
function stepOfLink(work: readonly UndoOp[], link: FoldUndoLink): number {
  if (!link.byShape)
    return work.findIndex((op) => !!link.stepKey && op.historyKey === link.stepKey);
  // The number is never trusted: a generated step inserted before it renumbers everything after.
  // Exactly one step must be what the old one was; two alike, or none, and the link is dropped.
  const alike = work.flatMap((op, index) =>
    link.shape && shapeOf(op) === link.shape ? [index] : [],
  );
  return alike.length === 1 ? alike[0] : -1;
}

/**
 * The step links of captures whose rows are stored again. A link goes back on the step it was on,
 * unless that step is gone (or, after a reload, cannot be told for sure), the fold is already on a
 * step, or the fold order would break; each one put back is owed by the step's current number.
 */
export function undoLinkWrites(
  entries: readonly (FoldUndoEntry | undefined)[],
  ops: readonly UndoOp[],
  rows: readonly StoredFold[],
  now: number,
): { attach: { index: number; key: string }[]; owed: OwedLink[] } {
  const out = { attach: [] as { index: number; key: string }[], owed: [] as OwedLink[] };
  const work = ops.map((op) => ({ ...op, foldKeys: [...(op.foldKeys ?? [])] }));
  const onStep = (key: string) => work.some((op) => op.foldKeys.includes(key));
  for (const entry of entries) {
    if (!entry) continue;
    const pieceRows = rows.filter((row) => norm(row.pieceKey) === norm(entry.pieceKey));
    const seen = new Set<string>();
    for (const link of entry.links) {
      const key = link.foldKey;
      if (seen.has(key) || !rows.some((row) => row.foldKey === key) || onStep(key)) continue;
      seen.add(key);
      const index = stepOfLink(work, link);
      if (index < 0 || foldStepBlocked(work, pieceRows, key, index)) continue;
      work[index].foldKeys.push(key);
      out.attach.push({ index, key });
      out.owed.push(...owedFoldLinks(work, [key], index, now));
    }
  }
  return out;
}

/**
 * A step the undo brought back may still name a fold the server deleted; the next save would be refused
 * for it, and the piece would never land. Such keys leave the steps now and come back with their rows.
 */
export function foldUndoScrub(
  state: FoldUndoState,
  ops: readonly UndoOp[],
  rows: readonly StoredFold[],
): { index: number; foldKeys: string[] }[] {
  const held = new Set(rows.map((row) => row.foldKey));
  const gone = Object.values(state.entries)
    .filter((entry) => entry.armed)
    .flatMap((entry) => entry.rows.map((row) => row.foldKey))
    .filter((key) => !held.has(key));
  return gone.length ? stepsWithoutFolds(ops, gone) : [];
}

// ── this browser's copy of the armed captures ─────────────────────────────────────────────────

const storageKey = (cardId: number) => `tech-card-fold-undo:${cardId}`;

/** An armed capture older than this is nobody's undo any more. */
const RESUME_TTL_MS = 60 * 60_000;

export function saveFoldUndo(cardId: number, entries: Record<string, FoldUndoEntry>): void {
  const armed = Object.values(entries).filter((entry) => entry.armed);
  try {
    if (armed.length) localStorage.setItem(storageKey(cardId), JSON.stringify(armed));
    else localStorage.removeItem(storageKey(cardId));
  } catch {
    /* storage unavailable: the capture lives as long as the page */
  }
}

export function loadFoldUndo(cardId: number, now: number): Record<string, FoldUndoEntry> {
  let raw: unknown;
  try {
    raw = JSON.parse(localStorage.getItem(storageKey(cardId)) ?? '[]');
  } catch {
    return {};
  }
  const out: Record<string, FoldUndoEntry> = {};
  for (const entry of Array.isArray(raw) ? (raw as FoldUndoEntry[]) : []) {
    const key = norm(entry?.pieceKey);
    if (!key || !Array.isArray(entry.rows) || !entry.rows.length) continue;
    if (!(now - entry.at <= RESUME_TTL_MS)) continue;
    out[key] = {
      pieceKey: entry.pieceKey,
      rows: entry.rows,
      links: (Array.isArray(entry.links) ? entry.links : []).map((link) => ({
        ...link,
        byShape: true,
      })),
      armed: true,
      resumed: true,
      at: entry.at,
    };
  }
  return out;
}
