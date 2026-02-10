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
