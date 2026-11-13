// Grade map · what the lines of one size are: notches (layer 4), drills (small closed marks, a
// cross of two strokes counted once), internal lines (the rest).

import type { PtMm } from 'lib/pattern-import/types';
import { bboxOf, centroidOf, dist, pathOf, project, type Path } from './geom';
import type { GmLine } from './types';

export const NOTCH_LAYER = '4';
/** A closed mark this small (bbox side, mm) is a drill: circles of 10–20 mm, 10 mm squares/crosses. */
export const DRILL_MAX_MM = 20;
/** Drill strokes whose centres are this close are one drill (the two strokes of a cross). */
const DRILL_MERGE_MM = 1;
/** A notch end this close to the cut sits on the cut. */
export const ON_CUT_MM = 0.5;
/** Shorter internal lines are noise. */
const MIN_LINE_MM = 0.5;

/** A notch: a = the end on the cut (else the first end), arc = a's place on the cut or null. */
export type Notch = { idx: number; a: PtMm; b: PtMm; arc: number | null };
export type Drill = { idx: number[]; c: PtMm };
export type Internal = { idx: number; line: GmLine; path: Path };
export type SizeMarks = { notches: Notch[]; drills: Drill[]; internals: Internal[] };

export function isDrillMark(line: GmLine): boolean {
  if (!line.closed || line.layer === NOTCH_LAYER || !line.points.length) return false;
  const b = bboxOf(line.points);
  return Math.max(b.maxX - b.minX, b.maxY - b.minY) <= DRILL_MAX_MM;
}

export function drillsOf(lines: readonly GmLine[]): Drill[] {
  const drills: { idx: number[]; pts: PtMm[] }[] = [];
  lines.forEach((line, idx) => {
    if (!isDrillMark(line)) return;
    const c = centroidOf(line.points);
    const near = drills.find((d) => dist(centroidOf(d.pts), c) <= DRILL_MERGE_MM);
    if (near) {
      near.idx.push(idx);
      near.pts.push(c);
    } else drills.push({ idx: [idx], pts: [c] });
  });
  return drills.map((d) => ({ idx: d.idx, c: centroidOf(d.pts) }));
}

export function notchesOf(lines: readonly GmLine[], cut: Path | null): Notch[] {
  const out: Notch[] = [];
  lines.forEach((line, idx) => {
    if (line.layer !== NOTCH_LAYER || line.points.length < 2) return;
    let a = line.points[0];
    let b = line.points[line.points.length - 1];
    if (!cut) {
      out.push({ idx, a, b, arc: null });
      return;
    }
    let pa = project(cut, a);
    const pb = project(cut, b);
    if (pb.d < pa.d) {
      [a, b] = [b, a];
      pa = pb;
    }
    out.push({ idx, a, b, arc: pa.d <= ON_CUT_MM ? pa.s : null });
  });
  return out;
}

export function classify(lines: readonly GmLine[], cut: Path | null): SizeMarks {
  const internals: Internal[] = [];
  lines.forEach((line, idx) => {
    if (line.layer === NOTCH_LAYER || isDrillMark(line)) return;
    const path = pathOf(line.points, line.closed);
    if (path && path.total >= MIN_LINE_MM) internals.push({ idx, line, path });
  });
  return { notches: notchesOf(lines, cut), drills: drillsOf(lines), internals };
}
