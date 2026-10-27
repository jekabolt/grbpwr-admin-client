import { sha256Hex } from './analysis-identity.ts';

// THE KEY AND THE FINGERPRINT OF A FINDING, built in the browser exactly as the server builds them
// (grbpwr-manager internal/techcardanalysis/findingkey.go). The server marks «seen» by key and
// counts a mark only while the fingerprint matches; for a finding the BROWSER computes (pdf_*, the
// assembly-schema checks) it cannot recompute either, so the client must mint them the same way:
//
//   key         = code "@" join(",", sort(dedupe(normalize(refs)))) ["#" subject]
//   fingerprint = hex(sha256(mask(title) 0x00 mask(detail) 0x00 fp8_1 fp8_2 …))[:16]
//
// Inside a key a step is ALWAYS "opfp:<fp8>.<k>" — its shape and its ordinal among the steps of that
// shape — so renumbering keeps the key; mask() takes the step numbers of the refs out of the text,
// so renumbering keeps the fingerprint too.
//
// Pure and synchronous (sha256Hex is plain TypeScript), so a render never draws a list without
// identity. Both sides assert the same golden vectors: scripts/finding-seen-check.ts here,
// TestFindingKeyGoldenVectors on the server — change one only together with the other.

/** tech_card_finding_seen.finding_key is this wide; the server refuses a longer key. */
export const MAX_FINDING_KEY_BYTES = 512;
/** A longer key folds to a hash, leaving room for the collision suffix. */
const KEY_BODY_BYTES = MAX_FINDING_KEY_BYTES - 32;
export const FINGERPRINT_LEN = 16;

/** The code a client finding may use: snake_case. The server refuses a key without it. */
export const FINDING_CODE = /^[a-z][a-z0-9_]*$/;

/**
 * The namespaces of findings the browser computes. The server accepts a mark only for its own audit
 * codes or a code in one of these (techcardanalysis.ClientCodePrefixes) and keeps none of its codes
 * here, so a prefix is all the client needs to know.
 */
export const CLIENT_CODE_PREFIXES = ['pdf_', 'asm_'] as const;

/** Whether `code` may key a client finding: snake_case in a client namespace. */
export function isClientFindingCode(code: string): boolean {
  return FINDING_CODE.test(code) && CLIENT_CODE_PREFIXES.some((p) => code.startsWith(p));
}

/** operation_number → fp8, as GetTechCardConstructionAuditResponse.operationFingerprints. */
export type OpFingerprints = Readonly<Record<string, string>> | undefined;

const utf8 = new TextEncoder();
const byteLength = (s: string) => utf8.encode(s).length;

/** Go's sort.Strings order (UTF-8 bytes = code points), not JS's UTF-16 code-unit order. */
function byCodePoint(a: string, b: string): number {
  const x = Array.from(a);
  const y = Array.from(b);
  for (let i = 0; i < Math.min(x.length, y.length); i++) {
    const d = x[i].codePointAt(0)! - y[i].codePointAt(0)!;
    if (d !== 0) return d;
  }
  return x.length - y.length;
}

const INT32_MIN = -2147483648;
const INT32_MAX = 2147483647;

/** The number of an "op:<n>" ref (strconv.ParseInt base 10, int32), or null. */
function opNumberOf(ref: string): number | null {
  const m = /^op:([+-]?\d+)$/.exec(ref);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isSafeInteger(n) && n >= INT32_MIN && n <= INT32_MAX ? n : null;
}

/**
 * operation_number → the token that stands for that step INSIDE a key: ALWAYS "opfp:<fp8>.<k>", k
 * the 1-based ordinal of the step among the card's steps of the same fp8, by operation number. A
 * unique shape is ".1" from the start, so a later step of the same shape never moves an earlier key.
 */
export function opKeyTokens(opFingerprints: OpFingerprints): Map<number, string> {
  const steps = Object.entries(opFingerprints ?? {})
    .filter(([, fp]) => !!fp)
    .map(([n, fp]) => [Number(n), fp] as const)
    .sort((a, b) => a[0] - b[0]);
  const ordinal = new Map<string, number>();
  const out = new Map<number, string>();
  for (const [n, fp] of steps) {
    const k = (ordinal.get(fp) ?? 0) + 1;
    ordinal.set(fp, k);
    out.set(n, `opfp:${fp}.${k}`);
  }
  return out;
}

/** Steps replaced by their token, deduplicated, sorted by code point (= Go's byte order). */
function normalizeRefs(refs: readonly string[], tokens: Map<number, string>): string[] {
  const norm: string[] = [];
  const seen = new Set<string>();
  for (const raw of refs) {
    const n = opNumberOf(raw);
    const r = (n !== null && tokens.get(n)) || raw;
    if (seen.has(r)) continue;
    seen.add(r);
    norm.push(r);
  }
  return norm.sort(byCodePoint);
}

/**
 * The key of one finding. `refs` are the sigils the finding names ("op:12", "seam:<seam_key>",
 * "unit:<key>", "piece:<name>", "card"); `subject` tells apart two findings of one code on the same
 * refs. Pass the audit's `operationFingerprints` so a step is anchored by its shape and the key
 * survives renumbering.
 */
export function findingKey(
  code: string,
  refs: readonly string[] = [],
  opts: { subject?: string; opFingerprints?: OpFingerprints; tokens?: Map<number, string> } = {},
): string {
  const tokens = opts.tokens ?? opKeyTokens(opts.opFingerprints);
  let key = `${code}@${normalizeRefs(refs, tokens).join(',')}`;
  if (opts.subject) key += `#${opts.subject}`;
  if (byteLength(key) <= KEY_BODY_BYTES) return key;
  return `${code}@sha256:${sha256Hex(key).slice(0, 32)}`;
}

