import { parseDecimalNumber } from 'utils/decimal';
import { revealField } from 'utils/field-errors';
import type { common_Material } from 'api/proto-http/admin';
import { useMaterials } from 'components/managers/materials/components/useMaterials';
import {
  useSizeNames,
  useSizeOrdering,
} from 'components/managers/model/components/use-size-systems';
import { formatSizeName } from 'components/managers/product/utility/sizes';
import { formatTechCardDate } from 'components/managers/tech-cards/components/utils';
import {
  techCardKeys,
  useTechCard,
} from 'components/managers/tech-cards/components/useTechCardQuery';
import { useQueryClient } from '@tanstack/react-query';
import type { common_TechCard, common_TechCardPatternRevision } from 'api/proto-http/admin';
import { adminService } from 'api/api';
import type { PieceDTO } from 'lib/nesting/types';
import { fetchMediaBlob } from 'lib/features/media-blob';
import {
  INSUNITS_CODE,
  asciiDxfProblem,
  bytesToLatin1,
  drawingExtents,
  latin1ToBytes,
  unitsMissing,
  writeInsunits,
  type DxfLinearUnit,
} from 'lib/nesting/dxf/insunits';
import { notify, updateNotify, useSnackBarStore } from 'lib/stores/store';
import { sha256Hex } from 'lib/features/sha256';
import {
  interliningIdentityKey,
  matchInterliningImport,
  type InterliningImportMatch,
} from 'lib/fusing-dxf/interlining-import';
import { readInterliningSkips, writeInterliningSkips } from 'lib/fusing-dxf/interlining-skips';
import { GENERATED_FUSING_NAME_PREFIX } from 'lib/fusing-dxf/regenerate';
import { NestingWorkerClient } from 'lib/nesting/worker/client';
import {
  pieceShapeReferences,
  type NewAliasSeed,
  type NewPieceSeed,
  type ParsedSheetLite,
  type PieceShapeReference,
  type ReconcileScope,
} from 'lib/dxf-reconcile';
import type { NotifyInput } from 'lib/stores/store-types';
import {
  Suspense,
  lazy,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import { createPortal } from 'react-dom';
import { useSearchParams } from 'react-router-dom';
import { useFieldArray, useFormContext, useFormState, useWatch } from 'react-hook-form';
import {
  Button,
  Chip,
  Close,
  ConfirmationModal,
  GroupLabel,
  HeaderWarnings,
  type HeaderWarning,
  type HeaderWarningAction,
  Input,
  HeaderNote,
  Select,
  Tile,
  Tiles,
  Pill,
  Placeholder,
  Progress,
  Row,
  Text,
} from 'ui';
import {
  patternNameOfFile,
  uploadPatternFile,
} from 'components/managers/tech-card/patterns/pattern-upload-button';
import { cn } from 'lib/utility';
import {
  MAX_PATTERN_BYTES,
  MAX_PATTERN_NAME,
  clampPatternName,
  clampUtf8Bytes,
  formatBytes,
  isDxfFile,
  isDxfUrl,
  patternFileError,
  patternUploadErrorMessage,
} from 'utils/pattern';
import { ulid } from 'utils/ulid';
import {
  type FabricScope,
  type ScopeDirection,
  aliasInScope,
  bindingForScope,
  bindingScopes,
  blockKey,
  bomPurposeOrder,
  bomPurposeLabel,
  clothLines,
  defaultRoleForPurpose,
  fabricScopes,
  moveSheet,
  purposeEditorOptions,
  scopeImpact,
  scopeKeyOfBinding,
  scopeOfLine,
  type ArtifactKind,
  type BindingRow,
  strictestDirection,
  UNSET_PURPOSE,
} from './bom-purpose';
import {
  applyLineChange,
  bornBomLine,
  holdNames,
  releaseBomLineRefs,
  withoutGenerated,
  writeBindings,
} from './form-writers';
import { normBlock, sizeTokensOf, splitBlockSize, uniOf } from './nesting/block-code';
import { isFetchFailure } from './nesting/dxf-warnings';
import { defaultContourLayer, layerOptions } from './nesting/contour-layer';
import { useCardDxfPack } from './nesting/card-dxf-pack';
import { hydrateSeams, posesOf, rowsOf, useSeamsStore } from './assembly-seams/seams-store';
import { toWire, type TechCardSeamWire } from 'lib/seams';
import { dxfByScope, patternSheetName } from './nesting/dxf-by-scope';
import {
  applySizeMap,
  guessSizeMap,
  needsSizeDialog,
  planSizeMap,
  remapManifest,
  scanDxfSizes,
  type SizePick,
} from './nesting/dxf-size-plan';
import { DxfSizesDialog, UNSIZED, type SizesAsk } from './nesting/dxf-sizes-dialog';
import { DxfUnitsDialog, type UnitsItem } from './nesting/dxf-units-dialog';
import { SheetThumb, useDxfGeometry, useDxfIndex, type DxfIndex } from './nesting/dxf-geometry';
import { publishPatternSizeIndex, type PublishSizeIndexResult } from './pattern-size-index';
import { useUnsavedAreaSource } from './piece-areas';
import { serverKeyOfScope } from './piece-areas-state';
import { markerColorways, materialThicknessMm } from './nesting/colorway-widths';
import {
  splitPiecesBySize,
  useDictionarySizeTokens,
  useFileSizeRun,
} from './nesting/use-block-sizes';
import type { NestingFile } from './nesting/use-nesting';
import { PATTERN_IMPORT_ENABLED, buildCardContext } from './pattern-import/entry';
import { createCardApply } from './pattern-import/card-apply';
import type { ApplyDraftFn } from './pattern-import/client';
import type { LiveCard } from 'lib/pattern-import/fabrics/apply';
import {
  followUpPending,
  followUpTargets,
  initialRows,
  retryRows,
  type FollowUpStep,
} from 'lib/pattern-import/fabrics/followup';
import type { ConversionManifest } from 'lib/pattern-import/types';
import type { FollowUpJob } from './pattern-import/follow-up';
import { AutopilotPill } from './pattern-import/autopilot/view';
import { useTechCardAutosave } from './design/autosave-contract';
import { TechCardFormData } from './schema';
import { useUndoHistory } from './undo-history';
import { useAutoPieceAreas } from './use-auto-piece-areas';
import { useUniPrefill } from './use-uni-prefill';
import { drawingFromDxf } from 'lib/pattern-export/drawing';
import {
  PatternExportItems,
  PatternExportMenu,
  HistoryGlyph,
  ROW_ICON_BTN,
} from './pattern-export/export-menu';
import type { RollPrintSlot, RollPrintTarget } from './pattern-export/roll-print-dialog';
import {
  ddmm,
  removedSheets,
  SheetVersionsModal,
  sheetVersions,
  type RemovedSheet,
  type SheetVersion,
} from './sheet-versions';
import { useTechCardStaging } from './useTechCardStaging';
import {
  RECONCILE_PARSE,
  externalPieceRefs,
  inheritedCut,
  seamAnchorKeys,
  sheetRowId,
  markJumpParams,
  planForeignReplacement,
  planOccupiedFiles,
  reuploadSheet,
  uploadForeignSheet,
  type ForeignReuploadOutcome,
  type OccupiedChoice,
  type ReuploadDeps,
  type ReuploadDeletePlan,
  type ReuploadOutcome,
  type ReuploadRefusal,
  type SheetPatch,
} from './nesting/dxf-reupload';
import { planSheetDelete } from './nesting/dxf-delete';
import {
  armDeleteSnapshot,
  armReuploadSnapshot,
  armSeamDeleteRetry,
  consumeSeamDeleteRetry,
  noteSheetRestore,
  peekSeamDeleteRetry,
  provideSheetRestorer,
  restoreSheetVersion,
  swapSheetFile,
  type RestoreOutcome,
  type SheetRevisionRef,
} from './nesting/reupload-session';
import { PatternDropZone } from './pattern-drop-zone';
import {
  getFusingSheetGenerationState,
  subscribeFusingSheetGeneration,
} from './nesting/fusing-sheets-stage';
import type { PieceMatchApplyResult } from './nesting/piece-match-modal';

// The whole nesting feature (modal + worker + dxf/clipper deps) lives in a lazy chunk —
// nothing loads until someone actually opens a раскладка.
const NestingModal = lazy(() =>
  import('./nesting/nesting-modal').then((m) => ({ default: m.NestingModal })),
);
// Same lazy neighbourhood: the matching dialog parses DXF through the same worker.
const PieceMatchModal = lazy(() =>
  import('./nesting/piece-match-modal').then((m) => ({ default: m.PieceMatchModal })),
);
// Склейка по-размерных выгрузок — оттуда же: она разбирает файлы тем же воркером и показывает
// результат тем же листом, что и просмотр.
const MergeSizesModal = lazy(() =>
  import('./nesting/merge-sizes-modal').then((m) => ({ default: m.MergeSizesModal })),
);
// Импорт выкройки любого формата (F13) — свой ленивый чанк: мастер с воркером и фикстурой не
// грузится, пока его не открыли.
const ImportWizard = lazy(() =>
  import('./pattern-import/import-wizard').then((m) => ({ default: m.ImportWizard })),
);
// Замер площадей + индекс размеров сразу после импорта (MF-C): тот же ленивый чанк разбора.
const ImportFollowUpRunner = lazy(() =>
  import('./pattern-import/follow-up').then((m) => ({ default: m.ImportFollowUpRunner })),
);

/** «converted» badge tooltip: what the importer wrote into the sheet (MF-C, M10). */
function convertedTitle(m: ConversionManifest): string {
  const src =
    (m.source?.files ?? [])
      .map((f) => f.name)
      .filter(Boolean)
      .join(', ') || 'unknown source';
  const at = formatTechCardDate(m.createdAt);
  const gate = !m.gate
    ? 'no gate report'
    : m.gate.passed
      ? `gate passed${m.gate.checks.some((c) => !c.ok) ? ' with warnings' : ''}`
      : `gate blocked (${m.gate.checks.filter((c) => !c.ok && c.severity === 'block').length})`;
  return `converted by the pattern importer from ${src}${at !== '—' ? ` on ${at}` : ''} · ${gate} · layer ${m.layers.cut} is the final cut line, sizes and pieces come from the file's manifest`;
}

// Секции BOM, к которым МОЖНО привязать выкройку. Это ровно те же четыре «рулонные» семьи,
// что стор гросс-апит вейстеджем и что кладёт маркер (rollGoodsSections): подклад, бортовку и
// утеплитель тоже кроят из полотна по лекалу.
// Map, not a plain object: an object literal answers for 'constructor' and 'toString' too, so
// `ROLE[section]` used as a membership test would let those through as truthy inherited functions.
// Unreachable with today's proto enum, but the shape should not depend on that.
const ROLE_OF_SECTION = new Map<string, string>([
  ['TECH_CARD_BOM_SECTION_FABRIC', 'main fabric'],
  ['TECH_CARD_BOM_SECTION_LINING', 'lining'],
  ['TECH_CARD_BOM_SECTION_INTERLINING', 'interlining'],
  ['TECH_CARD_BOM_SECTION_INSULATION', 'insulation'],
]);
const SECTION_ORDER = [...ROLE_OF_SECTION.keys()];

// Плитка полки без ключа скоупа (наследие в PDF): она не материал, но выбирается тем же кликом.
// Префикс с двумя подчёркиваниями — ключ скоупа так выглядеть не может (это либо enum назначения,
// либо ULID строки BOM, либо пустая строка), так что коллизия невозможна по построению.
const PDF_KEY = '__pdf';

// A sheet row dragged onto a material tile (not a file from the desktop): its row id rides here.
const SHEET_DRAG = 'application/x-grbpwr-sheet';
const isSheetDrag = (e: React.DragEvent) =>
  Array.from(e.dataTransfer.types ?? []).includes(SHEET_DRAG);

// What a slot takes: DXF uploads directly, everything else goes through the import wizard
// (its files step accepts the same list, pattern-import/steps/files.tsx).
const SLOT_ACCEPT_DXF = '.dxf,image/vnd.dxf';
const SLOT_ACCEPT_ALL = `${SLOT_ACCEPT_DXF},.pdf,.plt,.hpgl,.hpg,.svg,.ai,.eps,.png,.jpg,.jpeg,.tif,.tiff`;
const IMPORT_EXT = new Set(SLOT_ACCEPT_ALL.split(',').filter((x) => x.startsWith('.')));

// The parser's warning for a sheet without $INSUNITS (lib/nesting/worker/parse-files.ts):
// `${sheet name}: units are not set in the file — mm assumed`. Turned into the `set units` door.
const UNITS_GUESS = ': units are not set in the file — ';

/** A DXF's bytes with $INSUNITS written, as a File of the same name. */
function fileWithUnits(text: string, unit: DxfLinearUnit, name: string, type = ''): File {
  return new File([latin1ToBytes(writeInsunits(text, INSUNITS_CODE[unit])) as BlobPart], name, {
    type,
  });
}

/** ASCII DXF text when the file declares no usable units; null otherwise (binary, set, not DXF). */
async function unitlessText(blob: Blob): Promise<string | null> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  if (asciiDxfProblem(bytes)) return null;
  const text = bytesToLatin1(bytes);
  return unitsMissing(text) ? text : null;
}

/** Every message in a react-hook-form error subtree (skips the DOM `ref`). */
function messagesOf(e: unknown): string[] {
  if (!e || typeof e !== 'object') return [];
  const own = (e as { message?: unknown }).message;
  return [
    ...(typeof own === 'string' && own ? [own] : []),
    ...Object.entries(e)
      .filter(([k]) => k !== 'ref' && k !== 'message' && k !== 'type' && k !== 'types')
      .flatMap(([, v]) => messagesOf(v)),
  ];
}

/** English count noun: 1 sheet, 2 sheets. */
/** A file of one pick that did not make it: refused before upload, or failed on the way. */
type FileFault = { name: string; why: string };

/**
 * One notification per pick of files. Nothing when all landed (the rows appear), unless a `job`
 * was already up: that one settles in place.
 */
function settleFileBatch(
  job: string | null,
  total: number,
  faults: FileFault[],
  verb = 'uploaded',
  badWord = 'failed',
) {
  const n = faults.length;
  const detail = faults.map((f) => `${f.name}: ${f.why}`).join(' · ');
  let input: NotifyInput | null = null;
  if (n === 0) input = job ? { sev: 'ok', subject: 'PATTERNS', text: `${verb} ${total}` } : null;
  else if (n >= total)
    input = {
      sev: 'error',
      subject: 'PATTERNS',
      text: `not ${verb}`,
      bad: n === 1 ? faults[0].why : `${n} ${badWord}`,
      detail,
    };
  else
    input = {
      sev: 'warn',
      subject: 'PATTERNS',
      text: `${verb} ${total - n} of ${total}`,
      bad: `${n} ${badWord}`,
      detail,
    };
  if (!input) return;
  if (job) updateNotify(job, { ...input, progress: undefined });
  else notify(input);
}

function plural(n: number, one: string, many = `${one}s`): string {
  return n === 1 ? one : many;
}

/** Сколько РАЗНЫХ деталей чертежа лежит в этом скоупе — счёт по идентичностям, не по контурам. */
function countBlocks(index: DxfIndex, scopeKey: string): number {
  let n = 0;
  for (const key of index.byKey.keys()) if (key.startsWith(`${scopeKey}|`)) n += 1;
  return n;
}

type PatternRow = {
  sizeId?: number;
  url?: string;
  filename?: string;
  name?: string;
  sizeBytes?: number;
  version?: number;
  uploadedAt?: string;
  lineKey?: string;
  bomLineKey?: string;
  // НАЗНАЧЕНИЕ this sheet is cut from (0267). Resolved BEFORE bomLineKey everywhere — see
  // bom-purpose.ts for why both exist and why neither may be read alone.
  fabricPurpose?: string;
  // sha256 of the file (0423): a re-upload of the same file is a noop.
  sha256?: string;
};
type Entry = { row: PatternRow; index: number };

/** The current DXF row with the newest revision in one material slot. */
function latestDxfEntry(list: readonly Entry[]): Entry | undefined {
  return list.reduce<Entry | undefined>((latest, entry) => {
    if (!entry.row.url || !isDxfUrl(entry.row.url)) return latest;
    if (!latest) return entry;
    const revision = Number(entry.row.version ?? 0);
    const latestRevision = Number(latest.row.version ?? 0);
    return revision > latestRevision || (revision === latestRevision && entry.index > latest.index)
      ? entry
      : latest;
  }, undefined);
}

type ReuploadFlight = { rowId: string; version: number };
type ReuploadFeedback =
  | { kind: 'noop'; version?: number; uploadedAt?: string }
  | {
      kind: 'applied';
      version: number;
      uploadedAt: string;
      added: number;
      reshaped: number;
      removed: number;
      marked: number;
    };

type PieceSaveFeedback = {
  materialScopeKey: string;
  interliningLineKeys: string[];
  baselineSavedAt?: number;
  generationBaselineRun: number;
  save: { phase: 'saving' | 'saved' | 'error' | 'hidden'; at?: number; fading?: boolean };
  generation: {
    phase: 'generating' | 'generated' | 'error' | 'hidden';
    at?: number;
    fading?: boolean;
  };
};

type SlotState = { label: string; tone: 'attention' | 'ok' | 'warn'; fading?: boolean };

