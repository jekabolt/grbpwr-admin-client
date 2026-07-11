import type { CampaignAttributionRow } from 'api/proto-http/admin';
import { FC } from 'react';
import { formatCurrency, formatNumber, parseDecimal } from '../utils';
import Text from 'ui/components/text';

interface CampaignAttributionTableProps {
  campaignAttribution: CampaignAttributionRow[] | undefined;
}

// Per-row conversion rate over fewer sessions than this swings wildly — show '—' instead.
const MIN_SESSIONS_FOR_RATE = 50;

export const CampaignAttributionTable: FC<CampaignAttributionTableProps> = ({
  campaignAttribution,
}) => {
  if (!campaignAttribution || campaignAttribution.length === 0) return null;

  const aggregated = campaignAttribution.reduce(
    (acc, row) => {
      const key = `${row.utmSource}-${row.utmMedium}-${row.utmCampaign}`;
      if (!acc[key]) {
        acc[key] = {
          utmSource: row.utmSource,
          utmMedium: row.utmMedium,
          utmCampaign: row.utmCampaign,
          sessions: 0,
          conversions: 0,
          revenue: 0,
          spend: 0,
        };
      }
      acc[key].sessions += row.sessions || 0;
      acc[key].conversions += row.conversions || 0;
      acc[key].revenue += parseDecimal(row.revenue);
      acc[key].spend += parseDecimal(row.spend);
      return acc;
    },
    {} as Record<
      string,
      {
        utmSource: string | undefined;
        utmMedium: string | undefined;
        utmCampaign: string | undefined;
        sessions: number;
        conversions: number;
        revenue: number;
        spend: number;
      }
    >,
  );

  const topCampaigns = Object.values(aggregated)
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 20);
  const anySpend = topCampaigns.some((r) => r.spend > 0);

  return (
    <div className='border border-textInactiveColor p-4'>
      <Text variant='uppercase' className='font-bold mb-1 block'>
        Campaign attribution
      </Text>
      <Text className='text-textInactiveColor text-textBaseSize leading-relaxed mb-3 block'>
        UTM source / medium / campaign. Last-click GA4 attribution — directional, and won't tie out
        to DB revenue exactly.{' '}
        {anySpend ? 'ROAS = revenue ÷ recorded spend.' : 'Enter channel spend to see ROAS.'}
      </Text>
      <div className='overflow-x-auto'>
        <table className='w-full text-textBaseSize'>
          <thead>
            <tr className='border-b border-textInactiveColor'>
              <th className='text-left p-2'>
                <Text variant='uppercase' className='text-textBaseSize'>
                  Source
                </Text>
              </th>
              <th className='text-left p-2'>
                <Text variant='uppercase' className='text-textBaseSize'>
                  Medium
                </Text>
              </th>
              <th className='text-left p-2'>
                <Text variant='uppercase' className='text-textBaseSize'>
                  Campaign
                </Text>
              </th>
              <th className='text-right p-2'>
                <Text variant='uppercase' className='text-textBaseSize'>
                  Sessions
                </Text>
              </th>
              <th className='text-right p-2'>
                <Text variant='uppercase' className='text-textBaseSize'>
                  Revenue
                </Text>
              </th>
              <th className='text-right p-2'>
                <Text variant='uppercase' className='text-textBaseSize'>
                  Spend
                </Text>
              </th>
              <th className='text-right p-2'>
                <Text variant='uppercase' className='text-textBaseSize'>
                  ROAS
                </Text>
              </th>
              <th className='text-right p-2'>
                <Text variant='uppercase' className='text-textBaseSize'>
                  Conv %
                </Text>
              </th>
            </tr>
          </thead>
          <tbody>
            {topCampaigns.map((row, idx) => {
              const conversionRate = row.sessions > 0 ? (row.conversions / row.sessions) * 100 : 0;
              const roas = row.spend > 0 ? row.revenue / row.spend : null;
              return (
                <tr key={idx} className='border-b border-textInactiveColor hover:bg-bgSecondary'>
                  <td className='p-2'>
                    <Text>{row.utmSource || '-'}</Text>
                  </td>
                  <td className='p-2'>
                    <Text>{row.utmMedium || '-'}</Text>
                  </td>
                  <td className='p-2'>
                    <Text className='truncate max-w-[100px]' title={row.utmCampaign || ''}>
                      {row.utmCampaign || '-'}
                    </Text>
                  </td>
                  <td className='p-2 text-right'>
                    <Text>{formatNumber(row.sessions)}</Text>
                  </td>
                  <td className='p-2 text-right'>
                    <Text className='font-bold'>{formatCurrency(row.revenue)}</Text>
                  </td>
                  <td className='p-2 text-right'>
                    <Text className='text-textInactiveColor'>
                      {row.spend > 0 ? formatCurrency(row.spend) : '—'}
                    </Text>
                  </td>
                  <td className='p-2 text-right'>
                    {roas != null ? (
                      <Text
                        className={roas >= 1 ? 'font-bold text-success' : 'font-bold text-error'}
                      >
                        {roas.toFixed(2)}×
                      </Text>
                    ) : (
                      <Text className='text-textInactiveColor'>—</Text>
                    )}
                  </td>
                  <td className='p-2 text-right'>
                    <Text className='text-textInactiveColor'>
                      {row.sessions >= MIN_SESSIONS_FOR_RATE
                        ? `${conversionRate.toFixed(1)}%`
                        : '—'}
                    </Text>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};
