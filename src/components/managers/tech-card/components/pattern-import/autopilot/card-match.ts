// A10 · the card names the model / the tile sheet (rule D5, Codex #2/#4: never "the one with the
// most pieces"). The card's identifying strings (its name, style number, the uploaded file names)
// are matched against the model labels the sheet prints ("Style A", "Mod. 112") and the tile
// sheets' own labels (a sheet letter "Bogen B", the models printed on each sheet's pages).
//
// A match counts only when it is UNIQUE and token-exact after normalisation (case, separators,
// leading zeros):
//   * a number: "112" on the card ↔ "Mod. 112"; a bare number counts only with 3+ digits and no
//     leading zero ("FW26-012" is the card's own serial), else the card must say "mod 12";
//   * a letter: "Style A" ↔ "A" only when the card says "style a" / "model a" (or "sheet b" for a
//     sheet) — a lone letter, an "A-line", a "styles" never count;
//   * size tokens of the card never match, nor generic words (they carry no key at all).
// Several hits, a hit the sheet does not carry, or none → null with the reason (the stop).
import type { PageClassification } from 'lib/pattern-import/types';
import type { CardContext } from '../client';

export type CardString = { field: string; text: string };
type Key = { kind: 'num' | 'letter'; v: string };
type Mention = Key & { explicit: boolean; said: string; from: CardString };

/** A choice the card makes, or why it makes none (`why` null = the card names nothing). */
export type CardPick<T> =
  | { pick: T; evidence: string[]; why?: undefined }
  | { pick: null; evidence?: undefined; why: string | null };

const MODEL_WORD = String.raw`(?:modell?|mod[eè]le|modelo|mod|style|view|version|variante?|ansicht|модель|мод|вариант|фасон)`;
const SHEET_WORD = String.raw`(?:schnitt)?(?:bogen|sheet|лист|arkusz|feuille|planche|hoja|foglio)`;
/** word · separators · value; a letter needs a separator ("styles" is not "style s"). */
const said = (word: string) =>
  new RegExp(
    String.raw`(?<![\p{L}\p{N}])${word}\.?(?:[\s_#№:.\-]*(\d{1,4})(?![\p{L}\p{N}]|[/.]\d)|[\s_#№:.\-]+(\p{L})(?![\p{L}\p{N}]|-\p{L}))`,
    'giu',
  );
const MODEL_SAID = said(MODEL_WORD);
const SHEET_SAID = said(SHEET_WORD);
const BARE_NUMBER = /(?<![\p{L}\p{N}/.])([1-9]\d{2,3})(?![\p{L}\p{N}]|[/.]\d)/gu;

const normNum = (d: string) => d.replace(/^0+(?=\d)/, '');
const keyOf = (num: string | undefined, letter: string | undefined): Key | null =>
  num
    ? { kind: 'num', v: normNum(num) }
    : letter
      ? { kind: 'letter', v: letter.toLowerCase() }
      : null;
const same = (a: Key, b: Key) => a.kind === b.kind && a.v === b.v;

/**
 * What the card says it is: its name and style number (the season only when no style number is
 * given apart — `styleLabel` is "season · style number"), and the uploaded files' names.
 */
export function cardStrings(card: CardContext, fileNames: readonly string[]): CardString[] {
  const out: CardString[] = [];
  if (card.cardName?.trim()) out.push({ field: 'card name', text: card.cardName.trim() });
  if (card.styleNumber?.trim()) out.push({ field: 'style number', text: card.styleNumber.trim() });
  else if (card.styleLabel?.trim()) out.push({ field: 'style', text: card.styleLabel.trim() });
  for (const f of fileNames) out.push({ field: 'file', text: f.replace(/\.[^.]+$/, '') });
  return out;
}

/** The card's size tokens (every spelling): a number or a letter that is a size never matches. */
function sizeTokens(card: CardContext): Set<string> {
  const out = new Set<string>();
  for (const s of card.sizes)
    for (const t of [s.token, s.name, ...(s.spellings ?? [])]) {
      const x = String(t ?? '').toLowerCase();
      if (!x) continue;
      out.add(/^\d+$/.test(x) ? normNum(x) : x);
    }
  return out;
}

function mentions(strings: readonly CardString[], re: RegExp, sizes: Set<string>, bare: boolean) {
  const out: Mention[] = [];
  for (const from of strings) {
    for (const m of from.text.matchAll(re)) {
      const k = keyOf(m[1], m[2]);
      if (k && !sizes.has(k.v)) out.push({ ...k, explicit: true, said: m[0].trim(), from });
    }
    if (!bare) continue;
    for (const m of from.text.matchAll(BARE_NUMBER)) {
      const k = keyOf(m[1], undefined)!;
      if (!sizes.has(k.v)) out.push({ ...k, explicit: false, said: m[0], from });
    }
  }
  return out;
}

/** The key of a model label as the sheet offers it ("Mod. 0112" → 112, "Style B" → b). */
export function modelKey(label: string): Key | null {
  const m = label
    .trim()
    .match(/^(?:style|view|version|variante?|mod(?:ell?|el)?)\.?\s*(?:(\d{1,4})|(\p{L}))$/iu);
  return m ? keyOf(m[1], m[2]) : null;
}

