import {
  common_Category,
  common_CategorySizeSystem,
  common_SizeSkuSystem,
} from 'api/proto-http/admin';

// Resolve which size systems a style may use from its category (S10/WS5). CategorySizeSystem maps a
// category-tree node (category_id) OR a leaf type (type_id) to a permitted SizeSkuSystem; the picker
// walks the style's category chain and takes the MOST SPECIFIC match (deepest node; a type match at a
// node beats a category match). Returns undefined when nothing maps — the caller then shows all sizes.
export function permittedSizeSystems(
  categories: common_Category[] | undefined,
  systems: common_CategorySizeSystem[] | undefined,
  categoryId?: number,
): common_SizeSkuSystem[] | undefined {
  if (!categoryId || !systems?.length || !categories?.length) return undefined;

  const byId = new Map(categories.map((c) => [c.id, c] as const));
  // chain: leaf → root (most specific first)
  const chain: number[] = [];
  const seen = new Set<number>();
  let cur: number | undefined = categoryId;
  while (cur && !seen.has(cur)) {
    seen.add(cur);
    chain.push(cur);
    cur = byId.get(cur)?.parentId || undefined;
  }

  for (const node of chain) {
    const matches = systems.filter(
      (s) => (s.typeId && s.typeId === node) || (s.categoryId && s.categoryId === node),
    );
    if (matches.length === 0) continue;
    const set = new Set<common_SizeSkuSystem>();
    for (const m of matches) {
      if (m.skuSystem && m.skuSystem !== 'SIZE_SKU_SYSTEM_UNKNOWN') set.add(m.skuSystem);
    }
    if (set.size) return [...set];
  }
  return undefined;
}
