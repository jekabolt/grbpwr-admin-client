import { common_Category } from "api/proto-http/admin";
import { processCategories } from "../../utility/categories";

interface MeasurementMapping {
    measurements: string[];
}

export const CATEGORY_MEASUREMENTS: { [key: string]: MeasurementMapping } = {
    'outerwear': {
        measurements: ['shoulders', 'sleeve', 'bust', 'waist', 'length']
    },
    'bottoms': {
        measurements: ['waist', 'length', 'inseam']
    },
    'dresses': {
        measurements: ['shoulders', 'bust', 'waist', 'length']
    },
    'accessories': {
        measurements: ['width', 'length']
    },
    'bags': {
        measurements: ['width', 'length']
    },
    'shoes': {
        measurements: []
    },
    'home': {
        measurements: []
    },
    'body': {
        measurements: []
    }
};

export const SUBCATEGORY_MEASUREMENTS: { [key: string]: MeasurementMapping } = {
    'vests': {
        measurements: ['shoulders', 'waist', 'length', 'bust']
    },
    'shirts': {
        measurements: ['shoulders', 'bust', 'length', 'sleeve']
    },
    'tshirts': {
        measurements: ['shoulders', 'sleeve', 'waist', 'length']
    },
    'tanks': {
        measurements: ['shoulders', 'waist', 'length']
    },
    'crop': {
        measurements: ['waist', 'length', 'hips']
    },
    'sweaters_knits': {
        measurements: ['shoulders', 'sleeve', 'waist', 'length', 'bust']
    },
    'hoodies_sweatshirts': {
        measurements: ['shoulders', 'sleeve', 'waist', 'length', 'bust']
    },
    'shorts': {
        measurements: ['waist', 'length', 'inseam', 'hips']
    },
    'skirts': {
        measurements: ['waist', 'length', 'hips']
    },
    'bralettes': {
        measurements: ['bust']
    },
    'gloves': {
        measurements: []
    },
    'socks': {
        measurements: []
    },
    'hats': {
        measurements: []
    },

};

export const getMeasurementsForCategory = (categoryName: string | undefined, isSubCategory: boolean = false): string[] => {
    if (!categoryName) return [];

    if (categoryName.toLowerCase() === 'shoes') return [];

    const mapping = isSubCategory
        ? SUBCATEGORY_MEASUREMENTS[categoryName]
        : CATEGORY_MEASUREMENTS[categoryName];

    return mapping?.measurements || [];
};

export const getCategoryStructure = (categories: common_Category[]) => {
    const processedCategories = processCategories(categories);

    return processedCategories.map(topCategory => ({
        topCategory: topCategory.name,
        measurements: getMeasurementsForCategory(topCategory.name),
        subCategories: topCategory.subCategories?.map(sub => ({
            name: sub.name,
            measurements: getMeasurementsForCategory(sub.name, true)
        }))
    }));
};

export const isMeasurementRequiredForCategory = (
    measurementName: string,
    categoryName: string,
    isSubCategory: boolean = false
): boolean => {
    const requiredMeasurements = getMeasurementsForCategory(categoryName, isSubCategory);
    return requiredMeasurements.includes(measurementName.toLowerCase());
};