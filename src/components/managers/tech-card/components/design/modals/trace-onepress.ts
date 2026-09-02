import { centerlineRun } from './trace-centerline';
import { solveDashes } from './trace-dashes';
import { labelComponents, measureRaster, otsu, toGray } from './trace-measure';
import type { TraceMeasurement } from './trace-types';
import { MAX_STROKES_BYTES, writeLayer, type VectorStroke } from './vector-strokes';
import { DEFAULT_OPEN_TOLERANCE, traceRaster, traceSize } from './vector-trace';

/**
 * ═══ ОБВОДКА В ОДНО НАЖАТИЕ ═══════════════════════════════════════════════════════════════════
 *
 * G-7, дословная жалоба владельца: «я не понимаю как работает трейсинг работает в эдиторе я не
 * могу ничего все равно менять». Две половины, и вторая уже была неправдой: линии, которые
 * возвращает обводка, — НАСТОЯЩИЕ ШТРИХИ документа (`commitLines` → `select` двигает их узлы,
 * рейка правит толщину и вид шва, ⌫ удаляет). Непонятен был ВХОД: восемь ручек, из которых
 * человек обязан был выбрать режим, полярность, канал, порог, допуск и размер сора — то есть
 * ответить на шесть вопросов о движке, прежде чем увидеть хоть одну линию.
 *
 * Этот модуль отвечает на них ЗАМЕРОМ. Ни одна из ручек не переехала сюда «с умолчанием»: каждая
 * либо считается из самой плиты, либо больше не задаётся вовсе, потому что маршрут её не
 * спрашивает.
 *
 * ── ЧТО ЗДЕСЬ РЕШАЕТСЯ И ЧЕМ ──────────────────────────────────────────────────────────────────
 *
 * 1. КАНАЛ. Плита, у которой фон — настоящая дырка, а краска может быть и белой, судится по
 *    ПРОЗРАЧНОСТИ; всякая другая — по яркости. Признак — доля пикселей с неполной альфой: у
 *    сплющенного флэта она ноль, у слоя, из которого выгрызли ластиком, она заметна. Порог в 2%
 *    отделяет «фон дырявый» от «по краю рисунка есть сглаживание».
 *
 * 2. ПОЛЯРНОСТЬ. Otsu делит плиту на два класса; КРАСКА — ТОТ, КОТОРОГО МЕНЬШЕ. На техническом
 *    флэте чернил единицы процентов, на выворотке (белым по чёрному) — тоже единицы, просто с
 *    другой стороны порога. ⚠ Правило действует ТОЛЬКО при явном перевесе (65/35 и круче): у
 *    плиты, поделённой пополам, «меньший класс» — это подброшенная монета, и на ней правильный
 *    ответ — прежнее умолчание «краска тёмная». Так же поступает и человек, глядя на такую плиту.
 *
 * 3. ПОРОГ И РАЗМЕР СОРА не спрашиваются вовсе, и это не умолчание, а устройство маршрута:
 *    измеритель выравнивает свет делением на размытие, ставит белую точку по перцентилю и берёт
 *    ГЛОБАЛЬНЫЙ Otsu, а сор отсеивается коллинеарной поддержкой (замер отчёта: площадной фильтр
 *    даёт точность 0.51, поддержка — 0.976 при полном возврате).
 *
 * 4. ДОПУСК фиксирован на откалиброванных 0.4 px (отчёт владельца: 0.3–0.5 для флэтов). Он
 *    остаётся аргументом ровно для одного вызывающего — чипа «trace coarser», которым движок сам
 *    предлагает загрубить фит, когда результат не влез в потолок слоя.
 *
 * 5. МАРШРУТ ВЫБИРАЕТ ГЕОМЕТРИЯ, А НЕ ЧЕЛОВЕК. Это был самый дорогой из снятых вопросов: «перо
 *    или заливка» решает, вернётся ли линия ОДНОЙ кривой со своей толщиной или ЗАМКНУТОЙ ПЕТЛЁЙ
 *    вокруг себя, а обратной операции не существует. Теперь на него отвечает классификатор
 *    измерителя: `stroke` идёт в осевую, `dash` — в решатель строчки, `blob` (пуговицы, люверсы,
 *    лейблы) — в обвод границ. До этой правки блобы в осевом режиме ТЕРЯЛИСЬ МОЛЧА.
 *
 * ── ЧЕГО ЗДЕСЬ НЕТ ────────────────────────────────────────────────────────────────────────────
 *
 * Ни одного нового правила измерения. Модуль — ДИСПЕТЧЕР: он готовит один нормализованный растр,
 * зовёт готовые движки (`measureRaster` → `centerlineRun` + `solveDashes` + `traceRaster`) и
 * складывает их выход. Второй копии бинаризации, второго классификатора и второго фита здесь нет
 * и быть не должно — ровно поэтому и панель, и экспорт SVG ходят через один этот модуль.
 *
 * Прозы наружу он тоже не отдаёт: `notes` движков сюда не пробрасываются (G-9 — «этого текста
 * быть не должно»). Возвращаются структурные числа, по которым вызывающий пишет ОДНУ строку
 * снекбара.
 */

