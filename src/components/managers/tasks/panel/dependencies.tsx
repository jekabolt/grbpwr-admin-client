import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useController, useFormContext } from 'react-hook-form';
import { Close, Dropdown, Text } from 'ui';
import { emptyTaskInsert, type Task, type TaskRelation } from '../api/types';
import {
  useAddTaskRelation,
  useCreateTask,
  useDeleteTaskRelation,
  useSetTaskParent,
  useTask,
  useTasks,
} from '../hooks/useTasks';
import { COLUMN_LABEL } from '../utils/meta';
import { RELATION_LABEL } from '../utils/relations';
import { pageCount, pageOf } from './pager';
import type { TaskPanelValues } from './task-session';

/** Rows per page of the two lists (frame: four tasks, then «+ Add New …»). */
export const DEPENDENCY_PAGE = 4;
/** Every task, archive left out: the same read the old pickers made, shared by key. */
const ALL_TASKS = {} as const;
const EMPTY: Task[] = [];

function matches(t: Task, q: string) {
  const needle = q.trim().toLowerCase();
  return !needle || t.task.title.toLowerCase().includes(needle) || `#${t.id}`.includes(needle);
}

function asOption(t: Task) {
  return {
    value: String(t.id),
    label: t.task.title || 'Untitled',
    text: `${t.task.title} #${t.id}`,
    meta: COLUMN_LABEL[t.status],
  };
}

/** Candidates for a list: filtered by the typed text, then the page. The chosen ones lead. */
function usePaged(tasks: Task[], chosen: Set<number>, query: string, page: number) {
  return useMemo(() => {
    const hit = tasks.filter((t) => matches(t, query));
    hit.sort((a, b) => Number(chosen.has(b.id)) - Number(chosen.has(a.id)));
    return { rows: pageOf(hit, page, DEPENDENCY_PAGE).map(asOption), total: hit.length };
  }, [tasks, chosen, query, page]);
}

/**
 * DEPENDENCIES of a stored task — written at once through their own RPCs, never with the form's
 * Save (a relation belongs to two tasks; see `task-relations.tsx`).
 *
 * «Make Subtask of» — the parent (one; pressing it again detaches). «Choose Subtask» — the
 * children (several; «+ Add New Task» creates one with the typed title on this task's board).
 * «Blocked By» — the blockers (several). Other links (this one blocks, relates) stand as rows.
 */
function StoredDependencies({
  task,
  writer,
  page,
  onPages,
}: {
  task: Task;
  writer: boolean;
  page: number;
  onPages: (pages: number) => void;
}) {
  const { data } = useTasks(ALL_TASKS);
  const all = data?.tasks ?? EMPTY;
  const childFilter = useMemo(() => ({ parentTaskId: task.id }), [task.id]);
  const children = useTasks(childFilter).data?.tasks ?? EMPTY;
  const { data: parent } = useTask(task.parentTaskId > 0 ? task.parentTaskId : null);
  const setParent = useSetTaskParent();
  const addRelation = useAddTaskRelation();
  const deleteRelation = useDeleteTaskRelation();
  const createTask = useCreateTask();
  const [parentQuery, setParentQuery] = useState('');
  const [childQuery, setChildQuery] = useState('');
  const [blockQuery, setBlockQuery] = useState('');

  const childIds = useMemo(() => new Set(children.map((c) => c.id)), [children]);
  const blockers = task.relations.filter((r) => r.kind === 'TASK_LINK_KIND_BLOCKED_BY');
  const blockerIds = useMemo(() => new Set(blockers.map((b) => b.taskId)), [blockers]);
  const others = task.relations.filter((r) => r.kind !== 'TASK_LINK_KIND_BLOCKED_BY');

  // The parent may be archived (not in the list): it still stands as the chosen row.
  const parentPool = useMemo(() => {
    const pool = all.filter((t) => t.id !== task.id && !childIds.has(t.id));
    if (parent && !pool.some((t) => t.id === parent.id)) pool.unshift(parent);
    return pool;
  }, [all, task.id, childIds, parent]);
  const childPool = useMemo(() => {
    const pool = all.filter((t) => t.id !== task.id && t.id !== task.parentTaskId);
    for (const c of children) if (!pool.some((t) => t.id === c.id)) pool.unshift(c);
    return pool;
  }, [all, task.id, task.parentTaskId, children]);
  const blockPool = useMemo(() => all.filter((t) => t.id !== task.id), [all, task.id]);

  const parentSet = useMemo(() => new Set([task.parentTaskId]), [task.parentTaskId]);
  const parents = usePaged(parentPool, parentSet, parentQuery, page);
  const kids = usePaged(childPool, childIds, childQuery, page);
  const blocks = usePaged(blockPool, blockerIds, blockQuery, page);

  const pages = Math.max(
    pageCount(parents.total, DEPENDENCY_PAGE),
    pageCount(kids.total, DEPENDENCY_PAGE),
  );
  useEffect(() => onPages(pages), [pages, onPages]);

  const busy = setParent.isPending || addRelation.isPending || deleteRelation.isPending;

  return (
    <div className='@container flex flex-col gap-6'>
      <div className='grid grid-cols-1 items-start gap-x-2.5 gap-y-4 @[28rem]:grid-cols-2'>
        <Dropdown
          label='Make Subtask of'
          searchable
          deselectable
          disabled={!writer || busy}
          query={parentQuery}
          onQueryChange={setParentQuery}
          options={parents.rows}
          value={task.parentTaskId > 0 ? String(task.parentTaskId) : null}
          display={
            task.parentTaskId > 0 ? parent?.task.title || `#${task.parentTaskId}` : undefined
          }
          onChange={(next) =>
            setParent.mutate({ id: task.id, parentTaskId: next ? Number(next) : 0 })
          }
          emptyLabel='No Tasks'
        />
        <Dropdown
          label='Choose Subtask'
          searchable
          multiple
          disabled={!writer || busy}
          query={childQuery}
          onQueryChange={setChildQuery}
          options={kids.rows}
          values={[...childIds].map(String)}
          display={
            children.length
              ? `${children.length} · ${task.subtaskDone}/${task.subtaskTotal || children.length}`
              : undefined
          }
          onValuesChange={(next) => {
            const want = new Set(next.map(Number));
            for (const c of children)
              if (!want.has(c.id)) setParent.mutate({ id: c.id, parentTaskId: 0 });
            for (const id of want)
              if (!childIds.has(id)) setParent.mutate({ id, parentTaskId: task.id });
          }}
          addLabel={writer ? 'Add New Task' : undefined}
          onAdd={
            writer
              ? (title) =>
                  void createTask
                    .mutateAsync({
                      content: { ...emptyTaskInsert(), title: title || 'Untitled' },
                      boardId: task.boardId,
                      status: 'TASK_STATUS_TODO',
                      parentTaskId: task.id,
                    })
                    .then(() => setChildQuery(''))
              : undefined
          }
        />
      </div>
      <Dropdown
        label='Blocked By'
        searchable
        multiple
        disabled={!writer || busy}
        query={blockQuery}
        onQueryChange={setBlockQuery}
        options={blocks.rows}
        values={[...blockerIds].map(String)}
        display={
          blockers.length ? blockers.map((b) => b.title || `#${b.taskId}`).join(', ') : undefined
        }
        onValuesChange={(next) => {
          const want = new Set(next.map(Number));
          for (const b of blockers)
            if (!want.has(b.taskId))
              deleteRelation.mutate({ taskId: task.id, otherTaskId: b.taskId, kind: b.kind });
          for (const id of want)
            if (!blockerIds.has(id))
              addRelation.mutate({
                taskId: task.id,
                otherTaskId: id,
                kind: 'TASK_LINK_KIND_BLOCKED_BY',
              });
        }}
      />
      {others.length > 0 && <OtherLinks task={task} rows={others} writer={writer} />}
    </div>
  );
}

