// What the wizard needs from the outside world, as three narrow seams.
//
// The wizard is written against the CONTRACT (lib/pattern-import/types.ts §11), not against an
// implementation: the stage API is `StageIO`, the worker protocol is open → run* → close. Phase 1
// ships a stub behind these seams (stub-client.ts) so every step renders on fixture data; the real
// `ImportWorkerClient` (lib/pattern-import/worker/client.ts), the AI namer (F10) and the atomic
// apply (F7 fabrics/apply.ts) plug into the same three types without the steps changing.
import type {
  ApplyResult,
  CardDraft,
  CardSize,
  DraftScopeTarget,
  NameDecision,
  SourceFileInfo,
  StageIO,
  StageName,
} from 'lib/pattern-import/types';

export type StageProgress = { done: number; total: number; note?: string };

/** The worker, one session per wizard run. Modelled on lib/nesting/worker/client.ts. */
export interface ImportClient {
  /** 'stub' renders fixture data and writes nothing; the shell says so on screen. */
  readonly kind: 'stub' | 'worker';
  open(files: { name: string; bytes: ArrayBuffer }[]): Promise<{
    sessionId: number;
    files: SourceFileInfo[];
  }>;
  run<S extends StageName>(
    sessionId: number,
    stage: S,
    input: StageIO[S]['in'],
    onProgress?: (p: StageProgress) => void,
  ): Promise<StageIO[S]['out']>;
  /** Cancels whatever is running (terminate + respawn is the worker's hard fallback). */
  cancel(): void;
  close(sessionId: number): Promise<void>;
}

/** The card as the wizard sees it: read once when the wizard opens, never written by the steps. */
export type CardContext = {
  techCardId: number;
  /** Card size run in rank order. Empty = the card has no range yet (the sizes step says so). */
  sizes: CardSize[];
  /** One target per fabric scope of the BOM (bindingForScope), main fabric first. */
  scopes: DraftScopeTarget[];
  /** Existing cut pieces — the AI may not bind to one by name alone (Codex C10). */
  existingPieces: { lineKey: string; name: string; cutSymmetry: string }[];
  /** Season + style number, for the file names the writer proposes. */
  styleLabel: string;
};

/**
 * Main-thread AI naming (F10): render-som output → upload → SuggestPatternPieces → combineNames.
 * Returns one decision per seed; auto-accepted rows come back flagged, never hidden.
 */
export type NameSuggester = (
  input: StageIO['render-som']['out'],
  ctx: { card: CardContext; threshold: number },
) => Promise<NameDecision[]>;

/** F7 `buildDraft`: the write outputs + the session → the one draft the card receives. */
export type DraftBuilder = (
  write: StageIO['write']['out'],
  ctx: {
    card: CardContext;
    /**
     * The pieces as written. Names, the ai-auto flag, quantity and `fused` reach PieceSpec through
     * `SemanticsInput.pieceOverrides` (I1), so the draft and the manifest inside the DXF agree.
     */
    semantics: StageIO['semantics']['out'];
  },
) => CardDraft;

/** Per-scope upload state the apply step draws while F7 `applyDraft` runs. */
export type ApplyProgress = { scopeKey: string; state: 'uploading' | 'uploaded' | 'failed' };

/**
 * F7 `applyDraft`: upload EVERY scope first, then one batch of setValue — or nothing at all
 * (Codex C5). The wizard never touches the form itself.
 */
export type ApplyDraftFn = (
  draft: CardDraft,
  onProgress?: (p: ApplyProgress) => void,
) => Promise<ApplyResult>;
