import { composition, CompositionItem, CompositionStructure } from 'constants/garment-composition';

export function getPartTotal(items: CompositionItem[] | undefined): number {
  if (!items || items.length === 0) return 0;
  return items.reduce((acc, item) => acc + item.percent, 0);
}

// Serialise a composition for storage. Parts holding no fibres are dropped, and a structure with
// nothing left in it stores '' — never '{}'. That distinction is load-bearing: every "is composition
// set" check downstream is string-truthiness (`hasAnyComposition`, the BOM line's missing-composition
// highlight, the labels checklist), so a stored '{}' reads as FILLED while generating nothing.
export function compositionToValue(structure: CompositionStructure): string {
  const filled = Object.entries(structure).filter(([, items]) => !!items && items.length > 0);
  return filled.length > 0 ? JSON.stringify(Object.fromEntries(filled)) : '';
}

export function hasInvalidParts(structure: CompositionStructure): boolean {
  return Object.entries(structure).some(([, items]) => {
    if (!items || items.length === 0) return false;
    return getPartTotal(items) !== 100;
  });
}

// The dictionary is keyed name → code, per category, and a stored composition holds only codes. The
// selected-fibre rows have to render a NAME for a code that may well live in a category the operator
// isn't currently browsing, so flatten it once. First category wins for the handful of codes that
// appear twice (GTX, MER, RIP…) — the display name is identical either way.
const FIBRE_NAMES: Record<string, string> = (() => {
  const map: Record<string, string> = {};
  const groups = composition.garment_composition as unknown as Record<
    string,
    Record<string, string>
  >;
  Object.values(groups).forEach((group) => {
    Object.entries(group).forEach(([name, code]) => {
      if (!map[code]) map[code] = name;
    });
  });
  return map;
})();

export function fibreName(code: string): string {
  return FIBRE_NAMES[code] ?? code;
}
