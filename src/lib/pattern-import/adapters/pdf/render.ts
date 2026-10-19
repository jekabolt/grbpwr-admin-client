// Page → RGBA pixels inside the import worker (the export F11 reuses; contract §2).
// pdf.js' default canvas factory needs `document`; in a worker every canvas is an OffscreenCanvas.
// Not runnable in node (no OffscreenCanvas): node probes measure vectors only.

import { loadPdfjs, type PdfDocument } from './pdfjs';

type Cc = { canvas: OffscreenCanvas | null; context: OffscreenCanvasRenderingContext2D | null };

class OffscreenCanvasFactory {
  create(width: number, height: number): Cc {
    if (width <= 0 || height <= 0) throw new Error('Invalid canvas size');
    const canvas = new OffscreenCanvas(width, height);
    return { canvas, context: canvas.getContext('2d', { willReadFrequently: true }) };
  }
  reset(cc: Cc, width: number, height: number): void {
    if (!cc.canvas) throw new Error('Canvas is not specified');
    cc.canvas.width = width;
    cc.canvas.height = height;
  }
  destroy(cc: Cc): void {
    if (cc.canvas) {
      cc.canvas.width = 0;
      cc.canvas.height = 0;
    }
    cc.canvas = null;
    cc.context = null;
  }
}

/** Opens a PDF for RENDERING in a worker (offscreen canvases, no font faces, no eval). */
export async function openPdfForRender(bytes: ArrayBuffer): Promise<PdfDocument> {
  const pdfjs = await loadPdfjs();
  return pdfjs.getDocument({
    data: new Uint8Array(bytes.slice(0)),
    verbosity: 0,
    disableFontFace: true,
    isEvalSupported: false,
    CanvasFactory: OffscreenCanvasFactory,
  }).promise;
}

export type RenderedPage = {
  width: number;
  height: number;
  data: Uint8ClampedArray;
  /** px per mm of the page frame (dpi / 25.4); y-down, origin top-left of the view box. */
  pxPerMm: number;
};

/** Renders one page (0-based) at `dpi` onto a white ground. Caller bounds memory (≤ 300 MB/page). */
export async function renderPageRgba(
  doc: PdfDocument,
  page: number,
  dpi: number,
): Promise<RenderedPage> {
  const p = await doc.getPage(page + 1);
  try {
    const viewport = p.getViewport({ scale: dpi / 72 });
    const width = Math.ceil(viewport.width);
    const height = Math.ceil(viewport.height);
    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) throw new Error('renderPageRgba: no 2d context');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, width, height);
    await p.render({ canvasContext: ctx as unknown as CanvasRenderingContext2D, viewport }).promise;
    const img = ctx.getImageData(0, 0, width, height);
    return { width, height, data: img.data, pxPerMm: dpi / 25.4 };
  } finally {
    p.cleanup();
  }
}
