// F17 · Binary DXF → the same tag stream the ASCII tokenizer produces, so the AST, geometry,
// segmentation and fast path are identical for both encodings.
//
// Layout (AutoCAD DXF reference, "Binary DXF Files"):
//   sentinel  "AutoCAD Binary DXF\r\n\x1a\0" (22 bytes), then pairs of group code + value.
//   group code  R12 and older: 1 byte; 255 escapes to a 2-byte little-endian code (extended data).
//               R13 and newer: 2-byte little-endian.
//   value       typed by the group-code range (`valueKind`): NUL-terminated string, int8, bool
//               (1 byte), int16, int32, int64 (little-endian), IEEE double, or a binary chunk
//               (310–319, 1004: 1 length byte + data, rendered as upper-case hex like ASCII DXF).
// The width of the group code is not declared anywhere: the first pair must be 0/SECTION (or a
// 999 comment), and only one width decodes it — that picks R12 vs R13+.
// Strings are decoded as a whole file: UTF-8 when every string is valid UTF-8 (R2007+, ASCII),
// else the $DWGCODEPAGE codepage, else cp1251 — the same order as the ASCII path.
// Numbers become their shortest round-trip decimal (`String(x)`), so `num()` downstream reads
// exactly the double the file stored.

import { MANIFEST_TAG } from '../../types';
import { DxfImportError } from './errors';
import type { Tag, Tokenized } from './tags';

export const BINARY_DXF_SENTINEL = 'AutoCAD Binary DXF\r\n\x1a\0';
const SENTINEL_LEN = 22;

export type BinaryDxfMode = 'r12' | 'r13+';

type ValueKind = 'str' | 'f64' | 'i8' | 'bool' | 'i16' | 'i32' | 'i64' | 'bin';

/** Value type by group code (DXF reference "Group code value types"; widths as AutoCAD/ODA
 * write them in binary DXF: 280–289 int8, 290–299 one-byte bool, 370–389 int16). */
export function valueKind(code: number): ValueKind {
  if (code < 0) return 'str';
  if (code <= 9) return 'str';
  if (code <= 59) return 'f64'; // 10–39 points, 40–59 doubles
  if (code <= 79) return 'i16';
  if (code <= 89) return 'str'; // unassigned
  if (code <= 99) return 'i32';
  if (code <= 109) return 'str'; // 100 subclass, 102 control, 105 handle
  if (code <= 149) return 'f64'; // 110–139 UCS points/vectors, 140–149 doubles
  if (code <= 159) return 'str'; // unassigned
  if (code <= 169) return 'i64';
  if (code <= 179) return 'i16';
  if (code <= 209) return 'str'; // unassigned
  if (code <= 239) return 'f64';
  if (code <= 269) return 'str'; // unassigned
  if (code <= 279) return 'i16';
  if (code <= 289) return 'i8';
  if (code <= 299) return 'bool';
  if (code <= 309) return 'str';
  if (code <= 319) return 'bin';
  if (code <= 369) return 'str'; // handles
  if (code <= 389) return 'i16';
  if (code <= 399) return 'str'; // handles
  if (code <= 409) return 'i16';
  if (code <= 419) return 'str';
  if (code <= 429) return 'i32';
  if (code <= 439) return 'str';
  if (code <= 459) return 'i32';
  if (code <= 469) return 'f64';
  if (code <= 999) return 'str'; // 470–481 strings/handles, 999 comment
  if (code === 1004) return 'bin';
  if (code <= 1009) return 'str';
  if (code <= 1059) return 'f64';
  if (code <= 1070) return 'i16';
  if (code === 1071) return 'i32';
  return 'str';
}

export function isBinaryDxf(u8: Uint8Array): boolean {
  if (u8.length < SENTINEL_LEN) return false;
  for (let i = 0; i < SENTINEL_LEN; i++)
    if (u8[i] !== BINARY_DXF_SENTINEL.charCodeAt(i)) return false;
  return true;
}

type RawPair = { code: number; kind: ValueKind; value: string | null; s0: number; s1: number };

const corrupt = (msg: string, at: number) =>
  new DxfImportError('corrupt', `binary DXF: ${msg} (byte ${at})`);

/** Decodes pairs; strings stay as byte ranges until the file's encoding is known. */
function scan(u8: Uint8Array, mode: BinaryDxfMode, limit = Infinity): RawPair[] {
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  const out: RawPair[] = [];
  let i = SENTINEL_LEN;
  const need = (n: number, what: string) => {
    if (i + n > u8.length) throw corrupt(`the file ends inside ${what}`, i);
  };
  while (i < u8.length && out.length < limit) {
    const at = i;
    let code: number;
    if (mode === 'r12') {
      need(1, 'a group code');
      code = u8[i++];
      if (code === 255) {
        need(2, 'an extended group code');
        code = dv.getInt16(i, true);
        i += 2;
      }
    } else {
      need(2, 'a group code');
      code = dv.getInt16(i, true);
      i += 2;
    }
    const kind = valueKind(code);
    const what = `the value of group ${code}`;
    let value: string | null = null;
    let s0 = 0;
    let s1 = 0;
    switch (kind) {
      case 'str': {
        const end = u8.indexOf(0, i);
        if (end < 0) throw corrupt(`${what} has no terminating NUL`, at);
        s0 = i;
        s1 = end;
        i = end + 1;
        break;
      }
      case 'f64':
        need(8, what);
        value = String(dv.getFloat64(i, true));
        i += 8;
        break;
      case 'i8':
      case 'bool':
        need(1, what);
        value = String(u8[i]);
        i += 1;
        break;
      case 'i16':
        need(2, what);
        value = String(dv.getInt16(i, true));
        i += 2;
        break;
      case 'i32':
        need(4, what);
        value = String(dv.getInt32(i, true));
        i += 4;
        break;
      case 'i64':
        need(8, what);
        value = String(dv.getBigInt64(i, true));
        i += 8;
        break;
      case 'bin': {
        need(1, `the length of ${what}`);
        const n = u8[i++];
        need(n, what);
        let h = '';
        for (let k = 0; k < n; k++) h += u8[i + k].toString(16).toUpperCase().padStart(2, '0');
        value = h;
        i += n;
        break;
      }
    }
    out.push({ code, kind, value, s0, s1 });
  }
  return out;
}

