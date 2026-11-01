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
