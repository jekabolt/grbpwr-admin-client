// THE ONLY FILE THAT NAMES PROTO FIELDS (08-CONTRACT §6). Client types (`types.ts` §10) ↔ F9's
// `SuggestPatternPiecesRequest/Response` (mirror e46f4f5).
//
// Outbound it CLAMPS to the server's raw input bounds (F9 a4e0730 refuses, never truncates — so the
// client truncates first): ≤ 80 pieces, ≤ 12 crops of marks that are in the request, text_inside
// ≤ 12 × 120 runes, quantity_text ≤ 120, size names ≤ 60 × 32, BOM fabrics ≤ 20 × 40, card piece
// names ≤ 120 × 60, instructions ≤ 4000, language ≤ 16, allowed codes ≤ 60 (16/60), modifiers ≤ 16 × 8.
// Inbound it splits the server's single code string into code words + modifiers with the grammar's
// own splitter, maps the purpose words back to the BOM enum and turns the wire's zero values into
// "not said".
//
// Type-only import of the generated client: worker-safe.
import type {
  SuggestPatternPiecesRequest,
  SuggestPatternPiecesResponse,
} from 'api/proto-http/admin';
import { codeWordsOf } from '../manifest/identity';
import type {
  FabricPurposeKey,
  PieceSuggestion,
  SuggestPatternPiecesInput,
  SuggestPatternPiecesOutput,
} from '../types';

export const WIRE_LIMITS = {
  pieces: 80,
  crops: 12,
  markMax: 999,
  textItems: 12,
  textRunes: 120,
  quantityRunes: 120,
  sizes: 60,
  sizeRunes: 32,
  bomFabrics: 20,
  fabricRunes: 40,
  cardPieces: 120,
  cardPieceRunes: 60,
  instructionsRunes: 4000,
  languageRunes: 16,
  codes: 60,
  codeRunes: 16,
  codeNameRunes: 60,
  modifiers: 16,
  modifierRunes: 8,
} as const;

/** Cut to `n` code points (the server counts runes, not UTF-16 units). */
export const runes = (s: string, n: number) => {
  const a = Array.from(s);
  return a.length <= n ? s : a.slice(0, n).join('');
};
const list = (xs: readonly string[], items: number, each: number) =>
  xs
    .map((x) => runes(x.trim(), each))
    .filter(Boolean)
    .slice(0, items);

const PURPOSE_PREFIX = 'TECH_CARD_BOM_PURPOSE_';
const WIRE_PURPOSES = [
  'main',
  'lining',
  'pocketing',
  'interfacing',
  'insulation',
  'contrast',
  'mesh',
  'other',
];

/** `TECH_CARD_BOM_PURPOSE_MAIN` → `main` (the F9 / entity.BomPurposeOrder word); '' when unknown. */
export function purposeToWire(p: FabricPurposeKey): string {
  const w = p.startsWith(PURPOSE_PREFIX)
    ? p.slice(PURPOSE_PREFIX.length).toLowerCase()
    : p.toLowerCase();
  return WIRE_PURPOSES.includes(w) ? w : '';
}

/** `main` → `TECH_CARD_BOM_PURPOSE_MAIN`; '' when not a purpose word. */
export function purposeFromWire(w: string): FabricPurposeKey {
  const v = w.trim().toLowerCase();
  return WIRE_PURPOSES.includes(v) ? `${PURPOSE_PREFIX}${v.toUpperCase()}` : '';
}

