import * as DialogPrimitives from '@radix-ui/react-dialog';
import { ROUTES } from 'constants/routes';
import { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Button } from 'ui/components/button';
import { Loader } from 'ui/components/loader';
import Text from 'ui/components/text';
import { formatAcctDate, sourceTypeLabel } from '../utils/format';
import { useJournalEntry } from '../utils/hooks';
import { AmountCell } from './amount-cell';
import { BalancedBadge } from './balanced-badge';

type Props = {
  entryId: number | null;
  onOpenChange: (open: boolean) => void;
  // Slot for entry-specific actions — Step 4 wires the `reverse` button in here from the
  // journal list; reports' drill-down (Step 5) opens this same component read-only, without
  // actions. Kept out of this shared component since the two callers gate `reverse`
  // differently (already-reversed / is-a-reversal checks live with the caller, not here).
  actions?: ReactNode;
};

// Read-only journal-entry detail, shared by the journal list (click a row) and reports
// (drill-down from a ledger/TB row) — 02.4, 03 §"Деталка". The ledger is append-only: this
// component never edits a line, only displays what's already posted.
export function EntryDetailModal({ entryId, onOpenChange, actions }: Props) {
  const open = entryId !== null;
  const { data, isLoading, isError } = useJournalEntry(entryId, open);
  const entry = data?.entry;

  // order_sale's source_key is the bare order uuid; order_refund's is "uuid:seq" (backend
  // internal/accounting/{ordersale,refund}.go) — splitting on ':' recovers the uuid in both
  // cases (a no-op split when there's no colon).
  const orderUuid =
    entry?.sourceType === 'order_sale' || entry?.sourceType === 'order_refund'
      ? entry.sourceKey?.split(':')[0]
      : undefined;

  return (
    <DialogPrimitives.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitives.Portal container={document.body}>
        <DialogPrimitives.Overlay className='fixed inset-0 z-[var(--z-modal)] h-screen bg-overlay' />
        <DialogPrimitives.Content className='fixed inset-x-2.5 top-1/2 z-[var(--z-modal)] flex max-h-[90vh] w-auto -translate-y-1/2 flex-col overflow-y-auto border border-textInactiveColor bg-bgColor text-textColor lg:inset-x-auto lg:left-1/2 lg:w-[640px] lg:-translate-x-1/2'>
          <div className='sticky top-0 z-10 flex items-center justify-between gap-2 border-b border-textInactiveColor bg-bgColor px-4 py-3'>
            <DialogPrimitives.Title className='text-lg uppercase'>
              journal entry{entryId ? ` #${entryId}` : ''}
            </DialogPrimitives.Title>
            <DialogPrimitives.Close asChild>
              <Button type='button' className='shrink-0 cursor-pointer'>
                [x]
              </Button>
            </DialogPrimitives.Close>
          </div>
          <DialogPrimitives.Description className='sr-only'>
            Journal entry detail
          </DialogPrimitives.Description>

          <div className='flex min-h-32 flex-col gap-4 p-4'>
            {isLoading ? (
              <Loader />
            ) : isError || !entry ? (
              <Text variant='error'>failed to load entry</Text>
            ) : (
              <>
                <div className='flex flex-col gap-1'>
                  <div className='flex flex-wrap items-center justify-between gap-2'>
                    <Text size='small' variant='inactive'>
                      {formatAcctDate(entry.occurredAt)}
                    </Text>
                    <Text size='small' variant='inactive'>
                      created by {entry.createdBy || '—'}
                    </Text>
                  </div>
                  <Text>{entry.description}</Text>
                  <div className='flex flex-wrap items-center gap-2'>
                    <Text size='small' variant='inactive'>
                      {sourceTypeLabel(entry.sourceType)}
                    </Text>
                    {orderUuid ? (
                      <Link to={`${ROUTES.orders}/${orderUuid}`} className='text-small underline'>
                        {orderUuid}
                      </Link>
                    ) : entry.sourceKey ? (
                      <Text size='small' variant='inactive'>
                        {entry.sourceKey}
                      </Text>
                    ) : null}
                    {entry.reversalOf ? (
                      <Text size='small' variant='inactive'>
                        reversal of #{entry.reversalOf}
                      </Text>
                    ) : null}
                    {entry.reversedBy ? (
                      <Text size='small' variant='inactive'>
                        reversed by #{entry.reversedBy}
                      </Text>
                    ) : null}
                  </div>
                  {entry.hasCaveat && entry.caveat ? (
                    <Text size='small' className='text-error'>
                      {entry.caveat}
                    </Text>
                  ) : null}
                </div>

                <div className='overflow-x-auto'>
                  <table className='w-full min-w-max border-collapse border-2 border-textInactiveColor'>
                    <thead className='h-10 bg-textInactiveColor'>
                      <tr className='border-b border-textInactiveColor'>
                        <th className='px-2 text-left text-textBaseSize uppercase'>account</th>
                        <th className='px-2 text-right text-textBaseSize uppercase'>debit</th>
                        <th className='px-2 text-right text-textBaseSize uppercase'>credit</th>
                        <th className='px-2 text-left text-textBaseSize uppercase'>note</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(entry.lines ?? []).map((line, idx) => (
                        <tr key={line.id ?? idx} className='border-b border-textInactiveColor'>
                          <td className='px-2 py-1'>
                            {line.accountCode} — {line.accountName}
                          </td>
                          <AmountCell value={line.side === 'debit' ? line.amount : undefined} />
                          <AmountCell value={line.side === 'credit' ? line.amount : undefined} />
                          <td className='px-2 py-1 text-small text-labelColor'>{line.note}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr>
                        <td className='px-2 py-1' />
                        <AmountCell value={entry.total} bold />
                        <AmountCell value={entry.total} bold />
                        <td className='px-2 py-1' />
                      </tr>
                    </tfoot>
                  </table>
                </div>

                <div className='flex items-center justify-between gap-2'>
                  {/* The store enforces Σdebit==Σcredit at write time (ErrAcctUnbalanced) — a
                      persisted entry is always balanced. Reusing the shared badge here keeps
                      the trust signal visually consistent with TB/BS instead of a bespoke
                      label. */}
                  <BalancedBadge balanced={true} />
                  {actions ? <div className='flex items-center gap-2'>{actions}</div> : null}
                </div>
              </>
            )}
          </div>
        </DialogPrimitives.Content>
      </DialogPrimitives.Portal>
    </DialogPrimitives.Root>
  );
}
