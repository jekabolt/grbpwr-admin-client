import type { PatternImportDxfProductPhaseEAssemblyProjectionV1 } from 'lib/pattern-import/dxf-product-phase-e-assembly-workbench-v1';

import { SHEET_INK, vy } from '../sheet-viewport';
import { resolvePatternImportDxfPhaseEVertexV1 } from './measurement-v1';
import {
  formatPatternImportDxfPhaseEDraftCadMeasurementV1,
  type PatternImportDxfPhaseEDraftCadTopologySessionV1,
} from './draft-cad-topology-session-v1';

export function PatternImportDxfPhaseEDraftCadTopologyOverlayV1({
  projection,
  state,
  pieceId,
  unit,
}: Readonly<{
  projection: PatternImportDxfProductPhaseEAssemblyProjectionV1;
  state: PatternImportDxfPhaseEDraftCadTopologySessionV1;
  pieceId: string;
  unit: number;
}>) {
  return (
    <g
      data-draft-cad-topology-overlay-v1=''
      data-topology-source-identity={state.sourceIdentity}
      pointerEvents='none'
    >
      {state.measurements.map((measurement) => {
        if (measurement.anchors[0]?.pieceId !== pieceId) return null;
        const vertices = measurement.anchors.map((anchor) =>
          resolvePatternImportDxfPhaseEVertexV1(projection, anchor),
        );
        if (vertices.some((vertex) => vertex === null)) return null;
        const first = vertices[0]!;
        const second = vertices[1] ?? null;
        const labelX = second ? (first.pointMm.x + second.pointMm.x) / 2 : first.pointMm.x;
        const labelY = second ? (first.pointMm.y + second.pointMm.y) / 2 : first.pointMm.y;
        return (
          <g
            key={measurement.id}
            data-draft-cad-measurement={measurement.kind}
            data-measurement-id={measurement.id}
          >
            {second ? (
              <line
                x1={first.pointMm.x}
                y1={vy(first.pointMm.y)}
                x2={second.pointMm.x}
                y2={vy(second.pointMm.y)}
                stroke={SHEET_INK.red}
                strokeWidth={1.5}
                vectorEffect='non-scaling-stroke'
              />
            ) : (
              <circle
                cx={first.pointMm.x}
                cy={vy(first.pointMm.y)}
                r={unit * 4}
                fill={SHEET_INK.red}
              />
            )}
            <text
              x={labelX}
              y={vy(labelY) - unit * 7}
              textAnchor='middle'
              fill={SHEET_INK.red}
              fontSize={unit * 9}
              fontWeight='700'
              paintOrder='stroke'
              stroke='var(--color-bgColor)'
              strokeWidth={3}
              vectorEffect='non-scaling-stroke'
            >
              {formatPatternImportDxfPhaseEDraftCadMeasurementV1(
                projection,
                measurement,
                state.unit,
              )}
            </text>
          </g>
        );
      })}

      {state.callouts.map((callout, index) => {
        if (callout.anchor.pieceId !== pieceId) return null;
        const vertex = resolvePatternImportDxfPhaseEVertexV1(projection, callout.anchor);
        if (!vertex) return null;
        const dx = unit * 28;
        const dy = unit * 22;
        const labelX = vertex.pointMm.x + dx;
        const labelY = vy(vertex.pointMm.y) - dy;
        return (
          <g key={callout.id} data-draft-cad-callout={callout.id}>
            <line
              x1={vertex.pointMm.x}
              y1={vy(vertex.pointMm.y)}
              x2={labelX}
              y2={labelY}
              stroke={SHEET_INK.ink}
              strokeWidth={1}
              vectorEffect='non-scaling-stroke'
            />
            <circle
              cx={vertex.pointMm.x}
              cy={vy(vertex.pointMm.y)}
              r={unit * 3}
              fill={SHEET_INK.ink}
            />
            <circle cx={labelX} cy={labelY} r={unit * 8} fill={SHEET_INK.ink} />
            <text
              x={labelX}
              y={labelY + unit * 2.5}
              textAnchor='middle'
              fill='var(--color-bgColor)'
              fontSize={unit * 7}
              fontWeight='700'
            >
              {index + 1}
            </text>
            <text
              x={labelX + unit * 11}
              y={labelY + unit * 2.5}
              fill={SHEET_INK.ink}
              fontSize={unit * 7}
            >
              {callout.text.length > 32 ? `${callout.text.slice(0, 32)}…` : callout.text}
            </text>
          </g>
        );
      })}
    </g>
  );
}
