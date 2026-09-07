import { urlToDataUrl } from 'lib/features/getCropped';

import {
  FULL_REGION,
  drawWarped,
  quadBounds,
  quadCss,
  type Quad,
} from './transform-frame';
import { mapPoint, type ExpandPlan } from './vector-expand';
import { FORMAT_VERSION } from './vector-strokes';

/**
 * ═══ КАРТИНКА КАК СЛОЙ ПРАВКИ — ОБЪЕКТ, КОТОРЫЙ ДВИГАЕТСЯ ПОСЛЕ СОХРАНЕНИЯ ═══════════════════
 *
 * Владелец: «в эдитор добавляй возможность плейсить медиа слоями типо как пуговицы». Ключевое
 * слово — СЛОЯМИ: пуговицу двигают, снимают и двигают снова через неделю. Вклейка в растр
 * (`commitFloat`) этого не даёт: после Enter пиксели становятся частью холста, и следующий визит
 * не знает, что там была пуговица.
 *
 * ПОЭТОМУ КАРТИНКА ЖИВЁТ В ДОКУМЕНТЕ СЛОЯ, А НЕ В ЕГО ПИКСЕЛЯХ. Документ — это JSON, который
 * едет в `DesignEditLayer.strokes`; сервер его НЕ ЧИТАЕТ (потолок 512 КБ и больше ничего), значит
 * формат целиком наш, и добавить в него род объекта можно без прото и без миграций.
 *
 * ── ПОЧЕМУ ОТДЕЛЬНЫЙ КЛЮЧ `images`, А НЕ ЗАПИСЬ ВНУТРИ `strokes[]` ───────────────────────────
 *
 * `VectorStroke` — это ПОЛИЛИНИЯ, и весь редактор на это опирается: `strokeGeometry`, резка
 * лассо, узлы пера, хит-тест, экспорт SVG, растеризатор — все читают `.pts` без вопросов.
 * Разнородный массив означал бы сужение типа в нескольких сотнях мест, и первое пропущенное
 * сужение — это `undefined.length` посреди чужого жеста. Ключ рядом с ними стоит ровно столько,
 * сколько стоит: `readLayer` его не видит, `writeLayer` его не пишет, а этот модуль знает про
 * ОБА ключа и склеивает документ на границе.
 *
 * Z-ПОРЯДОК ЖИВЁТ ПОРЯДКОМ В `images`: последняя в массиве — верхняя. Картинки стоят между
 * пикселями и линиями — ровно там же, где стоит превью плавающей вставки, и по тому же доводу
 * («вставленный кусок ложится поверх краски, но под чертёж»).
 *
 * ── ВЕРСИЯ ДОКУМЕНТА: ПОЧЕМУ ШЕСТЁРКА И ПОЧЕМУ ЕЁ НЕ ВИДНО В `vector-strokes.ts` ─────────────
 *
 * Старая вкладка (сегодняшний прод) прочла бы документ с картинками БЕЗ НИХ — `readLayer` про
 * ключ не знает, — и следующим сохранением стёрла бы их без следа. Ровно та потеря, ради которой
 * `FORMAT_VERSION` вообще существует: «версия поднимается только над документом, который старая
 * вкладка испортила бы молча». Поэтому документ С КАРТИНКАМИ уезжает как `v: 6`, и старая вкладка
 * объявляет его нечитаемым и отказывается писать поверх.
 *
 * Число не прописано в `vector-strokes.ts` нарочно: там живёт формат ПОЛИЛИНИЙ, и его читатель
 * `readLayer` шестёрки действительно не понимает. Понимает её ЭТОТ модуль — он и снимает
 * картинки, и опускает версию до той, которую `readLayer` умеет, прежде чем отдать ему остаток.
 * То есть шестёрка честно означает «нужен бандл, у которого есть этот файл».
 */

/** Точка в долях кадра. Как `VectorStroke.pts` — доли, а не юниты платы: плату можно обрезать. */
type Frac = readonly [number, number];

