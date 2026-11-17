// The wizard's drawing surface: an SVG over the sheet in mm, with the SAME gesture grammar as the
// piece-match sheet (nesting/piece-sheet.tsx) — wheel zooms at the cursor, drag pans, a click
// under the drag slop is a pick, double click returns to the whole sheet. PieceSheet itself is
// bound to PieceDTO (parsed DXF pieces); the wizard draws IR polylines, seeds and lassos, so the
// gesture code is repeated here rather than bent into that component.
//
// Y is flipped in the numbers (`vy`), not by a group transform, for the reason PieceSheet gives:
// a transform would mirror every label too.
import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { BoxMm, PtMm } from 'lib/pattern-import/types';
import { cn } from 'lib/utility';

export type ViewBox = { x: number; y: number; w: number; h: number };
export type ViewTool = 'pan' | 'point' | 'lasso' | 'move';
export type ViewModifiers = Readonly<{ shiftKey: boolean }>;

export const vy = (y: number) => -y;
export const ptsAttr = (pts: readonly PtMm[]) => pts.map((p) => `${p.x},${vy(p.y)}`).join(' ');
export function f32Attr(a: Float32Array) {
  let s = '';
  for (let i = 0; i < a.length; i += 2) s += `${a[i]},${-a[i + 1]} `;
  return s;
}

// Ink ramp of the sheet — the same greys the piece-match sheet and the marker editor use; red is
// kept for "broken", blue for "needs a human" (DESIGN.md colour semantics).
export const SHEET_INK = {
  source: '#b8b8b8',
  ink: '#111111',
  mut: '#8a8a8a',
  fill: '#f2f2f2',
  pick: '#e0e0e0',
  red: '#c22222',
  blue: '#2323ff',
  green: '#0f7a34',
} as const;

const DRAG_SLOP = 4;
const MAX_ZOOM_OUT_FACTOR = 8;
const MAX_ZOOM_IN_FACTOR = 400;
const FALLBACK_VIEWPORT_WIDTH_PX = 700;

export function clampSheetViewportWidth(nextWidth: number, fitWidth: number): number {
  const safeFit = Number.isFinite(fitWidth) && fitWidth > 0 ? fitWidth : 1;
  const safeNext = Number.isFinite(nextWidth) && nextWidth > 0 ? nextWidth : safeFit;
  return Math.min(safeFit * MAX_ZOOM_OUT_FACTOR, Math.max(safeFit / MAX_ZOOM_IN_FACTOR, safeNext));
}

/**
 * Expands (never crops or distorts) a CAD viewBox to the live canvas aspect ratio. Keeping the
 * SVG and viewBox ratios equal removes the inert letterbox bands which otherwise look like part
 * of the work surface but cannot be converted to millimetres.
 */
export function fitSheetViewportBoxToAspect(
  box: ViewBox,
  viewportWidthPx: number,
  viewportHeightPx: number,
): ViewBox {
  if (
    !Number.isFinite(viewportWidthPx) ||
    !Number.isFinite(viewportHeightPx) ||
    viewportWidthPx <= 0 ||
    viewportHeightPx <= 0
  )
    return box;
  const viewportAspect = viewportWidthPx / viewportHeightPx;
  const boxAspect = box.w / box.h;
  if (Math.abs(viewportAspect - boxAspect) < 1e-9) return box;
  if (viewportAspect > boxAspect) {
    const width = box.h * viewportAspect;
    return { ...box, x: box.x - (width - box.w) / 2, w: width };
  }
  const height = box.w / viewportAspect;
  return { ...box, y: box.y - (height - box.h) / 2, h: height };
}

export function resolveSheetViewportUnit(boxWidthMm: number, viewportWidthPx: number): number {
  const safeBoxWidth = Number.isFinite(boxWidthMm) && boxWidthMm > 0 ? boxWidthMm : 1;
  const safeViewportWidth =
    Number.isFinite(viewportWidthPx) && viewportWidthPx > 0
      ? viewportWidthPx
      : FALLBACK_VIEWPORT_WIDTH_PX;
  return safeBoxWidth / safeViewportWidth;
}

