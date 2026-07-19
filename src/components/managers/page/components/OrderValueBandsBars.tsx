import type { OrderValueBandRow } from 'api/proto-http/admin';
import { FC } from 'react';
import { parseDecimal } from '../utils';
import { ShareBars, type ShareBarRow } from './ShareBars';

/**
 * Order-value bands as revenue-share bars (config: Bands=bars). Bands ≥ €300 — the big baskets
 * that carry the money — are spotlighted green. Histogram order is preserved.
 */
export const OrderValueBandsBars: FC<{ bands: OrderValueBandRow[] | undefined }> = ({ bands }) => {
  if (!bands || bands.length === 0) return null;
  const rows: ShareBarRow[] = bands.map((b) => {
    const share = b.revenueSharePct ?? 0;
    return {
      label: b.label ?? '—',
      sharePct: share,
      valueLabel: `${share.toFixed(0)}%`,
      highlight: parseDecimal(b.from) >= 300 && share > 0,
    };
  });
  return (
    <ShareBars rows={rows} note='protect / expand big baskets (bundles, free-ship threshold)' />
  );
};
