// CONVERSION MANIFEST — embedded in, and read back from, the DXF the converter writes (08-CONTRACT §3).
//
// The upload path carries only the DXF bytes, so the file itself is the only durable channel from the
// converter to the card. The manifest rides in front of the first section as DXF comments (group
// code 999), which both dxf-parser and CLO skip:
//
//   999
//   GRBPWR-MANIFEST v1 1/3 <base64 chunk>
//   999
//   GRBPWR-MANIFEST v1 2/3 <base64 chunk>
//   …
//   0
//   SECTION
//
// The payload is the manifest as UTF-8 JSON, base64-encoded and cut into chunks of at most
// `PATIMPORT.manifestLineMax` characters. `i` is 1-based.
//
// READING IS DELIBERATELY ALL-OR-NOTHING. The card replaces its guesses (sizes from block names, which
// layer is the cut line, how a pair is counted) with what the manifest says, so a manifest that is only
// partly readable must not be half-trusted: absent tag → `null` (a foreign DXF, the card guesses as it
// always did); tag present but anything wrong with it → `ManifestError`, never a partial object and
// never a silent `null`.
//
// Main-thread safe by contract: JSON and string operations only, no imports beyond `types.ts` (and
// the sibling `identity.ts`, the G11 identity grammar the wizard and the gate share).
import {
  MANIFEST_TAG,
  MANIFEST_VERSION,
  PATIMPORT,
  type ConversionManifest,
  type EmbedManifestFn,
  type ReadManifestFn,
  type TrustedSheet,
} from '../types';

export { MANIFEST_TAG, MANIFEST_VERSION };
export {
  bareSizeToken,
  codeWordsOf,
  identitiesOf,
  identityGrammarProblem,
  identityProblem,
  modStage,
  sizeTokenTest,
  type IdentityRules,
} from './identity';

export type ManifestErrorCode =
  /** A tagged line that is not `GRBPWR-MANIFEST v<n> <i>/<n> <base64>`, bad base64, bad UTF-8, bad JSON. */
  | 'corrupt'
  /** Some chunks are missing (or the chunk count disagrees between lines). */
  | 'partial'
  /** A version this reader does not know — on the line or inside the JSON. */
  | 'version'
  /** The JSON decodes but is not a v1 manifest (missing/ill-typed field, broken cross-reference). */
  | 'shape';

export class ManifestError extends Error {
  readonly code: ManifestErrorCode;
  constructor(code: ManifestErrorCode, message: string) {
    super(`conversion manifest ${code}: ${message}`);
    this.name = 'ManifestError';
    this.code = code;
  }
}

// ── base64 over UTF-8, without Buffer (browser, worker and node ≥ 16 all have btoa/atob) ──────────

function toBase64(json: string): string {
  const bytes = new TextEncoder().encode(json);
  let bin = '';
  const STEP = 0x8000;
  for (let i = 0; i < bytes.length; i += STEP) {
    bin += String.fromCharCode(...bytes.subarray(i, i + STEP));
  }
  return btoa(bin);
}

const B64 = /^[A-Za-z0-9+/]*={0,2}$/;

function fromBase64(b64: string): string {
  if (b64.length % 4 !== 0 || !B64.test(b64))
    throw new ManifestError('corrupt', 'payload is not base64');
  let bin: string;
  try {
    bin = atob(b64);
  } catch {
    throw new ManifestError('corrupt', 'payload is not base64');
  }
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    throw new ManifestError('corrupt', 'payload is not UTF-8');
  }
}

// ── the leading comment block ─────────────────────────────────────────────────────────────────

type LeadingComments = {
  /** Offset where the leading 999 block ends (the first non-999 group starts here). */
  end: number;
  /** Offset where the content starts, after an optional BOM. */
  start: number;
  /** Every leading comment as [startOffset, endOffset, value]. */
  comments: { from: number; to: number; value: string }[];
};

