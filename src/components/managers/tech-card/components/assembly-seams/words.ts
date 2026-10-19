// SEAMS IN WORDS (03-SEAMS-DESIGN §5.4–§5.5): runs named by the POM role when it is sure («FP L ·
// shoulder»), else by the engine's edge in the piece's words («FP L · edge 3 of 6»); lengths in mm;
// notches counted and matched by position; status words, never a bare score.

import { SKELETON, type EdgeId, type PieceGeom } from 'lib/assembly-skeleton/types';
import type { StoredSeam } from 'lib/seams';

export type RoleWords = ReadonlyMap<EdgeId, string>;

export const pieceOf = (id: EdgeId) => id.slice(0, id.lastIndexOf('#'));
const kOf = (id: EdgeId) => id.slice(id.lastIndexOf('#') + 1);

/** «BP_L» → «BP L»: the card's own name, underscores read as spaces. */
export const pieceWords = (g: PieceGeom | undefined, key: string) =>
  (g?.name || key).replace(/_/g, ' ').trim();

/** Plain edges of a piece (chains are drawn and named by their parts). */
export const plainEdges = (g: PieceGeom) => g.edges.filter((e) => e.kind === 'edge');

/** «edge 3 of 6», «edges 3–4 of 6», or the POM role when it reads every part the same way. */
export function runWords(
  ids: readonly EdgeId[],
  g: PieceGeom | undefined,
  roles?: RoleWords,
  /** Name the edge even when the role reads it — two readings of one role must stay apart. */
  withEdge = false,
) {
  if (!g) return ids.map(kOf).join('+');
  const role = roles && ids.every((id) => roles.get(id) === roles.get(ids[0])) && roles.get(ids[0]);
  if (role && !withEdge) return role;
  const edge = edgeWords(ids, g);
  return role ? `${role} (${edge})` : edge;
}

function edgeWords(ids: readonly EdgeId[], g: PieceGeom): string {
  const plain = plainEdges(g);
  const n = plain.length;
  const pos = ids
    .map((id) => plain.findIndex((e) => e.id === id))
    .filter((i) => i >= 0)
    .sort((a, b) => a - b);
  if (pos.length === 0) return 'an edge';
  if (pos.length === 1) return `edge ${pos[0] + 1} of ${n}`;
  return `edges ${pos[0] + 1}–${pos[pos.length - 1] + 1} of ${n}`;
}

/** One side of a seam: parts grouped by piece, «FP L · shoulder + BP L · edge 2 of 7». */
export function sideWords(
  ids: readonly EdgeId[],
  geoms: ReadonlyMap<string, PieceGeom>,
  roles?: RoleWords,
  withEdge = false,
): string {
  const byPiece = new Map<string, EdgeId[]>();
  for (const id of ids) byPiece.set(pieceOf(id), [...(byPiece.get(pieceOf(id)) ?? []), id]);
  return [...byPiece]
    .map(
      ([k, es]) =>
        `${pieceWords(geoms.get(k), k)} · ${runWords(es, geoms.get(k), roles, withEdge)}`,
    )
    .join(' + ');
}

/** A stored side none of whose runs was found today: the pieces it was anchored on, said so. */
export function lostSideWords(
  pieces: readonly string[],
  geoms: ReadonlyMap<string, PieceGeom>,
): string {
  return [...new Set(pieces)]
    .map((k) => `${pieceWords(geoms.get(k), k)} · edge not found`)
    .join(' + ');
}

export function edgeOf(id: EdgeId, geoms: ReadonlyMap<string, PieceGeom>) {
  return geoms.get(pieceOf(id))?.edges.find((e) => e.id === id);
}

export function sideLen(ids: readonly EdgeId[], geoms: ReadonlyMap<string, PieceGeom>): number {
  return ids.reduce((s, id) => s + (edgeOf(id, geoms)?.lenMm ?? 0), 0);
}

