// A10 · the card names the model / the tile sheet (rule D5, Codex #2/#4: never "the one with the
// most pieces"). The card's identifying strings (its name, style number, the uploaded file names)
// are matched against the model labels the sheet prints ("Style A", "Mod. 112") and the tile
// sheets' own labels (a sheet letter "Bogen B", the models printed on each sheet's TILES).
//
// A match counts only when it is UNIQUE and token-exact after normalisation (case, separators,
// leading zeros). What the autopilot may act on (`strong`) — Codex review of 48068988:
//   * an explicit prefix on BOTH sides: Mod./Model/Modell/Style/Art. + value on the card ↔ the
//     sheet's "Mod. 112" / "Style B"; Bogen/Sheet + letter ↔ the letter the sheet prints;
//   * or a bare number in the card's dedicated style-number field ("112" ↔ "Mod. 112").
// A bare number in the card name or a file name (3+ digits, no leading zero, not a year, no unit
// after it), a file name alone, a sheet by its order in the file: a SUGGESTION — the operator's one
// click, the autopilot stops on it. Card fields outrank file names: a file name only confirms.
// Every explicit mention must match: one that names nothing on the sheet, several picks, a file
// name against the card, a model spread over several sheets → no pick, the stop says why.
// Size tokens of the card never match; generic words carry no key at all.
import type { PageClassification } from 'lib/pattern-import/types';
import type { CardContext } from '../client';

/** Where a string comes from: the card's name, its dedicated style-number field, a file name. */
export type CardSource = 'card' | 'style' | 'file';
export type CardString = { field: string; text: string; source: CardSource };
/** A model's namespace: "Mod. 112" (mod / model / modell) and "Style B" (style / view …) never cross. */
type Family = 'mod' | 'style';
type Key = { kind: 'num' | 'letter'; v: string; family?: Family };
type Mention = Key & { explicit: boolean; said: string; from: CardString };

/** A choice the card makes, or why it makes none (`why` null = the card names nothing). */
export type CardPick<T> =
  | { pick: T; evidence: string[]; strong: boolean; why?: undefined }
  | { pick: null; evidence?: undefined; strong?: undefined; why: string | null };

// Codex re-check #2: prefixes count within their family only; an article number ("Art. 112",
// "Artikel", "Article") is another namespace — never a model
const MOD_WORD = String.raw`(?:modell?s?|mod[eè]les?|modelos?|mod|модел[ьи]|мод)`;
const STYLE_WORD = String.raw`(?:styles?|views?|version|variante?n?|ansicht|вариант|фасон)`;
/**
 * An article / SKU / reference number in any spelling ("Art.-Nr. 112", "Article No. 112",
 * "Art-Nr 112", "Artikelnummer 112", "SKU 112", "Ref. 112", "артикул 112"): the prefix, an
 * optional "No./Nr./Nummer/#", then the number — the whole span is an article number, in any
 * field, and never a model token (Codex re-check of 14f4f959).
 */
const ART_WORD = String.raw`(?:art(?:ikel|icle)?(?:nummer|number|nr|no)?|артикул|арт|sku|ref(?:erence|erenz)?|item)`;
const ARTICLE = new RegExp(
  String.raw`(?<![\p{L}\p{N}])${ART_WORD}\.?(?:[\s_#№:.\-]*(?:nummer|number|num|nr|no|n°|#)(?![\p{L}])\.?)?[\s_#№:.\-]*\d[\d./\-]*`,
  'giu',
);
const MODEL_WORD = String.raw`(?:${MOD_WORD}|${STYLE_WORD})`;
const familyOf = (word: string): Family =>
  new RegExp(String.raw`^${MOD_WORD}\.?$`, 'iu').test(word.trim()) ? 'mod' : 'style';
const SHEET_WORD = String.raw`(?:schnitt)?(?:bogen|sheets?|лист|arkusz|feuille|planche|hoja|foglio)`;
/** What a number may not be followed by: a fraction / date, a unit, a year word. */
const NOT_A_ID = String.raw`(?![\p{L}\p{N}]|[/.,]\d|[\s_\-]*(?:cm|mm|m|см|мм|м|in|inch|"|%|kg|g|г|yrs?|years?|jahre|лет|года?)(?![\p{L}\p{N}]))`;
const VALUE = String.raw`(?:(\d{1,4})${NOT_A_ID}|(\p{L})(?![\p{L}\p{N}]|-\p{L}))`;
/** word · separators · value; a letter needs a separator ("stylex" is not "style x"). */
const said = (word: string) =>
  new RegExp(
    String.raw`(?<![\p{L}\p{N}])${word}\.?(?:[\s_#№:.\-]*(\d{1,4})${NOT_A_ID}|[\s_#№:.\-]+(\p{L})(?![\p{L}\p{N}]|-\p{L}))`,
    'giu',
  );
