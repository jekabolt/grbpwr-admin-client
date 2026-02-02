'use client';

import { common_GenderEnum, common_OrderFactor, common_SortFactor } from 'api/proto-http/admin';
import {
  ORDER_MAP,
  OrderFactorOption,
  SORT_MAP,
  SORT_MAP_URL,
  SortFactorConfig,
} from 'constants/constants';

import { cn } from 'lib/utility';
import { Button } from 'ui/components/button';

import useFilter from 'lib/useFilter';

type EnumType = common_SortFactor | common_OrderFactor | common_GenderEnum;
type MapType = typeof SORT_MAP_URL | typeof ORDER_MAP;

function getButtonText(
  sortData: SortFactorConfig,
  orderFactor: OrderFactorOption,
): string {
  const saleFactor = orderFactor.sale;
  const label = sortData.label ? `${sortData.label}: ` : '';
  const salePrefix = saleFactor ? `sale: ` : '';
  return `${saleFactor ? salePrefix : label}${orderFactor.name}`;
}

function getUrlKey(enumValue: EnumType, map: MapType): string {
  return Object.keys(map).find((key) => map[key] === enumValue) || '';
}

export default function Sort() {
  const { defaultValue: sortValue, handleFilterChange: handleSortChange } = useFilter('sort');
  const { defaultValue: orderValue } = useFilter('order');
  const { defaultValue: saleValue } = useFilter('sale');

  return (
    <div className='mr-16 space-y-2'>
      {Object.entries(SORT_MAP).flatMap(([sortKey, sortData]) =>
        sortData.orderFactors.map((orderFactor, id) => {
          const isSortValuesMatch =
            sortValue === getUrlKey(sortKey as common_SortFactor, SORT_MAP_URL);
          const isOrderValuesMatch =
            orderValue === getUrlKey(orderFactor.factor as common_OrderFactor, ORDER_MAP);
          const isSaleValuesMatch = orderFactor.sale ? saleValue === 'true' : !saleValue;
          const isSelected = isSortValuesMatch && isOrderValuesMatch && isSaleValuesMatch;
          return (
            <Button
              key={`${sortKey}-${id}`}
              onClick={() => {
                if (isSelected) {
                  handleSortChange(undefined, {
                    order: '',
                    sale: '',
                  });
                } else {
                  handleSortChange(getUrlKey(sortKey as common_SortFactor, SORT_MAP_URL), {
                    order: getUrlKey(orderFactor.factor as common_OrderFactor, ORDER_MAP),
                    sale: orderFactor.sale ? 'true' : '',
                  });
                }
              }}
              className={cn('block', {
                underline: isSelected,
              })}
            >
              {getButtonText(sortData, orderFactor)}
            </Button>
          );
        }),
      )}
    </div>
  );
}
