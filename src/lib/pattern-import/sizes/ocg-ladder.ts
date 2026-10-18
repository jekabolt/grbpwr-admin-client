// SIZESOCG (owner 16.10, kombinezon = card 49): a size LAYER (OCG) that holds a whole ladder of
// other sizes' lines. Kombinezon draws the waistband's eight nested size outlines — each in its own
// size's dash, exactly the dash every other piece uses for that size — all on layer "6", together
// with their notch circles. The layer read put the whole ladder into size 6: hovering 6 on the
// sizes step lit every strip, hovering 8 lit nothing of it.
//
// Two evidences move a line off its layer (D3):
//   1 its LOOK (declared dash) is another size layer's own look, and that look names exactly one
//     size layer;
//   2 its NESTING place agrees: within one layer, a nest of closed outlines (each inside the next)
//     whose looks, read from the inside out, rise strictly with the sizes they name.
// A nest drawn in ≥ 3 OTHER size layers' own looks is a misfiled ladder — there the layer is not
// size evidence at all. A member whose look contradicts its place (kombinezon's 7th outline is
// drawn in 8's dash) takes its place only by elimination: the nest holds one outline per size,
// every other size of it is proven by look + nesting, and the one free size lies between its
// neighbours. Anything else stays as read.
//
// The ladder's marks follow their outline (`ladderMarkMoves`): a small closed mark of the ladder's
// layer that exactly one member's line runs through (near its centre — the size's own end, not a
// side every size shares), when the marks repeat one alike per outline over ≥ 3 of them (a graded
// series) — position + series.

import type { Chain, PtMm, Style, StyleId } from '../types';
import { segNearest } from '../chains/geom';
import { normDash } from '../chains/link';

/** A look is a layer's when it is that layer's longest look over chains ≥ this long, mm. */
const LOOK_MIN_MM = 20;
/** Closed outlines this big (box area, mm²) take part in a nest. */
const NEST_MIN_AREA = 1000;
/** Box containment slack, mm (nested size outlines share edges). */
const NEST_TOL_MM = 0.5;
/** Each next outline of a nest reaches past the last by at least this somewhere, mm. */
const NEST_STEP_MM = 1;
/** A misfiled ladder: members in at least this many OTHER size layers' own looks. */
const LADDER_MIN = 3;
/** Two declared dashes are one look within this (mm, or this share of the value). */
const DASH_TOL_MM = 0.05;
const DASH_TOL_REL = 0.03;

type Box = { minX: number; minY: number; maxX: number; maxY: number };
const boxOf = (pts: readonly PtMm[]): Box => {
  const b = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  for (const p of pts) {
    b.minX = Math.min(b.minX, p.x);
    b.minY = Math.min(b.minY, p.y);
    b.maxX = Math.max(b.maxX, p.x);
    b.maxY = Math.max(b.maxY, p.y);
  }
  return b;
};
/** `a` holds `b`: contains it (shared edges allowed) and reaches past it by NEST_STEP_MM somewhere. */
const holds = (a: Box, b: Box) =>
  b.minX >= a.minX - NEST_TOL_MM &&
  b.minY >= a.minY - NEST_TOL_MM &&
  b.maxX <= a.maxX + NEST_TOL_MM &&
  b.maxY <= a.maxY + NEST_TOL_MM &&
  Math.max(b.minX - a.minX, b.minY - a.minY, a.maxX - b.maxX, a.maxY - b.maxY) >= NEST_STEP_MM;
const areaOfBox = (b: Box) => (b.maxX - b.minX) * (b.maxY - b.minY);

/** A look: the normalised declared dash (null = solid) and the pen width. */
type Look = { dash: number[] | null; w: number };
const lookOf = (s: Style | undefined): Look => {
  const d = s?.dash && s.dash.some((v) => v > 0.01) ? normDash(s.dash) : null;
  return { dash: d && d.length ? d : null, w: s?.widthMm ?? 0 };
};
const sameLook = (a: Look, b: Look) => {
  if (!a.dash || !b.dash) return !a.dash && !b.dash && Math.abs(a.w - b.w) <= 0.03;
  if (a.dash.length !== b.dash.length) return false;
  return a.dash.every(
    (v, k) =>
      Math.abs(v - b.dash![k]) <= Math.max(DASH_TOL_MM, DASH_TOL_REL * Math.max(v, b.dash![k])),
  );
};

export type OcgLookMove = {
  chain: number;
  /** rank the layer gave */
  from: number;
  /** rank the look + nesting (or nesting + elimination) give */
  to: number;
  by: 'look' | 'elimination';
};

export type OcgLadder = {
  /** the layer (unit) the ladder sits on */
  unit: number;
  /** the nest, inside out */
  members: number[];
  /** rank per member (-1 = left as read) */
  ranks: number[];
  /** how many other size layers' own looks the nest is drawn in */
  foreignLooks: number;
};

/**
 * `unit[c]` = the chain's size layer (index into `unitRank`), `unitRank[u]` = that layer's rank.
 * Returns the moves (chain → rank) and the ladders found.
 */
