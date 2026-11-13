// GRADE MAP BLOCK — the container that carries a grade map inside a stored DXF
// (tmp/plans/fuse-grade/GRADEMAP-DESIGN.md §3). The payload is OPAQUE bytes: this module never
// knows the map's own format (src/lib/grade-map/ owns that); it only moves bytes in and out of the
// leading 999 comment block, next to the manifest:
//
//   999
//   GRBPWR-GRADEMAP v1z 1/3 <base64>
//   …
//
// Frame before deflate: u32 LE byte length · u32 LE CRC-32 of the bytes · the bytes. Raw deflate
// has no checksum of its own; the CRC turns a flipped character into «corrupt» instead of a map
// that inflates to garbage.
//
// Rules:
// - writing replaces only our earlier block; the manifest and foreign comments stay as they were.
//   The block goes at the END of the leading block, so the manifest keeps leading the file;
// - a broken or truncated block reads as «no map» with a reason — never a throw, never a partial
//   map; the manifest is read on its own and is not affected;
// - the map is trusted only when the file's manifest is (`untrusted` otherwise). The geometry half
//   of that trust (`manifestGeometryProblems` in the parse worker) stays the caller's;
// - the block is capped (`GRADEMAP_MAX_B64`) so the whole prologue stays far below the backend's
//   4 MiB sniff limit; the manifest's 48 KB preflight does not count it (manifestPrologueBytes).
//
// Main-thread and worker safe: string + fflate only.
import { Inflate, deflateSync } from 'fflate';

import { MANIFEST_MAX_PROLOGUE_BYTES, ManifestError, readManifest } from './index';
import { GRADEMAP_TAG, isGradeMapTagged, leadingComments } from './leading';

export { GRADEMAP_TAG };

/** Line form of the block; only the compressed form exists. */
export const GRADEMAP_FORM = 'v1z' as const;
/** Characters of base64 per comment line (the manifest's width). */
export const GRADEMAP_LINE_MAX = 200;
/** Inflated payload larger than this is refused (a real card's map is tens of kB). */
export const GRADEMAP_MAX_BYTES = 4 * 1024 * 1024;
/**
 * Base64 characters the block may hold: ~1.5 MB of text, so manifest + map + foreign comments stay
 * well inside the backend's 4 MiB prologue window.
 */
export const GRADEMAP_MAX_B64 = 1_500_000;
const GRADEMAP_MAX_CHUNKS = Math.ceil(GRADEMAP_MAX_B64 / GRADEMAP_LINE_MAX);
/** Bytes of leading comments `readGradeMapBlockBytes` decodes: the manifest's bound plus ours. */
export const GRADEMAP_MAX_PROLOGUE_BYTES =
  MANIFEST_MAX_PROLOGUE_BYTES + GRADEMAP_MAX_CHUNKS * (GRADEMAP_LINE_MAX + 48);

const LINE = /^GRBPWR-GRADEMAP v1z (\d+)\/(\d+) ([A-Za-z0-9+/=]*)$/;
const B64 = /^[A-Za-z0-9+/]*={0,2}$/;

/** Thrown by the writer only: the payload is too large to embed. */
export class GradeMapBlockError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GradeMapBlockError';
  }
}

export type GradeMapBlockRead =
  /** A whole, checksummed payload in a file whose manifest is trusted. */
  | { status: 'ok'; bytes: Uint8Array }
  /** The file carries no grade map block. */
  | { status: 'absent' }
  /** A block is there but cannot be read whole (truncated, mixed, bad base64/deflate/CRC). */
  | { status: 'corrupt'; reason: string }
  /** The block is whole, but the file's manifest is missing or not trusted. */
  | { status: 'untrusted'; reason: string };

// ── CRC-32 (IEEE) ───────────────────────────────────────────────────────────────────────────────

let CRC_TABLE: Uint32Array | null = null;
function crc32(bytes: Uint8Array): number {
  if (!CRC_TABLE) {
    CRC_TABLE = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      CRC_TABLE[n] = c >>> 0;
    }
  }
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function bytesToBase64(bytes: Uint8Array): string {
  let bin = '';
  const STEP = 0x8000;
  for (let i = 0; i < bytes.length; i += STEP)
    bin += String.fromCharCode(...bytes.subarray(i, i + STEP));
  return btoa(bin);
}

