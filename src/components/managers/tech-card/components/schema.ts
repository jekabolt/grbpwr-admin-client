import { clampPatternName } from 'utils/pattern';
import {
  common_GenderEnum,
  common_TechCard,
  common_TechCardApprovalState,
  common_TechCardAuxSubtype,
  common_TechCardBomKind,
  common_TechCardBomPurpose,
  common_TechCardBomSection,
  common_TechCardConstruction,
  common_TechCardAttachmentKind,
  common_TechCardAutomationLevel,
  common_TechCardBedType,
  common_TechCardBindingStyle,
  common_TechCardButtonAttachPattern,
  common_TechCardButtonholeOrientation,
  common_TechCardButtonholeStyle,
  common_TechCardCleaningKind,
  common_TechCardHardwareAttachMethod,
  common_TechCardHolePrep,
  common_TechCardInspectCoverage,
  common_TechCardLabelAttachStitch,
  common_TechCardPeelMode,
  common_TechCardPressAction,
  common_TechCardPressToward,
  common_TechCardPressureScale,
  common_TechCardPrintMethod,
  common_TechCardReinforcement,
  common_TechCardSeamSecuring,
  common_TechCardTrimAction,
  common_TechCardWetProcessKind,
  common_TechCardZipperApplication,
  common_TechCardEquipmentDefaults,
  common_TechCardGarmentZone,
  common_TechCardMachineProfile,
  common_TechCardMachineType,
  common_TechCardNeedleType,
  common_TechCardPressCloth,
  common_TechCardPressEquipment,
  common_TechCardPressProfile,
  common_TechCardSeamClass,
  common_TechCardThreadTension,
  common_TechCardTopstitchMode,
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
  common_TechCardPieceFusingMode,
  common_TechCardSignoffSection,
  common_TechCardSignoffState,
  common_TechCardStage,
  common_StyleNumberSource,
  common_TechCardAnnotation,
  common_TechCardAnnotationColor,
  common_TechCardAnnotationKind,
} from 'api/proto-http/admin';
import { ZERO_TIMESTAMP } from 'components/managers/tech-cards/components/utils';
import { decimalToInput, inputToDecimal, parseDecimalNumber } from 'utils/decimal';
import { validateSeamAllowanceStandard } from 'utils/seam-allowance';
import { ulid } from 'utils/ulid';
import { KIND_HOME_SECTION, UNSET_KIND, isKindEligibleSection } from './bom-kind';
import { UNSET_PURPOSE, fabricScopeKey, isOtherPurpose, isRollGoodsSection } from './bom-purpose';
import { parseSeasonToSku, skuToSeasonLabel } from './season-util';
import {
  UNSET_CUT_SYMMETRY,
  UNSET_FUSING_MODE,
  fusingNeedsWidth,
  isFusingMarked,
  cutSymmetryCountInvalid,
  isCutSymmetryMarked,
} from './piece-codes';
import {
  topstitchDatumOf,
  topstitchModeNeedsWidth,
  topstitchModeRefusesWidth,
} from './operation-options';
import {
  type StepBlock,
  isMachineStepType,
  isWeldMachineType,
  stepTypeOwnsBlock,
} from './equipment-options';
import { wireInt } from './wire-int';
import { z } from 'zod';
import {
  ANNOTATION_COLOR_KEYS,
  ANNOTATION_KIND_KEYS,
  type AnnotationColorKey,
  type AnnotationKindKey,
} from 'ui/components/annotation/kinds';
import {
  annotationColorFromWire,
  annotationColorToWire,
  annotationKindFromWire,
  annotationKindToWire,
} from 'ui/components/annotation/wire';

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

// wireInt переехал в лист ./wire-int (ни zod, ни bom-purpose за ним не тянется): его зовут чистые
// модули, которым схема карточки в графе не нужна. Здесь — реэкспорт, чтобы два десятка
// существующих импортёров `from './schema'` остались нетронутыми и второго адреса чтения id не
// появилось.
export { wireInt } from './wire-int';

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

// `calloutSchema` живёт НИЖЕ, сразу за словарём видов выносок: с 0309 карточное указание несёт вид,
// якоря и цвет, и ссылается на этот словарь ЗНАЧЕНИЕМ (`z.enum(ANNOTATION_KINDS)`), а не типом.
// Объявленная здесь, схема падала бы на загрузке модуля с ReferenceError.

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
  fusingMode?: string;
  fusingWidthMm?: string;
  piecesPerGarment?: number;
  cutSymmetry?: string;
  ungraded?: boolean;
  materials?: { bomLineKey?: string; fusingBomLineKey?: string; note?: string }[];
}): boolean {
  if (p.name?.trim() || p.grainline?.trim() || p.note?.trim()) return false;
  if (p.calloutNumber || p.fused) return false;
  if ((p.piecesPerGarment ?? 1) > 1) return false;
  // Разметка кроя считается содержимым наравне с долевой и дублированием. Без этой строки ряд, в
  // котором оператор успел ответить только на вопрос «как кроится», выбрасывался бы на сохранении
  // МОЛЧА — потеря данных без единого сообщения, ради экономии одной проверки.
  if (isCutSymmetryMarked(p.cutSymmetry)) return false;
  // Тот же прецедент, что строкой выше: «не градуируется» — это ОТВЕТ оператора, а строка с одним
  // только ответом содержимым является. Без этой проверки галку, поставленную до имени (а её
  // ставит и предзаполнение по токену UNI), сохранение выбросило бы вместе со всей строкой.
  if (p.ungraded) return false;
  // Тот же прецедент в третий раз: режим дублирования — ОТВЕТ оператора, и строка, в которой
  // успели ответить только на него, содержимым является. Ширина проверяется отдельно от режима:
  // оператор набирает число раньше, чем доходит до селекта, и потерять его молча — та же потеря
  // данных без сообщения.
  if (isFusingMarked(p.fusingMode) || p.fusingWidthMm?.trim()) return false;
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
    // ДЕТАЛЬ НЕ ГРАДУИРУЕТСЯ (UNI): один и тот же контур входит в комплект КАЖДОГО размера. Это
    // свойство ДЕТАЛИ, а не вывод из имени блока: токен UNI в чертеже только предзаполняет ответ
    // (pieces-tab), а хозяин ответа — оператор. Раньше безразмерность угадывалась по тому, что в
    // имени блока нет размерного токена, — и угадывание молчит ровно там, где ошибается.
    ungraded: z.boolean().optional().default(false),
    grainline: z.string().optional().default(''),
    fused: z.boolean().optional().default(false),
    // КАК ИМЕННО ДУБЛИРУЕТСЯ (0304). Полный литерал перечисления, как у cutSymmetry выше и по той
    // же причине: круглый рейс без словаря переводов — это то, что делает сохранение неспособным
    // подменить ответ оператора.
    fusingMode: z.string().optional().default(UNSET_FUSING_MODE),
    // Ширина полосы — СТРОКА, а не число, как и всякий decimal на проводе: google.type.Decimal
    // едет строкой, и промежуточное состояние ввода («2», «2.», «2.5») обязано доживать до конца
    // набора. z.number() схлопнул бы «2.» в 2 под курсором.
    fusingWidthMm: z.string().optional().default(''),
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
    // ПРОВЕРКИ «зеркальная пара при нечётном количестве» ЗДЕСЬ БОЛЬШЕ НЕТ — и это не забывчивость.
    // Она вешала issue на `path: ['cutSymmetry']`, а контрола с таким путём в карточке не осталось:
    // редактор «как кроится» убран вместе с «× на изделие», ответ теперь ставит модалка
    // сопоставления DXF. Зод-ошибка на поле, которого нет на экране, — это молчащая кнопка
    // «сохранить»: подсветить и проскроллить не к чему, исправить нечем, и карточка встаёт в
    // «Press Save again» без выхода. Проект уже платил за ровно этот сценарий.
    //
    // Само правило БД никуда не делось (`chk_tcp_mirrored_needs_even_count` ДВУХКОЛОНОЧНЫЙ и
    // стреляет сырым MySQL 3819), но закрывает его теперь не отказ, а нормализация на ОТПРАВКЕ —
    // см. `cutSymmetry` в маппере `pieces` ниже: невалидная пара уезжает явным `_UNKNOWN`, то есть
    // разметка снимается осознанно, а сохранение карточки проходит. Создать такую пару руками
    // оператор больше не может — обе её половины ставит модалка, и она держит то же правило.
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
            "this cut cell isn't bound to a colourway — saving would wipe its material / note",
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
    // ЧТО ЭТО ЗА ПОЗИЦИЯ (0278) — the mirror axis on everything that is NOT roll goods and not a
    // label. Unset is a real state for the same reason purpose's is: every line predating the field
    // is deliberately unclassified, and demanding a kind here would make those cards unsavable.
    kind: z.string().optional().default(UNSET_KIND),
    kindNote: z.string().optional().default(''),
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
    // ПРОВЕНАНС ПРОЦЕНТА РАСКРОЯ (0296, T7 волна 2): 'lays' — применено из предложения «медиана
    // факта настилов над netto», 'manual'/'' — руками. БЕЗ .default(): undefined здесь несёт
    // смысл «эта форма не знает» (черновик, восстановленный из localStorage-снимка старого
    // бандла) и обязан уйти на провод ОТСУТСТВИЕМ пары — иначе первый же сейв такого черновика
    // стёр бы аудит применения на строках, которых человек не касался (см. mapFormToTechCardInsert).
    wastageSource: z.string().optional(),
    // Штамп применения: по скольким настилам стояла медиана. Живёт ПАРОЙ с wastageSource —
    // на проводе присутствие решается для обоих разом (дисциплина kind/kind_note).
    wastageLayCount: z.number().optional(),
    // OUTPUT-ONLY: когда применено. Возится через форму только чтобы показать дату в бейдже;
    // на провод не уходит никогда — её ставит сервер при смене тройки (source, count, percent).
    //
    // .nullish(), а НЕ .optional(): это единственное поле формы, которое читается с провода как
    // message (google.protobuf.Timestamp), а grpc-gateway маршалит с EmitUnpopulated — пустой
    // message приходит ЯВНЫМ null, не отсутствием ключа (та же ложь генерённого типа, что у
    // int64-как-строки в wireInt выше: TS объявляет `string | undefined`, компилятор проверить не
    // может). `.optional()` пропускает только undefined, поэтому null ронял валидацию всей формы
    // с «Invalid input» на bomItems.N.wastageAppliedAt — а штамп пуст почти на каждой строке BOM,
    // и сохранение тех-карты было заблокировано целиком. Ниже, в mapTechCardToForm, null ещё и
    // нормализуется в undefined; здесь схема остаётся терпимой к нему ради черновиков из
    // localStorage, снятых до этой правки.
    wastageAppliedAt: z.string().nullish(),
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
        message: 'set a role (a name) — a line without an article has nowhere to take a name from',
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
        message: 'only a fabric line has a purpose (fabric / lining / interlining / insulation)',
        path: ['purpose'],
      });
    }
    if (item.purposeNote?.trim() && !isOtherPurpose(purpose)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'a note can be written only for the “other” purpose',
        path: ['purposeNote'],
      });
    }
    // Same parity for the other axis (0278). The kind↔section PAIRING is checked too, not just
    // eligibility: the store refuses a zip on a thread line, and catching it here names the field
    // instead of surfacing a violation on a line_key nobody recognises.
    const kind = item.kind && item.kind !== UNSET_KIND ? item.kind : '';
    if (kind && !isKindEligibleSection(item.section)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "a kind belongs to hardware, thread, trim, decoration and packaging — for fabric it is the purpose, for a label it is its type",
        path: ['kind'],
      });
    }
    const home = KIND_HOME_SECTION[kind as common_TechCardBomKind];
    if (kind && home && home !== item.section) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'this kind belongs to a different section',
        path: ['kind'],
      });
    }
    if (item.kindNote?.trim() && kind !== 'TECH_CARD_BOM_KIND_OTHER') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'a note can be written only for the “other” kind',
        path: ['kindNote'],
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

// The card's DEFAULTS — what a step inherits when it does not override. Typed now, because a
// free-text default is one nothing can inherit: the block used to say «общие параметры по
// умолчанию» while every step retyped «5 мм» by hand.
//
// No seam allowance here: the card's standard is requiredSeamAllowanceMm on the card itself (0277
// put it there deliberately — a field in a section's digest projection stales every approved
// signature of that section). And no main stitch type: the stitch class is a per-STEP fact carried
// by operationType, and a card-wide default for it is not a thing a card can mean.
// Stitches per CENTIMETRE, and the band is closed on BOTH sides — 1..20, matching
// entity.MinStitchesPerCm/MaxStitchesPerCm and chk_construction_stitches. It is checked here because
// the schema constraint answers with MySQL error 3819: no field, no sentence, surfaced as a bare
// Internal. «0» is the reachable mistake — it reads as «unset» to the person typing it and means «a
// seam with no stitches» to everything downstream — so blank is the way to leave it inherited.
const MIN_STITCHES_PER_CM = 1;
const MAX_STITCHES_PER_CM = 20;
// The column is DECIMAL(_,2) and entity.ValidateStitchesPerCm refuses a third place by name. It is
// checked here for the reason every other decimal on this form is (refineRangedDecimal says it at
// length): MySQL does not refuse an over-precise number, it ROUNDS it and hands a different one
// back on the next read — so «4.567» typed into a step would come home as «4.57» with no event
// between. The three density controls all default to DecimalField's three places, which is exactly
// one more than the wire takes.
const MAX_STITCH_DENSITY_DECIMALS = 2;

function refineStitchDensity(
  value: string | undefined,
  ctx: z.RefinementCtx,
  path: Array<string | number>,
) {
  // Comma to dot BEFORE the fraction is counted — an RU keyboard types «4,25», and a check that
  // split on '.' alone would read that as a whole number and wave the extra place through.
  const raw = (value ?? '').trim().replace(/,/g, '.');
  if (!raw) return; // blank = inherit / not configured, always legal
  const n = parseDecimalNumber(raw);
  if (!Number.isFinite(n) || n < MIN_STITCHES_PER_CM || n > MAX_STITCHES_PER_CM) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path,
      message: `stitches per cm runs ${MIN_STITCHES_PER_CM}–${MAX_STITCHES_PER_CM} (3–5 is ordinary sewing) — leave it blank to inherit rather than entering 0`,
    });
    return;
  }
  if ((raw.split('.')[1]?.length ?? 0) > MAX_STITCH_DENSITY_DECIMALS) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path,
      message: `round to ${MAX_STITCH_DENSITY_DECIMALS} decimal places — the column stores hundredths, so the rest would be dropped silently`,
    });
  }
}

// THE SANITY BANDS of the equipment settings, mirrored from the server's entity constants (and from
// the CHECKs behind them) so a number that will be refused is refused HERE, under the control that
// holds it, instead of coming back as a violation on a save of the whole card.
//
// They are bands, not standards: 40 °C is not a sensible press, it is the lowest number that cannot
// be a typo for 140. `0` is the unset value of every integer here (proto3 has no presence on a bare
// int32 and every band starts above zero), so it is never checked — blank means inherit.
const EQUIPMENT_INT_BANDS = {
  threadCount: { min: 1, max: 20, what: 'threads on one machine' },
  needleSizeNm: { min: 35, max: 300, what: 'needle size in Nm (Nm 90 = a 0.90 mm blade)' },
  pressTemperatureC: { min: 40, max: 250, what: 'press temperature in °C' },
  pressDwellSec: { min: 1, max: 300, what: 'dwell in seconds' },
} as const;

function refineRangedInt(
  value: number | undefined,
  band: { min: number; max: number; what: string },
  ctx: z.RefinementCtx,
  path: Array<string | number>,
) {
  const n = value ?? 0;
  if (!n) return; // 0 = unset = inherit
  if (!Number.isInteger(n) || n < band.min || n > band.max) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path,
      message: `${band.what} runs ${band.min}–${band.max} in whole numbers — clear the field to inherit it`,
    });
  }
}

// The decimal twin. `maxDecimals` mirrors the column's scale, and that is not pedantry: MySQL does
// not refuse an over-precise number, it rounds it silently and hands a different one back on the
// next read — so the check has to happen before the value leaves.
function refineRangedDecimal(
  value: string | undefined,
  band: { min: number; max: number; maxDecimals: number; what: string },
  ctx: z.RefinementCtx,
  path: Array<string | number>,
) {
  // Comma to dot BEFORE the fraction is counted: an RU keyboard types «4,55», parseDecimalNumber
  // normalises it on the way to a number, and a check that split on '.' alone would read that as a
  // whole number and wave the extra place through.
  const raw = (value ?? '').trim().replace(/,/g, '.');
  if (!raw) return; // blank = inherit
  const n = parseDecimalNumber(raw);
  if (!Number.isFinite(n) || n < band.min || n > band.max) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path,
      message: `${band.what} runs ${band.min}–${band.max} — clear the field to inherit it`,
    });
    return;
  }
  const frac = raw.split('.')[1]?.length ?? 0;
  if (frac > band.maxDecimals) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path,
      message: `round to ${band.maxDecimals} decimal place — the column stores no more, so the rest would be dropped silently`,
    });
  }
}

const STITCH_WIDTH_BAND = {
  min: 0,
  max: 20,
  maxDecimals: 1,
  what: 'stitch width in mm (the zigzag amplitude / overlock bite, NOT the topstitch width)',
} as const;
const PRESS_PRESSURE_BAND = {
  min: 1,
  max: 100,
  maxDecimals: 1,
  what: 'pressure on the material in N/cm²',
} as const;

