import { useSnackBarStore } from 'lib/stores/store';
import { cn } from 'lib/utility';
import { useEffect } from 'react';

const TOAST_DURATION = 6000;

export function SnackBar() {
  const { alerts, closeMessage } = useSnackBarStore();

  return (
    <div
      className='fixed bottom-5 left-5 z-[var(--z-toast)] flex max-h-screen w-80 flex-col-reverse gap-2'
      aria-label='Notifications'
    >
      {alerts.map((alert) => (
        <ToastItem key={alert.id} alert={alert} onClose={() => closeMessage(alert.id)} />
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
      className='flex items-center gap-3 rounded-none border border-textColor bg-textColor px-4 py-3 text-bgColor'
    >
      <span
        className={cn(
          'shrink-0 font-bold uppercase',
          alert.severity === 'error' ? 'text-error' : 'text-success',
        )}
      >
        {alert.severity === 'error' ? 'error' : 'ok'}
      </span>
      <span className='flex-1 uppercase'>{alert.message ?? ''}</span>
      <button
        type='button'
        onClick={onClose}
        className='rounded-none p-1 transition-opacity hover:opacity-70 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bgColor'
        aria-label='Dismiss'
      >
        ×
      </button>
    </div>
  );
}
