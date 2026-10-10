// chains/ (F3) — page furniture to ignore, and "looks": clusters of chains drawn alike.
//
// A look is NOT a size: palto's 5 sizes show up as more looks (one style fragments when dash phase
// or decorations differ) and two sizes can share a look; viola draws 8 sizes in ~8 looks of 3
// line weights. Looks are evidence; sizes are decided in sizes/recover.ts with bundles.
import { dimensionsIn, SQUARE_KEYWORD } from 'lib/pattern-import/adapters/pdf/scale';
import type {
  Chain,
  ClassEvidence,
  IRText,
  LineClass,
  PagePose,
  PtMm,
  Style,
} from 'lib/pattern-import/types';
import { PATIMPORT } from 'lib/pattern-import/types';

import { bboxOf, dist, PtGrid, SegGrid, segNearest } from './geom';
import { normDash } from './link';
import { cosine, type Signature } from './motif';

export const LOOK = { minCos: 0.88, attachCos: 0.93 };

export function straightAxis(c: Chain): { axis: 'x' | 'y' | null; straight: boolean } {
  const a = c.pts[0];
  const b = c.pts[c.pts.length - 1];
  const L = dist(a, b);
  if (L < 1e-6) return { axis: null, straight: false };
  let dev = 0;
  for (const p of c.pts) {
    const d = Math.abs((p.x - a.x) * (b.y - a.y) - (p.y - a.y) * (b.x - a.x)) / L;
    if (d > dev) dev = d;
  }
  const straight = dev < 0.3 && c.lengthMm < L * 1.01;
  const ang = Math.abs(Math.atan2(b.y - a.y, b.x - a.x) * (180 / Math.PI)) % 180;
  const axis = ang < 0.3 || ang > 179.7 ? 'x' : Math.abs(ang - 90) < 0.3 ? 'y' : null;
  return { axis, straight };
}

/**
 * Page furniture per chain (null = line work): sheet grids and watermarks (light grey), tile
 * frames (axis-aligned rectangles or straight lines repeated ≥ 3 times with the same size — every
 * tile prints one), dashed guides (long axis-aligned dashed lines, thin).
 */
export function furniture(
  chains: Chain[],
  styles: Map<number, Style>,
  poses: PagePose[] = [],
  texts: readonly IRText[] = [],
  /** Source file per chain when the files are overlays (file per size): repetition evidence. */
  fileOf?: (i: number) => string,
): (string | null)[] {
  const out: (string | null)[] = chains.map(() => null);
  pageMarginLines(chains, poses, out);
  for (const i of lettering(chains)) out[i] = out[i] ?? 'lettering';
  for (const i of tileFrameLines(chains, poses)) out[i] = out[i] ?? 'tile frame';
  const grid = backgroundGrid(chains);
  for (const i of grid) out[i] = out[i] ?? 'background grid';
  for (const i of testSquares(chains, poses, texts, out)) out[i] = out[i] ?? 'test square';
  const greyWhy = lightGrey(
    chains,
    styles,
    texts,
    out,
    new Set(grid.map((i) => chains[i].style)),
    fileOf,
    poses,
  );
  const rects = new Map<string, number[]>();
  const lines = new Map<string, number[]>();
  // pens that also draw curves are garment pens: reef draws every size dashed (dash-dot, dash-dot-
  // dot…), so a size's straight fold edge or band edge is NOT a dashed guide
  const pen = (st: Style | undefined) =>
    st
      ? `${st.strokeRgb?.join(',')}|${st.widthMm.toFixed(2)}|${(st.dash ? normDash(st.dash) : [])
          .map((v) => (Math.round(v * 2) / 2).toFixed(1))
          .join('/')}`
      : '';
  const curvedPens = new Set<string>();
  chains.forEach((c) => {
    if (c.lengthMm < 40) return;
    if (!straightAxis(c).straight) curvedPens.add(pen(styles.get(c.style)));
  });
  chains.forEach((c, i) => {
    const st = styles.get(c.style);
    if (greyWhy[i]) {
      out[i] = out[i] ?? (greyWhy[i] as string);
      return;
    }
    const { axis, straight } = straightAxis(c);
    if (straight && axis && c.lengthMm >= 40) {
      if (st?.dash && (st.widthMm <= 0.2 || c.lengthMm >= 150) && !curvedPens.has(pen(st))) {
        out[i] = 'dashed guide';
        return;
      }
      if (c.lengthMm >= 100) {
        const k = `${axis}|${Math.round(c.lengthMm)}`;
        const a = lines.get(k);
        if (a) a.push(i);
        else lines.set(k, [i]);
      }
      return;
    }
    // closed axis-aligned rectangle
    const bb = bboxOf(c.pts);
    const w = bb.maxX - bb.minX;
    const h = bb.maxY - bb.minY;
    if (w < 80 || h < 80) return;
    const onBox = c.pts.every(
      (p) =>
        Math.min(Math.abs(p.x - bb.minX), Math.abs(p.x - bb.maxX)) < 0.3 ||
        Math.min(Math.abs(p.y - bb.minY), Math.abs(p.y - bb.maxY)) < 0.3,
    );
    const a0 = c.pts[0];
    const a1 = c.pts[c.pts.length - 1];
    if (onBox && dist(a0, a1) < 1 && Math.abs(c.lengthMm - 2 * (w + h)) < 2) {
      const k = `${Math.round(w)}x${Math.round(h)}`;
      const a = rects.get(k);
      if (a) a.push(i);
      else rects.set(k, [i]);
    }
  });
  // a tile frame repeats per page, at DIFFERENT places; one rectangle drawn identically in every
  // size layer (kombinezon's piece 8, cut to the same size for all) is line work
  for (const a of rects.values()) {
    if (a.length < 3) continue;
    const centres: PtMm[] = [];
    for (const i of a) {
      const b = bboxOf(chains[i].pts);
      const c = { x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 };
      if (!centres.some((q) => dist(q, c) < 20)) centres.push(c);
    }
    if (centres.length >= 3) for (const i of a) out[i] = 'tile frame';
  }
  // straight rules of one length: tile frames and cut marks repeat per PAGE, far apart; a ladder of
  // equal-length lines 1–3 mm apart is a graded edge (r4454's pocket sides: every size 208 mm long,
  // graded only in width) — a member with a twin ≤ 15 mm across it is line work
  for (const [k, a] of lines) {
    if (a.length < 3) continue;
    const ax = k.startsWith('x') ? 'x' : 'y';
    const at = (i: number) => {
      const b = bboxOf(chains[i].pts);
      return ax === 'x'
        ? { v: (b.minY + b.maxY) / 2, lo: b.minX, hi: b.maxX }
        : { v: (b.minX + b.maxX) / 2, lo: b.minY, hi: b.maxY };
    };
    const lone = a.filter((i) => {
      const p = at(i);
      return !a.some((j) => {
        if (j === i) return false;
        const q = at(j);
        return Math.abs(q.v - p.v) <= 15 && Math.min(p.hi, q.hi) - Math.max(p.lo, q.lo) > 0;
      });
    });
    if (lone.length >= 3) for (const i of lone) out[i] = 'tile frame / cut mark';
  }
  return out;
}

