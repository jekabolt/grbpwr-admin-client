import type { PaymentMethodMetric } from 'api/proto-http/admin';
import { FC } from 'react';
import { parseDecimal } from '../utils';
import { ShareBars, type ShareBarRow } from './ShareBars';

// Enum name (PAYMENT_METHOD_NAME_ENUM_CARD) or raw method type → readable label; keeps a
// `_TEST` suffix visible rather than hiding test traffic silently.
function methodLabel(raw: string | undefined): string {
  if (!raw) return '—';
  const cleaned = raw.replace('PAYMENT_METHOD_NAME_ENUM_', '').replace(/_/g, ' ').trim();
  if (!cleaned) return '—';
  return cleaned.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Revenue by payment method as share bars (config: PayPromo=bars). Sorted by revenue. */
export const PaymentMixBars: FC<{ methods: PaymentMethodMetric[] | undefined }> = ({ methods }) => {
  if (!methods || methods.length === 0) return null;
  const rows = [...methods].sort((a, b) => parseDecimal(b.value) - parseDecimal(a.value));
  const total = rows.reduce((s, r) => s + parseDecimal(r.value), 0);
  const barRows: ShareBarRow[] = rows.map((r) => {
    const pct = total > 0 ? (parseDecimal(r.value) / total) * 100 : 0;
    return { label: methodLabel(r.paymentMethod), sharePct: pct, valueLabel: `${pct.toFixed(0)}%` };
  });
  return <ShareBars rows={barRows} />;
};
