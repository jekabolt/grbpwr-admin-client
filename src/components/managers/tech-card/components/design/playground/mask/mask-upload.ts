import { adminService } from 'api/api';

import { maskPng, type MaskStroke } from './geometry';

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
 * id, or the same intent would travel under a new idempotency key. So the uploader remembers the
 * last paint's key → its upload (the promise itself: two quick presses share one upload), and a new
 * key (another stroke, undo, clear, another picture) uploads anew. A failed upload is forgotten, so
 * the next press tries again. A mask whose run was then refused stays in the library: accepted
 * residue (a small PNG).
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

export function createMaskUploader(paint: MaskPainter, upload: MaskUploadFn): MaskUploader {
  let last: { key: string; id: Promise<number> } | null = null;
  return {
    maskFor(mediaId, strokes, width, height) {
      const key = maskKey(mediaId, strokes, width, height);
      if (last && last.key === key) return last.id;
      const id = (async () => {
        const dataUrl = await paint(strokes, width, height);
        if (!dataUrl) throw new Error(`the mask could not be drawn at ${width}×${height} px`);
        const got = await upload(dataUrl);
        if (!(got > 0)) throw new Error('the mask went up but came back without an id');
        return got;
      })();
      const entry = { key, id };
      last = entry;
      id.catch(() => {
        if (last === entry) last = null;
      });
      return id;
    },
  };
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
