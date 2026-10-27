import type { Pt } from '../types';

export type GrainSegment = { a: Pt; b: Pt };

const EPS = 1e-9;
const OFFSET_SAMPLES = 64;

const cross = (ax: number, ay: number, bx: number, by: number) => ax * by - ay * bx;
const dot = (a: Pt, b: Pt) => a.x * b.x + a.y * b.y;

function onSegment(p: Pt, a: Pt, b: Pt): boolean {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const scale = Math.max(1, Math.abs(dx), Math.abs(dy));
  if (Math.abs(cross(p.x - a.x, p.y - a.y, dx, dy)) > EPS * scale) return false;
  return (
    p.x >= Math.min(a.x, b.x) - EPS &&
    p.x <= Math.max(a.x, b.x) + EPS &&
    p.y >= Math.min(a.y, b.y) - EPS &&
    p.y <= Math.max(a.y, b.y) + EPS
  );
}

function inRing(p: Pt, ring: readonly Pt[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[j];
    const b = ring[i];
    if (onSegment(p, a, b)) return true;
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) {
      inside = !inside;
    }
  }
  return inside;
}

/** Even-odd fill across the rings: one outer ring works, and nested rings behave as holes. */
function inOutline(p: Pt, rings: readonly (readonly Pt[])[]): boolean {
  let inside = false;
  for (const ring of rings) {
    if (ring.some((q, i) => onSegment(p, q, ring[(i + 1) % ring.length]))) return true;
    if (inRing(p, ring)) inside = !inside;
  }
  return inside;
}

type Interval = { t0: number; t1: number };

/** Filled intervals of one infinite line through `origin` along unit vector `u`. */
function lineIntervals(origin: Pt, u: Pt, rings: readonly (readonly Pt[])[]): Interval[] {
  const ts: number[] = [];
  for (const ring of rings) {
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i];
      const b = ring[(i + 1) % ring.length];
      const ex = b.x - a.x;
      const ey = b.y - a.y;
      const ax = a.x - origin.x;
      const ay = a.y - origin.y;
      const den = cross(u.x, u.y, ex, ey);
      if (Math.abs(den) <= EPS) {
        if (Math.abs(cross(ax, ay, u.x, u.y)) <= EPS) {
          ts.push(ax * u.x + ay * u.y, (b.x - origin.x) * u.x + (b.y - origin.y) * u.y);
        }
        continue;
      }
      const edgeT = cross(ax, ay, u.x, u.y) / den;
      if (edgeT < -EPS || edgeT > 1 + EPS) continue;
      ts.push(cross(ax, ay, ex, ey) / den);
    }
  }
  ts.sort((a, b) => a - b);
  const unique = ts.filter((t, i) => i === 0 || Math.abs(t - ts[i - 1]) > EPS);
  const out: Interval[] = [];
  for (let i = 1; i < unique.length; i++) {
    const t0 = unique[i - 1];
    const t1 = unique[i];
    if (t1 - t0 <= EPS) continue;
    const mid = (t0 + t1) / 2;
    if (!inOutline({ x: origin.x + u.x * mid, y: origin.y + u.y * mid }, rings)) continue;
    const last = out[out.length - 1];
    if (last && Math.abs(last.t1 - t0) <= EPS) last.t1 = t1;
    else out.push({ t0, t1 });
  }
  return out;
}

const longest = (intervals: readonly Interval[]): Interval | null =>
  intervals.reduce<Interval | null>(
    (best, interval) => (!best || interval.t1 - interval.t0 > best.t1 - best.t0 ? interval : best),
    null,
  );

/** Area centroid of the largest ring; the vertex mean when the ring is degenerate. */
function pieceCentre(rings: readonly (readonly Pt[])[]): Pt {
  let best: { area: number; c: Pt } | null = null;
  for (const ring of rings) {
    let a2 = 0;
    let cx = 0;
    let cy = 0;
    for (let i = 0; i < ring.length; i++) {
      const p = ring[i];
      const q = ring[(i + 1) % ring.length];
      const k = cross(p.x, p.y, q.x, q.y);
      a2 += k;
      cx += (p.x + q.x) * k;
      cy += (p.y + q.y) * k;
    }
    const c =
      Math.abs(a2) > EPS
        ? { x: cx / (3 * a2), y: cy / (3 * a2) }
        : {
            x: ring.reduce((s, p) => s + p.x, 0) / ring.length,
            y: ring.reduce((s, p) => s + p.y, 0) / ring.length,
          };
    if (!best || Math.abs(a2) > best.area) best = { area: Math.abs(a2), c };
  }
  return best!.c;
}

function outlineBounds(rings: readonly (readonly Pt[])[]) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const ring of rings)
    for (const p of ring) {
      minX = Math.min(minX, p.x);
      minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x);
      maxY = Math.max(maxY, p.y);
    }
  return { minX, minY, maxX, maxY };
}

/**
 * A display grain constrained to the piece. The source direction is never changed:
 *
 * - the line runs through the piece centre (area centroid), not where the source was drawn;
 * - on a concave outline the chord holding the centre wins, else the longest one;
 * - a centre outside the piece moves the line parallel to its widest sampled chord;
 * - both ends are inset from the boundary;
 * - a shorter source grain keeps its length and sits in the middle of the chord.
 *
 * The function is unit-agnostic. Its output uses the same units and coordinate frame as its input.
 */
