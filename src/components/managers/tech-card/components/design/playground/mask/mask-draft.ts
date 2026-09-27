import { operatorKey } from '../../render/run-ledger';

import type { MaskPoint, MaskStroke } from './geometry';

/**
 * ═══ A PRESSED PAINT OUTLIVES ITS EDITOR (G-03 Codex BLOCKER) ═══════════════════════════════════
 *
 * The run request of a retouch is made of the paint: on the mask route it names the uploaded mask's
 * media id, on the window route it carries the hull of the strokes — and the scoped ledger
 * (`render/run-ledger.ts`) keys the idempotency id by that request. The strokes and the words used to
 * live in the editor's state only, so a press whose answer was lost, then a close, then a reopen and
 * a repaint made a NEW request (a new mask id, or another hull) → a new `client_request_id` → a
 * second paid run for what the person sees as one retry.
 *
 * So from the first GENERATE on, the paint of that picture — strokes, words and the mask uploaded for
 * those strokes — is kept here, per operator, card and picture: in module memory and in
 * `sessionStorage` (it dies with the tab, as the ledger does). Reopening the editor on that picture
 * lays the same paint back, and a press sends the same mask id and so the same key. It goes when the
 * door ACCEPTS a run from it (the next press is a new run, as everywhere). Clearing the paint keeps
 * an empty one — its next strokes are a new intent. A paint that was never pressed is not kept:
 * closing forgets it, as before.
 *
 * ⚠ ACCEPTANCE FORGETS ONLY THE PAINT IT WAS PRESSED FROM (G-03 Codex r2 BLOCKER). An answer can come
 * after its deadline — after the person repainted and pressed again. A late «accepted» for press A
 * used to delete whatever this picture held, i.e. B's paint and B's mask id: B's answer lost too, a
 * reopen showed nothing, the repaint uploaded a new mask → a new key → a second paid run. So a press
 * records WHICH request it sent (`sent`, the canonical wire request) and its paint
 * (`paintSignature`), and `forgetMaskDraft` is a compare-and-delete: the draft goes only while it is
 * still exactly that paint and that request. The address — operator, card, picture — is taken ONCE,
 * at the press (`maskDraftAt`), never when the answer comes: A's late answer after a sign-out and a
 * sign-in cannot reach the next operator's draft.
 *
 * ⚠ A PAINT THAT CANNOT BE KEPT IS NOT PRESSED (G-03 Codex r2 MAJOR). Every write answers whether it
 * reached `sessionStorage`; the editor sends no paid request unless the paint and its mask id did —
 * a reload after a lost answer must find them, or the retry is a new key. To keep a heavy paint under
 * the quota, a stroke is stored as one flat list of numbers and a mask record by its size alone when
 * its strokes are the draft's (`encode`), not as the key string that repeats every stroke.
 */

export type MaskDraft = {
  strokes: MaskStroke[];
  words: string;
  /** The mask uploaded for `key` (`maskKey` of these strokes at the picture's size), if any. */
  mask?: { key: string; id: number };
  /** The request last pressed from this draft (`requestFingerprint` of its wire), if any. */
  sent?: string;
};

/** What one accepted press may forget: the paint it was pressed from and the request it sent. */
export type PressedPaint = { paint: string; sent: string };

export const MASK_DRAFT_STORAGE_KEY = 'plm.design.mask-drafts.v1';

type Book = Record<string, MaskDraft>;
let memory: Book | null = null;

/* ─── the stored shape: a stroke is [size, x1, y1, x2, y2, …] ─── */

type Flat = number[];
type StoredDraft = {
  s: Flat[];
  w: string;
  m?: { i: number; w: number; h: number; s?: Flat[] };
  t?: string;
};

const flat = (strokes: readonly MaskStroke[]): Flat[] =>
  strokes.map((st) => [st.size, ...st.points.flatMap((p) => [p.x, p.y])]);

function unflat(v: unknown): MaskStroke[] | null {
  if (!Array.isArray(v)) return null;
  const out: MaskStroke[] = [];
  for (const row of v) {
    if (!Array.isArray(row) || row.length < 3 || row.length % 2 === 0) return null;
    if (!row.every((n) => typeof n === 'number' && Number.isFinite(n))) return null;
    const points: MaskPoint[] = [];
    for (let i = 1; i < row.length; i += 2)
      points.push({ x: row[i] as number, y: row[i + 1] as number });
    out.push({ size: row[0] as number, points });
  }
  return out;
}

/**
 * THE IDENTITY OF A PAINT'S MASK — the picture, its pixel size and every stroke, exactly, in the flat
 * form above (so a stored record rebuilds the very same string). `mask-upload.ts` keys its uploads by
 * it; it lives here because the stored record is decoded back into it.
 */
export function maskKey(
  mediaId: number,
  strokes: readonly MaskStroke[],
  width: number,
  height: number,
): string {
  return JSON.stringify([mediaId, width, height, flat(strokes)]);
}

/** The paint as one string: what a press is compared by when its answer comes. */
export const paintSignature = (strokes: readonly MaskStroke[], words: string): string =>
  JSON.stringify([flat(strokes), words]);

function isStroke(v: unknown): v is MaskStroke {
  const s = v as MaskStroke | null;
  return (
    !!s &&
    typeof s.size === 'number' &&
    Array.isArray(s.points) &&
    s.points.every((p) => !!p && typeof p.x === 'number' && typeof p.y === 'number')
  );
}

const mediaOf = (at: string): number => Number(at.slice(at.lastIndexOf('|') + 1)) || 0;

