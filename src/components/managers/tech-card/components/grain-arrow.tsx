import { grainArrowGeometry, type GrainSegment } from 'lib/nesting/geom/grain-display';

export const GRAIN_INK = 'var(--color-textColor)';

const points = (polygon: readonly { x: number; y: number }[]) =>
  polygon.map((p) => `${p.x},${p.y}`).join(' ');

export function GrainArrow({
  segment,
  pxPerUnit,
  tone = GRAIN_INK,
  dashed = false,
  minRenderedLengthPx = 8,
}: {
  segment: GrainSegment;
  /** Rendered CSS pixels per SVG user unit. */
  pxPerUnit: number;
  tone?: string;
  dashed?: boolean;
  minRenderedLengthPx?: number;
}) {
  const scale = Math.max(pxPerUnit, 1e-6);
  const renderedLength = Math.hypot(segment.b.x - segment.a.x, segment.b.y - segment.a.y) * scale;
  if (renderedLength < minRenderedLengthPx) return null;
  const headPx = Math.min(7, Math.max(3, renderedLength * 0.2));
  const arrow = grainArrowGeometry(segment, headPx / scale);
  if (!arrow) return null;
  const strokeWidth = Math.max(1, Math.min(1.5, renderedLength / 80)) / scale;
  return (
    <g pointerEvents='none' fill={tone}>
      <line
        x1={arrow.shaft.a.x}
        y1={arrow.shaft.a.y}
        x2={arrow.shaft.b.x}
        y2={arrow.shaft.b.y}
        stroke={tone}
        strokeWidth={strokeWidth}
        strokeDasharray={dashed ? `${6 / scale} ${4 / scale}` : undefined}
      />
      {arrow.heads.map((head, index) => (
        <polygon key={index} points={points(head)} style={{ fill: tone, stroke: 'none' }} />
      ))}
    </g>
  );
}
