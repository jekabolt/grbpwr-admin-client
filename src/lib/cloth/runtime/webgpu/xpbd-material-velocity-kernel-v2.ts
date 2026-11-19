/* global GPUShaderModuleDescriptor */

import {
  CLOTH_MATERIAL_GPU_V1,
  TRIANGLE_INDICES_GPU_V1,
  decodeClothMaterialGpuV1,
  type CompiledMaterialPackageV1,
} from '../../compiler/material-package';
import type { ClothMeshPieceRange } from '../../mesh/cloth-mesh-ir';

/** Additive material-aware finalization. Neither these arrays nor the oracle mint runtime authority. */
export const XPBD_MATERIAL_VELOCITY_KERNEL_V2 = 'xpbd-material-velocity-kernel/v2' as const;
export const XPBD_MATERIAL_VELOCITY_ENTRY_POINT_V2 = 'finalizeMaterialVelocityV2' as const;
export const XPBD_MATERIAL_VELOCITY_WORKGROUP_SIZE_V2 = 64;
export const XPBD_MATERIAL_VELOCITY_PARAMS_BYTES_V2 = 16;
export const XPBD_MATERIAL_VELOCITY_DIAGNOSTICS_BYTES_V2 = 32;
const UINT32_MAX = 0xffff_ffff;
const STORAGE = 0x0080;
const UNIFORM_COPY_DST = 0x0048;
const NUMERIC_LIMIT = Math.fround(1e30);

export const XPBD_MATERIAL_VELOCITY_DIAGNOSTIC_OFFSETS_V2 = Object.freeze({
  invalidStateCount: 0,
  numericInvalidStateCount: 4,
  outOfDomainStateCount: 8,
  minimumInvalidParticleIndex: 12,
  minimumNumericInvalidParticleIndex: 16,
  minimumOutOfDomainParticleIndex: 20,
  maxOutOfDomainAbsPositionBits: 24,
  reservedZero: 28,
} as const);

export const XPBD_MATERIAL_VELOCITY_ABI_V2 = Object.freeze({
  version: XPBD_MATERIAL_VELOCITY_KERNEL_V2,
  entryPoint: XPBD_MATERIAL_VELOCITY_ENTRY_POINT_V2,
  workgroupSize: XPBD_MATERIAL_VELOCITY_WORKGROUP_SIZE_V2,
  paramsByteLength: XPBD_MATERIAL_VELOCITY_PARAMS_BYTES_V2,
  paramsOffsets: Object.freeze({ dtS: 0, particleCount: 4, reserved0: 8, reserved1: 12 }),
  diagnosticsByteLength: XPBD_MATERIAL_VELOCITY_DIAGNOSTICS_BYTES_V2,
  diagnosticsOffsets: XPBD_MATERIAL_VELOCITY_DIAGNOSTIC_OFFSETS_V2,
  bindings: Object.freeze({
    positionsMInvMassKg: 0,
    previousPositionsMInvMassKg: 1,
    velocitiesMps: 2,
    restPositionsMInvMassKg: 3,
    params: 4,
    diagnostics: 5,
    velocityRetentionPerStep: 6,
  }),
  bindingCounts: Object.freeze({ storage: 6, uniform: 1, total: 7 }),
  particleStrideBytes: 16,
  retentionStrideBytes: 4,
  domainAbsPositionLimitM: 100,
  exactDispatchRequired: true,
  invalidDispatchOrBufferExtent: 'no-write-not-completion-evidence',
  materialDampingRule: 'per-step-retention-from-exact-particle-material',
  runtimeAuthority: false,
  gpuAcceptanceClaimed: false,
} as const);

function positiveU32(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value < 1 || value > UINT32_MAX)
    throw new RangeError(`${label} must be a positive u32.`);
  return value;
}

function boundedF32(value: number): boolean {
  return Number.isFinite(value) && Math.abs(value) < NUMERIC_LIMIT;
}

export type XpbdMaterialVelocityParamsV2 = Readonly<{ dtS: number; particleCount: number }>;

