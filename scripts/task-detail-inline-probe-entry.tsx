// СТЕНД НАСТОЯЩЕЙ СТРАНИЦЫ ЗАДАЧИ. Монтируется `TaskDetail` целиком — со своими хуками,
// своим `usePermissions`, своими редакторами. Подменён ровно один слой — сетевой (`api/api`).
//
// Почему именно страница, а не компоненты по отдельности: оба дефекта ревью живут НА ШВЕ между
// страницей и редактором (кто держит черновик и кто держит «то, что человек видел»), и стенд из
// кусков этот шов не воспроизводит по построению.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router-dom';
import { TaskDetail } from '../src/components/managers/tasks/task-detail/page';
import { SnackBar } from '../src/ui/components/snackbar';

declare global {
  interface Window {
    __qc: QueryClient;
    /** Уход со страницы и возврат БЕЗ перезагрузки — то есть с тем же `QueryClient`. */
    __nav: (to: string) => void;
  }
}

/**
 * ВТОРОЙ МАРШРУТ НУЖЕН РАДИ РАЗМОНТИРОВАНИЯ. Случай Ц12 спрашивает, переживает ли засов уход со
 * страницы и возврат на неё, а перемонтировать стенд целиком для этого нельзя: перезагрузка
 * унесла бы вместе со страницей и `QueryClient`, в кэше которого засов и живёт, — и проверка
 * стала бы тавтологией.
 */
function NavBridge() {
  const navigate = useNavigate();
  window.__nav = (to) => navigate(to);
  return null;
}

// Умолчания `src/index.tsx` с ДВУМЯ НАЗВАННЫМИ ОТЛИЧИЯМИ — оба в сторону «отказ виден сразу».
//
//  `queries.retry: false` (в проде 1) — отказ чтения должен всплывать сразу, иначе проба ждала бы
//  повтор, которого не проверяет.
//
//  `mutations.retry` НЕ ЗАДАН (в проде 1), то есть здесь 0. ЭТИМ ЭНТРИ ПОЛЬЗУЮТСЯ ТРИ СТЕНДА, и
//  повтор записи меняет у них не только сроки, но и счёт вызовов: у пробы очереди Б есть случай,
//  который считает, что отказ в удалении реплики ушёл на сервер РОВНО ОДИН РАЗ, и повтор сделал бы
//  это утверждение непроверяемым. Случаи, которым длина отказа важна (Ц11 инлайн-пробы), включают
//  повтор У СЕБЯ, через `setDefaultOptions`, — то есть платит за верность проду тот, кому она
//  нужна, а не все соседи.
const qc = new QueryClient({
  defaultOptions: { queries: { staleTime: 5 * 60_000, retry: false, refetchOnWindowFocus: false } },
});
window.__qc = qc;

createRoot(document.getElementById('root')!).render(
  <QueryClientProvider client={qc}>
    <MemoryRouter initialEntries={['/tasks/1']}>
      <NavBridge />
      <Routes>
        <Route path='/tasks/:id' element={<TaskDetail />} />
        <Route path='/tasks' element={<div data-board-stub>board</div>} />
      </Routes>
    </MemoryRouter>
    {/* Снекбар в приложении живёт в Layout, ВНЕ страницы. Без него стенд не может проверить,
        что отказ сервера показан человеку, а не проглочен (Ц10.5 пробы очереди Б). */}
    <SnackBar />
  </QueryClientProvider>,
);
