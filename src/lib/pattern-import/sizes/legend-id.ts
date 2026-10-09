// sizes/ — size identity read off the drawing's own legend (F3b).
//
// A key ("SIZE XS ——", viola p29 "—— 34") shows one sample stroke per size. Matching every line
// group of the sheet to the sample it looks like names the group directly — identity, like an OCG
// layer — instead of deriving it from nesting and then remapping the nesting ranks onto the key.
// Groups: declared-dash classes (same dash SHAPE at any scale within 25 %: tile transforms rescale
// a dash a few percent per page, the key prints it smaller) and looks of the undeclared lines
// (rhythm + decorations). A sample drawn as a declared dash still matches a size drawn as filled
// dashes or dots on the sheet: the comparison ignores the pen (shapeCosine).
import type { Chain, Style } from 'lib/pattern-import/types';

import { normDash } from '../chains/link';
import { sameDashShape, sameStroke, shapeCosineScaled, type Signature } from '../chains/motif';

export type LegendHit = { label: string; chain: number };

export type LegendIdentity = {
  /** Key index per chain (-1 = no size line by the legend). */
  label: number[];
  /** Per key index: groups that took it (description, length mm, score). */
  matched: { idx: number; group: string; lengthMm: number; score: number }[][];
  /** Groups that look like a size line but match no sample well (for the operator). */
  unmatched: { group: string; lengthMm: number; best: string; score: number }[];
  /** Key indices with a sample stroke that no group of the sheet resembles. */
  absent: number[];
};

export const LEGEND_ID = { minScore: 0.86, minMargin: 0.04, minGroupMm: 150 };

