// $INSUNITS of an ASCII DXF: read it, write it, and size the drawing — on raw BYTES.
//
// Bytes, not decoded text: a DXF is often cp1251/latin1, and a UTF-8 round trip would rewrite every
// non-ASCII byte of the file. Here each byte is one char (latin1 view), edits splice the string, and
// the result is re-encoded byte for byte — everything outside the edit stays identical.
//
// Pure, dependency-free (runs under node as is).

export type DxfLinearUnit = 'mm' | 'cm' | 'in';

/** $INSUNITS codes written for the three offered units. */
export const INSUNITS_CODE: Record<DxfLinearUnit, number> = { mm: 4, cm: 5, in: 1 };

// Codes the parser resolves (lib/nesting/units.ts); anything else it guesses as mm.
const KNOWN = new Set([1, 2, 4, 5, 6]);

const BINARY_SENTINEL = 'AutoCAD Binary DXF';

export type Extents = { minX: number; minY: number; maxX: number; maxY: number };

/** Bytes → one char per byte. */
export function bytesToLatin1(bytes: Uint8Array): string {
  let out = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    out += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK) as unknown as number[]);
  }
  return out;
}

/** One char per byte → bytes (inverse of bytesToLatin1). */
export function latin1ToBytes(s: string): Uint8Array {
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i) & 0xff;
  return out;
}

export function isBinaryDxf(bytes: Uint8Array): boolean {
  if (bytes.length < BINARY_SENTINEL.length) return false;
  for (let i = 0; i < BINARY_SENTINEL.length; i++)
    if (bytes[i] !== BINARY_SENTINEL.charCodeAt(i)) return false;
  return true;
}

export type DxfPair = {
  code: number;
  value: string;
  /** Offset of the code line. */
  start: number;
  /** Offset of the value text and its end (EOL excluded). */
  valueStart: number;
  valueEnd: number;
  /** Offset right after the value line's EOL. */
  next: number;
};

function lineAt(s: string, pos: number): { end: number; next: number } | null {
  if (pos >= s.length) return null;
  const nl = s.indexOf('\n', pos);
  const hard = nl < 0 ? s.length : nl;
  const end = hard > pos && s.charCodeAt(hard - 1) === 13 ? hard - 1 : hard;
  return { end, next: nl < 0 ? s.length : nl + 1 };
}

/** The code/value pairs of an ASCII DXF (latin1 view), with the offsets of each. */
export function* dxfPairs(s: string, from = 0): Generator<DxfPair> {
  let pos = from;
  // Skip a UTF-8 BOM if present.
  if (pos === 0 && s.startsWith('\xef\xbb\xbf')) pos = 3;
  for (;;) {
    const c = lineAt(s, pos);
    if (!c) return;
    const v = lineAt(s, c.next);
    if (!v) return;
    const code = Number(s.slice(pos, c.end).trim());
    if (!Number.isFinite(code)) return;
    yield {
      code,
      value: s.slice(c.next, v.end),
      start: pos,
      valueStart: c.next,
      valueEnd: v.end,
      next: v.next,
    };
    pos = v.next;
  }
}

type HeaderInfo = {
  /** Offset of the `0 / ENDSEC` pair closing HEADER; -1 = no HEADER section. */
  endsec: number;
  /** Text of the first `9` code line in HEADER (its padding is reused). */
  varCodeLine: string | null;
  vars: Map<string, DxfPair[]>;
};

function readHeader(s: string): HeaderInfo {
  const vars = new Map<string, DxfPair[]>();
  let inHeader = false;
  let pendingSection = false;
  let current: string | null = null;
  let varCodeLine: string | null = null;
  for (const p of dxfPairs(s)) {
    const value = p.value.trim();
    if (!inHeader) {
      if (p.code === 0 && value === 'SECTION') pendingSection = true;
      else if (pendingSection && p.code === 2) {
        if (value === 'HEADER') inHeader = true;
        // HEADER is the first section when present; any other section means there is none.
        else return { endsec: -1, varCodeLine: null, vars };
        pendingSection = false;
      } else if (p.code === 0 && value === 'EOF') break;
      continue;
    }
    if (p.code === 0) {
      if (value === 'ENDSEC') return { endsec: p.start, varCodeLine, vars };
      continue;
    }
    if (p.code === 9) {
      current = value;
      if (varCodeLine == null) {
        const c = lineAt(s, p.start)!;
        varCodeLine = s.slice(p.start, c.end);
      }
      vars.set(current, []);
      continue;
    }
    if (current) vars.get(current)!.push(p);
  }
  return { endsec: -1, varCodeLine, vars };
}

/** $INSUNITS as written, null when the header does not carry it. */
export function readInsunits(s: string): number | null {
  const p = readHeader(s)
    .vars.get('$INSUNITS')
    ?.find((x) => x.code === 70);
  if (!p) return null;
  const n = Number(p.value.trim());
  return Number.isFinite(n) ? n : null;
}

/** Would the parser have to guess the units of this file? (missing, 0, or a code it does not map) */
export function unitsMissing(s: string): boolean {
  const n = readInsunits(s);
  return n == null || !KNOWN.has(n);
}

function point(list: DxfPair[] | undefined): { x: number; y: number } | null {
  const x = Number(list?.find((p) => p.code === 10)?.value.trim());
  const y = Number(list?.find((p) => p.code === 20)?.value.trim());
  return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
}

