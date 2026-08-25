import { TechCardAnalysisFinding } from 'api/proto-http/admin';

// IDENTITY OF A FINDING ACROSS RUNS, plus the session mirror of the last run.
//
// WHY THIS EXISTS AT ALL. A card's findings are answered by editing the card, and every edit
// changes what the next run says. If a re-run wiped the triage, the tool would punish the only
// person who acts on it, and the button would stop being pressed. So a finding needs a name that
// survives the model rephrasing it: `uid = sha256(category ‖ 0x00 ‖ sorted(refs))[:16]`.
//
// THE TITLE IS NOT IN THE MATERIAL. It is the one part of a finding the model rewrites between two
// runs about the same defect, and hashing it would break dismissals exactly where they matter. It
// is mixed in ONLY to separate two findings of the SAME run that collide on (category, refs) —
// see `assignUids`.

// ─── SHA-256, in plain TypeScript ──────────────────────────────────────────────────────────────
//
// NOT `crypto.subtle`, and that is not a preference. `crypto.subtle` is undefined outside a secure
// context, so on a plain-http stand (the component probe) every uid would be empty and the delta
// would quietly degrade to "everything is new" — a silent false green in the one place that is
// supposed to detect change. It is also async, which would push uid computation into an effect and
// let one render draw a list without identity. This is 60 lines, synchronous, and the probe checks
// it against node's own `crypto.createHash('sha256')` on ASCII, Cyrillic and empty input.

const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

const rotr = (x: number, n: number) => ((x >>> n) | (x << (32 - n))) >>> 0;

export function sha256Hex(input: string): string {
  const bytes = new TextEncoder().encode(input);
  const len = bytes.length;
  // One extra byte for the 0x80 marker and eight for the length, rounded up to whole 64-byte
  // blocks: 55 bytes of message still fit one block, 56 need two.
  const padded = new Uint8Array(((((len + 8) >> 6) + 1) * 64) | 0);
  padded.set(bytes);
  padded[len] = 0x80;
  const dv = new DataView(padded.buffer);
  const bits = len * 8;
  dv.setUint32(padded.length - 8, Math.floor(bits / 0x100000000));
  dv.setUint32(padded.length - 4, bits >>> 0);

  const h = new Uint32Array([
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
  ]);
  const w = new Uint32Array(64);

  for (let off = 0; off < padded.length; off += 64) {
    for (let i = 0; i < 16; i++) w[i] = dv.getUint32(off + i * 4);
    for (let i = 16; i < 64; i++) {
      const a15 = w[i - 15];
      const a2 = w[i - 2];
      const s0 = (rotr(a15, 7) ^ rotr(a15, 18) ^ (a15 >>> 3)) >>> 0;
      const s1 = (rotr(a2, 17) ^ rotr(a2, 19) ^ (a2 >>> 10)) >>> 0;
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
    }
    let a = h[0];
    let b = h[1];
    let c = h[2];
    let d = h[3];
    let e = h[4];
    let f = h[5];
    let g = h[6];
    let hh = h[7];
    for (let i = 0; i < 64; i++) {
      const S1 = (rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)) >>> 0;
      const ch = ((e & f) ^ (~e & g)) >>> 0;
      const t1 = (hh + S1 + ch + K[i] + w[i]) >>> 0;
      const S0 = (rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)) >>> 0;
      const maj = ((a & b) ^ (a & c) ^ (b & c)) >>> 0;
      const t2 = (S0 + maj) >>> 0;
      hh = g;
      g = f;
      f = e;
      e = (d + t1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (t1 + t2) >>> 0;
    }
    h[0] = (h[0] + a) >>> 0;
    h[1] = (h[1] + b) >>> 0;
    h[2] = (h[2] + c) >>> 0;
    h[3] = (h[3] + d) >>> 0;
    h[4] = (h[4] + e) >>> 0;
    h[5] = (h[5] + f) >>> 0;
    h[6] = (h[6] + g) >>> 0;
    h[7] = (h[7] + hh) >>> 0;
  }

  let out = '';
  for (let i = 0; i < 8; i++) out += h[i].toString(16).padStart(8, '0');
  return out;
}

// ─── UID ───────────────────────────────────────────────────────────────────────────────────────

/** 16 hex characters = 64 bits. A run holds tens of findings; this is not a namespace under load. */
const UID_LEN = 16;
/** NUL, per the design's §10 formula. A separator that cannot occur inside a category or an
 *  anchor is the whole point: with a printable one, («op», [«a:b»]) and («op:a», [«b»]) would
 *  hash the very same material. Written as an escape — a raw NUL byte in a source file makes
 *  grep call it binary and quietly return nothing. */
const SEP = '\u0000';

