import { type MutableRefObject, useLayoutEffect, useMemo, useRef } from 'react';
import { useAdmins } from 'components/managers/tech-card/components/useRoles';
import { useFormContext, useWatch } from 'react-hook-form';
import { emptyTaskInsert, type Task } from '../api/types';
import { orderedMedia } from '../api/tasksService';
import { boardNameOf, useTaskBoards } from '../hooks/useTasks';
import { type TaskPanelValues, useTaskSession } from '../panel/task-session';
import { TaskTile, type TileEdit } from './task-tile';

export type TileMode = 'tile' | 'card';

const MORPH_MS = 900;
const MORPH_EASE = 'cubic-bezier(0.22, 1, 0.36, 1)';

/**
 * FLIP between two layouts of one tile. Every part marked `data-flip` is measured before the
 * layout changes (`capture`, called by whoever changes it) and, right after, starts from where it
 * stood and flows to its new place — the box and the picture stretch, the words travel.
 */
function useMorph(dep: unknown) {
  const root = useRef<HTMLDivElement>(null);
  const before = useRef<Map<string, DOMRect> | null>(null);
  const capture = () => {
    const map = new Map<string, DOMRect>();
    root.current?.querySelectorAll<HTMLElement>('[data-flip]').forEach((node) => {
      const key = node.dataset.flip;
      if (key && !map.has(key)) map.set(key, node.getBoundingClientRect());
    });
    before.current = map;
  };
  useLayoutEffect(() => {
    const from = before.current;
    before.current = null;
    if (!from || !root.current) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const seen = new Set<string>();
    root.current.querySelectorAll<HTMLElement>('[data-flip]').forEach((node) => {
      const key = node.dataset.flip;
      const was = key ? from.get(key) : undefined;
      if (!key || !was || seen.has(key)) return;
      seen.add(key);
      const now = node.getBoundingClientRect();
      if (!now.width || !now.height || !was.width || !was.height) return;
      const stretch = key === 'box' || key === 'cover';
      const sx = stretch ? was.width / now.width : 1;
      const sy = stretch ? was.height / now.height : 1;
      const dx = was.left - now.left;
      const dy = was.top - now.top;
      if (!dx && !dy && sx === 1 && sy === 1) return;
      node.animate(
        [
          {
            transformOrigin: '0 0',
            transform: `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})`,
          },
          { transformOrigin: '0 0', transform: 'none' },
        ],
        { duration: MORPH_MS, easing: MORPH_EASE },
      );
    });
  }, [dep]);
  return { root, capture };
}

/**
 * THE TILE OF THE TASK IN THE PANEL (frame `frame2-newtask-edit.svg`, left side): the board's own
 * tile, built from what the form holds NOW — so the title, the deadline, the people, and whatever
 * is pinned (description lines, steps) change on it as they are typed. `mode` is the view the
 * panel's «Opened Card / Tile Preview» tabs choose: the compact board tile or the wide card; the
 * two morph into each other (`captureRef` is called right before the mode changes).
 */
export function LiveTile({
  mode,
  captureRef,
}: {
  mode: TileMode;
  captureRef: MutableRefObject<(() => void) | null>;
}) {
  const { task, pinId, writer } = useTaskSession();
  const { control, setValue } = useFormContext<TaskPanelValues>();
  const { data: admins } = useAdmins(writer);
  const values = useWatch({ control }) as Partial<TaskPanelValues>;
  const { data: boards } = useTaskBoards();
  const { root, capture } = useMorph(mode);
  captureRef.current = capture;

  const live = useMemo<Task>(() => {
    const { boardId, status, draftSteps, parentTaskId, ...content } = values;
    const insert = { ...(task?.task ?? emptyTaskInsert()), ...content };
    const mediaIds = (insert.mediaIds ?? []) as number[];
    const known = new Map((task?.media ?? []).map((m) => [m.id, m]));
    return {
      id: task?.id ?? 0,
      boardId: boardId ?? task?.boardId ?? 0,
      status: status ?? task?.status ?? 'TASK_STATUS_TODO',
      statusSince: '',
      statusSinceApprox: false,
      position: task?.position ?? 0,
      files: [],
      statusHistory: [],
      createdBy: task?.createdBy ?? '',
      createdAt: task?.createdAt ?? '',
      updatedAt: task?.updatedAt ?? '',
      startedAt: task?.startedAt ?? '',
      archivedAt: task?.archivedAt ?? '',
      parentTaskId: parentTaskId ?? task?.parentTaskId ?? 0,
      relations: task?.relations ?? [],
      subtaskTotal: task?.subtaskTotal ?? 0,
      subtaskDone: task?.subtaskDone ?? 0,
      task: insert as Task['task'],
      media: orderedMedia(mediaIds).map((m) => known.get(m.id) ?? m),
      checklist:
        task?.checklist ??
        (draftSteps ?? []).map((content, i) => ({
          id: -1 - i,
          content: content ?? '',
          isDone: false,
          position: i,
        })),
    };
  }, [values, task]);

  // The header words of the preview are editors too: they change the FORM, like the panel's own
  // fields, and are saved with it.
  const dirty = { shouldDirty: true, shouldTouch: true };
  const edit: TileEdit | undefined = writer
    ? {
        boards: boards ?? [],
        people: (admins?.admins ?? []).map((a) => a.username).filter((n): n is string => !!n),
        onBoard: (boardId) => setValue('boardId', boardId, dirty),
        onPriority: (priority) => setValue('priority', priority, dirty),
        onStatus: (status) => setValue('status', status, dirty),
        onDueDate: (dueDate) => setValue('dueDate', dueDate, dirty),
        onAssignees: (assignees) => setValue('assignees', assignees, dirty),
      }
    : undefined;

  return (
    <div ref={root} className={mode === 'card' ? 'max-w-full' : 'max-w-[19.1875rem]'}>
      <TaskTile
        task={live}
        variant={mode === 'card' ? 'wide' : 'compact'}
        pinKey={pinId}
        writable={writer}
        edit={edit}
        boardName={boardNameOf(boards, live.boardId)}
      />
    </div>
  );
}
