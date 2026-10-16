// RASTER · images over the pixel limit (C5 follow-up). pdf.js drops an image larger than
// `maxImageSize` without a trace (worker/pdf-guard.ts) — the paint operator never reaches us, so
// neither its pixels nor WHERE the page paints it are known. Before, such a file was refused.
//
// Now, for an image whose stream we can decode ourselves in rows (rows.ts):
//   1. a COPY of the file is opened in which that image's dictionary is rewritten in place, byte
//      length unchanged (no xref offset moves): /Width → 1, /Height → a code no real image of the
//      file has, /Filter and /DecodeParms → spaces. pdf.js then reads a 1 × code placeholder of
//      raw bytes (a few bytes) and reports its paint operator with the page's CTM — the placement;
//   2. the real pixels are decoded from the ORIGINAL stream bytes, only the window the page shows,
//      row by row, and area-resampled when the page would still exceed the limit (extract.ts).
// Anything we cannot decode exactly (progressive JPEG, CMYK, masks, /Decode, other filters,
// encryption, an indirect size) keeps the refusal, now naming the reason.

import { PATIMPORT } from '../../types';
import { type PdfImageStream, pdfImageScan, pdfImageStreams } from '../budget';
import { FlateRows, JpegRows, type RowSource, RowsUnsupported } from './rows';

export type BigImage = {
  width: number;
  height: number;
  /** The placeholder's height (its width is 1): how its paint operator is recognised. */
  code: number;
  source: RowSource;
};

export type BigImagePlan = {
  /** The bytes pdf.js opens: the file, or its copy with placeholders. */
  bytes: ArrayBuffer;
  /** Placeholder "1x<code>" → the image. */
  byDims: Map<string, BigImage>;
  /** Oversized images we cannot read, with the reason (the file is refused). */
  refused: { width: number; height: number; reason: string }[];
  /** Images whose size cannot be read at all (pdfImageScan.unknown — refused as before). */
  unknown: number;
};

const FLATE = new Set(['FlateDecode', 'Fl']);
const DCT = new Set(['DCTDecode', 'DCT']);

function components(rec: PdfImageStream, iccN: Map<string, number>): number | null {
  const cs = rec.colorSpace;
  if (cs === 'DeviceGray' || cs === 'G') return 1;
  if (cs === 'DeviceRGB' || cs === 'RGB') return 3;
  if (cs?.startsWith('icc:')) return iccN.get(cs.slice(4)) ?? null;
  return null;
}

/** A row decoder for the image, or the reason there is none. */
function sourceOf(
  u: Uint8Array,
  rec: PdfImageStream,
  iccN: Map<string, number>,
  encrypted: boolean,
): RowSource | string {
  if (encrypted) return 'the PDF is encrypted';
  if (rec.imageMask || rec.decode || rec.smask || rec.mask)
    return 'it is a mask or has a mask / decode array';
  if (!rec.filters || rec.filters.length > 1) return 'its compression is a filter chain';
  if (rec.parms === 'other') return 'its decode parameters do not read';
  const data = u.subarray(rec.data[0], rec.data[1]);
  const w = rec.width!;
  const h = rec.height!;
  const f = rec.filters[0];
  try {
    if (f && DCT.has(f)) {
      const j = new JpegRows(data, rec.parms?.ColorTransform);
      if (j.width !== w || j.height !== h)
        return `its JPEG is ${j.width} × ${j.height} px, the PDF says ${w} × ${h}`;
      const n = components(rec, iccN);
      if (n !== null && n !== j.channels) return `its JPEG has ${j.channels} colour channels, the PDF ${n}`;
      return j;
    }
    if (f === undefined || FLATE.has(f)) {
      const n = components(rec, iccN);
      if (n !== 1 && n !== 3) return `its colour space (${rec.colorSpace ?? 'none'})`;
      const bpc = rec.bpc;
      if (bpc !== 8 && !(bpc === 1 && n === 1)) return `${bpc ?? '?'} bits per sample`;
      const pr = rec.parms ?? {};
      const predictor = pr.Predictor ?? 1;
      if (predictor > 1) {
        if ((pr.Colors ?? 1) !== n || (pr.BitsPerComponent ?? 8) !== bpc || (pr.Columns ?? 1) !== w)
          return 'its predictor parameters do not match the image';
      }
      return new FlateRows(data, w, h, {
        filter: f === undefined ? 'none' : 'flate',
        colors: n,
        bpc,
        predictor,
      });
    }
    return `its compression (${f})`;
  } catch (e) {
    if (e instanceof RowsUnsupported) return e.message;
    throw e;
  }
}