/** Ниже этой альфы пиксель считается дыркой, а не полупрозрачной каймой. */
const ALPHA_HOLE = 250;

/** Доля дырок, с которой прозрачность становится главным каналом. */
const HOLE_SHARE = 0.02;

/**
 * Насколько тёмный класс должен перевесить, чтобы его признали ФОНОМ. 0.65 — не круглое число из
 * воздуха: у флэта краски единицы процентов, у выворотки бумаги столько же, а всё, что между, —
 * плита, поделённая почти пополам, где меньший класс ничего не значит.
 */
const POLARITY_MARGIN = 0.65;

export type OnePressStage = 'measuring' | 'fitting' | 'assembling';

/** Что сказать человеку, пока идёт прогон. Английский — весь видимый текст редактора английский. */
export const STAGE_WORDS: Record<OnePressStage, string> = {
  measuring: 'measuring…',
  fitting: 'fitting curves…',
  assembling: 'assembling stitch rows…',
};

export type OnePressOptions = {
  /** Пропорция кадра — нужна движкам для честного замера байтов и для перевода в доли платы. */
  ratio: number;
  /** Активное лассо как покрытие 0..255 на пиксель, длиной ровно `w·h`, либо ничего. */
  selection?: Uint8Array | null;
  /** Что уже лежит в слое: потолок считается по СУММЕ, а не по одной обводке. */
  existing?: VectorStroke[];
  /** Допуск фита. Умолчание — откалиброванные 0.4 px; поднимает его только чип «trace coarser». */
  tolerance?: number;
  onStage?: (stage: OnePressStage) => void;
};

export type OnePressOk = {
  ok: true;
  strokes: VectorStroke[];
  /** Осевых линий, рядов строчки, найденных пар и обведённых пятен — числа, не проза. */
  lines: number;
  rows: number;
  pairs: number;
  spots: number;
  nodes: number;
  bytes: number;
};

export type OnePressRefusal = {
  ok: false;
  reason: string;
  suggestTolerance?: number;
};

export type OnePressResult = OnePressOk | OnePressRefusal;

/** Отдать кадр браузеру: без этого стадии кнопки нарисовались бы все разом, после прогона. */
const breathe = () => new Promise<void>((done) => setTimeout(done, 0));

/**
 * ОДНА НОРМАЛИЗОВАННАЯ ПЛИТА НА ВСЕ ТРИ ДВИЖКА.
 *
 * После неё краска ГАРАНТИРОВАННО тёмная на белом и непрозрачная — то есть все дальнейшие вопросы
 * о канале и полярности уже отвечены, и ни один движок ниже не спрашивает их заново. Именно это и
 * позволяет обводу границ работать с порогом 128 без второй копии правила бинаризации.
 */
function normalise(src: ImageData): { img: ImageData; byAlpha: boolean; inverted: boolean } {
  const n = src.width * src.height;
  const px = src.data;

  let holes = 0;
  for (let i = 0; i < n; i++) if (px[i * 4 + 3] < ALPHA_HOLE) holes++;
  const byAlpha = n > 0 && holes / n > HOLE_SHARE;

  const out = new ImageData(src.width, src.height);
  const dst = out.data;

  if (byAlpha) {
    // ПО ПРОЗРАЧНОСТИ: непрозрачное — краска, чем бы ни был его цвет, дырка — бумага.
    for (let i = 0; i < n; i++) {
      const v = px[i * 4 + 3] >= ALPHA_HOLE ? 0 : 255;
      dst[i * 4] = v;
      dst[i * 4 + 1] = v;
      dst[i * 4 + 2] = v;
      dst[i * 4 + 3] = 255;
    }
    return { img: out, byAlpha, inverted: false };
  }

  const gray = toGray(src);
  const t = otsu(gray, n);
  let dark = 0;
  if (t >= 0) for (let i = 0; i < n; i++) if (gray[i] <= t) dark++;
  const inverted = n > 0 && dark / n > POLARITY_MARGIN;
  for (let i = 0; i < n; i++) {
    const v = inverted ? 255 - gray[i] : gray[i];
    dst[i * 4] = v;
    dst[i * 4 + 1] = v;
    dst[i * 4 + 2] = v;
    dst[i * 4 + 3] = 255;
  }
  return { img: out, byAlpha, inverted };
}

/** Залить бумагой всё за пределами области: измеритель меряет ВСЮ картинку, обрезать её нельзя. */
function clipToSelection(img: ImageData, selection: Uint8Array): void {
  const n = img.width * img.height;
  const d = img.data;
  for (let i = 0; i < n; i++) {
    if (selection[i] !== 0) continue;
    d[i * 4] = 255;
    d[i * 4 + 1] = 255;
    d[i * 4 + 2] = 255;
    d[i * 4 + 3] = 255;
  }
}

