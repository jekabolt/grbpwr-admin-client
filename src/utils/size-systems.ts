import {
  common_Category,
  common_CategorySizeSystem,
  common_Size,
  common_SizeSkuSystem,
} from 'api/proto-http/admin';

// Resolve which size systems a style may use from its category (S10/WS5). CategorySizeSystem maps a
// category-tree node (category_id) OR a leaf type (type_id) to a permitted SizeSkuSystem; the picker
// walks the style's category chain and takes the MOST SPECIFIC match (deepest node; a type match at a
// node beats a category match).
//
// THREE ANSWERS, THE SERVER'S THREE (`entity.ResolveSizeSystemPolicy`):
//   · `undefined` — no category yet (or the dictionary has not arrived): every size is allowed;
//   · `[]`        — a category with NO mapping anywhere on its chain (bags, objects): the server's
//                   OS-fallback, the one size named `os` and nothing else (`sizeInSystems`);
//   · otherwise   — the permitted systems.
// Before the onboarding wave the second case read as the first, and the client offered every size
// on a category whose writes the server then refused for anything but `os`.
export function permittedSizeSystems(
  categories: common_Category[] | undefined,
  systems: common_CategorySizeSystem[] | undefined,
  categoryId?: number,
): common_SizeSkuSystem[] | undefined {
  if (!categoryId || !categories?.length) return undefined;

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
    const matches = (systems ?? []).filter(
      (s) => (s.typeId && s.typeId === node) || (s.categoryId && s.categoryId === node),
    );
    if (matches.length === 0) continue;
    const set = new Set<common_SizeSkuSystem>();
    for (const m of matches) {
      if (m.skuSystem && m.skuSystem !== 'SIZE_SKU_SYSTEM_UNKNOWN') set.add(m.skuSystem);
    }
    if (set.size) return [...set];
  }
  return [];
}

/** The one-size entry the server's OS-fallback allows — a size NAME, there is no OS sku system. */
export const OS_SIZE_NAME = 'os';

/**
 * Whether one size is inside the answer of `permittedSizeSystems` — the server's `Allows`, read the
 * same way: unset = every size, empty = `os` only, else the size's system must be listed.
 */
export function sizeInSystems(
  size: common_Size,
  allow: common_SizeSkuSystem[] | undefined,
): boolean {
  if (!allow) return true;
  if (allow.length === 0) return (size.name ?? '').toLowerCase() === OS_SIZE_NAME;
  return allow.includes(size.skuSystem ?? 'SIZE_SKU_SYSTEM_UNKNOWN');
}
