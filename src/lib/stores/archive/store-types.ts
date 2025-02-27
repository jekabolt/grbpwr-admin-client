import { common_ArchiveInsert } from "api/proto-http/admin";
import { common_ArchiveFull } from "api/proto-http/frontend";

export interface ArchiveStore {
    archives: common_ArchiveFull[];
    archiveItems: common_ArchiveFull | undefined;
    isLoading: boolean;
    hasMore: boolean;
    error: string | null;
    clearArchiveItems: () => void;
    fetchArchives: (limit: number, offset: number) => Promise<void>;
    fetchArchiveItems: (id: number | undefined) => Promise<void>;
    addArchive: (archiveInsert: common_ArchiveInsert) => Promise<void>;
    updateArchive: (id: number, archiveInsert: common_ArchiveInsert) => Promise<void>;
    deleteArchive: (id: number | undefined) => Promise<void>;
}