import { common_ArchiveList } from 'api/proto-http/frontend';
import { useInfiniteArchives } from 'components/managers/archives/components/useArchiveQuery';
import { useEffect, useMemo, useState } from 'react';
import { Button } from 'ui/components/button';
import MediaComponent from 'ui/components/media';
import Text from 'ui/components/text';
import { HeroModal } from './hero-modal';

interface Props {
  open: boolean;
  onClose: () => void;
  onSave: (newSelectedArchive: common_ArchiveList[]) => void;
  selectedArchiveId: number;
}

const limit = 50;

export function ArchivePicker({ open, onClose, onSave, selectedArchiveId }: Props) {
  const [selectedArchive, setSelectedArchive] = useState<common_ArchiveList | undefined>(undefined);

  const { data, isLoading, error, hasNextPage, isFetchingNextPage, fetchNextPage, refetch } =
    useInfiniteArchives(limit);

  const archives = useMemo(() => data?.pages.flatMap((p) => p.archives) ?? [], [data?.pages]);

  useEffect(() => {
    if (open) {
      const initialSelection = archives.find((archive) => archive.id === selectedArchiveId);
      setSelectedArchive(initialSelection);
      refetch();
    }
  }, [open, selectedArchiveId, archives, refetch]);

  function handleSave() {
    if (!selectedArchive) return;
    onSave([selectedArchive]);
    onClose();
  }

  const columnLabels = ['select', 'id', 'thumbnail', 'tag', 'heading'];

  const content = error ? (
    <div className='text-red-500 p-4'>
      Error loading archives: {error instanceof Error ? error.message : 'Unknown error'}
    </div>
  ) : isLoading ? (
    <div className='p-4 text-center'>
      <Text>Loading archives...</Text>
    </div>
  ) : (
    <div className='w-full'>
      <div className='overflow-auto w-full max-h-[min(70vh,500px)]'>
        <table className='w-full border-collapse border-2 border-textColor min-w-max'>
          <thead className='bg-textInactiveColor h-10'>
            <tr className='border-b border-textColor'>
              {columnLabels.map((label) => (
                <th
                  key={label}
                  className='sticky top-0 z-10 bg-textInactiveColor border border-r border-textColor p-2 text-center'
                >
                  <Text variant='uppercase'>{label}</Text>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {archives && archives.length > 0 ? (
              archives.map((archive) => {
                const isSelected = selectedArchive?.id === archive.id;
                return (
                  <tr
                    key={archive.id}
                    className='border-b border-textColor hover:bg-bgColor/50 text-center'
                  >
                    <td className='border border-textColor p-2'>
                      <input
                        type='checkbox'
                        checked={isSelected}
                        onChange={() => setSelectedArchive(isSelected ? undefined : archive)}
                        className='cursor-pointer'
                      />
                    </td>
                    <td className='border border-textColor p-2'>
                      <Text>{archive.id}</Text>
                    </td>
                    <td className='border border-textColor lg:w-16'>
                      {archive.thumbnail?.media?.thumbnail?.mediaUrl && (
                        <MediaComponent
                          src={archive.thumbnail.media.thumbnail.mediaUrl}
                          alt='Thumbnail'
                          type='image'
                          className='w-[100px] h-auto object-contain'
                        />
                      )}
                    </td>
                    <td className='border border-textColor p-2'>
                      <Text>{archive.tag || '-'}</Text>
                    </td>
                    <td className='border border-textColor p-2'>
                      <Text>{archive.translations?.[0]?.heading || '-'}</Text>
                    </td>
                  </tr>
                );
              })
            ) : (
              <tr>
                <td
                  colSpan={columnLabels.length}
                  className='border border-textColor p-8 text-center'
                >
                  <Text>No archives found</Text>
                </td>
              </tr>
            )}
          </tbody>
        </table>
        <div className='flex justify-center py-2'>
          <Button
            type='button'
            size='lg'
            variant='simple'
            className='uppercase'
            onClick={() => fetchNextPage()}
            disabled={!hasNextPage || isFetchingNextPage}
          >
            Load more
          </Button>
        </div>
      </div>
    </div>
  );

  return (
    <HeroModal
      open={open}
      onOpenChange={(isOpen) => !isOpen && onClose()}
      handleSave={error || isLoading ? () => {} : handleSave}
      title='select archive'
      trigger={null}
    >
      {content}
    </HeroModal>
  );
}
