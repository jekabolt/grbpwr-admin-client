import {
  CAPSULE_GPU_LAYOUT,
  packBodyArtifactCapsules,
  validatePackedBodyCapsules,
  type PackedBodyCapsules,
} from './capsule-gpu-layout';
import type {
  BodyArtifact,
  CollisionLod,
  PoseDescriptor,
  ProvenanceManifest,
  ProvenanceSource,
} from './contracts';
import { assertValidBodyArtifact } from './validation';

export const BOUND_PACKED_BODY_CAPSULES_V1 = 'bound-packed-body-capsules/v1' as const;

export interface CanonicalBodyProvenanceSourceV1 {
  readonly id: string;
  readonly kind: ProvenanceSource['kind'];
  readonly source: string;
  readonly licenseId: string;
  readonly commercialUse: ProvenanceSource['commercialUse'];
  readonly redistribution: ProvenanceSource['redistribution'];
  readonly sha256: string | null;
  readonly attribution: string | null;
}

export interface BoundPackedBodyBindingV1 {
  readonly bodyId: string;
  readonly bodyRevision: string;
  readonly poseKind: BodyArtifact['pose']['kind'];
  readonly poseRevision: string;
  readonly coordinateSystem: PoseDescriptor['coordinateSystem'];
  readonly collisionLodId: string;
  readonly collisionLodLevel: number;
  readonly provenanceStatus: ProvenanceManifest['status'];
  readonly provenanceSources: readonly CanonicalBodyProvenanceSourceV1[];
  readonly colliderCount: number;
  readonly layoutVersion: typeof CAPSULE_GPU_LAYOUT.version;
}

export interface BoundPackedBodyDigestsV1 {
  readonly bodyIdentitySha256: string;
  readonly colliderContentSha256: string;
  readonly packedBytesSha256: string;
  readonly aggregateSha256: string;
}

export interface BoundPackedBodyCapsulesV1 {
  readonly version: typeof BOUND_PACKED_BODY_CAPSULES_V1;
  readonly binding: BoundPackedBodyBindingV1;
  readonly packed: PackedBodyCapsules;
  readonly digests: BoundPackedBodyDigestsV1;
}

export class BodySealUnsupportedError extends Error {
  readonly code = 'BODY_SEAL_WEB_CRYPTO_UNSUPPORTED' as const;

  constructor() {
    super('Body capsule sealing requires browser Web Crypto SHA-256 support.');
    this.name = 'BodySealUnsupportedError';
  }
}

export class BodySealValidationError extends Error {
  readonly code = 'BODY_SEAL_VALIDATION_FAILED' as const;
  readonly errors: readonly string[];

  constructor(errors: readonly string[]) {
    super(`Bound packed body capsule validation failed: ${errors.join(' ')}`);
    this.name = 'BodySealValidationError';
    this.errors = [...errors];
  }
}

export type BoundPackedBodyCryptoOptions = {
  readonly crypto?: Pick<Crypto, 'subtle'> | null;
};

type CanonicalValue =
  | null
  | boolean
  | number
  | string
  | readonly CanonicalValue[]
  | { readonly [key: string]: CanonicalValue };