/** Client input → the request body. */
export function toWireRequest(input: SuggestPatternPiecesInput): SuggestPatternPiecesRequest {
  const marks = input.marks
    .filter((m) => Number.isInteger(m.mark) && m.mark >= 1 && m.mark <= WIRE_LIMITS.markMax)
    .filter((m, i, a) => a.findIndex((x) => x.mark === m.mark) === i)
    .slice(0, WIRE_LIMITS.pieces);
  const sent = new Set(marks.map((m) => m.mark));
  const crops = input.crops
    .filter((c) => sent.has(c.mark) && c.mediaId > 0)
    .filter((c, i, a) => a.findIndex((x) => x.mark === c.mark) === i)
    .slice(0, WIRE_LIMITS.crops);
  const bom = [...new Set(input.bomPurposes.map(purposeToWire).filter(Boolean))];
  return {
    techCardId: input.techCardId > 0 ? input.techCardId : 0,
    overviewMediaId: input.overviewMediaId,
    crops: crops.map((c) => ({ mark: c.mark, mediaId: c.mediaId })),
    pieces: marks.map((m) => ({
      mark: m.mark,
      textInside: list(m.textInside, WIRE_LIMITS.textItems, WIRE_LIMITS.textRunes),
      quantityText: runes(m.quantityText.trim(), WIRE_LIMITS.quantityRunes),
      areaCm2: Math.round(m.areaMm2) / 100,
      bboxWMm: Math.round((m.bboxMm[2] - m.bboxMm[0]) * 10) / 10,
      bboxHMm: Math.round((m.bboxMm[3] - m.bboxMm[1]) * 10) / 10,
      isSymmetricHint: m.symmetricHint,
      hasFoldLineHint: m.foldHint,
    })),
    context: {
      sizeNames: list(input.sizeTokens, WIRE_LIMITS.sizes, WIRE_LIMITS.sizeRunes),
      fabricPurposesInBom: list(bom, WIRE_LIMITS.bomFabrics, WIRE_LIMITS.fabricRunes),
      existingCardPieceNames: list(
        [...new Set(input.existingPieceNames.map((n) => n.trim()).filter(Boolean))],
        WIRE_LIMITS.cardPieces,
        WIRE_LIMITS.cardPieceRunes,
      ),
      instructionsTextExcerpt: runes(input.instructionsExcerpt, WIRE_LIMITS.instructionsRunes),
      languageHint: runes(input.languageHint, WIRE_LIMITS.languageRunes),
    },
    allowedCodes: input.allowedCodes
      .filter((c) => c.code && Array.from(c.code).length <= WIRE_LIMITS.codeRunes)
      .slice(0, WIRE_LIMITS.codes)
      .map((c) => ({ code: c.code, name: runes(c.name, WIRE_LIMITS.codeNameRunes) })),
    allowedModifiers: list(
      input.allowedModifiers,
      WIRE_LIMITS.modifiers,
      WIRE_LIMITS.modifierRunes,
    ),
    force: input.force,
  };
}

/** "LIN_FP_L_2" → code LIN_FP, mods [L, 2]. '' stays ''. */
export function splitCode(full: string): { code: string; mods: string[] } {
  const t = full.trim().toUpperCase();
  if (!t) return { code: '', mods: [] };
  const words = codeWordsOf(t);
  return { code: words.join('_'), mods: t.split('_').slice(words.length) };
}

/** The response → client output. Suggestions in mark order; a mark the server dropped is absent. */
export function fromWireResponse(res: SuggestPatternPiecesResponse): SuggestPatternPiecesOutput {
  const suggestions: PieceSuggestion[] = (res.suggestions ?? [])
    .filter((s) => Number.isInteger(s.mark) && (s.mark ?? 0) > 0)
    .map((s) => {
      const { code, mods } = splitCode(s.code ?? '');
      const qty = s.cutQuantity ?? 0;
      const conf = Number(s.confidence ?? 0);
      return {
        mark: s.mark!,
        code,
        mods,
        displayName: (s.humanNameEn ?? '').trim(),
        fabrics: [...new Set((s.fabricPurposes ?? []).map(purposeFromWire).filter(Boolean))],
        cutQty: Number.isInteger(qty) && qty >= 1 ? qty : null,
        onFold: !!s.fold,
        pair: !!s.pair,
        variant: (s.variant ?? '').trim() || null,
        modelConfidence: Number.isFinite(conf) ? Math.min(1, Math.max(0, conf)) : 0,
        evidence: (s.evidence ?? []).map((e) => e.trim()).filter(Boolean),
      };
    })
    .sort((a, b) => a.mark - b.mark);
  return {
    suggestions,
    cached: !!res.cached,
    model: res.model ?? '',
    promptTokens: res.promptTokens ?? 0,
    completionTokens: res.completionTokens ?? 0,
    costUsd: res.costUsd ?? '',
    warnings: res.warnings ?? [],
  };
}
