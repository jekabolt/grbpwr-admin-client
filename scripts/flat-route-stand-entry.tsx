// СТЕНД ФЛЭТ-МАРШРУТА (05.10): настоящие `FlatJoins` и `LatestGeneration` над поддельной полосой.
//   · joins     (карточка 38) — список A из tmp/plans/flat-consistency/out/layers/joins-A.json:
//                3 слоя, отсутствия, вопросы, фото не согласны; первая запись SetDesignJoins
//                отвечает 409 (CAS) — правка повторяется на свежей полосе;
//   · auto      (карточка 49) — полосы без списка: GenerateDesignJoins уходит сам, `reading…`;
//   · cands     (карточка 50) — прогон флэта на 4 кандидата, второй с меткой `grey`; ни один не режется,
//                пока не выбран; `pick` → режется только выбранный;
//   · failed    (карточка 51) — `timed_out`, без картинок: `timed out · retry`;
//   · late      (карточка 52) — живой прогон 7 минут: `taking too long`, `cancel` на виду.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { GetDesignBandResponse, common_DesignPicture } from 'api/proto-http/admin';
import { createRoot } from 'react-dom/client';
import { Section, SectionStack } from 'ui/components/section';
import { DesignCapabilityProvider } from 'components/managers/tech-card/components/design/capability';
import { PictureGalleryProvider } from 'components/managers/tech-card/components/design/picture-tile';
import { FlatJoins } from 'components/managers/tech-card/components/design/flat-joins';
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

// card 50: four candidate sheets
const CAP = { imageRunCapSeconds: 360, cappedRunKinds: ['flat', 'render'] };
win.__bands[50] = {
  ...CAP,
  bench: VIEWS.map((viewKey, i) => ({
    id: i + 1,
    viewKey,
    kind: 'flat',
    pictureId: 0,
    slotRev: 1,
  })),
  runs: [
    {
      id: 90,
      kind: 'flat',
      status: 'done',
      requestedOutputs: 4,
      params: { layout: 'one', views: VIEWS },
      createdAt: minutesAgo(3),
      pictures: win.__sheets.map(
        (s, i) =>
          ({
            id: 300 + i,
            runId: 90,
            kind: 'flat',
            ordinal: i,
            compositeViews: VIEWS,
            flags: i === 1 ? ['grey'] : [],
            media: media(700 + i, s.url, s.w, s.h),
          }) as unknown as common_DesignPicture,
      ),
    },
  ],
} as unknown as GetDesignBandResponse;

// card 53: the same four candidates, the SECOND already cut on the server (two pieces), while this
// browser remembers the THIRD as picked — the cut one is the pick, nothing else is cut.
try {
  window.localStorage.setItem('grbpwr.design.flat.pick.53', JSON.stringify({ '93': 302 }));
} catch {
  /* no storage */
}
win.__bands[53] = {
  ...CAP,
  bench: VIEWS.map((viewKey, i) => ({
    id: i + 1,
    viewKey,
    kind: 'flat',
    pictureId: 0,
    slotRev: 1,
  })),
  runs: [
    {
      id: 93,
      kind: 'flat',
      status: 'done',
      requestedOutputs: 4,
      params: { layout: 'one', views: VIEWS },
      createdAt: minutesAgo(3),
      pictures: [
        ...win.__sheets.map(
          (s, i) =>
            ({
              id: 300 + i,
              runId: 93,
              kind: 'flat',
              ordinal: i,
              compositeViews: VIEWS,
              media: media(700 + i, s.url, s.w, s.h),
            }) as unknown as common_DesignPicture,
        ),
        ...['front', 'back'].map(
          (v, k) =>
            ({
              id: 320 + k,
              runId: 93,
              kind: 'flat',
              derivation: 'crop',
              derivedFrom: 301,
              ghostView: v,
              media: media(720 + k, win.__sheets[1].url, 400, 400),
            }) as unknown as common_DesignPicture,
        ),
      ],
    },
  ],
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

function Joins({ card }: { card: number }) {
  const { band } = useDesignBand(card);
  if (!band.references) return null;
  return (
    <Section title='input — references' question='— what this run is given'>
      <FlatJoins
        techCardId={card}
        band={band}
        thumbOf={(id) => win.__sheets[id % win.__sheets.length]?.url ?? ''}
      />
    </Section>
  );
}

function Bench({ card }: { card: number }) {
  const { band } = useDesignBand(card);
  if (!band.runs?.length) return null;
  return <LatestGeneration band={band} techCardId={card} />;
}

const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
createRoot(document.getElementById('root') as HTMLElement).render(
  <QueryClientProvider client={qc}>
    <DesignCapabilityProvider value>
      <div style={{ width: 1100, padding: 24, background: '#f2f2f2' }}>
        <SectionStack>
          <div data-probe='joins'>
            <Joins card={38} />
          </div>
          <div data-probe='auto'>
            <Joins card={49} />
          </div>
          {[50, 53, 51, 52].map((card) => (
            <div key={card} data-probe={`bench-${card}`}>
              <PictureGalleryProvider techCardId={card} band={win.__bands[card]}>
                <Bench card={card} />
              </PictureGalleryProvider>
            </div>
          ))}
        </SectionStack>
      </div>
    </DesignCapabilityProvider>
  </QueryClientProvider>,
);
