import type { GarmentMaterialRunPlanResultV1 } from './garment-material-run-plan-v1';
import { packActualBodyTriangleMeshContactParamsV2 } from './actual-body-triangle-mesh-contact-kernel-v2';
import {
  createXpbdMaterialVelocityDiagnosticsV2,
  encodeXpbdMaterialVelocityParamsV2,
} from './xpbd-material-velocity-kernel-v2';
import { encodeXpbdPredictFrameParamsV1 } from './xpbd-predict-kernel-v1';
import { encodeXpbdDistanceColorParamsV1 } from './xpbd-distance-kernel-v1';
import {
  packXpbdSeamSolveColorParamsV1,
  packXpbdSeamSolveActivationParamsV1,
} from './xpbd-seam-solve-kernel-v1';
import { packXpbdEmbeddedScalarBendColorParamsV2 } from './xpbd-embedded-scalar-bend-kernel-v2';
import {
  createXpbdDistanceResetPacketV1,
  createXpbdSeamAllActivePacketV1,
  createXpbdBendResetPacketV1,
  createXpbdContinuumResetPacketV1,
} from './xpbd-initialization-core-reset';
import { CONTINUUM_STRAIN_VNEXT_STATUS_RESET } from './triangle-strain-continuum-vnext-kernel';

export const GARMENT_MATERIAL_CONTACT_EXECUTION_LAYOUT_V1 =
  'garment-material-contact-execution-layout/1' as const;
export const GARMENT_MATERIAL_CONTACT_REPLAY_PROFILE_V1 =
  'garment-material-contact-replay/1' as const;
