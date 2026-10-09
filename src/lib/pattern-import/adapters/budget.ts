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
