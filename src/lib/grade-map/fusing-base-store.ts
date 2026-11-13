// The current base contours of a card's pieces, as the last parse of its main pattern file saw them.
//
// Published by the patterns panel (it parses the card's DXFs for the nesting / fusing screens) and
// read by (1) the save, which sends the fusing markup key of a piece whose markup changed, and
// (2) any screen that wants the «markup is stale» flag. Data only — no UI here.

import { useMemo, useSyncExternalStore } from 'react';

import {
  fusingBaseKeyOf,
  fusingMarkupStale,
  type FusingBaseKey,
  type FusingMarkupPiece,
  type FusingMarkupStale,
} from './fusing-base';
import type { SigPt } from './signature';

/** One piece's current base: the size, its cut contour (mm) and the key it makes. */
export type CurrentFusingBase = { baseSizeId: number; contour: SigPt[]; key: FusingBaseKey };

/** Piece line key (lower-cased) → its current base. */
export type CurrentFusingBases = ReadonlyMap<string, CurrentFusingBase>;

const EMPTY: CurrentFusingBases = new Map();
const byCard = new Map<number, CurrentFusingBases>();
const listeners = new Set<() => void>();

const cardKey = (techCardId: number | null | undefined) => techCardId || 0;
const pieceKey = (lineKey: string) => lineKey.trim().toLowerCase();

/** Build the map from (line key, base size, contour) rows; rows with no usable key are left out. */
export function currentFusingBases(
  rows: Iterable<{ pieceLineKey: string; baseSizeId: number; contour: SigPt[] }>,
): CurrentFusingBases {
  const out = new Map<string, CurrentFusingBase>();
  for (const row of rows) {
    const k = pieceKey(row.pieceLineKey);
    if (!k || out.has(k)) continue;
    const key = fusingBaseKeyOf(row.baseSizeId, row.contour);
    if (key) out.set(k, { baseSizeId: row.baseSizeId, contour: row.contour, key });
  }
  return out;
}

function sameBases(a: CurrentFusingBases, b: CurrentFusingBases): boolean {
  if (a.size !== b.size) return false;
  for (const [k, v] of a) {
    const w = b.get(k);
    if (!w || w.key.baseSizeId !== v.key.baseSizeId) return false;
    if (w.key.contourSignature !== v.key.contourSignature) return false;
  }
  return true;
}

/** Publish a card's current bases (a re-publish of the same keys notifies nobody). */
export function publishFusingBases(
  techCardId: number | null | undefined,
  bases: CurrentFusingBases,
): void {
  const id = cardKey(techCardId);
  const prev = byCard.get(id) ?? EMPTY;
  if (sameBases(prev, bases)) return;
  byCard.set(id, bases);
  for (const l of [...listeners]) l();
}

/** A card's current bases (empty until a parse published them). */
export function getFusingBases(techCardId: number | null | undefined): CurrentFusingBases {
  return byCard.get(cardKey(techCardId)) ?? EMPTY;
}

export function subscribeFusingBases(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The save's resolver: piece line key → the key to send, or null when the contour is not known. */
export function fusingBaseResolver(
  techCardId: number | null | undefined,
): (pieceLineKey: string) => FusingBaseKey | null {
  const bases = getFusingBases(techCardId);
  return (lineKey) => bases.get(pieceKey(lineKey))?.key ?? null;
}

/**
 * SELECTOR — the stale flag of every piece with a line key: line key (lower-cased) → result.
 * A piece the current file does not show reads «not stale» unless it has no key at all.
 */
export function fusingMarkupStaleByPiece(
  pieces: ReadonlyArray<FusingMarkupPiece & { lineKey?: string }>,
  bases: CurrentFusingBases,
): Map<string, FusingMarkupStale> {
  const out = new Map<string, FusingMarkupStale>();
  for (const p of pieces) {
    const k = pieceKey(p.lineKey ?? '');
    if (!k) continue;
    const base = bases.get(k);
    out.set(k, fusingMarkupStale(p, base?.contour ?? null, base?.baseSizeId ?? null));
  }
  return out;
}

/** Hook form of the selector for a screen that holds the card's pieces. */
export function useFusingMarkupStale(
  techCardId: number | null | undefined,
  pieces: ReadonlyArray<FusingMarkupPiece & { lineKey?: string }>,
): Map<string, FusingMarkupStale> {
  const read = () => getFusingBases(techCardId);
  const bases = useSyncExternalStore(subscribeFusingBases, read, read);
  return useMemo(() => fusingMarkupStaleByPiece(pieces, bases), [pieces, bases]);
}