export function encodeXpbdMaterialVelocityParamsV2(
  input: XpbdMaterialVelocityParamsV2,
): ArrayBuffer {
  const dtS = Math.fround(input.dtS);
  if (!boundedF32(dtS) || dtS <= 0) throw new RangeError('dtS must be a positive bounded f32.');
  const particleCount = positiveU32(input.particleCount, 'particleCount');
  const result = new ArrayBuffer(XPBD_MATERIAL_VELOCITY_PARAMS_BYTES_V2);
  const view = new DataView(result);
  view.setFloat32(0, dtS, true);
  view.setUint32(4, particleCount, true);
  return result;
}

export function decodeXpbdMaterialVelocityParamsV2(
  buffer: ArrayBuffer,
): XpbdMaterialVelocityParamsV2 {
  if (!(buffer instanceof ArrayBuffer) || buffer.byteLength !== 16)
    throw new RangeError('Material velocity parameters must be a non-shared 16-byte buffer.');
  const view = new DataView(buffer);
  if (view.getUint32(8, true) !== 0 || view.getUint32(12, true) !== 0)
    throw new RangeError('Material velocity parameter padding must be zero.');
  const result = { dtS: view.getFloat32(0, true), particleCount: view.getUint32(4, true) };
  encodeXpbdMaterialVelocityParamsV2(result);
  return Object.freeze(result);
}

export function xpbdMaterialVelocityWorkgroupsV2(
  particleCount: number,
  maxComputeWorkgroupsPerDimension = 65535,
): number {
  const count = Math.ceil(positiveU32(particleCount, 'particleCount') / 64);
  if (count > positiveU32(maxComputeWorkgroupsPerDimension, 'maxComputeWorkgroupsPerDimension'))
    throw new RangeError('Material velocity dispatch exceeds the device workgroup limit.');
  return count;
}

type Resource = Readonly<{ size: number; usage: number }>;
export function validateXpbdMaterialVelocityBufferContractV2(
  resources: Readonly<{
    positionsMInvMassKg: Resource;
    previousPositionsMInvMassKg: Resource;
    velocitiesMps: Resource;
    restPositionsMInvMassKg: Resource;
    params: Resource;
    diagnostics: Resource;
    velocityRetentionPerStep: Resource;
  }>,
  particleCount: number,
  limits: Readonly<{
    maxBufferSize: number;
    maxStorageBufferBindingSize: number;
    maxComputeWorkgroupsPerDimension: number;
  }>,
): void {
  xpbdMaterialVelocityWorkgroupsV2(particleCount, limits.maxComputeWorkgroupsPerDimension);
  for (const value of [limits.maxBufferSize, limits.maxStorageBufferBindingSize])
    if (!Number.isSafeInteger(value) || value < 32) throw new RangeError('Invalid buffer limit.');
  for (const [name, bytes] of [
    ['positionsMInvMassKg', particleCount * 16],
    ['previousPositionsMInvMassKg', particleCount * 16],
    ['velocitiesMps', particleCount * 16],
    ['restPositionsMInvMassKg', particleCount * 16],
    ['velocityRetentionPerStep', particleCount * 4],
    ['diagnostics', 32],
  ] as const) {
    const resource = resources[name];
    if (
      resource.size !== bytes ||
      !Number.isSafeInteger(resource.usage) ||
      (resource.usage & STORAGE) === 0 ||
      bytes > limits.maxBufferSize ||
      bytes > limits.maxStorageBufferBindingSize
    )
      throw new RangeError(`${name} violates the exact storage-buffer contract.`);
  }
  if (resources.params.size !== 16 || resources.params.usage !== UNIFORM_COPY_DST)
    throw new RangeError(
      'Material velocity uniform must be exactly 16 bytes with uniform/copy-dst usage.',
    );
}

/** Derives data only. The caller still authenticates/seals the complete compiler package.
 * No coordinates, nearest matching, material-zero fallback, or retention averaging are used.
 * Triangle records must be in original material-package order, not continuum color order. */
