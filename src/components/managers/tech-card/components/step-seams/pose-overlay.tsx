import type { Affine, PieceGeom, Pt2 } from 'lib/assembly-skeleton/types';
import { STACKED_TWIN_OFFSET_MM } from 'lib/assembly-skeleton/union';
import { apply, translate } from 'lib/assembly-skeleton/union/affine';
import { cn } from 'lib/utility';
import { useMemo, useRef, type PointerEvent, type ReactNode } from 'react';
import { cycleLayerHit, piecesUnder, posePieceOrder, type LayerHit } from './pose-picking';
import {
  rotatePoseDrag,
  snapPoseForDrag,
  type FitSource,
  type PosePickup,
  type PoseSnap,
} from './step-pose';
import { boxOf, fitBox, pathOf, toPx, type StepLayout } from './step-picture';
import type { PictureView } from './step-picture-view';

/** A drop snaps within this many screen px (P8 pose). */
const POSE_SNAP_PX = 8;
/** A press only becomes a move past this many screen px: a shaky click stays a click. */
const POSE_DEAD_ZONE_PX = 6;

/**
 * The canvas's hands (P8): every drawn piece a handle under the picture, whose edge doors stay on
 * top — a press selects a piece, a drag past the dead zone moves it with the pieces hung on it, a
 * drop snaps a vertex of theirs onto another piece's vertex or outline within POSE_SNAP_PX. The
 * selection and its turn handle sit over the picture, passing every other pointer through.
 */
