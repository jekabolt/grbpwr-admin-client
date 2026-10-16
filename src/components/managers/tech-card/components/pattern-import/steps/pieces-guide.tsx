// The PIECES guide's pictures: the question card shows what it asks about, small, beside the
// answers — a crop of the region (its outline and the drawn lines round it, the gap ring) and, for
// the model question, one thumbnail of the sheet per model. Display only; the canvas stays the
// place where answers are drawn.
import { memo } from 'react';
import type { BoxMm, PtMm } from 'lib/pattern-import/types';
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
  className,
  style,
}: {
  box: BoxMm;
  outer: readonly PtMm[];
  previews: readonly Float32Array[];
  stroke: string;
  leakAt?: PtMm | null;
  className?: string;
  style?: React.CSSProperties;
}) {
  const v = pad(box, 0.12);
  const unit = Math.max(v.w, v.h) / 160;
  return (
    <svg
      viewBox={`${v.x} ${v.y} ${v.w} ${v.h}`}
      preserveAspectRatio='xMidYMid meet'
      aria-hidden
      className={className}
      style={style}
    >
      <Lines previews={previews} unit={unit} />
      {outer.length > 2 && (
        <polygon
          points={ptsAttr(outer as PtMm[])}
          fill={SHEET_INK.fill}
          fillOpacity={0.6}
          stroke={stroke}
          strokeWidth={unit * 1.6}
          strokeDasharray={`${unit * 6} ${unit * 4}`}
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
    </svg>
  );
}

/** One model's pieces on the whole sheet, as small filled outlines. */
export function ModelThumb({
  sheet,
  outlines,
  className,
  style,
}: {
  sheet: BoxMm;
  outlines: readonly (readonly PtMm[])[];
  className?: string;
  style?: React.CSSProperties;
}) {
  const v = pad(sheet, 0.03);
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
            fill={SHEET_INK.fill}
            stroke={SHEET_INK.ink}
            strokeWidth={unit}
          />
        ) : null,
      )}
    </svg>
  );
}
