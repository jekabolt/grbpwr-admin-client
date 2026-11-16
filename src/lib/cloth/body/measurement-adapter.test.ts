import { describe, expect, it } from 'vitest';

import {
  adaptProjectBodyMeasurements,
  CANONICAL_MEASUREMENT_PLAUSIBILITY_MM,
} from './measurement-adapter';

const REQUIRED = Object.freeze([
  { name: 'BODY_MEASUREMENT_NAME_HEIGHT', valueMm: 1720 },
  { name: 'BODY_MEASUREMENT_NAME_ACROSS_SHOULDER', valueMm: 420 },
  { name: 'BODY_MEASUREMENT_NAME_CHEST', valueMm: 920 },
  { name: 'BODY_MEASUREMENT_NAME_WAIST', valueMm: 740 },
  { name: 'BODY_MEASUREMENT_NAME_HIP', valueMm: 980 },
  { name: 'BODY_MEASUREMENT_NAME_SLEEVE_LENGTH', valueMm: 600 },
  { name: 'BODY_MEASUREMENT_NAME_INSEAM', valueMm: 800 },
]);

describe('measurement adapter canonical high hip and knee', () => {
  it('publishes the production-confirmed proxy plausibility envelopes', () => {
    expect(CANONICAL_MEASUREMENT_PLAUSIBILITY_MM.highHipCircumferenceMm).toEqual([600, 1600]);
    expect(CANONICAL_MEASUREMENT_PLAUSIBILITY_MM.kneeCircumferenceMm).toEqual([250, 600]);
  });

  it('maps the project aliases to owned canonical values', () => {
    const result = adaptProjectBodyMeasurements([
      ...REQUIRED,
      { name: 'BODY_MEASUREMENT_NAME_HIGH_HIP', valueMm: 900 },
      { name: 'BODY_MEASUREMENT_NAME_KNEE', valueMm: 390 },
    ]);

    expect(result.ok).toBe(true);
    expect(result.diagnostics).toEqual([]);
    if (result.ok) {
      expect(result.measurements.highHipCircumferenceMm).toBe(900);
      expect(result.measurements.kneeCircumferenceMm).toBe(390);
    }
  });

  it('retains out-of-range proxy inputs as warnings instead of rejecting the whole model', () => {
    const result = adaptProjectBodyMeasurements([
      ...REQUIRED,
      { name: 'BODY_MEASUREMENT_NAME_HIGH_HIP', valueMm: 599 },
      { name: 'BODY_MEASUREMENT_NAME_KNEE', valueMm: 601 },
    ]);

    expect(result.ok).toBe(true);
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          severity: 'warning',
          code: 'invalid-value',
          canonicalKey: 'highHipCircumferenceMm',
        }),
        expect.objectContaining({
          severity: 'warning',
          code: 'invalid-value',
          canonicalKey: 'kneeCircumferenceMm',
        }),
      ]),
    );
    if (result.ok) {
      expect(result.measurements.highHipCircumferenceMm).toBe(599);
      expect(result.measurements.kneeCircumferenceMm).toBe(601);
    }
  });
});