// --- ВИДЫ ОПЕРАЦИЙ (волна 0324): банды пятнадцати числовых полей ---------------------------------
//
// ГРАНИЦЫ — САНИТИ, А НЕ ЦЕХОВОЙ СТАНДАРТ (довод 0306). Они ловят промах в разряде — «120» вместо
// «12» игл, «4» вместо «400» мм шага — и не сужают вендорский паспорт: прорезь петли на спец-ноже
// бывает и 120 мм, закрепка цикловой машины — и 40.
//
// `maxDecimals` У КАЖДОГО ДЕЦИМАЛА — МАСШТАБ ЕГО КОЛОНКИ, не украшение: MySQL не отказывает в
// лишнем знаке, он молча округляет и возвращает на следующем чтении ДРУГОЕ число, уже без следа
// того, что его правили.
const STEP_KIND_INT_BANDS = {
  needleCount: { min: 1, max: 12, what: 'needles in the stitch line' },
  placementCount: { min: 1, max: 99, what: 'how many times the step repeats on the garment' },
  cycleStitchCount: { min: 8, max: 64, what: "stitches in the automat's cycle" },
  secondPressSec: { min: 1, max: 30, what: 'the second press in seconds' },
  airTemperatureC: { min: 100, max: 750, what: 'hot-air temperature in °C' },
} as const;

const STEP_KIND_DECIMAL_BANDS = {
  // Расстояние между ИГЛАМИ. Не путать с row_spacing: тот про соседние строчки.
  needleGaugeMm: { min: 1.6, max: 25.4, maxDecimals: 1, what: 'the gauge BETWEEN needles in mm' },
  rowSpacingMm: { min: 1, max: 30, maxDecimals: 1, what: 'the spacing between stitch ROWS in mm' },
  // ОТНОШЕНИЕ, а не проценты: 1.0 — слои идут один в один, 2.0 — присборить вдвое.
  fullnessRatio: {
    min: 0.6,
    max: 4,
    maxDecimals: 2,
    what: 'ease / gathering as a RATIO, not a percentage',
  },
  pitchMm: { min: 5, max: 500, maxDecimals: 1, what: 'the pitch between repeats in mm' },
  foldbackMm: {
    min: 10,
    max: 80,
    maxDecimals: 1,
    what: 'the webbing foldback through the buckle in mm',
  },
  feedSpeedMMin: { min: 0.3, max: 10, maxDecimals: 1, what: 'feed speed in m/min' },
  // Сколько припуска ОСТАЁТСЯ после подрезки — не то, с каким кроили (seamAllowanceMm).
  residualAllowanceMm: {
    min: 1,
    max: 10,
    maxDecimals: 1,
    what: 'the allowance LEFT after trimming, in mm',
  },
  residualTailMaxMm: {
    min: 1,
    max: 10,
    maxDecimals: 1,
    what: 'the longest thread tail allowed, in mm',
  },
  cutLengthMm: { min: 4, max: 120, maxDecimals: 1, what: 'the buttonhole cut in mm' },
  bartackLengthMm: { min: 1, max: 40, maxDecimals: 1, what: 'the bartack length in mm' },
} as const;

// Циклы: петля, пуговица, закрепка. Единственные три ЯВНЫХ типа машины, на которых легальна ЧАСТЬ
// H-блока — подготовка отверстия, усилитель, стежки цикла. Способа крепления и подгиба стропы у
// них нет вовсе, и сервер отвергает их на таком шаге по имени, отказывая всей карточкой.
const CYCLE_MACHINE_TYPES = [
  'TECH_CARD_MACHINE_TYPE_BUTTONHOLE',
  'TECH_CARD_MACHINE_TYPE_BUTTON_ATTACH',
  'TECH_CARD_MACHINE_TYPE_BARTACK',
] as const;

// «Заполнено» для трёх дисциплин пустоты волны. Разведены нарочно: у enum'а пусто это токен
// `*_UNKNOWN` (он же «не указано»), у целого — 0, у децимала — пустая строка в форме. NONE ни в
// одном словаре пустотой НЕ считается: «без закрепки» и «носителя нет» — это ОТВЕТЫ.
const stepEnumSet = (v?: string) => !!v && !v.endsWith('_UNKNOWN');
const stepTextSet = (v?: string) => !!(v ?? '').trim();

// Есть ли в собранном блок-сообщении хоть один факт. Пусто ⇒ обёртка не едет вовсе — прецедент
// `topstitch`: всегда присутствующая обёртка с UNKNOWN внутри читается как «кто-то думал об этом»
// на КАЖДОМ шаге, у которого этого нет. Децимал сюда попадает уже объектом `{value}` или не
// попадает совсем (`inputToDecimal('')` возвращает undefined), поэтому его присутствие и есть
// заполненность.
function blockHasFacts(block: Record<string, unknown>): boolean {
  return Object.values(block).some((v) => {
    if (v === undefined || v === null) return false;
    if (typeof v === 'number') return v !== 0;
    if (typeof v === 'string') return stepEnumSet(v) && v !== '';
    return true;
  });
}

// Блок едет ЦЕЛИКОМ ИЛИ НЕ ЕДЕТ ВОВСЕ. `owned` — гейт глагола (и, где он есть, явного типа
// машины): на чужом глаголе блок не строится даже пустым, потому что сервер отвергает поле чужого
// семейства ПО ИМЕНИ и отказывает вместе с ним всей карточке.
function blockOut<T extends object>(owned: boolean, build: () => T): T | undefined {
  if (!owned) return undefined;
  const block = build();
  return blockHasFacts(block as Record<string, unknown>) ? block : undefined;
}

// A thread-tension note qualifies the scale («на 0.5 туже»); on its own it describes no setting the
// next machine can be set to, and the server refuses the pair by name.
function refineThreadTensionNote(
  tension: string | undefined,
  note: string | undefined,
  ctx: z.RefinementCtx,
  path: Array<string | number>,
) {
  if ((note ?? '').trim() && (!tension || tension === 'TECH_CARD_THREAD_TENSION_UNKNOWN')) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path,
      message: 'pick the tension first — a note on its own describes no setting',
    });
  }
}

// THE CARD'S EQUIPMENT PARK (0306) — one row per machine / press this style is made on.
//
// IDENTITY IS `profileKey`, a client-minted ULID, exactly like a BOM line's `lineKey` and for
// exactly the same reason: the list is FULL-REPLACED on every save, so a position or a server id
// would break every step that points at a row the moment another row is added above it. The key is
// minted when the row is created in the form and round-tripped verbatim ever after. `label` is a
// name for a human («оверлок у окна») and is NOT part of the identity — the scope_key lesson, where
// two different keys ended up living under one name.
//
// THERE MAY BE SEVERAL PROFILES OF ONE TYPE. Two identical overlocks threaded differently is the
// ordinary case on a floor, not a duplicate to collapse, which is why the type is not a key and the
// type picker is not disabled once used.
//
// DECIMALS ARE STRINGS here, like every other decimal on this form (google.type.Decimal travels as
// `{ value: "4.5" }` and an intermediate «2.» has to survive under the cursor). The wire-null the
// gateway sends for an unset Decimal is absorbed by decimalToInput on the way IN, so no schema
// field here ever sees a null — see the note on wastageAppliedAt for the one field where it does.
const machineProfileSchema = z.object({
  profileKey: z.string().optional().default(''),
  label: z.string().optional().default(''),
  // REQUIRED server-side: a park row that does not say what machine it is cannot be inherited from.
  // A row left UNKNOWN is dropped on save rather than refused — see mapEquipmentDefaultsOut.
  machineType: z.string().optional().default('TECH_CARD_MACHINE_TYPE_UNKNOWN'),
  threadCount: z.number().optional().default(0), // 1..20; 0 = unset
  needleType: z.string().optional().default('TECH_CARD_NEEDLE_TYPE_UNKNOWN'),
  needleSizeNm: z.number().optional().default(0), // Nm 35..300; 0 = unset
  // Bed and automation are machine IDENTITY and exist only here: a step that needs another bed is
  // a step on another machine, so it changes machineType instead of overriding this.
  bedType: z.string().optional().default('TECH_CARD_BED_TYPE_UNKNOWN'),
  automation: z.string().optional().default('TECH_CARD_AUTOMATION_LEVEL_UNKNOWN'),
  threadTension: z.string().optional().default('TECH_CARD_THREAD_TENSION_UNKNOWN'),
  threadTensionNote: z.string().optional().default(''),
  attachmentKind: z.string().optional().default('TECH_CARD_ATTACHMENT_KIND_UNKNOWN'),
  stitchesPerCm: z.string().optional().default(''),
  // The zigzag amplitude / overlock bite. NOT topstitch width (a distance from an edge) — the two
  // are different facts and the labels must stay different wherever they print.
  stitchWidthMm: z.string().optional().default(''),
  note: z.string().optional().default(''),
});

const pressProfileSchema = z.object({
  profileKey: z.string().optional().default(''),
  label: z.string().optional().default(''),
  // REQUIRED server-side, same rule as machineType above.
  pressEquipment: z.string().optional().default('TECH_CARD_PRESS_EQUIPMENT_UNKNOWN'),
  // WHICH ВТО PROCESS this profile is for, so the step form can offer it by default. UNKNOWN =
  // universal; the server accepts only PRESS / PRESS_OPEN / FUSING beyond that.
  operationType: z.string().optional().default('TECH_CARD_OPERATION_TYPE_UNKNOWN'),
  pressTemperatureC: z.number().optional().default(0), // 40..250; 0 = unset
  pressDwellSec: z.number().optional().default(0), // 1..300; 0 = unset
  pressPressureNCm2: z.string().optional().default(''), // N/cm², unit in the name
  // THREE-VALUED, AND THE ONLY FIELD ON THIS FORM THAT HAS NO DEFAULT. `undefined` = «not stated,
  // inherit», `false` = «press it DRY», `true` = «with steam» — three different instructions to the
  // floor, and folding the first two together would make a signature over «без пара» read as one
  // over «как получится». It is a proto3 `optional bool`: protojson NEVER prints an unset one, so
  // absence arrives as a missing key (NOT as null — that is what unset google.type.Decimal messages
  // arrive as, and they are absorbed by decimalToInput). A `.default(false)` here would invent the
  // answer «dry» on every profile nobody has answered.
  pressSteam: z.boolean().optional(),
  pressCloth: z.string().optional().default('TECH_CARD_PRESS_CLOTH_UNKNOWN'),
  note: z.string().optional().default(''),
});

const constructionSchema = z
  .object({
    defaultSeamClass: z.string().optional().default('TECH_CARD_SEAM_CLASS_UNKNOWN'),
    defaultStitchesPerCm: z.string().optional().default(''),
    hemFinish: z.string().optional().default(''),
    notes: z.string().optional().default(''),
    // NO `pressing`, NO `overlockThreadCount` — both left TechCardConstruction with 0306. One thread
    // count per card could describe one overlock and a card is sewn on several; the prose field
    // answered «how is it pressed» for a whole card when pressing is a STEP. Migration 0306 moved
    // the prose into `notes` and turned the count into a real overlock profile below. Archived
    // release snapshots still hold both in the DATABASE, but never on this side of the wire: the
    // server parses a snapshot into the current contract with DiscardUnknown, so nothing here can
    // read them (see the note where their two readers used to live, in equipment-options.ts).
    //
    // THE PARK KEEPS ITS WIRE NESTING, wrapper and all, rather than being flattened to two arrays on
    // the construction. The wrapper is a wire fact — its PRESENCE is what tells the server «replace
    // the park» from «this bundle knows nothing about parks» — but that is not why it is mirrored
    // here. The server tags a bad profile row as
    // `construction.equipment_defaults.machines[0].machine_type`, and applyServerFieldErrors pins a
    // violation by camel-casing that path onto a form field: flattened, every such refusal would
    // miss its control and degrade into an unattributable toast on a save of the whole card. (The
    // backend documents the mirror image of this trade for `topstitch`, which the form holds flat
    // and which is therefore reported flat.) The default keeps a draft restored from an older
    // localStorage snapshot parseable.
    equipmentDefaults: z
      .object({
        machines: z.array(machineProfileSchema).default([]),
        presses: z.array(pressProfileSchema).default([]),
      })
      .default({ machines: [], presses: [] }),
  })
  .superRefine((c, ctx) => {
    refineStitchDensity(c.defaultStitchesPerCm, ctx, ['defaultStitchesPerCm']);
    (c.equipmentDefaults?.machines ?? []).forEach((m, i) => {
      const at = (field: string) => ['equipmentDefaults', 'machines', i, field];
      refineStitchDensity(m.stitchesPerCm, ctx, at('stitchesPerCm'));
      refineRangedInt(m.threadCount, EQUIPMENT_INT_BANDS.threadCount, ctx, at('threadCount'));
      refineRangedInt(m.needleSizeNm, EQUIPMENT_INT_BANDS.needleSizeNm, ctx, at('needleSizeNm'));
      refineRangedDecimal(m.stitchWidthMm, STITCH_WIDTH_BAND, ctx, at('stitchWidthMm'));
      refineThreadTensionNote(m.threadTension, m.threadTensionNote, ctx, at('threadTensionNote'));
    });
    (c.equipmentDefaults?.presses ?? []).forEach((p, i) => {
      const at = (field: string) => ['equipmentDefaults', 'presses', i, field];
      refineRangedInt(
        p.pressTemperatureC,
        EQUIPMENT_INT_BANDS.pressTemperatureC,
        ctx,
        at('pressTemperatureC'),
      );
      refineRangedInt(p.pressDwellSec, EQUIPMENT_INT_BANDS.pressDwellSec, ctx, at('pressDwellSec'));
      refineRangedDecimal(p.pressPressureNCm2, PRESS_PRESSURE_BAND, ctx, at('pressPressureNCm2'));
    });
  });

// ── ВЫНОСКИ НА ФОТО ─────────────────────────────────────────────────────────────────────────────
//
// Вид выноски — ЗАКРЫТЫЙ СЛОВАРЬ, и он определяет всё остальное: сколько точек, что рисуется и
// чем является текст. Набор проектировался осями (якорь × геометрия × лидер × подпись), но
// независимые поля пришлось бы валидировать комбинаторикой бессмыслицы — скобка с одной точкой,
// номер на мерке. Сервер проверяет ровно эти же правила, теми же словами.
// СЛОВАРЬ ВИДОВ ЖИВЁТ В РЕЕСТРЕ ОТРИСОВКИ (`ui/components/annotation/kinds`), а здесь только
// зеркалится в zod и в провод. Раньше он был объявлен и тут, и там, и в двух местах холста —
// четыре списка, каждый со своим набором ключей, и каждый новый вид требовал вспомнить про все
// четыре. Один забытый роняет экран целиком: словарь без строки на пришедший ключ отдаёт undefined,
// а код тут же его деструктурирует.
//
// Правило «у мерки две точки» — знание ЖЕСТА И ОТРИСОВКИ, поэтому живёт там же: им одинаково
// пользуются снимок шага, эскиз, мудборд и примерка, а форма карточки о нём не знает вовсе.
export const ANNOTATION_KINDS = ANNOTATION_KIND_KEYS;
export type AnnotationKind = AnnotationKindKey;

// Цвет — закрытый список, а не свободный hex: лист швеи печатают и на чёрно-белом принтере, где
// произвольный цвет станет неразличимым серым. Пусто = чернильный, тот же, каким нарисовано всё
// остальное. Цвет РАЗЛИЧАЕТ пересекающиеся указания, а не кодирует смысл.
export const ANNOTATION_COLORS = ANNOTATION_COLOR_KEYS;
export type AnnotationColor = AnnotationColorKey;

// СЛОВАРИ ПРОВОДА ПЕРЕЕХАЛИ К РЕЕСТРУ ВИДОВ (`ui/components/annotation/wire`): указания рисует
// теперь не только тех-карта, но и вложение задачи, а две копии таблицы «вид ↔ константа» — это
// вид, который приезжает на один экран и не приезжает на другой. Реэкспорт оставлен намеренно:
// схема остаётся тем единственным местом, куда смотрит домен тех-карты.
export {
  annotationColorFromWire,
  annotationColorToWire,
  annotationKindFromWire,
  annotationKindToWire,
};

/**
 * СПИСОК ДЕТАЛЕЙ И ОДИНОЧНОЕ ПОЛЕ — ОДНО И ТО ЖЕ, записанное дважды. Правило свода общее для
 * выноски снимка шага и карточного указания, и оно ЗЕРКАЛО серверного: непустой список вытесняет
 * одиночное поле целиком, пустой читается как [поле]. Без общего свода клиент однажды прислал бы
 * список из одной детали, а поле — из другой, и печать разошлась бы с экраном.
 *
 * Пустые и повторы снимаются: деталь, названная дважды, — одно указание, а не порча данных.
 */
function mergeSingleAndList(list: string[] | undefined, single: string | undefined): string[] {
  const src = (list ?? []).map((v) => (v ?? '').trim()).filter(Boolean);
  const from = src.length ? src : [(single ?? '').trim()].filter(Boolean);
  const out: string[] = [];
  for (const v of from) if (!out.includes(v)) out.push(v);
  return out;
}

/**
 * ВЫНОСКА СНИМКА ШАГА С ПРОВОДА — ОДНА КОНВЕРТАЦИЯ НА ВСЕХ ЧИТАТЕЛЕЙ.
 *
 * Её делают трое: маппер формы карточки, архив релиза (вербатимный снапшот) и печать тех-пака
 * (read-модель). Тип у всех троих один — `AnnotationForm`, потому что рисует их один примитив, и
 * три копии этого преобразования означали, что новое поле приезжает на экран, но не на бумагу, —
 * ровно так `pieceLineKey` однажды и разошёлся. Координаты остаются decimal-строкой: тот же тип,
 * что на проводе и в БД, круговой рейс без округлений.
 */
