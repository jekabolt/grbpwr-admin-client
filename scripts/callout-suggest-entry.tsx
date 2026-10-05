// СТЕНД `suggest ✦` (T28, R36). НАСТОЯЩИЙ ArtifactsPanel в FormProvider над двумя карточными флэтами;
// сеть — только заглушка проб (`page.route`), бэкенд не трогается. Гоняется
// scripts/callout-suggest-probe.mjs.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { GetDesignBandResponse, common_TechCard } from 'api/proto-http/admin';
import { createRoot } from 'react-dom/client';
import { FormProvider, useForm, useWatch } from 'react-hook-form';
import { ArtifactsPanel } from 'components/managers/tech-card/components/design/artifacts-panel';
import {
  AutosaveContext,
  type AutosaveApi,
} from 'components/managers/tech-card/components/design/autosave-contract';
import { DictionaryProvider } from 'lib/providers/dictionary-provider';
import { useEditHistory } from 'ui/components/annotation/history';

const flat = (label: string) =>
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    `<svg xmlns='http://www.w3.org/2000/svg' width='400' height='500'><rect width='400' height='500' fill='#fff'/><path d='M120 60h160l60 80-40 30v290H100V170l-40-30z' fill='none' stroke='#111' stroke-width='3'/><text x='200' y='480' font-size='18' text-anchor='middle'>${label}</text></svg>`,
  );
const media = (id: number, label: string) => {
  const v = { mediaUrl: flat(label), width: 400, height: 500 };
  return { id, media: { fullSize: v, compressed: v, thumbnail: v } };
};

const techCard = {
  id: 7,
  resolvedTechnicalMedia: [
    { mediaId: 11, media: media(11, 'FRONT') },
    { mediaId: 12, media: media(12, 'BACK') },
  ],
} as unknown as common_TechCard;

/** Сейв карточки — журнал вызовов: проба проверяет, что `flush` пришёл ДО запроса подсказки. */
const log: string[] = ((window as unknown as { __log: string[] }).__log = []);
const autosave: AutosaveApi = {
  status: 'idle',
  request: () => {},
  flush: async (reason) => {
    log.push(`flush:${reason}`);
    return 'ok';
  },
};
// Сеть: всякий fetch пишется в журнал (порядок «сейв → запрос»).
const realFetch = window.fetch.bind(window);
window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
  log.push(`fetch:${String(input)}`);
  return realFetch(input, init);
};

function Panel() {
  const form = useForm({
    defaultValues: {
      technicalMedia: [
        { mediaId: 11, kind: 'TECH_CARD_MEDIA_KIND_FRONT' },
        { mediaId: 12, kind: 'TECH_CARD_MEDIA_KIND_BACK' },
      ],
      callouts: [],
      operations: [
        { operationNumber: 10, calloutNumber: 0 },
        { operationNumber: 20, calloutNumber: 0 },
      ],
      pieces: [],
      issues: [],
    } as never,
  });
  (window as unknown as { __form: unknown }).__form = form;
  return (
    <FormProvider {...form}>
      <WithHistory />
    </FormProvider>
  );
}

function WithHistory() {
  const callouts = (useWatch({ name: 'callouts' }) ?? []) as never[];
  const history = useEditHistory(callouts, () => {});
  return (
    <div data-bench='sheet' style={{ width: 1440, background: '#eee', padding: 16 }}>
      <ArtifactsPanel
        techCardId={7}
        band={{} as GetDesignBandResponse}
        techCard={techCard}
        calloutHistory={history as never}
      />
    </div>
  );
}

const qc = new QueryClient({
  defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
});
createRoot(document.getElementById('root')!).render(
  <QueryClientProvider client={qc}>
    <DictionaryProvider>
      <AutosaveContext.Provider value={autosave}>
        <Panel />
      </AutosaveContext.Provider>
    </DictionaryProvider>
  </QueryClientProvider>,
);
