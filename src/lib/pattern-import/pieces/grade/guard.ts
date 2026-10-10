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
import type { Chain, ChainId, ChainRole, LineClass, PtMm, Style } from 'lib/pattern-import/types';

import { SegGrid } from '../geom';

import { bboxOfPts, resampleT } from './vec';

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
  /**
   * A neighbour that runs at a UNIFORM distance (spread ≤ max(1 mm, 10 % of the median), median
   * 2–20 mm) all along the line is its sew line drawn alike, not another size: not a lane.
   */
  skipUniformPairs: boolean;
  /** neighbours of any look are lanes (the solver's band count does not look at the line) */
  anyLook: boolean;
  /** lines shorter than this are no lane (lettering, symbols and arrows drawn as strokes), mm */
  minChainMm: number;
};

export const GUARD_OPTS: GuardOpts = {
  minLanes: 2,
  reachMm: 30,
  minGapMm: 1,
  angleDeg: 20,
  minShare: 0.2,
  minLenMm: 150,
  skipUniformPairs: false,
  anyLook: false,
  minChainMm: 10,
};

/** Uniform pair (an allowance): median distance range and spread, mm / share of the median. */
/**
 * Uniform pair (a sew / cut line drawn alike at one allowance): median distance 2–20 mm, standard
 * deviation ≤ 0.5 mm, measured along ≥ 80 % of the shorter line. Grading is never uniform all
 * round (widths grow faster than lengths), so a pair measured that way is the allowance signature.
 */
export const ALLOWANCE_PAIR = { minMm: 2, maxMm: 20, stdMm: 0.5, coverage: 0.8 };

/** The allowance test on one directed list of offsets (mm) sampled every 4 mm along a line. */
export function isAllowancePair(offsets: readonly number[], shorterMm: number): boolean {
  const P = ALLOWANCE_PAIR;
  if (offsets.length < 3 || offsets.length * 4 < P.coverage * shorterMm) return false;
  const q = [...offsets].sort((x, y) => x - y);
  const med = q[q.length >> 1];
  if (med < P.minMm || med > P.maxMm) return false;
  const mean = q.reduce((a, b) => a + b, 0) / q.length;
  const sd = Math.sqrt(q.reduce((a, b) => a + (b - mean) ** 2, 0) / q.length);
  return sd <= P.stdMm;
}

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
 * ignore — never. `chains` may be any subset of the set (looked up by id, not by position); a chain
 * it does not hold is not a fragment.
 */
