// СТЕНД ВСТРОЕННОГО СПЛИТА (лейн R, T20 + T21; generation/latest-generation.tsx, inline-split.tsx).
// Монтирует НАСТОЯЩИЙ `LatestGeneration` FLAT над поддельной полосой, дважды:
//   · `uncut` (карточка 1) — прогон 7 `one` × front/back/side_l/side_r, один лист 31 БЕЗ
//     `composite_views` (как на бете: столбец пуст, виды читаются из params, `readSplit`);
//   · `cut`   (карточка 2) — прогон 8: лист 41 и четыре его куска 42–45 (`derivation: crop`).
// Вызовы `adminService` пишутся в `window.__calls` (заглушка в пробе); `window.__probe` —
// чтения для проверки истории (`gridPicturesOf`).
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { GetDesignBandResponse, common_DesignPicture } from 'api/proto-http/admin';
import { createRoot } from 'react-dom/client';
import { DesignCapabilityProvider } from 'components/managers/tech-card/components/design/capability';
import { PictureGalleryProvider } from 'components/managers/tech-card/components/design/picture-tile';
import { LatestGeneration } from 'components/managers/tech-card/components/design/generation/latest-generation';
import { gridPicturesOf } from 'components/managers/tech-card/components/design/generation/generation-history';

const svg = (fill: string, w: number, h: number) =>
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    `<svg xmlns='http://www.w3.org/2000/svg' width='${w}' height='${h}'><rect width='${w}' height='${h}' fill='${fill}'/></svg>`,
  );
const SHEET = svg('#eee', 2000, 1000);
const SHEET_CUT = svg('#ccc', 2000, 1000);
const PIECE = svg('#ddd', 300, 300);

const media = (id: number, url: string, w: number, h: number) => ({
  id,
  thumbnail: { mediaUrl: url },
  fullSize: { mediaUrl: url },
  media: { fullSize: { mediaUrl: url, width: w, height: h }, thumbnail: { mediaUrl: url } },
});

const pic = (id: number, runId: number, extra: Partial<common_DesignPicture>) =>
  ({ id, runId, kind: 'flat', ...extra }) as common_DesignPicture;

const VIEWS = ['front', 'back', 'side_l', 'side_r'];
const params = { layout: 'one', views: VIEWS };

const sheet = pic(31, 7, { media: media(131, SHEET, 2000, 1000) as never });
const uncutRun = { id: 7, kind: 'flat', status: 'done', params, pictures: [sheet] };

// W6: тот же лист `one`, его «keep as one picture» — карточка 3.
const keptSheet = pic(32, 9, { media: media(132, SHEET, 2000, 1000) as never });
const keptRun = { id: 9, kind: 'flat', status: 'done', params, pictures: [keptSheet] };

const cutSheet = pic(41, 8, { media: media(141, SHEET_CUT, 2000, 1000) as never });
const pieces = VIEWS.map((view, i) =>
  pic(42 + i, 8, {
    derivation: 'crop',
    derivedFrom: 41,
    ghostView: view,
    media: media(142 + i, PIECE, 300, 300) as never,
  }),
);
const cutRun = { id: 8, kind: 'flat', status: 'done', params, pictures: [cutSheet, ...pieces] };

const bench = VIEWS.map((viewKey, i) => ({
  id: i + 1,
  viewKey,
  kind: 'flat',
  pictureId: 0,
  slotRev: 1,
}));
const bandOf = (run: unknown) => ({ bench, runs: [run] }) as unknown as GetDesignBandResponse;

(window as unknown as { __probe: unknown }).__probe = {
  historyIds: gridPicturesOf(cutRun as never).map((p) => p.id),
};

function Harness() {
  return (
    <DesignCapabilityProvider value>
      <PictureGalleryProvider>
        <div style={{ width: 900, padding: 40 }}>
          <div data-probe='uncut'>
            <LatestGeneration band={bandOf(uncutRun)} techCardId={1} />
          </div>
          <div data-probe='kept'>
            <LatestGeneration band={bandOf(keptRun)} techCardId={3} />
          </div>
          <div data-probe='cut'>
            <LatestGeneration band={bandOf(cutRun)} techCardId={2} />
          </div>
        </div>
      </PictureGalleryProvider>
    </DesignCapabilityProvider>
  );
}

const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
createRoot(document.getElementById('root') as HTMLElement).render(
  <QueryClientProvider client={qc}>
    <Harness />
  </QueryClientProvider>,
);
