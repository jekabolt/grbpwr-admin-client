import {
  common_Fitting,
  common_FittingInsert,
  common_FittingStatus,
  common_FittingVerdict,
} from 'api/proto-http/admin';
import { ZERO_TIMESTAMP } from 'components/managers/fittings/components/utils';
import { decimalToInput, inputToDecimal } from 'utils/decimal';
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

// A numbered marker pinned onto a fitting photo, flagging what is wrong with the
// fit at a point on the image. posX/posY are normalised (0..1) strings while in
// the form (like the tech-card callouts) — converted to Decimal at the boundary.
const fittingCalloutSchema = z.object({
  number: z.number().int().optional().default(0),
  note: z.string().optional().default(''),
  mediaId: z.number().int().optional().default(0), // FK media(id); 0 = unanchored
  posX: z.string().optional().default(''),
  posY: z.string().optional().default(''),
});

// The structured "what to change" work list a fitting produces (S26). target is the change CATEGORY;
// zone + pieceId are the structured LOCATION; status (open|resolved) replaces the legacy boolean;
// carriedFromId links an item to the one in the previous round it continues.
const fittingChangeRequestSchema = z.object({
  id: z.number().int().optional().default(0),
  target: z.string().optional().default(''),
  note: z.string().optional().default(''),
  calloutNumber: z.number().int().optional().default(0),
  zone: z.string().optional().default('TECH_CARD_CONSTRUCTION_ZONE_UNKNOWN'),
  pieceId: z.number().int().optional().default(0),
  status: z.string().optional().default('open'),
  carriedFromId: z.number().int().optional().default(0),
});

export const fittingSchema = z
  .object({
    // A fitting anchors to a product AND/OR a tech card — at least one must be set
    // (backend contract). Product is optional so accessories without a catalog product
    // (пыльники, кофры, …) can be fitted against their tech card instead.
    productId: z.number().int().optional().default(0), // 0 = unset
    techCardId: z.number().int().optional().default(0), // optional link to the tech card (style)
    sampleId: z.number().int().optional().default(0), // optional link to the specific sample tried on
    modelId: z.number().int().optional().default(0),
    fittingDate: z.string().optional().default(''), // YYYY-MM-DD in the UI
    comment: z.string().optional().default(''),
    status: z.string().optional().default('FITTING_STATUS_PLANNED'),
    verdict: z.string().optional().default('FITTING_VERDICT_PENDING'),
    recordedBy: z.string().optional().default(''),
    sizes: z.array(fittingSizeSchema).default([]),
    patterns: z.array(fittingPatternSchema).default([]),
    mediaIds: z.array(z.number()).default([]),
    callouts: z.array(fittingCalloutSchema).default([]),
    // §4 round tracking: sequence number (0 = server auto-assigns per tech card), structured
    // outcome ('undecided' sentinel in the form ↔ '' on the wire), and the change-request work list.
    roundNumber: z.number().int().optional().default(0),
    outcome: z.string().optional().default('undecided'),
    changeRequests: z.array(fittingChangeRequestSchema).default([]),
  })
  .refine((data) => !!data.productId || !!data.techCardId, {
    message: 'Укажите продукт или тех карту',
    path: ['productId'],
  });

export type FittingFormData = z.input<typeof fittingSchema>;

export const fittingDefaultData: FittingFormData = {
  productId: 0,
  techCardId: 0,
  sampleId: 0,
  modelId: 0,
  fittingDate: '',
  comment: '',
  status: 'FITTING_STATUS_PLANNED',
  verdict: 'FITTING_VERDICT_PENDING',
  recordedBy: '',
  sizes: [],
  patterns: [],
  mediaIds: [],
  callouts: [],
  roundNumber: 0,
  outcome: 'undecided',
  changeRequests: [],
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
    sampleId: insert?.sampleId || 0,
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
    callouts: (insert?.callouts ?? []).map((c) => ({
      number: c.number || 0,
      note: c.note || '',
      mediaId: c.mediaId || 0,
      posX: decimalToInput(c.posX),
      posY: decimalToInput(c.posY),
    })),
    roundNumber: insert?.roundNumber || 0,
    // '' on the wire → the non-empty 'undecided' sentinel the Select needs
    outcome: insert?.outcome || 'undecided',
    changeRequests: (insert?.changeRequests ?? []).map((cr) => ({
      id: cr.id || 0,
      target: cr.target || '',
      note: cr.note || '',
      calloutNumber: cr.calloutNumber || 0,
      zone: cr.zone || 'TECH_CARD_CONSTRUCTION_ZONE_UNKNOWN',
      pieceId: cr.pieceId || 0,
      // status (open|resolved) is authoritative; fall back to the legacy boolean for old rows.
      status: cr.status || (cr.resolved ? 'resolved' : 'open'),
      carriedFromId: cr.carriedFromId || 0,
    })),
  };
}

export function mapFormToFittingInsert(
  data: FittingFormData,
  original?: common_FittingInsert,
): common_FittingInsert {
  return {
    // Spread the loaded insert first so fields not yet managed by the form survive
    // the full-replace save (mirrors mapFormToTechCardInsert).
    ...original,
    sampleId: data.sampleId || 0, // new-flow sample link (form-managed, W3.4)
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
    // note is required by the contract — drop markers left un-annotated on save.
    callouts: (data.callouts ?? [])
      .filter((c) => c.note?.trim())
      .map((c, i) => ({
        number: c.number || i + 1,
        note: c.note?.trim() || '',
        mediaId: c.mediaId || 0,
        posX: inputToDecimal(c.posX),
        posY: inputToDecimal(c.posY),
      })),
    // §4 round tracking (form-managed). roundNumber 0 = server auto-assigns per tech card;
    // the 'undecided' sentinel maps back to '' on the wire.
    roundNumber: data.roundNumber || 0,
    outcome: data.outcome === 'undecided' ? '' : data.outcome?.trim() || '',
    // Change requests (S26): on CREATE, send the form's structured initial batch. On EDIT they are
    // managed individually via the dedicated CRUD (stable ids for carry-over) — echo the server's
    // CURRENT set (from the refetched `original`) so UpdateFitting's full-replace never clobbers them.
    changeRequests: original
      ? original.changeRequests ?? []
      : (data.changeRequests ?? [])
          .filter((cr) => cr.note?.trim() || cr.target?.trim())
          .map((cr) => {
            const status = cr.status || 'open';
            return {
              id: cr.id || 0,
              target: cr.target?.trim() || '',
              note: cr.note?.trim() || '',
              calloutNumber: cr.calloutNumber || 0,
              resolved: status === 'resolved',
              zone: cr.zone && cr.zone !== 'TECH_CARD_CONSTRUCTION_ZONE_UNKNOWN' ? cr.zone : '',
              pieceId: cr.pieceId || 0,
              status,
              carriedFromId: cr.carriedFromId || 0,
              createdBy: '',
              fittingId: 0,
              roundNumber: 0,
            };
          }),
  };
}
