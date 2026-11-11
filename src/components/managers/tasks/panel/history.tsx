import { format, formatDistanceToNow } from 'date-fns';
import { usePermissions } from 'components/managers/accounts/utils/permissions';
import { cn } from 'lib/utility';
import { useEffect, useMemo, useState } from 'react';
import { Button, ConfirmationModal, Dropdown, EmptyCell, NoteBlock, Text } from 'ui';
import type { Task, TaskComment, TaskMedia, TaskStatusChange } from '../api/types';
import { canDeleteComment, isOwnComment } from '../components/task-comments';
import { TaskText } from '../components/task-text';
import { useAddComment, useDeleteComment, useTaskComments } from '../hooks/useTasks';
import { COLUMN_LABEL } from '../utils/meta';
import { pageCount, pageOf } from './pager';

export const HISTORY_PAGE = 5;

function changeLabel(h: TaskStatusChange): string {
  const unknown = 'TASK_STATUS_UNKNOWN';
  if (h.approximate) return `≈ ${COLUMN_LABEL[h.toStatus]}`;
  if (h.fromStatus === unknown)
    return h.toStatus === unknown ? 'Created' : `Created · ${COLUMN_LABEL[h.toStatus]}`;
  return `${COLUMN_LABEL[h.fromStatus]} → ${COLUMN_LABEL[h.toStatus]}`;
}

/**
 * HISTORY (frame: a «History» dropdown, rows of change + date in two columns on ink rules; the
 * chosen row ink, the rest grey). The status moves of the task, newest first, paged by the title's
 * `1 / N`.
 */
export function HistoryFields({
  task,
  page,
  onPages,
}: {
  task: Task;
  page: number;
  onPages: (pages: number) => void;
}) {
  const rows = task.statusHistory;
  const pages = pageCount(rows.length, HISTORY_PAGE);
  useEffect(() => onPages(pages), [pages, onPages]);
  const [chosen, setChosen] = useState(0);
  const shown = pageOf(rows, page, HISTORY_PAGE);
  return (
    <Dropdown label='History' defaultOpen>
      {rows.length === 0 ? (
        <Text className='px-2 py-3 text-placeholder'>No Changes</Text>
      ) : (
        <div className='flex flex-col pt-2'>
          {shown.map((h, i) => {
            const at = page * HISTORY_PAGE + i;
            const on = at === chosen;
            return (
              <Button
                key={`${h.changedAt}-${at}`}
                type='button'
                variant='default'
                aria-pressed={on}
                onClick={() => setChosen(at)}
                className={cn(
                  'grid w-full cursor-pointer grid-cols-[minmax(0,1fr)_9rem] gap-2.5 text-left text-textBaseSize transition-colors duration-500 ease-soft',
                  on ? 'text-ink' : 'text-placeholder hover:text-labelDark',
                )}
              >
                <span
                  className={cn(
                    'flex min-h-10.5 min-w-0 items-center gap-2 border-b px-6',
                    on ? 'border-ink' : 'border-hairline',
                  )}
                >
                  <span className='truncate'>{changeLabel(h)}</span>
                  {h.changedBy && <span className='shrink-0 truncate'>{h.changedBy}</span>}
                </span>
                <span
                  className={cn(
                    'flex min-h-10.5 items-center justify-end border-b px-6 tabular-nums',
                    on ? 'border-ink' : 'border-hairline',
                  )}
                >
                  {h.changedAt ? format(new Date(h.changedAt), 'MMM d, yyyy') : <EmptyCell />}
                </span>
              </Button>
            );
          })}
        </div>
      )}
    </Dropdown>
  );
}

/**
 * COMMENTS — kept apart from History: they are people's words, not status moves. Each one: who,
 * when, the text (attachment links stay chips); the yellow note under them writes a new one
 * («Send» at its top right, Enter sends, Shift+Enter breaks the line). Deleting asks first, in
 * words that say whose words they are.
 */
export function CommentsFields({ task, media }: { task: Task; media: TaskMedia[] }) {
  const { account, isSuper } = usePermissions();
  const { data: comments = [], isLoading } = useTaskComments(task.id);
  const add = useAddComment(task.id);
  const del = useDeleteComment(task.id);
  const [body, setBody] = useState('');
  const [pendingDelete, setPendingDelete] = useState<TaskComment | null>(null);
  const pendingIsMine = !!pendingDelete && isOwnComment(pendingDelete, account?.username);
  const sorted = useMemo(() => comments, [comments]);

  async function submit() {
    const text = body.trim();
    if (!text || add.isPending) return;
    try {
      await add.mutateAsync(text);
      setBody('');
    } catch {
      /* snackbar shown by the mutation */
    }
  }

  return (
    <div className='flex flex-col gap-4'>
      {isLoading ? (
        <Text className='text-placeholder'>Loading</Text>
      ) : (
        sorted.length > 0 && (
          <div className='flex flex-col'>
            {sorted.map((c) => (
              <div
                key={c.id}
                className='flex flex-col gap-1 border-b border-hairline px-2 py-2.5 motion-safe:animate-[tasks-slide-in_700ms_var(--ease-soft)_both]'
              >
                <div className='flex items-baseline justify-between gap-3 text-textBaseSize'>
                  <span className='truncate text-ink'>{c.author}</span>
                  <span className='flex shrink-0 items-baseline gap-3 text-placeholder'>
                    {formatDistanceToNow(new Date(c.createdAt), { addSuffix: true })}
                    {canDeleteComment(c, account?.username, isSuper) && (
                      <Button
                        type='button'
                        variant='default'
                        aria-label={`delete comment ${c.id}`}
                        disabled={del.isPending}
                        onClick={() => setPendingDelete(c)}
                        className='cursor-pointer text-placeholder hover:text-ink'
                      >
                        Delete
                      </Button>
                    )}
                  </span>
                </div>
                <TaskText text={c.body} media={media} />
              </div>
            ))}
          </div>
        )
      )}
      <NoteBlock
        name='new-comment'
        value={body}
        onChange={(e) => setBody(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            void submit();
          }
        }}
        placeholder='Add a Comment...'
        aria-label='new comment'
        openLabel={add.isPending ? 'Sending' : 'Send'}
        onOpen={() => void submit()}
        blockClassName='min-h-24'
      />
      <ConfirmationModal
        open={!!pendingDelete}
        onOpenChange={(open) => !open && setPendingDelete(null)}
        onConfirm={() => {
          if (pendingDelete) del.mutate(pendingDelete.id);
          setPendingDelete(null);
        }}
        title={pendingIsMine ? 'delete comment' : 'delete someone else’s comment'}
        confirmLabel='delete'
        width='sm'
      >
        <Text size='micro' component='span'>
          {pendingIsMine
            ? 'Delete your comment? This can’t be undone.'
            : `Delete ${pendingDelete?.author || 'this'}’s comment? You are removing someone else’s words. This can’t be undone.`}
        </Text>
      </ConfirmationModal>
    </div>
  );
}
