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
 * stream, so its dictionary is never inside an object stream: `/Subtype /Image` with direct
 * `/Width` / `/Height` between the object header and its `stream` keyword. Indirect sizes are not
 * resolved (rare; such an image is then only caught by the decoded-size checks).
 */
export function oversizedPdfImages(
  bytes: ArrayBuffer,
  max: number = PATIMPORT.maxRasterPixels,
): { width: number; height: number }[] {
  const u = new Uint8Array(bytes);
  const out: { width: number; height: number }[] = [];
  const IMG = [0x2f, 0x49, 0x6d, 0x61, 0x67, 0x65]; // "/Image"
  const word = (c: number) =>
    (c >= 0x30 && c <= 0x39) || (c >= 0x41 && c <= 0x5a) || (c >= 0x61 && c <= 0x7a);
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
    const w = /\/Width\s+(\d+)(?!\s+\d+\s+R)/.exec(dict);
    const h = /\/Height\s+(\d+)(?!\s+\d+\s+R)/.exec(dict);
    if (!w || !h) continue;
    const width = +w[1];
    const height = +h[1];
    if (width * height > max) out.push({ width, height });
  }
  return out;
}

function latin1Of(u: Uint8Array): string {
  let s = '';
  for (let i = 0; i < u.length; i++) s += String.fromCharCode(u[i]);
  return s;
}

/** The refusal / note for oversized PDF images (same dpi guidance as a scan file). */
export function oversizedPdfImagesMessage(imgs: { width: number; height: number }[]): string {
  const big = [...imgs].sort((a, b) => b.width * b.height - a.width * a.height)[0];
  return `${imgs.length === 1 ? 'an embedded image' : `${imgs.length} embedded images`} (${big.width} × ${big.height} px, ${megapixels(big.width * big.height)}) ${imgs.length === 1 ? 'exceeds' : 'exceed'} the ${megapixels(PATIMPORT.maxRasterPixels)} the importer traces and ${imgs.length === 1 ? 'is' : 'are'} not read. ${RASTER_HINT}`;
}
