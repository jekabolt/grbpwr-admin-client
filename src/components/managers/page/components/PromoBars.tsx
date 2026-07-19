import type { BusinessMetrics } from 'api/proto-http/admin';
import { FC } from 'react';
import { formatCurrency, parseDecimal } from '../utils';
import { ShareBars, type ShareBarRow } from './ShareBars';

/** Promo-attributed revenue as share bars (config: PayPromo=bars). Value = € revenue per code. */
export const PromoBars: FC<{ metrics: BusinessMetrics | undefined }> = ({ metrics }) => {
  const promos = metrics?.commerce?.revenueByPromo ?? [];
  if (promos.length === 0) return null;
  const rows = [...promos].sort((a, b) => parseDecimal(b.revenue) - parseDecimal(a.revenue));
  const total = rows.reduce((s, p) => s + parseDecimal(p.revenue), 0);
  const barRows: ShareBarRow[] = rows.map((p) => {
    const rev = parseDecimal(p.revenue);
    const pct = total > 0 ? (rev / total) * 100 : 0;
    return { label: p.promoCode || '—', sharePct: pct, valueLabel: formatCurrency(rev) };
  });
  return <ShareBars rows={barRows} note='revenue attributed to each promo code' />;
};
