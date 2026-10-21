import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { cn } from 'lib/utility';
import {
  AddDoor,
  Button,
  Close,
  Combobox,
  type ComboboxGroup,
  Input,
  Pill,
  Section,
  Select,
  Text,
} from 'ui';
import type { Task, TaskRelation, TaskRelationKind } from '../api/types';
import {
  useAddTaskRelation,
  useCreateTask,
  useDeleteTaskRelation,
  useSetTaskParent,
  useTask,
  useTasks,
  boardNameOf,
  useTaskBoards,
} from '../hooks/useTasks';
import { emptyTaskInsert } from '../api/types';
import { STATUS_LABEL } from '../utils/meta';
import { RELATION_KINDS, RELATION_LABEL, relationsOfKind } from '../utils/relations';

/**
 * САБТАСКИ, БЛОКЕРЫ И СВЯЗИ — ОДИН БЛОК НА ДЕТАЛЬНОЙ СТРАНИЦЕ.
 *
 * ── ПОЧЕМУ ВСЁ ЗДЕСЬ ПИШЕТСЯ ОТДЕЛЬНЫМИ RPC ─────────────────────────────────────────────────
 *
 * Ни родитель, ни связи не едут внутри `TaskInsert`, и это не экономия вызовов, а единственная
 * форма, в которой они не теряются. Содержимое карточки сохраняется ПОЛНОЙ ЗАМЕНОЙ; связь при
 * этом принадлежит ДВУМ карточкам сразу. Полная замена «связей карточки A» при сохранении её
 * формы снесла бы связь, которую кто-то добавил с карточки B, пока форма A была открыта, — и
 * снесла бы молча, потому что для формы A эта связь просто не существовала.
 *
 * ── ВТОРОЙ КОНЕЦ УЖЕ РАЗРЕШЁН ───────────────────────────────────────────────────────────────
 *
 * `TaskRelation` приезжает с заголовком, статусом, доской и признаком архива. Ни один ряд здесь
 * не ходит за вторым концом — ни бейдж «blocked», ни список связей не имеют права стоить N+1.
 * Единственное исключение — РОДИТЕЛЬ: у него на проводе один лишь номер, и заголовок для него
 * приходится прочитать (`useTask`) ровно один, отдельным чтением.
 *
 * ── ЧЕГО ЗДЕСЬ НЕТ ──────────────────────────────────────────────────────────────────────────
 *
 * Запрета перевести заблокированную карточку в `DONE` нет — ни на сервере, ни здесь. Доска —
 * drag-and-drop, и отказ посреди жеста хуже бейджа; заархивированный недоделанный блокер
 * замуровал бы карточку навсегда. Блокер — совет, а не замок.
 */

const kindOptions = RELATION_KINDS.map((k) => ({ value: k as string, label: RELATION_LABEL[k] }));

/** Пустой фильтр — ВСЕ задачи, для пикера второго конца. Литерал вынесен, чтобы ключ запроса не менялся на каждый рендер. */
const ALL_TASKS = {} as const;

/** Одна строка «другой карточки»: куда ведёт, чем стала, и чем её снять. */
function TaskRow({
  id,
  title,
  status,
  board,
  archived,
  muted,
  onRemove,
  removeLabel,
  removing,
}: {
  id: number;
  title: string;
  status: string;
  board?: string;
  archived?: boolean;
  /** Решённая или заархивированная строка гаснет: она есть, но она уже не работа. */
  muted?: boolean;
  onRemove?: () => void;
  removeLabel?: string;
  removing?: boolean;
}) {
  return (
    <div className='flex items-center gap-2 border-b border-hairline py-1 last:border-b-0'>
      <Link
        to={`/tasks/${id}`}
        className={cn(
          'inline-flex min-h-11 min-w-0 flex-1 items-center truncate underline decoration-transparent underline-offset-2 hover:decoration-borderColor sm:min-h-0',
          muted && 'text-labelColor',
        )}
        title={title}
      >
        <Text size='micro' component='span'>
          {title || `#${id}`}
        </Text>
      </Link>
      {archived && <Pill tone='ink'>archived</Pill>}
      <Text
        size='nano'
        variant='label'
        component='span'
        className='shrink-0 uppercase tracking-label'
      >
        {status}
        {board ? ` · ${board}` : ''}
      </Text>
      {onRemove && (
        <Close size='sm' aria-label={removeLabel} disabled={removing} onClick={onRemove} />
      )}
    </div>
  );
}

