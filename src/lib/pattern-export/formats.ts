// The «download as» list for a pattern drawing — one list for every menu (a DXF row on the
// patterns tab, the marker window), so a new output is added here once.
//
// Two kinds of output, two inputs:
//   • PDF 1:1 (one sheet / tiles) prints a PatternDrawing (drawing.ts) through dxf-pdf.ts;
//   • PLT prints the neutral PlotDrawing (plot-drawing.ts) through the HP-GL writer (hpgl.ts) —
//     the plotter needs pens per role and labels sized for its font, which a PDF drawing does not
//     carry. A menu shows the PLT item only when its caller can build that input.
import type { PatternDrawing } from './drawing';
import { assertPrintableSize, planPdf, renderPdf, type PdfFont, type PdfLayout } from './dxf-pdf';
import { dxfToHpgl, frameDrawing, hpglBlob, type PlotDrawing } from './hpgl';

export type PdfFormatId = 'pdf-sheet' | 'pdf-a4' | 'pdf-a3' | 'pdf-letter';
export type ExportFormatId = PdfFormatId | 'plt';

export const PDF_FORMATS: readonly { id: PdfFormatId; label: string; hint: string }[] = [
  { id: 'pdf-sheet', label: 'PDF 1:1 · one sheet', hint: 'one page of the drawing’s own size' },
  { id: 'pdf-a4', label: 'PDF 1:1 · A4 tiles', hint: 'office printer, trim and tape' },
  { id: 'pdf-a3', label: 'PDF 1:1 · A3 tiles', hint: 'fewer pages on an A3 printer' },
  { id: 'pdf-letter', label: 'PDF 1:1 · Letter tiles', hint: 'US Letter paper' },
];

export const EXPORT_FORMATS: readonly { id: ExportFormatId; label: string; hint: string }[] = [
  ...PDF_FORMATS,
  {
    id: 'plt',
    label: 'PLT · plotter',
    hint: 'HP-GL for a pen / cutting plotter: 40 units per mm, pen 1 cut, 2 lines, 3 notches',
  },
];

const LAYOUT: Record<PdfFormatId, PdfLayout> = {
  'pdf-sheet': { kind: 'sheet' },
  'pdf-a4': { kind: 'tiles', paper: 'A4' },
  'pdf-a3': { kind: 'tiles', paper: 'A3' },
  'pdf-letter': { kind: 'tiles', paper: 'Letter' },
};

export const pdfLayoutOf = (format: PdfFormatId): PdfLayout => LAYOUT[format];

export type ExportResult = { blob: Blob; fileName: string; warnings: string[] };

export type ExportDeps = {
  /** Lazy jsPDF — the caller imports it, so the library stays out of the page chunk. */
  jsPDF: typeof import('jspdf').jsPDF;
  font?: PdfFont;
};

export function exportDrawing(
  d: PatternDrawing,
  format: PdfFormatId,
  deps: ExportDeps,
): ExportResult {
  const plan = planPdf(d, LAYOUT[format]);
  const pdf = renderPdf(deps.jsPDF, d, plan, deps.font);
  return {
    blob: new Blob([pdf.output('arraybuffer')], { type: 'application/pdf' }),
    fileName: plan.fileName,
    warnings: plan.warnings,
  };
}

const safeStem = (s: string) => s.replace(/[\\/:*?"<>|]+/g, '_').trim() || 'pattern';

/** The plot as a .plt file, under the same size limits as every 1:1 print. */
export function exportPlot(plot: PlotDrawing, title: string): ExportResult {
  const framed = frameDrawing(plot);
  if (framed.polylines.length === 0) throw new Error('the drawing has no line work');
  assertPrintableSize(framed.widthMm, framed.heightMm);
  return {
    blob: hpglBlob(dxfToHpgl(plot)),
    fileName: `${safeStem(title)}.plt`,
    warnings: framed.warnings,
  };
}
