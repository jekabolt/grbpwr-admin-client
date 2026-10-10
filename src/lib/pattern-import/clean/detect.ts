// clean/ (A8) — the page detectors. Each one returns candidate objects with the evidences it has;
// index.ts decides 'auto' (≥ 2 independent evidences, or the same thing at one page-relative place
// on ≥ 3 tiles) vs 'suggest' (one evidence), and the wall guard has the last word.
//
// The building blocks are the F3 furniture tests (chains/classify.ts): the lattice of
// `backgroundGrid`, the square of `testSquareBoxes`, the glyph clusters and text lines of
// `lettering` — run on ONE page instead of the assembled sheet.
import type { BackgroundKind, BoxMm, IRText, PtMm, Style } from 'lib/pattern-import/types';

import {
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
  label?: string;
  /** Lines touching garment lines were left out (the wall guard): how many. */
  guarded?: number;
  /** Test square: the box and nominal side (the scale hint). */
  square?: { box: BoxMm; nominalMm: number; why: string };
  /** Curve text: the band (SoM crops, seeds). */
  band?: GlyphRun;
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
  markMaxHeightMm: 250,
  /** Wall guard: a line this long that a candidate touches end-on is garment line work. */
  guardLongMm: 50,
  guardTouchMm: 0.3,
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

/** The 1 cm lattice under the drawing (`backgroundGrid`), with its pen evidence. */
export function gridOf(pc: PageChains, styles: Map<number, Style>): Found[] {
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
    out.push({ kind: 'grid', chains: lat, evidence: ev });
  }
  return out;
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
    if (q.why === 'label') ev.push(`labelled "${q.text ?? ''}"`);
    if (q.why === 'lettering') ev.push('lettering drawn inside it');
    if (q.why === 'copies') ev.push('drawn at one place in every overlaid file');
    return {
      kind: 'test-square' as const,
      chains: q.ids,
      evidence: ev,
      square: { box: q.box, nominalMm: q.nominalMm, why: q.why },
    };
  });
}

// ── wall guard: never mask a line a garment line meets ──────────────────────────────────────────

/**
 * Candidate chains a long non-candidate line MEETS end-on — its end lands on the candidate, or the
 * candidate's end lands on it. Text and furniture are printed over the drawing and cross it; a
 * piece's wall is met by its neighbours (the next wall, an internal line ending on it, a notch).
 */
export function touchingLineWork(
  polys: readonly (readonly PtMm[])[],
  lens: readonly number[],
  candidate: ReadonlySet<number>,
  masked: ReadonlySet<number>,
): Set<number> {
  const out = new Set<number>();
  if (!candidate.size || !CLEAN.on.guard) return out;
  const r = CLEAN.guardTouchMm;
  const long = (i: number) => !candidate.has(i) && !masked.has(i) && lens[i] >= CLEAN.guardLongMm;
  const gLong = new SegGrid(4);
  const gCand = new SegGrid(4);
  polys.forEach((c, i) => {
    if (c.length < 2) return;
    if (long(i)) gLong.addPolyline(i, c as PtMm[]);
    else if (candidate.has(i)) gCand.addPolyline(i, c as PtMm[]);
  });
  const hits = (g: SegGrid, p: PtMm, visit: (o: number) => void) =>
    g.near(p, r, (o, s) => {
      const q = polys[o];
      if (segNearest(p, q[s], q[s + 1]).d <= r) visit(o);
    });
  for (const i of candidate) {
    const c = polys[i];
    if (c.length < 2) continue;
    for (const p of [c[0], c[c.length - 1]]) hits(gLong, p, () => out.add(i));
  }
  polys.forEach((c, i) => {
    if (c.length < 2 || !long(i)) return;
    for (const p of [c[0], c[c.length - 1]]) hits(gCand, p, (o) => out.add(o));
  });
  return out;
}
