import { clampPatternName } from 'utils/pattern';
import {
  common_GenderEnum,
  common_TechCard,
  common_TechCardApprovalState,
  common_TechCardAuxSubtype,
  common_TechCardBomPurpose,
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
  common_TechCardPieceCutSymmetry,
  common_TechCardSignoffSection,
  common_TechCardSignoffState,
  common_TechCardStage,
  common_StyleNumberSource,
} from 'api/proto-http/admin';
import { ZERO_TIMESTAMP } from 'components/managers/tech-cards/components/utils';
import { decimalToInput, inputToDecimal } from 'utils/decimal';
import { validateSeamAllowanceStandard } from 'utils/seam-allowance';
import { ulid } from 'utils/ulid';
import {
  UNSET_PURPOSE,
  fabricScopeKey,
  isOtherPurpose,
  isRollGoodsSection,
} from './bom-purpose';
import { parseSeasonToSku, skuToSeasonLabel } from './season-util';
import {
  CUT_SYMMETRY_EVEN_COUNT_MESSAGE,
  UNSET_CUT_SYMMETRY,
  cutSymmetryCountInvalid,
  isCutSymmetryMarked,
} from './piece-codes';
import { z } from 'zod';

// TechCardInsert.purpose is the proto ENUM (TECH_CARD_PURPOSE_*), while ListTechCards.purpose is
// the bare entity word. The generated client types both as `string`, so swapping them compiles
// cleanly and fails silently: the gateway reads an unknown enum as UNKNOWN and the backend then
// keeps its own default, which is how every card saved as auxiliary came back sellable.
// Read tolerates either shape — a locally restored draft (useTechCardDraft persists raw form
// values) can still carry the old bare word.
export function toPurposeEnum(value?: string): string {
  return value === 'auxiliary' || value === 'TECH_CARD_PURPOSE_AUXILIARY'
    ? 'TECH_CARD_PURPOSE_AUXILIARY'
    : 'TECH_CARD_PURPOSE_SELLABLE';
}

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
const UNSET_AUX_SUBTYPE: common_TechCardAuxSubtype = 'TECH_CARD_AUX_SUBTYPE_UNKNOWN';

