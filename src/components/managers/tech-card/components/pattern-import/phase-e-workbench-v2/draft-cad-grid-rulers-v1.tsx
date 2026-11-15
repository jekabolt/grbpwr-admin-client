import { useId } from 'react';

import type { ViewBox } from '../sheet-viewport';

export const PATTERN_IMPORT_DXF_PHASE_E_DRAFT_CAD_GRID_RULERS_V1 =
  'pattern-import-dxf-phase-e-draft-cad-grid-rulers/1' as const;

export type PatternImportDxfPhaseEDraftCadGridScaleV1 = Readonly<{
  minorStepMm: number;
  majorStepMm: number;
  rulerThickness: number;
}>;

const NICE_MULTIPLIERS = Object.freeze([1, 2, 5] as const);

/** Keeps minor grid lines roughly 12–30 screen pixels apart at every zoom level. */
export function resolvePatternImportDxfPhaseEDraftCadGridScaleV1(
  mmPerNominalPixel: number,
): PatternImportDxfPhaseEDraftCadGridScaleV1 {
  const safeUnit =
    Number.isFinite(mmPerNominalPixel) && mmPerNominalPixel > 0 ? mmPerNominalPixel : 1;
  const targetMm = safeUnit * 18;
  const exponent = Math.floor(Math.log10(targetMm));
  const magnitude = 10 ** exponent;
  const normalized = targetMm / magnitude;
  const multiplier = NICE_MULTIPLIERS.find((candidate) => candidate >= normalized) ?? 10;
  const minorStepMm = multiplier * magnitude;
  return Object.freeze({
    minorStepMm,
    majorStepMm: minorStepMm * 5,
    rulerThickness: safeUnit * 24,
  });
}

function alignedTicks(min: number, max: number, step: number): readonly number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max) || !(max > min) || !(step > 0)) return [];
  const first = Math.ceil(min / step) * step;
  const count = Math.min(240, Math.max(0, Math.floor((max - first) / step) + 1));
  return Object.freeze(Array.from({ length: count }, (_, index) => first + index * step));
}

function formatMillimetres(value: number): string {
  const rounded = Math.abs(value) < 1e-7 ? 0 : Number(value.toFixed(3));
  return `${rounded}`;
}

