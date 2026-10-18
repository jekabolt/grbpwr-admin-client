// CONVERSION MANIFEST — embedded in, and read back from, the DXF the converter writes (08-CONTRACT §3).
//
// The upload path carries only the DXF bytes, so the file itself is the only durable channel from the
// converter to the card. The manifest rides in front of the first section as DXF comments (group
// code 999), which both dxf-parser and CLO skip:
//
//   999
//   GRBPWR-MANIFEST v1z 1/3 <base64 chunk>
//   999
//   GRBPWR-MANIFEST v1z 2/3 <base64 chunk>
//   …
//   0
//   SECTION
//
// Two line forms, one JSON schema (`v: 1`):
//   v1   payload = base64(UTF-8 JSON)                — the first form; still read, never written
//   v1z  payload = base64(deflate-raw(UTF-8 JSON))   — written since MF-B: a 138-block sheet's
//        manifest is ~5× smaller (polupalto ≈ 10 KB instead of ≈ 55–110 KB of prologue), which
//        keeps the 999 prologue inside any sniffer window. deflate-raw is RFC 1951, the same
//        bytes `CompressionStream('deflate-raw')` produces; fflate does it synchronously, because
//        `readManifest` runs inside the card's synchronous parse path.
// Chunks are at most `PATIMPORT.manifestLineMax` characters; `i` is 1-based; every tagged line of
// one file carries the same form.
//
// READING IS DELIBERATELY ALL-OR-NOTHING. The card replaces its guesses (sizes from block names, which
// layer is the cut line, how a pair is counted) with what the manifest says, so a manifest that is only
// partly readable must not be half-trusted: absent tag → `null` (a foreign DXF, the card guesses as it
// always did); tag present but anything wrong with it → `ManifestError`, never a partial object and
// never a silent `null`. A compressed payload that inflates past `MANIFEST_MAX_JSON_BYTES` is
// `corrupt` (a deflate bomb in a comment line must not take the card's parser down).
//
// Main-thread safe by contract: JSON, string and fflate (pure JS) operations only, no imports beyond
// `types.ts` (and the siblings `identity.ts`, the G11 identity grammar the wizard and the gate share,
// and `contour-sig.ts`, the F14f cut-ring signature the writer embeds and the card checks).
import { Inflate, deflateSync } from 'fflate';
import {
  MANIFEST_TAG,
  MANIFEST_VERSION,
  PATIMPORT,
  MODELS_MAX,
  REPLAY_MAX,
  REPLAY_VALUE_MAX,
  type AutopilotAssumption,
  type AutopilotRecord,
  type AutopilotValue,
  type ContourSignature,
  type ConversionManifest,
  type EmbedManifestFn,
  type GateCheck,
  type GrainEvidenceKind,
  type GrainFeature,
  type GradeCountFeature,
  type ShapeFixRecord,
  type GateReport,
  type ManifestBlock,
  type ManifestContinuity,
  type ReplayAnswer,
  type ReplayRecord,
  type ManifestPiece,
  type ManifestSize,
  type ManifestSource,
  type PitchSource,
  type ReadManifestFn,
  type TrustedSheet,
  type DerivedEdgeAudit,
  type DerivedEdgeKind,
} from '../types';
import { readPassportDigest } from '../passport/digest';

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
import { contourSigShapeProblem } from './contour-sig';
import { continuityOfBlock } from '../write/manifest-build';

/** SHAPE-KINK: ManifestBlock.kinkStraightened rules. */
const KINK_RULES = new Set(['mark-wall', 'jitter', 'mark-detour', 'operator']);
export {
  CONTOUR_SIG_MAX_PTS,
  CONTOUR_SIG_Q_MM,
  CONTOUR_SIG_TOL_MM,
  contourSigCap,
  contourSigMatch,
  contourSigProblem,
  contourSignature,
  decodeContourSig,
} from './contour-sig';

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

/** Line form: `v1` = plain JSON, `v1z` = deflate-raw JSON (see the header). */
export type ManifestLineForm = 'v1' | 'v1z';

/** Inflated JSON larger than this is refused as `corrupt` (a real manifest is well under 1 MB). */
export const MANIFEST_MAX_JSON_BYTES = 4 * 1024 * 1024;
/** Base64 of the largest payload either form may carry (a v1 payload is the JSON itself). */
const MANIFEST_MAX_B64 = 4 * Math.ceil(MANIFEST_MAX_JSON_BYTES / 3);
/**
 * Codex C6: the most chunk lines a manifest can need — `i/n` beyond this is refused before anything
 * is allocated or looped over (`1/999999…` must not walk a million-entry «missing» list).
 */
export const MANIFEST_MAX_CHUNKS = Math.ceil(MANIFEST_MAX_B64 / PATIMPORT.manifestLineMax);
/**
 * Codex C6: bytes of leading 999 comments `readManifestBytes` walks — the largest manifest prologue
 * (every chunk line plus its `999` code line) with room for foreign leading comments. A sheet is
 * never decoded whole to find its manifest.
 */
export const MANIFEST_MAX_PROLOGUE_BYTES =
  MANIFEST_MAX_CHUNKS * (PATIMPORT.manifestLineMax + 48) + 64 * 1024;

