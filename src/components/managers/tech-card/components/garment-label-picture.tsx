import type { PieceGeom, Pt2 } from 'lib/assembly-skeleton/types';

import { labelAttachmentFact } from './label-attach-stitch';
import { labelAssembly, labelAxisLen } from './label-fold-lines';

const INK = 'var(--color-textColor)';
const PAPER = 'var(--color-bgColor)';

type DrawnPiece = { key: string; drawn: readonly Pt2[] };

const pathOf = (points: readonly Pt2[], close = false) =>
  `${points
    .map(([x, y], index) => `${index ? 'L' : 'M'}${x.toFixed(2)} ${y.toFixed(2)}`)
    .join(' ')}${close ? ' Z' : ''}`;

const mix = (a: Pt2, b: Pt2, at: number): Pt2 => [
  a[0] + (b[0] - a[0]) * at,
  a[1] + (b[1] - a[1]) * at,
];

/**
 * The label as it lies on the garment — folded, cut at its stitch to the part that shows — over the ordinary posed piece
 * geometry, in the colour of the pieces it lies on (`stroke`), so a label reads as one more piece of the garment. The sewn
 * edge is heavy and its stitch is dashed.
 */
export function GarmentLabelOverlay({
  pieces,
  geoms,
  hair,
  stroke = INK,
  outlineWidth,
}: {
  pieces: readonly DrawnPiece[];
  geoms: ReadonlyMap<string, PieceGeom>;
  hair: number;
  stroke?: string;
  /** The pieces' outline width; the label's own hairline when not given. */
  outlineWidth?: number;
}) {
  const labels = pieces.filter((piece) => geoms.get(piece.key)?.garmentLabel);
  if (!labels.length) return null;
  return (
    <g pointerEvents='none' data-garment-labels=''>
      {labels.map((piece) => {
        const mark = geoms.get(piece.key)!.garmentLabel!;
        const [a, b, c, d] = piece.drawn;
        if (!a || !b || !c || !d) return null;
        const fold = mark.foldLines ?? [];
        const axisMm = labelAxisLen(mark);
        const sewn = labelAssembly(fold, mark.stitchLines ?? [], axisMm, mark.fold);
        const fact = labelAttachmentFact(mark);
        const sewnAt = sewn.sewnAtMm ?? 0;
        const sewnT = sewn.heightMm > 0 ? sewnAt / sewn.heightMm : 0;
        const mitreInset = Math.min(mark.heightMm * 0.6, mark.widthMm * 0.2) / mark.widthMm;
        const outline =
          mark.fold === 'mitre' && !sewn.sewnTop
            ? [a, b, mix(c, d, mitreInset), mix(d, c, mitreInset)]
            : piece.drawn;
        return (
          <g key={piece.key} data-garment-label={piece.key} data-label-layers={sewn.layers}>
            <path
              d={pathOf(outline, true)}
              fill={PAPER}
              stroke={stroke}
              strokeWidth={outlineWidth ?? hair * 1.5}
              strokeLinejoin='round'
            />
            {!fact.notSewn && (
              <path
                d={pathOf(
                  mark.foldAxis === 'width'
                    ? [mix(a, b, sewnT), mix(d, c, sewnT)]
                    : [mix(d, a, sewnT), mix(c, b, sewnT)],
                )}
                fill='none'
                stroke={stroke}
                strokeWidth={(outlineWidth ?? hair * 1.5) * 1.8}
                data-label-sewn-edge=''
              />
            )}
            {!sewn.shownStitches.length &&
              attachmentStitch(mark, [a, b, c, d], outlineWidth ?? hair * 1.5, stroke)}
            {sewn.shownStitches.map((at) => {
              // The picture is y-up. Legacy labels sew the top d–c side; width-axis labels sew the
              // left a–d side. A stitch on an edge sits just inside the outline.
              const inset = Math.min(1.5, sewn.heightMm * 0.08);
              const mm = Math.min(Math.max(at, inset), sewn.heightMm - inset);
              const t = sewn.heightMm > 0 ? mm / sewn.heightMm : 0;
              const width = outlineWidth ?? hair * 1.5;
              return (
                <path
                  key={at}
                  d={pathOf(
                    mark.foldAxis === 'width'
                      ? [mix(a, b, t), mix(d, c, t)]
                      : [mix(d, a, t), mix(c, b, t)],
                  )}
                  fill='none'
                  stroke={stroke}
                  strokeWidth={width}
                  strokeDasharray={`${width * 2.5} ${width * 1.5}`}
                  data-label-stitch={at}
                />
              );
            })}
          </g>
        );
      })}
    </g>
  );
}

