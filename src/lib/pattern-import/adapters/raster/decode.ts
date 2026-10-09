// Getting pixels, worker-safe (F11).
//
// Raster PDF: walk the operator list for image paints and take the DECODED image straight from
// pdf.js (`page.objs`, raw RGB/RGBA/1-bpp data with isOffscreenCanvasSupported:false) — native
// resolution, no rendering, no canvas. Image files (PNG/JPG scans): createImageBitmap +
// OffscreenCanvas in the worker, or an injected decoder in node probes. DPI comes from the file
// (PNG pHYs, JPEG JFIF density) unless the caller overrides it.
//
// pdf.js loading duplicates F1's `adapters/pdf/pdfjs.ts` settings on purpose (the contract forbids
// reaching into pdf adapter internals); swap for its export when F1 lands.

import type * as Pdfjs from 'pdfjs-dist';

import type { Affine } from '../../types';
import { PATIMPORT } from '../../types';
import { compose } from './affine';
import type { RasterImage } from './types';

export type PdfjsModule = typeof Pdfjs;
type PdfPage = Pdfjs.PDFPageProxy;

let loader: () => Promise<PdfjsModule> = async () => {
  const pdfjs = await import('pdfjs-dist');
  if (!pdfjs.GlobalWorkerOptions.workerSrc) {
    pdfjs.GlobalWorkerOptions.workerSrc = new URL(
      'pdfjs-dist/build/pdf.worker.min.mjs',
      import.meta.url,
    ).toString();
  }
  return pdfjs;
};
let cached: Promise<PdfjsModule> | null = null;

/** Node probes inject the legacy build. */
export function setRasterPdfjsLoader(load: () => Promise<PdfjsModule>): void {
  loader = load;
  cached = null;
}

export function loadRasterPdfjs(): Promise<PdfjsModule> {
  if (!cached) cached = loader();
  return cached;
}

export async function openRasterPdf(bytes: ArrayBuffer): Promise<Pdfjs.PDFDocumentProxy> {
  const pdfjs = await loadRasterPdfjs();
  return pdfjs.getDocument({
    data: new Uint8Array(bytes.slice(0)),
    verbosity: 0,
    disableFontFace: true,
    isEvalSupported: false,
    isOffscreenCanvasSupported: false,
    isImageDecoderSupported: false,
    useSystemFonts: false,
    stopAtErrors: false,
  }).promise;
}

type M6 = [number, number, number, number, number, number];
const mul = (a: M6, b: M6): M6 => [
  a[0] * b[0] + a[2] * b[1],
  a[1] * b[0] + a[3] * b[1],
  a[0] * b[2] + a[2] * b[3],
  a[1] * b[2] + a[3] * b[3],
  a[0] * b[4] + a[2] * b[5] + a[4],
  a[1] * b[4] + a[3] * b[5] + a[5],
];

export type ImagePaint = {
  op: number;
  ctm: M6;
  objId: string | null;
  inline: unknown;
  w: number;
  h: number;
};

/** Image paints of one page with their CTM (image unit square → user space, pt, y-up). */
export async function imagePaintsOf(pdfjs: PdfjsModule, page: PdfPage): Promise<ImagePaint[]> {
  const { OPS } = pdfjs;
  const ol = await page.getOperatorList();
  let ctm: M6 = [1, 0, 0, 1, 0, 0];
  const stack: M6[] = [];
  const out: ImagePaint[] = [];
  for (let i = 0; i < ol.fnArray.length; i++) {
    const fn = ol.fnArray[i];
    const a = ol.argsArray[i] as unknown[];
    switch (fn) {
      case OPS.save:
        stack.push(ctm);
        break;
      case OPS.restore:
        ctm = stack.pop() ?? ctm;
        break;
      case OPS.transform:
        ctm = mul(ctm, a as unknown as M6);
        break;
      case OPS.paintFormXObjectBegin:
        stack.push(ctm);
        if (Array.isArray(a[0])) ctm = mul(ctm, a[0] as M6);
        break;
      case OPS.paintFormXObjectEnd:
        ctm = stack.pop() ?? ctm;
        break;
      case OPS.paintImageXObject:
        out.push({
          op: i,
          ctm,
          objId: String(a[0]),
          inline: null,
          w: Number(a[1]),
          h: Number(a[2]),
        });
        break;
      case OPS.paintInlineImageXObject:
        out.push({ op: i, ctm, objId: null, inline: a[0], w: 0, h: 0 });
        break;
      default:
        break;
    }
  }
  return out;
}

type PdfjsImage = {
  width: number;
  height: number;
  kind?: number;
  data?: Uint8Array | Uint8ClampedArray;
};

export function pixelsOf(page: PdfPage, p: ImagePaint): Promise<PdfjsImage | null> {
  if (!p.objId) return Promise.resolve((p.inline as PdfjsImage) ?? null);
  const id = p.objId;
  const store = (id.startsWith('g_') ? page.commonObjs : page.objs) as unknown as {
    has(id: string): boolean;
    get(id: string, cb?: (v: unknown) => void): unknown;
  };
  return new Promise((res) => {
    try {
      if (store.has(id)) res((store.get(id) as PdfjsImage) ?? null);
      else store.get(id, (v) => res((v as PdfjsImage) ?? null));
    } catch {
      res(null);
    }
  });
}