/** A glyph cluster: polylines that touch (an end within `touchMm` of another's segment). */
export type GlyphCluster = {
  ids: number[];
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  /** Total turning inside the member polylines, rad (corners BETWEEN members are not counted). */
  turn: number;
};

/** Total turning of a polyline, rad: glyphs are full of corners and bowls, rules and ticks are not. */
export function turnOf(p: readonly PtMm[]): number {
  let t = 0;
  for (let k = 1; k + 1 < p.length; k++) {
    const a = Math.atan2(p[k].y - p[k - 1].y, p[k].x - p[k - 1].x);
    const b = Math.atan2(p[k + 1].y - p[k].y, p[k + 1].x - p[k].x);
    let d = Math.abs(b - a);
    if (d > Math.PI) d = 2 * Math.PI - d;
    t += d;
  }
  return t;
}

/**
 * Glyph clusters among polylines (lettering(), A8 clean): every polyline at most `maxExtentMm`
 * across is a candidate; candidates whose end lies within `touchMm` of another candidate's segment
 * are one cluster. Index = position in `polys`.
 */
export function glyphClusters(
  polys: readonly (readonly PtMm[])[],
  maxExtentMm: number,
  touchMm = 0.6,
  keep: (i: number) => boolean = () => true,
  /** Join only END to END (outline letters close at corners; a T-joint or a crossing never joins). */
  endsOnly = false,
): GlyphCluster[] {
  const small: number[] = [];
  const bb = polys.map((p) => bboxOf(p as PtMm[]));
  polys.forEach((p, i) => {
    const b = bb[i];
    if (p.length >= 2 && keep(i) && Math.max(b.maxX - b.minX, b.maxY - b.minY) <= maxExtentMm)
      small.push(i);
  });
  if (small.length < 4) return [];
  const grid = new SegGrid(4);
  for (const i of small) grid.addPolyline(i, polys[i] as PtMm[]);
  const parent = new Map<number, number>(small.map((i) => [i, i]));
  const find = (i: number): number => {
    let r = i;
    while (parent.get(r) !== r) r = parent.get(r)!;
    let j = i;
    while (parent.get(j) !== r) {
      const n = parent.get(j)!;
      parent.set(j, r);
      j = n;
    }
    return r;
  };
  for (const i of small) {
    const pts = polys[i];
    for (const p of [pts[0], pts[pts.length - 1]])
      grid.near(p, touchMm, (o, sIdx) => {
        if (o === i) return;
        const q = polys[o];
        if (endsOnly) {
          const e0 = q[0];
          const e1 = q[q.length - 1];
          if (dist(p, e0) > touchMm && dist(p, e1) > touchMm) return;
        } else if (segNearest(p, q[sIdx], q[sIdx + 1]).d > touchMm) return;
        parent.set(find(o), find(i));
      });
  }
  const cls = new Map<number, GlyphCluster>();
  for (const i of small) {
    const r = find(i);
    const b = bb[i];
    const c = cls.get(r);
    if (!c) cls.set(r, { ids: [i], ...b, turn: turnOf(polys[i]) });
    else {
      c.ids.push(i);
      c.turn += turnOf(polys[i]);
      c.minX = Math.min(c.minX, b.minX);
      c.minY = Math.min(c.minY, b.minY);
      c.maxX = Math.max(c.maxX, b.maxX);
      c.maxY = Math.max(c.maxY, b.maxY);
    }
  }
  return [...cls.values()];
}

/** One text line found among glyph clusters, in its own frame (u along, v across). */
export type GlyphRun = {
  along: 'x' | 'y';
  /** The clusters that make the line, in reading order. */
  glyphs: GlyphCluster[];
  /** Every cluster inside the line's band (the dot of ".PL", an inner bowl) — includes `glyphs`. */
  members: GlyphCluster[];
  /** Glyph height (across the line) of the first glyph, mm. */
  heightMm: number;
  box: { minX: number; minY: number; maxX: number; maxY: number };
};

export type GlyphRunOpts = {
  /** Glyphs in a line, at least. */
  minRun: number;
  /** Height tolerance (share of the first glyph's height). */
  hTol: number;
  /** Centre-line tolerance (share of the height). */
  vcTol: number;
  /** Largest gap between glyphs (share of the height). */
  maxGap: number;
  /** Smallest gap (negative = overlap allowed, share of the height). */
  minGap: number;
  /** Clusters lower than this are not glyphs that start or extend a line (they may sit inside one). */
  minHeightMm: number;
  /** Extra test on a candidate line (widths, turning, stroke count). */
  accept: (run: { glyph: GlyphCluster; u0: number; u1: number; h: number; w: number }[]) => boolean;
};

/**
 * Text lines among glyph clusters: ≥ `minRun` clusters of one height (± hTol) on one centre line
 * (± vcTol of the height), each within `maxGap` heights of the next, along x or (rotated text)
 * along y — the caller's `accept` adds what makes the row a WORD and not a row of equal parts.
 */
export function glyphRuns(clusters: readonly GlyphCluster[], o: GlyphRunOpts): GlyphRun[] {
  const out: GlyphRun[] = [];
  for (const along of ['x', 'y'] as const) {
    // glyph frame: u along the line, v across (height)
    const g = clusters.map((c) => {
      const u0 = along === 'x' ? c.minX : c.minY;
      const u1 = along === 'x' ? c.maxX : c.maxY;
      const v0 = along === 'x' ? c.minY : c.minX;
      const v1 = along === 'x' ? c.maxY : c.maxX;
      return { glyph: c, u0, u1, v0, v1, h: v1 - v0, w: u1 - u0, vc: (v0 + v1) / 2 };
    });
    const tall = g.filter((x) => x.h >= o.minHeightMm).sort((a, b) => a.u0 - b.u0);
    const used = new Set<(typeof g)[number]>();
    for (const start of tall) {
      if (used.has(start)) continue;
      const run = [start];
      let last = start;
      for (const x of tall) {
        if (x.u0 <= last.u0 || used.has(x)) continue;
        if (Math.abs(x.h - start.h) > o.hTol * start.h) continue;
        if (Math.abs(x.vc - start.vc) > o.vcTol * start.h) continue;
        const gap = x.u0 - last.u1;
        if (gap > o.maxGap * start.h) continue;
        if (gap < o.minGap * start.h) continue;
        run.push(x);
        last = x;
      }
      if (run.length < o.minRun) continue;
      if (!o.accept(run)) continue;
      for (const x of run) used.add(x);
      const u0 = run[0].u0;
      const u1 = last.u1;
      const v0 = Math.min(...run.map((x) => x.v0));
      const v1 = Math.max(...run.map((x) => x.v1));
      const members = g
        .filter((x) => x.u0 >= u0 - 0.5 && x.u1 <= u1 + 0.5 && x.v0 >= v0 - 0.5 && x.v1 <= v1 + 0.5)
        .map((x) => x.glyph);
      out.push({
        along,
        glyphs: run.map((x) => x.glyph),
        members,
        heightMm: start.h,
        box:
          along === 'x'
            ? { minX: u0, maxX: u1, minY: v0, maxY: v1 }
            : { minX: v0, maxX: v1, minY: u0, maxY: u1 },
      });
    }
  }
  return out;
}

