// F12 · The typed refusal every F12 adapter (and the sniffer) throws instead of guessing.
// It crosses the worker boundary as `{type:'error', message}`, so the message is written for the
// operator; `code` is for code that catches it in the same realm.

export type UnsupportedCode =
  | 'empty' // zero bytes
  | 'unknown-format' // no signature we know
  | 'eps-postscript' // EPS / PostScript without a PDF stream — we do not interpret PostScript
  | 'ai-postscript' // Illustrator ≤ 8 (pure PostScript) or an .ai saved without PDF compatibility
  | 'ai-no-pdf-content' // modern .ai whose PDF part is Adobe's "saved without PDF Content" placeholder
  | 'not-svg' // the SVG adapter got a file with no <svg> root
  | 'not-hpgl' // the HPGL adapter got binary or text with no plotter commands
  | 'hpgl-no-geometry' // valid HPGL that draws nothing
  | 'hpgl-pe-malformed' // HP-GL/2 polyline-encoded data we cannot decode
  | 'svgz-unsupported'; // gzip-compressed SVG in a runtime without DecompressionStream

const MESSAGES: Record<UnsupportedCode, string> = {
  empty: 'The file is empty.',
  'unknown-format':
    'The file is not a format the importer reads (PDF, DXF, PLT/HPGL, SVG, AI, PNG/JPG).',
  'eps-postscript':
    'This is an EPS/PostScript file. The importer does not interpret PostScript — re-export it as PDF (or SVG/DXF) and import that.',
  'ai-postscript':
    'This Illustrator file has no PDF part (Illustrator 8 or older, or saved without "Create PDF Compatible File"). Re-save it with PDF compatibility, or export PDF/SVG.',
  'ai-no-pdf-content':
    'This Illustrator file was saved without PDF content, so only Illustrator can read its drawing. Re-save it with "Create PDF Compatible File" on, or export PDF/SVG.',
  'not-svg': 'The file has no <svg> root element.',
  'not-hpgl': 'The file is not readable plotter (PLT/HPGL) text.',
  'hpgl-no-geometry': 'The plotter file draws nothing (no pen-down moves, arcs or labels).',
  'hpgl-pe-malformed': 'The HP-GL/2 encoded polylines (PE) in this file could not be decoded.',
  'svgz-unsupported': 'Compressed SVG (.svgz) cannot be opened here — unzip it to .svg first.',
};

export class UnsupportedFormat extends Error {
  readonly code: UnsupportedCode;
  readonly detail?: string;
  constructor(code: UnsupportedCode, detail?: string) {
    super(detail ? `${MESSAGES[code]} (${detail})` : MESSAGES[code]);
    this.name = 'UnsupportedFormat';
    this.code = code;
    this.detail = detail;
  }
}

export function isUnsupportedFormat(e: unknown): e is UnsupportedFormat {
  return (
    e instanceof Error &&
    e.name === 'UnsupportedFormat' &&
    typeof (e as UnsupportedFormat).code === 'string'
  );
}
