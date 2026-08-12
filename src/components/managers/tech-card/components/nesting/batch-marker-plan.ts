// ПЛАНИРОВЩИК РАСКЛАДОК ПОД ПАРТИЮ — чистая функция, ни одного хука.
//
// Вход: состав партии (колорвей × размер × количество), колорвеи карточки с их пинами, скоупы
// ткани с уже РАЗОБРАННЫМИ выкройками и сегодняшние раскладки карточки. Выход: список заданий для
// движка, каждое со своей ценой прогона, и список ОТКАЗОВ, каждый со своей причиной.
//
// ═══ ДВА РЕЖИМА, ОДИН КОНВЕЙЕР ═════════════════════════════════════════════════════════════════
//
// Режим решает РОВНО ОДНО: каков СОСТАВ настила и КОМУ он принадлежит. Всё остальное — разбор,
// геометрия, отбор деталей, оценка, конфиг движка, отказы, замена, имя — общее, и разводить эти
// два пути было бы гарантией того, что починенное в одном не починится в другом.
//
//   · 'norms' — РАЗМЕРНЫЕ НОРМЫ. Задание = (колорвей × ткань × размер), состав {размер × 1},
//     раскладка КАРТОЧНАЯ (production_run_id = 0). Такая переиспользуется между партиями, и сервер
//     выдаёт с неё расход на изделие без оговорок. Цена выбора названа вслух на экране: настил на
//     ОДНО изделие кладётся реже настоящего многокомплектного, поэтому измеренный расход идёт с
//     запасом, а КПД ниже цехового. Ошибка направлена в безопасную сторону, но она есть.
//
//   · 'batch' — НАСТИЛ ПАРТИИ. Задание = (колорвей × ткань), состав — СОБСТВЕННОЕ СООТНОШЕНИЕ
//     РАЗМЕРОВ ЭТОЙ ПАРТИИ, ужатое на НОД (60 M + 40 L → 3 M + 2 L), раскладка ПРОГОННАЯ
//     (production_run_id = id выбранной партии). Это то, как ткань режут на самом деле, и её КПД —
//     реальный процент раскроя партии, которого никто не вводил руками.
//
// ═══ ПОЧЕМУ СМЕШАННЫЙ НАСТИЛ ОБЯЗАН БЫТЬ ПРОГОННЫМ ═════════════════════════════════════════════
//
// Схема запрещает прогонной раскладке быть нормой (CHECK chk_tcm_run_not_norm), и это ровно то, что
// здесь нужно. Соотношение смешанного настила — СЛУЧАЙНОСТЬ ОДНОГО ЗАКАЗА: следующая партия с
// другим миксом получила бы то же число, неверное ровно на разницу соотношений. Привязав такую
// раскладку к прогону, мы делаем «стать нормой стиля» физически невозможным, а не оговорённым.
// Обратная сторона той же медали: прогонная раскладка умирает вместе с прогоном по FK CASCADE — и
// потому размерные нормы режима 'norms' остаются карточными, они переживают партию намеренно.
//
// ═══ ЦЕНА ПОИСКА И ПОЧЕМУ СООТНОШЕНИЕ НЕ МАСШТАБИРУЕТСЯ ТИХО ═══════════════════════════════════
//
// Две цены, и растут они от разного. ПОИСК — перебор порядков размещения, его сложность растёт от
// числа ЭКЗЕМПЛЯРОВ на полотне. ПРЕДПРОСЧЁТ NFP платится за пары УНИКАЛЬНЫХ контуров: от тиража
// одного размера он не дорожает вовсе, но каждый НОВЫЙ размер состава приносит свой набор контуров
// — то есть смешанный настил дороже однородного и здесь. Обе цены считает одна и та же оценка
// (estimateJob/estimateRun), и её результат стоит в колонке «прогноз» ДО запуска.
//
// Отсюда два следствия. Первое: класть настил на полный тираж партии (30 изделий × 45 контуров)
// бессмысленно — поиск не сделает ни одного поколения. Второе: соотношение ужимается на НОД — и
// БОЛЬШЕ НИКАК. Ужать 3 M + 2 L до «1 M + 1 L», потому что так дешевле, значит измерить настил,
// которого никто не кроит; вместо этого цена называется вслух, и оператор либо платит, либо снимает
// галочку.
import type { common_TechCardMarkerSummary, googletype_Decimal } from 'api/proto-http/admin';
import { applySeamAllowance } from 'lib/nesting/geom/seam-allowance';
import { orientToGrain } from 'lib/nesting/geom/grain-orient';
import {
  crossSpanCm,
  estimateJob,
  estimateRun,
  fittingRotations,
  type RunEstimate,
} from 'lib/nesting/nest/estimate';
import type { FabricDirection, NestConfig, PieceDTO, Unit } from 'lib/nesting/types';
import { NEST_DEFAULTS, allowedRotations } from 'lib/nesting/types';
import { engineCmToMm, mmToEngineCm } from './allowance-units';
import { buildAllowanceIndex, type ContourAllowance } from './contour-allowance';
import { defaultContourLayer, layerOptions, type SeamAllowancePrefill } from './contour-layer';
import type { MarkerColorway } from './colorway-widths';
import type { ScopedSheet } from './dxf-by-scope';
import { applySeamPrefill } from './dxf-apply-conditions';
import { defaultGrainLayer, grainLayerOptions } from './grain';
import { compositionOf, type MarkerCompositionEntry } from './marker-io';
import {
  dedupeUniPieces,
  markerUnits,
  pieceLineKeysByPieceId,
  selectMarkerPieces,
  uniConflictReason,
  unitsOfPieces,
  type MarkerCompositionRow,
  type PieceAlias,
} from './piece-selection';
import { splitPiecesBySize, type BlockSplit } from './split-pieces';

/** Клетка состава партии: сколько изделий одного размера одного колорвея в неё заказано. */
export type BatchCell = { colorwayId: number; sizeId: number; qty: number };

/**
 * ЧТО СНИМАЕМ: размерные нормы карточки либо настил ЭТОЙ партии. Единственное, что режим меняет по
 * существу, — состав настила и владелец раскладки; см. шапку модуля.
 */
export type MarkerMode = 'norms' | 'batch';

/** Одна строка состава задания: размер, его тираж В НАСТИЛЕ и его вес В ПАРТИИ. */
export type JobSizeRow = {
  sizeId: number;
  sizeLabel: string;
  /** Написания размера в именах блоков — ими задание отбирает свои детали. */
  tokens: string[];
  /** Сколько ИЗДЕЛИЙ этого размера кроит ОДИН настил. В режиме норм всегда 1. */
  units: number;
  /**
   * Сколько изделий этой пары (колорвей, размер) заказала партия. Тираж настила это число НЕ
   * задаёт (см. шапку), но оно обязано доехать: им взвешивается итог по ткани, иначе партия из 99
   * маленьких и одного большого усредняется с равным весом.
   */
  batchQty: number;
};

/**
 * Ткань партии глазами планировщика: скоуп (назначение либо неразобранная строка BOM), его листы и
 * разбор этих листов.
 */
export type PlanScope = {
  key: string;
  /** Подпись для экрана: «основная ткань · Твил 1». */
  label: string;
  /** Роль словом («подкладка») — ею подписывается строка результата. */
  role: string;
  /**
   * КОНКРЕТНАЯ строка BOM, на которую ляжет длина. Пусто = назначение владеет несколькими
   * строками: какой из артикулов мерить, машина решить не может, и задание отказывает.
   */
  lineKey: string;
  /** Сколько строк BOM в скоупе — для текста отказа выше. */
  lineCount: number;
  /** Единица строки («м», «кг») — ею подписывается сверка с рецептом. */
  unit: string;
  /** Ширина и кромка САМОГО СЛОТА (артикул строки BOM), если колорвей не приколол свой. */
  slotCutCm: number;
  slotSelvedgeCm: number;
  slotArticleName: string;
  /** Направление ткани скоупа: строгое побеждает (strictestDirection). */
  direction: FabricDirection;
  sheets: ScopedSheet[];
  /**
   * Листы, которые НЕ СКАЧАЛИСЬ. Непусто = разбор этой ткани неполон, и всякая раскладка по нему
   * описывала бы изделие без деталей с пропавшего листа. Отдельным полем, а не строкой в
   * `parseWarnings`: предупреждение читают, а это ОТКАЗ.
   */
  failedSheets: string[];
  /** Сопоставление «блок → деталь кроя», уже отфильтрованное по ЭТОЙ ткани вызывающим. */
  aliases: readonly PieceAlias[];
  /** Разобранные детали ВСЕХ листов скоупа. Пусто = разбор не дал ни одного контура. */
  pieces: PieceDTO[];
  /** Единица чертежа, как её прочитал разбор ($INSUNITS) — уезжает в блоб маркера. */
  detectedUnit: Exclude<Unit, 'auto'>;
  /** Замечания разбора (не скачался лист, единицы переопределены) — едут в блоб маркера. */
  parseWarnings: string[];
};

