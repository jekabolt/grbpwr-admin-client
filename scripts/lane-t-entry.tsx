// СТЕНД ЛЕЙНА T (03.10): НАСТОЯЩИЕ `LatestGeneration` и `GenerationHistory` FLAT и FABRIC RENDER
// над поддельными полосами. Каждый сценарий — своя карточка (`techCardId`), свой `data-probe`.
// Вызовы `adminService` пишутся в `window.__calls` (заглушка в `scripts/lane-t-probe.mjs`).
//
// T23 · отмена прогона в полёте:
//   flat-running (11) · flat-pending (12) · flat-cancelling (13) · flat-late (14) · flat-readonly (15)
//   flat-history (16) · render-bench (17) · render-history (18)
// R(a) · попап SPLIT из истории сеет рамки из `readSplit`, а не из пустого `composite_views`:
//   history-popup (19) — строка истории (не сетка: `match`) с листом `one` × 4 вида без столбца
// R(b) · верстак FABRIC RENDER как у FLAT: render-uncut (20) — лист `one` × 4 = встроенный редактор;
//   render-emptied (28) — T36: сняты все рамки, лист 721 стоит плиткой;
//   render-cut (21) — лист 711 и четыре куска: листа нет, куски — плитки с `mark ▾`
// R(c) · принесённые рендеры (без прогона, ни в одной стороне) — на верстаке FABRIC RENDER:
//   render-brought (22) — прогон 80 + принесённый 901 (свободен) и 903 (стоит во front: не в группе);
//   render-brought-only (23) — прогонов нет, только принесённый 902
// W5 · принесённый лист, все куски которого стоят в SIDES, не возвращается «неразрезанным»:
//   render-brought-cut (25) — прогон 81; лист 950 (принесён), куски 951–954 стоят во front…side_r;
//   лист 960, кусок 961 свободен, 962 стоит во front другого… (того же sample) — группа = кусок 961
// T22 · история FLAT монтируется свёрнутой, даже когда хозяин просит открытую: flat-history-fold (27)
// T47 · шов от картинок верстака до `history · N runs` — 32px: workbench-air (29)
// W2 · один прогон в LATEST и в HISTORY — одна блокировка отмены: shared-cancel (24), прогон 58
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type {
  GetDesignBandResponse,
  common_DesignPicture,
  common_DesignRun,
} from 'api/proto-http/admin';
import { DesignCapabilityProvider } from 'components/managers/tech-card/components/design/capability';
import { GenerationHistory } from 'components/managers/tech-card/components/design/generation/generation-history';
import { LatestGeneration } from 'components/managers/tech-card/components/design/generation/latest-generation';
import { PictureGalleryProvider } from 'components/managers/tech-card/components/design/picture-tile';
import { RenderStepScope } from 'components/managers/tech-card/components/design/render/render-tile';
import type { ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { FormProvider, useForm } from 'react-hook-form';
import { BrowserRouter } from 'react-router-dom';
import { TooltipProvider } from 'ui/components/tooltip';

const svg = (fill: string, w: number, h: number) =>
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    `<svg xmlns='http://www.w3.org/2000/svg' width='${w}' height='${h}'><rect width='${w}' height='${h}' fill='${fill}'/></svg>`,
  );
const media = (id: number, url: string, w: number, h: number) => ({
  id,
  thumbnail: { mediaUrl: url },
  fullSize: { mediaUrl: url },
  media: { fullSize: { mediaUrl: url, width: w, height: h }, thumbnail: { mediaUrl: url } },
});
const pic = (id: number, runId: number, kind: string, extra: Partial<common_DesignPicture> = {}) =>
  ({
    id,
    runId,
    kind,
    ordinal: id,
    media: media(1000 + id, svg('#ddd', 400, 500), 400, 500) as never,
    ...extra,
  }) as common_DesignPicture;

const STAMP = '2026-10-03T10:00:00Z';
const run = (id: number, kind: string, extra: Partial<common_DesignRun> = {}): common_DesignRun =>
  ({
    id,
    kind,
    status: 'done',
    createdAt: STAMP,
    startedAt: STAMP,
    params: { layout: 'per_view', views: ['front'] },
    pictures: [],
    ...extra,
  }) as common_DesignRun;

const flatBench = ['front', 'back', 'side_l', 'side_r'].map((viewKey, i) => ({
  id: i + 1,
  viewKey,
  kind: 'flat',
  pictureId: 0,
  slotRev: 1,
}));
const band = (runs: common_DesignRun[]) =>
  ({ bench: flatBench, runs, totalRuns: runs.length }) as unknown as GetDesignBandResponse;

const matchAll = () => true;
const FOUR = ['front', 'back', 'side_l', 'side_r'];
const wide = (id: number) => media(id, svg('#eee', 2000, 1000), 2000, 1000) as never;

const step = { colorways: [], cardColorways: [], adopts: true };

const brot = (id: number, extra: Partial<common_DesignPicture> = {}) => pic(id, 0, 'render', extra);
const piece = (id: number, of: number, view: string) =>
  brot(id, { derivation: 'crop', derivedFrom: of, ghostView: view });
