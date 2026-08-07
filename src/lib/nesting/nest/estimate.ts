// ЦЕНА ПРОГОНА, ПОСЧИТАННАЯ ДО ПРОГОНА — и посчитанная ОДИН РАЗ на движок и на экран.
//
// Раскладка идёт двумя стадиями: ПРЕДПРОСЧЁТ геометрии (все попарные NFP, цена растёт по
// сложности контуров) и ПОИСК, который меряется поколениями. До Ф2.3 обе цены были известны
// только постфактум: оператор жал «запустить», ждал весь бюджет и узнавал из телеметрии, что
// предпросчёт съел всё, а поколений вышло ноль. Модель, которая это предсказывает, в движке уже
// была — она выбирает ступень упрощения контуров, — но жила внутри nest() и наружу не выдавалась.
//
// Здесь она вынута целиком. nest() зовёт эту функцию (а не держит вторую копию), поэтому экран
// обещает ровно то, что движок сделает: разойтись им нечем. Проба scripts/nest-budget-probe.mjs
// сверяет предсказание экрана с телеметрией настоящего прогона на реальных файлах — и число, и
// выбранную ступень.
import type { Pt, RotationDeg } from '../types';
import { allowedRotations, allowsFlip } from '../types';
import type { NestConfig, NestPieceConfig, PieceDTO } from '../types';
import { rdpSimplify, sanitizeLoop } from '../geom/clipper';
import { ensureCCW } from '../geom/polygon';
import { convexParts, type ConvexDecomposition } from '../geom/triangulate';
import type { Flip } from './nfp';