// Walks group pairs from the top of the file while the group code is 999. Only this block is
// scanned: a 999 later in the file is somebody else's comment, and a manifest is only ever written
// in front of the first section.
function leadingComments(text: string): LeadingComments {
  const start = text.charCodeAt(0) === 0xfeff ? 1 : 0;
  const comments: LeadingComments['comments'] = [];
  let pos = start;
  const lineAt = (from: number): { line: string; next: number } | null => {
    if (from >= text.length) return null;
    const nl = text.indexOf('\n', from);
    const endOfLine = nl < 0 ? text.length : nl;
    const raw = text.slice(from, endOfLine);
    return {
      line: raw.endsWith('\r') ? raw.slice(0, -1) : raw,
      next: nl < 0 ? text.length : nl + 1,
    };
  };
  for (;;) {
    const code = lineAt(pos);
    if (!code || code.line.trim() !== '999') break;
    const value = lineAt(code.next);
    if (!value) break;
    comments.push({ from: pos, to: value.next, value: value.line });
    pos = value.next;
  }
  return { end: pos, start, comments };
}

const isTagged = (value: string) => value === MANIFEST_TAG || value.startsWith(`${MANIFEST_TAG} `);

const LINE = /^GRBPWR-MANIFEST v(\d+) (\d+)\/(\d+) ([A-Za-z0-9+/=]*)$/;

// ── shape ───────────────────────────────────────────────────────────────────────────────────────

const isObj = (x: unknown): x is Record<string, unknown> =>
  typeof x === 'object' && x !== null && !Array.isArray(x);
const isStr = (x: unknown): x is string => typeof x === 'string';
const isNum = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);
const isInt = (x: unknown): x is number => isNum(x) && Number.isInteger(x);
const isBool = (x: unknown): x is boolean => typeof x === 'boolean';
const isStrArr = (x: unknown): x is string[] => Array.isArray(x) && x.every(isStr);

const NAME_ORIGINS = new Set(['text', 'ai', 'ai-auto', 'operator']);
const LAYERS: ConversionManifest['layers'] = {
  cut: '1',
  seam: '14',
  grain: '7',
  notch: '4',
  internal: '8',
};

function fail(path: string, what: string): never {
  throw new ManifestError('shape', `${path}: ${what}`);
}

/**
 * Throws `ManifestError` unless `x` is a complete, self-consistent v1 manifest. Exported for the writer
 * (embedding an invalid manifest is a writer bug and must fail loudly) and for tests.
 */