const sideRow = (id: number, viewKey: string, picture: common_DesignPicture) => ({
  id,
  viewKey,
  kind: 'render',
  colorwayId: 0,
  pictureId: picture.id,
  slotRev: 1,
  picture,
});
const W5_SHEET = brot(950, { media: wide(1950) });
const W5_PIECES = FOUR.map((v, i) => piece(951 + i, 950, v));
const W5_SHEET2 = brot(960, { media: wide(1960) });
const W5_FREE = piece(961, 960, 'back');
const W5_HELD = piece(962, 960, 'front');

const scenes: { probe: string; node: ReactNode }[] = [
  {
    probe: 'flat-running',
    node: (
      <LatestGeneration
        band={band([run(50, 'flat', { status: 'running', requestedOutputs: 2 })])}
        techCardId={11}
      />
    ),
  },
  {
    probe: 'flat-pending',
    node: (
      <LatestGeneration
        band={band([run(51, 'flat', { status: 'pending', requestedOutputs: 1 })])}
        techCardId={12}
      />
    ),
  },
  {
    probe: 'flat-cancelling',
    node: (
      <LatestGeneration
        band={band([
          run(52, 'flat', { status: 'running', requestedOutputs: 1, cancelRequestedAt: STAMP }),
        ])}
        techCardId={13}
      />
    ),
  },
  {
    probe: 'flat-late',
    node: (
      <LatestGeneration
        band={band([
          run(53, 'flat', { cancelRequestedAt: STAMP, pictures: [pic(531, 53, 'flat')] }),
        ])}
        techCardId={14}
      />
    ),
  },
  {
    probe: 'flat-readonly',
    node: (
      <LatestGeneration
        band={band([run(54, 'flat', { status: 'running', requestedOutputs: 1 })])}
        techCardId={15}
        disabled
      />
    ),
  },
  {
    probe: 'flat-history',
    node: (
      <GenerationHistory
        band={band([run(55, 'flat', { status: 'running', requestedOutputs: 2 })])}
        techCardId={16}
        defaultRep='flat'
        defaultOpen={false}
      />
    ),
  },
  {
    probe: 'render-bench',
    node: (
      <RenderStepScope step={step}>
        <LatestGeneration
          band={band([run(56, 'render', { status: 'running', requestedOutputs: 1 })])}
          techCardId={17}
          kind='render'
        />
      </RenderStepScope>
    ),
  },
  {
    probe: 'render-history',
    node: (
      <RenderStepScope step={step}>
        <GenerationHistory
          band={band([run(57, 'render', { status: 'running', requestedOutputs: 1 })])}
          techCardId={18}
          defaultRep='render'
          defaultOpen={false}
        />
      </RenderStepScope>
    ),
  },
  {
    probe: 'history-popup',
    node: (
      <GenerationHistory
        band={band([
          run(60, 'flat', {
            params: { layout: 'one', views: ['front', 'back', 'side_l', 'side_r'] } as never,
            pictures: [
              pic(601, 60, 'flat', {
                media: media(1601, svg('#eee', 2000, 1000), 2000, 1000) as never,
              }),
            ],
          }),
        ])}
        techCardId={19}
        defaultRep='flat'
        match={matchAll}
        defaultOpen={false}
      />
    ),
  },
  {
    probe: 'render-uncut',
    node: (
      <RenderStepScope step={step}>
        <LatestGeneration
          band={band([
            run(70, 'render', {
              params: { layout: 'one', views: FOUR } as never,
              pictures: [pic(701, 70, 'render', { media: wide(1701) })],
            }),
          ])}
          techCardId={20}
          kind='render'
        />
      </RenderStepScope>
    ),
  },
  {
    // T36 · у листа FABRIC RENDER снимают все рамки: редактор закрыт, лист — плитка (карточка 28).
    probe: 'render-emptied',
    node: (
      <RenderStepScope step={step}>
        <LatestGeneration
          band={band([
            run(72, 'render', {
              params: { layout: 'one', views: FOUR } as never,
              pictures: [pic(721, 72, 'render', { media: wide(1721) })],
            }),
          ])}
          techCardId={28}
          kind='render'
        />
      </RenderStepScope>
    ),
  },
  {
    probe: 'render-cut',
    node: (
      <RenderStepScope step={step}>
        <LatestGeneration
          band={band([
            run(71, 'render', {
              params: { layout: 'one', views: FOUR } as never,
              pictures: [
                pic(711, 71, 'render', { media: wide(1711) }),
                ...FOUR.map((view, i) =>
                  pic(712 + i, 71, 'render', {
                    derivation: 'crop',
                    derivedFrom: 711,
                    ghostView: view,
                  }),
                ),
              ],
            }),
          ])}
          techCardId={21}
          kind='render'
        />
      </RenderStepScope>
    ),
  },
  {
    probe: 'render-brought',
    node: (
      <RenderStepScope step={step}>
        <LatestGeneration
          band={
            {
              bench: [
                ...flatBench,
                {
                  id: 9,
                  viewKey: 'front',
                  kind: 'render',
                  colorwayId: 0,
                  pictureId: 903,
                  slotRev: 1,
                  picture: pic(903, 0, 'render'),
                },
              ],
              runs: [run(80, 'render', { pictures: [pic(801, 80, 'render')] })],
              totalRuns: 1,
              outputs: [
                { picture: pic(801, 80, 'render'), runId: 80, runKind: 'render' },
                { picture: pic(901, 0, 'render'), runId: 0, runKind: 'render' },
                { picture: pic(903, 0, 'render'), runId: 0, runKind: 'render' },
              ],
            } as unknown as GetDesignBandResponse
          }
          techCardId={22}
          kind='render'
        />
      </RenderStepScope>
    ),
  },
  {
    probe: 'render-brought-only',
    node: (
      <RenderStepScope step={step}>
        <LatestGeneration
          band={
            {
              bench: flatBench,
              runs: [],
              totalRuns: 0,
              outputs: [{ picture: pic(902, 0, 'render'), runId: 0, runKind: 'render' }],
            } as unknown as GetDesignBandResponse
          }
          techCardId={23}
          kind='render'
        />
      </RenderStepScope>
    ),
  },
  {
    probe: 'render-brought-cut',
    node: (
      <RenderStepScope step={step}>
        <LatestGeneration
          band={
            {
              bench: [...flatBench, ...W5_PIECES.map((p, i) => sideRow(40 + i, FOUR[i], p))],
              runs: [run(81, 'render', { pictures: [pic(811, 81, 'render')] })],
              totalRuns: 1,
              outputs: [
                { picture: pic(811, 81, 'render'), runId: 81, runKind: 'render' },
                ...[W5_SHEET, ...W5_PIECES].map((picture) => ({
                  picture,
                  runId: 0,
                  runKind: 'render',
                })),
              ],
            } as unknown as GetDesignBandResponse
          }
          techCardId={25}
          kind='render'
        />
      </RenderStepScope>
    ),
  },
  {
    probe: 'render-brought-part',
    node: (
      <RenderStepScope step={step}>
        <LatestGeneration
          band={
            {
              bench: [...flatBench, sideRow(50, 'front', W5_HELD)],
              runs: [run(82, 'render', { pictures: [pic(821, 82, 'render')] })],
              totalRuns: 1,
              outputs: [
                { picture: pic(821, 82, 'render'), runId: 82, runKind: 'render' },
                ...[W5_SHEET2, W5_FREE, W5_HELD].map((picture) => ({
                  picture,
                  runId: 0,
                  runKind: 'render',
                })),
              ],
            } as unknown as GetDesignBandResponse
          }
          techCardId={26}
          kind='render'
        />
      </RenderStepScope>
    ),
  },
  {
    probe: 'flat-history-fold',
    node: (
      <GenerationHistory
        band={band([run(59, 'flat', { pictures: [pic(591, 59, 'flat')] })])}
        techCardId={27}
        defaultRep='flat'
        defaultOpen
      />
    ),
  },
  {
    // T47 · картинки верстака и строка истории под ними — шов 32px, а не ритм блока.
    probe: 'workbench-air',
    node: (
      <LatestGeneration
        band={band([run(60, 'flat', { pictures: [pic(601, 60, 'flat'), pic(602, 60, 'flat')] })])}
        techCardId={29}
        history={
          <GenerationHistory
            band={band([
              run(60, 'flat', { pictures: [pic(601, 60, 'flat'), pic(602, 60, 'flat')] }),
            ])}
            techCardId={29}
            defaultRep='flat'
            defaultOpen={false}
          />
        }
      />
    ),
  },
  {
    probe: 'shared-cancel',
    node: (
      <>
        <LatestGeneration
          band={band([run(58, 'flat', { status: 'running', requestedOutputs: 1 })])}
          techCardId={24}
        />
        <GenerationHistory
          band={band([run(58, 'flat', { status: 'running', requestedOutputs: 1 })])}
          techCardId={24}
          defaultRep='flat'
          defaultOpen={false}
        />
      </>
    ),
  },
];

function CardForm({ children }: { children: ReactNode }) {
  const form = useForm();
  return <FormProvider {...form}>{children}</FormProvider>;
}

const qc = new QueryClient({
  defaultOptions: { queries: { retry: false, staleTime: 60_000 }, mutations: { retry: false } },
});
createRoot(document.getElementById('root') as HTMLElement).render(
  <QueryClientProvider client={qc}>
    <DesignCapabilityProvider value>
      <BrowserRouter>
        <TooltipProvider>
          <CardForm>
            <PictureGalleryProvider>
              <div style={{ width: 900, padding: 40 }}>
                {scenes.map(({ probe, node }) => (
                  <div key={probe} data-probe={probe} style={{ marginBottom: 40 }}>
                    {node}
                  </div>
                ))}
              </div>
            </PictureGalleryProvider>
          </CardForm>
        </TooltipProvider>
      </BrowserRouter>
    </DesignCapabilityProvider>
  </QueryClientProvider>,
);