export function grainDisplaySegment(
  outlineRings: readonly (readonly Pt[])[],
  grain: GrainSegment,
): GrainSegment | null {
  const rings = outlineRings.filter((ring) => ring.length >= 3);
  const dx = grain.b.x - grain.a.x;
  const dy = grain.b.y - grain.a.y;
  const sourceLength = Math.hypot(dx, dy);
  if (!rings.length || !(sourceLength > EPS)) return null;

  const u = { x: dx / sourceLength, y: dy / sourceLength };
  const n = { x: -u.y, y: u.x };
  const pieceMid = pieceCentre(rings);
  const atOffset = (d: number): Pt => ({
    x: pieceMid.x + n.x * d,
    y: pieceMid.y + n.y * d,
  });

  let offset = 0;
  const through = lineIntervals(pieceMid, u, rings);
  let interval = through.find((iv) => iv.t0 <= EPS && iv.t1 >= -EPS) ?? longest(through);
  if (!interval) {
    const projections = rings
      .flatMap((ring) => ring)
      .map((p) => (p.x - pieceMid.x) * n.x + (p.y - pieceMid.y) * n.y)
      .sort((a, b) => a - b);
    const lo = projections[0];
    const hi = projections[projections.length - 1];
    const candidates = new Set<number>([(lo + hi) / 2]);
    for (let i = 1; i < projections.length; i++) {
      if (projections[i] - projections[i - 1] > EPS)
        candidates.add((projections[i] + projections[i - 1]) / 2);
    }
    for (const ring of rings) {
      const centre = ring.reduce((sum, p) => sum + dot(p, n), 0) / ring.length;
      candidates.add(centre - dot(pieceMid, n));
    }
    for (let i = 1; i < OFFSET_SAMPLES; i++) candidates.add(lo + ((hi - lo) * i) / OFFSET_SAMPLES);

    let best: { offset: number; interval: Interval; length: number } | null = null;
    for (const candidate of candidates) {
      const hit = longest(lineIntervals(atOffset(candidate), u, rings));
      if (!hit) continue;
      const length = hit.t1 - hit.t0;
      if (
        !best ||
        length > best.length + EPS ||
        (Math.abs(length - best.length) <= EPS && Math.abs(candidate) < Math.abs(best.offset))
      ) {
        best = { offset: candidate, interval: hit, length };
      }
    }
    if (!best) return null;
    offset = best.offset;
    interval = best.interval;
  }

  const bounds = outlineBounds(rings);
  const pieceDiagonal = Math.hypot(bounds.maxX - bounds.minX, bounds.maxY - bounds.minY);
  const chordLength = interval.t1 - interval.t0;
  const inset = Math.min(chordLength * 0.2, Math.max(chordLength * 0.08, pieceDiagonal * 0.01));
  let t0 = interval.t0 + inset;
  let t1 = interval.t1 - inset;
  if (t1 - t0 <= EPS) return null;

  if (sourceLength < t1 - t0) {
    const half = sourceLength / 2;
    const centre = (t0 + t1) / 2;
    t0 = centre - half;
    t1 = centre + half;
  }

  const origin = atOffset(offset);
  return {
    a: { x: origin.x + u.x * t0, y: origin.y + u.y * t0 },
    b: { x: origin.x + u.x * t1, y: origin.y + u.y * t1 },
  };
}

export function grainArrowGeometry(
  segment: GrainSegment,
  requestedHeadLength: number,
): { shaft: GrainSegment; heads: [Pt[], Pt[]] } | null {
  const dx = segment.b.x - segment.a.x;
  const dy = segment.b.y - segment.a.y;
  const length = Math.hypot(dx, dy);
  if (!(length > EPS)) return null;
  const u = { x: dx / length, y: dy / length };
  const n = { x: -u.y, y: u.x };
  const headLength = Math.min(requestedHeadLength, length * 0.32);
  const halfWidth = headLength * 0.42;
  const head = (tip: Pt, inward: Pt): Pt[] => {
    const base = { x: tip.x + inward.x * headLength, y: tip.y + inward.y * headLength };
    return [
      tip,
      { x: base.x + n.x * halfWidth, y: base.y + n.y * halfWidth },
      { x: base.x - n.x * halfWidth, y: base.y - n.y * halfWidth },
    ];
  };
  return {
    shaft: segment,
    heads: [head(segment.a, u), head(segment.b, { x: -u.x, y: -u.y })],
  };
}

/** A text box: unit reading direction and half sizes along / across it. */
export type LabelBox = { dir: Pt; halfW: number; halfH: number };

/**
 * Moves a label centre off the grain arrow, across it, just far enough that the box clears the
 * shaft by `gap`. The side the centre already leans to wins; the other side is tried when that one
 * leaves `ring`. A label that does not touch the arrow, or fits on neither side, stays put.
 */
export function labelBesideGrain(
  centre: Pt,
  segment: GrainSegment,
  box: LabelBox,
  gap: number,
  ring?: readonly Pt[],
): Pt {
  const len = Math.hypot(segment.b.x - segment.a.x, segment.b.y - segment.a.y);
  if (len < EPS) return centre;
  const u = { x: (segment.b.x - segment.a.x) / len, y: (segment.b.y - segment.a.y) / len };
  const n = { x: -u.y, y: u.x };
  const across = { x: -box.dir.y, y: box.dir.x };
  const reach = (axis: Pt) =>
    Math.abs(dot(box.dir, axis)) * box.halfW + Math.abs(dot(across, axis)) * box.halfH;
  const rel = { x: centre.x - segment.a.x, y: centre.y - segment.a.y };
  const t = dot(rel, u);
  const alongReach = reach(u);
  if (t < -alongReach || t > len + alongReach) return centre;
  const s = dot(rel, n);
  const need = reach(n) + gap;
  if (Math.abs(s) >= need) return centre;
  const lean = s >= 0 ? 1 : -1;
  for (const side of [lean, -lean]) {
    const shift = side * need - s;
    const p = { x: centre.x + n.x * shift, y: centre.y + n.y * shift };
    if (!ring || inRing(p, ring)) return p;
  }
  return centre;
}
