/* global GPUShaderModuleDescriptor */

export const XPBD_DISTANCE_KERNEL_V1 = 'xpbd-distance-kernel/v1' as const;
export const XPBD_DISTANCE_SOURCE_REVISION_V1 = 'xpbd-distance-kernel-wgsl/1' as const;
export const XPBD_DISTANCE_ENTRY_POINT_V1 = 'solveXpbdDistanceColorV1' as const;
export const XPBD_DISTANCE_WORKGROUP_SIZE_V1 = 64;
export const XPBD_DISTANCE_COLOR_PARAMS_BYTES_V1 = 16;

const UINT32_MAX = 0xffff_ffff;
const STORAGE = 0x0080;
const UNIFORM_COPY_DST = 0x0048;

export const XPBD_DISTANCE_COLOR_PARAMS_OFFSETS_V1 = Object.freeze({
  constraintOffset: 0,
  constraintCount: 4,
  complianceMPerN: 8,
  dtS: 12,
} as const);

export const XPBD_DISTANCE_ABI_V1 = Object.freeze({
  version: XPBD_DISTANCE_KERNEL_V1,
  sourceRevision: XPBD_DISTANCE_SOURCE_REVISION_V1,
  entryPoint: XPBD_DISTANCE_ENTRY_POINT_V1,
  workgroupSize: XPBD_DISTANCE_WORKGROUP_SIZE_V1,
  dispatch: Object.freeze({
    perColor: true,
    x: 'ceil-exact-color-constraint-count-over-64',
    y: 1,
    z: 1,
    exactNumWorkgroupsGuard: true,
    colorsMustRemainSeparateDispatches: true,
  }),
  bindings: Object.freeze({
    positionsMInvMassKg: Object.freeze({
      binding: 0,
      resource: 'storage',
      access: 'read_write',
      strideBytes: 16,
      requiredUsage: STORAGE,
    }),
    vertexPairs: Object.freeze({
      binding: 1,
      resource: 'storage',
      access: 'read',
      strideBytes: 8,
      requiredUsage: STORAGE,
    }),
    restLengthsM: Object.freeze({
      binding: 2,
      resource: 'storage',
      access: 'read',
      strideBytes: 4,
      requiredUsage: STORAGE,
    }),
    lambdasKgM: Object.freeze({
      binding: 3,
      resource: 'storage',
      access: 'read_write',
      strideBytes: 4,
      requiredUsage: STORAGE,
    }),
    colorParams: Object.freeze({
      binding: 4,
      resource: 'uniform',
      access: 'uniform',
      sizeBytes: XPBD_DISTANCE_COLOR_PARAMS_BYTES_V1,
      exactUsage: UNIFORM_COPY_DST,
    }),
  }),
  bindingCounts: Object.freeze({ storage: 4, uniform: 1, total: 5 }),
  colorSchedule: Object.freeze({
    authority: 'sealed-v5-static-resource-manifest-distance-color-ranges',
    graphInvariant: 'no-particle-is-written-by-two-constraints-in-one-color-dispatch',
    dispatchOrder: 'ascending-canonical-color-ordinal',
    '2k': Object.freeze({ colorCount: 6 }),
    '5k': Object.freeze({ colorCount: 6 }),
  }),
  resetDependency: Object.freeze({
    module: 'xpbd-initialization-core-reset/v1',
    entryPoint: 'main',
    schedule: 'once-before-distance-colors-per-substep',
  }),
  source: 'extracted-and-hardened-from-xpbd-spike-distance',
  runtimeIntegrated: false,
  runnable: false,
  promotionEligible: false,
  blockers: Object.freeze([
    'private-full-frame-owner-not-integrated',
    'pipeline-identity-not-owner-allowlisted',
    'sealed-color-bind-groups-not-owner-bound',
    'exact-color-dispatch-order-not-owner-bound',
    'browser-compile-and-bind-evidence-not-recorded',
  ] as const),
} as const);

