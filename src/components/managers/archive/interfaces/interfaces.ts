import { common_ArchiveFull, common_ArchiveItemInsert } from "api/proto-http/admin";

export interface ArchiveModalInterface {
    open: boolean;
    media: string;
    close: () => void;
    title: string;
    url: string;
    setTitle: (value: string) => void;
    setUrl: (value: string) => void;
    addNewItem: (id?: number | undefined) => void;
    id?: number | undefined;
}

export interface createArchives {
    fetchArchive: (limit: number, offset: number) => void;
    showMessage: (message: string, severity: 'success' | 'error') => void;
}

export interface listArchive {
    archive: common_ArchiveFull[];
    deleteArchive: (id: number | undefined) => void;
    deleteItem: (id: number | undefined) => void;
    newItemToArchive: (id: number | undefined, newItem: common_ArchiveItemInsert[]) => void;
    showMessage: (message: string, severity: 'success' | 'error') => void;
    updateArchiveInformation: (
        id: number | undefined,
        heading: string | undefined,
        description: string | undefined,
    ) => void;
}