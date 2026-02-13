import { common_ArchiveFull } from 'api/proto-http/admin';
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

export const schema = z
  .object({
    tag: z.string().min(1, 'Tag is required'),
    mediaIds: z.array(z.number()).min(1, 'Select at least one media').default([]),
    mainMediaId: z.number().min(1, 'Select main media').optional(),
    thumbnailId: z.number().optional(),
    translations: createStrictTranslationSchema(
      z.object({
        languageId: z.number().min(1, 'Language is required'),
        heading: z.string().min(1, 'Heading is required'),
        description: z.string().min(1, 'Description is required'),
      }),
      requiredLanguageIds,
    ),
  })
  .refine((data) => data.mainMediaId != null && data.mainMediaId >= 1, {
    message: 'Select main media',
    path: ['mainMediaId'],
  });

export const defaultData = {
  tag: '',
  mediaIds: [] as number[],
  mainMediaId: undefined as number | undefined,
  thumbnailId: undefined as number | undefined,
  translations: LANGUAGES.map((l) => ({ languageId: l.id, heading: '', description: '' })),
};

export type CheckoutData = z.input<typeof schema>;

export function mapArchiveDataToForm(data: CheckoutData) {
  const firstMediaId = data.mediaIds?.[0];

  return {
    tag: data.tag,
    mediaIds: data.mediaIds,
    mainMediaId: data.mainMediaId,
    thumbnailId: firstMediaId,
    translations: data.translations,
  };
}

export function mapArchive(archive: common_ArchiveFull) {
  return {
    tag: archive.archiveList?.tag || '',
    mediaIds: archive.media?.map((m) => m.id),
    mainMediaId: archive.mainMedia?.id,
    thumbnailId: archive.archiveList?.thumbnail?.id,
    translations: archive.archiveList?.translations?.map((t) => ({
      languageId: t.languageId || 0,
      heading: t.heading || '',
      description: t.description || '',
    })),
  };
}
