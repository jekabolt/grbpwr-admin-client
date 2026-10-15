import type { common_Material } from 'api/proto-http/admin';
import { useMaterials } from 'components/managers/materials/components/useMaterials';
import {
  useSizeNames,
  useSizeOrdering,
} from 'components/managers/model/components/use-size-systems';
import { formatSizeName } from 'components/managers/product/utility/sizes';
import { formatTechCardDate } from 'components/managers/tech-cards/components/utils';
import { useTechCard } from 'components/managers/tech-cards/components/useTechCardQuery';
import type { PieceDTO } from 'lib/nesting/types';
import { useSnackBarStore } from 'lib/stores/store';
import { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useFieldArray, useFormContext, useFormState, useWatch } from 'react-hook-form';
import { Button } from 'ui/components/button';
import { Chip } from 'ui/components/chip';
import { ConfirmationModal } from 'ui/components/confirmation-modal';
import { GroupLabel } from 'ui/components/group-label';
import { HeaderWarnings, type HeaderWarning } from 'ui/components/header-warnings';
import Input from 'ui/components/input';
import { HeaderNote } from 'ui/components/section-header';
import { Tile, Tiles } from 'ui/components/tiles';
import { uploadPatternFile } from 'ui/components/pattern-upload-button';
import { Pill } from 'ui/components/pill';
import { Placeholder } from 'ui/components/placeholder';
import Text from 'ui/components/text';
import {
  MAX_PATTERN_BYTES,
  MAX_PATTERN_NAME,
  clampPatternName,
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
  aliasScopeKey,
  bindingForScope,
  bomPurposeLabel,
  fabricScopeKey,
  fabricScopes,
  scopeKeyOfBinding,
  strictestDirection,
} from './bom-purpose';
import { sizeTokensOf, uniOf } from './nesting/block-code';
import { useCardDxfPack } from './nesting/card-dxf-pack';
import { dxfByScope, patternSheetName } from './nesting/dxf-by-scope';
import { SheetThumb, useDxfGeometry, useDxfIndex, type DxfIndex } from './nesting/dxf-geometry';
import { publishPatternSizeIndex, type PublishSizeIndexResult } from './pattern-size-index';
import { useUnsavedAreaSource } from './piece-areas';
import { markerColorways } from './nesting/colorway-widths';
import { splitPiecesBySize, useDictionarySizeTokens } from './nesting/use-block-sizes';
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
import { useAutoPieceAreas } from './use-auto-piece-areas';
import { useUniPrefill } from './use-uni-prefill';

// The whole nesting feature (modal + worker + dxf/clipper deps) lives in a lazy chunk —
// nothing loads until someone actually opens a раскладка.
const NestingModal = lazy(() =>
  import('./nesting/nesting-modal').then((m) => ({ default: m.NestingModal })),
);
// Просмотр DXF нашим листом — из того же ленивого чанка: воркер и парсер общие.
const DxfSheetViewer = lazy(() =>
  import('./nesting/dxf-sheet-viewer').then((m) => ({ default: m.DxfSheetViewer })),
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

// Плитки полки, у которых нет ключа скоупа: они не материал, но выбираются тем же кликом.
// Префикс с двумя подчёркиваниями — ключ скоупа так выглядеть не может (это либо enum назначения,
// либо ULID строки BOM, либо пустая строка), так что коллизия невозможна по построению.
const LOOSE_KEY = '__loose';
const PDF_KEY = '__pdf';

// What a slot takes: DXF uploads directly, everything else goes through the import wizard
// (its files step accepts the same list, pattern-import/steps/files.tsx).
const SLOT_ACCEPT_DXF = '.dxf,image/vnd.dxf';
const SLOT_ACCEPT_ALL = `${SLOT_ACCEPT_DXF},.pdf,.plt,.hpgl,.hpg,.svg,.ai,.eps,.png,.jpg,.jpeg,.tif,.tiff`;
const IMPORT_EXT = new Set(SLOT_ACCEPT_ALL.split(',').filter((x) => x.startsWith('.')));

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
};
type Entry = { row: PatternRow; index: number };

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