export function validateManifest(x: unknown): ConversionManifest {
  if (!isObj(x)) fail('$', 'not an object');
  if (x.v !== MANIFEST_VERSION) {
    throw new ManifestError(
      'version',
      `JSON says v=${JSON.stringify(x.v)}, this reader knows v${MANIFEST_VERSION}`,
    );
  }
  if (!isStr(x.generator)) fail('generator', 'not a string');
  if (!isStr(x.createdAt)) fail('createdAt', 'not a string');
  if (!isInt(x.techCardId) || x.techCardId < 0) fail('techCardId', 'not a non-negative integer');
  if (!isObj(x.scope) || !isStr(x.scope.fabricPurpose) || !isStr(x.scope.bomLineKey)) {
    fail('scope', 'needs fabricPurpose and bomLineKey strings');
  }
  if (x.units !== 'mm') fail('units', 'must be "mm"');
  if (!isObj(x.layers)) fail('layers', 'not an object');
  for (const [k, v] of Object.entries(LAYERS)) {
    if ((x.layers as Record<string, unknown>)[k] !== v) fail(`layers.${k}`, `must be "${v}"`);
  }
  if (x.cutLayerIsFinal !== true) fail('cutLayerIsFinal', 'must be true');
  if (!isNum(x.allowanceMm) || x.allowanceMm < 0) fail('allowanceMm', 'not a non-negative number');

  if (!Array.isArray(x.sizes)) fail('sizes', 'not an array');
  const sizeTokens = new Set<string>();
  x.sizes.forEach((s, i) => {
    const p = `sizes[${i}]`;
    if (!isObj(s)) fail(p, 'not an object');
    if (!isStr(s.token) || !s.token.trim()) fail(`${p}.token`, 'empty');
    if (!isInt(s.sizeId) || s.sizeId <= 0) fail(`${p}.sizeId`, 'not a positive integer');
    if (!isStr(s.name)) fail(`${p}.name`, 'not a string');
    if (!isStr(s.sourceLabel)) fail(`${p}.sourceLabel`, 'not a string');
    if (!isNum(s.rank)) fail(`${p}.rank`, 'not a number');
    const t = s.token.trim().toLowerCase();
    if (sizeTokens.has(t)) fail(`${p}.token`, `duplicate "${s.token}"`);
    sizeTokens.add(t);
  });

  if (!Array.isArray(x.pieces)) fail('pieces', 'not an array');
  const pieceByIdentity = new Map<string, Record<string, unknown>>();
  x.pieces.forEach((pc, i) => {
    const p = `pieces[${i}]`;
    if (!isObj(pc)) fail(p, 'not an object');
    if (!isStr(pc.identity) || !pc.identity.trim()) fail(`${p}.identity`, 'empty');
    if (!isStr(pc.code)) fail(`${p}.code`, 'not a string');
    if (!isStrArr(pc.mods)) fail(`${p}.mods`, 'not a string array');
    if (!isStr(pc.displayName)) fail(`${p}.displayName`, 'not a string');
    if (!(pc.pairHand === null || pc.pairHand === 'L' || pc.pairHand === 'R'))
      fail(`${p}.pairHand`, 'not L|R|null');
    if (!(pc.pairOf === null || (isStr(pc.pairOf) && pc.pairOf.trim())))
      fail(`${p}.pairOf`, 'not a name or null');
    if ((pc.pairHand === null) !== (pc.pairOf === null))
      fail(p, 'pairHand and pairOf must be set together');
    if (!isBool(pc.unfoldedFold)) fail(`${p}.unfoldedFold`, 'not a boolean');
    if (!isInt(pc.piecesPerGarment) || pc.piecesPerGarment < 1)
      fail(`${p}.piecesPerGarment`, 'not a positive integer');
    if (!isStrArr(pc.fabrics)) fail(`${p}.fabrics`, 'not a string array');
    if (!isBool(pc.fused)) fail(`${p}.fused`, 'not a boolean');
    if (!isBool(pc.ungraded)) fail(`${p}.ungraded`, 'not a boolean');
    if (!isNum(pc.allowanceMm) || pc.allowanceMm < 0)
      fail(`${p}.allowanceMm`, 'not a non-negative number');
    if (!isStr(pc.nameOrigin) || !NAME_ORIGINS.has(pc.nameOrigin))
      fail(`${p}.nameOrigin`, 'unknown origin');
    if (pc.aiConfidence !== undefined && !isNum(pc.aiConfidence))
      fail(`${p}.aiConfidence`, 'not a number');
    const ci = pc.identity.trim().toLowerCase();
    if (pieceByIdentity.has(ci)) fail(`${p}.identity`, `duplicate "${pc.identity}"`);
    pieceByIdentity.set(ci, pc);
  });
  // A pair is two identities naming each other, one per hand. Anything else is not a pair the card
  // can bind as one piece.
  for (const [ci, pc] of pieceByIdentity) {
    if (pc.pairOf === null) continue;
    const sib = pieceByIdentity.get((pc.pairOf as string).trim().toLowerCase());
    if (!sib)
      fail(
        `pieces.${pc.identity}.pairOf`,
        `names "${pc.pairOf}", which is not a piece of this manifest`,
      );
    if (!isStr(sib.pairOf) || sib.pairOf.trim().toLowerCase() !== ci) {
      fail(`pieces.${pc.identity}.pairOf`, `"${pc.pairOf}" does not name it back`);
    }
    if (sib.pairHand === pc.pairHand)
      fail(`pieces.${pc.identity}.pairHand`, 'both hands of the pair are the same');
  }

  if (!Array.isArray(x.blocks)) fail('blocks', 'not an array');
  const blockNames = new Set<string>();
  x.blocks.forEach((b, i) => {
    const p = `blocks[${i}]`;
    if (!isObj(b)) fail(p, 'not an object');
    if (!isStr(b.block) || !b.block.trim()) fail(`${p}.block`, 'empty');
    if (!isStr(b.identity)) fail(`${p}.identity`, 'not a string');
    if (!isStr(b.sizeToken)) fail(`${p}.sizeToken`, 'not a string');
    if (!isInt(b.sizeId) || b.sizeId < 0) fail(`${p}.sizeId`, 'not a non-negative integer');
    if (!Array.isArray(b.bboxMm) || b.bboxMm.length !== 4 || !b.bboxMm.every(isNum))
      fail(`${p}.bboxMm`, 'not 4 numbers');
    if (!isNum(b.areaMm2)) fail(`${p}.areaMm2`, 'not a number');
    if (!isBool(b.hasGrain)) fail(`${p}.hasGrain`, 'not a boolean');
    for (const k of ['notches', 'drills', 'internal'] as const) {
      if (!isInt(b[k]) || (b[k] as number) < 0) fail(`${p}.${k}`, 'not a non-negative integer');
    }
    if (!isBool(b.hasSeam)) fail(`${p}.hasSeam`, 'not a boolean');
    const ci = b.block.trim().toLowerCase();
    if (blockNames.has(ci)) fail(`${p}.block`, `duplicate "${b.block}"`);
    blockNames.add(ci);
    const piece = pieceByIdentity.get(b.identity.trim().toLowerCase());
    if (!piece) fail(`${p}.identity`, `"${b.identity}" is not a piece of this manifest`);
    // A graded block's size is one of the run's tokens; an ungraded one may carry a base-size token or
    // the literal UNI. The card never guesses a size the manifest did not list.
    if (!piece.ungraded && !sizeTokens.has(b.sizeToken.trim().toLowerCase())) {
      fail(`${p}.sizeToken`, `"${b.sizeToken}" is not a size of this manifest`);
    }
  });

  if (!isObj(x.source)) fail('source', 'not an object');
  if (
    !(x.gate === null || (isObj(x.gate) && isBool(x.gate.passed) && Array.isArray(x.gate.checks)))
  ) {
    fail('gate', 'neither null nor a gate report');
  }
  return x as unknown as ConversionManifest;
}

