// STAND FOR admin → AI providers. The real page with its real hooks, the real `api/api` and the real
// generated client: nothing in the app is replaced. The network is — the probe answers every
// request to http://stub.invalid from its own server state and aborts everything else, so no write
// can leave the machine.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { AiProviders } from '../src/components/managers/ai-providers/page';
import { SnackBar } from '../src/ui/components/snackbar';

declare global {
  interface Window {
    __loc: string;
  }
}

const qc = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, retry: false, refetchOnWindowFocus: false } },
});

function Spy() {
  const loc = useLocation();
  window.__loc = `${loc.pathname}${loc.search}`;
  return null;
}

const start = (globalThis as { __START?: string }).__START ?? '/ai-providers';

createRoot(document.getElementById('root')!).render(
  <QueryClientProvider client={qc}>
    <MemoryRouter initialEntries={[start]}>
      <Spy />
      <Routes>
        <Route path='/ai-providers' element={<AiProviders />} />
        <Route path='/me' element={<div>profile page</div>} />
      </Routes>
      <SnackBar />
    </MemoryRouter>
  </QueryClientProvider>,
);
