// The tech-card half of the assembly skeleton: the three things `buildSkeleton`
// (lib/assembly-skeleton) borrows from here, composed once. lib/** may not import components/**,
// so the dependency is injected — call it as
//
//   buildSkeleton(graph, facts, orderTemplate(facts.category), skeletonDeps)
//
// Nothing here decides anything new: the zone is `inferZone` (silent → the template's stage zone),
// the unit code is `suggestUnitCode`, the rules are `assemblySweep` + `assemblyReleaseCheck`.

import type {
  SkeletonDeps,
  SkeletonDraftCard,
  SkeletonOperationType,
} from 'lib/assembly-skeleton/types';
import { assemblyReleaseCheck, assemblySweep } from './assembly-frontier';
import { suggestUnitCode } from './assembly-suggest';
import { inferZone, type InferenceBomLine, type InferenceAlias } from './operation-inference';

const OPERATION_TYPE: Record<SkeletonOperationType, string> = {
  MACHINE: 'TECH_CARD_OPERATION_TYPE_MACHINE',
  PRESS: 'TECH_CARD_OPERATION_TYPE_PRESS',
  PRESS_OPEN: 'TECH_CARD_OPERATION_TYPE_PRESS_OPEN',
  FUSING: 'TECH_CARD_OPERATION_TYPE_FUSING',
  HANDWORK: 'TECH_CARD_OPERATION_TYPE_HANDWORK',
};

/**
 * The deps, optionally reading the card's BOM and piece↔block links so the fabric source of
 * `inferZone` can speak (lining steps get the LINING zone); without them it reads names only.
 */
export function makeSkeletonDeps(card?: {
  bomLines?: InferenceBomLine[];
  aliases?: InferenceAlias[];
}): SkeletonDeps {
  return {
    zoneOf: (draft: SkeletonDraftCard, index: number) =>
      inferZone(
        {
          pieces: draft.pieces,
          bomLines: card?.bomLines ?? [],
          aliases: card?.aliases ?? [],
          presses: [],
          steps: draft.steps.map((s) => ({
            inputKeys: s.inputs,
            outputUnitKey: s.outputUnitKey,
            operationType: OPERATION_TYPE[s.operationType],
          })),
        },
        index,
      ).value,
    suggestUnitCode,
    checkAssembly: (pieces, steps) => {
      const res = assemblySweep(pieces, steps);
      return { violations: res.violations, release: assemblyReleaseCheck(pieces, steps, res) };
    },
  };
}

export const skeletonDeps: SkeletonDeps = makeSkeletonDeps();
