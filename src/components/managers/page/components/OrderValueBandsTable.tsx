import type { OrderValueBandRow } from 'api/proto-http/admin';
import { FC } from 'react';
import Text from 'ui/components/text';
import { formatCurrency, formatNumber, parseDecimal } from '../utils';

interface OrderValueBandsTableProps {
  bands: OrderValueBandRow[] | undefined;
  /** Overall AOV for the period — marks the band it falls into, tying the histogram to the tile. */
  aovValue?: number;
}

// A share gap this wide (in percentage points) between revenue and orders is the insight the
// histogram exists to surface — flag it in words, at most one flag per band.
const DIVERGENCE_PP = 15;

// True when `value` falls in [from, to); to === 0 means the unbounded top band.
function bandContains(row: OrderValueBandRow, value: number): boolean {
  const from = parseDecimal(row.from);
  const to = parseDecimal(row.to);
  if (value < from) return false;
  return to === 0 ? true : value < to;
}

const clamp = (v: number) => Math.max(0, Math.min(100, v));

/**
 * Order-value distribution: net revenue by basket-size band. Two stacked bars per band —
 * revenue share (ink) vs orders share (gray) — so the "few big baskets carry the money"
 * divergence reads at a glance. Histogram order is preserved (never re-sorted by value).
 */
export const OrderValueBandsTable: FC<OrderValueBandsTableProps> = ({ bands, aovValue }) => {
  if (!bands || bands.length === 0) return null;

  const totalOrders = bands.reduce((s, b) => s + (b.orders ?? 0), 0);
  const topRevenueShare = Math.max(...bands.map((b) => b.revenueSharePct ?? 0));
  const aovBandIndex =
    aovValue != null && aovValue > 0 ? bands.findIndex((b) => bandContains(b, aovValue)) : -1;

  return (
    <div className='space-y-3'>
      <div className='flex flex-wrap items-baseline justify-between gap-2'>
        <Text className='text-textBaseSize text-labelColor'>
          <span className='inline-block h-2 w-3 align-middle bg-textColor/70' /> share of revenue ·{' '}
          <span className='inline-block h-2 w-3 align-middle bg-labelColor/40' /> share of orders
        </Text>
        <Text className='text-textBaseSize text-labelColor'>
          over {formatNumber(totalOrders)} orders
        </Text>
      </div>

      <div className='space-y-3'>
        {bands.map((b, i) => {
          const revShare = b.revenueSharePct ?? 0;
          const ordShare = b.ordersSharePct ?? 0;
          const isTop = revShare === topRevenueShare && revShare > 0;
          const isAov = i === aovBandIndex;
          const divergence = revShare - ordShare;
          const flag =
            divergence >= DIVERGENCE_PP
              ? 'few orders, big money'
              : divergence <= -DIVERGENCE_PP
                ? 'many orders, little money'
                : null;

          return (
            <div key={`${b.label ?? 'band'}-${i}`} className='space-y-1'>
              <div className='flex items-baseline justify-between gap-3'>
                <Text size='small' className={isTop ? 'font-bold' : undefined}>
                  {b.label}
                  {isAov && <span className='ml-1 text-labelColor'>◂ AOV</span>}
                </Text>
                <Text size='small' className={isTop ? 'font-bold' : undefined}>
                  {formatCurrency(parseDecimal(b.revenue))}
                  <span className='text-labelColor'>
                    {' · '}
                    {formatNumber(b.orders ?? 0)} orders · AOV{' '}
                    {formatCurrency(parseDecimal(b.avgOrderValue))}
                  </span>
                </Text>
              </div>
              <div className='space-y-0.5'>
                <div className='h-1.5 w-full bg-bgSecondary/40'>
                  <div className='h-1.5 bg-textColor/70' style={{ width: `${clamp(revShare)}%` }} />
                </div>
                <div className='h-1.5 w-full bg-bgSecondary/40'>
                  <div className='h-1.5 bg-labelColor/40' style={{ width: `${clamp(ordShare)}%` }} />
                </div>
              </div>
              <div className='flex items-baseline justify-between gap-3'>
                <span className='text-labelColor text-textBaseSize'>
                  rev {revShare.toFixed(0)}% · ord {ordShare.toFixed(0)}%
                </span>
                {flag && <span className='text-labelColor text-textBaseSize'>{flag}</span>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
