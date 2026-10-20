// BACK-VARIANT (owner 19.10, kombinezon Style A P03 «High back notch» + «Low back notch»): a notch
// whose printed label names a model variant belongs to that variant. The chosen model keeps its
// own and drops the other's. Universal, not one garment:
//
//   • the label NAMES a model («Style A notch», «View 2 notch», «Mod. 125»): that notch is that
//     model's — proven by two evidences (D3): the printed label names the model, and the label is
//     bound to the notch (it carries a notch word, it is the nearest such label, none other as near).
//     The chosen model keeps it, any other model's is dropped (recorded, D5);
//   • the labels of one piece are ALTERNATIVES — two or more labels the same but for one word
//     («High back notch» / «Low back notch», «long / short sleeve notch»), or one label whose word
//     the sheet ties to one model only: the word is ONE evidence at most (a sheet line such as
//     «Cutting line Style A - High Waisted» shares the word, it never says which notch is whose),
//     so the importer ASKS which one the chosen model keeps (`NotchVariantAsk`, blocked
//     'notch-variant'); the word's model is shown as a hint, never applied. Never a silent pick.
//
// Only on a sheet that names ≥ 2 models, on a run with one of them chosen; elsewhere every notch
// stays as drawn.

import type { NotchVariantAsk, NotchVariantOption, PtMm, SeedId } from '../types';
import { modelKey } from '../pieces/variants';

/** Notch words a label carries (they name the mark, not the variant). */
const NOTCH_WORD = /^(?:notch(?:es)?|nicks?|knips|cran|надсечк\p{L}*)$/iu;
/** Words that name an alternative of one garment without a model ("high back", "long sleeve"). */
const ALT_WORDS = new Set([
  'high',
  'low',
  'long',
  'short',
  'deep',
  'shallow',
  'wide',
  'narrow',
  'mini',
  'midi',
  'maxi',
  'cropped',
  'full',
  'plain',
  'lined',
  'unlined',
]);

const words = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .split(' ')
    .filter(Boolean);

/** The label without its notch words, lower case («high back»); '' = a bare «notch». */
export function notchQualifier(label: string): string {
  return words(label)
    .filter((w) => !NOTCH_WORD.test(w))
    .join(' ');
}

/** The model a label names by itself («Style A notch» → Style A), one of `models`, else null. */
function namedModel(label: string, models: readonly string[]): string | null {
  const l = ` ${words(label).join(' ')} `;
  const hit = models.filter((m) => l.includes(` ${words(modelKey(m)).join(' ')} `));
  return hit.length === 1 ? hit[0] : null;
}

/** The one model the sheet's texts tie `word` to (a text naming exactly one model and the word). */
function wordModel(
  word: string,
  models: readonly string[],
  texts: readonly string[],
): string | null {
  const seen = new Set<string>();
  for (const t of texts) {
    const ws = words(t);
    if (!ws.includes(word)) continue;
    const l = ` ${ws.join(' ')} `;
    const ms = models.filter((m) => l.includes(` ${words(modelKey(m)).join(' ')} `));
    if (ms.length === 1) seen.add(ms[0]);
    // a text naming several models with the word says nothing about which
  }
  return seen.size === 1 ? [...seen][0] : null;
}

export type NotchVariantRead = {
  /** per size token: each notch's printed label (null = none bound), aligned with its notches */
  sizes: { size: string; notches: { at: PtMm; label: string | null }[] }[];
};

export type NotchVariantDecision =
  | { kind: 'none' }
  /** drop the notches whose qualifier is in `drop` (proven by the labels, or answered) */
  | {
      kind: 'apply';
      drop: Set<string>;
      kept: string[];
      from: 'label' | 'operator';
      why: string;
      /** the answer as applied (operator), for PieceSpec.notchVariant */
      answer?: string;
    }
  | { kind: 'ask'; ask: Omit<NotchVariantAsk, 'seed' | 'identity'> };

/**
 * What the chosen model keeps of one piece's labelled notches. `answer` = the operator's
 * `pieceOverrides[seed].notchVariant` (an option key, or 'all' = every notch as drawn); an answer
 * that names no option of the current question asks again.
 */
