import type { PieceGeom, Pt2 } from 'lib/assembly-skeleton/types';

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

const distance = (a: Pt2, b: Pt2): number => Math.hypot(b[0] - a[0], b[1] - a[1]);

/** Ink-only label outline and its physical fold, over the ordinary posed piece geometry. */
export function GarmentLabelOverlay({
  pieces,
  geoms,
  hair,
}: {
  pieces: readonly DrawnPiece[];
  geoms: ReadonlyMap<string, PieceGeom>;
  hair: number;
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
        const topLeft = mix(a, b, 0.15);
        const topRight = mix(a, b, 0.85);
        const bottomLeft = mix(d, c, 0.15);
        const bottomRight = mix(d, c, 0.85);
        const loopStart = mix(a, b, 0.28);
        const loopEnd = mix(a, b, 0.72);
        const topMiddle = mix(a, b, 0.5);
        const centre = mix(topMiddle, mix(d, c, 0.5), 0.5);
        const outwardLength = Math.max(distance(a, d) * 0.3, hair * 3);
        const centreDistance = Math.max(distance(topMiddle, centre), hair);
        const outward: Pt2 = [
          ((topMiddle[0] - centre[0]) / centreDistance) * outwardLength,
          ((topMiddle[1] - centre[1]) / centreDistance) * outwardLength,
        ];
        const loopControlA: Pt2 = [loopStart[0] + outward[0], loopStart[1] + outward[1]];
        const loopControlB: Pt2 = [loopEnd[0] + outward[0], loopEnd[1] + outward[1]];
        return (
          <g key={piece.key} data-garment-label={piece.key}>
            <path
              d={pathOf(outline, true)}
              fill={PAPER}
              stroke={INK}
              strokeWidth={hair * 1.5}
              strokeLinejoin='round'
            />
            {mark.fold === 'half' && (
              <path
                d={pathOf([d, c])}
                fill='none'
                stroke={INK}
                strokeWidth={hair * 3}
                data-label-fold='half'
              />
            )}
            {mark.fold === 'ends' && (
              <g
                fill='none'
                stroke={INK}
                strokeWidth={hair}
                strokeDasharray={`${hair * 3} ${hair * 2}`}
                data-label-fold='ends'
              >
                <path d={pathOf([topLeft, bottomLeft])} />
                <path d={pathOf([topRight, bottomRight])} />
              </g>
            )}
            {mark.fold === 'loop' && (
              <path
                d={`M${loopStart[0].toFixed(2)} ${loopStart[1].toFixed(
                  2,
                )} C${loopControlA[0].toFixed(2)} ${loopControlA[1].toFixed(
                  2,
                )} ${loopControlB[0].toFixed(2)} ${loopControlB[1].toFixed(
                  2,
                )} ${loopEnd[0].toFixed(2)} ${loopEnd[1].toFixed(2)}`}
                fill='none'
                stroke={INK}
                strokeWidth={hair * 1.5}
                data-label-fold='loop'
              />
            )}
          </g>
        );
      })}
    </g>
  );
}