/** The bare uid: category and the anchors, sorted so anchor order cannot rename a finding. */
export function findingUid(category: string, refs: string[], titleSalt?: string): string {
  const sorted = [...refs].map((r) => r.trim()).filter(Boolean).sort();
  const material =
    category.trim() + SEP + sorted.join(SEP) + (titleSalt ? SEP + sha256Hex(titleSalt) : '');
  return sha256Hex(material).slice(0, UID_LEN);
}

/**
 * Uids for one run, positionally aligned with `findings`.
 *
 * COLLISIONS ARE RESOLVED FOR EVERY MEMBER OF THE COLLIDING GROUP, not for the second one onwards.
 * Salting only the later ones would make «which finding keeps the plain uid» depend on the order
 * the model happened to emit them in — that is precisely the instability the uid exists to remove.
 * Salting all of them is order-independent: the same set of findings yields the same set of uids.
 */
export function assignUids(findings: TechCardAnalysisFinding[]): string[] {
  const plain = findings.map((f) =>
    findingUid((f.category ?? '').trim(), (f.refs ?? []).filter((r): r is string => !!r?.trim())),
  );
  const seen = new Map<string, number>();
  for (const u of plain) seen.set(u, (seen.get(u) ?? 0) + 1);
  return plain.map((u, i) =>
    (seen.get(u) ?? 0) > 1
      ? findingUid(
          (findings[i].category ?? '').trim(),
          (findings[i].refs ?? []).filter((r): r is string => !!r?.trim()),
          (findings[i].title ?? '').trim(),
        )
      : u,
  );
}

// ─── THE SESSION MIRROR ────────────────────────────────────────────────────────────────────────
//
// A run costs money and forty seconds; F5 must not burn one. It must equally not outlive the
// session: a finding is ephemeral by design, and one that was ACCEPTED is already an issue row on
// the card. `sessionStorage` is exactly that lifetime, and nothing here is a source of truth —
// every read is defensive, and any failure degrades to «no stored run», never to a crash.

export type StoredRun = {
  findings: TechCardAnalysisFinding[];
  /** Positionally aligned with `findings`. Stored, not recomputed, so a restore cannot drift. */
  uids: string[];
  model: string;
  aiStatus: string;
  droppedBadRef: number;
  droppedContradiction: number;
  notChecked: string[];
  summary: string;
  /** Fingerprints AT THE MOMENT OF THE RUN (§10). Kept for the per-finding staleness that is not
   *  built yet — storing them now costs nothing and is the only moment they exist. */
  fingerprints: Record<string, string>;
  /** Epoch ms. The «when» half of the model · when stamp. */
  at: number;
};

export type StoredAnalysis = {
  v: 1;
  run: StoredRun | null;
  /** Uids of the run BEFORE `run` — the material the new/still-open delta is computed from. */
  previousUids: string[];
  dismissed: string[];
};

const KEY = (cardId: number) => `tc-analysis:${cardId}`;

export const EMPTY_ANALYSIS: StoredAnalysis = {
  v: 1,
  run: null,
  previousUids: [],
  dismissed: [],
};

function store(): Storage | null {
  try {
    return typeof sessionStorage === 'undefined' ? null : sessionStorage;
  } catch {
    // Storage access can throw outright under a strict privacy setting.
    return null;
  }
}

export function loadAnalysis(cardId: number | undefined): StoredAnalysis {
  if (!cardId) return EMPTY_ANALYSIS;
  const s = store();
  if (!s) return EMPTY_ANALYSIS;
  try {
    const raw = s.getItem(KEY(cardId));
    if (!raw) return EMPTY_ANALYSIS;
    const parsed = JSON.parse(raw) as Partial<StoredAnalysis>;
    if (parsed?.v !== 1) return EMPTY_ANALYSIS;
    const run = parsed.run ?? null;
    // A run whose uids do not line up with its findings is not a run: dropping it costs one
    // re-analyse, while trusting it would mislabel every finding in the delta.
    const ok =
      !run ||
      (Array.isArray(run.findings) &&
        Array.isArray(run.uids) &&
        run.findings.length === run.uids.length);
    return {
      v: 1,
      run: ok ? run : null,
      previousUids: Array.isArray(parsed.previousUids) ? parsed.previousUids : [],
      dismissed: Array.isArray(parsed.dismissed) ? parsed.dismissed : [],
    };
  } catch {
    return EMPTY_ANALYSIS;
  }
}

export function saveAnalysis(cardId: number | undefined, value: StoredAnalysis): void {
  if (!cardId) return;
  const s = store();
  if (!s) return;
  try {
    s.setItem(KEY(cardId), JSON.stringify(value));
  } catch {
    // A full quota must not take the panel down with it: the run is already on screen, and
    // losing only its mirror costs one re-analyse after a reload.
  }
}
