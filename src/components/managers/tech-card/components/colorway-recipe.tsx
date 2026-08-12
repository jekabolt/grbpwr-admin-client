import { useMutation, useQueryClient } from '@tanstack/react-query';
import { adminService } from 'api/api';
import {
  common_AdminColorwayRef,
  common_ColorwayDevelopmentInsert,
  common_ColorwayLabDipRound,
  common_Material,
  common_TechCard,
  common_TechCardColorwayUsage,
  common_TechCardLabDipStatus,
  common_TechCardSlotAreaEstimate,
  UpdateColorwayRequest,
  common_TechCardMarkerSummary,
} from 'api/proto-http/admin';
import {
  composeArticleFromMaterial,
  materialCompositionCode,
  materialSpec,
  parseCompositionCode,
} from 'components/managers/materials/components/material-code';
import {
  MaterialThumb,
  materialImageUrl,
} from 'components/managers/materials/components/material-thumb';
import { useMaterials } from 'components/managers/materials/components/useMaterials';
import { formatSizeName } from 'components/managers/product/utility/sizes';
import { techCardKeys } from 'components/managers/tech-cards/components/useTechCardQuery';
import { formatTechCardDate } from 'components/managers/tech-cards/components/utils';
import { techCardLabDipStatusOptions } from 'constants/filter';
import { composition as compositionDict } from 'constants/garment-composition';
import { useDictionary } from 'lib/providers/dictionary-provider';
import { useSnackBarStore } from 'lib/stores/store';
import { cn } from 'lib/utility';
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useFormContext, useWatch } from 'react-hook-form';
import { useSearchParams } from 'react-router-dom';
import { Button, buttonVariants } from 'ui/components/button';
import { CalloutBox } from 'ui/components/callout-box';
import { Chip, ChipRow } from 'ui/components/chip';
import { DataTable, EmptyCell } from 'ui/components/data-table';
import { GroupLabel } from 'ui/components/group-label';
import Media from 'ui/components/media';
import { Pill } from 'ui/components/pill';
import { Placeholder } from 'ui/components/placeholder';
import GenericPopover from 'ui/components/popover';
import { Row, RowTotal } from 'ui/components/row';
import { Section, SectionStack } from 'ui/components/section';
import { SectionHeader } from 'ui/components/section-header';
import Text from 'ui/components/text';
import { Tile, Tiles } from 'ui/components/tiles';
import { Toolbar, ToolbarSpacer } from 'ui/components/toolbar';
import { decimalToInput, inputToDecimal, parseDecimalNumber, sanitizeDecimal } from 'utils/decimal';
import { normSourceLabel } from './costing-vocab';
import { DxfApplyHint } from './dxf-apply';
import { MarkerApplyHint } from './marker-apply';
import { useCardDxfPack } from './nesting/card-dxf-pack';
import {
  findPiece,
  fmtCm,
  PieceShape,
  useDxfGeometry,
  useDxfIndex,
  type FoundPiece,
} from './nesting/dxf-geometry';
import {
  fullRollWidthOf,
  weightBasisLabel,
  weightBasisOf,
  weightRefusalText,
  type WeightBasisResolution,
} from './nesting/fabric-weight';
import {
  bomUnitKind,
  bomUnitStep,
  cardMarkers,
  markersForLine,
  markersOfColorway,
} from './nesting/marker-io';
import { sectionShort } from './bom-line-picker';
import {
  pieceBlockRefs,
  pieceRefKey,
  rollGoodsScopes,
  type PieceAliasRow,
} from './piece-block-refs';
import {
  derivePieceLayerRole,
  isMainLayerRole,
  isUnsortedLayerRole,
  pieceLayerRoleLabel,
} from './piece-layer-role';
import { PieceList, PieceRef, useFormPieces } from './piece-picker';
import { TechCardFormData, wireInt } from './schema';
import type { RecipePieceLink } from './use-fabric-dxf-pieces';
import {
  createColorwayErrorMessage,
  recipeSaveErrorMessage,
  useCreateColorway,
  useUpdateColorwayRecipe,
} from './useColorwayRecipe';
import { COMMIT_ORDER, useTechCardStaging } from './useTechCardStaging';

// Пересчёт dxf-нормы по текущим данным (Ф2) — lazy() ровно потому же, почему dxf-apply.tsx лениво
// тянет свой диалог: он подписывается на массивы формы и тянет мегабайты DXF с CDN, а NormSummary
// смонтирован для каждой строки каждого колорвея. Монтируется только ОТКРЫТОЙ раскрывашкой «из
// чего сложилось».
const DxfNormRecheck = lazy(() => import('./dxf-recheck'));

// Phase-02 field metrics: a full 1px box, 3px/7px padding, 22px min height — identical to <Input>,
// so a control in this locally-managed editor is indistinguishable from an RHF-bound one elsewhere.
const cell =
  'block min-h-[22px] w-full appearance-none border border-borderColor bg-bgColor px-[7px] py-[3px] text-textBaseSize focus:border-textColor focus:outline-none disabled:bg-bgZebra disabled:text-labelColor';

// Inside a DataTable variant='grid' cell the BORDER is the cell's, not the input's — an input with
// its own box inside a bordered cell is the box-in-box the reference exists to kill.
const gridInput =
  'block min-h-[22px] w-full appearance-none border-0 bg-transparent text-center text-textBaseSize outline-none focus:bg-bgSecondary disabled:text-labelColor';

const PENDING = 'TECH_CARD_LAB_DIP_STATUS_PENDING';
const SUBMITTED = 'TECH_CARD_LAB_DIP_STATUS_SUBMITTED';
const REJECTED = 'TECH_CARD_LAB_DIP_STATUS_REJECTED';
const APPROVED = 'TECH_CARD_LAB_DIP_STATUS_APPROVED';
const UNKNOWN_LAB_DIP = 'TECH_CARD_LAB_DIP_STATUS_UNKNOWN';

// Ink → gray fibre shades for the composition bar (grays only, per the brand palette). Inline
// because a bar of N segments needs N distinct fills — this is a chart, not a themed surface.
const COMP_SHADES = ['#111111', '#666666', '#aaaaaa', '#cccccc', '#dddddd'];

// Measured sections cost by a rate (consumption, per metre/gram) and support per-size grading; the
// rest are counted (quantity, per piece). Mirrors colorways-field.tsx so the per-size grid only
// appears where it's meaningful.
const MEASURED_SECTIONS = new Set([
  'TECH_CARD_BOM_SECTION_FABRIC',
  'TECH_CARD_BOM_SECTION_LINING',
  'TECH_CARD_BOM_SECTION_INTERLINING',
  'TECH_CARD_BOM_SECTION_INSULATION',
  'TECH_CARD_BOM_SECTION_THREAD',
  'TECH_CARD_BOM_SECTION_TRIM',
]);

const PIECE_SECTIONS = new Set([
  'TECH_CARD_BOM_SECTION_FABRIC',
  'TECH_CARD_BOM_SECTION_LINING',
  'TECH_CARD_BOM_SECTION_INTERLINING',
  'TECH_CARD_BOM_SECTION_INSULATION',
]);

// СЕКЦИИ, КОТОРЫЕ ЗАВОДЯТСЯ В РЕЦЕПТ — то есть получают КАРТОЧКУ ТКАНИ, есть на них строки или нет.
// Рулонные секции здесь — с решения владельца (2026-08-10): расход ткани — свойство ИЗДЕЛИЯ, и его
// норма живёт на карточке САМОЙ ТКАНИ, а не на детали. Строка детали справочная («из какой ткани
// кроится», см. PieceLinkRow) и блока расхода не несёт — не будь ткани в этом наборе, норме было бы
// негде жить.
const GARMENT_SECTIONS = new Set([
  'TECH_CARD_BOM_SECTION_FABRIC',
  'TECH_CARD_BOM_SECTION_LINING',
  // Дублерин — ТАКАЯ ЖЕ рулонная секция, и пропустить её значило бы оставить полуоткрытой ту самую
  // дыру, которую эта правка закрывает: клеевую детали назначить можно (она в PIECE_SECTIONS), а
  // норме её расхода было бы негде жить. Наборы обязаны совпадать по рулонным секциям целиком.
  'TECH_CARD_BOM_SECTION_INTERLINING',
  'TECH_CARD_BOM_SECTION_INSULATION',
  'TECH_CARD_BOM_SECTION_THREAD',
  'TECH_CARD_BOM_SECTION_HARDWARE',
  'TECH_CARD_BOM_SECTION_TRIM',
  'TECH_CARD_BOM_SECTION_DECORATION',
  'TECH_CARD_BOM_SECTION_INTERLINING',
]);

type BomLine = {
  id?: number;
  lineKey?: string;
  name?: string;
  section?: string;
  // НАЗНАЧЕНИЕ строки (0265) — вход производной РОЛИ СЛОЯ детали (T4, piece-layer-role.ts):
  // основная / подкладка / дублерин выводятся отсюда, нигде не хранясь.
  purpose?: string;
  unit?: string;
  unitPrice?: string; // decimal string
  currency?: string;
  wastagePercent?: string; // decimal string
  fabricWidth?: string; // decimal string, cm — this LINE's own cloth ROLL width, if it sets one
  // Read-only enrichment off the card read (0259): effectiveFabricWidthCm is
  // COALESCE(this line's width, the linked article's) — the roll the раскладка prefills from —
  // and selvedgeCm is that article's кромка per edge. Cutting width = roll − 2×selvedge, and
  // that is what a marker is laid on: comparing a marker against the ROLL width flags every
  // fabric with a кромка as a mismatch.
  effectiveFabricWidthCm?: string;
  selvedgeCm?: string;
  // structured { part: [{ code, percent }] } JSON on catalog-linked / picker-authored lines, free
  // text only on legacy rows — read it through parseCompositionCode, never with a bare regex.
  composition?: string;
  materialId?: number;
  // the linked catalog material (resolved from ListMaterials by materialId) — carries the photo,
  // article code, class and spec the recipe card renders. undefined for a legacy/unlinked line.
  material?: common_Material;
};

type RecipePiece = PieceRef & { id: number };

type UsageDraft = {
  bomLineKey: string;
  materialId: number;
  // placement/color/pantone predate article pinning and are round-tripped for legacy rows only —
  // no input renders them: the colour/pantone live on the effective article, the "where" on the
  // piece link. placement is still primed to the piece name on add for the PDF and legacy readers.
  placement: string;
  color: string;
  pantone: string;
  consumption: string;
  quantity: string;
  // preserved verbatim across the full-replace so a save never drops per-size grading / piece links.
  sizeConsumptions: { sizeId?: number; consumption?: string }[];
  pieceLineKey: string;
  // display-only (server-computed, stripped without costing:read).
  lineTotal: string;
  // Wastage provenance (0261). 'marker' = the norm came from a saved раскладка and its measured
  // length ALREADY contains the cutting waste, so costing must not gross it up again; '' =
  // typed by hand and the article's wastage_percent applies as before. The two pcts are the
  // display decomposition of a marker norm's waste (кромка / межлекальные выпады) and are NEVER
  // multiplied into a cost — they only explain where the length went.
  //
  // `undefined` is a THIRD state and not the same as '': it means this draft does not know the
  // provenance, and the field must then be OMITTED on the wire so the store carries the stored
  // triple forward. It arises only from a staged draft persisted by a build that predates these
  // fields — asserting '' there would silently downgrade every marker row to manual on restore.
  consumptionSource: string | undefined;
  wasteSelvedgePct: string;
  wasteCutPct: string;
  // Ф6.8 ШТАМП НОРМЫ: из КАКОЙ раскладки применён этот расход. `undefined` — то же ТРЕТЬЕ
  // состояние, что у consumptionSource выше, и по той же причине: «черновик не знает» обязано
  // ОПУСКАТЬ поле на проводе, чтобы полная замена строк не стёрла аудит, который этот клиент
  // просто не читал. 0 — явное «штампа нет» (пер-размерная норма, см. marker-apply).
  normMarkerId: number | undefined;
  // ПОКАЗ ТОЛЬКО. Серверная отметка «когда норму применили»: клиент её НЕ ШЛЁТ НИКОГДА, ровно
  // как labDipSubmittedAt и lineTotal. Нужна ей одна вещь — сравниться с updatedAt раскладки и
  // сказать, не перемеряли ли ту после применения.
  normAppliedAt: string | undefined;
};

// The provenance triple travels together: a norm is either marker-measured (with its
// decomposition) or hand-typed (with none). Retyping a number by hand makes it manual — leaving
// it marked «marker» would keep costing from applying the article's wastage to a figure that no
// longer contains any.
//
// normMarkerId (Ф6.8) НАРОЧНО НЕ ВХОДИТ В ЭТУ ТРОЙКУ. Демотацию в ручной режим сервер трактует
// сам: пришедший consumption_source='' снимает и штамп, и его дату. Дублировать здесь нулём
// значило бы завести второе место, которое обязано согласоваться с первым, — а строке нужно
// ровно обратное: пусть решает одна сторона.
const MANUAL_PROVENANCE = {
  consumptionSource: '',
  wasteSelvedgePct: '',
  wasteCutPct: '',
} as const;

// ПЕРЕНОСА НОРМЫ МЕЖДУ СЛОТАМИ БОЛЬШЕ НЕТ, и вместе с ним ушла проверка «та же ли это единица»
// (sameNormUnit). Строку рецепта переносил SlotPicker — выпадашка слота ВНУТРИ строки; с переходом
// на карточку ткани слот перестал быть полем: карточка И ЕСТЬ слот, а «перенести» читается как
// «убрать здесь и завести там». Ловушка, которую та проверка закрывала (число 1.42 из слота в
// метрах, продолжившее жить в слоте в сантиметрах), исчезла вместе с жестом — при разрыве связи
// число уходит вместе со строкой, а новая строка рождается пустой. Единственный оставшийся способ
// сменить ткань под уже посчитанной нормой — пин артикула, и его собственная ловушка (кг-норма
// закодировала основу веса КОНКРЕТНОГО артикула) закрыта отдельно, в обработчике пина.

// Lab-dip editing state (M8). Initialised from the colourway ref's labDip* fields; only the three
// WRITABLE leaves below travel back through UpdateColorway under LAB_DIP_UPDATE_MASK — see LabDipTimeline.
// submittedAt / decidedAt / decidedBy are READ-ONLY MIRRORS of the server's own audit stamps: they are
// carried here so the panel can show and reason about them, never mutated and never sent.
type LabDipDraft = {
  labDipStatus: string;
  labDipRound: string;
  labDipSubmittedAt: string;
  labDipDecidedAt: string;
  labDipDecidedBy: string;
  labDipRejectReason: string;
};

// The subset this client may actually change. `set` takes only these, so the read-only mirrors above
// cannot be written back into the draft by accident — the compiler is the guard, not a comment.
type LabDipWritable = Pick<LabDipDraft, 'labDipStatus' | 'labDipRound' | 'labDipRejectReason'>;

// What the grid tile needs to know about a recipe that is only fully known inside its editor: the
// LIVE usage-row count (including rows added but not yet saved) and whether anything here is waiting
// on the card's Save.
type RecipeStatus = { count: number; staged: boolean };

// What the recipe editor needs to rebuild itself after a refresh (19.6). A UsageDraft is already
// plain strings and arrays, so it goes over as-is — there is no Map to flatten. The lab-dip draft is
// six strings and is stored as itself.
type RecipeSnapshot = { usages: UsageDraft[] };

// The operator's word for a colourway — never its numeric id: a staged change labelled
// «колорвей 4127» names nothing anybody can find in the swatch grid.
function colorwayTitle(cw: common_AdminColorwayRef): string {
  return cw.colorCode?.trim() || cw.baseSku?.trim() || `#${cw.colorwayId}`;
}

// THE OPTIMISTIC LOCK, READ AT COMMIT TIME — never at render time. Both colourway writes echo the
// ref's lockVersion, which IS the shared tech_card.lock_version. Under one staged save the card body
// commits first (COMMIT_ORDER 0) and bumps that version, and so does every colourway write queued
// ahead of this one. A version captured when this panel rendered is therefore already stale by the
// time the header reaches it, and the save would 409 against its own card body. So re-read it
// immediately before each write — the same move the size chart makes with GetStyleSizeChart.
async function readColorwayVersion(
  techCardId: number,
  colorwayId: number,
  fallback: number,
): Promise<number> {
  const res = await adminService.GetTechCard({ id: techCardId, vatCountryCode: undefined });
  const ref = res.techCard?.colorways?.find((c) => c.colorwayId === colorwayId);
  return ref?.lockVersion ?? res.techCard?.lockVersion ?? fallback;
}

// How many recipe rows this draft actually changes against what the server returned. The write is a
// FULL REPLACE, but identity is the durable pair (piece_line_key || '', bom_line_key): the same slot
// may be used on several pieces, and per-garment rows deliberately carry an empty piece key.
function usageKey(u: Pick<UsageDraft, 'pieceLineKey' | 'bomLineKey'>): string {
  return `${u.pieceLineKey || ''}\u0000${u.bomLineKey}`;
}

// ДУБЛИ СЧИТАЮТСЯ ПОШТУЧНО, А НЕ СХЛОПЫВАЮТСЯ В КЛЮЧ. Прежняя версия складывала оба списка в
// Map<usageKey, signature>, и у двух строк с одинаковой парой (деталь, слот) ключ один: поздняя
// затирала раннюю. База [1, 2], правка первой на 3 → после схлопывания обе стороны видели «2», и
// `lines` оставался нулём: карточка не считала правку работой, «сохранить» её не отправлял, правка
// пропадала молча. Дубли — состояние ненормальное, но существующее (легаси и чужие записи), и
// сервер их СУММИРУЕТ, так что каждая из них влияет на деньги и обязана считаться отдельно.
//
// Сравнение внутри одного ключа — ПОЗИЦИОННОЕ: список строк рецепта упорядочен, полная замена
// отправляет его целиком в том же порядке, и «первая из двух» — это осмысленный адрес.
function changedLines(base: UsageDraft[], next: UsageDraft[]): number {
  const group = (rows: UsageDraft[]) => {
    const m = new Map<string, string[]>();
    for (const u of rows) {
      const k = usageKey(u);
      const list = m.get(k) ?? [];
      list.push(JSON.stringify(toWire(u)));
      m.set(k, list);
    }
    return m;
  };
  const before = group(base);
  const after = group(next);
  let n = 0;
  for (const [k, list] of after) {
    const prev = before.get(k) ?? [];
    // добавленная или изменённая на своей позиции
    for (let i = 0; i < list.length; i += 1) if (prev[i] !== list[i]) n += 1;
    // из дублей убрали часть — каждая убранная тоже правка
    if (prev.length > list.length) n += prev.length - list.length;
  }
  for (const [k, prev] of before) if (!after.has(k)) n += prev.length; // удалённые целиком
  return n;
}

// ПУСТАЯ ВО ВСЕХ ПОЛЯХ СТРОКА «НА ИЗДЕЛИЕ» — ЭТО НЕ СТРОКА. Ни расхода, ни количества, ни одной
// непустой ячейки размера, ни пина артикула: сохранять её значит завести на сервере запись, которая
// ничего не утверждает, но участвует в суммировании строк слота и в счётчиках экрана.
//
// Такая строка РОЖДАЕТСЯ ЗАКОННО и живёт на экране: нажатие «по размерам» на пустой карточке
// открывает сетку из пустых клеток — в неё сейчас будут печатать, и не дать ей появиться значило
// бы, что кнопка ничего не делает. Но до провода она доехать не имеет права, поэтому фильтр стоит
// на выходе (savableUsage), а не на входе.
//
// СТРОКА ДЕТАЛИ ПУСТОЙ НЕ БЫВАЕТ НИКОГДА, и это не оговорка, а весь смысл решения владельца
// (2026-08-10): её содержание — сама привязка «эта деталь кроится из этой ткани», а чисел она не
// несёт ПО УСТРОЙСТВУ. Посчитать её пустой значило бы, что каждое «назначить детали» тихо
// выбрасывается при сохранении, — то есть ровно тот дефект, из-за которого владелец назначил ткань
// девяти деталям и не увидел ничего.
function isBlankUsage(u: UsageDraft): boolean {
  if (u.pieceLineKey) return false;
  return (
    !u.consumption.trim() &&
    !u.quantity.trim() &&
    !u.sizeConsumptions.some((s) => (s.consumption ?? '').trim()) &&
    !u.materialId &&
    // ЛЕГАСИ-ПОЛЯ ТОЖЕ СОДЕРЖИМОЕ, и это не педантизм: строка, у которой заполнено только
    // размещение или цвет/пантон, — это то, что человек однажды напечатал, а «пустая» строка
    // отсюда уезжает не в никуда, а под нож полной замены. Новую строку это не воскрешает:
    // patchGarmentSlot рождает её с пустым placement (изделие одно, подставлять туда нечего),
    // так что проверка «ничего не изменилось» по-прежнему ловит холостое нажатие.
    !u.placement.trim() &&
    !u.color.trim() &&
    !u.pantone.trim()
  );
}

// ЧТО ВООБЩЕ УЕДЕТ НА СЕРВЕР. Одно правило на два места — на сам список записи и на счётчик правок:
// разойдись они, карточка либо обещала бы сохранить то, что выбросит, либо вечно висела бы
// «staged» из-за строки, которую всё равно не отправляет.
//
// Строка без bom_line_key не отправляется, потому что отправить её НЕЧЕМ: полная замена
// валидирует каждую строку, а неразрешимая ссылка роняет весь рецепт. Это НЕ безобидно — такая
// строка на сервере есть, и сохранение её удалит; экран обязан сказать это вслух (см. раздел
// «строки без слота»), а не тихо считать её сохранённой.
function savableUsage(u: UsageDraft): boolean {
  return !!u.bomLineKey && !isBlankUsage(u);
}

// UpdateColorway is a field-masked write. This mask lists ONLY the three WRITABLE lab-dip leaves INSIDE
// `development`, so a save touches exactly those columns and nothing else on the colourway. Everything else
// in the development submessage (devCode / name / pantone / pantoneSystem / devHex / swatchMediaId / usages /
// displayOrder) is left intact by the backend even though it is sent undefined here — that subpath mask is
// precisely what prevents clobbering. It also means no read-merge is needed (and none is possible: no read
// path returns those dev identity fields). `usages` stays owned by UpdateColorwayRecipe — never sent here.
// The paths are camelCase on purpose: that is the form the server matches, so do not "correct" them to the
// proto's snake_case — a mask it cannot match silently degrades into writing nothing.
//
// labDipSubmittedAt / labDipDecidedAt / labDipDecidedBy are DELIBERATELY ABSENT: the backend stamps those
// itself and discards whatever the client sends, so naming them here only promised the operator an edit that
// the very next refetch rubbed out. This list is a CONSTANT of three, never a diff of what changed — so the
// mask a save carries is always non-empty and always valid. The complementary half of that guarantee lives
// in LabDipTimeline: a draft whose only difference is in the read-only mirrors never stages a write at all.
const LAB_DIP_UPDATE_MASK = [
  'development.labDipStatus',
  'development.labDipRound',
  'development.labDipRejectReason',
].join(',');

