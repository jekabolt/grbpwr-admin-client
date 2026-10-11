// A9: the REAL page-role call behind the wizard seam (`PageRoleDeps`, lib/pattern-import/ai/pages.ts):
// thumbnails go up through the namer's media path (ai-namer.ts `apiNamerDeps.upload`), the call is
// `adminService.ClassifyPatternPages`.
//
// The generated client does not carry the RPC yet (the backend + proto lane runs in parallel): the
// call is found through a guarded dynamic access, and its absence is an honest 'unavailable' (the
// run goes on without the AI). The request / response types in pages.ts mirror the generated shape.
//
// Backend contract (beta 21a9f37, proto mirror/pattern-import 363329e): role is a lowercase
// string; every page its own media id; textExcerpt ≤ 600 runes; each original ≤ 1024 px, ≤ 32 Mpx
// a call; a page the model left out is only a warning — no AI evidence for it (pages.ts keeps all).
//
// AFTER the client is regenerated — THE one-line swap, the `rpc` line below becomes:
//   const rpc: Classify | null = (req) => adminService.ClassifyPatternPages(req);
// (the guarded access already finds the generated method by itself; the swap only makes it typed.
// The …Wire types in pages.ts are structural twins of the generated ones.)
import { adminService } from 'api/api';
import type {
  ClassifyPatternPagesRequestWire,
  ClassifyPatternPagesResponseWire,
  PageRoleDeps,
} from 'lib/pattern-import/ai/pages';
import { asDataUrl, discardMedia } from './ai-namer';

type Classify = (req: ClassifyPatternPagesRequestWire) => Promise<ClassifyPatternPagesResponseWire>;

const rpc: Classify | null = (() => {
  const fn = (adminService as unknown as { ClassifyPatternPages?: unknown }).ClassifyPatternPages;
  return typeof fn === 'function' ? (fn as Classify).bind(adminService) : null;
})();

export const apiPageRoleDeps: PageRoleDeps = {
  // Codex #5: the ordinary upload path (no preserveOriginal: nothing here is kept), deleted after
  upload: async (picture) => {
    const res = await adminService.UploadContentImage({
      rawB64Image: await asDataUrl(picture),
      preserveOriginal: undefined,
    });
    const id = res.media?.id ?? 0;
    if (!id) throw new Error('the page went up but came back without an id');
    return id;
  },
  classify: (req) => (rpc ? rpc(req) : 'unavailable'),
  discard: discardMedia,
};
