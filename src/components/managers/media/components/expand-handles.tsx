import { cn } from 'lib/utility';
import { useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { Button } from 'ui';

import {
  dragHandle,
  dragPhoto,
  nudgeHandle,
  type DragOpts,
  type HandleDir,
} from '../utils/expandDrag';
import type { Margins } from '../utils/getExpanded';

// EXPAND-FREE handles overlay, shared by the desktop and the mobile expander.
//
// It renders INSIDE the result frame (a `relative` box of exactly outW*scale × outH*scale) and
// owns no state of its own except "which handle is under the pointer right now". Every gesture
// writes the four margins through `onChange`; the host keeps them. The host also owns the scale:
// it must keep `scale` frozen between `onDragStart` and `onDragEnd`, otherwise the frame re-fits
// under the cursor on every move and the edge runs away from the hand.
//
// Pointer deltas are converted to SOURCE px with the scale captured at pointerdown, so a host that
// forgets to freeze still gets a consistent drag (only the picture lags).

export type ExpandDragMode = HandleDir | 'photo';

export type ExpandHandlesProps = {
  margins: Margins;
  srcW: number;
  srcH: number;
  /** Screen px per source px. Frozen by the host while a drag is live. */
  scale: number;
  onChange: (next: Margins) => void;
  /** Pointer went down on a handle or on the photo. The host freezes its scale here. */
  onDragStart?: (mode: ExpandDragMode) => void;
  /** Pointer released / cancelled. The host refits here. */
  onDragEnd?: () => void;
  /** A keyboard nudge was applied (no drag cycle). The host may animate the refit. */
  onNudge?: () => void;
  /** Opposite side follows (UI toggle). Alt held during a drag does the same. */
  mirror: boolean;
  /** Ratios (w/h) the dragged axis snaps to. Shift held disables snapping. */
  presets: number[];
  /** Growth stops at this area cap. */
  maxMegapixels?: number;
  /** 44px hit areas instead of 32px. */
  touch?: boolean;
  /** Colour pick mode: the photo layer is removed so a click reaches the picture underneath. */
  pickMode?: boolean;
  disabled?: boolean;
  /** Animate positioned children (the host's 180ms refit). */
  settling?: boolean;
  /** `+N` labels inside margins wider than 26 screen px. Default true. */
  labels?: boolean;
};

const HANDLES: Array<{ dir: HandleDir; label: string; at: string; cursor: string }> = [
  { dir: 'n', label: 'extend top', at: 'left-1/2 top-0', cursor: 'cursor-ns-resize' },
  { dir: 's', label: 'extend bottom', at: 'left-1/2 top-full', cursor: 'cursor-ns-resize' },
  { dir: 'w', label: 'extend left', at: 'left-0 top-1/2', cursor: 'cursor-ew-resize' },
  { dir: 'e', label: 'extend right', at: 'left-full top-1/2', cursor: 'cursor-ew-resize' },
  { dir: 'nw', label: 'extend top left', at: 'left-0 top-0', cursor: 'cursor-nwse-resize' },
  { dir: 'ne', label: 'extend top right', at: 'left-full top-0', cursor: 'cursor-nesw-resize' },
  { dir: 'sw', label: 'extend bottom left', at: 'left-0 top-full', cursor: 'cursor-nesw-resize' },
  {
    dir: 'se',
    label: 'extend bottom right',
    at: 'left-full top-full',
    cursor: 'cursor-nwse-resize',
  },
];

/** Thin visible mark: edge 6×24, corner 9×9. */
const MARK: Record<HandleDir, string> = {
  n: 'h-1.5 w-6',
  s: 'h-1.5 w-6',
  e: 'h-6 w-1.5',
  w: 'h-6 w-1.5',
  ne: 'size-2.25',
  nw: 'size-2.25',
  se: 'size-2.25',
  sw: 'size-2.25',
};

/** Arrow key → (edge it moves, +1 outward / -1 inward) for an edge handle's own axis. */
const KEY_AXIS: Record<string, { x?: 1 | -1; y?: 1 | -1 }> = {
  ArrowRight: { x: 1 },
  ArrowLeft: { x: -1 },
  ArrowDown: { y: 1 },
  ArrowUp: { y: -1 },
};

/** Screen px under which a margin is too thin to carry its `+N` label. */
const LABEL_MIN_PX = 26;
/** Screen px within which the moved photo snaps to the centre. */
const CENTRE_SNAP_PX = 6;

const SETTLE =
  'transition-[left,top,width,height] duration-180 ease-out motion-reduce:transition-none';

type Drag = {
  mode: ExpandDragMode;
  x: number;
  y: number;
  k: number;
  start: Margins;
  mirror: boolean;
  pointerId: number;
};

export function ExpandHandles({
  margins,
  srcW,
  srcH,
  scale,
  onChange,
  onDragStart,
  onDragEnd,
  onNudge,
  mirror,
  presets,
  maxMegapixels,
  touch,
  pickMode,
  disabled,
  settling,
  labels = true,
}: ExpandHandlesProps) {
  const drag = useRef<Drag | null>(null);
  const [active, setActive] = useState<ExpandDragMode | null>(null);

  const opts = (mirrorNow: boolean, snap: boolean): DragOpts => ({
    mirror: mirrorNow,
    snap,
    presets,
    srcW,
    srcH,
    maxMegapixels,
  });

  const down = (e: PointerEvent<HTMLElement>, mode: ExpandDragMode) => {
    if (disabled || !scale || e.button > 0) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = {
      mode,
      x: e.clientX,
      y: e.clientY,
      k: scale,
      start: { ...margins },
      mirror: mirror || e.altKey,
      pointerId: e.pointerId,
    };
    setActive(mode);
    onDragStart?.(mode);
  };

  const move = (e: PointerEvent<HTMLElement>) => {
    const d = drag.current;
    if (!d || e.pointerId !== d.pointerId) return;
    const dx = (e.clientX - d.x) / d.k;
    const dy = (e.clientY - d.y) / d.k;
    const next =
      d.mode === 'photo'
        ? dragPhoto(d.start, dx, dy, CENTRE_SNAP_PX / d.k)
        : dragHandle(d.start, d.mode, dx, dy, opts(mirror || e.altKey, !e.shiftKey));
    onChange(next);
  };

  const up = (e: PointerEvent<HTMLElement>) => {
    const d = drag.current;
    if (!d || e.pointerId !== d.pointerId) return;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    drag.current = null;
    setActive(null);
    onDragEnd?.();
  };

  const key = (e: KeyboardEvent<HTMLElement>, dir: HandleDir) => {
    if (disabled) return;
    const axis = KEY_AXIS[e.key];
    if (!axis) return;
    // A corner answers both axes; an edge only its own. The arrow names a direction on screen,
    // so "outward" depends on which side the handle sits: → grows the right edge, shrinks the left.
    let side: HandleDir | null = null;
    let sign = 0;
    if (axis.x && (dir.includes('e') || dir.includes('w'))) {
      side = dir.includes('e') ? 'e' : 'w';
      sign = side === 'e' ? axis.x : -axis.x;
    } else if (axis.y && (dir.includes('n') || dir.includes('s'))) {
      side = dir.includes('s') ? 's' : 'n';
      sign = side === 's' ? axis.y : -axis.y;
    }
    if (!side) return;
    e.preventDefault();
    const step = (e.shiftKey ? 50 : 10) * sign;
    onChange(nudgeHandle(margins, side, step, opts(mirror || e.altKey, false)));
    onNudge?.();
  };

  const k = scale;
  const anim = settling && SETTLE;
  const pad = [
    { side: 'left' as const, v: margins.left, style: { left: (margins.left * k) / 2, top: '50%' } },
    {
      side: 'right' as const,
      v: margins.right,
      style: { right: (margins.right * k) / 2, top: '50%' },
    },
    { side: 'top' as const, v: margins.top, style: { top: (margins.top * k) / 2, left: '50%' } },
    {
      side: 'bottom' as const,
      v: margins.bottom,
      style: { bottom: (margins.bottom * k) / 2, left: '50%' },
    },
  ];
  const padShift = {
    left: '-translate-x-1/2 -translate-y-1/2',
    right: 'translate-x-1/2 -translate-y-1/2',
    top: '-translate-x-1/2 -translate-y-1/2',
    bottom: '-translate-x-1/2 translate-y-1/2',
  };

  return (
    <div className='pointer-events-none absolute inset-0' data-probe='expand-handles'>
      {!pickMode && (
        <div
          aria-hidden
          data-probe='photo-drag'
          className={cn(
            'pointer-events-auto absolute touch-none',
            disabled ? 'cursor-default' : active === 'photo' ? 'cursor-grabbing' : 'cursor-grab',
            anim,
          )}
          style={{
            left: margins.left * k,
            top: margins.top * k,
            width: srcW * k,
            height: srcH * k,
          }}
          onPointerDown={(e) => down(e, 'photo')}
          onPointerMove={move}
          onPointerUp={up}
          onPointerCancel={up}
        />
      )}

      {labels &&
        pad.map((p) =>
          p.v > 0 && p.v * k >= LABEL_MIN_PX ? (
            <span
              key={p.side}
              aria-hidden
              className={cn(
                'absolute whitespace-nowrap text-micro tabular-nums text-labelColor',
                padShift[p.side],
                anim,
              )}
              style={p.style}
            >
              +{p.v}
            </span>
          ) : null,
        )}

      {HANDLES.map((h) => (
        <Button
          key={h.dir}
          type='button'
          variant={null}
          aria-label={h.label}
          data-probe={`handle-${h.dir}`}
          disabled={disabled}
          className={cn(
            'group pointer-events-auto absolute z-10 flex -translate-x-1/2 -translate-y-1/2 touch-none items-center justify-center',
            touch ? 'size-11' : 'size-8',
            h.at,
            h.cursor,
          )}
          onPointerDown={(e: PointerEvent<HTMLElement>) => down(e, h.dir)}
          onPointerMove={move}
          onPointerUp={up}
          onPointerCancel={up}
          onKeyDown={(e: KeyboardEvent<HTMLElement>) => key(e, h.dir)}
        >
          <span
            aria-hidden
            className={cn(
              'block border border-textColor',
              MARK[h.dir],
              active === h.dir ? 'bg-textColor' : 'bg-bgColor group-hover:bg-textColor',
            )}
          />
        </Button>
      ))}
    </div>
  );
}
