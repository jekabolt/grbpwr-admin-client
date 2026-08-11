// ПЛАНИРОВЩИК РАСКЛАДОК ПОД ПАРТИЮ — чистая функция, ни одного хука.
//
// Вход: состав партии (колорвей × размер × количество), колорвеи карточки с их пинами, скоупы
// ткани с уже РАЗОБРАННЫМИ выкройками и сегодняшние раскладки карточки. Выход: список заданий для
// движка, каждое со своей ценой прогона, и список ОТКАЗОВ, каждый со своей причиной.
//
// ═══ ОДНО ЗАДАНИЕ = (КОЛОРВЕЙ × ТКАНЬ × РАЗМЕР), И ЭТО РЕШЕНИЕ, А НЕ УДОБСТВО ═══════════════════
//
// Соблазн — снять ОДНУ смешанную раскладку на весь микс партии: она короче суммы однородных (мелкие
// детали одного размера садятся в выпады другого), и звучит как «настоящий настил». Нормой она быть
// не может: смешанный настил меряется на КОНКРЕТНОМ соотношении размеров этой партии, и норма с
// него привязала бы себестоимость стиля к случайному миксу одного заказа. Следующая партия с другим
// миксом получила бы то же число — и оно было бы неверным ровно на разницу соотношений. Поэтому
// здесь снимаются ОДНОРАЗМЕРНЫЕ раскладки: они переиспользуются между партиями, а сервер выдаёт с
// них скалярную норму без оговорок (смешанной он её не выдаёт вовсе — scalarNormRefusal).
//
// Смешанный настил под КОНКРЕТНУЮ партию — отдельный продукт (раскройная раскладка прогона,
// production_run_id > 0), и в этой волне его нет.
//
// ═══ КАЖДАЯ РАСКЛАДКА ЗДЕСЬ — КАРТОЧНАЯ (production_run_id = 0) ════════════════════════════════
//
// Партия решает только, КАКИЕ пары (колорвей, размер) стоит раскладывать. Владельцем результата она
// не становится: прогонная раскладка нормой быть не может физически (CHECK chk_tcm_run_not_norm) и
// умирает вместе с прогоном по FK CASCADE — то есть не может стать тем, ради чего эта фаза и
// написана.
//
// ═══ ТИРАЖ НАСТИЛА — ОДНО ИЗДЕЛИЕ КАЖДОГО РАЗМЕРА ══════════════════════════════════════════════
//
// Состав задания — {размер × 1}, и количество из партии сюда НЕ ЕДЕТ. Причина инженерная: тираж
// умножает ЭКЗЕМПЛЯРЫ, а поиск — это перебор порядков размещения, чья сложность растёт от их числа.
// Файл реального пиджака даёт 40–45 контуров НА ОДНО изделие; тираж партии в 30 штук превратил бы
// задание в тысячу с лишним экземпляров, и поиск не успел бы сделать ни одного поколения за любой
// разумный бюджет (предпросчёт NFP при этом не подорожал бы вовсе — он платится за ПАРЫ ДЕТАЛЕЙ, —
// так что прогноз выглядел бы прежним и врал бы).
//
// ЦЕНА ЭТОГО ВЫБОРА НАЗВАНА ВСЛУХ НА ЭКРАНЕ: настил на одно изделие кладётся РЕДЕ настоящего
// многокомплектного, поэтому измеренный расход выходит с запасом, а КПД — ниже цехового. Ошибка
// направлена в безопасную сторону (заниженная норма обнаруживается не на экране, а на складе, когда
// ткань кончилась), но она есть, и молчать о ней нельзя.
import type { common_TechCardMarkerSummary, googletype_Decimal } from 'api/proto-http/admin';
import { applySeamAllowance } from 'lib/nesting/geom/seam-allowance';
import { orientToGrain } from 'lib/nesting/geom/grain-orient';
import { estimateJob, estimateRun, type RunEstimate } from 'lib/nesting/nest/estimate';
import type { FabricDirection, NestConfig, PieceDTO, Unit } from 'lib/nesting/types';
import { NEST_DEFAULTS } from 'lib/nesting/types';
import { engineCmToMm, mmToEngineCm } from './allowance-units';
import { buildAllowanceIndex, type ContourAllowance } from './contour-allowance';
import { defaultContourLayer, layerOptions, type SeamAllowancePrefill } from './contour-layer';
import type { MarkerColorway } from './colorway-widths';
import type { ScopedSheet } from './dxf-by-scope';
import { applySeamPrefill } from './dxf-apply-conditions';
import { defaultGrainLayer, grainLayerOptions } from './grain';
import { compositionOf } from './marker-io';
import { markerUnits, selectMarkerPieces, unitsOfPieces } from './piece-selection';
import { splitPiecesBySize, type BlockSplit } from './split-pieces';

