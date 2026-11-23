// DRAFT (scratch; run with the scratch vitest config). Target: pieces/gfit/repair-draw.test.ts (same scene).
//
// D-cross-nest (proposed): in draw mode a filled (derived) stretch must not properly cross the outline
// of an adjacent bracketing anchor (oLo / oHi) at >= 20 deg, farther than 2 mm from the fill's own
// ends. canonTopology([oLo, o, oHi]) (E3-topology) checks only that strong corners survive in ring
// order; it never tests whether the rings cross.
//
// Scene: the repair-draw bodice (rank r widens 6 mm, lengthens 3 mm per step), anchors 0,1,3,4,
// target rank 2 with a 40 mm gap in the bottom edge (hole x = 30..70 at y = 306). The anchor ring of
// rank 1 gets a BUMP on its bottom edge (an outward excursion, like a notch tick drawn on one size
// only): the rank-2 prediction does not follow it (it is graded from 1 and 3 as notch-free corners),
// so the fill runs straight and crosses the bump flanks. Bump width/height set the crossing angle.
import { describe, expect, it } from 'vitest';

import { GFIT_TOL_PDF } from './fit';
import { repairSize, type GfitWall } from './repair';
import type { PtMm } from 'lib/pattern-import/types';

/** length step per rank: small, so a notch-sized bump (<= 8 mm) of rank 1 can reach the rank-2 line */
const HSTEP = 3;
const corners = (r: number): PtMm[] => {
  const w = 200 + 6 * r;
  const h = 300 + HSTEP * r;
  return [
    { x: 0, y: 0 },
    { x: w, y: 0 },
    { x: w, y: h * 0.7 },
    { x: w * 0.55, y: h },
    { x: 0, y: h },
  ];
};
const ring = (r: number, bump?: { x: number; half: number; height: number }): PtMm[] => {
  const c = corners(r);
  const h = 300 + HSTEP * r;
  const out: PtMm[] = [];
  for (let i = 0; i < c.length; i++) {
    const a = c[i];
    const b = c[(i + 1) % c.length];
    const m = Math.ceil(Math.hypot(b.x - a.x, b.y - a.y));
    for (let j = 0; j < m; j++) {
      const p = { x: a.x + ((b.x - a.x) * j) / m, y: a.y + ((b.y - a.y) * j) / m };
      // the bottom edge (y = h, going from x = 0.55 w down to 0): a triangular bump, outward = +y
      if (bump && Math.abs(p.y - h) < 1e-6) {
        const d = Math.abs(p.x - bump.x);
        if (d < bump.half) p.y += bump.height * (1 - d / bump.half);
      }
      out.push(p);
    }
  }
  return out;
};
const sceneAnchors = (bump?: { x: number; half: number; height: number }) =>
  [0, 1, 3, 4].map((rank) => ({
    rank,
    outer: rank === 1 ? ring(1, bump) : ring(rank),
    anchor: true,
  }));
const wallsWithGap = (gap: number): GfitWall[] => {
  const r = ring(2);
  const h = 300 + 2 * HSTEP;
  const inGap = (p: PtMm) => Math.abs(p.y - h) < 1e-6 && p.x > 30 && p.x < 30 + gap;
  const k = r.findIndex((p, i) => inGap(p) && !inGap(r[(i + r.length - 1) % r.length]));
  const rot = [...r.slice(k), ...r.slice(0, k)].filter((p) => !inGap(p));
  return [{ pts: rot, kind: 'own' }];
};
const opts = { tol: GFIT_TOL_PDF, frame: 'stacked' as const, draw: { maxShare: 0.15 } };

