// F12 · Adobe Illustrator / EPS routing. A modern .ai is a PDF (Illustrator ≥ 9 writes the PDF
// part when "Create PDF Compatible File" is on), so it goes through F1's PDF adapter — injected,
// so this module never imports adapters/pdf internals. Pure PostScript (EPS, Illustrator ≤ 8) is
// refused with a typed error: the importer does not interpret PostScript.

import type { ExtractFn, SourceDoc } from '../../types';
import { sha256Hex } from '../vector/builder';
import { UnsupportedFormat } from './errors';
import { latin1, sniffFormat } from './sniff';

/** Illustrator's placeholder page text when the file was saved without PDF content. */
const NO_PDF_CONTENT = /saved without PDF Content|without PDF content/i;

/**
 * Wraps the PDF extractor for .ai/.eps input: routes PDF-compatible files (slicing off a
 * PostScript wrapper when the PDF starts later in the file), refuses PostScript, and refuses an
 * .ai whose PDF part is only Adobe's "saved without PDF Content" placeholder.
 */
export function makeExtractAi(extractPdf: ExtractFn): ExtractFn {
  return async (file, opts, progress) => {
    const sn = sniffFormat(file.bytes, file.name);
    if (sn.route === null) throw new UnsupportedFormat(sn.refusal, sn.why);
    if (sn.route !== 'pdf')
      throw new UnsupportedFormat('unknown-format', `expected PDF/PostScript, found ${sn.route}`);

    const u = new Uint8Array(file.bytes);
    // The placeholder string sits in an uncompressed content stream in every sample Adobe ships;
    // the post-check below catches the compressed case.
    const quick = latin1(u, 0, Math.min(u.length, 256 * 1024));
    const off = sn.pdfOffset ?? 0;
    const pdfBytes = off > 0 ? file.bytes.slice(off) : file.bytes;
    const doc: SourceDoc = await extractPdf({ ...file, bytes: pdfBytes }, opts, progress);

    const hasGeometry = doc.pages.some((p) => p.paths.length > 0 || p.rasters.length > 0);
    const pageText = doc.pages.flatMap((p) => p.texts.map((t) => t.text)).join(' ');
    if (!hasGeometry && (NO_PDF_CONTENT.test(pageText) || NO_PDF_CONTENT.test(quick))) {
      throw new UnsupportedFormat('ai-no-pdf-content');
    }

    const warnings = [...doc.warnings];
    if (off > 0) warnings.push(`PostScript wrapper of ${off} bytes skipped; PDF part read`);
    return {
      ...doc,
      file: {
        ...doc.file,
        name: file.name,
        bytes: file.bytes.byteLength,
        sha256: off > 0 ? await sha256Hex(file.bytes) : doc.file.sha256,
        kind: 'ai',
      },
      warnings,
    };
  };
}

/** Extractor registry the worker passes in; `pickExtractor` chooses by content, not extension. */
export type ExtractorRegistry = {
  pdf: ExtractFn;
  dxf?: ExtractFn;
  hpgl?: ExtractFn;
  svg?: ExtractFn;
  raster?: ExtractFn;
};

/**
 * The extractor for this file, or a thrown `UnsupportedFormat`. PDF-compatible .ai (and a PDF
 * wrapped in PostScript) go through `makeExtractAi(registry.pdf)`.
 */
export function pickExtractor(bytes: ArrayBuffer, name: string, reg: ExtractorRegistry): ExtractFn {
  const sn = sniffFormat(bytes, name);
  if (sn.route === null) throw new UnsupportedFormat(sn.refusal, sn.why);
  if (sn.route === 'pdf')
    return sn.kind === 'ai' || (sn.pdfOffset ?? 0) > 0 ? makeExtractAi(reg.pdf) : reg.pdf;
  const fn = reg[sn.route];
  if (!fn) throw new UnsupportedFormat('unknown-format', `${sn.route} adapter not registered`);
  return fn;
}
