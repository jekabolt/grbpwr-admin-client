// clean/ (A8) — the page detectors. Each one returns candidate objects with the evidences it has;
// index.ts decides 'auto' (≥ 2 independent evidences, or the same thing at one page-relative place
// on ≥ 3 tiles) vs 'suggest' (one evidence), and the wall guard has the last word.
//
// The building blocks are the F3 furniture tests (chains/classify.ts): the lattice of
// `backgroundGrid`, the square of `testSquareBoxes`, the glyph clusters and text lines of
// `lettering` — run on ONE page instead of the assembled sheet.
import { PATIMPORT } from 'lib/pattern-import/types';
import type { BackgroundKind, BoxMm, IRText, PtMm, Style } from 'lib/pattern-import/types';

import {
  axisRuns,
  backgroundGrid,
  glyphClusters,
  glyphRuns,
  isLightGrey,
  testSquareBoxes,
  type GlyphCluster,
  type GlyphRun,
} from '../chains/classify';
import { dist, endTangent, PtGrid, SegGrid, segNearest } from '../chains/geom';
import { extentOf, pageAsSheet, type PageChains } from './page-chains';

/** One object a detector found: chain indices on its page, and why. */
export type Found = {
  kind: BackgroundKind;
  chains: number[];
  evidence: string[];
  /** Page-relative repetition on ≥ 3 tiles: enough alone (plan §A8 detector 3). */
  repeated?: boolean;
  /**
   * An explicit proof that is enough alone: the scale keyword of a test square, a 10 mm / 1 in
   * lattice over the whole page. Until A9 brings an independent AI evidence, only this and
   * repetition mask by themselves — every other find is a suggestion.
   */
  proof?: string;
  label?: string;
  /** Lines touching garment lines were left out (the wall guard): how many. */
  guarded?: number;
  /** Test square: the box and nominal side (the scale hint). */
  square?: { box: BoxMm; nominalMm: number; why: string };
  /** Curve text: the band (SoM crops, seeds). */
  band?: GlyphRun;
  /** Tile chrome found by repetition (decided per file in cleanPages). */
  chrome?: boolean;
  /** A garment line ends on it (tile chrome: offered for the whole file, never applied alone). */
  touched?: boolean;
  /** Text furniture: page `IRText.id`s. */
  textIds?: number[];
};

/** Thresholds of the clean stage (plan §A8; measured on the corpus, see the probe). */
export const CLEAN = {
  /** Page-relative signature: corners / lengths this close are "the same place". */
  repeatTolMm: 1,
  /** Repetition counts on this many tiles OF ONE FILE (overlaid per-size files do not vote). */
  repeatMinPages: 3,
  /** Stroke text (8a): glyph height range, mm; taller rows are the sheet pass's (8b) watermark. */
  textMinHeightMm: 2.5,
  textMaxHeightMm: 40,
  /** A text line: this many glyphs, this many strokes at least. */
  textMinGlyphs: 4,
  textMinStrokes: 12,
  /** Watermark (8b): outline glyphs this tall (across the line), mm. */
  markMinHeightMm: 20,
  markMaxHeightMm: 120,
  /** Watermark letters stand close (gap ≤ 0.9 heights, a dot between two) and none is wider than 1.3 heights. */
  markMaxGap: 0.9,
  markMaxAspect: 1.3,
  /**
   * Wall guard: a line at least this long (dots and ticks aside) that a candidate meets end-on,
   * or runs along (collinear / tangent), is garment line work — whatever its length.
   */
  guardMinMm: 3,
  guardTouchMm: 0.3,
  /** "Along": the two segments' directions differ by less than this sine (≈ 6°). */
  guardAlongSin: 0.1,
  /** A lattice proves itself on one page at these pitches (10 mm, 1 in) over the whole page. */
  gridPitchesMm: [10, 25.4],
  gridPitchTol: 0.03,
  /** "The whole page": the lattice spans this share of the page's drawing both ways. */
  gridWholePage: 0.9,
  /** …and this share of the page itself (A4 minus a 10 mm printer margin is 0.9). */
  gridWholePageMin: 0.85,
  /** A grid pen draws (almost) nothing but the lattice. */
  gridPenShare: 0.9,
  /** Watermark letterforms: a row this long with this many sharp-cornered glyphs. */
  letterformMinGlyphs: 6,
  letterformMinSharp: 3,
  /**
   * The detectors (all on in the product). The clean probe switches one off at a time to prove its
   * checks depend on it (mutation check).
   */
  on: {
    grid: true,
    text: true,
    square: true,
    chrome: true,
    texts: true,
    table: true,
    watermark: true,
    sheetText: true,
    guard: true,
  },
};

