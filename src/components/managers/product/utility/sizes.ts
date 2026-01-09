import { common_Dictionary, common_GenderEnum, common_ProductNew } from 'api/proto-http/admin';
import { sortItems } from 'lib/features/filter-size-measurements';

interface FilterSizesOptions {
  showBottoms?: boolean;
  showTailored?: boolean;
  gender?: common_GenderEnum | string;
}

export function getFilteredSizes(
  dictionary: common_Dictionary | undefined,
  topCategoryId: number,
  typeId?: number,
  options?: FilterSizesOptions,
) {
  if (!dictionary?.sizes) return [];

  const { showBottoms = false, showTailored = false, gender } = options || {};

  const shoesCategoryId = dictionary.categories?.find((c) => c.name?.toLowerCase() === 'shoes')?.id;
  const ringCategoryId = dictionary.categories?.find((c) => c.name?.toLowerCase() === 'rings')?.id;

  const isShoes = topCategoryId === shoesCategoryId;
  const isRings = typeId === ringCategoryId;
  const defaultSizes = sortItems(dictionary?.sizes || []).filter((size) => {
    return size.id && size.id >= 1 && size.id <= 8;
  });

  if (!topCategoryId) {
    return defaultSizes;
  }

  // Determine the size suffix based on toggle and gender
  let sizeSuffix: string | null = null;
  if (showBottoms && gender) {
    const genderSuffix = gender === 'GENDER_ENUM_WOMEN' ? 'f' : 'm';
    sizeSuffix = `bo_${genderSuffix}`;
  } else if (showTailored && gender) {
    const genderSuffix = gender === 'GENDER_ENUM_WOMEN' ? 'f' : 'm';
    sizeSuffix = `ta_${genderSuffix}`;
  }

  return sortItems(dictionary?.sizes || []).filter((size) => {
    if (isShoes || isRings) {
      return size.id && size.id > 8;
    }

    // If we have a specific size suffix filter, apply it
    if (sizeSuffix && size.name) {
      return size.name.toLowerCase().endsWith(sizeSuffix.toLowerCase());
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

/**
 * Formats size name from "xs_44ta_m" to "xs [44]"
 * Extracts size prefix and number, removes suffix
 */
export const formatSizeName = (sizeName?: string): string => {
  if (!sizeName) return '';

  // Split by underscore: ["xs", "44ta", "m"]
  const parts = sizeName.split('_');

  if (parts.length < 2) return sizeName;

  const sizePrefix = parts[0]; // "xs"
  const numberPart = parts[1].match(/\d+/)?.[0]; // "44" from "44ta"

  if (!numberPart) return sizePrefix;

  return `${sizePrefix} [${numberPart}]`;
};
