/* global GPUShaderModuleDescriptor */

export const ACTUAL_BODY_TRIANGLE_MESH_CONTACT_KERNEL_V2 =
  'actual-body-triangle-mesh-contact-kernel/2' as const;
export const ACTUAL_BODY_TRIANGLE_MESH_CONTACT_SOURCE_REVISION_V2 =
  'actual-body-triangle-mesh-contact-wgsl/2' as const;
export const ACTUAL_BODY_TRIANGLE_MESH_CONTACT_ENTRY_POINT_V2 =
  'projectActualBodyTriangleMeshContactV2' as const;
export const ACTUAL_BODY_TRIANGLE_MESH_CONTACT_WORKGROUP_SIZE_V2 = 64;
export const ACTUAL_BODY_TRIANGLE_MESH_CONTACT_PARAMS_BYTES_V2 = 32;
export const ACTUAL_BODY_TRIANGLE_MESH_CONTACT_DIAGNOSTICS_BYTES_V2 = 40;

export const ACTUAL_BODY_TRIANGLE_MESH_CONTACT_ABI_V2 = Object.freeze({
  version: ACTUAL_BODY_TRIANGLE_MESH_CONTACT_KERNEL_V2,
  sourceRevision: ACTUAL_BODY_TRIANGLE_MESH_CONTACT_SOURCE_REVISION_V2,
  entryPoint: ACTUAL_BODY_TRIANGLE_MESH_CONTACT_ENTRY_POINT_V2,
  workgroupSize: ACTUAL_BODY_TRIANGLE_MESH_CONTACT_WORKGROUP_SIZE_V2,
  bindings: Object.freeze({
    clothPositionsMInvMassKg: Object.freeze({ binding: 0, strideBytes: 16 }),
    previousPositionsMInvMassKg: Object.freeze({ binding: 1, strideBytes: 16 }),
    bodyPositionsM: Object.freeze({ binding: 2, strideBytes: 4 }),
    bodyTriangles: Object.freeze({ binding: 3, strideBytes: 4 }),
    params: Object.freeze({
      binding: 4,
      sizeBytes: ACTUAL_BODY_TRIANGLE_MESH_CONTACT_PARAMS_BYTES_V2,
    }),
    diagnostics: Object.freeze({
      binding: 5,
      sizeBytes: ACTUAL_BODY_TRIANGLE_MESH_CONTACT_DIAGNOSTICS_BYTES_V2,
    }),
  }),
  semantics: Object.freeze({
    collider: 'exact-retained-actual-body-triangle-mesh',
    analyticalProxyUsed: false,
    particleParallelism: 'one-invocation-per-cloth-particle',
    bodyTraversal: 'bounded-exhaustive-triangle-scan',
    normal: 'outward-consistent-wound-triangle-cross-b-minus-a-c-minus-a',
    correction: 'closest-triangle-signed-normal-projection-to-explicit-margin',
    velocityResponse:
      'shift-previous-by-correction-and-remove-only-inward-normal-displacement-preserve-tangent-outward',
    fixedParticles: 'w-zero-bit-exact-no-op',
  }),
} as const);

export type ActualBodyTriangleMeshContactParamsV2 = Readonly<{
  particleCount: number;
  bodyVertexCount: number;
  bodyTriangleCount: number;
  clearanceMarginM: number;
  maximumCorrectionM: number;
  minimumNormalLengthSquaredM4: number;
  outwardNormalSign: 1 | -1;
}>;

function positiveU32(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value < 1 || value > 0xffff_ffff)
    throw new RangeError(`${label} must be a positive u32.`);
  return value;
}

function positiveF32(value: number, label: string): number {
  const rounded = Math.fround(value);
  if (!Number.isFinite(rounded) || rounded <= 0 || rounded >= 1e30)
    throw new RangeError(`${label} must be a positive bounded f32.`);
  return rounded;
}

