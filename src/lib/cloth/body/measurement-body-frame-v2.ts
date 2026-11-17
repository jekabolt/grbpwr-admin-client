import type { BodyPoseKind, PoseDescriptor, Vec3M } from './contracts';
import {
  CANONICAL_BODY_MEASUREMENTS_VERSION,
  type CanonicalBodyMeasurementsMm,
  type CanonicalMeasurementKey,
} from './measurement-adapter';
import { deriveStaticBodyDimensionsM, MeasurementBodyProvider } from './measurement-body-provider';
import {
  DEFAULT_MEASUREMENT_BODY_SHAPE_PRIORS_V1,
  snapshotMeasurementBodyShapePriorsV1,
  type MeasurementBodyShapePriorsV1,
} from './measurement-body-shape-priors-v1';

export const MEASUREMENT_BODY_FRAME_V2 = 'measurement-body-frame/v2' as const;

export type MeasurementBodyFrameSourceV2 = 'direct' | 'derived' | 'prior';
export type MeasurementBodyFrameConfidenceV2 = 'high' | 'medium' | 'low';

export interface MeasurementBodyFrameLandmarkV2 {
  readonly id: string;
  readonly positionM: Vec3M;
  readonly source: MeasurementBodyFrameSourceV2;
  readonly confidence: MeasurementBodyFrameConfidenceV2;
}

export interface MeasurementBodyFrameTorsoStationV2 {
  readonly id: 'pelvis-bottom' | 'hip' | 'waist' | 'chest' | 'shoulder';
  readonly yM: number;
  readonly halfWidthM: number;
  readonly halfDepthM: number;
  readonly source: MeasurementBodyFrameSourceV2;
  readonly confidence: MeasurementBodyFrameConfidenceV2;
}

export interface MeasurementBodyFrameSegmentV2 {
  readonly id:
    | 'neck'
    | 'upper-arm-left'
    | 'forearm-left'
    | 'upper-arm-right'
    | 'forearm-right'
    | 'thigh-left'
    | 'calf-left'
    | 'thigh-right'
    | 'calf-right';
  readonly aM: Vec3M;
  readonly bM: Vec3M;
  readonly radiusAM: readonly [sideM: number, depthM: number];
  readonly radiusBM: readonly [sideM: number, depthM: number];
  readonly source: MeasurementBodyFrameSourceV2;
  readonly confidence: MeasurementBodyFrameConfidenceV2;
}

export interface MeasurementBodyFrameEllipsoidV2 {
  readonly id: 'head' | 'hand-left' | 'hand-right' | 'foot-left' | 'foot-right';
  readonly centerM: Vec3M;
  readonly radiiM: Vec3M;
  readonly source: MeasurementBodyFrameSourceV2;
  readonly confidence: MeasurementBodyFrameConfidenceV2;
}

export interface MeasurementBodyFrameV2 {
  readonly version: typeof MEASUREMENT_BODY_FRAME_V2;
  readonly id: 'measurement-body-frame-v2';
  readonly revision: 'measurement-body-frame-v2.0.1';
  readonly units: 'm';
  readonly coordinateSystem: PoseDescriptor['coordinateSystem'];
  readonly pose: { readonly kind: BodyPoseKind; readonly armDownAngleDeg: number };
  readonly sourceRevision: string;
  readonly measurements: CanonicalBodyMeasurementsMm;
  readonly landmarks: readonly MeasurementBodyFrameLandmarkV2[];
  readonly torsoStations: readonly MeasurementBodyFrameTorsoStationV2[];
  readonly segments: readonly MeasurementBodyFrameSegmentV2[];
  readonly ellipsoids: readonly MeasurementBodyFrameEllipsoidV2[];
  readonly smoothUnionRadiusM: number;
  readonly assumptions: readonly string[];
}

const REQUIRED_KEYS = Object.freeze([
  'heightMm',
  'shoulderBreadthMm',
  'chestCircumferenceMm',
  'waistCircumferenceMm',
  'hipCircumferenceMm',
  'armLengthMm',
  'inseamMm',
] as const satisfies readonly CanonicalMeasurementKey[]);

