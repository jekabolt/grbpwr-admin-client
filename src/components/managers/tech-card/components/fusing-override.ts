export const FUSING_OPERATION_TYPE = 'TECH_CARD_OPERATION_TYPE_FUSING';

export type FusingOperationLike = {
  operationType?: string;
  inputKeys?: readonly string[];
  draft?: boolean;
};

type FusedPieceLike = {
  lineKey?: string;
  fused?: boolean;
};

export type AutoFuseRefusal = {
  autoStepNumber: number;
};

export type FusingSaveOverride = {
  manualIndex: number;
  manualStepNumber: number;
  autoStepNumbers: number[];
  pieceKeys: string[];
};

const keyOf = (value: string | undefined): string => (value ?? '').trim();

const inputKeySet = (operation: FusingOperationLike | undefined): Set<string> =>
  new Set((operation?.inputKeys ?? []).map(keyOf).filter(Boolean));

// The rail and save mapper both number by current position; a stored number is stale after a drag.
export const operationStepNumber = (index: number): number => (index + 1) * 10;

/**
 * The automatic identity is private server data. A draft FUSING row is the existing wire-level
 * signal used by the client to leave server-managed rows out of the presence audit.
 */
export const isServerManagedFusingStep = (
  operation: { operationType?: unknown; draft?: unknown } | undefined,
): boolean =>
  !!operation && operation.operationType === FUSING_OPERATION_TYPE && operation.draft === true;

/**
 * Refuse only a fused piece that already has a FUSING owner from being added to another FUSING
 * row. After reconciliation that owner is the automatic row, even when it has been reviewed and
 * therefore no longer carries `draft`; prefer the draft candidate while reading older duplicates.
 */
export function autoFuseRefusal(
  operations: readonly FusingOperationLike[],
  pieces: readonly FusedPieceLike[],
  targetIndex: number,
  pieceKey: string,
): AutoFuseRefusal | null {
  const key = keyOf(pieceKey);
  if (!key || operations[targetIndex]?.operationType !== FUSING_OPERATION_TYPE) return null;
  if (!pieces.some((piece) => keyOf(piece.lineKey) === key && piece.fused === true)) return null;

  const owners = operations.flatMap((operation, index) => {
    if (
      index === targetIndex ||
      operation.operationType !== FUSING_OPERATION_TYPE ||
      !inputKeySet(operation).has(key)
    )
      return [];
    return [{ operation, index }];
  });
  const owner = owners.find(({ operation }) => isServerManagedFusingStep(operation)) ?? owners[0];
  return owner ? { autoStepNumber: operationStepNumber(owner.index) } : null;
}

/**
 * Finds manual FUSING inputs removed by reconciliation. `pairs` is the presence audit's mapping
 * from sent rows to server rows; automatic draft rows deliberately have no pair. A key counts only
 * when the piece remains fused and the server response places it on a FUSING row, so ordinary input
 * edits, unfusing, and non-FUSING operations stay silent.
 */
export function fusingSaveOverrides(
  sent: readonly FusingOperationLike[],
  read: readonly FusingOperationLike[],
  pairs: readonly number[],
  pieces: readonly FusedPieceLike[],
): FusingSaveOverride[] {
  const fusedKeys = new Set(
    pieces.flatMap((piece) => {
      const key = keyOf(piece.lineKey);
      return piece.fused === true && key ? [key] : [];
    }),
  );
  if (fusedKeys.size === 0) return [];

  const autoByPiece = new Map<string, { index: number; managed: boolean }>();
  read.forEach((operation, index) => {
    if (operation.operationType !== FUSING_OPERATION_TYPE) return;
    const managed = isServerManagedFusingStep(operation);
    for (const key of inputKeySet(operation)) {
      if (!fusedKeys.has(key)) continue;
      const current = autoByPiece.get(key);
      if (!current || (managed && !current.managed)) {
        autoByPiece.set(key, { index, managed });
      }
    }
  });

  const overrides: FusingSaveOverride[] = [];
  sent.forEach((operation, index) => {
    if (operation.operationType !== FUSING_OPERATION_TYPE || isServerManagedFusingStep(operation))
      return;
    const pairedIndex = pairs[index] ?? -1;
    const keptInputs = pairedIndex >= 0 ? inputKeySet(read[pairedIndex]) : new Set<string>();
    const removed = [...inputKeySet(operation)].filter(
      (key) => fusedKeys.has(key) && !keptInputs.has(key) && autoByPiece.has(key),
    );
    if (removed.length === 0) return;
    const autoStepNumbers = [
      ...new Set(
        removed.map((key) => {
          const owner = autoByPiece.get(key)!;
          return operationStepNumber(owner.index);
        }),
      ),
    ].sort((a, b) => a - b);
    overrides.push({
      manualIndex: index,
      manualStepNumber: operationStepNumber(index),
      autoStepNumbers,
      pieceKeys: removed,
    });
  });
  return overrides;
}

export function fusingOverrideText(overrides: readonly FusingSaveOverride[]): string {
  return overrides
    .map(
      ({ manualStepNumber, autoStepNumbers }) =>
        `fuse ${manualStepNumber} → auto ${autoStepNumbers.join('/')}`,
    )
    .join(' · ');
}
