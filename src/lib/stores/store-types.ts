import { common_ArchiveInsert, common_Dictionary, common_FilterConditions, common_HeroFullInsert, common_MediaFull, common_Product, GetProductsPagedRequest } from "api/proto-http/admin";
import { common_ArchiveFull, common_HeroEntity, common_HeroFull } from "api/proto-http/frontend";

export interface DictionaryStore {
    dictionary: common_Dictionary | undefined;
    loading: boolean;
    error: string | null;
    initialized: boolean;
    fetchDictionary: () => Promise<void>;
}

interface Alert {
    message: string;
    severity: 'success' | 'error';
    id: number;
}

export interface SnackBarStore {
    alerts: Alert[];
    showMessage: (message: string, severity: 'success' | 'error') => void;
    closeMessage: (id: number) => void;
    clearAll: () => void;
}

export interface ProductStore {
    products: common_Product[];
    isLoading: boolean;
    hasMore: boolean;
    error: string | null;
    filter: GetProductsPagedRequest;
    setFilter: (filter: GetProductsPagedRequest) => void;
    resetFilter: () => void;
    updateFilter: (partialFilter: {
        filterConditions?: Partial<common_FilterConditions>;
        [key: string]: any;
    }) => void;
    fetchProducts: (limit: number, offset: number, filterValues?: GetProductsPagedRequest) => Promise<void>;
    setProducts: (products: common_Product[] | ((prev: common_Product[]) => common_Product[])) => void;
    appendProducts: (newProducts: common_Product[]) => void;
    clearProducts: () => void;
}

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
}

export interface HeroStore {
    hero: common_HeroFull | undefined;
    entities: common_HeroEntity[];
    fetchHero: () => Promise<void>;
    saveHero: (values: common_HeroFullInsert) => Promise<{ success: boolean, invalidUrls: string[], nonAllowedDomainUrls: string[] }>;
}