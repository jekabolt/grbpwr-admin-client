import { describe, expect, it } from 'vitest';

import {
  ANSUR_UNTYPED_FIELD_ESTIMATE_KEYS_V1,
  ANSUR_UNTYPED_FIELD_RELATIONS_V1,
  ansurUntypedFieldEstimateGroupV1,
  estimateUntypedMeasurementsFromAnsurV1,
  type AnsurUntypedFieldEstimateKeyV1,
} from './ansur-untyped-field-estimates-v1';
import {
  CANONICAL_BODY_MEASUREMENTS_VERSION,
  type CanonicalBodyMeasurementsMm,
} from './measurement-adapter';

/**
 * Three real ANSUR II subjects from the holdout half (never seen by the fit). Columns, all mm:
 * stature, chestcircumference, buttockcircumference, biacromialbreadth, then the truths
 * neckcircumference, wristcircumference, thighcircumference, calfcircumference, anklecircumference,
 * chestdepth, buttockdepth. Source: ANSUR II public release (Gordon et al., NATICK/TR-15/007).
 */
const SUBJECTS = Object.freeze([
  {
    subjectid: '18186',
    sex: 'female',
    typed: {
      heightMm: 1608,
      chestCircumferenceMm: 850,
      hipCircumferenceMm: 975,
      shoulderBreadthMm: 374,
    },
    truth: {
      neckCircumferenceMm: 313,
      wristCircumferenceMm: 151,
      thighCircumferenceMm: 566,
      calfCircumferenceMm: 366,
      ankleCircumferenceMm: 200,
      chestDepthMm: 209,
      hipDepthMm: 212,
    },
    own: {
      neckCircumferenceMm: 316.4,
      wristCircumferenceMm: 151.6,
      thighCircumferenceMm: 587.7,
      calfCircumferenceMm: 360.9,
      ankleCircumferenceMm: 211.6,
      chestDepthMm: 215.9,
      hipDepthMm: 217.8,
    },
    neutral: {
      neckCircumferenceMm: 318.5,
      wristCircumferenceMm: 152.1,
      thighCircumferenceMm: 587.4,
      calfCircumferenceMm: 361,
      ankleCircumferenceMm: 211.7,
      chestDepthMm: 214.6,
      hipDepthMm: 217.5,
    },
  },
  {
    subjectid: '25609',
    sex: 'female',
    typed: {
      heightMm: 1651,
      chestCircumferenceMm: 901,
      hipCircumferenceMm: 973,
      shoulderBreadthMm: 375,
    },
    truth: {
      neckCircumferenceMm: 305,
      wristCircumferenceMm: 149,
      thighCircumferenceMm: 584,
      calfCircumferenceMm: 364,
      ankleCircumferenceMm: 207,
      chestDepthMm: 240,
      hipDepthMm: 216,
    },
    own: {
      neckCircumferenceMm: 322.9,
      wristCircumferenceMm: 154.4,
      thighCircumferenceMm: 582.7,
      calfCircumferenceMm: 362.1,
      ankleCircumferenceMm: 213.3,
      chestDepthMm: 231.5,
      hipDepthMm: 217.4,
    },
    neutral: {
      neckCircumferenceMm: 333.1,
      wristCircumferenceMm: 156.7,
      thighCircumferenceMm: 585.1,
      calfCircumferenceMm: 364,
      ankleCircumferenceMm: 213.9,
      chestDepthMm: 226.5,
      hipDepthMm: 220.3,
    },
  },
  {
    subjectid: '12695',
    sex: 'male',
    typed: {
      heightMm: 1731,
      chestCircumferenceMm: 1055,
      hipCircumferenceMm: 1018,
      shoulderBreadthMm: 419,
    },
    truth: {
      neckCircumferenceMm: 399,
      wristCircumferenceMm: 174,
      thighCircumferenceMm: 628,
      calfCircumferenceMm: 401,
      ankleCircumferenceMm: 233,
      chestDepthMm: 262,
      hipDepthMm: 245,
    },
    own: {
      neckCircumferenceMm: 398.2,
      wristCircumferenceMm: 175.1,
      thighCircumferenceMm: 625.6,
      calfCircumferenceMm: 392.8,
      ankleCircumferenceMm: 228.8,
      chestDepthMm: 251.6,
      hipDepthMm: 245.5,
    },
    neutral: {
      neckCircumferenceMm: 392.7,
      wristCircumferenceMm: 173.9,
      thighCircumferenceMm: 624,
      calfCircumferenceMm: 391.2,
      ankleCircumferenceMm: 228.1,
      chestDepthMm: 254.3,
      hipDepthMm: 244.3,
    },
  },
] as const);

function measurements(
  typed: Readonly<Record<string, number>>,
  extra: Partial<CanonicalBodyMeasurementsMm> = {},
): CanonicalBodyMeasurementsMm {
  return {
    schemaVersion: CANONICAL_BODY_MEASUREMENTS_VERSION,
    heightMm: typed.heightMm,
    shoulderBreadthMm: typed.shoulderBreadthMm,
    chestCircumferenceMm: typed.chestCircumferenceMm,
    waistCircumferenceMm: 800,
    hipCircumferenceMm: typed.hipCircumferenceMm,
    armLengthMm: 580,
    inseamMm: 780,
    ...extra,
  };
}

