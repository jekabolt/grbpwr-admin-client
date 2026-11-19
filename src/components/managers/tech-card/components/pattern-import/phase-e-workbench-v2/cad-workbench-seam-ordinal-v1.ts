/** Returns the one-based position in the saved Assembly Order operation. */
export function cadWorkbenchOperationSeamOrdinal(
  orderedSeamIds: readonly string[],
  seamId: string,
): number | null {
  const index = orderedSeamIds.indexOf(seamId);
  return index >= 0 && orderedSeamIds.lastIndexOf(seamId) === index ? index + 1 : null;
}
