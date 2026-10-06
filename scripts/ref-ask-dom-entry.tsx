// DOM-стенд `ref-ask-probe.mjs` (T70): НАСТОЯЩИЙ `FlatRunRow` с входом из четырёх картинок, у одной
// есть роль (701 · front), у трёх нет (702, 703, 704). Сеть — `window.__api`, вызовы в `__calls`.
// SetDesignReferenceRole пишет роль в фикстуру полосы, так что перечитывание видит её.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { GetDesignBandResponse } from 'api/proto-http/admin';
import { DesignCapabilityProvider } from 'components/managers/tech-card/components/design/capability';
import { FlatRunRow } from 'components/managers/tech-card/components/design/flat-run-row';
import { useDesignBand } from 'components/managers/tech-card/components/design/use-design-band';
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

const CARD = 41;
const SIDES = ['front', 'back', 'side_l', 'side_r'];
const REF = 'TECH_CARD_MEDIA_KIND_REFERENCE';
const band = {
  bench: SIDES.map((viewKey, i) => ({
    id: i + 1,
    viewKey,
    kind: 'flat',
    pictureId: 0,
    slotRev: 1,
  })),
  references: [{ mediaId: 701, role: 'front', ordinal: 1 }],
  runs: [],
  totalRuns: 0,
} as unknown as GetDesignBandResponse;

// Pictures: plain grey squares with the id, so the screenshot reads.
const svg = (id: number, tone: string) =>
  `data:image/svg+xml;utf8,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><rect width="200" height="200" fill="${tone}"/><path d="M60 40h80l20 30-20 10v90H60V80L40 70z" fill="none" stroke="#111" stroke-width="3"/><text x="100" y="190" font-family="monospace" font-size="14" text-anchor="middle">${id}</text></svg>`,
  )}`;
const THUMBS: Record<number, string> = {
  701: svg(701, '#eee'),
  702: svg(702, '#ddd'),
  703: svg(703, '#e6e6e6'),
  704: svg(704, '#d4d4d4'),
};

// A token that is not expired, so the dictionary is read (the card's garment family → pictograms).
const b64 = (o: unknown) => btoa(JSON.stringify(o)).replace(/=+$/, '');
localStorage.setItem('authToken', `${b64({ alg: 'none' })}.${b64({ exp: 4102444800 })}.x`);

window.__api = {
  GetDictionary: () => ({
    dictionary: {
      categories: [
        { id: 1, name: 'outerwear', level: 'top_category' },
        { id: 2, name: 'coats', level: 'sub_category', parentId: 1 },
        { id: 3, name: 'coat', level: 'type', parentId: 2 },
      ],
    },
  }),
  GetDesignBand: () => structuredClone(band),
  SetDesignReferenceRole: (req) => {
    const r = req as { mediaId: number; role: string; ordinal: number; detailSlotId?: number };
    band.references = (band.references ?? []).filter((x) => x.mediaId !== r.mediaId);
    if (r.role) band.references.push({ ...r } as NonNullable<typeof band.references>[number]);
    return { reference: r };
  },
  SetDesignBenchSlot: () => ({ slot: { id: 77, viewKey: 'detail', kind: 'flat' } }),
  StartDesignRun: (req) => ({
    run: { id: 900, kind: 'flat', status: 'pending', params: (req as { params?: unknown }).params },
  }),
};

function Row() {
  const { band: current, serverSpeaks, isLoading } = useDesignBand(CARD);
  return (
    <DesignCapabilityProvider value={serverSpeaks}>
      <div data-probe-state={isLoading ? 'loading' : 'ready'} data-card={CARD}>
        <FlatRunRow band={current} techCardId={CARD} thumbOf={(id) => THUMBS[id] ?? ''} />
      </div>
    </DesignCapabilityProvider>
  );
}

function CardForm() {
  const form = useForm({
    defaultValues: {
      concept: 'a coat',
      categoryId: 3,
      moodboardMedia: [701, 702, 703, 704].map((mediaId) => ({ mediaId, kind: REF })),
    },
  });
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
    <DictionaryProvider>
      <BrowserRouter>
        <TooltipProvider>
          <div style={{ width: 900, padding: 40, background: '#fff' }}>
            <CardForm />
          </div>
        </TooltipProvider>
      </BrowserRouter>
    </DictionaryProvider>
  </QueryClientProvider>,
);
