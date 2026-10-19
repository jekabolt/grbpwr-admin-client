// A9: the REAL page-role call behind the wizard seam (`PageRoleDeps`, lib/pattern-import/ai/pages.ts):
// thumbnails go up through the namer's media path (ai-namer.ts `apiNamerDeps.upload`), the call is
// `adminService.ClassifyPatternPages`.
//
// The generated client carries the RPC (regenerated from proto mirror/pattern-import 363329e).
//
// Backend contract (beta 21a9f37): role is a lowercase string; every page its own media id;
// textExcerpt ≤ 600 runes; each original ≤ 1024 px, ≤ 32 Mpx a call; a page the model left out is
// only a warning — no AI evidence for it (pages.ts keeps all). The …Wire types in pages.ts are
// structural twins of the generated ones.
import { adminService } from 'api/api';
import type {
  ClassifyPatternPagesRequestWire,
  ClassifyPatternPagesResponseWire,
  PageRoleDeps,
} from 'lib/pattern-import/ai/pages';
import { asDataUrl, discardMedia } from './ai-namer';

type Classify = (req: ClassifyPatternPagesRequestWire) => Promise<ClassifyPatternPagesResponseWire>;

const rpc: Classify | null = (req) => adminService.ClassifyPatternPages(req);

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
