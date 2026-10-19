// P2 lane S — surface joins: a piece laid ON another (patch pocket, appliqué, a label, a flap on a
// pocket), read off the host's `placement` marks (03-P2-DESIGN §3).
//
// The signal: a placement mark on host H whose bounding box is the bounding box of another piece
// P's SEWING line — two independent objects agreeing to the millimetre is not chance. On top of the
// design's bbox / area / length gates the mark must lie ON P's outline once P is laid onto it (mean
// distance ≤ SURFACE_SHAPE_MM): a facing line or a welt rectangle whose box happens to resemble a
// small piece does not trace that piece. The same fit tells the hand: a pocket drawn face-up fits
// its own front's mark without a flip and the other front's only mirrored.
//
// Surface candidates never compete for edges: matchSeams adds them to `chosen` AFTER the greedy
// edge pass, and their `a` / `b` edges stay free for ordinary seams (the pictogram and lane B read
// `surface`, not the edges).

import {
  SKELETON,
  type Affine,
  type Edge,
  type PieceGeom,
  type Pt2,
  type SeamCandidate,
} from '../types';

export type SurfaceOptions = {
  /** Read the hosts' placement marks at all (false = the negative control: no marks, no joins). */
  marks?: boolean;
  /** bbox tolerance, share of the larger side (SKELETON.surfaceBboxTol). */
  bboxTol?: number;
  /** Part / host area cap (SKELETON.surfaceAreaMax). */
  areaMax?: number;
  /** Mark length / outline perimeter within the open / closed ranges. */
  lenRatio?: boolean;
  /** The mark must trace the part's outline (mean distance ≤ SURFACE_SHAPE_MM). */
  shape?: boolean;
  /** A twin of the host is never laid on it (its seam-line copy is not a placement). */
  twins?: boolean;
};

/** Mean distance of the mark to the laid part outline, mm: above it the mark is not that piece. */
export const SURFACE_SHAPE_MM = 2;
/** Mark length / sewing-line perimeter: an open mark (pocket without its top) and a closed one. */
const OPEN_LEN: readonly [number, number] = [0.55, 1.05];
const CLOSED_LEN: readonly [number, number] = [0.9, 1.1];
/** Below this difference of the plain and the mirrored fit, mm, the fit does not tell the hand. */
const MIRROR_TELLS_MM = 0.5;
/** A part edge point this close to the mark is covered by it (the open side is the least covered). */
const COVER_MM = 3;
/** Mark points sampled at most this far apart for the shape fit. */
const SAMPLE_MM = 2;
/** A straight edge: chord / length at least this (the entry of a closed mark). */
const STRAIGHT = 0.98;

type BBox = { x0: number; y0: number; x1: number; y1: number };
const bboxOf = (pts: readonly Pt2[]): BBox => {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const [x, y] of pts) {
    if (x < x0) x0 = x;
    if (y < y0) y0 = y;
    if (x > x1) x1 = x;
    if (y > y1) y1 = y;
  }
  return { x0, y0, x1, y1 };
};
const applyT = (T: Affine, p: Pt2): Pt2 => [
  T[0] * p[0] + T[2] * p[1] + T[4],
  T[1] * p[0] + T[3] * p[1] + T[5],
];

/** Rotation by `quarter`·90° and an optional mirror (x → −x first) about `from`, then onto `to`. */
function placeT(quarter: number, mirror: boolean, from: Pt2, to: Pt2): Affine {
  const c = [1, 0, -1, 0][quarter];
  const s = [0, 1, 0, -1][quarter];
  const m = mirror ? -1 : 1;
  // Linear part R·M: x' = c·m·x − s·y, y' = s·m·x + c·y.
  const a = c * m;
  const b = s * m;
  const cc = -s;
  const d = c;
  return [a, b, cc, d, to[0] - (a * from[0] + cc * from[1]), to[1] - (b * from[0] + d * from[1])];
}

