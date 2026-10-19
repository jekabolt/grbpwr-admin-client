import { markToastBeingRead, useSnackBarStore } from 'lib/stores/store';
import { NotifySev, Toast } from 'lib/stores/store-types';
import { cn } from 'lib/utility';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Close } from 'ui';

const TOAST_MS: Record<NotifySev, number | null> = { ok: 3000, warn: 8000, error: 8000, job: null };
const TOAST_MS_WITH_ACTION = 12000;

const SEV_WORD: Record<NotifySev, string> = {
  ok: 'done',
  warn: 'partly failed',
  error: 'failed',
  job: 'in progress',
};
const GLYPH: Record<Exclude<NotifySev, 'job'>, string> = { ok: '✓', warn: '⚠', error: '⊗' };

const isBad = (sev: NotifySev) => sev === 'error' || sev === 'warn';

/** Range intersection, not `anchorNode`: a page-wide select-all covers the row too. */
function selectionCovers(sel: Selection | null, row: Element): boolean {
  if (!sel || sel.isCollapsed) return false;
  for (let i = 0; i < sel.rangeCount; i += 1) {
    if (sel.getRangeAt(i).intersectsNode(row)) return true;
  }
  return false;
}

/**
 * One inverted block. Phone: only the newest row, which carries the border so a swipe moves it all.
 * Newest first by reversing the array, not `flex-col-reverse`: DOM order = reading order.
 * Hover holds expiring timers; a toast born under a parked cursor is not being read.
 */
export function SnackBar() {
  const toasts = useSnackBarStore((s) => s.toasts);
  const dismissAll = useSnackBarStore((s) => s.dismissAllToasts);
  const columnRef = useRef<HTMLElement>(null);
  /** `performance.now()` of the last mouse move, the column appearing, `dismiss all` appearing. */
  const clock = useRef({ move: 0, shown: 0, door: 0, n: 0 });
  const [held, setHeld] = useState(false);
  const n = toasts.length;

  useEffect(() => {
    const c = clock.current;
    const now = performance.now();
    if (n > 0 && c.n === 0) c.shown = now;
    if (n > 1 && c.n < 2) c.door = now;
    c.n = n;
    if (n === 0) {
      markToastBeingRead(null);
      setHeld(false);
    }
  }, [n]);

  const live = n > 0;
  useEffect(() => {
    if (!live) return;
    const onMove = (e: PointerEvent) => {
      if (e.pointerType === 'mouse') clock.current.move = performance.now();
    };
    window.addEventListener('pointermove', onMove, { passive: true });
    return () => window.removeEventListener('pointermove', onMove);
  }, [live]);

  /* pointerleave is lost when the hovered row is removed; re-ask while held. */
  useEffect(() => {
    if (!held) return;
    const timer = window.setInterval(() => {
      if (!columnRef.current?.matches(':hover')) setHeld(false);
    }, 500);
    return () => window.clearInterval(timer);
  }, [held]);

  const reading = useCallback(() => {
    const c = clock.current;
    return c.move > c.shown && !!columnRef.current?.matches(':hover');
  }, []);
  const hold = useCallback(() => setHeld(true), []);

  if (n === 0) return null;

  return (
    <aside
      ref={columnRef}
      data-toasts=''
      aria-label='Notifications'
      onPointerLeave={() => {
        markToastBeingRead(null);
        setHeld(false);
      }}
      className='fixed bottom-[calc(var(--dock-bottom-h,0rem)+1.25rem)] left-5 z-[var(--z-toast)] flex w-80 flex-col rounded-none border border-bgColor/40 bg-textColor max-md:right-2 max-md:border-0 max-md:bg-transparent max-md:bottom-[calc(max(var(--dock-bottom-h,0rem),env(safe-area-inset-bottom))+0.5rem)] max-md:left-2 max-md:w-auto'
    >
      {[...toasts].reverse().map((toast, i) => (
        <ToastRow
          key={toast.id}
          toast={toast}
          first={i === 0}
          more={i === 0 ? n - 1 : 0}
          held={held}
          reading={reading}
          hold={hold}
        />
      ))}
      {n > 1 ? (
        <button
          type='button'
          data-toast-clear=''
          onClick={(e) => {
            /* It can appear under a resting cursor: only an aimed mouse click or a key clears. */
            if (e.detail > 0 && clock.current.move < clock.current.door) return;
            dismissAll();
          }}
          className='flex w-full shrink-0 items-center border-t border-bgColor/20 px-3 py-1 text-micro uppercase tracking-label text-bgColor transition-colors hover:bg-bgColor hover:text-textColor focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-bgColor max-md:hidden'
        >
          dismiss all
        </button>
      ) : null}
    </aside>
  );
}

