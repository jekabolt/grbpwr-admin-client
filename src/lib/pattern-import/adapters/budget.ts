// C4 · Bounded work for the adapters. One `WorkBudget` per read of the session's files (the
// session hands it in `ExtractOpts.budget`; a caller without one gets a budget per file): every
// point an adapter emits, every PDF operator and every SVG element it visits spends one unit, so a
// hostile or broken file (a `<use>` fan-out, a million arcs of a 25 m radius, a page of operators)
// is refused with a typed error instead of filling the worker. `assertFiniteDoc` is the output
// boundary: a coordinate that is not a finite number (`1e309` parses to Infinity) refuses the file.
//
// Adapters cannot import the worker's `ImportError` (worker graph): the errors are NAMED, and
// worker/errors.ts maps the names to wire codes ('InputTooLarge' → too-large, 'CorruptInput' →
// corrupt), so the wizard says them like every other refusal.
import type { SourceDoc, WorkBudgetLike } from '../types';
import { PATIMPORT } from '../types';

/** A refusal of the input's size or complexity (wire code `too-large`). */
export function inputTooLarge(message: string): Error {
  const e = new Error(message);
  e.name = 'InputTooLarge';
  return e;
}

/** A refusal of damaged content (wire code `corrupt`). */
export function corruptInput(message: string): Error {
  const e = new Error(message);
  e.name = 'CorruptInput';
  return e;
}

const millions = (n: number) => `${+(n / 1e6).toFixed(1)} million`;

export class WorkBudget implements WorkBudgetLike {
  used = 0;
  constructor(readonly limit: number = PATIMPORT.maxWorkUnits) {}
  spend(units: number, what: string): void {
    this.used += units;
    if (this.used > this.limit)
      throw inputTooLarge(
        `the drawing is too complex for the browser: ${what} take more than ${millions(this.limit)} points and drawing steps in this import. Export only the pattern pieces (no fills, hatching, photos or repeated symbols), or import fewer files at once.`,
      );
  }
}

/** The run's budget, or a fresh one for a caller that brought none. */
export const budgetOf = (opts: { budget?: WorkBudgetLike } | undefined): WorkBudgetLike =>
  opts?.budget ?? new WorkBudget();

const finite = (v: number) => typeof v === 'number' && Number.isFinite(v);

/** Every number an adapter hands on is finite; else the file is refused as damaged. */
export function assertFiniteDoc(doc: SourceDoc): void {
  for (const pg of doc.pages) {
    const where = `page ${pg.page + 1}`;
    if (!finite(pg.widthMm) || !finite(pg.heightMm))
      throw nonFinite(`${where}: the page size`, pg.widthMm, pg.heightMm);
    for (const p of pg.paths)
      for (const q of p.pts)
        if (!finite(q.x) || !finite(q.y))
          throw nonFinite(`${where}: a line (drawing step ${p.src.op})`, q.x, q.y);
    for (const t of pg.texts) {
      const b = t.bbox;
      if (
        !finite(t.anchor.x) ||
        !finite(t.anchor.y) ||
        !finite(t.fontSizeMm) ||
        !finite(b.minX) ||
        !finite(b.minY) ||
        !finite(b.maxX) ||
        !finite(b.maxY)
      )
        throw nonFinite(`${where}: the text «${t.text.slice(0, 24)}»`, t.anchor.x, t.anchor.y);
    }
    for (const r of pg.rasters ?? []) {
      const b = r.bbox;
      if (!finite(b.minX) || !finite(b.minY) || !finite(b.maxX) || !finite(b.maxY))
        throw nonFinite(`${where}: an embedded image`, b.minX, b.minY);
    }
  }
}

function nonFinite(what: string, x: number, y: number): Error {
  return corruptInput(
    `${what} has a coordinate that is not a finite number (${x}, ${y}) — a value like 1e309 overflows. The file is damaged or was written by a broken exporter: export it again.`,
  );
}

const RASTER_HINT =
  'Scan at 150 dpi (A1 and smaller) or 200 dpi (A2 and smaller), or split an A0 sheet into parts.';
const megapixels = (px: number) => `${Math.round(px / 1e6)} megapixels`;

/** C5: the refusal of a scan with more pixels than the tracer may hold (worker/limits.ts). */
export function rasterPixelsMessage(width: number, height: number, name: string): string {
  return `${name} is ${width} × ${height} px (${megapixels(width * height)}); the importer traces scans up to ${megapixels(PATIMPORT.maxRasterPixels)}. ${RASTER_HINT}`;
}

/** Throws the typed refusal when decoded pixels exceed the limit — before any work buffer. */
export function assertRasterPixels(width: number, height: number, name: string): void {
  if (!(width > 0) || !(height > 0) || width * height > PATIMPORT.maxRasterPixels)
    throw inputTooLarge(rasterPixelsMessage(width, height, name));
}

