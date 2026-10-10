// THE REVIEW'S ROWS — one list out of three sources (03-SEAMS-DESIGN §5.2 zone 3):
//
//   stored rows (server + optimistic)  → CONFIRMED / REJECTED, or STALE / ORPHAN by the resolver's
//                                         verdict on the read the graph came from;
//   the engine's own chosen seams       → TO DECIDE, unless a stored row already speaks for the same
//                                         two runs (a stale row too: it is re-confirmed, not re-read);
//   a forced seam whose row was undone  → TO DECIDE again until the graph is re-read.
//
// Numbers are stable across decisions: they follow the sheet (piece order, then edge order), not
// the rail, so a seam keeps its number while it moves from TO DECIDE to CONFIRMED.

import { edgeIdsOf } from 'lib/assembly-skeleton/geometry';
import { confidenceWord, type ConfidenceWord } from 'lib/assembly-skeleton/map';
import type { EdgeId, SeamCandidate, SeamGraph } from 'lib/assembly-skeleton/types';
import type { AppliedRow, OrphanRow, Resolved, StaleRow, StoredSeam } from 'lib/seams';
import type { PendingOp } from './seams-store';
import { pieceOf } from './words';

export type SeamGroup = 'decide' | 'confirmed' | 'rejected' | 'stale' | 'orphan';
export const GROUPS: readonly SeamGroup[] = ['decide', 'confirmed', 'rejected', 'stale', 'orphan'];

export type ReviewItem = {
  /** `p:<a>~<b>` for an engine proposal, `s:<seamKey>` for a stored row. */
  id: string;
  group: SeamGroup;
  /** Display number, 1-based — the same on the sheet and in the rail. */
  n: number;
  /** Plain edge ids of each side, walk order. */
  a: EdgeId[];
  b: EdgeId[];
  /** The engine's reading (a proposal), or what a stored row resolved to today. */
  candidate?: SeamCandidate;
  row?: StoredSeam;
  stale?: StaleRow;
  orphan?: OrphanRow;
  applied?: AppliedRow;
  /** Proposals only: sure / likely / check. */
  word?: ConfidenceWord;
  /** A write of this row is in flight. */
  pending: boolean;
  /** The server refused the last write of this row: its words. */
  error?: string;
  /** Other stored rows of the very same pair (two clients confirmed it): shown as this one. */
  dupes?: StoredSeam[];
  /** The two plies of one ply pair sewn to each other (a double yoke, collar plies): its keys. */
  plies?: string[];
  /** One side runs through a ply pair (sewn between both plies): the pair's keys. */
  through?: string[];
};

export type Review = {
  items: ReviewItem[];
  byId: Map<string, ReviewItem>;
  counts: Record<SeamGroup, number>;
  /** Confirmed rows (closures included). */
  decided: number;
  /** confirmed + to decide + stale (rejected and orphan rows are not seams to sew). */
  total: number;
  /** Proposals «accept all sure» takes: sure and unambiguous. */
  sure: ReviewItem[];
};

export const sideOfCandidate = (c: SeamCandidate, side: 'a' | 'b'): EdgeId[] =>
  (side === 'a' ? c.aParts ?? [c.a] : c.bParts ?? [c.b]).flatMap(edgeIdsOf);

const sideOfAnchors = (row: StoredSeam, side: 'a' | 'b'): EdgeId[] =>
  (side === 'a' ? row.sideA : row.sideB).flatMap((x) => (x.edgeHint ? edgeIdsOf(x.edgeHint) : []));

const meets = (x: readonly EdgeId[], y: readonly EdgeId[]) => x.some((e) => y.includes(e));
/** The two pairs stand for the same seam: each side meets one side of the other, either way round. */
const samePair = (a1: EdgeId[], b1: EdgeId[], a2: EdgeId[], b2: EdgeId[]) =>
  (meets(a1, a2) && meets(b1, b2)) || (meets(a1, b2) && meets(b1, a2));

