import type { DesignBenchSlotRef } from 'api/proto-http/admin';

import { BENCH_KINDS } from '../bench-kinds';

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
 * or any refusal. What stays is exactly the flattens whose outcome is unknown. The next save of the
 * same layer finds them, whichever editor makes it: the editor's question offers «retry the earlier
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
 * (`drawingFingerprint`); it carries the key and the media the flatten echoed — and, made in an
 * editor opened from a slot, the slot the filed picture goes into (`placement`, D-72″).
 *
 * ⚠ AN UNANSWERED ENTRY LEAVES BY ITS OWN ANSWER, OR WITH ITS LAYER (review r3, r4). Two ways only:
 *   · a definite answer to its own key (`forgetGesture`) — the flatten's own, or a resend's;
 *   · its layer provably no longer exists on the card (`live`) — it can never be matched again.
 * Not to make room: at `GESTURES_PER_CARD` a card takes no new gesture — `rememberGesture` answers
 * false and the editor asks for one to be settled first. And not for a fresh save of the same layer
 * and answer, as round 3 had it: «the same drawing» is a fingerprint, and a media id alone moves it
 * (the same pixels stored again under a new raster), so that rule dropped a key whose picture may
 * already be filed — before the fresh save was even sent. A fresh save leaves every entry in place,
 * and the editor asks over the layer for as long as one stands (`layerGesture`).
 */

/**
 * ═══ WHERE THE PICTURE GOES ONCE IT IS FILED — PART OF THE GESTURE (28.09, O-63 r4, D-72″) ═══════
 *
 * An editor opened from a slot (the flat slots' cell, the SIDES cell) puts the picture it files
 * beside its base INTO THAT SLOT — a second write after the flatten's answer, with the slot's CAS
 * token as read when the gesture was made. Until round 4 that write read the slot of whichever
 * editor RESENT the gesture: a save as new lost from slot A and retried from slot B (one media, two
 * plates, one layer) landed in B, and retried from an editor without a slot landed nowhere — the
 * resend was not the gesture (REVIEW-T64-codex-3, Moderate; D-72′: a resend never reinterprets a
 * gesture through the current editor). So the slot is written down WITH the gesture: its address
 * (`ref` — a view of a bench, or a minted slot id, with the bench's kind and colourway), the
 * revision the editor held, and the label it was called by. A resend replays exactly this and never
 * the resending editor's slot; an entry without one — made before this field, or by an editor
 * without a slot — is resent as a filing only. A revision that has moved since is the server's
 * refusal (`slot_rev_mismatch`), told as «the picture is saved, but the slot was not changed».
 */
export type GesturePlacement = {
  /** The slot the picture goes into — the bench's kind and colourway, the view or the slot id. */
  ref: DesignBenchSlotRef;
  /** The slot's revision as the editor read it — echoed as `expected_slot_rev`. */
  slotRev: number;
  /** What the editor called the slot — for the words after the answer. */
  label: string;
};

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
  /**
   * The slot the filed picture goes into (D-72″) — only for a gesture made in an editor opened from
   * a slot. Absent: the filing is the whole gesture. Optional in the stored shape too: an entry
   * written before this field parses as before, and a fresh entry without a slot stores no field.
   */
  placement?: GesturePlacement;
};

/** One key per card; `v1` is the shape of an entry (its optional `placement` came in O-63 r4). */
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
  const placement = parsePlacement(r.placement);
  return {
    key,
    layerId,
    rev,
    replacePictureId,
    mediaId,
    doc: r.doc,
    at,
    ...(placement ? { placement } : {}),
  };
}

/** The benches a slot of the ledger may name — the client's own list, never a guess from a word. */
const KNOWN_KINDS: ReadonlySet<string> = new Set(BENCH_KINDS);

/** A whole number of at least `min`, or null — the shape of every id and revision here. */
const wholeAtLeast = (v: unknown, min: number): number | null =>
  typeof v === 'number' && Number.isInteger(v) && v >= min ? v : null;

/**
 * The slot an entry names, taken only if it is EXACTLY one — a bench's view or a minted slot id
 * (one address member, as the wire's oneof: both or neither is no address), the bench's kind by
 * this client's own list, a colourway that is a whole number when it is said at all (−1 is a
 * value, the bench without a colourway axis; an absent one stays absent), a whole revision, and a
 * label (the view's key stands in for a missing one). A present field of the wrong shape drops
 * THE SLOT — never read as flat, never as colourway 0, never the view over the id (O-63 r5, Codex
 * r4): a slot read otherwise than it was written is a resend into another place. And it drops the
 * slot, not the entry: the filing still has everything it needs, and a picture filed beside its
 * base can be put into a side by hand, while a gesture dropped whole would be saved again as a new
 * one — a second picture.
 */
