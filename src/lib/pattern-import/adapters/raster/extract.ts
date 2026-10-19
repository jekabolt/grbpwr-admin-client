// Raster sources → SourceDoc (F11): raster PDFs (page by page, ≤ one page of pixels alive) and
// bare image scans (PNG/JPG with a declared or given DPI).

import type {
  Affine,
  ExtractFn,
  ExtractOpts,
  IRPage,
  Progress,
  RasterCalibration,
  SourceDoc,
  Style,
} from '../../types';
import { PATIMPORT } from '../../types';
import {
  assertRasterPagePixels,
  assertRasterPixels,
  corruptInput,
  inputTooLarge,
  oversizedPdfImagesMessage,
  unreadablePdfImagesMessage,
} from '../budget';
import { type BigImage, bigImagesRefusal, planBigImages } from './big-image';
import { AreaResampler, resampleInMemory, type Window, windowAffine } from './resample';
import { RowsUnsupported } from './rows';
import { applyCalibration, calibrate } from './calibrate';
import {
  decodeWithBitmap,
  declaredDpi,
  imagePaintsOf,
  loadRasterPdfjs,
  type ImageDecoder,
  openRasterPdf,
  pixelsOf,
  placementOf,
  rasterFromPdfjs,
  scanPlacement,
} from './decode';
import { apply, compose, invert } from './affine';
import { tracePageSync } from './trace';
import type { RasterImage, RasterPageInput, RasterRef, TraceOpts, TraceStats } from './types';

export type RasterExtractConfig = {
  progress?: Progress;
  /** Calibration policy. 'auto' (default): test square per page, other pages inherit the scanner factor. */
  ref?: 'auto' | RasterRef;
  trace?: Partial<TraceOpts>;
  /** Called after every page with its numbers (timing, inks) — probes measure memory here. */
  onPage?: (page: number, stats: TraceStats[], calib: RasterCalibration) => void;
  /** Image files: decoder (default createImageBitmap + OffscreenCanvas) and DPI override. */
  decode?: ImageDecoder;
  dpi?: number;
  /** Pixel limit of one traced page (default PATIMPORT.maxRasterPixels) — probes lower it. */
  maxPixels?: number;
};

export type RasterExtractResult = {
  doc: SourceDoc;
  calibrations: RasterCalibration[];
  stats: TraceStats[][];
  inkClasses: InkClassSummary[];
};

export type InkClassSummary = {
  rgb: [number, number, number];
  fill: boolean;
  lengthMm: number;
  pages: number[];
};

async function sha256Hex(bytes: ArrayBuffer): Promise<string> {
  const d = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(d), (b) => b.toString(16).padStart(2, '0')).join('');
}

const pathLen = (pts: { x: number; y: number }[]) => {
  let L = 0;
  for (let i = 1; i < pts.length; i++)
    L += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
  return L;
};

/**
 * Document-level colour classes: every page clusters on its own, so the same size colour comes
 * out slightly different per page. Merge greedily by length (longest first, same fill flag) in
 * the space the tracer clusters in — absorption hue (unit direction of 255 − rgb, distance ≤
 * `dirTol`) and strength (ratio ≤ `strengthRatio`) — and rewrite each page's styles to the class
 * colour, so one size = one style colour across the whole document.
 */