/** The same limit for all images of one PDF page together (they are traced together). */
export function assertRasterPagePixels(pixels: number, where: string): void {
  if (pixels > PATIMPORT.maxRasterPixels)
    throw inputTooLarge(
      `${where}: its scanned images hold ${megapixels(pixels)}; the importer traces up to ${megapixels(PATIMPORT.maxRasterPixels)} per page. ${RASTER_HINT}`,
    );
}

/**
 * C5 follow-up: image XObjects of a PDF larger than the raster limit, read off the raw bytes. The
 * pdf.js guard (`maxImageSize`) drops such an image without a trace — its paint operator never
 * reaches the walkers — so a scan PDF at 300 dpi would import as an empty page. An image is a
 * stream, so its dictionary is never inside an object stream: `/Subtype /Image` with `/Width` /
 * `/Height` between the object header and its `stream` keyword.
 *
 * F14 R8 / S2: a size may be indirect (`/Width 12 0 R`). Such a reference is resolved from an
 * index of EVERY plain integer object written uncompressed (`12 0 obj 6000 endobj`, the last
 * definition wins), built in one linear pass on the first indirect size — no per-lookup cap that
 * a file could exhaust with decoy images. A size that still cannot be read (the integer inside a
 * compressed object stream, odd syntax) is counted in `unknown`; the readers refuse such a file
 * (`unreadablePdfImagesMessage`).
 */
export function pdfImageScan(
  bytes: ArrayBuffer,
  max: number = PATIMPORT.maxRasterPixels,
): { oversized: { width: number; height: number }[]; unknown: number } {
  const u = new Uint8Array(bytes);
  const out: { width: number; height: number }[] = [];
  let unknown = 0;
  const IMG = [0x2f, 0x49, 0x6d, 0x61, 0x67, 0x65]; // "/Image"
  const word = (c: number) =>
    (c >= 0x30 && c <= 0x39) || (c >= 0x41 && c <= 0x5a) || (c >= 0x61 && c <= 0x7a);
  // pass 1: every image's size, direct or as a reference "num gen"
  type Size = number | string | null;
  const sizeOf = (dict: string, key: string): Size => {
    const ref = new RegExp(`/${key}\\s+(\\d+)\\s+(\\d+)\\s+R(?![A-Za-z0-9])`).exec(dict);
    if (ref) return `${+ref[1]} ${+ref[2]}`;
    const direct = new RegExp(`/${key}\\s+(\\d+)(?![\\d.])`).exec(dict);
    return direct ? +direct[1] : null;
  };
  const images: [Size, Size][] = [];
  for (let i = u.indexOf(0x2f); i !== -1 && i + 6 < u.length; i = u.indexOf(0x2f, i + 1)) {
    let hit = true;
    for (let k = 1; k < 6 && hit; k++) hit = u[i + k] === IMG[k];
    if (!hit || word(u[i + 6])) continue; // /ImageB, /ImageMask …
    const a = Math.max(0, i - 2048);
    const head = latin1Of(u.subarray(a, i));
    const tail = latin1Of(u.subarray(i, Math.min(u.length, i + 2048)));
    if (!/\/Subtype\s*$/.test(head)) continue;
    const from = Math.max(head.lastIndexOf(' obj'), head.lastIndexOf('\nobj'), 0);
    const to = tail.indexOf('stream');
    const dict = head.slice(from) + (to === -1 ? tail : tail.slice(0, to));
    images.push([sizeOf(dict, 'Width'), sizeOf(dict, 'Height')]);
  }
  // pass 2 (only when a size is indirect): ONE linear pass indexing the referenced integers
  const refs = new Set(images.flat().filter((x): x is string => typeof x === 'string'));
  const ints = refs.size ? plainIntObjects(u, refs) : new Map<string, number>();
  const value = (x: Size) => (typeof x === 'string' ? ints.get(x) ?? null : x);
  for (const [w, h] of images) {
    const width = value(w);
    const height = value(h);
    if (width == null || height == null) {
      unknown++;
      continue;
    }
    if (width * height > max) out.push({ width, height });
  }
  return { oversized: out, unknown };
}

/** The oversized images only (see `pdfImageScan`). */
export function oversizedPdfImages(
  bytes: ArrayBuffer,
  max: number = PATIMPORT.maxRasterPixels,
): { width: number; height: number }[] {
  return pdfImageScan(bytes, max).oversized;
}

const isWs = (c: number) =>
  c === 0x20 || c === 0x0a || c === 0x0d || c === 0x09 || c === 0x0c || c === 0x00;