/** Отказ: задание, которого НЕ БУДЕТ, с названной причиной. */
export type PlanRefusal = {
  key: string;
  scopeLabel: string;
  /** Пусто, когда отказ относится ко всей ткани, а не к одной паре. */
  colorwayLabel: string;
  sizeLabel: string;
  reason: string;
};

/**
 * Раскладка, которую задание ЗАМЕНИТ (та же ткань, тот же колорвей, тот же состав/владелец).
 *
 * `isDraft` тут не украшение: черновик — это НЕДОСЧИТАННОЕ задание, и предлагать его пересъёмку
 * надо ровно наоборот тому, как предлагается пересъёмка готовой раскладки (та предвыбрана
 * выключенной, потому что стоит бюджета и двигает применённое число).
 */
export type MarkerReplacement = { id: number; name: string; isNorm: boolean; isDraft: boolean };

export type MarkerJob = {
  /** Стабильный ключ задания: (колорвей, ткань, размер) либо (колорвей, ткань) у настила партии. */
  id: string;
  mode: MarkerMode;
  /** Владелец раскладки: 0 = карточная (норма), >0 = прогонная (настил ЭТОЙ партии). */
  productionRunId: number;
  colorwayId: number;
  colorwayLabel: string;
  scopeKey: string;
  scopeLabel: string;
  role: string;
  bomLineKey: string;
  unit: string;
  /** Размер задания в режиме норм; 0 у смешанного настила (у него нет ОДНОГО размера). */
  sizeId: number;
  /** «M» либо «3M+2L» — подпись состава одной строкой. */
  sizeLabel: string;
  /** Состав настила: по строке на размер, в порядке градации. */
  sizes: JobSizeRow[];
  /** Сколько ИЗДЕЛИЙ кроит один настил (Σ units) — делитель расхода на изделие. */
  unitsTotal: number;
  /** Состав в том виде, в каком он уедет в блоб и в шапку (marker-io.legacyPairOf). */
  composition: MarkerCompositionEntry[];
  /**
   * Размер градации каждой РАЗОБРАННОЙ детали — в блоб схемы 4. Нужен только смешанному настилу
   * (buildMarkerLayout сам решает, писать ли его), но считается всегда: одна ветка вместо двух.
   */
  sizeIdByPieceId: ReadonlyMap<number, number>;
  /** Сколько изделий этого колорвея покрывает задание — сумма batchQty его строк состава. */
  batchQty: number;
  /** Имя, под которым раскладка ляжет на карточку (у замены — её собственное). */
  markerName: string;
  /**
   * Деталь кроя за каждой разобранной деталью — едет в блоб, чтобы раскладка пережила
   * переименование детали. Пусто = сопоставления нет, и это законное «неизвестно».
   */
  pieceLineKeyById: ReadonlyMap<number, string>;
  /** Раскройная ширина (рулон − 2×кромка), см. */
  widthCm: number;
  selvedgeCm: number;
  /** Артикул, давший ширину: пин колорвея либо артикул слота. */
  articleName: string;
  /** Ширину дал ПИН колорвея (а не артикул слота) — это разные ткани и разная длина. */
  pinned: boolean;
  direction: FabricDirection;
  contourLayer: string;
  grainLayer: string;
  seamAllowanceMm: number;
  seamAllowanceWhy: string;
  /** Припуск, УЖЕ лежащий в контуре файла, мм. null = не измерено (это не ноль). */
  contourAllowanceMm: number | null;
  /** Уникальных контуров в задании и сколько всего экземпляров лягут на полотно. */
  pieceCount: number;
  instanceCount: number;
  /**
   * Контуры РОВНО В ТОМ ВИДЕ, В КАКОМ ИХ УЛОЖИТ ДВИЖОК: развёрнутые по долевой и раздутые
   * припуском. Именно они уезжают в блоб маркера — блоб хранит геометрию, а не ссылку на файл, и
   * подставить туда сырой контур из разбора значило бы записать раскладку, которой не мерялось.
   */
  pieces: PieceDTO[];
  detectedUnit: Exclude<Unit, 'auto'>;
  config: NestConfig;
  estimate: JobForecast | null;
  replaces: MarkerReplacement | null;
  /** Предупреждения, которые оператор обязан прочитать ДО запуска (не отказы). */
  notes: string[];
  parseWarnings: string[];
};

export type BatchMarkerPlan = { jobs: MarkerJob[]; refusals: PlanRefusal[] };

/**
 * ПРОГНОЗ ЗАДАНИЯ — то, что печатает экран, и НИЧЕГО СВЕРХ ТОГО.
 *
 * Полный `RunEstimate` тащит за собой `decompositions` — выпуклые разложения КАЖДОГО контура на
 * выбранной ступени, то есть самую дорогую часть самой оценки. Движку они нужны (он берёт их
 * оттуда, чтобы не считать второй раз), а плану — нет: план держит ДЕСЯТКИ заданий одновременно, и
 * прогон каждого всё равно посчитает свои разложения внутри воркера. Хранить их здесь значило бы
 * удерживать в памяти вкладки геометрию всей партии ради строки текста.
 */
export type JobForecast = Pick<
  RunEstimate,
  | 'outlook'
  | 'predictedPrepassMs'
  | 'prepassCapMs'
  | 'timeBudgetMs'
  | 'searchMsLeft'
  | 'predictedElapsedMs'
  | 'budgetToFitMs'
  | 'coarsened'
  | 'effectiveEps'
  | 'mirrorPairs'
  | 'uniquePieces'
  | 'nfpRecords'
>;

function forecastOf(e: RunEstimate): JobForecast {
  return {
    outlook: e.outlook,
    predictedPrepassMs: e.predictedPrepassMs,
    prepassCapMs: e.prepassCapMs,
    timeBudgetMs: e.timeBudgetMs,
    searchMsLeft: e.searchMsLeft,
    predictedElapsedMs: e.predictedElapsedMs,
    budgetToFitMs: e.budgetToFitMs,
    coarsened: e.coarsened,
    effectiveEps: e.effectiveEps,
    mirrorPairs: e.mirrorPairs,
    uniquePieces: e.uniquePieces,
    nfpRecords: e.nfpRecords,
  };
}

/**
 * ЗАМЫСЕЛ ОДНОГО ЗАДАНИЯ до того, как он встретился с тканью: чей настил и из чего он состоит.
 *
 * Вся разница между режимами живёт ровно в том, как собирается этот список, — дальше конвейер
 * один. Внутренний тип: наружу уезжает уже `MarkerJob`, посчитанный и оценённый.
 */
type JobSpec = {
  key: string;
  colorwayId: number;
  /** Строки состава: размер, его тираж В НАСТИЛЕ и его вес В ПАРТИИ. */
  rows: { sizeId: number; units: number; batchQty: number }[];
};

/** Разбор одного скоупа, посчитанный один раз на все его задания. */
type ScopePrep = {
  split: BlockSplit;
  /** Деталь кроя за каждой разобранной деталью — от колорвея и размера не зависит. */
  pieceLineKeyById: ReadonlyMap<number, string>;
  contourLayer: string;
  contourMeasure: ContourAllowance | null;
  grainLayer: string;
  seam: SeamAllowancePrefill;
  /** Написания размеров, встреченные в файле (как они написаны в именах блоков). */
  tokens: string[];
  /** В файле есть детали БЕЗ размерного хвоста, но нет ни одного размера. */
  ungradedOnly: boolean;
};

const norm = (t: string) => t.replace(/[^\p{L}\p{N}]+/gu, '').toLowerCase();

// tech_card_marker.name — VARCHAR(191). Режем с запасом: отказ по длине пришёл бы ПОСЛЕ прогона.
const MAX_MARKER_NAME = 180;

// ПОТОЛКИ СЕРВЕРА НА СОХРАНЯЕМЫЙ МАРКЕР (internal/apisrv/admin/techcard_markers.go). Те же три
// числа знает модалка раскладки, и держать их копию здесь — сознательное решение: спросить их у
// сервера нечем, а проверяются они НА СОХРАНЕНИИ, то есть после полностью оплаченного прогона.
// Смешанный настил упирается в них куда быстрее одноразмерного: 60 M + 59 L при 45 контурах дают
// ~5355 экземпляров — браузерный движок это считает молча и минутами, а сервер отвергает.
//
// Размеры проверяются вместе с ними, но по другой причине: состав можно ужать и после прогона.
const MAX_COMPOSITION_SIZES = 32;
const MAX_MARKER_PIECES = 300;
const MAX_MARKER_PLACEMENTS = 5000;

