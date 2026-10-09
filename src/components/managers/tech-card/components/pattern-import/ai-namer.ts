// The REAL "AI namer" behind the wizard seam (client.ts `NameSuggester`, F10): uploads the SoM
// renders as media through the normal content-image path (as the design band's
// SuggestDesignPartsCard does), calls SuggestPatternPieces, and combines the answer with the
// client's own evidence. Auto-accepted rows come back flagged, never hidden.
//
// The stub (stub-client.ts `createStubNamer`) stays for fixtures and dev: the wizard picks this one
// only when it runs on the real worker, whose render-som produces real pictures.
import { adminService } from 'api/api';
import { suggestNames, type NamerDeps } from 'lib/pattern-import/ai/name';
import type { CardContext, NameSuggester } from './client';

const asDataUrl = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error ?? new Error('could not read the render'));
    r.readAsDataURL(blob);
  });

export const apiNamerDeps: NamerDeps = {
  async upload(picture) {
    const res = await adminService.UploadContentImage({
      rawB64Image: await asDataUrl(picture),
      // PNG/JPEG are stored byte-for-byte: the model sees exactly the marks we drew.
      preserveOriginal: true,
    });
    const id = res.media?.id ?? 0;
    if (!id) throw new Error('the render went up but came back without an id');
    return id;
  },
  suggest: (req) => adminService.SuggestPatternPieces(req),
};

/** The card facts the namer sends — sizes, BOM purposes, pieces already on the card. */
export const cardFacts = (card: CardContext) => ({
  techCardId: card.techCardId,
  sizeTokens: card.sizes.map((s) => s.token),
  bomPurposes: [...new Set(card.scopes.map((s) => s.fabricPurpose).filter(Boolean))],
  existingPieceNames: card.existingPieces.map((p) => p.name),
});

export function createAiNamer(deps: NamerDeps = apiNamerDeps): NameSuggester {
  return async (som, { card, threshold }) =>
    (await suggestNames(som, cardFacts(card), { threshold }, deps)).decisions;
}
