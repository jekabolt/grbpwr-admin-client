import {
  common_Fitting,
  common_FittingInsert,
  common_FittingStatus,
  common_FittingVerdict,
} from 'api/proto-http/admin';
import { ZERO_TIMESTAMP } from 'components/managers/fittings/components/utils';
import { z } from 'zod';

const fittingSizeSchema = z.object({
  sizeId: z.number().int().min(1, 'Pick a size'),
  fitNote: z.string().optional().default(''),
});

export const fittingSchema = z.object({
  productId: z.number().int().min(1, 'Product is required'),
  techCardId: z.number().int().optional().default(0), // optional link to the tech card (style)
  modelId: z.number().int().optional().default(0),
  fittingDate: z.string().optional().default(''), // YYYY-MM-DD in the UI
  comment: z.string().optional().default(''),
  status: z.string().optional().default('FITTING_STATUS_PLANNED'),
  verdict: z.string().optional().default('FITTING_VERDICT_PENDING'),
  recordedBy: z.string().optional().default(''),
  sizes: z.array(fittingSizeSchema).default([]),
  mediaIds: z.array(z.number()).default([]),
});

export type FittingFormData = z.input<typeof fittingSchema>;

export const fittingDefaultData: FittingFormData = {
  productId: 0,
  techCardId: 0,
  modelId: 0,
  fittingDate: '',
  comment: '',
  status: 'FITTING_STATUS_PLANNED',
  verdict: 'FITTING_VERDICT_PENDING',
  recordedBy: '',
  sizes: [],
  mediaIds: [],
};

export function todayDateInput(): string {
  return new Date().toISOString().slice(0, 10);
}

function timestampToDateInput(timestamp?: string): string {
  if (!timestamp || timestamp === ZERO_TIMESTAMP) return '';
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 10);
}

function dateInputToTimestamp(value?: string): string {
  if (!value) return ZERO_TIMESTAMP;
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return ZERO_TIMESTAMP;
  return date.toISOString();
}

export function mapFittingToForm(fitting: common_Fitting): FittingFormData {
  const insert = fitting.fitting;
  return {
    productId: insert?.productId || 0,
    techCardId: insert?.techCardId || 0,
    modelId: insert?.modelId || 0,
    fittingDate: timestampToDateInput(insert?.fittingDate),
    comment: insert?.comment || '',
    status:
      insert?.status && insert.status !== 'FITTING_STATUS_UNKNOWN'
        ? insert.status
        : 'FITTING_STATUS_PLANNED',
    verdict:
      insert?.verdict && insert.verdict !== 'FITTING_VERDICT_UNKNOWN'
        ? insert.verdict
        : 'FITTING_VERDICT_PENDING',
    recordedBy: insert?.recordedBy || '',
    sizes: (insert?.sizes ?? []).map((s) => ({
      sizeId: s.sizeId || 0,
      fitNote: s.fitNote || '',
    })),
    mediaIds:
      fitting.media?.map((m) => m.id).filter((id): id is number => id != null) ??
      insert?.mediaIds ??
      [],
  };
}

export function mapFormToFittingInsert(data: FittingFormData): common_FittingInsert {
  return {
    productId: data.productId,
    techCardId: data.techCardId || 0,
    modelId: data.modelId || 0,
    fittingDate: dateInputToTimestamp(data.fittingDate),
    comment: data.comment?.trim() || '',
    status: (data.status || 'FITTING_STATUS_UNKNOWN') as common_FittingStatus,
    verdict: (data.verdict || 'FITTING_VERDICT_UNKNOWN') as common_FittingVerdict,
    recordedBy: data.recordedBy?.trim() || '',
    sizes: (data.sizes ?? []).map((s) => ({
      sizeId: s.sizeId,
      fitNote: s.fitNote?.trim() || '',
    })),
    mediaIds: data.mediaIds ?? [],
  };
}