export type XpbdDistanceColorParamsV1 = Readonly<{
  constraintOffset: number;
  constraintCount: number;
  complianceMPerN: number;
  dtS: number;
}>;

function u32(value: number, label: string, positive = false): number {
  if (
    !Number.isSafeInteger(value) ||
    Object.is(value, -0) ||
    value < (positive ? 1 : 0) ||
    value > UINT32_MAX
  )
    throw new RangeError(`${label} must be ${positive ? 'a positive' : 'a non-negative'} u32.`);
  return value;
}

function canonicalNonnegativeF32(value: number, label: string): number {
  const rounded = Math.fround(value);
  if (!Number.isFinite(rounded) || rounded < 0 || Object.is(rounded, -0) || rounded >= 1e30)
    throw new RangeError(`${label} must be a canonical finite non-negative bounded f32.`);
  return rounded;
}

function positiveF32(value: number, label: string): number {
  const rounded = Math.fround(value);
  if (!Number.isFinite(rounded) || rounded <= 0 || rounded >= 1e30)
    throw new RangeError(`${label} must be a finite positive bounded f32.`);
  return rounded;
}

function nativeParamsSnapshot(value: unknown): ArrayBuffer {
  if (
    typeof value !== 'object' ||
    value === null ||
    Object.getPrototypeOf(value) !== ArrayBuffer.prototype ||
    Reflect.ownKeys(value).length !== 0
  )
    throw new TypeError('Distance color params must be a native non-shared ArrayBuffer.');
  const getter = Object.getOwnPropertyDescriptor(ArrayBuffer.prototype, 'byteLength')!.get!;
  let byteLength: number;
  try {
    byteLength = Reflect.apply(getter, value, []) as number;
  } catch {
    throw new TypeError('Distance color params must be a native non-shared ArrayBuffer.');
  }
  if (byteLength !== XPBD_DISTANCE_COLOR_PARAMS_BYTES_V1)
    throw new RangeError('Distance color params must be exactly 16 bytes.');
  return Reflect.apply(ArrayBuffer.prototype.slice, value, [0]) as ArrayBuffer;
}

export function encodeXpbdDistanceColorParamsV1(input: XpbdDistanceColorParamsV1): ArrayBuffer {
  const constraintOffset = u32(input.constraintOffset, 'constraintOffset');
  const constraintCount = u32(input.constraintCount, 'constraintCount', true);
  if (constraintOffset > UINT32_MAX - constraintCount)
    throw new RangeError('Distance color range overflows u32.');
  const complianceMPerN = canonicalNonnegativeF32(input.complianceMPerN, 'complianceMPerN');
  const dtS = positiveF32(input.dtS, 'dtS');
  const buffer = new ArrayBuffer(XPBD_DISTANCE_COLOR_PARAMS_BYTES_V1);
  const view = new DataView(buffer);
  const offsets = XPBD_DISTANCE_COLOR_PARAMS_OFFSETS_V1;
  view.setUint32(offsets.constraintOffset, constraintOffset, true);
  view.setUint32(offsets.constraintCount, constraintCount, true);
  view.setFloat32(offsets.complianceMPerN, complianceMPerN, true);
  view.setFloat32(offsets.dtS, dtS, true);
  return buffer;
}

export function decodeXpbdDistanceColorParamsV1(buffer: ArrayBuffer): XpbdDistanceColorParamsV1 {
  const owned = nativeParamsSnapshot(buffer);
  const view = new DataView(owned);
  const offsets = XPBD_DISTANCE_COLOR_PARAMS_OFFSETS_V1;
  const decoded = Object.freeze({
    constraintOffset: view.getUint32(offsets.constraintOffset, true),
    constraintCount: view.getUint32(offsets.constraintCount, true),
    complianceMPerN: view.getFloat32(offsets.complianceMPerN, true),
    dtS: view.getFloat32(offsets.dtS, true),
  });
  const canonical = encodeXpbdDistanceColorParamsV1(decoded);
  const source = new Uint8Array(owned);
  if (!new Uint8Array(canonical).every((value, index) => value === source[index]))
    throw new Error('Distance color params are not canonical.');
  return decoded;
}

