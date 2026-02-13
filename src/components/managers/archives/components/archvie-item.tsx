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
        <Text variant='uppercase'>{archive.translations?.[0]?.heading}</Text>
        <Text className='line-clamp-1 '>{archive.translations?.[0]?.description}</Text>
        <Text variant='uppercase'>{archive.tag}</Text>
      </div>
      <Button
        onClick={(e: React.MouseEvent<HTMLButtonElement>) =>
          handleDeleteArchive(e, archive.id || 0)
        }
        className='absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity text-bgColor mix-blend-exclusion cursor-pointer'
        disabled={deleteArchiveMutation.isPending}
      >
        [x]
      </Button>
    </div>
  );
}
