import type { ManifestAuthoredTextMark } from '../types';

export const AUTHORED_TEXT_LAYER = 'GRBPWR_CAD_TEXT';
export const AUTHORED_TEXT_HEIGHT_MM = 4;

export function normalizeAuthoredText(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  if (!text || new TextEncoder().encode(text).length > 255) return null;
  if (
    [...text].some((char) => {
      const code = char.codePointAt(0)!;
      return code < 32 || (code >= 127 && code <= 159) || code === 0x2028 || code === 0x2029;
    })
  )
    return null;
  return text;
}

export function parseManifestAuthoredText(value: unknown): ManifestAuthoredTextMark[] | null {
  if (!Array.isArray(value) || value.length === 0) return null;
  const marks: ManifestAuthoredTextMark[] = [];
  for (const candidate of value) {
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) return null;
    const { anchor, text } = candidate as Partial<ManifestAuthoredTextMark>;
    if (
      !Array.isArray(anchor) ||
      anchor.length !== 2 ||
      !anchor.every(Number.isSafeInteger) ||
      typeof text !== 'string' ||
      normalizeAuthoredText(text) !== text
    )
      return null;
    marks.push({ anchor: [anchor[0], anchor[1]], text });
  }
  return marks;
}
