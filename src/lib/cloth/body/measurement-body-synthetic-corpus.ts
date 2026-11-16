import type { CanonicalBodyMeasurementsMm } from './measurement-adapter';

export interface SyntheticMeasurementBodyRecord {
  readonly id: string;
  readonly tags: readonly string[];
  readonly measurements: CanonicalBodyMeasurementsMm;
}

export type SyntheticMeasurementBodySingleAxisKey =
  | 'heightMm'
  | 'shoulderBreadthMm'
  | 'chestCircumferenceMm'
  | 'waistCircumferenceMm'
  | 'hipCircumferenceMm'
  | 'armLengthMm'
  | 'inseamMm';

export interface SyntheticMeasurementBodySingleAxisExpectation {
  readonly key: SyntheticMeasurementBodySingleAxisKey;
  readonly lowerRecordId: string;
  readonly baselineRecordId: string;
  readonly upperRecordId: string;
}

const body = (
  id: string,
  tags: readonly string[],
  values: Omit<CanonicalBodyMeasurementsMm, 'schemaVersion'>,
): SyntheticMeasurementBodyRecord =>
  Object.freeze({
    id,
    tags: Object.freeze([...tags]),
    measurements: Object.freeze({ schemaVersion: 'canonical-body-measurements-v1', ...values }),
  });

/** Canonical, anonymous size records for deterministic measurement-to-initial-state contracts. */
export const CANONICAL_MEASUREMENT_SIZE_RECORDS = Object.freeze([
  body('canonical-size-small', ['canonical-size', 'small'], {
    heightMm: 1550,
    shoulderBreadthMm: 360,
    chestCircumferenceMm: 800,
    waistCircumferenceMm: 650,
    hipCircumferenceMm: 860,
    armLengthMm: 520,
    inseamMm: 660,
  }),
  body('canonical-size-medium', ['canonical-size', 'medium'], {
    heightMm: 1720,
    shoulderBreadthMm: 420,
    chestCircumferenceMm: 920,
    waistCircumferenceMm: 740,
    hipCircumferenceMm: 980,
    armLengthMm: 600,
    inseamMm: 800,
  }),
  body('canonical-size-large', ['canonical-size', 'large'], {
    heightMm: 1900,
    shoulderBreadthMm: 500,
    chestCircumferenceMm: 1200,
    waistCircumferenceMm: 1000,
    hipCircumferenceMm: 1280,
    armLengthMm: 720,
    inseamMm: 900,
  }),
]);

const SINGLE_AXIS_BASELINE_VALUES = Object.freeze({
  heightMm: 1720,
  shoulderBreadthMm: 420,
  chestCircumferenceMm: 920,
  waistCircumferenceMm: 740,
  hipCircumferenceMm: 980,
  armLengthMm: 600,
  inseamMm: 800,
});

const SINGLE_AXIS_LIMITS = Object.freeze({
  heightMm: Object.freeze({ lower: 1680, upper: 1760 }),
  shoulderBreadthMm: Object.freeze({ lower: 400, upper: 440 }),
  chestCircumferenceMm: Object.freeze({ lower: 880, upper: 960 }),
  waistCircumferenceMm: Object.freeze({ lower: 700, upper: 780 }),
  hipCircumferenceMm: Object.freeze({ lower: 940, upper: 1020 }),
  armLengthMm: Object.freeze({ lower: 570, upper: 630 }),
  inseamMm: Object.freeze({ lower: 760, upper: 840 }),
} satisfies Readonly<
  Record<SyntheticMeasurementBodySingleAxisKey, { readonly lower: number; readonly upper: number }>
>);

const SINGLE_AXIS_KEYS = Object.freeze([
  'heightMm',
  'shoulderBreadthMm',
  'chestCircumferenceMm',
  'waistCircumferenceMm',
  'hipCircumferenceMm',
  'armLengthMm',
  'inseamMm',
] as const satisfies readonly SyntheticMeasurementBodySingleAxisKey[]);

const SINGLE_AXIS_BASELINE_ID = 'synthetic-single-axis-baseline';
const singleAxisBaseline = body(SINGLE_AXIS_BASELINE_ID, ['single-axis', 'baseline'], {
  ...SINGLE_AXIS_BASELINE_VALUES,
});
const singleAxisRecords: SyntheticMeasurementBodyRecord[] = [singleAxisBaseline];
const singleAxisExpectations: SyntheticMeasurementBodySingleAxisExpectation[] = [];
for (const key of SINGLE_AXIS_KEYS) {
  const lowerRecordId = `synthetic-single-axis-${key}-lower`;
  const upperRecordId = `synthetic-single-axis-${key}-upper`;
  singleAxisRecords.push(
    body(lowerRecordId, ['single-axis', key, 'lower'], {
      ...SINGLE_AXIS_BASELINE_VALUES,
      [key]: SINGLE_AXIS_LIMITS[key].lower,
    }),
    body(upperRecordId, ['single-axis', key, 'upper'], {
      ...SINGLE_AXIS_BASELINE_VALUES,
      [key]: SINGLE_AXIS_LIMITS[key].upper,
    }),
  );
  singleAxisExpectations.push(
    Object.freeze({
      key,
      lowerRecordId,
      baselineRecordId: SINGLE_AXIS_BASELINE_ID,
      upperRecordId,
    }),
  );
}