const OPTIONAL_KEYS = Object.freeze([
  'underBustCircumferenceMm',
  'neckBaseCircumferenceMm',
  'neckCircumferenceMm',
  'highHipCircumferenceMm',
  'bicepCircumferenceMm',
  'wristCircumferenceMm',
  'thighCircumferenceMm',
  'kneeCircumferenceMm',
  'calfCircumferenceMm',
  'ankleCircumferenceMm',
  'hpsToWaistFrontMm',
  'cbNeckToWaistMm',
  'acrossFrontMm',
  'acrossBackMm',
  'hpsHeightMm',
  'cfNeckToWaistMm',
  'waistHeightMm',
  'waistToHighHipMm',
  'waistToHipMm',
  'chestDepthMm',
  'waistDepthMm',
  'hipDepthMm',
  'shoulderLengthMm',
  'shoulderDropMm',
  'armscyeDepthMm',
  'armscyeCircumferenceMm',
  'bustApexToApexMm',
  'hpsToBustApexMm',
] as const satisfies readonly CanonicalMeasurementKey[]);

const ALLOWED_KEYS = new Set<PropertyKey>(['schemaVersion', ...REQUIRED_KEYS, ...OPTIONAL_KEYS]);
const COORDINATE_SYSTEM: PoseDescriptor['coordinateSystem'] = Object.freeze({
  handedness: 'right',
  up: '+Y',
  front: '+Z',
  subjectLeft: '+X',
  origin: 'ground-projection-between-ankles',
});

function closedCanonicalSnapshot(input: CanonicalBodyMeasurementsMm): CanonicalBodyMeasurementsMm {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    throw new TypeError('Canonical measurements must be a plain record.');
  }
  const prototype = Object.getPrototypeOf(input);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new TypeError('Canonical measurements must have a plain object prototype.');
  }
  const keys = Reflect.ownKeys(input);
  for (const key of keys) {
    if (!ALLOWED_KEYS.has(key))
      throw new RangeError(`Unknown canonical measurement key ${String(key)}.`);
    const descriptor = Object.getOwnPropertyDescriptor(input, key);
    if (!descriptor || !descriptor.enumerable || !('value' in descriptor)) {
      throw new TypeError(
        `Canonical measurement ${String(key)} must be an enumerable data property.`,
      );
    }
  }
  let cloned: CanonicalBodyMeasurementsMm;
  try {
    cloned = structuredClone(input);
  } catch {
    throw new TypeError('Canonical measurements must be an owned cloneable plain record.');
  }
  const readNumber = (key: CanonicalMeasurementKey, required: boolean): number | undefined => {
    const descriptor = Object.getOwnPropertyDescriptor(cloned, key);
    if (!descriptor) {
      if (required) throw new RangeError(`Canonical measurement ${key} is required.`);
      return undefined;
    }
    if (!('value' in descriptor) || typeof descriptor.value !== 'number') {
      throw new TypeError(`Canonical measurement ${key} must be a number.`);
    }
    return descriptor.value;
  };
  const schema = Object.getOwnPropertyDescriptor(cloned, 'schemaVersion');
  if (!schema || !('value' in schema) || schema.value !== CANONICAL_BODY_MEASUREMENTS_VERSION) {
    throw new RangeError('Unsupported canonical measurement schema.');
  }
  const values: Partial<Record<CanonicalMeasurementKey, number>> = {};
  for (const key of REQUIRED_KEYS) values[key] = readNumber(key, true);
  for (const key of OPTIONAL_KEYS) {
    const value = readNumber(key, false);
    if (value !== undefined) values[key] = value;
  }
  const snapshot: CanonicalBodyMeasurementsMm = {
    schemaVersion: CANONICAL_BODY_MEASUREMENTS_VERSION,
    heightMm: values.heightMm!,
    shoulderBreadthMm: values.shoulderBreadthMm!,
    chestCircumferenceMm: values.chestCircumferenceMm!,
    waistCircumferenceMm: values.waistCircumferenceMm!,
    hipCircumferenceMm: values.hipCircumferenceMm!,
    armLengthMm: values.armLengthMm!,
    inseamMm: values.inseamMm!,
    ...Object.fromEntries(
      OPTIONAL_KEYS.filter((key) => values[key] !== undefined).map((key) => [key, values[key]]),
    ),
  };
  // Reuse the provider's exact plausibility/correlation authority after the untrusted input is owned.
  deriveStaticBodyDimensionsM(snapshot);
  return Object.freeze(snapshot);
}

function ellipseHalfAxes(
  circumferenceM: number,
  depthToWidthRatio: number,
): readonly [number, number] {
  const q = depthToWidthRatio;
  const factor = Math.PI * (3 * (1 + q) - Math.sqrt((3 + q) * (1 + 3 * q)));
  return Object.freeze([circumferenceM / factor, (circumferenceM / factor) * q]);
}

