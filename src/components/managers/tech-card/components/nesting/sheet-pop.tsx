// HTML controls pinned to a point of the sheet drawing. They live OUTSIDE the svg, in its
// positioned wrapper: a foreignObject with scaled HTML inside is not drawn by every browser
// (WebKit loses it), and the mode chips then simply are not there (owner, 13.11).
import { useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

export function SheetPop({
  x,
  y,
  dx = 0,
  dy = 0,
  children,
}: {
  /** The anchor, in the coordinates of the place this is rendered at. */
  x: number;
  y: number;
  /** Screen px from the anchor. */
  dx?: number;
  dy?: number;
  children: React.ReactNode;
}) {
  const ref = useRef<SVGGElement | null>(null);
  const [host, setHost] = useState<HTMLElement | null>(null);
  const [at, setAt] = useState<{ left: number; top: number } | null>(null);
  // Every render: the drawing pans and zooms by re-rendering, and the anchor moves with it.
  useLayoutEffect(() => {
    const g = ref.current;
    const parent = g?.ownerSVGElement?.parentElement;
    const m = g?.getScreenCTM();
    if (!parent || !m) return;
    const r = parent.getBoundingClientRect();
    const left = m.a * x + m.c * y + m.e - r.left + dx;
    const top = m.b * x + m.d * y + m.f - r.top + dy;
    setHost(parent);
    // Panned off the sheet: not drawn over whatever stands next to it.
    if (left < 0 || top < 0 || left > r.width || top > r.height) return setAt(null);
    setAt((p) =>
      p && Math.abs(p.left - left) < 0.5 && Math.abs(p.top - top) < 0.5 ? p : { left, top },
    );
  });
  return (
    <g ref={ref}>
      {host &&
        at &&
        createPortal(
          <div
            className='absolute z-10'
            style={{ left: at.left, top: at.top }}
            onPointerDown={(e) => e.stopPropagation()}
          >
            {children}
          </div>,
          host,
        )}
    </g>
  );
}
