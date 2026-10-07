// DOM-стенд `mood-detail-gone-probe.mjs` (07.10 D3, Q3): НАСТОЯЩИЙ `MoodBoard` над заглушенной сетью.
// Фото деталей на доске: 201 — ярлык ЧЕЛОВЕКА на детали модели 77 «back hem», 202 — ярлык МОДЕЛИ
// на детали модели 78 «cuff», 203 — ярлык человека на детали человека 79 «collar», 204 + 205 — два
// фото человека на детали модели 80 «strap», 206 — на детали модели 81 «pocket» (сохранение падает).
// Заглушка сервера ведёт себя как store: запись роли и фоновый синк (`window.__sync`) сносят деталь
// модели без фото. Автосейв — заглушка: `window.__flushAnswer` решает исход flush, каждый flush
// пишется в `__bodies`.
import { zodResolver } from '@hookform/resolvers/zod';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { common_MediaFull, GetDesignBandResponse } from 'api/proto-http/admin';
import { DesignCapabilityProvider } from 'components/managers/tech-card/components/design/capability';
import { DraftedProvider } from 'components/managers/tech-card/components/design/head/drafted-provider';
import {
  AUTOSAVE_OFF,
  AutosaveContext,
  type AutosaveApi,
  type FlushResult,
} from 'components/managers/tech-card/components/design/autosave-contract';
import { MoodBoard } from 'components/managers/tech-card/components/design/mood-board';
import { PickModeProvider } from 'components/managers/tech-card/components/design/pick-mode';
import { PictureGalleryProvider } from 'components/managers/tech-card/components/design/picture-tile';
import {
  techCardDefaultData,
  techCardSchema,
  type TechCardFormData,
} from 'components/managers/tech-card/components/schema';
import { TechCardStagingProvider } from 'components/managers/tech-card/components/useTechCardStaging';
import { DictionaryProvider } from 'lib/providers/dictionary-provider';
import { createRoot } from 'react-dom/client';
import { FormProvider, useForm } from 'react-hook-form';
import { BrowserRouter } from 'react-router-dom';
import { TooltipProvider } from 'ui/components/tooltip';

declare global {
  interface Window {
    __api: Record<string, (body: unknown) => unknown>;
    __sync: (board: number[]) => void;
    __cachedBench: () => number[] | null;
  }
}

const IDS = [201, 202, 203, 204, 205, 206];

const media = (id: number): common_MediaFull =>
  ({
    id,
    media: {
      fullSize: { mediaUrl: `http://probe.local/img/${id}.svg`, width: 600, height: 800 },
      thumbnail: { mediaUrl: `http://probe.local/img/${id}.svg`, width: 600, height: 800 },
      compressed: { mediaUrl: `http://probe.local/img/${id}.svg`, width: 600, height: 800 },
      blurhash: '',
    },
  }) as unknown as common_MediaFull;

