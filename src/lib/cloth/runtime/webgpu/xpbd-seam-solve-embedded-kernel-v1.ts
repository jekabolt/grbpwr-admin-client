/* global GPUShaderModuleDescriptor */

import {
  hashXpbdSeamSolveSourceV1,
  XPBD_SEAM_SOLVE_WORKGROUP_SIZE_V1,
} from './xpbd-seam-solve-kernel-v1';
import { XPBD_SEAM_SUPPORT_PACKET_V1 } from './xpbd-seam-support-packet-v1';

export const XPBD_SEAM_SOLVE_EMBEDDED_ENTRY_POINT_V1 = 'solveEmbeddedXpbdSeamColorV1';
export const XPBD_SEAM_SOLVE_EMBEDDED_SOURCE_REVISION_V1 = 'xpbd-seam-solve-embedded-wgsl/1';
export const XPBD_SEAM_SOLVE_EMBEDDED_SOURCE_SHA256_V1 =
  'b8ab4f63a579bac2c50676781811041c3cecdd16fba90010cd7e0b7ac581d8c4' as const;

const { supportsPerRow } = XPBD_SEAM_SUPPORT_PACKET_V1;

/** Same XPBD step and color schedule as the two-particle seam, with an affine material point per side. */
export const XPBD_SEAM_SOLVE_EMBEDDED_WGSL_V1 = /* wgsl */ `
struct SupportRow {
  particleIndices: array<u32, ${supportsPerRow}>,
  weights: array<f32, ${supportsPerRow}>,
};
struct ColorParams {
  constraintOffset: u32,
  constraintCount: u32,
  reserved0: u32,
  reserved1: u32,
};
struct ActivationParams {
  totalConstraintCount: u32,
  activeConstraintCount: u32,
  complianceMPerN: f32,
  dtS: f32,
};
@group(0) @binding(0) var<storage, read_write> positions: array<vec4<f32>>;
@group(0) @binding(1) var<storage, read> supports: array<SupportRow>;
@group(0) @binding(2) var<storage, read> targetLengths: array<f32>;
@group(0) @binding(3) var<storage, read_write> lambdas: array<f32>;
@group(0) @binding(4) var<storage, read> activationRanks: array<u32>;
@group(0) @binding(5) var<uniform> color: ColorParams;
@group(0) @binding(6) var<uniform> activation: ActivationParams;

fn finiteScalar(value: f32) -> bool {
  return value == value && abs(value) < 1.0e30;
}
fn finiteVector(value: vec3<f32>) -> bool {
  return all(value == value) && all(abs(value) < vec3<f32>(1.0e30));
}
fn validDispatch(groups: vec3<u32>) -> bool {
  let groupSize = ${XPBD_SEAM_SOLVE_WORKGROUP_SIZE_V1}u;
  let expected = color.constraintCount / groupSize +
    select(0u, 1u, color.constraintCount % groupSize != 0u);
  let end = color.constraintOffset + color.constraintCount;
  let count = activation.totalConstraintCount;
  return color.constraintCount > 0u && all(groups == vec3<u32>(expected, 1u, 1u)) &&
    color.reserved0 == 0u && color.reserved1 == 0u && count > 0u &&
    color.constraintOffset <= end && end <= count && activation.activeConstraintCount <= count &&
    arrayLength(&supports) == count && arrayLength(&targetLengths) == count &&
    arrayLength(&lambdas) == count && arrayLength(&activationRanks) == count &&
    finiteScalar(activation.complianceMPerN) && activation.complianceMPerN >= 0.0 &&
    finiteScalar(activation.dtS) && activation.dtS > 0.0;
}

@compute @workgroup_size(${XPBD_SEAM_SOLVE_WORKGROUP_SIZE_V1})
fn ${XPBD_SEAM_SOLVE_EMBEDDED_ENTRY_POINT_V1}(
  @builtin(global_invocation_id) invocation: vec3<u32>,
  @builtin(num_workgroups) groups: vec3<u32>,
) {
  if (!validDispatch(groups) || invocation.x >= color.constraintCount) { return; }
  let constraint = color.constraintOffset + invocation.x;
  if (activationRanks[constraint] >= activation.activeConstraintCount) { return; }
  let row = supports[constraint];
  let targetLength = targetLengths[constraint];
  let previousLambda = lambdas[constraint];
  if (!finiteScalar(targetLength) || targetLength < 0.0 || !finiteScalar(previousLambda) ||
      row.particleIndices[0] >= arrayLength(&positions)) { return; }

  // Express the affine gap relative to one of its own support points.
  let anchor = positions[row.particleIndices[0]].xyz;
  var gap = vec3<f32>(0.0);
  var inverseMass = 0.0;
  var states: array<vec4<f32>, ${supportsPerRow}>;
  for (var slot = 0u; slot < ${supportsPerRow}u; slot++) {
    let weight = row.weights[slot];
    if (weight == 0.0) { continue; }
    let particle = row.particleIndices[slot];
    if (!finiteScalar(weight) || abs(weight) > 1.0 ||
        particle >= arrayLength(&positions)) { return; }
    let state = positions[particle];
    if (!finiteVector(state.xyz) || !finiteScalar(state.w) || state.w < 0.0) { return; }
    states[slot] = state;
    gap += weight * (state.xyz - anchor);
    inverseMass += state.w * weight * weight;
  }
  let distance = length(gap);
  if (!finiteScalar(distance) || distance <= 1.0e-8 ||
      !finiteScalar(inverseMass) || inverseMass <= 0.0) { return; }
  let alpha = activation.complianceMPerN / (activation.dtS * activation.dtS);
  let denominator = inverseMass + alpha;
  if (!finiteScalar(alpha) || !finiteScalar(denominator) || denominator <= 1.0e-12) {
    return;
  }
  let deltaLambda = (targetLength - distance - alpha * previousLambda) / denominator;
  let nextLambda = previousLambda + deltaLambda;
  if (!finiteScalar(deltaLambda) || !finiteScalar(nextLambda)) { return; }
  let correction = gap * (deltaLambda / distance);
  var next: array<vec3<f32>, ${supportsPerRow}>;
  for (var slot = 0u; slot < ${supportsPerRow}u; slot++) {
    if (row.weights[slot] == 0.0) { continue; }
    let state = states[slot];
    next[slot] = state.xyz + (state.w * row.weights[slot]) * correction;
    if (!finiteVector(next[slot])) { return; }
  }

  lambdas[constraint] = nextLambda;
  for (var slot = 0u; slot < ${supportsPerRow}u; slot++) {
    if (row.weights[slot] != 0.0 && states[slot].w > 0.0) {
      positions[row.particleIndices[slot]] = vec4<f32>(next[slot], states[slot].w);
    }
  }
}
`.trim();

export function xpbdSeamSolveEmbeddedShaderDescriptorV1(): GPUShaderModuleDescriptor {
  return { label: 'XPBD embedded seam solve V1', code: XPBD_SEAM_SOLVE_EMBEDDED_WGSL_V1 };
}

export async function getXpbdSeamSolveEmbeddedPipelineIdentityV1(
  options: Readonly<{ crypto?: Pick<Crypto, 'subtle'> | null }> = {},
) {
  const sha256 = await hashXpbdSeamSolveSourceV1(XPBD_SEAM_SOLVE_EMBEDDED_WGSL_V1, options);
  if (sha256 !== XPBD_SEAM_SOLVE_EMBEDDED_SOURCE_SHA256_V1)
    throw new Error('XPBD embedded seam solve source differs from its pinned identity.');
  return Object.freeze({ sha256, entryPoint: XPBD_SEAM_SOLVE_EMBEDDED_ENTRY_POINT_V1 });
}
