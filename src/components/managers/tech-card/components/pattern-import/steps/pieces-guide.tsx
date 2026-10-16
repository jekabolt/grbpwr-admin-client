// The PIECES guide's pictures: the question card shows what it asks about, small, beside the
// answers — a crop of the region (its outline and the drawn lines round it, the gap ring), for
// the garment question one picture of each garment's pieces, and the square tiles of the pieces
// and of the outlines left out on a guess. Display only; the canvas stays the place where answers
// are drawn.
import { memo, useId } from 'react';
import type { BoxMm, PtMm } from 'lib/pattern-import/types';
import { cn } from 'lib/utility';
import { SHEET_INK, f32Attr, ptsAttr, vy } from '../sheet-viewport';

const pad = (b: BoxMm, r: number) => {
  const w = Math.max(b.maxX - b.minX, 1);
  const h = Math.max(b.maxY - b.minY, 1);
  const p = Math.max(w, h) * r;
  return { x: b.minX - p, y: vy(b.maxY) - p, w: w + 2 * p, h: h + 2 * p };
};

/** The drawn lines of the sheet, once per previews array (the crop re-renders on every answer). */
const Lines = memo(function Lines({
  previews,
  unit,
}: {
  previews: readonly Float32Array[];
  unit: number;
}) {
  return (
    <g fill='none' stroke={SHEET_INK.source} strokeWidth={unit * 0.8}>
      {previews.map((a, i) => (a.length < 4 ? null : <polyline key={i} points={f32Attr(a)} />))}
    </g>
  );
});

/** A crop of one region: the sheet's lines round it, its outline dashed, the gap ring if any. */
export function RegionCrop({
  box,
  outer,
  previews,
  stroke,
  leakAt,
  marks,
  className,
  style,
}: {
  box: BoxMm;
  outer: readonly PtMm[];
  previews: readonly Float32Array[];
  stroke: string;
  leakAt?: PtMm | null;
  /** The numbers the question is about, drawn large (which part is which). */
  marks?: { at: PtMm; n: number | string }[];
  className?: string;
  style?: React.CSSProperties;
}) {
  const v = pad(box, 0.12);
  const unit = Math.max(v.w, v.h) / 160;
  // the letterbox round the box stays empty: only the region is shown, not the sheet beside it
  const clip = `crop${useId().replace(/[^\w-]/g, '')}`;
  return (
    <svg
      viewBox={`${v.x} ${v.y} ${v.w} ${v.h}`}
      preserveAspectRatio='xMidYMid meet'
      aria-hidden
      className={className}
      style={style}
    >
      <clipPath id={clip}>
        <rect x={v.x} y={v.y} width={v.w} height={v.h} />
      </clipPath>
      <g clipPath={`url(#${clip})`}>
        <Lines previews={previews} unit={unit} />
        {outer.length > 2 && (
          <polygon
            points={ptsAttr(outer as PtMm[])}
            fill={stroke}
            fillOpacity={0.12}
            stroke={stroke}
            strokeWidth={unit * 1.6}
          />
        )}
        {leakAt && (
          <circle
            cx={leakAt.x}
            cy={vy(leakAt.y)}
            r={unit * 8}
            fill='none'
            stroke={SHEET_INK.red}
            strokeWidth={unit * 2}
          />
        )}
        {marks?.map((m, i) => (
          <g key={i}>
            <rect
              x={m.at.x - unit * 9}
              y={vy(m.at.y) - unit * 9}
              width={unit * 18}
              height={unit * 18}
              fill={SHEET_INK.blue}
            />
            <text
              x={m.at.x}
              y={vy(m.at.y)}
              fontSize={unit * 12}
              fill='#ffffff'
              textAnchor='middle'
              dominantBaseline='central'
            >
              {m.n}
            </text>
          </g>
        ))}
      </g>
    </svg>
  );
}

/** Each drawn line's box (minX, minY, maxX, maxY per chain), once per previews array. */
const BOXES = new WeakMap<readonly Float32Array[], Float32Array>();
function chainBoxes(previews: readonly Float32Array[]): Float32Array {
  let b = BOXES.get(previews);
  if (b) return b;
  b = new Float32Array(previews.length * 4);
  previews.forEach((a, i) => {
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    for (let k = 0; k + 1 < a.length; k += 2) {
      x0 = Math.min(x0, a[k]);
      x1 = Math.max(x1, a[k]);
      y0 = Math.min(y0, a[k + 1]);
      y1 = Math.max(y1, a[k + 1]);
    }
    b!.set([x0, y0, x1, y1], i * 4);
  });
  BOXES.set(previews, b);
  return b;
}

/**
 * A square tile of one outline: the drawn lines round it, the outline's own lines in ink (a piece:
 * its filled outline). Picked = ink edge and a ✓ in the corner; hot = the canvas shows it (blue).
 */
