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
import { PieceRef, useFormPieces } from './piece-picker';
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

// Рулонные секции здесь — с решения владельца (2026-08-10): расход ткани — свойство ИЗДЕЛИЯ, и его
// норма живёт на строке «на изделие». Строка детали справочная («из какой ткани кроится», см.
// PieceFabricRow) и блока расхода не несёт — не будь ткани в этом наборе, норме было бы негде жить.
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

// ОДНА И ТА ЖЕ ЕДИНИЦА НОРМЫ у двух слотов — ПО СМЫСЛУ, а не по строке. «м» и «metres» — одна
// единица (bomUnitKind сводит весь словарь синонимов записи), «м» и «см» — разные. Единицы вне
// словаря сравниваются нормализованными строками: «шт» и «пар» — тоже РАЗНЫЕ единицы, хотя обе
// нам неизвестны. Неизвестная против известной — разные всегда (число в «м» не становится числом
// в «шт» от того, что второе мы не умеем писать).
function sameNormUnit(a?: string, b?: string): boolean {
  const ka = bomUnitKind(a);
  const kb = bomUnitKind(b);
  if (ka != null || kb != null) return ka === kb;
  return (a ?? '').trim().toLowerCase() === (b ?? '').trim().toLowerCase();
}

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

function changedLines(base: UsageDraft[], next: UsageDraft[]): number {
  const sig = (u: UsageDraft) => JSON.stringify(toWire(u));
  const before = new Map(base.map((u) => [usageKey(u), sig(u)]));
  const after = new Map(next.map((u) => [usageKey(u), sig(u)]));
  let n = 0;
  // added (no such key before) or edited (same key, different payload)
  for (const [k, s] of after) if (before.get(k) !== s) n += 1;
  for (const k of before.keys()) if (!after.has(k)) n += 1; // removed
  return n;
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
  sizeNameById,
  onChange,
}: {
  draft: UsageDraft;
  sizeIds: number[];
  article?: BomLine;
  // ЕДИНИЦА НОРМЫ, резолвленная строкой (SlotUsageRow: единица слота, и только она) — здесь
  // подписываются поля ввода САМОЙ нормы, и брать единицу с эффективного артикула значило бы
  // подписать «кг» число, которое сервер хранит и считает в единице строки.
  unit: string;
  canEdit: boolean;
  sizeNameById: Map<number, string>;
  onChange: (patch: Partial<UsageDraft>) => void;
}) {
  const perSize = draft.sizeConsumptions.length > 0;
  const lastPerSize = useRef<{ sizeId: number; consumption: string }[]>([]);

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
  /** Основа веса кг-слота (Ф3) — резолвится строкой (SlotUsageRow), одна на все инструменты. */
  weightBasis: WeightBasisResolution;
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
  if (!scalar && perSize.length === 0) return null;

  const source = draft.consumptionSource;
  const isMarker = source === 'marker';
  const isDxf = source === 'dxf';
  const label = isMarker ? 'из раскладки' : isDxf ? 'по выкройкам' : 'введено руками';
  // ПЕР-РАЗМЕРНАЯ НОРМА ПОБЕЖДАЕТ СКАЛЯР — ровно как на сервере: при непустых size_consumptions
  // LineTotal невалиден, себестоимость стиля берёт норму базового размера, а план прогона читает
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

// The slot's identifying CODE for the picker: the default article's code (or its name), so a slot
// reads by what it IS, not by a row number. Falls back to the slot's own role for an article-less
// line — same rule the master fabric picker used.
function slotCode(b: BomLine): string {
  const m = b.material;
  if (m)
    return composeArticleFromMaterial(m, true) || m.name?.trim() || b.name?.trim() || 'material';
  return b.name?.trim() || 'без названия';
}

// The meta line under the code: the ROLE first (it is what tells two slots with the same default
// article apart), then the material's own spec + colour.
function slotSpecLine(b: BomLine): string {
  const m = b.material;
  const role = b.name?.trim();
  return [role, m ? materialSpec(m) : '', m?.color?.trim()].filter(Boolean).join(' · ');
}

// The slot chooser — the master fabric picker, carried over to slots. Replaces the native <select>:
// a select can render only text, and a slot is picked by its article's photo + spec + role, not by
// a row label. A field-box trigger (the shared `cell` box) shows the current pick as thumbnail +
// code + meta; the menu is the app's one popover shell (portalled, focus-trapped, Esc to close).
// Options already used in this recipe group are disabled with «уже в рецепте»; the current pick
// stays visible even when the section filter (or its removal from the BOM) would hide it, so a
// save never silently drops a stored reference.
function SlotPicker({
  value,
  slots,
  allowedSections,
  usedKeys,
  canEdit,
  onChange,
}: {
  value: string;
  slots: BomLine[];
  allowedSections: Set<string>;
  usedKeys: Set<string>;
  canEdit: boolean;
  onChange: (bomLineKey: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const selected = value ? slots.find((slot) => slot.lineKey === value) : undefined;
  const unknown = !!value && !selected;
  const eligible = slots.filter(
    (slot) => allowedSections.has(slot.section ?? '') || slot.lineKey === value,
  );

  const pick = (bomLineKey: string) => {
    onChange(bomLineKey);
    setOpen(false);
  };

  return (
    <GenericPopover
      open={open && canEdit}
      onOpenChange={setOpen}
      noTail
      title='слот'
      className='w-[280px]'
      triggerProps={{
        disabled: !canEdit,
        'aria-label': 'слот',
        className: cn(cell, 'flex items-center gap-2 text-left'),
      }}
      openElement={(isOpen) => (
        <>
          {selected ? (
            <MaterialThumb material={selected.material} size='sm' className='h-5 w-5' />
          ) : null}
          <span className='min-w-0 flex-1'>
            {selected ? (
              <>
                <Text
                  component='span'
                  size='control'
                  className='block truncate font-mono tabular-nums'
                >
                  {slotCode(selected)}
                </Text>
                {slotSpecLine(selected) && (
                  <Text component='span' size='micro' variant='label' className='block truncate'>
                    {slotSpecLine(selected)}
                  </Text>
                )}
              </>
            ) : (
              <Text component='span' variant='label' className='block truncate'>
                {unknown ? '(unknown / removed slot)' : '— выбрать слот —'}
              </Text>
            )}
          </span>
          <Text component='span' variant='inactive' className='shrink-0'>
            {isOpen ? '▴' : '▾'}
          </Text>
        </>
      )}
    >
      {/* full-bleed list inside the popover body's px-2 py-1.5 padding */}
      <div role='listbox' aria-label='слот' className='-mx-2 -my-1.5'>
        {/* the stored-but-removed slot, surfaced as the current selection so it is never dropped */}
        {unknown && (
          <div
            role='option'
            aria-selected
            className='flex w-full items-center gap-2 border-b border-hairline bg-bgZebra px-2 py-1 text-left'
          >
            <MaterialThumb size='sm' className='h-8 w-8' />
            <Text component='span' variant='label' size='micro' className='min-w-0 flex-1 truncate'>
              (unknown / removed slot)
            </Text>
            <Text component='span' variant='inactive' className='shrink-0'>
              ✓
            </Text>
          </div>
        )}

        {eligible.length === 0 && !unknown ? (
          <div className='px-2 py-2.5'>
            <Text variant='label' size='micro'>
              нет подходящих слотов в BOM
            </Text>
          </div>
        ) : (
          eligible.map((b) => {
            const current = value === b.lineKey;
            const used = !current && usedKeys.has(b.lineKey ?? '');
            const offGroup = !allowedSections.has(b.section ?? '');
            const spec = slotSpecLine(b);
            return (
              <button
                key={b.lineKey}
                type='button'
                role='option'
                aria-selected={current}
                disabled={used}
                onClick={() => pick(b.lineKey ?? '')}
                className={cn(
                  'flex w-full items-center gap-2 border-b border-hairline px-2 py-1 text-left',
                  current && 'bg-bgZebra',
                  used && 'cursor-not-allowed text-labelColor',
                )}
              >
                <MaterialThumb material={b.material} size='sm' className='h-8 w-8' />
                <span className='min-w-0 flex-1'>
                  <Text
                    component='span'
                    size='control'
                    className='block truncate font-mono tabular-nums'
                  >
                    {slotCode(b)}
                  </Text>
                  {(spec || used || offGroup) && (
                    <Text component='span' size='micro' variant='label' className='block truncate'>
                      {[spec, used ? 'уже в рецепте' : '', offGroup ? 'не для этой группы' : '']
                        .filter(Boolean)
                        .join(' · ')}
                    </Text>
                  )}
                </span>
                {current && (
                  <Text component='span' variant='inactive' className='shrink-0'>
                    ✓
                  </Text>
                )}
              </button>
            );
          })
        )}
      </div>
    </GenericPopover>
  );
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

function SlotUsageRow({
  draft,
  bomItems,
  allowedSections,
  usedKeys,
  materials,
  sizeIds,
  sizeNameById,
  canEdit,
  markers,
  cardMarkersAllColorways,
  recipeLinks,
  colorwayId,
  onChange,
  onRemove,
}: {
  draft: UsageDraft;
  bomItems: BomLine[];
  allowedSections: Set<string>;
  usedKeys: Set<string>;
  materials: common_Material[];
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
  onChange: (patch: Partial<UsageDraft>) => void;
  onRemove: () => void;
}) {
  const slot = draft.bomLineKey
    ? bomItems.find((item) => item.lineKey === draft.bomLineKey)
    : undefined;
  const material = effectiveMaterial(draft, slot, materials);
  const materialId = effectiveMaterialId(draft, slot);
  const article = articleForUsage(slot, material, materialId);
  const isMeasured = measured(slot?.section);
  // "Pinned" = пин на ДРУГОЙ артикул, чем у слота: пин обратно на свой же артикул — та же ткань,
  // и переопределение ширины на строке всё ещё описывает её. То же условие уходит в cuttingWidthOf.
  const pinnedDifferent = draft.materialId > 0 && draft.materialId !== slot?.materialId;
  // ОСНОВА ВЕСА кг-слота (Ф3) резолвится ЗДЕСЬ — единственным местом, у которого есть и
  // эффективный артикул, и строка, и факт пина, — и раздаётся готовой всем инструментам ниже
  // (раскладка, выкройки, пересчёт): ни одно из них не должно выбирать ширину и плотность само.
  const weightBasis = weightBasisOf(material, slot, pinnedDifferent);
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
  const unit = slot?.unit?.trim() || '';
  const missingArticle = !!slot && materialId === 0;

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

  // The colourway PIN — «этот колорвей берёт ДРУГОЙ артикул в этом слоте» — demoted from a second
  // always-on select to a small popover on the article card: one visible picker per row (the slot),
  // exactly like the master fabric picker; pinning is the exception, not a parallel question.
  const pinned = draft.materialId > 0;
  const [pinOpen, setPinOpen] = useState(false);
  // Форма карточки нужна диалогу «по выкройкам»: выкройки, детали кроя и их связи с блоками живут
  // в ней, а не в рецепте (рецепт — серверный, правится своим RPC).
  const { control } = useFormContext<TechCardFormData>();
  // Норма ЕСТЬ и её дал ИНСТРУМЕНТ (раскладка или выкройки) — тогда ручной ввод уходит за
  // раскрывашку. Нормы нет вовсе — туда же: на пустой строке первым надо предлагать посчитать, а не
  // угадать. Инлайном остаётся только уже набранное руками число (см. комментарий у раскрывашки).
  const derivedNorm = draft.consumptionSource === 'marker' || draft.consumptionSource === 'dxf';
  const hasNorm =
    !!draft.consumption.trim() ||
    draft.sizeConsumptions.some((s) => (s.consumption ?? '').trim() !== '');
  const manualInline = !derivedNorm && hasNorm;

  return (
    <div className='flex flex-col gap-3 py-2 first:pt-0 last:pb-0 sm:flex-row sm:items-start'>
      <div className='w-full sm:w-28 sm:shrink-0'>
        <RecipeMaterialCard slot={slot} material={material} materialId={materialId} />
        {canEdit && slot && (
          <div className='mt-1'>
            <GenericPopover
              open={pinOpen}
              onOpenChange={setPinOpen}
              noTail
              title='артикул колорвея'
              className='w-[280px]'
              triggerProps={{
                'aria-label': 'артикул колорвея',
                className: cn(
                  buttonVariants({ variant: 'secondary', size: 'xs' }),
                  'w-full justify-center',
                ),
              }}
              openElement={pinned ? 'пин ✎' : 'другой артикул…'}
            >
              <div className='flex flex-col gap-1.5'>
                <ArticlePinSelect
                  draft={draft}
                  slot={slot}
                  materials={materials}
                  canEdit={canEdit}
                  // СМЕНА ПИНА НА КГ-СЛОТЕ СНИМАЕТ ЧИСЛО НОРМЫ (и провенанс вместе с ним — как
                  // это делает смена слота, SlotPicker ниже). Кг-норма ЗАКОДИРОВАЛА в себе основу веса КОНКРЕТНОГО
                  // артикула (полная ширина × плотность, toBomUnit): маркер 2 м на артикуле
                  // 150 см × 200 г/м² записан как 0.6 кг, и после пина на 180 см × 250 г/м²
                  // строка продолжала бы обещать 0.6 при правильных 0.9 — прогон объявил бы
                  // честный факт перерасходом +50%. На слотах в метрах/сантиметрах число НЕ
                  // трогается: длина от артикула не зависит (за шириной раскладки следит
                  // отдельная проверка ширины). Сравниваются ЭФФЕКТИВНЫЕ артикулы: «default» ↔
                  // явный пин на артикул самого слота — та же ткань, и чистить нечего.
                  //
                  // НИ В КОЕМ СЛУЧАЕ не «сбросить провенанс, оставив число»: марочное число
                  // содержит отходы ВНУТРИ, и, став manual, оно получило бы сверху процент
                  // раскроя слота — двойной учёт. Либо число уходит вместе с источником, либо
                  // не трогается ничего.
                  onChange={(materialId) => {
                    const patch: Partial<UsageDraft> = { materialId };
                    const effectiveBefore = draft.materialId || slot?.materialId || 0;
                    const effectiveAfter = materialId || slot?.materialId || 0;
                    if (bomUnitKind(unit) === 'kg' && effectiveBefore !== effectiveAfter) {
                      patch.consumption = '';
                      patch.sizeConsumptions = [];
                      Object.assign(patch, MANUAL_PROVENANCE);
                    }
                    onChange(patch);
                    setPinOpen(false);
                  }}
                />
                <Text size='micro' variant='label'>
                  Переопределяет артикул слота только в этом колорвее. «default» возвращает артикул
                  из BOM.
                </Text>
              </div>
            </GenericPopover>
          </div>
        )}
      </div>
      <div className='flex min-w-0 flex-1 flex-col gap-2.5'>
        {/* The section already badges the article card to the left — repeating it here made every
            fabric row open with three FABRIC chips. This row is just the action now. */}
        {canEdit && (
          <div className='flex items-center justify-end'>
            <Button type='button' variant='secondary' size='xs' onClick={onRemove}>
              unlink
            </Button>
          </div>
        )}

        <label className='flex min-w-0 flex-col gap-1 lg:max-w-sm'>
          <FieldLabel>слот</FieldLabel>
          <SlotPicker
            value={draft.bomLineKey}
            slots={bomItems}
            allowedSections={allowedSections}
            usedKeys={usedKeys}
            canEdit={canEdit}
            // Moving the row to another slot drops the marker provenance too. A раскладка is
            // measured on ONE cloth: carried across, its «marker» flag would keep costing from
            // grossing the new slot's wastage onto a length that never contained the new
            // cloth's cutting waste — understating the line, with no marker on the new slot for
            // the operator to notice it by. Same class of desync as retyping the number.
            //
            // ЕСЛИ ЕДИНИЦА НОВОГО СЛОТА — ДРУГАЯ, СНИМАЮТСЯ И САМИ ЧИСЛА (скаляр, пер-размерные
            // и quantity). Тот же класс рассинхрона, что у провенанса выше, только хуже: единица
            // нормы — это единица СЛОТА, число её с собой не несёт, и перенос «1.42» из слота в
            // метрах в слот в сантиметрах молча превращал МЕТРЫ в САНТИМЕТРЫ — записанной в
            // рецепт ошибкой масштаба в 100 раз, которую половина прогонов честно предъявила бы
            // как ±99…9900% к норме. Сравнение — по смыслу (sameNormUnit): «м» → «metres»
            // переезжает с числом, «м» → «см» и «шт» → «пар» — без. Слот, которого больше нет
            // (или без единицы), против слота с единицей — тоже «другая»: единицу старого числа
            // проверить нечем, а не угадывать — правило всех инструментов этой строки.
            onChange={(bomLineKey) => {
              const next = bomItems.find((item) => item.lineKey === bomLineKey);
              const patch: Partial<UsageDraft> = {
                bomLineKey,
                materialId: 0,
                ...MANUAL_PROVENANCE,
              };
              if (!sameNormUnit(unit, next?.unit)) {
                patch.consumption = '';
                patch.sizeConsumptions = [];
                patch.quantity = '';
              }
              onChange(patch);
            }}
          />
        </label>

        {pinned && (
          <Pill tone='mut'>пин: {material?.name?.trim() || `артикул #${draft.materialId}`}</Pill>
        )}
        {missingArticle && <Pill tone='warn'>нет артикула — блокер производства</Pill>}
        {/* The slot list is live form state now, so a slot can be deleted on the BOM tab while a
            recipe row still points at it — the BOM tab's delete guard only sees recipes the SERVER
            has, and this row may never have been saved. Say so here rather than let the save fail
            on a line_key the server cannot resolve. */}
        {!!draft.bomLineKey && !slot && (
          <Pill tone='warn'>слот удалён на вкладке BOM — выберите другой</Pill>
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
              slotWastagePercent={slot?.wastagePercent ?? ''}
              articleWidth={cuttingWidthOf(material, slot, pinnedDifferent)}
              recipeLinks={recipeLinks}
              weightBasis={weightBasis}
            />
            {/* Ф4: измеренный маркером расход этого слота, применяемый в ЭТОТ драфт — через
                тот же onChange, которым staged-рецепт и живёт. */}
            <MarkerApplyHint
              markers={markers}
              colorwayId={colorwayId}
              lineKey={draft.bomLineKey}
              unit={unit}
              wastagePercent={slot?.wastagePercent ?? ''}
              // The article's CUTTING width — roll minus the кромка on both edges — because
              // that is the width a marker is laid on and records. The pinned/linked material's
              // catalog figures come first (a colourway pin can be a different cloth), the
              // slot's own otherwise ("pinned" = pinned to a DIFFERENT article, see pinnedDifferent).
              articleWidth={cuttingWidthOf(material, slot, pinnedDifferent)}
              // Основа веса кг-слота — та же, что у остальных инструментов строки (см. выше).
              weightBasis={weightBasis}
              sizeIds={sizeIds}
              sizeNameById={sizeNameById}
              canEdit={canEdit}
              // Патч уходит в черновик ЦЕЛИКОМ — вместе с ним и штамп нормы (normMarkerId, Ф6.8)
              // наравне с consumptionSource. Перечислять поля здесь поимённо значило бы завести
              // список, который обязан догонять marker-apply: провенанс и число разъехались бы
              // ровно в тот день, когда кто-то добавит там поле и забудет здесь.
              onApply={(patch) => onChange(patch)}
            />
            {/* 0294: тот же мост, но от ВЫКРОЕК — для карточки, на которой раскладки ещё нет.
                Число netto, и диалог сам не даёт применить его на слот без процента раскроя.

                МОНТИРУЕТСЯ ТОЛЬКО НА РЕДАКТИРУЕМОЙ КАРТОЧКЕ, и это не косметика: подсказка держит
                три подписки на массивы формы (BOM, детали кроя, связи блоков), а редакторы ВСЕХ
                колорвеев смонтированы одновременно (скрытые — не размонтированные). На выпущенной
                карточке применять всё равно нечего, а платить за подписки она бы продолжала: правка
                любой строки BOM будила бы каждую скрытую подсказку. Ранний выход внутри компонента
                эту цену не убирает — хуки уже подписаны к моменту возврата. */}
            {canEdit && (
              <DxfApplyHint
                control={control}
                lineKey={draft.bomLineKey}
                unit={unit}
                wastagePercent={slot?.wastagePercent ?? ''}
                articleWidth={cuttingWidthOf(material, slot, pinnedDifferent)}
                weightBasis={weightBasis}
                sizeIds={sizeIds}
                sizeNameById={sizeNameById}
                canEdit={canEdit}
                // Строка без нормы обязана услышать, ЧЕГО не хватает для расчёта по выкройкам, а не
                // остаться с одним «ввести руками…». Где норма уже есть — молчим: там это шум.
                explainWhenIdle={!hasNorm}
                recipeLinks={recipeLinks}
                onApply={(patch) => onChange(patch)}
              />
            )}
            {/* ПУСТАЯ СТРОКА ОБЯЗАНА СКАЗАТЬ, ЧЕГО ЖДЁТ, А НЕ ПРЕДЛАГАТЬ ОДИН ЛИШЬ РУЧНОЙ ВВОД.
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
                нет» рядом с её же кнопкой. */}
            {!hasNorm &&
              markersForLine(markers, draft.bomLineKey).length === 0 &&
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
                canEdit={canEdit}
                sizeNameById={sizeNameById}
                onChange={onChange}
              />
            ) : (
              <details className='border border-hairline px-2 py-1'>
                <summary className='cursor-pointer text-micro uppercase'>ввести руками…</summary>
                <div className='pt-1.5'>
                  <UsagePerSizeLocal
                    draft={draft}
                    sizeIds={sizeIds}
                    article={article}
                    unit={unit}
                    canEdit={canEdit}
                    sizeNameById={sizeNameById}
                    onChange={onChange}
                  />
                </div>
              </details>
            )}
          </div>
        ) : (
          <label className='flex flex-col gap-1'>
            <FieldLabel>quantity{unit ? ` (${unit})` : ''}</FieldLabel>
            <input
              className={cell}
              inputMode='decimal'
              disabled={!canEdit}
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
              {slot?.wastagePercent?.trim()
                ? ` · ${slot.wastagePercent}% слота не начисляются`
                : ''}
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
            на каждой пуговице была бы шумом, а не сигналом. */}
        {isMeasured &&
          !legacyCountedMeasured &&
          draft.consumptionSource !== 'marker' &&
          draft.consumptionSource !== 'dxf' && (
            <div className='flex flex-wrap items-center gap-1.5'>
              <Pill tone='attention'>расход введён руками</Pill>
              <Text size='nano' variant='label' component='span'>
                норма не снята с раскладки
                {slot?.wastagePercent?.trim()
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
      </div>
    </div>
  );
}

// ── СТРОКА ДЕТАЛИ: «ИЗ КАКОЙ ТКАНИ КРОИТСЯ» — И ВСЁ ─────────────────────────────────────────────
//
// Решение владельца (2026-08-10): расход ткани — свойство ИЗДЕЛИЯ, детали — справочно. Блока
// расхода здесь нет НАМЕРЕННО: ни нормы, ни «по выкройкам…», ни «из раскладки», ни ручного ввода,
// ни пина артикула. «По выкройкам» на такой строке собирал комплект по СКОУПУ ТКАНИ — то есть
// считал площадь всего изделия — и записывал её в одну деталь; на девяти деталях это девятикратный
// расход, и числа выглядят правдоподобно. Норма и все инструменты живут на строке той же ткани в
// разделе «на изделие»: там комплект деталей ткани и есть изделие, и тот же расчёт ВЕРЕН.
function PieceFabricRow({
  draft,
  bomItems,
  usedKeys,
  materials,
  sizeIds,
  sizeNameById,
  canEdit,
  onChange,
  onRemove,
}: {
  draft: UsageDraft;
  bomItems: BomLine[];
  usedKeys: Set<string>;
  materials: common_Material[];
  sizeIds: number[];
  sizeNameById: Map<number, string>;
  canEdit: boolean;
  onChange: (patch: Partial<UsageDraft>) => void;
  onRemove: () => void;
}) {
  const slot = draft.bomLineKey
    ? bomItems.find((item) => item.lineKey === draft.bomLineKey)
    : undefined;
  const material = effectiveMaterial(draft, slot, materials);
  // Пин показывается ФАКТОМ, но не правится: его судьба — отдельный разговор (он и про строку «на
  // изделие» тоже), а спрятать существующий пин молча значило бы показывать не ту ткань.
  const pinnedDifferent = draft.materialId > 0 && draft.materialId !== slot?.materialId;
  const unit = slot?.unit?.trim() || '';

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
    <div className='flex flex-col gap-1.5 py-2 first:pt-0 last:pb-0'>
      <div className='flex items-start gap-2'>
        <div className='min-w-0 flex-1 lg:max-w-sm'>
          <SlotPicker
            value={draft.bomLineKey}
            slots={bomItems}
            allowedSections={PIECE_SECTIONS}
            usedKeys={usedKeys}
            canEdit={canEdit}
            // Перенос на другой слот чистит и легаси-число с его провенансом: оно было про изделие
            // из ПРЕЖНЕЙ ткани (и в её единице) — на новом слоте оно не значит ничего.
            onChange={(bomLineKey) =>
              onChange({
                bomLineKey,
                materialId: 0,
                consumption: '',
                quantity: '',
                sizeConsumptions: [],
                normMarkerId: 0,
                ...MANUAL_PROVENANCE,
              })
            }
          />
        </div>
        {canEdit && (
          <Button type='button' variant='secondary' size='xs' onClick={onRemove}>
            unlink
          </Button>
        )}
      </div>
      {pinnedDifferent && (
        <Pill tone='mut'>пин: {material?.name?.trim() || `артикул #${draft.materialId}`}</Pill>
      )}
      {/* Слот живёт в форме и мог быть удалён на вкладке BOM, пока строка на него смотрит, —
          сказать здесь, а не дать сохранению упасть на неразрешимом line_key. */}
      {!!draft.bomLineKey && !slot && (
        <Pill tone='warn'>слот удалён на вкладке BOM — выберите другой</Pill>
      )}
      {legacyText && (
        <div className='flex flex-col gap-1'>
          <div className='flex flex-wrap items-center gap-1.5'>
            <Pill tone='attention'>легаси-расход на детали</Pill>
            <Text size='small' component='span' className='font-mono tabular-nums'>
              {legacyText}
            </Text>
          </div>
          <Text size='nano' variant='label' component='p'>
            это число сервер прибавляет к норме ткани — в себестоимость и в потребность прогона:
            строки одного слота суммируются. Расход изделия ведётся на строке этой ткани в разделе
            «на изделие» — заведите норму там, а это число уберите
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

// One ruled group per declared cut piece. The group owns any number of distinct slot usages; rows
// are separated by #e6e6e6 hairlines, while the piece label uses the heavier subgroup rule.
function PieceRecipeCard({
  piece,
  shape,
  rows,
  bomItems,
  materials,
  sizeIds,
  sizeNameById,
  canEdit,
  canAdd,
  onAdd,
  onChange,
  onRemove,
}: {
  piece: PieceRef;
  /** Контур из разобранных DXF; null — привязки нет, кэш холодный или редактор скрыт. */
  shape: FoundPiece | null;
  rows: IndexedUsage[];
  bomItems: BomLine[];
  materials: common_Material[];
  sizeIds: number[];
  sizeNameById: Map<number, string>;
  canEdit: boolean;
  canAdd: boolean;
  onAdd: () => void;
  onChange: (index: number, patch: Partial<UsageDraft>) => void;
  onRemove: (index: number) => void;
}) {
  const usedKeys = new Set(rows.map(({ draft }) => draft.bomLineKey).filter(Boolean));

  return (
    <div>
      <GroupLabel
        action={
          canEdit ? (
            <Button type='button' variant='secondary' size='xs' disabled={!canAdd} onClick={onAdd}>
              + добавить материал к детали
            </Button>
          ) : undefined
        }
      >
        {/* Силуэт — ведущий глиф строки детали, слева от имени. */}
        <PieceSilhouette found={shape} />
        {piece.name?.trim() || 'без названия'}
      </GroupLabel>
      {rows.length === 0 ? (
        <Row
          tone='label'
          label={
            <Text size='micro' variant='label' component='span'>
              материалы не назначены
            </Text>
          }
        />
      ) : (
        <div className='divide-y divide-hairline'>
          {rows.map(({ draft, index }) => (
            <PieceFabricRow
              key={`${usageKey(draft)}:${index}`}
              draft={draft}
              bomItems={bomItems}
              usedKeys={usedKeys}
              materials={materials}
              sizeIds={sizeIds}
              sizeNameById={sizeNameById}
              canEdit={canEdit}
              onChange={(patch) => onChange(index, patch)}
              onRemove={() => onRemove(index)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// A usage whose non-empty piece key no longer resolves on the PIECES tab. Empty piece keys belong in
// «на изделие», and additional slots on a live piece belong in that piece's list. KEEP retains the
// orphan in the full-replace save exactly as-is; UNLINK removes it.
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
          {canEdit &&
            (kept ? (
              <Text size='micro' variant='label'>
                kept · saved as-is
              </Text>
            ) : (
              <div className='flex flex-wrap items-center gap-1.5'>
                <Button type='button' variant='secondary' size='sm' onClick={onKeep}>
                  keep
                </Button>
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
  const garmentUsages = useMemo<IndexedUsage[]>(
    () =>
      usages.map((draft, index) => ({ draft, index })).filter(({ draft }) => !draft.pieceLineKey),
    [usages],
  );
  const orphans = useMemo(
    () =>
      usages
        .map((u, i) => ({ u, i }))
        .filter(({ u }) => !!u.pieceLineKey && !pieceKeySet.has(u.pieceLineKey)),
    [usages, pieceKeySet],
  );

  // A usage whose stored BOM reference no longer resolves can read back without bom_line_key. Do not
  // send that as an all-NULL slot: the recipe write validates every submitted row.
  const saveUsages = useMemo(() => usages.filter((usage) => usage.bomLineKey), [usages]);

  // Dirty says a control was touched; STAGED says the recipe would actually write something else, and
  // `lines` is what the header's label counts — re-derived over the piece model. Typing a value and
  // typing it back must not leave the header claiming work that is not there.
  const lines = useMemo(() => changedLines(baseline, usages), [baseline, usages]);
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

  const patchUsage = (index: number, patch: Partial<UsageDraft>) => {
    setDirty(true);
    setUsages((prev) => prev.map((usage, i) => (i === index ? { ...usage, ...patch } : usage)));
  };
  const addUsage = (
    pieceLineKey: string,
    placement: string,
    allowedSections: Set<string>,
    rows: IndexedUsage[],
  ) => {
    const used = new Set(rows.map(({ draft }) => draft.bomLineKey).filter(Boolean));
    const slot = bomItems.find(
      (item) =>
        !!item.lineKey && allowedSections.has(item.section ?? '') && !used.has(item.lineKey),
    );
    if (!slot?.lineKey) return;
    setDirty(true);
    setUsages((prev) => [
      ...prev,
      { ...blankDraft(pieceLineKey, placement), bomLineKey: slot.lineKey ?? '' },
    ]);
  };
  const removeUsage = (i: number) => {
    setDirty(true);
    setUsages((prev) => prev.filter((_, idx) => idx !== i));
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
  const garmentUsedKeys = new Set(
    garmentUsages.map(({ draft }) => draft.bomLineKey).filter(Boolean),
  );
  const canAddTo = (allowedSections: Set<string>, rows: IndexedUsage[]) => {
    const used = new Set(rows.map(({ draft }) => draft.bomLineKey).filter(Boolean));
    return bomItems.some(
      (item) =>
        !!item.lineKey && allowedSections.has(item.section ?? '') && !used.has(item.lineKey),
    );
  };

  return (
    <SectionStack>
      <Section
        title={`${title} · детали`}
        question={[
          colorway.baseSku,
          `${pieces.length} ${pieces.length === 1 ? 'piece' : 'pieces'}`,
          `${saveUsages.length} material rows`,
        ]
          .filter(Boolean)
          .join(' · ')}
        action={staged ? <Pill tone='attention'>staged</Pill> : undefined}
      >
        {bomItems.length === 0 && (
          <Text size='micro' variant='label'>
            add BOM slots on the BOM tab first, then assign them to pieces or the whole garment here
          </Text>
        )}

        {pieces.length === 0 ? (
          <CalloutBox tone='note'>
            <Text size='micro' component='span'>
              Declare cut pieces on the PIECES tab to assign piece-level material slots.
            </Text>
          </CalloutBox>
        ) : (
          <>
            {/* Модель сказана ОДИН раз на группу, а не на каждой строке: строки деталей блока
                расхода не несут (см. PieceFabricRow), и оператор должен знать, куда он переехал. */}
            <Text size='micro' variant='label'>
              строка детали отвечает на один вопрос — из какой ткани деталь кроится. Расход ткани —
              свойство изделия: норма и инструменты («по выкройкам…», «из раскладки») живут в
              разделе «на изделие» ниже
            </Text>
            {/* Wider than the block's 10px stack on purpose: each card is itself a dense ruled
                group, so at stack spacing one piece's last row and the next piece's label read as
                one list. */}
            <div className='flex flex-col gap-5'>
              {pieces.map((piece) => {
                const rows = usagesByPiece.get(piece.lineKey) ?? [];
                return (
                  <PieceRecipeCard
                    key={piece.lineKey}
                    piece={piece}
                    shape={shapes?.get(pieceRefKey(piece.lineKey)) ?? null}
                    rows={rows}
                    bomItems={bomItems}
                    materials={materials}
                    sizeIds={sizeIds}
                    sizeNameById={sizeNameById}
                    canEdit={canEdit}
                    canAdd={canAddTo(PIECE_SECTIONS, rows)}
                    onAdd={() =>
                      addUsage(piece.lineKey, piece.name?.trim() || '', PIECE_SECTIONS, rows)
                    }
                    onChange={patchUsage}
                    onRemove={removeUsage}
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
        )}

        <CompositionBar {...derived} />

        {canEdit && staged && (
          <Text size='micro' variant='label'>
            {save.isPending ? 'saving…' : 'staged'} · included in the card’s Save
          </Text>
        )}
      </Section>

      <Section
        title={`${title} · на изделие`}
        question='ткани с нормой расхода на изделие; нитки, фурнитура, тесьма, декор, дублерин'
        action={
          canEdit ? (
            <Button
              type='button'
              variant='secondary'
              size='xs'
              disabled={!canAddTo(GARMENT_SECTIONS, garmentUsages)}
              onClick={() => addUsage('', '', GARMENT_SECTIONS, garmentUsages)}
            >
              + добавить материал на изделие
            </Button>
          ) : undefined
        }
      >
        {garmentUsages.length === 0 ? (
          <Row
            tone='label'
            label={
              <Text size='micro' variant='label' component='span'>
                материалы на изделие не назначены
              </Text>
            }
          />
        ) : (
          <div className='divide-y divide-hairline'>
            {garmentUsages.map(({ draft, index }) => (
              <SlotUsageRow
                key={`${usageKey(draft)}:${index}`}
                draft={draft}
                bomItems={bomItems}
                allowedSections={GARMENT_SECTIONS}
                usedKeys={garmentUsedKeys}
                materials={materials}
                markers={cwMarkers}
                cardMarkersAllColorways={allCardMarkers}
                recipeLinks={recipeLinks}
                colorwayId={colorwayId}
                sizeIds={sizeIds}
                sizeNameById={sizeNameById}
                canEdit={canEdit}
                onChange={(patch) => patchUsage(index, patch)}
                onRemove={() => removeUsage(index)}
              />
            ))}
          </div>
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