/**
 * Ключ уникальности имени у сервера: (карточка, ПРОГОН, размер, имя).
 *
 * Прогон входит в серверный ключ и обязан входить сюда: настил партии живёт в СВОЁМ пространстве
 * имён, и засчитывать ему занятость карточного имени значило бы без нужды дописывать «#2» к
 * именам, которые ни с чем не сталкиваются. У смешанного настила размер = 0 (size_id там NULL) —
 * тем же правилом, каким сервер канонизирует свой ключ.
 */
const nameKey = (runId: number, sizeId: number, name: string) =>
  `${runId}\u001f${sizeId}\u001f${name.trim()}`;

/**
 * Имя новой раскладки. РАЗЛИЧАЮЩАЯ ЧАСТЬ ИДЁТ ПЕРВОЙ И НЕ СРЕЗАЕТСЯ.
 *
 * Имя собиралось как «колорвей · ткань · размер» и резалось с хвоста — то есть первым терялся
 * РАЗМЕР, а при длинном названии артикула и ткань. Уникальность у сервера — (карточка, прогон,
 * размер, имя), так что одинаковые имена у разных размеров сервер бы стерпел, но две ткани одного
 * размера столкнулись бы — и столкнулись бы отказом ПОСЛЕ полного прогона. Поэтому режется только
 * подпись ткани (единственная неограниченная часть), а на случай, когда и после этого имя занято
 * (обрезка двух длинных артикулов в одно и то же, либо ручная раскладка с таким же именем),
 * добавляется различающий суффикс.
 */
function baseMarkerName(parts: {
  sizeLabel: string;
  colorwayLabel: string;
  scopeLabel: string;
}): string {
  const head = [parts.sizeLabel, parts.colorwayLabel].filter(Boolean).join(' · ');
  const budget = MAX_MARKER_NAME - head.length - 3;
  const tail = budget > 0 ? parts.scopeLabel.slice(0, budget) : '';
  return [head, tail].filter(Boolean).join(' · ');
}

/**
 * То же имя, но гарантированно свободное в своём пространстве (карточка, прогон, размер).
 *
 * БАЗОВАЯ ЧАСТЬ ОТДЕЛЕНА ОТ СУФФИКСА НЕ РАДИ КРАСОТЫ: режим настила ищет свою прошлую раскладку
 * ПО ИМЕНИ, и искать по имени с уже наросшим «#2» значило бы не найти её и завести третью.
 */
function uniqueMarkerName(runId: number, sizeId: number, base: string, taken: Set<string>): string {
  let name = base;
  for (let n = 2; taken.has(nameKey(runId, sizeId, name)); n++) {
    const suffix = ` #${n}`;
    name = `${base.slice(0, MAX_MARKER_NAME - suffix.length)}${suffix}`;
  }
  taken.add(nameKey(runId, sizeId, name));
  return name;
}

/** НОД списка количеств — то, на что и только на что ужимается соотношение партии (см. шапку). */
function gcdOf(values: readonly number[]): number {
  const gcd2 = (a: number, b: number): number => (b === 0 ? a : gcd2(b, a % b));
  return values.reduce((g, v) => gcd2(g, Math.max(0, Math.round(v))), 0) || 1;
}

