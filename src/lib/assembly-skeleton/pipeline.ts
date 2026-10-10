// The product pipeline of the assembly skeleton, in one place — the tech card's provider, its
// unit pictograms and the probes all run THIS, so a number measured in a probe is the number the
// screen shows:
//
//   facts → A3 seam graph (geometry/) → B units (skeleton/groupUnits) → A4 second pass
//         (geometry/compositeSeams) → B3 proposal (skeleton/buildSkeleton)
//
// Pure TS: lib/** only; the tech card injects its own deps (zone inference, unit codes, rules).

import { ALL_RULES, buildSeamGraph, compositeSeams, edgeIdsOf, segmentPiece } from './geometry';
import { tidyUnitName } from './names';
import { buildSkeleton, groupUnits, orderTemplate, type SkeletonTemplate } from './skeleton';
import {
  SKELETON,
  type PieceGeom,
  type SeamCandidate,
  type SeamDecisions,
  type SeamDecisionsInput,
  type SeamGraph,
  type SkeletonDeps,
  type SkeletonFacts,
  type SkeletonOptions,
  type SkeletonPins,
  type SkeletonProposal,
  type SkeletonStep,
  type SkeletonUnitHint,
} from './types';

const EMPTY_GRAPH = (warnings: string[]): SeamGraph => ({
  pieces: [],
  chosen: [],
  rejected: [],
  components: [],
  warnings,
});

/**
 * Why the pattern is not read at all, in words, or null when it is. Two refusals, both said out
 * loud rather than producing an empty order: no contoured piece (nothing to read — an empty or
 * mesh-only DXF), and more pieces than a garment has (a marker or a whole collection in one file;
 * the all-pairs pass would freeze the page).
 */
export function skeletonRefusal(facts: SkeletonFacts): string | null {
  const n = facts.pieces.length;
  if (n === 0) return 'no piece has a contour — there is nothing in the pattern to read';
  if (n > SKELETON.maxPieces)
    return `${n} pieces with a contour — more than ${SKELETON.maxPieces}, so the pattern is not read (a marker or several garments in one file?); split it by garment`;
  return null;
}

/**
 * A3 → lane B's units → A4: the seam graph every later reader works from. `decisions` = the seams
 * stored on the card, resolved by lib/seams (a value, or a function of the pieces about to be
 * matched): confirmed seams are taken first, rejected pairs dropped, closures block their edges.
 */
export function readSeamGraph(
  facts: SkeletonFacts,
  template: SkeletonTemplate = orderTemplate(facts.category),
  pins: SkeletonPins = {},
  decisions?: SeamDecisionsInput,
  hints?: readonly SkeletonUnitHint[],
): SeamGraph {
  const refused = skeletonRefusal(facts);
  if (refused) return EMPTY_GRAPH([refused]);
  if (!decisions) {
    const first = buildSeamGraph(facts);
    return compositeSeams(first, groupUnits(first, facts, template, pins, hints));
  }
  let resolved: SeamDecisions | undefined;
  const first = buildSeamGraph(facts, ALL_RULES, (pieces) => {
    resolved = typeof decisions === 'function' ? decisions(pieces) : decisions;
    return resolved;
  });
  return dropRejectedA4(
    compositeSeams(first, groupUnits(first, facts, template, pins, hints)),
    resolved,
  );
}

/**
 * A partial / composite seam the second pass (A4) found again although a person rejected it: out
 * of `chosen`, into `rejected` with the person's words (A3 drops rejected pairs before its greedy;
 * A4 reads its own runs, so the same rule is applied to what it adds).
 */
function dropRejectedA4(graph: SeamGraph, d: SeamDecisions | undefined): SeamGraph {
  const ex = (d?.excluded ?? []).filter((x) => !x.surface);
  if (ex.length === 0) return graph;
  const sideIds = (c: SeamCandidate, s: 'a' | 'b') =>
    s === 'a' ? c.aParts ?? edgeIdsOf(c.a) : c.bParts ?? edgeIdsOf(c.b);
  const hitBy = (c: SeamCandidate) =>
    c.provenance || (c.kind !== 'partial' && c.kind !== 'composite')
      ? undefined
      : ex.find((x) => {
          const A = new Set(x.aIds);
          const B = new Set(x.bIds);
          const a = sideIds(c, 'a');
          const b = sideIds(c, 'b');
          return (
            (a.some((e) => A.has(e)) && b.some((e) => B.has(e))) ||
            (a.some((e) => B.has(e)) && b.some((e) => A.has(e)))
          );
        });
  const dropped = graph.chosen.flatMap((c) => {
    const x = hitBy(c);
    return x ? [{ ...c, evidence: { ...c.evidence, rule: x.rule } }] : [];
  });
  if (dropped.length === 0) return graph;
  return {
    ...graph,
    chosen: graph.chosen.filter((c) => !hitBy(c)),
    rejected: [...dropped, ...graph.rejected],
  };
}

/** The pieces as A1 cuts them (the resolver's input) — the same segmentation the graph runs. */
export function segmentAll(facts: SkeletonFacts): PieceGeom[] {
  return facts.pieces.map(segmentPiece);
}

/**
 * The whole proposal; it carries the graph it was read from (the screen draws pictograms on it).
 * Chosen readings (`options.pins`) rebuild it from the units up — the composite pass reads the
 * units, so the graph is read again too (20–90 ms on the 46-piece blazer, once per choice).
 */
export function proposeSkeleton(
  facts: SkeletonFacts,
  deps: SkeletonDeps,
  options: SkeletonOptions = {},
): SkeletonProposal {
  // «use AI structure»: the proposal is read as the category the AI chose, not the card's.
  if (options.category && options.category !== facts.category)
    facts = { ...facts, category: options.category };
  const template = orderTemplate(facts.category);
  const refused = skeletonRefusal(facts);
  if (refused) {
    return {
      steps: [],
      unresolved: [],
      template: template.id,
      warnings: [refused],
      graph: EMPTY_GRAPH([refused]),
    };
  }
  const graph = readSeamGraph(facts, template, options.pins, options.decisions, options.units);
  const built = buildSkeleton(graph, facts, template, deps, options);
  return {
    ...built,
    steps: built.steps.map(tidyStepNames),
    graph,
    ...(facts.existing ? { existing: facts.existing.steps } : {}),
  };
}

/**
 * Unit names as the card will keep them: a clause attached twice is said once («Left front with
 * pockets», not «… with pocket with pocket»), a piece code keeps its capital («Lining MP_LIN_L_1»).
 * The label and the reason repeat unit names, so they are tidied the same way.
 */
function tidyStepNames(s: SkeletonStep): SkeletonStep {
  const name = tidyUnitName(s.outputUnitName);
  const label = s.label ? tidyUnitName(s.label) : s.label;
  const reason = tidyUnitName(s.reason);
  return name === s.outputUnitName && label === s.label && reason === s.reason
    ? s
    : { ...s, outputUnitName: name, reason, ...(s.label != null ? { label } : {}) };
}
