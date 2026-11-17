/* global GPUShaderModuleDescriptor */

export const XPBD_PREDICT_KERNEL_V1 = 'xpbd-predict-kernel/v1' as const;
export const XPBD_PREDICT_SOURCE_REVISION_V1 = 'xpbd-predict-kernel-wgsl/1' as const;
export const XPBD_PREDICT_ENTRY_POINT_V1 = 'predictXpbdParticlesV1' as const;
export const XPBD_PREDICT_WORKGROUP_SIZE_V1 = 64;
export const XPBD_PREDICT_FRAME_PARAMS_BYTES_V1 = 32;

const UINT32_MAX = 0xffff_ffff;
const STORAGE = 0x0080;
const UNIFORM_COPY_DST = 0x0048;

export const XPBD_PREDICT_FRAME_PARAMS_OFFSETS_V1 = Object.freeze({
  dtS: 0,
  gravityMps2Y: 4,
  damping: 8,
  simulationSeconds: 12,
  particleCount: 16,
  distanceConstraintCount: 20,
  windAccelerationMps2Z: 24,
  reservedZero: 28,
} as const);

export const XPBD_PREDICT_ABI_V1 = Object.freeze({
  version: XPBD_PREDICT_KERNEL_V1,
  sourceRevision: XPBD_PREDICT_SOURCE_REVISION_V1,
  entryPoint: XPBD_PREDICT_ENTRY_POINT_V1,
  workgroupSize: XPBD_PREDICT_WORKGROUP_SIZE_V1,
  dispatch: Object.freeze({
    x: 'ceil-exact-particle-count-over-64',
    y: 1,
    z: 1,
    exactNumWorkgroupsGuard: true,
    zeroDispatchResult: 'no-write-incomplete-frame',
  }),
  bindings: Object.freeze({
    positionsMInvMassKg: Object.freeze({
      binding: 0,
      resource: 'storage',
      access: 'read_write',
      strideBytes: 16,
      requiredUsage: STORAGE,
    }),
    previousPositionsMInvMassKg: Object.freeze({
      binding: 1,
      resource: 'storage',
      access: 'read_write',
      strideBytes: 16,
      requiredUsage: STORAGE,
    }),
    velocitiesMps: Object.freeze({
      binding: 2,
      resource: 'storage',
      access: 'read_write',
      strideBytes: 16,
      requiredUsage: STORAGE,
    }),
    restPositionsMInvMassKg: Object.freeze({
      binding: 3,
      resource: 'storage',
      access: 'read',
      strideBytes: 16,
      requiredUsage: STORAGE,
    }),
    frameParams: Object.freeze({
      binding: 4,
      resource: 'uniform',
      access: 'uniform',
      sizeBytes: XPBD_PREDICT_FRAME_PARAMS_BYTES_V1,
      exactUsage: UNIFORM_COPY_DST,
    }),
  }),
  bindingCounts: Object.freeze({ storage: 4, uniform: 1, total: 5 }),
  frameParamsOffsets: XPBD_PREDICT_FRAME_PARAMS_OFFSETS_V1,
  physics: Object.freeze({
    fixedParticleRule: 'rest-inverse-mass-zero-restores-rest-position-and-zero-velocity',
    freeParticleRule: 'semi-implicit-euler-gravity-plus-sinusoidal-z-wind',
    dampingConsumer: 'post-contact-velocity-kernel-not-predict',
  }),
  source: 'extracted-and-hardened-from-xpbd-spike-predict',
  runtimeIntegrated: false,
  runnable: false,
  promotionEligible: false,
  blockers: Object.freeze([
    'private-full-frame-owner-not-integrated',
    'pipeline-identity-not-owner-allowlisted',
    'exact-dispatch-not-owner-sealed',
    'same-frame-position-and-velocity-chronology-not-owner-bound',
    'browser-compile-and-bind-evidence-not-recorded',
  ] as const),
} as const);

