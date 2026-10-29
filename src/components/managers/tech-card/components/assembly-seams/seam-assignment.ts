// WHO ASSIGNS THE SEAM GRAPH'S EDGES on this card — the greedy as shipped, or the operation-driven
// global solver (lib/assembly-skeleton/assignment) over the technologist's order. One place for the
// three readers of the graph (the skeleton proposal, the unit pictograms, the doll): the flag
// VITE_SEAM_ASSIGNMENT = greedy | shadow | global and the card's MACHINE steps as declared joins.

import type { SeamAssignmentInput } from 'lib/assembly-skeleton/types';
import { useMemo } from 'react';
import { useWatch } from 'react-hook-form';

import type { TechCardFormData } from '../schema';
import { seamAssignmentInputOf } from './seam-assignment-input';

export { seamAssignmentInputOf } from './seam-assignment-input';

type FormOp = NonNullable<TechCardFormData['operations']>[number];

/** The same, read from the form (steps and pieces). */
export function useSeamAssignmentInput(): SeamAssignmentInput | undefined {
  const operations = (useWatch<TechCardFormData>({ name: 'operations' }) ?? []) as FormOp[];
  const pieces = (useWatch<TechCardFormData>({ name: 'pieces' }) ??
    []) as TechCardFormData['pieces'];
  const sig = `${operations
    .map(
      (o) =>
        `${(o.outputUnitKey ?? '').trim()}<${(o.inputKeys ?? []).join(',')}:${o.operationType ?? ''}`,
    )
    .join('~')}#${pieces.map((p) => p.lineKey ?? '').join(',')}`;
  return useMemo(
    () =>
      seamAssignmentInputOf(
        operations,
        new Set(pieces.map((p) => (p.lineKey ?? '').trim()).filter(Boolean)),
      ),
    // the signature stands for the arrays the form rebuilds on every keystroke
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sig],
  );
}
