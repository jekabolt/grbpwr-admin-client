/* global GPUShaderModuleDescriptor */

export const XPBD_SEAM_SOLVE_KERNEL_V1 = 'xpbd-seam-solve-kernel/v1' as const;
export const XPBD_SEAM_SOLVE_SOURCE_REVISION_V1 = 'xpbd-seam-solve-wgsl/1' as const;
export const XPBD_SEAM_SOLVE_ENTRY_POINT_V1 = 'solveXpbdSeamColorV1' as const;
export const XPBD_SEAM_SOLVE_WORKGROUP_SIZE_V1 = 64;
export const XPBD_SEAM_SOLVE_COLOR_PARAMS_BYTES_V1 = 16;
export const XPBD_SEAM_SOLVE_ACTIVATION_PARAMS_BYTES_V1 = 16;

const STORAGE = 0x0080;
const UNIFORM = 0x0040;
const COPY_DST = 0x0008;
const UINT32_MAX = 0xffff_ffff;

export const XPBD_SEAM_SOLVE_ABI_V1 = Object.freeze({
  version: XPBD_SEAM_SOLVE_KERNEL_V1,
  sourceRevision: XPBD_SEAM_SOLVE_SOURCE_REVISION_V1,
  entryPoint: XPBD_SEAM_SOLVE_ENTRY_POINT_V1,
  workgroupSize: XPBD_SEAM_SOLVE_WORKGROUP_SIZE_V1,
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
    targetLengthsM: Object.freeze({
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
    activationRanks: Object.freeze({
      binding: 4,
      resource: 'storage',
      access: 'read',
      strideBytes: 4,
      requiredUsage: STORAGE,
    }),
    colorParams: Object.freeze({
      binding: 5,
      resource: 'uniform',
      access: 'uniform',
      sizeBytes: XPBD_SEAM_SOLVE_COLOR_PARAMS_BYTES_V1,
      exactUsage: UNIFORM | COPY_DST,
    }),
    activationParams: Object.freeze({
      binding: 6,
      resource: 'uniform',
      access: 'uniform',
      sizeBytes: XPBD_SEAM_SOLVE_ACTIVATION_PARAMS_BYTES_V1,
      exactUsage: UNIFORM | COPY_DST,
    }),
  }),
  bindingCounts: Object.freeze({ storage: 5, uniform: 2, total: 7 }),
  colorParamsOffsets: Object.freeze({
    constraintOffset: 0,
    constraintCount: 4,
    reserved0: 8,
    reserved1: 12,
  }),
  activationParamsOffsets: Object.freeze({
    totalConstraintCount: 0,
    activeConstraintCount: 4,
    complianceMPerN: 8,
    dtS: 12,
  }),
  schedule: Object.freeze({
    dispatchPerColor: true,
    colorOrder: 'strictly-increasing-color-index',
    workgroups: 'ceil-exact-color-count-over-64-by-1-by-1',
    adjacentSamePipelineColorsMayNotBeMerged: true,
    seamClosureReusesSameLambdas: true,
  }),
  extraction: Object.freeze({
    source: 'xpbd-spike embedded seam scalar XPBD semantics',
    importsRuntimeObjectsFromSpike: false,
  }),
  runtimeIntegrated: false,
  runnable: false,
  promotionEligible: false,
  blockers: Object.freeze([
    'private-full-frame-owner-not-integrated',
    'pipeline-identity-not-owner-allowlisted',
    'per-color-bind-groups-not-private-owner-bound',
    'exact-color-dispatch-order-not-owner-sealed',
    'same-frame-seam-gap-consumer-chronology-not-owner-bound',
    'browser-compile-and-bind-evidence-not-recorded',
  ] as const),
} as const);

export type XpbdSeamSolveColorRangeV1 = Readonly<{
  color: number;
  constraintOffset: number;
  constraintCount: number;
  workgroups: number;
}>;

export type XpbdSeamSolveScheduleInputV1 = Readonly<{
  particleCount: number;
  totalConstraintCount: number;
  activeConstraintCount: number;
  complianceMPerN: number;
  dtS: number;
  vertexPairs: Uint32Array;
  targetLengthsM: Float32Array;
  lambdasKgM: Float32Array;
  activationRanks: Uint32Array;
  colorRanges: Uint32Array;
}>;

function positiveU32(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value < 1 || value > UINT32_MAX)
    throw new RangeError(`${label} must be a positive u32.`);
  return value;
}

function nonNegativeU32(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || Object.is(value, -0) || value < 0 || value > UINT32_MAX)
    throw new RangeError(`${label} must be a non-negative u32.`);
  return value;
}

