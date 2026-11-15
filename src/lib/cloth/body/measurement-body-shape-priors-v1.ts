export const MEASUREMENT_BODY_SHAPE_PRIORS_V1 = 'measurement-body-shape-priors-v1' as const;

export interface MeasurementBodyTorsoDepthPriorsV1 {
  readonly chest: number;
  readonly waist: number;
  readonly hip: number;
}

export interface MeasurementBodyLimbDepthPriorsV1 {
  readonly neck: number;
  readonly bicep: number;
  readonly wrist: number;
  readonly thigh: number;
  readonly calf: number;
  readonly ankle: number;
}

export interface MeasurementBodyVerticalPriorsV1 {
  readonly shoulderHeightToStature: number;
  readonly kneeHeightToHipHeight: number;
  /**
   * Legacy identifier for an authored shoulder-to-waist vertical proportion. It is not the
   * canonical centre-back C7-to-waist surface path and must never read that measurement.
   */
  readonly cbNeckToWaistFallbackToStature: number;
  readonly shoulderToWaistMinimumToStature: number;
  readonly hipToWaistMinimumToStature: number;
  readonly chestPositionBetweenWaistAndShoulder: number;
}

/**
 * Versioned analytical shape assumptions. These are calibration inputs, not population claims.
 * A caller must pass a complete profile so a revision cannot silently inherit a new default.
 */
export interface MeasurementBodyShapePriorsV1 {
  readonly schemaVersion: typeof MEASUREMENT_BODY_SHAPE_PRIORS_V1;
  readonly torsoDepthToWidth: MeasurementBodyTorsoDepthPriorsV1;
  readonly limbDepthToWidth: MeasurementBodyLimbDepthPriorsV1;
  readonly vertical: MeasurementBodyVerticalPriorsV1;
}

const ROOT_KEYS = new Set<PropertyKey>([
  'schemaVersion',
  'torsoDepthToWidth',
  'limbDepthToWidth',
  'vertical',
]);
const TORSO_KEYS = new Set<PropertyKey>(['chest', 'waist', 'hip']);
const LIMB_KEYS = new Set<PropertyKey>(['neck', 'bicep', 'wrist', 'thigh', 'calf', 'ankle']);
const VERTICAL_KEYS = new Set<PropertyKey>([
  'shoulderHeightToStature',
  'kneeHeightToHipHeight',
  'cbNeckToWaistFallbackToStature',
  'shoulderToWaistMinimumToStature',
  'hipToWaistMinimumToStature',
  'chestPositionBetweenWaistAndShoulder',
]);

function assertClosedRecord(
  value: unknown,
  label: string,
  allowedKeys: ReadonlySet<PropertyKey>,
): asserts value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new TypeError(`${label} must be a plain record.`);
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new TypeError(`${label} must have a plain object prototype.`);
  }
  for (const key of Reflect.ownKeys(value)) {
    if (!allowedKeys.has(key)) throw new RangeError(`Unknown ${label} key ${String(key)}.`);
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !descriptor.enumerable || !('value' in descriptor)) {
      throw new TypeError(`${label}.${String(key)} must be an enumerable data property.`);
    }
  }
}

function boundedNumber(
  record: Record<string, unknown>,
  key: string,
  label: string,
  minimum: number,
  maximum: number,
): number {
  const descriptor = Object.getOwnPropertyDescriptor(record, key);
  if (!descriptor || !('value' in descriptor) || typeof descriptor.value !== 'number') {
    throw new TypeError(`${label}.${key} must be a number.`);
  }
  const value = descriptor.value;
  if (!Number.isFinite(value) || value < minimum || value > maximum) {
    throw new RangeError(`${label}.${key} must be finite and within ${minimum}..${maximum}.`);
  }
  return value;
}

function freezePriors(value: MeasurementBodyShapePriorsV1): MeasurementBodyShapePriorsV1 {
  return Object.freeze({
    schemaVersion: value.schemaVersion,
    torsoDepthToWidth: Object.freeze({ ...value.torsoDepthToWidth }),
    limbDepthToWidth: Object.freeze({ ...value.limbDepthToWidth }),
    vertical: Object.freeze({ ...value.vertical }),
  });
}

