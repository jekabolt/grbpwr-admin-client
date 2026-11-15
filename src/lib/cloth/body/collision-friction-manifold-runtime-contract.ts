import type { Vec3M } from './contracts';
import {
  MAX_MANIFOLD_CONTACTS,
  MAX_MANIFOLD_ITERATIONS,
  type ManifoldContact,
} from './collision-friction-manifold-oracle';

export const MANIFOLD_CONTACT_SLOT_BYTES = 32;
export const MANIFOLD_PARTICLE_HEADER_BYTES = 16;
export const MANIFOLD_CONTACT_SCRATCH_BYTES_PER_PARTICLE =
  MANIFOLD_PARTICLE_HEADER_BYTES + MAX_MANIFOLD_CONTACTS * MANIFOLD_CONTACT_SLOT_BYTES;
export const MANIFOLD_WARM_START_BYTES_PER_PARTICLE = MAX_MANIFOLD_CONTACTS * 16;
export const MANIFOLD_RUNTIME_BYTES_PER_PARTICLE =
  MANIFOLD_CONTACT_SCRATCH_BYTES_PER_PARTICLE + MANIFOLD_WARM_START_BYTES_PER_PARTICLE;
export const MANIFOLD_RUNTIME_PARAMS_BYTES = 32;
export const MANIFOLD_RUNTIME_COUNTER_BYTES = 32;

export const MANIFOLD_RUNTIME_ABI = {
  particleHeader: {
    sizeBytes: MANIFOLD_PARTICLE_HEADER_BYTES,
    offsets: {
      retainedContactCount: 0,
      observedContactCount: 4,
      overflowCount: 8,
      ownershipRevision: 12,
    },
  },
  contactSlot: {
    strideBytes: MANIFOLD_CONTACT_SLOT_BYTES,
    offsets: {
      normalPlaneM: 0,
      normalCorrectionMagnitudeM: 16,
      colliderIndex: 20,
      projectionPassIndex: 24,
      flags: 28,
    },
  },
  warmStartSlot: { strideBytes: 16, offsets: { multiplierM: 0, reserved: 12 } },
  params: {
    sizeBytes: MANIFOLD_RUNTIME_PARAMS_BYTES,
    offsets: {
      particleCount: 0,
      colliderCount: 4,
      maximumContactsPerParticle: 8,
      maximumIterations: 12,
      staticFriction: 16,
      dynamicFriction: 20,
      positionToleranceM: 24,
      correctionToleranceM: 28,
    },
  },
  counters: {
    sizeBytes: MANIFOLD_RUNTIME_COUNTER_BYTES,
    offsets: {
      solvedCount: 0,
      overflowParticleCount: 4,
      invalidCount: 8,
      blockedCount: 12,
      budgetExhaustedCount: 16,
      warmStartHitCount: 20,
      warmStartResetCount: 24,
      penetrationReintroducedCount: 28,
    },
  },
} as const;

const ACTIVE_FLAG = 1;
const INACTIVE_U32 = 0xffff_ffff;
const NORMAL_EPSILON = 1e-12;

export interface ManifoldContactCandidate {
  readonly particleIndex: number;
  readonly colliderIndex: number;
  readonly projectionPassIndex: number;
  readonly normal: Vec3M;
  readonly planeOffsetM: number;
  readonly normalCorrectionMagnitudeM: number;
}

export interface ManifoldWarmStartEntry {
  readonly particleIndex: number;
  readonly colliderIndex: number;
  readonly normal: Vec3M;
  readonly frictionMultiplierM: Vec3M;
}

export interface ManifoldWarmStartCache {
  readonly ownershipRevision: number;
  readonly entries: readonly ManifoldWarmStartEntry[];
}

