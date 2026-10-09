// F12 · Content sniffing: which adapter reads this file. Signatures first, extension only as a
// tie-breaker (an .ai is a PDF or PostScript by content; a .plt may be anything). Pure, worker-safe.

import type { SourceKind } from '../../types';
import type { UnsupportedCode } from './errors';
import { looksLikeHpgl } from '../hpgl/tokenize';

export type SniffRoute = 'pdf' | 'dxf' | 'hpgl' | 'svg' | 'raster';

export type SniffResult =
  | {
      route: SniffRoute;
      kind: SourceKind;
      /** pdf route: byte offset of `%PDF-` (non-zero when a PostScript wrapper precedes it). */
      pdfOffset?: number;
      /** svg route: gzip-compressed (.svgz). */
      gzip?: boolean;
      /** raster route: detected mime. */
      mime?: string;
      why: string;
    }
  | { route: null; refusal: UnsupportedCode; why: string };

const HEAD = 64 * 1024;

function ext(name: string): string {
  const m = /\.([a-z0-9]+)$/i.exec(name);
  return m ? m[1].toLowerCase() : '';
}

function startsWith(u: Uint8Array, sig: number[], at = 0): boolean {
  if (u.length < at + sig.length) return false;
  for (let i = 0; i < sig.length; i++) if (u[at + i] !== sig[i]) return false;
  return true;
}

/** latin1 view of a byte range — byte values preserved 1:1 as char codes. */
export function latin1(u: Uint8Array, from = 0, to = u.length): string {
  let s = '';
  const CH = 0x8000;
  for (let i = from; i < to; i += CH)
    s += String.fromCharCode.apply(null, Array.from(u.subarray(i, Math.min(to, i + CH))));
  return s;
}

/** Offset of `%PDF-` at a line start (or file start), or -1. */
function findPdfHeader(text: string, from = 0): number {
  let i = text.indexOf('%PDF-', from);
  while (i >= 0) {
    if (i === 0 || text[i - 1] === '\n' || text[i - 1] === '\r') return i;
    i = text.indexOf('%PDF-', i + 5);
  }
  return -1;
}

export function sniffFormat(bytes: ArrayBuffer, name: string): SniffResult {
  const u = new Uint8Array(bytes);
  const e = ext(name);
  if (u.length === 0) return { route: null, refusal: 'empty', why: '0 bytes' };

  const head = latin1(u, 0, Math.min(u.length, HEAD));

  // PDF (and every Illustrator ≥ 9 file with PDF compatibility) — header within the first KiB.
  const pdfAt = findPdfHeader(head.slice(0, 1024));
  if (pdfAt >= 0) {
    const isAi = e === 'ai' || /Adobe Illustrator|\/Illustrator\b|%AI\d?_/.test(head);
    return { route: 'pdf', kind: isAi ? 'ai' : 'pdf', pdfOffset: pdfAt, why: `%PDF- at ${pdfAt}` };
  }

  // DOS-binary EPS (C5 D0 D3 C6): PostScript + preview, never a PDF stream.
  if (startsWith(u, [0xc5, 0xd0, 0xd3, 0xc6])) {
    return {
      route: null,
      refusal: e === 'ai' ? 'ai-postscript' : 'eps-postscript',
      why: 'DOS EPS binary header',
    };
  }

  // PostScript / EPS / Illustrator ≤ 8.
  if (head.startsWith('%!PS') || head.startsWith('%!')) {
    const all = u.length > HEAD ? latin1(u) : head;
    const at = findPdfHeader(all);
    if (at >= 0 && all.indexOf('%%EOF', at) > at) {
      return {
        route: 'pdf',
        kind: 'ai',
        pdfOffset: at,
        why: `PostScript wrapper with a PDF stream at ${at}`,
      };
    }
    const ai = e === 'ai' || /%%Creator:\s*Adobe Illustrator|%AI\d?_/.test(head);
    return {
      route: null,
      refusal: ai ? 'ai-postscript' : 'eps-postscript',
      why: 'PostScript without a PDF stream',
    };
  }

  // Rasters.
  if (startsWith(u, [0x89, 0x50, 0x4e, 0x47]))
    return { route: 'raster', kind: 'raster', mime: 'image/png', why: 'PNG' };
  if (startsWith(u, [0xff, 0xd8, 0xff]))
    return { route: 'raster', kind: 'raster', mime: 'image/jpeg', why: 'JPEG' };
  if (startsWith(u, [0x49, 0x49, 0x2a, 0x00]) || startsWith(u, [0x4d, 0x4d, 0x00, 0x2a]))
    return { route: 'raster', kind: 'raster', mime: 'image/tiff', why: 'TIFF' };
  if (head.startsWith('GIF8'))
    return { route: 'raster', kind: 'raster', mime: 'image/gif', why: 'GIF' };
  if (head.startsWith('RIFF') && head.slice(8, 12) === 'WEBP')
    return { route: 'raster', kind: 'raster', mime: 'image/webp', why: 'WebP' };
  if (head.startsWith('BM') && e === 'bmp')
    return { route: 'raster', kind: 'raster', mime: 'image/bmp', why: 'BMP' };

  // gzip → only meaningful as .svgz.
  if (startsWith(u, [0x1f, 0x8b])) {
    if (e === 'svgz' || e === 'svg')
      return { route: 'svg', kind: 'svg', gzip: true, why: 'gzip (.svgz)' };
    return { route: null, refusal: 'unknown-format', why: 'gzip archive' };
  }

  // Text formats.
  if (head.startsWith('AutoCAD Binary DXF'))
    return { route: 'dxf', kind: 'dxf', why: 'binary DXF sentinel' };
  const text = decodeHeadText(u, head);
  if (
    /^\s*<(\?xml|!--|!DOCTYPE|svg[\s>:]|[a-z]+:svg[\s>])/i.test(text) &&
    /<([a-z]+:)?svg[\s>]/i.test(text)
  ) {
    return { route: 'svg', kind: 'svg', why: '<svg> root' };
  }
  if (/^\s*(999\s*\r?\n[^\n]*\r?\n\s*)*0\s*\r?\nSECTION\s*\r?\n/.test(text))
    return { route: 'dxf', kind: 'dxf', why: '0/SECTION' };
  if (looksLikeHpgl(head)) return { route: 'hpgl', kind: 'hpgl', why: 'plotter mnemonics' };

  return { route: null, refusal: 'unknown-format', why: 'no known signature' };
}

/** Head as text for the XML/DXF checks: UTF-16 BOMs decoded, a UTF-8 BOM stripped. */
function decodeHeadText(u: Uint8Array, head: string): string {
  if (startsWith(u, [0xff, 0xfe]) || startsWith(u, [0xfe, 0xff])) {
    try {
      return new TextDecoder(u[0] === 0xff ? 'utf-16le' : 'utf-16be').decode(
        u.subarray(0, Math.min(u.length, HEAD)),
      );
    } catch {
      return head;
    }
  }
  return head.startsWith('\xef\xbb\xbf') ? head.slice(3) : head;
}
