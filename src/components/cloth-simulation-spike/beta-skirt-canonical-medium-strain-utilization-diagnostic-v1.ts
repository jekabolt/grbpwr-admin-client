/* global GPUBuffer, GPUComputePipeline, GPUDevice, GPUShaderModuleDescriptor */

import { CONTINUUM_STRAIN_MATERIAL_GPU_V1 } from '../../lib/cloth/compiler/simulation-package';
import {
  TRIANGLE_INDICES_GPU_V1,
  TRIANGLE_REST_FRAME_GPU_V1,
} from '../../lib/cloth/compiler/material-package';
import { validateSealedSimulationPackageV5V1 } from '../../lib/cloth/compiler/simulation-package-v5-integrity';
import {
  createXpbdDeviceSession,
  type CreateXpbdDeviceSessionOptions,
  type XpbdDeviceLease,
  type XpbdDeviceSession,
  type XpbdRuntimeSessionId,
} from '../../lib/cloth/runtime/webgpu/xpbd-device-session';

import {
  projectBetaSkirtCanonicalMediumWebgpu16FrameContactV2,
  type BetaSkirtCanonicalMediumWebgpu16FrameContactRunnerOwnerV2,
} from './beta-skirt-canonical-medium-webgpu-16-frame-contact-runner-v2';
import {
  projectBetaSkirtCanonicalMediumWebgpuRuntimeSourceV1,
  type BetaSkirtCanonicalMediumWebgpuRuntimeSourceOwnerV1,
} from './beta-skirt-canonical-medium-webgpu-runtime-source-v1';
import { BETA_SKIRT_STRAIN_UTILIZATION_COLOR_LUT_V1 } from './beta-skirt-strain-utilization-legend-v1';
export { BETA_SKIRT_STRAIN_UTILIZATION_COLOR_LUT_V1 } from './beta-skirt-strain-utilization-legend-v1';

export const BETA_SKIRT_CANONICAL_MEDIUM_STRAIN_UTILIZATION_DIAGNOSTIC_REPORT_V1 =
  'beta-skirt-canonical-medium-strain-utilization-diagnostic-report/1' as const;
export const BETA_SKIRT_CANONICAL_MEDIUM_STRAIN_UTILIZATION_DIAGNOSTIC_OWNER_V1 =
  'beta-skirt-canonical-medium-strain-utilization-diagnostic-owner/1' as const;
export const BETA_SKIRT_CANONICAL_MEDIUM_STRAIN_UTILIZATION_DIAGNOSTIC_PROJECTION_V1 =
  'beta-skirt-canonical-medium-strain-utilization-diagnostic-projection/1' as const;
export const TRIANGLE_STRAIN_UTILIZATION_PORT_V1 = 'triangle-strain-utilization-port/1' as const;

export const BETA_SKIRT_STRAIN_UTILIZATION_TRIANGLE_COUNT_V1 = 912;
export const BETA_SKIRT_STRAIN_UTILIZATION_VERTEX_COUNT_V1 = 580;
export const BETA_SKIRT_STRAIN_UTILIZATION_VALUE_BYTES_V1 =
  BETA_SKIRT_STRAIN_UTILIZATION_TRIANGLE_COUNT_V1 * 16;
export const BETA_SKIRT_STRAIN_UTILIZATION_FLAG_BYTES_V1 =
  BETA_SKIRT_STRAIN_UTILIZATION_TRIANGLE_COUNT_V1 * 4;
export const BETA_SKIRT_STRAIN_UTILIZATION_READBACK_BYTES_V1 =
  BETA_SKIRT_STRAIN_UTILIZATION_VALUE_BYTES_V1 + BETA_SKIRT_STRAIN_UTILIZATION_FLAG_BYTES_V1;
export const BETA_SKIRT_STRAIN_UTILIZATION_MAX_READBACK_BYTES_V1 = 18_240;

export function triangleStrainUtilizationReadbackBytesV1(triangleCount: number): number {
  if (!Number.isSafeInteger(triangleCount) || triangleCount < 0)
    throw new RangeError('triangleCount must be a non-negative safe integer.');
  const byteLength = triangleCount * 20;
  if (!Number.isSafeInteger(byteLength))
    throw new RangeError('Diagnostic readback size overflowed.');
  return byteLength;
}

export function triangleStrainUtilizationReadbackFitsCapV1(
  triangleCount: number,
  capBytes: number,
): boolean {
  if (!Number.isSafeInteger(capBytes) || capBytes < 0) return false;
  return triangleStrainUtilizationReadbackBytesV1(triangleCount) <= capBytes;
}

/**
 * Dimensionless visualization limits. They are deliberately not inferred from XPBD compliance:
 * compliance controls solver softness and is not a calibrated damage or failure threshold.
 */
export const BETA_SKIRT_STRAIN_UTILIZATION_PROVISIONAL_LIMITS_V1 = Object.freeze({
  schemaVersion: 'provisional-dimensionless-strain-visualization-limits/1' as const,
  warpAbs: Math.fround(0.08),
  weftAbs: Math.fround(0.08),
  shearAbs: Math.fround(0.12),
  calibrated: false as const,
  meaning: 'visualization-only-not-material-failure' as const,
});

export enum TriangleStrainUtilizationValidityFlagV1 {
  Valid = 0,
  InvalidTriangleIndex = 1 << 0,
  InvalidRestFrame = 1 << 1,
  InvalidMaterial = 1 << 2,
  NonFinitePosition = 1 << 3,
  NonFiniteOutput = 1 << 4,
}

export const TRIANGLE_STRAIN_UTILIZATION_DIAGNOSTIC_WGSL_V1 = /* wgsl */ `
const WARP_LIMIT: f32 = 0.08;
const WEFT_LIMIT: f32 = 0.08;
const SHEAR_LIMIT: f32 = 0.12;
const FLAG_INVALID_TRIANGLE_INDEX: u32 = 1u;
const FLAG_INVALID_REST_FRAME: u32 = 2u;
const FLAG_INVALID_MATERIAL: u32 = 4u;
const FLAG_NON_FINITE_POSITION: u32 = 8u;
const FLAG_NON_FINITE_OUTPUT: u32 = 16u;
struct ContinuumRestFrame {
  inverseDm: vec4<f32>,
  restAreaM2: f32,
  materialIndex: u32,
  reserved0: u32,
  reserved1: u32,
};
struct ContinuumMaterial {
  complianceMPerN: vec3<f32>,
  formulationTag: u32,
};
struct DiagnosticParams {
  triangleCount: u32,
  vertexCount: u32,
  materialCount: u32,
  reserved: u32,
};
@group(0) @binding(0) var<storage, read> positions: array<vec4<f32>>;
@group(0) @binding(1) var<storage, read> triangleIndices: array<vec4<u32>>;
@group(0) @binding(2) var<storage, read> restFrames: array<ContinuumRestFrame>;
@group(0) @binding(3) var<storage, read> materialIndices: array<u32>;
@group(0) @binding(4) var<storage, read> materials: array<ContinuumMaterial>;
@group(0) @binding(5) var<uniform> params: DiagnosticParams;
@group(0) @binding(6) var<storage, read_write> values: array<vec4<f32>>;
@group(0) @binding(7) var<storage, read_write> validityFlags: array<u32>;
fn finiteScalar(value: f32) -> bool {
  return value == value && abs(value) < 1.0e30;
}
fn finiteVec3(value: vec3<f32>) -> bool {
  return all(value == value) && all(abs(value) < vec3<f32>(1.0e30));
}
fn finiteVec4(value: vec4<f32>) -> bool {
  return all(value == value) && all(abs(value) < vec4<f32>(1.0e30));
}
@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) invocation: vec3<u32>) {
  let triangleIndex = invocation.x;
  if (triangleIndex >= params.triangleCount) { return; }
  values[triangleIndex] = vec4<f32>(0.0);
  validityFlags[triangleIndex] = FLAG_INVALID_REST_FRAME;
  let triangle = triangleIndices[triangleIndex];
  if (triangle.w != 0u || triangle.x >= params.vertexCount ||
      triangle.y >= params.vertexCount || triangle.z >= params.vertexCount ||
      triangle.x == triangle.y || triangle.y == triangle.z || triangle.z == triangle.x) {
    validityFlags[triangleIndex] = FLAG_INVALID_TRIANGLE_INDEX;
    return;
  }
  let frame = restFrames[triangleIndex];
  let determinant = frame.inverseDm.x * frame.inverseDm.w -
    frame.inverseDm.y * frame.inverseDm.z;
  if (!finiteVec4(frame.inverseDm) || !finiteScalar(frame.restAreaM2) ||
      frame.restAreaM2 <= 1.0e-12 || !finiteScalar(determinant) ||
      abs(determinant) <= 1.0e-20 || frame.reserved0 != 0u || frame.reserved1 != 0u) {
    return;
  }
  let materialIndex = materialIndices[triangleIndex];
  if (materialIndex >= params.materialCount || frame.materialIndex != materialIndex) {
    validityFlags[triangleIndex] = FLAG_INVALID_MATERIAL;
    return;
  }
  let material = materials[materialIndex];
  if (!finiteVec3(material.complianceMPerN) ||
      any(material.complianceMPerN <= vec3<f32>(0.0)) || material.formulationTag != 1u) {
    validityFlags[triangleIndex] = FLAG_INVALID_MATERIAL;
    return;
  }
  let p0 = positions[triangle.x].xyz;
  let p1 = positions[triangle.y].xyz;
  let p2 = positions[triangle.z].xyz;
  if (!finiteVec3(p0) || !finiteVec3(p1) || !finiteVec3(p2)) {
    validityFlags[triangleIndex] = FLAG_NON_FINITE_POSITION;
    return;
  }
  let edge1 = p1 - p0;
  let edge2 = p2 - p0;
  let warp = edge1 * frame.inverseDm.x + edge2 * frame.inverseDm.z;
  let weft = edge1 * frame.inverseDm.y + edge2 * frame.inverseDm.w;
  let warpStrain = 0.5 * (dot(warp, warp) - 1.0);
  let weftStrain = 0.5 * (dot(weft, weft) - 1.0);
  let shearStrain = dot(warp, weft);
  let utilization = max(max(abs(warpStrain) / WARP_LIMIT,
                            abs(weftStrain) / WEFT_LIMIT),
                        abs(shearStrain) / SHEAR_LIMIT);
  let output = vec4<f32>(warpStrain, weftStrain, shearStrain, utilization);
  if (!finiteVec4(output)) {
    validityFlags[triangleIndex] = FLAG_NON_FINITE_OUTPUT;
    return;
  }
  values[triangleIndex] = output;
  validityFlags[triangleIndex] = 0u;
}
`;

