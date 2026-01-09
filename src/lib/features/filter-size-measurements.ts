export function sortItems(
  items: { id?: number; name?: string }[] = [],
): { id?: number; name?: string }[] {
  return items.sort((a, b) => (a.id ?? 0) - (b.id ?? 0));
}