// ── the prepass budget (Ф0) ────────────────────────────────────────────────────────────
//
// The measured problem, on the real 45-piece file at the default 20 s budget:
//
//   nfp pairs=2070 done=544 (26%) | generations=0 | elapsed=51162ms | placed=45/45
//
// Zero generations means the marker the screen called «оптимизировано» is the first greedy
// stack, unsearched — and it took 51 seconds to say so. The cost is entirely in the NFP
// prepass, and the prepass cost is entirely in the CONVEX PART COUNT: a pair costs
// parts(a)×parts(b) Minkowski hulls plus a union tree over them, and clipper2's Union
// degrades catastrophically past ~100 overlapping inputs (nfp.ts documents the cliff).
//
// Measured on that file, one pair at a time:
//
//   rdpEps  parts/piece  hulls/pair  ms/pair   2070 pairs
//   0.05    15.2         252         50.3      104 s
//   0.10    10.6         119          8.8       18 s
//   0.20     8.3          72          4.7       10 s
//   0.40     5.4          32          1.8        4 s
//
// So the fidelity of the NFP INPUT decides whether a search happens at all. Raising it is
// not free — the gap octagon compensates simplification with +2·eps, which spaces pieces
// slightly further apart than they need — but the full-job numbers say the trade is worth
// making at scale and not at all at small scale:
//
//   20 pieces: eps 0.05 → 297.0 cm (44 gen) · eps 0.40 → 314.6 cm (288 gen)
//   45 pieces: eps 0.05 → 758.9 cm ( 0 gen, 53 s) · eps 0.40 → 711.2 cm (41 gen, 20 s)
//
// Below the cliff the honest eps wins on quality; above it, it loses to its own prepass.
// Hence: choose the SMALLEST eps on a fixed ladder whose predicted hull count fits the
// prepass share of the budget. The prediction is pure geometry and the cap is pure config,
// so the choice is a function of the INPUT — the marker stays reproducible on any machine,
// which a wall-clock-driven choice would have broken.
const EPS_LADDER = [0.1, 0.15, 0.2, 0.3, 0.4, 0.6, 0.9] as const;
// Share of the time budget the prepass may plan to spend. The GA needs the rest, and it
// needs it warm: NFPs missing from the cache are computed lazily DURING evaluation, where
// they cost the same but buy no progress bar.
//
// ЗДЕСЬ И ЖИВЁТ ЗАПАС — весь, целиком. Оценка времени ниже медианная (не запасливая), и на
// реальных заданиях она сходится с фактом так: 0.76, 0.84, 0.90, 1.04, 1.26, 1.28 (оба файла
// ЦЕЛИКОМ, обе хиральности, шесть прогонов). Значит худший факт ≈ 0.45 × 1.3 ≈ 0.59 бюджета, и
// на это число — а не на память — калибруется порог пробы «предпросчёт не съел бюджет» (0.7).
// Сдвинется оценка — сдвинутся оба.
export const PREPASS_SHARE = 0.45;
// The GA always gets a floor even when the NFP prepass ate the whole budget. Живёт здесь, а не
// у поиска, потому что это часть БЮДЖЕТНОЙ модели: ровно на эти две секунды прогон уходит за
// заявленный бюджет, когда предпросчёт в него не уложился, и предсказание обязано это сказать.
export const GA_MIN_MS = 2_000;
// СКОЛЬКО ОБОЛОЧЕК В МИЛЛИСЕКУНДУ — ЗАМЕР, А НЕ КОНСТАНТА, и зависит он от того, сколько
// оболочек приходится на ОДНО объединение. Здесь стояло сперва плоское «12 на всё», потом три
// ступеньки; обе редакции ошибались в разы и ошибались В СТОРОНУ ПЕРЕРАСХОДА — предсказание
// проходило под потолок, предпросчёт съедал бюджет целиком, поколений выходило НОЛЬ.
//
// Замерено инструментом, который считает ровно тот путь, что движок (время одного ensure() на
// пару), на ОБОИХ реальных файлах целиком — 46 деталей blazer.dxf и 45 деталей summer men.dxf,
// по нескольку сотен пар в каждом бине, медиана бина:
//
//   оболочек на объединение     4    23    45    91   181   320   490   735  1122  ~1500
//   blazer,      обол/мс      6.0   5.4   4.7   5.5   4.3   2.9   2.0   1.05  0.89   0.33
//   summer men,  обол/мс     10.8  10.4  10.2   9.1   9.2   2.9   1.75    —     —      —
//
// Отсюда три факта, каждый из которых ломает прежнюю модель:
//   • В ДЕШЁВОМ режиме скорость 5–10, а не 12–18. Прежние 12 (и «13.5» из старой таблицы,
//     снятой на другом файле и другой машине) оптимистичны примерно вдвое.
//   • ОБРЫВ лежит около 256–320 оболочек на объединение и он резкий: 4–9 обол/мс до него, 2.9
//     сразу за ним. Это обрыв самого clipper'а (шапка nest/nfp.ts), а не свойство машины —
//     он воспроизводится на обоих файлах в одном и том же месте.
//   • ПОСЛЕ обрыва скорость продолжает падать, а не выходит на полку: 2.9 → 1.7 → 1.0 → 0.33.
//     Плоское «5 за обрывом» ошибалось на порядок там, где деталь сложная: у blazer.dxf есть
//     детали с 40 и 39 выпуклыми частями при eps 0.05, то есть самопара даёт 1600 оболочек на
//     объединение. Задание из НЕМНОГИХ, но заковыристых деталей проскакивало под потолок по
//     числу пар — и отдавало предпросчёту весь бюджет.
//
// Поэтому модель — сама таблица: узлы ниже интерполируются в лог-лог, за последним узлом
// продолжается наклон последнего отрезка. Функция непрерывна (у ступенек p/rate(p) прыгал вдвое
// на одну лишнюю оболочку, а effectiveEps входит в зерно поиска — прыжок переставлял маркер),
// монотонна и никуда не обращается, кроме своего аргумента.
const HULL_RATE: ReadonlyArray<readonly [perUnion: number, hullsPerMs: number]> = [
  [200, 8],
  [320, 2.9],
  [500, 1.7],
  [750, 1.0],
  [1500, 0.33],
];
function hullsPerMs(perUnion: number): number {
  const p = Math.max(1, perUnion);
  if (p <= HULL_RATE[0][0]) return HULL_RATE[0][1];
  for (let i = 1; i < HULL_RATE.length; i++) {
    const [p1, r1] = HULL_RATE[i];
    if (p > p1) continue;
    const [p0, r0] = HULL_RATE[i - 1];
    const t = Math.log(p / p0) / Math.log(p1 / p0);
    return Math.exp(Math.log(r0) + t * (Math.log(r1) - Math.log(r0)));
  }
  // За таблицей — наклон последнего отрезка (≈ p^-1.6). Пол 0.02 обол/мс: не физика, а защита
  // от деления на ноль и от бесконечной оценки, до которой ни один реальный файл не доходит.
  const [pa, ra] = HULL_RATE[HULL_RATE.length - 2];
  const [pb, rb] = HULL_RATE[HULL_RATE.length - 1];
  const k = Math.log(rb / ra) / Math.log(pb / pa);
  return Math.max(0.02, rb * Math.pow(p / pb, k));
}
// Two properties of this scheme worth knowing before touching it:
//
//   • Оценка теперь МЕДИАННАЯ, а не запасливая: запас живёт в PREPASS_SHARE, где он назван, а
//     не размазан по константам скорости. Так predictedPrepassMs в телеметрии можно сверять с
//     фактическим prepassMs и видеть, врёт модель или нет, — чего с зашитым запасом не сделать.
//     Замеренная сходимость на реальных заданиях — в комментарии к PREPASS_SHARE.
//   • Crossing a rung RESEEDS the search: effectiveEps is part of the seed string in nest(), so
//     adding one piece or nudging the budget can replace the marker outright rather than perturb
//     it. That is a consequence of keeping the choice a pure function of the input — the
//     alternative (a stable eps chosen by the clock) buys continuity by giving up
//     reproducibility, which is the one property the whole engine is built around.

