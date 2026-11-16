import type { BodyArtifact, BodyInput, BodyPoseKind, BodyProvider } from './contracts';
import {
  CANONICAL_BODY_MEASUREMENTS_VERSION,
  CANONICAL_MEASUREMENT_PLAUSIBILITY_MM,
  validateCanonicalMeasurementCorrelations,
  type CanonicalBodyMeasurementsMm,
  type CanonicalMeasurementKey,
} from './measurement-adapter';
import { StaticBodyProvider, type StaticBodyDimensionsM } from './static-body-provider';
import { assertValidBodyArtifact } from './validation';

const PROVIDER_REVISION = 'measurement-analytical-v1';
const TWO_PI = Math.PI * 2;

const REQUIRED_MEASUREMENT_KEYS = Object.freeze([
  'heightMm',
  'shoulderBreadthMm',
  'chestCircumferenceMm',
  'waistCircumferenceMm',
  'hipCircumferenceMm',
  'armLengthMm',
  'inseamMm',
] as const satisfies readonly CanonicalMeasurementKey[]);

const OPTIONAL_MEASUREMENT_KEYS = Object.freeze([
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

const CANONICAL_MEASUREMENT_KEYS = Object.freeze([
  ...REQUIRED_MEASUREMENT_KEYS,
  ...OPTIONAL_MEASUREMENT_KEYS,
] as const);

const STATIC_DIMENSION_KEYS = Object.freeze([
  'height',
  'shoulderWidth',
  'hipHalfWidth',
  'torsoRadius',
  'pelvisRadius',
  'headRadius',
  'neckRadius',
  'upperArmRadius',
  'forearmRadius',
  'thighRadius',
  'calfRadius',
  'inseamLength',
  'upperArmLength',
  'forearmLength',
] as const satisfies readonly (keyof StaticBodyDimensionsM)[]);

const ALLOWED_MEASUREMENT_KEYS = new Set<string>(['schemaVersion', ...CANONICAL_MEASUREMENT_KEYS]);

function canonicalMeasurementSnapshot(
  input: CanonicalBodyMeasurementsMm,
): CanonicalBodyMeasurementsMm {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    throw new TypeError('Canonical measurements must be a plain record.');
  }
  const prototype = Object.getPrototypeOf(input);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new TypeError('Canonical measurements must have a plain object prototype.');
  }
  for (const key of Reflect.ownKeys(input)) {
    if (typeof key !== 'string' || !ALLOWED_MEASUREMENT_KEYS.has(key)) {
      throw new RangeError(`Unknown canonical measurement key ${String(key)}.`);
    }
    const descriptor = Object.getOwnPropertyDescriptor(input, key);
    if (!descriptor || !descriptor.enumerable || !('value' in descriptor)) {
      throw new TypeError(`Canonical measurement ${key} must be an enumerable data property.`);
    }
  }

  const schemaDescriptor = Object.getOwnPropertyDescriptor(input, 'schemaVersion');
  if (!schemaDescriptor || !('value' in schemaDescriptor)) {
    throw new RangeError('Canonical measurement schemaVersion is required.');
  }
  const values: Partial<Record<CanonicalMeasurementKey, number>> = {};
  for (const key of REQUIRED_MEASUREMENT_KEYS) {
    const descriptor = Object.getOwnPropertyDescriptor(input, key);
    if (!descriptor || !('value' in descriptor) || typeof descriptor.value !== 'number') {
      throw new RangeError(`Canonical measurement ${key} is required and must be a number.`);
    }
    values[key] = descriptor.value;
  }
  for (const key of OPTIONAL_MEASUREMENT_KEYS) {
    const descriptor = Object.getOwnPropertyDescriptor(input, key);
    if (!descriptor) continue;
    if (!('value' in descriptor) || typeof descriptor.value !== 'number') {
      throw new RangeError(`Canonical measurement ${key} must be a number when present.`);
    }
    values[key] = descriptor.value;
  }

  const snapshot: CanonicalBodyMeasurementsMm = {
    schemaVersion: schemaDescriptor.value as CanonicalBodyMeasurementsMm['schemaVersion'],
    heightMm: values.heightMm!,
    shoulderBreadthMm: values.shoulderBreadthMm!,
    chestCircumferenceMm: values.chestCircumferenceMm!,
    waistCircumferenceMm: values.waistCircumferenceMm!,
    hipCircumferenceMm: values.hipCircumferenceMm!,
    armLengthMm: values.armLengthMm!,
    inseamMm: values.inseamMm!,
    ...Object.fromEntries(
      OPTIONAL_MEASUREMENT_KEYS.filter((key) => values[key] !== undefined).map((key) => [
        key,
        values[key],
      ]),
    ),
  };
  validateCanonicalMeasurements(snapshot);
  return Object.freeze(snapshot);
}

function validateCanonicalMeasurements(measurements: CanonicalBodyMeasurementsMm): void {
  if (measurements.schemaVersion !== CANONICAL_BODY_MEASUREMENTS_VERSION) {
    throw new RangeError(`Unsupported canonical measurement schema ${measurements.schemaVersion}.`);
  }
  for (const [key, range] of Object.entries(CANONICAL_MEASUREMENT_PLAUSIBILITY_MM) as [
    CanonicalMeasurementKey,
    readonly [number, number],
  ][]) {
    const value = measurements[key];
    if (value == null) continue;
    if (!Number.isFinite(value) || value < range[0] || value > range[1]) {
      throw new RangeError(`${key} must be within ${range[0]}..${range[1]} mm.`);
    }
  }
  if (measurements.inseamMm >= measurements.heightMm * 0.62) {
    throw new RangeError('inseamMm must be below 62% of heightMm for analytical-body-v0.');
  }
  const correlationIssues = validateCanonicalMeasurementCorrelations(measurements);
  if (correlationIssues.length > 0) throw new RangeError(correlationIssues[0].message);
}

