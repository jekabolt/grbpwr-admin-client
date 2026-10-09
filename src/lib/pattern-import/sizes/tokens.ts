// sizes/ — size tokens as sources spell them, and size runs found in text.
//
// Numeric ("44", "Size 38", "Gr. 38", "р. 48") and letter ("XS", "2XL", "XXXL") tokens; a run is
// a consecutive sequence (numeric with a constant step, letters in order). Text evidence:
// "36-46", "44-46-48-50-52-54", "XS to 5XL", "34–48", "72..88", or a row of tokens in a table.

const LETTERS = ['XXXS', 'XXS', 'XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL', '4XL', '5XL', '6XL'];
const LETTER_ALIAS: Record<string, string> = {
  '2XL': 'XXL',
  '3XL': 'XXXL',
  '2XS': 'XXS',
  '3XS': 'XXXS',
  XXXXL: '4XL',
};

export type SizeToken = { label: string; kind: 'num' | 'letter'; value: number };

/** Parse one size token; null when the text is not one. `strict` refuses prefixes/suffixes. */
export function parseSizeToken(raw: string, strict = false): SizeToken | null {
  let t = raw.trim().replace(/\s+/g, ' ');
  if (!strict)
    t = t
      .replace(/^(size|sizes|gr\.?|größe|taille|р\.?|размер|eu|de|fr|uk|us)\s*/i, '')
      .replace(/[.,:;)]+$/, '');
  if (/^\d{1,3}$/.test(t)) {
    const v = Number(t);
    if (v < 0 || v > 200) return null;
    return { label: t, kind: 'num', value: v };
  }
  const u = t.toUpperCase();
  const canon = LETTER_ALIAS[u] ?? u;
  const i = LETTERS.indexOf(canon);
  if (i >= 0) return { label: t.toUpperCase(), kind: 'letter', value: i };
  return null;
}

/** Order two tokens of one run. */
export const tokenOrder = (a: SizeToken, b: SizeToken) => a.value - b.value;

export type TextRun = {
  labels: string[];
  source: string;
  kind: 'range' | 'list' | 'table' | 'legend';
  /** The text that carried the run also says "size" (in one of the corpus languages). */
  keyword: boolean;
};

export const SIZE_WORD =
  /(size|größe|grösse|gr\.|taille|talla|taglia|maat|rozmiar|размер|розмір|\bр\.)/i;

function numRange(a: number, b: number, step: number): string[] {
  const out: string[] = [];
  for (let v = a; v <= b + 1e-9; v += step) out.push(String(v));
  return out;
}

/** Size runs mentioned in text. Ranges expand with every plausible step (2, 4, 1, 6). */
export function runsInText(texts: string[]): TextRun[] {
  const runs: TextRun[] = [];
  const seen = new Set<string>();
  const push = (r: TextRun) => {
    const k = r.labels.join(',');
    if (r.labels.length < 2 || seen.has(k)) return;
    seen.add(k);
    runs.push(r);
  };
  // texts are scanned one by one (a run must sit in one text item) plus the item before it, so
  // "Size:" / "Размеры" one item earlier still counts as the keyword
  texts.forEach((t, idx) => {
    const kw =
      SIZE_WORD.test(t) ||
      (idx > 0 && SIZE_WORD.test(texts[idx - 1]) && texts[idx - 1].length < 40);
    // explicit lists: 44-46-48-50-52-54, 72, 76, 80, 84, 88
    for (const m of t.matchAll(/\b(\d{1,3}(?:\s*[-–,]\s*\d{1,3}){2,})\b/g)) {
      const vals = m[1].split(/\s*[-–,]\s*/).map(Number);
      const steps = new Set(vals.slice(1).map((v, i) => v - vals[i]));
      if (steps.size === 1 && [...steps][0] > 0 && [...steps][0] <= 6)
        push({ labels: vals.map(String), source: m[0], kind: 'list', keyword: kw });
    }
    // numeric ranges: 36-46, 34–48, 72..88, 36 to 46
    for (const m of t.matchAll(/\b(\d{1,3})\s*(?:-|–|—|\.\.|…|to|bis|до|à)\s*(\d{1,3})\b/gi)) {
      const a = Number(m[1]);
      const b = Number(m[2]);
      if (!(b > a) || b - a > 60 || a < 2) continue;
      for (const step of [2, 4, 1, 6])
        if ((b - a) % step === 0 && (b - a) / step <= 14)
          push({ labels: numRange(a, b, step), source: m[0], kind: 'range', keyword: kw });
    }
    // letter ranges: XS to 5XL, XS–XXXL
    for (const m of t.matchAll(
      /\b(\d?X{0,3}[SML]|\dXL|X{1,3}L)\s*(?:-|–|—|to|bis|до|à)\s*(\d?X{0,3}[SML]|\dXL|X{1,3}L)\b/gi,
    )) {
      const a = parseSizeToken(m[1], true);
      const b = parseSizeToken(m[2], true);
      if (!a || !b || a.kind !== 'letter' || b.kind !== 'letter' || b.value <= a.value) continue;
      push({
        labels: LETTERS.slice(a.value, b.value + 1),
        source: m[0],
        kind: 'range',
        keyword: kw,
      });
    }
  });
  // legend entries: "размер 72", "SIZE 5XL", "Size 38" as separate items
  const legend: SizeToken[] = [];
  for (const t of texts) {
    const m = t
      .trim()
      .match(/^(?:size|größe|gr\.|taille|talla|maat|rozmiar|размер)\s*:?\s*(\S+)$/i);
    const tok = m ? parseSizeToken(m[1], true) : null;
    if (tok && !legend.some((x) => x.label === tok.label && x.kind === tok.kind)) legend.push(tok);
  }
  if (legend.length >= 3) {
    const kind = legend[0].kind;
    const same = legend.filter((x) => x.kind === kind).sort((a, b) => a.value - b.value);
    push({
      labels: same.map((x) => x.label),
      source: `legend: ${same.map((x) => x.label).join(' ')}`,
      kind: 'legend',
      keyword: true,
    });
  }
  return runs;
}

/** A table row of size tokens (viola: "34 | 36 | 38 | 40 | …"): consecutive tokens in reading order. */
export function runsInTokens(tokens: string[]): TextRun[] {
  const out: TextRun[] = [];
  let cur: SizeToken[] = [];
  const flush = () => {
    if (cur.length >= 4)
      out.push({
        labels: cur.map((t) => t.label),
        source: cur.map((t) => t.label).join(' '),
        kind: 'table',
        keyword: false,
      });
    cur = [];
  };
  for (const raw of tokens) {
    const t = parseSizeToken(raw, true);
    if (!t) {
      flush();
      continue;
    }
    if (cur.length) {
      const prev = cur[cur.length - 1];
      const step = cur.length >= 2 ? cur[1].value - cur[0].value : t.value - prev.value;
      if (t.kind !== prev.kind || t.value - prev.value !== step || step <= 0 || step > 6) {
        flush();
      }
    }
    cur.push(t);
  }
  flush();
  return out;
}
