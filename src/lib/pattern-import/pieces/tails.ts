// pieces/ (F4) — marking tails. A marking drawn once per size and stacked (polupalto's "lengthen
// or shorten here" double line, Burda 7142) runs past a smaller size's outline up to the largest
// size's. Where its two strokes are closed off beyond that outline (a U end, a shorter copy's end
// stroke), the strip between them is enclosed by the marking and the size's own line, so the fill
// takes it: the outline grows an outward tail ~2 mm wide and up to tens of mm long. Pure, mm, y-up.
import type { ChainId, PtMm } from 'lib/pattern-import/types';

import { dist, pointInPoly, SegGrid, segNearest, signedArea } from './geom';
import type { WallItem } from './snap';

/** Lines by chain, searchable by distance. */
export class LineIndex {
  private readonly grid = new SegGrid(4);
  private readonly lines = new Map<ChainId, { pts: readonly PtMm[]; closed: boolean }>();
  constructor(items: readonly WallItem[]) {
    for (const it of items) {
      if (it.chain < 0 || it.pts.length < 2 || this.lines.has(it.chain)) continue;
      this.lines.set(it.chain, { pts: it.pts, closed: !!it.closed });
      this.grid.addPolyline(it.chain, it.pts, !!it.closed);
    }
  }
  get size() {
    return this.lines.size;
  }
  /** The nearest line within `tol` of p (chain −1 and d Infinity when none). */
  nearest(p: PtMm, tol: number): { d: number; chain: ChainId } {
    let best = { d: Infinity, chain: -1 };
    this.grid.near(p, tol, (id, i) => {
      const l = this.lines.get(id)!;
      const d = segNearest(p, l.pts[i], l.pts[(i + 1) % l.pts.length]).d;
      if (d <= tol && d < best.d) best = { d, chain: id };
    });
    return best;
  }
  /** Points every `step` mm along the segments of `of` that pass within r of p. */
  samplesNear(p: PtMm, r: number, of: ReadonlySet<ChainId>, step: number): PtMm[] {
    const seen = new Set<string>();
    const out: PtMm[] = [];
    this.grid.near(p, r, (id, i) => {
      if (!of.has(id) || seen.has(`${id}:${i}`)) return;
      seen.add(`${id}:${i}`);
      const l = this.lines.get(id)!;
      const a = l.pts[i];
      const b = l.pts[(i + 1) % l.pts.length];
      const k = Math.max(1, Math.ceil(dist(a, b) / step));
      for (let s = 0; s <= k; s++) {
        const q = { x: a.x + ((b.x - a.x) * s) / k, y: a.y + ((b.y - a.y) * s) / k };
        if (dist(q, p) <= r) out.push(q);
      }
    });
    return out;
  }
}

export type TailCut = { at: PtMm; mouthMm: number; depthMm: number; chains: ChainId[] };

/** The widest strip a stacked double marking makes (1.95–2.0 mm measured) plus the snap. */
export const TAIL_MOUTH_MM = 3.5;
/** Shallower out-and-backs are the size motif's own jitter (polupalto's 44 crosses, ≤ 1.2 mm). */
const TAIL_DEPTH_MM = 2.5;

/**
 * Cuts the marking tails off a counter-clockwise outline, at their mouth. A tail is cut only
 * when both say so:
 * 1. its shape and lines: an outward out-and-back ≥ 2.5 mm deep and ≤ 3.5 mm wide all along, whose
 *    arms run on common (unranked) lines and not on this size's own line, and whose mouth sits on
 *    this size's own line;
 * 2. the lines of both arms go on into the piece past the mouth: the marking crosses the size's
 *    outline. An edge of the piece never does; a marking always does (it is drawn across the piece).
 * Anything else is left as filled.
 */