// Convex-part decomposition of one contour at a given simplification. Sanitize AFTER
// simplification: RDP can self-intersect a thin neck, and feeding that to the decomposer
// should be a designed path (hull fallback), not luck.
export function partsAt(poly: readonly Pt[], eps: number): ConvexDecomposition {
  const simplified = rdpSimplify(poly, eps);
  return convexParts(ensureCCW(sanitizeLoop(simplified) ?? simplified));
}

// ── что именно оценивается ─────────────────────────────────────────────────────────────

// Одна УНИКАЛЬНАЯ деталь задания. Экземпляры сюда не входят: предпросчёт платится за ПАРУ
// деталей, а не за пару экземпляров — вторая копия той же детали в той же хиральности не стоит
// ни одной новой оболочки. Тираж решает цену ПОИСКА, а не подготовки.
export type EstimatePiece = {
  id: number;
  // Контур ровно тот, что уйдёт в движок: уже развёрнутый по долевой и раздутый на припуск.
  // Оценка по сырому контуру из файла считала бы другую геометрию — а разница припуска на
  // числе выпуклых частей видна.
  poly: readonly Pt[];
  // Повороты, в которых деталь ВЛЕЗАЕТ в ширину полотна (fittingRotations). Не весь набор
  // ткани: деталь, не проходящая в 90°, даёт паре вдвое меньше относительных углов, и считать
  // ей их значило бы предсказывать работу, которой не будет.
  allowedRots: readonly RotationDeg[];
  // Хиральности, которые реально встречаются у экземпляров этой детали.
  flips: readonly Flip[];
};