export function notEvidence(
  classes: readonly LineClass[],
  chains?: readonly Chain[],
): Set<ChainId> {
  const out = new Set<ChainId>();
  const byId = chains ? new Map(chains.map((c) => [c.id, c])) : null;
  for (const c of classes) {
    const confirmed = c.confidence >= 0.9;
    if (NOT_EVIDENCE.has(c.role)) {
      for (const id of c.chains)
        if (
          !(
            c.role === 'ignore' &&
            !confirmed &&
            byId &&
            (byId.get(id)?.lengthMm ?? Infinity) < FRAGMENT_MM
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

/** Distance from p to segment ab. */
function segDist(p: PtMm, a: PtMm, b: PtMm): number {
  const vx = b.x - a.x;
  const vy = b.y - a.y;
  const L2 = vx * vx + vy * vy;
  const t = L2 > 1e-12 ? Math.max(0, Math.min(1, ((p.x - a.x) * vx + (p.y - a.y) * vy) / L2)) : 0;
  return Math.hypot(p.x - a.x - vx * t, p.y - a.y - vy * t);
}

/** Max distance of a line's points from its end-to-end chord, mm (a closed loop: never straight). */
function bendMm(c: Chain): number {
  if (c.closed) return Infinity;
  const a = c.pts[0];
  const b = c.pts[c.pts.length - 1];
  let m = 0;
  for (const q of c.pts) m = Math.max(m, segDist(q, a, b));
  return m;
}

/**
 * Two same-look lines are a TRANSLATED COPY of each other when one, shifted as a whole, IS the
 * other — a near-exact tile: equal extent (±0.5 mm), equal length (±0.2 %; up to 1 % when one of
 * them is open, i.e. the same loop with a gap where a crossing cut it), and ≥ 98 % of the samples
 * of EACH within 0.3 mm of the other after the shift. That is one line drawn twice with a
 * registration offset (a tiled sheet whose pages each carry the whole drawing, misaligned by a few
 * mm — blazer), never two sizes: a graded outline grows, even a cuff graded by a few mm changes its
 * extent by more than 0.5 mm. Straight lines are left out (a graded straight edge IS a moved copy
 * of the smaller size's), as are lines too short to tell (< COPY_MIN_MM).
 */
export const COPY_MIN_MM = 150;
/** A straight-ish line: no point farther than this from its chord. */
export const COPY_MIN_BEND_MM = 10;
export const COPY = {
  lengthShare: 0.002,
  /** one of the two is open (a gap): the coverage both ways still has to hold */
  gapLengthShare: 0.01,
  boxMm: 0.5,
  onMm: 0.3,
  onShare: 0.98,
};

/** Share of `c`'s samples within COPY.onMm of `d` after shifting c by t. */
function onShare(c: Chain, d: Chain, t: PtMm, grid: SegGrid): number {
  const samples = resampleT(c.pts, 4);
  if (samples.length < 10) return 0;
  let on = 0;
  for (const s of samples) {
    const q = { x: s.p.x + t.x, y: s.p.y + t.y };
    let best = Infinity;
    grid.near(q, 1, (k, i) => {
      if (k !== d.id) return;
      best = Math.min(best, segDist(q, d.pts[i], d.pts[(i + 1) % d.pts.length]));
    });
    if (best <= COPY.onMm) on++;
  }
  return on / samples.length;
}

function isTranslatedCopy(c: Chain, d: Chain, grid: SegGrid): boolean {
  if (Math.min(c.lengthMm, d.lengthMm) < COPY_MIN_MM) return false;
  const lenTol = c.closed && d.closed ? COPY.lengthShare : COPY.gapLengthShare;
  if (Math.abs(c.lengthMm - d.lengthMm) > lenTol * Math.max(c.lengthMm, d.lengthMm)) return false;
  if (bendMm(c) < COPY_MIN_BEND_MM || bendMm(d) < COPY_MIN_BEND_MM) return false;
  const bc = bboxOfPts(c.pts);
  const bd = bboxOfPts(d.pts);
  if (
    Math.abs(bc.maxX - bc.minX - (bd.maxX - bd.minX)) > COPY.boxMm ||
    Math.abs(bc.maxY - bc.minY - (bd.maxY - bd.minY)) > COPY.boxMm
  )
    return false;
  // the shift: the boxes' centres, or either corner (an open copy may miss a few mm at its ends)
  const shifts = [
    {
      x: (bd.minX + bd.maxX - bc.minX - bc.maxX) / 2,
      y: (bd.minY + bd.maxY - bc.minY - bc.maxY) / 2,
    },
    { x: bd.minX - bc.minX, y: bd.minY - bc.minY },
    { x: bd.maxX - bc.maxX, y: bd.maxY - bc.maxY },
  ];
  for (const t of shifts) {
    if (Math.hypot(t.x, t.y) < 1) continue; // the same line drawn twice in place: not a lane anyway
    if (
      onShare(c, d, t, grid) >= COPY.onShare &&
      onShare(d, c, { x: -t.x, y: -t.y }, grid) >= COPY.onShare
    )
      return true;
  }
  return false;
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
  const cand = chains.filter(
    (c) => !covered.has(c.id) && c.lengthMm >= o.minChainMm && c.pts.length >= 2,
  );
  const byId = new Map(cand.map((c) => [c.id, c]));
  const grid = new SegGrid(8);
  for (const c of cand) grid.addPolyline(c.id, c.pts, c.closed);
  const copies = new Map<string, boolean>();
  const copyOf = (a: Chain, b: Chain) => {
    const key = a.id < b.id ? `${a.id}:${b.id}` : `${b.id}:${a.id}`;
    let v = copies.get(key);
    if (v === undefined) copies.set(key, (v = isTranslatedCopy(a, b, grid)));
    return v;
  };
  const cosMin = Math.cos((o.angleDeg * Math.PI) / 180);
  let total = 0;
  // per sample: the same-look neighbours it sees; per (line, neighbour): the distances
  const seen: { self: ChainId; hits: ChainId[] }[] = [];
  const pairD = new Map<string, number[]>();
  for (const c of cand) {
    for (const s of resampleT(c.pts, 4)) {
      total += 4;
      const nrm = { x: -s.t.y, y: s.t.x };
      const a = { x: s.p.x - nrm.x * o.reachMm, y: s.p.y - nrm.y * o.reachMm };
      const rx = 2 * nrm.x * o.reachMm;
      const ry = 2 * nrm.y * o.reachMm;
      const hits = new Map<ChainId, number>();
      const visit = (k: number, i: number) => {
        if (k === c.id || hits.has(k)) return;
        const d = byId.get(k);
        if (!d || (!o.anyLook && !sameLook(c, d, styles)) || copyOf(c, d)) return;
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
        const off = Math.abs((tt - 0.5) * 2 * o.reachMm);
        if (off < o.minGapMm) return;
        hits.set(k, off);
      };
      const steps = Math.ceil((2 * o.reachMm) / grid.cell) + 1;
      for (let k = 0; k <= steps; k++)
        grid.near({ x: a.x + (rx * k) / steps, y: a.y + (ry * k) / steps }, grid.cell * 0.5, visit);
      for (const [k, off] of hits) {
        if (!o.skipUniformPairs) continue;
        const key = `${c.id}:${k}`;
        const list = pairD.get(key);
        if (list) list.push(off);
        else pairD.set(key, [off]);
      }
      seen.push({ self: c.id, hits: [...hits.keys()] });
    }
  }
  const uniform = new Set<string>();
  if (o.skipUniformPairs)
    for (const [key, ds] of pairD) {
      const [a, b] = key.split(':').map(Number);
      const la = byId.get(a)?.lengthMm ?? 0;
      const lb = byId.get(b)?.lengthMm ?? 0;
      if (isAllowancePair(ds, Math.min(la, lb))) uniform.add(key);
    }
  let nested = 0;
  for (const { self, hits } of seen) {
    let lanes = 1;
    for (const k of hits) if (!uniform.has(`${self}:${k}`) && !uniform.has(`${k}:${self}`)) lanes++;
    if (lanes >= o.minLanes) nested += 4;
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
