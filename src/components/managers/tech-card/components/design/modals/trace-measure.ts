import type { TraceClass, TraceComponent, TraceMeasurement } from './trace-types';
import { calibrateAxisRadii, widthFromRadii } from './trace-width';

/**
 * ═══ Ф1 — ИЗМЕРЕНИЕ РАСТРА И РАЗДЕЛЕНИЕ ЕГО НА СЛОИ ══════════════════════════════════════════
 *
 * Растр входит — ЧИСЛА выходят. Ни одной кривой здесь не строится и ни одного штриха не рождается:
 * этот файл отвечает на вопрос «что именно нарисовано и каким пером», а `trace-centerline.ts` и
 * `trace-dashes.ts` отвечают на вопрос «как это записать». Шов между ними объявлен ЗАРАНЕЕ в
 * `trace-types.ts` и выведен ни из чего: ни один из трёх файлов не импортирует другой.
 *
 * Спецификация — `tmp/plans/design-band-ai/140-RASTER-TO-VECTOR-REPORT.md` (отчёт владельца),
 * разбиение — `150-CENTERLINE-PLAN.md`, раздел Ф1. Каждое число ниже ЗАМЕРЕНО там, а не выбрано.
 *
 * ── ПОРЯДОК ШАГОВ — ЭТО И ЕСТЬ АЛГОРИТМ ──────────────────────────────────────────────────────
 *
 *   1. Серый. Цветной скан — по МИНИМУМУ каналов: синяя линия по белому имеет низкий синий канал
 *      и высокую яркость, поэтому по яркости она бы побелела и исчезла.
 *   2. Черновая бинаризация → черновой dt → `w_max = 2·p99.5(dt|ink)`. Это ВТОРОЙ ПРОХОД: σ
 *      размытия нельзя назвать, не зная, какое самое толстое перо на листе.
 *   3. Выравнивание фона ДЕЛЕНИЕМ на `GaussianBlur(σ ≥ 4·w_max)`. Замер отчёта на градиенте
 *      110…255: сырой + Otsu даёт ink IoU 0.057 (один стежок из 46), деление — 0.996; top-hat
 *      0.927, adaptive 0.914, Sauvola 0.912. Деление, а не вычитание, потому что затенение
 *      МУЛЬТИПЛИКАТИВНО — так устроен свет; вычитание подъедает края.
 *   4. Белая точка по p92 → 255. Главный убийца JPEG-ringing (p99 ряби 15 → 0): рябь живёт на
 *      насыщенном фоне и уезжает в белое вся сразу.
 *   5. ГЛОБАЛЬНЫЙ Otsu. Для чёрного по белому гистограмма бимодальна — ровно предпосылка Otsu, и
 *      побить его трудно (замер на чистом PNG: Otsu 0.980, adaptive 0.955, Wolf 0.923, Sauvola
 *      0.918, Niblack 0.479).
 *   6. Distance transform (L2, точный) и утоньшение Чжана–Суэня. Поле расстояний КАЛИБРУЕТСЯ НА
 *      ОСИ по полутоновому профилю поперёк неё — сырой EDT знает только решётку, и «−1» в формуле
 *      толщины верна на ней только под 0° и 90°: под 30° полоса 3 px возвращалась как 1.83.
 *      Правило, замеры и отклонённые кандидаты — `trace-width.ts`.
 *   7. Связные компоненты + признаки. `width = 2·median(dt|skel) − 1`, одно на всех: и здесь, и в
 *      осевой зовётся `widthFromRadii` из `trace-width.ts`, второй копии правила в проекте нет.
 *   8. Разделение по толщине — ПИКИ KDE, не фиксированные пороги: чертёж рисуется дискретным
 *      набором перьев, и моды реально разделены.
 *   9. Разделение по непрерывности: длинное — штрих, короткое — кандидат в стежок.
 *  10. Отсев грязи — КОЛЛИНЕАРНАЯ ПОДДЕРЖКА, а не площадь.
 *  11. «Переоткрытие» толстых компонент — возврат тонкого материала, приклеенного к толстому.
 *
 * ── ЧТО ЗДЕСЬ ЗАПРЕЩЕНО, И ЧЕГО ЭТО СТОИЛО ОТЧЁТУ ────────────────────────────────────────────
 *
 *   • ЛЮБОЙ РЕСАЙЗ ДО ИЗМЕРЕНИЯ. Толщина меряется в пикселях оригинала или не меряется вовсе.
 *   • MORPHOLOGICAL CLOSING / DILATE «ДЛЯ НОРМАЛИЗАЦИИ ТОЛЩИНЫ». Пары двойной отстрочки идут на
 *     14 px при штрихе 3 px; одно закрытие ядром 15×15 сваривает их в ОДНУ полосу, и структура
 *     невосстановима. Нормализовать толщину можно в SVG, но не в растре.
 *   • ADAPTIVE THRESHOLD и NIBLACK. На JPEG q50 adaptive дал 407 компонент против истинных 245,
 *     из них 165 паразитных мельче 4 px; Niblack — 954 компоненты и 11 стежков из 46. Механизм:
 *     окно стоит на белой бумаге, локальное среднее ≈ 255, и рябь пересекает `mean − C`.
 *     Понадобится локальный порог — только Sauvola (k ≈ 0.34) или Wolf.
 *   • ПЛОЩАДНОЙ ФИЛЬТР ГРЯЗИ. `area ≥ 8` даёт precision 0.512, `area ≥ 32` — 0.509 и убивает три
 *     настоящих стежка. Коллинеарная поддержка — 0.976 при recall 1.000.
 *
 * ── ОДНА ЛОВУШКА, КОТОРАЯ СТОИЛА ОТЧЁТУ ОТЛАДКИ ──────────────────────────────────────────────
 *
 * Проекция соседа на ось стежка берётся ЗНАКОВОЙ (`d · v`), НЕ ПО МОДУЛЮ. С модулем соседи по обе
 * стороны дают дубли расстояний (19, 19, 38, 38), CV межстежковых промежутков уходит в 1.0, и
 * отбраковываются ВСЕ настоящие стежки: recall падает с 1.000 до 0.257. Сторож этого стоит в
 * пробе отдельной мутацией.
 */

// ─────────────────────────────────────────────────────────────────────────────────────────────
// ЧИСЛА
// ─────────────────────────────────────────────────────────────────────────────────────────────

/** Альфа ниже этой — бумага, чем бы ни были RGB. Та же половина, что у обводки границ. */
export const DEFAULT_ALPHA_FLOOR = 128;

/** Перцентиль толщины, по которому назначается σ размытия фона. */
export const WMAX_PERCENTILE = 99.5;

/** Во сколько раз σ гауссианы должна превышать самое толстое перо. Меньше — фон съест краску. */
export const SIGMA_OVER_WMAX = 4;

/**
 * Доля пикселей оси, на которой толщина обязана быть снята с полутонового профиля, чтобы молчать.
 * Ниже — человеку говорится вслух, что толщины по большей части решёточные: перекрёстки и мелочь
 * профиля не имеют, и там косая линия читается до трети тоньше, чем нарисована.
 */
export const CALIBRATED_AXIS_FLOOR = 2 / 3;

/** Границы σ: снизу — чтобы деление вообще что-то делало, сверху — чтобы оно оставалось дешёвым. */
export const MIN_SIGMA = 8;
export const MAX_SIGMA = 64;

/** Перцентиль белой точки. */
export const WHITE_POINT_PERCENTILE = 92;

