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
    fetchProducts: (limit: number, offset: number, currentFilter: GetProductsPagedRequest) => Promise<void>;
    filter: GetProductsPagedRequest;
    setFilter: React.Dispatch<React.SetStateAction<GetProductsPagedRequest>>;
} => {
    const [products, setProducts] = useState<common_Product[]>([]);
    const [isLoading, setIsLoading] = useState<boolean>(initialLoading);
    const [hasMore, setHasMore] = useState<boolean>(initialHasMore)
    const [filter, setFilter] = useState<GetProductsPagedRequest>(initialFilter)

    const fetchProducts = useCallback(async (limit: number, offset: number, currentFilter: GetProductsPagedRequest) => {
        setIsLoading(true)
        const response = await getProductsPaged({
            limit,
            offset,
            sortFactors: currentFilter.sortFactors,
            orderFactor: currentFilter.orderFactor,
            filterConditions: currentFilter.filterConditions,
            showHidden: currentFilter.showHidden
        })
        const fetchedProducts = response.products || []
        setProducts(prev => offset === 0 ? fetchedProducts : [...prev, ...fetchedProducts])
        setIsLoading(false)
        setHasMore(fetchedProducts.length === limit)
    }, [])


    return { products, setProducts, isLoading, hasMore, fetchProducts, filter, setFilter };
};

export default useListProduct;