/** A model label matches a mention: an explicit one always; a bare number only for 3+ digits. */
const matches = (k: Key, m: Mention) => same(k, m) && (m.explicit || k.v.length >= 3);

const quote = (m: Mention) => `${m.from.field} «${m.from.text}» says "${m.said}"`;

/** The one model of `labels` the card names. */
export function modelFromCard(
  labels: readonly string[],
  card: CardContext,
  fileNames: readonly string[],
): CardPick<string> {
  const ms = mentions(cardStrings(card, fileNames), MODEL_SAID, sizeTokens(card), true);
  if (!ms.length) return { pick: null, why: null };
  const hits = labels.flatMap((l) => {
    const k = modelKey(l);
    const by = k ? ms.filter((m) => matches(k, m)) : [];
    return by.length ? [{ label: l, by }] : [];
  });
  if (hits.length === 1)
    return {
      pick: hits[0].label,
      evidence: [`${quote(hits[0].by[0])} ↔ model "${hits[0].label}" on the sheet`],
    };
  if (hits.length > 1)
    return {
      pick: null,
      why: `the card names several of them (${hits.map((h) => `"${h.label}" ← ${h.by[0].said}`).join(', ')})`,
    };
  const explicit = ms.filter((m) => m.explicit);
  return {
    pick: null,
    why: explicit.length
      ? `the card names ${explicit.map((m) => `"${m.said}"`).join(', ')}, which is not a model on this sheet`
      : null,
  };
}

/** The tile sheets of a file: their index, the letter they print, the models their pages name. */
export function sheetsOf(pages: readonly PageClassification[]) {
  const ids = [...new Set(pages.filter((p) => p.cls === 'tile').map((p) => p.sheet ?? 0))].sort(
    (a, b) => a - b,
  );
  const on = (k: number) => pages.filter((p) => (p.sheet ?? 0) === k && p.cls !== 'blank');
  const letters = ids.map((k) => new Set(on(k).flatMap((p) => p.labels?.sheets ?? [])));
  return ids.map((k, i) => {
    // a letter is the sheet's name only when it is the one letter it prints and no other sheet does
    const own = [...letters[i]].filter((l) => letters.every((o, j) => j === i || !o.has(l)));
    return {
      sheet: k,
      name: letters[i].size === 1 && own.length === 1 ? own[0] : null,
      models: new Set(on(k).flatMap((p) => p.labels?.models ?? [])),
    };
  });
}

const sheetWord = (s: { sheet: number; name: string | null }) =>
  s.name ? `sheet ${s.name} (${s.sheet + 1})` : `sheet ${s.sheet + 1}`;

/**
 * The tile sheet the card names: by the sheet's own letter ("Bogen B" ↔ the card's "sheet b"), by
 * order when the file names no sheet ("sheet 2" / "sheet b" = the second), or by the model the
 * card names when only that sheet prints it. The model's sheets several → a stop that says so
 * (one run imports one sheet).
 */
export function sheetFromCard(
  pages: readonly PageClassification[],
  card: CardContext,
  fileNames: readonly string[],
): CardPick<number> {
  const sheets = sheetsOf(pages);
  if (sheets.length < 2) return { pick: null, why: null };
  const strings = cardStrings(card, fileNames);
  // by name
  const said = mentions(strings, SHEET_SAID, new Set(), false);
  const named = sheets.some((s) => s.name);
  const byName = sheets.flatMap((s, i) => {
    const by = said.filter((m) =>
      named
        ? m.kind === 'letter' && s.name?.toLowerCase() === m.v
        : m.kind === 'letter'
          ? m.v.charCodeAt(0) - 97 === i
          : Number(m.v) - 1 === i,
    );
    return by.length ? [{ s, by }] : [];
  });
  if (byName.length > 1)
    return {
      pick: null,
      why: `the card names several sheets (${byName.map((h) => h.by[0].said).join(', ')})`,
    };
  // by model
  const labels = [...new Set(sheets.flatMap((s) => [...s.models]))];
  const model = labels.length ? modelFromCard(labels, card, fileNames) : null;
  const carry = model?.pick ? sheets.filter((s) => s.models.has(model.pick!)) : [];
  if (byName.length === 1) {
    const { s, by } = byName[0];
    if (model?.pick && carry.length && !carry.includes(s))
      return {
        pick: null,
        why: `the card names ${sheetWord(s)} but model "${model.pick}" it names is printed on ${carry.map(sheetWord).join(', ')}`,
      };
    return {
      pick: s.sheet,
      evidence: [
        `${quote(by[0])} ↔ ${named ? `«${s.name}» printed on the sheet` : 'the sheet by order (the file names none)'}`,
        ...(model?.pick && carry.includes(s) ? model.evidence! : []),
      ],
    };
  }
  if (model?.pick && carry.length === 1)
    return {
      pick: carry[0].sheet,
      evidence: [...model.evidence!, `only ${sheetWord(carry[0])} prints "${model.pick}"`],
    };
  if (model?.pick && carry.length > 1)
    return {
      pick: null,
      why: `the card names model "${model.pick}", whose pieces are spread over ${carry.map(sheetWord).join(' and ')} — one run imports one sheet: import each in its own run`,
    };
  return {
    pick: null,
    why: said.length
      ? `the card names ${said.map((m) => `"${m.said}"`).join(', ')}, which is not a sheet of this file`
      : model?.why ?? null,
  };
}
