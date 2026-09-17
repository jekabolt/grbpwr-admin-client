// СТЕНД ХОЛСТА ФАЙЛОВ. Монтируется настоящий `FilesPage` со своими хуками и своим состоянием;
// подменён ровно один слой — сетевой (`api/api`). Адрес задаётся стендом: `?project=N` — это и
// есть «страница проекта», второго экрана у неё нет.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import FilesPage from '../src/components/managers/files/page';
import { SnackBar } from '../src/ui/components/snackbar';

declare global {
  interface Window {
    __loc: string;
  }
}

const qc = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, retry: false, refetchOnWindowFocus: false } },
});

/** Адрес виден стенду: смена фильтра здесь — это смена query string, и проверять надо её. */
function Spy() {
  const loc = useLocation();
  window.__loc = `${loc.pathname}${loc.search}`;
  return null;
}

const start = (globalThis as { __START?: string }).__START ?? '/files';

createRoot(document.getElementById('root')!).render(
  <QueryClientProvider client={qc}>
    <MemoryRouter initialEntries={[start]}>
      <Spy />
      <Routes>
        <Route path='/files' element={<FilesPage />} />
      </Routes>
      <SnackBar />
    </MemoryRouter>
  </QueryClientProvider>,
);
