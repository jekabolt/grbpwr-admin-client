// The product pipeline of the assembly skeleton, in one place — the tech card's provider, its
// unit pictograms and the probes all run THIS, so a number measured in a probe is the number the
// screen shows:
//
//   facts → A3 seam graph (geometry/) → B units (skeleton/groupUnits) → A4 second pass
//         (geometry/compositeSeams) → B3 proposal (skeleton/buildSkeleton)
//
// Pure TS: lib/** only; the tech card injects its own deps (zone inference, unit codes, rules).

import { buildSeamGraph, compositeSeams } from './geometry';
import { tidyUnitName } from './names';
import { buildSkeleton, groupUnits, orderTemplate, type SkeletonTemplate } from './skeleton';
import {
  SKELETON,
  type SeamGraph,
  type SkeletonDeps,
  type SkeletonFacts,
  type SkeletonOptions,
  type SkeletonPins,
  type SkeletonProposal,
  type SkeletonStep,
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

/** A3 → lane B's units → A4: the seam graph every later reader works from. */
export function readSeamGraph(
  facts: SkeletonFacts,
  template: SkeletonTemplate = orderTemplate(facts.category),
  pins: SkeletonPins = {},
): SeamGraph {
  const refused = skeletonRefusal(facts);
  if (refused) return EMPTY_GRAPH([refused]);
  const first = buildSeamGraph(facts);
  return compositeSeams(first, groupUnits(first, facts, template, pins));
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
  const graph = readSeamGraph(facts, template, options.pins);
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