export function PatternImportDxfPhaseEDraftCadGridRulersV1({
  box,
  unit,
  layer = 'all',
  yAxisDirection = 'up',
}: Readonly<{
  box: ViewBox;
  unit: number;
  layer?: 'all' | 'grid' | 'rulers';
  yAxisDirection?: 'up' | 'down';
}>) {
  const id = useId().replaceAll(':', '');
  const scale = resolvePatternImportDxfPhaseEDraftCadGridScaleV1(unit);
  const minorId = `draft-cad-minor-grid-${id}`;
  const majorId = `draft-cad-major-grid-${id}`;
  const majorXTicks = alignedTicks(box.x, box.x + box.w, scale.majorStepMm);
  const majorYTicks = alignedTicks(box.y, box.y + box.h, scale.majorStepMm);
  const fontSize = unit * 9;
  const tickLength = unit * 5;
  const showGrid = layer !== 'rulers';
  const showRulers = layer !== 'grid';

  return (
    <g data-draft-cad-grid-rulers-v1={layer} pointerEvents='none'>
      {showGrid ? (
        <defs>
          <pattern
            id={minorId}
            width={scale.minorStepMm}
            height={scale.minorStepMm}
            patternUnits='userSpaceOnUse'
          >
            <path
              data-draft-cad-grid-stroke-px='0.55'
              d={`M ${scale.minorStepMm} 0 L 0 0 0 ${scale.minorStepMm}`}
              fill='none'
              stroke='var(--color-borderColor)'
              strokeOpacity='0.22'
              strokeWidth={0.55}
              vectorEffect='non-scaling-stroke'
            />
          </pattern>
          <pattern
            id={majorId}
            width={scale.majorStepMm}
            height={scale.majorStepMm}
            patternUnits='userSpaceOnUse'
          >
            <path
              data-draft-cad-grid-stroke-px='0.75'
              d={`M ${scale.majorStepMm} 0 L 0 0 0 ${scale.majorStepMm}`}
              fill='none'
              stroke='var(--color-labelColor)'
              strokeOpacity='0.34'
              strokeWidth={0.75}
              vectorEffect='non-scaling-stroke'
            />
          </pattern>
        </defs>
      ) : null}

      {showGrid ? (
        <>
          <rect
            data-draft-cad-grid='minor'
            x={box.x}
            y={box.y}
            width={box.w}
            height={box.h}
            fill={`url(#${minorId})`}
          />
          <rect
            data-draft-cad-grid='major'
            x={box.x}
            y={box.y}
            width={box.w}
            height={box.h}
            fill={`url(#${majorId})`}
          />
        </>
      ) : null}

      {showGrid && box.x <= 0 && box.x + box.w >= 0 ? (
        <line
          data-draft-cad-origin-axis='y'
          x1={0}
          y1={box.y}
          x2={0}
          y2={box.y + box.h}
          stroke='var(--color-labelColor)'
          strokeOpacity='0.46'
          strokeWidth={1}
          vectorEffect='non-scaling-stroke'
        />
      ) : null}
      {showGrid && box.y <= 0 && box.y + box.h >= 0 ? (
        <line
          data-draft-cad-origin-axis='x'
          x1={box.x}
          y1={0}
          x2={box.x + box.w}
          y2={0}
          stroke='var(--color-labelColor)'
          strokeOpacity='0.46'
          strokeWidth={1}
          vectorEffect='non-scaling-stroke'
        />
      ) : null}

      {showRulers ? (
        <>
          <rect
            data-draft-cad-ruler-surface='x'
            x={box.x}
            y={box.y}
            width={box.w}
            height={scale.rulerThickness}
            fill='var(--color-bgColor)'
            fillOpacity='0.94'
          />
          <rect
            data-draft-cad-ruler-surface='y'
            x={box.x}
            y={box.y}
            width={scale.rulerThickness}
            height={box.h}
            fill='var(--color-bgColor)'
            fillOpacity='0.94'
          />
          <line
            x1={box.x}
            y1={box.y + scale.rulerThickness}
            x2={box.x + box.w}
            y2={box.y + scale.rulerThickness}
            stroke='var(--color-borderColor)'
            strokeWidth={0.75}
            vectorEffect='non-scaling-stroke'
          />
          <line
            x1={box.x + scale.rulerThickness}
            y1={box.y}
            x2={box.x + scale.rulerThickness}
            y2={box.y + box.h}
            stroke='var(--color-borderColor)'
            strokeWidth={0.75}
            vectorEffect='non-scaling-stroke'
          />
        </>
      ) : null}

      {showRulers
        ? majorXTicks.map((tick) => (
            <g key={`x:${tick}`} data-draft-cad-ruler-tick='x'>
              <line
                x1={tick}
                y1={box.y + scale.rulerThickness - tickLength}
                x2={tick}
                y2={box.y + scale.rulerThickness}
                stroke='var(--color-labelColor)'
                strokeWidth={0.8}
                vectorEffect='non-scaling-stroke'
              />
              {tick >= box.x + scale.rulerThickness ? (
                <text
                  x={tick + unit * 2}
                  y={box.y + scale.rulerThickness - unit * 7}
                  fill='var(--color-labelColor)'
                  fontSize={fontSize}
                >
                  {formatMillimetres(tick)}
                </text>
              ) : null}
            </g>
          ))
        : null}
      {showRulers
        ? majorYTicks.map((tick) => (
            <g key={`y:${tick}`} data-draft-cad-ruler-tick='y'>
              <line
                x1={box.x + scale.rulerThickness - tickLength}
                y1={tick}
                x2={box.x + scale.rulerThickness}
                y2={tick}
                stroke='var(--color-labelColor)'
                strokeWidth={0.8}
                vectorEffect='non-scaling-stroke'
              />
              {tick >= box.y + scale.rulerThickness ? (
                <text
                  x={box.x + unit * 3}
                  y={tick - unit * 2}
                  fill='var(--color-labelColor)'
                  fontSize={fontSize}
                >
                  {formatMillimetres(yAxisDirection === 'up' ? -tick : tick)}
                </text>
              ) : null}
            </g>
          ))
        : null}
      {showRulers ? (
        <text
          x={box.x + unit * 4}
          y={box.y + scale.rulerThickness - unit * 7}
          fill='var(--color-labelColor)'
          fontSize={fontSize}
          fontWeight='700'
        >
          mm
        </text>
      ) : null}
    </g>
  );
}
