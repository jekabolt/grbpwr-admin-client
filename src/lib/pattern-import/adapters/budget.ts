// C4 · Bounded work for the adapters. One `WorkBudget` per read of the session's files (the
// session hands it in `ExtractOpts.budget`; a caller without one gets a budget per file): every
// point an adapter emits, every PDF operator and every SVG element it visits spends one unit, so a
// hostile or broken file (a `<use>` fan-out, a million arcs of a 25 m radius, a page of operators)
// is refused with a typed error instead of filling the worker. `assertFiniteDoc` is the output
// boundary: a coordinate that is not a finite number (`1e309` parses to Infinity) refuses the file.
//
// Adapters cannot import the worker's `ImportError` (worker graph): the errors are NAMED, and
// worker/errors.ts maps the names to wire codes ('InputTooLarge' → too-large, 'CorruptInput' →
// corrupt), so the wizard says them like every other refusal.
import type { SourceDoc, WorkBudgetLike } from '../types';
import { PATIMPORT } from '../types';

/** A refusal of the input's size or complexity (wire code `too-large`). */
export function inputTooLarge(message: string): Error {
  const e = new Error(message);
  e.name = 'InputTooLarge';
  return e;
}

/** A refusal of damaged content (wire code `corrupt`). */
export function corruptInput(message: string): Error {
  const e = new Error(message);
  e.name = 'CorruptInput';
  return e;
}

const millions = (n: number) => `${+(n / 1e6).toFixed(1)} million`;

export class WorkBudget implements WorkBudgetLike {
  used = 0;
  constructor(readonly limit: number = PATIMPORT.maxWorkUnits) {}
  spend(units: number, what: string): void {
    this.used += units;
    if (this.used > this.limit)
      throw inputTooLarge(
        `the drawing is too complex for the browser: ${what} take more than ${millions(this.limit)} points and drawing steps in this import. Export only the pattern pieces (no fills, hatching, photos or repeated symbols), or import fewer files at once.`,
      );
  }
}

/** The run's budget, or a fresh one for a caller that brought none. */
export const budgetOf = (opts: { budget?: WorkBudgetLike } | undefined): WorkBudgetLike =>
  opts?.budget ?? new WorkBudget();

const finite = (v: number) => typeof v === 'number' && Number.isFinite(v);

/** Every number an adapter hands on is finite; else the file is refused as damaged. */
export function assertFiniteDoc(doc: SourceDoc): void {
  for (const pg of doc.pages) {
    const where = `page ${pg.page + 1}`;
    if (!finite(pg.widthMm) || !finite(pg.heightMm))
      throw nonFinite(`${where}: the page size`, pg.widthMm, pg.heightMm);
    for (const p of pg.paths)
      for (const q of p.pts)
        if (!finite(q.x) || !finite(q.y))
          throw nonFinite(`${where}: a line (drawing step ${p.src.op})`, q.x, q.y);
    for (const t of pg.texts) {
      const b = t.bbox;
      if (
        !finite(t.anchor.x) ||
        !finite(t.anchor.y) ||
        !finite(t.fontSizeMm) ||
        !finite(b.minX) ||
        !finite(b.minY) ||
        !finite(b.maxX) ||
        !finite(b.maxY)
      )
        throw nonFinite(`${where}: the text «${t.text.slice(0, 24)}»`, t.anchor.x, t.anchor.y);
    }
    for (const r of pg.rasters ?? []) {
      const b = r.bbox;
      if (!finite(b.minX) || !finite(b.minY) || !finite(b.maxX) || !finite(b.maxY))
        throw nonFinite(`${where}: an embedded image`, b.minX, b.minY);
    }
  }
}

function nonFinite(what: string, x: number, y: number): Error {
  return corruptInput(
    `${what} has a coordinate that is not a finite number (${x}, ${y}) — a value like 1e309 overflows. The file is damaged or was written by a broken exporter: export it again.`,
  );
}

const RASTER_HINT =
  'Scan at 150 dpi (A1 and smaller) or 200 dpi (A2 and smaller), or split an A0 sheet into parts.';