function canonicalF32(value: number, label: string, positive: boolean): number {
  if (!Number.isFinite(value) || value < (positive ? Number.MIN_VALUE : 0))
    throw new RangeError(`${label} must be finite and ${positive ? 'positive' : 'non-negative'}.`);
  const rounded = Math.fround(value);
  if (!Number.isFinite(rounded) || rounded < (positive ? Number.MIN_VALUE : 0))
    throw new RangeError(`${label} is not representable in the required f32 domain.`);
  return rounded === 0 ? 0 : rounded;
}

export function packXpbdSeamSolveColorParamsV1(
  constraintOffset: number,
  constraintCount: number,
): ArrayBuffer {
  const offset = nonNegativeU32(constraintOffset, 'constraintOffset');
  const count = positiveU32(constraintCount, 'constraintCount');
  if (offset + count > UINT32_MAX) throw new RangeError('Seam color range must not overflow u32.');
  const buffer = new ArrayBuffer(XPBD_SEAM_SOLVE_COLOR_PARAMS_BYTES_V1);
  const view = new DataView(buffer);
  view.setUint32(0, offset, true);
  view.setUint32(4, count, true);
  return buffer;
}

export function packXpbdSeamSolveActivationParamsV1(
  input: Readonly<{
    totalConstraintCount: number;
    activeConstraintCount: number;
    complianceMPerN: number;
    dtS: number;
  }>,
): ArrayBuffer {
  const total = positiveU32(input.totalConstraintCount, 'totalConstraintCount');
  const active = nonNegativeU32(input.activeConstraintCount, 'activeConstraintCount');
  if (active > total) throw new RangeError('activeConstraintCount must not exceed total.');
  const compliance = canonicalF32(input.complianceMPerN, 'complianceMPerN', false);
  const dt = canonicalF32(input.dtS, 'dtS', true);
  const buffer = new ArrayBuffer(XPBD_SEAM_SOLVE_ACTIVATION_PARAMS_BYTES_V1);
  const view = new DataView(buffer);
  view.setUint32(0, total, true);
  view.setUint32(4, active, true);
  view.setFloat32(8, compliance, true);
  view.setFloat32(12, dt, true);
  return buffer;
}

function exactTypedArray<T extends Uint32Array | Float32Array>(
  value: T,
  constructor: Uint32ArrayConstructor | Float32ArrayConstructor,
  label: string,
): void {
  if (Object.getPrototypeOf(value) !== constructor.prototype)
    throw new TypeError(`${label} must be a native unshadowed ${constructor.name}.`);
}

export function createXpbdSeamSolveColorScheduleV1(
  input: XpbdSeamSolveScheduleInputV1,
): readonly XpbdSeamSolveColorRangeV1[] {
  const particleCount = positiveU32(input.particleCount, 'particleCount');
  const total = positiveU32(input.totalConstraintCount, 'totalConstraintCount');
  const active = nonNegativeU32(input.activeConstraintCount, 'activeConstraintCount');
  if (active > total) throw new RangeError('activeConstraintCount must not exceed total.');
  canonicalF32(input.complianceMPerN, 'complianceMPerN', false);
  canonicalF32(input.dtS, 'dtS', true);
  exactTypedArray(input.vertexPairs, Uint32Array, 'vertexPairs');
  exactTypedArray(input.targetLengthsM, Float32Array, 'targetLengthsM');
  exactTypedArray(input.lambdasKgM, Float32Array, 'lambdasKgM');
  exactTypedArray(input.activationRanks, Uint32Array, 'activationRanks');
  exactTypedArray(input.colorRanges, Uint32Array, 'colorRanges');
  if (
    input.vertexPairs.length !== total * 2 ||
    input.targetLengthsM.length !== total ||
    input.lambdasKgM.length !== total ||
    input.activationRanks.length !== total ||
    input.colorRanges.length === 0 ||
    input.colorRanges.length % 2 !== 0
  )
    throw new RangeError('Seam solve buffers disagree with the sealed counts.');
  if (input.targetLengthsM.some((value) => !Number.isFinite(value) || value < 0))
    throw new RangeError('Seam target lengths must be finite and non-negative.');
  if (input.lambdasKgM.some((value) => !Number.isFinite(value)))
    throw new RangeError('Seam lambdas must be finite.');
  const ranks = new Set<number>();
  input.activationRanks.forEach((rank) => {
    if (rank >= total || ranks.has(rank))
      throw new RangeError('Seam activation ranks must be an exact permutation.');
    ranks.add(rank);
  });
  const result: XpbdSeamSolveColorRangeV1[] = [];
  let expectedOffset = 0;
  for (let color = 0; color < input.colorRanges.length / 2; color += 1) {
    const offset = input.colorRanges[color * 2]!;
    const count = input.colorRanges[color * 2 + 1]!;
    if (offset !== expectedOffset || count === 0 || offset + count > total)
      throw new RangeError('Seam color ranges must be non-empty, contiguous, and in bounds.');
    const written = new Set<number>();
    for (let index = offset; index < offset + count; index += 1) {
      const first = input.vertexPairs[index * 2]!;
      const second = input.vertexPairs[index * 2 + 1]!;
      if (first >= particleCount || second >= particleCount || first === second)
        throw new RangeError('Seam pair must reference two distinct in-range particles.');
      if (written.has(first) || written.has(second))
        throw new RangeError('Seam constraints in one color must not share a particle.');
      written.add(first);
      written.add(second);
    }
    result.push(
      Object.freeze({
        color,
        constraintOffset: offset,
        constraintCount: count,
        workgroups: Math.ceil(count / XPBD_SEAM_SOLVE_WORKGROUP_SIZE_V1),
      }),
    );
    expectedOffset += count;
  }
  if (expectedOffset !== total) throw new RangeError('Seam colors must cover every constraint.');
  return Object.freeze(result);
}

