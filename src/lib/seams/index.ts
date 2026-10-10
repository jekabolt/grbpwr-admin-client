// Confirmed seams saved on the tech card — client resolver (03-SEAMS-DESIGN.md, lane L2).
//
//   anchors   seamFromCandidate(c, graph.pieces, {seamKey, status, …}) → StoredSeam (to upsert)
//   resolve   resolveSeamDecisions(rows, pieces, {grainDeg}) → Resolved (forced / closures /
//             excluded / stale / orphan, words) — hand it to readSeamGraph(facts, …, decisions)
//   wire      toWire / fromWire ↔ proto common.TechCardSeam
//
// One call for the provider: `readSeamGraph(facts, undefined, pins, decisionsFor(rows, facts))`
// resolves on the very pieces the graph matches (no second segmentation).

import type { PieceGeom, SeamDecisions, SkeletonFacts } from 'lib/assembly-skeleton/types';
import { grainDegOf } from './frame';
import { resolveSeamDecisions } from './resolve';
import type { ResolveOptions, Resolved, StoredSeam } from './types';

export * from './types';
export { anchorOf, anchorOfRunId, newSeamKey, seamFromCandidate, storedKindOf } from './anchor';
export { contourSig, frameOf, grainDegOf, runsOfPiece } from './frame';
export { resolveSeamDecisions, sideEdges } from './resolve';
export { fromWire, seamsSig, toWire } from './wire';

/**
 * The decisions input of readSeamGraph / proposeSkeleton: resolves `rows` against the pieces the
 * graph is about to match, with the card's grain lines. `onResolved` receives the full verdict
 * (stale / orphan rows for the review screen). No rows → undefined: the engine alone, unchanged.
 */
export function decisionsFor(
  rows: readonly StoredSeam[],
  facts: SkeletonFacts,
  onResolved?: (r: Resolved) => void,
  opts: Omit<ResolveOptions, 'grainDeg'> = {},
): ((pieces: readonly PieceGeom[]) => SeamDecisions) | undefined {
  if (rows.length === 0) return undefined;
  const grainDeg = grainDegOf(facts);
  const names = new Map(facts.pieces.map((p) => [p.pieceKey, p.name]));
  return (pieces) => {
    const r = resolveSeamDecisions(rows, pieces, {
      nameOf: (k) => names.get(k) ?? k,
      ...opts,
      grainDeg,
    });
    onResolved?.(r);
    return r;
  };
}
