import { assignmentMode, inputFor } from 'lib/assembly-skeleton/assignment';
import type { SeamAssignmentInput } from 'lib/assembly-skeleton/types';
import { hardwareFromOps, joinsFromOps } from 'lib/doll/joins';

export type AssignmentOp = {
  inputKeys?: readonly string[];
  outputUnitKey?: string;
  operationType?: string;
};

/** Pure assignment input shared by proto-card readers and the form adapter. */
export function seamAssignmentInputOf(
  operations: readonly AssignmentOp[],
  pieceKeys: ReadonlySet<string>,
): SeamAssignmentInput | undefined {
  if (assignmentMode() === 'greedy') return undefined;
  const ops = operations.map((operation) => ({
    inputs: (operation.inputKeys ?? []).filter(Boolean),
    output: (operation.outputUnitKey ?? '').trim(),
    type: (operation.operationType ?? '').replace('TECH_CARD_OPERATION_TYPE_', ''),
  }));
  const pieceOf = (key: string) => (pieceKeys.has(key) ? key : null);
  return inputFor(joinsFromOps(ops, pieceOf), hardwareFromOps(ops, pieceOf));
}