export function deriveXpbdParticleMaterialRetentionV2(
  material: Pick<
    CompiledMaterialPackageV1,
    'manifest' | 'triangleIndices' | 'triangleMaterialIndices' | 'materialRecords'
  >,
  pieceRanges: readonly ClothMeshPieceRange[],
): Readonly<{
  particleMaterialIndices: Uint32Array;
  velocityRetentionPerStep: Float32Array;
}> {
  const particles = positiveU32(material.manifest.particleCount, 'particleCount');
  const triangles = positiveU32(material.manifest.triangleCount, 'triangleCount');
  const materials = positiveU32(material.manifest.materialCount, 'materialCount');
  xpbdMaterialVelocityWorkgroupsV2(particles);
  for (const [buffer, bytes] of [
    [material.triangleIndices, triangles * TRIANGLE_INDICES_GPU_V1.strideBytes],
    [material.triangleMaterialIndices, triangles * 4],
    [material.materialRecords, materials * CLOTH_MATERIAL_GPU_V1.strideBytes],
  ] as const)
    if (!(buffer instanceof ArrayBuffer) || buffer.byteLength !== bytes)
      throw new RangeError('Material buffer has an inexact or shared extent.');
  const retentionByMaterial = new Float32Array(materials);
  for (let index = 0; index < materials; index++) {
    const retention = decodeClothMaterialGpuV1(
      material.materialRecords,
      index,
    ).velocityRetentionPerStep;
    if (!Number.isFinite(retention) || retention < 0 || retention > 1)
      throw new RangeError('Material retention must be finite within [0, 1].');
    retentionByMaterial[index] = retention;
  }
  const particleMaterialIndices = new Uint32Array(particles).fill(UINT32_MAX);
  const particleCovered = new Uint8Array(particles);
  const triangleCovered = new Uint8Array(triangles);
  const referenced = new Uint8Array(particles);
  const ids = new Set<string>();
  const topology = new DataView(material.triangleIndices);
  const assignments = new DataView(material.triangleMaterialIndices);
  for (const range of pieceRanges) {
    if (typeof range.pieceId !== 'string' || !range.pieceId || ids.has(range.pieceId))
      throw new RangeError('Piece identities must be unique and nonempty.');
    ids.add(range.pieceId);
    for (const [offset, count, limit] of [
      [range.vertexOffset, range.vertexCount, particles],
      [range.triangleOffset, range.triangleCount, triangles],
    ])
      if (
        !Number.isSafeInteger(offset) ||
        offset < 0 ||
        !Number.isSafeInteger(count) ||
        count < 1 ||
        offset + count > limit
      )
        throw new RangeError('Piece range is outside exact material coverage.');
    for (let v = range.vertexOffset; v < range.vertexOffset + range.vertexCount; v++) {
      if (particleCovered[v]) throw new RangeError('Piece vertex ranges overlap.');
      particleCovered[v] = 1;
    }
    let pieceMaterial: number | null = null;
    for (let t = range.triangleOffset; t < range.triangleOffset + range.triangleCount; t++) {
      if (triangleCovered[t]) throw new RangeError('Piece triangle ranges overlap.');
      triangleCovered[t] = 1;
      const materialIndex = assignments.getUint32(t * 4, true);
      if (materialIndex >= materials || (pieceMaterial !== null && pieceMaterial !== materialIndex))
        throw new RangeError('Piece material assignment is invalid or mixed.');
      pieceMaterial = materialIndex;
      const vertices = [0, 1, 2].map((corner) => topology.getUint32(t * 16 + corner * 4, true));
      if (topology.getUint32(t * 16 + 12, true) !== 0 || new Set(vertices).size !== 3)
        throw new RangeError('Triangle record is degenerate or has nonzero padding.');
      for (const vertex of vertices) {
        if (vertex < range.vertexOffset || vertex >= range.vertexOffset + range.vertexCount)
          throw new RangeError(
            'Triangle references a different piece or an out-of-range particle.',
          );
        if (referenced[vertex] && particleMaterialIndices[vertex] !== materialIndex)
          throw new RangeError('Particle has ambiguous material assignments.');
        particleMaterialIndices[vertex] = materialIndex;
        referenced[vertex] = 1;
      }
    }
  }
  if (particleCovered.includes(0) || triangleCovered.includes(0) || referenced.includes(0))
    throw new RangeError('Piece/triangle/material coverage is incomplete.');
  const velocityRetentionPerStep = new Float32Array(particles);
  for (let index = 0; index < particles; index++)
    velocityRetentionPerStep[index] = retentionByMaterial[particleMaterialIndices[index]];
  return Object.freeze({ particleMaterialIndices, velocityRetentionPerStep });
}