export function xpbdDistanceColorWorkgroupsV1(constraintCount: number): number {
  return Math.ceil(u32(constraintCount, 'constraintCount', true) / XPBD_DISTANCE_WORKGROUP_SIZE_V1);
}

export function validateXpbdDistanceBufferContractV1(
  resources: Readonly<{
    positionsMInvMassKg: Readonly<{ size: number; usage: number }>;
    vertexPairs: Readonly<{ size: number; usage: number }>;
    restLengthsM: Readonly<{ size: number; usage: number }>;
    lambdasKgM: Readonly<{ size: number; usage: number }>;
    colorParams: Readonly<{ size: number; usage: number }>;
  }>,
  counts: Readonly<{ particleCount: number; constraintCount: number }>,
): void {
  const particleCount = u32(counts.particleCount, 'particleCount', true);
  const constraintCount = u32(counts.constraintCount, 'constraintCount', true);
  const expectedSizes = Object.freeze({
    positionsMInvMassKg: particleCount * 16,
    vertexPairs: constraintCount * 8,
    restLengthsM: constraintCount * 4,
    lambdasKgM: constraintCount * 4,
  });
  for (const name of Object.keys(expectedSizes) as Array<keyof typeof expectedSizes>) {
    const resource = resources[name];
    if (resource.size !== expectedSizes[name] || (resource.usage & STORAGE) === 0)
      throw new RangeError(`${name} size or storage usage is invalid.`);
  }
  if (
    resources.colorParams.size !== XPBD_DISTANCE_COLOR_PARAMS_BYTES_V1 ||
    resources.colorParams.usage !== UNIFORM_COPY_DST
  )
    throw new RangeError('colorParams size or exact usage is invalid.');
}

export type XpbdDistanceConstraintOracleInputV1 = Readonly<{
  first: readonly [number, number, number, number];
  second: readonly [number, number, number, number];
  restLengthM: number;
  previousLambdaKgM: number;
  complianceMPerN: number;
  dtS: number;
}>;

export function solveXpbdDistanceConstraintV1ForOracle(
  input: XpbdDistanceConstraintOracleInputV1,
): Readonly<{
  first: readonly [number, number, number, number];
  second: readonly [number, number, number, number];
  lambdaKgM: number;
  applied: boolean;
}> {
  const values = [...input.first, ...input.second];
  if (values.some((value) => !Number.isFinite(value) || Math.abs(value) >= 1e30))
    throw new RangeError('Distance oracle particles must contain finite bounded values.');
  if (input.first[3] < 0 || input.second[3] < 0)
    throw new RangeError('Distance oracle inverse masses must be non-negative.');
  const restLengthM = positiveF32(input.restLengthM, 'restLengthM');
  const complianceMPerN = canonicalNonnegativeF32(input.complianceMPerN, 'complianceMPerN');
  const dtS = positiveF32(input.dtS, 'dtS');
  if (!Number.isFinite(input.previousLambdaKgM) || Math.abs(input.previousLambdaKgM) >= 1e30)
    throw new RangeError('previousLambdaKgM must be finite and bounded.');
  const weight = input.first[3] + input.second[3];
  const delta = [
    input.second[0] - input.first[0],
    input.second[1] - input.first[1],
    input.second[2] - input.first[2],
  ] as const;
  const length = Math.hypot(...delta);
  if (weight <= 0 || length <= 1e-8)
    return Object.freeze({
      first: Object.freeze([...input.first]) as unknown as readonly [
        number,
        number,
        number,
        number,
      ],
      second: Object.freeze([...input.second]) as unknown as readonly [
        number,
        number,
        number,
        number,
      ],
      lambdaKgM: input.previousLambdaKgM,
      applied: false,
    });
  const alpha = complianceMPerN / (dtS * dtS);
  const deltaLambda =
    (-(length - restLengthM) - alpha * input.previousLambdaKgM) / (weight + alpha);
  const lambdaKgM = input.previousLambdaKgM + deltaLambda;
  const scale = deltaLambda / length;
  const correction = delta.map((value) => value * scale);
  const first = Object.freeze([
    input.first[0] - input.first[3] * correction[0]!,
    input.first[1] - input.first[3] * correction[1]!,
    input.first[2] - input.first[3] * correction[2]!,
    input.first[3],
  ]) as readonly [number, number, number, number];
  const second = Object.freeze([
    input.second[0] + input.second[3] * correction[0]!,
    input.second[1] + input.second[3] * correction[1]!,
    input.second[2] + input.second[3] * correction[2]!,
    input.second[3],
  ]) as readonly [number, number, number, number];
  if (![...first, ...second, lambdaKgM].every(Number.isFinite))
    throw new Error('Distance oracle produced a non-finite result.');
  return Object.freeze({ first, second, lambdaKgM, applied: true });
}

