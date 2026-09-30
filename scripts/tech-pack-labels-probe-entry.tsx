// Stand of the tech pack's label sheets (labels rework I-17). Mounts the REAL TechPackDocument
// with a fixture card; every RPC is answered by the runner (tech-pack-labels-probe.mjs).
import type { common_TechCard } from 'api/proto-http/admin';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';

import { TechPackDocument } from 'components/managers/tech-card/components/tech-pack-document';
import { DictionaryProvider } from 'lib/providers/dictionary-provider';

declare global {
  interface Window {
    __tp: { mount: (card: common_TechCard) => void };
  }
}

let root: Root | null = null;
window.__tp = {
  mount(card) {
    root?.unmount();
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    root = createRoot(document.getElementById('root')!);
    root.render(
      <QueryClientProvider client={qc}>
        <DictionaryProvider>
          <MemoryRouter>
            <TechPackDocument techCard={card} />
          </MemoryRouter>
        </DictionaryProvider>
      </QueryClientProvider>,
    );
  },
};
