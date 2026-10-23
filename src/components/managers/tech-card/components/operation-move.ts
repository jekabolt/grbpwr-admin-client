export type OperationMembershipRow = {
  outputUnitKey?: string;
  assemblyBlockDetached?: boolean;
};

export type OperationMoveMembership =
  | { accepted: true; assemblyBlockDetached: boolean }
  | { accepted: false; outputUnitKey: string };

/** Pure membership decision shared by the field-array mutator and its focused tests. */
export function operationMoveMembership(
  operation: OperationMembershipRow,
  standalone: boolean,
): OperationMoveMembership {
  const outputUnitKey = (operation.outputUnitKey ?? '').trim();
  if (standalone && outputUnitKey) return { accepted: false, outputUnitKey };
  return { accepted: true, assemblyBlockDetached: standalone };
}