export function ocgLookMoves(
  chains: readonly Chain[],
  cand: readonly boolean[],
  unit: readonly number[],
  unitRank: readonly number[],
  styles: ReadonlyMap<StyleId, Style>,
): { moves: OcgLookMove[]; ladders: OcgLadder[] } {
  const moves: OcgLookMove[] = [];
  const ladders: OcgLadder[] = [];
  // per layer: its closed outlines, grown into nests (geometry only)
  const byUnit = new Map<number, { i: number; box: Box }[]>();
  chains.forEach((c, i) => {
    if (!cand[i] || !c.closed || unit[i] < 0 || unitRank[unit[i]] < 0) return;
    const box = boxOf(c.pts);
    if (areaOfBox(box) < NEST_MIN_AREA) return;
    byUnit.set(unit[i], [...(byUnit.get(unit[i]) ?? []), { i, box }]);
  });
  const nests: { u: number; nest: { i: number; box: Box }[] }[] = [];
  for (const [u, list] of byUnit) {
    list.sort((a, b) => areaOfBox(a.box) - areaOfBox(b.box));
    const used = new Set<number>();
    for (let s = 0; s < list.length; s++) {
      if (used.has(s)) continue;
      // grow a nest outward from the smallest unused outline: each next member holds the last and
      // reaches past it (coextensive outlines are no nesting evidence: their order would be the
      // file's drawing order)
      const nest = [list[s]];
      used.add(s);
      for (let t = s + 1; t < list.length; t++)
        if (!used.has(t) && holds(list[t].box, nest[nest.length - 1].box)) {
          nest.push(list[t]);
          used.add(t);
        }
      if (nest.length >= LADDER_MIN + 1) nests.push({ u, nest });
    }
  }
  if (!nests.length) return { moves, ladders };
  // each size layer's own look: its longest look over its long chains — the candidate nests left
  // out (a misfiled ladder that dominates its layer must not make a foreign look the layer's own)
  const inNest = new Set(nests.flatMap((x) => x.nest.map((m) => m.i)));
  const lookLen = new Map<number, { look: Look; len: number }[]>();
  chains.forEach((c, i) => {
    if (!cand[i] || unit[i] < 0 || unitRank[unit[i]] < 0 || c.lengthMm < LOOK_MIN_MM) return;
    if (inNest.has(i)) return;
    const lk = lookOf(styles.get(c.style));
    const list = lookLen.get(unit[i]) ?? [];
    const e = list.find((x) => sameLook(x.look, lk));
    if (e) e.len += c.lengthMm;
    else list.push({ look: lk, len: c.lengthMm });
    lookLen.set(unit[i], list);
  });
  const own = new Map<number, Look>();
  for (const [u, list] of lookLen) own.set(u, list.slice().sort((a, b) => b.len - a.len)[0].look);
  /** the one size layer whose own look this is (null: none, or several share it) */
  const named = (lk: Look): number | null => {
    const us = [...own].filter(([, o]) => sameLook(o, lk)).map(([u]) => u);
    return us.length === 1 ? us[0] : null;
  };
  const nRanks = unitRank.filter((r) => r >= 0).length;
  for (const { u, nest } of nests) {
    const ownU = own.get(u);
    // the rank each member's look names (the layer's own look = the layer's rank)
    const lookRank = nest.map(({ i }) => {
      const lk = lookOf(styles.get(chains[i].style));
      if (ownU && sameLook(lk, ownU)) return unitRank[u];
      const v = named(lk);
      return v != null && v !== u ? unitRank[v] : -1;
    });
    const foreign = new Set(lookRank.filter((r) => r >= 0 && r !== unitRank[u]));
    if (foreign.size < LADDER_MIN) continue;
    // the longest strictly rising run of named ranks, inside out: those are proven twice
    const k = nest.length;
    const best: number[] = new Array(k).fill(0);
    const prev: number[] = new Array(k).fill(-1);
    for (let a = 0; a < k; a++) {
      if (lookRank[a] < 0) continue;
      best[a] = 1;
      for (let b = 0; b < a; b++)
        if (lookRank[b] >= 0 && lookRank[b] < lookRank[a] && best[b] + 1 > best[a]) {
          best[a] = best[b] + 1;
          prev[a] = b;
        }
    }
    let end = 0;
    for (let a = 1; a < k; a++) if (best[a] > best[end]) end = a;
    const proven = new Set<number>();
    if (best[end] > 0) for (let a = end; a >= 0; a = prev[a]) proven.add(a);
    // the nesting must carry the ladder: at least LADDER_MIN foreign members and most of the nest
    const provenForeign = [...proven].filter((a) => lookRank[a] !== unitRank[u]).length;
    if (provenForeign < LADDER_MIN || proven.size < 0.6 * k) continue;
    const rankAt = new Map<number, number>();
    for (const a of proven) rankAt.set(a, lookRank[a]);
    // a full nest whose proven members sit exactly at their place (member a = rank a): the
    // member at the layer's own place is the layer's own outline (layer + nesting) — also when
    // the layer has no look of its own left outside the nest
    const aligned = k === nRanks && [...proven].every((a) => lookRank[a] === a);
    const at = unitRank[u];
    if (aligned && !rankAt.has(at) && ![...rankAt.values()].includes(at)) rankAt.set(at, at);
    // elimination: one outline per size, the rest placed, exactly one free rank between neighbours
    if (k === nRanks && rankAt.size === k - 1) {
      const a = [...Array(k).keys()].find((x) => !rankAt.has(x))!;
      const taken = new Set(rankAt.values());
      const free = [...Array(nRanks).keys()].filter((r) => !taken.has(r));
      const lo = a > 0 ? rankAt.get(a - 1) ?? -1 : -1;
      const hi = a < k - 1 ? rankAt.get(a + 1) ?? nRanks : nRanks;
      if (free.length === 1 && free[0] > lo && free[0] < hi) {
        rankAt.set(a, free[0]);
        if (free[0] !== unitRank[u])
          moves.push({ chain: nest[a].i, from: unitRank[u], to: free[0], by: 'elimination' });
      }
    }
    for (const a of proven)
      if (lookRank[a] !== unitRank[u])
        moves.push({ chain: nest[a].i, from: unitRank[u], to: lookRank[a], by: 'look' });
    ladders.push({
      unit: u,
      members: nest.map((m) => m.i),
      ranks: nest.map((_, a) => rankAt.get(a) ?? -1),
      foreignLooks: foreign.size,
    });
  }
  return { moves, ladders };
}

