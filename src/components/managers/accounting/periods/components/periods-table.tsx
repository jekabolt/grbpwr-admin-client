import { AcctPeriod } from 'api/proto-http/admin';
import { format, parseISO } from 'date-fns';
import { cn } from 'lib/utility';
import { Button } from 'ui/components/button';
import Text from 'ui/components/text';
import Tooltip from 'ui/components/tooltip';
import { formatAcctDate } from '../../utils/format';

// AcctPeriod.period is a plain `YYYY-MM-DD` date (always the 1st of the month, no time/zone
// component — backend contract, 07-contract-reference.md §7.2). `new Date(str)` would parse a
// date-only ISO string as UTC midnight and then read it back with local getters, silently
// shifting it into the previous month for any timezone behind UTC — parseISO builds the Date
// from local midnight instead, so the label always lands on the right month.
export function formatPeriodLabel(period?: string): string {
  if (!period) return '—';
  const parsed = parseISO(period);
  if (Number.isNaN(parsed.getTime())) return period;
  return format(parsed, 'MMM yyyy').toUpperCase();
}

// The backend refuses to close the current (or a future) month — "cannot close current or
// future month" — so the close action only ever makes sense for a period strictly before the
// first day of this month.
function isPastMonth(period?: string): boolean {
  if (!period) return false;
  const parsed = parseISO(period);
  if (Number.isNaN(parsed.getTime())) return false;
  const now = new Date();
  const startOfThisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  return parsed.getTime() < startOfThisMonth.getTime();
}

type Props = {
  periods: AcctPeriod[];
  canWrite: boolean;
  onClose: (period: AcctPeriod) => void;
  onReopen: (period: AcctPeriod) => void;
};

// Periods list (05 "Список"): period · status · closed at · closed by · action. Small table
// (one row per calendar month since the ledger's first posting) — no pagination/sticky-header
// machinery needed at this volume (08.8 anti-patterns: no virtualization for tables this size).
export function PeriodsTable({ periods, canWrite, onClose, onReopen }: Props) {
  return (
    <div className='overflow-x-auto'>
      <table className='w-full min-w-max border-collapse border-2 border-textInactiveColor'>
        <thead className='h-10 bg-textInactiveColor'>
          <tr className='border-b border-textInactiveColor'>
            <th className='px-2 text-left text-textBaseSize uppercase'>period</th>
            <th className='px-2 text-left text-textBaseSize uppercase'>status</th>
            <th className='px-2 text-left text-textBaseSize uppercase'>closed at</th>
            <th className='px-2 text-left text-textBaseSize uppercase'>closed by</th>
            <th className='px-2 text-right text-textBaseSize uppercase'>action</th>
          </tr>
        </thead>
        <tbody>
          {periods.map((p) => {
            const isOpen = p.status === 'open';
            const isClosed = p.status === 'closed';
            const past = isPastMonth(p.period);
            return (
              <tr key={p.period} className='border-b border-textInactiveColor'>
                <td className='px-2 py-2'>
                  <Text className='font-medium'>{formatPeriodLabel(p.period)}</Text>
                </td>
                <td className='px-2 py-2'>
                  {/* 08.2: OPEN reads gentle/neutral, CLOSED reads muted — the figures behind a
                      closed period are final, but neither state is an error, so neither borrows
                      text-error/text-success. */}
                  <span
                    className={cn(
                      'text-textBaseSize uppercase',
                      isOpen ? 'text-textColor' : 'text-textInactiveColor',
                    )}
                  >
                    {p.status || '—'}
                  </span>
                </td>
                <td className='px-2 py-2'>
                  <Text size='small' variant='inactive'>
                    {p.closedAt ? formatAcctDate(p.closedAt) : '—'}
                  </Text>
                </td>
                <td className='px-2 py-2'>
                  <Text size='small' variant='inactive'>
                    {p.closedBy || '—'}
                  </Text>
                </td>
                <td className='px-2 py-2 text-right'>
                  {/* Every non-actionable state shows a VISIBLE reason (not a bare "—"), with the
                      full explanation on hover — so it's never ambiguous whether an action is
                      missing or simply not applicable yet. */}
                  {!canWrite ? (
                    <Tooltip
                      trigger={
                        <span
                          tabIndex={0}
                          className='cursor-help text-textBaseSize uppercase text-textInactiveColor'
                        >
                          read-only
                        </span>
                      }
                    >
                      <span className='block max-w-56 text-textBaseSize'>
                        closing / reopening a period needs the accounting:write permission — ask an
                        admin to grant it.
                      </span>
                    </Tooltip>
                  ) : isOpen && past ? (
                    <Button variant='secondary' size='sm' onClick={() => onClose(p)}>
                      close
                    </Button>
                  ) : isOpen && !past ? (
                    <Tooltip
                      trigger={
                        <span
                          tabIndex={0}
                          className='cursor-help text-textBaseSize uppercase text-textInactiveColor'
                        >
                          not over yet
                        </span>
                      }
                    >
                      <span className='block max-w-56 text-textBaseSize'>
                        a month can only be closed once it has fully ended. This is the current (or a
                        future) month — its “close” button appears on the 1st of the next month.
                      </span>
                    </Tooltip>
                  ) : isClosed ? (
                    <Button variant='secondary' size='sm' onClick={() => onReopen(p)}>
                      reopen
                    </Button>
                  ) : (
                    <span className='text-textBaseSize text-textInactiveColor'>—</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