const MAP_READ = 0x0001;
const COPY_SRC = 0x0004;
const COPY_DST = 0x0008;
const UNIFORM = 0x0040;
const STORAGE = 0x0080;
const DEFAULT_TIMEOUT_MS = 5_000;
const MAX_TIMEOUT_MS = 10_000;
const SHA256 = /^[0-9a-f]{64}$/u;
const EMPTY_SHA256 = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
const ABC_SHA256 = 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad';
const CapturedFloat32Array = Float32Array;
const CapturedUint8Array = Uint8Array;
const CapturedUint32Array = Uint32Array;
const capturedReflectApply = Reflect.apply;
const capturedUint8Set = Uint8Array.prototype.set;
const capturedFloat32Fill = Float32Array.prototype.fill;
const capturedUint32Fill = Uint32Array.prototype.fill;
const capturedTextEncoder = new TextEncoder();
const capturedTextEncode = TextEncoder.prototype.encode;
const capturedJsonStringify = JSON.stringify.bind(JSON);
const capturedSubtle = globalThis.crypto?.subtle;
const capturedDigest = capturedSubtle?.digest;
const capturedRandomUuid = globalThis.crypto?.randomUUID?.bind(globalThis.crypto);
const HEX = Object.freeze(
  Array.from({ length: 256 }, (_, value) => value.toString(16).padStart(2, '0')),
);

type GpuProvider = NonNullable<CreateXpbdDeviceSessionOptions['gpu']>;

export type TriangleStrainUtilizationPortBindingsV1 = Readonly<{
  finalPositionsInvMassKgSha256: string;
  normalizedTopologySha256: string;
  triangleIndicesSha256: string;
  triangleRestFramesSha256: string;
  materialIndicesSha256: string;
  materialRecordsSha256: string;
}>;

export type TriangleStrainUtilizationPortV1 = Readonly<{
  schemaVersion: typeof TRIANGLE_STRAIN_UTILIZATION_PORT_V1;
  vertexCount: number;
  triangleCount: number;
  materialCount: number;
  finalPositionsInvMassKg: Float32Array;
  normalizedTopology: Uint32Array;
  triangleIndices: ArrayBuffer;
  triangleRestFrames: ArrayBuffer;
  materialIndices: Uint32Array;
  materialRecords: ArrayBuffer;
  bindings: TriangleStrainUtilizationPortBindingsV1;
}>;

export type TriangleStrainUtilizationPortAuditV1 = Readonly<{
  ok: boolean;
  blockers: readonly string[];
  computedBindings: TriangleStrainUtilizationPortBindingsV1;
}>;

export type BetaSkirtCanonicalMediumStrainUtilizationDiagnosticOptionsV1 = Readonly<{
  gpu?: GpuProvider;
  sessionIdFactory?: CreateXpbdDeviceSessionOptions['sessionIdFactory'];
  signal?: AbortSignal;
  timeoutMs?: number;
  readbackCapBytes?: number;
}>;

export type BetaSkirtCanonicalMediumStrainUtilizationDiagnosticErrorCodeV1 =
  | 'aborted'
  | 'unsupported-webgpu'
  | 'source-owner-unavailable'
  | 'contact-owner-unavailable'
  | 'binding-mismatch'
  | 'invalid-continuum-input'
  | 'readback-cap-exceeded'
  | 'gpu-execution-failed'
  | 'invalid-gpu-output'
  | 'timeout'
  | 'sha256-unavailable';

type RangeSummary = Readonly<{ minimum: number; maximum: number }>;

export type BetaSkirtCanonicalMediumStrainUtilizationDiagnosticReportV1 = Readonly<{
  schemaVersion: typeof BETA_SKIRT_CANONICAL_MEDIUM_STRAIN_UTILIZATION_DIAGNOSTIC_REPORT_V1;
  status: 'diagnostic-completed';
  decision: 'PASS_BOUNDED_PER_TRIANGLE_STRAIN_UTILIZATION_DIAGNOSTIC';
  bindings: Readonly<{
    runtimeSourceCanonicalSha256: string;
    contactRunnerCanonicalSha256: string;
    normalizedV5AggregateSha256: string;
    finalPositions3MSha256: string;
    port: TriangleStrainUtilizationPortBindingsV1;
    kernelSourceSha256: string;
    provisionalLimitsSha256: string;
    colorLutSha256: string;
    outputValuesFloat32LeSha256: string;
    outputValidityFlagsUint32LeSha256: string;
    outputEnvelopeSha256: string;
  }>;
  workload: Readonly<{
    vertexCount: typeof BETA_SKIRT_STRAIN_UTILIZATION_VERTEX_COUNT_V1;
    triangleCount: typeof BETA_SKIRT_STRAIN_UTILIZATION_TRIANGLE_COUNT_V1;
    materialCount: number;
    dispatchCount: 1;
    workgroupSize: 64;
    workgroupCount: number;
  }>;
  readback: Readonly<{
    valueByteLength: typeof BETA_SKIRT_STRAIN_UTILIZATION_VALUE_BYTES_V1;
    validityFlagByteLength: typeof BETA_SKIRT_STRAIN_UTILIZATION_FLAG_BYTES_V1;
    totalByteLength: typeof BETA_SKIRT_STRAIN_UTILIZATION_READBACK_BYTES_V1;
    maximumByteLength: typeof BETA_SKIRT_STRAIN_UTILIZATION_MAX_READBACK_BYTES_V1;
  }>;
  validity: Readonly<{
    validTriangleCount: number;
    invalidTriangleCount: number;
    flagHistogram: Readonly<Record<string, number>>;
    cpuParityMaximumAbsoluteError: number;
    cpuParityTolerance: 0.00001;
  }>;
  ranges: Readonly<{
    warpStrain: RangeSummary;
    weftStrain: RangeSummary;
    shearStrain: RangeSummary;
    normalizedUtilization: RangeSummary;
  }>;
  histogram: Readonly<{
    basis: 'normalized-utilization';
    bins: readonly Readonly<{
      lowerInclusive: number;
      upperExclusive: number | null;
      count: number;
    }>[];
  }>;
  interpretation: Readonly<{
    triangleCountAtOrAboveProvisionalLimit: number;
    triangleCountAtOrAboveFourTimesProvisionalLimit: number;
    maximumUtilizationInterpretation:
      | 'strong-distortion-signal-relative-to-provisional-visualization-limits'
      | 'distortion-signal-relative-to-provisional-visualization-limits';
    utilizationIsMaterialFailureCriterion: false;
    utilizationIsPhysicalStressOrPa: false;
  }>;
  visualization: Readonly<{
    limits: typeof BETA_SKIRT_STRAIN_UTILIZATION_PROVISIONAL_LIMITS_V1;
    colorLut: typeof BETA_SKIRT_STRAIN_UTILIZATION_COLOR_LUT_V1;
  }>;
  execution: Readonly<{
    gpuWallTimeMs: number;
    timeoutMs: number;
    validationMessages: readonly string[];
    destroyedBufferCount: number;
    leaseReleased: true;
    sessionDisposed: true;
  }>;
  blockers: readonly [
    'material-visualization-thresholds-provisional-and-uncalibrated',
    'physical-stress-and-pa-not-computed',
    'material-failure-not-evaluated',
    'fit-runtime-production-authority-not-established',
  ];
  claims: Readonly<{
    exactRetainedContactClearV2ProjectionBound: true;
    exactRuntimeSourceV5ContinuumBuffersBound: true;
    gpuPerTriangleDiagnosticExecuted: true;
    boundedReadback: true;
    dimensionlessStrainDiagnosticOnly: true;
    provisionalMaterialVisualizationThresholds: true;
    physicalStressOrPaComputed: false;
    materialFailureEvaluated: false;
    collisionAuthority: false;
    fitAuthority: false;
    runtimeAuthority: false;
    productionAuthority: false;
  }>;
  seal: Readonly<{
    algorithm: 'SHA-256';
    canonicalSha256: string;
    authority: 'unsigned-gpu-strain-utilization-diagnostic-only';
  }>;
}>;

