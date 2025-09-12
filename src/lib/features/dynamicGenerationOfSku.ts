import { common_GenderEnum } from 'api/proto-http/admin';

const getCurrentSeasonCode = () => {
  const date = new Date();
  const month = date.getMonth();
  const year = date.getFullYear().toString().slice(-2);
  if (month >= 2 && month <= 8) {
    return `SS${year}`;
  } else {
    return `FW${year}`;
  }
};

const generateNumbers = () => {
  const uuid = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
  return uuid.slice(0, 4);
};

const getColorCode = (color: string | undefined) => {
  if (!color) return;
  const words = color?.split('_');
  return words.length >= 2 ? words[0][0] + words[1][0] : color?.substring(0, 2);
};

const formatCategory = (categoryName: string | undefined) => {
  if (!categoryName) return;
  const cleanCategory = categoryName.replace(/\s/g, '');
  if (cleanCategory.length < 6) {
    return cleanCategory.padEnd(6, '0');
  }
  return cleanCategory.substring(0, 6);
};

const sanitizeBrand = (brand: string) => {
  return brand
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\/\-,\$%\^:;()!@#&*+=`~.{}|\[\]_]/g, '');
};

const formatBrand = (brand: string) => {
  const sanitizedBrand = sanitizeBrand(brand).replace(/\s/g, '');
  if (sanitizedBrand.length < 6) {
    return sanitizedBrand.padEnd(6, '0');
  }
  return sanitizedBrand.substring(0, 6);
};

export const generateSKU = (
  brand: string | undefined,
  gender: common_GenderEnum | undefined,
  categoryName: string | undefined,
  color: string | undefined,
  country: string | undefined,
  existingUuid?: string,
) => {
  if (brand) {
    const formattedBrand = formatBrand(brand);
    const colorCode = getColorCode(color);
    const date = getCurrentSeasonCode();
    const randomNumbers = existingUuid || generateNumbers();
    const formattedGender = gender?.replace('GENDER_ENUM_', '').charAt(0);
    const formattedCategory = formatCategory(categoryName);
    return `${formattedBrand}${formattedGender}${formattedCategory}${colorCode}${country}${date}${randomNumbers}`.toUpperCase();
  }
};

export const generateOrUpdateSKU = (
  currentSKU: string | undefined,
  productBody: any,
): string | undefined => {
  const existingUuid = currentSKU ? currentSKU.slice(-4) : generateNumbers();
  const categoryName = productBody.categoryName;

  return generateSKU(
    productBody.brand,
    productBody.targetGender,
    categoryName,
    productBody.color,
    productBody.countryOfOrigin,
    existingUuid,
  );
};
