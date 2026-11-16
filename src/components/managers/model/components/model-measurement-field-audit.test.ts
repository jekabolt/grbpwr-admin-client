import { describe, expect, it } from 'vitest';
import { auditModelMeasurementFieldsV1 } from './model-measurement-field-audit';

const VALID = Object.freeze({
  BODY_MEASUREMENT_NAME_HEIGHT: 1720,
  BODY_MEASUREMENT_NAME_ACROSS_SHOULDER: 420,
  BODY_MEASUREMENT_NAME_CHEST: 920,
  BODY_MEASUREMENT_NAME_WAIST: 740,
  BODY_MEASUREMENT_NAME_HIP: 980,
  BODY_MEASUREMENT_NAME_SLEEVE_LENGTH: 600,
  BODY_MEASUREMENT_NAME_INSEAM: 800,
});

describe('model measurement field audit v1', () => {
  it('returns an explicit empty result for a structurally valid profile', () => {
    const result = auditModelMeasurementFieldsV1({
      ...VALID,
      BODY_MEASUREMENT_NAME_HIGH_HIP: 900,
      BODY_MEASUREMENT_NAME_KNEE: 390,
    });

    expect(result).toEqual({
      byMeasurementName: {},
      errorCount: 0,
      fieldCount: 0,
      unassignedErrorCount: 0,
    });
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.byMeasurementName)).toBe(true);
  });

  it('does not turn bounded-proxy range warnings into field-blocking errors', () => {
    const result = auditModelMeasurementFieldsV1({
      ...VALID,
      BODY_MEASUREMENT_NAME_HIGH_HIP: 1_601,
      BODY_MEASUREMENT_NAME_KNEE: 601,
    });

    expect(result).toEqual({
      byMeasurementName: {},
      errorCount: 0,
      fieldCount: 0,
      unassignedErrorCount: 0,
    });
  });

  it('maps missing required diagnostics to the exact editable fields', () => {
    const result = auditModelMeasurementFieldsV1({
      ...VALID,
      BODY_MEASUREMENT_NAME_SLEEVE_LENGTH: undefined,
      BODY_MEASUREMENT_NAME_INSEAM: undefined,
    });

    expect(result.byMeasurementName.BODY_MEASUREMENT_NAME_SLEEVE_LENGTH).toEqual([
      { code: 'missing-required', message: 'required for mannequin' },
    ]);
    expect(result.byMeasurementName.BODY_MEASUREMENT_NAME_INSEAM).toEqual([
      { code: 'missing-required', message: 'required for mannequin' },
    ]);
    expect(result.unassignedErrorCount).toBe(0);
  });

  it('emits value-free range and correlation guidance without echoing entered values', () => {
    const result = auditModelMeasurementFieldsV1({
      ...VALID,
      BODY_MEASUREMENT_NAME_HEIGHT: 170,
      BODY_MEASUREMENT_NAME_ACROSS_SHOULDER: 970,
    });
    const serialized = JSON.stringify(result);

    expect(result.byMeasurementName.BODY_MEASUREMENT_NAME_HEIGHT).toContainEqual({
      code: 'invalid-value',
      message: 'outside supported adult range',
    });
    expect(result.byMeasurementName.BODY_MEASUREMENT_NAME_ACROSS_SHOULDER).toEqual(
      expect.arrayContaining([
        { code: 'invalid-value', message: 'outside supported adult range' },
        { code: 'correlated-impossible', message: 'check together with height' },
      ]),
    );
    expect(serialized).not.toContain(':170');
    expect(serialized).not.toContain(':970');
  });
});