export function annotationFromWire(a: common_TechCardAnnotation): AnnotationForm {
  const keys = (a.pieceLineKeys ?? []).filter(Boolean);
  return {
    kind: annotationKindFromWire(a.kind),
    points: (a.points ?? []).map((pt) => ({
      x: decimalToInput(pt.x) || '0',
      y: decimalToInput(pt.y) || '0',
    })),
    text: a.text ?? '',
    labelX: decimalToInput(a.labelX) || '0',
    labelY: decimalToInput(a.labelY) || '0',
    color: annotationColorFromWire(a.color),
    dashed: !!a.dashed,
    filled: !!a.filled,
    pieceLineKey: a.pieceLineKey ?? '',
    // Пустой список читается как [старое поле] — то же правило, что на сервере: карточка,
    // записанная до 0310, несёт только одиночный ключ.
    pieceLineKeys: keys.length ? keys : a.pieceLineKey ? [a.pieceLineKey] : [],
  };
}

/** Детали выноски снимка шага для отправки. */
export const annotationPieceKeysOut = (a: {
  pieceLineKeys?: string[];
  pieceLineKey?: string;
}): string[] => mergeSingleAndList(a.pieceLineKeys, a.pieceLineKey);

/** Детали карточного указания для отправки — те же правила, но имена, а не ключи. */
export const calloutPartsOut = (c: { parts?: string[]; part?: string }): string[] =>
  mergeSingleAndList(c.parts, c.part);

const annotationPointSchema = z.object({
  // Доли кадра, 0..1 — та же система, что у карточных выносок. Строкой, а не числом: тот же
  // decimal, что на проводе, и круговой рейс без округлений.
  x: z.string().default('0'),
  y: z.string().default('0'),
});

const annotationSchema = z.object({
  kind: z.enum(ANNOTATION_KINDS).default('pin'),
  points: z.array(annotationPointSchema).default([]),
  text: z.string().default(''),
  labelX: z.string().default('0'),
  labelY: z.string().default('0'),
  color: z.enum(ANNOTATION_COLORS).default(''),
  // Пунктир вместо сплошной. На чертеже это РАЗНЫЕ указания, а не два оформления одного: сплошная
  // — то, что делают, пунктир — построение, припуск, линия под слоем.
  dashed: z.boolean().default(false),
  // Штриховка области. Только у полигона: у линии заливать нечего, и сервер обнуляет флаг сам.
  filled: z.boolean().default(false),
  // Деталь кроя, о которой указание. Тот же стабильный ключ, которым деталь адресуют вход операции
  // и назначение материала, — не имя: имя переживает переименование хуже, чем ссылка. Пусто =
  // указание не про конкретную деталь (а про узел, шов, посадку).
  //
  // ОДИНОЧНОЕ ПОЛЕ — ЭХО ПЕРВОГО ЭЛЕМЕНТА СПИСКА, и живёт только ради того, что уже записано:
  // колонка выносок это JSON, и в ней лежит `piece`. Пишущий код трогает СПИСОК, читающий берёт
  // список, а к одиночному полю падает только когда списка нет вовсе.
  pieceLineKey: z.string().default(''),
  // Детали, о которых указание. Узел законно собирает несколько сразу («втачать рукав в пройму» —
  // и рукав, и полочка, и спинка), и выбирать из них главную у шва не у кого.
  pieceLineKeys: z.array(z.string()).default([]),
});

const operationMediaSchema = z.object({
  mediaId: z.number().default(0),
  caption: z.string().default(''),
  // Пределы — ЗЕРКАЛА серверных (dto). Без них превышение всплывало бы отказом сохранения ВСЕЙ
  // карточки, и сообщение указывало бы не на тот шаг.
  annotations: z.array(annotationSchema).max(30).default([]),
});

export type OperationMediaForm = z.infer<typeof operationMediaSchema>;
export type AnnotationForm = z.infer<typeof annotationSchema>;
export type CalloutForm = z.infer<typeof calloutSchema>;

const calloutSchema = z.object({
  number: z.number().optional().default(0),
  part: z.string().optional().default(''),
  description: z.string().optional().default(''),
  dimensions: z.string().optional().default(''),
  mediaId: z.number().optional().default(0), // pinned sketch (0 = unanchored)
  posX: z.string().optional().default(''), // carried (v2; normalised 0..1 marker pos)
  posY: z.string().optional().default(''), // carried (v2)
  // ГЕОМЕТРИЯ УКАЗАНИЯ (0309) — тот же словарь видов, что у выносок на снимке шага, потому что
  // ремесло одно: мерка между двумя точками, скобка над участком, дуга по окату. `posX/posY`
  // сохраняют смысл «где стоит нумерованный маркер»; `points` держит якоря фигуры и у пина пуст.
  //
  // Схема объявлена ЗДЕСЬ, а не в annotationSchema: у карточной выноски нет ни своей плашки (её
  // роль играет нумерованный маркер), ни своего текста (он в `description`) — общим типом были бы
  // два поля, которые здесь всегда пусты.
  kind: z.enum(ANNOTATION_KINDS).optional().default('pin'),
  points: z.array(annotationPointSchema).optional().default([]),
  color: z.enum(ANNOTATION_COLORS).optional().default(''),
  // Пунктир и штриховка — те же правила, что у выноски снимка шага. Входят в АТОМАРНУЮ группу
  // присутствия вместе с `kind`: бандл, промолчавший про вид, молчит про всю фигуру, и сервер
  // несёт хранимую дальше целиком.
  dashed: z.boolean().optional().default(false),
  filled: z.boolean().optional().default(false),
  // Детали указания — ИМЕНАМИ, а не ключами: на именах стоит связь «деталь ↔ выноска»
  // (`piece.calloutNumber` сверяется по имени), и второй способ адресовать деталь развёл бы две
  // половины одной связи. `part` — эхо первого элемента.
  parts: z.array(z.string()).optional().default([]),
});

