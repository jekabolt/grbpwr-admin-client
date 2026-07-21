import { AcctPeriod } from 'api/proto-http/admin';
import { format, parseISO } from 'date-fns';
import { Button } from 'ui/components/button';
import Tooltip from 'ui/components/tooltip';
import { Pill, RowLine } from '../../components/kit';
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
// first day of this month. Exported: the page's close checklist gates on the same rule.
export function isPastMonth(period?: string): boolean {
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

// Month timeline under the close checklist ("Checklist" variant, 05 "Список"): one RowLine per
// month — label + closed-at/by breadcrumbs on the left, a status Pill and the close/reopen action
// on the right. Small list (one row per calendar month since the ledger's first posting) — no
// pagination/sticky-header machinery needed at this volume (08.8 anti-patterns).
export function PeriodsList({ periods, canWrite, onClose, onReopen }: Props) {
  return (
    <div className='flex flex-col'>
      {periods.map((p) => {
        const isOpen = p.status === 'open';
        const isClosed = p.status === 'closed';
        const past = isPastMonth(p.period);
        return (
          <RowLine
            key={p.period}
            label={
              <span className='flex flex-col'>
                <span className='font-medium'>{formatPeriodLabel(p.period)}</span>
                {isClosed && (p.closedAt || p.closedBy) ? (
                  <span className='text-[10px] uppercase tracking-wide text-labelColor'>
                    closed {p.closedAt ? formatAcctDate(p.closedAt) : '—'}
                    {p.closedBy ? ` by ${p.closedBy}` : ''}
                  </span>
                ) : null}
              </span>
            }
            value={
              <span className='flex items-center gap-2'>
                {/* Closed = the figures behind it are final (green "done" state); open reads
                    muted/neutral — an open month is not an error. */}
                <Pill tone={isClosed ? 'ok' : 'muted'}>{p.status || '—'}</Pill>
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
              </span>
            }
          />
        );
      })}
    </div>
  );
}