declare const diagnosticOwnerBrand: unique symbol;
export type BetaSkirtCanonicalMediumStrainUtilizationDiagnosticOwnerV1 = Readonly<{
  schemaVersion: typeof BETA_SKIRT_CANONICAL_MEDIUM_STRAIN_UTILIZATION_DIAGNOSTIC_OWNER_V1;
  report: BetaSkirtCanonicalMediumStrainUtilizationDiagnosticReportV1;
  readonly [diagnosticOwnerBrand]: never;
}>;

export type BetaSkirtCanonicalMediumStrainUtilizationDiagnosticProjectionV1 = Readonly<{
  schemaVersion: typeof BETA_SKIRT_CANONICAL_MEDIUM_STRAIN_UTILIZATION_DIAGNOSTIC_PROJECTION_V1;
  reportCanonicalSha256: string;
  triangleValues: Float32Array;
  validityFlags: Uint32Array;
  normalizedTopology: Uint32Array;
  valuesLayout: readonly ['warpStrain', 'weftStrain', 'shearStrain', 'normalizedUtilization'];
  callerOwnedMutableBinaryCopies: true;
  strainDiagnosticAuthority: true;
  physicalStressAuthority: false;
  materialFailureAuthority: false;
  fitAuthority: false;
  runtimeAuthority: false;
  productionAuthority: false;
}>;

export type BetaSkirtCanonicalMediumStrainUtilizationDiagnosticResultV1 =
  | Readonly<{
      ok: true;
      owner: BetaSkirtCanonicalMediumStrainUtilizationDiagnosticOwnerV1;
      report: BetaSkirtCanonicalMediumStrainUtilizationDiagnosticReportV1;
    }>
  | Readonly<{
      ok: false;
      code: BetaSkirtCanonicalMediumStrainUtilizationDiagnosticErrorCodeV1;
      detail: string;
    }>;

type OwnerRecord = Readonly<{
  triangleValues: Float32Array;
  validityFlags: Uint32Array;
  normalizedTopology: Uint32Array;
}>;

const owners = new WeakMap<object, OwnerRecord>();

class DiagnosticError extends Error {
  constructor(
    readonly code: BetaSkirtCanonicalMediumStrainUtilizationDiagnosticErrorCodeV1,
    message: string,
  ) {
    super(message);
  }
}

function fail(
  code: BetaSkirtCanonicalMediumStrainUtilizationDiagnosticErrorCodeV1,
  message: string,
): never {
  throw new DiagnosticError(code, message);
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) fail('aborted', 'Strain-utilization diagnostic was aborted.');
}

function copiedBytes(value: ArrayBuffer | ArrayBufferView): Uint8Array<ArrayBuffer> {
  const source =
    value instanceof ArrayBuffer
      ? new CapturedUint8Array(value)
      : new CapturedUint8Array(value.buffer, value.byteOffset, value.byteLength);
  const copy = new CapturedUint8Array(source.byteLength);
  capturedReflectApply(capturedUint8Set, copy, [source]);
  return copy;
}

function float32LeBytes(value: Float32Array): Uint8Array<ArrayBuffer> {
  const bytes = new CapturedUint8Array(value.length * 4);
  const view = new DataView(bytes.buffer);
  for (let index = 0; index < value.length; index += 1)
    view.setFloat32(index * 4, value[index]!, true);
  return bytes;
}

function uint32LeBytes(value: Uint32Array): Uint8Array<ArrayBuffer> {
  const bytes = new CapturedUint8Array(value.length * 4);
  const view = new DataView(bytes.buffer);
  for (let index = 0; index < value.length; index += 1)
    view.setUint32(index * 4, value[index]!, true);
  return bytes;
}

function hex(bytes: Uint8Array): string {
  let result = '';
  for (let index = 0; index < bytes.length; index += 1) result += HEX[bytes[index]!]!;
  return result;
}

async function digestBytes(bytes: Uint8Array): Promise<string> {
  if (!capturedSubtle || typeof capturedDigest !== 'function')
    fail('sha256-unavailable', 'Native Web Crypto SHA-256 is unavailable.');
  const digest = (await capturedReflectApply(capturedDigest, capturedSubtle, [
    'SHA-256',
    copiedBytes(bytes),
  ])) as ArrayBuffer;
  if (digest.byteLength !== 32) fail('sha256-unavailable', 'Native SHA-256 digest length drifted.');
  return hex(new CapturedUint8Array(digest));
}

async function digestText(value: string): Promise<string> {
  return digestBytes(
    capturedReflectApply(capturedTextEncode, capturedTextEncoder, [value]) as Uint8Array,
  );
}

async function validateDigestAuthority(): Promise<void> {
  if ((await digestBytes(new CapturedUint8Array(0))) !== EMPTY_SHA256)
    fail('sha256-unavailable', 'SHA-256 empty-message known-answer test failed.');
  if ((await digestText('abc')) !== ABC_SHA256)
    fail('sha256-unavailable', 'SHA-256 abc known-answer test failed.');
}

function bytesEqual(left: ArrayBufferView, right: ArrayBufferView): boolean {
  if (left.byteLength !== right.byteLength) return false;
  const a = new CapturedUint8Array(left.buffer, left.byteOffset, left.byteLength);
  const b = new CapturedUint8Array(right.buffer, right.byteOffset, right.byteLength);
  for (let index = 0; index < a.length; index += 1) if (a[index] !== b[index]) return false;
  return true;
}

function positions3(positions4: Float32Array): Float32Array {
  const result = new CapturedFloat32Array((positions4.length / 4) * 3);
  for (let vertex = 0; vertex < positions4.length / 4; vertex += 1) {
    result[vertex * 3] = positions4[vertex * 4]!;
    result[vertex * 3 + 1] = positions4[vertex * 4 + 1]!;
    result[vertex * 3 + 2] = positions4[vertex * 4 + 2]!;
  }
  return result;
}

function cyclicTriangleKey(a: number, b: number, c: number): string {
  const first = `${a}:${b}:${c}`;
  const second = `${b}:${c}:${a}`;
  const third = `${c}:${a}:${b}`;
  return first < second ? (first < third ? first : third) : second < third ? second : third;
}

function topologyCounts(topology: Uint32Array): Map<string, number> {
  const result = new Map<string, number>();
  for (let index = 0; index < topology.length; index += 3) {
    const key = cyclicTriangleKey(topology[index]!, topology[index + 1]!, topology[index + 2]!);
    result.set(key, (result.get(key) ?? 0) + 1);
  }
  return result;
}

