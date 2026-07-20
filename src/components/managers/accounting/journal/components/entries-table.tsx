import { AcctJournalEntry } from 'api/proto-http/admin';
import { ROUTES } from 'constants/routes';
import { Link } from 'react-router-dom';
import Text from 'ui/components/text';
import { AmountCell } from '../../components/amount-cell';
import { CaveatBadge } from '../../components/caveat-badge';
import { formatAcctDate, sourceTypeLabel } from '../../utils/format';

type Props = {
  entries: AcctJournalEntry[];
  isLoading: boolean;
  onSelect: (entry: AcctJournalEntry) => void;
};

// order_sale keys are a bare order uuid, order_refund keys are "uuid:seq" — split on ':' recovers
// the uuid for the order deep-link in both cases (03 §3.2 / entry-detail-modal.tsx).
function orderUuid(entry: AcctJournalEntry): string | undefined {
  if (entry.sourceType !== 'order_sale' && entry.sourceType !== 'order_refund') return undefined;
  return entry.sourceKey?.split(':')[0];
}

// Journal list table (03 §3.2): date · id · description · source · total · flags. Whole row opens
// the shared entry-detail modal; only the order link stops propagation so it navigates instead.
export function EntriesTable({ entries, isLoading, onSelect }: Props) {
  return (
    <div className='w-full overflow-x-auto'>
      <table className='w-full min-w-max border-collapse border-2 border-textInactiveColor'>
        <thead className='h-10 bg-textInactiveColor'>
          <tr className='border-b border-textInactiveColor'>
            <th className='px-2 text-left'>
              <Text variant='uppercase'>date</Text>
            </th>
            <th className='px-2 text-left'>
              <Text variant='uppercase'>id</Text>
            </th>
            <th className='px-2 text-left'>
              <Text variant='uppercase'>description</Text>
            </th>
            <th className='px-2 text-left'>
              <Text variant='uppercase'>source</Text>
            </th>
            <th className='px-2 text-right'>
              <Text variant='uppercase'>total</Text>
            </th>
            <th className='px-2 text-left'>
              <Text variant='uppercase'>flags</Text>
            </th>
          </tr>
        </thead>
        <tbody>
          {entries.length === 0 ? (
            <tr>
              <td colSpan={6} className='py-8 text-center'>
                <Text variant='uppercase'>{isLoading ? 'loading…' : 'no entries'}</Text>
              </td>
            </tr>
          ) : (
            entries.map((entry) => {
              const uuid = orderUuid(entry);
              return (
                <tr
                  key={entry.id}
                  onClick={() => onSelect(entry)}
                  className='h-10 cursor-pointer border-b border-textInactiveColor last:border-b-0 hover:bg-highlightColor/20'
                >
                  <td className='whitespace-nowrap px-2'>{formatAcctDate(entry.occurredAt)}</td>
                  <td className='whitespace-nowrap px-2 tabular-nums'>#{entry.id}</td>
                  <td className='px-2'>{entry.description}</td>
                  <td className='px-2'>
                    <div className='flex flex-wrap items-center gap-1.5'>
                      <Text size='small'>{sourceTypeLabel(entry.sourceType)}</Text>
                      {uuid ? (
                        <Link
                          to={`${ROUTES.orders}/${uuid}`}
                          onClick={(e) => e.stopPropagation()}
                          className='text-small text-textInactiveColor underline underline-offset-2 hover:text-textColor'
                        >
                          {uuid}
                        </Link>
                      ) : entry.sourceKey ? (
                        <Text size='small' variant='inactive'>
                          {entry.sourceKey}
                        </Text>
                      ) : null}
                    </div>
                  </td>
                  <AmountCell value={entry.total} className='px-2' />
                  <td className='px-2'>
                    <div className='flex items-center gap-2'>
                      {entry.hasCaveat ? <CaveatBadge text={entry.caveat} /> : null}
                      {entry.reversedBy ? (
                        <span className='whitespace-nowrap text-small uppercase text-textInactiveColor line-through'>
                          rev
                        </span>
                      ) : null}
                      {entry.reversalOf ? (
                        <span className='whitespace-nowrap text-small uppercase text-textInactiveColor'>
                          reversal
                        </span>
                      ) : null}
                    </div>
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}
