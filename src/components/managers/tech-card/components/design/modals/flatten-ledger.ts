/**
 * ═══ THE FLATTENS WHOSE ANSWER NEVER CAME — A LEDGER PER TAB (27.09, O-53 phase 2, D-54) ════════
 *
 * Every flatten carries the key of its gesture (`client_request_id`, `use-edit-layer.ts`), and the
 * server answers a repeat of that key with the picture the first attempt filed. The key protects
 * nothing once the client has lost it. Held by the editor alone (a ref), it died with the editor:
 * the answer lost, the editor closed or its card switched, and the next «save» minted a NEW key and
 * filed a second picture beside the first (REVIEW-T53-pkg2-codex.md, High 2).
 *
 * So a flatten is written here BEFORE it is sent, and struck off on a DEFINITE answer — the picture,
 * or any refusal. What stays is exactly the flattens whose outcome is unknown. Reopening the same
 * editor over the same drawing finds its entry: the workbench's question offers «retry this save ›»
 * first, and the same answer resends the stored body as is.
 *
 * WHERE: `sessionStorage`, one key per card — `plm.techcard.flatten-gesture.v1.<card>`. Per TAB on
 * purpose: the key is this tab's gesture, and it survives a reload of the tab and dies with it. When
 * the storage throws (blocked, full) this module's memory keeps the entries for the page's life: a
 * remount of the editor still finds them, a reload does not.
 *
 * WHAT AN ENTRY IS: a layer, the rev its raster depicts, the answer (the picture the edit takes the
 * place of, or 0 — beside) and the fingerprint of the layer document; it carries the key, the rev
 * and the media the flatten echoed, and why overwrite was closed when the gesture was made (null —
 * it stood open). At most `GESTURES_PER_CARD` a card, the oldest out. Nothing here touches another
 * card's list, and an entry leaves only by its own key.
 */

export type FlattenGesture = {
  /** `client_request_id` — the server's key for this gesture. */
  key: string;
  layerId: number;
  /** The layer revision the raster depicts — echoed as `expected_rev`. */
  rev: number;
  /** The picture the edit takes the place of; 0 — beside its base. */
  replacePictureId: number;
  /** The raster uploaded for this gesture. */
  mediaId: number;
  /** `docFingerprint` of the layer document the raster was drawn from — «the same drawing». */
  doc: string;
  /** Why overwrite was closed when the gesture was made; null — it stood open. */
  closedAtGesture: string | null;
  /** When the gesture was made (ms) — the order the ceiling drops by. */
  at: number;
};

/** One key per card; `v1` is the shape of an entry. */
const PREFIX = 'plm.techcard.flatten-gesture.v1.';

/** The ceiling of one card's list — a gesture whose answer never came is rare, twenty is plenty. */
export const GESTURES_PER_CARD = 20;

/** The same lists, for a page whose storage throws. Written on every change, read only then. */
const memory = new Map<number, FlattenGesture[]>();

const KEY_MAX = 64;

/**
 * One entry, taken only if it looks like one. The storage is anybody's — another bundle, a hand in
 * the devtools — so a malformed entry is dropped rather than resent: a wrong key or media on the
 * wire would be refused at best and file somebody's stale raster at worst.
 */
function parseGesture(raw: unknown): FlattenGesture | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const whole = (v: unknown, min: number) =>
    typeof v === 'number' && Number.isInteger(v) && v >= min ? v : null;
  const key = typeof r.key === 'string' ? r.key.trim() : '';
  const layerId = whole(r.layerId, 1);
  const rev = whole(r.rev, 0);
  const replacePictureId = whole(r.replacePictureId, 0);
  const mediaId = whole(r.mediaId, 1);
  const at = typeof r.at === 'number' && Number.isFinite(r.at) ? r.at : null;
  if (!key || key.length > KEY_MAX || typeof r.doc !== 'string' || !r.doc) return null;
  if (
    layerId === null ||
    rev === null ||
    replacePictureId === null ||
    mediaId === null ||
    at === null
  )
    return null;
  return {
    key,
    layerId,
    rev,
    replacePictureId,
    mediaId,
    doc: r.doc,
    closedAtGesture: typeof r.closedAtGesture === 'string' ? r.closedAtGesture : null,
    at,
  };
}

function readCard(cardId: number): FlattenGesture[] {
  try {
    const raw = globalThis.sessionStorage.getItem(PREFIX + cardId);
    if (raw !== null) {
      const parsed: unknown = JSON.parse(raw);
      if (Array.isArray(parsed))
        return parsed.map(parseGesture).filter((g): g is FlattenGesture => g !== null);
    }
  } catch {
    /* storage closed or the entry unreadable — the page's memory answers */
  }
  return memory.get(cardId) ?? [];
}

function writeCard(cardId: number, list: FlattenGesture[]): void {
  if (list.length) memory.set(cardId, list);
  else memory.delete(cardId);
  try {
    if (list.length) globalThis.sessionStorage.setItem(PREFIX + cardId, JSON.stringify(list));
    else globalThis.sessionStorage.removeItem(PREFIX + cardId);
  } catch {
    /* the page's memory holds it for this page's life */
  }
}

/** Write a gesture down BEFORE its flatten goes out. The oldest of the card goes over the ceiling. */
export function rememberGesture(cardId: number, gesture: FlattenGesture): void {
  const rest = readCard(cardId).filter((g) => g.key !== gesture.key);
  const list = [...rest, gesture].sort((a, b) => a.at - b.at).slice(-GESTURES_PER_CARD);
  writeCard(cardId, list);
}

/** A definite answer came — the picture, or a refusal: the gesture is over. */
export function forgetGesture(cardId: number, key: string): void {
  const list = readCard(cardId);
  const next = list.filter((g) => g.key !== key);
  if (next.length !== list.length) writeCard(cardId, next);
}

/**
 * THE EARLIER GESTURE OF THIS EDITOR OVER THIS DRAWING whose answer never came — the newest, among
 * the answers `targets` names (0 — beside; a picture id — in its place). The rev is NOT compared:
 * the flatten does not move the layer's rev, and a save of the same drawing since does — a match on
 * it would mint a new key for a gesture the server may already have filed. The resend answers
 * either way: the picture, or `layer_rev_mismatch` — which proves it was never filed.
 */
export function findGesture(
  cardId: number,
  at: { layerId: number; doc: string; targets: readonly number[] },
): FlattenGesture | null {
  let found: FlattenGesture | null = null;
  for (const g of readCard(cardId)) {
    if (g.layerId !== at.layerId || g.doc !== at.doc || !at.targets.includes(g.replacePictureId))
      continue;
    if (!found || g.at > found.at) found = g;
  }
  return found;
}

/**
 * THE DRAWING'S FINGERPRINT — the length and a 53-bit hash of the layer document (cyrb53). The
 * document itself can be half a megabyte and the ledger holds twenty; the fingerprint only has to
 * tell two drawings of one layer apart.
 */
export function docFingerprint(doc: string): string {
  let h1 = 0xdeadbeef ^ doc.length;
  let h2 = 0x41c6ce57 ^ doc.length;
  for (let i = 0; i < doc.length; i++) {
    const ch = doc.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  const hash = 4294967296 * (2097151 & h2) + (h1 >>> 0);
  return `${doc.length.toString(36)}.${hash.toString(36)}`;
}
