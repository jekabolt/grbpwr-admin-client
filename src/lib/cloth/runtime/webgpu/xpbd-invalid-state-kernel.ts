/* global GPUShaderModuleDescriptor */

export const XPBD_VELOCITY_DIAGNOSTIC_KERNEL_V1 = 'xpbd-velocity-diagnostic-kernel/v1' as const;
export const XPBD_VELOCITY_DIAGNOSTIC_SOURCE_REVISION_V1 =
  'xpbd-velocity-diagnostic-kernel-wgsl/1' as const;
export const XPBD_VELOCITY_DIAGNOSTIC_ENTRY_POINT_V1 = 'main' as const;
export const XPBD_VELOCITY_DIAGNOSTIC_SOURCE_SHA256_V1 =
  'f16110b9f801ddb1b62c91ddcc670b401403f46598afb83182c25bff3d79c53b' as const;

export const XPBD_VELOCITY_DIAGNOSTIC_WGSL = [
  'struct FrameParams {',
  '  dt: f32,',
  '  gravity: f32,',
  '  damping: f32,',
  '  time: f32,',
  '  particleCount: u32,',
  '  distanceConstraintCount: u32,',
  '  windAcceleration: f32,',
  '  padding: f32,',
  '};',
  'struct Diagnostics {',
  '  invalidStateCount: atomic<u32>,',
  '  numericInvalidStateCount: atomic<u32>,',
  '  outOfDomainStateCount: atomic<u32>,',
  '  minimumInvalidParticleIndex: atomic<u32>,',
  '  minimumNumericInvalidParticleIndex: atomic<u32>,',
  '  minimumOutOfDomainParticleIndex: atomic<u32>,',
  '  maxOutOfDomainAbsPositionBits: atomic<u32>,',
  '  reserved: atomic<u32>,',
  '};',
  '@group(0) @binding(0) var<storage, read_write> positions: array<vec4<f32>>;',
  '@group(0) @binding(1) var<storage, read> previousPositions: array<vec4<f32>>;',
  '@group(0) @binding(2) var<storage, read_write> velocities: array<vec4<f32>>;',
  '@group(0) @binding(3) var<storage, read> restPositions: array<vec4<f32>>;',
  '@group(0) @binding(4) var<uniform> params: FrameParams;',
  '@group(0) @binding(5) var<storage, read_write> diagnostics: Diagnostics;',
  '@compute @workgroup_size(64)',
  'fn main(@builtin(global_invocation_id) invocation: vec3<u32>) {',
  '  let index = invocation.x;',
  '  if (index >= params.particleCount) { return; }',
  '  let rest = restPositions[index];',
  '  if (rest.w == 0.0) {',
  '    positions[index] = rest;',
  '    velocities[index] = vec4<f32>(0.0);',
  '    return;',
  '  }',
  '  let next = positions[index].xyz;',
  '  let numericValid = all(next == next) && all(abs(next) < vec3<f32>(1.0e30));',
  '  let maxAbsPosition = max(abs(next.x), max(abs(next.y), abs(next.z)));',
  '  let withinDomain = numericValid && maxAbsPosition < 100.0;',
  '  if (!withinDomain) {',
  '    positions[index] = rest;',
  '    velocities[index] = vec4<f32>(0.0);',
  '    atomicAdd(&diagnostics.invalidStateCount, 1u);',
  '    atomicMin(&diagnostics.minimumInvalidParticleIndex, index);',
  '    if (!numericValid) {',
  '      atomicAdd(&diagnostics.numericInvalidStateCount, 1u);',
  '      atomicMin(&diagnostics.minimumNumericInvalidParticleIndex, index);',
  '    } else {',
  '      atomicAdd(&diagnostics.outOfDomainStateCount, 1u);',
  '      atomicMin(&diagnostics.minimumOutOfDomainParticleIndex, index);',
  '      atomicMax(&diagnostics.maxOutOfDomainAbsPositionBits, bitcast<u32>(maxAbsPosition));',
  '    }',
  '    return;',
  '  }',
  '  let velocity = ((next - previousPositions[index].xyz) / params.dt) * params.damping;',
  '  velocities[index] = vec4<f32>(velocity, 0.0);',
  '}',
].join('\n');

function sourceSha256Hex(bytes: Uint8Array): string {
  return Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('');
}

export async function hashXpbdVelocityDiagnosticSourceV1(
  source: string,
  options: Readonly<{ crypto?: Pick<Crypto, 'subtle'> | null }> = {},
): Promise<string> {
  const crypto = Object.prototype.hasOwnProperty.call(options, 'crypto')
    ? options.crypto
    : globalThis.crypto;
  if (!crypto?.subtle)
    throw new Error('XPBD velocity diagnostic V1 identity requires Web Crypto SHA-256.');
  const encoded = new TextEncoder().encode(source);
  const owned = new Uint8Array(encoded.byteLength);
  owned.set(encoded);
  return sourceSha256Hex(new Uint8Array(await crypto.subtle.digest('SHA-256', owned.buffer)));
}

export async function verifyXpbdVelocityDiagnosticSourceV1(
  source: string,
  options: Readonly<{ crypto?: Pick<Crypto, 'subtle'> | null }> = {},
) {
  const sha256 = await hashXpbdVelocityDiagnosticSourceV1(source, options);
  if (sha256 !== XPBD_VELOCITY_DIAGNOSTIC_SOURCE_SHA256_V1)
    throw new Error('XPBD velocity diagnostic V1 source differs from its pinned identity.');
  return Object.freeze({
    version: XPBD_VELOCITY_DIAGNOSTIC_KERNEL_V1,
    sourceRevision: XPBD_VELOCITY_DIAGNOSTIC_SOURCE_REVISION_V1,
    sha256,
    entryPoint: XPBD_VELOCITY_DIAGNOSTIC_ENTRY_POINT_V1,
  });
}

export function getXpbdVelocityDiagnosticPipelineIdentityV1(
  options: Readonly<{ crypto?: Pick<Crypto, 'subtle'> | null }> = {},
) {
  return verifyXpbdVelocityDiagnosticSourceV1(XPBD_VELOCITY_DIAGNOSTIC_WGSL, options);
}

export function xpbdVelocityDiagnosticShaderDescriptorV1(): GPUShaderModuleDescriptor {
  return { label: 'XPBD velocity diagnostic V1', code: XPBD_VELOCITY_DIAGNOSTIC_WGSL };
}
