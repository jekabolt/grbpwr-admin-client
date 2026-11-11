import { cn } from 'lib/utility';
import { Iconoir } from '../icons/iconoir';

/**
 * The 9px pushpin toggle of the fill system (Lekalo). It marks a value (or a whole `Category`) to be
 * shown elsewhere — on the models pool, on the model's card. Off = `pinOff`, on = `ink`. The glyph
 * is 9px; the hit area is grown by an `::after` so a finger can still land on it.
 *
 * Named `PinToggle`, not `Pin`: `Pin` is already the numbered drawing pin of `Canvas`.
 */
export function PinToggle({
  pinned,
  onToggle,
  label = 'pin',
  disabled,
  className,
}: {
  pinned: boolean;
  onToggle?: () => void;
  /** Announced name: «pin chest». */
  label?: string;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <button
      type='button'
      aria-label={label}
      aria-pressed={pinned}
      title={label}
      disabled={disabled || !onToggle}
      onClick={(e) => {
        e.stopPropagation();
        onToggle?.();
      }}
      className={cn(
        "relative inline-grid size-2.25 shrink-0 cursor-pointer place-items-center after:absolute after:-inset-2 after:content-[''] focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:cursor-default",
        pinned ? 'text-ink' : 'text-pinOff hover:text-ink',
        className,
      )}
    >
      <Iconoir name='pin' strokeWidth={2.4} className='size-2.25' />
    </button>
  );
}
