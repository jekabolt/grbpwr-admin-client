// The request the namer sends, built from the render-som output and the card (no proto names here —
// wire.ts maps this to the wire).
import { AI_MODIFIERS, PIECE_CODES } from '../dictionary/codes';
import type { FabricPurposeKey, StageIO, SuggestPatternPiecesInput } from '../types';

export type CardFacts = {
  techCardId: number;
  /** Card size tokens in rank order. */
  sizeTokens: string[];
  bomPurposes: FabricPurposeKey[];
  existingPieceNames: string[];
};

export function buildSuggestInput(
  som: Pick<StageIO['render-som']['out'], 'marks' | 'context'>,
  card: CardFacts,
  media: { overview: number; crops: { mark: number; mediaId: number }[] },
  force = false,
): SuggestPatternPiecesInput {
  return {
    techCardId: card.techCardId,
    overviewMediaId: media.overview,
    crops: media.crops,
    marks: som.marks,
    sizeTokens: card.sizeTokens,
    bomPurposes: card.bomPurposes,
    existingPieceNames: card.existingPieceNames,
    instructionsExcerpt: som.context?.instructionsExcerpt ?? '',
    languageHint: som.context?.languageHint ?? '',
    // Always the client's dictionary (D2 codes included), never the server's default list.
    allowedCodes: PIECE_CODES.map((c) => ({ code: c.code, name: c.name })),
    allowedModifiers: [...AI_MODIFIERS],
    force,
  };
}