// Reads a numeric id off the WIRE. grpc-gateway serialises proto int64 as a JSON STRING while the
// generated TS type declares it `number`, so the compiler cannot catch the mismatch and a bare
// z.number() rejects the real payload with "Invalid input" on a field the operator cannot see or
// fix. That broke every card with a linked BOM line (int64 material_id). int64 fields in the
// tech-card contract today: material_id, bom_item_id, colorway_id, fusing_bom_item_id, piece_id,
// id, size_bytes. Route EVERY wire-read id through this rather than trusting the declared type --
// coercing a value that is already a number costs nothing, and the next int64 added upstream then
// cannot reintroduce the bug.
export function wireInt(value: unknown): number {
  return Number(value) || 0;
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

// True if any value is meaningful (non-blank string / non-zero number). Used to send a
// 1:1 section as undefined (unset) when the whole block is empty.
function hasContent(values: Array<string | number | undefined>): boolean {
  return values.some((v) => (typeof v === 'number' ? v !== 0 : !!v?.trim()));
}

const DEFAULT_MEDIA_KIND: common_TechCardMediaKind = 'TECH_CARD_MEDIA_KIND_FRONT';
const DEFAULT_BOM_SECTION: common_TechCardBomSection = 'TECH_CARD_BOM_SECTION_FABRIC';

const sizeQuantitySchema = z.object({
  sizeId: z.number().optional().default(0), // ∈ size_ids
  orderQty: z.number().optional().default(0),
});

// A downloadable выкройка (cut pattern) file — PDF or DXF, told apart by the url's
// extension — for one size. url/filename/sizeBytes are produced by Admin.UploadPattern
// (never hand-typed); sizeId ∈ size_ids.
const patternSchema = z.object({
  sizeId: z.number().optional().default(0),
  url: z.string().optional().default(''),
  filename: z.string().optional().default(''),
  // Operator-entered display name; '' = unnamed (the UI falls back to the filename). The
  // save path sends it EXPLICITLY for every row, empty included — absent-on-the-wire is
  // reserved for stale clients, which the server answers by preserving the stored name.
  name: z.string().optional().default(''),
  sizeBytes: z.number().optional().default(0),
  // Rev.N of this sheet within its size. 0 = "assign one": the server numbers a url it has not seen
  // on this card before and preserves the number for one it has, so the client only ever pins a
  // version deliberately (the factory's own numbering).
  version: z.number().optional().default(0),
  // Server-owned; round-tripped read-only so the grid can show when a PDF actually arrived. Sending
  // it back is harmless — the write path drops it and carries the stored value forward by url.
  uploadedAt: z.string().optional().default(''),
  // Stable row identity (0260). Unlike BOM/piece keys the SERVER never mints one: an empty key is
  // the legacy signal its upsert-diff matches by (size_id, url) on. So this client keeps whatever
  // key a row already has and mints only for rows created here — minting for every row would make
  // one save read as all-new rows and drop every DXF↔slot binding on the card.
  lineKey: z.string().optional().default(''),
  // Which fabric BOM line this sheet is cut from — the binding a раскладка needs to know which
  // cloth (and therefore which width and кромка) a DXF belongs to. '' = unbound: legal for a PDF,
  // and legal for legacy DXF rows uploaded before this existed.
  //
  // LEGACY HALF since 0267: resolve through fabricPurpose first (fabricScopeKey). It stays because
  // it cannot be migrated — a sheet bound to line L has no purpose to move to until L is sorted.
  bomLineKey: z.string().optional().default(''),
  // The НАЗНАЧЕНИЕ this sheet is cut from (0267) — the honest statement at card level, where no
  // article is in play. '' = not purpose-bound; the row falls back to bomLineKey.
  fabricPurpose: z.string().optional().default(''),
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
  // Fingerprint of the section's content when it was approved. Server-owned — the write path
  // recomputes it — but carried on the form so the card can compare it against
  // techCard.sectionDigests and tell a live sign-off from a stale one after a reload.
  signedDigest: z.string().optional().default(''),
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

// One cut-piece detail (деталь кроя) + its per-colourway fabric mapping (NF-05). materials is a
// sparse list keyed by colorwayIndex; a colourway with no entry is simply unmapped. bomItemIndex /
// fusingBomItemIndex are positional into `bomItems` (-1 = unset), colorwayIndex positional into
// `colorways` — all renumbered on BOM/colourway removal (nf05-01).
const pieceMaterialSchema = z.object({
  colorwayIndex: z.number().optional().default(0),
  // fabric / fusing BOM references by stable line_key (§2.3); '' = unset.
  bomLineKey: z.string().optional().default(''),
  fusingBomLineKey: z.string().optional().default(''),
  note: z.string().optional().default(''),
});

// A piece row the user added but never filled in. "Add piece" seeds a blank row, so a card can
// legitimately hold one mid-edit; it is dropped on save rather than sent, because the server
// requires a name (dto/techcard.go, parseTechCardPieces) and would otherwise reject the ENTIRE
// card — season, labels, sign-offs and all — over a placeholder row on a tab the user may never
// have opened.
export function isBlankPiece(p: {
  name?: string;
  grainline?: string;
  note?: string;
  calloutNumber?: number;
  fused?: boolean;
  piecesPerGarment?: number;
  cutSymmetry?: string;
  materials?: { bomLineKey?: string; fusingBomLineKey?: string; note?: string }[];
}): boolean {
  if (p.name?.trim() || p.grainline?.trim() || p.note?.trim()) return false;
  if (p.calloutNumber || p.fused) return false;
  if ((p.piecesPerGarment ?? 1) > 1) return false;
  // Разметка кроя считается содержимым наравне с долевой и дублированием. Без этой строки ряд, в
  // котором оператор успел ответить только на вопрос «как кроится», выбрасывался бы на сохранении
  // МОЛЧА — потеря данных без единого сообщения, ради экономии одной проверки.
  if (isCutSymmetryMarked(p.cutSymmetry)) return false;
  return !(p.materials ?? []).some(
    (m) => m.bomLineKey?.trim() || m.fusingBomLineKey?.trim() || m.note?.trim(),
  );
}

// Folds a pre-0200 single bom_line_key into the repeated list without duplicating it.
function mergeLegacyBomKey(keys: string[], legacy: string): string[] {
  const trimmed = legacy.trim();
  if (!trimmed || keys.includes(trimmed)) return keys;
  return [trimmed, ...keys];
}

const pieceSchema = z
  .object({
    name: z.string().optional().default(''),
    piecesPerGarment: z.number().optional().default(1),
    // NO `mirrored`. The flag existed to expand a piece ×2 as a left+right pair (Q6) and was never
    // used in practice; it is deliberately absent from the form, so the save mapper does not send it
    // and the store writes `mirrored = 0` on the next save of any card that still carries a true.
    // GetStyleCutList stopped doubling by it server-side in the same change — a client that merely
    // hid the field would still have shown the server's doubled total_per_garment with nothing on
    // screen to explain it.
    //
    // КАК КРОИТСЯ (`cut_symmetry`, 0275) — НЕ воскрешение `mirrored` выше, а отдельное поле, потому
    // что воскрешать нечего: 0266 погасила все единицы по построению. Оно ничего не умножает и
    // отвечает только на вопрос «как связаны эти piecesPerGarment панелей». Держим ПОЛНЫЙ литерал
    // перечисления, как `fabricDirection` на строке BOM, а не короткое слово: круглый рейс без
    // словаря переводов — это то, что делает сохранение неспособным подменить ответ оператора.
    cutSymmetry: z.string().optional().default(UNSET_CUT_SYMMETRY),
    grainline: z.string().optional().default(''),
    fused: z.boolean().optional().default(false),
    calloutNumber: z.number().optional().default(0),
    note: z.string().optional().default(''),
    materials: z.array(pieceMaterialSchema).default([]),
    // Stable client-minted identity, same contract as a BOM line's lineKey: the store keyed-upserts
    // pieces by it, which is what lets a colourway usage and a construction operation hold real
    // piece FKs. Without it the client never had a durable handle on a piece, so nothing could
    // reference one — the operation piece-picker rendered empty for exactly this reason.
    lineKey: z.string().optional().default(''),
  })
  // Mirror the server's required-name rule so it surfaces HERE, on the field, with a deep-linkable
  // path — the server raises it as a bare error with no field path and no row index, which blocks
  // the save with nothing to point at. A wholly blank row is exempt: it is filtered out on save.
  .superRefine((piece, ctx) => {
    if (!isBlankPiece(piece) && !piece.name?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Piece name is required',
        path: ['name'],
      });
    }
    // Зеркальная пара при нечётном (или нулевом) количестве. Правило живёт в CHECK'е БД
    // (`chk_tcp_mirrored_needs_even_count`), и CHECK этот ДВУХКОЛОНОЧНЫЙ: он срабатывает и когда
    // правят одно только количество у уже размеченной детали. Без этой проверки оператор получил бы
    // сырой MySQL 3819 про колонку, которой не касался, и сохранение всей карточки — с сезоном,
    // подписями и всем остальным — упало бы без единого адресуемого поля. Ошибка вешается на
    // `cutSymmetry`, то есть на контрол, который её и вызвал.
    if (cutSymmetryCountInvalid(piece.cutSymmetry, piece.piecesPerGarment)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: CUT_SYMMETRY_EVEN_COUNT_MESSAGE,
        path: ['cutSymmetry'],
      });
    }
    // A fabric-map cell addresses its colourway by id (colorwayIndex holds colorway_id on the wire),
    // and the server rejects a cell whose id is <= 0 with a pathless error that blocks the whole
    // card — which is why the save mapper used to DROP such a cell. But this admin no longer edits
    // that map at all: the cells are round-tripped data written by another surface, so dropping one
    // silently deletes a fabric / fusing / note the operator never saw and cannot restore. Raise it
    // here instead, on an addressable path (`pieces.N.materials.M.colorwayIndex` → the colourways
    // tab), so the save stops with something to point at. A cell with NO content is still dropped by
    // the mapper — that one carries nothing to lose.
    (piece.materials ?? []).forEach((m, mi) => {
      const carries = !!m.bomLineKey?.trim() || !!m.fusingBomLineKey?.trim() || !!m.note?.trim();
      if (carries && (m.colorwayIndex ?? 0) <= 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message:
            'эта ячейка кроя не привязана к колорвею — сохранение стёрло бы её материал/заметку',
          path: ['materials', mi, 'colorwayIndex'],
        });
      }
    });
  });

