import { Area } from 'react-easy-crop';

const MEDIA_PROXY =
  (typeof window !== 'undefined' && (import.meta.env.VITE_MEDIA_PROXY_URL as string | undefined)) ||
  (typeof window !== 'undefined' ? `${window.location.origin}/media-proxy` : '/media-proxy');

function getFetchUrl(url: string): string {
  if (url.startsWith('data:') || url.startsWith('blob:')) return url;
  try {
    const u = new URL(url);
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    const sameOrigin = u.origin === origin || u.hostname === 'localhost';
    if (sameOrigin) return url;
    return `${MEDIA_PROXY}?url=${encodeURIComponent(url)}`;
  } catch {
    return url;
  }
}

/**
 * Fetch a remote media url through the CORS proxy and return it as a data url — the only way to
 * get a media-server image onto a canvas without tainting it. Exported because saving a drawn-on
 * image out of the viewer has exactly the same constraint as cropping does.
 */
export async function urlToDataUrl(imageUrl: string): Promise<string> {
  if (imageUrl.startsWith('data:')) {
    return imageUrl;
  }

  if (imageUrl.startsWith('blob:')) {
    return imageUrl;
  }

  const fetchUrl = getFetchUrl(imageUrl);

  try {
    const response = await fetch(fetchUrl, {
      mode: 'cors',
      credentials: 'omit',
      cache: 'default',
    });
    if (!response.ok) {
      throw new Error(`Failed to fetch image: ${response.statusText}`);
    }
    const blob = await response.blob();
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        if (reader.result) {
          resolve(reader.result.toString());
        } else {
          reject(new Error('Could not convert image to data URL'));
        }
      };
      reader.onerror = () => {
        reject(new Error('Error reading image blob'));
      };
      reader.readAsDataURL(blob);
    });
  } catch (error) {
    if (
      error instanceof TypeError &&
      (error.message.includes('fetch') ||
        error.message.includes('CORS') ||
        error.message.includes('Failed to fetch') ||
        error.message.includes('NetworkError'))
    ) {
      throw new Error(
        'Cannot crop this image due to CORS restrictions. The image server (files.grbpwr.com) does not allow cross-origin requests. Please contact the server administrator to enable CORS headers.',
      );
    }
    if (error instanceof Error) {
      throw new Error(`Failed to load image for cropping: ${error.message}`);
    }
    throw error;
  }
}

/* ═══ ФОРМАТ ВЫВОДА — ПРАВИЛО ЖИВЁТ ЗДЕСЬ ════════════════════════════════════════════════════
   Кроп до сих пор ВСЕГДА писал JPEG, кроме источника с именем на `.webp`, и вместе с форматом
   терялась прозрачность: канвас заливался белым и вырезанная фигура приезжала на белом прямо-
   угольнике. Правило вынесено сюда, потому что писали его дословной строкой в трёх местах
   (`cropper.tsx`, `expander.tsx:250`, приёмное окно медиа) и сходились они не всегда.
   ⚠ ОБРАТНЫЙ КРОП (`expander.tsx` / `getExpanded.ts`) СВОЮ КОПИЮ ПОКА ДЕРЖИТ: там заливка не
   лишняя, а несущая (поля добирает пипетка), и «прозрачно» ему нужно отдельным выбором, а не
   сменой формата. Долг записан, в эту фазу не входит. */

const IMAGE_FORMATS: Record<string, string> = {
  'image/png': 'image/png',
  'image/webp': 'image/webp',
  'image/jpeg': 'image/jpeg',
  'image/jpg': 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
};

