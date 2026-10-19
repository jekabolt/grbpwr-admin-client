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

/** A box as its four corners (a set-aside face with no closed line of its own: its box). */
const boxPts = (b: BoxMm): PtMm[] => [
  { x: b.minX, y: b.minY },
  { x: b.maxX, y: b.minY },
  { x: b.maxX, y: b.maxY },
  { x: b.minX, y: b.maxY },
];

/**
 * A set-aside face as a closed outline: its own closed line when one spans its box, else its box
 * (a face closed by several lines — the ones it shares with a piece — has no line of its own).
 */
export function asideOutline(box: BoxMm, previews: readonly Float32Array[]): PtMm[] {
  return faceOutline(box, previews) ?? boxPts(box);
}

/**
 * The pieces of the sheet's lines that run inside a box (a hair past its border included): the
 * lines a face is closed by, also those that go on past it (the edge it shares with a piece).
 */
function boxLines(box: BoxMm, previews: readonly Float32Array[], skip: ReadonlySet<number>) {
  const bx = chainBoxes(previews);
  const t = Math.max(box.maxX - box.minX, box.maxY - box.minY) * 0.01 + 0.2;
  const x0 = box.minX - t;
  const x1 = box.maxX + t;
  const y0 = box.minY - t;
  const y1 = box.maxY + t;
  /** A segment cut to the box (Liang–Barsky), or null when it misses it. */
  const clip = (ax: number, ay: number, bxx: number, byy: number): [PtMm, PtMm] | null => {
    const dx = bxx - ax;
    const dy = byy - ay;
    let u0 = 0;
    let u1 = 1;
    for (const [p, q] of [
      [-dx, ax - x0],
      [dx, x1 - ax],
      [-dy, ay - y0],
      [dy, y1 - ay],
    ]) {
      if (p === 0) {
        if (q < 0) return null;
      } else {
        const r = q / p;
        if (p < 0) u0 = Math.max(u0, r);
        else u1 = Math.min(u1, r);
        if (u0 > u1) return null;
      }
    }
    return [
      { x: ax + u0 * dx, y: ay + u0 * dy },
      { x: ax + u1 * dx, y: ay + u1 * dy },
    ];
  };
  const runs: PtMm[][] = [];
  previews.forEach((a, i) => {
    if (skip.has(i) || a.length < 4) return;
    if (bx[i * 4] > x1 || bx[i * 4 + 2] < x0 || bx[i * 4 + 1] > y1 || bx[i * 4 + 3] < y0) return;
    let run: PtMm[] = [];
    for (let k = 0; k + 3 < a.length; k += 2) {
      const c = clip(a[k], a[k + 1], a[k + 2], a[k + 3]);
      const last = run[run.length - 1];
      if (c && last && Math.hypot(last.x - c[0].x, last.y - c[0].y) < 1e-6) run.push(c[1]);
      else {
        if (run.length >= 2) runs.push(run);
        run = c ? [c[0], c[1]] : [];
      }
    }
    if (run.length >= 2) runs.push(run);
  });
  return runs;
}

/** How a set-aside outline meets a piece: the edge they share, how much of it lies inside. */
export type AsideTouch = {
  /** Length of the outline's edge on the piece's edge, mm. */
  sharedMm: number;
  /** Length of the outline's edge inside the piece, mm. */
  insideMm: number;
  perimMm: number;
  /** The longest shared run is (nearly) a whole side of the outline's box. */
  full: boolean;
  /** The shared edge, as runs of points (the picture draws it heavy). */
  edge: PtMm[][];
};

