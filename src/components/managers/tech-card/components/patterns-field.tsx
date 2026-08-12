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
import { useFieldArray, useFormContext, useFormState, useWatch } from 'react-hook-form';
import { Button } from 'ui/components/button';
import { CalloutBox } from 'ui/components/callout-box';
import { Chip } from 'ui/components/chip';
import { ConfirmationModal } from 'ui/components/confirmation-modal';
import { GroupLabel } from 'ui/components/group-label';
import Input from 'ui/components/input';
import { Tile, Tiles } from 'ui/components/tiles';
import {
  PatternUploadButton,
  PatternUploadModal,
  type UploadedPattern,
} from 'ui/components/pattern-upload-button';
import { Pill } from 'ui/components/pill';
import { Placeholder } from 'ui/components/placeholder';
import Text from 'ui/components/text';
import {
  MAX_PATTERN_NAME,
  clampPatternName,
  formatBytes,
  isDxfUrl,
  patternFileError,
} from 'utils/pattern';
import { ulid } from 'utils/ulid';
import {
  type FabricScope,
  type ScopeDirection,
  aliasInScope,
  bindingForScope,
  bomPurposeLabel,
  fabricScopes,
  scopeKeyOfBinding,
  strictestDirection,
} from './bom-purpose';
import { sizeTokensOf } from './nesting/block-code';
import { useCardDxfPack } from './nesting/card-dxf-pack';
import { SheetThumb, useDxfGeometry, useDxfIndex, type DxfIndex } from './nesting/dxf-geometry';
import { publishPatternSizeIndex } from './pattern-size-index';
import { markerColorways } from './nesting/colorway-widths';
import { splitPiecesBySize, useDictionarySizeTokens } from './nesting/use-block-sizes';
import type { NestingFile } from './nesting/use-nesting';
import { TechCardFormData } from './schema';

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

// Секции BOM, к которым МОЖНО привязать выкройку. Это ровно те же четыре «рулонные» семьи,
// что стор гросс-апит вейстеджем и что кладёт маркер (rollGoodsSections): подклад, бортовку и
// утеплитель тоже кроят из полотна по лекалу.
// Map, not a plain object: an object literal answers for 'constructor' and 'toString' too, so
// `ROLE[section]` used as a membership test would let those through as truthy inherited functions.
// Unreachable with today's proto enum, but the shape should not depend on that.
const ROLE_OF_SECTION = new Map<string, string>([
  ['TECH_CARD_BOM_SECTION_FABRIC', 'основная ткань'],
  ['TECH_CARD_BOM_SECTION_LINING', 'подкладка'],
  ['TECH_CARD_BOM_SECTION_INTERLINING', 'бортовка'],
  ['TECH_CARD_BOM_SECTION_INSULATION', 'утеплитель'],
]);
const SECTION_ORDER = [...ROLE_OF_SECTION.keys()];

// Плитки полки, у которых нет ключа скоупа: они не материал, но выбираются тем же кликом.
// Префикс с двумя подчёркиваниями — ключ скоупа так выглядеть не может (это либо enum назначения,
// либо ULID строки BOM, либо пустая строка), так что коллизия невозможна по построению.
const LOOSE_KEY = '__loose';
const PDF_KEY = '__pdf';