// ── page-relative repetition (tile chrome: frames, marks, ROW/COLUMN labels, logos) ─────────────

type Sig = { cx: number; cy: number; w: number; h: number; len: number; page: number };

/**
 * For every chain of every page of ONE file: on how many pages of that file a chain of the same
 * page-relative box (± 1 mm) and length (± 3 %) is drawn. A tile frame, a corner mark, the
 * "ROW 2 COLUMN 3" letters repeat on every tile; a garment line never repeats at one page place.
 */
export function repetition(pages: PageChains[]): number[][] {
  const sigs: Sig[][] = pages.map((pc, k) =>
    pc.chains.map((c, i) => {
      const b = pc.box[i];
      return {
        cx: (b.minX + b.maxX) / 2,
        cy: (b.minY + b.maxY) / 2,
        w: b.maxX - b.minX,
        h: b.maxY - b.minY,
        len: c.lengthMm,
        page: k,
      };
    }),
  );
  const tol = CLEAN.repeatTolMm;
  const grid = new PtGrid(2);
  const all: Sig[] = [];
  for (const ps of sigs)
    for (const s of ps) {
      grid.add(all.length, { x: s.cx, y: s.cy });
      all.push(s);
    }
  return sigs.map((ps) =>
    ps.map((s) => {
      const seen = new Set<number>([s.page]);
      grid.near({ x: s.cx, y: s.cy }, tol, (j) => {
        const o = all[j];
        if (seen.has(o.page)) return;
        if (Math.abs(o.cx - s.cx) > tol || Math.abs(o.cy - s.cy) > tol) return;
        if (Math.abs(o.w - s.w) > tol || Math.abs(o.h - s.h) > tol) return;
        if (Math.abs(o.len - s.len) > 0.03 * s.len + 0.5) return;
        seen.add(o.page);
      });
      return seen.size;
    }),
  );
}

/**
 * A repeated chain that runs out to the edge of the page's drawing is a garment line the tile
 * clipped — a straight edge crossing a column of tiles sits at one page place on every one of them
 * (wm's back and fold lines, clipped at the printable area) — unless that end is a CORNER: it
 * meets the end of another repeated chain (a tile frame's sides meet at its corners).
 */
export function clippedByPage(
  pc: PageChains,
  i: number,
  rep: readonly number[],
  drawn: BoxMm = drawingOf(pc),
): boolean {
  const { minX, minY, maxX, maxY } = drawn;
  const onEdge = (p: PtMm) =>
    p.x <= minX + 1 || p.y <= minY + 1 || p.x >= maxX - 1 || p.y >= maxY - 1;
  const c = pc.chains[i];
  if (c.closed) return false;
  // the partner leaves the corner in another direction (a line drawn twice is no corner)
  const dirAt = (pts: readonly PtMm[], p: PtMm) => {
    const far = dist(pts[0], p) <= 0.6 ? pts[pts.length - 1] : pts[0];
    const L = dist(far, p) || 1;
    return { x: (far.x - p.x) / L, y: (far.y - p.y) / L };
  };
  const corner = (p: PtMm) => {
    const mine = dirAt(c.pts, p);
    return pc.chains.some((o, k) => {
      if (k === i || rep[k] < CLEAN.repeatMinPages || o.closed) return false;
      if (dist(o.pts[0], p) > 0.6 && dist(o.pts[o.pts.length - 1], p) > 0.6) return false;
      const d = dirAt(o.pts, p);
      return Math.abs(mine.x * d.x + mine.y * d.y) < Math.cos(Math.PI / 6);
    });
  };
  for (const p of [c.pts[0], c.pts[c.pts.length - 1]]) if (onEdge(p) && !corner(p)) return true;
  return false;
}

/** The box of everything drawn on the page (the printable area a tile clips its lines at). */
export function drawingOf(pc: PageChains): BoxMm {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const b of pc.box) {
    minX = Math.min(minX, b.minX);
    minY = Math.min(minY, b.minY);
    maxX = Math.max(maxX, b.maxX);
    maxY = Math.max(maxY, b.maxY);
  }
  return { minX, minY, maxX, maxY };
}