export function cutTails(
  outer: readonly PtMm[],
  own: LineIndex,
  common: LineIndex,
): { outer: PtMm[]; cuts: TailCut[] } {
  const n = outer.length;
  if (n < 8 || !own.size || !common.size) return { outer: outer.slice(), cuts: [] };
  const at = (k: number) => outer[((k % n) + n) % n];
  const cum = [0];
  for (let k = 1; k <= n; k++) cum.push(cum[k - 1] + dist(outer[k - 1], outer[k % n]));
  /** arc length from vertex i forward to vertex i + span */
  const arc = (i: number, span: number) =>
    i + span <= n ? cum[i + span] - cum[i] : cum[n] - cum[i] + cum[i + span - n];
  // vertices by cell, for the near pairs
  const cell = TAIL_MOUTH_MM;
  const key = (p: PtMm) => `${Math.floor(p.x / cell)},${Math.floor(p.y / cell)}`;
  const cells = new Map<string, number[]>();
  for (let k = 0; k < n; k++) {
    const kk = key(outer[k]);
    const arr = cells.get(kk);
    if (arr) arr.push(k);
    else cells.set(kk, [k]);
  }
  // candidate mouths: two vertices ≤ MOUTH apart, an outward excursion ≥ DEPTH deep between them
  const cand: { i: number; span: number; tip: number; depth: number }[] = [];
  for (let i = 0; i < n; i++) {
    const p = outer[i];
    const cx = Math.floor(p.x / cell);
    const cy = Math.floor(p.y / cell);
    for (let dx = -1; dx <= 1; dx++)
      for (let dy = -1; dy <= 1; dy++)
        for (const j of cells.get(`${cx + dx},${cy + dy}`) ?? []) {
          const span = (j - i + n) % n;
          if (span < 3 || span > n / 2 || dist(p, outer[j]) > TAIL_MOUTH_MM) continue;
          if (arc(i, span) < 2 * TAIL_DEPTH_MM) continue;
          let depth = 0;
          let tip = -1;
          for (let s = 1; s < span; s++) {
            const d = segNearest(at(i + s), p, outer[j]).d;
            if (d > depth) {
              depth = d;
              tip = s;
            }
          }
          if (depth < TAIL_DEPTH_MM) continue;
          const loop: PtMm[] = [];
          for (let s = 0; s <= span; s++) loop.push(at(i + s));
          const a = signedArea(loop);
          // outward (the loop turns as the outline does) and thin (a strip, not a lobe)
          if (a <= 0 || a > TAIL_MOUTH_MM * arc(i, span) * 0.5) continue;
          cand.push({ i, span, tip, depth });
        }
  }
  if (!cand.length) return { outer: outer.slice(), cuts: [] };
  cand.sort((x, y) => y.span - x.span);
  let outlineIdx: SegGrid | null = null;
  const toOutline = (q: PtMm, r: number) => {
    if (!outlineIdx) {
      outlineIdx = new SegGrid(4);
      outlineIdx.addPolyline(0, outer as PtMm[], true);
    }
    let d = Infinity;
    outlineIdx.near(q, r, (_, k) => {
      d = Math.min(d, segNearest(q, outer[k], outer[(k + 1) % n]).d);
    });
    return d;
  };
  const cut = new Uint8Array(n);
  const cuts: TailCut[] = [];
  for (const c of cand) {
    let free = true;
    for (let s = 0; s <= c.span && free; s++) if (cut[(c.i + s) % n]) free = false;
    if (!free) continue;
    const t = tailAt(c, at, own, common, outer, toOutline);
    if (!t) continue;
    for (let s = 1; s < c.span; s++) cut[(c.i + s) % n] = 1;
    cuts.push(t);
  }
  if (!cuts.length) return { outer: outer.slice(), cuts };
  return { outer: outer.filter((_, k) => !cut[k]), cuts };
}

function tailAt(
  c: { i: number; span: number; tip: number; depth: number },
  at: (k: number) => PtMm,
  own: LineIndex,
  common: LineIndex,
  outer: readonly PtMm[],
  toOutline: (q: PtMm, r: number) => number,
): TailCut | null {
  const a = at(c.i);
  const b = at(c.i + c.span);
  const mouth = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  // the mouth sits on this size's own line
  if (own.nearest(a, 0.8).d > 0.8 || own.nearest(b, 0.8).d > 0.8) return null;
  if (own.nearest(mouth, 1.5).d > 1.5) return null;
  // both arms, sampled every 0.5 mm: a strip ≤ MOUTH wide, on common lines, off the own line
  const armA: PtMm[] = [];
  const armB: PtMm[] = [];
  for (let s = 0; s < c.span; s++) {
    const p = at(c.i + s);
    const q = at(c.i + s + 1);
    const k = Math.max(1, Math.ceil(dist(p, q) / 0.5));
    for (let u = 0; u < k; u++) {
      const m = { x: p.x + ((q.x - p.x) * u) / k, y: p.y + ((q.y - p.y) * u) / k };
      (s < c.tip ? armA : armB).push(m);
    }
  }
  armB.push(b);
  const toPath = (q: PtMm, path: PtMm[]) => {
    let d = Infinity;
    for (let k = 0; k + 1 < path.length; k++)
      d = Math.min(d, segNearest(q, path[k], path[k + 1]).d);
    return d;
  };
  for (const q of armA) if (toPath(q, armB) > TAIL_MOUTH_MM) return null;
  for (const q of armB) if (toPath(q, armA) > TAIL_MOUTH_MM) return null;
  const chainsA = new Set<ChainId>();
  const chainsB = new Set<ChainId>();
  let inner = 0;
  let onCommon = 0;
  let onOwn = 0;
  for (const [arm, chains] of [
    [armA, chainsA],
    [armB, chainsB],
  ] as const)
    for (const q of arm) {
      if (segNearest(q, a, b).d < 1.5) continue; // the mouth itself is on the own line
      inner++;
      const cm = common.nearest(q, 0.5);
      if (cm.chain >= 0) {
        onCommon++;
        chains.add(cm.chain);
      }
      if (own.nearest(q, 0.3).chain >= 0) onOwn++;
    }
  if (inner < 6 || onCommon < 0.8 * inner || onOwn > 0.2 * inner) return null;
  // the marking crosses the outline: each arm's lines go on inside the piece, near the mouth
  const goesIn = (chains: ReadonlySet<ChainId>) =>
    common
      .samplesNear(mouth, 8, chains, 0.5)
      .some((q) => toOutline(q, 2) >= 1.5 && pointInPoly(q, outer));
  if (!goesIn(chainsA) || !goesIn(chainsB)) return null;
  return {
    at: at(c.i + c.tip),
    mouthMm: dist(a, b),
    depthMm: c.depth,
    chains: [...new Set([...chainsA, ...chainsB])],
  };
}