describe('ANSUR II untyped-field estimates', () => {
  it('picks the own-sex line for female and male bases and the pooled line for neutral', () => {
    expect(ansurUntypedFieldEstimateGroupV1('female')).toBe('female');
    expect(ansurUntypedFieldEstimateGroupV1('male')).toBe('male');
    expect(ansurUntypedFieldEstimateGroupV1('neutral')).toBe('pooled');
  });

  it('never uses waist as a predictor (ANSUR waist is at the navel, ours is natural)', () => {
    for (const group of Object.values(ANSUR_UNTYPED_FIELD_RELATIONS_V1)) {
      for (const line of Object.values(group)) {
        expect(Object.keys(line.coefficients).sort()).toEqual(
          ['chestCircumferenceMm', 'heightMm', 'hipCircumferenceMm', 'shoulderBreadthMm'].sort(),
        );
        expect(line.rangeMm[0]).toBeLessThan(line.rangeMm[1]);
        expect(line.holdout.n).toBeGreaterThan(900);
      }
    }
    expect(Object.keys(ANSUR_UNTYPED_FIELD_RELATIONS_V1.female).sort()).toEqual(
      [...ANSUR_UNTYPED_FIELD_ESTIMATE_KEYS_V1].sort(),
    );
  });

  for (const subject of SUBJECTS) {
    it(`reproduces the pinned guesses for holdout subject ${subject.subjectid}`, () => {
      const own = estimateUntypedMeasurementsFromAnsurV1({
        basisKind: subject.sex,
        measurements: measurements(subject.typed),
      });
      const neutral = estimateUntypedMeasurementsFromAnsurV1({
        basisKind: 'neutral',
        measurements: measurements(subject.typed),
      });
      expect(own.group).toBe(subject.sex);
      expect(neutral.group).toBe('pooled');
      expect(own.estimates).toEqual(subject.own);
      expect(neutral.estimates).toEqual(subject.neutral);
      expect(own.clamped).toEqual([]);
      // Every guess lands within twice the line's holdout p90 of the real person.
      for (const key of ANSUR_UNTYPED_FIELD_ESTIMATE_KEYS_V1) {
        const line = ANSUR_UNTYPED_FIELD_RELATIONS_V1[subject.sex][key];
        expect(Math.abs((own.estimates[key] as number) - subject.truth[key])).toBeLessThanOrEqual(
          2 * line.holdout.p90AbsMm,
        );
      }
    });
  }

  it('leaves typed fields alone and only guesses the requested keys', () => {
    const subject = SUBJECTS[2];
    const result = estimateUntypedMeasurementsFromAnsurV1({
      basisKind: 'male',
      measurements: measurements(subject.typed, { neckCircumferenceMm: 420, hipDepthMm: 260 }),
      keys: ['neckCircumferenceMm', 'wristCircumferenceMm', 'hipDepthMm'],
    });
    expect(result.estimates).toEqual({ wristCircumferenceMm: subject.own.wristCircumferenceMm });
  });

  it('clamps a guess into the training range and reports it', () => {
    const result = estimateUntypedMeasurementsFromAnsurV1({
      basisKind: 'female',
      measurements: measurements({
        heightMm: 1500,
        chestCircumferenceMm: 1500,
        hipCircumferenceMm: 1600,
        shoulderBreadthMm: 460,
      }),
    });
    const keys = Object.keys(result.estimates) as AnsurUntypedFieldEstimateKeyV1[];
    expect(keys.sort()).toEqual([...ANSUR_UNTYPED_FIELD_ESTIMATE_KEYS_V1].sort());
    expect(result.clamped).toContain('thighCircumferenceMm');
    for (const key of keys) {
      const [minimum, maximum] = ANSUR_UNTYPED_FIELD_RELATIONS_V1.female[key].rangeMm;
      expect(result.estimates[key]).toBeGreaterThanOrEqual(minimum);
      expect(result.estimates[key]).toBeLessThanOrEqual(maximum);
    }
    expect(result.estimates.thighCircumferenceMm).toBe(
      ANSUR_UNTYPED_FIELD_RELATIONS_V1.female.thighCircumferenceMm.rangeMm[1],
    );
  });

  it('guesses nothing when a predictor is missing or implausible', () => {
    const typed = { ...SUBJECTS[0].typed, shoulderBreadthMm: 120 };
    const result = estimateUntypedMeasurementsFromAnsurV1({
      basisKind: 'female',
      measurements: measurements(typed),
    });
    expect(result.estimates).toEqual({});
    expect(result.skippedReason).toBe('predictor-missing-or-implausible');
    const missing = estimateUntypedMeasurementsFromAnsurV1({
      basisKind: 'neutral',
      measurements: measurements({ ...SUBJECTS[0].typed, chestCircumferenceMm: Number.NaN }),
    });
    expect(missing.estimates).toEqual({});
  });
});