/**
 * A closed repeated shape the size of a piece (≥ `minPieceAreaMm2`, wider than a tile label) that
 * is not the tile's frame (it spans < 70 % of the page drawing both ways): a small piece drawn at
 * one page place on several tiles is still a piece — never chrome.
 */
export function pieceSized(pc: PageChains, i: number, drawn: BoxMm): boolean {
  const c = pc.chains[i];
  if (!c.closed) return false;
  const b = pc.box[i];
  if (extentOf(b) <= 30) return false;
  const W = drawn.maxX - drawn.minX;
  const H = drawn.maxY - drawn.minY;
  if (b.maxX - b.minX >= 0.7 * W || b.maxY - b.minY >= 0.7 * H) return false;
  let a = 0;
  const q = c.pts;
  for (let k = 0, j = q.length - 1; k < q.length; j = k++)
    a += (q[j].x + q[k].x) * (q[j].y - q[k].y);
  return Math.abs(a) / 2 >= PATIMPORT.minPieceAreaMm2;
}

/** The kind of a repeated chain by where it sits on the page and how big it is. */
export function chromeKind(pc: PageChains, i: number): BackgroundKind {
  const b = pc.box[i];
  const W = pc.page.widthMm;
  const H = pc.page.heightMm;
  const ext = extentOf(b);
  if (ext <= 30) {
    const cx = (b.minX + b.maxX) / 2;
    const cy = (b.minY + b.maxY) / 2;
    const nearCorner = Math.min(cx, W - cx) <= 30 && Math.min(cy, H - cy) <= 30;
    return nearCorner ? 'regmark' : 'tile-label';
  }
  return 'tile-frame';
}

// ── background grid ─────────────────────────────────────────────────────────────────────────────

/**
 * The 1 cm lattice under the drawing (`backgroundGrid`), with its pen evidence. It masks by itself
 * only when it is PROVEN print furniture: the same lattice at one page place on ≥ 3 tiles (the
 * print grid is identical on every tile), or — on one page — a 10 mm / 1 in pitch over the whole
 * page. A lattice confined to a region (a quilting grid, a pleated panel) is a suggestion.
 */
export function gridOf(
  pc: PageChains,
  styles: Map<number, Style>,
  rep: readonly number[],
): Found[] {
  if (!CLEAN.on.grid) return [];
  const ids = backgroundGrid(pc.chains);
  if (!ids.length) return [];
  const byPen = new Map<number, number[]>();
  for (const i of ids) {
    const s = pc.chains[i].style;
    const a = byPen.get(s);
    if (a) a.push(i);
    else byPen.set(s, [i]);
  }
  const out: Found[] = [];
  for (const [pen, lat] of byPen) {
    const inPen = pc.chains.reduce((a, c) => a + (c.style === pen ? c.lengthMm : 0), 0);
    const onLat = lat.reduce((a, i) => a + pc.chains[i].lengthMm, 0);
    const ev = [`a lattice of ${lat.length} straight lines, even spacing both ways`];
    if (inPen > 0 && onLat >= CLEAN.gridPenShare * inPen)
      ev.push(`its pen draws nothing else (${Math.round((100 * onLat) / inPen)} %)`);
    if (isLightGrey(styles.get(pen))) ev.push('light grey');
    const f: Found = { kind: 'grid', chains: lat, evidence: ev };
    latticeProof(pc, lat, rep, f);
    out.push(f);
  }
  return out;
}

/**
 * Repetition or the whole-page pitch for a lattice / ruled table (`gridOf`, `tablesOf`): sets
 * `repeated` (≥ 90 % of its lines at one page place on ≥ 3 tiles) or `proof` on `f`.
 */
