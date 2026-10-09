// assemble (F2) — overview pages. Burda (palto p2, zhaket p1, robe p11, polupalto p5/p56) and
// blazer (p1) print the whole sheet reduced, with the tile grid drawn over it. The grid is a free,
// independent check of the assembly: its cells must have the tile pitch's aspect, its cell count
// the layout's, and the drawing inside it, scaled by pitch/cell, the assembled sheet's extent.

import type { BoxMm, IRPage, IRPath } from 'lib/pattern-import/types';

export type Lattice = {
  /** Vertical line positions (x) and horizontal ones (y), page mm, ascending. */
  xs: number[];
  ys: number[];
  sx: number;
  sy: number;
  box: BoxMm;
};

type Line = { pos: number; len: number; lo: number; hi: number };

function axisLines(paths: IRPath[], minLen: number): { v: Line[]; h: Line[] } {
  const v: Line[] = [];
  const h: Line[] = [];
  for (const p of paths) {
    const n = p.pts.length;
    const ne = p.closed ? n : n - 1;
    for (let i = 0; i < ne; i++) {
      const a = p.pts[i];
      const b = p.pts[(i + 1) % n];
      if (Math.abs(a.x - b.x) < 0.05 && Math.abs(a.y - b.y) >= minLen)
        v.push({
          pos: (a.x + b.x) / 2,
          len: Math.abs(a.y - b.y),
          lo: Math.min(a.y, b.y),
          hi: Math.max(a.y, b.y),
        });
      else if (Math.abs(a.y - b.y) < 0.05 && Math.abs(a.x - b.x) >= minLen)
        h.push({
          pos: (a.y + b.y) / 2,
          len: Math.abs(a.x - b.x),
          lo: Math.min(a.x, b.x),
          hi: Math.max(a.x, b.x),
        });
    }
  }
  return { v, h };
}

/** Merge collinear segments into one line per position (0.3 mm), with total length and span. */
function mergeLines(ls: Line[]): Line[] {
  const s = [...ls].sort((a, b) => a.pos - b.pos);
  const out: Line[] = [];
  for (const l of s) {
    const last = out[out.length - 1];
    if (last && Math.abs(last.pos - l.pos) < 0.3) {
      last.len += l.len;
      last.lo = Math.min(last.lo, l.lo);
      last.hi = Math.max(last.hi, l.hi);
    } else out.push({ ...l });
  }
  return out;
}

/** Longest arithmetic run of line positions (spacing within 1 % / 0.3 mm), ≥ 3 lines. */
function bestRun(lines: Line[], minSpacing: number): Line[] {
  let best: Line[] = [];
  const n = lines.length;
  for (let i = 0; i < n; i++)
    for (let j = i + 1; j < n; j++) {
      const s = lines[j].pos - lines[i].pos;
      if (s < minSpacing) continue;
      const run = [lines[i], lines[j]];
      let next = lines[j].pos + s;
      for (let k = j + 1; k < n; k++) {
        const tol = Math.max(0.3, 0.01 * s);
        if (Math.abs(lines[k].pos - next) <= tol) {
          run.push(lines[k]);
          next = lines[k].pos + s;
        } else if (lines[k].pos > next + tol) break;
      }
      const score = (r: Line[]) => r.length * 1e6 + r.reduce((t, l) => t + l.len, 0);
      if (run.length >= 3 && score(run) > score(best)) best = run;
    }
  return best;
}

/**
 * The tile grid drawn on a page, if any: ≥ 3 equally spaced vertical AND horizontal lines that
 * each span most of the grid. `aspect` (cell w/h expected, from the sheet pitch) breaks ties.
 */
export function detectLattice(page: IRPage, aspect?: number): Lattice | null {
  const strokes = page.paths.filter((p) => !(page.styles[p.style]?.fill && !page.styles[p.style]?.widthMm));
  const { v, h } = axisLines(strokes, 5);
  // Grid lines are the long ones; keeping only lines ≥ 15 % of the longest span keeps the run
  // search small on a 26 000-stroke overview (palto p2).
  const long = (ls: Line[]) => {
    const m = Math.max(0, ...ls.map((l) => l.hi - l.lo));
    return ls.filter((l) => l.hi - l.lo >= 0.15 * m).slice(0, 400);
  };
  const V = long(mergeLines(v));
  const H = long(mergeLines(h));
  const vr = bestRun(V, 10);
  const hr = bestRun(H, 10);
  if (vr.length < 3 || hr.length < 3) return null;
  const xs = vr.map((l) => l.pos);
  const ys = hr.map((l) => l.pos);
  const sx = (xs[xs.length - 1] - xs[0]) / (xs.length - 1);
  const sy = (ys[ys.length - 1] - ys[0]) / (ys.length - 1);
  // Grid lines span the grid: each vertical line covers ≥ 60 % of the horizontal run's extent.
  const spanY = ys[ys.length - 1] - ys[0];
  const spanX = xs[xs.length - 1] - xs[0];
  const vOk = vr.filter((l) => l.hi - l.lo >= 0.6 * spanY).length >= 0.6 * vr.length;
  const hOk = hr.filter((l) => l.hi - l.lo >= 0.6 * spanX).length >= 0.6 * hr.length;
  if (!vOk || !hOk) return null;
  if (aspect && Math.abs(sx / sy / aspect - 1) > 0.05) return null;
  return {
    xs,
    ys,
    sx,
    sy,
    box: { minX: xs[0], minY: ys[0], maxX: xs[xs.length - 1], maxY: ys[ys.length - 1] },
  };
}

/** Bbox of the drawing (not the grid, not tiny marks) among `paths`, optionally inside `within`. */
export function drawingBox(paths: IRPath[], minLenMm: number, within?: BoxMm): BoxMm | null {
  let b: BoxMm | null = null;
  for (const p of paths) {
    if (p.pts.length < 2) continue;
    // Straight axis-aligned 2-point lines are rulings (tile grid, frames) — not drawing.
    if (p.pts.length === 2) {
      const [a, c] = p.pts;
      if (Math.abs(a.x - c.x) < 0.05 || Math.abs(a.y - c.y) < 0.05) continue;
    }
    let len = 0;
    for (let i = 1; i < p.pts.length; i++)
      len += Math.hypot(p.pts[i].x - p.pts[i - 1].x, p.pts[i].y - p.pts[i - 1].y);
    if (len < minLenMm) continue;
    for (const v of p.pts) {
      if (within && (v.x < within.minX || v.x > within.maxX || v.y < within.minY || v.y > within.maxY))
        continue;
      if (!b) b = { minX: v.x, minY: v.y, maxX: v.x, maxY: v.y };
      else {
        if (v.x < b.minX) b.minX = v.x;
        if (v.y < b.minY) b.minY = v.y;
        if (v.x > b.maxX) b.maxX = v.x;
        if (v.y > b.maxY) b.maxY = v.y;
      }
    }
  }
  return b;
}