/**
 * A label with no stitch lines of its own is drawn sewn the way its ATTACHMENT word says (J1): the
 * same fact the step, the label row and the tech pack tables print. The picture is y-up: d–c is the
 * top edge, a–d the left one.
 */
function attachmentStitch(
  mark: { attachment?: string; foldAxis?: string; widthMm: number; heightMm: number },
  [a, b, c, d]: readonly [Pt2, Pt2, Pt2, Pt2],
  width: number,
  stroke: string,
) {
  const { scheme } = labelAttachmentFact(mark);
  // u runs left → right, v top → bottom, both 0..1 over the drawn label.
  const at = (u: number, v: number): Pt2 => mix(mix(d, c, u), mix(a, b, u), v);
  const iu = Math.min(1.5 / Math.max(mark.widthMm, 1), 0.1);
  const iv = Math.min(1.5 / Math.max(mark.heightMm, 1), 0.1);
  const widthAxis = mark.foldAxis === 'width';
  const h = (v: number, u0 = 0, u1 = 1) => [at(u0, v), at(u1, v)];
  const v = (u: number, v0 = 0, v1 = 1) => [at(u, v0), at(u, v1)];
  const lines: Pt2[][] = [];
  switch (scheme) {
    case 'four':
      lines.push([at(iu, iv), at(1 - iu, iv), at(1 - iu, 1 - iv), at(iu, 1 - iv), at(iu, iv)]);
      break;
    case 'top_bottom':
      lines.push(h(iv), h(1 - iv));
      break;
    case 'left_right':
      lines.push(v(iu), v(1 - iu));
      break;
    case 'edge':
      lines.push(widthAxis ? v(iu * 2) : h(iv * 2));
      break;
    case 'seam':
      lines.push(widthAxis ? v(iu, -0.15, 1.15) : h(iv, -0.15, 1.15));
      break;
    case 'corners': {
      const tu = Math.min(0.15, 3 / Math.max(mark.widthMm, 1));
      const tv = Math.min(0.15, 3 / Math.max(mark.heightMm, 1));
      return (
        <path
          d={[
            [at(iu, iv), at(iu + tu, iv + tv)],
            [at(1 - iu, iv), at(1 - iu - tu, iv + tv)],
            [at(iu, 1 - iv), at(iu + tu, 1 - iv - tv)],
            [at(1 - iu, 1 - iv), at(1 - iu - tu, 1 - iv - tv)],
          ]
            .map((line) => pathOf(line))
            .join(' ')}
          fill='none'
          stroke={stroke}
          strokeWidth={width * 1.4}
          data-label-attach={scheme}
        />
      );
    }
    case 'piece': {
      // Printed on a fabric piece: the piece outline around the label is the sewn part.
      const ou = Math.min(0.1, 2.5 / Math.max(mark.widthMm, 1));
      const ov = Math.min(0.15, 2.5 / Math.max(mark.heightMm, 1));
      lines.push([
        at(-ou, -ov),
        at(1 + ou, -ov),
        at(1 + ou, 1 + ov),
        at(-ou, 1 + ov),
        at(-ou, -ov),
      ]);
      break;
    }
    default:
      return null;
  }
  return (
    <path
      d={lines.map((line) => pathOf(line)).join(' ')}
      fill='none'
      stroke={stroke}
      strokeWidth={width}
      strokeDasharray={`${width * 2.5} ${width * 1.5}`}
      data-label-attach={scheme}
    />
  );
}