const med = (v: number[]) => v.slice().sort((a, b) => a - b)[(v.length - 1) >> 1];

/**
 * Lettering drawn as line work (wm's "WWW.PAFAVERO.PL" watermark, 60 mm outline glyphs in every
 * size file; "ID: 1 PRZÓD" stencil text): chain indices. Small chains (≤ 120 mm across) that touch
 * form glyph clusters; a TEXT LINE is ≥ 4 clusters of one height (± 15 %) on one baseline band,
 * each within 1.2 heights of the next, along x or (rotated text) along y — and not all of one width
 * (a row of identical belt loops or labels is not text), and glyphs are two-dimensional (median
 * width ≥ ¼ height, lower median: a legend's stacked line swatches are not) and turn (median ≥ 3 rad per glyph: band
 * end ticks are straight). Smaller clusters inside a text line's band
 * between its glyphs (the dot of ".PL") go with it.
 */
export function lettering(chains: Chain[]): number[] {
  const all = glyphClusters(
    chains.map((c) => c.pts),
    120,
  ).filter((c) => Math.max(c.maxX - c.minX, c.maxY - c.minY) <= 110);
  const text = new Set<number>();
  const runs = glyphRuns(all, {
    minRun: 4,
    hTol: 0.15,
    vcTol: 0.2,
    maxGap: 1.2,
    minGap: -0.2,
    minHeightMm: 3,
    accept: (run) => {
      const ws = run.map((x) => x.w);
      if (Math.max(...ws) < 1.15 * Math.min(...ws)) return false;
      // glyphs are two-dimensional: a legend's stacked line swatches are flat
      if (med(ws) < 0.25 * run[0].h) return false;
      // and they turn: median ≥ 3 rad per glyph (an "E" stroke has four corners, an "O" a
      // full turn); a row of straight ticks or swatches does not turn at all
      return med(run.map((x) => x.glyph.turn)) >= 3;
    },
  });
  for (const r of runs) for (const c of r.members) for (const i of c.ids) text.add(i);
  return [...text];
}

/** A page's rectangle in sheet frame (bbox of its transformed corners). */
function pageRect(p: PagePose): { minX: number; minY: number; maxX: number; maxY: number } {
  const t = p.toSheet;
  const cs = [
    [0, 0],
    [p.widthMm, 0],
    [0, p.heightMm],
    [p.widthMm, p.heightMm],
  ].map(([x, y]) => ({ x: t.a * x + t.c * y + t.e, y: t.b * x + t.d * y + t.f }));
  return bboxOf(cs);
}

/**
 * Page margin lines (Redcafe: a 589 mm rule 12 mm inside every page row, with a 15 mm glue hook,
 * drawn in the size pen so F3 took it for size 44). A thin axis-aligned band (≤ 2.5 mm across,
 * ≥ 100 mm along) whose ends both stop at page edges, lying within 15 mm inside a parallel page
 * edge, at a page-relative offset that ≥ 3 such chains share (every page / file prints one). Garment lines are not repeated at one
 * page-relative offset, so they never collect 3 votes.
 */
function pageMarginLines(chains: Chain[], poses: PagePose[], out: (string | null)[]): void {
  if (!poses.length) return;
  const rects = poses.map(pageRect);
  const byKey = new Map<string, Set<number>>();
  chains.forEach((c, i) => {
    if (out[i]) return;
    const bb = bboxOf(c.pts);
    const w = bb.maxX - bb.minX;
    const h = bb.maxY - bb.minY;
    const axis = h <= 2.5 && w >= 100 ? 'x' : w <= 2.5 && h >= 100 ? 'y' : null;
    if (!axis) return;
    // the band's own coordinate: where most of its length lies (the long run, not the hook)
    let best = 0;
    let at = 0;
    for (let k = 1; k < c.pts.length; k++) {
      const a = c.pts[k - 1];
      const b = c.pts[k];
      const L = axis === 'x' ? Math.abs(b.x - a.x) : Math.abs(b.y - a.y);
      if (L > best) {
        best = L;
        at = axis === 'x' ? (a.y + b.y) / 2 : (a.x + b.x) / 2;
      }
    }
    // both ends of the band stop at page edges (a margin rule runs page edge to page edge; a
    // garment edge parked on the margin — wm's fold lines at x = 12 — ends mid-page)
    const a0 = axis === 'x' ? bb.minX : bb.minY;
    const a1 = axis === 'x' ? bb.maxX : bb.maxY;
    const atEdge = (v: number) =>
      rects.some((r) =>
        (axis === 'x' ? [r.minX, r.maxX] : [r.minY, r.maxY]).some((e) => Math.abs(v - e) <= 15),
      );
    if (!atEdge(a0) || !atEdge(a1)) return;
    for (const r of rects) {
      const lo = axis === 'x' ? Math.max(bb.minX, r.minX) : Math.max(bb.minY, r.minY);
      const hi = axis === 'x' ? Math.min(bb.maxX, r.maxX) : Math.min(bb.maxY, r.maxY);
      if (hi - lo < 50) continue;
      const e0 = axis === 'x' ? r.minY : r.minX;
      const e1 = axis === 'x' ? r.maxY : r.maxX;
      for (const off of [at - e0, e1 - at]) {
        if (off < -0.5 || off > 15) continue;
        const k = `${axis}|${Math.round(off * 2) / 2}`;
        const s = byKey.get(k);
        if (s) s.add(i);
        else byKey.set(k, new Set([i]));
      }
    }
  });
  for (const s of byKey.values())
    if (s.size >= 3) for (const i of s) out[i] = out[i] ?? 'page margin line';
}

/** Axis-aligned straight runs of a polyline (collinear edges merged), at least `minMm` long. */
export type Run = { axis: 'x' | 'y'; at: number; lo: number; hi: number; len: number };
export function axisRuns(pts: readonly PtMm[], closed: boolean, minMm: number): Run[] {
  const out: Run[] = [];
  const P = closed && pts.length > 2 ? [...pts, pts[0]] : pts;
  let cur: Run | null = null;
  const flush = () => {
    if (cur && cur.len >= minMm) out.push(cur);
    cur = null;
  };
  for (let i = 1; i < P.length; i++) {
    const a = P[i - 1];
    const b = P[i];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const L = Math.hypot(dx, dy);
    if (L < 1e-6) continue;
    const axis =
      Math.abs(dy) <= 0.3 && Math.abs(dy) <= 0.01 * L
        ? 'x'
        : Math.abs(dx) <= 0.3 && Math.abs(dx) <= 0.01 * L
          ? 'y'
          : null;
    if (!axis) {
      flush();
      continue;
    }
    const at = axis === 'x' ? (a.y + b.y) / 2 : (a.x + b.x) / 2;
    const lo = axis === 'x' ? Math.min(a.x, b.x) : Math.min(a.y, b.y);
    const hi = axis === 'x' ? Math.max(a.x, b.x) : Math.max(a.y, b.y);
    const c = cur as Run | null;
    if (
      c &&
      c.axis === axis &&
      Math.abs(c.at - at) <= 0.3 &&
      lo <= c.hi + 0.3 &&
      hi >= c.lo - 0.3
    ) {
      c.lo = Math.min(c.lo, lo);
      c.hi = Math.max(c.hi, hi);
      c.len = c.hi - c.lo;
      continue;
    }
    flush();
    cur = { axis, at, lo, hi, len: hi - lo };
  }
  flush();
  return out;
}

