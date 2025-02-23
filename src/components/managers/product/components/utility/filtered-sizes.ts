import { common_Dictionary } from "api/proto-http/admin";
import { sortItems } from "lib/features/filter-size-measurements";

export function getFilteredSizes(dictionary: common_Dictionary | undefined, topCategoryId: number) {
    if (!dictionary?.sizes) return [];

    const isShoes = topCategoryId === 7;
    const defaultSizes = sortItems(dictionary?.sizes || []).filter((size) => {
        return size.id && size.id >= 1 && size.id <= 8;
    });

    if (!topCategoryId) {
        return defaultSizes;
    }

    return sortItems(dictionary?.sizes || []).filter((size) => {
        if (isShoes) {
            return size.id && size.id > 8;
        }
        return size.id && size.id >= 1 && size.id <= 8;
    });
}