import { useQueryClient } from '@tanstack/react-query';
import { usePermissions } from 'components/managers/accounts/utils/permissions';
import {
  scrollerOf,
  scrollTopOf,
  softScrollTo,
  viewTopOf,
} from 'components/managers/model/components/panel-scroll';
import { SECTION } from 'constants/routes';
import { notify } from 'lib/stores/store';
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { useForm } from 'react-hook-form';
import { Form } from 'ui';
import { tasksService } from '../api/tasksService';
import { type Task, type TaskFormValues, type TaskInsert } from '../api/types';
import { clearTaskDraft, loadTaskDraft, saveTaskDraft } from '../hooks/useTaskDraft';
import {
  INLINE_BUSY_MESSAGE,
  tasksKeys,
  useCreateTask,
  useInlineTaskPatch,
  useMoveTask,
} from '../hooks/useTasks';

export type TaskCategoryKey =
  | 'required'
  | 'steps'
  | 'attachments'
  | 'dependencies'
  | 'history'
  | 'comments';

export const TASK_CATEGORY_ORDER: TaskCategoryKey[] = [
  'required',
  'steps',
  'attachments',
  'dependencies',
  'history',
  'comments',
];
export const taskCategoryId = (key: TaskCategoryKey) => `task-category-${key}`;

/**
 * The panel's form: the task's content and placement, plus what a NEW task collects before it has
 * an id (its steps and its parent) — those ride the create call (`AddTask(parentTaskId)`) and the
 * checklist RPCs right after it.
 */
export type TaskPanelValues = TaskFormValues & { draftSteps: string[]; parentTaskId: number };

/**
 * WHAT THE SAVE BUTTON WRITES on an existing task: the content fields below and the placement
 * (board, status). Steps, attachments, dependencies and comments write at once through their own
 * RPCs, as they always did — they belong to the task, not to the form (a relation is two tasks'; a
 * checklist row has its own done state; an upload is a fact the moment it lands).
 */
const SAVED_FIELDS: (keyof TaskInsert)[] = [
  'title',
  'description',
  'assignees',
  'priority',
  'dueDate',
  'startDate',
  'labels',
  'techCardId',
  'productId',
  'orderUuid',
  'archiveId',
  'fittingId',
  'productionRunId',
  'sampleId',
  'projectTopicId',
];

