// СТЕНД ЭКРАНА ЗАМЕТКИ ДЛЯ ⌘A. Монтируется настоящий `NotePage` — со своим обработчиком клавиш,
// своим редактором и показом. Подменён ровно один слой — сетевой (`api/api`).
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { NotePage } from '../src/components/managers/files/note/note-page';

const qc = new QueryClient({
  defaultOptions: { queries: { staleTime: 5 * 60_000, retry: false, refetchOnWindowFocus: false } },
});

createRoot(document.getElementById('root')!).render(
  <QueryClientProvider client={qc}>
    <MemoryRouter initialEntries={['/files/7/note']}>
      <div id='site-chrome'>SITE MENU · analytics · orders · files</div>
      <Routes>
        <Route path='/files/:id/note' element={<NotePage />} />
      </Routes>
    </MemoryRouter>
  </QueryClientProvider>,
);
