import { useSnackBarStore } from 'lib/stores/store';
import { cn } from 'lib/utility';
import { useEffect } from 'react';

const TOAST_DURATION = 6000;
// A toast carrying an action ("view", "undo", …) stays longer — the user needs time to notice and
// click it before it self-dismisses.
const TOAST_DURATION_WITH_ACTION = 12000;

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
  alert: {
    id: number;
    message?: string;
    severity: 'success' | 'error';
    action?: { label: string; onClick: () => void };
  };
  onClose: () => void;
}) {
  useEffect(() => {
    const timer = setTimeout(onClose, alert.action ? TOAST_DURATION_WITH_ACTION : TOAST_DURATION);
    return () => clearTimeout(timer);
  }, [onClose, alert.action]);

  return (
    <div
      role='status'
      // Reference bar: ink ground, white text, MICRO — a toast is a footnote about what just
      // happened, not a headline. It carries whole field paths ("costing.cmtCost — required"), so
      // at body size a two-clause message wraps to three lines and reads as an error page.
      className='flex items-center gap-3 rounded-none border border-textColor bg-textColor px-4 py-3 text-micro text-bgColor'
    >
      <span
        className={cn(
          'shrink-0 font-bold uppercase',
          alert.severity === 'error' ? 'text-error' : 'text-success',
        )}
      >
        {alert.severity === 'error' ? 'error' : 'ok'}
      </span>
      {/* The ERROR / OK label is a label and stays uppercase; the message is the one part of a toast
          that is arbitrary-length prose — a server sentence naming what is still referenced and what
          to do about it. Set in caps, that arrived as a 250-character wall nobody reads. */}
      <span className='flex-1'>{alert.message ?? ''}</span>
      {alert.action ? (
        <button
          type='button'
          onClick={() => {
            alert.action?.onClick();
            onClose();
          }}
          className='shrink-0 rounded-none font-bold uppercase underline underline-offset-2 transition-opacity hover:opacity-70'
        >
          {alert.action.label}
        </button>
      ) : null}
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