export function planBatchMarkers(args: {
  /** Что снимаем: размерные нормы карточки либо настил ЭТОЙ партии (см. шапку модуля). */
  mode: MarkerMode;
  /**
   * Прогон, которому принадлежит настил партии. В режиме норм это число НЕ ЧИТАЕТСЯ вовсе: нормой
   * может быть только карточная раскладка, и задание получает 0.
   */
  productionRunId: number;
  /** Клетки партии с ненулевым количеством. */
  cells: readonly BatchCell[];
  scopes: readonly PlanScope[];
  /** Колорвеи карточки с шириной их ПИНОВ по каждому слоту. */
  colorways: readonly MarkerColorway[];
  sizeLabel: (sizeId: number) => string;
  /** Порядок ГРАДАЦИИ размера — им сортируется состав настила («L, M, S» читалось бы как порча). */
  sizeOrderOf: (sizeId: number) => number;
  /** Написания, которыми размер карточки может быть записан в имени блока (уже нормализованные). */
  sizeTokensOf: (sizeId: number) => string[];
  /** Весь словарь размеров — им разбор решает, какой хвост имени является размером. */
  dictTokens: { has(token: string): boolean };
  /** КАРТОЧНЫЕ раскладки (прогонные отфильтрованы вызывающим через cardMarkers). */
  markers: readonly common_TechCardMarkerSummary[];
  /**
   * Раскладки ЭТОГО прогона — кандидаты на замену в режиме настила и вторая половина занятых имён.
   * Отдельным списком, потому что `markers` намеренно отфильтрован от прогонных: смешивать их в
   * один список значило бы предложить заменить карточную норму настилом партии.
   */
  runMarkers: readonly common_TechCardMarkerSummary[];
  /**
   * Раскладки, НА КОТОРЫЕ УЖЕ ССЫЛАЕТСЯ секция настила прогона. Перезаписать такую значит молча
   * подменить геометрию под чужой производственной строкой: секция продолжает ссылаться на тот же
   * id, её плановая длина и число полотен остаются прежними, а означают они теперь другой настил.
   */
  referencedMarkerIds: ReadonlySet<number>;
  /**
   * DXF, не принадлежащие НИ ОДНОЙ живой ткани: залитые до 0260 (ключа привязки нет вовсе) либо
   * те, чью строку BOM удалили или переклассифицировали.
   *
   * Приезжают отдельным списком и получают отдельный отказ. Молчать про них нельзя: оператор,
   * загрузивший выкройки и увидевший «раскроено всё», обязан узнать, что часть листов не
   * участвовала — иначе «всё» читается как утверждение о полноте, которым оно не является.
   */
  looseSheets: readonly ScopedSheet[];
  /** Бюджет поиска на ОДНО задание, мс. */
  timeBudgetMs: number;
  /**
   * «Требуемый припуск» карточки и припуск цеха — СЫРЫМИ, как их держат форма и настройка.
   * Нормализует их одна функция на весь клиент (`applySeamPrefill`): пустая строка — это
   * ОТСУТСТВИЕ, а ноль — заданное значение, и два места, читающие это по-своему, дали бы два
   * разных «умолчания».
   */
  cardSeamAllowanceRaw: number | string | null | undefined;
  workshopSeamAllowance: googletype_Decimal | undefined;
}): BatchMarkerPlan {
  const jobs: MarkerJob[] = [];
  const refusals: PlanRefusal[] = [];
  const colorwayById = new Map(args.colorways.map((c) => [c.colorwayId, c]));

  // Пары (колорвей, размер) партии. ТИРАЖ НАСТИЛА они не задают (см. шапку), но КОЛИЧЕСТВО едет
  // дальше: им взвешивается итог по ткани. Две линии на одну пару (законно: сетка их не создаёт, а
  // страница партии может) складываются — это один и тот же заказ на одну и ту же пару.
  const pairs: { colorwayId: number; sizeId: number; qty: number }[] = [];
  const byPair = new Map<string, { colorwayId: number; sizeId: number; qty: number }>();
  for (const c of args.cells) {
    if (c.qty <= 0 || c.colorwayId <= 0 || c.sizeId <= 0) continue;
    const k = `${c.colorwayId}:${c.sizeId}`;
    const prev = byPair.get(k);
    if (prev) {
      prev.qty += c.qty;
      continue;
    }
    const row = { colorwayId: c.colorwayId, sizeId: c.sizeId, qty: c.qty };
    byPair.set(k, row);
    pairs.push(row);
  }

  // ЗАНЯТЫЕ ИМЕНА — уникальность у сервера (tech_card_id, run_key, size_key, name), то есть имя
  // обязано быть уникальным ВНУТРИ РАЗМЕРА. Столкновение здесь стоит дороже обычного: оно
  // всплывает отказом сервера ПОСЛЕ полностью оплаченного прогона. Сеем множество сегодняшними
  // раскладками карточки и дополняем его именами, которые выдаём сами.
  //
  // Ключ берётся ТОТ ЖЕ, что у сервера: у одноразмерной раскладки size_key = её размер, у
  // смешанной — 0 (size_id там NULL). Записать смешанную под каждый её размер значило бы
  // придумывать столкновения, которых схема не знает, и без нужды дописывать «#2» к именам.
  //
  // Прогонные раскладки сеются в СВОЁ пространство имён (run_key = id прогона): столкнуться с
  // карточными они не могут, и приписывать им чужую занятость значило бы плодить «#2» на пустом
  // месте.
  const takenNames = new Set<string>();
  const seedName = (runId: number, m: common_TechCardMarkerSummary) => {
    const comp = compositionOf(m);
    takenNames.add(nameKey(runId, comp.length === 1 ? comp[0].sizeId : 0, m.name ?? ''));
  };
  for (const m of args.markers) seedName(0, m);
  for (const m of args.runMarkers) seedName(args.productionRunId, m);

  if (args.looseSheets.length > 0) {
    refusals.push({
      key: 'loose',
      scopeLabel: 'выкройки без ткани',
      colorwayLabel: '',
      sizeLabel: '',
      reason: `${args.looseSheets.length} ${args.looseSheets.length === 1 ? 'лист' : 'листов'} не привязан ни к одной строке BOM (${args.looseSheets
        .map((s) => s.name)
        .slice(0, 4)
        .join(
          ', ',
        )}) — раскладывать их не на чем: ширина и кромка приходят с артикула. Привяжите их к ткани на вкладке «выкройки».`,
    });
  }

  for (const scope of args.scopes) {
    const scopeRefusal = (reason: string) =>
      refusals.push({
        key: `${scope.key}|*`,
        scopeLabel: scope.label,
        colorwayLabel: '',
        sizeLabel: '',
        reason,
      });

    if (scope.sheets.length === 0) {
      scopeRefusal(
        'у этой ткани нет ни одного DXF — раскладывать нечего. Загрузите выкройки на вкладке «выкройки».',
      );
      continue;
    }
    // НЕДОКАЧАННЫЙ ЛИСТ ОТМЕНЯЕТ ВСЮ ТКАНЬ. Разбор по остатку укладывает «100 %» изделия, у которого
    // нет деталей с пропавшего листа: `placed == total` сходится, потому что этих деталей нет ни в
    // задании, ни в счётчике. Раньше провал скачивания жил только строкой на экране, не гасил ни
    // одного задания и даже не доезжал в `parseWarnings` сохранённого блоба — то есть сохранённая
    // раскладка выглядела чистой полной нормой. Модалка этот случай блокирует ровно так же.
    if (scope.failedSheets.length > 0) {
      scopeRefusal(
        `не скачались листы выкроек (${scope.failedSheets.join(', ')}) — разбор неполон, и раскладка по нему описывала бы изделие без этих деталей. Повторите подготовку; если лист не открывается и вручную, перезалейте его.`,
      );
      continue;
    }
    if (!scope.lineKey) {
      // Ширина и кромка приходят с АРТИКУЛА, а назначение с несколькими строками называет
      // несколько артикулов. Выбрать за оператора значило бы измерить длину на полотне, которое
      // он не выбирал, — и записать её как норму.
      scopeRefusal(
        `назначение владеет ${scope.lineCount} строками BOM — на какую из них ложится длина, машина решить не может: снимите раскладку из вкладки «выкройки», где ткань выбирают руками`,
      );
      continue;
    }
    if (scope.pieces.length === 0) {
      scopeRefusal('в выкройках этой ткани не нашлось ни одного замкнутого контура детали');
      continue;
    }

    const prep = prepareScope(scope, args);
    // UNI-ДУБЛИ — ОДИН ОТВЕТ НА ТКАНЬ, а не по разу на задание: копии неградуируемой детали и
    // рабочий слой от колорвея и состава не зависят вовсе. Спор копий гасит ВСЮ ткань: настил
    // партии, посчитанный по одной из двух выкроек наугад, неотличим от настоящего — все
    // счётчики сойдутся, а ткани не хватит (или останется) ровно на разницу.
    const uniDedupe = dedupeUniPieces(scope.pieces, prep.split.codeById, prep.contourLayer);
    if (uniDedupe.conflicts.length > 0) {
      scopeRefusal(uniConflictReason(uniDedupe.conflicts));
      continue;
    }
    // ГЕОМЕТРИЯ СОСТАВА ОБЩАЯ НА ВСЕ КОЛОРВЕИ. Колорвей меняет ПОЛОТНО (ширину и кромку), а не
    // лекала: все колорвеи стиля кроят одни и те же детали. Считать разворот по долевой и раздутие
    // припуском заново на каждый колорвей значило бы держать в памяти вкладки N копий одних и тех
    // же контуров и заплатить за них N раз. Ключ кеша — сам состав (написания размеров и их
    // тиражи), поэтому у настилов партии он делится ровно между колорвеями с ОДИНАКОВЫМ
    // соотношением, а у размерных норм — между всеми колорвеями одного размера, как и прежде.
    const geomByComposition = new Map<
      string,
      { pieces: PieceDTO[]; unitsOfPiece: Map<number, number> }
    >();

    // РАЗМЕР ИЗ КАРТОЧКИ → НАПИСАНИЕ В ФАЙЛЕ, и решается это ДО колорвеев. Один DXF несёт весь ряд,
    // и размер там записан хвостом имени блока, а не id. От колорвея вопрос не зависит вовсе —
    // лекала у стиля одни, — поэтому и отказ «такого размера в выкройках нет» произносится ОДИН раз
    // на ткань, а не по разу на каждый колорвей: три одинаковых строки читались бы как три разные
    // беды.
    const tokensBySize = new Map<number, string[]>();
    for (const sizeId of new Set(pairs.map((p) => p.sizeId))) {
      const wanted = new Set(args.sizeTokensOf(sizeId));
      const tokens = prep.tokens.filter((t) => wanted.has(norm(t)));
      if (tokens.length > 0) {
        tokensBySize.set(sizeId, tokens);
        continue;
      }
      refusals.push({
        key: `${scope.key}|size|${sizeId}`,
        scopeLabel: scope.label,
        colorwayLabel: '',
        sizeLabel: args.sizeLabel(sizeId),
        reason: prep.ungradedOnly
          ? 'в выкройках этой ткани нет размерной градации — в именах блоков размера нет вовсе, и одна геометрия отвечает за весь ряд. Такую раскладку снимают из вкладки «выкройки», одну на ткань.'
          : `в выкройках этой ткани нет деталей этого размера (в файле есть: ${prep.tokens.join(', ') || '—'})`,
      });
    }

    // ═══ ЧТО ИМЕННО РАСКЛАДЫВАЕТСЯ НА ЭТОЙ ТКАНИ ═══════════════════════════════════════════
    //
    // ЕДИНСТВЕННОЕ МЕСТО, ГДЕ РЕЖИМЫ РАСХОДЯТСЯ. Дальше идёт один и тот же конвейер: ширина,
    // геометрия, отбор деталей, оценка, конфиг, отказы, замена, имя. Задание отличается только
    // СОСТАВОМ настила и его владельцем.
    const specs: JobSpec[] = [];
    if (args.mode === 'norms') {
      // Размерная норма: одно задание на пару (колорвей, размер), настил на ОДНО изделие.
      for (const pair of pairs) {
        specs.push({
          key: `${pair.colorwayId}|${scope.key}|${pair.sizeId}`,
          colorwayId: pair.colorwayId,
          rows: [{ sizeId: pair.sizeId, units: 1, batchQty: pair.qty }],
        });
      }
    } else {
      // НАСТИЛ ПАРТИИ: одно задание на колорвей, состав — СОБСТВЕННОЕ соотношение размеров этой
      // партии, ужатое на НОД. 60 M + 40 L → 3 M + 2 L: та же пропорция, тот же настил, в 20 раз
      // дешевле поиск. Ужимать сверх НОДа нельзя — это была бы уже другая партия (см. шапку).
      const byColorway = new Map<number, typeof pairs>();
      for (const pair of pairs) {
        const list = byColorway.get(pair.colorwayId) ?? [];
        list.push(pair);
        byColorway.set(pair.colorwayId, list);
      }
      for (const [colorwayId, list] of byColorway) {
        const g = gcdOf(list.map((p) => p.qty));
        const rows = list
          .map((p) => ({
            sizeId: p.sizeId,
            units: Math.max(1, Math.round(p.qty / g)),
            batchQty: p.qty,
          }))
          .sort((a, b) => args.sizeOrderOf(a.sizeId) - args.sizeOrderOf(b.sizeId));
        // КЛЮЧ ЗАДАНИЯ НЕСЁТ СОСТАВ, и это не про уникальность — про ЧУЖОЙ РЕЗУЛЬТАТ. Карта
        // посчитанных прогонов живёт в компоненте и переживает правку строк партии; с ключом вида
        // «колорвей|ткань|mix» готовый настил 3M+2L (500 см) прицепился бы к новому плану 1M+1L и
        // напечатался как 500/2 = 250 см на изделие вместо своих 500/5 = 100. Кнопка «сохранить
        // ещё раз» при этом отправила бы СТАРЫЕ размещения с НОВЫМ составом — маркер, у которого
        // шапка и геометрия описывают разные соотношения. Другое соотношение — другое задание.
        specs.push({
          key: `${colorwayId}|${scope.key}|mix|${rows.map((r) => `${r.sizeId}x${r.units}`).join('.')}`,
          colorwayId,
          rows,
        });
      }
    }

    for (const spec of specs) {
      const cw = colorwayById.get(spec.colorwayId);
      const colorwayLabel = cw?.label ?? `#${spec.colorwayId}`;
      // Подпись состава одной строкой: «M» у нормы, «3M+2L» у настила партии. Она же уезжает в имя
      // раскладки, поэтому собирается ДО отказов — их текст тоже ею подписан.
      const sizeLabel =
        args.mode === 'norms'
          ? args.sizeLabel(spec.rows[0].sizeId)
          : spec.rows.map((r) => `${r.units}${args.sizeLabel(r.sizeId)}`).join('+');
      const key = spec.key;
      const refuse = (reason: string) =>
        refusals.push({ key, scopeLabel: scope.label, colorwayLabel, sizeLabel, reason });

      // ШИРИНА. Пин колорвея, иначе артикул слота — тем же порядком, что и в модалке раскладки.
      // Никакого умолчания в 140 см здесь нет и быть не может: ширина есть ВХОД алгоритма, и
      // раскладка, посчитанная на выдуманной ширине, даёт правдоподобную и неверную длину.
      //
      // ПИН БЕЗ ШИРИНЫ ОТКАЗЫВАЕТ ВСЕГДА, и это не строгость ради строгости. Здесь стоял фолбэк
      // «пин есть, но ширины у него нет ⇒ меряем по артикулу слота» — то есть по ДРУГОЙ ткани,
      // которую этот колорвей не закупает. Ошибка выглядит совершенно нормальным числом: длина
      // правдоподобная, слот верный, колорвей подписан, — и расходится с правдой ровно на разницу
      // ширин. Наличие пина (`has`) и его пригодность (`cutCm` конечна) — РАЗНЫЕ вопросы, и
      // отвечать на второй «нет» значит отказать, а не подставить чужой ответ на первый.
      const pin = cw?.widthByLine.get(scope.lineKey);
      const pinnedArticle = !!pin;
      const widthCm = pinnedArticle ? pin.cutCm : scope.slotCutCm;
      const selvedgeCm = pinnedArticle ? pin.selvedgeCm : scope.slotSelvedgeCm;
      const articleName =
        (pinnedArticle ? pin.articleName : scope.slotArticleName) || 'без названия';
      if (!Number.isFinite(widthCm) || widthCm <= 0) {
        refuse(
          pinnedArticle
            ? `ширина полотна не известна: у артикула «${articleName}», приколотого этим колорвеем, не заполнена ширина рулона. Ширину артикула слота сюда подставить нельзя — это другая ткань.`
            : 'ширина полотна не известна: у артикула не заполнена ширина рулона',
        );
        continue;
      }

      // РАЗМЕР БЕЗ ДЕТАЛЕЙ В ЭТОЙ ТКАНИ. Норму такого размера просто не снять — отказ уже
      // произнесён выше ОДНОЙ строкой на ткань, и второй раз на каждый колорвей его повторять
      // незачем.
      //
      // НАСТИЛ ПАРТИИ ЭТОТ СЛУЧАЙ ОТМЕНЯЕТ ЦЕЛИКОМ, и это то же правило, что у детали шире
      // полотна: выбросить размер из соотношения значит измерить настил, которого никто не кроит,
      // — а на экране он будет неотличим от настоящего, потому что все счётчики сойдутся.
      const missing = spec.rows.filter((r) => !tokensBySize.has(r.sizeId));
      if (missing.length > 0) {
        if (args.mode === 'batch') {
          refuse(
            `в выкройках этой ткани нет деталей размеров ${missing
              .map((r) => args.sizeLabel(r.sizeId))
              .join(
                ', ',
              )} — а партия их кроит. Настил без них имел бы ДРУГОЕ соотношение размеров, то есть мерил бы партию, которой никто не шьёт. Догрузите выкройки этих размеров либо снимайте размерные нормы.`,
          );
        }
        continue;
      }
      if (spec.rows.length > MAX_COMPOSITION_SIZES) {
        refuse(
          `в составе настила ${spec.rows.length} размеров, потолок сервера — ${MAX_COMPOSITION_SIZES}: такую раскладку он не примет. Разбейте партию на части.`,
        );
        continue;
      }

      const sizes: JobSizeRow[] = spec.rows.map((r) => ({
        sizeId: r.sizeId,
        sizeLabel: args.sizeLabel(r.sizeId),
        tokens: tokensBySize.get(r.sizeId) as string[],
        units: r.units,
        batchQty: r.batchQty,
      }));
      const unitsTotal = sizes.reduce((n, r) => n + r.units, 0);

      // ГЕОМЕТРИЯ КЕШИРУЕТСЯ ПО СОСТАВУ, а не по размеру: у настила партии в неё входят ещё и
      // тиражи (неградуируемая деталь кроится на КАЖДОЕ изделие состава, то есть её экземпляров
      // столько же, сколько изделий). Ключ обязан нести и написания, и числа — иначе два разных
      // соотношения одних и тех же размеров поделили бы один кеш.
      const geomKey = sizes.map((r) => `${r.tokens.join('/')}=${r.units}`).join('\u001f');
      // U+001F, а не NUL: NUL делает файл «бинарным» для grep и прячет его из поиска по
      // репозиторию — на этом уже спотыкались в nesting-modal.
      let geom = geomByComposition.get(geomKey);
      if (!geom) {
        geom = jobGeometry(scope, prep, sizes, uniDedupe.excludedIds);
        geomByComposition.set(geomKey, geom);
      }
      const built = buildJobConfig({
        scope,
        prep,
        geom,
        widthCm,
        timeBudgetMs: args.timeBudgetMs,
      });
      if (!built.ok) {
        refuse(built.reason);
        continue;
      }
      // ПОТОЛКИ СЕРВЕРА — ДО ПРОГОНА, А НЕ ПОСЛЕ. Оба числа известны ровно здесь: конфиг собран,
      // экземпляры сосчитаны. Сверх потолка задание не запускается вовсе — оплаченный бюджет и
      // двадцать минут ожидания ради отказа на сохранении хуже, чем отказ сейчас с числом в руках.
      if (built.pieceCount > MAX_MARKER_PIECES || built.instanceCount > MAX_MARKER_PLACEMENTS) {
        refuse(
          `задание больше того, что примет сервер: ${built.pieceCount} контуров (потолок ${MAX_MARKER_PIECES}) и ${built.instanceCount} размещений (потолок ${MAX_MARKER_PLACEMENTS}). ${
            args.mode === 'batch'
              ? 'Соотношение партии уже ужато на НОД и сильнее не ужимается — иначе это была бы другая партия. Разбейте партию на части либо снимайте размерные нормы.'
              : 'Уберите лишние детали или снимите раскладку из вкладки «выкройки», где состав набирают руками.'
          }`,
        );
        continue;
      }

      // ═══ ЧТО ИМЕННО ЭТО ЗАДАНИЕ ВПРАВЕ ПЕРЕЗАПИСАТЬ ═════════════════════════════════════════
      //
      // НОРМА ищет среди КАРТОЧНЫХ раскладок по (ткань, колорвей, размер), и замена обязана быть
      // ОДНОЗНАЧНОЙ: раньше бралось первое совпадение из списка в серверном порядке, то есть при
      // ручной пробной рядом с НАЗНАЧЕННОЙ НОРМОЙ перезаписывалась та, что оказалась раньше в
      // массиве, и какая именно — на экране не было написано.
      //
      // НАСТИЛ ПАРТИИ СТРОЖЕ, и это не симметрия ради симметрии. Пара (ткань, колорвей) внутри
      // прогона НЕ ПРИНАДЛЕЖИТ этой очереди: туда же копируют карточные раскладки кнопкой
      // «скопировать в прогон» и ставят их в секции настила. Замена по одной лишь паре нашла бы
      // ровно такую копию — и подменила бы под живой секцией её геометрию: секция ссылается на тот
      // же id, её плановая длина и число полотен остаются прежними, а означают они уже другой
      // настил. Поэтому переписывается только раскладка, которая (а) принадлежит ЭТОМУ прогону,
      // (б) НЕ ЗАНЯТА ни одной секцией и (в) носит ИМЕННО ТО имя, которое эта очередь генерирует
      // для этого задания, — то есть с высокой вероятностью её же прошлый результат. Не сошлось
      // хоть одно условие — заводим новую раскладку, а не догадываемся.
      const baseName = baseMarkerName({ sizeLabel, colorwayLabel, scopeLabel: scope.label });
      const runPeers =
        args.mode === 'batch'
          ? findRunReplacements(args.runMarkers, {
              bomLineKey: scope.lineKey,
              colorwayId: spec.colorwayId,
            })
          : [];
      const match =
        args.mode === 'norms'
          ? findReplacements(args.markers, {
              bomLineKey: scope.lineKey,
              colorwayId: spec.colorwayId,
              sizeId: spec.rows[0].sizeId,
            })
          : runPeers.filter((m) => m.name === baseName && !args.referencedMarkerIds.has(m.id));
      // ДВА КАНДИДАТА — ОТКАЗ В ОБОИХ РЕЖИМАХ. У настила партии предикат выше сузил выбор до
      // раскладки с ТЕМ ЖЕ именем, а имя внутри прогона уникально по схеме — то есть двух быть не
      // может; проверка стоит потому, что «не может» здесь опирается на чужой индекс, а цена
      // ошибки — перезапись произвольной из двух производственных строк.
      if (match.length > 1) {
        refuse(
          `на эту ткань, колорвей и размер уже снято ${match.length} раскладки: ${match
            .map((m) => `«${m.name}»${m.isNorm ? ' (НОРМА)' : ''}${m.isDraft ? ' (ЧЕРНОВИК)' : ''}`)
            .join(', ')}. Какую из них пересчитывать — решает человек: удалите лишнюю ${
            args.mode === 'batch' ? 'на странице партии' : 'на вкладке «выкройки»'
          } либо переснимите нужную оттуда же.`,
        );
        continue;
      }
      const replaces = match[0] ?? null;
      const notes: string[] = [];
      // ЧУЖИЕ РАСКЛАДКИ ПРОГОНА НАЗЫВАЮТСЯ ВСЛУХ. Они остаются нетронутыми — но оператор обязан
      // знать, что новая встанет РЯДОМ, а не вместо: иначе «раскроить заново» выглядит как
      // пересчёт, а на странице партии обнаруживаются две раскладки на одну ткань и один цвет.
      const untouched = runPeers.filter((m) => m.id !== (replaces?.id ?? 0));
      if (untouched.length > 0) {
        notes.push(
          `в партии на эту ткань и колорвей уже есть ${untouched
            .map(
              (m) =>
                `«${m.name}»${args.referencedMarkerIds.has(m.id) ? ' (стоит в настиле)' : ''}${m.isDraft ? ' (черновик)' : ''}`,
            )
            .join(
              ', ',
            )} — их эта очередь НЕ ТРОГАЕТ: раскладку, на которую ссылается настил, подменять нельзя. Новая встанет рядом; лишнюю удаляют на странице партии`,
        );
      }
      if (replaces?.isNorm) {
        notes.push(
          `эта раскладка сейчас НОРМА ткани — пересъёмка двигает число, по которому считается себестоимость; применять новую норму в рецепт придётся руками`,
        );
      }
      if (replaces?.isDraft) {
        notes.push(
          `сейчас это ЧЕРНОВИК — уложились не все детали. Пересчёт заменит его по id; чтобы он стал полной раскладкой, бюджета должно хватить на всю укладку`,
        );
      }
      if (args.mode === 'norms') {
        const shared = sharedMarkerFor(args.markers, scope.lineKey, spec.rows[0].sizeId);
        if (!replaces && shared) {
          notes.push(
            `на этот слот и размер уже есть ОБЩАЯ раскладка «${shared}» (без колорвея) — она снята на ширине слота, и новая её не заменит, а встанет рядом`,
          );
        }
      }
      // ЦЕНА СМЕШАННОГО НАСТИЛА НАЗЫВАЕТСЯ ВСЛУХ. Экземпляров в нём столько, сколько изделий в
      // соотношении, и поиск дорожает вместе с ними (предпросчёт NFP — нет: он платится за пары
      // УНИКАЛЬНЫХ контуров, а они те же). Тихо ужать соотношение нельзя, поэтому единственный
      // честный ход — назвать прогноз и оставить оператору галочку.
      // ═══ СОСТАВ СВЁЛСЯ К ОДНОМУ ИЗДЕЛИЮ — НАСТИЛА ЗДЕСЬ НЕТ ════════════════════════════════
      //
      // Партия, заказавшая колорвей в ОДНОМ размере (100 × M), после ужатия на НОД даёт состав
      // {M × 1} — то есть движок меряет ровно ту разреженную укладку одного изделия, которую
      // соседний режим сам называет заниженной. Число получается верное, но НЕ ТО, за которым
      // сюда приходят, и молча выдать его КПД за «реальный процент раскроя партии» значило бы
      // соврать ровно в том месте, ради которого режим написан. Ужать нечего: соотношение и есть
      // соотношение партии.
      if (args.mode === 'batch' && unitsTotal === 1) {
        notes.push(
          `состав свёлся к ОДНОМУ изделию (${sizeLabel}): в партии этот колорвей заказан в одном размере, и настила как такового здесь нет — движок положит одно изделие, то есть ту же разреженную укладку, что и размерная норма. КПД выйдет ниже цехового, а расход — с запасом`,
        );
      }
      if (args.mode === 'batch' && unitsTotal > 1) {
        const secs = built.estimate?.predictedElapsedMs;
        notes.push(
          `настил кроит ${unitsTotal} изделий (${sizeLabel}) — это соотношение партии, ужатое на НОД; ${built.pieceCount} уникальных контуров, ${built.instanceCount} экземпляров на полотне${
            secs != null ? `, прогноз ~${Math.ceil(secs / 1000)} с` : ''
          }. Дорого — снимите галочку: сильнее соотношение не ужимается, иначе это была бы другая партия`,
        );
      }
      if (built.estimate?.outlook === 'starved') {
        notes.push(
          `бюджета не хватит даже на предпросчёт геометрии: поиска не будет вовсе. Нужен бюджет от ${Math.ceil(built.estimate.budgetToFitMs / 1000)} с.`,
        );
      } else if (built.estimate?.outlook === 'squeezed') {
        notes.push(
          `предпросчёт съест больше своей доли бюджета — поиску останется ${Math.round(built.estimate.searchMsLeft / 1000)} с`,
        );
      }

      // Размер градации КАЖДОЙ уложенной детали — в блоб схемы 4 (нужен смешанному составу).
      // Считается по тем же токенам, которыми отбирались детали: второго правила «чей это размер»
      // здесь быть не должно.
      const sizeIdByToken = new Map<string, number>();
      for (const r of sizes) for (const t of r.tokens) sizeIdByToken.set(t, r.sizeId);
      const sizeIdByPieceId = new Map<number, number>();
      for (const piece of built.pieces) {
        const sid = sizeIdByToken.get(prep.split.codeById.get(piece.id)?.size ?? '') ?? 0;
        if (sid > 0) sizeIdByPieceId.set(piece.id, sid);
      }

      const composition = sizes
        .map((r) => ({ sizeId: r.sizeId, quantity: r.units }))
        .sort((a, b) => a.sizeId - b.sizeId);
      const runKey = args.mode === 'batch' ? args.productionRunId : 0;
      // КЛЮЧ ИМЕНИ ПОВТОРЯЕТ ПРАВИЛО ХРАНЕНИЯ, а не режим. Однородный состав уезжает легаси-парой
      // (size_id, sets) — и его size_key у сервера равен размеру; смешанный кладёт size_id в NULL,
      // и ключ там 0. Решает это одна функция (legacyPairOf), и здесь повторяется её условие, а не
      // «norms ⇒ размер, batch ⇒ 0»: настил партии из ОДНОГО размера (колорвей заказан в одном
      // размере) хранится однородным, и ключ у него размерный.
      const nameSizeKey = composition.length === 1 ? composition[0].sizeId : 0;

      jobs.push({
        id: key,
        mode: args.mode,
        // ВЛАДЕЛЕЦ. Норма — карточная всегда: прогонная раскладка нормой быть не может физически
        // (CHECK chk_tcm_run_not_norm) и умирает вместе с прогоном. Настил партии — прогонный по
        // той же причине, только с обратным знаком: его соотношение принадлежит ОДНОМУ заказу, и
        // запрет схемы здесь ровно то, что нужно.
        productionRunId: args.mode === 'batch' ? args.productionRunId : 0,
        // ИМЯ. У размерной нормы имя ЗАМЕЩАЕМОЙ раскладки сохраняется как есть: переименовать
        // чужую запись мимоходом — значит отобрать у оператора то, чем он их различает, а её
        // размер и так неизменен.
        //
        // У НАСТИЛА ПАРТИИ ЗАМЕЩАЕМАЯ РАСКЛАДКА УЖЕ НОСИТ ЭТО ЖЕ ИМЯ — по нему её и опознали
        // (см. предикат замены выше), потому что в имени стоит СОСТАВ («3M+2L · BEI · ткань»), а
        // состав меняется вместе с составом партии. Раскладка с другим соотношением в имени — это
        // не «та же самая, переименованная», а другая раскладка, и трогать её нельзя.
        markerName: replaces?.name || uniqueMarkerName(runKey, nameSizeKey, baseName, takenNames),
        batchQty: sizes.reduce((n, r) => n + Math.max(0, r.batchQty), 0),
        pieceLineKeyById: prep.pieceLineKeyById,
        colorwayId: spec.colorwayId,
        colorwayLabel,
        scopeKey: scope.key,
        scopeLabel: scope.label,
        role: scope.role,
        bomLineKey: scope.lineKey,
        unit: scope.unit,
        // Один размер — у нормы; у смешанного настила ОДНОГО размера нет, и 0 здесь — ответ, а не
        // пробел (ровно его же сервер держит в size_id как NULL).
        sizeId: args.mode === 'norms' ? spec.rows[0].sizeId : 0,
        sizeLabel,
        sizes,
        unitsTotal,
        composition,
        sizeIdByPieceId,
        widthCm,
        selvedgeCm,
        articleName,
        pinned: pinnedArticle,
        direction: scope.direction,
        contourLayer: prep.contourLayer,
        grainLayer: prep.grainLayer,
        seamAllowanceMm: prep.seam.value,
        seamAllowanceWhy: prep.seam.why,
        contourAllowanceMm:
          prep.contourMeasure && prep.contourMeasure.allowanceCm != null
            ? engineCmToMm(prep.contourMeasure.allowanceCm)
            : null,
        pieceCount: built.pieceCount,
        instanceCount: built.instanceCount,
        pieces: built.pieces,
        detectedUnit: scope.detectedUnit,
        config: built.config,
        estimate: built.estimate,
        replaces,
        notes,
        parseWarnings: scope.parseWarnings,
      });
    }
  }

  return { jobs, refusals };
}

