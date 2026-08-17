import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import type { common_TaskBoard, common_TaskStatus, LibraryFile } from 'api/proto-http/admin';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { usePermissions } from 'components/managers/accounts/utils/permissions';
import { tasksService } from 'components/managers/tasks/api/tasksService';
import { tasksKeys } from 'components/managers/tasks/hooks/useTasks';
import { SECTION } from 'constants/routes';
import { Avatar } from 'ui/components/avatar';
import { Button } from 'ui/components/button';
import { CalloutBox } from 'ui/components/callout-box';
import { ConfirmationModal } from 'ui/components/confirmation-modal';
import { GroupLabel } from 'ui/components/group-label';
import Input from 'ui/components/input';
import { Pill } from 'ui/components/pill';
import Text from 'ui/components/text';
import { fileTasksService } from '../api/fileTasksService';
import { errorText, isForbidden, isUnauthorized, isUnknownRoute } from '../api/rpc-error';
import { filesKeys } from '../hooks/useFiles';
import { formatDay } from '../utils/format';

/**
 * Ключ ВЛОЖЕН в `filesKeys.all` (`['files']`): всякая правка файла инвалидирует этот префикс
 * целиком, и список задач обязан протухать вместе с карточкой. Свой корень означал бы секцию,
 * которая после отцепления в другой вкладке продолжает держать кнопку удаления выключенной.
 */
export const fileTasksKeys = {
  ofFile: (fileId: number) => [...filesKeys.all, 'file', fileId, 'tasks'] as const,
};

/**
 * Задачи файла.
 *
 * Отдельный хук, а не внутренность секции: карточка спрашивает то же самое, чтобы объяснить
 * выключенное «удалить» ДО нажатия. React Query склеивает два вызова одного ключа в один
 * запрос, поэтому вторая точка чтения ничего не стоит.
 *
 * `enabled` гасит запрос там, где на него заведомо ответят отказом (нет права `tasks:read`) —
 * секция в этом случае говорит словами, а не показывает ошибку.
 */
export function useFileTasks(fileId: number, enabled = true) {
  return useQuery({
    queryKey: fileTasksKeys.ofFile(fileId),
    queryFn: () => fileTasksService.list(fileId),
    enabled: enabled && fileId > 0,
    // Один раз: на невыкаченном бэкенде это 404, и повторять его нечего.
    retry: false,
    staleTime: 60 * 1000,
  });
}

/** Статусы и доски ПО-РУССКИ. `STATUS_LABEL` из раздела задач английский, а тут раздел русский:
 *  «in progress» посреди «прикрепить к задаче» читается как чужая вставка. */
const STATUS_RU: Record<common_TaskStatus, string> = {
  TASK_STATUS_UNKNOWN: 'без статуса',
  TASK_STATUS_BACKLOG: 'бэклог',
  TASK_STATUS_TODO: 'в очереди',
  TASK_STATUS_IN_PROGRESS: 'в работе',
  TASK_STATUS_REVIEW: 'на проверке',
  TASK_STATUS_DONE: 'сделана',
};

const BOARD_RU: Record<common_TaskBoard, string> = {
  TASK_BOARD_UNKNOWN: '',
  TASK_BOARD_DEVELOPMENT: 'разработка',
  TASK_BOARD_DESIGN: 'дизайн',
  TASK_BOARD_MARKETING: 'маркетинг',
  TASK_BOARD_PRODUCTION: 'производство',
  TASK_BOARD_SOURCING: 'закупки',
  TASK_BOARD_CONTENT: 'контент',
};

/** Зелёный = сделана, синий = в полёте, серый = ещё не начиналась. Цвет здесь всегда при слове. */
function statusTone(s: common_TaskStatus | undefined): 'ok' | 'attention' | 'mut' {
  if (s === 'TASK_STATUS_DONE') return 'ok';
  if (s === 'TASK_STATUS_IN_PROGRESS' || s === 'TASK_STATUS_REVIEW') return 'attention';
  return 'mut';
}

function isOverdue(dueDate: string | undefined, status: common_TaskStatus | undefined): boolean {
  if (!dueDate || status === 'TASK_STATUS_DONE') return false;
  const d = new Date(dueDate);
  return !Number.isNaN(d.getTime()) && d.getTime() < Date.now();
}

