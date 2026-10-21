import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { cn } from 'lib/utility';
import { AddDoor, Button, Close, Combobox, type ComboboxGroup, Pill, Section, Text } from 'ui';
import type { Task, TaskRelation, TaskRelationKind } from '../api/types';
import {
  useAddTaskRelation,
  useDeleteTaskRelation,
  useSetTaskParent,
  useTask,
  useTasks,
} from '../hooks/useTasks';
import { RELATION_KINDS, RELATION_LABEL, relationsOfKind } from '../utils/relations';
import { TaskBoardPicker, type TaskPickMode } from './task-board-picker';

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

/** Пустой фильтр — ВСЕ задачи, для пикера второго конца. Литерал вынесен, чтобы ключ запроса не менялся на каждый рендер. */
const ALL_TASKS = {} as const;

/**
 * Одна строка «другой карточки», ОДНА линия: [OPEN] заголовок · исполнитель ... ×.
 * Слева кластер, вправо уходит только ×. Решённая строка гаснет цветом, без зачёркивания.
 */
function TaskRow({
  id,
  title,
  assignees = [],
  open,
  done,
  onRemove,
  removeLabel,
  removing,
}: {
  id: number;
  title: string;
  assignees?: string[];
  /** Только открытый блокер получает плашку. */
  open?: boolean;
  /** Решённая строка: заголовок в labelColor. */
  done?: boolean;
  onRemove?: () => void;
  removeLabel?: string;
  removing?: boolean;
}) {
  const who = assignees.filter((n) => !!n.trim()).join(', ');
  return (
    <div className='flex items-center gap-2 border-b border-hairline py-1 last:border-b-0'>
      <div className='flex min-w-0 flex-1 items-center gap-2'>
        {open && <Pill tone='warn'>open</Pill>}
        <Link
          to={`/tasks/${id}`}
          className={cn(
            'inline-flex min-h-11 min-w-0 items-center underline underline-offset-2 sm:min-h-0 sm:truncate',
            done && 'text-labelColor',
          )}
          title={title}
        >
          <Text size='micro' component='span' className='sm:truncate'>
            {title || `#${id}`}
          </Text>
        </Link>
        {who && (
          <Text
            size='micro'
            variant='label'
            component='span'
            className='hidden shrink-0 text-labelColor sm:inline'
          >
            {who}
          </Text>
        )}
      </div>
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

  /** Какой пикер открыт; `null` — ни одного. Дверь открывает пикер сразу, без промежуточной формы. */
  const [picker, setPicker] = useState<TaskPickMode | null>(null);
  // Последний режим живёт дольше открытия: закрывающийся Drawer не должен мигнуть чужим заголовком.
  const [lastMode, setLastMode] = useState<TaskPickMode>('blocker');
  if (picker && picker !== lastMode) setLastMode(picker);

  // РОДИТЕЛЬ. Единственное место, где приходится сходить за вторым концом: на проводе у него
  // только номер. `useTask` сам не стреляет при нуле.
  const { data: parent } = useTask(task.parentTaskId > 0 ? task.parentTaskId : null);

  // ДЕТИ — ФИЛЬТР ТОГО ЖЕ СПИСКА, А НЕ НОВЫЙ RPC: тот же ответ, просто суженный, и он обязан
  // идти под тем же правом на раздел, что и доска.
  const children = useChildren(task.id);

  async function onPick(picked: Task) {
    if (picker === 'subtask') {
      await setParent.mutateAsync({ id: picked.id, parentTaskId: task.id });
    } else {
      await addRelation.mutateAsync({
        taskId: task.id,
        otherTaskId: picked.id,
        kind: 'TASK_LINK_KIND_BLOCKED_BY',
      });
    }
    setPicker(null);
  }

  const busy = addRelation.isPending || deleteRelation.isPending || setParent.isPending;

  const hasParent = task.parentTaskId > 0;
  const showSubtasks = children.length > 0;
  const showRelations = task.relations.length > 0;
  const hasContent = hasParent || showSubtasks || showRelations;

  if (!hasContent && !canWrite) return null;

  const pickerEl = canWrite && (
    <TaskBoardPicker
      open={picker !== null}
      mode={picker ?? lastMode}
      task={task}
      onClose={() => setPicker(null)}
      onPick={onPick}
    />
  );

  const doorClass = 'min-h-11 sm:min-h-0';
  const doorRow = canWrite && (
    <div className='flex flex-wrap gap-2'>
      <AddDoor shape='inline' className={doorClass} onClick={() => setPicker('subtask')}>
        subtask
      </AddDoor>
      <AddDoor shape='inline' className={doorClass} onClick={() => setPicker('blocker')}>
        blocker
      </AddDoor>
      {doors}
    </div>
  );

  // Пусто: блок — один ряд дверей, без заголовка над пустотой.
  if (!hasContent)
    return (
      <Section className={className}>
        {doorRow}
        {pickerEl}
      </Section>
    );

  return (
    <Section title='subtasks & links' className={className}>
      {/* ── РОДИТЕЛЬ — только когда он есть; поставить его — пункт меню «⋯». ─────────────── */}
      {hasParent && (
        <div className='flex flex-col gap-1'>
          <GroupWord>parent</GroupWord>
          <TaskRow
            id={task.parentTaskId}
            title={parent?.task.title ?? `#${task.parentTaskId}`}
            assignees={parent?.task.assignees}
            done={parent?.status === 'TASK_STATUS_DONE'}
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
                  assignees={c.task.assignees}
                  done={c.status === 'TASK_STATUS_DONE'}
                  onRemove={
                    canWrite ? () => setParent.mutate({ id: c.id, parentTaskId: 0 }) : undefined
                  }
                  removeLabel={`detach subtask ${c.task.title}`}
                  removing={busy}
                />
              ))}
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
                      assignees={r.assignees}
                      open={k === 'TASK_LINK_KIND_BLOCKED_BY' && r.status !== 'TASK_STATUS_DONE'}
                      done={r.status === 'TASK_STATUS_DONE'}
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
        </div>
      )}

      {doorRow}
      {pickerEl}
    </Section>
  );
}