/**
 * Что решается ОДИН РАЗ на ткань, а не на каждое задание: контурный слой, слой долевой, припуск.
 *
 * Это не экономия. Разбор имён (`splitPiecesBySize`) решает, какой хвост является размером, ГЛЯДЯ
 * НА СОСЕДЕЙ — то есть ответ зависит от того, что лежит рядом в этом же скоупе. Посчитать его
 * заново на подмножестве значило бы получить другой набор токенов у той же ткани.
 */
function prepareScope(
  scope: PlanScope,
  args: {
    dictTokens: { has(token: string): boolean };
    cardSeamAllowanceRaw: number | string | null | undefined;
    workshopSeamAllowance: googletype_Decimal | undefined;
  },
): ScopePrep {
  const split = splitPiecesBySize(scope.pieces, args.dictTokens);
  // Индекс припуска строится по ПОЛНОМУ разбору: улика — это второй контур того же блока, то есть
  // ровно то, что фильтр по слою и выбрасывает.
  const allowanceIndex = buildAllowanceIndex(scope.pieces);
  const layers = layerOptions(scope.pieces, split.codeById, allowanceIndex);
  const contourLayer = defaultContourLayer(layers);
  const layerOption = layers.find((o) => o.layer === contourLayer);
  const contourMeasure = layerOption?.allowance ?? null;
  const grainLayer = defaultGrainLayer(grainLayerOptions(scope.pieces));
  // Порядок источников припуска (замер файла → эталон карточки → цех → умолчание) — тот же код,
  // что у диалога «по выкройкам»: разойдись они, «раскладка» и «оценка» мерили бы разные контуры.
  const seam = applySeamPrefill(layerOption, args.cardSeamAllowanceRaw, args.workshopSeamAllowance);
  // Размеры считаются ПО ВЫБРАННОМУ СЛОЮ: на справочном слое (недградуируемом) те же имена блоков
  // лежат без градации, и взяв их, задание отбирало бы детали, которых на рабочем слое нет.
  const tokens: string[] = [];
  const seen = new Set<string>();
  let ungraded = false;
  for (const p of scope.pieces) {
    if ((p.layer ?? '') !== contourLayer) continue;
    const t = split.codeById.get(p.id)?.size ?? '';
    if (!t) {
      ungraded = true;
      continue;
    }
    if (seen.has(t)) continue;
    seen.add(t);
    tokens.push(t);
  }
  tokens.sort((a, b) => (split.orderOfSize.get(a) ?? 1e6) - (split.orderOfSize.get(b) ?? 1e6));
  return {
    split,
    // Обе половины ключа детали кроя сходятся ровно здесь: скоуп алиасов отфильтровал вызывающий,
    // разбор дал идентичности блоков. Правило — общее с модалкой раскладки (piece-selection.ts).
    pieceLineKeyById: pieceLineKeysByPieceId(scope.pieces, split, scope.aliases),
    contourLayer,
    contourMeasure,
    grainLayer,
    seam,
    tokens,
    ungradedOnly: tokens.length === 0 && ungraded,
  };
}

