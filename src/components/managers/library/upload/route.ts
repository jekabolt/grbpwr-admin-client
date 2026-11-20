import { isMediaFile, isSvgFile } from 'components/managers/media/utils/usePasteFiles';

/**
 * Which engine takes a file.
 * - `media`: pictures and video go through the media doors (three sizes; svg → the vector door).
 * - `file`: everything else goes to the files queue as a document.
 *
 * `as: 'document'` sends a picture to the files queue too (a private photo kept as a document).
 * It exists in code only; no control sets it yet (Q1 pending).
 */
export type UploadAs = 'auto' | 'document';
export type UploadEngine = 'media' | 'file';

export function engineOf(file: File, as: UploadAs = 'auto'): UploadEngine {
  if (as === 'document') return 'file';
  return isMediaFile(file) || isSvgFile(file) ? 'media' : 'file';
}

/** A visual-only host (a picture slot) takes only what the media doors take. */
export function acceptsFile(file: File, accept: 'visual' | 'any'): boolean {
  return accept === 'any' || engineOf(file) === 'media';
}