export function packActualBodyTriangleMeshContactParamsV2(
  input: ActualBodyTriangleMeshContactParamsV2,
): ArrayBuffer {
  const clearanceMarginM = positiveF32(input.clearanceMarginM, 'clearanceMarginM');
  const maximumCorrectionM = positiveF32(input.maximumCorrectionM, 'maximumCorrectionM');
  if (maximumCorrectionM < clearanceMarginM)
    throw new RangeError('maximumCorrectionM must be at least clearanceMarginM.');
  const buffer = new ArrayBuffer(ACTUAL_BODY_TRIANGLE_MESH_CONTACT_PARAMS_BYTES_V2);
  const view = new DataView(buffer);
  view.setUint32(0, positiveU32(input.particleCount, 'particleCount'), true);
  view.setUint32(4, positiveU32(input.bodyVertexCount, 'bodyVertexCount'), true);
  view.setUint32(8, positiveU32(input.bodyTriangleCount, 'bodyTriangleCount'), true);
  view.setUint32(12, 0, true);
  view.setFloat32(16, clearanceMarginM, true);
  view.setFloat32(20, maximumCorrectionM, true);
  view.setFloat32(
    24,
    positiveF32(input.minimumNormalLengthSquaredM4, 'minimumNormalLengthSquaredM4'),
    true,
  );
  if (input.outwardNormalSign !== 1 && input.outwardNormalSign !== -1)
    throw new RangeError('outwardNormalSign must be exactly +1 or -1.');
  view.setFloat32(28, input.outwardNormalSign, true);
  return buffer;
}

export function actualBodyTriangleMeshContactWorkgroupsV2(particleCount: number): number {
  return Math.ceil(
    positiveU32(particleCount, 'particleCount') /
      ACTUAL_BODY_TRIANGLE_MESH_CONTACT_WORKGROUP_SIZE_V2,
  );
}

