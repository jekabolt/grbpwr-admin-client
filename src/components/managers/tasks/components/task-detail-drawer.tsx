import * as Dialog from '@radix-ui/react-dialog';
import { format } from 'date-fns';
import { cn } from 'lib/utility';
import { Link } from 'react-router-dom';
import { Button } from 'ui/components/button';
import Text from 'ui/components/text';
import { Task } from '../api/types';
import { BOARD_LABEL, dueMeta, PRIORITY_LABEL, STATUS_LABEL } from '../utils/meta';
import { taskLinks } from '../utils/links';
import { TaskComments } from './task-comments';

function MetaRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className='flex items-start justify-between gap-3 py-1'>
      <Text variant='label' size='small' component='span'>
        {label}
      </Text>
      <span className='text-right text-textBaseSize'>{children}</span>
    </div>
  );
}

export function TaskDetailDrawer({
  task,
  open,
  onOpenChange,
  onEdit,
  onDelete,
  canWrite,
}: {
  task: Task | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onEdit: (task: Task) => void;
  onDelete: (task: Task) => void;
  canWrite: boolean;
}) {
  const t = task?.task;
  const due = t ? dueMeta(t.dueDate) : { label: '', state: 'none' as const };
  const links = t ? taskLinks(t) : [];

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className='fixed inset-0 z-40 bg-overlay' />
        <Dialog.Content
          className='fixed inset-y-0 right-0 z-50 flex w-full flex-col bg-bgColor text-textColor shadow-[-4px_0_0_0_var(--text)] sm:w-[28rem]'
          aria-describedby={undefined}
        >
          {task && t ? (
            <>
              {/* Header */}
              <div className='flex items-start justify-between gap-2 border-b border-textColor p-3'>
                <Dialog.Title className='text-lg leading-tight'>{t.title}</Dialog.Title>
                <Dialog.Close asChild>
                  <Button type='button' className='shrink-0'>
                    [x]
                  </Button>
                </Dialog.Close>
              </div>

              {/* Body */}
              <div className='flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-3'>
                <div className='flex flex-col divide-y divide-textInactiveColor'>
                  <MetaRow label='board'>{BOARD_LABEL[t.board]}</MetaRow>
                  <MetaRow label='column'>{STATUS_LABEL[t.status]}</MetaRow>
                  <MetaRow label='priority'>{PRIORITY_LABEL[t.priority]}</MetaRow>
                  <MetaRow label='assignee'>{t.assignee || '—'}</MetaRow>
                  <MetaRow label='due'>
                    <span className={cn(due.state === 'overdue' && 'text-error')}>
                      {t.dueDate ? format(new Date(t.dueDate), 'PPP') : '—'}
                    </span>
                  </MetaRow>
                  <MetaRow label='created'>
                    {task.createdBy ? `${task.createdBy} · ` : ''}
                    {format(new Date(task.createdAt), 'PP')}
                  </MetaRow>
                </div>

                {t.description && (
                  <div className='flex flex-col gap-1'>
                    <Text variant='uppercase' size='small'>
                      description
                    </Text>
                    <Text size='small' className='whitespace-pre-wrap break-words'>
                      {t.description}
                    </Text>
                  </div>
                )}

                {t.labels.length > 0 && (
                  <div className='flex flex-wrap gap-1'>
                    {t.labels.map((l) => (
                      <span
                        key={l}
                        className='border border-textInactiveColor px-1.5 py-px text-[10px] uppercase text-labelColor'
                      >
                        {l}
                      </span>
                    ))}
                  </div>
                )}

                {links.length > 0 && (
                  <div className='flex flex-col gap-1'>
                    <Text variant='uppercase' size='small'>
                      links
                    </Text>
                    <div className='flex flex-wrap gap-2'>
                      {links.map((l) => (
                        <Link
                          key={`${l.kind}-${l.to}`}
                          to={l.to}
                          onClick={() => onOpenChange(false)}
                          className='border border-textColor px-2 py-0.5 text-textBaseSize lowercase hover:bg-textColor hover:text-bgColor'
                        >
                          {l.label}
                        </Link>
                      ))}
                    </div>
                  </div>
                )}

                {task.media.length > 0 && (
                  <div className='flex flex-wrap gap-2'>
                    {task.media.map((m) => (
                      <img
                        key={m.id}
                        src={m.thumbnail}
                        alt=''
                        className='h-16 w-16 border border-textInactiveColor object-cover'
                      />
                    ))}
                  </div>
                )}

                <div className='border-t border-textColor pt-3'>
                  <TaskComments taskId={task.id} />
                </div>
              </div>

              {/* Footer */}
              {canWrite && (
                <div className='flex justify-between gap-2 border-t border-textColor p-3'>
                  <Button
                    type='button'
                    variant='underline'
                    className='text-error'
                    onClick={() => onDelete(task)}
                  >
                    delete
                  </Button>
                  <Button type='button' variant='main' size='lg' onClick={() => onEdit(task)}>
                    edit
                  </Button>
                </div>
              )}
            </>
          ) : (
            <Dialog.Title className='sr-only'>Task</Dialog.Title>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
