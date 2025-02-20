import { deleteFiles, getAllUploadedFiles } from "api/admin";
import { isVideo } from "features/utilitty/filterContentType";
import { create } from "zustand";
import { MediaSelectorStore } from "./store-types";


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
    deleteFile: async (id: number | undefined) => {
        if (!id) return { success: false };
        set({ isLoading: true });
        try {
            await deleteFiles({ id });
            set(state => ({
                media: state.media.filter(file => file.id !== id),
                isLoading: false
            }));
            return { success: true };
        } catch (error) {
            set({ isLoading: false, error: 'Failed to delete media' });
            return { success: false };
        }
    },
}))