export const ACTUAL_BODY_TRIANGLE_MESH_CONTACT_WGSL_V2 = /* wgsl */ `
struct ContactParams {
  particleCount: u32,
  bodyVertexCount: u32,
  bodyTriangleCount: u32,
  reserved0: u32,
  clearanceMarginM: f32,
  maximumCorrectionM: f32,
  minimumNormalLengthSquaredM4: f32,
  outwardNormalSign: f32,
};
struct ContactDiagnostics {
  correctedParticleCount: atomic<u32>,
  invalidParticleCount: atomic<u32>,
  degenerateTriangleVisitCount: atomic<u32>,
  outOfRangeTriangleVisitCount: atomic<u32>,
  maximumCorrectionBits: atomic<u32>,
  maximumPenetrationBits: atomic<u32>,
  minimumCorrectedParticleIndex: atomic<u32>,
  inwardNormalClampCount: atomic<u32>,
  maximumRemovedInwardNormalDeltaBits: atomic<u32>,
  reserved: atomic<u32>,
};
struct ClosestPointResult { point: vec3<f32>, valid: bool, };
@group(0) @binding(0) var<storage, read_write> clothPositions: array<vec4<f32>>;
@group(0) @binding(1) var<storage, read_write> previousPositions: array<vec4<f32>>;
@group(0) @binding(2) var<storage, read> bodyPositions: array<f32>;
@group(0) @binding(3) var<storage, read> bodyTriangles: array<u32>;
@group(0) @binding(4) var<uniform> params: ContactParams;
@group(0) @binding(5) var<storage, read_write> diagnostics: ContactDiagnostics;
fn finiteScalar(value: f32) -> bool { return value == value && abs(value) < 1.0e30; }
fn finiteVec3(value: vec3<f32>) -> bool {
  return all(value == value) && all(abs(value) < vec3<f32>(1.0e30));
}
fn bodyPosition(index: u32) -> vec3<f32> {
  let offset = index * 3u;
  return vec3<f32>(bodyPositions[offset], bodyPositions[offset + 1u], bodyPositions[offset + 2u]);
}
fn closestPointOnTriangle(point: vec3<f32>, a: vec3<f32>, b: vec3<f32>, c: vec3<f32>) -> ClosestPointResult {
  let ab = b - a;
  let ac = c - a;
  let ap = point - a;
  let d1 = dot(ab, ap);
  let d2 = dot(ac, ap);
  if (d1 <= 0.0 && d2 <= 0.0) { return ClosestPointResult(a, true); }
  let bp = point - b;
  let d3 = dot(ab, bp);
  let d4 = dot(ac, bp);
  if (d3 >= 0.0 && d4 <= d3) { return ClosestPointResult(b, true); }
  let vc = d1 * d4 - d3 * d2;
  if (vc <= 0.0 && d1 >= 0.0 && d3 <= 0.0) {
    let denominator = d1 - d3;
    if (!finiteScalar(denominator) || abs(denominator) <= 1.0e-30) {
      return ClosestPointResult(a, false);
    }
    return ClosestPointResult(a + (d1 / denominator) * ab, true);
  }
  let cp = point - c;
  let d5 = dot(ab, cp);
  let d6 = dot(ac, cp);
  if (d6 >= 0.0 && d5 <= d6) { return ClosestPointResult(c, true); }
  let vb = d5 * d2 - d1 * d6;
  if (vb <= 0.0 && d2 >= 0.0 && d6 <= 0.0) {
    let denominator = d2 - d6;
    if (!finiteScalar(denominator) || abs(denominator) <= 1.0e-30) {
      return ClosestPointResult(a, false);
    }
    return ClosestPointResult(a + (d2 / denominator) * ac, true);
  }
  let va = d3 * d6 - d5 * d4;
  if (va <= 0.0 && (d4 - d3) >= 0.0 && (d5 - d6) >= 0.0) {
    let denominator = (d4 - d3) + (d5 - d6);
    if (!finiteScalar(denominator) || abs(denominator) <= 1.0e-30) {
      return ClosestPointResult(a, false);
    }
    return ClosestPointResult(b + ((d4 - d3) / denominator) * (c - b), true);
  }
  let denominator = va + vb + vc;
  if (!finiteScalar(denominator) || abs(denominator) <= 1.0e-30) {
    return ClosestPointResult(a, false);
  }
  let inverse = 1.0 / denominator;
  return ClosestPointResult(a + ab * (vb * inverse) + ac * (vc * inverse), true);
}
fn saturatingIncrement(counter: ptr<storage, atomic<u32>, read_write>) {
  loop {
    let current = atomicLoad(counter);
    if (current == 0xffffffffu) { return; }
    let result = atomicCompareExchangeWeak(counter, current, current + 1u);
    if (result.exchanged) { return; }
  }
}
fn exactDispatch(groups: vec3<u32>) -> bool {
  let expected = params.particleCount / 64u + select(0u, 1u, params.particleCount % 64u != 0u);
  return all(groups == vec3<u32>(expected, 1u, 1u));
}
fn paramsAndBuffersValid() -> bool {
  return params.particleCount > 0u && params.bodyVertexCount > 0u &&
    params.bodyTriangleCount > 0u && params.reserved0 == 0u &&
    (params.outwardNormalSign == 1.0 || params.outwardNormalSign == -1.0) &&
    finiteScalar(params.clearanceMarginM) && params.clearanceMarginM > 0.0 &&
    finiteScalar(params.maximumCorrectionM) && params.maximumCorrectionM >= params.clearanceMarginM &&
    finiteScalar(params.minimumNormalLengthSquaredM4) && params.minimumNormalLengthSquaredM4 > 0.0 &&
    arrayLength(&clothPositions) == params.particleCount &&
    arrayLength(&previousPositions) == params.particleCount &&
    arrayLength(&bodyPositions) == params.bodyVertexCount * 3u &&
    arrayLength(&bodyTriangles) == params.bodyTriangleCount * 3u;
}
@compute @workgroup_size(${ACTUAL_BODY_TRIANGLE_MESH_CONTACT_WORKGROUP_SIZE_V2})
fn ${ACTUAL_BODY_TRIANGLE_MESH_CONTACT_ENTRY_POINT_V2}(
  @builtin(global_invocation_id) invocation: vec3<u32>,
  @builtin(num_workgroups) groups: vec3<u32>
) {
  if (!exactDispatch(groups) || !paramsAndBuffersValid()) {
    if (invocation.x == 0u) { saturatingIncrement(&diagnostics.invalidParticleCount); }
    return;
  }
  let particleIndex = invocation.x;
  if (particleIndex >= params.particleCount) { return; }
  let particle = clothPositions[particleIndex];
  if (!finiteVec3(particle.xyz) || !finiteScalar(particle.w) || particle.w < 0.0) {
    saturatingIncrement(&diagnostics.invalidParticleCount);
    return;
  }
  if (particle.w == 0.0) { return; }
  let previous = previousPositions[particleIndex];
  if (!finiteVec3(previous.xyz) || !finiteScalar(previous.w) || previous.w < 0.0 ||
      bitcast<u32>(previous.w) != bitcast<u32>(particle.w)) {
    saturatingIncrement(&diagnostics.invalidParticleCount);
    return;
  }
  var nearestDistanceSquared = 3.402823466e+38;
  var nearestPoint = vec3<f32>(0.0);
  var nearestNormal = vec3<f32>(0.0);
  var found = false;
  for (var triangleIndex = 0u; triangleIndex < params.bodyTriangleCount; triangleIndex += 1u) {
    let triangleOffset = triangleIndex * 3u;
    let ia = bodyTriangles[triangleOffset];
    let ib = bodyTriangles[triangleOffset + 1u];
    let ic = bodyTriangles[triangleOffset + 2u];
    if (ia >= params.bodyVertexCount || ib >= params.bodyVertexCount || ic >= params.bodyVertexCount ||
        ia == ib || ia == ic || ib == ic) {
      saturatingIncrement(&diagnostics.outOfRangeTriangleVisitCount);
      continue;
    }
    let a = bodyPosition(ia);
    let b = bodyPosition(ib);
    let c = bodyPosition(ic);
    if (!finiteVec3(a) || !finiteVec3(b) || !finiteVec3(c)) {
      saturatingIncrement(&diagnostics.outOfRangeTriangleVisitCount);
      continue;
    }
    let rawNormal = cross(b - a, c - a);
    let normalLengthSquared = dot(rawNormal, rawNormal);
    if (!finiteScalar(normalLengthSquared) || normalLengthSquared <= params.minimumNormalLengthSquaredM4) {
      saturatingIncrement(&diagnostics.degenerateTriangleVisitCount);
      continue;
    }
    let closest = closestPointOnTriangle(particle.xyz, a, b, c);
    if (!closest.valid || !finiteVec3(closest.point)) {
      saturatingIncrement(&diagnostics.degenerateTriangleVisitCount);
      continue;
    }
    let delta = particle.xyz - closest.point;
    let distanceSquared = dot(delta, delta);
    if (!finiteScalar(distanceSquared) || distanceSquared < 0.0) {
      saturatingIncrement(&diagnostics.degenerateTriangleVisitCount);
      continue;
    }
    if (!found || distanceSquared < nearestDistanceSquared) {
      found = true;
      nearestDistanceSquared = distanceSquared;
      nearestPoint = closest.point;
      nearestNormal = rawNormal * (inverseSqrt(normalLengthSquared) * params.outwardNormalSign);
    }
  }
  if (!found || !finiteVec3(nearestPoint) || !finiteVec3(nearestNormal)) {
    saturatingIncrement(&diagnostics.invalidParticleCount);
    return;
  }
  let signedClearanceM = dot(particle.xyz - nearestPoint, nearestNormal);
  if (!finiteScalar(signedClearanceM)) {
    saturatingIncrement(&diagnostics.invalidParticleCount);
    return;
  }
  if (signedClearanceM >= params.clearanceMarginM) { return; }
  let requestedCorrectionM = params.clearanceMarginM - signedClearanceM;
  let correctionM = min(requestedCorrectionM, params.maximumCorrectionM);
  let corrected = particle.xyz + nearestNormal * correctionM;
  let preContactDelta = particle.xyz - previous.xyz;
  let inwardNormalDeltaM = min(dot(preContactDelta, nearestNormal), 0.0);
  let postContactDelta = preContactDelta - nearestNormal * inwardNormalDeltaM;
  let correctedPrevious = corrected - postContactDelta;
  if (!finiteScalar(correctionM) || correctionM <= 0.0 || !finiteVec3(corrected) ||
      !finiteScalar(inwardNormalDeltaM) || !finiteVec3(postContactDelta) ||
      !finiteVec3(correctedPrevious)) {
    saturatingIncrement(&diagnostics.invalidParticleCount);
    return;
  }
  clothPositions[particleIndex] = vec4<f32>(corrected, particle.w);
  previousPositions[particleIndex] = vec4<f32>(correctedPrevious, previous.w);
  saturatingIncrement(&diagnostics.correctedParticleCount);
  atomicMax(&diagnostics.maximumCorrectionBits, bitcast<u32>(correctionM));
  atomicMax(&diagnostics.maximumPenetrationBits, bitcast<u32>(max(0.0, -signedClearanceM)));
  atomicMin(&diagnostics.minimumCorrectedParticleIndex, particleIndex);
  if (inwardNormalDeltaM < 0.0) {
    saturatingIncrement(&diagnostics.inwardNormalClampCount);
    atomicMax(&diagnostics.maximumRemovedInwardNormalDeltaBits, bitcast<u32>(-inwardNormalDeltaM));
  }
}
`.trim();

