import { sha256Hex } from './analysis-identity.ts';

// THE KEY AND THE FINGERPRINT OF A FINDING, built in the browser exactly as the server builds them
// (grbpwr-manager internal/techcardanalysis/findingkey.go). The server marks «seen» by key and
// counts a mark only while the fingerprint matches; for a finding the BROWSER computes (pdf_*, the
// assembly-schema checks) it cannot recompute either, so the client must mint them the same way:
//
//   key         = code "@" join(",", sort(dedupe(normalize(refs)))) ["#" subject]
//   fingerprint = hex(sha256(title 0x00 detail 0x00 fp8_1 fp8_2 …))[:16]
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
 * operation_number → the token that stands for that step INSIDE a key: "opfp:<fp8>" when no other
 * step of the card has the same fp8. A step that shares its shape keeps "op:<n>".
 */
export function opKeyTokens(opFingerprints: OpFingerprints): Map<number, string> {
  const fps = Object.entries(opFingerprints ?? {});
  const count = new Map<string, number>();
  for (const [, fp] of fps) count.set(fp, (count.get(fp) ?? 0) + 1);
  const out = new Map<number, string>();
  for (const [n, fp] of fps) if (fp && count.get(fp) === 1) out.set(Number(n), `opfp:${fp}`);
  return out;
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
  const norm: string[] = [];
  const seen = new Set<string>();
  for (const raw of refs) {
    const n = opNumberOf(raw);
    const r = (n !== null && tokens.get(n)) || raw;
    if (seen.has(r)) continue;
    seen.add(r);
    norm.push(r);
  }
  norm.sort(byCodePoint);
  let key = `${code}@${norm.join(',')}`;
  if (opts.subject) key += `#${opts.subject}`;
  if (byteLength(key) <= KEY_BODY_BYTES) return key;
  return `${code}@sha256:${sha256Hex(key).slice(0, 32)}`;
}

/**
 * The fingerprint of the text the reader sees: title, detail and the shape (fp8) of every step the
 * refs name that the card still has. Change any of them and a «seen» mark stops counting.
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
  return sha256Hex(`${title}\u0000${detail}\u0000${fps.join('')}`).slice(0, FINGERPRINT_LEN);
}

/** Whether `key` has the shape the server accepts (code@…, at most MAX_FINDING_KEY_BYTES). */
export function isValidFindingKey(key: string): boolean {
  const at = key.indexOf('@');
  return at > 0 && FINDING_CODE.test(key.slice(0, at)) && byteLength(key) <= MAX_FINDING_KEY_BYTES;
}

/**
 * Keys for a whole list, with the server's safety net for two findings that still share a key:
 * "~<hash8(title)>", and a running ".n" when even the titles agree. A check that hits this routinely
 * should pass a `subject` instead.
 */
export function assignFindingKeys(
  items: readonly { code: string; refs?: readonly string[]; subject?: string; title: string }[],
  opFingerprints?: OpFingerprints,
): string[] {
  const tokens = opKeyTokens(opFingerprints);
  const keys = items.map((f) => findingKey(f.code, f.refs, { subject: f.subject, tokens }));
  const groups = new Map<string, number[]>();
  keys.forEach((k, i) => groups.set(k, [...(groups.get(k) ?? []), i]));
  for (const idx of groups.values()) {
    if (idx.length < 2) continue;
    const used = new Map<string, number>();
    for (const i of idx) {
      let k = `${keys[i]}~${sha256Hex(items[i].title).slice(0, 8)}`;
      const n = (used.get(k) ?? 0) + 1;
      used.set(k, n);
      if (n > 1) k += `.${n}`;
      keys[i] = k;
    }
  }
  return keys;
}
