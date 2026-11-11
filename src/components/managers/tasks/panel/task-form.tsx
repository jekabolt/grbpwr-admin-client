import {
  scrollerOf,
  scrollTopOf,
  setScrollTop,
  viewTopOf,
} from 'components/managers/model/components/panel-scroll';
import { useTypingOnPhone } from 'components/managers/model/components/use-typing-on-phone';
import { useDockBottom } from 'hooks/useDockBottom';
import { cn } from 'lib/utility';
import { type ReactNode, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useFormContext } from 'react-hook-form';
import { Button, ButtonRow, Category, ConfirmationModal, Text } from 'ui';
import { orderedMedia } from '../api/tasksService';
import { useTaskPin } from '../hooks/useTaskPins';
import { useArchiveTask, useDeleteTask, useUnarchiveTask } from '../hooks/useTasks';
import { AttachmentsFields } from './attachments';
import { DependenciesFields } from './dependencies';
import { CommentsFields, HistoryFields } from './history';
import { TitlePager } from './pager';
import { RequiredInfoFields } from './required-info';
import { StepsFields } from './steps';
import {
  TASK_CATEGORY_ORDER,
  type TaskCategoryKey,
  taskCategoryId,
  type TaskPanelValues,
  UNSAVED_MESSAGE,
  useTaskSession,
} from './task-session';

const WORD =
  'cursor-pointer text-textBaseSize text-ink transition-colors duration-500 ease-soft hover:underline disabled:cursor-default disabled:text-placeholder';

/** «Delete» and «Archive Task» on the Required Info title row (edit only; delete asks first). */
function TaskActions() {
  const { task, onDeleted } = useTaskSession();
  const del = useDeleteTask();
  const archive = useArchiveTask();
  const unarchive = useUnarchiveTask();
  const [asking, setAsking] = useState(false);
  if (!task) return null;
  const archived = !!task.archivedAt;
  return (
    <div className='flex items-center gap-4'>
      <Button type='button' variant='default' onClick={() => setAsking(true)} className={WORD}>
        Delete
      </Button>
      <Button
        type='button'
        variant='default'
        disabled={archive.isPending || unarchive.isPending}
        onClick={() => (archived ? unarchive.mutate(task.id) : archive.mutate(task.id))}
        className={WORD}
      >
        {archived ? 'Restore Task' : 'Archive Task'}
      </Button>
      <ConfirmationModal
        open={asking}
        onOpenChange={setAsking}
        onConfirm={() => {
          setAsking(false);
          del.mutate(task.id, { onSuccess: onDeleted });
        }}
        title='delete task'
        confirmLabel='delete'
        width='sm'
      >
        <Text size='micro' component='span'>
          Delete “{task.task.title}”? This can’t be undone.
        </Text>
      </ConfirmationModal>
    </div>
  );
}

/**
 * THE TASK PANEL, on the fill system (frame `frame-task-right-menu.svg`): borderless 32px
 * categories as one accordion — Required Info, Steps, Attachments, Dependencies, History,
 * Comments — with sticky titles, the scroll-driven folding of the Models panel and the same pins.
 * Lives inside `TaskSessionProvider`; Save / Cancel are the page's `TaskActionBar`.
 */
