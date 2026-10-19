// WHO ASSIGNS THE SEAM GRAPH'S EDGES on this card — the greedy as shipped, or the operation-driven
// global solver (lib/assembly-skeleton/assignment) over the technologist's order. One place for the
// three readers of the graph (the skeleton proposal, the unit pictograms, the doll): the flag
// VITE_SEAM_ASSIGNMENT = greedy | shadow | global and the card's MACHINE steps as declared joins.

import { assignmentMode, inputFor } from 'lib/assembly-skeleton/assignment';
import type { SeamAssignmentInput } from 'lib/assembly-skeleton/types';
import { hardwareFromOps, joinsFromOps } from 'lib/doll/joins';
import { useMemo } from 'react';
import { useWatch } from 'react-hook-form';

import type { TechCardFormData } from '../schema';

type FormOp = NonNullable<TechCardFormData['operations']>[number];

/** The assignment input for a card's steps, or undefined when the greedy is the mode. */
export function seamAssignmentInputOf(
  operations: readonly FormOp[],
  pieceKeys: ReadonlySet<string>,
): SeamAssignmentInput | undefined {
  if (assignmentMode() === 'greedy') return undefined;
  const ops = operations.map((o) => ({
    inputs: (o.inputKeys ?? []).filter(Boolean),
    output: (o.outputUnitKey ?? '').trim(),
    type: (o.operationType ?? '').replace('TECH_CARD_OPERATION_TYPE_', ''),
  }));
  const pieceOf = (k: string) => (pieceKeys.has(k) ? k : null);
  return inputFor(joinsFromOps(ops, pieceOf), hardwareFromOps(ops, pieceOf));
}

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