function freezeVec(value: Vec3M): Vec3M {
  return Object.freeze([...value]) as unknown as Vec3M;
}

function freezeLandmark(value: MeasurementBodyFrameLandmarkV2): MeasurementBodyFrameLandmarkV2 {
  return Object.freeze({ ...value, positionM: freezeVec(value.positionM) });
}

function freezeSegment(value: MeasurementBodyFrameSegmentV2): MeasurementBodyFrameSegmentV2 {
  return Object.freeze({
    ...value,
    aM: freezeVec(value.aM),
    bM: freezeVec(value.bM),
    radiusAM: Object.freeze([...value.radiusAM]) as unknown as readonly [number, number],
    radiusBM: Object.freeze([...value.radiusBM]) as unknown as readonly [number, number],
  });
}

function sidePoint(side: 'left' | 'right', x: number, y: number, z = 0): Vec3M {
  return [side === 'left' ? x : -x, y, z];
}

export function createMeasurementBodyFrameV2(options: {
  readonly measurements: CanonicalBodyMeasurementsMm;
  readonly sourceRevision: string;
  readonly pose?: BodyPoseKind;
  readonly shapePriors?: MeasurementBodyShapePriorsV1;
}): MeasurementBodyFrameV2 {
  if (typeof options.sourceRevision !== 'string' || !options.sourceRevision.trim()) {
    throw new RangeError('sourceRevision is required.');
  }
  const pose = options.pose ?? 'A';
  if (pose !== 'A' && pose !== 'T') throw new RangeError('pose must be A or T.');
  const shapePriors = snapshotMeasurementBodyShapePriorsV1(
    options.shapePriors ?? DEFAULT_MEASUREMENT_BODY_SHAPE_PRIORS_V1,
  );
  const measurements = closedCanonicalSnapshot(options.measurements);
  const d = deriveStaticBodyDimensionsM(measurements);
  const height = d.height;
  const shoulderY = height * shapePriors.vertical.shoulderHeightToStature;
  const shoulderHalfWidth = d.shoulderWidth / 2;
  const armAngle = pose === 'A' ? (35 * Math.PI) / 180 : 0;
  const armDx = Math.cos(armAngle);
  const armDy = -Math.sin(armAngle);
  const arms = (side: 'left' | 'right') => {
    const sign = side === 'left' ? 1 : -1;
    const shoulder = sidePoint(side, shoulderHalfWidth, shoulderY);
    const elbow: Vec3M = [
      shoulder[0] + sign * armDx * d.upperArmLength,
      shoulder[1] + armDy * d.upperArmLength,
      0,
    ];
    const wrist: Vec3M = [
      elbow[0] + sign * armDx * d.forearmLength,
      elbow[1] + armDy * d.forearmLength,
      0,
    ];
    return { shoulder, elbow, wrist };
  };
  const leftArm = arms('left');
  const rightArm = arms('right');
  const hipY = d.inseamLength;
  const kneeY = hipY * shapePriors.vertical.kneeHeightToHipHeight;
  const ankleY = d.calfRadius;
  // `cbNeckToWaistMm` is a tape-on-surface C7-to-waist contour. It cannot be used as the
  // straight +Y shoulder-to-waist projection without an explicit posture/back-profile model.
  // The legacy-named shape-prior key below is only an authored vertical proportion; it does not
  // derive from, or fall back from, the canonical surface-path measurement.
  const inferredWaistY = shoulderY - height * shapePriors.vertical.cbNeckToWaistFallbackToStature;
  const waistY = Math.min(
    shoulderY - height * shapePriors.vertical.shoulderToWaistMinimumToStature,
    Math.max(hipY + height * shapePriors.vertical.hipToWaistMinimumToStature, inferredWaistY),
  );
  const chestY =
    waistY + (shoulderY - waistY) * shapePriors.vertical.chestPositionBetweenWaistAndShoulder;
  const chestAxes = ellipseHalfAxes(
    measurements.chestCircumferenceMm / 1000,
    shapePriors.torsoDepthToWidth.chest,
  );
  const waistAxes = ellipseHalfAxes(
    measurements.waistCircumferenceMm / 1000,
    shapePriors.torsoDepthToWidth.waist,
  );
  const hipAxes = ellipseHalfAxes(
    measurements.hipCircumferenceMm / 1000,
    shapePriors.torsoDepthToWidth.hip,
  );
  const neckAxes = ellipseHalfAxes(
    (measurements.neckBaseCircumferenceMm ?? measurements.shoulderBreadthMm * 0.86) / 1000,
    shapePriors.limbDepthToWidth.neck,
  );
  const bicepAxes = ellipseHalfAxes(
    (measurements.bicepCircumferenceMm ?? measurements.chestCircumferenceMm * 0.32) / 1000,
    shapePriors.limbDepthToWidth.bicep,
  );
  const wristAxes = ellipseHalfAxes(
    (measurements.wristCircumferenceMm ?? Math.max(180, measurements.chestCircumferenceMm * 0.17)) /
      1000,
    shapePriors.limbDepthToWidth.wrist,
  );
  const thighAxes = ellipseHalfAxes(
    (measurements.thighCircumferenceMm ?? measurements.hipCircumferenceMm * 0.57) / 1000,
    shapePriors.limbDepthToWidth.thigh,
  );
  const calfAxes = ellipseHalfAxes(
    (measurements.calfCircumferenceMm ?? measurements.hipCircumferenceMm * 0.38) / 1000,
    shapePriors.limbDepthToWidth.calf,
  );
  const ankleAxes = ellipseHalfAxes(
    (measurements.ankleCircumferenceMm ??
      (measurements.calfCircumferenceMm ?? measurements.hipCircumferenceMm * 0.38) * 0.62) / 1000,
    shapePriors.limbDepthToWidth.ankle,
  );
  const headRadius = d.headRadius;
  const headCenterY = height - headRadius;
  const neckTopY = headCenterY - headRadius * 0.72;

  const landmarks = Object.freeze(
    [
      { id: 'crown', positionM: [0, height, 0], source: 'direct', confidence: 'high' },
      { id: 'neck-base', positionM: [0, height * 0.79, 0], source: 'prior', confidence: 'low' },
      { id: 'shoulder-left', positionM: leftArm.shoulder, source: 'direct', confidence: 'medium' },
      {
        id: 'shoulder-right',
        positionM: rightArm.shoulder,
        source: 'direct',
        confidence: 'medium',
      },
      { id: 'elbow-left', positionM: leftArm.elbow, source: 'prior', confidence: 'low' },
      { id: 'elbow-right', positionM: rightArm.elbow, source: 'prior', confidence: 'low' },
      { id: 'wrist-left', positionM: leftArm.wrist, source: 'derived', confidence: 'medium' },
      { id: 'wrist-right', positionM: rightArm.wrist, source: 'derived', confidence: 'medium' },
      { id: 'chest-center', positionM: [0, height * 0.72, 0], source: 'prior', confidence: 'low' },
      { id: 'waist-center', positionM: [0, height * 0.6, 0], source: 'prior', confidence: 'low' },
      {
        id: 'hip-left',
        positionM: [d.hipHalfWidth, hipY, 0],
        source: 'derived',
        confidence: 'medium',
      },
      {
        id: 'hip-right',
        positionM: [-d.hipHalfWidth, hipY, 0],
        source: 'derived',
        confidence: 'medium',
      },
      {
        id: 'knee-left',
        positionM: [d.hipHalfWidth, kneeY, 0],
        source: 'prior',
        confidence: 'low',
      },
      {
        id: 'knee-right',
        positionM: [-d.hipHalfWidth, kneeY, 0],
        source: 'prior',
        confidence: 'low',
      },
      {
        id: 'ankle-left',
        positionM: [d.hipHalfWidth, ankleY, 0],
        source: 'derived',
        confidence: 'medium',
      },
      {
        id: 'ankle-right',
        positionM: [-d.hipHalfWidth, ankleY, 0],
        source: 'derived',
        confidence: 'medium',
      },
    ].map((value) => freezeLandmark(value as MeasurementBodyFrameLandmarkV2)),
  );

  const torsoStations = Object.freeze(
    [
      {
        id: 'pelvis-bottom',
        yM: Math.max(hipY - height * 0.105, d.calfRadius * 2.2),
        halfWidthM: hipAxes[0] * 0.72,
        halfDepthM: hipAxes[1] * 0.78,
        source: 'prior',
        confidence: 'low',
      },
      {
        id: 'hip',
        yM: hipY,
        halfWidthM: hipAxes[0],
        halfDepthM: hipAxes[1],
        source: 'direct',
        confidence: 'medium',
      },
      {
        id: 'waist',
        yM: waistY,
        halfWidthM: waistAxes[0],
        halfDepthM: waistAxes[1],
        source: 'direct',
        confidence: 'medium',
      },
      {
        id: 'chest',
        yM: chestY,
        halfWidthM: chestAxes[0],
        halfDepthM: chestAxes[1],
        source: 'direct',
        confidence: 'medium',
      },
      {
        id: 'shoulder',
        yM: shoulderY,
        halfWidthM: shoulderHalfWidth * 0.9,
        halfDepthM: chestAxes[1] * 0.82,
        source: 'prior',
        confidence: 'low',
      },
    ].map((value) => Object.freeze(value as MeasurementBodyFrameTorsoStationV2)),
  );

  const segments: MeasurementBodyFrameSegmentV2[] = [
    {
      id: 'neck',
      aM: [0, shoulderY - height * 0.01, 0],
      bM: [0, neckTopY, 0],
      radiusAM: [neckAxes[0] * 1.08, neckAxes[1] * 1.08],
      radiusBM: [neckAxes[0] * 0.88, neckAxes[1] * 0.88],
      source: measurements.neckBaseCircumferenceMm == null ? 'prior' : 'direct',
      confidence: measurements.neckBaseCircumferenceMm == null ? 'low' : 'medium',
    },
    {
      id: 'upper-arm-left',
      aM: leftArm.shoulder,
      bM: leftArm.elbow,
      radiusAM: bicepAxes,
      radiusBM: [bicepAxes[0] * 0.78, bicepAxes[1] * 0.78],
      source: measurements.bicepCircumferenceMm == null ? 'prior' : 'direct',
      confidence: measurements.bicepCircumferenceMm == null ? 'low' : 'medium',
    },
    {
      id: 'forearm-left',
      aM: leftArm.elbow,
      bM: leftArm.wrist,
      radiusAM: [bicepAxes[0] * 0.72, bicepAxes[1] * 0.72],
      radiusBM: wristAxes,
      source: measurements.wristCircumferenceMm == null ? 'prior' : 'direct',
      confidence: measurements.wristCircumferenceMm == null ? 'low' : 'medium',
    },
    {
      id: 'upper-arm-right',
      aM: rightArm.shoulder,
      bM: rightArm.elbow,
      radiusAM: bicepAxes,
      radiusBM: [bicepAxes[0] * 0.78, bicepAxes[1] * 0.78],
      source: measurements.bicepCircumferenceMm == null ? 'prior' : 'direct',
      confidence: measurements.bicepCircumferenceMm == null ? 'low' : 'medium',
    },
    {
      id: 'forearm-right',
      aM: rightArm.elbow,
      bM: rightArm.wrist,
      radiusAM: [bicepAxes[0] * 0.72, bicepAxes[1] * 0.72],
      radiusBM: wristAxes,
      source: measurements.wristCircumferenceMm == null ? 'prior' : 'direct',
      confidence: measurements.wristCircumferenceMm == null ? 'low' : 'medium',
    },
    {
      id: 'thigh-left',
      aM: [d.hipHalfWidth, hipY + height * 0.018, 0],
      bM: [d.hipHalfWidth, kneeY, 0],
      radiusAM: thighAxes,
      radiusBM: [thighAxes[0] * 0.68, thighAxes[1] * 0.68],
      source: measurements.thighCircumferenceMm == null ? 'prior' : 'direct',
      confidence: measurements.thighCircumferenceMm == null ? 'low' : 'medium',
    },
    {
      id: 'calf-left',
      aM: [d.hipHalfWidth, kneeY, 0],
      bM: [d.hipHalfWidth, ankleY, 0],
      radiusAM: calfAxes,
      radiusBM: ankleAxes,
      source:
        measurements.calfCircumferenceMm == null || measurements.ankleCircumferenceMm == null
          ? 'prior'
          : 'direct',
      confidence:
        measurements.calfCircumferenceMm == null || measurements.ankleCircumferenceMm == null
          ? 'low'
          : 'medium',
    },
    {
      id: 'thigh-right',
      aM: [-d.hipHalfWidth, hipY + height * 0.018, 0],
      bM: [-d.hipHalfWidth, kneeY, 0],
      radiusAM: thighAxes,
      radiusBM: [thighAxes[0] * 0.68, thighAxes[1] * 0.68],
      source: measurements.thighCircumferenceMm == null ? 'prior' : 'direct',
      confidence: measurements.thighCircumferenceMm == null ? 'low' : 'medium',
    },
    {
      id: 'calf-right',
      aM: [-d.hipHalfWidth, kneeY, 0],
      bM: [-d.hipHalfWidth, ankleY, 0],
      radiusAM: calfAxes,
      radiusBM: ankleAxes,
      source:
        measurements.calfCircumferenceMm == null || measurements.ankleCircumferenceMm == null
          ? 'prior'
          : 'direct',
      confidence:
        measurements.calfCircumferenceMm == null || measurements.ankleCircumferenceMm == null
          ? 'low'
          : 'medium',
    },
  ];

  const hand = (side: 'left' | 'right', wrist: Vec3M): MeasurementBodyFrameEllipsoidV2 => {
    return {
      id: `hand-${side}`,
      centerM: [wrist[0], wrist[1], 0],
      radiiM: [wristAxes[0] * 1.8, wristAxes[0], wristAxes[1] * 1.1],
      source: 'prior',
      confidence: 'low',
    };
  };
  const ellipsoids = Object.freeze(
    [
      {
        id: 'head',
        centerM: [0, headCenterY, 0],
        radiiM: [headRadius * 0.78, headRadius, headRadius * 0.82],
        source: 'prior',
        confidence: 'low',
      },
      hand('left', leftArm.wrist),
      hand('right', rightArm.wrist),
      {
        id: 'foot-left',
        centerM: [d.hipHalfWidth, ankleAxes[0] * 0.82, ankleAxes[1] * 1.35],
        radiiM: [ankleAxes[0] * 1.08, ankleAxes[0] * 0.82, ankleAxes[1] * 2.45],
        source: 'prior',
        confidence: 'low',
      },
      {
        id: 'foot-right',
        centerM: [-d.hipHalfWidth, ankleAxes[0] * 0.82, ankleAxes[1] * 1.35],
        radiiM: [ankleAxes[0] * 1.08, ankleAxes[0] * 0.82, ankleAxes[1] * 2.45],
        source: 'prior',
        confidence: 'low',
      },
    ].map(
      (value) =>
        Object.freeze({
          ...value,
          centerM: freezeVec(value.centerM as Vec3M),
          radiiM: freezeVec(value.radiiM as Vec3M),
        }) as MeasurementBodyFrameEllipsoidV2,
    ),
  );

  const frame: MeasurementBodyFrameV2 = {
    version: MEASUREMENT_BODY_FRAME_V2,
    id: 'measurement-body-frame-v2',
    revision: 'measurement-body-frame-v2.0.1',
    units: 'm',
    coordinateSystem: Object.freeze({ ...COORDINATE_SYSTEM }),
    pose: Object.freeze({ kind: pose, armDownAngleDeg: pose === 'A' ? 35 : 0 }),
    sourceRevision: options.sourceRevision.trim(),
    measurements,
    landmarks,
    torsoStations,
    segments: Object.freeze(segments.map(freezeSegment)),
    ellipsoids,
    smoothUnionRadiusM: Math.min(0.025, height * 0.015),
    assumptions: Object.freeze([
      'bilateral-symmetry',
      'fixed-torso-depth-ratios',
      'fixed-limb-depth-ratios',
      'fixed-segment-length-splits',
      'stylized-head-hands-feet',
      `authored-shoulder-to-waist-vertical-prior-to-stature=${shapePriors.vertical.cbNeckToWaistFallbackToStature}`,
      'cb-neck-to-waist-surface-path-retained-not-used-as-vertical-projection',
    ]),
  };
  return Object.freeze(frame);
}

export async function compareMeasurementBodyFrameV2WithCurrentProvider(
  frame: MeasurementBodyFrameV2,
): Promise<readonly string[]> {
  const body = await new MeasurementBodyProvider({
    measurements: frame.measurements,
    sourceRevision: frame.sourceRevision,
    pose: frame.pose.kind,
  }).reconstruct({ requestedPose: frame.pose.kind, sourceRevision: frame.sourceRevision });
  const errors: string[] = [];
  for (const landmark of body.landmarks.landmarks) {
    const candidate = frame.landmarks.find(({ id }) => id === landmark.id);
    if (
      !candidate ||
      candidate.positionM.some((value, axis) => !Object.is(value, landmark.positionM[axis]))
    ) {
      errors.push(`landmark ${landmark.id} does not exactly match MeasurementBodyProvider.`);
    }
  }
  return Object.freeze(errors);
}
