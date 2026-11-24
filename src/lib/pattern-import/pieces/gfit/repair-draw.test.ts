import { describe, expect, it } from 'vitest';

import type { PtMm } from 'lib/pattern-import/types';

import { GFIT_TOL_PDF } from './fit';
import { repairSize, type GfitWall } from './repair';

// A pentagon-ish bodice graded linearly: rank r widens by 6 mm and lengthens by 8 mm per step.
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
/** The ring densified at 1 mm (the outlines the fill hands the repair are dense). */
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
const anchors = [0, 1, 3, 4].map((rank) => ({ rank, outer: ring(rank), anchor: true }));
/** Rank 2's line with the bottom edge missing between x = 30 and x = 30 + gap (open wall). */
const wallsWithGap = (gap: number): GfitWall[] => {
  const r = ring(2);
  const h = 300 + 16;
  const inGap = (p: PtMm) => Math.abs(p.y - h) < 1e-6 && p.x > 30 && p.x < 30 + gap;
  // rotate so the gap is the seam of the open polyline
  const k = r.findIndex((p, i) => inGap(p) && !inGap(r[(i + r.length - 1) % r.length]));
  const rot = [...r.slice(k), ...r.slice(0, k)].filter((p) => !inGap(p));
  return [{ pts: rot, kind: 'own' }];
};

describe('repairSize draw mode', () => {
  const opts = { tol: GFIT_TOL_PDF, frame: 'stacked' as const };

  it('strict refuses a 40 mm hole; draw accepts it within the share', () => {
    const ws = wallsWithGap(40);
    const strict = repairSize(anchors, 2, ws, opts);
    expect(strict.ok).toBe(false);
    expect(strict.refusals).toContain('E2-hole');
    const drawn = repairSize(anchors, 2, ws, { ...opts, draw: { maxShare: 0.15 } });
    expect(drawn.refusals).toEqual([]);
    expect(drawn.ok).toBe(true);
    expect(drawn.holes).toHaveLength(1);
    expect(drawn.holes[0].lenMm).toBeGreaterThan(35);
  });

  it('refuses more than the share', () => {
    // the bottom edge from x = 30 to its corner: ~86 mm of a ~1100 mm perimeter (~8 %)
    const drawn = repairSize(anchors, 2, wallsWithGap(180), { ...opts, draw: { maxShare: 0.05 } });
    expect(drawn.ok).toBe(false);
    expect(drawn.refusals).toContain('D-share');
    // D-share is the cover bound in draw mode: no second, repeated cover refusal
    expect(drawn.refusals).not.toContain('E1-cover');
  });

  it('refuses a stretch that would cut through a drawn line of the size', () => {
    const h = 300 + 16;
    const cross: GfitWall = {
      pts: [
        { x: 50, y: h - 20 },
        { x: 50, y: h + 20 },
      ],
      // a common line (E4 audits only own walls): the prediction meets it across
      kind: 'common',
    };
    const drawn = repairSize(anchors, 2, [...wallsWithGap(40), cross], {
      ...opts,
      draw: { maxShare: 0.15 },
    });
    expect(drawn.ok).toBe(false);
    expect(drawn.refusals).toContain('D-cross');
  });

  it('a crossing line that turns along the prediction further on is still across (peer review)', () => {
    const h = 300 + 16;
    // across the hole at x = 50, then 20 mm past it parallel to the bottom edge
    const cross: GfitWall = {
      pts: [
        { x: 50, y: h - 20 },
        { x: 50, y: h + 20 },
        { x: 150, y: h + 20 },
      ],
      kind: 'common',
    };
    const drawn = repairSize(anchors, 2, [...wallsWithGap(40), cross], {
      ...opts,
      draw: { maxShare: 0.15 },
    });
    expect(drawn.ok).toBe(false);
    expect(drawn.refusals).toContain('D-cross');
  });

  it('draws on through a notch tick in the hole (a short line across the cut line)', () => {
    const h = 300 + 16;
    const tick: GfitWall = {
      pts: [
        { x: 50, y: h - 4 },
        { x: 50, y: h + 4 },
      ],
      kind: 'common',
    };
    const drawn = repairSize(anchors, 2, [...wallsWithGap(40), tick], {
      ...opts,
      draw: { maxShare: 0.15 },
    });
    expect(drawn.refusals).toEqual([]);
    expect(drawn.ok).toBe(true);
  });

  it('never draws an extreme size', () => {
    const r = repairSize(
      anchors.filter((a) => a.rank !== 4),
      4,
      [{ pts: ring(4), kind: 'own', closed: true }],
      { ...opts, draw: { maxShare: 0.15 } },
    );
    expect(r.refusals).toContain('not-bracketed');
  });
});
