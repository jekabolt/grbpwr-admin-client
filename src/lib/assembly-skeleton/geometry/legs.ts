// TROUSER LEG PANELS — read from the drawing alone (no names).
//
// A leg panel is a tall, narrow piece drawn upright whose top inner corner is the crotch curve: a
// concave edge running from the waist down to the crotch point (the piece's widest point on that
// side). From the crotch point the inseam runs down the piece; the outseam is the long lengthwise
// edge on the other side. Which leg a panel belongs to is read from the drawing as well: pieces are
// drawn face up, so a front and a back of ONE leg carry their crotch curves on opposite sides of
// their drawings (the left front, seen from the front, has its crotch on its left; the left back,
// seen from behind, on its right) — the two fronts (or the two backs) carry them on opposite sides
// too, but they are mirror twins, and mirror twins meet only at the rise.
//
// The back of a leg is the panel with the deeper crotch extension (the back crotch reaches further
// out to cover the seat): read from the rise's horizontal reach, never from a name.

import type { Edge, PieceGeom, Pt2 } from '../types';

export type LegPanel = {
  piece: PieceGeom;
  /** The crotch curve (front / back rise): waist to the crotch point. */
  rise: Edge;
  /** Long lengthwise edge from the crotch point down to the hem. */
  inseam: Edge;
  /** Long lengthwise edge on the other side of the piece. */
  outseam: Edge;
  /** Drawing side (−1 left, +1 right) the crotch point is on. */
  crotchSide: -1 | 1;
  /** Horizontal reach of the rise (crotch extension), mm. */
  reachMm: number;
  /** From the crotch extension against the other leg panels; null when they do not tell. */
  part: 'front' | 'back' | null;
};

const box = (p: PieceGeom) => {
  let x0 = Infinity;
  let x1 = -Infinity;
  let y0 = Infinity;
  let y1 = -Infinity;
  for (const [x, y] of p.rs) {
    x0 = Math.min(x0, x);
    x1 = Math.max(x1, x);
    y0 = Math.min(y0, y);
    y1 = Math.max(y1, y);
  }
  return { x0, x1, y0, y1, w: x1 - x0, h: y1 - y0 };
};

const ends = (e: Edge): [Pt2, Pt2] => [e.pts[0], e.pts[e.pts.length - 1]];
const near = (a: Pt2, b: Pt2) => Math.hypot(a[0] - b[0], a[1] - b[1]) < 4;
/** Chord within `deg` of the drawing's vertical. */
const upright = (e: Edge, deg: number) => {
  const [a, b] = ends(e);
  return Math.atan2(Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1])) <= (deg * Math.PI) / 180;
};
const midX = (e: Edge) => e.pts.reduce((t, q) => t + q[0], 0) / Math.max(1, e.pts.length);

/** Near-level edge length (mm) running on from the rise's top end, darts (< 15 mm legs) skipped. */
function waistFrom(plain: readonly Edge[], rise: Edge, top: Pt2): number {
  let at = top;
  let prev = rise;
  let level = 0;
  for (let guard = 0; guard < 6; guard++) {
    const e = plain.find((x) => x !== prev && x !== rise && ends(x).some((q) => near(q, at)));
    if (!e) break;
    const [p, q] = ends(e);
    const far = near(p, at) ? q : p;
    if (e.lenMm < 15) {
      at = far;
      prev = e;
      continue;
    }
    const off = Math.atan2(Math.abs(q[1] - p[1]), Math.abs(q[0] - p[0]));
    if (off > Math.PI / 12 || e.chordMm / e.lenMm < 0.97) break;
    level += e.lenMm;
    at = far;
    prev = e;
  }
  return level;
}

