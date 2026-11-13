// How a drawn zone's point moves from one size's outline to another's.
//
//   1. Contour correspondence — the two cut contours are cut into runs at their corners (the
//      importer's corner matcher: turn over ±1.5 mm, non-maxima suppressed, cyclic order, agreeing
//      turn signs, an unclear match refused). Inside a run a point keeps its arc fraction, the base
//      arc measured after the bbox stretch (sx, sy), so a pure axis scale is reproduced exactly on a
//      curved run too. Fallback when the corners do not match (a rounded or a symmetric contour):
//      one run round the whole loop, started where the bbox-proportional image of the base contour
//      fits the target best.
//   2. Base field — mean-value (Floater) coordinates of the matched contour: linear precision, so a
//      translation and an affine grade are exact inside the piece.
//   3. Internal lines — each base line is paired with the target line of its layer and closure that
//      is nearest to where the contour-only field predicts it (reversed order and other vertex
//      counts accepted, an unclear pair rejected on its own). A paired line corrects the base field
//      by its residual (line move − base field), spread by inverse distance over the lines and the
//      contour, the contour holding residual zero: exact on a line, nothing at the contour. A
//      straight open line says where it lies only across itself (slid along itself it is the same
//      line), so it corrects the normal component alone; a bent or closed line corrects both.
//   4. Fold-over — a line whose residual would fold the field (det of the map's Jacobian sampled
//      round the lines) is dropped.
//   5. Inverse — the field is built once, from the smaller outline; the other direction solves
//      q = p + D(p) by damped Newton with a residual check, else the field built the asked way round.
//
// The contour carrier (a point keeps its mm off its two nearest contour stretches) uses the same
// correspondence, is built from the same outline and inverted the same way. `follow` mixes the
// two: the carrier up to KEEP_MM_NEAR off the contour (a band keeps its width), the field from
// GRADE_FROM_MM, and a paired internal line leads where it is nearer than the contour.

import { correspondLines, matchLineCorners } from 'lib/pattern-import/adapters/rul/correspond';
import type { PtMm } from 'lib/pattern-import/types';
import type { FuseInternalLine, FuseInternals } from './dxf';
import { pointInRing, signedArea } from './geometry';

/** Corner thresholds tried in turn, deg: the mapper's own 35° first, then the neighbours. */
const CORNER_THRESHOLDS = [35, 30, 45, 25, 60, 75, 90];
/** An open line turning by more than this at a vertex has a bend there (lines pair bend to bend). */
const MIN_PIN_ANGLE_DEG = 30;
/**
 * The second stretch pins a point in full up to PIN_NEAR_MM from it and not at all from PIN_FAR_MM:
 * far from every corner a contour point keeps its place in its own run (the run correspondence,
 * which inverts exactly), not its mm off a stretch it has nothing to do with.
 */
const PIN_NEAR_MM = 100;
const PIN_FAR_MM = 200;
/**
 * A stretch weighs 1/(d + PIN_SOFT_MM)^PIN_POWER: a far side barely moves a point pinned by two
 * near ones (a corner stays the corner), softened so the nearest does not take all.
 */
const PIN_SOFT_MM = 0.5;
const PIN_POWER = 2;
/** Two stretches pin a point together from this angle between them, in full from the next. */
const PAIR_FROM_DEG = 20;
const PAIR_AT_DEG = 40;
/**
 * The pairs' share of the pins (pair weight over the squared sum of stretch weights) from which the
 * pairs alone decide; below it the single stretches' mean is blended in, alone at zero. Tiny, so a
 * pair leads wherever a partner is nearer than PIN_FAR_MM, and where it leads it is exact.
 */
const PAIR_SHARE = 1e-6;
/**
 * Softens the line-or-contour ratio: where a paired line ends on the contour both distances go to
 * zero together, and the bare ratio would flip there; within about this of the contour it leads.
 */
const LINE_LEAD_SOFT_MM = 2;
/** See `beside` in contourCarrier. */
const BESIDE_SOFT_MM = 1;
/** Anchors are cut this short, so a long straight line weighs from where it is near. */
const ANCHOR_STEP_MM = 5;
/** A paired line may sit this far (RMS) from where the contour alone predicts it, plus the grade. */
const LINE_SLACK_MM = 2;
/** Two lines of one size this close to each other (RMS) are the same line drawn twice. */
const SAME_LINE_MM = 0.25;
/** The map's Jacobian determinant must stay above this round every paired line. */
const MIN_FOLD_DET = 0.2;
/**
 * Up to KEEP_MM_NEAR off the cut contour a point keeps its mm off it (the carrier) in full; from
 * GRADE_FROM_MM on it follows the grade field; smoothly in between. Fusing bands — plackets,
 * waistbands, facings, cuffs — are at most ~50 mm wide, and a band keeps its width in every size.
 */
const KEEP_MM_NEAR = 50;
const GRADE_FROM_MM = 100;
/** A numeric inverse is accepted when it lands this close to the asked point, mm. */
const INVERSE_TOLERANCE_MM = 0.05;

type Loop = { ring: PtMm[]; cum: number[]; total: number };

/** One corner-to-corner run and its twin: arc offsets from the run starts, monotone knot pairs. */
type ContourRun = {
  b0: number;
  bLen: number;
  t0: number;
  tLen: number;
  kb: number[];
  kt: number[];
};

export type ContourMatch = { base: Loop; target: Loop; runs: ContourRun[]; cornered: boolean };

const mod = (s: number, total: number) => ((s % total) + total) % total;
const lerpPt = (a: PtMm, b: PtMm, t: number): PtMm => ({
  x: a.x + (b.x - a.x) * t,
  y: a.y + (b.y - a.y) * t,
});

function loopOf(outline: readonly PtMm[]): Loop {
  const n0 = outline.length;
  let ring = outline.filter(
    (p, i) => Math.hypot(p.x - outline[(i + 1) % n0].x, p.y - outline[(i + 1) % n0].y) > 1e-6,
  );
  if (signedArea(ring) < 0) ring = [...ring].reverse();
  const cum = [0];
  for (let i = 1; i <= ring.length; i++) {
    const a = ring[i - 1];
    const b = ring[i % ring.length];
    cum.push(cum[i - 1] + Math.hypot(b.x - a.x, b.y - a.y));
  }
  return { ring, cum, total: cum[ring.length] };
}

/** The segment holding arc s (0 ≤ s < total). */
function segmentAt(loop: Loop, s: number): number {
  let lo = 0;
  let hi = loop.ring.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (loop.cum[mid] <= s) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

function pointAtArc(loop: Loop, s: number): { p: PtMm; dir: number } {
  const t = mod(s, loop.total);
  const i = segmentAt(loop, t);
  const a = loop.ring[i];
  const b = loop.ring[(i + 1) % loop.ring.length];
  const len = loop.cum[i + 1] - loop.cum[i];
  const f = len > 0 ? (t - loop.cum[i]) / len : 0;
  return { p: lerpPt(a, b, f), dir: Math.atan2(b.y - a.y, b.x - a.x) };
}

function boxOf(points: readonly PtMm[]) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of points) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  return { minX, minY, maxX, maxY };
}