/**
 * pdf.js image → RasterImage. kind 1 = GRAYSCALE_1BPP (bit-packed rows), 2 = RGB_24BPP,
 * 3 = RGBA_32BPP. `ctm` maps the unit square to user space (pt).
 */
export function rasterFromPdfjs(img: PdfjsImage, ctm: M6, op: number): RasterImage | null {
  const { width: w, height: h, data } = img;
  if (!data || !w || !h) return null;
  let px: Uint8Array | Uint8ClampedArray = data;
  let channels: 1 | 3 | 4;
  if (img.kind === 1) {
    const g = new Uint8Array(w * h);
    const rowBytes = (w + 7) >> 3;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const bit = (data[y * rowBytes + (x >> 3)] >> (7 - (x & 7))) & 1;
        g[y * w + x] = bit ? 255 : 0;
      }
    }
    px = g;
    channels = 1;
  } else if (img.kind === 3 || data.length === w * h * 4) channels = 4;
  else if (img.kind === 2 || data.length === w * h * 3) channels = 3;
  else return null;
  // Pixel corner (u, v) → unit square (u/w, 1 − v/h) → user space pt → mm.
  const toUnit: Affine = { a: 1 / w, b: 0, c: 0, d: -1 / h, e: 0, f: 1 };
  const user: Affine = { a: ctm[0], b: ctm[1], c: ctm[2], d: ctm[3], e: ctm[4], f: ctm[5] };
  const k = PATIMPORT.ptToMm;
  const toMm: Affine = { a: k, b: 0, c: 0, d: k, e: 0, f: 0 };
  return {
    data: px,
    width: w,
    height: h,
    channels,
    pxToPage: compose(toMm, compose(user, toUnit)),
    op,
  };
}

/** Pixel frame → page mm for a bare scan at `dpi`, y flipped so the page is y-up. */
export function scanPlacement(heightPx: number, dpi: number): Affine {
  const k = 25.4 / dpi;
  return { a: k, b: 0, c: 0, d: -k, e: 0, f: heightPx * k };
}

/** DPI declared in a PNG (pHYs, unit = metre) or JPEG (JFIF APP0 density). null = not declared. */
export function declaredDpi(bytes: ArrayBuffer): { x: number; y: number } | null {
  const b = new Uint8Array(bytes);
  const dv = new DataView(bytes);
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) {
    let off = 8;
    while (off + 8 <= b.length) {
      const len = dv.getUint32(off);
      const type = String.fromCharCode(b[off + 4], b[off + 5], b[off + 6], b[off + 7]);
      if (type === 'pHYs' && len >= 9) {
        const px = dv.getUint32(off + 8);
        const py = dv.getUint32(off + 12);
        const unit = b[off + 16];
        if (unit === 1 && px > 0 && py > 0) return { x: px * 0.0254, y: py * 0.0254 };
        return null;
      }
      if (type === 'IDAT' || type === 'IEND') return null;
      off += 12 + len;
    }
    return null;
  }
  if (b[0] === 0xff && b[1] === 0xd8) {
    let off = 2;
    while (off + 4 <= b.length && b[off] === 0xff) {
      const marker = b[off + 1];
      const len = dv.getUint16(off + 2);
      if (marker === 0xe0 && String.fromCharCode(...b.subarray(off + 4, off + 9)) === 'JFIF\0') {
        const unit = b[off + 11];
        const dx = dv.getUint16(off + 12);
        const dy = dv.getUint16(off + 14);
        if (dx > 1 && dy > 1) {
          if (unit === 1) return { x: dx, y: dy };
          if (unit === 2) return { x: dx * 2.54, y: dy * 2.54 };
        }
        return null;
      }
      if (marker === 0xda) return null;
      off += 2 + len;
    }
  }
  return null;
}

export type DecodedImage = {
  data: Uint8Array | Uint8ClampedArray;
  width: number;
  height: number;
  channels: 1 | 3 | 4;
};
export type ImageDecoder = (bytes: ArrayBuffer) => Promise<DecodedImage>;

/** Browser/worker decoder: createImageBitmap + OffscreenCanvas (RGBA). */
export const decodeWithBitmap: ImageDecoder = async (bytes) => {
  const bmp = await createImageBitmap(new Blob([bytes]));
  try {
    const cv = new OffscreenCanvas(bmp.width, bmp.height);
    const ctx = cv.getContext('2d');
    if (!ctx) throw new Error('raster: no 2d context in this worker');
    ctx.drawImage(bmp, 0, 0);
    const id = ctx.getImageData(0, 0, bmp.width, bmp.height);
    return { data: id.data, width: bmp.width, height: bmp.height, channels: 4 };
  } finally {
    bmp.close();
  }
};
