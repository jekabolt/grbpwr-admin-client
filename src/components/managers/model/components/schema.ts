import {
  common_BodyMeasurementMetadataV1,
  common_BodyMeasurementName,
  common_BodyMeasurementSource,
  common_GenderEnum,
  common_Model,
  common_ModelInsert,
} from 'api/proto-http/admin';
import { z } from 'zod';

const BODY_MEASUREMENT_SOURCES = [
  'BODY_MEASUREMENT_SOURCE_MANUAL_TAPE',
  'BODY_MEASUREMENT_SOURCE_THREE_D_SCAN',
  'BODY_MEASUREMENT_SOURCE_IMPORTED',
  'BODY_MEASUREMENT_SOURCE_DERIVED',
] as const satisfies readonly common_BodyMeasurementSource[];

const modelMeasurementMetadataSchema = z.object({
  schemaVersion: z.literal(1),
  source: z.enum(BODY_MEASUREMENT_SOURCES),
  protocolId: z.string().trim().min(1).max(128),
  // Local binding guard, never sent to the API. Provenance belongs to the observed value, not only
  // to the field name; changing the number must clear rather than silently relabel that evidence.
  boundValueMm: z.number().int().positive(),
});

// Measurements are a sparse map keyed by BodyMeasurementName; values are mm (int).
// An empty/zero value means the measurement is not captured.
export const modelSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  comment: z.string().optional().default(''),
  gender: z.string().optional().default(''),
  defaultSizeIds: z.array(z.number()).default([]),
  measurements: z.record(z.string(), z.number().min(0).optional()).default({}),
  // Kept separately so editing a value preserves authenticated source/protocol provenance without
  // turning metadata into another dense column of controls. Missing means a legacy/unrecorded row.
  measurementMetadata: z.record(z.string(), modelMeasurementMetadataSchema.optional()).default({}),
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
  measurementMetadata: {},
  mediaIds: [],
};

function modelMeasurementMetadataFromWire(
  value: common_BodyMeasurementMetadataV1 | undefined,
  boundValueMm: number,
): z.infer<typeof modelMeasurementMetadataSchema> | undefined {
  if (
    value?.schemaVersion !== 1 ||
    value.source == null ||
    value.source === 'BODY_MEASUREMENT_SOURCE_UNKNOWN' ||
    !BODY_MEASUREMENT_SOURCES.includes(value.source) ||
    value.protocolId == null ||
    value.protocolId.trim().length === 0
  ) {
    return undefined;
  }
  return {
    schemaVersion: 1,
    source: value.source,
    protocolId: value.protocolId,
    boundValueMm,
  };
}

export function mapModelToForm(model: common_Model): ModelFormData {
  const insert = model.model;
  const measurements: Record<string, number | undefined> = {};
  const measurementMetadata: Record<
    string,
    z.infer<typeof modelMeasurementMetadataSchema> | undefined
  > = {};
  for (const m of insert?.measurements ?? []) {
    if (m.name && m.valueMm != null) {
      measurements[m.name] = m.valueMm;
      measurementMetadata[m.name] = modelMeasurementMetadataFromWire(m.metadata, m.valueMm);
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
    gender: insert?.gender && insert.gender !== 'GENDER_ENUM_UNKNOWN' ? insert.gender : '',
    defaultSizeIds: insert?.defaultSizeIds ?? [],
    measurements,
    measurementMetadata,
    mediaIds,
  };
}

/**
 * React Hook Form reads defaultValues only on mount. Bind the form instance to the exact editable
 * server snapshot so cached route switches and same-id reloads cannot retain another model's fields
 * (or its local mannequin/pose state). Measurement order on the wire is not semantically relevant.
 */
export function modelFormRevisionKeyV1(model: common_Model | undefined): string {
  if (!model) return 'model-form:new';
  const data = mapModelToForm(model);
  const measurements = Object.entries(data.measurements ?? {}).sort(([left], [right]) =>
    left.localeCompare(right),
  );
  const measurementMetadata = Object.entries(data.measurementMetadata ?? {}).sort(
    ([left], [right]) => left.localeCompare(right),
  );
  return JSON.stringify([
    'model-form:edit',
    model.id ?? null,
    data.name,
    data.comment ?? '',
    data.gender ?? '',
    data.defaultSizeIds ?? [],
    measurements,
    measurementMetadata,
    data.mediaIds ?? [],
  ]);
}

export function mapFormToModelInsert(data: ModelFormData): common_ModelInsert {
  const measurements = Object.entries(data.measurements ?? {})
    .filter(([, value]) => value != null && Number.isFinite(value) && (value as number) > 0)
    .map(([name, value]) => {
      const metadata = data.measurementMetadata?.[name];
      const valueMm = Math.round(value as number);
      const retainedMetadata = metadata?.boundValueMm === valueMm ? metadata : undefined;
      return {
        name: name as common_BodyMeasurementName,
        valueMm,
        metadata: retainedMetadata
          ? {
              schemaVersion: retainedMetadata.schemaVersion,
              source: retainedMetadata.source,
              protocolId: retainedMetadata.protocolId,
            }
          : undefined,
      };
    });

  const mediaIds = data.mediaIds ?? [];

  return {
    name: data.name.trim(),
    comment: data.comment?.trim() || '',
    gender: (data.gender || 'GENDER_ENUM_UNKNOWN') as common_GenderEnum,
    defaultSizeIds: data.defaultSizeIds ?? [],
    measurements,
    thumbnailId: mediaIds[0] ?? 0,
    mediaIds,
    bodyMeasurementSchemaVersion: 1,
  };
}
