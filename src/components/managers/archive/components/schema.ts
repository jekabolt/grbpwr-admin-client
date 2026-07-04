import { LANGUAGES } from 'constants/constants';
import { z } from 'zod';

const requiredLanguageIds = LANGUAGES.map((l) => l.id);

// Every translatable field carries exactly one row per language (unique, all
// present). Individual copy fields inside the row may still be optional — this
// only enforces the language set, mirroring the hero editor.
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
        return new Set(ids).size === ids.length;
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

// ── per-block translation shapes ────────────────────────────────────────────
const captionTranslation = z.object({
  languageId: z.number().min(1, 'Language is required'),
  caption: z.string().max(500, 'Caption must be at most 500 characters').optional(),
});

const textTranslation = z.object({
  languageId: z.number().min(1, 'Language is required'),
  text: z.string().min(1, 'Text is required').max(10000, 'Text must be at most 10000 characters'),
});

// Presentation ratio; always seeded on add, so optional here (the mapper defaults it).
const aspectRatio = z
  .enum([
    'ARCHIVE_MEDIA_ASPECT_RATIO_UNKNOWN',
    'ARCHIVE_MEDIA_ASPECT_RATIO_16X9',
    'ARCHIVE_MEDIA_ASPECT_RATIO_2X1',
    'ARCHIVE_MEDIA_ASPECT_RATIO_1X1',
    'ARCHIVE_MEDIA_ASPECT_RATIO_3X4',
  ])
  .optional();

// ── body block (discriminated union on `type`, one member per ArchiveItemType) ─
// Only the archive thumbnail, title and tag are mandatory; every block is
// optional to add, but a block that is added must carry its own core content.
export const archiveItemSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('ARCHIVE_ITEM_TYPE_MAIN_MEDIA'),
    _uid: z.string().optional(),
    mediaId: z.union([z.number(), z.undefined()]).refine((v) => v !== undefined && v >= 1, {
      message: 'Media is required',
    }),
    mediaUrl: z.string().optional(),
    aspectRatio,
  }),

  z.object({
    type: z.literal('ARCHIVE_ITEM_TYPE_MEDIA_LINE'),
    _uid: z.string().optional(),
    mediaIds: z
      .array(z.number().min(1))
      .min(1, 'Add at least one media')
      .max(4, 'Up to 4 media per line'),
    mediaUrls: z.array(z.string()).optional().default([]),
    aspectRatio,
  }),

  z.object({
    type: z.literal('ARCHIVE_ITEM_TYPE_TEXT'),
    _uid: z.string().optional(),
    translations: createStrictTranslationSchema(textTranslation, requiredLanguageIds),
  }),

  z.object({
    type: z.literal('ARCHIVE_ITEM_TYPE_EMBED'),
    _uid: z.string().optional(),
    embedUrl: z.string().min(1, 'Embed URL is required'),
    translations: createStrictTranslationSchema(captionTranslation, requiredLanguageIds),
  }),

  z.object({
    type: z.literal('ARCHIVE_ITEM_TYPE_MEDIA_WITH_CAPTION'),
    _uid: z.string().optional(),
    mediaId: z.union([z.number(), z.undefined()]).refine((v) => v !== undefined && v >= 1, {
      message: 'Media is required',
    }),
    mediaUrl: z.string().optional(),
    link: z.string().optional(),
    aspectRatio,
    translations: createStrictTranslationSchema(captionTranslation, requiredLanguageIds),
  }),

  z.object({
    type: z.literal('ARCHIVE_ITEM_TYPE_PRODUCT'),
    _uid: z.string().optional(),
    productId: z.union([z.number(), z.undefined()]).refine((v) => v !== undefined && v >= 1, {
      message: 'A product is required',
    }),
    translations: createStrictTranslationSchema(captionTranslation, requiredLanguageIds),
  }),

  z.object({
    type: z.literal('ARCHIVE_ITEM_TYPE_PRODUCTS_TAG'),
    _uid: z.string().optional(),
    tag: z.string().min(1, 'Tag is required'),
    // 0 / undefined = no cap.
    limit: z.number().min(0).optional(),
    translations: createStrictTranslationSchema(captionTranslation, requiredLanguageIds),
  }),

  z.object({
    type: z.literal('ARCHIVE_ITEM_TYPE_PRODUCTS_MANUAL'),
    _uid: z.string().optional(),
    productIds: z.array(z.number().min(1)).min(1, 'At least one product is required'),
    translations: createStrictTranslationSchema(captionTranslation, requiredLanguageIds),
  }),
]);

export const schema = z.object({
  tag: z.string().min(1, 'Tag is required'),
  // Explicit thumbnail; derived on save from the first media block when unset.
  thumbnailId: z.number().optional(),
  // Display-only: the chosen thumbnail's url, for the card-section preview.
  thumbnailUrl: z.string().optional(),
  translations: createStrictTranslationSchema(
    z.object({
      languageId: z.number().min(1, 'Language is required'),
      heading: z
        .string()
        .min(1, 'Heading is required')
        .max(90, 'Heading cannot exceed 90 characters'),
    }),
    requiredLanguageIds,
  ),
  // Ordered, heterogeneous timeline body — blocks may repeat, in any order.
  items: z.array(archiveItemSchema).default([]),
});

export type ArchiveFormData = z.input<typeof schema>;
export type ArchiveItemFormData = z.input<typeof archiveItemSchema>;

export const defaultData: ArchiveFormData = {
  tag: '',
  thumbnailId: undefined,
  thumbnailUrl: undefined,
  translations: LANGUAGES.map((l) => ({ languageId: l.id, heading: '' })),
  items: [],
};
