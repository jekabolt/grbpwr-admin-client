import type { RegisteredSourceCutStitchV1 } from 'lib/cloth/compiler/source-cut-registered-stitch-pairs-v1';
import type { SavedCompleteNativeStitchAnchorV1 } from './saved-complete-assembly-native-stitch-anchors-v1';
import type { SavedNativeCurveIntervalV1 } from './saved-legacy-native-stitch-run-v8';

type CurveStation = Readonly<{
  intervalOrdinal: number;
  nativeCurveId: string;
  nativeT: number;
}>;

type RegisteredPart = Readonly<{
  partOrdinal: number;
  direction: 'native-forward' | 'native-reversed';
  /** Both stations are in the saved part's original order, before the traversal is applied. */
  range?: Readonly<{ from: CurveStation; to: CurveStation }>;
}>;

export type SavedNativeStitchRegistrationV1 = Readonly<{
  operationNumber: number;
  seamKey: string;
  sections: readonly Readonly<{ sideA: RegisteredPart; sideB: RegisteredPart }>[];
}>;

function intervalProgress(station: CurveStation, intervals: readonly SavedNativeCurveIntervalV1[]) {
  const interval = intervals[station.intervalOrdinal];
  if (
    !Number.isSafeInteger(station.intervalOrdinal) ||
    !interval ||
    interval.nativeCurveId !== station.nativeCurveId ||
    !Number.isFinite(station.nativeT)
  )
    throw new RangeError('A registration station differs from the saved native curve.');
  const progress = (station.nativeT - interval.t0) / (interval.t1 - interval.t0);
  if (!(progress >= 0 && progress <= 1))
    throw new RangeError('A registration station is outside the saved native part.');
  return progress;
}

type WalkPosition = Readonly<{ interval: number; progress: number }>;

const walkPosition = (interval: number, progress: number): WalkPosition =>
  progress === 1 ? { interval: interval + 1, progress: 0 } : { interval, progress };
const comparePosition = (a: WalkPosition, b: WalkPosition) =>
  a.interval - b.interval || a.progress - b.progress;
const partKey = (side: 0 | 1, ordinal: number) => `${side}:${ordinal}`;

function pointAt({ startMm, endMm }: SavedNativeCurveIntervalV1, progress: number) {
  if (progress === 0) return startMm;
  if (progress === 1) return endMm;
  const [x, y] = startMm;
  return [x + (endMm[0] - x) * progress, y + (endMm[1] - y) * progress] as const;
}

function materialRun(
  anchor: SavedCompleteNativeStitchAnchorV1,
  { direction, range }: RegisteredPart,
) {
  const intervals = anchor.span.intervals;
  if (!intervals.length || (direction !== 'native-forward' && direction !== 'native-reversed'))
    throw new RangeError('A registration must identify a directed, nonempty saved part.');
  const fromOrdinal = range?.from.intervalOrdinal ?? 0;
  const toOrdinal = range?.to.intervalOrdinal ?? intervals.length - 1;
  const fromProgress = range ? intervalProgress(range.from, intervals) : 0;
  const toProgress = range ? intervalProgress(range.to, intervals) : 1;
  const from = walkPosition(fromOrdinal, fromProgress);
  const to = walkPosition(toOrdinal, toProgress);
  if (comparePosition(from, to) >= 0)
    throw new RangeError('A registered native part range must be increasing.');
  const run = intervals.slice(fromOrdinal, toOrdinal + 1).flatMap((interval, index) => {
    const start = index === 0 ? fromProgress : 0;
    const end = index === toOrdinal - fromOrdinal ? toProgress : 1;
    return start < end
      ? [{ startMm: pointAt(interval, start), endMm: pointAt(interval, end) }]
      : [];
  });
  const directed =
    direction === 'native-reversed'
      ? run.toReversed().map(({ startMm, endMm }) => ({ startMm: endMm, endMm: startMm }))
      : run;
  return { from, to, run: { pieceId: anchor.pieceLineKey, intervals: directed } };
}

/** Project explicit registrations through the exact saved native spans for a fabric seam. */
export function projectSavedNativeStitchRegistrationV1(
  spans: readonly SavedCompleteNativeStitchAnchorV1[],
  { operationNumber, seamKey, sections }: SavedNativeStitchRegistrationV1,
): RegisteredSourceCutStitchV1 {
  const parts = spans.filter(
    (anchor) => anchor.seamKey === seamKey && anchor.operationNumber === operationNumber,
  );
  const byPart = new Map(
    parts.map((anchor) => [partKey(anchor.sideIndex, anchor.partOrdinal), anchor]),
  );
  const operationOrder = parts[0]?.operationOrder;
  if (
    operationOrder === undefined ||
    !sections.length ||
    byPart.size !== parts.length ||
    parts.some((anchor) => anchor.operationOrder !== operationOrder)
  )
    throw new RangeError('A stitch registration must name one current Assembly Order seam.');
  const coverage = new Map<string, { from: WalkPosition; to: WalkPosition }[]>();
  const project = (side: 0 | 1, part: RegisteredPart) => {
    const key = partKey(side, part.partOrdinal);
    const anchor = byPart.get(key);
    if (!anchor) throw new RangeError('A registration references a missing saved seam part.');
    const { from, to, run } = materialRun(anchor, part);
    const ranges = coverage.get(key);
    if (ranges) ranges.push({ from, to });
    else coverage.set(key, [{ from, to }]);
    return run;
  };
  const materialSections = sections.map(({ sideA, sideB }) => ({
    sideA: project(0, sideA),
    sideB: project(1, sideB),
  }));
  for (const [key, anchor] of byPart) {
    const ranges = coverage.get(key) ?? [];
    let covered = walkPosition(0, 0);
    for (const { from, to } of ranges.sort((a, b) => comparePosition(a.from, b.from))) {
      if (comparePosition(from, covered) > 0) break;
      if (comparePosition(to, covered) > 0) covered = to;
    }
    if (comparePosition(covered, walkPosition(anchor.span.intervals.length, 0)) !== 0)
      throw new RangeError('The registration leaves part of a saved native seam unbound.');
  }
  return { operationOrder, seamId: seamKey, sections: materialSections };
}
