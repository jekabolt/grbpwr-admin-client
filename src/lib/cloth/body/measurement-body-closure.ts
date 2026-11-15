import type { BodyArtifact, BodyLandmark, CapsuleCollider, Vec3M } from './contracts';
import type { CanonicalBodyMeasurementsMm } from './measurement-adapter';
import { deriveStaticBodyDimensionsM, MeasurementBodyProvider } from './measurement-body-provider';
import type { StaticBodyDimensionsM } from './static-body-provider';

export const MEASUREMENT_BODY_CLOSURE_VERSION = 'measurement-body-closure-v1' as const;

export type ClosureMeasurementKey =
  | 'heightMm'
  | 'shoulderBreadthMm'
  | 'chestCircumferenceMm'
  | 'waistCircumferenceMm'
  | 'hipCircumferenceMm'
  | 'armLengthMm'
  | 'inseamMm';

export interface MeasurementBodyClosureMetric {
  readonly key: ClosureMeasurementKey;
  readonly inputMm: number;
  readonly reconstructedMm: number;
  readonly absoluteErrorMm: number;
  readonly relativeError: number;
  readonly confidence: 'high' | 'medium' | 'low';
  readonly confidenceAuthority: 'LEGACY_ENGINEERING_LABEL_ONLY';
  readonly source: 'landmark' | 'collider-proxy';
  readonly proxy: boolean;
  readonly threshold: {
    readonly absoluteErrorMm?: number;
    readonly relativeError?: number;
  };
  /** Legacy engineering allowance only; it is not an approved calibration tolerance. */
  readonly thresholdAuthority: 'LEGACY_DIAGNOSTIC_ONLY_NOT_CALIBRATION';
  readonly passed: boolean;
  readonly note: string;
}

export interface MeasurementBodyClosureReport {
  readonly schemaVersion: typeof MEASUREMENT_BODY_CLOSURE_VERSION;
  readonly artifactRevision: string;
  readonly input: CanonicalBodyMeasurementsMm;
  readonly derivedDimensionsM: StaticBodyDimensionsM;
  readonly reconstructedMeasurementsMm: Readonly<Record<ClosureMeasurementKey, number>>;
  readonly metrics: readonly MeasurementBodyClosureMetric[];
  readonly summary: {
    /** Legacy diagnostic result only; it must not be interpreted as calibration acceptance. */
    readonly passed: boolean;
    readonly passedMeaning: 'LEGACY_DIAGNOSTIC_ALLOWANCES_ONLY';
    readonly passedCount: number;
    readonly failedCount: number;
    readonly diagnosticThresholdsOnly: true;
    readonly approvedToleranceRevision: null;
    readonly calibrationReady: false;
    /** Always false for analytical-body-v0, independently of legacy diagnostic results. */
    readonly fitClaimEligible: false;
    readonly collisionClaimEligible: false;
    readonly bodySurfaceAccuracyClaimEligible: false;
    readonly populationRepresentativenessClaimed: false;
    readonly optionalMeasurementEffectsFullyReported: false;
    readonly blockers: readonly string[];
  };
  readonly reportHashBoundary: {
    readonly algorithm: 'FNV-1A-32';
    readonly integrityVerified: false;
    readonly authenticityVerified: false;
    readonly purpose: 'DETERMINISTIC_NON_CRYPTOGRAPHIC_CHECKSUM_ONLY';
  };
  readonly reportHash: string;
}

const FIT_CLAIM_BLOCKERS = Object.freeze([
  'legacy-diagnostic-thresholds-are-not-approved-calibration-tolerances',
  'confidence-labels-have-no-external-method-authority',
  'fnv1a32-checksum-provides-neither-integrity-nor-authenticity',
  'optional-measurement-effects-are-not-exhaustively-reported',
  'chest-waist-share-one-torso-radius',
  'waist-has-no-dedicated-collider-section',
  'circumferences-use-circular-proxies-without-front-back-depth',
] as const);

const REQUIRED_CANONICAL_KEYS = [
  'schemaVersion',
  'heightMm',
  'shoulderBreadthMm',
  'chestCircumferenceMm',
  'waistCircumferenceMm',
  'hipCircumferenceMm',
  'armLengthMm',
  'inseamMm',
] as const satisfies readonly (keyof CanonicalBodyMeasurementsMm)[];

const OPTIONAL_CANONICAL_KEYS = [
  'underBustCircumferenceMm',
  'neckBaseCircumferenceMm',
  'bicepCircumferenceMm',
  'wristCircumferenceMm',
  'thighCircumferenceMm',
  'calfCircumferenceMm',
  'ankleCircumferenceMm',
  'hpsToWaistFrontMm',
  'cbNeckToWaistMm',
  'acrossFrontMm',
  'acrossBackMm',
] as const satisfies readonly (keyof CanonicalBodyMeasurementsMm)[];

const REQUIRED_CANONICAL_KEY_SET = new Set<keyof CanonicalBodyMeasurementsMm>(
  REQUIRED_CANONICAL_KEYS,
);

