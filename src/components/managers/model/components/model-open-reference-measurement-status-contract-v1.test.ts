import { describe, expect, it } from 'vitest';

import {
  CANONICAL_BODY_MEASUREMENTS_VERSION,
  PROJECT_BODY_MEASUREMENT_ALIASES,
  type CanonicalBodyMeasurementsMm,
} from 'lib/cloth/body/measurement-adapter';
import { MEASUREMENT_OPEN_REFERENCE_BETA_SHAPE_KEYS_V1 } from 'lib/cloth/body/measurement-open-reference-beta-shape-runtime-v1';

import {
  MODEL_OPEN_REFERENCE_MEASUREMENT_STATUS_FIELDS_V1,
  resolveModelOpenReferenceMeasurementFieldStatusesV1,
} from './model-open-reference-measurement-status-contract-v1';

const allMeasurements = Object.freeze({
  schemaVersion: CANONICAL_BODY_MEASUREMENTS_VERSION,
  heightMm: 1720,
  shoulderBreadthMm: 420,
  chestCircumferenceMm: 1040,
  underBustCircumferenceMm: 880,
  waistCircumferenceMm: 760,
  hipCircumferenceMm: 980,
  highHipCircumferenceMm: 900,
  armLengthMm: 600,
  inseamMm: 800,
  neckBaseCircumferenceMm: 360,
  bicepCircumferenceMm: 300,
  wristCircumferenceMm: 170,
  thighCircumferenceMm: 560,
  kneeCircumferenceMm: 390,
  calfCircumferenceMm: 370,
  ankleCircumferenceMm: 230,
  hpsToWaistFrontMm: 430,
  cbNeckToWaistMm: 420,
  acrossFrontMm: 360,
  acrossBackMm: 390,
  hpsHeightMm: 1450,
  cfNeckToWaistMm: 440,
  waistHeightMm: 1050,
  waistToHighHipMm: 100,
  waistToHipMm: 220,
  chestDepthMm: 260,
  waistDepthMm: 220,
  hipDepthMm: 280,
  shoulderLengthMm: 140,
  shoulderDropMm: 35,
  armscyeDepthMm: 210,
  armscyeCircumferenceMm: 470,
  bustApexToApexMm: 190,
  hpsToBustApexMm: 300,
} as const satisfies CanonicalBodyMeasurementsMm);

describe('model open-reference measurement status contract v1', () => {
  it('exhaustively classifies all 34 canonical project fields', () => {
    expect(MODEL_OPEN_REFERENCE_MEASUREMENT_STATUS_FIELDS_V1).toHaveLength(34);
    expect(
      new Set(MODEL_OPEN_REFERENCE_MEASUREMENT_STATUS_FIELDS_V1.map(({ fieldId }) => fieldId)).size,
    ).toBe(34);

    const canonical = MODEL_OPEN_REFERENCE_MEASUREMENT_STATUS_FIELDS_V1.filter(
      ({ source }) => source.kind === 'canonical',
    );
    expect(canonical).toHaveLength(34);
    expect(new Set(canonical.map(({ fieldId }) => fieldId))).toEqual(
      new Set(Object.keys(PROJECT_BODY_MEASUREMENT_ALIASES)),
    );
    expect(
      MODEL_OPEN_REFERENCE_MEASUREMENT_STATUS_FIELDS_V1.reduce<Record<string, number>>(
        (counts, { capability }) => ({
          ...counts,
          [capability]: (counts[capability] ?? 0) + 1,
        }),
        {},
      ),
    ).toEqual({ exact: 1, boundedProxy: 11, unsupported: 19, modifierOnly: 3 });
    expect(
      MODEL_OPEN_REFERENCE_MEASUREMENT_STATUS_FIELDS_V1.filter(
        ({ capability }) => capability === 'exact' || capability === 'boundedProxy',
      ).map(({ fieldId }) => fieldId),
    ).toEqual(MEASUREMENT_OPEN_REFERENCE_BETA_SHAPE_KEYS_V1);
  });

  it('uses notApplied only for a requested direct control that did not survive the runtime', () => {
    const fields = resolveModelOpenReferenceMeasurementFieldStatusesV1({
      measurements: allMeasurements,
      rawMeasurements: {
        BODY_MEASUREMENT_NAME_HIGH_HIP: 900,
        BODY_MEASUREMENT_NAME_KNEE: 390,
      },
      representedVisualControls: [
        'heightMm',
        'chestCircumferenceMm',
        'underBustCircumferenceMm',
        'waistCircumferenceMm',
        'hipCircumferenceMm',
        'bicepCircumferenceMm',
        'wristCircumferenceMm',
        'thighCircumferenceMm',
        'calfCircumferenceMm',
        'ankleCircumferenceMm',
      ],
      limitedVisualControls: ['armLengthMm'],
    });
    const byId = new Map(fields.map((field) => [field.fieldId, field]));

    expect(fields).toHaveLength(34);
    expect(fields.filter(({ requested }) => requested)).toHaveLength(34);
    expect(fields.filter(({ directlyApplied }) => directlyApplied)).toHaveLength(11);
    expect(
      fields.some(({ status, directlyApplied }) => status === 'unsupported' && directlyApplied),
    ).toBe(false);
    expect(byId.get('heightMm')).toMatchObject({ status: 'exact', directlyApplied: true });
    expect(byId.get('armLengthMm')).toMatchObject({
      status: 'boundedProxy',
      directlyApplied: true,
    });
    expect(byId.get('shoulderBreadthMm')).toMatchObject({
      status: 'notApplied',
      directlyApplied: false,
    });
    expect(byId.get('hpsToWaistFrontMm')).toMatchObject({
      status: 'modifierOnly',
      directlyApplied: false,
    });
    expect(byId.get('inseamMm')).toMatchObject({
      status: 'unsupported',
      directlyApplied: false,
    });
    expect(byId.get('highHipCircumferenceMm')).toMatchObject({
      status: 'unsupported',
      requested: true,
    });
    expect(byId.get('kneeCircumferenceMm')).toMatchObject({
      status: 'unsupported',
      requested: true,
    });
  });

  it('keeps absent fields in the exhaustive capability catalog without claiming application', () => {
    const fields = resolveModelOpenReferenceMeasurementFieldStatusesV1({
      measurements: {
        schemaVersion: CANONICAL_BODY_MEASUREMENTS_VERSION,
        heightMm: 1720,
        shoulderBreadthMm: 420,
        chestCircumferenceMm: 1040,
        waistCircumferenceMm: 760,
        hipCircumferenceMm: 980,
        armLengthMm: 600,
        inseamMm: 800,
      },
      rawMeasurements: {},
      representedVisualControls: ['heightMm'],
    });
    const underBust = fields.find(({ fieldId }) => fieldId === 'underBustCircumferenceMm');

    expect(underBust).toMatchObject({
      requested: false,
      directlyApplied: false,
      status: 'boundedProxy',
    });
  });
});
