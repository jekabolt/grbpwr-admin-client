import { common_Dictionary } from "api/proto-http/admin";

export interface DictionaryStore {
    dictionary: common_Dictionary | undefined;
    loading: boolean;
    error: string | null;
    initialized: boolean;
    fetchDictionary: () => Promise<void>;
}