function continuumTopologyCounts(buffer: ArrayBuffer): Map<string, number> {
  const view = new DataView(buffer);
  const result = new Map<string, number>();
  for (let offset = 0; offset < buffer.byteLength; offset += TRIANGLE_INDICES_GPU_V1.strideBytes) {
    const a = view.getUint32(offset + TRIANGLE_INDICES_GPU_V1.offsets.vertex0, true);
    const b = view.getUint32(offset + TRIANGLE_INDICES_GPU_V1.offsets.vertex1, true);
    const c = view.getUint32(offset + TRIANGLE_INDICES_GPU_V1.offsets.vertex2, true);
    const key = cyclicTriangleKey(a, b, c);
    result.set(key, (result.get(key) ?? 0) + 1);
  }
  return result;
}

function sameTopologyMultiset(left: Map<string, number>, right: Map<string, number>): boolean {
  if (left.size !== right.size) return false;
  for (const [key, count] of left) if (right.get(key) !== count) return false;
  return true;
}

async function computedPortBindings(
  port: Omit<TriangleStrainUtilizationPortV1, 'bindings'>,
): Promise<TriangleStrainUtilizationPortBindingsV1> {
  return Object.freeze({
    finalPositionsInvMassKgSha256: await digestBytes(float32LeBytes(port.finalPositionsInvMassKg)),
    normalizedTopologySha256: await digestBytes(uint32LeBytes(port.normalizedTopology)),
    triangleIndicesSha256: await digestBytes(copiedBytes(port.triangleIndices)),
    triangleRestFramesSha256: await digestBytes(copiedBytes(port.triangleRestFrames)),
    materialIndicesSha256: await digestBytes(uint32LeBytes(port.materialIndices)),
    materialRecordsSha256: await digestBytes(copiedBytes(port.materialRecords)),
  });
}

function validatePortShape(port: TriangleStrainUtilizationPortV1): string[] {
  const blockers: string[] = [];
  if (!Number.isSafeInteger(port.vertexCount) || port.vertexCount <= 0)
    blockers.push('vertex-count-invalid');
  if (!Number.isSafeInteger(port.triangleCount) || port.triangleCount <= 0)
    blockers.push('triangle-count-invalid');
  if (!Number.isSafeInteger(port.materialCount) || port.materialCount <= 0)
    blockers.push('material-count-invalid');
  if (port.finalPositionsInvMassKg.length !== port.vertexCount * 4)
    blockers.push('position-buffer-length-mismatch');
  if (port.normalizedTopology.length !== port.triangleCount * 3)
    blockers.push('normalized-topology-length-mismatch');
  if (port.triangleIndices.byteLength !== port.triangleCount * TRIANGLE_INDICES_GPU_V1.strideBytes)
    blockers.push('continuum-triangle-buffer-length-mismatch');
  if (
    port.triangleRestFrames.byteLength !==
    port.triangleCount * TRIANGLE_REST_FRAME_GPU_V1.strideBytes
  )
    blockers.push('rest-frame-buffer-length-mismatch');
  if (port.materialIndices.length !== port.triangleCount)
    blockers.push('material-index-buffer-length-mismatch');
  if (
    port.materialRecords.byteLength !==
    port.materialCount * CONTINUUM_STRAIN_MATERIAL_GPU_V1.strideBytes
  )
    blockers.push('material-record-buffer-length-mismatch');
  return blockers;
}

function validatePortRecords(port: TriangleStrainUtilizationPortV1): string[] {
  const blockers: string[] = [];
  if (validatePortShape(port).length > 0) return blockers;
  const triangleView = new DataView(port.triangleIndices);
  const restView = new DataView(port.triangleRestFrames);
  const materialView = new DataView(port.materialRecords);
  for (let index = 0; index < port.finalPositionsInvMassKg.length; index += 1) {
    const value = port.finalPositionsInvMassKg[index]!;
    if (!Number.isFinite(value)) {
      blockers.push('position-buffer-non-finite');
      break;
    }
    if (index % 4 === 3 && value < 0) {
      blockers.push('position-buffer-negative-inverse-mass');
      break;
    }
  }
  for (let triangle = 0; triangle < port.triangleCount; triangle += 1) {
    const triangleBase = triangle * TRIANGLE_INDICES_GPU_V1.strideBytes;
    const a = triangleView.getUint32(triangleBase + TRIANGLE_INDICES_GPU_V1.offsets.vertex0, true);
    const b = triangleView.getUint32(triangleBase + TRIANGLE_INDICES_GPU_V1.offsets.vertex1, true);
    const c = triangleView.getUint32(triangleBase + TRIANGLE_INDICES_GPU_V1.offsets.vertex2, true);
    const reserved = triangleView.getUint32(
      triangleBase + TRIANGLE_INDICES_GPU_V1.offsets.reserved,
      true,
    );
    if (
      a >= port.vertexCount ||
      b >= port.vertexCount ||
      c >= port.vertexCount ||
      a === b ||
      b === c ||
      c === a ||
      reserved !== 0
    ) {
      blockers.push('continuum-triangle-record-invalid');
      break;
    }
    const frameBase = triangle * TRIANGLE_REST_FRAME_GPU_V1.strideBytes;
    const inverse = [
      restView.getFloat32(frameBase + TRIANGLE_REST_FRAME_GPU_V1.offsets.inverseDm00, true),
      restView.getFloat32(frameBase + TRIANGLE_REST_FRAME_GPU_V1.offsets.inverseDm01, true),
      restView.getFloat32(frameBase + TRIANGLE_REST_FRAME_GPU_V1.offsets.inverseDm10, true),
      restView.getFloat32(frameBase + TRIANGLE_REST_FRAME_GPU_V1.offsets.inverseDm11, true),
    ] as const;
    const restArea = restView.getFloat32(
      frameBase + TRIANGLE_REST_FRAME_GPU_V1.offsets.restAreaM2,
      true,
    );
    const frameMaterial = restView.getUint32(
      frameBase + TRIANGLE_REST_FRAME_GPU_V1.offsets.materialIndex,
      true,
    );
    const reserved0 = restView.getUint32(
      frameBase + TRIANGLE_REST_FRAME_GPU_V1.offsets.reserved0,
      true,
    );
    const reserved1 = restView.getUint32(
      frameBase + TRIANGLE_REST_FRAME_GPU_V1.offsets.reserved1,
      true,
    );
    const determinant = inverse[0] * inverse[3] - inverse[1] * inverse[2];
    const derivedArea = 0.5 / Math.abs(determinant);
    const areaTolerance = 1e-5 * Math.max(1, Math.abs(restArea));
    if (
      inverse.some((value) => !Number.isFinite(value)) ||
      !Number.isFinite(restArea) ||
      restArea <= 1e-12 ||
      !Number.isFinite(determinant) ||
      Math.abs(determinant) <= 1e-20 ||
      Math.abs(derivedArea - restArea) > areaTolerance ||
      reserved0 !== 0 ||
      reserved1 !== 0
    ) {
      blockers.push('continuum-rest-frame-record-invalid');
      break;
    }
    const materialIndex = port.materialIndices[triangle]!;
    if (materialIndex >= port.materialCount || materialIndex !== frameMaterial) {
      blockers.push('continuum-material-reference-invalid');
      break;
    }
  }
  for (let material = 0; material < port.materialCount; material += 1) {
    const base = material * CONTINUUM_STRAIN_MATERIAL_GPU_V1.strideBytes;
    const warp = materialView.getFloat32(
      base + CONTINUUM_STRAIN_MATERIAL_GPU_V1.offsets.warpComplianceMPerN,
      true,
    );
    const weft = materialView.getFloat32(
      base + CONTINUUM_STRAIN_MATERIAL_GPU_V1.offsets.weftComplianceMPerN,
      true,
    );
    const shear = materialView.getFloat32(
      base + CONTINUUM_STRAIN_MATERIAL_GPU_V1.offsets.shearComplianceMPerN,
      true,
    );
    const tag = materialView.getUint32(
      base + CONTINUUM_STRAIN_MATERIAL_GPU_V1.offsets.formulationTag,
      true,
    );
    if (
      !Number.isFinite(warp) ||
      !Number.isFinite(weft) ||
      !Number.isFinite(shear) ||
      warp <= 0 ||
      weft <= 0 ||
      shear <= 0 ||
      tag !== 1
    ) {
      blockers.push('continuum-material-record-invalid');
      break;
    }
  }
  if (
    blockers.length === 0 &&
    !sameTopologyMultiset(
      topologyCounts(port.normalizedTopology),
      continuumTopologyCounts(port.triangleIndices),
    )
  )
    blockers.push('continuum-topology-does-not-match-normalized-topology');
  return blockers;
}

