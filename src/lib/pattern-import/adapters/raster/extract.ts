// Raster sources → SourceDoc (F11): raster PDFs (page by page, ≤ one page of pixels alive) and
// bare image scans (PNG/JPG with a declared or given DPI).

import type { ExtractFn, ExtractOpts, IRPage, Progress, SourceDoc, Style } from '../../types';
import { PATIMPORT } from '../../types';
import { applyCalibration, calibrate } from './calibrate';
import {
  decodeWithBitmap,
  declaredDpi,
  imagePaintsOf,
  loadRasterPdfjs,
  type ImageDecoder,
  openRasterPdf,
  pixelsOf,
  rasterFromPdfjs,
  scanPlacement,
} from './decode';
import { compose } from './affine';
import { tracePageSync } from './trace';
import type {
  RasterCalibration,
  RasterImage,
  RasterPageInput,
  RasterRef,
  TraceOpts,
  TraceStats,
} from './types';

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

/** Raster PDF, one page of pixels at a time. */
export async function extractRasterPdfDetailed(
  file: { id: string; name: string; bytes: ArrayBuffer },
  opts: ExtractOpts,
  cfg: RasterExtractConfig = {},
): Promise<RasterExtractResult> {
  const sha = await sha256Hex(file.bytes);
  const pdf = await openRasterPdf(file.bytes);
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
  for (let n = 0; n < wanted.length; n++) {
    const pi = wanted[n];
    const page = await pdf.getPage(pi + 1);
    const [vx0, vy0, vx1, vy1] = page.view;
    const k = PATIMPORT.ptToMm;
    const shift = { a: 1, b: 0, c: 0, d: 1, e: -vx0 * k, f: -vy0 * k };
    const paints = await imagePaintsOf(lib, page);
    const images: RasterImage[] = [];
    for (const p of paints) {
      const px = await pixelsOf(page, p);
      const r = px ? rasterFromPdfjs(px, p.ctm, p.op) : null;
      if (r) images.push({ ...r, pxToPage: compose(shift, r.pxToPage) });
      else warnings.push(`page ${pi + 1}: image op ${p.op} has no decodable pixels`);
    }
    const input: RasterPageInput = {
      file: file.id,
      page: pi,
      widthMm: (vx1 - vx0) * k,
      heightMm: (vy1 - vy0) * k,
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
