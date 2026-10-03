// СТЕНД ПЛИТКИ ВЕРСТАКА (лейн H, T13; generation/run-tile.tsx). Монтирует НАСТОЯЩИЙ `RunTile`
// над поддельной полосой, четыре раза:
//   · `free`    — флэт, ни в каком слоте, ghost `back`: угол `slot ▾`, флаг `fit ≠ card`;
//   · `inslot`  — флэт в слоте BACK (rev 3): ✕ = unmark, ярлык `back`, меню нет;
//   · `derived` — кроп (derived_from), свободен, на верстаке: меню с `delete…` последним;
//   · `history` — тот же кроп не на верстаке: `delete…` нет.
// Вызовы `adminService` пишутся в `window.__calls` (заглушка в пробе).
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

const pic = (id: number, extra: Partial<common_DesignPicture> = {}): common_DesignPicture =>
  ({
    id,
    runId: 7,
    kind: 'flat',
    media: { id: 100 + id, thumbnail: { mediaUrl: PIC }, fullSize: { mediaUrl: PIC } },
    ...extra,
  }) as common_DesignPicture;

const free = pic(11, { ghostView: 'back' });
const inslot = pic(12, { ghostView: 'front' });
const derived = pic(13, { derivedFrom: 11, ghostView: 'front' });
const siblings = [free, inslot, derived];

const band = {
  bench: [
    { id: 1, viewKey: 'back', kind: 'flat', pictureId: 12, slotRev: 3 },
    { id: 2, viewKey: 'front', kind: 'flat', pictureId: 0, slotRev: 5 },
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
        <div data-probe='free' style={cell}>
          <RunTile {...common} picture={free} workbench cardFit='oversized' runFit='slim' />
        </div>
        <div data-probe='inslot' style={cell}>
          <RunTile {...common} picture={inslot} workbench cardFit='' runFit='' />
        </div>
        <div data-probe='derived' style={cell}>
          <RunTile {...common} picture={derived} workbench cardFit='' runFit='' />
        </div>
        <div data-probe='history' style={cell}>
          <RunTile {...common} picture={derived} cardFit='' runFit='' />
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
