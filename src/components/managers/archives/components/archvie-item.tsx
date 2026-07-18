import { common_ArchiveList } from 'api/proto-http/frontend';
import { ROUTES } from 'constants/routes';
import { useSnackBarStore } from 'lib/stores/store';
import { useState } from 'react';
import { generatePath, useNavigate } from 'react-router-dom';
import { Button } from 'ui/components/button';
import { ConfirmationModal } from 'ui/components/confirmation-modal';
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
  // A5: this used to be a generic native window.confirm — no entry name, no undo,
  // and inconsistent with the app's own ConfirmationModal used one screen away
  // (inside the editor).
  const [confirmOpen, setConfirmOpen] = useState(false);

  const entryName = archive.translations?.[0]?.heading || archive.tag || 'this entry';

  // Route-E: navigate to /timeline/{pretty}-{code}. `pretty` is a slug of the heading/tag; the tail
  // is the public code (or the internal id for rows not yet code-backfilled during the cutover).
  const buildHandle = () => {
    const pretty =
      (archive.translations?.[0]?.heading || archive.tag || 'archive')
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '') || 'archive';
    const tail = archive.code || (archive.id != null ? String(archive.id) : '');
    return `${pretty}-${tail}`;
  };

  const handleArchiveClick = () => {
    navigate(generatePath(ROUTES.singleArchive, { handle: buildHandle() }), { replace: true });
  };

  const handleDeleteArchive = async () => {
    try {
      await deleteArchiveMutation.mutateAsync(archive.id || 0);
      showMessage('Archive deleted successfully', 'success');
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Failed to delete archive';
      showMessage(msg, 'error');
    }
  };
  return (
    <div
      onClick={handleArchiveClick}
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
        onClick={(e: React.MouseEvent<HTMLButtonElement>) => {
          e.stopPropagation();
          setConfirmOpen(true);
        }}
        className='absolute right-1 top-1 z-20 cursor-pointer border border-textInactiveColor bg-bgColor px-1 leading-none opacity-0 transition-opacity group-hover:opacity-100'
        disabled={deleteArchiveMutation.isPending}
      >
        [x]
      </Button>
      {/* stopPropagation so a click inside the confirmation dialog doesn't bubble
          up to the card's own onClick and navigate away mid-confirm. */}
      <div onClick={(e) => e.stopPropagation()}>
        <ConfirmationModal
          open={confirmOpen}
          onOpenChange={setConfirmOpen}
          onConfirm={handleDeleteArchive}
          title='delete timeline entry'
          confirmLabel='delete'
        >
          <Text>Delete &ldquo;{entryName}&rdquo;? This cannot be undone.</Text>
        </ConfirmationModal>
      </div>
    </div>
  );
}
