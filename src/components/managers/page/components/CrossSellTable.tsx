import type { BusinessMetrics } from 'api/proto-http/admin';
import { FC } from 'react';
import Text from 'ui/components/text';

interface CrossSellTableProps {
  metrics: BusinessMetrics | undefined;
}

export const CrossSellTable: FC<CrossSellTableProps> = ({ metrics }) => {
  const pairs = metrics?.crossSellPairs ?? [];
  if (pairs.length === 0) return null;

  return (
    <div className='space-y-4'>
      <Text variant='uppercase' className='font-bold'>
        Cross-sell pairs
      </Text>
      <div className='border border-textInactiveColor overflow-x-auto'>
        <table className='w-full text-textBaseSize'>
          <thead>
            <tr className='border-b border-textInactiveColor'>
              <th className='text-left p-2 uppercase'>Product A</th>
              <th className='text-left p-2 uppercase'>Product B</th>
              <th className='text-right p-2 uppercase'>Count</th>
            </tr>
          </thead>
          <tbody>
            {pairs.map((p, i) => (
              <tr key={i} className='border-b border-textInactiveColor last:border-0'>
                <td className='p-2'>{p.productAName || `#${p.productAId}`}</td>
                <td className='p-2'>{p.productBName || `#${p.productBId}`}</td>
                <td className='p-2 text-right'>{p.count ?? 0}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
