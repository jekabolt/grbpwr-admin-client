import { googletype_Decimal } from 'api/proto-http/admin';
import { formatDateShort } from 'components/managers/orders-catalog/components/utility';
import { ACCT_SOURCE_TYPES } from './constants';

// google.type.Decimal is a string-valued number on the wire ({value: "1234.50"}). The backend
// computes every sum/balance/delta the accounting screens show (08-ux-guidelines.md §8.6
// principle #6 — the client never does report arithmetic); this only formats what it already
// sent. Rules: docs/plan-accounting-ui/08-ux-guidelines.md §8.3.
export function formatBase(d?: googletype_Decimal): string {
  const raw = d?.value;
  if (!raw) return '—';
  const n = parseFloat(raw);
  if (!Number.isFinite(n)) return '—';
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// True when the decimal's numeric value is negative — amount-cell switches to text-error for
// these (signed, not parenthesized — §8.3).
export function isNegative(d?: googletype_Decimal): boolean {
  const n = parseFloat(d?.value ?? '');
  return Number.isFinite(n) && n < 0;
}

// Re-exported so accounting screens have one local import for date formatting instead of every
// file reaching into orders-catalog directly. Renders e.g. '20 JUL 2026'.
export const formatAcctDate = formatDateShort;

export function sourceTypeLabel(value?: string): string {
  return ACCT_SOURCE_TYPES.find((t) => t.value === value)?.label ?? value ?? '—';
}
