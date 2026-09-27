import { abortableAdminService, adminService } from 'api/api';

import { errorInfoReason } from '../../generation/refusal';
import { operatorKey } from '../../render/run-ledger';
import { maskPng, type MaskStroke } from './geometry';
import { forgetMaskId, keepMaskId, keptMaskId, maskDraftAt, maskKey } from './mask-draft';

export { maskKey };

/**
 * ═══ THE MASK GOES UP ONCE PER PAINT (C-14, the phase-3 mask route) ══════════════════════════════
 *
 * A mask retouch (kind `inpaint`) names two pictures: the source and its painted mask, a PNG of the
 * source's own pixel size, white where the picture changes (`maskPng`). The mask is uploaded
 * VERBATIM (`preserve_original`, the `uploadRaster` precedent): the door reads its PNG header and
 * counts its white pixels, and a re-encoded WebP would be refused as `mask_invalid`.
 *
 * ⚠ ONE UPLOAD PER PAINT, AND THAT IS WHAT KEEPS ONE PAYMENT PER INTENT. The run request carries the
 * mask's media id, and the request is what the scoped ledger fingerprints (`run-ledger.ts`). A
 * second press on the same strokes (after a lost answer, a refusal, new words) must carry the SAME
 * id, or the same intent would travel under a new idempotency key. So the uploader remembers every
 * paint's key → its upload (the promise itself: two quick presses share one upload), and a new key
 * (another stroke, clear, another picture) uploads anew; back to a paint already uploaded (a stroke,
 * then undo) is that paint's upload again. A failed upload is forgotten, so the next press tries
 * again. A mask whose run was then refused stays in the library: accepted residue (a small PNG).
 *
 * ⚠ THE MEMORY OUTLIVES THE EDITOR (G-03 Codex BLOCKER). The editor is unmounted by a close; an
 * uploader that lived in it forgot the mask, and the retry after a reopen uploaded a second one — a
 * new id, a new key, a second paid run. `maskUploaderFor` is one uploader per operator and card for
 * the page's life, and it also reads and writes the mask id kept with the pressed paint
 * (`mask-draft.ts`, `sessionStorage`), so a reload keeps it too.
 *
 * ⚠ A BROWSER THAT CANNOT DRAW THE MASK (G-03 M-1). `maskPng` answers null when the canvas cannot be
 * made or encoded at the picture's size (Safari's area cap, memory): that press starts nothing, and
 * the error is a `MaskNotDrawn`, which the editor reads as «take the rectangle path for this picture».
 *
 * ⚠ AN UPLOAD THAT NEVER ANSWERS IS GIVEN UP (G-03 Codex r2 MAJOR). The editor cannot be closed while
 * its mask goes up, so a proxy that took the request and never answered held the person in a
 * full-screen dialog until a reload. After `MASK_UPLOAD_DEADLINE_MS` (the run door's own 45 s) the
 * press fails with `MaskUploadStalled`: the pending upload is forgotten (the next press uploads
 * again), its request is ABORTED (r3: through `abortableAdminService`, so a hung connection and the
 * mask it carries are released, not left open per retry) and the editor unlocks. An answer that arrives after that is dropped — not remembered, not
 * kept with the paint — so it can never become the mask of a run nobody pressed for.
 *
 * ⚠ A MASK THE DOOR REFUSED IS FORGOTTEN (G-03 Codex r2 MINOR). `mask_invalid`, `mask_size_mismatch`,
 * `mask_empty` or `mask_required` are about that uploaded PNG: kept, it would be sent again on every
 * identical press and refused again. `forget` drops it from the memory and from the kept paint.
 */

/** Draws the mask of `strokes` at `width` × `height` and returns it as a data URL (null = cannot). */
export type MaskPainter = (
  strokes: readonly MaskStroke[],
  width: number,
  height: number,
) => Promise<string | null>;
/** Uploads a data URL and returns the media id; `signal` cancels the upload (the deadline). */
export type MaskUploadFn = (dataUrl: string, signal?: AbortSignal) => Promise<number>;

/** How long a mask may take to draw and go up before the press gives it up (the run door's 45 s). */
export const MASK_UPLOAD_DEADLINE_MS = 45_000;

export type MaskUploader = {
  /** The mask's media id for this paint — uploaded on the first ask, remembered after. */
  maskFor: (
    mediaId: number,
    strokes: readonly MaskStroke[],
    width: number,
    height: number,
  ) => Promise<number>;
  /** The door refused this paint's mask: forget it, here and where it is kept. */
  forget: (mediaId: number, strokes: readonly MaskStroke[], width: number, height: number) => void;
};

/** The painter answered null: this browser cannot draw the mask at the picture's size. */
export class MaskNotDrawn extends Error {
  constructor(width: number, height: number) {
    super(`this browser could not draw the mask at ${width}×${height} px`);
    this.name = 'MaskNotDrawn';
  }
}

/** The mask did not go up within the deadline; the upload is given up and nothing was started. */
export class MaskUploadStalled extends Error {
  constructor(ms: number) {
    super(`the mask upload got no answer in ${Math.round(ms / 1000)} s`);
    this.name = 'MaskUploadStalled';
  }
}

/** The door's refusals that are about the uploaded mask itself (`design_inpaint.go`). */
const MASK_REFUSALS = new Set([
  'mask_invalid',
  'mask_size_mismatch',
  'mask_empty',
  'mask_required',
]);

/** Whether a refused run was refused for its mask — the one refusal a new upload can cure. */
export const maskRefused = (error: unknown): boolean =>
  MASK_REFUSALS.has(errorInfoReason(error) ?? '');