export type XpbdPredictFrameParamsV1 = Readonly<{
  dtS: number;
  gravityMps2Y: number;
  damping: number;
  simulationSeconds: number;
  particleCount: number;
  distanceConstraintCount: number;
  windAccelerationMps2Z: number;
}>;

function positiveU32(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value < 1 || value > UINT32_MAX)
    throw new RangeError(`${label} must be a positive u32.`);
  return value;
}

function finiteF32(value: number, label: string): number {
  const rounded = Math.fround(value);
  if (!Number.isFinite(rounded) || Math.abs(rounded) >= 1e30)
    throw new RangeError(`${label} must be a finite bounded f32.`);
  return rounded === 0 ? 0 : rounded;
}

function positiveF32(value: number, label: string): number {
  const rounded = finiteF32(value, label);
  if (rounded <= 0) throw new RangeError(`${label} must be a positive f32.`);
  return rounded;
}

function snapshotNativeBuffer(value: unknown): ArrayBuffer {
  if (
    typeof value !== 'object' ||
    value === null ||
    Object.getPrototypeOf(value) !== ArrayBuffer.prototype ||
    Reflect.ownKeys(value).length !== 0
  )
    throw new TypeError('Predict frame params must be a native non-shared ArrayBuffer.');
  const getter = Object.getOwnPropertyDescriptor(ArrayBuffer.prototype, 'byteLength')!.get!;
  let byteLength: number;
  try {
    byteLength = Reflect.apply(getter, value, []) as number;
  } catch {
    throw new TypeError('Predict frame params must be a native non-shared ArrayBuffer.');
  }
  if (byteLength !== XPBD_PREDICT_FRAME_PARAMS_BYTES_V1)
    throw new RangeError('Predict frame params must be exactly 32 bytes.');
  return Reflect.apply(ArrayBuffer.prototype.slice, value, [0]) as ArrayBuffer;
}

export function encodeXpbdPredictFrameParamsV1(input: XpbdPredictFrameParamsV1): ArrayBuffer {
  const dtS = positiveF32(input.dtS, 'dtS');
  const gravityMps2Y = finiteF32(input.gravityMps2Y, 'gravityMps2Y');
  const damping = finiteF32(input.damping, 'damping');
  const simulationSeconds = finiteF32(input.simulationSeconds, 'simulationSeconds');
  const particleCount = positiveU32(input.particleCount, 'particleCount');
  const distanceConstraintCount = positiveU32(
    input.distanceConstraintCount,
    'distanceConstraintCount',
  );
  const windAccelerationMps2Z = finiteF32(input.windAccelerationMps2Z, 'windAccelerationMps2Z');
  if (damping < 0 || damping > 1) throw new RangeError('damping must be within [0, 1].');
  if (simulationSeconds < 0) throw new RangeError('simulationSeconds must be non-negative.');
  const buffer = new ArrayBuffer(XPBD_PREDICT_FRAME_PARAMS_BYTES_V1);
  const view = new DataView(buffer);
  const offsets = XPBD_PREDICT_FRAME_PARAMS_OFFSETS_V1;
  view.setFloat32(offsets.dtS, dtS, true);
  view.setFloat32(offsets.gravityMps2Y, gravityMps2Y, true);
  view.setFloat32(offsets.damping, damping, true);
  view.setFloat32(offsets.simulationSeconds, simulationSeconds, true);
  view.setUint32(offsets.particleCount, particleCount, true);
  view.setUint32(offsets.distanceConstraintCount, distanceConstraintCount, true);
  view.setFloat32(offsets.windAccelerationMps2Z, windAccelerationMps2Z, true);
  view.setUint32(offsets.reservedZero, 0, true);
  return buffer;
}