export function createXpbdMaterialVelocityDiagnosticsV2(): Uint32Array {
  return new Uint32Array([0, 0, 0, UINT32_MAX, UINT32_MAX, UINT32_MAX, 0, 0]);
}

export const XPBD_MATERIAL_VELOCITY_WGSL_V2 = /* wgsl */ `
struct Params { dtS: f32, particleCount: u32, reserved0: u32, reserved1: u32, };
struct Diagnostics {
  invalidStateCount: atomic<u32>,
  numericInvalidStateCount: atomic<u32>,
  outOfDomainStateCount: atomic<u32>,
  minimumInvalidParticleIndex: atomic<u32>,
  minimumNumericInvalidParticleIndex: atomic<u32>,
  minimumOutOfDomainParticleIndex: atomic<u32>,
  maxOutOfDomainAbsPositionBits: atomic<u32>,
  reservedZero: atomic<u32>,
};
@group(0) @binding(0) var<storage, read_write> positions: array<vec4<f32>>;
@group(0) @binding(1) var<storage, read> previousPositions: array<vec4<f32>>;
@group(0) @binding(2) var<storage, read_write> velocities: array<vec4<f32>>;
@group(0) @binding(3) var<storage, read> restPositions: array<vec4<f32>>;
@group(0) @binding(4) var<uniform> params: Params;
@group(0) @binding(5) var<storage, read_write> diagnostics: Diagnostics;
@group(0) @binding(6) var<storage, read> retention: array<f32>;

fn finiteScalar(value: f32) -> bool { return value == value && abs(value) < 1.0e30; }
fn finiteVector(value: vec4<f32>) -> bool {
  return all(value == value) && all(abs(value) < vec4<f32>(1.0e30));
}
fn maximumAbs(value: vec3<f32>) -> f32 { return max(abs(value.x), max(abs(value.y), abs(value.z))); }
fn recordNumeric(index: u32) {
  atomicAdd(&diagnostics.invalidStateCount, 1u);
  atomicAdd(&diagnostics.numericInvalidStateCount, 1u);
  atomicMin(&diagnostics.minimumInvalidParticleIndex, index);
  atomicMin(&diagnostics.minimumNumericInvalidParticleIndex, index);
}
fn recordDomain(index: u32, maximum: f32) {
  atomicAdd(&diagnostics.invalidStateCount, 1u);
  atomicAdd(&diagnostics.outOfDomainStateCount, 1u);
  atomicMin(&diagnostics.minimumInvalidParticleIndex, index);
  atomicMin(&diagnostics.minimumOutOfDomainParticleIndex, index);
  atomicMax(&diagnostics.maxOutOfDomainAbsPositionBits, bitcast<u32>(maximum));
}
fn exactDispatchAndBuffers(groups: vec3<u32>) -> bool {
  let expectedX = params.particleCount / 64u + select(0u, 1u, params.particleCount % 64u != 0u);
  return params.particleCount > 0u && all(groups == vec3<u32>(expectedX, 1u, 1u)) &&
    finiteScalar(params.dtS) && params.dtS > 0.0 && params.reserved0 == 0u && params.reserved1 == 0u &&
    arrayLength(&positions) == params.particleCount && arrayLength(&previousPositions) == params.particleCount &&
    arrayLength(&velocities) == params.particleCount && arrayLength(&restPositions) == params.particleCount &&
    arrayLength(&retention) == params.particleCount;
}
@compute @workgroup_size(64)
fn ${XPBD_MATERIAL_VELOCITY_ENTRY_POINT_V2}(
  @builtin(global_invocation_id) invocation: vec3<u32>,
  @builtin(num_workgroups) groups: vec3<u32>) {
  if (!exactDispatchAndBuffers(groups)) { return; }
  let index = invocation.x;
  if (index >= params.particleCount) { return; }
  let rest = restPositions[index];
  // An invalid immutable anchor cannot be used for rollback. Reject without inventing a position.
  if (!finiteVector(rest) || rest.w < 0.0) {
    velocities[index] = vec4<f32>(0.0); recordNumeric(index); return;
  }
  if (maximumAbs(rest.xyz) >= 100.0) {
    velocities[index] = vec4<f32>(0.0); recordDomain(index, maximumAbs(rest.xyz)); return;
  }
  if (rest.w == 0.0) {
    positions[index] = rest; velocities[index] = vec4<f32>(0.0); return;
  }
  let next = positions[index];
  let previous = previousPositions[index];
  let incomingVelocity = velocities[index];
  let keep = retention[index];
  if (!finiteVector(next) || !finiteVector(previous) || !finiteVector(incomingVelocity) ||
      next.w != rest.w || previous.w != rest.w || incomingVelocity.w != 0.0 ||
      !finiteScalar(keep) || keep < 0.0 || keep > 1.0) {
    positions[index] = rest; velocities[index] = vec4<f32>(0.0); recordNumeric(index); return;
  }
  let maximum = max(maximumAbs(next.xyz), maximumAbs(previous.xyz));
  if (maximum >= 100.0) {
    positions[index] = rest; velocities[index] = vec4<f32>(0.0); recordDomain(index, maximum); return;
  }
  let velocity = ((next.xyz - previous.xyz) / params.dtS) * keep;
  if (!all(velocity == velocity) || any(abs(velocity) >= vec3<f32>(1.0e30))) {
    positions[index] = rest; velocities[index] = vec4<f32>(0.0); recordNumeric(index); return;
  }
  velocities[index] = vec4<f32>(velocity, 0.0);
}
`.trim();

