import type {
  BodyArtifact,
  CapsuleCollider,
  CollisionLod,
  SphereCollider,
  Vec3M,
} from './contracts';
import { assertValidBodyArtifact } from './validation';

/**
 * Integration contract only. No GPU resources are allocated here.
 * Spheres are encoded later as capsules whose A and B endpoints are equal.
 */
export const CAPSULE_GPU_LAYOUT = {
  version: 'body-capsule-v1',
  strideBytes: 48,
  alignmentBytes: 16,
  fields: {
    aRadius: { offsetBytes: 0, format: 'vec4<f32>' },
    bFriction: { offsetBytes: 16, format: 'vec4<f32>' },
    metadata: { offsetBytes: 32, format: 'vec4<u32>' },
  },
  metadataWords: {
    stableIdIndex: 0,
    collisionLodLevel: 1,
    flags: 2,
    reserved: 3,
  },
} as const;

export const CAPSULE_GPU_FLAGS = {
  sphere: 1 << 0,
} as const;

const FLOAT_WORDS_PER_RECORD = 8;
const WORDS_PER_RECORD = CAPSULE_GPU_LAYOUT.strideBytes / Uint32Array.BYTES_PER_ELEMENT;
const RESERVED_FRICTION = 0;

export interface PackedBodyCapsules {
  readonly version: typeof CAPSULE_GPU_LAYOUT.version;
  readonly collisionLodId: string;
  readonly collisionLodLevel: number;
  readonly colliderCount: number;
  readonly stableIds: readonly string[];
  readonly buffer: ArrayBuffer;
}

type PackableCollider =
  | { readonly collider: CapsuleCollider; readonly sphere: false }
  | { readonly collider: SphereCollider; readonly sphere: true };

function selectLod(artifact: BodyArtifact, collisionLodId: string): CollisionLod {
  const lod = artifact.collisionLods.find((candidate) => candidate.id === collisionLodId);
  if (!lod) throw new RangeError(`Body artifact has no collision LOD ${collisionLodId}.`);
  return lod;
}

function endpoints(item: PackableCollider): readonly [Vec3M, Vec3M, number] {
  if (item.collider.kind === 'sphere') {
    return [item.collider.centerM, item.collider.centerM, item.collider.radiusM];
  }
  return [item.collider.aM, item.collider.bM, item.collider.radiusM];
}

/**
 * Packs one validated collision LOD without allocating any WebGPU object. Collider order is the
 * contract order: capsules first, then spheres, preserving each source array's order.
 */
export function packBodyArtifactCapsules(
  artifact: BodyArtifact,
  collisionLodId = artifact.defaultCollisionLodId,
): PackedBodyCapsules {
  assertValidBodyArtifact(artifact);
  const lod = selectLod(artifact, collisionLodId);
  const colliders: PackableCollider[] = [
    ...lod.capsules.map((collider) => ({ collider, sphere: false as const })),
    ...lod.spheres.map((collider) => ({ collider, sphere: true as const })),
  ];
  const buffer = new ArrayBuffer(colliders.length * CAPSULE_GPU_LAYOUT.strideBytes);
  const floats = new Float32Array(buffer);
  const words = new Uint32Array(buffer);
  const stableIds = colliders.map((item) => item.collider.id);

  colliders.forEach((item, index) => {
    const word = index * WORDS_PER_RECORD;
    const [a, b, radius] = endpoints(item);
    floats.set([a[0], a[1], a[2], radius], word);
    floats.set([b[0], b[1], b[2], RESERVED_FRICTION], word + 4);
    words[word + 8] = index;
    words[word + 9] = lod.level;
    words[word + 10] = item.sphere ? CAPSULE_GPU_FLAGS.sphere : 0;
    words[word + 11] = 0;
  });

  const packed: PackedBodyCapsules = {
    version: CAPSULE_GPU_LAYOUT.version,
    collisionLodId: lod.id,
    collisionLodLevel: lod.level,
    colliderCount: colliders.length,
    stableIds,
    buffer,
  };
  assertValidPackedBodyCapsules(packed);
  return packed;
}

