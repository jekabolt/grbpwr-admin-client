import { common_GenderEnum } from 'api/proto-http/admin';
import { currencySymbols, LANGUAGES } from 'constants/constants';
import { z } from 'zod';

const requiredLanguageIds = LANGUAGES.map((l) => l.id);

const productTranslationSchema = z.object({
  languageId: z.number().min(1, 'Language ID is required'),
  name: z.string().min(1, 'Name is required'),
  description: z.string().min(1, 'Description is required'),
});

const createStrictTranslationSchema = <T extends z.ZodType>(
  translationSchema: T,
  requiredIds: number[],
) => {
  return z
    .array(translationSchema)
    .min(1, 'At least one translation is required')
    .refine(
      (arr) => {
        const ids = arr.map((t: any) => t.languageId);
        const uniqueIds = new Set(ids);
        return uniqueIds.size === ids.length;
      },
      { message: 'Each language can only appear once' },
    )
    .refine((arr) => arr.length === requiredIds.length, {
      message: `Exactly ${requiredIds.length} language(s) required`,
    })
    .refine((arr) => requiredIds.every((id) => arr.some((t: any) => t.languageId === id)), {
      message: 'All languages must be filled (name and description for each)',
    });
};

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
  fit: z.string().optional(),
});

const priceEntrySchema = z.object({
  currency: z.string().min(1, 'Currency is required'),
  price: z.object({
    value: z
      .string()
      .min(1, 'Price is required')
      .regex(/^\d*\.?\d{0,2}$/, 'Price must be a valid number'),
  }),
});

const allPricesFilledRefine = (arr: { price?: { value?: string } }[]) =>
  arr.every((p) => {
    const v = p?.price?.value;
    return v != null && v !== '' && parseFloat(v) > 0;
  });

export const baseProductSchema = z
  .object({
    product: z.object({
      productBodyInsert: productBodySchema,
      thumbnailMediaId: z.number().min(1, 'Thumbnail must be selected'),
      secondaryThumbnailMediaId: z.number().optional(),
      translations: createStrictTranslationSchema(productTranslationSchema, requiredLanguageIds),
      prices: z.array(priceEntrySchema).min(1, 'At least one price must be specified'),
    }),
    prices: z.array(priceEntrySchema).min(1, 'At least one price must be specified'),
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
  })
  .refine((data) => allPricesFilledRefine(data.prices), {
    message: 'All prices must be filled (value greater than 0)',
    path: ['prices'],
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
      fit: '',
    },
    thumbnailMediaId: 0,
    secondaryThumbnailMediaId: 0,
    translations: LANGUAGES.map((l) => ({ languageId: l.id, name: '', description: '' })),
    prices: Object.keys(currencySymbols).map((currency) => ({
      currency,
      price: { value: '0' },
    })),
  },
  prices: Object.keys(currencySymbols).map((currency) => ({
    currency,
    price: { value: '0' },
  })),
  mediaIds: [],
  tags: [],
  sizeMeasurements: [],
};

export type ProductFormData = z.infer<typeof productSchema>;
