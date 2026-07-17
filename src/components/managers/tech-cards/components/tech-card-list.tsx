import { common_TechCardStage } from 'api/proto-http/admin';
import { usePermissions } from 'components/managers/accounts/utils/permissions';
import { techCardStageOptions } from 'constants/filter';
import { SECTION } from 'constants/routes';
import { useSnackBarStore } from 'lib/stores/store';
import { useEffect, useState } from 'react';
import { useInView } from 'react-intersection-observer';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Button } from 'ui/components/button';
import { ConfirmationModal } from 'ui/components/confirmation-modal';
import Input from 'ui/components/input';
import Select from 'ui/components/select';
import Text from 'ui/components/text';
import { AuxBadge } from './aux-badge';
import { approvalStateLabel, formatTechCardDate, stageLabel } from './utils';
import { useDeleteTechCard, useInfiniteTechCards } from './useTechCardQuery';

const LIMIT = 30;
const ALL_STAGES = 'TECH_CARD_STAGE_UNKNOWN';

const stageFilterItems = [{ value: ALL_STAGES, label: 'all stages' }, ...techCardStageOptions];

const GENDER_LABEL: Record<string, string> = {
  GENDER_ENUM_MALE: 'men',
  GENDER_ENUM_FEMALE: 'women',
  GENDER_ENUM_UNISEX: 'unisex',
};
function genderLabel(g?: string): string {
  return (g && GENDER_LABEL[g]) || '—';
}

const COLUMNS = [
  'style #',
  'name',
  'brand',
  'season',
  'stage',
  'approval',
  'gender',
  'updated',
  '',
];

