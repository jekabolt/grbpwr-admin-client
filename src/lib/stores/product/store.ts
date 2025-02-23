import { create } from "zustand";

import { deleteProductByID, getProductsPaged } from "api/admin";
import { common_FilterConditions, GetProductsPagedRequest } from "api/proto-http/admin";
import { defaultProductFilterSettings } from "constants/initialFilterStates";
import { ProductStore } from "./store-types";

export const useProductStore = create<ProductStore>((set, get) => ({
    products: [],
    isLoading: false,
    hasMore: false,
    error: null,
    filter: defaultProductFilterSettings,
    setFilter: (filter: GetProductsPagedRequest) => {
        set({ filter });
    },
    resetFilter: () => {
        set({ filter: defaultProductFilterSettings });
    },
    updateFilter: (partialFilter) => {
        set((state) => ({
            filter: {
                ...state.filter,
                ...partialFilter,
                filterConditions: {
                    ...state.filter.filterConditions,
                    ...partialFilter.filterConditions,
                } as common_FilterConditions,
            },
        }));
    },
    fetchProducts: async (limit: number, offset: number) => {
        try {
            const response = await getProductsPaged({
                ...get().filter,
                limit,
                offset,
            });
            const products = response.products || [];

            set((state) => ({
                products: offset === 0 ? products : [...state.products, ...products]
            }));
            return products;
        } catch (error) {
            console.error('Failed to fetch products:', error);
            return [];
        }
    },
    setProducts: (products) => set((state) => ({
        products: typeof products === 'function' ? products(state.products) : products
    })),
    appendProducts: (newProducts) => set((state) => ({
        products: [...state.products, ...newProducts]
    })),
    clearProducts: () => set({ products: [] })
}))