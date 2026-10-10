// Piece identity = CODE(_MOD)* (manifest/identity.ts is THE grammar; G11 runs the same function).
//
// Where a name comes from, strongest first:
//   1. `pieceOverrides[seed]` — the operator's or the AI's answer (code, mods, displayName,
//      nameOrigin incl. 'ai-auto', aiConfidence) — taken as given, only CHECKED;
//   2. the DXF block identity (F8 `dxf.identity`: block name minus size / AAMA PIECE NAME) —
//      upper-cased, the author's `UNI` token read as "ungraded" and removed, modifiers put in
//      grammar order (R/L → F/B → n → #), a trailing size token of the run removed;
//   3. printed text inside the piece (`dictionary/ readPieceText`: EN/DE/RU/FR/NL/PL/ES/DA) → code
//      + F/B; a lining label makes the code `LIN_<code>` (K1: lining names differ from the shell's).
// Size tokens are NEVER part of an identity: the card reads the last token as the size (FP_L vs L)
// unless it is the declared hand of a pair.

import { codeName, isKnownCode, readPieceText } from '../dictionary';
import {
  codeWordsOf,
  identityGrammarProblem,
  identityProblem,
  modStage,
} from '../manifest/identity';
import type { PairHand, PieceSpec } from '../types';

export type NameReading = {
  code: string;
  /** Modifiers WITHOUT the hand (the hand is `hand`). */
  mods: string[];
  /** L/R written in the name (`FP_L`): a drawn hand. */
  hand: PairHand | null;
  displayName: string;
  nameOrigin: PieceSpec['nameOrigin'];
  aiConfidence?: number;
  /** The source declared the piece ungraded (`PCK_L_UNI`). */
  uni: boolean;
  notes: string[];
  /**
   * D3: the code was read from sheet text that is NOT the piece's title label (a construction note:
   * «Tascheneingriff», «Besatz Umbruch», «rückwärtige Mitte») — a suggestion the operator confirms.
   * The quoted text; absent = the name is proven (title label, DXF block, operator, AI path).
   */
  fromNote?: string;
};

/**
 * Construction notes — text that NAMES a piece word but says where something goes on THIS piece:
 * an opening, a fold-over line, a centre line, a notch, a placement. A pocket opening printed on
 * the front is not the name of the front. "On fold" itself is a cut instruction a title may carry
 * («Спинка со сгибом»), so it makes no note. Matched anywhere in a word (Tascheneingriff).
 */
const NOTE =
  /eingriff|umbruch|knips|linie|markier|ansatz|ansetz|mitte\b|kante\b|naht|stepp|knopf|abnäher|abnaher|fadenlauf|zeichen|schlitz|öffnung|offnung|opening|\bnotch|\bline\b|\blines\b|\bmark|placement|\bplace\b|position|attach|stitch|\bcent(?:re|er)[\s-]+(?:back|front)\b|\bedge\b|\blevel\b|buttonhole|\bdart|\bpleat|\bgather|\bmatch|ouverture|repère|repere|\bligne|milieu|вход|лини|середин|надсеч|метк|отметк|уровен|петл|вытачк|складк|нитк|(?<!\p{L})край|(?<!\p{L})шов|строчк|разрез|притачив|настрач|wejści|\blinia|środek|srodek|abertura|línea|linea\b|centro\s+(?:espalda|delantero)/iu;

/** A title is short: a name, maybe a number and a quantity, not a sentence. */
const TITLE_MAX_WORDS = 6;

type LabelText = { text: string; fontSizeMm: number; bbox: BoxLike };

/** A word-carrying text: two letters at least (a lone «X» of "2 X" is a quantity mark). */
const lettered = (t: { text: string }) => (t.text.match(/\p{L}/gu)?.length ?? 0) >= 2;

/**
 * The lines one note is printed in: texts of the same size stacked within 1.6 line heights and
 * overlapping in x, joined transitively. «ЗАДНЯЯ» over «СЕРЕДИНА СГИБ» is ONE note (centre back
 * fold), not a title «back».
 */
export function textBlockOf<T extends LabelText>(t: T, inside: readonly T[]): T[] {
  const near = (a: T, b: T) => {
    const f = Math.max(a.fontSizeMm, b.fontSizeMm);
    if (Math.abs(a.fontSizeMm - b.fontSizeMm) > 0.15 * f) return false;
    const gapY = Math.max(
      0,
      Math.max(a.bbox.minY, b.bbox.minY) - Math.min(a.bbox.maxY, b.bbox.maxY),
    );
    const gapX = Math.max(
      0,
      Math.max(a.bbox.minX, b.bbox.minX) - Math.min(a.bbox.maxX, b.bbox.maxX),
    );
    return gapY <= 1.6 * f && gapX <= f;
  };
  const block = [t];
  for (let i = 0; i < block.length; i++)
    for (const x of inside) if (!block.includes(x) && near(block[i], x)) block.push(x);
  return block;
}

