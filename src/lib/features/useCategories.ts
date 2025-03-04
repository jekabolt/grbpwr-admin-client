import { useDictionaryStore } from "lib/stores/store";
import { useMemo } from "react";
import { processCategories } from "./proceed-categories";

interface Categories {
    value: string;
    label: string;
}


export function useCategories(topCategoryId: string, subCategoryId: string) {
    const { dictionary } = useDictionaryStore();

    const categories = useMemo(() => processCategories(dictionary?.categories || []), [dictionary?.categories]);

    const topCategories = useMemo(() => categories.find((c) => c.id.toString() === topCategoryId), [categories, topCategoryId]);

    const subCategories = useMemo(() => topCategories?.subCategories || [], [topCategories]);

    const selectedSubCategory = useMemo(() =>
        subCategories.find((sub) => sub.id.toString() === subCategoryId),
        [subCategories, subCategoryId]
    );

    const types = useMemo(() => selectedSubCategory?.types || [], [selectedSubCategory]);

    const topCategoryOptions: Categories[] = useMemo(() =>
        categories.map((category) => ({
            value: category.id.toString(),
            label: category.name,
        })),
        [categories]
    );

    const subCategoryOptions: Categories[] = useMemo(() =>
        subCategories.map((category) => ({
            value: category.id.toString(),
            label: category.name,
        })),
        [subCategories]
    );

    const typeOptions: Categories[] = useMemo(() =>
        types.map((type) => ({
            value: type.id.toString(),
            label: type.name,
        })),
        [types]
    );

    return {
        topCategoryOptions,
        subCategoryOptions,
        typeOptions,
        selectedTopCategoryName: topCategories?.name,
        selectedSubCategoryName: selectedSubCategory?.name,
        categories
    };
}