/**
 * ПИКЕР ВТОРОЙ КАРТОЧКИ. Поиск, а не список: карточек на доске сотни, и «какая из ЭТИХ» —
 * неотвечаемый вопрос. Фильтр живёт здесь, снаружи примитива, — так же, как у остальных
 * комбобоксов репозитория.
 */
function TaskCombobox({
  placeholder,
  exclude,
  onPick,
}: {
  placeholder: string;
  /** Кого нельзя выбрать: сама карточка и те, с кем связь уже есть. */
  exclude: Set<number>;
  onPick: (id: number) => void;
}) {
  /**
   * СПИСОК ЗАДАЧ БЕРЁТСЯ ТОЛЬКО КОГДА ПИКЕР ТРОНУЛИ. Это чтение ВСЕЙ доски (потолок 1000 строк),
   * и без этого замка оно уходило бы при каждом открытии карточки — ради поповера, который в
   * большинстве случаев так и не открывают. Взводится на `pointerdown` в фазе перехвата: он
   * приходит РАНЬШЕ, чем `click` откроет список, поэтому запрос успевает уйти к моменту, когда
   * человеку есть на что смотреть.
   */
  const [armed, setArmed] = useState(false);
  const { data } = useTasks(ALL_TASKS, armed);
  const tasks = data?.tasks ?? [];

  const filter = useMemo(
    () =>
      (query: string): ComboboxGroup[] => {
        const q = query.trim().toLowerCase();
        const rows = tasks
          .filter((t) => !exclude.has(t.id))
          .filter((t) => !q || `${t.task.title} #${t.id}`.toLowerCase().includes(q))
          // Потолок строк — не украшение: комбобокс рисует всё, что ему дали, и тысяча
          // кнопок в поповере кладёт кадр на каждое нажатие клавиши.
          .slice(0, 50)
          .map((t) => ({ value: String(t.id), label: `#${t.id} · ${t.task.title || 'untitled'}` }));
        return rows.length ? [{ key: 'tasks', label: 'tasks', options: rows }] : [];
      },
    [tasks, exclude],
  );

  return (
    <div
      className='min-w-0 flex-1 [&_button]:min-h-11 sm:[&_button]:min-h-0'
      onPointerDownCapture={() => setArmed(true)}
    >
      <Combobox
        name='task-target'
        placeholder={placeholder}
        searchPlaceholder='title or #id'
        filter={filter}
        onSelect={(v) => onPick(Number(v))}
      />
    </div>
  );
}

/** Дети карточки — фильтр того же списка (см. довод в `TaskRelations`). */
function useChildren(taskId: number) {
  const childFilter = useMemo(() => ({ parentTaskId: taskId }), [taskId]);
  const { data } = useTasks(childFilter);
  return data?.tasks ?? EMPTY_TASKS;
}

const EMPTY_TASKS: Task[] = [];

/**
 * ПИКЕР РОДИТЕЛЯ — живёт в меню «⋯» страницы (detail v2): ставить родителя — редкое действие, и
 * всегда открытое поле «make this a subtask of…» в блоке связей было шумом на каждой карточке.
 * Тот же пикер и та же мутация, что стояли здесь; меняется только дверь к ним.
 */
export function ParentPicker({ task, onDone }: { task: Task; onDone: () => void }) {
  const setParent = useSetTaskParent();
  const children = useChildren(task.id);

  // Нельзя предложить себя (петля) и собственных детей.
  const exclude = useMemo(() => {
    const s = new Set<number>([task.id]);
    for (const c of children) s.add(c.id);
    return s;
  }, [task.id, children]);

  return (
    <div className='flex flex-col items-stretch gap-2 sm:flex-row sm:items-center'>
      <TaskCombobox
        placeholder='make this a subtask of…'
        exclude={exclude}
        onPick={(id) =>
          setParent.mutate({ id: task.id, parentTaskId: id }, { onSuccess: () => onDone() })
        }
      />
      <Button
        type='button'
        variant='underline'
        size='xs'
        className='min-h-11 sm:min-h-0'
        onClick={onDone}
      >
        cancel
      </Button>
    </div>
  );
}

type Editor = 'subtask' | 'relation' | null;

/** Подпись группы внутри блока — тот же микро-капс, что у соседних групп. */
function GroupWord({ children }: { children: React.ReactNode }) {
  return (
    <Text size='micro' variant='label' tracking='label' component='span' className='uppercase'>
      {children}
    </Text>
  );
}

