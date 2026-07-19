import type { GetMetricsResponse } from 'api/proto-http/admin';
import { FC } from 'react';
import Text from 'ui/components/text';
import { buildClearSignals } from '../productSignals';
import { ActionList } from './ActionList';

/** CLEAR / CUT decision: where cash is frozen — dead stock, slow movers, over-bought
 *  sizes and weak drops. Null when nothing is stuck. */
export const ClearList: FC<{ metricsResponse: GetMetricsResponse }> = ({ metricsResponse }) => {
  const { items, total } = buildClearSignals(metricsResponse);
  if (items.length === 0) return null;
  return (
    <div className='border border-textInactiveColor bg-bgSecondary/20 p-4'>
      <Text variant='uppercase' className='block font-bold'>
        Clear — free up cash ({total})
      </Text>
      <Text className='text-labelColor text-textBaseSize mb-3 block'>
        Stock that is not moving. Mark down or pull to release the money.
      </Text>
      <ActionList items={items} total={total} />
    </div>
  );
};
