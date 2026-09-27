import { operatorKey } from '../../render/run-ledger';

import type { MaskStroke } from './geometry';

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
 */

export type MaskDraft = {
  strokes: MaskStroke[];
  words: string;
  /** The mask uploaded for `key` (`maskKey` of these strokes at the picture's size), if any. */
  mask?: { key: string; id: number };
};

export const MASK_DRAFT_STORAGE_KEY = 'plm.design.mask-drafts.v1';

type Book = Record<string, MaskDraft>;
let memory: Book | null = null;

function isStroke(v: unknown): v is MaskStroke {
  const s = v as MaskStroke | null;
  return (
    !!s &&
    typeof s.size === 'number' &&
    Array.isArray(s.points) &&
    s.points.every((p) => !!p && typeof p.x === 'number' && typeof p.y === 'number')
  );
}

function book(): Book {
  if (memory) return memory;
  const read: Book = {};
  try {
    const raw = window.sessionStorage.getItem(MASK_DRAFT_STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    if (parsed && typeof parsed === 'object') {
      for (const [at, v] of Object.entries(parsed as Record<string, unknown>)) {
        const d = v as Partial<MaskDraft> | null;
        if (!d || !Array.isArray(d.strokes) || !d.strokes.every(isStroke)) continue;
        const mask =
          d.mask && typeof d.mask.key === 'string' && typeof d.mask.id === 'number' && d.mask.id > 0
            ? { key: d.mask.key, id: d.mask.id }
            : undefined;
        read[at] = { strokes: d.strokes, words: typeof d.words === 'string' ? d.words : '', mask };
      }
    }
  } catch {
    /* no storage, or a value someone else wrote: start empty */
  }
  memory = read;
  return memory;
}

function save(): void {
  try {
    window.sessionStorage.setItem(MASK_DRAFT_STORAGE_KEY, JSON.stringify(book()));
  } catch {
    /* the in-memory copy still covers every close inside the tab */
  }
}

const at = (techCardId: number, mediaId: number) => `${operatorKey()}|${techCardId}|${mediaId}`;

/** The kept paint of this picture, or null when none was pressed (or it was accepted since). */
export function readMaskDraft(techCardId: number, mediaId: number): MaskDraft | null {
  return book()[at(techCardId, mediaId)] ?? null;
}

/** Keep (or update) the paint of this picture; the mask record stays with it. */
export function writeMaskDraft(
  techCardId: number,
  mediaId: number,
  paint: { strokes: readonly MaskStroke[]; words: string },
): void {
  const all = book();
  const k = at(techCardId, mediaId);
  all[k] = { ...all[k], strokes: [...paint.strokes], words: paint.words };
  save();
}

/** The mask uploaded for `key` on this picture — remembered with the paint, if the paint is kept. */
export function keptMaskId(techCardId: number, mediaId: number, key: string): number | undefined {
  const mask = readMaskDraft(techCardId, mediaId)?.mask;
  return mask && mask.key === key ? mask.id : undefined;
}

export function keepMaskId(techCardId: number, mediaId: number, key: string, id: number): void {
  const all = book();
  const k = at(techCardId, mediaId);
  const was = all[k];
  all[k] = { strokes: was?.strokes ?? [], words: was?.words ?? '', mask: { key, id } };
  save();
}

/** The door accepted a run from this paint: the next press is a new run. */
export function forgetMaskDraft(techCardId: number, mediaId: number): void {
  const all = book();
  const k = at(techCardId, mediaId);
  if (!(k in all)) return;
  delete all[k];
  save();
}
