import { urlToDataUrl } from 'lib/features/getCropped';

/**
 * ОБРАТНЫЙ КРОП — ПИКСЕЛИ. Зеркало `lib/features/getCropped.ts`: тот вырезает прямоугольник
 * ВНУТРИ снимка, этот дорисовывает поля СНАРУЖИ.
 *
 * ПОЧЕМУ ОДНА ЗАГРУЗКА НА ОБА ДЕЛА. Пипетка и сохранение читают ОДИН И ТОТ ЖЕ холст, и это не
 * экономия, а требование правильности: если бы пипетка брала цвет с `<img>` на экране, а запись
 * шла со второй, отдельно загруженной картинки, они могли бы разойтись — экранная копия
 * отмасштабирована браузером, а `drawImage` в масштабе 1:1 даёт другие пиксели на границах. Тогда
 * «взял цвет с самого снимка» давало бы шов, видимый ровно там, где его быть не должно.
 *
 * CORS. Пиксели достаются РОВНО ТЕМ ЖЕ путём, что у кроппера, — через `urlToDataUrl`, то есть
 * через прокси (`media-proxy` в dev, `api/media-proxy.js` на Vercel). Свой способ достать байты
 * разошёлся бы с общим на первом же отказе бакета, и отказ этот приходит не всегда и не сразу.
 */

/** Поля вокруг снимка, В ПИКСЕЛЯХ ИСХОДНИКА. Отрицательных не бывает: этот орган только добавляет. */
export type Margins = { top: number; right: number; bottom: number; left: number };

export const NO_MARGINS: Margins = { top: 0, right: 0, bottom: 0, left: 0 };

export const DEFAULT_BACKGROUND = '#ffffff';

/**
 * Сторона квадрата, который усредняет пипетка. НЕ ОДИН ПИКСЕЛЬ, и это главное решение этого файла:
 * JPEG хранит цвет блоками 8×8 с потерями, поэтому одиночный пиксель ровного студийного фона
 * отличается от соседа на 2–4 единицы канала. Поле, залитое таким «точным» цветом, даёт видимый
 * шов по границе снимка — то есть ровно тот дефект, ради отсутствия которого пипетку и берут.
 * Пять на пять усредняет блочный шум и не успевает захватить край предмета.
 */
const SAMPLE_BOX = 5;

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

const hex2 = (v: number) => clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0');

