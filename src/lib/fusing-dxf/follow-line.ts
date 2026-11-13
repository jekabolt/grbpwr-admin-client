import type { PtMm } from 'lib/pattern-import/types';
import type { FuseInternalLine } from './dxf';
import type { LinePair } from './zone-grade';

type Walk = { points: PtMm[]; cum: number[]; total: number };

function walkOf(line: FuseInternalLine, reversed = false): Walk {
  const open = reversed ? [...line.points].reverse() : line.points;
  const points = line.closed ? [...open, open[0]] : open;
  const cum = [0];
  for (let i = 1; i < points.length; i++)
    cum.push(cum[i - 1] + Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y));
  return { points, cum, total: cum[cum.length - 1] };
}

/** Nearest point of a line to `p`: its arc position and how far off the line `p` is. */
function projectOn(walk: Walk, p: PtMm): { at: number; gap: number } {
  let best = { at: 0, gap: Infinity };
  for (let i = 1; i < walk.points.length; i++) {
    const a = walk.points[i - 1];
    const b = walk.points[i];
    const len = walk.cum[i] - walk.cum[i - 1];
    if (len < 1e-9) continue;
    const t = Math.max(
      0,
      Math.min(1, ((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) / len ** 2),
    );
    const gap = Math.hypot(p.x - a.x - (b.x - a.x) * t, p.y - a.y - (b.y - a.y) * t);
    if (gap < best.gap) best = { at: walk.cum[i - 1] + len * t, gap };
  }
  return best;
}

/** Point and direction (radians) at an arc position. */
function at(walk: Walk, s: number): { p: PtMm; dir: number } {
  let i = 1;
  while (i < walk.points.length - 1 && walk.cum[i] < s) i++;
  const a = walk.points[i - 1];
  const b = walk.points[i];
  const len = walk.cum[i] - walk.cum[i - 1] || 1;
  const t = Math.max(0, Math.min(1, (s - walk.cum[i - 1]) / len));
  return {
    p: { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t },
    dir: Math.atan2(b.y - a.y, b.x - a.x),
  };
}

/**
 * The internal line of `lines` nearest to `anchor`, as its index; -1 when there is none.
 */
export function nearestInternalLine(anchor: PtMm, lines: readonly FuseInternalLine[]): number {
  let best = -1;
  let gap = Infinity;
  lines.forEach((line, i) => {
    if (line.points.length < 2) return;
    const g = projectOn(walkOf(line), anchor).gap;
    if (g < gap) [best, gap] = [i, g];
  });
  return best;
}

/** Shorter open lines are notches and drill marks: nothing a ring is tied to. */
const FOLLOW_LINE_MIN_LENGTH_MM = 30;

/**
 * The internal lines a ring can follow, as indices into `lines`, in the file's order: folds, welts,
 * dart legs, pocket marks — everything but the short ticks.
 */
export function followLineChoices(lines: readonly FuseInternalLine[]): number[] {
  return lines.flatMap((line, i) =>
    line.points.length >= 2 && (line.closed || walkOf(line).total > FOLLOW_LINE_MIN_LENGTH_MM)
      ? [i]
      : [],
  );
}

/** The point of `line` nearest to `near`: where a ring that follows this line is anchored. */
export function anchorOnLine(line: FuseInternalLine, near: PtMm): PtMm {
  const walk = walkOf(line);
  const p = at(walk, projectOn(walk, near).at).p;
  return { x: Math.round(p.x * 10) / 10, y: Math.round(p.y * 10) / 10 };
}

/**
 * The grade map's answer for `followLineMove`. `lines` are the internal lines of the outline the
 * ring is carried from; `resolve` gives a line's twin on the outline it is carried to, from the
 * map's internal / seam track (exact, derived or fitted — a refused track answers null). The twin
 * runs the way its line runs and, closed, starts where it starts; with as many points as the line
 * they pair point i onto point i, otherwise by share of length.
 */
export type LineByMap = {
  lines: readonly FuseInternalLine[];
  resolve: (line: FuseInternalLine) => readonly PtMm[] | null;
};

/** A ring's anchor is picked on its line (0.1 mm rounding), so it sits within this of it. */
const ANCHOR_ON_LINE_MM = 0.5;

/** The line under `anchor` paired with its twin by the map; null on a miss. */
function pairByMap(anchor: PtMm, byMap: LineByMap): LinePair | null {
  const i = nearestInternalLine(anchor, byMap.lines);
  if (i < 0) return null;
  const line = byMap.lines[i];
  if (projectOn(walkOf(line), anchor).gap > ANCHOR_ON_LINE_MM) return null;
  const twin = byMap.resolve(line);
  if (!twin || twin.length < 2) return null;
  const from = line.points;
  if (twin.length === from.length) return { from, to: twin, closed: line.closed };
  // Different point counts: each point of the line goes to the twin's point at the same share of
  // the length (closed lines measured round to their start).
  const own = walkOf(line);
  const other = walkOf({ ...line, points: [...twin] });
  if (own.total < 1e-9 || other.total < 1e-9) return null;
  const to = own.cum.slice(0, from.length).map((s) => at(other, (s / own.total) * other.total).p);
  return { from, to, closed: line.closed };
}

/**
 * «Follow line»: the rigid move (travel + turn, never a scale) that carries a ring tied to a line
 * from one size to another. `pair` is the line with its twin on the other size, point i onto
 * point i, as the grade field's geometric pairing found it — so neither the file's order of lines
 * nor where a closed line starts or which way it runs matters. The anchor's foot on the line goes
 * to the matching point of the twin, and the ring turns as the whole line turned (a least-squares
 * fit over the paired points, weighed alike both ways round, so the move back is the exact
 * inverse). Null without a pair: the caller then carries the ring the default way, as a guess.
 *
 * `byMap`, when given, is asked first: the line the anchor sits on, and its twin as the grade map
 * carries it. A hit replaces `pair`; a miss (the anchor on no line, or the map has no trusted twin)
 * falls back to `pair`. Without `byMap` the result is the same as before it existed.
 */
export function followLineMove(
  anchor: PtMm,
  pair: LinePair | null,
  byMap?: LineByMap,
): ((point: PtMm) => PtMm) | null {
  pair = (byMap && pairByMap(anchor, byMap)) || pair;
  if (!pair) return null;
  const n = Math.min(pair.from.length, pair.to.length);
  if (n < 2) return null;
  const { from, to, closed } = pair;
  // The anchor's foot: segment k, share t.
  let foot = { k: 0, t: 0, gap: Infinity };
  for (let k = 0; k < (closed ? n : n - 1); k++) {
    const a = from[k];
    const b = from[(k + 1) % n];
    const len2 = (b.x - a.x) ** 2 + (b.y - a.y) ** 2;
    const t =
      len2 < 1e-18
        ? 0
        : Math.max(
            0,
            Math.min(1, ((anchor.x - a.x) * (b.x - a.x) + (anchor.y - a.y) * (b.y - a.y)) / len2),
          );
    const gap = Math.hypot(anchor.x - a.x - (b.x - a.x) * t, anchor.y - a.y - (b.y - a.y) * t);
    if (gap < foot.gap) foot = { k, t, gap };
  }
  const lerp = (line: readonly PtMm[]) => {
    const a = line[foot.k];
    const b = line[(foot.k + 1) % n];
    return { x: a.x + (b.x - a.x) * foot.t, y: a.y + (b.y - a.y) * foot.t };
  };
  const was = lerp(from);
  const now = lerp(to);
  const turn = lineTurn(from, to, n, closed);
  const [cos, sin] = [Math.cos(turn), Math.sin(turn)];
  return (p) => ({
    x: now.x + (p.x - was.x) * cos - (p.y - was.y) * sin,
    y: now.y + (p.x - was.x) * sin + (p.y - was.y) * cos,
  });
}

/**
 * The turn (radians) that best carries `from` onto `to`, point i onto point i. Each point weighs
 * half its two segments on both lines, the same either way round, so the turn back is the exact
 * negative.
 */
function lineTurn(from: readonly PtMm[], to: readonly PtMm[], n: number, closed: boolean): number {
  const seg = (line: readonly PtMm[], i: number, j: number) =>
    j < 0 || j >= n ? 0 : Math.hypot(line[j].x - line[i].x, line[j].y - line[i].y);
  const w: number[] = [];
  let sw = 0;
  for (let i = 0; i < n; i++) {
    const prev = closed ? (i + n - 1) % n : i - 1;
    const next = closed ? (i + 1) % n : i + 1;
    const wi = (seg(from, i, prev) + seg(from, i, next) + seg(to, i, prev) + seg(to, i, next)) / 4;
    w.push(wi);
    sw += wi;
  }
  if (sw < 1e-12) return 0;
  const centre = (line: readonly PtMm[]) => {
    let x = 0;
    let y = 0;
    for (let i = 0; i < n; i++) {
      x += w[i] * line[i].x;
      y += w[i] * line[i].y;
    }
    return { x: x / sw, y: y / sw };
  };
  const f = centre(from);
  const t = centre(to);
  let dot = 0;
  let cross = 0;
  for (let i = 0; i < n; i++) {
    const ax = from[i].x - f.x;
    const ay = from[i].y - f.y;
    const bx = to[i].x - t.x;
    const by = to[i].y - t.y;
    dot += w[i] * (ax * bx + ay * by);
    cross += w[i] * (ax * by - ay * bx);
  }
  return dot === 0 && cross === 0 ? 0 : Math.atan2(cross, dot);
}
