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
//   1.00  same token, spelled the same            M ↔ M, 44 ↔ 44, 3-4Y ↔ 3-4Y
//   0.95  same letter size, another spelling      2XL ↔ XXL, XXXL ↔ 3XL
//   0.90  the source number is the card size's numeric equivalent   44 ↔ XS (xs_44ta_m)
//   0.60  Burda tall/short size of a numeric card size              72 ↔ 36, 18 ↔ 36
//   0.30  nothing spells alike and both runs have the same length → aligned by rank
// Each card size takes at most one source size. Whatever does not match is EXPLICITLY unmapped
// (card null + why) — never dropped silently, never guessed onto a neighbour.

import type { CardSize, ProposeSizeMapFn, SizeMap, SizeMapEntry, SizeRun } from '../types';
import { parseSizeToken } from './tokens';

export type SizeTokensOf = (card: CardSize) => string[];

const bare = (s: string) => s.replace(/[^\p{L}\p{N}]+/gu, '').toLowerCase();

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
    for (const w of name.split(/[^\p{L}\p{N}]+/u)) if (w && parseSizeToken(w, true)) out.push(w);
  }
  return [...new Set(out.filter(Boolean))];
};

type Hit = { card: CardSize; confidence: number; why: string };

function bestHit(label: string, card: readonly CardSize[], tokensOf: SizeTokensOf): Hit | null {
  const src = parseSizeToken(label);
  let best: Hit | null = null;
  const take = (h: Hit) => {
    if (!best || h.confidence > best.confidence) best = h;
  };
  for (const c of card) {
    const toks = tokensOf(c);
    for (const t of toks) {
      if (bare(t) === bare(label))
        take(
          bare(t) === bare(c.token)
            ? { card: c, confidence: 1, why: `same token ${c.token}` }
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
        bare(t) !== bare(c.token)
      )
        take({
          card: c,
          confidence: 0.9,
          why: `${label} is the numeric equivalent of ${c.token} (${t})`,
        });
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
  if (!v || v.kind !== 'num') return null;
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
    const hits: (Hit | null)[] = run.sizes.map(
      (s) => bestHit(s.label, cards, tokensOf) ?? tallShortHit(s.label, run, cards, tokensOf),
    );
    // nothing spells alike at all: align by rank only when both runs have the same length
    if (hits.every((h) => !h) && run.sizes.length === cards.length && cards.length > 0) {
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
