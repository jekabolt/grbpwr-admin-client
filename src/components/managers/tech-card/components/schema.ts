import {
  common_GenderEnum,
  common_TechCard,
  common_TechCardApprovalState,
  common_TechCardBomSection,
  common_TechCardConstruction,
  common_TechCardConstructionZone,
  common_TechCardCosting,
  common_TechCardFabricDirection,
  common_TechCardInsert,
  common_TechCardIssueSeverity,
  common_TechCardIssueStatus,
  common_TechCardLabelType,
  common_TechCardMeasurementUnit,
  common_TechCardMediaItem,
  common_TechCardMediaKind,
  common_TechCardOperationType,
  common_TechCardPackaging,
  common_TechCardSignoffSection,
  common_TechCardSignoffState,
  common_TechCardStage,
  googletype_Decimal,
} from 'api/proto-http/admin';
// TODO(final-bump): TechCardLabDipStatus is no longer re-exported from 'api/proto-http/admin'
// in the intermediate contract — import it from common directly.
import { TechCardLabDipStatus as common_TechCardLabDipStatus } from 'api/proto-http/common';
import { ZERO_TIMESTAMP } from 'components/managers/tech-cards/components/utils';
import { decimalToInput, inputToDecimal } from 'utils/decimal';
import { isUlid, ulid } from 'utils/ulid';
import { z } from 'zod';

// Tech-card form. Covers the full TechCardInsert: header ("Титул"), sketch media
// (moodboard + technical) + callouts, size range + patterns, linked products, colourways
// (recipe = usages), BOM (article catalog), construction, operations, labels, packaging,
// costing, details, and the revision log. The backend does a full replace on update, so
// mapFormToTechCardInsert sends every section. Computed fields — costing rollups
// (materials_total/materials_per_unit/unit_cost/order_cost/colorway_costs) and usage
// line/run totals — are output-only: shown read-only, never sent.

const DEFAULT_STAGE: common_TechCardStage = 'TECH_CARD_STAGE_PROTO';
const DEFAULT_APPROVAL_STATE: common_TechCardApprovalState = 'TECH_CARD_APPROVAL_STATE_DRAFT';
const DEFAULT_MEASUREMENT_UNIT: common_TechCardMeasurementUnit = 'TECH_CARD_MEASUREMENT_UNIT_MM';
const UNSET_GENDER: common_GenderEnum = 'GENDER_ENUM_UNKNOWN';

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

// True if any value is meaningful (non-blank string / non-zero number). Used to send a
// 1:1 section as undefined (unset) when the whole block is empty.
function hasContent(values: Array<string | number | undefined>): boolean {
  return values.some((v) => (typeof v === 'number' ? v !== 0 : !!v?.trim()));
}

const DEFAULT_MEDIA_KIND: common_TechCardMediaKind = 'TECH_CARD_MEDIA_KIND_FRONT';
const DEFAULT_BOM_SECTION: common_TechCardBomSection = 'TECH_CARD_BOM_SECTION_FABRIC';
const DEFAULT_LAB_DIP: common_TechCardLabDipStatus = 'TECH_CARD_LAB_DIP_STATUS_PENDING';

const sizeQuantitySchema = z.object({
  sizeId: z.number().optional().default(0), // ∈ size_ids
  orderQty: z.number().optional().default(0),
});

// Per-size consumption (норма расхода) of a measured material in a colourway usage —
// different sizes consume different amounts of fabric. sizeId ∈ size_ids. Decimal string.
const sizeConsumptionSchema = z.object({
  sizeId: z.number().optional().default(0),
  consumption: z.string().optional().default(''), // decimal as string
});

// A downloadable PDF выкройка (cut pattern) for one size. url/filename/sizeBytes are
// produced by Admin.UploadPattern (never hand-typed); sizeId ∈ size_ids.
const patternSchema = z.object({
  sizeId: z.number().optional().default(0),
  url: z.string().optional().default(''),
  filename: z.string().optional().default(''),
  sizeBytes: z.number().optional().default(0),
});

const DEFAULT_ISSUE_SEVERITY: common_TechCardIssueSeverity = 'TECH_CARD_ISSUE_SEVERITY_MEDIUM';
const DEFAULT_ISSUE_STATUS: common_TechCardIssueStatus = 'TECH_CARD_ISSUE_STATUS_OPEN';
const DEFAULT_SIGNOFF_SECTION: common_TechCardSignoffSection = 'TECH_CARD_SIGNOFF_SECTION_DESIGN';
const DEFAULT_SIGNOFF_STATE: common_TechCardSignoffState = 'TECH_CARD_SIGNOFF_STATE_PENDING';

const issueSchema = z.object({
  operationNumber: z.number().optional().default(0),
  calloutNumber: z.number().optional().default(0),
  raisedBy: z.string().optional().default(''),
  severity: z.string().optional().default(DEFAULT_ISSUE_SEVERITY),
  status: z.string().optional().default(DEFAULT_ISSUE_STATUS),
  description: z.string().min(1, 'Description is required'),
  resolutionNote: z.string().optional().default(''),
});

const signoffSchema = z.object({
  section: z.string().optional().default(DEFAULT_SIGNOFF_SECTION),
  state: z.string().optional().default(DEFAULT_SIGNOFF_STATE),
  signedBy: z.string().optional().default(''),
  signedAt: z.string().optional().default(''), // YYYY-MM-DD in the UI
  note: z.string().optional().default(''),
});

const mediaItemSchema = z.object({
  mediaId: z.number(),
  kind: z.string().optional().default(DEFAULT_MEDIA_KIND),
  caption: z.string().optional().default(''), // carried (v2; no UI yet)
});

const calloutSchema = z.object({
  number: z.number().optional().default(0),
  part: z.string().optional().default(''),
  description: z.string().optional().default(''),
  dimensions: z.string().optional().default(''),
  mediaId: z.number().optional().default(0), // pinned sketch (0 = unanchored)
  posX: z.string().optional().default(''), // carried (v2; normalised 0..1 marker pos)
  posY: z.string().optional().default(''), // carried (v2)
});