const megapixels = (px: number) => `${Math.round(px / 1e6)} megapixels`;

/** C5: the refusal of a scan with more pixels than the tracer may hold (worker/limits.ts). */
export function rasterPixelsMessage(width: number, height: number, name: string): string {
  return `${name} is ${width} × ${height} px (${megapixels(width * height)}); the importer traces scans up to ${megapixels(PATIMPORT.maxRasterPixels)}. ${RASTER_HINT}`;
}

/** Throws the typed refusal when decoded pixels exceed the limit — before any work buffer. */
export function assertRasterPixels(width: number, height: number, name: string): void {
  if (!(width > 0) || !(height > 0) || width * height > PATIMPORT.maxRasterPixels)
    throw inputTooLarge(rasterPixelsMessage(width, height, name));
}

/** The same limit for all images of one PDF page together (they are traced together). */
export function assertRasterPagePixels(pixels: number, where: string): void {
  if (pixels > PATIMPORT.maxRasterPixels)
    throw inputTooLarge(
      `${where}: its scanned images hold ${megapixels(pixels)}; the importer traces up to ${megapixels(PATIMPORT.maxRasterPixels)} per page. ${RASTER_HINT}`,
    );
}

/**
 * C5 follow-up: image XObjects of a PDF larger than the raster limit, read off the raw bytes. The
 * pdf.js guard (`maxImageSize`) drops such an image without a trace — its paint operator never
 * reaches the walkers — so a scan PDF at 300 dpi would import as an empty page. An image is a
 * stream, so its dictionary is never inside an object stream: it sits between the object header
 * and its `stream` keyword, read with the PDF lexer (F14 T1: comments and any PDF whitespace may
 * separate `/Subtype` from `/Image`, names may be `#xx`-escaped).
 *
 * F14 R8 / S2: a size may be indirect (`/Width 12 0 R`). Such a reference is resolved from an
 * index of EVERY plain integer object written uncompressed (`12 0 obj 6000 endobj`, the last
 * definition wins), built in one linear pass on the first indirect size — no per-lookup cap that
 * a file could exhaust with decoy images. A size that still cannot be read (the integer inside a
 * compressed object stream, odd syntax) is counted in `unknown`; the readers refuse such a file
 * (`unreadablePdfImagesMessage`).
 */
export function pdfImageScan(
  bytes: ArrayBuffer,
  max: number = PATIMPORT.maxRasterPixels,
): { oversized: { width: number; height: number }[]; unknown: number } {
  const u = new Uint8Array(bytes);
  const out: { width: number; height: number }[] = [];
  let unknown = 0;
  // pass 1: the dictionary of every stream object, read with the PDF lexer (whitespace incl. NUL
  // and form feed, `%` comments, `#xx` in names, strings, nested containers) — every image's size,
  // direct or as a reference "num gen". A stream whose dictionary cannot be read counts as an image
  // of unknown size (refused), never as "no image".
  type Size = number | string | null;
  const images: [Size, Size][] = [];
  let prev = 0;
  for (let i = findBytes(u, STREAM, 0); i !== -1; i = findBytes(u, STREAM, i + STREAM.length)) {
    const after = u[i + STREAM.length];
    const isKw = (i === 0 || !isRegular(u[i - 1])) && !isRegular(after); // not endstream
    if (!isKw) continue;
    const lo = Math.max(prev, i - STREAM_DICT_MAX);
    prev = i + STREAM.length;
    const head = lastObjKeyword(u, lo, i);
    const dict = head < 0 ? null : streamDict(u, head, i);
    if (!dict) {
      images.push([null, null]); // unreadable: it may be an image (`/Im#61ge` …) — unknown
      continue;
    }
    const sub = dict.get('Subtype');
    // pdf.js paints an XObject by its /Subtype name, resolving a reference: an indirect subtype
    // with a size key may be an image
    const isImage =
      sub?.t === 'name'
        ? sub.v === 'Image'
        : sub?.t === 'ref' &&
          (dict.has('Width') || dict.has('Height') || dict.has('W') || dict.has('H'));
    if (!isImage) continue;
    const size = (k: string, short: string): Size => {
      const v = dict.get(k) ?? dict.get(short);
      return v?.t === 'num' ? v.n : v?.t === 'ref' ? v.v : null;
    };
    images.push([size('Width', 'W'), size('Height', 'H')]);
  }
  // pass 2 (only when a size is indirect): ONE linear pass indexing the referenced integers
  const refs = new Set(images.flat().filter((x): x is string => typeof x === 'string'));
  const ints = refs.size ? plainIntObjects(u, refs) : new Map<string, number>();
  const value = (x: Size) => (typeof x === 'string' ? ints.get(x) ?? null : x);
  for (const [w, h] of images) {
    const width = value(w);
    const height = value(h);
    if (width == null || height == null) {
      unknown++;
      continue;
    }
    if (width * height > max) out.push({ width, height });
  }
  return { oversized: out, unknown };
}

