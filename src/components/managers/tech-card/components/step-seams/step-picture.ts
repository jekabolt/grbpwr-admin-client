// THE STEP PICTURE, PURE (seam picker v2, owner OK 27.10): a step's inputs drawn as UNITS — each
// input's leaf pieces laid as assembled by the card's own placer (`unionLayout`, the one the unit
// pictograms and the assembly map use), the inputs laid along the step's seam and then pulled
// apart, like the map's PairShape. The picker, its RESULT panel and the SEAMS row tile share it.
//
// Frames. A piece's segmentation (`PieceGeom`: `rs`, edges) is mm with y UP; the layout keeps that
// frame (an affine per piece). Only `fitBox` turns it into screen px with y DOWN. The drawing
// frame's inner lines (y down) come in as [x, −y].

import type { Affine, EdgeId, PieceGeom, Pt2, SeamCandidate } from 'lib/assembly-skeleton/types';
import { pieceKeyOf, resolveEdge, unionLayout } from 'lib/assembly-skeleton/union';
import { apply, compose, translate } from 'lib/assembly-skeleton/union/affine';
import { unitDisplayName } from 'lib/assembly-unit-name';

export type Box = { x0: number; y0: number; x1: number; y1: number };
/** One seam as two lists of edges (a side may run over several edges). */
export type SeamSides = { a: readonly EdgeId[]; b: readonly EdgeId[] };

export function boxOf(pts: Iterable<Pt2>): Box {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const [x, y] of pts) {
    if (x < x0) x0 = x;
    if (y < y0) y0 = y;
    if (x > x1) x1 = x;
    if (y > y1) y1 = y;
  }
  return Number.isFinite(x0) ? { x0, y0, x1, y1 } : { x0: 0, y0: 0, x1: 1, y1: 1 };
}

export function centroidOf(pts: readonly Pt2[]): Pt2 {
  if (pts.length === 0) return [0, 0];
  let x = 0;
  let y = 0;
  for (const p of pts) {
    x += p[0];
    y += p[1];
  }
  return [x / pts.length, y / pts.length];
}

const EVIDENCE: SeamCandidate['evidence'] = {
  dLenMm: 0,
  relLen: 0,
  notchScore: null,
  curvature: 'flat',
  hand: 'neutral',
  twin: 'none',
  self: false,
};

/**
 * A pick / proposal / stored pair as a seam the placer reads: each side by its longest edge that
 * the geometry holds. Inner lines and same-piece pairs place nothing → null.
 */
export function candidateOf(
  s: SeamSides,
  geoms: ReadonlyMap<string, PieceGeom>,
): SeamCandidate | null {
  const longest = (ids: readonly EdgeId[]) => {
    let best: { id: EdgeId; len: number } | null = null;
    for (const id of ids) {
      const e = resolveEdge(id, geoms);
      if (e && (!best || e.len > best.len)) best = { id, len: e.len };
    }
    return best?.id ?? null;
  };
  const a = longest(s.a);
  const b = longest(s.b);
  if (!a || !b || pieceKeyOf(a) === pieceKeyOf(b)) return null;
  return { a, b, score: 1, evidence: EVIDENCE, kind: 'edge' };
}

/** Piece → index of the step input that holds it (the first, when two inputs share a piece). */
export function inputIndex(leaves: readonly (readonly string[])[]): Map<string, number> {
  const m = new Map<string, number>();
  leaves.forEach((set, i) => {
    for (const k of set) if (!m.has(k)) m.set(k, i);
  });
  return m;
}

/**
 * The card's seams split by the step: `inner` — both ends inside one input (already sewn, they keep
 * the unit's shape); `cross` — between two inputs (what this step may sew). Seams whose edges the
 * picker's geometry does not hold are dropped.
 */
export function splitSeams(
  chosen: readonly SeamCandidate[],
  leaves: readonly (readonly string[])[],
  geoms: ReadonlyMap<string, PieceGeom>,
): { inner: SeamCandidate[]; cross: SeamCandidate[] } {
  const where = inputIndex(leaves);
  const inner: SeamCandidate[] = [];
  const cross: SeamCandidate[] = [];
  for (const c of chosen) {
    if (c.kind === 'closure-not-seam') continue;
    const ia = where.get(pieceKeyOf(c.a));
    const ib = where.get(pieceKeyOf(c.b));
    if (ia == null || ib == null) continue;
    if (c.kind !== 'surface' && (!resolveEdge(c.a, geoms) || !resolveEdge(c.b, geoms))) continue;
    (ia === ib ? inner : cross).push(c);
  }
  return { inner, cross };
}

export type StepLayout = {
  /** Piece → its rs frame (mm, y up) into the picture frame (mm, y up). */
  T: Map<string, Affine>;
  /** Piece → step input index. */
  input: Map<string, number>;
  /** Extent of every drawn piece, picture frame. */
  bbox: Box;
};

const EMPTY_LAYOUT: StepLayout = {
  T: new Map(),
  input: new Map(),
  bbox: { x0: 0, y0: 0, x1: 1, y1: 1 },
};

