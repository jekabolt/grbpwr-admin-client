// Bytes → text → group-code/value pairs. This IS the raw AST the adapter reads: dxf-parser is not
// used, because it drops exactly what a garment DXF needs (POINT code 50/30, spline weights,
// ATTRIB, MTEXT continuation, entity order and handles for provenance) — 05-CODEX-REVIEW item 8,
// 10-CLO-DXF-FORMAT §2.4-2.

import { MANIFEST_TAG, PATIMPORT } from '../../types';
import { inputTooLarge } from '../budget';
import { dwgRelease, refusalHint } from '../sniff/errors';
import { isBinaryDxf, readBinaryDxf, type BinaryDxfMode } from './binary';
import { DxfImportError } from './errors';

export type Tag = { code: number; value: string; /** 1-based line of the code */ line: number };

export type DecodedDxf = {
  text: string;
  /** Which decoder produced `text`. */
  encoding: 'utf-8' | string;
  /** Lossy decode happened (non-UTF-8 bytes read through a single-byte codepage). */
  fallback: boolean;
};

/** Refuse DWG by its magic, then decode UTF-8 first, else the declared ANSI codepage, else
 * cp1251 (pattern-maker files, 10-CLO-DXF-FORMAT §2.4-9). Binary DXF never gets here (`loadDxf`). */
export function decodeDxf(bytes: ArrayBuffer): DecodedDxf {
  const u8 = new Uint8Array(bytes);
  if (u8.length === 0) throw new DxfImportError('empty', 'the file is empty');
  const head = latin1(u8.subarray(0, 32));
  const dwg = /^AC10\d\d/.exec(head) ?? /^AC1\d\d\d(?=\0)/.exec(head);
  if (dwg) {
    throw new DxfImportError(
      'dwg',
      `This is a DWG drawing (${dwgRelease(dwg[0])}), not DXF. ${refusalHint('dwg')}`,
      null,
      refusalHint('dwg'),
    );
  }
  try {
    return {
      text: new TextDecoder('utf-8', { fatal: true }).decode(u8),
      encoding: 'utf-8',
      fallback: false,
    };
  } catch {
    // Not UTF-8: honour $DWGCODEPAGE when it names a Windows codepage, else cp1251.
    const probe = latin1(u8.subarray(0, Math.min(u8.length, 64 * 1024)));
    const m = /\$DWGCODEPAGE\s*\r?\n\s*3\s*\r?\n\s*ANSI_(\d{3,4})/i.exec(probe);
    const cp = m ? `windows-${m[1]}` : 'windows-1251';
    for (const enc of [cp, 'windows-1251']) {
      try {
        return { text: new TextDecoder(enc).decode(u8), encoding: enc, fallback: true };
      } catch {
        // decoder not available in this runtime — try the next one
      }
    }
    return { text: latin1(u8), encoding: 'latin1', fallback: true };
  }
}

function latin1(u8: Uint8Array): string {
  let s = '';
  for (let i = 0; i < u8.length; i += 8192) {
    s += String.fromCharCode(...u8.subarray(i, Math.min(u8.length, i + 8192)));
  }
  return s;
}

export type Tokenized = {
  tags: Tag[];
  /** 999 comments that precede the first SECTION (our manifest lives here). */
  leadingComments: string[];
  /** Every 999 comment elsewhere (CLO writes the TEXT font size in pt as 999). Dropped from the
   * stream on purpose — counted so the drop is visible. */
  innerComments: number;
};

export type LoadedDxf = {
  tok: Tokenized;
  encoding: string;
  fallback: boolean;
  /** Our manifest leads the file (`isOurDxf`). */
  manifest: boolean;
  /** Text to sniff the producer in (the head of the ASCII file / the binary's string values). */
  probeText: string;
  /** null = ASCII DXF. */
  binary: BinaryDxfMode | null;
};

