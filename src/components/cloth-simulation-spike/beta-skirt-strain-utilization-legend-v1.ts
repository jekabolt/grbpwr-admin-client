/** Shared display metadata only; importing the product legend never loads a GPU executor. */
export const BETA_SKIRT_STRAIN_UTILIZATION_COLOR_LUT_V1 = Object.freeze({
  schemaVersion: 'strain-utilization-color-lut/1' as const,
  interpolation: 'linear-srgb' as const,
  clamp: Object.freeze({ minimum: 0, maximum: 2 }),
  stops: Object.freeze([
    Object.freeze({ utilization: 0, color: '#173F5F' }),
    Object.freeze({ utilization: 0.25, color: '#20639B' }),
    Object.freeze({ utilization: 0.5, color: '#3CAEA3' }),
    Object.freeze({ utilization: 0.75, color: '#F6D55C' }),
    Object.freeze({ utilization: 1, color: '#ED8B3A' }),
    Object.freeze({ utilization: 2, color: '#C73E3A' }),
  ]),
  legend: Object.freeze({
    title: 'Normalized strain utilization',
    units: 'dimensionless' as const,
    thresholdLabel: '1.0 = provisional visualization limit',
    disclaimer: 'Diagnostic visualization only; thresholds are provisional and uncalibrated.',
  }),
});
