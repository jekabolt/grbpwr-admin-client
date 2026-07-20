import { googletype_Decimal } from 'api/proto-http/admin';
import { cn } from 'lib/utility';
import { formatBase, isNegative } from '../utils/format';

type Props = {
  value?: googletype_Decimal;
  // Default renders a <td> for the common case (TB/ledger/journal tables); pass 'span' for
  // inline totals outside a table row (e.g. a form's live footer).
  as?: 'td' | 'span';
  // Totals / closing-balance rows (§8.3): border-t + font-medium instead of the plain weight.
  bold?: boolean;
  className?: string;
};

// Shared numeric-cell typography for every accounting table (08-ux-guidelines.md §8.3):
// tabular-nums so digits line up in a column, right-aligned, a fixed width so a table doesn't
// reflow when the period/account changes, red for negatives (signed, no parenthesis notation),
// em dash for missing data vs. a real "0.00". formatBase/isNegative do the number work; this
// only lays it out — the client never computes the amount itself (§8.6 principle #6).
export function AmountCell({ value, as = 'td', bold, className }: Props) {
  const cls = cn(
    'w-32 min-w-32 whitespace-nowrap text-right tabular-nums',
    isNegative(value) && 'text-error',
    bold && 'border-t border-textColor font-medium',
    className,
  );
  const text = formatBase(value);

  if (as === 'span') return <span className={cls}>{text}</span>;
  return <td className={cls}>{text}</td>;
}