export const pairId = (c: SeamCandidate) => {
  const a = sideOfCandidate(c, 'a').join('+');
  const b = sideOfCandidate(c, 'b').join('+');
  return `p:${a < b ? `${a}~${b}` : `${b}~${a}`}`;
};

/**
 * Ply pairs of the graph (identical twins: congruent layers of one cloth) and an edge mapper that
 * reads a follower ply's edge as the lead ply's edge at the same place — the pair is ONE piece for
 * the review: a row on either ply is the same seam.
 */
export function plyPairsOf(graph: SeamGraph) {
  const byKey = new Map(graph.pieces.map((p) => [p.pieceKey, p]));
  const groupOf = new Map<string, string[]>();
  for (const p of graph.pieces) {
    const mates = p.twinOf.filter((t) => t.kind === 'identical').map((t) => t.key);
    if (!mates.length) continue;
    groupOf.set(p.pieceKey, [p.pieceKey, ...mates].sort());
  }
  const canon = (id: EdgeId): EdgeId => {
    const k = pieceOf(id);
    const g = groupOf.get(k);
    if (!g || g[0] === k) return id;
    const from = byKey.get(k)?.edges.find((e) => e.id === id);
    const to = byKey.get(g[0])?.edges.find((e) => e.k === from?.k);
    if (!from || !to || Math.abs(from.lenMm - to.lenMm) > Math.max(3, 0.02 * from.lenMm)) return id;
    return to.id;
  };
  return { groupOf, canon };
}

