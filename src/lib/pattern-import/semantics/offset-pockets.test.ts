import { afterEach, describe, expect, it } from 'vitest';

import type { PtMm } from 'lib/pattern-import/types';

import { hullPocketBlocks, offsetAcrossFold, offsetContour, parallelDeviation } from './offset';

afterEach(() => {
  delete process.env.OFFSET_HULL_POCKETS;
});

const rect = (w: number, h: number): PtMm[] => [
  { x: 0, y: 0 },
  { x: w, y: 0 },
  { x: w, y: h },
  { x: 0, y: h },
];

describe('OFFSET_HULL_POCKETS', () => {
  it('lets a notch bay fill, and blocks it when the flag is off', () => {
    // mouth 3 mm, depth 28 mm. Allowance 10 mm fills it; 2·(10+0.2) = 20.4. The area is enough
    // to put the source under 0.99.
    const src: PtMm[] = [
      { x: 0, y: 0 },
      { x: 30, y: 0 },
      { x: 30, y: 28 },
      { x: 33, y: 28 },
      { x: 33, y: 0 },
      { x: 80, y: 0 },
      { x: 80, y: 60 },
      { x: 0, y: 60 },
    ];
    const off = offsetContour(src, 10);
    expect(off.report.ok).toBe(false);
    expect(off.report.reason ?? '').toMatch(/convex hull/);
    process.env.OFFSET_HULL_POCKETS = '1';
    const on = offsetContour(src, 10);
    expect(on.report.reason ?? '').not.toMatch(/convex hull/);
    expect(on.report.ok).toBe(true);
    expect(on.report.note ?? '').toMatch(/convex hull/);
  });

  it('refuses a bridged V wider than two allowances, which the lenient deviation check excuses', () => {
    // mouth 24 mm, depth 18 mm, allowance 10 mm. The mitre at the tip cuts the V and the lenient
    // deviation check reads that cut as a corner (0 mm). The pocket is still wider than two
    // allowances and the result never reaches its tip, so the pocket rule keeps the refusal.
    const d = 10;
    const src: PtMm[] = [
      { x: 0, y: 0 },
      { x: 140, y: 0 },
      { x: 140, y: 80 },
      { x: 82, y: 80 },
      { x: 70, y: 62 },
      { x: 58, y: 80 },
      { x: 0, y: 80 },
    ];
    const off = offsetContour(src, d);
    expect(off.report.ok).toBe(false);
    expect(off.report.reason ?? '').toMatch(/convex hull/);
    expect(parallelDeviation(off.pts, src, d, { lenient: true })).toBeLessThanOrEqual(0.2);
    expect(hullPocketBlocks(src, off.pts, d)).toBe(true);
    process.env.OFFSET_HULL_POCKETS = '1';
    const on = offsetContour(src, d);
    expect(on.report.ok).toBe(false);
    expect(on.report.reason ?? '').toMatch(/convex hull/);
  });

  it('fills a keyhole whose mouth is under two allowances', () => {
    const src: PtMm[] = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 60 },
      { x: 58, y: 60 },
      { x: 70, y: 85 },
      { x: 30, y: 85 },
      { x: 42, y: 60 },
      { x: 0, y: 60 },
    ];
    process.env.OFFSET_HULL_POCKETS = '1';
    const r = offsetContour(src, 10);
    expect(r.report.reason ?? '').not.toMatch(/convex hull/);
    expect(r.report.ok).toBe(true);
  });

  it('still refuses a bridged armhole', () => {
    const src: PtMm[] = [
      { x: 0, y: 0 },
      { x: 180, y: 0 },
      { x: 180, y: 200 },
      { x: 140, y: 200 },
      { x: 110, y: 150 },
      { x: 70, y: 150 },
      { x: 40, y: 200 },
      { x: 0, y: 200 },
    ];
    const bridged: PtMm[] = [
      { x: 0, y: 0 },
      { x: 180, y: 0 },
      { x: 180, y: 200 },
      { x: 0, y: 200 },
    ];
    expect(hullPocketBlocks(src, bridged, 10)).toBe(true);
  });

  it('still refuses a neck bridged along the fold', () => {
    const half: PtMm[] = [
      { x: 0, y: 0 },
      { x: 90, y: 0 },
      { x: 90, y: 220 },
      { x: 40, y: 220 },
      { x: 40, y: 180 },
      { x: 0, y: 180 },
    ];
    const fold = { a: { x: 0, y: 0 }, b: { x: 0, y: 200 } };
    process.env.OFFSET_HULL_POCKETS = '1';
    const r = offsetAcrossFold(half, 10, fold);
    expect(r.report.ok).toBe(false);
    expect(r.report.reason ?? '').toMatch(/convex hull|deviation/);
  });

  it('a 12 mm deviation still fails with the flag on or off', () => {
    const src = rect(100, 60);
    const shifted = src.map((p) => ({ x: p.x + 12, y: p.y }));
    expect(parallelDeviation(shifted, src, 10, { lenient: true })).toBeGreaterThan(0.2);
    expect(parallelDeviation(shifted, src, 10)).toBeGreaterThan(0.2);
    for (const on of [false, true]) {
      if (on) process.env.OFFSET_HULL_POCKETS = '1';
      else delete process.env.OFFSET_HULL_POCKETS;
      const r = offsetContour(src, 10);
      expect(r.report.maxDeviationMm).toBeLessThanOrEqual(0.2);
      expect(r.report.reason ?? '').not.toMatch(/deviation/);
    }
  });
});
