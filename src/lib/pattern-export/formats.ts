// The «download as» list for a pattern drawing — one list for every menu (a DXF row on the
// patterns tab, the marker window), so a new output is added here once.
//
// HOOK FOR PLT: the HPGL writer (lib/pattern-export/hpgl.ts) lands separately. To add it: put
// `{ id: 'plt', label: 'PLT (HPGL plotter)' }` into EXPORT_FORMATS and a `case 'plt'` into
// `exportDrawing` that returns its bytes with ext 'plt' — the menus and the download wiring
// already handle any `ExportResult`.
import type { PatternDrawing } from './drawing';
import { planPdf, renderPdf, type PdfFont, type PdfLayout } from './dxf-pdf';

export type ExportFormatId = 'pdf-sheet' | 'pdf-a4' | 'pdf-a3' | 'pdf-letter';

export const EXPORT_FORMATS: readonly { id: ExportFormatId; label: string; hint: string }[] = [
  { id: 'pdf-sheet', label: 'PDF 1:1 · one sheet', hint: 'one page of the drawing’s own size' },
  { id: 'pdf-a4', label: 'PDF 1:1 · A4 tiles', hint: 'office printer, trim and tape' },
  { id: 'pdf-a3', label: 'PDF 1:1 · A3 tiles', hint: 'fewer pages on an A3 printer' },
  { id: 'pdf-letter', label: 'PDF 1:1 · Letter tiles', hint: 'US Letter paper' },
];

const LAYOUT: Record<ExportFormatId, PdfLayout> = {
  'pdf-sheet': { kind: 'sheet' },
  'pdf-a4': { kind: 'tiles', paper: 'A4' },
  'pdf-a3': { kind: 'tiles', paper: 'A3' },
  'pdf-letter': { kind: 'tiles', paper: 'Letter' },
};

export type ExportResult = { blob: Blob; fileName: string; warnings: string[] };

export type ExportDeps = {
  /** Lazy jsPDF — the caller imports it, so the library stays out of the page chunk. */
  jsPDF: typeof import('jspdf').jsPDF;
  font?: PdfFont;
};

export function exportDrawing(
  d: PatternDrawing,
  format: ExportFormatId,
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