const sane = (e: Extents) =>
  [e.minX, e.minY, e.maxX, e.maxY].every((v) => Number.isFinite(v) && Math.abs(v) < 1e19) &&
  e.maxX > e.minX &&
  e.maxY > e.minY;

/**
 * Drawing extents in drawing units: $EXTMIN/$EXTMAX when the header holds real ones, else the box
 * of every 10/20 point in BLOCKS and ENTITIES. null when nothing sensible comes out.
 */
export function drawingExtents(s: string): Extents | null {
  const h = readHeader(s);
  const lo = point(h.vars.get('$EXTMIN'));
  const hi = point(h.vars.get('$EXTMAX'));
  if (lo && hi) {
    const e = { minX: lo.x, minY: lo.y, maxX: hi.x, maxY: hi.y };
    if (sane(e)) return e;
  }
  const e = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  let section = '';
  let pendingSection = false;
  let x: number | null = null;
  for (const p of dxfPairs(s)) {
    if (p.code === 0) {
      const v = p.value.trim();
      if (v === 'SECTION') pendingSection = true;
      else if (v === 'ENDSEC') section = '';
      x = null;
      continue;
    }
    if (pendingSection && p.code === 2) {
      section = p.value.trim();
      pendingSection = false;
      continue;
    }
    if (section !== 'BLOCKS' && section !== 'ENTITIES') continue;
    if (p.code === 10) x = Number(p.value.trim());
    else if (p.code === 20 && x != null) {
      const y = Number(p.value.trim());
      if (Number.isFinite(x) && Number.isFinite(y)) {
        if (x < e.minX) e.minX = x;
        if (x > e.maxX) e.maxX = x;
        if (y < e.minY) e.minY = y;
        if (y > e.maxY) e.maxY = y;
      }
      x = null;
    }
  }
  return sane(e) ? e : null;
}

/**
 * Write $INSUNITS into HEADER: replace the value when the variable exists, add it before HEADER's
 * ENDSEC when it does not, add a HEADER section when the file has none. Nothing else changes.
 */
export function writeInsunits(s: string, code: number): string {
  const eol = s.includes('\r\n') ? '\r\n' : '\n';
  const h = readHeader(s);
  const has = h.vars.get('$INSUNITS')?.find((p) => p.code === 70);
  if (has) {
    const raw = s.slice(has.valueStart, has.valueEnd);
    const lead = raw.match(/^\s*/)?.[0] ?? '';
    const v = String(code);
    // Keep the right-aligned width AutoCAD writes ("     0" → "     4").
    const padded = lead.length > 0 ? v.padStart(raw.trimEnd().length) : v;
    return s.slice(0, has.valueStart) + padded + s.slice(has.valueEnd);
  }
  if (h.endsec >= 0) {
    const width = h.varCodeLine?.length ?? 1;
    const block =
      `${'9'.padStart(width)}${eol}$INSUNITS${eol}` +
      `${'70'.padStart(width)}${eol}${String(code).padStart(width > 1 ? 6 : 1)}${eol}`;
    return s.slice(0, h.endsec) + block + s.slice(h.endsec);
  }
  // No HEADER: a new one goes before the first section (comments before it stay first).
  const header = `0${eol}SECTION${eol}2${eol}HEADER${eol}9${eol}$INSUNITS${eol}70${eol}${code}${eol}0${eol}ENDSEC${eol}`;
  for (const p of dxfPairs(s)) {
    if (p.code === 0) return s.slice(0, p.start) + header + s.slice(p.start);
  }
  return header + s;
}

/** Bytes in, bytes out: the file with $INSUNITS set. */
export function withInsunits(bytes: Uint8Array, unit: DxfLinearUnit): Uint8Array {
  return latin1ToBytes(writeInsunits(bytesToLatin1(bytes), INSUNITS_CODE[unit]));
}

const MM_PER: Record<DxfLinearUnit, number> = { mm: 1, cm: 10, in: 25.4 };

/**
 * 'sheet 81.2 × 47.1 cm' — the PHYSICAL size of the drawing if its unit were `unit`, always in cm,
 * so the three choices read as three different garments and the plausible one stands out.
 */
export function sheetHint(e: Extents, unit: DxfLinearUnit): string {
  const cm = (v: number) => {
    const x = (v * MM_PER[unit]) / 10;
    return x >= 100 ? String(Math.round(x)) : (Math.round(x * 10) / 10).toString();
  };
  return `sheet ${cm(e.maxX - e.minX)} × ${cm(e.maxY - e.minY)} cm`;
}

/**
 * Why these bytes are not an ASCII DXF the rewrites (and the parser) can take, null when they are.
 * Binary DXF and UTF-16 text both read as garbage through the latin1 view.
 */
export function asciiDxfProblem(bytes: Uint8Array): string | null {
  if (isBinaryDxf(bytes)) return 'binary DXF — re-export as ASCII DXF';
  const bom16 =
    (bytes[0] === 0xff && bytes[1] === 0xfe) || (bytes[0] === 0xfe && bytes[1] === 0xff);
  const head = bytes.subarray(0, Math.min(bytes.length, 512));
  if (bom16 || head.includes(0)) return 'UTF-16 DXF — re-export as ASCII DXF';
  return null;
}