export function SheetViewport({
  bbox,
  tool = 'pan',
  onPick,
  onPoint,
  onLasso,
  onMove,
  className,
  children,
  focus,
  reveal,
  fitRequest = 0,
}: {
  bbox: BoxMm;
  tool?: ViewTool;
  /** Pointer released without dragging. Lasso clicks include the existing sheet-space point. */
  onPick?: (key: string, modifiers: ViewModifiers & Readonly<{ pointMm?: PtMm }>) => void;
  /** 'point' tool: a click on the sheet, in mm. */
  onPoint?: (pt: PtMm) => void;
  /** 'lasso' tool: the closed polygon the operator drew, in mm. */
  onLasso?: (pts: PtMm[], modifiers: ViewModifiers) => void;
  /** 'move' tool: incremental, finite millimetre delta for the keyed SVG element being dragged. */
  onMove?: (key: string, deltaMm: PtMm, modifiers: ViewModifiers) => void;
  className?: string;
  /** Zoom to this box when it changes (e.g. the selected piece). null = leave the view alone. */
  focus?: BoxMm | null;
  /**
   * Bring this box into view without zooming (a hovered tile's outline): the view pans only when
   * the box is off-screen, and fits it when it is larger than the view. null = leave it alone.
   */
  reveal?: BoxMm | null;
  /** Reset to the complete fitted sheet whenever this caller-owned request changes. */
  fitRequest?: number;
  children: (v: { box: ViewBox; unit: number }) => ReactNode;
}) {
  const rawFit = boxOf(bbox, 0.03);
  const [view, setView] = useState<ViewBox | null>(null);
  const [viewportSize, setViewportSize] = useState<Readonly<{
    width: number;
    height: number;
  }> | null>(null);
  const fit = fitSheetViewportBoxToAspect(
    rawFit,
    viewportSize?.width ?? 0,
    viewportSize?.height ?? 0,
  );
  const box = fitSheetViewportBoxToAspect(
    view ?? fit,
    viewportSize?.width ?? 0,
    viewportSize?.height ?? 0,
  );
  const svgRef = useRef<SVGSVGElement | null>(null);
  const gesture = useRef<{
    px: number;
    py: number;
    box: ViewBox;
    key: string;
    moved: boolean;
    shiftKey: boolean;
    lastPx: number;
    lastPy: number;
  } | null>(null);
  const [panning, setPanning] = useState(false);
  const [lasso, setLassoState] = useState<PtMm[] | null>(null);
  // The ref is what pointerup reads: events can arrive faster than renders, and a closure over
  // the state would end the lasso a few points short (or empty).
  const lassoRef = useRef<PtMm[] | null>(null);
  const setLasso = (v: PtMm[] | null) => {
    lassoRef.current = v;
    setLassoState(v);
  };

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const measure = () => {
      const rect = svg.getBoundingClientRect();
      if (!(rect.width > 0) || !(rect.height > 0)) return;
      setViewportSize((current) =>
        current?.width === rect.width && current.height === rect.height
          ? current
          : Object.freeze({ width: rect.width, height: rect.height }),
      );
    };
    measure();
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', measure);
      return () => window.removeEventListener('resize', measure);
    }
    const observer = new ResizeObserver(measure);
    observer.observe(svg);
    return () => observer.disconnect();
  }, []);

  const focusKey = focus ? `${focus.minX}|${focus.minY}|${focus.maxX}|${focus.maxY}` : '';
  useEffect(() => {
    if (focus) setView(boxOf(focus, 0.25));
    // focusKey stands for `focus`: a new object with the same numbers must not re-zoom.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusKey]);

  const revealKey = reveal ? `${reveal.minX}|${reveal.minY}|${reveal.maxX}|${reveal.maxY}` : '';
  useEffect(() => {
    if (!reveal) return;
    setView((v) => {
      const b = v ?? fit;
      const r = boxOf(reveal, 0);
      if (r.x >= b.x && r.y >= b.y && r.x + r.w <= b.x + b.w && r.y + r.h <= b.y + b.h) return v;
      if (r.w > b.w || r.h > b.h) return boxOf(reveal, 0.25);
      return { ...b, x: r.x + r.w / 2 - b.w / 2, y: r.y + r.h / 2 - b.h / 2 };
    });
    // revealKey stands for `reveal` (same numbers, no pan)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revealKey]);

  useEffect(() => {
    if (fitRequest > 0) setView(null);
  }, [fitRequest]);

  const metricsOf = (b: ViewBox) => {
    const svg = svgRef.current;
    if (!svg) return null;
    const r = svg.getBoundingClientRect();
    if (!r.width || !r.height) return null;
    const scale = Math.min(r.width / b.w, r.height / b.h);
    return {
      scale,
      padX: (r.width - b.w * scale) / 2,
      padY: (r.height - b.h * scale) / 2,
      rect: r,
    };
  };
  const toMm = (clientX: number, clientY: number, b: ViewBox): PtMm | null => {
    const m = metricsOf(b);
    if (!m) return null;
    const x = b.x + (clientX - m.rect.left - m.padX) / m.scale;
    const ysvg = b.y + (clientY - m.rect.top - m.padY) / m.scale;
    return { x, y: -ysvg };
  };

  // Non-passive wheel (React's root listener is passive and cannot preventDefault).
  const boxRef = useRef(box);
  boxRef.current = box;
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.deltaY) return;
      e.preventDefault();
      const b = boxRef.current;
      const m = metricsOf(b);
      if (!m) return;
      const at = {
        x: b.x + (e.clientX - m.rect.left - m.padX) / m.scale,
        y: b.y + (e.clientY - m.rect.top - m.padY) / m.scale,
      };
      const factor = e.deltaY > 0 ? 1.15 : 1 / 1.15;
      const w = clampSheetViewportWidth(b.w * factor, fit.w);
      const k = w / b.w;
      setView({ x: at.x - (at.x - b.x) * k, y: at.y - (at.y - b.y) * k, w, h: b.h * k });
    };
    svg.addEventListener('wheel', onWheel, { passive: false });
    return () => svg.removeEventListener('wheel', onWheel);
    // fit changes only with bbox
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fit.w]);

  const end = () => {
    gesture.current = null;
    setPanning(false);
  };

  const unit = resolveSheetViewportUnit(box.w, viewportSize?.width ?? FALLBACK_VIEWPORT_WIDTH_PX);
  const cursor =
    tool === 'lasso'
      ? 'cursor-crosshair'
      : tool === 'point'
        ? 'cursor-cell'
        : tool === 'move'
          ? 'cursor-move'
          : panning
            ? 'cursor-grabbing'
            : 'cursor-grab';

  return (
    <svg
      ref={svgRef}
      xmlns='http://www.w3.org/2000/svg'
      viewBox={`${box.x} ${box.y} ${box.w} ${box.h}`}
      preserveAspectRatio='xMidYMid meet'
      data-sheet-viewport=''
      data-sheet-viewport-unit={unit}
      fontFamily='monospace'
      className={cn('block h-full w-full touch-none select-none bg-bgColor', cursor, className)}
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        const key = (e.target as Element).closest?.('[data-key]')?.getAttribute('data-key') ?? '';
        if (tool === 'lasso') {
          const p = toMm(e.clientX, e.clientY, box);
          if (p) setLasso([p]);
        }
        gesture.current = {
          px: e.clientX,
          py: e.clientY,
          box,
          key,
          moved: false,
          shiftKey: e.shiftKey,
          lastPx: e.clientX,
          lastPy: e.clientY,
        };
        e.currentTarget.setPointerCapture(e.pointerId);
      }}
      onPointerMove={(e) => {
        const st = gesture.current;
        if (!st) return;
        if (tool === 'lasso') {
          const p = toMm(e.clientX, e.clientY, st.box);
          if (p) setLasso([...(lassoRef.current ?? []), p]);
          st.moved = true;
          return;
        }
        const dx = e.clientX - st.px;
        const dy = e.clientY - st.py;
        if (tool === 'move') {
          if (!st.key) return;
          if (!st.moved) {
            if (Math.abs(dx) + Math.abs(dy) < DRAG_SLOP) return;
            st.moved = true;
          }
          const m = metricsOf(st.box);
          if (!m) return;
          const moveDx = e.clientX - st.lastPx;
          const moveDy = e.clientY - st.lastPy;
          st.lastPx = e.clientX;
          st.lastPy = e.clientY;
          onMove?.(
            st.key,
            { x: moveDx / m.scale, y: -moveDy / m.scale },
            { shiftKey: st.shiftKey },
          );
          return;
        }
        if (!st.moved) {
          if (Math.abs(dx) + Math.abs(dy) < DRAG_SLOP) return;
          st.moved = true;
          st.key = '';
          setPanning(true);
        }
        const m = metricsOf(st.box);
        if (!m) return;
        setView({ ...st.box, x: st.box.x - dx / m.scale, y: st.box.y - dy / m.scale });
      }}
      onPointerUp={(e) => {
        const st = gesture.current;
        if (tool === 'lasso') {
          const done = lassoRef.current;
          if (done && done.length >= 3)
            onLasso?.(done, { shiftKey: gesture.current?.shiftKey ?? false });
          else
            onPick?.(gesture.current?.key ?? '', {
              shiftKey: gesture.current?.shiftKey ?? false,
              pointMm: done?.[0],
            });
          setLasso(null);
        } else if (st && !st.moved) {
          if (st.key && onPick) onPick(st.key, { shiftKey: st.shiftKey });
          else if (tool === 'point') {
            const p = toMm(e.clientX, e.clientY, st.box);
            if (p) onPoint?.(p);
          } else if (!st.key) onPick?.('', { shiftKey: st.shiftKey });
        }
        end();
      }}
      onPointerCancel={() => {
        setLasso(null);
        end();
      }}
      onDoubleClick={() => setView(null)}
    >
      <rect
        data-sheet-viewport-hit-surface=''
        x={box.x}
        y={box.y}
        width={box.w}
        height={box.h}
        fill='var(--color-bgColor)'
      />
      {children({ box, unit })}
      {lasso && lasso.length > 1 && (
        <polygon
          points={ptsAttr(lasso)}
          fill={SHEET_INK.blue}
          fillOpacity={0.06}
          stroke={SHEET_INK.blue}
          strokeWidth={1.2}
          strokeDasharray={`${unit * 6} ${unit * 4}`}
          vectorEffect='non-scaling-stroke'
          pointerEvents='none'
        />
      )}
    </svg>
  );
}

function boxOf(b: BoxMm, padRatio: number): ViewBox {
  const w = Math.max(b.maxX - b.minX, 1);
  const h = Math.max(b.maxY - b.minY, 1);
  const pad = Math.max(w, h) * padRatio;
  return { x: b.minX - pad, y: vy(b.maxY) - pad, w: w + 2 * pad, h: h + 2 * pad };
}

/** Point-in-polygon (even-odd), mm. */
export function inside(p: PtMm, poly: readonly PtMm[]): boolean {
  let hit = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x)
      hit = !hit;
  }
  return hit;
}