/** Runtime-facing structural validation. It intentionally knows nothing about GPUDevice. */
export function validatePackedBodyCapsules(packed: PackedBodyCapsules): string[] {
  const errors: string[] = [];
  if (CAPSULE_GPU_LAYOUT.strideBytes % CAPSULE_GPU_LAYOUT.alignmentBytes !== 0) {
    errors.push('capsule stride must satisfy the declared alignment.');
  }
  if (packed.version !== CAPSULE_GPU_LAYOUT.version)
    errors.push('capsule layout version mismatch.');
  if (!Number.isInteger(packed.colliderCount) || packed.colliderCount < 0) {
    errors.push('colliderCount must be a non-negative integer.');
  }
  if (!Number.isInteger(packed.collisionLodLevel) || packed.collisionLodLevel < 0) {
    errors.push('collisionLodLevel must be a non-negative integer.');
  }
  if (packed.buffer.byteLength !== packed.colliderCount * CAPSULE_GPU_LAYOUT.strideBytes) {
    errors.push('capsule buffer byte length does not match colliderCount and stride.');
  }
  if (packed.buffer.byteLength % CAPSULE_GPU_LAYOUT.alignmentBytes !== 0) {
    errors.push('capsule buffer byte length is not aligned.');
  }
  if (packed.stableIds.length !== packed.colliderCount) {
    errors.push('stableIds length must equal colliderCount.');
  }
  if (packed.buffer.byteLength % Uint32Array.BYTES_PER_ELEMENT !== 0) return errors;

  const floats = new Float32Array(packed.buffer);
  const words = new Uint32Array(packed.buffer);
  const seenIds = new Set<string>();
  for (let index = 0; index < packed.colliderCount; index += 1) {
    const word = index * WORDS_PER_RECORD;
    const id = packed.stableIds[index];
    if (!id || seenIds.has(id))
      errors.push(`packed stable id at index ${index} is missing or duplicated.`);
    seenIds.add(id);
    for (let component = 0; component < FLOAT_WORDS_PER_RECORD; component += 1) {
      if (!Number.isFinite(floats[word + component])) {
        errors.push(`packed collider ${index} contains a non-finite float.`);
        break;
      }
    }
    if (!(floats[word + 3] > 0)) errors.push(`packed collider ${index} radius must be positive.`);
    if (floats[word + 7] !== RESERVED_FRICTION) {
      errors.push(`packed collider ${index} reserved friction must be zero.`);
    }
    if (words[word + 8] !== index || words[word + 8] >= packed.stableIds.length) {
      errors.push(`packed collider ${index} stable-id index is invalid.`);
    }
    if (words[word + 9] !== packed.collisionLodLevel) {
      errors.push(`packed collider ${index} LOD level is inconsistent.`);
    }
    if ((words[word + 10] & ~CAPSULE_GPU_FLAGS.sphere) !== 0) {
      errors.push(`packed collider ${index} has unknown flags.`);
    }
    if (words[word + 11] !== 0) errors.push(`packed collider ${index} reserved word must be zero.`);
    if ((words[word + 10] & CAPSULE_GPU_FLAGS.sphere) !== 0) {
      if (
        floats[word] !== floats[word + 4] ||
        floats[word + 1] !== floats[word + 5] ||
        floats[word + 2] !== floats[word + 6]
      ) {
        errors.push(`packed sphere ${index} must have equal endpoints.`);
      }
    }
  }
  return errors;
}

export function assertValidPackedBodyCapsules(packed: PackedBodyCapsules): void {
  const errors = validatePackedBodyCapsules(packed);
  if (errors.length > 0)
    throw new Error(`Packed body capsules validation failed: ${errors.join(' ')}`);
}
