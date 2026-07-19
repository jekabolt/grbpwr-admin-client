import type { FunnelSection } from 'api/proto-http/admin';
import { FC } from 'react';
import Text from 'ui/components/text';
import { formatNumber } from '../utils';

// Same 3 trustworthy steps as FunnelChart; the 10-step GA4 funnel is noise at boutique traffic.
const STEPS = [
  { key: 'viewItemUsers', label: 'View item' },
  { key: 'addToCartUsers', label: 'Add to cart' },
  { key: 'purchaseUsers', label: 'Purchase' },
] as const;
const MIN_PURCHASE_USERS = 30;

/**
 * Funnel as drop-off, not just bars: each step-to-step transition with the % (and headcount)
 * lost, and the single biggest leak called out — that's the one worth fixing. Suppressed below
 * a purchase-count floor where the ratios are single-digit noise.
 */
export const FunnelDropoff: FC<{ funnel: FunnelSection | undefined }> = ({ funnel }) => {
  const agg = funnel?.aggregate;
  if (!agg) return null;
  const purchaseUsers = agg.purchaseUsers ?? 0;
  if (purchaseUsers < MIN_PURCHASE_USERS) {
    return (
      <Text className='text-textBaseSize text-labelColor leading-relaxed'>
        Only {formatNumber(purchaseUsers)} purchases this period — too few to read step drop-off
        reliably. Widen the date range to see the funnel.
      </Text>
    );
  }

  const users = STEPS.map((s) => (agg[s.key as keyof typeof agg] as number | undefined) ?? 0);
  const trans = STEPS.slice(1).map((s, i) => {
    const from = users[i];
    const to = users[i + 1];
    const lost = Math.max(0, from - to);
    const lostPct = from > 0 ? (lost / from) * 100 : 0;
    return { from: STEPS[i].label, to: s.label, lost, lostPct };
  });
  const worst = trans.reduce((a, b) => (b.lostPct > a.lostPct ? b : a), trans[0]);

  return (
    <div className='space-y-3'>
      {worst && worst.lostPct > 0 && (
        <div className='border border-error bg-error/10 p-2'>
          <Text className='text-textBaseSize text-error'>
            <span className='font-bold'>
              Biggest leak: {worst.from} → {worst.to}
            </span>{' '}
            — {worst.lostPct.toFixed(0)}% drop, ~{formatNumber(worst.lost)} people looked but
            didn&#39;t continue.
          </Text>
        </div>
      )}
      <div className='space-y-2'>
        {trans.map((t, i) => (
          <div key={i} className='space-y-1'>
            <div className='flex items-baseline justify-between gap-3 text-textBaseSize'>
              <Text className='uppercase'>
                {t.from} → {t.to}
              </Text>
              <Text className='tabular-nums text-labelColor'>
                −{t.lostPct.toFixed(0)}% · {formatNumber(t.lost)} lost
              </Text>
            </div>
            <div className='h-3 w-full bg-bgSecondary/60'>
              <div className='h-3 bg-error/60' style={{ width: `${Math.min(100, t.lostPct)}%` }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
