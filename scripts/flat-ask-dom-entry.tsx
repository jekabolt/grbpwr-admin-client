// DOM-стенд `flat-ask-probe.mjs` (82-INPUT-REDESIGN, 06.10): НАСТОЯЩИЙ `FlatRunRow` над настоящим
// `useDesignBand`, сеть подменена одним слоем (`api/api` → `window.__api[метод]`, вызовы пишутся в
// `window.__calls`). Форма карточки несёт минимум доски (описание + категория), автосейва нет
// (`AUTOSAVE_OFF` → flush `off`, прогон пропускается) — GENERATE доходит до `StartDesignRun`.
//   · карточка 31 — пустые стороны, деталь `pocket` (заперта до видов);
//   · карточка 32 — FRONT и BACK заполнены, деталь `collar` пуста → `views again` + деталь открыта;
//     у неё фото с ролью и нет списка стыков → фоновое чтение списка для PARTS (M7), молча;
//   · карточка 33 — тот же верстак, те же id: ряд без пересева унёс бы сюда деталь карточки 32.
// `window.__probe.setCard(n)` меняет карточку у ЖИВОГО ряда (без перемонтирования).
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { GetDesignBandResponse } from 'api/proto-http/admin';
import { DesignCapabilityProvider } from 'components/managers/tech-card/components/design/capability';
import { DictionaryProvider } from 'lib/providers/dictionary-provider';
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

const SIDES = ['front', 'back', 'side_l', 'side_r'];
const pic = (id: number, runId: number) => ({ id, runId, kind: 'flat', media: { id: id + 1000 } });

const bands: Record<number, GetDesignBandResponse> = {
  31: {
    bench: [
      ...SIDES.map((viewKey, i) => ({
        id: i + 1,
        viewKey,
        kind: 'flat',
        pictureId: 0,
        slotRev: 1,
      })),
      { id: 11, viewKey: 'detail', detailName: 'pocket', kind: 'flat', pictureId: 0, slotRev: 1 },
    ],
    runs: [],
    totalRuns: 0,
  } as unknown as GetDesignBandResponse,
  32: {
    bench: [
      ...SIDES.map((viewKey, i) => ({
        id: 101 + i,
        viewKey,
        kind: 'flat',
        pictureId: i < 2 ? 501 + i : 0,
        picture: i < 2 ? pic(501 + i, 77) : undefined,
        slotRev: 2,
      })),
      { id: 21, viewKey: 'detail', detailName: 'collar', kind: 'flat', pictureId: 0, slotRev: 1 },
    ],
    references: [{ techCardId: 32, mediaId: 7001, role: 'front', ordinal: 1 }],
    runs: [],
    totalRuns: 0,
  } as unknown as GetDesignBandResponse,
};

// card 33: the same bench as 32 (same slot ids) — a row that does not reseed would carry 32's detail.
bands[33] = structuredClone(bands[32]);
bands[33].references = [];

window.__api = {
  GetDesignBand: (req) => structuredClone(bands[(req as { techCardId: number }).techCardId]),
  StartDesignRun: (req) => ({
    run: { id: 900, kind: 'flat', status: 'pending', params: (req as { params?: unknown }).params },
  }),
};

function Row() {
  const [card, setCard] = useState(31);
  window.__probe = { setCard };
  const { band: current, serverSpeaks, isLoading } = useDesignBand(card);
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

// Mutations retry once, as in the app (`src/index.tsx`): a refusal must not be retried (M8).
const qc = new QueryClient({
  defaultOptions: { queries: { retry: false, staleTime: 60_000 }, mutations: { retry: 1 } },
});
createRoot(document.getElementById('root') as HTMLElement).render(
  <QueryClientProvider client={qc}>
    <BrowserRouter>
      {/* M10: the row reads the card's category class (`useGarmentClass` → dictionary). */}
      <DictionaryProvider>
        <TooltipProvider>
          <div style={{ width: 900, padding: 40 }}>
            <CardForm />
          </div>
        </TooltipProvider>
      </DictionaryProvider>
    </BrowserRouter>
  </QueryClientProvider>,
);