/** The oversized images only (see `pdfImageScan`). */
export function oversizedPdfImages(
  bytes: ArrayBuffer,
  max: number = PATIMPORT.maxRasterPixels,
): { width: number; height: number }[] {
  return pdfImageScan(bytes, max).oversized;
}

const isWs = (c: number) =>
  c === 0x20 || c === 0x0a || c === 0x0d || c === 0x09 || c === 0x0c || c === 0x00;
const isDigit = (c: number) => c >= 0x30 && c <= 0x39;
const isAlnum = (c: number) => isDigit(c) || (c >= 0x41 && c <= 0x5a) || (c >= 0x61 && c <= 0x7a);
const ENDOBJ = [0x65, 0x6e, 0x64, 0x6f, 0x62, 0x6a]; // "endobj"

/**
 * F14 S2: the `wanted` `num gen obj <integer> endobj` written uncompressed, keyed `"num gen"`, in ONE
 * forward pass over the bytes (each "obj" keyword looks back over at most two ≤ 10-digit numbers
 * and their whitespace, forward over one ≤ 15-digit integer — O(bytes)). A later definition
 * overrides an earlier one, as an incremental update does.
 */
function plainIntObjects(u: Uint8Array, wanted: ReadonlySet<string>): Map<string, number> {
  const out = new Map<string, number>();
  const n = u.length;
  const numAt = (a: number, b: number) => {
    let v = 0;
    for (let k = a; k < b; k++) v = v * 10 + (u[k] - 0x30);
    return v;
  };
  for (let i = 1; i + 2 < n; i++) {
    if (u[i] !== 0x6f || u[i + 1] !== 0x62 || u[i + 2] !== 0x6a) continue; // "obj"
    if (i + 3 < n && isAlnum(u[i + 3])) continue; // "objx"
    // back: ws+ gen ws+ num, preceded by a non-word byte
    let j = i - 1;
    if (j < 0 || !isWs(u[j])) continue;
    let w = 0;
    while (j >= 0 && isWs(u[j]) && w++ < 16) j--;
    const genEnd = j + 1;
    while (j >= 0 && isDigit(u[j]) && genEnd - j <= 10) j--;
    const genStart = j + 1;
    if (genStart === genEnd || (j >= 0 && !isWs(u[j]))) continue;
    w = 0;
    while (j >= 0 && isWs(u[j]) && w++ < 16) j--;
    const numEnd = j + 1;
    while (j >= 0 && isDigit(u[j]) && numEnd - j <= 10) j--;
    const numStart = j + 1;
    if (numStart === numEnd || (j >= 0 && isAlnum(u[j]))) continue;
    // forward: ws* integer ws* endobj
    let k = i + 3;
    w = 0;
    while (k < n && isWs(u[k]) && w++ < 16) k++;
    const vStart = k;
    while (k < n && isDigit(u[k]) && k - vStart < 15) k++;
    if (k === vStart || (k < n && isDigit(u[k]))) continue;
    const value = numAt(vStart, k);
    w = 0;
    while (k < n && isWs(u[k]) && w++ < 16) k++;
    let end = k + ENDOBJ.length <= n;
    for (let q = 0; q < ENDOBJ.length && end; q++) end = u[k + q] === ENDOBJ[q];
    if (!end) continue;
    const key = `${numAt(numStart, numEnd)} ${numAt(genStart, genEnd)}`;
    if (wanted.has(key)) out.set(key, value);
  }
  return out;
}

