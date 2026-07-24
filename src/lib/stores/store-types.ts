// An optional one-shot action rendered as a button inside the toast (e.g. "view" on "Entry #12
// posted"). Kept as a plain label+callback pair — navigation, modal-opening etc. stay the caller's
// concern; the snackbar only invokes and dismisses.
export interface AlertAction {
  label: string;
  onClick: () => void;
}

interface Alert {
  message: string;
  severity: 'success' | 'error';
  id: number;
  action?: AlertAction;
}

export interface SnackBarStore {
  alerts: Alert[];
  showMessage: (message: string, severity: 'success' | 'error', action?: AlertAction) => void;
  closeMessage: (id: number) => void;
  clearAll: () => void;
}