/**
 * MIME, приведённый к тому, что канвас УМЕЕТ ЗАПИСАТЬ. `undefined` — не умеет.
 *
 * Проверка не формальность: `toDataURL` на неизвестном типе не отказывает, а молча пишет PNG.
 * Снимок с телефона (`image/heic`) или гиф из буфера так и уезжали PNG'ом — то есть без потерь,
 * зато вчетверо тяжелее, и упирались в потолок загрузки уже на сервере. Неизвестный тип теперь
 * значит «источник о себе не сказал», и решает правило ниже, а не случай.
 *
 * ⚠ ХВОСТ ПАРАМЕТРОВ ОТРЕЗАЕТСЯ. MIME — это тип И параметры через `;`, и `Blob.type` приходит
 * с ними всерьёз: `image/png;charset=binary` встречается у объектных адресов. Сравнение целой
 * строки не находило такой тип в таблице, возвращало `undefined` — и кроп молча уезжал JPEG'ом,
 * то есть терял альфу ровно на том пути, ради которого правило и писалось.
 */
export function normaliseImageFormat(mime?: string): string | undefined {
  if (!mime) return undefined;
  const base = mime.split(';')[0].trim().toLowerCase();
  return base ? IMAGE_FORMATS[base] : undefined;
}

/**
 * Формат по ПЕРВЫМ БАЙТАМ блоба — последнее слово, когда тип молчит.
 *
 * `Blob.type` бывает ПУСТЫМ, и это не редкость, а норма ровно на нашем пути: повторный кроп
 * (`media-recrop-dialog`) и выбор из библиотеки (`media-selector`) тянут снимок через
 * `response.blob()`, и если ответ пришёл без `Content-Type` (или с `application/octet-stream`),
 * тип у блоба пустой. Без этого шага такой блоб считался «источник о себе не сказал» и получал
 * прежний JPEG — вместе с потерей прозрачности.
 *
 * Байты не врут: подпись стоит в начале файла и от заголовков не зависит. Читаются первые 16 —
 * дальше всех нужных сигнатур (у WebP она самая длинная: `RIFF` + 4 байта длины + `WEBP`).
 * GIF отвечает PNG'ом намеренно: канвас гифов не пишет вовсе, а PNG — единственный из его
 * форматов, который сохранит и прозрачность гифа, и его резкие края.
 */
async function formatByMagicBytes(blob: Blob): Promise<string | undefined> {
  const head = new Uint8Array(await blob.slice(0, 16).arrayBuffer());
  const at = (offset: number, ...signature: number[]) =>
    signature.every((byte, i) => head[offset + i] === byte);

  if (at(0, 0x89, 0x50, 0x4e, 0x47)) return 'image/png'; // \x89PNG
  if (at(0, 0xff, 0xd8, 0xff)) return 'image/jpeg'; // JPEG SOI + маркер
  // `RIFF` + 4 байта длины + `WEBP` — подпись с дыркой, потому и читаются 16 байт, а не 4.
  if (at(0, 0x52, 0x49, 0x46, 0x46) && at(8, 0x57, 0x45, 0x42, 0x50)) return 'image/webp';
  if (at(0, 0x47, 0x49, 0x46, 0x38)) return 'image/png'; // GIF8 — писать нечем, альфу спасёт PNG
  return undefined;
}

/**
 * Формат вывода, выведенный из АДРЕСА источника: MIME в конверте `data:`, иначе расширение.
 * `undefined` — адрес формата не несёт (`blob:` — самый частый случай: библиотека и повторный
 * кроп сначала тянут снимок блобом, и у объектного адреса расширения нет).
 */
