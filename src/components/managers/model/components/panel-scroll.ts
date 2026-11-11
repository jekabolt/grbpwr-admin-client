/**
 * Scrolling of the Model Info panel: which element scrolls it, and a scroll on the system's soft
 * ease (`--ease-soft`, cubic-bezier(.22, 1, .36, 1)) — the browser's own smooth scroll has its own
 * curve, and the owner asked for one easing everywhere.
 */

export type Scroller = HTMLElement | Window;

/** The panel scrolls itself on a desktop (sticky, `overflow-y: auto`); on a phone the page does. */
export function scrollerOf(node: HTMLElement | null): Scroller {
  let el = node?.parentElement ?? null;
  while (el) {
    const { overflowY } = getComputedStyle(el);
    if ((overflowY === 'auto' || overflowY === 'scroll') && el.scrollHeight > el.clientHeight)
      return el;
    el = el.parentElement;
  }
  return window;
}

export function scrollTopOf(s: Scroller): number {
  return s instanceof Window ? s.scrollY : s.scrollTop;
}

/** The top edge of what the scroller shows, in viewport coordinates. */
export function viewTopOf(s: Scroller): number {
  return s instanceof Window ? 0 : s.getBoundingClientRect().top;
}

export function setScrollTop(s: Scroller, top: number) {
  if (s instanceof Window) s.scrollTo({ top, behavior: 'instant' });
  else s.scrollTop = top;
}

// cubic-bezier(x1, y1, x2, y2) → y(x), by Newton on x(t) (then bisection if it stalls).
function bezier(x1: number, y1: number, x2: number, y2: number) {
  const a = (p1: number, p2: number) => 1 - 3 * p2 + 3 * p1;
  const b = (p1: number, p2: number) => 3 * p2 - 6 * p1;
  const c = (p1: number) => 3 * p1;
  const at = (t: number, p1: number, p2: number) => ((a(p1, p2) * t + b(p1, p2)) * t + c(p1)) * t;
  const slope = (t: number, p1: number, p2: number) =>
    3 * a(p1, p2) * t * t + 2 * b(p1, p2) * t + c(p1);
  return (x: number) => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    let t = x;
    for (let i = 0; i < 8; i++) {
      const d = at(t, x1, x2) - x;
      const s = slope(t, x1, x2);
      if (Math.abs(d) < 1e-5) break;
      if (Math.abs(s) < 1e-6) break;
      t -= d / s;
    }
    let lo = 0;
    let hi = 1;
    for (let i = 0; i < 20 && Math.abs(at(t, x1, x2) - x) > 1e-5; i++) {
      if (at(t, x1, x2) < x) lo = t;
      else hi = t;
      t = (lo + hi) / 2;
    }
    return at(t, y1, y2);
  };
}

const SOFT = bezier(0.22, 1, 0.36, 1);

/** Scroll to `top` over `ms` on the soft ease; at once under reduced motion. */
export function softScrollTo(s: Scroller, top: number, ms = 900) {
  const from = scrollTopOf(s);
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduced || Math.abs(top - from) < 2) {
    setScrollTop(s, top);
    return;
  }
  const start = performance.now();
  const step = (now: number) => {
    const p = Math.min(1, (now - start) / ms);
    setScrollTop(s, from + (top - from) * SOFT(p));
    if (p < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}