export function harmonizeInks(
  pages: IRPage[],
  dirTol = 0.15,
  // Looser than the per-page split (1.5): a 0.3 mm grey line at 144 dpi measures 130–190 of
  // absorption depending on its angle to the pixel grid (leonie size 46), black text 200–250.
  // Neutral inks closer than 1.8× are one class; a 50 % grid under black lines still separates.
  strengthRatio = 1.8,
): { pages: IRPage[]; classes: InkClassSummary[] } {
  const ink = (rgb: number[]) => {
    const a = rgb.map((v) => Math.max(0, 255 - v));
    const n = Math.hypot(a[0], a[1], a[2]) || 1;
    return { dir: a.map((v) => v / n), str: Math.max(a[0], a[1], a[2], 1) };
  };
  type Entry = { page: number; style: Style; len: number };
  const entries: Entry[] = [];
  pages.forEach((pg, pi) => {
    const len = new Map<number, number>();
    for (const p of pg.paths) len.set(p.style, (len.get(p.style) ?? 0) + pathLen(p.pts));
    for (const s of pg.styles) entries.push({ page: pi, style: s, len: len.get(s.id) ?? 0 });
  });
  entries.sort((a, b) => b.len - a.len);
  type Cls = {
    sum: [number, number, number];
    w: number;
    rgb: [number, number, number];
    fill: boolean;
    width: number;
    pages: Set<number>;
  };
  const classes: Cls[] = [];
  const classOf = new Map<Entry, number>();
  for (const e of entries) {
    const rgb = e.style.strokeRgb ?? [0, 0, 0];
    let best = -1;
    let bd = Infinity;
    const me = ink(rgb);
    classes.forEach((c, k) => {
      if (c.fill !== e.style.fill) return;
      const o = ink(c.rgb);
      const dd = Math.hypot(o.dir[0] - me.dir[0], o.dir[1] - me.dir[1], o.dir[2] - me.dir[2]);
      const ratio = Math.max(o.str, me.str) / Math.min(o.str, me.str);
      if (dd > dirTol || ratio > strengthRatio) return;
      const d = dd + 0.2 * Math.log(ratio);
      if (d < bd) {
        bd = d;
        best = k;
      }
    });
    if (best < 0) {
      best = classes.length;
      classes.push({
        sum: [0, 0, 0],
        w: 0,
        rgb: [rgb[0], rgb[1], rgb[2]],
        fill: e.style.fill,
        width: e.style.widthMm,
        pages: new Set(),
      });
    }
    const c = classes[best];
    const w = Math.max(e.len, 1e-3);
    for (let k = 0; k < 3; k++) c.sum[k] += rgb[k] * w;
    c.w += w;
    c.rgb = [c.sum[0] / c.w, c.sum[1] / c.w, c.sum[2] / c.w];
    c.pages.add(pages[e.page].page);
    classOf.set(e, best);
  }
  const byPageStyle = new Map<string, number>();
  for (const [e, k] of classOf) byPageStyle.set(`${e.page}|${e.style.id}`, k);
  const out = pages.map((pg, pi) => {
    const styles: Style[] = [];
    const idOfClass = new Map<number, number>();
    const remap = new Map<number, number>();
    for (const s of pg.styles) {
      const k = byPageStyle.get(`${pi}|${s.id}`)!;
      let id = idOfClass.get(k);
      if (id === undefined) {
        id = styles.length;
        idOfClass.set(k, id);
        const c = classes[k];
        styles.push({
          ...s,
          id,
          strokeRgb: [Math.round(c.rgb[0]), Math.round(c.rgb[1]), Math.round(c.rgb[2])],
          widthMm: c.width,
        });
      }
      remap.set(s.id, id);
    }
    return { ...pg, styles, paths: pg.paths.map((p) => ({ ...p, style: remap.get(p.style)! })) };
  });
  const lenByClass = new Array(classes.length).fill(0);
  for (const [e, k] of classOf) lenByClass[k] += e.len;
  return {
    pages: out,
    classes: classes.map((c, k) => ({
      rgb: [Math.round(c.rgb[0]), Math.round(c.rgb[1]), Math.round(c.rgb[2])],
      fill: c.fill,
      lengthMm: Math.round(lenByClass[k]),
      pages: [...c.pages].sort((a, b) => a - b),
    })),
  };
}

/** Square pages calibrate themselves; the rest inherit the scanner factor of the nearest one. */
function calibrateAll(pages: IRPage[], ref: 'auto' | RasterRef): RasterCalibration[] {
  if (ref !== 'auto') return pages.map((p) => calibrate(p, ref));
  const own = pages.map((p) => calibrate(p, { kind: 'square' }));
  return own.map((c, i) => {
    if (c.method === 'test-square') return c;
    let best = -1;
    own.forEach((o, j) => {
      if (o.method === 'test-square' && (best < 0 || Math.abs(j - i) < Math.abs(best - i)))
        best = j;
    });
    return best < 0 ? c : calibrate(pages[i], { kind: 'inherit', from: own[best] });
  });
}