/** Русская форма счётного существительного: 1 лист, 2 листа, 5 листов. */
function plural(n: number, one: string, few: string, many: string): string {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 14) return many;
  const mod10 = n % 10;
  if (mod10 === 1) return one;
  if (mod10 >= 2 && mod10 <= 4) return few;
  return many;
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
  return row?.name || row?.filename || '(без имени)';
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
  | { phase: 'ready'; found: Set<string> };

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
}: {
  techCardId?: number;
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
  const { control, setValue } = useFormContext<TechCardFormData>();
  const { showMessage } = useSnackBarStore();
  const { fields, append, remove } = useFieldArray({ control, name: 'patterns' });
  const sizeIds = (useWatch({ control, name: 'sizeIds' }) ?? []) as number[];
  // Live row values. `fields` is a snapshot that array actions refresh but setValue on a
  // nested path does NOT — rename writes via setValue (a useFieldArray.update would replace
  // the row and revert any sibling Controller-written field), so display must read live.
  const liveRows = (useWatch({ control, name: 'patterns' }) ?? []) as PatternRow[];
  // A save's form.reset() overwrites concurrent edits and un-dirties them — freeze renames
  // for its duration.
  const { isSubmitting } = useFormState({ control });
  // Осмысленные имена экспортов раскладки: SEASON-STYLE-размер-…
  const season = (useWatch({ control, name: 'season' }) ?? '') as string;
  const styleNumber = (useWatch({ control, name: 'styleNumber' }) ?? '') as string;

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
  // Files dropped onto a material group, staged for the naming modal (click uploads stage inside
  // PatternUploadButton; drops land here because the modal must know which cloth was aimed at).
  const [droppedOn, setDroppedOn] = useState<{ scopeKey: string; files: File[] } | null>(null);
  // Открыта склейка по-размерных выгрузок. Готовый файл она отдаёт в ту же модалку названия и
  // материала, что и обычная загрузка: склейка отвечает за ЧЕРТЁЖ, а не за то, куда он ляжет.
  const [merging, setMerging] = useState(false);
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
      return [l?.role, l?.name.trim()].filter(Boolean).join(' · ') || 'без названия';
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
    id > 0 ? formatSizeName(sizeById.get(id) ?? `#${id}`) : 'без размера';

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
  const dxfByScope = useMemo(() => {
    const m = new Map<string, Entry[]>();
    for (const e of dxfEntries) {
      const key = scopeKeyOfBinding(e.row.fabricPurpose, e.row.bomLineKey, scopes);
      const list = m.get(key) ?? [];
      list.push(e);
      m.set(key, list);
    }
    return m;
  }, [dxfEntries, scopes]);

  // Один блок на скоуп. Скоуп без файлов остаётся в списке: пустая строка «нет DXF» — это и есть
  // дыра, а не повод не рисовать материал.
  const scopeGroups = useMemo(
    () => scopes.map((s) => ({ scope: s, entries: dxfByScope.get(s.key) ?? [] })),
    [scopes, dxfByScope],
  );
  // DXF без живой привязки: залитые до 0260 (ключа нет вовсе) и те, чью строку BOM удалили или
  // переклассифицировали. Раскладка для них — догадка, поэтому они собраны отдельно и с ошибкой.
  const looseDxf = useMemo(() => dxfByScope.get('') ?? [], [dxfByScope]);

  const filesOf = (list: Entry[]): NestingFile[] =>
    list.map(({ row }) => ({ name: row.name || row.filename || 'выкройка.dxf', url: row.url! }));

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
    const out = new Map<string, Set<string>>();
    if (!bundle) return out;
    const byScope = new Map<string, PieceDTO[]>();
    for (const p of bundle.pieces) {
      const k = bundle.scopeByFile.get(p.fileIndex ?? -1) ?? '';
      byScope.set(k, [...(byScope.get(k) ?? []), p]);
    }
    for (const [k, list] of byScope) out.set(k, splitPiecesBySize(list, dictTokens).sizeTokenSet);
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
        // проверки: проверка была, ответ пустой.
        out[sig] = { phase: 'ready', found: foundByScope.get(g.scope.key) ?? new Set<string>() };
      } else if (geometry.isError) {
        out[sig] = { phase: 'error', message: geometry.error?.message ?? 'причина неизвестна' };
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
    return [`${scopeLabel(g.scope)} — нет ${missing.map(nameOf).join(', ')}`];
  });

  // Загрузку гейтит ТКАНЬ, а не размерный ряд: выкройка привязывается к материалу, и без строки BOM
  // её некуда положить — а вот без размерного ряда положить есть куда (лист без размера, 0281).
  // Порядок работы в ателье обратный: DXF приходит от конструктора раньше, чем кто-либо утверждает
  // градацию, и ряд из этих же файлов потом и набирают.
  const canUpload = canEdit && uploadScopes.length > 0;

  // Drop path of the naming modal: pre-flight here (instant feedback, same guards the
  // server enforces), then stage the good files for naming + upload.
  function stageDrop(scopeKey: string, list: FileList | null) {
    // Array.from, not spread — FileList iteration needs lib dom.iterable, which tsconfig omits.
    const files = list ? Array.from(list) : [];
    if (files.length === 0) return;
    const checked = files.map((f) => ({ f, err: patternFileError(f, { dxfOnly: true }) }));
    for (const x of checked) if (x.err) showMessage(`${x.f.name}: ${x.err}`, 'error');
    const good = checked.filter((x) => !x.err).map((x) => x.f);
    if (good.length > 0) setDroppedOn({ scopeKey, files: good });
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
  const publishedRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!canPublishIndex || !techCardId || !bundle) return;
    let cancelled = false;
    (async () => {
      for (const g of scopeGroups) {
        if (g.entries.length === 0) continue;
        const sig = sigOf(g.entries);
        const a = audits[sig];
        if (a?.phase !== 'ready') continue;
        const tokens = [...a.found];
        const key = `${cardReadAt}|${g.scope.key}|${sig}|${[...tokens].sort().join(',')}`;
        if (publishedRef.current.has(key)) continue;
        publishedRef.current.add(key);
        const res = await publishPatternSizeIndex({
          techCardId,
          sheets: g.entries.map((e) => ({
            lineKey: e.row.lineKey,
            fabricPurpose: e.row.fabricPurpose,
            bomLineKey: e.row.bomLineKey,
          })),
          sizeTokens: tokens,
        });
        if (cancelled) return;
        setIndexFailures((f) => {
          if (res.ok) {
            if (!(sig in f)) return f;
            const { [sig]: _dropped, ...rest } = f;
            return rest;
          }
          return f[sig] === res.reason ? f : { ...f, [sig]: res.reason };
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [canPublishIndex, techCardId, bundle, audits, scopeGroups, cardReadAt]);

  // Загрузчик возвращает НЕПРОЗРАЧНЫЙ ключ скоупа: контрол живёт в ui/ и не обязан знать ни про
  // назначения, ни про строки BOM. Разворачивает его в два поля провода здесь — в одном месте, тем
  // же bindingForScope, которым пользуется и селект в строке.
  function toRow(p: UploadedPattern): Omit<UploadedPattern, 'scopeKey'> & {
    fabricPurpose: string;
    bomLineKey: string;
  } {
    const { scopeKey, ...rest } = p;
    const picked = scopes.find((x) => x.key === scopeKey);
    return {
      ...rest,
      ...(picked ? bindingForScope(picked) : { fabricPurpose: '', bomLineKey: '' }),
    };
  }

  function commitRename(index: number, value: string) {
    // '' is a legal committed value — it clears the name and the row falls back to the
    // filename (the save path still sends name explicitly, so the clear reaches the server).
    // setValue on the nested path, NOT useFieldArray.update: update() replaces the whole
    // row from the stale `fields` snapshot, reverting sibling fields written by other
    // controls, and remounts the row. Byte-clamped — the server counts UTF-8 bytes.
    setValue(`patterns.${index}.name`, clampPatternName(value), { shouldDirty: true });
    setEditing(null);
  }

  function renderSheetRow({ row, index }: Entry) {
    const dxf = isDxfUrl(row.url);
    const rev = revisionOf(row);
    // When the file first landed, server-side and carried across saves. formatTechCardDate
    // answers '—' for the unset timestamp a just-uploaded row still carries; that dash reads as
    // data, so drop it instead.
    const uploaded = formatTechCardDate(row.uploadedAt);
    const uploadedOn = uploaded === '—' ? null : uploaded;
    // Лист БЕЗ размера (0281) — не «размер вне ряда», а отсутствие притязания на размер: сервер его
    // с рядом не сверяет и не отвергает. Красный флаг на нём был бы требованием починить то, что не
    // сломано, и вернул бы на карточку ровно ту зависимость от ряда, которую 0281 убрала.
    const stray = !!row.sizeId && !inRange.has(row.sizeId);
    // Разрешённый скоуп строки: сначала назначение, иначе строка BOM — и с поправкой на то, что
    // строка могла с тех пор попасть в назначение. '' = ни к чему живому не ведёт.
    const rowScope = scopeKeyOfBinding(row.fabricPurpose, row.bomLineKey, scopes);

    return (
      <tr key={row.lineKey || `row-${index}`} className='border-b border-hairline align-middle'>
        <td className='py-1 pr-2'>
          {editing?.index === index ? (
            <Input
              name={`pattern-rename-${index}`}
              value={editing.value}
              placeholder={row.filename || 'название'}
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
            <>
              <span className='flex flex-wrap items-center gap-1.5'>
                <button
                  type='button'
                  onClick={() => setViewing(row)}
                  title={`посмотреть ${labelOf(row)}`}
                  className='min-w-0 truncate text-left text-micro underline hover:opacity-70'
                >
                  {labelOf(row)}
                </button>
                {/* Уже загруженный PDF не ошибка и не поломка — он просто больше не тот формат, в
                    котором заводят выкройки. Серый нейтральный тон, а не красный. */}
                {!dxf && <Pill tone='mut'>устаревший формат</Pill>}
                {stray && <Pill tone='warn'>размер вне ряда</Pill>}
              </span>
              {/* When a name is set the filename still matters (it is what the factory's CAD
                  saved) — keep it readable underneath rather than only in a tooltip. */}
              {row.name && row.filename && (
                <span className='block truncate text-nano text-labelColor'>{row.filename}</span>
              )}
              {stray && (
                <span className='mt-0.5 flex flex-wrap items-center gap-1.5'>
                  <Text size='nano' component='span' className='text-error'>
                    размер этой строки не входит в ряд карточки — сервер отвергнет сохранение
                  </Text>
                  {canEdit && storageSizeId > 0 && (
                    <Button
                      type='button'
                      variant='secondary'
                      size='xs'
                      title='перевесить строку на актуальный размер ряда (размер — только место хранения)'
                      onClick={() =>
                        // Смена size_id — это keyed replacement: сервер перенумерует ревизию
                        // (MAX+1). Файл при этом тот же, и ни один потребитель размер строки не
                        // читает.
                        setValue(`patterns.${index}.sizeId`, storageSizeId, { shouldDirty: true })
                      }
                    >
                      перевесить
                    </Button>
                  )}
                </span>
              )}
              {/* Cloth binding, editable in place — но ЗА КНОПКОЙ «⇄», а не всегда на виду.
                  Раньше под заголовком, который уже назвал материал, у каждой строки висел
                  полноширинный селект со списком всех материалов: поле выбора ответа под самим
                  ответом, N раз подряд. Перепривязка при этом нужна и остаётся достижимой в один
                  клик — и она обязана быть достижимой: каждый DXF, залитый до 0260, привязки не
                  несёт вовсе, и без этого селекта раскладка для таких строк осталась бы догадкой
                  навсегда. Legacy PDF не трогаем — лист, который читает человек, ни из чего не
                  кроят.

                  Пишутся ОБА поля разом, через bindingForScope: назначение — то, чем лист
                  привязан, а строка едет рядом только когда назначение владеет ровно одной.
                  Записать одно и оставить другое как было — это и есть способ получить лист,
                  который в панели лежит в одной ткани, а на сервере разрешается в другую. */}
              {dxf && uploadScopes.length > 0 && (rebinding === index || !rowScope) && (
                <select
                  className='mt-0.5 h-6 w-full border border-hairline bg-bgColor px-1 text-nano'
                  aria-label={`материал для ${labelOf(row)}`}
                  value={rowScope}
                  disabled={isSubmitting || !canEdit}
                  onChange={(e) => {
                    const picked = scopes.find((x) => x.key === e.target.value);
                    const b = picked
                      ? bindingForScope(picked)
                      : { fabricPurpose: '', bomLineKey: '' };
                    setValue(`patterns.${index}.fabricPurpose`, b.fabricPurpose, {
                      shouldDirty: true,
                    });
                    setValue(`patterns.${index}.bomLineKey`, b.bomLineKey, { shouldDirty: true });
                    setRebinding(null);
                  }}
                >
                  {/* ОДНА пустая опция, с разным текстом. Строка, чью привязку удалили или
                      переклассифицировали, всё ещё несёт её в форме, и селект показывает пустое —
                      но «материал не выбран» здесь читалось бы как «оператор не выбирал», а
                      выбирал: выбор просто перестал на что-то указывать, и это разные новости. */}
                  <option value=''>
                    {!rowScope && (!!row.bomLineKey || !!row.fabricPurpose)
                      ? 'привязка потеряна — выберите заново'
                      : 'материал не выбран'}
                  </option>
                  {uploadScopes.map((s) => (
                    <option key={s.key} value={s.key}>
                      {s.label}
                    </option>
                  ))}
                </select>
              )}
            </>
          )}
        </td>
        <td className='py-1 pr-2 text-nano uppercase tracking-label text-labelColor'>
          {dxf ? 'dxf' : 'pdf'}
        </td>
        <td className='py-1 pr-2 text-right text-nano tabular-nums text-labelColor'>
          {rev != null ? `v${rev}` : '—'}
        </td>
        <td className='py-1 pr-2 text-right text-nano tabular-nums text-labelColor'>
          {row.sizeBytes ? formatBytes(row.sizeBytes) : '—'}
        </td>
        <td className='py-1 pr-2 text-right text-nano tabular-nums text-labelColor'>
          {uploadedOn ?? '—'}
        </td>
        <td className='py-1 text-right'>
          <span className='inline-flex gap-1'>
            {dxf && uploadScopes.length > 0 && canEdit && (
              <Button
                type='button'
                variant='secondary'
                size='xs'
                aria-label='rebind pattern'
                title='перепривязать лист к другому материалу'
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
              title='переименовать'
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
        </td>
      </tr>
    );
  }

  /** Шапка таблицы листов — одна на все три таблицы блока, чтобы колонки читались одинаково. */
  function sheetHead() {
    return (
      <thead>
        <tr className='border-b border-borderColor text-nano uppercase tracking-label text-labelColor'>
          <th className='py-1 pr-2 text-left font-normal'>лист</th>
          <th className='py-1 pr-2 text-left font-normal'>тип</th>
          <th className='py-1 pr-2 text-right font-normal'>v</th>
          {/* «вес», а не «размер»: в этом блоке размер — это S/M/L, и рядом стоят «размер вне
              ряда» и полоска покрытия размеров. Колонка «размер: 2.4 MB» читалась размерной. */}
          <th className='py-1 pr-2 text-right font-normal'>вес</th>
          <th className='py-1 pr-2 text-right font-normal'>загружен</th>
          <th className='py-1 text-right font-normal' />
        </tr>
      </thead>
    );
  }

  // Покрытие размеров ОДНОЙ полоской чипов вместо фразы «нет в файлах: XS, S».
  //
  // Вопрос «каким размером этот материал кроить нечем» — это вопрос про множество, и множество
  // читается сеткой, а не перечислением через запятую: чтобы увидеть дырку в списке, его надо
  // прочесть, а в полоске она видна не читая.
  function renderCoverage(list: Entry[]) {
    const a = audits[sigOf(list)];
    // Разбор ещё не включён — вкладку не открывали. Состояние существует ровно один кадр после
    // открытия и на экране не живёт (скрытая вкладка ничего не рисует), но полоска обязана
    // отвечать на любом входе, а не падать в undefined.
    if (!a || a.phase === 'loading') {
      return (
        <Text size='nano' variant='label' component='span'>
          разбор файлов…
        </Text>
      );
    }
    if (a.phase === 'error') {
      // Без кнопки «ещё раз»: полоска живёт ВНУТРИ плитки, а плитка — кнопка выбора материала, и
      // вложенная кнопка в кнопке невалидна. Повтор стоит строкой отказа под шапкой блока —
      // одного сорвавшегося скачивания достаточно, чтобы ответ пропал, а причина обычно разовая.
      return (
        <Text size='nano' component='span' className='text-error'>
          проверка не удалась: {a.message}
        </Text>
      );
    }
    if (a.found.size === 0) {
      return (
        <Text size='nano' variant='label' component='span'>
          в именах блоков размеров нет — файл не градуирован
        </Text>
      );
    }
    // Пустой ряд — НЕ повод для галочки. Ряд карточки не даёт недостающих по построению, и «все
    // размеры на месте» читалось бы как проверка, хотя проверять было нечего. Показываем то, что
    // реально сказали файлы, — это и есть ответ, за которым сюда пришли, когда ряд ещё не набран.
    if (sizeIds.length === 0) {
      return (
        <span className='flex flex-wrap items-center gap-1'>
          {[...a.found].map((t) => (
            <Chip key={t} tone='default'>
              {t}
            </Chip>
          ))}
          <Text size='nano' variant='label' component='span'>
            ряд карточки пуст, сверять не с чем
          </Text>
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
              selected={!gone}
              tone={gone ? 'error' : 'default'}
              title={gone ? 'этого размера в файлах нет' : 'есть в файлах'}
            >
              {nameOf(id)}
            </Chip>
          );
        })}
        {missing.size > 0 && (
          <Text size='nano' component='span' className='text-error'>
            нет {[...missing].map(nameOf).join(', ')}
          </Text>
        )}
      </span>
    );
  }

  // ── ПОЛКА: одна плитка на материал карточки ─────────────────────────────────────────────
  //
  // Плитка отвечает на три вопроса разом, и все три раньше требовали чтения: чем этот материал
  // кроится (силуэты), каких размеров в файлах нет (полоска), и есть ли вообще чем кроить
  // (красный кант со словом). Сводный красный CalloutBox над списком поэтому больше не нужен:
  // он печатал ровно то же самое второй раз, и «своего DXF нет…» стояло в нём дословно тем же
  // текстом, что и в пустой группе под ним.
  function renderTile(g: (typeof scopeGroups)[number]) {
    const key = g.scope.key;
    const label = scopeLabel(g.scope);
    const has = g.entries.length > 0;
    const main = isMainScope(g);
    const blocks = dxfIndex ? countBlocks(dxfIndex, key) : 0;
    const a = audits[sigOf(g.entries)];
    const missing = a?.phase === 'ready' ? missingIn(a) : [];
    return (
      <div
        key={key}
        className={dragKey === key ? 'outline outline-2 outline-textColor' : undefined}
        onDragOver={(e) => {
          if (!canUpload) return;
          e.preventDefault();
          setDragKey(key);
        }}
        onDragLeave={() => setDragKey((k) => (k === key ? null : k))}
        onDrop={(e) => {
          if (!canUpload) return;
          e.preventDefault();
          setDragKey(null);
          stageDrop(key, e.dataTransfer.files);
        }}
      >
        <Tile
          selected={selectedKey === key}
          tone={(!has && main) || missing.length > 0 ? 'error' : 'default'}
          onClick={() => setSelectedKey(key)}
          media={
            has && dxfIndex && blocks > 0 ? (
              <div className='flex h-[84px] w-full items-center justify-center border border-borderColor bg-bgZebra p-1'>
                <SheetThumb index={dxfIndex} scopeKey={key} className='h-full w-full' />
              </div>
            ) : (
              <Placeholder
                dashed
                tone={!has && main ? 'error' : 'default'}
                // «формы не разобраны» отсюда ушло вместе с кнопкой: разбор идёт сам, и не
                // разобранных форм больше не бывает — бывает идущий разбор, упавший разбор и
                // разобранный файл, в котором для этого материала контуров не нашлось.
                label={
                  !has
                    ? 'нет dxf'
                    : geometry.isError
                      ? 'ошибка разбора'
                      : dxfIndex
                        ? 'форм не найдено'
                        : 'разбор…'
                }
                className='h-[84px] w-full'
              />
            )
          }
          name={label}
          sub={
            has
              ? `${g.entries.length} ${plural(g.entries.length, 'лист', 'листа', 'листов')}${
                  blocks > 0 ? ` · ${blocks} бл.` : ''
                }`
              : main
                ? 'раскроить этот материал нечем'
                : 'своего DXF нет — возможно, в файле основной ткани'
          }
        >
          {has && <span className='mt-1 block'>{renderCoverage(g.entries)}</span>}
        </Tile>
      </div>
    );
  }

  /** Плитка для того, что материалом не подписано: непривязанные DXF и наследие в PDF. */
  function renderExtraTile(
    key: string,
    name: string,
    sub: string,
    list: Entry[],
    tone: 'default' | 'error',
  ) {
    return (
      <Tile
        key={key}
        dashed
        selected={selectedKey === key}
        tone={tone}
        onClick={() => setSelectedKey(key)}
        media={
          <Placeholder
            dashed
            tone={tone}
            label={`${list.length} ${plural(list.length, 'файл', 'файла', 'файлов')}`}
            className='h-[84px] w-full'
          />
        }
        name={name}
        sub={sub}
      />
    );
  }

  // Панель выбранного материала: действия и листы. Действия висят у ОДНОГО материала — того, с
  // которым сейчас работают, — а не по четыре штуки в шапке каждой группы разом.
  function renderSelected() {
    if (selectedKey === LOOSE_KEY) {
      return (
        <div>
          <GroupLabel>DXF без материала</GroupLabel>
          <Text size='nano' variant='label' className='mb-1'>
            залиты до появления привязки либо потеряли строку BOM. Выберите материал в строке — без
            него не считается ни ширина, ни кромка, и раскладка не знает, что меряет.
          </Text>
          <table className='w-full border-collapse text-micro'>
            {sheetHead()}
            <tbody>{looseDxf.map(renderSheetRow)}</tbody>
          </table>
        </div>
      );
    }
    if (selectedKey === PDF_KEY) {
      return (
        <div>
          <GroupLabel>PDF — устаревший формат</GroupLabel>
          <Text size='nano' variant='label' className='mb-1'>
            новые выкройки принимаются только в DXF: из PDF нельзя ни разложить детали, ни
            сопоставить их с деталями кроя, ни прочитать размер. Эти файлы остаются на карточке и
            сохраняются вместе с ней — их можно открыть и скачать; заменить их можно, загрузив DXF
            на нужный материал и удалив PDF.
          </Text>
          <table className='w-full border-collapse text-micro'>
            {sheetHead()}
            <tbody>{pdfEntries.map(renderSheetRow)}</tbody>
          </table>
        </div>
      );
    }
    const g = scopeGroups.find((x) => x.scope.key === selectedKey);
    if (!g) return null;
    const has = g.entries.length > 0;
    const label = scopeLabel(g.scope);
    // Раскладка мерит КОНКРЕТНЫЙ артикул: ширина и кромка приходят с пина колорвея на одну строку.
    // Поэтому запереть её на строку можно только когда назначение владеет ровно одной; иначе
    // модалка спрашивает сама — ровно как она уже делает для DXF без привязки.
    const soleLine = g.scope.lines.length === 1 ? g.scope.lines[0].lineKey : '';
    return (
      <div
        className={dragKey === g.scope.key ? 'outline outline-2 outline-textColor' : undefined}
        onDragOver={(e) => {
          if (!canUpload) return;
          e.preventDefault();
          setDragKey(g.scope.key);
        }}
        onDragLeave={() => setDragKey((k) => (k === g.scope.key ? null : k))}
        onDrop={(e) => {
          if (!canUpload) return;
          e.preventDefault();
          setDragKey(null);
          stageDrop(g.scope.key, e.dataTransfer.files);
        }}
      >
        <GroupLabel
          action={
            <div className='flex flex-wrap items-center gap-1.5'>
              {has && (
                <Button
                  type='button'
                  variant='secondary'
                  size='xs'
                  title={`авто-раскладка деталей «${label}» на полосе`}
                  onClick={() =>
                    setNesting({
                      // Размер тут ничего не решает у ГРАДУИРОВАННОГО файла: он выбирается внутри
                      // по именам блоков, и маркер сохраняется на выбранный. Это запасной вариант
                      // для НЕградуированного — файла, в именах которого размера нет вовсе: такому
                      // маркеру размер может дать только карточка.
                      //
                      // `||`, а не `??`: у листа без размера (0281) здесь стоит 0, и `??` его бы
                      // принял как ответ — раскладка неградуированного файла осталась бы
                      // несохранимой НАВСЕГДА, даже после того как оператор набрал размерный ряд,
                      // потому что вернуть строке размер в интерфейсе нечем. Пустой ряд по-прежнему
                      // даёт 0, и модалка честно отказывает: там размера действительно нет.
                      sizeId: g.entries[0]?.row.sizeId || storageSizeId,
                      files: filesOf(g.entries),
                      bomLineKey: soleLine,
                      // Алиасы ЭТОГО скоупа: одно и то же имя блока на верхе и на подкладе —
                      // разные детали кроя, и отдать модалке всё подряд значило бы проставить в
                      // блоб чужой ключ.
                      aliases: pieceDxfAliases.filter((a) => aliasInScope(a, g.scope)),
                      // Направление СКОУПА, а не строки: назначение законно владеет несколькими
                      // артикулами, и согласованность их направлений никто не валидирует.
                      // Строгое побеждает — одна ворсовая в скоупе делает ворсовым весь скоуп,
                      // иначе маркер, законный для одной ткани, кладёт вторую ворсом к себе же.
                      //
                      // СЕМПЛОВЫЕ строки из ответа выброшены: сервер партиционирует скоуп по
                      // is_sample (0265, MarkerFabricScope), и непроставленное направление на
                      // семпловом рулоне иначе объявляло бы «НЕ ЗАДАНО» производственной
                      // раскладке, которую сервер принял бы. Если в скоупе ОДНА семпловая ярдажа
                      // и ничего больше — судим по ней, это и есть семпловая раскладка.
                      //
                      // Это ЗНАЧЕНИЕ НА СТАРТЕ: сохранить оператор может на любую тканевую строку
                      // карточки, и модалка пересчитывает направление по выбранному слоту сама.
                      fabricDirection: strictestDirection(
                        g.scope.lines.some((l) => !l.isSample)
                          ? g.scope.lines.filter((l) => !l.isSample)
                          : g.scope.lines,
                      ),
                    })
                  }
                >
                  ⌗ раскладка
                </Button>
              )}
              {/* Алиас пишется в скоуп ткани, и стор ОТКАЗЫВАЕТ паре (слот, блок), чей слот не
                  является живой тканевой строкой, — это уронило бы весь сейв карточки из-за
                  строки, до которой в интерфейсе не добраться. */}
              {has && canEdit && (
                <Button
                  type='button'
                  variant='secondary'
                  size='xs'
                  title={`сопоставить детали DXF с деталями кроя для «${label}»`}
                  onClick={() =>
                    setMatching({
                      scope: g.scope,
                      fabricName: label,
                      files: filesOf(g.entries),
                    })
                  }
                >
                  ↔ детали кроя
                </Button>
              )}
              {canUpload && (
                <PatternUploadButton
                  label='+ DXF'
                  dxfOnly
                  fabricScopes={uploadScopes}
                  defaultScopeKey={g.scope.key}
                  onUploaded={(p) =>
                    append({ sizeId: storageSizeId, lineKey: ulid(), ...toRow(p) })
                  }
                  // PatternUploadButton renders a page-sized Button; in a group header it has to
                  // sit at control density. It exposes no `size`, so density is applied here.
                  className='[&_button]:px-1.5 [&_button]:py-px [&_button]:text-nano [&_button]:tracking-label'
                />
              )}
            </div>
          }
        >
          {label}
        </GroupLabel>
        {has ? (
          <table className='w-full border-collapse text-micro'>
            {sheetHead()}
            <tbody>{g.entries.map(renderSheetRow)}</tbody>
          </table>
        ) : (
          <Text
            size='micro'
            component='p'
            className={isMainScope(g) ? 'text-error' : 'text-labelColor'}
          >
            {isMainScope(g)
              ? 'раскроить этот материал нечем'
              : 'своего DXF нет — возможно, детали лежат в файле основной ткани'}
            {canUpload ? ' — перетащите DXF сюда или нажмите «+ DXF»' : ''}
          </Text>
        )}
      </div>
    );
  }

  if (fields.length === 0 && fabricBomLines.length === 0) {
    return (
      <Text size='micro' variant='label'>
        заведите строки ткани в BOM — выкройка привязывается к материалу.
        {sizeIds.length === 0
          ? ' Размерный ряд для загрузки не нужен: размеры читаются из самого файла.'
          : ''}
      </Text>
    );
  }

  return (
    <div className='space-y-2.5'>
      {/* Панель блока: состояние слева, действия справа. Разбор в действиях больше не стоит — он
          идёт сам, — и от него здесь осталось только слово о том, что он ИДЁТ: скачивание файлов
          занимает секунды, и без него плитки просто молчат. */}
      <div className='flex flex-wrap items-center gap-1.5 border-b border-borderColor pb-1'>
        <Text size='nano' variant='label' component='span' className='uppercase tracking-label'>
          материалов: {scopeGroups.length}
        </Text>
        {materialsWithoutDxf.length > 0 && (
          <Pill tone='warn' title={materialsWithoutDxf.map((g) => scopeLabel(g.scope)).join('; ')}>
            без DXF: {materialsWithoutDxf.length}
          </Pill>
        )}
        {missingSizeNotes.length > 0 && (
          <Pill tone='warn' title={missingSizeNotes.join('; ')}>
            дырки по размерам: {missingSizeNotes.length}
          </Pill>
        )}
        {looseDxf.length > 0 && <Pill tone='attention'>без материала: {looseDxf.length}</Pill>}
        <div className='ml-auto flex flex-wrap items-center gap-1.5'>
          {geometry.isFetching && (
            <Text size='nano' variant='label' component='span' className='uppercase tracking-label'>
              разбор файлов…
            </Text>
          )}
          {canUpload && (
            <>
              {/* Склейка стоит РЯДОМ с загрузкой, а не внутри неё: это другой вход — не «положить
                  файл», а «собрать файл из пяти». Внутри «+ DXF» её пришлось бы объяснять каждому,
                  кто просто хочет положить готовый чертёж. */}
              <Button
                type='button'
                variant='secondary'
                size='xs'
                onClick={() => setMerging(true)}
                title='CLO выгружает припуск только для текущего размера — соберите размеры в один чертёж'
              >
                склеить размеры
              </Button>
              <PatternUploadButton
                label='+ DXF'
                dxfOnly
                fabricScopes={uploadScopes}
                defaultScopeKey={selectedKey ?? uploadScopes[0]?.key}
                onUploaded={(p) => append({ sizeId: storageSizeId, lineKey: ulid(), ...toRow(p) })}
                className='[&_button]:px-1.5 [&_button]:py-px [&_button]:text-nano [&_button]:tracking-label'
              />
            </>
          )}
        </div>
      </div>

      {/* Отказ общего разбора и выпавшие из пачки листы — вслух. Молчащий разбор оставлял плитки в
          «формы не разобраны» без причины, а лист, не скачавшийся с CDN, исчезал из счёта блоков и
          из миниатюры без единого слова: его детали просто «не находились».
          «ещё раз» — единственная оставшаяся кнопка разбора, и она появляется ТОЛЬКО на отказе:
          сорвавшееся скачивание обычно разовое, а повторить его иначе нечем — автостарт уже
          отработал и сам себя не перезапустит. */}
      {geometry.isError && (
        <div className='flex flex-wrap items-center gap-1.5'>
          <Text size='nano' component='span' className='text-error'>
            разбор файлов не удался: {geometry.error?.message ?? 'причина неизвестна'} — силуэтов и
            покрытия размеров показать нечем
          </Text>
          <Button type='button' variant='secondary' size='xs' onClick={() => geometry.refetch()}>
            ещё раз
          </Button>
        </div>
      )}
      {(geometry.data?.warnings ?? []).map((w) => (
        <Text key={w} size='nano' component='p' className='text-error'>
          {w}
        </Text>
      ))}
      {/* Индекс размеров не записался. Отдельно от разбора: показанному на плитках ответу отказ
          записи не мешает — он мешает ГЕЙТУ ГОТОВНОСТИ прогона, который без индекса так и будет
          отвечать «никто не проверял». Почти всегда лечится сохранением карточки.
          Печатаются только отказы ЖИВЫХ наборов: набор, чьи файлы с тех пор перезалили или
          отвязали, больше не существует — его подпись некому пересобрать, и красная строка про
          него висела бы вечно, требуя починить то, чего уже нет. */}
      {Object.entries(indexFailures)
        .filter(([sig]) =>
          scopeGroups.some((g) => g.entries.length > 0 && sigOf(g.entries) === sig),
        )
        .map(([sig, reason]) => (
          <Text key={sig} size='nano' component='p' className='text-error'>
            индекс размеров не сохранён — {reason}
          </Text>
        ))}

      {/* ЕДИНСТВЕННЫЙ оставшийся сводный красный блок: строка вне ряда роняет сохранение ВСЕЙ
          карточки, а её плитка об этом сказать не может — дефект живёт на строке, а не на
          материале, и увидеть его, не открыв нужную плитку, было бы нельзя. Всё остальное, что
          раньше стояло в этом callout'е, теперь написано на самих плитках. */}
      {outOfRange.length > 0 && (
        <CalloutBox tone='error'>
          <Text size='micro' component='p'>
            <b>вне размерного ряда:</b> {outOfRange.length}{' '}
            {outOfRange.length === 1 ? 'строка отвергнет' : 'строки отвергнут'} сохранение карточки
            — откройте их материал и нажмите «перевесить».
          </Text>
        </CalloutBox>
      )}

      {fabricBomLines.length === 0 && (
        <Text size='micro' variant='label'>
          в BOM нет строк ткани — выкройку не к чему привязать. Заведите основную ткань (и
          подкладку/бортовку/утеплитель, если они есть) на вкладке BOM.
        </Text>
      )}

      {/* Полка рисуется, когда есть ХОТЬ ОДНА плитка, а не когда есть тканевые строки BOM. Плитки
          «без материала» и «PDF» строятся и без скоупов вовсе, а таблицы этих файлов живут только
          внутри ВЫБРАННОЙ плитки — так что гейт по `fabricBomLines` прятал их целиком. Карточка, у
          которой тканевые строки удалили или переклассифицировали, показывала счётчик «без
          материала: N» и ни одного способа открыть, переименовать или удалить эти файлы, а callout
          выше советовал «откройте их материал», которого не существует. */}
      {shelfKeys.length > 0 && (
        <>
          <Tiles min={158}>
            {scopeGroups.map(renderTile)}
            {looseDxf.length > 0 &&
              renderExtraTile(
                LOOSE_KEY,
                'без материала',
                'раскладка и детали кроя недоступны',
                looseDxf,
                // НЕ error: файл не сломан, у него просто ещё не выбрана ткань, а пилюля этого же
                // дефекта в шапке блока — синяя (mid-flight). Красная плитка рядом с синей пилюлей
                // читалась бы как два разных дефекта. Синего тона у Tile нет, поэтому состояние
                // здесь несут пунктирный кант и слова «без материала» / «недоступны».
                'default',
              )}
            {pdfEntries.length > 0 &&
              renderExtraTile(PDF_KEY, 'PDF', 'устаревший формат', pdfEntries, 'default')}
          </Tiles>
          {renderSelected()}
        </>
      )}

      {/* Пустой ряд больше не блокирует загрузку — но и молчать о нём нельзя: без ряда раскладку
          сохранить не выйдет (маркер кладётся на КОНКРЕТНЫЙ размер карточки, и токен из имени блока
          ему не во что резолвить), а проверка размеров отвечать будет, но сверять найденное станет
          не с чем. Это не ошибка карточки, поэтому нейтральный тон. */}
      {sizeIds.length === 0 && fabricBomLines.length > 0 && (
        <Text size='micro' variant='label'>
          размерный ряд не задан — DXF грузятся и просматриваются как обычно, лист хранится без
          размера (размеры и так живут в самом файле). Ряд понадобится, чтобы СОХРАНИТЬ раскладку:
          маркер ложится на конкретный размер карточки. Какие размеры есть в файлах, полоска на
          плитке покажет сама, а «↔ детали кроя» заведёт однозначные из них в ряд карточки.
        </Text>
      )}

      {/* Объяснение материи — В ПОДВАЛЕ, а не над полкой. Оно верное и нужное, но это справка, а
          не ответ: наверху блока оно стояло между вопросом и ответом и читалось раньше их. */}
      <Text size='nano' variant='label' component='p' className='border-t border-hairline pt-1.5'>
        выкройки — DXF, по МАТЕРИАЛАМ. Один чертёж несёт весь размерный ряд: размер записан в именах
        блоков, выбирается при просмотре и в раскладке, а недостающие размеры карточка добирает из
        файла сама. Поэтому файл привязывается к материалу — основная ткань, подкладка, бортовка,
        утеплитель, — и на один материал файлов может быть несколько (основная ткань и карманка это
        две разные строки BOM). Колорвей на файл не влияет — лекала общие, — но артикул и его ширину
        каждый колорвей подставляет свои.
      </Text>

      {/* Склейка по-размерных выгрузок. Отдаёт ОДИН собранный файл в ту же модалку названия и
          материала — грузится он как любая другая выкройка, потому что после склейки он и есть
          обычный градуированный чертёж. */}
      {merging && (
        <Suspense fallback={null}>
          <MergeSizesModal
            open={merging}
            onClose={() => setMerging(false)}
            onReady={(file) => {
              setMerging(false);
              setDroppedOn({ scopeKey: selectedKey ?? uploadScopes[0]?.key ?? '', files: [file] });
            }}
          />
        </Suspense>
      )}

      {/* Naming modal for drops onto a material (click uploads carry their own inside the
          button). Размер не спрашивается: их в файле несколько. */}
      <PatternUploadModal
        files={droppedOn?.files ?? null}
        onClose={() => setDroppedOn(null)}
        onUploaded={(p) => append({ sizeId: storageSizeId, lineKey: ulid(), ...toRow(p) })}
        fabricScopes={uploadScopes}
        defaultScopeKey={droppedOn?.scopeKey}
        dxfOnly
      />

      {/* In-app PDF viewer, kept for the legacy rows: the browser renders the sheet inside the
          modal; a fallback link opens it in a new tab if the storage host refuses to be framed. */}
      <ConfirmationModal
        open={viewing != null && !isDxfUrl(viewing.url)}
        onOpenChange={(o) => {
          if (!o) setViewing(null);
        }}
        onConfirm={() => setViewing(null)}
        title={viewing ? labelOf(viewing) : 'выкройка'}
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
            title={viewing ? labelOf(viewing) : 'выкройка'}
            className='h-[75vh] w-full border border-borderColor bg-bgColor'
          />
        </div>
      </ConfirmationModal>

      {/* Просмотр DXF — НАШИМ листом, с выбором размера и слоёв. WebGL-вьювер рисовал файл
          целиком, а градуированный чертёж это пять размеров сразу: каша, в которой ничего не
          разобрать, и никакого способа посмотреть один размер. Здесь та же геометрия, по
          которой считается раскладка, так что увиденное и посчитанное не расходятся. */}
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
        <Suspense
          fallback={
            <Text size='micro' variant='label'>
              загрузка модуля раскладки…
            </Text>
          }
        >
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

      {/* Сопоставление блоков DXF с деталями кроя — тот же ленивый чанк (общий воркер разбора). */}
      {matching && (
        <Suspense
          fallback={
            <Text size='micro' variant='label'>
              загрузка модуля разбора DXF…
            </Text>
          }
        >
          <PieceMatchModal
            files={matching.files}
            scope={matching.scope}
            fabricName={matching.fabricName}
            scopeLabelByKey={scopeLabelByKey}
            sizeLabel=''
            onClose={() => setMatching(null)}
          />
        </Suspense>
      )}
    </div>
  );
}
