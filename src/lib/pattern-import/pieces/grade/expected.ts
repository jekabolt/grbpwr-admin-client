// pieces/grade (H1) — how many sizes the sheet draws, and who says so.
//
// The solver's safety rests on this number: with more than one size expected, a piece whose ranks
// are not PROVEN is refused, never closed as one size. Sources that encode their sizes (legend,
// layers, colours, files, DXF blocks) say it themselves; a one-size file that names its size
// ("BLAZER M") says 1; otherwise only the operator's answer on the sizes step. The card's size run
// is the garment's, not the sheet's: it is never the count (a guess from it leaked wrong contours),
// it is only offered as a quick answer. Unknown (null) on a sheet that does not encode its sizes →
// the sizes step requires the answer, and the fill refuses every piece until it is given.
import type { ChainSet, ExpectedSizes, SizeRun } from 'lib/pattern-import/types';

/**
 * `set` (the chains the run was read from): a run whose size classes carry no line is NOT the source
 * encoding its sizes — F3 proposes empty dash classes on a sheet where every size looks alike.
 */
export function expectedSizes(
  run: SizeRun,
  drawnSizes?: number | null,
  set?: ChainSet,
): ExpectedSizes | null {
  const carried = set
    ? run.sizes.filter(
        (z) =>
          z.classId != null &&
          (set.classes.find((c) => c.id === z.classId)?.chains.length ?? 0) > 0,
      ).length
    : run.sizes.length;
  if (run.encoding !== 'single' && run.sizes.length > 1 && carried >= 2)
    return { n: run.sizes.length, from: 'source' };
  if (drawnSizes != null && drawnSizes >= 1) return { n: Math.round(drawnSizes), from: 'operator' };
  if (run.encoding === 'single' && run.sizes.length === 1 && run.sizes[0].label.trim())
    return { n: 1, from: 'source' };
  return null;
}

/**
 * The size run the pieces are ranked in. When the source does not encode its sizes but more than
 * one is expected (the card's run, or the operator's answer), the pieces stage ranks n sizes, so
 * the run lists n — unlabelled, rank 0 = the innermost line: the size map aligns them with the
 * card by rank and asks the operator to confirm (no label matched).
 */
export function runForExpected(run: SizeRun, expected: ExpectedSizes | null): SizeRun {
  if (!expected || expected.from === 'source' || expected.n <= 1) return run;
  return {
    encoding: 'single',
    sizes: Array.from({ length: expected.n }, (_, r) => ({
      label: '',
      rank: r,
      classId: null,
      file: run.sizes[0]?.file ?? null,
    })),
    evidence: run.evidence,
  };
}
