import { urlToDataUrl } from 'lib/features/getCropped';

import { RASTER_FALLBACK_W, RASTER_MAX_W } from './rasterise-layer';
import { DEFAULT_RATIO } from './vector-strokes';

/**
 * ПИКСЕЛЬНЫЙ КАНАЛ СЛОЯ ПРАВКИ — ОДНА КАРТИНКА RGBA, ПОЛНОЕ СОСТОЯНИЕ, НЕ ДЕЛЬТА.
 *
 * Требование круга 6 (X-2…X-7) звучало одним словом: РАСТРОВЫЙ. До него у документа слоя не было
 * пиксельного канала вовсе, и кисть, ластик и штамп работали по ШТРИХАМ — это честно решало «убрать
 * кусок линии», но не решало ничего из того, зачем берут ластик над фотографией.
 *
 * ── ПОЧЕМУ ОДНА КАРТИНКА, А НЕ «КРАСКА ПОВЕРХ ПОДЛОЖКИ» ─────────────────────────────────────
 *
 * Дословный ответ владельца на прямой вопрос «ластик — что стирает?»: «И САМУ ФОТОГРАФИЮ ТОЖЕ.
 * Прогрызает подложку насквозь, до прозрачности, как ластик по Background». Слой краски НАД
 * нетронутой подложкой этого выразить не может ни при каком устройстве: чтобы дырка была видна,
 * пришлось бы завести ВТОРУЮ сущность — маску базы, — и держать две картинки в согласии на каждом
 * мазке. Одна картинка, заведённая КОПИЕЙ ПОДЛОЖКИ, выражает дырку своей собственной альфой и не
 * имеет второй сущности, которая могла бы разъехаться.
 *
 * Подложка (`base_media_id`) при этом не портится и остаётся ПРОВЕНАНСОМ — «что именно обводили»:
 * дырки живут в другом медиа, байты базы те же, и подпись минта, пришпиленная к ним, цела.
 *
 * ── ГДЕ ЖИВУТ ПИКСЕЛИ И ПОЧЕМУ ХОЛСТОВ ТРИ ─────────────────────────────────────────────────
 *
 *   doc     — КОМИТ. Полное состояние пикселей слоя. Меняется ровно один раз на жест.
 *   scratch — ТЕКУЩИЙ ЖЕСТ. Мазок копится здесь при непрозрачности 1.
 *   stage   — scratch, ПРОСЕЯННЫЙ ЧЕРЕЗ ВЫДЕЛЕНИЕ. То, что реально ляжет (и то, что видно).
 *
 * Три, а не один, из-за НЕПРОЗРАЧНОСТИ. Полупрозрачные отпечатки, положенные прямо в doc, копят
 * альфу друг на друге: мазок, прошедший по своему следу дважды, темнеет вдвое, а рука, задержавшаяся
 * на месте, выжигает пятно. Фотошоп решает это ровно так же — мазок собирается в буфере при полной
 * непрозрачности и кладётся на документ ОДИН раз. Отсюда же берётся правильный ластик: «положить
 * буфер» для него это `destination-out`, и та же арифметика непрозрачности работает без единой
 * ветки в коде дабов.
 *
 * ── КАДР НЕ КВАДРАТНЫЙ, ПОЭТОМУ ВСЯ АРИФМЕТИКА — В ПИКСЕЛЯХ РАСТРА ──────────────────────────
 *
 * Мировые координаты хранятся долями 0..1, а плата выше своей ширины. Круглая кисть, построенная
 * прямо в долях, легла бы ЭЛЛИПСОМ, вытянутым ровно во столько раз, во сколько плата выше ширины —
 * ту же ловушку `vector-lasso.ts` уже ловил на капсулах ниба. Здесь она закрыта тем, что растр
 * заводится в ТЕХ ЖЕ пропорциях, что плата (`rasterBox` делит на тот же `ratio`), доли переводятся
 * в пиксели растра, а радиус — ОДНИМ множителем `w / PLATE_W`, который по построению равен
 * `h / plateH`. Круг остаётся кругом, и это проверяется пробой, меряющей габарит пятна.
 */

