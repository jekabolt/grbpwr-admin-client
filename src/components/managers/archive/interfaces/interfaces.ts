import { common_ArchiveFull } from "api/proto-http/frontend";

export interface ArchiveModalInterface {
    id?: number | undefined;
    open: boolean;
    media: string;
    title: string;
    url: string;
    isEditMode?: boolean;
    close?: () => void;
    setTitle: (value: string) => void;
    setUrl: (value: string) => void;
    addNewItem?: (id?: number | undefined) => void;
}

export interface ListArchiveInterface {
    archive: common_ArchiveFull[];
    setArchive: React.Dispatch<React.SetStateAction<common_ArchiveFull[]>>;
    deleteArchiveFromList: (id: number | undefined) => void
    deleteItemFromArchive: (archiveId: number | undefined, itemId: number | undefined) => void;
    updateArchiveInformation: (archiveId: number | undefined, items: common_ArchiveFull) => void
}