type CorePlan = Extract<GarmentMaterialRunPlanResultV1, { ok: true }>['plan'];
type Counts = CorePlan['report']['counts'];
type Bytes = ArrayBuffer | Float32Array | Uint32Array;
export type GarmentMaterialContactExecutionBudgetsV1 = Readonly<{
  maxGpuBytes: number;
  maxCpuBytes: number;
  maxDispatches: number;
  maxPaddedInvocations: number;
  maxContactTriangleVisits: number;
  maxCopyBytes: number;
  maxCopies: number;
  maxSubmissions: number;
}>;
export type GarmentMaterialContactExecutionDeviceLimitsV1 = Readonly<{
  maxBufferSize: number;
  maxStorageBufferBindingSize: number;
  maxUniformBufferBindingSize: number;
  maxComputeWorkgroupsPerDimension: number;
  maxComputeInvocationsPerWorkgroup: number;
  maxComputeWorkgroupSizeX: number;
  maxBindingsPerBindGroup: number;
  maxStorageBuffersPerShaderStage: number;
  maxUniformBuffersPerShaderStage: number;
  maxBindGroups: number;
}>;
export type GarmentMaterialContactExecutionLayoutRequestV1 = Readonly<{
  corePlan: CorePlan;
  bodyVertexCount: number;
  bodyTriangleCount: number;
  freeParticleCount: number;
  frameCount: 16 | 32;
  profile: typeof GARMENT_MATERIAL_CONTACT_REPLAY_PROFILE_V1;
  bodyOutwardSign: 1 | -1;
  budgets: GarmentMaterialContactExecutionBudgetsV1;
  deviceLimits: GarmentMaterialContactExecutionDeviceLimitsV1;
}>;
export type GarmentMaterialContactCheckpointV1 = Readonly<{
  positions: Float32Array;
  previousPositions: Float32Array;
  velocities: Float32Array;
  distanceLambdas: Float32Array;
  seamLambdas: Float32Array;
  bendLambdas: Float32Array;
  continuumLambdas: Float32Array;
  velocityDiagnostics: Uint32Array;
  bendDiagnostics: Uint32Array;
  contactDiagnostics: Uint32Array;
  continuumStatuses: Uint32Array;
}>;
type Field = keyof GarmentMaterialContactCheckpointV1;
type Extent = Readonly<{ offset: number; byteLength: number }>;
export type GarmentMaterialContactExecutionLayoutV1 = Readonly<{
  schemaVersion: typeof GARMENT_MATERIAL_CONTACT_EXECUTION_LAYOUT_V1;
  profile: typeof GARMENT_MATERIAL_CONTACT_REPLAY_PROFILE_V1;
  corePlanSha256: string;
  counts: Counts;
  bodyVertexCount: number;
  bodyTriangleCount: number;
  freeParticleCount: number;
  frameCount: 16 | 32;
  solverIterations: number;
  checkpoint: Readonly<{ byteLength: number; fields: Readonly<Record<Field, Extent>> }>;
  snapshotBytes: number;
  readback: Readonly<{
    byteLength: number;
    frame16Offset: number;
    finalOffset: number;
    strainValuesOffset: number;
    strainFlagsOffset: number;
  }>;
  allocations: readonly Readonly<{
    name: string;
    byteLength: number;
    kind: 'storage' | 'uniform' | 'checkpoint' | 'readback';
  }>[];
  fullGpuBytes: number;
  cpuStagingBytes: number;
  /** Conservative sum of explicit binary allocations, not a bound on the whole JS process. */
  cpuStaging: Readonly<{
    scope: 'per-execution-binary-upload-checkpoint-and-strain-staging';
    exclusions: readonly string[];
    components: Readonly<{
      coreCaptureAndInput: number;
      uploadTransfer: number;
      bodyProjection: number;
      extraInitial: number;
      readbackMapping: number;
      checkpointCopies: number;
      strainDecodedOracleReceiptAndHash: number;
      strainPortAndHash: number;
      priorReceipt: number;
    }>;
  }>;
  capturedCoreBytes: number;
  inputUploadBytes: number;
  work: Readonly<{
    contactWorkgroups: number;
    strainWorkgroups: number;
    dispatchCount: number;
    paddedInvocations: number;
    coreConstraintInvocations: number;
    contactTriangleVisits: number;
    copyCount: number;
    copyBytes: number;
    submissionCount: number;
    initialUploadCount: number;
  }>;
  uploads: Readonly<Record<string, Bytes>>;
  uniformPackets: readonly ArrayBuffer[];
  contactParams: ArrayBuffer;
  strainParams: ArrayBuffer;
  contactDiagnostics: Uint32Array;
  bendDiagnostics: Uint32Array;
  strainValues: Float32Array;
  strainFlags: Uint32Array;
  /** Both maps are colored continuum ordinal -> original source/render triangle ordinal. */
  strainOrder: Readonly<{ sourceTriangleIndices: Uint32Array; renderTriangleIndices: Uint32Array }>;
  claims: Readonly<{
    contentOnly: true;
    sourcePersistenceAuthenticated: false;
    gpuExecutionPerformed: false;
    runtimeAuthority: false;
    continuationAuthority: false;
  }>;
}>;
const U32 = 0xffff_ffff;
const budgetMax = {
  maxGpuBytes: 512 * 1024 * 1024,
  maxCpuBytes: 512 * 1024 * 1024,
  maxDispatches: 1_000_000,
  maxPaddedInvocations: 1_000_000_000,
  maxContactTriangleVisits: 500_000_000,
  maxCopyBytes: 1024 * 1024 * 1024,
  maxCopies: 1_000_000,
  maxSubmissions: 33,
} as const;
const deviceKeys = [
  'maxBufferSize',
  'maxStorageBufferBindingSize',
  'maxUniformBufferBindingSize',
  'maxComputeWorkgroupsPerDimension',
  'maxComputeInvocationsPerWorkgroup',
  'maxComputeWorkgroupSizeX',
  'maxBindingsPerBindGroup',
  'maxStorageBuffersPerShaderStage',
  'maxUniformBuffersPerShaderStage',
  'maxBindGroups',
] as const;
const abLength = Object.getOwnPropertyDescriptor(ArrayBuffer.prototype, 'byteLength')!.get!;
const typedPrototype = Object.getPrototypeOf(Uint8Array.prototype);
const typedBuffer = Object.getOwnPropertyDescriptor(typedPrototype, 'buffer')!.get!;
const typedOffset = Object.getOwnPropertyDescriptor(typedPrototype, 'byteOffset')!.get!;
const typedLength = Object.getOwnPropertyDescriptor(typedPrototype, 'byteLength')!.get!;
function reject(detail: string): never {
  throw new Error(detail);
}
function integer(n: number, min: number, max: number, label: string) {
  if (!Number.isSafeInteger(n) || n < min || n > max) reject(`${label} is out of bounds.`);
  return n;
}
function sum(...values: number[]) {
  return integer(
    values.reduce((a, b) => a + b, 0),
    0,
    Number.MAX_SAFE_INTEGER,
    'byte/work sum',
  );
}
function product(...values: number[]) {
  return integer(
    values.reduce((a, b) => a * b, 1),
    0,
    Number.MAX_SAFE_INTEGER,
    'byte/work product',
  );
}
function exact(value: unknown, keys: readonly string[]): asserts value is Record<string, unknown> {
  if (!value || Object.getPrototypeOf(value) !== Object.prototype)
    reject('Expected plain data record.');
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (
    Reflect.ownKeys(descriptors).length !== keys.length ||
    keys.some((k) => !descriptors[k] || !('value' in descriptors[k]))
  )
    reject('Expected exact own data fields without accessors.');
}
function raw(value: unknown): Uint8Array {
  if (value && Object.getPrototypeOf(value) === ArrayBuffer.prototype)
    return new Uint8Array(value as ArrayBuffer, 0, abLength.call(value));
  const buffer = typedBuffer.call(value) as ArrayBuffer;
  if (Object.getPrototypeOf(buffer) !== ArrayBuffer.prototype)
    reject('Shared/non-native buffers refused.');
  abLength.call(buffer);
  return new Uint8Array(buffer, typedOffset.call(value), typedLength.call(value));
}
function same(a: Bytes, b: Bytes) {
  const x = raw(a),
    y = raw(b);
  return x.length === y.length && x.every((v, i) => v === y[i]);
}
/** Bounded synchronous content capture. It never invokes caller accessors or carries authority. */
function captureCore(value: unknown) {
  let byteLength = 0,
    nodes = 0;
  const seen = new Map<object, unknown>();
  const backingCopies = new Map<ArrayBuffer, ArrayBuffer>();
  const copy = (v: unknown, depth: number): unknown => {
    if (++nodes > 1_000_000 || depth > 40) reject('Core capture complexity exceeded.');
    if (v === null || typeof v === 'string' || typeof v === 'boolean' || typeof v === 'number')
      return v;
    if (!v || typeof v !== 'object') reject('Unsupported core content.');
    if (seen.has(v)) return seen.get(v);
    const proto = Object.getPrototypeOf(v);
    if (
      proto === ArrayBuffer.prototype ||
      proto === Float32Array.prototype ||
      proto === Uint32Array.prototype
    ) {
      const bytes = raw(v);
      if (bytes.byteLength > 32 * 1024 * 1024) reject('Core single buffer bound exceeded.');

      if (
        proto !== ArrayBuffer.prototype &&
        (bytes.byteOffset !== 0 || bytes.byteLength !== abLength.call(bytes.buffer))
      )
        reject('Core typed arrays require complete non-aliased buffer extents.');
      const own = Reflect.ownKeys(v);
      if (
        proto === ArrayBuffer.prototype
          ? own.length !== 0
          : own.length !== bytes.byteLength / 4 || own.some((k, i) => k !== String(i))
      )
        reject('Extended binary object refused.');
      let buffer = backingCopies.get(bytes.buffer as ArrayBuffer);
      if (!buffer) {
        byteLength = sum(byteLength, bytes.byteLength);
        if (byteLength > 128 * 1024 * 1024) reject('Core capture byte bound exceeded.');
        buffer = new Uint8Array(bytes).buffer;
        backingCopies.set(bytes.buffer as ArrayBuffer, buffer);
      }
      const result =
        proto === ArrayBuffer.prototype
          ? buffer
          : proto === Float32Array.prototype
            ? new Float32Array(buffer)
            : new Uint32Array(buffer);
      seen.set(v, result);
      return result;
    }
    if (proto !== Object.prototype && proto !== Array.prototype) reject('Non-plain core object.');
    const descriptors = Object.getOwnPropertyDescriptors(v);
    const result: unknown[] | Record<string, unknown> = proto === Array.prototype ? [] : {};
    seen.set(v, result);
    for (const key of Reflect.ownKeys(descriptors)) {
      if (typeof key !== 'string' || !('value' in descriptors[key]))
        reject('Core accessor/symbol refused.');
      if (Array.isArray(result) && key === 'length') continue;
      Object.defineProperty(result, key, {
        value: copy(descriptors[key].value, depth + 1),
        enumerable: true,
        configurable: true,
        writable: true,
      });
    }
    if (Array.isArray(result) && Object.keys(result).length !== result.length)
      reject('Sparse core array.');
    return result;
  };
  return { core: copy(value, 0) as CorePlan, byteLength };
}
function checkIndependent(values: readonly Bytes[]) {
  for (let i = 0; i < values.length; i++) {
    const a = raw(values[i]);
    for (let j = 0; j < i; j++) {
      const b = raw(values[j]);
      if (
        a.buffer === b.buffer &&
        a.byteLength &&
        b.byteLength &&
        a.byteOffset < b.byteOffset + b.byteLength &&
        b.byteOffset < a.byteOffset + a.byteLength
      )
        reject('Overlapping GPU/checkpoint input buffers refused.');
    }
  }
}
function fieldsFor(c: Counts) {
  const lengths: Record<Field, number> = {
    positions: 16 * c.particles,
    previousPositions: 16 * c.particles,
    velocities: 16 * c.particles,
    distanceLambdas: 4 * c.distance,
    seamLambdas: 4 * c.seam,
    bendLambdas: 4 * c.bend,
    continuumLambdas: 16 * c.triangles,
    velocityDiagnostics: 32,
    bendDiagnostics: 8,
    contactDiagnostics: 40,
    continuumStatuses: 4 * c.triangles,
  };
  let offset = 0;
  const fields = {} as Record<Field, Extent>;
  for (const key of Object.keys(lengths) as Field[]) {
    fields[key] = Object.freeze({ offset, byteLength: integer(lengths[key], 0, U32, key) });
    offset = sum(offset, lengths[key]);
  }
  return Object.freeze({ fields: Object.freeze(fields), byteLength: offset });
}
const diagnosticFields = new Set<Field>([
  'velocityDiagnostics',
  'bendDiagnostics',
  'contactDiagnostics',
  'continuumStatuses',
]);

