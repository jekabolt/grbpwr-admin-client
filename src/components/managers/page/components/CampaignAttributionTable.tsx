import type { CampaignAttributionRow } from 'api/proto-http/admin';
import { FC } from 'react';
import Text from 'ui/components/text';
import { formatCurrency, formatNumber, parseDecimal } from '../utils';

interface CampaignAttributionTableProps {
  campaignAttribution: CampaignAttributionRow[] | undefined;
}

export const CampaignAttributionTable: FC<CampaignAttributionTableProps> = ({ campaignAttribution }) => {
  if (!campaignAttribution || campaignAttribution.length === 0) return null;

  const aggregated = campaignAttribution.reduce((acc, row) => {
    const key = `${row.utmSource}-${row.utmMedium}-${row.utmCampaign}`;
    if (!acc[key]) {
      acc[key] = {
        utmSource: row.utmSource,
        utmMedium: row.utmMedium,
        utmCampaign: row.utmCampaign,
        sessions: 0,
        users: 0,
        conversions: 0,
        revenue: 0,
      };
    }
    acc[key].sessions += row.sessions || 0;
    acc[key].users += row.users || 0;
    acc[key].conversions += row.conversions || 0;
    acc[key].revenue += parseDecimal(row.revenue);
    return acc;
  }, {} as Record<string, {
    utmSource: string | undefined;
    utmMedium: string | undefined;
    utmCampaign: string | undefined;
    sessions: number;
    users: number;
    conversions: number;
    revenue: number;
  }>);

  const topCampaigns = Object.values(aggregated)
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 20);

  return (
    <div className='border border-textInactiveColor p-4'>
      <Text variant='uppercase' className='font-bold mb-4 block'>
        Campaign attribution
      </Text>
      <div className='overflow-x-auto'>
        <table className='w-full text-xs'>
          <thead>
            <tr className='border-b border-textInactiveColor'>
              <th className='text-left p-2'>
                <Text variant='uppercase' className='text-[10px]'>Source</Text>
              </th>
              <th className='text-left p-2'>
                <Text variant='uppercase' className='text-[10px]'>Medium</Text>
              </th>
              <th className='text-left p-2'>
                <Text variant='uppercase' className='text-[10px]'>Campaign</Text>
              </th>
              <th className='text-right p-2'>
                <Text variant='uppercase' className='text-[10px]'>Sessions</Text>
              </th>
              <th className='text-right p-2'>
                <Text variant='uppercase' className='text-[10px]'>Users</Text>
              </th>
              <th className='text-right p-2'>
                <Text variant='uppercase' className='text-[10px]'>Conversions</Text>
              </th>
              <th className='text-right p-2'>
                <Text variant='uppercase' className='text-[10px]'>Revenue</Text>
              </th>
              <th className='text-right p-2'>
                <Text variant='uppercase' className='text-[10px]'>Conv %</Text>
              </th>
            </tr>
          </thead>
          <tbody>
            {topCampaigns.map((row, idx) => {
              const conversionRate = row.sessions > 0 ? (row.conversions / row.sessions) * 100 : 0;
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
                    <Text>{formatNumber(row.users)}</Text>
                  </td>
                  <td className='p-2 text-right'>
                    <Text>{formatNumber(row.conversions)}</Text>
                  </td>
                  <td className='p-2 text-right'>
                    <Text className='font-bold'>{formatCurrency(row.revenue)}</Text>
                  </td>
                  <td className='p-2 text-right'>
                    <Text>{conversionRate.toFixed(2)}%</Text>
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