/** Linear interpolation of ys over ascending xs. */
function interpolate(xs: readonly number[], ys: readonly number[], x: number): number {
  const n = xs.length;
  if (x <= xs[0]) return ys[0];
  if (x >= xs[n - 1]) return ys[n - 1];
  let lo = 0;
  let hi = n - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (xs[mid] <= x) lo = mid;
    else hi = mid;
  }
  const span = xs[hi] - xs[lo];
  return span > 0 ? ys[lo] + ((ys[hi] - ys[lo]) * (x - xs[lo])) / span : ys[lo];
}

/** The loop's vertices inside (start, start + len), as arc offsets from start, ascending. */
function offsetsWithin(loop: Loop, start: number, len: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < loop.ring.length; i++) {
    const off = mod(loop.cum[i] - start, loop.total);
    if (off > 1e-9 && off < len - 1e-9) out.push(off);
  }
  return out.sort((a, b) => a - b);
}

/**
 * One run paired with its twin. A point keeps its fraction of the run, the base run measured in the
 * stretched metric; the knots are both sizes' own vertices, so the move is linear between knots.
 */
function runOf(
  base: Loop,
  b0: number,
  bLen: number,
  target: Loop,
  t0: number,
  tLen: number,
  sx: number,
  sy: number,
): ContourRun {
  const bOff = [0, ...offsetsWithin(base, b0, bLen), bLen];
  const stretched = [0];
  for (let i = 1; i < bOff.length; i++) {
    const a = pointAtArc(base, b0 + bOff[i - 1]).p;
    // The run end may be the run start again (one run round the loop): read it just before.
    const b = pointAtArc(base, b0 + Math.min(bOff[i], bLen - 1e-9)).p;
    stretched.push(stretched[i - 1] + Math.hypot((b.x - a.x) * sx, (b.y - a.y) * sy));
  }
  const whole = stretched[stretched.length - 1] || 1;
  const fraction = stretched.map((s) => s / whole);
  const knots = [
    ...bOff.map((b, i) => ({ b, t: fraction[i] * tLen })),
    ...offsetsWithin(target, t0, tLen).map((t) => ({
      b: interpolate(fraction, bOff, t / tLen),
      t,
    })),
  ].sort((p, q) => p.t - q.t || p.b - q.b);
  const kb: number[] = [];
  const kt: number[] = [];
  for (const k of knots) {
    const last = kb.length - 1;
    if (last >= 0 && k.b - kb[last] < 1e-9 && k.t - kt[last] < 1e-9) continue;
    kb.push(Math.max(k.b, last >= 0 ? kb[last] : 0));
    kt.push(k.t);
  }
  return { b0, bLen, t0, tLen, kb, kt };
}

/** Where the whole-loop run starts on the target: the best fit of the base's bbox image. */
function loopStart(base: Loop, target: Loop, sx: number, sy: number): number {
  const from = boxOf(base.ring);
  const to = boxOf(target.ring);
  const probe = runOf(base, 0, base.total, target, 0, target.total, sx, sy);
  const SAMPLES = 48;
  const want: PtMm[] = [];
  for (let j = 0; j < SAMPLES; j++) {
    // The base point at stretched fraction j / SAMPLES, carried by the bbox frames.
    const p = pointAtArc(base, interpolate(probe.kt, probe.kb, (j / SAMPLES) * target.total)).p;
    want.push({ x: to.minX + (p.x - from.minX) * sx, y: to.minY + (p.y - from.minY) * sy });
  }
  const cost = (tau: number) => {
    let sum = 0;
    for (let j = 0; j < SAMPLES; j++) {
      const q = pointAtArc(target, tau + (j / SAMPLES) * target.total).p;
      sum += (q.x - want[j].x) ** 2 + (q.y - want[j].y) ** 2;
    }
    return sum;
  };
  const steps = Math.max(8, Math.min(720, Math.ceil(target.total / 2)));
  const step = target.total / steps;
  let best = 0;
  let bestCost = Infinity;
  for (let k = 0; k < steps; k++) {
    const c = cost(k * step);
    if (c < bestCost) [best, bestCost] = [k * step, c];
  }
  let lo = best - step;
  let hi = best + step;
  for (let k = 0; k < 40; k++) {
    const a = lo + (hi - lo) / 3;
    const b = hi - (hi - lo) / 3;
    if (cost(a) < cost(b)) hi = b;
    else lo = a;
  }
  return mod((lo + hi) / 2, target.total);
}

function buildContourMatch(baseOutline: readonly PtMm[], targetOutline: readonly PtMm[]) {
  const base = loopOf(baseOutline);
  const target = loopOf(targetOutline);
  if (base.ring.length < 3 || target.ring.length < 3) return null;
  const from = boxOf(base.ring);
  const to = boxOf(target.ring);
  const sx = from.maxX > from.minX ? (to.maxX - to.minX) / (from.maxX - from.minX) || 1 : 1;
  const sy = from.maxY > from.minY ? (to.maxY - to.minY) / (from.maxY - from.minY) || 1 : 1;
  const corners = matchLineCorners([base.ring, target.ring], true, CORNER_THRESHOLDS);
  if (corners.ok) {
    const [cb, ct] = corners.corners;
    const runs = cb.map((i, k) => {
      const b0 = base.cum[i];
      const t0 = target.cum[ct[k]];
      const bLen = mod(base.cum[cb[(k + 1) % cb.length]] - b0, base.total) || base.total;
      const tLen = mod(target.cum[ct[(k + 1) % ct.length]] - t0, target.total) || target.total;
      return runOf(base, b0, bLen, target, t0, tLen, sx, sy);
    });
    return { base, target, runs, cornered: true };
  }
  const t0 = loopStart(base, target, sx, sy);
  return {
    base,
    target,
    runs: [runOf(base, 0, base.total, target, t0, target.total, sx, sy)],
    cornered: false,
  };
}

/**
 * Which outline a size mapping is built from: the smaller one, whichever way round it is asked. The
 * other direction inverts the same correspondence and field, so base → size → base returns.
 */
function buildsFrom(base: readonly PtMm[], target: readonly PtMm[]): boolean {
  const key = (ring: readonly PtMm[]) => [
    Math.abs(signedArea(ring)),
    ring.reduce((s, p) => s + p.x, 0),
    ring.reduce((s, p) => s + p.y, 0),
  ];
  const a = key(base);
  const b = key(target);
  for (let i = 0; i < a.length; i++)
    if (Math.abs(a[i] - b[i]) > 1e-9 * Math.max(1, Math.abs(a[i]), Math.abs(b[i])))
      return a[i] < b[i];
  return true;
}

