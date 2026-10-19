// sizes/ — SIZESEP: a labelled sheet whose sizes also have a look each, ranked look by look.
//
// polupalto (44–54) prints every size in its own look (44 crosses, 46 diamonds, 48 dash, 50 long
// dash, 52 dots, 54 thick solid; the key is on the sheet) and puts boxed labels beside the lines.
// The nearest line to a boxed label is its box, so no label reaches a size line, and every rank of
// the text-label pass came from one cross-section's own inside guess (the closure of the chain it
// was cast from). On a tiled sheet that guess is a coin flip (1247 of 2669 sections wrong): each
// look split between rank r and n−1−r and every rank read "drawn in 2 looks".
//
// The looks are ranked as a whole only when three independent things agree:
//   1. order — one order of the n looks dominates the full cross-sections (n distinct looks side
//      by side), holds in every part of the sheet (no 15 cm cell and no piece reads the looks in
//      another order) and no look of it fills two lanes of one section (two sizes drawn alike); it
//      gives the order up to its direction;
//   2. direction by nesting — the sheet-wide inside vote (large closures weigh most) puts one end
//      of that order inside (small sizes inside);
//   3. direction by labels — the size labels nearest to the look lines (only size-look chains are
//      candidates, so a label's own box is never its line) name that same end, and hardly any
//      names a size of neither end.
// Order alone, or a direction only one of the two reads, ranks nothing: the pass goes on as before
// and the sizes step keeps asking.
import type { Chain, IRText } from 'lib/pattern-import/types';

import { SegGrid, segNearest } from '../chains/geom';
import { parseSizeToken } from './tokens';

export type LookOrderGroup = {
  /** Majority look per lane (−1 = none). */
  units: number[];
  /** The chain the cross-section was cast from, and where. */
  from: number;
  at: { x: number; y: number };
};

export type LookOrder = {
  /** Rank per look, −1 = not in the order; null = not ranked (the reason is in `why`). */
  rank: number[] | null;
  why: string;
};

/** Full sections that must show the dominant order, and its share of all full distinct ones. */
const MIN_SECTIONS = 30;
const MIN_ORDER_SHARE = 0.6;
/** A look of the order may fill two lanes of one section in at most this share of its sections
 *  (polupalto: ≤ 4.4 %; two sizes in one look: 70 %). */
const MAX_TWICE = 0.2;
/** Every cell (mm) with this many sections of ≥ 3 order looks must read them in the order (either
 *  direction) in this share of them (polupalto: ≥ 0.8 in every cell). */
const CELL_MM = 150;
const MIN_CELL = 8;
const MIN_CELL_ORDERED = 0.6;
/** Every line the sections were cast from (one size line of one piece) with this many sections of
 *  ≥ 3 order looks must read them in the order in this share of them (polupalto: ≥ 0.7; one 65 mm
 *  piece with two looks swapped: ≤ 0.15). A small piece in another key is outvoted in any cell. */
const MIN_LINE = 5;
const MIN_LINE_ORDERED = 0.5;
/** |inside vote| / total weight below this = the nesting does not say which end is inside. */
const MIN_INSIDE = 0.2;
/** A label names a look line within this distance (mm, from the label's box centre). */
const LABEL_MM = 6;
/** Labels must name one end at least this often, and this many times more than the other end and
 *  the sizes of neither end together. */
const MIN_LABELS = 3;
const LABEL_RATIO = 3;

function closureArea(pts: readonly { x: number; y: number }[]): number {
  let a = 0;
  for (let k = 0; k < pts.length; k++) {
    const p0 = pts[k];
    const p1 = pts[(k + 1) % pts.length];
    a += p0.x * p1.y - p1.x * p0.y;
  }
  return a / 2;
}

