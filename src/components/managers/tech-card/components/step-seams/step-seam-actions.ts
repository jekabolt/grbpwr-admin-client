import type { StoredSeam } from 'lib/seams';

type SeamKeyOperation = {
  seamKeys?: readonly string[];
};

export type StepSeamRemoval = {
  seamKeys: string[];
  deleteRow: boolean;
};

/** Detach one seam from a step and say whether that step held the row's last reference. */
export function planStepSeamRemoval(
  operations: readonly SeamKeyOperation[],
  index: number,
  seamKey: string,
): StepSeamRemoval {
  const seamKeys = operations[index]?.seamKeys ?? [];
  const attached = seamKeys.includes(seamKey);
  return {
    seamKeys: seamKeys.filter((key) => key !== seamKey),
    deleteRow:
      attached &&
      !operations.some(
        (operation, operationIndex) =>
          operationIndex !== index && operation.seamKeys?.includes(seamKey),
      ),
  };
}

/** Every stored row of a step once — by key, not by sides: a pair stored twice is two rows. */
export function seamsToClear<T extends { key: string }>(stored: readonly T[]): T[] {
  return [...new Map(stored.map((seam) => [seam.key, seam])).values()];
}

/** The card's binding rows — every row that sews a cut strip — whatever step holds them. */
export function bindingRowsOf(
  rows: Iterable<StoredSeam>,
  stripKeys: ReadonlySet<string>,
): StoredSeam[] {
  if (!stripKeys.size) return [];
  return [...rows].filter((row) =>
    [...row.sideA, ...row.sideB].some((anchor) => stripKeys.has(anchor.piece)),
  );
}