const MODEL_SAID = said(MODEL_WORD);
const SHEET_SAID = said(SHEET_WORD);
/** A compact list after a mention: "Style A/B", "Bogen A & B", "Mod. 112, 113 und 114". */
const MORE = new RegExp(String.raw`^\s*(?:[/,&+]|and|und|или|и|or|oder|et|y)\s*${VALUE}`, 'iu');
const BARE_NUMBER = new RegExp(String.raw`(?<![\p{L}\p{N}/.])([1-9]\d{2,3})${NOT_A_ID}`, 'gu');

const normNum = (d: string) => d.replace(/^0+(?=\d)/, '');
const keyOf = (num: string | undefined, letter: string | undefined): Key | null =>
  num
    ? { kind: 'num', v: normNum(num) }
    : letter
      ? { kind: 'letter', v: letter.toLowerCase() }
      : null;
const same = (a: Key, b: Key) => a.kind === b.kind && a.v === b.v;
const isYear = (v: string) => /^(19|20)\d\d$/.test(v);

/**
 * What the card says it is: its name, its style number (the dedicated field), and the uploaded
 * files' names. `styleLabel` ("season · style number") stands in for an older caller that gives
 * neither field — read as the card name, never as the dedicated field.
 */
export function cardStrings(card: CardContext, fileNames: readonly string[]): CardString[] {
  const out: CardString[] = [];
  if (card.cardName?.trim())
    out.push({ field: 'card name', text: card.cardName.trim(), source: 'card' });
  if (card.styleNumber?.trim())
    out.push({ field: 'style number', text: card.styleNumber.trim(), source: 'style' });
  else if (!card.cardName?.trim() && card.styleLabel?.trim())
    out.push({ field: 'style', text: card.styleLabel.trim(), source: 'card' });
  for (const f of fileNames)
    out.push({ field: 'file', text: f.replace(/\.[^.]+$/, ''), source: 'file' });
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
    const taken: [number, number][] = [];
    // an article number is not a bare model number either: its span is taken, nothing said
    if (bare)
      for (const m of from.text.matchAll(ARTICLE))
        taken.push([m.index ?? 0, (m.index ?? 0) + m[0].length]);
    for (const m of from.text.matchAll(re)) {
      const at = m.index ?? 0;
      const word = m[0].match(/^[\p{L}]+/u)?.[0] ?? '';
      const family = re === MODEL_SAID ? familyOf(word) : undefined;
      const push = (num: string | undefined, letter: string | undefined, text: string) => {
        const k = keyOf(num, letter);
        if (k && !sizes.has(k.v))
          out.push({
            ...k,
            ...(family ? { family } : {}),
            explicit: true,
            said: text.trim(),
            from,
          });
      };
      push(m[1], m[2], m[0]);
      // the compact list that follows ("Style A/B" names A AND B)
      let end = at + m[0].length;
      for (;;) {
        const n = from.text.slice(end).match(MORE);
        if (!n) break;
        push(n[1], n[2], `${m[0].trim()}…${n[0].trim()}`);
        end += n[0].length;
      }
      taken.push([at, end]);
    }
    if (!bare) continue;
    for (const m of from.text.matchAll(BARE_NUMBER)) {
      const at = m.index ?? 0;
      if (taken.some(([a, b]) => at >= a && at < b)) continue;
      const k = keyOf(m[1], undefined)!;
      if (!sizes.has(k.v) && !isYear(k.v)) out.push({ ...k, explicit: false, said: m[0], from });
    }
  }
  return out;
}

/** The key of a model label as the sheet offers it ("Mod. 0112" → 112, "Style B" → b). */
export function modelKey(label: string): Key | null {
  const m = label
    .trim()
    .match(/^(style|view|version|variante?|mod(?:ell?|el)?)\.?\s*(?:(\d{1,4})|(\p{L}))$/iu);
  const k = m ? keyOf(m[2], m[3]) : null;
  return k ? { ...k, family: /^mod/i.test(m![1]) ? 'mod' : 'style' } : null;
}

/** A model label matches a mention: an explicit one always; a bare number only for 3+ digits. */
const matches = (k: Key, m: Mention) =>
  same(k, m) && (m.explicit ? m.family === k.family : k.v.length >= 3);
/** The autopilot acts on: an explicit prefix in a card field, or the style-number field itself. */
const proves = (m: Mention) =>
  m.from.source !== 'file' &&
  (m.explicit ||
    // the style-number field that holds the bare value and nothing else ("112", not "FW26 112")
    (m.from.source === 'style' && m.from.text.trim() === m.said.trim()));