/** A facing word and a fold word on one label: the facing's fold-over line, not a facing piece. */
const FACING_FOLD =
  /(?:facing|besatz|beleg|parement|обтачк|подборт)[\s\S]*(?:fold|umbruch|bruch|сгиб|pliure|vouw|ombuk)/iu;

/**
 * Is `t` the piece's TITLE label (D3)? The most prominent text naming a piece, and no
 * construction note:
 *   · it names a piece (dictionary) and no line printed with it carries a note word;
 *   · it is short (≤ 6 words a line; a multilingual title stacks several short lines);
 *   · no other plain text of comparable size inside names ANOTHER piece (a front printed with
 *     «Besatz» and «Taschenbeutel» has no title among them);
 *   · among the texts that name a piece it is the largest (font within 85 %) or the most central.
 *     Text naming no piece (the pattern's own name, page numbers) does not compete.
 */
export function isTitleLabel<T extends LabelText>(
  t: T,
  inside: readonly T[],
  piece: BoxLike,
): boolean {
  const code = readPieceText(t.text).code;
  if (!code) return false;
  const noteFree = (x: T) => {
    const all = [...new Set(textBlockOf(x, inside).map((y) => y.text))].join(' ');
    return !NOTE.test(all) && !FACING_FOLD.test(all);
  };
  if (!noteFree(t)) return false;
  const words = t.text.split(/\s+/).filter((w) => /\p{L}/u.test(w));
  if (words.length > TITLE_MAX_WORDS) return false;
  const rivals = inside.filter(
    (x) =>
      x !== t && x.text !== t.text && lettered(x) && !!readPieceText(x.text).code && noteFree(x),
  );
  if (
    rivals.some((x) => readPieceText(x.text).code !== code && x.fontSizeMm >= 0.85 * t.fontSizeMm)
  )
    return false;
  if (!rivals.length) return true;
  const maxFont = Math.max(...rivals.map((x) => x.fontSizeMm));
  if (t.fontSizeMm >= 0.85 * maxFont) return true;
  const cx = (piece.minX + piece.maxX) / 2;
  const cy = (piece.minY + piece.maxY) / 2;
  const mid = (x: { bbox: BoxLike }) =>
    Math.hypot((x.bbox.minX + x.bbox.maxX) / 2 - cx, (x.bbox.minY + x.bbox.maxY) / 2 - cy);
  return rivals.every((x) => mid(t) <= mid(x));
}

type BoxLike = { minX: number; minY: number; maxX: number; maxY: number };

/** Split an identity-like string into code words + modifiers in grammar order. */
export function parseIdentity(
  raw: string,
  isSizeToken: (t: string) => boolean,
): { code: string; mods: string[]; hand: PairHand | null; uni: boolean; notes: string[] } | null {
  const notes: string[] = [];
  const toks = raw
    .trim()
    .toUpperCase()
    .replace(/[\s\-.]+/g, '_')
    .replace(/[<>()[\]]/g, '')
    .split('_')
    .filter(Boolean);
  let uni = false;
  const kept: string[] = [];
  for (const t of toks) {
    if (t === 'UNI') {
      uni = true;
      continue;
    }
    kept.push(t);
  }
  if (uni) notes.push('UNI in the name: ungraded');
  // a trailing size token (FP_M from a single-size export) is the size, not the identity
  while (
    kept.length > 1 &&
    isSizeToken(kept[kept.length - 1]) &&
    modStage(kept[kept.length - 1]) !== 0
  ) {
    notes.push(`size token ${kept[kept.length - 1]} removed from the name`);
    kept.pop();
  }
  const code: string[] = [];
  let i = 0;
  while (i < kept.length && (code.length === 0 || modStage(kept[i]) < 0)) code.push(kept[i++]);
  const mods = kept.slice(i);
  if (!code.length) return null;
  const ordered = [...mods].sort((a, b) => modStage(a) - modStage(b));
  if (ordered.join('_') !== mods.join('_'))
    notes.push(`modifiers reordered ${mods.join('_')} → ${ordered.join('_')}`);
  const hands = ordered.filter((m) => m === 'L' || m === 'R');
  const hand = hands.length === 1 ? (hands[0] as PairHand) : null;
  return {
    code: code.join('_'),
    mods: ordered.filter((m) => !(hand && m === hand)),
    hand,
    uni,
    notes,
  };
}

