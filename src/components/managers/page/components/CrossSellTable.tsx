import type { BusinessMetrics } from 'api/proto-http/admin';
import { FC } from 'react';
import Text from 'ui/components/text';
import { ProductNameLink } from './ProductNameLink';

interface CrossSellTableProps {
  metrics: BusinessMetrics | undefined;
}

// A pair bought together once or twice is chance, not a bundling signal — require real support.
const MIN_SUPPORT = 3;

export const CrossSellTable: FC<CrossSellTableProps> = ({ metrics }) => {
  const pairs = (metrics?.crossSellPairs ?? []).filter((p) => (p.count ?? 0) >= MIN_SUPPORT);
  if (pairs.length === 0) return null;

  return (
    <div className='space-y-4'>
      <Text variant='uppercase' className='font-bold'>
        Frequently bought together
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
                <td className='p-2'>
                <ProductNameLink productId={p.productAId} productName={p.productAName} />
              </td>
              <td className='p-2'>
                <ProductNameLink productId={p.productBId} productName={p.productBName} />
              </td>
                <td className='p-2 text-right'>{p.count ?? 0}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Text className='text-xs text-textInactiveColor'>
        Only pairs bought together {MIN_SUPPORT}+ times. Raw co-occurrence — a true lift score
        (vs how often each sells alone) needs marginal frequencies from the backend.
      </Text>
    </div>
  );
};
