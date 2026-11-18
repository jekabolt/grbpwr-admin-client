import type { SimulationPackageV5 } from '../../compiler/simulation-package';
import {
  validateSealedSimulationPackageV5V1,
  type SealedSimulationPackageV5V1,
} from '../../compiler/simulation-package-v5-integrity';
import { decodeClothMaterialGpuV1, decodeParticleMassGpuV1 } from '../../compiler/material-package';
import type { ClothMeshPieceRange } from '../../mesh/cloth-mesh-ir';
import {
  deriveXpbdParticleMaterialRetentionV2,
  encodeXpbdMaterialVelocityParamsV2,
  XPBD_MATERIAL_VELOCITY_KERNEL_V2,
  XPBD_MATERIAL_VELOCITY_SOURCE_SHA256_V2,
  XPBD_MATERIAL_VELOCITY_ABI_V2,
  createXpbdMaterialVelocityDiagnosticsV2,
} from './xpbd-material-velocity-kernel-v2';
import {
  encodeXpbdPredictFrameParamsV1,
  XPBD_PREDICT_KERNEL_V1,
  XPBD_PREDICT_SOURCE_SHA256_V1,
} from './xpbd-predict-kernel-v1';
import {
  encodeXpbdDistanceColorParamsV1,
  XPBD_DISTANCE_KERNEL_V1,
  XPBD_DISTANCE_SOURCE_SHA256_V1,
} from './xpbd-distance-kernel-v1';
import {
  createXpbdSeamSolveColorScheduleV1,
  packXpbdSeamSolveColorParamsV1,
  packXpbdSeamSolveActivationParamsV1,
  XPBD_SEAM_SOLVE_KERNEL_V1,
  XPBD_SEAM_SOLVE_SOURCE_SHA256_V1,
} from './xpbd-seam-solve-kernel-v1';
import {
  createXpbdEmbeddedScalarBendColorScheduleV2,
  packXpbdEmbeddedScalarBendColorParamsV2,
  XPBD_EMBEDDED_SCALAR_BEND_KERNEL_V2,
  XPBD_EMBEDDED_SCALAR_BEND_SOURCE_SHA256_V2,
  XPBD_EMBEDDED_SCALAR_BEND_DIAGNOSTICS_BYTES_V2,
} from './xpbd-embedded-scalar-bend-kernel-v2';
import {
  CONTINUUM_STRAIN_VNEXT_KERNEL_V1,
  CONTINUUM_STRAIN_VNEXT_SOURCE_SHA256_V1,
  CONTINUUM_STRAIN_VNEXT_STATUS_RESET,
} from './triangle-strain-continuum-vnext-kernel';
import {
  createXpbdDistanceResetPacketV1,
  createXpbdSeamAllActivePacketV1,
  createXpbdBendResetPacketV1,
  createXpbdContinuumResetPacketV1,
} from './xpbd-initialization-core-reset';
import { XPBD_INITIALIZATION_CORE_RESET_KERNEL_IDENTITIES_V1 } from './xpbd-initialization-core-reset-kernels';

