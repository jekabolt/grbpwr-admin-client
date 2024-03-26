import { getProductsPaged } from 'api/admin';
import { GetProductsPagedRequest, common_Product } from 'api/proto-http/admin';
import React, { useCallback, useState } from 'react';
import { initialFilter } from '../filterComponents/initialFilterStates';

const useListProduct = (
    initialLoading = false,
    initialHasMore = true
): {
    products: common_Product[];
    setProducts: React.Dispatch<React.SetStateAction<common_Product[]>>;
    hasMore: boolean,
    isLoading: boolean,
} => {
    const [products, setProducts] = useState<common_Product[]>([]);
    const [isLoading, setIsLoading] = useState<boolean>(initialLoading);
    const [hasMore, setHasMore] = useState<boolean>(initialHasMore)
    const [filter, setFilter] = useState<GetProductsPagedRequest>(initialFilter)

    const fetchProducts = useCallback(async (limit: number, offset: number) => {
        setIsLoading(true)
        const response = await getProductsPaged({
            limit,
            offset,
            sortFactors: filter.sortFactors,
            orderFactor: filter.orderFactor,
            filterConditions: filter.filterConditions,
            showHidden: filter.showHidden
        })
        const fetchedProducts = response.products || []
        setProducts(prev => offset === 0 ? fetchedProducts : [...prev, ...fetchedProducts])
        setIsLoading(false)
        setHasMore(fetchedProducts.length === limit)
    }, [])


    return { products, setProducts, isLoading, hasMore };
};

export default useListProduct;
