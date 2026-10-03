// СТЕНД ЛЕЙНА T (03.10): НАСТОЯЩИЕ `LatestGeneration` и `GenerationHistory` FLAT и FABRIC RENDER
// над поддельными полосами. Каждый сценарий — своя карточка (`techCardId`), свой `data-probe`.
// Вызовы `adminService` пишутся в `window.__calls` (заглушка в `scripts/lane-t-probe.mjs`).
//
// T23 · отмена прогона в полёте:
//   flat-running (11) · flat-pending (12) · flat-cancelling (13) · flat-late (14) · flat-readonly (15)
//   flat-history (16) · render-bench (17) · render-history (18)
// R(a) · попап SPLIT из истории сеет рамки из `readSplit`, а не из пустого `composite_views`:
//   history-popup (19) — строка истории (не сетка: `match`) с листом `one` × 4 вида без столбца
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

const step = { colorways: [], cardColorways: [], adopts: true };

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