export async function auditTriangleStrainUtilizationPortV1(
  port: TriangleStrainUtilizationPortV1,
): Promise<TriangleStrainUtilizationPortAuditV1> {
  await validateDigestAuthority();
  const blockers = validatePortShape(port);
  const computedBindings = await computedPortBindings(port);
  for (const key of Object.keys(
    computedBindings,
  ) as (keyof TriangleStrainUtilizationPortBindingsV1)[]) {
    if (!SHA256.test(port.bindings[key]) || port.bindings[key] !== computedBindings[key])
      blockers.push(`binding-mismatch:${key}`);
  }
  blockers.push(...validatePortRecords(port));
  return Object.freeze({
    ok: blockers.length === 0,
    blockers: Object.freeze([...new Set(blockers)]),
    computedBindings,
  });
}

export async function sealTriangleStrainUtilizationPortV1(
  input: Omit<TriangleStrainUtilizationPortV1, 'bindings'>,
): Promise<TriangleStrainUtilizationPortV1> {
  const snapshot = Object.freeze({
    ...input,
    finalPositionsInvMassKg: new CapturedFloat32Array(input.finalPositionsInvMassKg),
    normalizedTopology: new CapturedUint32Array(input.normalizedTopology),
    triangleIndices: copiedBytes(input.triangleIndices).buffer,
    triangleRestFrames: copiedBytes(input.triangleRestFrames).buffer,
    materialIndices: new CapturedUint32Array(input.materialIndices),
    materialRecords: copiedBytes(input.materialRecords).buffer,
  });
  const bindings = await computedPortBindings(snapshot);
  return Object.freeze({ ...snapshot, bindings });
}

function f32(value: number): number {
  return Math.fround(value);
}

/** CPU reference for parity only; the accepted report is produced by the GPU readback. */
export function evaluateTriangleStrainUtilizationCpuV1(
  port: TriangleStrainUtilizationPortV1,
): Float32Array {
  const result = new CapturedFloat32Array(port.triangleCount * 4);
  const triangles = new DataView(port.triangleIndices);
  const frames = new DataView(port.triangleRestFrames);
  for (let triangle = 0; triangle < port.triangleCount; triangle += 1) {
    const triangleBase = triangle * TRIANGLE_INDICES_GPU_V1.strideBytes;
    const frameBase = triangle * TRIANGLE_REST_FRAME_GPU_V1.strideBytes;
    const a = triangles.getUint32(triangleBase, true) * 4;
    const b = triangles.getUint32(triangleBase + 4, true) * 4;
    const c = triangles.getUint32(triangleBase + 8, true) * 4;
    const inverse00 = frames.getFloat32(frameBase, true);
    const inverse01 = frames.getFloat32(frameBase + 4, true);
    const inverse10 = frames.getFloat32(frameBase + 8, true);
    const inverse11 = frames.getFloat32(frameBase + 12, true);
    const warp = [0, 0, 0];
    const weft = [0, 0, 0];
    for (let axis = 0; axis < 3; axis += 1) {
      const edge1 = f32(
        port.finalPositionsInvMassKg[b + axis]! - port.finalPositionsInvMassKg[a + axis]!,
      );
      const edge2 = f32(
        port.finalPositionsInvMassKg[c + axis]! - port.finalPositionsInvMassKg[a + axis]!,
      );
      warp[axis] = f32(f32(edge1 * inverse00) + f32(edge2 * inverse10));
      weft[axis] = f32(f32(edge1 * inverse01) + f32(edge2 * inverse11));
    }
    let warpDot = f32(warp[0]! * warp[0]!);
    let weftDot = f32(weft[0]! * weft[0]!);
    let shearDot = f32(warp[0]! * weft[0]!);
    for (let axis = 1; axis < 3; axis += 1) {
      warpDot = f32(warpDot + f32(warp[axis]! * warp[axis]!));
      weftDot = f32(weftDot + f32(weft[axis]! * weft[axis]!));
      shearDot = f32(shearDot + f32(warp[axis]! * weft[axis]!));
    }
    const warpStrain = f32(0.5 * f32(warpDot - 1));
    const weftStrain = f32(0.5 * f32(weftDot - 1));
    const shearStrain = shearDot;
    const utilization = f32(
      Math.max(
        Math.abs(warpStrain) / BETA_SKIRT_STRAIN_UTILIZATION_PROVISIONAL_LIMITS_V1.warpAbs,
        Math.abs(weftStrain) / BETA_SKIRT_STRAIN_UTILIZATION_PROVISIONAL_LIMITS_V1.weftAbs,
        Math.abs(shearStrain) / BETA_SKIRT_STRAIN_UTILIZATION_PROVISIONAL_LIMITS_V1.shearAbs,
      ),
    );
    result.set([warpStrain, weftStrain, shearStrain, utilization], triangle * 4);
  }
  return result;
}

function defaultSessionIdFactory(): XpbdRuntimeSessionId {
  if (!capturedRandomUuid) fail('unsupported-webgpu', 'Native randomUUID is unavailable.');
  return `gpu-session:${capturedRandomUuid()}` as XpbdRuntimeSessionId;
}

function diagnosticParams(port: TriangleStrainUtilizationPortV1): ArrayBuffer {
  const buffer = new ArrayBuffer(16);
  const view = new DataView(buffer);
  view.setUint32(0, port.triangleCount, true);
  view.setUint32(4, port.vertexCount, true);
  view.setUint32(8, port.materialCount, true);
  return buffer;
}

function createGpuBuffer(
  device: GPUDevice,
  tracked: GPUBuffer[],
  label: string,
  contents: ArrayBuffer | ArrayBufferView,
  usage: number,
): GPUBuffer {
  const bytes = copiedBytes(contents);
  const buffer = device.createBuffer({ label, size: bytes.byteLength, usage: usage | COPY_DST });
  device.queue.writeBuffer(buffer, 0, bytes);
  tracked.push(buffer);
  return buffer;
}

async function createPipeline(device: GPUDevice): Promise<GPUComputePipeline> {
  const descriptor: GPUShaderModuleDescriptor = {
    label: 'per-triangle strain-utilization diagnostic v1',
    code: TRIANGLE_STRAIN_UTILIZATION_DIAGNOSTIC_WGSL_V1,
  };
  const module = device.createShaderModule(descriptor);
  const compilation = await module.getCompilationInfo();
  const errors = compilation.messages
    .filter((message) => message.type === 'error')
    .map((message) => `${message.lineNum}:${message.linePos} ${message.message}`);
  if (errors.length > 0)
    throw new Error(`Diagnostic WGSL compilation failed: ${errors.join(' | ')}`);
  return device.createComputePipelineAsync({
    label: 'per-triangle strain-utilization diagnostic v1 pipeline',
    layout: 'auto',
    compute: { module, entryPoint: 'main' },
  });
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_resolve, reject) => {
        timer = setTimeout(
          () => reject(new DiagnosticError('timeout', `GPU diagnostic exceeded ${timeoutMs} ms.`)),
          timeoutMs,
        );
      }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

type GpuReadback = Readonly<{
  values: Float32Array;
  flags: Uint32Array;
  gpuWallTimeMs: number;
  validationMessages: readonly string[];
  destroyedBufferCount: number;
}>;

