// F12 · Adobe Illustrator / EPS routing. A modern .ai is a PDF (Illustrator ≥ 9 writes the PDF
// part when "Create PDF Compatible File" is on), so it goes through F1's PDF adapter — injected,
// so this module never imports adapters/pdf internals. Pure PostScript (EPS, Illustrator ≤ 8) is
// refused with a typed error: the importer does not interpret PostScript.

import type { ExtractFn, SourceDoc } from '../../types';
import { assertFiniteDoc, WorkBudget } from '../budget';
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
 * wrapped in PostScript) go through `makeExtractAi(registry.pdf)`. Every extractor it hands out is
 * bounded (C4): it spends from the run's work budget (a fresh one when the caller brings none) and
 * its output is refused when a coordinate is not a finite number.
 */
export function pickExtractor(bytes: ArrayBuffer, name: string, reg: ExtractorRegistry): ExtractFn {
  const sn = sniffFormat(bytes, name);
  if (sn.route === null) throw new UnsupportedFormat(sn.refusal, sn.why);
  if (sn.route === 'pdf')
    return bounded(
      refusePassword(
        sn.kind === 'ai' || (sn.pdfOffset ?? 0) > 0 ? makeExtractAi(reg.pdf) : reg.pdf,
      ),
    );
  const fn = reg[sn.route];
  if (!fn) throw new UnsupportedFormat('unknown-format', `${sn.route} adapter not registered`);
  return bounded(fn);
}

function bounded(fn: ExtractFn): ExtractFn {
  return async (file, opts, progress) => {
    try {
      const doc = await fn(
        file,
        opts.budget ? opts : { ...opts, budget: new WorkBudget() },
        progress,
      );
      assertFiniteDoc(doc);
      return doc;
    } catch (e) {
      // the adapters' named refusals do not know the file's name: the operator needs it
      if (
        e instanceof Error &&
        (e.name === 'InputTooLarge' || e.name === 'CorruptInput') &&
        !e.message.startsWith(file.name)
      )
        e.message = `${file.name}: ${e.message}`;
      throw e;
    }
  };
}

/** pdf.js throws `PasswordException` ("No password given" / "Incorrect Password") for a PDF
 * with a user password; an owner-password-only PDF (print/copy restrictions) opens normally, so
 * the refusal is decided by the reader, not by the presence of /Encrypt. */
export function isPdfPasswordError(e: unknown): boolean {
  if (!e || typeof e !== 'object') return false;
  const { name, message } = e as { name?: unknown; message?: unknown };
  return (
    name === 'PasswordException' ||
    (typeof message === 'string' && /no password given|incorrect password/i.test(message))
  );
}

function refusePassword(fn: ExtractFn): ExtractFn {
  return async (file, opts, progress) => {
    try {
      return await fn(file, opts, progress);
    } catch (e) {
      if (isPdfPasswordError(e)) throw new UnsupportedFormat('pdf-password');
      throw e;
    }
  };
}