// One usage line of a colourway's "recipe": which catalog article (bomItemIndex) goes on
// which garment part (placement), the colour it takes in THIS colourway, and how much is
// consumed (per-garment and/or per-size). lineTotal/sizeRunTotal are output-only.
const colorwayUsageSchema = z.object({
  bomItemIndex: z.number().optional().default(-1), // index into bomItems; -1 = none
  placement: z.string().optional().default(''),
  color: z.string().optional().default(''),
  pantone: z.string().optional().default(''),
  consumption: z.string().optional().default(''), // per-garment rate, decimal as string
  quantity: z.string().optional().default(''), // count (countable trims), decimal as string
  // per-size grading of a measured material's consumption. When set, the size-run cost
  // folds these against the size run; `consumption` above is the per-garment fallback.
  sizeConsumptions: z.array(sizeConsumptionSchema).default([]),
  // 0-based index into `pieces` this norm is about; -1 = whole garment (informational, NF-05).
  // Positional — renumbered when a piece is removed (nf05-01). UI select lands in W4.4.
  pieceIndex: z.number().optional().default(-1),
  // OUTPUT-ONLY: server-computed spend per garment / over the whole size run.
  lineTotal: z.string().optional().default(''),
  sizeRunTotal: z.string().optional().default(''),
});

// One cut-piece detail (деталь кроя) + its per-colourway fabric mapping (NF-05). materials is a
// sparse list keyed by colorwayIndex; a colourway with no entry is simply unmapped. bomItemIndex /
// fusingBomItemIndex are positional into `bomItems` (-1 = unset), colorwayIndex positional into
// `colorways` — all renumbered on BOM/colourway removal (nf05-01).
const pieceMaterialSchema = z.object({
  colorwayIndex: z.number().optional().default(0),
  bomItemIndex: z.number().optional().default(-1),
  fusingBomItemIndex: z.number().optional().default(-1),
  note: z.string().optional().default(''),
});

const pieceSchema = z.object({
  name: z.string().optional().default(''),
  piecesPerGarment: z.number().optional().default(1),
  mirrored: z.boolean().optional().default(false),
  grainline: z.string().optional().default(''),
  fused: z.boolean().optional().default(false),
  calloutNumber: z.number().optional().default(0),
  note: z.string().optional().default(''),
  materials: z.array(pieceMaterialSchema).default([]),
});

const colorwaySchema = z.object({
  code: z.string().optional().default(''),
  name: z.string().min(1, 'Colourway name is required'),
  labDipStatus: z.string().optional().default(DEFAULT_LAB_DIP),
  productId: z.number().optional().default(0), // FK product(id); 0 = not yet published
  comment: z.string().optional().default(''),
  // lab-dip lifecycle / headline colour identity (swatch), independent of usage colours
  pantone: z.string().optional().default(''),
  pantoneSystem: z.string().optional().default(''),
  hex: z.string().optional().default(''),
  swatchMediaId: z.number().optional().default(0),
  labDipRound: z.number().optional().default(0),
  labDipSubmittedAt: z.string().optional().default(''), // YYYY-MM-DD in the UI
  labDipDecidedAt: z.string().optional().default(''),
  labDipDecidedBy: z.string().optional().default(''),
  labDipRejectReason: z.string().optional().default(''),
  // the colour's material recipe
  usages: z.array(colorwayUsageSchema).default([]),
});

// One BOM article — a pure material-catalog entry. The per-colourway colour, placement and
// consumption live on colourway usages, not here.
const bomItemSchema = z.object({
  section: z.string().optional().default(DEFAULT_BOM_SECTION),
  name: z.string().min(1, 'Material name is required'),
  supplier: z.string().optional().default(''),
  supplierRef: z.string().optional().default(''),
  color: z.string().optional().default(''), // base/reference colour (per-colourway colour is on the usage)
  composition: z.string().optional().default(''),
  spec: z.string().optional().default(''),
  unit: z.string().optional().default(''),
  unitPrice: z.string().optional().default(''), // decimal as string
  currency: z.string().optional().default(''),
  comment: z.string().optional().default(''),
  // fabric data for the cutter (edited in BomItemRow)
  fabricWidth: z.string().optional().default(''),
  fabricWeightGsm: z.string().optional().default(''),
  fabricDirection: z.string().optional().default('TECH_CARD_FABRIC_DIRECTION_UNKNOWN'),
  wastagePercent: z.string().optional().default(''),
  // optional link to a catalog Material (0 = unlinked free-text line). The line keeps its own
  // snapshot fields regardless of the link.
  materialId: z.number().optional().default(0),
  // Stable line identity (Q9/§2.3). `id` is the server PK (read-only, 0 = not yet saved); `lineKey`
  // is the client-generated ULID minted when the row is created in the UI, round-tripped so the
  // server keyed-reconciles by it and downstream refs (operations/pieces/usages) stay valid.
  id: z.number().optional().default(0),
  lineKey: z.string().optional().default(''),
});

// One construction-description aspect (Sheet «Титул», lower block): freeform text + optional
// reference images. key is silhouette/collar/fastening/… or a custom aspect.
const detailSchema = z.object({
  key: z.string().optional().default(''),
  text: z.string().optional().default(''),
  mediaIds: z.array(z.number()).default([]),
});

const DEFAULT_LABEL_TYPE: common_TechCardLabelType = 'TECH_CARD_LABEL_TYPE_MAIN';

const constructionSchema = z.object({
  mainStitchType: z.string().optional().default(''),
  stitchDensity: z.string().optional().default(''),
  overlockThreads: z.string().optional().default(''),
  seamAllowances: z.string().optional().default(''),
  hemFinish: z.string().optional().default(''),
  pressing: z.string().optional().default(''),
  machineClass: z.string().optional().default(''),
  notes: z.string().optional().default(''),
});

