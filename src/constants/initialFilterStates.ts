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
        topCategoryIds: undefined,
        subCategoryIds: undefined,
        typeIds: undefined,
        sizesIds: undefined,
        preorder: undefined,
        byTag: undefined,
        gender: []
    },
    showHidden: true,
};