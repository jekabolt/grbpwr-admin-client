// proposeSizeMap — source size run → the card's size run (owner decision 6: sizes are mapped to
// the card BEFORE block names are written; the gate refuses an exported size without a card id).
//
// A card size is known by its token (`CardSize.token`, the dictionary code: XS) and by whatever
// else its dictionary name spells — `xs_44ta_m` carries the numeric equivalent 44 (the card's own
// `sizeTokensOf` in components/.../block-code.ts reads it that way). lib/ may not import
// components/, so that reader is INJECTED (`createProposeSizeMap({ tokensOf })`); the default
// reads the same two parts off `CardSize.name` / `token`.
//
// Matching, strongest first (confidence; < 0.9 = the wizard asks the operator to confirm):
//   1.00  same token, spelled the same            M ↔ M, 44 ↔ 44, 3-4Y ↔ 3-4Y, 4/6 ↔ 4-6
//         (a separator between digits counts: 4/6 is never 46, 2-4 never 24 — `sizeKey`)
//   0.95  same letter size, another spelling      2XL ↔ XXL, XXXL ↔ 3XL
//   0.90  the source number is the card size's numeric equivalent   44 ↔ XS (xs_44ta_m)
//   0.60  Burda tall/short size of a numeric card size              72 ↔ 36, 18 ↔ 36
//   0.30  nothing spells alike and both runs have the same length → aligned by rank — only when
//         the sizes are of one kind (owner rule Ф6: a paired 0/2 … 28/30 run, a numeric run on a
//         letter card or a letter run on a numeric card is never ordered onto it — a question)
//   0.50  the source draws ONE size it names ("SIZE 38") and the card has a run without it → the
//         card's middle size is suggested (A6 smoke: 38 on an S/M/L card → M); a suggestion the
//         operator confirms with one click, never accepted silently (D3: the map is a decision)
// Each card size takes at most one source size. Whatever does not match is EXPLICITLY unmapped
// (card null + why) — never dropped silently, never guessed onto a neighbour.

import type { CardSize, ProposeSizeMapFn, SizeMap, SizeMapEntry, SizeRun } from '../types';
import { parseSizeToken } from './tokens';

export type SizeTokensOf = (card: CardSize) => string[];

// a separator BETWEEN TWO DIGITS is part of the size (marked while the rest is stripped)
const DIGIT_SEP = /(\p{N})[^\p{L}\p{N}]+(?=\p{N})/gu;
const MARK = '\uE000';

/**
 * Comparison key of a size spelling: case and decoration dropped («<M>» ≡ «m», «2XL» ≡ «2xl»), but
 * a separator between two digits is kept as «/» — a paired size is never the single size its digits
 * concatenate to: «4/6» ≡ «4-6» ≡ «4 – 6», but «4/6» ≠ «46», «2-4» ≠ «24», «10/12» ≠ «1012»,
 * «00-0» ≠ «000», «36.5» ≠ «365», «3-4Y» ≠ «34Y» (archive run 13.10: «4/6» went onto the card's
 * 46 as «same token»).
 */
export const sizeKey = (s: string) =>
  s
    .toLowerCase()
    .replace(DIGIT_SEP, `$1${MARK}`)
    .replace(/[^\p{L}\p{N}\uE000]+/gu, '')
    .replace(/\uE000/g, '/');

/** The words of a display name, a digit pair («4/6», «36.5») kept as one word. */
const nameWords = (name: string) =>
  name
    .replace(DIGIT_SEP, `$1${MARK}`)
    .split(/[^\p{L}\p{N}\uE000]+/u)
    .map((w) => w.replace(/\uE000/g, '/'));

/** The token a card size is written with in block names (manifest `sizes[].token`). */
export function sizeTokenOf(card: CardSize): string {
  return card.token.trim().toUpperCase();
}

/**
 * Default reader of a card size's spellings: its token plus the parts of its dictionary name — the
 * same split the card's `sizeTokensOf` makes on `xs_44ta_m` (code, digits of the second part), or
 * the size-like words of a display name ("XS [44]").
 */