// What the operator calls the sheet — the display name when given, else the filename.
function labelOf(row?: PatternRow): string {
  return row?.name || row?.filename || '(unnamed)';
}

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
export function PatternsField({
  techCardId,
  active,
  canEdit = true,
  canPublishIndex = true,
  savedSizeIds,
  headerEl,
}: {
  techCardId?: number;
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
  const { control, setValue, getValues } = useFormContext<TechCardFormData>();
  // The import wizard's apply ends in the card's own save (F7): the page has no save button.
  const autosave = useTechCardAutosave();
  const { showMessage } = useSnackBarStore();
  const { fields, append, remove } = useFieldArray({ control, name: 'patterns' });
  const sizeIds = (useWatch({ control, name: 'sizeIds' }) ?? []) as number[];
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
  const cardPieces = (useWatch({ control, name: 'pieces' }) ?? []) as Array<{
    lineKey?: string;
    name?: string;
    cutSymmetry?: string;
    piecesPerGarment?: number;
    fused?: boolean;
    fusingMode?: string;
  }>;
  const styleNumber = (useWatch({ control, name: 'styleNumber' }) ?? '') as string;
  const cardName = (useWatch({ control, name: 'name' }) ?? '') as string;

  const sizeById = useSizeNames();
  const orderSizes = useSizeOrdering();
  const dictTokens = useDictionarySizeTokens();

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
  const { data: materialsData } = useMaterials('', true, !!techCardId);
  const colorwayOptions = useMemo(() => {
    const byId = new Map<number, common_Material>();
    for (const m of materialsData?.materials ?? []) {
      const id = Number(m.id ?? 0);
      if (id) byId.set(id, m);
    }
    return markerColorways(cardRead, byId);
  }, [cardRead?.techCard, materialsData?.materials]);

  // Материал, над которым сейчас висит перетаскиваемый файл ('' = ничей).
  const [dragKey, setDragKey] = useState<string | null>(null);
  // Several DXFs dropped on one slot: the size merge, then a direct upload into that slot.
  const [merging, setMerging] = useState<{ scopeKey: string; files: File[] } | null>(null);
  // Non-DXF files dropped on a slot: the import wizard, starting from those files.
  const [importing, setImporting] = useState<{ scopeKey: string; files: File[] } | null>(null);
  // Direct uploads in flight, per slot.
  const [uploading, setUploading] = useState<Record<string, number>>({});
  // Open the pieces viewer of this slot as soon as the form holds these sheet urls.
  const [pendingView, setPendingView] = useState<{ scopeKey: string; urls: string[] } | null>(
    null,
  );
  // The hidden picker and the slot it was opened for.
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pickFor = useRef('');
  // The pattern sheet open in the in-app viewer (null = closed). Legacy PDF and DXF rows share
  // this state and split into the two viewers at the bottom.
  const [viewing, setViewing] = useState<PatternRow | null>(null);
  // Inline rename in progress: which row and the draft value.
  const [editing, setEditing] = useState<{ index: number; value: string } | null>(null);
  // Строка, у которой сейчас открыт селект материала. Перепривязка — редкое действие, и держать
  // её селект открытым у каждой строки значило печатать ответ под заголовком, который его уже дал.
  const [rebinding, setRebinding] = useState<number | null>(null);
  // Разбор включён. ЛАТЧ, а не зеркало `active`: уход на соседнюю вкладку не имеет права отменить
  // уже идущее скачивание (React Query бросил бы запрос на полпути и следующий заход начал бы его
  // заново), а вернувшись, оператор должен увидеть готовый ответ, а не второй разбор.
  const [armed, setArmed] = useState(active);
  useEffect(() => {
    if (active) setArmed(true);
  }, [active]);
  // Выбранная плитка полки: ключ скоупа, LOOSE_KEY или PDF_KEY. null = экран ещё не трогали, и
  // выбор выводится из данных (первый материал с файлами, иначе первый вообще).
  const [pickedKey, setPickedKey] = useState<string | null>(null);
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
  } | null>(null);
  // «сопоставить детали»: the same DXF set, opened against the cut-piece list instead of the
  // nesting engine (null = closed).
  const [matching, setMatching] = useState<{
    scope: FabricScope<FabricLine>;
    fabricName: string;
    files: NestingFile[];
  } | null>(null);
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
          order: i,
        }))
        // Основная ткань первой, дальше подклад/бортовка/утеплитель — порядок ролей, а не
        // порядок строк BOM: в списке из восьми строк глаз ищет роль, а не позицию.
        .sort(
          (a, b) =>
            SECTION_ORDER.indexOf(a.section) - SECTION_ORDER.indexOf(b.section) ||
            a.order - b.order,
        ),
    [bomItems],
  );
  // Скоупы — то, к чему выкройка привязывается с 0267: одна группа на НАЗНАЧЕНИЕ и одна на каждую
  // ещё не разложенную строку. У неразобранной карточки назначений нет вовсе, поэтому каждая
  // строка остаётся своей группой — то есть панель ведёт себя ровно как до 0267, без единого
  // действия оператора. Разложил BOM по назначениям — группы схлопнулись сами.
  //
  // Строки берутся из формы, сохранённые и нет. Сейв карточки апсертит BOM ДО того, как сверяет
  // выкройки и алиасы (techcard.go: bom :1185, aliases :1198, patterns :1223), так что строка,
  // заведённая на вкладке BOM минуту назад, резолвится к моменту использования ключа.
  const scopes = useMemo(() => fabricScopes(fabricBomLines), [fabricBomLines]);
  // Подпись скоупа. У назначения — само назначение и артикулы, которые в него разложены: «основной
  // материал · Твил 1, Твил 2». Одно назначение законно владеет несколькими строками, и оператору
  // всё ещё нужно видеть, какими именно. У неразобранной строки — «роль · название», как и было.
  const scopeLabel = (s: FabricScope<FabricLine>): string => {
    if (!s.byPurpose) {
      const l = s.lines[0];
      return [l?.role, l?.name.trim()].filter(Boolean).join(' · ') || 'unnamed';
    }
    const names = s.lines
      .map((l) => l.name.trim())
      .filter(Boolean)
      .join(', ');
    return [bomPurposeLabel(s.key), names].filter(Boolean).join(' · ');
  };
  const uploadScopes = useMemo(
    () => scopes.map((s) => ({ key: s.key, label: scopeLabel(s) })),
    [scopes],
  );

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
    () => dxfByScope(dxfEntries, scopes, (e) => e.row),
    [dxfEntries, scopes],
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
  // DXF без живой привязки: залитые до 0260 (ключа нет вовсе) и те, чью строку BOM удалили или
  // переклассифицировали. Раскладка для них — догадка, поэтому они собраны отдельно и с ошибкой.
  const looseDxf = useMemo(() => dxfByScopeMap.get('') ?? [], [dxfByScopeMap]);

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
    () => [
      ...scopeGroups.map((g) => g.scope.key),
      ...(looseDxf.length > 0 ? [LOOSE_KEY] : []),
      ...(pdfEntries.length > 0 ? [PDF_KEY] : []),
    ],
    [scopeGroups, looseDxf.length, pdfEntries.length],
  );
  // Фолбэк идёт ЗА ФАЙЛАМИ, а не за материалами: на карточке, где все DXF залиты до 0260 (значит
  // все непривязанные) или остались только PDF, «первый материал» — это пустая плитка «раскроить
  // нечем», и настоящие файлы оказывались за неподсвеченной плиткой.
  const selectedKey =
    pickedKey && shelfKeys.includes(pickedKey)
      ? pickedKey
      : scopeGroups.find((g) => g.entries.length > 0)?.scope.key ??
        (looseDxf.length > 0 ? LOOSE_KEY : null) ??
        (pdfEntries.length > 0 ? PDF_KEY : null) ??
        shelfKeys[0] ??
        null;
  const setSelectedKey = setPickedKey;

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
  // градацию, и ряд из этих же файлов потом и набирают.
  const canUpload = canEdit && uploadScopes.length > 0;

  // Слот принимает файлы только когда есть размерный ряд: и склейка, и импорт раскладывают
  // размеры файла по ряду карточки.
  const canDrop = canUpload && sizeIds.length > 0;
  const importOk = PATTERN_IMPORT_ENABLED && !!techCardId;

  function openPicker(scopeKey: string) {
    if (!canDrop) return;
    pickFor.current = scopeKey;
    fileInputRef.current?.click();
  }

  const scopeOfKey = (key: string) => scopes.find((x) => x.key === key);
  const bindingOf = (key: string) => {
    const sc = scopeOfKey(key);
    return sc ? bindingForScope(sc) : { fabricPurpose: '', bomLineKey: '' };
  };

  // One DXF into one slot: no naming modal (the slot is the material, the name is the file's).
  async function directUpload(scopeKey: string, file: File) {
    const bump = (d: number) =>
      setUploading((u) => {
        const n = (u[scopeKey] ?? 0) + d;
        const { [scopeKey]: _gone, ...rest } = u;
        return n > 0 ? { ...rest, [scopeKey]: n } : rest;
      });
    bump(1);
    try {
      const up = await uploadPatternFile(file);
      append({ sizeId: storageSizeId, lineKey: ulid(), ...up, ...bindingOf(scopeKey) });
      setPendingView({ scopeKey, urls: [up.url] });
    } catch (e) {
      console.error('UploadPattern failed', e);
      showMessage(`${file.name}: ${patternUploadErrorMessage(e)}`, 'error');
    } finally {
      bump(-1);
    }
  }

  // The file router: tile drop, tile click and «add files» all land here.
  //   1 DXF → direct upload → pieces; ≥2 DXF → size merge → upload → pieces;
  //   anything else → import wizard → apply → pieces.
  function routeFiles(scopeKey: string, list: FileList | File[] | null) {
    // Array.from, not spread — FileList iteration needs lib dom.iterable, which tsconfig omits.
    const files = list ? Array.from(list) : [];
    if (files.length === 0 || !canDrop) return;
    const errOf = (f: File): string | null => {
      if (isDxfFile(f)) return patternFileError(f, { dxfOnly: true });
      const ext = (f.name.match(/\.[^.]+$/)?.[0] ?? '').toLowerCase();
      if (!importOk || !IMPORT_EXT.has(ext)) return 'DXF only';
      return f.size > MAX_PATTERN_BYTES ? 'too large, 40 MB at most' : null;
    };
    const checked = files.map((f) => ({ f, err: errOf(f) }));
    for (const x of checked) if (x.err) showMessage(`${x.f.name}: ${x.err}`, 'error');
    const good = checked.filter((x) => !x.err).map((x) => x.f);
    if (good.length === 0) return;
    setSelectedKey(scopeKey);
    if (good.every(isDxfFile)) {
      if (good.length === 1) void directUpload(scopeKey, good[0]);
      else setMerging({ scopeKey, files: good });
      return;
    }
    setImporting({ scopeKey, files: good });
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
    enabled: active && canEdit && canPublishIndex && !!techCardId,
  });

  const openPieces = (g: (typeof scopeGroups)[number]) =>
    setMatching({ scope: g.scope, fabricName: scopeLabel(g.scope), files: filesOf(g.entries) });

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

  function renderSheetRow({ row, index }: Entry) {
    const dxf = isDxfUrl(row.url);
    const rev = revisionOf(row);
    // Лист БЕЗ размера (0281) — не «размер вне ряда»: сервер его с рядом не сверяет.
    const stray = !!row.sizeId && !inRange.has(row.sizeId);
    // Разрешённый скоуп строки: сначала назначение, иначе строка BOM. '' = ни к чему живому.
    const rowScope = scopeKeyOfBinding(row.fabricPurpose, row.bomLineKey, scopes);
    const converted = (row.url && bundle?.manifestByUrl?.get(row.url)) || null;
    const distrust = (row.url && bundle?.manifestDistrustByUrl?.get(row.url)) || null;
    const meta = [rev != null ? `v${rev}` : '', row.sizeBytes ? formatBytes(row.sizeBytes) : '']
      .filter(Boolean)
      .join(' · ');

    return (
      <li key={row.lineKey || `row-${index}`} className='py-1'>
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
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setEditing({ index, value: e.target.value })
                }
                onBlur={() => commitRename(index, editing.value)}
                onKeyDown={(e: React.KeyboardEvent) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    commitRename(index, editing.value);
                  }
                  if (e.key === 'Escape') setEditing(null);
                }}
              />
            ) : (
              <span className='flex flex-wrap items-center gap-1.5'>
                <button
                  type='button'
                  onClick={() => setViewing(row)}
                  title={row.filename || undefined}
                  className='min-w-0 truncate text-left text-micro underline hover:opacity-70'
                >
                  {labelOf(row)}
                </button>
                {!dxf && <Pill tone='mut'>pdf</Pill>}
                {converted && (
                  <Pill tone='mut' title={convertedTitle(converted)}>
                    converted
                  </Pill>
                )}
                {converted?.autopilot && (
                  <AutopilotPill assumptions={converted.autopilot.assumptions} />
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
          {meta && (
            <Text size='nano' variant='label' component='span' className='shrink-0 tabular-nums'>
              {meta}
            </Text>
          )}
          <span className='inline-flex shrink-0 gap-1'>
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
            {dxf && uploadScopes.length > 0 && canEdit && (
              <Button
                type='button'
                variant='secondary'
                size='xs'
                aria-label='rebind pattern'
                onClick={() => setRebinding((r) => (r === index ? null : index))}
              >
                ⇄
              </Button>
            )}
            <Button
              type='button'
              variant='secondary'
              size='xs'
              aria-label='rename pattern'
              disabled={isSubmitting}
              onClick={() => setEditing({ index, value: row.name ?? '' })}
            >
              ✎
            </Button>
            <Button
              type='button'
              variant='secondary'
              size='xs'
              aria-label='remove pattern'
              onClick={() => remove(index)}
            >
              ✕
            </Button>
          </span>
        </div>
        {/* Перепривязка за «⇄»; пишутся ОБА поля разом через bindingForScope — иначе лист лежит в
            панели в одной ткани, а на сервере разрешается в другую. */}
        {dxf && uploadScopes.length > 0 && (rebinding === index || !rowScope) && (
          <select
            className='mt-0.5 h-6 w-full border border-hairline bg-bgColor px-1 text-nano'
            aria-label={`material for ${labelOf(row)}`}
            value={rowScope}
            disabled={isSubmitting || !canEdit}
            onChange={(e) => {
              const b = bindingOf(e.target.value);
              setValue(`patterns.${index}.fabricPurpose`, b.fabricPurpose, { shouldDirty: true });
              setValue(`patterns.${index}.bomLineKey`, b.bomLineKey, { shouldDirty: true });
              setRebinding(null);
            }}
          >
            <option value=''>
              {!rowScope && (!!row.bomLineKey || !!row.fabricPurpose)
                ? 'binding lost, pick again'
                : 'pick a material'}
            </option>
            {uploadScopes.map((s) => (
              <option key={s.key} value={s.key}>
                {s.label}
              </option>
            ))}
          </select>
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
            <Chip key={t} tone='default'>
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
            <Chip key={id} selected={!gone} tone={gone ? 'error' : 'default'}>
              {nameOf(id)}
            </Chip>
          );
        })}
      </span>
    );
  }

  // Плитка слота живёт дроп-зоной: файлы на неё идут в роутер.
  const dropProps = (key: string) =>
    canDrop
      ? {
          onDragOver: (e: React.DragEvent) => {
            e.preventDefault();
            setDragKey(key);
          },
          onDragLeave: () => setDragKey((k) => (k === key ? null : k)),
          onDrop: (e: React.DragEvent) => {
            e.preventDefault();
            setDragKey(null);
            routeFiles(key, e.dataTransfer.files);
          },
        }
      : {};

  // ── СЛОТЫ: одна плитка на материал карточки ─────────────────────────────────────────────
  function renderTile(g: (typeof scopeGroups)[number]) {
    const key = g.scope.key;
    const label = scopeLabel(g.scope);
    const has = g.entries.length > 0;
    const busy = (uploading[key] ?? 0) > 0;
    const blocks = dxfIndex ? countBlocks(dxfIndex, key) : 0;
    const a = audits[sigOf(g.entries)];
    const missing = a?.phase === 'ready' ? missingIn(a) : [];
    const empty = (
      <Placeholder dashed className='h-[84px] w-full'>
        <span className='flex flex-col items-center gap-0.5 text-center'>
          {busy ? (
            <span>uploading…</span>
          ) : !canDrop ? (
            <span>{canUpload ? 'set the size range first' : 'no pattern'}</span>
          ) : (
            <>
              <span>drop pattern files</span>
              <span className='text-nano text-labelColor'>
                {importOk ? 'DXF or PDF' : 'DXF'} · one file or one per size
              </span>
            </>
          )}
        </span>
      </Placeholder>
    );
    return (
      <div
        key={key}
        className={dragKey === key ? 'outline outline-2 outline-textColor' : undefined}
        {...dropProps(key)}
      >
        <Tile
          selected={has && selectedKey === key}
          dashed={!has}
          tone={missing.length > 0 ? 'error' : 'default'}
          onClick={() => {
            setSelectedKey(key);
            if (!has) openPicker(key);
          }}
          title={label}
          media={
            !has ? (
              empty
            ) : busy ? (
              <Placeholder dashed label='uploading…' className='h-[84px] w-full' />
            ) : dxfIndex && blocks > 0 ? (
              <div className='flex h-[84px] w-full items-center justify-center border border-borderColor bg-bgZebra p-1'>
                <SheetThumb index={dxfIndex} scopeKey={key} className='h-full w-full' />
              </div>
            ) : (
              <Placeholder
                dashed
                label={geometry.isError ? 'parse error' : dxfIndex ? 'no shapes found' : 'parsing…'}
                className='h-[84px] w-full'
              />
            )
          }
          name={label}
          sub={has && blocks > 0 ? `${blocks} ${plural(blocks, 'piece')}` : undefined}
        >
          {has && <span className='mt-1 block'>{renderCoverage(g.entries)}</span>}
        </Tile>
      </div>
    );
  }

  /** Плитка для того, что материалом не подписано: непривязанные DXF и наследие в PDF. */
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

  // Панель выбранного слота: файлы и две двери (pieces, marker) + add files.
  function renderSelected() {
    if (selectedKey === LOOSE_KEY) {
      return (
        <div>
          <GroupLabel>without a material</GroupLabel>
          {sheetList(looseDxf)}
        </div>
      );
    }
    if (selectedKey === PDF_KEY) {
      return (
        <div>
          <GroupLabel>PDF</GroupLabel>
          {sheetList(pdfEntries)}
        </div>
      );
    }
    const g = scopeGroups.find((x) => x.scope.key === selectedKey);
    if (!g || g.entries.length === 0) return null;
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
                    aliases: pieceDxfAliases.filter((al) => aliasInScope(al, g.scope)),
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
              {canDrop && (
                <Button
                  type='button'
                  variant='underline'
                  size='xs'
                  className={door}
                  onClick={() => openPicker(g.scope.key)}
                >
                  add files
                </Button>
              )}
            </div>
          }
        >
          {label}
        </GroupLabel>
        {sheetList(g.entries)}
      </div>
    );
  }

  // Мастер импорта: только с файлами, брошенными на слот.
  const renderImportWizard = () =>
    techCardId && importing ? (
      <Suspense fallback={null}>
        <ImportWizard
          initialFiles={importing.files}
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
            aliases: pieceDxfAliases.map((a) => ({
              scopeKey: aliasScopeKey(a),
              blockName: a.blockName,
              pieceLineKey: a.pieceLineKey,
            })),
            patterns: liveRows.map((p) => ({
              scopeKey: fabricScopeKey(p.fabricPurpose, p.bomLineKey),
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
              save: (reason) => autosave.flush(reason),
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
  const pieceErrors: HeaderWarning[] = [];
  for (const [k, v] of Object.entries((errors.pieces ?? {}) as Record<string, unknown>)) {
    const i = Number(k);
    const who = Number.isInteger(i) ? cardPieces[i]?.name?.trim() || `#${i + 1}` : '';
    for (const m of messagesOf(v))
      pieceErrors.push({ text: who ? `piece ${who}: ${m}` : `pieces: ${m}`, error: true });
  }
  for (const [k, v] of Object.entries((errors.pieceDxfAliases ?? {}) as Record<string, unknown>)) {
    const i = Number(k);
    const who = Number.isInteger(i) ? pieceDxfAliases[i]?.blockName?.trim() || `#${i + 1}` : '';
    for (const m of messagesOf(v))
      pieceErrors.push({ text: who ? `piece ${who}: ${m}` : `pieces: ${m}`, error: true });
  }
  const followUpFailures = !importing
    ? (followUp?.rows ?? []).flatMap((r) =>
        (['areas', 'sizeIndex'] as const)
          .filter((step) => r[step].state === 'failed')
          .map((step) => ({
            text: `${r.label}: ${step === 'areas' ? 'piece areas' : 'size index'} not saved, ${r[step].detail}`,
            error: true,
          })),
      )
    : [];
  const warnings: HeaderWarning[] = [
    ...pieceErrors,
    geometry.isError && {
      text: `parsing failed: ${geometry.error?.message ?? 'reason unknown'}`,
      error: true,
    },
    outOfRange.length > 0 && {
      text: `size out of range: ${outOfRange.length} ${plural(outOfRange.length, 'sheet')}, re-file before saving`,
      error: true,
    },
    ...followUpFailures,
    ...(geometry.data?.warnings ?? []),
    ...missingSizeNotes,
    ...materialsWithoutDxf.map((g) => `${scopeLabel(g.scope)}: no pattern`),
    looseDxf.length > 0 && `without a material: ${looseDxf.length}`,
    ...Object.entries(indexFailures)
      .filter(([sig]) => scopeGroups.some((g) => g.entries.length > 0 && sigOf(g.entries) === sig))
      .map(([, reason]) => `size index not saved: ${reason}`),
    ...Object.entries(areaRefusals).map(
      ([k, reason]) => `${scopeLabelByKey.get(k) ?? 'pattern'}: ${reason}`,
    ),
  ].filter((w): w is HeaderWarning => !!w);
  const canRetry = geometry.isError || followUpFailures.length > 0;
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
      {canRetry && (
        <Button
          type='button'
          variant='underline'
          size='xs'
          className={door}
          onClick={() => {
            if (geometry.isError) void geometry.refetch();
            if (followUpFailures.length > 0) retryFollowUp();
          }}
        >
          retry
        </Button>
      )}
    </>
  );
  const headerPortal = headerEl ? createPortal(header, headerEl) : null;

  if (fields.length === 0 && fabricBomLines.length === 0) {
    return (
      <>
        {headerPortal}
        <Placeholder dashed label='add fabric lines in the BOM first' className='h-[84px] w-full' />
      </>
    );
  }

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
          routeFiles(pickFor.current, e.target.files);
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
            aliasesOfScope={(sc) => pieceDxfAliases.filter((a) => aliasInScope(a, sc))}
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
      {shelfKeys.length > 0 && (
        <>
          <div data-field='patterns.shelf'>
            <Tiles min={200}>
              {scopeGroups.map(renderTile)}
              {looseDxf.length > 0 && renderExtraTile(LOOSE_KEY, 'without a material', looseDxf)}
              {pdfEntries.length > 0 && renderExtraTile(PDF_KEY, 'PDF', pdfEntries)}
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
              setMerging(null);
              void directUpload(scopeKey ?? merging.scopeKey, file);
            }}
          />
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

      {/* Просмотр DXF нашим листом: та же геометрия, что у раскладки. */}
      {viewing && isDxfUrl(viewing.url) && (
        <Suspense fallback={null}>
          <DxfSheetViewer
            files={[{ name: labelOf(viewing), url: viewing.url! }]}
            title={labelOf(viewing)}
            onClose={() => setViewing(null)}
          />
        </Suspense>
      )}

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
            fabricName={matching.fabricName}
            scopeLabelByKey={scopeLabelByKey}
            sizeLabel=''
            // Состав потерь живёт только в ответе сервера (рецепт колорвеев, площади).
            colorways={cardRead?.colorways}
            pieceAreaScopes={cardRead?.pieceAreaScopes}
            techCardId={techCardId}
            onClose={() => setMatching(null)}
          />
        </Suspense>
      )}
    </div>
  );
}