/** deflate-raw → bytes, or null past `max` bytes / not deflate data. */
function inflateCapped(z: Uint8Array, max: number): Uint8Array | string {
  const parts: Uint8Array[] = [];
  let total = 0;
  let over = false;
  const inf = new Inflate((chunk) => {
    total += chunk.length;
    if (total > max) {
      over = true;
      throw new Error('over');
    }
    parts.push(chunk);
  });
  try {
    inf.push(z, true);
  } catch {
    return over ? `payload inflates past ${max} bytes` : 'payload is not deflate data';
  }
  const out = new Uint8Array(total);
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

// ── write ───────────────────────────────────────────────────────────────────────────────────────

/**
 * The DXF text with `bytes` as its grade map block (an earlier block replaced), or with no block
 * when `bytes` is null. Keeps the manifest, foreign leading comments and the file's line endings.
 * Throws `GradeMapBlockError` when the compressed payload exceeds `GRADEMAP_MAX_B64`.
 */
export function writeGradeMapBlock(dxfText: string, bytes: Uint8Array | null): string {
  const eol = dxfText.includes('\r\n') ? '\r\n' : '\n';
  const lead = leadingComments(dxfText);
  let text = dxfText;
  // remove our earlier lines back to front so earlier offsets stay valid
  let end = lead.end;
  for (const c of [...lead.comments].reverse()) {
    if (!isGradeMapTagged(c.value)) continue;
    text = text.slice(0, c.from) + text.slice(c.to);
    end -= c.to - c.from;
  }
  if (!bytes) return text;
  if (bytes.length > GRADEMAP_MAX_BYTES)
    throw new GradeMapBlockError(
      `grade map is ${bytes.length} bytes, more than ${GRADEMAP_MAX_BYTES}`,
    );
  const frame = new Uint8Array(8 + bytes.length);
  const view = new DataView(frame.buffer);
  view.setUint32(0, bytes.length, true);
  view.setUint32(4, crc32(bytes), true);
  frame.set(bytes, 8);
  const payload = bytesToBase64(deflateSync(frame, { level: 9 }));
  if (payload.length > GRADEMAP_MAX_B64)
    throw new GradeMapBlockError(
      `grade map block is ${payload.length} base64 characters, more than ${GRADEMAP_MAX_B64}`,
    );
  const chunks: string[] = [];
  for (let i = 0; i < payload.length; i += GRADEMAP_LINE_MAX)
    chunks.push(payload.slice(i, i + GRADEMAP_LINE_MAX));
  if (chunks.length === 0) chunks.push('');
  const n = chunks.length;
  const head = chunks
    .map((c, i) => `999${eol}${GRADEMAP_TAG} ${GRADEMAP_FORM} ${i + 1}/${n} ${c}${eol}`)
    .join('');
  return text.slice(0, end) + head + text.slice(end);
}

// ── read ────────────────────────────────────────────────────────────────────────────────────────

function decodeBlock(lines: readonly string[]): GradeMapBlockRead {
  let total = -1;
  const chunks = new Map<number, string>();
  for (const line of lines) {
    const m = LINE.exec(line);
    if (!m) {
      const v = /^GRBPWR-GRADEMAP (v\S*)/.exec(line);
      return {
        status: 'corrupt',
        reason: v && v[1] !== GRADEMAP_FORM ? `unknown form ${v[1]}` : 'unreadable block line',
      };
    }
    const i = Number(m[1]);
    const n = Number(m[2]);
    if (!Number.isSafeInteger(i) || !Number.isSafeInteger(n) || n < 1 || i < 1 || i > n)
      return { status: 'corrupt', reason: 'chunk index out of range' };
    if (n > GRADEMAP_MAX_CHUNKS) return { status: 'corrupt', reason: `${n} chunks is too many` };
    if (total < 0) total = n;
    else if (total !== n) return { status: 'corrupt', reason: 'chunk counts disagree' };
    if (chunks.has(i)) return { status: 'corrupt', reason: `chunk ${i}/${n} appears twice` };
    chunks.set(i, m[3]);
  }
  if (chunks.size !== total)
    return { status: 'corrupt', reason: `${total - chunks.size} of ${total} chunk(s) missing` };
  let b64 = '';
  for (let i = 1; i <= total; i++) b64 += chunks.get(i)!;
  if (b64.length > GRADEMAP_MAX_B64 || b64.length % 4 !== 0 || !B64.test(b64))
    return { status: 'corrupt', reason: 'payload is not base64' };
  let bin: string;
  try {
    bin = atob(b64);
  } catch {
    return { status: 'corrupt', reason: 'payload is not base64' };
  }
  const z = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) z[i] = bin.charCodeAt(i);
  const frame = inflateCapped(z, GRADEMAP_MAX_BYTES + 8);
  if (typeof frame === 'string') return { status: 'corrupt', reason: frame };
  if (frame.length < 8) return { status: 'corrupt', reason: 'payload frame is short' };
  const view = new DataView(frame.buffer, frame.byteOffset, frame.byteLength);
  const len = view.getUint32(0, true);
  const crc = view.getUint32(4, true);
  if (len !== frame.length - 8) return { status: 'corrupt', reason: 'payload length mismatch' };
  const bytes = frame.slice(8);
  if (crc32(bytes) !== crc) return { status: 'corrupt', reason: 'payload checksum mismatch' };
  return { status: 'ok', bytes };
}

