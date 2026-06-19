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
  defaultSampleSizeId: z.number().optional().default(0),
  measurements: z.record(z.string(), z.number().min(0).optional()).default({}),
});

export type ModelFormData = z.input<typeof modelSchema>;

export const modelDefaultData: ModelFormData = {
  name: '',
  comment: '',
  gender: '',
  defaultSampleSizeId: 0,
  measurements: {},
};

export function mapModelToForm(model: common_Model): ModelFormData {
  const insert = model.model;
  const measurements: Record<string, number | undefined> = {};
  for (const m of insert?.measurements ?? []) {
    if (m.name && m.valueMm != null) {
      measurements[m.name] = m.valueMm;
    }
  }
  return {
    name: insert?.name || '',
    comment: insert?.comment || '',
    gender:
      insert?.gender && insert.gender !== 'GENDER_ENUM_UNKNOWN' ? insert.gender : '',
    defaultSampleSizeId: insert?.defaultSampleSizeId || 0,
    measurements,
  };
}

export function mapFormToModelInsert(data: ModelFormData): common_ModelInsert {
  const measurements = Object.entries(data.measurements ?? {})
    .filter(([, value]) => value != null && Number.isFinite(value) && (value as number) > 0)
    .map(([name, value]) => ({
      name: name as common_BodyMeasurementName,
      valueMm: Math.round(value as number),
    }));

  return {
    name: data.name.trim(),
    comment: data.comment?.trim() || '',
    gender: (data.gender || 'GENDER_ENUM_UNKNOWN') as common_GenderEnum,
    defaultSampleSizeId: data.defaultSampleSizeId || 0,
    measurements,
  };
}
