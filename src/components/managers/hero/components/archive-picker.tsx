import { common_ArchiveList } from 'api/proto-http/frontend';
import { useArchives } from 'components/managers/archives/components/useArchiveQuery';
import { useEffect, useState } from 'react';
import { Button } from 'ui/components/button';
import { Dialog } from 'ui/components/dialog';
import MediaComponent from 'ui/components/media';
import Text from 'ui/components/text';

interface Props {
  open: boolean;
  onClose: () => void;
  onSave: (newSelectedArchive: common_ArchiveList[]) => void;
  selectedArchiveId: number;
}

export function ArchivePicker({ open, onClose, onSave, selectedArchiveId }: Props) {
  const [selectedArchive, setSelectedArchive] = useState<common_ArchiveList | undefined>(undefined);
  const [currentPage, setCurrentPage] = useState(0);
  const limit = 50;

  const { data: archives, isLoading, error, refetch } = useArchives(limit, currentPage * limit);

  useEffect(() => {
    if (open) {
      const initialSelection = archives?.find((archive) => archive.id === selectedArchiveId);
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

  if (error) {
    return (
      <Dialog open={open} onClose={onClose} title='select archive'>
        <div className='text-red-500 p-4'>
          Error loading archives: {error instanceof Error ? error.message : 'Unknown error'}
        </div>
      </Dialog>
    );
  }

  if (isLoading) {
    return (
      <Dialog open={open} onClose={onClose} title='select archive'>
        <div className='p-4 text-center'>
          <Text>Loading archives...</Text>
        </div>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onClose={onClose} title='select archive' isSaveButton save={handleSave}>
      <div className='overflow-x-auto'>
        <table className='w-full border-collapse border border-text'>
          <thead>
            <tr className='bg-bgColor border-b border-text'>
              {columnLabels.map((label) => (
                <th key={label} className='border border-text p-2 text-center'>
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
                    className='border-b border-text hover:bg-bgColor/50 text-center'
                  >
                    <td className='border border-text p-2'>
                      <input
                        type='checkbox'
                        checked={isSelected}
                        onChange={() => setSelectedArchive(isSelected ? undefined : archive)}
                        className='cursor-pointer'
                      />
                    </td>
                    <td className='border border-text p-2'>
                      <Text>{archive.id}</Text>
                    </td>
                    <td className='border border-text lg:w-16'>
                      {archive.thumbnail?.media?.thumbnail?.mediaUrl && (
                        <MediaComponent
                          src={archive.thumbnail.media.thumbnail.mediaUrl}
                          alt='Thumbnail'
                          type='image'
                          className='w-[100px] h-auto object-contain'
                        />
                      )}
                    </td>
                    <td className='border border-text p-2'>
                      <Text>{archive.tag || '-'}</Text>
                    </td>
                    <td className='border border-text p-2'>
                      <Text>{archive.translations?.[0]?.heading || '-'}</Text>
                    </td>
                  </tr>
                );
              })
            ) : (
              <tr>
                <td colSpan={columnLabels.length} className='border border-text p-8 text-center'>
                  <Text>No archives found</Text>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className='mt-4 flex justify-between items-center'>
        <Button
          type='button'
          variant='simple'
          onClick={() => setCurrentPage((prev) => Math.max(0, prev - 1))}
          disabled={currentPage === 0}
        >
          Previous
        </Button>
        <Text>Page {currentPage + 1}</Text>
        <Button
          type='button'
          variant='simple'
          onClick={() => setCurrentPage((prev) => prev + 1)}
          disabled={!archives || archives.length < limit}
        >
          Next
        </Button>
      </div>
    </Dialog>
  );
}
