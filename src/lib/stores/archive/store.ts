import { addArchive, deleteArchive, getArchive, getArchiveItems, updateArchive } from "api/archive";
import { common_ArchiveInsert } from "api/proto-http/admin";
import { create } from "zustand";
import { ArchiveStore } from "./store-types";


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