const operationSchema = z.object({
  node: z.string().min(1, 'Node is required'),
  description: z.string().optional().default(''),
  seamType: z.string().optional().default(''),
  stitchesPerCm: z.string().optional().default(''), // decimal as string
  topstitchWidth: z.string().optional().default(''),
  thread: z.string().optional().default(''),
  note: z.string().optional().default(''),
  // operationNumber is server-assigned ((position+1)*10) — carried read-only, not edited.
  operationNumber: z.number().optional().default(0),
  machine: z.string().optional().default(''),
  seamAllowance: z.string().optional().default(''),
  needle: z.string().optional().default(''),
  timeNorm: z.string().optional().default(''), // SAM minutes, decimal as string
  // classification + links (Phase 3.5d)
  operationType: z.string().optional().default('TECH_CARD_OPERATION_TYPE_UNKNOWN'),
  zone: z.string().optional().default('TECH_CARD_CONSTRUCTION_ZONE_UNKNOWN'),
  attachment: z.string().optional().default(''), // приспособление (binder / folder / hemmer)
  bomItemIndex: z.number().optional().default(-1), // index into bomItems; -1 = none
  calloutNumber: z.number().optional().default(0), // links a sketch callout.number; 0 = none
  // garment part this operation works on; resolves its real material via the selected
  // colourway's usage on the same part.
  placement: z.string().optional().default(''),
});

const labelSchema = z.object({
  labelType: z.string().optional().default(DEFAULT_LABEL_TYPE),
  content: z.string().optional().default(''),
  placement: z.string().optional().default(''),
  attachment: z.string().optional().default(''),
  size: z.string().optional().default(''),
  note: z.string().optional().default(''),
});

const packagingSchema = z.object({
  foldingMethod: z.string().optional().default(''),
  polybag: z.string().optional().default(''),
  bagSticker: z.string().optional().default(''),
  inserts: z.string().optional().default(''),
  unitsPerBox: z.number().optional().default(0),
  boxMarking: z.string().optional().default(''),
  boxDimensions: z.string().optional().default(''),
  weightNetGrams: z.number().optional().default(0), // whole grams (0 = unset)
  weightGrossGrams: z.number().optional().default(0), // whole grams (0 = unset)
  notes: z.string().optional().default(''),
});

// Manual per-unit cost articles (per ONE garment), all in a single `currency`. Pricing
// (markup/wholesale/retail) was removed from the tech card — it lives on the published product.
const costingSchema = z.object({
  cmtCost: z.string().optional().default(''),
  hardwareCost: z.string().optional().default(''),
  packagingCost: z.string().optional().default(''),
  logisticsCost: z.string().optional().default(''),
  overheadCost: z.string().optional().default(''),
  defectPercent: z.string().optional().default(''),
  currency: z.string().optional().default(''),
  notes: z.string().optional().default(''),
});

export const emptyConstruction: z.input<typeof constructionSchema> = {
  mainStitchType: '',
  stitchDensity: '',
  overlockThreads: '',
  seamAllowances: '',
  hemFinish: '',
  pressing: '',
  machineClass: '',
  notes: '',
};

export const emptyPackaging: z.input<typeof packagingSchema> = {
  foldingMethod: '',
  polybag: '',
  bagSticker: '',
  inserts: '',
  unitsPerBox: 0,
  boxMarking: '',
  boxDimensions: '',
  weightNetGrams: 0,
  weightGrossGrams: 0,
  notes: '',
};

export const emptyCosting: z.input<typeof costingSchema> = {
  cmtCost: '',
  hardwareCost: '',
  packagingCost: '',
  logisticsCost: '',
  overheadCost: '',
  defectPercent: '',
  currency: '',
  notes: '',
};

const techCardObject = z.object({
  // identification. style_number is optional in the form so an IDEA concept can be created without
  // an article number; a conditional refine below still requires it past IDEA, and an empty IDEA
  // number is auto-filled with a draft on save (B-2, backend still requires the field).
  styleNumber: z.string().optional().default(''),
  name: z.string().min(1, 'Name is required'),
  brand: z.string().optional().default(''),
  season: z.string().optional().default(''),
  collection: z.string().optional().default(''),
  // version / designer / constructor / technologist / approvedBy removed from the contract
  // (Q1/Q5): the card's version is the release sequence (Rev.N) + the auto-journal, and roles are
  // admin-account assignments managed via the role-assignment RPCs (see RolesField).
  status: z.string().optional().default(''),
  // classification FKs (0 = unset). categoryId is the selected LEAF category.
  categoryId: z.number().optional().default(0),
  baseModelId: z.number().optional().default(0),
  baseSampleSizeId: z.number().optional().default(0),
  // classification
  targetGender: z.string().optional().default(UNSET_GENDER),
  stage: z.string().optional().default(DEFAULT_STAGE),
  approvalState: z.string().optional().default(DEFAULT_APPROVAL_STATE),
  measurementUnit: z.string().optional().default(DEFAULT_MEASUREMENT_UNIT),
  notes: z.string().optional().default(''),
  // children
  sizeIds: z.array(z.number()).default([]),
  sizeQuantities: z.array(sizeQuantitySchema).default([]),
  patterns: z.array(patternSchema).default([]), // per-size PDF выкройки
  productIds: z.array(z.number()).default([]),
  // NF-07 auxiliary items: purpose is 'sellable' (default) or 'auxiliary' (produces a packaging
  // material, not a product). An auxiliary card links no products and its run output receipts into
  // outputMaterialId (required before its first run; 0 = unset).
  purpose: z.string().optional().default('sellable'),
  outputMaterialId: z.number().optional().default(0),
  // Cut-piece details + per-colourway fabric map (NF-05). Positional refs (nf05-01).
  pieces: z.array(pieceSchema).default([]),
  // Sketch media split into two independent lists (construction consumes ONLY technicalMedia;
  // callouts pin onto ANY media_id — moodboard or technical, B-1). Each item's `kind` sub-classifies.
  moodboardMedia: z.array(mediaItemSchema).default([]),
  technicalMedia: z.array(mediaItemSchema).default([]),
  callouts: z.array(calloutSchema).default([]),
  colorways: z.array(colorwaySchema).default([]),
  bomItems: z.array(bomItemSchema).default([]),
  details: z.array(detailSchema).default([]), // construction-description aspects (text + images)
  construction: constructionSchema,
  operations: z.array(operationSchema).default([]),
  labels: z.array(labelSchema).default([]),
  packaging: packagingSchema,
  costing: costingSchema,
  issues: z.array(issueSchema).default([]),
  signoffs: z.array(signoffSchema).default([]),
});