export const ACTUAL_BODY_TRIANGLE_MESH_CONTACT_SOURCE_SHA256_V2 =
  '9cbb2a8f13e7d4704722825a23151032c82de92672e276685a7af0f3f52515fd' as const;

function hex(bytes: Uint8Array): string {
  return Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('');
}

export async function hashActualBodyTriangleMeshContactSourceV2(
  source: string,
  options: Readonly<{ crypto?: Pick<Crypto, 'subtle'> | null }> = {},
): Promise<string> {
  const crypto = Object.prototype.hasOwnProperty.call(options, 'crypto')
    ? options.crypto
    : globalThis.crypto;
  if (!crypto?.subtle)
    throw new Error('Actual-body triangle-mesh contact V2 requires Web Crypto SHA-256.');
  const bytes = new TextEncoder().encode(source);
  return hex(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)));
}

export async function getActualBodyTriangleMeshContactPipelineIdentityV2(
  options: Readonly<{ crypto?: Pick<Crypto, 'subtle'> | null }> = {},
) {
  const sha256 = await hashActualBodyTriangleMeshContactSourceV2(
    ACTUAL_BODY_TRIANGLE_MESH_CONTACT_WGSL_V2,
    options,
  );
  if (sha256 !== ACTUAL_BODY_TRIANGLE_MESH_CONTACT_SOURCE_SHA256_V2)
    throw new Error(
      'Actual-body triangle-mesh contact V2 source differs from its pinned identity.',
    );
  return Object.freeze({ sha256, entryPoint: ACTUAL_BODY_TRIANGLE_MESH_CONTACT_ENTRY_POINT_V2 });
}