/** Bytes → the tag stream, for ASCII and binary DXF alike: everything after this is identical. */
export function loadDxf(bytes: ArrayBuffer): LoadedDxf {
  const u8 = new Uint8Array(bytes);
  if (isBinaryDxf(u8)) {
    const b = readBinaryDxf(u8);
    return {
      tok: b.tok,
      encoding: b.encoding,
      fallback: b.fallback,
      manifest: b.manifest,
      probeText: b.probeText,
      binary: b.mode,
    };
  }
  refuseLongDxf(u8);
  const dec = decodeDxf(bytes);
  return {
    tok: tokenize(dec.text),
    encoding: dec.encoding,
    fallback: dec.fallback,
    manifest: isOurDxf(dec.text),
    probeText: dec.text.slice(0, 200_000),
    binary: null,
  };
}

/**
 * C4: the ASCII stream is split whole (tokenize), so its line count is bounded BEFORE it is decoded
 * — counted on the bytes, ~1 ms per MB. The largest CLO export of the corpus has 0.23 M lines.
 */
export function refuseLongDxf(u8: Uint8Array, max: number = PATIMPORT.maxDxfLines): void {
  let lines = 0;
  for (let i = u8.indexOf(10); i !== -1; i = u8.indexOf(10, i + 1))
    if (++lines > max)
      throw inputTooLarge(
        `the DXF has more than ${max / 1e6} million lines, more than the importer reads (a graded CLO export of a whole garment is well under 1 million). Export fewer sizes or only the pattern pieces per file.`,
      );
}

/** Pairs of lines → tags. Throws a typed `corrupt` / `not-dxf` on a broken stream. */
export function tokenize(text: string): Tokenized {
  const lines = text.split('\n');
  const tags: Tag[] = [];
  const leadingComments: string[] = [];
  let innerComments = 0;
  let sawSection = false;
  let i = 0;
  for (; i < lines.length; i += 2) {
    const raw = lines[i].replace(/\r$/, '').trim();
    if (raw === '') {
      // Only trailing blank lines are legal; a blank code mid-stream shifts every later pair.
      if (lines.slice(i).every((l) => l.trim() === '')) break;
      throw new DxfImportError(
        'corrupt',
        'an empty group-code line — the pair stream is out of step',
        i + 1,
      );
    }
    if (!/^-?\d+$/.test(raw)) {
      if (tags.length === 0 && leadingComments.length === 0) {
        throw new DxfImportError('not-dxf', 'not a DXF file — no group codes at the top');
      }
      throw new DxfImportError(
        'corrupt',
        `“${raw.slice(0, 40)}” where a group code was expected`,
        i + 1,
      );
    }
    if (i + 1 >= lines.length) {
      throw new DxfImportError(
        'corrupt',
        'the file ends between a group code and its value',
        i + 1,
      );
    }
    const code = Number(raw);
    const value = lines[i + 1].replace(/\r$/, '');
    if (code === 999) {
      if (!sawSection) leadingComments.push(value);
      else innerComments++;
      continue;
    }
    if (code === 0 && value.trim() === 'SECTION') sawSection = true;
    tags.push({ code, value, line: i + 1 });
  }
  if (tags.length === 0) throw new DxfImportError('empty', 'the file holds no DXF data');
  return { tags, leadingComments, innerComments };
}

/** `999 GRBPWR-MANIFEST …` before the first SECTION = a file our writer produced. Cheap: reads
 * only the leading comment block (contract §3). */
export function isOurDxf(text: string): boolean {
  const lines = text.split('\n', 4000);
  for (let i = 0; i + 1 < lines.length; i += 2) {
    const code = lines[i].trim();
    const value = lines[i + 1].replace(/\r$/, '').trim();
    if (code === '999') {
      if (value.startsWith(MANIFEST_TAG)) return true;
      continue;
    }
    if (code === '0' && value === 'SECTION') return false;
    if (code !== '999') return false;
  }
  return false;
}

/** Numeric value of a tag; NaN/garbage in a coordinate is corruption, not zero. */
export function num(t: Tag): number {
  const v = Number(t.value.trim());
  if (!Number.isFinite(v)) {
    throw new DxfImportError(
      'corrupt',
      `group ${t.code} carries “${t.value.trim().slice(0, 30)}”, not a number`,
      t.line,
    );
  }
  return v;
}
