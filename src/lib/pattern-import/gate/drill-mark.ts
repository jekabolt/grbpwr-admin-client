// A drill / button mark on layer 8 as the writer draws it (write/r2000.ts drillMark): CLO's 10 mm
// square for a drill hole, or a button's circle — a closed DRILL_CIRCLE_SEGMENTS-gon whose vertices
// all lie one radius from its centre (a CLO button is ONE circle of its own diameter, Ø10 / Ø15,
// its centre graded, its radius constant). Shared by G5 (checks.ts) and the SHAPE gate (shape.ts):
// a mark the gate does not recognise is counted as an internal line, and a button would then be
// "drills 0 ≠ source 7" on every block that has one.

import type { PtMm } from '../types';
import { bboxOf, dist } from '../write/geom';
import { DRILL_CIRCLE_SEGMENTS, DRILL_SQUARE_MM } from '../write/plan';

/** Written coordinates are read back through the DXF text; this covers their rounding. */
const MARK_TOL_MM = 0.05;

export type DrillMark = { form: 'square' | 'circle'; sizeMm: number; at: PtMm };

/** The mark this closed polyline is, or null when it is not one (an internal line). */
export function drillMarkOf(e: { closed?: boolean; pts: PtMm[] }): DrillMark | null {
  if (!e.closed) return null;
  const n = e.pts.length;
  if (n !== 4 && n !== DRILL_CIRCLE_SEGMENTS) return null;
  const b = bboxOf(e.pts);
  const w = b.maxX - b.minX;
  const h = b.maxY - b.minY;
  const at = { x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 };
  if (n === 4)
    return Math.abs(w - DRILL_SQUARE_MM) <= MARK_TOL_MM &&
      Math.abs(h - DRILL_SQUARE_MM) <= MARK_TOL_MM
      ? { form: 'square', sizeMm: DRILL_SQUARE_MM, at }
      : null;
  if (!(w > 0) || Math.abs(w - h) > MARK_TOL_MM) return null;
  const r = w / 2;
  return e.pts.every((p) => Math.abs(dist(p, at) - r) <= MARK_TOL_MM)
    ? { form: 'circle', sizeMm: w, at }
    : null;
}

/** What the source's drill feature is written as (write/plan.ts: a circle keeps its diameter). */
export function drillMarkKey(d: { form?: 'square' | 'circle' | 'point'; sizeMm?: number }): string {
  return d.form === 'circle' && d.sizeMm
    ? `circle Ø${d.sizeMm.toFixed(1)}`
    : `square ${DRILL_SQUARE_MM.toFixed(1)}`;
}

export const drillMarkKeyOf = (m: DrillMark): string =>
  m.form === 'circle' ? `circle Ø${m.sizeMm.toFixed(1)}` : `square ${m.sizeMm.toFixed(1)}`;