/**
 * TILE FRAMES drawn as line work (BLAZER: a 190 × 280 mm frame inside every 210 × 297 page, in the
 * cut-line pen; where tiles meet, the frames share sides and the linker draws them as L, U and
 * staircase chains, so the closed-rectangle test above never sees them). A frame line sits at one
 * page-relative inset that ≥ 3 page POSITIONS share (overlaid per-size files sit at one position
 * and do not vote twice), and runs from frame corner to frame corner: both ends of every run land on
 * a frame line of the other axis. A chain made (≥ 95 %) of such runs is a frame. Garment edges
 * share neither the inset on three tiles nor corner-to-corner ends.
 */
export function tileFrameLines(chains: Chain[], poses: PagePose[]): number[] {
  if (poses.length < 3) return [];
  const rects = poses.map(pageRect);
  const posKey = (r: (typeof rects)[number]) => `${Math.round(r.minX)},${Math.round(r.minY)}`;
  const positions = new Set(rects.map(posKey)).size;
  if (positions < 3) return [];
  const MAXIN = 30;
  const runsOf = chains.map((c) =>
    c.lengthMm >= 20 && c.pts.length >= 2 ? axisRuns(c.pts, c.closed, 15) : [],
  );
  // insets: axis | side (0 = from the low edge, 1 = from the high edge) | inset (0.5 mm) → positions
  const votes = new Map<string, Set<string>>();
  const insetsOf = (run: Run, r: (typeof rects)[number]) => {
    const lo = run.axis === 'x' ? r.minX : r.minY;
    const hi = run.axis === 'x' ? r.maxX : r.maxY;
    if (Math.min(run.hi, hi) - Math.max(run.lo, lo) < 15) return [];
    const e0 = run.axis === 'x' ? r.minY : r.minX;
    const e1 = run.axis === 'x' ? r.maxY : r.maxX;
    const out: { side: 0 | 1; off: number }[] = [];
    for (const [side, off] of [
      [0, run.at - e0],
      [1, e1 - run.at],
    ] as [0 | 1, number][])
      if (off >= 0.5 && off <= MAXIN) out.push({ side, off });
    return out;
  };
  runsOf.forEach((runs) => {
    for (const run of runs)
      for (const r of rects)
        for (const { side, off } of insetsOf(run, r)) {
          const k = `${run.axis}|${side}|${Math.round(off * 2) / 2}`;
          const s = votes.get(k);
          if (s) s.add(posKey(r));
          else votes.set(k, new Set([posKey(r)]));
        }
  });
  const need = Math.max(3, Math.ceil(0.25 * positions));
  const frameIns: { axis: 'x' | 'y'; side: 0 | 1; off: number }[] = [];
  for (const [k, s] of votes) {
    if (s.size < need) continue;
    const [axis, side, off] = k.split('|');
    frameIns.push({ axis: axis as 'x' | 'y', side: Number(side) as 0 | 1, off: Number(off) });
  }
  if (!frameIns.length) return [];
  // the frame lines' coordinates in sheet frame: x of vertical lines, y of horizontal ones
  const lineAt: Record<'x' | 'y', number[]> = { x: [], y: [] };
  for (const f of frameIns)
    for (const r of rects) {
      const e0 = f.axis === 'x' ? r.minY : r.minX;
      const e1 = f.axis === 'x' ? r.maxY : r.maxX;
      lineAt[f.axis].push(f.side === 0 ? e0 + f.off : e1 - f.off);
    }
  const onLine = (axis: 'x' | 'y', v: number) => lineAt[axis].some((w) => Math.abs(w - v) <= 1);
  const isFrameRun = (run: Run) =>
    onLine(run.axis, run.at) &&
    // its ends are frame corners: on a frame line of the other axis
    onLine(run.axis === 'x' ? 'y' : 'x', run.lo) &&
    onLine(run.axis === 'x' ? 'y' : 'x', run.hi);
  const out: number[] = [];
  chains.forEach((c, i) => {
    const runs = runsOf[i];
    if (!runs.length) return;
    let framed = 0;
    let longest = 0;
    for (const run of runs)
      if (isFrameRun(run)) {
        framed += run.len;
        longest = Math.max(longest, run.len);
      }
    if (longest >= 60 && framed >= 0.95 * c.lengthMm) out.push(i);
  });
  return out;
}

/**
 * A BACKGROUND GRID drawn as line work (a 1 cm lattice under the pattern, often thin and light but
 * not always): straight axis-aligned lines of ONE pen at ≥ 8 equally spaced positions (4–26 mm
 * apart) in BOTH directions. Quilting rows run one way; a graded ladder is 1–3 mm apart.
 */
export function backgroundGrid(chains: Chain[]): number[] {
  type Pos = { at: number; ids: number[]; len: number };
  const byPen = new Map<string, Map<number, Pos>>();
  chains.forEach((c, i) => {
    if (c.pts.length < 2 || c.lengthMm < 20) return;
    const { axis, straight } = straightAxis(c);
    if (!straight || !axis) return;
    const a = c.pts[0];
    const at = axis === 'x' ? a.y : a.x;
    const k = `${c.style}|${axis}`;
    let m = byPen.get(k);
    if (!m) byPen.set(k, (m = new Map()));
    const q = Math.round(at * 5);
    const p = m.get(q) ?? m.get(q - 1) ?? m.get(q + 1);
    if (p) {
      p.ids.push(i);
      p.len += c.lengthMm;
    } else m.set(q, { at, ids: [i], len: c.lengthMm });
  });
  const latticeOf = (m: Map<number, Pos>): number[] => {
    const ps = [...m.values()].filter((p) => p.len >= 60).sort((a, b) => a.at - b.at);
    if (ps.length < 8) return [];
    const d: number[] = [];
    for (let k = 1; k < ps.length; k++) d.push(ps[k].at - ps[k - 1].at);
    const per = d.filter((v) => v >= 4 && v <= 26).sort((a, b) => a - b)[
      Math.floor(d.filter((v) => v >= 4 && v <= 26).length / 2)
    ];
    if (!per) return [];
    // the longest run of consecutive positions at that spacing
    let best: Pos[] = [];
    let run: Pos[] = [ps[0]];
    for (let k = 1; k < ps.length; k++) {
      if (Math.abs(d[k - 1] - per) <= Math.max(0.3, 0.03 * per)) run.push(ps[k]);
      else {
        if (run.length > best.length) best = run;
        run = [ps[k]];
      }
    }
    if (run.length > best.length) best = run;
    return best.length >= 8 ? best.flatMap((p) => p.ids) : [];
  };
  const out: number[] = [];
  const pens = new Set([...byPen.keys()].map((k) => k.slice(0, k.lastIndexOf('|'))));
  for (const pen of pens) {
    const gx = byPen.get(`${pen}|x`);
    const gy = byPen.get(`${pen}|y`);
    if (!gx || !gy) continue;
    const a = latticeOf(gx);
    const b = latticeOf(gy);
    if (a.length && b.length) out.push(...a, ...b);
  }
  return out;
}