function OtherLinks({ task, rows, writer }: { task: Task; rows: TaskRelation[]; writer: boolean }) {
  const remove = useDeleteTaskRelation();
  return (
    <div className='flex flex-col'>
      {rows.map((r) => (
        <div
          key={`${r.kind}-${r.taskId}`}
          className='flex min-h-9 items-center gap-3 border-b border-hairline px-2 text-textBaseSize'
        >
          <Text component='span' className='w-20 shrink-0 truncate text-placeholder'>
            {RELATION_LABEL[r.kind]}
          </Text>
          <Link
            to={`/tasks/${r.taskId}`}
            className='min-w-0 flex-1 truncate text-ink hover:underline'
          >
            {r.title || `#${r.taskId}`}
          </Link>
          <Text component='span' className='shrink-0 text-placeholder'>
            {COLUMN_LABEL[r.status]}
          </Text>
          {writer && (
            <Close
              size='sm'
              aria-label={`remove link to ${r.title || `#${r.taskId}`}`}
              disabled={remove.isPending}
              onClick={() =>
                remove.mutate({ taskId: task.id, otherTaskId: r.taskId, kind: r.kind })
              }
            />
          )}
        </div>
      ))}
    </div>
  );
}

/** A new task: only its parent can be chosen before it exists; it rides the create call. */
function DraftDependencies({ page, onPages }: { page: number; onPages: (pages: number) => void }) {
  const { control } = useFormContext<TaskPanelValues>();
  const { field } = useController({ control, name: 'parentTaskId' });
  const { data } = useTasks(ALL_TASKS);
  const all = data?.tasks ?? EMPTY;
  const [query, setQuery] = useState('');
  const chosen = useMemo(() => new Set([Number(field.value) || 0]), [field.value]);
  const parents = usePaged(all, chosen, query, page);
  const pages = pageCount(parents.total, DEPENDENCY_PAGE);
  useEffect(() => onPages(pages), [pages, onPages]);
  const current = all.find((t) => t.id === field.value);
  return (
    <div className='@container grid grid-cols-1 items-start gap-x-2.5 gap-y-4 @[28rem]:grid-cols-2'>
      <Dropdown
        label='Make Subtask of'
        searchable
        deselectable
        query={query}
        onQueryChange={setQuery}
        options={parents.rows}
        value={field.value ? String(field.value) : null}
        display={current ? current.task.title || `#${current.id}` : undefined}
        onChange={(next) => field.onChange(next ? Number(next) : 0)}
        emptyLabel='No Tasks'
      />
    </div>
  );
}

export function DependenciesFields({
  task,
  writer,
  page,
  onPages,
}: {
  task?: Task;
  writer: boolean;
  page: number;
  onPages: (pages: number) => void;
}) {
  return task ? (
    <StoredDependencies task={task} writer={writer} page={page} onPages={onPages} />
  ) : (
    <DraftDependencies page={page} onPages={onPages} />
  );
}
