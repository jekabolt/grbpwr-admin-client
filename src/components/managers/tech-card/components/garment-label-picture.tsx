import type { PieceGeom, Pt2 } from 'lib/assembly-skeleton/types';

import { foldedSpans } from './label-fold-lines';

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
 * The label outline, its fold lines and the folded-under parts shaded, over the ordinary posed piece geometry, in the colour of
 * the pieces it lies on (`stroke`), so a label reads as one more piece of the garment.
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
        const mitreInset = Math.min(mark.heightMm * 0.6, mark.widthMm * 0.2) / mark.widthMm;
        const outline =
          mark.fold === 'mitre'
            ? [a, b, mix(c, d, mitreInset), mix(d, c, mitreInset)]
            : piece.drawn;
        const lines = (mark.foldLines ?? []).filter((mm) => mm > 0 && mm < mark.heightMm);
        return (
          <g key={piece.key} data-garment-label={piece.key}>
            <path
              d={pathOf(outline, true)}
              fill={PAPER}
              stroke={stroke}
              strokeWidth={outlineWidth ?? hair * 1.5}
              strokeLinejoin='round'
            />
            {foldedSpans(lines, mark.heightMm).map(([from, to]) => (
              <path
                key={`${from}-${to}`}
                d={pathOf(
                  [
                    mix(a, d, from / mark.heightMm),
                    mix(b, c, from / mark.heightMm),
                    mix(b, c, to / mark.heightMm),
                    mix(a, d, to / mark.heightMm),
                  ],
                  true,
                )}
                fill={stroke}
                stroke='none'
                opacity={0.22}
                data-label-folded=''
              />
            ))}
            {lines.length ? (
              <g
                fill='none'
                stroke={stroke}
                strokeWidth={hair}
                strokeDasharray={`${hair * 3} ${hair * 2}`}
                data-label-fold-lines={lines.join(',')}
              >
                {lines.map((mm) => (
                  <path
                    key={mm}
                    d={pathOf([mix(a, d, mm / mark.heightMm), mix(b, c, mm / mark.heightMm)])}
                  />
                ))}
              </g>
            ) : null}
          </g>
        );
      })}
    </g>
  );
}