const isDigit = (c: number) => c >= 0x30 && c <= 0x39;
const isAlnum = (c: number) => isDigit(c) || (c >= 0x41 && c <= 0x5a) || (c >= 0x61 && c <= 0x7a);
const ENDOBJ = [0x65, 0x6e, 0x64, 0x6f, 0x62, 0x6a]; // "endobj"

/**
 * F14 S2: the `wanted` `num gen obj <integer> endobj` written uncompressed, keyed `"num gen"`, in ONE
 * forward pass over the bytes (each "obj" keyword looks back over at most two ≤ 10-digit numbers
 * and their whitespace, forward over one ≤ 15-digit integer — O(bytes)). A later definition
 * overrides an earlier one, as an incremental update does.
 */
function plainIntObjects(u: Uint8Array, wanted: ReadonlySet<string>): Map<string, number> {
  const out = new Map<string, number>();
  const n = u.length;
  const numAt = (a: number, b: number) => {
    let v = 0;
    for (let k = a; k < b; k++) v = v * 10 + (u[k] - 0x30);
    return v;
  };
  for (let i = 1; i + 2 < n; i++) {
    if (u[i] !== 0x6f || u[i + 1] !== 0x62 || u[i + 2] !== 0x6a) continue; // "obj"
    if (i + 3 < n && isAlnum(u[i + 3])) continue; // "objx"
    // back: ws+ gen ws+ num, preceded by a non-word byte
    let j = i - 1;
    if (j < 0 || !isWs(u[j])) continue;
    let w = 0;
    while (j >= 0 && isWs(u[j]) && w++ < 16) j--;
    const genEnd = j + 1;
    while (j >= 0 && isDigit(u[j]) && genEnd - j <= 10) j--;
    const genStart = j + 1;
    if (genStart === genEnd || (j >= 0 && !isWs(u[j]))) continue;
    w = 0;
    while (j >= 0 && isWs(u[j]) && w++ < 16) j--;
    const numEnd = j + 1;
    while (j >= 0 && isDigit(u[j]) && numEnd - j <= 10) j--;
    const numStart = j + 1;
    if (numStart === numEnd || (j >= 0 && isAlnum(u[j]))) continue;
    // forward: ws* integer ws* endobj
    let k = i + 3;
    w = 0;
    while (k < n && isWs(u[k]) && w++ < 16) k++;
    const vStart = k;
    while (k < n && isDigit(u[k]) && k - vStart < 15) k++;
    if (k === vStart || (k < n && isDigit(u[k]))) continue;
    const value = numAt(vStart, k);
    w = 0;
    while (k < n && isWs(u[k]) && w++ < 16) k++;
    let end = k + ENDOBJ.length <= n;
    for (let q = 0; q < ENDOBJ.length && end; q++) end = u[k + q] === ENDOBJ[q];
    if (!end) continue;
    const key = `${numAt(numStart, numEnd)} ${numAt(genStart, genEnd)}`;
    if (wanted.has(key)) out.set(key, value);
  }
  return out;
}

function latin1Of(u: Uint8Array): string {
  let s = '';
  for (let i = 0; i < u.length; i++) s += String.fromCharCode(u[i]);
  return s;
}

/**
 * F14 R8 / S2: images whose pixel size the raw scan cannot read even with every plain integer
 * object indexed. pdf.js reads them and silently drops one over the limit, so the importer cannot
 * tell a logo from a 300 dpi scan — such a file is refused (both PDF readers), never imported with
 * a hole where the scan was.
 */
export function unreadablePdfImagesMessage(n: number): string {
  return `${n === 1 ? 'an embedded image' : `${n} embedded images`} ${n === 1 ? 'has' : 'have'} a pixel size the importer cannot read before decoding (stored in a compressed part of the PDF), so ${n === 1 ? 'it' : 'they'} may exceed the ${megapixels(PATIMPORT.maxRasterPixels)} the importer traces and would be dropped without a trace. Export the PDF again (PDF 1.4, no object compression) or remove the images. ${RASTER_HINT}`;
}

/** The refusal / note for oversized PDF images (same dpi guidance as a scan file). */
export function oversizedPdfImagesMessage(imgs: { width: number; height: number }[]): string {
  const big = [...imgs].sort((a, b) => b.width * b.height - a.width * a.height)[0];
  return `${imgs.length === 1 ? 'an embedded image' : `${imgs.length} embedded images`} (${big.width} × ${big.height} px, ${megapixels(big.width * big.height)}) ${imgs.length === 1 ? 'exceeds' : 'exceed'} the ${megapixels(PATIMPORT.maxRasterPixels)} the importer traces and ${imgs.length === 1 ? 'is' : 'are'} not read. ${RASTER_HINT}`;
}
