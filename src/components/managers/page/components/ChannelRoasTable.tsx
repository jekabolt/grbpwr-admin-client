import type { GetChannelRoasSettledResponse } from 'api/proto-http/admin';
import { FC } from 'react';
import Text from 'ui/components/text';
import { formatCurrency, formatNumber, parseDecimal } from '../utils';

interface ChannelRoasTableProps {
  data: GetChannelRoasSettledResponse | undefined;
}

const channelLabel = (source?: string, medium?: string, campaign?: string): string => {
  const src = source || '(direct)';
  const parts = [src];
  if (medium) parts.push(medium);
  if (campaign) parts.push(campaign);
  return parts.join(' / ');
};

// ROAS/CAC on settled (banked) revenue — the real per-channel money picture, distinct from GA4's
// leaky upper-funnel attribution. has_spend=false → ROAS/CAC render N/A (not 0).
export const ChannelRoasTable: FC<ChannelRoasTableProps> = ({ data }) => {
  const rows = data?.rows ?? [];
  if (rows.length === 0) return null;

  const currency = data?.baseCurrency || 'EUR';
  const sorted = [...rows].sort(
    (a, b) => parseDecimal(b.settledRevenue) - parseDecimal(a.settledRevenue),
  );

  return (
    <div className='border border-textInactiveColor p-4'>
      <div className='mb-3 flex flex-wrap items-baseline justify-between gap-2'>
        <Text variant='uppercase' className='font-bold'>
          Channel ROAS · settled revenue
        </Text>
        {data?.baseCurrency && (
          <Text variant='label' size='small'>
            {data.baseCurrency}
          </Text>
        )}
      </div>
      <div className='overflow-x-auto'>
        <table className='w-full text-textBaseSize'>
          <thead>
            <tr className='border-b border-textInactiveColor'>
              <th className='text-left p-2'>Channel (UTM)</th>
              <th className='text-right p-2'>Revenue</th>
              <th className='text-right p-2'>Orders</th>
              <th className='text-right p-2'>New</th>
              <th className='text-right p-2'>Spend</th>
              <th className='text-right p-2'>ROAS</th>
              <th className='text-right p-2'>CAC</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((r, i) => (
              <tr key={i} className='border-b border-textInactiveColor hover:bg-bgSecondary'>
                <td className='p-2'>{channelLabel(r.utmSource, r.utmMedium, r.utmCampaign)}</td>
                <td className='p-2 text-right'>
                  {formatCurrency(parseDecimal(r.settledRevenue), currency)}
                </td>
                <td className='p-2 text-right'>{formatNumber(r.orders ?? 0)}</td>
                <td className='p-2 text-right'>{formatNumber(r.newCustomers ?? 0)}</td>
                <td className='p-2 text-right'>
                  {r.hasSpend ? formatCurrency(parseDecimal(r.spend), currency) : 'N/A'}
                </td>
                <td className='p-2 text-right'>
                  {r.hasSpend ? `${(r.roas ?? 0).toFixed(2)}×` : 'N/A'}
                </td>
                <td className='p-2 text-right'>
                  {r.hasSpend ? formatCurrency(r.cac ?? 0, currency) : 'N/A'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Text className='text-labelColor text-textBaseSize leading-relaxed mt-3 block'>
        Real money (settled) and true per-channel CAC — enter channel spend to unlock ROAS/CAC (N/A
        means no spend recorded, not zero). GA4 campaign attribution above is upper-funnel
        (sessions/conversions) and leaky; use this for the money view.
      </Text>
    </div>
  );
};