function canonicalSnapshot(input: CanonicalBodyMeasurementsMm): CanonicalBodyMeasurementsMm {
  let prototype: object | null;
  let ownKeys: readonly PropertyKey[];
  try {
    if (input == null || typeof input !== 'object' || Array.isArray(input)) {
      throw new TypeError('measurements must be a plain object.');
    }
    prototype = Object.getPrototypeOf(input);
    ownKeys = Reflect.ownKeys(input);
  } catch {
    throw new TypeError('measurements must be inspectable plain data.');
  }
  if (prototype !== Object.prototype && prototype !== null) {
    throw new TypeError('measurements must use a plain object prototype.');
  }
  const admittedKeys = new Set<PropertyKey>([
    ...REQUIRED_CANONICAL_KEYS,
    ...OPTIONAL_CANONICAL_KEYS,
  ]);
  if (ownKeys.some((key) => typeof key !== 'string' || !admittedKeys.has(key))) {
    throw new TypeError('measurements contain an unknown or symbol field.');
  }
  const mutable = {} as Record<string, unknown>;
  for (const key of [...REQUIRED_CANONICAL_KEYS, ...OPTIONAL_CANONICAL_KEYS]) {
    let descriptor: PropertyDescriptor | undefined;
    try {
      descriptor = Object.getOwnPropertyDescriptor(input, key);
    } catch {
      throw new TypeError(`measurements.${key} descriptor cannot be inspected.`);
    }
    const required = REQUIRED_CANONICAL_KEY_SET.has(key);
    if (descriptor == null) {
      if (required) throw new TypeError(`measurements.${key} is required.`);
      continue;
    }
    if (!descriptor.enumerable || !('value' in descriptor)) {
      throw new TypeError(`measurements.${key} must be an enumerable data property.`);
    }
    if (required || descriptor.value != null) mutable[key] = descriptor.value;
  }
  return Object.freeze(mutable) as unknown as CanonicalBodyMeasurementsMm;
}

function landmark(artifact: BodyArtifact, id: string): BodyLandmark {
  const value = artifact.landmarks.landmarks.find((candidate) => candidate.id === id);
  if (!value) throw new Error(`Measurement closure requires landmark ${id}.`);
  return value;
}

function capsule(artifact: BodyArtifact, id: string): CapsuleCollider {
  const lod = artifact.collisionLods.find(
    (candidate) => candidate.id === artifact.defaultCollisionLodId,
  );
  const value = lod?.capsules.find((candidate) => candidate.id === id);
  if (!value) throw new Error(`Measurement closure requires collider ${id}.`);
  return value;
}

function distanceMm(first: Vec3M, second: Vec3M): number {
  return Math.hypot(first[0] - second[0], first[1] - second[1], first[2] - second[2]) * 1000;
}

function metric(
  key: ClosureMeasurementKey,
  inputMm: number,
  reconstructedMm: number,
  options: Pick<
    MeasurementBodyClosureMetric,
    'confidence' | 'source' | 'proxy' | 'threshold' | 'note'
  >,
): MeasurementBodyClosureMetric {
  if (!Number.isFinite(inputMm) || inputMm <= 0 || !Number.isFinite(reconstructedMm)) {
    throw new RangeError(`Closure metric ${key} contains invalid values.`);
  }
  const absoluteErrorMm = Math.abs(reconstructedMm - inputMm);
  const relativeError = absoluteErrorMm / inputMm;
  const passed =
    (options.threshold.absoluteErrorMm != null &&
      absoluteErrorMm <= options.threshold.absoluteErrorMm) ||
    (options.threshold.relativeError != null && relativeError <= options.threshold.relativeError);
  return Object.freeze({
    key,
    inputMm,
    reconstructedMm,
    absoluteErrorMm,
    relativeError,
    ...options,
    confidenceAuthority: 'LEGACY_ENGINEERING_LABEL_ONLY',
    threshold: Object.freeze({ ...options.threshold }),
    thresholdAuthority: 'LEGACY_DIAGNOSTIC_ONLY_NOT_CALIBRATION',
    passed,
  });
}

