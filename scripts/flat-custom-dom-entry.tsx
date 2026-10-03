// DOM-стенд `flat-custom-probe.mjs` (гейт волны 3, W1 / W8): НАСТОЯЩИЙ `FlatRunRow` над настоящим
// `useDesignBand`, сеть подменена одним слоем (`api/api` → `window.__api[метод]`, вызовы пишутся в
// `window.__calls`). Форма карточки несёт минимум доски (описание + категория), автосейва нет
// (`AUTOSAVE_OFF` → flush `off`, прогон пропускается) — GENERATE доходит до `StartDesignRun`.
//
// `window.__probe.setCard(n)` меняет карточку у ЖИВОГО ряда (без перемонтирования), как страница,
// которая держит ряд и меняет ему `techCardId`.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { GetDesignBandResponse } from 'api/proto-http/admin';
import { DesignCapabilityProvider } from 'components/managers/tech-card/components/design/capability';
import { FlatRunRow } from 'components/managers/tech-card/components/design/flat-run-row';
import { useDesignBand } from 'components/managers/tech-card/components/design/use-design-band';
import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { FormProvider, useForm } from 'react-hook-form';
import { BrowserRouter } from 'react-router-dom';
import { TooltipProvider } from 'ui/components/tooltip';

declare global {
  interface Window {
    __api: Record<string, (body: unknown) => unknown>;
    __probe: { setCard: (n: number) => void };
  }
}

const bench = ['front', 'back', 'side_l', 'side_r'].map((viewKey, i) => ({
  id: i + 1,
  viewKey,
  kind: 'flat',
  pictureId: 0,
  slotRev: 1,
}));
const band = { bench, runs: [], totalRuns: 0 } as unknown as GetDesignBandResponse;

window.__api = {
  GetDesignBand: () => structuredClone(band),
  StartDesignRun: (req) => ({
    run: { id: 900, kind: 'flat', status: 'pending', params: (req as { params?: unknown }).params },
  }),
};

function Row() {
  const [card, setCard] = useState(31);
  window.__probe = { setCard };
  const { band: current, serverSpeaks, isLoading } = useDesignBand(card);
  // Ряд НЕ снимается на время чтения полосы новой карточки: смена карточки — у живого ряда.
  return (
    <DesignCapabilityProvider value={serverSpeaks}>
      <div data-probe-state={isLoading ? 'loading' : 'ready'} data-card={card}>
        <FlatRunRow band={current} techCardId={card} />
      </div>
    </DesignCapabilityProvider>
  );
}

function CardForm() {
  const form = useForm({ defaultValues: { concept: 'a coat', categoryId: 1, moodboardMedia: [] } });
  return (
    <FormProvider {...form}>
      <Row />
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
        <div style={{ width: 900, padding: 40 }}>
          <CardForm />
        </div>
      </TooltipProvider>
    </BrowserRouter>
  </QueryClientProvider>,
);
