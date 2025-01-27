
import { getDictionary, getProductsPaged } from "api/admin";
import { getArchive } from "api/archive";
import { common_FilterConditions, GetProductsPagedRequest } from "api/proto-http/admin";
import { defaultProductFilterSettings } from "constants/initialFilterStates";
import { create } from "zustand";
import { ArchiveStore, DictionaryStore, ProductStore, SnackBarStore } from "./store-types";

export const useDictionaryStore = create<DictionaryStore>((set, get) => ({
    dictionary: undefined,
    loading: false,
    error: null,
    initialized: false,
    fetchDictionary: async () => {
        if (get().initialized || get().loading) return;
        set({ loading: true, error: null })
        try {
            const response = await getDictionary({})
            set({ dictionary: response.dictionary, loading: false, initialized: true })
        } catch (error) {
            set({ error: 'Failed to fetch dictionary', loading: false, initialized: false })
        }
    }
}))


export const useSnackBarStore = create<SnackBarStore>((set) => ({
    alerts: [],
    showMessage: (message: string, severity: 'success' | 'error') => {
        const newAlert = {
            message,
            severity,
            id: Date.now(),
        };
        set((state) => ({ alerts: [...state.alerts, newAlert] }));
    },
    closeMessage: (id: number) => {
        set((state) => ({
            alerts: state.alerts.filter((alert) => alert.id !== id)
        }));
    },
    clearAll: () => {
        set({ alerts: [] });
    }
}));

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
    fetchProducts: async (limit: number, offset: number, filterValues?: GetProductsPagedRequest) => {
        const { filter } = get();
        set({ isLoading: true, error: null });

        try {
            const response = await getProductsPaged({
                ...(filterValues || filter),
                limit,
                offset,
            })
            const fetchedProducts = response.products || [];

            if (offset === 0) {
                set({ products: fetchedProducts })
            } else {
                set((state) => ({
                    products: [...state.products, ...fetchedProducts],
                }))
            }

            set({ hasMore: fetchedProducts.length === limit, isLoading: false })
        } catch (error) {
            set({ error: 'Failed to fetch products', isLoading: false })
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

export const useArchiveStore = create<ArchiveStore>((set, get) => ({
    archives: [],
    isLoading: false,
    hasMore: false,
    error: null,
    fetchArchives: async (limit: number, offset: number) => {
        set({ isLoading: true, error: null });
        try {
            const response = await getArchive({
                limit,
                offset,
                orderFactor: 'ORDER_FACTOR_DESC',
            })
            const fetchedArchives = response.archives || []
            if (offset === 0) {
                set({ archives: fetchedArchives })
            } else {
                set((state) => ({
                    archives: [...state.archives, ...fetchedArchives]
                }))
            }
            set({ hasMore: fetchedArchives.length === limit, isLoading: false })
        } catch (error) {
            set({ error: 'Failed to fetch archives', isLoading: false })
        }
    },
    deleteArchive: async (id: string) => {
        set({ isLoading: true, error: null });
    },
    addArchive: async (archive: any) => { },
    updateArchive: async (id: string, data: any) => { },
}))


