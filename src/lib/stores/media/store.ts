import {
    deleteFiles,
    getAllUploadedFiles,
    uploadContentImage,
    uploadContentVideo
} from "api/admin";
import { common_MediaFull } from "api/proto-http/admin";
import { checkIsHttpHttpsMediaLink } from 'lib/features/checkIsHttpHttpsLink';
import { isVideo } from "lib/features/filterContentType";
import { filterExtensionToContentType } from 'lib/features/filterExtentions';
import { getBase64ImageFromUrl } from 'lib/features/getBase64';
import { useSnackBarStore } from 'lib/stores/store';
import { create } from "zustand";
import { MediaSelectorStore } from "./store-types";

function trimBeforeBase64(input: string): string {
    const parts = input.split('base64,');
    return parts.length > 1 ? parts[1] : input;
}

export const useMediaSelectorStore = create<MediaSelectorStore>((set, get) => ({
    media: [],
    filters: {
        type: '',
        order: 'desc'
    },
    uploadState: {
        url: '',
        selectedFiles: [],
        croppedImage: null,
        selectedFileUrl: '',
    },
    status: {
        isLoading: false,
        error: null
    },
    updateFilters: (filters) => set((state) => ({
        filters: { ...state.filters, ...filters }
    })),

    prepareUpload: (uploadData) => set((state) => ({
        uploadState: { ...state.uploadState, ...uploadData }
    })),

    resetUpload: () => set({
        uploadState: {
            url: '',
            selectedFiles: [],
            croppedImage: null,
            selectedFileUrl: '',
        },
        status: {
            isLoading: false,
            error: null
        }
    }),
    uploadMedia: async () => {
        const { showMessage } = useSnackBarStore.getState();
        const state = get();

        const processAndUpload = async (baseData64: string, contentType: string) => {
            try {
                if (contentType.startsWith('image')) {
                    await uploadContentImage({ rawB64Image: baseData64 });
                } else if (contentType.startsWith('video')) {
                    const raw = trimBeforeBase64(baseData64);
                    await uploadContentVideo({ raw, contentType });
                }
                showMessage('MEDIA IS UPLOADED', 'success');
                await get().fetchFiles(20, 0);
            } catch (error) {
                console.error('Upload error:', error);

                // More specific error messages
                if (contentType.startsWith('video')) {
                    throw new Error('Video upload failed. File may be too large or format not supported.');
                } else {
                    throw new Error('Image upload failed. Please try again.');
                }
            }
        };

        set({ status: { isLoading: true, error: null } });

        try {
            const { croppedImage, selectedFiles, url } = state.uploadState;

            if (croppedImage) {
                await processAndUpload(croppedImage, 'image');
            } else if (selectedFiles.length > 0) {
                const file = selectedFiles[0];
                const fileExtension = file?.name?.split('.')?.pop()?.toLowerCase();
                const contentType = filterExtensionToContentType[fileExtension || ''] || 'application/octet-stream';

                const base64 = await new Promise<string>((resolve) => {
                    const reader = new FileReader();
                    reader.onload = (event) => {
                        if (event.target?.result) {
                            resolve(event.target.result.toString());
                        }
                    };
                    reader.readAsDataURL(file);
                });

                await processAndUpload(base64, contentType);
            } else if (checkIsHttpHttpsMediaLink(url)) {
                // Extract file extension from URL
                const urlPath = new URL(url).pathname;
                const fileExtension = urlPath.split('.').pop()?.toLowerCase();
                const contentType = filterExtensionToContentType[fileExtension || ''] || 'image/jpeg';

                const baseData64 = await getBase64ImageFromUrl(url);
                await processAndUpload(baseData64, contentType);
            } else {
                throw new Error('No media to upload');
            }

            get().resetUpload();
        } catch (error: unknown) {
            showMessage('UPLOAD HAS FAILED. TRY AGAIN', 'error');
            set({
                status: {
                    isLoading: false,
                    error: error instanceof Error ? error.message : 'Unknown error'
                }
            });
        }
    },

    fetchFiles: async (limit: number, offset: number): Promise<common_MediaFull[]> => {
        set({ status: { isLoading: true, error: null } });
        try {
            const response = await getAllUploadedFiles({
                limit,
                offset,
                orderFactor: 'ORDER_FACTOR_DESC',
            });
            const fetchedFiles = response.list || [];

            set((state) => ({
                media: offset === 0 ? fetchedFiles : [...state.media, ...fetchedFiles],
                status: { isLoading: false, error: null }
            }));

            return fetchedFiles;
        } catch (error) {
            set({ status: { isLoading: false, error: 'Failed to fetch media' } });
            return [];
        }
    },

    getSortedMedia: () => {
        const { media, filters: { type, order } } = get();
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
            });
    },

    deleteFile: async (id: number | undefined) => {
        if (!id) return { success: false };

        set({ status: { isLoading: true, error: null } });
        try {
            await deleteFiles({ id });
            set(state => ({
                media: state.media.filter(file => file.id !== id),
                status: { isLoading: false, error: null }
            }));
            return { success: true };
        } catch (error) {
            set({ status: { isLoading: false, error: 'Failed to delete media' } });
            return { success: false };
        }
    },
}));
