// The wizard's two card seams (client.ts `DraftBuilder`, `ApplyDraftFn`) on the real card: F7's
// `buildDraft` / `applyDraft` (lib/pattern-import/fabrics) wired to the upload RPC, the tech-card
// form and the card's autosave. The wizard itself never touches the form (Codex C5).
import { adminService } from 'api/api';
import { sha256Hex } from 'lib/features/sha256';
import { applyDraft } from 'lib/pattern-import/fabrics/apply';
import type { ApplyDeps, LiveCard, ScopeOf } from 'lib/pattern-import/fabrics/apply';
import { buildDraft } from 'lib/pattern-import/fabrics/draft';
import type { ApplyResult, CardDraft } from 'lib/pattern-import/types';
import { MAX_PATTERN_FILENAME, clampUtf8Bytes, patternUploadErrorMessage } from 'utils/pattern';
import { deepEqual } from '../useTechCardAutosave';
import type { ApplyDraftFn, DraftBuilder } from './client';

const IMPORT_PATHS = ['patterns', 'pieces', 'pieceDxfAliases'] as const;
type ImportRows = Partial<Record<(typeof IMPORT_PATHS)[number], unknown>>;

/**
 * T3 (09.11): did this import's rows land? The form's import rows are its saved baseline (a body
 * write resets the baseline to what the server holds), and every url this try put on the card is
 * among the baseline's sheets. A save that answered otherwise then failed AFTER the body.
 */
export function importRowsLanded(
  values: ImportRows,
  baseline: ImportRows,
  urls: readonly string[],
): boolean {
  if (!IMPORT_PATHS.every((k) => deepEqual(values[k] ?? [], baseline[k] ?? []))) return false;
  const saved = new Set(
    ((baseline.patterns ?? []) as { url?: string }[]).map((p) => p.url ?? '').filter(Boolean),
  );
  return urls.every((u) => saved.has(u));
}

/** F7 `buildDraft` against the card the wizard read when it opened. */
export const cardBuildDraft: DraftBuilder = (
  write,
  { card, dxfProvenance, dxfPhaseDReplay, dxfNativeSewingReplay },
) => buildDraft(write, card, { dxfProvenance, dxfPhaseDReplay, dxfNativeSewingReplay });

/**
 * ASCII DXF (the writer guarantees it, write/format.ts) → base64 as UploadPattern takes it. `btoa`
 * per chunk stays valid because every chunk is a multiple of 3 bytes long.
 */
function latin1Bytes(text: string): Uint8Array {
  const out = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i++) out[i] = text.charCodeAt(i) & 0xff;
  return out;
}

function toBase64(text: string): string {
  const CHUNK = 3 * 0x2000;
  let out = '';
  for (let i = 0; i < text.length; i += CHUNK) out += btoa(text.slice(i, i + CHUNK));
  return out;
}

export function createCardApply(deps: {
  saveJoin?: import('../guarded-piece-join').SaveJoin | null;
  read: () => LiveCard;
  write: (path: string, value: unknown) => void;
  storageSizeId: number;
  /** The card scope of a live sheet / link — the key the draft's targets carry. */
  scopeOf: ScopeOf;
  /** The card's autosave `flush` (the one save path the page has). */
  save?: (reason: string) => Promise<string>;
  /** Shared card lock the autosave form will claim for the body write. */
  readPreviousLockVersion?: () => number;
  /** Sheets replaced in place, told after the form writes and before the save. */
  onReplaced?: ApplyDeps['onReplaced'];
  /** Rows a try wrote whose save was not confirmed — held by the card across the wizard's tries. */
  unsaved?: { get: () => boolean; set: (v: boolean) => void };
  /** The rows landed though the save answered otherwise (a write after the body failed). */
  landed?: ApplyDeps['landed'];
  /** The save is past the body: only the fusing rebuild after it still runs (T5). */
  rebuilding?: ApplyDeps['rebuilding'];
  /**
   * Additive post-save seam for product semantic attachment. It runs only after `applyDraft`
   * returns a confirmed commit receipt. Its failure must never rewrite or roll back the DXF save.
   */
  afterConfirmedPatternImportSave?: (
    draft: CardDraft,
    result: Extract<ApplyResult, { ok: true }> & {
      commitReceipt: NonNullable<Extract<ApplyResult, { ok: true }>['commitReceipt']>;
    },
  ) => void | Promise<void>;
  /** Best-effort observability for the additive post-save seam; this callback is also fail-open. */
  onPatternSemanticAttachmentHostError?: (error: unknown) => void;
}): ApplyDraftFn {
  return async (draft, onProgress, options) => {
    const join = options?.join;
    if (join && !deps.saveJoin)
      return {
        ok: false,
        failedScope: draft.scopes[0]?.target.scopeKey ?? '',
        message: 'The saved card Join writer is unavailable.',
        uploaded: [],
      };
    const result = await applyDraft(
      draft,
      {
        upload: async ({ filename, text }) => {
          const name = clampUtf8Bytes(filename, MAX_PATTERN_FILENAME);
          try {
            const res = await adminService.UploadPattern({ raw: toBase64(text), filename: name });
            return {
              url: res.url ?? '',
              filename: res.filename ?? name,
              // int64 arrives as a string over grpc-gateway (pattern-upload-button.tsx)
              sizeBytes: Number(res.sizeBytes ?? text.length) || text.length,
              // the bytes btoa sent: one byte per char (0423)
              sha256: await sha256Hex(latin1Bytes(text)),
            };
          } catch (e) {
            throw new Error(patternUploadErrorMessage(e));
          }
        },
        ...(join
          ? {
              saveJoinedPattern: async (binding, uploaded, lock) => {
                const { commitSavedJoin } = await import(
                  './phase-e-workbench-v2/draft-cad-saved-join-review'
                );
                await commitSavedJoin(join, binding, uploaded, lock, deps.saveJoin!);
              },
            }
          : {}),
        read: deps.read,
        write: deps.write,
        storageSizeId: deps.storageSizeId,
        scopeOf: deps.scopeOf,
        save: deps.save,
        readPreviousLockVersion: deps.readPreviousLockVersion,
        onReplaced: deps.onReplaced,
        replaceMatchingFile: options?.replaceMatchingFile,
        newPieceIntent: options?.newPieceIntent,
        unsaved: deps.unsaved,
        landed: deps.landed,
        rebuilding: deps.rebuilding,
      },
      onProgress,
    );
    if (result.ok && result.uploaded.length && deps.afterConfirmedPatternImportSave) {
      try {
        if (!result.commitReceipt) {
          const details = result.commitReceiptBlockers?.map(({ detail }) => detail).join(' ');
          throw new Error(
            details ||
              `No exact import receipt was issued by the card save (${result.save ?? 'no save result'}).`,
          );
        }
        await deps.afterConfirmedPatternImportSave(draft, {
          ...result,
          commitReceipt: result.commitReceipt,
        });
      } catch (error) {
        try {
          deps.onPatternSemanticAttachmentHostError?.(error);
        } catch {
          // Neither attachment nor observability is allowed to change the confirmed DXF save.
        }
      }
    }
    return result;
  };
}