export const defaultTokensOf: SizeTokensOf = (card) => {
  const out = [card.token];
  const name = (card.name ?? '').trim().toLowerCase();
  const m = /^([a-z0-9]+)_([a-z0-9]+)/.exec(name);
  if (m) {
    out.push(m[1]);
    const digits = m[2].match(/\d+/)?.[0];
    if (digits) out.push(digits);
  } else {
    for (const w of nameWords(name)) if (w && parseSizeToken(w, true)) out.push(w);
  }
  return [...new Set(out.filter(Boolean))];
};

type Hit = { card: CardSize; confidence: number; why: string };

const paired = (l: string) => /^\d+\s*[/\-–]\s*\d+$/.test(l.trim());

function bestHit(
  label: string,
  card: readonly CardSize[],
  tokensOf: SizeTokensOf,
  usRun = false,
): Hit | null {
  const src = parseSizeToken(label);
  let best: Hit | null = null;
  const take = (h: Hit) => {
    if (!best || h.confidence > best.confidence) best = h;
  };
  // owner rule (MOOD-DIAG Ф6): a numeric sheet size of the US misses' range (00 … 32, paired)
  // onto a LETTER card size is never automatic, whatever spelling the card carries — the sheet
  // does not say which letter its number is
  const usNum = usRun || (src?.kind === 'num' && src.value <= 32);
  for (const c of card) {
    const toks = tokensOf(c);
    const letterCard = parseSizeToken(c.token, true)?.kind === 'letter';
    for (const t of toks) {
      // same spelling: the key keeps a digit pair apart from its concatenation, so a paired sheet
      // size meets only a card spelling of the same pair («4/6» ↔ «4-6», never «46»)
      if (sizeKey(t) === sizeKey(label) && paired(t) === paired(label))
        take(
          sizeKey(t) === sizeKey(c.token)
            ? { card: c, confidence: 1, why: `same token ${c.token}` }
            : usNum && letterCard
              ? {
                  card: c,
                  confidence: 0.6,
                  why: `${label} is written ${t} on the card's ${c.token}: a US size onto a letter size — confirm`,
                }
              : {
                  card: c,
                  confidence: 0.9,
                  why: `${label} is how the card's ${c.token} is also written (${t})`,
                },
        );
      const ct = parseSizeToken(t, true);
      if (!src || !ct) continue;
      if (src.kind === 'letter' && ct.kind === 'letter' && src.value === ct.value)
        take({ card: c, confidence: 0.95, why: `${label} is ${c.token} spelled differently` });
      if (
        src.kind === 'num' &&
        ct.kind === 'num' &&
        src.value === ct.value &&
        sizeKey(t) !== sizeKey(c.token) &&
        // a paired size (28/30) is not its lower half (28)
        paired(label) === paired(t) &&
        !!src.paired === !!ct.paired
      ) {
        // a US size (00 … 32, paired sizes) onto a LETTER card size: the sheet does not say
        // which letter its numbers are (MOOD-DIAG Ф6) — a suggestion, never taken silently
        take({
          card: c,
          confidence: usNum && letterCard ? 0.6 : 0.9,
          why:
            usNum && letterCard
              ? `${label} is written ${t} on the card's ${c.token}: a US size onto a letter size — confirm`
              : `${label} is the numeric equivalent of ${c.token} (${t})`,
        });
      }
    }
  }
  return best;
}

