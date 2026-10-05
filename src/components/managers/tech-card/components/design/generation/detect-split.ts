/**
 * ═══ WHERE A SHEET OF N VIEWS CUTS ITSELF (05.10, owner item 11, R19, T26) ═══════════════════════
 *
 * Owner, verbatim: «можно ли как-то … на воркбенче когда нам надо сделать сплит автоматически его
 * делать». A FLAT / FABRIC RENDER run answers with one sheet of N views laid left → right on white;
 * the views are separated by runs of empty columns. This is the reference detector
 * (`tmp/plans/paint-parts/autosplit/split.py`, 6/6 real beta sheets) as a pure module — no DOM, so
 * the node probe (`scripts/autosplit-probe.mjs`) runs the very code the bench runs.
 *
 *   1. ink = darker than near-white (min channel < 235) OR coloured (chroma > 18), then a binary
 *      opening (3×3 cross, one pass) wipes specks;
 *   2. a column is occupied when it holds more ink than 0.4 % of the height;
 *   3. between the first and the last occupied column, the N−1 WIDEST empty runs are the gaps; the
 *      cuts sit at their middles;
 *   4. each segment's frame is the tight box of its ink (rows and columns) + 2 % of the height.
 *
 * CONFIDENT = exactly N−1 gaps, each at least 1 % of the width. Only a confident answer may cut
 * without a person (the bench's auto-cut); otherwise the cuts fall back to equal parts, each nudged
 * to the thinnest-ink column within ±W/(4N), and the editor is merely SEEDED with them.
 */

export type SplitBox = {
  /** Pixel box, `x1`/`y1` inclusive — `split.py`'s own tuple, kept for the probe. */
  x0: number;
  y0: number;
  x1: number;
  y1: number;
};

export type SplitFrame = { x: number; y: number; w: number; h: number };

export type SplitDetection = {
  confident: boolean;
  /** Widths of the chosen gaps, px, left → right. */
  gaps: number[];
  /** One per view, left → right; `null` = a segment without ink (never on a confident sheet). */
  boxes: (SplitBox | null)[];
  /** The boxes normalised 0..1 of the image (a segment without ink → its whole column band). */
  frames: SplitFrame[];
};

const INK_MIN = 235;
const INK_CHROMA = 18;
const COL_SHARE = 0.004;
const GAP_SHARE = 0.01;
const PAD_SHARE = 0.02;

/** The ink mask (1 = ink) after one opening with the 4-connected cross, border = background. */
export function inkMask(rgba: Uint8ClampedArray | Uint8Array, w: number, h: number): Uint8Array {
  const raw = new Uint8Array(w * h);
  for (let i = 0, p = 0; i < raw.length; i += 1, p += 4) {
    const r = rgba[p];
    const g = rgba[p + 1];
    const b = rgba[p + 2];
    const lo = r < g ? (r < b ? r : b) : g < b ? g : b;
    const hi = r > g ? (r > b ? r : b) : g > b ? g : b;
    raw[i] = lo < INK_MIN || hi - lo > INK_CHROMA ? 1 : 0;
  }
  // Erosion: a pixel survives when it and its four neighbours are ink (outside counts as paper).
  const er = new Uint8Array(w * h);
  for (let y = 1; y < h - 1; y += 1) {
    const row = y * w;
    for (let x = 1; x < w - 1; x += 1) {
      const i = row + x;
      er[i] = raw[i] & raw[i - 1] & raw[i + 1] & raw[i - w] & raw[i + w];
    }
  }
  // Dilation back with the same cross.
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y += 1) {
    const row = y * w;
    for (let x = 0; x < w; x += 1) {
      const i = row + x;
      out[i] =
        er[i] |
        (x > 0 ? er[i - 1] : 0) |
        (x < w - 1 ? er[i + 1] : 0) |
        (y > 0 ? er[i - w] : 0) |
        (y < h - 1 ? er[i + w] : 0);
    }
  }
  return out;
}

