import { z } from 'zod';
import { LANGUAGES } from 'constants/constants';

const requiredLanguageIds = LANGUAGES.map((l) => l.id);

// Reusable strict translation validator
const createStrictTranslationSchema = <T extends z.ZodType>(
  translationSchema: T,
  requiredIds: number[]
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
      { message: 'Each language can only appear once' }
    )
    .refine(
      (arr) => arr.length === requiredIds.length,
      { message: `Exactly ${requiredIds.length} language(s) required` }
    )
    .refine(
      (arr) => requiredIds.every((id) => arr.some((t: any) => t.languageId === id)),
      { message: 'All languages must be filled' }
    );
};

export const navFeatured = z.object({
  men: z.object({
    mediaId: z.number().min(0).optional(),
    featuredTag: z.string().optional(),
    featuredArchiveId: z.number().min(0).optional(),
    translations: createStrictTranslationSchema(
      z.object({
        languageId: z.number().min(1, 'Language is required'),
        exploreText: z
          .string()
          .min(1, 'Explore text is required')
          .max(25, 'Explore text must be at most 25 characters'),
      }),
      requiredLanguageIds
    ),
  }),
  women: z.object({
    mediaId: z.number().min(0).optional(),
    featuredTag: z.string().optional(),
    featuredArchiveId: z.number().min(0).optional(),
    translations: createStrictTranslationSchema(
      z.object({
        languageId: z.number().min(1, 'Language is required'),
        exploreText: z
          .string()
          .min(1, 'Explore text is required')
          .max(25, 'Explore text must be at most 25 characters'),
      }),
      requiredLanguageIds
    ),
  }),
});

const heroEntitySchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('HERO_TYPE_MAIN'),
    main: z.object({
      mediaLandscapeId: z
        .union([z.number(), z.undefined()])
        .refine((val) => val !== undefined && val >= 1, {
          message: 'Landscape media is required',
        }),
      mediaPortraitId: z
        .union([z.number(), z.undefined()])
        .refine((val) => val !== undefined && val >= 1, {
          message: 'Portrait media is required',
        }),
      mediaLandscapeUrl: z.string().optional(),
      mediaPortraitUrl: z.string().optional(),
      exploreLink: z.string().nullable().optional(),
      translations: createStrictTranslationSchema(
        z.object({
          languageId: z.number().min(1, 'Language is required'),
          headline: z.string().min(1, 'Headline is required'),
          tag: z.string().nullable().optional(),
          description: z
            .string()
            .min(1, 'Description is required')
            .max(138, 'Description must be at most 138 characters'),
          exploreText: z.string().min(1, 'Explore text is required'),
        }),
        requiredLanguageIds
      ),
    }),
  }),

  z.object({
    type: z.literal('HERO_TYPE_SINGLE'),
    single: z.object({
      mediaLandscapeId: z
        .union([z.number(), z.undefined()])
        .refine((val) => val !== undefined && val >= 1, {
          message: 'Landscape media is required',
        }),
      mediaPortraitId: z
        .union([z.number(), z.undefined()])
        .refine((val) => val !== undefined && val >= 1, {
          message: 'Portrait media is required',
        }),
      mediaLandscapeUrl: z.string().optional(),
      mediaPortraitUrl: z.string().optional(),
      exploreLink: z.string().nullable().optional(),
      translations: createStrictTranslationSchema(
        z.object({
          languageId: z.number().min(1, 'Language is required'),
          headline: z.string().max(117, 'Headline must be at most 117 characters').optional(),
          exploreText: z
            .string()
            .min(1, 'Explore text is required')
            .max(39, 'Explore text must be at most 39 characters'),
        }),
        requiredLanguageIds
      ),
    }),
  }),

  z.object({
    type: z.literal('HERO_TYPE_DOUBLE'),
    double: z
      .object({
        left: z.object({
          mediaLandscapeId: z
            .union([z.number(), z.undefined()])
            .refine((val) => val !== undefined && val >= 1, {
              message: 'Left media is required',
            }),
          mediaPortraitId: z
            .union([z.number(), z.undefined()])
            .refine((val) => val !== undefined && val >= 1, {
              message: 'Left media is required',
            }),
          mediaLandscapeUrl: z.string().optional(),
          mediaPortraitUrl: z.string().optional(),
          exploreLink: z.string().nullable().optional(),
          translations: createStrictTranslationSchema(
            z.object({
              languageId: z.number().min(1, 'Language is required'),
              headline: z.string().max(39, 'Headline must be at most 39 characters').optional(),
              exploreText: z
                .string()
                .min(1, 'Explore text is required')
                .max(39, 'Explore text must be at most 39 characters'),
            }),
            requiredLanguageIds
          ),
        }),
        right: z.object({
          mediaLandscapeId: z
            .union([z.number(), z.undefined()])
            .refine((val) => val !== undefined && val >= 1, {
              message: 'Right media is required',
            }),
          mediaPortraitId: z
            .union([z.number(), z.undefined()])
            .refine((val) => val !== undefined && val >= 1, {
              message: 'Right media is required',
            }),
          mediaLandscapeUrl: z.string().optional(),
          mediaPortraitUrl: z.string().optional(),
          exploreLink: z.string().nullable().optional(),
          translations: createStrictTranslationSchema(
            z.object({
              languageId: z.number().min(1, 'Language is required'),
              headline: z.string().max(39, 'Headline must be at most 39 characters').optional(),
              exploreText: z
                .string()
                .min(1, 'Explore text is required')
                .max(39, 'Explore text must be at most 39 characters'),
            }),
            requiredLanguageIds
          ),
        }),
      })
      .refine(
        (data) => {
          // Check if any left headline is filled
          const hasLeftHeadline = data.left.translations.some(
            (t) => t.headline && t.headline.trim().length > 0,
          );
          // Check if any right headline is filled
          const hasRightHeadline = data.right.translations.some(
            (t) => t.headline && t.headline.trim().length > 0,
          );

          // If one side has headline, the other must also have headline
          if (hasLeftHeadline || hasRightHeadline) {
            return hasLeftHeadline && hasRightHeadline;
          }

          return true;
        },
        {
          message:
            'If headline is filled for one ad, it must be filled for both left and right ads',
        },
      ),
  }),

  // HERO_TYPE_FEATURED_PRODUCTS
  z.object({
    type: z.literal('HERO_TYPE_FEATURED_PRODUCTS'),
    featuredProducts: z.object({
      productIds: z.array(z.number().min(1)).min(1, 'At least one product is required'),
      exploreLink: z.string().nullable().optional(),
      translations: createStrictTranslationSchema(
        z.object({
          languageId: z.number().min(1, 'Language is required'),
          headline: z
            .string()
            .min(1, 'Headline is required')
            .max(30, 'Headline must be at most 30 characters'),
          exploreText: z
            .string()
            .min(1, 'Explore text is required')
            .max(8, 'Explore text must be at most 8 characters'),
        }),
        requiredLanguageIds
      ),
    }),
  }),

  // HERO_TYPE_FEATURED_PRODUCTS_TAG
  z.object({
    type: z.literal('HERO_TYPE_FEATURED_PRODUCTS_TAG'),
    featuredProductsTag: z.object({
      tag: z.string().min(1, 'Tag is required'),
      translations: createStrictTranslationSchema(
        z.object({
          languageId: z.number().min(1, 'Language is required'),
          headline: z.string().min(1, 'Headline is required'),
          exploreText: z.string().min(1, 'Explore text is required'),
        }),
        requiredLanguageIds
      ),
    }),
  }),

  z.object({
    type: z.literal('HERO_TYPE_UNKNOWN'),
  }),
]);

export const heroBaseSchema = z.object({
  entities: z.array(heroEntitySchema),
  navFeatured,
});

export const heroSchema = heroBaseSchema;

export const defaultData = {
  entities: [],
  navFeatured: {
    men: {
      mediaId: 0,
      translations: LANGUAGES.map((l) => ({ languageId: l.id, exploreText: '' })),
      featuredTag: '',
      featuredArchiveId: 0,
    },
    women: {
      mediaId: 0,
      translations: LANGUAGES.map((l) => ({ languageId: l.id, exploreText: '' })),
      featuredTag: '',
      featuredArchiveId: 0,
    },
  },
};

export type HeroSchema = z.infer<typeof heroSchema>;