// style_number is required past the IDEA stage; at IDEA it may be blank (the backend accepts it).
export const techCardSchema = techCardObject.superRefine((data, ctx) => {
  if (data.stage !== 'TECH_CARD_STAGE_IDEA' && !data.styleNumber?.trim()) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Style number is required',
      path: ['styleNumber'],
    });
  }
});

export type TechCardFormData = z.input<typeof techCardObject>;

export const techCardDefaultData: TechCardFormData = {
  styleNumber: '',
  name: '',
  brand: '',
  season: '',
  collection: '',
  status: '',
  categoryId: 0,
  baseModelId: 0,
  baseSampleSizeId: 0,
  targetGender: UNSET_GENDER,
  stage: DEFAULT_STAGE,
  approvalState: DEFAULT_APPROVAL_STATE,
  measurementUnit: DEFAULT_MEASUREMENT_UNIT,
  notes: '',
  sizeIds: [],
  sizeQuantities: [],
  patterns: [],
  productIds: [],
  purpose: 'sellable',
  outputMaterialId: 0,
  pieces: [],
  moodboardMedia: [],
  technicalMedia: [],
  callouts: [],
  colorways: [],
  bomItems: [],
  details: [],
  construction: { ...emptyConstruction },
  operations: [],
  labels: [],
  packaging: { ...emptyPackaging },
  costing: { ...emptyCosting },
  issues: [],
  signoffs: [],
};

function stageOrDefault(stage?: string): string {
  return stage && stage !== 'TECH_CARD_STAGE_UNKNOWN' ? stage : DEFAULT_STAGE;
}
function approvalStateOrDefault(state?: string): string {
  return state && state !== 'TECH_CARD_APPROVAL_STATE_UNKNOWN' ? state : DEFAULT_APPROVAL_STATE;
}
function measurementUnitOrDefault(unit?: string): string {
  return unit && unit !== 'TECH_CARD_MEASUREMENT_UNIT_UNKNOWN' ? unit : DEFAULT_MEASUREMENT_UNIT;
}

// Both sketch-media lists (moodboard / technical) share the { mediaId, kind, caption } shape.
// `fallbackKind` keeps the default list-appropriate: an UNKNOWN-kind moodboard item defaulted to
// FRONT (a technical kind), rendering a blank select and persisting the wrong kind on save.
type FormMediaItem = z.input<typeof mediaItemSchema>;
function mapMediaItemToForm(
  m: common_TechCardMediaItem,
  fallbackKind: common_TechCardMediaKind = DEFAULT_MEDIA_KIND,
): FormMediaItem {
  return {
    mediaId: m.mediaId || 0,
    kind: m.kind && m.kind !== 'TECH_CARD_MEDIA_KIND_UNKNOWN' ? m.kind : fallbackKind,
    caption: m.caption || '',
  };
}
function mapMediaItemOut(m: FormMediaItem): common_TechCardMediaItem {
  return {
    mediaId: m.mediaId,
    kind: (m.kind || 'TECH_CARD_MEDIA_KIND_UNKNOWN') as common_TechCardMediaKind,
    caption: m.caption?.trim() || '',
  };
}

const MOODBOARD_KIND_SET = new Set([
  'TECH_CARD_MEDIA_KIND_MOODBOARD',
  'TECH_CARD_MEDIA_KIND_REFERENCE',
  'TECH_CARD_MEDIA_KIND_SWATCH',
]);

// Sketch media read into the two split lists. Backward-compat: a tech card saved before the
// proto media-split still holds its sketches under the removed single `media` field. If BOTH
// new lists are empty but a legacy `media` list is present, route legacy items into
// moodboard/technical by kind — so an un-migrated card doesn't open with empty grids and get
// its sketches wiped on the next full-replace save.
function splitSketchMedia(insert?: common_TechCardInsert): {
  moodboardMedia: FormMediaItem[];
  technicalMedia: FormMediaItem[];
} {
  const moodboardMedia = (insert?.moodboardMedia ?? []).map((m) =>
    mapMediaItemToForm(m, 'TECH_CARD_MEDIA_KIND_MOODBOARD'),
  );
  const technicalMedia = (insert?.technicalMedia ?? []).map((m) => mapMediaItemToForm(m));
  if (moodboardMedia.length || technicalMedia.length) return { moodboardMedia, technicalMedia };
  const legacy = (insert as { media?: common_TechCardMediaItem[] } | undefined)?.media ?? [];
  const mood: FormMediaItem[] = [];
  const tech: FormMediaItem[] = [];
  for (const m of legacy) {
    const item = mapMediaItemToForm(m);
    (MOODBOARD_KIND_SET.has(item.kind ?? '') ? mood : tech).push(item);
  }
  return { moodboardMedia: mood, technicalMedia: tech };
}

// TODO(final-bump): common_TechCardInsert no longer carries `colorways` (R1 merge — a
// colourway is now a product, referenced by colorwayId). This shape lets the form-mapping
// below keep compiling against an always-empty source; source real colourway data from
// GetColorwaysPaged by style / AdminColorwayRef instead.
type LegacyColorwaySource = {
  code?: string;
  name?: string;
  labDipStatus?: common_TechCardLabDipStatus;
  productId?: number;
  comment?: string;
  pantone?: string;
  pantoneSystem?: string;
  hex?: string;
  swatchMediaId?: number;
  labDipRound?: number;
  labDipSubmittedAt?: string;
  labDipDecidedAt?: string;
  labDipDecidedBy?: string;
  labDipRejectReason?: string;
  usages?: {
    bomItemIndex?: number;
    placement?: string;
    color?: string;
    pantone?: string;
    consumption?: googletype_Decimal;
    quantity?: googletype_Decimal;
    sizeConsumptions?: { sizeId?: number; consumption?: googletype_Decimal }[];
    pieceIndex?: number;
    lineTotal?: googletype_Decimal;
    sizeRunTotal?: googletype_Decimal;
  }[];
};

