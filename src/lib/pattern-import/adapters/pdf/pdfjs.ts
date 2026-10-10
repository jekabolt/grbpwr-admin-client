// pdf.js loading for the pattern-import worker graph (F1).
//
// The browser build is imported dynamically — like `components/managers/files/utils/preview.ts` —
// so pdf.js never lands in the main bundle; the import only happens inside the import worker.
// Node probes inject the legacy build with `setPdfjsLoader` (no DOM, no canvas anywhere here).

import type * as Pdfjs from 'pdfjs-dist';

export type PdfjsModule = typeof Pdfjs;
export type PdfDocument = Pdfjs.PDFDocumentProxy;
export type PdfPage = Pdfjs.PDFPageProxy;

let loader: () => Promise<PdfjsModule> = async () => {
  const pdfjs = await import('pdfjs-dist');
  if (!pdfjs.GlobalWorkerOptions.workerSrc) {
    // Same as the reader: Vite fingerprints the worker next to us (a CDN would hit CSP).
    pdfjs.GlobalWorkerOptions.workerSrc = new URL(
      'pdfjs-dist/build/pdf.worker.min.mjs',
      import.meta.url,
    ).toString();
  }
  return pdfjs;
};
let cached: Promise<PdfjsModule> | null = null;

/** Replace the pdf.js loader (node probes: the legacy build). Resets the cached module. */
export function setPdfjsLoader(load: () => Promise<PdfjsModule>): void {
  loader = load;
  cached = null;
}

export function loadPdfjs(): Promise<PdfjsModule> {
  if (!cached) cached = loader();
  return cached;
}

/**
 * Opens a PDF from bytes WITHOUT detaching the caller's buffer (pdf.js transfers `data` to its
 * worker, so it gets a copy). Settings are worker-safe: no font faces (they need `document`), no
 * eval (CSP), raw image data rather than ImageBitmaps (the blob store wants bytes).
 */
export async function openPdf(bytes: ArrayBuffer): Promise<PdfDocument> {
  const pdfjs = await loadPdfjs();
  const task = pdfjs.getDocument({
    data: new Uint8Array(bytes.slice(0)),
    verbosity: 0,
    disableFontFace: true,
    isEvalSupported: false,
    isOffscreenCanvasSupported: false,
    isImageDecoderSupported: false,
    useSystemFonts: false,
    stopAtErrors: false,
  });
  return task.promise;
}