async function finish(
  info: SourceDoc['file'],
  raw: IRPage[],
  stats: TraceStats[][],
  cfg: RasterExtractConfig,
  warnings: string[],
): Promise<RasterExtractResult> {
  const calibrations = calibrateAll(raw, cfg.ref ?? 'auto');
  const calibrated = raw.map((p, i) => applyCalibration(p, calibrations[i]));
  calibrations.forEach((c, i) => {
    cfg.onPage?.(raw[i].page, stats[i], c);
    if (c.method === 'test-square') warnings.push(`page ${raw[i].page + 1}: ${c.notes.join('; ')}`);
  });
  if (!calibrations.some((c) => c.method === 'test-square')) {
    warnings.push(
      'raster: no test square found — scale is the declared DPI, no stretch/skew correction',
    );
  }
  const { pages, classes } = harmonizeInks(calibrated);
  return { doc: { file: info, pages, warnings }, calibrations, stats, inkClasses: classes };
}

/**
 * RASTER: a 0.5 mm line must keep ≥ 2 px after resampling — 4 px/mm (101.6 dpi). A page that
 * would only fit the pixel limit below this is refused (the tracer could not hold its lines).
 */
export const MIN_RESAMPLED_PX_PER_MM = 4;

/** Whether pdf.js' pixels of a 1 × code paint are the placeholder's raw samples (big-image.ts). */
function isPlaceholder(px: Awaited<ReturnType<typeof pixelsOf>>, b: BigImage): boolean {
  const d = px?.data;
  if (!px || !d || px.width !== 1 || px.height !== b.code) return false;
  const n = b.code;
  if (b.bpc === 1) {
    if (d.length < n || b.head.length < n) return false;
    for (let i = 0; i < n; i++) if ((d[i] & 0x80) !== (b.head[i] & 0x80)) return false;
    return true;
  }
  const stride = d.length / n;
  if ((stride !== 3 && stride !== 4) || b.head.length < n * b.comps) return false;
  for (let i = 0; i < n; i++)
    for (let c = 0; c < 3; c++)
      if (d[i * stride + c] !== b.head[b.comps === 3 ? i * 3 + c : i]) return false;
  return true;
}

/** The pixel window of an image the page shows ([0, w] × [0, h] mm), clamped to the image. */
export function pageWindow(
  pxToPage: Affine,
  w: number,
  h: number,
  pageW: number,
  pageH: number,
): Window | null {
  const inv = invert(pxToPage);
  const pts = [
    apply(inv, 0, 0),
    apply(inv, pageW, 0),
    apply(inv, 0, pageH),
    apply(inv, pageW, pageH),
  ];
  const e = 1e-6;
  const x0 = Math.max(0, Math.floor(Math.min(...pts.map((p) => p.x)) + e));
  const y0 = Math.max(0, Math.floor(Math.min(...pts.map((p) => p.y)) + e));
  const x1 = Math.min(w, Math.ceil(Math.max(...pts.map((p) => p.x)) - e));
  const y1 = Math.min(h, Math.ceil(Math.max(...pts.map((p) => p.y)) - e));
  return x1 > x0 && y1 > y0 ? { x0, y0, x1, y1 } : null;
}