// ── public API ──────────────────────────────────────────────────────────────────────────────────

/**
 * Prepends the manifest as 999 comments. Re-embedding replaces an earlier manifest (the writer
 * embeds, runs the gate, then embeds again with the gate report), and keeps any other leading comment
 * and the file's line endings. Throws `ManifestError` on an invalid manifest: a writer bug must not
 * produce a file the card refuses later.
 */
export const embedManifest: EmbedManifestFn = (dxfText, manifest) => {
  validateManifest(manifest);
  const eol = dxfText.includes('\r\n') ? '\r\n' : '\n';
  const lead = leadingComments(dxfText);
  // Strip only OUR earlier lines; foreign leading comments stay where they were.
  // Offsets are absolute; removing back to front keeps the earlier ones valid.
  let body = dxfText.slice(lead.start);
  for (const c of [...lead.comments].reverse()) {
    if (!isTagged(c.value)) continue;
    body = body.slice(0, c.from - lead.start) + body.slice(c.to - lead.start);
  }
  const payload = toBase64(JSON.stringify(manifest));
  const max = PATIMPORT.manifestLineMax;
  const chunks: string[] = [];
  for (let i = 0; i < payload.length; i += max) chunks.push(payload.slice(i, i + max));
  if (chunks.length === 0) chunks.push('');
  const n = chunks.length;
  const head = chunks
    .map((c, i) => `999${eol}${MANIFEST_TAG} v${MANIFEST_VERSION} ${i + 1}/${n} ${c}${eol}`)
    .join('');
  return dxfText.slice(0, lead.start) + head + body;
};

/**
 * `null` when the file carries no manifest (a foreign DXF). Throws `ManifestError` when it carries
 * one that cannot be trusted completely — corrupt, partial, of an unknown version or of the wrong
 * shape. There is no third outcome.
 */