export interface ManifoldRuntimeBridgeInput {
  readonly particleCount: number;
  readonly colliderCount: number;
  readonly maximumStorageBufferBindingSizeBytes: number;
  /** Changes whenever body/collider or material-pair ownership changes. */
  readonly ownershipRevision: number;
  readonly candidates: readonly ManifoldContactCandidate[];
  readonly previousWarmStart?: ManifoldWarmStartCache;
  readonly warmStartNormalCosineThreshold?: number;
  readonly staticFriction: number;
  readonly dynamicFriction: number;
  readonly maximumIterations: number;
  readonly positionToleranceM: number;
  readonly correctionToleranceM: number;
}

export interface ManifoldRuntimeBridgeDiagnostics {
  readonly observedContactCount: number;
  readonly retainedContactCount: number;
  readonly overflowContactCount: number;
  readonly overflowParticleCount: number;
  readonly warmStartHitCount: number;
  readonly warmStartResetCount: number;
}

export interface PackedManifoldRuntimeBridge {
  readonly contactScratch: ArrayBuffer;
  readonly warmStartMultipliers: ArrayBuffer;
  readonly params: ArrayBuffer;
  readonly solveEligible: Uint8Array;
  readonly diagnostics: ManifoldRuntimeBridgeDiagnostics;
}

export interface DecodedManifoldParticle {
  readonly retainedContactCount: number;
  readonly observedContactCount: number;
  readonly overflowCount: number;
  readonly ownershipRevision: number;
  readonly contacts: readonly ManifoldContact[];
  readonly colliderIndices: readonly number[];
  readonly projectionPassIndices: readonly number[];
  readonly warmStartMultipliers: readonly Vec3M[];
  readonly solveEligible: boolean;
}

function finiteVector(value: Vec3M): boolean {
  return value.length === 3 && value.every(Number.isFinite);
}

function f32(value: number, name: string): number {
  const quantized = Math.fround(value);
  if (!Number.isFinite(quantized))
    throw new RangeError(name + ' is not finite after f32 quantization.');
  return quantized;
}

function vectorLength(value: Vec3M): number {
  return Math.hypot(value[0], value[1], value[2]);
}

function dot(first: Vec3M, second: Vec3M): number {
  return first[0] * second[0] + first[1] * second[1] + first[2] * second[2];
}

function normalize(value: Vec3M, name: string): Vec3M {
  if (!finiteVector(value)) throw new RangeError(name + ' must be finite.');
  const magnitude = vectorLength(value);
  if (!Number.isFinite(magnitude) || magnitude <= NORMAL_EPSILON) {
    throw new RangeError(name + ' must be non-degenerate.');
  }
  return [value[0] / magnitude, value[1] / magnitude, value[2] / magnitude];
}

function u32(value: number, name: string): void {
  if (!Number.isSafeInteger(value) || value < 0 || value > INACTIVE_U32) {
    throw new RangeError(name + ' must be a non-negative u32.');
  }
}

