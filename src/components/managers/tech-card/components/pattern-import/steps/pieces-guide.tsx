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
 * The drawn lines that lie wholly inside a box (its own lines, not the neighbours' running past),
 * and how many of them are small marks (under a tenth of the box: text, sketch strokes, notches).
 */
export function ownChains(box: BoxMm, previews: readonly Float32Array[]) {
  const bx = chainBoxes(previews);
  const w = Math.max(box.maxX - box.minX, 1);
  const h = Math.max(box.maxY - box.minY, 1);
  const tol = Math.max(w, h) * 0.02;
  const idx: number[] = [];
  let small = 0;
  for (let i = 0; i < previews.length; i++) {
    if (previews[i].length < 4) continue;
    const [x0, y0, x1, y1] = [bx[i * 4], bx[i * 4 + 1], bx[i * 4 + 2], bx[i * 4 + 3]];
    if (x0 < box.minX - tol || y0 < box.minY - tol || x1 > box.maxX + tol || y1 > box.maxY + tol)
      continue;
    idx.push(i);
    if (Math.max(x1 - x0, y1 - y0) < 0.1 * Math.max(w, h)) small++;
  }
  return { idx, small };
}

/**
 * One outline alone, as a silhouette: only the lines inside its box (no page crop, no neighbours),
 * the closed ones lightly filled, biggest first so the inner ones stay on top.
 */
export function AsideSilhouette({
  box,
  previews,
  title,
  className,
  style,
}: {
  box: BoxMm;
  previews: readonly Float32Array[];
  /** The tooltip (why it was left out); the words are never on the picture. */
  title?: string;
  className?: string;
  style?: React.CSSProperties;
}) {
  const v = pad(box, 0.04);
  const unit = Math.max(v.w, v.h) / 160;
  const bx = chainBoxes(previews);
  const { idx } = ownChains(box, previews);
  const span = (i: number) => (bx[i * 4 + 2] - bx[i * 4]) * (bx[i * 4 + 3] - bx[i * 4 + 1]);
  const closed = (a: Float32Array) =>
    a.length >= 8 &&
    Math.hypot(a[0] - a[a.length - 2], a[1] - a[a.length - 1]) <=
      Math.max(box.maxX - box.minX, box.maxY - box.minY) * 0.01;
  const order = [...idx].sort((a, b) => span(b) - span(a));
  return (
    <svg
      viewBox={`${v.x} ${v.y} ${v.w} ${v.h}`}
      preserveAspectRatio='xMidYMid meet'
      role='img'
      aria-label='the outline asked about'
      className={className}
      style={style}
    >
      {title && <title>{title}</title>}
      {order.map((i) =>
        closed(previews[i]) ? (
          <polygon
            key={i}
            points={f32Attr(previews[i])}
            fill={SHEET_INK.fill}
            stroke={SHEET_INK.ink}
            strokeWidth={unit * 0.8}
          />
        ) : (
          <polyline
            key={i}
            points={f32Attr(previews[i])}
            fill='none'
            stroke={SHEET_INK.ink}
            strokeWidth={unit * 0.8}
          />
        ),
      )}
    </svg>
  );
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

/**
 * One garment's pieces on the whole sheet, as filled outlines. When the file says how this garment
 * differs (the engine's variant marks), the difference is drawn on it: its cutting lines in blue,
 * the pieces it changes tinted, its own outlines dashed — every one optional.
 */
export function ModelThumb({
  sheet,
  outlines,
  hot = false,
  tinted,
  cutLines = [],
  cutOff = [],
  extra = [],
  className,
  style,
}: {
  sheet: BoxMm;
  outlines: readonly (readonly PtMm[])[];
  hot?: boolean;
  /** Per outline: a piece this garment changes (tinted blue). */
  tinted?: readonly boolean[];
  /** This garment's cutting lines (thick blue polylines, over the outlines). */
  cutLines?: readonly (readonly PtMm[])[];
  /** Per cut line: the PDF drew it off its outline (dashed, with a tooltip). */
  cutOff?: readonly boolean[];
  /** Outlines only this garment has (dashed blue). */
  extra?: readonly (readonly PtMm[])[];
  className?: string;
  style?: React.CSSProperties;
}) {
  // the pieces' own box, not the sheet's: a sheet is mostly empty paper round the pieces
  const all = [...outlines, ...cutLines, ...extra].flat();
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
      {outlines.map((o, i) => {
        if (o.length <= 2) return null;
        const tint = !hot && !!tinted?.[i];
        return (
          <polygon
            key={i}
            points={ptsAttr(o as PtMm[])}
            fill={hot || tint ? SHEET_INK.blue : SHEET_INK.fill}
            fillOpacity={hot || tint ? 0.12 : 1}
            stroke={hot || tint ? SHEET_INK.blue : SHEET_INK.ink}
            strokeWidth={unit * 0.5}
          />
        );
      })}
      {extra.map((o, i) =>
        o.length > 2 ? (
          <polygon
            key={`x${i}`}
            points={ptsAttr(o as PtMm[])}
            fill='none'
            stroke={SHEET_INK.blue}
            strokeWidth={unit * 0.6}
            strokeDasharray={`${unit * 2} ${unit * 1.5}`}
          />
        ) : null,
      )}
      {cutLines.map((l, i) =>
        l.length > 1 ? (
          <polyline
            key={`c${i}`}
            points={ptsAttr(l as PtMm[])}
            fill='none'
            stroke={SHEET_INK.blue}
            strokeWidth={unit * 1.6}
            strokeLinecap='round'
            strokeDasharray={cutOff[i] ? `${unit * 4} ${unit * 3}` : undefined}
          >
            {cutOff[i] && <title>drawn off its outline in the PDF</title>}
          </polyline>
        ) : null,
      )}
    </svg>
  );
}

/**
 * The closed outline a box was drawn round (a face seed's or a set-aside outline's own line): the
 * biggest closed line wholly inside the box that spans most of it; null when the box holds none.
 */
export function faceOutline(box: BoxMm, previews: readonly Float32Array[]): PtMm[] | null {
  const bx = chainBoxes(previews);
  const w = Math.max(box.maxX - box.minX, 1);
  const h = Math.max(box.maxY - box.minY, 1);
  let best = -1;
  let bestSpan = 0;
  for (const i of ownChains(box, previews).idx) {
    const a = previews[i];
    if (
      a.length < 8 ||
      Math.hypot(a[0] - a[a.length - 2], a[1] - a[a.length - 1]) > 0.01 * Math.max(w, h)
    )
      continue;
    const sw = bx[i * 4 + 2] - bx[i * 4];
    const sh = bx[i * 4 + 3] - bx[i * 4 + 1];
    if (sw < 0.8 * w || sh < 0.8 * h || sw * sh <= bestSpan) continue;
    best = i;
    bestSpan = sw * sh;
  }
  if (best < 0) return null;
  const a = previews[best];
  const pts: PtMm[] = [];
  for (let k = 0; k + 1 < a.length; k += 2) pts.push({ x: a[k], y: a[k + 1] });
  return pts;
}

/** Distance from p to the closed outline's edge. */
function toEdge(p: PtMm, poly: readonly PtMm[]) {
  let b = Infinity;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const c = poly[(i + 1) % poly.length];
    const dx = c.x - a.x;
    const dy = c.y - a.y;
    const l2 = dx * dx + dy * dy;
    const t = l2 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2)) : 0;
    b = Math.min(b, Math.hypot(a.x + t * dx - p.x, a.y + t * dy - p.y));
  }
  return b;
}