/** One stored entry, in either shape: the flat one, or the object one written before r2. */
function decode(at: string, v: unknown): MaskDraft | null {
  const d = v as
    | (Partial<StoredDraft> & { strokes?: unknown; words?: unknown; mask?: unknown })
    | null;
  if (!d || typeof d !== 'object') return null;
  if (Array.isArray(d.strokes)) {
    if (!d.strokes.every(isStroke)) return null;
    const m = d.mask as { key?: unknown; id?: unknown } | undefined;
    let mask: MaskDraft['mask'];
    if (m && typeof m.key === 'string' && typeof m.id === 'number' && m.id > 0) {
      try {
        const [media, w, h, strokes] = JSON.parse(m.key) as [number, number, number, unknown];
        if (Array.isArray(strokes) && strokes.every(isStroke))
          mask = { key: maskKey(media, strokes, w, h), id: m.id };
      } catch {
        /* a key nobody can read: the mask is uploaded again */
      }
    }
    return { strokes: d.strokes, words: typeof d.words === 'string' ? d.words : '', mask };
  }
  const strokes = unflat(d.s);
  if (!strokes) return null;
  let mask: MaskDraft['mask'];
  const m = d.m;
  if (
    m &&
    typeof m.i === 'number' &&
    m.i > 0 &&
    typeof m.w === 'number' &&
    typeof m.h === 'number'
  ) {
    const own = m.s === undefined ? strokes : unflat(m.s);
    if (own) mask = { key: maskKey(mediaOf(at), own, m.w, m.h), id: m.i };
  }
  return {
    strokes,
    words: typeof d.w === 'string' ? d.w : '',
    mask,
    sent: typeof d.t === 'string' ? d.t : undefined,
  };
}

function encode(d: MaskDraft): StoredDraft {
  const s = flat(d.strokes);
  const out: StoredDraft = { s, w: d.words };
  if (d.mask) {
    const [, w, h, own] = JSON.parse(d.mask.key) as [number, number, number, Flat[]];
    out.m =
      JSON.stringify(own) === JSON.stringify(s)
        ? { i: d.mask.id, w, h }
        : { i: d.mask.id, w, h, s: own };
  }
  if (d.sent) out.t = d.sent;
  return out;
}

function book(): Book {
  if (memory) return memory;
  const read: Book = {};
  try {
    const raw = window.sessionStorage.getItem(MASK_DRAFT_STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    if (parsed && typeof parsed === 'object') {
      for (const [at, v] of Object.entries(parsed as Record<string, unknown>)) {
        const d = decode(at, v);
        if (d) read[at] = d;
      }
    }
  } catch {
    /* no storage, or a value someone else wrote: start empty */
  }
  memory = read;
  return memory;
}

/** Whether the book reached `sessionStorage`. The memory copy is written either way. */
function save(): boolean {
  try {
    const out: Record<string, StoredDraft> = {};
    for (const [at, d] of Object.entries(book())) out[at] = encode(d);
    window.sessionStorage.setItem(MASK_DRAFT_STORAGE_KEY, JSON.stringify(out));
    return true;
  } catch {
    return false;
  }
}

/** Where one picture's paint is kept: the operator (signed in NOW, unless given), card, picture. */
export const maskDraftAt = (
  techCardId: number,
  mediaId: number,
  operator = operatorKey(),
): string => `${operator}|${techCardId}|${mediaId}`;

/** The kept paint at this address, or null when none was pressed (or it was accepted since). */
export function readMaskDraft(at: string): MaskDraft | null {
  return book()[at] ?? null;
}

/** Keep (or update) the paint at this address; the mask record stays with it. True = stored. */
export function writeMaskDraft(
  at: string,
  paint: { strokes: readonly MaskStroke[]; words: string },
): boolean {
  const all = book();
  all[at] = { ...all[at], strokes: [...paint.strokes], words: paint.words };
  return save();
}

/**
 * THE PRESS, RECORDED BEFORE IT IS SENT: the paint, the mask this request names (if any) and the
 * request itself. True = it is in `sessionStorage`; false = do not send.
 */
export function recordPress(
  at: string,
  press: {
    strokes: readonly MaskStroke[];
    words: string;
    mask?: { key: string; id: number };
    sent: string;
  },
): boolean {
  const all = book();
  const was = all[at];
  all[at] = {
    strokes: [...press.strokes],
    words: press.words,
    mask: press.mask ?? was?.mask,
    sent: press.sent,
  };
  return save();
}

/** The mask uploaded for `key` at this address — remembered with the paint, if the paint is kept. */
export function keptMaskId(at: string, key: string): number | undefined {
  const mask = readMaskDraft(at)?.mask;
  return mask && mask.key === key ? mask.id : undefined;
}

export function keepMaskId(at: string, key: string, id: number): boolean {
  const all = book();
  const was = all[at];
  all[at] = { ...was, strokes: was?.strokes ?? [], words: was?.words ?? '', mask: { key, id } };
  return save();
}

/** The door refused the mask of `key` itself (G-03 Codex r2 MINOR): the next press uploads anew. */
export function forgetMaskId(at: string, key: string): void {
  const all = book();
  const was = all[at];
  if (!was?.mask || was.mask.key !== key) return;
  all[at] = { ...was, mask: undefined };
  save();
}

/**
 * The door accepted a run from THIS press: its paint is spent — but only if the draft is still the
 * paint and the request that press sent (see the file head). True = forgotten.
 */
export function forgetMaskDraft(at: string, pressed: PressedPaint): boolean {
  const all = book();
  const was = all[at];
  if (!was) return false;
  if (paintSignature(was.strokes, was.words) !== pressed.paint || was.sent !== pressed.sent)
    return false;
  delete all[at];
  save();
  return true;
}

/** For the probe only: forget the module memory, so the next read comes from `sessionStorage`. */
export function resetMaskDraftsForProbe(): void {
  memory = null;
}