export type ImageStroke = {
  /** Род записи. Пишется в файл: документ обязан описывать себя сам. */
  k: 'image';
  /**
   * ЛИЧНОСТЬ КАРТИНКИ. Адрес протухает (бакет, домен, ротация), а идентификатор — нет: по нему
   * потом можно спросить сервер, что это было, и по нему же читается «эта картинка пропала».
   */
  mediaId: number;
  /** Адрес на момент постановки — лучшая попытка показать, а не источник истины. */
  src: string;
  /** Четыре угла в долях кадра, по часовой от левого верхнего: TL, TR, BR, BL. */
  quad: readonly [Frac, Frac, Frac, Frac];
  /** 0..1. Единица — обычная картинка; меньше — сквозь неё видно чертёж. */
  opacity: number;
};

/**
 * ⚠ ПОЛЯ `flipX` ЗДЕСЬ НЕТ НАРОЧНО, И ЭТО ПРОВЕРЕНО, А НЕ ЗАБЫТО.
 *
 * Отражение уже ВЫРАЗИМО КВАДОМ: рамка вставки зовёт `scaleQuad` с `allowFlip: !fr.axis`, то есть
 * протяжка ручки за противоположный край переворачивает квад, а гомография с отрицательным
 * определителем зеркалит и `<img>` на экране (`quadCss`), и пиксели во флэте (`drawWarped`) —
 * ОДНИМ И ТЕМ ЖЕ числом. Отдельный флаг был бы вторым способом сказать то же самое: он не имел бы
 * ни одного писателя (кнопки «mirror» в рейке нет и не нужно — жест уже есть), а его читатель
 * применялся бы ПОВЕРХ уже перевёрнутого квада. Ступень, заведённая мёртвой, — довод у
 * `probe-exit-code-is-not-verdict`.
 */

/**
 * Версия документа, несущего картинки. На единицу выше той, которую читает `readLayer`, и это
 * ровно то утверждение, которое она делает: «здесь есть род объекта, которого прошлый бандл не
 * знает». Документ БЕЗ картинок этой версии не получает и уходит теми же байтами, что вчера.
 */
export const IMAGE_DOC_VERSION = FORMAT_VERSION + 1;

/** Сколько кадров за краем платы позволено углу. Тот же запас, что у контрольной точки кривой. */
const REACH = 1;
const reach = (n: number) => Math.min(1 + REACH, Math.max(-REACH, n));
const round4 = (n: number) => Math.round(n * 10000) / 10000;

function readFrac(raw: unknown): Frac | null {
  if (!Array.isArray(raw) || raw.length < 2) return null;
  const x = Number(raw[0]);
  const y = Number(raw[1]);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return [reach(x), reach(y)] as Frac;
}

/**
 * Одна картинка из документа. Возвращает `null` на записи, которую нечем нарисовать, и поднимает
 * `report.broken` только на той, что ОБЕЩАЛА быть картинкой и оказалась битой: разница та же, что
 * у `readStroke`, и по той же причине — «пустой слой» и «слой чужой версии» обязаны различаться.
 */
function readImage(raw: unknown, report: { broken: boolean }): ImageStroke | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (r.k !== 'image') return null;
  const mediaId = Number(r.mediaId);
  const quadRaw = Array.isArray(r.quad) ? r.quad : [];
  if (quadRaw.length !== 4) {
    report.broken = true;
    return null;
  }
  const pts = quadRaw.map(readFrac);
  if (pts.some((p) => p === null)) {
    report.broken = true;
    return null;
  }
  const opacity = Number(r.opacity);
  const out: ImageStroke = {
    k: 'image',
    mediaId: Number.isFinite(mediaId) && mediaId > 0 ? Math.round(mediaId) : 0,
    src: typeof r.src === 'string' ? r.src : '',
    quad: pts as unknown as ImageStroke['quad'],
    opacity: Number.isFinite(opacity) ? Math.min(1, Math.max(0, opacity)) : 1,
  };
  return out;
}