const worldOf = (g: PieceGeom, T: Affine) => g.rs.map((p) => apply(T, p));

/**
 * Lay the step out: every leaf piece placed by `unionLayout` along `seams` (inner seams keep each
 * unit whole, a cross seam lays the inputs against each other); a piece the placer leaves out
 * (overlap, interfacing) stands beside, so every piece is still drawn. `explode` (share of the
 * extent) then pulls each input away from the centre of the cross seams — 0 = the joined result.
 */
export function stepLayout(
  leaves: readonly (readonly string[])[],
  seams: readonly SeamCandidate[],
  geoms: ReadonlyMap<string, PieceGeom>,
  opts: { explode?: number; rasterMm?: number } = {},
): StepLayout {
  const input = inputIndex(leaves);
  const keys = [...input.keys()].filter((k) => (geoms.get(k)?.rs.length ?? 0) >= 3);
  if (keys.length === 0) return EMPTY_LAYOUT;
  const L = unionLayout(keys, seams, geoms, opts.rasterMm ? { rasterMm: opts.rasterMm } : {});
  const T = new Map<string, Affine>(L.placements.map((p) => [p.pieceKey, p.T]));

  // Left out by the placer: in a row to the right, tops level.
  const missing = keys.filter((k) => !T.has(k));
  if (missing.length) {
    const placed = [...T].flatMap(([k, t]) => worldOf(geoms.get(k)!, t));
    const all = placed.length ? boxOf(placed) : { x0: 0, y0: 0, x1: 0, y1: 0 };
    let x = placed.length ? all.x1 : 0;
    const gap = 0.08 * Math.max(all.x1 - all.x0, all.y1 - all.y0, 100);
    for (const k of missing) {
      const b = boxOf(geoms.get(k)!.rs);
      if (placed.length || x !== 0) x += gap;
      T.set(k, translate(x - b.x0, all.y1 - b.y1));
      x += b.x1 - b.x0;
    }
  }

  const explode = opts.explode ?? 0;
  const groups = new Set(keys.map((k) => input.get(k)));
  if (explode > 0 && groups.size > 1) {
    const all = boxOf(keys.flatMap((k) => worldOf(geoms.get(k)!, T.get(k)!)));
    const seamPts: Pt2[] = [];
    for (const c of seams) {
      const ia = input.get(pieceKeyOf(c.a));
      const ib = input.get(pieceKeyOf(c.b));
      if (ia == null || ib == null || ia === ib) continue;
      for (const id of [c.a, c.b]) {
        const e = resolveEdge(id, geoms);
        const t = T.get(pieceKeyOf(id));
        if (e && t) seamPts.push(...e.pts.map((p) => apply(t, p)));
      }
    }
    const centre = seamPts.length
      ? centroidOf(seamPts)
      : centroidOf(keys.flatMap((k) => worldOf(geoms.get(k)!, T.get(k)!)));
    const gap = Math.max(all.x1 - all.x0, all.y1 - all.y0) * explode;
    const shift = new Map<number, Affine>();
    for (const gi of groups) {
      const pts = keys
        .filter((k) => input.get(k) === gi)
        .flatMap((k) => worldOf(geoms.get(k)!, T.get(k)!));
      const c = centroidOf(pts);
      const dx = c[0] - centre[0];
      const dy = c[1] - centre[1];
      const len = Math.hypot(dx, dy);
      shift.set(gi!, len > 1e-6 ? translate((dx / len) * gap, (dy / len) * gap) : translate(0, 0));
    }
    for (const k of keys) T.set(k, compose(shift.get(input.get(k)!)!, T.get(k)!));
  }

  const bbox = boxOf(keys.flatMap((k) => worldOf(geoms.get(k)!, T.get(k)!)));
  return { T, input, bbox };
}

// ─── screen ───────────────────────────────────────────────────────────────────────────────────────

export type Fit = { s: number; tx: number; ty: number };

/**
 * The picture fitted into a w × h px box with `pad` px kept free on every side, centred, y flipped
 * to screen. The scale fills the box on the tighter axis — a late step's whole shirt takes the
 * canvas, not a strip of it.
 */
export function fitBox(b: Box, w: number, h: number, pad: number): Fit {
  const bw = Math.max(b.x1 - b.x0, 1);
  const bh = Math.max(b.y1 - b.y0, 1);
  const iw = Math.max(w - 2 * pad, 1);
  const ih = Math.max(h - 2 * pad, 1);
  const s = Math.min(iw / bw, ih / bh);
  return {
    s,
    tx: pad + (iw - bw * s) / 2 - b.x0 * s,
    ty: pad + (ih - bh * s) / 2 + b.y1 * s,
  };
}

/** A picture-frame point (mm, y up) on screen (px, y down). */
export const toPx = (f: Fit, p: Pt2): Pt2 => [p[0] * f.s + f.tx, -p[1] * f.s + f.ty];

