import { useEffect } from 'react';
import { useInView } from 'react-intersection-observer';
import Text from 'ui/components/text';
import { ArchiveItem } from './archvie-item';
import { useInfiniteArchives } from './useArchiveQuery';

const LIMIT = 8;

export function ListArchive() {
  const { data, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useInfiniteArchives(LIMIT);
  const archives = data?.pages.flatMap((page) => page.archives) || [];
  const { inView, ref } = useInView();

  useEffect(() => {
    if (inView && hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  }, [inView, hasNextPage, isFetchingNextPage, fetchNextPage]);

  if (isLoading) {
    return (
      <div className='flex justify-center items-center h-64'>
        <Text>loading archives...</Text>
      </div>
    );
  }

  return (
    <div>
      <div className='grid grid-cols-2 grid-cols-4 2xl:grid-cols-6 gap-4'>
        {archives.map((archive) => (
          <ArchiveItem key={archive.id} archive={archive} />
        ))}
      </div>

      {hasNextPage && (
        <div ref={ref} className='flex justify-center p-4'>
          {isFetchingNextPage && <Text>loading more archives...</Text>}
        </div>
      )}
    </div>
  );
}