/** Owns, validates, and deeply freezes an untrusted priors record. */
export function snapshotMeasurementBodyShapePriorsV1(
  input: MeasurementBodyShapePriorsV1,
): MeasurementBodyShapePriorsV1 {
  assertClosedRecord(input, 'shapePriors', ROOT_KEYS);
  const schema = Object.getOwnPropertyDescriptor(input, 'schemaVersion');
  if (!schema || !('value' in schema) || schema.value !== MEASUREMENT_BODY_SHAPE_PRIORS_V1) {
    throw new RangeError('Unsupported measurement body shape priors schema.');
  }
  const torso = Object.getOwnPropertyDescriptor(input, 'torsoDepthToWidth');
  const limb = Object.getOwnPropertyDescriptor(input, 'limbDepthToWidth');
  const vertical = Object.getOwnPropertyDescriptor(input, 'vertical');
  if (!torso || !('value' in torso))
    throw new TypeError('shapePriors.torsoDepthToWidth is required.');
  if (!limb || !('value' in limb)) throw new TypeError('shapePriors.limbDepthToWidth is required.');
  if (!vertical || !('value' in vertical)) throw new TypeError('shapePriors.vertical is required.');
  assertClosedRecord(torso.value, 'shapePriors.torsoDepthToWidth', TORSO_KEYS);
  assertClosedRecord(limb.value, 'shapePriors.limbDepthToWidth', LIMB_KEYS);
  assertClosedRecord(vertical.value, 'shapePriors.vertical', VERTICAL_KEYS);

  const snapshot: MeasurementBodyShapePriorsV1 = {
    schemaVersion: MEASUREMENT_BODY_SHAPE_PRIORS_V1,
    torsoDepthToWidth: {
      chest: boundedNumber(torso.value, 'chest', 'shapePriors.torsoDepthToWidth', 0.35, 1.25),
      waist: boundedNumber(torso.value, 'waist', 'shapePriors.torsoDepthToWidth', 0.35, 1.25),
      hip: boundedNumber(torso.value, 'hip', 'shapePriors.torsoDepthToWidth', 0.35, 1.25),
    },
    limbDepthToWidth: {
      neck: boundedNumber(limb.value, 'neck', 'shapePriors.limbDepthToWidth', 0.5, 1.25),
      bicep: boundedNumber(limb.value, 'bicep', 'shapePriors.limbDepthToWidth', 0.5, 1.25),
      wrist: boundedNumber(limb.value, 'wrist', 'shapePriors.limbDepthToWidth', 0.5, 1.25),
      thigh: boundedNumber(limb.value, 'thigh', 'shapePriors.limbDepthToWidth', 0.5, 1.25),
      calf: boundedNumber(limb.value, 'calf', 'shapePriors.limbDepthToWidth', 0.5, 1.25),
      ankle: boundedNumber(limb.value, 'ankle', 'shapePriors.limbDepthToWidth', 0.5, 1.25),
    },
    vertical: {
      shoulderHeightToStature: boundedNumber(
        vertical.value,
        'shoulderHeightToStature',
        'shapePriors.vertical',
        0.65,
        0.9,
      ),
      kneeHeightToHipHeight: boundedNumber(
        vertical.value,
        'kneeHeightToHipHeight',
        'shapePriors.vertical',
        0.35,
        0.7,
      ),
      cbNeckToWaistFallbackToStature: boundedNumber(
        vertical.value,
        'cbNeckToWaistFallbackToStature',
        'shapePriors.vertical',
        0.12,
        0.35,
      ),
      shoulderToWaistMinimumToStature: boundedNumber(
        vertical.value,
        'shoulderToWaistMinimumToStature',
        'shapePriors.vertical',
        0.01,
        0.15,
      ),
      hipToWaistMinimumToStature: boundedNumber(
        vertical.value,
        'hipToWaistMinimumToStature',
        'shapePriors.vertical',
        0.01,
        0.15,
      ),
      chestPositionBetweenWaistAndShoulder: boundedNumber(
        vertical.value,
        'chestPositionBetweenWaistAndShoulder',
        'shapePriors.vertical',
        0.2,
        0.85,
      ),
    },
  };
  return freezePriors(snapshot);
}

/** Exact analytical-v2 constants before open-data calibration. */
export const DEFAULT_MEASUREMENT_BODY_SHAPE_PRIORS_V1: MeasurementBodyShapePriorsV1 = freezePriors({
  schemaVersion: MEASUREMENT_BODY_SHAPE_PRIORS_V1,
  torsoDepthToWidth: { chest: 0.72, waist: 0.68, hip: 0.78 },
  limbDepthToWidth: { neck: 0.86, bicep: 0.9, wrist: 0.88, thigh: 0.92, calf: 0.9, ankle: 0.86 },
  vertical: {
    shoulderHeightToStature: 0.78,
    kneeHeightToHipHeight: 0.52,
    cbNeckToWaistFallbackToStature: 0.235,
    shoulderToWaistMinimumToStature: 0.055,
    hipToWaistMinimumToStature: 0.045,
    chestPositionBetweenWaistAndShoulder: 0.56,
  },
});
