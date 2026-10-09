// DOM-стенд `mood-description-probe.mjs` (T33): НАСТОЯЩИЙ `MoodBoard` (а с ним и
// `ConstructionDraft`, который доска монтирует) над заглушенной сетью (`api/api` →
// `window.__api[метод]`). Вопрос пробы — вёрстка блока, а не прогон: DESCRIPTION и черновик
// стоят одной `Section`, поля описания первыми, ряд GENERATE следом; действия шапки — слова.
import { zodResolver } from '@hookform/resolvers/zod';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { GetDesignBandResponse } from 'api/proto-http/admin';
import { DesignCapabilityProvider } from 'components/managers/tech-card/components/design/capability';
import { DraftedProvider } from 'components/managers/tech-card/components/design/head/drafted-provider';
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
  }
}

const band = { bench: [], runs: [], totalRuns: 0 } as unknown as GetDesignBandResponse;
window.__api = { GetDesignBand: () => structuredClone(band) };

function Card() {
  const form = useForm<TechCardFormData>({
    resolver: zodResolver(techCardSchema) as never,
    defaultValues: {
      ...techCardDefaultData,
      concept: 'a boxy coat, dropped shoulder, two patch pockets',
      categoryId: 1,
    } as never,
  });
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
