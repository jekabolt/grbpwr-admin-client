// СТЕНД НАСТОЯЩЕЙ СТРАНИЦЫ ЗАДАЧИ. Монтируется `TaskDetail` целиком — со своими хуками,
// своим `usePermissions`, своими редакторами. Подменён ровно один слой — сетевой (`api/api`).
//
// Почему именно страница, а не компоненты по отдельности: оба дефекта ревью живут НА ШВЕ между
// страницей и редактором (кто держит черновик и кто держит «то, что человек видел»), и стенд из
// кусков этот шов не воспроизводит по построению.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { TaskDetail } from '../src/components/managers/tasks/task-detail/page';
import { SnackBar } from '../src/ui/components/snackbar';

declare global {
  interface Window {
    __qc: QueryClient;
  }
}

// Те же глобальные умолчания, что в `src/index.tsx`.
const qc = new QueryClient({
  defaultOptions: { queries: { staleTime: 5 * 60_000, retry: false, refetchOnWindowFocus: false } },
});
window.__qc = qc;

createRoot(document.getElementById('root')!).render(
  <QueryClientProvider client={qc}>
    <MemoryRouter initialEntries={['/tasks/1']}>
      <Routes>
        <Route path='/tasks/:id' element={<TaskDetail />} />
      </Routes>
    </MemoryRouter>
    {/* Снекбар в приложении живёт в Layout, ВНЕ страницы. Без него стенд не может проверить,
        что отказ сервера показан человеку, а не проглочен (Ц10.5 пробы очереди Б). */}
    <SnackBar />
  </QueryClientProvider>,
);
