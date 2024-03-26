import { GetProductsPagedRequest } from 'api/proto-http/admin';

export const initialFilter: GetProductsPagedRequest = {
  limit: undefined,
  offset: undefined,
  sortFactors: undefined,
  orderFactor: undefined,
  filterConditions: {
    from: undefined,
    to: undefined,
    onSale: undefined,
    color: undefined,
    categoryId: undefined,
    sizesIds: undefined,
    preorder: undefined,
    byTag: undefined,
  },
  showHidden: true,
};
