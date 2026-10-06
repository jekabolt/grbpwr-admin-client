// СТЕНД ФЛЭТ-МАРШРУТА ПОСЛЕ 82-INPUT-REDESIGN (06.10): настоящие `FlatRunRow`, `FlatJoins` (только
// чтение), `LatestGeneration` и `Bench` над поддельной полосой.
//   · construction (карточка 38) — список A, только чтение: ни правки, ни `+ join`, ни `confirm`;
//   · auto      (карточка 49) — полоса без списка: GenerateDesignJoins уходит сам из ряда, GENERATE
//                ждёт со строкой `generate without it ›`;
//   · modes     (карточка 60) — список A (лямки): ASK · construction (Q1 три позиции, Q2, Q3), один
//                SetDesignJoins с confirm; `from my flat`; маршрут в пилюле; авто-восстановление stale;
//   · bench-50  — один лист (волна 10, квиза кандидатов нет): сам режется и сам ложится в 4 слота;
//   · bench-54  — старый прогон с 4 кандидатами: все листы стоят редакторами, ничего не режется
//                 и не раскладывается само;
//   · bench-51/52/62 — `timed out · retry`, `taking too long`, повтор `hand_flat` с `params.flat`;
//   · slots-55  — FLAT SLOTS: деталь старше видов (`stale` с сервера) → `keep` (SetDesignDetailKept) · `discard`.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { GetDesignBandResponse, common_DesignPicture } from 'api/proto-http/admin';
import { createRoot } from 'react-dom/client';
import { FormProvider, useForm } from 'react-hook-form';
import { BrowserRouter } from 'react-router-dom';
import { TooltipProvider } from 'ui/components/tooltip';
import { DictionaryProvider } from 'lib/providers/dictionary-provider';
import { FlatRunRow } from 'components/managers/tech-card/components/design/flat-run-row';
import {
  flatParamsFor,
  flatParamsForFix,
} from 'components/managers/tech-card/components/design/flat-mode';
import { Section, SectionStack } from 'ui/components/section';
import { DesignCapabilityProvider } from 'components/managers/tech-card/components/design/capability';
import { PictureGalleryProvider } from 'components/managers/tech-card/components/design/picture-tile';
import { FlatJoins } from 'components/managers/tech-card/components/design/flat-joins';
import { Bench } from 'components/managers/tech-card/components/design/bench';
import { LatestGeneration } from 'components/managers/tech-card/components/design/generation/latest-generation';
import { useDesignBand } from 'components/managers/tech-card/components/design/use-design-band';

type W = Window & {
  __bands: Record<number, GetDesignBandResponse>;
  __sheets: { url: string; w: number; h: number }[];
};
const win = window as unknown as W;

const media = (id: number, url: string, w: number, h: number) => ({
  id,
  thumbnail: { mediaUrl: url },
  fullSize: { mediaUrl: url },
  media: {
    fullSize: { mediaUrl: url, width: w, height: h },
    compressed: { mediaUrl: url, width: w, height: h },
    thumbnail: { mediaUrl: url },
  },
});

const VIEWS = ['front', 'back', 'side_l', 'side_r'];
const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000).toISOString();
const CAP = { imageRunCapSeconds: 360, cappedRunKinds: ['flat', 'render'] };
const emptySides = () =>
  VIEWS.map((viewKey, i) => ({ id: i + 1, viewKey, kind: 'flat', pictureId: 0, slotRev: 1 }));

const candidateRun = (runId: number, sheets = 4) => ({
  id: runId,
  kind: 'flat',
  status: 'done',
  requestedOutputs: sheets,
  params: { layout: 'one', views: VIEWS },
  createdAt: minutesAgo(3),
  completedAt: minutesAgo(2),
  pictures: win.__sheets.slice(0, sheets).map(
    (s, i) =>
      ({
        id: 300 + i,
        runId,
        kind: 'flat',
        ordinal: i,
        compositeViews: VIEWS,
        media: media(700 + i, s.url, s.w, s.h),
      }) as unknown as common_DesignPicture,
  ),
});

// card 50: ONE sheet (wave 10) — cut and applied by itself
win.__bands[50] = {
  ...CAP,
  bench: emptySides(),
  runs: [candidateRun(90, 1)],
} as unknown as GetDesignBandResponse;
// card 54: a LEGACY four-candidate run — every sheet stands, nothing is cut or applied by itself
win.__bands[54] = {
  ...CAP,
  bench: emptySides(),
  runs: [candidateRun(94)],
} as unknown as GetDesignBandResponse;

// card 51: the newest run timed out
win.__bands[51] = {
  ...CAP,
  bench: [],
  runs: [
    {
      id: 91,
      kind: 'flat',
      status: 'failed',
      errorCode: 'timed_out',
      lastError: 'the image run passed its 6 min cap',
      requestedOutputs: 4,
      params: { layout: 'one', views: VIEWS },
      createdAt: minutesAgo(8),
      pictures: [],
    },
  ],
} as unknown as GetDesignBandResponse;