export function actualBodyTriangleMeshContactShaderDescriptorV2(): GPUShaderModuleDescriptor {
  return {
    label: 'Actual-body triangle-mesh contact V2',
    code: ACTUAL_BODY_TRIANGLE_MESH_CONTACT_WGSL_V2,
  };
}

export function projectActualBodyTriangleContactOracleV2(
  input: Readonly<{
    point: readonly [number, number, number];
    previousPoint: readonly [number, number, number];
    inverseMassKgInv: number;
    triangle: readonly [
      readonly [number, number, number],
      readonly [number, number, number],
      readonly [number, number, number],
    ];
    clearanceMarginM: number;
    maximumCorrectionM: number;
  }>,
): Readonly<{
  corrected: boolean;
  position: readonly [number, number, number];
  previousPosition: readonly [number, number, number];
  signedClearanceM: number;
  correctionM: number;
  inwardNormalClampDeltaM: number;
}> {
  const [a, b, c] = input.triangle;
  const subtract = (left: readonly number[], right: readonly number[]) =>
    [left[0]! - right[0]!, left[1]! - right[1]!, left[2]! - right[2]!] as const;
  const dot = (left: readonly number[], right: readonly number[]) =>
    left[0]! * right[0]! + left[1]! * right[1]! + left[2]! * right[2]!;
  const ab = subtract(b, a);
  const ac = subtract(c, a);
  const rawNormal = [
    ab[1] * ac[2] - ab[2] * ac[1],
    ab[2] * ac[0] - ab[0] * ac[2],
    ab[0] * ac[1] - ab[1] * ac[0],
  ] as const;
  const length = Math.hypot(...rawNormal);
  if (!(length > 0)) throw new RangeError('Oracle triangle must be nondegenerate.');
  const normal = rawNormal.map((value) => value / length) as [number, number, number];
  const signedClearanceM = dot(subtract(input.point, a), normal);
  const correctionM = Math.min(
    Math.max(0, input.clearanceMarginM - signedClearanceM),
    input.maximumCorrectionM,
  );
  const corrected = input.inverseMassKgInv > 0 && correctionM > 0;
  const position = input.point.map((value, axis) => value + normal[axis]! * correctionM) as [
    number,
    number,
    number,
  ];
  const preContactDelta = subtract(input.point, input.previousPoint);
  const inwardNormalClampDeltaM = corrected ? Math.min(dot(preContactDelta, normal), 0) : 0;
  const postContactDelta = preContactDelta.map(
    (value, axis) => value - normal[axis]! * inwardNormalClampDeltaM,
  );
  const previousPosition = position.map((value, axis) => value - postContactDelta[axis]!) as [
    number,
    number,
    number,
  ];
  return Object.freeze({
    corrected,
    position: Object.freeze(corrected ? position : [...input.point]) as readonly [
      number,
      number,
      number,
    ],
    previousPosition: Object.freeze(
      corrected ? previousPosition : [...input.previousPoint],
    ) as readonly [number, number, number],
    signedClearanceM,
    correctionM: corrected ? correctionM : 0,
    inwardNormalClampDeltaM,
  });
}