export function legendIdentity(
  chains: Chain[],
  sigs: Signature[],
  cand: boolean[],
  styles: Map<number, Style>,
  look: number[],
  describe: (chain: number) => string,
  hits: LegendHit[],
  key: string[],
): LegendIdentity | null {
  const idxOf = new Map(key.map((l, k) => [l, k]));
  const samples = hits.filter((h) => idxOf.has(h.label) && h.chain < sigs.length);
  if (samples.length < 3) return null;
  const sampleSet = new Set(samples.map((h) => h.chain));
  const declOf = (i: number) => {
    const d = styles.get(chains[i].style)?.dash;
    return d && d.some((v) => v > 0.01) ? normDash(d) : null;
  };

  // groups: declared shapes, then looks of the rest
  type G = {
    name: string;
    members: number[];
    len: number;
    dash: number[] | null;
    vec: Float64Array | null;
    decor?: Record<string, number>;
  };
  const groups: G[] = [];
  const order = chains
    .map((_, i) => i)
    .filter((i) => cand[i] && !sampleSet.has(i) && i < sigs.length)
    .sort((a, b) => chains[b].lengthMm - chains[a].lengthMm);
  const byLook = new Map<number, G>();
  for (const i of order) {
    const d = declOf(i);
    if (d) {
      let g = groups.find((x) => x.dash && sameDashShape(x.dash, d));
      if (!g) {
        g = { name: `dash ${d.map((v) => v.toFixed(2)).join('/')}`, members: [], len: 0, dash: d, vec: null };
        groups.push(g);
      }
      g.members.push(i);
      g.len += chains[i].lengthMm;
      continue;
    }
    if (look[i] < 0) continue;
    let g = byLook.get(look[i]);
    if (!g) {
      g = { name: describe(i), members: [], len: 0, dash: null, vec: null };
      byLook.set(look[i], g);
      groups.push(g);
    }
    g.members.push(i);
    g.len += chains[i].lengthMm;
  }
  for (const g of groups) {
    const v = new Float64Array(sigs[g.members[0]].vec.length);
    const dec: Record<string, number> = {};
    for (const i of g.members) {
      const s = sigs[i].vec;
      for (let k = 0; k < v.length; k++) v[k] += s[k] * chains[i].lengthMm;
      for (const [k, x] of Object.entries(sigs[i].decorPer10))
        dec[k] = (dec[k] ?? 0) + (x * chains[i].lengthMm) / g.len;
    }
    g.vec = v;
    g.decor = dec;
  }
  // a decoration one side shows every ≤ 10 mm and the other never shows is a different line (the
  // 25 mm sample of a ringed line shows its rings): halve the score
  const decorClash = (a: Record<string, number>, b: Record<string, number>) => {
    for (const k of Object.keys({ ...a, ...b })) {
      const x = a[k] ?? 0;
      const y = b[k] ?? 0;
      if ((x >= 1 && y < 0.2 * x) || (y >= 1 && x < 0.2 * y)) return true;
    }
    return false;
  };

  const score = (h: LegendHit, g: G) => {
    const sd = declOf(h.chain);
    if (sd && g.dash) return sameDashShape(g.dash, sd) ? 1 : 0;
    const sv = sigs[h.chain].vec;
    const c = shapeCosineScaled(sigs[h.chain], g.vec!) + 0.02 * sameStroke(sv, g.vec!);
    // a declared sample has no beads to compare (viola's 46 is a 0/0.89 dash with round caps)
    return !sd && g.decor && decorClash(sigs[h.chain].decorPer10, g.decor) ? c / 2 : c;
  };
  const label = new Array(chains.length).fill(-1);
  const matched: LegendIdentity['matched'] = key.map(() => []);
  const unmatched: LegendIdentity['unmatched'] = [];
  const decide = (scores: (g: number) => number) => {
    // best key index by its best sample; null when weak or not clearly ahead of the runner-up
    const per = new Map<number, number>();
    for (const h of samples) {
      const k = idxOf.get(h.label)!;
      per.set(k, Math.max(per.get(k) ?? 0, scores(samples.indexOf(h))));
    }
    const ranked = [...per.entries()].sort((a, b) => b[1] - a[1]);
    const [bk, bs] = ranked[0] ?? [-1, 0];
    const second = ranked[1]?.[1] ?? 0;
    return { k: bk, s: bs, ok: bk >= 0 && bs >= LEGEND_ID.minScore && bs - second >= LEGEND_ID.minMargin };
  };
  const tally = new Map<string, { idx: number; group: string; lengthMm: number; score: number }>();
  for (const g of groups) {
    if (g.len < LEGEND_ID.minGroupMm) continue;
    const gd = decide((si) => score(samples[si], g));
    if (typeof process !== 'undefined' && process.env?.F3_LEGEND && g.len > 500)
      console.log(
        `legend-id ${g.name} ${(g.len / 1000).toFixed(1)}m: ${samples.map((h) => `${h.label}:c${h.chain}=${score(h, g).toFixed(2)}`).join(' ')}`,
      );
    if (g.dash) {
      // a declared shape is one size whatever its length
      if (gd.ok) {
        for (const i of g.members) label[i] = gd.k;
        matched[gd.k].push({ idx: gd.k, group: g.name, lengthMm: g.len, score: +gd.s.toFixed(3) });
      } else if (g.len >= 3 * LEGEND_ID.minGroupMm)
        unmatched.push({ group: g.name, lengthMm: g.len, best: gd.k >= 0 ? key[gd.k] : '-', score: +gd.s.toFixed(3) });
      continue;
    }
    // a look may hold two sizes drawn alike enough to cluster (reef: zigzag with small dots = M,
    // with small AND large dots = XL): each long-enough chain is matched on its own first
    let left = 0;
    for (const i of g.members) {
      const one = { ...g, vec: sigs[i].vec, dash: null, decor: sigs[i].decorPer10 };
      const cd = sigs[i].reliable && chains[i].lengthMm >= 20 ? decide((si) => score(samples[si], one)) : null;
      const pick = cd?.ok ? cd : gd.ok ? gd : null;
      if (!pick) {
        left += chains[i].lengthMm;
        continue;
      }
      label[i] = pick.k;
      const t = tally.get(`${pick.k}|${g.name}`) ?? { idx: pick.k, group: g.name, lengthMm: 0, score: 0 };
      t.score = (t.score * t.lengthMm + pick.s * chains[i].lengthMm) / (t.lengthMm + chains[i].lengthMm);
      t.lengthMm += chains[i].lengthMm;
      tally.set(`${pick.k}|${g.name}`, t);
    }
    if (left >= 3 * LEGEND_ID.minGroupMm)
      unmatched.push({ group: g.name, lengthMm: left, best: gd.k >= 0 ? key[gd.k] : '-', score: +gd.s.toFixed(3) });
  }
  for (const t of tally.values())
    if (t.lengthMm >= LEGEND_ID.minGroupMm / 2) matched[t.idx].push({ ...t, score: +t.score.toFixed(3) });
  const absent = key
    .map((_, k) => k)
    .filter((k) => samples.some((h) => idxOf.get(h.label) === k) && !matched[k].length);
  return { label, matched, unmatched, absent };
}
