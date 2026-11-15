import type {
  common_BodyMeasurementName,
  common_GenderEnum,
  common_Model,
  common_ModelMeasurement,
} from 'api/proto-http/admin';
import { describe, expect, it } from 'vitest';
import {
  modelCardMannequinInputV1,
  modelCardMannequinRevisionV1,
} from './model-card-mannequin-input-v1';

const REQUIRED = [
  ['BODY_MEASUREMENT_NAME_HEIGHT', 1720],
  ['BODY_MEASUREMENT_NAME_ACROSS_SHOULDER', 420],
  ['BODY_MEASUREMENT_NAME_CHEST', 920],
  ['BODY_MEASUREMENT_NAME_WAIST', 740],
  ['BODY_MEASUREMENT_NAME_HIP', 980],
  ['BODY_MEASUREMENT_NAME_SLEEVE_LENGTH', 600],
  ['BODY_MEASUREMENT_NAME_INSEAM', 800],
] as const satisfies readonly (readonly [common_BodyMeasurementName, number])[];

type MeasurementFixture = Omit<common_ModelMeasurement, 'metadata'> & {
  readonly metadata?: common_ModelMeasurement['metadata'];
};

function storedModel(
  measurements: MeasurementFixture[],
  gender: common_GenderEnum = 'GENDER_ENUM_FEMALE',
): common_Model {
  return {
    id: 17,
    model: {
      name: 'fit model',
      comment: undefined,
      gender,
      bodyMeasurementSchemaVersion: 1,
      measurements: measurements.map((measurement) => ({
        ...measurement,
        metadata: measurement.metadata,
      })),
      thumbnailId: undefined,
      mediaIds: undefined,
      defaultSizeIds: undefined,
    },
    createdAt: undefined,
    updatedAt: undefined,
    thumbnail: undefined,
    media: undefined,
  };
}

describe('model card mannequin input v1', () => {
  it('maps only exact persisted protocol measurements and freezes the result', () => {
    const model = storedModel([
      ...REQUIRED.map(([name, valueMm]) => ({ name, valueMm })),
      { name: 'BODY_MEASUREMENT_NAME_WRIST', valueMm: 160 },
      { name: 'BODY_MEASUREMENT_NAME_UNKNOWN', valueMm: 999 },
      { name: 'BODY_MEASUREMENT_NAME_BICEP', valueMm: 0 },
      { name: 'BODY_MEASUREMENT_NAME_CALF', valueMm: Number.NaN },
      { name: undefined, valueMm: 500 },
    ]);

    const input = modelCardMannequinInputV1(model);

    expect(input.gender).toBe('GENDER_ENUM_FEMALE');
    expect(input.measurements).toEqual({
      BODY_MEASUREMENT_NAME_ACROSS_SHOULDER: 420,
      BODY_MEASUREMENT_NAME_CHEST: 920,
      BODY_MEASUREMENT_NAME_HEIGHT: 1720,
      BODY_MEASUREMENT_NAME_HIP: 980,
      BODY_MEASUREMENT_NAME_INSEAM: 800,
      BODY_MEASUREMENT_NAME_SLEEVE_LENGTH: 600,
      BODY_MEASUREMENT_NAME_WAIST: 740,
      BODY_MEASUREMENT_NAME_WRIST: 160,
    });
    expect(Object.isFrozen(input)).toBe(true);
    expect(Object.isFrozen(input.measurements)).toBe(true);
  });

  it('omits conflicting duplicates instead of choosing a value', () => {
    const input = modelCardMannequinInputV1(
      storedModel([
        { name: 'BODY_MEASUREMENT_NAME_HEIGHT', valueMm: 1720 },
        { name: 'BODY_MEASUREMENT_NAME_HEIGHT', valueMm: 1730 },
        { name: 'BODY_MEASUREMENT_NAME_WAIST', valueMm: 740 },
        { name: 'BODY_MEASUREMENT_NAME_WAIST', valueMm: 740 },
      ]),
    );

    expect(input.measurements).toEqual({ BODY_MEASUREMENT_NAME_WAIST: 740 });
  });

  it('keeps revision order-independent and changes it with saved body content', () => {
    const records = REQUIRED.map(([name, valueMm]) => ({ name, valueMm }));
    const original = storedModel(records);
    const reordered = storedModel([...records].reverse());
    const changedWaist = storedModel(
      records.map((measurement) =>
        measurement.name === 'BODY_MEASUREMENT_NAME_WAIST'
          ? { ...measurement, valueMm: 760 }
          : measurement,
      ),
    );
    const changedGender = storedModel(records, 'GENDER_ENUM_MALE');

    expect(modelCardMannequinRevisionV1(reordered)).toBe(modelCardMannequinRevisionV1(original));
    expect(modelCardMannequinRevisionV1(changedWaist)).not.toBe(
      modelCardMannequinRevisionV1(original),
    );
    expect(modelCardMannequinRevisionV1(changedGender)).not.toBe(
      modelCardMannequinRevisionV1(original),
    );
  });
});
