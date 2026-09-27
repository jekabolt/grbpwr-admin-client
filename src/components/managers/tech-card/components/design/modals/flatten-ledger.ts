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
 * editor over the same drawing finds its entry: the editor's question offers «retry the earlier
 * save ›» first, and that door resends the stored body as is.
 *
 * WHERE: `sessionStorage`, one key per card — `plm.techcard.flatten-gesture.v1.<card>`. Per TAB on
 * purpose: the key is this tab's gesture, and it survives a reload of the tab and dies with it.
 *
 * ⚠ ONCE THIS PAGE HAS READ OR WRITTEN A CARD, ITS MEMORY IS THE LIST (review r3, High 1). Storage
 * is read only for a card the page has not touched yet — what a reload carried over. Every write
 * goes to memory first and to storage second, and storage can refuse it (quota, blocked): it then
 * holds an OLDER list. A read that preferred storage lost exactly the newest key — the one whose
 * answer is the likeliest to be missing. Across a reload such a key is lost all the same; within the
 * page it is not.
 *
 * WHAT AN ENTRY IS: a layer, the rev its raster depicts, the answer (the picture the edit takes the
 * place of, or 0 — beside) and the fingerprint of the DRAWING the raster was made of
 * (`drawingFingerprint`); it carries the key and the media the flatten echoed.
 *
 * ⚠ NOTHING UNANSWERED IS DROPPED TO MAKE ROOM (review r3). At `GESTURES_PER_CARD` a card takes no
 * new gesture — `rememberGesture` answers false and the editor asks for one to be settled first. An
 * entry leaves the list in three ways only:
 *   · a definite answer to its own key (`forgetGesture`);
 *   · a newer gesture of the same layer and the same answer: the person saved afresh instead of
 *     retrying it, and a retry of the older one after that could only file a second picture;
 *   · its layer provably no longer exists on the card (`live`) — it can never be matched again.
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
  /** `drawingFingerprint` of what the raster was drawn from — «the same drawing». */
  doc: string;
  /** When the gesture was made (ms) — the order of the list; the oldest is the first to settle. */
  at: number;
};

/** One key per card; `v1` is the shape of an entry. */
const PREFIX = 'plm.techcard.flatten-gesture.v1.';

/** The ceiling of one card's list — a gesture whose answer never came is rare, twenty is plenty. */
export const GESTURES_PER_CARD = 20;

/**
 * THIS PAGE'S LIST OF EVERY CARD IT HAS TOUCHED — and, for those cards, THE list (see the header):
 * filled on the first read of a card from storage, replaced on every write. An emptied list stays
 * here as an empty list, so a storage that refused the removal cannot hand the struck entries back.
 */
const memory = new Map<number, FlattenGesture[]>();

const KEY_MAX = 64;

/**
 * One entry, taken only if it looks like one. The storage is anybody's — another bundle, a hand in
 * the devtools — so a malformed entry is dropped rather than resent: a wrong key or media on the
 * wire would be refused at best and file somebody's stale raster at worst. Fields this shape does
 * not know (`closedAtGesture` of the round-2 build) are ignored.
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
  return { key, layerId, rev, replacePictureId, mediaId, doc: r.doc, at };
}

function readCard(cardId: number): FlattenGesture[] {
  const known = memory.get(cardId);
  if (known) return known;
  let list: FlattenGesture[] = [];
  try {
    const raw = globalThis.sessionStorage.getItem(PREFIX + cardId);
    if (raw !== null) {
      const parsed: unknown = JSON.parse(raw);
      if (Array.isArray(parsed))
        list = parsed.map(parseGesture).filter((g): g is FlattenGesture => g !== null);
    }
  } catch {
    /* storage closed or the entry unreadable — nothing is carried over */
  }
  memory.set(cardId, list);
  return list;
}

function writeCard(cardId: number, list: FlattenGesture[]): void {
  memory.set(cardId, list);
  try {
    if (list.length) globalThis.sessionStorage.setItem(PREFIX + cardId, JSON.stringify(list));
    else globalThis.sessionStorage.removeItem(PREFIX + cardId);
  } catch {
    /* storage keeps an older list (quota, blocked); this page reads its memory, which is newer */
  }
}

/**
 * THE ENTRIES WHOSE LAYER IS PROVABLY GONE, OFF. `layers` is the card's layer ids as a band read
 * lists them (`GetDesignBand.layers`). A layer missing from that read is gone only if the read came
 * AFTER the layer was made — and a read that lists a NEWER layer (ids only grow) came after it. A
 * layer newer than every one the read lists may simply be younger than the read: it stays. Without
 * a list nothing is judged.
 */
