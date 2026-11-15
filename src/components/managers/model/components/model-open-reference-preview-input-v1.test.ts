import type { common_GenderEnum } from 'api/proto-http/admin';
import { describe, expect, it } from 'vitest';

import { resolveModelOpenReferencePreviewInputV1 } from './model-open-reference-preview-input-v1';

const VALID_MEASUREMENTS = Object.freeze({
  BODY_MEASUREMENT_NAME_HEIGHT: 1750,
  BODY_MEASUREMENT_NAME_ACROSS_SHOULDER: 420,
  BODY_MEASUREMENT_NAME_CHEST: 940,
  BODY_MEASUREMENT_NAME_UNDER_BUST: 800,
  BODY_MEASUREMENT_NAME_WAIST: 760,
  BODY_MEASUREMENT_NAME_HIP: 980,
  BODY_MEASUREMENT_NAME_SLEEVE_LENGTH: 600,
  BODY_MEASUREMENT_NAME_INSEAM: 800,
});

describe('model open-reference preview input v1', () => {
  it('resolves a complete female form to canonical display-only input', () => {
    const result = resolveModelOpenReferencePreviewInputV1({
      gender: 'GENDER_ENUM_FEMALE',
      measurements: VALID_MEASUREMENTS,
    });

    expect(result.ok).toBe(true);
    expect(result.basis.basisKind).toBe('female');
    expect(result.basis.claims).toEqual({
      fitClaimEligible: false,
      runtimeCollisionEligible: false,
      collisionCandidateEligible: false,
    });
    expect(result.diagnostics).toEqual([]);
    expect(result).toEqual(
      expect.objectContaining({
        version: 'model-open-reference-preview-input/v1',
        role: 'DISPLAY_ONLY',
        measurements: expect.objectContaining({
          heightMm: 1750,
          shoulderBreadthMm: 420,
          chestCircumferenceMm: 940,
          underBustCircumferenceMm: 800,
          waistCircumferenceMm: 760,
          hipCircumferenceMm: 980,
          armLengthMm: 600,
          inseamMm: 800,
        }),
      }),
    );
  });

  it('keeps absent and zero form measurements missing instead of guessing values', () => {
    const result = resolveModelOpenReferencePreviewInputV1({
      gender: 'GENDER_ENUM_MALE',
      measurements: {
        BODY_MEASUREMENT_NAME_HEIGHT: 1750,
        BODY_MEASUREMENT_NAME_CHEST: 0,
      },
    });

    expect(result.ok).toBe(false);
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'missing-required', canonicalKey: 'chestCircumferenceMm' }),
        expect.objectContaining({ code: 'missing-required', canonicalKey: 'inseamMm' }),
      ]),
    );
    expect(result).not.toHaveProperty('measurements');
  });

  it('rejects individually implausible and correlated-impossible positive values', () => {
    const implausible = resolveModelOpenReferencePreviewInputV1({
      gender: 'GENDER_ENUM_FEMALE',
      measurements: { ...VALID_MEASUREMENTS, BODY_MEASUREMENT_NAME_HEIGHT: 2200 },
    });
    const correlated = resolveModelOpenReferencePreviewInputV1({
      gender: 'GENDER_ENUM_FEMALE',
      measurements: {
        ...VALID_MEASUREMENTS,
        BODY_MEASUREMENT_NAME_ACROSS_SHOULDER: 300,
        BODY_MEASUREMENT_NAME_CHEST: 1200,
      },
    });

    expect(implausible.ok).toBe(false);
    expect(implausible.diagnostics).toContainEqual(
      expect.objectContaining({ code: 'invalid-value', canonicalKey: 'heightMm' }),
    );
    expect(correlated.ok).toBe(false);
    expect(correlated.diagnostics).toContainEqual(
      expect.objectContaining({ code: 'correlated-impossible' }),
    );
  });

  it.each([
    ['GENDER_ENUM_UNKNOWN', 'gender-unknown-neutral-fallback'],
    ['GENDER_ENUM_UNISEX', 'gender-unisex-neutral-fallback'],
  ] as const)('keeps %s neutral with its explicit diagnostic', (gender, code) => {
    const result = resolveModelOpenReferencePreviewInputV1({
      gender,
      measurements: VALID_MEASUREMENTS,
    });

    expect(result.basis.basisKind).toBe('neutral');
    expect(result.basis.diagnostics).toEqual([expect.objectContaining({ code })]);
  });

  it('ignores unsupported form measurements without adding unknown-code warnings', () => {
    const result = resolveModelOpenReferencePreviewInputV1({
      gender: 'GENDER_ENUM_MALE',
      measurements: {
        ...VALID_MEASUREMENTS,
        BODY_MEASUREMENT_NAME_HIGH_HIP: 910,
        BODY_MEASUREMENT_NAME_KNEE: 390,
        FUTURE_FORM_ONLY_FIELD: 123,
      },
    });

    expect(result.ok).toBe(true);
    expect(result.diagnostics).toEqual([]);
    if (result.ok) {
      expect(result.measurements).not.toHaveProperty('highHipCircumferenceMm');
      expect(result.measurements).not.toHaveProperty('kneeCircumferenceMm');
    }
  });

  it('does not mutate the caller input and freezes its returned boundary', () => {
    const input = {
      gender: 'GENDER_ENUM_FUTURE' as common_GenderEnum,
      measurements: { ...VALID_MEASUREMENTS },
    };
    const before = structuredClone(input);

    const result = resolveModelOpenReferencePreviewInputV1(input);

    expect(input).toEqual(before);
    expect(Object.isFrozen(input)).toBe(false);
    expect(Object.isFrozen(input.measurements)).toBe(false);
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.diagnostics)).toBe(true);
    if (result.ok) expect(Object.isFrozen(result.measurements)).toBe(true);
  });
});
