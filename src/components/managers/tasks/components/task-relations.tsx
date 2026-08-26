import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { cn } from 'lib/utility';
import { Button } from 'ui/components/button';
import { Combobox, type ComboboxGroup } from 'ui/components/combobox';
import Input from 'ui/components/input';
import { Pill } from 'ui/components/pill';
import { Section } from 'ui/components/section';
import SelectComponent from 'ui/components/select';
import Text from 'ui/components/text';
import type { Task, TaskRelation, TaskRelationKind } from '../api/types';
import {
  useAddTaskRelation,
  useCreateTask,
  useDeleteTaskRelation,
  useSetTaskParent,
  useTask,
  useTasks,
} from '../hooks/useTasks';
import { emptyTaskInsert } from '../api/types';
import { BOARD_LABEL, STATUS_LABEL } from '../utils/meta';
import { openBlockers, RELATION_KINDS, RELATION_LABEL, relationsOfKind } from '../utils/relations';

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
          'min-w-0 flex-1 truncate underline decoration-transparent underline-offset-2 hover:decoration-borderColor',
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
        <button
          type='button'
          aria-label={removeLabel}
          disabled={removing}
          onClick={onRemove}
          className='shrink-0 px-1 text-labelColor hover:text-textColor disabled:opacity-50'
        >
          ✕
        </button>
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
    <div className='min-w-0 flex-1' onPointerDownCapture={() => setArmed(true)}>
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

