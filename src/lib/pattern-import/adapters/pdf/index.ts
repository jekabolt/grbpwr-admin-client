// adapters/pdf (F1) — public surface. Worker graph only (pdf.js); the main thread never imports this.
export { extractPdf, extractPdfWith, DEFAULT_EXTRACT_OPTS } from './extract';
export type { RasterPixels, RasterSink, ExtractPdfDeps } from './extract';
export { setPdfjsLoader, loadPdfjs, openPdf } from './pdfjs';
export { detectScale, applyScale, findSquares, dimensionsIn } from './scale';
export { extractPdfSet, detectScaleSet } from './multi';
export type { SetScale } from './multi';
export type { PdfjsModule, PdfDocument, PdfPage } from './pdfjs';