/**
 * РАЗОБРАТЬ ДОКУМЕНТ НА ДВЕ ПОЛОВИНЫ: то, что понимает `readLayer`, и картинки.
 *
 * Отдаётся ТЕКСТ, а не разобранный объект, потому что `readLayer` — единственный читатель формата
 * полилиний, и второй разбор рядом с ним разошёлся бы с ним молча на первой же правке.
 *
 * ⚠ ВЕРСИЯ ОПУСКАЕТСЯ РОВНО ЗДЕСЬ, РОВНО НА ЭТОТ ВЫЗОВ И РОВНО С ШЕСТЁРКИ. `readLayer` объявляет
 * нечитаемым всё старше своего потолка — правильно и для него, и для старой вкладки. Но в ЭТОМ
 * бандле шестёрка читаема: её вторую половину только что сняли. Поэтому остаток отдаётся с
 * версией, которой он фактически и является — документом полилиний прежней ступени.
 *
 * ⚠ И ТОЛЬКО ШЕСТЁРКА, А НЕ «ВСЁ, ЧТО СТАРШЕ ПЯТИ». Здесь стоял дефект: понижалась ЛЮБАЯ версия
 * выше потолка, если у документа был ключ `images`. Значит седьмая ступень — та, что положит рядом
 * с картинками ещё один род объекта (скажем, `texts`), — открылась бы в ЭТОМ бандле как обычный
 * документ полилиний, а следующее сохранение переписало бы её без `texts`: ровно та молчаливая
 * потеря, ради которой `FORMAT_VERSION` и существует. Понижать вправе только тот, кто ЗНАЕТ ВСЮ
 * разницу, а знает он одну ступень — свою. Всё, что новее, обязано быть нечитаемым здесь так же,
 * как шестёрка нечитаема у старой вкладки.
 */
export function splitImageDoc(raw?: string | null): {
  doc: string;
  images: ImageStroke[];
  broken: boolean;
} {
  const text = (raw ?? '').trim();
  if (!text) return { doc: text, images: [], broken: false };
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    // Не наш разбор: пусть `readLayer` назовёт документ нечитаемым своими словами.
    return { doc: text, images: [], broken: false };
  }
  if (!parsed || typeof parsed !== 'object') return { doc: text, images: [], broken: false };
  const obj = parsed as Record<string, unknown>;
  if (obj.images === undefined) return { doc: text, images: [], broken: false };
  if (!Array.isArray(obj.images)) {
    // Ключ есть, а массива нет — документ написан не нами и не этой версией. Отдаём как есть:
    // версия останется шестёркой, и `readLayer` объявит его нечитаемым, что и требуется.
    return { doc: text, images: [], broken: true };
  }
  const version = Number(obj.v ?? 0);
  if (version !== IMAGE_DOC_VERSION) {
    /* НЕ НАША СТУПЕНЬ. Текст отдаётся БАЙТ В БАЙТ, вместе со своей версией: пусть `readLayer`
       скажет про неё то же самое своими словами, а `broken` запрёт писателей здесь. Сюда попадает
       и документ НОВЕЕ шестёрки (в нём есть род объекта, которого этот файл не знает), и документ
       СТАРШЕ неё с ключом `images` — такой мы не пишем, значит его писал не этот формат. */
    return { doc: text, images: [], broken: true };
  }
  const report = { broken: false };
  const images = obj.images.map((i) => readImage(i, report)).filter(Boolean) as ImageStroke[];
  if (report.broken) return { doc: text, images: [], broken: true };
  const rest: Record<string, unknown> = { ...obj };
  delete rest.images;
  rest.v = FORMAT_VERSION;
  return { doc: JSON.stringify(rest), images, broken: false };
}

/**
 * СКЛЕИТЬ ОБРАТНО. Документ БЕЗ картинок возвращается БАЙТ В БАЙТ — обещание «старый слой уходит
 * теми же байтами» держится тем, что при пустом списке этот код не трогает строку вовсе.
 */
