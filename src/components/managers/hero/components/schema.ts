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

// A single HeroSingle-shaped form item (media pair + explore link + copy), used
// by the slideshow / mosaic / lookbook list blocks. The per-item translation
// fields differ per block, so the copy shape is passed in.
const heroSingleItemSchema = (translationShape: z.ZodRawShape) =>
  z.object({
    mediaLandscapeId: z.number().optional(),
    mediaPortraitId: z.number().optional(),
    mediaLandscapeUrl: z.string().optional(),
    mediaPortraitUrl: z.string().optional(),
    exploreLink: z.string().nullable().optional(),
    translations: createStrictTranslationSchema(
      z.object({
        languageId: z.number().min(1, 'Language is required'),
        ...translationShape,
      }),
      requiredLanguageIds,
    ),
  });

// TARGETING modifier — carried on every hero entity (audience + optional min
// tier). Spread into each discriminated-union member so it survives Zod parsing.
const targetingFields = {
  audience: z
    .enum([
      'HERO_AUDIENCE_UNKNOWN',
      'HERO_AUDIENCE_ALL',
      'HERO_AUDIENCE_GUESTS',
      'HERO_AUDIENCE_MEMBERS',
      'HERO_AUDIENCE_TIER',
    ])
    .optional(),
  minTierId: z.number().optional(),
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
    ...targetingFields,
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
    ...targetingFields,
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
    ...targetingFields,
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
    ...targetingFields,
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
    ...targetingFields,
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
    ...targetingFields,
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
    ...targetingFields,
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
    ...targetingFields,
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
    ...targetingFields,
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
    ...targetingFields,
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
    type: z.literal('HERO_TYPE_DROP'),
    _uid: z.string().optional(),
    ...targetingFields,
    drop: z.object({
      // background media — optional.
      mediaLandscapeId: z.number().optional(),
      mediaPortraitId: z.number().optional(),
      mediaLandscapeUrl: z.string().optional(),
      mediaPortraitUrl: z.string().optional(),
      // RFC3339 string; the countdown target.
      releaseAt: z.string().min(1, 'Release date is required'),
      // collection/product tag surfaced after the drop goes live.
      tag: z.string().nullable().optional(),
      exploreLink: z.string().nullable().optional(),
      translations: createStrictTranslationSchema(
        z.object({
          languageId: z.number().min(1, 'Language is required'),
          headline: z.string().optional(),
          exploreText: z.string().optional(),
        }),
        requiredLanguageIds,
      ),
    }),
  }),

  z.object({
    type: z.literal('HERO_TYPE_LAST_CHANCE'),
    _uid: z.string().optional(),
    ...targetingFields,
    lastChance: z.object({
      // products are resolved by the backend from stock; the editor only sets the
      // rule (show items at/under this stock, up to `limit`).
      stockThreshold: z.number().optional(),
      limit: z.number().optional(),
      exploreLink: z.string().nullable().optional(),
      translations: createStrictTranslationSchema(
        z.object({
          languageId: z.number().min(1, 'Language is required'),
          headline: z.string().optional(),
          exploreText: z.string().optional(),
        }),
        requiredLanguageIds,
      ),
    }),
  }),

  z.object({
    type: z.literal('HERO_TYPE_NEW_ARRIVALS'),
    _uid: z.string().optional(),
    ...targetingFields,
    newArrivals: z.object({
      // products are resolved by the backend (newest by created_at); editor only
      // sets how many to show.
      limit: z.number().optional(),
      exploreLink: z.string().nullable().optional(),
      translations: createStrictTranslationSchema(
        z.object({
          languageId: z.number().min(1, 'Language is required'),
          headline: z.string().optional(),
          exploreText: z.string().optional(),
        }),
        requiredLanguageIds,
      ),
    }),
  }),

  z.object({
    type: z.literal('HERO_TYPE_SLIDESHOW'),
    _uid: z.string().optional(),
    ...targetingFields,
    slideshow: z.object({
      slides: z
        .array(
          z.object({
            mediaLandscapeId: z.number().optional(),
            mediaPortraitId: z.number().optional(),
            mediaLandscapeUrl: z.string().optional(),
            mediaPortraitUrl: z.string().optional(),
            exploreLink: z.string().nullable().optional(),
            translations: createStrictTranslationSchema(
              z.object({
                languageId: z.number().min(1, 'Language is required'),
                headline: z.string().optional(),
                exploreText: z.string().optional(),
              }),
              requiredLanguageIds,
            ),
          }),
        )
        .min(1, 'At least one slide is required'),
      intervalMs: z.number().optional(),
    }),
  }),

  z.object({
    type: z.literal('HERO_TYPE_MOSAIC'),
    _uid: z.string().optional(),
    ...targetingFields,
    mosaic: z.object({
      tiles: z
        .array(
          heroSingleItemSchema({
            headline: z.string().optional(),
            exploreText: z.string().optional(),
          }),
        )
        .min(1, 'At least one tile is required'),
      columns: z.number().optional(),
    }),
  }),

  z.object({
    type: z.literal('HERO_TYPE_LOOKBOOK'),
    _uid: z.string().optional(),
    ...targetingFields,
    lookbook: z.object({
      frames: z
        .array(heroSingleItemSchema({ caption: z.string().optional() }))
        .min(1, 'At least one frame is required'),
      exploreLink: z.string().nullable().optional(),
      // block-level story headline (per-frame copy is the caption).
      translations: createStrictTranslationSchema(
        z.object({
          languageId: z.number().min(1, 'Language is required'),
          headline: z.string().optional(),
        }),
        requiredLanguageIds,
      ),
    }),
  }),

  z.object({
    type: z.literal('HERO_TYPE_SPLIT'),
    _uid: z.string().optional(),
    ...targetingFields,
    split: z.object({
      // editorial frame (one HeroSingle) shown beside the products.
      media: heroSingleItemSchema({
        headline: z.string().optional(),
        exploreText: z.string().optional(),
      }),
      productIds: z.array(z.number().min(1)).min(1, 'At least one product is required'),
      // media on the left (products right) vs. flipped.
      mediaLeft: z.boolean().optional(),
    }),
  }),

  z.object({
    type: z.literal('HERO_TYPE_PRODUCT_SPOTLIGHT'),
    _uid: z.string().optional(),
    ...targetingFields,
    productSpotlight: z.object({
      productId: z.union([z.number(), z.undefined()]).refine((v) => v !== undefined && v >= 1, {
        message: 'A product is required',
      }),
      // large spotlight media — optional (falls back to the product media).
      mediaLandscapeId: z.number().optional(),
      mediaPortraitId: z.number().optional(),
      mediaLandscapeUrl: z.string().optional(),
      mediaPortraitUrl: z.string().optional(),
      exploreLink: z.string().nullable().optional(),
      translations: createStrictTranslationSchema(
        z.object({
          languageId: z.number().min(1, 'Language is required'),
          headline: z.string().optional(),
          exploreText: z.string().optional(),
        }),
        requiredLanguageIds,
      ),
    }),
  }),

  z.object({
    type: z.literal('HERO_TYPE_UNKNOWN'),
    _uid: z.string().optional(),
    ...targetingFields,
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