function same(a: unknown, b: unknown) {
  if (typeof a === 'string' && typeof b === 'string') return a.trim() === b.trim();
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

export function taskToValues(task: Task): TaskPanelValues {
  return {
    ...task.task,
    boardId: task.boardId,
    status: task.status,
    draftSteps: [],
    parentTaskId: task.parentTaskId,
  };
}

/** The owner's sentence for a blocked leave — the same words as the Models screen. */
export const UNSAVED_MESSAGE = 'You have unsaved changes, what to do?';

type Accordion = {
  activeCat: TaskCategoryKey;
  folded: Partial<Record<TaskCategoryKey, boolean>>;
  quiet: ReadonlySet<TaskCategoryKey>;
  toggleCat: (key: TaskCategoryKey, open: boolean) => void;
  activateCat: (key: TaskCategoryKey) => void;
  focusInto: (key: TaskCategoryKey) => void;
  foldPassed: (keys: TaskCategoryKey[]) => void;
};

type TaskSession = Accordion & {
  isEditMode: boolean;
  /** The stored task (edit), undefined for a new one. */
  task?: Task;
  /** The pin key of this session: the task id, or `new` while it is being created. */
  pinId: string;
  writer: boolean;
  submit: () => Promise<boolean>;
  submitting: boolean;
  formError: string | null;
  onDeleted: () => void;
};

const TaskSessionContext = createContext<TaskSession | null>(null);

export function useTaskSession(): TaskSession {
  const value = useContext(TaskSessionContext);
  if (!value) throw new Error('no TaskSessionProvider');
  return value;
}

/** The accordion of the panel (the Models panel's, same rules). */
function useAccordion(): Accordion {
  // Everything opens by default. Scrolling past a whole category folds it; it never reopens by
  // itself. A title click opens a folded category and brings its title to the top of the panel.
  const [activeCat, setActiveCat] = useState<TaskCategoryKey>('required');
  const [folded, setFolded] = useState<Partial<Record<TaskCategoryKey, boolean>>>({});
  const [quiet, setQuiet] = useState<ReadonlySet<TaskCategoryKey>>(new Set());
  const reveal = useCallback((key: TaskCategoryKey) => {
    setActiveCat(key);
    setQuiet((q) => {
      if (!q.has(key)) return q;
      const next = new Set(q);
      next.delete(key);
      return next;
    });
    setFolded((f) => (f[key] ? { ...f, [key]: false } : f));
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        const section = document.getElementById(taskCategoryId(key));
        if (!section) return;
        const scroller = scrollerOf(section);
        const top =
          scrollTopOf(scroller) + section.getBoundingClientRect().top - viewTopOf(scroller);
        const row = section.firstElementChild as HTMLElement | null;
        const stuck = row ? parseFloat(getComputedStyle(row).top) || 0 : 0;
        softScrollTo(scroller, Math.max(0, top - stuck - 8));
      }),
    );
  }, []);
  const foldPassed = useCallback((keys: TaskCategoryKey[]) => {
    setQuiet((q) => new Set([...q, ...keys]));
    setFolded((f) => ({ ...f, ...Object.fromEntries(keys.map((k) => [k, true])) }));
  }, []);
  const foldedRef = useRef(folded);
  foldedRef.current = folded;
  const focusInto = useCallback(
    (key: TaskCategoryKey) => {
      setActiveCat(key);
      if (foldedRef.current[key]) reveal(key);
    },
    [reveal],
  );
  return {
    activeCat,
    folded,
    quiet,
    toggleCat: (key, open) => (open ? reveal(key) : setFolded((f) => ({ ...f, [key]: true }))),
    activateCat: setActiveCat,
    focusInto,
    foldPassed,
  };
}

/** The create form's draft key: one draft per board the `+` was pressed on. */
const draftKeyOf = (boardId: number) => `panel.board-${boardId}`;

/**
 * ONE FORM FOR THE PANEL AND THE ACTION BAR (the Models session, for a task). Create and edit are
 * the same form; edit pre-fills from the task.
 *
 * SAVING AN EXISTING TASK NEVER SENDS A STALE COPY. `UpdateTask` replaces the whole content, so the
 * save goes through `useInlineTaskPatch` — the only safe door: it sends the CHANGED fields only,
 * re-reads the task, refuses when one of them was changed by someone else since the panel opened
 * (`base` = what the panel was seeded with), and keeps everybody else's edits of the other fields.
 * Board and status go through `MoveTask`, which touches no content.
 *
 * A NEW TASK keeps a draft (localStorage, per board) while it is typed; a successful create clears
 * it. `onCreated` gets the new id.
 */