/** Burda tall (Langgrößen 72–110 = 2 × normal) and short (Kurzgrößen 17–25 = normal / 2) sizes. */
function tallShortHit(
  label: string,
  run: SizeRun,
  card: readonly CardSize[],
  tokensOf: SizeTokensOf,
): Hit | null {
  const v = parseSizeToken(label);
  if (!v || v.kind !== 'num' || v.paired) return null;
  // a paired run (0/2 · 4/6 …) is no tall/short run: its numbers are pairs, not one size each
  if (run.sizes.some((s) => parseSizeToken(s.label)?.paired)) return null;
  const nums = run.sizes
    .map((s) => parseSizeToken(s.label))
    .filter((t) => t?.kind === 'num')
    .map((t) => t!.value);
  if (nums.length !== run.sizes.length) return null;
  const steps = nums.slice(1).map((x, i) => x - nums[i]);
  const tall = nums.every((x) => x >= 64 && x <= 120 && x % 4 === 0) && steps.every((s) => s === 4);
  const short = nums.every((x) => x >= 15 && x <= 28) && steps.every((s) => s === 1);
  if (!tall && !short) return null;
  const want = tall ? v.value / 2 : v.value * 2;
  for (const c of card)
    for (const t of tokensOf(c)) {
      const ct = parseSizeToken(t, true);
      if (ct?.kind === 'num' && ct.value === want)
        return {
          card: c,
          confidence: 0.6,
          why: `${tall ? 'tall' : 'short'} size ${label} = ${want} ${tall ? 'for tall figures' : 'for short figures'} → ${c.token}`,
        };
    }
  return null;
}

export function createProposeSizeMap(opts: { tokensOf?: SizeTokensOf } = {}): ProposeSizeMapFn {
  const tokensOf = opts.tokensOf ?? defaultTokensOf;
  return (run: SizeRun, card: CardSize[]): SizeMap => {
    const cards = [...card].sort((a, b) => a.rank - b.rank);
    // US misses' sizes (00 … 32, or paired 0/2 · 00-0 …): their letter equivalents are not the
    // sheet's to say
    const usRun = run.sizes.some((s) => /^0{2,}$/.test(s.label.trim()) || paired(s.label));
    const hits: (Hit | null)[] = run.sizes.map(
      (s) =>
        bestHit(s.label, cards, tokensOf, usRun) ?? tallShortHit(s.label, run, cards, tokensOf),
    );
    // nothing spells alike at all: align by rank only when both runs have the same length and
    // the same size kind (Ф6)
    if (
      hits.every((h) => !h) &&
      run.sizes.length === cards.length &&
      cards.length > 0 &&
      ordinalTargets(run.sizes, cards).length === cards.length
    ) {
      const src = [...run.sizes].sort((a, b) => a.rank - b.rank);
      src.forEach((s, i) => {
        const k = run.sizes.indexOf(s);
        hits[k] = {
          card: cards[i],
          confidence: 0.3,
          why: `no card size spells ${s.label}; same run length → aligned by rank (confirm)`,
        };
      });
    }
    // one named size, no card size spells it: the card's middle size, as a suggestion
    const only = run.sizes.length === 1 ? run.sizes[0].label.trim() : '';
    if (only && !hits[0] && cards.length >= 2) {
      const mid = cards[Math.floor((cards.length - 1) / 2)];
      hits[0] = {
        card: mid,
        confidence: 0.5,
        why: `the sheet draws one size, ${only}; the card has no ${only} — its middle size ${mid.token} is suggested (confirm or change)`,
      };
    }
    // one source per card size: the stronger claim wins, the other is explicit
    const owner = new Map<number, number>();
    hits.forEach((h, i) => {
      if (!h) return;
      const j = owner.get(h.card.sizeId);
      if (j == null || h.confidence > hits[j]!.confidence) owner.set(h.card.sizeId, i);
    });
    const entries: SizeMapEntry[] = run.sizes.map((s, i) => {
      const h = hits[i];
      if (h && owner.get(h.card.sizeId) === i)
        return {
          source: s,
          card: h.card,
          origin: 'auto',
          confidence: h.confidence,
          evidence: [h.why],
        };
      if (h)
        return {
          source: s,
          card: null,
          origin: 'auto',
          confidence: 0,
          evidence: [
            `${h.card.token} is taken by ${run.sizes[owner.get(h.card.sizeId)!].label} — not exported unless mapped`,
          ],
        };
      return {
        source: s,
        card: null,
        origin: 'auto',
        confidence: 0,
        evidence: [`the card has no size ${s.label} — not exported unless mapped`],
      };
    });
    const used = new Set(entries.flatMap((e) => (e.card ? [e.card.sizeId] : [])));
    return { entries, unmapped: cards.filter((c) => !used.has(c.sizeId)) };
  };
}

