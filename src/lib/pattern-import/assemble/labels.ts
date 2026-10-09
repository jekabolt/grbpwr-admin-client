// assemble (F2) — printed tile labels. Two kinds:
//  - CELL labels name the tile's (row, col): Redcafe «ряд:кол» "2:3" (own label + its neighbours'
//    labels at the edges), Mood/reef "A1"…"F5" (row letter, column number), "ROW n COLUMN m".
//  - INDEX labels number the tiles 1…N at a fixed spot (robe "01", r4454 "1" bottom centre,
//    blazer, kombinezon). A restart (…, 31, 1, …) separates two sheets in one file (r4454's
//    interfacing sheet); a gap in the run names a missing page.
// Text only — labels drawn as strokes (wm) are not read here.

import type { IRPage, IRText } from 'lib/pattern-import/types';

export type CellLabel = { row: number; col: number; text: string; how: string };

const RC = /^\s*(\d{1,2})\s*:\s*(\d{1,2})\s*$/;
const LETTER_NUM = /^\s*([A-Z])\s*(\d{1,2})\s*$/;
const ROW_COL = /ROW\s*(\d{1,2})\s*,?\s*COL(?:UMN)?\s*(\d{1,2})/i;

/**
 * The page's own cell label. For "r:c" pages that also print their neighbours' labels at the
 * edges, the own label is the one whose printed neighbours sit on the matching sides.
 */
export function cellLabelOf(page: IRPage): CellLabel | null {
  const rc: { row: number; col: number; t: IRText }[] = [];
  for (const t of page.texts) {
    const m = RC.exec(t.text);
    if (m) rc.push({ row: +m[1], col: +m[2], t });
  }
  if (rc.length) {
    const cx = page.widthMm / 2;
    const cy = page.heightMm / 2;
    let best: (typeof rc)[number] | null = null;
    let bestScore = -1;
    for (const c of rc) {
      let s = 0;
      for (const o of rc) {
        if (o === c) continue;
        const ox = o.t.anchor.x - cx;
        const oy = o.t.anchor.y - cy;
        const side =
          Math.abs(ox) > Math.abs(oy) * (page.widthMm / page.heightMm)
            ? ox > 0
              ? 'R'
              : 'L'
            : oy > 0
              ? 'T'
              : 'B';
        if (side === 'R' && o.row === c.row && o.col === c.col + 1) s++;
        if (side === 'L' && o.row === c.row && o.col === c.col - 1) s++;
        if (side === 'T' && o.col === c.col && o.row === c.row - 1) s++;
        if (side === 'B' && o.col === c.col && o.row === c.row + 1) s++;
      }
      // Ties (a corner tile with one neighbour): the biggest type wins.
      const score = s + c.t.fontSizeMm / 100;
      if (score > bestScore) {
        bestScore = score;
        best = c;
      }
    }
    if (best && (rc.length === 1 || bestScore >= 1))
      return { row: best.row - 1, col: best.col - 1, text: best.t.text, how: 'row:col label' };
  }
  // Letter-number labels are printed big (reef: 79 mm type); a small "A4" is a paper format
  // in an info table (Redcafe p1 "Формат / Format A4").
  const minFs = Math.min(page.widthMm, page.heightMm) * 0.05;
  const ln = page.texts
    .map((t) => ({ t, m: LETTER_NUM.exec(t.text) }))
    .filter((x) => x.m && x.t.fontSizeMm >= minFs);
  if (ln.length === 1) {
    const m = ln[0].m as RegExpExecArray;
    return {
      row: m[1].charCodeAt(0) - 65,
      col: +m[2] - 1,
      text: ln[0].t.text,
      how: 'letter-number label',
    };
  }
  for (const t of page.texts) {
    const m = ROW_COL.exec(t.text);
    if (m) return { row: +m[1] - 1, col: +m[2] - 1, text: t.text, how: 'ROW/COLUMN label' };
  }
  return null;
}

/** Integer labels with their anchor, per page — candidates for an index label. */
export function integerTexts(page: IRPage): { v: number; x: number; y: number; fs: number }[] {
  const out: { v: number; x: number; y: number; fs: number }[] = [];
  for (const t of page.texts) {
    const s = t.text.trim();
    if (!/^\d{1,3}$/.test(s)) continue;
    out.push({ v: +s, x: t.anchor.x, y: t.anchor.y, fs: t.fontSizeMm });
  }
  return out;
}

/**
 * Index labels for a run of pages: the integer printed at the same spot (±3 mm) and size on most
 * pages. Returns the value per page (null where absent) or null when no such spot exists.
 */
export function indexLabels(pages: IRPage[]): (number | null)[] | null {
  if (pages.length < 3) return null;
  const spots = new Map<string, number>();
  const cand = pages.map(integerTexts);
  for (const list of cand) {
    const seen = new Set<string>();
    for (const c of list) {
      const k = `${Math.round(c.x / 6)},${Math.round(c.y / 6)},${Math.round(c.fs)}`;
      if (seen.has(k)) continue;
      seen.add(k);
      spots.set(k, (spots.get(k) ?? 0) + 1);
    }
  }
  let bestK = '';
  let bestN = 0;
  for (const [k, n] of spots) if (n > bestN) [bestK, bestN] = [k, n];
  if (bestN < Math.max(3, 0.6 * pages.length)) return null;
  const [gx, gy, gf] = bestK.split(',').map(Number);
  const vals = cand.map((list) => {
    const hit = list.find(
      (c) =>
        Math.abs(c.x / 6 - gx) <= 1 && Math.abs(c.y / 6 - gy) <= 1 && Math.round(c.fs) === gf,
    );
    return hit ? hit.v : null;
  });
  // Mostly increasing by one — otherwise it is a size label or a piece number, not an index.
  let steps = 0;
  let good = 0;
  for (let i = 1; i < vals.length; i++) {
    const a = vals[i - 1];
    const b = vals[i];
    if (a === null || b === null) continue;
    steps++;
    if (b === a + 1 || b === 1) good++;
  }
  if (steps < 2 || good < 0.8 * steps) return null;
  return vals;
}
