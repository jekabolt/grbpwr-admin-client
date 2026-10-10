// F12/F17 · The typed refusal every vector adapter (and the sniffer) throws instead of guessing.
// It crosses the worker boundary as `{type:'error', code:'unsupported-format', message}`, so the
// message is written for the operator and is COMPLETE on its own: what the file is + what to do
// (`hint`, the concrete export instruction). `code` is for code that catches it in the same realm.
// Menu paths are kept generic where the exact wording of a vendor's current menu is not verified
// ("its AAMA/ASTM DXF export"), never invented.

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
  | 'svgz-unsupported' // gzip-compressed SVG in a runtime without DecompressionStream
  // F17 · native CAD and other files that are not drawings we read — each with its export path
  | 'dwg' // AutoCAD DWG (`AC10xx` magic)
  | 'clo-native' // CLO 3D project / garment / avatar / fabric (.zprj .zpac .avt .zfab)
  | 'gerber-accumark' // Gerber AccuMark data or an AccuMark ZIP export (.pce .rul .mdl inside)
  | 'lectra-modaris' // Lectra Modaris model / piece / variant (.mdl .iba .vet)
  | 'cad-model-mdl' // a lone .mdl: Lectra Modaris or Gerber AccuMark model, not told apart
  | 'optitex-native' // Optitex pattern / marker (.pds .mrk)
  | 'valentina-pattern' // Valentina / Seamly2D parametric pattern (.val .sm2d)
  | 'valentina-measurements' // Valentina / Seamly2D measurements (.vit .vst .smis .smms)
  | 'pdf-password' // PDF that needs a password to open
  | 'office-document' // Word / Excel / PowerPoint / OpenDocument
  | 'image-unsupported' // an image container the raster adapter does not decode (HEIC, PSD…)
  | 'zip-archive'; // any other ZIP — the importer does not open archives

type Refusal = { what: string; hint: string };

const DXF_HINT = 'export the pieces as AAMA/ASTM DXF (or plain DXF) and drop the DXF here';