export function mapTechCardToForm(techCard: common_TechCard): TechCardFormData {
  const insert = techCard.techCard;
  return {
    styleNumber: insert?.styleNumber || '',
    name: insert?.name || '',
    brand: insert?.brand || '',
    // TODO(final-bump): season is no longer on TechCardInsert (moved to skuSeason on the
    // style write path, not yet surfaced in this form).
    season: '',
    collection: insert?.collection || '',
    status: insert?.status || '',
    categoryId: insert?.categoryId || 0,
    baseModelId: insert?.baseModelId || 0,
    baseSampleSizeId: insert?.baseSampleSizeId || 0,
    targetGender: insert?.targetGender || UNSET_GENDER,
    stage: stageOrDefault(insert?.stage),
    approvalState: approvalStateOrDefault(insert?.approvalState),
    measurementUnit: measurementUnitOrDefault(insert?.measurementUnit),
    notes: insert?.notes || '',
    sizeIds: insert?.sizeIds ?? [],
    sizeQuantities: (insert?.sizeQuantities ?? []).map((q) => ({
      sizeId: q.sizeId || 0,
      orderQty: q.orderQty || 0,
    })),
    patterns: (insert?.patterns ?? []).map((p) => ({
      sizeId: p.sizeId || 0,
      url: p.url || '',
      filename: p.filename || '',
      // size_bytes is int64 → arrives as a string from grpc-gateway; coerce to a real number
      // so the form value passes z.number() (a string would silently block save).
      sizeBytes: Number(p.sizeBytes) || 0,
    })),
    // TODO(final-bump): productIds is no longer on TechCardInsert — a colourway now carries
    // its own product link.
    productIds: [],
    purpose: insert?.purpose || 'sellable',
    outputMaterialId: insert?.outputMaterialId || 0,
    ...splitSketchMedia(insert),
    callouts: (insert?.callouts ?? []).map((c) => ({
      number: c.number || 0,
      part: c.part || '',
      description: c.description || '',
      dimensions: c.dimensions || '',
      mediaId: c.mediaId || 0,
      posX: decimalToInput(c.posX),
      posY: decimalToInput(c.posY),
    })),
    // TODO(final-bump): insert.colorways is gone (see LegacyColorwaySource above) — this map
    // is now permanently over an empty array.
    colorways: ([] as LegacyColorwaySource[]).map((c) => ({
      code: c.code || '',
      name: c.name || '',
      labDipStatus:
        c.labDipStatus && c.labDipStatus !== 'TECH_CARD_LAB_DIP_STATUS_UNKNOWN'
          ? c.labDipStatus
          : DEFAULT_LAB_DIP,
      productId: c.productId || 0,
      comment: c.comment || '',
      pantone: c.pantone || '',
      pantoneSystem: c.pantoneSystem || '',
      hex: c.hex || '',
      swatchMediaId: c.swatchMediaId || 0,
      labDipRound: c.labDipRound || 0,
      labDipSubmittedAt: timestampToDateInput(c.labDipSubmittedAt),
      labDipDecidedAt: timestampToDateInput(c.labDipDecidedAt),
      labDipDecidedBy: c.labDipDecidedBy || '',
      labDipRejectReason: c.labDipRejectReason || '',
      usages: (c.usages ?? []).map((u) => ({
        bomItemIndex: u.bomItemIndex ?? -1,
        placement: u.placement || '',
        color: u.color || '',
        pantone: u.pantone || '',
        consumption: decimalToInput(u.consumption),
        quantity: decimalToInput(u.quantity),
        sizeConsumptions: (u.sizeConsumptions ?? []).map((sc) => ({
          sizeId: sc.sizeId || 0,
          consumption: decimalToInput(sc.consumption),
        })),
        pieceIndex: u.pieceIndex ?? -1,
        lineTotal: decimalToInput(u.lineTotal),
        sizeRunTotal: decimalToInput(u.sizeRunTotal),
      })),
    })),
    pieces: (insert?.pieces ?? []).map((p) => ({
      name: p.name || '',
      piecesPerGarment: p.piecesPerGarment ?? 1,
      mirrored: p.mirrored ?? false,
      grainline: p.grainline || '',
      fused: p.fused ?? false,
      calloutNumber: p.calloutNumber ?? 0,
      note: p.note || '',
      materials: (p.materials ?? []).map((m) => ({
        // TODO(final-bump): proto field renamed colorwayIndex -> colorwayId.
        colorwayIndex: m.colorwayId ?? 0,
        bomItemIndex: m.bomItemIndex ?? -1,
        fusingBomItemIndex: m.fusingBomItemIndex ?? -1,
        note: m.note || '',
      })),
    })),
    bomItems: (insert?.bomItems ?? []).map((b) => ({
      section:
        b.section && b.section !== 'TECH_CARD_BOM_SECTION_UNKNOWN'
          ? b.section
          : DEFAULT_BOM_SECTION,
      name: b.name || '',
      supplier: b.supplier || '',
      supplierRef: b.supplierRef || '',
      color: b.color || '',
      composition: b.composition || '',
      spec: b.spec || '',
      unit: b.unit || '',
      unitPrice: decimalToInput(b.unitPrice),
      currency: b.currency || '',
      comment: b.comment || '',
      fabricWidth: decimalToInput(b.fabricWidth),
      fabricWeightGsm: decimalToInput(b.fabricWeightGsm),
      fabricDirection:
        b.fabricDirection && b.fabricDirection !== 'TECH_CARD_FABRIC_DIRECTION_UNKNOWN'
          ? b.fabricDirection
          : 'TECH_CARD_FABRIC_DIRECTION_UNKNOWN',
      wastagePercent: decimalToInput(b.wastagePercent),
      materialId: b.materialId ?? 0,
      id: b.id ?? 0,
      lineKey: b.lineKey || '',
    })),
    details: (insert?.details ?? []).map((d) => ({
      key: d.key || '',
      text: d.text || '',
      mediaIds: d.mediaIds ?? [],
    })),
    construction: insert?.construction
      ? {
          mainStitchType: insert.construction.mainStitchType || '',
          stitchDensity: insert.construction.stitchDensity || '',
          overlockThreads: insert.construction.overlockThreads || '',
          seamAllowances: insert.construction.seamAllowances || '',
          hemFinish: insert.construction.hemFinish || '',
          pressing: insert.construction.pressing || '',
          machineClass: insert.construction.machineClass || '',
          notes: insert.construction.notes || '',
        }
      : { ...emptyConstruction },
    operations: (insert?.operations ?? []).map((o) => ({
      node: o.node || '',
      description: o.description || '',
      seamType: o.seamType || '',
      stitchesPerCm: decimalToInput(o.stitchesPerCm),
      topstitchWidth: o.topstitchWidth || '',
      thread: o.thread || '',
      note: o.note || '',
      operationNumber: o.operationNumber || 0,
      machine: o.machine || '',
      seamAllowance: o.seamAllowance || '',
      needle: o.needle || '',
      timeNorm: decimalToInput(o.timeNorm),
      operationType: o.operationType || 'TECH_CARD_OPERATION_TYPE_UNKNOWN',
      zone: o.zone || 'TECH_CARD_CONSTRUCTION_ZONE_UNKNOWN',
      attachment: o.attachment || '',
      bomItemIndex: o.bomItemIndex ?? -1,
      calloutNumber: o.calloutNumber || 0,
      placement: o.placement || '',
    })),
    labels: (insert?.labels ?? []).map((l) => ({
      labelType:
        l.labelType && l.labelType !== 'TECH_CARD_LABEL_TYPE_UNKNOWN'
          ? l.labelType
          : DEFAULT_LABEL_TYPE,
      content: l.content || '',
      placement: l.placement || '',
      attachment: l.attachment || '',
      size: l.size || '',
      note: l.note || '',
    })),
    packaging: insert?.packaging
      ? {
          foldingMethod: insert.packaging.foldingMethod || '',
          polybag: insert.packaging.polybag || '',
          bagSticker: insert.packaging.bagSticker || '',
          inserts: insert.packaging.inserts || '',
          unitsPerBox: insert.packaging.unitsPerBox || 0,
          boxMarking: insert.packaging.boxMarking || '',
          boxDimensions: insert.packaging.boxDimensions || '',
          weightNetGrams: insert.packaging.weightNetGrams || 0,
          weightGrossGrams: insert.packaging.weightGrossGrams || 0,
          notes: insert.packaging.notes || '',
        }
      : { ...emptyPackaging },
    costing: insert?.costing
      ? {
          cmtCost: decimalToInput(insert.costing.cmtCost),
          hardwareCost: decimalToInput(insert.costing.hardwareCost),
          packagingCost: decimalToInput(insert.costing.packagingCost),
          logisticsCost: decimalToInput(insert.costing.logisticsCost),
          overheadCost: decimalToInput(insert.costing.overheadCost),
          defectPercent: decimalToInput(insert.costing.defectPercent),
          currency: insert.costing.currency || '',
          notes: insert.costing.notes || '',
        }
      : { ...emptyCosting },
    issues: (insert?.issues ?? []).map((i) => ({
      operationNumber: i.operationNumber || 0,
      calloutNumber: i.calloutNumber || 0,
      raisedBy: i.raisedBy || '',
      severity:
        i.severity && i.severity !== 'TECH_CARD_ISSUE_SEVERITY_UNKNOWN'
          ? i.severity
          : DEFAULT_ISSUE_SEVERITY,
      status:
        i.status && i.status !== 'TECH_CARD_ISSUE_STATUS_UNKNOWN' ? i.status : DEFAULT_ISSUE_STATUS,
      description: i.description || '',
      resolutionNote: i.resolutionNote || '',
    })),
    signoffs: (insert?.signoffs ?? []).map((s) => ({
      section:
        s.section && s.section !== 'TECH_CARD_SIGNOFF_SECTION_UNKNOWN'
          ? s.section
          : DEFAULT_SIGNOFF_SECTION,
      state:
        s.state && s.state !== 'TECH_CARD_SIGNOFF_STATE_UNKNOWN' ? s.state : DEFAULT_SIGNOFF_STATE,
      signedBy: s.signedBy || '',
      signedAt: timestampToDateInput(s.signedAt),
      note: s.note || '',
    })),
  };
}

