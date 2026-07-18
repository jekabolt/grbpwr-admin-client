import { common_GenderEnum, common_SeasonEnum } from 'api/proto-http/admin';
import { currencySymbols, LANGUAGES } from 'constants/constants';
import { z } from 'zod';

const requiredLanguageIds = LANGUAGES.map((l) => l.id);

const productTranslationSchema = z.object({
  languageId: z.number().min(1, 'Language ID is required'),
  name: z.string().min(1, 'Name is required'),
  description: z.string().min(1, 'Description is required'),
});

// Draft translations keep the same SHAPE (so the inferred form type is identical) but drop the
// per-field required checks — a DRAFT colourway may be created before every language is filled.
const draftTranslationSchema = z.object({
  languageId: z.number(),
  name: z.string(),
  description: z.string(),
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

// R2/R4: brand, gender, categories, collection, care, composition, fit and season are STYLE facts —
// owned by the tech card and only shown read-only on the colourway form (buildColorwayWrite never
// submits them). So they are never required here regardless of draft/active: requiring a value the
// operator cannot edit on this screen would be a dead gate. Only genuinely colourway-owned fields
// (colour, country, media, translations, prices, sizes) participate in completeness — and those are
// enforced only when strict (an ACTIVE colourway), never on a DRAFT.
const makeProductBodySchema = (strict: boolean) =>
  z.object({
    // Derived style fact — kept for shape/format only, never required on this form.
    brand: z
      .string()
      .regex(/^(?![_\.\-]+$)/, 'Brand cannot consist only of special symbols')
      .max(35, 'Brand cannot exceed 35 characters'),
    targetGender: z.string(),
    topCategoryId: z.string(),
    subCategoryId: z.string().optional(),
    typeId: z.string().optional(),
    // R1/R9: colour identity is the dictionary color_code (FK Dictionary.colors) — the backend
    // REQUIRES it on every write (create AND update), so it stays required even for a draft.
    colorCode: z.string().min(1, 'Color is required'),
    colorHexOverride: z.string().optional(),
    // Colourway-owned manufacture country. Required only once the colourway is ACTIVE.
    countryOfOrigin: strict ? z.string().min(1, 'Country is required') : z.string(),
    salePercentage: z.object({
      value: z.string().regex(/^\d*\.?\d{0,2}$/, 'Sale percentage must be a valid number'),
    }),
    // Derived style facts — read-only here, never required.
    collection: z.string(),
    careInstructions: z.string(),
    composition: z.string(),
    preorder: z.string().optional(),
    // Minimum loyalty tier code required to buy (0 / 1 / 2 / 99).
    minTier: z.string().optional(),
    modelWearsHeightCm: z.string().optional(),
    modelWearsSizeId: z.string().optional(),
    fit: z.string().optional(),
    season: z.string().optional(),
  });

const INTEGER_CURRENCIES = ['JPY', 'KRW'];

const priceEntrySchema = z.object({
  currency: z.string().min(1, 'Currency is required'),
  price: z.object({
    value: z
      .string()
      // Empty is allowed so a DRAFT can be saved with prices still blank; the "all filled"
      // completeness gate below is what makes prices mandatory, and only in strict (ACTIVE) mode.
      .regex(/^\d*\.?\d{0,2}$/, 'Price must be a valid number'),
  }),
});

const priceEntryIntegerRefine = (entry: { currency: string; price?: { value?: string } }) =>
  !INTEGER_CURRENCIES.includes(entry.currency) || /^\d*$/.test(entry.price?.value ?? '');

const isPriceFilled = (p: { price?: { value?: string } }) => {
  const v = p?.price?.value;
  return v != null && v !== '' && parseFloat(v) > 0;
};

// Named (not just "some price is missing") so the operator doesn't have to hunt across every
// currency row to find which one is still blank — existing live products already have a
// backfilled PLN price from the backend migration, so this mostly points at genuinely new
// currencies.
const missingPriceCurrencies = (arr: { currency: string; price?: { value?: string } }[]) =>
  arr.filter((p) => !isPriceFilled(p)).map((p) => p.currency);

// R6/§14.6 + admin #65: DRAFT colourways are created/saved incrementally — media, translations,
// prices, sizes and the size chart are all filled after the draft exists (variants and the chart are
// separate RPCs). Completeness is enforced server-side at Publish (surfaced as an actionable
// checklist by <LifecycleControls/>), so the client only hard-gates completeness for an already-live
// (strict) colourway. `strict = false` yields the DRAFT schema used on create and while a colourway
// is still DRAFT.
const makeProductSchema = (strict: boolean) =>
  z
    .object({
      // R2/R4: a colourway attaches to an existing style (there is no CreateStyle RPC — a style is a
      // tech card). On create, this is the target style id; on edit it mirrors the loaded colourway's
      // style_id (read-only). Copy prefills it from the source colourway.
      styleId: z.string().optional(),
      product: z.object({
        productBodyInsert: makeProductBodySchema(strict),
        thumbnailMediaId: strict ? z.number().min(1, 'Thumbnail must be selected') : z.number(),
        secondaryThumbnailMediaId: z.number().optional(),
        translations: strict
          ? createStrictTranslationSchema(productTranslationSchema, requiredLanguageIds)
          : z.array(draftTranslationSchema),
        prices: z.array(priceEntrySchema).min(1, 'At least one price must be specified'),
        // Confidential per-unit COGS in base currency (EUR), write-only — feeds margin
        // analytics. Optional; empty leaves the stored value unchanged on update.
        costPrice: z
          .string()
          .regex(/^\d*\.?\d{0,2}$/, 'Cost must be a valid number')
          .optional(),
      }),
      prices: z.array(priceEntrySchema).min(1, 'At least one price must be specified'),
      mediaIds: strict
        ? z.array(z.number()).min(1, 'At least one media must be added to the product')
        : z.array(z.number()),
      tags: z.array(
        z.object({
          tag: z.string().min(1, 'Tag is required'),
        }),
      ),
      sizeMeasurements: z.array(
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
      ),
    })
    .superRefine((data, ctx) => {
      // Prices are mandatory (all currencies filled) only for a live/strict colourway; a DRAFT
      // saves with partial or empty prices.
      if (strict) {
        const missing = missingPriceCurrencies(data.prices);
        if (missing.length) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `All prices must be filled (value greater than 0). Missing prices for: ${missing.join(', ')}`,
            path: ['prices'],
          });
        }
      }

      // At least one sellable size is required only for a live/strict colourway; on a DRAFT, variants
      // and stock are added after creation.
      if (
        strict &&
        !data.sizeMeasurements.some((size) => size.productSize.quantity.value !== '0')
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'At least one size must be specified',
          path: ['sizeMeasurements'],
        });
      }

      const hasInvalidIntegerCurrency = data.prices.some(
        (entry) => !priceEntryIntegerRefine(entry),
      );
      if (hasInvalidIntegerCurrency) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'JPY and KRW must be whole numbers (no decimals)',
          path: ['prices'],
        });
      }

      // Integer-only currencies (JPY/KRW) cannot end up with a fractional sale price.
      const sale = Math.max(
        0,
        Math.min(
          99,
          parseFloat(data.product?.productBodyInsert?.salePercentage?.value ?? '0') || 0,
        ),
      );
      if (sale > 0) {
        const offending = data.prices
          .filter((entry) => {
            if (!INTEGER_CURRENCIES.includes(entry.currency)) return false;
            const base = parseFloat(entry.price?.value ?? '0') || 0;
            if (base <= 0) return false;
            return !Number.isInteger((base * (100 - sale)) / 100);
          })
          .map((entry) => entry.currency);

        if (offending.length) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Sale price for ${offending.join('/')} must be a whole number — adjust the base price or sale %`,
            path: ['prices'],
          });
        }
      }
    });

// Strict schema — an ACTIVE/HIDDEN colourway must stay complete.
export const productSchema = makeProductSchema(true);
// Lenient schema — used on create and while a colourway is still DRAFT (#65): partial prices, no
// media/translation/size completeness gate. Publish (server-side) is the real completeness check.
export const draftProductSchema = makeProductSchema(false);

export const defaultData = {
  styleId: '',
  product: {
    productBodyInsert: {
      preorder: '0001-01-01T00:00:00Z',
      brand: '',
      careInstructions: '',
      composition: '',
      colorCode: '',
      colorHexOverride: '',
      countryOfOrigin: '',
      salePercentage: { value: '0' },
      topCategoryId: '',
      subCategoryId: '',
      typeId: '',
      minTier: '0',
      targetGender: '' as common_GenderEnum,
      modelWearsHeightCm: undefined,
      modelWearsSizeId: undefined,
      collection: '',
      fit: '',
      season: '' as common_SeasonEnum,
    },
    thumbnailMediaId: 0,
    secondaryThumbnailMediaId: 0,
    translations: LANGUAGES.map((l) => ({ languageId: l.id, name: '', description: '' })),
    prices: Object.keys(currencySymbols).map((currency) => ({
      currency,
      price: { value: '0' },
    })),
    costPrice: '',
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
