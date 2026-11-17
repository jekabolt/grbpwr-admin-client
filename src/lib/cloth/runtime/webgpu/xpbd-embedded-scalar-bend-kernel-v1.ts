/* global GPUShaderModuleDescriptor */

export const XPBD_EMBEDDED_SCALAR_BEND_KERNEL_V1 = 'xpbd-embedded-scalar-bend-kernel/v1' as const;
export const XPBD_EMBEDDED_SCALAR_BEND_SOURCE_REVISION_V1 =
  'xpbd-embedded-scalar-bend-wgsl/1' as const;
export const XPBD_EMBEDDED_SCALAR_BEND_ENTRY_POINT_V1 =
  'solveXpbdEmbeddedScalarBendColorV1' as const;
export const XPBD_EMBEDDED_SCALAR_BEND_WORKGROUP_SIZE_V1 = 64;
export const XPBD_EMBEDDED_SCALAR_BEND_PARAMS_BYTES_V1 = 16;
export const XPBD_EMBEDDED_SCALAR_BEND_DIAGNOSTICS_BYTES_V1 = 4;

const STORAGE = 0x0080;
const COPY_SRC = 0x0004;
const COPY_DST = 0x0008;
const UNIFORM = 0x0040;
const UINT32_MAX = 0xffff_ffff;

export const XPBD_EMBEDDED_SCALAR_BEND_ABI_V1 = Object.freeze({
  version: XPBD_EMBEDDED_SCALAR_BEND_KERNEL_V1,
  sourceRevision: XPBD_EMBEDDED_SCALAR_BEND_SOURCE_REVISION_V1,
  entryPoint: XPBD_EMBEDDED_SCALAR_BEND_ENTRY_POINT_V1,
  workgroupSize: XPBD_EMBEDDED_SCALAR_BEND_WORKGROUP_SIZE_V1,
  bindings: Object.freeze({
    positionsMInvMassKg: Object.freeze({
      binding: 0,
      resource: 'storage',
      access: 'read_write',
      strideBytes: 16,
      requiredUsage: STORAGE,
    }),
    vertexQuads: Object.freeze({
      binding: 1,
      resource: 'storage',
      access: 'read',
      strideBytes: 16,
      requiredUsage: STORAGE,
    }),
    restAnglesRad: Object.freeze({
      binding: 2,
      resource: 'storage',
      access: 'read',
      strideBytes: 4,
      requiredUsage: STORAGE,
    }),
    lambdasKgM2: Object.freeze({
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
      sizeBytes: XPBD_EMBEDDED_SCALAR_BEND_PARAMS_BYTES_V1,
      exactUsage: UNIFORM | COPY_DST,
    }),
    invalidConstraintCount: Object.freeze({
      binding: 5,
      resource: 'storage',
      access: 'read_write',
      sizeBytes: XPBD_EMBEDDED_SCALAR_BEND_DIAGNOSTICS_BYTES_V1,
      exactUsage: STORAGE | COPY_SRC | COPY_DST,
    }),
  }),
  bindingCounts: Object.freeze({ storage: 5, uniform: 1, total: 6 }),
  colorParamsOffsets: Object.freeze({
    constraintOffset: 0,
    constraintCount: 4,
    complianceInvNm: 8,
    dtS: 12,
  }),
  complianceModel: 'one-sealed-scalar-per-runtime-copied-into-each-color-packet',
  standalonePerConstraintAbiCompatible: false,
  invalidCounter: Object.freeze({
    lifecycle: 'run-cumulative',
    increment: 'saturating-u32',
    zeroDispatchObservable: false,
  }),
  schedule: Object.freeze({
    dispatchPerColor: true,
    colorOrder: 'strictly-increasing-color-index',
    workgroups: 'ceil-exact-color-count-over-64-by-1-by-1',
    adjacentColorsMayNotBeMerged: true,
  }),
  extraction: Object.freeze({
    source: 'xpbd-spike embedded V3/V4 scalar-compliance signed-dihedral semantics',
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
    'cumulative-invalid-counter-reset-lifetime-not-full-owner-sealed',
    'browser-compile-and-bind-evidence-not-recorded',
  ] as const),
} as const);

