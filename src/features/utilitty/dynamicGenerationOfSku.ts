import { common_GenderEnum } from "api/proto-http/admin";

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
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
    return uuid.slice(0, 4);
}

const getColorCode = (color: string | undefined) => {
    if (!color) return
    const words = color?.split('_');
    return words.length >= 2 ? words[0][0] + words[1][0] : color?.substring(0, 2);
};

const formatCategory = (categoryId: string | undefined) => {
    if (!categoryId) return;
    const cleanCategory = categoryId.replace('CATEGORY_ENUM_', '').replace(/_/g, '');
    return cleanCategory.substring(0, 4);
};


export const generateSKU = (brand: string | undefined, gender: common_GenderEnum | undefined, categoryId: string | undefined, color: string | undefined, country: string | undefined) => {
    if (brand) {
        const removeSpaces = brand.replace(/\s/g, '');
        const formattedBrand = removeSpaces.length > 6 ? removeSpaces.substring(0, 6) : removeSpaces;
        const colorCode = getColorCode(color)
        const date = getCurrentSeasonCode();
        const randomNumbers = generateNumbers()
        const formattedGender = gender?.replace('GENDER_ENUM_', '').charAt(0)
        const formattedCategory = formatCategory(categoryId)
        return `${formattedBrand}${formattedGender}${formattedCategory}${colorCode}${country}${date}${randomNumbers}`.toUpperCase();
    }
};