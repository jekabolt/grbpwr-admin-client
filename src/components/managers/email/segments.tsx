// Email segments LIST page (/email-segments): a card grid of saved segments +
// "new segment". Each card shows name, description and the last known audience count;
// cards link into the editor (/email-segments/:id) and can be deleted inline. Models
// email/index.tsx (the campaigns list) for layout + states.

import { common_EmailSegment } from 'api/proto-http/admin';
import { usePermissions } from 'components/managers/accounts/utils/permissions';
import { ROUTES, SECTION } from 'constants/routes';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from 'ui/components/button';
import { ConfirmationModal } from 'ui/components/confirmation-modal';
import Text from 'ui/components/text';
import { useDeleteSegment, useSegments } from './components/useCampaign';

function formatCount(n: number | undefined): string | undefined {
  return typeof n === 'number' ? n.toLocaleString() : undefined;
}

function formatWhen(epochSeconds: number | undefined): string | undefined {
  if (!epochSeconds) return undefined;
  const d = new Date(epochSeconds * 1000);
  if (Number.isNaN(d.getTime())) return undefined;
  return d.toLocaleDateString();
}

function SegmentCard({
  segment,
  canEdit,
  onDelete,
}: {
  segment: common_EmailSegment;
  canEdit: boolean;
  onDelete: (s: common_EmailSegment) => void;
}) {
  const navigate = useNavigate();
  const count = formatCount(segment.lastCount);
  const when = formatWhen(segment.lastCountAt);

  return (
    <div className='flex flex-col justify-between gap-3 border border-textInactiveColor p-4 transition-colors hover:border-textColor'>
      <button
        type='button'
        onClick={() => navigate(`${ROUTES.emailSegments}/${segment.id}`)}
        className='flex flex-col items-start gap-2 text-left'
      >
        <Text variant='uppercase' className='break-words'>
          {segment.name || 'untitled segment'}
        </Text>
        {segment.description ? (
          <Text size='small' variant='label' className='line-clamp-3 break-words'>
            {segment.description}
          </Text>
        ) : (
          <Text size='small' variant='inactive'>
            no description
          </Text>
        )}
      </button>

      <div className='flex items-center justify-between gap-2 border-t border-textInactiveColor pt-2'>
        <Text size='small' variant='inactive'>
          {count != null ? `≈ ${count} recipients${when ? ` · ${when}` : ''}` : 'count not run yet'}
        </Text>
        <div className='flex items-center gap-2'>
          <Button
            type='button'
            variant='secondary'
            size='sm'
            className='px-2 py-1 uppercase'
            onClick={() => navigate(`${ROUTES.emailSegments}/${segment.id}`)}
          >
            edit
          </Button>
          {canEdit && (
            <Button
              type='button'
              variant='secondary'
              size='sm'
              className='px-2 py-1 uppercase'
              onClick={() => onDelete(segment)}
            >
              delete
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

export function EmailSegments() {
  const navigate = useNavigate();
  const { canWrite } = usePermissions();
  const canEdit = canWrite(SECTION.marketing);
  const { data: segments = [], isLoading, isError, refetch } = useSegments();
  const del = useDeleteSegment();
  const [pendingDelete, setPendingDelete] = useState<common_EmailSegment | null>(null);

  const confirmDelete = async () => {
    if (!pendingDelete?.id) return;
    try {
      await del.mutateAsync(pendingDelete.id);
    } catch {
      // toast via useDeleteSegment.onError
    } finally {
      setPendingDelete(null);
    }
  };

  return (
    <div className='flex flex-col gap-6'>
      <div className='flex flex-wrap items-center justify-between gap-3'>
        <Text variant='uppercase' size='large'>
          email segments
        </Text>
        {canEdit && (
          <Button
            type='button'
            variant='main'
            size='lg'
            className='uppercase'
            onClick={() => navigate(`${ROUTES.emailSegments}/new`)}
          >
            + new segment
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className='flex justify-center py-20'>
          <Text variant='inactive' className='animate-pulse'>
            loading segments…
          </Text>
        </div>
      ) : isError ? (
        <div className='flex flex-col items-center gap-3 py-20'>
          <Text variant='error'>couldn&apos;t load segments.</Text>
          <Button type='button' variant='secondary' size='lg' onClick={() => refetch()}>
            retry
          </Button>
        </div>
      ) : segments.length === 0 ? (
        <div className='flex flex-col items-center gap-3 py-20'>
          <Text variant='label'>no segments yet.</Text>
          {canEdit && (
            <Button
              type='button'
              variant='secondary'
              size='lg'
              className='uppercase'
              onClick={() => navigate(`${ROUTES.emailSegments}/new`)}
            >
              create your first segment
            </Button>
          )}
        </div>
      ) : (
        <div className='grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3'>
          {segments.map((s) => (
            <SegmentCard key={s.id} segment={s} canEdit={canEdit} onDelete={setPendingDelete} />
          ))}
        </div>
      )}

      <ConfirmationModal
        open={!!pendingDelete}
        onOpenChange={(o) => !o && setPendingDelete(null)}
        title='delete segment'
        confirmLabel='delete'
        onConfirm={confirmDelete}
      >
        <Text>
          delete “{pendingDelete?.name || 'this segment'}”? campaigns that reference it will fall
          back to no segment (everyone).
        </Text>
      </ConfirmationModal>
    </div>
  );
}

export default EmailSegments;
