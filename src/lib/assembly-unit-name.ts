export type UnitDisplayNameSource = {
  key: string;
  outputUnitName?: string | null;
  suggestedName?: string | null;
};

/** Turn an internal unit key into the last-resort human label shown to the owner. */
export function humanizeUnitKey(key: string): string {
  const spaced = key.trim().replace(/[_-]+/g, ' ');
  // A mostly-uppercase key (`FRONT lEFT WITH POCKET`) is read case-insensitively: a stray
  // lowercase letter is a typo, not a camelCase word boundary.
  const letters = spaced.replace(/[^A-Za-z]/g, '');
  const upper = letters.replace(/[^A-Z]/g, '').length;
  const camel = upper * 2 <= letters.length;
  const words = (camel ? spaced.replace(/([a-z\d])([A-Z])/g, '$1 $2') : spaced)
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
