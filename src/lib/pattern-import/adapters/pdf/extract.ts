// extractPdf (F1): one PDF → SourceDoc. Page frame = the page's view box (crop ∩ media), mm,
// y-up, origin at its lower-left; 1 pt = 25.4/72 mm exactly; nothing rescaled here (scale.ts).
//
// Conventions the IR leaves open, fixed here:
//  - `IRPath.pts` of a closed subpath does NOT repeat its first point; `closed` carries the edge
//    last → first. An open subpath that ends exactly where it began stays open (as drawn).
//  - `PathSource.op` = index of the PAINT operator (stroke/fill) in the page's pdf.js operator
//    list; `sub` = subpath index inside that path (moveTo / re count). Texts use
//    `op = operatorCount + itemIndex` so text and path provenance never collide.
//  - `Style.clip` = `<kind><opIndex>:<minX>,<minY>,<maxX>,<maxY>` — the axis-aligned box (page mm)
//    of the intersection of every clip in force (kind c = W/W*, f = form /BBox, a = annotation
//    rect). Recorded, never applied.
//  - Fill-only paths carry the FILL colour in `strokeRgb` and `widthMm: 0`.
//  - `IRPage.layers` = OCG names used on that page, in the document's OCG order.
//  - Pages with /Rotate are kept in unrotated user space (a warning names them): tiles of one
//    sheet share the native frame, which is what registration needs.

import type {
  ExtractFn,
  ExtractOpts,
  FileId,
  IRPage,
  IRRaster,
  Progress,
  SourceDoc,
} from 'lib/pattern-import/types';
import { PATIMPORT } from 'lib/pattern-import/types';

import { budgetOf } from '../budget';
import { boxArea, intersectBox, type M6 } from './geom';
import { loadPdfjs, openPdf, type PdfDocument, type PdfPage } from './pdfjs';
import { textsOf } from './text';
import { walkOperatorList, type OcResolver, type RasterPlacement } from './walk';

/** Pixels of one embedded image as pdf.js hands them over (kind: 1 gray1bpp, 2 rgb, 3 rgba). */
export type RasterPixels = {
  width: number;
  height: number;
  kind?: number;
  data?: Uint8Array | Uint8ClampedArray;
  bitmap?: unknown;
};

/**
 * The session's blob-store hook. Called once per placed raster, before the page is released.
 * Without a sink, pixels are never requested (metadata only).
 */
export type RasterSink = (raster: IRRaster, pixels: RasterPixels | null) => void | Promise<void>;

export type ExtractPdfDeps = { rasterSink?: RasterSink };

export const DEFAULT_EXTRACT_OPTS: ExtractOpts = {
  sagittaMm: PATIMPORT.sagittaMm,
  keepFills: true,
};

async function sha256Hex(bytes: ArrayBuffer): Promise<string> {
  const d = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(d), (b) => b.toString(16).padStart(2, '0')).join('');
}

async function ocResolverOf(doc: PdfDocument): Promise<{ resolve: OcResolver; order: string[] }> {
  const names = new Map<string, string>();
  try {
    const cfg = await doc.getOptionalContentConfig();
    const groups = cfg?.getGroups?.() as Record<string, { name?: string | null }> | null;
    if (groups) for (const [id, g] of Object.entries(groups)) names.set(id, g?.name ?? id);
  } catch {
    // No /OCProperties → no layers.
  }
  const order: string[] = [];
  for (const n of names.values()) if (!order.includes(n)) order.push(n);
  const nameOf = (id: unknown): string | null =>
    typeof id === 'string' ? names.get(id) ?? id : null;
  const resolve: OcResolver = (props) => {
    if (!props || typeof props !== 'object') return null;
    const p = props as { type?: string; id?: unknown; ids?: unknown[]; expression?: unknown };
    if (p.type === 'OCG') return nameOf(p.id);
    const ids: string[] = [];
    if (Array.isArray(p.ids)) for (const id of p.ids) if (typeof id === 'string') ids.push(id);
    if (!ids.length && p.expression) {
      const walk = (e: unknown) => {
        if (typeof e === 'string') {
          if (names.has(e)) ids.push(e);
        } else if (Array.isArray(e)) e.forEach(walk);
      };
      walk(p.expression);
    }
    const ns = ids.map(nameOf).filter((n): n is string => !!n);
    return ns.length ? [...new Set(ns)].join(' + ') : null;
  };
  return { resolve, order };
}

function pixelsOf(page: PdfPage, r: RasterPlacement): Promise<RasterPixels | null> {
  if (!r.objId) {
    const img = r.inline as RasterPixels | undefined;
    return Promise.resolve(img && typeof img.width === 'number' ? img : null);
  }
  const id = r.objId;
  const store = (id.startsWith('g_') ? page.commonObjs : page.objs) as unknown as {
    has(id: string): boolean;
    get(id: string, cb?: (v: unknown) => void): unknown;
  };
  return new Promise((res) => {
    try {
      if (store.has(id)) res((store.get(id) as RasterPixels) ?? null);
      else store.get(id, (v) => res((v as RasterPixels) ?? null));
    } catch {
      res(null);
    }
  });
}