type Ref = {
  mediaId: number;
  role: string;
  detailSlotId?: number;
  labelState: string;
  labelSource: string;
  ordinal: number;
};
const slot = (id: number, name: string, madeByModel: boolean) => ({
  id,
  viewKey: 'detail',
  kind: 'flat',
  colorwayId: 0,
  detailName: name,
  madeByModel,
});
const band = {
  bench: [
    slot(77, 'back hem', true),
    slot(78, 'cuff', true),
    slot(79, 'collar', false),
    slot(80, 'strap', true),
    slot(81, 'pocket', true),
  ],
  runs: [],
  totalRuns: 0,
  references: [
    {
      mediaId: 201,
      role: 'detail',
      detailSlotId: 77,
      labelState: 'ok',
      labelSource: 'human',
      ordinal: 1,
    },
    {
      mediaId: 202,
      role: 'detail',
      detailSlotId: 78,
      labelState: 'ok',
      labelSource: 'model_strong',
      ordinal: 2,
    },
    {
      mediaId: 203,
      role: 'detail',
      detailSlotId: 79,
      labelState: 'ok',
      labelSource: 'human',
      ordinal: 3,
    },
    {
      mediaId: 204,
      role: 'detail',
      detailSlotId: 80,
      labelState: 'ok',
      labelSource: 'human',
      ordinal: 4,
    },
    {
      mediaId: 205,
      role: 'detail',
      detailSlotId: 80,
      labelState: 'ok',
      labelSource: 'human',
      ordinal: 5,
    },
    {
      mediaId: 206,
      role: 'detail',
      detailSlotId: 81,
      labelState: 'ok',
      labelSource: 'human',
      ordinal: 6,
    },
  ] as Ref[],
};
const refs = () => band.references;
/** The store's `dropOrphanModelSlots`: a model's detail with no plate and no travelling label goes. */
const dropOrphans = () => {
  band.bench = band.bench.filter(
    (s) => !s.madeByModel || refs().some((r) => r.detailSlotId === s.id && r.labelState !== 'held'),
  );
};
window.__api = {
  GetDesignBand: () => structuredClone(band) as unknown as GetDesignBandResponse,
  SetDesignReferenceRole: (req) => {
    const r = req as { mediaId: number; role: string; detailSlotId?: number; ordinal: number };
    const at = refs().findIndex((x) => x.mediaId === r.mediaId);
    const next: Ref = {
      mediaId: r.mediaId,
      role: r.role,
      detailSlotId: r.role === 'detail' ? r.detailSlotId : 0,
      labelState: 'ok',
      labelSource: 'human',
      ordinal: r.ordinal,
    };
    if (at >= 0) refs()[at] = next;
    else refs().push(next);
    dropOrphans();
    return r.role ? { reference: next } : {};
  },
  ListObjectsPaged: () => ({ list: IDS.map(media) }),
};
/** The background sync a save kicks: the MODEL rows of pictures off the board go, then the orphans. */
window.__sync = (board) => {
  band.references = refs().filter((r) => board.includes(r.mediaId) || r.labelSource === 'human');
  dropOrphans();
};

/** The card's autosave: the probe says how the next flush ends; every flush is logged in order. */
(window as unknown as { __flushAnswer: string }).__flushAnswer = 'ok';
const autosave: AutosaveApi = {
  ...AUTOSAVE_OFF,
  status: 'idle',
  flush: async () => {
    const w = window as unknown as { __bodies?: unknown[]; __flushAnswer: string };
    (w.__bodies = w.__bodies ?? []).push({ name: 'flush', body: w.__flushAnswer });
    return w.__flushAnswer as FlushResult;
  },
};

function Card() {
  const form = useForm<TechCardFormData>({
    resolver: zodResolver(techCardSchema) as never,
    defaultValues: {
      ...techCardDefaultData,
      categoryId: 1,
      moodboardMedia: IDS.map((mediaId) => ({
        mediaId,
        kind: 'TECH_CARD_MEDIA_KIND_MOODBOARD',
        caption: '',
        role: 'detail',
      })),
    } as never,
  });
  return (
    <FormProvider {...form}>
      <form>
        <fieldset>
          <AutosaveContext.Provider value={autosave}>
            <DraftedProvider techCardId={7}>
              <MoodBoard techCardId={7} />
            </DraftedProvider>
          </AutosaveContext.Provider>
        </fieldset>
      </form>
    </FormProvider>
  );
}

const qc = new QueryClient({
  defaultOptions: { queries: { retry: false, staleTime: 60_000 }, mutations: { retry: false } },
});
window.__cachedBench = () => {
  const d = qc
    .getQueryCache()
    .findAll()
    .map((q) => q.state.data as { bench?: { id?: number }[] } | undefined)
    .find((x) => Array.isArray(x?.bench));
  return d ? (d.bench ?? []).map((s) => s.id ?? 0) : null;
};
createRoot(document.getElementById('root') as HTMLElement).render(
  <QueryClientProvider client={qc}>
    <BrowserRouter>
      <TooltipProvider>
        <DictionaryProvider>
          <TechCardStagingProvider>
            <DesignCapabilityProvider value={true}>
              <PictureGalleryProvider
                techCardId={7}
                band={band as unknown as GetDesignBandResponse}
              >
                <PickModeProvider>
                  <div data-probe-ready='' style={{ width: 1100, padding: 32 }}>
                    <Card />
                  </div>
                </PickModeProvider>
              </PictureGalleryProvider>
            </DesignCapabilityProvider>
          </TechCardStagingProvider>
        </DictionaryProvider>
      </TooltipProvider>
    </BrowserRouter>
  </QueryClientProvider>,
);
