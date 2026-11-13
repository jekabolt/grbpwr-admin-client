import type { FuseInternalLine } from './dxf';
import {
  pointOnEdgeRun,
  polylineLength,
  projectPointToEdgeRun,
  type EdgePoint,
  type EdgeRun,
} from './edge-runs';

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
  /**
   * Optional, from the grade map's notch track: a base notch's point on the cut → its twin on this
   * size, or null when the map has none it trusts. A hit on this run is the notch kept; a miss falls
   * back to pairing the run's notches by order.
   */
  resolveNotch?: NotchResolver;
};

/** A base notch's point on the cut → the same notch on another size, null = unknown. */
export type NotchResolver = (baseNotch: EdgePoint) => EdgePoint | null;

/** A resolved notch farther than this from the paired run sits on another run: a miss. */
export const NOTCH_RESOLVED_ON_RUN_MM = 3;

/**
 * One strip end's trim on another size, mm from the corner that pairs with the base end's corner.
 * A notch end keeps the notch the map resolves (`pair.resolveNotch`), else the one of the same order.
 * `guessed`: a notch end found no notch to keep (none near the trim on the base, or no map hit and
 * the size's run has a different count) and kept the mm; the sheet is still built, the caller reports it.
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
  if (k < 0 || Math.abs(was[k] - trim) > NOTCH_PICK_MM) return { mm, guessed: true };
  const fromCorner = (at: number) => ({
    mm: atStart !== reversed ? at : run.length - at,
    guessed: false,
  });
  const resolved = pair.resolveNotch?.(pointOnEdgeRun(baseRun, was[k]).point);
  if (resolved) {
    const on = projectPointToEdgeRun(run, resolved);
    if (Math.hypot(on.point.x - resolved.x, on.point.y - resolved.y) <= NOTCH_RESOLVED_ON_RUN_MM) {
      // Exactly on the size's own notch when one is there.
      const near = nearestNotch(now, on.distance);
      const snap = near >= 0 && Math.abs(now[near] - on.distance) <= NOTCH_ON_CONTOUR_MM;
      return fromCorner(snap ? now[near] : on.distance);
    }
  }
  // The same notch only while both sizes have the same notches on this run.
  if (was.length !== now.length) return { mm, guessed: true };
  return fromCorner(now[reversed ? now.length - 1 - k : k]);
}