function validateInput(input: ManifoldRuntimeBridgeInput): void {
  u32(input.particleCount, 'particleCount');
  u32(input.colliderCount, 'colliderCount');
  u32(input.ownershipRevision, 'ownershipRevision');
  if (input.particleCount === 0 || input.colliderCount === 0) {
    throw new RangeError('particleCount and colliderCount must be positive.');
  }
  if (
    !Number.isSafeInteger(input.maximumStorageBufferBindingSizeBytes) ||
    input.maximumStorageBufferBindingSizeBytes <= 0
  ) {
    throw new RangeError('maximumStorageBufferBindingSizeBytes must be a positive safe integer.');
  }
  const scratchBytes = input.particleCount * MANIFOLD_CONTACT_SCRATCH_BYTES_PER_PARTICLE;
  const warmStartBytes = input.particleCount * MANIFOLD_WARM_START_BYTES_PER_PARTICLE;
  if (
    !Number.isSafeInteger(scratchBytes) ||
    !Number.isSafeInteger(warmStartBytes) ||
    scratchBytes > input.maximumStorageBufferBindingSizeBytes ||
    warmStartBytes > input.maximumStorageBufferBindingSizeBytes
  ) {
    throw new RangeError('Manifold storage buffers exceed the declared adapter binding limit.');
  }
  if (
    !Number.isSafeInteger(input.maximumIterations) ||
    input.maximumIterations < 1 ||
    input.maximumIterations > MAX_MANIFOLD_ITERATIONS
  ) {
    throw new RangeError(`maximumIterations must be within [1, ${MAX_MANIFOLD_ITERATIONS}].`);
  }
  if (!Number.isFinite(input.staticFriction) || input.staticFriction < 0) {
    throw new RangeError('staticFriction must be finite and non-negative.');
  }
  if (
    !Number.isFinite(input.dynamicFriction) ||
    input.dynamicFriction < 0 ||
    input.dynamicFriction > input.staticFriction
  ) {
    throw new RangeError('dynamicFriction must be finite and within [0, staticFriction].');
  }
  if (!Number.isFinite(input.positionToleranceM) || input.positionToleranceM < 0) {
    throw new RangeError('positionToleranceM must be finite and non-negative.');
  }
  if (!Number.isFinite(input.correctionToleranceM) || input.correctionToleranceM <= 0) {
    throw new RangeError('correctionToleranceM must be finite and positive.');
  }
  const threshold = input.warmStartNormalCosineThreshold ?? 0.95;
  if (!Number.isFinite(threshold) || threshold < 0 || threshold > 1) {
    throw new RangeError('warmStartNormalCosineThreshold must be within [0, 1].');
  }
}

function candidateOrder(first: ManifoldContactCandidate, second: ManifoldContactCandidate): number {
  return (
    second.normalCorrectionMagnitudeM - first.normalCorrectionMagnitudeM ||
    first.colliderIndex - second.colliderIndex ||
    first.projectionPassIndex - second.projectionPassIndex
  );
}

function writeVec3(view: DataView, offset: number, value: Vec3M, fourth: number): void {
  view.setFloat32(offset, value[0], true);
  view.setFloat32(offset + 4, value[1], true);
  view.setFloat32(offset + 8, value[2], true);
  view.setFloat32(offset + 12, fourth, true);
}

function cacheKey(particleIndex: number, colliderIndex: number): string {
  return String(particleIndex) + ':' + String(colliderIndex);
}