const invertMatch = (m: ContourMatch): ContourMatch => ({
  base: m.target,
  target: m.base,
  cornered: m.cornered,
  runs: m.runs.map((r) => ({
    b0: r.t0,
    bLen: r.tLen,
    t0: r.b0,
    tLen: r.bLen,
    kb: r.kt,
    kt: r.kb,
  })),
});

/** The corner thresholds the contour matcher tries, in order (shared with the grade-map builder). */
export const CONTOUR_CORNER_THRESHOLDS: readonly number[] = CORNER_THRESHOLDS;

/** The contour correspondence base → target; null when an outline is not a ring. */
export function matchContours(
  baseOutline: readonly PtMm[],
  targetOutline: readonly PtMm[],
): ContourMatch | null {
  if (buildsFrom(baseOutline, targetOutline)) return buildContourMatch(baseOutline, targetOutline);
  const built = buildContourMatch(targetOutline, baseOutline);
  return built && invertMatch(built);
}

/** Nearest point of the loop stretch [s0, s0 + len] (arc, cyclic), with its tangent direction. */
function projectOnRun(
  c: Loop,
  q: PtMm,
  s0: number,
  len: number,
): { p: PtMm; d: number; s: number; tx: number; ty: number } {
  const n = c.ring.length;
  let best = { p: q, d: Infinity, s: s0, tx: 1, ty: 0 };
  // The segment holding s0, then forward along the stretch only.
  const at = mod(s0, c.total);
  let lo = 0;
  let hi = n - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (c.cum[mid] <= at + 1e-9) lo = mid;
    else hi = mid - 1;
  }
  for (let k = 0; k < n; k++) {
    const i = (lo + k) % n;
    const startArc = k === 0 ? 0 : mod(c.cum[i] - s0, c.total);
    if (k > 0 && startArc >= len - 1e-9) break;
    const a = c.ring[i];
    const b = c.ring[(i + 1) % n];
    const abx = b.x - a.x;
    const aby = b.y - a.y;
    const ll = abx * abx + aby * aby;
    if (ll <= 0) continue;
    const l = Math.sqrt(ll);
    // Clip the segment to the stretch: [s0, s0 + len] in its own arc.
    const segStart = k === 0 ? c.cum[i] - at : startArc;
    const tFrom = Math.max(0, -segStart / l);
    const tTo = Math.min(1, (len - segStart) / l);
    if (tTo < tFrom) continue;
    const t = Math.max(tFrom, Math.min(tTo, ((q.x - a.x) * abx + (q.y - a.y) * aby) / ll));
    const p = { x: a.x + abx * t, y: a.y + aby * t };
    const d = Math.hypot(q.x - p.x, q.y - p.y);
    if (d < best.d) best = { p, d, s: c.cum[i] + l * t, tx: abx / l, ty: aby / l };
  }
  return best;
}

/**
 * Carries a point of the base contour onto the target contour by its mm off the stretches near it.
 * Each stretch gives the point's signed mm off it and the twin of its foot on the target. Two
 * stretches that meet at a fair angle pin the point exactly (it keeps its mm off both: a placket
 * band keeps its width off the front edge and its depth below the neck while the side seam grows);
 * one stretch alone keeps the mm off it at the run's corresponding place. Every pair and every
 * single stretch gives a candidate; the answer is their weighted mean. A stretch weighs by its
 * distance (1/d², softened by PIN_SOFT_MM, faded out from PIN_NEAR_MM to PIN_FAR_MM, and less when
 * the point lies beyond its end); a pair by both stretches and by their angle (none below
 * PAIR_FROM_DEG, full from PAIR_AT_DEG, so near-parallel stretches never pin); a single stretch by
 * blending in only where the pairs' share is below PAIR_SHARE. No stretch is picked: the result is
 * continuous. Well conditioned on the contour only: away from it the field takes over.
 */
export function contourCarrier({ base, target, runs }: ContourMatch): (point: PtMm) => PtMm {
  const sinFrom = Math.sin((PAIR_FROM_DEG * Math.PI) / 180);
  const sinAt = Math.sin((PAIR_AT_DEG * Math.PI) / 180);
  return (point) => {
    type Pin = { w: number; signed: number; at: PtMm; tx: number; ty: number };
    /** The target stretch at an arc offset of its run, with the tangent from inside the stretch. */
    const anchorAt = (run: ContourRun, twin: number) => {
      const at = pointAtArc(target, run.t0 + twin).p;
      // At a stretch end the arc sits on a corner, and which side's segment it read there depended
      // on where the ring happens to start: the wrong side threw the point off the piece.
      const edge = Math.min(1e-3, run.tLen / 2);
      const inside = pointAtArc(target, run.t0 + Math.min(Math.max(twin, edge), run.tLen - edge));
      return { at, tx: Math.cos(inside.dir), ty: Math.sin(inside.dir) };
    };
    const pins: Pin[] = [];
    for (const run of runs) {
      const pr = projectOnRun(base, point, run.b0, run.bLen);
      if (!(pr.d < PIN_FAR_MM)) continue;
      const signed = pr.tx * (point.y - pr.p.y) - pr.ty * (point.x - pr.p.x);
      // Beyond the stretch's end the offset leaves its normal: that stretch says less. Softened by
      // BESIDE_SOFT_MM, so at a corner, where every offset is tiny, the weight does not flip.
      const beside = (signed ** 2 + BESIDE_SOFT_MM ** 2) / (pr.d ** 2 + BESIDE_SOFT_MM ** 2);
      const w =
        ((1 - smoothstep(PIN_NEAR_MM, PIN_FAR_MM, pr.d)) * beside) /
        (pr.d + PIN_SOFT_MM) ** PIN_POWER;
      if (!(w > 0)) continue;
      const along = Math.min(run.bLen, mod(pr.s - run.b0, base.total));
      const twin = interpolate(run.kb, run.kt, along);
      pins.push({ w, signed, ...anchorAt(run, twin) });
    }
    if (pins.length === 0) {
      // Farther than PIN_FAR_MM from every stretch: the nearest one alone.
      let best: { run: ContourRun; pr: ReturnType<typeof projectOnRun> } | null = null;
      for (const run of runs) {
        const pr = projectOnRun(base, point, run.b0, run.bLen);
        if (!best || pr.d < best.pr.d) best = { run, pr };
      }
      if (!best) return point;
      const { run, pr } = best;
      const signed = pr.tx * (point.y - pr.p.y) - pr.ty * (point.x - pr.p.x);
      const twin = interpolate(run.kb, run.kt, Math.min(run.bLen, mod(pr.s - run.b0, base.total)));
      const at = pointAtArc(target, run.t0 + twin);
      return { x: at.p.x - Math.sin(at.dir) * signed, y: at.p.y + Math.cos(at.dir) * signed };
    }
    let ox = 0;
    let oy = 0;
    let ow = 0;
    let px = 0;
    let py = 0;
    let pw = 0;
    for (let i = 0; i < pins.length; i++) {
      const a = pins[i];
      ox += a.w * (a.at.x - a.ty * a.signed);
      oy += a.w * (a.at.y + a.tx * a.signed);
      ow += a.w;
      for (let j = i + 1; j < pins.length; j++) {
        const b = pins[j];
        const cross = a.tx * b.ty - a.ty * b.tx;
        const g = smoothstep(sinFrom, sinAt, Math.abs(cross));
        if (g <= 0) continue;
        // tx·(X−A).y − ty·(X−A).x = signed, for both: a 2×2 linear system in X.
        const c1 = a.signed - a.ty * a.at.x + a.tx * a.at.y;
        const c2 = b.signed - b.ty * b.at.x + b.tx * b.at.y;
        const det = -a.ty * b.tx + a.tx * b.ty;
        const w = a.w * b.w * g;
        px += (w * (c1 * b.tx - a.tx * c2)) / det;
        py += (w * (-a.ty * c2 + c1 * b.ty)) / det;
        pw += w;
      }
    }
    const single = { x: ox / ow, y: oy / ow };
    if (!(pw > 0)) return single;
    const pair = { x: px / pw, y: py / pw };
    return lerpPt(single, pair, smoothstep(0, PAIR_SHARE, pw / ow ** 2));
  };
}

