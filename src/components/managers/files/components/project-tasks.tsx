import { useQuery } from '@tanstack/react-query';
import { usePermissions } from 'components/managers/accounts/utils/permissions';
import { TASKS_PAGE_LIMIT, tasksService } from 'components/managers/tasks/api/tasksService';
import { emptyFormValues, TaskFormValues } from 'components/managers/tasks/api/types';
import { TaskFormModal } from 'components/managers/tasks/components/task-form-modal';
import { useCreateTask } from 'components/managers/tasks/hooks/useTasks';
import { STATUS_LABEL, STATUSES } from 'components/managers/tasks/utils/meta';
import { ROUTES, SECTION } from 'constants/routes';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from 'ui/components/button';
import Text from 'ui/components/text';
import { isForbidden, isUnknownRoute } from '../api/rpc-error';

/**
 * ЗАДАЧИ ПРОЕКТА — ОДНА СТРОКА-СВОДКА, А НЕ СПИСОК.
 *
 * Страница проекта — про ФАЙЛЫ. Задачи здесь гость: он говорит, сколько их и где читать, и
 * отдаёт остальную страницу обратно. На сорока задачах строка не растёт — растут числа в ней.
 *
 * КОМПОНЕНТ ПЕРЕНОСИМЫЙ И САМОДОСТАТОЧНЫЙ: он сам спрашивает данные, сам держит форму
 * заведения и сам молчит там, где сказать нечего. Место на странице выбирает тот, кто его
 * монтирует, — от места не зависит ничего из написанного ниже.
 */

/**
 * ОТКАЗ ПРАВ — ЗАКОННАЯ КОМБИНАЦИЯ, А НЕ ПОЛОМКА. Файловому человеку могли не дать
 * `tasks:read`; тогда строки просто нет — ни её самой, ни плашки ошибки. Плашка сказала бы,
 * что сломалось то, чего ему и не обещали.
 *
 * Невыкаченный роут — сюда же: на бете, где бэкенда задач ещё нет, страница проекта обязана
 * работать целиком, а не показывать красное.
 */
function isSilent(e: unknown): boolean {
  return isForbidden(e) || isUnknownRoute(e);
}

export function ProjectTasks({ projectId }: { projectId: number }) {
  const { canRead, canWrite, resolved } = usePermissions();
  // Право читается ДО запроса: спрашивать заведомо запрещённое, чтобы промолчать по ответу,
  // значит слать отказ на каждый показ страницы. Пока права не приехали, запрос не уходит.
  const mayRead = resolved && canRead(SECTION.tasks);
  const mayWrite = canWrite(SECTION.tasks);

  const { data, isError, error } = useQuery({
    queryKey: ['tasks', 'project-summary', projectId],
    queryFn: () => tasksService.listTasks({ projectTopicId: projectId }),
    enabled: mayRead && projectId > 0,
    retry: false,
    staleTime: 30_000,
  });

  const [creating, setCreating] = useState(false);
  const createTask = useCreateTask();

  const tasks = data?.tasks ?? [];
  /**
   * ЧИСЛО — ИЗ ТОГО ЖЕ ОТВЕТА, которым посчитана разбивка по колонкам: второго счёта тем же
   * вопросом раздел не заводит. На потолке страницы честное «N+», а не точное число: за ним
   * лежат карточки, которых в этом ответе нет, и разбивка под ним их тоже не считает.
   */
  const capped = tasks.length >= TASKS_PAGE_LIMIT;
  const byStatus = useMemo(
    () =>
      STATUSES.map((s) => ({ s, n: tasks.filter((t) => t.status === s).length })).filter(
        (x) => x.n > 0,
      ),
    [tasks],
  );

  const initial: TaskFormValues = useMemo(
    () => ({
      ...emptyFormValues('TASK_BOARD_CONTENT', 'TASK_STATUS_TODO'),
      projectTopicId: projectId,
    }),
    [projectId],
  );

  async function handleCreate(values: TaskFormValues) {
    const { board, status, ...content } = values;
    try {
      await createTask.mutateAsync({ content, board, status });
      setCreating(false);
    } catch {
      /* тост показывает мутация; форма остаётся открытой */
    }
  }

  if (!mayRead) return null;
  if (isError && isSilent(error)) return null;

  const newTask = mayWrite && (
    <Button variant='underline' size='xs' onClick={() => setCreating(true)}>
      + new task
    </Button>
  );

  return (
    <>
      {tasks.length === 0 ? (
        /* ПУСТО — НЕ «НИЧЕГО». Пустая рамка была бы постоянным шумом, но на строке живёт
           ОРГАН ЗАВЕДЕНИЯ: страница архивного проекта открывается прямой ссылкой, и «+ new
           task» на ней — единственный путь завести задачу на законченную съёмку (пикер доски
           предлагает только живые проекты). Спрятать строку вовсе значило бы закрыть этот
           путь. */
        <div className='flex flex-wrap items-center gap-2'>
          <Text size='micro' variant='label' component='span'>
            no tasks linked to this project yet
          </Text>
          {newTask}
        </div>
      ) : (
        <div className='flex flex-wrap items-center gap-2 border border-borderColor px-2.5 py-1.5'>
          <Text size='micro' component='span' className='shrink-0 font-bold uppercase'>
            tasks · {tasks.length}
            {capped ? '+' : ''}
          </Text>
          {byStatus.length > 0 && (
            <Text size='micro' variant='label' component='span' className='min-w-0'>
              {byStatus.map((x) => `${STATUS_LABEL[x.s]} ${x.n}`).join(' · ')}
            </Text>
          )}
          <span className='ml-auto' />
          {newTask}
          {/* «Куда читать остальное» — тот же адрес, которым доска сужается проектом. */}
          <Button asChild variant='underline' size='xs'>
            <Link to={`${ROUTES.tasks}?project=${projectId}`}>open board</Link>
          </Button>
        </div>
      )}

      {/* ПРЕСЕЛЕКТ ПРОЕКТА — НЕ УДОБСТВО, А СМЫСЛ КНОПКИ: её нажали НА странице проекта, и
          заводится задача по нему. Форма — та же, что на доске: второй формы заведения в
          панели нет. */}
      <TaskFormModal
        open={creating}
        onOpenChange={(o) => !o && setCreating(false)}
        mode='create'
        initial={initial}
        saving={createTask.isPending}
        onSubmit={handleCreate}
      />
    </>
  );
}
