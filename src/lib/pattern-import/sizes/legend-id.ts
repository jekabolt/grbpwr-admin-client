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
import {
  beadContrast,
  sameDashShape,
  sameStroke,
  scaledVecs,
  shapeCosineBest,
  type Signature,
} from '../chains/motif';

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
  /**
   * Per key index: the sample's match score (length-weighted), the share of its lines that also
   * agree on the second evidence (R7: element order / dot size; a declared dash = 1), the keys whose
   * samples look alike, and whether those are told apart by nesting only (a question).
   */
  perKey: { score: number; second: number; alike: number[]; nestingOnly: boolean }[];
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
        g = {
          name: `dash ${d.map((v) => v.toFixed(2)).join('/')}`,
          members: [],
          len: 0,
          dash: d,
          vec: null,
        };
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

  const scaled = new Map(samples.map((h) => [h.chain, scaledVecs(sigs[h.chain])]));
  const score = (h: LegendHit, g: G) => {
    const sd = declOf(h.chain);
    if (sd && g.dash) return sameDashShape(g.dash, sd) ? 1 : 0;
    const sv = sigs[h.chain].vec;
    const c = shapeCosineBest(scaled.get(h.chain)!, g.vec!) + 0.02 * sameStroke(sv, g.vec!);
    // a declared sample has no beads to compare (viola's 46 is a 0/0.89 dash with round caps)
    return !sd && g.decor && decorClash(sigs[h.chain].decorPer10, g.decor) ? c / 2 : c;
  };
  const label = new Array(chains.length).fill(-1);
  const matched: LegendIdentity['matched'] = key.map(() => []);
  const unmatched: LegendIdentity['unmatched'] = [];
  type Decision = { k: number; s: number; ok: boolean; ranked: [number, number][] };
  const decide = (scores: (g: number) => number): Decision => {
    // best key index by its best sample; null when weak or not clearly ahead of the runner-up
    const per = new Map<number, number>();
    for (const h of samples) {
      const k = idxOf.get(h.label)!;
      per.set(k, Math.max(per.get(k) ?? 0, scores(samples.indexOf(h))));
    }
    const ranked = [...per.entries()].sort((a, b) => b[1] - a[1]);
    const [bk, bs] = ranked[0] ?? [-1, 0];
    const second = ranked[1]?.[1] ?? 0;
    return {
      k: bk,
      s: bs,
      ok: bk >= 0 && bs >= LEGEND_ID.minScore && bs - second >= LEGEND_ID.minMargin,
      ranked,
    };
  };

  // ── R7: the second evidence of a motif sample — element order and bead sizes ───────────────────
  // Two keys whose SAMPLES look alike (Mood S «▲●▲●» and L «▲▲●●»: one rhythm of triangles and
  // dots) are told apart only by what the rhythm vector does not hold: the order of the elements
  // in one period and the size of the dots. Keys alike in that too are told apart by nesting only.
  const keySig = new Map<number, Signature>();
  for (const h of samples) {
    const k = idxOf.get(h.label)!;
    if (!keySig.has(k) && !declOf(h.chain)) keySig.set(k, sigs[h.chain]);
  }
  const alike: number[][] = key.map(() => []);
  for (const [a, sa] of keySig)
    for (const [b, sb] of keySig) {
      if (a >= b) continue;
      const c = Math.max(
        shapeCosineBest(scaledVecs(sa), sb.vec),
        shapeCosineBest(scaledVecs(sb), sa.vec),
      );
      if (c >= LEGEND_ID.minScore) {
        alike[a].push(b);
        alike[b].push(a);
      }
    }
  /** Does `sig` agree with key k's sample beyond the rhythm: 1 yes, -1 no, 0 cannot tell. */
  const secondOf = (k: number, sig: Signature): -1 | 0 | 1 => {
    const s = keySig.get(k);
    if (!s) return 0;
    const p = s.period && sig.period ? (s.period === sig.period ? 1 : -1) : 0;
    const bc = s.beadHist && sig.beadHist ? beadContrast(s.beadHist, sig.beadHist) : null;
    const b = bc == null ? 0 : bc <= 0.3 ? 1 : bc >= 0.5 ? -1 : 0;
    // one says yes, nothing says no — yes; both say no — no; they disagree — cannot tell
    if ((p === 1 && b >= 0) || (b === 1 && p >= 0)) return 1;
    if (p === -1 && b === -1) return -1;
    if (p + b < 0 && p * b === 0) return -1;
    // neither order nor dots to compare: the pen (fill vs a thin stroke, viola 36 / 38) — only as a
    // yes (the key may print a size in another pen than the sheet)
    return p === 0 && b === 0 && sameStroke(s.vec, sig.vec) ? 1 : 0;
  };
  /** Two alike keys whose samples differ in element order or dot size: separable. */
  const separable = (a: number, b: number) => {
    const sa = keySig.get(a);
    const sb = keySig.get(b);
    if (!sa || !sb) return true;
    // the key draws them in different pens (viola: 36 filled dashes, 38 a thin stroke with ticks)
    if (!sameStroke(sa.vec, sb.vec)) return true;
    if (sa.period && sb.period && sa.period !== sb.period) return true;
    return !!sa.beadHist && !!sb.beadHist && beadContrast(sa.beadHist, sb.beadHist) >= 0.3;
  };
  const nestingOnly = key.map((_, k) => alike[k].some((t) => !separable(k, t)));
  /**
   * A chain's decision checked against the second evidence: among the keys that score as well as
   * the best (alike samples, or a margin too thin to call), the ONE whose element order / dot size
   * the chain shares takes it; none or several — no identity (the neighbours rank it).
   */
  const refine = (d: Decision, sig: Signature | null): Decision => {
    if (d.k < 0 || d.s < LEGEND_ID.minScore) return d;
    const near = d.ranked.filter(
      ([k, sc]) =>
        sc >= LEGEND_ID.minScore &&
        (k === d.k || alike[d.k].includes(k) || d.s - sc < LEGEND_ID.minMargin),
    );
    if (near.length < 2) return d;
    const agree = sig ? near.filter(([k]) => secondOf(k, sig) === 1) : [];
    if (agree.length === 1) return { ...d, k: agree[0][0], s: agree[0][1], ok: true };
    return { ...d, ok: false };
  };
  const per2 = key.map(() => ({ len: 0, second: 0 }));
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
        unmatched.push({
          group: g.name,
          lengthMm: g.len,
          best: gd.k >= 0 ? key[gd.k] : '-',
          score: +gd.s.toFixed(3),
        });
      continue;
    }
    // a look may hold two sizes drawn alike enough to cluster (reef: zigzag with small dots = M,
    // with small AND large dots = XL): each long-enough chain is matched on its own first
    let left = 0;
    const own = new Map<number, Decision>();
    for (const i of g.members) {
      if (!(sigs[i].reliable && chains[i].lengthMm >= 20)) continue;
      const one = { ...g, vec: sigs[i].vec, dash: null, decor: sigs[i].decorPer10 };
      own.set(
        i,
        refine(
          decide((si) => score(samples[si], one)),
          sigs[i],
        ),
      );
    }
    // a look whose own chains name two or more keys holds several sizes: a chain too short to be
    // read on its own takes no key from the look's average (a coin between those sizes) — its
    // neighbours rank it
    const keysOfLook = new Set([...own.values()].filter((d) => d.ok).map((d) => d.k));
    const groupPick = gd.ok && keysOfLook.size <= 1 ? refine(gd, null) : null;
    for (const i of g.members) {
      const one = { ...g, vec: sigs[i].vec, dash: null, decor: sigs[i].decorPer10 };
      const cd = own.get(i) ?? null;
      // a chain read on its own but inconclusively still takes the look's one key — unless its own
      // element order / dot size says it is not that key
      const pick = cd?.ok
        ? cd
        : groupPick?.ok && (!own.has(i) || secondOf(groupPick.k, sigs[i]) !== -1)
          ? groupPick
          : null;
      if (typeof process !== 'undefined' && process.env?.F3_LEGEND_CH && chains[i].lengthMm >= 20)
        console.log(
          `legend-ch c${i} ${chains[i].lengthMm.toFixed(0)}mm ${g.name} → ${pick ? key[pick.k] : '-'} cd=${cd ? `${key[cd.k]}:${cd.s.toFixed(3)}${cd.ok ? '' : '?'}` : '-'} per=${sigs[i].period} beads=${(
            sigs[i].beadHist ?? []
          )
            .map((v, k) => (v >= 0.1 ? `${(k / 10).toFixed(1)}:${v.toFixed(2)}` : ''))
            .filter(Boolean)
            .join(',')} ${samples
            .map((h) => `${h.label}=${score(h, one).toFixed(3)}`)
            .filter((x) => +x.split('=')[1] > 0.8)
            .join(' ')} at=${chains[i].pts[0].x.toFixed(0)},${chains[i].pts[0].y.toFixed(0)}`,
        );
      if (!pick) {
        left += chains[i].lengthMm;
        continue;
      }
      label[i] = pick.k;
      per2[pick.k].len += chains[i].lengthMm;
      if (secondOf(pick.k, sigs[i]) === 1) per2[pick.k].second += chains[i].lengthMm;
      const t = tally.get(`${pick.k}|${g.name}`) ?? {
        idx: pick.k,
        group: g.name,
        lengthMm: 0,
        score: 0,
      };
      t.score =
        (t.score * t.lengthMm + pick.s * chains[i].lengthMm) / (t.lengthMm + chains[i].lengthMm);
      t.lengthMm += chains[i].lengthMm;
      tally.set(`${pick.k}|${g.name}`, t);
    }
    if (left >= 3 * LEGEND_ID.minGroupMm)
      unmatched.push({
        group: g.name,
        lengthMm: left,
        best: gd.k >= 0 ? key[gd.k] : '-',
        score: +gd.s.toFixed(3),
      });
  }
  for (const t of tally.values())
    if (t.lengthMm >= LEGEND_ID.minGroupMm / 2)
      matched[t.idx].push({ ...t, score: +t.score.toFixed(3) });
  const absent = key
    .map((_, k) => k)
    .filter((k) => samples.some((h) => idxOf.get(h.label) === k) && !matched[k].length);
  const perKey = key.map((_, k) => {
    const L = matched[k].reduce((a, m) => a + m.lengthMm, 0);
    const sc = L ? matched[k].reduce((a, m) => a + m.score * m.lengthMm, 0) / L : 0;
    const declared = matched[k].length > 0 && !keySig.has(k);
    return {
      score: +sc.toFixed(3),
      // a declared dash matched by shape is its own second evidence (dash count and ratios)
      second: declared ? 1 : per2[k].len ? +(per2[k].second / per2[k].len).toFixed(2) : 0,
      alike: alike[k].slice(),
      nestingOnly: nestingOnly[k],
    };
  });
  return { label, matched, unmatched, absent, perKey };
}
