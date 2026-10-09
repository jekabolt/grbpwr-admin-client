// CONFIDENCE COMBINER (F10, 08-CONTRACT §6). The model is one witness; the client's own reading of
// the sheet is the other, and they weigh the same:
//
//   confidence = 0.5 · model + 0.5 · E,   E = clamp(Σ evidence weights, 0, 1)
//
//   text-synonym   +0.50  printed text inside (near: +0.30) names the same piece (base code, and the
//                         F/B side when the text states one); halved when the model claims a side
//                         the text does not state
//   text-conflict  −0.50  printed text inside names ANOTHER piece, or the opposite side
//   cut-qty        +0.15  the printed quantity equals the model's (and "on fold" agrees)
//   chirality      +0.15  the pair / fold / L-R call agrees with the geometry
//   cut-layout     +0.10  the fabrics are in the BOM and include what the text names (lining…)
//   grammar-ok     +0.10  every identity written passes G11 WITH the dictionary
//   unique         +0.10  no other mark of the variant has this identity
//   unconfirmed    −0.10  per modifier the sheet does not back: a side (F/B) no text states, a hand
//                         (L/R) without a mirrored twin of the other hand, a part number that does
//                         not fit its family's numbering (a lone piece has none; k siblings are 1..k)
//   collides       −0.50  the name/identity equals an existing card piece and NO text backs it
//                         (Codex C10: never bind a confident guess to a card piece by name alone)
//
// AUTO-ACCEPT iff confidence ≥ T AND text backs the base code AND nothing is unconfirmed AND
// grammar-ok AND unique AND no text conflict AND not colliding without text. So the model alone
// never auto-accepts: printed text is required for the base, geometry or text for every modifier
// (the calibration in `patimport:ai` §K shows why — every confidently wrong answer that passed the
// plain weighted sum was a modifier on a right base). Auto rows are flagged (nameOrigin 'ai-auto'),
// never hidden. T: ai/threshold.ts.
import { identitiesOf, identityProblem, sizeTokenTest } from '../manifest/identity';
import { readPieceText } from '../dictionary/synonyms';
import type {
  CombineNamesFn,
  NameDecision,
  NameEvidence,
  PieceSuggestion,
  SomMark,
} from '../types';
import { purposeFromWire } from './wire';

export const W = {
  text: 0.5,
  textNear: 0.3,
  textConflict: -0.5,
  cutQty: 0.15,
  chirality: 0.15,
  cutLayout: 0.1,
  grammar: 0.1,
  unique: 0.1,
  unconfirmed: -0.1,
  collides: -0.5,
} as const;

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/[\s_\-.]+/g, ' ')
    .trim();

const identityOf = (s: Pick<PieceSuggestion, 'code' | 'mods'>) =>
  [s.code, ...s.mods].filter(Boolean).join('_');

const isNumber = (m: string) => /^\d+$/.test(m);
const sideOf = (s: PieceSuggestion) => s.mods.find((m) => m === 'F' || m === 'B') ?? null;
const handOf = (s: PieceSuggestion) =>
  (s.mods.find((m) => m === 'L' || m === 'R') as 'L' | 'R' | undefined) ?? null;

/** The identity without its part number and main mark: the FAMILY a number counts within. */
const familyKey = (s: PieceSuggestion) =>
  [s.code, ...s.mods.filter((m) => !isNumber(m) && m !== '#')].join('_');

/** The fabric word a text names, as a BOM purpose. */
const fabricOfText = (t: string) => {
  const f = readPieceText(t).fabric;
  return f ? purposeFromWire(f) : '';
};

type TextRead = { agree: NameEvidence | null; conflict: NameEvidence | null; sideStated: boolean };

function readTexts(s: PieceSuggestion, m: SomMark): TextRead {
  const words = s.code ? s.code.split('_') : [];
  const side = sideOf(s);
  let conflict: NameEvidence | null = null;
  for (const [texts, w] of [
    [m.textInside, W.text],
    [m.textNear, W.textNear],
  ] as const) {
    for (const t of texts) {
      const r = readPieceText(t);
      if (!r.code) continue;
      const baseOk = words.includes(r.code);
      const sideClash = !!(r.side && side && r.side !== side);
      if (baseOk && !sideClash) {
        // The text names the piece; it backs the model's side only if it states that side.
        const sideStated = !side || r.side === side;
        return {
          agree: { kind: 'text-synonym', text: t, code: r.code, weight: sideStated ? w : w / 2 },
          conflict: null,
          sideStated,
        };
      }
      // Inside text that disagrees is a conflict; a near label may belong to the neighbour.
      if (w === W.text && !conflict)
        conflict = { kind: 'text-conflict', text: t, code: r.code, weight: W.textConflict };
    }
  }
  return { agree: null, conflict, sideStated: false };
}

/** The twin's suggestion when it carries the other hand of the same identity. */
function twinOf(s: PieceSuggestion, m: SomMark, byMark: Map<number, PieceSuggestion>) {
  const hand = handOf(s);
  const twin = m.mirrorTwinMark !== null ? byMark.get(m.mirrorTwinMark) : undefined;
  if (!hand || !twin) return null;
  const other = handOf(twin);
  const rest = (x: PieceSuggestion) =>
    [x.code, ...x.mods.filter((k) => k !== 'L' && k !== 'R')].join('_');
  return other && other !== hand && rest(twin) === rest(s) ? twin : null;
}

