// The folded footprint of a piece, 2D, no mesh and no solver: what the UI draws after a fold is
// entered. The same geometry the doll applies to its mesh (doll.ts foldPanel): every fold in seq
// order turns the side of its line that holds `flipAt` (as cut) over the line's current image, a
// plain reflection — so a second fold over an already turned part rolls or zigzags it as paper
// would. Stack ranks follow the doll too: the turned package goes under (inward) or over
// (outward) the rest, its own order reversed as a flipped stack is.

import type { Pt2 } from 'lib/assembly-skeleton/types';

import type { DollFold, UV } from './types';

export type FoldedOutline = {
  /** The contour as cut, mapped through the folds (crossings of the fold lines inserted). */
  outline: UV[];
  /** Every ply of the folded piece as a polygon in its folded place, with its stack rank. */
  plies: { poly: UV[]; layer: number }[];
  /** Extent of the folded footprint across the first fold's line, mm — with `frame` only. */
  finishedWidthMm?: number;
  /** The same extent of the piece as cut, mm — with `frame` only. */
  cutWidthMm?: number;
  /** Folds (by seq) that changed nothing: the line misses the piece or `flipAt` is on it. */
  skipped: number[];
};

type Pt = Pt2;

const EPS = 1e-9;

/** A fold with its line and `flipAt` in the piece's own frame, mm. */
export type FoldMm = { seq: number; a: Pt; b: Pt; flipAt: Pt; kind: DollFold['kind'] };

export type FoldedPlies = {
  /** Every ply of the folded piece as a polygon in its folded place, mm, with its stack rank. */
  plies: { poly: Pt[]; layer: number }[];
  /** The contour as cut, mapped through the folds (crossings of the fold lines inserted). */
  outline: Pt[];
  /** Folds (by seq) that changed nothing: the line misses the piece or `flipAt` is on it. */
  skipped: number[];
  /** The first applied fold's line: a point and the unit normal across it, mm. */
  across: { a: Pt; n: Pt } | null;
};

/** Clip a polygon to the half-plane `sideOf(p) * sign >= 0` (Sutherland–Hodgman). */
function clipHalf(poly: readonly Pt[], sideOf: (p: Pt) => number, sign: number): Pt[] {
  const out: Pt[] = [];
  const n = poly.length;
  for (let i = 0; i < n; i++) {
    const p = poly[i];
    const q = poly[(i + 1) % n];
    const sp = sideOf(p) * sign;
    const sq = sideOf(q) * sign;
    if (sp >= -EPS) out.push(p);
    if ((sp > EPS && sq < -EPS) || (sp < -EPS && sq > EPS)) {
      const t = sp / (sp - sq);
      out.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]);
    }
  }
  return out;
}

function area2(poly: readonly Pt[]): number {
  let a = 0;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++)
    a += poly[j][0] * poly[i][1] - poly[i][0] * poly[j][1];
  return Math.abs(a);
}

/**
 * The piece's contour folded by `folds` (seq order), mm — the geometry the doll applies to its
 * mesh (doll.ts foldPanel), on the contour polygon instead: each ply clipped by the line and the
 * turned ones reflected over the line's current image.
 */