/** Nominal sides a printed test square is drawn at (mm). */
const SQUARE_MM = [25.4, 30, 40, 50, 50.8, 80, 100, 101.6];

/**
 * The TEST SQUARE drawn as line work (wm: 4 sides of a 100 mm square in every per-size file, in the
 * size pen, with «10 CM» as outline glyphs inside; the front's neck ran out into it). An axis-
 * aligned square of a nominal side (± 0.6 mm), its sides whole chains (or one closed chain), with
 * a label (its dimension or a "test square" word within 45 mm, or drawn lettering inside) or the
 * same square drawn at one place in ≥ 2 overlaid files.
 */
export function testSquares(
  chains: Chain[],
  poses: PagePose[],
  texts: readonly IRText[],
  known: readonly (string | null)[] = [],
): number[] {
  return [...new Set(testSquareBoxes(chains, poses, texts, known).flatMap((q) => q.ids))];
}

/** A test square drawn as line work (`testSquares`), with what proved it. */
export type DrawnSquare = {
  /** Its sides (and every overlaid copy of a side). */
  ids: number[];
  box: { minX: number; minY: number; maxX: number; maxY: number };
  /** The nominal side it is drawn at, mm. */
  nominalMm: number;
  /** What, besides the geometry, says it is the test square. */
  why: 'label' | 'lettering' | 'copies' | 'geometry';
  /** The label text, when a text named it. */
  text?: string;
};

/**
 * `testSquares` with the boxes: `geometryOnly` also returns squares nothing labels (why
 * 'geometry' — one evidence, the A8 clean stage offers them, never applies them alone).
 */
export function testSquareBoxes(
  chains: Chain[],
  poses: PagePose[],
  texts: readonly IRText[],
  known: readonly (string | null)[] = [],
  geometryOnly = false,
): DrawnSquare[] {
  type Side = { i: number; run: Run };
  const h: Side[] = [];
  const v: Side[] = [];
  const closedSq: { i: number; box: { minX: number; minY: number; maxX: number; maxY: number } }[] =
    [];
  chains.forEach((c, i) => {
    if (c.pts.length < 2 || c.lengthMm < 20 || c.lengthMm > 4 * 102 + 2) return;
    const runs = axisRuns(c.pts, c.closed, 20);
    if (runs.length === 1 && Math.abs(runs[0].len - c.lengthMm) <= 1)
      (runs[0].axis === 'x' ? h : v).push({ i, run: runs[0] });
    else if (runs.length === 4 && c.closed) {
      const b = bboxOf(c.pts);
      closedSq.push({ i, box: b });
    }
  });
  const nominal = (s: number) => SQUARE_MM.some((n) => Math.abs(n - s) <= 0.6);
  const boxes: {
    ids: number[];
    box: { minX: number; minY: number; maxX: number; maxY: number };
  }[] = [];
  for (const q of closedSq) {
    const w = q.box.maxX - q.box.minX;
    const hh = q.box.maxY - q.box.minY;
    if (Math.abs(w - hh) <= 0.6 && nominal(w)) boxes.push({ ids: [q.i], box: q.box });
  }
  const near = (a: number, b: number) => Math.abs(a - b) <= 0.6;
  for (const a of h) {
    const s = a.run.len;
    if (!nominal(s)) continue;
    for (const b of h) {
      if (b === a || b.run.at <= a.run.at || !near(b.run.at - a.run.at, s)) continue;
      if (!near(a.run.lo, b.run.lo) || !near(a.run.hi, b.run.hi)) continue;
      const side = (x: number) =>
        v.find((q) => near(q.run.at, x) && near(q.run.lo, a.run.at) && near(q.run.hi, b.run.at));
      const l = side(a.run.lo);
      const r = side(a.run.hi);
      if (!l || !r) continue;
      boxes.push({
        ids: [a.i, b.i, l.i, r.i],
        box: { minX: a.run.lo, minY: a.run.at, maxX: a.run.hi, maxY: b.run.at },
      });
    }
  }
  if (!boxes.length) return [];
  const out: DrawnSquare[] = [];
  for (const q of boxes) {
    const s = q.box.maxX - q.box.minX;
    const reach = 45;
    const label = texts.find((t) => {
      const b = t.bbox;
      const d = Math.hypot(
        Math.max(0, q.box.minX - b.maxX, b.minX - q.box.maxX),
        Math.max(0, q.box.minY - b.maxY, b.minY - q.box.maxY),
      );
      return (
        d <= reach &&
        (SQUARE_KEYWORD.test(t.text) ||
          dimensionsIn(t.text).some((x) => Math.abs(x - s) <= 0.02 * s))
      );
    });
    const labelled = !!label;
    const lettered =
      !labelled &&
      known.some((w, i) => {
        if (w !== 'lettering') return false;
        const b = bboxOf(chains[i].pts);
        return (
          b.minX >= q.box.minX &&
          b.maxX <= q.box.maxX &&
          b.minY >= q.box.minY &&
          b.maxY <= q.box.maxY
        );
      });
    const copies = boxes.filter(
      (o) =>
        o !== q &&
        near(o.box.minX, q.box.minX) &&
        near(o.box.minY, q.box.minY) &&
        near(o.box.maxX, q.box.maxX) &&
        near(o.box.maxY, q.box.maxY),
    ).length;
    const copied = copies >= 1 && poses.length > 0;
    if (!(labelled || lettered || copied || geometryOnly)) continue;
    const ids = [...q.ids];
    // every copy of a side (one per overlaid file) goes with it
    const b = q.box;
    for (const x of h)
      if (
        (near(x.run.at, b.minY) || near(x.run.at, b.maxY)) &&
        near(x.run.lo, b.minX) &&
        near(x.run.hi, b.maxX)
      )
        ids.push(x.i);
    for (const x of v)
      if (
        (near(x.run.at, b.minX) || near(x.run.at, b.maxX)) &&
        near(x.run.lo, b.minY) &&
        near(x.run.hi, b.maxY)
      )
        ids.push(x.i);
    out.push({
      ids: [...new Set(ids)],
      box: q.box,
      nominalMm: SQUARE_MM.reduce((a, n) => (Math.abs(n - s) < Math.abs(a - s) ? n : a)),
      why: labelled ? 'label' : lettered ? 'lettering' : copied ? 'copies' : 'geometry',
      text: label?.text,
    });
  }
  return out;
}