// 1:1 sections — sent as undefined (unset) when the whole block is empty.
function mapConstructionOut(
  c?: TechCardFormData['construction'],
): common_TechCardConstruction | undefined {
  const out: common_TechCardConstruction = {
    mainStitchType: c?.mainStitchType?.trim() || '',
    stitchDensity: c?.stitchDensity?.trim() || '',
    overlockThreads: c?.overlockThreads?.trim() || '',
    seamAllowances: c?.seamAllowances?.trim() || '',
    hemFinish: c?.hemFinish?.trim() || '',
    pressing: c?.pressing?.trim() || '',
    machineClass: c?.machineClass?.trim() || '',
    notes: c?.notes?.trim() || '',
  };
  const content = hasContent([
    out.mainStitchType,
    out.stitchDensity,
    out.overlockThreads,
    out.seamAllowances,
    out.hemFinish,
    out.pressing,
    out.machineClass,
    out.notes,
  ]);
  return content ? out : undefined;
}

function mapPackagingOut(p?: TechCardFormData['packaging']): common_TechCardPackaging | undefined {
  if (
    !hasContent([
      p?.foldingMethod,
      p?.polybag,
      p?.bagSticker,
      p?.inserts,
      p?.unitsPerBox,
      p?.boxMarking,
      p?.boxDimensions,
      p?.weightNetGrams,
      p?.weightGrossGrams,
      p?.notes,
    ])
  ) {
    return undefined;
  }
  return {
    foldingMethod: p?.foldingMethod?.trim() || '',
    polybag: p?.polybag?.trim() || '',
    bagSticker: p?.bagSticker?.trim() || '',
    inserts: p?.inserts?.trim() || '',
    unitsPerBox: p?.unitsPerBox || 0,
    boxMarking: p?.boxMarking?.trim() || '',
    boxDimensions: p?.boxDimensions?.trim() || '',
    weightNetGrams: p?.weightNetGrams || 0,
    weightGrossGrams: p?.weightGrossGrams || 0,
    notes: p?.notes?.trim() || '',
  };
}