/** The default mapper (token + dictionary-name spellings). */
export const proposeSizeMap: ProposeSizeMapFn = createProposeSizeMap();

/** Operator answers replace auto rows by source rank (origin 'operator', confidence 1). */
export function applyOperatorMap(
  map: SizeMap,
  operator: readonly SizeMapEntry[],
  card: CardSize[],
): SizeMap {
  const byRank = new Map(operator.map((e) => [e.source.rank, e]));
  const entries = map.entries.map((e) => {
    const o = byRank.get(e.source.rank);
    return o
      ? { ...o, origin: 'operator' as const, confidence: 1, evidence: ['set by the operator'] }
      : e;
  });
  // the operator may move a card size: a card size keeps only its last claimant
  const seen = new Set<number>();
  for (let i = entries.length - 1; i >= 0; i--) {
    const c = entries[i].card;
    if (!c) continue;
    if (seen.has(c.sizeId) && entries[i].origin !== 'operator')
      entries[i] = {
        ...entries[i],
        card: null,
        confidence: 0,
        evidence: [`${c.token} was given to another size`],
      };
    seen.add(c.sizeId);
  }
  const used = new Set(entries.flatMap((e) => (e.card ? [e.card.sizeId] : [])));
  return { entries, unmapped: card.filter((c) => !used.has(c.sizeId)) };
}

/** Rows the operator must look at: auto rows below 0.9, and every unmapped source size. */
export const needsConfirmation = (map: SizeMap) =>
  map.entries.filter((e) => e.origin === 'auto' && (e.card == null || (e.confidence ?? 0) < 0.9));

/** The one line the sizes and pieces steps show for a size the sheet does not draw. */
export const notDrawnLine = (label: string) =>
  `size ${label || '(no label)'} isn't drawn on this sheet — it will not be written`;

/**
 * Source sizes the sheet lists but draws no line of its own for (`WallModel.emptyRanks`) are left
 * out of the export: card null, `notDrawn` with the card size they would have taken. Applied after
 * the operator's answers too — an undrawn size is never filled from a neighbour's outline.
 */
export function markNotDrawn(map: SizeMap, ranks: readonly number[], card: CardSize[]): SizeMap {
  if (!ranks.length) return map;
  // the operator's "this size is drawn" stands
  const out = new Set(
    ranks.filter((r) => !map.entries.some((e) => e.source.rank === r && e.drawnAnyway)),
  );
  if (!out.size) return map;
  const entries = map.entries.map((e): SizeMapEntry => {
    if (!out.has(e.source.rank)) return e;
    return {
      ...e,
      card: null,
      notDrawn: { wouldMap: e.notDrawn?.wouldMap ?? e.card },
      evidence: [notDrawnLine(e.source.label)],
    };
  });
  const used = new Set(entries.flatMap((e) => (e.card ? [e.card.sizeId] : [])));
  return { entries, unmapped: card.filter((c) => !used.has(c.sizeId)) };
}

/**
 * Drawn source sizes the AUTOMATIC map left off the card (no card size spells them, or the card
 * size went to another source): not the operator's "not exported", not a size the sheet lists but
 * does not draw. A map that writes some sizes and leaves these out exports fewer sizes than the
 * sheet draws (archive run 13.10: Mimosa wrote 1 size of 8) — never without it being said.
 */
export const drawnUnmapped = (map: SizeMap) =>
  map.entries.filter((e) => e.origin === 'auto' && !e.card && !e.notDrawn);

/**
 * The partial map the sizes step refuses to move on (D3): some drawn sizes reach the card, others
 * do not, and the card still has sizes with no source — the missing sizes may be theirs, the sheet
 * does not prove they are not. null when nothing is open. (Card full: the left-out sizes are past
 * the card's run — said, not asked: `drawnUnmappedLine`.)
 */