// protobuf Timestamp (RFC 3339) -> YYYY-MM-DD, for display only. The 0001-01-01 zero value is "unset".
// There is no inverse any more: the lab-dip dates are read from the server and never written back to it.
function tsToDateInput(ts?: string): string {
  if (!ts || ts.startsWith('0001-01-01')) return '';
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(ts);
  return m ? m[1] : '';
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
// "2026-07-08" -> "08 jul" — the timeline reads as a date line, not an ISO stamp.
function fmtDay(v: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  if (!m) return v;
  return `${m[3]} ${MONTHS[Number(m[2]) - 1] ?? m[2]}`;
}

// Момент времени из серверной отметки — ЧИСЛОМ, для сравнения двух отметок между собой (Ф6.8).
//
// Сравнивать RFC-3339 СТРОКАМИ нельзя: «2026-08-08T10:00:00Z» и «2026-08-08T13:00:00+03:00» —
// один и тот же момент, а лексикографически это разные строки, и исход сравнения решает смещение
// зоны, а не время. Дробные секунды и «Z» против «+00:00» ломают его ровно так же.
//
// null означает «отметки нет» — пусто, нулевое значение protobuf или неразбираемая строка — и это
// НЕ эпоха: сравнение с отсутствующей отметкой не даёт права утверждать расхождение. Иначе все
// строки, применённые до Ф6.8 (а их большинство), разом объявились бы устаревшими.
function tsMillis(ts?: string): number | null {
  if (!ts || ts.startsWith('0001-01-01')) return null;
  const t = new Date(ts).getTime();
  return Number.isNaN(t) ? null : t;
}

// Initialise the editor from the colourway ref's mirrored lab-dip fields (techCard.colorways[].labDip*),
// instead of always starting empty. An UNKNOWN/absent status falls back to PENDING (the editor baseline).
function fromRefLabDip(cw: common_AdminColorwayRef): LabDipDraft {
  const status = cw.labDipStatus;
  return {
    labDipStatus: status && status !== UNKNOWN_LAB_DIP ? status : PENDING,
    labDipRound: cw.labDipRound ? String(cw.labDipRound) : '',
    labDipSubmittedAt: tsToDateInput(cw.labDipSubmittedAt),
    labDipDecidedAt: tsToDateInput(cw.labDipDecidedAt),
    labDipDecidedBy: cw.labDipDecidedBy ?? '',
    labDipRejectReason: cw.labDipRejectReason ?? '',
  };
}

// Has a round actually been submitted? The read path collapses "never submitted" and "round 1 pending"
// onto the same PENDING baseline (fromRefLabDip), so anything that only a real submission produces —
// a round number, a date, a decided status — is what distinguishes them.
function hasLabDipRound(d: LabDipDraft): boolean {
  return (
    (parseInt(d.labDipRound, 10) || 0) > 0 ||
    !!d.labDipSubmittedAt ||
    !!d.labDipDecidedAt ||
    d.labDipStatus === SUBMITTED ||
    d.labDipStatus === APPROVED ||
    d.labDipStatus === REJECTED
  );
}

// One row of the timeline. `staged` marks the round the draft is currently editing — the only row
// that is not straight off the server's journal.
type TimelineRound = {
  key: string;
  round: number;
  status: string;
  submittedAt: string; // YYYY-MM-DD (input form), as fmtDay expects
  decidedAt: string;
  decidedBy: string;
  rejectReason: string;
  comment: string;
  staged?: boolean;
};

function fromRecordedRound(r: common_ColorwayLabDipRound, i: number): TimelineRound {
  const status = r.status;
  return {
    key: `round-${r.roundNumber ?? i}`,
    round: r.roundNumber ?? 0,
    status: status && status !== UNKNOWN_LAB_DIP ? status : PENDING,
    submittedAt: tsToDateInput(r.submittedAt),
    decidedAt: tsToDateInput(r.decidedAt),
    decidedBy: r.decidedBy ?? '',
    rejectReason: r.rejectReason ?? '',
    comment: r.comment ?? '',
  };
}

// The substance of a round's verdict, next to (never duplicating) its status pill: why it was rejected,
// who approved it and when, or that it is still out at the dyehouse.
function roundOutcome(r: TimelineRound): string {
  if (r.status === REJECTED) return r.rejectReason.trim() || r.comment.trim();
  if (r.status === APPROVED)
    return [r.decidedBy, fmtDay(r.decidedAt)].filter(Boolean).join(' · ') || r.comment.trim();
  return r.comment.trim() || 'awaiting decision';
}

// Build the field-masked UpdateColorway request that persists ONLY this colourway's lab-dip state. Every
// non-lab-dip key is sent undefined AND left out of the mask, so merchandising / media / prices / tags and
// the rest of `development` are untouched. expected_colorway_version is passed IN rather than read off the
// ref: under the card's one save the shared tech_card.lock_version has usually moved since this panel
// rendered, so the caller reads it fresh (readColorwayVersion) right before the write.
function buildLabDipRequest(
  cw: common_AdminColorwayRef,
  draft: LabDipDraft,
  expectedColorwayVersion: number,
): UpdateColorwayRequest {
  const development: common_ColorwayDevelopmentInsert = {
    devCode: undefined,
    name: undefined,
    labDipStatus: draft.labDipStatus as common_TechCardLabDipStatus,
    comment: undefined,
    pantone: undefined,
    pantoneSystem: undefined,
    devHex: undefined,
    swatchMediaId: undefined,
    labDipRound: parseInt(draft.labDipRound, 10) || 0,
    // The audit trail is the SERVER's: it stamps submitted_at / decided_at / decided_by from the write
    // itself and ignores anything sent for them. Left undefined and out of the mask, same as every other
    // field this call does not own — sending them would be a lie the operator can see revert.
    labDipSubmittedAt: undefined,
    labDipDecidedAt: undefined,
    labDipDecidedBy: undefined,
    // Only meaningful when rejected; cleared otherwise so a stale reason never lingers.
    labDipRejectReason: draft.labDipStatus === REJECTED ? draft.labDipRejectReason.trim() : '',
    usages: undefined, // recipe is owned by UpdateColorwayRecipe — never write it through here.
    displayOrder: undefined,
  };
  return {
    colorwayId: cw.colorwayId ?? 0,
    expectedColorwayVersion,
    merchandising: undefined,
    development,
    mediaIds: undefined,
    tags: undefined,
    prices: undefined,
    updateMask: LAB_DIP_UPDATE_MASK,
    thumbnailMediaId: undefined,
    secondaryThumbnailMediaId: undefined,
    costPrice: undefined,
    countryCode: undefined,
    translations: undefined,
  };
}

// EXACTLY what buildLabDipRequest would put on the wire, as one comparable string — the three writable
// leaves in the normalised form the request sends them in. Two drafts with the same signature produce a
// byte-identical write, so comparing signatures instead of the whole draft answers the only question the
// header cares about: would saving this change anything? It ignores the read-only audit mirrors (the
// server owns those), collapses '' against '0' rounds and untrimmed reject reasons, and drops a reason
// that a non-rejected status would blank out anyway.
function labDipWire(d: LabDipDraft): string {
  return JSON.stringify([
    d.labDipStatus,
    String(parseInt(d.labDipRound, 10) || 0),
    d.labDipStatus === REJECTED ? d.labDipRejectReason.trim() : '',
  ]);
}

const labDipStatusLabel = new Map<common_TechCardLabDipStatus, string>(
  techCardLabDipStatusOptions.map((o) => [o.value, o.label]),
);

// Lab-dip status marker. Green = approved, red = rejected, blue = mid-flight (pending / submitted),
// grey = never submitted. Read-only, so a Pill and never a Chip.
function LabDipPill({ status }: { status?: string }) {
  const s = status && status !== UNKNOWN_LAB_DIP ? status : '';
  if (!s) return <Pill tone='mut'>no lab-dip</Pill>;
  const label = labDipStatusLabel.get(s as common_TechCardLabDipStatus) ?? s;
  const tone: 'ok' | 'warn' | 'attention' =
    s === APPROVED ? 'ok' : s === REJECTED ? 'warn' : 'attention';
  return <Pill tone={tone}>{label}</Pill>;
}

// The reference's `.sw`: a 12px colour square carrying a 1px ink outline. Unlike the big tile swatch
// (where the colour is the whole content and an outline would make it read as a box), an inline
// swatch this small needs the outline or a pale dye vanishes into the page.
function Swatch({ hex, title }: { hex?: string; title?: string }) {
  return (
    <span
      aria-hidden
      title={title ?? hex ?? undefined}
      className='inline-block size-3 shrink-0 border border-textColor'
      style={hex ? { backgroundColor: hex } : undefined}
    />
  );
}

// Field label at phase-02 density: 10px uppercase grey, tight above its control. FormLabel can't be
// reused here — it reads an RHF FieldContext this locally-managed editor doesn't have.
function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <Text size='micro' variant='label' component='span' className='block leading-none uppercase'>
      {children}
    </Text>
  );
}

// One server-owned fact, stated rather than offered for editing: label left, value right, the same
// label/value row the auto-journal uses for the rest of the card's audit trail.
function AuditRow({ label, value }: { label: string; value: string }) {
  return (
    <Row
      className='py-0.5'
      label={
        <Text size='micro' variant='label' component='span' className='uppercase'>
          {label}
        </Text>
      }
      value={
        <Text size='micro' variant={value ? 'default' : 'label'} component='span'>
          {value || '—'}
        </Text>
      }
    />
  );
}

// The lock version is read fresh immediately before the write, so a 409 here is a genuinely
// concurrent edit by someone else — not this card's own save racing itself.
function labDipSaveErrorMessage(e: unknown): string {
  const status = (e as { status?: number } | undefined)?.status;
  if (status === 409)
    return 'Someone else changed this colourway while you were saving — reload and re-apply the lab-dip change.';
  return e instanceof Error ? e.message : 'Failed to save lab-dip';
}

// Lab-dip write: UpdateColorway under the subpath mask above. Mirrors useUpdateColorwayRecipe — invalidate
// the tech-card detail, which is the read that carries colorways[].labDip* (the latest round), each ref's
// lockVersion AND colorways[].labDipRounds (the journal the timeline draws). A save appends to or amends
// that journal server-side, so refetching the detail is what makes the new round appear.
//
// The mutation is fired through mutateAsync from the staged commit, so a rejection propagates to the
// header instead of being swallowed here — the header is what reports the outcome now (19.3).
function useUpdateColorwayLabDip(techCardId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (req: UpdateColorwayRequest) => adminService.UpdateColorway(req),
    onSuccess: () => qc.invalidateQueries({ queryKey: techCardKeys.detail(techCardId) }),
  });
}

function measured(section?: string): boolean {
  return !section || MEASURED_SECTIONS.has(section);
}

// The width a раскладка for this usage would actually be laid on: the effective article's roll
// width minus its кромка on both edges (0259). The pinned material wins over the slot — a
// colourway pin can be a different cloth. '' when no width is known at all; a кромка wider than
// the roll is operator error the read must not turn into a negative width.
function cuttingWidthOf(material?: common_Material, slot?: BomLine, pinned = false): string {
  // РУЛОН — ИЗ ОБЩЕГО РЕЗОЛВЕРА (fullRollWidthOf), того же, что у основы веса (weightBasisOf).
  // Длина делится на РАСКРОЙНУЮ ширину, вес умножается на ПОЛНУЮ — но обе описывают ОДИН рулон,
  // и резолвить его в двух местах порознь значит дать им молча разойтись в том, КАКУЮ ткань они
  // считают. Резолвер ставит ЖИВОЕ поле строки раньше read-time обогащения (COALESCE 0259):
  // они равны всегда, когда поле заполнено, поэтому разница — ровно одно состояние «ширину
  // поправили в форме и ещё не сохранили», и прежний порядок в нём считал по старой ширине и
  // глушил проверку «ширина раскладки против ширины артикула» (см. простыню в fabric-weight).
  // Здесь остаётся только выбор КРОМКИ:
  //   pinned  — the colourway named a DIFFERENT cloth, so BOTH numbers come from it (taking the
  //             pin's width with the slot's кромка would describe a roll that does not exist);
  //   else    — the linked article's кромка, which is what selvedgeCm already is (0259).
  const rollRaw = fullRollWidthOf(material, slot, pinned);
  const selvedgeRaw = pinned
    ? material?.fabricAttrs?.selvedgeCm?.value || ''
    : slot?.selvedgeCm || '';
  const roll = parseDecimalNumber(rollRaw);
  if (!Number.isFinite(roll) || roll <= 0) return '';
  const sv = parseDecimalNumber(selvedgeRaw);
  const cut = roll - 2 * (Number.isFinite(sv) && sv > 0 ? sv : 0);
  return cut > 0 ? String(Math.round(cut * 100) / 100) : '';
}

// Resolve a stored usage into a draft. bom_line_key is the durable ref; fall back to resolving the
// server bom_item_id against the saved BOM lines so a legacy usage still points at the right line.
function fromRead(
  u: common_TechCardColorwayUsage,
  bomItems: BomLine[],
  pieces: RecipePiece[],
): UsageDraft {
  const bomItemId = wireInt(u.bomItemId);
  const byId = bomItemId ? bomItems.find((b) => b.id === bomItemId)?.lineKey : undefined;
  const piecesById = new Map(pieces.filter((piece) => piece.id).map((piece) => [piece.id, piece]));
  return {
    bomLineKey: u.bomLineKey || byId || '',
    materialId: wireInt(u.materialId),
    placement: u.placement || '',
    color: u.color || '',
    pantone: u.pantone || '',
    consumption: decimalToInput(u.consumption),
    quantity: decimalToInput(u.quantity),
    sizeConsumptions: (u.sizeConsumptions ?? []).map((s) => ({
      sizeId: s.sizeId,
      consumption: decimalToInput(s.consumption),
    })),
    pieceLineKey: u.pieceLineKey || piecesById.get(wireInt(u.pieceId))?.lineKey || '',
    lineTotal: decimalToInput(u.lineTotal),
    // The server normalises '' to 'manual', so a row this client has saved once reads back as
    // 'manual' while a hand edit writes ''. Both mean the same thing, and leaving them distinct
    // made a no-op edit (type 1.5 over 1.5) differ from its baseline signature and claim a
    // staged change that does not exist. Normalise on the way IN, one spelling from here on.
    consumptionSource: u.consumptionSource === 'manual' ? '' : u.consumptionSource || '',
    wasteSelvedgePct: decimalToInput(u.wasteSelvedgePct),
    wasteCutPct: decimalToInput(u.wasteCutPct),
    // Ф6.8, ОБА ДОСЛОВНО. Штамп не нормализуется в 0: отсутствие поля — это «сервер ничего не
    // сказал», и ровно оно обязано вернуться на провод отсутствием, иначе полная замена строк
    // сотрёт чужой аудит. Отметка времени читается только чтобы её показать.
    normMarkerId: u.normMarkerId,
    normAppliedAt: u.normAppliedAt,
  };
}

function toWire(d: UsageDraft): common_TechCardColorwayUsage {
  return {
    // durable ref (§2.3); the server resolves it to the real FK — positional index/id not sent.
    bomLineKey: d.bomLineKey || '',
    bomItemIndex: undefined,
    bomItemId: undefined,
    // Presence is intentional: 0 clears a pin and means “inherit the slot default”. Omitting this
    // on a full-replace write would preserve an old pin server-side instead of round-tripping the
    // editor's current state.
    materialId: d.materialId || 0,
    placement: d.placement.trim(),
    color: d.color.trim(),
    pantone: d.pantone.trim(),
    consumption: inputToDecimal(d.consumption),
    quantity: inputToDecimal(d.quantity),
    // ПУСТАЯ ЯЧЕЙКА РАЗМЕРА — ЭТО «НОРМЫ НЕТ», А НЕ ПОВОД УРОНИТЬ СОХРАНЕНИЕ. Раньше строка
    // отправлялась с consumption=undefined, и сервер отвечал «consumption must be a non-negative
    // number» на ВЕСЬ рецепт — то есть стёртая ячейка на одной ткани хоронила сохранение колорвея
    // целиком, причём сообщением, в котором не видно ни размера, ни слота. С приходом «по выкройкам»
    // пер-размерные строки становятся обычным делом, а «стереть ячейку и передумать» — обычным
    // жестом. Не отправить строку значит сказать ровно то, что оператор сделал: у этого размера
    // нормы нет (план подставит скаляр, если он есть, и честно откажет, если нет).
    sizeConsumptions: (d.sizeConsumptions ?? [])
      .filter((s) => s.sizeId && (s.consumption ?? '').trim() !== '')
      .map((s) => ({ sizeId: s.sizeId, consumption: inputToDecimal(s.consumption) })),
    pieceLineKey: d.pieceLineKey || '',
    pieceId: undefined,
    pieceIndex: undefined,
    // Wastage provenance (0261). Sent VERBATIM, including undefined: presence is what tells the
    // store «write what I say» instead of «preserve what you stored», so '' is a deliberate
    // reset to manual and undefined is «I don't know, keep yours». JSON.stringify drops the key
    // for undefined, which is exactly the carry-forward the store expects from a stale client —
    // and a draft restored from a pre-0261 snapshot IS one.
    consumptionSource: d.consumptionSource,
    wasteSelvedgePct: inputToDecimal(d.wasteSelvedgePct),
    wasteCutPct: inputToDecimal(d.wasteCutPct),
    // Ф6.8 ШТАМП НОРМЫ — ТОЧНО ТА ЖЕ ДИСЦИПЛИНА, ЧТО У consumptionSource ВЫШЕ, И ПО ТОЙ ЖЕ
    // ПРИЧИНЕ: дословно, включая undefined. JSON.stringify выбрасывает ключ со значением
    // undefined, и сервер читает ОТСУТСТВИЕ как «сохрани что было», а явный 0 — как «сними
    // штамп». Черновик, восстановленный из снимка сборки, которая про штамп не знала, — это
    // ровно тот случай, ради которого различие и заведено: подставить сюда 0 значило бы стереть
    // аудит применения на первом же сохранении соседнего поля.
    normMarkerId: d.normMarkerId,
    // output-only — never sent
    lineTotal: undefined,
    sizeRunTotal: undefined,
    // Отметку применения ставит СЕРВЕР и только при смене пары (источник, раскладка). Прислать
    // её отсюда значило бы обновлять её на каждом сохранении рецепта — то есть ГАСИТЬ индикатор
    // расхождения правкой любого соседнего поля.
    normAppliedAt: undefined,
  };
}

// Client-side preview of the whole-run spend for a measured usage (the backend computes the
// authoritative size_run_total): Σ(consumption_size × orderQty_size) × price × (1 + wastage%).
//
// A composition code as the operator reads it. The code slot holds different things depending on who
// wrote the line: the CompositionPicker stores garment-composition CODES ('COT'), a catalog-linked
// material stores its resolved fibre NAME ('хлопок органический'). Resolve what the table knows,
// print the rest as-is — the same `codeToName ?? code` rule the care-label generator uses.
const FIBRE_NAME_BY_CODE: Record<string, string> = (() => {
  const m: Record<string, string> = {};
  for (const cat of Object.values(compositionDict.garment_composition)) {
    for (const [name, code] of Object.entries(cat as Record<string, string>)) m[code] = name;
  }
  return m;
})();

// #29 — best-effort DERIVED fibre composition for a colourway, computed from its recipe's BOM lines.
// A line's `composition` is the structured { part: [{ code, percent }] } JSON on every catalog-linked
// or picker-authored line, and free text only on genuinely legacy rows — parseCompositionCode reads
// both (a regex hunting for an 'NN%' token finds NOTHING in the JSON, which is what used to leave this
// bar blank, or claiming "no readable composition", on cards whose blends were fully entered).
// Each line's fibres are weighted by that usage's per-garment consumption (fallback: equal weight),
// then normalised to 100%. Approximate by construction — flagged in the UI.
function deriveComposition(
  usages: UsageDraft[],
  bomItems: BomLine[],
  materials: common_Material[],
): { fibers: { name: string; percent: number }[]; skipped: number } {
  const totals = new Map<string, number>();
  let skipped = 0;
  for (const u of usages) {
    if (!u.bomLineKey) continue;
    const slot = bomItems.find((b) => b.lineKey === u.bomLineKey);
    const line = articleForUsage(
      slot,
      effectiveMaterial(u, slot, materials),
      effectiveMaterialId(u, slot),
    );
    const weight = Number(u.consumption) > 0 ? Number(u.consumption) : 1;
    const shares = parseCompositionCode(line?.composition);
    if (shares.length === 0) {
      skipped += 1;
      continue;
    }
    for (const s of shares) {
      const name = (FIBRE_NAME_BY_CODE[s.code] ?? s.code).trim().toLowerCase();
      if (!name || !Number.isFinite(s.percent) || s.percent <= 0) continue;
      totals.set(name, (totals.get(name) ?? 0) + (s.percent / 100) * weight);
    }
  }
  const sum = [...totals.values()].reduce((a, b) => a + b, 0);
  if (sum <= 0) return { fibers: [], skipped };
  const fibers = [...totals.entries()]
    .map(([name, v]) => ({ name, percent: Math.round((v / sum) * 1000) / 10 }))
    .sort((a, b) => b.percent - a.percent);
  return { fibers, skipped };
}