// The materials line and the unit/order totals (materials_total / materials_per_unit /
// unit_cost / order_qty / order_cost / colorway_costs / total_sam) are computed server-side
// from the BOM + colourway usages — output-only, never sent on write.
function mapCostingOut(c?: TechCardFormData['costing']): common_TechCardCosting | undefined {
  if (
    !hasContent([
      c?.cmtCost,
      c?.hardwareCost,
      c?.packagingCost,
      c?.logisticsCost,
      c?.overheadCost,
      c?.defectPercent,
      c?.currency,
      c?.notes,
    ])
  ) {
    return undefined;
  }
  return {
    cmtCost: inputToDecimal(c?.cmtCost),
    hardwareCost: inputToDecimal(c?.hardwareCost),
    packagingCost: inputToDecimal(c?.packagingCost),
    logisticsCost: inputToDecimal(c?.logisticsCost),
    overheadCost: inputToDecimal(c?.overheadCost),
    defectPercent: inputToDecimal(c?.defectPercent),
    currency: c?.currency?.trim() || '',
    notes: c?.notes?.trim() || '',
    materialsTotal: undefined,
    materialsPerUnit: undefined,
    unitCost: undefined,
    orderQty: undefined,
    orderCost: undefined,
    hasUnconvertedCurrencies: undefined,
    totalSam: undefined,
    colorwayCosts: undefined,
    // Base-currency roll-up (server-folded via costing FX rates) — output-only.
    unitCostBase: undefined,
    orderCostBase: undefined,
    baseCurrency: undefined,
  };
}