const quote = (m: Mention) => `${m.from.field} «${m.from.text}» says "${m.said}"`;

/** The one model of `labels` the card names. */
export function modelFromCard(
  labels: readonly string[],
  card: CardContext,
  fileNames: readonly string[],
): CardPick<string> {
  const ms = mentions(cardStrings(card, fileNames), MODEL_SAID, sizeTokens(card), true);
  if (!ms.length) return { pick: null, why: null };
  const keyed = labels.flatMap((l) => {
    const k = modelKey(l);
    return k ? [{ l, k }] : [];
  });
  const hitsOf = (m: Mention) => keyed.filter((x) => matches(x.k, m)).map((x) => x.l);
  // every explicit mention names a model of this sheet (a card that says "Style C" is not about it)
  const stray = ms.filter((m) => m.explicit && !hitsOf(m).length);
  if (stray.length)
    return {
      pick: null,
      why: `the ${stray[0].from.field} names ${stray.map((m) => `"${m.said}"`).join(', ')}, which is not a model on this sheet`,
    };
  const fromCard = ms.filter((m) => m.from.source !== 'file' && hitsOf(m).length);
  const fromFile = ms.filter((m) => m.from.source === 'file' && hitsOf(m).length);
  const cardHits = [...new Set(fromCard.flatMap(hitsOf))];
  const fileHits = [...new Set(fromFile.flatMap(hitsOf))];
  if (cardHits.length > 1 || (!cardHits.length && fileHits.length > 1)) {
    const by = cardHits.length ? fromCard : fromFile;
    return {
      pick: null,
      why: `the card names several of them (${by.map((m) => `"${hitsOf(m)[0]}" ← ${m.said}`).join(', ')})`,
    };
  }
  if (cardHits.length === 1) {
    const pick = cardHits[0];
    // a file name only confirms: one naming another model is a conflict
    const against = fromFile.filter((m) => !hitsOf(m).includes(pick));
    if (against.length)
      return {
        pick: null,
        why: `the card names "${pick}" but the ${against[0].from.field} «${against[0].from.text}» says "${against[0].said}"`,
      };
    const by = fromCard.filter((m) => hitsOf(m).includes(pick));
    const sure = by.filter(proves);
    return {
      pick,
      strong: sure.length > 0,
      evidence: [
        `${quote((sure[0] ?? by[0])!)} ↔ model "${pick}" on the sheet`,
        ...fromFile.map((m) => `confirmed by ${quote(m)}`),
      ],
    };
  }
  if (fileHits.length === 1)
    return {
      pick: fileHits[0],
      strong: false,
      evidence: [`${quote(fromFile[0])} ↔ model "${fileHits[0]}" on the sheet (a file name only)`],
    };
  return { pick: null, why: null };
}

/**
 * The tile sheets of a file: their index, the letter they print, the models their TILES print.
 * Only pages the reader put on a sheet count (instructions / cover / unknown pages carry no
 * sheet); a model is a sheet's only by its tiles — an overview or an instruction page that names
 * models never proves which sheet carries one (Codex #1). A letter may come from the sheet's
 * overview (Burda prints "Bogen A" there only), and only when it is the one letter that sheet
 * prints and no other sheet prints it.
 */
export function sheetsOf(pages: readonly PageClassification[]) {
  const ids = [...new Set(pages.filter((p) => p.cls === 'tile').map((p) => p.sheet ?? 0))].sort(
    (a, b) => a - b,
  );
  const tiles = (k: number) => pages.filter((p) => p.cls === 'tile' && (p.sheet ?? 0) === k);
  const own = (k: number) => pages.filter((p) => p.cls === 'overview' && p.sheet === k);
  const letters = ids.map(
    (k) => new Set([...tiles(k), ...own(k)].flatMap((p) => p.labels?.sheets ?? [])),
  );
  return ids.map((k, i) => {
    const only = [...letters[i]].filter((l) => letters.every((o, j) => j === i || !o.has(l)));
    return {
      sheet: k,
      name: letters[i].size === 1 && only.length === 1 ? only[0] : null,
      /** Every model a tile of this sheet prints (a legend too). */
      models: new Set(tiles(k).flatMap((p) => p.labels?.models ?? [])),
      /**
       * Codex re-check #1: the models this sheet's pieces carry — a tile that prints ONE model
       * only (its pieces' label). A tile listing several (a legend "Mod. 112, 113", mixed pieces)
       * proves no ownership.
       */
      owns: new Set(
        tiles(k).flatMap((p) => (p.labels?.models?.length === 1 ? p.labels.models : [])),
      ),
    };
  });
}