export function imageFormatOf(src: string): string | undefined {
  const envelope = /^data:([a-z]+\/[a-z0-9.+-]+)[;,]/i.exec(src);
  if (envelope) return normaliseImageFormat(envelope[1]);
  // `?v=2` и `#кадр` к имени файла не относятся: без обрезки хвоста `.png?w=800` уезжал в JPEG.
  const path = src.split(/[?#]/)[0];
  const ext = /\.([a-z0-9]+)$/i.exec(path);
  return ext ? normaliseImageFormat(ext[1]) : undefined;
}

/**
 * Формат вывода по САМОМУ источнику. От `imageFormatOf` отличается ровно на `blob:`: у объектного
 * адреса имени нет, а тип у блоба есть — и без этого шага повторный кроп PNG из библиотеки
 * (`media-recrop-dialog`, `media-selector`) продолжал бы отдавать JPEG, то есть терять альфу
 * ровно там, где её и просили сохранить.
 */
async function sourceImageFormat(src: string): Promise<string | undefined> {
  const byName = imageFormatOf(src);
  if (byName || !src.startsWith('blob:')) return byName;
  try {
    const blob = await (await fetch(src)).blob();
    // Тип — если он есть и записываем; иначе подпись. Порядок именно такой: заявленный тип
    // дешевле и обычно точнее, а байты нужны там, где заявлять было некому.
    return normaliseImageFormat(blob.type) ?? (await formatByMagicBytes(blob));
  } catch {
    return undefined;
  }
}

function findBestCrop(width: number, height: number, targetRatio: number | undefined) {
  if (targetRatio === undefined) {
    return { bestWidth: width, bestHeight: height };
  }

  let bestWidth = 0;
  let bestHeight = 0;
  let minDiff = Infinity;

  for (let h = height; h >= 1; h--) {
    let w = Math.round(targetRatio * h);
    if (w <= width) {
      let diff = Math.abs(w / h - targetRatio);
      if (diff < minDiff) {
        minDiff = diff;
        bestWidth = w;
        bestHeight = h;
      }
    }
  }

  return { bestWidth, bestHeight };
}

async function getRotatedImage(imageSrc: string, rotation: number): Promise<HTMLCanvasElement> {
  const dataUrl = await urlToDataUrl(imageSrc);

  const image = new Image();
  image.src = dataUrl;

  await new Promise((resolve, reject) => {
    image.onload = resolve;
    image.onerror = () => {
      reject(new Error('Failed to load image'));
    };
  });

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');

  const angleInRads = (rotation * Math.PI) / 180;
  const sin = Math.sin(angleInRads);
  const cos = Math.cos(angleInRads);

  const width = image.width;
  const height = image.height;

  const newWidth = Math.abs(width * cos) + Math.abs(height * sin);
  const newHeight = Math.abs(width * sin) + Math.abs(height * cos);

  canvas.width = newWidth;
  canvas.height = newHeight;

  if (ctx) {
    ctx.translate(newWidth / 2, newHeight / 2);
    ctx.rotate(angleInRads);
    ctx.drawImage(image, -width / 2, -height / 2);
  }

  return canvas;
}

/* ═══ ВЕС ВЫВОДА — ПОТОЛОК ЗАГРУЗКИ СТОИТ РЯДОМ С ПРОВЕРКОЙ ═══════════════════════════════════
   Формат перестал быть JPEG'ом, и вместе с альфой вернулся вес: у PNG `quality` не значит ничего
   (сжатие без потерь), и кроп 16 Мпикс уезжает ~55 МБ при потолке бакета 28 МиБ. Раньше этого не
   было видно, потому что тот же снимок уходил JPEG'ом 0.95 (~16 МБ) — то есть предел не
   соблюдался, а обходился потерей прозрачности.

   ⚠ ЧИСЛО — КОПИЯ, А НЕ ИСТОЧНИК. Оригинал живёт в `MAX_IMAGE_BYTES`
   (`components/managers/media/utils/useUploadMedia.ts`) и там же проверяется на отправке; здесь он
   продублирован НАМЕРЕННО: `lib/features` — лист, и импорт из `components/managers/media` затащил
   бы в каждого потребителя кропа react-query и весь слой `api/api` ради одного числа. Меняется
   предел — меняются оба; разойдясь, они разойдутся безопасно: сервер откажет, как и раньше. */
const MAX_UPLOAD_IMAGE_BYTES = 28 * 1024 * 1024;

/* КАЧЕСТВО WEBP. Была 1.0 — то есть «без потерь на глаз» ценой веса, сравнимого с PNG (замерено:
   на 16 Мпикс 1.0 даёт 22 МБ против 4 МБ у 0.92). 0.92 — предел, за которым артефактов ещё не
   видно, а вес падает впятеро; для витринного снимка это правильная сторона обмена. */
const WEBP_QUALITY = 0.92;

/** Вес данных в `data:`-адресе. Base64 — четыре символа на три байта, хвост `=` съедается полом. */
function dataUrlBytes(dataUrl: string): number {
  const base64 = dataUrl.split('base64,')[1] ?? '';
  return Math.floor((base64.length * 3) / 4);
}

/**
 * @param format Формат вывода. Задан и записываем канвасом — уважается (приёмное окно медиа знает
 * MIME файла из `File.type` и говорит его прямо). Не задан или незаписываем — выводится из
 * источника, и только когда молчит и он, остаётся прежний JPEG.
 */
export default async function getCroppedImg(
  imageSrc: string,
  crop: Area,
  aspect?: number,
  format?: string,
  rotation = 0,
): Promise<string> {
  const outFormat =
    normaliseImageFormat(format) ?? (await sourceImageFormat(imageSrc)) ?? 'image/jpeg';
  const rotatedCanvas = await getRotatedImage(imageSrc, rotation);
  const rotatedImage = new Image();
  rotatedImage.src = rotatedCanvas.toDataURL();

  await new Promise((resolve) => {
    rotatedImage.onload = resolve;
  });

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');

  const { bestWidth, bestHeight } = findBestCrop(crop.width, crop.height, aspect);

  canvas.width = bestWidth;
  canvas.height = bestHeight;

  if (ctx) {
    /* ═══ БЕЛЫЙ ГРУНТ — ЧАСТЬ JPEG, А НЕ ЧАСТЬ КРОПА ═══════════════════════════════════════
       У JPEG альфы нет вовсе, и без заливки прозрачные точки уехали бы ЧЁРНЫМИ — заливка тут
       обязательна. У PNG и WebP альфа есть, и та же заливка её просто СТИРАЛА: вырезанная
       фигура приезжала на белом прямоугольнике, и вернуть её было уже нечем. Поворот кладёт в
       углы такую же прозрачность, и она тоже остаётся прозрачной, а не белеет. */
    if (outFormat === 'image/jpeg') {
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.imageSmoothingQuality = 'high';
    ctx.imageSmoothingEnabled = true;

    ctx.drawImage(
      rotatedImage,
      crop.x,
      crop.y,
      crop.width,
      crop.height,
      0,
      0,
      bestWidth,
      bestHeight,
    );
  }

  const quality = outFormat === 'image/webp' ? WEBP_QUALITY : 0.95;
  const dataUrl = canvas.toDataURL(outFormat, quality);

  /* ═══ ПЕРЕВЕС PNG ЛЕЧИТСЯ ФОРМАТОМ, А НЕ КАЧЕСТВОМ ═══════════════════════════════════════
     У PNG ручки качества нет вовсе: `toDataURL('image/png', q)` игнорирует `q`, и сжать
     переросший кроп нечем — кроме как записать его WebP'ом, у которого альфа ТОЖЕ есть. Обмен
     честный: прозрачность (ради неё вся правка) остаётся, вес падает в разы. JPEG сюда не
     годится по определению — он и был тем, что альфу убивало.
     Не влезло и это — отдаём PNG как есть: лишиться качества, не влезши всё равно, значит
     заплатить ни за что; отказ придёт с загрузки ровно тем же сообщением, что и раньше. */
  if (outFormat !== 'image/png' || dataUrlBytes(dataUrl) <= MAX_UPLOAD_IMAGE_BYTES) return dataUrl;
  const asWebp = canvas.toDataURL('image/webp', WEBP_QUALITY);
  return dataUrlBytes(asWebp) <= MAX_UPLOAD_IMAGE_BYTES ? asWebp : dataUrl;
}
