/**
 * Client-side preview rendering.
 *
 * The server never rasterises anything: doing so would mean a PDF/PostScript stack
 * inside the Go container. The browser already has one, so the page renders the first
 * page (or a downscaled raster) and ships it alongside the file in the same request.
 *
 * Every path here is best-effort. A file with no preview is completely usable — the
 * grid shows an extension plate instead — so a render failure must stay silent rather
 * than block an upload that is otherwise fine.
 */

/** Longest edge of a generated preview. Big enough to recognise a mockup in the grid,
 * small enough that it never approaches the server's 2 MB cap on the preview part. */
const PREVIEW_MAX_EDGE = 512;

const WEBP_QUALITY = 0.82;

function canvasToWebp(canvas: HTMLCanvasElement): Promise<Blob | null> {
  return new Promise((resolve) => {
    canvas.toBlob((b) => resolve(b), 'image/webp', WEBP_QUALITY);
  });
}

/** Scales (w,h) so the longest edge is at most PREVIEW_MAX_EDGE, never scaling up. */
function fit(w: number, h: number): { w: number; h: number } {
  const longest = Math.max(w, h);
  if (longest <= PREVIEW_MAX_EDGE) return { w, h };
  const k = PREVIEW_MAX_EDGE / longest;
  return { w: Math.max(1, Math.round(w * k)), h: Math.max(1, Math.round(h * k)) };
}

/**
 * Rasterises an image file, including SVG.
 *
 * SVG matters here specifically: the icons the team draws are svg, and svg is served
 * download-only (it would execute as script from the bucket origin if viewed inline).
 * Without a raster preview a library of icons is a grid of identical ".SVG" plates —
 * unusable for the one thing icons are picked by, which is looking at them. Drawing
 * the svg into a canvas inlines the RASTER, never the markup, so nothing executes.
 */
async function previewFromImage(file: File): Promise<Blob | null> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    // SVG without intrinsic dimensions would otherwise rasterise at 0×0.
    img.width = PREVIEW_MAX_EDGE;
    img.height = PREVIEW_MAX_EDGE;
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('image decode failed'));
      img.src = url;
    });
    const natural = fit(img.naturalWidth || PREVIEW_MAX_EDGE, img.naturalHeight || PREVIEW_MAX_EDGE);
    const canvas = document.createElement('canvas');
    canvas.width = natural.w;
    canvas.height = natural.h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    // White ground: a transparent PNG or SVG would otherwise preview as a dark smear
    // against the grid's white tiles.
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return await canvasToWebp(canvas);
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Renders page 1 of a PDF.
 *
 * pdfjs is imported dynamically so it never lands in the main bundle — the same
 * treatment the DXF viewer gets. Most sessions never open this screen at all.
 */
async function previewFromPdf(file: File): Promise<Blob | null> {
  const pdfjs = await import('pdfjs-dist');
  // The worker ships with the package; resolving it through import.meta.url lets Vite
  // fingerprint and serve it rather than reaching for a CDN (which CSP would refuse).
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/build/pdf.worker.min.mjs',
    import.meta.url,
  ).toString();

  const data = new Uint8Array(await file.arrayBuffer());
  const doc = await pdfjs.getDocument({ data }).promise;
  try {
    const page = await doc.getPage(1);
    const base = page.getViewport({ scale: 1 });
    const size = fit(base.width, base.height);
    const viewport = page.getViewport({ scale: size.w / base.width });
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.floor(viewport.width));
    canvas.height = Math.max(1, Math.floor(viewport.height));
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: ctx, viewport }).promise;
    return await canvasToWebp(canvas);
  } finally {
    await doc.destroy();
  }
}

/**
 * Builds a preview for a file, or null when there is nothing sensible to show.
 * Never throws: the caller uploads with or without a preview either way.
 */
export async function buildPreview(file: File): Promise<Blob | null> {
  try {
    const type = file.type.toLowerCase();
    if (type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
      return await previewFromPdf(file);
    }
    if (type.startsWith('image/')) {
      return await previewFromImage(file);
    }
    return null;
  } catch {
    // Encrypted PDFs, exotic colour profiles, CID fonts pdfjs cannot resolve — all
    // legitimate reasons to have no thumbnail, none of them worth an error message.
    return null;
  }
}

/**
 * Строит превью для файла, который УЖЕ лежит в бакете.
 *
 * Тем же кодом, что и при загрузке: сервер ничего не растеризует и растеризовать не будет —
 * это означало бы pdf-стек внутри go-контейнера. Файл качается по своей же presigned-ссылке,
 * первая страница рисуется в canvas, наружу уходит webp.
 *
 * В отличие от `buildPreview`, здесь ошибка ГРОМКАЯ. При загрузке превью — удобство: файл
 * встанет в библиотеку и без него. Здесь человек нажал кнопку и ждёт ответа, и тихое `null`
 * выглядело бы как «нажал, ничего не произошло, наверное сломано».
 */
export async function rebuildPreview(args: {
  downloadUrl: string;
  fileName: string;
  contentType?: string;
}): Promise<Blob> {
  if (!args.downloadUrl) throw new Error('у файла нет ссылки на скачивание');

  let res: Response;
  try {
    res = await fetch(args.downloadUrl);
  } catch {
    // ЗДЕСЬ ЖЕ ПРИХОДИТ ОТКАЗ CORS, и браузер не говорит, он это или обрыв сети. Прежняя
    // фраза называла причиной протухшую ссылку — и на файле, загруженном минуту назад, это
    // было заведомо неверно. Тот же путь у читалки, и там он теперь разбирается пробой
    // (`storageReachable` в usePdfDocument); здесь проба не окупается — кнопка одна, ответ
    // мгновенный, и человеку хватает знать, что дело не в файле.
    throw new Error(
      'файл не скачался: до хранилища не достучались или для этого адреса панели не открыт доступ к бакету',
    );
  }
  if (!res.ok) throw new Error(`файл не отдался (${res.status})`);

  const blob = await res.blob();
  const file = new File([blob], args.fileName, { type: args.contentType || blob.type });
  const preview = await buildPreview(file);
  if (!preview) throw new Error('первую страницу нарисовать не вышло');
  return preview;
}
