// DOM-стенд `mood-roles-probe.mjs` (E3): НАСТОЯЩИЙ `MoodBoard` над заглушенной сетью; три картинки
// на доске, у второй роль уже стоит (`detail`). Окно отдаёт пробе форму и круг маппера
// форма → proto → форма (`window.__roundTrip`).
import { zodResolver } from '@hookform/resolvers/zod';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type {
  common_MediaFull,
  common_TechCard,
  GetDesignBandResponse,
} from 'api/proto-http/admin';
import { DesignCapabilityProvider } from 'components/managers/tech-card/components/design/capability';
import { DraftedProvider } from 'components/managers/tech-card/components/design/head/drafted-provider';
import { MoodBoard } from 'components/managers/tech-card/components/design/mood-board';
import { PickModeProvider } from 'components/managers/tech-card/components/design/pick-mode';
import { PictureGalleryProvider } from 'components/managers/tech-card/components/design/picture-tile';
import {
  mapFormToTechCardInsert,
  mapTechCardToForm,
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
    __rolesForm: () => TechCardFormData;
    __roundTrip: () => unknown;
  }
}

const IDS = [101, 102, 103];
const COLORS = ['#c9c2b8', '#8a8f96', '#4b4a48'];
const media = (id: number, n: number): common_MediaFull =>
  ({
    id,
    media: {
      fullSize: { mediaUrl: `http://probe.local/img/${id}.svg`, width: 600, height: 800 },
      thumbnail: { mediaUrl: `http://probe.local/img/${id}.svg`, width: 600, height: 800 },
      compressed: { mediaUrl: `http://probe.local/img/${id}.svg`, width: 600, height: 800 },
      blurhash: '',
    },
    _n: n,
  }) as unknown as common_MediaFull;
(window as unknown as { __colors: Record<number, string> }).__colors = Object.fromEntries(
  IDS.map((id, n) => [id, COLORS[n]]),
);

// M15: 103 was taken out of the prompt (label_state held) — the board keeps it, flagged «not sent».
const band = {
  bench: [],
  runs: [],
  totalRuns: 0,
  references: [
    { mediaId: 103, role: 'back', labelState: 'held', labelSource: 'model_cheap', ordinal: 3 },
  ],
} as unknown as GetDesignBandResponse;
window.__api = {
  GetDesignBand: () => structuredClone(band),
  SetDesignReferenceHeld: (req) => {
    const r = req as { mediaId: number; held: boolean };
    const ref = (band.references ?? []).find((x) => x.mediaId === r.mediaId);
    if (ref) ref.labelState = r.held ? 'held' : 'ok';
    return { reference: ref };
  },
  ListObjectsPaged: () => ({ list: IDS.map(media) }),
};

function Card() {
  const form = useForm<TechCardFormData>({
    resolver: zodResolver(techCardSchema) as never,
    defaultValues: {
      ...techCardDefaultData,
      categoryId: 1,
      moodboardMedia: IDS.map((mediaId, n) => ({
        mediaId,
        kind: 'TECH_CARD_MEDIA_KIND_MOODBOARD',
        caption: '',
        role: n === 1 ? 'detail' : '',
      })),
    } as never,
  });
  window.__rolesForm = () => form.getValues();
  window.__roundTrip = () => {
    const sent = mapFormToTechCardInsert(form.getValues());
    const back = mapTechCardToForm({ techCard: sent } as unknown as common_TechCard);
    return { sent: sent.moodboardMedia, back: back.moodboardMedia };
  };
  return (
    <FormProvider {...form}>
      <form>
        <fieldset>
          <DraftedProvider techCardId={7}>
            <MoodBoard techCardId={7} />
          </DraftedProvider>
        </fieldset>
      </form>
    </FormProvider>
  );
}

const qc = new QueryClient({
  defaultOptions: { queries: { retry: false, staleTime: 60_000 }, mutations: { retry: false } },
});
createRoot(document.getElementById('root') as HTMLElement).render(
  <QueryClientProvider client={qc}>
    <BrowserRouter>
      <TooltipProvider>
        <DictionaryProvider>
          <TechCardStagingProvider>
            <DesignCapabilityProvider value={true}>
              <PictureGalleryProvider techCardId={7} band={band}>
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
