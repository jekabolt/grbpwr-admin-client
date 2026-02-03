import { common_ArchiveList } from 'api/proto-http/frontend';

import { Cross1Icon } from '@radix-ui/react-icons';
import { useSnackBarStore } from 'lib/stores/store';
import { useEffect, useState } from 'react';
import { useInView } from 'react-intersection-observer';
import { useNavigate } from 'react-router-dom';
import { Button } from 'ui/components/button';
import Media from 'ui/components/media';
import Text from 'ui/components/text';
import { useDeleteArchive, useInfiniteArchives } from '../utility/useArchive';

const LIMIT = 8;

export function ListArchive() {
  const [selectedArchive, setSelectedArchive] = useState<common_ArchiveList | undefined>();
  const { data, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useInfiniteArchives(LIMIT);
  const archives = data?.pages.flatMap((page) => page.archives) || [];
  const { inView, ref } = useInView();
  const navigate = useNavigate();
  const deleteArchiveMutation = useDeleteArchive();
  const { showMessage } = useSnackBarStore();

  useEffect(() => {
    if (inView && hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  }, [inView, hasNextPage, isFetchingNextPage, fetchNextPage]);

  const handleCloseArchive = () => {
    setSelectedArchive(undefined);
  };

  const handleArchiveClick = (slug: string) => {
    navigate(slug, { replace: true });
  };

  const handleDeleteArchive = async (e: React.MouseEvent, archiveId: number) => {
    e.stopPropagation(); // Prevent navigation when clicking delete
    if (!window.confirm('Are you sure you want to delete this archive?')) return;

    try {
      await deleteArchiveMutation.mutateAsync(archiveId);
      showMessage('Archive deleted successfully', 'success');
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Failed to delete archive';
      showMessage(msg, 'error');
    }
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
            key={archive.slug}
            onClick={() => handleArchiveClick(archive.slug || '')}
            className='cursor-pointer overflow-hidden border border-text relative group'
          >
            {archive.thumbnail?.media?.fullSize?.mediaUrl && (
              <div className='w-full'>
                <Media
                  src={archive.thumbnail.media.fullSize.mediaUrl}
                  alt={archive.translations?.[0]?.heading || 'Archive'}
                  className='w-full h-full'
                />
              </div>
            )}
            <div className='px-2'>
              <Text className='uppercase'>{archive.translations?.[0]?.heading}</Text>
              <Text className='line-clamp-1 '>{archive.translations?.[0]?.description}</Text>
              <Text className='uppercase'>{archive.tag}</Text>
            </div>

            {/* Delete button - appears on hover */}
            <Button
              onClick={(e: React.MouseEvent<HTMLButtonElement>) =>
                handleDeleteArchive(e, archive.id || 0)
              }
              className='absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity bg-red-500 hover:bg-red-600 text-white p-1 rounded'
              disabled={deleteArchiveMutation.isPending}
            >
              <Cross1Icon className='w-4 h-4' />
            </Button>
          </div>
        ))}
      </div>

      {hasNextPage && (
        <div ref={ref} className='flex justify-center p-4'>
          {isFetchingNextPage && <div>Loading more archives...</div>}
        </div>
      )}

      {/* <ArchiveItem archiveData={selectedArchive} close={handleCloseArchive} /> */}
    </div>
  );
}