/**
 * Ширина мира платы — та же константа, что у редактора; радиусы приходят в её юнитах. Живёт здесь
 * потому, что здесь она РАБОТАЕТ (переводит юниты платы в пиксели растра), а редактор берёт её
 * отсюда: два числа «ширина мира» в двух файлах разошлись бы первой же правкой, и кисть стала бы
 * толще собственного превью.
 */
export const PLATE_W = 1000;

/** Потолок и запасная ширина растра — те же, что у флэттена, и взяты у него, а не повторены. */
export { RASTER_FALLBACK_W, RASTER_MAX_W };

/**
 * ПОТОЛОК ОТМЕНЫ ПО РАСТРУ, НАЗВАННЫЙ ВСЛУХ. Молчаливая потеря истории хуже честной границы:
 * человек, у которого ⌘Z перестал возвращать без предупреждения, считает это поломкой.
 *
 * Два потолка, а не один, потому что шаги растра стоят РАЗНО. Шаг — это прямоугольник, который
 * жест затронул, в двух копиях (до и после), и мазок в пол-платы весит в тысячу раз больше точки.
 * Ограничение только по числу шагов не защищает память вовсе; ограничение только по памяти даёт
 * непредсказуемую глубину. Держатся оба, и первый сработавший вытесняет самый старый шаг.
 */
export const RASTER_UNDO_DEPTH = 24;
export const RASTER_UNDO_BYTES = 64 * 1024 * 1024;

export type RasterBox = { w: number; h: number };

/**
 * Коробка растра. Высота считается ОТ ТОГО ЖЕ `ratio`, которым живёт плата, а не от натуральных
 * размеров картинки: только так множитель `w / PLATE_W` равен `h / plateH`, и только тогда круглая
 * кисть остаётся круглой. Натуральная ширина участвует лишь как потолок разрешения.
 */
export function rasterBox(naturalW: number, ratio: number): RasterBox {
  const w = Math.round(
    Math.min(RASTER_MAX_W, naturalW > 0 ? naturalW : RASTER_FALLBACK_W),
  );
  const h = Math.max(1, Math.round(w / (ratio || DEFAULT_RATIO)));
  return { w: Math.max(1, w), h };
}

/** Прямоугольник в пикселях растра, включая границы: `[x0, y0, x1, y1]`. */
export type Bounds = [number, number, number, number];

export type RasterLayer = {
  /** Полное состояние пикселей. Это и есть «слой краски». */
  doc: HTMLCanvasElement;
  /** Буфер текущего жеста при непрозрачности 1. */
  scratch: HTMLCanvasElement;
  /** Буфер жеста, просеянный через активное выделение, — то, что ляжет и что видно. */
  stage: HTMLCanvasElement;
  w: number;
  h: number;
  /**
   * КОРОБКА, КОТОРУЮ ТЕКУЩИЙ ЖЕСТ МОЖЕТ ЗАТРОНУТЬ, — копится ОТПЕЧАТКАМИ, по ходу дела.
   *
   * Дешёвая альтернатива честному ответу «а что на самом деле изменилось», и разница в цене
   * измеримая: честный ответ — это проход по всем пикселям холста (1600×2000 = 3.2 млн итераций
   * JS на КАЖДОЕ отпускание кнопки) плюс полный снимок в 12.8 МБ, снятый заранее «на всякий
   * случай». Оба висели бы на конце каждого мазка — то есть ровно там, где рука ждёт продолжения.
   *
   * НАДМНОЖЕСТВО, И ЭТО БЕЗОПАСНО: выделение может изменение только СУЗИТЬ, а отмена, вернувшая
   * чуть больше пикселей, чем изменилось, возвращает те же самые байты. Ошибка в другую сторону
   * (коробка меньше изменения) оставила бы после ⌘Z ободок — её здесь нет по построению.
   */
  bounds: Bounds | null;
};

