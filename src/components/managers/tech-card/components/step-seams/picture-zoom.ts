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
const MAX = 12;
/** Pointer travel (px) after which a press is a pan, not a pick. */
const SLOP = 4;

/** The picture never leaves the box: at k the zoomed frame [x, x + w·k] still covers [0, w]. */
function clampView(v: PictureView, w: number, h: number): PictureView {
  const k = Math.min(MAX, Math.max(1, v.k));
  if (k === 1) return FIT;
  return {
    k,
    x: Math.min(0, Math.max(w * (1 - k), v.x)),
    y: Math.min(0, Math.max(h * (1 - k), v.y)),
  };
}

/** Zoom by f keeping the box point (px, py) still. */
function zoomAt(v: PictureView, f: number, px: number, py: number, w: number, h: number) {
  const k = Math.min(MAX, Math.max(1, v.k * f));
  const r = k / v.k;
  return clampView({ k, x: px - (px - v.x) * r, y: py - (py - v.y) * r }, w, h);
}

/**
 * Zoom and pan over the seam picker's canvas. ⌘/ctrl + wheel or a pinch zooms at the cursor; once
 * zoomed, the plain wheel and a drag pan (a drag never picks an edge). `+` `−` `0` from the keyboard.
 * Unzoomed, the wheel stays the page's. Any change of `resetKey` (another step) fits again.
 */
export function usePictureZoom(w: number, h: number, resetKey: unknown) {
  const [el, setEl] = useState<HTMLElement | null>(null);
  const [view, setView] = useState<PictureView>(FIT);
  const live = useRef({ w, h, view });
  live.current = { w, h, view };

  useEffect(() => setView(FIT), [resetKey]);
  useEffect(() => setView((v) => clampView(v, w, h)), [w, h]);

  useEffect(() => {
    if (!el) return;
    // Several wheel events land between renders: each one builds on the last, not on state.
    const put = (v: PictureView) => {
      live.current.view = v;
      setView(v);
    };
    const onWheel = (e: WheelEvent) => {
      const { w: bw, h: bh, view: v } = live.current;
      const r = el.getBoundingClientRect();
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const dy = Math.max(-300, Math.min(300, e.deltaY));
        const f = Math.exp(-dy * (e.ctrlKey && !e.metaKey ? 0.01 : 0.002));
        put(zoomAt(v, f, e.clientX - r.left, e.clientY - r.top, bw, bh));
        return;
      }
      if (v.k === 1) return;
      e.preventDefault();
      const dx = e.shiftKey ? e.deltaY : e.deltaX;
      const dy = e.shiftKey ? 0 : e.deltaY;
      put(clampView({ ...v, x: v.x - dx, y: v.y - dy }, bw, bh));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [el]);

  const pan = useRef<{
    id: number;
    cx: number;
    cy: number;
    x: number;
    y: number;
    on: boolean;
  } | null>(null);
  const panned = useRef(false);

  const onPointerDown = (e: PointerEvent<HTMLElement>) => {
    if (view.k === 1 || e.button !== 0) return;
    pan.current = {
      id: e.pointerId,
      cx: e.clientX,
      cy: e.clientY,
      x: view.x,
      y: view.y,
      on: false,
    };
  };
  const onPointerMove = (e: PointerEvent<HTMLElement>) => {
    const p = pan.current;
    if (!p || p.id !== e.pointerId) return;
    const dx = e.clientX - p.cx;
    const dy = e.clientY - p.cy;
    if (!p.on) {
      if (Math.hypot(dx, dy) < SLOP) return;
      p.on = true;
      e.currentTarget.setPointerCapture(e.pointerId);
    }
    setView((v) => clampView({ ...v, x: p.x + dx, y: p.y + dy }, w, h));
  };
  const onPointerUp = (e: PointerEvent<HTMLElement>) => {
    const p = pan.current;
    if (!p || p.id !== e.pointerId) return;
    panned.current = p.on;
    pan.current = null;
  };
  /** Swallows the click that ends a pan, so the edge under the pointer is not picked. */
  const onClickCapture = (e: MouseEvent<HTMLElement>) => {
    if (!panned.current) return;
    panned.current = false;
    e.stopPropagation();
    e.preventDefault();
  };

  const step = useCallback((f: number) => setView((v) => zoomAt(v, f, w / 2, h / 2, w, h)), [w, h]);
  const fit = useCallback(() => setView(FIT), []);

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
    zoomed: view.k > 1,
    zoomIn: () => step(1.5),
    zoomOut: () => step(1 / 1.5),
    fit,
    onKey,
    handlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp,
      onPointerCancel: onPointerUp,
      onClickCapture,
    },
  };
}
