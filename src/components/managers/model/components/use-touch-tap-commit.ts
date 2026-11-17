import { useRef, type MouseEvent, type PointerEvent } from 'react';

const TOUCH_TAP_SLOP_PX = 10;
const TOUCH_CLICK_DEDUPE_MS = 1_000;

/**
 * A touch tap on a checkbox row commits on `pointerup`, not on the compatibility `click`.
 *
 * Chromium makes that `click` from its own tap gesture, and it drops the gesture tap that lands
 * right after a fast touch drag ends (fling tap suppression): the drag across the mannequin
 * canvas just above leaves the next tap on `edit pose` with pointer events but no click. The
 * row's own pointer events always arrive, so the tap is committed there, and the click that
 * normally follows (on the control, or forwarded by the label) is cancelled once. Mouse, pen and
 * keyboard keep the plain click path. Same rule as `ViewSwitch` (#412).
 */
export function useTouchTapCommitV1(onTap: () => void) {
  const active = useRef<{ pointerId: number; x: number; y: number; moved: boolean } | null>(null);
  const committedAt = useRef<number | null>(null);

  return {
    onPointerDown: (event: PointerEvent<HTMLElement>) => {
      if (event.pointerType !== 'touch') return;
      active.current = {
        pointerId: event.pointerId,
        x: event.clientX,
        y: event.clientY,
        moved: false,
      };
    },
    onPointerMove: (event: PointerEvent<HTMLElement>) => {
      const tap = active.current;
      if (event.pointerType !== 'touch' || !tap || tap.pointerId !== event.pointerId) return;
      if (Math.hypot(event.clientX - tap.x, event.clientY - tap.y) > TOUCH_TAP_SLOP_PX) {
        tap.moved = true;
      }
    },
    onPointerCancel: (event: PointerEvent<HTMLElement>) => {
      if (active.current?.pointerId === event.pointerId) active.current = null;
    },
    onPointerUp: (event: PointerEvent<HTMLElement>) => {
      if (event.pointerType !== 'touch') return;
      const tap = active.current;
      active.current = null;
      if (!tap || tap.pointerId !== event.pointerId || tap.moved) return;
      const control = event.currentTarget.querySelector('button');
      if (control?.disabled) return;
      committedAt.current = event.timeStamp;
      onTap();
    },
    onClickCapture: (event: MouseEvent<HTMLElement>) => {
      // Radix re-announces the new state with a plain `Event('click')` on its hidden form input;
      // that one is not a user click and must neither be cancelled nor spend the dedupe.
      if (!(event.nativeEvent instanceof MouseEvent)) return;
      const at = committedAt.current;
      if (at === null) return;
      committedAt.current = null;
      if (event.timeStamp - at > TOUCH_CLICK_DEDUPE_MS) return;
      // Already committed on pointerup: cancel this click's toggle (and the label's forwarding).
      event.preventDefault();
    },
  };
}
