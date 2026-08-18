import { usePermissions } from 'components/managers/accounts/utils/permissions';
import { sampleLabel } from 'components/managers/tech-card/components/sample-picker';
import { SECTION } from 'constants/routes';
import { useSnackBarStore } from 'lib/stores/store';
import { useEffect, useState } from 'react';
import { useInView } from 'react-intersection-observer';
import { useNavigate } from 'react-router-dom';
import { Button } from 'ui/components/button';
import { ConfirmationModal } from 'ui/components/confirmation-modal';
import { Pill } from 'ui/components/pill';
import { Placeholder } from 'ui/components/placeholder';
import Text from 'ui/components/text';
import { Tile, Tiles } from 'ui/components/tiles';
import { useDeleteFitting, useInfiniteFittings } from './useFittingQuery';
import { useModelsByIds, useSamplesByIds, useTechCardsByIds } from './useResolvers';
import { formatFittingDate, statusLabel } from './utils';

const LIMIT = 24;

export function FittingCardList() {
  const navigate = useNavigate();
  const { showMessage } = useSnackBarStore();
  const deleteFitting = useDeleteFitting();
  const canEdit = usePermissions().canWrite(SECTION.fittings);

  // A fitting tries a SAMPLE of a tech card — it is not anchored to a catalogue product, so this list
  // is no longer filtered/labelled by product (that "select product" made no sense here).
  const { data, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteFittings(
    {},
    LIMIT,
  );
  const { ref, inView } = useInView({ rootMargin: '200px' });
  const [pendingDelete, setPendingDelete] = useState<{ id: number } | null>(null);

  useEffect(() => {
    if (inView && hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  }, [inView, hasNextPage, isFetchingNextPage, fetchNextPage]);

  const fittings = data?.pages.flatMap((page) => page.fittings) ?? [];
  const total = data?.pages[0]?.total ?? fittings.length;

  const modelMap = useModelsByIds(fittings.map((f) => f.fitting?.modelId ?? 0));
  const modelName = (id?: number) => (id ? modelMap.get(id)?.model?.name || `#${id}` : '—');

  // Resolve the raw tech_card_id/sample_id every card otherwise showed verbatim (M10) into the
  // same style/sample labels used elsewhere (tech-card-field.tsx, sample-picker.tsx).
  const techCardMap = useTechCardsByIds(fittings.map((f) => f.fitting?.techCardId ?? 0));
  const sampleMap = useSamplesByIds(fittings.map((f) => f.fitting?.sampleId ?? 0));
  const techCardLabel = (id?: number) => {
    if (!id) return null;
    const tc = techCardMap.get(id)?.techCard;
    const parts = [tc?.styleNumber, tc?.name].filter(Boolean);
    return parts.length ? parts.join(' · ') : `tech card #${id}`;
  };
  const sampleName = (id?: number) => {
    if (!id) return null;
    const s = sampleMap.get(id);
    return s ? sampleLabel(s) : `sample #${id}`;
  };

  function confirmDelete() {
    if (!pendingDelete) return;
    deleteFitting.mutate(pendingDelete.id, {
      onSuccess: () => showMessage('fitting deleted', 'success'),
      onError: (error) =>
        showMessage(error instanceof Error ? error.message : 'Failed to delete fitting', 'error'),
    });
    setPendingDelete(null);
  }

  return (
    <div className='flex flex-col gap-4'>
      <div className='flex flex-wrap items-center justify-between gap-3'>
        <Text variant='uppercase' size='small'>
          fittings
        </Text>
        <Text variant='inactive' size='small'>
          {fittings.length} of {total}
        </Text>
      </div>

      {isLoading ? (
        <div className='flex justify-center py-20'>
          <Text variant='inactive' className='animate-pulse'>
            loading fittings…
          </Text>
        </div>
      ) : fittings.length === 0 ? (
        <div className='flex justify-center py-20'>
          <Text variant='inactive' className='uppercase'>
            no fittings
          </Text>
        </div>
      ) : (
        // Same card as the tech-cards list: the Tile primitive, a pill row for state and one
        // grey meta line. The delete control is rendered OUTSIDE the Tile â the Tile itself is a
        // <button>, so nesting another button in it is invalid and was swallowing clicks.
        <Tiles min={160}>
          {fittings.map((fitting) => {
            const id = fitting.id ?? 0;
            const insert = fitting.fitting;
            const sample = sampleName(insert?.sampleId);
            const title =
              [techCardLabel(insert?.techCardId), sample].filter(Boolean).join(' · ') || '—';
            const photos = fitting.media?.length ?? 0;
            const openChanges = insert?.changeRequests?.filter((cr) => !cr.resolved).length ?? 0;
            const thumb = fitting.media?.[0]?.media?.thumbnail?.mediaUrl;
            // Only state earns a pill; everything descriptive goes to the meta line. With four
            // pills (and `outcome` being free text) the row wrapped to two or three lines, so a
            // card's height — and with it the thumbnail's position — moved with its content.
            const meta = [
              modelName(insert?.modelId),
              formatFittingDate(insert?.fittingDate),
              insert?.roundNumber ? `round ${insert.roundNumber}` : '',
              insert?.outcome ? insert.outcome.replace(/_/g, ' ') : '',
              photos ? `${photos} photo${photos > 1 ? 's' : ''}` : '',
            ]
              .filter(Boolean)
              .join(' · ');
            return (
              <div key={id} className='relative'>
                <Tile
                  media={
                    thumb ? (
                      <img
                        src={thumb}
                        alt=''
                        loading='lazy'
                        className='aspect-[3/4] w-full border border-borderColor object-cover'
                      />
                    ) : (
                      <Placeholder aspect='3/4' label='fitting' />
                    )
                  }
                  name={title}
                  onClick={() => navigate(`/fittings/${id}`)}
                  className='h-full w-full'
                >
                  <div className='mt-1 flex items-center gap-1 overflow-hidden'>
                    <Pill tone='mut'>{statusLabel(insert?.status)}</Pill>
                    {openChanges > 0 && <Pill tone='warn'>{openChanges} open</Pill>}
                  </div>
                  {meta && (
                    <Text size='nano' variant='label' className='mt-1 truncate uppercase'>
                      {meta}
                    </Text>
                  )}
                </Tile>
                {canEdit && (
                  <div className='absolute top-1 right-1'>
                    <Button
                      type='button'
                      size='xs'
                      variant='secondary'
                      aria-label='delete fitting'
                      className='bg-bgColor'
                      onClick={(e: React.MouseEvent) => {
                        e.stopPropagation();
                        setPendingDelete({ id });
                      }}
                    >
                      ✕
                    </Button>
                  </div>
                )}
              </div>
            );
          })}
        </Tiles>
      )}

      {hasNextPage && (
        <div ref={ref} className='flex justify-center py-4'>
          {isFetchingNextPage && <Text variant='inactive'>loading more…</Text>}
        </div>
      )}

      <ConfirmationModal
        open={!!pendingDelete}
        onOpenChange={(open) => !open && setPendingDelete(null)}
        onConfirm={confirmDelete}
        title='delete fitting'
        confirmLabel='delete'
        cancelLabel='cancel'
      >
        <Text>delete this fitting? this cannot be undone.</Text>
      </ConfirmationModal>
    </div>
  );
}
