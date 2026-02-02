import { Alert, Snackbar } from '@mui/material';
import { useSnackBarStore } from 'lib/stores/store';

export function SnackBar() {
  const { alerts, closeMessage } = useSnackBarStore();

  return (
    <>
      {alerts.map((alert, index) => (
        <Snackbar
          key={alert.id}
          open={true}
          autoHideDuration={6000}
          onClose={() => closeMessage(alert.id)}
          anchorOrigin={{
            vertical: 'bottom',
            horizontal: 'left',
          }}
          style={{
            bottom: `${index * 60 + 20}px`,
          }}
        >
          <Alert severity={alert.severity} onClose={() => closeMessage(alert.id)}>
            {(alert.message ?? '').toUpperCase()}
          </Alert>
        </Snackbar>
      ))}
    </>
  );
}
