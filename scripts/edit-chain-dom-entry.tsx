// DOM half of the edit-chain probe (T28): the REAL `RunTile` on the FLAT workbench over a fake band.
//   · `cur`     — v3, the head of v1 → v2 → v3, standing in FRONT (rev 3): `undo` in the frame;
//   · `back`    — w2 after an undo (w2.replaced_by = w3, undone), standing in BACK (rev 4): `redo`;
// The corners are the server's `canUndo` / `canRedo` (T28 v2).
//   · `history` — v3 in the history: no undo, no redo.
// `adminService` calls land in `window.__calls` (stub in the probe).
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { GetDesignBandResponse, common_DesignPicture } from 'api/proto-http/admin';
import { createRoot } from 'react-dom/client';
import { PictureGalleryProvider } from 'components/managers/tech-card/components/design/picture-tile';
import { RunTile } from 'components/managers/tech-card/components/design/generation/run-tile';

const PIC =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    "<svg xmlns='http://www.w3.org/2000/svg' width='300' height='300'><rect width='300' height='300' fill='#ddd'/></svg>",
  );
const UNDONE = '2026-10-04T10:00:00Z';
const pic = (id: number, extra: Partial<common_DesignPicture> = {}): common_DesignPicture =>
  ({
    id,
    runId: 7,
    kind: 'flat',
    replacedBy: 0,
    media: { id: 100 + id, thumbnail: { mediaUrl: PIC }, fullSize: { mediaUrl: PIC } },
    ...extra,
  }) as common_DesignPicture;

const v1 = pic(31, { replacedBy: 32 });
const v2 = pic(32, { derivedFrom: 31, derivation: 'flatten', replacedBy: 33 });
const v3 = pic(33, { derivedFrom: 32, derivation: 'flatten', canUndo: true, undoToId: 32 });
const w1 = pic(41, { replacedBy: 42 });
const w2 = pic(42, {
  derivedFrom: 41,
  derivation: 'flatten',
  replacedBy: 43,
  canUndo: true,
  undoToId: 41,
  canRedo: true,
});
const w3 = pic(43, { derivedFrom: 42, derivation: 'flatten', undoneAt: UNDONE });
const siblings = [v1, v2, v3, w1, w2, w3];

const band = {
  bench: [
    { id: 1, viewKey: 'front', kind: 'flat', pictureId: 33, slotRev: 3 },
    { id: 2, viewKey: 'back', kind: 'flat', pictureId: 42, slotRev: 4 },
  ],
  runs: [{ id: 7, kind: 'flat', pictures: siblings }],
} as unknown as GetDesignBandResponse;

const noop = () => {};
const cell = { width: 190, position: 'relative' as const };
const common = {
  band,
  techCardId: 1,
  siblings,
  rep: 'flat' as const,
  galleryKey: 'g',
  onSplit: noop,
};

function Harness() {
  return (
    <PictureGalleryProvider>
      <div style={{ display: 'flex', gap: 24, padding: 200 }}>
        <div data-probe='cur' style={cell}>
          <RunTile {...common} picture={v3} workbench cardFit='' runFit='' />
        </div>
        <div data-probe='back' style={cell}>
          <RunTile {...common} picture={w2} workbench cardFit='' runFit='' />
        </div>
        <div data-probe='history' style={cell}>
          <RunTile {...common} picture={v3} cardFit='' runFit='' />
        </div>
      </div>
    </PictureGalleryProvider>
  );
}

const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
createRoot(document.getElementById('root') as HTMLElement).render(
  <QueryClientProvider client={qc}>
    <Harness />
  </QueryClientProvider>,
);