/** Расширить коробку жеста отпечатком радиуса `r` в точке. */
function markDab(layer: RasterLayer, x: number, y: number, r: number): void {
  const pad = r + 2;
  const b = layer.bounds;
  if (!b) {
    layer.bounds = [x - pad, y - pad, x + pad, y + pad];
    return;
  }
  if (x - pad < b[0]) b[0] = x - pad;
  if (y - pad < b[1]) b[1] = y - pad;
  if (x + pad > b[2]) b[2] = x + pad;
  if (y + pad > b[3]) b[3] = y + pad;
}

/** Объявить коробку жеста прямоугольником — для операций, идущих не отпечатками (растушёвка). */
export function markRect(layer: RasterLayer, rect: Bounds): void {
  layer.bounds = layer.bounds
    ? [
        Math.min(layer.bounds[0], rect[0]),
        Math.min(layer.bounds[1], rect[1]),
        Math.max(layer.bounds[2], rect[2]),
        Math.max(layer.bounds[3], rect[3]),
      ]
    : [...rect];
}

/** Коробка жеста, обрезанная холстом и округлённая до целых, или `null` — жест ничего не тронул. */
export function gestureBox(
  layer: RasterLayer,
): { x: number; y: number; w: number; h: number } | null {
  const b = layer.bounds;
  if (!b) return null;
  const x0 = Math.max(0, Math.floor(b[0]));
  const y0 = Math.max(0, Math.floor(b[1]));
  const x1 = Math.min(layer.w - 1, Math.ceil(b[2]));
  const y1 = Math.min(layer.h - 1, Math.ceil(b[3]));
  if (x1 < x0 || y1 < y0) return null;
  return { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

function make(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

function ctxOf(c: HTMLCanvasElement): CanvasRenderingContext2D {
  const ctx = c.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('this browser refused a drawing canvas');
  return ctx;
}

export const rasterCtx = ctxOf;

/** Пустой слой в заданной коробке — прозрачный целиком. Рисование с нуля начинается отсюда. */
function blankRaster(box: RasterBox): RasterLayer {
  return {
    doc: make(box.w, box.h),
    scratch: make(box.w, box.h),
    stage: make(box.w, box.h),
    w: box.w,
    h: box.h,
    bounds: null,
  };
}

/**
 * Слой, ЗАВЕДЁННЫЙ КОПИЕЙ ПОДЛОЖКИ. Белая земля НЕ кладётся: она сделала бы дырку от ластика белой,
 * то есть невыразимой, — а весь смысл ответа владельца в том, что дырка прозрачная.
 *
 * Картинка приезжает через тот же прокси, что у флэттена и пипетки (`urlToDataUrl`): холст,
 * испачканный чужим origin, не отдаёт ни `getImageData`, ни `toDataURL`, и растровый редактор без
 * чтения пикселей — не редактор.
 */
export async function seedRaster(baseSrc: string, box: RasterBox): Promise<RasterLayer> {
  const layer = blankRaster(box);
  if (!baseSrc) return layer;
  const dataUrl = await urlToDataUrl(baseSrc);
  const img = new Image();
  img.src = dataUrl;
  await img.decode();
  ctxOf(layer.doc).drawImage(img, 0, 0, box.w, box.h);
  return layer;
}

// ── кисть ────────────────────────────────────────────────────────────────────────────────────

export type Nib = {
  /** Радиус в пикселях растра. */
  r: number;
  /** Жёсткость края, 0..1. 1 — рез по кругу, 0 — пятно, гаснущее от центра. */
  hardness: number;
  /** Цвет отпечатка. Для ластика безразличен — считается только альфа. */
  ink: string;
};

/**
 * ОТПЕЧАТОК — маленький холст 2r×2r, который потом штампуется вдоль следа. Строится один раз на
 * жест, а не на каждый даб: радиальный градиент на каждом из тысячи отпечатков — это тысяча
 * аллокаций в секунду на руке, которая просто ведёт линию.
 *
 * ЖЁСТКОСТЬ 1 РИСУЕТСЯ ЗАЛИВКОЙ, А НЕ ГРАДИЕНТОМ С СОВПАВШИМИ СТОПАМИ: градиент, чьи стопы стоят
 * в одной точке, всё равно даёт браузеру право размазать переход на пиксель, и «жёсткий» край
 * приходил бы мягким ровно там, где его просили жёстким.
 */
export function nibStamp({ r, hardness, ink }: Nib): HTMLCanvasElement {
  const size = Math.max(1, Math.ceil(r * 2));
  const c = make(size, size);
  const ctx = ctxOf(c);
  const cx = size / 2;
  const rr = Math.max(0.5, r);
  ctx.fillStyle = ink;
  if (hardness >= 0.99) {
    ctx.beginPath();
    ctx.arc(cx, cx, rr, 0, Math.PI * 2);
    ctx.fill();
    return c;
  }
  const inner = Math.max(0, Math.min(0.98, hardness)) * rr;
  const g = ctx.createRadialGradient(cx, cx, inner, cx, cx, rr);
  g.addColorStop(0, ink);
  g.addColorStop(1, 'rgba(0,0,0,0)');
  // Цвет стопы «нуль» обязан быть ТЕМ ЖЕ цветом с нулевой альфой, иначе край мягкой кисти уезжает
  // в серый: браузер интерполирует к прозрачному ЧЁРНОМУ, и белая кисть гасла бы через серость.
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  // Перекраска через `source-in` даёт правильный градиент альфы у любого цвета: форма взята у
  // градиента, цвет — сплошной.
  ctx.globalCompositeOperation = 'source-in';
  ctx.fillStyle = ink;
  ctx.fillRect(0, 0, size, size);
  ctx.globalCompositeOperation = 'source-over';
  return c;
}

/**
 * Шаг между отпечатками. Пятая часть радиуса — плотнее, чем видно глазу, и вдвое реже, чем
 * фотошопное умолчание в 25%: след обязан быть сплошным даже на резком повороте руки.
 */
const spacing = (r: number) => Math.max(0.6, r * 0.2);

/** Точки следа в пикселях растра, с шагом не крупнее `spacing`. Вход — доли кадра. */
export function dabPoints(
  path: readonly [number, number][],
  r: number,
  box: RasterBox,
): [number, number][] {
  const pts = path.map(([x, y]) => [x * box.w, y * box.h] as [number, number]);
  if (!pts.length) return [];
  if (pts.length === 1) return [pts[0]];
  const step = spacing(r);
  const out: [number, number][] = [pts[0]];
  let carry = 0;
  for (let i = 1; i < pts.length; i++) {
    const [ax, ay] = pts[i - 1];
    const [bx, by] = pts[i];
    const len = Math.hypot(bx - ax, by - ay);
    if (len < 1e-6) continue;
    let t = step - carry;
    while (t <= len) {
      out.push([ax + ((bx - ax) * t) / len, ay + ((by - ay) * t) / len]);
      t += step;
    }
    carry = (carry + len) % step;
  }
  const last = pts[pts.length - 1];
  const tail = out[out.length - 1];
  if (Math.hypot(tail[0] - last[0], tail[1] - last[1]) > 0.01) out.push(last);
  return out;
}

/** Радиус в пикселях растра из размера, названного в юнитах платы (это ДИАМЕТР, как у ниба). */
export const nibRadius = (plateUnits: number, box: RasterBox) =>
  Math.max(0.5, (plateUnits / 2) * (box.w / PLATE_W));

/** Положить след кисти в буфер жеста. Непрозрачность здесь НЕ участвует — см. шапку файла. */
export function paintAlong(
  layer: RasterLayer,
  path: readonly [number, number][],
  nib: Nib,
): void {
  const ctx = ctxOf(layer.scratch);
  const tip = nibStamp(nib);
  const half = tip.width / 2;
  for (const [x, y] of dabPoints(path, nib.r, layer)) {
    ctx.drawImage(tip, x - half, y - half);
    markDab(layer, x, y, half);
  }
}

/**
 * ШТАМП: пиксели со СМЕЩЕНИЕМ «источник → курсор», как в фотошопе.
 *
 * Источник читается из `doc`, который в течение жеста НЕ МЕНЯЕТСЯ, — отсюда невозможность петли
 * «клон клонирует свой же клон», из-за которой в фотошопе штамп размазывает при неудачном
 * источнике. Здесь она закрыта устройством, а не аккуратностью руки.
 *
 * Каждый отпечаток режется маской ниба через `destination-in` на маленьком холсте: мягкий край у
 * клона обязан быть тем же мягким краем, что у кисти, иначе жёсткость перестаёт быть свойством
 * руки и становится свойством инструмента.
 */
export function cloneAlong(
  layer: RasterLayer,
  path: readonly [number, number][],
  offset: [number, number],
  nib: Nib,
): void {
  const ctx = ctxOf(layer.scratch);
  const tip = nibStamp({ ...nib, ink: '#000000' });
  const size = tip.width;
  const half = size / 2;
  const cell = make(size, size);
  const cctx = ctxOf(cell);
  const dx = offset[0] * layer.w;
  const dy = offset[1] * layer.h;
  for (const [x, y] of dabPoints(path, nib.r, layer)) {
    cctx.clearRect(0, 0, size, size);
    cctx.globalCompositeOperation = 'source-over';
    cctx.drawImage(layer.doc, -(x - dx - half), -(y - dy - half));
    cctx.globalCompositeOperation = 'destination-in';
    cctx.drawImage(tip, 0, 0);
    ctx.drawImage(cell, x - half, y - half);
    markDab(layer, x, y, half);
  }
}

// ── выделение как маска ──────────────────────────────────────────────────────────────────────

/**
 * Коробка маски, посчитанная при её постройке. Слабая карта: маска — временный холст, и держать
 * его живым ради четырёх чисел было бы утечкой на каждое движение ручки растушёвки.
 */
const maskBounds = new WeakMap<HTMLCanvasElement, Bounds>();

/** Что эта маска может дать тронуть, в пикселях растра. */
export const maskBox = (mask: HTMLCanvasElement): Bounds | null => maskBounds.get(mask) ?? null;

/**
 * ВЫДЕЛЕНИЕ ОГРАНИЧИВАЕТ РАСТРОВЫЕ ОПЕРАЦИИ СВОЕЙ ОБЛАСТЬЮ (X-6), а растушёвка области — это
 * МЯГКОСТЬ ЕЁ КРАЯ, а не ореол, нарисованный поверх (X-5). Обе величины выражены одним объектом:
 * маской, чей край размыт на `feather` юнитов платы.
 *
 * Размытие берётся вдвое меньше числа, тем же коэффициентом, каким его показывает ореол на сцене:
 * человек, поставивший 24, видит на плате мягкость, которую и получит на пикселях, — иначе число
 * значило бы на экране одно, а под кистью другое.
 */
export function selectionMask(
  box: RasterBox,
  poly: readonly [number, number][],
  featherPlateUnits: number,
): HTMLCanvasElement | null {
  if (poly.length < 3) return null;
  const c = make(box.w, box.h);
  const ctx = ctxOf(c);
  const blur = Math.max(0, (featherPlateUnits / 2) * (box.w / PLATE_W));
  // Коробка контура + запас на размытие — на ней меряется, что могла тронуть растушёвка.
  const xs = poly.map(([x]) => x * box.w);
  const ys = poly.map(([, y]) => y * box.h);
  maskBounds.set(c, [
    Math.min(...xs) - blur * 3,
    Math.min(...ys) - blur * 3,
    Math.max(...xs) + blur * 3,
    Math.max(...ys) + blur * 3,
  ]);
  if (blur > 0.05) ctx.filter = `blur(${blur}px)`;
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  poly.forEach(([x, y], i) => {
    const px = x * box.w;
    const py = y * box.h;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  });
  ctx.closePath();
  ctx.fill();
  ctx.filter = 'none';
  return c;
}

/**
 * Буфер жеста, просеянный маской, — ОДНО место, где выделение вступает в силу. Живое превью и
 * коммит читают ОДИН и тот же `stage`: иначе «что видно» и «что легло» разошлись бы ровно на
 * растушёвке, то есть ровно там, где человек и смотрит.
 */
export function stageScratch(layer: RasterLayer, mask: HTMLCanvasElement | null): void {
  const ctx = ctxOf(layer.stage);
  ctx.globalCompositeOperation = 'source-over';
  ctx.clearRect(0, 0, layer.w, layer.h);
  ctx.drawImage(layer.scratch, 0, 0);
  if (mask) {
    ctx.globalCompositeOperation = 'destination-in';
    ctx.drawImage(mask, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
  }
}

export type PaintMode = 'paint' | 'erase';

/** Положить просеянный буфер на документ. Ластик — тот же вызов с `destination-out`. */
export function commitStage(layer: RasterLayer, mode: PaintMode, opacity: number): void {
  const ctx = ctxOf(layer.doc);
  ctx.save();
  ctx.globalAlpha = Math.min(1, Math.max(0, opacity));
  ctx.globalCompositeOperation = mode === 'erase' ? 'destination-out' : 'source-over';
  ctx.drawImage(layer.stage, 0, 0);
  ctx.restore();
}

/** Забыть текущий жест — и буфер, и его просеянную копию. */
export function clearGesture(layer: RasterLayer): void {
  ctxOf(layer.scratch).clearRect(0, 0, layer.w, layer.h);
  ctxOf(layer.stage).clearRect(0, 0, layer.w, layer.h);
  layer.bounds = null;
}

/** Бумага, которой «delete inside» застилает область. Белая — это и есть флэт. */
export const PAPER_INK = '#ffffff';

/**
 * ЗАЛИТЬ ПИКСЕЛИ ВНУТРИ ОБЛАСТИ БУМАГОЙ (G-14: «при удалении выделения оно по дефолту должно
 * заливать белым»).
 *
 * ⚠ ЭТО НЕ ТО ЖЕ, ЧТО ЛАСТИК, И РАЗДЕЛЕНИЕ РОЛЕЙ ЗДЕСЬ НЕСУЩЕЕ. Ластик по-прежнему честно
 * прогрызает документ до ПРОЗРАЧНОСТИ (`commitStage(…, 'erase')`), потому что его работа —
 * «сними этот материал»; под ним для того и стоит шахматка `data-raster-checker`, чтобы дырку
 * было видно. «Delete inside» — другой глагол: он убирает МУСОР С ФЛЭТА, и результат обязан быть
 * бумагой, а не дыркой, иначе всякий выброшенный логотип оставлял бы за собой прозрачное окно,
 * сквозь которое в сохранённой картинке проступит что угодно.
 *
 * ⚠ ПРЕЖНИЙ `clearInside` (то же самое через `destination-out`) СНЯТ, А НЕ ОСТАВЛЕН РЯДОМ.
 * После этой правки у него не осталось ни одного вызывающего, а мутационная игла, наведённая на
 * НЕИСПОЛНЯЕМЫЙ код, зеленеет всегда — то есть читалась бы как «сторож есть». Оба его довода
 * живут здесь: маска приходит готовой и растушёванной (второй арифметики края в редакторе нет),
 * и работа идёт по ВСЕМУ документу, а не по слою поверх подложки, — документ и есть полное
 * состояние пикселей, заведённое её копией.
 *
 * `source-over` ТИНТОВАННОЙ МАСКОЙ, А НЕ «ДЫРКА, ПОТОМ БЕЛОЕ». Разница видна ровно на растушёвке:
 * прорезать и подкрасить значило бы оставить по краю ПОЛУПРОЗРАЧНУЮ белую кайму — то есть ту же
 * дырку, только бледнее, ровно там, где просили бумагу. Наложение поверх даёт по краю честный
 * переход от бумаги к нетронутой картинке, а в ядре области — плотный непрозрачный белый.
 */
export function fillInside(
  layer: RasterLayer,
  mask: HTMLCanvasElement,
  colour = PAPER_INK,
): void {
  // Маска — это форма, а не цвет: красится она у себя, отдельным холстом, потому что
  // `source-in` по документу выбросил бы всё, что лежит снаружи области.
  const tint = document.createElement('canvas');
  tint.width = layer.w;
  tint.height = layer.h;
  const tctx = ctxOf(tint);
  tctx.drawImage(mask, 0, 0);
  tctx.globalCompositeOperation = 'source-in';
  tctx.fillStyle = colour;
  tctx.fillRect(0, 0, layer.w, layer.h);

  const ctx = ctxOf(layer.doc);
  ctx.save();
  ctx.globalCompositeOperation = 'source-over';
  ctx.drawImage(tint, 0, 0);
  ctx.restore();
}

/**
 * ВЫРЕЗКА ИЗ ОБЛАСТИ — то, что кладётся в буфер обмена (Q-6).
 *
 * Возвращается холст РАЗМЕРОМ С КОРОБКУ маски, а не с весь документ: копия целой плиты на каждое
 * ⌘C стоила бы двадцати мегабайт на жест, а буфер живёт до закрытия редактора.
 *
 * Пиксели гасятся той же маской, что у стирания и смягчения, — значит мягкий край области
 * вырезается ЧАСТИЧНО, ровно как он выглядит. Своей арифметики края здесь нет: одно число
 * растушёвки обязано значить у соседних глаголов одно и то же.
 */
export function cutoutInside(
  layer: RasterLayer,
  mask: HTMLCanvasElement,
): { canvas: HTMLCanvasElement; box: Bounds } | null {
  const box = maskBox(mask);
  if (!box) return null;
  const [x0, y0, x1, y1] = box;
  const w = x1 - x0 + 1;
  const h = y1 - y0 + 1;
  if (w <= 0 || h <= 0) return null;
  const out = make(w, h);
  const octx = ctxOf(out);
  octx.drawImage(layer.doc, x0, y0, w, h, 0, 0, w, h);
  octx.save();
  octx.globalCompositeOperation = 'destination-in';
  octx.drawImage(mask, -x0, -y0);
  octx.restore();
  return { canvas: out, box };
}

/**
 * ПОЛОЖИТЬ ВЫРЕЗКУ обратно, со сдвигом. Обычное `source-over`: вставка кладётся ПОВЕРХ, она не
 * прогрызает и не заменяет — вставка это добавление, а не стирание.
 *
 * Возвращает занятый прямоугольник, обрезанный по холсту: он нужен ленте отмены, и без обрезки шаг
 * унёс бы память под область, которой на плите нет.
 */
export function cutoutRect(
  layer: RasterLayer,
  cut: HTMLCanvasElement,
  dx: number,
  dy: number,
): Bounds | null {
  const x0 = Math.max(0, Math.round(dx));
  const y0 = Math.max(0, Math.round(dy));
  const x1 = Math.min(layer.w - 1, Math.round(dx) + cut.width - 1);
  const y1 = Math.min(layer.h - 1, Math.round(dy) + cut.height - 1);
  if (x1 < x0 || y1 < y0) return null;
  return [x0, y0, x1, y1];
}

/**
 * ⚠ КОРОБКА СЧИТАЕТСЯ ОТДЕЛЬНО И ДО РИСОВАНИЯ (`cutoutRect`), а не возвращается отсюда. Лента
 * отмены снимает «как было» по размеченной коробке ПЕРЕД тем, как позвать это, — и рисунок,
 * сделанный ради того, чтобы УЗНАТЬ коробку, попал бы в снимок «как было». Отмена тогда вернула бы
 * вставку вместо того, что стояло до неё.
 */
export function drawCutout(
  layer: RasterLayer,
  cut: HTMLCanvasElement,
  dx: number,
  dy: number,
): void {
  ctxOf(layer.doc).drawImage(cut, Math.round(dx), Math.round(dy));
}

/**
 * РАСТУШЕВАТЬ ПИКСЕЛИ ВНУТРИ ВЫДЕЛЕНИЯ (X-5) — смягчить их, а не положить ореол сверху.
 *
 * Смешение честное: область сначала гасится маской (`destination-out`), потом на её место кладётся
 * размытая копия той же маской, — то есть результат это линейная смесь «как было» и «размыто» с
 * весом альфы маски. Мягкий край выделения при этом растушёвывается ЧАСТИЧНО, и это ровно то,
 * что означает мягкий край.
 */
export function softenInside(
  layer: RasterLayer,
  mask: HTMLCanvasElement,
  radiusPx: number,
): void {
  const r = Math.max(0.3, radiusPx);
  const tmp = make(layer.w, layer.h);
  const tctx = ctxOf(tmp);
  tctx.filter = `blur(${r}px)`;
  tctx.drawImage(layer.doc, 0, 0);
  tctx.filter = 'none';
  tctx.globalCompositeOperation = 'destination-in';
  tctx.drawImage(mask, 0, 0);
  tctx.globalCompositeOperation = 'source-over';

  const ctx = ctxOf(layer.doc);
  ctx.save();
  ctx.globalCompositeOperation = 'destination-out';
  ctx.drawImage(mask, 0, 0);
  ctx.globalCompositeOperation = 'source-over';
  ctx.drawImage(tmp, 0, 0);
  ctx.restore();
}

// ── показ ────────────────────────────────────────────────────────────────────────────────────

/**
 * Видимый холст = документ плюс живой жест. Живой жест рисуется ТЕМ ЖЕ композитом и ТОЙ ЖЕ
 * непрозрачностью, какими он ляжет, — «что видно, то и ляжет» здесь не лозунг, а один и тот же
 * `stage` и одна и та же пара (режим, альфа).
 */
export function renderView(
  view: HTMLCanvasElement,
  layer: RasterLayer,
  live: { mode: PaintMode; opacity: number } | null,
): void {
  const ctx = ctxOf(view);
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
  ctx.clearRect(0, 0, view.width, view.height);
  ctx.drawImage(layer.doc, 0, 0);
  if (!live) return;
  ctx.save();
  ctx.globalAlpha = Math.min(1, Math.max(0, live.opacity));
  ctx.globalCompositeOperation = live.mode === 'erase' ? 'destination-out' : 'source-over';
  ctx.drawImage(layer.stage, 0, 0);
  ctx.restore();
}

/**
 * ШОВ НАРУЖУ — ОДНА ФУНКЦИЯ, И ЭТО ЕДИНСТВЕННОЕ МЕСТО, ГДЕ РАСТР ПОКИДАЕТ РЕДАКТОР.
 *
 * PNG БЕЗ БЕЛОЙ ЗЕМЛИ, в отличие от флэттена. Флэт — картинка, на которую смотрят, и дырка на нём
 * обязана быть бумагой; слой — ДОКУМЕНТ, и дырка на нём обязана остаться дыркой, иначе следующий
 * визит прочитает белое пятно как краску и стереть его будет уже нечем.
 */
export function exportRasterPng(layer: RasterLayer): string {
  return layer.doc.toDataURL('image/png');
}
