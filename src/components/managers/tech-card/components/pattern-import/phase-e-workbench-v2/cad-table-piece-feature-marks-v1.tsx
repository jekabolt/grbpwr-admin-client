import { SHEET_INK, ptsAttr, vy } from '../sheet-viewport';
import type {
  CadTablePieceFeatureLayer,
  CadTablePieceFeatures,
} from './cad-table-piece-features-v1';

export function CadTablePieceFeatureMarks({
  features,
  hiddenLayers,
  unit,
}: Readonly<{
  features: CadTablePieceFeatures;
  hiddenLayers: ReadonlySet<CadTablePieceFeatureLayer>;
  unit: number;
}>) {
  const { grain, internal, fold, notches, drills } = features;
  return (
    <g fill='none' aria-hidden='true' pointerEvents='none'>
      {!hiddenLayers.has('grain') && grain ? (
        <line
          data-cad-zero-connect-grainline=''
          x1={grain.a.x}
          y1={vy(grain.a.y)}
          x2={grain.b.x}
          y2={vy(grain.b.y)}
          stroke={SHEET_INK.blue}
          strokeDasharray='4 3'
          strokeWidth='1.25'
          vectorEffect='non-scaling-stroke'
          pointerEvents='none'
        />
      ) : null}
      {!hiddenLayers.has('internal') &&
        internal.map(({ pts, closed }, index) => (
          <polyline
            key={index}
            data-cad-zero-connect-internal=''
            points={ptsAttr(closed && pts.length ? [...pts, pts[0]!] : pts)}
            stroke={SHEET_INK.ink}
            strokeDasharray='2 3'
            vectorEffect='non-scaling-stroke'
          />
        ))}
      {!hiddenLayers.has('fold') && fold ? (
        <line
          data-cad-zero-connect-fold=''
          x1={fold.a.x}
          y1={vy(fold.a.y)}
          x2={fold.b.x}
          y2={vy(fold.b.y)}
          stroke={SHEET_INK.green}
          strokeDasharray='7 3 2 3'
          strokeWidth='1.5'
          vectorEffect='non-scaling-stroke'
        />
      ) : null}
      {!hiddenLayers.has('notches') &&
        notches.map(({ seg }, index) => (
          <polyline
            key={index}
            data-cad-zero-connect-notch=''
            points={ptsAttr(seg)}
            stroke={SHEET_INK.ink}
            strokeWidth='1.75'
            vectorEffect='non-scaling-stroke'
          />
        ))}
      {!hiddenLayers.has('drills') &&
        drills.map(({ at }, index) => (
          <circle
            key={index}
            data-cad-zero-connect-drill=''
            cx={at.x}
            cy={vy(at.y)}
            r={2.5 * unit}
            stroke={SHEET_INK.ink}
            strokeWidth='1.25'
            vectorEffect='non-scaling-stroke'
          />
        ))}
    </g>
  );
}
