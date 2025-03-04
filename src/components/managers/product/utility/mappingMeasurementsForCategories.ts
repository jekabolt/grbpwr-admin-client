import { common_Category } from "api/proto-http/admin";
import { processCategories } from "lib/features/proceed-categories";

interface MeasurementMapping {
    measurements: string[];
}

export const CATEGORY_MEASUREMENTS: { [key: string]: MeasurementMapping } = {
    'outerwear': {
        measurements: ['shoulders', 'sleeve', 'chest', 'length']
    },
    'tops': {
        measurements: ['shoulders', 'sleeve', 'chest', 'length']
    },
    'bottoms': {
        measurements: ['waist', 'length', 'inseam', 'leg-opening']
    },
    'dresses': {
        measurements: ['sleeve', 'chest', 'bottom-width', 'length']
    },
    'bags': {
        measurements: ['width', 'length', 'depth']
    },
    'shoes': {
        measurements: []
    },
    'objects': {
        measurements: ['height', 'width', '']
    }

};

export const SUBCATEGORY_MEASUREMENTS: { [key: string]: MeasurementMapping } = {
    'tanks': {
        measurements: ['shoulders', 'chest', 'length']
    },
    'crop': {
        measurements: ['waist', 'length', 'shoulders']
    },
    'shorts': {
        measurements: ['waist', 'length', 'inseam', 'hips']
    },
    'skirts': {
        measurements: ['waist', 'length', 'hips', 'bottom-width']
    },
    'boxers': {
        measurements: ['waist']
    },
    'bralettes': {
        measurements: ['chest']
    },
    'briefs': {
        measurements: ['waist']
    },
    'robes': {
        measurements: ['width', 'length']
    },
    'gloves': {
        measurements: ['width', 'length']
    },
    'belts': {
        measurements: ['width', 'length', 'start-fit-length', 'end-fit-length']
    }
};


export const TYPE_MEASUREMENTS: { [key: string]: MeasurementMapping } = {
    'necklaces': {
        measurements: ['length']
    },
    'earrings': {
        measurements: ['length', 'width']
    },
    'bracelets': {
        measurements: ['length', 'width']
    },
}

export const getMeasurementsForCategory = (categoryName: string | undefined, isSubCategory: boolean = false, typeName: string | undefined = undefined): string[] => {
    if (!categoryName) return [];

    if (categoryName.toLowerCase() === 'shoes') return [];

    let measurements: string[] = [];

    if (typeName) {
        measurements = TYPE_MEASUREMENTS[typeName.toLowerCase()]?.measurements || [];
        return measurements;
    }

    if (!isSubCategory) {
        measurements = CATEGORY_MEASUREMENTS[categoryName?.toLowerCase() || '']?.measurements || [];
    } else {
        measurements = SUBCATEGORY_MEASUREMENTS[categoryName?.toLowerCase() || '']?.measurements || [];
    }

    return measurements;
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