async function executeGpu(
  canvas: HTMLCanvasElement,
  port: TriangleStrainUtilizationPortV1,
  options: BetaSkirtCanonicalMediumStrainUtilizationDiagnosticOptionsV1,
): Promise<GpuReadback> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  if (!Number.isFinite(timeoutMs) || timeoutMs < 100 || timeoutMs > MAX_TIMEOUT_MS)
    fail('invalid-continuum-input', 'timeoutMs must be between 100 and 10000 ms.');
  let session: XpbdDeviceSession | null = null;
  let lease: XpbdDeviceLease | null = null;
  const tracked: GPUBuffer[] = [];
  const validationMessages: string[] = [];
  const startedAt = performance.now();
  try {
    throwIfAborted(options.signal);
    session = await withTimeout(
      createXpbdDeviceSession(canvas, {
        gpu: options.gpu,
        sessionIdFactory: options.sessionIdFactory ?? defaultSessionIdFactory,
        onUncapturedError: (message) => validationMessages.push(message),
      }),
      timeoutMs,
    );
    lease = session.acquireExclusive();
    const device = lease.device;
    if (
      device.limits.maxBindingsPerBindGroup < 8 ||
      device.limits.maxStorageBuffersPerShaderStage < 7
    )
      fail('unsupported-webgpu', 'WebGPU storage-binding limits are below the diagnostic ABI.');
    device.pushErrorScope('validation');
    const positionsBuffer = createGpuBuffer(
      device,
      tracked,
      'strain diag positions',
      port.finalPositionsInvMassKg,
      STORAGE,
    );
    const trianglesBuffer = createGpuBuffer(
      device,
      tracked,
      'strain diag triangles',
      port.triangleIndices,
      STORAGE,
    );
    const framesBuffer = createGpuBuffer(
      device,
      tracked,
      'strain diag rest frames',
      port.triangleRestFrames,
      STORAGE,
    );
    const materialIndicesBuffer = createGpuBuffer(
      device,
      tracked,
      'strain diag material indices',
      port.materialIndices,
      STORAGE,
    );
    const materialsBuffer = createGpuBuffer(
      device,
      tracked,
      'strain diag materials',
      port.materialRecords,
      STORAGE,
    );
    const paramsBuffer = createGpuBuffer(
      device,
      tracked,
      'strain diag params',
      diagnosticParams(port),
      UNIFORM,
    );
    const valuesBuffer = createGpuBuffer(
      device,
      tracked,
      'strain diag values',
      new CapturedUint8Array(port.triangleCount * 16),
      STORAGE | COPY_SRC,
    );
    const flagsBuffer = createGpuBuffer(
      device,
      tracked,
      'strain diag flags',
      new CapturedUint8Array(port.triangleCount * 4),
      STORAGE | COPY_SRC,
    );
    const readbackBuffer = device.createBuffer({
      label: 'strain diag bounded readback',
      size: BETA_SKIRT_STRAIN_UTILIZATION_READBACK_BYTES_V1,
      usage: MAP_READ | COPY_DST,
    });
    tracked.push(readbackBuffer);
    const pipeline = await withTimeout(createPipeline(device), timeoutMs);
    const bindGroup = device.createBindGroup({
      layout: pipeline.getBindGroupLayout(0),
      entries: [
        positionsBuffer,
        trianglesBuffer,
        framesBuffer,
        materialIndicesBuffer,
        materialsBuffer,
        paramsBuffer,
        valuesBuffer,
        flagsBuffer,
      ].map((buffer, binding) => ({ binding, resource: { buffer } })),
    });
    const encoder = device.createCommandEncoder({ label: 'strain diag compute and readback' });
    const pass = encoder.beginComputePass({ label: 'strain diag one bounded dispatch' });
    pass.setPipeline(pipeline);
    pass.setBindGroup(0, bindGroup);
    pass.dispatchWorkgroups(Math.ceil(port.triangleCount / 64));
    pass.end();
    encoder.copyBufferToBuffer(valuesBuffer, 0, readbackBuffer, 0, port.triangleCount * 16);
    encoder.copyBufferToBuffer(
      flagsBuffer,
      0,
      readbackBuffer,
      port.triangleCount * 16,
      port.triangleCount * 4,
    );
    device.queue.submit([encoder.finish()]);
    await withTimeout(device.queue.onSubmittedWorkDone(), timeoutMs);
    const validation = await device.popErrorScope();
    if (validation) validationMessages.push(validation.message);
    if (validationMessages.length > 0)
      fail('gpu-execution-failed', `WebGPU validation failed: ${validationMessages.join(' | ')}`);
    throwIfAborted(options.signal);
    await withTimeout(readbackBuffer.mapAsync(MAP_READ), timeoutMs);
    let bytes: Uint8Array<ArrayBuffer>;
    try {
      bytes = copiedBytes(readbackBuffer.getMappedRange());
    } finally {
      readbackBuffer.unmap();
    }
    const valueBytes = port.triangleCount * 16;
    return Object.freeze({
      values: new CapturedFloat32Array(bytes.buffer.slice(0, valueBytes)),
      flags: new CapturedUint32Array(bytes.buffer.slice(valueBytes)),
      gpuWallTimeMs: performance.now() - startedAt,
      validationMessages: Object.freeze([...validationMessages]),
      destroyedBufferCount: tracked.length,
    });
  } catch (error) {
    if (error instanceof DiagnosticError) throw error;
    const detail = error instanceof Error ? error.message : 'Unknown WebGPU diagnostic failure.';
    if (/WebGPU is unavailable|adapter|canvas/i.test(detail))
      return fail('unsupported-webgpu', detail);
    return fail('gpu-execution-failed', detail);
  } finally {
    for (const buffer of tracked) buffer.destroy();
    lease?.release();
    if (session) await session.dispose();
  }
}

/**
 * Additive low-level port used by later retained-runner adapters. It deliberately returns only
 * the bounded GPU readback; owner authentication and claim separation remain the adapter's job.
 */
export async function executeTriangleStrainUtilizationGpuPortV1(
  canvas: HTMLCanvasElement,
  port: TriangleStrainUtilizationPortV1,
  options: BetaSkirtCanonicalMediumStrainUtilizationDiagnosticOptionsV1 = {},
): Promise<GpuReadback> {
  const audit = await auditTriangleStrainUtilizationPortV1(port);
  if (!audit.ok)
    fail('invalid-continuum-input', `Continuum port audit blocked: ${audit.blockers.join(', ')}.`);
  const cap = options.readbackCapBytes ?? BETA_SKIRT_STRAIN_UTILIZATION_MAX_READBACK_BYTES_V1;
  if (!triangleStrainUtilizationReadbackFitsCapV1(port.triangleCount, cap))
    fail(
      'readback-cap-exceeded',
      `Required ${triangleStrainUtilizationReadbackBytesV1(port.triangleCount)}B exceeds cap ${cap}.`,
    );
  return executeGpu(canvas, port, options);
}

async function createBoundPort(
  runtimeOwner: BetaSkirtCanonicalMediumWebgpuRuntimeSourceOwnerV1,
  contactOwner: BetaSkirtCanonicalMediumWebgpu16FrameContactRunnerOwnerV2,
): Promise<
  Readonly<{
    port: TriangleStrainUtilizationPortV1;
    runtimeCanonicalSha256: string;
    contactCanonicalSha256: string;
    normalizedV5AggregateSha256: string;
    finalPositions3MSha256: string;
  }>