/** A readable name for the names table when nobody gave one. */
export function defaultDisplayName(
  code: string,
  mods: readonly string[],
  hand: PairHand | null,
): string {
  const words = codeWordsOf([code, ...mods].join('_')).map((w) => codeName(w) || w.toLowerCase());
  const side = mods.includes('F') ? 'front ' : mods.includes('B') ? 'back ' : '';
  const num = mods.find((m) => /^\d+$/.test(m));
  const h = hand === 'L' ? ' left' : hand === 'R' ? ' right' : '';
  return `${side}${words.join(' ')}${num ? ` ${num}` : ''}${h}`.trim();
}

export function readName(opts: {
  override?: Partial<
    Pick<PieceSpec, 'code' | 'mods' | 'displayName' | 'nameOrigin' | 'aiConfidence' | 'pairHand'>
  >;
  dxfIdentity?: string | null;
  texts: string[];
  isSizeToken: (t: string) => boolean;
  /**
   * D3: which of `texts` are the piece's title label (`isTitleLabel`). Titles are read first; a
   * name read from any other text comes back with `fromNote`. Absent = every text counts as a title.
   */
  isTitle?: (text: string) => boolean;
}): NameReading | null {
  const { override, dxfIdentity, isSizeToken, isTitle } = opts;
  if (override?.code) {
    const mods = override.mods ?? [];
    const hands = mods.filter((m) => m === 'L' || m === 'R');
    const hand = hands.length === 1 ? (hands[0] as PairHand) : null;
    return {
      code: override.code,
      mods: mods.filter((m) => !(hand && m === hand)),
      hand,
      displayName: override.displayName ?? defaultDisplayName(override.code, mods, hand),
      nameOrigin: override.nameOrigin ?? 'operator',
      ...(override.aiConfidence != null ? { aiConfidence: override.aiConfidence } : {}),
      uni: false,
      notes: [],
    };
  }
  if (dxfIdentity) {
    const p = parseIdentity(dxfIdentity, isSizeToken);
    // A block named in words (`pocket_l_1`, `FRONT`) gets the dictionary code for the words.
    if (p && !p.code.split('_').every(isKnownCode)) {
      const r = readPieceText(p.code.replace(/_/g, ' '));
      if (r.code) {
        p.notes.push(`"${p.code}" read as ${r.code}`);
        p.code = r.code;
        if (r.side && r.code !== 'FP' && r.code !== 'BP' && !p.mods.includes(r.side))
          p.mods = [...p.mods, r.side].sort((a, b) => modStage(a) - modStage(b));
      }
    }
    if (p && !identityGrammarProblem([p.code, ...p.mods].join('_'))) {
      return {
        ...p,
        displayName: override?.displayName ?? defaultDisplayName(p.code, p.mods, p.hand),
        nameOrigin: 'text',
        notes: [`name from the DXF block ${dxfIdentity}`, ...p.notes],
      };
    }
  }
  // titles first (D3): a name read from a note only when no title names the piece
  const texts = isTitle
    ? [...opts.texts.filter((t) => isTitle(t)), ...opts.texts.filter((t) => !isTitle(t))]
    : opts.texts;
  for (const t of texts) {
    const r = readPieceText(t);
    if (!r.code) continue;
    const code = r.fabric === 'lining' && r.code !== 'LIN' ? `LIN_${r.code}` : r.code;
    const mods = r.side && r.code !== 'FP' && r.code !== 'BP' ? [r.side] : [];
    const note = !!isTitle && !isTitle(t);
    return {
      code,
      mods,
      hand: null,
      displayName: override?.displayName ?? t.trim().slice(0, 60),
      nameOrigin: 'text',
      uni: false,
      notes: [
        `name read from «${t.trim().slice(0, 40)}» (${r.matched})${note ? ' — a note on the piece, not its title: confirm' : ''}`,
      ],
      ...(note ? { fromNote: t.trim().slice(0, 80) } : {}),
    };
  }
  return null;
}

/** G11 for one identity, with the dictionary only for AI names (F10: the operator's list is open). */
export function identityCheck(
  identity: string,
  origin: PieceSpec['nameOrigin'],
  pair: { hand: PairHand | null; of: string | null },
  isSizeToken: (t: string) => boolean,
): string | null {
  return identityProblem(identity, {
    isSizeToken,
    pair,
    isKnownCode: origin === 'ai' || origin === 'ai-auto' ? isKnownCode : undefined,
  });
}