export function TaskSessionProvider({
  task,
  initial,
  onCreated,
  onDeleted,
  onDirtyChange,
  children,
}: {
  /** Undefined = a new task. */
  task?: Task;
  /** A new task's seed (board, column, project). */
  initial?: TaskPanelValues;
  onCreated: (id: number) => void;
  onDeleted: () => void;
  onDirtyChange?: (dirty: boolean) => void;
  children: ReactNode;
}) {
  const isEditMode = !!task;
  const writer = usePermissions().canWrite(SECTION.tasks);
  const [formError, setFormError] = useState<string | null>(null);
  const accordion = useAccordion();
  const qc = useQueryClient();
  const createTask = useCreateTask();
  const inline = useInlineTaskPatch(task?.id ?? 0);
  const move = useMoveTask({ boardId: task?.boardId });

  const draftKey = !task && initial ? draftKeyOf(initial.boardId) : null;
  const seed = useRef<TaskPanelValues>(
    task
      ? taskToValues(task)
      : (() => {
          const base = initial!;
          const draft = draftKey ? loadTaskDraft(draftKey) : null;
          return draft ? { ...base, ...draft, boardId: base.boardId, status: base.status } : base;
        })(),
  );
  const form = useForm<TaskPanelValues>({ defaultValues: seed.current, mode: 'onSubmit' });

  useEffect(() => {
    const sub = form.watch(() => setFormError(null));
    return () => sub.unsubscribe();
  }, [form]);

  // The new task's draft, saved as it is typed.
  useEffect(() => {
    if (!draftKey) return;
    let t: ReturnType<typeof setTimeout> | undefined;
    const sub = form.watch((values) => {
      clearTimeout(t);
      t = setTimeout(() => {
        const v = values as TaskPanelValues;
        if (!v.title?.trim() && !v.description?.trim()) clearTaskDraft(draftKey);
        else saveTaskDraft(draftKey, v);
      }, 300);
    });
    return () => {
      clearTimeout(t);
      sub.unsubscribe();
    };
  }, [form, draftKey]);

  const isDirty = form.formState.isDirty;
  useEffect(() => {
    onDirtyChange?.(isDirty);
  }, [isDirty, onDirtyChange]);
  useEffect(() => () => onDirtyChange?.(false), [onDirtyChange]);

  async function save(values: TaskPanelValues): Promise<boolean> {
    setFormError(null);
    if (!values.title?.trim()) {
      setFormError('the task needs a title');
      return false;
    }
    try {
      if (task) {
        const before = seed.current;
        const changed = SAVED_FIELDS.filter((k) => !same(values[k], before[k]));
        if (changed.length) {
          const patch = Object.fromEntries(
            changed.map((k) => [k, values[k]]),
          ) as Partial<TaskInsert>;
          const seen = Object.fromEntries(
            changed.map((k) => [k, before[k]]),
          ) as Partial<TaskInsert>;
          // Mirrors the deprecated single assignee the adapter derives anyway.
          if (patch.assignees) patch.assignee = patch.assignees[0] ?? '';
          await inline.mutateAsync({ patch, base: { ...task.task, ...seen } });
        }
        if (values.boardId !== before.boardId || values.status !== before.status) {
          await move.mutateAsync({
            id: task.id,
            boardId: values.boardId,
            status: values.status,
            position: 0,
          });
        }
        seed.current = values;
        form.reset(values);
        return true;
      }
      const { boardId, status, draftSteps, parentTaskId, ...content } = values;
      const created = await createTask.mutateAsync({
        content: { ...content, assignee: content.assignees[0] ?? '' },
        boardId,
        status,
        parentTaskId: parentTaskId || undefined,
      });
      // The steps typed before the task existed land on it now, in order.
      for (const step of draftSteps) {
        try {
          await tasksService.addChecklistItem(created.id, step);
        } catch (e) {
          notify({
            sev: 'error',
            subject: `TASK ${created.id}`,
            text: 'step not added',
            detail: e instanceof Error ? e.message : undefined,
          });
        }
      }
      if (draftSteps.length) qc.invalidateQueries({ queryKey: tasksKeys.all });
      if (draftKey) clearTaskDraft(draftKey);
      form.reset(values);
      onCreated(created.id);
      return true;
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'not saved';
      setFormError(msg === INLINE_BUSY_MESSAGE ? `${msg}` : msg);
      return false;
    }
  }

  const submit = () =>
    new Promise<boolean>((resolve) => {
      void form.handleSubmit(
        async (data) => resolve(await save(data)),
        () => {
          setFormError('the task needs a title');
          resolve(false);
        },
      )();
    });

  const session: TaskSession = {
    ...accordion,
    isEditMode,
    task,
    pinId: task ? String(task.id) : 'new',
    writer,
    submit,
    submitting: form.formState.isSubmitting,
    formError,
    onDeleted,
  };

  return (
    <Form {...form}>
      <TaskSessionContext.Provider value={session}>{children}</TaskSessionContext.Provider>
    </Form>
  );
}