function latticeProof(pc: PageChains, ids: readonly number[], rep: readonly number[], f: Found) {
  const onTiles = ids.filter((i) => rep[i] >= CLEAN.repeatMinPages);
  if (ids.length && onTiles.length >= 0.9 * ids.length) {
    f.repeated = true;
    f.evidence.push(
      `repeats at one page place on ${Math.min(...onTiles.map((i) => rep[i]))} tiles`,
    );
    return;
  }
  const xs: number[] = [];
  const ys: number[] = [];
  let lat: BoxMm | null = null;
  for (const i of ids) {
    const b = pc.box[i];
    lat = lat
      ? {
          minX: Math.min(lat.minX, b.minX),
          minY: Math.min(lat.minY, b.minY),
          maxX: Math.max(lat.maxX, b.maxX),
          maxY: Math.max(lat.maxY, b.maxY),
        }
      : { ...b };
    if (b.maxY - b.minY <= 0.5 && b.maxX - b.minX > 0.5) ys.push((b.minY + b.maxY) / 2);
    else if (b.maxX - b.minX <= 0.5 && b.maxY - b.minY > 0.5) xs.push((b.minX + b.maxX) / 2);
  }
  if (!lat) return;
  const pitch = (v: number[]) => {
    const u = [...v].sort((a, b) => a - b).filter((x, k, a) => !k || x - a[k - 1] > 0.5);
    if (u.length < 3) return NaN;
    return med(u.slice(1).map((x, k) => x - u[k]));
  };
  const px = pitch(xs);
  const py = pitch(ys);
  const at = CLEAN.gridPitchesMm.find(
    (m) => Math.abs(px - m) <= CLEAN.gridPitchTol * m && Math.abs(py - m) <= CLEAN.gridPitchTol * m,
  );
  // the whole PAGE (its printable area), not just the page's drawing: one quilted piece alone
  // on a page is the whole drawing
  const d = drawingOf(pc);
  const W = pc.page.widthMm;
  const H = pc.page.heightMm;
  const whole =
    lat.maxX - lat.minX >= CLEAN.gridWholePage * (d.maxX - d.minX) &&
    lat.maxY - lat.minY >= CLEAN.gridWholePage * (d.maxY - d.minY) &&
    lat.maxX - lat.minX >= CLEAN.gridWholePageMin * W &&
    lat.maxY - lat.minY >= CLEAN.gridWholePageMin * H;
  if (at && whole) f.proof = `a ${at === 10 ? '10 mm' : '1 in'} lattice over the whole page`;
}

// ── stroke text (8a) and outline lettering (8b) ─────────────────────────────────────────────────

const med = (v: number[]) => v.slice().sort((a, b) => a - b)[(v.length - 1) >> 1];

/**
 * Text lines drawn as strokes among `polys`: glyph clusters (touching strokes) of one height in
 * a row (the `lettering` grammar) whose widths differ (a word, not a row of equal parts), whose
 * glyphs are two-dimensional (median width ≥ ¼ height: stacked swatches are flat) and that carry
 * at least `minStrokes` strokes. `keep` filters the polylines that may take part.
 */
export function textLines(
  polys: readonly (readonly PtMm[])[],
  o: {
    minH: number;
    maxH: number;
    minGlyphs: number;
    minStrokes: number;
    maxGap?: number;
    /** Outline letters: strokes join end to end only (`glyphClusters` endsOnly). */
    endsOnly?: boolean;
    /** No glyph wider than this many heights (letters; a row of pieces has long ones). */
    maxAspect?: number;
  },
  keep: (i: number) => boolean = () => true,
): GlyphRun[] {
  const clusters = glyphClusters(polys, o.maxH * 1.6, 0.6, keep, o.endsOnly).filter(
    (c) => extentOf(c) <= o.maxH * 1.5,
  );
  const runs = glyphRuns(clusters, {
    minRun: o.minGlyphs,
    hTol: 0.25,
    vcTol: 0.25,
    maxGap: o.maxGap ?? 1.5,
    minGap: -0.2,
    minHeightMm: o.minH,
    accept: (run) => {
      const h = run[0].h;
      if (h > o.maxH) return false;
      const ws = run.map((x) => x.w);
      if (Math.max(...ws) < 1.15 * Math.min(...ws)) return false;
      if (med(ws) < 0.25 * h) return false;
      if (o.maxAspect && Math.max(...ws) > o.maxAspect * h) return false;
      const strokes = run.reduce((a, x) => a + x.glyph.ids.length, 0);
      return strokes >= o.minStrokes;
    },
  });
  return growLines(runs, clusters);
}

/**
 * A line found by its regular core takes the rest of its words: clusters on its centre line (they
 * overlap the band across by ≥ 60 %), no taller than 1.3 heights, within 2.5 heights of its ends —
 * "WI ERSZ 2" split by a wide space, a digit, a colon.
 */