/**
 * Pure contract probes. Each lower/baseline/upper triplet differs in exactly one required control.
 * They prove no anatomical, calibration, population, collision, or fit claim.
 */
export const SYNTHETIC_MEASUREMENT_BODY_SINGLE_AXIS_PROBES = Object.freeze(singleAxisRecords);
export const SYNTHETIC_MEASUREMENT_BODY_SINGLE_AXIS_EXPECTATIONS =
  Object.freeze(singleAxisExpectations);

/** Synthetic, anonymous and deliberately free of names, dates, media or source-system IDs. */
export const SYNTHETIC_MEASUREMENT_BODY_CORPUS: readonly SyntheticMeasurementBodyRecord[] = [
  body('synthetic-nominal', ['nominal'], {
    heightMm: 1720,
    shoulderBreadthMm: 420,
    chestCircumferenceMm: 920,
    waistCircumferenceMm: 740,
    hipCircumferenceMm: 980,
    armLengthMm: 600,
    inseamMm: 800,
  }),
  body('synthetic-short-narrow', ['short', 'narrow'], {
    heightMm: 1500,
    shoulderBreadthMm: 350,
    chestCircumferenceMm: 760,
    waistCircumferenceMm: 620,
    hipCircumferenceMm: 800,
    armLengthMm: 500,
    inseamMm: 650,
  }),
  body('synthetic-short-wide', ['short', 'wide'], {
    heightMm: 1550,
    shoulderBreadthMm: 440,
    chestCircumferenceMm: 1100,
    waistCircumferenceMm: 950,
    hipCircumferenceMm: 1120,
    armLengthMm: 540,
    inseamMm: 700,
  }),
  body('synthetic-tall-narrow', ['tall', 'narrow'], {
    heightMm: 1950,
    shoulderBreadthMm: 400,
    chestCircumferenceMm: 850,
    waistCircumferenceMm: 700,
    hipCircumferenceMm: 880,
    armLengthMm: 700,
    inseamMm: 900,
  }),
  body('synthetic-tall-wide', ['tall', 'wide'], {
    heightMm: 2000,
    shoulderBreadthMm: 520,
    chestCircumferenceMm: 1250,
    waistCircumferenceMm: 1050,
    hipCircumferenceMm: 1300,
    armLengthMm: 760,
    inseamMm: 980,
  }),
  body('synthetic-chest-low', ['monotonic', 'chest-low'], {
    heightMm: 1720,
    shoulderBreadthMm: 420,
    chestCircumferenceMm: 800,
    waistCircumferenceMm: 700,
    hipCircumferenceMm: 920,
    armLengthMm: 600,
    inseamMm: 800,
  }),
  body('synthetic-chest-high', ['monotonic', 'chest-high'], {
    heightMm: 1720,
    shoulderBreadthMm: 420,
    chestCircumferenceMm: 1200,
    waistCircumferenceMm: 950,
    hipCircumferenceMm: 1050,
    armLengthMm: 600,
    inseamMm: 800,
  }),
  body('synthetic-hip-low', ['monotonic', 'hip-low'], {
    heightMm: 1720,
    shoulderBreadthMm: 420,
    chestCircumferenceMm: 900,
    waistCircumferenceMm: 700,
    hipCircumferenceMm: 820,
    armLengthMm: 600,
    inseamMm: 800,
  }),
  body('synthetic-hip-high', ['monotonic', 'hip-high'], {
    heightMm: 1720,
    shoulderBreadthMm: 420,
    chestCircumferenceMm: 1000,
    waistCircumferenceMm: 900,
    hipCircumferenceMm: 1250,
    armLengthMm: 600,
    inseamMm: 800,
  }),
  body('synthetic-shoulder-narrow', ['monotonic', 'shoulder-narrow'], {
    heightMm: 1700,
    shoulderBreadthMm: 330,
    chestCircumferenceMm: 780,
    waistCircumferenceMm: 650,
    hipCircumferenceMm: 850,
    armLengthMm: 580,
    inseamMm: 760,
  }),
  body('synthetic-shoulder-wide', ['monotonic', 'shoulder-wide'], {
    heightMm: 1850,
    shoulderBreadthMm: 560,
    chestCircumferenceMm: 1200,
    waistCircumferenceMm: 1000,
    hipCircumferenceMm: 1280,
    armLengthMm: 720,
    inseamMm: 900,
  }),
  body('synthetic-limbs-long', ['monotonic', 'limbs-long'], {
    heightMm: 1900,
    shoulderBreadthMm: 450,
    chestCircumferenceMm: 1000,
    waistCircumferenceMm: 820,
    hipCircumferenceMm: 1050,
    armLengthMm: 800,
    inseamMm: 1050,
  }),
  body('synthetic-limbs-short', ['monotonic', 'limbs-short'], {
    heightMm: 1600,
    shoulderBreadthMm: 370,
    chestCircumferenceMm: 820,
    waistCircumferenceMm: 680,
    hipCircumferenceMm: 880,
    armLengthMm: 420,
    inseamMm: 560,
  }),
];
