import { GetProductsPagedRequest } from "api/proto-http/admin";

import { common_FilterConditions } from "api/proto-http/admin";

import { common_Product } from "api/proto-http/admin";

export interface ProductStore {
    products: common_Product[];
    isLoading: boolean;
    hasMore: boolean;
    error: string | null;
    filter: GetProductsPagedRequest;
    setFilter: (filter: GetProductsPagedRequest) => void;
    resetFilter: () => void;
    updateFilter: (partialFilter: {
        filterConditions?: Partial<common_FilterConditions>;
        [key: string]: any;
    }) => void;
    deleteProduct: (id: number | undefined) => Promise<{ success: boolean }>;
    fetchProducts: (
        limit: number,
        offset: number,
        filterValues?: GetProductsPagedRequest
    ) => Promise<common_Product[]>;
    setProducts: (products: common_Product[] | ((prev: common_Product[]) => common_Product[])) => void;
    appendProducts: (newProducts: common_Product[]) => void;
    clearProducts: () => void;
}