export function partialSizeMapQuestion(map: SizeMap): string | null {
  const loose = drawnUnmapped(map);
  if (!loose.length || !map.entries.some((e) => e.card) || !map.unmapped.length) return null;
  return `${drawnUnmappedLine(loose)} while the card's ${list(map.unmapped.map((c) => c.token))} ${map.unmapped.length === 1 ? 'has' : 'have'} no source — map each to its card size or leave it out`;
}

const list = (xs: readonly string[], n = 6) =>
  xs.length > n ? `${xs.slice(0, n).join(', ')} … (+${xs.length - n})` : xs.join(', ');

/** "2 drawn sizes not mapped to the card (2/4, 6/8)". */
export const drawnUnmappedLine = (loose: readonly SizeMapEntry[]) =>
  `${loose.length} drawn ${loose.length === 1 ? 'size' : 'sizes'} not mapped to the card (${list(
    loose.map((e) => e.source.label || `rank ${e.source.rank + 1}`),
  )})`;

export type SizeKind = 'letter' | 'num' | 'paired';

/** The kind of a sheet size as printed: letter, plain number, or a pair («4/6»); null = no size. */
export function sizeKindOf(label: string): SizeKind | null {
  const t = parseSizeToken(label);
  if (t) return t.paired ? 'paired' : t.kind;
  // the DXF reader's wider grammar (segment.ts): a decimal size «36,5», an extended letter size
  // «XXXXS» / «XXXXXL»
  const u = label.trim().toUpperCase();
  if (/^\d{1,3}[.,]\d$/.test(u)) return 'num';
  if (/^\d{1,3}\s*[/\-–]\s*\d{1,3}$/.test(u)) return 'paired';
  // every letter spelling the DXF reader ranks: M, S/L with X-runs or a count («4XS», «XXXXXL»)
  if (/^(?:\d?X*[SL]|M)$/.test(u)) return 'letter';
  return null;
}

/** The kind of a card size: its token first, then its other spellings. */
export function cardSizeKindOf(c: CardSize): SizeKind | null {
  for (const t of [c.token, ...(c.spellings ?? [])]) {
    const k = sizeKindOf(t);
    if (k) return k;
  }
  return null;
}

/**
 * Owner rule Ф6 (MOOD-DIAG): a run with no spelled match is ordered onto the card only within one
 * size kind. The card sizes an order-based map may use — those of the sheet run's kind (all of
 * them when the sheet's sizes carry no readable label) — and [] when the kinds disagree: a paired
 * run on a card without paired sizes, numbers on letters, letters on numbers, a run of mixed kinds.
 */
export function ordinalTargets(
  sizes: readonly { label: string }[],
  cards: readonly CardSize[],
): CardSize[] {
  const kinds = new Set(sizes.map((s) => sizeKindOf(s.label)).filter((k) => k != null));
  if (!kinds.size) return [...cards];
  if (kinds.size > 1) return [];
  const [k] = [...kinds];
  return cards.filter((c) => cardSizeKindOf(c) === k);
}

const span = (xs: readonly string[]) =>
  xs.length <= 2 ? xs.join(', ') : `${xs[0]}…${xs[xs.length - 1]}`;

/**
 * Nothing on the sheet spells a card size and the kinds disagree (Ф6): the question the sizes step
 * stops on — never an order-based map. null when a size reaches the card, or the kinds agree.
 */
export function crossKindQuestion(map: SizeMap, card: readonly CardSize[]): string | null {
  if (!map.entries.length || map.entries.some((e) => e.card) || !card.length) return null;
  const src = [...map.entries].sort((a, b) => a.source.rank - b.source.rank).map((e) => e.source);
  const cards = [...card].sort((a, b) => a.rank - b.rank);
  if (ordinalTargets(src, cards).length) return null;
  return `the sheet's sizes ${span(src.map((s) => s.label || '(no label)'))} have no spelled match on the card's ${span(cards.map((c) => c.token))} — map each size`;
}
