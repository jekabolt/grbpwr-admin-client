import { common_MediaFull } from "api/proto-http/admin";

export interface MediaSelectorStore {
    media: common_MediaFull[];
    type: string;
    order: string;
    isLoading: boolean;
    error: string | null;
    fetchFiles: (limit: number, offset: number) => Promise<void>;
    setType: (type: string) => void;
    setOrder: (order: string) => void;
    getSortedMedia: () => common_MediaFull[];
    deleteFile: (id: number | undefined) => Promise<{ success: boolean }>;
}