export function validateXpbdSeamSolveBufferContractV1(
  resources: Readonly<{
    positionsMInvMassKg: Readonly<{ size: number; usage: number }>;
    vertexPairs: Readonly<{ size: number; usage: number }>;
    targetLengthsM: Readonly<{ size: number; usage: number }>;
    lambdasKgM: Readonly<{ size: number; usage: number }>;
    activationRanks: Readonly<{ size: number; usage: number }>;
    colorParams: Readonly<{ size: number; usage: number }>;
    activationParams: Readonly<{ size: number; usage: number }>;
  }>,
  counts: Readonly<{ particleCount: number; constraintCount: number }>,
): void {
  const particleCount = positiveU32(counts.particleCount, 'particleCount');
  const constraintCount = positiveU32(counts.constraintCount, 'constraintCount');
  const dynamic = [
    ['positionsMInvMassKg', resources.positionsMInvMassKg, particleCount * 16],
    ['vertexPairs', resources.vertexPairs, constraintCount * 8],
    ['targetLengthsM', resources.targetLengthsM, constraintCount * 4],
    ['lambdasKgM', resources.lambdasKgM, constraintCount * 4],
    ['activationRanks', resources.activationRanks, constraintCount * 4],
  ] as const;
  for (const [name, actual, size] of dynamic)
    if (actual.size !== size || (actual.usage & STORAGE) === 0)
      throw new RangeError(`${name} size or required storage usage is invalid.`);
  for (const name of ['colorParams', 'activationParams'] as const) {
    const expected = XPBD_SEAM_SOLVE_ABI_V1.bindings[name];
    const actual = resources[name];
    if (actual.size !== expected.sizeBytes || actual.usage !== expected.exactUsage)
      throw new RangeError(`${name} size or exact usage is invalid.`);
  }
}

