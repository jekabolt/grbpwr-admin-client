import { cn } from 'lib/utility';
import type { JSX } from 'react';

/**
 * ═══ A PICTURE THAT IS BEING WORKED ON — SAID ON THE PICTURE ITSELF (owner, 07.10) ════════════════
 *
 * Owner: «надо показывать как-то визуально что идет некая загрузка» (the flat input tray, where a
 * dropped picture waits for its label) and «когда нажали — какую-то анимацию показывать на
 * картинке, что фон удаляется» (`remove bg` on the moodboard).
 *
 * Two kinds, one layer, two different motions — so the two never read as the same thing:
 *   `read` — the picture is being READ: a pale veil and one ink scan line that sweeps top → bottom
 *            (a band of paper behind it), 1.8 s a pass, again and again.
 *   `cut`  — the BACKGROUND IS BEING REMOVED: a transparency checker (paper / hairline grey) wipes
 *            across the picture left → right behind a 1px ink edge, holds, fades back; 2.4 s a pass.
 *
 * Compositor-only (transform and opacity, `global.css` → `.picture-busy`). Under reduced motion
 * nothing moves: the veil or a half checker stays still and one nano word says what is going on.
 * The layer is absolute over the frame and transparent to the pointer — corners and badges stay
 * above it and pressable.
 */
export type PictureBusyKind = 'read' | 'cut';

const STILL_WORD: Record<PictureBusyKind, string> = {
  read: 'reading',
  cut: 'removing bg',
};

export function PictureBusy({
  kind,
  className,
}: {
  kind: PictureBusyKind;
  className?: string;
}): JSX.Element {
  return (
    <span aria-hidden data-picture-busy={kind} className={cn('picture-busy', className)}>
      {kind === 'read' ? (
        <span className='picture-busy-scan' />
      ) : (
        <span className='picture-busy-wipe'>
          <span className='picture-busy-checker' />
        </span>
      )}
      {/* Reduced motion only: a still layer alone would not say that anything is happening. */}
      <span className='absolute inset-x-0 bottom-1 hidden justify-center motion-reduce:flex'>
        <span className='bg-textColor px-1 py-px text-nano uppercase leading-none tracking-label text-bgColor'>
          {STILL_WORD[kind]}
        </span>
      </span>
    </span>
  );
}