export function foldPlies(poly: readonly Pt[], folds: readonly FoldMm[]): FoldedPlies {
  const P: Pt[] = poly.map((q) => [q[0], q[1]]);
  /** Per applied fold: signed distance from its line as cut, the side that turned, the line now. */
  const chain: {
    value: (q: Pt) => number;
    sideOf: (q: Pt) => number;
    sF: number;
    a1: Pt;
    b1: Pt;
  }[] = [];
  const reflectTo = (p: Pt, a1: Pt, b1: Pt): Pt => {
    const L = Math.hypot(b1[0] - a1[0], b1[1] - a1[1]) || 1;
    const nx = -(b1[1] - a1[1]) / L;
    const ny = (b1[0] - a1[0]) / L;
    const d = (p[0] - a1[0]) * nx + (p[1] - a1[1]) * ny;
    return [p[0] - 2 * d * nx, p[1] - 2 * d * ny];
  };
  /** A point as cut → its folded place (the side tests read the point as cut). */
  const foldPt = (q: Pt): Pt => {
    let p: Pt = [q[0], q[1]];
    for (const c of chain) if (c.sideOf(q) === c.sF) p = reflectTo(p, c.a1, c.b1);
    return p;
  };
  let plies: { flat: Pt[]; layer: number }[] = [{ flat: P, layer: 0 }];
  const skipped: number[] = [];
  let across: FoldedPlies['across'] = null;
  for (const fold of [...folds].sort((x, y) => x.seq - y.seq)) {
    // The 3D doll has no rigid two-half pleat primitive yet. Leaving these rows flat is the safe
    // fallback: treating every non-inward kind as outward would turn all three halves face down.
    if (fold.kind !== 'inward' && fold.kind !== 'outward') {
      skipped.push(fold.seq);
      continue;
    }
    const { a, b } = fold;
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (L < 1e-9) {
      skipped.push(fold.seq);
      continue;
    }
    const value = (q: Pt) => ((b[0] - a[0]) * (q[1] - a[1]) - (b[1] - a[1]) * (q[0] - a[0])) / L;
    const sideOf = (q: Pt) => {
      const s = value(q);
      return Math.abs(s) < EPS ? 0 : Math.sign(s);
    };
    const sF = sideOf(fold.flipAt);
    if (!sF) {
      skipped.push(fold.seq);
      continue;
    }
    const fixed: { flat: Pt[]; layer: number }[] = [];
    const moving: { flat: Pt[]; layer: number }[] = [];
    for (const ply of plies) {
      const keep = clipHalf(ply.flat, sideOf, -sF);
      const move = clipHalf(ply.flat, sideOf, sF);
      if (keep.length >= 3 && area2(keep) > EPS) fixed.push({ flat: keep, layer: ply.layer });
      if (move.length >= 3 && area2(move) > EPS) moving.push({ flat: move, layer: ply.layer });
    }
    if (!moving.length || !fixed.length) {
      skipped.push(fold.seq);
      continue;
    }
    let lo = Infinity;
    let hi = -Infinity;
    let minM = Infinity;
    let maxM = -Infinity;
    for (const f of fixed) {
      lo = Math.min(lo, f.layer);
      hi = Math.max(hi, f.layer);
    }
    for (const m of moving) {
      minM = Math.min(minM, m.layer);
      maxM = Math.max(maxM, m.layer);
    }
    for (const m of moving)
      m.layer = fold.kind === 'inward' ? lo - 1 - (m.layer - minM) : hi + 1 + (maxM - m.layer);
    // The line's current image: where the previous folds carried it.
    chain.push({ value, sideOf, sF, a1: foldPt(a), b1: foldPt(b) });
    if (!across) across = { a, n: [-(b[1] - a[1]) / L, (b[0] - a[0]) / L] };
    plies = [...fixed, ...moving];
  }
  // The contour with every fold-line crossing inserted, then mapped.
  const outline: Pt[] = [];
  for (let i = 0; i < P.length; i++) {
    const p = P[i];
    const q = P[(i + 1) % P.length];
    const cuts: number[] = [];
    for (const c of chain) {
      const sp = c.sideOf(p);
      const sq = c.sideOf(q);
      if (sp !== 0 && sq !== 0 && sp !== sq) {
        // Parameter along p→q where the line (as cut) is crossed.
        const s0 = c.value(p);
        const s1 = c.value(q);
        cuts.push(s0 / (s0 - s1));
      }
    }
    cuts.sort((x, y) => x - y);
    outline.push(foldPt(p));
    for (const t of cuts) {
      if (t <= EPS || t >= 1 - EPS) continue;
      outline.push(foldPt([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]));
    }
  }
  return {
    plies: plies.map((ply) => ({ poly: ply.flat.map(foldPt), layer: ply.layer })),
    outline,
    skipped,
    across,
  };
}

/**
 * The piece's contour (seam frame, unit square) folded by `folds`. `frame` = the frame's size in
 * mm (lib/seams `frameOf` w, h): with it the reflections are true isometries of the piece and the
 * widths come back in mm; without it the unit square is taken as square.
 */
export function foldedOutline(
  poly: readonly UV[],
  folds: readonly DollFold[],
  frame?: { w: number; h: number },
): FoldedOutline {
  const w = frame?.w ?? 1;
  const h = frame?.h ?? 1;
  const mm = (p: UV): Pt => [p[0] * w, p[1] * h];
  const uv = (p: Pt): UV => [p[0] / w, p[1] / h];
  const P = poly.map(mm);
  const folded = foldPlies(
    P,
    folds.map((f) => ({ seq: f.seq, a: mm(f.a), b: mm(f.b), flipAt: mm(f.flipAt), kind: f.kind })),
  );
  const out: FoldedOutline = {
    outline: folded.outline.map(uv),
    plies: folded.plies.map((ply) => ({ poly: ply.poly.map(uv), layer: ply.layer })),
    skipped: folded.skipped,
  };
  if (frame && folded.across) {
    const { a, n } = folded.across;
    const across = (p: Pt) => (p[0] - a[0]) * n[0] + (p[1] - a[1]) * n[1];
    let lo = Infinity;
    let hi = -Infinity;
    let clo = Infinity;
    let chi = -Infinity;
    for (const ply of folded.plies)
      for (const p of ply.poly) {
        const d = across(p);
        lo = Math.min(lo, d);
        hi = Math.max(hi, d);
      }
    for (const p of P) {
      const d = across(p);
      clo = Math.min(clo, d);
      chi = Math.max(chi, d);
    }
    out.finishedWidthMm = hi - lo;
    out.cutWidthMm = chi - clo;
  }
  return out;
}