export function TaskRelations({ task, canWrite }: { task: Task; canWrite: boolean }) {
  const setParent = useSetTaskParent();
  const addRelation = useAddTaskRelation();
  const deleteRelation = useDeleteTaskRelation();
  const createTask = useCreateTask();

  const [kind, setKind] = useState<TaskRelationKind>('TASK_LINK_KIND_BLOCKED_BY');
  const [subtitle, setSubtitle] = useState('');

  // РОДИТЕЛЬ. Единственное место, где приходится сходить за вторым концом: на проводе у него
  // только номер. `useTask` сам не стреляет при нуле.
  const { data: parent } = useTask(task.parentTaskId > 0 ? task.parentTaskId : null);

  // ДЕТИ — ФИЛЬТР ТОГО ЖЕ СПИСКА, А НЕ НОВЫЙ RPC: тот же ответ, просто суженный, и он обязан
  // идти под тем же правом на раздел, что и доска.
  const childFilter = useMemo(() => ({ parentTaskId: task.id }), [task.id]);
  const { data: childData } = useTasks(childFilter);
  const children = childData?.tasks ?? [];

  const blockers = openBlockers(task.relations);

  // Кого нельзя предложить: себя (петля), уже связанных ЭТИМ видом (повтор — no-op, то есть
  // щелчок без последствий) и собственного родителя с детьми у пикера родителя.
  const excludeForKind = useMemo(() => {
    const s = new Set<number>([task.id]);
    for (const r of relationsOfKind(task.relations, kind)) s.add(r.taskId);
    return s;
  }, [task.id, task.relations, kind]);

  const excludeForParent = useMemo(() => {
    const s = new Set<number>([task.id]);
    for (const c of children) s.add(c.id);
    return s;
  }, [task.id, children]);

  async function addSubtask() {
    const title = subtitle.trim();
    if (!title) return;
    try {
      await createTask.mutateAsync({
        // Сабтаска РОЖДАЕТСЯ НА ТОЙ ЖЕ ДОСКЕ, что родитель, и в первой рабочей колонке.
        // Наследовать статус родителя было бы неправдой: у только что заведённой работы нет
        // причин быть «в ревью» только потому, что там её родитель.
        content: { ...emptyTaskInsert(), title },
        board: task.board,
        status: 'TASK_STATUS_TODO',
        parentTaskId: task.id,
      });
      setSubtitle('');
    } catch {
      /* снекбар показан мутацией */
    }
  }

  const busy = addRelation.isPending || deleteRelation.isPending || setParent.isPending;

  return (
    <Section
      title='subtasks & links'
      question={
        blockers.length ? (
          <Text size='micro' component='span' className='text-error'>
            waiting on {blockers.length} unfinished {blockers.length === 1 ? 'task' : 'tasks'}
          </Text>
        ) : undefined
      }
    >
      {/* ── РОДИТЕЛЬ ───────────────────────────────────────────────────────────────────── */}
      <div className='flex flex-col gap-1'>
        <Text size='micro' variant='label' tracking='label' component='span' className='uppercase'>
          parent
        </Text>
        {task.parentTaskId > 0 ? (
          <TaskRow
            id={task.parentTaskId}
            title={parent?.task.title ?? `#${task.parentTaskId}`}
            status={parent ? STATUS_LABEL[parent.status] : ''}
            board={parent ? BOARD_LABEL[parent.board] : undefined}
            archived={!!parent?.archivedAt}
            onRemove={
              canWrite ? () => setParent.mutate({ id: task.id, parentTaskId: 0 }) : undefined
            }
            removeLabel='detach from parent'
            removing={busy}
          />
        ) : canWrite ? (
          <TaskCombobox
            placeholder='make this a subtask of…'
            exclude={excludeForParent}
            onPick={(id) => setParent.mutate({ id: task.id, parentTaskId: id })}
          />
        ) : (
          <Text size='micro' variant='label' component='span'>
            top level
          </Text>
        )}
      </div>

      {/* ── ДЕТИ ───────────────────────────────────────────────────────────────────────── */}
      <div className='flex flex-col gap-1 border-t border-hairline pt-2.5'>
        <Text size='micro' variant='label' tracking='label' component='span' className='uppercase'>
          subtasks{task.subtaskTotal ? ` · ${task.subtaskDone}/${task.subtaskTotal}` : ''}
        </Text>
        {children.length === 0 ? (
          <Text size='micro' variant='label' component='span'>
            none yet
          </Text>
        ) : (
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
        {canWrite && (
          <div className='flex items-center gap-2 pt-1'>
            <Input
              name='new-subtask'
              aria-label='new subtask title'
              placeholder='add a subtask…'
              value={subtitle}
              disabled={createTask.isPending}
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
                  setSubtitle('');
                }
              }}
            />
            <Button
              type='button'
              variant='secondary'
              size='sm'
              loading={createTask.isPending}
              disabled={!subtitle.trim()}
              onClick={addSubtask}
            >
              add
            </Button>
          </div>
        )}
      </div>

      {/* ── СВЯЗИ ──────────────────────────────────────────────────────────────────────── */}
      <div className='flex flex-col gap-2 border-t border-hairline pt-2.5'>
        {RELATION_KINDS.map((k) => {
          const rows = relationsOfKind(task.relations, k);
          if (rows.length === 0) return null;
          return (
            <div key={k} className='flex flex-col gap-1'>
              <Text
                size='micro'
                variant='label'
                tracking='label'
                component='span'
                className='uppercase'
              >
                {RELATION_LABEL[k]}
              </Text>
              <div className='flex flex-col'>
                {rows.map((r: TaskRelation) => (
                  <TaskRow
                    key={`${k}-${r.taskId}`}
                    id={r.taskId}
                    title={r.title}
                    status={STATUS_LABEL[r.status]}
                    board={BOARD_LABEL[r.board]}
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

        {canWrite && (
          <div className='flex items-center gap-2'>
            {/* Три пункта, все три ВСЕГДА среди items: значение, которого нет в списке, скрытый
                нативный select у Radix стирает — а стирать здесь нечего, потому что стартовое
                значение тоже из этого списка. */}
            <SelectComponent
              name='relation-kind'
              items={kindOptions}
              value={kind}
              onValueChange={(v: string) => setKind(v as TaskRelationKind)}
              className='w-36 shrink-0'
            />
            <TaskCombobox
              placeholder='link a task…'
              exclude={excludeForKind}
              onPick={(id) => addRelation.mutate({ taskId: task.id, otherTaskId: id, kind })}
            />
          </div>
        )}

        {!canWrite && task.relations.length === 0 && (
          <Text size='micro' variant='label' component='span'>
            no linked tasks
          </Text>
        )}
      </div>
    </Section>
  );
}
