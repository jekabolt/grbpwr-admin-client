// assemble (F2) — the tile LAYOUT: which page sits in which (row, col) of the sheet. Not "the first
// gap closes the row" (Codex C6): the pages are segmented into lines (rows for row-major files,
// columns for column-major ones) by dynamic programming over EVERY segmentation, scoring each by
// the content votes of the seams it implies — in-line neighbours plus the neighbour in the
// previous line. Ragged lines (reef 6/6/5/5/5/5, Redcafe 7/8/7, wm's omitted R3C3) fall out of
// the same search. Lines are left/top-aligned, as in every sample.

import type { Rel } from './stitch';

export type Order = 'row-major' | 'col-major';
/** Where the next line goes: rows downward (most files) or upward (Burda numbers rows from the
 * bottom: palto's glue marks 1a… sit on the lowest row); columns rightward. */
export type Flow = 'down' | 'up' | 'right';

export type Layout = {
  order: Order;
  flow: Flow;
  /** Line lengths in reading order. */
  lines: number[];
  /** (row, col) per page index (index into the group's page list). */
  cells: { row: number; col: number }[];
  score: number;
};

/** Score of B being right of / below / above A at the sheet pitch (content votes). */
export type SeamScore = (a: number, b: number, rel: Rel | 'above') => number;

/**
 * Best segmentation of n pages (in reading order) into lines. Each line after the first may start
 * up to `maxShift` cells before/after the first line's start (r4454's last row is right-aligned:
 * its empty cell is the FIRST one — measured, the seams say so). `maxLine` bounds a line's
 * length. A length change costs `changePenalty`; a shifted start costs `changePenalty` per cell —
 * regular grids win ties.
 */
export function bestLayout(
  n: number,
  order: Order,
  score: SeamScore,
  flow: Flow = order === 'row-major' ? 'down' : 'right',
  maxLine = 16,
  changePenalty = 1,
  maxShift = 2,
): Layout {
  const inl: Rel = order === 'row-major' ? 'right' : 'below';
  const crs: Rel | 'above' = order === 'row-major' ? (flow === 'up' ? 'above' : 'below') : 'right';
  // prefix sums of in-line seams: pre[i] = Σ_{k<i} score(k, k+1)
  const pre = new Float64Array(n + 1);
  for (let k = 0; k + 1 < n; k++) pre[k + 1] = pre[k] + score(k, k + 1, inl);
  const inline = (a: number, b: number) => pre[b] - pre[a]; // seams a..b-1 → pages a..b
  const crossMemo = new Map<string, number>();
  // previous line [s..e] starting at column cs, current [a..b] starting at column ca
  const cross = (s: number, e: number, cs: number, a: number, b: number, ca: number) => {
    const key = `${s},${e},${cs},${a},${b},${ca}`;
    const m = crossMemo.get(key);
    if (m !== undefined) return m;
    let v = 0;
    for (let i = a; i <= b; i++) {
      const col = ca + (i - a);
      const p = s + (col - cs);
      if (p >= s && p <= e) v += score(p, i, crs);
    }
    crossMemo.set(key, v);
    return v;
  };
  type St = { v: number; prev: string | null; s: number; e: number; c: number };
  const best = new Map<string, St>();
  const K = (e: number, s: number, c: number) => `${e},${s},${c}`;
  for (let e = 0; e < Math.min(n, maxLine); e++)
    best.set(K(e, 0, 0), { v: inline(0, e), prev: null, s: 0, e, c: 0 });
  for (let e = 0; e < n; e++)
    for (let s = Math.max(0, e - maxLine + 1); s <= e; s++)
      for (let c = -maxShift; c <= maxShift; c++) {
        const cur = best.get(K(e, s, c));
        if (!cur) continue;
        for (let e2 = e + 1; e2 < Math.min(n, e + 1 + maxLine); e2++)
          for (let c2 = -maxShift; c2 <= maxShift; c2++) {
            const lenPrev = e - s + 1;
            const lenCur = e2 - e;
            const pen = (lenPrev === lenCur ? 0 : changePenalty) + Math.abs(c2) * changePenalty;
            const v = cur.v + inline(e + 1, e2) + cross(s, e, c, e + 1, e2, c2) - pen;
            const k2 = K(e2, e + 1, c2);
            const old = best.get(k2);
            if (!old || v > old.v) best.set(k2, { v, prev: K(e, s, c), s: e + 1, e: e2, c: c2 });
          }
      }
  let fin: St | null = null;
  for (const st of best.values()) if (st.e === n - 1 && (!fin || st.v > fin.v)) fin = st;
  const chain: St[] = [];
  for (let st: St | undefined = fin ?? undefined; st; st = st.prev ? best.get(st.prev) : undefined)
    chain.push(st);
  chain.reverse();
  const lines = chain.map((st) => st.e - st.s + 1);
  const minC = Math.min(0, ...chain.map((st) => st.c));
  const cells: Layout['cells'] = [];
  chain.forEach((st, li) => {
    const line = flow === 'up' ? chain.length - 1 - li : li;
    for (let j = 0; j <= st.e - st.s; j++) {
      const pos = st.c - minC + j;
      cells.push(order === 'row-major' ? { row: line, col: pos } : { row: pos, col: line });
    }
  });
  return { order, flow, lines, cells, score: fin?.v ?? 0 };
}
