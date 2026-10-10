// pieces/grade (H1) — the safety guard: graded contours nobody encoded.
//
// A sheet where every size is drawn with the same line looks, to F3, like ONE size with a lot of
// parallel lines: no size class carries a chain, F4 falls to 'single' and closes the outermost
// envelope around the seed — a plausible contour of no size at all (the stripped bench: robe 5/5,
// kombinezon 5/8, palto 4/7 wrong). The guard says when a seed's region holds ≥ 2 near-parallel
// contours of the SAME look that no size class covers: then the seed is graded and must either be
// ranked by gradeRanks or refused ('sizes-not-distinguished'), never closed as a single size.
//
// "The same look" is the line's APPEARANCE, not its style id: two adapters (or two layers) give the
// same black 0.3 mm solid line different ids. Width, colour and dash are compared within tolerance.
// Lines the legend made frames / grids / notches / seam / grain / internal lines are never evidence.
import type { Chain, ChainId, ChainRole, LineClass, Style } from 'lib/pattern-import/types';

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

/** Roles whose lines never count as size evidence (and never become graded walls). */
export const NOT_EVIDENCE: ReadonlySet<ChainRole> = new Set<ChainRole>(['ignore', 'notch']);
/**
 * Roles that are not outline lines when SOMEONE SAYS SO (the operator's legend, confidence 1):
 * F3's own 'internal' is also its bucket for lines it could not place — on a sheet whose sizes all
 * look alike that is every outline, so an unconfirmed 'internal' stays evidence (the solver's
 * acceptance checks still have to prove it).
 */
export const NOT_EVIDENCE_CONFIRMED: ReadonlySet<ChainRole> = new Set<ChainRole>([
  'seam',
  'grain',
  'internal',
]);

/** F3's own 'ignore' below this length is a FRAGMENT of a drawn line (lines cut at every crossing). */
export const FRAGMENT_MM = 8;

/**
 * Chains of the classes above. With `chains`, F3's automatic 'ignore' keeps its fragments
 * (< FRAGMENT_MM, not confirmed by the operator): where every crossing cuts the lines those are the
 * outline between two crossings, not a frame or a grid. Frames, grids, duplicates, the operator's
 * ignore — never.
 */
export function notEvidence(
  classes: readonly LineClass[],
  chains?: readonly Chain[],
): Set<ChainId> {
  const out = new Set<ChainId>();
  for (const c of classes) {
    const confirmed = c.confidence >= 0.9;
    if (NOT_EVIDENCE.has(c.role)) {
      for (const id of c.chains)
        if (
          !(
            c.role === 'ignore' &&
            !confirmed &&
            chains &&
            (chains[id]?.lengthMm ?? Infinity) < FRAGMENT_MM
          )
        )
          out.add(id);
    } else if (NOT_EVIDENCE_CONFIRMED.has(c.role) && confirmed)
      for (const id of c.chains) out.add(id);
  }
  return out;
}

/** Two lines look alike: colour (Σ|ΔRGB| ≤ 60), width (±0.1 mm or ×1.5), dash (both solid, or motifs within 0.5 mm). */
export type StyleMap = ReadonlyMap<number, Style>;

export function sameLook(a: Chain, b: Chain, styles?: StyleMap): boolean {
  if (a.style === b.style && !styles) return true;
  const sa = styles?.get(a.style);
  const sb = styles?.get(b.style);
  if (sa && sb) {
    const ca = sa.strokeRgb ?? [0, 0, 0];
    const cb = sb.strokeRgb ?? [0, 0, 0];
    if (Math.abs(ca[0] - cb[0]) + Math.abs(ca[1] - cb[1]) + Math.abs(ca[2] - cb[2]) > 60)
      return false;
    const wa = sa.widthMm || 0;
    const wb = sb.widthMm || 0;
    if (Math.abs(wa - wb) > 0.1 && Math.max(wa, wb) > 1.5 * Math.min(wa, wb)) return false;
    if (sa.fill !== sb.fill) return false;
  } else if (a.style !== b.style) return false;
  const ma = a.motif;
  const mb = b.motif;
  if (!ma || !mb) return !ma && !mb;
  if (ma.length !== mb.length) return false;
  return ma.every((x, i) => Math.abs(x - mb[i]) <= 0.5);
}

/** Evidence version of {@link detectUnencodedGrading}. */
export function gradingEvidence(
  chains: readonly Chain[],
  classes: readonly LineClass[],
  opts: Partial<GuardOpts> = {},
  styles?: StyleMap,
): GuardEvidence {
  const o = { ...GUARD_OPTS, ...opts };
  const covered = new Set<ChainId>([
    ...classes.filter((c) => c.role === 'size').flatMap((c) => c.chains),
    ...notEvidence(classes, chains),
  ]);
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
        if (!d || !sameLook(c, d, styles)) return;
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
  return {
    graded: share >= o.minShare && nested >= o.minLenMm,
    share,
    nestedMm: nested,
    totalMm: total,
  };
}

/**
 * True when ≥ 2 near-parallel, same-look contours sit in the region and no size class covers
 * them: the region is graded, but nothing on the sheet says which line is which size.
 */
export function detectUnencodedGrading(
  chains: readonly Chain[],
  classes: readonly LineClass[],
  opts: Partial<GuardOpts> = {},
  styles?: StyleMap,
): boolean {
  return gradingEvidence(chains, classes, opts, styles).graded;
}
