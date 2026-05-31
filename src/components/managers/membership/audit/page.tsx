import { ROUTES } from 'constants/routes';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ConfirmationModal } from 'ui/components/confirmation-modal';
import { Button } from 'ui/components/button';
import Input from 'ui/components/input';
import Text from 'ui/components/text';
import { formatDateShort } from '../../orders-catalog/components/utility';
import { AuditFilters, useRunTierBackfill, useTierAuditLog } from '../utils/hooks';
import { formatEur } from '../utils/tier-utils';

const PAGE_SIZE = 50;

export function TierAudit() {
  const [filters, setFilters] = useState<AuditFilters>({});
  const [debounced, setDebounced] = useState<AuditFilters>({});
  const [offset, setOffset] = useState(0);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebounced(filters);
      setOffset(0);
    }, 400);
    return () => clearTimeout(timer);
  }, [filters]);

  const { data, isLoading, isFetching } = useTierAuditLog(debounced, PAGE_SIZE, offset);
  const backfill = useRunTierBackfill();
  const [backfillOpen, setBackfillOpen] = useState(false);

  const entries = data?.entries ?? [];
  const total = data?.total ?? 0;
  const hasPrev = offset > 0;
  const hasNext = offset + PAGE_SIZE < total;

  const patch = (p: AuditFilters) => setFilters((prev) => ({ ...prev, ...p }));
  const toIso = (v: string) => (v ? new Date(v).toISOString() : undefined);

  return (
    <div className='flex flex-col w-full gap-4 pb-16'>
      <div className='flex items-center justify-between'>
        <Text variant='uppercase' size='large'>
          Tier audit log {total > 0 && `(${total})`}
        </Text>
        <div className='flex gap-2'>
          <Button variant='secondary' size='lg' onClick={() => setBackfillOpen(true)}>
            Run legacy backfill
          </Button>
          <Button variant='secondary' size='lg' asChild>
            <Link to={ROUTES.members}>Back to members</Link>
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className='flex flex-wrap gap-3 items-end'>
        <div className='flex flex-col gap-1'>
          <Text variant='inactive'>user id</Text>
          <Input
            name='userId'
            type='number'
            placeholder='all'
            value={filters.userId ?? ''}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
              patch({ userId: e.target.value === '' ? undefined : Number(e.target.value) })
            }
            className='w-28'
          />
        </div>
        <div className='flex flex-col gap-1'>
          <Text variant='inactive'>actor</Text>
          <Input
            name='actor'
            type='text'
            placeholder='actor'
            value={filters.actor ?? ''}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => patch({ actor: e.target.value })}
            className='w-40'
          />
        </div>
        <div className='flex flex-col gap-1'>
          <Text variant='inactive'>trigger type</Text>
          <Input
            name='triggerType'
            type='text'
            placeholder='e.g. refund, cron, manual'
            value={filters.triggerType ?? ''}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
              patch({ triggerType: e.target.value })
            }
            className='w-48'
          />
        </div>
        <div className='flex flex-col gap-1'>
          <Text variant='inactive'>from</Text>
          <Input
            name='from'
            type='date'
            value={filters.from ? filters.from.slice(0, 10) : ''}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
              patch({ from: toIso(e.target.value) })
            }
            className='w-36'
          />
        </div>
        <div className='flex flex-col gap-1'>
          <Text variant='inactive'>to</Text>
          <Input
            name='to'
            type='date'
            value={filters.to ? filters.to.slice(0, 10) : ''}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => patch({ to: toIso(e.target.value) })}
            className='w-36'
          />
        </div>
        <button
          type='button'
          onClick={() => setFilters({})}
          className='underline underline-offset-2 hover:opacity-70 pb-1'
        >
          <Text variant='inactive'>reset</Text>
        </button>
      </div>

      {/* Table */}
      <div className='overflow-x-auto w-full'>
        <table className='w-full border-collapse border border-textColor min-w-max'>
          <thead className='bg-textInactiveColor h-9'>
            <tr>
              {['ID', 'Date', 'From', 'To', 'Trigger', 'Actor', 'Spend @ change', 'Reason'].map(
                (h) => (
                  <th key={h} className='border border-textColor px-2 h-9'>
                    <Text variant='uppercase' size='small'>
                      {h}
                    </Text>
                  </th>
                ),
              )}
            </tr>
          </thead>
          <tbody>
            {entries.length === 0 ? (
              <tr>
                <td colSpan={8} className='text-center py-6'>
                  <Text variant='inactive'>
                    {isLoading || isFetching ? 'loading…' : 'no audit entries'}
                  </Text>
                </td>
              </tr>
            ) : (
              entries.map((e) => (
                <tr key={e.id} className='border-b border-textColor last:border-b-0 h-9'>
                  <td className='border border-textColor text-center px-2'>
                    <Text size='small'>{e.id}</Text>
                  </td>
                  <td className='border border-textColor text-center px-2'>
                    <Text size='small'>{formatDateShort(e.createdAt, true)}</Text>
                  </td>
                  <td className='border border-textColor text-center px-2'>
                    <Text size='small'>{e.oldTier || '-'}</Text>
                  </td>
                  <td className='border border-textColor text-center px-2'>
                    <Text size='small'>{e.newTier || '-'}</Text>
                  </td>
                  <td className='border border-textColor text-center px-2'>
                    <Text size='small'>{e.triggerType || '-'}</Text>
                  </td>
                  <td className='border border-textColor text-center px-2'>
                    <Text size='small'>{e.actor || '-'}</Text>
                  </td>
                  <td className='border border-textColor text-center px-2'>
                    <Text size='small'>{formatEur(e.spendEurAtChange)}</Text>
                  </td>
                  <td className='border border-textColor text-center px-2'>
                    <Text size='small'>{e.reason || '-'}</Text>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {total > 0 && (
        <div className='flex items-center justify-between'>
          <Text variant='inactive'>
            {offset + 1}–{Math.min(offset + PAGE_SIZE, total)} of {total}
          </Text>
          <div className='flex gap-2'>
            <Button
              variant='secondary'
              size='lg'
              disabled={!hasPrev || isFetching}
              onClick={() => setOffset((o) => Math.max(0, o - PAGE_SIZE))}
            >
              Prev
            </Button>
            <Button
              variant='secondary'
              size='lg'
              disabled={!hasNext || isFetching}
              onClick={() => setOffset((o) => o + PAGE_SIZE)}
            >
              Next
            </Button>
          </div>
        </div>
      )}

      <ConfirmationModal
        open={backfillOpen}
        onOpenChange={setBackfillOpen}
        onConfirm={() => backfill.mutate({ confirm: true })}
      >
        <Text variant='uppercase'>Run legacy tier backfill</Text>
        <Text variant='inactive' className='mt-2'>
          One-time job: snapshots the last 12 months of orders and assigns tiers to legacy accounts.
          Run this once before the public loyalty launch.
        </Text>
      </ConfirmationModal>
    </div>
  );
}
