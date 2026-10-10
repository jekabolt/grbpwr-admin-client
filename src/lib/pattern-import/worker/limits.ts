// Input guards (M6) — what the importer refuses BEFORE it reads anything, with a message the
// operator can act on. Pure functions over names, sizes and header bytes: the main thread runs
// `checkInputSet` on the File objects before `File.arrayBuffer()` (a 1 GB scan must not reach the
// tab's memory), the worker runs it again on the bytes it received, and the image-header reader
// refuses a scan whose pixels would not fit in the worker before anything is decoded.
//
// Main-thread safe: imports `types.ts` and the pure adapters/budget.ts only.
import { rasterPixelsMessage } from '../adapters/budget';
import { PATIMPORT } from '../types';

export type InputRefusal = { code: 'too-large' | 'unsupported-format'; message: string };

const mb = (n: number) => `${(n / 1048576).toFixed(n < 10 * 1048576 ? 1 : 0)} MB`;

/** Files of one run: count and total size. null = fine. */
export function checkInputSet(
  files: readonly { name: string; bytes: number }[],
): InputRefusal | null {
  if (files.length > PATIMPORT.maxInputFiles)
    return {
      code: 'too-large',
      message: `${files.length} files; the importer reads at most ${PATIMPORT.maxInputFiles} files in one run. Import one model (or one size range) per run.`,
    };
  const total = files.reduce((a, f) => a + f.bytes, 0);
  if (total > PATIMPORT.maxInputBytes) {
    const biggest = [...files].sort((a, b) => b.bytes - a.bytes)[0];
    return {
      code: 'too-large',
      message: `${files.length === 1 ? biggest.name : `these ${files.length} files`} ${files.length === 1 ? 'is' : 'are'} ${mb(total)}; the importer reads at most ${mb(PATIMPORT.maxInputBytes)} per run. ${
        files.length > 1
          ? `Import fewer files at once (the largest is ${biggest.name}, ${mb(biggest.bytes)}).`
          : 'Export only the pattern pages (no photos or instructions), or scan at 200–300 dpi.'
      }`,
    };
  }
  return null;
}

/**
 * Bytes of ONE per-size DXF set, all files together (R4). The set is held several times over while
 * it is merged (the files, their text, the tag arrays of the merger, the merged text and bytes, then
 * the reader's own decode of the merged drawing), so it gets a tighter cap than a single file's
 * `maxInputBytes`. 64 MB is ~100× the corpus: a per-size CLO export of a whole coat is 0.1–0.6 MB,
 * and 6 million lines (`maxDxfLines`, the bound on the merged drawing) are ~60 MB of DXF.
 */
export const DXF_SET_MAX_BYTES = 64 * 1024 * 1024;

/** A per-size DXF set heavier than `DXF_SET_MAX_BYTES`. null = fine. */
export function dxfSetBytesRefusal(
  files: readonly { name: string; bytes: number }[],
): InputRefusal | null {
  const total = files.reduce((a, f) => a + f.bytes, 0);
  if (total <= DXF_SET_MAX_BYTES) return null;
  const biggest = [...files].sort((a, b) => b.bytes - a.bytes)[0];
  return {
    code: 'too-large',
    message: `these ${files.length} DXF files are ${mb(total)} together; a set of sizes is merged up to ${mb(DXF_SET_MAX_BYTES)} (the largest is ${biggest.name}, ${mb(biggest.bytes)}). Export only the pattern pieces, one size per file.`,
  };
}

/** A PDF with more pages than the importer reads. */
export function pdfPagesRefusal(
  pages: number,
  name = 'the PDF',
  max: number = PATIMPORT.maxPdfPages,
): InputRefusal | null {
  if (pages <= max) return null;
  return {
    code: 'too-large',
    message: `${name} has ${pages} pages; the importer reads at most ${max}. Print the pattern pages to a new PDF (the instructions and the cover are not needed) and import that.`,
  };
}

/**
 * Pixel size of an image from its header (PNG, JPEG, GIF, BMP, WebP, TIFF) — no decoding. null when
 * the header is not one of these or is unreadable. The whole file is searched (C5): a JPEG's SOF
 * may follow megabytes of EXIF/XMP/ICC segments and a TIFF writer often puts its IFD at the end, so
 * a window at the head would leave a big scan "unknown" — and unknown is refused, never decoded.
 */