export function PoseOverlay({
  w,
  h,
  pad,
  bounds,
  view,
  layout,
  layerOrder,
  geoms,
  nameOf,
  selected,
  snapAt,
  snap,
  snapSource,
  disabled,
  pickupOf,
  onSelect,
  onDrag,
  onDrop,
  onCancel,
  children,
}: {
  w: number;
  h: number;
  pad: number;
  bounds: ReturnType<typeof boxOf>;
  /** The canvas zoom: the overlay sits over the picture as zoomed (screen = fitted × k + x, y). */
  view: PictureView;
  layout: StepLayout;
  /** Bottom to top, from the shared step result. */
  layerOrder: readonly string[];
  /** Pieces explicitly painted below the remaining layers. */
  geoms: ReadonlyMap<string, PieceGeom>;
  nameOf: (piece: string) => string;
  selected: string | null;
  snapAt: Pt2 | null;
  snap: boolean;
  snapSource?: FitSource | null;
  disabled: boolean;
  pickupOf: (piece: string) => PosePickup;
  onSelect: (piece: string | null) => void;
  onDrag: (group: string[], D: Affine, snap: PoseSnap | null) => void;
  onDrop: (piece: string, pickup: PosePickup, D: Affine, snap: PoseSnap | null) => void;
  onCancel: () => void;
  /** The picture, laid between the piece handles and the selection. */
  children: ReactNode;
}) {
  const fit = useMemo(() => {
    const f = fitBox(bounds, w, h, pad);
    return { s: f.s * view.k, tx: f.tx * view.k + view.x, ty: f.ty * view.k + view.y };
  }, [bounds, w, h, pad, view.k, view.x, view.y]);
  const stacked = useMemo(
    () => new Set(layout.stacked.flatMap((group) => group.slice(1))),
    [layout.stacked],
  );
  const twinNumbers = useMemo(() => {
    const numbers = new Map<string, number>();
    layout.stacked.forEach((group) =>
      group.slice(1).forEach((piece, index) => numbers.set(piece, index + 2)),
    );
    return numbers;
  }, [layout.stacked]);
  const pieces = useMemo(() => {
    const keys = [...layout.T.keys()].filter((piece) => (geoms.get(piece)?.rs.length ?? 0) >= 3);
    const bottomToTop = posePieceOrder(layerOrder, layout.stacked, keys);
    return bottomToTop.flatMap((piece) => {
      const transform = layout.T.get(piece)!;
      const geom = geoms.get(piece);
      if (!geom || geom.rs.length < 3) return [];
      const twin = twinNumbers.get(piece);
      const offset = twin ? STACKED_TWIN_OFFSET_MM * (twin - 1) * fit.s : 0;
      return [
        {
          piece,
          ring: geom.rs.map((point) => {
            const [x, y] = toPx(fit, apply(transform, point));
            return [x + offset, y + offset] as Pt2;
          }),
        },
      ];
    });
  }, [layout.T, layout.stacked, layerOrder, geoms, fit, twinNumbers]);
  const lastHit = useRef<LayerHit | null>(null);
  const drag = useRef<
    | {
        mode: 'move';
        piece: string;
        clickPiece: string;
        at: Pt2;
        pickup: PosePickup | null;
        transforms: ReadonlyMap<string, Affine>;
        clientX: number;
        clientY: number;
        moved: boolean;
        D: Affine;
        snap: PoseSnap | null;
      }
    | {
        mode: 'rotate';
        piece: string;
        pickup: PosePickup | null;
        transforms: ReadonlyMap<string, Affine>;
        clientX: number;
        clientY: number;
        moved: boolean;
        centre: Pt2;
        start: Pt2;
        D: Affine;
        snap: null;
      }
    | null
  >(null);
  const scale = Math.max(fit.s, 1e-6);
  const shiftOf = (e: PointerEvent, state: NonNullable<typeof drag.current>): Affine =>
    translate((e.clientX - state.clientX) / scale, -(e.clientY - state.clientY) / scale);

  const finish = (cancelled = false) => {
    const state = drag.current;
    if (!state) return;
    drag.current = null;
    if (cancelled) {
      lastHit.current = null;
      onCancel();
      return;
    }
    if (!state.moved && state.mode === 'move') {
      lastHit.current = { piece: state.clickPiece, at: state.at };
      onSelect(state.clickPiece);
      onCancel();
      return;
    }
    if (!state.moved) {
      onCancel();
      return;
    }
    lastHit.current = null;
    if (!state.pickup) {
      onCancel();
      return;
    }
    onDrop(state.piece, state.pickup, state.D, state.snap);
  };

  if (w < 2 || h < 2) return <>{children}</>;
  const selectedRing = pieces.find((item) => item.piece === selected)?.ring;
  const selectedPickup = selected ? pickupOf(selected) : null;
  const selectedGroup = new Set(selectedPickup?.group ?? []);
  const selectedPoints = pieces
    .filter(({ piece }) => selectedGroup.has(piece))
    .flatMap(({ ring }) => ring);
  const selectedBox = selectedPoints.length
    ? selectedPoints.reduce(
        (bounds, [x, y]) => ({
          x0: Math.min(bounds.x0, x),
          y0: Math.min(bounds.y0, y),
          x1: Math.max(bounds.x1, x),
          y1: Math.max(bounds.y1, y),
        }),
        { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity },
      )
    : null;
  const snapPx = snapAt ? toPx(fit, snapAt) : null;
  const screenToWorld = (x: number, y: number): Pt2 => [
    (x - fit.tx) / scale,
    -(y - fit.ty) / scale,
  ];
  const worldAt = (svg: SVGSVGElement | null, clientX: number, clientY: number): Pt2 => {
    const rect = svg?.getBoundingClientRect();
    const x = rect ? ((clientX - rect.left) * w) / Math.max(rect.width, 1) : clientX;
    const y = rect ? ((clientY - rect.top) * h) / Math.max(rect.height, 1) : clientY;
    return screenToWorld(x, y);
  };
  const dragHandlers = {
    onPointerMove: (e: PointerEvent<SVGSVGElement>) => {
      const state = drag.current;
      if (!state) return;
      if (
        !state.moved &&
        Math.hypot(e.clientX - state.clientX, e.clientY - state.clientY) <= POSE_DEAD_ZONE_PX
      )
        return;
      const started = !state.moved;
      state.moved = true;
      lastHit.current = null;
      if (!state.pickup) {
        onCancel();
        return;
      }
      if (started) onSelect(state.piece);
      if (state.mode === 'rotate') {
        state.D = rotatePoseDrag(
          state.centre,
          state.start,
          worldAt(e.currentTarget, e.clientX, e.clientY),
          e.shiftKey ? 15 : 1,
        ).D;
      } else {
        state.D = shiftOf(e, state);
        state.snap = snap
          ? snapPoseForDrag(
              state.pickup.group,
              state.D,
              state.transforms,
              geoms,
              stacked,
              POSE_SNAP_PX / scale,
              snapSource,
            )
          : null;
      }
      onDrag(state.pickup.group, state.D, state.snap);
    },
    onPointerUp: () => finish(),
    onPointerCancel: () => finish(true),
  };
  return (
    <>
      <svg
        width={w}
        height={h}
        viewBox={`0 0 ${w} ${h}`}
        className='absolute inset-0 touch-none'
        onClick={(e) => {
          // The empty canvas lets go of the piece; its press stays the zoom's pan.
          if (e.target === e.currentTarget && selected) onSelect(null);
        }}
        {...dragHandlers}
        data-seam-pose-canvas=''
      >
        {pieces.map((item) => (
          <path
            key={item.piece}
            d={pathOf(item.ring, true)}
            fill='transparent'
            stroke='transparent'
            pointerEvents='all'
            tabIndex={0}
            role='button'
            aria-label={nameOf(item.piece)}
            aria-pressed={selected === item.piece}
            className={cn(
              disabled ? 'cursor-pointer' : 'cursor-move',
              'focus-visible:outline focus-visible:outline-2 focus-visible:outline-textColor',
            )}
            onKeyDown={(e) => {
              if (e.key !== 'Enter' && e.key !== ' ') return;
              e.preventDefault();
              e.stopPropagation();
              lastHit.current = null;
              onSelect(selected === item.piece ? null : item.piece);
            }}
            onPointerDown={(e) => {
              e.preventDefault();
              // A press on a piece moves it; only a press on the empty canvas pans.
              e.stopPropagation();
              const svg = e.currentTarget.ownerSVGElement;
              const rect = svg?.getBoundingClientRect();
              const at: [number, number] = rect
                ? [
                    ((e.clientX - rect.left) * w) / Math.max(rect.width, 1),
                    ((e.clientY - rect.top) * h) / Math.max(rect.height, 1),
                  ]
                : [e.clientX, e.clientY];
              const hits = piecesUnder(at, pieces);
              const clickPiece = cycleLayerHit(hits, at, lastHit.current) ?? item.piece;
              const piece = selected && hits.includes(selected) ? selected : clickPiece;
              e.currentTarget.setPointerCapture?.(e.pointerId);
              drag.current = {
                mode: 'move',
                piece,
                clickPiece,
                at,
                pickup: disabled ? null : pickupOf(piece),
                transforms: new Map(layout.T),
                clientX: e.clientX,
                clientY: e.clientY,
                moved: false,
                D: [1, 0, 0, 1, 0, 0],
                snap: null,
              };
            }}
            data-seam-pose-piece={item.piece}
          />
        ))}
      </svg>
      {children}
      <svg
        width={w}
        height={h}
        viewBox={`0 0 ${w} ${h}`}
        className='pointer-events-none absolute inset-0 touch-none'
        {...dragHandlers}
      >
        {selectedRing && (
          <path
            d={pathOf(selectedRing, true)}
            fill='none'
            stroke='var(--color-warning)'
            strokeWidth={2.6}
            strokeLinejoin='round'
            pointerEvents='none'
            data-seam-pose-selected=''
          />
        )}
        {selected && selectedPickup && selectedBox && (
          <g data-seam-pose-rotate-box=''>
            <rect
              x={selectedBox.x0}
              y={selectedBox.y0}
              width={selectedBox.x1 - selectedBox.x0}
              height={selectedBox.y1 - selectedBox.y0}
              fill='none'
              stroke='var(--color-textColor)'
              strokeWidth={1}
              strokeDasharray='2 3'
              pointerEvents='none'
            />
            <line
              x1={(selectedBox.x0 + selectedBox.x1) / 2}
              y1={selectedBox.y1}
              x2={(selectedBox.x0 + selectedBox.x1) / 2}
              y2={selectedBox.y1 + 22}
              stroke='var(--color-textColor)'
              strokeWidth={1}
              pointerEvents='none'
            />
            <rect
              x={(selectedBox.x0 + selectedBox.x1) / 2 - 6}
              y={selectedBox.y1 + 16}
              width={12}
              height={12}
              fill='var(--color-bgColor)'
              stroke='var(--color-textColor)'
              strokeWidth={1.5}
              pointerEvents='all'
              role='button'
              aria-label='rotate'
              aria-disabled={disabled}
              tabIndex={disabled ? -1 : 0}
              className={cn(
                'touch-none cursor-grab active:cursor-grabbing',
                'focus-visible:outline focus-visible:outline-2 focus-visible:outline-textColor',
              )}
              onKeyDown={(e) => {
                if (disabled || (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight')) return;
                e.preventDefault();
                e.stopPropagation();
                const centre = screenToWorld(
                  (selectedBox.x0 + selectedBox.x1) / 2,
                  (selectedBox.y0 + selectedBox.y1) / 2,
                );
                const step = e.shiftKey ? 15 : 1;
                const angle = ((e.key === 'ArrowLeft' ? step : -step) * Math.PI) / 180;
                const rotation = rotatePoseDrag(
                  centre,
                  [centre[0] + 1, centre[1]],
                  [centre[0] + Math.cos(angle), centre[1] + Math.sin(angle)],
                  step,
                );
                onDrop(selected, selectedPickup, rotation.D, null);
              }}
              onPointerDown={(e) => {
                if (disabled) return;
                e.preventDefault();
                e.stopPropagation();
                const svg = e.currentTarget.ownerSVGElement;
                const centre = screenToWorld(
                  (selectedBox.x0 + selectedBox.x1) / 2,
                  (selectedBox.y0 + selectedBox.y1) / 2,
                );
                e.currentTarget.setPointerCapture?.(e.pointerId);
                drag.current = {
                  mode: 'rotate',
                  piece: selected,
                  pickup: selectedPickup,
                  transforms: new Map(layout.T),
                  clientX: e.clientX,
                  clientY: e.clientY,
                  moved: false,
                  centre,
                  start: worldAt(svg, e.clientX, e.clientY),
                  D: [1, 0, 0, 1, 0, 0],
                  snap: null,
                };
              }}
              data-seam-pose-rotate=''
            />
          </g>
        )}
        {snapPx && (
          <circle
            cx={snapPx[0]}
            cy={snapPx[1]}
            r={6}
            fill='none'
            stroke='var(--color-warning)'
            strokeWidth={2.4}
            pointerEvents='none'
            data-seam-pose-snap-at=''
          />
        )}
      </svg>
    </>
  );
}