/** Where a sheet of `n` views cuts — `null` when `n` < 2 or the sheet holds no ink at all. */
export function detectSplit(
  rgba: Uint8ClampedArray | Uint8Array,
  w: number,
  h: number,
  n: number,
): SplitDetection | null {
  if (n < 2 || w < 2 || h < 2) return null;
  const ink = inkMask(rgba, w, h);
  const prof = new Int32Array(w);
  for (let y = 0; y < h; y += 1) {
    const row = y * w;
    for (let x = 0; x < w; x += 1) prof[x] += ink[row + x];
  }
  const need = Math.max(2, h * COL_SHARE);
  const col = new Uint8Array(w);
  let first = -1;
  let last = -1;
  for (let x = 0; x < w; x += 1) {
    if (prof[x] > need) {
      col[x] = 1;
      if (first < 0) first = x;
      last = x;
    }
  }
  if (first < 0) return null;

  // Empty runs inside [first..last]: [len, start, end) — the widest N−1, ties to the later start
  // (Python's reverse tuple sort), then back in left → right order.
  const runs: [number, number, number][] = [];
  for (let i = first; i <= last; ) {
    if (col[i]) {
      i += 1;
      continue;
    }
    let j = i;
    while (j <= last && !col[j]) j += 1;
    runs.push([j - i, i, j]);
    i = j;
  }
  runs.sort((a, b) => b[0] - a[0] || b[1] - a[1] || b[2] - a[2]);
  const gaps = runs.slice(0, n - 1).sort((a, b) => a[1] - b[1]);
  const confident = gaps.length === n - 1 && gaps.every((g) => g[0] >= w * GAP_SHARE);

  let cuts: number[];
  if (gaps.length === n - 1) {
    cuts = [first, ...gaps.map((g) => Math.floor((g[1] + g[2]) / 2)), last + 1];
  } else {
    cuts = [first];
    for (let k = 1; k < n; k += 1) cuts.push(Math.trunc(first + ((last - first) * k) / n));
    cuts.push(last + 1);
    const span = Math.floor((last - first) / (n * 4));
    for (let k = 1; k < n; k += 1) {
      const c = cuts[k];
      const lo = Math.max(0, c - span);
      const hi = Math.min(w, c + span);
      let best = lo;
      for (let x = lo; x < hi; x += 1) if (prof[x] < prof[best]) best = x;
      if (hi > lo) cuts[k] = best;
    }
  }

  const pad = Math.trunc(PAD_SHARE * h);
  const boxes: (SplitBox | null)[] = [];
  const frames: SplitFrame[] = [];
  for (let k = 0; k < n; k += 1) {
    const a = cuts[k];
    const b = Math.max(a, cuts[k + 1]);
    let xa = -1;
    let xb = -1;
    let ya = -1;
    let yb = -1;
    for (let y = 0; y < h; y += 1) {
      const row = y * w;
      let any = false;
      for (let x = a; x < b; x += 1) {
        if (ink[row + x]) {
          any = true;
          if (xa < 0 || x < xa) xa = x;
          if (x > xb) xb = x;
        }
      }
      if (any) {
        if (ya < 0) ya = y;
        yb = y;
      }
    }
    if (ya < 0) {
      boxes.push(null);
      frames.push({ x: a / w, y: 0, w: Math.max(1, b - a) / w, h: 1 });
      continue;
    }
    const box = {
      x0: Math.max(0, xa - pad),
      y0: Math.max(0, ya - pad),
      x1: Math.min(w, xb + pad),
      y1: Math.min(h, yb + pad),
    };
    boxes.push(box);
    const x1 = Math.min(w, box.x1 + 1);
    const y1 = Math.min(h, box.y1 + 1);
    frames.push({ x: box.x0 / w, y: box.y0 / h, w: (x1 - box.x0) / w, h: (y1 - box.y0) / h });
  }
  return { confident, gaps: gaps.map((g) => g[0]), boxes, frames };
}

/** The long side the browser reads a sheet at — the beta sheets are ~1774 px, the reference's size. */
export const DETECT_SIDE = 1800;
