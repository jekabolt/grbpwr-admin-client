// The wizard's drawing surface: an SVG over the sheet in mm, with the SAME gesture grammar as the
// piece-match sheet (nesting/piece-sheet.tsx) — wheel zooms at the cursor, drag pans, a click
// under the drag slop is a pick, double click returns to the whole sheet. PieceSheet itself is
// bound to PieceDTO (parsed DXF pieces); the wizard draws IR polylines, seeds and lassos, so the
// gesture code is repeated here rather than bent into that component.
//
// Y is flipped in the numbers (`vy`), not by a group transform, for the reason PieceSheet gives:
// a transform would mirror every label too.
import { useEffect, useRef, useState } from 'react';
import type { BoxMm, PtMm } from 'lib/pattern-import/types';
import { cn } from 'lib/utility';

export type ViewBox = { x: number; y: number; w: number; h: number };
export type ViewTool = 'pan' | 'point' | 'lasso';

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

export function SheetViewport({
  bbox,
  tool = 'pan',
  onPick,
  onPoint,
  onLasso,
  className,
  children,
  focus,
}: {
  bbox: BoxMm;
  tool?: ViewTool;
  /** Pointer released on an element carrying `data-key` without dragging. */
  onPick?: (key: string) => void;
  /** 'point' tool: a click on the sheet, in mm. */
  onPoint?: (pt: PtMm) => void;
  /** 'lasso' tool: the closed polygon the operator drew, in mm. */
  onLasso?: (pts: PtMm[]) => void;
  className?: string;
  /** Zoom to this box when it changes (e.g. the selected piece). null = leave the view alone. */
  focus?: BoxMm | null;
  children: (v: { box: ViewBox; unit: number }) => React.ReactNode;
}) {
  const fit = boxOf(bbox, 0.03);
  const [view, setView] = useState<ViewBox | null>(null);
  const box = view ?? fit;
  const svgRef = useRef<SVGSVGElement | null>(null);
  const gesture = useRef<{
    px: number;
    py: number;
    box: ViewBox;
    key: string;
    moved: boolean;
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

  const focusKey = focus ? `${focus.minX}|${focus.minY}|${focus.maxX}|${focus.maxY}` : '';
  useEffect(() => {
    if (focus) setView(boxOf(focus, 0.25));
    // focusKey stands for `focus`: a new object with the same numbers must not re-zoom.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusKey]);

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
      const w = Math.min(fit.w * 1.5, Math.max(fit.w / 60, b.w * factor));
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

  const unit = box.w / 700;
  const cursor =
    tool === 'lasso'
      ? 'cursor-crosshair'
      : tool === 'point'
        ? 'cursor-cell'
        : panning
          ? 'cursor-grabbing'
          : 'cursor-grab';

  return (
    <svg
      ref={svgRef}
      xmlns='http://www.w3.org/2000/svg'
      viewBox={`${box.x} ${box.y} ${box.w} ${box.h}`}
      fontFamily='monospace'
      className={cn('block h-full w-full touch-none select-none bg-bgColor', cursor, className)}
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        const key = (e.target as Element).closest?.('[data-key]')?.getAttribute('data-key') ?? '';
        if (tool === 'lasso') {
          const p = toMm(e.clientX, e.clientY, box);
          if (p) setLasso([p]);
        }
        gesture.current = { px: e.clientX, py: e.clientY, box, key, moved: false };
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
          if (done && done.length >= 3) onLasso?.(done);
          setLasso(null);
        } else if (st && !st.moved) {
          if (st.key && onPick) onPick(st.key);
          else if (tool === 'point') {
            const p = toMm(e.clientX, e.clientY, st.box);
            if (p) onPoint?.(p);
          } else if (!st.key) onPick?.('');
        }
        end();
      }}
      onPointerCancel={() => {
        setLasso(null);
        end();
      }}
      onDoubleClick={() => setView(null)}
    >
      {children({ box, unit })}
      {lasso && lasso.length > 1 && (
        <polygon
          points={ptsAttr(lasso)}
          fill={SHEET_INK.blue}
          fillOpacity={0.06}
          stroke={SHEET_INK.blue}
          strokeWidth={unit * 1.2}
          strokeDasharray={`${unit * 6} ${unit * 4}`}
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