/**
 * ШИРИНА ЯДРА KDE ПО ТОЛЩИНЕ, В ПИКСЕЛЯХ РАСТРА.
 *
 * ⚠ УЗКАЯ, И ЭТО ЗАМЕРЕНО, А НЕ ВЫБРАНО. Числа мод разделены на чертеже пикселями, но ЧИСЛА ЧЛЕНОВ
 * у них разнятся в сотню раз: стежков 235, швов 3, контур ОДИН. При ширине 0.5 хвост стежкового
 * ядра в точке 5 px даёт плотность 0.08 против 2.8 у самого шва — и подъём от шва не становится
 * локальным максимумом вовсе, потому что склон стежковой моды ещё круче: ПЯТИПИКСЕЛЬНОЕ ПЕРО
 * ИСЧЕЗАЕТ ИЗ СПИСКА. При 0.25 тот же хвост равен exp(−32), то есть нулю, и шов виден.
 *
 * Дрожание измерения внутри ОДНОГО пера при этом не разваливается на два, потому что близкие пики
 * сливает `MODE_MERGE` — отдельным правилом, у которого своя причина и свой размер.
 */
export const KDE_BANDWIDTH = 0.25;

/**
 * НАСКОЛЬКО БЛИЗКИЕ ПИКИ — ЭТО ОДНО ПЕРО.
 *
 * Измеренная толщина одного и того же пера гуляет: полоса 5 px, проведённая по горизонтали, даёт
 * ровно 5.00, а она же наискось — 4.66, потому что ближайший ФОНОВЫЙ ПИКСЕЛЬ у косой полосы стоит
 * по диагонали (2.83 вместо 3.00). Это свойство решётки, а не двух разных перьев. Перья же
 * отличаются не меньше чем на пиксель — нечётные толщины идут через две.
 */
export const MODE_MERGE = 0.75;

/** Шаг сетки, на которой ищутся пики KDE. Мельче — цифры, которых нет в данных. */
const KDE_STEP = 0.02;

/**
 * ВО СКОЛЬКО РАЗ ДЛИННЕЕ МЕДИАННОГО СТЕЖКА ДОЛЖЕН БЫТЬ СПЛОШНОЙ ШТРИХ.
 *
 * Это правило РАБОТАЕТ ТОЛЬКО ПОКА СТЕЖКИ В БОЛЬШИНСТВЕ, и на чертеже без единой строчки медиана
 * считается по самим штрихам — тогда ни один не пройдёт втрое. Поэтому рядом стоит ВТОРОЙ,
 * независимый достаточный признак — `STROKE_ASPECT`, — которому население вовсе не нужно.
 */
export const STROKE_CONTINUITY = 3;

/** Отношение длины к толщине, выше которого компонента — сплошной штрих без оглядки на соседей. */
export const STROKE_ASPECT = 20;

/** Длина скелета короче стольких толщин — пятно (у диска скелет короче, чем он сам шириной). */
export const BLOB_SKEL = 1.5;

/** Вытянутость, ниже которой компонента круглая. Пуговица ≈ 1.0, стежок ≈ 4–5. */
export const BLOB_ELONGATION = 2;

/** Похожая площадь соседа: отношение в этих границах. */
export const SUPPORT_AREA_LO = 0.4;
export const SUPPORT_AREA_HI = 2.5;

/** Похожая ориентация соседа, градусы (разница осей приводится к [0, 90]). */
export const SUPPORT_ANGLE = 30;

/** Конус коллинеарности: `perp > max(1.5·w, 2) + 0.12·|proj|` — отбраковка. */
export const SUPPORT_CONE_SLOPE = 0.12;

/** Сколько медианных длин стежка охватывает поиск соседей. */
export const SUPPORT_SPAN = 5;

/** Keep-правило: столько соседей при таком CV промежутков — либо аварийный выход по площади. */
export const SUPPORT_MIN = 2;
export const SUPPORT_CV = 0.9;

/**
 * АВАРИЙНЫЙ ВЫХОД ПО ПЛОЩАДИ — В СТЕЖКАХ, А НЕ В ПИКСЕЛЯХ.
 *
 * Отчёт называет 80 px², и это верное число ДЛЯ ЕГО МАСТЕРА: стежок 3×8 занимает там 24 px², то
 * есть выход открывается тому, кто втрое с лишним крупнее стежка. Записанное пикселями, оно
 * ЗАВИСИТ ОТ РАЗРЕШЕНИЯ — и замерено, чем это кончается: на том же чертеже, уменьшенном вдвое,
 * пуговица занимает 31 px², выход не открывается, соседей по оси у пуговицы нет по устройству, и
 * ВСЕ ВОСЕМЬ ПУГОВИЦ УХОДЯТ В ГРЯЗЬ. Записанное в стежках, оно даёт ровно 80 px² на мастере
 * (3.3 × 24) и продолжает работать на любом масштабе.
 */
export const SUPPORT_AREA_ESCAPE = 3.3;

/** На чертеже без единого стежка мерить не в чем — тогда берётся число отчёта как есть. */
export const SUPPORT_AREA_ESCAPE_PX = 80;

/** Мельче этого переоткрытый обломок не считается ничем — это уже не стежок, а щетина скелета. */
export const REOPEN_MIN_AREA = 4;

/** Во сколько раз компонента должна быть толще тонкой моды, чтобы её стоило переоткрывать. */
export const REOPEN_FACTOR = 1.5;

export type MeasureOptions = {
  /** Альфа ниже этой — бумага. */
  alphaFloor?: number;
  /** Выравнивать ли фон делением. Выключать — только чтобы показать, чего это стоит. */
  flatten?: boolean;
  /** Перцентиль белой точки, 0..100. */
  whitePoint?: number;
  /** Ширина ядра KDE по толщине. */
  bandwidth?: number;
  /** Переоткрывать ли толстые компоненты. */
  reopen?: boolean;
  /** Отсеивать ли грязь коллинеарной поддержкой. */
  support?: boolean;
};

// ─────────────────────────────────────────────────────────────────────────────────────────────
// ШАГ 1 — СЕРЫЙ
// ─────────────────────────────────────────────────────────────────────────────────────────────

/**
 * СЕРЫЙ ПО МИНИМУМУ КАНАЛОВ, поверх БЕЛОГО.
 *
 * Минимум, а не яркость: жёлтая или голубая линия по белому имеет высокую яркость и по ней
 * ИСЧЕЗЛА БЫ — а её минимальный канал низок, и она остаётся краской. Для серого рисунка минимум
 * тождественно равен яркости, то есть на чертеже это ничего не меняет.
 *
 * Композиция ПОВЕРХ БЕЛОГО, а не отдельная ступень по альфе: у сглаженного края чёрного штриха по
 * прозрачному RGB равен нулю, а альфа плывёт, и «прозрачное = бумага» обязано давать плавную
 * серую кайму, иначе край съезжает на полпикселя. Полностью прозрачный пиксель при этом
 * становится ровно белым — то есть законным фоном, а не чёрным.
 */
