// The optional team logo picked on step two of sign up / new team (spec O §11, §13).
// Checked here before the request leaves; the server checks again and answers `bad_logo`.

export const LOGO_MAX_BYTES = 1024 * 1024;

const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const JPEG = [0xff, 0xd8, 0xff];

const startsWith = (bytes: Uint8Array, sig: number[]) =>
  bytes.length >= sig.length && sig.every((b, i) => bytes[i] === b);

/** PNG or JPEG by the first bytes (never by the name or the browser's type), at most 1 MB. */
export function isGoodLogo(bytes: Uint8Array): boolean {
  if (bytes.length === 0 || bytes.length > LOGO_MAX_BYTES) return false;
  return startsWith(bytes, PNG) || startsWith(bytes, JPEG);
}

export function toBase64(bytes: Uint8Array): string {
  let s = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    s += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(s);
}

/** A picked logo: base64 for the request, an object URL for the preview. */
export interface PickedLogo {
  base64: string;
  preview: string;
}

/** Read a picked file; null when it is not a PNG / JPEG of at most 1 MB. */
export async function readLogo(file: File): Promise<PickedLogo | null> {
  if (file.size > LOGO_MAX_BYTES) return null;
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!isGoodLogo(bytes)) return null;
  return { base64: toBase64(bytes), preview: URL.createObjectURL(file) };
}

/** The server refused the picture. */
export function isBadLogo(message: string): boolean {
  return message.includes('bad_logo');
}
