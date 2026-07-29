import { common_Size, common_SizeSkuSystem } from 'api/proto-http/admin';
import { useDictionary } from 'lib/providers/dictionary-provider';
import { useCallback, useMemo } from 'react';
import {
  SIZE_CATEGORY_ORDER,
  SizeCategoryKey,
  SizeGroup,
  categorizeSize,
  sizeMatchesGender,
} from './size-categories';

// A grader reads a run smallest → largest. `skuOrd` is the dictionary's own ordinal inside a
// SKU system; ids are the fallback (and the tie-break, so the order is total and stable).
function bySkuOrd(a: common_Size, b: common_Size) {
  return (a.skuOrd ?? a.id ?? 0) - (b.skuOrd ?? b.id ?? 0) || (a.id ?? 0) - (b.id ?? 0);
}

// Same grouping as `groupSizesByCategory`, with one addition it cannot make: an already-selected
// size is never dropped by the gender filter. A selection that vanishes from the UI while staying
// in the payload is indistinguishable from data loss, and target gender is editable after the fact.
function groupSizes(
  sizes: common_Size[],
  gender: string | undefined,
  selected: Set<number>,
): SizeGroup[] {
  const buckets = new Map<SizeCategoryKey, common_Size[]>();
  for (const s of sizes) {
    if (!selected.has(s.id ?? 0) && !sizeMatchesGender(s.name ?? '', gender)) continue;
    const key = categorizeSize(s.name ?? '');
    const bucket = buckets.get(key);
    if (bucket) bucket.push(s);
    else buckets.set(key, [s]);
  }
  return SIZE_CATEGORY_ORDER.map(({ key, label }) => ({
    key,
    label,
    sizes: [...(buckets.get(key) ?? [])].sort(bySkuOrd),
  })).filter((g) => g.sizes.length > 0);
}

export type SizeSystems = {
  /** Systems the style's category permits — rendered inline, no click required. */
  permitted: SizeGroup[];
  /** What the category filtered out — the "more systems" popover. Empty when nothing was filtered. */
  other: SizeGroup[];
  /** True when the category actually narrowed the offer, i.e. `other` has something in it. */
  narrowed: boolean;
};

/**
 * The single answer to "which sizes may this thing use". Two callers used to derive it
 * independently — the inline grid in the tech card and the picker overlay — and a filter that
 * disagrees with itself offers a size in one place and hides it in the other.
 *
 * Two filters compose here:
 *   - target gender (`sizeMatchesGender`, gendered BO_/TA_ suffixes)
 *   - the category's permitted SKU systems (S10/WS5, resolved by `permittedSizeSystems`)
 *
 * Neither filter can hide a size that is already selected.
 */
export function useSizeSystems({
  gender,
  allowedSizeSystems,
  selectedIds,
}: {
  gender?: string;
  /** Unset = the category maps nothing, so every system is permitted and `other` is empty. */
  allowedSizeSystems?: common_SizeSkuSystem[];
  selectedIds?: number[];
}): SizeSystems {
  const { dictionary } = useDictionary();
  // Callers rebuild these arrays every render, so key the memo on content, not identity.
  const selectedKey = (selectedIds ?? []).join(',');
  const allowKey = (allowedSizeSystems ?? []).join(',');

  return useMemo(() => {
    const sizes = dictionary?.sizes ?? [];
    const allow = allowKey ? new Set(allowKey.split(',') as common_SizeSkuSystem[]) : undefined;
    const selected = new Set(selectedKey ? selectedKey.split(',').map(Number) : []);
    const inSystem = (s: common_Size) =>
      !allow || allow.has(s.skuSystem ?? 'SIZE_SKU_SYSTEM_UNKNOWN') || selected.has(s.id ?? 0);

    const other = allow
      ? groupSizes(
          sizes.filter((s) => !inSystem(s)),
          gender,
          selected,
        )
      : [];
    return {
      permitted: groupSizes(sizes.filter(inSystem), gender, selected),
      other,
      narrowed: other.length > 0,
    };
  }, [dictionary?.sizes, allowKey, selectedKey, gender]);
}

/** id → dictionary name. Every size-shaped field needs this map; none of them should build it. */
export function useSizeNames(): Map<number, string> {
  const { dictionary } = useDictionary();
  return useMemo(() => {
    const m = new Map<number, string>();
    for (const s of dictionary?.sizes ?? []) if (s.id != null) m.set(s.id, s.name ?? `#${s.id}`);
    return m;
  }, [dictionary?.sizes]);
}

/**
 * Sorts a set of size ids into grade order. The grade rule in the size chart is meaningless
 * unless the run is ordered — a step of +4 only means anything relative to the neighbours.
 */
export function useSizeOrdering(): (ids: number[]) => number[] {
  const { dictionary } = useDictionary();
  const ord = useMemo(() => {
    const m = new Map<number, number>();
    for (const s of dictionary?.sizes ?? []) if (s.id != null) m.set(s.id, s.skuOrd ?? s.id);
    return m;
  }, [dictionary?.sizes]);

  return useCallback(
    (ids: number[]) => [...ids].sort((a, b) => (ord.get(a) ?? a) - (ord.get(b) ?? b) || a - b),
    [ord],
  );
}