const isDigit = (c: number) => c >= 48 && c <= 57;
const isWord = (c: number) =>
  isDigit(c) || (c >= 97 && c <= 122) || (c >= 65 && c <= 90) || c === 95;
const DOT = 46;
const COMMA = 44;

/**
 * `text` with every whole-word number that equals the number of a step the refs name ("op:010"
 * names 10) replaced by "#". A number is a maximal run of ASCII digits, with "." or "," joining
 * further digit runs ("12.5", "1,200" never match a step); whole-word means no ASCII letter, digit
 * or "_" right before or after it. Same scan as the server's MaskOpNumbers: a UTF-16 unit is ASCII
 * exactly when the UTF-8 byte is, so a non-Latin letter is a boundary on both sides.
 */
export function maskOpNumbers(text: string, refs: readonly string[] = []): string {
  const nums = new Set<string>();
  for (const r of refs) {
    const n = opNumberOf(r);
    if (n !== null) nums.add(String(n));
  }
  if (nums.size === 0) return text;
  let out = '';
  let last = 0;
  let i = 0;
  while (i < text.length) {
    if (!isDigit(text.charCodeAt(i))) {
      i++;
      continue;
    }
    const start = i;
    while (i < text.length && isDigit(text.charCodeAt(i))) i++;
    while (
      i + 1 < text.length &&
      (text.charCodeAt(i) === DOT || text.charCodeAt(i) === COMMA) &&
      isDigit(text.charCodeAt(i + 1))
    ) {
      i++;
      while (i < text.length && isDigit(text.charCodeAt(i))) i++;
    }
    if (
      (start > 0 && isWord(text.charCodeAt(start - 1))) ||
      (i < text.length && isWord(text.charCodeAt(i)))
    ) {
      continue;
    }
    if (nums.has(text.slice(start, i))) {
      out += `${text.slice(last, start)}#`;
      last = i;
    }
  }
  return last === 0 ? text : out + text.slice(last);
}

/**
 * The fingerprint of the text the reader sees: title, detail (step numbers masked) and the shape
 * (fp8) of every step the refs name that the card still has. Change any of them — but not a number
 * of a step — and a «seen» mark stops counting.
 */
export function findingFingerprint(
  title: string,
  detail: string,
  refs: readonly string[] = [],
  opFingerprints?: OpFingerprints,
): string {
  const fps: string[] = [];
  const seen = new Set<number>();
  for (const r of refs) {
    const n = opNumberOf(r);
    if (n === null || seen.has(n)) continue;
    seen.add(n);
    const fp = opFingerprints?.[String(n)];
    if (fp !== undefined) fps.push(fp);
  }
  fps.sort(byCodePoint);
  const t = maskOpNumbers(title, refs);
  const d = maskOpNumbers(detail, refs);
  return sha256Hex(`${t}\u0000${d}\u0000${fps.join('')}`).slice(0, FINGERPRINT_LEN);
}

/** Whether `key` has the shape the server accepts (code@…, at most MAX_FINDING_KEY_BYTES). */
export function isValidFindingKey(key: string): boolean {
  const at = key.indexOf('@');
  return at > 0 && FINDING_CODE.test(key.slice(0, at)) && byteLength(key) <= MAX_FINDING_KEY_BYTES;
}

/**
 * What the collision net hashes (the server's findingIdentity): hex(sha256("fk1" 0x00 ‖ code ‖
 * subject ‖ masked title ‖ each normalized ref))[:16], every field as <UTF-8 byte length>":"<field>.
 * The length prefixes make it injective; the masked title keeps it still under renumbering.
 */
export function findingIdentity(
  code: string,
  subject: string,
  title: string,
  refs: readonly string[],
  tokens: Map<number, string>,
): string {
  const field = (f: string) => `${byteLength(f)}:${f}`;
  const parts = [code, subject, maskOpNumbers(title, refs), ...normalizeRefs(refs, tokens)];
  return sha256Hex(`fk1\u0000${parts.map(field).join('')}`).slice(0, FINGERPRINT_LEN);
}

/**
 * Keys for a whole list, with the server's safety net for two findings that still share a key: a
 * key held by one finding is reserved first; each finding of a shared key gets "~<identity16>", then
 * a running ".n" from 2 while that is taken. Unique over the whole list. An item with an empty
 * `code` gets no key and takes no part. A check that hits the net routinely should pass a `subject`.
 */
export function assignFindingKeys(
  items: readonly { code: string; refs?: readonly string[]; subject?: string; title: string }[],
  opFingerprints?: OpFingerprints,
): string[] {
  const tokens = opKeyTokens(opFingerprints);
  const keys = items.map((f) =>
    f.code ? findingKey(f.code, f.refs, { subject: f.subject, tokens }) : '',
  );
  const count = new Map<string, number>();
  for (const k of keys) if (k) count.set(k, (count.get(k) ?? 0) + 1);
  const taken = new Set(keys.filter((k) => count.get(k) === 1));
  return keys.map((k, i) => {
    if (!k || count.get(k) === 1) return k;
    const f = items[i];
    const base = `${k}~${findingIdentity(f.code, f.subject ?? '', f.title, f.refs ?? [], tokens)}`;
    let out = base;
    for (let n = 2; taken.has(out); n++) out = `${base}.${n}`;
    taken.add(out);
    return out;
  });
}
