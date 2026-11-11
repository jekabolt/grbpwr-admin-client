import { type ReactNode, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

import { cn } from 'lib/utility';

/** Wheel travel (px) that makes one step. */
const WHEEL_STEP = 60;
/** Swipe travel (px) that makes one step. */
const SWIPE_STEP = 40;
/** A step's animation: further wheel is ignored until it lands (matches `duration-900`). */
const STEP_MS = 900;

export type StepRowMetrics = {
  /** Items that fit the window whole. */
  visible: number;
  /** The last index the row can step to (the end of the track is in the window). */
  max: number;
};

function typingTarget(target: EventTarget | null) {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable ||
      target.matches('input, textarea, select, [role="combobox"], [role="slider"]'))
  );
}

function overlayOpen() {
  return !!document.querySelector('[role="dialog"], [data-radix-popper-content-wrapper]');
}

/**
 * A row of equal items in an `overflow:hidden` window whose track moves by WHOLE items (Lekalo
 * «smooth scroll»): `transform` over 900ms on the soft ease, never a native scrollbar. Steps come
 * from the wheel / trackpad over the row (deltaX or deltaY accumulated, one step per ~60px, the rest
 * ignored while a step animates), a horizontal swipe, and — with `keyboard` — ← → on the page when
 * focus is not in a field. `prefers-reduced-motion` drops the transition.
 *
 * Controlled: the caller keeps `index` (so its own prev / next buttons and filters can move it) and
 * learns the geometry from `onMetrics`. `onNearEnd` fires as the steps come within `nearEnd` items of
 * the end — the place to load the next page.
 */
export function StepRow({
  index,
  onIndexChange,
  onMetrics,
  onNearEnd,
  nearEnd = 3,
  keyboard,
  label,
  className,
  trackClassName,
  children,
}: {
  index: number;
  onIndexChange: (next: number) => void;
  onMetrics?: (metrics: StepRowMetrics) => void;
  onNearEnd?: () => void;
  nearEnd?: number;
  keyboard?: boolean;
  /** Announced name of the row: «models». */
  label: string;
  className?: string;
  /** The gap between items belongs here (`gap-2`). */
  trackClassName?: string;
  children: ReactNode;
}) {
  const win = useRef<HTMLDivElement>(null);
  const track = useRef<HTMLDivElement>(null);
  const [geo, setGeo] = useState({ step: 0, visible: 1, max: 0, count: 0 });
  const wheel = useRef({ acc: 0, lock: 0 });
  const touch = useRef<{ x: number; y: number } | null>(null);

  const measure = useCallback(() => {
    const w = win.current;
    const t = track.current;
    const first = t?.firstElementChild as HTMLElement | null;
    if (!w || !t || !first) return;
    const gap = parseFloat(getComputedStyle(t).columnGap) || 0;
    const step = first.offsetWidth + gap;
    const count = t.childElementCount;
    const visible = Math.max(1, Math.floor((w.clientWidth + gap) / step));
    // As far as the last item needs to come fully into the window.
    const max = Math.max(0, Math.ceil((count * step - gap - w.clientWidth) / step));
    setGeo((g) =>
      g.step === step && g.visible === visible && g.max === max && g.count === count
        ? g
        : { step, visible, max, count },
    );
  }, []);

  useLayoutEffect(() => {
    measure();
    const w = win.current;
    const t = track.current;
    if (!w || !t) return;
    const observer = new ResizeObserver(measure);
    observer.observe(w);
    observer.observe(t);
    return () => observer.disconnect();
  }, [measure]);

  useEffect(() => {
    onMetrics?.({ visible: geo.visible, max: geo.max });
  }, [geo.visible, geo.max, onMetrics]);

  // The row shrank (a filter, a resize): stay inside it.
  useEffect(() => {
    if (index > geo.max) onIndexChange(geo.max);
  }, [index, geo.max, onIndexChange]);

  useEffect(() => {
    if (onNearEnd && geo.count > 0 && index + geo.visible >= geo.count - nearEnd) onNearEnd();
  }, [index, geo.visible, geo.count, nearEnd, onNearEnd]);

  const go = useCallback(
    (dir: 1 | -1) => {
      const next = Math.min(geo.max, Math.max(0, index + dir));
      if (next !== index) onIndexChange(next);
      return next !== index;
    },
    [geo.max, index, onIndexChange],
  );

  // Wheel / trackpad: a native, non-passive listener, so the page does not scroll under a step.
  useEffect(() => {
    const w = win.current;
    if (!w) return;
    const onWheel = (e: WheelEvent) => {
      const d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
      // Sideways over an inner pager (a card's photos) pages that instead.
      const inner = (e.target as HTMLElement).closest<HTMLElement>('[data-step-row-inner]');
      if (
        inner &&
        Math.abs(e.deltaX) > Math.abs(e.deltaY) &&
        inner.scrollWidth > inner.clientWidth + 2
      )
        return;
      const canGo = d > 0 ? index < geo.max : index > 0;
      const now = Date.now();
      if (!canGo && now >= wheel.current.lock) return; // at the end: let the page scroll
      e.preventDefault();
      if (now < wheel.current.lock) return;
      wheel.current.acc += d;
      if (Math.abs(wheel.current.acc) >= WHEEL_STEP) {
        go(wheel.current.acc > 0 ? 1 : -1);
        wheel.current = { acc: 0, lock: now + STEP_MS };
      }
    };
    w.addEventListener('wheel', onWheel, { passive: false });
    return () => w.removeEventListener('wheel', onWheel);
  }, [go, index, geo.max]);

  useEffect(() => {
    if (!keyboard) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      if (e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return;
      if (typingTarget(e.target) || overlayOpen()) return;
      e.preventDefault();
      go(e.key === 'ArrowLeft' ? -1 : 1);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [keyboard, go]);

  return (
    <div
      ref={win}
      role='region'
      aria-label={label}
      aria-roledescription='carousel'
      onTouchStart={(e) => {
        const t = e.touches[0];
        touch.current = t ? { x: t.clientX, y: t.clientY } : null;
      }}
      onTouchEnd={(e) => {
        const start = touch.current;
        const t = e.changedTouches[0];
        touch.current = null;
        if (!start || !t) return;
        const dx = t.clientX - start.x;
        if (Math.abs(dx) >= SWIPE_STEP && Math.abs(dx) > Math.abs(t.clientY - start.y))
          go(dx < 0 ? 1 : -1);
      }}
      className={cn('touch-pan-y overflow-hidden', className)}
    >
      <div
        ref={track}
        className={cn(
          'flex transition-transform duration-900 ease-soft will-change-transform motion-reduce:transition-none',
          trackClassName,
        )}
        style={{ transform: `translateX(${-index * geo.step}px)` }}
      >
        {children}
      </div>
    </div>
  );
}