// ---------- the interior field ----------

/** The matched contour as one polygon with a known move at every vertex (linear along an edge). */
type Cage = { p: PtMm[]; dx: number[]; dy: number[] };

function cageOf({ base, target, runs }: ContourMatch): Cage {
  const p: PtMm[] = [];
  const dx: number[] = [];
  const dy: number[] = [];
  for (const run of runs)
    for (let k = 0; k < run.kb.length - 1; k++) {
      const a = pointAtArc(base, run.b0 + run.kb[k]).p;
      const b = pointAtArc(target, run.t0 + run.kt[k]).p;
      const last = p[p.length - 1];
      if (last && Math.hypot(a.x - last.x, a.y - last.y) < 1e-7) continue;
      p.push(a);
      dx.push(b.x - a.x);
      dy.push(b.y - a.y);
    }
  return { p, dx, dy };
}

/** Mean-value interpolation of the cage's move at c: exact for an affine move of the cage. */
function meanValueMove(cage: Cage, c: PtMm): PtMm {
  const n = cage.p.length;
  const rx = new Array<number>(n);
  const ry = new Array<number>(n);
  const d = new Array<number>(n);
  let nearest = 0;
  for (let i = 0; i < n; i++) {
    rx[i] = cage.p[i].x - c.x;
    ry[i] = cage.p[i].y - c.y;
    d[i] = Math.hypot(rx[i], ry[i]);
    if (d[i] < 1e-9) return { x: cage.dx[i], y: cage.dy[i] };
    if (d[i] < d[nearest]) nearest = i;
  }
  // tan(α/2) = sin α / (1 + cos α) of the angle at c between consecutive vertices, signed, so the
  // cage's winding cancels out of the normalised weights.
  const t = new Array<number>(n);
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const pair = d[i] * d[j];
    const den = pair + rx[i] * rx[j] + ry[i] * ry[j];
    if (den < 1e-12 * pair) {
      // c lies on the edge i → j: the move is linear along it.
      const f = d[i] / (d[i] + d[j]);
      return {
        x: cage.dx[i] + (cage.dx[j] - cage.dx[i]) * f,
        y: cage.dy[i] + (cage.dy[j] - cage.dy[i]) * f,
      };
    }
    t[i] = (rx[i] * ry[j] - ry[i] * rx[j]) / den;
  }
  let sum = 0;
  let x = 0;
  let y = 0;
  for (let i = 0; i < n; i++) {
    const w = (t[(i - 1 + n) % n] + t[i]) / d[i];
    sum += w;
    x += w * cage.dx[i];
    y += w * cage.dy[i];
  }
  if (!(Math.abs(sum) > 1e-12)) return { x: cage.dx[nearest], y: cage.dy[nearest] };
  return { x: x / sum, y: y / sum };
}

/**
 * A base segment: its ends' whole move (da / db) and their residual over the base field. `across`
 * marks a segment of a straight open line: only the residual's component along the segment's
 * normal (nx, ny) is known.
 */
type Anchor = {
  a: PtMm;
  b: PtMm;
  da: PtMm;
  db: PtMm;
  ra: PtMm;
  rb: PtMm;
  len: number;
  across: boolean;
  nx: number;
  ny: number;
};

/** An open line whose points all keep this close to its chord is straight. */
const STRAIGHT_MM = 0.5;

function isStraight(points: readonly PtMm[]): boolean {
  const a = points[0];
  const b = points[points.length - 1];
  const len = Math.hypot(b.x - a.x, b.y - a.y);
  if (!(len > 1e-9)) return false;
  return points.every(
    (p) => Math.abs((b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x)) / len <= STRAIGHT_MM,
  );
}

/** Segments along a polyline, cut to ANCHOR_STEP_MM. */
function segmentsAlong(points: readonly PtMm[], closed: boolean): { a: PtMm; b: PtMm }[] {
  const out: { a: PtMm; b: PtMm }[] = [];
  const n = points.length;
  for (let i = 0; i < (closed ? n : n - 1); i++) {
    const j = (i + 1) % n;
    const len = Math.hypot(points[j].x - points[i].x, points[j].y - points[i].y);
    if (!(len > 1e-9)) continue;
    const k = Math.ceil(len / ANCHOR_STEP_MM);
    for (let s = 0; s < k; s++)
      out.push({
        a: lerpPt(points[i], points[j], s / k),
        b: lerpPt(points[i], points[j], (s + 1) / k),
      });
  }
  return out;
}

function distanceToPolyline(q: PtMm, points: readonly PtMm[], closed: boolean): number {
  let best = Infinity;
  const n = points.length;
  for (let i = 0; i < (closed ? n : n - 1); i++) {
    const a = points[i];
    const b = points[(i + 1) % n];
    const abx = b.x - a.x;
    const aby = b.y - a.y;
    const ll = abx * abx + aby * aby;
    const t = ll > 0 ? Math.max(0, Math.min(1, ((q.x - a.x) * abx + (q.y - a.y) * aby) / ll)) : 0;
    best = Math.min(best, Math.hypot(q.x - a.x - abx * t, q.y - a.y - aby * t));
  }
  return best;
}

const lengthOf = (points: readonly PtMm[], closed: boolean) => {
  let len = 0;
  for (let i = 0; i < (closed ? points.length : points.length - 1); i++) {
    const b = points[(i + 1) % points.length];
    len += Math.hypot(b.x - points[i].x, b.y - points[i].y);
  }
  return len;
};