export function TechCardList() {
  const navigate = useNavigate();
  const { showMessage } = useSnackBarStore();
  const deleteTechCard = useDeleteTechCard();
  const canEdit = usePermissions().canWrite(SECTION.techCards);

  // The stage filter lives in the URL (R-1): the board's "see all" hand-off lands pre-filtered,
  // the Select writes back, and a reload/share reproduces the same view. Validated — a mangled
  // ?stage= must not be sent to the API (it would return nothing and read as an empty list).
  const [searchParams, setSearchParams] = useSearchParams();
  const [name, setName] = useState('');
  const stageParam = searchParams.get('stage');
  const stage: common_TechCardStage = techCardStageOptions.some((o) => o.value === stageParam)
    ? (stageParam as common_TechCardStage)
    : ALL_STAGES;
  const setStage = (next: string) =>
    setSearchParams(
      (prev) => {
        const p = new URLSearchParams(prev);
        if (next && next !== ALL_STAGES) p.set('stage', next);
        else p.delete('stage');
        return p;
      },
      { replace: true },
    );
  const { data, isLoading, isError, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useInfiniteTechCards(
      { name: name.trim() || undefined, stage: stage === ALL_STAGES ? undefined : stage },
      LIMIT,
    );
  const { ref, inView } = useInView({ rootMargin: '200px' });
  const [pendingDelete, setPendingDelete] = useState<{ id: number } | null>(null);

  useEffect(() => {
    if (inView && hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  }, [inView, hasNextPage, isFetchingNextPage, fetchNextPage]);

  const techCards = data?.pages.flatMap((page) => page.techCards) ?? [];
  const total = data?.pages[0]?.total ?? techCards.length;

  function confirmDelete() {
    if (!pendingDelete) return;
    deleteTechCard.mutate(pendingDelete.id, {
      onSuccess: () => showMessage('tech card deleted', 'success'),
      onError: (error) =>
        showMessage(error instanceof Error ? error.message : 'Failed to delete tech card', 'error'),
    });
    setPendingDelete(null);
  }

  return (
    <div className='flex flex-col gap-4'>
      <div className='flex flex-wrap items-end justify-between gap-3'>
        <div className='flex flex-wrap items-end gap-3'>
          <div className='w-56'>
            <Input
              name='name'
              value={name}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setName(e.target.value)}
              placeholder='search name / style number'
            />
          </div>
          <div className='w-44'>
            <Select
              name='stage'
              value={stage}
              items={stageFilterItems}
              onValueChange={(val: string) => setStage(val ?? ALL_STAGES)}
            />
          </div>
        </div>
        <Text variant='inactive' size='small'>
          {techCards.length} of {total}
        </Text>
      </div>

      {isLoading ? (
        <div className='flex justify-center py-20'>
          <Text variant='inactive' className='animate-pulse'>
            loading tech cards…
          </Text>
        </div>
      ) : isError ? (
        <div className='flex justify-center py-20'>
          <Text variant='inactive' className='uppercase'>
            failed to load tech cards — refresh to retry
          </Text>
        </div>
      ) : techCards.length === 0 ? (
        <div className='flex justify-center py-20'>
          <Text variant='inactive' className='uppercase'>
            no tech cards
          </Text>
        </div>
      ) : (
        <div className='overflow-x-auto border border-textInactiveColor'>
          <table className='w-full min-w-max border-collapse text-textBaseSize'>
            <thead>
              <tr className='border-b border-textInactiveColor bg-textInactiveColor/20'>
                {COLUMNS.map((h, i) => (
                  <th key={i} className='px-2 py-2 text-left'>
                    <Text variant='uppercase' size='small'>
                      {h}
                    </Text>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {techCards.map((tc) => {
                const id = tc.id ?? 0;
                return (
                  <tr
                    key={id}
                    role='button'
                    tabIndex={0}
                    onClick={() => navigate(`/tech-cards/${id}`)}
                    onKeyDown={(e) => e.key === 'Enter' && navigate(`/tech-cards/${id}`)}
                    className='cursor-pointer border-b border-textInactiveColor transition-colors last:border-b-0 hover:bg-highlightColor/5'
                  >
                    <td className='px-2 py-2'>
                      <Text variant='uppercase'>{tc.styleNumber || '—'}</Text>
                    </td>
                    <td className='px-2 py-2'>
                      <div className='flex items-center gap-2'>
                        <Text>{tc.name || '—'}</Text>
                        <AuxBadge purpose={tc.purpose} />
                      </div>
                    </td>
                    <td className='px-2 py-2'>
                      <Text variant='inactive'>{tc.brand || '—'}</Text>
                    </td>
                    <td className='px-2 py-2'>
                      <Text variant='inactive'>
                        {tc.skuSeason?.code
                          ? `${tc.skuSeason.code.replace('SEASON_ENUM_', '')}${
                              tc.skuSeason.year ? ` ${tc.skuSeason.year}` : ''
                            }`
                          : '—'}
                      </Text>
                    </td>
                    <td className='px-2 py-2'>
                      <Text variant='inactive'>{stageLabel(tc.stage)}</Text>
                    </td>
                    <td className='px-2 py-2'>
                      <Text variant='inactive'>{approvalStateLabel(tc.approvalState)}</Text>
                    </td>
                    <td className='px-2 py-2'>
                      <Text variant='inactive'>{genderLabel(tc.targetGender)}</Text>
                    </td>
                    <td className='whitespace-nowrap px-2 py-2'>
                      <Text variant='inactive' size='small'>
                        {formatTechCardDate(tc.updatedAt)}
                      </Text>
                    </td>
                    <td className='px-2 py-2'>
                      {canEdit && (
                        <Button
                          type='button'
                          aria-label='delete tech card'
                          onClick={(e: React.MouseEvent) => {
                            e.stopPropagation();
                            setPendingDelete({ id });
                          }}
                          className='border border-textInactiveColor bg-bgColor px-1.5 leading-none'
                        >
                          ✕
                        </Button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
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
        title='delete tech card'
        confirmLabel='delete'
        cancelLabel='cancel'
      >
        <Text>delete this tech card? all its sections cascade and this cannot be undone.</Text>
      </ConfirmationModal>
    </div>
  );
}
