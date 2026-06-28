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

// The iteration выкройка actually tried on in this fitting (a snapshot, independent of the
// card's final pattern). sizeId is optional here: 0 = not tied to a specific size.
const fittingPatternSchema = z.object({
  sizeId: z.number().int().optional().default(0),
  url: z.string().optional().default(''),
  filename: z.string().optional().default(''),
  sizeBytes: z.number().optional().default(0),
});

export const fittingSchema = z
  .object({
    // A fitting anchors to a product AND/OR a tech card — at least one must be set
    // (backend contract). Product is optional so accessories without a catalog product
    // (пыльники, кофры, …) can be fitted against their tech card instead.
    productId: z.number().int().optional().default(0), // 0 = unset
    techCardId: z.number().int().optional().default(0), // optional link to the tech card (style)
    modelId: z.number().int().optional().default(0),
    fittingDate: z.string().optional().default(''), // YYYY-MM-DD in the UI
    comment: z.string().optional().default(''),
    status: z.string().optional().default('FITTING_STATUS_PLANNED'),
    verdict: z.string().optional().default('FITTING_VERDICT_PENDING'),
    recordedBy: z.string().optional().default(''),
    sizes: z.array(fittingSizeSchema).default([]),
    patterns: z.array(fittingPatternSchema).default([]),
    mediaIds: z.array(z.number()).default([]),
  })
  .refine((data) => !!data.productId || !!data.techCardId, {
    message: 'Укажите продукт или тех карту',
    path: ['productId'],
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
  patterns: [],
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
    patterns: (insert?.patterns ?? []).map((p) => ({
      sizeId: p.sizeId || 0,
      url: p.url || '',
      filename: p.filename || '',
      // int64 → string from grpc-gateway; coerce so z.number() doesn't block save
      sizeBytes: Number(p.sizeBytes) || 0,
    })),
    mediaIds:
      fitting.media?.map((m) => m.id).filter((id): id is number => id != null) ??
      insert?.mediaIds ??
      [],
  };
}

export function mapFormToFittingInsert(data: FittingFormData): common_FittingInsert {
  return {
    productId: data.productId || 0,
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
    patterns: (data.patterns ?? [])
      .filter((p) => p.url?.trim())
      .map((p) => ({
        sizeId: p.sizeId || 0,
        url: p.url?.trim() || '',
        filename: p.filename?.trim() || '',
        sizeBytes: p.sizeBytes || 0,
      })),
    mediaIds: data.mediaIds ?? [],
  };
}