// Что будет с ПОИСКОМ после предпросчёта. Три разных исхода, и путать их нельзя: у первых двух
// поиск идёт (просто короче), у третьего его практически нет.
export type SearchOutlook =
  // Предпросчёт укладывается в свою долю бюджета — то, ради чего лестница ступеней и заведена.
  | 'search'
  // Предпросчёт вылезает за долю, но успевает закончиться в бюджет: поиску остаётся меньше, чем
  // задумано, но кеш он получит тёплым. Так выглядит задание, которому не хватило даже самой
  // грубой ступени, но не сильно.
  | 'squeezed'
  // Предпросчёт не успевает ЗАКОНЧИТЬСЯ: его оборвут по дедлайну, поиск получит холодный кеш и
  // аварийные GA_MIN_MS, а прогон уйдёт за заявленный бюджет. Это ровно тот прогон, что дал
  // «0 поколений за 51 секунду» в шапке выше.
  | 'starved';

export type RunEstimate = {
  uniquePieces: number;
  // Записей NFP: пара × относительный угол × хиральность. Это же число движок кладёт в
  // telemetry.nfpTotal, и проба сверяет их равенство.
  nfpRecords: number;
  requestedEps: number;
  effectiveEps: number;
  // Ступень пришлось погрубить — контуры упростятся сильнее, чем просили.
  coarsened: boolean;
  // Погрубело ли из-за ЗЕРКАЛ: у задания с парными деталями записей NFP вдвое больше, и сказать
  // оператору «деталей много» было бы неправдой — тех же деталей без зеркал хватает на ступень
  // тоньше.
  mirrorPairs: boolean;
  predictedHulls: number;
  predictedPrepassMs: number;
  prepassCapMs: number;
  timeBudgetMs: number;
  // Предпросчёт уложился в свою долю (predictedPrepassMs <= prepassCapMs).
  fitsBudget: boolean;
  outlook: SearchOutlook;
  // Сколько миллисекунд бюджета останется поиску. 0 у 'starved' — там поиск живёт на аварийном
  // полу GA_MIN_MS, а не на бюджете.
  searchMsLeft: number;
  // Сколько прогон займёт по часам, СВЕРХУ — и null там, где верхней границы нет.
  //
  // Пока предпросчёт укладывается, ожидание ограничено бюджетом: обе стадии останавливаются по
  // дедлайну, и число здесь — оценка сверху (маленькое задание встанет раньше, по
  // MAX_GENERATIONS).
  //
  // У 'starved' верхней границы НЕТ, и это не осторожность. Предпросчёт режется по дедлайну, но
  // недосчитанные NFP никуда не деваются: поиск считает их лениво ВНУТРИ оценки особи, а
  // прерывается он только МЕЖДУ особями. Одна особь на холодном кеше стоит сотни NFP, и в
  // замеренном случае (шапка файла) бюджет в 20 с обернулся 51 секундой. Напечатать здесь
  // «бюджет + 2 с» значило бы пообещать 22 — то есть соврать втрое и именно про то, чего
  // оператор хочет избежать.
  predictedElapsedMs: number | null;
  // Бюджет, при котором предпросчёт уложился бы в свою долю. Это ГАРАНТИЯ, а не прикидка: с
  // большим потолком лестница выберет ступень не грубее нынешней, а любая ступень, проходящая под
  // потолок, укладывается в бюджет по определению. Экран печатает это число как единственный
  // точный совет — «дайте столько времени», — вместо «дайте больше».
  budgetToFitMs: number;
  // САМЫЕ ДОРОГИЕ ДЕТАЛИ задания, по числу выпуклых частей на выбранной ступени. Цена пары —
  // произведение частей, поэтому одна заковыристая деталь дорожает ВСЕ свои пары разом; убрать
  // её эффективнее, чем убрать три простые. Оператор иначе убирает наугад.
  heaviest: { id: number; parts: number }[];
  // СКОЛЬКО ПОКОЛЕНИЙ УСПЕЕТ ПОИСК — НЕИЗВЕСТНО, и это null, а не число.
  //
  // Цена поколения зависит от числа экземпляров, от того, сколько NFP придётся досчитать лениво,
  // и от машины; измеренной константы «мс на поколение» в движке НЕТ — в отличие от HULL_RATE,
  // которая снята на обоих реальных файлах по сотне пар в бине. Поставить сюда число, выведенное
  // из четырёх анекдотов в шапке этого файла, значит напечатать оператору цифру, которой ничего
  // не меряли: неверный прогноз хуже отсутствующего, потому что по нему принимают решения.
  // Экран поэтому говорит то, что модель знает: сколько секунд останется поиску (searchMsLeft) и
  // когда их не останется вовсе. Появится замер — появится и число, и его место уже готово.
  expectedGenerations: number | null;
  // Разложения на ВЫБРАННОЙ ступени, в порядке job. Движок берёт их отсюда, а не считает второй
  // раз: разложение — самая дорогая часть самой оценки.
  decompositions: ConvexDecomposition[];
};

