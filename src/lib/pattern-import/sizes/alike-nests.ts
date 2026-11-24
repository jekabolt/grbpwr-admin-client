// sizes/ — sizes drawn in ONE pen, told apart by how their outlines nest.
//
// The key of some files prints the same sample for several sizes (Mood's Linda: 8, 22 and 24 are
// all "dash 9.6/1.0/1.7/1.0"). Their lines cannot be told apart by pen, so the legend match has no
// winner (`legendIdentity`: equal scores, no margin) and the lines stay unranked, or all go to one
// size: the others have no line at all. But the closed outlines of one piece lie INSIDE each other,
// the larger size outside, and the outlines of the other sizes of the nest (their own pens) have
// their ranks. A closed outline of the shared pen between two known ranks is one of the sizes of
// that pen that fall between them.
//
// `rankAlikeNests` hands those ranks out. It changes nothing for a file where every size of the
// shared pen already has a line.
import type { Chain, PtMm, Style } from 'lib/pattern-import/types';

import { normDash } from '../chains/link';

export type AlikeNestsIn = {
  chains: readonly Chain[];
  /** chain → rank, as the reader settled it; changed in place. */
  rankOf: Map<number, number>;
  styles: ReadonlyMap<number, Style>;
  /** The key's sample strokes: the label and the chain that draws it. */
  samples: readonly { label: string; chain: number }[];
  /** The rank of each key label (absent / negative: that size is not placed). */
  keyRank: ReadonlyMap<string, number>;
  /** Which chains may be size lines at all (not furniture). */
  candidate: (chain: number) => boolean;
  /** Only legend-identified anchors can certify a shared-pen outline for export. */
  anchorRank?: (chain: number) => number | undefined;
  onBracket?: (chain: number, rank: number) => void;
};

type Pen = { dash: number[] | null; width: number; rgb: number[] | null };

const penOf = (st: Style | undefined): Pen | null =>
  st
    ? {
        dash: st.dash && st.dash.some((v) => v > 0.01) ? normDash(st.dash) : null,
        width: st.widthMm,
        rgb: st.strokeRgb,
      }
    : null;

/** The same pen: width, ink and the dash within 6 % once the key's smaller print is allowed for. */
function samePen(a: Pen, b: Pen): boolean {
  if (Math.abs(a.width - b.width) > 0.06) return false;
  if (a.rgb && b.rgb && Math.max(...a.rgb.map((v, i) => Math.abs(v - b.rgb![i]))) > 40)
    return false;
  if (!a.dash || !b.dash) return !a.dash && !b.dash;
  if (a.dash.length !== b.dash.length) return false;
  const s = a.dash.reduce((x, y) => x + y, 0) / (b.dash.reduce((x, y) => x + y, 0) || 1);
  if (Math.abs(s - 1) > 0.12) return false;
  return a.dash.every((v, i) => Math.abs(v - b.dash![i] * s) <= Math.max(0.06 * v, 0.12));
}

/** Absolute area of a closed polyline, mm². */
function area(pts: readonly PtMm[]): number {
  let s = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    s += a.x * b.y - b.x * a.y;
  }
  return Math.abs(s) / 2;
}

function inside(p: PtMm, poly: readonly PtMm[]): boolean {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[j];
    const b = poly[i];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) c = !c;
  }
  return c;
}

const CLOSED_MM = 2;
const MIN_OUTLINE_MM = 150;

