// pieces/gfit (GRADE P0, PROBE ONLY — not wired into the pipeline): one outline read for grading.
// Resampled at 0.5 mm, oriented counter-clockwise (y-up); corners by turning angle over several
// windows; in/out excursions 1–8 mm deep over ≤ 15 mm = notch candidates (never corners); the
// canonical outline = the excursions cut off by their chord. Pure, mm.
import type { PtMm } from 'lib/pattern-import/types';
import { dist, resample, signedArea } from 'lib/pattern-import/pieces/geom';

export const GFIT_STEP_MM = 0.5;
/** A strong corner turns ≥ this within ±2 mm; a weak one between WEAK and STRONG. */
export const CORNER_STRONG_DEG = 30;
export const CORNER_WEAK_DEG = 15;
/** Excursion: depth window and the longest chord (its mouth). */
export const EXC_DEPTH_MIN_MM = 1;
export const EXC_DEPTH_MAX_MM = 8;
export const EXC_MOUTH_MAX_MM = 15;

export type GfitCorner = {
  /** Index into the (canonical) resampled ring. */
  i: number;
  /** Arc fraction of the ring, 0 … 1. */
  f: number;
  /** Signed turn over ±2 mm, degrees (+ = left = convex on a CCW ring). */
  turn: number;
  strong: boolean;
  p: PtMm;
};

export type GfitExcursion = {
  i0: number;
  i1: number;
  /** Arc fraction of its middle. */
  f: number;
  /** Signed depth, mm: + = outward (a bump), − = inward (a V / U notch cut in). */
  depth: number;
  mouth: number;
  p: PtMm;
};

export type GfitOutline = {
  /** The resampled ring as drawn (CCW). */
  raw: PtMm[];
  /** The same ring with every excursion cut off by its chord (same indices). */
  pts: PtMm[];
  L: number;
  area: number;
  corners: GfitCorner[];
  excursions: GfitExcursion[];
};

const wrap = (a: number) => {
  let x = a;
  while (x > Math.PI) x -= 2 * Math.PI;
  while (x < -Math.PI) x += 2 * Math.PI;
  return x;
};
const ang = (a: PtMm, b: PtMm) => Math.atan2(b.y - a.y, b.x - a.x);
const DEG = 180 / Math.PI;

/** Turn at i over ±k samples, radians (signed). */
function turnAt(p: readonly PtMm[], i: number, k: number): number {
  const n = p.length;
  const a = p[(i - k + n * 4) % n];
  const b = p[i];
  const c = p[(i + k) % n];
  if (dist(a, b) < 1e-6 || dist(b, c) < 1e-6) return 0;
  return wrap(ang(b, c) - ang(a, b));
}

/** The ring resampled at `step`, counter-clockwise. */
export function ringOf(outer: readonly PtMm[], step = GFIT_STEP_MM): PtMm[] {
  const o = signedArea(outer) < 0 ? outer.slice().reverse() : outer.slice();
  return resample(o, step, true);
}