export function imageSize(bytes: ArrayBuffer): { width: number; height: number } | null {
  const u = new Uint8Array(bytes);
  const dv = new DataView(u.buffer, u.byteOffset, u.byteLength);
  const n = u.length;
  try {
    // PNG: IHDR is the first chunk
    if (n >= 24 && u[0] === 0x89 && u[1] === 0x50 && u[2] === 0x4e && u[3] === 0x47)
      return String.fromCharCode(u[12], u[13], u[14], u[15]) === 'IHDR'
        ? { width: dv.getUint32(16), height: dv.getUint32(20) }
        : null;
    // GIF
    if (n >= 10 && u[0] === 0x47 && u[1] === 0x49 && u[2] === 0x46)
      return { width: dv.getUint16(6, true), height: dv.getUint16(8, true) };
    // BMP
    if (n >= 26 && u[0] === 0x42 && u[1] === 0x4d)
      return { width: Math.abs(dv.getInt32(18, true)), height: Math.abs(dv.getInt32(22, true)) };
    // WebP
    if (n >= 30 && u[0] === 0x52 && u[8] === 0x57 && u[9] === 0x45 && u[10] === 0x42) {
      const fourcc = String.fromCharCode(u[12], u[13], u[14], u[15]);
      if (fourcc === 'VP8X')
        return {
          width: 1 + (u[24] | (u[25] << 8) | (u[26] << 16)),
          height: 1 + (u[27] | (u[28] << 8) | (u[29] << 16)),
        };
      if (fourcc === 'VP8 ')
        return { width: dv.getUint16(26, true) & 0x3fff, height: dv.getUint16(28, true) & 0x3fff };
      if (fourcc === 'VP8L') {
        const b = dv.getUint32(21, true);
        return { width: (b & 0x3fff) + 1, height: ((b >> 14) & 0x3fff) + 1 };
      }
      return null;
    }
    // JPEG: walk the markers to the first SOFn
    if (n >= 4 && u[0] === 0xff && u[1] === 0xd8) {
      let p = 2;
      while (p + 9 < n) {
        if (u[p] !== 0xff) return null;
        const m = u[p + 1];
        if (m === 0xd8 || m === 0x01 || (m >= 0xd0 && m <= 0xd7)) {
          p += 2;
          continue;
        }
        const len = dv.getUint16(p + 2);
        if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc)
          return { height: dv.getUint16(p + 5), width: dv.getUint16(p + 7) };
        p += 2 + len;
      }
      return null;
    }
    // TIFF: first IFD, tags 256 (width) and 257 (height)
    if (n >= 8 && ((u[0] === 0x49 && u[1] === 0x49) || (u[0] === 0x4d && u[1] === 0x4d))) {
      const le = u[0] === 0x49;
      const ifd = dv.getUint32(4, le);
      if (ifd + 2 > n) return null;
      const count = dv.getUint16(ifd, le);
      let width = 0;
      let height = 0;
      for (let i = 0; i < count; i++) {
        const e = ifd + 2 + i * 12;
        if (e + 12 > n) break;
        const tag = dv.getUint16(e, le);
        const type = dv.getUint16(e + 2, le);
        const v = type === 3 ? dv.getUint16(e + 8, le) : dv.getUint32(e + 8, le);
        if (tag === 256) width = v;
        if (tag === 257) height = v;
      }
      return width && height ? { width, height } : null;
    }
  } catch {
    return null;
  }
  return null;
}

/**
 * An image file whose pixels would not fit in the worker, or whose pixel size cannot be read from
 * its header (C5: such a file is never decoded on trust). null = fine.
 */
export function imagePixelsRefusal(bytes: ArrayBuffer, name: string): InputRefusal | null {
  const s = imageSize(bytes);
  if (!s || !(s.width > 0) || !(s.height > 0))
    return {
      code: 'unsupported-format',
      message: `${name}: the image's pixel size cannot be read from its header, so it is not decoded. Save the scan again as PNG or JPG.`,
    };
  return rasterPixelsRefusal(s.width, s.height, name);
}

/**
 * Pixels the raster tracer may hold at once (C5). Measured with the raster probe's synthetic scan
 * (`yarn patimport:raster limit`: pattern outlines + a sheet-wide frame, RGBA): the worker's peak
 * grows ≈ 16 B per pixel (the RGBA pixels + strength, labels, the skeleton's crop of the largest
 * component), 345 MB at the 18 MP limit — an A0 sheet fits at 100 dpi, an A1 at 150 dpi, an A2 at
 * 200 dpi, an A3 at 300 dpi; an A0 at 300 dpi (139 MP) would need ≈ 2.2 GB and is refused.
 */
export function rasterPixelsRefusal(
  width: number,
  height: number,
  name: string,
): InputRefusal | null {
  if (width * height <= PATIMPORT.maxRasterPixels) return null;
  return { code: 'too-large', message: rasterPixelsMessage(width, height, name) };
}
