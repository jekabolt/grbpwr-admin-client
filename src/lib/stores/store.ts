import { create } from 'zustand';
import { SnackBarStore } from './store-types';

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