const REFUSALS: Record<UnsupportedCode, Refusal> = {
  empty: { what: 'The file is empty.', hint: 'Check the export finished and drop it again.' },
  'unknown-format': {
    what: 'The file is not a format the importer reads.',
    hint: 'Drop a PDF, DXF, PLT/HPGL, SVG, AI or a scan (PNG/JPG/TIFF).',
  },
  'eps-postscript': {
    what: 'This is an EPS/PostScript file. The importer does not interpret PostScript —',
    hint: 're-export it as PDF (or SVG/DXF) and import that.',
  },
  'ai-postscript': {
    what: 'This Illustrator file has no PDF part (Illustrator 8 or older, or saved without "Create PDF Compatible File").',
    hint: 'Re-save it with PDF compatibility, or export PDF/SVG.',
  },
  'ai-no-pdf-content': {
    what: 'This Illustrator file was saved without PDF content, so only Illustrator can read its drawing.',
    hint: 'Re-save it with "Create PDF Compatible File" on, or export PDF/SVG.',
  },
  'not-svg': { what: 'The file has no <svg> root element.', hint: 'Export a real SVG or a PDF.' },
  'not-hpgl': {
    what: 'The file is not readable plotter (PLT/HPGL) text.',
    hint: 'Plot to an HP-GL/2 file again, or export DXF/PDF.',
  },
  'hpgl-no-geometry': {
    what: 'The plotter file draws nothing (no pen-down moves, arcs or labels).',
    hint: 'Check the plot job included the pieces.',
  },
  'hpgl-pe-malformed': {
    what: 'The HP-GL/2 encoded polylines (PE) in this file could not be decoded.',
    hint: 'Plot as plain HP-GL (PU/PD) or export DXF instead.',
  },
  'svgz-unsupported': {
    what: 'Compressed SVG (.svgz) cannot be opened here —',
    hint: 'unzip it to .svg first.',
  },
  dwg: {
    what: 'This is a DWG drawing (AutoCAD native format), not DXF.',
    hint: 'Open it in AutoCAD (or the CAD that made it) and save/export it as DXF — AutoCAD R2000 or R12 DXF, or AAMA/ASTM DXF for patterns — then drop the DXF here.',
  },
  'clo-native': {
    what: 'This is a CLO 3D file (project .zprj, garment .zpac, avatar .avt or fabric .zfab); only CLO can open it.',
    hint: 'In CLO, open the project and use its 2D pattern export to DXF (AAMA/ASTM DXF), with all sizes if graded, then drop the DXF here.',
  },
  'gerber-accumark': {
    what: 'This is Gerber AccuMark data (pieces, models or rule tables, as in an AccuMark ZIP export); only AccuMark can open it.',
    hint: `From AccuMark, ${DXF_HINT}. Gerber plot files (.plt/.cut, HPGL) are read too.`,
  },
  'lectra-modaris': {
    what: 'This is a Lectra Modaris file (model .mdl, piece .iba or variant .vet); only Modaris can open it.',
    hint: `From Modaris, ${DXF_HINT}. A Lectra plot file (.plt, HPGL) is read too.`,
  },
  'cad-model-mdl': {
    what: 'This is a pattern-CAD model file (.mdl, from Lectra Modaris or Gerber AccuMark); only that CAD can open it.',
    hint: `From that CAD, ${DXF_HINT}.`,
  },
  'optitex-native': {
    what: 'This is an Optitex file (pattern .pds or marker .mrk); only Optitex can open it.',
    hint: `From Optitex, ${DXF_HINT}.`,
  },
  'valentina-pattern': {
    what: 'This is a Valentina / Seamly2D pattern (.val / .sm2d) — a parametric recipe, not drawn pieces.',
    hint: 'Open it in Valentina/Seamly2D with its measurements, export the pieces from the layout as DXF (AAMA if offered), SVG or PDF, and drop that here.',
  },
  'valentina-measurements': {
    what: 'This is a Valentina / Seamly2D measurements file (.vit / .vst / .smis / .smms), not a pattern.',
    hint: 'Open the pattern (.val / .sm2d) that uses it, export the pieces as DXF, SVG or PDF, and drop that here.',
  },
  'pdf-password': {
    what: 'This PDF is password-protected, so its drawing cannot be read.',
    hint: 'Open it with the password and save or print it to a new PDF without security (or ask the sender for an unprotected copy), then drop that here.',
  },
  'office-document': {
    what: 'This is an office document (Word, Excel, PowerPoint or OpenDocument), not a pattern drawing.',
    hint: 'If the pattern is inside it, export or print that page to PDF at 100% scale and drop the PDF here.',
  },
  'image-unsupported': {
    what: 'This image format is not read (only PNG, JPG, TIFF, GIF, WebP and BMP scans are).',
    hint: 'Save it as PNG, JPG or TIFF keeping its dpi (scanned at 100%), or drop the vector PDF/SVG/DXF it came from.',
  },
  'zip-archive': {
    what: 'This is a ZIP archive; the importer does not open archives.',
    hint: 'Unzip it and drop the pattern files themselves (PDF, DXF, PLT, SVG, AI or scans) here.',
  },
};

/** Operator wording of a refusal: `what` + `hint`. */
export function refusalMessage(code: UnsupportedCode): string {
  const r = REFUSALS[code];
  return `${r.what} ${r.hint}`;
}

/** The concrete export instruction alone. */
export function refusalHint(code: UnsupportedCode): string {
  return REFUSALS[code].hint;
}

export class UnsupportedFormat extends Error {
  readonly code: UnsupportedCode;
  readonly detail?: string;
  /** What to do instead — already part of `message`, kept apart for UIs that lay it out. */
  readonly hint: string;
  constructor(code: UnsupportedCode, detail?: string) {
    const msg = refusalMessage(code);
    super(detail ? `${msg} (${detail})` : msg);
    this.name = 'UnsupportedFormat';
    this.code = code;
    this.detail = detail;
    this.hint = refusalHint(code);
  }
}

export function isUnsupportedFormat(e: unknown): e is UnsupportedFormat {
  return (
    e instanceof Error &&
    e.name === 'UnsupportedFormat' &&
    typeof (e as UnsupportedFormat).code === 'string'
  );
}

/** DWG release by its magic (`AC1032` → "AutoCAD 2018+"), for the refusal detail. */
export function dwgRelease(magic: string): string {
  const R: Record<string, string> = {
    AC1006: 'R10',
    AC1009: 'R11/R12',
    AC1012: 'R13',
    AC1014: 'R14',
    AC1015: 'AutoCAD 2000',
    AC1018: 'AutoCAD 2004',
    AC1021: 'AutoCAD 2007',
    AC1024: 'AutoCAD 2010',
    AC1027: 'AutoCAD 2013',
    AC1032: 'AutoCAD 2018+',
  };
  return R[magic] ? `${magic}, ${R[magic]}` : magic;
}
