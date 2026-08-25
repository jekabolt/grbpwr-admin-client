// СТЕНД ИНЛАЙН-ПРАВКИ. Собран из НАСТОЯЩИХ модулей раздела задач: настоящий `useTask`, настоящий
// `useInlineTaskPatch`, настоящий `tasksService` со своим маппером и `taskInsertToWire`. Подменён
// ровно один слой — сетевой (`api/api`), и его подмена проверяется маркером в собранном тексте.
//
// Кнопка «наивно» — ПОЛОЖИТЕЛЬНЫЙ КОНТРОЛЬ: она пишет ровно тем рецептом, который лежал в
// разведке (`{...task.task, поле}` из пропсов). Без неё зелёная проба ничего бы не значила:
// она обязана сначала ПОКАЗАТЬ ПОТЕРЮ, иначе неизвестно, умеет ли она её вообще замечать.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createRoot } from 'react-dom/client';
import { tasksService } from '../src/components/managers/tasks/api/tasksService';
import {
  useInlineTaskPatch,
  useTask,
} from '../src/components/managers/tasks/hooks/useTasks';

declare global {
  interface Window {
    __qc: QueryClient;
    __lastError: string;
  }
}

// Те же глобальные умолчания, что в `src/index.tsx`: без них точечный override
// `refetchOnWindowFocus: true` на чтении карточки нечего было бы переопределять.
const qc = new QueryClient({
  defaultOptions: { queries: { staleTime: 5 * 60_000, retry: 1, refetchOnWindowFocus: false } },
});
window.__qc = qc;
window.__lastError = '';

const TASK_ID = 1;

function Harness() {
  const { data: task } = useTask(TASK_ID);
  const inline = useInlineTaskPatch(TASK_ID);

  if (!task) return <div id='state'>loading</div>;

  // Ровно то, что делает страница задачи.
  const patchInline = async () => {
    try {
      await inline.mutateAsync({
        patch: { priority: 'TASK_PRIORITY_URGENT' },
        base: task.task,
      });
    } catch (e) {
      window.__lastError = e instanceof Error ? e.message : String(e);
    }
  };

  // Рецепт из разведки, который эта волна отвергла. Пишет по копии, лежащей на странице.
  const patchNaive = async () => {
    try {
      await tasksService.updateTask(TASK_ID, {
        ...task.task,
        priority: 'TASK_PRIORITY_URGENT',
      });
    } catch (e) {
      window.__lastError = e instanceof Error ? e.message : String(e);
    }
  };

  return (
    <div>
      <div id='state'>ready</div>
      <div id='seen-description'>{task.task.description}</div>
      <button id='inline' type='button' onClick={patchInline}>
        inline save
      </button>
      <button id='naive' type='button' onClick={patchNaive}>
        naive save
      </button>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(
  <QueryClientProvider client={qc}>
    <Harness />
  </QueryClientProvider>,
);
