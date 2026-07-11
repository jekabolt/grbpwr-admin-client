import { Link } from 'react-router-dom';
import { cn } from 'lib/utility';
import Text from 'ui/components/text';
import { ListTasksFilter } from '../api/types';
import { useTasks } from '../hooks/useTasks';
import { STATUS_LABEL } from '../utils/meta';

// Reverse link: the tasks linked to a given tech card / product, embeddable on
// that entity's detail screen. Uses the ListTasks tech_card_id / product_id
// filter. Read-only summary that links out to the board.
export function RelatedTasks({
  techCardId,
  productId,
  className,
}: {
  techCardId?: number;
  productId?: number;
  className?: string;
}) {
  const filter: ListTasksFilter = techCardId ? { techCardId } : productId ? { productId } : {};
  const enabled = !!(techCardId || productId);
  const { data, isLoading } = useTasks(filter);
  const tasks = enabled ? data?.tasks ?? [] : [];

  if (!enabled) return null;

  return (
    <section className={cn('flex flex-col gap-2 border border-textColor p-3', className)}>
      <div className='flex items-center justify-between gap-2'>
        <Text variant='uppercase' size='small'>
          related tasks{tasks.length ? ` · ${tasks.length}` : ''}
        </Text>
        <Link
          to='/tasks'
          className='text-textBaseSize lowercase text-labelColor underline hover:text-textColor'
        >
          open board
        </Link>
      </div>

      {isLoading ? (
        <Text variant='label' size='small'>
          loading…
        </Text>
      ) : tasks.length === 0 ? (
        <Text variant='label' size='small'>
          no tasks linked to this item yet
        </Text>
      ) : (
        <ul className='flex flex-col divide-y divide-textInactiveColor'>
          {tasks.map((t) => (
            <li key={t.id} className='flex items-center justify-between gap-2 py-1.5'>
              <span className='truncate text-textBaseSize'>{t.task.title}</span>
              <span className='shrink-0 text-[10px] uppercase text-labelColor'>
                {STATUS_LABEL[t.status]}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
