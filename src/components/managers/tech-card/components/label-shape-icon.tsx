// A garment label's tile picture drawn from the label itself: its true proportions, a dashed stitch
// where it is sewn and its fold lines with the folded-under parts shaded. Straight lines, sharp corners.
import type { JSX } from 'react';

import { garmentLabelMark, type GarmentLabelLike } from './garment-label-pieces';
import { foldedSpans } from './label-fold-lines';

const VIEW = 64;
const FIT = 56;
const INSET = 2.5;
const STITCH = { strokeDasharray: '2 1.5', strokeWidth: 0.9 } as const;
const THIN = { strokeWidth: 0.6 } as const;

type Box = { x: number; y: number; w: number; h: number };

function stitches(attachment: string, b: Box): JSX.Element | null {
  const a = attachment.toLowerCase();
  if (!a.startsWith('sewn')) return null;
  const i = INSET;
  if (a.includes('4'))
    return <rect {...STITCH} x={b.x + i} y={b.y + i} width={b.w - 2 * i} height={b.h - 2 * i} />;
  if (a.includes('2'))
    return (
      <path
        {...STITCH}
        d={`M${b.x + i} ${b.y} V${b.y + b.h} M${b.x + b.w - i} ${b.y} V${b.y + b.h}`}
      />
    );
  const y = b.y + i + 1;
  return <path {...STITCH} d={`M${b.x} ${y} H${b.x + b.w}`} />;
}

function foldLines(lines: readonly number[], heightMm: number, b: Box): JSX.Element | null {
  if (!lines.length) return null;
  const at = (mm: number) => b.y + (mm / heightMm) * b.h;
  return (
    <g data-label-fold-lines={lines.join(',')}>
      {foldedSpans(lines, heightMm).map(([from, to]) => (
        <rect
          key={`${from}-${to}`}
          x={b.x}
          y={at(from)}
          width={b.w}
          height={at(to) - at(from)}
          fill='currentColor'
          stroke='none'
          opacity={0.22}
        />
      ))}
      <path {...THIN} d={lines.map((mm) => `M${b.x} ${at(mm)} H${b.x + b.w}`).join(' ')} />
    </g>
  );
}

export function LabelShapeIcon({
  label,
  size = 40,
  className,
}: {
  label: GarmentLabelLike;
  size?: number;
  className?: string;
}): JSX.Element {
  const shape = garmentLabelMark(label);
  const widthMm = shape?.widthMm ?? 50;
  const heightMm = shape?.heightMm ?? 20;
  const k = FIT / Math.max(widthMm, heightMm);
  const w = widthMm * k;
  const h = heightMm * k;
  const b: Box = { x: (VIEW - w) / 2, y: (VIEW - h) / 2, w, h };
  const kind = ((label.kind ?? '').trim() || (label.key ?? '').trim()).toLowerCase();
  return (
    <svg
      aria-hidden
      focusable='false'
      data-label-shape={kind}
      viewBox={`0 0 ${VIEW} ${VIEW}`}
      width={size}
      height={size}
      fill='none'
      stroke='currentColor'
      strokeLinecap='butt'
      strokeLinejoin='miter'
      className={className}
    >
      <rect x={b.x} y={b.y} width={b.w} height={b.h} strokeWidth={1.25} />
      {shape?.stitchLines?.length ? (
        <path
          {...STITCH}
          data-label-stitch-lines={shape.stitchLines.join(',')}
          d={shape.stitchLines
            .map((mm) => `M${b.x} ${b.y + (mm / heightMm) * b.h} H${b.x + b.w}`)
            .join(' ')}
        />
      ) : (
        stitches(shape?.attachment ?? label.attachment ?? '', b)
      )}
      {foldLines(shape?.foldLines ?? [], heightMm, b)}
    </svg>
  );
}