/**
 * OVERPRINT in files laid over each other (file per size): a line drawn identically (ends within
 * 1 mm) in ≥ 3 files — and in ≥ half of them — that CROSSES a line of its own file which is not
 * drawn that way (a graded outline: it runs on ≥ 2 mm past the crossing on both sides). wm prints
 * «WWW.PAFAVERO.PL» in 60 mm outline letters over every size's front; the strokes crossing the
 * neck curves were walls of every size and spiked the neckline. A shared garment edge (the centre
 * front every size ends on) meets graded lines in T-junctions, never crosses them; notches
 * (< 30 mm) are left to the notch test.
 */
export function overprintLines(
  chains: Chain[],
  fileOf: (i: number) => string,
  known: readonly (string | null)[] = [],
): number[] {
  const files = new Set(chains.map((_, i) => fileOf(i)));
  if (files.size < 3) return [];
  const key = (c: Chain) => {
    const a = c.pts[0];
    const b = c.pts[c.pts.length - 1];
    const k1 = `${Math.round(a.x)},${Math.round(a.y)}`;
    const k2 = `${Math.round(b.x)},${Math.round(b.y)}`;
    return `${k1 < k2 ? k1 : k2}|${k1 < k2 ? k2 : k1}|${Math.round(c.lengthMm)}`;
  };
  const byKey = new Map<string, number[]>();
  chains.forEach((c, i) => {
    if (c.pts.length < 2 || c.lengthMm < 30) return;
    const k = key(c);
    const a = byKey.get(k);
    if (a) a.push(i);
    else byKey.set(k, [i]);
  });
  const same = new Set<number>();
  for (const ids of byKey.values()) {
    const fs = new Set(ids.map(fileOf));
    if (fs.size >= 3 && fs.size >= 0.5 * files.size) for (const i of ids) same.add(i);
  }
  if (!same.size) return [];
  const grid = new SegGrid(8);
  chains.forEach((c, i) => {
    if (!same.has(i) && c.pts.length >= 2) grid.addPolyline(i, c.pts);
  });
  // glyph evidence: a STROKE (≤ 120 mm across) with ≥ 3 other repeated strokes of its file within
  // 1.5 × its extent — letters come in clusters; a lone repeated edge is not text
  const extent = (i: number) => {
    const b = bboxOf(chains[i].pts);
    return Math.max(b.maxX - b.minX, b.maxY - b.minY);
  };
  const mid = (i: number) => {
    const b = bboxOf(chains[i].pts);
    return { x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 };
  };
  // a CLOSED contour is never overprint: a closed chain, or a chain whose ends all meet other
  // chain ends of its file (no free end in its end-to-end component) — four small repeated cut
  // loops crossed by a graded line read as a "glyph cluster" and their inner loops passed as cut
  // outlines (Codex T5). Glyph evidence is OPEN short strokes only.
  const ends = new PtGrid(4);
  chains.forEach((c, i) => {
    if (c.pts.length < 2 || known[i]) return;
    ends.add(2 * i, c.pts[0]);
    ends.add(2 * i + 1, c.pts[c.pts.length - 1]);
  });
  const endPt = (e: number) => {
    const c = chains[e >> 1];
    return e & 1 ? c.pts[c.pts.length - 1] : c.pts[0];
  };
  const parent = new Map<number, number>();
  const find = (i: number): number => {
    let r = i;
    while ((parent.get(r) ?? r) !== r) r = parent.get(r)!;
    parent.set(i, r);
    return r;
  };
  const freeEnd = new Set<number>();
  chains.forEach((c, i) => {
    if (c.pts.length < 2 || known[i] || c.closed) return;
    for (const e of [2 * i, 2 * i + 1]) {
      const p = endPt(e);
      let met = false;
      ends.near(p, 1, (o) => {
        if (o >> 1 === i || known[o >> 1] || fileOf(o >> 1) !== fileOf(i)) return;
        if (dist(endPt(o), p) > 1) return;
        met = true;
        parent.set(find(i), find(o >> 1));
      });
      if (!met && dist(c.pts[0], c.pts[c.pts.length - 1]) > 1) freeEnd.add(i);
    }
  });
  const openComp = new Set<number>();
  for (const i of freeEnd) openComp.add(find(i));
  const loopy = (i: number) => {
    const c = chains[i];
    if (c.closed || (c.pts.length > 3 && dist(c.pts[0], c.pts[c.pts.length - 1]) <= 1)) return true;
    return !openComp.has(find(i));
  };
  // …unless the loops are LETTERS: outline glyphs (wm's «WWW.PAFAVERO.PL») are closed too. A loop
  // component counts as a glyph only in a text line: ≥ 4 components of one height (± 15 %) on one
  // baseline, ≤ 1.2 heights apart, NOT all of one width (a row of identical pockets is no word)
  const comps = new Map<
    number,
    { ids: number[]; minX: number; minY: number; maxX: number; maxY: number; f: string }
  >();
  for (const i of same) {
    if (extent(i) > 120 || !loopy(i)) continue;
    const r = find(i);
    const b = bboxOf(chains[i].pts);
    const c = comps.get(r);
    if (!c) comps.set(r, { ids: [i], ...b, f: fileOf(i) });
    else {
      c.ids.push(i);
      c.minX = Math.min(c.minX, b.minX);
      c.minY = Math.min(c.minY, b.minY);
      c.maxX = Math.max(c.maxX, b.maxX);
      c.maxY = Math.max(c.maxY, b.maxY);
    }
  }
  const lettered = new Set<number>();
  const cl = [...comps.values()];
  for (const along of ['x', 'y'] as const) {
    const g = cl.map((c) => {
      const u0 = along === 'x' ? c.minX : c.minY;
      const u1 = along === 'x' ? c.maxX : c.maxY;
      const v0 = along === 'x' ? c.minY : c.minX;
      const v1 = along === 'x' ? c.maxY : c.maxX;
      return { c, u0, u1, h: v1 - v0, w: u1 - u0, vc: (v0 + v1) / 2 };
    });
    g.sort((a, b) => a.u0 - b.u0);
    for (const start of g) {
      if (start.h < 3) continue;
      const run = [start];
      let last = start;
      for (const x of g) {
        if (x.u0 <= last.u0 || x.c.f !== start.c.f) continue;
        if (Math.abs(x.h - start.h) > 0.15 * start.h || Math.abs(x.vc - start.vc) > 0.2 * start.h)
          continue;
        const gap = x.u0 - last.u1;
        if (gap > 1.2 * start.h || gap < -0.2 * start.h) continue;
        run.push(x);
        last = x;
      }
      if (run.length < 4) continue;
      const ws = run.map((x) => x.w);
      if (Math.max(...ws) < 1.15 * Math.min(...ws)) continue;
      for (const x of run) for (const i of x.c.ids) lettered.add(i);
    }
  }
  const strokes = [...same].filter((i) => extent(i) <= 120 && (!loopy(i) || lettered.has(i)));
  const sGrid = new PtGrid(60);
  for (const i of strokes) sGrid.add(i, mid(i));
  const glyphy = (i: number) => {
    const f = fileOf(i);
    const r = 1.5 * extent(i);
    let n = 0;
    sGrid.near(mid(i), r, (o) => {
      if (o !== i && fileOf(o) === f && dist(mid(o), mid(i)) <= r) n++;
    });
    return n >= 3;
  };
  // part of a piece boundary: BOTH ends land on line work of its own file that is not repeated
  // (a shared cut edge the graded hems and necklines end on) — never overprint
  const onGarment = (i: number, p: PtMm) => {
    const f = fileOf(i);
    let hit = false;
    grid.near(p, 1, (o, si) => {
      if (hit || o === i || fileOf(o) !== f || known[o]) return;
      const q = chains[o].pts;
      if (segNearest(p, q[si], q[si + 1]).d <= 1) hit = true;
    });
    return hit;
  };
  const out: number[] = [];
  for (const i of strokes) {
    if (!glyphy(i)) continue;
    const c = chains[i];
    if (onGarment(i, c.pts[0]) && onGarment(i, c.pts[c.pts.length - 1])) continue;
    const f = fileOf(i);
    let crossed = false;
    for (let k = 0; k + 1 < c.pts.length && !crossed; k++) {
      const a = c.pts[k];
      const b = c.pts[k + 1];
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      grid.near(mid, dist(a, b) / 2 + 1, (o, si) => {
        if (crossed || fileOf(o) !== f) return;
        const q = chains[o].pts;
        const x = segCross(a, b, q[si], q[si + 1]);
        if (!x) return;
        // both lines run on past the crossing (an X, not a T)
        const run = (pts: PtMm[], s: number, t: number) => {
          const L = dist(pts[s], pts[s + 1]);
          let before = t * L;
          let after = (1 - t) * L;
          for (let j = s; j > 0 && before < 2; j--) before += dist(pts[j - 1], pts[j]);
          for (let j = s + 2; j < pts.length && after < 2; j++) after += dist(pts[j - 1], pts[j]);
          return before >= 2 && after >= 2;
        };
        if (run(c.pts, k, x.t) && run(q, si, x.u)) crossed = true;
      });
    }
    if (crossed) out.push(i);
  }
  return out;
}