/**
 * Контуры СОСТАВА РОВНО В ТОМ ВИДЕ, В КАКОМ ИХ УЛОЖИТ ДВИЖОК.
 *
 * Порядок преобразований — тот же, что у модалки и у воркера, и он не переставляется: сначала
 * разворот по долевой, потом раздутие припуском. Обе функции чистые и зовутся здесь ровно ради
 * ОЦЕНКИ (она меряет контуры, которые реально уедут в движок); сам движок применит их сам, на своей
 * копии, теми же аргументами — геометрия через границу воркера не ходит.
 *
 * От колорвея НЕ ЗАВИСИТ (лекала у стиля одни), поэтому результат делится между его заданиями.
 *
 * ФОРМУЛА ТИРАЖА — ОБЩАЯ С МОДАЛКОЙ (piece-selection.ts), и оба режима зовут её одинаково. Вся
 * разница между размерной нормой и настилом партии умещается в аргумент: одна строка состава с
 * тиражом 1 против нескольких строк с тиражами соотношения. Деталь БЕЗ размерного хвоста при этом
 * получает `unitsTotal` — она кроится на каждое изделие состава, и подсунуть ей единицу значило бы
 * выкроить настил без карманов.
 */
function jobGeometry(
  scope: PlanScope,
  prep: ScopePrep,
  sizes: readonly JobSizeRow[],
  /**
   * Проигравшие копии uni-детали (dedupeUniPieces). Приходит СВЕРХУ, посчитанное один раз на
   * ткань: от состава этот ответ не зависит, а второй его экземпляр был бы вторым ответом на
   * вопрос «сколько экземпляров этой детали кроят» — ровно то расхождение, ради которого формула
   * тиража живёт в общем модуле.
   */
  uniExcludedIds: ReadonlySet<number>,
): { pieces: PieceDTO[]; unitsOfPiece: Map<number, number> } {
  const rows: MarkerCompositionRow[] = sizes.map((r) => ({ tokens: r.tokens, qty: r.units }));
  const units = markerUnits({ graded: true, rows, ungradedUnits: 1 });
  const unitsOfPiece = unitsOfPieces(
    scope.pieces,
    (id) => prep.split.codeById.get(id)?.size ?? '',
    units,
  );
  const selected = selectMarkerPieces(scope.pieces, prep.contourLayer, unitsOfPiece).filter(
    (p) => !uniExcludedIds.has(p.id),
  );
  if (selected.length === 0) return { pieces: [], unitsOfPiece };
  const oriented = orientToGrain(selected, prep.grainLayer);
  return {
    pieces: applySeamAllowance(oriented.pieces, mmToEngineCm(prep.seam.value)).pieces,
    unitsOfPiece,
  };
}