export const XPBD_MATERIAL_VELOCITY_SOURCE_SHA256_V2 =
  '3d89b057bbb1ef8875877fa0ef9f0dfdf95cc8430cb3ee134cc768d42a3c7a6d';

export async function getXpbdMaterialVelocityPipelineIdentityV2(
  options: Readonly<{ crypto?: Pick<Crypto, 'subtle'> | null }> = {},
) {
  const crypto = Object.prototype.hasOwnProperty.call(options, 'crypto')
    ? options.crypto
    : globalThis.crypto;
  if (!crypto?.subtle) throw new Error('Material velocity V2 requires Web Crypto SHA-256.');
  const bytes = new TextEncoder().encode(XPBD_MATERIAL_VELOCITY_WGSL_V2);
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes.buffer));
  const sha256 = Array.from(digest, (value) => value.toString(16).padStart(2, '0')).join('');
  if (sha256 !== XPBD_MATERIAL_VELOCITY_SOURCE_SHA256_V2)
    throw new Error('Material velocity V2 source differs from its pinned identity.');
  return Object.freeze({
    version: XPBD_MATERIAL_VELOCITY_KERNEL_V2,
    sha256,
    entryPoint: XPBD_MATERIAL_VELOCITY_ENTRY_POINT_V2,
  });
}

export function xpbdMaterialVelocityShaderDescriptorV2(): GPUShaderModuleDescriptor {
  return { label: 'XPBD material velocity V2', code: XPBD_MATERIAL_VELOCITY_WGSL_V2 };
}

/** f32 arithmetic oracle for the valid dispatch. This does not execute or validate WGSL on a GPU.
 * Inputs remain borrowed and unchanged; positions/velocities/diagnostics are detached outputs. */