function fnv1a32(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return `fnv1a32:${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

export function hashMeasurementBodyClosureReport(
  report: Omit<MeasurementBodyClosureReport, 'reportHash'>,
): string {
  return fnv1a32(JSON.stringify(report));
}

export async function createMeasurementBodyClosureReport(options: {
  readonly measurements: CanonicalBodyMeasurementsMm;
  readonly sourceRevision: string;
  readonly pose?: 'A' | 'T';
}): Promise<MeasurementBodyClosureReport> {
  const input = canonicalSnapshot(options.measurements);
  const derivedDimensionsM = Object.freeze({ ...deriveStaticBodyDimensionsM(input) });
  const artifact = await new MeasurementBodyProvider({
    measurements: input,
    sourceRevision: options.sourceRevision,
    pose: options.pose,
  }).reconstruct();

  const crown = landmark(artifact, 'crown');
  const shoulderLeft = landmark(artifact, 'shoulder-left');
  const shoulderRight = landmark(artifact, 'shoulder-right');
  const wristLeft = landmark(artifact, 'wrist-left');
  const wristRight = landmark(artifact, 'wrist-right');
  const hipLeft = landmark(artifact, 'hip-left');
  const hipRight = landmark(artifact, 'hip-right');
  const torso = capsule(artifact, 'lod1-torso');
  const pelvis = capsule(artifact, 'lod1-pelvis');
  const reconstructedMeasurementsMm = Object.freeze({
    heightMm: crown.positionM[1] * 1000,
    shoulderBreadthMm: distanceMm(shoulderLeft.positionM, shoulderRight.positionM),
    chestCircumferenceMm: torso.radiusM * Math.PI * 2 * 1000,
    waistCircumferenceMm: pelvis.radiusM * Math.PI * 2 * 1000,
    hipCircumferenceMm: pelvis.radiusM * Math.PI * 2 * 1000,
    armLengthMm:
      (distanceMm(shoulderLeft.positionM, wristLeft.positionM) +
        distanceMm(shoulderRight.positionM, wristRight.positionM)) /
      2,
    inseamMm: ((hipLeft.positionM[1] + hipRight.positionM[1]) / 2) * 1000,
  } satisfies Record<ClosureMeasurementKey, number>);

  const metrics: MeasurementBodyClosureMetric[] = [
    metric('heightMm', input.heightMm, reconstructedMeasurementsMm.heightMm, {
      confidence: 'high',
      source: 'landmark',
      proxy: false,
      threshold: { absoluteErrorMm: 0.01 },
      note: 'Crown landmark in the ground-origin coordinate system.',
    }),
    metric(
      'shoulderBreadthMm',
      input.shoulderBreadthMm,
      reconstructedMeasurementsMm.shoulderBreadthMm,
      {
        confidence: 'medium',
        source: 'landmark',
        proxy: false,
        threshold: { absoluteErrorMm: 0.01 },
        note: 'Straight distance between shoulder landmarks.',
      },
    ),
    metric(
      'chestCircumferenceMm',
      input.chestCircumferenceMm,
      reconstructedMeasurementsMm.chestCircumferenceMm,
      {
        confidence: 'low',
        source: 'collider-proxy',
        proxy: true,
        threshold: { relativeError: 0.15 },
        note: 'Circular proxy from the blended chest/waist torso capsule.',
      },
    ),
    metric(
      'waistCircumferenceMm',
      input.waistCircumferenceMm,
      reconstructedMeasurementsMm.waistCircumferenceMm,
      {
        confidence: 'low',
        source: 'collider-proxy',
        proxy: true,
        threshold: { relativeError: 0.4 },
        note: 'Conservative pelvis-capsule proxy; v0 has no dedicated waist section.',
      },
    ),
    metric(
      'hipCircumferenceMm',
      input.hipCircumferenceMm,
      reconstructedMeasurementsMm.hipCircumferenceMm,
      {
        confidence: 'low',
        source: 'collider-proxy',
        proxy: true,
        threshold: { relativeError: 0.15 },
        note: 'Circular proxy from the blended hip/waist pelvis capsule.',
      },
    ),
    metric('armLengthMm', input.armLengthMm, reconstructedMeasurementsMm.armLengthMm, {
      confidence: 'medium',
      source: 'landmark',
      proxy: false,
      threshold: { absoluteErrorMm: 0.01 },
      note: 'Mean straight shoulder-to-wrist landmark distance in the fixed pose.',
    }),
    metric('inseamMm', input.inseamMm, reconstructedMeasurementsMm.inseamMm, {
      confidence: 'medium',
      source: 'landmark',
      proxy: false,
      threshold: { absoluteErrorMm: 0.01 },
      note: 'Mean hip landmark height above the ground origin.',
    }),
  ];
  const passedCount = metrics.filter((value) => value.passed).length;
  const withoutHash: Omit<MeasurementBodyClosureReport, 'reportHash'> = Object.freeze({
    schemaVersion: MEASUREMENT_BODY_CLOSURE_VERSION,
    artifactRevision: artifact.revision,
    input,
    derivedDimensionsM,
    reconstructedMeasurementsMm,
    metrics: Object.freeze(metrics),
    summary: Object.freeze({
      passed: passedCount === metrics.length,
      passedMeaning: 'LEGACY_DIAGNOSTIC_ALLOWANCES_ONLY',
      passedCount,
      failedCount: metrics.length - passedCount,
      diagnosticThresholdsOnly: true,
      approvedToleranceRevision: null,
      calibrationReady: false,
      fitClaimEligible: false,
      collisionClaimEligible: false,
      bodySurfaceAccuracyClaimEligible: false,
      populationRepresentativenessClaimed: false,
      optionalMeasurementEffectsFullyReported: false,
      blockers: FIT_CLAIM_BLOCKERS,
    }),
    reportHashBoundary: Object.freeze({
      algorithm: 'FNV-1A-32',
      integrityVerified: false,
      authenticityVerified: false,
      purpose: 'DETERMINISTIC_NON_CRYPTOGRAPHIC_CHECKSUM_ONLY',
    }),
  });
  return Object.freeze({
    ...withoutHash,
    reportHash: hashMeasurementBodyClosureReport(withoutHash),
  });
}