/** «#rgb» / «rrggbb» / «#RRGGBB» → «#rrggbb». Иначе undefined — поле не красится наугад. */
export function normaliseHex(input: string): string | undefined {
  const raw = input.trim().replace(/^#/, '');
  if (/^[0-9a-fA-F]{3}$/.test(raw)) {
    const [r, g, b] = raw.toLowerCase().split('');
    return `#${r}${r}${g}${g}${b}${b}`;
  }
  if (/^[0-9a-fA-F]{6}$/.test(raw)) return `#${raw.toLowerCase()}`;
  return undefined;
}

export type SourcePixels = {
  width: number;
  height: number;
  /**
   * Средний цвет квадрата 5×5 вокруг точки исходника. Координаты — в пикселях ИСХОДНИКА, а не
   * экрана: пересчёт делает вызывающий, у него есть габариты кадра на экране.
   */
  sampleAt: (x: number, y: number) => string;
  /** Новый холст «исходник + поля» → data URL. Именно он уходит в загрузку. */
  expand: (margins: Margins, background: string, format: string) => string;
};

/**
 * Тянет исходник через прокси, разбирает его в холст и отдаёт две операции над ним.
 * Бросает — с человеческим текстом — если байты не пришли или картинка не разобралась.
 */
export async function loadSourcePixels(url: string): Promise<SourcePixels> {
  const dataUrl = await urlToDataUrl(url);

  const image = new Image();
  image.src = dataUrl;
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error('the image did not decode'));
  });

  const width = image.naturalWidth;
  const height = image.naturalHeight;
  if (!width || !height) throw new Error('the image reports no size');

  const source = document.createElement('canvas');
  source.width = width;
  source.height = height;
  // `willReadFrequently` — не украшение: пипетка читает холст на КАЖДОЕ движение мыши, а без
  // флага Chrome держит холст на GPU и каждый `getImageData` заставляет ждать обратной пересылки.
  const sctx = source.getContext('2d', { willReadFrequently: true });
  if (!sctx) throw new Error('the browser gave no 2d context');
  sctx.drawImage(image, 0, 0);

  const sampleAt = (x: number, y: number) => {
    const half = (SAMPLE_BOX - 1) / 2;
    const x0 = clamp(Math.round(x) - half, 0, Math.max(0, width - 1));
    const y0 = clamp(Math.round(y) - half, 0, Math.max(0, height - 1));
    const w = Math.min(SAMPLE_BOX, width - x0);
    const h = Math.min(SAMPLE_BOX, height - y0);
    const { data } = sctx.getImageData(x0, y0, w, h);
    let r = 0;
    let g = 0;
    let b = 0;
    let n = 0;
    for (let i = 0; i < data.length; i += 4) {
      // Прозрачный пиксель в усреднение не входит: его RGB не показан никому, и втащив его,
      // пипетка вернула бы чёрный на срезе PNG с альфой.
      if (data[i + 3] === 0) continue;
      r += data[i];
      g += data[i + 1];
      b += data[i + 2];
      n += 1;
    }
    if (!n) return DEFAULT_BACKGROUND;
    return `#${hex2(r / n)}${hex2(g / n)}${hex2(b / n)}`;
  };

  const expand = (margins: Margins, background: string, format: string) => {
    const left = Math.max(0, Math.round(margins.left));
    const right = Math.max(0, Math.round(margins.right));
    const top = Math.max(0, Math.round(margins.top));
    const bottom = Math.max(0, Math.round(margins.bottom));

    const out = document.createElement('canvas');
    out.width = width + left + right;
    out.height = height + top + bottom;
    const octx = out.getContext('2d');
    if (!octx) throw new Error('the browser gave no 2d context');

    // Заливка идёт ПОД снимок целиком, а не четырьмя полосами по краям. Четыре полосы оставляют
    // швы по стыкам от сглаживания, и они видны на однотонном фоне.
    octx.fillStyle = normaliseHex(background) ?? DEFAULT_BACKGROUND;
    octx.fillRect(0, 0, out.width, out.height);
    octx.drawImage(image, left, top);

    // Та же лестница качества, что у кроппера (`getCropped.ts`): webp пишется без потерь,
    // остальное на 0.95. Расхождение здесь означало бы, что два соседних органа медиатеки
    // отдают разный вес на одном и том же снимке.
    return out.toDataURL(format, format === 'image/webp' ? 1.0 : 0.95);
  };

  return { width, height, sampleAt, expand };
}

/**
 * Поля, которые доводят исходник до пропорции `ratio` (ширина/высота), НЕ ОБРЕЗАЯ его.
 *
 * Добавлять можно только по одной оси — по той, которой не хватает; вторая остаётся нетронутой.
 * Поэтому любая пропорция достижима из любого исходника, и ни одна кнопка рельса не может быть
 * мёртвой. Добавка делится пополам, остаток уходит вниз/вправо: сумма обязана сойтись в пиксель,
 * иначе подпись «результат» разойдётся с файлом.
 *
 * ОПЕРАЦИЯ ИДЕМПОТЕНТНА: она считается от ИСХОДНИКА, а не от текущих полей, поэтому «1:1, потом
 * 4:5» даёт ровно то же, что «сразу 4:5». Накопление дало бы разный результат от порядка нажатий.
 */
export function marginsForRatio(srcW: number, srcH: number, ratio: number): Margins {
  if (!srcW || !srcH || !ratio) return NO_MARGINS;
  const current = srcW / srcH;
  if (Math.abs(current - ratio) < 1e-6) return NO_MARGINS;
  if (current > ratio) {
    const add = Math.max(0, Math.round(srcW / ratio) - srcH);
    const top = Math.floor(add / 2);
    return { top, bottom: add - top, left: 0, right: 0 };
  }
  const add = Math.max(0, Math.round(srcH * ratio) - srcW);
  const left = Math.floor(add / 2);
  return { left, right: add - left, top: 0, bottom: 0 };
}