/** Where a set-aside outline and a piece's outline meet (sampled along the outline's edge). */
export function asideTouch(outline: readonly PtMm[], host: readonly PtMm[]): AsideTouch {
  const xs = outline.map((p) => p.x);
  const ys = outline.map((p) => p.y);
  const w = Math.max(...xs) - Math.min(...xs);
  const h = Math.max(...ys) - Math.min(...ys);
  // a hairline: two lines drawn on one another, and the face's box (cut from a raster of the
  // sheet, ~1.5 mm in from its lines on a pattern sheet) — never a real gap between two pieces
  const tol = Math.min(4, Math.max(3, Math.max(w, h) * 0.01));
  let perim = 0;
  for (let i = 0; i < outline.length; i++) {
    const a = outline[i];
    const b = outline[(i + 1) % outline.length];
    perim += Math.hypot(b.x - a.x, b.y - a.y);
  }
  const step = Math.max(0.5, perim / 600);
  let sharedMm = 0;
  let insideMm = 0;
  const edge: PtMm[][] = [];
  let run: PtMm[] = [];
  const close = () => {
    if (run.length >= 2) edge.push(run);
    run = [];
  };
  for (let i = 0; i < outline.length; i++) {
    const a = outline[i];
    const b = outline[(i + 1) % outline.length];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    const n = Math.max(1, Math.ceil(len / step));
    for (let k = 0; k < n; k++) {
      const p = { x: a.x + ((b.x - a.x) * (k + 0.5)) / n, y: a.y + ((b.y - a.y) * (k + 0.5)) / n };
      if (toEdge(p, host) <= tol) {
        sharedMm += len / n;
        run.push(p);
      } else {
        close();
        if (insidePoly(p, host)) insideMm += len / n;
      }
    }
  }
  close();
  // the first and last runs of a closed outline can be one run
  if (edge.length > 1) {
    const f = edge[0][0];
    const l = edge[edge.length - 1][edge[edge.length - 1].length - 1];
    if (Math.hypot(f.x - l.x, f.y - l.y) <= step * 1.5) edge[0] = [...edge.pop()!, ...edge[0]];
  }
  const full = edge.some((r) => {
    const rx = Math.max(...r.map((p) => p.x)) - Math.min(...r.map((p) => p.x));
    const ry = Math.max(...r.map((p) => p.y)) - Math.min(...r.map((p) => p.y));
    return rx >= ry ? rx >= 0.85 * w : ry >= 0.85 * h;
  });
  return { sharedMm, insideMm, perimMm: perim, full, edge };
}

function insidePoly(p: PtMm, poly: readonly PtMm[]) {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) c = !c;
  }
  return c;
}

/**
 * One outline alone, as a silhouette: the outline itself (its own closed line, else the lines
 * that close it — those on its box's border too) and the lines inside it, the closed ones lightly
 * filled, biggest first so the inner ones stay on top. With `hosts`: the pieces it touches in
 * light grey round it, the edge it shares with the first drawn heavy («this rectangle under 6»).
 */
