// СТЕНД ТАБЛИЦЫ SIDES (FABRIC RENDER, лейн AF, пп. 45–46). Монтирует НАСТОЯЩИЙ `SidesSection` над
// верстаком, где каждая плита пришла из прогона (`run r7` / `run r3` — ровно то, что владелец
// просил убрать), и пустыми ячейками рядом — их рост сверяется с плитой.
// Прогоняется `scripts/sides-plate-probe.mjs`.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { GetDesignBandResponse, common_AdminColorwayRef } from 'api/proto-http/admin';
import { createRoot } from 'react-dom/client';
import { FormProvider, useForm } from 'react-hook-form';
import { MemoryRouter } from 'react-router-dom';
import { DesignCapabilityProvider } from 'components/managers/tech-card/components/design/capability';
import { PictureGalleryProvider } from 'components/managers/tech-card/components/design/picture-tile';
import { SidesSection } from 'components/managers/tech-card/components/design/render/side-row';
import {
  techCardDefaultData,
  type TechCardFormData,
} from 'components/managers/tech-card/components/schema';
import { DictionaryProvider } from 'lib/providers/dictionary-provider';

const IMG =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    "<svg xmlns='http://www.w3.org/2000/svg' width='400' height='500'><rect width='400' height='500' fill='#ddd'/></svg>",
  );
const media = (id: number) => ({
  id,
  media: {
    fullSize: { mediaUrl: IMG, width: 400, height: 500 },
    thumbnail: { mediaUrl: IMG, width: 400, height: 500 },
  },
});
const pic = (id: number, runId: number, kind: string, view: string, colorwayId: number) => ({
  id,
  techCardId: 7,
  runId,
  kind,
  ghostView: view,
  colorwayId,
  media: media(id * 10),
  layerRev: 0,
  ordinal: id,
  selected: false,
  createdAt: '2026-09-01T10:00:00Z',
});
const slot = (
  id: number,
  kind: string,
  view: string,
  p: ReturnType<typeof pic> | null,
  rev: number,
  colorwayId = 0,
) => ({
  id,
  viewKey: view,
  kind,
  pictureId: p ? p.id : 0,
  slotRev: rev,
  picture: p ?? undefined,
  colorwayId,
  runKind: kind,
  runRrev: rev,
});
const run = (id: number, kind: string, rrev: number, pictures: unknown[], colorwayId: number) => ({
  id,
  techCardId: 7,
  kind,
  status: 'done',
  rrev,
  pictures,
  params: { views: ['front'], colorwayId },
  createdAt: '2026-09-02T10:00:00Z',
  completedAt: '2026-09-02T10:00:00Z',
});

const flatF = pic(11, 1, 'flat', 'front', 0);
const flatB = pic(12, 1, 'flat', 'back', 0);
const sampF = pic(21, 52, 'render', 'front', 0);
const rossoF = pic(31, 3, 'render', 'front', 5);
const runs = [
  run(3, 'render', 3, [rossoF], 5),
  run(52, 'render', 2, [sampF], 0),
  run(1, 'flat', 7, [flatF, flatB], 0),
];
const BAND = {
  bench: [
    slot(1, 'flat', 'front', flatF, 7),
    slot(2, 'flat', 'back', flatB, 7),
    slot(3, 'render', 'front', sampF, 1, 0),
    slot(4, 'render', 'front', rossoF, 3, 5),
  ],
  runs,
  outputs: [],
  assets: [],
  colourRecipes: [],
  references: [],
  layers: [],
  batches: [],
  renderBenchColorwayIds: [0, 5],
  hasFabricRender: true,
  totalRuns: runs.length,
  archivedRuns: 0,
  maxRrev: 7,
  hiddenByRun: {},
  hiddenByBatch: {},
  benchAdoptsUnattributed: true,
} as unknown as GetDesignBandResponse;
const CW = [
  {
    colorwayId: 5,
    colorCode: 'RED',
    devName: 'ROSSO',
    devHex: '#B3202A',
    status: 'COLORWAY_LIFECYCLE_STATUS_ACTIVE',
  },
] as unknown as common_AdminColorwayRef[];

function Harness() {
  const methods = useForm<TechCardFormData>({ defaultValues: { ...techCardDefaultData } as never });
  return (
    <FormProvider {...methods}>
      <DesignCapabilityProvider value>
        <PictureGalleryProvider>
          <div style={{ padding: 24 }}>
            <SidesSection
              band={BAND}
              techCardId={7}
              colorways={CW}
              cardColorways={CW}
              targetColorwayId={5}
              onPickColorway={() => {}}
              onCreateColorway={() => {}}
              onGoToKind={() => {}}
            />
          </div>
        </PictureGalleryProvider>
      </DesignCapabilityProvider>
    </FormProvider>
  );
}

const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
createRoot(document.getElementById('root') as HTMLElement).render(
  <MemoryRouter initialEntries={['/tech-cards/7']}>
    <QueryClientProvider client={qc}>
      <DictionaryProvider>
        <Harness />
      </DictionaryProvider>
    </QueryClientProvider>
  </MemoryRouter>,
);
