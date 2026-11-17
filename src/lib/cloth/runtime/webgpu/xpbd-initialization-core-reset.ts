export const XPBD_INITIALIZATION_CORE_RESET_ABI_V1 = 'xpbd-initialization-core-reset/v1' as const;

export const XPBD_DISTANCE_RESET_PACKET_V1 = Object.freeze({
  version: 'xpbd-distance-reset-packet/v1' as const,
  byteLength: 32,
  offsets: Object.freeze({ constraintCount: 0, reserved0: 4 }),
});
export const XPBD_SEAM_ALL_ACTIVE_PACKET_V1 = Object.freeze({
  version: 'xpbd-seam-all-active-packet/v1' as const,
  byteLength: 16,
  offsets: Object.freeze({
    totalConstraintCount: 0,
    activeConstraintCount: 4,
    complianceMPerN: 8,
    dtS: 12,
  }),
});
export const XPBD_BEND_RESET_PACKET_V1 = Object.freeze({
  version: 'xpbd-bend-reset-packet/v1' as const,
  byteLength: 16,
  offsets: Object.freeze({ constraintCount: 0, reserved0: 4 }),
});
export const XPBD_CONTINUUM_RESET_PACKET_V1 = Object.freeze({
  version: 'xpbd-continuum-reset-packet/v1' as const,
  byteLength: 16,
  offsets: Object.freeze({ constraintCount: 0, reserved0: 4 }),
});

export const XPBD_CONTINUUM_STATUS_UNTOUCHED_RESET = 0xffff_ffff;

function positiveUint32(value: number, name: string): void {
  if (!Number.isSafeInteger(value) || value < 1 || value > 0xffff_ffff) {
    throw new RangeError(`${name} must be a positive uint32.`);
  }
}

function canonicalNonNegativeF32(value: number, name: string): number {
  const rounded = Math.fround(value);
  if (!Number.isFinite(rounded) || rounded < 0 || Object.is(rounded, -0)) {
    throw new RangeError(`${name} must be a finite non-negative canonical float32.`);
  }
  return rounded;
}

function positiveF32(value: number, name: string): number {
  const rounded = Math.fround(value);
  if (!Number.isFinite(rounded) || rounded <= 0) {
    throw new RangeError(`${name} must be a finite positive float32.`);
  }
  return rounded;
}

function countPacket(byteLength: number, constraintCount: number): ArrayBuffer {
  positiveUint32(constraintCount, 'constraintCount');
  const buffer = new ArrayBuffer(byteLength);
  new DataView(buffer).setUint32(0, constraintCount, true);
  return buffer;
}

export function createXpbdDistanceResetPacketV1(constraintCount: number): ArrayBuffer {
  return countPacket(XPBD_DISTANCE_RESET_PACKET_V1.byteLength, constraintCount);
}

export function createXpbdSeamAllActivePacketV1(
  input: Readonly<{
    totalConstraintCount: number;
    activeConstraintCount: number;
    complianceMPerN: number;
    dtS: number;
  }>,
): ArrayBuffer {
  positiveUint32(input.totalConstraintCount, 'totalConstraintCount');
  positiveUint32(input.activeConstraintCount, 'activeConstraintCount');
  if (input.activeConstraintCount !== input.totalConstraintCount) {
    throw new RangeError('Body-relative seam reset requires every seam constraint active.');
  }
  const buffer = new ArrayBuffer(XPBD_SEAM_ALL_ACTIVE_PACKET_V1.byteLength);
  const view = new DataView(buffer);
  view.setUint32(0, input.totalConstraintCount, true);
  view.setUint32(4, input.activeConstraintCount, true);
  view.setFloat32(8, canonicalNonNegativeF32(input.complianceMPerN, 'complianceMPerN'), true);
  view.setFloat32(12, positiveF32(input.dtS, 'dtS'), true);
  return buffer;
}

export function createXpbdBendResetPacketV1(constraintCount: number): ArrayBuffer {
  return countPacket(XPBD_BEND_RESET_PACKET_V1.byteLength, constraintCount);
}

export function createXpbdContinuumResetPacketV1(constraintCount: number): ArrayBuffer {
  return countPacket(XPBD_CONTINUUM_RESET_PACKET_V1.byteLength, constraintCount);
}

const COUNT_RESET_SHARED = /* wgsl */ `
struct CountResetParams {
  constraintCount: u32,
  reserved0: u32,
  reserved1: u32,
  reserved2: u32,
};
@group(0) @binding(1) var<uniform> params: CountResetParams;
`;

export const XPBD_DISTANCE_RESET_WGSL_V1 = /* wgsl */ `${COUNT_RESET_SHARED}
@group(0) @binding(0) var<storage, read_write> lambdas: array<f32>;
@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) invocation: vec3<u32>) {
  if (invocation.x < params.constraintCount) { lambdas[invocation.x] = 0.0; }
}`;

export const XPBD_SEAM_ALL_ACTIVE_RESET_WGSL_V1 = /* wgsl */ `
struct SeamAllActiveParams {
  totalConstraintCount: u32,
  activeConstraintCount: u32,
  complianceMPerN: f32,
  dtS: f32,
};
@group(0) @binding(0) var<storage, read_write> lambdas: array<f32>;
@group(0) @binding(1) var<uniform> params: SeamAllActiveParams;
@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) invocation: vec3<u32>) {
  if (params.activeConstraintCount != params.totalConstraintCount) { return; }
  if (invocation.x < params.totalConstraintCount) { lambdas[invocation.x] = 0.0; }
}`;

export const XPBD_BEND_RESET_WGSL_V1 = /* wgsl */ `${COUNT_RESET_SHARED}
@group(0) @binding(0) var<storage, read_write> lambdas: array<f32>;
@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) invocation: vec3<u32>) {
  if (invocation.x < params.constraintCount) { lambdas[invocation.x] = 0.0; }
}`;

export const XPBD_CONTINUUM_RESET_WGSL_V1 = /* wgsl */ `${COUNT_RESET_SHARED}
@group(0) @binding(0) var<storage, read_write> lambdasKgM: array<vec4<f32>>;
@group(0) @binding(2) var<storage, read_write> statuses: array<u32>;
@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) invocation: vec3<u32>) {
  if (invocation.x >= params.constraintCount) { return; }
  lambdasKgM[invocation.x] = vec4<f32>(0.0);
  statuses[invocation.x] = 0xffffffffu;
}`;