/** Raster PDF, one page of pixels at a time. */
export async function extractRasterPdfDetailed(
  file: { id: string; name: string; bytes: ArrayBuffer },
  opts: ExtractOpts,
  cfg: RasterExtractConfig = {},
): Promise<RasterExtractResult> {
  // C5: pdf.js drops an image over the pixel limit (the guard's maxImageSize). One we can decode
  // in rows stands in as a placeholder (big-image.ts) and is read below, window by window; any
  // other is refused, never traced as an empty page
  const max = cfg.maxPixels ?? PATIMPORT.maxRasterPixels;
  const plan = planBigImages(file.bytes); // the pdf.js guard's limit, not the trace budget
  if (plan.refused.length) throw inputTooLarge(bigImagesRefusal(plan.refused));
  if (plan.unknown) throw inputTooLarge(unreadablePdfImagesMessage(plan.unknown));
  const sha = await sha256Hex(file.bytes);
  const pdf = await openRasterPdf(plan.bytes);
  const warnings: string[] = [];
  const wanted = opts.pages ?? Array.from({ length: pdf.numPages }, (_, i) => i);
  const raw: IRPage[] = [];
  const stats: TraceStats[][] = [];
  let rasterId = 0;
  let producer: string | undefined;
  try {
    const meta = (await pdf.getMetadata()) as { info?: { Producer?: string } };
    producer = meta.info?.Producer;
  } catch {
    producer = undefined;
  }
  const lib = await loadRasterPdfjs();
  const matched = new Set<BigImage>();
  for (let n = 0; n < wanted.length; n++) {
    const pi = wanted[n];
    const page = await pdf.getPage(pi + 1);
    const [vx0, vy0, vx1, vy1] = page.view;
    const k = PATIMPORT.ptToMm;
    const widthMm = (vx1 - vx0) * k;
    const heightMm = (vy1 - vy0) * k;
    const shift = { a: 1, b: 0, c: 0, d: 1, e: -vx0 * k, f: -vy0 * k };
    const paints = await imagePaintsOf(lib, page);
    const where = `${file.name} page ${pi + 1}`;
    // every paint: its full pixel size, placement, and the window of it the page shows
    type Entry = {
      p: (typeof paints)[number];
      /** index into paints */
      q: number;
      big: BigImage | null;
      w: number;
      h: number;
      pxToPage: Affine;
      win: Window;
      outW: number;
      outH: number;
    };
    const entries: Entry[] = [];
    const decoded = new Map<number, Awaited<ReturnType<typeof pixelsOf>>>();
    let pdfjsPx = 0;
    for (let q = 0; q < paints.length; q++) {
      const p = paints[q];
      let big: BigImage | null = null;
      let w = p.w;
      let h = p.h;
      let px: Awaited<ReturnType<typeof pixelsOf>> | undefined;
      if (!(w > 0 && h > 0)) {
        // an inline image or a folded repeat: the size comes with the pixels
        px = await pixelsOf(page, p);
        decoded.set(q, px);
        w = px?.width ?? 0;
        h = px?.height ?? 0;
      }
      // a placeholder is an image XObject (never inline) of 1 × code px whose raw samples are the
      // first bytes of the oversized image's stream — a genuine 1 × code image is not taken for it
      const cand = p.objId !== null && w === 1 ? plan.byDims.get(`1x${h}`) : undefined;
      if (cand) {
        px ??= await pixelsOf(page, p);
        if (isPlaceholder(px, cand)) {
          big = cand;
          w = cand.width;
          h = cand.height;
          decoded.delete(q);
        }
      }
      if (!(w > 0 && h > 0)) {
        warnings.push(`page ${pi + 1}: image op ${p.op} has no decodable pixels`);
        continue;
      }
      if (big) matched.add(big);
      else pdfjsPx += w * h;
      const pxToPage = compose(shift, placementOf(p.ctm, w, h));
      // an image read in rows is read only where the page shows it; one pdf.js decoded is traced
      // whole, as before (its pixels are in memory anyway)
      const win = big ? pageWindow(pxToPage, w, h, widthMm, heightMm) : { x0: 0, y0: 0, x1: w, y1: h };
      if (!win) continue; // painted entirely off the page: nothing of it is visible
      entries.push({ p, q, big, w, h, pxToPage, win, outW: 0, outH: 0 });
    }
    // C5: what pdf.js decoded for this page is bounded as before the resampling existed (twice the
    // trace limit: pdf.js holds those pixels whatever we read of them)
    if (pdfjsPx > 2 * PATIMPORT.maxRasterPixels) assertRasterPagePixels(pdfjsPx, where);
    // C5: one page's images are traced together — the pixels the page shows, together, stay
    // under the limit; above it the page is read at 1/s of its pixels (area mean), the scale kept
    // exact by composing the resampling into pxToPage
    const area = entries.reduce((a, e) => a + (e.win.x1 - e.win.x0) * (e.win.y1 - e.win.y0), 0);
    const s = area > max ? Math.sqrt(area / max) : 1;
    for (const e of entries) {
      const ww = e.win.x1 - e.win.x0;
      const wh = e.win.y1 - e.win.y0;
      e.outW = s > 1 ? Math.max(1, Math.floor(ww / s)) : ww;
      e.outH = s > 1 ? Math.max(1, Math.floor(wh / s)) : wh;
      if (s > 1) {
        // the factors actually used (floors), through the whole placement: its largest singular
        // value is the coarsest mm per traced pixel in any direction
        const m = compose(e.pxToPage, windowAffine(e.win, e.outW, e.outH));
        const p2 = m.a * m.a + m.b * m.b + m.c * m.c + m.d * m.d;
        const det = m.a * m.d - m.b * m.c;
        const mmPerPx = Math.sqrt((p2 + Math.sqrt(Math.max(0, p2 * p2 - 4 * det * det))) / 2);
        if (1 / mmPerPx < MIN_RESAMPLED_PX_PER_MM)
          throw inputTooLarge(
            `${where}: its scanned images hold ${Math.round(area / 1e6)} megapixels on the page; read within the ${Math.round(max / 1e6)} megapixels the importer traces they would keep ${(25.4 / mmPerPx).toFixed(0)} dpi — below the ${(MIN_RESAMPLED_PX_PER_MM * 25.4).toFixed(0)} dpi the tracer needs (a 0.5 mm line must keep 2 pixels). Split the sheet into smaller pages.`,
          );
      }
    }
    assertRasterPagePixels(
      entries.reduce((a, e) => a + e.outW * e.outH, 0),
      where,
    );
    if (s > 1) {
      const dpis = entries.map((e) => 25.4 / Math.hypot(e.pxToPage.a, e.pxToPage.b));
      const hi = Math.max(...dpis);
      warnings.push(
        `page ${pi + 1}: the scan holds ${(area / 1e6).toFixed(0)} megapixels — read at 1/${s.toFixed(2)} of its resolution (${hi.toFixed(0)} → ${(hi / s).toFixed(0)} dpi) to stay within ${Math.round(max / 1e6)} megapixels; the scale is kept exact`,
      );
    }
    const images: RasterImage[] = [];
    for (const e of entries) {
      const { p, win, outW, outH } = e;
      const full = win.x0 === 0 && win.y0 === 0 && win.x1 === e.w && win.y1 === e.h;
      const source = {
        widthPx: e.w,
        heightPx: e.h,
        window: [win.x0, win.y0, win.x1, win.y1] as [number, number, number, number],
        scale: outW / (win.x1 - win.x0),
      };
      let img: { data: Uint8Array | Uint8ClampedArray; width: number; height: number; channels: 1 | 3 | 4 };
      if (e.big) {
        const src = e.big.source;
        const rs = new AreaResampler(win.x1 - win.x0, win.y1 - win.y0, outW, outH, src.channels);
        try {
          await src.read(win.y0, win.y1, win.x0, win.x1, (_y, row) => rs.push(row));
          img = rs.finish();
        } catch (err) {
          if (err instanceof RowsUnsupported)
            throw corruptInput(`${where}: an embedded image (${e.w} × ${e.h} px) does not decode: ${err.message}`);
          throw err;
        }
      } else {
        const px = decoded.has(e.q) ? decoded.get(e.q)! : await pixelsOf(page, p);
        const r = px ? rasterFromPdfjs(px, p.ctm, p.op) : null;
        if (!r) {
          warnings.push(`page ${pi + 1}: image op ${p.op} has no decodable pixels`);
          continue;
        }
        if (r.width !== e.w || r.height !== e.h) {
          warnings.push(`page ${pi + 1}: image op ${p.op} decoded at another size — not traced`);
          continue;
        }
        img = full && outW === e.w && outH === e.h ? r : resampleInMemory(r, win, outW, outH);
      }
      images.push({
        ...img,
        pxToPage: full && outW === e.w && outH === e.h ? e.pxToPage : compose(e.pxToPage, windowAffine(win, outW, outH)),
        op: p.op,
        ...(full && outW === e.w && outH === e.h ? {} : { source }),
      });
    }
    decoded.clear();
    const input: RasterPageInput = {
      file: file.id,
      page: pi,
      widthMm,
      heightMm,
      images,
    };
    const t = tracePageSync(input, null, cfg.trace, rasterId);
    rasterId += images.length;
    images.length = 0;
    page.cleanup();
    raw.push(t.page);
    stats.push(t.stats);
    cfg.progress?.(n + 1, wanted.length, `page ${pi + 1}`);
  }
  const numPages = pdf.numPages;
  await pdf.destroy();
  // an oversized image that never showed up as a placeholder paint (an operator form we do not
  // read, or one we did not recognise) when every page was read: refused as before — a part of
  // the scan is never silently missing (an unused image resource is refused too)
  const missing = [...plan.byDims.values()].filter((b) => !matched.has(b));
  if (missing.length && new Set(wanted).size === numPages)
    throw inputTooLarge(oversizedPdfImagesMessage(missing));
  return finish(
    {
      id: file.id,
      name: file.name,
      bytes: file.bytes.byteLength,
      sha256: sha,
      kind: 'raster',
      pages: numPages,
      producer,
    },
    raw,
    stats,
    cfg,
    warnings,
  );
}