/** Points every ≤ 2 mm along a polyline (each stands for an equal share of its segment). */
function samplesOf(points: readonly PtMm[], closed: boolean): { p: PtMm; w: number }[] {
  const out: { p: PtMm; w: number }[] = [];
  const n = points.length;
  for (let i = 0; i < (closed ? n : n - 1); i++) {
    const a = points[i];
    const b = points[(i + 1) % n];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    const k = Math.max(1, Math.min(64, Math.ceil(len / 2)));
    for (let s = 0; s < k; s++) out.push({ p: lerpPt(a, b, (s + 0.5) / k), w: len / k });
  }
  return out;
}

/** Symmetric length-weighted RMS distance between two polylines, mm: order and direction free. */
function chamfer(a: readonly PtMm[], b: readonly PtMm[], closed: boolean): number {
  const la = lengthOf(a, closed);
  const lb = lengthOf(b, closed);
  if (!(la + lb > 0)) return Math.hypot(a[0].x - b[0].x, a[0].y - b[0].y);
  let sum = 0;
  for (const s of samplesOf(a, closed)) sum += s.w * distanceToPolyline(s.p, b, closed) ** 2;
  for (const s of samplesOf(b, closed)) sum += s.w * distanceToPolyline(s.p, a, closed) ** 2;
  return Math.sqrt(sum / (la + lb));
}

/** Interior vertices of an open line where it turns by more than MIN_PIN_ANGLE_DEG, with the sign. */
function sharpVertices(points: readonly PtMm[]): { i: number; sign: number }[] {
  const out: { i: number; sign: number }[] = [];
  for (let i = 1; i < points.length - 1; i++) {
    const ax = points[i].x - points[i - 1].x;
    const ay = points[i].y - points[i - 1].y;
    const bx = points[i + 1].x - points[i].x;
    const by = points[i + 1].y - points[i].y;
    const turn = Math.atan2(ax * by - ay * bx, ax * bx + ay * by);
    if (Math.abs(turn) > (MIN_PIN_ANGLE_DEG * Math.PI) / 180)
      out.push({ i, sign: Math.sign(turn) });
  }
  return out;
}

/**
 * Two open lines (same direction) paired bend to bend: between two bends a point keeps its arc
 * fraction, the knots being both lines' own vertices. null when the bends do not pair one to one.
 */
function pairAtBends(from: readonly PtMm[], to: readonly PtMm[]): [PtMm[], PtMm[]] | null {
  const a = sharpVertices(from);
  const b = sharpVertices(to);
  if (!a.length || a.length !== b.length || a.some((v, k) => v.sign !== b[k].sign)) return null;
  const cutsA = [0, ...a.map((v) => v.i), from.length - 1];
  const cutsB = [0, ...b.map((v) => v.i), to.length - 1];
  const outA: PtMm[] = [];
  const outB: PtMm[] = [];
  const fractions = (piece: readonly PtMm[]) => {
    const cum = [0];
    for (let i = 1; i < piece.length; i++)
      cum.push(cum[i - 1] + Math.hypot(piece[i].x - piece[i - 1].x, piece[i].y - piece[i - 1].y));
    const whole = cum[cum.length - 1];
    return whole > 0 ? cum.map((c) => c / whole) : null;
  };
  const at = (piece: readonly PtMm[], f: readonly number[], u: number): PtMm => {
    let k = 1;
    while (k < f.length - 1 && f[k] < u) k++;
    const span = f[k] - f[k - 1];
    return lerpPt(piece[k - 1], piece[k], span > 0 ? (u - f[k - 1]) / span : 0);
  };
  for (let k = 0; k < cutsA.length - 1; k++) {
    const pa = from.slice(cutsA[k], cutsA[k + 1] + 1);
    const pb = to.slice(cutsB[k], cutsB[k + 1] + 1);
    const fa = fractions(pa);
    const fb = fractions(pb);
    if (!fa || !fb) return null;
    const knots = [...fa, ...fb]
      .sort((x, y) => x - y)
      .filter((u, i, all) => !i || u - all[i - 1] > 1e-9);
    const last = k === cutsA.length - 2;
    for (const u of last ? knots : knots.slice(0, -1)) {
      outA.push(at(pa, fa, u));
      outB.push(at(pb, fb, u));
    }
  }
  return [outA, outB];
}

const centroidOfPoints = (points: readonly PtMm[]): PtMm => ({
  x: points.reduce((s, p) => s + p.x, 0) / points.length,
  y: points.reduce((s, p) => s + p.y, 0) / points.length,
});

/**
 * Base lines paired with target lines by geometry: each base line, moved by the contour-only field,
 * takes the nearest target line of its layer and closure. A pair stands when both lines prefer each
 * other, no different line rivals it (within max(0.5 mm, half the cost)), and the line sits within
 * the grade + LINE_SLACK_MM of its prediction. Only the unclear line is left out.
 */
function pairLines(
  base: readonly FuseInternalLine[],
  target: readonly FuseInternalLine[],
  predict: (p: PtMm) => PtMm,
  reach: number,
): [PtMm[], PtMm[], boolean][] {
  const usable = (line: FuseInternalLine) =>
    line.points.length >= 2 && lengthOf(line.points, line.closed) > 1e-6;
  const groupKey = (line: FuseInternalLine) => `${line.layer}|${line.closed ? 1 : 0}`;
  const pairs: [PtMm[], PtMm[], boolean][] = [];
  const groups = new Map<string, { b: FuseInternalLine[]; t: FuseInternalLine[] }>();
  for (const line of base.filter(usable)) {
    const g = groups.get(groupKey(line)) ?? { b: [], t: [] };
    g.b.push(line);
    groups.set(groupKey(line), g);
  }
  for (const line of target.filter(usable)) groups.get(groupKey(line))?.t.push(line);
  for (const { b, t } of groups.values()) {
    if (!t.length) continue;
    const closed = b[0].closed;
    const predicted = b.map((line) => line.points.map(predict));
    const cost = predicted.map((p) => t.map((line) => chamfer(p, line.points, closed)));
    const sameTarget = t.map((x) =>
      t.map((y) => x === y || chamfer(x.points, y.points, closed) <= SAME_LINE_MM),
    );
    const sameBase = b.map((x) =>
      b.map((y) => x === y || chamfer(x.points, y.points, closed) <= SAME_LINE_MM),
    );
    const margin = (c: number) => Math.max(0.5, 0.5 * c);
    b.forEach((line, i) => {
      let j = 0;
      for (let k = 1; k < t.length; k++) if (cost[i][k] < cost[i][j]) j = k;
      const c = cost[i][j];
      if (c > reach + LINE_SLACK_MM) return;
      // Another target line as near to this base line, or another base line as near to this target.
      if (t.some((_, k) => !sameTarget[j][k] && cost[i][k] - c < margin(c))) return;
      if (b.some((_, k) => !sameBase[i][k] && cost[k][j] - c < margin(c))) return;
      const twin = t[j].points;
      const matched = correspondLines([line.points, twin], closed);
      if (matched.ok) {
        // The matcher keeps an open line's direction; which way the twin runs shows at its ends.
        const [from, to] = matched.lines;
        const flipped =
          Math.hypot(to[0].x - twin[0].x, to[0].y - twin[0].y) >
          Math.hypot(to[0].x - twin[twin.length - 1].x, to[0].y - twin[twin.length - 1].y);
        const bends = closed
          ? null
          : pairAtBends(line.points, flipped ? [...twin].reverse() : twin);
        pairs.push(bends ? [bends[0], bends[1], false] : [from, to, closed]);
        return;
      }
      // A closed mark with no corners to match (a drill circle): it moves whole, when it kept its shape.
      if (!closed) return;
      const from = centroidOfPoints(line.points);
      const to = centroidOfPoints(twin);
      const moved = line.points.map((p) => ({ x: p.x + to.x - from.x, y: p.y + to.y - from.y }));
      if (chamfer(moved, twin, true) <= SAME_LINE_MM) pairs.push([[...line.points], moved, true]);
    });
  }
  return pairs;
}

