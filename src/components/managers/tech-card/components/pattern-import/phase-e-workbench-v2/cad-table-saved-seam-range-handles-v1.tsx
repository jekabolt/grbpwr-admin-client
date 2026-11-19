import type { PtMm } from 'lib/pattern-import/types';
import { vy } from '../sheet-viewport';
import { CAD_WORKBENCH_SEAM_SIDE_COLORS } from './cad-workbench-seam-colors-v1';
import type {
  SavedAssemblyNativeDirectedSubrangeReceiptV1,
  reviseSavedAssemblyNativeDirectedSubrangeV1,
} from './saved-assembly-native-directed-intervals-v1';

const percentageTicks = 10_000;

export type SavedNativeSeamRangeDraftV1 = Readonly<{
  receipt: SavedAssemblyNativeDirectedSubrangeReceiptV1;
  ranges: Parameters<typeof reviseSavedAssemblyNativeDirectedSubrangeV1>[2];
  move: (side: 0 | 1, endpoint: 0 | 1, tick: number) => void;
}>;

/** Presentation only. The existing saved seam review owns the draft and the explicit save. */
export function CadTableSavedSeamRangeHandlesV1({
  from,
  to,
  side,
  unit,
  draft,
}: Readonly<{
  from: PtMm;
  to: PtMm;
  side: 0 | 1;
  unit: number;
  draft: SavedNativeSeamRangeDraftV1;
}>) {
  const values = draft.ranges[side];
  const dx = to.x - from.x;
  const dy = vy(to.y) - vy(from.y);
  const squaredLength = dx ** 2 + dy ** 2;
  if (!(squaredLength > 0)) return null;
  const point = (tick: number) => ({
    x: from.x + (dx * tick) / percentageTicks,
    y: vy(from.y) + (dy * tick) / percentageTicks,
  });
  const start = point(values[0]);
  const end = point(values[1]);
  const letter = side === 0 ? 'A' : 'B';
  const color = CAD_WORKBENCH_SEAM_SIDE_COLORS[letter];

  return (
    <g data-cad-native-seam-range-side={letter}>
      <line
        x1={start.x}
        y1={start.y}
        x2={end.x}
        y2={end.y}
        stroke={color}
        strokeWidth={4}
        vectorEffect='non-scaling-stroke'
        pointerEvents='none'
      />
      {([0, 1] as const).map((endpoint) => {
        const value = values[endpoint];
        const min = endpoint === 0 ? 0 : values[0] + 1;
        const max = endpoint === 0 ? values[1] - 1 : percentageTicks;
        const update = (tick: number) => {
          const next = Math.min(max, Math.max(min, Math.round(tick)));
          if (Number.isFinite(next) && next !== value) draft.move(side, endpoint, next);
        };
        const { x, y } = endpoint === 0 ? start : end;
        return (
          <circle
            key={endpoint}
            cx={x}
            cy={y}
            r={7 * unit}
            fill='var(--color-bgColor)'
            stroke={color}
            strokeWidth={2}
            vectorEffect='non-scaling-stroke'
            role='slider'
            tabIndex={0}
            aria-label={`Side ${letter} ${endpoint === 0 ? 'start' : 'end'} on the sewing edge`}
            aria-valuemin={min / 100}
            aria-valuemax={max / 100}
            aria-valuenow={value / 100}
            aria-valuetext={`${value / 100}%`}
            data-cad-native-seam-range-handle={`${letter}-${endpoint === 0 ? 'start' : 'end'}`}
            className='cursor-grab focus-visible:outline focus-visible:outline-2 active:cursor-grabbing'
            style={{ touchAction: 'none' }}
            onPointerDown={(event) => {
              if (event.button !== 0) return;
              event.stopPropagation();
              event.currentTarget.setPointerCapture?.(event.pointerId);
            }}
            onPointerMove={(event) => {
              const handle = event.currentTarget;
              if (!handle.hasPointerCapture?.(event.pointerId)) return;
              event.stopPropagation();
              const transform = handle.getScreenCTM();
              if (!transform) return;
              const p = new DOMPoint(event.clientX, event.clientY).matrixTransform(
                transform.inverse(),
              );
              const fraction = ((p.x - from.x) * dx + (p.y - vy(from.y)) * dy) / squaredLength;
              update(fraction * percentageTicks);
            }}
            onPointerUp={(event) => event.stopPropagation()}
            onPointerCancel={(event) => event.stopPropagation()}
            onKeyDown={(event) => {
              const step = event.shiftKey ? 100 : 10;
              const tick =
                event.key === 'Home'
                  ? min
                  : event.key === 'End'
                    ? max
                    : event.key === 'ArrowLeft' || event.key === 'ArrowDown'
                      ? value - step
                      : event.key === 'ArrowRight' || event.key === 'ArrowUp'
                        ? value + step
                        : null;
              if (tick === null) return;
              event.preventDefault();
              event.stopPropagation();
              update(tick);
            }}
          />
        );
      })}
    </g>
  );
}