// Merge the edited fields over the original insert. Every section is form-managed;
// `original` is still spread so any future-added proto field survives.
export function mapFormToTechCardInsert(
  data: TechCardFormData,
  original?: common_TechCardInsert,
  // When the editor lacks costing:write the costing block is hidden and the form holds an
  // empty costing (the server nulled it on read for non-costing readers). Recomputing from
  // that empty form would send `costing: undefined` and — under full-replace — WIPE the stored
  // costing. Preserve the original block instead so a non-costing editor can never destroy it.
  canWriteCosting: boolean = true,
): common_TechCardInsert {
  // B-2: an IDEA card may carry an empty style_number — the backend now accepts it while
  // stage == IDEA and only enforces a real number when the card moves out (to PROTO+). So we
  // send whatever the user typed verbatim; the schema refine below still requires a number at
  // non-IDEA stages, blocking a stage advance client-side before the server would reject it.
  const styleNumber = data.styleNumber?.trim() || '';
  return {
    ...original,
    styleNumber,
    name: data.name.trim(),
    brand: data.brand?.trim() || '',
    // TODO(final-bump): season/productIds/colorways moved off the style write path (R1
    // merge) — season lives on skuSeason (not yet surfaced in this form), productIds/
    // colorways are managed per-colourway (product), not on TechCardInsert.
    collection: data.collection?.trim() || '',
    status: data.status?.trim() || '',
    categoryId: data.categoryId || 0,
    baseModelId: data.baseModelId || 0,
    baseSampleSizeId: data.baseSampleSizeId || 0,
    targetGender: (data.targetGender || UNSET_GENDER) as common_GenderEnum,
    stage: (data.stage || 'TECH_CARD_STAGE_UNKNOWN') as common_TechCardStage,
    approvalState: (data.approvalState ||
      'TECH_CARD_APPROVAL_STATE_UNKNOWN') as common_TechCardApprovalState,
    measurementUnit: (data.measurementUnit ||
      'TECH_CARD_MEASUREMENT_UNIT_UNKNOWN') as common_TechCardMeasurementUnit,
    notes: data.notes?.trim() || '',
    // children edited here — override the echoed `original` values
    sizeIds: data.sizeIds ?? [],
    sizeQuantities: (data.sizeQuantities ?? []).map((q) => ({
      sizeId: q.sizeId || 0,
      orderQty: q.orderQty || 0,
    })),
    patterns: (data.patterns ?? [])
      .filter((p) => p.url?.trim())
      .map((p) => ({
        sizeId: p.sizeId || 0,
        url: p.url?.trim() || '',
        filename: p.filename?.trim() || '',
        sizeBytes: p.sizeBytes || 0,
      })),
    // Auxiliary cards link no products and receipt into a material instead; sellable cards carry
    // no output material. Enforce the exclusivity here so a purpose flip can't leave stale data.
    purpose: data.purpose || 'sellable',
    outputMaterialId: data.purpose === 'auxiliary' ? data.outputMaterialId || 0 : 0,
    moodboardMedia: (data.moodboardMedia ?? []).map(mapMediaItemOut),
    technicalMedia: (data.technicalMedia ?? []).map(mapMediaItemOut),
    callouts: (data.callouts ?? []).map((c) => ({
      number: c.number || 0,
      part: c.part?.trim() || '',
      description: c.description?.trim() || '',
      dimensions: c.dimensions?.trim() || '',
      mediaId: c.mediaId || 0,
      posX: inputToDecimal(c.posX),
      posY: inputToDecimal(c.posY),
    })),
    // NF-05 cut-pieces + fabric map. bomItemIndex / fusingBomItemIndex use explicit presence
    // (>= 0 real, undefined = unset), mirroring usages.bomItemIndex.
    pieces: (data.pieces ?? []).map((p) => ({
      name: p.name?.trim() || '',
      // clamp to >= 1: 0 has no physical meaning and (no explicit presence on the wire)
      // reads back as unset -> the old || 0 silently flipped a saved 0 to 1 after reload
      piecesPerGarment: p.piecesPerGarment || 1,
      mirrored: p.mirrored ?? false,
      grainline: p.grainline?.trim() || '',
      fused: p.fused ?? false,
      calloutNumber: p.calloutNumber || 0,
      note: p.note?.trim() || '',
      materials: (p.materials ?? [])
        // drop fully-empty cells (no fabric, no fusing, no note) so the map stays sparse —
        // a note-only cell (written by another client) must survive an unrelated save
        .filter(
          (m) =>
            (typeof m.bomItemIndex === 'number' && m.bomItemIndex >= 0) ||
            (typeof m.fusingBomItemIndex === 'number' && m.fusingBomItemIndex >= 0) ||
            !!m.note?.trim(),
        )
        .map((m) => ({
          // TODO(final-bump): proto field renamed colorwayIndex -> colorwayId.
          colorwayId: m.colorwayIndex || 0,
          bomItemIndex:
            typeof m.bomItemIndex === 'number' && m.bomItemIndex >= 0 ? m.bomItemIndex : undefined,
          fusingBomItemIndex:
            typeof m.fusingBomItemIndex === 'number' && m.fusingBomItemIndex >= 0
              ? m.fusingBomItemIndex
              : undefined,
          // durable line_key refs (§2.3) — resolved in the stable-BOM write path; positional
          // *_index still carries the reference until then.
          bomLineKey: undefined,
          fusingBomLineKey: undefined,
          bomItemId: undefined,
          fusingBomItemId: undefined,
          note: m.note?.trim() || '',
        })),
    })),
    bomItems: (data.bomItems ?? []).map((b) => ({
      section: (b.section || 'TECH_CARD_BOM_SECTION_UNKNOWN') as common_TechCardBomSection,
      name: b.name?.trim() || '',
      supplier: b.supplier?.trim() || '',
      supplierRef: b.supplierRef?.trim() || '',
      color: b.color?.trim() || '',
      composition: b.composition?.trim() || '',
      spec: b.spec?.trim() || '',
      unit: b.unit?.trim() || '',
      unitPrice: inputToDecimal(b.unitPrice),
      currency: b.currency?.trim() || '',
      comment: b.comment?.trim() || '',
      fabricWidth: inputToDecimal(b.fabricWidth),
      fabricWeightGsm: inputToDecimal(b.fabricWeightGsm),
      fabricDirection: (b.fabricDirection ||
        'TECH_CARD_FABRIC_DIRECTION_UNKNOWN') as common_TechCardFabricDirection,
      wastagePercent: inputToDecimal(b.wastagePercent),
      materialId: b.materialId || 0,
      // Stable identity (§2.3): keep the server PK; ensure every line carries a ULID line_key so the
      // server keyed-reconciles by it. A row created before this field existed (or a legacy card)
      // gets one minted here at save time. material_snapshot is server-managed (read-only) — never sent.
      id: b.id || 0,
      lineKey: isUlid(b.lineKey) ? b.lineKey : ulid(),
      materialSnapshot: undefined,
    })),
    details: (data.details ?? [])
      .map((d) => ({
        key: d.key?.trim() || '',
        text: d.text?.trim() || '',
        mediaIds: d.mediaIds ?? [],
      }))
      .filter((d) => d.key || d.text || d.mediaIds.length > 0),
    construction: mapConstructionOut(data.construction),
    operations: (data.operations ?? []).map((o, i) => ({
      node: o.node?.trim() || '',
      description: o.description?.trim() || '',
      seamType: o.seamType?.trim() || '',
      stitchesPerCm: inputToDecimal(o.stitchesPerCm),
      topstitchWidth: o.topstitchWidth?.trim() || '',
      thread: o.thread?.trim() || '',
      note: o.note?.trim() || '',
      // operation number is positional (server is authoritative); send (i+1)*10 so a
      // freshly-created card reads back sensibly before the server recomputes.
      operationNumber: (i + 1) * 10,
      machine: o.machine?.trim() || '',
      seamAllowance: o.seamAllowance?.trim() || '',
      needle: o.needle?.trim() || '',
      timeNorm: inputToDecimal(o.timeNorm),
      operationType: (o.operationType ||
        'TECH_CARD_OPERATION_TYPE_UNKNOWN') as common_TechCardOperationType,
      zone: (o.zone || 'TECH_CARD_CONSTRUCTION_ZONE_UNKNOWN') as common_TechCardConstructionZone,
      attachment: o.attachment?.trim() || '',
      bomItemIndex:
        typeof o.bomItemIndex === 'number' && o.bomItemIndex >= 0 ? o.bomItemIndex : undefined,
      // bomLineKey/bomItemId are the durable BOM reference (§2.3); resolved from the line_key map in
      // the stable-BOM write path. Left unset here — the positional bomItemIndex still carries it.
      bomLineKey: undefined,
      bomItemId: undefined,
      calloutNumber: o.calloutNumber || 0,
      placement: o.placement?.trim() || '',
    })),
    labels: (data.labels ?? []).map((l) => ({
      labelType: (l.labelType || 'TECH_CARD_LABEL_TYPE_UNKNOWN') as common_TechCardLabelType,
      content: l.content?.trim() || '',
      placement: l.placement?.trim() || '',
      attachment: l.attachment?.trim() || '',
      size: l.size?.trim() || '',
      note: l.note?.trim() || '',
    })),
    packaging: mapPackagingOut(data.packaging),
    // Only a costing:write editor may change costing; everyone else preserves what was loaded.
    costing: canWriteCosting ? mapCostingOut(data.costing) : original?.costing,
    issues: (data.issues ?? []).map((i) => ({
      operationNumber: i.operationNumber || 0,
      calloutNumber: i.calloutNumber || 0,
      raisedBy: i.raisedBy?.trim() || '',
      severity: (i.severity || 'TECH_CARD_ISSUE_SEVERITY_UNKNOWN') as common_TechCardIssueSeverity,
      status: (i.status || 'TECH_CARD_ISSUE_STATUS_UNKNOWN') as common_TechCardIssueStatus,
      description: i.description?.trim() || '',
      resolutionNote: i.resolutionNote?.trim() || '',
    })),
    signoffs: (data.signoffs ?? []).map((s) => ({
      section: (s.section || 'TECH_CARD_SIGNOFF_SECTION_UNKNOWN') as common_TechCardSignoffSection,
      state: (s.state || 'TECH_CARD_SIGNOFF_STATE_UNKNOWN') as common_TechCardSignoffState,
      signedBy: s.signedBy?.trim() || '',
      signedAt: s.signedAt ? dateInputToTimestamp(s.signedAt) : undefined,
      note: s.note?.trim() || '',
    })),
    // revisions removed from the write payload (Q1): the auto-journal is server-appended and
    // read-only (common_TechCard.revisions), never client-supplied.
    // TODO(final-bump): skuSeason replaces the removed free-text `season` as the style's
    // season identity, but isn't yet surfaced in this form — leave unset for now.
    skuSeason: undefined,
    // Cast: TechCardInsert keys are required-but-nullable; we set every section above and
    // echo any still-unhandled proto field from `original`. Untouched keys are omitted on
    // create (absent == empty on the wire), which the structural type can't express.
  } as common_TechCardInsert;
}
