// The wizard's two card seams (client.ts `DraftBuilder`, `ApplyDraftFn`) on the real card: F7's
// `buildDraft` / `applyDraft` (lib/pattern-import/fabrics) wired to the upload RPC, the tech-card
// form and the card's autosave. The wizard itself never touches the form (Codex C5).
import { adminService } from 'api/api';
import { applyDraft } from 'lib/pattern-import/fabrics/apply';
import type { LiveCard } from 'lib/pattern-import/fabrics/apply';
import { buildDraft } from 'lib/pattern-import/fabrics/draft';
import { MAX_PATTERN_FILENAME, clampUtf8Bytes, patternUploadErrorMessage } from 'utils/pattern';
import type { ApplyDraftFn, DraftBuilder } from './client';

/** F7 `buildDraft` against the card the wizard read when it opened. */
export const cardBuildDraft: DraftBuilder = (write, { card }) => buildDraft(write, card);

/**
 * ASCII DXF (the writer guarantees it, write/format.ts) → base64 as UploadPattern takes it. `btoa`
 * per chunk stays valid because every chunk is a multiple of 3 bytes long.
 */
function toBase64(text: string): string {
  const CHUNK = 3 * 0x2000;
  let out = '';
  for (let i = 0; i < text.length; i += CHUNK) out += btoa(text.slice(i, i + CHUNK));
  return out;
}

export function createCardApply(deps: {
  read: () => LiveCard;
  write: (path: string, value: unknown) => void;
  storageSizeId: number;
  /** The card's autosave `flush` (the one save path the page has). */
  save?: (reason: string) => Promise<string>;
}): ApplyDraftFn {
  return (draft, onProgress) =>
    applyDraft(
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
            };
          } catch (e) {
            throw new Error(patternUploadErrorMessage(e));
          }
        },
        read: deps.read,
        write: deps.write,
        storageSizeId: deps.storageSizeId,
        save: deps.save,
      },
      onProgress,
    );
}