export const XPBD_SEAM_SOLVE_WGSL_V1 = /* wgsl */ `
struct ColorParams{constraintOffset:u32,constraintCount:u32,reserved0:u32,reserved1:u32,};
struct ActivationParams{totalConstraintCount:u32,activeConstraintCount:u32,complianceMPerN:f32,dtS:f32,};
@group(0) @binding(0) var<storage,read_write> positions:array<vec4<f32>>;
@group(0) @binding(1) var<storage,read> vertexPairs:array<vec2<u32>>;
@group(0) @binding(2) var<storage,read> targetLengths:array<f32>;
@group(0) @binding(3) var<storage,read_write> lambdas:array<f32>;
@group(0) @binding(4) var<storage,read> activationRanks:array<u32>;
@group(0) @binding(5) var<uniform> color:ColorParams;
@group(0) @binding(6) var<uniform> activation:ActivationParams;
fn finiteScalar(value:f32)->bool{return value==value&&abs(value)<1.0e30;}
fn finitePosition(value:vec4<f32>)->bool{return all(value==value)&&all(abs(value)<vec4<f32>(1.0e30))&&value.w>=0.0;}
fn exactDispatch(groups:vec3<u32>)->bool{let expected=color.constraintCount/64u+select(0u,1u,color.constraintCount%64u!=0u);return color.constraintCount>0u&&all(groups==vec3<u32>(expected,1u,1u));}
fn paramsOk()->bool{let end=color.constraintOffset+color.constraintCount;return color.reserved0==0u&&color.reserved1==0u&&activation.totalConstraintCount>0u&&activation.activeConstraintCount<=activation.totalConstraintCount&&color.constraintOffset<=end&&end<=activation.totalConstraintCount&&arrayLength(&vertexPairs)==activation.totalConstraintCount&&arrayLength(&targetLengths)==activation.totalConstraintCount&&arrayLength(&lambdas)==activation.totalConstraintCount&&arrayLength(&activationRanks)==activation.totalConstraintCount&&arrayLength(&positions)>0u&&finiteScalar(activation.complianceMPerN)&&activation.complianceMPerN>=0.0&&finiteScalar(activation.dtS)&&activation.dtS>0.0;}
@compute @workgroup_size(${XPBD_SEAM_SOLVE_WORKGROUP_SIZE_V1})
fn ${XPBD_SEAM_SOLVE_ENTRY_POINT_V1}(@builtin(global_invocation_id) invocation:vec3<u32>,@builtin(num_workgroups) groups:vec3<u32>){
  if(!exactDispatch(groups)||!paramsOk()){return;}
  let localIndex=invocation.x;if(localIndex>=color.constraintCount){return;}
  let constraintIndex=color.constraintOffset+localIndex;let rank=activationRanks[constraintIndex];if(rank>=activation.totalConstraintCount){return;}if(rank>=activation.activeConstraintCount){return;}
  let pair=vertexPairs[constraintIndex];if(pair.x==pair.y||pair.x>=arrayLength(&positions)||pair.y>=arrayLength(&positions)){return;}
  let first=positions[pair.x];let second=positions[pair.y];let targetLength=targetLengths[constraintIndex];let previousLambda=lambdas[constraintIndex];
  if(!finitePosition(first)||!finitePosition(second)||!finiteScalar(targetLength)||targetLength<0.0||!finiteScalar(previousLambda)){return;}
  let weight=first.w+second.w;if(!finiteScalar(weight)||weight<=0.0){return;}
  let delta=second.xyz-first.xyz;let currentLength=length(delta);if(!finiteScalar(currentLength)||currentLength<=0.00000001){return;}
  let alpha=activation.complianceMPerN/(activation.dtS*activation.dtS);let denominator=weight+alpha;if(!finiteScalar(alpha)||!finiteScalar(denominator)||denominator<=1.0e-12){return;}
  let constraintValue=currentLength-targetLength;let deltaLambda=(-constraintValue-alpha*previousLambda)/denominator;let nextLambda=previousLambda+deltaLambda;let correction=delta*(deltaLambda/currentLength);let nextFirst=first.xyz-first.w*correction;let nextSecond=second.xyz+second.w*correction;
  if(!finiteScalar(deltaLambda)||!finiteScalar(nextLambda)||!all(nextFirst==nextFirst)||!all(nextSecond==nextSecond)||any(abs(nextFirst)>=vec3<f32>(1.0e30))||any(abs(nextSecond)>=vec3<f32>(1.0e30))){return;}
  lambdas[constraintIndex]=nextLambda;positions[pair.x]=vec4<f32>(nextFirst,first.w);positions[pair.y]=vec4<f32>(nextSecond,second.w);
}`.trim();

export const XPBD_SEAM_SOLVE_SOURCE_SHA256_V1 =
  'fcccfe592abf88eabb585f19f583328a416c74afefdc48c59bb92e087be4e225' as const;

function hex(bytes: Uint8Array): string {
  return Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('');
}

export async function hashXpbdSeamSolveSourceV1(
  source: string,
  options: Readonly<{ crypto?: Pick<Crypto, 'subtle'> | null }> = {},
): Promise<string> {
  const crypto = Object.prototype.hasOwnProperty.call(options, 'crypto')
    ? options.crypto
    : globalThis.crypto;
  if (!crypto?.subtle) throw new Error('XPBD seam solve V1 requires Web Crypto SHA-256.');
  const bytes = new TextEncoder().encode(source);
  return hex(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)));
}

export async function getXpbdSeamSolvePipelineIdentityV1(
  options: Readonly<{ crypto?: Pick<Crypto, 'subtle'> | null }> = {},
) {
  const sha256 = await hashXpbdSeamSolveSourceV1(XPBD_SEAM_SOLVE_WGSL_V1, options);
  if (sha256 !== XPBD_SEAM_SOLVE_SOURCE_SHA256_V1)
    throw new Error('XPBD seam solve V1 source differs from its pinned identity.');
  return Object.freeze({ sha256, entryPoint: XPBD_SEAM_SOLVE_ENTRY_POINT_V1 });
}

export function xpbdSeamSolveShaderDescriptorV1(): GPUShaderModuleDescriptor {
  return { label: 'XPBD seam solve V1', code: XPBD_SEAM_SOLVE_WGSL_V1 };
}
