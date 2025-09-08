import { common_GenderEnum } from 'api/proto-http/admin';
import { z } from 'zod';

const productTranslationSchema = z.object({
    languageId: z.number().min(1, 'Language ID is required'),
    name: z.string().min(1, 'Name is required'),
    description: z.string().min(1, 'Description is required'),
});

const productBodySchema = z.object({
    brand: z.string().min(1, 'Brand is required').regex(/^(?![_\.\-]+$)/, 'Brand cannot consist only of special symbols').max(35, 'Brand cannot exceed 35 characters'),
    targetGender: z.string().min(1, 'Gender is required'),
    topCategoryId: z.number().min(1, 'Category is required'),
    color: z.string().min(1, 'Color is required'),
    countryOfOrigin: z.string().min(1, 'Country is required'),
    price: z.object({
        value: z.string().min(1, 'Price is required').regex(/^\d*\.?\d{0,2}$/, 'Price must be a valid number greater than 0'),
    }),
})

export const baseProductSchema = z.object({
    product: z.object({
        productBodyInsert: productBodySchema,
        thumbnailMediaId: z.number().min(1, 'Thumbnail must be selected'),
        translations: z.array(productTranslationSchema).min(1, 'At least one translation is required'),
    }),
    mediaIds: z.array(z.number()).min(1, 'At least one media must be added to the product'),
    tags: z.array(z.object({
        tag: z.string().min(1, 'Tag is required'),
    })),
    sizeMeasurements: z.array(z.object({
        productSize: z.object({
            quantity: z.object({
                value: z.string().min(1, 'Quantity is required'),
            }),
            sizeId: z.number().min(1, 'Size is required'),
        }),
    })).refine(
        (sizes) => sizes.some((size) => size.productSize.quantity.value !== '0'),
        {
            message: 'At least one size must be specified',
        }
    ),
});

export const productSchema = baseProductSchema

export const defaultData = {
    product: {
        productBodyInsert: {
            preorder: '0001-01-01T00:00:00Z',
            brand: '',
            sku: '',
            careInstructions: '',
            composition: '',
            color: '',
            colorHex: '',
            countryOfOrigin: '',
            price: { value: '0' },
            salePercentage: { value: '0' },
            topCategoryId: undefined,
            subCategoryId: undefined,
            typeId: undefined,
            hidden: false,
            targetGender: '' as common_GenderEnum,
            modelWearsHeightCm: undefined,
            modelWearsSizeId: undefined,
        },
        thumbnailMediaId: 0,
        translations: [{ languageId: 1, name: '', description: '' }],
    },
    mediaIds: [],
    tags: [],
    sizeMeasurements: [],
};

export type ProductFormData = z.infer<typeof productSchema>;