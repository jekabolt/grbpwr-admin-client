import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type MouseEvent,
  type PointerEvent,
} from 'react';
import type { PictureView } from './step-picture-view';

const FIT: PictureView = { k: 1, x: 0, y: 0 };
const MIN = 0.1;
const MAX = 12;
/** Pointer travel (px) after which a press is a pan, not a pick. */
const SLOP = 4;
const FIELD = 'input, textarea, select, [contenteditable="true"]';
const DIALOG = '[role="dialog"], [role="alertdialog"]';
/** The canvas's own buttons keep their press: a shaky click on them never pans. */
const CANVAS_TOOLS = '[data-seam-zoom], [data-seam-pose-tools], [data-seam-layers]';

/** Zoom by f keeping the box point (px, py) still. The view has no frame: it goes anywhere. */
export function zoomAt(v: PictureView, f: number, px: number, py: number): PictureView {
  const k = Math.min(MAX, Math.max(MIN, v.k * f));
  const r = k / v.k;
  return { k, x: px - (px - v.x) * r, y: py - (py - v.y) * r };
}

export type PanPress = {
  id: number;
  button: number;
  cx: number;
  cy: number;
  x: number;
  y: number;
  /** Space or the middle button: a pan from the first pixel, even without a move. */
  forced: boolean;
  on: boolean;
};

/** The view this pointer position asks for; null while the press is still a click. */
export function panTo(p: PanPress, k: number, clientX: number, clientY: number) {
  const dx = clientX - p.cx;
  const dy = clientY - p.cy;
  if (!p.on && !p.forced && Math.hypot(dx, dy) < SLOP) return null;
  p.on = true;
  return { k, x: p.x + dx, y: p.y + dy };
}

/** The click ending this pan must not reach the edge under the pointer. */
export const panSwallowsClick = (p: PanPress) => p.button === 0 && (p.forced || p.on);

/** Two fingers or the wheel pan both ways; shift turns a vertical wheel into a horizontal one. */
export function wheelPan(v: PictureView, deltaX: number, deltaY: number, shift: boolean) {
  return {
    ...v,
    x: v.x - (shift ? deltaY : deltaX),
    y: v.y - (shift ? 0 : deltaY),
  };
}

const isFit = (v: PictureView) => v.k === 1 && v.x === 0 && v.y === 0;

/**
 * Zoom and pan over the seam picker's canvas, which always fills a fullscreen window. ⌘/ctrl + wheel
 * or a pinch zooms at the cursor; the plain wheel, Space + drag, the middle button and a drag from
 * the empty canvas pan at any zoom (none of them picks an edge). `+` `−` `0` from the keyboard.
 * Nothing holds the view: `fit` brings everything back. Any change of `resetKey` (another step)
 * fits again, and the position is never saved.
 */
