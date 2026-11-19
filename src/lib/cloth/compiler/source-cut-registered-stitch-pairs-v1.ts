import {
  buildRegisteredMaterialArcGridV1,
  DXF_EXACT_NATIVE_SEAM_GRID_LIMITS_V1,
} from '../domain/dxf-exact-native-seam-grid-v1';
import type { Vec2Mm } from '../domain/garment-assembly-ir';
import { PHASE2_BOUNDARY_SAMPLING_LIMITS_V1 } from '../mesh/triangulation/phase2-boundary-sampling-v1';

type MaterialStation = Readonly<{ pieceId: string; positionMm: Vec2Mm }>;
type DirectedMaterialRun = Readonly<{
  pieceId: string;
  intervals: readonly Readonly<{ startMm: Vec2Mm; endMm: Vec2Mm }>[];
}>;

export type RegisteredSourceCutStitchV1 = Readonly<{
  operationOrder: number;
  seamId: string;
  /** One explicitly registered feed section per pair of physically continuous material runs. */
  sections: readonly Readonly<{ sideA: DirectedMaterialRun; sideB: DirectedMaterialRun }>[];
}>;

const equalPoint = (a: Vec2Mm, b: Vec2Mm) => a[0] === b[0] && a[1] === b[1];
const maxGridPoints = DXF_EXACT_NATIVE_SEAM_GRID_LIMITS_V1.maximumGridPoints;

function prepareRun({ pieceId, intervals }: DirectedMaterialRun, signal?: AbortSignal) {
  if (!pieceId || intervals.length < 1 || intervals.length >= maxGridPoints)
    throw new RangeError('A registered stitch needs a bounded material run on one cut.');
  const corners = [{ positionMm: intervals[0].startMm, cumulativeLengthMm: 0 }];
  for (const { startMm, endMm } of intervals) {
    signal?.throwIfAborted();
    const previous = corners[corners.length - 1];
    const lengthMm = Math.hypot(endMm[0] - startMm[0], endMm[1] - startMm[1]);
    const cumulativeLengthMm = previous.cumulativeLengthMm + lengthMm;
    if (
      !equalPoint(previous.positionMm, startMm) ||
      !Number.isFinite(cumulativeLengthMm) ||
      cumulativeLengthMm <= previous.cumulativeLengthMm
    )
      throw new RangeError('A directed material run must be continuous and strictly increasing.');
    corners.push({ positionMm: endMm, cumulativeLengthMm });
  }
  let upper = 1;
  const sample = (arcMm: number, cornerIndex: number | null): MaterialStation => {
    if (cornerIndex !== null) return { pieceId, positionMm: corners[cornerIndex].positionMm };
    while (upper < corners.length - 1 && corners[upper].cumulativeLengthMm < arcMm) upper++;
    const a = corners[upper - 1];
    const b = corners[upper];
    const t = (arcMm - a.cumulativeLengthMm) / (b.cumulativeLengthMm - a.cumulativeLengthMm);
    if (!(t > 0 && t < 1))
      throw new RangeError('An interior station cannot be represented on its material interval.');
    return {
      pieceId,
      positionMm: [
        a.positionMm[0] + (b.positionMm[0] - a.positionMm[0]) * t,
        a.positionMm[1] + (b.positionMm[1] - a.positionMm[1]) * t,
      ],
    };
  };
  return { corners, sample };
}

/** Project material runs that the caller has already resolved against current authored source. */
export function compileSourceCutRegisteredStitchPairsV1(
  stitches: readonly RegisteredSourceCutStitchV1[],
  policy: Readonly<{ minSegmentMm: number; maxSegmentMm: number; maxPairs: number }>,
  signal?: AbortSignal,
) {
  const { minSegmentMm, maxSegmentMm, maxPairs } = policy;
  if (
    !Number.isFinite(minSegmentMm) ||
    !Number.isFinite(maxSegmentMm) ||
    !(minSegmentMm > 0 && minSegmentMm <= maxSegmentMm) ||
    maxSegmentMm > PHASE2_BOUNDARY_SAMPLING_LIMITS_V1.maximumTargetEdgeMm ||
    !Number.isSafeInteger(maxPairs) ||
    maxPairs < 1
  )
    throw new RangeError('Physical stitch sampling requires explicit finite material bounds.');
  const pairs: {
    operationOrder: number;
    seamId: string;
    sourcePairIndex: number;
    sideA: MaterialStation;
    sideB: MaterialStation;
  }[] = [];
  const seen = new Set<string>();
  for (const { operationOrder, seamId, sections } of stitches) {
    signal?.throwIfAborted();
    if (
      !Number.isSafeInteger(operationOrder) ||
      operationOrder < 0 ||
      !seamId ||
      !sections.length ||
      seen.has(seamId)
    )
      throw new RangeError('Each registered stitch needs a unique authored seam and operation.');
    seen.add(seamId);
    let sourcePairIndex = 0;
    for (const section of sections) {
      const a = prepareRun(section.sideA, signal);
      const b = prepareRun(section.sideB, signal);
      const { points } = buildRegisteredMaterialArcGridV1(
        [a, b],
        [
          [0, 0],
          [a.corners.length - 1, b.corners.length - 1],
        ],
        minSegmentMm,
        maxSegmentMm,
      );
      let previousA = -Infinity;
      let previousB = -Infinity;
      for (const {
        sides: [atA, atB],
      } of points) {
        signal?.throwIfAborted();
        const arcA = atA.materialArcLengthMm;
        const arcB = atB.materialArcLengthMm;
        if (
          (previousA !== -Infinity &&
            (arcA - previousA < minSegmentMm || arcA - previousA > maxSegmentMm)) ||
          (previousB !== -Infinity &&
            (arcB - previousB < minSegmentMm || arcB - previousB > maxSegmentMm))
        )
          throw new RangeError('Material stitch sampling exceeded its registered bounds.');
        previousA = arcA;
        previousB = arcB;
        const sideA = a.sample(arcA, atA.cornerIndex);
        const sideB = b.sample(arcB, atB.cornerIndex);
        const previous =
          atA.cornerIndex === 0 && atB.cornerIndex === 0 && sourcePairIndex > 0
            ? pairs[pairs.length - 1]
            : undefined;
        if (
          previous?.sideA.pieceId === sideA.pieceId &&
          previous.sideB.pieceId === sideB.pieceId &&
          equalPoint(previous.sideA.positionMm, sideA.positionMm) &&
          equalPoint(previous.sideB.positionMm, sideB.positionMm)
        )
          continue;
        if (pairs.length >= maxPairs)
          throw new RangeError('Registered stitches exceed pair budget.');
        pairs.push({ operationOrder, seamId, sourcePairIndex: sourcePairIndex++, sideA, sideB });
      }
    }
  }
  return pairs;
}
