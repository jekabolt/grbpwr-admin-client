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
// media / embed / product / products blocks use an optional caption; the text
// block uses a required text body. (proto: ArchiveItemTranslation { caption, text })
const captionTranslation = z.object({
  languageId: z.number().min(1, 'Language is required'),
  caption: z.string().max(500, 'Caption must be at most 500 characters').optional(),
});

const textTranslation = z.object({
  languageId: z.number().min(1, 'Language is required'),
  text: z.string().min(1, 'Text is required').max(10000, 'Text must be at most 10000 characters'),
});

// ── body block (discriminated union on `type`, one member per ArchiveItemType) ─
export const archiveItemSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('ARCHIVE_ITEM_TYPE_MEDIA'),
    _uid: z.string().optional(),
    mediaId: z.union([z.number(), z.undefined()]).refine((v) => v !== undefined && v >= 1, {
      message: 'Media is required',
    }),
    mediaUrl: z.string().optional(),
    translations: createStrictTranslationSchema(captionTranslation, requiredLanguageIds),
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
  mainMediaIds: z.array(z.number()).min(1, 'Select at least one main media').default([]),
  // Derived on save from the first MEDIA block when unset; kept so an explicit
  // choice round-trips.
  thumbnailId: z.number().optional(),
  translations: createStrictTranslationSchema(
    z.object({
      languageId: z.number().min(1, 'Language is required'),
      heading: z
        .string()
        .min(20, 'Heading must be at least 20 characters')
        .max(90, 'Heading cannot exceed 90 characters'),
      description: z
        .string()
        .min(10, 'Description must be at least 10 characters')
        .max(10000, 'Description cannot exceed 10000 characters'),
    }),
    requiredLanguageIds,
  ),
  // Ordered, heterogeneous timeline body — hero-style block list.
  items: z.array(archiveItemSchema).default([]),
});

export type ArchiveFormData = z.input<typeof schema>;
export type ArchiveItemFormData = z.input<typeof archiveItemSchema>;

export const defaultData: ArchiveFormData = {
  tag: '',
  mainMediaIds: [],
  thumbnailId: undefined,
  translations: LANGUAGES.map((l) => ({ languageId: l.id, heading: '', description: '' })),
  items: [],
};