/** Клетка состава партии: сколько изделий одного размера одного колорвея в неё заказано. */
export type BatchCell = { colorwayId: number; sizeId: number; qty: number };

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

/** Раскладка, которую задание ЗАМЕНИТ (та же ткань, тот же колорвей, тот же размер). */
export type MarkerReplacement = { id: number; name: string; isNorm: boolean };

export type MarkerJob = {
  /** Стабильный ключ задания: (колорвей, ткань, размер). */
  id: string;
  colorwayId: number;
  colorwayLabel: string;
  scopeKey: string;
  scopeLabel: string;
  role: string;
  bomLineKey: string;
  unit: string;
  sizeId: number;
  sizeLabel: string;
  /** Написание размера в именах блоков — им задание отбирает свои детали. */
  sizeToken: string;
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

/** Разбор одного скоупа, посчитанный один раз на все его задания. */
type ScopePrep = {
  split: BlockSplit;
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

export function planBatchMarkers(args: {
  /** Клетки партии с ненулевым количеством. */
  cells: readonly BatchCell[];
  scopes: readonly PlanScope[];
  /** Колорвеи карточки с шириной их ПИНОВ по каждому слоту. */
  colorways: readonly MarkerColorway[];
  sizeLabel: (sizeId: number) => string;
  /** Написания, которыми размер карточки может быть записан в имени блока (уже нормализованные). */
  sizeTokensOf: (sizeId: number) => string[];
  /** Весь словарь размеров — им разбор решает, какой хвост имени является размером. */
  dictTokens: { has(token: string): boolean };
  /** КАРТОЧНЫЕ раскладки (прогонные отфильтрованы вызывающим через cardMarkers). */
  markers: readonly common_TechCardMarkerSummary[];
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

  // Пары (колорвей, размер) партии — без количеств: тираж настила они не задают (см. шапку).
  const pairs: { colorwayId: number; sizeId: number }[] = [];
  const seenPair = new Set<string>();
  for (const c of args.cells) {
    if (c.qty <= 0 || c.colorwayId <= 0 || c.sizeId <= 0) continue;
    const k = `${c.colorwayId}:${c.sizeId}`;
    if (seenPair.has(k)) continue;
    seenPair.add(k);
    pairs.push({ colorwayId: c.colorwayId, sizeId: c.sizeId });
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
    // ГЕОМЕТРИЯ ОДНОГО РАЗМЕРА ОБЩАЯ НА ВСЕ КОЛОРВЕИ. Колорвей меняет ПОЛОТНО (ширину и кромку), а
    // не лекала: все колорвеи стиля кроят одни и те же детали. Считать разворот по долевой и
    // раздутие припуском заново на каждый колорвей значило бы держать в памяти вкладки N копий
    // одних и тех же контуров и заплатить за них N раз.
    const geomByToken = new Map<
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

    for (const pair of pairs) {
      const cw = colorwayById.get(pair.colorwayId);
      const colorwayLabel = cw?.label ?? `#${pair.colorwayId}`;
      const sizeLabel = args.sizeLabel(pair.sizeId);
      const key = `${pair.colorwayId}|${scope.key}|${pair.sizeId}`;
      const refuse = (reason: string) =>
        refusals.push({ key, scopeLabel: scope.label, colorwayLabel, sizeLabel, reason });

      // ШИРИНА. Пин колорвея, иначе артикул слота — тем же порядком, что и в модалке раскладки.
      // Никакого умолчания в 140 см здесь нет и быть не может: ширина есть ВХОД алгоритма, и
      // раскладка, посчитанная на выдуманной ширине, даёт правдоподобную и неверную длину.
      const pin = cw?.widthByLine.get(scope.lineKey);
      const pinned = !!pin && Number.isFinite(pin.cutCm);
      const widthCm = pinned ? pin.cutCm : scope.slotCutCm;
      const selvedgeCm = pinned ? pin.selvedgeCm : scope.slotSelvedgeCm;
      const articleName = (pinned ? pin.articleName : scope.slotArticleName) || 'без названия';
      if (!Number.isFinite(widthCm) || widthCm <= 0) {
        refuse(
          pinned || cw?.widthByLine.has(scope.lineKey)
            ? `ширина полотна не известна: у артикула «${articleName}», приколотого этим колорвеем, не заполнена ширина рулона`
            : 'ширина полотна не известна: у артикула не заполнена ширина рулона',
        );
        continue;
      }

      // Размер, которого в файле нет, уже отказан выше — ОДНОЙ строкой на ткань, а не по разу на
      // каждый колорвей.
      const tokens = tokensBySize.get(pair.sizeId);
      if (!tokens) continue;

      const geomKey = tokens.join('\u001f'); // U+001F, а не NUL: NUL делает файл «бинарным» для grep
      // и прячет его из поиска по репозиторию — на этом уже спотыкались в nesting-modal.
      let geom = geomByToken.get(geomKey);
      if (!geom) {
        geom = jobGeometry(scope, prep, tokens);
        geomByToken.set(geomKey, geom);
      }
      const built = buildJobConfig({
        scope,
        prep,
        geom,
        widthCm,
        timeBudgetMs: args.timeBudgetMs,
      });
      if (!built) {
        refuse(
          `ни одна деталь размера ${sizeLabel} не помещается в раскройную ширину ${widthCm} см — на этом полотне такую раскладку не выкроить`,
        );
        continue;
      }

      const replaces = findReplacement(args.markers, {
        bomLineKey: scope.lineKey,
        colorwayId: pair.colorwayId,
        sizeId: pair.sizeId,
      });
      const notes: string[] = [];
      if (replaces?.isNorm) {
        notes.push(
          `эта раскладка сейчас НОРМА ткани — пересъёмка двигает число, по которому считается себестоимость; применять новую норму в рецепт придётся руками`,
        );
      }
      const shared = sharedMarkerFor(args.markers, scope.lineKey, pair.sizeId);
      if (!replaces && shared) {
        notes.push(
          `на этот слот и размер уже есть ОБЩАЯ раскладка «${shared}» (без колорвея) — она снята на ширине слота, и новая её не заменит, а встанет рядом`,
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

      jobs.push({
        id: key,
        colorwayId: pair.colorwayId,
        colorwayLabel,
        scopeKey: scope.key,
        scopeLabel: scope.label,
        role: scope.role,
        bomLineKey: scope.lineKey,
        unit: scope.unit,
        sizeId: pair.sizeId,
        sizeLabel,
        sizeToken: tokens[0],
        widthCm,
        selvedgeCm,
        articleName,
        pinned,
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
    contourLayer,
    contourMeasure,
    grainLayer,
    seam,
    tokens,
    ungradedOnly: tokens.length === 0 && ungraded,
  };
}

/**
 * Контуры одного размера РОВНО В ТОМ ВИДЕ, В КАКОМ ИХ УЛОЖИТ ДВИЖОК.
 *
 * Порядок преобразований — тот же, что у модалки и у воркера, и он не переставляется: сначала
 * разворот по долевой, потом раздутие припуском. Обе функции чистые и зовутся здесь ровно ради
 * ОЦЕНКИ (она меряет контуры, которые реально уедут в движок); сам движок применит их сам, на своей
 * копии, теми же аргументами — геометрия через границу воркера не ходит.
 *
 * От колорвея НЕ ЗАВИСИТ (лекала у стиля одни), поэтому результат делится между его заданиями.
 */
function jobGeometry(
  scope: PlanScope,
  prep: ScopePrep,
  tokens: string[],
): { pieces: PieceDTO[]; unitsOfPiece: Map<number, number> } {
  // Состав — ОДИН размер и ОДНО изделие (см. шапку модуля).
  const units = markerUnits({ graded: true, rows: [{ tokens, qty: 1 }], ungradedUnits: 1 });
  const unitsOfPiece = unitsOfPieces(
    scope.pieces,
    (id) => prep.split.codeById.get(id)?.size ?? '',
    units,
  );
  const selected = selectMarkerPieces(scope.pieces, prep.contourLayer, unitsOfPiece);
  if (selected.length === 0) return { pieces: [], unitsOfPiece };
  const oriented = orientToGrain(selected, prep.grainLayer);
  return {
    pieces: applySeamAllowance(oriented.pieces, mmToEngineCm(prep.seam.value)).pieces,
    unitsOfPiece,
  };
}

/** Задание движка на один размер ОДНОГО ПОЛОТНА: от ширины зависит и отбор деталей, и цена. */
function buildJobConfig(args: {
  scope: PlanScope;
  prep: ScopePrep;
  geom: { pieces: PieceDTO[]; unitsOfPiece: Map<number, number> };
  widthCm: number;
  timeBudgetMs: number;
}): {
  config: NestConfig;
  estimate: JobForecast | null;
  pieces: PieceDTO[];
  pieceCount: number;
  instanceCount: number;
} | null {
  const { scope, prep, widthCm } = args;
  const { pieces, unitsOfPiece } = args.geom;
  if (pieces.length === 0) return null;
  // Деталь, не влезающая в полотно ни в одном разрешённом повороте, снимается ДО прогона — ровно
  // как галочка в модалке. Оставить её значило бы заказать прогон, который заведомо не уложит всё,
  // и получить «уложил 31 из 45» после полного бюджета.
  const usable = widthCm; // отступ от кромки 0 — тот же дефолт, что у модалки (NEST_DEFAULTS)
  const fits = pieces.filter((p) => Math.min(p.bboxH, p.bboxW) <= usable + 1e-9);
  if (fits.length === 0) return null;

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
    config,
    // Та же функция, которую движок зовёт внутри себя: прогноз и прогон не могут разойтись, потому
    // что модель одна. Пустое задание оценке не по чему считать — это не ноль, а «нечего».
    estimate: job.length > 0 ? forecastOf(estimateRun(job, config)) : null,
    // В блоб уезжают ВСЕ контуры задания, включая не влезшие в ширину: их движок пометит
    // unplaced, прогон при этом окажется неполным и сохранён не будет. Отдаём `fits` — ровно то,
    // что уехало в конфиг, чтобы блоб и задание описывали один набор.
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
function findReplacement(
  markers: readonly common_TechCardMarkerSummary[],
  target: { bomLineKey: string; colorwayId: number; sizeId: number },
): MarkerReplacement | null {
  for (const m of markers) {
    if ((m.bomLineKey ?? '') !== target.bomLineKey) continue;
    if (Number(m.colorwayId ?? 0) !== target.colorwayId) continue;
    const comp = compositionOf(m);
    if (comp.length !== 1 || comp[0].sizeId !== target.sizeId) continue;
    const id = Number(m.id ?? 0);
    if (!id) continue;
    return { id, name: m.name ?? '', isNorm: m.isNorm === true };
  }
  return null;
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