/** A ladder mark: a closed chain no bigger than this across (mm) — a notch circle, a drill. */
const MARK_MAX_MM = 15;
/** The outline runs through the mark: within this share of the mark's half size of its centre
 * (kombinezon draws some circles a little off their line: 1–2 mm on a Ø 11 mm circle). */
const MARK_ON_SHARE = 0.6;
/** …and no other member's line passes within the mark's half size + this, mm. */
const MARK_CLEAR_MM = 2;

/**
 * The marks of a misfiled ladder follow their outline: a small closed chain of the ladder's layer
 * that exactly one member's line runs through near its centre (the size's own end — not a side
 * every size shares), when the marks repeat alike, the same count on each, over ≥ 3 members.
 */
export function ladderMarkMoves(
  chains: readonly Chain[],
  cand: readonly boolean[],
  unit: readonly number[],
  rankOf: ReadonlyMap<number, number>,
  ladders: readonly OcgLadder[],
  moved: ReadonlyMap<number, number>,
): OcgLookMove[] {
  const out: OcgLookMove[] = [];
  const dOn = (p: PtMm, c: Chain) => {
    const q = c.pts;
    let best = Infinity;
    const m = c.closed ? q.length : q.length - 1;
    for (let k = 0; k < m; k++) best = Math.min(best, segNearest(p, q[k], q[(k + 1) % q.length]).d);
    return best;
  };
  for (const L of ladders) {
    const members = L.members.filter((_, a) => L.ranks[a] >= 0);
    if (members.filter((m) => moved.has(m)).length < LADDER_MIN) continue;
    const box = boxOf(chains[L.members[L.members.length - 1]].pts);
    const hits = new Map<number, { mark: number; len: number }[]>();
    chains.forEach((c, i) => {
      if (!cand[i] || !c.closed || unit[i] !== L.unit || moved.has(i) || L.members.includes(i))
        return;
      const b = boxOf(c.pts);
      if (Math.max(b.maxX - b.minX, b.maxY - b.minY) > MARK_MAX_MM) return;
      if (b.maxX < box.minX || b.minX > box.maxX || b.maxY < box.minY || b.minY > box.maxY) return;
      const ctr = { x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 };
      const near = members.map((m) => ({ m, d: dOn(ctr, chains[m]) }));
      const half = Math.max(b.maxX - b.minX, b.maxY - b.minY) / 2;
      const on = near.filter((x) => x.d <= MARK_ON_SHARE * half);
      if (on.length !== 1 || near.some((x) => x.m !== on[0].m && x.d <= half + MARK_CLEAR_MM))
        return;
      const list = hits.get(on[0].m) ?? [];
      list.push({ mark: i, len: c.lengthMm });
      hits.set(on[0].m, list);
    });
    if (hits.size < LADDER_MIN) continue;
    // a graded series: the same count on every member that carries one, the marks alike
    const counts = new Set([...hits.values()].map((l) => l.length));
    const lens = [...hits.values()].flat().map((x) => x.len);
    const lo = Math.min(...lens);
    const hi = Math.max(...lens);
    if (counts.size !== 1 || hi > 1.15 * lo) continue;
    for (const [m, list] of hits) {
      const to = rankOf.get(m);
      if (to == null) continue;
      for (const { mark } of list) {
        const from = rankOf.get(mark);
        if (from != null && from !== to) out.push({ chain: mark, from, to, by: 'look' });
      }
    }
  }
  return out;
}
