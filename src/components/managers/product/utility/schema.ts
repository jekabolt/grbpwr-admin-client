import { common_GenderEnum } from 'api/proto-http/admin';
import { z } from 'zod';

const productTranslationSchema = z.object({
  languageId: z.number().min(1, 'Language ID is required'),
  name: z.string().min(1, 'Name is required'),
  description: z.string().min(1, 'Description is required'),
});

const productBodySchema = z.object({
  brand: z
    .string()
    .min(1, 'Brand is required')
    .regex(/^(?![_\.\-]+$)/, 'Brand cannot consist only of special symbols')
    .max(35, 'Brand cannot exceed 35 characters'),
  targetGender: z.string().min(1, 'Gender is required'),
  topCategoryId: z.string().min(1, 'Category is required'),
  subCategoryId: z.string().optional(),
  typeId: z.string().optional(),
  color: z.string().min(1, 'Color is required'),
  colorHex: z.string().min(1, 'Color hex is required'),
  countryOfOrigin: z.string().min(1, 'Country is required'),
  price: z.object({
    value: z
      .string()
      .min(1, 'Price is required')
      .regex(/^\d*\.?\d{0,2}$/, 'Price must be a valid number greater than 0'),
  }),
  salePercentage: z.object({
    value: z.string().regex(/^\d*\.?\d{0,2}$/, 'Sale percentage must be a valid number'),
  }),
  collection: z.string().min(1, 'Collection is required'),
  version: z.string().min(1, 'Version is required'),
  careInstructions: z.string().min(1, 'Care instructions is required'),
  composition: z.string().min(1, 'Composition is required'),
  preorder: z.string().optional(),
  hidden: z.boolean().optional(),
  modelWearsHeightCm: z.string().optional(),
  modelWearsSizeId: z.string().optional(),
});

export const baseProductSchema = z.object({
  product: z.object({
    productBodyInsert: productBodySchema,
    thumbnailMediaId: z.number().min(1, 'Thumbnail must be selected'),
    translations: z.array(productTranslationSchema).min(1, 'At least one translation is required'),
  }),
  mediaIds: z.array(z.number()).min(1, 'At least one media must be added to the product'),
  tags: z.array(
    z.object({
      tag: z.string().min(1, 'Tag is required'),
    }),
  ),
  sizeMeasurements: z
    .array(
      z.object({
        productSize: z.object({
          quantity: z.object({
            // Allow empty string for unselected sizes; rely on array-level refine below
            value: z.string(),
          }),
          sizeId: z.number().min(1, 'Size is required'),
        }),
        measurements: z
          .array(
            z.object({
              measurementNameId: z.number(),
              measurementValue: z.object({
                value: z.string(),
              }),
            }),
          )
          .optional(),
      }),
    )
    .refine((sizes) => sizes.some((size) => size.productSize.quantity.value !== '0'), {
      message: 'At least one size must be specified',
    }),
});

export const productSchema = baseProductSchema;

export const defaultData = {
  product: {
    productBodyInsert: {
      preorder: '0001-01-01T00:00:00Z',
      brand: '',
      careInstructions: '',
      composition: '',
      color: '',
      colorHex: '',
      countryOfOrigin: '',
      price: { value: '0' },
      salePercentage: { value: '0' },
      topCategoryId: '',
      subCategoryId: '',
      typeId: '',
      hidden: false,
      targetGender: '' as common_GenderEnum,
      modelWearsHeightCm: undefined,
      modelWearsSizeId: undefined,
      version: '',
      collection: '',
    },
    thumbnailMediaId: 0,
    translations: [{ languageId: 1, name: '', description: '' }],
  },
  mediaIds: [],
  tags: [],
  sizeMeasurements: [],
};

export type ProductFormData = z.infer<typeof productSchema>;