const pad = (n: number, len: number) => String(n).padStart(len, '0');

/** Which oversized images can be read, and the bytes to open with their placeholders. */
export function planBigImages(
  bytes: ArrayBuffer,
  max: number = PATIMPORT.maxRasterPixels,
): BigImagePlan {
  const scan = pdfImageScan(bytes, max);
  const plan: BigImagePlan = { bytes, byDims: new Map(), refused: [], unknown: scan.unknown };
  if (!scan.oversized.length) return plan;
  const u = new Uint8Array(bytes);
  const { images, iccN, encrypted } = pdfImageStreams(bytes);
  const direct = images.filter(
    (r) => r.width !== null && r.height !== null && r.width * r.height > max && r.widthSpan && r.heightSpan,
  );
  // an oversized image the index cannot place (indirect size, a dictionary it does not read)
  const seen = new Map<string, number>();
  for (const r of direct) seen.set(`${r.width}x${r.height}`, (seen.get(`${r.width}x${r.height}`) ?? 0) + 1);
  for (const o of scan.oversized) {
    const k = `${o.width}x${o.height}`;
    const n = seen.get(k) ?? 0;
    if (n > 0) seen.set(k, n - 1);
    else plan.refused.push({ ...o, reason: 'its size is written indirectly' });
  }
  if (plan.refused.length) return plan;
  const genuine = new Set(images.map((r) => `${r.width}x${r.height}`));
  const copy = new Uint8Array(bytes.slice(0));
  let code = 1;
  for (const r of direct) {
    const src = sourceOf(u, r, iccN, encrypted);
    if (typeof src === 'string') {
      plan.refused.push({ width: r.width!, height: r.height!, reason: src });
      continue;
    }
    const [ha, hb] = r.heightSpan!;
    const [wa, wb] = r.widthSpan!;
    do code++;
    while (genuine.has(`1x${code}`));
    if (String(code).length > hb - ha) {
      plan.refused.push({ width: r.width!, height: r.height!, reason: 'no placeholder fits its height' });
      continue;
    }
    const put = (at: number, s: string) => {
      for (let k = 0; k < s.length; k++) copy[at + k] = s.charCodeAt(k);
    };
    put(wa, pad(1, wb - wa));
    put(ha, pad(code, hb - ha));
    for (const sp of [r.filterSpan, r.parmsSpan]) if (sp) copy.fill(0x20, sp[0], sp[1]);
    plan.byDims.set(`1x${code}`, { width: r.width!, height: r.height!, code, source: src });
  }
  if (!plan.refused.length) plan.bytes = copy.buffer;
  return plan;
}

/** The refusal of oversized images we cannot read (the old message + why). */
export function bigImagesRefusal(refused: BigImagePlan['refused']): string {
  const big = [...refused].sort((a, b) => b.width * b.height - a.width * a.height)[0];
  const mp = (px: number) => `${Math.round(px / 1e6)} megapixels`;
  return `${refused.length === 1 ? 'an embedded image' : `${refused.length} embedded images`} (${big.width} × ${big.height} px, ${mp(big.width * big.height)}) ${refused.length === 1 ? 'exceeds' : 'exceed'} the ${mp(PATIMPORT.maxRasterPixels)} the importer decodes at once and cannot be read in parts: ${big.reason}. Scan at 150 dpi (A1 and smaller) or 200 dpi (A2 and smaller), or split an A0 sheet into parts.`;
}