function growLines(runs: GlyphRun[], clusters: readonly GlyphCluster[]): GlyphRun[] {
  const owner = new Map<GlyphCluster, GlyphRun>();
  for (const r of runs) for (const c of r.members) owner.set(c, r);
  for (const r of runs) {
    const ax = r.along === 'x';
    for (let grown = true; grown; ) {
      grown = false;
      const b = r.box;
      const v0 = ax ? b.minY : b.minX;
      const v1 = ax ? b.maxY : b.maxX;
      const u0 = ax ? b.minX : b.minY;
      const u1 = ax ? b.maxX : b.maxY;
      const h = r.heightMm;
      for (const c of clusters) {
        if (owner.has(c)) continue;
        const cv0 = ax ? c.minY : c.minX;
        const cv1 = ax ? c.maxY : c.maxX;
        const cu0 = ax ? c.minX : c.minY;
        const cu1 = ax ? c.maxX : c.maxY;
        if (cv1 - cv0 > 1.3 * h) continue;
        const over = Math.min(v1, cv1) - Math.max(v0, cv0);
        if (over < 0.6 * Math.max(0.5, Math.min(v1 - v0, cv1 - cv0))) continue;
        const gap = Math.max(cu0 - u1, u0 - cu1);
        if (gap > 2.5 * h) continue;
        owner.set(c, r);
        r.members.push(c);
        r.box = {
          minX: Math.min(b.minX, c.minX),
          minY: Math.min(b.minY, c.minY),
          maxX: Math.max(b.maxX, c.maxX),
          maxY: Math.max(b.maxY, c.maxY),
        };
        grown = true;
        break;
      }
    }
  }
  return runs;
}

/** A closed chain's polyline with its closing edge. */
const closedPts = (c: { pts: PtMm[]; closed: boolean }) =>
  c.closed && c.pts.length > 2 ? [...c.pts, c.pts[0]] : c.pts;

export const runStrokes = (r: GlyphRun) => r.members.reduce((a, c) => a + c.ids.length, 0);
export const memberIds = (r: GlyphRun) => r.members.flatMap((c: GlyphCluster) => c.ids);

/**
 * Lines that CROSS a glyph row without belonging to it (a watermark printed over the drawing): how
 * many glyphs of the row a foreign polyline passes through, crossing the glyph's strokes and
 * running on past its box on both sides.
 */
export function crossedGlyphs(
  row: GlyphRun,
  polys: readonly (readonly PtMm[])[],
  foreign: (i: number) => boolean,
  grid: SegGrid,
): number {
  let n = 0;
  for (const g of row.glyphs) {
    const mine = new Set(g.ids);
    let crossed = false;
    for (const i of g.ids) {
      const p = polys[i];
      for (let k = 0; k + 1 < p.length && !crossed; k++) {
        const a = p[k];
        const b = p[k + 1];
        const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        grid.near(mid, dist(a, b) / 2 + 1, (o, s) => {
          if (crossed || mine.has(o) || !foreign(o)) return;
          const q = polys[o];
          if (segCross(a, b, q[s], q[s + 1]) && passesThrough(q, g)) crossed = true;
        });
      }
      if (crossed) break;
    }
    if (crossed) n++;
  }
  return n;
}

/**
 * Glyphs of a row with a corner sharper than `maxDeg` — two of its strokes leaving one point at a
 * narrow angle (W, V, A, M, N, Z, K): letterforms. Garment outlines turn at blunt corners; a dart's
 * point is inside a piece, never a row of separate outlines.
 */