// ── a minimal PDF lexer for one stream dictionary (F14 T1) ──────────────────────────────────

const STREAM = Array.from('stream', (c) => c.charCodeAt(0));
/** Bytes looked back from a `stream` keyword for its object header. */
const STREAM_DICT_MAX = 65536;

const isPdfWs = (c: number) =>
  c === 0x20 || c === 0x0a || c === 0x0d || c === 0x09 || c === 0x0c || c === 0x00;
const isDelim = (c: number) =>
  c === 0x28 ||
  c === 0x29 ||
  c === 0x3c ||
  c === 0x3e ||
  c === 0x5b ||
  c === 0x5d ||
  c === 0x7b ||
  c === 0x7d ||
  c === 0x2f ||
  c === 0x25;
const isRegular = (c: number | undefined) => c !== undefined && !isPdfWs(c) && !isDelim(c);

function findBytes(u: Uint8Array, pat: number[], from: number, to = u.length): number {
  for (
    let i = u.indexOf(pat[0], from);
    i !== -1 && i + pat.length <= to;
    i = u.indexOf(pat[0], i + 1)
  ) {
    let ok = true;
    for (let k = 1; k < pat.length && ok; k++) ok = u[i + k] === pat[k];
    if (ok) return i;
  }
  return -1;
}

/** Start of the last `obj` keyword token in [lo, hi) (just past it), or -1. */
function lastObjKeyword(u: Uint8Array, lo: number, hi: number): number {
  for (let i = hi - 3; i >= lo; i--) {
    if (u[i] !== 0x6f || u[i + 1] !== 0x62 || u[i + 2] !== 0x6a) continue;
    if (isRegular(u[i - 1]) || isRegular(u[i + 3])) continue; // "endobj", "objx"
    return i + 3;
  }
  return -1;
}

type PdfVal =
  | { t: 'name'; v: string }
  | { t: 'num'; n: number }
  | { t: 'ref'; v: string }
  | { t: 'other' };
type PdfTok = (
  | { t: 'name'; v: string }
  | { t: 'num'; n: number; raw: string }
  | { t: 'kw'; v: string }
  | { t: '<<' | '>>' | '[' | ']' | 'str' }
) & { at?: number; end?: number };

/** Tokens of u[a, b) by the PDF lexer; null when a string or hex string runs past b. */
function pdfTokens(u: Uint8Array, a: number, b: number): PdfTok[] | null {
  const out: PdfTok[] = [];
  let i = a;
  let n = 0;
  let s = a;
  while (i < b) {
    // RASTER: every token keeps its byte span [at, end) (the placeholder rewrite needs it)
    for (; n < out.length; n++) {
      out[n].at = s;
      out[n].end = i;
    }
    s = i;
    const c = u[i];
    if (isPdfWs(c)) i++;
    else if (c === 0x25) {
      while (i < b && u[i] !== 0x0a && u[i] !== 0x0d) i++;
    } else if (c === 0x2f) {
      let v = '';
      i++;
      while (i < b && isRegular(u[i])) {
        const hex = u[i] === 0x23 && i + 2 < b ? String.fromCharCode(u[i + 1], u[i + 2]) : '';
        if (/^[0-9A-Fa-f]{2}$/.test(hex)) {
          v += String.fromCharCode(parseInt(hex, 16));
          i += 3;
          continue;
        }
        v += String.fromCharCode(u[i++]);
      }
      out.push({ t: 'name', v });
    } else if (c === 0x3c && u[i + 1] === 0x3c) {
      out.push({ t: '<<' });
      i += 2;
    } else if (c === 0x3e && u[i + 1] === 0x3e) {
      out.push({ t: '>>' });
      i += 2;
    } else if (c === 0x3c) {
      const e = u.indexOf(0x3e, i + 1);
      if (e === -1 || e >= b) return null;
      out.push({ t: 'str' });
      i = e + 1;
    } else if (c === 0x28) {
      let depth = 1;
      i++;
      while (i < b && depth > 0) {
        if (u[i] === 0x5c) i += 2;
        else {
          if (u[i] === 0x28) depth++;
          else if (u[i] === 0x29) depth--;
          i++;
        }
      }
      if (depth > 0) return null;
      out.push({ t: 'str' });
    } else if (c === 0x5b || c === 0x5d) {
      out.push({ t: c === 0x5b ? '[' : ']' });
      i++;
    } else if (isDelim(c))
      i++; // stray ) > { }
    else {
      const s0 = i;
      while (i < b && isRegular(u[i])) i++;
      const raw = latin1Of(u.subarray(s0, i));
      if (/^[+-]?(\d+\.?\d*|\.\d+)$/.test(raw)) out.push({ t: 'num', n: Number(raw), raw });
      else out.push({ t: 'kw', v: raw });
    }
  }
  for (; n < out.length; n++) {
    out[n].at = s;
    out[n].end = i;
  }
  return out;
}