/** The contract's ExtractFn for raster PDFs. */
export const extractRasterPdf: ExtractFn = async (file, opts, progress) =>
  (await extractRasterPdfDetailed(file, opts, { progress })).doc;

/** One scanned image (PNG/JPG) = one page. */
export async function extractRasterImageDetailed(
  file: { id: string; name: string; bytes: ArrayBuffer },
  _opts: ExtractOpts,
  cfg: RasterExtractConfig = {},
): Promise<RasterExtractResult> {
  const sha = await sha256Hex(file.bytes);
  const warnings: string[] = [];
  const declared = declaredDpi(file.bytes);
  let dpi = cfg.dpi ?? (declared ? (declared.x + declared.y) / 2 : 0);
  if (declared && Math.abs(declared.x - declared.y) > 0.5) {
    warnings.push(
      `declared DPI is anisotropic (${declared.x}×${declared.y}); using the mean before calibration`,
    );
  }
  if (!dpi) {
    dpi = 300;
    warnings.push(
      'no DPI in the file and none given: assuming 300 dpi until the square calibrates',
    );
  }
  const img = await (cfg.decode ?? decodeWithBitmap)(file.bytes);
  // C5: the header was checked before decoding; the decoder's answer is checked again here, before
  // the tracer allocates a byte for it
  assertRasterPixels(img.width, img.height, file.name);
  const pxToPage = scanPlacement(img.height, dpi);
  const input: RasterPageInput = {
    file: file.id,
    page: 0,
    widthMm: (img.width * 25.4) / dpi,
    heightMm: (img.height * 25.4) / dpi,
    images: [{ ...img, pxToPage, op: 0 }],
  };
  const t = tracePageSync(input, null, cfg.trace, 0);
  input.images.length = 0;
  cfg.progress?.(1, 1, file.name);
  return finish(
    {
      id: file.id,
      name: file.name,
      bytes: file.bytes.byteLength,
      sha256: sha,
      kind: 'raster',
      pages: 1,
    },
    [t.page],
    [t.stats],
    cfg,
    warnings,
  );
}

export const extractRasterImage: ExtractFn = async (file, opts, progress) =>
  (await extractRasterImageDetailed(file, opts, { progress })).doc;