/** Pure layout: the executor must independently obtain a real plan/body/device before using it. */
export function buildGarmentMaterialContactExecutionLayoutV1(
  request: GarmentMaterialContactExecutionLayoutRequestV1,
) {
  try {
    const captured = captureCore(request);
    const input = captured.core as unknown as GarmentMaterialContactExecutionLayoutRequestV1;
    exact(input, [
      'corePlan',
      'bodyVertexCount',
      'bodyTriangleCount',
      'freeParticleCount',
      'frameCount',
      'profile',
      'bodyOutwardSign',
      'budgets',
      'deviceLimits',
    ]);
    exact(input.budgets, Object.keys(budgetMax));
    exact(input.deviceLimits, deviceKeys);
    const budgets = { ...input.budgets },
      limits = { ...input.deviceLimits };
    for (const key of Object.keys(budgetMax) as (keyof typeof budgetMax)[])
      integer(budgets[key], 1, budgetMax[key], key);
    for (const key of deviceKeys) integer(limits[key], 1, Number.MAX_SAFE_INTEGER, key);
    if (
      input.profile !== GARMENT_MATERIAL_CONTACT_REPLAY_PROFILE_V1 ||
      ![16, 32].includes(input.frameCount) ||
      ![1, -1].includes(input.bodyOutwardSign)
    )
      reject('Fixed execution profile/frame/sign required.');
    const bodyVertexCount = integer(input.bodyVertexCount, 4, 20000, 'body vertices');
    const bodyTriangleCount = integer(input.bodyTriangleCount, 4, 30000, 'body triangles');
    const core = input.corePlan,
      capturedCoreBytes = captured.byteLength;
    const c = core.report.counts,
      p = core.report.parameters,
      n = input.frameCount;
    integer(c.particles, 1, 2000, 'cloth particles');
    integer(c.triangles, 1, 5000, 'cloth triangles');
    integer(c.materials, 1, 4096, 'materials');
    for (const key of ['distance', 'seam', 'bend', 'continuum'] as const)
      integer(c[key], 0, 120000, key);
    integer(p.solverIterations, 1, 64, 'iterations');
    if (
      p.frameCount !== n ||
      c.continuum !== c.triangles ||
      core.report.schemaVersion !== 'garment-material-run-plan/1' ||
      !/^[0-9a-f]{64}$/.test(core.planSha256)
    )
      reject('Core profile/count/frame mismatch.');
    exact(core.sequence, ['perFrame', 'perIteration', 'contactSlotImplemented']);
    if (
      JSON.stringify([
        core.sequence.perFrame,
        core.sequence.perIteration,
        core.sequence.contactSlotImplemented,
      ]) !==
      JSON.stringify(
        Object.values({
          perFrame: [
            'predict',
            'reset-distance',
            'reset-seam-if-nonzero',
            'reset-bend-if-nonzero',
            'reset-continuum',
            'iterations',
            'finalize-material-velocity',
          ],
          perIteration: [
            'distance-colors',
            'seam-colors',
            'bend-material-subruns-within-original-colors',
            'continuum-colors',
            'seam-closure-same-lambdas',
          ],
          contactSlotImplemented: false,
        }),
      )
    )
      reject('Mechanical command profile differs from the fixed core order.');
    const source = core.sourceSealedSimulation.simulation,
      sourceCounts = source.manifest;
    for (const [key, sourceKey] of [
      ['particles', 'particleCount'],
      ['triangles', 'triangleCount'],
      ['distance', 'distanceConstraintCount'],
      ['seam', 'seamConstraintCount'],
      ['bend', 'bendConstraintCount'],
      ['continuum', 'continuumConstraintCount'],
      ['materials', 'materialCount'],
    ] as const)
      if (c[key] !== sourceCounts[sourceKey]) reject('Core count differs from V5 content.');
    const sizes: Record<string, number> = {
      positions: 16 * c.particles,
      previousPositions: 16 * c.particles,
      restPositions: 16 * c.particles,
      velocities: 16 * c.particles,
      particleRetention: 4 * c.particles,
      velocityDiagnostics: 32,
      distancePairs: 8 * c.distance,
      distanceRestLengths: 4 * c.distance,
      distanceLambdas: 4 * c.distance,
      continuumTriangles: 16 * c.triangles,
      continuumRestFrames: 32 * c.triangles,
      continuumMaterialIndices: 4 * c.triangles,
      continuumMaterials: 16 * c.materials,
      continuumLambdas: 16 * c.triangles,
      continuumStatuses: 4 * c.triangles,
      ...(c.seam
        ? {
            seamPairs: 8 * c.seam,
            seamTargetLengths: 4 * c.seam,
            seamLambdas: 4 * c.seam,
            seamActivationRanks: 4 * c.seam,
          }
        : {}),
      ...(c.bend
        ? {
            bendQuads: 16 * c.bend,
            bendRestAngles: 4 * c.bend,
            bendLambdas: 4 * c.bend,
            bendDiagnostics: 8,
          }
        : {}),
    };
    exact(core.uploads, Object.keys(sizes));
    for (const [key, size] of Object.entries(sizes))
      if (raw(core.uploads[key]).byteLength !== size) reject(`Inexact core upload extent: ${key}.`);
    checkIndependent(Object.values(core.uploads));
    const bufferNames = new Set([
      'continuumTriangles',
      'continuumRestFrames',
      'continuumMaterials',
    ]);
    const uintNames = new Set([
      'velocityDiagnostics',
      'distancePairs',
      'continuumMaterialIndices',
      'continuumStatuses',
      'seamPairs',
      'seamActivationRanks',
      'bendQuads',
      'bendDiagnostics',
    ]);
    for (const [name, value] of Object.entries(core.uploads)) {
      const expectedPrototype = bufferNames.has(name)
        ? ArrayBuffer.prototype
        : uintNames.has(name)
          ? Uint32Array.prototype
          : Float32Array.prototype;
      if (Object.getPrototypeOf(value) !== expectedPrototype)
        reject(`Wrong core native array ABI: ${name}.`);
    }
    for (const key of ['positions', 'previousPositions', 'restPositions'])
      if (!same(core.uploads[key], core.physicalInitialPositions))
        reject('Initial/rest/previous content mismatch.');
    if (
      Object.getPrototypeOf(core.physicalInitialPositions) !== Float32Array.prototype ||
      raw(core.physicalInitialPositions).byteLength !== 16 * c.particles
    )
      reject('Physical initial must be exact native Float32 XYZW.');
    let free = 0;
    for (let i = 0; i < c.particles; i++) {
      const w = core.physicalInitialPositions[i * 4 + 3];
      if (!Number.isFinite(w) || w < 0) reject('Invalid physical W.');
      if (w > 0) free++;
    }
    if (free !== input.freeParticleCount) reject('Free count differs from exact physical W.');
    const zeroNames = [
      'velocities',
      'distanceLambdas',
      'continuumLambdas',
      ...(c.seam ? ['seamLambdas'] : []),
      ...(c.bend ? ['bendLambdas', 'bendDiagnostics'] : []),
    ];
    for (const key of zeroNames)
      if (raw(core.uploads[key]).some((v) => v !== 0)) reject(`Initial ${key} must be byte-zero.`);
    if (
      !same(core.uploads.velocityDiagnostics, createXpbdMaterialVelocityDiagnosticsV2()) ||
      !(core.uploads.continuumStatuses instanceof Uint32Array) ||
      core.uploads.continuumStatuses.some((v) => v !== CONTINUUM_STRAIN_VNEXT_STATUS_RESET)
    )
      reject('Wrong diagnostic initialization sentinel.');
    const continuum = source.constraints.continuumStrain;
    for (const [upload, value] of Object.entries({
      continuumTriangles: continuum.triangleIndices,
      continuumRestFrames: continuum.triangleRestFrames,
      continuumMaterialIndices: continuum.materialIndices,
      continuumMaterials: continuum.materialRecords,
    }))
      if (!same(core.uploads[upload], value))
        reject('Strain buffers must retain exact continuum ABI/order.');
    if (raw(continuum.constraintRecords).byteLength !== 16 * c.triangles)
      reject('Inexact continuum provenance records.');
    const sourceTriangleIndices = new Uint32Array(c.triangles),
      renderTriangleIndices = new Uint32Array(c.triangles);
    const provenance = new DataView(continuum.constraintRecords),
      triangles = new DataView(continuum.triangleIndices),
      render = new DataView(source.material.triangleIndices);
    const seen = new Set<number>();
    for (let i = 0; i < c.triangles; i++) {
      const s = provenance.getUint32(16 * i, true),
        r = provenance.getUint32(16 * i + 4, true),
        m = provenance.getUint32(16 * i + 8, true);
      if (
        r >= c.triangles ||
        s !== r ||
        seen.has(r) ||
        m !== continuum.materialIndices[i] ||
        m >= c.materials ||
        provenance.getUint32(16 * i + 12, true) !== 0 ||
        triangles.getUint32(16 * i + 12, true) !== 0
      )
        reject('Invalid strain source/render mapping.');
      for (let k = 0; k < 3; k++)
        if (triangles.getUint32(16 * i + 4 * k, true) !== render.getUint32(16 * r + 4 * k, true))
          reject('Colored strain triangle differs from original render topology.');
      seen.add(r);
      sourceTriangleIndices[i] = s;
      renderTriangleIndices[i] = r;
    }
    const groupCap = Math.min(
      65535,
      limits.maxComputeWorkgroupsPerDimension,
      core.report.budgets.maxWorkgroupsPerDispatch,
    );
    const groups = (count: number) => integer(Math.ceil(count / 64), 0, groupCap, 'workgroups');
    const runs = [core.distance, core.seam, core.bend, core.continuum];
    const totals = [c.distance, c.seam, c.bend, c.continuum];
    runs.forEach((list, index) => {
      let end = 0;
      for (const run of list) {
        integer(run.constraintCount, 1, totals[index], 'run count');
        if (run.constraintOffset !== end || run.workgroups !== groups(run.constraintCount))
          reject('Inexact run extent/workgroups.');
        if (raw(run.params).byteLength !== 16) reject('Inexact solve uniform ABI.');
        const packet =
          index === 0
            ? encodeXpbdDistanceColorParamsV1({
                constraintOffset: run.constraintOffset,
                constraintCount: run.constraintCount,
                complianceMPerN: p.distanceComplianceMPerN,
                dtS: p.dtS,
              })
            : index === 1
              ? packXpbdSeamSolveColorParamsV1(run.constraintOffset, run.constraintCount)
              : index === 2
                ? packXpbdEmbeddedScalarBendColorParamsV2({
                    constraintOffset: run.constraintOffset,
                    constraintCount: run.constraintCount,
                    complianceInvNm: run.complianceInvNm!,
                    dtS: p.dtS,
                  })
                : (() => {
                    const value = new ArrayBuffer(16),
                      view = new DataView(value);
                    view.setUint32(0, run.constraintOffset, true);
                    view.setUint32(4, run.constraintCount, true);
                    view.setFloat32(8, p.dtS, true);
                    return value;
                  })();
        if (!same(run.params, packet)) reject('Solve packet differs from exact scheduled fields.');
        end += run.constraintCount;
      }
      if (end !== totals[index]) reject('Incomplete constraint schedule.');
    });
    const expectedReset = [
      ['distance', c.distance],
      ['seam-all-active', c.seam],
      ['bend', c.bend],
      ['continuum', c.continuum],
    ].filter(([, count]) => count !== 0);
    if (core.resets.length !== expectedReset.length) reject('Missing reset schedule.');
    core.resets.forEach((r, i) => {
      if (
        r.kind !== expectedReset[i][0] ||
        r.count !== expectedReset[i][1] ||
        r.workgroups !== groups(r.count)
      )
        reject('Inexact reset schedule.');
    });
    const seamActivationFields = {
      totalConstraintCount: c.seam,
      activeConstraintCount: c.seam,
      complianceMPerN: p.seamComplianceMPerN,
      dtS: p.dtS,
    };
    const resetPackets: Record<string, () => ArrayBuffer> = {
      distance: () => createXpbdDistanceResetPacketV1(c.distance),
      'seam-all-active': () => createXpbdSeamAllActivePacketV1(seamActivationFields),
      bend: () => createXpbdBendResetPacketV1(c.bend),
      continuum: () => createXpbdContinuumResetPacketV1(c.continuum),
    };
    for (const r of core.resets)
      if (!same(r.params, resetPackets[r.kind]()))
        reject('Reset packet differs from exact counts.');
    if (
      core.seamActivation &&
      !same(core.seamActivation, packXpbdSeamSolveActivationParamsV1(seamActivationFields))
    )
      reject('Seam activation packet differs from all-active profile.');
    if (
      !same(
        core.velocityParams,
        encodeXpbdMaterialVelocityParamsV2({ dtS: p.dtS, particleCount: c.particles }),
      )
    )
      reject('Velocity packet mismatch.');
    core.predictionFrames.forEach((packet, frame) => {
      if (
        !same(
          packet,
          encodeXpbdPredictFrameParamsV1({
            dtS: p.dtS,
            particleCount: c.particles,
            distanceConstraintCount: c.distance,
            gravityMps2Y: p.gravityMps2Y,
            windAccelerationMps2Z: p.windAccelerationMps2Z,
            simulationSeconds: frame * p.dtS,
            damping: 1,
          }),
        )
      )
        reject('Prediction packet mismatch.');
    });
    const expectedUniforms = [
      ...core.predictionFrames,
      core.velocityParams,
      ...runs.flatMap((list) => list.map((r) => r.params)),
      ...core.resets.map((r) => r.params),
      ...(core.seamActivation ? [core.seamActivation] : []),
    ];
    if (
      core.predictionFrames.length !== n ||
      core.uniformPackets.length !== expectedUniforms.length ||
      expectedUniforms.some((v, i) => !same(v, core.uniformPackets[i]))
    )
      reject('Uniform packet list mismatch.');
    if (c.seam > 0 !== (core.seamActivation !== null)) reject('Seam activation packet mismatch.');
    checkIndependent(core.uniformPackets);
    const coreDispatch =
      n *
      (2 +
        core.resets.length +
        p.solverIterations *
          (core.distance.length + 2 * core.seam.length + core.bend.length + core.continuum.length));
    const corePadded =
      n *
      64 *
      (2 * groups(c.particles) +
        core.resets.reduce((a, r) => a + r.workgroups, 0) +
        p.solverIterations *
          [...core.distance, ...core.seam, ...core.bend, ...core.continuum, ...core.seam].reduce(
            (a, r) => a + r.workgroups,
            0,
          ));
    const coreConstraints =
      n *
      (c.distance +
        c.seam +
        c.bend +
        c.continuum +
        p.solverIterations * (c.distance + 2 * c.seam + c.bend + c.continuum));
    const storage = Object.values(core.uploads).reduce((a, v) => sum(a, raw(v).byteLength), 0),
      uniforms = core.uniformPackets.reduce((a, v) => sum(a, raw(v).byteLength), 0);
    if (
      core.report.storageBytes !== storage ||
      core.report.uniformBytes !== uniforms ||
      core.report.coreGpuBytes !== storage + uniforms ||
      core.report.dispatchCount !== coreDispatch ||
      core.report.paddedInvocations !== corePadded ||
      core.report.constraintInvocations !== coreConstraints
    )
      reject('Core accounting mismatch.');
    if (
      limits.maxComputeInvocationsPerWorkgroup < 64 ||
      limits.maxComputeWorkgroupSizeX < 64 ||
      limits.maxBindingsPerBindGroup < 8 ||
      limits.maxStorageBuffersPerShaderStage < 7 ||
      limits.maxUniformBuffersPerShaderStage < 1 ||
      limits.maxBindGroups < 1
    )
      reject('Insufficient device binding/workgroup limits.');
    const checkpoint = fieldsFor(c),
      snapshots = n === 32 ? 2 : 1,
      snapshotBytes = checkpoint.byteLength;
    const strainValuesOffset = product(snapshotBytes, snapshots),
      strainFlagsOffset = sum(strainValuesOffset, 16 * c.triangles);
    const readback = Object.freeze({
      byteLength: sum(strainFlagsOffset, 4 * c.triangles),
      frame16Offset: 0,
      finalOffset: n === 32 ? snapshotBytes : 0,
      strainValuesOffset,
      strainFlagsOffset,
    });
    const allocations: {
      name: string;
      byteLength: number;
      kind: 'storage' | 'uniform' | 'checkpoint' | 'readback';
    }[] = [];
    const add = (name: string, byteLength: number, kind: (typeof allocations)[number]['kind']) => {
      if (byteLength === 0) return;
      integer(byteLength, 4, limits.maxBufferSize, name);
      if (
        byteLength % 4 ||
        (kind === 'storage' && byteLength > limits.maxStorageBufferBindingSize) ||
        (kind === 'uniform' && byteLength > limits.maxUniformBufferBindingSize)
      )
        reject(`Device buffer/binding limit: ${name}.`);
      allocations.push(Object.freeze({ name, byteLength, kind }));
    };
    for (const [name, value] of Object.entries(core.uploads))
      add(name, raw(value).byteLength, 'storage');
    core.uniformPackets.forEach((v, i) => add(`coreUniform:${i}`, raw(v).byteLength, 'uniform'));
    add('bodyPositions', 12 * bodyVertexCount, 'storage');
    add('bodyTriangles', 12 * bodyTriangleCount, 'storage');
    add('contactParams', 32, 'uniform');
    add('contactDiagnostics', 40, 'storage');
    add('strainParams', 16, 'uniform');
    add('strainValues', 16 * c.triangles, 'storage');
    add('strainFlags', 4 * c.triangles, 'storage');
    if (!c.bend) add('bendDiagnostics', 8, 'storage');
    if (n === 32) add('frame16Checkpoint', snapshotBytes, 'checkpoint');
    add('readback', readback.byteLength, 'readback');
    const fullGpuBytes = allocations.reduce((a, v) => sum(a, v.byteLength), 0);
    const bodyBytes = sum(12 * bodyVertexCount, 12 * bodyTriangleCount);
    const inputUploadBytes = sum(
      storage,
      uniforms,
      bodyBytes,
      32,
      40,
      16,
      20 * c.triangles,
      c.bend ? 0 : 8,
    );
    // Explicitly account for the fixed executor's allocations, even when separate peaks occur.
    // R: combined mapped readback, S: one complete checkpoint, Q: one sealed strain port.
    // Frame32 also retains its16-prefix plan and the borrowed genuine16 receipt during replay.
    const strainPortBytes = sum(16 * c.particles, 64 * c.triangles, 16 * c.materials);
    const cpuStaging = Object.freeze({
      scope: 'per-execution-binary-upload-checkpoint-and-strain-staging' as const,
      exclusions: Object.freeze([
        'compiler-and-geometric-validator-heap',
        'objects-strings-and-report-serialization',
        'borrowed-owner-internal-capture-and-hashing',
        'repeated-public-projection-results',
        'implementation-internal-webgpu-and-crypto-storage',
      ]),
      components: Object.freeze({
        coreCaptureAndInput: product(n === 32 ? 3 : 2, capturedCoreBytes),
        uploadTransfer: inputUploadBytes,
        bodyProjection: product(3, bodyBytes),
        extraInitial: sum(88, 28 * c.triangles, c.bend ? 0 : 8),
        readbackMapping: product(2, readback.byteLength),
        // Both16/32 create two S-byte slices and two decoded S-byte states. Add a checkpoint
        // hash copy and the minted receipt checkpoint copy; no accidental slack from other terms.
        checkpointCopies: product(6, snapshotBytes),
        // Decoded GPU result20T, CPU oracle16T, retained result+maps28T, parallel hashes28T.
        strainDecodedOracleReceiptAndHash: product(92, c.triangles),
        // Port snapshot plus conservative full-Q allowances for LE conversion and digest copy.
        strainPortAndHash: product(3, strainPortBytes),
        priorReceipt: n === 32 ? sum(2 * snapshotBytes, 28 * c.triangles) : 0,
      }),
    });
    const cpuStagingBytes = sum(...Object.values(cpuStaging.components));
    const fieldCopies = Object.values(checkpoint.fields).filter((f) => f.byteLength > 0).length;
    const work = Object.freeze({
      contactWorkgroups: groups(c.particles),
      strainWorkgroups: groups(c.triangles),
      dispatchCount: sum(coreDispatch, n, 1),
      paddedInvocations: sum(corePadded, n * 64 * groups(c.particles), 64 * groups(c.triangles)),
      coreConstraintInvocations: coreConstraints,
      contactTriangleVisits: product(n, free, bodyTriangleCount),
      copyCount: n === 32 ? 2 * fieldCopies + 3 : fieldCopies + 2,
      copyBytes: sum((n === 32 ? 3 : 1) * snapshotBytes, 20 * c.triangles),
      submissionCount: n + 1,
      initialUploadCount:
        Object.values(core.uploads).filter((v) => raw(v).byteLength > 0).length +
        core.uniformPackets.length +
        7 +
        (c.bend ? 0 : 1),
    });
    for (const [value, budget, label] of [
      [fullGpuBytes, budgets.maxGpuBytes, 'GPU bytes'],
      [cpuStagingBytes, budgets.maxCpuBytes, 'CPU staging bytes'],
      [work.dispatchCount, budgets.maxDispatches, 'dispatches'],
      [work.paddedInvocations, budgets.maxPaddedInvocations, 'padded invocations'],
      [work.contactTriangleVisits, budgets.maxContactTriangleVisits, 'body triangle visits'],
      [work.copyCount, budgets.maxCopies, 'copies'],
      [work.copyBytes, budgets.maxCopyBytes, 'copy bytes'],
      [work.submissionCount, budgets.maxSubmissions, 'submissions'],
    ] as const)
      if (value > budget) reject(`${label} budget exceeded.`);
    const contactParams = packActualBodyTriangleMeshContactParamsV2({
      particleCount: c.particles,
      bodyVertexCount,
      bodyTriangleCount,
      clearanceMarginM: 0.002,
      maximumCorrectionM: 0.08,
      minimumNormalLengthSquaredM4: 1e-20,
      outwardNormalSign: input.bodyOutwardSign,
    });
    const strainParams = new ArrayBuffer(16),
      sv = new DataView(strainParams);
    sv.setUint32(0, c.triangles, true);
    sv.setUint32(4, c.particles, true);
    sv.setUint32(8, c.materials, true);
    const contactDiagnostics = new Uint32Array(10);
    contactDiagnostics[6] = U32;
    const layout: GarmentMaterialContactExecutionLayoutV1 = Object.freeze({
      schemaVersion: GARMENT_MATERIAL_CONTACT_EXECUTION_LAYOUT_V1,
      profile: input.profile,
      corePlanSha256: core.planSha256,
      counts: Object.freeze({ ...c }),
      bodyVertexCount,
      bodyTriangleCount,
      freeParticleCount: free,
      frameCount: n,
      solverIterations: p.solverIterations,
      checkpoint,
      snapshotBytes,
      readback,
      allocations: Object.freeze(allocations),
      fullGpuBytes,
      cpuStagingBytes,
      cpuStaging,
      capturedCoreBytes,
      inputUploadBytes,
      work,
      uploads: Object.freeze(core.uploads),
      uniformPackets: Object.freeze(core.uniformPackets),
      contactParams,
      strainParams,
      contactDiagnostics,
      bendDiagnostics: c.bend ? (core.uploads.bendDiagnostics as Uint32Array) : new Uint32Array(2),
      strainValues: new Float32Array(4 * c.triangles),
      strainFlags: new Uint32Array(c.triangles).fill(U32),
      strainOrder: Object.freeze({ sourceTriangleIndices, renderTriangleIndices }),
      claims: Object.freeze({
        contentOnly: true,
        sourcePersistenceAuthenticated: false,
        gpuExecutionPerformed: false,
        runtimeAuthority: false,
        continuationAuthority: false,
      }),
    });
    return { ok: true as const, layout, blockers: [] as const };
  } catch (error) {
    return {
      ok: false as const,
      layout: null,
      blockers: [
        {
          code: 'execution-layout-refused',
          detail: error instanceof Error ? error.message : 'Layout refused.',
        },
      ],
    };
  }
}

