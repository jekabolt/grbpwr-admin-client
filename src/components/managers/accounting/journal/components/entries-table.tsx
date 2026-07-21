import { AcctJournalEntry } from 'api/proto-http/admin';
import { ROUTES } from 'constants/routes';
import { Link } from 'react-router-dom';
import Text from 'ui/components/text';
import { AmountCell } from '../../components/amount-cell';
import { CaveatBadge } from '../../components/caveat-badge';
import { Pill } from '../../components/kit';
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

// Picker table header cell — 10px bold uppercase in labelColor over hairline rules.
const TH = 'px-2 py-2 text-left text-[10px] font-bold uppercase tracking-wide text-labelColor';

// Journal list — the approved "Table" variant: date · description · source · total · flags ·
// (action), hairline rows, uppercase labelColor headers. The source cell leads with an auto/manual
// Pill (machine-written vs hand-posted) and keeps the specific sourceTypeLabel as muted text so
// nothing is lost; the entry id lives under the date. Whole row still opens the shared
// entry-detail modal; the "view" button is the keyboard path; only the order link stops
// propagation so it navigates instead.
export function EntriesTable({ entries, isLoading, onSelect }: Props) {
  return (
    <div className='w-full overflow-x-auto'>
      <table className='w-full min-w-max border-collapse border border-textInactiveColor'>
        <thead className='bg-bgColor'>
          <tr className='border-b border-textInactiveColor'>
            <th className={TH}>date</th>
            <th className={TH}>description</th>
            <th className={TH}>source</th>
            <th className={`${TH} text-right`}>total</th>
            <th className={TH}>flags</th>
            <th className={`${TH} text-right`}>
              <span className='sr-only'>open entry</span>
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
              const manualLike = entry.sourceType === 'manual' || entry.sourceType === 'reversal';
              return (
                <tr
                  key={entry.id}
                  onClick={() => onSelect(entry)}
                  className='cursor-pointer border-b border-textInactiveColor last:border-b-0 hover:bg-bgSecondary'
                >
                  <td className='whitespace-nowrap px-2 py-1.5 align-top'>
                    <div>{formatAcctDate(entry.occurredAt)}</div>
                    <div className='text-[10px] uppercase tabular-nums text-labelColor'>
                      #{entry.id}
                    </div>
                  </td>
                  <td className='px-2 py-1.5'>{entry.description}</td>
                  <td className='px-2 py-1.5'>
                    <div className='flex flex-wrap items-center gap-1.5'>
                      <Pill tone={manualLike ? 'warn' : 'ok'}>
                        {manualLike ? 'manual' : 'auto'}
                      </Pill>
                      <span className='text-[10px] uppercase tracking-wide text-labelColor'>
                        {sourceTypeLabel(entry.sourceType)}
                      </span>
                      {uuid ? (
                        <Link
                          to={`${ROUTES.orders}/${uuid}`}
                          onClick={(e) => e.stopPropagation()}
                          className='text-small text-labelColor underline underline-offset-2 hover:text-textColor'
                        >
                          {uuid}
                        </Link>
                      ) : entry.sourceKey ? (
                        <span className='text-small text-labelColor'>{entry.sourceKey}</span>
                      ) : null}
                    </div>
                  </td>
                  <AmountCell value={entry.total} className='px-2 py-1.5' />
                  <td className='px-2 py-1.5'>
                    <div className='flex items-center gap-2'>
                      {entry.hasCaveat ? <CaveatBadge text={entry.caveat} /> : null}
                      {entry.reversedBy ? (
                        <Pill tone='muted' className='line-through'>
                          reversed
                        </Pill>
                      ) : null}
                      {entry.reversalOf ? <Pill tone='muted'>reversal</Pill> : null}
                    </div>
                  </td>
                  <td className='px-2 py-1.5 text-right'>
                    <button
                      type='button'
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelect(entry);
                      }}
                      className='underline underline-offset-2 hover:opacity-70'
                    >
                      <Text size='small'>view</Text>
                    </button>
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
