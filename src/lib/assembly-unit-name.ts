export type UnitDisplayNameSource = {
  key: string;
  outputUnitName?: string | null;
  suggestedName?: string | null;
};

/** Turn an internal unit key into the last-resort human label shown to the owner. */
export function humanizeUnitKey(key: string): string {
  const words = key
    .trim()
    .replace(/[_-]+/g, ' ')
    .replace(/([a-z\d])([A-Z])/g, '$1 $2')
    .split(/\s+/)
    .filter(Boolean);
  if (words.length === 0) return 'Unit';

  return words
    .map((word, index) => {
      if (/^[A-Za-z]$/.test(word)) return word.toUpperCase();
      const lower = word.toLowerCase();
      return index === 0 ? lower.charAt(0).toUpperCase() + lower.slice(1) : lower;
    })
    .join(' ');
}

/**
 * The one owner-facing name for an assembly unit.
 *
 * Stored first-producer names win. Skeleton suggestions are used while a proposal has not yet
 * become stored operations. The internal key is humanised only as a final compatibility fallback.
 */
export function unitDisplayName({
  key,
  outputUnitName,
  suggestedName,
}: UnitDisplayNameSource): string {
  return outputUnitName?.trim() || suggestedName?.trim() || humanizeUnitKey(key);
}
