// True-contour clearance checks for the manual layout editor (Ф5). Dependency-free
// (types only) so the editor can import it without dragging clipper/dxf-parser anywhere;
// it still lives in the lazy nesting chunk with its callers.
//
// Cost model: checks run per DROP (not per drag frame) and only for bbox-prefiltered
// pairs. Worst realistic case — two 400-vertex contours — is ~160k segment-pair distance
// ops, well under a millisecond; a 60-piece marker prefilters to a handful of neighbours.
import type { Placement, PieceDTO, Pt, RotationDeg } from '../types';
import { bounds, rotatePt, type Bounds } from './polygon';

export type PlacedShape = {
  // Placement array index (identity for highlighting), NOT piece id — quantities repeat ids.
  index: number;
  poly: Pt[]; // true contour, strip frame (rotated + translated)
  b: Bounds;
};

export function placeContour(piece: PieceDTO, pl: Placement): Pt[] {
  return piece.poly.map((p) => {
    const r = rotatePt(p, pl.rot);
    return { x: r.x + pl.x, y: r.y + pl.y };
  });
}

export function rotatedBounds(piece: PieceDTO, rot: RotationDeg): Bounds {
  // Four rotations only — rotating the two bbox corners is NOT enough (min/max swap),
  // so rotate the actual contour; cached by callers where it matters.
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of piece.poly) {
    const r = rotatePt(p, rot);
    if (r.x < minX) minX = r.x;
    if (r.y < minY) minY = r.y;
    if (r.x > maxX) maxX = r.x;
    if (r.y > maxY) maxY = r.y;
  }
  return { minX, minY, maxX, maxY };
}

function ptSegDist2(p: Pt, a: Pt, b: Pt): number {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const ab2 = abx * abx + aby * aby;
  let t = ab2 <= 1e-18 ? 0 : ((p.x - a.x) * abx + (p.y - a.y) * aby) / ab2;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const dx = p.x - (a.x + t * abx);
  const dy = p.y - (a.y + t * aby);
  return dx * dx + dy * dy;
}

function orient(a: Pt, b: Pt, c: Pt): number {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}

function segsIntersect(a: Pt, b: Pt, c: Pt, d: Pt): boolean {
  const o1 = orient(a, b, c);
  const o2 = orient(a, b, d);
  const o3 = orient(c, d, a);
  const o4 = orient(c, d, b);
  if (((o1 > 0 && o2 < 0) || (o1 < 0 && o2 > 0)) && ((o3 > 0 && o4 < 0) || (o3 < 0 && o4 > 0)))
    return true;
  return false; // collinear touching is caught by the distance path (≈0)
}

function pointInPoly(pt: Pt, poly: readonly Pt[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if (a.y > pt.y !== b.y > pt.y) {
      const xCross = ((b.x - a.x) * (pt.y - a.y)) / (b.y - a.y) + a.x;
      if (pt.x < xCross) inside = !inside;
    }
  }
  return inside;
}

// Minimal boundary distance between two placed contours; 0 when they intersect or one
// contains the other (перехлёст). Callers bbox-prefilter, so no early-outs inside.
export function contourClearance(a: readonly Pt[], b: readonly Pt[]): number {
  // Containment: one representative point suffices once we know boundaries don't cross —
  // but crossing is checked in the same pass, so probe first (cheap vs the O(n·m) below).
  if (pointInPoly(a[0], b) || pointInPoly(b[0], a)) return 0;
  let min2 = Infinity;
  for (let i = 0; i < a.length; i++) {
    const a1 = a[i];
    const a2 = a[(i + 1) % a.length];
    for (let j = 0; j < b.length; j++) {
      const b1 = b[j];
      const b2 = b[(j + 1) % b.length];
      if (segsIntersect(a1, a2, b1, b2)) return 0;
      const d2 = Math.min(ptSegDist2(a1, b1, b2), ptSegDist2(b1, a1, a2));
      if (d2 < min2) min2 = d2;
    }
    // Endpoints of a alone under-sample long b edges; the symmetric pass above covers it.
  }
  return Math.sqrt(min2);
}

export type Violation = {
  index: number; // placement index
  otherIndex?: number; // undefined = strip edge / margin breach
  clearance: number; // cm; 0 = перехлёст
  required: number; // cm
};

// Full validation of a layout: pairwise clearances (bbox-prefiltered by gap) and the
// strip constraints (edge margins across, left margin along).
export function checkLayout(args: {
  pieces: readonly PieceDTO[];
  placements: readonly Placement[];
  widthCm: number;
  gapCm: number;
  marginCm: number;
}): Violation[] {
  const { pieces, placements, widthCm, gapCm, marginCm } = args;
  const byId = new Map(pieces.map((p) => [p.id, p]));
  const shapes: PlacedShape[] = [];
  placements.forEach((pl, index) => {
    const piece = byId.get(pl.pieceId);
    if (!piece) return;
    const poly = placeContour(piece, pl);
    shapes.push({ index, poly, b: bounds(poly) });
  });

  const out: Violation[] = [];
  const eps = 1e-6;
  for (const s of shapes) {
    // Strip constraints: selvedge margins across (y), left margin along (x). Right is open.
    const edge = Math.min(s.b.minY - marginCm, widthCm - marginCm - s.b.maxY, s.b.minX - marginCm);
    if (edge < -eps) {
      out.push({ index: s.index, clearance: Math.max(0, marginCm + edge), required: marginCm });
    }
  }
  for (let i = 0; i < shapes.length; i++) {
    for (let j = i + 1; j < shapes.length; j++) {
      const a = shapes[i];
      const b = shapes[j];
      // Inflate by the gap: bboxes further apart than the gap cannot violate it.
      if (
        a.b.minX > b.b.maxX + gapCm + eps ||
        b.b.minX > a.b.maxX + gapCm + eps ||
        a.b.minY > b.b.maxY + gapCm + eps ||
        b.b.minY > a.b.maxY + gapCm + eps
      )
        continue;
      const c = contourClearance(a.poly, b.poly);
      if (c < gapCm - eps) {
        out.push({ index: a.index, otherIndex: b.index, clearance: c, required: gapCm });
      }
    }
  }
  return out;
}

// Length/efficiency of a (possibly hand-edited) layout, from true contours. Mirrors the
// engine's accounting closely enough for manual state: used length = right-most contour
// point + the same margin the layout keeps on the left.
export function measureLayout(args: {
  pieces: readonly PieceDTO[];
  placements: readonly Placement[];
  widthCm: number;
  marginCm: number;
}): { usedLengthCm: number; efficiency: number } {
  const { pieces, placements, widthCm, marginCm } = args;
  const byId = new Map(pieces.map((p) => [p.id, p]));
  let maxX = 0;
  let areaSum = 0;
  for (const pl of placements) {
    const piece = byId.get(pl.pieceId);
    if (!piece) continue;
    const rb = rotatedBounds(piece, pl.rot);
    if (pl.x + rb.maxX > maxX) maxX = pl.x + rb.maxX;
    areaSum += piece.areaCm2;
  }
  const usedLengthCm = maxX > 0 ? maxX + marginCm : 0;
  const efficiency = usedLengthCm > 0 && widthCm > 0 ? areaSum / (widthCm * usedLengthCm) : 0;
  return { usedLengthCm, efficiency };
}
