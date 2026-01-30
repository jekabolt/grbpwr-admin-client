import {
  common_GenderEnum,
  common_OrderFactor,
  common_SortFactor,
  GetProductsPagedRequest,
} from 'api/proto-http/admin';

const DEFAULT_SORT: common_SortFactor = 'SORT_FACTOR_CREATED_AT';
const DEFAULT_ORDER: common_OrderFactor = 'ORDER_FACTOR_DESC';

function normalizeSort(sort?: string | null): common_SortFactor {
  if (sort && sort.startsWith('SORT_FACTOR_') && sort !== 'SORT_FACTOR_UNKNOWN') {
    return sort as common_SortFactor;
  }
  return DEFAULT_SORT;
}

function normalizeOrder(order?: string | null): common_OrderFactor {
  if (order && order.startsWith('ORDER_FACTOR_') && order !== 'ORDER_FACTOR_UNKNOWN') {
    return order as common_OrderFactor;
  }
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
  topCategories,
  subCategories,
  types,
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
  topCategories?: string | null;
  subCategories?: string | null;
  types?: string | null;
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
  return {
    sortFactors: [sortFactor],
    orderFactor,
    filterConditions: {
      from: from ? from : undefined, //done
      to: to ? to : undefined, //done
      gender: isGenderFilter(gender) ? [gender] : undefined,
      color: color ? color : undefined, //done
      topCategoryIds: topCategories
        ? topCategories.split(',').map((id) => parseInt(id))
        : undefined, //done
      subCategoryIds: subCategories
        ? subCategories.split(',').map((id) => parseInt(id))
        : undefined, //done
      typeIds: types ? types.split(',').map((id) => parseInt(id)) : undefined, //done
      sizesIds: sizes ? sizes.split(',').map((id) => parseInt(id)) : undefined, //done
      byTag: tag ? tag : undefined,
      preorder: preorder ? preorder === 'true' : undefined,
      onSale: sale ? sale === 'true' : undefined,
      collections: collections ? collections.split(',') : undefined,
      currency: currency ? currency : undefined,
    },
    showHidden: hidden ? hidden === 'true' : undefined,
  };
}
