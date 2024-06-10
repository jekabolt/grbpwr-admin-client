import { common_ArchiveFull } from "api/proto-http/frontend";

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
    setArchive: React.Dispatch<React.SetStateAction<common_ArchiveFull[]>>;
    deleteArchiveFromList: (id: number | undefined) => void
}