function parsePlacement(raw: unknown): GesturePlacement | null {
  if (!raw || typeof raw !== 'object') return null;
  const p = raw as Record<string, unknown>;
  const ref = p.ref && typeof p.ref === 'object' ? (p.ref as Record<string, unknown>) : null;
  if (!ref) return null;
  const hasView = ref.viewKey !== undefined;
  const hasSlot = ref.slotId !== undefined;
  if (hasView === hasSlot) return null;
  /* A view key is taken as written or not at all: a padded or blank one is dropped, never
     trimmed into a valid key — a normalised address is an address the gesture did not name
     (O-63 r6, Codex r5). */
  const viewKey =
    typeof ref.viewKey === 'string' && ref.viewKey.length > 0 && ref.viewKey === ref.viewKey.trim()
      ? ref.viewKey
      : '';
  if (hasView && !viewKey) return null;
  const slotId = wholeAtLeast(ref.slotId, 1);
  if (hasSlot && slotId === null) return null;
  const kind = typeof ref.kind === 'string' && KNOWN_KINDS.has(ref.kind) ? ref.kind : null;
  if (kind === null) return null;
  const hasColourway = ref.colorwayId !== undefined;
  const colorwayId = Number.isInteger(ref.colorwayId) ? (ref.colorwayId as number) : null;
  if (hasColourway && colorwayId === null) return null;
  const slotRev = wholeAtLeast(p.slotRev, 0);
  if (slotRev === null) return null;
  if (p.label !== undefined && typeof p.label !== 'string') return null;
  const label =
    typeof p.label === 'string' && p.label.trim() ? p.label : viewKey || `slot ${slotId}`;
  return {
    /* `colorwayId` is a required key of the ref's type; `undefined` keeps an absent one absent —
       the stored JSON and the wire both leave it out — and never writes a 0 that was not said. */
    ref: {
      ...(hasView ? { viewKey } : { slotId: slotId ?? 0 }),
      kind,
      colorwayId: hasColourway ? (colorwayId as number) : undefined,
    },
    slotRev,
    label,
  };
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
 * gesture is not written and must not be sent. A gesture already on the list — a retry — is always
 * taken. Nothing on the list leaves for a new one (review r4): not to make room, not as «older».
 */
export function rememberGesture(
  cardId: number,
  gesture: FlattenGesture,
  layers?: readonly number[],
): boolean {
  const list = readLive(cardId, layers);
  if (list.some((g) => g.key === gesture.key)) return true;
  if (list.length >= GESTURES_PER_CARD) return false;
  writeCard(
    cardId,
    [...list, gesture].sort((a, b) => a.at - b.at),
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

/**
 * The card's oldest unanswered save — the one «settle one» resends first. `among` narrows it to the
 * entries the asking editor may resend (D-72′: beside, or in the place of its own picture — a resend
 * never reinterprets a gesture through another picture's editor); absent, any entry of the card.
 */
export function oldestGesture(
  cardId: number,
  layers?: readonly number[],
  among: (gesture: FlattenGesture) => boolean = () => true,
): FlattenGesture | null {
  let found: FlattenGesture | null = null;
  for (const g of readLive(cardId, layers)) if (among(g) && (!found || g.at < found.at)) found = g;
  return found;
}

/** The earlier save a question puts first — and whether it is of the drawing on screen. */
export type LayerGesture = { gesture: FlattenGesture; same: boolean };

/**
 * THE EARLIER SAVE OF THIS LAYER WHOSE ANSWER NEVER CAME — any answer, any drawing (review r4) — or
 * null. `same`: made of the drawing on screen (`doc`, its `drawingFingerprint`; null — the screen
 * holds what no save stored) with an answer this editor gives (`targets`: 0 — beside, a picture id —
 * in its place). The newest such one comes first: its resend files what is on the screen. Without
 * one, the newest of the layer: its resend files THAT drawing, and a fresh save leaves it in place.
 * The rev is NOT compared: the flatten does not move the layer's rev, and a save of the same drawing
 * since does — a match on it would hide a gesture the server may already have filed. The resend
 * answers either way: the picture, or `layer_rev_mismatch` — which proves it was never filed.
 *
 * AMONG THE OTHER DRAWINGS, ONE THIS EDITOR MAY RESEND COMES FIRST (D-72′): `targets` are also the
 * answers this editor is entitled to resend, and a save aimed at another picture of the layer (an
 * overwrite lost in that picture's editor — the layer is the media's, and one media may stand as
 * two pictures) is only NAMED here, with no door. Named ahead of a resendable one it would stand in
 * the way of this editor's own lost save until settled elsewhere; so it is named last, when nothing
 * of the layer can be resent from here. A layer whose every entry is resendable here reads as before.
 */
export function layerGesture(
  cardId: number,
  at: { layerId: number; doc: string | null; targets: readonly number[] },
  layers?: readonly number[],
): LayerGesture | null {
  let same: FlattenGesture | null = null;
  let other: FlattenGesture | null = null;
  let foreign: FlattenGesture | null = null;
  for (const g of readLive(cardId, layers)) {
    if (g.layerId !== at.layerId) continue;
    const here = at.targets.includes(g.replacePictureId);
    if (g.doc === at.doc && here) {
      if (!same || g.at > same.at) same = g;
    } else if (here) {
      if (!other || g.at > other.at) other = g;
    } else if (!foreign || g.at > foreign.at) foreign = g;
  }
  if (same) return { gesture: same, same: true };
  const named = other ?? foreign;
  return named ? { gesture: named, same: false } : null;
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
 * another drawing, and an earlier save's raster must not be filed under its name — so an earlier
 * save counts as the drawing on screen only when it would resend exactly it (review r3: the pixels
 * were not in it, and a painting saved since let an old raster pass for the drawing on screen).
 * Unequal is not proof of another picture, though: a media id alone moves it — the same pixels
 * stored again — which is why nothing is ever dropped for being unequal (review r4, `layerGesture`).
 */
export function drawingFingerprint(
  doc: string,
  rasterMediaId: number,
  fileMediaId: number,
): string {
  const id = (n: number) => Math.max(0, Math.trunc(n) || 0).toString(36);
  return `${docFingerprint(doc)}.p${id(rasterMediaId)}.f${id(fileMediaId)}`;
}
