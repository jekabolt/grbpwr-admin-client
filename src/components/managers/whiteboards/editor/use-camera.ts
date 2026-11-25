import type { PointerEvent, RefObject } from 'react';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  Camera,
  Point,
  Size,
  fitBounds,
  panBy,
  wheelZoomFactor,
  zoomAt,
  zoomStop,
} from '../model/camera';

export type Tool = 'select' | 'hand';

/** True while the key goes to a text field: shortcuts must not eat the title's letters. */
function typing(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  return el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName);
}

/**
 * The viewport's camera and every gesture that moves it. The camera lives in state because PR 01
 * draws nothing but the grid; once objects exist they are memoised on their own data and read the
 * camera only through the world layer's single transform, so a pan never re-renders them.
 */
export function useCamera(viewport: RefObject<HTMLDivElement | null>) {
  const [size, setSize] = useState<Size>({ width: 0, height: 0 });
  const [camera, setCamera] = useState<Camera>({ x: 0, y: 0, zoom: 1 });
  const [tool, setTool] = useState<Tool>('select');
  const [spaceHeld, setSpaceHeld] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [cursor, setCursor] = useState<Point | null>(null);
  const placed = useRef(false);
  const drag = useRef<{ id: number; last: Point } | null>(null);

  // Size: the first measurement places the origin in the middle; later ones keep the camera.
  useLayoutEffect(() => {
    const el = viewport.current;
    if (!el) return;
    const measure = () => {
      const next = { width: el.clientWidth, height: el.clientHeight };
      setSize(next);
      if (!placed.current && next.width > 0) {
        placed.current = true;
        setCamera(fitBounds(null, next));
      }
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [viewport]);

  const local = useCallback(
    (clientX: number, clientY: number): Point => {
      const r = viewport.current?.getBoundingClientRect();
      return { x: clientX - (r?.left ?? 0), y: clientY - (r?.top ?? 0) };
    },
    [viewport],
  );

  // Wheel: React's onWheel is passive, and a passive listener cannot stop the page from
  // zooming on pinch — hence the native listener. ⌘/Ctrl + wheel (and trackpad pinch, which the
  // browser reports as ctrl + wheel) zooms under the cursor; a plain wheel or two-finger swipe pans.
  useEffect(() => {
    const el = viewport.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      if (e.ctrlKey || e.metaKey) {
        const anchor = local(e.clientX, e.clientY);
        const factor = wheelZoomFactor(e.deltaY, e.deltaMode);
        setCamera((c) => zoomAt(c, anchor, c.zoom * factor));
        return;
      }
      const k = e.deltaMode === 1 ? 16 : 1;
      // Shift + wheel on a mouse means «sideways», as everywhere else on the web.
      const dx = e.shiftKey && !e.deltaX ? e.deltaY : e.deltaX;
      const dy = e.shiftKey && !e.deltaX ? 0 : e.deltaY;
      setCamera((c) => panBy(c, -dx * k, -dy * k));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [viewport, local]);

  const center = useCallback((): Point => ({ x: size.width / 2, y: size.height / 2 }), [size]);
  const zoomStep = useCallback(
    (dir: 1 | -1) => setCamera((c) => zoomAt(c, center(), zoomStop(c.zoom, dir))),
    [center],
  );
  const zoomTo = useCallback(
    (zoom: number) => setCamera((c) => zoomAt(c, center(), zoom)),
    [center],
  );
  // No objects yet, so «fit» is «back to the origin at 100%»; PR 02 passes the content bounds.
  const fit = useCallback(() => setCamera(fitBounds(null, size)), [size]);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (typing(e.target)) return;
      if (e.code === 'Space') {
        // Without this the page scrolls and a focused button presses itself.
        e.preventDefault();
        if (!e.repeat) setSpaceHeld(true);
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.shiftKey && e.code === 'Digit1') return void (e.preventDefault(), fit());
      if (e.shiftKey && e.code === 'Digit0') return void (e.preventDefault(), zoomTo(1));
      if (e.shiftKey) return;
      if (e.code === 'KeyV') setTool('select');
      if (e.code === 'KeyH') setTool('hand');
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === 'Space') setSpaceHeld(false);
    };
    // A held Space must not outlive the window losing focus (⌘Tab mid-pan).
    const blur = () => setSpaceHeld(false);
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', blur);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', blur);
    };
  }, [fit, zoomTo]);

  const panning = tool === 'hand' || spaceHeld;

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    // The middle button pans with any tool, as in every canvas editor.
    if (!(panning && e.button === 0) && e.button !== 1) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { id: e.pointerId, last: { x: e.clientX, y: e.clientY } };
    setDragging(true);
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    setCursor(local(e.clientX, e.clientY));
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    const dx = e.clientX - d.last.x;
    const dy = e.clientY - d.last.y;
    d.last = { x: e.clientX, y: e.clientY };
    setCamera((c) => panBy(c, dx, dy));
  };
  const endDrag = (e: PointerEvent<HTMLDivElement>) => {
    if (drag.current?.id !== e.pointerId) return;
    drag.current = null;
    setDragging(false);
  };

  return {
    size,
    camera,
    tool,
    setTool,
    panning,
    dragging,
    cursor,
    zoomStep,
    zoomTo,
    fit,
    handlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp: endDrag,
      onPointerCancel: endDrag,
      onPointerLeave: () => setCursor(null),
    },
  };
}
