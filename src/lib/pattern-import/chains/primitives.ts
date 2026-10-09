// chains/ (F3) — what one IR path contributes to line work.
//
// The sources draw a size line in very different ways (02-DESIGN §6, measured on the corpus):
//  - one stroked path per line, dash declared (reef, robe, kombinezon) — a plain stroke;
//  - one path per line whose SUBPATHS are the dashes/dots (palto, zhaket) — strokes and beads of
//    one operation, linked in order;
//  - every dash its own path (viola), sometimes a FILLED thin rectangle instead of a stroke, a
//    thin backbone with "////" ticks, or a line with little rings — strokes, fill-dashes, beads.
// This module only names the element; linking lives in build.ts.
import type { IRPath, PathId, PtMm, StyleId, Style } from 'lib/pattern-import/types';

import { bboxOf, polyLen } from './geom';

export type ItemKind = 'stroke' | 'fill-dash' | 'bead';
export type BeadKind = 'tick' | 'ring' | 'dot';

export type Item = {
  kind: ItemKind;
  path: PathId;
  /** Geometry as drawn (fill-dash: its 2-point centre line). */
  pts: PtMm[];
  /** Source edge count (for PathRange.to). */
  edges: number;
  len: number;
  style: StyleId;
  /** Beads: centre, kind and (ticks) direction. */
  c?: PtMm;
  bead?: BeadKind;
  /** Rings: diameter (reef draws two sizes as zigzags with small vs large rings). */
  size?: number;
  dir?: PtMm | null;
  /** Other items folded into this one (a tiny mark of several strokes acting as one bead). */
  extra?: Item[];
  /** Operation key `file|page|op` and subpath index. */
  op: string;
  sub: number;
};

/** Longest extent / thinnest extent of a point set along its principal axes. */
function principal(pts: PtMm[]) {
  let cx = 0;
  let cy = 0;
  for (const p of pts) {
    cx += p.x;
    cy += p.y;
  }
  cx /= pts.length;
  cy /= pts.length;
  let sxx = 0;
  let syy = 0;
  let sxy = 0;
  for (const p of pts) {
    const dx = p.x - cx;
    const dy = p.y - cy;
    sxx += dx * dx;
    syy += dy * dy;
    sxy += dx * dy;
  }
  const ang = 0.5 * Math.atan2(2 * sxy, sxx - syy);
  const ux = Math.cos(ang);
  const uy = Math.sin(ang);
  let a0 = Infinity;
  let a1 = -Infinity;
  let b0 = Infinity;
  let b1 = -Infinity;
  for (const p of pts) {
    const dx = p.x - cx;
    const dy = p.y - cy;
    const a = dx * ux + dy * uy;
    const b = -dx * uy + dy * ux;
    if (a < a0) a0 = a;
    if (a > a1) a1 = a;
    if (b < b0) b0 = b;
    if (b > b1) b1 = b;
  }
  return { c: { x: cx, y: cy }, u: { x: ux, y: uy }, major: a1 - a0, minor: b1 - b0, a0, a1, b0, b1 };
}

export const ITEM = {
  /** A stroke this short is a bead (dot, tick, tiny ring), not a dash. */
  beadMaxMm: 1.0,
  /** A closed stroke this small is a ring (viola's beaded lines). */
  ringMaxMm: 2.6,
  /** Filled shapes thinner than this and longer than fillDashMinMm are dashes drawn as outlines. */
  fillDashMaxWidthMm: 1.0,
  fillDashMinMm: 0.8,
  fillDotMaxMm: 1.3,
};

/** Classify one IR path. null = not line work (letters, logos, page fills). */
export function itemOf(p: IRPath, style: Style): Item | null {
  if (p.pts.length < 2) return null;
  const op = `${p.src.file}|${p.src.page}|${p.src.op}`;
  const edges = p.closed ? p.pts.length : p.pts.length - 1;
  const strokeOnly = !style.fill || style.widthMm > 0;
  if (style.fill && style.widthMm === 0) {
    // Fill-only: a thin elongated shape is a dash drawn as an outline; a small blob is a dot.
    if (!p.closed && p.pts.length < 3) return null;
    const pr = principal(p.pts);
    if (pr.major <= ITEM.fillDotMaxMm && pr.minor <= ITEM.fillDotMaxMm)
      return { kind: 'bead', bead: 'dot', path: p.id, pts: p.pts, edges, len: 0, style: style.id, c: pr.c, dir: null, op, sub: p.src.sub };
    if (pr.minor <= ITEM.fillDashMaxWidthMm && pr.major >= ITEM.fillDashMinMm && pr.major >= 2.5 * pr.minor) {
      const a = { x: pr.c.x + pr.u.x * pr.a0, y: pr.c.y + pr.u.y * pr.a0 };
      const b = { x: pr.c.x + pr.u.x * pr.a1, y: pr.c.y + pr.u.y * pr.a1 };
      return { kind: 'fill-dash', path: p.id, pts: [a, b], edges, len: pr.major, style: style.id, op, sub: p.src.sub };
    }
    return null;
  }
  if (!strokeOnly) return null;
  const len = polyLen(p.pts, p.closed);
  const bb = bboxOf(p.pts);
  const diag = Math.hypot(bb.maxX - bb.minX, bb.maxY - bb.minY);
  if (p.closed && diag <= ITEM.ringMaxMm) {
    const pr = principal(p.pts);
    return { kind: 'bead', bead: 'ring', size: diag, path: p.id, pts: p.pts, edges, len, style: style.id, c: pr.c, dir: null, op, sub: p.src.sub };
  }
  if (len <= ITEM.beadMaxMm) {
    const a = p.pts[0];
    const b = p.pts[p.pts.length - 1];
    const L = Math.hypot(b.x - a.x, b.y - a.y);
    return {
      kind: 'bead',
      bead: L > 0.05 ? 'tick' : 'dot',
      path: p.id,
      pts: p.pts,
      edges,
      len,
      style: style.id,
      c: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
      dir: L > 0.05 ? { x: (b.x - a.x) / L, y: (b.y - a.y) / L } : null,
      op,
      sub: p.src.sub,
    };
  }
  return { kind: 'stroke', path: p.id, pts: p.closed ? [...p.pts, p.pts[0]] : p.pts, edges, len, style: style.id, op, sub: p.src.sub };
}