/** Points along an open / closed polyline no further than SAMPLE_MM apart. */
function sample(pts: readonly Pt2[], closed: boolean): Pt2[] {
  const out: Pt2[] = [];
  const n = pts.length;
  const segs = closed ? n : n - 1;
  for (let i = 0; i < segs; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % n];
    const k = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / SAMPLE_MM));
    for (let j = 0; j < k; j++)
      out.push([a[0] + ((b[0] - a[0]) * j) / k, a[1] + ((b[1] - a[1]) * j) / k]);
  }
  if (!closed && n) out.push(pts[n - 1]);
  return out;
}

/**
 * Mean distance of `pts` to the nearest point of `ring` (a 1 mm resample: vertex-nearest is
 * enough); Infinity as soon as the mean can no longer stay within `cap` (a wrong turn of the part
 * gives up after a few points).
 */
function meanDist(pts: readonly Pt2[], ring: readonly Pt2[], cap = Infinity): number {
  const limit = cap * pts.length;
  let sum = 0;
  for (const p of pts) {
    let best = Infinity;
    for (const q of ring) {
      const d = (p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2;
      if (d < best) best = d;
    }
    sum += Math.sqrt(best);
    if (sum > limit) return Infinity;
  }
  return pts.length ? sum / pts.length : Infinity;
}

export type SurfaceFit = {
  host: PieceGeom;
  part: PieceGeom;
  markId: string;
  /** Puts the part's `rs` onto the mark, in the host's `rs` frame. */
  T: Affine;
  fit: number;
  score: number;
  shapeMm: number;
  mirrored: boolean;
  /** The plain and the mirrored fit differ enough to say which hand the part belongs to. */
  handTold: boolean;
  /** The host edge nearest the mark centre, the part's entry edge. */
  a: Edge;
  b: Edge;
  dims: [number, number];
};

const twinOf = (a: PieceGeom, b: PieceGeom) =>
  a.twinOf.some((t) => t.key === b.pieceKey) || b.twinOf.some((t) => t.key === a.pieceKey);

/** Every placement-mark × piece pair that passes the gates, best orientation each. */
export function surfaceFits(pieces: readonly PieceGeom[], opts: SurfaceOptions = {}): SurfaceFit[] {
  if (opts.marks === false) return [];
  const tol = opts.bboxTol ?? SKELETON.surfaceBboxTol;
  const areaMax = opts.areaMax ?? SKELETON.surfaceAreaMax;
  const out: SurfaceFit[] = [];
  const boxes = new Map(pieces.map((p) => [p.pieceKey, bboxOf(p.rs)]));
  for (const host of pieces) {
    if (host.cloth === 'interfacing') continue;
    for (const m of host.marks ?? []) {
      if (m.kind !== 'placement' || m.pts.length < 2) continue;
      const mb = bboxOf(m.pts);
      const mc: Pt2 = [(mb.x0 + mb.x1) / 2, (mb.y0 + mb.y1) / 2];
      const marks = sample(m.pts, m.closed);
      for (const part of pieces) {
        if (part === host || part.rs.length < 3) continue;
        if (part.cloth === 'lining' || part.cloth === 'interfacing') continue;
        if (opts.twins !== false && twinOf(host, part)) continue;
        if (part.areaMm2 > areaMax * host.areaMm2) continue;
        const pb = boxes.get(part.pieceKey)!;
        const pw = pb.x1 - pb.x0;
        const ph = pb.y1 - pb.y0;
        const big = Math.max(pw, ph);
        // Straight or a quarter turn; a mirror does not change the box.
        let best: { fit: number; turned: boolean } | null = null;
        for (const turned of [false, true]) {
          const [w, h] = turned ? [m.bbox.h, m.bbox.w] : [m.bbox.w, m.bbox.h];
          const fit = 1 - Math.max(Math.abs(w - pw), Math.abs(h - ph)) / (tol * big);
          if (fit >= 0 && (!best || fit > best.fit)) best = { fit, turned };
        }
        if (!best) continue;
        if (opts.lenRatio !== false) {
          const r = m.lenMm / part.perimMm;
          const [lo, hi] = m.closed ? CLOSED_LEN : OPEN_LEN;
          if (r < lo || r > hi) continue;
        }
        // The fit of the outline: both quarter turns of the orientation, plain and mirrored.
        const pc: Pt2 = [(pb.x0 + pb.x1) / 2, (pb.y0 + pb.y1) / 2];
        // Past this a try is neither a fit nor the close second that would hide the hand.
        const cap = opts.shape === false ? Infinity : SURFACE_SHAPE_MM + MIRROR_TELLS_MM;
        const tries: { T: Affine; d: number; mirrored: boolean }[] = [];
        for (const quarter of best.turned ? [1, 3] : [0, 2])
          for (const mirrored of [false, true]) {
            const T = placeT(quarter, mirrored, pc, mc);
            tries.push({
              T,
              mirrored,
              d: meanDist(
                marks,
                part.rs.map((p) => applyT(T, p)),
                cap,
              ),
            });
          }
        tries.sort((x, y) => x.d - y.d || Number(x.mirrored) - Number(y.mirrored));
        const top = tries[0];
        if (opts.shape !== false && top.d > SURFACE_SHAPE_MM) continue;
        const plain = Math.min(...tries.filter((t) => !t.mirrored).map((t) => t.d));
        const flipped = Math.min(...tries.filter((t) => t.mirrored).map((t) => t.d));
        const a = nearestEdge(host, mc);
        const b = entryEdge(part, top.T, m.closed ? null : marks);
        if (!a || !b) continue;
        out.push({
          host,
          part,
          markId: m.id,
          T: top.T.map((x) => Math.round(x * 1000) / 1000) as Affine,
          fit: Math.round(best.fit * 1000) / 1000,
          score: Math.round((0.7 + 0.25 * best.fit) * 1000) / 1000,
          shapeMm: Math.round(top.d * 10) / 10,
          mirrored: top.mirrored,
          handTold: Math.abs(plain - flipped) >= MIRROR_TELLS_MM,
          a,
          b,
          dims: [Math.round(m.bbox.w), Math.round(m.bbox.h)],
        });
      }
    }
  }
  return out;
}

function nearestEdge(p: PieceGeom, c: Pt2): Edge | undefined {
  let best: Edge | undefined;
  let d = Infinity;
  for (const e of p.edges)
    for (const q of e.pts) {
      const di = Math.hypot(q[0] - c[0], q[1] - c[1]);
      if (di < d) {
        d = di;
        best = e;
      }
    }
  return best;
}

/**
 * The part's entry: on an open mark the edge the mark does not draw (the pocket mouth), on a closed
 * one the longest straight edge.
 */
function entryEdge(part: PieceGeom, T: Affine, open: Pt2[] | null): Edge | undefined {
  if (!part.edges.length) return undefined;
  if (open) {
    let best: Edge | undefined;
    let cover = Infinity;
    for (const e of part.edges) {
      const pts = e.pts.map((p) => applyT(T, p));
      const near = pts.filter((p) =>
        open.some((q) => Math.abs(q[0] - p[0]) <= COVER_MM && Math.abs(q[1] - p[1]) <= COVER_MM),
      ).length;
      const share = near / pts.length;
      if (share < cover || (share === cover && best && e.lenMm > best.lenMm)) {
        cover = share;
        best = e;
      }
    }
    return best;
  }
  const straight = part.edges.filter((e) => e.chordMm / e.lenMm >= STRAIGHT);
  return (straight.length ? straight : part.edges).reduce((m, e) => (e.lenMm > m.lenMm ? e : m));
}

const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/**
 * The surface joins of a pattern: each placement mark takes at most one part, each part goes onto
 * as many marks as it has physical copies (`copies`, default 1). Order of trust: score, then a fit
 * that says the hand plainly, then the named hands agreeing, then canonical ids. A mark whose next
 * best part is within SKELETON.ambiguity — and not told apart by hand — carries it as `ambiguousWith`.
 */
export function surfaceSeams(
  pieces: readonly PieceGeom[],
  copies: ReadonlyMap<string, number> = new Map(),
  opts: SurfaceOptions = {},
): { chosen: SeamCandidate[]; warnings: string[] } {
  const fits = surfaceFits(pieces, opts).filter(
    // Named hands that disagree never meet: a left pocket does not go on the right front.
    (f) => !(f.host.hand && f.part.hand && f.host.hand !== f.part.hand),
  );
  const handRank = (f: SurfaceFit) =>
    f.handTold ? (f.mirrored ? 2 : 0) : f.host.hand && f.host.hand === f.part.hand ? 0 : 1;
  const ordered = [...fits].sort(
    (x, y) =>
      y.score - x.score ||
      handRank(x) - handRank(y) ||
      x.shapeMm - y.shapeMm ||
      cmp(x.markId, y.markId) ||
      cmp(x.part.pieceKey, y.part.pieceKey),
  );
  const markTaken = new Set<string>();
  const partUses = new Map<string, number>();
  const picked: SurfaceFit[] = [];
  for (const f of ordered) {
    if (markTaken.has(f.markId)) continue;
    const used = partUses.get(f.part.pieceKey) ?? 0;
    if (used >= (copies.get(f.part.pieceKey) ?? 1)) continue;
    // One part per host, unless the part is cut more than once.
    if (picked.some((p) => p.part === f.part && p.host === f.host)) continue;
    markTaken.add(f.markId);
    partUses.set(f.part.pieceKey, used + 1);
    picked.push(f);
  }
  const toCand = (f: SurfaceFit, ambiguousWith?: SeamCandidate[]): SeamCandidate => ({
    a: f.a.id,
    b: f.b.id,
    score: f.score,
    kind: 'surface',
    evidence: {
      dLenMm: 0,
      relLen: 0,
      notchScore: null,
      curvature: 'flat',
      hand:
        f.host.hand && f.part.hand ? (f.host.hand === f.part.hand ? 'same' : 'cross') : 'neutral',
      twin: 'none',
      self: false,
      rule: `surface: placement mark on ${f.host.name} matches ${f.part.name} outline (${f.dims[0]} × ${f.dims[1]} mm${f.shapeMm > 0 ? `, traced within ${f.shapeMm} mm` : ''})`,
    },
    surface: { host: f.host.pieceKey, part: f.part.pieceKey, mark: f.markId, T: f.T, fit: f.fit },
    ...(ambiguousWith?.length ? { ambiguousWith } : {}),
  });
  const warnings = new Set<string>();
  const chosen = picked.map((f) => {
    // Parts that fit this mark as well, the hand not telling them apart.
    const equal = ordered.filter(
      (q) =>
        q.markId === f.markId &&
        q.part !== f.part &&
        f.score - q.score <= SKELETON.ambiguity &&
        handRank(q) <= handRank(f),
    );
    // One left over (not laid elsewhere) is a real choice for this mark: «decide» on the step.
    const spare = equal.filter((q) => !picked.some((p) => p.part === q.part));
    // Laid on the twin mark instead: two equal parts swapped between two equal hosts — the same
    // garment either way, said once in words rather than asked twice.
    if (equal.length > spare.length) {
      const names = [f.part.name, ...equal.map((q) => q.part.name)].sort().join(' and ');
      warnings.add(
        `${names} fit the same placement marks — which goes on which is not told, check`,
      );
    }
    return toCand(
      f,
      spare.map((q) => toCand(q)),
    );
  });
  // Deterministic order: by host, then part.
  chosen.sort((x, y) => cmp(x.a, y.a) || cmp(x.b, y.b));
  return { chosen, warnings: [...warnings] };
}
