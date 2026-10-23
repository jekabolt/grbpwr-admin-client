export type OperationMembershipRow = {
  inputKeys?: string[];
  outputUnitKey?: string;
  assemblyBlockDetached?: boolean;
};

export type OperationMoveMembership =
  | { accepted: true; assemblyBlockDetached: boolean }
  | { accepted: false; reason: 'join-kept'; outputUnitKey: string }
  | { accepted: false; reason: 'pieces-only' };

/** Pure membership decision shared by the field-array mutator and its focused tests. */
export function operationMoveMembership(
  operation: OperationMembershipRow,
  standalone: boolean,
  pieceKeys: ReadonlySet<string>,
): OperationMoveMembership {
  const outputUnitKey = (operation.outputUnitKey ?? '').trim();
  if (standalone && outputUnitKey) return { accepted: false, reason: 'join-kept', outputUnitKey };
  if (
    standalone &&
    (!operation.inputKeys?.length || operation.inputKeys.some((key) => !pieceKeys.has(key)))
  ) {
    return { accepted: false, reason: 'pieces-only' };
  }
  return { accepted: true, assemblyBlockDetached: standalone };
}