function slotTime(at: number): string {
  return new Date(at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

function SlotStateOverlay({ state }: { state: SlotState | null }) {
  if (!state) return null;
  return (
    <span
      role='status'
      className={cn(
        'pointer-events-none absolute right-1.5 top-1.5 z-10 inline-flex transition-opacity duration-200 ease-out motion-reduce:transition-none',
        state.fading && 'opacity-0',
      )}
    >
      <Pill tone={state.tone} className='min-h-[22px] bg-bgColor py-0.5 text-nano'>
        {state.label}
      </Pill>
    </span>
  );
}

// Rows of the card as the DXF re-upload reads and writes them (nesting/dxf-reupload.ts).
type FormPiece = NonNullable<TechCardFormData['pieces']>[number] & {
  lineKey: string;
  name: string;
};
type FormAlias = NonNullable<TechCardFormData['pieceDxfAliases']>[number];
type FormOp = NonNullable<TechCardFormData['operations']>[number];
type OccupiedAsk =
  | { kind: 'files'; scopeKey: string; files: File[]; target: string }
  | { kind: 'move'; scopeKey: string; rowId: string }
  | { kind: 'purpose'; scopeKey: string; nextPurpose: string };
type OccupiedVersion = { current?: PatternRow; incomingNames: string[] };
type ForeignPending = {
  scopeKey: string;
  picked: File;
  outcome: ForeignReuploadOutcome<FormPiece, FormAlias, FormOp>;
  current: () => boolean;
  upload: ReuploadDeps<FormPiece, FormAlias, FormOp>['upload'];
};

// A refused re-upload keeps the old sheet and says why in 1–2 words.
const REFUSAL_WORDS: Record<ReuploadRefusal, string> = {
  file: 'unreadable file',
  download: 'download failed',
  parse: 'unreadable file',
  sweep: 'not applied',
  upload: 'upload failed',
  target: 'pick a sheet',
};

// Подпись набора листов — по url, а не по материалу: перезалили файл, и подпись сменилась сама,
// вместо того чтобы отвечать про файл, которого уже нет. Модульная функция, потому что её читают
// и мемо, и эффект публикации.
const sigOf = (list: Entry[]) => list.map((e) => e.row.url ?? '').join('|');

// Одна рулонная строка BOM, как её видит панель выкроек: идентичность, роль по секции, назначение
// (0267) и read-only обогащение 0259, из которого раскладка берёт полезную ширину.
type FabricLine = {
  id: number;
  lineKey: string;
  name: string;
  section: string;
  purpose: string;
  role: string;
  unit: string;
  fabricWidth: string;
  wastagePercent: string;
  effectiveFabricWidthCm: string;
  selvedgeCm: string;
  fabricDirection: string;
  isSample: boolean;
  order: number;
};

type BomLine = NonNullable<TechCardFormData['bomItems']>[number];

// What the operator calls the sheet — the display name when given, else the filename.
function labelOf(row?: PatternRow): string {
  return row?.name || row?.filename || '(unnamed)';
}

function fileNameOf(row?: PatternRow): string {
  if (row?.filename) return row.filename;
  const name = patternSheetName(row ?? {});
  return isDxfUrl(name) ? name : `${name}.dxf`;
}

const isGeneratedFusingRow = (row: PatternRow): boolean =>
  (row.name ?? '').startsWith(GENERATED_FUSING_NAME_PREFIX);

const filenameStem = (name: string) => name.replace(/\.[^./\\]+$/, '');

/** Follow a changed filename until the operator gives the row a distinct display name. */
function followedName(row: PatternRow, nextFilename: string): string | null {
  const name = row.name ?? '';
  const filename = row.filename ?? '';
  if (!name) return null;
  if (name === filename) return nextFilename;
  if (name === filenameStem(filename)) return filenameStem(nextFilename);
  return null;
}

const feedbackKey = (row: PatternRow, nextUrl = row.url ?? '') => row.lineKey || nextUrl;

// Rev.N of this sheet, straight off the row — the server numbers a url it has not seen on this
// card and preserves the number for one it has. 0 is not revision zero, it is a row that was
// never numbered (a legacy upload), so it claims no revision rather than printing "v0".
function revisionOf(row: PatternRow): number | null {
  return row.version && row.version > 0 ? row.version : null;
}

// Сколько размеров карточки НЕТ в файлах материала — читается из самих файлов, САМА.
//
// Сервер про содержимое DXF не знает ничего: у строки выкройки есть url, размер-артефакт и
// привязка к материалу, и всё. Значит единственный способ ответить «какого размера в файле нет»
// — скачать и разобрать.
//
// Раньше это стояло за кнопкой («⌕ разобрать файлы»), потому что стоит скачивания с CDN. Кнопка
// убрана: разбор — не отдельное действие оператора, а условие, при котором вкладка вообще
// отвечает на свои вопросы (какие размеры в файлах, что за детали в них лежат, есть ли форма у
// детали кроя). Пока её не нажали, вкладка показывала «размеры не проверялись» и пустые плитки —
// то есть не показывала ничего. Плата за скачивание никуда не делась, поэтому она привязана к
// ОТКРЫТОЙ вкладке (`active`), а не к монтированию: вкладки карточки смонтированы все сразу и
// прячутся через `hidden`, так что разбор «на маунте» качал бы десятки мегабайт всякому, кто
// открыл карточку править BOM.
//
// Разбор идёт ЧЕРЕЗ ТОТ ЖЕ воркер, что и раскладка, и через тот же КЭШ (dxf-geometry): пачка
// ключуется содержимым, поэтому панель деталей кроя, собирающая ту же пачку, получает геометрию
// бесплатно. Дешёвый скан имён блоков на главном потоке написать легко, но это была бы вторая
// реализация того же правила, и в день, когда они разойдутся, панель будет уверенно врать —
// ровно тот класс ошибки, из-за которого этот текст вообще пишется.

type SizeAudit =
  | { phase: 'loading' }
  | { phase: 'error'; message: string }
  // Хранится РОВНО ТО, ЧТО СКАЗАЛИ ФАЙЛЫ, — набор найденных размерных токенов. Нехватка выводится
  // при отрисовке, потому что она зависит ещё и от размерного ряда карточки, а ряд правится на
  // этой же вкладке. Сохранённый ответ «все размеры на месте» пережил бы добавление XXL и
  // продолжал бы утверждать своё — то есть ровно ту ложь, ради устранения которой заменён счётчик
  // покрытия. Так несостоятельное состояние просто непредставимо.
  //
  // graded=false — в именах блоков размеров нет вовсе (не градуированный файл). Это НЕ «нет всех
  // размеров»: сказать так значило бы повторить ошибку счётчика с другой стороны.
  //
  // `uniOnly` — ВСЕ блоки скоупа помечены токеном UNI, то есть автор ЗАЯВИЛ, что эти детали не
  // градуируются. Пустой набор размеров у такого скоупа — ответ, а не пробел, и полоса покрытия
  // обязана говорить о нём другими словами. Признак берётся из имён блоков: ручная галка на
  // детали сюда не доезжает и врать «UNI» вместо неё нельзя.
  | { phase: 'ready'; found: Set<string>; uniOnly: boolean };

// Выкройки карточки (§2) — DXF, разложенные ПО МАТЕРИАЛАМ.
//
// Раньше панель рисовала плитку на каждый размер ряда и писала «N of M sizes have a pattern».
// Градуированный DXF несёт ВЕСЬ ряд в одном файле — размер записан в именах блоков, выбирается
// внутри просмотрщика и раскладки, а недостающие размеры карточка добирает из файла сама, — так
// что этот счётчик не просто лишний: он ВРЁТ. Один файл на пять размеров читался как «1 из 5».
//
// Организация теперь по материалу, потому что различает файлы именно материал: основная ткань,
// подкладка, бортовка, утеплитель — разные чертежи, и на один материал их может быть несколько
// (основная ткань и карманка — две строки BOM). Дыр, которые панель обязана показать, тоже две:
// материал без DXF и размер карточки, которого в файлах не нашлось.
//
// Строка размера в БД никуда не делась (tech_card_size_pattern.size_id NOT NULL), но это теперь
// артефакт хранения — см. storageSizeId.
const RollPrintDialog = lazy(() =>
  import('./pattern-export/roll-print-dialog').then((m) => ({ default: m.RollPrintDialog })),
);

// Double-click on the name renames; a single click still opens the pieces — after the
// double-click window, so a rename never flashes the viewer open first.
const DBL_MS = 250;

export function PatternsField({
  techCardId,
  saveSessionId,
  active,
  canEdit = true,
  canPublishIndex = true,
  savedSizeIds,
  headerEl,
}: {
  techCardId?: number;
  saveSessionId?: string;
  // The block header's action slot: counts and warnings are portalled there.
  headerEl?: HTMLElement | null;
  // Вкладка PATTERNS открыта. Без явного ответа обойтись нельзя: карточка монтирует ВСЕ вкладки
  // сразу и прячет их через `hidden`, поэтому «смонтированы» и «на экране» — разные вещи, а
  // разбор стоит скачивания всех DXF карточки. Обязательный проп, а не умолчание: молчаливое
  // `true` у следующего места монтирования означало бы тихие десятки мегабайт.
  active: boolean;
  // Gates «сохранить раскладку» (RBAC write + not released), mirroring MarkersSection.
  canEdit?: boolean;
  // Gates the Ф6.3 size-index publish, and it is DELIBERATELY NOT `canEdit`.
  //
  // Права — да: разбор с этой фазы ПИШЕТ на сервер, и читателю нельзя писать от чужого имени
  // (сервер эту роль не проверяет — RPC админский).
  //
  // Заморозка — НЕТ: замороженная карточка это ровно та, с которой запускают производство, и
  // запретить публикацию на ней значило бы навсегда оставить `sizes_in_dxf` в «не проверялось»
  // именно там, где гейт готовности и работает. Индекс описывает ФАЙЛЫ, а они на релизе не
  // меняются, так что запись ничего в снимке не сдвигает.
  canPublishIndex?: boolean;
  // Server-known size range: a form-added size cannot take a marker until the card saves.
  savedSizeIds?: number[];
}) {
  const { control, setValue, getValues, register, setFocus } = useFormContext<TechCardFormData>();
  const writeDirty = (path: string, value: unknown) =>
    setValue(path as Parameters<typeof setValue>[0], value as never, { shouldDirty: true });
  const [params, setParams] = useSearchParams();
  // The import wizard's apply ends in the card's own save (F7): the page has no save button.
  const autosave = useTechCardAutosave();
  const undoHistory = useUndoHistory();
  const subscribeGeneration = useCallback(
    (listener: () => void) => subscribeFusingSheetGeneration(techCardId, listener),
    [techCardId],
  );
  const readGeneration = useCallback(() => getFusingSheetGenerationState(techCardId), [techCardId]);
  const generationState = useSyncExternalStore(subscribeGeneration, readGeneration, readGeneration);
  const [pieceSaveFeedback, setPieceSaveFeedback] = useState<PieceSaveFeedback | null>(null);
  const { fields, append, remove } = useFieldArray({ control, name: 'patterns' });
  const sizeIds = (useWatch({ control, name: 'sizeIds' }) ?? []) as number[];
  const baseSampleSizeId = Number(useWatch({ control, name: 'baseSampleSizeId' }) ?? 0);
  // Live row values. `fields` is a snapshot that array actions refresh but setValue on a
  // nested path does NOT — rename writes via setValue (a useFieldArray.update would replace
  // the row and revert any sibling Controller-written field), so display must read live.
  const liveRows = (useWatch({ control, name: 'patterns' }) ?? []) as PatternRow[];
  // A save's form.reset() overwrites concurrent edits and un-dirties them — freeze renames
  // for its duration.
  const { isSubmitting, errors } = useFormState({ control });
  // Осмысленные имена экспортов раскладки: SEASON-STYLE-размер-…
  const season = (useWatch({ control, name: 'season' }) ?? '') as string;
  // Детали кроя карточки — мастеру импорта, чтобы ИИ не привязал имя к чужой детали (Codex C10).
  const cardPieces = (useWatch({ control, name: 'pieces' }) ?? []) as NonNullable<
    TechCardFormData['pieces']
  >;
  const styleNumber = (useWatch({ control, name: 'styleNumber' }) ?? '') as string;
  // Эталон припуска карточки — в предзаполнение раскладки, тем же порядком, что у планировщика.
  const cardSeamRaw = (useWatch({ control, name: 'requiredSeamAllowanceMm' }) ?? '') as string;
  const cardSeamAllowanceMm = (() => {
    const n = parseDecimalNumber(cardSeamRaw);
    return Number.isFinite(n) ? n : null;
  })();
  const cardName = (useWatch({ control, name: 'name' }) ?? '') as string;

  useEffect(() => {
    setPieceSaveFeedback((current) => {
      if (!current || current.save.phase === 'hidden' || current.save.phase === 'saved')
        return current;
      const saved =
        autosave.lastSavedAt != null && autosave.lastSavedAt !== current.baselineSavedAt;
      if ((autosave.status === 'saved' || autosave.status === 'idle') && saved) {
        return { ...current, save: { phase: 'saved', at: autosave.lastSavedAt } };
      }
      if (current.save.phase === 'error') return current;
      if (
        autosave.status === 'invalid' ||
        autosave.status === 'needs-confirm' ||
        autosave.status === 'conflict' ||
        autosave.status === 'error' ||
        autosave.status === 'off'
      ) {
        return { ...current, save: { phase: 'error' } };
      }
      if (autosave.status === 'dirty' || autosave.status === 'saving') {
        return { ...current, save: { phase: 'saving' } };
      }
      return current;
    });
  }, [autosave.lastSavedAt, autosave.status]);

  useEffect(() => {
    setPieceSaveFeedback((current) => {
      if (!current || generationState.run <= current.generationBaselineRun) return current;
      if (generationState.phase === 'generated') {
        return {
          ...current,
          generation: { phase: 'generated', at: generationState.at },
        };
      }
      if (generationState.phase === 'error') {
        return { ...current, generation: { phase: 'error' } };
      }
      if (
        generationState.phase === 'generating' &&
        current.generation.phase !== 'error' &&
        current.generation.phase !== 'hidden'
      ) {
        return { ...current, generation: { phase: 'generating' } };
      }
      return current;
    });
  }, [generationState]);

  useEffect(() => {
    if (pieceSaveFeedback?.save.phase !== 'saved') return;
    const at = pieceSaveFeedback.save.at;
    const fadeTimer = window.setTimeout(
      () =>
        setPieceSaveFeedback((current) =>
          current?.save.phase === 'saved' && current.save.at === at
            ? { ...current, save: { ...current.save, fading: true } }
            : current,
        ),
      3_800,
    );
    const hideTimer = window.setTimeout(
      () =>
        setPieceSaveFeedback((current) =>
          current?.save.phase === 'saved' && current.save.at === at
            ? { ...current, save: { phase: 'hidden' } }
            : current,
        ),
      4_000,
    );
    return () => {
      window.clearTimeout(fadeTimer);
      window.clearTimeout(hideTimer);
    };
  }, [pieceSaveFeedback?.save.at, pieceSaveFeedback?.save.phase]);

  useEffect(() => {
    if (pieceSaveFeedback?.generation.phase !== 'generated') return;
    const at = pieceSaveFeedback.generation.at;
    const fadeTimer = window.setTimeout(
      () =>
        setPieceSaveFeedback((current) =>
          current?.generation.phase === 'generated' && current.generation.at === at
            ? { ...current, generation: { ...current.generation, fading: true } }
            : current,
        ),
      3_800,
    );
    const hideTimer = window.setTimeout(
      () =>
        setPieceSaveFeedback((current) =>
          current?.generation.phase === 'generated' && current.generation.at === at
            ? { ...current, generation: { phase: 'hidden' } }
            : current,
        ),
      4_000,
    );
    return () => {
      window.clearTimeout(fadeTimer);
      window.clearTimeout(hideTimer);
    };
  }, [pieceSaveFeedback?.generation.at, pieceSaveFeedback?.generation.phase]);

  useEffect(() => {
    if (
      pieceSaveFeedback?.save.phase === 'hidden' &&
      pieceSaveFeedback.generation.phase === 'hidden'
    ) {
      setPieceSaveFeedback(null);
    }
  }, [pieceSaveFeedback]);

  const sizeById = useSizeNames();
  const preferredShapeSizeTokens = useMemo(
    () => sizeTokensOf(sizeById.get(baseSampleSizeId)),
    [sizeById, baseSampleSizeId],
  );
  const orderSizes = useSizeOrdering();
  const dictTokens = useDictionarySizeTokens();
  const fileSizeRun = useFileSizeRun();

  // Колорвеи карточки с шириной их ПИНОВ по каждому слоту — раскладка меряется на конкретном
  // артикуле, а называет его колорвей. Читается с сервера: рецепт пишется отдельным RPC
  // (UpdateColorwayRecipe), в форме карточки пинов нет. includeArchived — чтобы строка,
  // ссылающаяся на архивный артикул, всё равно разрешилась в ширину, а не молча упала на дефолт.
  // `dataUpdatedAt` — отметка ПОСЛЕДНЕГО чтения карточки, и она здесь не для отображения:
  // публикация индекса размеров идёт теперь сама, один раз на набор (см. эффект ниже), а самая
  // частая причина её отказа — «на сервере другой набор листов», то есть карточку ещё не
  // сохранили. Сейв инвалидирует этот запрос, отметка меняется — и попытка повторяется ровно
  // один раз, без кнопки «ещё раз» и без цикла на каждый рендер формы.
  const { data: cardRead, dataUpdatedAt: cardReadAt } = useTechCard(techCardId);
  const queryClient = useQueryClient();
  const autosaveRef = useRef(autosave);
  autosaveRef.current = autosave;
  const retryingSeamDeletes = useRef(false);
  const retrySeamDeletesRef = useRef<() => Promise<void>>(async () => {});
  const lastSeamRetrySave = useRef({ cardId: techCardId, at: autosave.lastSavedAt });
  retrySeamDeletesRef.current = async () => {
    if (!techCardId || retryingSeamDeletes.current) return;
    const seamKeys = peekSeamDeleteRetry(techCardId);
    if (!seamKeys.length) return;
    retryingSeamDeletes.current = true;
    try {
      await deleteSeamsOnServer(techCardId, seamKeys);
    } finally {
      retryingSeamDeletes.current = false;
    }
  };
  useEffect(() => {
    const seen = lastSeamRetrySave.current;
    if (seen.cardId !== techCardId) {
      lastSeamRetrySave.current = { cardId: techCardId, at: autosave.lastSavedAt };
      return;
    }
    if (seen.at === autosave.lastSavedAt) return;
    seen.at = autosave.lastSavedAt;
    if (autosave.lastSavedAt != null) void retrySeamDeletesRef.current();
  }, [autosave.lastSavedAt, techCardId]);
  // Superseded files of each sheet (TechCardSizePattern.history, output-only), by row lineKey.
  const historyByLine = useMemo(() => {
    const m = new Map<string, common_TechCardPatternRevision[]>();
    for (const p of cardRead?.techCard?.patterns ?? [])
      if (p.lineKey && p.history?.length) m.set(p.lineKey, p.history);
    return m;
  }, [cardRead]);
  // History button of a sheet row: the lineKey or legacy url whose versions are open.
  const [versionsOf, setVersionsOf] = useState<string | null>(null);
  // Deleted sheets (TechCard.removedPatternHistory), one muted row each under their slot.
  const removed = useMemo(() => removedSheets(cardRead?.removedPatternHistory), [cardRead]);
  // «⋯» of a removed row: its key; `restore` of a removed row in flight.
  const [removedOf, setRemovedOf] = useState<string | null>(null);
  const [restoringRemoved, setRestoringRemoved] = useState<string | null>(null);
  const { data: materialsData } = useMaterials('', true, !!techCardId);
  const materialById = useMemo(() => {
    const byId = new Map<number, common_Material>();
    for (const m of materialsData?.materials ?? []) {
      const id = Number(m.id ?? 0);
      if (id) byId.set(id, m);
    }
    return byId;
  }, [materialsData?.materials]);
  const colorwayOptions = useMemo(
    () => markerColorways(cardRead, materialById),
    [cardRead?.techCard, materialById],
  );

  // Материал, над которым сейчас висит перетаскиваемый файл ('' = ничей).
  const [dragKey, setDragKey] = useState<string | null>(null);
  // A file dragged over one sheet row (its sheetRowId): that row outlines, its thumb says the next v.
  const [dragRow, setDragRow] = useState<string | null>(null);
  // Several DXFs dropped on one slot: the size merge, then a direct upload into that slot.
  const [merging, setMerging] = useState<{
    scopeKey: string;
    files: File[];
    target?: string;
    afterReady?: () => Promise<void> | void;
  } | null>(null);
  // Non-DXF files dropped on a slot: the import wizard, starting from those files.
  const [importing, setImporting] = useState<{ scopeKey: string; files: File[] } | null>(null);
  // Direct uploads in flight, per slot.
  const [uploading, setUploading] = useState<Record<string, number>>({});
  const uploadingRef = useRef<Record<string, number>>({});
  // A replacement keeps the old drawing mounted while its new revision is parsed and uploaded.
  const [reuploading, setReuploading] = useState<Record<string, ReuploadFlight>>({});
  // The last replacement result is visit-local: the server remains the persisted revision source.
  const [reuploadFeedback, setReuploadFeedback] = useState<Record<string, ReuploadFeedback>>({});
  // Every operation that would put a second active row in a slot stops at the same choice.
  const [occupiedAsk, setOccupiedAsk] = useState<OccupiedAsk | null>(null);
  const occupiedCancelRef = useRef<HTMLButtonElement>(null);
  // Open the pieces viewer of this slot as soon as the form holds these sheet urls.
  const [pendingView, setPendingView] = useState<{ scopeKey: string; urls: string[] } | null>(null);
  // A re-upload changed the slot's geometry: piece areas are measured on the next save even while
  // another tab is open (latched for the session).
  const [areasArmed, setAreasArmed] = useState(false);
  // The hidden picker and the slot it was opened for.
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pickFor = useRef('');
  const pickDxfOnly = useRef(false);
  // Legacy PDF sheet open in the in-app viewer (null = closed). DXF names open the pieces viewer.
  const [viewing, setViewing] = useState<PatternRow | null>(null);
  // Units dialog: DXFs without $INSUNITS, and what confirm does with the picked units.
  const [unitsAsk, setUnitsAsk] = useState<{
    items: UnitsItem[];
    confirm: (units: Record<string, DxfLinearUnit>) => Promise<void> | void;
    cancel: () => void;
  } | null>(null);
  const [unitsBusy, setUnitsBusy] = useState(false);
  // Sizes dialog: a DXF whose sizes the card cannot read, and what confirm does with the mapping.
  const [sizesAsk, setSizesAsk] = useState<{
    ask: SizesAsk;
    confirm: (picks: Record<string, SizePick>) => void;
    cancel: () => void;
  } | null>(null);
  // Downloading the unitless sheets before the dialog can show their size.
  const [unitsFetching, setUnitsFetching] = useState(false);
  // Inline rename in progress: which row and the draft value.
  const [editing, setEditing] = useState<{ index: number; value: string } | null>(null);
  // × on a sheet row: always asked; a DXF cascade carries its counts (L6b).
  const [deleting, setDeleting] = useState<{
    rowId: string;
    name: string;
    counts: { pieces: number; steps: number } | null;
  } | null>(null);
  // `for print` of a DXF row: the roll print dialog's file.
  const [printing, setPrinting] = useState<RollPrintTarget | null>(null);
  // The single click on a name waits out the double-click window.
  const nameClick = useRef<number | null>(null);
  // Разбор включён. ЛАТЧ, а не зеркало `active`: уход на соседнюю вкладку не имеет права отменить
  // уже идущее скачивание (React Query бросил бы запрос на полпути и следующий заход начал бы его
  // заново), а вернувшись, оператор должен увидеть готовый ответ, а не второй разбор.
  const [armed, setArmed] = useState(active);
  useEffect(() => {
    if (active) setArmed(true);
  }, [active]);
  // Выбранная плитка полки: ключ скоупа или PDF_KEY. null = экран ещё не трогали, и
  // выбор выводится из данных (первый материал с файлами, иначе первый вообще).
  const [pickedKey, setPickedKey] = useState<string | null>(null);
  // Подтверждение удаления живёт в самой плитке; ключ скоупа не зависит от позиции плитки.
  const [confirmScopeKey, setConfirmScopeKey] = useState<string | null>(null);
  // Разовое намерение фокуса переживает рендер, на котором новая строка входит в useWatch.
  const pendingSlotFocus = useRef<string | null>(null);
  // Отказ публикации индекса размеров, по подписи набора листов. Только отказ: публикация идёт
  // фоном, и рассказывать про удавшуюся запись, которую никто не заказывал, — это отчёт о работе,
  // о которой не спрашивали. А вот «карточку надо сохранить» — руководство к действию.
  const [indexFailures, setIndexFailures] = useState<Record<string, string>>({});
  // Замер площадей и индекс размеров после импорта (MF-C, M3): работа живёт здесь, а не в мастере —
  // она переживает его закрытие и показывает отказ строкой под шапкой с повтором.
  const [followUp, setFollowUp] = useState<FollowUpJob | null>(null);
  // Раскладка modal: the DXF files of one fabric, pooled (null = closed).
  const [nesting, setNesting] = useState<{
    sizeId: number;
    files: NestingFile[];
    fabricDirection: ScopeDirection;
    // The concrete BOM LINE these sheets lay out on, which is a DIFFERENT question from what the
    // panel groups by. A раскладка measures cloth: its width and кромка come off the article the
    // colourway pins to ONE line, so a class («основной материал») does not determine it. Filled
    // only when the scope owns exactly one line; '' otherwise — for a назначение spanning two
    // articles, and for legacy unbound DXFs, the modal asks, exactly as it already did.
    bomLineKey: string;
    // Сопоставление «блок → деталь кроя» ЭТОГО скоупа, снятое на момент открытия. Снимок, а не
    // живая подписка: пока раскладка открыта, карточку под ней не редактируют (модалка накрывает
    // экран целиком), а скоуп раскладки — это скоуп ЛИСТОВ, и он от выбора слота в диалоге
    // сохранения не зависит: слот решает, на какую строку BOM ляжет длина, а не какой деталью
    // кроя является блок.
    aliases: Array<{ blockName?: string; pieceLineKey?: string }>;
    // Opened by the colourways deep link (`&auto=1`): the modal presses «run» once by itself.
    autoRun?: boolean;
    // The colourway the deep link came from (`markerColorway`): preselected, so the width is ITS
    // pinned article's, not the BOM line's. 0/absent = the shared marker.
    colorwayId?: number;
  } | null>(null);
  // «сопоставить детали»: the same DXF set, opened against the cut-piece list instead of the
  // nesting engine (null = closed).
  const [matching, setMatching] = useState<{
    scope: FabricScope<FabricLine>;
    fabricName: string;
    files: NestingFile[];
    replacement?: {
      scopeKey: string;
      rowId: string;
      replacedUrl: string;
      row: SheetPatch;
    };
  } | null>(null);
  // Explicit «skip» answers are UI-only metadata: aliases cannot represent a negative mapping.
  // localStorage keeps them across reloads without widening the backend contract.
  const [interliningSkipsRevision, setInterliningSkipsRevision] = useState(0);
  // Сопоставление блоков DXF с деталями кроя, как его записал диалог «сопоставить детали».
  // Раскладке оно нужно, чтобы сохранённый маркер нёс piece_line_key и пережил переименование
  // детали; фильтрация по скоупу — здесь, потому что скоуп знает эта панель, а не модалка.
  const pieceDxfAliases = (useWatch({ control, name: 'pieceDxfAliases' }) ?? []) as Array<{
    bomLineKey?: string;
    fabricPurpose?: string;
    blockName?: string;
    pieceLineKey?: string;
  }>;

  // The card's fabric BOM lines, live from form state — the save-marker dialog's slot select.
  const bomItems = (useWatch({ control, name: 'bomItems' }) ?? []) as Array<{
    section?: string;
    name?: string;
    unit?: string;
    fabricWidth?: string;
    wastagePercent?: string;
    effectiveFabricWidthCm?: string;
    selvedgeCm?: string;
    lineKey?: string;
    purpose?: string;
    fabricDirection?: string;
    // Семпловая ярдажа (0265). Флаг РЯДОМ с назначением, а не его значение — и потому он
    // разбивает скоуп направления надвое: см. markerScopeLines в bom-purpose.ts.
    isSample?: boolean;
    id?: number;
    materialId?: number;
  }>;
  const fabricBomLines = useMemo(
    () =>
      bomItems
        .filter((b) => ROLE_OF_SECTION.has(b.section ?? '') && b.lineKey)
        .map((b, i) => ({
          id: b.id ?? 0,
          lineKey: b.lineKey!,
          name: b.name ?? '',
          section: b.section ?? '',
          purpose: b.purpose ?? '',
          role: ROLE_OF_SECTION.get(b.section ?? '') ?? '',
          unit: b.unit ?? '',
          fabricWidth: b.fabricWidth ?? '',
          wastagePercent: b.wastagePercent ?? '',
          // read-only enrichment (0259) the card read filled; the раскладка prefills its
          // cutting width from these instead of the 140 cm default.
          effectiveFabricWidthCm: b.effectiveFabricWidthCm ?? '',
          selvedgeCm: b.selvedgeCm ?? '',
          // Направление ткани (0073). Существует с прошлого года, потребителем был только
          // дайджест MATERIALS — до движка оно не доезжало вовсе, и раскладка на ворсовой
          // ткани спокойно переворачивала детали на 180°.
          fabricDirection: b.fabricDirection ?? '',
          // Едет до модалки, потому что скоуп направления партиционируется по нему (0265): без
          // этого непроставленное направление на СЕМПЛОВОМ рулоне снимало бы 180° у
          // производственного маркера, который сервер бы принял.
          isSample: !!b.isSample,
          // Толщина слоя артикула строки — для настила под раскроечный стол.
          fabricThicknessMm: materialThicknessMm(materialById.get(Number(b.materialId ?? 0))),
          materialId: Number(b.materialId ?? 0) || undefined,
          order: i,
        }))
        // Основная ткань первой, дальше подклад/бортовка/утеплитель — порядок ролей, а не
        // порядок строк BOM: в списке из восьми строк глаз ищет роль, а не позицию.
        .sort(
          (a, b) =>
            SECTION_ORDER.indexOf(a.section) - SECTION_ORDER.indexOf(b.section) ||
            a.order - b.order,
        ),
    [bomItems, materialById],
  );
  // Скоупы — то, к чему выкройка привязывается с 0267: одна группа на НАЗНАЧЕНИЕ и одна на каждую
  // ещё не разложенную строку. У неразобранной карточки назначений нет вовсе, поэтому каждая
  // строка остаётся своей группой — то есть панель ведёт себя ровно как до 0267, без единого
  // действия оператора. Разложил BOM по назначениям — группы схлопнулись сами.
  //
  // Строки берутся из формы, сохранённые и нет. Сейв карточки апсертит BOM ДО того, как сверяет
  // выкройки и алиасы (techcard.go: bom :1185, aliases :1198, patterns :1223), так что строка,
  // заведённая на вкладке BOM минуту назад, резолвится к моменту использования ключа.
  // Плитки идут в порядке строк BOM, а не в порядке назначений: «+ slot» дописывает строку в конец,
  // и новый слот должен встать последним, а не в середину по своему назначению.
  const scopes = useMemo(() => {
    const first = (s: { lines: { order: number }[] }) => Math.min(...s.lines.map((l) => l.order));
    return fabricScopes(fabricBomLines).sort((a, b) => first(a) - first(b));
  }, [fabricBomLines]);
  // The import's commit resolves live rows against the scopes AT THAT MOMENT, not at the render
  // that built its callback.
  const scopesRef = useRef(scopes);
  scopesRef.current = scopes;
  // The card's sheet set and link set against its scopes (L11 set rule: a legacy purpose-only row
  // is read for an interlining line only while that line has no rows of the same kind of its own).
  const sheetSet = useMemo(() => bindingScopes(scopes, liveRows), [scopes, liveRows]);
  const linkSet = useMemo(() => bindingScopes(scopes, pieceDxfAliases), [scopes, pieceDxfAliases]);
  // Imperative paths resolve a row against the LIVE form and scopes at call time, not the render's.
  const liveScopeOf = (b: BindingRow, kind: ArtifactKind): string =>
    scopeKeyOfBinding(
      b.fabricPurpose,
      b.bomLineKey,
      bindingScopes(
        scopesRef.current,
        (kind === 'sheet' ? getValues('patterns') : getValues('pieceDxfAliases')) ?? [],
      ),
    );
  // Подпись скоупа. У назначения — само назначение и артикулы, которые в него разложены: «основной
  // материал · Твил 1, Твил 2». Одно назначение законно владеет несколькими строками, и оператору
  // всё ещё нужно видеть, какими именно. У неразобранной строки — «роль · название», как и было.
  // A part that repeats the one before it is said once (owner 17.10: «main material · main
  // material» — a line named after its own purpose).
  const once = (parts: (string | undefined)[]) =>
    parts
      .map((x) => x?.trim() ?? '')
      .filter((x, i, a) => x && a.findIndex((y) => y.toLowerCase() === x.toLowerCase()) === i);
  const scopeLabel = (s: FabricScope<FabricLine>): string => {
    if (!s.byPurpose) {
      const l = s.lines[0];
      return once([l?.role, l?.name]).join(' · ') || 'unnamed';
    }
    const purpose = bomPurposeLabel(s.key);
    const names = once(s.lines.map((l) => l.name)).filter(
      (n) => n.toLowerCase() !== purpose.trim().toLowerCase(),
    );
    return once([purpose, names.join(', ')]).join(' · ');
  };

  // Structure (order, ids) from the array snapshot; values from the live form state so
  // setValue-written fields (rename, rebind) show through.
  const entries: Entry[] = useMemo(
    () =>
      fields.map((f, index) => ({
        row: { ...(f as PatternRow & { id: string }), ...liveRows[index] },
        index,
      })),
    [fields, liveRows],
  );

  const inRange = useMemo(() => new Set(sizeIds), [sizeIds]);
  const nameOf = (id: number) =>
    id > 0 ? formatSizeName(sizeById.get(id) ?? `#${id}`) : 'sizeless';

  // Куда ложится НОВАЯ строка выкройки. Это АРТЕФАКТ ХРАНЕНИЯ, а не смысл: у ГРАДУИРОВАННОГО файла
  // размер везде берётся из имён блоков, и ни просмотр, ни раскладка, ни сопоставление деталей, ни
  // экспорт маркера, ни индекс размеров этот size_id не читают. Берём наименьший размер ряда просто
  // чтобы не менять хранение уже заведённых карточек; любой другой был бы так же верен.
  //
  // ОДИН потребитель всё же есть, и про него легко забыть: раскладка НЕградуированного файла (в
  // именах блоков размера нет вовсе) берёт размер отсюда — больше ему взять его негде.
  //
  // 0 = БЕЗ РАЗМЕРА, и это законное значение с 0281 (в базе NULL): пока размерный ряд пуст, класть
  // лист некуда, а ждать ряда незачем — размеры конструктор уже записал в сам DXF. Раньше здесь
  // получался 0, который сервер отвергал, и загрузка выкроек была заперта за чужим решением.
  const storageSizeId = orderSizes(sizeIds)[0] ?? 0;

  const dxfEntries = useMemo(() => entries.filter((e) => isDxfUrl(e.row.url)), [entries]);
  // Legacy PDF rows. Новые PDF не принимаются, но УЖЕ ЗАГРУЖЕННЫЕ обязаны и показываться, и
  // сохраняться: выкройки пишутся ПОЛНОЙ ЗАМЕНОЙ массива, так что строка, которую панель
  // перестала рисовать, исчезла бы с карточки при первом же сохранении — молча.
  const pdfEntries = useMemo(() => entries.filter((e) => !isDxfUrl(e.row.url)), [entries]);

  // Лист раскладывается по РАЗРЕШЁННОМУ скоупу, а не по тому, что записано в строке. Это и есть
  // место, которое ломается на полуразобранной карточке: лист привязан к строке L, L потом
  // разложили в назначение P — и если сопоставлять сырой ключ с ключами групп, лист вываливается в
  // «без материала» ровно в момент, когда оператор навёл порядок в BOM. scopeKeyOfBinding ведёт его
  // за своей строкой в группу назначения, поэтому разбор BOM ничего не теряет.
  //
  // Само правило живёт в nesting/dxf-by-scope.ts, а не здесь: тот же вопрос («какие листы у этой
  // ткани») задаёт очередь раскроя партии на вкладке костинга, и вторая копия резолвера разъехалась
  // бы с этой молча — расхождение видно только на полуразобранной карточке.
  const dxfByScopeMap = useMemo(
    () => dxfByScope(dxfEntries, scopes, (e) => e.row, liveRows),
    [dxfEntries, scopes, liveRows],
  );
  // ВСЕ листы скоупа, включая наследие в PDF. Отдельно от `dxfByScopeMap`, потому что вопросы
  // разные: раскладке и разбору нужны файлы, которые можно прочитать, а замеру площадей — СОСТАВ
  // СКОУПА, каким его видит сервер. Отпечаток он считает по своим строкам `tech_card_size_pattern`,
  // а они форматом не отбираются: прислать только DXF значило бы подписаться под набором, которого
  // у сервера нет, и получить отказ о «другом наборе листов» на ровном месте.
  const allByScopeMap = useMemo(() => dxfByScope(entries, scopes, (e) => e.row), [entries, scopes]);

  // Один блок на скоуп. Скоуп без файлов остаётся в списке: пустая строка «нет DXF» — это и есть
  // дыра, а не повод не рисовать материал.
  const scopeGroups = useMemo(
    () => scopes.map((s) => ({ scope: s, entries: dxfByScopeMap.get(s.key) ?? [] })),
    [scopes, dxfByScopeMap],
  );
  const interliningOwnerFiles = useMemo(() => {
    const out = new Map<string, { fileName?: string; uploading: boolean }>();
    for (const group of scopeGroups) {
      const slot = group.scope.lines.find(
        (line) => line.section === 'TECH_CARD_BOM_SECTION_INTERLINING',
      );
      if (!slot?.lineKey) continue;
      const owner = latestDxfEntry(
        group.entries.filter((entry) => !isGeneratedFusingRow(entry.row)),
      );
      out.set(slot.lineKey, {
        ...(owner ? { fileName: owner.row.filename || patternSheetName(owner.row) } : {}),
        uploading: (uploading[group.scope.key] ?? 0) > 0,
      });
    }
    return out;
  }, [scopeGroups, uploading]);
  // Header print = one current DXF per material slot. A slot can retain several present rows
  // while files are being consolidated; the newest revision is the same row its download menu
  // presents as current, while superseded revisions remain in `historyByLine` and never enter here.
  const printSlots: RollPrintSlot[] = scopeGroups.flatMap((group) => {
    const current = latestDxfEntry(group.entries);
    if (!current?.row.url) return [];
    const full = scopeLabel(group.scope);
    const label = group.scope.byPurpose ? bomPurposeLabel(group.scope.key) : full;
    const material = once(group.scope.lines.map((line) => line.name)).join(', ') || full;
    return [
      {
        key: group.scope.key,
        label,
        material,
        url: current.row.url,
        fileName: current.row.filename || `${labelOf(current.row)}.dxf`,
      },
    ];
  });
  // DXF без живой привязки — наследие: ключа нет вовсе или его строка/назначение уже исчезли.
  // Состояния «без материала» больше нет: ни одна правка в него не ведёт (bom-purpose.ts), а то,
  // что осталось от прошлого, показывается под первым материалом (на большинстве карточек —
  // единственным) и привязывается туда первым же переносом листа на плитку. Его ссылки на детали
  // едут вместе с листом по сырой паре привязки; прочие потребители до переноса видят его ничьим.
  const orphanDxf = useMemo(() => dxfByScopeMap.get('') ?? [], [dxfByScopeMap]);
  const orphanHome = scopes[0]?.key ?? '';

  const filesOf = (list: Entry[]): NestingFile[] =>
    list.map(({ row }) => ({ name: patternSheetName(row), url: row.url! }));

  // ВСЕ DXF карточки со своими скоупами — одна пачка на один разбор, посчитанная ОБЩЕЙ функцией
  // (см. card-dxf-pack.ts): панель деталей кроя под этим блоком просит ту же самую, поэтому обе
  // читают один ответ и файлы качаются один раз. Собирать список здесь своими руками нельзя — ключ
  // кэша это и есть содержимое пачки, и любое расхождение с соседней панелью означает второе
  // скачивание тех же мегабайт, которого никто не увидит.
  const allDxfFiles = useCardDxfPack();
  const geometry = useDxfGeometry(allDxfFiles, armed);
  const dxfIndex = useDxfIndex(geometry.data);
  const bundle = geometry.data;
  const contourPiecesByScope = useMemo(() => {
    const out = new Map<string, PieceDTO[]>();
    if (!bundle) return out;
    for (const group of scopeGroups) {
      const interlining = group.scope.lines.some(
        (line) => line.section === 'TECH_CARD_BOM_SECTION_INTERLINING',
      );
      const ownerUrls = interlining
        ? new Set(
            group.entries
              .filter((entry) => !isGeneratedFusingRow(entry.row))
              .map((entry) => entry.row.url)
              .filter((url): url is string => !!url),
          )
        : null;
      const inScope = bundle.pieces.filter((piece) => {
        const file = piece.fileIndex ?? -1;
        if (bundle.scopeByFile.get(file) !== group.scope.key) return false;
        return !ownerUrls || ownerUrls.has(bundle.urlByFile?.get(file) ?? '');
      });
      if (inScope.length === 0) continue;
      const split = splitPiecesBySize(inScope, dictTokens);
      const contourLayer = defaultContourLayer(layerOptions(inScope, split.codeById));
      out.set(
        group.scope.key,
        inScope.filter((piece) => (piece.layer ?? '') === contourLayer),
      );
    }
    return out;
  }, [bundle, scopeGroups, dictTokens]);

  const knownPieceShapes = useMemo<PieceShapeReference[]>(() => {
    if (!bundle) return [];
    const livePieces = cardPieces.flatMap((piece) => {
      const lineKey = piece.lineKey?.trim() ?? '';
      const name = piece.name?.trim() ?? '';
      return lineKey && name ? [{ ...piece, lineKey, name }] : [];
    });
    return scopeGroups.flatMap((group) => {
      const scoped = contourPiecesByScope.get(group.scope.key) ?? [];
      if (scoped.length === 0) return [];
      return pieceShapeReferences({
        parse: {
          pieces: scoped,
          blockNames: scoped.flatMap((piece) => (piece.blockName?.trim() ? [piece.blockName] : [])),
        },
        bindings: pieceDxfAliases.filter((alias) => aliasInScope(alias, group.scope, linkSet)),
        pieces: livePieces,
        sizeTokens: [...dictTokens.keys()],
      });
    });
  }, [bundle, cardPieces, scopeGroups, contourPiecesByScope, pieceDxfAliases, linkSet, dictTokens]);

  const mainPatternScope = useMemo(
    () =>
      scopeGroups.find((group) =>
        group.scope.byPurpose
          ? group.scope.key === 'TECH_CARD_BOM_PURPOSE_MAIN'
          : group.scope.lines[0]?.section === 'TECH_CARD_BOM_SECTION_FABRIC',
      ),
    [scopeGroups],
  );
  const mainPatternBlocks = mainPatternScope
    ? contourPiecesByScope.get(mainPatternScope.scope.key) ?? []
    : [];
  const mainPatternAliases = useMemo(
    () =>
      mainPatternScope
        ? pieceDxfAliases.filter((alias) => aliasInScope(alias, mainPatternScope.scope, linkSet))
        : [],
    [mainPatternScope, pieceDxfAliases, linkSet],
  );

  const interliningReviews = useMemo(() => {
    const out = new Map<
      string,
      { matches: InterliningImportMatch[]; unmatched: InterliningImportMatch[] }
    >();
    if (!bundle) return out;
    // This state value is intentionally only a cache-buster for localStorage-backed decisions.
    void interliningSkipsRevision;
    for (const group of scopeGroups) {
      const slot = group.scope.lines.find(
        (line) => line.section === 'TECH_CARD_BOM_SECTION_INTERLINING',
      );
      if (!slot?.lineKey) continue;
      const hasOwnerFile = group.entries.some((entry) => !isGeneratedFusingRow(entry.row));
      if (!hasOwnerFile) continue;
      const blocks = contourPiecesByScope.get(group.scope.key) ?? [];
      const matches = matchInterliningImport({
        blocks,
        mainBlocks: mainPatternBlocks,
        mainAliases: mainPatternAliases,
        previousAliases: pieceDxfAliases.filter((alias) =>
          aliasInScope(alias, group.scope, linkSet),
        ),
        pieces: cardPieces,
        sizeTokens: dictTokens,
      });
      const skipped = readInterliningSkips(techCardId, slot.lineKey);
      out.set(group.scope.key, {
        matches,
        unmatched: matches.filter(
          (match) =>
            (!match.pieceLineKey || !match.previouslyBound) &&
            !skipped.has(interliningIdentityKey(match.identity)),
        ),
      });
    }
    return out;
  }, [
    bundle,
    mainPatternBlocks,
    mainPatternAliases,
    scopeGroups,
    contourPiecesByScope,
    pieceDxfAliases,
    linkSet,
    cardPieces,
    dictTokens,
    techCardId,
    interliningSkipsRevision,
  ]);

  // ПОКРЫТИЕ РАЗМЕРОВ ПО МАТЕРИАЛАМ — ВЫВОДИТСЯ из разбора, а не хранится состоянием.
  //
  // Пока разбор запускала кнопка, ответ был событием: нажали → посчитали → положили в useState. Со
  // сборкой, которая приезжает сама, хранить его стало нечем и незачем — состояние «мы уже
  // считали» повторяло бы состояние самого запроса и расходилось бы с ним при каждом перезаливе
  // файла. Здесь оно просто читается из того, что есть прямо сейчас.
  //
  // `splitPiecesBySize` считается по деталям ТОЛЬКО ОДНОГО скоупа, а не по всей пачке, и это не
  // придирка: функция решает, какой хвост имени блока является размером, глядя на то, какие хвосты
  // МЕНЯЮТСЯ у одной основы, — то есть ответ зависит от того, что лежит рядом. Пропустив через неё
  // всю карточку сразу, мы отправили бы на сервер (индекс 0280) другой набор токенов, чем прежде.
  // Разбор при этом идёт по файлу независимо (`parseFiles` читает $INSUNITS своего буфера), так что
  // сами детали побитово те же, что дал бы разбор одного скоупа.
  //
  // Считается ОТ ПАЧКИ, а не от групп панели, и мемо тоже висит на пачке: группы пересобираются от
  // любого нажатия клавиши в форме карточки, а это счёт по тысячам контуров — на каждый символ его
  // гонять незачем. Ключ — скоуп из самого разбора (`scopeByFile`), тот же, по которому группа
  // ищет свои файлы.
  const foundByScope = useMemo(() => {
    const out = new Map<string, { tokens: Set<string>; uniOnly: boolean }>();
    if (!bundle) return out;
    const byScope = new Map<string, PieceDTO[]>();
    for (const p of bundle.pieces) {
      const k = bundle.scopeByFile.get(p.fileIndex ?? -1) ?? '';
      byScope.set(k, [...(byScope.get(k) ?? []), p]);
    }
    for (const [k, list] of byScope) {
      // Заявление автора считается по именам блоков, а не по разбору: у скоупа из одних uni-имён
      // размерных токенов не будет по построению, и без этого признака полоса покрытия объявила
      // бы «файл не градуирован» про файл, который градуировать нечего.
      //
      // Контур БЕЗ имени блока — против заявления, а не мимо него: он ничего не заявляет, и скоуп
      // «uni-блоки плюс россыпь безымянных» не «не градуируется», а разобран наполовину. Фильтр по
      // непустым именам объявлял бы такой скоуп помеченным, умалчивая про остальное.
      out.set(k, {
        tokens: splitPiecesBySize(list, dictTokens).sizeTokenSet,
        uniOnly: list.length > 0 && list.every((p) => uniOf((p.blockName ?? '').trim())),
      });
    }
    return out;
  }, [bundle, dictTokens]);

  const audits = useMemo<Record<string, SizeAudit>>(() => {
    const out: Record<string, SizeAudit> = {};
    for (const g of scopeGroups) {
      if (g.entries.length === 0) continue;
      const sig = sigOf(g.entries);
      if (bundle) {
        // Скоупа нет в карте — значит из его файлов не вышло НИ ОДНОЙ детали (пустой чертёж,
        // непрочитанный слой). Это законный ответ «размеров в именах блоков нет», а не отсутствие
        // проверки: проверка была, ответ пустой. Пустой скоуп заявлением тоже не является —
        // `uniOnly` у него false, и полоса скажет прежние слова.
        const scoped = foundByScope.get(g.scope.key);
        out[sig] = {
          phase: 'ready',
          found: scoped?.tokens ?? new Set<string>(),
          uniOnly: scoped?.uniOnly ?? false,
        };
      } else if (geometry.isError) {
        out[sig] = { phase: 'error', message: geometry.error?.message ?? 'reason unknown' };
      } else if (armed) {
        out[sig] = { phase: 'loading' };
      }
    }
    return out;
  }, [scopeGroups, bundle, foundByScope, geometry.isError, geometry.error, armed]);

  // Какая плитка раскрыта. Выбор пользователя выигрывает, пока он указывает на живую плитку:
  // материал могли удалить из BOM, пока панель открыта, и залипший ключ показал бы пустоту вместо
  // ближайшего осмысленного материала.
  const shelfKeys = useMemo(
    () => [...scopeGroups.map((g) => g.scope.key), ...(pdfEntries.length > 0 ? [PDF_KEY] : [])],
    [scopeGroups, pdfEntries.length],
  );
  // Фолбэк идёт ЗА ФАЙЛАМИ, а не за материалами: на карточке, где все DXF залиты до 0260 (значит
  // все непривязанные) или остались только PDF, «первый материал» — это пустая плитка «раскроить
  // нечем», и настоящие файлы оказывались за неподсвеченной плиткой.
  const selectedKey =
    pickedKey && shelfKeys.includes(pickedKey)
      ? pickedKey
      : scopeGroups.find((g) => g.entries.length > 0)?.scope.key ??
        (orphanDxf.length > 0 && orphanHome ? orphanHome : null) ??
        (pdfEntries.length > 0 ? PDF_KEY : null) ??
        shelfKeys[0] ??
        null;
  const setSelectedKey = setPickedKey;

  useEffect(() => {
    const key = pendingSlotFocus.current;
    if (!key || isSubmitting) return;
    const index = bomItems.findIndex((line) => line.lineKey === key);
    if (index < 0) return;
    pendingSlotFocus.current = null;
    setFocus(`bomItems.${index}.name` as never);
  }, [bomItems, isSubmitting, setFocus]);

  const colourwayBlockers = (scope: FabricScope<FabricLine>): string[] => {
    const keys = new Set(scope.lines.map((line) => line.lineKey));
    const ids = new Set(scope.lines.map((line) => Number(line.id ?? 0)).filter((id) => id > 0));
    return (cardRead?.colorways ?? [])
      .filter((colorway) =>
        (colorway.usages ?? []).some(
          (usage) =>
            ids.has(Number(usage.bomItemId ?? 0)) || keys.has(usage.bomLineKey?.trim() ?? ''),
        ),
      )
      .map(
        (colorway) =>
          colorway.baseSku?.trim() || colorway.colorCode?.trim() || `#${colorway.colorwayId ?? 0}`,
      );
  };

  // The cloth lines as the form holds them NOW. Handlers and uploads read these, not the render's
  // `scopes`: an upload awaits files, dialogs and the server while the BOM may be re-sorted.
  const liveCloth = () => clothLines((getValues('bomItems') ?? []) as BomLine[]);

  // What keeps a slot on the card besides colourways: its sheets, piece links and markers. Removing
  // the slot would leave them without a material, so it is refused, naming them.
  const scopeHold = (scope: FabricScope<FabricLine>): string[] =>
    holdNames(
      withoutGenerated(
        scopeImpact(scope, {
          patterns: liveRows,
          aliases: pieceDxfAliases,
          markers: cardRead?.markers ?? [],
          scopes,
        }),
      ),
    );

  // PURPOSE OF A WHOLE SLOT. Its sheets and piece links go with it through the one writer
  // (form-writers applyLineChange → bom-purpose planLineChange); a merge into a slot that links one
  // of its blocks to another piece is refused, and so is a change that would strand a sheet.
  const changeScopePurpose = (
    scope: FabricScope<FabricLine>,
    nextPurpose: string,
    occupiedConfirmed = false,
  ): boolean => {
    const purpose = nextPurpose || UNSET_PURPOSE;
    // «Unset» splits a multi-line slot into one slot per line; its sheets have no single home.
    if (purpose === UNSET_PURPOSE && scope.lines.length > 1) return false;
    const lineKeys = new Set(scope.lines.map((line) => line.lineKey));
    const items = (getValues('bomItems') ?? []) as BomLine[];
    const nextItems = items.map((line) =>
      lineKeys.has(line.lineKey?.trim() ?? '') ? { ...line, purpose } : line,
    );
    // The slot the lines land in, found by the LINE: an interlining line stays its own slot
    // whatever purpose it gets (L11).
    const to = scopeOfLine(fabricScopes(clothLines(nextItems)), scope.lines[0]?.lineKey ?? '');
    if (!to) return false;
    if (!occupiedConfirmed && to.key !== scope.key) {
      const sourceHas = slotRows(scope.key).length > 0;
      const targetHas = slotRows(to.key).length > 0;
      if (sourceHas && targetHas) {
        setOccupiedAsk({ kind: 'purpose', scopeKey: scope.key, nextPurpose: purpose });
        return false;
      }
    }
    const out = applyLineChange(getValues, setValue, nextItems as never, lineKeys);
    if (out.kind !== 'done') {
      useSnackBarStore
        .getState()
        .showMessage(
          out.kind === 'clash'
            ? `blocks clash: ${out.blocks.join(', ')}`
            : `used by ${out.names.join(', ')}`,
          'error',
        );
      return false;
    }
    items.forEach((line, index) => {
      if (!lineKeys.has(line.lineKey?.trim() ?? '')) return;
      setValue(`bomItems.${index}.purpose`, purpose, {
        shouldDirty: true,
        shouldValidate: true,
      });
    });
    setConfirmScopeKey(null);
    setSelectedKey(to.key);
    return true;
  };

  const addMaterialSlot = () => {
    const current = (getValues('bomItems') ?? []) as BomLine[];
    const used = new Set(
      current
        .filter((line) => ROLE_OF_SECTION.has(line.section ?? ''))
        .map((line) => line.purpose?.trim())
        .filter((purpose): purpose is string => !!purpose && purpose !== UNSET_PURPOSE),
    );
    const purpose =
      bomPurposeOrder.find((candidate) => !used.has(candidate)) ?? 'TECH_CARD_BOM_PURPOSE_OTHER';
    // The slot is born named after its purpose: an empty name must never block the save.
    const line = bornBomLine({
      section: 'TECH_CARD_BOM_SECTION_FABRIC',
      name: defaultRoleForPurpose(purpose) || bomPurposeLabel(purpose),
      purpose,
    }) as BomLine;
    pendingSlotFocus.current = line.lineKey?.trim() ?? null;
    setConfirmScopeKey(null);
    setSelectedKey(purpose);
    setValue('bomItems', [...current, line] as never, {
      shouldDirty: true,
      shouldValidate: true,
    });
  };

  const removeMaterialScope = (scope: FabricScope<FabricLine>) => {
    if (colourwayBlockers(scope).length > 0 || scopeHold(scope).length > 0) return;
    const lineKeys = new Set(scope.lines.map((line) => line.lineKey));
    const current = (getValues('bomItems') ?? []) as BomLine[];
    const removed = current.filter((line) => lineKeys.has(line.lineKey?.trim() ?? ''));
    if (removed.length === 0) return;
    removed.forEach((line) => releaseBomLineRefs(getValues, setValue, line));
    const rest = current.filter((line) => !lineKeys.has(line.lineKey?.trim() ?? ''));
    // The slot's bindings settle in one change; the fusing rebuild's generated sheets leave with it.
    applyLineChange(getValues, setValue, rest as never, lineKeys, cardRead?.markers ?? []);
    setValue('bomItems', rest as never, { shouldDirty: true, shouldValidate: true });
    setConfirmScopeKey(null);
    setSelectedKey(scopes.find((candidate) => candidate.key !== scope.key)?.key ?? null);
  };

  // Размерный токен из имён блоков → id размера карточки. Нужен раскладке: один DXF несёт весь
  // ряд, и маркер обязан лечь на ВЫБРАННЫЙ внутри размер, а не на тот, в чей слот файл положили.
  const sizeIdByToken = useMemo(() => {
    const m = new Map<string, number>();
    for (const id of sizeIds) {
      for (const t of sizeTokensOf(sizeById.get(id))) if (!m.has(t)) m.set(t, id);
    }
    return m;
  }, [sizeIds, sizeById]);

  // Подпись скоупа по его ключу — чтобы подсказка «по другой ткани» в диалоге сопоставления могла
  // сказать, ПО КАКОЙ. Ключи здесь и в сохранённых алиасах могут не совпадать на полуразобранной
  // карточке (алиас лежит на строке, группа уже на назначении), поэтому в карту кладутся ОБА: ключ
  // скоупа и ключ каждой его строки. Иначе подсказка молча теряла бы имя и читалась бы как факт.
  const scopeLabelByKey = useMemo(() => {
    const m = new Map<string, string>();
    for (const s of scopes) {
      const label = scopeLabel(s);
      m.set(s.key, label);
      for (const l of s.lines) if (!m.has(l.lineKey)) m.set(l.lineKey, label);
    }
    return m;
  }, [scopes]);

  // ЗАМЕР ПЛОЩАДЕЙ ДЕТАЛЕЙ — состояние читается ИЗ ОТВЕТА СЕРВЕРА, а не выводится здесь.
  //
  // Устаревание считает сервер: он сверяет отпечаток источника (листы И связи блок→деталь) с тем,
  // под которым мерили, и отдаёт `stale` на чтении карточки. Своё понятие свежести было бы вторым
  // правилом на тот же вопрос, и первое же расхождение показало бы «замерено» там, где сервер уже
  // не считает замер годным (или наоборот). Ключи здесь СЕРВЕРНЫЕ — их даёт сырая привязка листов,
  // потому что именно из неё сервер выводит имя скоупа.
  // Спрашивается по ВСЕМ листам скоупа (PDF в том числе): скоуп на сервере — это состав, а не
  // подмножество читаемых файлов.
  const sheetsOfScope = (scopeKey: string): PatternRow[] =>
    (allByScopeMap.get(scopeKey) ?? []).map((e) => e.row);

  // ФОРМА МОГЛА УЙТИ ВПЕРЁД СЕРВЕРА, И ТОГДА «ЗАМЕРЕНО» — НЕ ОТВЕТ, А ВЧЕРАШНЯЯ НОВОСТЬ.
  //
  // Свежесть замера сервер считает по СОХРАНЁННЫМ листам и связям. Пока правки лежат в форме
  // (заменили файл листа, переставили связь блок→деталь, перепривязали лист к другой ткани), он о
  // них не знает и продолжает отвечать `stale: false` — про источник, которого на экране уже нет.
  // Пересчитать отпечаток здесь нечем (сервер его наружу не отдаёт), поэтому единственное честное
  // поведение — сказать, что ответ относится к сохранённому состоянию.
  // Правлен ли ИСТОЧНИК замера и не сохранён. Правило одно на обе точки публикации площадей и
  // живёт рядом с самой публикацией (piece-areas.ts) — местная копия однажды разошлась бы с той,
  // которой пользуется применение нормы, и дыру закрыли бы наполовину.
  const sourceDirty = useUnsavedAreaSource(control);

  // Размеры карточки, которых в разобранных файлах не оказалось. Считается КАЖДЫЙ РАЗ, а не
  // хранится: ряд правится на этой же вкладке, прямо над панелью.
  const missingIn = (a: SizeAudit | undefined): number[] =>
    a?.phase === 'ready' && a.found.size > 0
      ? sizeIds.filter((id) => !sizeTokensOf(sizeById.get(id)).some((t) => a.found.has(t)))
      : [];

  // ---- дыры, которые панель обязана назвать вместо счётчика покрытия ---------------------
  // Материал без DXF — дыра ТОЛЬКО у основной ткани. Подкладку, бортовку и утеплитель градалка
  // сплошь и рядом чертит внутри файла основной ткани, а строка выкройки несёт ровно один
  // bomLineKey, то есть один файл двум материалам служить не может. Красный флаг на подкладке был
  // бы неопровергаемым: снять его можно только залив тот же файл вторым объектом, что удваивает
  // скачивание и разводит скоуп алиасов. Заменять счётчик, который занижал, на индикатор, который
  // завышает, — не улучшение.
  // «Раскроить нечем» — красный флаг ТОЛЬКО у основного материала. У неразобранной строки это
  // по-прежнему section=fabric (ровно как до 0267), у разобранной — назначение «основной
  // материал». Это и есть выигрыш от разбора: карманка и контраст сегодня тоже section=fabric и
  // получают красный флаг, которого не заслуживают; разложи их — и флаг сам уйдёт туда, где ему
  // место, потому что назначение говорит роль, а секция — только вид товара.
  const isMainScope = (g: { scope: FabricScope<FabricLine> }) =>
    g.scope.byPurpose
      ? g.scope.key === 'TECH_CARD_BOM_PURPOSE_MAIN'
      : g.scope.lines[0]?.section === 'TECH_CARD_BOM_SECTION_FABRIC';
  const materialsWithoutDxf = scopeGroups.filter((g) => g.entries.length === 0 && isMainScope(g));
  // Строки, чей size_id вне ряда карточки. Размер — артефакт хранения, но сервер всё равно
  // сверяет НЕПУСТОЙ размер с размерным рядом и отвергает такую строку, роняя ВЕСЬ сейв карточки.
  // Лист БЕЗ размера (0281) сюда не попадает: он не называет размера вовсе, и ряду его проверять
  // не по чему — ровно поэтому его и можно залить на карточку с пустым рядом.
  const outOfRange = entries.filter((e) => e.row.sizeId && !inRange.has(e.row.sizeId));
  const missingSizeNotes = scopeGroups.flatMap((g) => {
    if (g.entries.length === 0) return [];
    const missing = missingIn(audits[sigOf(g.entries)]);
    if (missing.length === 0) return [];
    return [`${scopeLabel(g.scope)}: missing ${missing.map(nameOf).join(', ')}`];
  });

  // Загрузку гейтит ТКАНЬ, а не размерный ряд: выкройка привязывается к материалу, и без строки BOM
  // её некуда положить — а вот без размерного ряда положить есть куда (лист без размера, 0281).
  // Порядок работы в ателье обратный: DXF приходит от конструктора раньше, чем кто-либо утверждает
  // градацию, и ряд из этих же файлов потом и набирают: первый DXF на карточке без ряда ставит ряд
  // из своих размеров сам (withSizes). Склейка тоже не ждёт ряда — она читает размеры по словарю, а
  // её результат идёт тем же путём. Ряда требует только мастер импорта (PDF и прочее): размеры он
  // узнаёт внутри себя и раскладывает их по ряду карточки, так что без ряда такие файлы не берутся.
  const canUpload = canEdit && scopes.length > 0;
  const importOk = PATTERN_IMPORT_ENABLED && !!techCardId;

  function openPicker(scopeKey: string, dxfOnly = false) {
    if (!canUpload || (uploadingRef.current[scopeKey] ?? 0) > 0) return;
    pickFor.current = scopeKey;
    pickDxfOnly.current = dxfOnly;
    if (fileInputRef.current)
      fileInputRef.current.accept = dxfOnly
        ? SLOT_ACCEPT_DXF
        : importOk
          ? SLOT_ACCEPT_ALL
          : SLOT_ACCEPT_DXF;
    fileInputRef.current?.click();
  }

  const scopeOfKey = (key: string) => scopes.find((x) => x.key === key);
  // The target slot as the form holds it now. An upload compares its signature before and after
  // every await: a slot re-sorted, merged or deleted meanwhile takes nothing. '' = the slot is gone.
  const liveScope = (key: string) => fabricScopes(liveCloth()).find((x) => x.key === key);
  const scopeSig = (key: string) => {
    const sc = liveScope(key);
    return sc
      ? `${sc.key}|${sc.lines
          .map((l) => l.lineKey)
          .sort()
          .join(',')}`
      : '';
  };
  const bindingOf = (key: string) => {
    const sc = liveScope(key);
    return sc ? bindingForScope(sc) : { fabricPurpose: '', bomLineKey: '' };
  };

  // Ask the units of the DXFs that declare none; resolves the files to upload (rewritten where
  // asked) or null on cancel. Files with units pass through untouched; binary and UTF-16 DXFs
  // are refused here, before any rewrite reads them as latin1.
  async function withUnits(picked: File[], faults: FileFault[]): Promise<File[] | null> {
    const problems = await Promise.all(
      picked.map(async (f) =>
        isDxfFile(f) ? asciiDxfProblem(new Uint8Array(await f.arrayBuffer())) : null,
      ),
    );
    picked.forEach((f, i) => {
      if (problems[i]) faults.push({ name: f.name, why: problems[i]! });
    });
    const files = picked.filter((_, i) => !problems[i]);
    if (files.length === 0) return null;
    const texts = await Promise.all(
      files.map((f) => (isDxfFile(f) ? unitlessText(f) : Promise.resolve(null))),
    );
    const need = texts.flatMap((t, i) => (t != null ? [i] : []));
    if (need.length === 0) return files;
    const units = await new Promise<Record<string, DxfLinearUnit> | null>((resolve) =>
      setUnitsAsk({
        items: need.map((i) => ({
          key: String(i),
          name: files[i].name,
          extents: drawingExtents(texts[i]!),
        })),
        confirm: (u) => {
          setUnitsAsk(null);
          resolve(u);
        },
        cancel: () => {
          setUnitsAsk(null);
          resolve(null);
        },
      }),
    );
    if (!units) return null;
    return files.map((f, i) =>
      texts[i] != null ? fileWithUnits(texts[i]!, units[String(i)] ?? 'mm', f.name, f.type) : f,
    );
  }

  // Map the sizes of a DXF the card cannot read (unsized on a multi-size card, or graded in names
  // the card does not have) onto the card's sizes: block names are rewritten and left-out sizes
  // removed before upload; an unsized file instead takes the picked size as its row's size.
  // Resolves null on cancel.
  async function withSizes(
    file: File,
    faults: FileFault[],
  ): Promise<{ file: File; sizeId?: number; seed?: number[] } | null> {
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (asciiDxfProblem(bytes)) return null; // withUnits already said why
    const text = bytesToLatin1(bytes);
    const scan = scanDxfSizes(text, (t) => dictTokens.has(t));
    // A card without a size range takes the file's sizes as its range (set once the file is up).
    const live = (getValues('sizeIds') ?? []) as number[];
    const seeded = live.length === 0 ? fileSizeRun(scan.sizes) : [];
    const seed = seeded.length > 0 ? seeded : undefined;
    const cards = (seed ?? orderSizes(live)).map((id) => ({
      id,
      label: nameOf(id),
      tokens: sizeTokensOf(sizeById.get(id)),
    }));
    if (!needsSizeDialog(scan, cards)) return { file, seed };
    const picks = await new Promise<Record<string, SizePick> | null>((resolve) =>
      setSizesAsk({
        ask: {
          name: file.name,
          sizes: scan.sizes,
          cards,
          initial:
            scan.sizes.length > 0
              ? guessSizeMap(scan.sizes, cards)
              : { [UNSIZED]: { on: true, to: cards[0].id } },
        },
        confirm: (p) => {
          setSizesAsk(null);
          resolve(p);
        },
        cancel: () => {
          setSizesAsk(null);
          resolve(null);
        },
      }),
    );
    if (!picks) return null;
    if (scan.sizes.length === 0) return { file, sizeId: picks[UNSIZED]?.to || undefined, seed };
    try {
      const plan = planSizeMap(scan, picks, cards);
      let out = applySizeMap(text, plan);
      // A converter sheet declares its blocks in an embedded manifest; it moves with the blocks,
      // or the next parse refuses the sheet.
      if (text.includes('GRBPWR-MANIFEST')) {
        const mf = await import('lib/pattern-import/manifest');
        const m = mf.readManifest(text);
        if (m) out = mf.embedManifest(out, remapManifest(m, plan));
      }
      return {
        file: new File([latin1ToBytes(out) as BlobPart], file.name, { type: file.type }),
        seed,
      };
    } catch (e) {
      faults.push({ name: file.name, why: e instanceof Error ? e.message : String(e) });
      return null;
    }
  }

  // New sheets are named by the card, not by the file: `{style number or card name} {material}`,
  // + ' 2', ' 3'… while the slot already holds that name. Existing rows are never renamed — the
  // name is the marker's provenance key (nesting/sheet-name.ts).
  function autoName(scopeKey: string, file: File): string {
    const sc = scopeOfKey(scopeKey);
    const material = (sc ? scopeLabel(sc).split(' · ')[0] : '').trim().toLowerCase();
    const base = clampPatternName(
      [styleNumber.trim() || cardName.trim(), material].filter(Boolean).join(' '),
    );
    if (!base) return patternNameOfFile(file);
    const taken = new Set(
      ((getValues('patterns') ?? []) as PatternRow[])
        .filter((r) => liveScopeOf(r, 'sheet') === scopeKey)
        .map((r) => (r.name ?? '').trim()),
    );
    // The suffix gets its bytes BEFORE the base is clamped: a base already at the 255-byte cap
    // would otherwise clamp `${base} 2` back to `base` and the loop would never end.
    const withSuffix = (suffix: string) =>
      `${clampUtf8Bytes(base, MAX_PATTERN_NAME - new TextEncoder().encode(suffix).length).trimEnd()}${suffix}`;
    let name = base;
    for (let n = 2; taken.has(name) && n <= 999; n++) name = withSuffix(` ${n}`);
    // Finite fallback: a ulid tail is unique enough without another scan.
    if (taken.has(name)) name = withSuffix(` ${ulid().slice(-8).toLowerCase()}`);
    return name;
  }

  // One DXF into one slot: no naming modal (the slot is the material, the name is the card's).
  // `batch` = the pick it belongs to, which reports once; alone (the merge output) it reports itself.
  async function directUpload(
    scopeKey: string,
    picked: File,
    batch?: FileFault[],
    target?: string,
  ): Promise<boolean> {
    const faults = batch ?? [];
    try {
      return await uploadOne(scopeKey, picked, faults, target);
    } finally {
      if (!batch) settleFileBatch(null, 1, faults);
    }
  }

  const bumpUploading = (scopeKey: string, d: number) => {
    const current = uploadingRef.current;
    const n = Math.max(0, (current[scopeKey] ?? 0) + d);
    const { [scopeKey]: _gone, ...rest } = current;
    const next = n > 0 ? { ...rest, [scopeKey]: n } : rest;
    uploadingRef.current = next;
    setUploading(next);
  };

  const nextRevision = (row: PatternRow): number => {
    const history = row.lineKey ? historyByLine.get(row.lineKey) ?? [] : [];
    const optimistic = reuploadFeedback[feedbackKey(row)]?.version ?? 0;
    return (
      Math.max(
        revisionOf(row) ?? 0,
        optimistic,
        ...history.map((revision) => Number(revision.revision ?? 0) || 0),
      ) + 1
    );
  };

  const shownRevision = (row?: PatternRow): number | null =>
    row ? reuploadFeedback[feedbackKey(row)]?.version ?? revisionOf(row) : null;

  function beginReupload(scopeKey: string, target?: string): ReuploadFlight {
    const rows = ((getValues('patterns') ?? []) as PatternRow[]).filter(
      (row) => isDxfUrl(row.url) && liveScopeOf(row, 'sheet') === scopeKey,
    );
    const exact = target
      ? rows.find((row) => sheetRowId(row) === target)
      : rows.length === 1
        ? rows[0]
        : undefined;
    const display = exact ?? rows[0];
    const flight = {
      rowId: exact ? sheetRowId(exact) : '',
      version: display ? nextRevision(display) : 1,
    };
    setReuploading((all) => ({ ...all, [scopeKey]: flight }));
    return flight;
  }

  const endReupload = (scopeKey: string) =>
    setReuploading((all) => {
      const { [scopeKey]: _gone, ...rest } = all;
      return rest;
    });

  // Occupancy is format-blind: a legacy PDF owns the same single slot as a DXF.
  const slotRows = (scopeKey: string) =>
    ((getValues('patterns') ?? []) as PatternRow[]).filter(
      (row) => !!row.url && liveScopeOf(row, 'sheet') === scopeKey,
    );
  const slotOccupant = (scopeKey: string, target?: string) => {
    const rows = slotRows(scopeKey);
    const wanted = (target ?? '').trim();
    return (
      (wanted ? rows.find((row) => sheetRowId(row) === wanted) : undefined) ??
      rows.find((row) => !isGeneratedFusingRow(row)) ??
      rows[0]
    );
  };
  const slotHasSheet = (scopeKey: string) => slotRows(scopeKey).length > 0;

  async function patternRowFile(row: PatternRow): Promise<File | null> {
    if (!row.url || !isDxfUrl(row.url)) return null;
    const blob = await fetchMediaBlob(row.url);
    return new File([blob], fileNameOf(row), { type: blob.type || 'application/dxf' });
  }

  /** Download the current DXF as the first merge input. PDFs still occupy a slot but cannot merge. */
  async function occupiedDxf(scopeKey: string, target?: string): Promise<File | null> {
    const preferred = slotOccupant(scopeKey, target);
    const row =
      preferred && isDxfUrl(preferred.url)
        ? preferred
        : slotRows(scopeKey).find((candidate) => isDxfUrl(candidate.url));
    return row ? patternRowFile(row) : null;
  }

  // What the re-upload needs from the outside world: the files, the worker, the server, and the
  // writers of new rows (the same writers as everywhere else on the card).
  function reuploadDeps(
    scopeKey: string,
    type: string,
  ): ReuploadDeps<FormPiece, FormAlias, FormOp> {
    const parse: ReuploadDeps<FormPiece, FormAlias, FormOp>['parse'] = async (files) => {
      const client = new NestingWorkerClient();
      try {
        const out = await client.parse(
          files.map((f) => new File([f.bytes as BlobPart], f.name)),
          { ...RECONCILE_PARSE },
        );
        return { pieces: out.pieces, blockNames: out.blockNames, failedFiles: out.failedFiles };
      } finally {
        client.terminate();
      }
    };
    return {
      download: async (url) => new Uint8Array(await (await fetchMediaBlob(url)).arrayBuffer()),
      parse,
      sha256: (bytes) => sha256Hex(bytes),
      upload: async (f) => {
        const up = await uploadPatternFile(new File([f.bytes as BlobPart], f.name, { type }));
        return { url: up.url, filename: up.filename, sizeBytes: up.sizeBytes, sha256: up.sha256 };
      },
      // The other slots' sheets, downloaded and parsed on the reconcile options. Not the card's
      // shared parse: it may still be loading, or have dropped a file, and «no other sheets» then
      // makes a piece moved from another material look new. Any failure refuses the re-upload.
      otherSheets: async () => {
        const by = new Map<string, PatternRow[]>();
        for (const r of (getValues('patterns') ?? []) as PatternRow[]) {
          if (!r.url || !isDxfUrl(r.url)) continue;
          const k = liveScopeOf(r, 'sheet');
          if (!k || k === scopeKey) continue;
          by.set(k, [...(by.get(k) ?? []), r]);
        }
        const out: { scope: ReconcileScope; parse: ParsedSheetLite }[] = [];
        for (const [k, rows] of by) {
          const sc = scopeOfKey(k);
          if (!sc) continue;
          const files = await Promise.all(
            rows.map(async (r, i) => ({
              name: patternSheetName(r) || `sheet ${i + 1}`,
              bytes: new Uint8Array(await (await fetchMediaBlob(r.url!)).arrayBuffer()),
            })),
          );
          const parsed = await parse(files);
          if (parsed.failedFiles > 0) throw new Error(`unreadable sheet in ${k}`);
          out.push({
            scope: bindingForScope(sc) as ReconcileScope,
            parse: { pieces: parsed.pieces, blockNames: parsed.blockNames },
          });
        }
        return out;
      },
      mintKey: () => ulid(),
      // A piece born from a card piece (a split part from its parent) takes the parent's cut: grain,
      // grading, fusing, the per-colourway fabric and the note. Name and callout stay its own.
      makePiece: (seed: NewPieceSeed, from?: FormPiece): FormPiece => ({
        lineKey: seed.lineKey,
        name: seed.name,
        piecesPerGarment: seed.piecesPerGarment,
        cutSymmetry: seed.cutSymmetry,
        grainline: '',
        fused: false,
        calloutNumber: 0,
        note: '',
        materials: [],
        ...inheritedCut(from),
      }),
      makeAlias: (seed: NewAliasSeed): FormAlias => ({
        bomLineKey: seed.bomLineKey,
        fabricPurpose: seed.fabricPurpose,
        blockName: seed.blockName,
        pieceLineKey: seed.pieceLineKey,
      }),
    };
  }

  // RE-UPLOAD INTO A SLOT THAT ALREADY HOLDS A SHEET (L4a): reconcile and apply at once. No units or
  // sizes questions (both come from the replaced sheet), no pieces viewer. The result line links to
  // the first marked step; the operator stays here after apply. 'first' = an empty slot: the caller
  // goes on with the first-upload path. `target` = the sheet row (sheetRowId) the file replaces;
  // without it the slot's only sheet, or the one sharing most blocks.
  async function replaceSheet(
    scopeKey: string,
    picked: File,
    target?: string,
  ): Promise<ReuploadOutcome<FormPiece, FormAlias, FormOp>['kind']> {
    const sc = scopeOfKey(scopeKey);
    if (!sc || !slotHasSheet(scopeKey)) return 'first';
    const say = useSnackBarStore.getState().showMessage;
    const slotSig = scopeSig(scopeKey);
    const piecesNow = (): FormPiece[] =>
      ((getValues('pieces') ?? []) as NonNullable<TechCardFormData['pieces']>).map((p) => ({
        ...p,
        lineKey: p.lineKey ?? '',
        name: p.name ?? '',
      }));
    // Seam anchors hold a piece too: the card's saved rows and the optimistic ones in the store.
    const seamKeys = () => [
      ...seamAnchorKeys(cardRead?.seams),
      ...seamAnchorKeys(rowsOf(useSeamsStore.getState())),
      ...seamAnchorKeys(posesOf(useSeamsStore.getState())),
    ];
    const refsNow = () =>
      externalPieceRefs(piecesNow(), cardRead?.colorways, cardRead?.pieceAreaScopes, seamKeys());
    // All seams feed the delete cascade; the confirmed subset is what reconcile re-measures on a
    // reshaped piece. The store owns saved + optimistic rows once it holds this card.
    const seamsNow = (): TechCardSeamWire[] => {
      const st = useSeamsStore.getState();
      // Pose rows (P8) too: a pose of a deleted piece goes with it, as its seams do.
      return techCardId && st.cardId === techCardId
        ? [...rowsOf(st), ...posesOf(st)].map(toWire)
        : ((cardRead?.seams ?? []) as TechCardSeamWire[]);
    };
    const reconcileSeams = (rows: TechCardSeamWire[]) =>
      rows.filter((r) => r.status === 'TECH_CARD_SEAM_STATUS_CONFIRMED');
    const canonicalSeams = (rows: TechCardSeamWire[]) =>
      [...rows].sort((a, b) => {
        const ak = a.seamKey ?? '';
        const bk = b.seamKey ?? '';
        return ak < bk ? -1 : ak > bk ? 1 : 0;
      });
    const allSeams = canonicalSeams(seamsNow());
    const seams = reconcileSeams(allSeams);
    /*
     * EVERYTHING the plan is made from. The files are read for seconds; if any of it moved meanwhile
     * (a row rebound to another material, a sheet added to the slot, the BOM re-sorted, a step, seam
     * or piece edited), the plan belongs to another card and is not applied.
     */
    const inputsSig = (seamRows = canonicalSeams(seamsNow())) => {
      const rows = (getValues('patterns') ?? []) as PatternRow[];
      return JSON.stringify([
        getValues('pieces') ?? [],
        getValues('pieceDxfAliases') ?? [],
        getValues('operations') ?? [],
        getValues('baseSampleSizeId') ?? 0,
        (getValues('issues') ?? []).map((i) => i.operationNumber ?? 0),
        rows.map((r) => [
          sheetRowId(r),
          r.url ?? '',
          r.fabricPurpose ?? '',
          r.bomLineKey ?? '',
          r.sha256 ?? '',
        ]),
        (getValues('bomItems') ?? []).map((b) => [
          b.lineKey ?? '',
          b.purpose ?? '',
          b.section ?? '',
        ]),
        refsNow(),
        seamRows,
      ]);
    };
    const before = inputsSig(allSeams);
    const pieces = piecesNow();
    let out: ReuploadOutcome<FormPiece, FormAlias, FormOp>;
    const deps = reuploadDeps(scopeKey, picked.type);
    beginReupload(scopeKey, target);
    bumpUploading(scopeKey, 1);
    try {
      out = await reuploadSheet(
        {
          patterns: (getValues('patterns') ?? []) as PatternRow[],
          pieces,
          aliases: (getValues('pieceDxfAliases') ?? []) as FormAlias[],
          operations: (getValues('operations') ?? []) as FormOp[],
          issues: getValues('issues') ?? [],
          scopeKey,
          scope: bindingForScope(sc),
          scopeOf: liveScopeOf,
          isDxf: (url) => isDxfUrl(url),
          sizeTokens: [...dictTokens.keys()],
          preferredSizeTokens: sizeTokensOf(
            sizeById.get(Number(getValues('baseSampleSizeId') ?? 0)),
          ),
          externalRefs: refsNow(),
          seams,
          target,
          planDelete: (rowId, knownBlocks) => {
            const plan = deletePlan(rowId, knownBlocks);
            return plan.kind === 'cascade' ? plan : null;
          },
        },
        { name: picked.name, bytes: new Uint8Array(await picked.arrayBuffer()) },
        deps,
      );
    } catch (e) {
      console.error('DXF re-upload failed', e);
      out = { kind: 'refused', why: 'parse' };
    } finally {
      bumpUploading(scopeKey, -1);
      endReupload(scopeKey);
    }
    if (out.kind === 'first') return 'first';
    if (out.kind === 'noop') {
      const unchanged = ((getValues('patterns') ?? []) as PatternRow[])[out.rowIndex];
      if (unchanged) {
        const key = feedbackKey(unchanged);
        setReuploadFeedback((all) => {
          const previous = all[key];
          return {
            ...all,
            [key]: {
              kind: 'noop',
              version: previous?.version,
              uploadedAt: previous?.uploadedAt,
            },
          };
        });
      }
      say('same file', 'success');
      return 'noop';
    }
    if (out.kind === 'refused') {
      say(REFUSAL_WORDS[out.why], 'error');
      return 'refused';
    }
    // The occupied-slot choice was already explicit. A foreign drawing therefore follows its
    // replacement cascade directly; there is no path that can append it as another active row.
    if (out.kind === 'foreign') {
      if (!slotSig || scopeSig(scopeKey) !== slotSig) {
        say('material changed', 'error');
        return 'refused';
      }
      const applied = await commitForeignReplacement({
        scopeKey,
        picked,
        outcome: out,
        // Same cascade inputs AND the same slot (its lines): chooseForeign asks before and after
        // its deferred upload.
        current: () => inputsSig() === before && scopeSig(scopeKey) === slotSig,
        upload: deps.upload,
      });
      return applied ? 'applied' : 'refused';
    }
    if (out.kind === 'match') {
      const live = (getValues('patterns') ?? []) as PatternRow[];
      const i = live.findIndex((row) => sheetRowId(row) === out.rowId);
      const row = i >= 0 ? live[i] : undefined;
      if (
        !row ||
        row.url !== out.replacedUrl ||
        liveScopeOf(row, 'sheet') !== scopeKey ||
        inputsSig() !== before
      ) {
        say('not applied', 'error');
        return 'refused';
      }
      const files = live.flatMap((candidate) => {
        if (!candidate.url || !isDxfUrl(candidate.url)) return [];
        if (liveScopeOf(candidate, 'sheet') !== scopeKey) return [];
        const shown =
          sheetRowId(candidate) === out.rowId ? { ...candidate, ...out.row } : candidate;
        return [{ name: patternSheetName(shown), url: shown.url! }];
      });
      setMatching({
        scope: sc,
        fabricName: scopeLabel(sc),
        files,
        replacement: {
          scopeKey,
          rowId: out.rowId,
          replacedUrl: out.replacedUrl,
          row: out.row,
        },
      });
      return 'match';
    }
    // The target row by its identity, still holding the sheet the plan replaced, still in this slot.
    const live = (getValues('patterns') ?? []) as PatternRow[];
    const rowId = out.rowId;
    const i = live.findIndex((r) => sheetRowId(r) === rowId);
    const row = i >= 0 ? live[i] : undefined;
    if (
      !row ||
      row.url !== out.replacedUrl ||
      liveScopeOf(row, 'sheet') !== scopeKey ||
      inputsSig() !== before
    ) {
      say('not applied', 'error');
      return 'refused';
    }
    setValue('pieces', out.pieces, { shouldDirty: true });
    setValue('pieceDxfAliases', out.aliases, { shouldDirty: true });
    setValue('operations', out.operations, { shouldDirty: true });
    // Preservation apply keeps operation indexes stable, so issue references stay on their steps.
    const issueNumbers = out.issueNumbers;
    (getValues('issues') ?? []).forEach((iss, ii) => {
      const next = issueNumbers[ii];
      if (next != null && next !== (iss.operationNumber ?? 0))
        setValue(`issues.${ii}.operationNumber`, next, { shouldDirty: true });
    });
    setValue(`patterns.${i}.url`, out.row.url, { shouldDirty: true });
    setValue(`patterns.${i}.filename`, out.row.filename, { shouldDirty: true });
    const nextName = followedName(row, out.row.filename);
    if (nextName != null) setValue(`patterns.${i}.name`, nextName, { shouldDirty: true });
    setValue(`patterns.${i}.sizeBytes`, out.row.sizeBytes, { shouldDirty: true });
    setValue(`patterns.${i}.sha256`, out.row.sha256, { shouldDirty: true });
    // 0 = "assign one": the server numbers a url it has not seen on this card.
    setValue(`patterns.${i}.version`, 0, { shouldDirty: true });
    setValue(`patterns.${i}.uploadedAt`, '', { shouldDirty: true });
    // The save whose payload carries this new sheet url carries the snapshot reason (index.tsx).
    armReuploadSnapshot(techCardId, out.row.url, out.replacedUrl);
    // The areas of the new geometry are measured once the save lands, even if the marks jump away
    // from this tab (useAutoPieceAreas otherwise waits for the tab).
    setAreasArmed(true);
    setReuploadFeedback((all) => ({
      ...all,
      [feedbackKey(row, out.row.url)]: {
        kind: 'applied',
        version: nextRevision(row),
        uploadedAt: new Date().toISOString(),
        added: out.result.addedPieceKeys.length,
        reshaped: out.result.reshapedPieceKeys.length,
        removed: out.result.removedPieceKeys.length,
        marked: new Set(out.result.reviews.map((review) => review.opIndex)).size,
      },
    }));
    autosave.request('dxf-reupload');
    return 'applied';
  }

  const restoreRef = useRef<(rev: SheetRevisionRef) => Promise<RestoreOutcome>>(
    async () => 'unavailable',
  );
  // RESTORE THE CARD SNAPSHOT of that version: the card comes back whole (pieces, steps, sheet), no
  // marks, no jump. The card is then re-read through GetTechCard (the restore answer has no
  // pattern_viewer_token); index.tsx judges that read — a pristine form is rebased onto it, unsaved
  // body work stops at its conflict dialog. A version without a snapshot is not restorable (L4c):
  // re-applying its file brought ghosts back as new pieces.
  async function restoreSnapshot(snapshotId: number): Promise<RestoreOutcome> {
    if (!techCardId) return 'unavailable';
    const stored =
      queryClient.getQueryData<common_TechCard>(techCardKeys.detail(techCardId)) ?? cardRead;
    try {
      const restored = await adminService.RestoreTechCardSnapshot({
        techCardId,
        snapshotId,
        expectedLockVersion: stored?.lockVersion ?? 0,
      });
      noteSheetRestore(techCardId, restored.techCard?.updatedAt);
    } catch (e) {
      console.error('snapshot restore failed', e);
      const said = e instanceof Error ? e.message.trim() : '';
      useSnackBarStore.getState().showMessage(said || 'not restored', 'error');
      return 'refused';
    }
    await queryClient.invalidateQueries({ queryKey: techCardKeys.detail(techCardId) });
    return 'applied';
  }
  restoreRef.current = async (rev) =>
    (rev.snapshotId ?? 0) > 0 ? restoreSnapshot(rev.snapshotId ?? 0) : 'unavailable';
  useEffect(() => provideSheetRestorer((rev) => restoreRef.current(rev)), []);

  // The target row is a non-DXF sheet (a legacy PDF) of this slot: its file is swapped in place —
  // no reconcile, no marks; the DXF then takes the first-upload path (units, sizes, pieces).
  const plainSwapIndex = (scopeKey: string, target?: string) => {
    const want = (target ?? '').trim();
    if (!want) return -1;
    return ((getValues('patterns') ?? []) as PatternRow[]).findIndex(
      (r) => sheetRowId(r) === want && !isDxfUrl(r.url) && liveScopeOf(r, 'sheet') === scopeKey,
    );
  };

  const isInterliningScopeKey = (scopeKey: string) =>
    scopeOfKey(scopeKey)?.lines.some(
      (line) => line.section === 'TECH_CARD_BOM_SECTION_INTERLINING',
    ) ?? false;

  // An owner interlining revision keeps the row and every scoped alias intact. The generic
  // re-upload reconciler is intentionally bypassed: it is allowed to create/delete cut pieces,
  // while an interlining drawing may only map onto pieces that the main sheet already owns.
  async function replaceInterliningOwnerSheet(
    scopeKey: string,
    picked: File,
    faults: FileFault[],
    target?: string,
  ): Promise<boolean | null> {
    if (!isInterliningScopeKey(scopeKey)) return null;
    const rows = (getValues('patterns') ?? []) as PatternRow[];
    const owners = rows.filter(
      (row) =>
        isDxfUrl(row.url) && liveScopeOf(row, 'sheet') === scopeKey && !isGeneratedFusingRow(row),
    );
    const wanted = (target ?? '').trim();
    const owner =
      (wanted ? owners.find((row) => sheetRowId(row) === wanted) : undefined) ?? owners[0];
    if (!owner) return null;
    const rowId = sheetRowId(owner);
    beginReupload(scopeKey, rowId);
    bumpUploading(scopeKey, 1);
    try {
      const up = await uploadPatternFile(picked, owner.name ?? '');
      const live = (getValues('patterns') ?? []) as PatternRow[];
      const at = live.findIndex((row) => sheetRowId(row) === rowId);
      if (at < 0 || liveScopeOf(live[at], 'sheet') !== scopeKey) {
        faults.push({ name: picked.name, why: 'material changed' });
        return false;
      }
      const replacedUrl = live[at].url ?? '';
      swapSheetFile(techCardId, writeDirty, at, replacedUrl, up);
      setAreasArmed(true);
      setPendingView({ scopeKey, urls: [up.url] });
      return true;
    } catch (error) {
      console.error('UploadPattern failed', error);
      faults.push({ name: picked.name, why: patternUploadErrorMessage(error) });
      return false;
    } finally {
      bumpUploading(scopeKey, -1);
      endReupload(scopeKey);
    }
  }

  async function uploadOne(
    scopeKey: string,
    picked: File,
    faults: FileFault[],
    target?: string,
  ): Promise<boolean> {
    // The slot is re-read after every await: re-sorted, merged or deleted meanwhile, it takes nothing.
    const sig = scopeSig(scopeKey);
    const moved = () => {
      if (sig && scopeSig(scopeKey) === sig) return false;
      faults.push({ name: picked.name, why: 'material changed' });
      return true;
    };
    if (moved()) return false;
    const swap = plainSwapIndex(scopeKey, target) >= 0;
    const interlining = swap
      ? null
      : await replaceInterliningOwnerSheet(scopeKey, picked, faults, target);
    if (interlining != null) return interlining;
    // The occupied-slot question was answered before this function: replace the chosen row.
    if (!swap && !isInterliningScopeKey(scopeKey)) {
      const outcome = await replaceSheet(scopeKey, picked, target);
      if (outcome !== 'first')
        return outcome === 'applied' || outcome === 'noop' || outcome === 'match';
    }
    if (moved()) return false;
    // Already asked on the way in; the merge output (files re-picked inside the merge) is not.
    const fixed = await withUnits([picked], faults);
    if (!fixed || moved()) return false;
    const sized = await withSizes(fixed[0], faults);
    if (!sized || moved()) return false;
    const file = sized.file;
    const bump = (d: number) => bumpUploading(scopeKey, d);
    bump(1);
    try {
      const up = await uploadPatternFile(file);
      if (moved()) return false;
      // The file's sizes become the range of a card that still has none; the autosave keeps it.
      if (sized.seed && ((getValues('sizeIds') ?? []) as number[]).length === 0)
        setValue('sizeIds', sized.seed, { shouldDirty: true });
      const storeAs = sized.sizeId ?? orderSizes((getValues('sizeIds') ?? []) as number[])[0] ?? 0;
      // Re-found after the upload: the rows may have moved while the file was in flight.
      const at = swap ? plainSwapIndex(scopeKey, target) : -1;
      if (at >= 0) {
        const replacedUrl = (getValues(`patterns.${at}.url`) as string | undefined) ?? '';
        // The save whose payload carries the new url archives the old file with a card snapshot.
        swapSheetFile(techCardId, writeDirty, at, replacedUrl, up, { sizeId: storeAs });
      } else
        append({
          sizeId: storeAs,
          lineKey: ulid(),
          ...up,
          name: autoName(scopeKey, file),
          ...bindingOf(scopeKey),
        });
      setPendingView({ scopeKey, urls: [up.url] });
      return true;
    } catch (e) {
      console.error('UploadPattern failed', e);
      faults.push({ name: file.name, why: patternUploadErrorMessage(e) });
      return false;
    } finally {
      bump(-1);
    }
  }

  // The file router: tile drop, tile click and a sheet row's «upload» all land here.
  //   1 DXF → direct upload → pieces; ≥2 DXF → size merge → upload → pieces;
  //   anything else → import wizard → apply → pieces.
  function routeFiles(
    scopeKey: string,
    list: FileList | File[] | null,
    target?: string,
    dxfOnly = false,
  ) {
    // Array.from, not spread — FileList iteration needs lib dom.iterable, which tsconfig omits.
    const files = list ? Array.from(list) : [];
    if (files.length === 0 || !canUpload || (uploadingRef.current[scopeKey] ?? 0) > 0) return;
    const hasRange = ((getValues('sizeIds') ?? []) as number[]).length > 0;
    const errOf = (f: File): string | null => {
      if (isDxfFile(f)) return patternFileError(f, { dxfOnly: true });
      if (dxfOnly) return 'DXF only';
      const ext = (f.name.match(/\.[^.]+$/)?.[0] ?? '').toLowerCase();
      if (!importOk || !IMPORT_EXT.has(ext)) return 'DXF only';
      // The import wizard lays the drawn sizes out on the card's range: it needs one.
      if (!hasRange) return 'no sizes yet';
      return f.size > MAX_PATTERN_BYTES ? 'too large, 40 MB at most' : null;
    };
    // The whole pick reports once: refusals and the upload's failure together.
    const errs = files.map(errOf);
    const faults: FileFault[] = files.flatMap((f, i) => {
      const why = errs[i];
      return why ? [{ name: f.name, why }] : [];
    });
    const good = files.filter((_, i) => !errs[i]);
    // The rest goes on to a dialog: say now what stayed out.
    const handOff = () => settleFileBatch(null, files.length, faults, 'accepted', 'refused');
    if (good.length === 0) return handOff();
    setSelectedKey(scopeKey);
    if (good.every(isDxfFile)) {
      const occupant = slotOccupant(scopeKey, target);
      if (occupant) {
        handOff();
        setOccupiedAsk({
          kind: 'files',
          scopeKey,
          files: good,
          target: sheetRowId(occupant),
        });
        return;
      }
      void (async () => {
        const ready = await withUnits(good, faults);
        if (ready && ready.length === 1) {
          await directUpload(scopeKey, ready[0], faults, target);
          settleFileBatch(null, files.length, faults);
          return;
        }
        handOff();
        if (ready) setMerging({ scopeKey, files: ready, target });
      })();
      return;
    }
    handOff();
    setImporting({ scopeKey, files: good });
  }

  async function chooseOccupiedFiles(
    ask: Extract<OccupiedAsk, { kind: 'files' }>,
    choice: OccupiedChoice,
  ) {
    setOccupiedAsk(null);
    const current = slotOccupant(ask.scopeKey, ask.target);
    if (!current || sheetRowId(current) !== ask.target) {
      useSnackBarStore.getState().showMessage('material changed', 'error');
      return;
    }
    if (choice === 'replace' && ask.files.length === 1) {
      await directUpload(ask.scopeKey, ask.files[0], undefined, ask.target);
      return;
    }

    const faults: FileFault[] = [];
    const dropped = await withUnits(ask.files, faults);
    if (!dropped) {
      settleFileBatch(null, ask.files.length, faults);
      return;
    }
    let existing = dropped[0];
    if (choice === 'merge') {
      try {
        const loaded = await occupiedDxf(ask.scopeKey, ask.target);
        if (!loaded) {
          useSnackBarStore.getState().showMessage('DXF only', 'error');
          return;
        }
        existing = loaded;
      } catch (error) {
        console.error('Occupied DXF download failed', error);
        useSnackBarStore.getState().showMessage('download failed', 'error');
        return;
      }
    }
    const plan = planOccupiedFiles(existing, dropped, choice);
    if (!plan.merge) {
      await directUpload(ask.scopeKey, plan.files[0], undefined, ask.target);
      return;
    }
    setMerging({ scopeKey: ask.scopeKey, files: plan.files, target: ask.target });
  }

  // Sheets already on the card that the parser read with guessed units.
  const guessedNames = useMemo(
    () =>
      new Set(
        (geometry.data?.warnings ?? [])
          .filter((w) => w.includes(UNITS_GUESS))
          .map((w) => w.slice(0, w.indexOf(UNITS_GUESS))),
      ),
    [geometry.data],
  );
  const unitless = dxfEntries.filter((e) => guessedNames.has(patternSheetName(e.row)));

  // `set units` on existing sheets: download, ask, rewrite $INSUNITS, upload as a new file and swap
  // url/filename/size on the SAME row (lineKey, name, binding kept — aliases and pieces stay).
  async function setUnitsOfExisting() {
    if (unitsFetching || unitless.length === 0) return;
    setUnitsFetching(true);
    const rows = unitless.map((e) => e.row);
    const got = await Promise.allSettled(
      rows.map(async (r) => unitlessText(await fetchMediaBlob(r.url!))),
    );
    setUnitsFetching(false);
    // Download and upload failures of the run report once, at its end.
    const faults: FileFault[] = [];
    const ready = rows.flatMap((row, i) => {
      const g = got[i];
      if (g.status === 'rejected') {
        faults.push({ name: labelOf(row), why: 'download failed' });
        return [];
      }
      return g.value != null ? [{ row, text: g.value }] : [];
    });
    const total = ready.length + faults.length;
    if (ready.length === 0) return settleFileBatch(null, total, faults, 'set');
    setUnitsAsk({
      items: ready.map(({ row, text }) => ({
        key: row.url!,
        name: labelOf(row),
        extents: drawingExtents(text),
      })),
      cancel: () => {
        setUnitsAsk(null);
        if (faults.length) settleFileBatch(null, total, faults, 'set');
      },
      confirm: async (units) => {
        // N sheets go up one by one: one job, ticked in place.
        const job =
          ready.length > 1
            ? notify({
                sev: 'job',
                subject: 'PATTERNS',
                text: `setting units 0 of ${ready.length}`,
                progress: 0,
              })
            : null;
        let step = 0;
        for (const { row, text } of ready) {
          if (job) {
            updateNotify(job, {
              text: `setting units ${step} of ${ready.length}`,
              progress: step / ready.length,
            });
          }
          step += 1;
          try {
            const file = fileWithUnits(
              text,
              units[row.url!] ?? 'mm',
              row.filename || 'pattern.dxf',
              'image/vnd.dxf',
            );
            const up = await uploadPatternFile(file, row.name ?? '');
            const live = (getValues('patterns') ?? []) as PatternRow[];
            const i = live.findIndex((r) => r.url === row.url);
            // Removed or replaced meanwhile: the new file is not forced onto another row.
            if (i < 0) continue;
            // The save whose payload carries the new url archives the old file with a card snapshot.
            swapSheetFile(techCardId, writeDirty, i, row.url, up);
          } catch (e) {
            console.error('UploadPattern failed', e);
            faults.push({ name: labelOf(row), why: patternUploadErrorMessage(e) });
          }
        }
        setUnitsAsk(null);
        settleFileBatch(job, total, faults, 'set');
      },
    });
  }

  // ИНДЕКС РАЗМЕРОВ (Ф6.3) — публикуется САМ, следом за разбором.
  //
  // Разбор DXF живёт только в браузере, и без этой записи серверный гейт готовности прогона не
  // может ответить «есть ли выкройка на размер L» — он читает UNKNOWN. Пока разбор запускала
  // кнопка, публикация была её продолжением; кнопки нет, а вопрос остался, поэтому запись едет за
  // тем же ответом, который панель уже показала.
  //
  // ОДИН РАЗ НА НАБОР. Ключ попытки — отметка чтения карточки + скоуп + подпись листов + токены,
  // и он ставится ДО await: эффект перезапускается на каждое изменение формы (`scopeGroups`
  // пересобирается от любого нажатия клавиши), и без этого фонового «уже отправляли» карточка
  // получала бы по запросу на символ.
  //
  // ПОСЛЕДОВАТЕЛЬНО по скоупам: каждый публикует свой индекс отдельным запросом, а пять
  // одновременных записей в одну карточку — это гонка за один и тот же ряд. Оборванный цикл
  // (правка формы сменила зависимости) досылает оставшиеся скоупы следующим заходом — их ключи не
  // отмечены. Ключ уже улетевшего запроса при этом НЕ снимается: снять его значило бы слать тот же
  // PUT заново на каждый символ, набранный поверх идущей записи.
  //
  // Успех молчит. Оператор разбора не заказывал — он открыл вкладку, — и тост про удавшуюся
  // фоновую запись был бы отчётом о работе, о которой не спрашивали; ответ, за которым сюда
  // пришли, стоит на плитках. Отказ пишется строкой под шапкой: «сохраните карточку» — это
  // руководство к действию, а не отчёт.
  //
  // Запись по ключу хранит ОБЕЩАНИЕ, а не галку (MF-C): замер после импорта публикует индекс своих
  // скоупов сам, следом за площадями, и обязан не дублировать уже улетевший PUT, а дождаться его.
  // Пока его работа открыта, этот эффект её скоупы пропускает — порядок «сохранение → площади →
  // индекс» держит она.
  const publishedRef = useRef<Map<string, Promise<PublishSizeIndexResult>>>(new Map());
  // A10 (Codex r5 #3): rows an import wrote whose save was not confirmed — a retry saves them
  const importUnsaved = useRef(false);
  const recordIndex = (sig: string, res: PublishSizeIndexResult) =>
    setIndexFailures((f) => {
      if (res.ok) {
        if (!(sig in f)) return f;
        const { [sig]: _dropped, ...rest } = f;
        return rest;
      }
      return f[sig] === res.reason ? f : { ...f, [sig]: res.reason };
    });
  const indexOnce = (
    g: (typeof scopeGroups)[number],
    force = false,
  ):
    | { sig: string; run: Promise<PublishSizeIndexResult>; fresh: boolean }
    | { sig: string; skip: string } => {
    const sig = sigOf(g.entries);
    const a = audits[sig];
    if (!techCardId) return { sig, skip: "the card isn't saved yet" };
    if (a?.phase !== 'ready') return { sig, skip: 'the sheets of this fabric are not parsed yet' };
    const tokens = [...a.found];
    const key = `${cardReadAt}|${g.scope.key}|${sig}|${[...tokens].sort().join(',')}`;
    const had = publishedRef.current.get(key);
    if (had && !force) return { sig, run: had, fresh: false };
    const run = publishPatternSizeIndex({
      techCardId,
      scopeKey: serverKeyOfScope(g.scope),
      sheets: g.entries.map((e) => ({
        lineKey: e.row.lineKey,
        fabricPurpose: e.row.fabricPurpose,
        bomLineKey: e.row.bomLineKey,
      })),
      sizeTokens: tokens,
    });
    publishedRef.current.set(key, run);
    return { sig, run, fresh: true };
  };
  // Публикация индекса одного скоупа для замера после импорта: тот же ключ, та же запись отказа.
  const publishIndexForRef = useRef<
    (scopeKey: string, force: boolean) => Promise<PublishSizeIndexResult>
  >(async () => ({ ok: false, reason: 'not ready' }));
  publishIndexForRef.current = async (scopeKey, force) => {
    if (!canPublishIndex) return { ok: false, reason: 'publishing is not allowed on this card' };
    const g = scopeGroups.find((x) => x.scope.key === scopeKey);
    if (!g || g.entries.length === 0) return { ok: false, reason: 'no DXF sheet in this fabric' };
    const o = indexOnce(g, force);
    if ('skip' in o) return { ok: false, reason: o.skip };
    const res = await o.run;
    recordIndex(o.sig, res);
    return res;
  };
  const followUpScopes = useMemo(
    () =>
      new Set(
        followUp && followUpPending(followUp.rows) ? followUp.rows.map((r) => r.scopeKey) : [],
      ),
    [followUp],
  );
  useEffect(() => {
    if (!canPublishIndex || !techCardId || !bundle) return;
    let cancelled = false;
    (async () => {
      for (const g of scopeGroups) {
        if (g.entries.length === 0) continue;
        if (followUpScopes.has(g.scope.key)) continue;
        const o = indexOnce(g);
        if ('skip' in o || !o.fresh) continue;
        const res = await o.run;
        if (cancelled) return;
        recordIndex(o.sig, res);
      }
    })();
    return () => {
      cancelled = true;
    };
    // indexOnce/recordIndex read this render's audits/scopeGroups — exactly the deps below
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canPublishIndex, techCardId, bundle, audits, scopeGroups, cardReadAt, followUpScopes]);

  // Pieces of the card: UNI prefill and automatic area measurement (no button, no dialog).
  useUniPrefill();
  const areaRefusals = useAutoPieceAreas({
    techCardId,
    enabled: (active || areasArmed) && canEdit && canPublishIndex && !!techCardId,
  });

  const openPieces = (g: (typeof scopeGroups)[number]) => {
    const interlining = g.scope.lines.some(
      (line) => line.section === 'TECH_CARD_BOM_SECTION_INTERLINING',
    );
    const ownerEntries = interlining
      ? g.entries.filter((entry) => !isGeneratedFusingRow(entry.row))
      : [];
    // Owner drawings are the editable source of truth when present. A generated-only slot still
    // has a real sheet to inspect: filtering generated rows unconditionally passed [] to the
    // parser, leaving the PIECES · INTERLINING modal as a header and footer with no body.
    const entries = interlining && ownerEntries.length > 0 ? ownerEntries : g.entries;
    setMatching({ scope: g.scope, fabricName: scopeLabel(g.scope), files: filesOf(entries) });
  };

  const closePieces = (applied = false, result?: PieceMatchApplyResult) => {
    const beginFeedback = () => {
      if (!matching || !result?.fusingTouched) return;
      setPieceSaveFeedback((current) => {
        const sameMaterial = current?.materialScopeKey === matching.scope.key;
        const sameInterlining = current?.interliningLineKeys.some((lineKey) =>
          result.fusingBomLineKeys.includes(lineKey),
        );
        return {
          materialScopeKey: matching.scope.key,
          interliningLineKeys: result.fusingBomLineKeys,
          baselineSavedAt: autosave.lastSavedAt,
          generationBaselineRun: getFusingSheetGenerationState(techCardId).run,
          save:
            sameMaterial && current?.save.phase === 'error' ? current.save : { phase: 'saving' },
          generation:
            sameInterlining && current?.generation.phase === 'error'
              ? current.generation
              : { phase: 'generating' },
        };
      });
    };
    const replacement = matching?.replacement;
    if (!applied || !replacement) {
      if (applied) beginFeedback();
      setMatching(null);
      return;
    }
    const live = (getValues('patterns') ?? []) as PatternRow[];
    const at = live.findIndex((row) => sheetRowId(row) === replacement.rowId);
    const target = at >= 0 ? live[at] : undefined;
    if (
      !target ||
      target.url !== replacement.replacedUrl ||
      liveScopeOf(target, 'sheet') !== replacement.scopeKey
    ) {
      useSnackBarStore.getState().showMessage('not applied', 'error');
      setMatching(null);
      return;
    }
    const keep = { shouldDirty: true };
    setValue(`patterns.${at}.url`, replacement.row.url, keep);
    setValue(`patterns.${at}.filename`, replacement.row.filename, keep);
    const nextName = followedName(target, replacement.row.filename);
    if (nextName != null) setValue(`patterns.${at}.name`, nextName, keep);
    setValue(`patterns.${at}.sizeBytes`, replacement.row.sizeBytes, keep);
    setValue(`patterns.${at}.sha256`, replacement.row.sha256, keep);
    setValue(`patterns.${at}.version`, 0, keep);
    setValue(`patterns.${at}.uploadedAt`, '', keep);
    armReuploadSnapshot(techCardId, replacement.row.url, replacement.replacedUrl);
    setAreasArmed(true);
    beginFeedback();
    setMatching(null);
    autosave.request('dxf-reupload');
  };

  const matchingInterlining = useMemo(() => {
    if (!matching) return undefined;
    const slot = matching.scope.lines.find(
      (line) => line.section === 'TECH_CARD_BOM_SECTION_INTERLINING',
    );
    if (!slot?.lineKey) return undefined;
    return {
      slotLineKey: slot.lineKey,
      mainBlocks: mainPatternBlocks,
      mainAliases: mainPatternAliases,
      skippedIdentityKeys: readInterliningSkips(techCardId, slot.lineKey),
      onReview: (skippedIdentities: ReadonlySet<string>) => {
        writeInterliningSkips(techCardId, slot.lineKey, skippedIdentities);
        setInterliningSkipsRevision((revision) => revision + 1);
      },
    };
  }, [matching, mainPatternBlocks, mainPatternAliases, techCardId]);

  // A sheet just landed: open the pieces viewer once the form rows carry its url, so the viewer
  // reads the new file together with the slot's other sheets.
  useEffect(() => {
    if (!pendingView) return;
    const g = scopeGroups.find((x) => x.scope.key === pendingView.scopeKey);
    if (!g) {
      setPendingView(null);
      return;
    }
    const have = new Set(g.entries.map((e) => e.row.url));
    if (g.entries.length === 0 || !pendingView.urls.every((u) => have.has(u))) return;
    setPendingView(null);
    setSelectedKey(g.scope.key);
    openPieces(g);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingView, scopeGroups]);

  function commitRename(index: number, value: string) {
    // The field starts with the shown label: committing it unchanged writes nothing.
    const row = ((getValues('patterns') ?? []) as PatternRow[])[index];
    if (row && value === labelOf(row)) {
      setEditing(null);
      return;
    }
    // '' is a legal committed value — it clears the name and the row falls back to the
    // filename (the save path still sends name explicitly, so the clear reaches the server).
    // setValue on the nested path, NOT useFieldArray.update: update() replaces the whole
    // row from the stale `fields` snapshot, reverting sibling fields written by other
    // controls, and remounts the row. Byte-clamped — the server counts UTF-8 bytes.
    setValue(`patterns.${index}.name`, clampPatternName(value), { shouldDirty: true });
    setEditing(null);
  }

  // Применение импорта + запуск замера после него (MF-C, M3). Замер стартует ТОЛЬКО на сохранении
  // 'ok' и только если применение что-то записало: повторное применение того же импорта остаётся
  // нулевым (F7).
  const importScopeRef = useRef('');
  importScopeRef.current = importing?.scopeKey ?? '';
  function followUpApply(apply: ApplyDraftFn): ApplyDraftFn {
    return async (draft, onProgress) => {
      const result = await apply(draft, onProgress);
      const targets = followUpTargets(draft, result);
      if (result.ok) {
        // After an apply the pieces viewer of the slot opens by itself: the dropped-on slot when
        // the import wrote into it, else the first slot it wrote.
        const keys = draft.scopes.map((sc) => sc.target.scopeKey);
        const aimed = importScopeRef.current;
        const k = keys.includes(aimed) ? aimed : keys[0];
        if (k) {
          setImporting(null);
          setPendingView({
            scopeKey: k,
            urls: [
              ...result.uploaded.filter((u) => u.scopeKey === k).map((u) => u.url),
              ...(result.replaced ?? []).filter((r) => r.scopeKey === k).map((r) => r.newUrl),
            ],
          });
        }
      }
      if (targets && result.ok) {
        const urls = [
          ...result.uploaded.map((u) => u.url),
          ...draft.scopes.flatMap((sc) => (sc.alreadyOnCard ? [sc.alreadyOnCard.url] : [])),
        ];
        setFollowUp({ id: Date.now(), rows: initialRows(targets), urls, nonce: 0 });
      }
      return result;
    };
  }
  function retryFollowUp(only?: { scopeKey?: string; step?: FollowUpStep }) {
    setFollowUp((j) => (j ? { ...j, rows: retryRows(j.rows, only), nonce: j.nonce + 1 } : j));
  }

  // History → versions of one sheet. Restore goes through restoreSheetVersion: the card snapshot of
  // that version only — a version without one has no `restore`.
  // DELETE A SHEET (L6b). A DXF row takes its pieces, the steps that hold them and every step
  // downstream with it (removeSheetCascade); issues on removed steps go to 0, as when a step is
  // deleted in the editor. Colourway / area refs are left as they are — the server says its words.
  // The save without this sheet's url carries snapshot reason 'dxf-delete': restore undoes it.
  const blockNamesByUrl = useMemo(() => {
    const m = new Map<string, Set<string>>();
    if (!bundle?.urlByFile) return m;
    for (const p of bundle.pieces) {
      const url = bundle.urlByFile.get(p.fileIndex ?? -1);
      const name = (p.blockName ?? '').trim();
      if (!url || !name) continue;
      const set = m.get(url) ?? new Set<string>();
      set.add(name);
      m.set(url, set);
    }
    return m;
  }, [bundle]);

  const deletePlan = (
    rowId: string,
    knownBlocks: ReadonlyMap<string, readonly string[]> = new Map(),
  ) => {
    const pieces = ((getValues('pieces') ?? []) as NonNullable<TechCardFormData['pieces']>).map(
      (p) => ({ ...p, lineKey: p.lineKey ?? '', name: p.name ?? '' }),
    ) as FormPiece[];
    const st = useSeamsStore.getState();
    const seams =
      techCardId && st.cardId === techCardId
        ? [...rowsOf(st), ...posesOf(st)].map(toWire)
        : ((cardRead?.seams ?? []) as TechCardSeamWire[]);
    const refs = [
      ...(cardRead?.colorways ?? []).flatMap((c) =>
        (c.usages ?? []).map((u) => ({ kind: 'colourway', pieceLineKey: u.pieceLineKey })),
      ),
      ...(cardRead?.pieceAreaScopes ?? []).flatMap((sc) =>
        (sc.areas ?? []).map((a) => ({ kind: 'area', pieceLineKey: a.pieceLineKey })),
      ),
    ];
    return planSheetDelete(
      {
        patterns: (getValues('patterns') ?? []) as PatternRow[],
        pieces,
        aliases: (getValues('pieceDxfAliases') ?? []) as FormAlias[],
        operations: (getValues('operations') ?? []) as FormOp[],
        issues: getValues('issues') ?? [],
        seams,
        refs,
        scopeOf: liveScopeOf,
        isDxf: (url) => isDxfUrl(url),
        sizeTokens: [...dictTokens.keys()],
        blockNamesOf: (url) => {
          const known = knownBlocks.get(url);
          if (known) return known;
          const set = blockNamesByUrl.get(url);
          return set ? [...set] : null;
        },
      },
      rowId,
    );
  };

  // × on a row asks first; a DXF sheet's cascade says what goes with it.
  function askRemove(row: PatternRow, index: number) {
    if (!isDxfUrl(row.url)) {
      setDeleting({ rowId: `#${index}`, name: labelOf(row), counts: null });
      return;
    }
    const rowId = sheetRowId(row);
    const plan = deletePlan(rowId);
    if (plan.kind === 'missing') return;
    setDeleting({
      rowId,
      name: labelOf(row),
      counts: plan.kind === 'cascade' ? plan.counts : null,
    });
  }

  async function deleteSeamsOnServer(cardId: number, seamKeys: string[]): Promise<boolean> {
    let res: Awaited<ReturnType<typeof adminService.DeleteTechCardSeams>>;
    try {
      res = await adminService.DeleteTechCardSeams({ techCardId: cardId, seamKeys });
    } catch (e) {
      console.error('seams of a deleted sheet not removed', e);
      armSeamDeleteRetry(cardId, seamKeys);
      lastSeamRetrySave.current = { cardId, at: autosaveRef.current.lastSavedAt };
      useSnackBarStore.getState().showMessage('seams not deleted', 'error');
      return false;
    }
    consumeSeamDeleteRetry(cardId, seamKeys);
    if (useSeamsStore.getState().cardId === cardId)
      hydrateSeams(cardId, (res.seams ?? []) as TechCardSeamWire[]);
    await queryClient.invalidateQueries({ queryKey: techCardKeys.detail(cardId) });
    return true;
  }

  // Shared by row deletion and a confirmed foreign replacement: one writer for pieces, aliases,
  // steps and issue remapping. The caller decides whether the row is removed or swapped in place.
  function applySheetCascade(
    plan: Pick<
      ReuploadDeletePlan<FormPiece, FormAlias, FormOp>,
      'pieces' | 'aliases' | 'operations' | 'issueNumbers'
    >,
  ) {
    setValue('pieces', plan.pieces, { shouldDirty: true });
    setValue('pieceDxfAliases', plan.aliases, { shouldDirty: true });
    setValue('operations', plan.operations, { shouldDirty: true });
    (getValues('issues') ?? []).forEach((iss, ii) => {
      const next = plan.issueNumbers[ii];
      if (next != null && next !== (iss.operationNumber ?? 0))
        setValue(`issues.${ii}.operationNumber`, next, { shouldDirty: true });
    });
  }

  async function commitForeignReplacement(ask: ForeignPending): Promise<boolean> {
    const say = useSnackBarStore.getState().showMessage;
    if (!ask.current()) {
      say('not applied', 'error');
      return false;
    }
    undoHistory.cut('dxf-reupload');

    let uploaded: Awaited<ReturnType<typeof uploadForeignSheet<FormPiece, FormAlias, FormOp>>>;
    beginReupload(ask.scopeKey, ask.outcome.rowId);
    bumpUploading(ask.scopeKey, 1);
    try {
      uploaded = await uploadForeignSheet(ask.outcome, ask.upload);
    } catch (e) {
      console.error('Foreign DXF upload failed', e);
      say('upload failed', 'error');
      return false;
    } finally {
      bumpUploading(ask.scopeKey, -1);
      endReupload(ask.scopeKey);
    }

    // An edit made while the upload was in flight invalidates the captured cascade. The uploaded
    // blob is then an orphan, but the form is left intact rather than applying an old plan.
    if (!ask.current()) {
      say('not applied', 'error');
      return false;
    }
    const plan = planForeignReplacement(ask.outcome, uploaded);
    const live = (getValues('patterns') ?? []) as PatternRow[];
    const at = live.findIndex((r) => sheetRowId(r) === ask.outcome.rowId);
    const target = at >= 0 ? live[at] : undefined;
    if (
      !target ||
      target.url !== ask.outcome.replacedUrl ||
      liveScopeOf(target, 'sheet') !== ask.scopeKey
    ) {
      say('not applied', 'error');
      return false;
    }

    applySheetCascade(plan);
    const keep = { shouldDirty: true };
    setValue(`patterns.${at}.url`, plan.row.url, keep);
    setValue(`patterns.${at}.filename`, plan.row.filename, keep);
    const nextName = followedName(target, plan.row.filename);
    if (nextName != null) setValue(`patterns.${at}.name`, nextName, keep);
    setValue(`patterns.${at}.sizeBytes`, plan.row.sizeBytes, keep);
    setValue(`patterns.${at}.sha256`, plan.row.sha256, keep);
    setValue(`patterns.${at}.version`, 0, keep);
    setValue(`patterns.${at}.uploadedAt`, '', keep);
    armReuploadSnapshot(techCardId, plan.row.url, plan.replacedUrl);
    setAreasArmed(true);
    // This is the established first-upload hand-off: the shared pieces viewer creates and links
    // the new file's pieces after the old sheet's graph has been removed.
    setPendingView({ scopeKey: ask.scopeKey, urls: [plan.row.url] });
    setReuploadFeedback((all) => ({
      ...all,
      [feedbackKey(target, plan.row.url)]: {
        kind: 'applied',
        version: nextRevision(target),
        uploadedAt: new Date().toISOString(),
        added: 0,
        reshaped: 0,
        removed: ask.outcome.loss.pieces,
        marked: 0,
      },
    }));
    say('replaced', 'success');
    if (!techCardId || plan.removedSeamIds.length === 0) {
      autosave.request('dxf-reupload');
      return true;
    }
    const saved = await autosave.flush('dxf-reupload');
    if (saved !== 'ok' && saved !== 'nothing') return false;
    await deleteSeamsOnServer(techCardId, plan.removedSeamIds);
    return true;
  }

  async function confirmDelete(rowId: string) {
    undoHistory.cut('dxf-delete');
    // A non-DXF row: by its index, as the old × did.
    if (rowId.startsWith('#')) {
      const at = Number(rowId.slice(1));
      if (Number.isInteger(at) && at >= 0) remove(at);
      return;
    }
    const plan = deletePlan(rowId);
    if (plan.kind === 'missing') return;
    if (plan.kind === 'plain') {
      remove(plan.rowIndex);
      return;
    }
    applySheetCascade(plan);
    remove(plan.rowIndex);
    armDeleteSnapshot(techCardId, plan.rowUrl);
    if (!techCardId || plan.removedSeamIds.length === 0) {
      autosave.request('dxf-delete');
      return;
    }
    // Seams live outside the card body: they go once the card without their pieces is saved.
    const saved = await autosave.flush('dxf-delete');
    if (saved !== 'ok' && saved !== 'nothing') return;
    await deleteSeamsOnServer(techCardId, plan.removedSeamIds);
  }

  function renderVersions() {
    if (!versionsOf) return null;
    const rows = (getValues('patterns') ?? []) as PatternRow[];
    const row = rows.find((r) => (r.lineKey || r.url) === versionsOf);
    if (!row) return null;
    const versions = sheetVersions(row, (row.lineKey && historyByLine.get(row.lineKey)) || []);
    const canRestore = (v: SheetVersion) =>
      canEdit && !isSubmitting && v.snapshotId > 0 && !!techCardId;
    const url = row.url ?? '';
    const label = labelOf(row);
    const download =
      url && isDxfUrl(url) ? (
        <PatternExportItems
          original={async () => ({
            blob: await fetchMediaBlob(url),
            fileName: row.filename || `${label}.dxf`,
          })}
          drawing={async () =>
            drawingFromDxf(await (await fetchMediaBlob(url)).arrayBuffer(), label)
          }
          plot={async () => {
            const [{ plotFromDxfBytes }, blob] = await Promise.all([
              import('lib/pattern-export/plot-dxf'),
              fetchMediaBlob(url),
            ]);
            return {
              plot: await plotFromDxfBytes(await blob.arrayBuffer(), label, dxfIndex?.contourLayer),
              title: label,
            };
          }}
        />
      ) : url ? (
        <Button asChild variant='underline' size='xs'>
          <a href={url} target='_blank' rel='noopener noreferrer'>
            open
          </a>
        </Button>
      ) : null;
    return (
      <SheetVersionsModal
        open
        versions={versions}
        canRestore={canRestore}
        canDeleteRevision={() => canEdit && !isSubmitting && !!techCardId}
        download={download}
        onClose={() => setVersionsOf(null)}
        onDelete={() => {
          const at = rows.indexOf(row);
          setVersionsOf(null);
          if (at >= 0) askRemove(row, at);
        }}
        onRestore={async (v) => {
          const out = await restoreSheetVersion({
            sheetLineKey: row.lineKey ?? '',
            url: v.url,
            fileName: v.fileName || undefined,
            revision: v.revision ?? undefined,
            sha256: v.sha256 || undefined,
            snapshotId: v.snapshotId || undefined,
          });
          if (out === 'unavailable')
            useSnackBarStore.getState().showMessage('not restored', 'error');
          if (out === 'applied' || out === 'noop') setVersionsOf(null);
        }}
        onDeleteRevision={deleteRevision}
      />
    );
  }

  // `delete` of an old version (live or removed sheet): permanent, DeleteTechCardPatternRevision.
  async function deleteRevision(v: SheetVersion): Promise<boolean> {
    if (!techCardId || v.historyId <= 0) return false;
    return undoHistory.waitThenCut('pattern-revision-delete', async () => {
      try {
        // The hold has waited for an older body write to finish its reconciliation. Its live edit
        // base has moved even when the query invalidation that follows that write has not.
        const response = await adminService.DeleteTechCardPatternRevision({
          techCardId,
          historyId: v.historyId,
          expectedLockVersion: autosave.getBaseLockVersion(),
        });
        const fresh = response.techCard;
        if (!fresh) throw new Error('no card returned');

        // Move both synchronous sources of the next CAS before waitThenCut releases the hold. The
        // refetch is only a background refresh; a failed refresh cannot put autosave behind again.
        autosave.adoptBase(fresh);
        queryClient.setQueryData(techCardKeys.detail(techCardId), fresh);
        void queryClient.invalidateQueries({ queryKey: techCardKeys.detail(techCardId) });
        return true;
      } catch (e) {
        console.error('pattern revision delete failed', e);
        const said = e instanceof Error ? e.message.trim() : '';
        useSnackBarStore.getState().showMessage(said || 'not deleted', 'error');
        return false;
      }
    });
  }

  // A removed sheet's restore: the card snapshot frozen by the save that deleted it.
  const canRestoreRemoved = (snapshotId: number) =>
    canEdit && !isSubmitting && snapshotId > 0 && !!techCardId;
  async function restoreRemoved(snapshotId: number): Promise<RestoreOutcome> {
    const out = await restoreSnapshot(snapshotId);
    if (out === 'unavailable') useSnackBarStore.getState().showMessage('not restored', 'error');
    return out;
  }

  // «⋯» of a removed row: its revisions, each with `restore` / `delete`; no download, no sheet delete.
  function renderRemovedVersions() {
    if (!removedOf) return null;
    const sheet = removed.find((r) => r.key === removedOf);
    if (!sheet) return null;
    return (
      <SheetVersionsModal
        open
        versions={sheet.versions}
        canRestore={(v) => canRestoreRemoved(v.snapshotId)}
        canDeleteRevision={() => canEdit && !isSubmitting && !!techCardId}
        download={null}
        onClose={() => setRemovedOf(null)}
        onRestore={async (v) => {
          const out = await restoreRemoved(v.snapshotId);
          if (out === 'applied' || out === 'noop') setRemovedOf(null);
        }}
        onDeleteRevision={deleteRevision}
      />
    );
  }

  // Removed sheets of a slot. A sheet whose slot is unknown sits under the first slot with files
  // (else the first slot) — the one the shelf opens on.
  const removedHome =
    scopeGroups.find((g) => g.entries.length > 0)?.scope.key ?? scopeGroups[0]?.scope.key ?? '';
  const removedIn = (scopeKey: string) =>
    removed.filter((r) =>
      r.scopeKey && scopeGroups.some((g) => g.scope.key === r.scopeKey)
        ? r.scopeKey === scopeKey
        : scopeKey === removedHome,
    );

  // A deleted sheet: muted, no drop target, no `new version`.
  function renderRemovedRow(sheet: RemovedSheet) {
    const restorable = sheet.snapshotId > 0;
    const busy = restoringRemoved === sheet.key;
    const date = ddmm(sheet.at);
    return (
      <li key={sheet.key} className='py-1'>
        <div className='flex items-center gap-1.5'>
          <div
            aria-hidden
            className='h-14 w-14 shrink-0 border border-borderColor bg-pageBg opacity-40'
          />
          <div className='min-w-0 flex-1'>
            <span title={sheet.fileName} className='block truncate text-micro text-labelColor'>
              {sheet.fileName}
            </span>
          </div>
          <Text size='nano' variant='label' component='span' className='shrink-0 tabular-nums'>
            {date ? `removed · ${date}` : 'removed'}
          </Text>
          <span className='inline-flex shrink-0 items-center gap-1'>
            {restorable && (
              <Button
                type='button'
                variant='underline'
                size='xs'
                disabled={!canRestoreRemoved(sheet.snapshotId) || restoringRemoved !== null}
                onClick={async () => {
                  setRestoringRemoved(sheet.key);
                  try {
                    await restoreRemoved(sheet.snapshotId);
                  } finally {
                    setRestoringRemoved(null);
                  }
                }}
              >
                {busy ? 'restore…' : 'restore'}
              </Button>
            )}
            <Button
              type='button'
              variant='underline'
              size='xs'
              className={door}
              aria-label='removed sheet'
              onClick={() => setRemovedOf(sheet.key)}
            >
              ⋯
            </Button>
          </span>
        </div>
      </li>
    );
  }

  const removedList = (scopeKey: string) => {
    const list = removedIn(scopeKey);
    return list.length > 0 ? (
      <ul className='divide-y divide-hairline'>{list.map(renderRemovedRow)}</ul>
    ) : null;
  };

  function renderSheetRow({ row, index }: Entry) {
    const dxf = isDxfUrl(row.url);
    // Лист БЕЗ размера (0281) — не «размер вне ряда»: сервер его с рядом не сверяет.
    const stray = !!row.sizeId && !inRange.has(row.sizeId);
    // Разрешённый скоуп строки: сначала назначение, иначе строка BOM. '' = ни к чему живому.
    const rowScope = scopeKeyOfBinding(row.fabricPurpose, row.bomLineKey, sheetSet);
    // A DXF name opens the pieces viewer of its slot; a sheet without a material has none.
    const slotGroup = rowScope ? scopeGroups.find((g) => g.scope.key === rowScope) : undefined;
    const rowGroup = dxf ? slotGroup : undefined;
    const converted = (row.url && bundle?.manifestByUrl?.get(row.url)) || null;
    const distrust = (row.url && bundle?.manifestDistrustByUrl?.get(row.url)) || null;
    const nameTitle =
      [row.filename, converted ? convertedTitle(converted) : ''].filter(Boolean).join('\n') ||
      undefined;
    const rowId = sheetRowId(row);
    const slotBusy = !!rowScope && (uploading[rowScope] ?? 0) > 0;
    const flight = rowScope ? reuploading[rowScope] : undefined;
    const rowUploading =
      !!flight &&
      (flight.rowId === rowId || (!flight.rowId && (slotGroup?.entries.length ?? 0) === 1));
    const feedback = reuploadFeedback[feedbackKey(row)];
    // v{N}: the active row's own revision (a restored sheet keeps its old number).
    const shownRev = shownRevision(row);
    // Click or drop on the thumbnail = replace this slot's sheet (the panel is the drop zone).
    // A non-DXF row is replaceable too: a plain file swap (uploadOne), no reconcile, no marks.
    const replaceable = !!slotGroup && canUpload;
    const dragging = replaceable && !slotBusy && dragRow === rowId;
    const url = row.url ?? '';
    const uploadedOn = ddmm(feedback?.uploadedAt ?? row.uploadedAt ?? '');
    const summary =
      feedback?.kind === 'applied'
        ? [
            feedback.added > 0 ? `+${feedback.added} ${plural(feedback.added, 'piece')}` : '',
            feedback.reshaped > 0 ? `${feedback.reshaped} reshaped` : '',
            feedback.removed > 0 ? `−${feedback.removed} ${plural(feedback.removed, 'piece')}` : '',
          ].filter(Boolean)
        : [];
    // A file dropped on the row = a new version of this sheet; the panel's drop stays as it is.
    // A dragged sheet row is not a file: it passes through to the panel (dropProps).
    const rowDrop =
      replaceable && !slotBusy
        ? {
            onDragOver: (e: React.DragEvent) => {
              if (isSheetDrag(e)) return;
              e.preventDefault();
              e.stopPropagation();
              setDragRow(rowId);
            },
            onDragLeave: (e: React.DragEvent) => {
              if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
              setDragRow((r) => (r === rowId ? null : r));
            },
            onDrop: (e: React.DragEvent) => {
              if (isSheetDrag(e)) return;
              e.preventDefault();
              e.stopPropagation();
              setDragRow(null);
              setDragKey(null);
              routeFiles(slotGroup.scope.key, e.dataTransfer.files, rowId);
            },
          }
        : {};
    // A DXF sheet drags onto another material's tile and moves there with its own piece links.
    const sheetDrag =
      dxf && canEdit && !isSubmitting && !slotBusy && editing?.index !== index
        ? {
            draggable: true,
            onDragStart: (e: React.DragEvent) => {
              e.dataTransfer.setData(SHEET_DRAG, rowId);
              e.dataTransfer.effectAllowed = 'move';
            },
          }
        : {};

    return (
      <li
        key={row.lineKey || `row-${index}`}
        className={cn('group/sheet py-1', dragging && 'outline outline-1 outline-textColor')}
        {...rowDrop}
        {...sheetDrag}
      >
        <div className='flex items-center gap-1.5'>
          <div className='min-w-0 flex-1'>
            {editing?.index === index ? (
              <Input
                name={`pattern-rename-${index}`}
                value={editing.value}
                placeholder={row.filename || 'name'}
                maxLength={MAX_PATTERN_NAME}
                autoFocus
                autoComplete='off'
                className='px-1 py-0 text-micro'
                onFocus={(e: React.FocusEvent<HTMLInputElement>) => {
                  // The name without its extension is selected: typing replaces just that.
                  const el = e.currentTarget;
                  const dot = el.value.lastIndexOf('.');
                  el.setSelectionRange(0, dot > 0 ? dot : el.value.length);
                }}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setEditing({ index, value: e.target.value })
                }
                onBlur={() => commitRename(index, editing.value)}
                onKeyDown={(e: React.KeyboardEvent) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    commitRename(index, editing.value);
                  }
                  if (e.key === 'Escape') {
                    e.preventDefault();
                    e.stopPropagation();
                    setEditing(null);
                  }
                }}
              />
            ) : (
              <span className='flex flex-wrap items-center gap-1.5'>
                <Button
                  type='button'
                  variant='underline'
                  title={nameTitle}
                  className='min-w-0 truncate text-left text-micro normal-case'
                  onClick={() => {
                    if (!(!dxf || rowGroup)) return;
                    if (nameClick.current != null) window.clearTimeout(nameClick.current);
                    nameClick.current = window.setTimeout(() => {
                      nameClick.current = null;
                      if (rowGroup) openPieces(rowGroup);
                      else setViewing(row);
                    }, DBL_MS);
                  }}
                  onDoubleClick={() => {
                    if (nameClick.current != null) window.clearTimeout(nameClick.current);
                    nameClick.current = null;
                    if (isSubmitting || !canEdit) return;
                    setEditing({ index, value: labelOf(row) });
                  }}
                >
                  {labelOf(row)}
                </Button>
                {!dxf && <Pill tone='mut'>pdf</Pill>}
                {/* «converted» carried no decision: what the importer wrote rides in the name's
                    tooltip; only the autopilot's «auto · N to check» stays beside the name */}
                {converted?.autopilot && (
                  <AutopilotPill
                    assumptions={converted.autopilot.assumptions}
                    onCheckPieces={rowGroup ? () => openPieces(rowGroup) : undefined}
                  />
                )}
                {converted && distrust && (
                  <Pill tone='warn' title={distrust}>
                    manifest not trusted
                  </Pill>
                )}
                {converted && !!techCardId && converted.techCardId !== techCardId && (
                  <Pill tone='warn'>converted for card #{converted.techCardId}</Pill>
                )}
                {stray && <Pill tone='warn'>size out of range</Pill>}
              </span>
            )}
          </div>
          {dragging && (
            <Text size='nano' component='span' className='shrink-0 uppercase tabular-nums'>
              {`drop · v${nextRevision(row)}`}
            </Text>
          )}
          {rowUploading ? (
            <Text size='nano' component='span' className='shrink-0 tabular-nums'>
              v{flight?.version ?? nextRevision(row)} · uploading
            </Text>
          ) : (
            <>
              {uploadedOn && (
                <Text
                  size='nano'
                  variant='label'
                  component='span'
                  className='shrink-0 tabular-nums'
                >
                  {uploadedOn}
                </Text>
              )}
              {shownRev != null && (
                <Text
                  size='nano'
                  variant='label'
                  component='span'
                  className='shrink-0 tabular-nums'
                >
                  v{shownRev}
                </Text>
              )}
            </>
          )}
          <span className='inline-flex shrink-0 items-center gap-1'>
            {stray && canEdit && storageSizeId > 0 && (
              <Button
                type='button'
                variant='secondary'
                size='xs'
                // Смена size_id — keyed replacement: сервер перенумерует ревизию, файл тот же.
                onClick={() =>
                  setValue(`patterns.${index}.sizeId`, storageSizeId, { shouldDirty: true })
                }
              >
                re-file
              </Button>
            )}
            {dxf && row.url && (
              <PatternExportMenu
                label={labelOf(row)}
                only={['plt']}
                original={async () => ({
                  blob: await fetchMediaBlob(url),
                  fileName: row.filename || `${labelOf(row)}.dxf`,
                })}
                drawing={async () =>
                  drawingFromDxf(await (await fetchMediaBlob(url)).arrayBuffer(), labelOf(row))
                }
                plot={async () => {
                  const [{ plotFromDxfBytes }, blob] = await Promise.all([
                    import('lib/pattern-export/plot-dxf'),
                    fetchMediaBlob(url),
                  ]);
                  return {
                    plot: await plotFromDxfBytes(
                      await blob.arrayBuffer(),
                      labelOf(row),
                      dxfIndex?.contourLayer,
                    ),
                    title: labelOf(row),
                  };
                }}
                after={(close) => (
                  <Button
                    type='button'
                    variant='underline'
                    onClick={() => {
                      close();
                      setPrinting({
                        url,
                        fileName: row.filename || `${labelOf(row)}.dxf`,
                        material: rowGroup ? scopeLabel(rowGroup.scope) : '',
                        title: styleNumber.trim(),
                        cardKey: techCardId ? String(techCardId) : '',
                      });
                    }}
                  >
                    for print
                  </Button>
                )}
              />
            )}
            {(row.lineKey || row.url) && (
              <Button
                type='button'
                aria-label='history'
                title='history'
                className={ROW_ICON_BTN}
                disabled={slotBusy}
                onClick={() => setVersionsOf(row.lineKey || row.url || null)}
              >
                <HistoryGlyph />
              </Button>
            )}
            {canEdit && (
              <Close
                size='sm'
                aria-label={`delete ${labelOf(row)}`}
                title='delete'
                disabled={isSubmitting || slotBusy}
                onClick={() => askRemove(row, index)}
              />
            )}
          </span>
        </div>
        {rowUploading && <Progress value={62} className='mt-1 h-0.5' />}
        {feedback?.kind === 'noop' && (
          <Text size='nano' component='p' className='mt-0.5 tabular-nums'>
            same file
          </Text>
        )}
        {feedback?.kind === 'applied' && (summary.length > 0 || feedback.marked > 0) && (
          <Text
            size='nano'
            component='p'
            className='mt-0.5 flex flex-wrap items-center tabular-nums'
          >
            {summary.map((part, partIndex) => (
              <span key={part}>
                {partIndex > 0 ? ' · ' : ''}
                {part}
              </span>
            ))}
            {feedback.marked > 0 && (
              <>
                {summary.length > 0 ? ' · ' : ''}
                <Button
                  type='button'
                  variant='underline'
                  size='xs'
                  className='p-0 normal-case'
                  onClick={() =>
                    setParams(
                      (prev) => markJumpParams(prev, getValues('operations') ?? []) ?? prev,
                      { replace: true },
                    )
                  }
                >
                  check {feedback.marked} {plural(feedback.marked, 'step')}
                </Button>
              </>
            )}
          </Text>
        )}
      </li>
    );
  }

  const sheetList = (list: Entry[]) => (
    <ul className='divide-y divide-hairline'>{list.map(renderSheetRow)}</ul>
  );

  // Покрытие размеров одной полоской чипов: дырка видна, не читая.
  function renderCoverage(list: Entry[]) {
    const a = audits[sigOf(list)];
    if (!a || a.phase === 'loading') {
      return (
        <Text size='nano' variant='label' component='span'>
          parsing…
        </Text>
      );
    }
    if (a.phase === 'error') {
      return (
        <Text size='nano' component='span' className='text-error'>
          parse error
        </Text>
      );
    }
    if (a.found.size === 0) {
      return (
        <Text size='nano' variant='label' component='span'>
          {a.uniOnly ? 'UNI' : 'not graded'}
        </Text>
      );
    }
    if (sizeIds.length === 0) {
      return (
        <span className='flex flex-wrap items-center gap-1'>
          {[...a.found].map((t) => (
            <Chip key={t} className='border-solid border-borderColor bg-bgColor text-labelColor'>
              {t}
            </Chip>
          ))}
        </span>
      );
    }
    const missing = new Set(missingIn(a));
    return (
      <span className='flex flex-wrap items-center gap-1'>
        {orderSizes(sizeIds).map((id) => {
          const gone = missing.has(id);
          return (
            <Chip
              key={id}
              className={
                gone
                  ? 'border-dashed border-error bg-bgColor text-error'
                  : 'border-solid border-textColor bg-bgColor text-textColor'
              }
            >
              {nameOf(id)}
            </Chip>
          );
        })}
      </span>
    );
  }

  // A SHEET DRAGGED ONTO ANOTHER MATERIAL (bom-purpose.ts, moveSheet): the sheet takes that
  // material, and the piece links whose blocks come from its DXF go with it — only those no other
  // sheet of the old material still holds. An unresolved source associates links and sibling sheets
  // by the normalized raw binding pair. Block identity is the reconcile cascade's: the name and its
  // sizeless identity, case and inner spaces aside. A sheet not parsed yet waits.
  const moveSheetTo = (rowId: string, key: string, occupiedConfirmed = false): boolean => {
    if (!canEdit || isSubmitting || !rowId) return false;
    const say = useSnackBarStore.getState().showMessage;
    const live = fabricScopes(liveCloth());
    const to = live.find((x) => x.key === key);
    const patterns = (getValues('patterns') ?? []) as PatternRow[];
    const sheet = patterns.findIndex((r) => sheetRowId(r) === rowId);
    if (!to || sheet < 0) return false;
    const fromKey = liveScopeOf(patterns[sheet], 'sheet');
    if (!occupiedConfirmed && fromKey !== key && slotRows(key).length > 0) {
      setOccupiedAsk({ kind: 'move', scopeKey: key, rowId });
      return false;
    }
    const aliases = (getValues('pieceDxfAliases') ?? []) as FormAlias[];
    const sizes = new Set([...dictTokens.keys()].map((t) => t.toLowerCase()));
    const move = moveSheet({
      patterns,
      aliases,
      scopes: live,
      sheet,
      to,
      blocksOf: (r) => {
        if (!isDxfUrl(r.url)) return new Set<string>();
        const names = blockNamesByUrl.get((r.url ?? '').trim());
        if (!names) return null;
        const out = new Set<string>();
        for (const n of names) {
          if (!blockKey(n)) continue;
          out.add(blockKey(n));
          if (sizes.size) out.add(blockKey(splitBlockSize(n, sizes).identity));
        }
        out.delete('');
        return out;
      },
    });
    if (move.kind === 'pending') {
      say('not parsed yet', 'error');
      return false;
    }
    if (move.kind === 'clash') {
      say(`blocks clash: ${move.blocks.join(', ')}`, 'error');
      return false;
    }
    if (move.kind === 'lost') {
      say('not moved', 'error');
      return false;
    }
    if (move.kind === 'noop') return true;
    writeBindings(setValue, 'patterns', patterns, move.patterns);
    writeBindings(setValue, 'pieceDxfAliases', aliases, move.aliases);
    setSelectedKey(key);
    return true;
  };

  function removeRowOnly(rowId: string) {
    const rows = (getValues('patterns') ?? []) as PatternRow[];
    const at = rows.findIndex((row) => sheetRowId(row) === rowId);
    if (at < 0) return;
    const url = rows[at].url ?? '';
    remove(at);
    if (url && isDxfUrl(url)) armDeleteSnapshot(techCardId, url);
    autosave.request('dxf-delete');
  }

  async function removeOccupiedRow(rowId: string) {
    const rows = (getValues('patterns') ?? []) as PatternRow[];
    const at = rows.findIndex((row) => sheetRowId(row) === rowId);
    if (at < 0) return;
    await confirmDelete(isDxfUrl(rows[at].url) ? rowId : `#${at}`);
  }

  async function mergeRowFiles(first: PatternRow, rest: PatternRow[]): Promise<File[] | null> {
    try {
      const files = await Promise.all([first, ...rest].map(patternRowFile));
      if (files.some((file) => !file)) {
        useSnackBarStore.getState().showMessage('DXF only', 'error');
        return null;
      }
      return files as File[];
    } catch (error) {
      console.error('Occupied DXF download failed', error);
      useSnackBarStore.getState().showMessage('download failed', 'error');
      return null;
    }
  }

  async function chooseOccupied(ask: OccupiedAsk, choice: OccupiedChoice) {
    if (ask.kind === 'files') {
      await chooseOccupiedFiles(ask, choice);
      return;
    }
    setOccupiedAsk(null);

    if (ask.kind === 'move') {
      const rows = (getValues('patterns') ?? []) as PatternRow[];
      const source = rows.find((row) => sheetRowId(row) === ask.rowId);
      const target = slotOccupant(ask.scopeKey);
      if (!source || !target || source === target) return;
      const targetId = sheetRowId(target);
      if (choice === 'replace') {
        if (moveSheetTo(ask.rowId, ask.scopeKey, true)) await removeOccupiedRow(targetId);
        return;
      }
      const files = await mergeRowFiles(target, [source]);
      if (!files) return;
      setMerging({
        scopeKey: ask.scopeKey,
        files,
        target: targetId,
        afterReady: () => {
          if (moveSheetTo(ask.rowId, ask.scopeKey, true)) removeRowOnly(ask.rowId);
        },
      });
      return;
    }

    const sourceScope = scopeOfKey(ask.scopeKey);
    if (!sourceScope) return;
    const lineKeys = new Set(sourceScope.lines.map((line) => line.lineKey));
    const items = (getValues('bomItems') ?? []) as BomLine[];
    const nextItems = items.map((line) =>
      lineKeys.has(line.lineKey?.trim() ?? '') ? { ...line, purpose: ask.nextPurpose } : line,
    );
    const targetScope = scopeOfLine(
      fabricScopes(clothLines(nextItems)),
      sourceScope.lines[0]?.lineKey ?? '',
    );
    const source = slotOccupant(sourceScope.key);
    const target = targetScope ? slotOccupant(targetScope.key) : undefined;
    if (!targetScope || !source || !target || source === target) return;
    const sourceId = sheetRowId(source);
    const targetId = sheetRowId(target);
    if (choice === 'replace') {
      if (changeScopePurpose(sourceScope, ask.nextPurpose, true)) await removeOccupiedRow(targetId);
      return;
    }
    const files = await mergeRowFiles(target, [source]);
    if (!files) return;
    setMerging({
      scopeKey: targetScope.key,
      files,
      target: targetId,
      afterReady: () => {
        if (changeScopePurpose(sourceScope, ask.nextPurpose, true)) removeRowOnly(sourceId);
      },
    });
  }

  function occupiedVersionDetails(ask: OccupiedAsk): OccupiedVersion {
    if (ask.kind === 'files') {
      return {
        current: slotOccupant(ask.scopeKey, ask.target),
        incomingNames: ask.files.map((file) => file.name),
      };
    }

    const rows = (getValues('patterns') ?? []) as PatternRow[];
    if (ask.kind === 'move') {
      const incoming = rows.find((row) => sheetRowId(row) === ask.rowId);
      return {
        current: slotOccupant(ask.scopeKey),
        incomingNames: [fileNameOf(incoming)],
      };
    }

    const sourceScope = scopeOfKey(ask.scopeKey);
    const source = sourceScope ? slotOccupant(sourceScope.key) : undefined;
    if (!sourceScope) return { incomingNames: [fileNameOf(source)] };
    const lineKeys = new Set(sourceScope.lines.map((line) => line.lineKey));
    const items = (getValues('bomItems') ?? []) as BomLine[];
    const nextItems = items.map((line) =>
      lineKeys.has(line.lineKey?.trim() ?? '') ? { ...line, purpose: ask.nextPurpose } : line,
    );
    const targetScope = scopeOfLine(
      fabricScopes(clothLines(nextItems)),
      sourceScope.lines[0]?.lineKey ?? '',
    );
    return {
      current: targetScope ? slotOccupant(targetScope.key) : undefined,
      incomingNames: [fileNameOf(source)],
    };
  }

  // Плитка слота живёт дроп-зоной: файлы на неё идут в роутер, перетащенный лист — в moveSheetTo.
  const dropProps = (key: string) =>
    canUpload && (uploading[key] ?? 0) === 0
      ? {
          onDragOver: (e: React.DragEvent) => {
            e.preventDefault();
            setDragKey(key);
          },
          onDragLeave: (e: React.DragEvent) => {
            if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
            setDragKey((k) => (k === key ? null : k));
          },
          onDrop: (e: React.DragEvent) => {
            e.preventDefault();
            setDragKey(null);
            if (isSheetDrag(e)) {
              moveSheetTo(e.dataTransfer.getData(SHEET_DRAG), key);
              return;
            }
            routeFiles(key, e.dataTransfer.files);
          },
        }
      : {};

  // ── СЛОТЫ: одна плитка на материал карточки ─────────────────────────────────────────────
  function renderTile(g: (typeof scopeGroups)[number]) {
    const key = g.scope.key;
    const label = scopeLabel(g.scope);
    const has = g.entries.length > 0;
    const primaryDxf = g.entries.find((entry) => isDxfUrl(entry.row.url));
    const hasDxf = !!primaryDxf;
    const busy = (uploading[key] ?? 0) > 0;
    const flight = reuploading[key];
    const dragging = dragKey === key;
    const blocks = dxfIndex ? countBlocks(dxfIndex, key) : 0;
    const a = audits[sigOf(g.entries)];
    const missing = a?.phase === 'ready' ? missingIn(a) : [];
    const interliningUnmatched = interliningReviews.get(key)?.unmatched ?? [];
    const interliningWarnings: HeaderWarning[] = interliningUnmatched.map((match) => ({
      text: `${match.identity}: unmapped`,
      error: true,
      action: {
        label: 'map',
        onClick: () => {
          setSelectedKey(key);
          openPieces(g);
        },
      },
    }));
    const saveState = (() => {
      if (!pieceSaveFeedback || pieceSaveFeedback.materialScopeKey !== key) return null;
      switch (pieceSaveFeedback.save.phase) {
        case 'saving':
          return { label: 'SAVING…', tone: 'attention' } satisfies SlotState;
        case 'saved':
          return pieceSaveFeedback.save.at
            ? ({
                label: `SAVED ${slotTime(pieceSaveFeedback.save.at)}`,
                tone: 'ok',
                fading: pieceSaveFeedback.save.fading,
              } satisfies SlotState)
            : null;
        case 'error':
          return { label: 'NOT SAVED', tone: 'warn' } satisfies SlotState;
        default:
          return null;
      }
    })();
    const generationTarget = pieceSaveFeedback?.interliningLineKeys.some((lineKey) =>
      g.scope.lines.some((line) => line.lineKey === lineKey),
    );
    const generationStateForSlot = (() => {
      if (!pieceSaveFeedback || !generationTarget) return null;
      switch (pieceSaveFeedback.generation.phase) {
        case 'generating':
          return { label: 'GENERATING…', tone: 'attention' } satisfies SlotState;
        case 'generated':
          return pieceSaveFeedback.generation.at
            ? ({
                label: `GENERATED ${slotTime(pieceSaveFeedback.generation.at)}`,
                tone: 'ok',
                fading: pieceSaveFeedback.generation.fading,
              } satisfies SlotState)
            : null;
        case 'error':
          return { label: 'DXF ERROR', tone: 'warn' } satisfies SlotState;
        default:
          return null;
      }
    })();
    const slotState = generationStateForSlot ?? saveState;
    const tileName = (
      <span className='flex min-w-0 items-center justify-between gap-1'>
        <span className='truncate'>{label}</span>
        <HeaderWarnings items={interliningWarnings} className='shrink-0' />
      </span>
    );
    const active = selectedKey === key;
    const emptyContents = (
      <>
        {busy ? (
          <span className='text-micro'>uploading…</span>
        ) : !canUpload ? (
          <span className='text-micro'>no pattern</span>
        ) : (
          <>
            <span className='text-micro'>+ drop pattern files</span>
            <span className='text-nano text-labelColor'>
              {importOk && sizeIds.length > 0 ? 'DXF or PDF' : 'DXF'} · one file or one per size
            </span>
          </>
        )}
      </>
    );
    const empty = (
      <div className='relative'>
        <PatternDropZone
          interactive={active && canUpload && !busy}
          disabled={!canUpload || busy}
          className={cn('h-[84px]', canUpload && !busy && 'group-hover/slot:border-textColor')}
          onClick={() => openPicker(key)}
        >
          {emptyContents}
        </PatternDropZone>
        <SlotStateOverlay state={slotState} />
      </div>
    );
    const drawing =
      dxfIndex && blocks > 0 ? (
        <div
          className={cn(
            'relative flex h-[84px] w-full items-center justify-center border border-borderColor bg-pageBg p-1 pt-5',
            hasDxf && canUpload && !busy && 'hover:border-textColor',
          )}
        >
          <SheetThumb index={dxfIndex} scopeKey={key} className='h-full w-full' />
          <SlotStateOverlay state={slotState} />
          {flight && <Progress value={62} className='absolute inset-x-0 bottom-0 h-0.5' />}
        </div>
      ) : (
        <div className='relative'>
          <Placeholder
            dashed
            label={geometry.isError ? 'parse error' : dxfIndex ? 'no shapes found' : 'parsing…'}
            className='h-[84px] w-full'
          />
          <SlotStateOverlay state={slotState} />
          {flight && <Progress value={62} className='absolute inset-x-0 bottom-0 h-0.5' />}
        </div>
      );
    const openVersion = (event: React.MouseEvent) => {
      event.stopPropagation();
      if (busy) return;
      setSelectedKey(key);
      openPicker(key);
    };
    const filled = (
      <div>
        <div className='relative'>
          {hasDxf ? (
            <button
              type='button'
              aria-label='pieces'
              disabled={busy}
              className='block w-full cursor-pointer text-left focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-textColor disabled:cursor-default'
              onClick={(event: React.MouseEvent) => {
                event.stopPropagation();
                if (busy) return;
                setSelectedKey(key);
                openPieces(g);
              }}
            >
              {drawing}
            </button>
          ) : (
            drawing
          )}
          {blocks > 0 && (
            <span className='pointer-events-none absolute left-px top-px bg-bgColor px-1 py-0.5 text-micro text-labelColor tabular-nums'>
              {flight ? `v${flight.version} · uploading` : `${blocks} ${plural(blocks, 'piece')}`}
            </span>
          )}
        </div>
        {hasDxf && canUpload && (active || dragging || busy) && (
          <button
            type='button'
            disabled={busy}
            onClick={openVersion}
            className={cn(
              'mt-1 flex h-7 w-full cursor-pointer items-center justify-center border border-dashed text-micro uppercase tracking-label focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-textColor disabled:cursor-not-allowed',
              dragging
                ? 'border-solid border-textColor bg-textColor text-bgColor'
                : busy
                  ? 'border-borderColor text-labelColor'
                  : 'border-labelColor text-textColor hover:border-textColor',
            )}
          >
            {dragging && primaryDxf ? `drop · v${nextRevision(primaryDxf.row)}` : '+ new version'}
          </button>
        )}
      </div>
    );
    const media = !has ? empty : filled;

    if (!active) {
      return (
        <div
          key={key}
          className={cn('group/slot', dragging && 'outline outline-2 outline-textColor')}
          data-field={`patterns.slot.${g.scope.lines[0]?.lineKey ?? key}`}
          onClickCapture={() => setSelectedKey(key)}
          {...dropProps(key)}
        >
          <Tile
            selected={has && selectedKey === key}
            dashed={!has}
            tone={missing.length > 0 || interliningUnmatched.length > 0 ? 'error' : 'default'}
            onClick={
              has
                ? undefined
                : () => {
                    setSelectedKey(key);
                    openPicker(key);
                  }
            }
            title={label}
            media={media}
            name={tileName}
          >
            {has && <span className='mt-1 block'>{renderCoverage(g.entries)}</span>}
          </Tile>
        </div>
      );
    }

    const scopePurpose = g.scope.byPurpose
      ? g.scope.key
      : g.scope.lines[0]?.purpose || UNSET_PURPOSE;
    // «Unset» is not offered to a slot of several lines: each line would become a slot of its own,
    // and its sheets would have no single home to go to.
    const editorItems =
      g.scope.lines.length > 1
        ? purposeEditorOptions.filter((option) => option.value !== UNSET_PURPOSE)
        : purposeEditorOptions;
    const purposeItems = editorItems.some((option) => option.value === scopePurpose)
      ? editorItems
      : [
          ...editorItems,
          { value: scopePurpose, label: bomPurposeLabel(scopePurpose), disabled: true },
        ];
    const namedLines = g.scope.lines
      .map((line) => ({
        line,
        index: bomItems.findIndex((candidate) => candidate.lineKey === line.lineKey),
      }))
      .filter(({ index }) => index >= 0);
    const blockers = [...colourwayBlockers(g.scope), ...scopeHold(g.scope)];
    const activeMedia = (
      <div className='relative'>
        {media}
        {canEdit && (
          <div
            className={cn(
              'absolute right-px bg-bgColor md:opacity-0 md:group-hover/slot:opacity-100 md:group-focus-within/slot:opacity-100',
              slotState ? 'top-8' : 'top-px',
            )}
            onClick={(event) => event.stopPropagation()}
          >
            {confirmScopeKey === key ? (
              <span className='flex items-center gap-1 px-1 py-0.5 text-micro uppercase'>
                <span>remove?</span>
                <Button
                  type='button'
                  variant='underline'
                  size='xs'
                  className='p-0 text-textColor'
                  onClick={() => removeMaterialScope(g.scope)}
                >
                  yes
                </Button>
                <span className='text-labelColor'>/</span>
                <Button
                  type='button'
                  variant='underline'
                  size='xs'
                  className='p-0 text-labelColor hover:text-textColor'
                  onClick={() => setConfirmScopeKey(null)}
                >
                  no
                </Button>
              </span>
            ) : (
              <Close
                size='sm'
                aria-label='remove slot'
                disabled={busy || blockers.length > 0}
                title={blockers.length > 0 ? `used by ${blockers.join(', ')}` : 'remove slot'}
                className='bg-bgColor text-labelColor hover:text-textColor hover:no-underline'
                onClick={() => setConfirmScopeKey(key)}
              />
            )}
          </div>
        )}
      </div>
    );

    return (
      <div
        key={key}
        className={cn('group/slot', dragging && 'outline outline-2 outline-textColor')}
        data-field={`patterns.slot.${g.scope.lines[0]?.lineKey ?? key}`}
        onClickCapture={() => setSelectedKey(key)}
        {...dropProps(key)}
      >
        <Tile
          selected
          dashed={!has}
          tone={missing.length > 0 || interliningUnmatched.length > 0 ? 'error' : 'default'}
          title={label}
          media={activeMedia}
          name={tileName}
        >
          <div className='mt-1 flex w-full flex-col gap-1'>
            <Select
              name={`bomItems.${namedLines[0]?.index ?? 0}.purpose`}
              items={purposeItems}
              value={scopePurpose}
              placeholder='purpose'
              size='sm'
              fullWidth
              readOnly={!canEdit || isSubmitting}
              onValueChange={(value) => {
                if (!canEdit || isSubmitting || value === scopePurpose) return;
                changeScopePurpose(g.scope, value);
              }}
            />
            {namedLines.map(({ line, index }, lineIndex) => (
              <Input
                key={line.lineKey}
                {...register(`bomItems.${index}.name`)}
                placeholder='name'
                aria-label={namedLines.length === 1 ? 'name' : `name ${lineIndex + 1}`}
                autoComplete='off'
                readOnly={!canEdit || isSubmitting}
                className='h-[22px] py-0 text-micro'
              />
            ))}
          </div>
          {has && <span className='mt-1 block'>{renderCoverage(g.entries)}</span>}
        </Tile>
      </div>
    );
  }

  /** Плитка для того, что материалом не подписано: наследие в PDF. */
  function renderExtraTile(key: string, name: string, list: Entry[]) {
    return (
      <Tile
        key={key}
        dashed
        selected={selectedKey === key}
        onClick={() => setSelectedKey(key)}
        media={
          <Placeholder
            dashed
            label={`${list.length} ${plural(list.length, 'file')}`}
            className='h-[84px] w-full'
          />
        }
        name={name}
      />
    );
  }

  const door = 'text-labelColor hover:text-textColor';

  // Панель выбранного слота: файлы и две двери (pieces, marker); `upload` — в строке листа.
  function renderSelected() {
    if (selectedKey === PDF_KEY) {
      return (
        <div>
          <GroupLabel>PDF</GroupLabel>
          {sheetList(pdfEntries)}
        </div>
      );
    }
    const g = scopeGroups.find((x) => x.scope.key === selectedKey);
    if (!g) return null;
    // Legacy sheets bound to nothing live sit under the first material (orphanDxf).
    const orphans = g.scope.key === orphanHome ? orphanDxf : [];
    if (g.entries.length === 0) {
      if (orphans.length === 0) return removedList(g.scope.key);
      return (
        <div>
          <GroupLabel>files</GroupLabel>
          {sheetList(orphans)}
          {removedList(g.scope.key)}
        </div>
      );
    }
    const label = scopeLabel(g.scope);
    // Раскладка мерит КОНКРЕТНЫЙ артикул: запереть её на строку можно только когда назначение
    // владеет ровно одной; иначе модалка спрашивает сама.
    const soleLine = g.scope.lines.length === 1 ? g.scope.lines[0].lineKey : '';
    return (
      <div
        className={dragKey === g.scope.key ? 'outline outline-2 outline-textColor' : undefined}
        {...dropProps(g.scope.key)}
      >
        <GroupLabel
          action={
            <div className='flex flex-wrap items-center gap-1.5'>
              {/* `patterns.match` — цель перехода из вкладки операций (запасная — `patterns.shelf`). */}
              {canEdit && (
                <Button
                  type='button'
                  variant='underline'
                  size='xs'
                  className={door}
                  data-field='patterns.match'
                  onClick={() => openPieces(g)}
                >
                  pieces
                </Button>
              )}
              <Button
                type='button'
                variant='underline'
                size='xs'
                className={door}
                onClick={() =>
                  setNesting({
                    // Запасной размер для НЕградуированного файла; `||`, а не `??`: у листа без
                    // размера (0281) здесь 0.
                    sizeId: g.entries[0]?.row.sizeId || storageSizeId,
                    files: filesOf(g.entries),
                    bomLineKey: soleLine,
                    // Алиасы ЭТОГО скоупа: одно имя блока на верхе и на подкладе — разные детали.
                    aliases: pieceDxfAliases.filter((al) => aliasInScope(al, g.scope, linkSet)),
                    // Строгое направление скоупа; семпловые строки не голосуют, если есть
                    // производственные (0265).
                    fabricDirection: strictestDirection(
                      g.scope.lines.some((l) => !l.isSample)
                        ? g.scope.lines.filter((l) => !l.isSample)
                        : g.scope.lines,
                    ),
                  })
                }
              >
                marker
              </Button>
              {printSlots.length > 0 && (
                <Button
                  type='button'
                  variant='underline'
                  size='xs'
                  className={door}
                  onClick={() => {
                    const first = printSlots[0];
                    setPrinting({
                      url: first.url,
                      fileName: first.fileName,
                      material: first.material,
                      title: styleNumber.trim(),
                      cardKey: techCardId ? String(techCardId) : '',
                      ...(printSlots.length > 1 ? { slots: printSlots } : {}),
                    });
                  }}
                >
                  print
                </Button>
              )}
            </div>
          }
        >
          {/* the tile above already names the material (it is the selected one): the files */}
          files
        </GroupLabel>
        {sheetList([...g.entries, ...orphans])}
        {removedList(g.scope.key)}
      </div>
    );
  }

  // Мастер импорта: только с файлами, брошенными на слот.
  const renderImportWizard = () =>
    techCardId && importing ? (
      <Suspense fallback={null}>
        <ImportWizard
          initialFiles={importing.files}
          initialScopeKey={importing.scopeKey}
          card={buildCardContext({
            techCardId,
            orderedSizeIds: orderSizes(sizeIds),
            sizeName: (id) => formatSizeName(sizeById.get(id) ?? `#${id}`),
            rawSizeName: (id) => sizeById.get(id),
            scopes: scopes.map((sc) => ({
              key: sc.key,
              byPurpose: sc.byPurpose,
              label: scopeLabel(sc),
              binding: bindingForScope(sc),
              sections: sc.lines.map((l) => l.section),
            })),
            pieces: cardPieces,
            // Live links and sheets under the scope they RESOLVE to — the key the targets carry
            // (a line sorted into a purpose, an interlining line bound with its purpose, L11).
            aliases: pieceDxfAliases.map((a) => ({
              scopeKey: scopeKeyOfBinding(a.fabricPurpose, a.bomLineKey, linkSet),
              blockName: a.blockName,
              pieceLineKey: a.pieceLineKey,
            })),
            patterns: liveRows.map((p) => ({
              scopeKey: scopeKeyOfBinding(p.fabricPurpose, p.bomLineKey, sheetSet),
              filename: p.filename,
              url: p.url,
              lineKey: p.lineKey,
              name: p.name,
              manifest: (p.url && bundle?.manifestByUrl?.get(p.url)) || null,
            })),
            styleLabel: [season, styleNumber].filter(Boolean).join(' · '),
            cardName,
            styleNumber,
          })}
          // F7: upload every file, then ONE batch into this form, then the card's own save.
          applyDraft={followUpApply(
            createCardApply({
              read: () => ({
                patterns: (getValues('patterns') ?? []) as LiveCard['patterns'],
                pieces: (getValues('pieces') ?? []) as LiveCard['pieces'],
                aliases: (getValues('pieceDxfAliases') ?? []) as LiveCard['aliases'],
              }),
              write: (path, value) =>
                setValue(path as Parameters<typeof setValue>[0], value as never, {
                  shouldDirty: true,
                }),
              storageSizeId,
              // read at commit time: the BOM may have been sorted while the wizard was open
              scopeOf: liveScopeOf,
              save: (reason) => undoHistory.flushThenCut(reason),
              // A sheet replaced in place: its save archives the old file with a card snapshot.
              onReplaced: (list) =>
                list.forEach((r) => armReuploadSnapshot(techCardId, r.newUrl, r.oldUrl)),
              unsaved: {
                get: () => importUnsaved.current,
                set: (v) => {
                  importUnsaved.current = v;
                },
              },
            }),
          )}
          followUp={followUp?.rows ?? null}
          onRetryFollowUp={retryFollowUp}
          onReviewPieces={(scopeKey) => {
            const g = scopeGroups.find((x) => x.scope.key === scopeKey);
            if (!g || g.entries.length === 0) return;
            setImporting(null);
            setSelectedKey(scopeKey);
            openPieces(g);
          }}
          onClose={() => setImporting(null)}
        />
      </Suspense>
    ) : null;

  // ── ШАПКА БЛОКА: счёт и предупреждения (portal в action секции) ─────────────────────────
  // Each warning carries its fix where this screen has one (owner, patterns-lite round 2).
  const withFiles = (k: string) =>
    scopeGroups.find((g) => g.scope.key === k && g.entries.length > 0);
  // The pieces viewer of a slot; without a known slot, the selected one, else the first with files.
  const piecesDoor = (scopeKey?: string): HeaderWarningAction | undefined => {
    const g =
      (scopeKey ? withFiles(scopeKey) : undefined) ??
      (selectedKey ? withFiles(selectedKey) : undefined) ??
      scopeGroups.find((x) => x.entries.length > 0);
    return g
      ? {
          label: 'open pieces',
          onClick: () => {
            setSelectedKey(g.scope.key);
            openPieces(g);
          },
        }
      : undefined;
  };
  // DEEP LINK from COLOURWAYS: `?tab=patterns&marker=<bomLineKey>[&auto=1]`. Opens the marker of
  // the slot holding that line exactly as its «marker» button does (lock = that line), once per
  // link, then drops `marker`/`auto` from the URL so a reload does not reopen it. Waits for the
  // card's BOM to reach the form; a slot without DXF gets scrolled to and pulsed instead.
  const deepMarker = params.get('marker') ?? '';
  const deepAuto = params.get('auto') === '1';
  const deepColorway = Number(params.get('markerColorway') ?? 0) || 0;
  // Identity-stable; `peek` reads the staged list without subscribing this panel to it.
  const staging = useTechCardStaging();
  const deepHandled = useRef('');
  useEffect(() => {
    if (!deepMarker) {
      deepHandled.current = '';
      return;
    }
    if (deepHandled.current === deepMarker) return;
    const g = scopeGroups.find((x) => x.scope.lines.some((l) => l.lineKey === deepMarker));
    // BOM not in the form yet: wait. A card whose BOM loaded without that line falls through.
    if (!g && scopes.length === 0) return;
    deepHandled.current = deepMarker;
    setParams(
      (prev) => {
        const p = new URLSearchParams(prev);
        p.delete('marker');
        p.delete('auto');
        p.delete('markerColorway');
        return p;
      },
      { replace: true },
    );
    if (g && g.entries.length > 0) {
      setSelectedKey(g.scope.key);
      setNesting({
        sizeId: g.entries[0]?.row.sizeId || storageSizeId,
        files: filesOf(g.entries),
        bomLineKey: deepMarker,
        aliases: pieceDxfAliases.filter((al) => aliasInScope(al, g.scope, linkSet)),
        fabricDirection: strictestDirection(
          g.scope.lines.some((l) => !l.isSample)
            ? g.scope.lines.filter((l) => !l.isSample)
            : g.scope.lines,
        ),
        // Unsaved recipe edits on that colourway = the saved pin may be stale: open, never run.
        autoRun:
          deepAuto &&
          !(
            deepColorway && (staging?.peek() ?? []).some((c) => c.key === `recipe:${deepColorway}`)
          ),
        colorwayId: deepColorway || undefined,
      });
      return;
    }
    // No pattern for that fabric: show its slot (anchor on the tile), else the shelf.
    if (g) setSelectedKey(g.scope.key);
    const anchor = g ? `patterns.slot.${g.scope.lines[0]?.lineKey ?? deepMarker}` : '';
    window.setTimeout(() => {
      if (!anchor || !revealField(anchor)) revealField('patterns.shelf');
    }, 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deepMarker, scopeGroups, scopes.length]);
  // autoRun waits until the deep link's colourway is known from the SAVED card and its pinned
  // article for that line is loaded — otherwise the run would measure the BOM line's width.
  const nestingCwReady = (() => {
    if (!nesting?.colorwayId) return true;
    const cw = colorwayOptions.find((c) => c.colorwayId === nesting.colorwayId);
    if (!cw) return false;
    const pin = cw.widthByLine.get(nesting.bomLineKey);
    return !pin || materialById.has(pin.materialId ?? 0);
  })();
  // The size range lives on its own SIZES tab now (index.tsx). The door switches the card there —
  // a sibling `hidden` panel, already mounted — and revealField pulses its `data-field` anchor.
  const sizeRangeDoor: HeaderWarningAction | undefined = headerEl
    ? {
        label: 'open size range',
        onClick: () => {
          setParams(
            (prev) => {
              const p = new URLSearchParams(prev);
              p.set('tab', 'sizes');
              p.delete('sample');
              p.delete('fits');
              return p;
            },
            { replace: true },
          );
          window.setTimeout(() => revealField('sizeIds'), 0);
        },
      }
    : undefined;
  const reparse: HeaderWarningAction = { label: 'retry', onClick: () => void geometry.refetch() };

  const pieceErrors: HeaderWarning[] = [];
  for (const [k, v] of Object.entries((errors.pieces ?? {}) as Record<string, unknown>)) {
    const i = Number(k);
    const piece = Number.isInteger(i) ? cardPieces[i] : undefined;
    const who = Number.isInteger(i) ? piece?.name?.trim() || `#${i + 1}` : '';
    // A piece has no fabric of its own: its slot is the one its DXF block is linked in.
    const linked = piece?.lineKey
      ? pieceDxfAliases.find((a) => a.pieceLineKey === piece.lineKey)
      : undefined;
    const slot = linked
      ? scopeKeyOfBinding(linked.fabricPurpose, linked.bomLineKey, linkSet)
      : undefined;
    for (const m of messagesOf(v))
      pieceErrors.push({
        text: who ? `piece ${who}: ${m}` : `pieces: ${m}`,
        error: true,
        action: piecesDoor(slot),
      });
  }
  for (const [k, v] of Object.entries((errors.pieceDxfAliases ?? {}) as Record<string, unknown>)) {
    const i = Number(k);
    const alias = Number.isInteger(i) ? pieceDxfAliases[i] : undefined;
    const who = Number.isInteger(i) ? alias?.blockName?.trim() || `#${i + 1}` : '';
    const slot = alias
      ? scopeKeyOfBinding(alias.fabricPurpose, alias.bomLineKey, linkSet)
      : undefined;
    for (const m of messagesOf(v))
      pieceErrors.push({
        text: who ? `piece ${who}: ${m}` : `pieces: ${m}`,
        error: true,
        action: piecesDoor(slot),
      });
  }
  const followUpFailures: HeaderWarning[] = !importing
    ? (followUp?.rows ?? []).flatMap((r) =>
        (['areas', 'sizeIndex'] as const)
          .filter((step) => r[step].state === 'failed')
          .map((step) => ({
            text: `${r.label}: ${step === 'areas' ? 'piece areas' : 'size index'} not saved, ${r[step].detail}`,
            error: true,
            action: {
              label: 'retry',
              onClick: () => retryFollowUp({ scopeKey: r.scopeKey, step }),
            },
          })),
      )
    : [];
  const unitsWarning: HeaderWarning | null =
    unitless.length > 0
      ? {
          text: `units guessed: ${unitless.length} ${plural(unitless.length, 'sheet')}`,
          action: canEdit
            ? {
                label: unitsFetching ? 'set units…' : 'set units',
                onClick: () => void setUnitsOfExisting(),
                disabled: unitsFetching || isSubmitting,
              }
            : undefined,
        }
      : null;
  const outOfRangeAction: HeaderWarningAction | undefined =
    canEdit && storageSizeId > 0
      ? {
          label: 're-file',
          disabled: isSubmitting,
          onClick: () => {
            for (const e of outOfRange)
              setValue(`patterns.${e.index}.sizeId`, storageSizeId, { shouldDirty: true });
          },
        }
      : sizeRangeDoor;
  const parserWarnings: HeaderWarning[] = (geometry.data?.warnings ?? [])
    .filter((w) => !w.includes(UNITS_GUESS))
    .map((w) => (isFetchFailure(w) ? { text: w, action: reparse } : w));
  const missingSizeWarnings: HeaderWarning[] = missingSizeNotes.map((text) => ({
    text,
    action: sizeRangeDoor,
  }));
  const noPatternWarnings: HeaderWarning[] = materialsWithoutDxf.map((g) => ({
    text: `${scopeLabel(g.scope)}: no pattern`,
    action: canUpload ? { label: 'add files', onClick: () => openPicker(g.scope.key) } : undefined,
  }));
  const indexWarnings: HeaderWarning[] = Object.entries(indexFailures).flatMap(([sig, reason]) => {
    const g = scopeGroups.find((x) => x.entries.length > 0 && sigOf(x.entries) === sig);
    if (!g) return [];
    return [
      {
        text: `size index not saved: ${reason}`,
        action: {
          label: 'retry',
          onClick: () => void publishIndexForRef.current(g.scope.key, true),
        },
      },
    ];
  });
  // Auto piece-area refusals: a fix only where the reason has one on this screen.
  const areaFix = (k: string, reason: string): HeaderWarningAction | undefined => {
    if (reason.includes('no piece linked') || reason.includes('linked pieces missing'))
      return piecesDoor(k);
    if (reason.includes('download failed') || reason.includes('could not be parsed'))
      return reparse;
    if (reason.includes('no size range')) return sizeRangeDoor;
    return undefined;
  };
  const areaWarnings: HeaderWarning[] = Object.entries(areaRefusals).map(([k, reason]) => ({
    text: `${scopeLabelByKey.get(k) ?? 'pattern'}: ${reason}`,
    action: areaFix(k, reason),
  }));
  const warnings: HeaderWarning[] = [
    ...pieceErrors,
    geometry.isError && {
      text: `parsing failed: ${geometry.error?.message ?? 'reason unknown'}`,
      error: true,
      action: reparse,
    },
    outOfRange.length > 0 && {
      text: `size out of range: ${outOfRange.length} ${plural(outOfRange.length, 'sheet')}`,
      error: true,
      action: outOfRangeAction,
    },
    ...followUpFailures,
    unitsWarning,
    ...parserWarnings,
    ...missingSizeWarnings,
    ...noPatternWarnings,
    ...indexWarnings,
    ...areaWarnings,
  ].filter((w): w is HeaderWarning => !!w);
  const withoutPattern = scopeGroups.filter((g) => g.entries.length === 0).length;
  const header = (
    <>
      {geometry.isFetching && <HeaderNote>parsing…</HeaderNote>}
      {scopeGroups.length > 0 && (
        <HeaderNote>
          materials: {scopeGroups.length} · without pattern: {withoutPattern}
        </HeaderNote>
      )}
      <HeaderWarnings items={warnings} />
    </>
  );
  const headerPortal = headerEl ? createPortal(header, headerEl) : null;

  if (!canEdit && fields.length === 0 && fabricBomLines.length === 0) {
    return (
      <>
        {headerPortal}
        <Placeholder dashed label='add fabric lines in the BOM first' className='h-[84px] w-full' />
      </>
    );
  }

  const occupiedVersion = occupiedAsk ? occupiedVersionDetails(occupiedAsk) : null;
  const occupiedCurrentRevision = shownRevision(occupiedVersion?.current);
  const occupiedNextRevision = occupiedCurrentRevision == null ? null : occupiedCurrentRevision + 1;

  return (
    <div className='space-y-2.5'>
      {headerPortal}
      {!headerEl && <div className='flex flex-wrap items-center gap-1.5'>{header}</div>}

      <input
        ref={fileInputRef}
        type='file'
        multiple
        accept={importOk ? SLOT_ACCEPT_ALL : SLOT_ACCEPT_DXF}
        className='sr-only'
        tabIndex={-1}
        aria-hidden
        onChange={(e) => {
          routeFiles(pickFor.current, e.target.files, undefined, pickDxfOnly.current);
          // Reset so re-picking the same file re-fires onChange.
          e.target.value = '';
        }}
      />

      {followUp && techCardId && followUpPending(followUp.rows) && (
        <Suspense fallback={null}>
          <ImportFollowUpRunner
            job={followUp}
            techCardId={techCardId}
            scopes={scopes}
            sheetsOfScope={sheetsOfScope}
            aliasesOfScope={(sc) => pieceDxfAliases.filter((a) => aliasInScope(a, sc, linkSet))}
            sizeIds={sizeIds}
            savedSizeIds={savedSizeIds}
            sizeNameById={sizeById}
            sourceDirty={sourceDirty}
            publishIndex={(k, force) => publishIndexForRef.current(k, force)}
            onRows={(id, rows) => setFollowUp((j) => (j && j.id === id ? { ...j, rows } : j))}
          />
        </Suspense>
      )}

      {/* Якорь `patterns.shelf` — цель перехода из вкладки операций: сетка слотов стоит всегда. */}
      {(shelfKeys.length > 0 || canEdit) && (
        <>
          <div data-field='patterns.shelf'>
            <Tiles min={200}>
              {scopeGroups.map(renderTile)}
              {pdfEntries.length > 0 && renderExtraTile(PDF_KEY, 'PDF', pdfEntries)}
              {canEdit && (
                <Tile
                  dashed
                  title='Add slot'
                  className='min-h-36 items-center justify-center text-labelColor hover:text-textColor'
                  onClick={addMaterialSlot}
                >
                  <Text size='control' variant='label' className='uppercase tracking-label'>
                    + slot
                  </Text>
                </Tile>
              )}
            </Tiles>
          </div>
          {renderSelected()}
        </>
      )}

      {renderImportWizard()}

      {merging && (
        <Suspense fallback={null}>
          <MergeSizesModal
            open
            initialFiles={merging.files}
            scopeKey={merging.scopeKey}
            onClose={() => setMerging(null)}
            onReady={(file, scopeKey) => {
              const pending = merging;
              setMerging(null);
              void (async () => {
                const readyScope = scopeKey ?? pending.scopeKey;
                const applied = await directUpload(
                  readyScope,
                  file,
                  undefined,
                  !scopeKey || scopeKey === pending.scopeKey ? pending.target : undefined,
                );
                if (applied) await pending.afterReady?.();
              })();
            }}
          />
        </Suspense>
      )}

      {renderVersions()}
      {renderRemovedVersions()}

      <ConfirmationModal
        open={occupiedAsk != null}
        onOpenChange={(open) => {
          if (!open) setOccupiedAsk(null);
        }}
        onConfirm={() => {
          if (occupiedAsk) void chooseOccupied(occupiedAsk, 'replace');
        }}
        onCancel={() => setOccupiedAsk(null)}
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          occupiedCancelRef.current?.focus();
        }}
        cancelRef={occupiedCancelRef}
        title={
          occupiedNextRevision == null ? 'new version' : `new version · v${occupiedNextRevision}`
        }
        confirmLabel='new version'
        width='sm'
        footerActions={
          <Button
            variant='secondary'
            size='sm'
            onClick={() => {
              if (occupiedAsk) void chooseOccupied(occupiedAsk, 'merge');
            }}
          >
            {occupiedCurrentRevision == null
              ? 'merge with current'
              : `merge with v${occupiedCurrentRevision}`}
          </Button>
        }
      >
        <div>
          <Row
            label={
              <span className='flex min-w-0 items-baseline gap-2.5'>
                <Text component='span' variant='label' className='shrink-0 tabular-nums'>
                  {occupiedCurrentRevision == null ? 'current' : `v${occupiedCurrentRevision}`}
                </Text>
                <Text component='span' className='min-w-0 break-all'>
                  {fileNameOf(occupiedVersion?.current)}
                </Text>
              </span>
            }
          />
          <Row
            label={
              <span className='flex min-w-0 items-baseline gap-2.5'>
                <Text component='span' variant='label' className='shrink-0 tabular-nums'>
                  {occupiedNextRevision == null ? 'new' : `v${occupiedNextRevision}`}
                </Text>
                <Text component='span' className='min-w-0 break-all'>
                  {occupiedVersion?.incomingNames.join(' + ') ?? ''}
                </Text>
              </span>
            }
          />
        </div>
      </ConfirmationModal>

      <ConfirmationModal
        open={deleting != null}
        onOpenChange={(o) => {
          if (!o) setDeleting(null);
        }}
        onConfirm={() => {
          const rowId = deleting?.rowId;
          setDeleting(null);
          if (rowId) void confirmDelete(rowId);
        }}
        title='delete file'
        confirmLabel='delete'
        width='sm'
      >
        <div className='flex flex-col gap-2'>
          <Text className='break-all'>{deleting?.name}</Text>
          {deleting?.counts && (
            <Text className='text-error tabular-nums'>
              ! removes {deleting.counts.pieces} pieces · {deleting.counts.steps} steps
            </Text>
          )}
        </div>
      </ConfirmationModal>

      {printing && (
        <Suspense fallback={null}>
          <RollPrintDialog target={printing} onClose={() => setPrinting(null)} />
        </Suspense>
      )}

      {/* In-app PDF viewer, kept for the legacy rows. */}
      <ConfirmationModal
        open={viewing != null && !isDxfUrl(viewing.url)}
        onOpenChange={(o) => {
          if (!o) setViewing(null);
        }}
        onConfirm={() => setViewing(null)}
        title={viewing ? labelOf(viewing) : 'pattern'}
        width='lg'
        hideActions
      >
        <div className='space-y-2'>
          <div className='flex flex-wrap items-center gap-2'>
            <Text size='micro' variant='label' component='span' className='min-w-0 flex-1 truncate'>
              {viewing?.filename}
              {viewing?.sizeBytes ? ` · ${formatBytes(viewing.sizeBytes)}` : ''}
            </Text>
            <Button asChild variant='secondary' size='xs'>
              <a href={viewing?.url || '#'} target='_blank' rel='noopener noreferrer'>
                open in new tab
              </a>
            </Button>
          </div>
          <iframe
            src={viewing?.url}
            title={viewing ? labelOf(viewing) : 'pattern'}
            className='h-[75vh] w-full border border-borderColor bg-bgColor'
          />
        </div>
      </ConfirmationModal>

      <DxfUnitsDialog
        items={unitsAsk?.items ?? null}
        busy={unitsBusy}
        onCancel={() => unitsAsk?.cancel()}
        onConfirm={async (units) => {
          if (!unitsAsk) return;
          setUnitsBusy(true);
          try {
            await unitsAsk.confirm(units);
          } finally {
            setUnitsBusy(false);
          }
        }}
      />

      <DxfSizesDialog
        ask={sizesAsk?.ask ?? null}
        onCancel={() => sizesAsk?.cancel()}
        onConfirm={(picks) => sizesAsk?.confirm(picks)}
      />

      {/* Раскладка (nesting) — the whole feature is a lazy chunk; mounted only when open. */}
      {nesting && (
        <Suspense fallback={null}>
          <NestingModal
            files={nesting.files}
            sizeLabel=''
            sizeIdByToken={sizeIdByToken}
            techCardId={techCardId}
            sizeId={nesting.sizeId}
            bomLines={fabricBomLines}
            colorways={colorwayOptions}
            lockedBomLineKey={nesting.bomLineKey || undefined}
            fabricDirection={nesting.fabricDirection}
            canEdit={canEdit}
            savedSizeIds={savedSizeIds}
            season={season}
            styleNumber={styleNumber}
            pieceAliases={nesting.aliases}
            requiredSeamAllowanceMm={cardSeamAllowanceMm}
            autoRun={!!nesting.autoRun && nestingCwReady}
            initialColorwayId={nesting.colorwayId}
            onClose={() => setNesting(null)}
          />
        </Suspense>
      )}

      {/* Просмотр деталей слота — тот же ленивый чанк (общий воркер разбора). */}
      {matching && (
        <Suspense fallback={null}>
          <PieceMatchModal
            files={matching.files}
            scope={matching.scope}
            scopes={scopes}
            fabricName={matching.fabricName}
            scopeLabelByKey={scopeLabelByKey}
            sizeLabel=''
            // Состав потерь живёт только в ответе сервера (рецепт колорвеев, площади).
            colorways={cardRead?.colorways}
            pieceAreaScopes={cardRead?.pieceAreaScopes}
            techCardId={techCardId}
            saveSessionId={saveSessionId}
            knownPieceShapes={knownPieceShapes}
            preferredShapeSizeTokens={preferredShapeSizeTokens}
            interlining={matchingInterlining}
            interliningOwnerFiles={interliningOwnerFiles}
            onUploadInterliningFile={(lineKey, files) =>
              routeFiles(lineKey, files, undefined, true)
            }
            onPickInterliningFile={(lineKey) => openPicker(lineKey, true)}
            readOnly={!canEdit}
            onClose={closePieces}
          />
        </Suspense>
      )}
    </div>
  );
}