/** The first pair decides the group-code width: it must read as 0/SECTION or a 999 comment. */
function detectMode(u8: Uint8Array): BinaryDxfMode {
  for (const mode of ['r13+', 'r12'] as const) {
    let first: RawPair[];
    try {
      first = scan(u8, mode, 1);
    } catch {
      continue;
    }
    const p = first[0];
    if (!p || p.kind !== 'str') continue;
    const v = latin1(u8.subarray(p.s0, p.s1)).trim();
    if ((p.code === 0 && v === 'SECTION') || p.code === 999) return mode;
  }
  throw new DxfImportError(
    'corrupt',
    'binary DXF: the data after the sentinel does not start with a SECTION — the file is damaged or truncated',
  );
}

function latin1(u: Uint8Array): string {
  let s = '';
  for (let i = 0; i < u.length; i += 8192)
    s += String.fromCharCode(...u.subarray(i, Math.min(u.length, i + 8192)));
  return s;
}

export type BinaryDxf = {
  tok: Tokenized;
  mode: BinaryDxfMode;
  encoding: string;
  fallback: boolean;
  /** Leading 999 comment carries our manifest tag (the ASCII path's `isOurDxf`). */
  manifest: boolean;
  /** String values of the first pairs joined by newlines — for producer sniffing (ezdxf). */
  probeText: string;
};

export function readBinaryDxf(u8: Uint8Array): BinaryDxf {
  if (u8.length <= SENTINEL_LEN)
    throw new DxfImportError('empty', 'the binary DXF holds no data after its header');
  const mode = detectMode(u8);
  const pairs = scan(u8, mode);

  // Encoding: UTF-8 if every string is valid UTF-8, else the declared ANSI codepage, else cp1251.
  const utf8 = new TextDecoder('utf-8', { fatal: true });
  let allUtf8 = true;
  for (const p of pairs) {
    if (p.kind !== 'str' || p.s1 === p.s0) continue;
    let hi = false;
    for (let k = p.s0; k < p.s1; k++)
      if (u8[k] > 0x7f) {
        hi = true;
        break;
      }
    if (!hi) continue;
    try {
      utf8.decode(u8.subarray(p.s0, p.s1));
    } catch {
      allUtf8 = false;
      break;
    }
  }
  let decode = (b: Uint8Array) => utf8.decode(b);
  let encoding = 'utf-8';
  if (!allUtf8) {
    let cp = 'windows-1251';
    for (let k = 0; k + 1 < pairs.length && k < 4000; k++) {
      const p = pairs[k];
      if (p.code === 9 && latin1(u8.subarray(p.s0, p.s1)).trim() === '$DWGCODEPAGE') {
        const m = /ANSI_(\d{3,4})/i.exec(latin1(u8.subarray(pairs[k + 1].s0, pairs[k + 1].s1)));
        if (m) cp = `windows-${m[1]}`;
        break;
      }
    }
    encoding = 'latin1';
    decode = latin1;
    for (const enc of [cp, 'windows-1251']) {
      try {
        const d = new TextDecoder(enc);
        decode = (b) => d.decode(b);
        encoding = enc;
        break;
      } catch {
        // decoder not available in this runtime — try the next one
      }
    }
  }

  // Same rules as `tokenize`: 999 comments before the first SECTION are the leading block (our
  // manifest), later ones are counted and dropped; `line` is the line the code would sit on in
  // the ASCII rendering of the same pairs (2·k + 1), so messages and warnings match.
  const tags: Tag[] = [];
  const leadingComments: string[] = [];
  let innerComments = 0;
  let sawSection = false;
  const probe: string[] = [];
  for (let k = 0; k < pairs.length; k++) {
    const p = pairs[k];
    const value = p.kind === 'str' ? decode(u8.subarray(p.s0, p.s1)) : (p.value as string);
    if (p.kind === 'str' && k < 20000) probe.push(value);
    if (p.code === 999) {
      if (!sawSection) leadingComments.push(value);
      else innerComments++;
      continue;
    }
    if (p.code === 0 && value.trim() === 'SECTION') sawSection = true;
    tags.push({ code: p.code, value, line: 2 * k + 1 });
  }
  if (tags.length === 0) throw new DxfImportError('empty', 'the file holds no DXF data');
  return {
    tok: { tags, leadingComments, innerComments },
    mode,
    encoding,
    fallback: encoding !== 'utf-8',
    manifest: leadingComments.some((c) => c.trim().startsWith(MANIFEST_TAG)),
    probeText: probe.join('\n'),
  };
}