type GradeField = {
  match: ContourMatch;
  /** The largest move of any anchor: no point moves farther. */
  reach: number;
  lines: Anchor[][];
  move: (p: PtMm) => PtMm;
};

function buildField(
  match: ContourMatch,
  baseLines: readonly FuseInternalLine[],
  targetLines: readonly FuseInternalLine[],
): GradeField {
  const cage = cageOf(match);
  const base = (p: PtMm) => meanValueMove(cage, p);
  let contourReach = 0;
  for (let i = 0; i < cage.p.length; i++)
    contourReach = Math.max(contourReach, Math.hypot(cage.dx[i], cage.dy[i]));
  const rim = segmentsAlong(cage.p, true);
  let lines: Anchor[][] = pairLines(
    baseLines,
    targetLines,
    (p) => {
      const d = base(p);
      return { x: p.x + d.x, y: p.y + d.y };
    },
    contourReach,
  )
    .map(([from, to, closed]) => {
      const out: Anchor[] = [];
      const n = from.length;
      const across = !closed && isStraight(from) && isStraight(to);
      for (let i = 0; i < (closed ? n : n - 1); i++) {
        const j = (i + 1) % n;
        const len = Math.hypot(from[j].x - from[i].x, from[j].y - from[i].y);
        if (!(len > 1e-9)) continue;
        const di = { x: to[i].x - from[i].x, y: to[i].y - from[i].y };
        const dj = { x: to[j].x - from[j].x, y: to[j].y - from[j].y };
        const k = Math.ceil(len / ANCHOR_STEP_MM);
        for (let s = 0; s < k; s++) {
          const a = lerpPt(from[i], from[j], s / k);
          const b = lerpPt(from[i], from[j], (s + 1) / k);
          const da = lerpPt(di, dj, s / k);
          const db = lerpPt(di, dj, (s + 1) / k);
          const ba = base(a);
          const bb = base(b);
          out.push({
            a,
            b,
            da,
            db,
            ra: { x: da.x - ba.x, y: da.y - ba.y },
            rb: { x: db.x - bb.x, y: db.y - bb.y },
            len: len / k,
            across,
            nx: -(from[j].y - from[i].y) / len,
            ny: (from[j].x - from[i].x) / len,
          });
        }
      }
      return out;
    })
    .filter((line) => line.length > 0);

  const fieldOf = (kept: Anchor[][]) => {
    const anchors = kept.flat();
    let reach = contourReach;
    for (const s of anchors)
      reach = Math.max(reach, Math.hypot(s.da.x, s.da.y), Math.hypot(s.db.x, s.db.y));
    const move = (p: PtMm): PtMm => {
      const b = base(p);
      if (!anchors.length) return b;
      // Weighted least squares of the residual R: Σ w·|P(R − r)|², P = identity for a full anchor
      // and n·nᵀ for a straight line's; the contour (residual zero) weighs in as identity.
      let mxx = 0;
      let mxy = 0;
      let myy = 0;
      let vx = 0;
      let vy = 0;
      /** A straight line the point sits on: its normal residual holds exactly. */
      let pin: { nx: number; ny: number; value: number } | null = null;
      for (const s of anchors) {
        const abx = s.b.x - s.a.x;
        const aby = s.b.y - s.a.y;
        const t = Math.max(
          0,
          Math.min(1, ((p.x - s.a.x) * abx + (p.y - s.a.y) * aby) / (abx * abx + aby * aby)),
        );
        const r2 = (p.x - s.a.x - abx * t) ** 2 + (p.y - s.a.y - aby * t) ** 2;
        const rx = s.ra.x + (s.rb.x - s.ra.x) * t;
        const ry = s.ra.y + (s.rb.y - s.ra.y) * t;
        if (r2 < 1e-12) {
          // On a bent or closed line the point moves exactly with it.
          if (!s.across)
            return { x: s.da.x + (s.db.x - s.da.x) * t, y: s.da.y + (s.db.y - s.da.y) * t };
          pin ??= { nx: s.nx, ny: s.ny, value: rx * s.nx + ry * s.ny };
          continue;
        }
        const w = s.len / (r2 * Math.sqrt(r2));
        if (s.across) {
          const along = w * (rx * s.nx + ry * s.ny);
          mxx += w * s.nx * s.nx;
          mxy += w * s.nx * s.ny;
          myy += w * s.ny * s.ny;
          vx += along * s.nx;
          vy += along * s.ny;
        } else {
          mxx += w;
          myy += w;
          vx += w * rx;
          vy += w * ry;
        }
      }
      for (const s of rim) {
        const abx = s.b.x - s.a.x;
        const aby = s.b.y - s.a.y;
        const ll = abx * abx + aby * aby;
        const t = Math.max(0, Math.min(1, ((p.x - s.a.x) * abx + (p.y - s.a.y) * aby) / ll));
        const r2 = (p.x - s.a.x - abx * t) ** 2 + (p.y - s.a.y - aby * t) ** 2;
        if (r2 < 1e-12) return b;
        const w = Math.sqrt(ll) / (r2 * Math.sqrt(r2));
        mxx += w;
        myy += w;
      }
      const det = mxx * myy - mxy * mxy;
      let rx = det > 0 ? (vx * myy - vy * mxy) / det : 0;
      let ry = det > 0 ? (vy * mxx - vx * mxy) / det : 0;
      if (pin) {
        const gap = pin.value - (rx * pin.nx + ry * pin.ny);
        rx += gap * pin.nx;
        ry += gap * pin.ny;
      }
      const out = { x: b.x + rx, y: b.y + ry };
      // A safety bound only: no point moves farther than the farthest anchor.
      const size = Math.hypot(out.x, out.y);
      return size > reach ? { x: (out.x * reach) / size, y: (out.y * reach) / size } : out;
    };
    return { reach, move };
  };

  // Fold-over: round every paired line the map p → p + move(p) must keep its orientation. The
  // line with the largest residual among the offenders is dropped until none offends.
  for (;;) {
    const field = fieldOf(lines);
    const offenders = lines.filter((line) =>
      line.some((s, k) => {
        if (k % 2) return false;
        const mid = lerpPt(s.a, s.b, 0.5);
        const nx = -(s.b.y - s.a.y) / s.len;
        const ny = (s.b.x - s.a.x) / s.len;
        return [-1, 1].some(
          (side) =>
            jacobianDet(field.move, { x: mid.x + nx * side, y: mid.y + ny * side }) < MIN_FOLD_DET,
        );
      }),
    );
    if (!offenders.length) return { match, lines, ...field };
    const residual = (line: Anchor[]) =>
      Math.max(
        ...line.map((s) => Math.max(Math.hypot(s.ra.x, s.ra.y), Math.hypot(s.rb.x, s.rb.y))),
      );
    const worst = offenders.reduce((x, y) => (residual(y) > residual(x) ? y : x));
    lines = lines.filter((line) => line !== worst);
  }
}