export function joinImageDoc(doc: string, images: readonly ImageStroke[]): string {
  if (!images.length) return doc;
  let parsed: unknown;
  try {
    parsed = JSON.parse(doc);
  } catch {
    return doc;
  }
  if (!parsed || typeof parsed !== 'object') return doc;
  const obj = { ...(parsed as Record<string, unknown>) };
  obj.v = IMAGE_DOC_VERSION;
  obj.images = images.map((i) => {
    const row: Record<string, unknown> = {
      k: 'image',
      mediaId: i.mediaId,
      src: i.src,
      quad: i.quad.map((p) => [round4(p[0]), round4(p[1])]),
      opacity: Math.round(Math.min(1, Math.max(0, i.opacity)) * 1000) / 1000,
    };
    return row;
  });
  return JSON.stringify(obj);
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// ГЕОМЕТРИЯ — доли кадра ⇄ юниты платы
// ─────────────────────────────────────────────────────────────────────────────────────────────

export const imageQuadPlate = (img: ImageStroke, plateW: number, plateH: number): Quad =>
  img.quad.map((p) => [p[0] * plateW, p[1] * plateH] as const) as unknown as Quad;

export const imageQuadFrac = (
  quad: Quad,
  plateW: number,
  plateH: number,
): ImageStroke['quad'] =>
  quad.map((p) => [reach(p[0] / plateW), reach(p[1] / plateH)] as const) as unknown as ImageStroke['quad'];

/**
 * КУДА ЛОЖИТСЯ ТОЛЬКО ЧТО ВЗЯТАЯ КАРТИНКА: треть ширины платы, по центру, СВОИМИ пропорциями.
 *
 * Треть, а не «во весь кадр»: пуговицу кладут на вещь, а не вместо неё, и рамка сразу видна
 * целиком вместе с тем, поверх чего она встала. Пропорции берутся у самой картинки — иначе
 * первое же движение ручки растягивало бы её от неправильной формы, а вернуть её нечем.
 */
export function fitImageQuad(
  natW: number,
  natH: number,
  plateW: number,
  plateH: number,
): ImageStroke['quad'] {
  const ratio = natW > 0 && natH > 0 ? natW / natH : plateW / plateH;
  let w = plateW / 3;
  let h = w / ratio;
  // Высокая и узкая картинка обязана влезть по высоте, иначе «треть» означала бы кадр, вылезающий
  // за плату сверху и снизу, и рука не нашла бы его нижних ручек.
  const maxH = plateH / 3;
  if (h > maxH) {
    h = maxH;
    w = h * ratio;
  }
  const x0 = (plateW - w) / 2;
  const y0 = (plateH - h) / 2;
  return [
    [x0 / plateW, y0 / plateH],
    [(x0 + w) / plateW, y0 / plateH],
    [(x0 + w) / plateW, (y0 + h) / plateH],
    [x0 / plateW, (y0 + h) / plateH],
  ] as unknown as ImageStroke['quad'];
}

/**
 * ЧТО ПОД УКАЗАТЕЛЕМ, ДОЛЯМИ КАДРА. Сверху вниз: последняя в массиве — верхняя, значит и
 * спрашивается первой. `null` — мимо всех.
 *
 * Квад может быть невыпуклым (перспектива этого не даёт, но битая запись — да), поэтому проверка
 * идёт двумя треугольниками, а не знаком четырёх векторных произведений.
 *
 * ── ДВЕ ПРАВКИ ПРОТИВ «КЛИК УХОДИТ НЕ ТУДА», И У КАЖДОЙ СВОЙ ДЕФЕКТ ──────────────────────────
 *
 * 1. КАРТИНКА, ВЫКРУЧЕННАЯ В НОЛЬ, НЕ ЛОВИТ УКАЗАТЕЛЬ. Её на экране НЕТ, а квад у неё есть, и
 *    прежний хит-тест отдавал ей всякий клик по площади — то есть невидимое тело перехватывало
 *    работу с тем, что под ним. Тот же довод, по которому погашенный слой не ловит указатель:
 *    «не видно, но мешает» — состояние, которого человек не поймёт и не отменит.
 *
 * 2. ВТОРОЙ КЛИК В ТО ЖЕ МЕСТО БЕРЁТ СЛЕДУЮЩУЮ ВНИЗ. Стопка перекрывающихся картинок иначе
 *    запирает нижние навсегда: верхняя отвечает всегда, а органа «выбрать под ней» нет ни одного.
 *    `below` — это НОМЕР, КОТОРЫЙ ВЗЯЛ ПРОШЛЫЙ КЛИК В ТОЙ ЖЕ ТОЧКЕ (не «та, что в руке»: пока
 *    картинка в руке, клик внутри её квада забирает рамка и сюда не доходит вовсе — см. вызов в
 *    модалке). Если этот номер сам под указателем, ответом становится следующий под ним, а с
 *    самого нижнего выбор возвращается наверх — круг, а не тупик.
 *
 * ⚠ ЧЕГО ЗДЕСЬ НЕТ И ПОЧЕМУ ЭТО СКАЗАНО: ПРОБЫ АЛЬФЫ ПОД КУРСОРОМ. Прозрачный УГОЛ картинки
 * (обтравленная пуговица в квадратном PNG) ловит клик по-прежнему. Честная проба требует
 * ДЕКОДИРОВАННЫХ байтов, а они приезжают через прокси обещанием; хит-тест же зовётся синхронно
 * из `pointerdown`, и ответ «подожди, я схожу за файлом» жесту дать нечем. Рисовать её из
 * экранного `<img>` тоже нельзя: он с чужого ориджина, холст от него грязный и `getImageData`
 * бросает. Поэтому граница названа, а не замазана: круг по повторному клику даёт ту же цель —
 * добраться до нижней — жестом, который работает всегда.
 */
export function hitImage(
  images: readonly ImageStroke[],
  at: readonly [number, number],
  below?: number | null,
): number | null {
  const stack: number[] = [];
  for (let i = images.length - 1; i >= 0; i--) {
    const img = images[i];
    if (!(img.opacity > 0)) continue;
    const q = img.quad;
    if (inTri(at, q[0], q[1], q[2]) || inTri(at, q[0], q[2], q[3])) stack.push(i);
  }
  if (!stack.length) return null;
  if (below === null || below === undefined) return stack[0];
  const seat = stack.indexOf(below);
  // Прошлый выбор НЕ под указателем — значит человек целится в другое место, и круг здесь
  // означал бы «клик по свободной картинке иногда берёт не её».
  if (seat < 0) return stack[0];
  return stack[(seat + 1) % stack.length];
}

function inTri(p: readonly [number, number], a: Frac, b: Frac, c: Frac): boolean {
  const d = (u: Frac, v: Frac, w: readonly [number, number]) =>
    (w[0] - v[0]) * (u[1] - v[1]) - (u[0] - v[0]) * (w[1] - v[1]);
  const d1 = d(a, b, p);
  const d2 = d(b, c, p);
  const d3 = d(c, a, p);
  const neg = d1 < 0 || d2 < 0 || d3 < 0;
  const pos = d1 > 0 || d2 > 0 || d3 > 0;
  return !(neg && pos);
}

/** CSS-трансформ для элемента `natW × natH` с `transform-origin: 0 0`, в юнитах платы. */
export const imageCss = (quad: Quad, natW: number, natH: number): string =>
  quadCss(quad, natW, natH);

/** Осе-выровненная коробка картинки в юнитах платы — ею рисуется плашка пропавшей. */
export const imageBox = (img: ImageStroke, plateW: number, plateH: number) =>
  quadBounds(imageQuadPlate(img, plateW, plateH));

/**
 * ═══ КРОП/РОСТ ЛИСТА ДВИГАЕТ И КАРТИНКИ ══════════════════════════════════════════════════════
 *
 * ⚠ ЭТОГО НЕ БЫЛО, И ПОТЕРЯ БЫЛА МОЛЧАЛИВОЙ. Кроп пересчитывает штрихи (`expandStrokes`) и растр
 * (`expandRasterLayer`): и те, и другой хранятся ДОЛЯМИ/ПИКСЕЛЯМИ КАДРА, а кадр меняется.
 * Квад картинки — те же доли того же кадра, и без пересчёта пуговица после обрезки листа вдвое
 * оказывалась ровно вдвое не там, где человек её оставил, — притом на экране это выглядело бы
 * «редактор сам её подвинул».
 *
 * Пересчёт — ТОТ ЖЕ `mapPoint`, которым живут штрихи: второе место, знающее формулу `ox + x·kx`,
 * разошлось бы с первым на первой же правке плана.
 *
 * ⚠ КАРТИНКА, ЦЕЛИКОМ ВЫПАВШАЯ ЗА НОВЫЙ ЛИСТ, СНИМАЕТСЯ — ровно как режутся штрихи
 * (`copyInsideSelection` перед пересчётом). Иначе обрезка в угол сгоняла бы весь снятый материал
 * узкой полосой на кромку: объекты, которых на листе нет, но которые ловят клик и уезжают в
 * документ. Задетая краем — остаётся: у неё есть видимая часть, и она по-прежнему в руке.
 */
export function expandImageQuads(
  images: readonly ImageStroke[],
  plan: ExpandPlan,
): ImageStroke[] {
  const out: ImageStroke[] = [];
  for (const img of images) {
    const moved = img.quad.map((p) => mapPoint(p, plan));
    const x0 = Math.min(...moved.map((p) => p[0]));
    const x1 = Math.max(...moved.map((p) => p[0]));
    const y0 = Math.min(...moved.map((p) => p[1]));
    const y1 = Math.max(...moved.map((p) => p[1]));
    if (x1 <= 0 || y1 <= 0 || x0 >= 1 || y0 >= 1) continue;
    out.push({
      ...img,
      quad: moved.map((p) => [reach(p[0]), reach(p[1])] as const) as unknown as ImageStroke['quad'],
    });
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// ПИКСЕЛИ — ЕДИНСТВЕННОЕ МЕСТО, ГДЕ КАРТИНКА СТАНОВИТСЯ РАСТРОМ
// ─────────────────────────────────────────────────────────────────────────────────────────────

/**
 * Байты по адресу, ЧЕРЕЗ ПРОКСИ И ОДИН РАЗ НА АДРЕС.
 *
 * Прокси — потому что холст, на который нарисовали картинку с чужого ориджина, испачкан, и
 * `toDataURL` на нём бросает `SecurityError`: ровно тот же танец, каким подложку берёт
 * `composeScene`. Полка — потому что сплющивание, пипетка и разметка прогона зовут композит
 * подряд, и три сетевых круга за одну и ту же пуговицу платятся ни за что.
 *
 * ── ДВЕ ГРАНИЦЫ У ЭТОЙ ПОЛКИ, И ОБЕ ПОСТАВЛЕНЫ ПО ЗАМЕРУ, А НЕ ПО ВКУСУ ──────────────────────
 *
 * 1. ⚠ ОТКАЗ НЕ ЗАПОМИНАЕТСЯ. Здесь стояло обратное — «кэшируется и отказ, чтобы пропавшее медиа
 *    отказывало быстро», — и оно врало человеку: отказ сплющивания говорит «подождите медиа-сервер
 *    и нажмите ещё раз», а нажатие ещё раз возвращало ТОТ ЖЕ запомненный `null` до конца визита.
 *    Обещание, которое орган не может выполнить, хуже отсутствующего органа. Полка держит ОБЕЩАНИЕ,
 *    пока оно в полёте (два композита подряд не дают двух кругов), и снимает его с полки, как
 *    только оно осело провалом. Быстрым повторный отказ при этом остаётся ровно там, где ему и
 *    положено: внутри одного композита все картинки спрашиваются один раз каждая.
 *
 * 2. ⚠ У ПОЛКИ ЕСТЬ ПОТОЛОК, И ОНА ПУСТЕЕТ НА ЗАКРЫТИИ. Она модульная, то есть переживает и
 *    модалку, и переход на другую карточку, а держит ПОЛНОРАЗМЕРНЫЕ снимки: десяток пуговиц
 *    4000×4000 — это 640 МБ, которые никто никогда не отпустит. Считается ПЛОЩАДЬ в пикселях
 *    (байты растра ей пропорциональны), самая давняя вытесняется первой, а `clearImageBytes`
 *    зовётся, когда редактор закрывают: следующий визит заплатит сетью, а не памятью.
 */
type BitmapEntry = { task: Promise<HTMLImageElement | null>; pixels: number };

/**
 * ПОТОЛОК ПОЛКИ В ПИКСЕЛЯХ. 64 мегапикселя — это около 256 МБ распакованного растра: четыре
 * снимка 4000×4000 или сорок обычных пуговиц. Число названо здесь, а не размазано по коду,
 * потому что граница, которую нельзя прочитать, — это граница, о которой узнают по падению.
 */
export const IMAGE_BYTES_BUDGET_PX = 64 * 1024 * 1024;

/** Порядок вставки в `Map` И ЕСТЬ порядок давности: попадание переставляет запись в конец. */
const bitmaps = new Map<string, BitmapEntry>();

export function loadImageBytes(src: string): Promise<HTMLImageElement | null> {
  if (!src) return Promise.resolve(null);
  const known = bitmaps.get(src);
  if (known) {
    // Тронутое — самое свежее: снять и положить обратно, иначе вытеснение выбрасывало бы то,
    // чем пользуются каждый композит, и оставляло бы то, что взяли однажды.
    bitmaps.delete(src);
    bitmaps.set(src, known);
    return known.task;
  }
  const entry: BitmapEntry = {
    pixels: 0,
    task: (async () => {
      try {
        const dataUrl = await urlToDataUrl(src);
        const img = new Image();
        img.src = dataUrl;
        await img.decode();
        return img.naturalWidth > 0 && img.naturalHeight > 0 ? img : null;
      } catch {
        return null;
      }
    })(),
  };
  bitmaps.set(src, entry);
  void entry.task.then((img) => {
    // Запись могли снять с полки, пока байты ехали (закрытие модалки, вытеснение, `forget`):
    // тогда трогать её нельзя вовсе, иначе провал воскресил бы её или потолок посчитал бы дважды.
    if (bitmaps.get(src) !== entry) return;
    if (!img) {
      bitmaps.delete(src);
      return;
    }
    entry.pixels = img.naturalWidth * img.naturalHeight;
    trimImageBytes();
  });
  return entry.task;
}

/**
 * ВЫТЕСНИТЬ САМЫЕ ДАВНИЕ, ПОКА ПОЛКА НЕ ВЛЕЗЕТ В ПОТОЛОК.
 *
 * Бюджет — аргумент с умолчанием, а не константа внутри: проба обязана уметь ПЕРЕПОЛНИТЬ полку,
 * не выделяя четверти гигабайта, и мерить она обязана ту же функцию, которая работает на проде.
 * Последняя запись не вытесняется никогда: полка, вытеснившая всё, — это отсутствие полки.
 */
export function trimImageBytes(budgetPx: number = IMAGE_BYTES_BUDGET_PX): void {
  let total = 0;
  for (const e of bitmaps.values()) total += e.pixels;
  for (const [src, e] of bitmaps) {
    if (total <= budgetPx || bitmaps.size <= 1) return;
    bitmaps.delete(src);
    total -= e.pixels;
  }
}

/** Сколько на полке лежит — рейка это не печатает, но проба обязана уметь спросить. */
export const imageBytesStats = (): { count: number; pixels: number } => {
  let pixels = 0;
  for (const e of bitmaps.values()) pixels += e.pixels;
  return { count: bitmaps.size, pixels };
};

/** Забыть ответ про один адрес — для «попробовать ещё раз» после того, как медиа вернули. */
export const forgetImageBytes = (src: string) => bitmaps.delete(src);

/** Освободить полку целиком. Зовётся на закрытии редактора — довод в шапке блока. */
export const clearImageBytes = () => bitmaps.clear();

/**
 * ПОЛОЖИТЬ КАРТИНКИ НА ХОЛСТ `w × h`, В ПОРЯДКЕ МАССИВА.
 *
 * Возвращает список ИНДЕКСОВ, которые нарисовать не удалось: вызывающий обязан уметь сказать это
 * словами, а не молча отдать картинку с дыркой на месте пуговицы.
 *
 * Рисуется тем же `drawWarped`, что и постановка вставки: перспектива у картинки и у выреза одна
 * и та же геометрия, и второй растеризатор рядом разошёлся бы с первым на первом же квадe.
 */
export async function drawImagesOnto(
  ctx: CanvasRenderingContext2D,
  images: readonly ImageStroke[],
  w: number,
  h: number,
): Promise<number[]> {
  const missing: number[] = [];
  for (let i = 0; i < images.length; i++) {
    const img = images[i];
    const bytes = await loadImageBytes(img.src);
    if (!bytes) {
      missing.push(i);
      continue;
    }
    const quad = imageQuadPlate(img, w, h);
    ctx.save();
    ctx.globalAlpha = Math.min(1, Math.max(0, img.opacity));
    // `drawWarped` держит СВОЮ пару `save`/`restore` и матрицу за собой убирает сам — внешний
    // `setTransform` здесь затёр бы мир вызывающего, о котором этот модуль ничего не знает.
    // Перевёрнутый квад зеркалит картинку тем же кодом: у гомографии просто отрицательный
    // определитель, и отдельной ветки отражения здесь нет по построению.
    drawWarped(ctx, bytes, bytes.naturalWidth, bytes.naturalHeight, { quad }, FULL_REGION);
    ctx.restore();
  }
  return missing;
}
