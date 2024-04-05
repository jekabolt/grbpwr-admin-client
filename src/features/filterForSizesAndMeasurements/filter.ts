export function sortItems(items: { id?: number }[] = []): { id?: number }[] {
    return items
        .filter((item) => item.id !== undefined)
        .sort((a, b) => (a.id ?? 0) - (b.id ?? 0));
}