export const XPBD_DISTANCE_WGSL_V1 = /* wgsl */ `
struct ConstraintParams {
  constraintOffset: u32,
  constraintCount: u32,
  complianceMPerN: f32,
  dtS: f32,
};
@group(0) @binding(0) var<storage, read_write> positionsMInvMassKg: array<vec4<f32>>;
@group(0) @binding(1) var<storage, read> vertexPairs: array<vec2<u32>>;
@group(0) @binding(2) var<storage, read> restLengthsM: array<f32>;
@group(0) @binding(3) var<storage, read_write> lambdasKgM: array<f32>;
@group(0) @binding(4) var<uniform> params: ConstraintParams;

fn finiteScalar(value: f32) -> bool { return value == value && abs(value) < 1.0e30; }
fn finiteVector(value: vec4<f32>) -> bool {
  return all(value == value) && all(abs(value) < vec4<f32>(1.0e30));
}
fn exactDispatchExtent(numWorkgroups: vec3<u32>) -> bool {
  let expectedX = params.constraintCount / 64u +
    select(0u, 1u, params.constraintCount % 64u != 0u);
  return params.constraintCount > 0u &&
    all(numWorkgroups == vec3<u32>(expectedX, 1u, 1u));
}
fn paramsAndBuffersAreExact() -> bool {
  let rangeDoesNotOverflow = params.constraintOffset <= 0xffffffffu - params.constraintCount;
  let end = params.constraintOffset + params.constraintCount;
  return rangeDoesNotOverflow && finiteScalar(params.complianceMPerN) &&
    params.complianceMPerN >= 0.0 && finiteScalar(params.dtS) && params.dtS > 0.0 &&
    arrayLength(&vertexPairs) == arrayLength(&restLengthsM) &&
    arrayLength(&vertexPairs) == arrayLength(&lambdasKgM) && end <= arrayLength(&vertexPairs);
}

@compute @workgroup_size(64)
fn ${XPBD_DISTANCE_ENTRY_POINT_V1}(
    @builtin(global_invocation_id) invocation: vec3<u32>,
    @builtin(num_workgroups) numWorkgroups: vec3<u32>) {
  if (!exactDispatchExtent(numWorkgroups) || !paramsAndBuffersAreExact()) { return; }
  let localIndex = invocation.x;
  if (localIndex >= params.constraintCount) { return; }
  let constraintIndex = params.constraintOffset + localIndex;
  let pair = vertexPairs[constraintIndex];
  if (pair.x == pair.y || pair.x >= arrayLength(&positionsMInvMassKg) ||
      pair.y >= arrayLength(&positionsMInvMassKg)) { return; }
  let first = positionsMInvMassKg[pair.x];
  let second = positionsMInvMassKg[pair.y];
  let restLengthM = restLengthsM[constraintIndex];
  let previousLambdaKgM = lambdasKgM[constraintIndex];
  if (!finiteVector(first) || !finiteVector(second) || first.w < 0.0 || second.w < 0.0 ||
      !finiteScalar(restLengthM) || restLengthM <= 0.0 ||
      !finiteScalar(previousLambdaKgM)) { return; }
  let weight = first.w + second.w;
  if (!finiteScalar(weight) || weight <= 0.0) { return; }
  let delta = second.xyz - first.xyz;
  let distanceM = length(delta);
  if (!finiteScalar(distanceM) || distanceM <= 0.00000001) { return; }
  let constraintValueM = distanceM - restLengthM;
  let alphaKg = params.complianceMPerN / (params.dtS * params.dtS);
  let denominator = weight + alphaKg;
  let deltaLambdaKgM =
    (-constraintValueM - alphaKg * previousLambdaKgM) / denominator;
  let lambdaKgM = previousLambdaKgM + deltaLambdaKgM;
  let correctionM = delta * (deltaLambdaKgM / distanceM);
  let firstPositionM = first.xyz - first.w * correctionM;
  let secondPositionM = second.xyz + second.w * correctionM;
  if (!finiteScalar(alphaKg) || !finiteScalar(denominator) || denominator <= 0.0 ||
      !finiteScalar(deltaLambdaKgM) || !finiteScalar(lambdaKgM) ||
      !all(firstPositionM == firstPositionM) ||
      any(abs(firstPositionM) >= vec3<f32>(1.0e30)) ||
      !all(secondPositionM == secondPositionM) ||
      any(abs(secondPositionM) >= vec3<f32>(1.0e30))) { return; }
  lambdasKgM[constraintIndex] = select(lambdaKgM, 0.0, lambdaKgM == 0.0);
  positionsMInvMassKg[pair.x] = vec4<f32>(firstPositionM, first.w);
  positionsMInvMassKg[pair.y] = vec4<f32>(secondPositionM, second.w);
}
`.trim();

