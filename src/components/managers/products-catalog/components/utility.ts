import {
  common_GenderEnum,
  common_OrderFactor,
  common_SortFactor,
  GetProductsPagedRequest,
} from 'api/proto-http/admin';

import { GENDER_MAP, ORDER_MAP, SORT_MAP_URL } from 'constants/constants';
import { ROUTES } from 'constants/routes';

export function buildCatalogSearch(
  searchParams: URLSearchParams,
  updates: { topCategory?: string; subCategory?: string; gender?: string },
): string {
  const params = new URLSearchParams(searchParams);
  if (updates.topCategory !== undefined) {
    if (updates.topCategory) params.set('topCategory', updates.topCategory);
    else params.delete('topCategory');
  }
  if (updates.subCategory !== undefined) {
    if (updates.subCategory) params.set('subCategory', updates.subCategory);
    else params.delete('subCategory');
  }
  if (updates.gender !== undefined) {
    if (updates.gender) params.set('gender', updates.gender);
    else params.delete('gender');
  }
  const q = params.toString();
  return q ? `${ROUTES.product}?${q}` : ROUTES.product;
}

const DEFAULT_SORT: common_SortFactor = 'SORT_FACTOR_CREATED_AT';
const DEFAULT_ORDER: common_OrderFactor = 'ORDER_FACTOR_DESC';

function normalizeSort(sort?: string | null): common_SortFactor {
  if (!sort) return DEFAULT_SORT;
  if (SORT_MAP_URL[sort]) return SORT_MAP_URL[sort];
  if (sort.startsWith('SORT_FACTOR_') && sort !== 'SORT_FACTOR_UNKNOWN')
    return sort as common_SortFactor;
  return DEFAULT_SORT;
}

function normalizeOrder(order?: string | null): common_OrderFactor {
  if (!order) return DEFAULT_ORDER;
  if (ORDER_MAP[order]) return ORDER_MAP[order];
  if (order.startsWith('ORDER_FACTOR_') && order !== 'ORDER_FACTOR_UNKNOWN')
    return order as common_OrderFactor;
  return DEFAULT_ORDER;
}

function isGenderFilter(gender?: string | null): gender is common_GenderEnum {
  return !!(
    gender &&
    gender.startsWith('GENDER_ENUM_') &&
    gender !== 'GENDER_ENUM_UNKNOWN' &&
    gender !== 'all'
  );
}

export function getProductPagedParans({
  sort,
  order,
  topCategory,
  subCategory,
  type,
  gender,
  sizes,
  tag,
  color,
  from,
  to,
  sale,
  preorder,
  hidden,
  collections,
  currency,
}: {
  sort?: string | null;
  order?: string | null;
  topCategory?: string | null;
  subCategory?: string | null;
  type?: string | null;
  gender?: string | null;
  sizes?: string | null;
  sale?: string | null;
  tag?: string | null;
  color?: string | null;
  from?: string | null;
  to?: string | null;
  preorder?: string | null;
  hidden?: string | null;
  collections?: string | null;
  currency?: string | null;
}): Pick<
  GetProductsPagedRequest,
  'sortFactors' | 'orderFactor' | 'filterConditions' | 'showHidden'
> {
  const sortFactor = normalizeSort(sort);
  const orderFactor = normalizeOrder(order);
  const genderEnum =
    gender && GENDER_MAP[gender.toLowerCase()] ? GENDER_MAP[gender.toLowerCase()] : gender;
  return {
    sortFactors: [sortFactor],
    orderFactor,
    filterConditions: {
      from: from ? from : undefined, //done
      to: to ? to : undefined, //done
      gender: isGenderFilter(genderEnum) ? [genderEnum] : undefined,
      color: color && color !== 'all' ? color : undefined,
      topCategoryIds: topCategory ? topCategory.split(',').map((id) => parseInt(id)) : undefined, //done
      subCategoryIds: subCategory ? subCategory.split(',').map((id) => parseInt(id)) : undefined, //done
      typeIds: type ? type.split(',').map((id) => parseInt(id)) : undefined, //done
      sizesIds: sizes ? sizes.split(',').map((id) => parseInt(id)) : undefined, //done
      byTag: tag ? tag : undefined,
      preorder: preorder ? preorder === 'true' : undefined,
      onSale: sale ? sale === 'true' : undefined,
      collections: collections ? collections.split(',') : undefined,
      currency: currency ? currency : undefined,
    },
    showHidden: hidden === 'false' ? false : true,
  };
}
