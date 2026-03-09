import { useSnackBarStore } from 'lib/stores/store';
import { cn } from 'lib/utility';
import { useEffect } from 'react';

const TOAST_DURATION = 6000;

export function SnackBar() {
  const { alerts, closeMessage } = useSnackBarStore();

  return (
    <div
      className='fixed bottom-5 left-5 z-[100] flex max-h-screen w-80 flex-col-reverse gap-2'
      aria-label='Notifications'
    >
      {alerts.map((alert) => (
        <ToastItem
          key={alert.id}
          alert={alert}
          onClose={() => closeMessage(alert.id)}
        />
      ))}
    </div>
  );
}

function ToastItem({
  alert,
  onClose,
}: {
  alert: { id: number; message?: string; severity: 'success' | 'error' };
  onClose: () => void;
}) {
  useEffect(() => {
    const timer = setTimeout(onClose, TOAST_DURATION);
    return () => clearTimeout(timer);
  }, [onClose]);

  return (
    <div
      role='status'
      className={cn(
        'flex items-center gap-3 rounded border px-4 py-3 shadow-lg',
        alert.severity === 'error'
          ? 'border-red-500/50 bg-red-950/90 text-red-100'
          : 'border-green-500/50 bg-green-950/90 text-green-100',
      )}
    >
      <span className='uppercase flex-1'>{alert.message ?? ''}</span>
      <button
        type='button'
        onClick={onClose}
        className='rounded p-1 hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-white/30'
        aria-label='Dismiss'
      >
        ×
      </button>
    </div>
  );
}
