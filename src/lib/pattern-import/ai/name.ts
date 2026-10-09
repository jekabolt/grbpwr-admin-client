// THE CALL PATH (main thread, 08-CONTRACT §4.1: AI calls are main-thread; only the renders come
// from the worker). render-som output → upload the overview and the crops as MEDIA (F9 takes media
// ids, like SuggestDesignPartsCard) → SuggestPatternPieces → combineNames.
//
// The two outside effects are injected (`NamerDeps`), so the component wires `adminService` and the
// probe wires fakes — nothing here imports `api/api`, and no probe ever reaches the network.
import type {
  SuggestPatternPiecesRequest,
  SuggestPatternPiecesResponse,
} from 'api/proto-http/admin';
import { isKnownCode } from '../dictionary/codes';
import type {
  NameDecision,
  StageIO,
  SuggestPatternPiecesInput,
  SuggestPatternPiecesOutput,
} from '../types';
import { combineNames } from './combine';
import { buildSuggestInput, type CardFacts } from './input';
import { fromWireResponse, toWireRequest, WIRE_LIMITS } from './wire';

export type NamerDeps = {
  /** Upload one picture as media; resolves to its media id (> 0). */
  upload: (picture: Blob, what: string) => Promise<number>;
  /** POST /api/admin/pattern-import/pieces:suggest. */
  suggest: (req: SuggestPatternPiecesRequest) => Promise<SuggestPatternPiecesResponse>;
};

export type NamerResult = {
  decisions: NameDecision[];
  input: SuggestPatternPiecesInput | null;
  output: SuggestPatternPiecesOutput | null;
  /** Crops whose upload failed (the call went on without them). */
  droppedCrops: number[];
};

async function inBatches<T, R>(xs: readonly T[], n: number, f: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = [];
  for (let i = 0; i < xs.length; i += n)
    out.push(...(await Promise.all(xs.slice(i, i + n).map(f))));
  return out;
}

export async function suggestNames(
  som: StageIO['render-som']['out'],
  card: CardFacts,
  opts: { threshold: number; force?: boolean },
  deps: NamerDeps,
): Promise<NamerResult> {
  if (!som.marks.length) return { decisions: [], input: null, output: null, droppedCrops: [] };
  // The overview is the call: without it there is nothing to ask about.
  const overview = await deps.upload(som.sheetPng, 'pattern overview');
  if (!(overview > 0)) throw new Error('the pattern overview went up but came back without an id');
  const droppedCrops: number[] = [];
  const crops = (
    await inBatches(som.crops.slice(0, WIRE_LIMITS.crops), 4, async (c) => {
      try {
        const id = await deps.upload(c.png, `pattern piece ${c.mark}`);
        return id > 0 ? { mark: c.mark, mediaId: id } : null;
      } catch {
        droppedCrops.push(c.mark);
        return null;
      }
    })
  ).filter((c): c is { mark: number; mediaId: number } => !!c);

  const input = buildSuggestInput(som, card, { overview, crops }, !!opts.force);
  const output = fromWireResponse(await deps.suggest(toWireRequest(input)));
  const decisions = combineNames(output.suggestions, som.marks, {
    existingPieceNames: card.existingPieceNames,
    threshold: opts.threshold,
    sizeTokens: card.sizeTokens,
    bomPurposes: card.bomPurposes,
    isKnownCode,
  });
  return { decisions, input, output, droppedCrops };
}