/**
 * The top-level entries of the dictionary between an object header and its `stream` keyword:
 * `<< … >>` must close right before `stream`. null when it does not read as one dictionary.
 */
function streamDict(u: Uint8Array, a: number, b: number): Map<string, PdfVal> | null {
  const tk = pdfTokens(u, a, b);
  if (!tk || tk.length < 2 || tk[0].t !== '<<' || tk[tk.length - 1].t !== '>>') return null;
  const out = new Map<string, PdfVal>();
  let k = 1;
  const skip = (open: string, close: string) => {
    let d = 1;
    k++;
    while (k < tk.length && d > 0) {
      if (tk[k].t === open) d++;
      else if (tk[k].t === close) d--;
      k++;
    }
    return d === 0;
  };
  while (k < tk.length - 1) {
    const key = tk[k];
    if (key.t !== 'name') return null;
    k++;
    const v = tk[k];
    if (!v || k >= tk.length - 1) return null;
    if (v.t === 'name') {
      out.set(key.v, { t: 'name', v: v.v });
      k++;
    } else if (
      v.t === 'num' &&
      tk[k + 1]?.t === 'num' &&
      tk[k + 2]?.t === 'kw' &&
      (tk[k + 2] as { v: string }).v === 'R'
    ) {
      out.set(key.v, { t: 'ref', v: `${v.n} ${(tk[k + 1] as { n: number }).n}` });
      k += 3;
    } else if (v.t === 'num') {
      out.set(key.v, { t: 'num', n: v.n });
      k++;
    } else if (v.t === '<<') {
      if (!skip('<<', '>>')) return null;
      out.set(key.v, { t: 'other' });
    } else if (v.t === '[') {
      if (!skip('[', ']')) return null;
      out.set(key.v, { t: 'other' });
    } else if (v.t === 'str' || v.t === 'kw') {
      out.set(key.v, { t: 'other' });
      k++;
    } else return null;
  }
  return k === tk.length - 1 ? out : null;
}

function latin1Of(u: Uint8Array): string {
  let s = '';
  for (let i = 0; i < u.length; i++) s += String.fromCharCode(u[i]);
  return s;
}

/**
 * F14 R8 / S2: images whose pixel size the raw scan cannot read even with every plain integer
 * object indexed. pdf.js reads them and silently drops one over the limit, so the importer cannot
 * tell a logo from a 300 dpi scan — such a file is refused (both PDF readers), never imported with
 * a hole where the scan was.
 */
export function unreadablePdfImagesMessage(n: number): string {
  return `${n === 1 ? 'an embedded image' : `${n} embedded images`} ${n === 1 ? 'has' : 'have'} a pixel size the importer cannot read before decoding (stored in a compressed part of the PDF), so ${n === 1 ? 'it' : 'they'} may exceed the ${megapixels(PATIMPORT.maxRasterPixels)} the importer traces and would be dropped without a trace. Export the PDF again (PDF 1.4, no object compression) or remove the images. ${RASTER_HINT}`;
}

