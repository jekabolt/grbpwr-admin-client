import { useEffect } from 'react';
import { useInView } from 'react-intersection-observer';
import Text from 'ui/components/text';
import { ArchiveItem } from './archvie-item';
import { useInfiniteArchives } from './useArchiveQuery';

const LIMIT = 8;

interface ListArchiveProps {
  onCountChange?: (loaded: number, hasMore: boolean, total?: number) => void;
}

export function ListArchive({ onCountChange }: ListArchiveProps) {
  const { data, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useInfiniteArchives(LIMIT);
  const archives = data?.pages.flatMap((page) => page.archives) || [];
  // A11: the backend-reported total (same across pages); surfaced so the header
  // can show "N of TOTAL" instead of only an approximate "N+ loaded".
  const total = data?.pages[data.pages.length - 1]?.total;
  const { inView, ref } = useInView();

  useEffect(() => {
    if (inView && hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  }, [inView, hasNextPage, isFetchingNextPage, fetchNextPage]);

  useEffect(() => {
    onCountChange?.(archives.length, !!hasNextPage, total);
  }, [archives.length, hasNextPage, total, onCountChange]);

  if (isLoading) {
    return (
      <div className='flex justify-center py-20'>
        <Text variant='inactive' className='animate-pulse'>
          loading timeline…
        </Text>
      </div>
    );
  }

  if (archives.length === 0) {
    return (
      <div className='flex flex-col items-center gap-2 py-20'>
        <Text variant='uppercase'>no timeline entries</Text>
        <Text variant='inactive' size='small'>
          create one to get started
        </Text>
      </div>
    );
  }

  return (
    <div className='flex flex-col gap-4'>
      <div className='grid grid-cols-2 gap-4 lg:grid-cols-4 2xl:grid-cols-6'>
        {archives.map((archive) => (
          <ArchiveItem key={archive.code ?? archive.slug} archive={archive} />
        ))}
      </div>

      {hasNextPage && (
        <div ref={ref} className='flex justify-center py-4'>
          {isFetchingNextPage && (
            <Text variant='inactive' className='animate-pulse'>
              loading more…
            </Text>
          )}
        </div>
      )}
    </div>
  );
}
