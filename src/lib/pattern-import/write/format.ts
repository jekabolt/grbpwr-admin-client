// Tag-level DXF emission, CLO conventions (10-CLO-DXF-FORMAT.md §1.2): CRLF, group codes
// right-aligned to width 3, floats `toFixed(6)` with −0 normalised, handles upper-case hex,
// ASCII-only bytes (non-ASCII → AutoCAD `\U+XXXX`).

export type Tag = [code: number, value: string];

export function num(v: number): string {
  if (!Number.isFinite(v)) throw new Error(`non-finite coordinate ${v}`);
  const s = v.toFixed(6);
  return s === '-0.000000' ? '0.000000' : s;
}

export const hex = (n: number) => n.toString(16).toUpperCase();

/** ASCII-only text value: control chars → space, non-ASCII → `\U+XXXX` (astral → two escapes). */
export function txt(s: string): string {
  return s.replace(/[\r\n\t]/g, ' ').replace(/[^\x20-\x7e]/g, (c) => {
    const cp = c.codePointAt(0) ?? 0x3f;
    if (cp <= 0xffff) return `\\U+${cp.toString(16).toUpperCase().padStart(4, '0')}`;
    // Surrogate pair already split by the regex (no `u` flag): each half escapes on its own.
    return `\\U+${cp.toString(16).toUpperCase()}`;
  });
}

export function serialize(tags: readonly Tag[]): string {
  let out = '';
  for (const [c, v] of tags) out += `${String(c).padStart(3)}\r\n${v}\r\n`;
  return out;
}

/** True when every char is printable ASCII or CR/LF. */
export function isAsciiDxf(text: string): boolean {
  // eslint-disable-next-line no-control-regex
  return /^[\x20-\x7e\r\n]*$/.test(text);
}
