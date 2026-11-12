import type { FuseInternalLine } from './dxf';
import { polylineLength, projectPointToEdgeRun, type EdgeRun } from './edge-runs';

/** A notch is a short open internal line; longer ones are folds, welts, darts. */
const NOTCH_MAX_LENGTH_MM = 30;
/** One of its ends sits on the cut contour, within this. */
const NOTCH_ON_CONTOUR_MM = 1.5;
/** Two marks this close along a run are one notch. */
const NOTCH_SAME_MM = 0.5;

/**
 * Where the notches of one edge run sit, mm from the run's start, ascending. Read from the internal
 * lines: a pattern file has no notch entity of its own, a notch is a short tick off the contour.
 */
export function notchesOnRun(run: EdgeRun, lines: readonly FuseInternalLine[]): number[] {
  const found: number[] = [];
  for (const line of lines) {
    if (line.closed || line.points.length < 2) continue;
    if (polylineLength(line.points) > NOTCH_MAX_LENGTH_MM) continue;
    let best: { gap: number; at: number } | null = null;
    for (const end of [line.points[0], line.points[line.points.length - 1]]) {
      const on = projectPointToEdgeRun(run, end);
      const gap = Math.hypot(on.point.x - end.x, on.point.y - end.y);
      if (gap <= NOTCH_ON_CONTOUR_MM && (!best || gap < best.gap)) best = { gap, at: on.distance };
    }
    if (best) found.push(best.at);
  }
  found.sort((a, b) => a - b);
  return found.filter((at, i) => i === 0 || at - found[i - 1] > NOTCH_SAME_MM);
}

/** The notch of `notches` nearest to `at`; -1 when there is none. */
export function nearestNotch(notches: readonly number[], at: number): number {
  let best = -1;
  for (let i = 0; i < notches.length; i++)
    if (best < 0 || Math.abs(notches[i] - at) < Math.abs(notches[best] - at)) best = i;
  return best;
}
