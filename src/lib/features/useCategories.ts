import { useDictionary } from 'lib/providers/dictionary-provider';
import { useMemo } from 'react';
import { processCategories } from './proceed-categories';

interface Categories {
  value: number;
  label: string;
}

export function useCategories(topCategoryId: number, subCategoryId: number, typeId: number = 0) {
  const { dictionary } = useDictionary();

  const categories = useMemo(
    () => processCategories(dictionary?.categories || []),
    [dictionary?.categories],
  );

  const topCategories = categories.find((c) => c.id === topCategoryId);
  const subCategories = topCategories?.subCategories || [];
  const selectedSubCategory = subCategories.find((sub) => sub.id === subCategoryId);
  const types = selectedSubCategory?.types || [];
  const selectedType = types.find((type) => type.id === typeId);

  const topCategoryOptions: Categories[] = useMemo(
    () =>
      categories.map((category) => ({
        value: category.id,
        label: category.name,
      })),
    [categories],
  );

  const subCategoryOptions: Categories[] = useMemo(
    () =>
      subCategories.map((category) => ({
        value: category.id,
        label: category.name,
      })),
    [subCategories],
  );

  const typeOptions: Categories[] = useMemo(
    () =>
      types.map((type) => ({
        value: type.id,
        label: type.name,
      })),
    [types],
  );

  return {
    topCategoryOptions,
    subCategoryOptions,
    typeOptions,
    selectedTopCategoryName: topCategories?.name,
    selectedSubCategoryName: selectedSubCategory?.name,
    selectedTypeName: selectedType?.name,
    categories,
  };
}