/** In/out excursions of a ring (notch candidates), non-overlapping, deepest first kept. */
export function excursionsOf(p: readonly PtMm[], step = GFIT_STEP_MM): GfitExcursion[] {
  const n = p.length;
  if (n < 40) return [];
  const at = (i: number) => p[((i % n) + n) % n];
  const lead = Math.max(2, Math.round(2 / step));
  const found: GfitExcursion[] = [];
  // half path lengths, mm: a semicircle of mouth 15 mm runs 23.6 mm of path
  const halves = [2, 3, 4, 5.5, 7.5, 9.5, 12].map((h) => Math.max(2, Math.round(h / step)));
  for (const k of halves) {
    for (let c = 0; c < n; c++) {
      const a = at(c - k);
      const b = at(c + k);
      const mouth = dist(a, b);
      if (mouth < 0.8 || mouth > EXC_MOUTH_MAX_MM) continue;
      const chord = ang(a, b);
      const tin = ang(at(c - k - lead), a);
      const tout = ang(b, at(c + k + lead));
      if (Math.abs(wrap(tin - chord)) > 20 / DEG || Math.abs(wrap(tout - chord)) > 20 / DEG)
        continue;
      if (Math.abs(wrap(tout - tin)) > 15 / DEG) continue;
      // both legs on one line: b lies on a's incoming tangent (a jog onto another line does not)
      const off = Math.abs(Math.sin(wrap(chord - tin)) * mouth);
      if (off > 0.5 + 0.05 * mouth) continue;
      // depth from the chord (left of a→b = inside of a CCW ring)
      const ux = (b.x - a.x) / mouth;
      const uy = (b.y - a.y) / mouth;
      let dmax = 0;
      let turnAbs = 0;
      for (let j = c - k + 1; j < c + k; j++) {
        const q = at(j);
        const d = (q.x - a.x) * -uy + (q.y - a.y) * ux; // + = left = inward
        if (Math.abs(d) > Math.abs(dmax)) dmax = d;
        turnAbs += Math.abs(wrap(ang(q, at(j + 1)) - ang(at(j - 1), q)));
      }
      const depth = Math.abs(dmax);
      if (depth < EXC_DEPTH_MIN_MM || depth > EXC_DEPTH_MAX_MM) continue;
      if (turnAbs < 60 / DEG) continue;
      found.push({
        i0: (((c - k) % n) + n) % n,
        i1: (c + k) % n,
        f: c / n,
        depth: -dmax, // outward positive
        mouth,
        p: at(c),
      });
    }
  }
  // non-overlapping, deepest first (a wide window over a narrow notch is the same notch)
  found.sort((x, y) => Math.abs(y.depth) - Math.abs(x.depth) || x.mouth - y.mouth);
  const used = new Uint8Array(n);
  const out: GfitExcursion[] = [];
  for (const e of found) {
    const len = (e.i1 - e.i0 + n) % n;
    let clash = false;
    for (let j = 0; j <= len && !clash; j++) if (used[(e.i0 + j) % n]) clash = true;
    if (clash) continue;
    for (let j = 0; j <= len; j++) used[(e.i0 + j) % n] = 1;
    out.push(e);
  }
  return out.sort((x, y) => x.f - y.f);
}

/** The ring with each excursion replaced by its chord (indices kept). */
export function chordOff(p: readonly PtMm[], exc: readonly GfitExcursion[]): PtMm[] {
  const n = p.length;
  const out = p.slice();
  for (const e of exc) {
    const len = (e.i1 - e.i0 + n) % n;
    const a = p[e.i0];
    const b = p[e.i1];
    for (let j = 1; j < len; j++) {
      const t = j / len;
      out[(e.i0 + j) % n] = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
    }
  }
  return out;
}

/** Corner scales: half-windows, mm. A sharp vertex shows at 2 mm; a corner rounded by an offset
 * (round joins, radius up to ~10 mm) shows concentrated only at 5 or 12 mm. */
export const CORNER_SCALES_MM = [2, 5, 12];

/**
 * Corners, multi-scale: at each scale k, local maxima of |turn over ±k| ≥ 15° whose turn is
 * CONCENTRATED there (the turn over ±2k is not much larger — a curve turns twice as much over twice
 * the arc, a corner does not). The finest scale wins; a coarser detection within its window of a
 * finer one is the same corner. Strong ≥ 30° and well concentrated.
 */
export function cornersOf(p: readonly PtMm[], step = GFIT_STEP_MM): GfitCorner[] {
  const n = p.length;
  if (n < 12) return [];
  const out: GfitCorner[] = [];
  const taken = new Uint8Array(n);
  for (const hk of CORNER_SCALES_MM) {
    const k = Math.max(1, Math.round(hk / step));
    if (4 * k >= n) break;
    const t = new Float64Array(n);
    for (let i = 0; i < n; i++) t[i] = turnAt(p, i, k);
    const nms = Math.max(2, Math.round(Math.max(3, hk) / step));
    for (let i = 0; i < n; i++) {
      const v = Math.abs(t[i]);
      if (v < CORNER_WEAK_DEG / DEG) continue;
      let isMax = true;
      // ties: the first of a plateau wins (strict on the left, loose on the right)
      for (let d = 1; d <= nms && isMax; d++)
        if (Math.abs(t[(i - d + n) % n]) >= v || Math.abs(t[(i + d) % n]) > v) isMax = false;
      if (!isMax) continue;
      let clash = false;
      for (let d = -k; d <= k && !clash; d++) if (taken[(i + d + n) % n]) clash = true;
      if (clash) continue;
      const t2 = turnAt(p, i, 2 * k);
      const ratio = Math.sign(t2) === Math.sign(t[i]) ? Math.abs(t2) / v : Infinity;
      if (ratio > 1.6) continue;
      const deg = t[i] * DEG;
      out.push({
        i,
        f: i / n,
        turn: deg,
        strong: Math.abs(deg) >= CORNER_STRONG_DEG && ratio <= 1.4,
        p: p[i],
      });
      for (let d = -k; d <= k; d++) taken[(i + d + n) % n] = 1;
    }
  }
  return out.sort((x, y) => x.i - y.i);
}

