import { create } from 'zustand';
import { AlertAction, SnackBarStore } from './store-types';

export const useSnackBarStore = create<SnackBarStore>((set) => ({
  alerts: [],
  showMessage: (message: string, severity: 'success' | 'error', action?: AlertAction) => {
    const newAlert = {
      message,
      severity,
      id: Date.now(),
      action,
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