export function buildReview(
  graph: SeamGraph,
  rows: readonly StoredSeam[],
  resolved: Resolved | null,
  pending: Readonly<Record<string, PendingOp>>,
  errors: Readonly<Record<string, string>>,
): Review {
  const items: ReviewItem[] = [];
  const rowKeys = new Set(rows.map((r) => r.seamKey));

  for (const row of rows) {
    const key = row.seamKey;
    const isPending = !!pending[key];
    // An optimistic row has not been resolved yet: its own words and its own hints stand.
    const applied = isPending ? undefined : resolved?.applied.find((x) => x.seam.seamKey === key);
    const stale = isPending ? undefined : resolved?.stale.find((x) => x.seam.seamKey === key);
    const orphan = isPending ? undefined : resolved?.orphan.find((x) => x.seam.seamKey === key);
    const group: SeamGroup = orphan
      ? 'orphan'
      : stale || (!isPending && row.stale)
        ? 'stale'
        : row.status === 'confirmed'
          ? 'confirmed'
          : 'rejected';
    items.push({
      id: `s:${key}`,
      group,
      n: 0,
      a: applied ? applied.a.flatMap((h) => h.edges) : sideOfAnchors(row, 'a'),
      b: applied ? applied.b.flatMap((h) => h.edges) : sideOfAnchors(row, 'b'),
      ...(applied?.candidate ? { candidate: applied.candidate } : {}),
      row,
      ...(applied ? { applied } : {}),
      ...(stale ? { stale } : {}),
      ...(orphan ? { orphan } : {}),
      pending: isPending,
      ...(errors[key] ? { error: errors[key] } : {}),
    });
  }

  // Ply pairs: one piece for the review. The same pair stored twice (two clients, two keys — or one
  // row on each ply) is ONE row: the first, carrying the others as `dupes`.
  const { groupOf, canon } = plyPairsOf(graph);
  const canonSide = (ids: readonly EdgeId[]) => [...new Set(ids.map(canon))].sort();
  const sigOf = (it: ReviewItem) =>
    `${it.group}|${[canonSide(it.a).join('+'), canonSide(it.b).join('+')].sort().join('~')}`;
  const firstOf = new Map<string, ReviewItem>();
  for (const it of items.slice()) {
    if (it.group !== 'confirmed' && it.group !== 'rejected') continue;
    if (!it.a.length || !it.b.length) continue;
    const sig = sigOf(it);
    const first = firstOf.get(sig);
    if (!first) {
      firstOf.set(sig, it);
      continue;
    }
    first.dupes = [...(first.dupes ?? []), it.row!];
    items.splice(items.indexOf(it), 1);
  }
  const plyOfSide = (ids: readonly EdgeId[]) => {
    const gs = new Set(ids.map((id) => groupOf.get(pieceOf(id))?.join('+') ?? ''));
    return gs.size === 1 && !gs.has('') ? [...gs][0].split('+') : null;
  };
  const markPlies = (it: ReviewItem) => {
    const ga = plyOfSide(it.a);
    const gb = plyOfSide(it.b);
    if (ga && gb && ga.join('+') === gb.join('+')) it.plies = ga;
    else if (ga && !gb) it.through = ga;
    else if (gb && !ga) it.through = gb;
  };
  items.forEach(markPlies);

  const stored = items.slice();
  const seen = new Set<string>();
  for (const c of graph.chosen) {
    // A forced seam is its row's — unless the row was just undone: then it is a proposal again.
    if (c.provenance && rowKeys.has(c.provenance.seamKey)) continue;
    if (c.kind === 'closure-not-seam') continue;
    const a = sideOfCandidate(c, 'a');
    const b = sideOfCandidate(c, 'b');
    if (a.length === 0 || b.length === 0) continue;
    if (stored.some((s) => samePair(a.map(canon), b.map(canon), s.a.map(canon), s.b.map(canon))))
      continue;
    const id = pairId(c);
    if (seen.has(id)) continue;
    seen.add(id);
    const { provenance: _undone, ...proposal } = c;
    items.push({
      id,
      group: 'decide',
      n: 0,
      a,
      b,
      candidate: proposal,
      word: c.provenance ? 'check' : confidenceWord(c.score),
      pending: false,
      ...(errors[id] ? { error: errors[id] } : {}),
    });
    markPlies(items[items.length - 1]);
  }

  // Stable numbers: by the first piece either side touches (sheet order), then by its edge.
  const order = new Map(graph.pieces.map((p, i) => [p.pieceKey, i]));
  const edgeIdx = new Map<EdgeId, number>();
  for (const p of graph.pieces) p.edges.forEach((e, i) => edgeIdx.set(e.id, i));
  const rank = (it: ReviewItem) => {
    let best = [Infinity, Infinity];
    for (const e of [...it.a, ...it.b]) {
      const r = [order.get(pieceOf(e)) ?? 1e6, edgeIdx.get(e) ?? 1e6];
      if (r[0] < best[0] || (r[0] === best[0] && r[1] < best[1])) best = r;
    }
    return best;
  };
  const ranked = items
    .map((it) => ({ it, r: rank(it) }))
    .sort((x, y) => x.r[0] - y.r[0] || x.r[1] - y.r[1] || (x.it.id < y.it.id ? -1 : 1));
  ranked.forEach(({ it }, i) => (it.n = i + 1));
  const sorted = ranked.map((x) => x.it);

  const counts: Record<SeamGroup, number> = {
    decide: 0,
    confirmed: 0,
    rejected: 0,
    stale: 0,
    orphan: 0,
  };
  for (const it of sorted) counts[it.group] += 1;
  return {
    items: sorted,
    byId: new Map(sorted.map((it) => [it.id, it])),
    counts,
    decided: counts.confirmed,
    total: counts.confirmed + counts.decide + counts.stale,
    sure: sorted.filter(
      (it) =>
        it.group === 'decide' &&
        it.word === 'sure' &&
        !(it.candidate?.ambiguousWith?.length ?? 0) &&
        !it.candidate?.provenance,
    ),
  };
}

/** «18 of 24 seams decided · 3 to decide · 1 stale». */
export function progressWords(r: Review): string {
  const parts = [`${r.decided} of ${r.total} seams decided`];
  if (r.counts.decide) parts.push(`${r.counts.decide} to decide`);
  if (r.counts.stale) parts.push(`${r.counts.stale} stale`);
  if (r.counts.orphan) parts.push(`${r.counts.orphan} orphan`);
  return parts.join(' · ');
}