export function decodeXpbdPredictFrameParamsV1(buffer: ArrayBuffer): XpbdPredictFrameParamsV1 {
  const owned = snapshotNativeBuffer(buffer);
  const view = new DataView(owned);
  const offsets = XPBD_PREDICT_FRAME_PARAMS_OFFSETS_V1;
  if (view.getUint32(offsets.reservedZero, true) !== 0)
    throw new Error('Predict frame params reserved word must be canonical zero.');
  const decoded = Object.freeze({
    dtS: view.getFloat32(offsets.dtS, true),
    gravityMps2Y: view.getFloat32(offsets.gravityMps2Y, true),
    damping: view.getFloat32(offsets.damping, true),
    simulationSeconds: view.getFloat32(offsets.simulationSeconds, true),
    particleCount: view.getUint32(offsets.particleCount, true),
    distanceConstraintCount: view.getUint32(offsets.distanceConstraintCount, true),
    windAccelerationMps2Z: view.getFloat32(offsets.windAccelerationMps2Z, true),
  });
  const canonical = encodeXpbdPredictFrameParamsV1(decoded);
  if (!new Uint8Array(canonical).every((value, index) => value === new Uint8Array(owned)[index]))
    throw new Error('Predict frame params are not canonical.');
  return decoded;
}

export function xpbdPredictWorkgroupsV1(particleCount: number): number {
  return Math.ceil(positiveU32(particleCount, 'particleCount') / XPBD_PREDICT_WORKGROUP_SIZE_V1);
}

export function validateXpbdPredictBufferContractV1(
  resources: Readonly<{
    positionsMInvMassKg: Readonly<{ size: number; usage: number }>;
    previousPositionsMInvMassKg: Readonly<{ size: number; usage: number }>;
    velocitiesMps: Readonly<{ size: number; usage: number }>;
    restPositionsMInvMassKg: Readonly<{ size: number; usage: number }>;
    frameParams: Readonly<{ size: number; usage: number }>;
  }>,
  particleCount: number,
): void {
  const exactBytes = positiveU32(particleCount, 'particleCount') * 16;
  for (const name of [
    'positionsMInvMassKg',
    'previousPositionsMInvMassKg',
    'velocitiesMps',
    'restPositionsMInvMassKg',
  ] as const) {
    const resource = resources[name];
    if (resource.size !== exactBytes || (resource.usage & STORAGE) === 0)
      throw new RangeError(`${name} size or storage usage is invalid.`);
  }
  if (
    resources.frameParams.size !== XPBD_PREDICT_FRAME_PARAMS_BYTES_V1 ||
    resources.frameParams.usage !== UNIFORM_COPY_DST
  )
    throw new RangeError('frameParams size or exact usage is invalid.');
}