export function AsideSilhouette({
  box,
  previews,
  outline,
  hosts,
  title,
  className,
  style,
}: {
  box: BoxMm;
  previews: readonly Float32Array[];
  /** The outline itself (asideOutline): drawn filled under its lines. */
  outline?: readonly PtMm[];
  /** The pieces it touches: their outlines, and the edge it shares with each (first = likeliest). */
  hosts?: readonly { outer: readonly PtMm[]; edge: readonly PtMm[][] }[];
  /** The tooltip (why it was left out); the words are never on the picture. */
  title?: string;
  className?: string;
  style?: React.CSSProperties;
}) {
  // with pieces round it: as much of them as shows where it sits, never so much it gets lost
  const ctx = (() => {
    if (!hosts?.length) return box;
    const w = Math.max(box.maxX - box.minX, 1);
    const h = Math.max(box.maxY - box.minY, 1);
    const r = Math.max(w, h) * 0.9;
    const all = hosts.flatMap((x) => x.outer);
    return {
      minX: Math.max(Math.min(box.minX, ...all.map((p) => p.x)), box.minX - r),
      minY: Math.max(Math.min(box.minY, ...all.map((p) => p.y)), box.minY - r),
      maxX: Math.min(Math.max(box.maxX, ...all.map((p) => p.x)), box.maxX + r),
      maxY: Math.min(Math.max(box.maxY, ...all.map((p) => p.y)), box.maxY + r),
    };
  })();
  const v = pad(ctx, hosts?.length ? 0.06 : 0.04);
  const unit = Math.max(v.w, v.h) / 160;
  const bx = chainBoxes(previews);
  const { idx } = ownChains(box, previews);
  const border = boxLines(box, previews, new Set(idx));
  const span = (i: number) => (bx[i * 4 + 2] - bx[i * 4]) * (bx[i * 4 + 3] - bx[i * 4 + 1]);
  const closed = (a: Float32Array) =>
    a.length >= 8 &&
    Math.hypot(a[0] - a[a.length - 2], a[1] - a[a.length - 1]) <=
      Math.max(box.maxX - box.minX, box.maxY - box.minY) * 0.01;
  const order = [...idx].sort((a, b) => span(b) - span(a));
  const clip = `clip${useId().replace(/[^\w-]/g, '')}`;
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
      <defs>
        <clipPath id={clip}>
          <rect x={v.x} y={v.y} width={v.w} height={v.h} />
        </clipPath>
      </defs>
      <g clipPath={`url(#${clip})`}>
        {hosts?.map((x, k) => (
          <polygon
            key={`h${k}`}
            points={ptsAttr(x.outer)}
            fill={SHEET_INK.fill}
            stroke={SHEET_INK.source}
            strokeWidth={unit * 0.8}
            data-aside-host={k}
          />
        ))}
      </g>
      {outline && outline.length >= 3 && (
        <polygon
          points={ptsAttr(outline)}
          fill={hosts?.length ? SHEET_INK.pick : SHEET_INK.fill}
          stroke={SHEET_INK.ink}
          strokeWidth={unit * 0.8}
          data-aside-outline
        />
      )}
      {border.map((r, k) => (
        <polyline
          key={`b${k}`}
          points={ptsAttr(r)}
          fill='none'
          stroke={SHEET_INK.ink}
          strokeWidth={unit * 0.8}
        />
      ))}
      {order.map((i) =>
        closed(previews[i]) ? (
          <polygon
            key={i}
            points={f32Attr(previews[i])}
            fill={hosts?.length ? 'none' : SHEET_INK.fill}
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
      {!border.length && !order.length && !(outline && outline.length >= 3) && (
        <rect
          x={box.minX}
          y={vy(box.maxY)}
          width={box.maxX - box.minX}
          height={box.maxY - box.minY}
          fill={SHEET_INK.fill}
          stroke={SHEET_INK.blue}
          strokeWidth={unit * 1.2}
          data-aside-box
        />
      )}
      {hosts?.[0]?.edge.map((r, k) => (
        <polyline
          key={`e${k}`}
          points={ptsAttr(r)}
          fill='none'
          stroke={SHEET_INK.blue}
          strokeWidth={unit * 2.4}
          strokeLinecap='round'
          data-aside-edge
        />
      ))}
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

/** Where an outline is open: the two line ends either side of the gap, and the line each ends. */
export type GapGuess = {
  from: PtMm;
  to: PtMm;
  /** The gap's width, mm. */
  mm: number;
  /** Both ends point at each other (a line broken in two, not two lines passing). */
  facing: boolean;
  /** The lines that end there (index = ChainId). */
  chains: number[];
};

/**
 * The gap the fill ran out through: the open line ends round the ring (`at`), paired nearest
 * first — two ends that point at each other before two that only lie close.
 */
export function findGap(
  at: PtMm,
  previews: readonly Float32Array[],
  skip: ReadonlySet<number> = new Set(),
  reach = 40,
  /** Only the ends of these lines (the leaking outline's own walls). */
  only?: ReadonlySet<number>,
): GapGuess | null {
  const bx = chainBoxes(previews);
  type End = { p: PtMm; d: PtMm; chain: number };
  const ends: End[] = [];
  previews.forEach((a, i) => {
    if (skip.has(i) || a.length < 4 || (only && !only.has(i))) return;
    if (bx[i * 4] > at.x + reach || bx[i * 4 + 2] < at.x - reach) return;
    if (bx[i * 4 + 1] > at.y + reach || bx[i * 4 + 3] < at.y - reach) return;
    const n = a.length;
    if (Math.hypot(a[0] - a[n - 2], a[1] - a[n - 1]) <= 0.5) return;
    // each end and the way the line runs out of it (over its last few mm)
    const dirAt = (k: number, back: number) => {
      let j = k;
      while (j !== back && Math.hypot(a[j] - a[k], a[j + 1] - a[k + 1]) < 3) j += k < back ? 2 : -2;
      const dx = a[k] - a[j];
      const dy = a[k + 1] - a[j + 1];
      const l = Math.hypot(dx, dy) || 1;
      return { x: dx / l, y: dy / l };
    };
    for (const [k, back] of [
      [0, n - 2],
      [n - 2, 0],
    ]) {
      const p = { x: a[k], y: a[k + 1] };
      if (Math.hypot(p.x - at.x, p.y - at.y) <= reach)
        ends.push({ p, d: dirAt(k, back), chain: i });
    }
  });
  let best: (GapGuess & { score: number }) | null = null;
  for (let i = 0; i < ends.length; i++)
    for (let j = i + 1; j < ends.length; j++) {
      const A = ends[i];
      const B = ends[j];
      const dx = B.p.x - A.p.x;
      const dy = B.p.y - A.p.y;
      const mm = Math.hypot(dx, dy);
      if (mm < 0.05) continue;
      const facing = (A.d.x * dx + A.d.y * dy) / mm > 0.7 && (B.d.x * -dx + B.d.y * -dy) / mm > 0.7;
      // the gap lies at the ring: its middle near where the fill got out
      const mid = Math.hypot((A.p.x + B.p.x) / 2 - at.x, (A.p.y + B.p.y) / 2 - at.y);
      const score = (mm + mid * 0.5) * (facing ? 1 : 2.5);
      if (!best || score < best.score)
        best = { from: A.p, to: B.p, mm, facing, chains: [...new Set([A.chain, B.chain])], score };
    }
  if (!best) return null;
  const { score: _s, ...g } = best;
  void _s;
  return g;
}

/**
 * A piece that does not close, alone: its open line(s) in blue, the sheet's other lines faint, the
 * two ends marked and the closing stroke across the gap — dashed (`ask`), solid (`closed`).
 */
export function GapCrop({
  gap,
  previews,
  mode = 'ask',
  className,
  style,
}: {
  gap: GapGuess;
  previews: readonly Float32Array[];
  mode?: 'ask' | 'closed' | 'drop';
  className?: string;
  style?: React.CSSProperties;
}) {
  const bx = chainBoxes(previews);
  // cropped to the piece: the open line's box (never smaller than a hand's width round the gap)
  const box = gap.chains.reduce(
    (b, i) => ({
      minX: Math.min(b.minX, bx[i * 4]),
      minY: Math.min(b.minY, bx[i * 4 + 1]),
      maxX: Math.max(b.maxX, bx[i * 4 + 2]),
      maxY: Math.max(b.maxY, bx[i * 4 + 3]),
    }),
    {
      minX: Math.min(gap.from.x, gap.to.x) - 30,
      minY: Math.min(gap.from.y, gap.to.y) - 30,
      maxX: Math.max(gap.from.x, gap.to.x) + 30,
      maxY: Math.max(gap.from.y, gap.to.y) + 30,
    },
  );
  const v = pad(box, 0.06);
  const unit = Math.max(v.w, v.h) / 160;
  const clip = `gap${useId().replace(/[^\w-]/g, '')}`;
  const own = new Set(gap.chains);
  const ink = mode === 'drop' ? SHEET_INK.mut : SHEET_INK.blue;
  return (
    <svg
      viewBox={`${v.x} ${v.y} ${v.w} ${v.h}`}
      preserveAspectRatio='xMidYMid meet'
      role='img'
      aria-label={mode === 'closed' ? 'the outline closed' : 'the open outline'}
      className={className}
      style={style}
    >
      <defs>
        <clipPath id={clip}>
          <rect x={v.x} y={v.y} width={v.w} height={v.h} />
        </clipPath>
      </defs>
      <g clipPath={`url(#${clip})`}>
        {boxLines(
          { minX: v.x, maxX: v.x + v.w, minY: -(v.y + v.h), maxY: -v.y },
          previews,
          own,
        ).map((r, k) => (
          <polyline
            key={k}
            points={ptsAttr(r)}
            fill='none'
            stroke={SHEET_INK.pick}
            strokeWidth={unit * 0.6}
          />
        ))}
        {gap.chains.map((i) => (
          <polyline
            key={`c${i}`}
            points={f32Attr(previews[i])}
            fill='none'
            stroke={ink}
            strokeWidth={unit * 1.4}
            strokeDasharray={mode === 'drop' ? `${unit * 3} ${unit * 2}` : undefined}
            data-gap-chain={i}
          />
        ))}
        {mode !== 'drop' && (
          <line
            x1={gap.from.x}
            y1={vy(gap.from.y)}
            x2={gap.to.x}
            y2={vy(gap.to.y)}
            stroke={SHEET_INK.blue}
            strokeWidth={unit * (mode === 'closed' ? 1.4 : 1.8)}
            strokeDasharray={mode === 'ask' ? `${unit * 2.5} ${unit * 2}` : undefined}
            data-gap-bridge
          />
        )}
        {mode === 'ask' &&
          [gap.from, gap.to].map((p, k) => (
            <circle
              key={`e${k}`}
              cx={p.x}
              cy={vy(p.y)}
              r={unit * 2.6}
              fill='#ffffff'
              stroke={SHEET_INK.blue}
              strokeWidth={unit * 1.2}
              data-gap-end
            />
          ))}
      </g>
    </svg>
  );
}