export const readManifest: ReadManifestFn = (dxfText) => {
  const lead = leadingComments(dxfText);
  const tagged = lead.comments.filter((c) => isTagged(c.value)).map((c) => c.value);
  if (tagged.length === 0) return null;
  let total = -1;
  const chunks = new Map<number, string>();
  for (const line of tagged) {
    const m = LINE.exec(line);
    if (!m) {
      // A version we do not know may also change the line format; say «version» when we can tell.
      const v = /^GRBPWR-MANIFEST v(\d+)\b/.exec(line);
      if (v && Number(v[1]) !== MANIFEST_VERSION) {
        throw new ManifestError(
          'version',
          `line says v${v[1]}, this reader knows v${MANIFEST_VERSION}`,
        );
      }
      throw new ManifestError('corrupt', `unreadable manifest line "${line.slice(0, 60)}"`);
    }
    const [, ver, iStr, nStr, chunk] = m;
    if (Number(ver) !== MANIFEST_VERSION) {
      throw new ManifestError(
        'version',
        `line says v${ver}, this reader knows v${MANIFEST_VERSION}`,
      );
    }
    const i = Number(iStr);
    const n = Number(nStr);
    if (!(n >= 1) || !(i >= 1) || i > n)
      throw new ManifestError('corrupt', `chunk ${i}/${n} is out of range`);
    if (total < 0) total = n;
    else if (total !== n)
      throw new ManifestError('partial', `chunk counts disagree (${total} and ${n})`);
    if (chunks.has(i)) throw new ManifestError('corrupt', `chunk ${i}/${n} appears twice`);
    chunks.set(i, chunk);
  }
  if (chunks.size !== total) {
    const missing: number[] = [];
    for (let i = 1; i <= total; i++) if (!chunks.has(i)) missing.push(i);
    throw new ManifestError('partial', `missing chunk(s) ${missing.join(', ')} of ${total}`);
  }
  let payload = '';
  for (let i = 1; i <= total; i++) payload += chunks.get(i)!;
  const json = fromBase64(payload);
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new ManifestError('corrupt', 'payload is not JSON');
  }
  return validateManifest(parsed);
};

/**
 * Bytes → manifest, for the parse worker. A file whose first group is not a comment cannot carry a
 * manifest, so the common (foreign) case costs a few bytes, not a decode of the whole sheet. The
 * manifest itself is ASCII, so latin1 decoding is exact for it whatever the file's own encoding.
 */
export function readManifestBytes(buf: ArrayBuffer): ConversionManifest | null {
  const head = new Uint8Array(buf, 0, Math.min(buf.byteLength, 16));
  let i = 0;
  if (head[0] === 0xef && head[1] === 0xbb && head[2] === 0xbf) i = 3;
  while (i < head.length && (head[i] === 0x20 || head[i] === 0x09)) i++;
  if (!(head[i] === 0x39 && head[i + 1] === 0x39 && head[i + 2] === 0x39)) return null;
  const text = new TextDecoder('latin1').decode(buf);
  return readManifest(text.charCodeAt(0) === 0xef ? text.slice(3) : text);
}

/** What the card may trust about one parsed file (types §12). */
export function trustedSheetOf(m: ConversionManifest, fileIndex: number): TrustedSheet {
  const sizeByBlock = new Map<string, string>();
  for (const b of m.blocks) sizeByBlock.set(b.block.trim().toLowerCase(), b.sizeToken);
  const pairOf = new Map<string, string>();
  const unfolded = new Set<string>();
  for (const p of m.pieces) {
    const ci = p.identity.trim().toLowerCase();
    if (p.pairOf) pairOf.set(ci, p.pairOf.trim().toLowerCase());
    if (p.unfoldedFold) unfolded.add(ci);
  }
  return {
    fileIndex,
    manifest: m,
    sizeByBlock,
    pairOf,
    unfolded,
    cutAllowanceCm: m.allowanceMm / 10,
  };
}