/** det of the Jacobian of p → p + move(p), by central differences. */
function jacobianDet(move: (p: PtMm) => PtMm, p: PtMm, h = 0.25): number {
  const [a, b, c, d] = jacobian(move, p, h);
  return a * d - b * c;
}

function jacobian(move: (p: PtMm) => PtMm, p: PtMm, h: number): [number, number, number, number] {
  const xp = move({ x: p.x + h, y: p.y });
  const xm = move({ x: p.x - h, y: p.y });
  const yp = move({ x: p.x, y: p.y + h });
  const ym = move({ x: p.x, y: p.y - h });
  return [
    1 + (xp.x - xm.x) / (2 * h),
    (yp.x - ym.x) / (2 * h),
    (xp.y - xm.y) / (2 * h),
    1 + (yp.y - ym.y) / (2 * h),
  ];
}

function centroidOf(ring: readonly PtMm[]): PtMm {
  let twice = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % ring.length];
    const cross = a.x * b.y - b.x * a.y;
    twice += cross;
    cx += (a.x + b.x) * cross;
    cy += (a.y + b.y) * cross;
  }
  if (Math.abs(twice) > 1e-9) return { x: cx / (3 * twice), y: cy / (3 * twice) };
  return centroidOfPoints(ring.length ? ring : [{ x: 0, y: 0 }]);
}

/**
 * The one translation of a detached ring: the mean move of the internal lines it covers (a patch
 * drawn round a welt goes where the welt goes), else of the parts of lines crossing it, else the
 * field's move at its centroid.
 */
function shiftOfRing(field: GradeField, ring: readonly PtMm[]): PtMm {
  const covered: Anchor[] = [];
  const crossing: Anchor[] = [];
  if (ring.length >= 3)
    for (const line of field.lines) {
      const inside = line.filter((s) => pointInRing(lerpPt(s.a, s.b, 0.5), ring as PtMm[]));
      if (!inside.length) continue;
      if (
        inside.length === line.length &&
        line.every((s) => pointInRing(s.a, ring as PtMm[]) && pointInRing(s.b, ring as PtMm[]))
      )
        covered.push(...line);
      else crossing.push(...inside);
    }
  const pick = covered.length ? covered : crossing;
  if (!pick.length) return field.move(centroidOf(ring));
  let len = 0;
  let x = 0;
  let y = 0;
  for (const s of pick) {
    len += s.len;
    x += (s.len * (s.da.x + s.db.x)) / 2;
    y += (s.len * (s.da.y + s.db.y)) / 2;
  }
  return { x: x / len, y: y / len };
}

/**
 * q = p + move(p) solved for p by damped Newton (the map stretches where an ungraded line sits in a
 * growing piece, so the plain fixed point does not contract there). null when it does not land
 * within INVERSE_TOLERANCE_MM.
 */
function invertPoint(move: (p: PtMm) => PtMm, q: PtMm): PtMm | null {
  const miss = (p: PtMm) => {
    const d = move(p);
    return { x: p.x + d.x - q.x, y: p.y + d.y - q.y };
  };
  const first = move(q);
  let p = { x: q.x - first.x, y: q.y - first.y };
  let e = miss(p);
  let err = Math.hypot(e.x, e.y);
  for (let iter = 0; iter < 40 && err > 1e-7; iter++) {
    const [a, b, c, d] = jacobian(move, p, 0.05);
    const det = a * d - b * c;
    // A singular Jacobian: the plain fixed-point step still moves towards the answer.
    const step =
      Math.abs(det) > 1e-6
        ? { x: (d * e.x - b * e.y) / det, y: (a * e.y - c * e.x) / det }
        : { x: e.x, y: e.y };
    let scale = 1;
    let next = p;
    let nextE = e;
    let nextErr = Infinity;
    for (let cut = 0; cut < 8; cut++) {
      next = { x: p.x - step.x * scale, y: p.y - step.y * scale };
      nextE = miss(next);
      nextErr = Math.hypot(nextE.x, nextE.y);
      if (nextErr < err) break;
      scale /= 2;
    }
    if (!(nextErr < err)) break;
    [p, e, err] = [next, nextE, nextErr];
  }
  return err <= INVERSE_TOLERANCE_MM ? p : null;
}

function smoothstep(from: number, to: number, value: number): number {
  const t = Math.max(0, Math.min(1, (value - from) / (to - from)));
  return t * t * (3 - 2 * t);
}

/**
 * The carrier's share at a point: 1 outside the piece and up to KEEP_MM_NEAR in, 0 from
 * GRADE_FROM_MM; then scaled down where a paired internal line is nearer than the contour (by the
 * ratio of the distances, the line's softened by LINE_LEAD_SOFT_MM), so a point on a line moves with it.
 */
function followOf(
  match: ContourMatch,
  carry: (p: PtMm) => PtMm,
  field: () => GradeField,
): (p: PtMm) => PtMm {
  const ring = match.base.ring;
  return (p) => {
    let held = 1;
    let dc = 0;
    if (pointInRing(p, ring)) {
      dc = distanceToPolyline(p, ring, true);
      held = 1 - smoothstep(KEEP_MM_NEAR, GRADE_FROM_MM, dc);
    }
    if (dc > 0) {
      const lines = field().lines;
      let dl = Infinity;
      for (const line of lines)
        for (const s of line) dl = Math.min(dl, distanceToPolyline(p, [s.a, s.b], false));
      if (dl < Infinity) held *= smoothstep(0.5, 1.5, (dl + LINE_LEAD_SOFT_MM) / dc);
    }
    if (held >= 1) return carry(p);
    const d = field().move(p);
    const inner = { x: p.x + d.x, y: p.y + d.y };
    if (held <= 0) return inner;
    return lerpPt(inner, carry(p), held);
  };
}