/** The refusal / note for oversized PDF images (same dpi guidance as a scan file). */
export function oversizedPdfImagesMessage(imgs: { width: number; height: number }[]): string {
  const big = [...imgs].sort((a, b) => b.width * b.height - a.width * a.height)[0];
  return `${imgs.length === 1 ? 'an embedded image' : `${imgs.length} embedded images`} (${big.width} × ${big.height} px, ${megapixels(big.width * big.height)}) ${imgs.length === 1 ? 'exceeds' : 'exceed'} the ${megapixels(PATIMPORT.maxRasterPixels)} the importer traces and ${imgs.length === 1 ? 'is' : 'are'} not read. ${RASTER_HINT}`;
}

// ── RASTER: image streams as written (an oversized scan decoded by the raster adapter) ───────

/**
 * One image XObject as the file writes it — what the raster adapter needs to decode an image
 * pdf.js drops for its size (`maxImageSize`) itself, in rows, and to stand a placeholder in its
 * place so pdf.js still reports where the page paints it (adapters/raster/big-image.ts).
 */
export type PdfImageStream = {
  /** "num gen" of the object, null when its header does not read. */
  obj: string | null;
  width: number | null;
  height: number | null;
  /** Byte spans [at, end) of the DIRECT /Width and /Height numbers (null when indirect). */
  widthSpan: [number, number] | null;
  heightSpan: [number, number] | null;
  /** Filter names in order ([] = none); null when the entry is not a name or array of names. */
  filters: string[] | null;
  /** Byte spans of the whole /Filter and /DecodeParms entries (key + value). */
  filterSpan: [number, number] | null;
  parmsSpan: [number, number] | null;
  /** Numeric entries of /DecodeParms (of the one filter); null = absent; 'other' = not readable. */
  parms: Record<string, number> | null | 'other';
  bpc: number | null;
  /** A device colour space name, `icc:<num gen>` (ICCBased stream), or 'other'; null = absent. */
  colorSpace: string | null;
  imageMask: boolean;
  /** /Decode, /SMask, /Mask present. */
  decode: boolean;
  smask: boolean;
  mask: boolean;
  /** The raw stream bytes [at, end). */
  data: [number, number];
};

type PVal =
  | { t: 'name'; v: string; at: number; end: number }
  | { t: 'num'; n: number; at: number; end: number }
  | { t: 'ref'; v: string; at: number; end: number }
  | { t: 'kw'; v: string; at: number; end: number }
  | { t: 'arr'; items: PVal[]; at: number; end: number }
  | { t: 'dict'; map: Map<string, { key: number; val: PVal }>; at: number; end: number }
  | { t: 'other'; at: number; end: number };

/** One value at tk[k] (containers recursive); null when it does not read. */
function pval(tk: PdfTok[], k: number, depth = 0): { v: PVal; next: number } | null {
  const t = tk[k];
  if (!t || depth > 16) return null;
  const at = t.at ?? 0;
  const end = t.end ?? 0;
  if (t.t === 'name') return { v: { t: 'name', v: t.v, at, end }, next: k + 1 };
  if (t.t === 'num') {
    const g = tk[k + 1];
    const r = tk[k + 2];
    if (g?.t === 'num' && r?.t === 'kw' && r.v === 'R')
      return { v: { t: 'ref', v: `${t.n} ${g.n}`, at, end: r.end ?? end }, next: k + 3 };
    return { v: { t: 'num', n: t.n, at, end }, next: k + 1 };
  }
  if (t.t === 'kw') return { v: { t: 'kw', v: t.v, at, end }, next: k + 1 };
  if (t.t === 'str') return { v: { t: 'other', at, end }, next: k + 1 };
  if (t.t === '[') {
    const items: PVal[] = [];
    let j = k + 1;
    while (j < tk.length && tk[j].t !== ']') {
      const r = pval(tk, j, depth + 1);
      if (!r) return null;
      items.push(r.v);
      j = r.next;
    }
    if (j >= tk.length) return null;
    return { v: { t: 'arr', items, at, end: tk[j].end ?? end }, next: j + 1 };
  }
  if (t.t === '<<') {
    const map = new Map<string, { key: number; val: PVal }>();
    let j = k + 1;
    while (j < tk.length && tk[j].t !== '>>') {
      const key = tk[j];
      if (key.t !== 'name') return null;
      const r = pval(tk, j + 1, depth + 1);
      if (!r) return null;
      map.set(key.v, { key: key.at ?? 0, val: r.v });
      j = r.next;
    }
    if (j >= tk.length) return null;
    return { v: { t: 'dict', map, at, end: tk[j].end ?? end }, next: j + 1 };
  }
  return null;
}

