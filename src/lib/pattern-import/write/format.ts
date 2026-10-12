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

// ── R12 text: ASCII by transliteration (W3) ──────────────────────────────────────────────────
//
// R12 (AC1009) has no Unicode escape: AutoCAD's `\U+XXXX` arrived with R13/R2000, and every AAMA
// reader of an R12 file shows it literally ("main fabric \U+00B7 \U+041B…"). So R12 text is made
// ASCII by READING it: Cyrillic transliterated (a plain passport-style spelling: ж zh, х kh, щ shch),
// Latin diacritics stripped (NFKD), the typographic marks we write ourselves mapped, anything
// else '?'. Block names and layer names are already ASCII (identity grammar).

const CYR: Record<string, string> = {
  а: 'a',
  б: 'b',
  в: 'v',
  г: 'g',
  ґ: 'g',
  д: 'd',
  е: 'e',
  ё: 'yo',
  є: 'ye',
  ж: 'zh',
  з: 'z',
  и: 'i',
  і: 'i',
  ї: 'yi',
  й: 'y',
  к: 'k',
  л: 'l',
  м: 'm',
  н: 'n',
  о: 'o',
  п: 'p',
  р: 'r',
  с: 's',
  т: 't',
  у: 'u',
  ў: 'u',
  ф: 'f',
  х: 'kh',
  ц: 'ts',
  ч: 'ch',
  ш: 'sh',
  щ: 'shch',
  ъ: '',
  ы: 'y',
  ь: '',
  э: 'e',
  ю: 'yu',
  я: 'ya',
};
const MARKS: Record<string, string> = {
  '·': '-',
  '•': '-',
  '–': '-',
  '—': '-',
  '−': '-',
  '‐': '-',
  '‘': "'",
  '’': "'",
  '‚': ',',
  '“': '"',
  '”': '"',
  '„': '"',
  '«': '"',
  '»': '"',
  '×': 'x',
  '°': ' deg',
  '±': '+/-',
  '№': 'No',
  '…': '...',
  '⁄': '/',
  ß: 'ss',
  æ: 'ae',
  Æ: 'AE',
  ø: 'o',
  Ø: 'O',
  œ: 'oe',
  Œ: 'OE',
  ł: 'l',
  Ł: 'L',
  đ: 'd',
  Đ: 'D',
  ð: 'd',
  þ: 'th',
  ı: 'i',
  ' ': ' ',
};

/** Printable ASCII by transliteration — R12 TEXT values (never `\U+` escapes). */
export function asciiText(s: string): string {
  let out = '';
  for (const ch of s.replace(/[\r\n\t]/g, ' ')) {
    if (/[\x20-\x7e]/.test(ch)) {
      out += ch;
      continue;
    }
    const lower = ch.toLowerCase();
    const cyr = CYR[lower];
    if (cyr !== undefined) {
      out += ch === lower ? cyr : cyr.charAt(0).toUpperCase() + cyr.slice(1);
      continue;
    }
    const mark = MARKS[ch];
    if (mark !== undefined) {
      out += mark;
      continue;
    }
    const base = ch.normalize('NFKD').replace(/[̀-ͯ]/g, '');
    out += /^[\x20-\x7e]+$/.test(base) ? base : base === '' ? '' : '?';
  }
  return out;
}