export type ZoneGrade = {
  /** The contour correspondence; null when an outline is not a ring. */
  match: ContourMatch | null;
  /** A point on (or right next to) the contour: its mm off the contour stretches kept. */
  carry: (point: PtMm) => PtMm;
  /** A point inside the piece: the interpolated grade. */
  point: (point: PtMm) => PtMm;
  /**
   * A point of a ring that is not moved whole: near the contour the carrier (keeps its mm), deep
   * inside the field, whichever is nearer — the contour or a paired internal line — leading.
   */
  follow: (point: PtMm) => PtMm;
  /** The translation that carries a whole detached ring. */
  shift: (ring: readonly PtMm[]) => PtMm;
};

const cache = new WeakMap<
  readonly PtMm[],
  { target: readonly PtMm[]; internals: FuseInternals | null | undefined; grade: ZoneGrade }[]
>();

/**
 * The size mapping between two outlines. The field is built from the smaller outline and inverted
 * the other way, so base → size → base returns the stored points.
 */
export function zoneGrade(
  baseOutline: readonly PtMm[],
  targetOutline: readonly PtMm[],
  internals?: FuseInternals | null,
): ZoneGrade {
  const known = cache.get(baseOutline) ?? [];
  const hit = known.find((k) => k.target === targetOutline && k.internals === internals);
  if (hit) return hit.grade;
  // The same outlines often arrive as fresh arrays (a size row rebuilt per render): key by content.
  const key = contentKey(baseOutline, targetOutline, internals);
  let grade = byContent.get(key);
  if (grade) byContent.delete(key);
  else grade = buildZoneGrade(baseOutline, targetOutline, internals);
  byContent.set(key, grade);
  if (byContent.size > CONTENT_CACHE_SIZE) byContent.delete(byContent.keys().next().value!);
  cache.set(baseOutline, [...known.slice(-7), { target: targetOutline, internals, grade }]);
  return grade;
}

/**
 * How many internal lines the grade field pairs and keeps base → target (read only: the grade-map
 * survey compares its own pairing with it). Built the asked way round; 0 when an outline is no ring.
 */
export function pairedInternalLineCount(
  baseOutline: readonly PtMm[],
  targetOutline: readonly PtMm[],
  internals: FuseInternals,
): number {
  const built = buildContourMatch(baseOutline, targetOutline);
  return built ? buildField(built, internals.base, internals.target).lines.length : 0;
}

const CONTENT_CACHE_SIZE = 16;
/** Least recently used last out: Map keeps insertion order, a hit is re-inserted. */
const byContent = new Map<string, ZoneGrade>();

function contentKey(
  baseOutline: readonly PtMm[],
  targetOutline: readonly PtMm[],
  internals?: FuseInternals | null,
): string {
  const ring = (points: readonly PtMm[]) => points.map((p) => `${p.x},${p.y}`).join(' ');
  const lines = (list: readonly FuseInternalLine[]) =>
    list.map((l) => `${l.layer}|${l.closed ? 1 : 0}|${ring(l.points)}`).join(';');
  return [
    ring(baseOutline),
    ring(targetOutline),
    internals ? `${lines(internals.base)}#${lines(internals.target)}` : '-',
  ].join('/');
}

function buildZoneGrade(
  baseOutline: readonly PtMm[],
  targetOutline: readonly PtMm[],
  internals: FuseInternals | null | undefined,
): ZoneGrade {
  const forward = buildsFrom(baseOutline, targetOutline);
  const built = forward
    ? buildContourMatch(baseOutline, targetOutline)
    : buildContourMatch(targetOutline, baseOutline);
  if (!built) {
    // Not a ring: the bbox frames are all there is.
    const from = boxOf(baseOutline);
    const to = boxOf(targetOutline);
    const sx = from.maxX > from.minX ? (to.maxX - to.minX) / (from.maxX - from.minX) : 0;
    const sy = from.maxY > from.minY ? (to.maxY - to.minY) / (from.maxY - from.minY) : 0;
    const frame = (p: PtMm) => ({
      x: to.minX + (p.x - from.minX) * sx,
      y: to.minY + (p.y - from.minY) * sy,
    });
    return {
      match: null,
      carry: frame,
      point: frame,
      follow: frame,
      shift: (ring) => {
        const c = centroidOf(ring);
        const moved = frame(c);
        return { x: moved.x - c.x, y: moved.y - c.y };
      },
    };
  }
  const baseLines = internals?.base ?? [];
  const targetLines = internals?.target ?? [];
  let field: GradeField | null = null;
  const canonical = () =>
    (field ??= forward
      ? buildField(built, baseLines, targetLines)
      : buildField(built, targetLines, baseLines));
  const match = forward ? built : invertMatch(built);
  // The carrier too is built from the smaller outline; the other way round it is solved for, so a
  // contour point returns where it was. Where the solver fails, the carrier read the asked way.
  const builtCarry = contourCarrier(built);
  const askedCarry = forward ? builtCarry : contourCarrier(match);
  const carry = forward
    ? builtCarry
    : (q: PtMm): PtMm => {
        const p = invertPoint((x) => {
          const y = builtCarry(x);
          return { x: y.x - x.x, y: y.y - x.y };
        }, q);
        return p ?? askedCarry(q);
      };
  const builtFollow = followOf(built, builtCarry, canonical);
  if (forward)
    return {
      match,
      carry,
      point: (p) => {
        const d = canonical().move(p);
        return { x: p.x + d.x, y: p.y + d.y };
      },
      follow: builtFollow,
      shift: (ring) => shiftOfRing(canonical(), ring),
    };
  // The asked direction runs against the built one. A point the solver cannot return goes through
  // the field built the asked way round (its own pairing and residuals, not an exact inverse).
  let direct: GradeField | null = null;
  const asked = () => (direct ??= buildField(match, baseLines, targetLines));
  const point = (q: PtMm): PtMm => {
    const p = invertPoint(canonical().move, q);
    if (p) return p;
    const d = asked().move(q);
    return { x: q.x + d.x, y: q.y + d.y };
  };
  // Carrier and field are mixed on the built side, by distances read there, and solved for the
  // other way round: base → size → base returns even where the mix is partial.
  const askedFollow = followOf(match, askedCarry, asked);
  const follow = (q: PtMm): PtMm =>
    invertPoint((x) => {
      const y = builtFollow(x);
      return { x: y.x - x.x, y: y.y - x.y };
    }, q) ?? askedFollow(q);
  return {
    match,
    carry,
    point,
    follow,
    shift: (ring) => {
      // ring = moved + s, moved the ring on the field's own side: s = shiftOfRing(ring − s).
      let guess = { x: 0, y: 0 };
      for (let k = 0; k < 48; k++) {
        const next = shiftOfRing(
          canonical(),
          ring.map((q) => ({ x: q.x - guess.x, y: q.y - guess.y })),
        );
        const step = Math.hypot(next.x - guess.x, next.y - guess.y);
        guess = next;
        if (step < 1e-7) return { x: -guess.x, y: -guess.y };
      }
      // No fixed point (the ring's covered lines change as it moves): the centroid's own inverse.
      const c = centroidOf(ring);
      const back = point(c);
      return { x: back.x - c.x, y: back.y - c.y };
    },
  };
}