> {
  const runtime = projectBetaSkirtCanonicalMediumWebgpuRuntimeSourceV1(runtimeOwner);
  if (!runtime) fail('source-owner-unavailable', 'Runtime-source owner does not project.');
  const contact = projectBetaSkirtCanonicalMediumWebgpu16FrameContactV2(contactOwner);
  if (!contact)
    fail('contact-owner-unavailable', 'Retained contact-clear V2 owner does not project.');
  if (
    runtime.reportCanonicalSha256 !== runtimeOwner.report.seal.canonicalSha256 ||
    contact.reportCanonicalSha256 !== contactOwner.report.seal.canonicalSha256 ||
    contactOwner.report.status !== 'diagnostic-completed' ||
    contactOwner.report.decision !== 'PASS_16_FRAME_EXACT_BODY_CONTACT_AND_POSTGATE' ||
    !contactOwner.report.collision.exactActualBodyGateClear ||
    contactOwner.report.collision.bodyGarmentTriangleIntersectionCount !== 0 ||
    contactOwner.report.collision.penetratingVertexCount !== 0 ||
    contactOwner.report.collision.unsafeVertexCount !== 0 ||
    contactOwner.report.collision.ambiguousSignVertexCount !== 0
  )
    fail('binding-mismatch', 'Contact owner is not the retained exact contact-clear V2 result.');
  if (
    contactOwner.report.bindings.runtimeSourceCanonicalSha256 !== runtime.reportCanonicalSha256 ||
    contactOwner.report.bindings.normalizedV5AggregateSha256 !==
      runtime.normalizedV5.seal.aggregateSha256 ||
    runtimeOwner.report.bindings.normalizedV5AggregateSha256 !==
      runtime.normalizedV5.seal.aggregateSha256
  )
    fail('binding-mismatch', 'Runtime-source/V5/contact owner binding drifted.');
  const sealed = await validateSealedSimulationPackageV5V1(runtime.normalizedV5);
  if (!sealed.ok) {
    const errors = 'errors' in sealed ? sealed.errors : ['unsupported V5 validation result'];
    fail('invalid-continuum-input', `V5 seal validation failed: ${errors.join('; ')}`);
  }
  if (!bytesEqual(runtime.normalizedTriangles, contact.normalizedTriangles))
    fail('binding-mismatch', 'Retained contact topology differs from runtime-source topology.');
  const finalPositions3M = positions3(contact.finalPositionsInvMassKg);
  if (!bytesEqual(finalPositions3M, contact.finalPositions3M))
    fail('binding-mismatch', 'Retained vec4 and vec3 final position projections disagree.');
  const finalPositions3MSha256 = await digestBytes(float32LeBytes(contact.finalPositions3M));
  if (
    finalPositions3MSha256 !== contactOwner.report.bindings.finalPositions3MSha256 ||
    finalPositions3MSha256 !== contactOwner.report.bindings.finalCollisionBindingPositionsSha256
  )
    fail('binding-mismatch', 'Retained final position bytes do not match the contact receipt.');
  const continuum = sealed.simulation.constraints.continuumStrain;
  const port = await sealTriangleStrainUtilizationPortV1({
    schemaVersion: TRIANGLE_STRAIN_UTILIZATION_PORT_V1,
    vertexCount: sealed.simulation.manifest.particleCount,
    triangleCount: continuum.constraintCount,
    materialCount: continuum.materialCount,
    finalPositionsInvMassKg: contact.finalPositionsInvMassKg,
    normalizedTopology: runtime.normalizedTriangles,
    triangleIndices: continuum.triangleIndices,
    triangleRestFrames: continuum.triangleRestFrames,
    materialIndices: continuum.materialIndices,
    materialRecords: continuum.materialRecords,
  });
  if (
    port.vertexCount !== BETA_SKIRT_STRAIN_UTILIZATION_VERTEX_COUNT_V1 ||
    port.triangleCount !== BETA_SKIRT_STRAIN_UTILIZATION_TRIANGLE_COUNT_V1
  )
    fail('invalid-continuum-input', 'Canonical-medium 580V/912T workload count drifted.');
  const audit = await auditTriangleStrainUtilizationPortV1(port);
  if (!audit.ok)
    fail('invalid-continuum-input', `Continuum port audit blocked: ${audit.blockers.join(', ')}.`);
  return Object.freeze({
    port,
    runtimeCanonicalSha256: runtime.reportCanonicalSha256,
    contactCanonicalSha256: contact.reportCanonicalSha256,
    normalizedV5AggregateSha256: runtime.normalizedV5.seal.aggregateSha256,
    finalPositions3MSha256,
  });
}

function range(values: Float32Array, lane: number): RangeSummary {
  let minimum = Number.POSITIVE_INFINITY;
  let maximum = Number.NEGATIVE_INFINITY;
  for (let index = lane; index < values.length; index += 4) {
    minimum = Math.min(minimum, values[index]!);
    maximum = Math.max(maximum, values[index]!);
  }
  return Object.freeze({ minimum, maximum });
}

function histogram(values: Float32Array) {
  const boundaries = [0, 0.25, 0.5, 0.75, 1, 1.5, 2, 4] as const;
  const counts = new Array<number>(boundaries.length).fill(0);
  for (let index = 3; index < values.length; index += 4) {
    const value = values[index]!;
    let bin = boundaries.length - 1;
    for (let candidate = 0; candidate < boundaries.length - 1; candidate += 1) {
      if (value < boundaries[candidate + 1]!) {
        bin = candidate;
        break;
      }
    }
    counts[bin] = counts[bin]! + 1;
  }
  return Object.freeze(
    boundaries.map((lowerInclusive, index) =>
      Object.freeze({
        lowerInclusive,
        upperExclusive: index + 1 < boundaries.length ? boundaries[index + 1]! : null,
        count: counts[index]!,
      }),
    ),
  );
}

function validityHistogram(flags: Uint32Array): Readonly<Record<string, number>> {
  const result: Record<string, number> = {};
  flags.forEach((flag) => {
    const key = String(flag);
    result[key] = (result[key] ?? 0) + 1;
  });
  return Object.freeze(result);
}

function countUtilizationAtOrAbove(values: Float32Array, threshold: number): number {
  let count = 0;
  for (let index = 3; index < values.length; index += 4)
    if (values[index]! >= threshold) count += 1;
  return count;
}

function maximumAbsoluteError(left: Float32Array, right: Float32Array): number {
  if (left.length !== right.length) return Number.POSITIVE_INFINITY;
  let maximum = 0;
  for (let index = 0; index < left.length; index += 1)
    maximum = Math.max(maximum, Math.abs(left[index]! - right[index]!));
  return maximum;
}

function outputEnvelope(values: Float32Array, flags: Uint32Array): Uint8Array<ArrayBuffer> {
  const valueBytes = float32LeBytes(values);
  const flagBytes = uint32LeBytes(flags);
  const result = new CapturedUint8Array(valueBytes.byteLength + flagBytes.byteLength);
  result.set(valueBytes, 0);
  result.set(flagBytes, valueBytes.byteLength);
  return result;
}

