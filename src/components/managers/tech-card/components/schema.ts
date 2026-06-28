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
  common_TechCardLabDipStatus,
  common_TechCardLabelType,
  common_TechCardMeasurementUnit,
  common_TechCardMediaKind,
  common_TechCardOperationType,
  common_TechCardPackaging,
  common_TechCardSignoffSection,
  common_TechCardSignoffState,
  common_TechCardStage,
} from 'api/proto-http/admin';
import { ZERO_TIMESTAMP } from 'components/managers/tech-cards/components/utils';
import { decimalToInput, inputToDecimal } from 'utils/decimal';
import { z } from 'zod';

// Tech-card form. Covers the full TechCardInsert: header ("Титул"), sketch media +
// callouts, size range + patterns, linked products, colourways (recipe = usages), BOM
// (article catalog), construction, operations, labels, packaging, costing, details,
// and the revision log. The backend does a full replace on update, so
// mapFormToTechCardInsert sends every section. Computed fields — costing rollups
// (materials_total/materials_cost/total_cost/colorway_costs) and usage line/run totals —
// are output-only: shown read-only, never sent.

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

const revisionSchema = z.object({
  version: z.string().optional().default(''),
  revisionDate: z.string().optional().default(''), // YYYY-MM-DD in the UI
  author: z.string().optional().default(''),
  section: z.string().optional().default(''),
  changeNote: z.string().optional().default(''),
});

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
  // OUTPUT-ONLY: server-computed spend per garment / over the whole size run.
  lineTotal: z.string().optional().default(''),
  sizeRunTotal: z.string().optional().default(''),
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
  weightNet: z.string().optional().default(''), // decimal as string
  weightGross: z.string().optional().default(''), // decimal as string
  notes: z.string().optional().default(''),
});