export function usePictureZoom(resetKey: unknown, w: number, h: number, onFit?: () => void) {
  const [el, setEl] = useState<HTMLElement | null>(null);
  const [view, setView] = useState<PictureView>(FIT);
  const [spaceHeld, setSpaceHeld] = useState(false);
  const live = useRef({ w, h, view, onFit });
  live.current = { w, h, view, onFit };
  // Several events land between renders: each one builds on the last, not on state.
  const put = useCallback((v: PictureView) => {
    live.current.view = v;
    setView(v);
  }, []);

  useEffect(() => put(FIT), [resetKey, put]);

  useEffect(() => {
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      const v = live.current.view;
      e.preventDefault();
      if (e.ctrlKey || e.metaKey) {
        const r = el.getBoundingClientRect();
        const dy = Math.max(-300, Math.min(300, e.deltaY));
        const f = Math.exp(-dy * (e.ctrlKey && !e.metaKey ? 0.01 : 0.002));
        put(zoomAt(v, f, e.clientX - r.left, e.clientY - r.top));
        return;
      }
      put(wheelPan(v, e.deltaX, e.deltaY, e.shiftKey));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [el, put]);

  const spaceRef = useRef(false);
  useEffect(() => {
    if (!el) return;
    // Space belongs to the canvas: a focused button of this window never sees it, a field keeps
    // typing and a dialog over this window keeps its own keys.
    const mine = (e: KeyboardEvent) => {
      if (e.code !== 'Space') return false;
      const t = e.target instanceof Element ? e.target : null;
      if (!t || t.closest(FIELD)) return false;
      return t === document.body || t.closest(DIALOG) === el.closest(DIALOG);
    };
    const hold = (on: boolean) => {
      spaceRef.current = on;
      setSpaceHeld(on);
    };
    const onDown = (e: KeyboardEvent) => {
      if (!mine(e)) return;
      e.preventDefault();
      e.stopPropagation();
      hold(true);
    };
    const onUp = (e: KeyboardEvent) => {
      if (e.code !== 'Space') return;
      hold(false);
      if (!mine(e)) return;
      e.preventDefault();
      e.stopPropagation();
    };
    const onBlur = () => hold(false);
    window.addEventListener('keydown', onDown, true);
    window.addEventListener('keyup', onUp, true);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onDown, true);
      window.removeEventListener('keyup', onUp, true);
      window.removeEventListener('blur', onBlur);
    };
  }, [el]);

  const pan = useRef<PanPress | null>(null);
  const panned = useRef(false);

  const press = (e: PointerEvent<HTMLElement>, forced: boolean) => {
    const v = live.current.view;
    pan.current = {
      id: e.pointerId,
      button: e.button,
      cx: e.clientX,
      cy: e.clientY,
      x: v.x,
      y: v.y,
      forced,
      on: false,
    };
  };
  const onCanvasTool = (e: PointerEvent<HTMLElement>) =>
    e.target instanceof Element && !!e.target.closest(CANVAS_TOOLS);
  /** Space + press and the middle button come first, over every gesture of the canvas. */
  const onPointerDownCapture = (e: PointerEvent<HTMLElement>) => {
    panned.current = false;
    if (e.button !== 1 && !(e.button === 0 && spaceRef.current)) return;
    if (onCanvasTool(e)) return;
    e.preventDefault();
    e.stopPropagation();
    press(e, true);
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  /** Reached only by a press no edge or piece took: the empty canvas. */
  const onPointerDown = (e: PointerEvent<HTMLElement>) => {
    if (e.button !== 0 || pan.current || onCanvasTool(e)) return;
    press(e, false);
  };
  const onPointerMove = (e: PointerEvent<HTMLElement>) => {
    const p = pan.current;
    if (!p || p.id !== e.pointerId) return;
    const started = p.on;
    const next = panTo(p, live.current.view.k, e.clientX, e.clientY);
    if (!next) return;
    if (!started && !p.forced) e.currentTarget.setPointerCapture(e.pointerId);
    put(next);
  };
  const onPointerUp = (e: PointerEvent<HTMLElement>) => {
    const p = pan.current;
    if (!p || p.id !== e.pointerId) return;
    panned.current = panSwallowsClick(p);
    pan.current = null;
  };
  /** Swallows the click that ends a pan, so the edge under the pointer is not picked. */
  const onClickCapture = (e: MouseEvent<HTMLElement>) => {
    if (!panned.current) return;
    panned.current = false;
    e.stopPropagation();
    e.preventDefault();
  };
  /** The browser's own middle-button scroll stays out. */
  const onMouseDown = (e: MouseEvent<HTMLElement>) => {
    if (e.button === 1) e.preventDefault();
  };

  const step = (f: number) => {
    const { w: bw, h: bh, view: v } = live.current;
    put(zoomAt(v, f, bw / 2, bh / 2));
  };
  const fit = () => {
    live.current.onFit?.();
    put(FIT);
  };

  /** `+` / `−` / `0`; true when the key was a zoom key. */
  const onKey = (key: string) => {
    if (key === '+' || key === '=') step(1.5);
    else if (key === '-' || key === '_') step(1 / 1.5);
    else if (key === '0') fit();
    else return false;
    return true;
  };

  return {
    ref: setEl,
    view,
    moved: !isFit(view),
    spaceHeld,
    zoomIn: () => step(1.5),
    zoomOut: () => step(1 / 1.5),
    fit,
    onKey,
    handlers: {
      onPointerDownCapture,
      onPointerDown,
      onPointerMove,
      onPointerUp,
      onPointerCancel: onPointerUp,
      onClickCapture,
      onMouseDown,
    },
  };
}