export async function extractPdfWith(
  file: { id: FileId; name: string; bytes: ArrayBuffer },
  opts: ExtractOpts,
  progress?: Progress,
  deps: ExtractPdfDeps = {},
): Promise<SourceDoc> {
  const pdfjs = await loadPdfjs();
  const OPS = pdfjs.OPS as unknown as Record<string, number>;
  const sha256 = await sha256Hex(file.bytes);
  const doc = await openPdf(file.bytes);
  const warnings: string[] = [];
  const budget = budgetOf(opts);
  try {
    let producer: string | undefined;
    try {
      const meta = await doc.getMetadata();
      const info = meta.info as { Producer?: string; Creator?: string } | undefined;
      producer = [info?.Creator, info?.Producer].filter(Boolean).join(' / ') || undefined;
    } catch {
      // Metadata is optional.
    }
    const { resolve, order } = await ocResolverOf(doc);
    const pageList = (opts.pages ?? Array.from({ length: doc.numPages }, (_, i) => i)).filter(
      (p) => p >= 0 && p < doc.numPages,
    );
    const sagitta = opts.sagittaMm > 0 ? opts.sagittaMm : PATIMPORT.sagittaMm;
    const pages: IRPage[] = [];
    let rasterId = 0;
    for (let k = 0; k < pageList.length; k++) {
      const p = pageList[k];
      progress?.(k, pageList.length, `page ${p + 1}/${doc.numPages}`);
      const page = await doc.getPage(p + 1);
      try {
        const [vx0, vy0, vx1, vy1] = page.view;
        const PT = PATIMPORT.ptToMm;
        const base: M6 = [PT, 0, 0, PT, -vx0 * PT, -vy0 * PT];
        const widthMm = (vx1 - vx0) * PT;
        const heightMm = (vy1 - vy0) * PT;
        if (page.rotate)
          warnings.push(`page ${p + 1}: /Rotate ${page.rotate} — kept in unrotated user space`);
        const ol = await page.getOperatorList();
        // C4: the operators are paid for before they are walked, the points while they are made
        budget.spend(ol.fnArray.length, `the drawing operators of page ${p + 1}`);
        const w = walkOperatorList(ol, {
          ops: OPS,
          file: file.id,
          page: p,
          base,
          sagittaMm: sagitta,
          keepFills: opts.keepFills,
          ocName: resolve,
          budget,
        });
        const tc = await page.getTextContent();
        budget.spend(tc.items.length, `the text items of page ${p + 1}`);
        const texts = textsOf(tc.items, base, w.textRuns, file.id, p, ol.fnArray.length);
        for (const t of texts) if (t.layer) w.layersUsed.add(t.layer);

        const pageBox = { minX: 0, minY: 0, maxX: widthMm, maxY: heightMm };
        const pageArea = widthMm * heightMm;
        const rasters: IRRaster[] = [];
        for (const r of w.rasters) {
          let px: RasterPixels | null = null;
          let { widthPx, heightPx } = r;
          if (deps.rasterSink || !widthPx || !heightPx) {
            px = await pixelsOf(page, r);
            if (px) {
              widthPx = widthPx || px.width;
              heightPx = heightPx || px.height;
            }
          }
          const placedWidthMm = Math.hypot(r.m[0], r.m[1]);
          const ir: IRRaster = {
            id: rasterId++,
            page: p,
            file: file.id,
            bbox: r.bbox,
            widthPx,
            heightPx,
            dpi: placedWidthMm > 0 ? widthPx / (placedWidthMm / 25.4) : 0,
            pageCover: pageArea > 0 ? boxArea(intersectBox(pageBox, r.bbox)) / pageArea : 0,
          };
          rasters.push(ir);
          if (deps.rasterSink) await deps.rasterSink(ir, px);
        }
        pages.push({
          file: file.id,
          page: p,
          widthMm,
          heightMm,
          styles: w.styles,
          paths: w.paths.map((path, id) => ({ id, ...path })),
          texts,
          rasters,
          layers: order.filter((n) => w.layersUsed.has(n)),
        });
      } finally {
        page.cleanup();
      }
    }
    progress?.(pageList.length, pageList.length);
    return {
      file: {
        id: file.id,
        name: file.name,
        bytes: file.bytes.byteLength,
        sha256,
        kind: 'pdf',
        pages: doc.numPages,
        producer,
      },
      pages,
      warnings,
    };
  } finally {
    await doc.destroy();
  }
}

/** The contract's ExtractFn: metadata-only rasters (no blob store). */
export const extractPdf: ExtractFn = (file, opts, progress) => extractPdfWith(file, opts, progress);