// ── политика «влезает ли деталь в полотно» ─────────────────────────────────────────────
//
// Сравнение и его допуск живут ЗДЕСЬ, в одном месте, а измеряют поперечный габарит стороны
// по-своему: движок берёт границы уже построенных вариантов контура, экран — bbox детали.
// Разъехаться они могут только в измерении, а не в правиле, и проба держит их равными.
export function fittingRotations(
  spanAcrossCm: (rot: RotationDeg) => number,
  rotations: readonly RotationDeg[],
  usableWidthCm: number,
): RotationDeg[] {
  return rotations.filter((r) => spanAcrossCm(r) <= usableWidthCm + 1e-9);
}

// Поперечный габарит детали в повороте, из её bbox. 0/180 не трогают ось Y вовсе, 90/270
// меняют оси местами. Зеркало габаритов не меняет (M: x ↦ −x), поэтому хиральность здесь не
// спрашивается — ширина полосы не умеет разрешить одну и запретить другую.
export function crossSpanCm(p: { bboxW: number; bboxH: number }, rot: RotationDeg): number {
  return rot === 0 || rot === 180 ? p.bboxH : p.bboxW;
}

// Сколько экземпляров детали кроятся ЗЕРКАЛЬНО — ПОСЛЕДНИЕ mirroredCount штук (types.ts).
// Обрезка обязательна: задание приходит извне, а «зеркал больше, чем деталей» не значит ничего.
// NaN/Infinity отсекаются ОТДЕЛЬНО, а не обрезкой: Math.floor(NaN) это NaN, любое сравнение с
// ним ложно, и парная деталь молча вышла бы незеркальной парой одинаковых — тот самый брак,
// только теперь из-за испорченного числа во входе.
export function mirroredCount(quantity: number, flippedQuantity: number | undefined): number {
  const wanted = Number(flippedQuantity ?? 0);
  if (!Number.isFinite(wanted)) return 0;
  return Math.min(Math.max(0, Math.floor(wanted)), quantity);
}

// Какие хиральности реально встретятся у экземпляров детали. Пустой массив — все экземпляры
// заказаны зеркальными, а ткань переворота не допускает: класть нечем, и в предпросчёт такая
// деталь не входит (движок отвечает тем же — 'mirror' в unplaced).
function flipsOfInstances(pc: NestPieceConfig, canFlip: boolean): Flip[] {
  const mirrored = mirroredCount(pc.quantity, pc.flippedQuantity);
  const out: Flip[] = [];
  if (pc.quantity - mirrored > 0) out.push(0);
  if (mirrored > 0 && canFlip) out.push(1);
  return out;
}

