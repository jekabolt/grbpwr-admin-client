import { common_Dictionary } from "api/proto-http/admin";

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