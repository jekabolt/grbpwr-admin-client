import { getAllUploadedFiles, getDictionary, getProductsPaged } from "api/admin";
import { addArchive, deleteArchive, getArchive, getArchiveItems, updateArchive } from "api/archive";
import { common_ArchiveInsert, common_FilterConditions, GetProductsPagedRequest } from "api/proto-http/admin";
import { defaultProductFilterSettings } from "constants/initialFilterStates";
import { isVideo } from "features/utilitty/filterContentType";
import { create } from "zustand";
import { ArchiveStore, DictionaryStore, MediaSelectorStore, ProductStore, SnackBarStore } from "./store-types";

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
    archiveItems: undefined,
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
    clearArchiveItems: () => {
        set({ archiveItems: undefined });
    },
    fetchArchiveItems: async (id: number | undefined) => {
        if (!id) return;
        set({ isLoading: true, error: null });
        try {
            const archive = get().archives.find((a) => a.id === id);
            const response = await getArchiveItems({ id, heading: archive?.heading || 'string', tag: archive?.tag || 'string' });
            set({ archiveItems: response.archive, isLoading: false })
        } catch (error) {
            set({ error: 'Failed to fetch archive items', isLoading: false })
        }
    },
    addArchive: async (archiveInsert: common_ArchiveInsert) => {
        set({ isLoading: true, error: null });
        try {
            const trimmedArchive = {
                ...archiveInsert,
                heading: archiveInsert.heading?.trim(),
                description: archiveInsert.description?.trim(),
                tag: archiveInsert.tag?.trim(),
            };
            await addArchive({ archiveInsert: trimmedArchive });
            await get().fetchArchives(10, 0);
            set({ isLoading: false });
        } catch (error) {
            set({ error: 'Failed to create archive', isLoading: false });
            throw error;
        }
    },
    updateArchive: async (id: number, archiveInsert: common_ArchiveInsert) => {
        set({ isLoading: true, error: null });
        try {
            const trimmedArchive = {
                ...archiveInsert,
                heading: archiveInsert.heading?.trim(),
                description: archiveInsert.description?.trim(),
                tag: archiveInsert.tag?.trim(),
            };
            await updateArchive({ id, archiveInsert: trimmedArchive });
            await get().fetchArchives(10, 0);
            set({ isLoading: false });
        } catch (error) {
            set({ error: 'Failed to update archive', isLoading: false });
            throw error;
        }
    },
    deleteArchive: async (id: number | undefined) => {
        if (!id) return;
        set({ isLoading: true, error: null });
        try {
            await deleteArchive({ id });
            await get().fetchArchives(10, 0);
        } catch (error) {
            set({ error: 'Failed to delete archive', isLoading: false })
        }
    }
}))


export const useMediaSelectorStore = create<MediaSelectorStore>((set, get) => ({
    media: [],
    type: '',
    order: 'desc',
    isLoading: false,
    error: null,
    setType: (type: string) => set({ type }),
    setOrder: (order: string) => set({ order }),
    fetchFiles: async (limit: number, offset: number) => {
        set({ isLoading: true, error: null });
        const response = await getAllUploadedFiles({
            limit,
            offset,
            orderFactor: 'ORDER_FACTOR_DESC',
        });
        const fetchedFiles = response.list || [];
        if (offset === 0) {
            set({ media: fetchedFiles })
        } else {
            set((state) => ({
                media: [...state.media, ...fetchedFiles]
            }))
        }
        set({ isLoading: false });
    },
    getSortedMedia: () => {
        const { media, type, order } = get();
        return media
            ?.filter((m) => {
                const matchType =
                    type === '' ||
                    (type === 'video' && isVideo(m.media?.fullSize?.mediaUrl)) ||
                    (type === 'image' && !isVideo(m.media?.fullSize?.mediaUrl))
                return matchType;
            })
            .sort((a, b) => {
                const aOrder = new Date(a.createdAt || 0).getTime();
                const bOrder = new Date(b.createdAt || 0).getTime();
                return order === 'asc' ? aOrder - bOrder : bOrder - aOrder;
            })
    },
}))