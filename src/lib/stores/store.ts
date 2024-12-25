
import { getDictionary } from "api/admin";
import { create } from "zustand";
import { DictionaryStore } from "./store-types";

export const useDictionaryStore = create<DictionaryStore>((set, get) => ({
    dictionary: undefined,
    loading: false,
    error: null,
    initialized: false,
    fetchDictionary: async () => {
        if (get().initialized || get().loading) return;
        set({ loading: true, error: null })
        try {
            const response = await getDictionary({})
            set({ dictionary: response.dictionary, loading: false, initialized: true })
        } catch (error) {
            set({ error: 'Failed to fetch dictionary', loading: false, initialized: false })
        }
    }
}))