export function sharpGlyphs(
  row: GlyphRun,
  polys: readonly (readonly PtMm[])[],
  maxDeg = 35,
): number {
  const cosMax = Math.cos((maxDeg * Math.PI) / 180);
  let n = 0;
  const corner = (u: PtMm, v: PtMm) => {
    const c = (u.x * v.x + u.y * v.y) / (Math.hypot(u.x, u.y) * Math.hypot(v.x, v.y) || 1);
    return c > cosMax && c < 0.9999;
  };
  for (const g of row.glyphs) {
    let sharp = false;
    const ends: { p: PtMm; out: PtMm }[] = [];
    for (const i of g.ids) {
      const q = polys[i] as PtMm[];
      if (q.length < 2) continue;
      for (const end of [0, 1] as const) {
        const t = endTangent(q, end, 3);
        // the direction the stroke LEAVES its end point in
        if (t) ends.push({ p: end ? q[q.length - 1] : q[0], out: { x: -t.x, y: -t.y } });
      }
      // a sharp turn inside one stroke (both legs ≥ 2 mm)
      for (let k = 1; k + 1 < q.length && !sharp; k++) {
        const a = { x: q[k - 1].x - q[k].x, y: q[k - 1].y - q[k].y };
        const b = { x: q[k + 1].x - q[k].x, y: q[k + 1].y - q[k].y };
        if (Math.hypot(a.x, a.y) > 2 && Math.hypot(b.x, b.y) > 2 && corner(a, b)) sharp = true;
      }
    }
    for (let a = 0; a < ends.length && !sharp; a++)
      for (let b = a + 1; b < ends.length && !sharp; b++)
        if (dist(ends[a].p, ends[b].p) <= 0.6 && corner(ends[a].out, ends[b].out)) sharp = true;
    if (sharp) n++;
  }
  return n;
}

