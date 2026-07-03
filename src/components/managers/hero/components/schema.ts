import { LANGUAGES } from 'constants/constants';
import { z } from 'zod';

const requiredLanguageIds = LANGUAGES.map((l) => l.id);

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
      message: 'All languages must be filled',
    });
};

const createOptionalStrictTranslationSchema = <T extends z.ZodType>(
  translationSchema: T,
  requiredIds: number[],
) => {
  return z
    .array(translationSchema)
    .optional()
    .refine(
      (arr) => {
        if (!arr || arr.length === 0) return true;
        const ids = arr.map((t: any) => t.languageId);
        const uniqueIds = new Set(ids);
        return uniqueIds.size === ids.length;
      },
      { message: 'Each language can only appear once' },
    )
    .refine(
      (arr) => {
        if (!arr || arr.length === 0) return true;
        return arr.length === requiredIds.length;
      },
      { message: `Exactly ${requiredIds.length} language(s) required` },
    )
    .refine(
      (arr) => {
        if (!arr || arr.length === 0) return true;
        return requiredIds.every((id) => arr.some((t: any) => t.languageId === id));
      },
      { message: 'All languages must be filled' },
    );
};

export const navFeatured = z.object({
  men: z.object({
    mediaId: z.number().min(0).optional(),
    featuredTag: z.string().optional(),
    featuredArchiveId: z.number().min(0).optional(),
    translations: createOptionalStrictTranslationSchema(
      z.object({
        languageId: z.number().min(1, 'Language is required'),
        exploreText: z.string().max(25, 'Explore text must be at most 25 characters').optional(),
      }),
      requiredLanguageIds,
    ),
  }),
  women: z.object({
    mediaId: z.number().min(0).optional(),
    featuredTag: z.string().optional(),
    featuredArchiveId: z.number().min(0).optional(),
    translations: createOptionalStrictTranslationSchema(
      z.object({
        languageId: z.number().min(1, 'Language is required'),
        exploreText: z.string().max(25, 'Explore text must be at most 25 characters').optional(),
      }),
      requiredLanguageIds,
    ),
  }),
});

const heroEntitySchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('HERO_TYPE_MAIN'),
    _uid: z.string().optional(),
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
        requiredLanguageIds,
      ),
    }),
  }),

  z.object({
    type: z.literal('HERO_TYPE_SINGLE'),
    _uid: z.string().optional(),
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
        requiredLanguageIds,
      ),
    }),
  }),

  z.object({
    type: z.literal('HERO_TYPE_DOUBLE'),
    _uid: z.string().optional(),
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
            requiredLanguageIds,
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
            requiredLanguageIds,
          ),
        }),
      })
      .refine(
        (data) => {
          const hasLeftHeadline = data.left.translations.some(
            (t) => t.headline && t.headline.trim().length > 0,
          );

          const hasRightHeadline = data.right.translations.some(
            (t) => t.headline && t.headline.trim().length > 0,
          );

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

  z.object({
    type: z.literal('HERO_TYPE_FEATURED_PRODUCTS'),
    _uid: z.string().optional(),
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
        requiredLanguageIds,
      ),
    }),
  }),

  z.object({
    type: z.literal('HERO_TYPE_FEATURED_PRODUCTS_TAG'),
    _uid: z.string().optional(),
    featuredProductsTag: z.object({
      tag: z.string().min(1, 'Tag is required'),
      translations: createStrictTranslationSchema(
        z.object({
          languageId: z.number().min(1, 'Language is required'),
          headline: z.string().min(1, 'Headline is required'),
          exploreText: z.string().min(1, 'Explore text is required'),
        }),
        requiredLanguageIds,
      ),
    }),
  }),

  // ── v2 blocks ──────────────────────────────────────────────────────────
  z.object({
    type: z.literal('HERO_TYPE_MARQUEE'),
    _uid: z.string().optional(),
    marquee: z.object({
      link: z.string().nullable().optional(),
      speed: z.number().optional(),
      translations: createStrictTranslationSchema(
        z.object({
          languageId: z.number().min(1, 'Language is required'),
          headline: z.string().min(1, 'Marquee text is required'),
        }),
        requiredLanguageIds,
      ),
    }),
  }),

  z.object({
    type: z.literal('HERO_TYPE_VIDEO'),
    _uid: z.string().optional(),
    video: z.object({
      mediaId: z.union([z.number(), z.undefined()]).refine((v) => v !== undefined && v >= 1, {
        message: 'Video media is required',
      }),
      mediaUrl: z.string().optional(),
      posterId: z.number().optional(),
      posterUrl: z.string().optional(),
      autoplay: z.boolean().optional(),
      loop: z.boolean().optional(),
      muted: z.boolean().optional(),
      ctaLink: z.string().nullable().optional(),
      translations: createStrictTranslationSchema(
        z.object({
          languageId: z.number().min(1, 'Language is required'),
          headline: z.string().optional(),
          ctaText: z.string().optional(),
        }),
        requiredLanguageIds,
      ),
    }),
  }),

  z.object({
    type: z.literal('HERO_TYPE_STATEMENT'),
    _uid: z.string().optional(),
    statement: z.object({
      // media is optional — a statement can render as pure typography or over
      // subtle background media.
      mediaLandscapeId: z.number().optional(),
      mediaPortraitId: z.number().optional(),
      mediaLandscapeUrl: z.string().optional(),
      mediaPortraitUrl: z.string().optional(),
      exploreLink: z.string().nullable().optional(),
      translations: createStrictTranslationSchema(
        z.object({
          languageId: z.number().min(1, 'Language is required'),
          headline: z
            .string()
            .min(1, 'Statement text is required')
            .max(550, 'Statement must be at most 550 characters'),
          body: z.string().optional(),
        }),
        requiredLanguageIds,
      ),
    }),
  }),

  z.object({
    type: z.literal('HERO_TYPE_NEWSLETTER'),
    _uid: z.string().optional(),
    newsletter: z.object({
      // media is optional — the capture form can sit over media or on a plain bg.
      mediaLandscapeId: z.number().optional(),
      mediaPortraitId: z.number().optional(),
      mediaLandscapeUrl: z.string().optional(),
      mediaPortraitUrl: z.string().optional(),
      translations: createStrictTranslationSchema(
        z.object({
          languageId: z.number().min(1, 'Language is required'),
          headline: z.string().min(1, 'Headline is required'),
          body: z.string().optional(),
          placeholder: z.string().optional(),
          ctaText: z.string().min(1, 'Button text is required'),
          successText: z.string().optional(),
        }),
        requiredLanguageIds,
      ),
    }),
  }),

  z.object({
    type: z.literal('HERO_TYPE_EMBED'),
    _uid: z.string().optional(),
    embed: z.object({
      embedUrl: z.string().min(1, 'Embed URL is required'),
      // fallback media (shown before/if the iframe loads) — optional.
      mediaLandscapeId: z.number().optional(),
      mediaPortraitId: z.number().optional(),
      mediaLandscapeUrl: z.string().optional(),
      mediaPortraitUrl: z.string().optional(),
      ctaLink: z.string().nullable().optional(),
      translations: createStrictTranslationSchema(
        z.object({
          languageId: z.number().min(1, 'Language is required'),
          headline: z.string().optional(),
          ctaText: z.string().optional(),
        }),
        requiredLanguageIds,
      ),
    }),
  }),

  z.object({
    type: z.literal('HERO_TYPE_UNKNOWN'),
    _uid: z.string().optional(),
  }),
]);

export const heroBaseSchema = z.object({
  entities: z.array(heroEntitySchema),
  navFeatured: navFeatured.optional(),
});

export const heroSchema = heroBaseSchema;

export const defaultData = {
  entities: [],
  navFeatured: undefined,
};

export type HeroSchema = z.infer<typeof heroSchema>;
