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

export const generateSKU = (brand: string | undefined, categoryId: number | undefined, color: string | undefined, country: string | undefined) => {
    if (brand) {
        const removeSpaces = brand.replace(/\s/g, '');
        const formattedBrand = removeSpaces.length > 6 ? removeSpaces.substring(0, 6) : removeSpaces;
        const colorCode = getColorCode(color)
        const date = getCurrentSeasonCode();
        const randomNumbers = generateNumbers()
        return `${formattedBrand}${categoryId}${colorCode}${country}${date}${randomNumbers}`.toUpperCase();
    }
};