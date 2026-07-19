import type { GetMetricsResponse } from 'api/proto-http/admin';
import { FC } from 'react';
import Text from 'ui/components/text';
import { buildReorderSignals } from '../productSignals';
import { ActionList } from './ActionList';

/** REORDER decision: the buy-more list, merged from lost-sales / reorder-point / demand /
 *  early sell-out / reprintable drops. Null when nothing needs restocking. */
export const ReorderList: FC<{ metricsResponse: GetMetricsResponse }> = ({ metricsResponse }) => {
  const { items, total } = buildReorderSignals(metricsResponse);
  if (items.length === 0) return null;
  return (
    <div className='border-2 border-warning/60 bg-bgSecondary/20 p-4'>
      <Text variant='uppercase' className='block font-bold'>
        Reorder — restock these ({total})
      </Text>
      <Text className='text-labelColor text-textBaseSize mb-3 block'>
        Lost sales, waiting demand and early sell-outs — buy before they cost more.
      </Text>
      <ActionList items={items} total={total} />
    </div>
  );
};