export function toGray(src: ImageData, alphaFloor = DEFAULT_ALPHA_FLOOR): Uint8ClampedArray {
  const n = src.width * src.height;
  const d = src.data;
  const out = new Uint8ClampedArray(n);
  for (let i = 0, p = 0; i < n; i++, p += 4) {
    const a = d[p + 3];
    if (a < alphaFloor && a < 255) {
      // Ниже пола непрозрачности пиксель — бумага целиком: иначе трассировка пустого слоя
      // вернула бы контур всей плиты, залитой краской.
      if (a === 0) {
        out[i] = 255;
        continue;
      }
    }
    const k = a / 255;
    const r = d[p] * k + 255 * (1 - k);
    const g = d[p + 1] * k + 255 * (1 - k);
    const b = d[p + 2] * k + 255 * (1 - k);
    out[i] = Math.round(Math.min(r, g, b));
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// ШАГ 2 — ПОРОГ ОЦУ
// ─────────────────────────────────────────────────────────────────────────────────────────────

/**
 * ГЛОБАЛЬНЫЙ ПОРОГ ОЦУ: максимум межклассовой дисперсии по 256-корзинной гистограмме.
 *
 * Возвращает уровень `t`, при котором краской считается `gray <= t`. У картинки без двух разных
 * уровней порога не существует, и возвращается −1: звать `otsu` и молча получать «всё краска» —
 * это ровно тот отказ, который обнаруживается неделями позже.
 */
export function otsu(gray: ArrayLike<number>, n: number): number {
  const hist = new Float64Array(256);
  for (let i = 0; i < n; i++) hist[gray[i] as number]++;
  let lo = 0;
  while (lo < 256 && hist[lo] === 0) lo++;
  let hi = 255;
  while (hi >= 0 && hist[hi] === 0) hi--;
  if (lo >= hi) return -1;

  let total = 0;
  let sum = 0;
  for (let v = 0; v < 256; v++) {
    total += hist[v];
    sum += v * hist[v];
  }
  let wB = 0;
  let sumB = 0;
  let best = -1;
  let at = lo;
  for (let v = lo; v <= hi; v++) {
    wB += hist[v];
    if (wB === 0) continue;
    const wF = total - wB;
    if (wF === 0) break;
    sumB += v * hist[v];
    const mB = sumB / wB;
    const mF = (sum - sumB) / wF;
    const between = wB * wF * (mB - mF) * (mB - mF);
    if (between > best) {
      best = between;
      at = v;
    }
  }
  return at;
}

/** Перцентиль по значениям массива. `q` в 0..100. Гистограммой, а не сортировкой: массив большой. */
export function percentile(values: ArrayLike<number>, n: number, q: number, bins = 4096): number {
  if (n <= 0) return 0;
  let max = 0;
  for (let i = 0; i < n; i++) {
    const v = values[i] as number;
    if (v > max) max = v;
  }
  if (max <= 0) return 0;
  const hist = new Int32Array(bins + 1);
  const scale = bins / max;
  for (let i = 0; i < n; i++) hist[Math.round((values[i] as number) * scale)]++;
  const want = (q / 100) * n;
  let seen = 0;
  for (let b = 0; b <= bins; b++) {
    seen += hist[b];
    if (seen >= want) return b / scale;
  }
  return max;
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// ШАГ 3 — DISTANCE TRANSFORM
// ─────────────────────────────────────────────────────────────────────────────────────────────

const DT_INF = 1e12;

/** Одномерная нижняя огибающая парабол — ядро алгоритма Фельценсвальба–Хуттенлохера. */
function edt1d(f: Float64Array, n: number, d: Float64Array, v: Int32Array, z: Float64Array): void {
  let k = 0;
  v[0] = 0;
  z[0] = -DT_INF;
  z[1] = DT_INF;
  for (let q = 1; q < n; q++) {
    let s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
    while (k > 0 && s <= z[k]) {
      k--;
      s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
    }
    k++;
    v[k] = q;
    z[k] = s;
    z[k + 1] = DT_INF;
  }
  k = 0;
  for (let q = 0; q < n; q++) {
    while (z[k + 1] < q) k++;
    const dx = q - v[k];
    d[q] = dx * dx + f[v[k]];
  }
}

/**
 * ТОЧНОЕ ЕВКЛИДОВО РАССТОЯНИЕ ОТ КАЖДОГО ПИКСЕЛЯ КРАСКИ ДО БЛИЖАЙШЕЙ БУМАГИ.
 *
 * Точное, а не чемферное приближение (3-4 или 5-7-11): толщина считается как `2·dt − 1`, то есть
 * ошибка расстояния входит в ответ ДВОЙНОЙ, и полпикселя чемфера превратились бы в целый пиксель
 * толщины — ровно ту величину, из-за которой в формуле стоит «−1».
 *
 * Край холста — БУМАГА. Иначе линия, упирающаяся в край кадра, мерилась бы вдвое толще: у неё
 * пропала бы одна из двух границ.
 */
export function distanceTransform(mask: Uint8Array, w: number, h: number): Float32Array {
  const n = w * h;
  const sq = new Float64Array(n);
  const maxDim = Math.max(w, h);
  const f = new Float64Array(maxDim);
  const d = new Float64Array(maxDim);
  const v = new Int32Array(maxDim);
  const z = new Float64Array(maxDim + 1);

  for (let y = 0; y < h; y++) {
    const row = y * w;
    for (let x = 0; x < w; x++) f[x] = mask[row + x] ? DT_INF : 0;
    edt1d(f, w, d, v, z);
    for (let x = 0; x < w; x++) sq[row + x] = d[x];
  }
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) f[y] = sq[y * w + x];
    edt1d(f, h, d, v, z);
    for (let y = 0; y < h; y++) sq[y * w + x] = d[y];
  }
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = mask[i] ? Math.sqrt(sq[i]) : 0;
  return out;
}

/** Расстояние от каждого пикселя до ближайшей единицы `seed`, без ограничения маской. */
function distanceToSeed(seed: Uint8Array, w: number, h: number): Float32Array {
  const n = w * h;
  const sq = new Float64Array(n);
  const maxDim = Math.max(w, h);
  const f = new Float64Array(maxDim);
  const d = new Float64Array(maxDim);
  const v = new Int32Array(maxDim);
  const z = new Float64Array(maxDim + 1);
  for (let y = 0; y < h; y++) {
    const row = y * w;
    for (let x = 0; x < w; x++) f[x] = seed[row + x] ? 0 : DT_INF;
    edt1d(f, w, d, v, z);
    for (let x = 0; x < w; x++) sq[row + x] = d[x];
  }
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) f[y] = sq[y * w + x];
    edt1d(f, h, d, v, z);
    for (let y = 0; y < h; y++) sq[y * w + x] = d[y];
  }
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = Math.sqrt(sq[i]);
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// ШАГ 4 — ВЫРАВНИВАНИЕ ФОНА
// ─────────────────────────────────────────────────────────────────────────────────────────────

/** Радиусы трёх коробчатых проходов, дающих в сумме гауссиану заданной σ (приближение Уэллса). */
function boxRadii(sigma: number, passes: number): number[] {
  const ideal = Math.sqrt((12 * sigma * sigma) / passes + 1);
  let wl = Math.floor(ideal);
  if (wl % 2 === 0) wl--;
  const wu = wl + 2;
  const mIdeal =
    (12 * sigma * sigma - passes * wl * wl - 4 * passes * wl - 3 * passes) / (-4 * wl - 4);
  const m = Math.round(mIdeal);
  const out: number[] = [];
  for (let i = 0; i < passes; i++) out.push(((i < m ? wl : wu) - 1) / 2);
  return out;
}

/** Один коробчатый проход по строкам, края — повтором крайнего пикселя. */
function boxH(src: Float32Array, dst: Float32Array, w: number, h: number, r: number): void {
  const span = 2 * r + 1;
  for (let y = 0; y < h; y++) {
    const row = y * w;
    let acc = src[row] * (r + 1);
    for (let x = 0; x < r; x++) acc += src[row + Math.min(x, w - 1)];
    for (let x = 0; x < w; x++) {
      acc += src[row + Math.min(x + r, w - 1)];
      acc -= src[row + Math.max(x - r - 1, 0)];
      dst[row + x] = acc / span;
    }
  }
}

/** Один коробчатый проход по столбцам. */
function boxV(src: Float32Array, dst: Float32Array, w: number, h: number, r: number): void {
  const span = 2 * r + 1;
  for (let x = 0; x < w; x++) {
    let acc = src[x] * (r + 1);
    for (let y = 0; y < r; y++) acc += src[Math.min(y, h - 1) * w + x];
    for (let y = 0; y < h; y++) {
      acc += src[Math.min(y + r, h - 1) * w + x];
      acc -= src[Math.max(y - r - 1, 0) * w + x];
      dst[y * w + x] = acc / span;
    }
  }
}

