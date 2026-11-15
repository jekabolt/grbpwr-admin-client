export const PATTERN_IMPORT_DXF_PHASE_E_MEASUREMENT_UNITS_V1 =
  'pattern-import-dxf-phase-e-measurement-units/1' as const;

export type PatternImportDxfPhaseEMeasurementUnitV1 = 'mm' | 'cm' | 'in';

export type PatternImportDxfPhaseEMeasurementValueV1 = Readonly<{
  /** Unrounded authority retained exactly as supplied by the geometry owner. */
  sourceMm: number;
  unit: PatternImportDxfPhaseEMeasurementUnitV1;
  value: number;
  formatted: string;
}>;

export type PatternImportDxfPhaseEMeasurementDisplayV1 = Readonly<{
  schemaVersion: typeof PATTERN_IMPORT_DXF_PHASE_E_MEASUREMENT_UNITS_V1;
  unit: PatternImportDxfPhaseEMeasurementUnitV1;
  point: Readonly<{
    sourceMm: Readonly<{ x: number; y: number }>;
    x: PatternImportDxfPhaseEMeasurementValueV1;
    y: PatternImportDxfPhaseEMeasurementValueV1;
    formatted: string;
  }>;
  straight: PatternImportDxfPhaseEMeasurementValueV1;
  alongEdge: PatternImportDxfPhaseEMeasurementValueV1;
}>;

const UNIT = Object.freeze({
  mm: Object.freeze({ mmPerUnit: 1, decimals: 1 }),
  cm: Object.freeze({ mmPerUnit: 10, decimals: 2 }),
  in: Object.freeze({ mmPerUnit: 25.4, decimals: 3 }),
} satisfies Record<
  PatternImportDxfPhaseEMeasurementUnitV1,
  Readonly<{ mmPerUnit: number; decimals: number }>
>);

function finiteMm(value: number, name: string): void {
  if (!Number.isFinite(value)) throw new TypeError(`${name} must be a finite millimetre value.`);
}

/** Decimal rounding is sign-symmetric and normalizes negative zero for stable labels and JSON. */
export function roundPatternImportDxfPhaseEMeasurementV1(value: number, decimals: number): number {
  if (!Number.isFinite(value)) throw new TypeError('Measurement value must be finite.');
  if (!Number.isSafeInteger(decimals) || decimals < 0 || decimals > 9)
    throw new RangeError('Measurement decimals must be an integer from 0 through 9.');
  const factor = 10 ** decimals;
  const magnitude = Math.round((Math.abs(value) + Number.EPSILON) * factor) / factor;
  const rounded = Math.sign(value) * magnitude;
  return Object.is(rounded, -0) ? 0 : rounded;
}

export function formatPatternImportDxfPhaseEMeasurementValueV1(
  sourceMm: number,
  unit: PatternImportDxfPhaseEMeasurementUnitV1,
): PatternImportDxfPhaseEMeasurementValueV1 {
  finiteMm(sourceMm, 'sourceMm');
  const definition = UNIT[unit];
  if (!definition) throw new TypeError(`Unsupported measurement unit: ${String(unit)}.`);
  const value = roundPatternImportDxfPhaseEMeasurementV1(
    sourceMm / definition.mmPerUnit,
    definition.decimals,
  );
  return Object.freeze({
    sourceMm,
    unit,
    value,
    formatted: `${value.toFixed(definition.decimals)} ${unit}`,
  });
}

/**
 * Formats one measurement readout without changing geometric authority. Straight and along-edge
 * distances stay separate because they answer different questions even when their values coincide.
 */
export function buildPatternImportDxfPhaseEMeasurementDisplayV1(input: {
  unit: PatternImportDxfPhaseEMeasurementUnitV1;
  pointMm: Readonly<{ x: number; y: number }>;
  straightDistanceMm: number;
  alongEdgeDistanceMm: number;
}): PatternImportDxfPhaseEMeasurementDisplayV1 {
  finiteMm(input.pointMm.x, 'pointMm.x');
  finiteMm(input.pointMm.y, 'pointMm.y');
  finiteMm(input.straightDistanceMm, 'straightDistanceMm');
  finiteMm(input.alongEdgeDistanceMm, 'alongEdgeDistanceMm');

  const x = formatPatternImportDxfPhaseEMeasurementValueV1(input.pointMm.x, input.unit);
  const y = formatPatternImportDxfPhaseEMeasurementValueV1(input.pointMm.y, input.unit);
  const pointSourceMm = Object.freeze({ x: input.pointMm.x, y: input.pointMm.y });
  const point = Object.freeze({
    sourceMm: pointSourceMm,
    x,
    y,
    formatted: `x ${x.formatted} · y ${y.formatted}`,
  });

  return Object.freeze({
    schemaVersion: PATTERN_IMPORT_DXF_PHASE_E_MEASUREMENT_UNITS_V1,
    unit: input.unit,
    point,
    straight: formatPatternImportDxfPhaseEMeasurementValueV1(input.straightDistanceMm, input.unit),
    alongEdge: formatPatternImportDxfPhaseEMeasurementValueV1(
      input.alongEdgeDistanceMm,
      input.unit,
    ),
  });
}