export function packManifoldRuntimeBridge(
  input: ManifoldRuntimeBridgeInput,
): PackedManifoldRuntimeBridge {
  validateInput(input);
  const byParticle = Array.from(
    { length: input.particleCount },
    () => new Map<number, ManifoldContactCandidate>(),
  );
  const seenPasses = new Set<string>();
  for (const rawCandidate of input.candidates) {
    u32(rawCandidate.particleIndex, 'candidate particleIndex');
    u32(rawCandidate.colliderIndex, 'candidate colliderIndex');
    u32(rawCandidate.projectionPassIndex, 'candidate projectionPassIndex');
    if (rawCandidate.particleIndex >= input.particleCount) {
      throw new RangeError('Candidate particleIndex is out of range.');
    }
    if (rawCandidate.colliderIndex >= input.colliderCount) {
      throw new RangeError('Candidate colliderIndex is out of range.');
    }
    const quantizedInputNormal: Vec3M = [
      f32(rawCandidate.normal[0], 'Candidate normal x'),
      f32(rawCandidate.normal[1], 'Candidate normal y'),
      f32(rawCandidate.normal[2], 'Candidate normal z'),
    ];
    const normalLength = vectorLength(quantizedInputNormal);
    const normalized = normalize(quantizedInputNormal, 'Candidate normal');
    const normal: Vec3M = [
      f32(normalized[0], 'Candidate normalized normal x'),
      f32(normalized[1], 'Candidate normalized normal y'),
      f32(normalized[2], 'Candidate normalized normal z'),
    ];
    const planeOffsetM = f32(
      f32(rawCandidate.planeOffsetM, 'Candidate planeOffsetM') / normalLength,
      'Candidate normalized planeOffsetM',
    );
    const normalCorrectionMagnitudeM = f32(
      rawCandidate.normalCorrectionMagnitudeM,
      'Candidate normalCorrectionMagnitudeM',
    );
    if (normalCorrectionMagnitudeM <= 0) {
      throw new RangeError('Candidate normalCorrectionMagnitudeM must remain positive in f32.');
    }
    const candidate = {
      ...rawCandidate,
      normal,
      planeOffsetM,
      normalCorrectionMagnitudeM,
    };
    const passKey =
      cacheKey(candidate.particleIndex, candidate.colliderIndex) +
      ':' +
      candidate.projectionPassIndex;
    if (seenPasses.has(passKey)) {
      throw new RangeError(
        'A particle/collider may have only one observation per projection pass.',
      );
    }
    seenPasses.add(passKey);
    const particleCandidates = byParticle[candidate.particleIndex];
    const existing = particleCandidates.get(candidate.colliderIndex);
    if (
      !existing ||
      candidate.normalCorrectionMagnitudeM > existing.normalCorrectionMagnitudeM ||
      (candidate.normalCorrectionMagnitudeM === existing.normalCorrectionMagnitudeM &&
        candidate.projectionPassIndex < existing.projectionPassIndex)
    ) {
      particleCandidates.set(candidate.colliderIndex, candidate);
    }
  }

  const previousByKey = new Map<string, ManifoldWarmStartEntry>();
  if (input.previousWarmStart) {
    u32(input.previousWarmStart.ownershipRevision, 'previous warm-start ownershipRevision');
    for (const entry of input.previousWarmStart.entries) {
      u32(entry.particleIndex, 'warm-start particleIndex');
      u32(entry.colliderIndex, 'warm-start colliderIndex');
      if (
        entry.particleIndex >= input.particleCount ||
        entry.colliderIndex >= input.colliderCount
      ) {
        throw new RangeError('Warm-start ownership key is out of range.');
      }
      normalize(entry.normal, 'Warm-start normal');
      if (!finiteVector(entry.frictionMultiplierM)) {
        throw new RangeError('Warm-start multiplier must be finite.');
      }
      const key = cacheKey(entry.particleIndex, entry.colliderIndex);
      if (previousByKey.has(key)) throw new RangeError('Warm-start ownership keys must be unique.');
      previousByKey.set(key, entry);
    }
  }

  const contactScratch = new ArrayBuffer(
    input.particleCount * MANIFOLD_CONTACT_SCRATCH_BYTES_PER_PARTICLE,
  );
  const warmStartMultipliers = new ArrayBuffer(
    input.particleCount * MANIFOLD_WARM_START_BYTES_PER_PARTICLE,
  );
  const scratchView = new DataView(contactScratch);
  const warmView = new DataView(warmStartMultipliers);
  const solveEligible = new Uint8Array(input.particleCount);
  const threshold = input.warmStartNormalCosineThreshold ?? 0.95;
  let observedContactCount = 0;
  let retainedContactCount = 0;
  let overflowContactCount = 0;
  let overflowParticleCount = 0;
  let warmStartHitCount = 0;
  let warmStartResetCount = 0;

  byParticle.forEach((candidateMap, particleIndex) => {
    const ordered = [...candidateMap.values()].sort(candidateOrder);
    const retained = ordered.slice(0, MAX_MANIFOLD_CONTACTS);
    const overflow = ordered.length - retained.length;
    const particleBase = particleIndex * MANIFOLD_CONTACT_SCRATCH_BYTES_PER_PARTICLE;
    scratchView.setUint32(particleBase, retained.length, true);
    scratchView.setUint32(particleBase + 4, ordered.length, true);
    scratchView.setUint32(particleBase + 8, overflow, true);
    scratchView.setUint32(particleBase + 12, input.ownershipRevision, true);
    solveEligible[particleIndex] = overflow === 0 ? 1 : 0;
    observedContactCount += ordered.length;
    retainedContactCount += retained.length;
    overflowContactCount += overflow;
    if (overflow > 0) overflowParticleCount += 1;

    for (let slot = 0; slot < MAX_MANIFOLD_CONTACTS; slot += 1) {
      const slotBase =
        particleBase + MANIFOLD_PARTICLE_HEADER_BYTES + slot * MANIFOLD_CONTACT_SLOT_BYTES;
      const warmBase = particleIndex * MANIFOLD_WARM_START_BYTES_PER_PARTICLE + slot * 16;
      const candidate = retained[slot];
      if (!candidate) {
        scratchView.setUint32(slotBase + 20, INACTIVE_U32, true);
        scratchView.setUint32(slotBase + 24, INACTIVE_U32, true);
        continue;
      }
      writeVec3(scratchView, slotBase, candidate.normal, candidate.planeOffsetM);
      scratchView.setFloat32(slotBase + 16, candidate.normalCorrectionMagnitudeM, true);
      scratchView.setUint32(slotBase + 20, candidate.colliderIndex, true);
      scratchView.setUint32(slotBase + 24, candidate.projectionPassIndex, true);
      scratchView.setUint32(slotBase + 28, ACTIVE_FLAG, true);

      const previous = previousByKey.get(cacheKey(particleIndex, candidate.colliderIndex));
      if (!previous) continue;
      const previousNormal = normalize(previous.normal, 'Warm-start normal');
      const ownsCurrentContact =
        input.previousWarmStart?.ownershipRevision === input.ownershipRevision &&
        dot(previousNormal, candidate.normal) >= threshold &&
        overflow === 0;
      if (!ownsCurrentContact) {
        warmStartResetCount += 1;
        continue;
      }
      const normalComponent = dot(previous.frictionMultiplierM, candidate.normal);
      const tangentMultiplier: Vec3M = [
        previous.frictionMultiplierM[0] - candidate.normal[0] * normalComponent,
        previous.frictionMultiplierM[1] - candidate.normal[1] * normalComponent,
        previous.frictionMultiplierM[2] - candidate.normal[2] * normalComponent,
      ];
      writeVec3(warmView, warmBase, tangentMultiplier, 0);
      warmStartHitCount += 1;
    }
  });

  const params = new ArrayBuffer(MANIFOLD_RUNTIME_PARAMS_BYTES);
  const paramsView = new DataView(params);
  paramsView.setUint32(0, input.particleCount, true);
  paramsView.setUint32(4, input.colliderCount, true);
  paramsView.setUint32(8, MAX_MANIFOLD_CONTACTS, true);
  paramsView.setUint32(12, input.maximumIterations, true);
  paramsView.setFloat32(16, input.staticFriction, true);
  paramsView.setFloat32(20, input.dynamicFriction, true);
  paramsView.setFloat32(24, input.positionToleranceM, true);
  paramsView.setFloat32(28, input.correctionToleranceM, true);
  return {
    contactScratch,
    warmStartMultipliers,
    params,
    solveEligible,
    diagnostics: {
      observedContactCount,
      retainedContactCount,
      overflowContactCount,
      overflowParticleCount,
      warmStartHitCount,
      warmStartResetCount,
    },
  };
}

