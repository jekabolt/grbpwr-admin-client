import { usePermissions } from 'components/managers/accounts/utils/permissions';
import { ROUTES, SECTION } from 'constants/routes';
import { useCallback, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from 'ui/components/button';
import Text from 'ui/components/text';
import { ListArchive } from './components/archive-list';

export function Archives() {
  const { canWrite } = usePermissions();
  const [count, setCount] = useState<{ loaded: number; hasMore: boolean; total?: number }>({
    loaded: 0,
    hasMore: false,
  });

  const handleCount = useCallback((loaded: number, hasMore: boolean, total?: number) => {
    setCount((prev) =>
      prev.loaded === loaded && prev.hasMore === hasMore && prev.total === total
        ? prev
        : { loaded, hasMore, total },
    );
  }, []);

  return (
    <div className='flex flex-col gap-6 pb-16'>
      <div className='-mx-2.5 flex flex-wrap items-center justify-between gap-3 border-b border-textInactiveColor bg-bgColor px-2.5 py-3'>
        <div className='flex items-baseline gap-2'>
          <Text variant='uppercase' size='large'>
            timeline
          </Text>
          {count.loaded > 0 && (
            <Text variant='inactive'>
              {/* A11: show the real backend total once known, not just an
                  approximate "N+ loaded". */}
              {typeof count.total === 'number'
                ? `${count.loaded} of ${count.total}`
                : `${count.loaded}${count.hasMore ? '+' : ''}`}
            </Text>
          )}
        </div>
        {canWrite(SECTION.archive) && (
          <Button size='lg' variant='main' className='uppercase' asChild>
            <Link to={ROUTES.addArchive}>create new</Link>
          </Button>
        )}
      </div>

      <ListArchive onCountChange={handleCount} />
    </div>
  );
}