function ToastRow({
  toast,
  first,
  more,
  held,
  reading,
  hold,
}: {
  toast: Toast;
  /** The newest row: the only one shown on a phone. */
  first: boolean;
  /** How many more are waiting behind it (phone counter). */
  more: number;
  held: boolean;
  reading: () => boolean;
  hold: () => void;
}) {
  /* From the store, not a parent closure: a fresh callback would restart every timer. */
  const dismiss = useSnackBarStore((s) => s.dismissToast);
  const { id, nonce, sev, subject, text, bad, detail, action, count, progress } = toast;
  const hasAction = Boolean(action);

  useEffect(() => {
    const ms = sev === 'job' ? null : hasAction ? TOAST_MS_WITH_ACTION : TOAST_MS[sev];
    if (ms === null || held) return;
    const timer = window.setTimeout(() => (reading() ? hold() : dismiss(id)), ms);
    return () => window.clearTimeout(timer);
    /* `nonce`: a repeat or an update restarts the clock. */
  }, [dismiss, id, nonce, sev, hasAction, held, reading, hold]);

  /* Swipe: touch and pen only; a mouse drag is a text selection. */
  const drag = useRef<{ pointer: number; x: number; off: number; moved: boolean } | null>(null);
  const swiped = useRef(false);
  const [dx, setDx] = useState(0);
  const [dragging, setDragging] = useState(false);

  const head = subject || text;
  const second = bad ? (
    <span className='text-error'>{bad}</span>
  ) : detail ? (
    <span className='text-bgColor/65'>{detail}</span>
  ) : null;
  /* No subject and no result (a `showMessage` error): the problem is the first line. */
  const twoLines = Boolean(head && second);

  return (
    <div
      data-toast=''
      data-toast-id={id}
      data-toast-sev={sev}
      data-toast-count={count}
      role={isBad(sev) ? 'alert' : 'status'}
      /* A click dismisses, unless it ends a selection on the row: selecting is copying. */
      onClick={(e) => {
        if (swiped.current || selectionCovers(window.getSelection(), e.currentTarget)) return;
        dismiss(id);
      }}
      onPointerDown={(e) => {
        swiped.current = false;
        if (e.pointerType === 'mouse' || (e.target as Element).closest('button')) return;
        drag.current = { pointer: e.pointerId, x: e.clientX, off: 0, moved: false };
      }}
      onPointerMove={(e) => {
        if (e.pointerType === 'mouse') {
          markToastBeingRead(id);
          return;
        }
        const d = drag.current;
        if (!d || d.pointer !== e.pointerId) return;
        d.off = e.clientX - d.x;
        if (!d.moved) {
          if (Math.abs(d.off) < 8) return;
          d.moved = true;
          swiped.current = true;
          e.currentTarget.setPointerCapture(e.pointerId);
          setDragging(true);
        }
        setDx(d.off);
      }}
      onPointerUp={(e) => {
        const d = drag.current;
        drag.current = null;
        if (!d?.moved) return;
        setDragging(false);
        const width = e.currentTarget.offsetWidth;
        if (Math.abs(d.off) > width / 4) {
          setDx(Math.sign(d.off) * width);
          window.setTimeout(() => dismiss(id), 150);
        } else {
          setDx(0);
        }
      }}
      onPointerCancel={() => {
        drag.current = null;
        setDragging(false);
        setDx(0);
      }}
      style={
        dx ? { translate: `${dx}px 0`, opacity: Math.max(0.3, 1 - Math.abs(dx) / 240) } : undefined
      }
      className={cn(
        'flex shrink-0 cursor-pointer touch-pan-y items-start gap-2.5 bg-textColor py-2 pr-2.5 pl-3 text-textBaseSize text-bgColor md:text-control max-md:border max-md:border-bgColor/40 max-md:px-3 max-md:py-2.5',
        'translate-y-0 transition-[opacity,translate] duration-150 ease-out starting:translate-y-1 starting:opacity-0 motion-reduce:transition-none',
        !first && 'border-t border-bgColor/20 max-md:hidden',
        dragging && 'transition-none',
      )}
    >
      {/* ✓ stays white: green #0f7a34 on ink is 3.85:1, below AA; red #ff0000 on ink is 5.25:1. */}
      <span
        aria-hidden='true'
        className={cn(
          'flex h-4 w-3.5 shrink-0 items-center justify-center font-bold',
          isBad(sev) && 'text-error',
        )}
      >
        {sev === 'job' ? (
          <span className='size-2.5 animate-spin border-2 border-current border-r-transparent motion-reduce:animate-none' />
        ) : (
          GLYPH[sev]
        )}
      </span>
      <span className='sr-only'>{SEV_WORD[sev]}</span>

      <div className='flex min-w-0 flex-1 flex-col gap-0.5'>
        <div className='break-words leading-4'>
          {head ? (
            <>
              {subject ? (
                <b className='mr-1.5 text-micro font-bold uppercase tracking-label'>{subject}</b>
              ) : null}
              {text}
            </>
          ) : (
            second
          )}
          {count > 1 ? <span className='tabular-nums text-bgColor/65'>{` ×${count}`}</span> : null}
          {more > 0 ? (
            <span className='ml-2 border border-bgColor/40 px-1 text-micro font-bold tabular-nums md:hidden'>
              {`+${more}`}
            </span>
          ) : null}
        </div>
        {twoLines ? <div className='break-words leading-4'>{second}</div> : null}
        {sev === 'job' ? (
          <div aria-hidden='true' className='relative mt-1 h-0.5 overflow-hidden bg-bgColor/20'>
            {progress === undefined ? (
              <span className='absolute inset-y-0 left-0 w-1/3 animate-[toastShuttle_1.2s_linear_infinite] bg-bgColor motion-reduce:animate-none' />
            ) : (
              <span
                className='absolute inset-0 origin-left bg-bgColor transition-transform duration-300 ease-out motion-reduce:transition-none'
                style={{ transform: `scaleX(${Math.min(1, Math.max(0, progress))})` }}
              />
            )}
          </div>
        ) : null}
      </div>

      <div
        className={
          twoLines
            ? 'flex shrink-0 flex-col items-end justify-between gap-1 self-stretch'
            : 'flex shrink-0 flex-row-reverse items-center gap-2'
        }
      >
        <Close
          size='sm'
          data-toast-close=''
          aria-label='dismiss'
          onClick={(e) => {
            e.stopPropagation();
            dismiss(id);
          }}
          className='text-bgColor hover:no-underline hover:opacity-70 focus-visible:-outline-offset-2 focus-visible:!outline-bgColor'
        />
        {action ? (
          <button
            type='button'
            data-toast-action=''
            onClick={(e) => {
              e.stopPropagation();
              action.onClick();
              dismiss(id);
            }}
            className='relative shrink-0 px-0.5 text-micro font-bold uppercase tracking-label underline underline-offset-2 transition-opacity hover:opacity-70 focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-bgColor'
          >
            {action.label}
          </button>
        ) : null}
      </div>
    </div>
  );
}
