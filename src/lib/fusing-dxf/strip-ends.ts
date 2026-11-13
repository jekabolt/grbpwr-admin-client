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

/** A notch-mode end farther than this from every base notch has no notch to keep. */
export const NOTCH_PICK_MM = 30;

/** One strip edge on the base size and the run it pairs with on another size. */
export type StripEndPair = {
  baseRun: EdgeRun;
  run: EdgeRun;
  /** The size's ring runs the other way: the base run's start pairs with this run's end. */
  reversed: boolean;
  baseLines: readonly FuseInternalLine[];
  lines: readonly FuseInternalLine[];
};

/**
 * One strip end's trim on another size, mm from the corner that pairs with the base end's corner.
 * `guessed`: a notch end found no notch to keep (none near the trim on the base, or the size's run
 * has a different count) and kept the mm; the sheet is still built, the caller reports it.
 */
export function carryStripEnd(
  mm: number,
  mode: 'notch' | 'share' | undefined,
  atStart: boolean,
  pair: StripEndPair,
): { mm: number; guessed: boolean } {
  const { baseRun, run, reversed } = pair;
  if (!mode) return { mm, guessed: false };
  if (mode === 'share')
    return { mm: baseRun.length > 0 ? (mm / baseRun.length) * run.length : mm, guessed: false };
  const was = notchesOnRun(baseRun, pair.baseLines);
  const now = notchesOnRun(run, pair.lines);
  const trim = atStart ? mm : baseRun.length - mm;
  const k = nearestNotch(was, trim);
  // The same notch only while both sizes have the same notches on this run.
  if (k < 0 || Math.abs(was[k] - trim) > NOTCH_PICK_MM || was.length !== now.length)
    return { mm, guessed: true };
  const at = now[reversed ? now.length - 1 - k : k];
  return { mm: atStart !== reversed ? at : run.length - at, guessed: false };
}