// card 52: a run running for 7 minutes
win.__bands[52] = {
  ...CAP,
  bench: [],
  runs: [
    {
      id: 92,
      kind: 'flat',
      status: 'running',
      requestedOutputs: 4,
      params: { layout: 'one', views: VIEWS },
      createdAt: minutesAgo(7.2),
      startedAt: minutesAgo(7),
      pictures: [],
    },
  ],
} as unknown as GetDesignBandResponse;

// card 62: a failed «from my flat» run — its retry must carry the parent's params.flat
win.__bands[62] = {
  ...CAP,
  bench: [],
  runs: [
    {
      id: 95,
      kind: 'flat',
      status: 'failed',
      errorCode: 'timed_out',
      lastError: 'the image run passed its 6 min cap',
      requestedOutputs: 2,
      params: {
        layout: 'one',
        views: VIEWS,
        flat: {
          mode: 'hand_flat',
          structureRefs: [
            { mediaId: 801, role: 'front_flat' },
            { mediaId: 802, role: 'back_flat' },
          ],
        },
      },
      createdAt: minutesAgo(8),
      pictures: [],
    },
  ],
} as unknown as GetDesignBandResponse;

// card 55: FRONT and BACK from run 120, the detail `collar` from run 100 — stale
const plate = (id: number, runId: number, view: string, k: number) =>
  ({
    id,
    runId,
    kind: 'flat',
    ghostView: view,
    media: media(740 + k, win.__sheets[k % win.__sheets.length].url, 400, 400),
  }) as unknown as common_DesignPicture;
win.__bands[55] = {
  ...CAP,
  runs: [],
  bench: [
    ...VIEWS.map((viewKey, i) => ({
      id: 61 + i,
      viewKey,
      kind: 'flat',
      pictureId: i < 2 ? 401 + i : 0,
      picture: i < 2 ? plate(401 + i, 120, viewKey, i) : undefined,
      slotRev: 3,
    })),
    {
      id: 71,
      viewKey: 'detail',
      detailName: 'collar',
      kind: 'flat',
      pictureId: 411,
      picture: plate(411, 100, 'detail', 2),
      slotRev: 2,
      // server truth (GetDesignBand, 0400)
      stale: true,
      kept: false,
      staleAgainstRunId: 120,
    },
  ],
} as unknown as GetDesignBandResponse;

(window as unknown as { __flatMode: unknown }).__flatMode = { flatParamsFor, flatParamsForFix };

const thumb = (id: number) => win.__sheets[id % win.__sheets.length]?.url ?? '';

function RowFor({ card, technical }: { card: number; technical: boolean }) {
  const { band } = useDesignBand(card);
  const form = useForm({
    defaultValues: {
      concept: 'a strappy top',
      categoryId: 1,
      moodboardMedia: [],
      technicalMedia: technical
        ? [801, 802, 803].map((mediaId) => ({ mediaId, kind: '', caption: '', role: '' }))
        : [],
    },
  });
  if (!band.references) return null;
  return (
    <FormProvider {...form}>
      <Section title='input — references' question='— what this run is given'>
        <FlatRunRow band={band} techCardId={card} thumbOf={thumb} />
      </Section>
    </FormProvider>
  );
}

function Construction({ card }: { card: number }) {
  const { band } = useDesignBand(card);
  if (!band.references) return null;
  return (
    <Section title='what the model gets' question='— the construction section, read-only'>
      <FlatJoins techCardId={card} band={band} disabled title='construction' thumbOf={thumb} />
    </Section>
  );
}

function LatestBench({ card }: { card: number }) {
  const { band } = useDesignBand(card);
  if (!band.runs?.length) return null;
  return <LatestGeneration band={band} techCardId={card} />;
}

function Slots({ card }: { card: number }) {
  const { band } = useDesignBand(card);
  const form = useForm({ defaultValues: { concept: 'a top', categoryId: 1, moodboardMedia: [] } });
  if (!band.bench?.length) return null;
  return (
    <FormProvider {...form}>
      <Section title='flat slots' question='— stale details'>
        <Bench band={band} techCardId={card} />
      </Section>
    </FormProvider>
  );
}

const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
createRoot(document.getElementById('root') as HTMLElement).render(
  <QueryClientProvider client={qc}>
    <DictionaryProvider>
      <BrowserRouter>
        <TooltipProvider>
          <DesignCapabilityProvider value>
            <div style={{ width: 1100, padding: 24, background: '#f2f2f2' }}>
              <SectionStack>
                <div data-probe='construction'>
                  <Construction card={38} />
                </div>
                <div data-probe='auto'>
                  <RowFor card={49} technical={false} />
                </div>
                <div data-probe='modes'>
                  <RowFor card={60} technical />
                </div>
                {[50, 54, 51, 52, 62].map((card) => (
                  <div key={card} data-probe={`bench-${card}`}>
                    <PictureGalleryProvider techCardId={card} band={win.__bands[card]}>
                      <LatestBench card={card} />
                    </PictureGalleryProvider>
                  </div>
                ))}
                <div data-probe='slots-55'>
                  <PictureGalleryProvider techCardId={55} band={win.__bands[55]}>
                    <Slots card={55} />
                  </PictureGalleryProvider>
                </div>
              </SectionStack>
            </div>
          </DesignCapabilityProvider>
        </TooltipProvider>
      </BrowserRouter>
    </DictionaryProvider>
  </QueryClientProvider>,
);