/** Гауссово размытие тремя коробчатыми проходами. Разделимое, O(n) на проход. */
export function gaussianBlur(src: Float32Array, w: number, h: number, sigma: number): Float32Array {
  const cur = Float32Array.from(src);
  const scratch = new Float32Array(src.length);
  for (const r of boxRadii(sigma, 3)) {
    if (r < 1) continue;
    boxH(cur, scratch, w, h, r);
    boxV(scratch, cur, w, h, r);
  }
  return cur;
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// ШАГ 5 — УТОНЬШЕНИЕ ЧЖАНА–СУЭНЯ
// ─────────────────────────────────────────────────────────────────────────────────────────────

/**
 * УТОНЬШЕНИЕ ЧЖАНА–СУЭНЯ: две подытерации, пока хоть один пиксель снимается.
 *
 * Обход идёт по СПИСКУ ЖИВЫХ пикселей, а не по всей плите: на 1600×2000 краска занимает проценты
 * площади, а итераций нужно столько, каков радиус самого толстого пера. Полный скан на каждой
 * итерации стоил бы десятков миллионов чтений ради тысяч решений.
 */
export function thinZhangSuen(maskIn: Uint8Array, w: number, h: number): Uint8Array {
  const s = Uint8Array.from(maskIn);
  const live = new Int32Array(s.length);
  let liveN = 0;
  for (let i = 0; i < s.length; i++) if (s[i]) live[liveN++] = i;

  const doomed = new Int32Array(liveN);
  const at = (x: number, y: number) => (x < 0 || y < 0 || x >= w || y >= h ? 0 : s[y * w + x]);

  for (let guard = 0; guard < 512; guard++) {
    let removed = 0;
    for (let sub = 0; sub < 2; sub++) {
      let dn = 0;
      for (let k = 0; k < liveN; k++) {
        const i = live[k];
        if (!s[i]) continue;
        const x = i % w;
        const y = (i - x) / w;
        const p2 = at(x, y - 1);
        const p3 = at(x + 1, y - 1);
        const p4 = at(x + 1, y);
        const p5 = at(x + 1, y + 1);
        const p6 = at(x, y + 1);
        const p7 = at(x - 1, y + 1);
        const p8 = at(x - 1, y);
        const p9 = at(x - 1, y - 1);
        const b = p2 + p3 + p4 + p5 + p6 + p7 + p8 + p9;
        if (b < 2 || b > 6) continue;
        let a = 0;
        if (p2 === 0 && p3 === 1) a++;
        if (p3 === 0 && p4 === 1) a++;
        if (p4 === 0 && p5 === 1) a++;
        if (p5 === 0 && p6 === 1) a++;
        if (p6 === 0 && p7 === 1) a++;
        if (p7 === 0 && p8 === 1) a++;
        if (p8 === 0 && p9 === 1) a++;
        if (p9 === 0 && p2 === 1) a++;
        if (a !== 1) continue;
        if (sub === 0) {
          if (p2 * p4 * p6 !== 0) continue;
          if (p4 * p6 * p8 !== 0) continue;
        } else {
          if (p2 * p4 * p8 !== 0) continue;
          if (p2 * p6 * p8 !== 0) continue;
        }
        doomed[dn++] = i;
      }
      for (let k = 0; k < dn; k++) s[doomed[k]] = 0;
      removed += dn;
    }
    if (!removed) break;
    // Список живых пересобирается каждую итерацию: он и есть то, что делает шаг дешёвым.
    let m = 0;
    for (let k = 0; k < liveN; k++) if (s[live[k]]) live[m++] = live[k];
    liveN = m;
  }
  return s;
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// СКЕЛЕТ КАК ГРАФ
// ─────────────────────────────────────────────────────────────────────────────────────────────

const NX = [1, 1, 0, -1, -1, -1, 0, 1];
const NY = [0, 1, 1, 1, 0, -1, -1, -1];
/** Диагональ — нечётный индекс: она весит √2 и снимается, если есть обход по прямой. */
const NLEN = [1, Math.SQRT2, 1, Math.SQRT2, 1, Math.SQRT2, 1, Math.SQRT2];

/**
 * СОСЕДИ ПИКСЕЛЯ СКЕЛЕТА, С УБРАННЫМИ ЛИШНИМИ ДИАГОНАЛЯМИ.
 *
 * Диагональ между `p` и `q` выбрасывается, если у них есть общий сосед по прямой, который тоже
 * скелет: без этого «уголок» из трёх пикселей имел бы три ребра вместо двух, каждая его точка —
 * степень 2 вместо 1 и 2, и КАЖДЫЙ ИЗГИБ ЛИНИИ читался бы как перекрёсток. Связность при этом не
 * теряется: путь `p → общий → q` остаётся.
 */
export function skelNeighbours(
  skel: Uint8Array,
  w: number,
  h: number,
  x: number,
  y: number,
  out: number[],
): number {
  let n = 0;
  for (let d = 0; d < 8; d++) {
    const nx = x + NX[d];
    const ny = y + NY[d];
    if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
    if (!skel[ny * w + nx]) continue;
    if (d & 1) {
      // Диагональ: общие соседи по прямой — (x+dx, y) и (x, y+dy).
      const ax = x + NX[d];
      const ay = y;
      const bx = x;
      const by = y + NY[d];
      const aOk = ax >= 0 && ax < w && skel[ay * w + ax];
      const bOk = by >= 0 && by < h && skel[by * w + bx];
      if (aOk || bOk) continue;
    }
    out[n++] = d;
  }
  return n;
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// СВЯЗНЫЕ ОБЛАСТИ
// ─────────────────────────────────────────────────────────────────────────────────────────────

export type Labelled = { lab: Int32Array; count: number };

/**
 * ВОСЬМИСВЯЗНАЯ РАЗМЕТКА КРАСКИ, ЯВНЫМ СТЕКОМ.
 *
 * Восьмисвязная, потому что штрих чертежа идёт по диагонали и четырёхсвязная разметка порвала бы
 * его на лесенку отдельных кусков. Рекурсия по соседям на плите 1600×2000 сняла бы поток, и
 * человек увидел бы не «измерение не смогло», а «редактор упал».
 *
 * ДВЕ РАЗНЫЕ КОМПОНЕНТЫ НЕ МОГУТ КАСАТЬСЯ — это следствие определения, и на нём стоит
 * «переоткрытие»: distance transform, посчитанный по всей плите, ВНУТРИ компоненты совпадает с
 * посчитанным по ней одной.
 */
export function labelComponents(mask: Uint8Array, w: number, h: number, limit = 0): Labelled {
  const lab = new Int32Array(w * h);
  const stack = new Int32Array(w * h);
  let count = 0;
  for (let seed = 0; seed < mask.length; seed++) {
    if (!mask[seed] || lab[seed]) continue;
    count++;
    if (limit && count > limit) break;
    let sp = 0;
    stack[sp++] = seed;
    lab[seed] = count;
    while (sp) {
      const i = stack[--sp];
      const x = i % w;
      const y = (i - x) / w;
      for (let d = 0; d < 8; d++) {
        const nx = x + NX[d];
        const ny = y + NY[d];
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const j = ny * w + nx;
        if (!mask[j] || lab[j]) continue;
        lab[j] = count;
        stack[sp++] = j;
      }
    }
  }
  return { lab, count };
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// KDE ПО ТОЛЩИНЕ
// ─────────────────────────────────────────────────────────────────────────────────────────────

/**
 * МОДЫ ТОЛЩИНЫ — ЛОКАЛЬНЫЕ МАКСИМУМЫ ЯДЕРНОЙ ОЦЕНКИ ПЛОТНОСТИ, а не фиксированные пороги.
 *
 * Фиксированные пороги («тонкое < 4, толстое > 8») пришлось бы подбирать под каждый чертёж; а
 * чертёж рисуется ДИСКРЕТНЫМ НАБОРОМ ПЕРЬЕВ, и моды в данных реально разделены — их надо просто
 * найти. Замер отчёта: 3 / 5 / 9 / 13 px на одном флэте.
 *
 * ПРОВЕРКИ ДОЛИНЫ ЗДЕСЬ НЕТ НАРОЧНО, И ЭТО НЕ НЕДОСМОТР. Стежков 234, а контур ОДИН: плотность в
 * долине между ними (≈12) ВЫШЕ, чем на пике самого контура (≈0.4), поэтому любой критерий вида
 * «долина ниже доли меньшего пика» ВЫБРОСИЛ БЫ КОНТУР — то есть единственную линию, ради которой
 * чертёж и рисовали. Разделяет здесь ширина ядра, и только она.
 */
export function widthModesOf(widths: number[], bandwidth = KDE_BANDWIDTH): number[] {
  if (!widths.length) return [];
  let max = 0;
  for (const v of widths) if (v > max) max = v;
  const hi = max + 3 * bandwidth;
  const steps = Math.max(4, Math.ceil(hi / KDE_STEP));
  const dens = new Float64Array(steps + 1);
  const inv = 1 / (2 * bandwidth * bandwidth);
  // ХВОСТ ЯДРА ОБРЕЗАЕТСЯ НА ПЯТИ σ, А ПОЛ ПЛОТНОСТИ СТОИТ ВЫШЕ ТОГО, ЧТО ЭТА ОБРЕЗКА СОЗДАЁТ.
  // Обрезка — это РАЗРЫВ: на её границе плотность прыгает, и прыжок читается как локальный
  // максимум. Замерено: при обрезке на 4σ и поле 1e-6 от пика между модами 5 и 9 рождался
  // призрачный пик «7 px» — перо, которым на чертеже не проведено ни одной линии, — и он тут же
  // ломал разрез по толщине на уровень ниже: щетина из стежков переставала отличаться от шва.
  const reach = 5 * bandwidth;
  for (const v of widths) {
    const from = Math.max(0, Math.floor((v - reach) / KDE_STEP));
    const to = Math.min(steps, Math.ceil((v + reach) / KDE_STEP));
    for (let k = from; k <= to; k++) {
      const dx = k * KDE_STEP - v;
      dens[k] += Math.exp(-dx * dx * inv);
    }
  }
  let peak = 0;
  for (let k = 0; k <= steps; k++) if (dens[k] > peak) peak = dens[k];
  // ПОЛ — ПОЛОВИНА ОДНОГО ЗАМЕРА. Ядро здесь ненормированное, поэтому одинокая компонента даёт в
  // своей точке ровно 1.0: контур изделия — ОДИН на весь чертёж, и всякий пол, заданный долей от
  // пика (а пик держат 235 стежков), выбросил бы именно его. А ниже половины замера нет ни одного
  // ЧЕСТНОГО пика — там живут только хвосты чужих ядер, обрезанные на 5σ (≤ 4e-6 на замер).
  const floor = Math.max(peak * 1e-5, 0.5);
  const found: { at: number; d: number }[] = [];
  for (let k = 1; k < steps; k++) {
    if (dens[k] < floor) continue;
    // Плато: строго больше слева, не меньше справа — иначе ровная вершина даёт два пика.
    if (dens[k] > dens[k - 1] && dens[k] >= dens[k + 1]) found.push({ at: k * KDE_STEP, d: dens[k] });
  }
  // СЛИЯНИЕ БЛИЗКИХ ИДЁТ ОТ САМОГО ВЫСОКОГО ПИКА, А НЕ СЛЕВА НАПРАВО. Слева направо выживал бы
  // ПЕРВЫЙ из пары, то есть дрожание края (2.41 px) вытесняло бы само перо (3.00 px) — и весь
  // разрез по толщине поехал бы на полпикселя вниз, молча.
  const taken: number[] = [];
  for (const f of found.slice().sort((a, b) => b.d - a.d)) {
    if (taken.some((t) => Math.abs(t - f.at) < MODE_MERGE)) continue;
    taken.push(f.at);
  }
  return taken.sort((a, b) => a - b);
}

/** Индекс ближайшей моды. */
function nearestMode(modes: number[], v: number): number {
  let best = 0;
  let bd = Infinity;
  for (let i = 0; i < modes.length; i++) {
    const d = Math.abs(modes[i] - v);
    if (d < bd) {
      bd = d;
      best = i;
    }
  }
  return best;
}

function median(sorted: number[]): number {
  const n = sorted.length;
  if (!n) return 0;
  const m = n >> 1;
  return n % 2 ? sorted[m] : (sorted[m - 1] + sorted[m]) / 2;
}

function medianOf(values: number[]): number {
  return median(values.slice().sort((a, b) => a - b));
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// ПРИЗНАКИ ОДНОЙ КОМПОНЕНТЫ
// ─────────────────────────────────────────────────────────────────────────────────────────────

type Raw = {
  pixels: Int32Array;
  skelPixels: Int32Array;
};

/**
 * Толщина компоненты ПО РЕШЁТКЕ — та, которой меряется радиус морфологического открытия.
 *
 * Это не `width`: `width` уходит человеку и в формат и снят с полутонового профиля, а это число
 * никуда не уходит и живёт ровно один шаг — назначить радиус эрозии плиты `lattice`. Обе линейки
 * называют одно и то же перо, но в разных единицах, и смешивать их нельзя (см. довод у вызова).
 */
function latticeWidthOf(raw: Raw, lattice: Float32Array): number {
  const sk = raw.skelPixels;
  if (sk.length) {
    const radii: number[] = [];
    for (let k = 0; k < sk.length; k++) radii.push(lattice[sk[k]]);
    return widthFromRadii(radii);
  }
  return thickestOf(raw, lattice);
}

/**
 * Самое толстое место компоненты. То же правило, что у `width`, но по максимуму, а не медиане.
 *
 * Читает РЕШЁТОЧНОЕ поле, а не калиброванное, и это то же решение, что у эрозии рядом: ворота
 * переоткрытия — вопрос морфологический («есть ли тут место толще тонкого пера»), и мерить его
 * надо той же линейкой, которой потом будет открываться область.
 */
function thickestOf(raw: Raw, lattice: Float32Array): number {
  let m = 0;
  for (let k = 0; k < raw.pixels.length; k++) {
    if (lattice[raw.pixels[k]] > m) m = lattice[raw.pixels[k]];
  }
  return widthFromRadii([m]);
}

/**
 * Признаки одной компоненты по её пикселям краски и её пикселям скелета.
 *
 * `elongation` — отношение длин ГЛАВНЫХ ОСЕЙ (корней из собственных чисел), а не самих собственных
 * чисел: именно оно даёт числа, названные в шве, — круглая пуговица ≈ 1.0, стежок 3×15 ≈ 4.7.
 * К обоим числам прибавлена 1/12 — дисперсия равномерного распределения внутри пикселя: без неё
 * линия толщиной в один пиксель имеет нулевую поперечную дисперсию и вытянутость обращается в
 * бесконечность.
 */
function featuresOf(
  raw: Raw,
  id: number,
  w: number,
  dt: Float32Array,
  skel: Uint8Array,
  h: number,
): Omit<TraceComponent, 'klass'> {
  const px = raw.pixels;
  const area = px.length;
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  let sx = 0;
  let sy = 0;
  for (let k = 0; k < area; k++) {
    const i = px[k];
    const x = i % w;
    const y = (i - x) / w;
    if (x < x0) x0 = x;
    if (y < y0) y0 = y;
    if (x > x1) x1 = x;
    if (y > y1) y1 = y;
    sx += x;
    sy += y;
  }
  const cx = sx / area;
  const cy = sy / area;
  let cxx = 0;
  let cxy = 0;
  let cyy = 0;
  for (let k = 0; k < area; k++) {
    const i = px[k];
    const x = i % w;
    const y = (i - x) / w;
    const dx = x - cx;
    const dy = y - cy;
    cxx += dx * dx;
    cxy += dx * dy;
    cyy += dy * dy;
  }
  cxx = cxx / area + 1 / 12;
  cyy = cyy / area + 1 / 12;
  cxy /= area;
  const tr = cxx + cyy;
  const det = cxx * cyy - cxy * cxy;
  const disc = Math.max(0, (tr * tr) / 4 - det);
  const l1 = tr / 2 + Math.sqrt(disc);
  const l2 = Math.max(1 / 12, tr / 2 - Math.sqrt(disc));
  const elongation = Math.sqrt(l1 / l2);
  let theta = 0.5 * Math.atan2(2 * cxy, cxx - cyy);
  if (theta < 0) theta += Math.PI;
  if (theta >= Math.PI) theta -= Math.PI;

  // Толщина и длина — по скелету. Компонента без скелета невозможна (утоньшение не стирает
  // область целиком), но если она пришла, толщина берётся по максимуму dt: это единственное
  // осмысленное число, и оно названо в `notes` вызывающим.
  const sk = raw.skelPixels;
  const dts: number[] = [];
  for (let k = 0; k < sk.length; k++) dts.push(dt[sk[k]]);
  let width: number;
  if (dts.length) {
    width = widthFromRadii(dts);
  } else {
    let m = 0;
    for (let k = 0; k < area; k++) if (dt[px[k]] > m) m = dt[px[k]];
    width = widthFromRadii([m]);
  }

  // Длина скелета — СУММА РЁБЕР ГРАФА, а не число пикселей: диагональная цепочка из N пикселей
  // длинна (N−1)·√2, и счётом пикселей она вышла бы короче на 41 %.
  const nbr: number[] = [0, 0, 0, 0, 0, 0, 0, 0];
  let skelLength = 0;
  const ends: [number, number][] = [];
  for (let k = 0; k < sk.length; k++) {
    const i = sk[k];
    const x = i % w;
    const y = (i - x) / w;
    const deg = skelNeighbours(skel, w, h, x, y, nbr);
    for (let d = 0; d < deg; d++) skelLength += NLEN[nbr[d]] / 2; // каждое ребро видно дважды
    if (deg <= 1) ends.push([x, y]);
  }

  return {
    id,
    area,
    bbox: [x0, y0, x1, y1],
    cx,
    cy,
    theta,
    elongation,
    width,
    skelLength,
    fillRatio: area / Math.max(1, (x1 - x0 + 1) * (y1 - y0 + 1)),
    ends,
  };
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// КОЛЛИНЕАРНАЯ ПОДДЕРЖКА
// ─────────────────────────────────────────────────────────────────────────────────────────────

/**
 * ОТСЕВ ГРЯЗИ ПО ПОДДЕРЖКЕ СОСЕДЕЙ, А НЕ ПО ПЛОЩАДИ.
 *
 * Грязь размером со стежок площадным фильтром не отличается никак: замер отчёта — `area ≥ 8` даёт
 * precision 0.512, `area ≥ 32` — 0.509 и вдобавок убивает три настоящих стежка. Настоящий стежок
 * отличается не размером, а тем, что У НЕГО ЕСТЬ РОВНЫЕ СОСЕДИ НА СВОЕЙ ОСИ: 0.976 при recall
 * 1.000.
 *
 * ⚠ ПРОЕКЦИЯ ЗНАКОВАЯ. `proj = d · v`, а НЕ `|d · v|`. По модулю соседи слева и справа дают
 * ОДИНАКОВЫЕ расстояния (19, 19, 38, 38), промежутки между отсортированными проекциями выходят
 * (0, 19, 0, 19), CV уходит в 1.0 — и отбраковывается КАЖДЫЙ настоящий стежок: recall 1.000 →
 * 0.257. Ошибка стоила отчёту отладки и стоит здесь отдельной мутации в пробе.
 *
 * КОЛЛИНЕАРНОСТЬ ПРОВЕРЯЕТСЯ В КОНУСЕ, А НЕ В ПОЛОСЕ: `perp > max(1.5·w, 2) + 0.12·|proj|`.
 * Полоса постоянной ширины работает на прямом участке и разваливается на дуге проймы, где соседи
 * законно уходят в сторону тем дальше, чем они дальше вдоль.
 */
function collinearSupport(
  list: Omit<TraceComponent, 'klass'>[],
  radius: number,
  escapeArea: number,
): { keep: boolean[]; support: number[] } {
  const n = list.length;
  const keep = new Array<boolean>(n).fill(false);
  const support = new Array<number>(n).fill(0);
  const r2 = radius * radius;
  // Ориентации сравниваются по КОСИНУСУ УДВОЕННОГО УГЛА: у линии нет направления, и разница 179°
  // это разница 1°. Через `cos(2Δ) ≥ cos(2·предел)` это одно сравнение без ветвлений.
  const cos2Limit = Math.cos((2 * SUPPORT_ANGLE * Math.PI) / 180);

  for (let i = 0; i < n; i++) {
    const a = list[i];
    if (a.area >= escapeArea) {
      // АВАРИЙНЫЙ ВЫХОД ПО ПЛОЩАДИ — для пуговиц и надсечек: у них соседей по оси нет по
      // устройству, и поддержкой они не спасаются ни при каком пороге.
      keep[i] = true;
    }
    const vx = Math.cos(a.theta);
    const vy = Math.sin(a.theta);
    const cone = Math.max(1.5 * a.width, 2);
    const projs: number[] = [0];
    for (let j = 0; j < n; j++) {
      if (j === i) continue;
      const b = list[j];
      const dx = b.cx - a.cx;
      const dy = b.cy - a.cy;
      const dist2 = dx * dx + dy * dy;
      if (dist2 > r2) continue;
      const ratio = b.area / a.area;
      if (ratio < SUPPORT_AREA_LO || ratio > SUPPORT_AREA_HI) continue;
      if (Math.cos(2 * (a.theta - b.theta)) < cos2Limit) continue;
      const proj = dx * vx + dy * vy; // ⚠ ЗНАКОВАЯ
      const perp = Math.abs(dx * vy - dy * vx);
      if (perp > cone + SUPPORT_CONE_SLOPE * Math.abs(proj)) continue;
      support[i]++;
      projs.push(proj);
    }
    if (support[i] < SUPPORT_MIN) continue;
    projs.sort((p, q) => p - q);
    const gaps: number[] = [];
    for (let k = 1; k < projs.length; k++) gaps.push(projs[k] - projs[k - 1]);
    const mean = gaps.reduce((s, g) => s + g, 0) / gaps.length;
    if (!(mean > 0)) continue;
    let varSum = 0;
    for (const g of gaps) varSum += (g - mean) * (g - mean);
    const cv = Math.sqrt(varSum / gaps.length) / mean;
    if (cv < SUPPORT_CV) keep[i] = true;
  }
  return { keep, support };
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// ДВЕРЬ
// ─────────────────────────────────────────────────────────────────────────────────────────────

/**
 * ИЗМЕРИТЬ РАСТР. Единственная дверь Ф1.
 *
 * Отказа словами здесь нет — в отличие от `traceRaster`: измерение либо нашло краску, либо не
 * нашло, и пустой список компонент с объясняющей запиской это ПОЛНЫЙ ответ, а не половина.
 */
export function measureRaster(src: ImageData, opts: MeasureOptions = {}): TraceMeasurement {
  const w = src.width;
  const h = src.height;
  const n = w * h;
  const notes: string[] = [];
  const empty = (): TraceMeasurement => ({
    w,
    h,
    mask: new Uint8Array(Math.max(0, n)),
    dt: new Float32Array(Math.max(0, n)),
    skel: new Uint8Array(Math.max(0, n)),
    components: [],
    widthModes: [],
    notes,
  });
  if (w < 1 || h < 1) {
    notes.push('there is nothing to measure: the picture has no pixels.');
    return empty();
  }

  const gray = toGray(src, opts.alphaFloor ?? DEFAULT_ALPHA_FLOOR);

  // ── ЧЕРНОВОЙ ПРОХОД: сколько толст самый толстый штрих ──────────────────────────────────────
  const t0 = otsu(gray, n);
  if (t0 < 0) {
    notes.push('there is nothing to measure: the picture holds a single tone.');
    return empty();
  }
  const rough = new Uint8Array(n);
  for (let i = 0; i < n; i++) rough[i] = gray[i] <= t0 ? 1 : 0;
  const roughDt = distanceTransform(rough, w, h);
  const inkDt: number[] = [];
  for (let i = 0; i < n; i++) if (roughDt[i] > 0) inkDt.push(roughDt[i]);
  const wMax = inkDt.length
    ? 2 * percentile(Float64Array.from(inkDt), inkDt.length, WMAX_PERCENTILE)
    : 0;

  // ── ВЫРАВНИВАНИЕ ФОНА И БЕЛАЯ ТОЧКА ─────────────────────────────────────────────────────────
  const flat = new Float32Array(n);
  for (let i = 0; i < n; i++) flat[i] = gray[i];
  if (opts.flatten !== false && wMax > 0) {
    const sigma = Math.min(MAX_SIGMA, Math.max(MIN_SIGMA, SIGMA_OVER_WMAX * wMax));
    const bg = gaussianBlur(flat, w, h, sigma);
    for (let i = 0; i < n; i++) {
      const b = bg[i];
      flat[i] = b > 1 ? Math.min(255, (255 * flat[i]) / b) : flat[i];
    }
    notes.push(
      `the paper was flattened by dividing by a σ=${sigma.toFixed(0)} px blur (four times the ${wMax.toFixed(1)} px thickest stroke found). Uneven light no longer decides what is ink.`,
    );
  }
  const wp = percentile(flat, n, opts.whitePoint ?? WHITE_POINT_PERCENTILE);
  if (wp > 1) {
    for (let i = 0; i < n; i++) flat[i] = Math.min(255, (255 * flat[i]) / wp);
  }

  const shaped = new Uint8ClampedArray(n);
  for (let i = 0; i < n; i++) shaped[i] = Math.round(flat[i]);

  // ── ГЛОБАЛЬНЫЙ OTSU ────────────────────────────────────────────────────────────────────────
  const t = otsu(shaped, n);
  const mask = new Uint8Array(n);
  let ink = 0;
  if (t >= 0) {
    for (let i = 0; i < n; i++) {
      if (shaped[i] <= t) {
        mask[i] = 1;
        ink++;
      }
    }
  }
  if (!ink) {
    notes.push('there is nothing to measure: at the global threshold the picture holds no ink.');
    return empty();
  }

  const lattice = distanceTransform(mask, w, h);
  const skel = thinZhangSuen(mask, w, h);

  // ── КАЛИБРОВКА ПОЛЯ РАССТОЯНИЙ НА ОСИ ──────────────────────────────────────────────────────
  //
  // Сырой EDT меряет до ЦЕНТРА ближайшего пикселя бумаги, и «−1» в правиле толщины снимает эти
  // полпикселя ТОЛЬКО у полосы, лежащей вдоль решётки. Под 30° полоса 3 px возвращалась как 1.83
  // (−39 %), под 45° — как 3.47 (+16 %). На флэте осевых линий единицы, поэтому «почти везде».
  //
  // Уточнение снимает профиль ПОЛУТОНА `shaped` поперёк локальной касательной и кладёт в поле
  // `полутолщина + 0.5` — то же число, что дал бы точный EDT осевой полосе. Поэтому и правило, и
  // его «−1», и калибровка отчёта (3 → 2, 5 → 3, 9 → 5) остаются на месте буквально. Довод,
  // отклонённые кандидаты и замеры — в `trace-width.ts`.
  //
  // ⚠ ПОЛУТОН БЕРЁТСЯ ДО ПОРОГА. Бинаризация и есть тот шаг, на котором ширина косой линии
  // теряется: под 45° порог возвращает полосу 3 px как 3.56 px краски на пиксель длины, и профиль
  // по маске честно читает 3.77. Восстановить ширину из маски нечем.
  //
  // ⚠ И ЭТО ДВА РАЗНЫХ ПОЛЯ, А НЕ ОДНО, И РАЗНИЦА ЗАМЕРЕНА. `lattice` — решётка, по ней идёт вся
  // МОРФОЛОГИЯ: ворота переоткрытия и эрозия ядром в полтонкого пера. Морфологии нужен именно
  // решёточный радиус, потому что она спрашивает «влезает ли диск в эти ПИКСЕЛИ». Пущенная по
  // калиброванному полю, та же эрозия съедала ось у косых линий и роняла возврат стежков с 247 до
  // 234 при 17 переоткрытиях вместо 13 — то есть чинила толщину и ломала состав.
  const dt = Float32Array.from(lattice);
  const refined = calibrateAxisRadii(dt, shaped, skel, w, h);
  let axisPixels = 0;
  for (let i = 0; i < n; i++) if (skel[i]) axisPixels++;
  if (axisPixels > 0 && refined < CALIBRATED_AXIS_FLOOR * axisPixels) {
    notes.push(
      `thickness was measured from the halftone profile on only ${Math.round((100 * refined) / axisPixels)}% of the drawing's centre lines; the rest are junctions and specks with no direction to measure across, and there thickness falls back to the pixel lattice — where an oblique line reads up to a third thin.`,
    );
  }

  // ── КОМПОНЕНТЫ ─────────────────────────────────────────────────────────────────────────────
  const { lab, count } = labelComponents(mask, w, h);
  const areaOf = new Int32Array(count + 1);
  const skelOf = new Int32Array(count + 1);
  for (let i = 0; i < n; i++) {
    const l = lab[i];
    if (!l) continue;
    areaOf[l]++;
    if (skel[i]) skelOf[l]++;
  }
  const bucket: Raw[] = [];
  const fillA = new Int32Array(count + 1);
  const fillS = new Int32Array(count + 1);
  for (let l = 1; l <= count; l++) {
    bucket.push({ pixels: new Int32Array(areaOf[l]), skelPixels: new Int32Array(skelOf[l]) });
  }
  for (let i = 0; i < n; i++) {
    const l = lab[i];
    if (!l) continue;
    bucket[l - 1].pixels[fillA[l]++] = i;
    if (skel[i]) bucket[l - 1].skelPixels[fillS[l]++] = i;
  }

  const feats = bucket.map((raw, k) => featuresOf(raw, k + 1, w, dt, skel, h));

  // ── ПЕРЕОТКРЫТИЕ ТОЛСТЫХ КОМПОНЕНТ ─────────────────────────────────────────────────────────
  //
  // Стежок, КАСАЮЩИЙСЯ сплошной линии, по определению связной области принадлежит ЕЙ, и никакой
  // порог его оттуда не достанет: он не отдельная компонента. Замер отчёта — 9 из 19 стежков
  // проймы. Лечится морфологическим ОТКРЫТИЕМ толстой компоненты радиусом в половину тонкого
  // пера: открытие оставляет линию и стирает всё, что тоньше, а разность возвращает стежки.
  //
  // Открытие, а не одна эрозия: вычесть ядро значило бы вернуть ОБОЛОЧКУ толстой линии, то есть
  // две ложные тонкие линии по её краям на каждую настоящую.
  //
  // ⚠ РАДИУС ОТКРЫТИЯ МЕРЯЕТСЯ РЕШЁТОЧНОЙ ЛИНЕЙКОЙ, А НЕ КАЛИБРОВАННОЙ, И ЭТО НЕ ПЕДАНТИЗМ.
  // Открывается плита `lattice`, сравнением `lattice[i] > r`. Радиус, снятый с калиброванных
  // толщин, попадает в ту же плиту с чужой шкалой: на JPEG-копии стенда тонкое перо съезжает с
  // ровных 3.00 на 2.98, `r` — с 2.000 на 1.990, и строгое неравенство переворачивается СРАЗУ У
  // ВСЕХ пикселей с решёточным dt = 2, то есть у середины каждого стежка. Замерено: 247
  // возвращённых стежков превращались в 238 при девяти паразитных обрывках площадью 4–18 px.
  // Толщина для ЧЕЛОВЕКА и радиус для ЭРОЗИИ — два разных числа, и линейка у каждого своя.
  const preWidths = bucket.map((raw) => latticeWidthOf(raw, lattice));
  const preModes = widthModesOf(preWidths, opts.bandwidth ?? KDE_BANDWIDTH);
  const thinMode = pickThinMode(preModes, preWidths);
  let reopened = 0;
  if (opts.reopen !== false && thinMode > 0 && preModes.length > 1) {
    const r = (thinMode + 1) / 2;
    const extra: Omit<TraceComponent, 'klass'>[] = [];
    for (let k = 0; k < bucket.length; k++) {
      const f = feats[k];
      // ⚠ ВОРОТА СТОЯТ НА САМОМ ТОЛСТОМ МЕСТЕ, А НЕ НА `width`, И ЭТО НЕ ПРИДИРКА.
      //
      // `width` — это МЕДИАНА по скелету, а скелет компоненты, к которой приклеены стежки, содержит
      // и их ветки. Замерено на стенде: у шва 5 px с девятью приклеенными стежками медиана съезжает
      // на 3.47 — то есть компонента объявляет себя ТОНКОЙ ровно из-за того тонкого материала,
      // ради возврата которого её и надо открыть, и переоткрытие не случается НИКОГДА. Вопрос,
      // который здесь задаётся, звучит «есть ли в этой области хоть что-то толще тонкого пера», и
      // отвечает на него максимум, который приклеенное тонкое сдвинуть не может.
      if (thickestOf(bucket[k], lattice) < REOPEN_FACTOR * thinMode) continue;
      const px = bucket[k].pixels;
      const [bx0, by0, bx1, by1] = f.bbox;
      const bw = bx1 - bx0 + 1;
      const bh = by1 - by0 + 1;
      const core = new Uint8Array(bw * bh);
      let coreN = 0;
      for (let q = 0; q < px.length; q++) {
        const i = px[q];
        const x = i % w;
        const y = (i - x) / w;
        if (lattice[i] > r) {
          core[(y - by0) * bw + (x - bx0)] = 1;
          coreN++;
        }
      }
      if (!coreN) continue;
      const back = distanceToSeed(core, bw, bh);
      const rest = new Uint8Array(bw * bh);
      let restN = 0;
      for (let q = 0; q < px.length; q++) {
        const i = px[q];
        const x = i % w;
        const y = (i - x) / w;
        const j = (y - by0) * bw + (x - bx0);
        if (back[j] > r) {
          rest[j] = 1;
          restN++;
        }
      }
      if (restN < REOPEN_MIN_AREA) continue;
      const sub = labelComponents(rest, bw, bh);
      const subArea = new Int32Array(sub.count + 1);
      const subSkel = new Int32Array(sub.count + 1);
      for (let j = 0; j < rest.length; j++) {
        const l = sub.lab[j];
        if (!l) continue;
        subArea[l]++;
        const x = (j % bw) + bx0;
        const y = ((j - (j % bw)) / bw) + by0;
        if (skel[y * w + x]) subSkel[l]++;
      }
      for (let l = 1; l <= sub.count; l++) {
        if (subArea[l] < REOPEN_MIN_AREA) continue;
        const raw: Raw = {
          pixels: new Int32Array(subArea[l]),
          skelPixels: new Int32Array(subSkel[l]),
        };
        let a = 0;
        let s = 0;
        for (let j = 0; j < rest.length; j++) {
          if (sub.lab[j] !== l) continue;
          const x = (j % bw) + bx0;
          const y = ((j - (j % bw)) / bw) + by0;
          const i = y * w + x;
          raw.pixels[a++] = i;
          if (skel[i]) raw.skelPixels[s++] = i;
        }
        extra.push(featuresOf(raw, feats.length + extra.length + 1, w, dt, skel, h));
        reopened++;
      }
    }
    feats.push(...extra);
  }

  // ── ТОЛЩИНА: МОДЫ ──────────────────────────────────────────────────────────────────────────
  const widths = feats.map((f) => f.width);
  const widthModes = widthModesOf(widths, opts.bandwidth ?? KDE_BANDWIDTH);
  const wThin = pickThinMode(widthModes, widths);

  // ── НЕПРЕРЫВНОСТЬ: ШТРИХ ИЛИ СТЕЖОК ────────────────────────────────────────────────────────
  const compact = feats.map((f) => f.skelLength < BLOB_SKEL * f.width && f.elongation < BLOB_ELONGATION);
  const openLens = feats.filter((_, i) => !compact[i]).map((f) => f.skelLength);
  const medDash = openLens.length ? medianOf(openLens) : 0;

  const klass: TraceClass[] = feats.map((f, i) => {
    if (compact[i]) return 'blob';
    const long =
      (medDash > 0 && f.skelLength > STROKE_CONTINUITY * medDash) ||
      f.skelLength > STROKE_ASPECT * f.width;
    return long ? 'stroke' : 'dash';
  });

  // ── ГРЯЗЬ ──────────────────────────────────────────────────────────────────────────────────
  let dropped = 0;
  if (opts.support !== false) {
    const radius = Math.max(SUPPORT_SPAN * Math.max(medDash, 1), 8 * Math.max(wThin, 1));
    const candidates: number[] = [];
    for (let i = 0; i < feats.length; i++) if (klass[i] !== 'stroke') candidates.push(i);
    const dashAreas = feats.filter((_, i) => klass[i] === 'dash').map((f) => f.area);
    const escapeArea = dashAreas.length
      ? SUPPORT_AREA_ESCAPE * medianOf(dashAreas)
      : SUPPORT_AREA_ESCAPE_PX;
    const { keep } = collinearSupport(
      candidates.map((i) => feats[i]),
      radius,
      escapeArea,
    );
    for (let k = 0; k < candidates.length; k++) {
      if (!keep[k]) {
        klass[candidates[k]] = 'speckle';
        dropped++;
      }
    }
  }

  const components: TraceComponent[] = feats.map((f, i) => ({ ...f, klass: klass[i] }));

  // ── ЗАПИСКИ ────────────────────────────────────────────────────────────────────────────────
  const tally = { dash: 0, stroke: 0, blob: 0, speckle: 0 };
  for (const c of components) tally[c.klass]++;
  notes.push(
    `${components.length} ink shapes: ${tally.dash} stitches, ${tally.stroke} solid strokes, ${tally.blob} filled spots, ${tally.speckle} dropped as dirt.`,
  );
  if (widthModes.length) {
    notes.push(
      `the drawing was made with ${widthModes.length} pen${widthModes.length === 1 ? '' : 's'}: ${widthModes.map((m) => `${m.toFixed(1)} px`).join(', ')}. Thickness was measured at native resolution — nothing here was resized.`,
    );
  }
  if (reopened > 0) {
    notes.push(
      `${reopened} thin fragment${reopened === 1 ? ' was' : 's were'} glued to thicker lines and ${reopened === 1 ? 'was' : 'were'} reopened by opening those lines. Their pixels are still counted in the area of the line they touch, and whether a reopened fragment belongs to the run beside it is for a human to confirm.`,
    );
  }
  if (dropped > 0) {
    notes.push(
      `${dropped} shape${dropped === 1 ? '' : 's'} had no collinear neighbours of ${dropped === 1 ? 'its' : 'their'} own size and ${dropped === 1 ? 'was' : 'were'} dropped as dirt. An area filter cannot do this: measured, it keeps barely half of what it keeps rightly.`,
    );
  }
  if (Math.max(w, h) < 1600) {
    notes.push(
      `this picture is ${w}×${h}. Below 1600 px on the long side a double topstitch at 14 px separation is at the edge of being physically separable, and below ~1200 px it is not: what is lost there is lost, and no upscale returns it.`,
    );
  }

  return { w, h, mask, dt, skel, components, widthModes, notes };
}

/**
 * ТОНКОЕ ПЕРО — МОДА С НАИБОЛЬШИМ ЧИСЛОМ ЧЛЕНОВ, а не самая левая.
 *
 * Самая левая мода — это грязь: пятнышко в два пикселя даёт толщину 1 и свой собственный пик. По
 * тонкому перу назначается радиус переоткрытия, и взять по нему грязь значило бы открывать линии
 * ядром в полпикселя, то есть не открывать их вовсе.
 */
function pickThinMode(modes: number[], widths: number[]): number {
  if (!modes.length) return 0;
  const votes = new Array<number>(modes.length).fill(0);
  for (const v of widths) votes[nearestMode(modes, v)]++;
  let best = 0;
  for (let i = 1; i < modes.length; i++) if (votes[i] > votes[best]) best = i;
  return modes[best];
}