const operationSchema = z.object({
  // THE TWO REQUIRED FIELDS, and the only two — both closed lists. The removed free-text `node`
  // («Node is required») is why: a mandatory field with free input has no right answer, so the
  // operator invents one and no two cards say the same thing the same way.
  operationType: z.string().min(1).default('TECH_CARD_OPERATION_TYPE_UNKNOWN'),
  zone: z.string().min(1).default('TECH_CARD_GARMENT_ZONE_UNKNOWN'),

  // operationNumber is server-assigned ((position+1)*10) — carried read-only, not edited.
  operationNumber: z.number().optional().default(0),
  // Standard minute value, the ONLY time field. The legacy SAM (`timeNorm`) that used to sit beside
  // it is gone: two time inputs with no rule about which to fill guarantee half the cards are timed
  // in the wrong one.
  smv: z.string().optional().default(''),
  calloutNumber: z.number().optional().default(0), // links a sketch callout.number; 0 = none

  // OVERRIDES — '' means INHERIT from the card, and the form must never fill them in from the
  // inherited value. That is exactly what the old operation-type preset did, and it made «the
  // technologist chose 4 st/cm» indistinguishable from «it defaulted to 4».
  seamClass: z.string().optional().default('TECH_CARD_SEAM_CLASS_UNKNOWN'),
  stitchesPerCm: z.string().optional().default(''), // stitches per CENTIMETRE, not part of the mm switch
  seamAllowanceMm: z.string().optional().default(''), // millimetres; '0' is a REAL value, '' is inherit
  topstitchMode: z.string().optional().default('TECH_CARD_TOPSTITCH_MODE_UNKNOWN'),
  topstitchWidthMm: z.string().optional().default(''),
  topstitchRows: z.number().optional().default(0),
  attachmentKind: z.string().optional().default('TECH_CARD_ATTACHMENT_KIND_UNKNOWN'),
  attachmentSizeMm: z.string().optional().default(''),

  // --- «НА ЧЁМ»: the machine block, for operationType = MACHINE (0306) ---------------------------
  //
  // The second axis. `operationType` says what the step does, this says what it does it on — the two
  // used to collide in one enum, which is why the old type list read like a machine catalogue.
  //
  // EVERY FIELD BELOW IS AN OVERRIDE and unset means INHERIT (step → the profile it names → the
  // single profile of its type → card defaults). The form must never fill one in from the inherited
  // value: that is exactly what the removed operation-type preset did, and it made «the technologist
  // chose 4 threads» indistinguishable from «it defaulted to 4». `0` and `_UNKNOWN` ARE the unset
  // states here (the wire has no presence on a bare int32 and every range starts above zero).
  //
  // THE BLOCK BELONGS TO ITS STEP TYPE AND NOWHERE ELSE — the server refuses a thread count on a
  // handwork step by name, refusing the WHOLE card with it. The editor clears hidden controls (TC2);
  // the save mapper gates the block on the type as a belt, so a draft restored from localStorage
  // cannot make a card unsavable with values nobody can see.
  machineType: z.string().optional().default('TECH_CARD_MACHINE_TYPE_UNKNOWN'),
  // Points at ONE profile of the card's park BY KEY, because «the overlock» is not an answer on a
  // card with two. '' = resolve by type (used only when the card holds exactly one of that type).
  machineProfileKey: z.string().optional().default(''),
  threadCount: z.number().optional().default(0),
  needleType: z.string().optional().default('TECH_CARD_NEEDLE_TYPE_UNKNOWN'),
  needleSizeNm: z.number().optional().default(0),
  threadTension: z.string().optional().default('TECH_CARD_THREAD_TENSION_UNKNOWN'),
  threadTensionNote: z.string().optional().default(''),
  stitchWidthMm: z.string().optional().default(''),
  // NO bedType / automation: those are machine identity, not step settings (see machineProfileSchema).

  // --- the ВТО block, for operationType = PRESS / PRESS_OPEN / FUSING ----------------------------
  // Required server-side on those three types once the client declares itself machine-aware, which
  // this one always does: an iron, a fusing press and a steamer are three different instructions.
  pressEquipment: z.string().optional().default('TECH_CARD_PRESS_EQUIPMENT_UNKNOWN'),
  pressProfileKey: z.string().optional().default(''),
  pressTemperatureC: z.number().optional().default(0),
  pressDwellSec: z.number().optional().default(0),
  pressPressureNCm2: z.string().optional().default(''),
  // Three-valued and deliberately without a default — see pressProfileSchema for the whole argument.
  pressSteam: z.boolean().optional(),
  pressCloth: z.string().optional().default('TECH_CARD_PRESS_CLOTH_UNKNOWN'),

  // --- ВИДЫ ОПЕРАЦИЙ (0324): 32 поля девяти новых глаголов и двух новых машинок -----------------
  //
  // ПЛОСКО, А НЕ ВЛОЖЕННО — и это решение, а не удобство. На проводе тут десять блок-сообщений
  // (`stitching`, `hardware`, `print`, …), и парк карточки в этом же файле МИРРОИТ свою проводную
  // вложенность именно ради ошибок: сервер тегирует нарушение полным путём, а applyServerFieldErrors
  // пришпиливает его camelCase-конверсией ЭТОГО пути на контрол — уплощённый park потерял бы
  // контрол и выродился в неатрибутируемый тост. Здесь наоборот: сервер этой волны тегирует
  // нарушения ПЛОСКО — `operations[i].attach_method`, `operations[i].cut_length_mm` (приём взят у
  // topstitch, который форма держит плоско и который поэтому плоско и репортится). Значит плоская
  // форма — это и есть та, чей путь совпадёт с серверным; вложенная промахнулась бы мимо контрола
  // на каждом из 32 полей.
  //
  // ДИСЦИПЛИНА ПУСТОТЫ — та же, что у всей формы: enum → `*_UNKNOWN`, int32 → `0`, decimal → `''`
  // (на проводе `inputToDecimal('')` = undefined, ключ выпадает, колонка остаётся NULL). NULL —
  // это «не указано», а НЕ ноль и НЕ «нет»: явное «нет» везде, где оно есть, — отдельный ответ
  // `NONE` в словаре.
  //
  // ВСЕ ENUM'Ы — `z.string()`, ни одного `z.enum`/`z.nativeEnum`: nativeEnum отверг бы легаси-токен
  // из архивного релизного снапшота и уронил бы чтение целой карточки (довод — equipment-options.ts).
  //
  // Порядок полей — канон §1 плана: S → PL → H → P → W → T → F → C → Q → WP, затем дельта. Тот же
  // порядок держат ALTER, INSERT/SELECT стора и структура entity; разъезд порядка между четырьмя
  // списками и есть тот дефект шва, ради которого канон назначен.

  // S — параметры строчки. Только MACHINE.
  needleCount: z.number().optional().default(0), // 1..12; 0 = не указано
  needleGaugeMm: z.string().optional().default(''), // мм, 1.6..25.4; осмысленно при needleCount >= 2
  seamSecuring: z.string().optional().default('TECH_CARD_SEAM_SECURING_UNKNOWN'),
  rowSpacingMm: z.string().optional().default(''), // мм, 1..30 — между РЯДАМИ строчек
  fullnessRatio: z.string().optional().default(''), // отношение, 0.6..4.0; пусто = посадки нет

  // PL — сколько раз и с каким шагом. MACHINE | HARDWARE_SET | PRINT.
  placementCount: z.number().optional().default(0), // 1..99; 0 = один повтор
  pitchMm: z.string().optional().default(''), // мм, 5..500; осмыслен при placementCount >= 2

  // H — установка фурнитуры. HARDWARE_SET целиком; на MACHINE с явной цикловой машинкой живут
  // только holePrep / reinforcement / cycleStitchCount.
  attachMethod: z.string().optional().default('TECH_CARD_HARDWARE_ATTACH_METHOD_UNKNOWN'),
  holePrep: z.string().optional().default('TECH_CARD_HOLE_PREP_UNKNOWN'),
  reinforcement: z.string().optional().default('TECH_CARD_REINFORCEMENT_UNKNOWN'),
  foldbackMm: z.string().optional().default(''), // мм, 10..80; только attachMethod = THREADED
  cycleStitchCount: z.number().optional().default(0), // 8..64; 0 = штатная программа машины

  // P — печать и нанесение. Только PRINT. МЕТОД лежит полем шага, а не внутри блока: он REQUIRED,
  // а обязательное поле не прячут в необязательное сообщение, которого может не быть вовсе.
  printMethod: z.string().optional().default('TECH_CARD_PRINT_METHOD_UNKNOWN'),
  peelMode: z.string().optional().default('TECH_CARD_PEEL_MODE_UNKNOWN'),
  secondPressSec: z.number().optional().default(0), // сек, 1..30; 0 = второго прижима нет
  pressureScale: z.string().optional().default('TECH_CARD_PRESSURE_SCALE_UNKNOWN'),

  // W — сварка и проклейка. MACHINE + ЯВНЫЙ seam_taping | ultrasonic_welder.
  airTemperatureC: z.number().optional().default(0), // °C, 100..750; только seam_taping
  feedSpeedMMin: z.string().optional().default(''), // м/мин, 0.3..10.0

  // T — подрезка и выправка. Только TRIM.
  trimAction: z.string().optional().default('TECH_CARD_TRIM_ACTION_UNKNOWN'),
  residualAllowanceMm: z.string().optional().default(''), // мм, 1..10 — сколько ОСТАЁТСЯ

  // F — чистка концов ниток. Только THREAD_TRIM.
  residualTailMaxMm: z.string().optional().default(''), // мм, 1..10; пусто = стандарт цеха

  // G — ВТО (0325): под-глагол и направление припуска. НЕ дискриминаторы — не required ни на
  // одном глаголе: строка PRESS, записанная до этой волны, обязана читаться и сохраняться как
  // есть, и обязательность здесь перекрыла бы кислород каждой существующей карточке задним
  // числом. Направление законно ТОЛЬКО при `to_one_side` и там обязательно — обязательность,
  // которая ретроактивной стать не может: значения `to_one_side` ни одна сохранённая строка не
  // имеет. Оба правила зеркалятся ниже, в superRefine.
  pressAction: z.string().optional().default('TECH_CARD_PRESS_ACTION_UNKNOWN'),
  pressToward: z.string().optional().default('TECH_CARD_PRESS_TOWARD_UNKNOWN'),

  // C / Q / WP — чистка, контроль, мокрая обработка: у каждого один факт, он же дискриминатор.
  cleaningKind: z.string().optional().default('TECH_CARD_CLEANING_KIND_UNKNOWN'),
  coverageMode: z.string().optional().default('TECH_CARD_INSPECT_COVERAGE_UNKNOWN'),
  wetProcessKind: z.string().optional().default('TECH_CARD_WET_PROCESS_KIND_UNKNOWN'),

  // FA — петли, закрепки, пуговицы, молнии. Только MACHINE, и каждое поле — при СВОЁМ явном типе
  // машины. REQUIRED тут нет ни одного: эти глаголы и машинки живут в проде годами, и карточка
  // «MACHINE + buttonhole» без единого нового поля обязана сохраняться как есть.
  buttonholeStyle: z.string().optional().default('TECH_CARD_BUTTONHOLE_STYLE_UNKNOWN'),
  cutLengthMm: z.string().optional().default(''), // мм, 4..120 — прорезь петли
  buttonholeOrientation: z.string().optional().default('TECH_CARD_BUTTONHOLE_ORIENTATION_UNKNOWN'),
  bartackLengthMm: z.string().optional().default(''), // мм, 1..40
  attachPattern: z.string().optional().default('TECH_CARD_BUTTON_ATTACH_PATTERN_UNKNOWN'),
  zipperApplication: z.string().optional().default('TECH_CARD_ZIPPER_APPLICATION_UNKNOWN'),

  // S14 / S17 — дельта, живёт в блоке строчки: бейка при явном binding_taping, шов этикетки при
  // любом MACHINE.
  bindingStyle: z.string().optional().default('TECH_CARD_BINDING_STYLE_UNKNOWN'),
  labelAttachStitch: z.string().optional().default('TECH_CARD_LABEL_ATTACH_STITCH_UNKNOWN'),

  // The only free text on a step. `description` merged into it: two boxes side by side with no rule
  // about which was which guaranteed two cards would fill them the opposite way round.
  note: z.string().optional().default(''),

  // ЕДИНЫЙ упорядоченный список входов шага: каждый ключ — либо TechCardPiece.line_key (деталь),
  // либо output_unit_key более раннего шага (узел). Одно поле, а не два параллельных массива:
  // два useFieldArray на одно имя не синхронизируются, и рассинхрон двух списков — ровно тот
  // класс бага, который здесь уже ловили.
  //
  // Классификация «деталь или узел» НЕ хранится в форме: она выводится сравнением с line_key
  // деталей карточки — той же функцией, что на сервере (assembly-frontier). Хранить её значило
  // бы завести второй источник истины, который разъедется с первым при удалении детали.
  inputKeys: z.array(z.string()).default([]),
  // Код узла, который производит шаг («SHELL»). Пусто = шаг ничего не собирает: это обработка,
  // её входы остаются доступными следующим шагам.
  outputUnitKey: z.string().optional().default(''),
  // Имя узла. Живёт на первом производящем шаге; поглощающие могут не повторять.
  outputUnitName: z.string().optional().default(''),
  // The off-part materials this operation consumes (thread, fusing). The legacy single bomLineKey
  // went with the break — the chip row was always the real answer.
  bomLineKeys: z.array(z.string()).default([]),
  // Фотографии ЭТОГО шага с выносками поверх них. Операционные, а не карточные: указание
  // «здесь припосадить 6 мм» относится к шагу, и адресовать его номером карточной выноски
  // значило бы завести ссылку, которая рвётся при пересортировке шагов.
  media: z.array(operationMediaSchema).max(10).default([]),
})
  // The two required fields are checked HERE as well as on the server, and the wording is the same
  // on both sides. Without this the operator learns that a step needs a zone only after a failed
  // save of the whole card — which is precisely the shape of feedback that made the old mandatory
  // `node` feel arbitrary.
  .superRefine((o, ctx) => {
    if (!o.operationType || o.operationType === 'TECH_CARD_OPERATION_TYPE_UNKNOWN') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['operationType'],
        message: 'pick what the step does — it names the step and drives its defaults',
      });
    }
    if (!o.zone || o.zone === 'TECH_CARD_GARMENT_ZONE_UNKNOWN') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['zone'],
        message: 'pick where on the garment — «other» is a legitimate answer',
      });
    }
    // A width beside «in the ditch» is a shadow value the server refuses; catching it here keeps
    // the refusal next to the control that caused it. BOTH halves ask TOPSTITCH_MODES rather than
    // compare against a member by name: a refusal written as «≠ PARALLEL» blocks the whole card
    // over a mode this bundle simply has not learnt yet, and a step nobody can save is worse than a
    // width nobody validated.
    if (topstitchModeRefusesWidth(o.topstitchMode) && (o.topstitchWidthMm ?? '').trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['topstitchWidthMm'],
        message:
          'this topstitch mode is measured from no line — clear the distance, or switch to a mode that has one',
      });
    }
    // AND THE REFUSAL NAMES THE LINE, from the same map as the caption above the input. «needs the
    // width» left the technologist to guess which of the two lines the missing number belongs to,
    // and the caption right beside it had just been changed to say so — a refusal that words the
    // field differently from its own label is the defect again, one layer down.
    //
    // ТРЕБУЕТ, А НЕ ПРОСТО ПРИНИМАЕТ: у «at the edge» число НЕОБЯЗАТЕЛЬНО — пустое поле значит
    // «вплотную к краю», и сервер его как раз принимает. Форма, требующая число там, где сервер
    // его не требует, спорит с сервером, а спорить с ним она права не имеет.
    if (topstitchModeNeedsWidth(o.topstitchMode) && !(o.topstitchWidthMm ?? '').trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['topstitchWidthMm'],
        message: `a topstitch measured from ${topstitchDatumOf(o.topstitchMode)} needs that distance in mm`,
      });
    }
    // «NONE» counts as no attachment here for the same reason UNKNOWN does, and it is server parity
    // (dto refuses the pair by name): a binder size printed next to «runs bare» measures a tool the
    // step has just said it does not use.
    if (
      (o.attachmentSizeMm ?? '').trim() &&
      (!o.attachmentKind ||
        o.attachmentKind === 'TECH_CARD_ATTACHMENT_KIND_UNKNOWN' ||
        o.attachmentKind === 'TECH_CARD_ATTACHMENT_KIND_NONE')
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['attachmentSizeMm'],
        message: 'pick the attachment first — a size on its own describes no tool',
      });
    }
    // The step's override answers the same question as the card default it overrides, so it takes
    // the same band. The step's own column predates the break and its CHECK is only `>= 0`, which
    // would have let a step hold a density the card is not allowed to default to.
    refineStitchDensity(o.stitchesPerCm, ctx, ['stitchesPerCm']);

    // --- «на чём» is REQUIRED, on both axes (0306) ----------------------------------------------
    //
    // The server demands these two the moment a client declares itself machine-aware, which this one
    // always does (machineFieldsAware is sent on every save) — so without the checks here the card
    // would simply refuse to save with a violation from the server, on the whole card, for a select
    // three tabs away. «MACHINE» on its own is not an instruction: it says a machine is involved and
    // nothing about which of the twenty-five, and the printed sheet would carry that blank to the
    // floor. Same for ВТО: an iron, a fusing press and a steamer are three different instructions.
    if (
      o.operationType === 'TECH_CARD_OPERATION_TYPE_MACHINE' &&
      (!o.machineType || o.machineType === 'TECH_CARD_MACHINE_TYPE_UNKNOWN')
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['machineType'],
        message:
          'pick the machine — «machine» says what the step does, the machine says what it does it on',
      });
    }
    const isPressStep =
      o.operationType === 'TECH_CARD_OPERATION_TYPE_PRESS' ||
      o.operationType === 'TECH_CARD_OPERATION_TYPE_PRESS_OPEN' ||
      o.operationType === 'TECH_CARD_OPERATION_TYPE_FUSING';
    if (
      isPressStep &&
      (!o.pressEquipment || o.pressEquipment === 'TECH_CARD_PRESS_EQUIPMENT_UNKNOWN')
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['pressEquipment'],
        message:
          'pick the equipment — an iron, a fusing press and a steamer are three different instructions',
      });
    }
    // The bands. Checked whatever the step type is: the save mapper drops the block that does not
    // belong to the type, but a value left over in form state has to be reported on ITS OWN control
    // rather than dropped silently while the operator watches the number sit there.
    refineRangedInt(o.threadCount, EQUIPMENT_INT_BANDS.threadCount, ctx, ['threadCount']);
    refineRangedInt(o.needleSizeNm, EQUIPMENT_INT_BANDS.needleSizeNm, ctx, ['needleSizeNm']);
    refineRangedDecimal(o.stitchWidthMm, STITCH_WIDTH_BAND, ctx, ['stitchWidthMm']);
    refineThreadTensionNote(o.threadTension, o.threadTensionNote, ctx, ['threadTensionNote']);
    refineRangedInt(o.pressTemperatureC, EQUIPMENT_INT_BANDS.pressTemperatureC, ctx, [
      'pressTemperatureC',
    ]);
    refineRangedInt(o.pressDwellSec, EQUIPMENT_INT_BANDS.pressDwellSec, ctx, ['pressDwellSec']);
    refineRangedDecimal(o.pressPressureNCm2, PRESS_PRESSURE_BAND, ctx, ['pressPressureNCm2']);

    // --- ВИДЫ ОПЕРАЦИЙ (0324): зеркало серверной валидации ---------------------------------------
    //
    // Зеркалится ровно то, что сервер отвергает ПО ИМЕНИ, и зеркалится ЗДЕСЬ, а не в маппере,
    // потому что отказ обязан встать у контрола: сервер отказывает ВСЕЙ карточкой, и без этих
    // проверок оператор узнавал бы про пустой дискриминатор после неудачного сохранения шести
    // вкладок, из тоста, который не говорит, какой из тридцати шагов виноват.
    const stepIsMachine = isMachineStepType(o.operationType);
    const stepMachineType = o.machineType ?? '';

    // ШЕСТЬ ДИСКРИМИНАТОРОВ, БЕЗУСЛОВНО. Никакого aware-флага у них нет и не нужно: обязательность
    // объявляет САМ ГЛАГОЛ, а старый бандл нового глагола физически не пришлёт — токена нет в его
    // словаре. Глагол без дискриминатора — заголовок, а не инструкция: «печать» не говорит,
    // шелкография это или гравировка, «контроль» — сплошной он или по выборке.
    const requireDiscriminator = (
      type: string,
      value: string | undefined,
      field: string,
      message: string,
    ) => {
      if (o.operationType !== type || stepEnumSet(value)) return;
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: [field], message });
    };
    requireDiscriminator(
      'TECH_CARD_OPERATION_TYPE_HARDWARE_SET',
      o.attachMethod,
      'attachMethod',
      'say how the hardware is set — sewn, clinched, pressed, crimped and threaded are five different jobs',
    );
    requireDiscriminator(
      'TECH_CARD_OPERATION_TYPE_PRINT',
      o.printMethod,
      'printMethod',
      'pick the print method — screen, DTF, transfer, foil and engraving share nothing but the verb',
    );
    requireDiscriminator(
      'TECH_CARD_OPERATION_TYPE_TRIM',
      o.trimAction,
      'trimAction',
      'say what the trim does — grading, clipping and notching are different cuts, not one',
    );
    requireDiscriminator(
      'TECH_CARD_OPERATION_TYPE_CLEAN',
      o.cleaningKind,
      'cleaningKind',
      'say what is being cleaned off — a spot, lint, chalk and adhesive need different hands',
    );
    requireDiscriminator(
      'TECH_CARD_OPERATION_TYPE_INSPECT',
      o.coverageMode,
      'coverageMode',
      'say how much is inspected — every unit, a sample per bundle, an AQL plan or the first output',
    );
    requireDiscriminator(
      'TECH_CARD_OPERATION_TYPE_WET_PROCESS',
      o.wetProcessKind,
      'wetProcessKind',
      'pick the wet process — a rinse, an enzyme wash, a garment dye and a softener are four baths',
    );

    // НАПРАВЛЕНИЕ ПРИПУСКА — ТОЛЬКО У «ЗАУТЮЖИТЬ», И ТАМ ОБЯЗАТЕЛЬНО (0325). Сервер проверяет обе
    // половины, и клиент обязан согласиться с обеими: без первой отказ пришёл бы ТОСТОМ после
    // сохранения шести вкладок, вместо того чтобы встать на контроле, который его чинит, — а без
    // второй форма отправила бы направление на приёме, где сервер отвергает его по имени, и
    // отказала бы вся карточка. Ровно та дыра, ради которой волна и заводилась: подпись обещала
    // «press to one side», а сказать, на какую сторону, было нечем.
    const pressToOneSide = o.pressAction === 'TECH_CARD_PRESS_ACTION_TO_ONE_SIDE';
    if (pressToOneSide && !stepEnumSet(o.pressToward)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['pressToward'],
        message:
          'say which way the allowance goes — «to one side» without the side is not an instruction',
      });
    }
    if (!pressToOneSide && stepEnumSet(o.pressToward)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['pressToward'],
        message:
          'only «press to one side» lays the allowance anywhere — clear the direction, or switch the action',
      });
    }

    // ПРИМЕНИМОСТЬ ПО ЯВНОМУ ТИПУ МАШИНЫ. «Явный» — названный НА ШАГЕ: тип, разрешённый через
    // `machineProfileKey`, не засчитывается ни здесь, ни на сервере, и это не придирка — профиль
    // можно перенаправить на другую машинку, не тронув ни одного шага, и правило, стоящее на
    // разрешённой лестнице, поменяло бы смысл сохранённых карточек задним числом.
    //
    // Гейт ГЛАГОЛА при этом остаётся у маппера (STEP_TYPE_BLOCKS): на чужом глаголе блок не
    // рисуется и на провод не едет, поэтому отказ здесь встал бы у контрола, которого нет на
    // экране, — и карточку стало бы нечем спасти.
    const needsMachineType = (
      filled: boolean,
      allowed: readonly string[],
      field: string,
      message: string,
    ) => {
      if (!stepIsMachine || !filled || allowed.includes(stepMachineType)) return;
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: [field], message });
    };
    const BUTTONHOLE = ['TECH_CARD_MACHINE_TYPE_BUTTONHOLE'] as const;
    needsMachineType(
      stepEnumSet(o.buttonholeStyle),
      BUTTONHOLE,
      'buttonholeStyle',
      'a buttonhole shape is a buttonhole machine setting — name that machine on the step, or clear it',
    );
    needsMachineType(
      stepTextSet(o.cutLengthMm),
      BUTTONHOLE,
      'cutLengthMm',
      'a buttonhole cut is a buttonhole machine setting — name that machine on the step, or clear it',
    );
    needsMachineType(
      stepEnumSet(o.buttonholeOrientation),
      BUTTONHOLE,
      'buttonholeOrientation',
      'a buttonhole direction is a buttonhole machine setting — name that machine on the step, or clear it',
    );
    needsMachineType(
      stepTextSet(o.bartackLengthMm),
      ['TECH_CARD_MACHINE_TYPE_BUTTONHOLE', 'TECH_CARD_MACHINE_TYPE_BARTACK'],
      'bartackLengthMm',
      'a bartack length belongs to a bartack or a buttonhole machine — name one on the step, or clear it',
    );
    needsMachineType(
      stepEnumSet(o.attachPattern),
      ['TECH_CARD_MACHINE_TYPE_BUTTON_ATTACH'],
      'attachPattern',
      'a button pattern is a button-attach machine setting — name that machine on the step, or clear it',
    );
    needsMachineType(
      stepEnumSet(o.zipperApplication),
      ['TECH_CARD_MACHINE_TYPE_ZIPPER_SETTING'],
      'zipperApplication',
      'a zipper application is a zipper-setting machine setting — name that machine on the step, or clear it',
    );
    needsMachineType(
      stepEnumSet(o.bindingStyle),
      ['TECH_CARD_MACHINE_TYPE_BINDING_TAPING'],
      'bindingStyle',
      'how the binding is folded is a binder setting — name the binding machine on the step, or clear it',
    );
    // Горячий воздух есть ТОЛЬКО у проклейки шва: ультразвук греет сам материал, воздуха у него нет.
    needsMachineType(
      !!o.airTemperatureC,
      ['TECH_CARD_MACHINE_TYPE_SEAM_TAPING'],
      'airTemperatureC',
      'hot air belongs to seam taping — an ultrasonic welder has none; name the machine, or clear it',
    );
    needsMachineType(
      stepTextSet(o.feedSpeedMMin),
      ['TECH_CARD_MACHINE_TYPE_SEAM_TAPING', 'TECH_CARD_MACHINE_TYPE_ULTRASONIC_WELDER'],
      'feedSpeedMMin',
      'a feed speed belongs to a welding machine — name seam taping or the ultrasonic welder, or clear it',
    );

    // ГРАВИРОВКА — МЕТОД БЕЗ НОСИТЕЛЯ И БЕЗ ПРИЖИМА. Лазер снимает материал сам: снимать нечего,
    // прижимать нечем, и сервер отвергает все три поля по имени.
    if (o.printMethod === 'TECH_CARD_PRINT_METHOD_LASER_ENGRAVE') {
      const refuseAtLaser = (filled: boolean, field: string, message: string) => {
        if (!filled) return;
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: [field], message });
      };
      refuseAtLaser(
        stepEnumSet(o.peelMode),
        'peelMode',
        'engraving has no carrier to peel — clear it, or pick another print method',
      );
      refuseAtLaser(
        !!o.secondPressSec,
        'secondPressSec',
        'engraving is not pressed — clear the second press, or pick another print method',
      );
      refuseAtLaser(
        stepEnumSet(o.pressureScale),
        'pressureScale',
        'engraving is not pressed — clear the pressure, or pick another print method',
      );
      // И ВЕСЬ ВТО-БЛОК ЦЕЛИКОМ (F2-FINAL §5.4, правило 5). Термопресс печать берёт взаймы — но
      // только та, у которой есть носитель: лазер выжигает материал сам, плиты у него нет, и семь
      // ВТО-полей сервер на этом методе отвергает ПО ИМЕНИ, отказывая вместе с ними всей карточке.
      // Отказ стоит на КАЖДОМ поле отдельно, а не на блоке, потому что чинить его оператор будет
      // на контроле, где стоит число.
      const pressAtLaser =
        'engraving has no platen — clear the pressing settings, or pick another print method';
      refuseAtLaser(stepEnumSet(o.pressEquipment), 'pressEquipment', pressAtLaser);
      refuseAtLaser(stepTextSet(o.pressProfileKey), 'pressProfileKey', pressAtLaser);
      refuseAtLaser(!!o.pressTemperatureC, 'pressTemperatureC', pressAtLaser);
      refuseAtLaser(!!o.pressDwellSec, 'pressDwellSec', pressAtLaser);
      refuseAtLaser(stepTextSet(o.pressPressureNCm2), 'pressPressureNCm2', pressAtLaser);
      // Проставленный `false` — это сказанное «без пара», а не пустота: его тоже отвергают.
      refuseAtLaser(o.pressSteam !== undefined, 'pressSteam', pressAtLaser);
      refuseAtLaser(stepEnumSet(o.pressCloth), 'pressCloth', pressAtLaser);
    }

    // СВАРКА СОЕДИНЯЕТ ТЕПЛОМ, А НЕ НИТКОЙ. У проклейки шва и ультразвука нет ни иглы, ни нитки —
    // ниточно-игольные overrides шага сервер на них отвергает, и печатать «игла Nm 90» рядом с
    // «ультразвук» значило бы отправить в цех настройку несуществующего узла.
    if (stepIsMachine && isWeldMachineType(stepMachineType)) {
      const refuseAtWeld = (filled: boolean, field: string, what: string) => {
        if (!filled) return;
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [field],
          message: `a welding machine has no ${what} — clear it, or pick a sewing machine`,
        });
      };
      refuseAtWeld(!!o.threadCount, 'threadCount', 'thread');
      refuseAtWeld(stepEnumSet(o.needleType), 'needleType', 'needle');
      refuseAtWeld(!!o.needleSizeNm, 'needleSizeNm', 'needle');
      refuseAtWeld(stepEnumSet(o.threadTension), 'threadTension', 'thread to tension');
      // ЗАМЕТКА О НАТЯЖЕНИИ — ШЕСТОЙ ЧЛЕН ТОГО ЖЕ СПИСКА У СЕРВЕРА, и стоит она на его месте:
      // между шкалой и шириной стежка. Без неё пара «шкала + заметка» отвергалась наполовину —
      // шкалу называл zod на контроле, а заметку сервер тостом после сохранения шести вкладок.
      // ОТКАЗ ПОПАДАЕТ НА ВИДИМЫЙ КОНТРОЛ: поле рисуется по «шкала задана ИЛИ текст непуст», то
      // есть непустая заметка на экране есть ВСЕГДА — ровно тогда же, когда её и отвергают.
      refuseAtWeld(stepTextSet(o.threadTensionNote), 'threadTensionNote', 'thread to tension');
      refuseAtWeld(stepTextSet(o.stitchWidthMm), 'stitchWidthMm', 'stitch');
      // И ЧЕТВЁРКА S-БЛОКА — ПО ТОМУ ЖЕ ПРАВИЛУ И ТЕМ ЖЕ СПИСКОМ, ЧТО У СЕРВЕРА. Собственный гейт
      // семейства — «это машинный шаг», а сварочная машина машинная: без этих четырёх строк на
      // безыгольном шаге сохранялись бы «4 иглы с шагом 3.2 мм и закрепка», и отказ приходил бы
      // ТОСТОМ с сервера после сохранения шести вкладок вместо контрола, который его чинит.
      //
      // КАЛИБР ПЕРЕД ЧИСЛОМ ИГЛ — порядок сервера, повторённый нарочно: одиночный калибр до этого
      // правила не доходит вовсе (его раньше отвергает правило «сначала скажи, сколько игл»), и при
      // обратном порядке отказ на законной паре «2 иглы + калибр» калибр бы никогда не назвал.
      //
      // `fullnessRatio` СЮДА НЕ ВХОДИТ: сервер разрешает посадку на сварке сознательно — это
      // соотношение длин слоёв при подаче, свойство подачи, а не иглы.
      refuseAtWeld(stepTextSet(o.needleGaugeMm), 'needleGaugeMm', 'needle');
      refuseAtWeld(!!o.needleCount, 'needleCount', 'needle');
      refuseAtWeld(stepEnumSet(o.seamSecuring), 'seamSecuring', 'stitch to secure');
      refuseAtWeld(stepTextSet(o.rowSpacingMm), 'rowSpacingMm', 'row of stitching');
    }

    // ЧЕТЫРЕ ДВУХ-ПОЛЕВЫХ ПРАВИЛА. В БД их нет и быть не может — двухколоночный CHECK это урок
    // 3819, — поэтому единственные два места, где они живут, это Go и эта функция.
    if (stepTextSet(o.needleGaugeMm) && (o.needleCount ?? 0) < 2) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['needleGaugeMm'],
        message: 'a gauge measures the distance BETWEEN needles — say how many there are first (2+)',
      });
    }
    if (stepTextSet(o.pitchMm) && (o.placementCount ?? 0) < 2) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['pitchMm'],
        message: 'a pitch measures the gap BETWEEN repeats — say how many there are first (2+)',
      });
    }
    if (
      stepTextSet(o.foldbackMm) &&
      o.attachMethod !== 'TECH_CARD_HARDWARE_ATTACH_METHOD_THREADED'
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['foldbackMm'],
        message: 'only threaded hardware has webbing folded back through it — clear it, or switch the method',
      });
    }
    // Четвёртое (`airTemperatureC` ⇒ явный seam_taping) записано выше, вместе с остальными
    // правилами явного типа машины: оно и есть одно из них, и разводить его на два места значило
    // бы получить два ответа на один вопрос.

    // БАНДЫ — как и у блоков 0306, БЕЗ ОГЛЯДКИ НА ГЛАГОЛ: маппер отбросит чужое семейство сам, а
    // число, оставшееся в состоянии формы, обязано быть названо на СВОЁМ контроле, а не тихо
    // выброшено, пока оператор смотрит на него.
    refineRangedInt(o.needleCount, STEP_KIND_INT_BANDS.needleCount, ctx, ['needleCount']);
    refineRangedInt(o.placementCount, STEP_KIND_INT_BANDS.placementCount, ctx, ['placementCount']);
    refineRangedInt(o.cycleStitchCount, STEP_KIND_INT_BANDS.cycleStitchCount, ctx, [
      'cycleStitchCount',
    ]);
    refineRangedInt(o.secondPressSec, STEP_KIND_INT_BANDS.secondPressSec, ctx, ['secondPressSec']);
    refineRangedInt(o.airTemperatureC, STEP_KIND_INT_BANDS.airTemperatureC, ctx, [
      'airTemperatureC',
    ]);
    refineRangedDecimal(o.needleGaugeMm, STEP_KIND_DECIMAL_BANDS.needleGaugeMm, ctx, [
      'needleGaugeMm',
    ]);
    refineRangedDecimal(o.rowSpacingMm, STEP_KIND_DECIMAL_BANDS.rowSpacingMm, ctx, ['rowSpacingMm']);
    refineRangedDecimal(o.fullnessRatio, STEP_KIND_DECIMAL_BANDS.fullnessRatio, ctx, [
      'fullnessRatio',
    ]);
    refineRangedDecimal(o.pitchMm, STEP_KIND_DECIMAL_BANDS.pitchMm, ctx, ['pitchMm']);
    refineRangedDecimal(o.foldbackMm, STEP_KIND_DECIMAL_BANDS.foldbackMm, ctx, ['foldbackMm']);
    refineRangedDecimal(o.feedSpeedMMin, STEP_KIND_DECIMAL_BANDS.feedSpeedMMin, ctx, [
      'feedSpeedMMin',
    ]);
    refineRangedDecimal(o.residualAllowanceMm, STEP_KIND_DECIMAL_BANDS.residualAllowanceMm, ctx, [
      'residualAllowanceMm',
    ]);
    refineRangedDecimal(o.residualTailMaxMm, STEP_KIND_DECIMAL_BANDS.residualTailMaxMm, ctx, [
      'residualTailMaxMm',
    ]);
    refineRangedDecimal(o.cutLengthMm, STEP_KIND_DECIMAL_BANDS.cutLengthMm, ctx, ['cutLengthMm']);
    refineRangedDecimal(o.bartackLengthMm, STEP_KIND_DECIMAL_BANDS.bartackLengthMm, ctx, [
      'bartackLengthMm',
    ]);
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
  defaultSeamClass: 'TECH_CARD_SEAM_CLASS_UNKNOWN',
  defaultStitchesPerCm: '',
  hemFinish: '',
  notes: '',
  equipmentDefaults: { machines: [], presses: [] },
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
  requiredSeamAllowanceMm: z.string().optional().default(''),
  // The design intent in prose — what this style IS, before any construction detail. Printed at
  // the head of the tech pack's description sheet, above the details and the notes.
  concept: z.string().optional().default(''),
  notes: z.string().optional().default(''),
  // children
  sizeIds: z.array(z.number()).default([]),
  // NO sizeQuantities. Типовой калькуляционный тираж («size run») удалён из формы целиком:
  // себестоимость стиля считается по норме БАЗОВОГО размера, а реальный тираж живёт на прогоне
  // (production_run) — своя сетка колорвей × размер на каждую партию. Поле не читается, не
  // редактируется и НЕ ОТПРАВЛЯЕТСЯ (см. mapFormToTechCardInsert).
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
  // НАМЕРЕНИЕ снять разметку узлов целиком. Не свойство карточки, а свойство ОДНОГО сохранения:
  // сервер без него отклоняет осведомлённую запись, которая не несёт ни одного узла против
  // карточки, которая их несёт, — иначе параллельная вкладка или восстановленный черновик
  // стирали бы самый дорогой ручной ввод молча. Ставит только кнопка «снять разметку узлов».
  assemblyCleared: z.boolean().default(false),
  // НАМЕРЕНИЕ снять ВСЕ фотографии шагов. Той же породы, что assemblyCleared, и по той же
  // причине: операции пишутся полной заменой, и без объявленного намерения сервер отклоняет
  // осведомлённую пустоту против карточки, у которой снимки есть, — иначе отставшая вкладка
  // стирала бы десятки выносок молча. Ставит только кнопка «снять фотографии шагов».
  mediaCleared: z.boolean().default(false),
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
      message: 'season not recognised — SS25 / FW26 / PF26 / Resort 25 (Holiday is not supported)',
      path: ['season'],
    });
  }
  // ТРЕБУЕМЫЙ ПРИПУСК (Ф3.2). The server answers an out-of-band value with a bare CHECK-constraint
  // refusal that names a column and not a field, and it refuses the WHOLE card save with it — every
  // other tab's work bounces along with the one mistyped number. So the band is checked here, where
  // the sentence can name the mistake, and a BLANK value is deliberately allowed through: an empty
  // field is «эталона у карточки нет, берём цеховой», not a missing required value.
  const seamAllowanceError = validateSeamAllowanceStandard(data.requiredSeamAllowanceMm);
  if (seamAllowanceError) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: seamAllowanceError,
      path: ['requiredSeamAllowanceMm'],
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
        `block “${block}” is already matched to piece “${nameOf(prev.piece)}” under this same purpose — ` +
        `the server won't accept two cut pieces on one block and will reject the save of the whole card. ` +
        `open “cut pieces” on the PATTERNS tab and leave one link ` +
        `(“${nameOf(prev.piece)}” and “${nameOf(piece)}” are the two in conflict right now).`,
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
  requiredSeamAllowanceMm: '',
  concept: '',
  notes: '',
  sizeIds: [],
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
  assemblyCleared: false,
  mediaCleared: false,
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
    kind: b.kind || UNSET_KIND,
    kindNote: b.kindNote || '',
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
    // Провенанс — ДОСЛОВНО, включая undefined: «сервер не сказал» и «сказал manual» — разные
    // утверждения, и различие доезжает до записи (см. пару в mapFormToTechCardInsert). '' не
    // нормализуется в 'manual': бейджу хватает точного сравнения с 'lays', а самодеятельная
    // нормализация здесь однажды разошлась бы со спеллингом сервера.
    wastageSource: b.wastageSource,
    wastageLayCount: b.wastageLayCount,
    // `?? undefined` — не косметика: незаполненный Timestamp приезжает с гейтвея ЯВНЫМ null
    // (EmitUnpopulated маршалит пустой message как null, в отличие от proto3-optional пары выше,
    // которая просто отсутствует). Форма держит «штампа нет» одним значением — undefined.
    wastageAppliedAt: b.wastageAppliedAt ?? undefined,
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
    requiredSeamAllowanceMm: decimalToInput(insert?.requiredSeamAllowanceMm),
    concept: insert?.concept || '',
    notes: insert?.notes || '',
    sizeIds: insert?.sizeIds ?? [],
    // size_quantities НЕ читается в форму — типовой тираж больше не существует как понятие в UI.
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
      // Вид приезжает ВСЕГДА (сервер отдаёт присутствующее поле), но `annotationKindFromWire`
      // всё равно падает в пин на неизвестном значении: карточка, записанная до 0309, обязана
      // прочитаться тем, чем была.
      kind: annotationKindFromWire(c.kind),
      points: (c.points ?? []).map((pt) => ({
        x: decimalToInput(pt.x) || '0',
        y: decimalToInput(pt.y) || '0',
      })),
      color: annotationColorFromWire(c.color),
      dashed: !!c.dashed,
      filled: !!c.filled,
      // Список приходит с сервера всегда непустым, если деталь есть вовсе (он собирает его из
      // `part` у карточек, записанных до 0310). Фолбэк здесь — на случай ответа старого сервера.
      parts: (c.parts ?? []).filter(Boolean).length
        ? (c.parts ?? []).filter(Boolean)
        : c.part
          ? [c.part]
          : [],
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
      // Круглый рейс, как у cutSymmetry рядом: сервер отдаёт поле на чтении всегда, карточка,
      // сохранённая до 0302, приезжает без него — оба случая сходятся в «не помечена».
      ungraded: p.ungraded ?? false,
      grainline: p.grainline || '',
      fused: p.fused ?? false,
      // Круглый рейс, как у cutSymmetry и ungraded рядом: сервер отдаёт режим на чтении ВСЕГДА,
      // карточка, сохранённая до 0304, приезжает без него — оба случая сходятся в «не размечено».
      fusingMode: p.fusingMode || UNSET_FUSING_MODE,
      fusingWidthMm: p.fusingWidthMm?.value ?? '',
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
          defaultSeamClass:
            insert.construction.defaultSeamClass || 'TECH_CARD_SEAM_CLASS_UNKNOWN',
          defaultStitchesPerCm: decimalToInput(insert.construction.defaultStitchesPerCm),
          hemFinish: insert.construction.hemFinish || '',
          notes: insert.construction.notes || '',
          // THE PARK, read verbatim. The server always emits the wrapper (even for a card with no
          // profiles) so the lists below are the authoritative stored set; the `?? []` covers a
          // draft restored from a localStorage snapshot taken by a bundle that predates it.
          //
          // Keys are kept EXACTLY as stored and never re-minted: the key is what every step's
          // machineProfileKey / pressProfileKey points at, so re-minting one on read would detach
          // every reference on the very next save. (Same rule, same reason, as a BOM lineKey.)
          equipmentDefaults: {
            machines: (insert.construction.equipmentDefaults?.machines ?? []).map((m) => ({
              profileKey: m.profileKey ?? '',
              label: m.label ?? '',
              machineType: m.machineType || 'TECH_CARD_MACHINE_TYPE_UNKNOWN',
              threadCount: m.threadCount || 0,
              needleType: m.needleType || 'TECH_CARD_NEEDLE_TYPE_UNKNOWN',
              needleSizeNm: m.needleSizeNm || 0,
              bedType: m.bedType || 'TECH_CARD_BED_TYPE_UNKNOWN',
              automation: m.automation || 'TECH_CARD_AUTOMATION_LEVEL_UNKNOWN',
              threadTension: m.threadTension || 'TECH_CARD_THREAD_TENSION_UNKNOWN',
              threadTensionNote: m.threadTensionNote ?? '',
              attachmentKind: m.attachmentKind || 'TECH_CARD_ATTACHMENT_KIND_UNKNOWN',
              // decimalToInput, not `|| ''`: an unset google.type.Decimal arrives as an explicit
              // null (the gateway marshals with EmitUnpopulated) — `d?.value ?? ''` absorbs it.
              stitchesPerCm: decimalToInput(m.stitchesPerCm),
              stitchWidthMm: decimalToInput(m.stitchWidthMm),
              note: m.note ?? '',
            })),
            presses: (insert.construction.equipmentDefaults?.presses ?? []).map((p) => ({
              profileKey: p.profileKey ?? '',
              label: p.label ?? '',
              pressEquipment: p.pressEquipment || 'TECH_CARD_PRESS_EQUIPMENT_UNKNOWN',
              operationType: p.operationType || 'TECH_CARD_OPERATION_TYPE_UNKNOWN',
              pressTemperatureC: p.pressTemperatureC || 0,
              pressDwellSec: p.pressDwellSec || 0,
              pressPressureNCm2: decimalToInput(p.pressPressureNCm2),
              // NO `?? false` AND NO `|| false`: this is a proto3 `optional bool`, so an unset one
              // is simply ABSENT from the JSON and must stay `undefined` in the form. Folding it to
              // false would turn «nobody said» into the instruction «press it dry» on every profile
              // — and the next save would write that invention back as a fact.
              pressSteam: p.pressSteam,
              pressCloth: p.pressCloth || 'TECH_CARD_PRESS_CLOTH_UNKNOWN',
              note: p.note ?? '',
            })),
          },
        }
      : { ...emptyConstruction },
    operations: (insert?.operations ?? []).map((o) => ({
      // Объединение (46) — источник; легаси-проекция (21) остаётся фолбэком для архивных
      // снапшотов, отданных ровно так, как были записаны: у них поля 46 нет вовсе.
      inputKeys: (o.inputKeys?.length ? o.inputKeys : (o.pieceLineKeys ?? [])).filter(Boolean),
      outputUnitKey: o.outputUnitKey ?? '',
      outputUnitName: o.outputUnitName ?? '',
      bomLineKeys: (o.bomLineKeys ?? []).filter(Boolean),
      // Фотографии шага с выносками. Координаты приходят Decimal'ом и остаются строкой: тот же
      // тип на проводе, в форме и в БД — круговой рейс без округлений.
      media: (o.media ?? []).map((m) => ({
        mediaId: wireInt(m.mediaId),
        caption: m.caption ?? '',
        annotations: (m.annotations ?? []).map(annotationFromWire),
      })),
      operationNumber: o.operationNumber || 0,
      operationType: o.operationType || 'TECH_CARD_OPERATION_TYPE_UNKNOWN',
      zone: o.zone || 'TECH_CARD_GARMENT_ZONE_UNKNOWN',
      smv: decimalToInput(o.smv),
      calloutNumber: o.calloutNumber || 0,
      // Overrides. An ABSENT allowance means «inherit the card standard» and must read back as an
      // empty control, not as 0 — 0 is the separate, real setting «cut on the line as drawn».
      seamClass: o.seamClass || 'TECH_CARD_SEAM_CLASS_UNKNOWN',
      stitchesPerCm: decimalToInput(o.stitchesPerCm),
      seamAllowanceMm: decimalToInput(o.seamAllowanceMm),
      topstitchMode: o.topstitch?.mode || 'TECH_CARD_TOPSTITCH_MODE_UNKNOWN',
      topstitchWidthMm: decimalToInput(o.topstitch?.widthMm),
      topstitchRows: o.topstitch?.rows || 0,
      attachmentKind: o.attachmentKind || 'TECH_CARD_ATTACHMENT_KIND_UNKNOWN',
      attachmentSizeMm: decimalToInput(o.attachmentSizeMm),
      // The machine block (0306). Enum tokens arrive as the `_UNKNOWN` string and bare int32s as 0
      // when they are unset — both are «inherit», not «zero degrees» and not «no machine», which is
      // why the controls read them back as empty rather than as a value somebody chose.
      machineType: o.machineType || 'TECH_CARD_MACHINE_TYPE_UNKNOWN',
      machineProfileKey: o.machineProfileKey ?? '',
      threadCount: o.threadCount || 0,
      needleType: o.needleType || 'TECH_CARD_NEEDLE_TYPE_UNKNOWN',
      needleSizeNm: o.needleSizeNm || 0,
      threadTension: o.threadTension || 'TECH_CARD_THREAD_TENSION_UNKNOWN',
      threadTensionNote: o.threadTensionNote ?? '',
      stitchWidthMm: decimalToInput(o.stitchWidthMm),
      // The ВТО block. pressSteam is read verbatim, undefined included — see the press profile above.
      pressEquipment: o.pressEquipment || 'TECH_CARD_PRESS_EQUIPMENT_UNKNOWN',
      pressProfileKey: o.pressProfileKey ?? '',
      pressTemperatureC: o.pressTemperatureC || 0,
      pressDwellSec: o.pressDwellSec || 0,
      pressPressureNCm2: decimalToInput(o.pressPressureNCm2),
      pressSteam: o.pressSteam,
      pressCloth: o.pressCloth || 'TECH_CARD_PRESS_CLOTH_UNKNOWN',
      // --- ВИДЫ ОПЕРАЦИЙ (0324): вложенное с провода → плоское в форме -------------------------
      //
      // ЧИТАЕТСЯ ЧЕРЕЗ `?.`, И ЭТО НЕ ОСТОРОЖНОСТЬ. Незаполненное блок-сообщение приходит ЯВНЫМ
      // `null` (EmitUnpopulated), а не отсутствующим ключом, поэтому `o.stitching.needleCount`
      // упал бы на первом же шаге без строчки — то есть на большинстве шагов любой карточки.
      //
      // Дальше — обычная дисциплина чтения формы: decimal через decimalToInput (он же гасит null),
      // enum через `|| '*_UNKNOWN'`, int через `|| 0`. Пусто читается ПУСТЫМ контролом, а не
      // нулём: «не указано» и «ноль» — разные ответы, и форма не имеет права выдумывать второй.
      needleCount: o.stitching?.needleCount || 0,
      needleGaugeMm: decimalToInput(o.stitching?.needleGaugeMm),
      seamSecuring: o.stitching?.seamSecuring || 'TECH_CARD_SEAM_SECURING_UNKNOWN',
      rowSpacingMm: decimalToInput(o.stitching?.rowSpacingMm),
      fullnessRatio: decimalToInput(o.stitching?.fullnessRatio),
      // Имя поля на проводе — `placementLayout`, а не `placement`: «placement» занято reserved-именем
      // легаси-поля свободного текста, и снять его нельзя — на JSON-ключах легаси держится разбор
      // архивных релизных снапшотов. Колонки при этом остались placement_count / pitch_mm.
      placementCount: o.placementLayout?.count || 0,
      pitchMm: decimalToInput(o.placementLayout?.pitchMm),
      attachMethod: o.hardware?.attachMethod || 'TECH_CARD_HARDWARE_ATTACH_METHOD_UNKNOWN',
      holePrep: o.hardware?.holePrep || 'TECH_CARD_HOLE_PREP_UNKNOWN',
      reinforcement: o.hardware?.reinforcement || 'TECH_CARD_REINFORCEMENT_UNKNOWN',
      foldbackMm: decimalToInput(o.hardware?.foldbackMm),
      cycleStitchCount: o.hardware?.cycleStitchCount || 0,
      printMethod: o.printMethod || 'TECH_CARD_PRINT_METHOD_UNKNOWN',
      peelMode: o.print?.peelMode || 'TECH_CARD_PEEL_MODE_UNKNOWN',
      secondPressSec: o.print?.secondPressSec || 0,
      pressureScale: o.print?.pressureScale || 'TECH_CARD_PRESSURE_SCALE_UNKNOWN',
      airTemperatureC: o.weld?.airTemperatureC || 0,
      feedSpeedMMin: decimalToInput(o.weld?.feedSpeedMMin),
      trimAction: o.trim?.action || 'TECH_CARD_TRIM_ACTION_UNKNOWN',
      residualAllowanceMm: decimalToInput(o.trim?.residualAllowanceMm),
      residualTailMaxMm: decimalToInput(o.threadTrim?.residualTailMaxMm),
      pressAction: o.press?.action || 'TECH_CARD_PRESS_ACTION_UNKNOWN',
      pressToward: o.press?.toward || 'TECH_CARD_PRESS_TOWARD_UNKNOWN',
      cleaningKind: o.clean?.kind || 'TECH_CARD_CLEANING_KIND_UNKNOWN',
      coverageMode: o.inspect?.coverageMode || 'TECH_CARD_INSPECT_COVERAGE_UNKNOWN',
      wetProcessKind: o.wetProcessKind || 'TECH_CARD_WET_PROCESS_KIND_UNKNOWN',
      buttonholeStyle: o.fastening?.buttonholeStyle || 'TECH_CARD_BUTTONHOLE_STYLE_UNKNOWN',
      cutLengthMm: decimalToInput(o.fastening?.cutLengthMm),
      buttonholeOrientation:
        o.fastening?.buttonholeOrientation || 'TECH_CARD_BUTTONHOLE_ORIENTATION_UNKNOWN',
      bartackLengthMm: decimalToInput(o.fastening?.bartackLengthMm),
      attachPattern: o.fastening?.attachPattern || 'TECH_CARD_BUTTON_ATTACH_PATTERN_UNKNOWN',
      zipperApplication: o.fastening?.zipperApplication || 'TECH_CARD_ZIPPER_APPLICATION_UNKNOWN',
      bindingStyle: o.stitching?.bindingStyle || 'TECH_CARD_BINDING_STYLE_UNKNOWN',
      labelAttachStitch: o.stitching?.labelAttachStitch || 'TECH_CARD_LABEL_ATTACH_STITCH_UNKNOWN',
      note: o.note || '',
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

// THE CARD'S EQUIPMENT PARK, on the way out (0306).
//
// A ROW WITH NO TYPE IS DROPPED, NOT SENT. The server refuses a machine profile whose machine_type
// is UNKNOWN (and a press profile with no equipment) — rightly: a park row that does not say what it
// is cannot be inherited from. But it refuses the WHOLE card with it, so a half-added row on a tab
// the operator may never reopen would block a save carrying nine other tabs' work. Same treatment,
// same reason, as a blank piece row (isBlankPiece).
//
// The key is minted HERE for a row that has none, exactly as a BOM line's is: the ULID is the row's
// durable identity and a step's reference points at it. Never re-minted for a row that has one —
// that would detach every step pointing at it on the very next save.
function mapEquipmentDefaultsOut(
  c?: TechCardFormData['construction'],
): common_TechCardEquipmentDefaults {
  const machines: common_TechCardMachineProfile[] = (c?.equipmentDefaults?.machines ?? [])
    .filter((m) => !!m.machineType && m.machineType !== 'TECH_CARD_MACHINE_TYPE_UNKNOWN')
    .map((m) => ({
      profileKey: m.profileKey?.trim() || ulid(),
      label: m.label?.trim() || '',
      machineType: m.machineType as common_TechCardMachineType,
      threadCount: m.threadCount || 0,
      needleType: (m.needleType || 'TECH_CARD_NEEDLE_TYPE_UNKNOWN') as common_TechCardNeedleType,
      needleSizeNm: m.needleSizeNm || 0,
      bedType: (m.bedType || 'TECH_CARD_BED_TYPE_UNKNOWN') as common_TechCardBedType,
      automation: (m.automation ||
        'TECH_CARD_AUTOMATION_LEVEL_UNKNOWN') as common_TechCardAutomationLevel,
      threadTension: (m.threadTension ||
        'TECH_CARD_THREAD_TENSION_UNKNOWN') as common_TechCardThreadTension,
      // Only ever alongside the scale it explains — the server refuses a note with no tension, and
      // a note left behind by switching the scale back to «inherit» would ride out and be refused.
      threadTensionNote:
        m.threadTension && m.threadTension !== 'TECH_CARD_THREAD_TENSION_UNKNOWN'
          ? m.threadTensionNote?.trim() || ''
          : '',
      attachmentKind: (m.attachmentKind ||
        'TECH_CARD_ATTACHMENT_KIND_UNKNOWN') as common_TechCardAttachmentKind,
      // Blank = unset: inputToDecimal('') is undefined, JSON.stringify drops the key and the column
      // stays NULL. Sending `{ value: "0" }` would state a настройка nobody made.
      stitchesPerCm: inputToDecimal(m.stitchesPerCm),
      stitchWidthMm: inputToDecimal(m.stitchWidthMm),
      note: m.note?.trim() || '',
    }));
  const presses: common_TechCardPressProfile[] = (c?.equipmentDefaults?.presses ?? [])
    .filter((p) => !!p.pressEquipment && p.pressEquipment !== 'TECH_CARD_PRESS_EQUIPMENT_UNKNOWN')
    .map((p) => ({
      profileKey: p.profileKey?.trim() || ulid(),
      label: p.label?.trim() || '',
      pressEquipment: p.pressEquipment as common_TechCardPressEquipment,
      operationType: (p.operationType ||
        'TECH_CARD_OPERATION_TYPE_UNKNOWN') as common_TechCardOperationType,
      pressTemperatureC: p.pressTemperatureC || 0,
      pressDwellSec: p.pressDwellSec || 0,
      pressPressureNCm2: inputToDecimal(p.pressPressureNCm2),
      // Verbatim, undefined included: absent = «not stated», false = «press it DRY». JSON.stringify
      // drops the key for undefined, which is exactly the wire shape an unset optional bool has.
      pressSteam: p.pressSteam,
      pressCloth: (p.pressCloth || 'TECH_CARD_PRESS_CLOTH_UNKNOWN') as common_TechCardPressCloth,
      note: p.note?.trim() || '',
    }));
  return { machines, presses };
}

// The 1:1 construction section.
//
// IT IS SENT WHEN IT CARRIES SOMETHING **OR WHEN THE CARD ALREADY HAD ONE**, and both halves are
// load-bearing under a full-replace write where an ABSENT section means «preserve the stored row»:
//
//   - counting only content would make the section unclearable — empty the last field (or delete the
//     last equipment profile) and the payload falls silent, the server preserves what is stored, and
//     the deletion never happens. No error, no hint, the value simply reappears on reload.
//   - sending it ALWAYS would be worse in the other direction: an empty construction is a REPLACE, so
//     it would insert an all-NULL row on every card that has never had one, and the section digest
//     of «no row» and of «a row of NULLs» are different fingerprints. Every approved CONSTRUCTION
//     sign-off on such a card — nearly all of them — would read «edited since signing» at once.
//
// THE PROFILES COUNT AS CONTENT (that is what `park` adds to the check): without them a card whose
// construction holds nothing but a machine profile would be dropped as «visually empty», and the
// profile could then be neither created nor deleted.
//
// THE WRAPPER IS ALWAYS PRESENT once the section travels, empty lists included — the wrapper's
// presence is the ONLY thing that tells the server «replace the park» from «this bundle knows
// nothing about parks, leave it alone», and an empty park is a deliberate «delete them all».
function mapConstructionOut(
  c: TechCardFormData['construction'] | undefined,
  storedHadConstruction: boolean,
): common_TechCardConstruction | undefined {
  const seamClass = (c?.defaultSeamClass ||
    'TECH_CARD_SEAM_CLASS_UNKNOWN') as common_TechCardSeamClass;
  const park = mapEquipmentDefaultsOut(c);
  const out: common_TechCardConstruction = {
    defaultSeamClass: seamClass,
    defaultStitchesPerCm: inputToDecimal(c?.defaultStitchesPerCm),
    hemFinish: c?.hemFinish?.trim() || '',
    notes: c?.notes?.trim() || '',
    equipmentDefaults: park,
  };
  // An UNKNOWN seam class is «not set», so it does not count as content — otherwise a card nobody
  // configured would send a construction block full of defaults and the section would stop reading
  // as empty. Profile rows are counted AFTER the drop above, so a blank half-added row does not
  // conjure a section into existence.
  const content =
    hasContent([
      seamClass === 'TECH_CARD_SEAM_CLASS_UNKNOWN' ? '' : seamClass,
      (c?.defaultStitchesPerCm ?? '').trim(),
      out.hemFinish,
      out.notes,
    ]) ||
    (park.machines?.length ?? 0) > 0 ||
    (park.presses?.length ?? 0) > 0;
  return content || storedHadConstruction ? out : undefined;
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
    // Ступень (Ф1): признак того, что часть слотов посчитана ОЦЕНКОЙ по площади, а не нормой.
    // Output-only, как соседи: сервер вычисляет его на чтении, запись карточки его не несёт.
    hasEstimate: undefined,
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
    requiredSeamAllowanceMm: inputToDecimal(data.requiredSeamAllowanceMm),
    concept: data.concept?.trim() || '',
    notes: data.notes?.trim() || '',
    // children edited here — override the echoed `original` values
    sizeIds: data.sizeIds ?? [],
    // Типовой тираж больше не отправляется. `undefined` здесь ОБЯЗАТЕЛЕН и не равен «просто не
    // писать строку»: выше стоит `...original`, который иначе вернул бы прочитанное
    // size_quantities обратно на сервер и вечно воскрешал удалённое поле. JSON.stringify роняет
    // ключ, и запись full-replace оставляет карточку без типового тиража — это и есть цель:
    // тираж партии живёт на прогоне (production_run), а не на карточке.
    sizeQuantities: undefined,
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
        fabricPurpose: (p.fabricPurpose?.trim() || UNSET_PURPOSE) as common_TechCardBomPurpose,
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
      // Первым элементом списка, а не сырым полем: сервер хранит `part` = parts[0], и разойтись
      // им нельзя — на `part` стоит связь «деталь ↔ выноска» и им печатается тех-пак.
      part: calloutPartsOut(c)[0] ?? '',
      description: c.description?.trim() || '',
      dimensions: c.dimensions?.trim() || '',
      mediaId: c.mediaId || 0,
      posX: inputToDecimal(c.posX),
      posY: inputToDecimal(c.posY),
      // ВИД ШЛЁТСЯ ВСЕГДА, круглым рейсом прочитанного. Присутствие поля и есть заявление «этот
      // бандл про геометрию знает»: сервер, увидев молчание, несёт хранимую геометрию дальше — и
      // именно поэтому промолчать здесь означало бы навсегда заморозить чужие мерки.
      kind: annotationKindToWire(c.kind),
      points: (c.points ?? []).map((pt) => ({
        x: inputToDecimal(pt.x),
        y: inputToDecimal(pt.y),
      })),
      color: annotationColorToWire(c.color),
      dashed: !!c.dashed,
      filled: !!c.filled,
      // `part` шлётся ПЕРВЫМ ЭЛЕМЕНТОМ СПИСКА, а не тем, что лежит в поле: сервер хранит именно
      // так, и разойтись им нельзя — на `part` стоит связь «деталь ↔ выноска» и им печатают.
      parts: calloutPartsOut(c),
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
        //
        // ЕДИНСТВЕННОЕ ИСКЛЮЧЕНИЕ — НЕВАЛИДНАЯ ПАРА (защитная нормализация). Зеркальная пара при
        // нечётном или нулевом количестве отвергается серверной `ValidatePieceCutSymmetry` и
        // CHECK'ом `chk_tcp_mirrored_needs_even_count` (сырой MySQL 3819), и падает при этом ВСЯ
        // карточка — с сезоном, подписями и всем остальным. Раньше такую пару ловил refine формы;
        // теперь ловить её на форме нечем и НЕЧЕМ ЧИНИТЬ: ни «как кроится», ни «× на изделие» в
        // карточке больше не редактируются, так что круглый рейс легаси-пары означал бы вечный
        // отказ сохранения без единого адресуемого поля. Поэтому вместо хранимого значения уезжает
        // явный `_UNKNOWN` — по тому же контракту абзацем выше сервер прочитает его как «очисти
        // колонку»: разметка снимается осознанно, а карточка сохраняется. Пара проверяется в том
        // виде, в каком уедет (количество уже подрезано до >= 1 строкой выше), — судить её будет
        // именно такой. Валидные значения (identical / fold / mirrored при чётном >= 2) в эту ветку
        // не попадают и уезжают неизменными.
        cutSymmetry: (cutSymmetryCountInvalid(p.cutSymmetry, p.piecesPerGarment || 1)
          ? UNSET_CUT_SYMMETRY
          : p.cutSymmetry || UNSET_CUT_SYMMETRY) as common_TechCardPieceCutSymmetry,
        // `ungraded` шлётся ВСЕГДА, и по той же причине, что `cutSymmetry` выше: поле объявлено
        // `optional` ради ЧУЖОЙ устаревшей вкладки — ОТСУТСТВИЕ сервер читает как «оставь
        // хранимое», ЯВНЫЙ `false` как «сними пометку». Круглый рейс прочитанного выполняет оба
        // обязательства: чужую пометку сохранение не трогает, а снятая оператором галка уезжает
        // снятием. Промолчать было бы «безопаснее» ровно до первого снятия галки, которое стало бы
        // невозможным и необъяснимым — контрол пуст, а карточка после перезагрузки снова помечена.
        ungraded: p.ungraded ?? false,
        grainline: p.grainline?.trim() || '',
        fused: p.fused ?? false,
        // ПАРА ЕДЕТ ЦЕЛИКОМ И ВСЕГДА. Присутствие режима на проводе управляет и шириной под ним
        // (сервер: один флаг :fusing_omitted на две колонки), поэтому промолчать про одну половину
        // значило бы сохранить полосу с шириной от прошлой правки. Новый клиент шлёт обе, круглым
        // рейсом того, что прочитал.
        fusingMode: (p.fusingMode || UNSET_FUSING_MODE) as common_TechCardPieceFusingMode,
        // Ширина отправляется ТОЛЬКО у «полосой»: у остальных режимов своей ширины нет, и сервер
        // такую пару отвергает по имени поля (chk_tcp_fusing_width). Пустая строка — это «числа
        // нет», поэтому она уходит как отсутствие поля, а не как «0».
        fusingWidthMm:
          fusingNeedsWidth(p.fusingMode) && p.fusingWidthMm?.trim()
            ? { value: p.fusingWidthMm.trim() }
            : undefined,
        // НЕ 0, а «поля нет». Ноль сервер принимает как настоящий номер (dto: `!= nil`), не находит
        // выноску №0 и помечает деталь `detached` — то есть «выноску, на которую ты ссылалась,
        // удалили» у детали, которую никогда ни к чему не прикрепляли. На бете так помечены 16
        // деталей из 18. Выноски нумеруются с единицы, поэтому 0 не может быть ничем, кроме
        // «не задано», и единственная его честная запись — отсутствие поля.
        calloutNumber: p.calloutNumber && p.calloutNumber > 0 ? p.calloutNumber : undefined,
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
          fabricPurpose: (a.fabricPurpose?.trim() || UNSET_PURPOSE) as common_TechCardBomPurpose,
        })),
    },
    bomItems: bomLines.map((b) => ({
      section: (b.section || 'TECH_CARD_BOM_SECTION_UNKNOWN') as common_TechCardBomSection,
      purpose: (b.purpose || UNSET_PURPOSE) as common_TechCardBomPurpose,
      // Sent only where it is legal, so a note left behind by switching «другое» → «карманка» cannot
      // ride out and be refused by chk_bom_item_purpose_note. Dropping it is safe in a way clearing
      // the PURPOSE would not be: the note only ever explains a purpose that is no longer there.
      purposeNote: isOtherPurpose(b.purpose) ? b.purposeNote?.trim() ?? '' : '',
      // Same pair, other axis (0278). The kind is sent as-is; the note is dropped unless the kind is
      // OTHER, or a note left behind by a kind the operator has since changed would ride out and be
      // refused by chk_bom_item_kind_note. Both fields are ALWAYS sent: kind and kind_note share one
      // presence decision server-side, so omitting one while sending the other is the exact write
      // MySQL has to reject.
      kind: (b.kind || UNSET_KIND) as common_TechCardBomKind,
      kindNote: b.kind === 'TECH_CARD_BOM_KIND_OTHER' ? b.kindNote?.trim() ?? '' : '',
      isSample: !!b.isSample,
      name: b.name?.trim() || '',
      supplier: b.supplier?.trim() || '',
      supplierRef: b.supplierRef?.trim() || '',
      color: b.color?.trim() || '',
      composition: b.composition?.trim() || '',
      spec: b.spec?.trim() || '',
      unit: b.unit?.trim() || '',
      // ДЕНЬГИ СТРОКИ — ТОЛЬКО ОТ РЕДАКТОРА С costing:write, тем же verbatim-протоколом
      // «поля нет = сохрани что было», что у пары провенанса ниже и у costing в конце файла.
      // Аккаунту без права сервер вырезает цены на чтении, форма держит пустоту — и отправка
      // этой пустоты либо затирала бы цену (валюта шла явным ''), либо валила бы ВЕСЬ сейв:
      // непустой unit_price от не-костингового аккаунта сервер отвергает целиком
      // (PermissionDenied, techCardInsertHasCostingData), а цена могла оказаться в форме и без
      // ввода руками — например из черновика, снятого аккаунтом с правом. undefined выбрасывает
      // ключ из JSON, и серверный anti-erase (preserveStoredCosting) возвращает хранимые
      // цену и валюту по line_key.
      unitPrice: canWriteCosting ? inputToDecimal(b.unitPrice) : undefined,
      currency: canWriteCosting ? b.currency?.trim() || '' : undefined,
      comment: b.comment?.trim() || '',
      fabricWidth: inputToDecimal(b.fabricWidth),
      fabricWeightGsm: inputToDecimal(b.fabricWeightGsm),
      fabricDirection: (b.fabricDirection ||
        'TECH_CARD_FABRIC_DIRECTION_UNKNOWN') as common_TechCardFabricDirection,
      wastagePercent: inputToDecimal(b.wastagePercent),
      // ПАРА ПРОВЕНАНСА (0296) — verbatim-протокол присутствия, тот же, что у kind/kind_note
      // выше и у consumption_source в рецепте: undefined означает «эта форма не знает» (черновик
      // из localStorage-снимка старого бандла) и уходит ОТСУТСТВИЕМ обоих ключей —
      // JSON.stringify выбрасывает их, сервер сохраняет что было, аудит чужого применения
      // переживает сейв. Известный источник шлётся ПАРОЙ: счётчик настилов осмыслен только при
      // 'lays' и на 'manual' обнуляется (серверная CHECK-пара). Сброс «правка числа руками →
      // manual» дублировать не нужно: локально его делает эффект в bom-field (честный бейдж до
      // сохранения), а на сервере он случается по факту смены значения, что бы клиент ни прислал.
      wastageSource:
        b.wastageSource === undefined ? undefined : b.wastageSource === 'lays' ? 'lays' : 'manual',
      wastageLayCount:
        b.wastageSource === undefined
          ? undefined
          : b.wastageSource === 'lays'
            ? (b.wastageLayCount ?? 0)
            : 0,
      // Штамп применения ставит СЕРВЕР при смене тройки (source, count, percent); прислать его
      // отсюда значило бы датировать применение каждым сохранением карточки.
      wastageAppliedAt: undefined,
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
    // THE MACHINE-AWARENESS FLAG (§8), set on every save this client makes and by nothing else.
    // Operations are full-replace with no per-field protection, so a save from a bundle that has
    // never heard of machine_type would silently wipe every machine fact on the card. The flag is
    // what lets the server tell «this client dropped the fields» from «this card has none»: a write
    // WITHOUT it against a card that carries machine facts is refused with FailedPrecondition
    // instead of erasing them. It is TRANSPORT, not content — it is not hashed into any section
    // digest, so declaring it cannot stale a signature.
    machineFieldsAware: true,
    // Осведомлённость о полях сборки. Ставится на КАЖДОМ сохранении: сервер по нему отличает
    // «этот бандл знает про узлы» от «этот бандл сейчас их сотрёт». Снятие разметки — отдельный
    // флаг assemblyCleared, и его ставит только соответствующая кнопка.
    assemblyAware: true,
    // Намерение живёт ровно одно сохранение: форма сбрасывает флаг сразу после отправки.
    //
    // ФЛАГ РЕШАЕТСЯ ПО СОХРАНЁННОЙ КАРТОЧКЕ, А НЕ ПО ФОРМЕ. Намерение «снять разметку» имеет
    // смысл только против карточки, которая разметку НЕСЁТ: сервер отвечает на всё остальное
    // отказом «cleared против карточки без разметки», и это правильно.
    //
    // Форма же знает лишь своё текущее состояние. Объявить узел локально и тут же снять — жест
    // законный (передумал), но серверу о нём знать незачем: на сохранённой карточке ничего не
    // менялось. Маппер — единственное место, которое видит обе стороны, поэтому решение здесь.
    assemblyCleared:
      !!data.assemblyCleared &&
      (original?.operations ?? []).some((o) => (o?.outputUnitKey ?? '').trim() !== ''),
    // Осведомлённость о фотографиях шагов — на КАЖДОМ сохранении, как и две выше: сервер по ней
    // отличает «этот бандл знает про снимки» от «этот бандл сейчас их сотрёт».
    mediaAware: true,
    // Решается по СОХРАНЁННОЙ карточке, а не по форме — тот же довод, что у assemblyCleared:
    // приложить снимок локально и тут же убрать это законный жест, но на сохранённой карточке
    // при этом ничего не менялось, и объявлять снятие незачем.
    mediaCleared:
      !!data.mediaCleared && (original?.operations ?? []).some((o) => (o?.media ?? []).length > 0),
    // ЧЕТВЁРТЫЙ ЩИТ ТОЙ ЖЕ ПОРОДЫ — для полей волны видов операций (0324). Ставится ВСЕГДА, как
    // machineFieldsAware, а не по факту заполненности: восемнадцать полей волны сидят на СТАРЫХ
    // парах (глагол, machine_type), которые этот клиент шлёт каждый день, а расширенные словари
    // (machineType +2, topstitchMode +2, pressCloth +1, bomItem.kind +2) живут на колонках,
    // которым годы. Операции пишутся полной заменой, стабильного ключа у шага нет — значит
    // отставшая вкладка стёрла бы факты молча, и сервер отвечает на запись БЕЗ флага
    // FailedPrecondition против карточки, эти факты несущей.
    //
    // Парного *_cleared у него НЕТ и не будет, в отличие от узлов и снимков: «поле пусто» здесь
    // рядовая правка (технолог стёр стиль петли, потому что он больше не нужен), и бекстоп
    // «осведомлённая пустота против непустой карточки» сделал бы восемнадцать полей НЕСТИРАЕМЫМИ.
    //
    // ТРАНСПОРТ, а не содержание: в дайджест секции не входит — объявить его не значит просрочить
    // подпись.
    operationKindsAware: true,
    // `!!` and not `!== undefined`: a card with no construction row comes back with an explicit
    // `null` (the gateway marshals an unset message that way), and treating that as «had one» would
    // make every such card start writing an all-NULL construction row — see mapConstructionOut.
    construction: mapConstructionOut(data.construction, !!original?.construction),
    operations: (data.operations ?? []).map((o, i) => {
      const opBomKeys = (o.bomLineKeys ?? []).map((k) => k.trim()).filter(Boolean);
      // An override goes out ONLY when it is set. An empty control means «inherit the card
      // standard», and sending 0 for it would state the opposite — 0 is the real setting «cut on
      // the line as drawn». That distinction is the entire point of the cascade, so it is preserved
      // on the wire rather than flattened here.
      const optionalDecimal = (v?: string) => {
        const t = (v ?? '').trim();
        return t === '' ? undefined : inputToDecimal(t);
      };
      const topstitchMode = (o.topstitchMode ||
        'TECH_CARD_TOPSTITCH_MODE_UNKNOWN') as common_TechCardTopstitchMode;
      // WHICH OF THE TWO EQUIPMENT BLOCKS THIS STEP OWNS (0306). The server refuses a machine
      // setting on a non-machine step and a ВТО setting on a non-ВТО step BY NAME, and it refuses
      // the whole card with it. The editor clears the hidden block when the type changes; this gate
      // is the belt behind that, because form state outlives a control — a draft restored from
      // localStorage, or a step whose type was switched by another surface, would otherwise carry
      // values nobody can see to a save nobody can fix.
      const operationType = (o.operationType ||
        'TECH_CARD_OPERATION_TYPE_UNKNOWN') as common_TechCardOperationType;
      const isMachineStep = operationType === 'TECH_CARD_OPERATION_TYPE_MACHINE';
      // ПЕЧАТЬ БЕРЁТ ТЕРМОПРЕСС ВЗАЙМЫ, и гейт ВТО-полей отвечает не на тот вопрос, что список трёх
      // ВТО-глаголов: не «шаг ЕСТЬ ВТО», а «шагу МОЖНО дать настройки пресса». Термотрансфер
      // прижимают температурой, выдержкой и силиконовой бумагой, не будучи ВТО-шагом, и контракт
      // ВТО-блок при PRINT разрешает: `press_equipment` там ОПЦИОНАЛЕН, а REQUIRED-if-aware живёт
      // у press/press_open/fusing — поэтому обязательность пикера в `superRefine` стоит на трёх
      // глаголах и здесь ни при чём. Списком трёх глаголов температура 160 и выдержка 12 секунд
      // печатного шага уезжали на провод нулями, и печатный лист рисовал их из ничего.
      const ownsPressSettings = stepTypeOwnsBlock(operationType, 'pressSettings');
      // A legacy type (LOCKSTITCH…) is canonicalised into (MACHINE, machine_type) by the server, and
      // it derives the machine from the token itself — so this client neither invents one for it nor
      // sends the block: the step is not MACHINE on the wire yet.
      //
      // --- ВИДЫ ОПЕРАЦИЙ (0324): десять блоков и два голых поля -----------------------------------
      //
      // ФОРМА ПЛОСКАЯ, ПРОВОД ВЛОЖЕННЫЙ — сборка обёрток живёт здесь, и только здесь. Обёртка едет
      // ЦЕЛИКОМ ИЛИ НЕ ЕДЕТ ВОВСЕ (blockOut): прецедент topstitch — всегда присутствующая обёртка с
      // UNKNOWN внутри читается как «кто-то думал об этом» на КАЖДОМ шаге, у которого этого нет.
      //
      // ДВА ГЕЙТА, И ОНИ РАЗНЫЕ. Первый — глагол, таблицей STEP_TYPE_BLOCKS: она одна на редактор,
      // очистку скрытого, этот маппер и печатный лист, потому что сервер отвергает поле чужого
      // семейства ПО ИМЕНИ и отказывает вместе с ним всей карточкой. Второй — ЯВНЫЙ тип машины, и
      // он живёт здесь, а не в таблице: это факт о машинке, а не о глаголе. Тип, разрешённый через
      // `machineProfileKey`, не засчитывается — правило о шаге, а не о профиле.
      //
      // НЕОСВЕДОМЛЁННАЯ ЗАПИСЬ НЕ РЕГРЕССИРУЕТ ПО ПОСТРОЕНИЮ: у шага без единого нового факта все
      // десять обёрток пусты (⇒ undefined), оба голых поля не его глагола (⇒ undefined), и байты
      // такого шага на проводе те же, что были до волны.
      const ownsBlock = (b: StepBlock) => stepTypeOwnsBlock(operationType, b);
      const stepMachineType = isMachineStep ? o.machineType || 'TECH_CARD_MACHINE_TYPE_UNKNOWN' : '';
      const onMachineType = (...tokens: readonly string[]) => tokens.includes(stepMachineType);
      const onCycleMachine = onMachineType(...CYCLE_MACHINE_TYPES);
      const isWeldStep = isWeldMachineType(stepMachineType);
      // Метод печати — голым полем шага, а не внутри блока `print`: он REQUIRED при PRINT, а
      // обязательное поле не прячут в необязательное сообщение, которого может не быть вовсе.
      // На чужом глаголе ключ не едет вовсе — сервер отвергает метод везде, кроме PRINT.
      const printMethod =
        operationType === 'TECH_CARD_OPERATION_TYPE_PRINT'
          ? ((o.printMethod || 'TECH_CARD_PRINT_METHOD_UNKNOWN') as common_TechCardPrintMethod)
          : undefined;
      const isLaser = printMethod === 'TECH_CARD_PRINT_METHOD_LASER_ENGRAVE';

      const stitching = blockOut(ownsBlock('stitching'), () => ({
        needleCount: o.needleCount || 0,
        needleGaugeMm: optionalDecimal(o.needleGaugeMm),
        seamSecuring: (o.seamSecuring ||
          'TECH_CARD_SEAM_SECURING_UNKNOWN') as common_TechCardSeamSecuring,
        rowSpacingMm: optionalDecimal(o.rowSpacingMm),
        fullnessRatio: optionalDecimal(o.fullnessRatio),
        // Бейка — только при явном окантовывателе; шов этикетки — при любой машинке.
        bindingStyle: (onMachineType('TECH_CARD_MACHINE_TYPE_BINDING_TAPING')
          ? o.bindingStyle || 'TECH_CARD_BINDING_STYLE_UNKNOWN'
          : 'TECH_CARD_BINDING_STYLE_UNKNOWN') as common_TechCardBindingStyle,
        labelAttachStitch: (o.labelAttachStitch ||
          'TECH_CARD_LABEL_ATTACH_STITCH_UNKNOWN') as common_TechCardLabelAttachStitch,
      }));
      const placementLayout = blockOut(ownsBlock('placement'), () => ({
        count: o.placementCount || 0,
        pitchMm: optionalDecimal(o.pitchMm),
      }));
      // H-БЛОК ЖИВЁТ НА ДВУХ ГЛАГОЛАХ, И ПО-РАЗНОМУ. На HARDWARE_SET он целиком; на MACHINE с явной
      // цикловой машинкой — только подготовка отверстия, усилитель и стежки цикла: у петли и
      // закрепки есть отверстие и усилитель, но нет «способа крепления» и нет стропы, которую
      // подгибают, и сервер отвергает эти два поля там по имени.
      const isHardwareStep = operationType === 'TECH_CARD_OPERATION_TYPE_HARDWARE_SET';
      const hardware = blockOut(ownsBlock('hardware') && (isHardwareStep || onCycleMachine), () => ({
        attachMethod: (isHardwareStep
          ? o.attachMethod || 'TECH_CARD_HARDWARE_ATTACH_METHOD_UNKNOWN'
          : 'TECH_CARD_HARDWARE_ATTACH_METHOD_UNKNOWN') as common_TechCardHardwareAttachMethod,
        holePrep: (o.holePrep || 'TECH_CARD_HOLE_PREP_UNKNOWN') as common_TechCardHolePrep,
        reinforcement: (o.reinforcement ||
          'TECH_CARD_REINFORCEMENT_UNKNOWN') as common_TechCardReinforcement,
        foldbackMm: isHardwareStep ? optionalDecimal(o.foldbackMm) : undefined,
        cycleStitchCount: o.cycleStitchCount || 0,
      }));
      // Гравировка снимает материал сама: носителя нет, прижима нет — все три поля отвергаются.
      const print = blockOut(ownsBlock('print') && !isLaser, () => ({
        peelMode: (o.peelMode || 'TECH_CARD_PEEL_MODE_UNKNOWN') as common_TechCardPeelMode,
        secondPressSec: o.secondPressSec || 0,
        pressureScale: (o.pressureScale ||
          'TECH_CARD_PRESSURE_SCALE_UNKNOWN') as common_TechCardPressureScale,
      }));
      const weld = blockOut(ownsBlock('weld') && isWeldStep, () => ({
        // Горячий воздух — только у проклейки шва: ультразвук греет материал сам.
        airTemperatureC: onMachineType('TECH_CARD_MACHINE_TYPE_SEAM_TAPING')
          ? o.airTemperatureC || 0
          : 0,
        feedSpeedMMin: optionalDecimal(o.feedSpeedMMin),
      }));
      const trim = blockOut(ownsBlock('trim'), () => ({
        action: (o.trimAction || 'TECH_CARD_TRIM_ACTION_UNKNOWN') as common_TechCardTrimAction,
        residualAllowanceMm: optionalDecimal(o.residualAllowanceMm),
      }));
      const threadTrim = blockOut(ownsBlock('threadTrim'), () => ({
        residualTailMaxMm: optionalDecimal(o.residualTailMaxMm),
      }));
      // ВТО-БЛОК ЖИВЁТ НА ДВУХ ГЛАГОЛАХ, И ГЕЙТ У НЕГО СВОЙ, А НЕ `ownsBlock('pressSettings')`.
      // Тот отвечает «шагу можно дать НАСТРОЙКИ пресса» и включает FUSING и PRINT — а под-глагол
      // ВТО сервер на них отвергает по имени. Здесь вопрос другой: «шаг ЕСТЬ ВТО».
      //
      // PRESS_OPEN В ГЕЙТЕ, ХОТЯ КОНТРОЛА У НЕГО НЕТ. Пикер туда не пишет ничего (каноническая
      // запись разутюжки — сам глагол), но прочитанное с провода значение обязано уехать обратно
      // ТЕМ ЖЕ ТОКЕНОМ: выбросить его на записи значило бы стереть чужой факт молча, кругом
      // «загрузил → сохранил», на проводе, где потерю нечем увидеть.
      const isPressAction =
        operationType === 'TECH_CARD_OPERATION_TYPE_PRESS' ||
        operationType === 'TECH_CARD_OPERATION_TYPE_PRESS_OPEN';
      const pressAction = (o.pressAction ||
        'TECH_CARD_PRESS_ACTION_UNKNOWN') as common_TechCardPressAction;
      const press = blockOut(isPressAction, () => ({
        action: pressAction,
        // Направление законно ТОЛЬКО при «заутюжить»: при остальных приёмах припуск никуда не
        // укладывается, и сервер отвергает поле по имени. Тот же приём, что у бейки и петли —
        // гасится ЗДЕСЬ, а не только очисткой на экране: два гейта на одно поле разошлись бы.
        toward: (pressAction === 'TECH_CARD_PRESS_ACTION_TO_ONE_SIDE'
          ? o.pressToward || 'TECH_CARD_PRESS_TOWARD_UNKNOWN'
          : 'TECH_CARD_PRESS_TOWARD_UNKNOWN') as common_TechCardPressToward,
      }));
      const clean = blockOut(ownsBlock('clean'), () => ({
        kind: (o.cleaningKind || 'TECH_CARD_CLEANING_KIND_UNKNOWN') as common_TechCardCleaningKind,
      }));
      const inspect = blockOut(ownsBlock('inspect'), () => ({
        coverageMode: (o.coverageMode ||
          'TECH_CARD_INSPECT_COVERAGE_UNKNOWN') as common_TechCardInspectCoverage,
      }));
      // Мокрая обработка — один факт, он же дискриминатор: сообщение вокруг него было бы пустой
      // обёрткой, поэтому оно и не заведено.
      const wetProcessKind =
        operationType === 'TECH_CARD_OPERATION_TYPE_WET_PROCESS'
          ? ((o.wetProcessKind ||
              'TECH_CARD_WET_PROCESS_KIND_UNKNOWN') as common_TechCardWetProcessKind)
          : undefined;
      const fastening = blockOut(ownsBlock('fastening'), () => ({
        buttonholeStyle: (onMachineType('TECH_CARD_MACHINE_TYPE_BUTTONHOLE')
          ? o.buttonholeStyle || 'TECH_CARD_BUTTONHOLE_STYLE_UNKNOWN'
          : 'TECH_CARD_BUTTONHOLE_STYLE_UNKNOWN') as common_TechCardButtonholeStyle,
        cutLengthMm: onMachineType('TECH_CARD_MACHINE_TYPE_BUTTONHOLE')
          ? optionalDecimal(o.cutLengthMm)
          : undefined,
        buttonholeOrientation: (onMachineType('TECH_CARD_MACHINE_TYPE_BUTTONHOLE')
          ? o.buttonholeOrientation || 'TECH_CARD_BUTTONHOLE_ORIENTATION_UNKNOWN'
          : 'TECH_CARD_BUTTONHOLE_ORIENTATION_UNKNOWN') as common_TechCardButtonholeOrientation,
        bartackLengthMm: onMachineType(
          'TECH_CARD_MACHINE_TYPE_BUTTONHOLE',
          'TECH_CARD_MACHINE_TYPE_BARTACK',
        )
          ? optionalDecimal(o.bartackLengthMm)
          : undefined,
        attachPattern: (onMachineType('TECH_CARD_MACHINE_TYPE_BUTTON_ATTACH')
          ? o.attachPattern || 'TECH_CARD_BUTTON_ATTACH_PATTERN_UNKNOWN'
          : 'TECH_CARD_BUTTON_ATTACH_PATTERN_UNKNOWN') as common_TechCardButtonAttachPattern,
        zipperApplication: (onMachineType('TECH_CARD_MACHINE_TYPE_ZIPPER_SETTING')
          ? o.zipperApplication || 'TECH_CARD_ZIPPER_APPLICATION_UNKNOWN'
          : 'TECH_CARD_ZIPPER_APPLICATION_UNKNOWN') as common_TechCardZipperApplication,
      }));
      return {
        // Blanks dropped here as well as server-side: an empty key would be a field violation the
        // operator never caused.
        // Осведомлённая запись живёт по объединению; поле 21 сервер в ней игнорирует, поэтому
        // отправлять его не нужно и вредно — оно стало бы вторым мнением о тех же входах.
        inputKeys: (o.inputKeys ?? []).map((k) => k.trim()).filter(Boolean),
        outputUnitKey: (o.outputUnitKey ?? '').trim(),
        outputUnitName: (o.outputUnitName ?? '').trim(),
        bomLineKeys: opBomKeys,
        // Фотографии шага. Пустой список шлётся как есть — сервер трактует его так же, как
        // отсутствие поля, а щит совместимости смотрит на ФЛАГ `mediaAware`, а не на наличие
        // ключа: именно поэтому отставший бандл узнаётся по флагу, а не по пустоте.
        media: (o.media ?? [])
          .filter((m) => wireInt(m.mediaId) > 0)
          .map((m) => ({
            mediaId: wireInt(m.mediaId),
            caption: (m.caption ?? '').trim(),
            annotations: (m.annotations ?? []).map((a) => ({
              kind: annotationKindToWire(a.kind),
              points: (a.points ?? []).map((pt) => ({
                x: inputToDecimal(pt.x),
                y: inputToDecimal(pt.y),
              })),
              text: (a.text ?? '').trim(),
              labelX: inputToDecimal(a.labelX),
              labelY: inputToDecimal(a.labelY),
              color: annotationColorToWire(a.color),
              dashed: !!a.dashed,
              filled: !!a.filled,
              pieceLineKey: annotationPieceKeysOut(a)[0] ?? '',
              pieceLineKeys: annotationPieceKeysOut(a),
            })),
          })),
        // operation number is positional (server is authoritative); send (i+1)*10 so a
        // freshly-created card reads back sensibly before the server recomputes.
        operationNumber: (i + 1) * 10,
        operationType,
        zone: (o.zone || 'TECH_CARD_GARMENT_ZONE_UNKNOWN') as common_TechCardGarmentZone,
        smv: inputToDecimal(o.smv),
        calloutNumber: o.calloutNumber || 0,
        seamClass: (o.seamClass || 'TECH_CARD_SEAM_CLASS_UNKNOWN') as common_TechCardSeamClass,
        stitchesPerCm: inputToDecimal(o.stitchesPerCm),
        seamAllowanceMm: optionalDecimal(o.seamAllowanceMm),
        // The sub-message travels only when there IS topstitching: an always-present wrapper
        // carrying MODE_UNKNOWN reads as «somebody considered it» on every step that has none. And
        // the width is dropped only for a mode KNOWN to have none — beside «in the ditch» it would
        // be a shadow value the server refuses anyway, while «at the edge» now carries the number
        // whenever the technologist typed one. Written as «only with the numbered member» this line
        // was the last of the three losses: even with the editor and the schema fixed, the round
        // trip «load → open → save» would have deleted the width of a mode this bundle cannot
        // classify, on the wire, where nothing on screen could show it going.
        topstitch:
          topstitchMode === 'TECH_CARD_TOPSTITCH_MODE_UNKNOWN'
            ? undefined
            : {
                mode: topstitchMode,
                widthMm: topstitchModeRefusesWidth(topstitchMode)
                  ? undefined
                  : inputToDecimal(o.topstitchWidthMm),
                rows: o.topstitchRows || 0,
              },
        attachmentKind: (o.attachmentKind ||
          'TECH_CARD_ATTACHMENT_KIND_UNKNOWN') as common_TechCardAttachmentKind,
        attachmentSizeMm: optionalDecimal(o.attachmentSizeMm),
        // --- the machine block: only on a MACHINE step, and unset stays unset -------------------
        // `0` and `_UNKNOWN` ARE the unset wire values here (there is no presence on a bare int32
        // and every range starts above zero), so they are sent as they are rather than omitted.
        // The decimal is the exception: `''` must leave as an ABSENT key, because `{ value: "0" }`
        // is a real setting — a zero stitch width is a legal straight stitch.
        machineType: (isMachineStep
          ? o.machineType || 'TECH_CARD_MACHINE_TYPE_UNKNOWN'
          : 'TECH_CARD_MACHINE_TYPE_UNKNOWN') as common_TechCardMachineType,
        machineProfileKey: isMachineStep ? o.machineProfileKey?.trim() || '' : '',
        // СВАРОЧНЫЕ МАШИНКИ ОТВЕРГАЮТ НИТОЧНО-ИГОЛЬНЫЕ OVERRIDES (0324). Проклейка шва и ультразвук
        // соединяют теплом: иглы и нитки у них нет вовсе, и сервер отказывает по имени. Пятёрка
        // ниже — тот же список, что в isWeldMachineType, и другой машинки он не касается, поэтому
        // байты шага на любой ШВЕЙНОЙ машинке этой строкой не меняются.
        threadCount: isMachineStep && !isWeldStep ? o.threadCount || 0 : 0,
        needleType: (isMachineStep && !isWeldStep
          ? o.needleType || 'TECH_CARD_NEEDLE_TYPE_UNKNOWN'
          : 'TECH_CARD_NEEDLE_TYPE_UNKNOWN') as common_TechCardNeedleType,
        needleSizeNm: isMachineStep && !isWeldStep ? o.needleSizeNm || 0 : 0,
        threadTension: (isMachineStep && !isWeldStep
          ? o.threadTension || 'TECH_CARD_THREAD_TENSION_UNKNOWN'
          : 'TECH_CARD_THREAD_TENSION_UNKNOWN') as common_TechCardThreadTension,
        // Only with the scale it explains — server parity, same pair discipline as kind/kind_note.
        threadTensionNote:
          isMachineStep &&
          !isWeldStep &&
          o.threadTension &&
          o.threadTension !== 'TECH_CARD_THREAD_TENSION_UNKNOWN'
            ? o.threadTensionNote?.trim() || ''
            : '',
        stitchWidthMm: isMachineStep && !isWeldStep ? optionalDecimal(o.stitchWidthMm) : undefined,
        // --- the ВТО block: on PRESS / PRESS_OPEN / FUSING — and on PRINT, which borrows the press
        pressEquipment: (ownsPressSettings
          ? o.pressEquipment || 'TECH_CARD_PRESS_EQUIPMENT_UNKNOWN'
          : 'TECH_CARD_PRESS_EQUIPMENT_UNKNOWN') as common_TechCardPressEquipment,
        pressProfileKey: ownsPressSettings ? o.pressProfileKey?.trim() || '' : '',
        pressTemperatureC: ownsPressSettings ? o.pressTemperatureC || 0 : 0,
        pressDwellSec: ownsPressSettings ? o.pressDwellSec || 0 : 0,
        pressPressureNCm2: ownsPressSettings ? optionalDecimal(o.pressPressureNCm2) : undefined,
        // undefined drops the key, which IS the wire shape of an unset optional bool — and the
        // server reads a present `false` as the stated instruction «without steam».
        pressSteam: ownsPressSettings ? o.pressSteam : undefined,
        pressCloth: (ownsPressSettings
          ? o.pressCloth || 'TECH_CARD_PRESS_CLOTH_UNKNOWN'
          : 'TECH_CARD_PRESS_CLOTH_UNKNOWN') as common_TechCardPressCloth,
        // --- ВИДЫ ОПЕРАЦИЙ (0324): порядок — номера полей контракта 51..63 (дыры 50/62 обещаны) --
        printMethod,
        stitching,
        placementLayout,
        hardware,
        print,
        weld,
        trim,
        threadTrim,
        clean,
        inspect,
        wetProcessKind,
        fastening,
        // 65 — ВТО (0325). Стоит последним по номеру поля, как и все остальные блоки волны.
        press,
        note: o.note?.trim() || '',
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
    // ПРИВЕДЕНИЕ ЧЕРЕЗ `unknown`, И ЭТО НЕ ОСЛАБЛЕНИЕ ПРОВЕРКИ, А ЕЁ ЧЕСТНОЕ ИМЯ.
    //
    // Здесь собирается ПРОЕКЦИЯ ЗАПИСИ, а сгенерированный тип описывает форму ЧТЕНИЯ: у строки
    // BOM он объявляет цену-снапшот и эффективную ширину, у операции — piece_ids и прочие
    // выводимые сервером проекции, у выкройки — uploadedAt и ссылки, у детали — поля, которые
    // сервер выводит сам. Форма их не несёт и нести не должна: прислать их значило бы отдать
    // клиенту право на серверные факты.
    //
    // Раньше это расхождение пряталось за обычным `as`, который TypeScript терпел, пока сообщение
    // было меньше: правило «достаточного перекрытия» — эвристика по числу совпавших полей, а не
    // утверждение о совместимости. С ростом сообщения оно перестало срабатывать, и выбор был
    // между приведением каждого подсписка по отдельности (пять приведений, которые разъедутся
    // поодиночке) и одним честным здесь. Одно здесь и названо причиной.
  } as unknown as common_TechCardInsert;
}