function chirality(
  s: PieceSuggestion,
  m: SomMark,
  twin: PieceSuggestion | null,
): NameEvidence | null {
  const hand = handOf(s);
  if (hand) return twin ? { kind: 'chirality', hand, weight: W.chirality } : null;
  if (s.pair)
    // A mirrored pair is a CHIRAL piece: not drawn symmetric, not on the fold.
    return !m.symmetricHint && !m.foldHint && !s.onFold
      ? { kind: 'chirality', hand: null, weight: W.chirality }
      : null;
  // A single piece: symmetric or on the fold, and the fold call matches what the sheet shows.
  if ((m.symmetricHint || m.foldHint) && s.onFold === m.foldHint)
    return { kind: 'chirality', hand: null, weight: W.chirality };
  return null;
}

export const combineNames: CombineNamesFn = (suggestions, marks, ctx) => {
  const isSizeToken = sizeTokenTest(ctx.sizeTokens ?? []);
  const bom = new Set(ctx.bomPurposes ?? []);
  const existing = new Set(ctx.existingPieceNames.map(norm).filter(Boolean));
  const byMark = new Map(suggestions.map((s) => [s.mark, s]));
  const variantOf = (s: PieceSuggestion) =>
    s.variant ?? marks.find((m) => m.mark === s.mark)?.variant ?? null;
  // Peers = named marks of the same variant (a null variant meets every variant).
  const peers = (s: PieceSuggestion) =>
    suggestions.filter(
      (o) =>
        o.code && (variantOf(o) === null || variantOf(s) === null || variantOf(o) === variantOf(s)),
    );

  /** A lone member carries no number; k members are numbered exactly 1..k. */
  const numberingOk = (s: PieceSuggestion) => {
    const fam = peers(s).filter((o) => familyKey(o) === familyKey(s));
    const nums = fam.map((o) => o.mods.find(isNumber));
    if (fam.length === 1) return nums[0] === undefined;
    if (nums.some((n) => n === undefined)) return false;
    const set = new Set(nums.map(Number));
    return set.size === fam.length && [...set].every((n) => n >= 1 && n <= fam.length);
  };

  return marks.map((m): NameDecision => {
    const s = byMark.get(m.mark) ?? null;
    if (!s || !s.code) {
      // No code (refused by the server, or the mark went unnamed): nothing to be confident in.
      return {
        seed: m.seed,
        suggestion: s,
        source: 'ai',
        evidence: [],
        confidence: 0,
        autoAccepted: false,
        code: '',
        mods: [],
        displayName: s?.displayName ?? '',
      };
    }
    const ev: NameEvidence[] = [];
    const identity = identityOf(s);
    const { agree, conflict, sideStated } = readTexts(s, m);
    if (agree) ev.push(agree);
    if (conflict) ev.push(conflict);

    if (m.cutQtyHint !== null && s.cutQty !== null && m.cutQtyHint === s.cutQty) {
      const foldSaid = /fold|bruch|сгиб|pli|zgi|doblez|vouw/iu.test(m.quantityText);
      if (!foldSaid || s.onFold) ev.push({ kind: 'cut-qty', qty: s.cutQty, weight: W.cutQty });
    }
    const twin = twinOf(s, m, byMark);
    const ch = chirality(s, m, twin);
    if (ch) ev.push(ch);

    if (s.fabrics.length && bom.size && s.fabrics.every((f) => bom.has(f))) {
      const said = [...m.textInside, ...m.textNear].map(fabricOfText).find(Boolean);
      if (!said || s.fabrics.includes(said))
        ev.push({ kind: 'cut-layout', fabric: s.fabrics[0], weight: W.cutLayout });
    }

    // Every identity the writer will spell. A model `pair` → both hands; an L/R twin confirmed by
    // geometry IS a pair (owner decision 9), so `FP_L` on a run with size L passes as its declared
    // hand exactly as G11 will once the wizard declares it.
    const written = s.pair
      ? identitiesOf(s.code, s.mods, 'L')
      : twin
        ? [{ identity, pairHand: handOf(s), pairOf: identityOf(twin) }]
        : [{ identity, pairHand: null, pairOf: null }];
    const grammarOk = written.every(
      (w) =>
        !identityProblem(w.identity, {
          isSizeToken,
          pair: { hand: w.pairHand, of: w.pairOf },
          isKnownCode: ctx.isKnownCode,
        }),
    );
    if (grammarOk) ev.push({ kind: 'grammar-ok', weight: W.grammar });
    const unique = !peers(s).some((o) => o !== s && identityOf(o) === identity);
    if (unique) ev.push({ kind: 'unique', weight: W.unique });

    const unconfirmed: ('side' | 'hand' | 'number')[] = [];
    if (sideOf(s) && !sideStated) unconfirmed.push('side');
    if (handOf(s) && !twin) unconfirmed.push('hand');
    if (!numberingOk(s)) unconfirmed.push('number');
    for (const part of unconfirmed) ev.push({ kind: 'unconfirmed', part, weight: W.unconfirmed });

    const hit = [identity, s.displayName].map(norm).find((n) => n && existing.has(n));
    if (hit) ev.push({ kind: 'collides-existing', name: hit, weight: agree ? 0 : W.collides });

    const e = Math.min(
      1,
      Math.max(
        0,
        ev.reduce((a, x) => a + x.weight, 0),
      ),
    );
    const confidence = 0.5 * s.modelConfidence + 0.5 * e;
    const autoAccepted =
      confidence >= ctx.threshold &&
      !!agree &&
      unconfirmed.length === 0 &&
      grammarOk &&
      unique &&
      !conflict &&
      !(hit && !agree);
    return {
      seed: m.seed,
      suggestion: s,
      source: 'ai',
      evidence: ev,
      confidence,
      autoAccepted,
      code: s.code,
      mods: s.mods,
      displayName: s.displayName,
    };
  });
};
