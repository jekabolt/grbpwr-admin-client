import {
  common_GenderEnum,
  common_OrderFactor,
  common_SortFactor,
  GetProductsPagedRequest,
} from 'api/proto-http/admin';

export function getProductPagedParans({
  sort = 'SORT_FACTOR_CREATED_AT',
  order = 'ORDER_FACTOR_DESC',
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
}): Pick<
  GetProductsPagedRequest,
  'sortFactors' | 'orderFactor' | 'filterConditions' | 'showHidden'
> {
  return {
    sortFactors: sort ? [sort as common_SortFactor] : undefined, //done
    orderFactor: order ? (order as common_OrderFactor) : undefined, //done
    filterConditions: {
      from: from ? from : undefined, //done
      to: to ? to : undefined, //done
      gender: gender ? [gender as common_GenderEnum] : undefined, //done
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
    },
    showHidden: hidden ? hidden === 'true' : undefined,
  };
}