function bytesToBase64(bytes: Uint8Array): string {
  let bin = '';
  const STEP = 0x8000;
  for (let i = 0; i < bytes.length; i += STEP) {
    bin += String.fromCharCode(...bytes.subarray(i, i + STEP));
  }
  return btoa(bin);
}

function toBase64(json: string, form: ManifestLineForm): string {
  const utf8 = new TextEncoder().encode(json);
  return bytesToBase64(form === 'v1z' ? deflateSync(utf8, { level: 9 }) : utf8);
}

/** deflate-raw → bytes, refusing more than `max` bytes of output. */
function inflateCapped(z: Uint8Array, max: number): Uint8Array {
  const parts: Uint8Array[] = [];
  let total = 0;
  const inf = new Inflate((chunk) => {
    total += chunk.length;
    if (total > max)
      throw new ManifestError('corrupt', `compressed payload inflates past ${max} bytes`);
    parts.push(chunk);
  });
  try {
    inf.push(z, true);
  } catch (e) {
    if (e instanceof ManifestError) throw e;
    throw new ManifestError('corrupt', 'compressed payload is not deflate data');
  }
  const out = new Uint8Array(total);
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

const B64 = /^[A-Za-z0-9+/]*={0,2}$/;

function fromBase64(b64: string, form: ManifestLineForm): string {
  if (b64.length % 4 !== 0 || !B64.test(b64))
    throw new ManifestError('corrupt', 'payload is not base64');
  let bin: string;
  try {
    bin = atob(b64);
  } catch {
    throw new ManifestError('corrupt', 'payload is not base64');
  }
  const raw = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) raw[i] = bin.charCodeAt(i);
  if (form === 'v1' && raw.length > MANIFEST_MAX_JSON_BYTES)
    throw new ManifestError('corrupt', `payload is larger than ${MANIFEST_MAX_JSON_BYTES} bytes`);
  const bytes = form === 'v1z' ? inflateCapped(raw, MANIFEST_MAX_JSON_BYTES) : raw;
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

const LINE = /^GRBPWR-MANIFEST v(\d+)(z?) (\d+)\/(\d+) ([A-Za-z0-9+/=]*)$/;

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

// Codex C8: bounds for the free-form parts (source, gate report). A real manifest is far inside them;
// they exist so a hostile one cannot carry megabytes of strings into the card's UI.
const MAX_STR = 64 * 1024;
const MAX_LIST = 10_000;
const isBoundedStr = (x: unknown, max = MAX_STR): x is string => isStr(x) && x.length <= max;
const SOURCE_KINDS = new Set(['pdf', 'dxf', 'raster', 'hpgl', 'svg', 'ai']);
const SCALE_METHODS = new Set(['test-square', 'grid', 'declared', 'manual', 'none']);
const SHEET_METHODS = new Set(['recurrence', 'edge-stitch', 'grid-label', 'manual', 'single']);
/** TILESTEP: `source.sheet.pitch` — optional; an unknown value is dropped, never the manifest. */
const PITCH_SOURCES = new Set<PitchSource>([
  'recurrence',
  'edge-votes',
  'raster-frame',
  'tiles-line',
  'page-size',
  'manual',
  'single',
]);
const pitchOf = (v: unknown): { pitch?: PitchSource } =>
  isStr(v) && PITCH_SOURCES.has(v as PitchSource) ? { pitch: v as PitchSource } : {};
const SIZE_ENCODINGS = new Set([
  'ocg',
  'declared-dash',
  'subpath-dash',
  'separate-dash',
  'color',
  'file-per-size',
  'text-label',
  'dxf-block',
  'single',
]);
const GATE_CHECK_IDS = new Set([
  'G1-roundtrip',
  'G2-square',
  'G3-coverage',
  'G4-hausdorff',
  'G5-features',
  'G6-offset',
  'G7-overview',
  'G8-monotone',
  'G9-sizes',
  'G10-uni',
  'G11-grammar',
  'G12-pair',
  'G13-manifest',
  'G14-prologue',
  // F14b (pi/f14b): the derived-edge audit — accepted here before that lane lands
  'G15-derived',
  // A8 safety net: lettering inside pieces, internal length, grain provenance
  'G16-glyphs',
  'G18-grain-source',
  // A8b: a cut line traced around tile chrome (corner brackets, frames)
  'G19-chrome',
  // A2: a piece drawn inside another written as its internal line
  'G20-nested-piece',
  // P1: a size closed through continuity walls keeps its provenance and verdict
  'G21-continuity',
  // MOOD Ф0: a size lies on its own pen; one outline holds one piece
  'G22-identity',
  'G24-one-piece',
  // D6: every tile sheet in the export, no piece twice or in halves
  'G23-sheets',
]);
// F14b `GateReport.derived[].kind` (DerivedEdgeKind); 'auto-bridge' is the same edge's other name
const DERIVED_KINDS = new Set<string>([
  'bridge',
  'operator-bridge',
  'band-cut',
  'grade-fill',
] satisfies DerivedEdgeKind[]);
const isPair = (v: unknown): v is [number, number] =>
  Array.isArray(v) && v.length === 2 && v.every(isNum);
const numOrNull = (x: unknown): x is number | null => x === null || isNum(x);
const nonNegInts = (x: unknown, max: number) =>
  Array.isArray(x) && x.length <= max && x.every((v) => isInt(v) && v >= 0);
/** P1: a ManifestBlock.continuity as written (write/manifest-build continuityOfBlock), bounded. */
export function continuityOk(c: unknown): boolean {
  if (!isObj(c) || !Array.isArray(c.edges) || !c.edges.length || c.edges.length > 64) return false;
  const edgeOk = (e: unknown) =>
    isObj(e) &&
    (e.rule === 'R0' || e.rule === 'R1' || e.rule === 'R2') &&
    nonNegInts(e.chains, 64) &&
    (e.chains as unknown[]).length > 0 &&
    Array.isArray(e.roles) &&
    e.roles.length === (e.chains as unknown[]).length &&
    e.roles.every((r) => isBoundedStr(r, 32)) &&
    (e.bracket === undefined || e.bracket === true) &&
    typeof e.ownRank === 'boolean';
  if (!c.edges.every(edgeOk)) return false;
  const v = c.verdict;
  if (v === null) return true;
  return (
    isObj(v) &&
    nonNegInts(v.anchors, 64) &&
    Array.isArray(v.checks) &&
    v.checks.length <= 16 &&
    v.checks.every(
      (k) =>
        isObj(k) &&
        isInt(k.vs) &&
        isInt(k.steps) &&
        ['hMm', 'hAllowMm', 'hu', 'huAllow', 'growth', 'dk', 'kMax'].every((f) => isNum(k[f])) &&
        Array.isArray(k.band) &&
        k.band.length === 2 &&
        k.band.every(isNum),
    )
  );
}

function validateSource(x: unknown): ManifestSource {
  if (!isObj(x)) fail('source', 'not an object');
  if (!Array.isArray(x.files) || x.files.length > MAX_LIST) fail('source.files', 'not a list');
  const files: ManifestSource['files'] = x.files.map((f, i) => {
    const p = `source.files[${i}]`;
    if (!isObj(f)) fail(p, 'not an object');
    if (!isBoundedStr(f.name, 1024)) fail(`${p}.name`, 'not a string');
    if (!isBoundedStr(f.sha256, 128)) fail(`${p}.sha256`, 'not a string');
    if (!isNum(f.bytes) || f.bytes < 0) fail(`${p}.bytes`, 'not a non-negative number');
    if (!isStr(f.kind) || !SOURCE_KINDS.has(f.kind)) fail(`${p}.kind`, 'unknown kind');
    if (!isInt(f.pages) || f.pages < 0) fail(`${p}.pages`, 'not a non-negative integer');
    return {
      name: f.name,
      sha256: f.sha256,
      bytes: f.bytes,
      kind: f.kind as ManifestSource['files'][number]['kind'],
      pages: f.pages,
    };
  });
  const sc = x.scale;
  if (
    !isObj(sc) ||
    !isStr(sc.method) ||
    !SCALE_METHODS.has(sc.method) ||
    !isNum(sc.factor) ||
    !numOrNull(sc.measuredMm) ||
    !numOrNull(sc.declaredMm)
  )
    fail('source.scale', 'needs method, factor, measuredMm|null, declaredMm|null');
  const sh = x.sheet;
  if (
    !isObj(sh) ||
    !isInt(sh.pages) ||
    sh.pages < 0 ||
    !isStr(sh.method) ||
    !SHEET_METHODS.has(sh.method) ||
    !isNum(sh.maxResidualMm)
  )
    fail('source.sheet', 'needs pages, method, maxResidualMm');
  // D6: the tile sheets of the drawing — optional, shape-checked; one that does not validate is
  // left out (never the manifest)
  const sheets = Array.isArray(x.sheets)
    ? x.sheets.slice(0, 64).flatMap((y: unknown) =>
        isObj(y) &&
        isInt(y.sheet) &&
        y.sheet >= 0 &&
        isInt(y.pages) &&
        y.pages >= 0 &&
        isNum(y.maxResidualMm)
          ? [
              {
                sheet: y.sheet,
                pages: y.pages,
                maxResidualMm: y.maxResidualMm,
                ...pitchOf(y.pitch),
              },
            ]
          : [],
      )
    : [];
  // UXHOOKS: missing pages imported as blank — optional, shape-checked; one that does not
  // validate is left out (never the manifest)
  const holes = Array.isArray(x.holes)
    ? x.holes.slice(0, 256).flatMap((y: unknown) =>
        isObj(y) &&
        isInt(y.sheet) &&
        y.sheet >= 0 &&
        isInt(y.row) &&
        isInt(y.col) &&
        isInt(y.lineEnds) &&
        y.lineEnds >= 0 &&
        isInt(y.chainEnds) &&
        y.chainEnds >= 0 &&
        (y.origin === 'operator' || y.origin === 'autopilot')
          ? [
              {
                sheet: y.sheet,
                row: y.row,
                col: y.col,
                lineEnds: y.lineEnds,
                chainEnds: y.chainEnds,
                origin: y.origin as 'operator' | 'autopilot',
              },
            ]
          : [],
      )
    : [];
  if (!isStr(x.sizeEncoding) || !SIZE_ENCODINGS.has(x.sizeEncoding))
    fail('source.sizeEncoding', 'unknown encoding');
  if (!(x.variant === null || isBoundedStr(x.variant, 1024)))
    fail('source.variant', 'neither null nor a string');
  // VARIANTS: the pieces tied to one model — optional, shape-checked; an entry that does not
  // validate is left out (never the manifest)
  const models = Array.isArray(x.models)
    ? x.models
        .slice(0, MODELS_MAX)
        .flatMap((y: unknown) =>
          isObj(y) &&
          isBoundedStr(y.piece, 128) &&
          isBoundedStr(y.model, 128) &&
          isBool(y.kept) &&
          isBoundedStr(y.evidence, 512)
            ? [{ piece: y.piece, model: y.model, kept: y.kept, evidence: y.evidence }]
            : [],
        )
    : [];
  return {
    files,
    scale: {
      method: sc.method as ManifestSource['scale']['method'],
      factor: sc.factor,
      measuredMm: sc.measuredMm,
      declaredMm: sc.declaredMm,
    },
    sheet: {
      pages: sh.pages,
      method: sh.method as ManifestSource['sheet']['method'],
      maxResidualMm: sh.maxResidualMm,
      ...pitchOf(sh.pitch),
    },
    ...(sheets.length ? { sheets } : {}),
    ...(holes.length ? { holes } : {}),
    sizeEncoding: x.sizeEncoding as ManifestSource['sizeEncoding'],
    variant: x.variant,
    ...(models.length ? { models } : {}),
  };
}

function validateGate(x: unknown): GateReport | null {
  if (x === null) return null;
  if (!isObj(x)) fail('gate', 'neither null nor a gate report');
  if (!isBool(x.passed)) fail('gate.passed', 'not a boolean');
  if (!isNum(x.durationMs) || x.durationMs < 0)
    fail('gate.durationMs', 'not a non-negative number');
  if (!Array.isArray(x.checks) || x.checks.length > 64) fail('gate.checks', 'not a list');
  // A check id this build does not know (written by a newer or an older importer — G17 lived one
  // day) is validated for shape and then left out: an unknown id must not drop the whole sheet
  // (Codex G16 review). «passed» is still judged against every check, known or not.
  const all: GateCheck[] = x.checks.map((c, i) => {
    const p = `gate.checks[${i}]`;
    if (!isObj(c)) fail(p, 'not an object');
    if (!isBoundedStr(c.id, 64) || !/^G\d{1,2}-[a-z0-9-]+$/.test(c.id))
      fail(`${p}.id`, 'not a check id');
    if (!isBool(c.ok)) fail(`${p}.ok`, 'not a boolean');
    if (c.severity !== 'block' && c.severity !== 'warn') fail(`${p}.severity`, 'not block|warn');
    for (const k of ['value', 'threshold'] as const) {
      const v = c[k];
      if (!(v === null || isNum(v) || isBoundedStr(v, 1024)))
        fail(`${p}.${k}`, 'not a finite number, a short string or null');
    }
    if (
      !Array.isArray(c.blocks) ||
      c.blocks.length > MAX_LIST ||
      !c.blocks.every((b) => isBoundedStr(b, 512))
    )
      fail(`${p}.blocks`, 'not a bounded string list');
    if (!isBoundedStr(c.note)) fail(`${p}.note`, 'not a bounded string');
    return {
      id: c.id as GateCheck['id'],
      ok: c.ok,
      severity: c.severity,
      value: c.value as GateCheck['value'],
      threshold: c.threshold as GateCheck['threshold'],
      blocks: [...(c.blocks as string[])],
      note: c.note,
    };
  });
  // «passed» must agree with the checks it reports — a forged true over a blocking failure is a lie
  if (x.passed && all.some((c) => !c.ok && c.severity === 'block'))
    fail('gate.passed', 'true over a failed blocking check');
  const checks = all.filter((c) => GATE_CHECK_IDS.has(c.id));
  // F14b: the derived edges G15 accepted (optional; absent when there are none)
  let derived: DerivedEdgeAudit[] | undefined;
  if (x.derived !== undefined) {
    if (!Array.isArray(x.derived) || x.derived.length > MAX_LIST)
      fail('gate.derived', 'not a bounded list');
    derived = x.derived.map((d, i) => {
      const p = `gate.derived[${i}]`;
      if (!isObj(d)) fail(p, 'not an object');
      if (!isBoundedStr(d.block, 512) || !d.block.trim()) fail(`${p}.block`, 'not a block name');
      if (!isStr(d.kind) || !DERIVED_KINDS.has(d.kind)) fail(`${p}.kind`, 'unknown kind');
      if (!isNum(d.lengthMm) || d.lengthMm < 0) fail(`${p}.lengthMm`, 'not a non-negative number');
      if (!isNum(d.offSourceMm) || d.offSourceMm < 0)
        fail(`${p}.offSourceMm`, 'not a non-negative number');
      if (!isPair(d.a) || !isPair(d.b)) fail(`${p}.a|b`, 'not two finite [x, y] points');
      return {
        block: d.block,
        kind: d.kind as DerivedEdgeKind,
        lengthMm: d.lengthMm,
        offSourceMm: d.offSourceMm,
        a: [d.a[0], d.a[1]],
        b: [d.b[0], d.b[1]],
      };
    });
  }
  return { passed: x.passed, checks, durationMs: x.durationMs, ...(derived ? { derived } : {}) };
}

/**
 * A10: the autopilot's assumptions (optional). Shape-tolerant like the gate ids: a list that is not
 * a bounded list reads as absent, and an entry that does not validate is left out — never the
 * sheet. What is kept is rebuilt from validated fields only (Codex C8).
 */
function validateAutopilot(x: unknown): AutopilotRecord | undefined {
  if (!isObj(x) || x.v !== 1 || !Array.isArray(x.assumptions) || x.assumptions.length > MAX_LIST)
    return undefined;
  const KIND = /^[a-z][a-z0-9-]{0,47}$/;
  const assumptions: AutopilotAssumption[] = [];
  for (const a of x.assumptions) {
    if (
      !isObj(a) ||
      !isBoundedStr(a.step, 32) ||
      !isBoundedStr(a.kind, 48) ||
      !KIND.test(a.kind) ||
      !isBoundedStr(a.subject, 512) ||
      !isBoundedStr(a.answer, 512) ||
      !isBoundedStr(a.rule, 1024) ||
      !Array.isArray(a.evidence) ||
      a.evidence.length > 16 ||
      !a.evidence.every((e) => isBoundedStr(e, 1024)) ||
      !isNum(a.confidence) ||
      a.confidence < 0 ||
      a.confidence > 1 ||
      !isBool(a.strong)
    )
      continue;
    // the replayable value: plain JSON, bounded; anything else is left out (the entry stays)
    let value: AutopilotValue | undefined;
    if (a.value !== undefined) {
      try {
        const text = JSON.stringify(a.value);
        if (text !== undefined && text.length <= 2048) value = JSON.parse(text) as AutopilotValue;
      } catch {
        value = undefined;
      }
    }
    assumptions.push({
      step: a.step,
      kind: a.kind,
      subject: a.subject,
      answer: a.answer,
      rule: a.rule,
      evidence: [...(a.evidence as string[])],
      confidence: a.confidence,
      strong: a.strong,
      ...(value !== undefined ? { value } : {}),
    });
  }
  return { v: 1, assumptions };
}

/**
 * AP-replay: the run's answers (`replay`), rebuilt from validated fields only — the same bounds the
 * writer clips to (write/manifest-build.ts `replayForManifest`), so a written record reads back
 * equal (G13). An entry that does not validate is left out, never the sheet.
 */
function validateReplay(x: unknown): ReplayRecord | undefined {
  if (!isObj(x) || x.v !== 1 || !Array.isArray(x.answers) || x.answers.length > REPLAY_MAX)
    return undefined;
  const KIND = /^[a-z][a-z0-9-]{0,47}$/;
  const answers: ReplayAnswer[] = [];
  for (const a of x.answers) {
    if (
      !isObj(a) ||
      !isBoundedStr(a.step, 32) ||
      !isBoundedStr(a.kind, 48) ||
      !KIND.test(a.kind) ||
      !isBoundedStr(a.subject, 160) ||
      a.value === undefined
    )
      continue;
    let value: AutopilotValue | undefined;
    try {
      const text = JSON.stringify(a.value);
      if (text !== undefined && text.length <= REPLAY_VALUE_MAX)
        value = JSON.parse(text) as AutopilotValue;
    } catch {
      value = undefined;
    }
    if (value === undefined) continue;
    answers.push({
      step: a.step,
      kind: a.kind,
      subject: a.subject,
      value,
      ...(a.strong === true ? { strong: true } : {}),
      ...(a.auto === true ? { auto: true } : {}),
    });
  }
  return { v: 1, answers };
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
  const sizes: ManifestSize[] = x.sizes.map((s, i) => {
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
    return {
      token: s.token,
      sizeId: s.sizeId,
      name: s.name,
      sourceLabel: s.sourceLabel,
      rank: s.rank,
    };
  });

  if (!Array.isArray(x.pieces)) fail('pieces', 'not an array');
  const pieceByIdentity = new Map<string, Record<string, unknown>>();
  const pieces: ManifestPiece[] = x.pieces.map((pc, i) => {
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
    // GRADE P1: optional, the count kinds the operator answered "intended"
    if (
      pc.gradeIntended !== undefined &&
      !(
        Array.isArray(pc.gradeIntended) &&
        pc.gradeIntended.length <= 3 &&
        pc.gradeIntended.every((k) => k === 'notches' || k === 'drills' || k === 'internal')
      )
    )
      fail(`${p}.gradeIntended`, 'not a list of notches | drills | internal');
    // SHAPE-KINK: optional, the operator's one-shape moves
    if (
      pc.shapeFixes !== undefined &&
      !(
        Array.isArray(pc.shapeFixes) &&
        pc.shapeFixes.every(
          (f) =>
            isObj(f) &&
            isStr(f.size) &&
            (f.action === 'straighten' || f.action === 'drop') &&
            (f.mm === undefined || (isNum(f.mm) && f.mm >= 0)),
        )
      )
    )
      fail(`${p}.shapeFixes`, 'not a list of { size, action: straighten | drop, mm? }');
    const ci = pc.identity.trim().toLowerCase();
    if (pieceByIdentity.has(ci)) fail(`${p}.identity`, `duplicate "${pc.identity}"`);
    pieceByIdentity.set(ci, pc);
    const out: ManifestPiece = {
      identity: pc.identity,
      code: pc.code,
      mods: [...pc.mods],
      displayName: pc.displayName,
      pairHand: pc.pairHand as ManifestPiece['pairHand'],
      pairOf: pc.pairOf as string | null,
      unfoldedFold: pc.unfoldedFold,
      piecesPerGarment: pc.piecesPerGarment,
      fabrics: [...pc.fabrics],
      fused: pc.fused,
      ungraded: pc.ungraded,
      allowanceMm: pc.allowanceMm,
      nameOrigin: pc.nameOrigin as ManifestPiece['nameOrigin'],
    };
    if (pc.aiConfidence !== undefined) out.aiConfidence = pc.aiConfidence as number;
    if (Array.isArray(pc.gradeIntended) && pc.gradeIntended.length)
      out.gradeIntended = [...(pc.gradeIntended as GradeCountFeature[])];
    if (Array.isArray(pc.shapeFixes) && pc.shapeFixes.length)
      out.shapeFixes = (pc.shapeFixes as ShapeFixRecord[]).map((f) => ({
        size: f.size,
        action: f.action,
        ...(f.mm !== undefined ? { mm: f.mm } : {}),
      }));
    return out;
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
  const blocks: ManifestBlock[] = x.blocks.map((b, i) => {
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
    // GRADE P1: optional, how many of the notches are graded (not drawn in this size)
    if (
      b.notchesGraded !== undefined &&
      !(isInt(b.notchesGraded) && b.notchesGraded >= 1 && b.notchesGraded <= (b.notches as number))
    )
      fail(`${p}.notchesGraded`, 'not an integer 1…notches');
    if (
      b.notchesChorded !== undefined &&
      !(
        isInt(b.notchesChorded) &&
        b.notchesChorded >= 1 &&
        b.notchesChorded <= (b.notches as number)
      )
    )
      fail(`${p}.notchesChorded`, 'not an integer 1…notches');
    // SHAPE-KINK: optional, the stretches straightened (rule, mm, span)
    if (
      b.kinkStraightened !== undefined &&
      !(
        Array.isArray(b.kinkStraightened) &&
        b.kinkStraightened.every(
          (k) =>
            isObj(k) &&
            KINK_RULES.has(k.rule as string) &&
            isNum(k.mm) &&
            k.mm >= 0 &&
            isNum(k.spanMm) &&
            k.spanMm >= 0,
        )
      )
    )
      fail(`${p}.kinkStraightened`, 'not a list of { rule, mm, spanMm }');
    // GRADE P1: the operator's all / none on a count question (graded ≤ the kind's count; removed ≥ 1)
    for (const [k, of] of [
      ['drillsGraded', 'drills'],
      ['internalGraded', 'internal'],
    ] as const)
      if (
        b[k] !== undefined &&
        !(isInt(b[k]) && (b[k] as number) >= 1 && (b[k] as number) <= (b[of] as number))
      )
        fail(`${p}.${k}`, `not an integer 1…${of}`);
    for (const k of ['notchesRemoved', 'drillsRemoved', 'internalRemoved'] as const)
      if (
        b[k] !== undefined &&
        !(isInt(b[k]) && (b[k] as number) >= 1 && (b[k] as number) <= 10000)
      )
        fail(`${p}.${k}`, 'not a positive integer');
    if (!isBool(b.hasSeam)) fail(`${p}.hasSeam`, 'not a boolean');
    // F14f: optional (a pre-F14f manifest has none and is then not trusted by the card), but
    // when present it is checked strictly and bounded — it is read on the card's parse path.
    if (b.contour !== undefined) {
      const why = contourSigShapeProblem(b.contour);
      if (why) fail(`${p}.contour`, why);
    }
    // G18 (A8): optional grain provenance — short words only (origins/evidence kinds may grow)
    if (
      b.grain !== undefined &&
      !(
        isObj(b.grain) &&
        isBoundedStr(b.grain.origin, 32) &&
        Array.isArray(b.grain.evidence) &&
        b.grain.evidence.length <= 16 &&
        b.grain.evidence.every((e) => isBoundedStr(e, 32))
      )
    )
      fail(`${p}.grain`, 'needs origin and a short evidence list');
    // P1: optional continuity audit — per edge rule / chains / roles / flags, the D3 verdict; bounded
    const cont = b.continuity;
    if (cont !== undefined && !continuityOk(cont))
      fail(
        `${p}.continuity`,
        'needs edges (rule R0–R2, chain ids, roles) and a D3 verdict or null',
      );
    // GRADE P2: optional — the size was repaired from the grade (holes ≤ the G15 bounds)
    const gr = b.grade;
    if (
      gr !== undefined &&
      !(
        isObj(gr) &&
        gr.geometryOrigin === 'repaired' &&
        Array.isArray(gr.from) &&
        gr.from.length === 2 &&
        gr.from.every((t) => isBoundedStr(t, 32)) &&
        isInt(gr.holes) &&
        (gr.holes as number) >= 0 &&
        (gr.holes as number) <= 16 &&
        isNum(gr.holesMm) &&
        (gr.holesMm as number) >= 0 &&
        (gr.holesMm as number) <= 1000 &&
        isNum(gr.cover) &&
        (gr.cover as number) >= 0 &&
        (gr.cover as number) <= 1
      )
    )
      fail(`${p}.grade`, "needs geometryOrigin 'repaired', two anchor tokens, holes and cover");
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
    const [x0, y0, x1, y1] = b.bboxMm as number[];
    return {
      block: b.block,
      identity: b.identity,
      sizeToken: b.sizeToken,
      sizeId: b.sizeId,
      bboxMm: [x0, y0, x1, y1],
      areaMm2: b.areaMm2,
      hasGrain: b.hasGrain,
      notches: b.notches as number,
      ...(b.notchesGraded !== undefined ? { notchesGraded: b.notchesGraded as number } : {}),
      ...(b.notchesChorded !== undefined ? { notchesChorded: b.notchesChorded as number } : {}),
      ...(Array.isArray(b.kinkStraightened) && b.kinkStraightened.length
        ? {
            kinkStraightened: (b.kinkStraightened as ManifestBlock['kinkStraightened'])!.map(
              (k) => ({ rule: k.rule, mm: k.mm, spanMm: k.spanMm }),
            ),
          }
        : {}),
      ...(b.drillsGraded !== undefined ? { drillsGraded: b.drillsGraded as number } : {}),
      ...(b.internalGraded !== undefined ? { internalGraded: b.internalGraded as number } : {}),
      ...(b.notchesRemoved !== undefined ? { notchesRemoved: b.notchesRemoved as number } : {}),
      ...(b.drillsRemoved !== undefined ? { drillsRemoved: b.drillsRemoved as number } : {}),
      ...(b.internalRemoved !== undefined ? { internalRemoved: b.internalRemoved as number } : {}),
      drills: b.drills as number,
      internal: b.internal as number,
      hasSeam: b.hasSeam,
      ...(isObj(b.grain)
        ? {
            grain: {
              origin: b.grain.origin as GrainFeature['origin'],
              evidence: [...(b.grain.evidence as GrainEvidenceKind[])],
            },
          }
        : {}),
      ...(b.contour !== undefined
        ? {
            contour: {
              dev: (b.contour as ContourSignature).dev,
              pts: [...(b.contour as ContourSignature).pts],
            },
          }
        : {}),
      ...(isObj(cont)
        ? { continuity: continuityOfBlock(cont as unknown as ManifestContinuity) }
        : {}),
      ...(isObj(gr)
        ? {
            grade: {
              geometryOrigin: 'repaired' as const,
              from: [String((gr.from as unknown[])[0]), String((gr.from as unknown[])[1])] as [
                string,
                string,
              ],
              holes: gr.holes as number,
              holesMm: gr.holesMm as number,
              cover: gr.cover as number,
            },
          }
        : {}),
    };
  });

  // Codex C8: every nested part checked and rebuilt — the result is built from validated fields
  // only, never the input object cast to the type.
  const source = validateSource(x.source);
  const gate = validateGate(x.gate);
  const autopilot = validateAutopilot(x.autopilot);
  const passport = readPassportDigest(x.passport);
  const replay = validateReplay(x.replay);
  return {
    v: MANIFEST_VERSION,
    generator: x.generator,
    createdAt: x.createdAt,
    techCardId: x.techCardId,
    scope: { fabricPurpose: x.scope.fabricPurpose, bomLineKey: x.scope.bomLineKey },
    units: 'mm',
    layers: { ...LAYERS },
    cutLayerIsFinal: true,
    allowanceMm: x.allowanceMm,
    sizes,
    pieces,
    blocks,
    source,
    gate,
    ...(autopilot ? { autopilot } : {}),
    ...(passport ? { passport } : {}),
    ...(replay ? { replay } : {}),
  };
}

// ── public API ──────────────────────────────────────────────────────────────────────────────────

/**
 * Prepends the manifest as 999 comments. Re-embedding replaces an earlier manifest (the writer
 * embeds, runs the gate, then embeds again with the gate report), and keeps any other leading comment
 * and the file's line endings. Throws `ManifestError` on an invalid manifest: a writer bug must not
 * produce a file the card refuses later.
 */
export const embedManifest: EmbedManifestFn = (dxfText, manifest) =>
  embedManifestAs(dxfText, manifest, 'v1z');

/**
 * `embedManifest` with an explicit line form. `'v1'` (uncompressed) exists for the probes and for
 * reading back files written before MF-B; the writer always uses `'v1z'`.
 */
export function embedManifestAs(
  dxfText: string,
  manifest: ConversionManifest,
  form: ManifestLineForm,
): string {
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
  const payload = toBase64(JSON.stringify(manifest), form);
  const max = PATIMPORT.manifestLineMax;
  const chunks: string[] = [];
  for (let i = 0; i < payload.length; i += max) chunks.push(payload.slice(i, i + max));
  if (chunks.length === 0) chunks.push('');
  const n = chunks.length;
  const head = chunks
    .map((c, i) => `999${eol}${MANIFEST_TAG} ${form} ${i + 1}/${n} ${c}${eol}`)
    .join('');
  return dxfText.slice(0, lead.start) + head + body;
}

/**
 * Bytes of the leading 999 block (the manifest prologue plus any foreign leading comments) — what
 * a sniffer has to walk before it sees `0 / SECTION`. The writer's preflight warns above 48 KB.
 */
export function manifestPrologueBytes(dxfText: string): number {
  const lead = leadingComments(dxfText);
  let n = 0;
  for (let i = lead.start; i < lead.end; i++) n += dxfText.charCodeAt(i) < 0x80 ? 1 : 2;
  return n;
}

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
  let form: ManifestLineForm | null = null;
  const chunks = new Map<number, string>();
  for (const line of tagged) {
    const m = LINE.exec(line);
    if (!m) {
      // A version we do not know may also change the line format; say «version» when we can tell.
      const v = /^GRBPWR-MANIFEST v(\d+)/.exec(line);
      if (v && Number(v[1]) !== MANIFEST_VERSION) {
        throw new ManifestError(
          'version',
          `line says v${v[1]}, this reader knows v${MANIFEST_VERSION}`,
        );
      }
      throw new ManifestError('corrupt', `unreadable manifest line "${line.slice(0, 60)}"`);
    }
    const [, ver, z, iStr, nStr, chunk] = m;
    if (Number(ver) !== MANIFEST_VERSION) {
      throw new ManifestError(
        'version',
        `line says v${ver}, this reader knows v${MANIFEST_VERSION}`,
      );
    }
    const f: ManifestLineForm = z ? 'v1z' : 'v1';
    if (form === null) form = f;
    else if (form !== f)
      throw new ManifestError('corrupt', 'compressed and plain manifest lines are mixed');
    const i = Number(iStr);
    const n = Number(nStr);
    if (!Number.isSafeInteger(n) || !Number.isSafeInteger(i) || n < 1 || i < 1 || i > n)
      throw new ManifestError(
        'corrupt',
        `chunk ${iStr.slice(0, 12)}/${nStr.slice(0, 12)} is out of range`,
      );
    if (n > MANIFEST_MAX_CHUNKS)
      throw new ManifestError(
        'corrupt',
        `${n} chunks is more than any manifest needs (${MANIFEST_MAX_CHUNKS})`,
      );
    if (total < 0) total = n;
    else if (total !== n)
      throw new ManifestError('partial', `chunk counts disagree (${total} and ${n})`);
    if (chunks.has(i)) throw new ManifestError('corrupt', `chunk ${i}/${n} appears twice`);
    chunks.set(i, chunk);
  }
  if (chunks.size !== total) {
    // count + the first few — `total` is bounded above, but a list of thousands helps nobody
    const first: number[] = [];
    for (let i = 1; i <= total && first.length < 5; i++) if (!chunks.has(i)) first.push(i);
    throw new ManifestError(
      'partial',
      `${total - chunks.size} of ${total} chunk(s) missing (first: ${first.join(', ')})`,
    );
  }
  let payload = '';
  for (let i = 1; i <= total; i++) {
    payload += chunks.get(i)!;
    if (payload.length > MANIFEST_MAX_B64)
      throw new ManifestError('corrupt', `payload is larger than ${MANIFEST_MAX_B64} characters`);
  }
  const json = fromBase64(payload, form ?? 'v1');
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
  // Codex C6: only the leading 999 prologue is decoded — walked as byte lines, bounded by
  // MANIFEST_MAX_PROLOGUE_BYTES — never the whole sheet.
  const bytes = new Uint8Array(buf);
  const start = bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf ? 3 : 0;
  const limit = Math.min(bytes.length, start + MANIFEST_MAX_PROLOGUE_BYTES);
  const lineEnd = (from: number) => {
    const nl = bytes.indexOf(0x0a, from);
    return nl < 0 || nl >= limit ? -1 : nl;
  };
  const isCode999 = (from: number, to: number) => {
    let a = from;
    let b = to;
    while (a < b && (bytes[a] === 0x20 || bytes[a] === 0x09)) a++;
    while (b > a && (bytes[b - 1] === 0x0d || bytes[b - 1] === 0x20 || bytes[b - 1] === 0x09)) b--;
    return b - a === 3 && bytes[a] === 0x39 && bytes[a + 1] === 0x39 && bytes[a + 2] === 0x39;
  };
  let pos = start;
  let truncated = false;
  for (;;) {
    const codeEnd = lineEnd(pos);
    if (codeEnd < 0) {
      truncated = limit < bytes.length;
      break;
    }
    if (!isCode999(pos, codeEnd)) break;
    const valueEnd = lineEnd(codeEnd + 1);
    if (valueEnd < 0) {
      truncated = limit < bytes.length;
      break;
    }
    pos = valueEnd + 1;
  }
  const window = new TextDecoder('latin1').decode(bytes.subarray(start, truncated ? limit : pos));
  if (truncated) {
    // A prologue past the bound: a foreign file with huge comments is still foreign; one that
    // carries our tag cannot be a manifest this reader would ever have written.
    if (!window.includes(MANIFEST_TAG)) return null;
    throw new ManifestError(
      'corrupt',
      `the leading comment block is longer than ${MANIFEST_MAX_PROLOGUE_BYTES} bytes`,
    );
  }
  return readManifest(window);
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
