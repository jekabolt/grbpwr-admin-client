// The sign-up «not a robot» task (ALTCHA v1, lane X6): find n in [0, max] with
// SHA-256(salt + n) = challenge. Pure: runs in the worker, or on the page in slices.

export interface Challenge {
  algorithm: string;
  challenge: string;
  maxnumber: number;
  salt: string;
  signature: string;
}

/** A challenge the server could have sent; anything else means «no task». */
export function isChallenge(v: unknown): v is Challenge {
  const c = v as Partial<Challenge> | null;
  return (
    !!c &&
    c.algorithm === 'SHA-256' &&
    typeof c.challenge === 'string' &&
    /^[0-9a-f]{64}$/i.test(c.challenge) &&
    typeof c.maxnumber === 'number' &&
    c.maxnumber > 0 &&
    c.maxnumber <= 10_000_000 &&
    typeof c.salt === 'string' &&
    typeof c.signature === 'string'
  );
}

const BATCH = 64;

function hexBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

function same(a: ArrayBuffer, b: Uint8Array): boolean {
  const v = new Uint8Array(a);
  for (let i = 0; i < b.length; i++) if (v[i] !== b[i]) return false;
  return true;
}

/**
 * The number, or null when there is none (or `stop` says so). Digests go in batches so the
 * browser can run them side by side; `pause` (if given) runs between batches — on the page it
 * yields to typing.
 */
export async function solve(
  c: Pick<Challenge, 'challenge' | 'maxnumber' | 'salt'>,
  pause?: () => Promise<void>,
  stop?: () => boolean,
): Promise<number | null> {
  const target = hexBytes(c.challenge.toLowerCase());
  const enc = new TextEncoder();
  for (let start = 0; start <= c.maxnumber; start += BATCH) {
    if (stop?.()) return null;
    const end = Math.min(start + BATCH - 1, c.maxnumber);
    const jobs: Promise<ArrayBuffer>[] = [];
    for (let n = start; n <= end; n++)
      jobs.push(crypto.subtle.digest('SHA-256', enc.encode(c.salt + n)));
    const hashes = await Promise.all(jobs);
    for (let i = 0; i < hashes.length; i++) if (same(hashes[i], target)) return start + i;
    if (pause) await pause();
  }
  return null;
}

/** The header value: base64 of the ALTCHA v1 payload. */
export function payload(c: Challenge, number: number, took: number): string {
  return btoa(
    JSON.stringify({
      algorithm: c.algorithm,
      challenge: c.challenge,
      number,
      salt: c.salt,
      signature: c.signature,
      took: Math.round(took),
    }),
  );
}