const costingSchema = z.object({
  cmtCost: z.string().optional().default(''),
  hardwareCost: z.string().optional().default(''),
  packagingCost: z.string().optional().default(''),
  logisticsCost: z.string().optional().default(''),
  overheadCost: z.string().optional().default(''),
  defectPercent: z.string().optional().default(''),
  markupMultiplier: z.string().optional().default(''),
  wholesalePrice: z.string().optional().default(''),
  retailPrice: z.string().optional().default(''),
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
  weightNet: '',
  weightGross: '',
  notes: '',
};

export const emptyCosting: z.input<typeof costingSchema> = {
  cmtCost: '',
  hardwareCost: '',
  packagingCost: '',
  logisticsCost: '',
  overheadCost: '',
  defectPercent: '',
  markupMultiplier: '',
  wholesalePrice: '',
  retailPrice: '',
  currency: '',
  notes: '',
};

export const techCardSchema = z.object({
  // identification
  styleNumber: z.string().min(1, 'Style number is required'),
  name: z.string().min(1, 'Name is required'),
  brand: z.string().optional().default(''),
  season: z.string().optional().default(''),
  collection: z.string().optional().default(''),
  version: z.string().optional().default(''),
  designer: z.string().optional().default(''),
  // NB: form key is `constructorName`, not `constructor` — RHF/dot-path get/set
  // resolves a `constructor` key to Object.prototype.constructor (field._f undefined
  // → crash on mount). Mapped to/from the proto's `constructor` field below.
  constructorName: z.string().optional().default(''),
  technologist: z.string().optional().default(''),
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
  approvedBy: z.string().optional().default(''),
  notes: z.string().optional().default(''),
  // children
  sizeIds: z.array(z.number()).default([]),
  sizeQuantities: z.array(sizeQuantitySchema).default([]),
  patterns: z.array(patternSchema).default([]), // per-size PDF выкройки
  productIds: z.array(z.number()).default([]),
  media: z.array(mediaItemSchema).default([]),
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
  revisions: z.array(revisionSchema).default([]),
});

export type TechCardFormData = z.input<typeof techCardSchema>;

export const techCardDefaultData: TechCardFormData = {
  styleNumber: '',
  name: '',
  brand: '',
  season: '',
  collection: '',
  version: '',
  designer: '',
  constructorName: '',
  technologist: '',
  status: '',
  categoryId: 0,
  baseModelId: 0,
  baseSampleSizeId: 0,
  targetGender: UNSET_GENDER,
  stage: DEFAULT_STAGE,
  approvalState: DEFAULT_APPROVAL_STATE,
  measurementUnit: DEFAULT_MEASUREMENT_UNIT,
  approvedBy: '',
  notes: '',
  sizeIds: [],
  sizeQuantities: [],
  patterns: [],
  productIds: [],
  media: [],
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
  revisions: [],
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

export function mapTechCardToForm(techCard: common_TechCard): TechCardFormData {
  const insert = techCard.techCard;
  return {
    styleNumber: insert?.styleNumber || '',
    name: insert?.name || '',
    brand: insert?.brand || '',
    season: insert?.season || '',
    collection: insert?.collection || '',
    version: insert?.version || '',
    designer: insert?.designer || '',
    constructorName: insert?.constructor || '',
    technologist: insert?.technologist || '',
    status: insert?.status || '',
    categoryId: insert?.categoryId || 0,
    baseModelId: insert?.baseModelId || 0,
    baseSampleSizeId: insert?.baseSampleSizeId || 0,
    targetGender: insert?.targetGender || UNSET_GENDER,
    stage: stageOrDefault(insert?.stage),
    approvalState: approvalStateOrDefault(insert?.approvalState),
    measurementUnit: measurementUnitOrDefault(insert?.measurementUnit),
    approvedBy: insert?.approvedBy || '',
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
    productIds: insert?.productIds ?? [],
    media: (insert?.media ?? []).map((m) => ({
      mediaId: m.mediaId || 0,
      kind: m.kind && m.kind !== 'TECH_CARD_MEDIA_KIND_UNKNOWN' ? m.kind : DEFAULT_MEDIA_KIND,
      caption: m.caption || '',
    })),
    callouts: (insert?.callouts ?? []).map((c) => ({
      number: c.number || 0,
      part: c.part || '',
      description: c.description || '',
      dimensions: c.dimensions || '',
      mediaId: c.mediaId || 0,
      posX: decimalToInput(c.posX),
      posY: decimalToInput(c.posY),
    })),
    colorways: (insert?.colorways ?? []).map((c) => ({
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
        lineTotal: decimalToInput(u.lineTotal),
        sizeRunTotal: decimalToInput(u.sizeRunTotal),
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
          weightNet: decimalToInput(insert.packaging.weightNet),
          weightGross: decimalToInput(insert.packaging.weightGross),
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
          markupMultiplier: decimalToInput(insert.costing.markupMultiplier),
          wholesalePrice: decimalToInput(insert.costing.wholesalePrice),
          retailPrice: decimalToInput(insert.costing.retailPrice),
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
    revisions: (insert?.revisions ?? []).map((r) => ({
      version: r.version || '',
      revisionDate: timestampToDateInput(r.revisionDate),
      author: r.author || '',
      section: r.section || '',
      changeNote: r.changeNote || '',
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
      p?.weightNet,
      p?.weightGross,
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
    weightNet: inputToDecimal(p?.weightNet),
    weightGross: inputToDecimal(p?.weightGross),
    notes: p?.notes?.trim() || '',
  };
}

// costing rollup fields (materials_total/materials_cost/total_cost/colorway_costs/total_sam)
// are output-only — never sent on write.
function mapCostingOut(c?: TechCardFormData['costing']): common_TechCardCosting | undefined {
  if (
    !hasContent([
      c?.cmtCost,
      c?.hardwareCost,
      c?.packagingCost,
      c?.logisticsCost,
      c?.overheadCost,
      c?.defectPercent,
      c?.markupMultiplier,
      c?.wholesalePrice,
      c?.retailPrice,
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
    markupMultiplier: inputToDecimal(c?.markupMultiplier),
    wholesalePrice: inputToDecimal(c?.wholesalePrice),
    retailPrice: inputToDecimal(c?.retailPrice),
    currency: c?.currency?.trim() || '',
    notes: c?.notes?.trim() || '',
    materialsTotal: undefined,
    materialsCost: undefined,
    totalCost: undefined,
    hasUnconvertedCurrencies: undefined,
    totalSam: undefined,
    colorwayCosts: undefined,
  };
}

// Merge the edited fields over the original insert. Every section is form-managed;
// `original` is still spread so any future-added proto field survives.
export function mapFormToTechCardInsert(
  data: TechCardFormData,
  original?: common_TechCardInsert,
): common_TechCardInsert {
  return {
    ...original,
    styleNumber: data.styleNumber.trim(),
    name: data.name.trim(),
    brand: data.brand?.trim() || '',
    season: data.season?.trim() || '',
    collection: data.collection?.trim() || '',
    version: data.version?.trim() || '',
    designer: data.designer?.trim() || '',
    constructor: data.constructorName?.trim() || '',
    technologist: data.technologist?.trim() || '',
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
    approvedBy: data.approvedBy?.trim() || '',
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
    productIds: data.productIds ?? [],
    media: (data.media ?? []).map((m) => ({
      mediaId: m.mediaId,
      kind: (m.kind || 'TECH_CARD_MEDIA_KIND_UNKNOWN') as common_TechCardMediaKind,
      caption: m.caption?.trim() || '',
    })),
    callouts: (data.callouts ?? []).map((c) => ({
      number: c.number || 0,
      part: c.part?.trim() || '',
      description: c.description?.trim() || '',
      dimensions: c.dimensions?.trim() || '',
      mediaId: c.mediaId || 0,
      posX: inputToDecimal(c.posX),
      posY: inputToDecimal(c.posY),
    })),
    colorways: (data.colorways ?? []).map((c) => ({
      code: c.code?.trim() || '',
      name: c.name?.trim() || '',
      labDipStatus: (c.labDipStatus ||
        'TECH_CARD_LAB_DIP_STATUS_UNKNOWN') as common_TechCardLabDipStatus,
      productId: c.productId || 0,
      comment: c.comment?.trim() || '',
      pantone: c.pantone?.trim() || '',
      pantoneSystem: c.pantoneSystem?.trim() || '',
      hex: c.hex?.trim() || '',
      swatchMediaId: c.swatchMediaId || 0,
      labDipRound: c.labDipRound || 0,
      labDipSubmittedAt: c.labDipSubmittedAt
        ? dateInputToTimestamp(c.labDipSubmittedAt)
        : undefined,
      labDipDecidedAt: c.labDipDecidedAt ? dateInputToTimestamp(c.labDipDecidedAt) : undefined,
      labDipDecidedBy: c.labDipDecidedBy?.trim() || '',
      labDipRejectReason: c.labDipRejectReason?.trim() || '',
      usages: (c.usages ?? []).map((u) => ({
        bomItemIndex:
          typeof u.bomItemIndex === 'number' && u.bomItemIndex >= 0 ? u.bomItemIndex : undefined,
        placement: u.placement?.trim() || '',
        color: u.color?.trim() || '',
        pantone: u.pantone?.trim() || '',
        consumption: inputToDecimal(u.consumption),
        quantity: inputToDecimal(u.quantity),
        // per-size grading — drop blank cells; an all-blank set sends [] (per-garment fallback)
        sizeConsumptions: (u.sizeConsumptions ?? [])
          .filter((sc) => sc.consumption?.trim())
          .map((sc) => ({
            sizeId: sc.sizeId || 0,
            consumption: inputToDecimal(sc.consumption),
          })),
        // lineTotal + sizeRunTotal are output-only (server-computed) — never sent
        lineTotal: undefined,
        sizeRunTotal: undefined,
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
    costing: mapCostingOut(data.costing),
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
    revisions: (data.revisions ?? []).map((r) => ({
      version: r.version?.trim() || '',
      revisionDate: dateInputToTimestamp(r.revisionDate),
      author: r.author?.trim() || '',
      section: r.section?.trim() || '',
      changeNote: r.changeNote?.trim() || '',
    })),
    // Cast: TechCardInsert keys are required-but-nullable; we set every section above and
    // echo any still-unhandled proto field from `original`. Untouched keys are omitted on
    // create (absent == empty on the wire), which the structural type can't express.
  } as common_TechCardInsert;
}