/** "num gen" of the header whose `obj` keyword starts at `objAt`, or null. */
function objHeader(u: Uint8Array, objAt: number): string | null {
  let j = objAt - 1;
  const nums: number[] = [];
  for (let n = 0; n < 2; n++) {
    let w = 0;
    while (j >= 0 && isWs(u[j]) && w++ < 16) j--;
    const e = j + 1;
    while (j >= 0 && isDigit(u[j]) && e - j <= 10) j--;
    if (j + 1 === e) return null;
    let v = 0;
    for (let q = j + 1; q < e; q++) v = v * 10 + (u[q] - 0x30);
    nums.push(v);
  }
  return `${nums[1]} ${nums[0]}`;
}

const ENDSTREAM = Array.from('endstream', (c) => c.charCodeAt(0));
const ENCRYPT = Array.from('/Encrypt', (c) => c.charCodeAt(0));

/**
 * Every image stream of a PDF with its dictionary read for decoding (see `PdfImageStream`), the
 * /N of every stream that carries one (ICC profiles), and whether the file is encrypted (its
 * stream bytes are then not the image's). Same lexer and bounds as `pdfImageScan`.
 */
export function pdfImageStreams(bytes: ArrayBuffer): {
  images: PdfImageStream[];
  iccN: Map<string, number>;
  encrypted: boolean;
} {
  const u = new Uint8Array(bytes);
  const images: PdfImageStream[] = [];
  const iccN = new Map<string, number>();
  let prev = 0;
  // the search resumes after each stream's payload: bytes inside a stream are never read as a
  // dictionary (a payload that spells `obj << /Subtype /Image … >> stream` cannot be patched)
  let next = 0;
  const sizeRefs: [PdfImageStream, 'width' | 'height', string][] = [];
  for (let i = findBytes(u, STREAM, 0); i !== -1; i = findBytes(u, STREAM, Math.max(next, i + STREAM.length))) {
    const after = u[i + STREAM.length];
    const isKw = (i === 0 || !isRegular(u[i - 1])) && !isRegular(after);
    if (!isKw) continue;
    const lo = Math.max(prev, i - STREAM_DICT_MAX);
    prev = i + STREAM.length;
    const head = lastObjKeyword(u, lo, i);
    if (head < 0) continue;
    const tk = pdfTokens(u, head, i);
    if (!tk || !tk.length || tk[0].t !== '<<') continue;
    const r = pval(tk, 0);
    if (!r || r.v.t !== 'dict' || r.next !== tk.length) continue;
    const m = r.v.map;
    const obj = objHeader(u, head - 3);
    const get = (k: string, short?: string) => (m.get(k) ?? (short ? m.get(short) : undefined))?.val;
    // the stream's bytes: after the EOL that follows `stream`, up to /Length (direct) or the
    // `endstream` keyword (its EOL trimmed)
    let at = i + STREAM.length;
    if (u[at] === 0x0d && u[at + 1] === 0x0a) at += 2;
    else if (u[at] === 0x0a || u[at] === 0x0d) at++;
    let end = -1;
    const len = get('Length');
    if (len?.t === 'num' && len.n >= 0 && at + len.n <= u.length) {
      let q = at + len.n;
      let w = 0;
      while (q < u.length && isPdfWs(u[q]) && w++ < 4) q++;
      if (ENDSTREAM.every((c, k) => u[q + k] === c)) end = at + len.n;
    }
    if (end < 0) {
      const es = findBytes(u, ENDSTREAM, at);
      if (es < 0) continue;
      end = es;
      if (u[end - 1] === 0x0a) end--;
      if (u[end - 1] === 0x0d) end--;
    }
    prev = next = end;
    const nv = get('N');
    if (obj && nv?.t === 'num') iccN.set(obj, nv.n);
    const sub = get('Subtype');
    if (!(sub?.t === 'name' && sub.v === 'Image')) continue;
    const num = (v: PVal | undefined) => (v?.t === 'num' ? v.n : null);
    const span = (k: string, short?: string): [number, number] | null => {
      const e = m.get(k) ?? (short ? m.get(short) : undefined);
      return e ? [e.key, e.val.end] : null;
    };
    const f = get('Filter', 'F');
    const filters =
      f === undefined
        ? []
        : f.t === 'name'
          ? [f.v]
          : f.t === 'arr' && f.items.every((x) => x.t === 'name')
            ? f.items.map((x) => (x as { v: string }).v)
            : null;
    let pv = get('DecodeParms', 'DP');
    // one filter, one parameter set: any other array shape is not guessed at
    let badArr = false;
    if (pv?.t === 'arr') {
      if (pv.items.length === 1) pv = pv.items[0];
      else {
        badArr = true;
        pv = undefined;
      }
    }
    let parms: PdfImageStream['parms'] = null;
    if (pv?.t === 'dict') {
      // a parameter the decoder uses must be a plain number — an indirect one is not guessed
      const o: Record<string, number> = {};
      let ok = true;
      for (const [k, e] of pv.map)
        if (e.val.t === 'num') o[k] = e.val.n;
        else if (['Predictor', 'Colors', 'BitsPerComponent', 'Columns', 'ColorTransform'].includes(k))
          ok = false;
      parms = ok ? o : 'other';
    } else if (badArr || (pv && !(pv.t === 'kw' && pv.v === 'null'))) parms = 'other';
    const cs = get('ColorSpace', 'CS');
    const colorSpace =
      cs === undefined
        ? null
        : cs.t === 'name'
          ? cs.v
          : cs.t === 'arr' &&
              cs.items.length === 2 &&
              cs.items[0].t === 'name' &&
              cs.items[0].v === 'ICCBased' &&
              cs.items[1].t === 'ref'
            ? `icc:${cs.items[1].v}`
            : 'other';
    const w = get('Width', 'W');
    const h = get('Height', 'H');
    const im = get('ImageMask', 'IM');
    const rec: PdfImageStream = {
      obj,
      width: num(w),
      height: num(h),
      widthSpan: w?.t === 'num' ? [w.at, w.end] : null,
      heightSpan: h?.t === 'num' ? [h.at, h.end] : null,
      filters,
      filterSpan: span('Filter', 'F'),
      parmsSpan: span('DecodeParms', 'DP'),
      parms,
      bpc: num(get('BitsPerComponent', 'BPC')),
      colorSpace,
      imageMask: im?.t === 'kw' && im.v === 'true',
      decode: !!get('Decode', 'D'),
      smask: !!get('SMask'),
      mask: !!get('Mask'),
      data: [at, end],
    };
    if (w?.t === 'ref') sizeRefs.push([rec, 'width', w.v]);
    if (h?.t === 'ref') sizeRefs.push([rec, 'height', h.v]);
    images.push(rec);
  }
  // indirect sizes resolved as pdfImageScan does (a placeholder code must not equal any image)
  if (sizeRefs.length) {
    const ints = plainIntObjects(u, new Set(sizeRefs.map((x) => x[2])));
    for (const [rec, k, ref] of sizeRefs) rec[k] = ints.get(ref) ?? null;
  }
  return { images, iccN, encrypted: findBytes(u, ENCRYPT, 0) !== -1 };
}