export const GARMENT_MATERIAL_RUN_PLAN_V1 = 'garment-material-run-plan/1' as const;
export type GarmentMaterialRunParametersV1 = Readonly<{
  dtS: number;
  solverIterations: number;
  frameCount: number;
  gravityMps2Y: number;
  windAccelerationMps2Z: number;
  distanceComplianceMPerN: number;
  seamComplianceMPerN: number;
}>;
export type GarmentMaterialRunBudgetsV1 = Readonly<{
  maxParticles: number;
  maxTriangles: number;
  maxConstraintCount: number;
  maxGpuBytes: number;
  maxDispatches: number;
  maxConstraintInvocations: number;
  maxWorkgroupsPerDispatch: number;
}>;
export type GarmentMaterialRunPlanRequestV1 = Readonly<{
  schemaVersion: typeof GARMENT_MATERIAL_RUN_PLAN_V1;
  sealedSimulation: SealedSimulationPackageV5V1;
  expectedPackageSha256: string;
  pieceRanges: readonly ClothMeshPieceRange[];
  parameters: GarmentMaterialRunParametersV1;
  budgets: GarmentMaterialRunBudgetsV1;
}>;
const CLAIMS = Object.freeze({
  contentConsistencyOnly: true,
  sealedV5Validated: true,
  physicalInverseMassDerivedFromMaterialRecords: true,
  sourcePackageBytesPreserved: true,
  particleMaterialRetentionDerivedWithoutAveraging: true,
  bendMaterialRunsDoNotReorderConstraints: true,
  gpuExecutionPerformed: false,
  deviceLimitsAuthenticated: false,
  pieceRangesSourceAuthenticated: false,
  bodyAuthority: false,
  sourcePersistenceAuthenticated: false,
  storageAuthority: false,
  runtimeAuthority: false,
  contactOrFrictionIntegrated: false,
  assemblyOperationScheduleExecuted: false,
  supportPolicyQualifiedForWear: false,
  fitClaimed: false,
  productionReady: false,
} as const);
const MAX = {
  particles: 20_000,
  triangles: 40_000,
  constraints: 120_000,
  gpuBytes: 256 * 1024 * 1024,
  dispatches: 1_000_000,
  constraintInvocations: 500_000_000,
  workgroups: 65535,
};
const aborted = Object.getOwnPropertyDescriptor(AbortSignal.prototype, 'aborted')!.get!;
const abLength = Object.getOwnPropertyDescriptor(ArrayBuffer.prototype, 'byteLength')!.get!;
const tp = Object.getPrototypeOf(Float32Array.prototype);
const tb = Object.getOwnPropertyDescriptor(tp, 'buffer')!.get!,
  to = Object.getOwnPropertyDescriptor(tp, 'byteOffset')!.get!,
  tl = Object.getOwnPropertyDescriptor(tp, 'byteLength')!.get!,
  tn = Object.getOwnPropertyDescriptor(tp, 'length')!.get!;