// One BOM article — a pure material-catalog entry. The per-colourway colour, placement and
// consumption live on colourway usages, not here.
const bomItemSchema = z
  .object({
    section: z.string().optional().default(DEFAULT_BOM_SECTION),
    // НАЗНАЧЕНИЕ (0265) — a second axis beside `section`, on roll goods only. UNSET is a real state
    // ("not sorted yet"), NOT a validation failure: every line saved before the field existed
    // carries it deliberately, so requiring a purpose here would make every existing card unsavable
    // until it had been sorted by hand. The ADD modal is where a purpose is demanded, because that
    // is the one moment the operator has the answer in front of them.
    purpose: z.string().optional().default(UNSET_PURPOSE),
    purposeNote: z.string().optional().default(''),
    isSample: z.boolean().optional().default(false),
    name: z.string().optional().default(''), // required — see the superRefine below for WHY it lives there
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
    // READ-ONLY enrichment the single-card read fills (0259): the width the раскладка should
    // prefill (this line's own fabricWidth, else the linked article's) and the article's кромка
    // per edge. Carried through the form so the nesting modal can read them without a second
    // query; never sent back (the server ignores them on write).
    effectiveFabricWidthCm: z.string().optional().default(''),
    selvedgeCm: z.string().optional().default(''),
    // optional link to a catalog Material (0 = unlinked free-text line). The line keeps its own
    // snapshot fields regardless of the link.
    materialId: z.number().optional().default(0),
    // Stable line identity (Q9/§2.3). `id` is the server PK (read-only, 0 = not yet saved); `lineKey`
    // is the client-generated ULID minted when the row is created in the UI, round-tripped so the
    // server keyed-reconciles by it and downstream refs (operations/pieces/usages) stay valid.
    id: z.number().optional().default(0),
    lineKey: z.string().optional().default(''),
  })
  .superRefine((item, ctx) => {
    // `name` is required only on an UNLINKED line — server parity, mirroring parseTechCardBomItems,
    // which requires a name only when material_id == 0. A LINKED line takes its identity from the
    // catalog material: the server resolves the name by link on the read path rather than storing a
    // copy, so requiring a form-level name here would demand a value the operator cannot edit and
    // that the wire does not want. (A released card is unaffected either way — tech_card_release
    // snapshots the whole enriched read model as JSON, so a frozen spec keeps the name it shipped.)
    //
    // It stays a superRefine rather than a plain .min(1) precisely because the rule is conditional;
    // the issue is emitted on path ['name'] so it addresses as `bomItems.3.name` and the editor's
    // deep-link can walk the operator straight to the offending input.
    if ((item.materialId ?? 0) === 0 && !item.name?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'укажите роль (название) — у строки без артикула имени взять неоткуда',
        path: ['name'],
      });
    }
    // Server parity (parseTechCardBomItems + upsertTechCardBom). Neither of these can be reached by
    // clicking around — the editor hides the purpose control off roll goods and clears the note off
    // OTHER — so they exist to turn a state that slipped through into a named field error on the
    // tile, instead of a 400 naming a line_key the operator has never seen.
    const purpose = item.purpose && item.purpose !== UNSET_PURPOSE ? item.purpose : '';
    if (purpose && !isRollGoodsSection(item.section)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'назначение есть только у ткани (fabric / lining / interlining / insulation)',
        path: ['purpose'],
      });
    }
    if (item.purposeNote?.trim() && !isOtherPurpose(purpose)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'примечание можно писать только к назначению «другое»',
        path: ['purposeNote'],
      });
    }
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
  // Standard minute value — the sewing time this operation contributes to the garment's SMV
  // roll-up. Same google.type.Decimal-as-form-string handling as stitchesPerCm.
  smv: z.string().optional().default(''), // decimal as string
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
  // BOM reference by stable line_key (§2.3) — no positional index, so removing/reordering a BOM
  // line never renumbers this. '' = no direct material link.
  bomLineKey: z.string().optional().default(''),
  calloutNumber: z.number().optional().default(0), // links a sketch callout.number; 0 = none
  // garment part this operation works on; resolves its real material via the selected
  // colourway's usage on the same part. A human LABEL — pieceLineKeys below is the real reference.
  placement: z.string().optional().default(''),
  // The cut-pieces this operation works on, by stable TechCardPiece.line_key. REPEATED, unlike the
  // recipe's single piece per norm: an assembly operation joins as many pieces as it joins.
  pieceLineKeys: z.array(z.string()).default([]),
  // The off-part materials this operation consumes (thread, fusing). REPEATED for the same reason
  // pieceLineKeys is: one operation can join several materials. The legacy single bomLineKey above
  // stays as the first entry during the transition.
  bomLineKeys: z.array(z.string()).default([]),
});

