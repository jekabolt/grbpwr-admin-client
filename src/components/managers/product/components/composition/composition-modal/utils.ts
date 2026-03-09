import { CompositionItem, CompositionStructure } from 'constants/garment-composition';

export function getPartTotal(items: CompositionItem[] | undefined): number {
  if (!items || items.length === 0) return 0;
  return items.reduce((acc, item) => acc + item.percent, 0);
}

export function hasInvalidParts(composition: CompositionStructure): boolean {
  return Object.entries(composition).some(([, items]) => {
    if (!items || items.length === 0) return false;
    return getPartTotal(items) !== 100;
  });
}
