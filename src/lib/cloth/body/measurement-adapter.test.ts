import { describe, expect, it } from 'vitest';

import {
  adaptProjectBodyMeasurements,
  ANSUR_II_SHOULDER_BREADTH_BAND_MM_V1,
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

  it('warns, never rejects, when high hip falls outside the waist..hip interval', () => {
    const outside = adaptProjectBodyMeasurements([
      ...REQUIRED,
      { name: 'BODY_MEASUREMENT_NAME_HIGH_HIP', valueMm: 1100 },
    ]);
    expect(outside.ok).toBe(true);
    expect(outside.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'warning',
        code: 'correlated-implausible',
        canonicalKey: 'highHipCircumferenceMm',
      }),
    ]);
    if (outside.ok) expect(outside.measurements.highHipCircumferenceMm).toBe(1100);

    const between = adaptProjectBodyMeasurements([
      ...REQUIRED,
      { name: 'BODY_MEASUREMENT_NAME_HIGH_HIP', valueMm: 860 },
    ]);
    expect(between.ok).toBe(true);
    expect(between.diagnostics).toEqual([]);

    // A waist wider than the hip is still a valid interval, in either order.
    const invertedInterval = adaptProjectBodyMeasurements([
      ...REQUIRED.map((record) =>
        record.name === 'BODY_MEASUREMENT_NAME_WAIST' ? { ...record, valueMm: 1000 } : record,
      ),
      { name: 'BODY_MEASUREMENT_NAME_HIGH_HIP', valueMm: 990 },
    ]);
    expect(invertedInterval.ok).toBe(true);
    expect(invertedInterval.diagnostics).toEqual([]);
  });
});

describe('measurement adapter canonical neck', () => {
  it('maps neck separately and never derives neck base from it', () => {
    expect(CANONICAL_MEASUREMENT_PLAUSIBILITY_MM.neckCircumferenceMm).toEqual([250, 550]);
    const result = adaptProjectBodyMeasurements([
      ...REQUIRED,
      { name: 'BODY_MEASUREMENT_NAME_NECK', valueMm: 340 },
    ]);

    expect(result.ok).toBe(true);
    expect(result.diagnostics).toEqual([]);
    if (result.ok) {
      expect(result.measurements.neckCircumferenceMm).toBe(340);
      expect(result.measurements.neckBaseCircumferenceMm).toBeUndefined();
    }
  });

  it('keeps an out-of-range neck as a warning and warns when neck exceeds neck base', () => {
    const outOfRange = adaptProjectBodyMeasurements([
      ...REQUIRED,
      { name: 'BODY_MEASUREMENT_NAME_NECK', valueMm: 600 },
    ]);
    expect(outOfRange.ok).toBe(true);
    expect(outOfRange.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'warning',
        code: 'invalid-value',
        canonicalKey: 'neckCircumferenceMm',
      }),
    ]);
    if (outOfRange.ok) expect(outOfRange.measurements.neckCircumferenceMm).toBe(600);

    const aboveBase = adaptProjectBodyMeasurements([
      ...REQUIRED,
      { name: 'BODY_MEASUREMENT_NAME_NECK_BASE', valueMm: 360 },
      { name: 'BODY_MEASUREMENT_NAME_NECK', valueMm: 400 },
    ]);
    expect(aboveBase.ok).toBe(true);
    expect(aboveBase.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'warning',
        code: 'correlated-implausible',
        canonicalKey: 'neckCircumferenceMm',
      }),
    ]);

    const belowBase = adaptProjectBodyMeasurements([
      ...REQUIRED,
      { name: 'BODY_MEASUREMENT_NAME_NECK_BASE', valueMm: 360 },
      { name: 'BODY_MEASUREMENT_NAME_NECK', valueMm: 340 },
    ]);
    expect(belowBase.ok).toBe(true);
    expect(belowBase.diagnostics).toEqual([]);
  });
});

describe('measurement adapter across-shoulder bound (ANSUR II)', () => {
  const withShoulder = (heightMm: number, shoulderMm: number, chestMm = 920) =>
    adaptProjectBodyMeasurements(
      REQUIRED.map((record) =>
        record.name === 'BODY_MEASUREMENT_NAME_HEIGHT'
          ? { ...record, valueMm: heightMm }
          : record.name === 'BODY_MEASUREMENT_NAME_ACROSS_SHOULDER'
            ? { ...record, valueMm: shoulderMm }
            : record.name === 'BODY_MEASUREMENT_NAME_CHEST'
              ? { ...record, valueMm: chestMm }
              : record,
      ),
    );

  it('derives the per-sex bands from the ANSUR ratio band over the form stature range', () => {
    expect(ANSUR_II_SHOULDER_BREADTH_BAND_MM_V1).toEqual({ female: [255, 525], male: [274, 552] });
    expect(CANONICAL_MEASUREMENT_PLAUSIBILITY_MM.shoulderBreadthMm).toEqual([255, 600]);
  });

  it('admits narrow-shouldered women the old 280 mm bound rejected', () => {
    for (const shoulderMm of [277, 279]) {
      const result = withShoulder(1675, shoulderMm);
      expect(result.ok).toBe(true);
      expect(result.diagnostics.filter(({ severity }) => severity === 'error')).toEqual([]);
    }
    expect(withShoulder(1300, 255, 800).ok).toBe(true);
  });

  it('still rejects across shoulder below the women band', () => {
    const result = withShoulder(1300, 254, 800);
    expect(result.ok).toBe(false);
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          severity: 'error',
          code: 'invalid-value',
          canonicalKey: 'shoulderBreadthMm',
        }),
      ]),
    );
  });
});