function circumferenceRadiusM(circumferenceMm: number): number {
  return circumferenceMm / 1000 / TWO_PI;
}

/**
 * Analytical v0 approximations only. Circumferences become equivalent circular radii; this is not
 * statistical reconstruction and does not recover front/back depth or posture.
 */
export function deriveStaticBodyDimensionsM(
  measurements: CanonicalBodyMeasurementsMm,
): StaticBodyDimensionsM {
  const canonical = canonicalMeasurementSnapshot(measurements);
  const chestWaistBlendMm =
    canonical.chestCircumferenceMm * 0.72 + canonical.waistCircumferenceMm * 0.28;
  const hipWaistBlendMm =
    canonical.hipCircumferenceMm * 0.85 + canonical.waistCircumferenceMm * 0.15;
  const upperArmRadius = circumferenceRadiusM(
    canonical.bicepCircumferenceMm ?? canonical.chestCircumferenceMm * 0.32,
  );
  return Object.freeze({
    height: canonical.heightMm / 1000,
    shoulderWidth: canonical.shoulderBreadthMm / 1000,
    hipHalfWidth: circumferenceRadiusM(hipWaistBlendMm) * 0.62,
    torsoRadius: circumferenceRadiusM(chestWaistBlendMm),
    pelvisRadius: circumferenceRadiusM(hipWaistBlendMm),
    headRadius: (canonical.heightMm / 1000) * 0.061,
    neckRadius:
      canonical.neckBaseCircumferenceMm == null
        ? (canonical.shoulderBreadthMm / 1000) * 0.14
        : circumferenceRadiusM(canonical.neckBaseCircumferenceMm),
    upperArmRadius,
    forearmRadius:
      canonical.wristCircumferenceMm == null
        ? upperArmRadius * 0.72
        : circumferenceRadiusM(canonical.wristCircumferenceMm),
    thighRadius: circumferenceRadiusM(
      canonical.thighCircumferenceMm ?? canonical.hipCircumferenceMm * 0.57,
    ),
    calfRadius: circumferenceRadiusM(
      canonical.calfCircumferenceMm ?? canonical.hipCircumferenceMm * 0.38,
    ),
    inseamLength: canonical.inseamMm / 1000,
    upperArmLength: (canonical.armLengthMm / 1000) * 0.54,
    forearmLength: (canonical.armLengthMm / 1000) * 0.46,
  });
}

function measurementFingerprint(
  measurements: CanonicalBodyMeasurementsMm,
  dimensions: StaticBodyDimensionsM,
): string {
  const serialized = JSON.stringify({
    schemaVersion: measurements.schemaVersion,
    measurements: CANONICAL_MEASUREMENT_KEYS.filter((key) => measurements[key] !== undefined).map(
      (key) => [key, measurements[key]],
    ),
    dimensions: STATIC_DIMENSION_KEYS.map((key) => [key, dimensions[key]]),
  });
  let hash = 0x811c9dc5;
  for (let index = 0; index < serialized.length; index += 1) {
    hash ^= serialized.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

export class MeasurementBodyProvider implements BodyProvider {
  readonly id = 'measurement-analytical-body';
  readonly revision = PROVIDER_REVISION;
  readonly measurements: CanonicalBodyMeasurementsMm;
  readonly dimensions: StaticBodyDimensionsM;
  readonly pose: BodyPoseKind;
  readonly sourceRevision: string;
  private readonly artifactRevision: string;

  constructor(options: {
    measurements: CanonicalBodyMeasurementsMm;
    sourceRevision: string;
    pose?: BodyPoseKind;
  }) {
    if (!options.sourceRevision.trim()) throw new RangeError('sourceRevision is required.');
    this.measurements = canonicalMeasurementSnapshot(options.measurements);
    this.dimensions = deriveStaticBodyDimensionsM(this.measurements);
    this.pose = options.pose ?? 'A';
    this.sourceRevision = options.sourceRevision.trim();
    this.artifactRevision = `${PROVIDER_REVISION}-${measurementFingerprint(
      this.measurements,
      this.dimensions,
    )}`;
    Object.freeze(this);
  }

  async reconstruct(input: BodyInput = {}): Promise<BodyArtifact> {
    if (input.measurementsMm && Object.keys(input.measurementsMm).length > 0) {
      throw new Error('MeasurementBodyProvider requires versioned canonical measurements.');
    }
    if (input.sourceRevision && input.sourceRevision !== this.sourceRevision) {
      throw new Error('BodyInput sourceRevision does not match the configured measurement record.');
    }
    const staticArtifact = await new StaticBodyProvider({
      dimensions: this.dimensions,
      pose: this.pose,
    }).reconstruct({ requestedPose: input.requestedPose });
    const artifact: BodyArtifact = {
      ...staticArtifact,
      id: this.id,
      revision: this.artifactRevision,
      provenance: {
        status: 'estimated',
        sources: [
          {
            id: 'measurement-body-formula',
            kind: 'generated',
            source: 'src/lib/cloth/body/measurement-body-provider.ts analytical-body-v0',
            licenseId: 'LicenseRef-GRBPWR-Project-Owned',
            commercialUse: 'cleared',
            redistribution: 'cleared',
          },
          {
            id: 'canonical-measurement-record',
            kind: 'measurement-record',
            source: this.sourceRevision,
            licenseId: 'LicenseRef-GRBPWR-Project-Measurement-Record',
            commercialUse: 'cleared',
            redistribution: 'cleared',
          },
        ],
      },
    };
    assertValidBodyArtifact(artifact);
    return artifact;
  }
}