function legPanelOf(g: PieceGeom): Omit<LegPanel, 'part'> | null {
  const b = box(g);
  if (b.h < 600 || b.w > 0.6 * b.h) return null;
  const plain = g.edges.filter((e) => e.kind === 'edge');
  let best: Omit<LegPanel, 'part'> | null = null;
  for (const c of plain) {
    // The crotch curve: concave, not straight, its upper end near the top of the piece.
    if (c.turnDeg > -60 || c.chordMm / c.lenMm > 0.99 || c.lenMm < 120) continue;
    const [p, q] = ends(c);
    const [top, low] = p[1] >= q[1] ? [p, q] : [q, p];
    if (top[1] < b.y1 - 0.25 * b.h || top[1] - low[1] < 0.5 * c.chordMm) continue;
    // The crotch point is the piece's widest point on its side.
    const side: -1 | 1 = low[0] - (b.x0 + b.x1) / 2 < 0 ? -1 : 1;
    if (Math.abs(low[0] - (side < 0 ? b.x0 : b.x1)) > 0.1 * b.w) continue;
    // Above the crotch curve: a level waist, at least 0.4 of the piece's width (a dart's short
    // legs on the way are stepped over). A shirt's armhole runs into a short slanted shoulder.
    if (waistFrom(plain, c, top) < 0.4 * b.w) continue;
    const inseam = plain.find(
      (e) =>
        e !== c &&
        ends(e).some((x) => near(x, low)) &&
        e.lenMm >= 0.4 * b.h &&
        e.chordMm / e.lenMm >= 0.95 &&
        upright(e, 25),
    );
    if (!inseam) continue;
    const outseam = plain
      .filter(
        (e) =>
          e !== c &&
          e !== inseam &&
          e.lenMm >= 0.6 * b.h &&
          e.chordMm / e.lenMm >= 0.95 &&
          upright(e, 25) &&
          Math.sign(midX(e) - (b.x0 + b.x1) / 2) === -side,
      )
      .reduce<Edge | undefined>((m, e) => (!m || e.lenMm > m.lenMm ? e : m), undefined);
    if (!outseam) continue;
    const cand = {
      piece: g,
      rise: c,
      inseam,
      outseam,
      crotchSide: side,
      reachMm: Math.abs(p[0] - q[0]),
    };
    if (!best || c.lenMm > best.rise.lenMm) best = cand;
  }
  return best;
}

/**
 * The trouser leg panels of a pattern, by piece key. Empty unless at least two panels are found
 * (one panel alone is a skirt's or a dress's tall piece as easily as a leg).
 */
export function legPanels(pieces: readonly PieceGeom[]): Map<string, LegPanel> {
  const found = pieces.map((g) => legPanelOf(g)).filter((x): x is Omit<LegPanel, 'part'> => !!x);
  const out = new Map<string, LegPanel>();
  if (found.length < 2) return out;
  // Front / back: the crotch extensions fall into two groups (front shallow, back deep).
  const reaches = found.map((x) => x.reachMm).sort((a, b) => a - b);
  let cut: number | null = null;
  for (let i = 1; i < reaches.length; i++)
    if (reaches[i] >= 1.5 * Math.max(1, reaches[i - 1])) {
      cut = (reaches[i] + reaches[i - 1]) / 2;
      break;
    }
  for (const x of found)
    out.set(x.piece.pieceKey, {
      ...x,
      part: cut === null ? null : x.reachMm > cut ? 'back' : 'front',
    });
  return out;
}

/**
 * Two leg panels of ONE leg (a front and a back): not mirror twins, crotch curves on opposite
 * sides of their drawings, and — when the crotch extensions tell — one front and one back.
 */
export function sameLeg(a: LegPanel, b: LegPanel): boolean {
  if (a.piece === b.piece) return false;
  if (a.piece.twinOf.some((t) => t.key === b.piece.pieceKey && t.kind === 'mirror')) return false;
  if (a.crotchSide === b.crotchSide) return false;
  if (a.part && b.part && a.part === b.part) return false;
  return true;
}

/** The left and the right panel of one part (the two fronts, the two backs): they meet at the rise. */
export function crotchPair(a: LegPanel, b: LegPanel): boolean {
  if (a.piece === b.piece || a.crotchSide === b.crotchSide) return false;
  const twins = a.piece.twinOf.some((t) => t.key === b.piece.pieceKey && t.kind === 'mirror');
  return twins || (!!a.part && a.part === b.part);
}