export function textLabelLookOrder(
  chains: readonly Chain[],
  groups: readonly LookOrderGroup[],
  unit: readonly number[],
  nUnits: number,
  n: number,
  rankOfLabel: ReadonlyMap<string, number>,
  texts: readonly IRText[],
): LookOrder {
  // 1. order
  const perm = new Map<string, number>();
  let fullDistinct = 0;
  for (const g of groups) {
    const us = g.units;
    if (us.length !== n || us.some((u) => u < 0) || new Set(us).size !== n) continue;
    fullDistinct++;
    const seq = us[0] < us[n - 1] ? us : us.slice().reverse();
    const k = seq.join(',');
    perm.set(k, (perm.get(k) ?? 0) + 1);
  }
  const top = [...perm].sort((a, b) => b[1] - a[1])[0];
  if (!top || top[1] < MIN_SECTIONS || top[1] < MIN_ORDER_SHARE * fullDistinct)
    return {
      rank: null,
      why: `no dominant look order (${top?.[1] ?? 0} of ${fullDistinct} full sections)`,
    };
  const order = top[0].split(',').map(Number);
  const pos = new Array<number>(nUnits).fill(-1);
  order.forEach((u, k) => (pos[u] = k));
  const orderWhy = `order ${top[1]}/${fullDistinct}`;
  // 1b. one look, one size: a look that fills two lanes of one section is drawn for two sizes (the
  // order above only read the sections where the n looks differ, so it cannot see that)
  const seen = new Array<number>(nUnits).fill(0);
  const twice = new Array<number>(nUnits).fill(0);
  for (const g of groups) {
    const cnt = new Map<number, number>();
    for (const u of g.units) if (u >= 0 && pos[u] >= 0) cnt.set(u, (cnt.get(u) ?? 0) + 1);
    for (const [u, c] of cnt) {
      seen[u]++;
      if (c >= 2) twice[u]++;
    }
  }
  const shared = order.find((u) => twice[u] > MAX_TWICE * seen[u]);
  if (shared !== undefined)
    return {
      rank: null,
      why: `${orderWhy}; look ${order.indexOf(shared) + 1} of the order fills two lanes in ${twice[shared]} of ${seen[shared]} sections: one look draws two sizes`,
    };
  // 1c. the order holds everywhere: a part of the sheet whose sections read the looks in another
  // order (another garment, another key) is not outvoted by the rest
  const cells = new Map<string, { ordered: number; all: number }>();
  const lines = new Map<number, { ordered: number; all: number; at: { x: number; y: number } }>();
  for (const g of groups) {
    const ps = g.units.map((u) => (u >= 0 ? pos[u] : -1)).filter((p) => p >= 0);
    if (ps.length < 3 || new Set(ps).size !== ps.length) continue;
    const key = `${Math.floor(g.at.x / CELL_MM)},${Math.floor(g.at.y / CELL_MM)}`;
    let c = cells.get(key);
    if (!c) cells.set(key, (c = { ordered: 0, all: 0 }));
    let l = lines.get(g.from);
    if (!l) lines.set(g.from, (l = { ordered: 0, all: 0, at: g.at }));
    c.all++;
    l.all++;
    const up = ps.every((p, k) => !k || p > ps[k - 1]);
    const down = ps.every((p, k) => !k || p < ps[k - 1]);
    if (up || down) {
      c.ordered++;
      l.ordered++;
    }
  }
  const off = [...cells].find(([, c]) => c.all >= MIN_CELL && c.ordered < MIN_CELL_ORDERED * c.all);
  if (off) {
    const [cx, cy] = off[0].split(',').map(Number);
    return {
      rank: null,
      why: `${orderWhy}; the sections near (${cx * CELL_MM + CELL_MM / 2}, ${cy * CELL_MM + CELL_MM / 2}) mm read the looks in another order (${off[1].ordered} of ${off[1].all} in it)`,
    };
  }
  const offLine = [...lines.values()].find(
    (l) => l.all >= MIN_LINE && l.ordered < MIN_LINE_ORDERED * l.all,
  );
  if (offLine)
    return {
      rank: null,
      why: `${orderWhy}; the piece at (${Math.round(offLine.at.x)}, ${Math.round(offLine.at.y)}) mm reads the looks in another order (${offLine.ordered} of ${offLine.all} of its sections)`,
    };

  // 2. direction by nesting: lanes run −normal → +normal; A > 0 puts the interior at +normal
  let iv = 0;
  let ivAbs = 0;
  for (const g of groups) {
    const A = closureArea(chains[g.from].pts);
    if (Math.abs(A) < 100) continue;
    const known = g.units.map((u, k) => ({ k, p: u >= 0 ? pos[u] : -1 })).filter((e) => e.p >= 0);
    if (known.length < 2) continue;
    const mk = known.reduce((a, e) => a + e.k, 0) / known.length;
    const mp = known.reduce((a, e) => a + e.p, 0) / known.length;
    const cov = known.reduce((a, e) => a + (e.k - mk) * (e.p - mp), 0);
    if (Math.abs(cov) < 1e-9) continue;
    const pGrowsInward = cov > 0 === A > 0;
    const w = Math.sqrt(Math.abs(A)) / 100;
    iv += pGrowsInward ? -w : w;
    ivAbs += w;
  }
  const insideShare = ivAbs ? Math.abs(iv) / ivAbs : 0;
  const nestWhy = `inside vote ${iv.toFixed(1)} of ${ivAbs.toFixed(1)}`;
  if (insideShare < MIN_INSIDE)
    return { rank: null, why: `${orderWhy}; ${nestWhy}: nesting names no inside end` };
  // + = the order's position grows outward: position = rank (small sizes inside)
  const nestFwd = iv > 0;

  // 3. direction by labels
  const grid = new SegGrid(8);
  chains.forEach((c, i) => {
    if (unit[i] >= 0 && pos[unit[i]] >= 0 && c.pts.length >= 2) grid.addPolyline(i, c.pts);
  });
  let fwd = 0;
  let rev = 0;
  let other = 0;
  for (const t of texts) {
    if (t.background) continue;
    const tok = parseSizeToken(t.text, true);
    if (!tok) continue;
    const r = rankOfLabel.get(tok.label);
    if (r === undefined) continue;
    const at = { x: (t.bbox.minX + t.bbox.maxX) / 2, y: (t.bbox.minY + t.bbox.maxY) / 2 };
    let best = LABEL_MM;
    let bi = -1;
    grid.near(at, LABEL_MM, (ci, si) => {
      const d = segNearest(at, chains[ci].pts[si], chains[ci].pts[si + 1]).d;
      if (d < best) {
        best = d;
        bi = ci;
      }
    });
    if (bi < 0) continue;
    const p = pos[unit[bi]];
    if (p === n - 1 - p) continue; // the middle look of an odd run names no end
    if (r === p) fwd++;
    else if (r === n - 1 - p) rev++;
    else other++;
  }
  const labelWhy = `labels on look lines ${fwd} in order / ${rev} reversed / ${other} neither`;
  const labelFwd =
    fwd >= MIN_LABELS && fwd >= LABEL_RATIO * (rev + other)
      ? true
      : rev >= MIN_LABELS && rev >= LABEL_RATIO * (fwd + other)
        ? false
        : null;
  if (labelFwd === null)
    return { rank: null, why: `${orderWhy}; ${nestWhy}; ${labelWhy}: labels name no end` };
  if (labelFwd !== nestFwd)
    return {
      rank: null,
      why: `${orderWhy}; ${nestWhy}; ${labelWhy}: labels and nesting disagree on the direction`,
    };
  const rank = pos.map((p) => (p < 0 ? -1 : nestFwd ? p : n - 1 - p));
  return { rank, why: `${orderWhy}; ${nestWhy}; ${labelWhy}: ranked by look` };
}