// ── geometry helpers for the PREMISE of each case (independent of the repair code) ──────────────
const seg = (a: PtMm, b: PtMm, c: PtMm, d: PtMm) => {
  const r = { x: b.x - a.x, y: b.y - a.y };
  const s = { x: d.x - c.x, y: d.y - c.y };
  const den = r.x * s.y - r.y * s.x;
  if (Math.abs(den) < 1e-9) return null;
  const t = ((c.x - a.x) * s.y - (c.y - a.y) * s.x) / den;
  const u = ((c.x - a.x) * r.y - (c.y - a.y) * r.x) / den;
  if (!(t > 0 && t < 1 && u > 0 && u < 1)) return null;
  const ang =
    (Math.acos(
      Math.min(1, Math.abs(r.x * s.x + r.y * s.y) / (Math.hypot(r.x, r.y) * Math.hypot(s.x, s.y))),
    ) *
      180) /
    Math.PI;
  return { at: { x: a.x + t * r.x, y: a.y + t * r.y }, ang };
};
/** proper crossings of a polyline with a closed ring: where, how far from the ends, at what angle */
function crossings(fill: PtMm[], ringPts: PtMm[]) {
  const a0 = fill[0];
  const a1 = fill[fill.length - 1];
  const out: { fromEnd: number; ang: number }[] = [];
  for (let i = 0; i + 1 < fill.length; i++)
    for (let k = 0; k < ringPts.length; k++) {
      const x = seg(fill[i], fill[i + 1], ringPts[k], ringPts[(k + 1) % ringPts.length]);
      if (x)
        out.push({
          fromEnd: Math.min(
            Math.hypot(x.at.x - a0.x, x.at.y - a0.y),
            Math.hypot(x.at.x - a1.x, x.at.y - a1.y),
          ),
          ang: x.ang,
        });
    }
  return out;
}
const run = (bump: { x: number; half: number; height: number }) => {
  const anchors = sceneAnchors(bump);
  const r = repairSize(anchors, 2, wallsWithGap(40), opts);
  const lo = anchors.find((a) => a.rank === 1)!.outer;
  const fill = r.holes.flatMap((h) => h.pts);
  return {
    r,
    lo,
    fills: r.holes.map((h) => h.pts),
    cross: r.holes.flatMap((h) => crossings(h.pts, lo)),
    fill,
  };
};

describe('draw mode · D-cross-nest (fill vs the oLo outline)', () => {
  it('PREMISE a: a bump of rank 1 pokes through the rank-2 line, flanks ~40 deg', () => {
    // rank 2 bottom edge is y = 306, rank 1 is y = 303: a 5 mm bump reaches y = 308
    const { r, cross } = run({ x: 50, half: 6, height: 5 });
    console.log(
      'a: ok',
      r.ok,
      r.refusals.join(','),
      'crossings',
      JSON.stringify(cross.map((c) => [c.fromEnd.toFixed(1), c.ang.toFixed(0)])),
    );
    expect(r.holes.length).toBeGreaterThan(0);
  });

  it('(a) a fill that crosses the oLo outline at ~40 deg, > 2 mm from its ends, is refused', () => {
    const { r, cross } = run({ x: 50, half: 6, height: 5 });
    // the premise: the repair accepted a fill that really crosses transversally in the interior
    expect(cross.some((c) => c.ang >= 20 && c.fromEnd > 2)).toBe(true);
    expect(r.ok).toBe(false);
    expect(r.refusals).toContain('D-cross-nest');
  });

  it('(b) a fill that meets the oLo outline at < 20 deg is accepted', () => {
    // 5 mm high over a 25 mm half-width: the flank is ~11 deg (crossings measured 10 and 6 deg)
    const { r, cross } = run({ x: 50, half: 25, height: 5 });
    console.log(
      'b: ok',
      r.ok,
      r.refusals.join(','),
      'crossings',
      JSON.stringify(cross.map((c) => [c.fromEnd.toFixed(1), c.ang.toFixed(0)])),
    );
    // the premise: the fill DOES cross the outline, but only at a shallow angle
    expect(cross.length).toBeGreaterThan(0);
    expect(cross.every((c) => c.ang < 20)).toBe(true);
    expect(r.ok).toBe(true);
    expect(r.refusals).not.toContain('D-cross-nest');
  });

  it('(c) a crossing within 2 mm of a fill end (the join point) is accepted', () => {
    // bump centred left of the hole so only its right flank crosses the fill, ~1 mm from its start (x = 30)
    const { r, cross } = run({ x: 28.6, half: 6, height: 5 });
    console.log(
      'c: ok',
      r.ok,
      r.refusals.join(','),
      'crossings',
      JSON.stringify(cross.map((c) => [c.fromEnd.toFixed(1), c.ang.toFixed(0)])),
    );
    // the premise: it crosses transversally, but only within 2 mm of the fill's end
    expect(cross.length).toBeGreaterThan(0);
    expect(cross.every((c) => c.fromEnd <= 2)).toBe(true);
    expect(r.ok).toBe(true);
    expect(r.refusals).not.toContain('D-cross-nest');
  });
});