export type ReadGradeMapOpts = {
  /**
   * The caller already knows whether the file's manifest is trusted (the parse worker reads it
   * first). Omitted → the manifest is read here: trusted = present and readable.
   */
  manifestTrusted?: boolean;
};

function manifestTrust(dxfText: string): { ok: true } | { ok: false; reason: string } {
  try {
    return readManifest(dxfText)
      ? { ok: true }
      : { ok: false, reason: 'the file carries no manifest' };
  } catch (e) {
    return {
      ok: false,
      reason: `the manifest is not trusted (${e instanceof ManifestError ? e.code : 'error'})`,
    };
  }
}

/** The grade map block of a DXF text. Never throws. */
export function readGradeMapBlock(dxfText: string, opts: ReadGradeMapOpts = {}): GradeMapBlockRead {
  const lead = leadingComments(dxfText);
  const lines = lead.comments.filter((c) => isGradeMapTagged(c.value)).map((c) => c.value);
  if (lines.length === 0) return { status: 'absent' };
  const read = decodeBlock(lines);
  if (read.status !== 'ok') return read;
  if (opts.manifestTrusted === false)
    return { status: 'untrusted', reason: 'the manifest is not trusted' };
  if (opts.manifestTrusted === undefined) {
    const t = manifestTrust(dxfText);
    if (!t.ok) return { status: 'untrusted', reason: t.reason };
  }
  return read;
}

/**
 * Bytes → grade map block, for the parse worker (beside `readManifestBytes`). Decodes only the
 * leading comment prologue (latin1 is exact: the block is ASCII), bounded by
 * `GRADEMAP_MAX_PROLOGUE_BYTES`; a block cut by that bound reads as corrupt.
 */
export function readGradeMapBlockBytes(
  buf: ArrayBuffer,
  opts: ReadGradeMapOpts = {},
): GradeMapBlockRead {
  const all = new Uint8Array(buf);
  const limit = Math.min(all.length, GRADEMAP_MAX_PROLOGUE_BYTES);
  const text = new TextDecoder('latin1').decode(all.subarray(0, limit));
  const lead = leadingComments(text);
  const truncated = limit < all.length && lead.end >= text.length - 1;
  if (truncated) {
    return text.includes(GRADEMAP_TAG)
      ? { status: 'corrupt', reason: 'the leading comment block is longer than the bound' }
      : { status: 'absent' };
  }
  return readGradeMapBlock(text.slice(0, lead.end) + '0\nEOF\n', opts);
}
