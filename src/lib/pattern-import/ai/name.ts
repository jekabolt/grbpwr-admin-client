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
import { UploadTracker, type Discard } from './discard';
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
  /** A9 Codex #5: delete the uploaded renders once the call is over (retried once, logged). */
  discard?: Discard;
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
  // A9 Codex re-check #2: every render uploaded is tracked and deleted once the call is over —
  // whatever happens (a throw anywhere below included)
  const uploads = new UploadTracker(deps.discard, 'AI piece names');
  let output: SuggestPatternPiecesOutput;
  let input: ReturnType<typeof buildSuggestInput>;
  const droppedCrops: number[] = [];
  try {
    // The overview is the call: without it there is nothing to ask about.
    const overview = await uploads.track(deps.upload(som.sheetPng, 'pattern overview'));
    if (!(overview > 0))
      throw new Error('the pattern overview went up but came back without an id');
    const crops = (
      await inBatches(som.crops.slice(0, WIRE_LIMITS.crops), 4, async (c) => {
        try {
          const id = await uploads.track(deps.upload(c.png, `pattern piece ${c.mark}`));
          return id > 0 ? { mark: c.mark, mediaId: id } : null;
        } catch {
          droppedCrops.push(c.mark);
          return null;
        }
      })
    ).filter((c): c is { mark: number; mediaId: number } => !!c);
    input = buildSuggestInput(som, card, { overview, crops }, !!opts.force);
    output = fromWireResponse(await deps.suggest(toWireRequest(input)));
  } finally {
    uploads.close();
  }
  const decisions = combineNames(output.suggestions, som.marks, {
    existingPieceNames: card.existingPieceNames,
    threshold: opts.threshold,
    sizeTokens: card.sizeTokens,
    bomPurposes: card.bomPurposes,
    isKnownCode,
  });
  return { decisions, input, output, droppedCrops };
}