export type XpbdEmbeddedScalarBendColorRangeV1 = Readonly<{
  color: number;
  constraintOffset: number;
  constraintCount: number;
  workgroups: number;
}>;

export type XpbdEmbeddedScalarBendScheduleInputV1 = Readonly<{
  particleCount: number;
  constraintCount: number;
  complianceInvNm: number;
  dtS: number;
  vertexQuads: Uint32Array;
  restAnglesRad: Float32Array;
  lambdasKgM2: Float32Array;
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

export function packXpbdEmbeddedScalarBendColorParamsV1(
  input: Readonly<{
    constraintOffset: number;
    constraintCount: number;
    complianceInvNm: number;
    dtS: number;
  }>,
): ArrayBuffer {
  const offset = nonNegativeU32(input.constraintOffset, 'constraintOffset');
  const count = positiveU32(input.constraintCount, 'constraintCount');
  if (offset + count > UINT32_MAX) throw new RangeError('Bend color range must not overflow u32.');
  const compliance = canonicalF32(input.complianceInvNm, 'complianceInvNm', false);
  const dt = canonicalF32(input.dtS, 'dtS', true);
  const buffer = new ArrayBuffer(XPBD_EMBEDDED_SCALAR_BEND_PARAMS_BYTES_V1);
  const view = new DataView(buffer);
  view.setUint32(0, offset, true);
  view.setUint32(4, count, true);
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
    throw new TypeError(`${label} must be a native ${constructor.name}.`);
}

export function createXpbdEmbeddedScalarBendColorScheduleV1(
  input: XpbdEmbeddedScalarBendScheduleInputV1,
): readonly XpbdEmbeddedScalarBendColorRangeV1[] {
  const particleCount = positiveU32(input.particleCount, 'particleCount');
  const constraintCount = positiveU32(input.constraintCount, 'constraintCount');
  canonicalF32(input.complianceInvNm, 'complianceInvNm', false);
  canonicalF32(input.dtS, 'dtS', true);
  exactTypedArray(input.vertexQuads, Uint32Array, 'vertexQuads');
  exactTypedArray(input.restAnglesRad, Float32Array, 'restAnglesRad');
  exactTypedArray(input.lambdasKgM2, Float32Array, 'lambdasKgM2');
  exactTypedArray(input.colorRanges, Uint32Array, 'colorRanges');
  if (
    input.vertexQuads.length !== constraintCount * 4 ||
    input.restAnglesRad.length !== constraintCount ||
    input.lambdasKgM2.length !== constraintCount ||
    input.colorRanges.length === 0 ||
    input.colorRanges.length % 2 !== 0
  )
    throw new RangeError('Embedded bend buffers disagree with the sealed counts.');
  if (input.restAnglesRad.some((value) => !Number.isFinite(value)))
    throw new RangeError('Bend rest angles must be finite.');
  if (input.lambdasKgM2.some((value) => !Number.isFinite(value)))
    throw new RangeError('Bend lambdas must be finite.');
  const result: XpbdEmbeddedScalarBendColorRangeV1[] = [];
  let expectedOffset = 0;
  for (let color = 0; color < input.colorRanges.length / 2; color += 1) {
    const offset = input.colorRanges[color * 2]!;
    const count = input.colorRanges[color * 2 + 1]!;
    if (offset !== expectedOffset || count === 0 || offset + count > constraintCount)
      throw new RangeError('Bend color ranges must be non-empty, contiguous, and in bounds.');
    const written = new Set<number>();
    for (let index = offset; index < offset + count; index += 1) {
      const vertices = Array.from(input.vertexQuads.subarray(index * 4, index * 4 + 4));
      if (vertices.some((vertex) => vertex >= particleCount) || new Set(vertices).size !== 4)
        throw new RangeError('Bend quad must reference four distinct in-range particles.');
      if (vertices.some((vertex) => written.has(vertex)))
        throw new RangeError('Bend constraints in one color must not share a particle.');
      vertices.forEach((vertex) => written.add(vertex));
    }
    result.push(
      Object.freeze({
        color,
        constraintOffset: offset,
        constraintCount: count,
        workgroups: Math.ceil(count / XPBD_EMBEDDED_SCALAR_BEND_WORKGROUP_SIZE_V1),
      }),
    );
    expectedOffset += count;
  }
  if (expectedOffset !== constraintCount)
    throw new RangeError('Bend colors must cover every constraint.');
  return Object.freeze(result);
}

export function validateXpbdEmbeddedScalarBendBufferContractV1(
  resources: Readonly<{
    positionsMInvMassKg: Readonly<{ size: number; usage: number }>;
    vertexQuads: Readonly<{ size: number; usage: number }>;
    restAnglesRad: Readonly<{ size: number; usage: number }>;
    lambdasKgM2: Readonly<{ size: number; usage: number }>;
    colorParams: Readonly<{ size: number; usage: number }>;
    invalidConstraintCount: Readonly<{ size: number; usage: number }>;
  }>,
  counts: Readonly<{ particleCount: number; constraintCount: number }>,
): void {
  const particleCount = positiveU32(counts.particleCount, 'particleCount');
  const constraintCount = positiveU32(counts.constraintCount, 'constraintCount');
  for (const [name, actual, size] of [
    ['positionsMInvMassKg', resources.positionsMInvMassKg, particleCount * 16],
    ['vertexQuads', resources.vertexQuads, constraintCount * 16],
    ['restAnglesRad', resources.restAnglesRad, constraintCount * 4],
    ['lambdasKgM2', resources.lambdasKgM2, constraintCount * 4],
  ] as const)
    if (actual.size !== size || (actual.usage & STORAGE) === 0)
      throw new RangeError(`${name} size or required storage usage is invalid.`);
  if (
    resources.colorParams.size !== XPBD_EMBEDDED_SCALAR_BEND_PARAMS_BYTES_V1 ||
    resources.colorParams.usage !== (UNIFORM | COPY_DST)
  )
    throw new RangeError('colorParams size or exact usage is invalid.');
  if (
    resources.invalidConstraintCount.size !== XPBD_EMBEDDED_SCALAR_BEND_DIAGNOSTICS_BYTES_V1 ||
    resources.invalidConstraintCount.usage !== (STORAGE | COPY_SRC | COPY_DST)
  )
    throw new RangeError('invalidConstraintCount size or exact usage is invalid.');
}

export const XPBD_EMBEDDED_SCALAR_BEND_WGSL_V1 = /* wgsl */ `
struct BendParams{constraintOffset:u32,constraintCount:u32,complianceInvNm:f32,dtS:f32,};
struct BendDiagnostics{invalidConstraintCount:atomic<u32>,};
@group(0) @binding(0) var<storage,read_write> positions:array<vec4<f32>>;
@group(0) @binding(1) var<storage,read> vertexQuads:array<vec4<u32>>;
@group(0) @binding(2) var<storage,read> restAngles:array<f32>;
@group(0) @binding(3) var<storage,read_write> lambdas:array<f32>;
@group(0) @binding(4) var<uniform> params:BendParams;
@group(0) @binding(5) var<storage,read_write> diagnostics:BendDiagnostics;
const EFFECTIVE_MASS_FLOOR:f32=1.0e-12;
fn finiteScalar(value:f32)->bool{return value==value&&abs(value)<1.0e30;}
fn finiteVector(value:vec3<f32>)->bool{return all(value==value)&&all(abs(value)<vec3<f32>(1.0e30));}
fn rejectConstraint(){loop{let oldValue=atomicLoad(&diagnostics.invalidConstraintCount);if(oldValue==0xffffffffu){break;}let result=atomicCompareExchangeWeak(&diagnostics.invalidConstraintCount,oldValue,oldValue+1u);if(result.exchanged){break;}}}
fn exactDispatch(groups:vec3<u32>)->bool{let expected=params.constraintCount/64u+select(0u,1u,params.constraintCount%64u!=0u);return params.constraintCount>0u&&all(groups==vec3<u32>(expected,1u,1u));}
fn paramsOk()->bool{let end=params.constraintOffset+params.constraintCount;return params.constraintOffset<=end&&end<=arrayLength(&vertexQuads)&&arrayLength(&vertexQuads)==arrayLength(&restAngles)&&arrayLength(&vertexQuads)==arrayLength(&lambdas)&&arrayLength(&positions)>0u&&finiteScalar(params.complianceInvNm)&&params.complianceInvNm>=0.0&&finiteScalar(params.dtS)&&params.dtS>0.0;}
@compute @workgroup_size(${XPBD_EMBEDDED_SCALAR_BEND_WORKGROUP_SIZE_V1})
fn ${XPBD_EMBEDDED_SCALAR_BEND_ENTRY_POINT_V1}(@builtin(global_invocation_id) invocation:vec3<u32>,@builtin(num_workgroups) groups:vec3<u32>){
  if(!exactDispatch(groups)||!paramsOk()){if(invocation.x==0u){rejectConstraint();}return;}
  let localIndex=invocation.x;if(localIndex>=params.constraintCount){return;}let constraintIndex=params.constraintOffset+localIndex;let quad=vertexQuads[constraintIndex];
  if(quad.x==quad.y||quad.x==quad.z||quad.x==quad.w||quad.y==quad.z||quad.y==quad.w||quad.z==quad.w||quad.x>=arrayLength(&positions)||quad.y>=arrayLength(&positions)||quad.z>=arrayLength(&positions)||quad.w>=arrayLength(&positions)){rejectConstraint();return;}
  let edgeA=positions[quad.x];let edgeB=positions[quad.y];let oppositeA=positions[quad.z];let oppositeB=positions[quad.w];
  if(!finiteVector(edgeA.xyz)||!finiteVector(edgeB.xyz)||!finiteVector(oppositeA.xyz)||!finiteVector(oppositeB.xyz)||!finiteScalar(edgeA.w)||!finiteScalar(edgeB.w)||!finiteScalar(oppositeA.w)||!finiteScalar(oppositeB.w)||edgeA.w<0.0||edgeB.w<0.0||oppositeA.w<0.0||oppositeB.w<0.0){rejectConstraint();return;}
  let edge=edgeB.xyz-edgeA.xyz;let edgeLength=length(edge);if(!finiteScalar(edgeLength)||edgeLength<=1.0e-12){rejectConstraint();return;}
  let firstA=edgeA.xyz-oppositeA.xyz;let firstB=edgeB.xyz-oppositeA.xyz;let secondA=edgeB.xyz-oppositeB.xyz;let secondB=edgeA.xyz-oppositeB.xyz;let rawNormalA=cross(firstA,firstB);let rawNormalB=cross(secondA,secondB);let normalLengthA=length(rawNormalA);let normalLengthB=length(rawNormalB);let scaleA=length(firstA)*length(firstB);let scaleB=length(secondA)*length(secondB);
  if(!finiteScalar(normalLengthA)||!finiteScalar(normalLengthB)||!finiteScalar(scaleA)||!finiteScalar(scaleB)||scaleA<=0.0||scaleB<=0.0||normalLengthA<=1.0e-10*scaleA||normalLengthB<=1.0e-10*scaleB){rejectConstraint();return;}
  let normalA=rawNormalA/(normalLengthA*normalLengthA);let normalB=rawNormalB/(normalLengthB*normalLengthB);let inverseEdgeLength=1.0/edgeLength;let gradientOppositeA=-normalA*edgeLength;let gradientOppositeB=-normalB*edgeLength;let gradientEdgeA=-(normalA*(dot(oppositeA.xyz-edgeB.xyz,edge)*inverseEdgeLength)+normalB*(dot(oppositeB.xyz-edgeB.xyz,edge)*inverseEdgeLength));let gradientEdgeB=-(normalA*(dot(edgeA.xyz-oppositeA.xyz,edge)*inverseEdgeLength)+normalB*(dot(edgeA.xyz-oppositeB.xyz,edge)*inverseEdgeLength));
  if(!finiteVector(gradientEdgeA)||!finiteVector(gradientEdgeB)||!finiteVector(gradientOppositeA)||!finiteVector(gradientOppositeB)){rejectConstraint();return;}
  let unitEdge=edge*inverseEdgeLength;let unitNormalA=rawNormalA/normalLengthA;let unitNormalB=rawNormalB/normalLengthB;let angle=atan2(dot(cross(unitNormalA,unitNormalB),unitEdge),clamp(dot(unitNormalA,unitNormalB),-1.0,1.0));let restAngle=restAngles[constraintIndex];let residualDelta=angle-restAngle;let constraintValue=atan2(sin(residualDelta),cos(residualDelta));let previousLambda=lambdas[constraintIndex];
  if(!finiteScalar(restAngle)||!finiteScalar(constraintValue)||!finiteScalar(previousLambda)){rejectConstraint();return;}
  let alpha=params.complianceInvNm/(params.dtS*params.dtS);let denominator=alpha+edgeA.w*dot(gradientEdgeA,gradientEdgeA)+edgeB.w*dot(gradientEdgeB,gradientEdgeB)+oppositeA.w*dot(gradientOppositeA,gradientOppositeA)+oppositeB.w*dot(gradientOppositeB,gradientOppositeB);if(!finiteScalar(alpha)||!finiteScalar(denominator)||denominator<=EFFECTIVE_MASS_FLOOR){rejectConstraint();return;}
  let deltaLambda=(-constraintValue-alpha*previousLambda)/denominator;let nextLambda=previousLambda+deltaLambda;let nextEdgeA=edgeA.xyz+edgeA.w*deltaLambda*gradientEdgeA;let nextEdgeB=edgeB.xyz+edgeB.w*deltaLambda*gradientEdgeB;let nextOppositeA=oppositeA.xyz+oppositeA.w*deltaLambda*gradientOppositeA;let nextOppositeB=oppositeB.xyz+oppositeB.w*deltaLambda*gradientOppositeB;
  if(!finiteScalar(deltaLambda)||!finiteScalar(nextLambda)||!finiteVector(nextEdgeA)||!finiteVector(nextEdgeB)||!finiteVector(nextOppositeA)||!finiteVector(nextOppositeB)){rejectConstraint();return;}
  lambdas[constraintIndex]=nextLambda;positions[quad.x]=vec4<f32>(nextEdgeA,edgeA.w);positions[quad.y]=vec4<f32>(nextEdgeB,edgeB.w);positions[quad.z]=vec4<f32>(nextOppositeA,oppositeA.w);positions[quad.w]=vec4<f32>(nextOppositeB,oppositeB.w);
}`.trim();

export const XPBD_EMBEDDED_SCALAR_BEND_SOURCE_SHA256_V1 =
  '31b0d2166ee27847a85fa68e1fd7f40ed0f5c203f76c4d79e40a1671b1cef796' as const;

function hex(bytes: Uint8Array): string {
  return Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('');
}

export async function hashXpbdEmbeddedScalarBendSourceV1(
  source: string,
  options: Readonly<{ crypto?: Pick<Crypto, 'subtle'> | null }> = {},
): Promise<string> {
  const crypto = Object.prototype.hasOwnProperty.call(options, 'crypto')
    ? options.crypto
    : globalThis.crypto;
  if (!crypto?.subtle) throw new Error('XPBD embedded scalar bend V1 requires Web Crypto SHA-256.');
  const bytes = new TextEncoder().encode(source);
  return hex(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)));
}

export async function getXpbdEmbeddedScalarBendPipelineIdentityV1(
  options: Readonly<{ crypto?: Pick<Crypto, 'subtle'> | null }> = {},
) {
  const sha256 = await hashXpbdEmbeddedScalarBendSourceV1(
    XPBD_EMBEDDED_SCALAR_BEND_WGSL_V1,
    options,
  );
  if (sha256 !== XPBD_EMBEDDED_SCALAR_BEND_SOURCE_SHA256_V1)
    throw new Error('XPBD embedded scalar bend V1 source differs from its pinned identity.');
  return Object.freeze({
    sha256,
    entryPoint: XPBD_EMBEDDED_SCALAR_BEND_ENTRY_POINT_V1,
  });
}

export function xpbdEmbeddedScalarBendShaderDescriptorV1(): GPUShaderModuleDescriptor {
  return {
    label: 'XPBD embedded scalar bend V1',
    code: XPBD_EMBEDDED_SCALAR_BEND_WGSL_V1,
  };
}