export const XPBD_DISTANCE_SOURCE_SHA256_V1 =
  '18772bed9df3f3f5f76fd3a0c2b917573d61ccbff3a35d553e054749c0f3ae43' as const;

function hex(bytes: Uint8Array): string {
  return Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('');
}

export async function hashXpbdDistanceSourceV1(
  source: string,
  options: Readonly<{ crypto?: Pick<Crypto, 'subtle'> | null }> = {},
): Promise<string> {
  const crypto = Object.prototype.hasOwnProperty.call(options, 'crypto')
    ? options.crypto
    : globalThis.crypto;
  if (!crypto?.subtle) throw new Error('XPBD distance V1 requires Web Crypto SHA-256.');
  const encoded = new TextEncoder().encode(source);
  const owned = new Uint8Array(encoded.byteLength);
  owned.set(encoded);
  return hex(new Uint8Array(await crypto.subtle.digest('SHA-256', owned.buffer)));
}

export async function getXpbdDistancePipelineIdentityV1(
  options: Readonly<{ crypto?: Pick<Crypto, 'subtle'> | null }> = {},
) {
  const sha256 = await hashXpbdDistanceSourceV1(XPBD_DISTANCE_WGSL_V1, options);
  if (sha256 !== XPBD_DISTANCE_SOURCE_SHA256_V1)
    throw new Error('XPBD distance source differs from its pinned identity.');
  return Object.freeze({ sha256, entryPoint: XPBD_DISTANCE_ENTRY_POINT_V1 });
}

export function xpbdDistanceShaderDescriptorV1(): GPUShaderModuleDescriptor {
  return { label: 'XPBD distance V1', code: XPBD_DISTANCE_WGSL_V1 };
}
