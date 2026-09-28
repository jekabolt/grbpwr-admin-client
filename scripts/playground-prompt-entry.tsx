// Точка входа пробы «поле промпта PLAYGROUND живьём» (C-15 Ideas от сервера, C-16 Recently used
// «on this card»): НАСТОЯЩИЙ `WorkflowPanel` открытой плитки и НАСТОЯЩИЙ `MaskEditor` плитки 10 под
// тем же стеком провайдеров, что у студии, сеть заглушена (проба сама отвечает на `SuggestPrompts`
// — когда захочет и как захочет).
//
// Здесь не переписано ни одной проверяемой строки: черновик живёт в состоянии обёртки ровно как в
// студии (`onDraft(fn)`), полоса — фикстура пробы. `reset` возвращает модульную память Ideas
// (кэш ответов, выключатель сессии) к началу — между группами, не внутри них.
import type { GetDesignBandResponse, common_MediaFull } from 'api/proto-http/admin';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DesignCapabilityProvider } from 'components/managers/tech-card/components/design/capability';
import { PictureGalleryProvider } from 'components/managers/tech-card/components/design/picture-tile';
import { resetServerIdeasForProbe } from 'components/managers/tech-card/components/design/playground/ideas-server';
import { MaskEditor } from 'components/managers/tech-card/components/design/playground/mask/mask-editor';
import { rememberRecentText } from 'components/managers/tech-card/components/design/playground/recent';
import { workflowByKey } from 'components/managers/tech-card/components/design/playground/registry';
import { initialDraft } from 'components/managers/tech-card/components/design/playground/registry/common';
import type { Draft } from 'components/managers/tech-card/components/design/playground/registry/types';
import { WorkflowPanel } from 'components/managers/tech-card/components/design/playground/workflow-panel';
import { designKeys } from 'components/managers/tech-card/components/design/use-design-band';
import { DictionaryProvider } from 'lib/providers/dictionary-provider';
import { useSnackBarStore } from 'lib/stores/store';
import { useState, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { FormProvider, useForm } from 'react-hook-form';
import { BrowserRouter } from 'react-router-dom';
import { ENHANCE_MODES } from 'ui/components/ai-enhance';
import { TooltipProvider } from 'ui/components/tooltip';

const CARD = 7;

function Panel({
  wf,
  band,
  over,
}: {
  wf: string;
  band: GetDesignBandResponse;
  over: Partial<Draft>;
}) {
  const def = workflowByKey(wf)!;
  const [draft, setDraft] = useState<Draft>(() => ({ ...initialDraft(def.run), ...over }));
  return (
    <div style={{ maxWidth: 560, padding: 24, display: 'flex', flexDirection: 'column', gap: 32 }}>
      <WorkflowPanel
        def={def}
        run={def.run!}
        band={band}
        techCardId={CARD}
        draft={draft}
        onDraft={(fn) => setDraft(fn)}
      />
    </div>
  );
}

function CardForm({ children }: { children: ReactNode }) {
  const form = useForm();
  return <FormProvider {...form}>{children}</FormProvider>;
}

type Probe = {
  mount: (wf: string, band: GetDesignBandResponse, over?: Partial<Draft>) => void;
  mask: (band: GetDesignBandResponse, media: common_MediaFull) => void;
  reset: () => void;
  remember: (wf: string, field: string, text: string) => void;
  alerts: () => string[];
  /** The generic `ai ✦` menu's modes (group K: `steer` is never one of them). */
  enhanceModes: () => string[];
};

declare global {
  interface Window {
    __pp: Probe;
  }
}

let root: Root | null = null;
function render(band: GetDesignBandResponse, body: ReactNode) {
  useSnackBarStore.setState({ alerts: [] });
  root?.unmount();
  root = createRoot(document.getElementById('root')!);
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: 60_000 }, mutations: { retry: false } },
  });
  // The band as the studio's query holds it: the mask editor reads the card's band from it.
  qc.setQueryData(designKeys.band(CARD), band);
  root.render(
    <QueryClientProvider client={qc}>
      <DictionaryProvider>
        <DesignCapabilityProvider value={true}>
          <BrowserRouter>
            <TooltipProvider>
              <CardForm>
                <PictureGalleryProvider techCardId={CARD} band={band}>
                  {body}
                </PictureGalleryProvider>
              </CardForm>
            </TooltipProvider>
          </BrowserRouter>
        </DesignCapabilityProvider>
      </DictionaryProvider>
    </QueryClientProvider>,
  );
}

window.__pp = {
  mount: (wf, band, over = {}) =>
    render(band, <Panel key={`${wf}-${Math.random()}`} wf={wf} band={band} over={over} />),
  mask: (band, media) =>
    render(
      band,
      <MaskEditor open onOpenChange={() => {}} techCardId={CARD} media={media} label='picture 1' />,
    ),
  reset: () => {
    resetServerIdeasForProbe();
    try {
      localStorage.clear();
    } catch {
      /* no storage — the lists live in memory */
    }
  },
  remember: (wf, field, text) =>
    rememberRecentText(`plm.playground.recent.v1:${wf}.${field}`, text),
  alerts: () => useSnackBarStore.getState().alerts.map((a) => a.message),
  enhanceModes: () => ENHANCE_MODES.map((m) => m.mode),
};
