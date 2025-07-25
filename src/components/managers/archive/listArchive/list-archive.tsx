import { common_ArchiveList } from 'api/proto-http/frontend';

import { useEffect, useState } from 'react';
import { useInView } from 'react-intersection-observer';
import Media from 'ui/components/media';
import Text from 'ui/components/text';
import { useInfiniteArchives } from '../utility/useArchive';
import { ArchiveItem } from './archive-item';

const LIMIT = 8;

export function ListArchive() {
  const [selectedArchive, setSelectedArchive] = useState<common_ArchiveList | undefined>();
  const { data, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useInfiniteArchives(LIMIT);
  const archives = data?.pages.flatMap((page) => page.archives) || [];
  const { inView, ref } = useInView();

  useEffect(() => {
    if (inView && hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  }, [inView, hasNextPage, isFetchingNextPage, fetchNextPage]);

  const handleArchiveSelect = (archive: common_ArchiveList) => {
    setSelectedArchive(archive);
  };

  const handleCloseArchive = () => {
    setSelectedArchive(undefined);
  };

  if (isLoading) {
    return (
      <div className='flex justify-center items-center h-64'>
        <div>Loading archives...</div>
      </div>
    );
  }

  return (
    <div className='h-screen border border-blue-500'>
      <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4'>
        {archives.map((archive) => (
          <div
            key={archive.id}
            onClick={() => handleArchiveSelect(archive)}
            className='cursor-pointer overflow-hidden border border-text'
          >
            {archive.thumbnail?.media?.fullSize?.mediaUrl && (
              <div className='w-full'>
                <Media
                  src={archive.thumbnail.media.fullSize.mediaUrl}
                  alt={archive.heading || 'Archive'}
                  className='w-full h-full'
                />
              </div>
            )}
            <div className='px-2'>
              <Text className='uppercase'>{archive.heading}</Text>
              <Text className='line-clamp-1 '>{archive.description}</Text>
              <Text className='uppercase'>{archive.tag}</Text>
            </div>
          </div>
        ))}
      </div>

      {hasNextPage && (
        <div ref={ref} className='flex justify-center p-4'>
          {isFetchingNextPage && <div>Loading more archives...</div>}
        </div>
      )}

      <ArchiveItem archiveData={selectedArchive} close={handleCloseArchive} />
    </div>
  );
}