/**
 * Задание движка на один размер ОДНОГО ПОЛОТНА: от ширины зависит и отбор деталей, и цена.
 *
 * `{ ok: false }` — ОТКАЗ, а не пустой результат: см. ниже про деталь шире полотна.
 */
function buildJobConfig(args: {
  scope: PlanScope;
  prep: ScopePrep;
  geom: { pieces: PieceDTO[]; unitsOfPiece: Map<number, number> };
  widthCm: number;
  timeBudgetMs: number;
}):
  | {
      ok: true;
      config: NestConfig;
      estimate: JobForecast | null;
      pieces: PieceDTO[];
      pieceCount: number;
      instanceCount: number;
    }
  | { ok: false; reason: string } {
  const { scope, prep, widthCm } = args;
  const { pieces, unitsOfPiece } = args.geom;
  if (pieces.length === 0) {
    return { ok: false, reason: 'на выбранном контурном слое нет ни одной детали этого состава' };
  }

  // ═══ ДЕТАЛЬ ШИРЕ ПОЛОТНА ОТМЕНЯЕТ ВСЁ ЗАДАНИЕ ═══════════════════════════════════════════════
  //
  // Здесь стоял ФИЛЬТР: не влезшая деталь молча выбрасывалась, а конфиг, счётчики и блоб строились
  // по остатку. Итог был катастрофическим и при этом безупречным на вид — движок укладывал 40 из
  // 40, `placed == total` сходилось, серверная сверка «placed_count == число размещений» тоже
  // (выброшенной детали нет НИ ТАМ, НИ ТАМ), и раскладка сохранялась как полная. То есть маркер
  // утверждал, что кроит изделие, у которого на самом деле нет спинки, — и становился НОРМОЙ, по
  // которой считают деньги и заказывают ткань.
  //
  // Молчаливое усечение изделия не имеет безопасной формы. Единственный честный ответ — отказать
  // ВСЕМ заданием и назвать деталь: чинится это либо другим полотном, либо самой выкройкой, и оба
  // решения принимает человек.
  //
  // ПРАВИЛО ВЛЕЗАНИЯ — ДВИЖКОВОЕ, А НЕ САМОДЕЛЬНОЕ. `min(bboxH, bboxW)` игнорировал политику
  // поворотов: при запрещённом поперечном крое деталь, которая пролезает только на 90°, считалась
  // влезшей — задание уходило в прогон и сжигало весь бюджет, чтобы вернуть «уложил 39 из 40».
  // Берём ровно то, чем меряет движок (`allowedRotations` + `fittingRotations` + `crossSpanCm`).
  const rotations = allowedRotations(scope.direction, NEST_DEFAULTS.allowCrossGrain);
  const usable = widthCm - 2 * NEST_DEFAULTS.edgeMarginCm;
  const tooWide = pieces.filter(
    (p) => fittingRotations((r) => crossSpanCm(p, r), rotations, usable).length === 0,
  );
  if (tooWide.length > 0) {
    const named = tooWide
      .slice(0, 3)
      .map((p) => {
        const across = Math.min(...rotations.map((r) => crossSpanCm(p, r)));
        return `«${p.blockName || p.name}» ${across.toFixed(1)} см поперёк`;
      })
      .join(', ');
    const more = tooWide.length > 3 ? ` и ещё ${tooWide.length - 3}` : '';
    return {
      ok: false,
      reason:
        `${tooWide.length === 1 ? 'деталь не влезает' : `${tooWide.length} деталей не влезают`} в раскройную ширину ${usable.toFixed(1)} см: ${named}${more}. ` +
        `Раскладка без них описывала бы изделие без этих деталей, поэтому задание не запускается: нужна ткань шире, ` +
        `разрешённый поперечный крой либо правка выкройки.`,
    };
  }
  const fits = pieces;

  const config: NestConfig = {
    pieces: fits.map((p) => ({
      pieceId: p.id,
      quantity: unitsOfPiece.get(p.id) ?? 0,
      // Группа — размер: на однородном настиле она одна на всех, и второго засева не будет.
      // Едет всё равно, чтобы задание очереди и задание модалки были одним и тем же объектом.
      groupKey: prep.split.codeById.get(p.id)?.size ?? '',
    })),
    fabricWidthCm: widthCm,
    targetLengthCm: undefined,
    gapCm: NEST_DEFAULTS.gapCm,
    edgeMarginCm: NEST_DEFAULTS.edgeMarginCm,
    allowCrossGrain: NEST_DEFAULTS.allowCrossGrain,
    fabricDirection: scope.direction,
    grainLayer: prep.grainLayer,
    seamAllowanceCm: mmToEngineCm(prep.seam.value),
    timeBudgetMs: args.timeBudgetMs,
    rdpEpsCm: NEST_DEFAULTS.rdpEpsCm,
  };
  const job = estimateJob(pieces, config);
  return {
    ok: true,
    config,
    // Та же функция, которую движок зовёт внутри себя: прогноз и прогон не могут разойтись, потому
    // что модель одна. Пустое задание оценке не по чему считать — это не ноль, а «нечего».
    estimate: job.length > 0 ? forecastOf(estimateRun(job, config)) : null,
    // Блоб и конфиг описывают ОДИН И ТОТ ЖЕ набор — теперь буквально один массив: деталь, не
    // влезающая в полотно, уже отменила задание выше, поэтому «отобранного подмножества» здесь
    // больше не существует.
    pieces: fits,
    pieceCount: fits.length,
    instanceCount: config.pieces.reduce((s, p) => s + p.quantity, 0),
  };
}