/** «416 = 416 mm», «416 ≈ 418 mm» (within the matcher's own tolerance), «258 onto 262 mm, eased». */
export function lengthWords(a: number, b: number): string {
  const r = (v: number) => String(Math.round(v));
  if (Math.abs(a - b) < 1) return `${r(a)} = ${r(b)} mm`;
  const eq = Math.abs(a - b) <= Math.max(SKELETON.lenAbsMm, SKELETON.lenRel * Math.max(a, b));
  return eq ? `${r(a)} ≈ ${r(b)} mm` : `${r(a)} onto ${r(b)} mm, eased`;
}

/** Δ between the two sides as a share of the longer one, «1.5 %». */
export const deltaPct = (a: number, b: number) =>
  Math.max(a, b) > 0 ? (Math.abs(a - b) / Math.max(a, b)) * 100 : 0;

/** Notches matched along the pair, by position: within this many mm once both sides are laid. */
const NOTCH_TOL_MM = 8;

export type NotchCheck = { a: number; b: number; matched: number };

/**
 * Notches of each side and how many line up when the two are laid together: positions as shares of
 * each side's length; a reversed seam walks side B from its end. Greedy, nearest first.
 */
export function notchCheck(
  sideA: readonly EdgeId[],
  sideB: readonly EdgeId[],
  geoms: ReadonlyMap<string, PieceGeom>,
  direction: StoredSeam['direction'] = 'reversed',
): NotchCheck {
  const shares = (ids: readonly EdgeId[]) => {
    const out: number[] = [];
    let at = 0;
    const total = sideLen(ids, geoms) || 1;
    for (const id of ids) {
      const e = edgeOf(id, geoms);
      if (!e) continue;
      for (const d of e.notchesMm) out.push((at + d) / total);
      at += e.lenMm;
    }
    return { out, total };
  };
  const A = shares(sideA);
  const B = shares(sideB);
  const bs = B.out.map((t) => (direction === 'same' ? t : 1 - t));
  const span = Math.max(A.total, B.total);
  const used = new Set<number>();
  let matched = 0;
  for (const t of A.out) {
    let best = -1;
    let bestD = Infinity;
    bs.forEach((u, i) => {
      const d = Math.abs(u - t) * span;
      if (!used.has(i) && d < bestD) {
        bestD = d;
        best = i;
      }
    });
    if (best >= 0 && bestD <= NOTCH_TOL_MM) {
      used.add(best);
      matched += 1;
    }
  }
  return { a: A.out.length, b: B.out.length, matched };
}

/** «2 of 2 notches match», «0 of 1 notches match», «no notches». */
export function notchWords(n: NotchCheck): string {
  const most = Math.max(n.a, n.b);
  if (most === 0) return 'no notches';
  return `${n.matched} of ${most} ${most === 1 ? 'notch' : 'notches'} match`;
}

export const directionWords = (d: StoredSeam['direction']) =>
  d === 'same' ? 'same way' : d === 'unknown' ? 'direction not set' : 'reversed';

/** «10.10» from an ISO timestamp. */
export function shortDate(iso?: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? '');
  return m ? `${m[3]}.${m[2]}` : '';
}

/** «Anna» from «anna@grbpwr.com», a name as it is otherwise. */
export function whoWords(who?: string): string {
  const w = (who ?? '').trim();
  if (!w) return '';
  const local = w.includes('@') ? w.slice(0, w.indexOf('@')) : w;
  return local.charAt(0).toUpperCase() + local.slice(1);
}

/** «confirmed by Anna · 10.10», «rejected by you · wrong shoulder». */
export function decidedWords(row: StoredSeam, pending: boolean): string {
  const who = pending ? 'you' : whoWords(row.updatedBy || row.createdBy) || 'someone';
  const when = pending ? 'saving…' : shortDate(row.updatedAt || row.createdAt);
  const head =
    row.kind === 'closure'
      ? `closure, not a seam · confirmed by ${who}`
      : row.status === 'rejected'
        ? `rejected by ${who}`
        : row.source === 'manual'
          ? `connected by ${who}`
          : `confirmed by ${who}`;
  return [head, when, row.note.trim()].filter(Boolean).join(' · ');
}
