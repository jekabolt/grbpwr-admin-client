// DOM-стенд `mood-guide-probe.mjs` (onboarding S5): НАСТОЯЩИЙ `StudioTab` на шаге MOODBOARD
// (`?step=mood`) над заглушенной сетью (`api/api` → `window.__api[метод]`) — композитор, доска,
// квиз, DESCRIPTION, четыре нижних блока и футер, ровно как их собирает студия. Проба монтирует
// карточку заново на каждый случай (`window.__st.mount`) и меряет, что на экране.
import { zodResolver } from '@hookform/resolvers/zod';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StudioTab } from 'components/managers/tech-card/components/design/studio-tab';
import {
  techCardDefaultData,
  techCardSchema,
  type TechCardFormData,
} from 'components/managers/tech-card/components/schema';
import { TechCardStagingProvider } from 'components/managers/tech-card/components/useTechCardStaging';
import { DictionaryProvider } from 'lib/providers/dictionary-provider';
import { createRoot, type Root } from 'react-dom/client';
import { FormProvider, useForm } from 'react-hook-form';
import { BrowserRouter } from 'react-router-dom';
import { TooltipProvider } from 'ui/components/tooltip';

type Case = {
  card: number;
  guided: boolean;
  concept?: string;
  pictures?: number;
  answers?: number;
};

declare global {
  interface Window {
    __api: Record<string, (body: unknown) => unknown>;
    __st: { mount: (c: Case) => void };
  }
}

const band = { bench: [], runs: [], totalRuns: 0 };
let answers = 0;
window.__api = {
  GetDesignBand: () => structuredClone(band),
  GetDesignQuizAnswers: () => ({
    answers: Array.from({ length: answers }, (_, i) => ({
      question: { id: `q${i}`, text: `question ${i}`, options: ['a', 'b'] },
      selected: ['a'],
      freeText: '',
      skipped: false,
    })),
    pending: [],
    pendingFamily: '',
  }),
};

function Card({ c }: { c: Case }) {
  const form = useForm<TechCardFormData>({
    resolver: zodResolver(techCardSchema) as never,
    defaultValues: {
      ...techCardDefaultData,
      name: 'guided coat',
      styleNumber: 'GP-01',
      categoryId: 1,
      concept: c.concept ?? '',
      moodboardMedia: Array.from({ length: c.pictures ?? 0 }, (_, i) => ({
        mediaId: 500 + i,
        kind: 'TECH_CARD_MEDIA_KIND_MOODBOARD',
        caption: '',
      })),
    } as never,
  });
  return (
    <FormProvider {...form}>
      <form>
        <fieldset>
          <StudioTab
            techCardId={c.card}
            guided={c.guided}
            navTo={() => {}}
            cardDetails={<div data-probe-card-details='' />}
          />
        </fieldset>
      </form>
    </FormProvider>
  );
}

let root: Root | null = null;
window.__st = {
  mount: (c) => {
    answers = c.answers ?? 0;
    root?.unmount();
    window.history.replaceState(null, '', `/?tab=studio&step=mood&card=${c.card}`);
    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: 60_000 }, mutations: { retry: false } },
    });
    root = createRoot(document.getElementById('root') as HTMLElement);
    root.render(
      <QueryClientProvider client={qc}>
        <BrowserRouter>
          <TooltipProvider>
            <DictionaryProvider>
              <TechCardStagingProvider>
                <div data-probe-case={c.card} style={{ width: 1100, padding: 32 }}>
                  <Card c={c} />
                </div>
              </TechCardStagingProvider>
            </DictionaryProvider>
          </TooltipProvider>
        </BrowserRouter>
      </QueryClientProvider>,
    );
  },
};