export function OutlineTile({
  box,
  previews,
  outline,
  mark,
  picked = false,
  hot = false,
  onClick,
  onHover,
  disabled,
  label,
  title,
  className,
  ...rest
}: {
  box: BoxMm;
  previews: readonly Float32Array[];
  outline?: readonly PtMm[];
  /** A number in the corner (the piece's number on the sheet). */
  mark?: number;
  picked?: boolean;
  hot?: boolean;
  onClick?: () => void;
  onHover?: (on: boolean) => void;
  disabled?: boolean;
  label: string;
  title?: string;
  className?: string;
} & Record<`data-${string}`, string | undefined>) {
  const w = Math.max(box.maxX - box.minX, 1);
  const h = Math.max(box.maxY - box.minY, 1);
  const side = Math.max(w, h) * 1.16;
  const cx = (box.minX + box.maxX) / 2;
  const cy = (box.minY + box.maxY) / 2;
  const v = { x: cx - side / 2, y: vy(cy) - side / 2, w: side, h: side };
  const unit = side / 70;
  const bx = chainBoxes(previews);
  const near: number[] = [];
  const own = new Set<number>();
  const tol = Math.max(w, h) * 0.02;
  const lo = { x: cx - side / 2, y: cy - side / 2 };
  for (let i = 0; i < previews.length; i++) {
    if (previews[i].length < 4) continue;
    const [x0, y0, x1, y1] = [bx[i * 4], bx[i * 4 + 1], bx[i * 4 + 2], bx[i * 4 + 3]];
    if (x1 < lo.x || x0 > lo.x + side || y1 < lo.y || y0 > lo.y + side) continue;
    near.push(i);
    if (
      !outline &&
      x0 >= box.minX - tol &&
      y0 >= box.minY - tol &&
      x1 <= box.maxX + tol &&
      y1 <= box.maxY + tol
    )
      own.add(i);
  }
  return (
    <button
      type='button'
      aria-label={label}
      aria-pressed={picked}
      title={title}
      disabled={disabled}
      onClick={onClick}
      onPointerEnter={() => onHover?.(true)}
      onPointerLeave={() => onHover?.(false)}
      onFocus={() => onHover?.(true)}
      onBlur={() => onHover?.(false)}
      className={cn(
        'relative block aspect-square w-full overflow-hidden border bg-bgColor focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-textColor disabled:cursor-default',
        picked ? 'border-textColor' : 'border-borderColor',
        className,
      )}
      style={hot ? { borderColor: SHEET_INK.blue } : undefined}
      {...rest}
    >
      <svg
        viewBox={`${v.x} ${v.y} ${v.w} ${v.h}`}
        preserveAspectRatio='xMidYMid meet'
        aria-hidden
        overflow='hidden'
        className='absolute inset-1 h-[calc(100%-0.5rem)] w-[calc(100%-0.5rem)]'
      >
        <g fill='none' strokeWidth={unit * 0.7}>
          {near.map((i) => (
            <polyline
              key={i}
              points={f32Attr(previews[i])}
              stroke={own.has(i) ? (hot ? SHEET_INK.blue : SHEET_INK.ink) : SHEET_INK.source}
              strokeWidth={own.has(i) ? unit * 1.1 : unit * 0.6}
            />
          ))}
        </g>
        {outline && outline.length > 2 && (
          <polygon
            points={ptsAttr(outline as PtMm[])}
            fill={hot ? SHEET_INK.blue : SHEET_INK.fill}
            fillOpacity={hot ? 0.12 : 0.9}
            stroke={hot ? SHEET_INK.blue : SHEET_INK.ink}
            strokeWidth={unit * 1.1}
          />
        )}
      </svg>
      {mark != null && (
        <span className='absolute left-1 top-1 text-micro leading-none tabular-nums text-labelColor'>
          {mark}
        </span>
      )}
      {picked && (
        <span
          aria-hidden
          className='absolute right-0 top-0 flex size-4 items-center justify-center bg-textColor text-micro leading-none text-bgColor'
        >
          ✓
        </span>
      )}
    </button>
  );
}

/** One garment's pieces on the whole sheet, as filled outlines. */
export function ModelThumb({
  sheet,
  outlines,
  hot = false,
  className,
  style,
}: {
  sheet: BoxMm;
  outlines: readonly (readonly PtMm[])[];
  hot?: boolean;
  className?: string;
  style?: React.CSSProperties;
}) {
  // the pieces' own box, not the sheet's: a sheet is mostly empty paper round the pieces
  const all = outlines.flat();
  const v = pad(
    all.length
      ? {
          minX: Math.min(...all.map((p) => p.x)),
          minY: Math.min(...all.map((p) => p.y)),
          maxX: Math.max(...all.map((p) => p.x)),
          maxY: Math.max(...all.map((p) => p.y)),
        }
      : sheet,
    0.03,
  );
  const unit = Math.max(v.w, v.h) / 120;
  return (
    <svg
      viewBox={`${v.x} ${v.y} ${v.w} ${v.h}`}
      preserveAspectRatio='xMidYMid meet'
      aria-hidden
      className={className}
      style={style}
    >
      {outlines.map((o, i) =>
        o.length > 2 ? (
          <polygon
            key={i}
            points={ptsAttr(o as PtMm[])}
            fill={hot ? SHEET_INK.blue : SHEET_INK.fill}
            fillOpacity={hot ? 0.12 : 1}
            stroke={hot ? SHEET_INK.blue : SHEET_INK.ink}
            strokeWidth={unit * 0.5}
          />
        ) : null,
      )}
    </svg>
  );
}
