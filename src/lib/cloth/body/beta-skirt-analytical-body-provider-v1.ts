import type { BodyArtifact, BodyInput, BodyProvider } from './contracts';
import {
  BETA_SKIRT_ANALYTICAL_BODY_ID_V1,
  BETA_SKIRT_ANALYTICAL_BODY_REVISION_V1,
  BETA_SKIRT_COLLISION_LOD_ID_V1,
  createBetaSkirtAnalyticalBodyV1,
} from './beta-skirt-analytical-body-v1';

export const BETA_SKIRT_ANALYTICAL_BODY_PROVIDER_ID_V1 =
  'beta-skirt-analytical-body-provider-v1' as const;
export const BETA_SKIRT_ANALYTICAL_BODY_PROVIDER_REVISION_V1 =
  'beta-skirt-analytical-body-provider-revision-v1' as const;
export const BETA_SKIRT_ANALYTICAL_BODY_PROVIDER_SOURCE_REVISION_V1 =
  BETA_SKIRT_ANALYTICAL_BODY_REVISION_V1;

const ALLOWED_INPUT_KEYS = Object.freeze([
  'measurementsMm',
  'requestedPose',
  'sourceRevision',
] as const satisfies readonly (keyof BodyInput)[]);

type CompatibleInput = Readonly<{
  requestedPose?: 'A';
  sourceRevision?: typeof BETA_SKIRT_ANALYTICAL_BODY_PROVIDER_SOURCE_REVISION_V1;
}>;

function snapshotCompatibleInput(input: BodyInput | undefined): CompatibleInput {
  if (input === undefined) return Object.freeze({});
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new TypeError('Beta-skirt analytical body input must be a plain record.');
  }

  let prototype: object | null;
  let descriptors: PropertyDescriptorMap;
  try {
    prototype = Object.getPrototypeOf(input);
    descriptors = Object.getOwnPropertyDescriptors(input);
  } catch {
    throw new TypeError('Beta-skirt analytical body input could not be inspected safely.');
  }
  if (prototype !== Object.prototype && prototype !== null) {
    throw new TypeError('Beta-skirt analytical body input must use a plain object prototype.');
  }

  const keys = Reflect.ownKeys(descriptors);
  if (
    keys.some(
      (key) => typeof key !== 'string' || !ALLOWED_INPUT_KEYS.includes(key as keyof BodyInput),
    )
  ) {
    throw new TypeError('Beta-skirt analytical body input contains an unsupported field.');
  }
  for (const key of keys) {
    const descriptor = descriptors[key];
    if (
      !descriptor ||
      !descriptor.enumerable ||
      !Object.prototype.hasOwnProperty.call(descriptor, 'value') ||
      descriptor.get !== undefined ||
      descriptor.set !== undefined
    ) {
      throw new TypeError(`Beta-skirt analytical body input ${String(key)} must be plain data.`);
    }
  }

  if (Object.prototype.hasOwnProperty.call(descriptors, 'measurementsMm')) {
    throw new Error('Beta-skirt analytical body provider does not accept measurements.');
  }
  const requestedPose = descriptors.requestedPose?.value;
  if (requestedPose !== undefined && requestedPose !== 'A') {
    throw new Error('Beta-skirt analytical body provider is fixed in A pose.');
  }
  const sourceRevision = descriptors.sourceRevision?.value;
  if (
    sourceRevision !== undefined &&
    sourceRevision !== BETA_SKIRT_ANALYTICAL_BODY_PROVIDER_SOURCE_REVISION_V1
  ) {
    throw new Error('Beta-skirt analytical body source revision does not match.');
  }

  return Object.freeze({
    ...(requestedPose === undefined ? {} : { requestedPose: 'A' as const }),
    ...(sourceRevision === undefined
      ? {}
      : { sourceRevision: BETA_SKIRT_ANALYTICAL_BODY_PROVIDER_SOURCE_REVISION_V1 }),
  });
}

function assertProviderArtifact(artifact: BodyArtifact): void {
  if (
    artifact.id !== BETA_SKIRT_ANALYTICAL_BODY_ID_V1 ||
    artifact.revision !== BETA_SKIRT_ANALYTICAL_BODY_REVISION_V1 ||
    artifact.pose.kind !== 'A' ||
    artifact.defaultCollisionLodId !== BETA_SKIRT_COLLISION_LOD_ID_V1 ||
    artifact.collisionLods.length !== 1 ||
    artifact.collisionLods[0]?.id !== BETA_SKIRT_COLLISION_LOD_ID_V1 ||
    artifact.provenance.status !== 'cleared'
  ) {
    throw new Error('Beta-skirt analytical body fixture identity changed unexpectedly.');
  }
}

const providers = new WeakSet<object>();

/**
 * Narrow provider adapter for the project-owned beta-skirt analytical body. It only reconstructs
 * the existing cleared fixture; it does not add placement, fit, preview, or runtime authority.
 */
export class BetaSkirtAnalyticalBodyProviderV1 implements BodyProvider {
  readonly id = BETA_SKIRT_ANALYTICAL_BODY_PROVIDER_ID_V1;
  readonly revision = BETA_SKIRT_ANALYTICAL_BODY_PROVIDER_REVISION_V1;

  constructor() {
    providers.add(this);
    Object.freeze(this);
  }

  async reconstruct(input?: BodyInput): Promise<BodyArtifact> {
    snapshotCompatibleInput(input);
    const artifact = createBetaSkirtAnalyticalBodyV1();
    assertProviderArtifact(artifact);
    return artifact;
  }
}

const ORIGINAL_RECONSTRUCT_V1 = BetaSkirtAnalyticalBodyProviderV1.prototype.reconstruct;
Object.freeze(BetaSkirtAnalyticalBodyProviderV1.prototype);

export function isBetaSkirtAnalyticalBodyProviderV1(
  provider: unknown,
): provider is BetaSkirtAnalyticalBodyProviderV1 {
  return (
    !!provider &&
    typeof provider === 'object' &&
    providers.has(provider) &&
    Object.getPrototypeOf(provider) === BetaSkirtAnalyticalBodyProviderV1.prototype &&
    !Object.prototype.hasOwnProperty.call(provider, 'reconstruct') &&
    (provider as BetaSkirtAnalyticalBodyProviderV1).reconstruct === ORIGINAL_RECONSTRUCT_V1
  );
}
