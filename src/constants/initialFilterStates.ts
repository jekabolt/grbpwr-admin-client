import { GetProductsPagedRequest } from "api/proto-http/admin";

export const defaultProductFilterSettings: GetProductsPagedRequest = {
    limit: undefined,
    offset: undefined,
    sortFactors: ['SORT_FACTOR_CREATED_AT'],
    orderFactor: 'ORDER_FACTOR_DESC',
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