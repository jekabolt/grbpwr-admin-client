// pieces/grade (H1) — the safety guard: graded contours nobody encoded.
//
// A sheet where every size is drawn with the same line looks, to F3, like ONE size with a lot of
// parallel lines: no size class carries a chain, F4 falls to 'single' and closes the outermost
// envelope around the seed — a plausible contour of no size at all (the stripped bench: robe 5/5,
// kombinezon 5/8, palto 4/7 wrong). The guard says when a seed's region holds ≥ 2 near-parallel
// contours of the SAME look that no size class covers: then the seed is graded and must either be
// ranked by gradeRanks or refused ('sizes-not-distinguished'), never closed as a single size.
import type { Chain, ChainId, LineClass } from 'lib/pattern-import/types';

import { SegGrid } from '../geom';

import { resampleT } from './vec';

export type GuardOpts = {
  /** contours side by side (self included) that make a graded nest */
  minLanes: number;
  /** how far a neighbour may lie, mm */
  reachMm: number;
  /** min neighbour distance (closer = the same line drawn twice), mm */
  minGapMm: number;
  angleDeg: number;
  /** share of the region's line length that must sit in such a nest */
  minShare: number;
  /** and at least this much length, mm */
  minLenMm: number;
};

export const GUARD_OPTS: GuardOpts = {
  minLanes: 2,
  reachMm: 30,
  minGapMm: 1,
  angleDeg: 20,
  minShare: 0.2,
  minLenMm: 150,
};

export type GuardEvidence = { graded: boolean; share: number; nestedMm: number; totalMm: number };

/** Evidence version of {@link detectUnencodedGrading}. */
export function gradingEvidence(
  chains: readonly Chain[],
  classes: readonly LineClass[],
  opts: Partial<GuardOpts> = {},
): GuardEvidence {
  const o = { ...GUARD_OPTS, ...opts };
  const covered = new Set<ChainId>(classes.filter((c) => c.role === 'size').flatMap((c) => c.chains));
  const cand = chains.filter((c) => !covered.has(c.id) && c.lengthMm >= 10 && c.pts.length >= 2);
  const byId = new Map(cand.map((c) => [c.id, c]));
  const grid = new SegGrid(8);
  for (const c of cand) grid.addPolyline(c.id, c.pts, c.closed);
  const cosMin = Math.cos((o.angleDeg * Math.PI) / 180);
  let total = 0;
  let nested = 0;
  for (const c of cand) {
    for (const s of resampleT(c.pts, 4)) {
      total += 4;
      const nrm = { x: -s.t.y, y: s.t.x };
      const a = { x: s.p.x - nrm.x * o.reachMm, y: s.p.y - nrm.y * o.reachMm };
      const rx = 2 * nrm.x * o.reachMm;
      const ry = 2 * nrm.y * o.reachMm;
      const hits = new Set<ChainId>();
      const visit = (k: number, i: number) => {
        if (k === c.id || hits.has(k)) return;
        const d = byId.get(k);
        if (!d || d.style !== c.style) return;
        const p = d.pts[i];
        const q = d.pts[(i + 1) % d.pts.length];
        const sx = q.x - p.x;
        const sy = q.y - p.y;
        const den = rx * sy - ry * sx;
        if (Math.abs(den) < 1e-12) return;
        const qx = p.x - a.x;
        const qy = p.y - a.y;
        const tt = (qx * sy - qy * sx) / den;
        const uu = (qx * ry - qy * rx) / den;
        if (tt < 0 || tt > 1 || uu < 0 || uu > 1) return;
        const sl = Math.hypot(sx, sy) || 1;
        if (Math.abs((sx * s.t.x + sy * s.t.y) / sl) < cosMin) return;
        if (Math.abs((tt - 0.5) * 2 * o.reachMm) < o.minGapMm) return;
        hits.add(k);
      };
      const steps = Math.ceil((2 * o.reachMm) / grid.cell) + 1;
      for (let k = 0; k <= steps; k++)
        grid.near({ x: a.x + (rx * k) / steps, y: a.y + (ry * k) / steps }, grid.cell * 0.5, visit);
      if (hits.size + 1 >= o.minLanes) nested += 4;
    }
  }
  const share = total ? nested / total : 0;
  return { graded: share >= o.minShare && nested >= o.minLenMm, share, nestedMm: nested, totalMm: total };
}

/**
 * True when ≥ 2 near-parallel, same-look contours sit in the region and no size class covers
 * them: the region is graded, but nothing on the sheet says which line is which size.
 */
export function detectUnencodedGrading(
  chains: readonly Chain[],
  classes: readonly LineClass[],
  opts: Partial<GuardOpts> = {},
): boolean {
  return gradingEvidence(chains, classes, opts).graded;
}
