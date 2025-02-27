import { common_MediaFull } from "api/proto-http/admin";

export interface MediaSelectorStore {
    // State
    media: any[]; // Update with your media type
    filters: {
        type: string;
        order: string;
    };
    uploadState: {
        url: string;
        selectedFiles: File[];
        croppedImage: string | null;
        selectedFileUrl: string;
    };
    status: {
        isLoading: boolean;
        error: string | null;
    };

    updateFilters: (filters: Partial<MediaSelectorStore['filters']>) => void;
    prepareUpload: (uploadData: Partial<MediaSelectorStore['uploadState']>) => void;
    resetUpload: () => void;
    uploadMedia: () => Promise<void>;
    fetchFiles: (limit: number, offset: number) => Promise<common_MediaFull[]>;
    getSortedMedia: () => any[];
    deleteFile: (id: number | undefined) => Promise<{ success: boolean }>;
}