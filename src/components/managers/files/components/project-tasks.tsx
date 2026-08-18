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

export function ProjectTasks({ projectId }: { projectId: number }) {
  const { canRead, canWrite, resolved } = usePermissions();
  // Право читается ДО запроса: спрашивать заведомо запрещённое, чтобы промолчать по ответу,
  // значит слать отказ на каждый показ страницы. Пока права не приехали, запрос не уходит.
  const mayRead = resolved && canRead(SECTION.tasks);
  const mayWrite = canWrite(SECTION.tasks);

  const { data, isPending, isError } = useQuery({
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

  /**
   * СТРОКА МОЛЧИТ, ПОКА НЕ ЗНАЕТ, И МОЛЧИТ, ЕСЛИ НЕ УЗНАЛА. Три состояния сводятся в одно, и
   * это решение, а не экономия ветки.
   *
   * ПОКА ОТВЕТ ЛЕТИТ, рисовать пустую ветку нельзя: «no active tasks in this project» — это
   * УТВЕРЖДЕНИЕ О ФАКТЕ, а факта ещё нет. Человек читал бы неправду на каждом открытии
   * страницы, и она успевала бы отпечататься раньше, чем её сменит правда.
   *
   * ЛЮБОЙ ОТКАЗ — ТОЖЕ МОЛЧАНИЕ, а не только «нет прав» и «роут не выкачен». `retry: false`
   * значит, что 500 или оборванная сеть оставят экран в этом состоянии НАВСЕГДА, и проект с
   * полусотней задач так и будет утверждать, что задач нет. Отказ прав при этом остаётся
   * законной комбинацией (файловому человеку могли не дать `tasks:read`), поэтому и здесь
   * плашки нет: сказать «сломалось» о том, чего не обещали, — тот же обман, только громкий.
   *
   * Цена названа вслух: сбой чтения задач у проекта, у которого они есть, выглядит как их
   * отсутствие СТРОКИ, а не как ложное «их нет». Доска стоит рядом и говорит правду.
   */
  if (!mayRead || isPending || isError) return null;

  const newTask = mayWrite && (
    <Button variant='underline' size='xs' onClick={() => setCreating(true)}>
      + new task
    </Button>
  );
  // «Куда читать остальное» — тот же адрес, которым доска сужается проектом. Стоит в ОБЕИХ
  // ветках: пустая строка считает только НЕархивные задачи, и без этого выхода проект, где всю
  // работу закончили и убрали в архив, выглядел бы как проект, где её не было.
  const openBoard = (
    <Button asChild variant='underline' size='xs'>
      <Link to={`${ROUTES.tasks}?project=${projectId}`}>open board</Link>
    </Button>
  );

  return (
    <>
      {tasks.length === 0 ? (
        /* ПУСТО — НЕ «НИЧЕГО». Пустая рамка была бы постоянным шумом, но на строке живёт
           ОРГАН ЗАВЕДЕНИЯ: страница архивного проекта открывается прямой ссылкой, и «+ new
           task» на ней — единственный путь завести задачу на законченную съёмку (пикер доски
           предлагает только живые проекты). Спрятать строку вовсе значило бы закрыть этот
           путь.

           СЛОВА — РОВНО ПРО ТО, ЧТО СПРОШЕНО. Запрос идёт БЕЗ архива (как и доска), поэтому
           «no tasks linked to this project yet» было бы враньём про проект, где всю работу
           сделали и карточки убрали: связь у них никуда не делась. «No active tasks» верно и
           там, и там, а архив досягаем соседней кнопкой. */
        <div className='flex flex-wrap items-center gap-2'>
          <Text size='micro' variant='label' component='span'>
            no active tasks in this project
          </Text>
          {newTask}
          {openBoard}
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
          {openBoard}
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