function canonicalJson(value: CanonicalValue): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const record = value as { readonly [key: string]: CanonicalValue };
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
    .join(',')}}`;
}

function canonicalSources(
  sources: ProvenanceManifest['sources'],
): readonly CanonicalBodyProvenanceSourceV1[] {
  return sources
    .map((source) => ({
      id: source.id,
      kind: source.kind,
      source: source.source,
      licenseId: source.licenseId,
      commercialUse: source.commercialUse,
      redistribution: source.redistribution,
      sha256: source.sha256 ?? null,
      attribution: source.attribution ?? null,
    }))
    .sort((left, right) => {
      const idOrder = left.id.localeCompare(right.id);
      return idOrder === 0
        ? canonicalJson(left as unknown as CanonicalValue).localeCompare(
            canonicalJson(right as unknown as CanonicalValue),
          )
        : idOrder;
    });
}

function selectedLod(body: BodyArtifact, lodId: string): CollisionLod {
  const lod = body.collisionLods.find(({ id }) => id === lodId);
  if (!lod) throw new RangeError(`Body artifact has no collision LOD ${lodId}.`);
  return lod;
}

function bindingFor(
  body: BodyArtifact,
  lod: CollisionLod,
  packed: PackedBodyCapsules,
): BoundPackedBodyBindingV1 {
  return {
    bodyId: body.id,
    bodyRevision: body.revision,
    poseKind: body.pose.kind,
    poseRevision: body.pose.revision,
    coordinateSystem: { ...body.pose.coordinateSystem },
    collisionLodId: lod.id,
    collisionLodLevel: lod.level,
    provenanceStatus: body.provenance.status,
    provenanceSources: canonicalSources(body.provenance.sources),
    colliderCount: packed.colliderCount,
    layoutVersion: CAPSULE_GPU_LAYOUT.version,
  };
}

function colliderIdentity(lod: CollisionLod): CanonicalValue {
  return {
    id: lod.id,
    level: lod.level,
    maxSurfaceDeviationM: lod.maxSurfaceDeviationM,
    colliders: [
      ...lod.capsules.map((capsule) => ({
        id: capsule.id,
        kind: capsule.kind,
        aM: [...capsule.aM],
        bM: [...capsule.bM],
        radiusM: capsule.radiusM,
      })),
      ...lod.spheres.map((sphere) => ({
        id: sphere.id,
        kind: sphere.kind,
        centerM: [...sphere.centerM],
        radiusM: sphere.radiusM,
      })),
    ],
  };
}

function subtleCrypto(options: BoundPackedBodyCryptoOptions = {}): SubtleCrypto {
  const provider = Object.prototype.hasOwnProperty.call(options, 'crypto')
    ? options.crypto
    : globalThis.crypto;
  if (!provider?.subtle) {
    throw new BodySealUnsupportedError();
  }
  return provider.subtle;
}

function hex(bytes: ArrayBuffer): string {
  return [...new Uint8Array(bytes)].map((value) => value.toString(16).padStart(2, '0')).join('');
}

async function sha256(
  data: ArrayBuffer | Uint8Array<ArrayBuffer>,
  crypto: SubtleCrypto,
): Promise<string> {
  return hex(await crypto.digest('SHA-256', data));
}

async function sha256Json(value: CanonicalValue, crypto: SubtleCrypto): Promise<string> {
  return sha256(new TextEncoder().encode(canonicalJson(value)), crypto);
}

function clonePacked(packed: PackedBodyCapsules): PackedBodyCapsules {
  return {
    version: packed.version,
    collisionLodId: packed.collisionLodId,
    collisionLodLevel: packed.collisionLodLevel,
    colliderCount: packed.colliderCount,
    stableIds: [...packed.stableIds],
    buffer: packed.buffer.slice(0),
  };
}

function exactBytesEqual(left: ArrayBuffer, right: ArrayBuffer): boolean {
  if (left.byteLength !== right.byteLength) return false;
  const a = new Uint8Array(left);
  const b = new Uint8Array(right);
  return a.every((value, index) => value === b[index]);
}

function digestPayload(
  binding: BoundPackedBodyBindingV1,
  bodyIdentitySha256: string,
  colliderContentSha256: string,
  packedBytesSha256: string,
): CanonicalValue {
  return {
    version: BOUND_PACKED_BODY_CAPSULES_V1,
    binding: binding as unknown as CanonicalValue,
    bodyIdentitySha256,
    colliderContentSha256,
    packedBytesSha256,
  };
}

/** Builds an integrity-bound copy without allocating GPU resources or mutating the body. */
export async function buildBoundPackedBodyCapsulesV1(
  body: BodyArtifact,
  collisionLodId = body.defaultCollisionLodId,
  options: BoundPackedBodyCryptoOptions = {},
): Promise<BoundPackedBodyCapsulesV1> {
  assertValidBodyArtifact(body);
  const crypto = subtleCrypto(options);
  const lod = selectedLod(body, collisionLodId);
  const packed = clonePacked(packBodyArtifactCapsules(body, collisionLodId));
  const binding = bindingFor(body, lod, packed);
  const [bodyIdentitySha256, colliderContentSha256, packedBytesSha256] = await Promise.all([
    sha256Json(binding as unknown as CanonicalValue, crypto),
    sha256Json(colliderIdentity(lod), crypto),
    sha256(packed.buffer, crypto),
  ]);
  const aggregateSha256 = await sha256Json(
    digestPayload(binding, bodyIdentitySha256, colliderContentSha256, packedBytesSha256),
    crypto,
  );
  return {
    version: BOUND_PACKED_BODY_CAPSULES_V1,
    binding,
    packed,
    digests: {
      bodyIdentitySha256,
      colliderContentSha256,
      packedBytesSha256,
      aggregateSha256,
    },
  };
}

/** Rebuilds from the current body and fails closed on any metadata, byte, or digest mismatch. */
export async function validateBoundPackedBodyCapsulesV1(
  sealed: BoundPackedBodyCapsulesV1,
  currentBody: BodyArtifact,
  options: BoundPackedBodyCryptoOptions = {},
): Promise<readonly string[]> {
  subtleCrypto(options);
  const errors: string[] = [];
  try {
    assertValidBodyArtifact(currentBody);
  } catch (error) {
    return [error instanceof Error ? error.message : 'Current body validation failed.'];
  }

  if (sealed.version !== BOUND_PACKED_BODY_CAPSULES_V1) errors.push('seal version mismatch.');
  if (!(sealed.packed.buffer instanceof ArrayBuffer)) {
    return [...errors, 'sealed packed buffer must be an ArrayBuffer.'];
  }
  errors.push(...validatePackedBodyCapsules(sealed.packed));

  let expected: BoundPackedBodyCapsulesV1;
  try {
    expected = await buildBoundPackedBodyCapsulesV1(
      currentBody,
      sealed.binding.collisionLodId,
      options,
    );
  } catch (error) {
    return [
      ...errors,
      error instanceof Error ? error.message : 'Expected body seal rebuild failed.',
    ];
  }

  if (
    canonicalJson(sealed.binding as unknown as CanonicalValue) !==
    canonicalJson(expected.binding as unknown as CanonicalValue)
  ) {
    errors.push('body binding mismatch.');
  }
  if (sealed.packed.version !== expected.packed.version)
    errors.push('packed layout version mismatch.');
  if (sealed.packed.collisionLodId !== expected.packed.collisionLodId)
    errors.push('packed collision LOD id mismatch.');
  if (sealed.packed.collisionLodLevel !== expected.packed.collisionLodLevel)
    errors.push('packed collision LOD level mismatch.');
  if (sealed.packed.colliderCount !== expected.packed.colliderCount)
    errors.push('packed collider count mismatch.');
  if (canonicalJson(sealed.packed.stableIds) !== canonicalJson(expected.packed.stableIds))
    errors.push('packed stable IDs mismatch.');
  if (!exactBytesEqual(sealed.packed.buffer, expected.packed.buffer))
    errors.push('packed collider bytes mismatch.');

  for (const name of [
    'bodyIdentitySha256',
    'colliderContentSha256',
    'packedBytesSha256',
    'aggregateSha256',
  ] as const) {
    if (sealed.digests[name] !== expected.digests[name]) errors.push(`${name} mismatch.`);
  }
  return errors;
}

export async function assertValidBoundPackedBodyCapsulesV1(
  sealed: BoundPackedBodyCapsulesV1,
  currentBody: BodyArtifact,
  options: BoundPackedBodyCryptoOptions = {},
): Promise<void> {
  const errors = await validateBoundPackedBodyCapsulesV1(sealed, currentBody, options);
  if (errors.length > 0) throw new BodySealValidationError(errors);
}
