import { adminService } from 'api/api';
import { create } from 'zustand';
import { DictionaryStore, SnackBarStore } from './store-types';

export const useDictionaryStore = create<DictionaryStore>((set, get) => ({
  dictionary: undefined,
  loading: false,
  error: null,
  initialized: false,
  fetchDictionary: async (bypassCache = false) => {
    if (get().initialized && !bypassCache) return;
    set({ loading: true, error: null });
    try {
      const response = await adminService.GetDictionary({});
      set({ dictionary: response.dictionary, loading: false, initialized: true });
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Failed to fetch dictionary';
      set({ error: msg, loading: false, initialized: false });
    }
  },
}));

export const useSnackBarStore = create<SnackBarStore>((set) => ({
  alerts: [],
  showMessage: (message: string, severity: 'success' | 'error') => {
    const newAlert = {
      message,
      severity,
      id: Date.now(),
    };
    set((state) => ({ alerts: [...state.alerts, newAlert] }));
  },
  closeMessage: (id: number) => {
    set((state) => ({
      alerts: state.alerts.filter((alert) => alert.id !== id),
    }));
  },
  clearAll: () => {
    set({ alerts: [] });
  },
}));