export function TaskForm() {
  const {
    task,
    isEditMode,
    pinId,
    writer,
    submit,
    activeCat,
    folded,
    toggleCat,
    activateCat,
    focusInto,
    quiet,
    foldPassed,
  } = useTaskSession();
  const infoPin = useTaskPin(pinId, 'info');
  const stepsPin = useTaskPin(pinId, 'steps');
  const formRef = useRef<HTMLFormElement>(null);
  const passed = useRef<{ anchor: HTMLElement; top: number } | null>(null);
  const [depPage, setDepPage] = useState(0);
  const [depPages, setDepPages] = useState(1);
  const [histPage, setHistPage] = useState(0);
  const [histPages, setHistPages] = useState(1);
  const onDepPages = useCallback((n: number) => {
    setDepPages(n);
    setDepPage((p) => Math.min(p, n - 1));
  }, []);
  const onHistPages = useCallback((n: number) => {
    setHistPages(n);
    setHistPage((p) => Math.min(p, n - 1));
  }, []);

  const order = TASK_CATEGORY_ORDER.filter(
    (k) => isEditMode || (k !== 'history' && k !== 'comments'),
  );

  // SCROLLING PAST A CATEGORY FOLDS IT (the Models panel's rule): only a category wholly above the
  // visible area folds, and the height it gives back is taken out of `scrollTop` in the same frame.
  useEffect(() => {
    const form = formRef.current;
    if (!form) return;
    const scroller = scrollerOf(form);
    const onScroll = () => {
      if (passed.current) return;
      const top = viewTopOf(scroller);
      const fold: TaskCategoryKey[] = [];
      let anchor: HTMLElement | null = null;
      for (const key of TASK_CATEGORY_ORDER) {
        const section = document.getElementById(taskCategoryId(key));
        if (!section || section.dataset.open !== 'true') continue;
        const box = section.getBoundingClientRect();
        if (box.bottom < top) fold.push(key);
        else if (!anchor) anchor = section;
      }
      if (!fold.length) return;
      const target = anchor ?? form;
      passed.current = { anchor: target, top: target.getBoundingClientRect().top };
      foldPassed(fold);
    };
    scroller.addEventListener('scroll', onScroll, { passive: true });
    return () => scroller.removeEventListener('scroll', onScroll);
  }, [folded, foldPassed]);

  useLayoutEffect(() => {
    const held = passed.current;
    const form = formRef.current;
    if (!held || !form) return;
    passed.current = null;
    const delta = held.top - held.anchor.getBoundingClientRect().top;
    const scroller = scrollerOf(form);
    if (delta) setScrollTop(scroller, scrollTopOf(scroller) - delta);
  }, [folded]);

  const tops = Category.stackTops(order, folded, { offset: 'var(--panel-sticky-offset, 0px)' });
  const categoryProps = (key: TaskCategoryKey) => ({
    id: taskCategoryId(key),
    stickyTop: tops[key],
    active: activeCat === key,
    onActivate: () => activateCat(key),
    onFocusInside: () => focusInto(key),
    open: !folded[key],
    instant: quiet.has(key) && !!folded[key],
    onOpenChange: (open: boolean) => toggleCat(key, open),
  });

  const media = orderedMedia(task?.task.mediaIds ?? []);

  return (
    <form
      ref={formRef}
      className='flex flex-col gap-4.5 pt-4 pb-6'
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <Category
        title='Task Details'
        {...categoryProps('required')}
        pin={{
          pinned: infoPin.pinned,
          onToggle: infoPin.toggle,
          label: 'pin description to the tile',
        }}
        action={isEditMode && writer ? <TaskActions /> : undefined}
      >
        <RequiredInfoFields />
      </Category>

      <Category
        title='Steps'
        {...categoryProps('steps')}
        pin={{ pinned: stepsPin.pinned, onToggle: stepsPin.toggle, label: 'pin steps to the tile' }}
      >
        <StepsFields taskId={task?.id} items={task?.checklist} writer={writer} />
      </Category>

      <Category title='Attachments' {...categoryProps('attachments')}>
        <AttachmentsFields task={task} writer={writer} />
      </Category>

      <Category
        title='Dependencies'
        {...categoryProps('dependencies')}
        action={
          <TitlePager page={depPage} pages={depPages} onPage={setDepPage} label='dependencies' />
        }
      >
        <DependenciesFields task={task} writer={writer} page={depPage} onPages={onDepPages} />
      </Category>

      {task && (
        <Category
          title='History'
          {...categoryProps('history')}
          action={
            <TitlePager page={histPage} pages={histPages} onPage={setHistPage} label='history' />
          }
        >
          <HistoryFields task={task} page={histPage} onPages={onHistPages} />
        </Category>
      )}

      {task && (
        <Category title='Comments' {...categoryProps('comments')}>
          <CommentsFields task={task} media={media} />
        </Category>
      )}
      {/* A panel's height of room under the last category (the Models panel's rule): a child, not
          padding — sticky titles may not leave the form's content box. */}
      <div aria-hidden='true' className='min-[56.25rem]:h-[calc(100dvh-10rem)]' />
    </form>
  );
}

/**
 * The bottom action bar (the Models «contexterror» bar): the context in 24px ink at the left — the
 * held leave's question, or why the save was refused — and Cancel / Save («Add» for a new task)
 * as a `ButtonRow` at the right.
 */
export function TaskActionBar({
  leaving,
  onContinue,
  onClose,
}: {
  leaving: boolean;
  onContinue: () => void;
  onClose: () => void;
}) {
  const { isEditMode, writer, submit, submitting, formError } = useTaskSession();
  const form = useFormContext<TaskPanelValues>();
  const isDirty = form.formState.isDirty;
  const bar = useRef<HTMLDivElement>(null);
  useDockBottom(bar, []);
  const typingOnPhone = useTypingOnPhone();
  const message = formError ?? (leaving ? UNSAVED_MESSAGE : '');

  return (
    <div
      ref={bar}
      role='region'
      aria-label='actions'
      className={cn(
        'fixed inset-x-0 bottom-0 z-[var(--z-dock)] flex min-h-12.25 flex-wrap items-center justify-between gap-x-6 gap-y-2 bg-bgColor py-2 pr-2.5 pl-[clamp(1.5rem,13vw,11.6875rem)] max-md:px-3',
        typingOnPhone && 'hidden',
      )}
    >
      <p
        role={formError ? 'alert' : 'status'}
        key={message}
        className='min-w-0 flex-1 text-head leading-tight text-ink motion-safe:animate-[tasks-fade-up_700ms_var(--ease-soft)_both] max-md:text-textBaseSize'
      >
        {message}
      </p>
      <ButtonRow
        label='save or cancel'
        className='w-full shrink-0 md:w-[min(30.9375rem,46vw)]'
        items={[
          {
            key: 'cancel',
            label: 'Cancel',
            onClick: () => {
              form.reset();
              if (leaving) onContinue();
              else onClose();
            },
          },
          ...(writer
            ? [
                {
                  key: 'save',
                  label: isEditMode ? 'Save' : 'Add',
                  busy: submitting,
                  disabled: submitting || (isEditMode && !isDirty && !leaving),
                  onClick: () => {
                    void submit().then((ok) => {
                      if (ok && leaving) onContinue();
                    });
                  },
                },
              ]
            : []),
        ]}
      />
    </div>
  );
}

/** While the bar speaks, everything above it steps back to 32% (soft ease). */
export function TaskDim({
  leaving,
  className,
  children,
}: {
  leaving: boolean;
  className?: string;
  children: ReactNode;
}) {
  const { formError } = useTaskSession();
  return (
    <div
      className={cn(
        'transition-opacity duration-700 ease-soft motion-reduce:transition-none',
        (leaving || !!formError) && 'opacity-32',
        className,
      )}
    >
      {children}
    </div>
  );
}
