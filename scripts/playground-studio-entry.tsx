// Точка входа пробы «PLAYGROUND живьём» (G-01): НАСТОЯЩИЙ `PlaygroundStudio` и НАСТОЯЩАЯ
// `GenerationHistory` под настоящим BrowserRouter и react-query, сеть заглушена (проба сама
// отвечает на `StartDesignRun` — когда захочет и как захочет).
//
// Здесь не переписано ни одной проверяемой строки. Стенд повторяет ровно то, что делает студия:
// ячейка рельса пишет адрес через `useStepAddress`, экран PLAYGROUND и история под ним стоят только
// на шаге `playground`, история получает матчер и имя списка теми же функциями, что `studio-tab`,
// а переключатель вида (`useStudioKindSwitch`) заведён, чтобы рекол доходил до приёмника.
import type { GetDesignBandResponse, common_DesignRun } from 'api/proto-http/admin';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DesignCapabilityProvider } from 'components/managers/tech-card/components/design/capability';
import { GenerationHistory } from 'components/managers/tech-card/components/design/generation';
import {
  recallDesignRun,
  useStudioKindSwitch,
} from 'components/managers/tech-card/components/design/history-recall';
import {
  PlaygroundStudio,
  inPlaygroundRoom,
  playgroundHistoryMatch,
  playgroundHistoryScope,
  useStepAddress,
} from 'components/managers/tech-card/components/design/playground';
import { DictionaryProvider } from 'lib/providers/dictionary-provider';
import { useSnackBarStore } from 'lib/stores/store';
import { createRoot, type Root } from 'react-dom/client';
import { BrowserRouter, useSearchParams } from 'react-router-dom';

const CARD = 7;

function Screen({ band }: { band: GetDesignBandResponse }) {
  const [params] = useSearchParams();
  const goStep = useStepAddress();
  useStudioKindSwitch(CARD, 'playground', () => {});
  const wf = params.get('wf');
  return (
    <div>
      <nav>
        <button id='rail-flat' type='button' onClick={() => goStep('flat')}>
          flat
        </button>
        <button id='rail-playground' type='button' onClick={() => goStep('playground')}>
          playground
        </button>
      </nav>
      {params.get('step') === 'playground' && (
        <>
          <PlaygroundStudio band={band} techCardId={CARD} />
          <GenerationHistory
            band={band}
            techCardId={CARD}
            defaultRep='playground'
            match={playgroundHistoryMatch(wf, band) ?? inPlaygroundRoom}
            scopeKey={playgroundHistoryScope(wf, band)}
            defaultOpen={false}
          />
        </>
      )}
    </div>
  );
}

type Probe = {
  mount: (band: GetDesignBandResponse) => void;
  recall: (run: common_DesignRun) => void;
  alerts: () => string[];
};

declare global {
  interface Window {
    __pg: Probe;
  }
}

let root: Root | null = null;
window.__pg = {
  mount: (band) => {
    useSnackBarStore.setState({ alerts: [] });
    root?.unmount();
    const host = document.getElementById('root')!;
    root = createRoot(host);
    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: 60_000 }, mutations: { retry: false } },
    });
    root.render(
      <QueryClientProvider client={qc}>
        <DictionaryProvider>
          <DesignCapabilityProvider value={true}>
            <BrowserRouter>
              <Screen band={band} />
            </BrowserRouter>
          </DesignCapabilityProvider>
        </DictionaryProvider>
      </QueryClientProvider>,
    );
  },
  recall: (run) => recallDesignRun(CARD, run, 'input'),
  alerts: () => useSnackBarStore.getState().alerts.map((a) => a.message),
};
