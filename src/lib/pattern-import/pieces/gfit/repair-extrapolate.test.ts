import { describe, expect, it } from 'vitest';

import type { PtMm } from 'lib/pattern-import/types';

import { GFIT_TOL_PDF } from './fit';
import { repairSize, type GfitWall } from './repair';

// The bodice of repair-draw.test.ts: rank r widens by 6 mm and lengthens by 8 mm per step.
const corners = (r: number): PtMm[] => {
  const w = 200 + 6 * r;
  const h = 300 + 8 * r;
  return [
    { x: 0, y: 0 },
    { x: w, y: 0 },
    { x: w, y: h * 0.7 },
    { x: w * 0.55, y: h },
    { x: 0, y: h },
  ];
};
const ring = (r: number): PtMm[] => {
  const c = corners(r);
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
const anchors = [1, 2, 3, 4].map((rank) => ({ rank, outer: ring(rank), anchor: true }));
/** Rank `r`'s line with the bottom edge missing between x = 30 and x = 30 + gap. */
const wallsWithGap = (r: number, gap: number): GfitWall[] => {
  const pts = ring(r);
  const h = 300 + 8 * r;
  const inGap = (p: PtMm) => Math.abs(p.y - h) < 1e-6 && p.x > 30 && p.x < 30 + gap;
  const k = pts.findIndex((p, i) => inGap(p) && !inGap(pts[(i + pts.length - 1) % pts.length]));
  return [{ pts: [...pts.slice(k), ...pts.slice(0, k)].filter((p) => !inGap(p)), kind: 'own' }];
};

describe('repairSize draw mode: an edge size (extrapolation)', () => {
  const opts = { tol: GFIT_TOL_PDF, frame: 'stacked' as const };
  const draw = { maxShare: 0.15, extrapolate: true };

  it('draws a short hole one step past the largest trusted size, marked extrapolated', () => {
    const r = repairSize(anchors, 5, wallsWithGap(5, 30), { ...opts, draw });
    expect(r.refusals).toEqual([]);
    expect(r.ok).toBe(true);
    expect(r.extrapolated).toBe(true);
    expect(r.holes).toHaveLength(1);
  });

  it('and one step below the smallest', () => {
    const r = repairSize(anchors, 0, wallsWithGap(0, 30), { ...opts, draw });
    expect(r.refusals).toEqual([]);
    expect(r.extrapolated).toBe(true);
  });

  it('refuses a hole longer than 40 mm past the edge (X-hole)', () => {
    const r = repairSize(anchors, 5, wallsWithGap(5, 60), { ...opts, draw });
    expect(r.ok).toBe(false);
    expect(r.refusals).toContain('X-hole');
  });

  it('never two steps past the edge', () => {
    const r = repairSize(anchors, 6, wallsWithGap(6, 30), { ...opts, draw });
    expect(r.refusals).toContain('not-bracketed');
  });

  it('needs three trusted sizes', () => {
    const two = anchors.filter((a) => a.rank >= 3);
    const r = repairSize(two, 5, wallsWithGap(5, 30), { ...opts, draw });
    expect(r.refusals).toContain('not-bracketed');
  });

  it('is off without the switch', () => {
    const r = repairSize(anchors, 5, wallsWithGap(5, 30), { ...opts, draw: { maxShare: 0.15 } });
    expect(r.refusals).toContain('not-bracketed');
    expect(r.extrapolated).toBeFalsy();
  });
});
