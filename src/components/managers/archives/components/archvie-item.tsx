import { common_ArchiveList } from 'api/proto-http/frontend';
import { useSnackBarStore } from 'lib/stores/store';
import { useNavigate } from 'react-router-dom';
import { Button } from 'ui/components/button';
import Media from 'ui/components/media';
import Text from 'ui/components/text';
import { useDeleteArchive } from './useArchiveQuery';

interface ArchiveItemProps {
  archive: common_ArchiveList;
}

export function ArchiveItem({ archive }: ArchiveItemProps) {
  const navigate = useNavigate();
  const deleteArchiveMutation = useDeleteArchive();
  const { showMessage } = useSnackBarStore();

  const handleArchiveClick = (slug: string) => {
    navigate(slug, { replace: true });
  };

  const handleDeleteArchive = async (e: React.MouseEvent, archiveId: number) => {
    e.stopPropagation();
    if (!window.confirm('Are you sure you want to delete this archive?')) return;

    try {
      await deleteArchiveMutation.mutateAsync(archiveId);
      showMessage('Archive deleted successfully', 'success');
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Failed to delete archive';
      showMessage(msg, 'error');
    }
  };
  return (
    <div
      onClick={() => handleArchiveClick(archive.slug || '')}
      className='group relative flex cursor-pointer flex-col overflow-hidden border border-textInactiveColor transition-colors hover:bg-highlightColor/5'
    >
      <div className='aspect-[4/5] w-full overflow-hidden border-b border-textInactiveColor bg-bgColor'>
        {archive.thumbnail?.media?.fullSize?.mediaUrl && (
          <Media
            src={archive.thumbnail.media.fullSize.mediaUrl}
            alt={archive.translations?.[0]?.heading || 'Archive'}
            aspectRatio='auto'
            fit='cover'
          />
        )}
      </div>
      <div className='flex flex-col gap-1 p-2'>
        <Text variant='uppercase' className='line-clamp-1'>
          {archive.translations?.[0]?.heading}
        </Text>
        {archive.tag && (
          <span className='mt-1 inline-block w-fit border border-textInactiveColor px-1.5 py-0.5'>
            <Text size='small' variant='uppercase'>
              {archive.tag}
            </Text>
          </span>
        )}
      </div>
      <Button
        onClick={(e: React.MouseEvent<HTMLButtonElement>) =>
          handleDeleteArchive(e, archive.id || 0)
        }
        className='absolute right-1 top-1 z-20 cursor-pointer border border-textInactiveColor bg-bgColor px-1 leading-none opacity-0 transition-opacity group-hover:opacity-100'
        disabled={deleteArchiveMutation.isPending}
      >
        [x]
      </Button>
    </div>
  );
}