export function TaskRelations({
  task,
  canWrite,
  doors,
  className,
}: {
  task: Task;
  canWrite: boolean;
  /** Чужие двери в тот же ряд (`+ file` у пустых вложений) — один ряд «+ …» на страницу. */
  doors?: React.ReactNode;
  className?: string;
}) {
  const setParent = useSetTaskParent();
  const addRelation = useAddTaskRelation();
  const deleteRelation = useDeleteTaskRelation();
  const createTask = useCreateTask();
  const { data: boards } = useTaskBoards();

  const [kind, setKind] = useState<TaskRelationKind>('TASK_LINK_KIND_BLOCKED_BY');
  const [subtitle, setSubtitle] = useState('');
  /**
   * ФОРМЫ ОТКРЫВАЮТСЯ ДВЕРЬЮ (detail v2). Пустая группа не рисует свою форму — вместо неё один
   * ряд «+ subtask / + blocker / + link»; нажатие открывает ту самую форму, что стояла здесь
   * всегда открытой.
   */
  const [editor, setEditor] = useState<Editor>(null);

  // РОДИТЕЛЬ. Единственное место, где приходится сходить за вторым концом: на проводе у него
  // только номер. `useTask` сам не стреляет при нуле.
  const { data: parent } = useTask(task.parentTaskId > 0 ? task.parentTaskId : null);

  // ДЕТИ — ФИЛЬТР ТОГО ЖЕ СПИСКА, А НЕ НОВЫЙ RPC: тот же ответ, просто суженный, и он обязан
  // идти под тем же правом на раздел, что и доска.
  const children = useChildren(task.id);

  // Кого нельзя предложить: себя (петля) и уже связанных ЭТИМ видом (повтор — no-op, то есть
  // щелчок без последствий).
  const excludeForKind = useMemo(() => {
    const s = new Set<number>([task.id]);
    for (const r of relationsOfKind(task.relations, kind)) s.add(r.taskId);
    return s;
  }, [task.id, task.relations, kind]);

  async function addSubtask() {
    const title = subtitle.trim();
    if (!title || createTask.isPending) return;
    try {
      await createTask.mutateAsync({
        // Сабтаска РОЖДАЕТСЯ НА ТОЙ ЖЕ ДОСКЕ, что родитель, и в первой рабочей колонке.
        // Наследовать статус родителя было бы неправдой: у только что заведённой работы нет
        // причин быть «в ревью» только потому, что там её родитель.
        content: { ...emptyTaskInsert(), title },
        boardId: task.boardId,
        status: 'TASK_STATUS_TODO',
        parentTaskId: task.id,
      });
      setSubtitle('');
    } catch {
      /* снекбар показан мутацией */
    }
  }

  function closeEditor() {
    setEditor(null);
    setSubtitle('');
  }

  function openRelation(k: TaskRelationKind) {
    setKind(k);
    setEditor('relation');
  }

  const busy = addRelation.isPending || deleteRelation.isPending || setParent.isPending;

  const hasParent = task.parentTaskId > 0;
  const showSubtasks = children.length > 0 || editor === 'subtask';
  const showRelations = task.relations.length > 0 || editor === 'relation';
  const hasContent = hasParent || showSubtasks || showRelations;

  if (!hasContent && !canWrite) return null;

  const doorClass = 'min-h-11 sm:min-h-0';
  const doorRow = canWrite && (
    <div className='flex flex-wrap gap-2'>
      <AddDoor shape='inline' className={doorClass} onClick={() => setEditor('subtask')}>
        subtask
      </AddDoor>
      <AddDoor
        shape='inline'
        className={doorClass}
        onClick={() => openRelation('TASK_LINK_KIND_BLOCKED_BY')}
      >
        blocker
      </AddDoor>
      <AddDoor
        shape='inline'
        className={doorClass}
        onClick={() => openRelation('TASK_LINK_KIND_RELATES')}
      >
        link
      </AddDoor>
      {doors}
    </div>
  );

  // Пусто: блок — один ряд дверей, без заголовка над пустотой.
  if (!hasContent) return <Section className={className}>{doorRow}</Section>;

  return (
    <Section title='subtasks & links' className={className}>
      {/* ── РОДИТЕЛЬ — только когда он есть; поставить его — пункт меню «⋯». ─────────────── */}
      {hasParent && (
        <div className='flex flex-col gap-1'>
          <GroupWord>parent</GroupWord>
          <TaskRow
            id={task.parentTaskId}
            title={parent?.task.title ?? `#${task.parentTaskId}`}
            status={parent ? STATUS_LABEL[parent.status] : ''}
            board={parent ? boardNameOf(boards, parent.boardId) : undefined}
            archived={!!parent?.archivedAt}
            onRemove={
              canWrite ? () => setParent.mutate({ id: task.id, parentTaskId: 0 }) : undefined
            }
            removeLabel='detach from parent'
            removing={busy}
          />
        </div>
      )}

      {/* ── ДЕТИ ───────────────────────────────────────────────────────────────────────── */}
      {showSubtasks && (
        <div className='flex flex-col gap-1'>
          <GroupWord>
            subtasks{task.subtaskTotal ? ` · ${task.subtaskDone}/${task.subtaskTotal}` : ''}
          </GroupWord>
          {children.length > 0 && (
            <div className='flex flex-col'>
              {children.map((c) => (
                <TaskRow
                  key={c.id}
                  id={c.id}
                  title={c.task.title}
                  status={STATUS_LABEL[c.status]}
                  archived={!!c.archivedAt}
                  muted={c.status === 'TASK_STATUS_DONE' || !!c.archivedAt}
                  onRemove={
                    canWrite ? () => setParent.mutate({ id: c.id, parentTaskId: 0 }) : undefined
                  }
                  removeLabel={`detach subtask ${c.task.title}`}
                  removing={busy}
                />
              ))}
            </div>
          )}
          {canWrite && editor === 'subtask' && (
            <div className='flex flex-col items-stretch gap-2 pt-1 sm:flex-row sm:items-center'>
              <Input
                name='new-subtask'
                aria-label='new subtask title'
                placeholder='add a subtask…'
                value={subtitle}
                disabled={createTask.isPending}
                autoFocus
                className='min-h-11 sm:min-h-0'
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSubtitle(e.target.value)}
                onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => {
                  // Enter и Escape сравниваются по `e.key` сознательно: они не буквы и на любой
                  // раскладке приезжают одними и теми же именами.
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addSubtask();
                  }
                  if (e.key === 'Escape') {
                    e.preventDefault();
                    closeEditor();
                  }
                }}
              />
              <div className='flex items-center gap-2'>
                <Button
                  type='button'
                  variant='secondary'
                  size='sm'
                  className='min-h-11 sm:min-h-0'
                  loading={createTask.isPending}
                  disabled={!subtitle.trim()}
                  onClick={addSubtask}
                >
                  add
                </Button>
                <Button
                  type='button'
                  variant='underline'
                  size='xs'
                  className='min-h-11 sm:min-h-0'
                  onClick={closeEditor}
                >
                  cancel
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── СВЯЗИ ──────────────────────────────────────────────────────────────────────── */}
      {showRelations && (
        <div className='flex flex-col gap-2'>
          {RELATION_KINDS.map((k) => {
            const rows = relationsOfKind(task.relations, k);
            if (rows.length === 0) return null;
            return (
              <div key={k} className='flex flex-col gap-1'>
                <GroupWord>{RELATION_LABEL[k]}</GroupWord>
                <div className='flex flex-col'>
                  {rows.map((r: TaskRelation) => (
                    <TaskRow
                      key={`${k}-${r.taskId}`}
                      id={r.taskId}
                      title={r.title}
                      status={STATUS_LABEL[r.status]}
                      board={boardNameOf(boards, r.boardId)}
                      archived={r.archived}
                      muted={r.status === 'TASK_STATUS_DONE'}
                      onRemove={
                        canWrite
                          ? () =>
                              deleteRelation.mutate({
                                taskId: task.id,
                                otherTaskId: r.taskId,
                                kind: k,
                              })
                          : undefined
                      }
                      removeLabel={`remove link to ${r.title || `#${r.taskId}`}`}
                      removing={busy}
                    />
                  ))}
                </div>
              </div>
            );
          })}

          {canWrite && editor === 'relation' && (
            <div className='flex flex-col items-stretch gap-2 sm:flex-row sm:items-center'>
              {/* Три пункта, все три ВСЕГДА среди items: значение, которого нет в списке, скрытый
                  нативный select у Radix стирает — а стирать здесь нечего, потому что стартовое
                  значение тоже из этого списка. */}
              <Select
                name='relation-kind'
                items={kindOptions}
                value={kind}
                onValueChange={(v: string) => setKind(v as TaskRelationKind)}
                className='min-h-11 w-full shrink-0 sm:min-h-0 sm:w-36'
              />
              <TaskCombobox
                placeholder='link a task…'
                exclude={excludeForKind}
                onPick={(id) =>
                  addRelation.mutate(
                    { taskId: task.id, otherTaskId: id, kind },
                    { onSuccess: () => setEditor(null) },
                  )
                }
              />
              <Button
                type='button'
                variant='underline'
                size='xs'
                className='min-h-11 sm:min-h-0'
                onClick={closeEditor}
              >
                cancel
              </Button>
            </div>
          )}
        </div>
      )}

      {doorRow}
    </Section>
  );
}
