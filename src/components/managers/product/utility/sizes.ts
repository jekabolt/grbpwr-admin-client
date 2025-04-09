import { common_Dictionary, common_ProductNew } from "api/proto-http/admin";
import { sortItems } from "lib/features/filter-size-measurements";

export function getFilteredSizes(dictionary: common_Dictionary | undefined, topCategoryId: number) {
    if (!dictionary?.sizes) return [];

    const shoesCategoryId = dictionary.categories?.find((c) => c.name?.toLowerCase() === 'shoes')?.id


    const isShoes = topCategoryId === shoesCategoryId;
    console.log('isShoes', isShoes);
    console.log('topCategoryId', topCategoryId);
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

export const getNonEmptySizeMeasurements = (values: common_ProductNew) => {
    return values.sizeMeasurements?.filter(
        (sizeMeasurement) =>
            sizeMeasurement &&
            sizeMeasurement.productSize &&
            sizeMeasurement.productSize.quantity !== null,
    );
};