type CheckpointMetadata = Pick<
  GarmentMaterialContactExecutionLayoutV1,
  | 'schemaVersion'
  | 'profile'
  | 'counts'
  | 'frameCount'
  | 'solverIterations'
  | 'freeParticleCount'
  | 'bodyTriangleCount'
  | 'snapshotBytes'
  | 'checkpoint'
>;
function selectData<T>(input: unknown, keys: readonly string[], exactKeys = false): T {
  if (!input || Object.getPrototypeOf(input) !== Object.prototype)
    reject('Checkpoint metadata must be plain own data.');
  const ds = Object.getOwnPropertyDescriptors(input);
  if (
    (exactKeys && Reflect.ownKeys(ds).length !== keys.length) ||
    keys.some((key) => !ds[key] || !('value' in ds[key]) || !ds[key].enumerable)
  )
    reject('Checkpoint metadata accessors or inexact fields refused.');
  return Object.fromEntries(keys.map((key) => [key, ds[key].value])) as T;
}
function checkedCheckpointLayout(layout: GarmentMaterialContactExecutionLayoutV1) {
  // This API is content-only and accepts structural input: capture narrow own descriptors ONCE,
  // including nested offsets and every counter bound, before validation/allocation. Never reread it.
  const metadata = selectData<CheckpointMetadata>(layout, [
    'schemaVersion',
    'profile',
    'counts',
    'frameCount',
    'solverIterations',
    'freeParticleCount',
    'bodyTriangleCount',
    'snapshotBytes',
    'checkpoint',
  ]);
  const counts = selectData<Counts>(
    metadata.counts,
    ['particles', 'triangles', 'distance', 'seam', 'bend', 'continuum', 'materials'],
    true,
  );
  const declared = selectData<{ byteLength: number; fields: unknown }>(
    metadata.checkpoint,
    ['byteLength', 'fields'],
    true,
  );
  const fieldKeys = [
    'positions',
    'previousPositions',
    'velocities',
    'distanceLambdas',
    'seamLambdas',
    'bendLambdas',
    'continuumLambdas',
    'velocityDiagnostics',
    'bendDiagnostics',
    'contactDiagnostics',
    'continuumStatuses',
  ] as const;
  const rawFields = selectData<Record<Field, unknown>>(declared.fields, fieldKeys, true);
  const capturedFields = Object.fromEntries(
    fieldKeys.map((key) => [
      key,
      selectData<Extent>(rawFields[key], ['offset', 'byteLength'], true),
    ]),
  ) as Record<Field, Extent>;
  if (
    metadata.schemaVersion !== GARMENT_MATERIAL_CONTACT_EXECUTION_LAYOUT_V1 ||
    metadata.profile !== GARMENT_MATERIAL_CONTACT_REPLAY_PROFILE_V1
  )
    reject('Checkpoint layout profile mismatch.');
  integer(counts.particles, 1, 2000, 'particles');
  integer(counts.triangles, 1, 5000, 'triangles');
  integer(counts.materials, 1, 4096, 'materials');
  for (const k of ['distance', 'seam', 'bend', 'continuum'] as const)
    integer(counts[k], 0, 120000, k);
  if (counts.continuum !== counts.triangles || ![16, 32].includes(metadata.frameCount))
    reject('Checkpoint frame/continuum mismatch.');
  integer(metadata.solverIterations, 1, 64, 'iterations');
  integer(metadata.freeParticleCount, 0, counts.particles, 'free particles');
  integer(metadata.bodyTriangleCount, 4, 30000, 'body triangles');
  const expected = fieldsFor(counts);
  if (metadata.snapshotBytes !== expected.byteLength || declared.byteLength !== expected.byteLength)
    reject('Checkpoint byte length mismatch.');
  for (const key of fieldKeys)
    if (
      capturedFields[key].offset !== expected.fields[key].offset ||
      capturedFields[key].byteLength !== expected.fields[key].byteLength
    )
      reject('Checkpoint offset mismatch.');
  return { shape: expected, metadata: { ...metadata, counts } };
}
/** Serializes historical bytes only. Non-finite failed state is preserved for the physical validator. */
export function packGarmentMaterialContactCheckpointV1(
  layout: GarmentMaterialContactExecutionLayoutV1,
  input: GarmentMaterialContactCheckpointV1,
): Uint8Array {
  const { shape } = checkedCheckpointLayout(layout);
  exact(input, Object.keys(shape.fields));
  const descriptors = Object.getOwnPropertyDescriptors(input);
  const inputs: Bytes[] = [];
  for (const key of Object.keys(shape.fields) as Field[]) {
    const value = descriptors[key].value!,
      f = shape.fields[key];
    if (
      Object.getPrototypeOf(value) !==
        (diagnosticFields.has(key) ? Uint32Array.prototype : Float32Array.prototype) ||
      raw(value).byteLength !== f.byteLength
    )
      reject(`Checkpoint field extent/type mismatch: ${key}.`);
    inputs.push(value);
  }
  checkIndependent(inputs);
  const output = new Uint8Array(shape.byteLength);
  for (const key of Object.keys(shape.fields) as Field[])
    output.set(raw(descriptors[key].value), shape.fields[key].offset);
  return output;
}
function bitsFloat(bits: number) {
  const v = new DataView(new ArrayBuffer(4));
  v.setUint32(0, bits, true);
  return v.getFloat32(0, true);
}
/** Bounds and ABI validation, NOT a zero-error/physical/admission gate. */
export function decodeGarmentMaterialContactCheckpointV1(
  layout: GarmentMaterialContactExecutionLayoutV1,
  bytes: ArrayBuffer | Uint8Array,
  completedFrames: 16 | 32,
): GarmentMaterialContactCheckpointV1 {
  const { shape, metadata } = checkedCheckpointLayout(layout);
  if (![16, 32].includes(completedFrames) || completedFrames > metadata.frameCount)
    reject('Invalid completed-frame bound.');
  integer(metadata.solverIterations, 1, 64, 'iterations');
  integer(metadata.freeParticleCount, 0, metadata.counts.particles, 'free particles');
  integer(metadata.bodyTriangleCount, 4, 30000, 'body triangles');
  if (
    Object.getPrototypeOf(bytes) !== ArrayBuffer.prototype &&
    Object.getPrototypeOf(bytes) !== Uint8Array.prototype
  )
    reject('Checkpoint requires native bytes.');
  const copy = raw(bytes);
  if (copy.byteLength !== shape.byteLength) reject('Inexact checkpoint bytes.');
  const result = {} as Record<Field, Float32Array | Uint32Array>;
  for (const key of Object.keys(shape.fields) as Field[]) {
    const f = shape.fields[key],
      b = copy.slice(f.offset, f.offset + f.byteLength).buffer;
    result[key] = diagnosticFields.has(key) ? new Uint32Array(b) : new Float32Array(b);
  }
  const v = result.velocityDiagnostics as Uint32Array,
    b = result.bendDiagnostics as Uint32Array,
    c = result.contactDiagnostics as Uint32Array;
  const particleEvents = product(completedFrames, metadata.counts.particles),
    freeEvents = product(completedFrames, metadata.freeParticleCount),
    visits = product(freeEvents, metadata.bodyTriangleCount),
    bendEvents = product(completedFrames, metadata.solverIterations, metadata.counts.bend);
  for (const value of [v[0], v[1], v[2]]) integer(value, 0, particleEvents, 'velocity event count');
  if (v[0] !== v[1] + v[2] || v[7] !== 0) reject('Velocity diagnostic sum/reserved mismatch.');
  for (const [count, index] of [
    [v[0], v[3]],
    [v[1], v[4]],
    [v[2], v[5]],
  ])
    if (count === 0 ? index !== U32 : index >= metadata.counts.particles)
      reject('Velocity minimum sentinel/index mismatch.');
  if (v[3] !== Math.min(v[4], v[5])) reject('Velocity aggregate minimum mismatch.');
  const domainMax = bitsFloat(v[6]);
  if (v[2] === 0 ? v[6] !== 0 : !Number.isFinite(domainMax) || domainMax < 100 || domainMax >= 1e30)
    reject('Velocity domain maximum mismatch.');
  integer(b[0], 0, bendEvents, 'bend invalid');
  integer(b[1], 0, bendEvents, 'bend limited');
  if (b[0] + b[1] > bendEvents) reject('Bend event total exceeds dispatch work.');
  integer(c[0], 0, freeEvents, 'contact corrected');
  integer(c[1], 0, particleEvents, 'contact invalid');
  integer(c[2], 0, visits, 'degenerate visits');
  integer(c[3], 0, visits, 'out-of-range visits');
  integer(c[7], 0, c[0], 'inward clamps');
  if (c[0] + c[1] > particleEvents || c[2] + c[3] > visits || c[9] !== 0)
    reject('Contact cumulative/reserved mismatch.');
  const correction = bitsFloat(c[4]),
    penetration = bitsFloat(c[5]),
    removed = bitsFloat(c[8]);
  if (
    c[0] === 0
      ? c[4] !== 0 || c[5] !== 0 || c[6] !== U32 || c[7] !== 0 || c[8] !== 0
      : c[6] >= metadata.counts.particles ||
        !Number.isFinite(correction) ||
        correction <= 0 ||
        correction > Math.fround(0.08) ||
        !Number.isFinite(penetration) ||
        penetration < 0 ||
        c[5] >= 0x80000000 ||
        penetration >= 1e30
  )
    reject('Contact correction/sentinel mismatch.');
  if (c[7] === 0 ? c[8] !== 0 : !Number.isFinite(removed) || removed <= 0 || removed >= 1e30)
    reject('Inward clamp maximum mismatch.');
  for (const status of result.continuumStatuses as Uint32Array)
    if (status !== U32 && status > 4) reject('Unknown continuum status code.');
  return Object.freeze(result) as GarmentMaterialContactCheckpointV1;
}
