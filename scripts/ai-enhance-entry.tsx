// DOM-стенд `ai-enhance-probe.mjs` (item 41): НАСТОЯЩИЕ поля техкарты над заглушенной сетью —
// аспекты CONSTRUCTION (`DetailsEditor`) и общий `TextareaField` с `enhance` (заметки
// CONSTRUCTION). Вопрос пробы: на активном поле с текстом стоит `ai ✦`, и это подчёркнутое
// слово без обводки.
import { zodResolver } from '@hookform/resolvers/zod';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DesignCapabilityProvider } from 'components/managers/tech-card/components/design/capability';
import { DraftedProvider } from 'components/managers/tech-card/components/design/head/drafted-provider';
import { DetailsEditor } from 'components/managers/tech-card/components/details-editor';
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
import TextareaField from 'ui/form/fields/textarea-field';

declare global {
  interface Window {
    __api: Record<string, (body: unknown) => unknown>;
  }
}
window.__api = {};

function Card() {
  const form = useForm<TechCardFormData>({
    resolver: zodResolver(techCardSchema) as never,
    defaultValues: {
      ...techCardDefaultData,
      categoryId: 1,
      details: [{ key: 'collar', text: 'stand collar, four centimetres', mediaIds: [] }],
      construction: { ...techCardDefaultData.construction, notes: 'press all seams open' },
    } as never,
  });
  return (
    <FormProvider {...form}>
      <form>
        <fieldset>
          <DraftedProvider techCardId={7}>
            <DetailsEditor />
            <div data-probe-notes='' style={{ marginTop: 24 }}>
              <TextareaField
                name='construction.notes'
                label='notes'
                rows={2}
                maxLength={2000}
                enhance='note'
              />
            </div>
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
              <div data-probe-ready='' style={{ width: 900, padding: 32 }}>
                <Card />
              </div>
            </DesignCapabilityProvider>
          </TechCardStagingProvider>
        </DictionaryProvider>
      </TooltipProvider>
    </BrowserRouter>
  </QueryClientProvider>,
);
