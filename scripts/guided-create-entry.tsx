// DOM stand for `guided-create-probe.mjs` (onboarding S4): the REAL tech card page (`page.tsx` →
// `TechCardForm` → studio) under the app's two routes, over a stubbed network (`api/api` →
// `window.__api[method]`). Each case mounts a fresh root at an address (`window.__st.mount`); the
// form's blank defaults are pre-filled through `techCardDefaultData` (a plain exported object), so a
// case can start with three of the four create fields filled and type the fourth.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TechCard } from 'components/managers/tech-card/page';
import { techCardDefaultData } from 'components/managers/tech-card/components/schema';
import { ROUTES } from 'constants/routes';
import { DictionaryProvider } from 'lib/providers/dictionary-provider';
import { createRoot, type Root } from 'react-dom/client';
import { BrowserRouter, Route, Routes, useNavigate } from 'react-router-dom';
import { TooltipProvider } from 'ui/components/tooltip';

// No `declare global`: every stand's entry is type-checked together, and the window names collide.
const w = window as unknown as {
  __st: {
    mount: (url: string, defaults?: Record<string, unknown>) => void;
    go: (url: string) => void;
  };
  __probeNav?: (url: string) => void;
};

const blank = { ...techCardDefaultData };

function NavHook() {
  w.__probeNav = useNavigate();
  return null;
}

let root: Root | null = null;
w.__st = {
  mount: (url, defaults = {}) => {
    root?.unmount();
    Object.assign(techCardDefaultData, blank, defaults);
    window.history.replaceState(null, '', url);
    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: 60_000 }, mutations: { retry: false } },
    });
    root = createRoot(document.getElementById('root') as HTMLElement);
    root.render(
      <QueryClientProvider client={qc}>
        <BrowserRouter>
          <NavHook />
          <TooltipProvider>
            <DictionaryProvider>
              <div style={{ width: 1200, padding: 24 }}>
                <Routes>
                  <Route path={ROUTES.techCards} element={<div data-probe-list='' />} />
                  <Route path={ROUTES.addTechCard} element={<TechCard />} />
                  <Route path={ROUTES.singleTechCard} element={<TechCard />} />
                </Routes>
              </div>
            </DictionaryProvider>
          </TooltipProvider>
        </BrowserRouter>
      </QueryClientProvider>,
    );
  },
  go: (url) => w.__probeNav?.(url),
};
