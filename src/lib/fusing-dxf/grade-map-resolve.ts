// The grade map's answers for the two carry modes that look one mark up: a follow_line ring asks
// for its line's twin (follow-line.ts LineByMap), a notch strip end for its notch's twin
// (strip-ends.ts NotchResolver). Both read the same binding as the zone carry (markBinding), so a
// track refused there, or bound twice, is refused here too, and the way back is the pair swapped.
import type { PtMm } from 'lib/pattern-import/types';
import type { FuseInternalLine, FuseInternals } from './dxf';
import type { LineByMap } from './follow-line';
import {
  carriedOn,
  markBinding,
  summarized,
  type GradeMapPair,
  type MarkBinding,
} from './grade-map-pair';
import type { NotchResolver } from './strip-ends';

/** A strip end's notch point sits on the cut within this of its notch line (strip-ends' rule). */
const NOTCH_FROM_MM = 1.6;
/** strip-ends counts an open line this long or shorter as a notch. */
const NOTCH_MAX_MM = 30;

function bindingOf(
  pair: GradeMapPair | null | undefined,
  baseOutline: readonly PtMm[],
  targetOutline: readonly PtMm[],
  internals: FuseInternals | null | undefined,
): MarkBinding | null {
  if (!pair || pair.from === pair.to) return null;
  try {
    return markBinding(pair, baseOutline, targetOutline, internals);
  } catch {
    // An unreadable map is no map: the carry goes the way it goes without one.
    return null;
  }
}

/**
 * The map's twin of a line of the size carried from, point i onto point i; undefined without a map.
 * A line the map does not carry answers null and the ring falls back to the zone's own line pairs.
 */
export function gradeMapLines(
  pair: GradeMapPair | null | undefined,
  baseOutline: readonly PtMm[],
  targetOutline: readonly PtMm[],
  internals: FuseInternals | null | undefined,
): LineByMap | undefined {
  const binding = bindingOf(pair, baseOutline, targetOutline, internals);
  if (!binding) return undefined;
  return {
    lines: binding.fromSide.lines,
    resolve: (line: FuseInternalLine) => {
      const i = binding.fromSide.lines.indexOf(line);
      if (i < 0) return null;
      const hit = binding.accepted.find((a) => a.fb.idx.includes(i));
      if (!hit) return null;
      const { fb, tb } = hit;
      if ('line' in fb && 'line' in tb)
        return line.points.map((p) => carriedOn(fb.line, tb.line, p));
      if ('point' in fb && 'point' in tb) {
        const dx = tb.point.x - fb.point.x;
        const dy = tb.point.y - fb.point.y;
        return line.points.map((p) => ({ x: p.x + dx, y: p.y + dy }));
      }
      return null;
    },
  };
}

export type NotchesByMap = {
  resolveNotch: NotchResolver;
  /** Reports the notch ends the map could not answer as one approximate call; once, at the end. */
  done: () => void;
};

/**
 * The map's twin of a notch on the cut of the size carried from: the point the notch line's twin
 * meets the target cut at; undefined without a map. A miss answers null (strip-ends then pairs the
 * run's notches by order) and makes the size approximate.
 */
export function gradeMapNotches(
  pair: GradeMapPair | null | undefined,
  baseOutline: readonly PtMm[],
  targetOutline: readonly PtMm[],
  internals: FuseInternals | null | undefined,
): NotchesByMap | undefined {
  const binding = bindingOf(pair, baseOutline, targetOutline, internals);
  if (!binding || !pair) return undefined;
  const misses: string[] = [];
  const near = (line: FuseInternalLine, p: PtMm) =>
    !line.closed &&
    line.points.length >= 2 &&
    [line.points[0], line.points[line.points.length - 1]].some(
      (end) => Math.hypot(end.x - p.x, end.y - p.y) <= NOTCH_FROM_MM,
    );
  return {
    resolveNotch: (p) => {
      let best: { d: number; at: PtMm } | null = null;
      for (const { fb, tb } of binding.accepted) {
        if (!('line' in fb) || !('line' in tb) || fb.line.path.closed) continue;
        if (fb.line.path.total > NOTCH_MAX_MM) continue;
        const ends = [fb.line.path.pts[0], fb.line.path.pts[fb.line.path.pts.length - 1]];
        const d = Math.min(...ends.map((e) => Math.hypot(e.x - p.x, e.y - p.y)));
        if (d <= NOTCH_FROM_MM && (!best || d < best.d))
          best = { d, at: carriedOn(fb.line, tb.line, p) };
      }
      if (best) return best.at;
      const i = binding.fromSide.lines.findIndex((line) => near(line, p));
      const reason = (i >= 0 && binding.refusedAt.get(i)) || 'not traced between these sizes';
      misses.push(`notch at a strip end: ${reason}`);
      return null;
    },
    done: () => {
      if (misses.length) pair.approximate?.(summarized(misses));
      misses.length = 0;
    },
  };
}