/** The ranks that were given an outline: the sizes that now have a line. */
export function rankAlikeNests(inp: AlikeNestsIn): Set<number> {
  const { chains, rankOf, styles, samples, keyRank, candidate } = inp;
  // 1. groups of keys whose samples are one pen
  const keys = samples
    .map((s) => ({
      label: s.label,
      rank: keyRank.get(s.label) ?? -1,
      pen: penOf(styles.get(chains[s.chain]?.style)),
    }))
    .filter((k): k is { label: string; rank: number; pen: Pen } => k.rank >= 0 && !!k.pen);
  const groups: { pen: Pen; ranks: number[] }[] = [];
  for (const k of keys) {
    const g = groups.find((x) => samePen(x.pen, k.pen));
    if (g) {
      if (!g.ranks.includes(k.rank)) g.ranks.push(k.rank);
    } else groups.push({ pen: k.pen, ranks: [k.rank] });
  }
  const given = new Set<number>();
  const haveLine = new Set(rankOf.values());
  const closed = (c: Chain) =>
    c.lengthMm >= MIN_OUTLINE_MM &&
    (c.closed ||
      Math.hypot(c.pts[0].x - c.pts[c.pts.length - 1].x, c.pts[0].y - c.pts[c.pts.length - 1].y) <=
        CLOSED_MM);
  for (const g of groups) {
    const R = g.ranks.sort((a, b) => a - b);
    // only where a size of the pen has no line yet
    if (R.length < 2 || R.every((r) => haveLine.has(r))) continue;
    const unknown = new Set<number>();
    chains.forEach((c, i) => {
      if (!candidate(i) || !closed(c)) return;
      const p = penOf(styles.get(c.style));
      if (p && samePen(p, g.pen)) unknown.add(i);
    });
    // Some grading stacks share a baseline or cross at a seam. Test the extents of
    // each outline against both adjacent, independently ranked sizes in sheet space.
    // A cropped outline can still expose all four extrema.
    const bounds = chains.map((c) => {
      const b = [Infinity, Infinity, -Infinity, -Infinity];
      for (const p of c.pts) {
        b[0] = Math.min(b[0], p.x);
        b[1] = Math.min(b[1], p.y);
        b[2] = Math.max(b[2], p.x);
        b[3] = Math.max(b[3], p.y);
      }
      return b;
    });
    const anchors = new Map<number, number[]>();
    for (const [i, rank] of rankOf) {
      const pen = penOf(styles.get(chains[i].style));
      if (
        inp.anchorRank?.(i) !== rank ||
        !candidate(i) ||
        !closed(chains[i]) ||
        !pen ||
        samePen(pen, g.pen)
      )
        continue;
      const list = anchors.get(rank) ?? [];
      list.push(i);
      anchors.set(rank, list);
    }
    const proven = new Map<string, { chain: number; rank: number }[]>();
    chains.forEach((c, i) => {
      const pen = penOf(styles.get(c.style));
      if (!candidate(i) || c.lengthMm < MIN_OUTLINE_MM || !pen || !samePen(pen, g.pen)) return;
      const matches = [];
      for (const rank of R) {
        for (const lo of anchors.get(rank - 1) ?? []) {
          for (const hi of anchors.get(rank + 1) ?? []) {
            const spans = bounds[lo].map((x, k) => bounds[hi][k] - x);
            const step = Math.max(...spans.map(Math.abs));
            if (step < 1 || step > 0.12 * Math.min(chains[lo].lengthMm, chains[hi].lengthMm))
              continue;
            if (
              c.lengthMm < 0.8 * Math.min(chains[lo].lengthMm, chains[hi].lengthMm) ||
              c.lengthMm > 1.2 * Math.max(chains[lo].lengthMm, chains[hi].lengthMm)
            )
              continue;
            if (
              spans.every(
                (span, k) =>
                  Math.abs(bounds[i][k] - bounds[lo][k] - span / 2) <=
                  Math.max(0.15, Math.abs(span) * 0.24),
              )
            ) {
              matches.push({ key: `${lo}/${hi}`, rank });
            }
          }
        }
      }
      if (matches.length !== 1) return;
      const { key, rank } = matches[0];
      const list = proven.get(key) ?? [];
      list.push({ chain: i, rank });
      proven.set(key, list);
    });
    for (const list of proven.values()) {
      if (list.length !== 1) continue;
      const { chain, rank } = list[0];
      rankOf.set(chain, rank);
      given.add(rank);
      inp.onBracket?.(chain, rank);
      unknown.delete(chain);
    }
    if (unknown.size < 2) continue;
    // 2. the closed outlines that matter: the pen's own, and every other outline with a rank
    type O = { id: number; area: number; pts: readonly PtMm[]; rank: number | null };
    const outs: O[] = [];
    chains.forEach((c, i) => {
      if (!closed(c)) return;
      const r = rankOf.get(i);
      if (unknown.has(i)) outs.push({ id: i, area: area(c.pts), pts: c.pts, rank: null });
      else if (r !== undefined && !R.includes(r))
        outs.push({ id: i, area: area(c.pts), pts: c.pts, rank: r });
    });
    // 3. nests: outlines that lie inside one another
    const par = outs.map((_, i) => i);
    const find = (x: number): number => (par[x] === x ? x : (par[x] = find(par[x])));
    const within = (a: O, b: O) =>
      a.area < b.area &&
      inside(a.pts[0], b.pts) &&
      inside(a.pts[Math.floor(a.pts.length / 2)], b.pts);
    for (let i = 0; i < outs.length; i++)
      for (let j = 0; j < outs.length; j++)
        if (i !== j && within(outs[i], outs[j])) par[find(i)] = find(j);
    const nests = new Map<number, O[]>();
    outs.forEach((o, i) => {
      const k = find(i);
      const l = nests.get(k);
      if (l) l.push(o);
      else nests.set(k, [o]);
    });
    for (const nest of nests.values()) {
      nest.sort((a, b) => a.area - b.area);
      // 4. the unknown outlines between two known ranks take the pen's ranks that fall between
      let i = 0;
      while (i < nest.length) {
        if (nest[i].rank !== null) {
          i++;
          continue;
        }
        let j = i;
        while (j < nest.length && nest[j].rank === null) j++;
        const lo = i > 0 ? (nest[i - 1].rank as number) : -Infinity;
        const hi = j < nest.length ? (nest[j].rank as number) : Infinity;
        const free = R.filter((r) => r > lo && r < hi);
        // exactly as many outlines as sizes of the pen between them: no guess
        if (free.length === j - i) {
          for (let k = i; k < j; k++) {
            rankOf.set(nest[k].id, free[k - i]);
            given.add(free[k - i]);
          }
        }
        i = j;
      }
    }
  }
  return given;
}
