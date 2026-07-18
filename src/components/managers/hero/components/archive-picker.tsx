import { common_ArchiveList } from 'api/proto-http/frontend';
import { useInfiniteArchives } from 'components/managers/archives/components/useArchiveQuery';
import { ChangeEvent, useEffect, useMemo, useState } from 'react';
import { Button } from 'ui/components/button';
import Input from 'ui/components/input';
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
  // H7: was a flat, unsearchable "Load more"-only table.
  const [search, setSearch] = useState('');

  const { data, isLoading, error, hasNextPage, isFetchingNextPage, fetchNextPage, refetch } =
    useInfiniteArchives(limit);

  const archives = useMemo(() => data?.pages.flatMap((p) => p.archives) ?? [], [data?.pages]);
  const filteredArchives = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return archives;
    return archives.filter((a) => {
      const heading = (a.translations?.[0]?.heading || '').toLowerCase();
      const tag = (a.tag || '').toLowerCase();
      return heading.includes(q) || tag.includes(q) || String(a.id ?? '').includes(q);
    });
  }, [archives, search]);

  useEffect(() => {
    if (open) {
      const initialSelection = archives.find((archive) => archive.id === selectedArchiveId);
      setSelectedArchive(initialSelection);
      setSearch('');
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
    <div className='text-error p-4'>
      Error loading archives: {error instanceof Error ? error.message : 'Unknown error'}
    </div>
  ) : isLoading ? (
    <div className='p-4 text-center'>
      <Text>Loading archives...</Text>
    </div>
  ) : (
    <div className='w-full'>
      <div className='mb-2 flex justify-end'>
        <Input
          type='text'
          value={search}
          onChange={(e: ChangeEvent<HTMLInputElement>) => setSearch(e.target.value)}
          placeholder='search by heading, tag, or id…'
          className='w-full max-w-xs border px-2 py-1.5 lg:w-64'
        />
      </div>
      <div className='overflow-auto w-full max-h-[min(70vh,500px)]'>
        <table className='w-full border-collapse border-2 border-textInactiveColor min-w-max'>
          <thead className='bg-textInactiveColor h-10'>
            <tr className='border-b border-textInactiveColor'>
              {columnLabels.map((label) => (
                <th
                  key={label}
                  className='sticky top-0 z-10 bg-textInactiveColor border border-r border-textInactiveColor p-2 text-center'
                >
                  <Text variant='uppercase'>{label}</Text>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filteredArchives && filteredArchives.length > 0 ? (
              filteredArchives.map((archive) => {
                const isSelected = selectedArchive?.id === archive.id;
                return (
                  <tr
                    key={archive.id}
                    className='border-b border-textInactiveColor hover:bg-bgColor/50 text-center'
                  >
                    <td className='border border-textInactiveColor p-2'>
                      <input
                        type='checkbox'
                        checked={isSelected}
                        onChange={() => setSelectedArchive(isSelected ? undefined : archive)}
                        className='cursor-pointer'
                      />
                    </td>
                    <td className='border border-textInactiveColor p-2'>
                      <Text>{archive.id}</Text>
                    </td>
                    <td className='border border-textInactiveColor lg:w-16'>
                      {archive.thumbnail?.media?.thumbnail?.mediaUrl && (
                        <MediaComponent
                          src={archive.thumbnail.media.thumbnail.mediaUrl}
                          alt='Thumbnail'
                          type='image'
                          className='w-[100px] h-auto object-contain'
                        />
                      )}
                    </td>
                    <td className='border border-textInactiveColor p-2'>
                      <Text>{archive.tag || '-'}</Text>
                    </td>
                    <td className='border border-textInactiveColor p-2'>
                      <Text>{archive.translations?.[0]?.heading || '-'}</Text>
                    </td>
                  </tr>
                );
              })
            ) : (
              <tr>
                <td
                  colSpan={columnLabels.length}
                  className='border border-textInactiveColor p-8 text-center'
                >
                  <Text>
                    {archives.length === 0 ? 'No archives found' : 'No archives match your search'}
                  </Text>
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
