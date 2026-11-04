import type { common_TechCardPackagingItem } from 'api/proto-http/admin';
import {
  kindLabel,
  packagingItemKinds,
} from 'components/managers/tech-card/components/tech-card-options';
import { wireInt } from 'components/managers/tech-card/components/wire-int';

// WHAT GOES IN THE BOX, one reading for all three papers. It comes from the packaging items and not
// from the BOM: an item gets a BOM line only when it is picked again, and an item from an auxiliary
// card never has one, so a BOM reading would drop both without a word.

const clean = (value?: string | null): string => (value ?? '').trim();

export type PackagingItemFacts = ReturnType<typeof packagingItemFacts>;

export function packagingItemFacts(item: common_TechCardPackagingItem) {
  const kind = kindLabel(packagingItemKinds, clean(item.key)).replaceAll('_', ' ');
  return {
    item: kind,
    what: clean(item.pickedName) || kind,
    quantity: wireInt(item.qtyPerGarment) || 1,
    perOrder: !!item.perOrder,
    size: clean(item.size),
    how: clean(item.packing),
    note: clean(item.note),
    colorwayIds: (item.colorwayIds ?? []).map(wireInt).filter((id) => id > 0),
  };
}

/** No colourways on the item: it goes with all of them. No scope: the paper is about all of them. */
export function packagingItemInScope(
  item: common_TechCardPackagingItem,
  scope: readonly number[],
): boolean {
  const { colorwayIds } = packagingItemFacts(item);
  return !scope.length || !colorwayIds.length || colorwayIds.some((id) => scope.includes(id));
}
