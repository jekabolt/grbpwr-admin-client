// A garment label's tile picture drawn from the label itself: its true proportions, a dashed stitch
// where it is sewn and its fold lines with the folded-under parts shaded. Straight lines, sharp corners.
import type { JSX } from 'react';

import { garmentLabelMark, type GarmentLabelLike } from './garment-label-pieces';
import { labelAttachmentFact } from './label-attach-stitch';
import { foldedSpans, labelAxisLen } from './label-fold-lines';

const VIEW = 64;
const FIT = 56;
const INSET = 2.5;
const STITCH = { strokeDasharray: '2 1.5', strokeWidth: 0.9 } as const;
const THIN = { strokeWidth: 0.6 } as const;

export type Box = { x: number; y: number; w: number; h: number };

/**
 * Where the label is sewn, drawn from the one attachment fact (J1): the same scheme the step, the
 * label row and the tech pack words say. Straight dashed lines; corner tacks are short bars.
 */
export function stitches(label: GarmentLabelLike, b: Box, widthAxis: boolean): JSX.Element | null {
  const { scheme } = labelAttachmentFact(label);
  const i = INSET;
  const x0 = b.x + i;
  const x1 = b.x + b.w - i;
  const y0 = b.y + i;
  const y1 = b.y + b.h - i;
  const d = (path: string) => <path {...STITCH} data-label-stitch={scheme} d={path} />;
  switch (scheme) {
    case 'four':
      return d(`M${x0} ${y0} H${x1} V${y1} H${x0} Z`);
    case 'top_bottom':
      return d(`M${b.x} ${y0} H${b.x + b.w} M${b.x} ${y1} H${b.x + b.w}`);
    case 'left_right':
      return d(`M${x0} ${b.y} V${b.y + b.h} M${x1} ${b.y} V${b.y + b.h}`);
    case 'edge':
      return widthAxis
        ? d(`M${x0 + 1} ${b.y} V${b.y + b.h}`)
        : d(`M${b.x} ${y0 + 1} H${b.x + b.w}`);
    case 'seam': {
      // The garment seam runs past the label: the label is caught in it along the sewn edge.
      const o = Math.min(3, b.x - 0.5, b.y - 0.5);
      return widthAxis
        ? d(`M${x0} ${b.y - o} V${b.y + b.h + o}`)
        : d(`M${b.x - o} ${y0} H${b.x + b.w + o}`);
    }
    case 'corners': {
      const t = Math.min(3, b.w / 4, b.h / 4);
      return (
        <path
          data-label-stitch={scheme}
          strokeWidth={1.4}
          d={[
            `M${x0} ${y0} L${x0 + t} ${y0 + t}`,
            `M${x1} ${y0} L${x1 - t} ${y0 + t}`,
            `M${x0} ${y1} L${x0 + t} ${y1 - t}`,
            `M${x1} ${y1} L${x1 - t} ${y1 - t}`,
          ].join(' ')}
        />
      );
    }
    case 'piece': {
      // Printed on a fabric piece: the piece outline is the stitched part, around the label.
      const o = Math.min(2.5, b.x - 0.5, b.y - 0.5);
      return d(`M${b.x - o} ${b.y - o} H${b.x + b.w + o} V${b.y + b.h + o} H${b.x - o} Z`);
    }
    default:
      return null;
  }
}

function foldLines(
  lines: readonly number[],
  axisMm: number,
  b: Box,
  widthAxis: boolean,
  fold: string,
): JSX.Element | null {
  if (!lines.length) return null;
  const at = (mm: number) => (widthAxis ? b.x + (mm / axisMm) * b.w : b.y + (mm / axisMm) * b.h);
  return (
    <g data-label-fold-lines={lines.join(',')}>
      {foldedSpans(lines, axisMm, fold).map(([from, to]) => (
        <rect
          key={`${from}-${to}`}
          x={widthAxis ? at(from) : b.x}
          y={widthAxis ? b.y : at(from)}
          width={widthAxis ? at(to) - at(from) : b.w}
          height={widthAxis ? b.h : at(to) - at(from)}
          fill='currentColor'
          stroke='none'
          opacity={0.22}
        />
      ))}
      <path
        {...THIN}
        d={lines
          .map((mm) =>
            widthAxis ? `M${at(mm)} ${b.y} V${b.y + b.h}` : `M${b.x} ${at(mm)} H${b.x + b.w}`,
          )
          .join(' ')}
      />
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
  const widthAxis = shape?.foldAxis === 'width';
  const axisMm = labelAxisLen({ widthMm, heightMm, foldAxis: shape?.foldAxis });
  const teeTipMm =
    shape?.fold === 'tee' && (shape.foldLines?.length ?? 0) >= 2
      ? ((shape.foldLines?.[0] ?? 0) + (shape.foldLines?.at(-1) ?? 0)) / 2
      : 0;
  const sewnAt = widthAxis ? b.x + (teeTipMm / axisMm) * b.w : b.y + (teeTipMm / axisMm) * b.h;
  const kind = ((label.kind ?? '').trim() || (label.key ?? '').trim()).toLowerCase();
  // A label that is not sewn (hung, heat press …) has no sewn edge to draw.
  const { notSewn } = labelAttachmentFact({
    ...label,
    attachment: shape?.attachment ?? label.attachment,
  });
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
      {!notSewn && (
        <path
          d={widthAxis ? `M${sewnAt} ${b.y} V${b.y + b.h}` : `M${b.x} ${sewnAt} H${b.x + b.w}`}
          strokeWidth={2.5}
          data-label-sewn-edge=''
        />
      )}
      {shape?.stitchLines?.length ? (
        <path
          {...STITCH}
          data-label-stitch-lines={shape.stitchLines.join(',')}
          d={shape.stitchLines
            .map((mm) =>
              widthAxis
                ? `M${b.x + (mm / axisMm) * b.w} ${b.y} V${b.y + b.h}`
                : `M${b.x} ${b.y + (mm / axisMm) * b.h} H${b.x + b.w}`,
            )
            .join(' ')}
        />
      ) : (
        stitches({ ...label, attachment: shape?.attachment ?? label.attachment }, b, widthAxis)
      )}
      {foldLines(shape?.foldLines ?? [], axisMm, b, widthAxis, shape?.fold ?? '')}
    </svg>
  );
}
