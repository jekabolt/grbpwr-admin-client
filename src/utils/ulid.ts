// Minimal ULID generator (26-char Crockford base32) for client-generated stable line identities.
//
// PLM-rework Q9/§2.3: a tech-card BOM line (and cut-piece) gets a `line_key` the moment it is
// created in the UI — BEFORE the first save — so operations / pieces / colourway recipes can hold a
// durable reference to it instead of a fragile positional index. The server keyed-reconciles by this
// key and keeps the row's real PK stable across full-replace saves. CHAR(26) on the wire.
//
// This is deliberately not the full ULID spec (no monotonic factory); it only needs to be a
// collision-resistant, lexicographically time-ordered 26-char Crockford-base32 string. 48-bit
// timestamp (10 chars) + 80 bits of randomness (16 chars).

const ENCODING = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'; // Crockford base32 (no I, L, O, U)

function randomBytes(len: number): Uint8Array {
  const out = new Uint8Array(len);
  const g = (globalThis as { crypto?: Crypto }).crypto;
  if (g?.getRandomValues) {
    g.getRandomValues(out);
    return out;
  }
  for (let i = 0; i < len; i += 1) out[i] = Math.floor(Math.random() * 256);
  return out;
}

function encodeTime(now: number): string {
  let ts = now;
  let out = '';
  for (let i = 0; i < 10; i += 1) {
    out = ENCODING[ts % 32] + out;
    ts = Math.floor(ts / 32);
  }
  return out;
}

function encodeRandom(): string {
  const bytes = randomBytes(16);
  let out = '';
  for (let i = 0; i < 16; i += 1) out += ENCODING[bytes[i] % 32];
  return out;
}

// Returns a fresh 26-char uppercase ULID-like key.
export function ulid(now: number = Date.now()): string {
  return encodeTime(now) + encodeRandom();
}

// True for a well-formed 26-char Crockford-base32 key (used to decide whether a row still needs one).
export function isUlid(v: string | undefined): v is string {
  return !!v && v.length === 26 && /^[0-9A-HJKMNP-TV-Z]{26}$/.test(v);
}
