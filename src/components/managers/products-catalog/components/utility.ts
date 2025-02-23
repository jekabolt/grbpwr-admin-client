import { common_GenderEnum, common_OrderFactor, common_SortFactor, GetProductsPagedRequest } from "api/proto-http/admin";

export function getProductPagedParans({
    sort = 'SORT_FACTOR_CREATED_AT',
    order = 'ORDER_FACTOR_DESC',
    category,
    gender,
    size,
    sale,
    tag,
}: {
    sort?: string | null;
    order?: string | null;
    category?: string | null;
    gender?: string | null;
    size?: string | null;
    sale?: string | null;
    tag?: string | null;
}): Pick<GetProductsPagedRequest, 'sortFactors' | 'orderFactor' | 'filterConditions' | 'showHidden'> {
    return {
        sortFactors: sort ? [sort as common_SortFactor] : undefined,
        orderFactor: order ? order as common_OrderFactor : undefined,
        filterConditions: {
            from: undefined,
            to: undefined,
            onSale: sale ? sale === 'true' : undefined,
            gender: gender ? [gender as common_GenderEnum] : undefined,
            color: undefined,
            topCategoryIds: category ? [parseInt(category)] : undefined,
            subCategoryIds: undefined,
            typeIds: undefined,
            sizesIds: size ? [parseInt(size)] : undefined,
            preorder: undefined,
            byTag: tag ? tag : undefined
        },
        showHidden: false,
    };
}