/**
 * Раскладка, которую задание ПЕРЕСНИМЕТ: та же ткань, тот же колорвей, тот же (единственный) размер.
 *
 * Колорвей сверяется ТОЧНО, а не «свой или общий». Общая раскладка (colorway_id = 0) снята на
 * ширине СЛОТА, а не на артикуле колорвея; заменить её по id значило бы задним числом приписать
 * чужой замер конкретному колорвею — то есть ровно та подмена, ради предотвращения которой колонка
 * colorway_id и заводилась.
 *
 * Смешанная раскладка кандидатом не является: её длина общая на весь настил, и «заменить» её
 * одноразмерной значило бы потерять остальные размеры её состава.
 */
function findReplacements(
  markers: readonly common_TechCardMarkerSummary[],
  target: { bomLineKey: string; colorwayId: number; sizeId: number },
): MarkerReplacement[] {
  const out: MarkerReplacement[] = [];
  for (const m of markers) {
    if ((m.bomLineKey ?? '') !== target.bomLineKey) continue;
    if (Number(m.colorwayId ?? 0) !== target.colorwayId) continue;
    const comp = compositionOf(m);
    if (comp.length !== 1 || comp[0].sizeId !== target.sizeId) continue;
    const id = Number(m.id ?? 0);
    if (!id) continue;
    out.push({ id, name: m.name ?? '', isNorm: m.isNorm === true, isDraft: m.isDraft === true });
  }
  return out;
}

/**
 * Настил ЭТОГО ПРОГОНА, который задание переснимет: та же ткань, тот же колорвей.
 *
 * СОСТАВ НЕ СВЕРЯЕТСЯ, и это не небрежность. У прогона на пару (ткань, колорвей) настил ровно
 * один; его соотношение — производное от состава партии, и когда партию правят, соотношение
 * МЕНЯЕТСЯ. Сверять состав значило бы при каждой правке партии оставлять рядом со свежим настилом
 * прежний, снятый на соотношении, которого больше нет, — и первым же вопросом стало бы «а какой из
 * них показывает расход партии».
 *
 * Список сюда приходит уже отфильтрованным по прогону (вызывающий), поэтому карточную норму эта
 * функция не увидит физически.
 */
function findRunReplacements(
  runMarkers: readonly common_TechCardMarkerSummary[],
  target: { bomLineKey: string; colorwayId: number },
): MarkerReplacement[] {
  const out: MarkerReplacement[] = [];
  for (const m of runMarkers) {
    if ((m.bomLineKey ?? '') !== target.bomLineKey) continue;
    if (Number(m.colorwayId ?? 0) !== target.colorwayId) continue;
    const id = Number(m.id ?? 0);
    if (!id) continue;
    out.push({ id, name: m.name ?? '', isNorm: m.isNorm === true, isDraft: m.isDraft === true });
  }
  return out;
}

/** Имя ОБЩЕЙ раскладки (без колорвея) на этот слот и размер — для предупреждения на строке. */
function sharedMarkerFor(
  markers: readonly common_TechCardMarkerSummary[],
  bomLineKey: string,
  sizeId: number,
): string | null {
  for (const m of markers) {
    if ((m.bomLineKey ?? '') !== bomLineKey) continue;
    if (Number(m.colorwayId ?? 0) !== 0) continue;
    const comp = compositionOf(m);
    if (comp.length === 1 && comp[0].sizeId === sizeId) return m.name ?? '';
  }
  return null;
}