export function decodePackedManifoldParticle(
  packed: PackedManifoldRuntimeBridge,
  particleIndex: number,
): DecodedManifoldParticle {
  u32(particleIndex, 'particleIndex');
  const particleCount =
    packed.contactScratch.byteLength / MANIFOLD_CONTACT_SCRATCH_BYTES_PER_PARTICLE;
  if (!Number.isInteger(particleCount) || particleIndex >= particleCount) {
    throw new RangeError('particleIndex is outside the packed manifold.');
  }
  const scratch = new DataView(packed.contactScratch);
  const warm = new DataView(packed.warmStartMultipliers);
  const base = particleIndex * MANIFOLD_CONTACT_SCRATCH_BYTES_PER_PARTICLE;
  const retainedContactCount = scratch.getUint32(base, true);
  const contacts: ManifoldContact[] = [];
  const colliderIndices: number[] = [];
  const projectionPassIndices: number[] = [];
  const multipliers: Vec3M[] = [];
  for (let slot = 0; slot < retainedContactCount; slot += 1) {
    const slotBase = base + MANIFOLD_PARTICLE_HEADER_BYTES + slot * MANIFOLD_CONTACT_SLOT_BYTES;
    const warmBase = particleIndex * MANIFOLD_WARM_START_BYTES_PER_PARTICLE + slot * 16;
    const colliderIndex = scratch.getUint32(slotBase + 20, true);
    contacts.push({
      id: 'collider:' + String(colliderIndex),
      normal: [
        scratch.getFloat32(slotBase, true),
        scratch.getFloat32(slotBase + 4, true),
        scratch.getFloat32(slotBase + 8, true),
      ],
      planeOffsetM: scratch.getFloat32(slotBase + 12, true),
      normalCorrectionMagnitudeM: scratch.getFloat32(slotBase + 16, true),
    });
    colliderIndices.push(colliderIndex);
    projectionPassIndices.push(scratch.getUint32(slotBase + 24, true));
    multipliers.push([
      warm.getFloat32(warmBase, true),
      warm.getFloat32(warmBase + 4, true),
      warm.getFloat32(warmBase + 8, true),
    ]);
  }
  return {
    retainedContactCount,
    observedContactCount: scratch.getUint32(base + 4, true),
    overflowCount: scratch.getUint32(base + 8, true),
    ownershipRevision: scratch.getUint32(base + 12, true),
    contacts,
    colliderIndices,
    projectionPassIndices,
    warmStartMultipliers: multipliers,
    solveEligible: packed.solveEligible[particleIndex] === 1,
  };
}

