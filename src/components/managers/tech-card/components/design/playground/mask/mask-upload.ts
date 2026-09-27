import { adminService } from 'api/api';

import { operatorKey } from '../../render/run-ledger';
import { maskPng, type MaskStroke } from './geometry';
import { keepMaskId, keptMaskId } from './mask-draft';

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
 */

/** Draws the mask of `strokes` at `width` × `height` and returns it as a data URL (null = cannot). */
export type MaskPainter = (
  strokes: readonly MaskStroke[],
  width: number,
  height: number,
) => Promise<string | null>;
/** Uploads a data URL and returns the media id. */
export type MaskUploadFn = (dataUrl: string) => Promise<number>;

/** The identity of one paint: the picture, its pixel size and every stroke, exactly. */
export function maskKey(
  mediaId: number,
  strokes: readonly MaskStroke[],
  width: number,
  height: number,
): string {
  return JSON.stringify([mediaId, width, height, strokes]);
}

export type MaskUploader = {
  /** The mask's media id for this paint — uploaded on the first ask, remembered after. */
  maskFor: (
    mediaId: number,
    strokes: readonly MaskStroke[],
    width: number,
    height: number,
  ) => Promise<number>;
};

/** The painter answered null: this browser cannot draw the mask at the picture's size. */
export class MaskNotDrawn extends Error {
  constructor(width: number, height: number) {
    super(`this browser could not draw the mask at ${width}×${height} px`);
    this.name = 'MaskNotDrawn';
  }
}

/** Where an uploader may also keep an uploaded id beyond its own memory (`mask-draft.ts`). */
export type MaskIdStore = {
  recall: (mediaId: number, key: string) => number | undefined;
  keep: (mediaId: number, key: string, id: number) => void;
};

export function createMaskUploader(
  paint: MaskPainter,
  upload: MaskUploadFn,
  store?: MaskIdStore,
): MaskUploader {
  const memo = new Map<string, Promise<number>>();
  return {
    maskFor(mediaId, strokes, width, height) {
      const key = maskKey(mediaId, strokes, width, height);
      const held = memo.get(key);
      if (held) return held;
      const kept = store?.recall(mediaId, key);
      const id =
        kept !== undefined && kept > 0
          ? Promise.resolve(kept)
          : (async () => {
              const dataUrl = await paint(strokes, width, height);
              if (!dataUrl) throw new MaskNotDrawn(width, height);
              const got = await upload(dataUrl);
              if (!(got > 0)) throw new Error('the mask went up but came back without an id');
              store?.keep(mediaId, key, got);
              return got;
            })();
      memo.set(key, id);
      id.catch(() => {
        if (memo.get(key) === id) memo.delete(key);
      });
      return id;
    },
  };
}

const uploaders = new Map<string, MaskUploader>();

/**
 * THE uploader of this operator's retouches on this card, for the page's life (see the file head):
 * a closed and reopened editor asks the same one.
 */
export function maskUploaderFor(techCardId: number): MaskUploader {
  const at = `${operatorKey()}|${techCardId}`;
  let up = uploaders.get(at);
  if (!up) {
    up = createMaskUploader(maskDataUrl, uploadMask, {
      recall: (mediaId, key) => keptMaskId(techCardId, mediaId, key),
      keep: (mediaId, key, id) => keepMaskId(techCardId, mediaId, key, id),
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
export const uploadMask: MaskUploadFn = async (dataUrl) => {
  const response = await adminService.UploadContentImage({
    rawB64Image: dataUrl,
    preserveOriginal: true,
  });
  return response.media?.id ?? 0;
};