/**
 * ═══ A MASK REFUSAL THAT PROVES THE KEY WAS NEVER BOOKED (G-03 Codex r3 MINOR) ═══════════════════
 *
 * After a silence the ledger keeps a key (`unsure`): the first send may have booked a run, and a
 * refusal of the repeat says nothing about it — a gate may have closed meanwhile. The mask gate is
 * different. The door runs it BEFORE the store looks the key up (`StartDesignRun`: every refusal
 * precedes the booking), on the very same ids, and it decides from facts that do not change after
 * an upload: the PNG's bytes (`mask_invalid` «not a PNG», «not readable», «the picture itself»), its
 * size against the source's (`mask_size_mismatch`), its painted pixels (`mask_empty`), the id being
 * set (`mask_required`). The first send carried the same ids, met the same facts at the same gate,
 * and was refused the same way — so nothing was ever booked under this key, and it may be freed.
 *
 * ONE EXCEPTION: «the mask picture does not exist». A row can be deleted AFTER the first send was
 * booked, so that refusal proves nothing about the first send; its key is kept.
 */
export function maskRefusalProvesUnbooked(error: unknown): boolean {
  if (!maskRefused(error)) return false;
  return errorInfoWhy(error) !== 'the mask picture does not exist';
}

/** `ErrorInfo.metadata.why` of a refusal (the door's words for which mask fact failed). */
function errorInfoWhy(error: unknown): string | undefined {
  const details = (error as { details?: unknown } | null)?.details;
  if (!Array.isArray(details)) return undefined;
  for (const d of details) {
    const why = (d as { metadata?: { why?: unknown } } | null)?.metadata?.why;
    if (typeof why === 'string') return why;
  }
  return undefined;
}

/** Where an uploader may also keep an uploaded id beyond its own memory (`mask-draft.ts`). */
export type MaskIdStore = {
  recall: (mediaId: number, key: string) => number | undefined;
  keep: (mediaId: number, key: string, id: number) => void;
  forget?: (mediaId: number, key: string) => void;
};

export function createMaskUploader(
  paint: MaskPainter,
  upload: MaskUploadFn,
  store?: MaskIdStore,
  deadlineMs = MASK_UPLOAD_DEADLINE_MS,
): MaskUploader {
  const memo = new Map<string, Promise<number>>();
  return {
    maskFor(mediaId, strokes, width, height) {
      const key = maskKey(mediaId, strokes, width, height);
      const held = memo.get(key);
      if (held) return held;
      const kept = store?.recall(mediaId, key);
      let id: Promise<number>;
      if (kept !== undefined && kept > 0) id = Promise.resolve(kept);
      else {
        let abandoned = false;
        const abort = new AbortController();
        const work = (async () => {
          const dataUrl = await paint(strokes, width, height);
          if (!dataUrl) throw new MaskNotDrawn(width, height);
          if (abandoned) throw new MaskUploadStalled(deadlineMs);
          const got = await upload(dataUrl, abort.signal);
          if (!(got > 0)) throw new Error('the mask went up but came back without an id');
          // Given up meanwhile: this id is nobody's mask (see the file head).
          if (!abandoned) store?.keep(mediaId, key, got);
          return got;
        })();
        id = new Promise<number>((resolve, reject) => {
          const timer = setTimeout(() => {
            abandoned = true;
            reject(new MaskUploadStalled(deadlineMs));
            abort.abort();
          }, deadlineMs);
          work.then(
            (got) => {
              clearTimeout(timer);
              resolve(got);
            },
            (error: unknown) => {
              clearTimeout(timer);
              reject(error);
            },
          );
        });
      }
      memo.set(key, id);
      id.catch(() => {
        if (memo.get(key) === id) memo.delete(key);
      });
      return id;
    },
    forget(mediaId, strokes, width, height) {
      const key = maskKey(mediaId, strokes, width, height);
      memo.delete(key);
      store?.forget?.(mediaId, key);
    },
  };
}

const uploaders = new Map<string, MaskUploader>();

/**
 * THE uploader of this operator's retouches on this card, for the page's life (see the file head):
 * a closed and reopened editor asks the same one.
 */
export function maskUploaderFor(techCardId: number): MaskUploader {
  const operator = operatorKey();
  const at = `${operator}|${techCardId}`;
  let up = uploaders.get(at);
  if (!up) {
    // The operator is this uploader's, taken once: an answer read after a sign-in writes nowhere else.
    const draft = (mediaId: number) => maskDraftAt(techCardId, mediaId, operator);
    up = createMaskUploader(maskDataUrl, uploadMask, {
      recall: (mediaId, key) => keptMaskId(draft(mediaId), key),
      keep: (mediaId, key, id) => void keepMaskId(draft(mediaId), key, id),
      forget: (mediaId, key) => forgetMaskId(draft(mediaId), key),
    });
    uploaders.set(at, up);
  }
  return up;
}

/** `maskPng` as a data URL — the shape `UploadContentImage.raw_b64_image` takes. */
export const maskDataUrl: MaskPainter = async (strokes, width, height) => {
  const blob = await maskPng(strokes, width, height);
  if (!blob) return null;
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : null);
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(blob);
  });
};

/** The verbatim upload (`preserve_original`: the PNG the door reads is the PNG painted here). */
export const uploadMask: MaskUploadFn = async (dataUrl, signal) => {
  const response = await (signal ? abortableAdminService(signal) : adminService).UploadContentImage(
    {
      rawB64Image: dataUrl,
      preserveOriginal: true,
    },
  );
  return response.media?.id ?? 0;
};
