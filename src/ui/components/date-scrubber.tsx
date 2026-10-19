import { cn } from 'lib/utility';
import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { useMonthIndex, type ScrubMonth } from '../hooks/use-month-index';
import { Drawer } from './drawer';

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

/** «oct 2026»: three letters keep the pill width steady while the month rolls. */
export function scrubLabel(year: number, month: number) {
  return `${MONTHS[month - 1] ?? '—'} ${year}`;
}

const PILL_H = 28;
const GUTTER = 8; // pill travel stops this far from the viewport's top and bottom
const EDGE = 6; // pill's distance from the right edge
const GRAB_SHIFT = 64; // grabbed pill slides left so the thumb does not cover the date
const HIDE_AFTER_SCROLL = 1200;
const HIDE_AFTER_DRAG = 1600;
const TAP_PX = 5;
const TAP_MS = 300;

const SPRING = 'opacity .3s, transform .45s cubic-bezier(.25, 1.6, .5, 1)';
const GRAB_EASE = 'opacity .3s, transform .2s ease-out';

const COARSE = '(pointer: coarse)';
function subscribeCoarse(cb: () => void) {
  const mq = window.matchMedia(COARSE);
  mq.addEventListener('change', cb);
  return () => mq.removeEventListener('change', cb);
}
const isCoarse = () => window.matchMedia(COARSE).matches;
const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const vibrate = (ms: number) => {
  try {
    navigator.vibrate?.(ms);
  } catch {
    // iOS has no vibration; silence is the intended fallback
  }
};

function isDocumentScroller(el: HTMLElement) {
  return (
    el === document.scrollingElement || el === document.documentElement || el === document.body
  );
}

/** Visible band of the scroller in viewport coordinates. */
function viewportOf(el: HTMLElement, insetTop: number, insetBottom: number) {
  const width = document.documentElement.clientWidth;
  if (isDocumentScroller(el)) {
    return { top: insetTop, bottom: window.innerHeight - insetBottom, right: width };
  }
  const r = el.getBoundingClientRect();
  return {
    top: Math.max(0, r.top) + insetTop,
    bottom: Math.min(window.innerHeight, r.bottom) - insetBottom,
    right: Math.min(width, r.right),
  };
}

/**
 * Origin and width of the box a `position: fixed` child of `host` is laid out in. A transformed
 * ancestor (the centred modal) captures fixed children, so the viewport is not always the box.
 */
function fixedBox(host: HTMLElement) {
  for (let n: HTMLElement | null = host; n && n !== document.body; n = n.parentElement) {
    const cs = getComputedStyle(n);
    if (cs.transform !== 'none' || cs.filter !== 'none' || cs.perspective !== 'none') {
      const r = n.getBoundingClientRect();
      return { x: r.left + n.clientLeft, y: r.top + n.clientTop, width: n.clientWidth };
    }
  }
  return { x: 0, y: 0, width: document.documentElement.clientWidth };
}

export interface DateScrubberProps {
  /** The element that scrolls. The page itself works too (`document.scrollingElement`). */
  scrollEl: HTMLElement | null;
  /** Months newest first, `month` 1–12. Drives the sheet and the jump offsets. */
  months: ScrubMonth[];
  /** Month of the item under the top of the viewport at this scrollTop. */
  labelAt: (scrollTop: number) => { year: number; month: number } | null;
  /** scrollTop that puts the item at this list offset at the top of the viewport. */
  offsetToScrollTop: (itemOffset: number) => number;
  /** Sheet tap, before the scroll: lets the list fetch the page it is about to show. */
  onJump?: (year: number, month: number) => void;
  /** Client-only filters are on: the pill still dates the view, but the sheet stays shut. */
  disabledJump?: boolean;
  /** True while the pill is held: hold heavy loads (thumbnails) until it is let go. */
  onDragStateChange?: (dragging: boolean) => void;
  /** Sticky chrome over the scroller (px) the pill must not travel under. */
  insetTop?: number;
  insetBottom?: number;
}

/**
 * Date pill that is the scroll handle (touch only). It rides the right edge in proportion to the
 * scroll position, shows the month at the top of the viewport, and fades when scrolling stops.
 * Grab it: it slides left out from under the thumb and drags the list proportionally; let go:
 * it springs back. Tap it: a sheet of months with counts, tap a month to jump to its first item.
 * Desktop keeps the native scrollbar, so on a fine pointer this renders nothing.
 */
export function DateScrubber(props: DateScrubberProps) {
  const coarse = useSyncExternalStore(subscribeCoarse, isCoarse, () => false);
  if (!coarse || !props.scrollEl) return null;
  return <Scrubber {...props} scrollEl={props.scrollEl} />;
}