export const XPBD_PREDICT_WGSL_V1 = /* wgsl */ `
struct FrameParams {
  dtS: f32,
  gravityMps2Y: f32,
  damping: f32,
  simulationSeconds: f32,
  particleCount: u32,
  distanceConstraintCount: u32,
  windAccelerationMps2Z: f32,
  reservedZero: u32,
};
@group(0) @binding(0) var<storage, read_write> positionsMInvMassKg: array<vec4<f32>>;
@group(0) @binding(1) var<storage, read_write> previousPositionsMInvMassKg: array<vec4<f32>>;
@group(0) @binding(2) var<storage, read_write> velocitiesMps: array<vec4<f32>>;
@group(0) @binding(3) var<storage, read> restPositionsMInvMassKg: array<vec4<f32>>;
@group(0) @binding(4) var<uniform> params: FrameParams;

fn finiteScalar(value: f32) -> bool { return value == value && abs(value) < 1.0e30; }
fn finiteVector(value: vec4<f32>) -> bool {
  return all(value == value) && all(abs(value) < vec4<f32>(1.0e30));
}
fn exactDispatchExtent(numWorkgroups: vec3<u32>) -> bool {
  let expectedX = params.particleCount / 64u +
    select(0u, 1u, params.particleCount % 64u != 0u);
  return params.particleCount > 0u &&
    all(numWorkgroups == vec3<u32>(expectedX, 1u, 1u));
}
fn paramsAndBuffersAreExact() -> bool {
  return finiteScalar(params.dtS) && params.dtS > 0.0 &&
    finiteScalar(params.gravityMps2Y) && finiteScalar(params.damping) &&
    params.damping >= 0.0 && params.damping <= 1.0 &&
    finiteScalar(params.simulationSeconds) && params.simulationSeconds >= 0.0 &&
    params.distanceConstraintCount > 0u && finiteScalar(params.windAccelerationMps2Z) &&
    params.reservedZero == 0u &&
    arrayLength(&positionsMInvMassKg) == params.particleCount &&
    arrayLength(&previousPositionsMInvMassKg) == params.particleCount &&
    arrayLength(&velocitiesMps) == params.particleCount &&
    arrayLength(&restPositionsMInvMassKg) == params.particleCount;
}

@compute @workgroup_size(64)
fn ${XPBD_PREDICT_ENTRY_POINT_V1}(
    @builtin(global_invocation_id) invocation: vec3<u32>,
    @builtin(num_workgroups) numWorkgroups: vec3<u32>) {
  if (!exactDispatchExtent(numWorkgroups) || !paramsAndBuffersAreExact()) { return; }
  let index = invocation.x;
  if (index >= params.particleCount) { return; }
  let rest = restPositionsMInvMassKg[index];
  let current = positionsMInvMassKg[index];
  let packedVelocity = velocitiesMps[index];
  if (!finiteVector(rest) || rest.w < 0.0 || !finiteVector(current) || current.w < 0.0 ||
      !finiteVector(packedVelocity)) { return; }
  if (rest.w == 0.0) {
    positionsMInvMassKg[index] = rest;
    previousPositionsMInvMassKg[index] = rest;
    velocitiesMps[index] = vec4<f32>(0.0);
    return;
  }
  previousPositionsMInvMassKg[index] = current;
  var velocity = packedVelocity.xyz;
  let wind = params.windAccelerationMps2Z *
    sin(params.simulationSeconds * 0.9 + current.y * 11.0);
  velocity += vec3<f32>(0.0, params.gravityMps2Y, wind) * params.dtS;
  let predicted = current.xyz + velocity * params.dtS;
  if (!all(velocity == velocity) || any(abs(velocity) >= vec3<f32>(1.0e30)) ||
      !all(predicted == predicted) || any(abs(predicted) >= vec3<f32>(1.0e30))) { return; }
  positionsMInvMassKg[index] = vec4<f32>(predicted, current.w);
  velocitiesMps[index] = vec4<f32>(velocity, 0.0);
}
`.trim();

export const XPBD_PREDICT_SOURCE_SHA256_V1 =
  '8780f65de8a70764de00ee0ec0d482c80537c8e292d1ac44563db2f6ea903af9' as const;

function hex(bytes: Uint8Array): string {
  return Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('');
}

export async function hashXpbdPredictSourceV1(
  source: string,
  options: Readonly<{ crypto?: Pick<Crypto, 'subtle'> | null }> = {},
): Promise<string> {
  const crypto = Object.prototype.hasOwnProperty.call(options, 'crypto')
    ? options.crypto
    : globalThis.crypto;
  if (!crypto?.subtle) throw new Error('XPBD predict V1 requires Web Crypto SHA-256.');
  const encoded = new TextEncoder().encode(source);
  const owned = new Uint8Array(encoded.byteLength);
  owned.set(encoded);
  return hex(new Uint8Array(await crypto.subtle.digest('SHA-256', owned.buffer)));
}

export async function getXpbdPredictPipelineIdentityV1(
  options: Readonly<{ crypto?: Pick<Crypto, 'subtle'> | null }> = {},
) {
  const sha256 = await hashXpbdPredictSourceV1(XPBD_PREDICT_WGSL_V1, options);
  if (sha256 !== XPBD_PREDICT_SOURCE_SHA256_V1)
    throw new Error('XPBD predict source differs from its pinned identity.');
  return Object.freeze({ sha256, entryPoint: XPBD_PREDICT_ENTRY_POINT_V1 });
}

export function xpbdPredictShaderDescriptorV1(): GPUShaderModuleDescriptor {
  return { label: 'XPBD predict V1', code: XPBD_PREDICT_WGSL_V1 };
}