/** One part of a region where two pieces touch: its number, its own outline when known. */
export type TouchPart = {
  n: string;
  at: PtMm | null;
  /** The part's own outline (null: the part is the rest of the region). */
  outer: readonly PtMm[] | null;
};

const polyPath = (pts: readonly PtMm[], dx = 0, dy = 0) =>
  `M${pts.map((p) => `${p.x + dx},${vy(p.y + dy)}`).join('L')}Z`;

/**
 * Where two pieces touch, alone (no neighbour lines): the region's first part filled blue, the
 * other part (its own outline, when known) hatched in ink, the edge they share drawn heavy, a
 * number on each. `one` = the region as one piece (blue, no inner edge); `two` = the two parts
 * drawn apart.
 */
export function TouchCrop({
  region,
  parts,
  mode = 'ask',
  className,
  style,
}: {
  region: readonly PtMm[];
  parts: readonly TouchPart[];
  mode?: 'ask' | 'one' | 'two';
  className?: string;
  style?: React.CSSProperties;
}) {
  const hatch = `hatch${useId().replace(/[^\w-]/g, '')}`;
  const box = {
    minX: Math.min(...region.map((p) => p.x)),
    minY: Math.min(...region.map((p) => p.y)),
    maxX: Math.max(...region.map((p) => p.x)),
    maxY: Math.max(...region.map((p) => p.y)),
  };
  const size = Math.max(box.maxX - box.minX, box.maxY - box.minY, 1);
  // two pieces apart: the known parts move off the region's middle by a tenth of its size
  const gap = mode === 'two' ? size * 0.1 : 0;
  const known = mode === 'one' ? [] : parts.filter((p) => p.outer && p.outer.length > 2);
  const spanOf = (o: readonly PtMm[]) => {
    const xs = o.map((p) => p.x);
    const ys = o.map((p) => p.y);
    return {
      c: { x: (Math.min(...xs) + Math.max(...xs)) / 2, y: (Math.min(...ys) + Math.max(...ys)) / 2 },
      r: Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)) / 2,
    };
  };
  // a part too small to see under its own number (a label, a mark): ringed, its number beside
  const small = new Set(known.filter((p) => spanOf(p.outer!).r < size * 0.08));
  const side = small.size ? size * 0.2 : 0;
  const v = pad(
    {
      minX: box.minX - gap,
      minY: box.minY - gap,
      maxX: box.maxX + gap + side,
      maxY: box.maxY + gap,
    },
    0.06,
  );
  const unit = Math.max(v.w, v.h) / 120;
  const mid = { x: (box.minX + box.maxX) / 2, y: (box.minY + box.maxY) / 2 };
  const shift = (o: readonly PtMm[]) => {
    if (!gap) return { dx: 0, dy: 0 };
    const c = o.reduce((s, p) => ({ x: s.x + p.x / o.length, y: s.y + p.y / o.length }), {
      x: 0,
      y: 0,
    });
    const d = Math.hypot(c.x - mid.x, c.y - mid.y) || 1;
    return { dx: ((c.x - mid.x) / d) * gap, dy: ((c.y - mid.y) / d) * gap };
  };
  // the edge two parts share: a known part's sides that run inside the region, not along its rim
  const tol = size * 0.015;
  const shared = known.flatMap((p) => {
    const o = p.outer!;
    const segs: string[] = [];
    for (let i = 0; i < o.length; i++) {
      const a = o[i];
      const b = o[(i + 1) % o.length];
      if (toEdge({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, region) > tol)
        segs.push(`M${a.x},${vy(a.y)}L${b.x},${vy(b.y)}`);
    }
    return segs;
  });
  // the rest of the region (the part with no outline of its own): the region minus the known ones
  const rest = polyPath(region) + known.map((p) => polyPath(p.outer!)).join('');
  const badge = (p: TouchPart, blue: boolean, dx = 0, dy = 0) =>
    p.at ? (
      <g key={`b${p.n}`}>
        <rect
          x={p.at.x + dx - unit * 6}
          y={vy(p.at.y + dy) - unit * 6}
          width={unit * 12}
          height={unit * 12}
          fill={blue ? SHEET_INK.blue : SHEET_INK.ink}
        />
        <text
          x={p.at.x + dx}
          y={vy(p.at.y + dy)}
          fontSize={unit * 8}
          fill='#ffffff'
          textAnchor='middle'
          dominantBaseline='central'
        >
          {p.n}
        </text>
      </g>
    ) : null;
  return (
    <svg
      viewBox={`${v.x} ${v.y} ${v.w} ${v.h}`}
      preserveAspectRatio='xMidYMid meet'
      aria-hidden
      className={className}
      style={style}
    >
      <defs>
        <pattern
          id={hatch}
          patternUnits='userSpaceOnUse'
          width={unit * 3}
          height={unit * 3}
          patternTransform='rotate(45)'
        >
          <rect width={unit * 3} height={unit * 3} fill='#ffffff' />
          <line
            x1={0}
            y1={0}
            x2={0}
            y2={unit * 3}
            stroke={SHEET_INK.ink}
            strokeWidth={unit * 0.9}
          />
        </pattern>
      </defs>
      <path
        d={rest}
        fillRule='evenodd'
        fill={SHEET_INK.blue}
        fillOpacity={0.22}
        stroke={SHEET_INK.blue}
        strokeWidth={unit * 1.2}
      />
      {known.map((p) => {
        const { dx, dy } = shift(p.outer!);
        return (
          <path
            key={`k${p.n}`}
            d={polyPath(p.outer!, dx, dy)}
            fill={`url(#${hatch})`}
            stroke={SHEET_INK.ink}
            strokeWidth={unit * 1.2}
          />
        );
      })}
      {mode === 'ask' && shared.length > 0 && (
        <path
          d={shared.join('')}
          fill='none'
          stroke={SHEET_INK.ink}
          strokeWidth={unit * 3}
          strokeLinecap='round'
        />
      )}
      {mode !== 'one' &&
        parts.map((p) => {
          const own = known.includes(p);
          const { dx, dy } = own ? shift(p.outer!) : { dx: 0, dy: 0 };
          if (!small.has(p)) return badge(p, !own, dx, dy);
          const { c, r } = spanOf(p.outer!);
          const ring = Math.max(r + unit * 2.5, unit * 5);
          const tag = { ...p, at: { x: box.maxX + gap + side * 0.55, y: c.y + dy } };
          return (
            <g key={`s${p.n}`}>
              <circle
                cx={c.x + dx}
                cy={vy(c.y + dy)}
                r={ring}
                fill='none'
                stroke={SHEET_INK.ink}
                strokeWidth={unit * 1.2}
              />
              <line
                x1={c.x + dx + ring}
                y1={vy(c.y + dy)}
                x2={tag.at.x - unit * 6}
                y2={vy(tag.at.y)}
                stroke={SHEET_INK.ink}
                strokeWidth={unit * 0.8}
              />
              {badge(tag, false)}
            </g>
          );
        })}
    </svg>
  );
}