/**
 * Плита ТОЛЬКО ИЗ ЗАЛИТЫХ ПЯТЕН — вход обвода границ.
 *
 * Строится из маски самого измерения, а не пересчётом порога: пятно, которое обвод нашёл бы
 * «по-своему», отличалось бы от того, которое измеритель назвал `blob`, и в файл уехали бы две
 * разные фигуры под одним именем. `labelComponents` по той же маске даёт то же разбиение — у
 * компонент первого прохода `id` и есть номер метки.
 */
function blobPlate(m: TraceMeasurement): { img: ImageData; mask: Uint8Array; count: number } | null {
  const ids = new Set<number>();
  for (const c of m.components) if (c.klass === 'blob') ids.add(c.id);
  if (!ids.size) return null;

  const { lab } = labelComponents(m.mask, m.w, m.h);
  const n = m.w * m.h;
  const img = new ImageData(m.w, m.h);
  const d = img.data;
  const mask = new Uint8Array(n);
  let painted = 0;
  for (let i = 0; i < n; i++) {
    const ink = lab[i] !== 0 && ids.has(lab[i]);
    const v = ink ? 0 : 255;
    d[i * 4] = v;
    d[i * 4 + 1] = v;
    d[i * 4 + 2] = v;
    d[i * 4 + 3] = 255;
    if (ink) {
      mask[i] = 255;
      painted++;
    }
  }
  return painted ? { img, mask, count: ids.size } : null;
}

/**
 * ОБВЕСТИ ПЛИТУ ОДНИМ НАЖАТИЕМ. Возвращает ГОТОВЫЕ ШТРИХИ, ничего не коммитит и ничего не рисует:
 * тем же вызовом пользуется и экспорт SVG, которому документ трогать нельзя вовсе.
 */
export async function traceOnePress(
  src: ImageData,
  opts: OnePressOptions,
): Promise<OnePressResult> {
  const tolerance = opts.tolerance ?? DEFAULT_OPEN_TOLERANCE;
  const existing = opts.existing ?? [];

  opts.onStage?.('measuring');
  await breathe();
  const { img } = normalise(src);
  if (opts.selection) clipToSelection(img, opts.selection);
  const m = measureRaster(img);

  opts.onStage?.('fitting');
  await breathe();
  const centre = centerlineRun(m, { ratio: opts.ratio, tolerance });

  opts.onStage?.('assembling');
  await breathe();
  const dash = solveDashes(m, { tolerance });

  /**
   * ЗАЛИТЫЕ ПЯТНА — ТРЕТЬИМ ПРОХОДОМ И ДРУГИМ ДВИЖКОМ. Пуговица, обведённая по оси, возвращается
   * точкой или крестиком: у круга медиальная ось вырождается. Ей нужен контур, и это ровно тот
   * случай, для которого обвод границ и правильный инструмент (отчёт владельца: «5% рисунка»).
   *
   * ⚠ БЮДЖЕТ ОТДАЁТСЯ ОСТАТОЧНЫЙ. Осевая и строчка уже посчитаны, и обвод, которому назвали весь
   * потолок, пообещал бы «влезу» там, где влезть уже нечему.
   */
  const spent = new TextEncoder().encode(
    writeLayer([...existing, ...centre.strokes, ...dash.strokes], opts.ratio),
  ).length;
  const blobs = blobPlate(m);
  let spotStrokes: VectorStroke[] = [];
  let spots = 0;
  if (blobs) {
    const res = traceRaster(blobs.img, {
      threshold: 128,
      polarity: 'dark',
      channel: 'luma',
      tolerance,
      minArea: 0,
      selection: blobs.mask,
      budgetBytes: Math.max(0, MAX_STROKES_BYTES - spent),
      ratio: opts.ratio,
    });
    if (!res.ok) return { ok: false, reason: res.reason, suggestTolerance: res.suggestTolerance };
    spotStrokes = res.strokes;
    spots = res.regions;
  }

  const strokes = [...centre.strokes, ...dash.strokes, ...spotStrokes];
  const bytes = new TextEncoder().encode(writeLayer([...existing, ...strokes], opts.ratio)).length;
  if (bytes > MAX_STROKES_BYTES) {
    /**
     * ПОТОЛОК ПРОВЕРЯЕТСЯ ЗДЕСЬ, ПОТОМУ ЧТО ДВИЖКОВ ТРИ. Каждый мерил СВОИ байты и про соседей не
     * знал: три «влезаю» подряд складываются в «не влезает», и узнал бы об этом человек от
     * сервера, отказавшего всему слою.
     */
    return {
      ok: false,
      reason:
        `the drawing traced into ${strokes.length} lines, and that is ${traceSize(bytes)} against a ceiling of ` +
        `${traceSize(MAX_STROKES_BYTES)} for one layer. Nothing was written. Trace one lasso area at a time, ` +
        `or trace it coarser — thinning it here would move lines that were measured on purpose.`,
      suggestTolerance: Math.round(Math.min(8, tolerance * 2.5) * 10) / 10,
    };
  }

  return {
    ok: true,
    strokes,
    lines: centre.strokes.length,
    rows: dash.chains.length,
    pairs: dash.pairs.length,
    spots,
    nodes: centre.nodes,
    bytes,
  };
}
