import {
  common_BodyMeasurementName,
  common_GenderEnum,
  common_Model,
  common_ModelInsert,
} from 'api/proto-http/admin';
import { z } from 'zod';

// Measurements are a sparse map keyed by BodyMeasurementName; values are mm (int).
// An empty/zero value means the measurement is not captured.
export const modelSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  comment: z.string().optional().default(''),
  gender: z.string().optional().default(''),
  defaultSizeIds: z.array(z.number()).default([]),
  measurements: z.record(z.string(), z.number().min(0).optional()).default({}),
  // Photo gallery; the first item is treated as the thumbnail.
  mediaIds: z.array(z.number()).default([]),
});

export type ModelFormData = z.input<typeof modelSchema>;

export const modelDefaultData: ModelFormData = {
  name: '',
  comment: '',
  gender: '',
  defaultSizeIds: [],
  measurements: {},
  mediaIds: [],
};

export function mapModelToForm(model: common_Model): ModelFormData {
  const insert = model.model;
  const measurements: Record<string, number | undefined> = {};
  for (const m of insert?.measurements ?? []) {
    if (m.name && m.valueMm != null) {
      measurements[m.name] = m.valueMm;
    }
  }

  // Order the gallery so the thumbnail is first (first = thumbnail invariant).
  const galleryIds =
    model.media?.map((m) => m.id).filter((id): id is number => id != null) ??
    insert?.mediaIds ??
    [];
  const thumbId = model.thumbnail?.id ?? insert?.thumbnailId;
  const mediaIds =
    thumbId && galleryIds.includes(thumbId)
      ? [thumbId, ...galleryIds.filter((id) => id !== thumbId)]
      : galleryIds;

  return {
    name: insert?.name || '',
    comment: insert?.comment || '',
    gender:
      insert?.gender && insert.gender !== 'GENDER_ENUM_UNKNOWN' ? insert.gender : '',
    defaultSizeIds: insert?.defaultSizeIds ?? [],
    measurements,
    mediaIds,
  };
}

export function mapFormToModelInsert(data: ModelFormData): common_ModelInsert {
  const measurements = Object.entries(data.measurements ?? {})
    .filter(([, value]) => value != null && Number.isFinite(value) && (value as number) > 0)
    .map(([name, value]) => ({
      name: name as common_BodyMeasurementName,
      valueMm: Math.round(value as number),
    }));

  const mediaIds = data.mediaIds ?? [];

  return {
    name: data.name.trim(),
    comment: data.comment?.trim() || '',
    gender: (data.gender || 'GENDER_ENUM_UNKNOWN') as common_GenderEnum,
    defaultSizeIds: data.defaultSizeIds ?? [],
    measurements,
    thumbnailId: mediaIds[0] ?? 0,
    mediaIds,
  };
}