const sheetWord = (s: { sheet: number; name: string | null }) =>
  s.name ? `sheet ${s.name} (${s.sheet + 1})` : `sheet ${s.sheet + 1}`;

/**
 * The tile sheet the card names: by the sheet's own letter ("Bogen B" ↔ the card's "Bogen B"),
 * or by the model the card names when only that sheet's tiles print it. By order in the file (the
 * file names no sheet) or by a file name alone: a suggestion only. A model spread over several
 * sheets stops, also when a sheet is named (Codex #4: one run imports one sheet).
 */
export function sheetFromCard(
  pages: readonly PageClassification[],
  card: CardContext,
  fileNames: readonly string[],
): CardPick<number> {
  const sheets = sheetsOf(pages);
  if (sheets.length < 2) return { pick: null, why: null };
  const said = mentions(cardStrings(card, fileNames), SHEET_SAID, new Set(), false);
  const named = sheets.some((s) => s.name);
  const hitsOf = (m: Mention) =>
    sheets.filter((s, i) =>
      named
        ? m.kind === 'letter' && s.name?.toLowerCase() === m.v
        : m.kind === 'letter'
          ? m.v.charCodeAt(0) - 97 === i
          : Number(m.v) - 1 === i,
    );
  const stray = said.filter((m) => !hitsOf(m).length);
  if (stray.length)
    return {
      pick: null,
      why: `the ${stray[0].from.field} names ${stray.map((m) => `"${m.said}"`).join(', ')}, which is not a sheet of this file`,
    };
  const fromCard = said.filter((m) => m.from.source !== 'file');
  const fromFile = said.filter((m) => m.from.source === 'file');
  const cardHits = [...new Set(fromCard.flatMap(hitsOf))];
  const fileHits = [...new Set(fromFile.flatMap(hitsOf))];
  if (cardHits.length > 1 || (!cardHits.length && fileHits.length > 1))
    return {
      pick: null,
      why: `the card names several sheets (${(cardHits.length ? fromCard : fromFile).map((m) => m.said).join(', ')})`,
    };
  if (cardHits.length === 1 && fileHits.some((s) => s !== cardHits[0]))
    return {
      pick: null,
      why: `the card names ${sheetWord(cardHits[0])} but the file name says ${sheetWord(fileHits.find((s) => s !== cardHits[0])!)}`,
    };
  // the model the card names, by the sheets whose tiles print it
  const labels = [...new Set(sheets.flatMap((s) => [...s.models]))];
  const model = labels.length ? modelFromCard(labels, card, fileNames) : null;
  if (model && model.pick == null && model.why) return { pick: null, why: model.why };
  // owned by one sheet's pieces and printed on no other sheet's tiles; printed elsewhere = spread
  const carry = model?.pick ? sheets.filter((s) => s.models.has(model.pick!)) : [];
  if (model?.pick && carry.length === 1 && !carry[0].owns.has(model.pick))
    return {
      pick: null,
      why: `the card names model "${model.pick}", but no tile ties it to pieces — ${sheetWord(carry[0])} prints it only next to other models (a legend)`,
    };
  if (carry.length > 1)
    return {
      pick: null,
      why: `the card names model "${model!.pick}", whose pieces are spread over ${carry.map(sheetWord).join(' and ')} — one run imports one sheet: import each in its own run`,
    };
  const s = cardHits[0] ?? fileHits[0];
  if (s) {
    if (carry.length === 1 && carry[0] !== s)
      return {
        pick: null,
        why: `the card names ${sheetWord(s)} but model "${model!.pick}" it names is printed on ${sheetWord(carry[0])}`,
      };
    const by = (cardHits.length ? fromCard : fromFile).find((m) => hitsOf(m).includes(s))!;
    return {
      pick: s.sheet,
      // the sheet's own printed letter on a card field; by order or by a file name: a suggestion
      strong: !!cardHits.length && named && (!model?.pick || model.strong),
      evidence: [
        `${quote(by)} ↔ ${named ? `«${s.name}» printed on the sheet` : 'the sheet by its order in the file (the file names none)'}`,
        ...(model?.pick ? model.evidence : []),
      ],
    };
  }
  if (model?.pick && carry.length === 1)
    return {
      pick: carry[0].sheet,
      strong: model.strong,
      evidence: [
        ...model.evidence,
        `only the tiles of ${sheetWord(carry[0])} print "${model.pick}"`,
      ],
    };
  return { pick: null, why: null };
}

/** The stop reason for a pick the autopilot may not act on (a suggestion for the operator). */
export const weakReason = (what: string, p: { evidence: string[] }) =>
  `the card suggests ${what} (${p.evidence[0]}) but without a model / sheet prefix on a card field — confirm it`;