function live(list: FlattenGesture[], layers: readonly number[] | undefined): FlattenGesture[] {
  if (!layers?.length) return list;
  const known = new Set(layers);
  const newest = Math.max(...layers);
  return list.filter((g) => known.has(g.layerId) || g.layerId > newest);
}

/** The card's list with the provably dead entries struck off — written back when any were. */
function readLive(cardId: number, layers: readonly number[] | undefined): FlattenGesture[] {
  const list = readCard(cardId);
  const kept = live(list, layers);
  if (kept.length !== list.length) writeCard(cardId, kept);
  return kept;
}

/**
 * Write a gesture down BEFORE its flatten goes out. FALSE — the card's list is at its ceiling: the
 * gesture is not written and must not be sent (nothing unanswered is dropped to make room). A
 * gesture already on the list — a retry — is always taken. An earlier unanswered gesture of the same
 * layer and the same answer leaves: the person saved afresh instead of retrying it.
 */
export function rememberGesture(
  cardId: number,
  gesture: FlattenGesture,
  layers?: readonly number[],
): boolean {
  const list = readLive(cardId, layers);
  if (list.some((g) => g.key === gesture.key)) return true;
  const rest = list.filter(
    (g) => !(g.layerId === gesture.layerId && g.replacePictureId === gesture.replacePictureId),
  );
  if (rest.length >= GESTURES_PER_CARD) return false;
  writeCard(
    cardId,
    [...rest, gesture].sort((a, b) => a.at - b.at),
  );
  return true;
}

/** A definite answer came — the picture, or a refusal: the gesture is over. */
export function forgetGesture(cardId: number, key: string): void {
  const list = readCard(cardId);
  const next = list.filter((g) => g.key !== key);
  if (next.length !== list.length) writeCard(cardId, next);
}

/**
 * THE CARD HAS AS MANY UNANSWERED SAVES AS IT MAY HOLD — no new one goes out until one is settled.
 * Asked before anything is written, so a refused gesture costs no save and no upload.
 */
export function ledgerFull(cardId: number, layers?: readonly number[]): boolean {
  return readLive(cardId, layers).length >= GESTURES_PER_CARD;
}

/** The card's oldest unanswered save — the one «settle one» resends first. */
export function oldestGesture(cardId: number, layers?: readonly number[]): FlattenGesture | null {
  let found: FlattenGesture | null = null;
  for (const g of readLive(cardId, layers)) if (!found || g.at < found.at) found = g;
  return found;
}

/**
 * THE EARLIER GESTURE OF THIS EDITOR OVER THIS DRAWING whose answer never came — the newest, among
 * the answers `targets` names (0 — beside; a picture id — in its place). The rev is NOT compared:
 * the flatten does not move the layer's rev, and a save of the same drawing since does — a match on
 * it would hide a gesture the server may already have filed. The resend answers either way: the
 * picture, or `layer_rev_mismatch` — which proves it was never filed.
 */
export function findGesture(
  cardId: number,
  at: { layerId: number; doc: string; targets: readonly number[] },
  layers?: readonly number[],
): FlattenGesture | null {
  let found: FlattenGesture | null = null;
  for (const g of readLive(cardId, layers)) {
    if (g.layerId !== at.layerId || g.doc !== at.doc || !at.targets.includes(g.replacePictureId))
      continue;
    if (!found || g.at > found.at) found = g;
  }
  return found;
}

/**
 * THE DOCUMENT'S FINGERPRINT — the length and a 53-bit hash of the layer document (cyrb53). The
 * document itself can be half a megabyte and the ledger holds twenty; the fingerprint only has to
 * tell two drawings of one layer apart.
 */
function docFingerprint(doc: string): string {
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

/**
 * «THE SAME DRAWING» — everything the flatten's raster is made of that a later visit can change:
 * the layer document (strokes and placed pictures), the layer's stored pixel channel (a media id;
 * 0 — never painted) and its vector file (0 — none). The base is the layer's own and cannot change.
 * Two visits that agree on all three rasterise the same picture; a visit that differs in any is
 * another drawing, and an earlier save's raster must not be filed under its name — so the retry
 * door stands only over the drawing it would resend (review r3: the pixels were not in it, and a
 * painting saved since let an old raster pass for the drawing on screen).
 */
export function drawingFingerprint(
  doc: string,
  rasterMediaId: number,
  fileMediaId: number,
): string {
  const id = (n: number) => Math.max(0, Math.trunc(n) || 0).toString(36);
  return `${docFingerprint(doc)}.p${id(rasterMediaId)}.f${id(fileMediaId)}`;
}
