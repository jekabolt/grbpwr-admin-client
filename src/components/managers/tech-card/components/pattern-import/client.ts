// What the wizard needs from the outside world, as three narrow seams.
//
// The wizard is written against the CONTRACT (lib/pattern-import/types.ts §11), not against an
// implementation: the stage API is `StageIO`, the worker protocol is open → run* → close. Phase 1
// ships a stub behind these seams (stub-client.ts) so every step renders on fixture data; the real
// `ImportWorkerClient` (lib/pattern-import/worker/client.ts, F13b) satisfies `ImportClient`
// structurally, the AI namer (F10) is `ai-namer.ts`, and the atomic apply (F7 fabrics/apply.ts)
// plugs into the same types without the steps changing. The stub stays for fixture mode.
import type {
  ApplyResult,
  CardDraft,
  CardSize,
  ConversionManifest,
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
  /** False once the worker was restarted (hard cancel, crash): the session's state is gone. */
  alive?(sessionId: number): boolean;
  /** Ends the worker for good (the wizard unmounted). */
  dispose?(): void;
}

/** The card as the wizard sees it: read once when the wizard opens, never written by the steps. */
export type CardContext = {
  techCardId: number;
  /** Card size run in rank order. Empty = the card has no range yet (the sizes step says so). */
  sizes: CardSize[];
  /** One target per fabric scope of the BOM (bindingForScope), main fabric first. */
  scopes: DraftScopeTarget[];
  /** Existing cut pieces — the AI may not bind to one by name alone (Codex C10). */
  existingPieces: {
    lineKey: string;
    name: string;
    cutSymmetry: string;
    piecesPerGarment?: number;
    fused?: boolean;
    fusingMode?: string;
  }[];
  /** Block → piece links the card already has, by scope key (F7: re-apply binds to the same piece). */
  existingAliases?: { scopeKey: string; blockName: string; pieceLineKey: string }[];
  /**
   * Pattern rows the card already has, by scope key (F7: the same file is not uploaded twice).
   * MF-C: `lineKey`/`name` and the conversion manifest the card's parse read off the sheet — a
   * sheet this importer wrote earlier is offered for replacement on a re-import (M4).
   */
  existingPatterns?: {
    scopeKey: string;
    filename: string;
    url: string;
    lineKey?: string;
    name?: string;
    manifest?: ConversionManifest | null;
  }[];
  /** Season + style number, for the file names the writer proposes. */
  styleLabel: string;
  /**
   * The BOM has no fabric line: the run converts into one main-fabric file that is only
   * downloaded, never applied (J1). Set by `forRun`, not by the card.
   */
  downloadOnly?: boolean;
};

/** The one scope of a download-only run: a main-fabric file bound to no BOM line. */
export const DOWNLOAD_ONLY_SCOPE: DraftScopeTarget = {
  scopeKey: 'TECH_CARD_BOM_PURPOSE_MAIN',
  fabricPurpose: 'TECH_CARD_BOM_PURPOSE_MAIN',
  bomLineKey: '',
  label: 'main fabric',
  isInterlining: false,
  sections: ['TECH_CARD_BOM_SECTION_FABRIC'],
};

/**
 * The card as a run sees it. With no fabric line in the BOM there is nothing to bind a file to,
 * but the conversion is still the operator's main output: the run gets one main scope and ends
 * in a download instead of a wall on the fabrics step.
 */
export function forRun(card: CardContext): CardContext {
  if (card.scopes.length) return card;
  return { ...card, scopes: [DOWNLOAD_ONLY_SCOPE], downloadOnly: true };
}

/**
 * Main-thread AI naming (F10): render-som output → upload → SuggestPatternPieces → combineNames.
 * Returns one decision per seed; auto-accepted rows come back flagged, never hidden.
 *
 * Real: `createAiNamer()` (ai-namer.ts → lib/pattern-import/ai/name.ts `suggestNames`), used with
 * the real worker. Stub: `createStubNamer` (stub-client.ts), fixture names, for the stub client/dev.
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