export async function runBetaSkirtCanonicalMediumStrainUtilizationDiagnosticV1(
  canvas: HTMLCanvasElement,
  runtimeOwner: BetaSkirtCanonicalMediumWebgpuRuntimeSourceOwnerV1,
  contactOwner: BetaSkirtCanonicalMediumWebgpu16FrameContactRunnerOwnerV2,
  options: BetaSkirtCanonicalMediumStrainUtilizationDiagnosticOptionsV1 = {},
): Promise<BetaSkirtCanonicalMediumStrainUtilizationDiagnosticResultV1> {
  try {
    throwIfAborted(options.signal);
    await validateDigestAuthority();
    const bound = await createBoundPort(runtimeOwner, contactOwner);
    const readbackCap =
      options.readbackCapBytes ?? BETA_SKIRT_STRAIN_UTILIZATION_MAX_READBACK_BYTES_V1;
    if (
      !Number.isSafeInteger(readbackCap) ||
      readbackCap < 0 ||
      BETA_SKIRT_STRAIN_UTILIZATION_READBACK_BYTES_V1 > readbackCap
    )
      fail(
        'readback-cap-exceeded',
        `Required ${BETA_SKIRT_STRAIN_UTILIZATION_READBACK_BYTES_V1} byte readback exceeds cap ${readbackCap}.`,
      );
    const gpu = await executeGpu(canvas, bound.port, options);
    const invalidTriangleCount = gpu.flags.reduce((count, flag) => count + (flag === 0 ? 0 : 1), 0);
    if (invalidTriangleCount > 0 || gpu.values.some((value) => !Number.isFinite(value)))
      fail('invalid-gpu-output', `GPU emitted ${invalidTriangleCount} invalid triangle records.`);
    const cpu = evaluateTriangleStrainUtilizationCpuV1(bound.port);
    const cpuParityMaximumAbsoluteError = maximumAbsoluteError(gpu.values, cpu);
    const cpuParityTolerance = 0.00001 as const;
    if (
      !Number.isFinite(cpuParityMaximumAbsoluteError) ||
      cpuParityMaximumAbsoluteError > cpuParityTolerance
    )
      fail(
        'invalid-gpu-output',
        `GPU/CPU strain kinematics differ by ${cpuParityMaximumAbsoluteError}, above ${cpuParityTolerance}.`,
      );
    const [kernelSourceSha256, provisionalLimitsSha256, colorLutSha256] = await Promise.all([
      digestText(TRIANGLE_STRAIN_UTILIZATION_DIAGNOSTIC_WGSL_V1),
      digestText(capturedJsonStringify(BETA_SKIRT_STRAIN_UTILIZATION_PROVISIONAL_LIMITS_V1)),
      digestText(capturedJsonStringify(BETA_SKIRT_STRAIN_UTILIZATION_COLOR_LUT_V1)),
    ]);
    const outputValuesFloat32LeSha256 = await digestBytes(float32LeBytes(gpu.values));
    const outputValidityFlagsUint32LeSha256 = await digestBytes(uint32LeBytes(gpu.flags));
    const outputEnvelopeSha256 = await digestBytes(outputEnvelope(gpu.values, gpu.flags));
    const normalizedUtilizationRange = range(gpu.values, 3);
    const reportWithoutSeal = Object.freeze({
      schemaVersion: BETA_SKIRT_CANONICAL_MEDIUM_STRAIN_UTILIZATION_DIAGNOSTIC_REPORT_V1,
      status: 'diagnostic-completed' as const,
      decision: 'PASS_BOUNDED_PER_TRIANGLE_STRAIN_UTILIZATION_DIAGNOSTIC' as const,
      bindings: Object.freeze({
        runtimeSourceCanonicalSha256: bound.runtimeCanonicalSha256,
        contactRunnerCanonicalSha256: bound.contactCanonicalSha256,
        normalizedV5AggregateSha256: bound.normalizedV5AggregateSha256,
        finalPositions3MSha256: bound.finalPositions3MSha256,
        port: bound.port.bindings,
        kernelSourceSha256,
        provisionalLimitsSha256,
        colorLutSha256,
        outputValuesFloat32LeSha256,
        outputValidityFlagsUint32LeSha256,
        outputEnvelopeSha256,
      }),
      workload: Object.freeze({
        vertexCount: BETA_SKIRT_STRAIN_UTILIZATION_VERTEX_COUNT_V1,
        triangleCount: BETA_SKIRT_STRAIN_UTILIZATION_TRIANGLE_COUNT_V1,
        materialCount: bound.port.materialCount,
        dispatchCount: 1 as const,
        workgroupSize: 64 as const,
        workgroupCount: Math.ceil(bound.port.triangleCount / 64),
      }),
      readback: Object.freeze({
        valueByteLength: BETA_SKIRT_STRAIN_UTILIZATION_VALUE_BYTES_V1,
        validityFlagByteLength: BETA_SKIRT_STRAIN_UTILIZATION_FLAG_BYTES_V1,
        totalByteLength: BETA_SKIRT_STRAIN_UTILIZATION_READBACK_BYTES_V1,
        maximumByteLength: BETA_SKIRT_STRAIN_UTILIZATION_MAX_READBACK_BYTES_V1,
      }),
      validity: Object.freeze({
        validTriangleCount: bound.port.triangleCount,
        invalidTriangleCount,
        flagHistogram: validityHistogram(gpu.flags),
        cpuParityMaximumAbsoluteError,
        cpuParityTolerance,
      }),
      ranges: Object.freeze({
        warpStrain: range(gpu.values, 0),
        weftStrain: range(gpu.values, 1),
        shearStrain: range(gpu.values, 2),
        normalizedUtilization: normalizedUtilizationRange,
      }),
      histogram: Object.freeze({
        basis: 'normalized-utilization' as const,
        bins: histogram(gpu.values),
      }),
      interpretation: Object.freeze({
        triangleCountAtOrAboveProvisionalLimit: countUtilizationAtOrAbove(gpu.values, 1),
        triangleCountAtOrAboveFourTimesProvisionalLimit: countUtilizationAtOrAbove(gpu.values, 4),
        maximumUtilizationInterpretation:
          normalizedUtilizationRange.maximum >= 4
            ? ('strong-distortion-signal-relative-to-provisional-visualization-limits' as const)
            : ('distortion-signal-relative-to-provisional-visualization-limits' as const),
        utilizationIsMaterialFailureCriterion: false as const,
        utilizationIsPhysicalStressOrPa: false as const,
      }),
      visualization: Object.freeze({
        limits: BETA_SKIRT_STRAIN_UTILIZATION_PROVISIONAL_LIMITS_V1,
        colorLut: BETA_SKIRT_STRAIN_UTILIZATION_COLOR_LUT_V1,
      }),
      execution: Object.freeze({
        gpuWallTimeMs: gpu.gpuWallTimeMs,
        timeoutMs: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
        validationMessages: gpu.validationMessages,
        destroyedBufferCount: gpu.destroyedBufferCount,
        leaseReleased: true as const,
        sessionDisposed: true as const,
      }),
      blockers: Object.freeze([
        'material-visualization-thresholds-provisional-and-uncalibrated',
        'physical-stress-and-pa-not-computed',
        'material-failure-not-evaluated',
        'fit-runtime-production-authority-not-established',
      ] as const),
      claims: Object.freeze({
        exactRetainedContactClearV2ProjectionBound: true as const,
        exactRuntimeSourceV5ContinuumBuffersBound: true as const,
        gpuPerTriangleDiagnosticExecuted: true as const,
        boundedReadback: true as const,
        dimensionlessStrainDiagnosticOnly: true as const,
        provisionalMaterialVisualizationThresholds: true as const,
        physicalStressOrPaComputed: false as const,
        materialFailureEvaluated: false as const,
        collisionAuthority: false as const,
        fitAuthority: false as const,
        runtimeAuthority: false as const,
        productionAuthority: false as const,
      }),
    });
    const canonicalSha256 = await digestText(capturedJsonStringify(reportWithoutSeal));
    const report: BetaSkirtCanonicalMediumStrainUtilizationDiagnosticReportV1 = Object.freeze({
      ...reportWithoutSeal,
      seal: Object.freeze({
        algorithm: 'SHA-256' as const,
        canonicalSha256,
        authority: 'unsigned-gpu-strain-utilization-diagnostic-only' as const,
      }),
    });
    const owner = Object.freeze({
      schemaVersion: BETA_SKIRT_CANONICAL_MEDIUM_STRAIN_UTILIZATION_DIAGNOSTIC_OWNER_V1,
      report,
    }) as BetaSkirtCanonicalMediumStrainUtilizationDiagnosticOwnerV1;
    owners.set(owner, {
      triangleValues: new CapturedFloat32Array(gpu.values),
      validityFlags: new CapturedUint32Array(gpu.flags),
      normalizedTopology: new CapturedUint32Array(bound.port.normalizedTopology),
    });
    return Object.freeze({ ok: true as const, owner, report });
  } catch (error) {
    if (error instanceof DiagnosticError)
      return Object.freeze({ ok: false as const, code: error.code, detail: error.message });
    return Object.freeze({
      ok: false as const,
      code: 'invalid-continuum-input' as const,
      detail: error instanceof Error ? error.message : 'Unknown strain-utilization failure.',
    });
  }
}

export function projectBetaSkirtCanonicalMediumStrainUtilizationDiagnosticV1(
  owner: unknown,
): BetaSkirtCanonicalMediumStrainUtilizationDiagnosticProjectionV1 | null {
  if (!owner || (typeof owner !== 'object' && typeof owner !== 'function')) return null;
  const record = owners.get(owner as object);
  if (!record) return null;
  const publicOwner = owner as BetaSkirtCanonicalMediumStrainUtilizationDiagnosticOwnerV1;
  return Object.freeze({
    schemaVersion: BETA_SKIRT_CANONICAL_MEDIUM_STRAIN_UTILIZATION_DIAGNOSTIC_PROJECTION_V1,
    reportCanonicalSha256: publicOwner.report.seal.canonicalSha256,
    triangleValues: new CapturedFloat32Array(record.triangleValues),
    validityFlags: new CapturedUint32Array(record.validityFlags),
    normalizedTopology: new CapturedUint32Array(record.normalizedTopology),
    valuesLayout: Object.freeze([
      'warpStrain',
      'weftStrain',
      'shearStrain',
      'normalizedUtilization',
    ] as const),
    callerOwnedMutableBinaryCopies: true as const,
    strainDiagnosticAuthority: true as const,
    physicalStressAuthority: false as const,
    materialFailureAuthority: false as const,
    fitAuthority: false as const,
    runtimeAuthority: false as const,
    productionAuthority: false as const,
  });
}

export function disposeBetaSkirtCanonicalMediumStrainUtilizationDiagnosticV1(
  owner: unknown,
): boolean {
  if (!owner || (typeof owner !== 'object' && typeof owner !== 'function')) return false;
  const record = owners.get(owner as object);
  if (!record) return false;
  capturedReflectApply(capturedFloat32Fill, record.triangleValues, [0]);
  capturedReflectApply(capturedUint32Fill, record.validityFlags, [0]);
  capturedReflectApply(capturedUint32Fill, record.normalizedTopology, [0]);
  owners.delete(owner as object);
  return true;
}
