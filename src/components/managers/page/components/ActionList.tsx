import { FC } from 'react';
import Text from 'ui/components/text';
import type { ActionItem } from '../productSignals';
import { ProductNameLink } from './ProductNameLink';

/** Bounded, scannable action list: name on the left, the signal + action on the right. */
export const ActionList: FC<{ items: ActionItem[]; total: number }> = ({ items, total }) => {
  if (items.length === 0) return null;
  return (
    <ul className='divide-y divide-textInactiveColor/60'>
      {items.map((it) => (
        <li
          key={it.key}
          className='flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 py-2'
        >
          <div className='min-w-0 max-w-[55%] font-bold'>
            {/* Only linkify numeric DB colorway ids. OOS / notify-me rows carry BigQuery string
                ids that are not colorway ids, so linking them would land on a blank product page. */}
            {typeof it.productId === 'number' && it.productId > 0 ? (
              <ProductNameLink productId={it.productId} productName={it.name} maxWidth='100%' />
            ) : (
              <Text className='truncate'>{it.name}</Text>
            )}
          </div>
          <Text className='text-labelColor text-textBaseSize text-right'>{it.signal}</Text>
        </li>
      ))}
      {total > items.length && (
        <li className='py-2'>
          <Text className='text-labelColor text-textBaseSize'>
            +{total - items.length} more — see the full table below
          </Text>
        </li>
      )}
    </ul>
  );
};
