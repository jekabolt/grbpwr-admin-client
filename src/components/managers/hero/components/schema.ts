import { z } from 'zod';

export const navFeatured = z.object({
  men: z.object({
    mediaId: z.number().min(0).optional(),
    featuredTag: z.string().optional(),
    featuredArchiveId: z.number().min(0).optional(),
    translations: z.array(
      z.object({
        languageId: z.number().min(1, 'Language is required'),
        exploreText: z.string().optional(),
      }),
    ),
  }),
  women: z.object({
    mediaId: z.number().min(0).optional(),
    featuredTag: z.string().optional(),
    featuredArchiveId: z.number().min(0).optional(),
    translations: z.array(
      z.object({
        languageId: z.number().min(1, 'Language is required'),
        exploreText: z.string().optional(),
      }),
    ),
  }),
});

const heroEntitySchema = z.discriminatedUnion('type', [
  // HERO_TYPE_MAIN_ADD
  z.object({
    type: z.literal('HERO_TYPE_MAIN'),
    main: z.object({
      mediaLandscapeId: z.number().min(1, 'Main Add Media is required'),
      mediaPortraitId: z.number().min(1, 'Main Add Media is required'),
      exploreLink: z.string().nullable().optional(),
      translations: z.array(
        z.object({
          languageId: z.number().min(1, 'Language is required'),
          headline: z.string().nullable().optional(),
          tag: z.string().nullable().optional(),
          description: z.string().nullable().optional(),
          exploreText: z.string().nullable().optional(),
        }),
      ),
    }),
  }),

  // HERO_TYPE_SINGLE_ADD
  z.object({
    type: z.literal('HERO_TYPE_SINGLE'),
    single: z.object({
      mediaLandscapeId: z.number().min(1, 'Single Add Media is required'),
      mediaPortraitId: z.number().min(1, 'Single Add Media is required'),
      exploreLink: z.string().nullable().optional(),
      translations: z.array(
        z.object({
          languageId: z.number().min(1, 'Language is required'),
          headline: z.string().nullable().optional(),
          exploreText: z.string().nullable().optional(),
        }),
      ),
    }),
  }),

  // HERO_TYPE_DOUBLE_ADD
  z.object({
    type: z.literal('HERO_TYPE_DOUBLE'),
    double: z.object({
      left: z.object({
        mediaLandscapeId: z.number().min(1, 'Single Add Media is required'),
        mediaPortraitId: z.number().min(1, 'Single Add Media is required'),
        exploreLink: z.string().nullable().optional(),
        translations: z.array(
          z.object({
            languageId: z.number().min(1, 'Language is required'),
            headline: z.string().nullable().optional(),
            exploreText: z.string().nullable().optional(),
          }),
        ),
      }),
      right: z.object({
        mediaLandscapeId: z.number().min(1, 'Single Add Media is required'),
        mediaPortraitId: z.number().min(1, 'Single Add Media is required'),
        exploreLink: z.string().nullable().optional(),
        translations: z.array(
          z.object({
            languageId: z.number().min(1, 'Language is required'),
            headline: z.string().nullable().optional(),
            exploreText: z.string().nullable().optional(),
          }),
        ),
      }),
    }),
  }),

  // HERO_TYPE_FEATURED_PRODUCTS
  z.object({
    type: z.literal('HERO_TYPE_FEATURED_PRODUCTS'),
    featuredProducts: z.object({
      productIds: z.array(z.number().min(1)).min(1, 'At least one product is required'),
      exploreLink: z.string().nullable().optional(),
      translations: z.array(
        z.object({
          languageId: z.number().min(1, 'Language is required'),
          headline: z.string().nullable().optional(),
          exploreText: z.string().nullable().optional(),
        }),
      ),
    }),
  }),

  // HERO_TYPE_FEATURED_PRODUCTS_TAG
  z.object({
    type: z.literal('HERO_TYPE_FEATURED_PRODUCTS_TAG'),
    featuredProductsTag: z.object({
      tag: z.string().min(1, 'Tag is required'),
      translations: z.array(
        z.object({
          languageId: z.number().min(1, 'Language is required'),
          headline: z.string().nullable().optional(),
          exploreText: z.string().nullable().optional(),
        }),
      ),
    }),
  }),

  // Default case for unknown types
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
      translations: [{ languageId: 1, exploreText: '' }],
      featuredTag: '',
      featuredArchiveId: 0,
    },
    women: {
      mediaId: 0,
      translations: [{ languageId: 1, exploreText: '' }],
      featuredTag: '',
      featuredArchiveId: 0,
    },
  },
};

export type HeroSchema = z.infer<typeof heroSchema>;