function segCross(a: PtMm, b: PtMm, c: PtMm, d: PtMm) {
  const rx = b.x - a.x;
  const ry = b.y - a.y;
  const sx = d.x - c.x;
  const sy = d.y - c.y;
  const den = rx * sy - ry * sx;
  if (Math.abs(den) < 1e-12) return null;
  const qx = c.x - a.x;
  const qy = c.y - a.y;
  const t = (qx * sy - qy * sx) / den;
  const u = (qx * ry - qy * rx) / den;
  if (t < 0 || t > 1 || u < 0 || u > 1) return null;
  return { t, u };
}

/** A neutral light-grey pen (RGB ≥ 140, spread < 40): grids and watermarks are usually drawn so. */
export function isLightGrey(st: Style | undefined): boolean {
  if (!st?.strokeRgb) return false;
  const [r, g, b] = st.strokeRgb;
  return Math.min(r, g, b) >= 140 && Math.max(r, g, b) - Math.min(r, g, b) < 40;
}

/** Reason prefix of grey lines nothing but their colour sets apart: the legend asks about them. */
export const GREY_COLOUR_ONLY = 'light grey (colour only — confirm)';

/**
 * LIGHT GREY is not proof of furniture (a pattern may draw its cut line grey): per light-grey
 * chain the evidence that it is background, else `null` (line work) or the colour-only reason.
 *   - topology already found (lettering, frame, margin, test square: `known`);
 *   - a straight axis-aligned stretch of a pen that draws a background lattice (wm's 1 cm grid,
 *     cut into tile pieces);
 *   - drawn identically in ≥ 3 overlaid files (a watermark printed on every size), or at one
 *     page-relative spot on ≥ 3 tiles (registration ticks, a tile logo);
 * else a closed piece-sized loop (≥ 15 cm²) or a loop around a label stays line work — it may be
 * the cut line around the seed; what is left is colour-only: ignored, but a low-confidence legend
 * row the operator confirms. Returns undefined for chains that are not light grey.
 */
export function lightGrey(
  chains: Chain[],
  styles: Map<number, Style>,
  texts: readonly IRText[],
  known: readonly (string | null)[],
  gridPens: ReadonlySet<number>,
  fileOf?: (i: number) => string,
  poses: readonly PagePose[] = [],
): (string | null | undefined)[] {
  const out: (string | null | undefined)[] = chains.map(() => undefined);
  const grey = chains.map((c) => isLightGrey(styles.get(c.style)));
  if (!grey.some(Boolean)) return out;
  const gridKeys = new Set(
    [...gridPens].map((id) => {
      const st = styles.get(id);
      return st ? `${st.strokeRgb?.join(',')}|${st.widthMm.toFixed(2)}` : '';
    }),
  );
  const penKey = (c: Chain) => {
    const st = styles.get(c.style);
    return st ? `${st.strokeRgb?.join(',')}|${st.widthMm.toFixed(2)}` : '';
  };
  // repetition over overlaid files: same ends (1 mm) and length
  const repeated = new Set<number>();
  if (fileOf) {
    const by = new Map<string, Set<string>>();
    const keyOf = (c: Chain) => {
      const a = c.pts[0];
      const b = c.pts[c.pts.length - 1];
      const k1 = `${Math.round(a.x)},${Math.round(a.y)}`;
      const k2 = `${Math.round(b.x)},${Math.round(b.y)}`;
      return `${k1 < k2 ? k1 : k2}|${k1 < k2 ? k2 : k1}|${Math.round(c.lengthMm)}`;
    };
    chains.forEach((c, i) => {
      if (!grey[i] || c.pts.length < 2) return;
      const k = keyOf(c);
      const s = by.get(k) ?? new Set<string>();
      s.add(fileOf(i));
      by.set(k, s);
    });
    chains.forEach((c, i) => {
      if (grey[i] && c.pts.length >= 2 && (by.get(keyOf(c))?.size ?? 0) >= 3) repeated.add(i);
    });
  }
  // repetition over tiles: the same mark at one page-relative spot on ≥ 3 pages (robe's 15 mm
  // registration ticks, a tile's logo)
  const onPages = new Set<number>();
  if (poses.length >= 3) {
    const rects = poses.map(pageRect);
    const by = new Map<string, Set<number>>();
    const keys = chains.map((c, i) => {
      if (!grey[i] || c.pts.length < 2) return null;
      const b = bboxOf(c.pts);
      const m = { x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 };
      const k = rects.findIndex(
        (r) => m.x >= r.minX && m.x <= r.maxX && m.y >= r.minY && m.y <= r.maxY,
      );
      if (k < 0) return null;
      const r = rects[k];
      const key = `${Math.round(b.minX - r.minX)},${Math.round(b.minY - r.minY)},${Math.round(b.maxX - r.minX)},${Math.round(b.maxY - r.minY)},${Math.round(c.lengthMm)}`;
      const set = by.get(key) ?? new Set<number>();
      set.add(Math.round(r.minX) * 100003 + Math.round(r.minY));
      by.set(key, set);
      return key;
    });
    keys.forEach((k, i) => {
      if (k && (by.get(k)?.size ?? 0) >= 3) onPages.add(i);
    });
  }
  const area = (pts: readonly PtMm[]) => {
    let a = 0;
    for (let k = 0; k < pts.length; k++) {
      const p = pts[k];
      const q = pts[(k + 1) % pts.length];
      a += p.x * q.y - q.x * p.y;
    }
    return Math.abs(a) / 2;
  };
  const inside = (p: PtMm, poly: readonly PtMm[]) => {
    let r = false;
    for (let k = 0, j = poly.length - 1; k < poly.length; j = k++) {
      const a = poly[k];
      const b = poly[j];
      if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) r = !r;
    }
    return r;
  };
  chains.forEach((c, i) => {
    if (!grey[i]) return;
    if (known[i]) {
      out[i] = known[i];
      return;
    }
    const { axis, straight } = straightAxis(c);
    if (straight && axis && gridKeys.has(penKey(c))) {
      out[i] = 'background grid';
      return;
    }
    if (repeated.has(i)) {
      out[i] = 'light grey watermark (every file)';
      return;
    }
    if (onPages.has(i)) {
      out[i] = 'light grey page mark (every tile)';
      return;
    }
    const n = c.pts.length;
    const loop = n > 3 && (c.closed || dist(c.pts[0], c.pts[n - 1]) <= 1);
    if (loop) {
      if (area(c.pts) >= 1500) {
        out[i] = null;
        return;
      }
      const b = bboxOf(c.pts);
      const labelled = texts.some((t) => {
        const m = { x: (t.bbox.minX + t.bbox.maxX) / 2, y: (t.bbox.minY + t.bbox.maxY) / 2 };
        return m.x > b.minX && m.x < b.maxX && m.y > b.minY && m.y < b.maxY && inside(m, c.pts);
      });
      if (labelled) {
        out[i] = null;
        return;
      }
    }
    out[i] = GREY_COLOUR_ONLY;
  });
  return out;
}