const byteSet = Uint8Array.prototype.set;
class PlanBlocked extends Error {
  constructor(
    readonly code: string,
    detail: string,
  ) {
    super(detail);
  }
}
function fail(code: string, detail: string): never {
  throw new PlanBlocked(code, detail);
}
function check(signal?: AbortSignal) {
  if (signal !== undefined && aborted.call(signal))
    fail('cancelled', 'Plan creation was cancelled.');
}
function capture(input: unknown): unknown {
  let nodes = 0,
    totalBytes = 0;
  const active = new Set<object>();
  const copy = (value: unknown, depth: number): unknown => {
    if (++nodes > 1_000_000 || depth > 40)
      fail('input-bound-exceeded', 'Plan snapshot exceeds its structural budget.');
    if (value === null || typeof value === 'boolean') return value;
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string' && value.length <= 4096) return value;
    if (!value || typeof value !== 'object' || active.has(value))
      fail('invalid-input', 'Only acyclic finite data is accepted.');
    const p = Object.getPrototypeOf(value),
      buffer = p === ArrayBuffer.prototype,
      typed = p === Float32Array.prototype || p === Uint32Array.prototype;
    if (buffer || typed) {
      const source = buffer ? value : tb.call(value);
      if (Object.getPrototypeOf(source) !== ArrayBuffer.prototype)
        fail('invalid-input', 'Shared buffers are not accepted.');
      const n = buffer ? abLength.call(value) : tl.call(value);
      totalBytes += n;
      if (n > 32 * 1024 * 1024 || totalBytes > 64 * 1024 * 1024)
        fail('input-bound-exceeded', 'Plan snapshot exceeds its byte budget.');
      const length = buffer ? 0 : tn.call(value),
        descriptors = Object.getOwnPropertyDescriptors(value);
      for (const key of Reflect.ownKeys(descriptors)) {
        const d = descriptors[key as string];
        if (
          buffer ||
          typeof key !== 'string' ||
          !/^(0|[1-9][0-9]*)$/.test(key) ||
          Number(key) >= length ||
          !('value' in d) ||
          !d.enumerable
        )
          fail('invalid-input', 'Buffer shadow properties/accessors are not accepted.');
      }
      const result = new ArrayBuffer(n);
      byteSet.call(
        new Uint8Array(result),
        new Uint8Array(source as ArrayBuffer, buffer ? 0 : to.call(value), n),
      );
      return buffer
        ? result
        : p === Float32Array.prototype
          ? new Float32Array(result)
          : new Uint32Array(result);
    }
    const array = Array.isArray(value);
    if (p !== (array ? Array.prototype : Object.prototype))
      fail('invalid-input', 'Unsupported object prototype.');
    const length = array ? Object.getOwnPropertyDescriptor(value, 'length')!.value : 0;
    if (length > 500_000) fail('input-bound-exceeded', 'Plan array bound exceeded.');
    const descriptors = Object.getOwnPropertyDescriptors(value);
    if (array && Reflect.ownKeys(descriptors).length !== length + 1)
      fail('invalid-input', 'Arrays must be dense.');
    active.add(value);
    const out: unknown[] | Record<string, unknown> = array ? [] : {};
    for (const key of Reflect.ownKeys(descriptors)) {
      if (array && key === 'length') continue;
      const d = descriptors[key as string];
      if (
        typeof key !== 'string' ||
        key === '__proto__' ||
        !('value' in d) ||
        !d.enumerable ||
        (array && !/^(0|[1-9][0-9]*)$/.test(key))
      )
        fail('invalid-input', 'Accessors, symbols and hidden fields are not accepted.');
      Object.defineProperty(out, key, {
        value: copy(d.value, depth + 1),
        enumerable: true,
        writable: true,
        configurable: true,
      });
    }
    active.delete(value);
    return out;
  };
  return copy(input, 0);
}
function raw(value: ArrayBuffer | ArrayBufferView): Uint8Array {
  return value instanceof ArrayBuffer
    ? new Uint8Array(value)
    : new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
}
function canonical(value: unknown): string {
  if (value instanceof ArrayBuffer || ArrayBuffer.isView(value))
    return JSON.stringify({
      kind:
        value instanceof ArrayBuffer
          ? 'ArrayBuffer'
          : value instanceof Float32Array
            ? 'Float32Array'
            : 'Uint32Array',
      hex: Array.from(raw(value), (b) => b.toString(16).padStart(2, '0')).join(''),
    });
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  return `{${Object.keys(value)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${canonical((value as Record<string, unknown>)[k])}`)
    .join(',')}}`;
}
async function hashBytes(value: ArrayBuffer | ArrayBufferView) {
  return Array.from(
    new Uint8Array(await crypto.subtle.digest('SHA-256', new Uint8Array(raw(value)))),
    (b) => b.toString(16).padStart(2, '0'),
  ).join('');
}
function freeze<T>(value: T): T {
  if (
    value &&
    typeof value === 'object' &&
    !(value instanceof ArrayBuffer) &&
    !ArrayBuffer.isView(value)
  ) {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}
function exact(value: unknown, keys: readonly string[]): boolean {
  return (
    !!value &&
    typeof value === 'object' &&
    Object.keys(value).sort().join('\0') === [...keys].sort().join('\0')
  );
}
function integer(value: number, min: number, max: number, label: string) {
  if (!Number.isSafeInteger(value) || value < min || value > max)
    fail('invalid-bound', `${label} must be an integer in [${min},${max}].`);
}
/** Zero is intentionally a no-dispatch result, never a zero-sized WebGPU dispatch. */
export function garmentMaterialRunWorkgroupsV1(count: number, maxGroups: number): number {
  integer(count, 0, 0xffffffff, 'dispatch count');
  integer(maxGroups, 1, 65535, 'workgroup budget');
  const result = Math.ceil(count / 64);
  if (result > maxGroups)
    fail('workgroup-budget-exceeded', 'Dispatch exceeds its explicit workgroup budget.');
  return result;
}
type Run = Readonly<{
  color: number;
  constraintOffset: number;
  constraintCount: number;
  workgroups: number;
  params: ArrayBuffer;
  materialIndex?: number;
  complianceInvNm?: number;
}>;

export function buildXpbdMechanicalColorRunsV1(
  input: Readonly<{
    counts: Readonly<{ particles: number; bend: number }>;
    distance: SimulationPackageV5['constraints']['distance'];
    bend: SimulationPackageV5['constraints']['bend'];
    continuum: SimulationPackageV5['constraints']['continuumStrain'];
    parameters: Pick<GarmentMaterialRunParametersV1, 'distanceComplianceMPerN' | 'dtS'>;
    bendLambdas: Float32Array;
    particleMaterialIndices: Uint32Array;
    materials: readonly ReturnType<typeof decodeClothMaterialGpuV1>[];
    workgroups: (count: number) => number;
  }>,
) {
  const {
    counts,
    distance: d,
    bend,
    continuum: c,
    parameters: p,
    bendLambdas,
    particleMaterialIndices,
    materials,
    workgroups,
  } = input;
  const distance: Run[] = d.colorRanges.map((r, color) => {
    if (r.color !== color)
      fail('color-order-mismatch', 'Distance color identities must remain in compiler order.');
    return {
      color,
      constraintOffset: r.offset,
      constraintCount: r.count,
      workgroups: workgroups(r.count),
      params: encodeXpbdDistanceColorParamsV1({
        constraintOffset: r.offset,
        constraintCount: r.count,
        complianceMPerN: p.distanceComplianceMPerN,
        dtS: p.dtS,
      }),
    };
  });
  const bendColors =
    counts.bend === 0
      ? []
      : createXpbdEmbeddedScalarBendColorScheduleV2({
          particleCount: counts.particles,
          constraintCount: counts.bend,
          complianceInvNm: 0,
          dtS: p.dtS,
          vertexQuads: bend.vertexQuads,
          restAnglesRad: bend.restAnglesRad,
          lambdasKgM2: bendLambdas,
          colorRanges: bend.colorRanges,
        });
  const bendRuns: Run[] = [];
  for (const color of bendColors) {
    let start = color.constraintOffset;
    while (start < color.constraintOffset + color.constraintCount) {
      const materialIndex = particleMaterialIndices[bend.vertexQuads[start * 4]];
      let end = start;
      while (end < color.constraintOffset + color.constraintCount) {
        const ids = [0, 1, 2, 3].map((k) => particleMaterialIndices[bend.vertexQuads[end * 4 + k]]);
        if (ids.some((id) => id !== ids[0]))
          fail(
            'cross-material-bend-unsupported',
            'A scalar hinge cannot span different material assignments.',
          );
        if (ids[0] !== materialIndex) break;
        end++;
      }
      const count = end - start,
        complianceInvNm = materials[materialIndex].bendComplianceInvNm.warp;
      bendRuns.push({
        color: color.color,
        constraintOffset: start,
        constraintCount: count,
        materialIndex,
        complianceInvNm,
        workgroups: workgroups(count),
        params: packXpbdEmbeddedScalarBendColorParamsV2({
          constraintOffset: start,
          constraintCount: count,
          complianceInvNm,
          dtS: p.dtS,
        }),
      });
      start = end;
    }
  }
  const continuum: Run[] = Array.from({ length: c.colorCount }, (_, color) => {
    const offset = c.colorRanges[color * 2],
      count = c.colorRanges[color * 2 + 1],
      params = new ArrayBuffer(16),
      view = new DataView(params);
    view.setUint32(0, offset, true);
    view.setUint32(4, count, true);
    view.setFloat32(8, Math.fround(p.dtS), true);
    return {
      color,
      constraintOffset: offset,
      constraintCount: count,
      workgroups: workgroups(count),
      params,
    };
  });
  return { distance, bendRuns, continuum };
}

export async function buildGarmentMaterialRunPlanV1(input: unknown, signal?: AbortSignal) {
  let stage = 'capture';
  try {
    check(signal);
    const request = capture(input) as GarmentMaterialRunPlanRequestV1;
    if (
      !exact(request, [
        'schemaVersion',
        'sealedSimulation',
        'expectedPackageSha256',
        'pieceRanges',
        'parameters',
        'budgets',
      ]) ||
      request.schemaVersion !== GARMENT_MATERIAL_RUN_PLAN_V1 ||
      typeof request.expectedPackageSha256 !== 'string' ||
      !/^[0-9a-f]{64}$/.test(request.expectedPackageSha256) ||
      !Array.isArray(request.pieceRanges)
    )
      fail('invalid-input', 'Exact versioned plan request fields are required.');
    const p = request.parameters,
      b = request.budgets;
    if (
      !exact(p, [
        'dtS',
        'solverIterations',
        'frameCount',
        'gravityMps2Y',
        'windAccelerationMps2Z',
        'distanceComplianceMPerN',
        'seamComplianceMPerN',
      ]) ||
      !exact(b, [
        'maxParticles',
        'maxTriangles',
        'maxConstraintCount',
        'maxGpuBytes',
        'maxDispatches',
        'maxConstraintInvocations',
        'maxWorkgroupsPerDispatch',
      ])
    )
      fail('invalid-input', 'All plan parameters and resource budgets must be explicit.');
    for (const [value, limit, name] of [
      [b.maxParticles, MAX.particles, 'maxParticles'],
      [b.maxTriangles, MAX.triangles, 'maxTriangles'],
      [b.maxConstraintCount, MAX.constraints, 'maxConstraintCount'],
      [b.maxGpuBytes, MAX.gpuBytes, 'maxGpuBytes'],
      [b.maxDispatches, MAX.dispatches, 'maxDispatches'],
      [b.maxConstraintInvocations, MAX.constraintInvocations, 'maxConstraintInvocations'],
      [b.maxWorkgroupsPerDispatch, MAX.workgroups, 'maxWorkgroupsPerDispatch'],
    ] as const)
      integer(value, 1, limit, name);
    integer(p.frameCount, 1, 32, 'frameCount');
    integer(p.solverIterations, 1, 64, 'solverIterations');
    if (
      !Number.isFinite(p.dtS) ||
      p.dtS <= 0 ||
      !Number.isFinite(Math.fround(p.dtS)) ||
      Math.fround(p.dtS) <= 0
    )
      fail('invalid-parameters', 'dt must be positive and representable in Float32.');
    for (const v of [
      p.gravityMps2Y,
      p.windAccelerationMps2Z,
      p.distanceComplianceMPerN,
      p.seamComplianceMPerN,
    ])
      if (!Number.isFinite(v) || Math.abs(Math.fround(v)) >= 1e30)
        fail('invalid-parameters', 'Parameters exceed the kernel finite Float32 domain.');
    if (p.distanceComplianceMPerN < 0 || p.seamComplianceMPerN < 0)
      fail('invalid-parameters', 'Compliance cannot be negative.');
    stage = 'sealed-v5';
    if (request.sealedSimulation.seal.aggregateSha256 !== request.expectedPackageSha256)
      fail('source-seal-mismatch', 'Expected package SHA differs.');
    const verified = await validateSealedSimulationPackageV5V1(request.sealedSimulation);
    check(signal);
    if (!verified.ok) fail('invalid-sealed-v5', verified.errors.join('; '));
    const s = verified.simulation,
      m = s.manifest;
    const counts = {
      particles: m.particleCount,
      triangles: m.triangleCount,
      distance: m.distanceConstraintCount,
      seam: m.seamConstraintCount,
      bend: m.bendConstraintCount,
      continuum: m.continuumConstraintCount,
      materials: m.materialCount,
    };
    integer(counts.particles, 1, b.maxParticles, 'particle count');
    integer(counts.triangles, 1, b.maxTriangles, 'triangle count');
    for (const value of [counts.distance, counts.seam, counts.bend, counts.continuum])
      integer(value, 0, b.maxConstraintCount, 'constraint count');
    if (
      p.dtS !== s.material.manifest.solver.dtS ||
      p.solverIterations !== s.material.manifest.solver.iterations
    )
      fail(
        'material-solver-mismatch',
        'Requested dt/iterations must match the sealed material compile contract.',
      );
    stage = 'material-and-coverage';
    for (const range of request.pieceRanges)
      if (
        !exact(range, ['pieceId', 'vertexOffset', 'vertexCount', 'triangleOffset', 'triangleCount'])
      )
        fail('piece-range-invalid', 'Piece ranges require exactly their compiler fields.');
    const retention = deriveXpbdParticleMaterialRetentionV2(s.material, request.pieceRanges);
    const materials = Array.from({ length: counts.materials }, (_, index) =>
      decodeClothMaterialGpuV1(s.material.materialRecords, index),
    );
    for (const material of materials) {
      const r = material.validSolverRange;
      if (
        ![r.minDtS, r.maxDtS, r.minIterations, r.maxIterations].every(Number.isFinite) ||
        p.dtS < r.minDtS ||
        p.dtS > r.maxDtS ||
        Math.fround(p.dtS) < r.minDtS ||
        Math.fround(p.dtS) > r.maxDtS ||
        p.solverIterations < r.minIterations ||
        p.solverIterations > r.maxIterations
      )
        fail(
          'material-range-refused',
          'Every material must admit the requested dt and iterations.',
        );
      if (material.bendComplianceInvNm.warp !== material.bendComplianceInvNm.weft)
        fail(
          'anisotropic-bend-unsupported',
          'V1 requires explicitly isotropic scalar bend; unequal warp/weft is not approximated.',
        );
      if (
        !Number.isFinite(material.bendComplianceInvNm.warp) ||
        material.bendComplianceInvNm.warp >= Math.fround(1e30) ||
        material.bendComplianceInvNm.warp < 0
      )
        fail('invalid-material', 'Bend compliance is invalid.');
    }
    const physical = new Float32Array(s.mesh.restPositionsInvMass);
    for (let i = 0; i < counts.particles; i++) {
      const mass = decodeParticleMassGpuV1(s.material.particleMassRecords, i),
        sourceW = physical[i * 4 + 3];
      if (
        !Number.isFinite(mass.massKg) ||
        mass.massKg <= 0 ||
        !Number.isFinite(mass.inverseMassKgInv) ||
        mass.inverseMassKgInv <= 0 ||
        mass.inverseMassKgInv >= Math.fround(1e30) ||
        Math.abs(mass.massKg * mass.inverseMassKgInv - 1) > 4 * 2 ** -23 ||
        !Number.isFinite(sourceW) ||
        sourceW < 0
      )
        fail(
          'invalid-physical-mass',
          'Each particle requires positive coherent material mass/inverse mass and a valid support marker.',
        );
      for (let axis = 0; axis < 3; axis++)
        if (
          !Number.isFinite(physical[i * 4 + axis]) ||
          Math.abs(physical[i * 4 + axis]) >= XPBD_MATERIAL_VELOCITY_ABI_V2.domainAbsPositionLimitM
        )
          fail(
            'invalid-initial-position',
            'Placed XYZ exceeds the material-velocity immutable-anchor domain.',
          );
      physical[i * 4 + 3] = sourceW === 0 ? 0 : mass.inverseMassKgInv;
    }
    const workgroups = (n: number) => garmentMaterialRunWorkgroupsV1(n, b.maxWorkgroupsPerDispatch);
    const d = s.constraints.distance,
      seam = s.constraints.seam,
      bend = s.constraints.bend,
      c = s.constraints.continuumStrain;
    const distanceLambdas = new Float32Array(counts.distance),
      seamLambdas = new Float32Array(counts.seam),
      bendLambdas = new Float32Array(counts.bend);
    const activationRanks = new Uint32Array(counts.seam);
    seam.activationOrder.forEach((offset, rank) => {
      activationRanks[offset] = rank;
    });
    stage = 'schedules';
    const { distance, bendRuns, continuum } = buildXpbdMechanicalColorRunsV1({
      counts,
      distance: d,
      bend,
      continuum: c,
      parameters: p,
      bendLambdas,
      particleMaterialIndices: retention.particleMaterialIndices,
      materials,
      workgroups,
    });
    const seamRuns: Run[] =
      counts.seam === 0
        ? []
        : createXpbdSeamSolveColorScheduleV1({
            particleCount: counts.particles,
            totalConstraintCount: counts.seam,
            activeConstraintCount: counts.seam,
            complianceMPerN: p.seamComplianceMPerN,
            dtS: p.dtS,
            vertexPairs: seam.vertexPairs,
            targetLengthsM: seam.targetLengthsM,
            lambdasKgM: seamLambdas,
            activationRanks,
            colorRanges: seam.colorRanges,
          }).map((r) => ({
            ...r,
            workgroups: workgroups(r.constraintCount),
            params: packXpbdSeamSolveColorParamsV1(r.constraintOffset, r.constraintCount),
          }));
    const predictionFrames = Array.from({ length: p.frameCount }, (_, frame) =>
      encodeXpbdPredictFrameParamsV1({
        dtS: p.dtS,
        particleCount: counts.particles,
        distanceConstraintCount: counts.distance,
        gravityMps2Y: p.gravityMps2Y,
        windAccelerationMps2Z: p.windAccelerationMps2Z,
        simulationSeconds: frame * p.dtS,
        damping: 1,
      }),
    );
    // Predict V1 does not apply its compatibility damping field. All actual retention is the
    // per-particle material field consumed by finalizeMaterialVelocityV2, never record zero.
    const velocityParams = encodeXpbdMaterialVelocityParamsV2({
      dtS: p.dtS,
      particleCount: counts.particles,
    });
    const seamActivation = counts.seam
      ? packXpbdSeamSolveActivationParamsV1({
          totalConstraintCount: counts.seam,
          activeConstraintCount: counts.seam,
          complianceMPerN: p.seamComplianceMPerN,
          dtS: p.dtS,
        })
      : null;
    const resets = [
      [
        'distance',
        counts.distance,
        counts.distance ? createXpbdDistanceResetPacketV1(counts.distance) : null,
      ],
      [
        'seam-all-active',
        counts.seam,
        counts.seam
          ? createXpbdSeamAllActivePacketV1({
              totalConstraintCount: counts.seam,
              activeConstraintCount: counts.seam,
              complianceMPerN: p.seamComplianceMPerN,
              dtS: p.dtS,
            })
          : null,
      ],
      ['bend', counts.bend, counts.bend ? createXpbdBendResetPacketV1(counts.bend) : null],
      [
        'continuum',
        counts.continuum,
        counts.continuum ? createXpbdContinuumResetPacketV1(counts.continuum) : null,
      ],
    ] as const;
    const resetRuns = resets.flatMap(([kind, count, params]) =>
      count && params ? [{ kind, count, workgroups: workgroups(count), params }] : [],
    );
    const uploads: Record<string, ArrayBuffer | Float32Array | Uint32Array> = {
      positions: new Float32Array(physical),
      previousPositions: new Float32Array(physical),
      restPositions: new Float32Array(physical),
      velocities: new Float32Array(counts.particles * 4),
      particleRetention: retention.velocityRetentionPerStep,
      velocityDiagnostics: createXpbdMaterialVelocityDiagnosticsV2(),
      distancePairs: d.vertexPairs,
      distanceRestLengths: d.restLengthsM,
      distanceLambdas,
      continuumTriangles: c.triangleIndices,
      continuumRestFrames: c.triangleRestFrames,
      continuumMaterialIndices: c.materialIndices,
      continuumMaterials: c.materialRecords,
      continuumLambdas: c.lambdasKgM,
      continuumStatuses: new Uint32Array(counts.continuum).fill(
        CONTINUUM_STRAIN_VNEXT_STATUS_RESET,
      ),
    };
    if (counts.seam)
      Object.assign(uploads, {
        seamPairs: seam.vertexPairs,
        seamTargetLengths: seam.targetLengthsM,
        seamLambdas,
        seamActivationRanks: activationRanks,
      });
    if (counts.bend)
      Object.assign(uploads, {
        bendQuads: bend.vertexQuads,
        bendRestAngles: bend.restAnglesRad,
        bendLambdas,
        bendDiagnostics: new Uint32Array(XPBD_EMBEDDED_SCALAR_BEND_DIAGNOSTICS_BYTES_V2 / 4),
      });
    const uniformPackets = [
      ...predictionFrames,
      velocityParams,
      ...distance.map((r) => r.params),
      ...seamRuns.map((r) => r.params),
      ...bendRuns.map((r) => r.params),
      ...continuum.map((r) => r.params),
      ...resetRuns.map((r) => r.params),
      ...(seamActivation ? [seamActivation] : []),
    ];
    const storageBytes = Object.values(uploads).reduce((sum, v) => sum + v.byteLength, 0),
      uniformBytes = uniformPackets.reduce((sum, v) => sum + v.byteLength, 0);
    const solvesPerIteration =
      distance.length + 2 * seamRuns.length + bendRuns.length + continuum.length;
    const dispatchCount =
      p.frameCount * (2 + resetRuns.length + p.solverIterations * solvesPerIteration);
    const constraintInvocations =
      p.frameCount *
      (counts.distance +
        counts.seam +
        counts.bend +
        counts.continuum +
        p.solverIterations * (counts.distance + 2 * counts.seam + counts.bend + counts.continuum));
    const paddedInvocations =
      p.frameCount *
      64 *
      (2 * workgroups(counts.particles) +
        resetRuns.reduce((sum, r) => sum + r.workgroups, 0) +
        p.solverIterations *
          [...distance, ...seamRuns, ...bendRuns, ...continuum, ...seamRuns].reduce(
            (sum, r) => sum + r.workgroups,
            0,
          ));
    if (
      storageBytes + uniformBytes > b.maxGpuBytes ||
      dispatchCount > b.maxDispatches ||
      constraintInvocations > b.maxConstraintInvocations
    )
      fail(
        'resource-budget-exceeded',
        'Core buffer, dispatch or logical constraint work exceeds an explicit budget.',
      );
    check(signal);
    const physicalInitialSha256 = await hashBytes(physical);
    check(signal);
    const report = {
      schemaVersion: GARMENT_MATERIAL_RUN_PLAN_V1,
      packageSha256: request.expectedPackageSha256,
      physicalInitialFloat32LeSha256: physicalInitialSha256,
      physicalRestFloat32LeSha256: physicalInitialSha256,
      counts,
      parameters: p,
      budgets: b,
      budgetScope:
        'core-mechanical-only; excludes contact/body buffers, post-run strain/readback, renderer and device overhead',
      storageBytes,
      uniformBytes,
      coreGpuBytes: storageBytes + uniformBytes,
      dispatchCount,
      constraintInvocations,
      paddedInvocations,
      pieceRanges: request.pieceRanges,
      kernels: {
        prediction: { id: XPBD_PREDICT_KERNEL_V1, sha256: XPBD_PREDICT_SOURCE_SHA256_V1 },
        distance: { id: XPBD_DISTANCE_KERNEL_V1, sha256: XPBD_DISTANCE_SOURCE_SHA256_V1 },
        seam: { id: XPBD_SEAM_SOLVE_KERNEL_V1, sha256: XPBD_SEAM_SOLVE_SOURCE_SHA256_V1 },
        bend: {
          id: XPBD_EMBEDDED_SCALAR_BEND_KERNEL_V2,
          sha256: XPBD_EMBEDDED_SCALAR_BEND_SOURCE_SHA256_V2,
        },
        continuum: {
          id: CONTINUUM_STRAIN_VNEXT_KERNEL_V1,
          sha256: CONTINUUM_STRAIN_VNEXT_SOURCE_SHA256_V1,
        },
        velocity: {
          id: XPBD_MATERIAL_VELOCITY_KERNEL_V2,
          sha256: XPBD_MATERIAL_VELOCITY_SOURCE_SHA256_V2,
        },
        resets: XPBD_INITIALIZATION_CORE_RESET_KERNEL_IDENTITIES_V1,
      },
      claims: CLAIMS,
    };
    const plan = {
      sourceSealedSimulation: request.sealedSimulation,
      physicalInitialPositions: physical,
      particleMaterialIndices: retention.particleMaterialIndices,
      uploads,
      uniformPackets,
      predictionFrames,
      velocityParams,
      seamActivation,
      distance,
      seam: seamRuns,
      bend: bendRuns,
      continuum,
      resets: resetRuns,
      sequence: {
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
      },
      report,
    };
    const planSha256 = await hashBytes(
      new TextEncoder().encode(`${GARMENT_MATERIAL_RUN_PLAN_V1}\0${canonical(plan)}`),
    );
    check(signal);
    return freeze({ ok: true as const, plan: { ...plan, planSha256 }, blockers: [] as const });
  } catch (error) {
    return freeze({
      ok: false as const,
      plan: null,
      blockers: [
        {
          stage,
          code: error instanceof PlanBlocked ? error.code : 'plan-rejected',
          detail: error instanceof Error ? error.message : 'Plan creation rejected.',
        },
      ],
      claims: {
        ...CLAIMS,
        sealedV5Validated: false,
        physicalInverseMassDerivedFromMaterialRecords: false,
        particleMaterialRetentionDerivedWithoutAveraging: false,
        bendMaterialRunsDoNotReorderConstraints: false,
      },
    });
  }
}
export type GarmentMaterialRunPlanResultV1 = Awaited<
  ReturnType<typeof buildGarmentMaterialRunPlanV1>
>;