// ЗАДАНИЕ ГЛАЗАМИ ОЦЕНКИ — из тех же двух аргументов, что берёт nest().
//
// Экран зовёт это, движок — нет: у движка к этому месту уже построены варианты контуров и гены
// с экземплярами, и он собирает EstimatePiece[] из них (nest/index.ts). Расходятся две сборки
// ровно в одном — чем меряется поперечный габарит, — и проба nest-budget-probe.mjs сверяет их
// результат на реальных файлах: предсказание экрана обязано совпасть с телеметрией прогона.
export function estimateJob(
  pieces: readonly PieceDTO[],
  config: Pick<
    NestConfig,
    'pieces' | 'fabricWidthCm' | 'edgeMarginCm' | 'allowCrossGrain' | 'fabricDirection'
  >,
): EstimatePiece[] {
  const rotations = allowedRotations(config.fabricDirection, config.allowCrossGrain);
  const canFlip = allowsFlip(config.fabricDirection);
  const usableWidth = config.fabricWidthCm - 2 * config.edgeMarginCm;
  const byId = new Map(pieces.map((p) => [p.id, p]));
  const out = new Map<number, EstimatePiece>();
  for (const pc of config.pieces) {
    if (pc.quantity <= 0) continue;
    const dto = byId.get(pc.pieceId);
    if (!dto) continue; // деталь, которой нет в разборе: движок ответит 'missing'
    const flips = flipsOfInstances(pc, canFlip);
    if (flips.length === 0) continue;
    const prev = out.get(dto.id);
    if (prev) {
      // Одна и та же деталь двумя строками задания: хиральности ОБЪЕДИНЯЮТСЯ, повороты берутся
      // от первой — ровно так их видит движок, у которого гены одной детали делят один набор.
      const merged = new Set<Flip>([...prev.flips, ...flips]);
      out.set(dto.id, { ...prev, flips: [...merged].sort() });
      continue;
    }
    const allowedRots = fittingRotations((r) => crossSpanCm(dto, r), rotations, usableWidth);
    if (allowedRots.length === 0) continue; // шире полотна в любом повороте: 'width'
    out.set(dto.id, { id: dto.id, poly: dto.poly, allowedRots, flips });
  }
  return [...out.values()];
}

// ── сама оценка ────────────────────────────────────────────────────────────────────────

// Which relative rotations a pair can actually be asked for. With every piece free to wear
// 0/180 this is the whole set, but a piece too tall for the fabric at 90° carries a narrower
// allowedRots, and precomputing rels it can never wear is pure waste.
//
// Обе функции ниже экспортируются, потому что предпросчёт в nest() строит по ним НАСТОЯЩИЙ
// список пар. Держать здесь свою копию правила значило бы позволить оценке считать одно, а
// движку — обходить другое; тогда «предрасчёт ~8 с» на экране относилось бы к работе, которой
// движок не делает, и разойтись они умели бы молча.
export function relsFor(a: readonly RotationDeg[], b: readonly RotationDeg[]): RotationDeg[] {
  const out = new Set<RotationDeg>();
  for (const ra of a) for (const rb of b) out.add(((((rb - ra) % 360) + 360) % 360) as RotationDeg);
  return [...out].sort((x, y) => x - y);
}

// Пара деталей требует канона N0 (bFlip 0), если у неё бывает ОДИНАКОВАЯ хиральность, и канона
// X0 (bFlip 1) — если РАЗНАЯ; см. шапку nest/nfp.ts. Обычная деталь без зеркал даёт ровно то же
// множество записей, что и до Ф1.2, поэтому задание без парных деталей не платит за них ничего.
export function kindsFor(fa: Iterable<Flip> | undefined, fb: Iterable<Flip> | undefined): Flip[] {
  const a = new Set<Flip>(fa ?? [0]);
  const b = new Set<Flip>(fb ?? [0]);
  const out: Flip[] = [];
  if ((a.has(0) && b.has(0)) || (a.has(1) && b.has(1))) out.push(0);
  if ((a.has(0) && b.has(1)) || (a.has(1) && b.has(0))) out.push(1);
  return out;
}