/** Chain ids that are page margin lines (pieces/ keeps them out of rescued walls). */
export function pageMarginIds(chains: Chain[], poses: PagePose[]): Set<number> {
  const out: (string | null)[] = chains.map(() => null);
  pageMarginLines(chains, poses, out);
  for (const i of lettering(chains)) out[i] = out[i] ?? 'lettering';
  for (const i of tileFrameLines(chains, poses)) out[i] = out[i] ?? 'tile frame';
  for (const i of backgroundGrid(chains)) out[i] = out[i] ?? 'background grid';
  const ids = new Set<number>();
  out.forEach((w, i) => w && ids.add(chains[i].id));
  return ids;
}

/** Greedy cosine clustering, longest reliable chains first. Returns look per chain (-1 = none). */
export function clusterLooks(
  chains: Chain[],
  sigs: Signature[],
  include: boolean[],
): { look: number[]; centroids: Float64Array[]; weight: number[] } {
  const look = new Array(chains.length).fill(-1);
  const centroids: Float64Array[] = [];
  const weight: number[] = [];
  const order = chains
    .map((_, i) => i)
    .filter((i) => include[i] && sigs[i].reliable)
    .sort((a, b) => chains[b].lengthMm - chains[a].lengthMm);
  for (const i of order) {
    const v = sigs[i].vec;
    let best = -1;
    let bc = 0;
    centroids.forEach((c, k) => {
      const s = cosine(v, c);
      if (s > bc) {
        bc = s;
        best = k;
      }
    });
    if (best >= 0 && bc >= LOOK.minCos) {
      const w = weight[best];
      const L = chains[i].lengthMm;
      const c = centroids[best];
      for (let k = 0; k < c.length; k++) c[k] = (c[k] * w + v[k] * L) / (w + L);
      weight[best] = w + L;
      look[i] = best;
    } else {
      centroids.push(Float64Array.from(v));
      weight.push(chains[i].lengthMm);
      look[i] = centroids.length - 1;
    }
  }
  // unreliable chains join a look only when they match it closely
  chains.forEach((c, i) => {
    if (!include[i] || look[i] >= 0) return;
    let best = -1;
    let bc = 0;
    centroids.forEach((cc, k) => {
      const s = cosine(sigs[i].vec, cc);
      if (s > bc) {
        bc = s;
        best = k;
      }
    });
    if (best >= 0 && bc >= LOOK.attachCos) look[i] = best;
  });
  return { look, centroids, weight };
}

/**
 * Public, data-only classification (contract `classifyChains`): chains drawn with the same style and
 * the same (quantised) motif form one class. No roles are guessed here beyond 'internal'; the
 * pipeline (buildChains) assigns sizes and common lines with bundles and evidence.
 */
export function classifyChains(chains: Chain[]): LineClass[] {
  const groups = new Map<string, Chain[]>();
  for (const c of chains) {
    const m = c.motif
      ? c.motif
          .map((v) => (Math.round(v / PATIMPORT.motifQuantMm) * PATIMPORT.motifQuantMm).toFixed(2))
          .join('/')
      : 'solid';
    const k = `${c.style}|${m}`;
    const g = groups.get(k);
    if (g) g.push(c);
    else groups.set(k, [c]);
  }
  let id = 0;
  return [...groups.values()]
    .map((g) => {
      const ev: ClassEvidence[] = g[0].motif
        ? [{ kind: 'recovered-motif', motif: g[0].motif }]
        : [];
      return {
        id: id++,
        role: 'internal' as const,
        sizeLabel: null,
        chains: g.map((c) => c.id),
        totalLengthMm: g.reduce((a, c) => a + c.lengthMm, 0),
        evidence: ev,
        confidence: 0.3,
      };
    })
    .sort((a, b) => b.totalLengthMm - a.totalLengthMm);
}

/** Declared dash clusters (3 % tolerance, Ф0: reef 4.88/4.89/4.90 are one style). */
export function dashCluster(
  dashes: { dash: number[]; len: number }[],
): { rep: number[]; members: number[]; len: number }[] {
  const out: { rep: number[]; members: number[]; len: number }[] = [];
  const order = dashes.map((_, i) => i).sort((a, b) => dashes[b].len - dashes[a].len);
  for (const i of order) {
    const d = normDash(dashes[i].dash);
    const hit = out.find(
      (c) =>
        c.rep.length === d.length &&
        c.rep.every((v, k) => Math.abs(v - d[k]) <= Math.max(0.06, 0.03 * Math.max(v, d[k]))),
    );
    if (hit) {
      hit.members.push(i);
      hit.len += dashes[i].len;
    } else out.push({ rep: d, members: [i], len: dashes[i].len });
  }
  return out;
}

export function midPoint(c: Chain): PtMm {
  return c.pts[Math.floor(c.pts.length / 2)];
}

export { bboxOf };