// Per-size consumption grading for one measured usage (ported from colorways-field.tsx into the
// live local-state editor, M8/§296). Two chips flip between «один на изделие» (the single
// consumption) ↔ «по размерам» (a grid of one input per declared card size), with a live run-cost
// preview using the referenced article's price/wastage.
function UsagePerSizeLocal({
  draft,
  sizeIds,
  article,
  unit,
  canEdit,
  rowAlive,
  sizeNameById,
  onChange,
}: {
  draft: UsageDraft;
  sizeIds: number[];
  article?: BomLine;
  // ЕДИНИЦА НОРМЫ, резолвленная блоком расхода (SlotNormBlock: единица слота, и только она) — здесь
  // подписываются поля ввода САМОЙ нормы, и брать единицу с эффективного артикула значило бы
  // подписать «кг» число, которое сервер хранит и считает в единице строки.
  unit: string;
  canEdit: boolean;
  /** Строка рецепта под этим редактором СУЩЕСТВУЕТ. false — черновик синтетический, см. ниже. */
  rowAlive: boolean;
  sizeNameById: Map<number, string>;
  onChange: (patch: Partial<UsageDraft>) => void;
}) {
  const perSize = draft.sizeConsumptions.length > 0;
  const lastPerSize = useRef<{ sizeId: number; consumption: string }[]>([]);
  // ЗАПАС «ЧТО БЫЛО ПО РАЗМЕРАМ» УМИРАЕТ ВМЕСТЕ СО СТРОКОЙ. Он существует ради одного жеста —
  // «один на изделие» → передумал → «по размерам» возвращает сетку, — и до перехода на карточку
  // ткани это было безопасно само собой: редактор жил внутри строки и размонтировался вместе с ней.
  // Теперь редактор принадлежит КАРТОЧКЕ, карточка переживает удаление строки, и реф пережил бы её
  // тоже: удалил пер-размерную строку, сохранил, нажал «по размерам» — и новая строка засеялась бы
  // числами, которых в данных больше нет, с видом законной нормы. Признак жизни строки приходит
  // сверху (hasRow), и его падение чистит запас.
  useEffect(() => {
    if (!rowAlive) lastPerSize.current = [];
  }, [rowAlive]);

  const consumptionBySize = new Map<number, string>();
  for (const e of draft.sizeConsumptions)
    if (e.sizeId != null) consumptionBySize.set(e.sizeId, e.consumption ?? '');

  // Every hand edit of the NUMBER drops the marker provenance (see MANUAL_PROVENANCE): the
  // decomposition described a length this figure no longer is, and costing must go back to
  // grossing the article's wastage on top. Switching the grading MODE counts too — «по
  // размерам» seeds cells from a scalar the marker measured for one size only.
  const manual = <T extends Partial<UsageDraft>>(patch: T) => ({ ...patch, ...MANUAL_PROVENANCE });

  const enablePerSize = () => {
    if (perSize) return;
    const prior = new Map(lastPerSize.current.map((e) => [e.sizeId, e.consumption]));
    onChange(
      manual({
        sizeConsumptions: sizeIds.map((id) => ({
          sizeId: id,
          consumption: prior.get(id) ?? draft.consumption ?? '',
        })),
      }),
    );
  };
  const disablePerSize = () => {
    if (!perSize) return;
    lastPerSize.current = draft.sizeConsumptions.map((e) => ({
      sizeId: e.sizeId ?? 0,
      consumption: e.consumption ?? '',
    }));
    onChange(manual({ sizeConsumptions: [] }));
  };
  const setSizeCell = (sizeId: number, value: string) => {
    const clean = sanitizeDecimal(value);
    const next = [...draft.sizeConsumptions];
    const i = next.findIndex((x) => x.sizeId === sizeId);
    if (i >= 0) next[i] = { sizeId, consumption: clean };
    else next.push({ sizeId, consumption: clean });
    onChange(manual({ sizeConsumptions: next }));
  };

  const currency = article?.currency ?? '';
  const hasAnyConsumption = sizeIds.some((id) => consumptionBySize.get(id)?.trim());

  return (
    <div className='flex flex-col gap-1.5'>
      <div className='flex flex-wrap items-center justify-between gap-2'>
        <FieldLabel>consumption{unit ? ` (${unit})` : ''}</FieldLabel>
        {sizeIds.length > 0 && canEdit && (
          <ChipRow>
            <Chip selected={!perSize} pressed={!perSize} onClick={disablePerSize}>
              один на изделие
            </Chip>
            <Chip selected={perSize} pressed={perSize} onClick={enablePerSize}>
              по размерам
            </Chip>
          </ChipRow>
        )}
      </div>

      {!perSize ? (
        <input
          className={cell}
          inputMode='decimal'
          disabled={!canEdit}
          placeholder='per garment'
          aria-label={`consumption per garment${unit ? ` (${unit})` : ''}`}
          value={draft.consumption}
          onChange={(e) => onChange(manual({ consumption: sanitizeDecimal(e.target.value) }))}
        />
      ) : (
        <div className='flex flex-col gap-1.5'>
          <DataTable variant='grid' className='[&_td]:text-micro'>
            <thead>
              <tr>
                <th>size</th>
                {sizeIds.map((id) => (
                  <th key={id}>{formatSizeName(sizeNameById.get(id) ?? `#${id}`)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>{unit ? `${unit} / garment` : 'per garment'}</td>
                {sizeIds.map((id) => (
                  <td key={id}>
                    <input
                      className={cn(gridInput, 'text-micro')}
                      inputMode='decimal'
                      disabled={!canEdit}
                      placeholder='0.00'
                      aria-label={`consumption ${formatSizeName(sizeNameById.get(id) ?? `#${id}`)}`}
                      value={consumptionBySize.get(id) ?? ''}
                      onChange={(e) => setSizeCell(id, e.target.value)}
                    />
                  </td>
                ))}
              </tr>
              {/* Строки «order qty» и «расход на партию» отсюда сняты вместе с типовым тиражом
                  карточки: у стиля своей партии нет, а норма по размерам — это спецификация, и
                  умножать её здесь было не на что, кроме выдуманного микса. Сколько уйдёт ткани на
                  конкретную партию, считает материальный план прогона по его собственным линиям. */}
            </tbody>
          </DataTable>
        </div>
      )}
    </div>
  );
}

// ── ОЦЕНКА РАСХОДА ПО ПЛОЩАДИ: СЕРАЯ СТРОКА ТАМ, ГДЕ НОРМЫ НЕТ (Ф1, §6.4) ───────────────────────
//
// Слот, у которого норму никто не вписал, до сих пор показывал прочерк — при том, что деньги за
// него в костинге УЖЕ посчитаны: сервер оценивает расход по площадям назначенных деталей. Экран,
// на котором расход пуст, а себестоимость не пуста, читается как поломка — и владелец читал его
// именно так.
//
// ТРИ ПРАВИЛА, И ВСЕ ТРИ — ПРО ТО, ЧТОБЫ НЕ ЗАВЕСТИ ВТОРОЕ ЧИСЛО.
//  1. ЗДЕСЬ НИЧЕГО НЕ СЧИТАЕТСЯ. Печатается то, что пришло. Вывести это на клиенте значило бы
//     реализовать формулу (площади ÷ раскройная ширина, среднее по ряду, лестница пина) второй
//     раз — и однажды рецепт напечатал бы одну цифру, а заголовок костинга другую, ничем этого
//     не выдав. По той же причине здесь нет ни одного `if` про «а если ширины нет»: причину
//     отказа формулирует сервер, одной фразой на систему (refusalText).
//  2. ЧИСЛО НЕ РЕДАКТИРУЕТСЯ И НЕ ХРАНИТСЯ. Оно вычислено из сегодняшних площадей и сегодняшних
//     назначений; дать его править значит превратить его в число-призрак, которое переживёт смену
//     выкроек и будет утверждать про них неправду. Превратить оценку в норму можно только двумя
//     названными действиями — уточнить раскладкой или вписать своё, — и оба заводят СВОЮ строку.
//  3. УСТАРЕВШИЙ ЗАМЕР ВИДЕН КАК УСТАРЕВШИЙ. Сервер в этом случае и числа не даёт (refusal =
//     areas_stale), но пилюля называет причину своим словом: «замер устарел» отправляет
//     перемерить площади, а общее «не посчитано» отправило бы искать везде сразу.
function NormEstimate({ estimate }: { estimate?: common_TechCardSlotAreaEstimate }) {
  const value = decimalToInput(estimate?.perGarment).trim();
  const unit = estimate?.unit?.trim() || '';
  const refusal = estimate?.refusal?.trim() || '';
  const refusalText = estimate?.refusalText?.trim() || '';
  const stale = estimate?.stale === true;
  const pieceCount = estimate?.pieceCount ?? 0;

  // Оценки нет вовсе (слот не рулонный, колорвей её не получил, старый ответ сервера) — прежний
  // честный прочерк. «Нет ответа» и «ответ: не считается» — разные состояния, и второе всегда
  // приходит с текстом.
  if (!estimate || (!value && !refusalText)) {
    return (
      <div className='flex flex-wrap items-baseline gap-1.5'>
        <FieldLabel>расход</FieldLabel>
        <Text size='small' variant='label' component='span'>
          —
        </Text>
      </div>
    );
  }

  // Условия замера — то, без чего площадь не число, а мнение: слой контура, припуск, дата разбора.
  // Сервер прислал их echo'м вместе с оценкой, чтобы строка описывала себя целиком.
  const seam = decimalToInput(estimate.seamAllowanceMm).trim();
  const parsedDay = formatTechCardDate(estimate.parsedAt);
  const basis = [
    pieceCount > 0
      ? `${pieceCount} ${plural(pieceCount, 'деталь', 'детали', 'деталей')} назначено`
      : '',
    estimate.contourLayer?.trim() ? `слой ${estimate.contourLayer.trim()}` : '',
    seam ? `припуск ${seam} мм` : '',
    parsedDay !== '—' ? `выкройки разобраны ${parsedDay}` : '',
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <div className='flex flex-col gap-1'>
      <div className='flex flex-wrap items-baseline gap-1.5'>
        <FieldLabel>расход</FieldLabel>
        {/* СЕРЫМ — и это не оформление, а утверждение: чёрное на этой карточке носит норма, серое
            носит вывод. Цветом состояния оценку красить нечем — она не ошибка и не мид-флайт. */}
        <Text size='small' variant='label' component='span' className='font-mono tabular-nums'>
          {value ? `${value}${unit ? ` ${unit}` : ''}` : '—'}
        </Text>
        {stale ? (
          <Pill tone='attention' title={refusalText || undefined}>
            замер устарел
          </Pill>
        ) : value ? (
          <Pill tone='mut'>оценка по площади</Pill>
        ) : (
          <Pill tone='mut'>оценка не посчитана</Pill>
        )}
      </div>
      {value && basis && (
        <Text size='nano' variant='label' component='p'>
          {basis}
        </Text>
      )}
      {value && (
        <Text size='nano' variant='label' component='p'>
          это NETTO и нижняя граница: межлекальных выпадов и концов настила в ней нет — их знает
          только раскладка. Число считает сервер по сегодняшним площадям, оно не хранится и не
          правится: уточните раскладкой либо впишите своё — вписанная норма всегда сильнее
          выведенной
        </Text>
      )}
      {/* ОТКАЗ ПЕЧАТАЕТСЯ ДОСЛОВНО И БЕЗ ДОБАВОК. Сервер уже назвал причину и уже назвал действие,
          одной фразой на систему; переписать её здесь значило бы завести второй перевод, который
          разойдётся с формулировками костинга. Машинный код причины (`refusal`) уходит в title —
          он нужен поддержке, а на экране оператора это шум. */}
      {refusalText && (
        <Text size='nano' variant='label' component='p' title={refusal || undefined}>
          {refusalText}
        </Text>
      )}
    </div>
  );
}

// ── ЧИСЛО И ЕГО ПРОИСХОЖДЕНИЕ, ПЕРВЫМ ЭЛЕМЕНТОМ СТРОКИ ──────────────────────────────────────────
//
// Показывает норму как РЕЗУЛЬТАТ, а не как поле ввода: значение, бейдж источника и раскрывашку с
// разбором netto → brutto. До 0294 строка начиналась пустым инпутом, и порядок элементов сообщал,
// что расход ткани вводят руками.
//
// ВСЁ НА `<details>` И ТЕКСТЕ, НИ ОДНОЙ КНОПКИ. На выпущенной (RELEASED) карточке вкладка целиком
// лежит внутри `<fieldset disabled>`, а он глушит любую кнопку — раскрывашка на `<button>` там
// умерла бы молча. `<details>` disabled не берёт: разбор нормы читается и на замороженной карточке,
// где он нужнее всего (менять уже нельзя, а понять, из чего сложилась цена, надо).
function NormSummary({
  draft,
  unit,
  sizeIds,
  sizeNameById,
  slotWastagePercent,
  articleWidth,
  recipeLinks,
  weightBasis,
  estimate,
}: {
  draft: UsageDraft;
  unit: string;
  /** Размерный ряд карточки — для проверки «ряд шире нормы» и пересчёта по текущим данным (Ф2). */
  sizeIds: number[];
  sizeNameById: Map<number, string>;
  slotWastagePercent: string;
  articleWidth: string;
  /** Привязки «деталь → слот» из строк рецепта — второй источник комплекта деталей. */
  recipeLinks?: readonly RecipePieceLink[];
  /** Основа веса кг-слота (Ф3) — резолвится строкой расхода (SlotNormBlock), одна на все. */
  weightBasis: WeightBasisResolution;
  /** Серверная оценка расхода по площади — рисуется ТОЛЬКО там, где нормы нет (см. ниже). */
  estimate?: common_TechCardSlotAreaEstimate;
}) {
  // Открыта ли раскрывашка — локальный стейт через onToggle: пересчёт dxf-нормы по текущим данным
  // тянет подписки на массивы формы и мегабайты DXF, а NormSummary смонтирован для КАЖДОЙ строки
  // КАЖДОГО колорвея одновременно. Закрытая раскрывашка обязана стоить ноль, поэтому тяжёлая часть
  // (DxfNormRecheck) монтируется только открытой и приезжает lazy().
  const [open, setOpen] = useState(false);
  // ПОРЯДОК — РАЗМЕРНЫЙ РЯД КАРТОЧКИ, не порядок сохранённых строк: «m · l · s · xs · xl» из
  // порядка записи прочитать нельзя, и глазом не поймать, что чисел пять из пяти. Размер вне ряда
  // (легаси) уходит в конец в порядке записи — sort стабилен, копия из-за мутирующего sort.
  const sizeOrder = new Map(sizeIds.map((id, i) => [id, i]));
  const perSize = [...draft.sizeConsumptions]
    .filter((s) => s.sizeId && (s.consumption ?? '').trim())
    .sort(
      (a, b) =>
        (sizeOrder.get(a.sizeId ?? 0) ?? sizeIds.length) -
        (sizeOrder.get(b.sizeId ?? 0) ?? sizeIds.length),
    );
  const scalar = draft.consumption.trim();
  // ПУСТОЙ РАСХОД НАЗЫВАЕТСЯ ПРОЧЕРКОМ, А НЕ МОЛЧАНИЕМ (и это изменение вместе с переходом на
  // карточку ткани). Раньше блок расхода существовал только там, где строку рецепта уже завели, и
  // отсутствие числа было отсутствием ВСЕГО блока. Теперь карточка есть у каждого слота BOM, и
  // «нормы ещё нет» — её самое частое состояние: не сказать этого прочерком значило бы показать
  // ткань, у которой про расход не написано ничего, — ровно то, на что жаловался владелец.
  //
  // Ни бейджа источника, ни раскрывашки «из чего сложилось» здесь нет намеренно: у пустой нормы
  // источника не бывает, а разбор сочинил бы «число набрано руками» про число, которого никто не
  // набирал. Инструменты (раскладка, выкройки, ручной ввод) идут НИЖЕ и говорят за себя сами.
  //
  // ЗДЕСЬ ЖЕ ЖИВЁТ СЕРВЕРНАЯ ОЦЕНКА (Ф1) — и только здесь: она существует ровно там, где строки
  // рецепта нет, потому что авторская норма всегда сильнее выведенной (сервер по тому же правилу
  // оценку для слота со строкой не публикует вовсе). Отдельного места ей не заводится намеренно:
  // «сколько уходит ткани» — один вопрос, и два ответа в разных углах экрана — это ровно та
  // двусмысленность, которую карточка ткани убрала.
  if (!scalar && perSize.length === 0) {
    return <NormEstimate estimate={estimate} />;
  }

  const source = draft.consumptionSource;
  const isMarker = source === 'marker';
  const isDxf = source === 'dxf';
  // Слова — из общего словаря костинга: полоса себестоимости называет тот же источник теми же
  // тремя словами, и вторая копия литералов разошлась бы с этой при первой же правке.
  const label = normSourceLabel(source);
  // ПЕР-РАЗМЕРНАЯ НОРМА ПОБЕЖДАЕТ СКАЛЯР — ровно как на сервере: при непустых size_consumptions
  // LineTotal невалиден, себестоимость стиля берёт СРЕДНЕЕ ПО РАЗМЕРНОМУ РЯДУ (T6; весь ряд или
  // строка непосчитана), а план прогона читает
  // SizeConsumptions → Consumption → Quantity. Скаляр при этом никуда не девается (пер-размерное
  // применение раскладки его не чистит), и показать его крупно с бейджем «из раскладки» значило бы
  // назвать нормой число, которого ни один расчёт не берёт. Он остаётся подписью — он всё ещё
  // работает, но только на размеры вне ряда.
  // Числа — колонкой: моноширинно и одной разрядностью (0.88 → 0.880 рядом с 0.917) — дробная
  // часть добивается нулями до самой длинной, ноль хвоста числу не врёт, а ряд выравнивается.
  // Размер — ПРОПИСНЫМИ, единица — строчной фразой ПОСЛЕ ряда, не в заголовке: «(М)» в
  // верхнерегистровом заголовке читалось разом как «метры» и как размер M, и различить было нечем.
  const fracLen = (v: string) => /^\d+\.(\d+)$/.exec(v.trim())?.[1]?.length ?? 0;
  const maxFrac = perSize.reduce((m, s) => Math.max(m, fracLen(s.consumption ?? '')), 0);
  const padDecimal = (v: string) => {
    const m = /^(\d+)(?:\.(\d+))?$/.exec(v.trim());
    if (!m || maxFrac === 0) return v.trim();
    return `${m[1]}.${(m[2] ?? '').padEnd(maxFrac, '0')}`;
  };
  const perSizeText = perSize
    .map(
      (s) =>
        `${formatSizeName(sizeNameById.get(s.sizeId ?? 0) ?? `#${s.sizeId}`).toUpperCase()} ${padDecimal(s.consumption ?? '')}`,
    )
    .join(' · ');
  const scalarFallback = perSize.length > 0 && scalar ? `${scalar}${unit ? ` ${unit}` : ''}` : '';

  // Разбор говорит РОВНО то, что известно этой строке, и ни слова сверх. Марочная норма знает свои
  // проценты отходов (они внутри длины); норма с выкроек знает, что она netto и что процент слота
  // начисляется поверх; ручная не знает ничего — и это тоже ответ.
  const explain: string[] = [];
  if (isMarker) {
    explain.push(
      draft.wasteSelvedgePct || draft.wasteCutPct
        ? `измеренная длина раскладки на изделие; отходы уже внутри: кромка ${draft.wasteSelvedgePct || '0'}% + межлекальные ${draft.wasteCutPct || '0'}% от площади деталей`
        : 'измеренная длина раскладки на изделие; отходы уже внутри, разложение не записано',
    );
    explain.push(
      slotWastagePercent.trim()
        ? `процент раскроя слота (${slotWastagePercent}%) НЕ начисляется — иначе отходы посчитались бы дважды`
        : 'процент раскроя слота не начисляется — иначе отходы посчитались бы дважды',
    );
  } else if (isDxf) {
    explain.push(
      `NETTO: Σ(площадь деталей × количество на изделие) ÷ раскройная ширина${articleWidth ? ` (${articleWidth} см)` : ''}`,
    );
    // КРОМКА ЗДЕСЬ НЕ НАЗЫВАЕТСЯ СРЕДИ ТОГО, ЧТО ДОНАЧИСЛЯЕТ ПРОЦЕНТ, — и это арифметика, а не
    // формулировка (прежний текст называл, и оператор, поверивший ему, заложил бы кромочную
    // составляющую в процент — двойной учёт). Netto-длина получена делением площади на
    // РАСКРОЙНУЮ ширину (рулон − 2×кромка): купленный метр рулона несёт кромку с собой, то есть
    // кромка УЖЕ оплачена самим делением, ровно один раз. Полный разбор с числами — в шапке
    // dxf-apply-dialog.tsx.
    explain.push(
      slotWastagePercent.trim()
        ? `межлекальные выпады и концы настила в число НЕ входят — их доначисляет процент раскроя слота (${slotWastagePercent}%); кромка в процент не входит: она уже оплачена делением на раскройную ширину, и закладывать её туда — посчитать дважды`
        : '⚠ межлекальные выпады и концы настила в число не входят, а процент раскроя слота НЕ ЗАДАН — себестоимость и потребность занижены (кромки это не касается: она уже внутри, делением на раскройную ширину)',
    );
    explain.push('раскладка, когда появится, даст измеренное число и заменит это');
  } else {
    explain.push('число набрано руками — проверить его не по чему');
    explain.push(
      slotWastagePercent.trim()
        ? `костинг начисляет сверху процент раскроя слота (${slotWastagePercent}%)`
        : 'процент раскроя слота не задан — сверху ничего не начисляется',
    );
  }
  // Кг-слот (Ф3): инструментальная норма в килограммах посчитана ЧЕРЕЗ ДЛИНУ, и основа перевода
  // называется вслух — ширина здесь ПОЛНАЯ, с кромкой (её покупают, и она весит), в отличие от
  // раскройной в знаменателе длины. Основа — СЕГОДНЯШНЯЯ: применяли, возможно, при другой, и
  // именно это проверяет пересчёт ниже. ИСТОЧНИК основы назван честно: плотность — артикула, а
  // ширина сознательно берётся с ПЕРЕОПРЕДЕЛЕНИЯ строки BOM, когда оно есть (fullRollWidthOf) —
  // «основа артикула» отправляла бы проверять не то поле. Ручной ввод в кг никто не переводил —
  // про него молчим.
  if ((isMarker || isDxf) && bomUnitKind(unit) === 'kg') {
    explain.push(
      weightBasis.ok
        ? `килограммы — через длину: метры × ${weightBasisLabel(weightBasis.basis)} ÷ 100000. Основа сегодняшняя: плотность — артикула, ширина — строки BOM, если она переопределяет артикул`
        : `килограммы считаются через длину, но сегодня основы веса нет: ${weightRefusalText(weightBasis.missing, weightBasis.pinned)}`,
    );
  }

  // РЯД ШИРЕ НОРМЫ — ИНВАРИАНТ СТРОКИ, А НЕ ОБЪЯСНЕНИЕ, поэтому видим всегда, не за раскрывашкой:
  // опасное состояние, показанное только тому, кто и так пошёл разбираться, — не показано никому.
  // Условие шире, чем dxf, сознательно: пер-размерные числа есть, скаляра нет, а какой-то размер
  // ряда без числа — тогда план прогона (SizeConsumptions[размер] → Consumption → Quantity) на этот
  // размер не получит норму ВООБЩЕ, из какого бы источника ряд ни пришёл. На dxf-строках дефект
  // просто гарантирован: применение по выкройкам скаляр снимает, и размер, добавленный в ряд после
  // применения, остаётся ни с чем. Геометрии проверка не требует — только пропсы.
  //
  // ЗАПОЛНЕННОЕ `quantity` ГАСИТ ПРОВЕРКУ, потому что тогда её утверждение неверно: у цепочки
  // подстановки есть третье звено, и непокрытый размер возьмёт штуки. Строки с обоими полями лежат
  // с 0079 (ровно поэтому серверный отказ на `dxf` + `quantity` не распространён на manual), и на
  // такой строке костинг вообще считает штуки × цену, игнорируя весь ряд. Это отдельный legacy-
  // дефект, и говорить о нём словами «плана не увидит расход вовсе» значило бы соврать.
  //
  // ГАСИТ ТОЛЬКО ПОЛОЖИТЕЛЬНЫЙ ЗАПАС: скаляр «0» и quantity «0» — это не подстановка, а ноль ткани,
  // и предъявлять их как причину молчать значило бы прикрыть дыру нулём. А вот пер-размерный ноль
  // ОСТАЁТСЯ покрытием сознательно: отсутствие ячейки — «никто не сказал», введённый ноль — сказанное
  // «столько», и второе не наше дело перетолковывать (у тесьмы на части размеров ноль бывает
  // законным). Пилюля отвечает за молчание ряда, а не за содержимое чужих чисел.
  const positive = (v?: string) => {
    const n = parseDecimalNumber(v ?? '');
    return Number.isFinite(n) && n > 0;
  };
  const coveredSizes = new Set(perSize.map((s) => s.sizeId ?? 0));
  const uncoveredSizes =
    perSize.length > 0 && !positive(scalar) && !positive(draft.quantity)
      ? sizeIds.filter((id) => !coveredSizes.has(id))
      : [];
  // Сравнение «было/сейчас» определено для метров, сантиметров и (с Ф3) килограммов — кг при
  // условии, что у слота есть основа веса; делить площадь без раскройной ширины не на что. Все
  // три факта известны ЗДЕСЬ, из пропсов, — и решаются до монтирования тяжёлой части: качать
  // мегабайты DXF ради строки, которую всё равно не с чем сравнить, незачем. Причина по ширине
  // называется двояко не из вежливости: cuttingWidthOf отдаёт пустую строку и когда ширина не
  // заполнена, и когда кромка съела её целиком. Отказ кг-слота называет, ЧЕГО не хватает —
  // ширины или плотности: «единица не принимает» отправила бы оператора менять единицу вместо
  // того, чтобы заполнить артикул.
  const unitStep = bomUnitStep(unit);
  const recheckBlocked =
    unitStep == null
      ? unit
        ? `для единицы «${unit}» пересчёт по текущим выкройкам не считается — сравнивать умеем метры, сантиметры и килограммы`
        : // Пустая единица — не «неизвестная»: у неё есть адресная починка, и отказ обязан её
          // называть — заполнить единицу на вкладке BOM, а не менять что-то в рецепте.
          'у слота не заполнена единица — норма пишется и читается в единице слота; заполните её на вкладке BOM'
      : bomUnitKind(unit) === 'kg' && !weightBasis.ok
        ? `пересчёт по текущим выкройкам не делается: ${weightRefusalText(weightBasis.missing, weightBasis.pinned)}`
        : !(parseDecimalNumber(articleWidth) > 0)
          ? 'пересчёт по текущим выкройкам не делается: раскройная ширина артикула неизвестна — либо не заполнена ширина рулона, либо кромка съедает её целиком'
          : '';

  return (
    <div className='flex flex-col gap-1'>
      <div className='flex flex-wrap items-baseline gap-1.5'>
        <FieldLabel>расход{perSize.length > 0 ? ' по размерам' : ''}</FieldLabel>
        {perSize.length > 0 ? (
          <>
            <Text size='small' component='span' className='font-mono tabular-nums'>
              {perSizeText}
            </Text>
            {unit && (
              <Text size='nano' variant='label' component='span'>
                {`в ${unit} на изделие`}
              </Text>
            )}
          </>
        ) : (
          <Text size='small' component='span'>
            {scalar ? `${scalar}${unit ? ` ${unit}` : ''}` : '—'}
          </Text>
        )}
        <Pill tone={isMarker || isDxf ? 'mut' : 'attention'}>{label}</Pill>
        {scalarFallback && (
          <Text size='nano' variant='label' component='span'>
            {`единая норма ${scalarFallback} осталась в строке и работает только на размеры вне ряда`}
          </Text>
        )}
      </div>
      {uncoveredSizes.length > 0 && (
        <div className='flex flex-wrap items-center gap-1.5'>
          <Pill tone='attention'>
            {`нет нормы: ${uncoveredSizes
              .map((id) => formatSizeName(sizeNameById.get(id) ?? `#${id}`))
              .join(', ')}`}
          </Pill>
          <Text size='nano' variant='label' component='span'>
            ряд не покрывает эти размеры, а единой нормы в строке нет — план прогона для них не
            увидит расход вовсе
          </Text>
        </div>
      )}
      <details className='text-nano' onToggle={(e) => setOpen(e.currentTarget.open)}>
        <summary className='cursor-pointer uppercase'>из чего сложилось</summary>
        <ul className='list-disc pl-4 pt-1'>
          {explain.map((line, i) => (
            <li key={i}>
              <Text size='nano' variant='label' component='span'>
                {line}
              </Text>
            </li>
          ))}
        </ul>
        {/* Ф2: пересчёт по текущим данным — только для dxf-нормы и только ОТКРЫТОЙ раскрывашкой.
            Единица решается здесь, до ленивой части: качать мегабайты DXF ради строки «кг не
            сравниваем» незачем. */}
        {isDxf && (
          <div className='flex flex-col gap-0.5 pt-1'>
            {recheckBlocked ? (
              <Text size='nano' variant='label' component='span'>
                {recheckBlocked}
              </Text>
            ) : (
              open && (
                <Suspense
                  fallback={
                    <Text size='nano' variant='label' component='span'>
                      пересчитываем по текущим данным карточки…
                    </Text>
                  }
                >
                  <DxfNormRecheck
                    lineKey={draft.bomLineKey}
                    unit={unit}
                    articleWidth={articleWidth}
                    weightBasis={weightBasis}
                    sizeIds={sizeIds}
                    sizeNameById={sizeNameById}
                    recipeLinks={recipeLinks}
                    saved={perSize}
                  />
                </Suspense>
              )
            )}
          </div>
        )}
      </details>
    </div>
  );
}

// The one-word material class ("тип"): fabric / hardware / thread / packaging — the same rule the
// catalog card uses, kept local so the recipe card badges class the way the BOM catalogue does.
function materialClassLabel(c?: string): string {
  return c && c !== 'MATERIAL_CLASS_UNKNOWN' ? c.replace('MATERIAL_CLASS_', '').toLowerCase() : '';
}

// The material rendered as the SAME square article card the BOM tab shows — identical fields in the
// same order (photo · section+тип pills · name · code · spec+colour) so a usage reads as the concrete
// effective article, never as the slot's role name. An unresolved id stays visible as `артикул #ID`.
function RecipeMaterialCard({
  slot,
  material,
  materialId,
}: {
  slot?: BomLine;
  material?: common_Material;
  materialId?: number;
}) {
  const url = materialImageUrl(material);
  const section = sectionShort(slot?.section);
  // A fabric-class article in a fabric slot would badge "fabric fabric" — the class earns a pill
  // only when it says something the section doesn't (e.g. a thread-class article on a trim slot).
  const rawKlass = materialClassLabel(material?.materialClass);
  const klass = rawKlass === section ? '' : rawKlass;
  const name = material?.name?.trim() || (materialId ? `артикул #${materialId}` : 'нет артикула');
  const code = material ? composeArticleFromMaterial(material, true) : '';
  const spec = material
    ? [materialSpec(material), material.color?.trim()].filter(Boolean).join(' · ')
    : '';

  return (
    <div className='flex min-w-0 flex-col gap-1'>
      <span className='relative block aspect-square w-full overflow-hidden border border-borderColor'>
        {url ? (
          <Media src={url} alt={name} aspectRatio='1/1' fit='cover' />
        ) : (
          <Placeholder aspect='square' label='no photo' />
        )}
      </span>
      {(section || klass) && (
        <div className='flex flex-wrap items-center gap-1'>
          {section && <Pill tone='mut'>{section}</Pill>}
          {klass && <Pill tone='mut'>{klass}</Pill>}
        </div>
      )}
      <Text component='span' size='control' className='block truncate font-bold'>
        {name}
      </Text>
      {code && (
        <Text component='span' size='micro' className='block truncate font-mono tabular-nums'>
          {code}
        </Text>
      )}
      {spec && (
        <Text component='span' size='micro' variant='label' className='block truncate'>
          {spec}
        </Text>
      )}
    </div>
  );
}

function materialLabel(material: common_Material): string {
  const code = material.code?.trim() || composeArticleFromMaterial(material, true);
  return [material.name?.trim() || `#${wireInt(material.id)}`, code].filter(Boolean).join(' · ');
}

function effectiveMaterialId(draft: UsageDraft, slot?: BomLine): number {
  return draft.materialId || slot?.materialId || 0;
}

function effectiveMaterial(
  draft: UsageDraft,
  slot: BomLine | undefined,
  materials: common_Material[],
): common_Material | undefined {
  const id = effectiveMaterialId(draft, slot);
  return id ? materials.find((m) => wireInt(m.id) === id) : undefined;
}

// Cost/composition previews must follow the effective concrete article, not the slot's default
// snapshot. Costing-gated price data can be absent; in that case the server remains authoritative.
function articleForUsage(
  slot: BomLine | undefined,
  material: common_Material | undefined,
  materialId: number,
): BomLine | undefined {
  if (!slot) return undefined;
  if (!material) {
    const pinnedOutsideCatalog = materialId > 0 && materialId !== slot.materialId;
    return {
      ...slot,
      material: undefined,
      unitPrice: pinnedOutsideCatalog ? '' : slot.unitPrice,
      currency: pinnedOutsideCatalog ? '' : slot.currency,
      composition: pinnedOutsideCatalog ? '' : slot.composition,
    };
  }
  const isDefault = wireInt(material.id) === slot.materialId;
  return {
    ...slot,
    material,
    materialId: wireInt(material.id),
    unit: material.unit?.trim() || slot.unit,
    unitPrice: decimalToInput(material.latestPrice?.price) || (isDefault ? slot.unitPrice : ''),
    currency: material.latestPrice?.currency || (isDefault ? slot.currency : ''),
    composition: materialCompositionCode(material) || (isDefault ? slot.composition : ''),
  };
}

// ЭФФЕКТИВНЫЙ АРТИКУЛ СТРОКИ И ВСЁ, ЧТО ИЗ НЕГО СЛЕДУЕТ — ОДНОЙ ФУНКЦИЕЙ, потому что мест, которым
// это нужно, стало два: шапка карточки (она называет ткань и правит пин) и КАЖДАЯ строка расхода
// этого слота — а строк бывает больше одной, и у второй законно может стоять СВОЙ пин. Считать это
// в двух местах порознь значит дать шапке и норме описывать разные ткани: ширина, плотность и цена
// разъедутся молча, и разъедутся ровно там, где стоит пин, — то есть в самом опасном случае.
function resolveSlotArticle(draft: UsageDraft, slot: BomLine, materials: common_Material[]) {
  const material = effectiveMaterial(draft, slot, materials);
  const materialId = effectiveMaterialId(draft, slot);
  // "Pinned" = пин на ДРУГОЙ артикул, чем у слота: пин обратно на свой же артикул — та же ткань,
  // и переопределение ширины на строке всё ещё описывает её. То же условие уходит в cuttingWidthOf.
  const pinnedDifferent = draft.materialId > 0 && draft.materialId !== slot.materialId;
  return {
    material,
    materialId,
    pinnedDifferent,
    // ОСНОВА ВЕСА кг-слота (Ф3) и РАСКРОЙНАЯ ширина считаются здесь и только здесь: ни раскладка,
    // ни выкройки, ни пересчёт не должны выбирать ширину и плотность сами.
    weightBasis: weightBasisOf(material, slot, pinnedDifferent),
    articleWidth: cuttingWidthOf(material, slot, pinnedDifferent),
    article: articleForUsage(slot, material, materialId),
  };
}

function ArticlePinSelect({
  draft,
  slot,
  materials,
  canEdit,
  onChange,
}: {
  draft: UsageDraft;
  slot?: BomLine;
  materials: common_Material[];
  canEdit: boolean;
  onChange: (materialId: number) => void;
}) {
  const sameSection = materials.filter(
    (material) =>
      material.section === slot?.section &&
      (!material.archived || wireInt(material.id) === draft.materialId),
  );
  const otherSections = materials.filter(
    (material) => material.section !== slot?.section && !material.archived,
  );
  const pinned = draft.materialId
    ? materials.find((material) => wireInt(material.id) === draft.materialId)
    : undefined;
  const missingPin = draft.materialId > 0 && !pinned;
  const archivedPinOutsideSection =
    !!pinned && !!pinned.archived && pinned.section !== slot?.section;
  return (
    <select
      className={cell}
      value={draft.materialId}
      disabled={!canEdit || !slot}
      aria-label='артикул колорвея'
      onChange={(e) => onChange(wireInt(e.target.value))}
    >
      <option value={0}>default — {slot?.material?.name?.trim() || 'нет'}</option>
      {missingPin && <option value={draft.materialId}>(unknown / removed article)</option>}
      {pinned && archivedPinOutsideSection && (
        <option value={draft.materialId}>{materialLabel(pinned)} (не для секции)</option>
      )}
      {sameSection.map((material) => (
        <option key={wireInt(material.id)} value={wireInt(material.id)}>
          {materialLabel(material)}
        </option>
      ))}
      {otherSections.length > 0 && (
        <optgroup label='другие секции'>
          {otherSections.map((material) => (
            <option key={wireInt(material.id)} value={wireInt(material.id)}>
              {materialLabel(material)} · {sectionShort(material.section) || 'unknown'}
            </option>
          ))}
        </optgroup>
      )}
    </select>
  );
}

// A fresh usage for a piece that has none yet: no fabric, its placement primed to the piece name so
// the PDF and legacy readers still get a human label the moment a fabric is picked.
function blankDraft(pieceLineKey: string, placement: string): UsageDraft {
  return {
    bomLineKey: '',
    materialId: 0,
    placement,
    color: '',
    pantone: '',
    consumption: '',
    quantity: '',
    sizeConsumptions: [],
    pieceLineKey,
    lineTotal: '',
    ...MANUAL_PROVENANCE,
    // Новая строка ничего ниоткуда не применяла, и сказать это можно ЯВНО: сохранять здесь нечего
    // (на сервере такой строки ещё нет), а 0 читается тем же правилом, что и везде, — «штампа нет».
    normMarkerId: 0,
    normAppliedAt: undefined,
  };
}

// Orphan triage follows the same durable row identity as dirty tracking. A removed piece can still
// carry several slots, so neither the piece key nor the BOM key is unique by itself.
const orphanKey = (u: UsageDraft) => usageKey(u);

type IndexedUsage = { draft: UsageDraft; index: number };

// ── РАСХОД ОДНОЙ ТКАНИ НА ИЗДЕЛИЕ ───────────────────────────────────────────────────────────────
//
// Это БЫВШАЯ строка раздела «на изделие» (SlotUsageRow) — целиком, со всем стеком нормы: число и
// его происхождение (NormSummary), мост из раскладки (MarkerApplyHint), мост по выкройкам
// (DxfApplyHint), пер-размерная сетка, ручной ввод, пилюли провенанса / штампа / дрейфа. Она
// переехала ВНУТРЬ карточки ткани и отдала карточке ровно две вещи: выбор слота (карточка И ЕСТЬ
// слот) и плашку артикула с пином (она в шапке карточки — там же, где имя ткани).
//
// СТРОКИ РЕЦЕПТА МОЖЕТ ЕЩЁ НЕ БЫТЬ, и это нормальное состояние, а не пустой экран: карточка есть у
// каждого слота BOM, а строка рождается первым же изменением (patchGarmentSlot). Поэтому здесь нет
// ни одной ветки «строки нет» — весь стек работает с пустым черновиком ровно так же, как с
// сохранённым, а onChange уходит в «найди строку этого слота или заведи её».
function SlotNormBlock({
  slot,
  draft,
  hasRow,
  materials,
  readOnly,
  estimate,
  markers,
  cardMarkersAllColorways,
  recipeLinks,
  colorwayId,
  techCardId,
  sizeIds,
  sizeNameById,
  canEdit,
  active,
  onChange,
  onRemove,
}: {
  /** id карточки — только чтобы применение нормы могло опубликовать измеренные площади (Ф0). */
  techCardId: number;
  /** Слот этой нормы. Всегда РАЗРЕШЁН: карточку рисует сама строка BOM, а не ссылка на неё. */
  slot: BomLine;
  draft: UsageDraft;
  /** Строка рецепта уже существует. false — черновик синтетический, и отвязывать нечего. */
  hasRow: boolean;
  /**
   * Каталог артикулов: эффективный артикул СВОЕЙ строки резолвится здесь, а не приходит с карточки.
   * У второй строки того же слота законно бывает СВОЙ пин, и посчитанные по чужому пину ширина,
   * плотность и цена описывали бы не ту ткань, из которой эта норма снята.
   */
  materials: common_Material[];
  /**
   * ТОЛЬКО ЧТЕНИЕ. Карточка секции, которую рецепт не заводит (упаковка, этикетка), существует
   * ради ПОЧИНКИ легаси-строк, а не ради заведения новых: ввод здесь создал бы и сохранил строку
   * расхода в секции, которую GARMENT_SECTIONS исключает. Убрать существующую строку при этом
   * можно — это и есть починка.
   */
  readOnly?: boolean;
  /**
   * Серверная ОЦЕНКА расхода по площади (Ф1) для этого слота. Публикуется РОВНО там, где строки
   * рецепта нет: авторская норма всегда сильнее выведенной, и сервер по этому же правилу для слота
   * со строкой оценку не присылает вовсе.
   */
  estimate?: common_TechCardSlotAreaEstimate;
  markers?: common_TechCardMarkerSummary[];
  /**
   * Раскладки карточки ПО ВСЕМ колорвеям — только чтобы объяснить пустоту. `markers` выше уже
   * сужены до своего колорвея (markersOfColorway), и это правильно: длина раскладки измерена на
   * артикуле СВОЕГО колорвея. Но тогда «раскладки на этот слот нет» — полуправда, когда пять
   * раскладок лежат в соседнем колорвее, и оператор видит их на вкладке выкроек.
   */
  cardMarkersAllColorways?: common_TechCardMarkerSummary[];
  /** Привязки «деталь → слот» из строк рецепта — второй источник комплекта деталей. */
  recipeLinks?: readonly RecipePieceLink[];
  // Чей рецепт редактируется — для ранжирования маркеров (свой важнее свежего общего).
  colorwayId?: number;
  sizeIds: number[];
  sizeNameById: Map<number, string>;
  canEdit: boolean;
  /** Редактор этого колорвея сейчас виден — см. ColorwayRecipeEditor.active. */
  active: boolean;
  onChange: (patch: Partial<UsageDraft>) => void;
  onRemove: () => void;
}) {
  // Артикул СВОЕЙ строки — со своим пином (см. materials выше). Резолвится ОДИН раз на строку.
  const { material, article, articleWidth, weightBasis } = resolveSlotArticle(
    draft,
    slot,
    materials,
  );
  // Правка нормы и УБРАТЬ строку — разные права. На карточке секции вне рецепта первое запрещено,
  // второе нет: карточка там существует ровно ради того, чтобы легаси-строку можно было убрать.
  const normEditable = canEdit && !readOnly;
  const isMeasured = measured(slot.section);
  const legacyCountedMeasured =
    isMeasured &&
    !!draft.quantity.trim() &&
    !draft.consumption.trim() &&
    draft.sizeConsumptions.length === 0;
  // ЕДИНИЦА НОРМЫ — ЕДИНИЦА СТРОКИ BOM, И ТОЛЬКО ОНА. Норма хранится и читается сервером в
  // единице СТРОКИ; единица артикула — это единица СКЛАДА, и это ДВЕ РАЗНЫЕ единицы: пин
  // колорвея на артикул другой размерности ЗАКОНЕН, сервер сам конвертирует норму слота в
  // единицу склада для закупки (ветка «слот в метрах, склад в кг» в
  // internal/dto/production_material_plan.go). Старый порядок «артикул первым» не конвертировал,
  // а ПЕРЕИМЕНОВЫВАЛ: пин kg-артикула на строку с 1.42 метра показывал «1.42 кг» — молча, с
  // сохранением источника нормы, ошибкой в ~20 раз прямо в себестоимости и закупке.
  //
  // ФОЛБЭКА В ЕДИНИЦУ АРТИКУЛА НА ПУСТОЙ ЕДИНИЦЕ СЛОТА ТОЖЕ НЕТ, и это исправление, а не
  // потеря: фолбэк срабатывал ровно на строке без единицы — и тогда инструменты ЗАПИСЫВАЛИ
  // число в единице артикула, которую не читает никто (сервер и половина прогонов читают
  // единицу СЛОТА; прогоны на пустой единице честно отказывают — контракты расходились).
  // Пустая единица теперь один ответ на всех поверхностях: отказ, называющий починку —
  // заполнить единицу на вкладке BOM, — а не догадка, которую негде проверить. Плашка артикула
  // и цена законно остаются в единицах самого артикула (articleForUsage / unitPrice) — их не
  // трогать.
  const unit = slot.unit?.trim() || '';
  // РУЛОННАЯ ЛИ ЭТО СЕКЦИЯ — вход двух гейтов ниже. PIECE_SECTIONS здесь не «где бывают детали»,
  // а именно рулонность: набор дословно совпадает с ROLL_GOODS_SECTIONS сервера (см. копии в
  // bom-purpose.ts и piece-layer-role.ts).
  const rollGoods = PIECE_SECTIONS.has(slot.section ?? '');

  // ── ШТАМП НОРМЫ И РАСХОЖДЕНИЕ (Ф6.8) ────────────────────────────────────────────────────
  //
  // Строка помнит, ИЗ КАКОЙ раскладки снят её расход, и когда. Отсюда — единственный вопрос,
  // на который она до Ф6.8 ответить не могла: раскладку с тех пор перемеряли, число ещё живое?
  //
  // Штамп читается только на строке, чей расход СЕЙЧАС марочный. Ручная правка числа снимает
  // consumption_source (MANUAL_PROVENANCE), и подпись «применена из раскладки» под числом,
  // набранным руками, была бы прямой ложью — даже если сервер ещё не успел снять штамп.
  const stampedId = draft.consumptionSource === 'marker' ? draft.normMarkerId ?? 0 : 0;
  // Ищется по ВСЕМУ переданному списку раскладок — тому же, из которого применяли. FK на
  // раскладку не заведён СОЗНАТЕЛЬНО (§6.4): раскладки удаляют, и висящий id значит ровно
  // «раскладку удалили» — это правда о данных, а не их порча.
  const stampedMarker = stampedId ? markers?.find((m) => (m.id ?? 0) === stampedId) : undefined;
  const appliedMs = tsMillis(draft.normAppliedAt);
  const markerMs = tsMillis(stampedMarker?.updatedAt);
  // РАСХОЖДЕНИЕ УТВЕРЖДАЕТСЯ, ТОЛЬКО КОГДА ЕСТЬ ОБЕ ОТМЕТКИ. Отсутствие даты применения — не
  // «применено в эпоху»: так расхождение объявилось бы у каждой строки, применённой до того, как
  // штамп начали ставить, и индикатор с первого дня кричал бы на всём.
  const normDrifted = appliedMs != null && markerMs != null && markerMs > appliedMs;
  const appliedDay = formatTechCardDate(draft.normAppliedAt);
  const markerDay = formatTechCardDate(stampedMarker?.updatedAt);
  // Раскладка называется ИМЕНЕМ — тем самым, которым её выбирали в диалоге применения. Номер
  // остаётся только там, где имени взять негде: у удалённой раскладки его уже никто не помнит.
  const stampedName = stampedMarker
    ? `«${stampedMarker.name?.trim() || `#${stampedId}`}»`
    : `#${stampedId}`;
  const normStampText = [
    appliedDay !== '—'
      ? `норма применена ${appliedDay} из раскладки ${stampedName}`
      : `норма применена из раскладки ${stampedName}`,
    normDrifted ? `раскладка изменена ${markerDay} — число могло устареть` : '',
  ]
    .filter(Boolean)
    .join('; ');

  // Форма карточки нужна диалогу «по выкройкам»: выкройки, детали кроя и их связи с блоками живут
  // в ней, а не в рецепте (рецепт — серверный, правится своим RPC).
  const { control } = useFormContext<TechCardFormData>();
  // Норма ЕСТЬ и её дал ИНСТРУМЕНТ (раскладка или выкройки) — тогда ручной ввод уходит за
  // раскрывашку. Нормы нет вовсе — туда же: на пустой строке первым надо предлагать посчитать, а не
  // угадать. Инлайном остаётся уже набранное руками число (см. комментарий у раскрывашки) — и весь
  // НЕРУЛОННЫЙ слот целиком: у нитки, тесьмы и фурнитуры ручной ввод не аварийный выход, а
  // единственный способ (раскладок на нитку не снимают, выкроек у неё нет), и прятать его там за
  // раскрывашку значило бы спрятать сам смысл строки.
  const derivedNorm = draft.consumptionSource === 'marker' || draft.consumptionSource === 'dxf';
  const hasNorm =
    !!draft.consumption.trim() ||
    draft.sizeConsumptions.some((s) => (s.consumption ?? '').trim() !== '');
  const manualInline = (!derivedNorm && hasNorm) || !rollGoods;
  // Оценка ПОКАЗАНА ЧИСЛОМ — тогда ручной ввод перестаёт быть аварийным выходом и становится вторым
  // из двух названных действий («вписать своё»). Отказ оценки числом не является: он объясняет,
  // чего не хватает, и ручной ввод при нём — по-прежнему просто ручной ввод.
  const estimateShown = !hasNorm && !!decimalToInput(estimate?.perGarment).trim();
  // Раскладки ИМЕННО ЭТОГО слота — считаются здесь, чтобы решить, монтировать ли подсказку вовсе.
  // MarkerApplyHint на пустом списке и так возвращает null, но платит за это шестью useState и
  // двумя подписками на массивы формы; карточка теперь есть у КАЖДОГО слота BOM, а не только у
  // тех, где норму уже завели, так что «смонтировать и вернуть null» подорожало ровно во столько
  // раз, во сколько слотов больше строк.
  const lineMarkers = markersForLine(markers, draft.bomLineKey).length;

  return (
    <div className='flex min-w-0 flex-col gap-2'>
      {/* ПИН — СВОЙСТВО СТРОКИ, А НЕ КАРТОЧКИ, поэтому пилюля стоит здесь: у второй строки того же
          слота законно бывает другой артикул, и один пин в шапке описывал бы обе. Правится он всё
          так же в шапке — но правится пин ПЕРВОЙ строки, и это честно: карточка называет ткань по
          ней же. */}
      {draft.materialId > 0 && (
        <span>
          <Pill tone='mut'>
            пин: {material?.name?.trim() || `артикул #${draft.materialId}`}
          </Pill>
        </span>
      )}
      {isMeasured && !legacyCountedMeasured ? (
        <div className='flex flex-col gap-1.5'>
          {/* ЧИСЛО И ОТКУДА ОНО — ПЕРВЫМ, ИНСТРУМЕНТЫ ВТОРЫМИ, РУКИ ПОСЛЕДНИМИ.
              До 0294 первым элементом строки стоял пустой инпут, а «применить из раскладки» —
              припиской под ним. Экран этим сообщал, что расход ткани ВВОДЯТ, и ручной ввод
              оказывался путём наименьшего сопротивления — при том, что и раскладка, и выкройки
              дают проверяемое число, а набранное руками ещё и умножается на процент раскроя «на
              глаз». Порядок здесь — это и есть утверждение о том, чему верить. */}
          <NormSummary
            draft={draft}
            unit={unit}
            sizeIds={sizeIds}
            sizeNameById={sizeNameById}
            slotWastagePercent={slot.wastagePercent ?? ''}
            articleWidth={articleWidth}
            recipeLinks={recipeLinks}
            weightBasis={weightBasis}
            estimate={estimate}
          />
          {/* Ф4: измеренный маркером расход этого слота, применяемый в ЭТОТ драфт — через
              тот же onChange, которым staged-рецепт и живёт. */}
          {lineMarkers > 0 && (
            <MarkerApplyHint
              markers={markers}
              colorwayId={colorwayId}
              lineKey={draft.bomLineKey}
              unit={unit}
              wastagePercent={slot.wastagePercent ?? ''}
              // The article's CUTTING width — roll minus the кромка on both edges — because
              // that is the width a marker is laid on and records.
              articleWidth={articleWidth}
              // Основа веса кг-слота — та же, что у остальных инструментов строки (см. выше).
              weightBasis={weightBasis}
              sizeIds={sizeIds}
              sizeNameById={sizeNameById}
              canEdit={normEditable}
              // Патч уходит в черновик ЦЕЛИКОМ — вместе с ним и штамп нормы (normMarkerId, Ф6.8)
              // наравне с consumptionSource. Перечислять поля здесь поимённо значило бы завести
              // список, который обязан догонять marker-apply: провенанс и число разъехались бы
              // ровно в тот день, когда кто-то добавит там поле и забудет здесь.
              onApply={(patch) => onChange(patch)}
            />
          )}
          {/* 0294: тот же мост, но от ВЫКРОЕК — для карточки, на которой раскладки ещё нет.
              Число netto, и диалог сам не даёт применить его на слот без процента раскроя.

              МОНТИРУЕТСЯ ТОЛЬКО НА РЕДАКТИРУЕМОЙ КАРТОЧКЕ, ТОЛЬКО В АКТИВНОМ КОЛОРВЕЕ И ТОЛЬКО НА
              РУЛОННОМ СЛОТЕ, и это не косметика: подсказка держит три подписки на массивы формы
              (BOM, детали кроя, связи блоков), а редакторы ВСЕХ колорвеев смонтированы
              одновременно (скрытые — не размонтированные). Гейт по рулонности не теряет ничего:
              useFabricDxfPieces строит скоупы ТОЛЬКО по рулонным строкам (isRollGoodsSection), то
              есть на нитке и фурнитуре комплект деталей пуст по построению и кнопки не бывает —
              раньше за это платили подписками. Тот же приём, что у силуэтов деталей (shapes
              отдаются только активному редактору). Ранний выход внутри компонента цену не убирает —
              хуки уже подписаны к моменту возврата; потерять при переключении плитки тут нечего —
              подсказка ничего не хранит, черновик живёт выше. */}
          {normEditable && active && rollGoods && (
            <DxfApplyHint
              control={control}
              lineKey={draft.bomLineKey}
              unit={unit}
              wastagePercent={slot.wastagePercent ?? ''}
              articleWidth={articleWidth}
              weightBasis={weightBasis}
              sizeIds={sizeIds}
              sizeNameById={sizeNameById}
              canEdit={normEditable}
              // Строка без нормы обязана услышать, ЧЕГО не хватает для расчёта по выкройкам, а не
              // остаться с одним «ввести руками…». Где норма уже есть — молчим: там это шум.
              explainWhenIdle={!hasNorm}
              recipeLinks={recipeLinks}
              techCardId={techCardId}
              onApply={(patch) => onChange(patch)}
            />
          )}
          {/* ПУСТАЯ НОРМА ОБЯЗАНА СКАЗАТЬ, ЧЕГО ЖДЁТ, А НЕ ПРЕДЛАГАТЬ ОДИН ЛИШЬ РУЧНОЙ ВВОД.
              Каждый инструмент выше возвращает ПУСТОТУ, когда ему нечего предложить: нет снятой
              раскладки на слот — нет подсказки; нет деталей кроя этой ткани или размерного ряда —
              нет кнопки «по выкройкам». Пустота вместо кнопки была осознанной (кнопка, которая
              всегда отказывает, читается как поломка), но объяснения вместо неё не осталось: на
              строке без нормы весь блок расхода схлопывался в одну свёрнутую «ввести руками…», и
              экран выглядел ровно так же, как до появления инструментов, — то есть предлагал
              угадать, ничего не сказав про то, что число вообще-то считается.

              Здесь говорится ТОЛЬКО про раскладку — про неё эта строка и знает (маркеры у неё в
              пропсах). Про выкройки отвечает сама подсказка «по выкройкам» (dxf-apply.tsx): у неё
              есть комплект деталей, и утверждать за неё отсюда значило бы однажды сказать «выкроек
              нет» рядом с её же кнопкой.

              Только для РУЛОННОГО слота: на нитке и тесьме обещание «посчитаем по выкройкам»
              было бы ложным (площади деталей к ним не применяются), а ручной ввод у них и так
              стоит развёрнутым — сказать там нечего. */}
          {rollGoods &&
            !hasNorm &&
            lineMarkers === 0 &&
            (() => {
              // РАСКЛАДКА МОЖЕТ БЫТЬ — ПРОСТО НЕ ЗДЕСЬ, и это надо сказать прямо. `markers` уже
              // сужены до своего колорвея, поэтому «раскладки нет» без этой ветки прозвучало бы
              // на карточке, где раскладки видны на вкладке выкроек, — оператор считает экран
              // сломанным, и он прав по-своему.
              const foreign = markersForLine(
                cardMarkersAllColorways ?? [],
                draft.bomLineKey,
              ).length;
              return (
                <Text size='nano' variant='label' component='p'>
                  расход не вводят руками, его считают: с раскладки — измеренной длиной настила,
                  либо по выкройкам — площадью деталей кроя ÷ раскройную ширину.{' '}
                  {foreign > 0
                    ? `Раскладки на этот слот сняты (${foreign}), но в ДРУГОМ колорвее: их длина измерена на его артикуле, и предложить её здесь значило бы подменить ширину полотна — отличие выглядело бы совершенно нормальным числом. Снимите раскладку в этом колорвее либо посчитайте по выкройкам.`
                    : 'Раскладки на этот слот пока нет, поэтому предложить снять с неё нечего.'}
                </Text>
              );
            })()}
          {/* РУЧНОЙ ВВОД ОСТАЁТСЯ НАВСЕГДА — и остаётся ЗА РАСКРЫВАШКОЙ, когда норму уже дал
              инструмент или когда её нет вовсе. Он нужен: без него первый же странный DXF
              остановил бы производство, а тесьме на метраж выкроек не бывает. Но предлагать его
              первым значит предлагать угадать там, где можно посчитать.

              УЖЕ НАБРАННОЕ РУКАМИ ЧИСЛО ПОКАЗЫВАЕТСЯ ИНЛАЙНОМ. Спрятать его под раскрывашку
              значило бы наказать за легаси того, кто пришёл поправить свою же строку. */}
          {manualInline ? (
            <UsagePerSizeLocal
              draft={draft}
              sizeIds={sizeIds}
              article={article}
              unit={unit}
              canEdit={normEditable}
              rowAlive={hasRow}
              sizeNameById={sizeNameById}
              onChange={onChange}
            />
          ) : (
            <details className='border border-hairline px-2 py-1'>
              {/* «ВПИСАТЬ СВОЁ» — там, где сервер уже показал оценку: это второе из двух действий,
                  которыми оценку превращают в норму (первое — уточнить раскладкой, кнопка выше).
                  Без оценки формулировка прежняя: ручной ввод — аварийный выход, а не предложение. */}
              <summary className='cursor-pointer text-micro uppercase'>
                {estimateShown ? 'вписать своё…' : 'ввести руками…'}
              </summary>
              <div className='pt-1.5'>
                <UsagePerSizeLocal
                  draft={draft}
                  sizeIds={sizeIds}
                  article={article}
                  unit={unit}
                  canEdit={normEditable}
                  rowAlive={hasRow}
                  sizeNameById={sizeNameById}
                  onChange={onChange}
                />
              </div>
            </details>
          )}
        </div>
      ) : (
        <label className='flex flex-col gap-1 lg:max-w-xs'>
          {/* Слово «расход» — то же, что у измеряемых слотов, и это не оговорка: у пуговицы расход
              тоже расход, просто считается штуками. Прежнее «quantity» было единственным местом на
              карточке, где та же величина называлась по-английски и другим словом. */}
          <FieldLabel>расход на изделие{unit ? ` (${unit})` : ''}</FieldLabel>
          <input
            className={cell}
            inputMode='decimal'
            disabled={!normEditable}
            value={draft.quantity}
            onChange={(e) => onChange({ quantity: sanitizeDecimal(e.target.value) })}
          />
        </label>
      )}

      {/* Provenance of the norm (0261): a marker-measured figure is priced WITHOUT the
          article's wastage gross-up, and that is a costing-visible difference the operator
          must be able to see on the row that causes it. */}
      {draft.consumptionSource === 'marker' && (
        <div className='flex flex-wrap items-center gap-1.5'>
          <Pill tone='mut'>из раскладки</Pill>
          <Text size='nano' variant='label' component='span'>
            {draft.wasteSelvedgePct || draft.wasteCutPct
              ? `отходы уже внутри: кромка ${draft.wasteSelvedgePct || '0'}% + выпады ${draft.wasteCutPct || '0'}%`
              : 'отходы уже внутри нормы; разложение не записано'}
            {slot.wastagePercent?.trim() ? ` · ${slot.wastagePercent}% слота не начисляются` : ''}
          </Text>
          {/* МАРОЧНАЯ СТРОКА БЕЗ ШТАМПА — НЕ ТО ЖЕ, ЧТО МАРОЧНАЯ СО ШТАМПОМ, и молчать об этом
              нельзя. До 0291 штамп не ставили, а пер-размерное применение из нескольких раскладок
              ставит 0 намеренно: такие строки честно говорят «снято с раскладки», но КАКОЙ — уже
              не помнят, и индикатор «раскладку перемеряли» за ними не следит. Раньше здесь не
              показывалось ничего, и строка выглядела прослеживаемой наравне со штампованной. */}
          {(draft.normMarkerId ?? 0) === 0 && (
            <Pill
              tone='mut'
              title='у этой нормы не записано, из какой именно раскладки её сняли (применение до Ф6.8 либо несколько раскладок на размерный ряд). Число верное, но следить за изменениями раскладки нечем — примените заново, если нужна прослеживаемость'
            >
              ссылка на раскладку потеряна
            </Pill>
          )}
        </div>
      )}

      {/* 0294: отдельного блока про источник «по выкройкам» здесь НЕТ намеренно. Бейдж стоит у
          числа (NormSummary), а разбор netto→brutto и предупреждение о пустом проценте раскроя —
          в его раскрывашке. Второй такой же бейдж строкой ниже читался бы как повтор, а не как
          слоистость: у марочной нормы блок ниже говорит то, чего у числа нет (разложение отходов,
          штамп, дрейф), а у нормы с выкроек добавить нечего. */}

      {/* Ф6.8: ПРОИСХОЖДЕНИЕ ЧИСЛА И ЕГО СВЕЖЕСТЬ. Пилюля выше говорит «расход марочный»; эта
          строка говорит, ЧЕЙ он и не устарел ли. Без штампа (пер-размерные нормы и всё,
          применённое до Ф6.8) не показывается ничего — их большинство, и они не сломаны,
          им просто нечего сказать. Расхождение — 'attention' (синий): это «изменилось, нужен
          человек», а не блокер и не убыток; красный тут врал бы про цену вопроса. */}
      {stampedId > 0 && (
        <div className='flex flex-wrap items-center gap-1.5'>
          {normDrifted && (
            <Pill
              tone='attention'
              title={`раскладку ${stampedName} перемеряли после того, как с неё сняли эту норму — число в строке может относиться к прежней геометрии. Пересчёта нет и не будет: примените расход заново, если хотите свежий`}
            >
              раскладка изменена после применения
            </Pill>
          )}
          {!stampedMarker && (
            <Pill
              tone='mut'
              title={`раскладки ${stampedName} среди раскладок этого колорвея больше нет — её удалили. Ссылки (FK) на раскладку не заводили намеренно: число в строке КОПИЯ и остаётся верным, но пересмотреть его источник уже нельзя`}
            >
              раскладка удалена
            </Pill>
          )}
          <Text size='nano' variant='label' component='span'>
            {normStampText}
          </Text>
        </div>
      )}

      {/* Ф6.6: РУЧНАЯ НОРМА — тот же вопрос с другой стороны, и он обязан быть подписан ТАМ, ГДЕ
          ЧИСЛО ВВОДЯТ. Ручной ввод — аварийный выход, и он нужен: без него первый же странный DXF
          останавливает производство. Поэтому гейт готовности прогона такую норму ПРОПУСКАЕТ
          (norm_provenance = предупреждение, не блокер) — но помечает, и здесь стоит тот же знак,
          чтобы «почему у меня жёлтая строка на прогоне» имело ответ на этой же странице.
          Только для рулонных слотов: у счётного трима ручной ввод — единственный способ, и метка
          на каждой пуговице была бы шумом, а не сигналом. Пустая норма молчит тоже: «введён
          руками» про число, которого нет, — неправда, а прочерк уже сказан выше. */}
      {isMeasured && rollGoods && !legacyCountedMeasured && hasNorm && !derivedNorm && (
        <div className='flex flex-wrap items-center gap-1.5'>
          <Pill tone='attention'>расход введён руками</Pill>
          <Text size='nano' variant='label' component='span'>
            норма не снята с раскладки
            {slot.wastagePercent?.trim()
              ? ` · костинг начисляет сверху ${slot.wastagePercent}% раскроя слота`
              : ''}
          </Text>
        </div>
      )}

      {draft.lineTotal && (
        <Text size='micro' variant='label'>
          {`per garment ${draft.lineTotal}`}
        </Text>
      )}

      {/* «УБРАТЬ РАСХОД» — бывший unlink строки «на изделие», и он всё ещё нужен: без него норму
          можно обнулить, но нельзя вернуть слот в состояние «строки рецепта нет вовсе» (а это
          разные вещи для полной замены строк). Виден только когда строка ЕСТЬ. */}
      {canEdit && hasRow && (
        <div className='flex justify-end'>
          <Button type='button' variant='secondary' size='xs' onClick={onRemove}>
            убрать расход
          </Button>
        </div>
      )}
    </div>
  );
}

// ── СТРОКА ДЕТАЛИ: «ИЗ КАКОЙ ТКАНИ КРОИТСЯ» — И ВСЁ ─────────────────────────────────────────────
//
// Решение владельца (2026-08-10) в силе и после перестройки в карточку ткани: расход ткани —
// свойство ИЗДЕЛИЯ, деталь справочна. Блока расхода здесь нет НАМЕРЕННО: ни нормы, ни «по
// выкройкам…», ни «из раскладки», ни ручного ввода. «По выкройкам» на такой строке собирал
// комплект по СКОУПУ ТКАНИ — то есть считал площадь всего изделия — и записывал её в одну деталь;
// на девяти деталях это девятикратный расход, и числа выглядят правдоподобно.
//
// ЧТО ЗАБРАЛА КАРТОЧКА. Выпадашки слота больше нет: ткань — это карточка, внутри которой лежит
// строка, и второй выбор ткани внутри неё был бы ровно тем промахом мимо секции, который вся эта
// перестройка и закрывает. Бейджа роли слоя тоже нет: роль — свойство ТКАНИ (вывод из её строки
// BOM), карточка называет её один раз в шапке, а переписанная у каждой из девяти деталей она была
// девятью копиями одного факта. Здесь осталось ровно то, что про ДЕТАЛЬ: силуэт, имя, её
// собственный пин артикула, её легаси-число и разрыв связи.
function PieceLinkRow({
  draft,
  piece,
  shape,
  slot,
  materials,
  sizeIds,
  sizeNameById,
  canEdit,
  onRemove,
  onChange,
}: {
  draft: UsageDraft;
  /** Деталь, на которую смотрит строка. Всегда живая: сироты живут в своём разделе. */
  piece?: PieceRef;
  /** Контур из разобранных DXF; null — привязки нет, кэш холодный или редактор скрыт. */
  shape: FoundPiece | null;
  slot: BomLine;
  materials: common_Material[];
  sizeIds: number[];
  sizeNameById: Map<number, string>;
  canEdit: boolean;
  onChange: (patch: Partial<UsageDraft>) => void;
  onRemove: () => void;
}) {
  const material = effectiveMaterial(draft, slot, materials);
  // Пин показывается ФАКТОМ, но не правится: пин колорвея правится в шапке карточки, на строке
  // «на изделие», и второе место для того же поля разошлось бы с первым.
  const pinnedDifferent = draft.materialId > 0 && draft.materialId !== slot.materialId;
  const unit = slot.unit?.trim() || '';

  // ЛЕГАСИ-ЧИСЛО НА ДЕТАЛИ. Сервер строки одного слота СУММИРУЕТ: в себестоимости каждая строка
  // рецепта добавляет свой UnitTotal (internal/dto/techcard_production.go, colorwayCost), в
  // потребности прогона — свой вклад в тот же слот (production_material_plan.go). Спрятать число,
  // которое продолжает считать деньги, — ложь, поэтому оно показано как легаси и его дают убрать.
  const sizeOrder = new Map(sizeIds.map((id, i) => [id, i]));
  const legacyPerSize = [...draft.sizeConsumptions]
    .filter((s) => s.sizeId && (s.consumption ?? '').trim())
    .sort(
      (a, b) =>
        (sizeOrder.get(a.sizeId ?? 0) ?? sizeIds.length) -
        (sizeOrder.get(b.sizeId ?? 0) ?? sizeIds.length),
    );
  const legacyScalar = draft.consumption.trim() || draft.quantity.trim();
  const legacyText =
    legacyPerSize.length > 0
      ? `${legacyPerSize
          .map(
            (s) =>
              `${formatSizeName(sizeNameById.get(s.sizeId ?? 0) ?? `#${s.sizeId}`).toUpperCase()} ${(s.consumption ?? '').trim()}`,
          )
          .join(' · ')}${unit ? ` — в ${unit}` : ''}`
      : legacyScalar
        ? `${legacyScalar}${unit ? ` ${unit}` : ''}`
        : '';
  // normMarkerId: 0 — явное «снять штамп»: числа больше нет, и штамп его применения без числа
  // был бы ложью (сервер читает 0 как «сними штамп и дату», см. toWire).
  const clearLegacy = () =>
    onChange({
      consumption: '',
      quantity: '',
      sizeConsumptions: [],
      normMarkerId: 0,
      ...MANUAL_PROVENANCE,
    });

  return (
    <div className='flex flex-col gap-1 py-1 first:pt-0 last:pb-0'>
      <div className='flex items-center gap-2'>
        <span className='flex min-w-0 flex-1 items-center'>
          {/* Силуэт — ведущий глиф строки детали, слева от имени. */}
          <PieceSilhouette found={shape} />
          <Text size='micro' component='span' className='truncate uppercase'>
            {piece?.name?.trim() || draft.pieceLineKey}
          </Text>
        </span>
        {pinnedDifferent && (
          <Pill tone='mut'>пин: {material?.name?.trim() || `артикул #${draft.materialId}`}</Pill>
        )}
        {canEdit && (
          <Button type='button' variant='secondary' size='xs' onClick={onRemove}>
            убрать
          </Button>
        )}
      </div>
      {legacyText && (
        <div className='flex flex-col gap-1 pb-1'>
          <div className='flex flex-wrap items-center gap-1.5'>
            <Pill tone='attention'>легаси-расход на детали</Pill>
            <Text size='small' component='span' className='font-mono tabular-nums'>
              {legacyText}
            </Text>
          </div>
          <Text size='nano' variant='label' component='p'>
            это число сервер прибавляет к норме ткани — в себестоимость и в потребность прогона:
            строки одного слота суммируются. Расход изделия ведётся расходом этой ткани выше —
            заведите норму там, а это число уберите
          </Text>
          {canEdit && (
            <span>
              <Button type='button' variant='secondary' size='xs' onClick={clearLegacy}>
                убрать число
              </Button>
            </span>
          )}
        </div>
      )}
    </div>
  );
}

// Силуэт детали при её имени: форма из ЧЕРТЕЖА, не пиктограмма — рисуется тем же контуром
// (findPiece: срединный размер ряда, слой линии кроя с фолбэком), что и плитка этой детали на
// вкладке деталей кроя. Подпись обязательна, иначе это декорация: title называет блок, размер,
// по которому нарисовано (силуэт один на всю градацию), и габарит. Нет контура — нет и спана,
// даже пустого: прочерк перед каждой несопоставленной деталью — шум, который T3 только что
// вычистил, а диагностика («нет в файлах», «ткань потеряна») живёт на вкладке деталей кроя.
function PieceSilhouette({ found }: { found: FoundPiece | null }) {
  if (!found) return null;
  const size = found.size
    ? `размер ${found.size}${found.sizes.length > 1 ? ` из ${found.sizes.length}` : ''}`
    : '';
  const title = [found.block, size, `${fmtCm(found.piece.bboxW)}×${fmtCm(found.piece.bboxH)} см`]
    .filter(Boolean)
    .join(' · ');
  // Без рамки (глиф при имени, не контрол); grainLayer='' гасит красную долевую — на 28px она
  // читалась бы как цвет состояния, а красный в системе — только ошибка; outlineOnly гасит
  // внутреннюю геометрию, нечитаемую в этом размере. SVG letterbox-ится в бокс сам (meet).
  return (
    <span title={title} className='mr-1.5 inline-flex h-7 w-10 shrink-0'>
      <PieceShape piece={found.piece} grainLayer='' outlineOnly />
    </span>
  );
}

// Русское числительное при существительном — без библиотеки: карточка теперь называет числа вслух
// («9 деталей»), и «9 деталь» читается как опечатка ровно там, где нужно доверие к числам.
function plural(n: number, one: string, few: string, many: string): string {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}

// ПРАВИЛА ЦЕЛОСТНОСТИ СЛОЁВ (T4) — те же три, что держит сервер (отказ рецепта
// duplicate_main_fabric, блокер наряда, находки гейта piece_role_conflict / piece_main_fabric):
// роль каждого слоя — вывод из строки BOM; клеевая (interlining) — слой дублирования, в правила
// кроя не входит.
//
// СЧИТАЮТСЯ ПО ДЕТАЛИ, ПОКАЗЫВАЮТСЯ НА ТКАНИ. Утверждение «на этой детали две основные» верно
// только про деталь целиком, то есть про ВСЕ её строки рецепта, а не про строки одной карточки, —
// поэтому считает их редактор, один раз на весь рецепт, а карточка ткани лишь выбирает из готовой
// карты свои детали. Считать это в карточке значило бы либо соврать (карточка видит свою половину
// конфликта), либо пересчитать все детали в каждой из восьми карточек.
type PieceLayerIssue = {
  /** Две (и больше) явно основных ткани на одной детали — сервер откажет сейву. */
  twoMains: boolean;
  /** Основная рядом с «не разложено» (или две «не разложено») — недоказуемый близнец первой. */
  unsortedConflict: boolean;
  /** Слои есть, основной нет — и нет «не разложено», которая могла бы ею оказаться. */
  mainless: boolean;
  /** Имена слотов-участников, для текста предупреждения. */
  mainNames: string[];
  unsortedNames: string[];
  layerRoleNames: string[];
};

const slotDisplayName = (s: BomLine) => `«${s.name?.trim() || s.lineKey}»`;

function pieceLayerIssuesOf(
  usagesByPiece: Map<string, IndexedUsage[]>,
  bomItems: BomLine[],
): Map<string, PieceLayerIssue> {
  const out = new Map<string, PieceLayerIssue>();
  for (const [pieceLineKey, rows] of usagesByPiece) {
    const layerSlots = rows
      .map(({ draft }) =>
        draft.bomLineKey ? bomItems.find((b) => b.lineKey === draft.bomLineKey) : undefined,
      )
      .filter((s): s is BomLine => !!s && s.section !== 'TECH_CARD_BOM_SECTION_INTERLINING')
      .filter((s) => derivePieceLayerRole(s.section, s.purpose).rollGoods);
    const mains = layerSlots.filter((s) =>
      isMainLayerRole(derivePieceLayerRole(s.section, s.purpose)),
    );
    const unsorted = layerSlots.filter((s) =>
      isUnsortedLayerRole(derivePieceLayerRole(s.section, s.purpose)),
    );
    // П1: две основные — ошибка данных; основная рядом с «не разложено» (или две «не разложено») —
    // её недоказуемый близнец. Оба останавливают наряд, и сервер откажет сейву двух явных main.
    const twoMains = mains.length >= 2;
    const unsortedConflict =
      !twoMains && unsorted.length >= 1 && mains.length + unsorted.length >= 2;
    // П2: слои есть, основного нет — и нет «не разложено», которая могла бы им оказаться.
    const mainless = layerSlots.length > 0 && mains.length === 0 && unsorted.length === 0;
    if (!twoMains && !unsortedConflict && !mainless) continue;
    out.set(pieceLineKey, {
      twoMains,
      unsortedConflict,
      mainless,
      mainNames: mains.map(slotDisplayName),
      unsortedNames: unsorted.map(slotDisplayName),
      layerRoleNames: layerSlots.map((s) =>
        pieceLayerRoleLabel(derivePieceLayerRole(s.section, s.purpose)),
      ),
    });
  }
  return out;
}

/** Уникальные значения в порядке первого появления — для склейки имён из нескольких деталей. */
const uniq = (xs: string[]) => [...new Set(xs.filter(Boolean))];

// ── КАРТОЧКА ТКАНИ: ОДНА СТРОКА РЕЦЕПТА = ОДИН МАТЕРИАЛ ─────────────────────────────────────────
//
// Единица этого экрана — ТКАНЬ, а не деталь. Карточка несёт расход на изделие, цену, происхождение
// числа и СВЁРНУТЫЙ список деталей, которые из этой ткани кроятся; заголовок «на изделие» исчез,
// потому что «на изделие» — это и есть расход, а не отдельный раздел.
//
// ПОЧЕМУ КАРТОЧКА ЕСТЬ У КАЖДОГО СЛОТА BOM, даже пустого. Прежний экран показывал только строки,
// которые уже завели, и заводили их двумя разными кнопками в двух разделах: «+ добавить материал к
// детали» писала строку БЕЗ нормы, «+ добавить материал на изделие» — строку С нормой. Оператор,
// честно назначивший ткань каждой детали, получал костинг по нулям и не находил второй раздел
// вовсе. Теперь мимо не попасть: у ткани ровно одно место, оно видно всегда, и в нём написано
// «расход —», пока нормы нет.
function FabricRecipeCard({
  slot,
  garmentRows,
  pieceRows,
  pieces,
  shapes,
  layerIssues,
  materials,
  estimate,
  markers,
  cardMarkersAllColorways,
  recipeLinks,
  colorwayId,
  techCardId,
  sizeIds,
  sizeNameById,
  canEdit,
  active,
  onPatchSlot,
  onRemoveRow,
  onTogglePiece,
}: {
  slot: BomLine;
  /** Строки «на изделие» этого слота. Первая несёт норму; вторая и далее — дубли (см. ниже). */
  garmentRows: IndexedUsage[];
  /** Строки деталей этого слота, уже в порядке деталей карточки. */
  pieceRows: { row: IndexedUsage; piece?: PieceRef }[];
  /** Все детали кроя карточки — набор выбора для «назначить детали». */
  pieces: PieceRef[];
  shapes: Map<string, FoundPiece | null> | null;
  /** Готовая карта нарушений целостности слоёв по ДЕТАЛЯМ — считает редактор (см. выше). */
  layerIssues: Map<string, PieceLayerIssue>;
  materials: common_Material[];
  /** Серверная оценка расхода этого слота (Ф1) — есть только там, где строки рецепта нет. */
  estimate?: common_TechCardSlotAreaEstimate;
  markers?: common_TechCardMarkerSummary[];
  cardMarkersAllColorways?: common_TechCardMarkerSummary[];
  recipeLinks?: readonly RecipePieceLink[];
  colorwayId?: number;
  techCardId: number;
  sizeIds: number[];
  sizeNameById: Map<number, string>;
  canEdit: boolean;
  active: boolean;
  /** index < 0 значит «строки этого слота ещё нет» — патч её и рождает (patchGarmentSlot). */
  onPatchSlot: (index: number, patch: Partial<UsageDraft>) => void;
  onRemoveRow: (index: number) => void;
  onTogglePiece: (piece: PieceRef) => void;
}) {
  const [pinOpen, setPinOpen] = useState(false);
  const garment = garmentRows[0];
  // ЧЕРНОВИК СИНТЕТИЧЕСКИЙ, ПОКА СТРОКИ НЕТ. Он нужен только чтобы прочитать с него пин (его нет)
  // и отдать вниз пустую норму; первое же изменение уйдёт в onPatchSlot(-1, …) и заведёт настоящую
  // строку. Заводить её на монтировании карточки нельзя категорически: восемь слотов BOM разом
  // объявили бы рецепт изменённым и повесили бы на карточку staged, которого никто не делал.
  const draft = garment?.draft ?? { ...blankDraft('', ''), bomLineKey: slot.lineKey ?? '' };
  // Артикул ПЕРВОЙ строки — им карточка называет ткань и им же правит пин. У второй строки того же
  // слота законно бывает свой пин, и её собственный артикул резолвит она сама (SlotNormBlock).
  const { material, materialId, pinnedDifferent, article } = resolveSlotArticle(
    draft,
    slot,
    materials,
  );
  const unit = slot.unit?.trim() || '';
  const rollGoods = PIECE_SECTIONS.has(slot.section ?? '');
  const layerRole = derivePieceLayerRole(slot.section, slot.purpose);
  const missingArticle = materialId === 0;
  // СЕКЦИЯ ВНЕ РЕЦЕПТА (упаковка, этикетка): карточки бы не было, но строки на неё уже заведены —
  // молча спрятать их значило бы продолжать их сохранять, ничего о них не показывая. Такая карточка
  // существует РАДИ ПОЧИНКИ и только: блок расхода на ней только читается, а завести здесь новую
  // строку нельзя — иначе экран сам создавал бы то, что GARMENT_SECTIONS исключает. Убрать
  // существующую можно: это и есть починка.
  const offRecipeSection = !GARMENT_SECTIONS.has(slot.section ?? '');
  // Пин тоже РОЖДАЕТ строку, когда её нет, — значит на карточке вне рецепта он доступен ровно
  // тогда, когда чинить есть что.
  const pinAllowed = canEdit && (!offRecipeSection || !!garment);

  // ШАПКА НАЗЫВАЕТ ТКАНЬ ТАК, КАК ЕЁ НАЗЫВАЕТ ЦЕХ: роль слоя (она и есть ответ на «какая это
  // ткань» — основная, подкладка, дублерин), затем имя артикула. Роль — проекция строки BOM
  // (piece-layer-role.ts), у нерулонной секции её нет, и там шапку открывает сама секция.
  const roleWord = rollGoods ? pieceLayerRoleLabel(layerRole) : sectionShort(slot.section);
  const named = material?.name?.trim() || slot.name?.trim() || 'без названия';
  const heading = [roleWord, `«${named}»`].filter(Boolean).join(' · ');
  const code = material ? composeArticleFromMaterial(material, true) : '';
  const spec = material
    ? [materialSpec(material), material.color?.trim()].filter(Boolean).join(' · ')
    : '';
  // ШИРИНА В ШАПКЕ — ПОЛНАЯ, РУЛОННАЯ, и названа словом «рулон»: раскройная (рулон − 2×кромка)
  // участвует в делении площади и живёт в разборе нормы, а голое «140 см» рядом с ценой за метр
  // читалось бы то как одно, то как другое.
  const rollWidth = rollGoods ? fullRollWidthOf(material, slot, pinnedDifferent) : '';
  const price = article?.unitPrice?.trim()
    ? `${article.unitPrice}${article.currency ? ` ${article.currency}` : ''}${unit ? ` / ${unit}` : ''}`
    : '';
  const meta = [code, spec, rollWidth ? `рулон ${rollWidth} см` : '', price]
    .filter(Boolean)
    .join(' · ');

  const assignedKeys = pieceRows.map(({ row }) => row.draft.pieceLineKey);
  const pieceNames = pieceRows.map(
    ({ row, piece }) => piece?.name?.trim() || row.draft.pieceLineKey,
  );
  // Восемь имён и многоточие: свёрнутый список обязан отвечать «какие детали», не разворачиваясь,
  // но полный список из сорока имён в одну строку не читается и ломает верстку.
  const preview = pieceNames.slice(0, 8).join(', ') + (pieceNames.length > 8 ? '…' : '');

  // Нарушения целостности слоёв — только по СВОИМ деталям и склеенные по видам: девять деталей без
  // основной ткани — это одна проблема и один текст, а не девять одинаковых абзацев.
  //
  // И ТОЛЬКО НА КАРТОЧКЕ, КОТОРАЯ В КОНФЛИКТЕ УЧАСТВУЕТ. Само нарушение — свойство ДЕТАЛИ, и деталь
  // перечислена на всех своих карточках; напечатать «две основные на BP» на карточке подкладки
  // значило бы дать предупреждение тому, кто не может ничего с ним сделать (у подкладки назначение
  // задано и оно верное). Поэтому: «две основные» и «слои не разобраны» показывает только основная
  // или неразобранная ткань — каждая из двух сторон конфликта видит его у себя; «нет основной»
  // показывает любой СЛОЙ детали (кроме клеевой, она в правила кроя не входит) — основной, который
  // мог бы это сказать, там по условию нет.
  const selfIsMain = rollGoods && isMainLayerRole(layerRole);
  const selfIsUnsorted = rollGoods && isUnsortedLayerRole(layerRole);
  const selfIsLayer = rollGoods && slot.section !== 'TECH_CARD_BOM_SECTION_INTERLINING';
  const selfName = slotDisplayName(slot);
  const issueRows = pieceRows
    .map(({ row, piece }) => ({
      name: piece?.name?.trim() || row.draft.pieceLineKey,
      issue: layerIssues.get(row.draft.pieceLineKey),
    }))
    .filter((x): x is { name: string; issue: PieceLayerIssue } => !!x.issue);
  const twoMainsRows = selfIsMain ? issueRows.filter((x) => x.issue.twoMains) : [];
  const unsortedRows =
    selfIsMain || selfIsUnsorted ? issueRows.filter((x) => x.issue.unsortedConflict) : [];
  const mainlessRows = selfIsLayer ? issueRows.filter((x) => x.issue.mainless) : [];
  // Имена слотов-соперников — БЕЗ СВОЕГО: карточка и так называет себя заголовком, а «конфликтует
  // с A и с собой» читается как опечатка.
  const rivalNames = (names: string[]) => uniq(names).filter((n) => n !== selfName);

  // ЛЕГАСИ-ЧИСЛО НА ДЕТАЛИ СЧИТАЕТ ДЕНЬГИ, И ПОТОМУ НАЗЫВАЕТСЯ ДО РАСКРЫТИЯ СПИСКА. Свёрнутая
  // раскрывашка — правильный дом для справочного состава кроя, но не для числа, которое сервер
  // молча прибавляет к норме ткани (строки одного слота суммируются — colorwayCost и
  // production_material_plan). Само число и кнопка «убрать» живут на своей строке внутри списка;
  // здесь — только факт, что они есть, и у каких деталей.
  const legacyPieceNames = uniq(
    pieceRows
      .filter(
        ({ row }) =>
          !!row.draft.consumption.trim() ||
          !!row.draft.quantity.trim() ||
          row.draft.sizeConsumptions.some((s) => (s.consumption ?? '').trim() !== ''),
      )
      .map(({ row, piece }) => piece?.name?.trim() || row.draft.pieceLineKey),
  );

  const piecePicker = (label: string) => (
    <GenericPopover
      title='детали из этой ткани'
      className='w-64'
      triggerProps={{
        'aria-label': 'назначить детали',
        className: buttonVariants({ variant: 'secondary', size: 'xs' }),
      }}
      openElement={label}
    >
      {/* Тот же список, что у пикера деталей операции (PieceList): поиск, отметка выбранного,
          «деталей ещё нет». Создавать детали отсюда нельзя — рецепт пишется UpdateColorwayRecipe,
          который деталь завести не может, и «+ создать» намолотил бы ключей, которые сейв молча
          выбрасывает. */}
      <PieceList
        pieces={pieces}
        selected={assignedKeys}
        multiple
        onToggle={(lineKey) => {
          const piece = pieces.find((p) => p.lineKey === lineKey);
          if (piece) onTogglePiece(piece);
        }}
      />
    </GenericPopover>
  );

  return (
    <div>
      <GroupLabel
        action={
          pinAllowed ? (
            <div className='flex items-center gap-1.5'>
              {/* ПИН АРТИКУЛА — «этот колорвей берёт ДРУГОЙ артикул в этом слоте» — стоит в шапке,
                  рядом с именем ткани, которое он и переопределяет. Прежде он висел на плашке
                  артикула внутри строки; плашка уехала в шапку целиком, и пин уехал с ней. */}
              <GenericPopover
                open={pinOpen}
                onOpenChange={setPinOpen}
                noTail
                title='артикул колорвея'
                className='w-[280px]'
                triggerProps={{
                  'aria-label': 'артикул колорвея',
                  className: buttonVariants({ variant: 'secondary', size: 'xs' }),
                }}
                openElement={draft.materialId > 0 ? 'пин ✎' : 'другой артикул…'}
              >
                <div className='flex flex-col gap-1.5'>
                  <ArticlePinSelect
                    draft={draft}
                    slot={slot}
                    materials={materials}
                    canEdit={canEdit}
                    // СМЕНА ПИНА НА КГ-СЛОТЕ СНИМАЕТ ЧИСЛО НОРМЫ (и провенанс вместе с ним).
                    // Кг-норма ЗАКОДИРОВАЛА в себе основу веса КОНКРЕТНОГО артикула (полная
                    // ширина × плотность, toBomUnit): маркер 2 м на артикуле 150 см × 200 г/м²
                    // записан как 0.6 кг, и после пина на 180 см × 250 г/м² строка продолжала бы
                    // обещать 0.6 при правильных 0.9 — прогон объявил бы честный факт
                    // перерасходом +50%. На слотах в метрах/сантиметрах число НЕ трогается: длина
                    // от артикула не зависит (за шириной раскладки следит отдельная проверка
                    // ширины). Сравниваются ЭФФЕКТИВНЫЕ артикулы: «default» ↔ явный пин на
                    // артикул самого слота — та же ткань, и чистить нечего.
                    //
                    // НИ В КОЕМ СЛУЧАЕ не «сбросить провенанс, оставив число»: марочное число
                    // содержит отходы ВНУТРИ, и, став manual, оно получило бы сверху процент
                    // раскроя слота — двойной учёт. Либо число уходит вместе с источником, либо
                    // не трогается ничего.
                    onChange={(nextMaterialId) => {
                      const patch: Partial<UsageDraft> = { materialId: nextMaterialId };
                      const effectiveBefore = draft.materialId || slot.materialId || 0;
                      const effectiveAfter = nextMaterialId || slot.materialId || 0;
                      if (bomUnitKind(unit) === 'kg' && effectiveBefore !== effectiveAfter) {
                        patch.consumption = '';
                        patch.sizeConsumptions = [];
                        Object.assign(patch, MANUAL_PROVENANCE);
                      }
                      onPatchSlot(garment?.index ?? -1, patch);
                      setPinOpen(false);
                    }}
                  />
                  <Text size='micro' variant='label'>
                    Переопределяет артикул слота только в этом колорвее. «default» возвращает
                    артикул из BOM.
                  </Text>
                </div>
              </GenericPopover>
            </div>
          ) : undefined
        }
      >
        {heading}
      </GroupLabel>

      <div className='flex gap-3 pt-1'>
        <MaterialThumb material={material} />
        <div className='flex min-w-0 flex-1 flex-col gap-2'>
          {meta && (
            <Text size='micro' variant='label' component='p' className='truncate'>
              {meta}
            </Text>
          )}
          {/* Пин здесь НЕ повторяется: он свойство строки и стоит в её блоке расхода (SlotNormBlock). */}
          {(missingArticle || offRecipeSection) && (
            <div className='flex flex-wrap items-center gap-1.5'>
              {missingArticle && <Pill tone='warn'>нет артикула — блокер производства</Pill>}
              {offRecipeSection && (
                <Pill
                  tone='attention'
                  title='рецепт колорвея заводится на ткани, нитки, фурнитуру, тесьму и декор; строки этой секции остались от прежней модели. Перенести строку некуда — уберите её и заведите расход на нужной ткани'
                >
                  секция не заводится в рецепт
                </Pill>
              )}
            </div>
          )}

          {/* КАЖДАЯ СТРОКА «НА ИЗДЕЛИЕ» ЭТОГО СЛОТА — СО СВОИМ ПОЛНЫМ БЛОКОМ РАСХОДА. Строк должно
              быть не больше одной, но бывает больше (легаси, чужая правка), и сервер их СУММИРУЕТ:
              каждая считает деньги. Показывать вторую одним числом с кнопкой «убрать» значило бы
              спрятать её пер-размерные нормы, её пин, её провенанс, штамп и дрейф — а пер-размерная
              вообще печаталась бы как «без числа», то есть как пустая, будучи полной. Раз строка
              уезжает на сервер, она обязана быть видна и правима целиком.

              Первая при этом остаётся ГЛАВНОЙ ровно в одном смысле: ею подписана шапка карточки и
              её пин правит кнопка в шапке. У остальных пин виден пилюлей внутри их блока. */}
          {(garmentRows.length > 0 ? garmentRows : [null]).map((row, i) => {
            const rowDraft = row?.draft ?? draft;
            return (
              // КЛЮЧ — ПОЗИЦИЯ В СПИСКЕ СТРОК ЭТОГО СЛОТА, А НЕ ИДЕНТИЧНОСТЬ СТРОКИ, и это ровно
              // тот случай, ради которого позиционный ключ и существует. Строка рождается ПЕРВЫМ
              // НАЖАТИЕМ КЛАВИШИ в поле расхода: ключ, собранный из usageKey, менялся бы с
              // «пусто» на настоящий прямо посреди ввода, React снёс бы поддерево и создал
              // заново — поле теряло бы фокус на первом же символе каждой новой нормы. Позиция
              // при этом устойчива: пустой блок и рождённая им строка — одна и та же нулевая
              // позиция; переупорядочивания у списка нет, только добавление и удаление с конца
              // логической цепочки «первая — дубли».
              // eslint-disable-next-line react/no-array-index-key
              <div key={i}>
                {i > 0 && (
                  <div className='flex flex-col gap-1 pb-1'>
                    <Pill tone='warn'>вторая строка расхода на эту ткань</Pill>
                    <Text size='nano' variant='label' component='p'>
                      на один слот заведено больше одной строки без детали; сервер их СУММИРУЕТ —
                      расход этой ткани складывается из всех. Оставьте одну
                    </Text>
                  </div>
                )}
                <SlotNormBlock
                  slot={slot}
                  draft={rowDraft}
                  hasRow={!!row}
                  materials={materials}
                  readOnly={offRecipeSection}
                  // Оценка существует только там, где строки НЕТ, — на дубль её вешать нечего.
                  estimate={row ? undefined : estimate}
                  markers={markers}
                  cardMarkersAllColorways={cardMarkersAllColorways}
                  recipeLinks={recipeLinks}
                  colorwayId={colorwayId}
                  techCardId={techCardId}
                  sizeIds={sizeIds}
                  sizeNameById={sizeNameById}
                  canEdit={canEdit}
                  active={active}
                  onChange={(patch) => onPatchSlot(row?.index ?? -1, patch)}
                  onRemove={() => {
                    if (row) onRemoveRow(row.index);
                  }}
                />
              </div>
            );
          })}

          {/* Роль слоя неизвестна — вопрос человеку, а не ошибка (П3): на половине живых карточек
              назначение не проставлено (0265 не бэкфилился), и жёсткая краснота тут закричала бы
              на всём. Стоит на КАРТОЧКЕ: роль — свойство ткани, чинится на вкладке BOM. */}
          {rollGoods && isUnsortedLayerRole(layerRole) && (
            <div className='flex flex-wrap items-center gap-1.5'>
              <Pill tone='attention'>роль слоя неизвестна — назначение не задано</Pill>
              <Text size='nano' variant='label' component='span'>
                задай назначение этой строке на вкладке BOM: из него выводится, основная это ткань,
                подкладка или дублерин
              </Text>
            </div>
          )}

          {twoMainsRows.length > 0 && (
            <div className='flex flex-col gap-1'>
              <Pill tone='warn'>две основные ткани на одной детали</Pill>
              <Text size='nano' variant='label' component='p'>
                {uniq(twoMainsRows.map((x) => x.name)).join(', ')} — на каждой, кроме этой ткани,
                стоит ещё одна с назначением «основной материал»:{' '}
                {rivalNames(twoMainsRows.flatMap((x) => x.issue.mainNames)).join(', ')}. Цельная
                деталь кроится из одной основной: сервер не примет такой рецепт, а наряд
                остановится. Задай второй ткани её назначение на вкладке BOM (подкладка, дублерин,
                контраст…) — или разбей деталь на две
              </Text>
            </div>
          )}
          {unsortedRows.length > 0 && (
            <div className='flex flex-col gap-1'>
              <Pill tone='warn'>назначения слоёв не разобраны</Pill>
              <Text size='nano' variant='label' component='p'>
                у {uniq(unsortedRows.map((x) => x.name)).join(', ')} несколько слоёв, и у{' '}
                {[
                  ...(selfIsUnsorted ? [selfName] : []),
                  ...rivalNames(unsortedRows.flatMap((x) => x.issue.unsortedNames)),
                ].join(', ')}{' '}
                не задано назначение — не доказать, что это не вторая основная, и наряд
                остановится. Задай назначение на вкладке BOM
              </Text>
            </div>
          )}
          {mainlessRows.length > 0 && (
            <div className='flex flex-col gap-1'>
              <Pill tone='attention'>у детали нет основной ткани</Pill>
              <Text size='nano' variant='label' component='p'>
                {uniq(mainlessRows.map((x) => x.name)).join(', ')} привязаны к{' '}
                {uniq(mainlessRows.flatMap((x) => x.issue.layerRoleNames)).join(', ')}, но не к
                основной. Добавь этим деталям ткань назначения «основной материал» — или подтверди,
                что состав детали такой и есть
              </Text>
            </div>
          )}

          {legacyPieceNames.length > 0 && (
            <div className='flex flex-col gap-1'>
              <Pill tone='attention'>своё число расхода на деталях</Pill>
              <Text size='nano' variant='label' component='p'>
                {legacyPieceNames.join(', ')} несут собственный расход, оставшийся от прежней
                модели. Сервер СУММИРУЕТ строки одного слота — эти числа прибавляются к расходу
                этой ткани сверху, и в себестоимость, и в потребность прогона. Разверните список
                деталей и уберите их
              </Text>
            </div>
          )}

          {/* СПИСОК ДЕТАЛЕЙ — СВЁРНУТЫЙ И НА `<details>`, а не на кнопке: на выпущенной (RELEASED)
              карточке вкладка целиком лежит внутри `<fieldset disabled>`, а он глушит любую
              кнопку — раскрывашка на `<button>` там умерла бы молча, и заморозка карточки прятала
              бы состав кроя ровно тогда, когда его только и остаётся что читать. */}
          {/* СПИСОК ЖИВЁТ ТАМ, ГДЕ ЖИВУТ СТРОКИ, А НЕ ТАМ, ГДЕ ИХ МОЖНО ЗАВОДИТЬ. Гейт по рулонности
              решает, можно ли СОЗДАТЬ связь детали с этой тканью (пикер ниже), — но не то, видно ли
              уже существующие: секцию строки BOM меняют на вкладке BOM, и связи, заведённые при
              FABRIC, продолжают жить после переезда в THREAD или PACKAGING. Они уезжают в каждое
              сохранение и участвуют в костинге; закрыв их гейтом, экран показывал бы предупреждение
              «уберите легаси-число» рядом с наглухо запертой дверью. */}
          {(rollGoods || pieceRows.length > 0) && (
            <div className='flex flex-col items-start gap-1'>
              {pieceRows.length === 0 ? (
                <Text size='nano' variant='label' component='p'>
                  детали не назначены — из этой ткани пока ничего не кроится
                </Text>
              ) : (
                <details>
                  <summary className='cursor-pointer'>
                    <Text size='nano' variant='label' component='span' className='uppercase'>
                      {`${pieceRows.length} ${plural(pieceRows.length, 'деталь', 'детали', 'деталей')}: ${preview}`}
                    </Text>
                  </summary>
                  <div className='divide-y divide-hairline pt-1'>
                    {pieceRows.map(({ row, piece }) => (
                      <PieceLinkRow
                        key={`${usageKey(row.draft)}:${row.index}`}
                        draft={row.draft}
                        piece={piece}
                        shape={shapes?.get(pieceRefKey(row.draft.pieceLineKey)) ?? null}
                        slot={slot}
                        materials={materials}
                        sizeIds={sizeIds}
                        sizeNameById={sizeNameById}
                        canEdit={canEdit}
                        onChange={(patch) => onPatchSlot(row.index, patch)}
                        onRemove={() => onRemoveRow(row.index)}
                      />
                    ))}
                  </div>
                  <Text size='nano' variant='label' component='p' className='pt-1'>
                    строка детали отвечает на один вопрос — из какой ткани деталь кроится, и своей
                    нормы не несёт: расход один на ткань, сколько бы деталей из неё ни кроили
                  </Text>
                </details>
              )}
              {/* ПИКЕР СТОИТ ЗДЕСЬ И ТОЛЬКО ЗДЕСЬ — вторым ребёнком этого блока в ОБЕИХ ветках
                  выше, и это не вкусовщина, а условие его работоспособности: назначение первой
                  детали переключает ветку (текст → раскрывашка), и пикер, живущий внутри ветки,
                  размонтировался бы на первом же клике — попап закрывался бы после каждой галочки,
                  а отмечать деталей надо девять. React согласует детей по позиции: первый ребёнок
                  меняет тип, второй остаётся тем же экземпляром, и попап переживает выбор. */}
              {canEdit &&
                rollGoods &&
                (pieces.length > 0 ? (
                  piecePicker(
                    pieceRows.length === 0 ? 'назначить детали' : 'изменить набор деталей',
                  )
                ) : (
                  <Text size='nano' variant='label' component='p'>
                    деталей кроя на карточке ещё нет — объявите их на вкладке деталей, и их можно
                    будет назначить этой ткани
                  </Text>
                ))}
              {/* Секция уехала из рулонной уже после того, как связи завели. Новые назначать
                  нельзя (деталь кроят из полотна, а не из нитки), а эти — убрать можно и нужно. */}
              {!rollGoods && pieceRows.length > 0 && (
                <Text size='nano' variant='label' component='p'>
                  секция этой строки BOM больше не рулонная — новые детали ей не назначают. Связи
                  выше остались от прежней секции: разверните список и уберите их
                </Text>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── ПОЧИНКА СТРОКИ, ПОТЕРЯВШЕЙ СЛОТ ────────────────────────────────────────────────────────────
//
// ЕДИНСТВЕННОЕ МЕСТО, ГДЕ ТКАНЬ ВЫБИРАЮТ ВЫПАДАШКОЙ, и оно намеренно не внутри живой карточки: там
// карточка И ЕСТЬ слот, и второй выбор ткани внутри неё был бы ровно тем промахом мимо секции,
// который вся эта перестройка закрывает. Но у строки, чей слот удалили на вкладке BOM, карточки
// нет вовсе — а сохранение такую строку ВЫБРАСЫВАЕТ (её ссылку нечем разрешить), то есть без
// починки правка соседней нормы молча уносит её с собой. Раньше её чинил SlotPicker внутри строки;
// его больше нет, и один способ назначить слот обязан остаться.
//
// ЧИСЛА ПРИ ПОЧИНКЕ СНИМАЮТСЯ, и это не потеря, а единственный честный исход: норма хранится в
// единице СЛОТА, старого слота больше нет, и проверить, в чём было записано «1.42», нечем — перенос
// в слот в сантиметрах дал бы ошибку масштаба в сто раз, записанную в рецепт. Число видно рядом, в
// подписи строки: его переносят глазами, а провенанс и штамп не переносятся вовсе (они про
// раскладку, снятую на другой ткани).
function StraySlotAssign({
  slots,
  canEdit,
  onAssign,
}: {
  slots: BomLine[];
  canEdit: boolean;
  onAssign: (bomLineKey: string) => void;
}) {
  return (
    <select
      className={cn(cell, 'w-56')}
      value=''
      disabled={!canEdit || slots.length === 0}
      aria-label='назначить слот'
      onChange={(e) => {
        if (e.target.value) onAssign(e.target.value);
      }}
    >
      <option value=''>
        {slots.length === 0 ? '— в BOM нет подходящих строк —' : '— назначить слот —'}
      </option>
      {slots.map((b) => (
        <option key={b.lineKey} value={b.lineKey}>
          {[sectionShort(b.section), b.name?.trim() || b.material?.name?.trim() || b.lineKey]
            .filter(Boolean)
            .join(' · ')}
        </option>
      ))}
    </select>
  );
}

// A usage whose non-empty piece key no longer resolves on the PIECES tab. Empty piece keys belong
// with their fabric card, and additional slots on a live piece belong in that piece's list. KEEP
// retains the orphan in the full-replace save exactly as-is; UNLINK removes it.
//
// «ОСТАВИТЬ» ОБЕЩАЕТ СОХРАНЕНИЕ — И ПОТОМУ НЕ ПРЕДЛАГАЕТСЯ ТАМ, ГДЕ СОХРАНЕНИЯ НЕ БУДЕТ. Сирота,
// у которой вдобавок нет слота, полной заменой НЕ отправляется (её ссылку нечем разрешить), то есть
// «оставить · сохранится как есть» было прямой ложью: строка исчезала на первом же сохранении, а
// экран уверял, что она цела. Такой строке предлагается только разрыв — и говорится, почему.
function OrphanRecipeCard({
  draft,
  bomItems,
  materials,
  canEdit,
  kept,
  onKeep,
  onUnlink,
}: {
  draft: UsageDraft;
  bomItems: BomLine[];
  materials: common_Material[];
  canEdit: boolean;
  kept: boolean;
  onKeep: () => void;
  onUnlink: () => void;
}) {
  const slot = draft.bomLineKey ? bomItems.find((b) => b.lineKey === draft.bomLineKey) : undefined;
  const material = effectiveMaterial(draft, slot, materials);
  const materialId = effectiveMaterialId(draft, slot);
  const consumption =
    draft.sizeConsumptions.length > 0
      ? 'per-size consumption'
      : draft.consumption
        ? `consumption ${draft.consumption}`
        : draft.quantity
          ? `quantity ${draft.quantity}`
          : '';

  return (
    <div className='flex flex-col gap-2 border-b border-hairline py-2 last:border-b-0'>
      <div className='flex items-center justify-between gap-2'>
        <Text size='micro' variant='label' component='span' className='min-w-0 truncate uppercase'>
          {draft.placement?.trim() || 'unassigned'}
        </Text>
        <Pill tone='warn'>piece removed</Pill>
      </div>
      <div className='flex flex-col gap-3 sm:flex-row sm:items-start'>
        <div className='w-full sm:w-40 sm:shrink-0'>
          <RecipeMaterialCard slot={slot} material={material} materialId={materialId} />
        </div>
        <div className='flex min-w-0 flex-1 flex-col gap-2'>
          <Text size='micro' variant='label'>
            This slot points at a cut piece that is no longer on the PIECES tab.
          </Text>
          {consumption && (
            <Text size='micro' variant='label'>
              {consumption}
            </Text>
          )}
          {!savableUsage(draft) && (
            <div className='flex flex-col gap-1'>
              <Pill tone='warn'>слот тоже потерян — строка не сохранится</Pill>
              <Text size='nano' variant='label' component='p'>
                у этой строки нет ни живой детали, ни разрешимой ссылки на строку BOM. Полная замена
                рецепта отправить её не может и удалит на первом же сохранении — «оставить» здесь
                ничего не сохранит, поэтому и не предлагается. Заведите расход заново на нужной
                ткани, а эту уберите
              </Text>
            </div>
          )}
          {canEdit &&
            (kept ? (
              <Text size='micro' variant='label'>
                kept · saved as-is
              </Text>
            ) : (
              <div className='flex flex-wrap items-center gap-1.5'>
                {/* «Оставить» — только там, где сохранение действительно её сохранит. */}
                {savableUsage(draft) && (
                  <Button type='button' variant='secondary' size='sm' onClick={onKeep}>
                    keep
                  </Button>
                )}
                <Button type='button' variant='secondary' size='sm' onClick={onUnlink}>
                  unlink
                </Button>
              </div>
            ))}
        </div>
      </div>
    </div>
  );
}

// Lab-dip approval lifecycle (M8), rendered as the ROUND TIMELINE the process actually is: R1 rejected →
// R2 rejected → R3 approved, mapped straight off `AdminColorwayRef.labDipRounds` (oldest first). The six
// flat labDip* scalars are the LATEST entry of that same journal, so no row is ever reconstructed from
// them — a colourway with no rounds has genuinely never had a swatch submitted, and the timeline says
// exactly that rather than inventing an R1 out of a PENDING baseline.
//
// PERSISTENCE: UpdateColorway's `development` submessage under LAB_DIP_UPDATE_MASK, a field mask naming
// ONLY the three writable lab-dip leaves. That subpath mask keeps the rest of `development` (devCode / name
// / pantone / devHex / swatch / usages) intact, so no read-merge is needed (and none is possible — no read
// path returns those dev identity fields). That write now REACHES THE DATABASE: the server used to ignore
// UpdateColorway's `development` entirely, so every save this panel made was a no-op that still reported
// success. If you are wondering why the panel suddenly works, that is why — nothing changed on this side.
// The server keys each write by round_number, so saving round 3 leaves rounds 1-2 standing and the journal
// grows one entry per round.
//
// WHO OWNS WHAT: this panel writes status, round and reject reason. submitted_at / decided_at / decided_by
// are stamped BY THE SERVER off the write itself and it discards anything the client sends for them, so
// they are shown here as facts (AuditRow) and never as fields. They used to be date inputs — the operator
// typed one, got a success toast, and watched the refetch put the old value back. For the same reason the
// three verdict buttons move only the writable leaves: a locally invented date would draw a round the save
// does not actually send.
//
// Phase 19: the RPC is still this panel's, but the BUTTON is not. There is one save on the card and this
// panel STAGES into it (key `labDip:<colorwayId>`, COMMIT_ORDER.labDip). The action buttons only move the
// draft; nothing reaches the server until the card's Save runs. Until then the staged round is drawn on
// the timeline marked STAGED, so an approve or a reject is visible where it will land rather than only as
// a pill on the toolbar.
function LabDipTimeline({
  colorway,
  techCardId,
  lockVersion,
  canEdit,
  swatchHex,
  onStagedChange,
}: {
  colorway: common_AdminColorwayRef;
  techCardId: number;
  lockVersion: number;
  canEdit: boolean;
  swatchHex?: string;
  onStagedChange: (staged: boolean) => void;
}) {
  const save = useUpdateColorwayLabDip(techCardId);
  const staging = useTechCardStaging();
  // A colourway the card has not created yet has no id to write against — it must not stage.
  const colorwayId = colorway.colorwayId ?? 0;
  const stagingKey = `labDip:${colorwayId}`;
  const [dirty, setDirty] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [reasonDraft, setReasonDraft] = useState('');
  // What the server says this colourway's lab-dip is: the editor's starting point AND the baseline the
  // draft is diffed against below.
  const stored = useMemo(() => fromRefLabDip(colorway), [colorway]);
  const [draft, setDraft] = useState<LabDipDraft>(stored);
  // Re-sync after a save's refetch, unless there are unstaged-but-unsaved edits (mirrors the usages
  // editor) — a refetch must never silently overwrite work the operator has not committed.
  useEffect(() => {
    if (dirty) return;
    setDraft(stored);
  }, [stored, dirty]);

  // Claim any edit this panel had staged when the tab was refreshed (19.6). Declared AFTER the re-sync
  // above on purpose: both run in the same mount flush and the LAST setDraft is the one that sticks, so
  // the restored draft has to be second. Claims exactly once — takeSnapshot removes what it returns.
  useEffect(() => {
    if (!staging || !colorwayId) return;
    const snap = staging.takeSnapshot(stagingKey) as LabDipDraft | undefined;
    if (!snap) return;
    // Only the three writable leaves come back. The audit mirrors stay whatever the server says NOW —
    // they were never the operator's to restore, and a snapshot taken before a colleague's save would
    // otherwise resurrect a superseded stamp on screen.
    setDraft((d) => ({
      ...d,
      labDipStatus: snap.labDipStatus,
      labDipRound: snap.labDipRound,
      labDipRejectReason: snap.labDipRejectReason,
    }));
    setDirty(true);
  }, [staging, colorwayId, stagingKey]);

  // Dirty says a control was touched; STAGED says the write would actually change something. Compared on
  // the WIRE form, so it counts only what the request carries: poking a status and putting it back writes
  // nothing, and neither does a draft that differs solely in the server-owned audit mirrors — that one
  // would otherwise queue an RPC the backend discards, report success, and revert on the refetch, which is
  // exactly the round trip this panel is meant to stop promising.
  const changed = useMemo(() => labDipWire(draft) !== labDipWire(stored), [draft, stored]);
  const staged = dirty && changed;

  useEffect(() => {
    onStagedChange(staged);
  }, [staged, onStagedChange]);

  // Narrowed to the writable leaves on purpose: the audit mirrors are the server's copy, and making them
  // unsettable here is what keeps that true no matter what a later edit to this component tries.
  const set = (patch: Partial<LabDipWritable>) => {
    setDirty(true);
    setDraft((d) => ({ ...d, ...patch }));
  };

  const recorded = useMemo<TimelineRound[]>(
    () => (colorway.labDipRounds ?? []).map(fromRecordedRound),
    [colorway.labDipRounds],
  );
  const round = parseInt(draft.labDipRound, 10) || 0;
  const started = hasLabDipRound(draft) || recorded.length > 0;

  // The panel's mutation, unwrapped: it THROWS instead of toasting, because the header's one save is what
  // reports the outcome now — it needs the rejection to name this panel in the partial-failure banner and
  // to keep everything queued after it staged (19.3).
  async function commitLabDip() {
    if (!colorwayId) return;
    try {
      const expected = await readColorwayVersion(techCardId, colorwayId, lockVersion);
      await save.mutateAsync(buildLabDipRequest(colorway, draft, expected));
    } catch (e) {
      // Re-throw carrying this panel's copy: the header prints the message it is handed.
      throw new Error(labDipSaveErrorMessage(e));
    }
  }

  // Hand the mutation to the card's one save. Re-staged on EVERY edit because `commit` closes over this
  // render's draft — a stale closure would write the edit before last. One key PER COLOURWAY: several
  // colourways can be edited before a single save and each is its own RPC, so each is its own line in the
  // header's list.
  useEffect(() => {
    if (!staging || !colorwayId || !canEdit) return;
    if (!staged) {
      staging.unstage(stagingKey);
      return;
    }
    staging.stage({
      key: stagingKey,
      label: `колорвей ${colorwayTitle(colorway)} · lab-dip R${round || 1}`,
      order: COMMIT_ORDER.labDip,
      commit: commitLabDip,
      settle: () => setDirty(false),
      snapshot: draft,
    });
    // commitLabDip is redefined every render by design (it reads current state); depending on it here
    // would restage on every keystroke for no gain, so the state it reads is the dep list.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    staging,
    stagingKey,
    colorwayId,
    canEdit,
    staged,
    draft,
    round,
    colorway,
    lockVersion,
    techCardId,
  ]);

  // The server's journal, with the STAGED draft laid over the round it edits (or appended when the
  // action buttons have moved a round the server has not seen yet). Only while it is actually staged: an
  // untouched draft is just a mirror of the latest recorded round, and drawing it a second time — or
  // minting a row for a colourway that has no rounds at all — is the fabricated history this panel
  // refuses.
  const rounds = useMemo<TimelineRound[]>(() => {
    if (!staged || !hasLabDipRound(draft)) return recorded;
    const n = round || 1;
    const at = recorded.findIndex((r) => r.round === n);
    const base = at < 0 ? undefined : recorded[at];
    const pending: TimelineRound = {
      key: `staged-${n}`,
      round: n,
      status: draft.labDipStatus,
      // Dates and decider come off the journal entry this draft is editing, never off the draft: the
      // server stamps them and the staged write does not carry them, so a locally minted date would be a
      // preview of something that is not being saved. A round the journal has not seen yet simply has
      // none until the save lands. The draft has no comment field either, so that stays the recorded one
      // rather than blanking on screen.
      submittedAt: base?.submittedAt ?? '',
      decidedAt: base?.decidedAt ?? '',
      decidedBy: base?.decidedBy ?? '',
      rejectReason: draft.labDipRejectReason,
      comment: base?.comment ?? '',
      staged: true,
    };
    if (at < 0) return [...recorded, pending];
    const next = [...recorded];
    next[at] = pending;
    return next;
  }, [recorded, staged, draft, round]);

  // The three verdict actions move only the writable leaves. `decided at` and `decided by` follow from
  // the save itself, stamped server-side — this panel states the verdict and lets the backend date it.
  const approve = () => set({ labDipStatus: APPROVED, labDipRejectReason: '' });
  const confirmReject = () => {
    set({ labDipStatus: REJECTED, labDipRejectReason: reasonDraft.trim() });
    setRejectOpen(false);
  };
  // Highest round anyone knows about: the journal's last entry, or the draft when it runs ahead of it.
  // A started-but-unnumbered draft (legacy rows carry a submission with round 0) still counts as R1.
  const highestRound = recorded.reduce(
    (m, r) => Math.max(m, r.round),
    Math.max(round, hasLabDipRound(draft) ? 1 : 0),
  );
  // Opens the round after it, with no verdict yet. Its submission date is the server's to stamp when the
  // card's Save actually sends this round, so the staged row carries the number and the status only.
  const newRound = () =>
    set({
      labDipRound: String(highestRound + 1),
      labDipStatus: SUBMITTED,
      labDipRejectReason: '',
    });

  const smallBtn = buttonVariants({ variant: 'secondary', size: 'sm' });

  return (
    <div className='flex flex-col gap-1.5'>
      {rounds.length === 0 ? (
        <Text size='micro' variant='label'>
          лаб-дип ещё не отправляли
        </Text>
      ) : (
        rounds.map((r, i) => {
          const outcome = roundOutcome(r);
          const latest = i === rounds.length - 1;
          return (
            <Row
              key={r.key}
              label={
                <span className='flex min-w-0 items-center gap-2'>
                  {/* The hex belongs to the COLOURWAY, not to this round, so it marks the live round
                      only — repeated down the timeline it would read as a per-round dye. The empty
                      slot keeps every round's text on one left edge. */}
                  {latest ? (
                    <Swatch hex={swatchHex} />
                  ) : (
                    <span aria-hidden className='inline-block size-3 shrink-0' />
                  )}
                  <Text
                    size='micro'
                    variant='label'
                    component='span'
                    className='truncate uppercase'
                  >
                    R{r.round || i + 1}
                    {r.submittedAt ? ` · submitted ${fmtDay(r.submittedAt)}` : ''}
                  </Text>
                </span>
              }
              value={
                <span className='flex items-center gap-1.5'>
                  {outcome && (
                    <Text
                      size='micro'
                      variant='label'
                      component='span'
                      className='max-w-48 truncate'
                      title={outcome}
                    >
                      {outcome}
                    </Text>
                  )}
                  {r.staged && <Pill tone='attention'>staged</Pill>}
                  <LabDipPill status={r.status} />
                </span>
              }
            />
          );
        })
      )}

      {canEdit && (
        <div className='flex flex-wrap items-center gap-1.5 pt-1'>
          <Button
            type='button'
            variant='secondary'
            size='sm'
            disabled={!started || draft.labDipStatus === APPROVED}
            onClick={approve}
          >
            approve
          </Button>

          <GenericPopover
            open={rejectOpen}
            onOpenChange={(o) => {
              if (o) setReasonDraft(draft.labDipRejectReason);
              setRejectOpen(o);
            }}
            title='reject reason'
            className='w-64'
            triggerProps={{ className: smallBtn, disabled: !started }}
            openElement='reject…'
          >
            <div className='flex flex-col gap-1.5'>
              <textarea
                autoFocus
                className={cell}
                rows={3}
                maxLength={1000}
                placeholder='too warm, pull toward green'
                aria-label='reject reason'
                value={reasonDraft}
                onChange={(e) => setReasonDraft(e.target.value)}
              />
              <div className='flex justify-end gap-1.5'>
                <Button
                  type='button'
                  variant='secondary'
                  size='sm'
                  onClick={() => setRejectOpen(false)}
                >
                  cancel
                </Button>
                <Button type='button' variant='main' size='sm' onClick={confirmReject}>
                  reject
                </Button>
              </div>
            </div>
          </GenericPopover>

          {/* The scalars the timeline derives but cannot express: the round number and a status the
              three actions don't produce. Underneath them, the server's own audit stamps — stated, not
              offered, because the backend sets those itself and ignores anything sent for them. */}
          <GenericPopover
            title='round details'
            className='w-64'
            triggerProps={{ className: smallBtn, 'aria-label': 'round details' }}
            openElement='⋯'
          >
            <div className='flex flex-col gap-1.5'>
              <label className='flex flex-col gap-1'>
                <FieldLabel>status</FieldLabel>
                <select
                  className={cell}
                  value={draft.labDipStatus}
                  onChange={(e) => set({ labDipStatus: e.target.value })}
                >
                  {techCardLabDipStatusOptions.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className='flex flex-col gap-1'>
                <FieldLabel>round</FieldLabel>
                <input
                  className={cell}
                  type='number'
                  min='0'
                  value={draft.labDipRound}
                  onChange={(e) => set({ labDipRound: e.target.value })}
                />
              </label>
              <div className='flex flex-col gap-0.5 pt-1'>
                <FieldLabel>stamped by the server</FieldLabel>
                {/* Straight off `stored`, i.e. the colourway as the backend last returned it — never off
                    the draft, which cannot change these and must not appear to. */}
                <AuditRow label='submitted' value={stored.labDipSubmittedAt} />
                <AuditRow label='decided' value={stored.labDipDecidedAt} />
                <AuditRow label='decided by' value={stored.labDipDecidedBy} />
              </div>
            </div>
          </GenericPopover>

          <div className='ml-auto flex items-center gap-1.5'>
            {/* Only when the timeline is not already carrying the marker on the round being edited —
                two `staged` pills side by side say nothing the first one did not. */}
            {staged && !rounds.some((r) => r.staged) && (
              <Pill tone='attention'>{save.isPending ? 'saving…' : 'staged'}</Pill>
            )}
            <Button type='button' variant='secondary' size='sm' onClick={newRound}>
              + new round
            </Button>
          </div>
        </div>
      )}

      {/* No save button of its own any more: the lab-dip write is queued behind the card's one Save,
          which is what reports whether it landed. */}
      {canEdit && staged && (
        <Text size='micro' variant='label'>
          included in the card’s Save
        </Text>
      )}
    </div>
  );
}

// #29 derived composition — approximate, read off each BOM line's composition, weighted by consumption.
function CompositionBar({ fibers, skipped }: ReturnType<typeof deriveComposition>) {
  if (fibers.length === 0) return null;
  return (
    <div className='flex flex-col gap-1'>
      <GroupLabel>derived composition (approx · from BOM)</GroupLabel>
      <div className='flex h-4 w-full overflow-hidden border border-borderColor'>
        {fibers.map((f, i) => (
          <div
            key={`${f.name}-${i}`}
            className='flex items-center justify-center overflow-hidden px-1 text-nano whitespace-nowrap'
            style={{
              width: `${f.percent}%`,
              backgroundColor: COMP_SHADES[i % COMP_SHADES.length],
              color: i < 2 ? '#fff' : '#000',
            }}
            title={`${f.name} ${f.percent}%`}
          >
            {f.percent >= 12 ? `${f.name} ${f.percent}%` : ''}
          </div>
        ))}
      </div>
      <Text size='micro' variant='label'>
        {fibers.map((f) => `${f.percent}% ${f.name}`).join(' · ')} · weighted by consumption
        {skipped > 0
          ? ` · ${skipped} article${skipped > 1 ? 's' : ''} excluded (no readable composition)`
          : ''}
      </Text>
    </div>
  );
}

// One colourway's recipe, rendered BELOW the swatch grid rather than inside an accordion, so the
// grid stays on screen while you edit and you can hop between colourways. Every editor stays mounted
// (the caller only hides the inactive ones) — an unsaved draft must survive that hop.
//
// Phase 19: the recipe RPC (UpdateColorwayRecipe, full-replace) is still this panel's, but the button
// is not — the panel STAGES into the card's one save under `recipe:<colorwayId>`, one key per
// colourway, so three colourways edited before a single Save are three lines in the header's list and
// three separate writes.
function ColorwayRecipeEditor({
  colorway,
  bomItems,
  materials,
  markers,
  pieces,
  shapes,
  active,
  sizeIds,
  sizeNameById,
  swatchHex,
  lockVersion,
  techCardId,
  canEdit,
  onStatus,
}: {
  colorway: common_AdminColorwayRef;
  bomItems: BomLine[];
  materials: common_Material[];
  markers?: common_TechCardMarkerSummary[];
  pieces: RecipePiece[];
  /**
   * pieceRefKey детали → контур из разобранных DXF. null у СКРЫТЫХ редакторов — они смонтированы
   * все сразу, и рендерить в спрятанном DOM по 20–40 полигонов на колорвей никто не просил.
   */
  shapes: Map<string, FoundPiece | null> | null;
  /**
   * Этот редактор сейчас ВИДЕН (его колорвей выбран плиткой). Тот же приём, что у `shapes` выше,
   * но явным флагом: `shapes === null` активность не кодирует (у активного редактора они тоже
   * null, пока DXF не разобраны).
   *
   * У НЕАКТИВНОГО КОЛОРВЕЯ СПИСОК КАРТОЧЕК НЕ РИСУЕТСЯ ВООБЩЕ. Сам редактор остаётся смонтирован —
   * в нём живёт черновик рецепта, который обязан пережить прыжок к другому колорвею и обратно, — но
   * его тяжёлое поддерево не строится: одна активная рулонная карточка с деталями и раскладками
   * стоит около двух с половиной десятков хуков, а редакторы ВСЕХ колорвеев смонтированы
   * одновременно, и четыре слота на шести колорвеях давали под пять сотен вызовов хуков и
   * несколько десятков живых подписок на форму — ради того, что видно у одного. Точечные гейты
   * (раскладка, выкройки) этот случай не покрывали: они убирали инструменты, а не карточки.
   *
   * ЧТО ПРИ ЭТОМ ТЕРЯЕТСЯ — только состояние РАСКРЫТИЯ и попапов: открытая «из чего сложилось»,
   * развёрнутый список деталей, развёрнутый ручной ввод, незакрытый пикер, запас «что было по
   * размерам» (UsagePerSizeLocal). Ни одна из этих вещей не является черновиком: сами числа,
   * привязки деталей, пины, «оставленные» сироты и признак staged живут в состоянии редактора и
   * переключение переживают полностью.
   */
  active: boolean;
  sizeIds: number[];
  sizeNameById: Map<number, string>;
  swatchHex?: string;
  lockVersion: number;
  techCardId: number;
  canEdit: boolean;
  onStatus: (colorwayId: number, status: RecipeStatus) => void;
}) {
  const save = useUpdateColorwayRecipe(techCardId);
  const staging = useTechCardStaging();
  // A colourway the card has not created yet has no id to write against — it must not stage.
  const colorwayId = colorway.colorwayId ?? 0;
  // Раскладки ЭТОГО колорвея (плюс общие). Фильтруется один раз на входе, а не в каждом месте
  // ниже: «применить маркер» подставляет измеренную длину прямо в норму расхода, и длина, снятая
  // на артикуле другого колорвея, отличается ровно настолько, насколько отличаются ширины — то
  // есть выглядит совершенно нормально.
  //
  // ЭТОТ ЖЕ ВЫЗОВ ОТСЕИВАЕТ РАСКРОЙНЫЕ МАРКЕРЫ ПРОГОНОВ (Ф4.2, cardMarkers внутри
  // markersOfColorway). Ниже по течению `cwMarkers` — единственный источник раскладок для всего
  // редактора рецепта, включая MarkerApplyHint, так что второго места, где прогонная однодневка
  // могла бы попасть в предложение «применить расход в рецепт», в этом файле нет.
  const cwMarkers = useMemo(() => markersOfColorway(markers, colorwayId), [markers, colorwayId]);
  // Раскладки карточки БЕЗ сужения по колорвею (прогонные однодневки всё равно отсеяны) — нужны
  // ровно одному месту: объяснению пустой строки. Без них строка сказала бы «раскладки нет» на
  // карточке, где они лежат в соседнем колорвее и видны на вкладке выкроек.
  const allCardMarkers = useMemo(() => cardMarkers(markers), [markers]);
  const stagingKey = `recipe:${colorwayId}`;
  const title = colorwayTitle(colorway);
  const [dirty, setDirty] = useState(false);
  const [labDipStaged, setLabDipStaged] = useState(false);
  // CRITICAL (full-replace): the draft starts from the LIVE read (colorway.usages), never from empty.
  // This is also the baseline the header's line count is measured against.
  const baseline = useMemo(
    () => (colorway.usages ?? []).map((u) => fromRead(u, bomItems, pieces)),
    [colorway.usages, bomItems, pieces],
  );
  const [usages, setUsages] = useState<UsageDraft[]>(baseline);
  // ПРИВЯЗКИ «ДЕТАЛЬ → СЛОТ» ИЗ ЖИВЫХ СТРОК РЕЦЕПТА — второй источник комплекта деталей для расчёта
  // по выкройкам, и на практике основной: «+ добавить материал к детали» пишет именно строку
  // рецепта, а не материал детали на её вкладке (см. useFabricDxfPieces). Берутся из ЧЕРНОВИКА, а
  // не из сохранённого рецепта: деталь, которой ткань назначили минуту назад и ещё не сохранили,
  // обязана участвовать в площади — иначе кнопка появляется только после сохранения, и связь
  // «сделал → увидел» рвётся.
  const recipeLinks = useMemo(
    () => usages.map((u) => ({ pieceLineKey: u.pieceLineKey, bomLineKey: u.bomLineKey })),
    [usages],
  );
  // Re-sync when the read changes (after a save's refetch) unless the user has uncommitted edits.
  useEffect(() => {
    if (dirty) return;
    setUsages(baseline);
  }, [baseline, dirty]);

  // Claim any edits this panel had staged when the tab was refreshed (19.6). Declared AFTER the re-sync
  // above on purpose: both run in the same mount flush and the LAST setUsages is the one that sticks, so
  // the restored rows have to be second. Claims exactly once — takeSnapshot removes what it returns.
  useEffect(() => {
    if (!staging || !colorwayId) return;
    const snap = staging.takeSnapshot(stagingKey) as RecipeSnapshot | undefined;
    if (!snap) return;
    setUsages(snap.usages);
    setDirty(true);
  }, [staging, colorwayId, stagingKey]);

  // A declared piece claims EVERY usage that names it. Empty piece_line_key is a first-class
  // per-garment usage; only a non-empty key that no longer resolves is orphaned.
  const pieceKeySet = useMemo(() => new Set(pieces.map((p) => p.lineKey)), [pieces]);
  const usagesByPiece = useMemo(() => {
    const m = new Map<string, IndexedUsage[]>();
    usages.forEach((u, i) => {
      if (!u.pieceLineKey || !pieceKeySet.has(u.pieceLineKey)) return;
      const rows = m.get(u.pieceLineKey) ?? [];
      rows.push({ draft: u, index: i });
      m.set(u.pieceLineKey, rows);
    });
    return m;
  }, [usages, pieceKeySet]);
  const orphans = useMemo(
    () =>
      usages
        .map((u, i) => ({ u, i }))
        .filter(({ u }) => !!u.pieceLineKey && !pieceKeySet.has(u.pieceLineKey)),
    [usages, pieceKeySet],
  );

  // ── ЧТО ЛЕЖИТ НА КАЖДОЙ ТКАНИ ───────────────────────────────────────────────────────────────
  //
  // Единственная перекладка модели, которую делает этот экран: строки рецепта, чья идентичность —
  // пара (деталь, слот), группируются ПО СЛОТУ. Данные не меняются ни на байт: строка «на изделие»
  // — это по-прежнему строка с пустым pieceLineKey, строка детали — с непустым, и на провод уходит
  // тот же полный список (saveUsages). Меняется только то, кто кого содержит на экране.
  const pieceByKey = useMemo(() => new Map(pieces.map((p) => [p.lineKey, p])), [pieces]);
  const pieceOrder = useMemo(() => new Map(pieces.map((p, i) => [p.lineKey, i])), [pieces]);
  const rowsBySlot = useMemo(() => {
    const m = new Map<string, { garment: IndexedUsage[]; pieces: IndexedUsage[] }>();
    usages.forEach((draft, index) => {
      if (!draft.bomLineKey) return; // строка без слота — в «строки без слота» ниже
      if (draft.pieceLineKey && !pieceKeySet.has(draft.pieceLineKey)) return; // сирота
      const e = m.get(draft.bomLineKey) ?? { garment: [], pieces: [] };
      (draft.pieceLineKey ? e.pieces : e.garment).push({ draft, index });
      m.set(draft.bomLineKey, e);
    });
    // Детали внутри карточки идут в порядке ДЕТАЛЕЙ КАРТОЧКИ, а не в порядке записи строк рецепта:
    // свёрнутая подпись «9 деталей: BP, BP_1, …» читается как состав кроя, и её порядок обязан
    // совпадать с тем, в котором те же детали перечислены на своей вкладке.
    for (const e of m.values()) {
      e.pieces.sort(
        (a, b) =>
          (pieceOrder.get(a.draft.pieceLineKey) ?? pieces.length) -
          (pieceOrder.get(b.draft.pieceLineKey) ?? pieces.length),
      );
    }
    return m;
  }, [usages, pieceKeySet, pieceOrder, pieces.length]);

  // КАРТОЧКА У КАЖДОГО ПОДХОДЯЩЕГО СЛОТА BOM, есть на нём строки или нет — это и есть решение,
  // закрывающее «промахнуться секцией»: у ткани ровно одно место, и оно видно всегда. Плюс любой
  // слот, на который смотрит живая строка, даже если его секция в рецепт не заводится (легаси):
  // спрятать карточку значило бы продолжать сохранять строку, ничего о ней не показывая.
  // Порядок — порядок BOM: рецепт читается той же последовательностью, что и BOM, который оператор
  // только что заполнил.
  const cardSlots = useMemo(
    () =>
      bomItems.filter(
        (b) => GARMENT_SECTIONS.has(b.section ?? '') || rowsBySlot.has(b.lineKey ?? ''),
      ),
    [bomItems, rowsBySlot],
  );
  const bomKeySet = useMemo(
    () => new Set(bomItems.map((b) => b.lineKey ?? '').filter(Boolean)),
    [bomItems],
  );
  // Куда МОЖНО переселить потерянную строку: те же секции, что заводятся в рецепт. Предлагать
  // упаковку и этикетку значило бы починкой создавать ровно ту карточку вне рецепта, которую
  // соседний гейт держит только для чтения.
  const assignableSlots = useMemo(
    () => bomItems.filter((b) => !!b.lineKey && GARMENT_SECTIONS.has(b.section ?? '')),
    [bomItems],
  );
  // Строки, чей слот в BOM не разрешается (удалён на вкладке BOM) или вовсе не назван. Карточки у
  // них быть не может, а показать их обязаны: пустой bomLineKey сейв отфильтрует, а вот
  // неразрешимый — отправит, и сервер откажет всему рецепту на строке, которой не видно.
  const strayRows = useMemo(
    () =>
      usages
        .map((draft, index) => ({ draft, index }))
        .filter(({ draft }) => !(draft.pieceLineKey && !pieceKeySet.has(draft.pieceLineKey)))
        .filter(({ draft }) => !draft.bomLineKey || !bomKeySet.has(draft.bomLineKey)),
    [usages, pieceKeySet, bomKeySet],
  );
  // Нарушения целостности слоёв — ОДИН расчёт по всем деталям на весь рецепт (см. pieceLayerIssuesOf).
  const layerIssues = useMemo(
    () => pieceLayerIssuesOf(usagesByPiece, bomItems),
    [usagesByPiece, bomItems],
  );
  // СЕРВЕРНЫЕ ОЦЕНКИ РАСХОДА (Ф1) — по слоту. Приезжают рядом с usages, а не внутри них, потому что
  // существуют ровно там, где строки рецепта НЕТ; склейка по bom_line_key — та же ось, по которой
  // собран весь этот экран. Ничего не пересчитываем и не достраиваем: что сервер сказал, то и
  // покажем (см. NormEstimate).
  const estimateBySlot = useMemo(() => {
    const m = new Map<string, common_TechCardSlotAreaEstimate>();
    for (const e of colorway.areaEstimates ?? []) {
      const key = e.bomLineKey?.trim();
      if (key) m.set(key, e);
    }
    return m;
  }, [colorway.areaEstimates]);

  // Что реально уедет на сервер — ОДНО правило (savableUsage), и оно же считает правки ниже.
  const saveUsages = useMemo(() => usages.filter(savableUsage), [usages]);

  // Dirty says a control was touched; STAGED says the recipe would actually write something else, and
  // `lines` is what the header's label counts — re-derived over the piece model. Typing a value and
  // typing it back must not leave the header claiming work that is not there.
  //
  // СЧИТАЕТСЯ ПО ТОМУ ЖЕ ФИЛЬТРУ, ЧТО И ЗАПИСЬ. Иначе пустая строка, законно появившаяся от нажатия
  // «по размерам», считалась бы правкой, которую сохранение не отправляет: карточка вечно висела бы
  // «staged», а сохранение не меняло бы ничего. Базис фильтруется тоже — он серверный и такого
  // содержать не должен, но правило обязано быть симметричным, чтобы разница была разницей.
  const lines = useMemo(
    () => changedLines(baseline.filter(savableUsage), usages.filter(savableUsage)),
    [baseline, usages],
  );
  const staged = dirty && lines > 0;
  // Memoised so re-staging for an unrelated reason (a lock version, a title) hands the store the SAME
  // snapshot object and it can skip the re-render — the whole draft list travels, so blank piece
  // cards and kept orphans both survive a tab refresh.
  const snapshot = useMemo<RecipeSnapshot>(() => ({ usages }), [usages]);

  // Feed the grid tile: total usage rows and whether anything here is waiting on the Save.
  useEffect(() => {
    onStatus(colorwayId, { count: saveUsages.length, staged: staged || labDipStaged });
  }, [colorwayId, saveUsages.length, staged, labDipStaged, onStatus]);

  // Orphans the operator has explicitly chosen to KEEP (session-only, by fabric key). They stay in
  // the save either way — this only dismisses the keep/unlink prompt.
  const [keptKeys, setKeptKeys] = useState<Set<string>>(() => new Set());

  // ПАТЧ ПО СЛОТУ, А НЕ ПО ИНДЕКСУ. Карточка есть у каждого слота BOM, а строка рецепта — не у
  // каждой карточки: index < 0 значит «строки ещё нет», и первое же изменение (применённая норма,
  // цифра руками, пин артикула) её и рождает. Прежние две кнопки «+ добавить материал…» этим
  // заменены целиком — заводить строку отдельным жестом больше не нужно, а значит и промахнуться
  // разделом негде.
  //
  // Строка ИЩЕТСЯ ВНУТРИ обновления, а не снаружи: диалог применения шлёт число и провенанс одним
  // патчем, но соседние поля могут прийти двумя в одном тике, и снаружи оба увидели бы index = -1
  // и завели бы на слот две строки. Внутри обновления вторая уже находит первую.
  //
  // СТРОКУ РОЖДАЕТ ИЗМЕНЕНИЕ ЗНАЧЕНИЯ, А НЕ ФАКТ ВЫЗОВА ОБРАБОТЧИКА, и это не педантизм: поле ввода
  // зовёт onChange на КАЖДОЕ нажатие клавиши, а sanitizeDecimal на отвергнутом символе возвращает ту
  // же пустую строку — «нажал букву в пустом поле» материализовало бы строку рецепта, которую никто
  // не заводил. Поэтому патч сначала прикладывается к чистому черновику и сравнивается с ним: не
  // изменилось ничего — не появилось и строки.
  const patchGarmentSlot = (bomLineKey: string, index: number, patch: Partial<UsageDraft>) => {
    if (!bomLineKey) return;
    setDirty(true);
    setUsages((prev) => {
      const at =
        index >= 0
          ? index
          : prev.findIndex((u) => !u.pieceLineKey && u.bomLineKey === bomLineKey);
      if (at >= 0) return prev.map((u, i) => (i === at ? { ...u, ...patch } : u));
      // placement у строки «на изделие» пустой — ровно как его заводила прежняя кнопка «+ добавить
      // материал на изделие»: имя детали туда подставлять нечего, изделие одно.
      const blank = { ...blankDraft('', ''), bomLineKey };
      const born = { ...blank, ...patch };
      if (JSON.stringify(born) === JSON.stringify(blank)) return prev;
      return [...prev, born];
    });
  };
  // «НАЗНАЧИТЬ ДЕТАЛИ» — тот же жест, что писала кнопка «+ добавить материал к детали», только с
  // другой стороны: ткань известна (это карточка), выбирают деталь. Строка рождается ровно той же
  // (usage с pieceLineKey и placement = имя детали), поэтому обратная связь с расчётом «по
  // выкройкам» (useFabricDxfPieces читает эти же строки как привязки) работает без изменений.
  //
  // Снятие галочки убирает ВСЕ строки этой пары: дубль (деталь + ткань дважды) — это одна и та же
  // связь, записанная дважды, и оставить половину значило бы не выполнить снятие.
  const togglePieceOnSlot = (bomLineKey: string, piece: PieceRef) => {
    if (!bomLineKey) return;
    setDirty(true);
    setUsages((prev) => {
      const match = (u: UsageDraft) =>
        u.pieceLineKey === piece.lineKey && u.bomLineKey === bomLineKey;
      if (prev.some(match)) return prev.filter((u) => !match(u));
      return [
        ...prev,
        { ...blankDraft(piece.lineKey, piece.name?.trim() || ''), bomLineKey },
      ];
    });
  };
  const removeUsage = (i: number) => {
    setDirty(true);
    setUsages((prev) => prev.filter((_, idx) => idx !== i));
  };
  // ПОЧИНКА СТРОКИ БЕЗ СЛОТА (см. StraySlotAssign): назначить слот и СНЯТЬ числа. Единица нормы —
  // это единица слота, старого слота нет, и в чём было записано число, проверить нечем: перенести
  // его значило бы записать в рецепт ошибку масштаба, которую никто уже не поймает. Провенанс и
  // штамп не переносятся по той же причине — они про раскладку, снятую на другой ткани.
  const assignStraySlot = (index: number, bomLineKey: string) => {
    if (!bomLineKey) return;
    setDirty(true);
    setUsages((prev) =>
      prev.map((u, i) =>
        i === index
          ? {
              ...u,
              bomLineKey,
              materialId: 0,
              consumption: '',
              quantity: '',
              sizeConsumptions: [],
              normMarkerId: 0,
              ...MANUAL_PROVENANCE,
            }
          : u,
      ),
    );
  };
  const keepOrphan = (u: UsageDraft) => setKeptKeys((prev) => new Set(prev).add(orphanKey(u)));

  // The panel's mutation, unwrapped: it THROWS instead of toasting, because the header's one save is
  // what reports the outcome now — it needs the rejection to name this panel in the partial-failure
  // banner and to keep everything queued after it staged (19.3). Every read row is round-tripped;
  // add actions create rows on an eligible slot immediately, so the client adds no blank refs.
  async function commitRecipe() {
    if (!colorwayId) return;
    try {
      const expected = await readColorwayVersion(techCardId, colorwayId, lockVersion);
      await save.mutateAsync({
        colorwayId,
        expectedColorwayVersion: expected,
        usages: saveUsages.map(toWire),
      });
    } catch (e) {
      // Re-throw carrying this panel's copy: the header prints the message it is handed.
      throw new Error(recipeSaveErrorMessage(e));
    }
  }

  // Hand the mutation to the card's one save. Re-staged on EVERY edit because `commit` closes over this
  // render's rows — a stale closure would write the edit before last. Unstaged the moment the recipe
  // matches the server again, so the header count never claims work that is not there.
  useEffect(() => {
    if (!staging || !colorwayId || !canEdit) return;
    if (!staged) {
      staging.unstage(stagingKey);
      return;
    }
    staging.stage({
      key: stagingKey,
      label: `колорвей ${title} · recipe — ${lines} ${lines === 1 ? 'line' : 'lines'}`,
      order: COMMIT_ORDER.recipe,
      commit: commitRecipe,
      settle: () => setDirty(false),
      snapshot,
    });
    // commitRecipe is redefined every render by design (it reads current state); depending on it here
    // would restage on every keystroke for no gain, so the state it reads is the dep list.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    staging,
    stagingKey,
    colorwayId,
    canEdit,
    staged,
    lines,
    usages,
    snapshot,
    title,
    lockVersion,
    techCardId,
  ]);

  const derived = useMemo(
    () => deriveComposition(usages, bomItems, materials),
    [usages, bomItems, materials],
  );
  // Легенда к силуэтам — ОДНА на редактор, не на строку (иначе воскрес бы шум, который T3 только
  // что вычистил), и только когда хоть одна иконка видна: подпись без картинок — обещание.
  const hasSilhouettes = useMemo(
    () => !!shapes && pieces.some((p) => !!shapes.get(pieceRefKey(p.lineKey))),
    [shapes, pieces],
  );

  return (
    <SectionStack>
      <Section
        title={`${title} · ткани и расход`}
        question={[
          colorway.baseSku,
          `${cardSlots.length} ${plural(cardSlots.length, 'материал', 'материала', 'материалов')}`,
          `${saveUsages.length} ${plural(saveUsages.length, 'строка', 'строки', 'строк')} рецепта`,
        ]
          .filter(Boolean)
          .join(' · ')}
        action={staged ? <Pill tone='attention'>staged</Pill> : undefined}
      >
        {/* МОДЕЛЬ СКАЗАНА ОДИН РАЗ, В ШАПКЕ РАЗДЕЛА. Прежде она была сказана дважды и разными
            словами — в разделе «детали» и в разделе «на изделие», — и это само по себе было частью
            жалобы: два раздела читались как два способа завести одно и то же, а нормой обладал
            только один из них, ниже по странице. */}
        <Text size='micro' variant='label'>
          одна ткань — одна карточка: расход на изделие, цена и детали, которые из неё кроятся.
          Расход — свойство ИЗДЕЛИЯ: он один на ткань, сколько бы деталей из неё ни кроили; список
          деталей отвечает только на вопрос «что из неё кроится» и своей нормы не несёт
        </Text>

        {bomItems.length === 0 ? (
          <CalloutBox tone='note'>
            <Text size='micro' component='span'>
              в BOM ещё нет ни одной строки. Рецепт колорвея назначает артикулы и расход именно
              строкам BOM — заведите их на вкладке <b>BOM</b>, и здесь появится карточка на каждую
            </Text>
          </CalloutBox>
        ) : cardSlots.length === 0 ? (
          <Text size='micro' variant='label'>
            в BOM нет ни одной строки тех секций, что заводятся в рецепт (ткани, подкладка,
            дублерин, утеплитель, нитки, фурнитура, тесьма, декор)
          </Text>
        ) : (
          <>
            {pieces.length === 0 && (
              <Text size='micro' variant='label'>
                деталей кроя на карточке ещё нет — расход завести можно уже сейчас, а «какие детали
                кроятся из этой ткани» появится, когда детали объявят на вкладке деталей кроя
              </Text>
            )}
            {/* ТЯЖЁЛОЕ ПОДДЕРЕВО — ТОЛЬКО У ОТКРЫТОГО КОЛОРВЕЯ. Редакторы всех колорвеев
                смонтированы одновременно (черновик обязан пережить прыжок по плиткам), но рисовать
                у каждого по четыре карточки с их нормами, инструментами и подписками на форму —
                значит платить за шесть экранов, чтобы показать один. Черновик при этом живёт ВЫШЕ,
                в состоянии редактора: числа, привязки деталей, пины и staged переключение
                переживают целиком (что теряется — перечислено у пропа `active`). */}
            {active ? (
              <>
                {/* Шире, чем 10px стека блока, намеренно: каждая карточка сама по себе — плотная
                    группа с собственной линейкой, и на стековом расстоянии последняя строка одной
                    читалась бы как первая строка следующей. */}
                <div className='flex flex-col gap-5'>
                  {cardSlots.map((slot) => {
                    const rows = rowsBySlot.get(slot.lineKey ?? '');
                    return (
                      <FabricRecipeCard
                        key={slot.lineKey}
                        slot={slot}
                        garmentRows={rows?.garment ?? []}
                        pieceRows={(rows?.pieces ?? []).map((row) => ({
                          row,
                          piece: pieceByKey.get(row.draft.pieceLineKey),
                        }))}
                        pieces={pieces}
                        shapes={shapes}
                        layerIssues={layerIssues}
                        materials={materials}
                        estimate={estimateBySlot.get(slot.lineKey ?? '')}
                        markers={cwMarkers}
                        cardMarkersAllColorways={allCardMarkers}
                        recipeLinks={recipeLinks}
                        colorwayId={colorwayId}
                        techCardId={techCardId}
                        sizeIds={sizeIds}
                        sizeNameById={sizeNameById}
                        canEdit={canEdit}
                        active={active}
                        onPatchSlot={(index, patch) =>
                          patchGarmentSlot(slot.lineKey ?? '', index, patch)
                        }
                        onRemoveRow={removeUsage}
                        onTogglePiece={(piece) => togglePieceOnSlot(slot.lineKey ?? '', piece)}
                      />
                    );
                  })}
                </div>
                {hasSilhouettes && (
                  <Text size='micro' variant='label'>
                    силуэты — из разобранных DXF, по срединному размеру ряда
                  </Text>
                )}
              </>
            ) : (
              <Text size='micro' variant='label'>
                выберите этот колорвей плиткой выше, чтобы открыть его ткани
              </Text>
            )}
          </>
        )}

        {/* СТРОКИ, КОТОРЫМ НЕГДЕ ЛЕЖАТЬ, И ЧТО С НИМИ ДЕЛАТЬ. Карточку рисует строка BOM, поэтому
            строке, чей слот удалили на вкладке BOM (или которая слота вообще не называет), карточки
            не досталось.

            ЭТО НЕ КОСМЕТИКА, А ПОТЕРЯ ДАННЫХ: полная замена отправляет только строки с разрешимым
            слотом, то есть правка ЛЮБОЙ соседней нормы уносит такую строку с собой — молча и без
            повода. Поэтому здесь ровно две правды и оба выхода: сказано, что сохранение её удалит,
            и дано чем это починить — назначить слот (единственное место на экране, где ткань
            выбирают выпадашкой) либо убрать самому. */}
        {strayRows.length > 0 && (
          <div>
            <GroupLabel>строки без слота</GroupLabel>
            <Text size='nano' variant='label' component='p' className='pb-1'>
              эти строки не называют ни одной живой строки BOM — слот удалили на вкладке BOM либо он
              не был назван вовсе. <b>Сохранение рецепта их удалит</b>: отправить строку с
              неразрешимой ссылкой нельзя, и уйдёт она вместе с любой соседней правкой. Назначьте
              слот (число при этом снимется — в какой единице оно было записано, проверить уже
              нечем) либо уберите строку сами
            </Text>
            {strayRows.map(({ draft, index }) => (
              <Row
                key={`${usageKey(draft)}:${index}`}
                label={
                  <span className='flex min-w-0 flex-wrap items-center gap-1.5'>
                    <Pill tone='warn'>слот потерян</Pill>
                    <Text size='micro' variant='label' component='span' className='truncate'>
                      {[
                        draft.pieceLineKey
                          ? pieceByKey.get(draft.pieceLineKey)?.name || draft.pieceLineKey
                          : 'на изделие',
                        draft.consumption.trim() || draft.quantity.trim(),
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </Text>
                  </span>
                }
                value={
                  canEdit ? (
                    <span className='flex items-center gap-1.5'>
                      <StraySlotAssign
                        slots={assignableSlots}
                        canEdit={canEdit}
                        onAssign={(bomLineKey) => assignStraySlot(index, bomLineKey)}
                      />
                      <Button
                        type='button'
                        variant='secondary'
                        size='xs'
                        onClick={() => removeUsage(index)}
                      >
                        убрать
                      </Button>
                    </span>
                  ) : undefined
                }
              />
            ))}
          </div>
        )}

        <CompositionBar {...derived} />

        {canEdit && staged && (
          <Text size='micro' variant='label'>
            {save.isPending ? 'saving…' : 'staged'} · included in the card’s Save
          </Text>
        )}
      </Section>

      {orphans.length > 0 && (
        <Section
          title={`${title} · unassigned`}
          question='piece removed, keep the usage as-is or unlink it'
        >
          {orphans.map(({ u, i }) => (
            <OrphanRecipeCard
              key={`${usageKey(u)}:${i}`}
              draft={u}
              bomItems={bomItems}
              materials={materials}
              canEdit={canEdit}
              kept={keptKeys.has(orphanKey(u))}
              onKeep={() => keepOrphan(u)}
              onUnlink={() => removeUsage(i)}
            />
          ))}
        </Section>
      )}

      <Section title={`${title} · dye · lab-dip`} question={colorway.baseSku}>
        <LabDipTimeline
          colorway={colorway}
          techCardId={techCardId}
          lockVersion={lockVersion}
          canEdit={canEdit}
          swatchHex={swatchHex}
          onStagedChange={setLabDipStaged}
        />
      </Section>
    </SectionStack>
  );
}

// One colourway in the swatch grid. The swatch IS the content: full-bleed colour, no outline — an
// outline around a colour reads as a box rather than as the colour itself.
function ColorwayTile({
  colorway,
  hex,
  status,
  selected,
  onSelect,
}: {
  colorway: common_AdminColorwayRef;
  hex?: string;
  status?: RecipeStatus;
  selected: boolean;
  onSelect: () => void;
}) {
  const code = colorwayTitle(colorway);
  const count = status?.count ?? colorway.usages?.length ?? 0;

  return (
    <Tile
      selected={selected}
      onClick={onSelect}
      name={code}
      media={
        hex ? (
          <div className='aspect-square w-full' style={{ backgroundColor: hex }} aria-hidden />
        ) : (
          <Placeholder aspect='square' label='no hex' />
        )
      }
    >
      <div className='mt-1 flex flex-wrap items-center gap-1'>
        <LabDipPill status={colorway.labDipStatus} />
        {/* A colourway with no recipe is red right here in the grid — you should never have to open
            one to find out it is empty. */}
        {count === 0 ? (
          <Pill tone='warn'>0</Pill>
        ) : (
          <Text size='micro' variant='label' component='span' className='tabular-nums'>
            {count}
          </Text>
        )}
        {status?.staged && <Pill tone='attention'>staged</Pill>}
      </div>
    </Tile>
  );
}

// #35 — inline "create colourway": until this existed the recipe editor could only edit EXISTING
// colourways (techCard.colorways), so making a new one meant leaving for the product manager and
// coming back (ping-pong). This spins up a minimal DRAFT (colour only, via CreateColorway) without
// leaving the tech card. It occupies the SAME slot below the grid as a recipe, opened from the
// dashed `+ colourway` tile.
//
// KEEPS ITS OWN BUTTON, deliberately — like roles-field (19.5). Creating a colourway is not a draft
// edit of this card: it mints the row every other panel here then refers to, so it has to exist
// before the card's Save runs, not with it.
function CreateColorwayForm({
  techCardId,
  usedCodes,
  onCancel,
  onCreated,
}: {
  techCardId: number;
  usedCodes: Set<string>;
  onCancel: () => void;
  onCreated: (colorwayId?: number) => void;
}) {
  const { dictionary } = useDictionary();
  const { showMessage } = useSnackBarStore();
  const create = useCreateColorway(techCardId);
  const [colorCode, setColorCode] = useState('');

  const availableColors = (dictionary?.colors ?? []).filter((c) => !c.archived && c.code);
  const picked = availableColors.find((c) => c.code === colorCode);

  const submit = () => {
    if (!colorCode) {
      showMessage('Pick a colour', 'error');
      return;
    }
    create.mutate(colorCode, {
      onSuccess: (res) => {
        showMessage('Draft colourway created', 'success');
        setColorCode('');
        onCreated(res?.colorwayId);
      },
      onError: (e) => showMessage(createColorwayErrorMessage(e), 'error'),
    });
  };

  return (
    <div className='flex flex-col gap-2 border border-borderColor bg-bgColor p-4'>
      <SectionHeader
        title='новый колорвей'
        question='a DRAFT colourway — colour only, so its recipe can be edited here; media, price and the rest come from the product manager afterwards'
      />
      {availableColors.length === 0 ? (
        <CalloutBox tone='note'>
          <Text size='micro' component='span'>
            no colours in the dictionary yet — add them under <b>settings › colors</b>
          </Text>
        </CalloutBox>
      ) : (
        <Toolbar>
          <label className='flex flex-col gap-1'>
            <FieldLabel>colour</FieldLabel>
            <span className='flex items-center gap-2'>
              <Swatch hex={picked?.hex} title={picked?.name ?? undefined} />
              <select
                className={cn(cell, 'w-56')}
                value={colorCode}
                onChange={(e) => setColorCode(e.target.value)}
              >
                <option value=''>— select colour —</option>
                {availableColors.map((c) => (
                  <option key={c.code} value={c.code} disabled={usedCodes.has(c.code ?? '')}>
                    {c.code} · {c.name}
                    {usedCodes.has(c.code ?? '') ? ' (already on this style)' : ''}
                  </option>
                ))}
              </select>
            </span>
          </label>
          <ToolbarSpacer />
          <Button type='button' variant='secondary' size='sm' onClick={onCancel}>
            cancel
          </Button>
          <Button
            type='button'
            variant='main'
            size='sm'
            disabled={create.isPending || !colorCode}
            loading={create.isPending}
            onClick={submit}
          >
            create
          </Button>
        </Toolbar>
      )}
    </div>
  );
}

// Colourway recipes (H1/§2.3): the constructor view of each colourway's material recipe, now that the
// read-path surfaces usages. Edited per colourway and written by UpdateColorwayRecipe (full-replace),
// staged into the card's one save rather than fired from here (19).
//
// Colour is the subject here, so the roster leads with the swatch: a grid of tiles that STAYS ON
// SCREEN while a recipe is edited underneath it — the accordion this replaced hid every sibling the
// moment you opened one, which is exactly wrong for a job that is comparing colourways.
export function ColorwayRecipes({
  techCard,
  techCardId,
  canEdit,
}: {
  techCard?: common_TechCard;
  techCardId: number;
  canEdit: boolean;
}) {
  const { dictionary } = useDictionary();
  const colorways = techCard?.colorways ?? [];
  // The card's cut pieces, LIVE from form state — the same source every other piece picker reads —
  // so a piece added seconds ago in the table above appears in each recipe immediately, without a
  // save round-trip. addPiece mints the stable lineKey up front, and under the card's one save the
  // body (which creates the piece server-side, keyed by that lineKey) commits before any recipe
  // write (COMMIT_ORDER), so a usage pointed at a fresh piece resolves. The server id — needed only
  // to resolve legacy usages that carry piece_id instead of piece_line_key — still comes off the
  // read, merged by lineKey; a piece not yet saved simply has none.
  const formPieces = useFormPieces();
  const serverPieceIdByKey = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of techCard?.techCard?.pieces ?? []) {
      const key = p.lineKey?.trim();
      if (key) m.set(key, wireInt((p as unknown as { id?: unknown }).id));
    }
    return m;
  }, [techCard?.techCard?.pieces]);
  const pieces = useMemo<RecipePiece[]>(
    () => formPieces.map((p) => ({ ...p, id: serverPieceIdByKey.get(p.lineKey) ?? 0 })),
    [formPieces, serverPieceIdByKey],
  );
  // The catalog materials the BOM lines link to (materialId) — loaded once for the whole tab so each
  // recipe usage can render the SAME square article card the BOM tab shows (photo · code · spec).
  // section '' = all sections; includeArchived so a line linked to an archived material still resolves.
  const { data: materialsData } = useMaterials('', true);
  const materials = useMemo(() => materialsData?.materials ?? [], [materialsData?.materials]);
  const materialById = useMemo(() => {
    const m = new Map<number, common_Material>();
    for (const mat of materials) if (wireInt(mat.id)) m.set(wireInt(mat.id), mat);
    return m;
  }, [materials]);
  // The card's BOM slots, LIVE from form state — for the same reason the pieces above are: a slot
  // added on the BOM tab a moment ago has to be assignable here immediately, instead of only after
  // a save and a refetch. It is safe for a usage to point at a slot the server has never seen,
  // because COMMIT_ORDER puts the card body (which creates the line, keyed by that same lineKey)
  // ahead of every recipe write — that ordering exists for exactly this case.
  //
  // The server `id` still comes off the read, merged by lineKey: it is needed only to resolve a
  // LEGACY usage that carries bom_item_id instead of bom_line_key (see fromRead). A slot not yet
  // saved simply has none, and nothing legacy can point at it.
  //
  // The values here are already input-shaped strings (mapBomItemToForm ran decimalToInput on the
  // way in), so unlike the read path they are used as-is.
  const formBom = (useWatch<TechCardFormData>({ name: 'bomItems' }) ??
    []) as TechCardFormData['bomItems'];
  const serverBomIdByKey = useMemo(() => {
    const m = new Map<string, number>();
    for (const b of techCard?.techCard?.bomItems ?? []) {
      const key = b.lineKey?.trim();
      if (key) m.set(key, wireInt(b.id));
    }
    return m;
  }, [techCard?.techCard?.bomItems]);
  // Enrich BOM lines with the fields the recipe editor now needs: price/wastage/unit for the run-cost
  // preview (per-size grading), the composition cell for the derived-composition summary,
  // and the linked catalog material so each usage renders as the square article card.
  const bomItems = useMemo<BomLine[]>(
    () =>
      (formBom ?? [])
        .filter((b) => !!b.lineKey?.trim())
        .map((b) => {
          const materialId = wireInt(b.materialId);
          const lineKey = b.lineKey as string;
          return {
            id: serverBomIdByKey.get(lineKey) ?? 0,
            lineKey,
            name: b.name,
            section: b.section,
            purpose: b.purpose,
            unit: b.unit,
            unitPrice: b.unitPrice,
            currency: b.currency,
            wastagePercent: b.wastagePercent,
            fabricWidth: b.fabricWidth,
            effectiveFabricWidthCm: b.effectiveFabricWidthCm,
            selvedgeCm: b.selvedgeCm,
            composition: b.composition,
            materialId,
            material: materialId > 0 ? materialById.get(materialId) : undefined,
          };
        }),
    [formBom, serverBomIdByKey, materialById],
  );
  // СИЛУЭТЫ ДЕТАЛЕЙ — пассивная подписка на общий разбор DXF карточки. `enabled=false`: разбор
  // отсюда НЕ стартует никогда (рецепт — справочная поверхность, мегабайты с CDN и воркер ради
  // глифов не платим), но кэш, согретый вкладкой PATTERNS, диалогом «по выкройкам…» или
  // раскрывашкой пересчёта, отдаётся — это документированное свойство useDxfGeometry. Холодная
  // карточка честно молчит: ни иконок, ни спиннеров, ни одного сетевого запроса; тёплую видно
  // сразу, а разбор, идущий прямо сейчас, доедет сюда реактивно.
  const pieceAliases = (useWatch<TechCardFormData>({ name: 'pieceDxfAliases' }) ??
    []) as PieceAliasRow[];
  const dxfPack = useCardDxfPack();
  const dxfGeometry = useDxfGeometry(dxfPack, false);
  const dxfIndex = useDxfIndex(dxfGeometry.data);
  // Контур выбирают ТЕ ЖЕ общие правила, что на вкладке деталей кроя: refs из piece-block-refs +
  // findPiece (первая живая привязка, срединный размер ряда, слой линии кроя с фолбэком). Своя
  // эвристика тут разошлась бы с плитками молча — одна деталь рисовалась бы двумя фигурами.
  const fabScopes = useMemo(() => rollGoodsScopes(formBom ?? []), [formBom]);
  const refsByPiece = useMemo(
    () => pieceBlockRefs(pieceAliases, fabScopes),
    [pieceAliases, fabScopes],
  );
  const shapeByKey = useMemo(() => {
    if (!dxfIndex) return null;
    const m = new Map<string, FoundPiece | null>();
    for (const [key, refs] of refsByPiece) m.set(key, findPiece(dxfIndex, refs));
    return m;
  }, [dxfIndex, refsByPiece]);
  const sizeIds = (techCard?.techCard?.sizeIds ?? []) as number[];
  const sizeNameById = useMemo(() => {
    const m = new Map<number, string>();
    for (const s of dictionary?.sizes ?? []) if (s.id != null) m.set(s.id, s.name ?? `#${s.id}`);
    return m;
  }, [dictionary?.sizes]);
  // Each colourway's dictionary colour, for the tile swatch and the lab-dip round marker.
  const hexByCode = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of dictionary?.colors ?? []) if (c.code && c.hex) m.set(c.code, c.hex);
    return m;
  }, [dictionary?.colors]);
  const lockVersion = techCard?.lockVersion ?? 0;
  const usedCodes = useMemo(
    () => new Set(colorways.map((c) => c.colorCode ?? '').filter(Boolean)),
    [colorways],
  );

  // Which tile owns the slot below the grid: a colourway id, the create form, or nothing (which
  // falls back to the first colourway so the tab is never a grid over dead space).
  const [selected, setSelected] = useState<number | 'new' | null>(null);
  const activeId = selected === 'new' ? null : selected ?? colorways[0]?.colorwayId ?? null;

  // ?colorway=<id> opens one colourway's recipe directly. Sent by the BOM tab when a delete is
  // blocked by this colourway's recipe, so «which usage do I remove» lands on screen rather than
  // on a grid the operator has to search. The param is consumed, not kept: leaving it set would
  // re-select this colourway every time the tab is reopened.
  const [params, setParams] = useSearchParams();
  const deepLinked = params.get('colorway');
  useEffect(() => {
    if (!deepLinked) return;
    const id = Number(deepLinked);
    if (Number.isFinite(id) && id > 0) setSelected(id);
    const next = new URLSearchParams(params);
    next.delete('colorway');
    setParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deepLinked]);

  // Live per-colourway recipe state, reported up by each editor so the grid can badge it — including
  // the colourways whose editor is currently hidden, which is the point: a staged edit two swatches
  // away must be visible without opening it.
  const [statuses, setStatuses] = useState<Record<number, RecipeStatus>>({});
  const reportStatus = useCallback((colorwayId: number, next: RecipeStatus) => {
    setStatuses((prev) => {
      const cur = prev[colorwayId];
      if (cur && cur.count === next.count && cur.staged === next.staged) return prev;
      return { ...prev, [colorwayId]: next };
    });
  }, []);

  return (
    <div className='flex flex-col gap-2.5'>
      {/* This half shares the tab with the cut-piece table above it, so it has to announce itself —
          an unlabelled swatch grid under «детали кроя» reads as part of that block. */}
      <SectionHeader
        title='колорвеи'
        question='— which catalog article goes on each part, in what colour and at what consumption'
      />
      <Text size='micro' variant='label'>
        Each colourway is its own write, and every one you edit goes out with the card’s Save.
      </Text>

      <Tiles min={120}>
        {colorways.map((cw) => (
          <ColorwayTile
            key={cw.colorwayId}
            colorway={cw}
            hex={hexByCode.get(cw.colorCode ?? '')}
            status={statuses[cw.colorwayId ?? 0]}
            selected={activeId === cw.colorwayId}
            onSelect={() => setSelected(cw.colorwayId ?? null)}
          />
        ))}
        {canEdit && (
          <Tile
            dashed
            selected={selected === 'new'}
            name='colourway'
            onClick={() => setSelected('new')}
            media={
              <div className='flex aspect-square w-full items-center justify-center border border-dashed border-borderColor'>
                <Text size='stat' variant='label' component='span'>
                  +
                </Text>
              </div>
            }
          />
        )}
      </Tiles>

      {colorways.length === 0 && (
        <Text size='micro' variant='label'>
          no colourways yet — a colourway is a product. Create a draft from the tile above, or from
          the product manager, then its material recipe is edited here.
        </Text>
      )}

      {/* The slot. Every editor stays MOUNTED and merely hidden, so an unsaved recipe survives a hop
          to another colourway and back — losing a draft to a tile click would be worse than the
          accordion this replaced. */}
      {colorways.map((cw) => (
        <div key={cw.colorwayId} hidden={activeId !== cw.colorwayId}>
          <ColorwayRecipeEditor
            colorway={cw}
            bomItems={bomItems}
            materials={materials}
            markers={techCard?.markers}
            pieces={pieces}
            // null всем скрытым: редакторы смонтированы все сразу, и без этого 7 колорвеев ×
            // 40 деталей положили бы в спрятанный DOM ~300 полигонов по сотням точек.
            shapes={activeId === cw.colorwayId ? shapeByKey : null}
            active={activeId === cw.colorwayId}
            sizeIds={sizeIds}
            sizeNameById={sizeNameById}
            swatchHex={hexByCode.get(cw.colorCode ?? '')}
            lockVersion={lockVersion}
            techCardId={techCardId}
            canEdit={canEdit}
            onStatus={reportStatus}
          />
        </div>
      ))}

      {canEdit && selected === 'new' && (
        <CreateColorwayForm
          techCardId={techCardId}
          usedCodes={usedCodes}
          onCancel={() => setSelected(null)}
          // Land on the colourway that was just created — its recipe is why you made it.
          onCreated={(id) => setSelected(id ?? null)}
        />
      )}
    </div>
  );
}
