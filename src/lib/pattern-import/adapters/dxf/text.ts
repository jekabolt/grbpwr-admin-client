// DXF string decoding (TEXT / MTEXT / ATTRIB) and AAMA/ASTM label decoding.

/** TEXT/ATTRIB value: `\U+XXXX`, `%%d/%%p/%%c/%%nnn`, `%%u/%%o` toggles. */
export function decodeTextValue(s: string): string {
  return s
    .replace(/\\U\+([0-9A-Fa-f]{4,5})/g, (_, h: string) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/%%(\d{3})/g, (_, d: string) => String.fromCharCode(Number(d)))
    .replace(/%%[dD]/g, '°')
    .replace(/%%[pP]/g, '±')
    .replace(/%%[cC]/g, '⌀')
    .replace(/%%[uUoOkK]/g, '')
    .replace(/%%%/g, '%');
}

/** MTEXT inline formatting → plain text (paragraphs as \n). */
export function decodeMText(s: string): string {
  let out = s.replace(/\\U\+([0-9A-Fa-f]{4,5})/g, (_, h: string) =>
    String.fromCodePoint(parseInt(h, 16)),
  );
  // stacked fractions \S a^b; / a/b; / a#b;
  out = out.replace(/\\S([^;]*?)[\^/#]([^;]*?);/g, '$1/$2');
  // codes with an argument up to ';'
  out = out.replace(/\\[fFHhWwQqTtAaCcp][^;\\]*;/g, '');
  out = out
    .replace(/\\P/g, '\n')
    .replace(/\\X/g, '\n')
    .replace(/\\~/g, ' ')
    .replace(/\\[LlOoKkNn]/g, '')
    .replace(/\\\\/g, '\u0000')
    .replace(/\\([{}])/g, '$1')
    .replace(/[{}]/g, '')
    .replace(/\u0000/g, '\\');
  return decodeTextValue(out);
}

/** Canonical AAMA/ASTM label keys (plus the synonyms foreign CAD writes). */
export type LabelKey =
  | 'pieceName'
  | 'size'
  | 'quantity'
  | 'material'
  | 'category'
  | 'annotation'
  | 'sampleSize'
  | 'styleName'
  | 'units'
  | 'author'
  | 'product'
  | 'creationDate'
  | 'creationTime'
  | 'version'
  | 'gradeRuleTable'
  | 'description'
  | 'other';

const KEYS: [RegExp, LabelKey][] = [
  [/^(piece\s*name|piece|name|part\s*name)$/i, 'pieceName'],
  [/^(size|size\s*name)$/i, 'size'],
  [/^(quantity|qty|cut\s*quantity|cut\s*qty|pieces)$/i, 'quantity'],
  [/^(material|fabric|material\s*type)$/i, 'material'],
  [/^(category|piece\s*category)$/i, 'category'],
  [/^(annotation|comment|note)$/i, 'annotation'],
  [/^(sample\s*size|base\s*size)$/i, 'sampleSize'],
  [/^(style\s*name|style|model)$/i, 'styleName'],
  [/^units?$/i, 'units'],
  [/^author$/i, 'author'],
  [/^product$/i, 'product'],
  [/^creation\s*date$/i, 'creationDate'],
  [/^creation\s*time$/i, 'creationTime'],
  [/^version$/i, 'version'],
  [/^grade\s*rule\s*table$/i, 'gradeRuleTable'],
  [/^description$/i, 'description'],
];

export type DecodedLabel = { key: LabelKey; rawKey: string; value: string };

/** `KEY: value` → structured; null for free text. `# 1200` point numbers are not labels. */
export function decodeLabel(text: string): DecodedLabel | null {
  const m = /^\s*([A-Za-z][A-Za-z .]{0,30}?)\s*:\s*(.*?)\s*$/.exec(text);
  if (!m) return null;
  const rawKey = m[1].trim();
  for (const [re, key] of KEYS) if (re.test(rawKey)) return { key, rawKey, value: m[2] };
  return { key: 'other', rawKey, value: m[2] };
}

/** AAMA point-number text (`# 1200`, `# -1`) drawn by CLO-AAMA next to grade points. */
export const isPointNumber = (s: string) => /^#\s*-?\d+$/.test(s.trim());