function segCross(a: PtMm, b: PtMm, c: PtMm, d: PtMm): boolean {
  const o = (p: PtMm, q: PtMm, r: PtMm) => (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
  const d1 = o(a, b, c);
  const d2 = o(a, b, d);
  const d3 = o(c, d, a);
  const d4 = o(c, d, b);
  return d1 * d2 < 0 && d3 * d4 < 0;
}

/** The polyline runs out of the glyph's box (it is not a stroke ending inside the letter). */
function passesThrough(q: readonly PtMm[], g: GlyphCluster): boolean {
  const out = (p: PtMm) =>
    p.x < g.minX - 1 || p.x > g.maxX + 1 || p.y < g.minY - 1 || p.y > g.maxY + 1;
  let first = -1;
  let last = -1;
  q.forEach((p, i) => {
    if (out(p)) {
      if (first < 0) first = i;
      last = i;
    }
  });
  return first >= 0 && last > first;
}

// ── test square drawn as line work ──────────────────────────────────────────────────────────────

export function squaresOf(
  pc: PageChains,
  texts: readonly IRText[],
  lettered: ReadonlySet<number>,
): Found[] {
  if (!CLEAN.on.square) return [];
  const known = pc.chains.map((_, i) => (lettered.has(i) ? 'lettering' : null));
  const sheet = pageAsSheet(pc.page);
  return testSquareBoxes(pc.chains, sheet.poses, texts, known, true).map((q) => {
    const side = q.box.maxX - q.box.minX;
    const ev = [`a closed square ${side.toFixed(1)} mm, the printed ${q.nominalMm} mm`];
    // only the scale keyword proves it (test / контроль / carré / "10 cm" …): a square with any
    // other label, or lettering we cannot read, may be a small piece — a suggestion at most
    if (q.why === 'lettering') ev.push('lettering drawn inside it');
    if (q.why === 'copies') ev.push('drawn at one place in every overlaid file');
    return {
      kind: 'test-square' as const,
      chains: q.ids,
      evidence: ev,
      ...(q.why === 'label' ? { proof: `the scale keyword "${q.text ?? ''}"` } : {}),
      square: { box: q.box, nominalMm: q.nominalMm, why: q.why },
    };
  });
}

// ── tables: a ruled grid of cells with text in them (size tables, the print-order map) ─────────

/**
 * Ruled tables: clusters of axis-aligned straight lines that touch each other, spanning ≥ 3
 * positions on each axis (≥ 6 cells). Evidence: the ruling itself, and text in its cells (real
 * text, or stroke text the page detectors found). A quilted panel or a pleated piece has no text
 * in a grid of cells.
 */
export function tablesOf(
  pc: PageChains,
  texts: readonly IRText[],
  taken: ReadonlySet<number>,
  lettered: ReadonlySet<number>,
  rep: readonly number[],
  notes: string[] = [],
): Found[] {
  if (!CLEAN.on.table) return [];
  // a rule chain is made of axis-aligned runs only (a straight rule, or a cell drawn as a
  // closed rectangle)
  const runs = pc.chains.map((c, i) => {
    if (taken.has(i) || c.lengthMm < 5) return null;
    const rs = axisRuns(c.pts, c.closed, 2);
    const L = rs.reduce((a, r) => a + r.len, 0);
    return rs.length && L >= 0.98 * c.lengthMm ? rs : null;
  });
  const ids = runs.flatMap((r, i) => (r ? [i] : []));
  if (ids.length < 4) return [];
  // touching rules are one table (an end on another rule, or a crossing)
  const parent = new Map<number, number>(ids.map((i) => [i, i]));
  const find = (i: number): number => {
    while (parent.get(i) !== i) i = parent.get(i)!;
    return i;
  };
  const grid = new SegGrid(4);
  for (const i of ids) grid.addPolyline(i, closedPts(pc.chains[i]));
  for (const i of ids) {
    const c = closedPts(pc.chains[i]);
    for (const p of c)
      grid.near(p, 0.6, (o, sIdx) => {
        if (o === i || find(o) === find(i)) return;
        const q = closedPts(pc.chains[o]);
        if (segNearest(p, q[sIdx], q[sIdx + 1]).d <= 0.6) parent.set(find(o), find(i));
      });
  }
  const groups = new Map<number, number[]>();
  for (const i of ids) {
    const r = find(i);
    const a = groups.get(r);
    if (a) a.push(i);
    else groups.set(r, [i]);
  }
  const out: Found[] = [];
  for (const g of groups.values()) {
    const pos = (ax: 'x' | 'y') => {
      const v = g
        .flatMap((i) => runs[i]!.filter((r) => r.axis === ax && r.len >= 3).map((r) => r.at))
        .sort((a, b) => a - b);
      const out: number[] = [];
      for (const x of v) if (!out.length || x - out[out.length - 1] > 0.5) out.push(x);
      return out;
    };
    const rows = pos('x');
    const cols = pos('y');
    if (rows.length < 3 || cols.length < 3) continue;
    // cells of a table are small and even (a wider label column at most): a piece drawn as a
    // double rectangle (cut + seam line, 10 / 400 / 10 mm) is not a table
    const even = (v: number[]) => {
      const d = v.slice(1).map((x, k) => x - v[k]);
      const m = d.slice().sort((a, b) => a - b)[d.length >> 1];
      return m <= 40 && Math.max(...d) <= 4 * m;
    };
    if (!even(rows) || !even(cols)) continue;
    const cells = (rows.length - 1) * (cols.length - 1);
    if (cells < 6) continue;
    const box = {
      minX: cols[0],
      maxX: cols[cols.length - 1],
      minY: rows[0],
      maxY: rows[rows.length - 1],
    };
    const cellOf = (x: number, y: number) => {
      const c = cols.findIndex((v, k) => k + 1 < cols.length && x >= v && x <= cols[k + 1]);
      const r = rows.findIndex((v, k) => k + 1 < rows.length && y >= v && y <= rows[k + 1]);
      return c < 0 || r < 0 ? null : `${r}:${c}`;
    };
    const filled = new Set<string>();
    for (const t of texts) {
      const k = cellOf((t.bbox.minX + t.bbox.maxX) / 2, (t.bbox.minY + t.bbox.maxY) / 2);
      if (k) filled.add(k);
    }
    for (const i of lettered) {
      const b = pc.box[i];
      const k = cellOf((b.minX + b.maxX) / 2, (b.minY + b.maxY) / 2);
      if (k) filled.add(k);
    }
    // the cells are not a garment: no other line runs from inside the table out of it (a piece
    // outline around a pleated or quilted panel, a seam line crossing the cells)
    const mine = new Set(g);
    const inside = (p: PtMm) =>
      p.x > box.minX + 1 && p.x < box.maxX - 1 && p.y > box.minY + 1 && p.y < box.maxY - 1;
    const outside = (p: PtMm) =>
      p.x < box.minX - 1 || p.x > box.maxX + 1 || p.y < box.minY - 1 || p.y > box.maxY + 1;
    const runsOut = pc.chains.findIndex(
      (c, i) =>
        !mine.has(i) &&
        !taken.has(i) &&
        !lettered.has(i) &&
        c.lengthMm >= CLEAN.guardMinMm &&
        c.pts.some(inside) &&
        c.pts.some(outside),
    );
    if (runsOut >= 0) {
      notes.push(
        `page ${pc.page.page + 1}: a ruled grid ${rows.length} × ${cols.length} — a line runs out of it, read as a garment, not a table`,
      );
      continue;
    }
    const ev = [`a ruled table, ${rows.length} × ${cols.length} lines (${cells} cells)`];
    if (filled.size >= Math.max(3, 0.3 * cells)) ev.push(`text in ${filled.size} of its cells`);
    const f: Found = { kind: 'table', chains: g, evidence: ev };
    latticeProof(pc, g, rep, f);
    out.push(f);
  }
  return out;
}

// ── wall guard: never mask a line a garment line meets ──────────────────────────────────────────

/**
 * Candidate chains that line work MEETS — a protector's end lands on the candidate, the candidate's
 * end lands on a protector, or the two run ALONG each other (collinear or tangent within 0.3 mm:
 * a CF on a tile frame, a curve grazing a grid line). Crossing is not contact: text and furniture
 * are printed over the drawing and cross it. A protector is any non-candidate line ≥ 3 mm that
 * `inert` does not set aside (lines already found as furniture, lettering, tile chrome) — its
 * length does not matter (a notch, a short internal line ending on a wall protect it too).
 */
export function touchingLineWork(
  polys: readonly (readonly PtMm[])[],
  lens: readonly number[],
  candidate: ReadonlySet<number>,
  inert: (i: number) => boolean,
  o: {
    /** Only the candidate's OWN ends (and running along) count — a line ending ON it does not. */
    ownEndsOnly?: boolean;
    /** Collinear / tangent contact counts (default true). */
    along?: boolean;
    /**
     * The page drawing's box: an end ON its edge is where the print stops (the tile clipped a
     * lattice and a garment line at the same printable edge), not where a garment stops a line.
     */
    edge?: BoxMm;
  } = {},
): Set<number> {
  const out = new Set<number>();
  if (!candidate.size || !CLEAN.on.guard) return out;
  const r = CLEAN.guardTouchMm;
  const prot = (i: number) => !candidate.has(i) && lens[i] >= CLEAN.guardMinMm && !inert(i);
  const gProt = new SegGrid(4);
  const gCand = new SegGrid(4);
  polys.forEach((c, i) => {
    if (c.length < 2) return;
    if (candidate.has(i)) gCand.addPolyline(i, c as PtMm[]);
    else if (prot(i)) gProt.addPolyline(i, c as PtMm[]);
  });
  const e = o.edge;
  const onEdge = (p: PtMm) =>
    !!e && (p.x <= e.minX + 1 || p.y <= e.minY + 1 || p.x >= e.maxX - 1 || p.y >= e.maxY - 1);
  const hits = (g: SegGrid, p: PtMm, visit: (o: number) => void) =>
    !onEdge(p) &&
    g.near(p, r, (k, s) => {
      const q = polys[k];
      if (segNearest(p, q[s], q[s + 1]).d <= r) visit(k);
    });
  for (const i of candidate) {
    const c = polys[i];
    if (c.length < 2) continue;
    for (const p of [c[0], c[c.length - 1]]) hits(gProt, p, () => out.add(i));
  }
  if (!o.ownEndsOnly)
    polys.forEach((c, i) => {
      if (c.length < 2 || !prot(i)) return;
      for (const p of [c[0], c[c.length - 1]]) hits(gCand, p, (k) => out.add(k));
    });
  if (o.along !== false)
    for (const i of candidate) {
      if (out.has(i)) continue;
      const c = polys[i];
      for (let k = 0; k + 1 < c.length && !out.has(i); k++) {
        const a = c[k];
        const b = c[k + 1];
        const L = dist(a, b);
        if (L < 0.5) continue;
        const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        if (onEdge(mid)) continue;
        gProt.near(mid, L / 2 + r, (j, s) => {
          if (out.has(i)) return;
          const q = polys[j];
          const u = q[s];
          const v = q[s + 1];
          const M = dist(u, v);
          if (M < 0.5) return;
          const sin = Math.abs((b.x - a.x) * (v.y - u.y) - (b.y - a.y) * (v.x - u.x)) / (L * M);
          if (sin > CLEAN.guardAlongSin) return;
          const qm = { x: (u.x + v.x) / 2, y: (u.y + v.y) / 2 };
          if (segNearest(mid, u, v).d <= r || segNearest(qm, a, b).d <= r) out.add(i);
        });
      }
    }
  return out;
}
