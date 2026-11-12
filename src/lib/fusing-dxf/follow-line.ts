import type { PtMm } from 'lib/pattern-import/types';
import type { FuseInternalLine } from './dxf';

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

const chord = (w: Walk) => {
  const a = w.points[0];
  const b = w.points[w.points.length - 1];
  return { x: b.x - a.x, y: b.y - a.y };
};

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
 * «Follow line»: the rigid move (travel + turn, never a scale) that carries a ring tied to the
 * internal line nearest to `anchor` from one size to another. The line's twin on the other size is
 * the line of the same layer and closure at the same place in the file's order; the anchor keeps its
 * share of the line's length, and the ring turns by as much as the line did (an open line by its
 * chord, a closed one by its side under the anchor). Null when the twin cannot be told: the caller
 * then carries the ring the default way.
 */
export function followLineMove(
  anchor: PtMm,
  baseLines: readonly FuseInternalLine[],
  targetLines: readonly FuseInternalLine[],
): ((point: PtMm) => PtMm) | null {
  const index = nearestInternalLine(anchor, baseLines);
  if (index < 0) return null;
  const line = baseLines[index];
  const alike = (l: FuseInternalLine) =>
    l.layer === line.layer && l.closed === line.closed && l.points.length >= 2;
  const twins = targetLines.filter(alike);
  if (twins.length !== baseLines.filter(alike).length) return null;
  const twin = twins[baseLines.slice(0, index).filter(alike).length];
  const from = walkOf(line);
  let to = walkOf(twin);
  if (!line.closed) {
    // The other size's file may list the same line end first.
    const [a, b] = [chord(from), chord(to)];
    if (a.x * b.x + a.y * b.y < 0) to = walkOf(twin, true);
  }
  if (from.total < 1e-6 || to.total < 1e-6) return null;
  const on = projectOn(from, anchor);
  const was = at(from, on.at);
  const now = at(to, (on.at / from.total) * to.total);
  const [c0, c1] = [chord(from), chord(to)];
  const turn = line.closed ? now.dir - was.dir : Math.atan2(c1.y, c1.x) - Math.atan2(c0.y, c0.x);
  const [cos, sin] = [Math.cos(turn), Math.sin(turn)];
  return (p) => ({
    x: now.p.x + (p.x - was.p.x) * cos - (p.y - was.p.y) * sin,
    y: now.p.y + (p.x - was.p.x) * sin + (p.y - was.p.y) * cos,
  });
}