/**
 * ЗАДАЧИ ФАЙЛА — обратная сторона вложений задачи.
 *
 * Цеплять можно и отсюда, потому что файл чаще находят раньше задачи («вот макет, к чему он
 * был?»), чем наоборот. Здесь же объясняется отказ на удаление: сервер не даёт стереть файл,
 * пока его держит хоть одна задача, и без этого списка отказ приходит загадкой.
 *
 * Список НАМЕРЕННО включает архивные задачи — архивная держит файл ровно так же, и спрятать её
 * значило бы сделать отказ необъяснимым.
 */
export function FileTasksSection({
  file,
  writable,
}: {
  file: LibraryFile;
  /** files:write И режим записи. Прикрепление — запись в ЗАДАЧИ, поэтому ниже к нему
   *  добавляется ещё и `tasks:write`. */
  writable: boolean;
}) {
  const qc = useQueryClient();
  const { canRead, canWrite } = usePermissions();
  const fileId = Number(file.id ?? 0);

  const mayRead = canRead(SECTION.tasks);
  const mayLink = writable && canWrite(SECTION.tasks);

  const { data, isLoading, error, isError } = useFileTasks(fileId, mayRead);
  const tasks = useMemo(() => data?.tasks ?? [], [data]);
  const attachedIds = useMemo(
    () => new Set(tasks.map((t) => Number(t.taskId ?? 0)).filter((n) => n > 0)),
    [tasks],
  );

  const [picking, setPicking] = useState(false);
  const [query, setQuery] = useState('');

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: fileTasksKeys.ofFile(fileId) });
    // И весь раздел задач: прикрепление меняет вложения карточки задачи, а форма задачи
    // сохраняет `file_ids` ПОЛНЫМ НАБОРОМ — открытая на устаревших данных, она вернула бы
    // файл обратно (или снесла бы чужое прикрепление) первым же «сохранить».
    //
    // `refetchType: 'none'` — пометить протухшим, но не перекачивать СЕЙЧАС: единственный
    // живой наблюдатель этого ключа в раскрытой карточке — пикер, и он тянет тысячу строк.
    // Прикрепил три задачи подряд — три полных ListTasks впустую: строка и так уходит из
    // списка свободных, потому что обновился список задач ФАЙЛА. Доска и карточка задачи
    // сейчас не смонтированы и перечитают всё сами при первом же заходе.
    qc.invalidateQueries({ queryKey: ['tasks'], refetchType: 'none' });
  };

  const attach = useMutation({
    mutationFn: (taskId: number) => fileTasksService.attach(fileId, taskId),
    onSuccess: invalidate,
  });
  const detach = useMutation({
    mutationFn: (taskId: number) => fileTasksService.detach(fileId, taskId),
    onSuccess: invalidate,
  });

  // Свободные задачи для пикера. Исключаются ДВА набора сразу: то, что называет сам файл, и то,
  // что называет сама задача (`fileIds` приезжает на строке списка). Списки могли разойтись под
  // чужой правкой, и объединение исключений — единственный способ не предложить прикрепить то,
  // что уже прикреплено.
  // Ключ И запрос — те же, что у доски задач, поэтому открытая рядом доска уже прогрела кэш. Но
  // `enabled: picking`: список задач приезжает тысячей строк, и тянуть его на КАЖДОЕ открытие
  // карточки файла ради кнопки, которую нажимают раз в неделю, — плата не по адресу.
  const { data: allTasks, isLoading: tasksLoading } = useQuery({
    queryKey: tasksKeys.list({}),
    queryFn: () => tasksService.listTasks({}),
    enabled: picking,
    staleTime: 30_000,
  });
  const free = useMemo(() => {
    const list = allTasks?.tasks ?? [];
    return list.filter(
      (t) => !attachedIds.has(t.id) && !(t.task.fileIds ?? []).includes(fileId),
    );
  }, [allTasks, attachedIds, fileId]);

  const q = query.trim().toLowerCase();
  const found = q
    ? free.filter(
        (t) => t.task.title.toLowerCase().includes(q) || String(t.id).includes(q.replace('#', '')),
      )
    : free;

  // Только отцепление: отказ прикрепления печатается ВНУТРИ пикера, где человек и находится.
  // Общая переменная показывала бы одну и ту же фразу дважды — в модалке и под ней.
  const failure = detach.error;

  return (
    <div className='flex flex-col gap-1'>
      <GroupLabel
        action={
          <Button
            size='xs'
            variant='secondary'
            disabled={!mayLink || !mayRead || attach.isPending}
            title={
              mayRead
                ? mayLink
                  ? undefined
                  : 'прикрепление — запись в задачи: нужно право tasks:write и режим записи'
                : 'без доступа к задачам список не прочитать, а прикреплять вслепую нечего'
            }
            onClick={() => {
              attach.reset();
              setQuery('');
              setPicking(true);
            }}
          >
            прикрепить к задаче
          </Button>
        }
      >
        задачи{tasks.length ? ` · ${tasks.length}` : ''}
      </GroupLabel>

      {!mayRead ? (
        /* НЕ ОШИБКА, А ЗАПРЕТ. Секция обязана пережить `PermissionDenied` словами: красная
           плашка на месте списка читалась бы как поломка файла, а не как отсутствие права. */
        <Text size='micro' variant='label'>
          нет доступа к задачам — список того, что держит файл, виден с правом tasks:read.
        </Text>
      ) : isLoading ? (
        <Text size='micro' variant='label'>
          загружаем…
        </Text>
      ) : isError ? (
        <Text size='micro' variant='label'>
          {isUnauthorized(error)
            ? 'сессия истекла — войдите заново.'
            : isForbidden(error)
              ? 'нет доступа к задачам — список того, что держит файл, виден с правом tasks:read.'
              : isUnknownRoute(error)
                ? 'задачи файла этот сервер ещё не отдаёт: либо сторона задач не выкачена, либо файла уже нет.'
                : errorText(error, 'список задач не прочитался')}
        </Text>
      ) : tasks.length === 0 ? (
        <Text size='micro' variant='label'>
          файл ни к чему не прикреплён — его можно удалить.
        </Text>
      ) : (
        <div className='flex flex-col'>
          {tasks.map((t, i) => {
            const taskId = Number(t.taskId ?? 0);
            const overdue = isOverdue(t.dueDate, t.status);
            return (
              <div
                key={taskId}
                className={`flex items-center gap-1.5 py-1 ${i > 0 ? 'border-t border-hairline' : ''}`}
              >
                <Pill tone='ink' className='flex-none tabular-nums'>
                  #{taskId}
                </Pill>
                {/* СОСЕДНЯЯ ВКЛАДКА, а не переход на месте. Уход по ссылке размонтировал бы
                    карточку вместе с её вопросом «закрыть без сохранения»: набранное, но не
                    сохранённое имя файла исчезло бы молча — ровно то, что этот вопрос и
                    существует предотвращать. */}
                <Link
                  to={`/tasks/${taskId}`}
                  target='_blank'
                  rel='noopener noreferrer'
                  title={`${t.title ?? ''}\nоткроется в соседней вкладке`}
                  className='min-w-0 flex-1 truncate underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-textColor'
                >
                  <Text size='micro' component='span'>
                    {t.title || `задача #${taskId}`}
                  </Text>
                </Link>
                <Pill tone={statusTone(t.status)} className='flex-none'>
                  {STATUS_RU[t.status ?? 'TASK_STATUS_UNKNOWN']}
                </Pill>
                {!!BOARD_RU[t.board ?? 'TASK_BOARD_UNKNOWN'] && (
                  <Text
                    size='nano'
                    variant='label'
                    component='span'
                    className='hidden flex-none uppercase sm:inline'
                  >
                    {BOARD_RU[t.board ?? 'TASK_BOARD_UNKNOWN']}
                  </Text>
                )}
                {/* Пустой `assignee` — это «никто не взял», и `Avatar` рисует ровно это
                    пунктирным кружком, а не выдумывает исполнителя. */}
                <Avatar name={t.assignee ?? ''} size={18} title={t.assignee || 'никто не взял'} />
                {!!t.dueDate && (
                  <Text
                    size='nano'
                    variant='label'
                    component='span'
                    className='flex-none tabular-nums'
                  >
                    {formatDay(t.dueDate)}
                  </Text>
                )}
                {overdue && (
                  <Pill tone='warn' className='flex-none'>
                    просрочена
                  </Pill>
                )}
                {mayLink && (
                  <Button
                    size='xs'
                    variant='secondary'
                    className='flex-none'
                    disabled={detach.isPending}
                    onClick={() => detach.mutate(taskId)}
                    aria-label={`отцепить файл от задачи #${taskId}`}
                    title='файл перестанет числиться в этой задаче; сам файл останется'
                  >
                    отцепить
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {mayRead && tasks.length > 0 && (
        <Text size='micro' variant='label'>
          пока файл здесь числится, удалить его нельзя: в задаче осталась бы ссылка в никуда.
          список включает и архивные задачи — архивная держит файл ровно так же.
        </Text>
      )}

      {/* Причина выключенной кнопки — ТЕКСТОМ, как и у «удалить» в подвале карточки.
          Подсказка при наведении объясняет только тому, кто уже заподозрил, что серая кнопка
          что-то значит. */}
      {mayRead && !mayLink && (
        <Text size='micro' variant='label'>
          прикрепить и отцепить может тот, у кого есть право tasks:write и включён режим
          записи: связь живёт на стороне задачи, а не файла.
        </Text>
      )}

      {!!failure && (
        <CalloutBox tone='error'>
          <Text size='micro' component='span'>
            {errorText(failure, 'не удалось изменить связь файла с задачей')}
          </Text>
        </CalloutBox>
      )}

      <ConfirmationModal
        open={picking}
        onOpenChange={(o) => {
          if (!o) attach.reset();
          setPicking(o);
        }}
        onConfirm={() => setPicking(false)}
        title={`прикрепить «${file.fileName ?? 'файл'}» к задаче`}
        width='md'
        hideActions
      >
        <div className='flex flex-col gap-2'>
          <Text size='micro' variant='label'>
            прикрепление применяется сразу — окно можно закрыть, когда задач хватит. уже
            прикреплённые из списка убраны.
          </Text>
          <Input
            name='taskQuery'
            aria-label='поиск задачи по названию или номеру'
            value={query}
            placeholder='название или #номер'
            className='max-w-[260px]'
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setQuery(e.target.value)}
          />
          {attach.isError && (
            <CalloutBox tone='error'>
              <Text size='micro' component='span'>
                {errorText(attach.error, 'не удалось прикрепить файл к задаче')}
              </Text>
            </CalloutBox>
          )}
          <div className='flex max-h-72 flex-col overflow-y-auto'>
            {tasksLoading ? (
              <Text size='micro' variant='label'>
                загружаем задачи…
              </Text>
            ) : found.length ? (
              found.map((t) => (
                <button
                  key={t.id}
                  type='button'
                  disabled={attach.isPending}
                  onClick={() => attach.mutate(t.id)}
                  className='flex items-center gap-1.5 border-b border-hairline px-1 py-1.5 text-left last:border-b-0 hover:bg-bgZebra focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-textColor disabled:cursor-not-allowed'
                >
                  <Pill tone='ink' className='flex-none tabular-nums'>
                    #{t.id}
                  </Pill>
                  <Text size='micro' component='span' className='min-w-0 flex-1 truncate'>
                    {t.task.title || `задача #${t.id}`}
                  </Text>
                  <Text size='nano' variant='label' component='span' className='flex-none uppercase'>
                    {STATUS_RU[t.status]}
                  </Text>
                  <Avatar
                    name={t.task.assignee}
                    size={18}
                    title={t.task.assignee || 'никто не взял'}
                  />
                </button>
              ))
            ) : (
              <Text size='micro' variant='label'>
                {free.length
                  ? 'ни одной задачи с таким названием или номером.'
                  : 'свободных задач нет — файл уже прикреплён ко всем, что видны.'}
              </Text>
            )}
          </div>
          <div className='flex justify-end'>
            <Button size='sm' variant='secondary' onClick={() => setPicking(false)}>
              готово
            </Button>
          </div>
        </div>
      </ConfirmationModal>
    </div>
  );
}
