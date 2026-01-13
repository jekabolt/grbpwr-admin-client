import { common_Dictionary, common_Category, common_Size, common_MeasurementName, common_OrderStatus, common_ShipmentCarrier } from 'api/proto-http/admin';

/* eslint-disable @typescript-eslint/no-unused-vars */
type Pattern = {
  [key: string]: RegExp;
};

const pattern: Pattern = {
  size: /SIZE_ENUM_/,
  measurement: /MEASUREMENT_NAME_ENUM_/,
  category: /CATEGORY_ENUM_/,
  sortFactors: /SORT_FACTOR_/,
};

type dictionaryTypes =
  | 'size'
  | 'order'
  | 'carrier'
  | 'status'
  | 'measurement'
  | 'category'
  | 'sortFactors';

export const findInDictionary = (
  dictionary: common_Dictionary | undefined,
  id: number | string | undefined,
  type: dictionaryTypes,
) => {
  if (!dictionary || id === undefined) return undefined;

  let data;
  switch (type) {
    case 'category':
      data = dictionary.categories?.find((s: common_Category) => s.id === id)?.name?.replace(pattern[type], '');
      break;
    case 'size':
      data = dictionary.sizes?.find((s: common_Size) => s.id === id)?.name?.replace(pattern[type], '');
      break;
    case 'measurement':
      data = dictionary.measurements?.find((s: common_MeasurementName) => s.id === id)?.name?.replace(pattern[type], '');
      break;
    case 'order':
      data = dictionary.orderStatuses?.find((s: common_OrderStatus) => s.id === id)?.name?.replace(pattern[type], '');
      break;
    case 'carrier':
      data = dictionary.shipmentCarriers?.find((s: common_ShipmentCarrier) => s.id === id)?.shipmentCarrier?.carrier;
      break;

    default:
      return undefined;
  }

  return data;
};
