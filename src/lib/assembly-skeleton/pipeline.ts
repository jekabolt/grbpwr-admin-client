// The product pipeline of the assembly skeleton, in one place — the tech card's provider, its
// unit pictograms and the probes all run THIS, so a number measured in a probe is the number the
// screen shows:
//
//   facts → A3 seam graph (geometry/) → B units (skeleton/groupUnits) → A4 second pass
//         (geometry/compositeSeams) → B3 proposal (skeleton/buildSkeleton)
//
// Pure TS: lib/** only; the tech card injects its own deps (zone inference, unit codes, rules).

import { buildSeamGraph, compositeSeams } from './geometry';
import { buildSkeleton, groupUnits, orderTemplate, type SkeletonTemplate } from './skeleton';
import type {
  SeamGraph,
  SkeletonDeps,
  SkeletonFacts,
  SkeletonOptions,
  SkeletonPins,
  SkeletonProposal,
} from './types';

/** A3 → lane B's units → A4: the seam graph every later reader works from. */
export function readSeamGraph(
  facts: SkeletonFacts,
  template: SkeletonTemplate = orderTemplate(facts.category),
  pins: SkeletonPins = {},
): SeamGraph {
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
  const graph = readSeamGraph(facts, template, options.pins);
  return { ...buildSkeleton(graph, facts, template, deps, options), graph };
}