export function notchVariantOf(args: {
  seed: SeedId;
  read: NotchVariantRead;
  models: readonly string[];
  chosen: string | null;
  texts: readonly string[];
  answer?: string;
}): NotchVariantDecision {
  const { read, models, chosen, texts, answer } = args;
  if (models.length < 2 || !chosen) return { kind: 'none' };
  // the piece's distinct labelled qualifiers, with every size's places
  const opts = new Map<string, NotchVariantOption>();
  for (const s of read.sizes)
    for (const n of s.notches) {
      if (!n.label) continue;
      const q = notchQualifier(n.label);
      if (!q) continue;
      let o = opts.get(q);
      if (!o) {
        o = { key: q, label: n.label.replace(/\s+/g, ' ').trim(), model: null, perSize: [] };
        opts.set(q, o);
      }
      let ps = o.perSize.find((x) => x.size === s.size);
      if (!ps) o.perSize.push((ps = { size: s.size, at: [] }));
      ps.at.push(n.at);
    }
  if (!opts.size) return { kind: 'none' };
  const chosenKey = modelKey(chosen);
  // 1 · a label that names a model by itself: proven (named + bound to its notch)
  for (const o of opts.values()) o.model = namedModel(o.label, models);
  const named = [...opts.values()].filter((o) => o.model);
  if (named.length) {
    const drop = new Set(named.filter((o) => modelKey(o.model!) !== chosenKey).map((o) => o.key));
    if (!drop.size) return { kind: 'none' };
    return {
      kind: 'apply',
      drop,
      kept: named.filter((o) => !drop.has(o.key)).map((o) => o.key),
      from: 'label',
      why: `${[...drop].map((k) => `«${opts.get(k)!.label}»`).join(', ')} named for ${[
        ...new Set(named.filter((o) => drop.has(o.key)).map((o) => o.model)),
      ].join(
        ', ',
      )} on the sheet — left out of ${chosen} (the label names the model and is the notch's own)`,
    };
  }
  // 2 · alternatives: labels alike but for one word each, that word an alternative's word or tied
  //     by the sheet to one model; or a lone label whose word the sheet ties to one model
  const list = [...opts.values()];
  const ws = list.map((o) => words(o.key));
  const common = ws.reduce((a, b) => a.filter((w) => b.includes(w)));
  const own = ws.map((w) => w.filter((x) => !common.includes(x)));
  const tie = (w: string) => wordModel(w, models, texts);
  let variantWords: string[] | null = null;
  if (list.length >= 2 && own.every((o) => o.length === 1)) {
    const vw = own.map((o) => o[0]);
    if (new Set(vw).size === vw.length && vw.every((w) => ALT_WORDS.has(w) || tie(w)))
      variantWords = vw;
  } else if (list.length === 1) {
    const w = ws[0].find((x) => tie(x) && modelKey(tie(x)!) !== chosenKey);
    if (w) variantWords = [w];
  }
  if (!variantWords) return { kind: 'none' };
  list.forEach((o, k) => (o.model = tie(variantWords![k])));
  const key = `notchvar:${args.seed}:${list
    .map((o) => o.key)
    .sort()
    .join('|')}`;
  // the operator's answer: keep that option (or every notch: 'all')
  if (answer === 'all')
    return {
      kind: 'apply',
      drop: new Set(),
      kept: list.map((o) => o.key),
      from: 'operator',
      why: `every labelled notch kept for ${chosen} — the operator's answer`,
      answer,
    };
  if (answer === 'none' || (answer && opts.has(answer))) {
    const drop = new Set(list.map((o) => o.key).filter((k) => k !== answer));
    return {
      kind: 'apply',
      drop,
      kept: answer === 'none' ? [] : [answer],
      from: 'operator',
      why: `${[...drop].map((k) => `«${opts.get(k)!.label}»`).join(', ') || 'nothing'} left out of ${chosen} — the operator's answer${answer === 'none' ? ' (none of them)' : ` (keeps «${opts.get(answer)!.label}»)`}`,
      answer,
    };
  }
  const base = common.join(' ');
  const question =
    list.length >= 2
      ? `which ${base || 'notch'}: ${variantWords.join(' / ')}?`
      : `«${list[0].label}» in ${chosen}?`;
  const hint = list.filter((o) => o.model);
  const mine = hint.filter((o) => modelKey(o.model!) === chosenKey);
  const evidence = [
    `${list.map((o) => `«${o.label}»`).join(' and ')} on one piece — ${list.length >= 2 ? 'alternatives of one notch' : 'a notch named for a variant'}`,
    ...hint.map(
      (o) =>
        `the word «${variantWords![list.indexOf(o)]}» goes with ${o.model} elsewhere on the sheet — one evidence, not applied`,
    ),
  ];
  return {
    kind: 'ask',
    ask: {
      key,
      question,
      model: chosen,
      options: list,
      ...(mine.length === 1 && hint.length === list.length ? { suggested: mine[0].key } : {}),
      evidence,
    },
  };
}