function Scrubber({
  scrollEl,
  months,
  labelAt,
  offsetToScrollTop,
  onJump,
  disabledJump = false,
  onDragStateChange,
  insetTop = 0,
  insetBottom = 0,
}: DateScrubberProps & { scrollEl: HTMLElement }) {
  const index = useMonthIndex(months);
  // Inside a modal the pill must live in the dialog: a tap outside it would dismiss the modal.
  const host = scrollEl.closest<HTMLElement>('[role="dialog"]') ?? document.body;
  const pillRef = useRef<HTMLButtonElement>(null);
  const rollRef = useRef<HTMLSpanElement>(null);
  const [sheet, setSheet] = useState<{ year: number; month: number } | null>(null);
  const sheetOpen = sheet !== null;

  // Latest props for the imperative handlers, which are bound once per scroller.
  const live = useRef({
    labelAt,
    onDragStateChange,
    disabledJump,
    insetTop,
    insetBottom,
    sheetOpen,
  });
  live.current = { labelAt, onDragStateChange, disabledJump, insetTop, insetBottom, sheetOpen };

  // Imperative state: scroll and drag update the DOM directly, never through a React render.
  const s = useRef({
    on: false,
    grab: false,
    dragging: false,
    hideT: 0,
    cur: '',
    shown: '',
    swapping: false,
    dir: 1,
    lastTop: 0,
    grabDy: 0,
    downY: 0,
    downT: 0,
    moved: false,
  }).current;

  const paint = () => {
    const pill = pillRef.current;
    if (!pill) return;
    const still = reducedMotion();
    pill.style.opacity = s.on ? '1' : '0';
    pill.style.pointerEvents = s.on ? 'auto' : 'none';
    pill.style.transform = !s.on
      ? 'translateX(14px)'
      : s.grab
        ? `translateX(-${GRAB_SHIFT}px) scale(1.12)`
        : 'none';
    pill.style.transition = still ? 'none' : s.on && s.grab ? GRAB_EASE : SPRING;
    pill.style.boxShadow = s.on && s.grab ? '0 6px 18px #0004' : 'none';
    pill.style.cursor = s.grab ? 'grabbing' : 'grab';
  };

  const show = (delay = HIDE_AFTER_SCROLL) => {
    s.on = true;
    paint();
    window.clearTimeout(s.hideT);
    if (!s.dragging && !live.current.sheetOpen) {
      s.hideT = window.setTimeout(() => {
        s.on = false;
        paint();
      }, delay);
    }
  };

  // One date at a time: the old one fades out (0.09 s), then the new one fades in (0.14 s).
  // A fast scrub only retargets the incoming text, so intermediate months are skipped.
  const setLabel = (txt: string, dir: number) => {
    const roll = rollRef.current;
    if (!roll || txt === s.cur) return;
    s.cur = txt;
    s.dir = dir;
    if (!s.shown || reducedMotion()) {
      roll.textContent = s.shown = txt;
      return;
    }
    if (s.swapping) return;
    s.swapping = true;
    roll.style.transition = 'opacity .09s ease-in, transform .09s ease-in';
    roll.style.opacity = '0';
    roll.style.transform = `translateY(${s.dir > 0 ? -5 : 5}px)`;
    window.setTimeout(() => {
      roll.textContent = s.shown = s.cur;
      roll.style.transition = 'none';
      roll.style.transform = `translateY(${s.dir > 0 ? 5 : -5}px)`;
      void roll.offsetHeight; // commit the start position before animating in
      roll.style.transition = 'opacity .14s ease-out, transform .14s ease-out';
      roll.style.opacity = '1';
      roll.style.transform = 'none';
      window.setTimeout(() => {
        s.swapping = false;
        if (s.shown !== s.cur) {
          const next = s.cur;
          s.cur = s.shown;
          setLabel(next, s.dir);
        }
      }, 140);
    }, 90);
  };

  const travel = () => {
    const { insetTop: it, insetBottom: ib } = live.current;
    const v = viewportOf(scrollEl, it, ib);
    return { v, min: v.top + GUTTER, max: Math.max(v.top + GUTTER, v.bottom - PILL_H - GUTTER) };
  };

  /** Reposition + relabel; false when there is nothing to scroll. */
  const update = () => {
    const pill = pillRef.current;
    if (!pill) return false;
    const room = scrollEl.scrollHeight - scrollEl.clientHeight;
    if (room <= 0) return false;
    const top = scrollEl.scrollTop;
    const { v, min, max } = travel();
    const box = fixedBox(host);
    pill.style.right = `${box.x + box.width - v.right + EDGE}px`;
    if (!s.dragging) {
      pill.style.top = `${min + (Math.min(top, room) / room) * (max - min) - box.y}px`;
    }
    const before = s.cur;
    const at = live.current.labelAt(top);
    if (at) setLabel(scrubLabel(at.year, at.month), top >= s.lastTop ? 1 : -1);
    // haptic tick on every month boundary while scrubbing (Android; iOS stays silent)
    if (s.dragging && before && before !== s.cur) vibrate(8);
    s.lastTop = top;
    return true;
  };

  useLayoutEffect(() => {
    paint();
    update();
    const target: HTMLElement | Window = isDocumentScroller(scrollEl) ? window : scrollEl;
    const onScroll = () => {
      if (update()) show();
    };
    const onResize = () => update();
    target.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onResize);
    return () => {
      target.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onResize);
      window.clearTimeout(s.hideT);
      if (s.dragging) {
        s.dragging = false;
        live.current.onDragStateChange?.(false);
      }
    };
    // Handlers read live props through refs; rebinding is only needed for a new scroller.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scrollEl]);

  // Months arrive after the first paint: relabel without flashing the pill.
  useEffect(() => {
    update();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [months, labelAt]);

  const onPointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (live.current.sheetOpen) return;
    s.dragging = true;
    s.moved = false;
    s.downY = e.clientY;
    s.downT = Date.now();
    s.grabDy = e.clientY - e.currentTarget.getBoundingClientRect().top;
    s.grab = true;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // pointer already gone (cancelled before the handler ran): the drag ends on pointerup
    }
    show();
    vibrate(10);
    live.current.onDragStateChange?.(true);
    e.preventDefault();
  };

  const onPointerMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (!s.dragging) return;
    if (Math.abs(e.clientY - s.downY) > TAP_PX) s.moved = true;
    const { min, max } = travel();
    const top = Math.min(max, Math.max(min, e.clientY - s.grabDy));
    e.currentTarget.style.top = `${top - fixedBox(host).y}px`;
    const room = scrollEl.scrollHeight - scrollEl.clientHeight;
    scrollEl.scrollTop = max > min ? ((top - min) / (max - min)) * room : 0;
  };

  const openSheet = () => {
    const at = live.current.labelAt(scrollEl.scrollTop);
    window.clearTimeout(s.hideT);
    setSheet(at ?? { year: 0, month: 0 });
  };

  const release = () => {
    if (!s.dragging) return;
    s.dragging = false;
    s.grab = false;
    live.current.onDragStateChange?.(false);
    const tap = !s.moved && Date.now() - s.downT < TAP_MS;
    if (tap && !live.current.disabledJump && index.total > 0) {
      paint();
      openSheet();
      return;
    }
    show(HIDE_AFTER_DRAG);
  };

  const closeSheet = () => {
    setSheet(null);
    live.current.sheetOpen = false;
    show();
  };

  const jump = (year: number, month: number) => {
    const offset = index.offsetOf(year, month);
    closeSheet();
    if (offset === null) return;
    onJump?.(year, month);
    scrollEl.scrollTop = offsetToScrollTop(offset);
  };

  const counts = new Map(months.map((m) => [`${m.year}-${m.month}`, m.count]));
  const years = [...new Set(months.map((m) => m.year))].sort((a, b) => b - a);

  return (
    <>
      {createPortal(
        <button
          ref={pillRef}
          type='button'
          aria-label='jump to month'
          className='fixed top-0 z-[var(--z-dock)] flex h-7 touch-none flex-col overflow-hidden bg-textColor px-2.5 py-[5px] text-control tracking-label text-bgColor tabular-nums select-none'
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={release}
          onPointerCancel={release}
          onClick={(e) => {
            // keyboard activation only; touch taps are handled on pointerup
            if (e.detail === 0 && !disabledJump && index.total > 0) openSheet();
          }}
        >
          <span
            ref={rollRef}
            className='leading-[18px] whitespace-nowrap text-right will-change-[opacity,transform]'
          />
        </button>,
        host,
      )}
      <Drawer
        side='bottom'
        open={sheetOpen}
        onOpenChange={(o) => !o && closeSheet()}
        title={sheet && sheet.year ? scrubLabel(sheet.year, sheet.month) : '—'}
      >
        {years.map((year) => (
          <div key={year}>
            <div className='pt-2.5 pb-1 text-micro tracking-label text-labelColor tabular-nums'>
              {year}
            </div>
            <div className='grid grid-cols-4'>
              {MONTHS.map((name, i) => {
                const month = i + 1;
                const count = counts.get(`${year}-${month}`) ?? 0;
                const cur = sheet?.year === year && sheet.month === month;
                return (
                  <button
                    key={name}
                    type='button'
                    disabled={count === 0}
                    onClick={() => jump(year, month)}
                    className={cn(
                      '-mr-px -mb-px grid gap-0.5 border border-hairline px-1 py-2 text-left text-control',
                      cur ? 'bg-textColor text-bgColor' : 'bg-bgColor text-textColor',
                      'disabled:text-borderColor',
                    )}
                  >
                    {name}
                    <small
                      className={cn(
                        'text-micro tabular-nums',
                        cur ? 'text-borderColor' : 'text-labelColor',
                      )}
                    >
                      {count || '—'}
                    </small>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </Drawer>
    </>
  );
}