export function analyseOutline(
  outer: readonly PtMm[],
  step = GFIT_STEP_MM,
  /** GRADE P1: also chord the notch-like bumps excursionsOf misses (semicircles, slits) */
  chord = false,
): GfitOutline | null {
  if (outer.length < 3) return null;
  const raw = ringOf(outer, step);
  if (raw.length < 20) return null;
  const excursions = excursionsOf(raw, step);
  // GRADE P1 (P23 to-do, `chord`): notches are marks, never shape — after the reader's excursions,
  // every notch-like bump it misses (a semicircle read on one side, a slit: mouth < 0.8 mm) is
  // chorded too, indices kept. The P1 path (checks.ts outlineOf) reads with it; the SILENT G26 model
  // (fit.ts) keeps the P0 read unless GFIT_P1_SILENT=1 (measured: it moves G26 holds, GRADE-P1.md).
  const pts0 = excursions.length ? chordOff(raw, excursions) : raw;
  const pts = chord || gfitP1Silent() ? chordBumps(pts0) : pts0;
  let L = 0;
  for (let i = 0; i < pts.length; i++) L += dist(pts[i], pts[(i + 1) % pts.length]);
  return {
    raw,
    pts,
    L,
    area: Math.abs(signedArea(pts)),
    corners: cornersOf(pts, step),
    excursions,
  };
}

/** Probe switch (node only): the SILENT G26 model reads outlines and pairs corners the P1 way. */
export function gfitP1Silent(): boolean {
  return typeof process !== 'undefined' && !!process.env?.GFIT_P1_SILENT;
}

/**
 * Notch-like bumps left in a 0.5 mm ring (looser than the reader's excursionsOf, which misses some
 * semicircles and every slit): a stretch of 3–40 mm path whose ends are ≤ 15 mm apart with path ≥
 * 1.5 × mouth (a semicircle is 1.57×, a right-angle corner 1.41×) and whose legs before / after
 * run along the chord (≤ 15°; a slit — mouth < 0.5 mm — has no chord to check). Spans [i, i + k],
 * non-overlapping, the widest-ratio window per start.
 */
export function bumpSpans(ring: readonly PtMm[], maxPathMm = 40): [number, number][] {
  const n = ring.length;
  const at = (i: number) => ring[((i % n) + n) % n];
  const ang = (a: PtMm, b: PtMm) => Math.atan2(b.y - a.y, b.x - a.x);
  const wrap = (x: number) => Math.atan2(Math.sin(x), Math.cos(x));
  const out: [number, number][] = [];
  const kMax = Math.round(maxPathMm / 0.5);
  for (let i = 0; i < n; ) {
    let best = -1;
    let bestRatio = 0;
    for (let k = 6; k <= kMax && k < n / 3; k++) {
      const a = at(i);
      const b = at(i + k);
      const mouth = Math.hypot(b.x - a.x, b.y - a.y);
      const path = k * 0.5;
      if (mouth > 15 || path < 1.5 * mouth) continue;
      if (mouth >= 0.5) {
        const ch = ang(a, b);
        if (Math.abs(wrap(ang(at(i - 6), a) - ch)) > 0.26) continue;
        if (Math.abs(wrap(ang(b, at(i + k + 6)) - ch)) > 0.26) continue;
      } else if (path < 3) continue;
      const ratio = path / Math.max(mouth, 0.25);
      if (ratio > bestRatio) {
        bestRatio = ratio;
        best = k;
      }
    }
    if (best > 0) {
      out.push([i, i + best]);
      i += best;
    } else i++;
  }
  return out;
}

/** Centres of the notch-like bumps (bumpSpans). */
export function notchBumps(ring: readonly PtMm[]): PtMm[] {
  const n = ring.length;
  return bumpSpans(ring).map(([a, b]) => ring[((a + b) >> 1) % n]);
}

/** The ring with every notch-like bump replaced by its chord (indices kept). */
export function chordBumps(ring: readonly PtMm[]): PtMm[] {
  const n = ring.length;
  const out = ring.slice();
  for (const [a, b] of bumpSpans(ring)) {
    const p = ring[a % n];
    const q = ring[b % n];
    for (let j = a + 1; j < b; j++) {
      const t = (j - a) / (b - a);
      out[j % n] = { x: p.x + (q.x - p.x) * t, y: p.y + (q.y - p.y) * t };
    }
  }
  return out;
}
