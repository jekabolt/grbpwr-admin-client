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

export const generateSKU = (brand: string | undefined, categoryId: number | undefined, color: string | undefined, country: string | undefined) => {
    if (brand) {
        const removeSpaces = brand.replace(/\s/g, '');
        const formattedBrand = removeSpaces.length > 6 ? removeSpaces.substring(0, 6) : removeSpaces;
        const colorCode = color?.substring(0, 2);
        const date = getCurrentSeasonCode();
        return `${formattedBrand}${categoryId}${colorCode}${country}${date}`.toUpperCase();
    }
};