const labelSchema = z.object({
  labelType: z.string().optional().default(DEFAULT_LABEL_TYPE),
  content: z.string().optional().default(''),
  placement: z.string().optional().default(''),
  attachment: z.string().optional().default(''),
  size: z.string().optional().default(''),
  note: z.string().optional().default(''),
  // FK to the physical label material's BOM line (tech_card_bom_item); 0 = unlinked.
  bomItemId: z.number().optional().default(0),
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
// hardwareCost/packagingCost left this schema in Phase 2: both are BOM sections priced per
// colourway now, so the costing block carries only the genuinely manual articles.
const costingSchema = z.object({
  cmtCost: z.string().optional().default(''),
  logisticsCost: z.string().optional().default(''),
  overheadCost: z.string().optional().default(''),
  defectPercent: z.string().optional().default(''),
  currency: z.string().optional().default(''),
  notes: z.string().optional().default(''),
  // This style's own gross-margin target, 0..100. Empty = fall back to the house default, which the
  // server resolves into costing.effectiveTargetMarginPct on the read.
  targetMarginPct: z.string().optional().default(''),
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
  logisticsCost: '',
  overheadCost: '',
  defectPercent: '',
  currency: '',
  notes: '',
  targetMarginPct: '',
};

const techCardObject = z.object({
  // identification. style_number is optional in the form so an IDEA concept can be created without
  // an article number; a conditional refine below still requires it past IDEA, and an empty IDEA
  // number is auto-filled with a draft on save (B-2, backend still requires the field).
  styleNumber: z.string().optional().default(''),
  // How style_number was set (Q1): GENERATED = came from SuggestStyleNumber; MANUAL = hand-typed
  // override (passes the strict server validator). Drives the format hint + override affordance.
  styleNumberSource: z.string().optional().default('STYLE_NUMBER_SOURCE_GENERATED'),
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
  // Style catalogue facts written via UpdateStyle (not the tech-card write): edited on the tech card,
  // read-only on the colourway card. composition is the legacy free-text string (M1), never JSON.
  fit: z.string().optional().default(''),
  composition: z.string().optional().default(''),
  careInstructions: z.string().optional().default(''),
  stage: z.string().optional().default(DEFAULT_STAGE),
  approvalState: z.string().optional().default(DEFAULT_APPROVAL_STATE),
  // The drop this style is being made for, as a YYYY-MM-DD input string ('' = no drop planned). The
  // production tab measures each batch's promised date against it. Planning intent set by the owner,
  // not a workflow stamp like approvedAt/releasedAt — but it still travels on the tech-card write, so
  // a RELEASED (frozen) card rejects a change to it along with everything else.
  targetDropDate: z.string().optional().default(''),
  measurementUnit: z.string().optional().default(DEFAULT_MEASUREMENT_UNIT),
  // ТРЕБУЕМЫЙ ПРИПУСК of this style, in CENTIMETRES (Ф3.2) — the standard a раскладка's recorded
  // allowance is judged against. A NUMBER a machine reads, NOT the free-text
  // construction.seamAllowances note («5 мм») it renders next to.
  //
  // '' IS ABSENT AND ABSENT IS NOT ZERO. Empty means «this card sets no standard of its own» and the
  // workshop default (WorkshopSettings.default_seam_allowance_cm) applies; '0' is a real, different
  // setting meaning «наши выкройки несут линию кроя, офсет не нужен». Confusing the two would
  // declare every раскладка with a 1 cm allowance in breach of a standard nobody set. The round-trip
  // is what keeps them apart: decimalToInput(undefined) → '' and inputToDecimal('') → undefined, so
  // a cleared field is OMITTED from the write and the column goes back to NULL, while '0' travels as
  // { value: '0' }.
  //
  // It lives on the card and not inside `construction` on purpose: any field added to a section's
  // digest projection instantly marks EVERY signed-off CONSTRUCTION approval as «edited since
  // signing», on every card at once.
  requiredSeamAllowanceCm: z.string().optional().default(''),
  // The design intent in prose — what this style IS, before any construction detail. Printed at
  // the head of the tech pack's description sheet, above the details and the notes.
  concept: z.string().optional().default(''),
  notes: z.string().optional().default(''),
  // children
  sizeIds: z.array(z.number()).default([]),
  sizeQuantities: z.array(sizeQuantitySchema).default([]),
  patterns: z.array(patternSchema).default([]), // выкройки: DXF по материалам (size_id — артефакт хранения, колонка NOT NULL)
  // DXF block → cut piece, SCOPED BY FABRIC (0262). The scope is what makes the mapping safe:
  // the same generic block name («полочка») in the main-fabric file and the lining file is two
  // different pieces, which a card-level mapping could not express. Written as a full-replace
  // set alongside the card body.
  // Since 0267 the scope is the НАЗНАЧЕНИЕ where the card has been sorted and the legacy line where
  // it has not: scope = fabricPurpose, else bomLineKey. The DB UNIQUE moved with it, so two lines
  // sorted into ONE назначение collapse their same-named blocks onto ONE alias — see the collapse
  // guard in techCardSchema's superRefine.
  pieceDxfAliases: z
    .array(
      z.object({
        bomLineKey: z.string().optional().default(''),
        fabricPurpose: z.string().optional().default(''),
        blockName: z.string().optional().default(''),
        pieceLineKey: z.string().optional().default(''),
      }),
    )
    .default([]),
  // NF-07 auxiliary items: purpose is 'sellable' (default) or 'auxiliary' (produces a packaging
  // material, not a product). An auxiliary card links no products and its run output receipts into
  // outputMaterialId (required before its first run; 0 = unset).
  purpose: z.string().optional().default('TECH_CARD_PURPOSE_SELLABLE'),
  // WS7: which KIND of auxiliary item an auxiliary card produces (brand label, care label, dust
  // bag, box…). Only meaningful with purpose=auxiliary — the backend validates the pairing, so the
  // save mapper forces it back to UNSET whenever the card is sellable.
  auxSubtype: z.string().optional().default(UNSET_AUX_SUBTYPE),
  outputMaterialId: z.number().optional().default(0),
  // Cut-piece details + per-colourway fabric map (NF-05). Positional refs (nf05-01).
  // Names are unique per card (case-insensitive, trimmed): a piece name is how a human addresses the
  // part in the operation picker, in a recipe norm and on the factory sheet, so two rows called
  // «полочка» make every one of those references ambiguous. Mirrors the server's rule (dto/techcard
  // parseTechCardPieces) so it lands HERE, on the offending row, instead of coming back as a blocked
  // save with no field to point at.
  pieces: z.array(pieceSchema).superRefine((pieces, ctx) => {
    const seen = new Map<string, number>();
    pieces.forEach((p, i) => {
      const key = (p.name ?? '').trim().toLowerCase();
      if (!key || isBlankPiece(p)) return;
      const first = seen.get(key);
      if (first === undefined) {
        seen.set(key, i);
        return;
      }
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Duplicate piece name — «${(p.name ?? '').trim()}» is already used by piece ${first + 1}`,
        path: [i, 'name'],
      });
    });
  }),
  // Sketch media split into two independent lists (construction consumes ONLY technicalMedia;
  // callouts pin onto ANY media_id — moodboard or technical, B-1). Each item's `kind` sub-classifies.
  moodboardMedia: z.array(mediaItemSchema).default([]),
  technicalMedia: z.array(mediaItemSchema).default([]),
  callouts: z.array(calloutSchema).default([]),
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
  const pastIdea = data.stage !== 'TECH_CARD_STAGE_IDEA';
  if (pastIdea && !data.styleNumber?.trim()) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Style number is required',
      path: ['styleNumber'],
    });
  }
  // The season is stored as the structured SkuSeason { code, year }; the form holds a free-text
  // label and parseSeasonToSku maps between them, returning undefined for anything it cannot read.
  // Undefined is silent in both directions: the card body sends skuSeason unset (which on CREATE
  // takes the whole season with it, the write being a full replace) and the staged UpdateStyle
  // simply omits `season` from its mask, so a season EDIT reports success and does not happen. The
  // SeasonField picker only ever writes parseable labels, so this can fire on hand-typed entry
  // alone — and there it must, because a typo is not a reason to drop the season silently.
  if (data.season?.trim() && !parseSeasonToSku(data.season)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'сезон не распознан — SS25 / FW26 / PF26 / Resort 25 (Holiday не поддерживается)',
      path: ['season'],
    });
  }
  // ТРЕБУЕМЫЙ ПРИПУСК (Ф3.2). The server answers an out-of-band value with a bare CHECK-constraint
  // refusal that names a column and not a field, and it refuses the WHOLE card save with it — every
  // other tab's work bounces along with the one mistyped number. So the band is checked here, where
  // the sentence can name the mistake, and a BLANK value is deliberately allowed through: an empty
  // field is «эталона у карточки нет, берём цеховой», not a missing required value.
  const seamAllowanceError = validateSeamAllowanceStandard(data.requiredSeamAllowanceCm);
  if (seamAllowanceError) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: seamAllowanceError,
      path: ['requiredSeamAllowanceCm'],
    });
  }
  // #64: every BOM article should link a catalog material — enforced as a RELEASE blocker
  // (releaseBlockers in index.tsx), not here. A hard zod error on every past-IDEA save wrongly
  // blocked the whole main insert (notes/season/labels/sign-offs/…) for any card carrying a
  // legacy free-text BOM line, which loads with materialId: 0 (mapBomItemToForm) — see wave-2a
  // P0 fix. The BOM tile still shows a soft red "! link a material" hint per unlinked line.

  // ALIAS COLLAPSE (0267) — the sharp edge of binding by назначение instead of by line.
  //
  // Two BOM lines sorted into ONE назначение merge their DXF alias sets. If both held a block of
  // the same name — «полочка» in the shell file and «полочка» in the second shell's file — the
  // merged set has TWO rows under one scope, and the server's UNIQUE (card, scope, block) refuses
  // the pair by failing the WHOLE card save: not the aliases, the card. Everything the operator
  // typed on nine other tabs bounces with it.
  //
  // So it is caught here, on the client, before the save leaves — a named block and a named pair of
  // pieces the operator can actually act on, instead of a server refusal after the fact. The path
  // routes to the PATTERNS tab (ERROR_TAB.pieceDxfAliases), where «детали кроя» lives.
  //
  // Only an ACTUAL duplicate scope key is flagged. Two LINE-scoped aliases whose lines happen to
  // share a назначение are not a problem and must not nag: the server files them under their own
  // line scopes exactly as it always did, which is the whole point of the additive shape.
  const aliasSeen = new Map<string, { index: number; piece: string }>();
  (data.pieceDxfAliases ?? []).forEach((a, index) => {
    const block = a.blockName?.trim() ?? '';
    const piece = a.pieceLineKey?.trim() ?? '';
    if (!block || !piece) return;
    const key = `${fabricScopeKey(a.fabricPurpose, a.bomLineKey).toLowerCase()}|${block.toLowerCase()}`;
    const prev = aliasSeen.get(key);
    if (!prev) {
      aliasSeen.set(key, { index, piece });
      return;
    }
    if (prev.piece === piece) return; // the same answer twice is harmless; the wire set dedupes it
    const nameOf = (k: string) =>
      (data.pieces ?? []).find((p) => p.lineKey?.trim() === k)?.name?.trim() || k;
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message:
        `блок «${block}» уже сопоставлен с деталью «${nameOf(prev.piece)}» в этом же назначении — ` +
        `две детали кроя на один блок сервер не примет и отклонит сохранение всей карты. ` +
        `Откройте «детали кроя» на вкладке ВЫКРОЙКИ и оставьте одну связь ` +
        `(сейчас спорят «${nameOf(prev.piece)}» и «${nameOf(piece)}»).`,
      path: ['pieceDxfAliases', index, 'blockName'],
    });
  });
});

export type TechCardFormData = z.input<typeof techCardObject>;

// The house brand for a new card. Every card is GRBPWR unless someone deliberately says otherwise,
// so pre-fill it rather than making the operator type it — the field stays editable. Only NEW cards
// are seeded: an existing card keeps whatever it stored, so opening one never rewrites its brand.
export const DEFAULT_BRAND = 'grbpwr';

export const techCardDefaultData: TechCardFormData = {
  styleNumber: '',
  styleNumberSource: 'STYLE_NUMBER_SOURCE_GENERATED',
  name: '',
  brand: DEFAULT_BRAND,
  season: '',
  collection: '',
  status: '',
  categoryId: 0,
  baseModelId: 0,
  baseSampleSizeId: 0,
  targetGender: UNSET_GENDER,
  fit: '',
  composition: '',
  careInstructions: '',
  stage: DEFAULT_STAGE,
  approvalState: DEFAULT_APPROVAL_STATE,
  targetDropDate: '',
  measurementUnit: DEFAULT_MEASUREMENT_UNIT,
  // Blank, never '0' — a NEW card requires no particular allowance until someone says it does, and
  // seeding a zero here would silently declare «кроим по линии как нарисована» on every new style.
  requiredSeamAllowanceCm: '',
  concept: '',
  notes: '',
  sizeIds: [],
  sizeQuantities: [],
  patterns: [],
  pieceDxfAliases: [],
  purpose: 'TECH_CARD_PURPOSE_SELLABLE',
  auxSubtype: UNSET_AUX_SUBTYPE,
  outputMaterialId: 0,
  pieces: [],
  moodboardMedia: [],
  technicalMedia: [],
  callouts: [],
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

// One BOM line → form row. Mints a stable line_key for a legacy line that has none, so downstream
// refs can be keyed by it immediately (it persists on the next save).
function mapBomItemToForm(b: NonNullable<common_TechCardInsert['bomItems']>[number]) {
  return {
    section:
      b.section && b.section !== 'TECH_CARD_BOM_SECTION_UNKNOWN' ? b.section : DEFAULT_BOM_SECTION,
    // No fallback and no inference: an unset purpose reads back unset. Anything else here would be
    // a guess, and a guess is what 0265 deliberately refuses to make.
    purpose: b.purpose || UNSET_PURPOSE,
    purposeNote: b.purposeNote || '',
    isSample: !!b.isSample,
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
    effectiveFabricWidthCm: decimalToInput(b.effectiveFabricWidthCm),
    selvedgeCm: decimalToInput(b.selvedgeCm),
    // material_id and id are int64 on the wire (techcard.proto), and grpc-gateway serialises int64
    // as a STRING — the generated TS type says `number` and is wrong. Without coercing, the form
    // holds "12" and z.number() rejects it as "Invalid input" on bomItems.N.materialId, blocking
    // the save of any card with a linked line. Same trap as sizeBytes above.
    materialId: wireInt(b.materialId),
    id: wireInt(b.id),
    // Keep whatever key the row already has; mint one ONLY when there is none. The old test was
    // `isUlid(key) ? key : ulid()`, which threw away every key this client did not mint itself —
    // the LEGACY0000000000000000NN keys migration 0159 backfilled (the ULID charset has no L), and
    // the bom-fabric-… keys the beta seeder writes. The server reconciles the BOM BY line_key: a
    // re-minted key reads as "the old line vanished, delete it", and the delete then hits the FK
    // RESTRICT held by any colourway recipe that cuts it. That made such a card unsavable — no
    // deletion by the operator involved, merely opening it and pressing Save.
    lineKey: b.lineKey?.trim() || ulid(),
  };
}

export function mapTechCardToForm(techCard: common_TechCard): TechCardFormData {
  const insert = techCard.techCard;
  // Resolve BOM line identities up front (§2.3) so downstream refs can be keyed by stable line_key.
  // A line saved before line_key existed has none and gets a fresh key on read (persists on next
  // save); a line that HAS one keeps it, whatever shape it is.
  const bomItemsForm = (insert?.bomItems ?? []).map(mapBomItemToForm);
  const bomKeyByIndex = bomItemsForm.map((b) => b.lineKey);
  const refKey = (bomLineKey?: string, bomItemIndex?: number): string => {
    // Any non-blank key is the reference — same reason as mapBomItemToForm above. Demanding a ULID
    // here silently dropped a legacy/seeded ref to the positional fallback below, which is wrong the
    // moment the BOM is reordered.
    if (bomLineKey?.trim()) return bomLineKey;
    if (
      typeof bomItemIndex === 'number' &&
      bomItemIndex >= 0 &&
      bomItemIndex < bomKeyByIndex.length
    )
      return bomKeyByIndex[bomItemIndex];
    return '';
  };
  return {
    styleNumber: insert?.styleNumber || '',
    styleNumberSource:
      insert?.styleNumberSource && insert.styleNumberSource !== 'STYLE_NUMBER_SOURCE_UNKNOWN'
        ? insert.styleNumberSource
        : 'STYLE_NUMBER_SOURCE_GENERATED',
    name: insert?.name || '',
    brand: insert?.brand || '',
    // season is the structured SkuSeason on the wire (Q1); show it as the form's label.
    season: skuToSeasonLabel(insert?.skuSeason),
    collection: insert?.collection || '',
    status: insert?.status || '',
    categoryId: insert?.categoryId || 0,
    baseModelId: insert?.baseModelId || 0,
    baseSampleSizeId: insert?.baseSampleSizeId || 0,
    targetGender: insert?.targetGender || UNSET_GENDER,
    // Read-only projections on the TechCard read (written via UpdateStyle) — top-level, not on insert.
    fit: techCard.fit || '',
    composition: techCard.composition || '',
    careInstructions: techCard.careInstructions || '',
    stage: stageOrDefault(insert?.stage),
    approvalState: approvalStateOrDefault(insert?.approvalState),
    targetDropDate: timestampToDateInput(insert?.targetDropDate),
    measurementUnit: measurementUnitOrDefault(insert?.measurementUnit),
    // decimalToInput, NOT `|| ''` on the number: an absent standard reads as '' and a stored 0 reads
    // as '0'. Any `||` here would fold the legal zero back into «не задано» on the way in, and the
    // next save would then clear a standard the operator deliberately set.
    requiredSeamAllowanceCm: decimalToInput(insert?.requiredSeamAllowanceCm),
    concept: insert?.concept || '',
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
      name: p.name ?? '',
      // size_bytes is int64 → arrives as a string from grpc-gateway; coerce to a real number
      // so the form value passes z.number() (a string would silently block save).
      sizeBytes: wireInt(p.sizeBytes),
      version: p.version || 0,
      uploadedAt: p.uploadedAt ?? '',
      // Kept EXACTLY as stored, including the LEGACY… keys the 0260 backfill wrote: this client
      // never re-mints an existing row's key (see patternSchema).
      lineKey: p.lineKey ?? '',
      bomLineKey: p.bomLineKey ?? '',
      // The server always states presence on read, so UNSET arrives as a real value — normalise it
      // to '' here so every reader can test the field with a plain truthiness check.
      fabricPurpose: p.fabricPurpose && p.fabricPurpose !== UNSET_PURPOSE ? p.fabricPurpose : '',
    })),
    // The wrapper is always present on read, so `items` is the authoritative stored set.
    pieceDxfAliases: (insert?.pieceDxfAliases?.items ?? []).map((a) => ({
      bomLineKey: a.bomLineKey ?? '',
      fabricPurpose: a.fabricPurpose && a.fabricPurpose !== UNSET_PURPOSE ? a.fabricPurpose : '',
      blockName: a.blockName ?? '',
      pieceLineKey: a.pieceLineKey ?? '',
    })),
    purpose: toPurposeEnum(insert?.purpose),
    auxSubtype: insert?.auxSubtype || UNSET_AUX_SUBTYPE,
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
    pieces: (insert?.pieces ?? []).map((p) => ({
      // Same rule as the BOM above — cut pieces are reconciled by line_key too, and migration 0168
      // backfilled them with the same LEGACY… keys the ULID test rejects.
      lineKey: p.lineKey?.trim() || ulid(),
      name: p.name || '',
      piecesPerGarment: p.piecesPerGarment ?? 1,
      // Круглый рейс начинается ЗДЕСЬ. Сервер шлёт поле на чтении всегда; неразмеченная деталь
      // приезжает как `_UNKNOWN` (или отсутствует у карточки, сохранённой до 0275) — оба случая
      // сходятся в одно «не размечено», и именно оно потом уедет обратно нетронутым.
      cutSymmetry: p.cutSymmetry || UNSET_CUT_SYMMETRY,
      grainline: p.grainline || '',
      fused: p.fused ?? false,
      calloutNumber: p.calloutNumber ?? 0,
      note: p.note || '',
      materials: (p.materials ?? []).map((m) => ({
        // NOTE: the FORM key is `colorwayIndex`, the proto field is `colorwayId` — the rename
        // landed on the wire and the form key was deliberately left alone (it is read by
        // pieces-tab, sample-cut-views and the print doc). It holds a colourway ID, never an index.
        // colorway_id is int64 on the wire and grpc-gateway serialises int64 as a STRING, so this
        // must be coerced or z.number() rejects it as "Invalid input" — same trap as materialId.
        colorwayIndex: wireInt(m.colorwayId),
        bomLineKey: refKey(m.bomLineKey, m.bomItemIndex),
        fusingBomLineKey: refKey(m.fusingBomLineKey, m.fusingBomItemIndex),
        note: m.note || '',
      })),
    })),
    bomItems: bomItemsForm,
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
      pieceLineKeys: (o.pieceLineKeys ?? []).filter(Boolean),
      // The multi list is the only thing the UI edits now. An operation saved before 0200 has only
      // the legacy single key, so fold it in — otherwise reopening such a card shows no material and
      // the next save would drop the link it never displayed.
      bomLineKeys: mergeLegacyBomKey(
        (o.bomLineKeys ?? []).filter(Boolean),
        refKey(o.bomLineKey, o.bomItemIndex),
      ),
      node: o.node || '',
      description: o.description || '',
      seamType: o.seamType || '',
      stitchesPerCm: decimalToInput(o.stitchesPerCm),
      smv: decimalToInput(o.smv),
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
      bomLineKey: refKey(o.bomLineKey, o.bomItemIndex),
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
      bomItemId: wireInt(l.bomItemId),
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
          logisticsCost: decimalToInput(insert.costing.logisticsCost),
          overheadCost: decimalToInput(insert.costing.overheadCost),
          defectPercent: decimalToInput(insert.costing.defectPercent),
          targetMarginPct: decimalToInput(insert.costing.targetMarginPct),
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
      signedDigest: s.signedDigest || '',
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
      c?.logisticsCost,
      c?.overheadCost,
      c?.defectPercent,
      c?.currency,
      c?.notes,
      c?.targetMarginPct,
    ])
  ) {
    return undefined;
  }
  return {
    cmtCost: inputToDecimal(c?.cmtCost),
    logisticsCost: inputToDecimal(c?.logisticsCost),
    overheadCost: inputToDecimal(c?.overheadCost),
    // Empty = no style target; the server then resolves the house default into
    // effectiveTargetMarginPct on the next read.
    targetMarginPct: inputToDecimal(c?.targetMarginPct),
    defectPercent: inputToDecimal(c?.defectPercent),
    currency: c?.currency?.trim() || '',
    notes: c?.notes?.trim() || '',
    materialsTotal: undefined,
    materialsPerUnit: undefined,
    unitCost: undefined,
    orderQty: undefined,
    orderCost: undefined,
    hasUnconvertedCurrencies: undefined,
    hasUnpriced: undefined,
    totalSam: undefined,
    colorwayCosts: undefined,
    // Base-currency roll-up (server-folded via costing FX rates) — output-only.
    unitCostBase: undefined,
    orderCostBase: undefined,
    baseCurrency: undefined,
    // Resolved target (this style's, else the house default) and the VAT context the colourway
    // net_prices were computed at — all output-only, never sent back.
    effectiveTargetMarginPct: undefined,
    vatCountryCode: undefined,
    vatRatePct: undefined,
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
  // Resolve BOM lines first (§2.3): keep/mint a stable line_key per row and build a lineKey→index
  // map, so every downstream ref sends the durable bomLineKey (server keyed-reconciles by it) plus a
  // consistent positional bomItemIndex for the legacy/transition path.
  const bomLines = (data.bomItems ?? []).map((b) => ({
    ...b,
    // Keep, never re-mint: the key that came off the read IS the row's identity server-side.
    lineKey: b.lineKey?.trim() || ulid(),
  }));
  const bomIndexByKey = new Map<string, number>();
  bomLines.forEach((b, i) => bomIndexByKey.set(b.lineKey, i));
  // Which cut-pieces this save actually persists — the set DXF aliases may reference. Blank rows
  // are dropped below and a keyless row gets a fresh key no alias can know, so both are excluded.
  // Lowercased: the store compares alias→piece keys case-insensitively.
  const livePieceKeys = new Set(
    (data.pieces ?? [])
      .filter((p) => !isBlankPiece(p) && !!p.lineKey?.trim())
      .map((p) => p.lineKey!.trim().toLowerCase()),
  );
  const outBomRef = (
    lineKey?: string,
  ): { bomLineKey: string | undefined; bomItemIndex: number | undefined } => {
    const lk = (lineKey || '').trim();
    if (!lk) return { bomLineKey: undefined, bomItemIndex: undefined };
    // idx undefined = the referenced line was removed (dangling) — still send the key; the server
    // resolves/RESTRICTs and returns a field-tagged error rather than silently mis-mapping.
    return { bomLineKey: lk, bomItemIndex: bomIndexByKey.get(lk) };
  };
  return {
    ...original,
    styleNumber,
    // Empty override collapses to GENERATED so an idea/blank number never persists as a MANUAL
    // claim; a real hand-typed value keeps whatever source the field set.
    styleNumberSource: (styleNumber
      ? data.styleNumberSource || 'STYLE_NUMBER_SOURCE_GENERATED'
      : 'STYLE_NUMBER_SOURCE_GENERATED') as common_StyleNumberSource,
    name: data.name.trim(),
    brand: data.brand?.trim() || '',
    // No season here on purpose: sku_season is a style catalogue fact and UpdateStyle is its only
    // writer (StyleFactsField stages it) — the stored value rides back untouched in `...original`.
    collection: data.collection?.trim() || '',
    status: data.status?.trim() || '',
    categoryId: data.categoryId || 0,
    baseModelId: data.baseModelId || 0,
    baseSampleSizeId: data.baseSampleSizeId || 0,
    targetGender: (data.targetGender || UNSET_GENDER) as common_GenderEnum,
    stage: (data.stage || 'TECH_CARD_STAGE_UNKNOWN') as common_TechCardStage,
    approvalState: (data.approvalState ||
      'TECH_CARD_APPROVAL_STATE_UNKNOWN') as common_TechCardApprovalState,
    // Blank clears the date: dateInputToTimestamp maps '' to the proto zero instant, which the
    // backend converter reads as NULL (the same round-trip every other optional date here uses).
    targetDropDate: dateInputToTimestamp(data.targetDropDate),
    measurementUnit: (data.measurementUnit ||
      'TECH_CARD_MEASUREMENT_UNIT_UNKNOWN') as common_TechCardMeasurementUnit,
    // Blank CLEARS the standard: inputToDecimal('') is undefined, JSON.stringify drops the key, and
    // the full-replace write stores NULL — «карточка не требует конкретного припуска». '0' is not
    // blank and survives as { value: '0' }, which is the whole point of the pair. Written after the
    // `...original` spread so the cleared value wins over the echoed one.
    requiredSeamAllowanceCm: inputToDecimal(data.requiredSeamAllowanceCm),
    concept: data.concept?.trim() || '',
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
        // ALWAYS present, empty string included — an explicit '' clears the name server-side,
        // while an ABSENT field is the stale-client signal that preserves the stored name. Only
        // clients that predate the field may omit it.
        name: clampPatternName(p.name ?? ''),
        sizeBytes: p.sizeBytes || 0,
        // Round-trip the revision so a re-save does not renumber existing sheets; a freshly
        // uploaded row carries 0 and the server assigns MAX+1 for its size. uploadedAt is
        // server-owned and deliberately not sent.
        version: p.version || 0,
        // Identity as held (0260): '' on a legacy row keeps the server matching it by
        // (size_id, url); a key minted at upload survives «заменить файл».
        lineKey: p.lineKey?.trim() || '',
        // ALWAYS present, like `name`: an absent bom_line_key is the stale-client signal that
        // preserves the stored binding, so a client that owns the field must send '' to unbind
        // rather than fall into carry-forward.
        bomLineKey: p.bomLineKey?.trim() || '',
        // Same contract on the назначение half (0267): stated on every row, UNSET being the explicit
        // unbind. Omitting it would put this client in the stale-client lane and make an unbind
        // silently impossible.
        fabricPurpose: (p.fabricPurpose?.trim() ||
          UNSET_PURPOSE) as common_TechCardBomPurpose,
      })),
    // Auxiliary cards link no products and receipt into a material instead; sellable cards carry
    // no output material. Enforce the exclusivity here so a purpose flip can't leave stale data.
    purpose: toPurposeEnum(data.purpose),
    outputMaterialId:
      toPurposeEnum(data.purpose) === 'TECH_CARD_PURPOSE_AUXILIARY'
        ? data.outputMaterialId || 0
        : 0,
    // Same exclusivity, one field over: the dto rejects a subtype on a sellable card, so a purpose
    // flip must clear it here rather than send a pairing the server refuses.
    auxSubtype: (toPurposeEnum(data.purpose) === 'TECH_CARD_PURPOSE_AUXILIARY'
      ? data.auxSubtype || UNSET_AUX_SUBTYPE
      : UNSET_AUX_SUBTYPE) as common_TechCardAuxSubtype,
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
    pieces: (data.pieces ?? [])
      .filter((p) => !isBlankPiece(p))
      .map((p) => ({
        lineKey: p.lineKey?.trim() || ulid(),
        name: p.name?.trim() || '',
        // clamp to >= 1: 0 has no physical meaning and (no explicit presence on the wire)
        // reads back as unset -> the old || 0 silently flipped a saved 0 to 1 after reload
        piecesPerGarment: p.piecesPerGarment || 1,
        // `mirrored` is NOT sent (see pieceSchema). The proto field still exists, so omitting it
        // makes the wire value false and the store's UPDATE clears a stored true — the retirement
        // is a write, not just a hidden control, and it lands card-by-card as cards are saved.
        //
        // `cutSymmetry`, наоборот, шлётся ВСЕГДА — круглым рейсом того, что прочитали. Поле в прото
        // объявлено `optional` не ради этого клиента, а ради устаревшей вкладки: ОТСУТСТВИЕ поля
        // сервер читает как «оставь хранимое», а ЯВНЫЙ `_UNKNOWN` — как «очисти в „не размечено“».
        // Раз так, у нас ровно два обязательства, и оба выполняет одна эта строка: не потерять
        // чужой ответ (форма засеяна с чтения, значит вернётся прочитанное) и уметь его снять
        // (оператор выбрал «— не размечено» — уедет `_UNKNOWN`, и разметка снимется).
        //
        // Молчать было бы «безопаснее» ровно до первого снятия разметки, которое стало бы
        // невозможным и необъяснимым: контрол показывает «не размечено», а карточка после перезагрузки
        // снова помечена.
        cutSymmetry: (p.cutSymmetry || UNSET_CUT_SYMMETRY) as common_TechCardPieceCutSymmetry,
        grainline: p.grainline?.trim() || '',
        fused: p.fused ?? false,
        calloutNumber: p.calloutNumber || 0,
        note: p.note?.trim() || '',
        materials: (p.materials ?? [])
          // drop fully-empty cells (no fabric, no fusing, no note) so the map stays sparse —
          // a note-only cell (written by another client) must survive an unrelated save.
          // A cell that CARRIES something but resolves no colourway is NOT dropped here: the schema
          // blocks the save on it (pieceSchema's superRefine), because dropping it deleted content
          // this admin has no editor for and the operator never saw.
          .filter((m) => !!m.bomLineKey?.trim() || !!m.fusingBomLineKey?.trim() || !!m.note?.trim())
          .map((m) => {
            const fabric = outBomRef(m.bomLineKey);
            const fusing = outBomRef(m.fusingBomLineKey);
            return {
              // form key `colorwayIndex` → proto field `colorwayId`; it has held an ID, not an
              // index, since colourways became products (see mapTechCardToForm).
              colorwayId: m.colorwayIndex || 0,
              // durable line_key refs (§2.3) + a consistent positional index for the transition path.
              bomLineKey: fabric.bomLineKey,
              bomItemIndex: fabric.bomItemIndex,
              fusingBomLineKey: fusing.bomLineKey,
              fusingBomItemIndex: fusing.bomItemIndex,
              bomItemId: undefined,
              fusingBomItemId: undefined,
              note: m.note?.trim() || '',
            };
          }),
      })),
    // DXF block → piece aliases (0262). ALWAYS sent as a wrapper — the wrapper IS the presence
    // signal, and a client that owns the mapping must be able to empty it. Aliases whose piece
    // left the card are dropped rather than sent: the store answers an unresolvable
    // piece_line_key with a field violation, which would block the whole save over a row the
    // operator deleted on the pieces tab and never connected to a DXF in their head.
    pieceDxfAliases: {
      items: (data.pieceDxfAliases ?? [])
        .filter(
          (a) =>
            // One of the two halves must name something — a row naming neither would file under the
            // empty scope, where every unbound alias of the card would collide with every other.
            (!!a.bomLineKey?.trim() || !!a.fabricPurpose?.trim()) &&
            !!a.blockName?.trim() &&
            !!a.pieceLineKey?.trim() &&
            livePieceKeys.has(a.pieceLineKey.trim().toLowerCase()),
        )
        .map((a) => ({
          bomLineKey: a.bomLineKey?.trim() || '',
          blockName: a.blockName!.trim(),
          pieceLineKey: a.pieceLineKey!.trim(),
          fabricPurpose: (a.fabricPurpose?.trim() ||
            UNSET_PURPOSE) as common_TechCardBomPurpose,
        })),
    },
    bomItems: bomLines.map((b) => ({
      section: (b.section || 'TECH_CARD_BOM_SECTION_UNKNOWN') as common_TechCardBomSection,
      purpose: (b.purpose || UNSET_PURPOSE) as common_TechCardBomPurpose,
      // Sent only where it is legal, so a note left behind by switching «другое» → «карманка» cannot
      // ride out and be refused by chk_bom_item_purpose_note. Dropping it is safe in a way clearing
      // the PURPOSE would not be: the note only ever explains a purpose that is no longer there.
      purposeNote: isOtherPurpose(b.purpose) ? b.purposeNote?.trim() ?? '' : '',
      isSample: !!b.isSample,
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
      // Stable identity (§2.3): keep the server PK + the resolved line_key.
      id: b.id || 0,
      lineKey: b.lineKey,
    })),
    details: (data.details ?? [])
      .map((d) => ({
        key: d.key?.trim() || '',
        text: d.text?.trim() || '',
        mediaIds: d.mediaIds ?? [],
      }))
      .filter((d) => d.key || d.text || d.mediaIds.length > 0),
    construction: mapConstructionOut(data.construction),
    operations: (data.operations ?? []).map((o, i) => {
      const opBomKeys = (o.bomLineKeys ?? []).map((k) => k.trim()).filter(Boolean);
      // The legacy single ref is DERIVED from the list's first entry, never edited on its own: the
      // UI dropped the separate «мат. напрямую» control (it asked the same question with room for
      // one answer), but tech_card_operation.bom_item_id is still written and read during the
      // transition (0200), so it must keep agreeing with the list.
      const bomRef = outBomRef(opBomKeys[0] ?? '');
      return {
        // Blanks dropped here as well as server-side: an empty key would be a field violation the
        // operator never caused.
        pieceLineKeys: (o.pieceLineKeys ?? []).map((k) => k.trim()).filter(Boolean),
        bomLineKeys: opBomKeys,
        node: o.node?.trim() || '',
        description: o.description?.trim() || '',
        seamType: o.seamType?.trim() || '',
        stitchesPerCm: inputToDecimal(o.stitchesPerCm),
        smv: inputToDecimal(o.smv),
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
        // durable BOM reference (§2.3) + a consistent positional index for the transition path.
        bomLineKey: bomRef.bomLineKey,
        bomItemIndex: bomRef.bomItemIndex,
        bomItemId: undefined,
        calloutNumber: o.calloutNumber || 0,
        placement: o.placement?.trim() || '',
      };
    }),
    labels: (data.labels ?? []).map((l) => ({
      labelType: (l.labelType || 'TECH_CARD_LABEL_TYPE_UNKNOWN') as common_TechCardLabelType,
      content: l.content?.trim() || '',
      placement: l.placement?.trim() || '',
      attachment: l.attachment?.trim() || '',
      size: l.size?.trim() || '',
      note: l.note?.trim() || '',
      bomItemId: wireInt(l.bomItemId),
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
      // Echoed back deliberately. A present digest tells the server "this is an ordinary save, the
      // approval still covers what it covered" and is carried through; an EMPTY one means "approve
      // this now" and asks the server to fingerprint what is being written. The approve/re-approve
      // action clears it — that is how a stale sign-off is re-blessed, and why an unrelated save
      // cannot silently re-bless one.
      signedDigest: s.signedDigest?.trim() || '',
    })),
    // revisions removed from the write payload (Q1): the auto-journal is server-appended and
    // read-only (common_TechCard.revisions), never client-supplied.
    // Season identity (Q1): parse the form label back into the structured SkuSeason.
    skuSeason: parseSeasonToSku(data.season),
    // Cast: TechCardInsert keys are required-but-nullable; we set every section above and
    // echo any still-unhandled proto field from `original`. Untouched keys are omitted on
    // create (absent == empty on the wire), which the structural type can't express.
  } as common_TechCardInsert;
}
