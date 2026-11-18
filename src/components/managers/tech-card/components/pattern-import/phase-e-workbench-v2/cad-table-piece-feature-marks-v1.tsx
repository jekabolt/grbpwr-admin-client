import { labelAnchor } from 'lib/nesting/render/label-fit';
import { AUTHORED_TEXT_HEIGHT_MM } from 'lib/pattern-import/manifest/authored-text';
import type { PtMm } from 'lib/pattern-import/types';
import { SHEET_INK, ptsAttr, vy } from '../sheet-viewport';
import type {
  CadTablePieceFeatureLayer,
  CadTablePieceFeatures,
} from './cad-table-piece-features-v1';

export function CadTablePieceFeatureMarks({
  features,
  hiddenLayers,
  unit,
  materialRings,
}: Readonly<{
  features: CadTablePieceFeatures;
  hiddenLayers: ReadonlySet<CadTablePieceFeatureLayer>;
  unit: number;
  materialRings: readonly (readonly PtMm[])[];
}>) {
  const {
    grain,
    internal,
    fold,
    savedFoldAxes,
    seamAllowance,
    notches,
    drills,
    pointMarks,
    textMarks,
    pieceLabel,
    materialLabel,
  } = features;
  const firstRing = materialRings[0];
  const foldAxes = [
    ...(fold ? [{ foldKey: undefined, a: fold.a, b: fold.b }] : []),
    ...(savedFoldAxes ?? []),
  ];
  const showName = !hiddenLayers.has('pieceLabel') && !!pieceLabel;
  const showMaterial = !hiddenLayers.has('materialLabel') && !!materialLabel;
  const anchor = firstRing && (showName || showMaterial) ? labelAnchor(firstRing) : null;
  return (
    <g fill='none' aria-hidden='true' pointerEvents='none'>
      {!hiddenLayers.has('seamAllowance') && seamAllowance ? (
        <path
          data-cad-zero-connect-seam-allowance=''
          data-cad-seam-allowance-cut-path={seamAllowance.cutPathId}
          data-cad-seam-allowance-sewing-path={seamAllowance.sewingPathId}
          d={`M ${ptsAttr(seamAllowance.cut)} Z M ${ptsAttr(seamAllowance.sewing)} Z`}
          fill={SHEET_INK.mut}
          fillOpacity='0.26'
          fillRule='evenodd'
        />
      ) : null}
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
      {!hiddenLayers.has('fold') &&
        foldAxes.map(({ foldKey, a, b }) => (
          <line
            key={foldKey ?? 'pattern-fold'}
            data-cad-zero-connect-fold=''
            data-cad-saved-fold-key={foldKey}
            x1={a.x}
            y1={vy(a.y)}
            x2={b.x}
            y2={vy(b.y)}
            stroke={SHEET_INK.green}
            strokeDasharray='7 3 2 3'
            strokeWidth='1.5'
            vectorEffect='non-scaling-stroke'
          />
        ))}
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
      {!hiddenLayers.has('pointMarks') &&
        pointMarks?.map(({ kind, at }, index) => (
          <circle
            key={index}
            data-cad-zero-connect-construction-point={kind}
            cx={at.x}
            cy={vy(at.y)}
            r={1.75 * unit}
            fill={kind === 'draft-point' ? SHEET_INK.blue : 'none'}
            stroke={SHEET_INK.blue}
            vectorEffect='non-scaling-stroke'
          />
        ))}
      {!hiddenLayers.has('textMarks') &&
        textMarks?.map(({ at, text }, index) => (
          <text
            key={index}
            data-cad-zero-connect-text-mark=''
            x={at.x}
            y={vy(at.y)}
            fontSize={AUTHORED_TEXT_HEIGHT_MM}
            fill={SHEET_INK.ink}
          >
            {text}
          </text>
        ))}
      {anchor ? (
        <text
          x={anchor.x}
          y={vy(anchor.y)}
          textAnchor='middle'
          fontSize={12 * unit}
          fill={SHEET_INK.ink}
          stroke='var(--color-bgColor)'
          strokeWidth={3 * unit}
          strokeLinejoin='round'
          paintOrder='stroke'
          pointerEvents='none'
        >
          {showName ? <tspan data-cad-zero-connect-piece-label=''>{pieceLabel}</tspan> : null}
          {showMaterial ? (
            <tspan
              data-cad-zero-connect-material-label=''
              x={anchor.x}
              dy={showName ? 13 * unit : 0}
              fontSize={10 * unit}
              fill={SHEET_INK.mut}
            >
              {materialLabel}
            </tspan>
          ) : null}
        </text>
      ) : null}
    </g>
  );
}
