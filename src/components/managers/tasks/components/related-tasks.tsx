import { Link } from 'react-router-dom';
import { cn } from 'lib/utility';
import { Button } from 'ui/components/button';
import { Pill } from 'ui/components/pill';
import GenericPopover from 'ui/components/popover';
import Text from 'ui/components/text';
import { ListTasksFilter, TaskStatus } from '../api/types';
import { useTasks } from '../hooks/useTasks';
import { STATUS_LABEL } from '../utils/meta';

/**
 * tskEmbed v3 — the reverse link is a BADGE + POPOVER, not a bordered panel. A quiet
 * `tasks · n` badge sits inline on the host entity; opening it lists the linked cards
 * with a deep link each and a way onto the board.
 *
 * ListTasks now filters server-side by every typed task attachment — tech_card_id,
 * product_id, order_uuid, archive_id, fitting_id, production_run_id, sample_id — so
 * this embed accepts any one of them and each path is a clean server-side filter with
 * no client fallback. The entity kind → id field mapping mirrors entity-configs.ts.
 */

const statusTone: Record<TaskStatus, 'ok' | 'attention' | 'mut'> = {
  TASK_STATUS_UNKNOWN: 'mut',
  TASK_STATUS_BACKLOG: 'mut',
  TASK_STATUS_TODO: 'mut',
  TASK_STATUS_IN_PROGRESS: 'attention',
  TASK_STATUS_REVIEW: 'attention',
  TASK_STATUS_DONE: 'ok',
};

export function RelatedTasks({
  techCardId,
  productId,
  orderUuid,
  archiveId,
  fittingId,
  productionRunId,
  sampleId,
  className,
}: {
  techCardId?: number;
  productId?: number;
  orderUuid?: string;
  archiveId?: number;
  fittingId?: number;
  productionRunId?: number;
  sampleId?: number;
  className?: string;
}) {
  // One embed per host entity — pick the first id present and hand the backend exactly
  // that reverse-link filter (entity kind → id field, per entity-configs.ts).
  const filter: ListTasksFilter = techCardId
    ? { techCardId }
    : productId
      ? { productId }
      : orderUuid
        ? { orderUuid }
        : archiveId
          ? { archiveId }
          : fittingId
            ? { fittingId }
            : productionRunId
              ? { productionRunId }
              : sampleId
                ? { sampleId }
                : {};
  const enabled = !!(
    techCardId ||
    productId ||
    orderUuid ||
    archiveId ||
    fittingId ||
    productionRunId ||
    sampleId
  );
  const { data, isLoading } = useTasks(filter);
  const tasks = enabled ? (data?.tasks ?? []).filter((t) => !t.archivedAt) : [];

  if (!enabled) return null;

  return (
    <GenericPopover
      title='linked tasks'
      className={cn('w-[260px]', className)}
      triggerProps={{ 'aria-label': 'linked tasks' }}
      openElement={
        <Pill tone={tasks.length ? 'ink' : 'mut'} className='hover:bg-textColor hover:text-bgColor'>
          tasks · {isLoading ? '…' : tasks.length}
        </Pill>
      }
    >
      <div className='flex flex-col gap-2'>
        {isLoading ? (
          <Text size='micro' variant='label' component='span'>
            loading…
          </Text>
        ) : tasks.length === 0 ? (
          <Text size='micro' variant='label' component='span'>
            no tasks linked to this item yet
          </Text>
        ) : (
          <ul className='flex flex-col divide-y divide-borderColor'>
            {tasks.map((t) => (
              <li key={t.id}>
                <Link
                  to={`/tasks/${t.id}`}
                  className='flex items-center justify-between gap-2 py-1.5 hover:text-textColor'
                >
                  <Text size='micro' component='span' className='min-w-0 truncate'>
                    {t.task.title || 'untitled task'}
                  </Text>
                  <Pill tone={statusTone[t.status]}>{STATUS_LABEL[t.status]}</Pill>
                </Link>
              </li>
            ))}
          </ul>
        )}
        <Button asChild variant='underline' size='xs' className='self-start'>
          <Link to='/tasks'>open board</Link>
        </Button>
      </div>
    </GenericPopover>
  );
}
