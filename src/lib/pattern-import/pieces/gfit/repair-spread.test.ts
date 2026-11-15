import { describe, expect, it } from 'vitest';

import type { PtMm } from 'lib/pattern-import/types';

import { GFIT_TOL_PDF } from './fit';
import { repairSize, type GfitWall } from './repair';

// A graded bodice (6 mm wider, 8 mm longer per step). `bend` moves the bottom corner of one size
// sideways: the grade is no longer a straight line there, and pairs of anchors disagree about it.
const corners = (r: number, bend = 0): PtMm[] => {
  const w = 200 + 6 * r;
  const h = 300 + 8 * r;
  return [
    { x: 0, y: 0 },
    { x: w, y: 0 },
    { x: w, y: h * 0.7 },
    { x: w * 0.55 + bend, y: h },
    { x: 0, y: h },
  ];
};
const ring = (c: PtMm[]): PtMm[] => {
  const out: PtMm[] = [];
  for (let i = 0; i < c.length; i++) {
    const a = c[i];
    const b = c[(i + 1) % c.length];
    const m = Math.ceil(Math.hypot(b.x - a.x, b.y - a.y));
    for (let j = 0; j < m; j++)
      out.push({ x: a.x + ((b.x - a.x) * j) / m, y: a.y + ((b.y - a.y) * j) / m });
  }
  return out;
};
/** Size r's line with the stretch around its bottom corner (± `R` mm) missing. */
const wallsAroundCorner = (r: number, R: number): GfitWall[] => {
  const c = corners(r)[3];
  const pts = ring(corners(r));
  const gone = (p: PtMm) => Math.hypot(p.x - c.x, p.y - c.y) < R;
  const k = pts.findIndex((p, i) => gone(p) && !gone(pts[(i + pts.length - 1) % pts.length]));
  return [{ pts: [...pts.slice(k), ...pts.slice(0, k)].filter((p) => !gone(p)), kind: 'own' }];
};
const opts = { tol: GFIT_TOL_PDF, frame: 'stacked' as const, draw: { maxShare: 0.15 } };

describe('repairSize draw mode: spread of a drawn stretch across anchor pairs', () => {
  // the floor is sampling: ~0.24 mm at this sharp corner (prediction samples vs the ring's 1 mm
  // vertices); bend 3 → 0.4, 6 → 0.74; from bend 9 the robust fit drops size 1 itself
  it('stays at the sampling floor when the grade is linear', () => {
    const anchors = [1, 2, 4, 5].map((rank) => ({
      rank,
      outer: ring(corners(rank)),
      anchor: true,
    }));
    const r = repairSize(anchors, 3, wallsAroundCorner(3, 12), opts);
    expect(r.refusals).toEqual([]);
    expect(r.spreadMm).toBeDefined();
    expect(r.spreadMm!).toBeLessThan(0.3);
  });

  it('shows the mm when an outer anchor bends the grade at the hole', () => {
    // size 1's corner 6 mm off the line: pair (1, 4) puts size 3's corner 2 mm along from (2, 4)'s
    const anchors = [1, 2, 4, 5].map((rank) => ({
      rank,
      outer: ring(corners(rank, rank === 1 ? 6 : 0)),
      anchor: true,
    }));
    const r = repairSize(anchors, 3, wallsAroundCorner(3, 12), opts);
    expect(r.trusted).toContain(1);
    expect(r.spreadMm!).toBeGreaterThan(0.6);
  });

  it('is absent without a second pair', () => {
    const anchors = [2, 4].map((rank) => ({ rank, outer: ring(corners(rank)), anchor: true }));
    const r = repairSize(anchors, 3, wallsAroundCorner(3, 12), opts);
    expect(r.spreadMm).toBeUndefined();
  });
});
