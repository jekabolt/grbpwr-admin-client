// BACK-VARIANT (owner 19.10, kombinezon Style A P03 «High back notch» + «Low back notch»): a notch
// whose printed label names a model variant belongs to that variant. The chosen model keeps its
// own and drops the other's. Universal, not one garment:
//
//   • the label NAMES a model («Style A notch», «View 2 notch», «Mod. 125»): that notch is that
//     model's — proven by two evidences (D3): the printed label names the model, and the label is
//     bound to the notch (it carries a notch word, it is the nearest such label, none other as near).
//     The chosen model keeps it, any other model's is dropped (recorded, D5) — only when the label
//     binds exactly one notch in every size; a label on more notches is asked (a shared notch is
//     never dropped silently). Alternatives among the remaining labels are asked as below;
//   • the labels of one piece are ALTERNATIVES — two or more labels the same but for one word
//     («High back notch» / «Low back notch», «long / short sleeve notch»: an alternative's word, or
//     words the sheet ties to two different models — «front» / «back» is an ordinary pair), or one
//     label whose alternative's word the sheet ties to another model: the word is ONE evidence at
//     most (a sheet line such as «Cutting line Style A - High Waisted» shares the word, it never
//     says which notch is whose),
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
  const all = [...opts.values()];
  // a label that names a model by itself («Style B notch»)
  for (const o of all) o.model = namedModel(o.label, models);
  const named = all.filter((o) => o.model);
  // 1 · proven only when every left-out option is exactly one notch in every size (the label bound
  //     to one notch); a label reaching more notches is asked — never a silent drop of a shared notch
  const oneEach = (o: NotchVariantOption) =>
    o.perSize.length === read.sizes.length && o.perSize.every((p) => p.at.length === 1);
  const namedOut = named.filter((o) => modelKey(o.model!) !== chosenKey);
  const proven = new Set<string>();
  let namedAsk: NotchVariantOption[] = [];
  if (namedOut.length) {
    if (namedOut.every(oneEach)) namedOut.forEach((o) => proven.add(o.key));
    else namedAsk = named;
  }
  // 2 · alternatives among the labels left: alike but for one word each, those words an
  //     alternative's (high / low…), or each tied by the sheet to a model, ≥ 2 different models
  //     («front» / «back» tied to one model only is an ordinary pair, not a variant)
  const rest = all.filter((o) => !o.model);
  const tie = (w: string) => wordModel(w, models, texts);
  let alt: { list: NotchVariantOption[]; words: string[]; base: string } | null = null;
  if (rest.length >= 2) {
    const ws = rest.map((o) => words(o.key));
    const common = ws.reduce((a, b) => a.filter((w) => b.includes(w)));
    const own = ws.map((w) => w.filter((x) => !common.includes(x)));
    if (own.every((o) => o.length === 1)) {
      const vw = own.map((o) => o[0]);
      const ties = vw.map(tie);
      const distinct = new Set(ties.filter(Boolean).map((m) => modelKey(m!))).size;
      const ok =
        new Set(vw).size === vw.length &&
        ((ties.every(Boolean) && distinct >= 2) || vw.every((w) => ALT_WORDS.has(w)));
      if (ok) alt = { list: rest, words: vw, base: common.join(' ') };
    }
  } else if (rest.length === 1) {
    // a lone label: only an alternative's word the sheet ties to another model («Low back notch»)
    const w = words(rest[0].key).find(
      (x) => ALT_WORDS.has(x) && tie(x) && modelKey(tie(x)!) !== chosenKey,
    );
    if (w) alt = { list: rest, words: [w], base: '' };
  }
  if (alt) alt.list.forEach((o, k) => (o.model = tie(alt!.words[k])));
  const list = [...namedAsk, ...(alt?.list ?? [])];
  const labelsOf = (ks: Iterable<string>) =>
    [...ks].map((k) => `«${opts.get(k)!.label}»`).join(', ');
  if (!list.length) {
    if (!proven.size) return { kind: 'none' };
    return {
      kind: 'apply',
      drop: proven,
      kept: named.filter((o) => !proven.has(o.key)).map((o) => o.key),
      from: 'label',
      why: `${labelsOf(proven)} named for ${[...new Set(namedOut.map((o) => o.model))].join(
        ', ',
      )} on the sheet — left out of ${chosen} (the label names the model and is the notch's own)`,
    };
  }
  const key = `notchvar:${args.seed}:${list
    .map((o) => o.key)
    .sort()
    .join('|')}`;
  const provenWhy = proven.size ? ` · ${labelsOf(proven)} named for another model` : '';
  // the operator's answer: keep that option (or every asked one: 'all'; none of them: 'none')
  if (answer === 'all')
    return {
      kind: 'apply',
      drop: proven,
      kept: list.map((o) => o.key),
      from: 'operator',
      why: `every labelled notch kept for ${chosen} — the operator's answer${provenWhy}`,
      answer,
    };
  if (answer === 'none' || (answer && list.some((o) => o.key === answer))) {
    const out = list.map((o) => o.key).filter((k) => k !== answer);
    const drop = new Set([...proven, ...out]);
    return {
      kind: 'apply',
      drop,
      kept: answer === 'none' ? [] : [answer],
      from: 'operator',
      why: `${labelsOf(out) || 'nothing'} left out of ${chosen} — the operator's answer${answer === 'none' ? ' (none of them)' : ` (keeps «${opts.get(answer)!.label}»)`}${provenWhy}`,
      answer,
    };
  }
  const question =
    list.length >= 2
      ? namedAsk.length || !alt
        ? `which notch: ${list.map((o) => o.key).join(' / ')}?`
        : `which ${alt.base || 'notch'}: ${alt.words.join(' / ')}?`
      : `«${list[0].label}» in ${chosen}?`;
  const hint = list.filter((o) => o.model);
  const mine = hint.filter((o) => modelKey(o.model!) === chosenKey);
  const evidence = [
    `${list.map((o) => `«${o.label}»`).join(' and ')} on one piece — ${list.length >= 2 ? 'alternatives of one notch' : 'a notch named for a variant'}`,
    ...namedAsk.map(
      (o) => `«${o.label}» names ${o.model} but reaches more than one notch in a size — asked`,
    ),
    ...(alt?.list ?? [])
      .filter((o) => o.model)
      .map(
        (o) =>
          `the word «${alt!.words[alt!.list.indexOf(o)]}» goes with ${o.model} elsewhere on the sheet — one evidence, not applied`,
      ),
  ];
  return {
    kind: 'ask',
    ask: {
      key,
      question,
      model: chosen,
      options: list,
      ...(list.length >= 2 && mine.length === 1 && hint.length === list.length
        ? { suggested: mine[0].key }
        : {}),
      evidence,
    },
  };
}