export function finalizeXpbdMaterialVelocityV2ForOracle(
  input: Readonly<{
    dtS: number;
    positionsMInvMassKg: Float32Array;
    previousPositionsMInvMassKg: Float32Array;
    velocitiesMps: Float32Array;
    restPositionsMInvMassKg: Float32Array;
    velocityRetentionPerStep: Float32Array;
  }>,
) {
  const particleCount = positiveU32(input.restPositionsMInvMassKg.length / 4, 'particleCount');
  xpbdMaterialVelocityWorkgroupsV2(particleCount);
  const { dtS } = decodeXpbdMaterialVelocityParamsV2(
    encodeXpbdMaterialVelocityParamsV2({ dtS: input.dtS, particleCount }),
  );
  for (const values of [
    input.positionsMInvMassKg,
    input.previousPositionsMInvMassKg,
    input.velocitiesMps,
    input.restPositionsMInvMassKg,
  ])
    if (
      !(values instanceof Float32Array) ||
      !(values.buffer instanceof ArrayBuffer) ||
      values.length !== particleCount * 4
    )
      throw new RangeError('Oracle XYZW/velocity extents must be exact and non-shared.');
  if (
    !(input.velocityRetentionPerStep instanceof Float32Array) ||
    !(input.velocityRetentionPerStep.buffer instanceof ArrayBuffer) ||
    input.velocityRetentionPerStep.length !== particleCount
  )
    throw new RangeError('Oracle retention extent must be exact and non-shared.');
  const positions = new Float32Array(input.positionsMInvMassKg);
  const velocities = new Float32Array(input.velocitiesMps);
  const diagnostics = createXpbdMaterialVelocityDiagnosticsV2();
  const numeric = (values: Float32Array, start: number) =>
    [0, 1, 2, 3].every((axis) => boundedF32(values[start + axis]));
  const maximum = (values: Float32Array, start: number) =>
    Math.max(...[0, 1, 2].map((axis) => Math.abs(values[start + axis])));
  for (let index = 0; index < particleCount; index++) {
    const offset = index * 4;
    const rest = input.restPositionsMInvMassKg.subarray(offset, offset + 4);
    const reject = (kind: 'numeric' | 'domain', maximumPosition = 0, validAnchor = true) => {
      if (validAnchor) positions.set(rest, offset);
      velocities.fill(0, offset, offset + 4);
      diagnostics[0]++;
      diagnostics[3] = Math.min(diagnostics[3], index);
      if (kind === 'numeric') {
        diagnostics[1]++;
        diagnostics[4] = Math.min(diagnostics[4], index);
      } else {
        diagnostics[2]++;
        diagnostics[5] = Math.min(diagnostics[5], index);
        const bits = new Uint32Array(new Float32Array([maximumPosition]).buffer)[0];
        diagnostics[6] = Math.max(diagnostics[6], bits);
      }
    };
    if (!numeric(rest, 0) || rest[3] < 0) {
      reject('numeric', 0, false);
      continue;
    }
    if (maximum(rest, 0) >= 100) {
      reject('domain', maximum(rest, 0), false);
      continue;
    }
    if (rest[3] === 0) {
      positions.set(rest, offset);
      velocities.fill(0, offset, offset + 4);
      continue;
    }
    const previous = input.previousPositionsMInvMassKg;
    const keep = input.velocityRetentionPerStep[index];
    if (
      !numeric(positions, offset) ||
      !numeric(previous, offset) ||
      !numeric(velocities, offset) ||
      positions[offset + 3] !== rest[3] ||
      previous[offset + 3] !== rest[3] ||
      velocities[offset + 3] !== 0 ||
      !boundedF32(keep) ||
      keep < 0 ||
      keep > 1
    ) {
      reject('numeric');
      continue;
    }
    const maximumPosition = Math.max(maximum(positions, offset), maximum(previous, offset));
    if (maximumPosition >= 100) {
      reject('domain', maximumPosition);
      continue;
    }
    const result = [0, 1, 2].map((axis) =>
      Math.fround(
        Math.fround(Math.fround(positions[offset + axis] - previous[offset + axis]) / dtS) * keep,
      ),
    );
    if (!result.every(boundedF32)) {
      reject('numeric');
      continue;
    }
    velocities.set([...result, 0], offset);
  }
  return Object.freeze({
    positionsMInvMassKg: positions,
    velocitiesMps: velocities,
    diagnostics,
    arithmetic: 'f32-per-operation' as const,
    gpuExecutionClaimed: false as const,
  });
}