export const pathOf = (pts: readonly Pt2[], closed = false) =>
  pts.length
    ? `M${pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join('L')}${closed ? 'Z' : ''}`
    : '';

/** The point halfway along a polyline and the unit tangent there. */
export function midAlong(pts: readonly Pt2[]): { p: Pt2; t: Pt2 } {
  if (pts.length < 2) return { p: pts[0] ?? [0, 0], t: [1, 0] };
  let total = 0;
  for (let i = 1; i < pts.length; i++)
    total += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  let left = total / 2;
  for (let i = 1; i < pts.length; i++) {
    const dx = pts[i][0] - pts[i - 1][0];
    const dy = pts[i][1] - pts[i - 1][1];
    const d = Math.hypot(dx, dy);
    if (d >= left && d > 0) {
      const k = left / d;
      return { p: [pts[i - 1][0] + k * dx, pts[i - 1][1] + k * dy], t: [dx / d, dy / d] };
    }
    left -= d;
  }
  const a = pts[pts.length - 2];
  const b = pts[pts.length - 1];
  const d = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
  return { p: b, t: [(b[0] - a[0]) / d, (b[1] - a[1]) / d] };
}

/**
 * Where a label of an edge goes: `off` px off the edge's middle, on the side away from `inside`
 * (the piece's centre), anchored so the text runs away from the line.
 */
export function labelSpot(
  pts: readonly Pt2[],
  inside: Pt2,
  off: number,
): { at: Pt2; anchor: 'start' | 'middle' | 'end'; t: Pt2 } {
  const { p, t } = midAlong(pts);
  let n: Pt2 = [t[1], -t[0]];
  if (n[0] * (inside[0] - p[0]) + n[1] * (inside[1] - p[1]) > 0) n = [-n[0], -n[1]];
  return {
    at: [p[0] + n[0] * off, p[1] + n[1] * off],
    anchor: Math.abs(n[0]) < 0.7 ? 'middle' : n[0] > 0 ? 'start' : 'end',
    t,
  };
}

export type LabelBox = {
  at: Pt2;
  anchor: 'start' | 'middle' | 'end';
  t: Pt2;
  w: number;
  h: number;
};

const rectOf = (l: LabelBox, at: Pt2) => {
  const x0 = l.anchor === 'start' ? at[0] : l.anchor === 'end' ? at[0] - l.w : at[0] - l.w / 2;
  return { x0, y0: at[1] - l.h / 2, x1: x0 + l.w, y1: at[1] + l.h / 2 };
};
const hits = (a: Box, b: Box) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;

/**
 * Labels that would sit on each other (two facing edges both label into the gap between them) are
 * slid along their own edge, one label height at a time, alternating sides, until they stand clear.
 * Returns each label's final spot, in input order.
 */
export function spreadLabels(labels: readonly LabelBox[]): Pt2[] {
  const placed: Box[] = [];
  return labels.map((l) => {
    const step = l.h + 2;
    for (let i = 0; i < 12; i++) {
      const k = i === 0 ? 0 : Math.ceil(i / 2) * (i % 2 ? 1 : -1);
      const at: Pt2 = [l.at[0] + l.t[0] * step * k, l.at[1] + l.t[1] * step * k];
      const r = rectOf(l, at);
      if (!placed.some((p) => hits(p, r))) {
        placed.push(r);
        return at;
      }
    }
    placed.push(rectOf(l, l.at));
    return l.at;
  });
}

// ─── partner, names ───────────────────────────────────────────────────────────────────────────────

/** A partner is offered within this share of the longer side. */
const PARTNER_REL = 0.1;

/**
 * The edge on the other side closest in length to a picked side (ease applied), none within 10 %
 * or shorter than 30 mm → null. Never «0 mm»: a picked side either has a partner or stands alone.
 */
export function partnerOf(
  len: number,
  candidates: readonly { id: EdgeId; lenMm: number }[],
  delta: (a: number, b: number) => number,
): EdgeId | null {
  if (!(len > 0)) return null;
  let best: { id: EdgeId; rel: number } | null = null;
  for (const c of candidates) {
    if (c.lenMm < 30) continue;
    const rel = delta(len, c.lenMm) / Math.max(len, c.lenMm, 1);
    if (rel > PARTNER_REL) continue;
    if (!best || rel < best.rel) best = { id: c.id, rel };
  }
  return best?.id ?? null;
}

/**
 * An input's one human name: a piece by its own name, a unit by the name its producing step gave
 * it (the latest earlier step that names it), else its key read as words.
 */
export function inputName(
  key: string,
  index: number,
  ops: readonly { outputUnitKey?: string; outputUnitName?: string }[],
  isPiece: (key: string) => boolean,
  pieceName: (key: string) => string,
): string {
  if (isPiece(key)) return pieceName(key);
  for (let i = index - 1; i >= 0; i--) {
    const o = ops[i];
    if ((o?.outputUnitKey ?? '').trim() === key && (o?.outputUnitName ?? '').trim())
      return (o?.outputUnitName ?? '').trim();
  }
  return unitDisplayName({ key });
}