// ВЫБОР СТУПЕНИ УПРОЩЕНИЯ И ЦЕНА, КОТОРУЮ ОН ОБЕЩАЕТ. Чистая функция от задания и двух чисел
// конфига: ни часов, ни глобального состояния — иначе один и тот же вход дал бы на двух машинах
// разные маркеры (effectiveEps входит в зерно поиска).
export function estimateRun(
  job: readonly EstimatePiece[],
  config: Pick<NestConfig, 'timeBudgetMs' | 'rdpEpsCm'>,
): RunEstimate {
  // Потолок в МИЛЛИСЕКУНДАХ, а не в оболочках: цена оболочки зависит от того, сколько их в
  // одном объединении (см. hullsPerMs), и складывать их в одно число значило бы считать дешёвую
  // и запредельную пару одинаковыми.
  const prepassCapMs = Math.max(1, config.timeBudgetMs * PREPASS_SHARE);
  const ladder = [config.rdpEpsCm, ...EPS_LADDER.filter((e) => e > config.rdpEpsCm)];
  let effectiveEps = config.rdpEpsCm;
  let predictedHulls = 0;
  let predictedMs = 0;
  let nfpRecords = 0;
  let mirrorPairs = false;
  let decompositions: ConvexDecomposition[] = [];
  for (let li = 0; li < ladder.length; li++) {
    const eps = ladder[li];
    decompositions = job.map((p) => partsAt(p.poly, eps));
    const counts = decompositions.map((d) => d.parts.length);
    let hulls = 0;
    let ms = 0;
    let records = 0;
    mirrorPairs = false;
    for (let i = 0; i < job.length; i++) {
      for (let j = i; j < job.length; j++) {
        const rels = relsFor(job[i].allowedRots, job[j].allowedRots);
        // Разнохиральная пара — ВТОРАЯ запись на ту же пару и тот же rel: её оболочки считаются
        // заново (отражением одной детали зеркальную пару не получить). Не учесть её здесь
        // значило бы занизить предсказание вдвое ровно на тех заданиях, где парных деталей
        // много, — и снова получить ноль поколений после полного бюджета.
        const kinds = kindsFor(job[i].flips, job[j].flips).length;
        if (kinds > 1) mirrorPairs = true;
        // Оболочек в ОДНОМ объединении — по этому числу и берётся скорость; сколько таких
        // объединений у пары, решают повороты и хиральности.
        const perUnion = counts[i] * counts[j];
        const unions = rels.length * kinds;
        hulls += perUnion * unions;
        ms += (perUnion * unions) / hullsPerMs(perUnion);
        records += unions;
      }
    }
    effectiveEps = eps;
    predictedHulls = hulls;
    predictedMs = ms;
    nfpRecords = records;
    if (ms <= prepassCapMs || li === ladder.length - 1) break;
  }

  const fitsBudget = predictedMs <= prepassCapMs;
  // Предпросчёт обрывается по дедлайну бюджета (nest/index.ts), поэтому «не влезает в долю» и
  // «не успевает вовсе» — два РАЗНЫХ исхода, и второй стоит оператору всего прогона.
  const starved = predictedMs >= config.timeBudgetMs;
  const searchMsLeft = starved ? 0 : Math.max(0, config.timeBudgetMs - predictedMs);
  return {
    uniquePieces: job.length,
    nfpRecords,
    requestedEps: config.rdpEpsCm,
    effectiveEps,
    coarsened: effectiveEps > config.rdpEpsCm,
    mirrorPairs,
    predictedHulls,
    predictedPrepassMs: Math.round(predictedMs),
    prepassCapMs,
    timeBudgetMs: config.timeBudgetMs,
    fitsBudget,
    outlook: starved ? 'starved' : fitsBudget ? 'search' : 'squeezed',
    searchMsLeft,
    predictedElapsedMs: starved
      ? null
      : Math.round(predictedMs + Math.max(searchMsLeft, GA_MIN_MS)),
    budgetToFitMs: Math.ceil(predictedMs / PREPASS_SHARE),
    heaviest: decompositions
      .map((d, i) => ({ id: job[i].id, parts: d.parts.length }))
      .sort((a, b) => b.parts - a.parts)
      .slice(0, 3),
    expectedGenerations: null,
    decompositions,
  };
}
