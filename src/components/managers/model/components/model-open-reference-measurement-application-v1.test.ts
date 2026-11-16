import { describe, expect, it } from 'vitest';

import { CANONICAL_BODY_MEASUREMENTS_VERSION } from 'lib/cloth/body/measurement-adapter';
import {
  modelOpenReferenceMeasurementApplicationLabelV1,
  modelOpenReferenceMeasurementApplicationSummaryV1,
  modelOpenReferenceMeasurementApplicationV1,
} from './model-open-reference-measurement-application-v1';

const measurements = Object.freeze({
  schemaVersion: CANONICAL_BODY_MEASUREMENTS_VERSION,
  heightMm: 1720,
  shoulderBreadthMm: 420,
  chestCircumferenceMm: 1040,
  waistCircumferenceMm: 760,
  hipCircumferenceMm: 980,
  armLengthMm: 600,
  inseamMm: 800,
  neckBaseCircumferenceMm: 360,
});

describe('model open-reference measurement application v1', () => {
  it('distinguishes safe-range-limited supported controls from unsupported measurements', () => {
    const result = modelOpenReferenceMeasurementApplicationV1({
      measurements,
      rawMeasurements: {
        BODY_MEASUREMENT_NAME_HIGH_HIP: 900,
        BODY_MEASUREMENT_NAME_KNEE: 390,
      },
      beta: {
        representedVisualControls: ['heightMm', 'waistCircumferenceMm', 'hipCircumferenceMm'],
        limitedVisualControls: ['armLengthMm'],
        chestShoulderDiagnostics: ['chestCircumferenceMm:target-limited-to-bounded-endpoint'],
        fkProxyRuntime: { diagnostics: [] },
      },
    });

    expect(result.applied).toEqual(['heightMm', 'waistCircumferenceMm', 'hipCircumferenceMm']);
    expect(result.limitedBySafeRange).toEqual(['chestCircumferenceMm', 'armLengthMm']);
    expect(result.notApplied).toEqual(['shoulderBreadthMm']);
    expect(result.unsupported).toEqual(['inseam', 'neck base circumference', 'high hip', 'knee']);
    expect(result.diagnostics).toContain('chestCircumferenceMm:target-limited-to-bounded-endpoint');
    expect(modelOpenReferenceMeasurementApplicationSummaryV1(result)).toEqual({
      status: 'partial',
      text: 'body shape partial · limited by safe range: chest circumference, arm length centerline proxy · not applied: shoulder breadth · not modeled: inseam, neck base circumference, high hip, knee',
    });
  });

  it('does not mislabel runtime failure or quality rollback as a safe-range limit', () => {
    const runtimeFailure = modelOpenReferenceMeasurementApplicationV1({
      measurements,
      rawMeasurements: {},
      beta: {
        representedVisualControls: ['heightMm', 'waistCircumferenceMm', 'hipCircumferenceMm'],
        chestShoulderDiagnostics: ['chest-shoulder-runtime-unavailable:chunk failed'],
        fkProxyRuntime: { diagnostics: [] },
      },
    });
    expect(runtimeFailure.limitedBySafeRange).toEqual([]);
    expect(runtimeFailure.notApplied).toEqual([
      'shoulderBreadthMm',
      'chestCircumferenceMm',
      'armLengthMm',
    ]);

    const qualityRollback = modelOpenReferenceMeasurementApplicationV1({
      measurements,
      rawMeasurements: {},
      beta: {
        representedVisualControls: ['heightMm', 'hipCircumferenceMm'],
        chestShoulderDiagnostics: [
          'chestCircumferenceMm:target-limited-to-bounded-endpoint',
          'bounded-endpoint-quality-rollback',
        ],
        fkProxyRuntime: {
          diagnostics: [
            {
              code: 'target-limited',
              measurementKey: 'waistCircumferenceMm',
              message: 'bounded endpoint used',
            },
            {
              code: 'combined-quality-unsafe',
              measurementKey: 'waistCircumferenceMm',
              message: 'bounded endpoint rolled back',
            },
          ],
        },
      },
    });
    expect(qualityRollback.limitedBySafeRange).toEqual([]);
    expect(qualityRollback.notApplied).toEqual([
      'shoulderBreadthMm',
      'chestCircumferenceMm',
      'waistCircumferenceMm',
      'armLengthMm',
    ]);
  });

  it('uses typed waist/hip target-limited diagnostics for a visible bounded endpoint', () => {
    const result = modelOpenReferenceMeasurementApplicationV1({
      measurements,
      rawMeasurements: {},
      beta: {
        representedVisualControls: [
          'heightMm',
          'shoulderBreadthMm',
          'chestCircumferenceMm',
          'hipCircumferenceMm',
        ],
        chestShoulderDiagnostics: [],
        limitedVisualControls: ['armLengthMm'],
        fkProxyRuntime: {
          diagnostics: [
            {
              code: 'target-limited',
              measurementKey: 'waistCircumferenceMm',
              message: 'bounded endpoint used',
            },
          ],
        },
      },
    });

    expect(result.limitedBySafeRange).toEqual(['waistCircumferenceMm', 'armLengthMm']);
    expect(result.notApplied).toEqual([]);
    expect(result.diagnostics).toContain('waistCircumferenceMm:target-limited');
  });

  it('recognizes a quality-backed chest endpoint as limited rather than omitted', () => {
    const result = modelOpenReferenceMeasurementApplicationV1({
      measurements,
      rawMeasurements: {},
      beta: {
        representedVisualControls: [
          'heightMm',
          'shoulderBreadthMm',
          'waistCircumferenceMm',
          'hipCircumferenceMm',
        ],
        chestShoulderDiagnostics: [
          'chestCircumferenceMm:target-limited-to-quality-safe-endpoint',
          'chestCircumferenceMm:bounded-endpoint-quality-limited:0.86646',
        ],
        limitedVisualControls: ['armLengthMm'],
        fkProxyRuntime: { diagnostics: [] },
      },
    });

    expect(result.limitedBySafeRange).toEqual(['chestCircumferenceMm', 'armLengthMm']);
    expect(result.notApplied).toEqual([]);
  });

  it('reports the arm centerline visual as a limited proxy when other supported keys are applied', () => {
    const result = modelOpenReferenceMeasurementApplicationV1({
      measurements: { ...measurements, neckBaseCircumferenceMm: undefined },
      rawMeasurements: {},
      beta: {
        representedVisualControls: [
          'heightMm',
          'shoulderBreadthMm',
          'chestCircumferenceMm',
          'waistCircumferenceMm',
          'hipCircumferenceMm',
        ],
        chestShoulderDiagnostics: [],
        limitedVisualControls: ['armLengthMm'],
        fkProxyRuntime: { diagnostics: [] },
      },
    });

    expect(result.limitedBySafeRange).toEqual(['armLengthMm']);
    expect(result.notApplied).toEqual([]);
    expect(result.unsupported).toEqual(['inseam']);
    expect(modelOpenReferenceMeasurementApplicationSummaryV1(result)).toEqual({
      status: 'partial',
      text: 'body shape partial · limited by safe range: arm length centerline proxy · not modeled: inseam',
    });
  });

  it('uses compact operator-facing labels', () => {
    expect(modelOpenReferenceMeasurementApplicationLabelV1('chestCircumferenceMm')).toBe(
      'chest circumference',
    );
    expect(modelOpenReferenceMeasurementApplicationLabelV1('armLengthMm')).toBe(
      'arm length centerline proxy',
    );
  });

  it('reports a displayed bounded thigh as limited instead of not applied or not modeled', () => {
    const result = modelOpenReferenceMeasurementApplicationV1({
      measurements: { ...measurements, thighCircumferenceMm: 1_000 },
      rawMeasurements: {},
      beta: {
        representedVisualControls: [
          'heightMm',
          'shoulderBreadthMm',
          'chestCircumferenceMm',
          'waistCircumferenceMm',
          'hipCircumferenceMm',
        ],
        limitedVisualControls: ['armLengthMm', 'thighCircumferenceMm'],
        chestShoulderDiagnostics: ['thighCircumferenceMm:target-limited'],
        fkProxyRuntime: { diagnostics: [] },
      },
    });

    expect(result.limitedBySafeRange).toEqual(['armLengthMm', 'thighCircumferenceMm']);
    expect(result.notApplied).toEqual([]);
    expect(result.unsupported).not.toContain('thigh circumference');
    expect(modelOpenReferenceMeasurementApplicationSummaryV1(result).text).toContain(
      'arm length centerline proxy, thigh circumference',
    );
    expect(modelOpenReferenceMeasurementApplicationSummaryV1(result).text).not.toContain(
      'not modeled: thigh circumference',
    );
  });
});
