import { ROUTES } from 'constants/routes';
import { useCallback, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from 'ui/components/button';
import Text from 'ui/components/text';
import { ListArchive } from './components/archive-list';

export function Archives() {
  const [count, setCount] = useState({ loaded: 0, hasMore: false });

  const handleCount = useCallback((loaded: number, hasMore: boolean) => {
    setCount((prev) =>
      prev.loaded === loaded && prev.hasMore === hasMore ? prev : { loaded, hasMore },
    );
  }, []);

  return (
    <div className='flex flex-col gap-6 pb-16'>
      <div className='-mx-2.5 flex flex-wrap items-center justify-between gap-3 border-b border-textColor bg-bgColor px-2.5 py-3'>
        <div className='flex items-baseline gap-2'>
          <Text variant='uppercase' size='large'>
            timeline
          </Text>
          {count.loaded > 0 && (
            <Text variant='inactive'>
              {count.loaded}
              {count.hasMore ? '+' : ''}
            </Text>
          )}
        </div>
        <Button size='lg' variant='main' className='uppercase' asChild>
          <Link to={ROUTES.addArchive}>create new</Link>
        </Button>
      </div>

      <ListArchive onCountChange={handleCount} />
    </div>
  );
}
