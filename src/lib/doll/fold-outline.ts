// The folded footprint of a piece, 2D, no mesh and no solver: what the UI draws after a fold is
// entered. The same geometry the doll applies to its mesh (doll.ts foldPanel): every fold in seq
// order turns the side of its line that holds `flipAt` (as cut) over the line's current image, a
// plain reflection — so a second fold over an already turned part rolls or zigzags it as paper
// would. A line that crosses an earlier fold is no longer one line when it folds: each stretch went
// where its own ply went, so each ply turns over the image of its own stretch (`carry`).
// Stack ranks follow the doll too: the turned package goes under (inward) or over (outward) the
// rest, its own order reversed as a flipped stack is.

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

/**
 * One stretch of a fold line between its crossings with earlier folds: the earlier folds that moved
 * it (one flag per fold, in order) and the line's image under those moves.
 */
export type FoldStretch = { moved: readonly boolean[]; a1: Pt; b1: Pt };

/**
 * An applied fold: the side test as cut, the side that turned, its line's stretches in order.
 * `stretchOf` picks the stretch by the point as cut (a fold bent across a pleat: one line per
 * region). `map` = a step that moves every point, not a reflection (a pleat closed: the halves turn
 * about its apex) — given the point now and as cut; its side test only says which plies it flipped.
 */
export type FoldStep = {
  sideOf: (q: Pt) => number;
  sF: number;
  stretches: readonly FoldStretch[];
  stretchOf?: (q: Pt) => FoldStretch;
  map?: (p: Pt, q: Pt) => Pt;
};

/** `p` mirrored over the line through `a1` and `b1`. */
export function reflectTo(p: Pt, a1: Pt, b1: Pt): Pt {
  const L = Math.hypot(b1[0] - a1[0], b1[1] - a1[1]) || 1;
  const nx = -(b1[1] - a1[1]) / L;
  const ny = (b1[0] - a1[0]) / L;
  const d = (p[0] - a1[0]) * nx + (p[1] - a1[1]) * ny;
  return [p[0] - 2 * d * nx, p[1] - 2 * d * ny];
}

/**
 * The stretch a ply turns over: the one the earlier folds moved as they moved the ply. A ply with
 * no stretch of its own on this line is carried along: it takes the stretch nearest its own moves,
 * the first along the line on a tie.
 */
export function stretchFor(stretches: readonly FoldStretch[], moved: readonly boolean[]) {
  let best = stretches[0];
  if (stretches.length === 1) return best;
  let bestD = Infinity;
  for (const s of stretches) {
    let d = 0;
    for (let i = 0; i < s.moved.length; i++) if (s.moved[i] !== moved[i]) d++;
    if (d < bestD) {
      bestD = d;
      best = s;
    }
  }
  return best;
}

/** Which of the folds in `chain` move a point as cut, by its side of each line. */
export const movedBy = (q: Pt, chain: readonly FoldStep[]): boolean[] =>
  chain.map((c) => c.sideOf(q) === c.sF);

/** A point as cut, in a ply moved by `moved` → its folded place. */
export function carry(q: Pt, moved: readonly boolean[], chain: readonly FoldStep[]): Pt {
  let p: Pt = [q[0], q[1]];
  chain.forEach((c, i) => {
    if (c.map) {
      p = c.map(p, q);
      return;
    }
    if (!moved[i]) return;
    const s = c.stretchOf ? c.stretchOf(q) : stretchFor(c.stretches, moved);
    p = reflectTo(p, s.a1, s.b1);
  });
  return p;
}

/**
 * Clip a polygon to the half-plane `value(p) * sign >= 0` (Sutherland–Hodgman). `value` must be the
 * signed distance, not its sign: the crossing is interpolated from it.
 */
function clipHalf(poly: readonly Pt[], value: (p: Pt) => number, sign: number): Pt[] {
  const out: Pt[] = [];
  const n = poly.length;
  for (let i = 0; i < n; i++) {
    const p = poly[i];
    const q = poly[(i + 1) % n];
    const sp = value(p) * sign;
    const sq = value(q) * sign;
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
 * turned ones reflected over the current image of their own stretch of the line.
 */
export function foldPlies(poly: readonly Pt[], folds: readonly FoldMm[]): FoldedPlies {
  const P: Pt[] = poly.map((q) => [q[0], q[1]]);
  /** Per applied fold: signed distance from its line as cut, the side that turned, the line now. */
  const chain: (FoldStep & { value: (q: Pt) => number })[] = [];
  /** A point as cut → its folded place (the side tests read the point as cut). */
  const foldPt = (q: Pt): Pt => carry(q, movedBy(q, chain), chain);
  let plies: { flat: Pt[]; layer: number; moved: boolean[] }[] = [{ flat: P, layer: 0, moved: [] }];
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
    const fixed: typeof plies = [];
    const moving: typeof plies = [];
    /** The plies this line cuts, where along the line: one rigid stretch of it each. */
    const cut: { moved: boolean[]; at: number }[] = [];
    for (const ply of plies) {
      const keep = clipHalf(ply.flat, value, -sF);
      const move = clipHalf(ply.flat, value, sF);
      const kept = keep.length >= 3 && area2(keep) > EPS;
      const turned = move.length >= 3 && area2(move) > EPS;
      if (kept) fixed.push({ flat: keep, layer: ply.layer, moved: [...ply.moved, false] });
      if (turned) moving.push({ flat: move, layer: ply.layer, moved: [...ply.moved, true] });
      if (kept && turned) {
        const on = keep.filter((q) => Math.abs(value(q)) < 1e-6);
        const along = on.map((q) => (q[0] - a[0]) * (b[0] - a[0]) + (q[1] - a[1]) * (b[1] - a[1]));
        cut.push({ moved: ply.moved, at: Math.min(...along) + Math.max(...along) });
      }
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
    // The line's current image, stretch by stretch: where the previous folds carried each ply it
    // cuts. Plies moved alike moved as one body, so their stretches are one line.
    const stretches: FoldStretch[] = [];
    for (const c of cut.sort((x, y) => x.at - y.at)) {
      if (stretches.some((s) => s.moved.every((m, i) => m === c.moved[i]))) continue;
      stretches.push({
        moved: c.moved,
        a1: carry(a, c.moved, chain),
        b1: carry(b, c.moved, chain),
      });
    }
    if (!stretches.length)
      stretches.push({ moved: movedBy(a, chain), a1: foldPt(a), b1: foldPt(b) });
    chain.push({ value, sideOf, sF, stretches });
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
  // Crossing folds: a ply's corners on a line belong to the ply, so it stays rigid. Tearing apart
  // only where a straight crossing off the square cannot fold flat (the plies then part on the
  // earlier line's arm), as the mesh does.
  const crossed = chain.some((c) => c.stretches.length > 1);
  return {
    plies: plies.map((ply) => ({
      poly: ply.flat.map((q) => (crossed ? carry(q, ply.moved, chain) : foldPt(q))),
      layer: ply.layer,
    })),
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