export function validatePackedManifoldRuntimeBridge(
  packed: PackedManifoldRuntimeBridge,
  particleCount: number,
  colliderCount: number,
): readonly string[] {
  const errors: string[] = [];
  if (
    packed.contactScratch.byteLength !==
    particleCount * MANIFOLD_CONTACT_SCRATCH_BYTES_PER_PARTICLE
  ) {
    errors.push('contactScratch byte length disagrees with particleCount.');
  }
  if (
    packed.warmStartMultipliers.byteLength !==
    particleCount * MANIFOLD_WARM_START_BYTES_PER_PARTICLE
  ) {
    errors.push('warmStartMultipliers byte length disagrees with particleCount.');
  }
  if (packed.params.byteLength !== MANIFOLD_RUNTIME_PARAMS_BYTES) {
    errors.push('params must contain exactly 32 bytes.');
  }
  if (packed.solveEligible.length !== particleCount) {
    errors.push('solveEligible length disagrees with particleCount.');
  }
  if (errors.length > 0) return errors;
  const params = new DataView(packed.params);
  if (
    params.getUint32(0, true) !== particleCount ||
    params.getUint32(4, true) !== colliderCount ||
    params.getUint32(8, true) !== MAX_MANIFOLD_CONTACTS ||
    params.getUint32(12, true) < 1 ||
    params.getUint32(12, true) > MAX_MANIFOLD_ITERATIONS
  ) {
    errors.push('params counts or iteration budget are inconsistent.');
  }
  const staticFriction = params.getFloat32(16, true);
  const dynamicFriction = params.getFloat32(20, true);
  const positionToleranceM = params.getFloat32(24, true);
  const correctionToleranceM = params.getFloat32(28, true);
  if (
    !Number.isFinite(staticFriction) ||
    staticFriction < 0 ||
    !Number.isFinite(dynamicFriction) ||
    dynamicFriction < 0 ||
    dynamicFriction > staticFriction ||
    !Number.isFinite(positionToleranceM) ||
    positionToleranceM < 0 ||
    !Number.isFinite(correctionToleranceM) ||
    correctionToleranceM <= 0
  ) {
    errors.push('params friction coefficients or tolerances are invalid.');
  }
  const scratch = new DataView(packed.contactScratch);
  const warm = new DataView(packed.warmStartMultipliers);
  for (let particle = 0; particle < particleCount; particle += 1) {
    const decoded = decodePackedManifoldParticle(packed, particle);
    if (packed.solveEligible[particle] !== 0 && packed.solveEligible[particle] !== 1) {
      errors.push(`particle ${particle} solveEligible must be binary.`);
    }
    if (
      decoded.retainedContactCount > MAX_MANIFOLD_CONTACTS ||
      decoded.observedContactCount < decoded.retainedContactCount ||
      decoded.overflowCount !== decoded.observedContactCount - decoded.retainedContactCount
    ) {
      errors.push(`particle ${particle} header counts are inconsistent.`);
      continue;
    }
    if ((decoded.overflowCount === 0) !== decoded.solveEligible) {
      errors.push(`particle ${particle} overflow eligibility is inconsistent.`);
    }
    let previousCorrection = Number.POSITIVE_INFINITY;
    let previousCollider = -1;
    const particleBase = particle * MANIFOLD_CONTACT_SCRATCH_BYTES_PER_PARTICLE;
    for (let slot = 0; slot < MAX_MANIFOLD_CONTACTS; slot += 1) {
      const slotBase =
        particleBase + MANIFOLD_PARTICLE_HEADER_BYTES + slot * MANIFOLD_CONTACT_SLOT_BYTES;
      const flag = scratch.getUint32(slotBase + 28, true);
      const colliderIndex = scratch.getUint32(slotBase + 20, true);
      const projectionPassIndex = scratch.getUint32(slotBase + 24, true);
      if (slot < decoded.retainedContactCount) {
        if (flag !== ACTIVE_FLAG) errors.push(`particle ${particle} slot ${slot} is not active.`);
      } else if (
        flag !== 0 ||
        colliderIndex !== INACTIVE_U32 ||
        projectionPassIndex !== INACTIVE_U32
      ) {
        errors.push(`particle ${particle} slot ${slot} inactive sentinel is invalid.`);
      }
      const warmBase = particle * MANIFOLD_WARM_START_BYTES_PER_PARTICLE + slot * 16;
      if (warm.getFloat32(warmBase + 12, true) !== 0) {
        errors.push(`particle ${particle} slot ${slot} warm-start reserved lane is not zero.`);
      }
    }
    decoded.contacts.forEach((contact, slot) => {
      const normalLength = vectorLength(contact.normal);
      if (!Number.isFinite(normalLength) || Math.abs(normalLength - 1) > 1e-5) {
        errors.push(`particle ${particle} slot ${slot} normal is not normalized.`);
      }
      const colliderIndex = decoded.colliderIndices[slot];
      if (colliderIndex >= colliderCount) {
        errors.push(`particle ${particle} slot ${slot} colliderIndex is out of range.`);
      }
      if (
        contact.normalCorrectionMagnitudeM > previousCorrection ||
        (contact.normalCorrectionMagnitudeM === previousCorrection &&
          colliderIndex < previousCollider)
      ) {
        errors.push(`particle ${particle} contacts are not deterministically ordered.`);
      }
      previousCorrection = contact.normalCorrectionMagnitudeM;
      previousCollider = colliderIndex;
      const multiplier = decoded.warmStartMultipliers[slot];
      if (!finiteVector(multiplier) || Math.abs(dot(multiplier, contact.normal)) > 1e-5) {
        errors.push(`particle ${particle} slot ${slot} warm start is not finite and tangential.`);
      }
      if (decoded.overflowCount > 0 && vectorLength(multiplier) !== 0) {
        errors.push(`particle ${particle} overflow must clear warm starts.`);
      }
    });
  }
  return errors;
}
