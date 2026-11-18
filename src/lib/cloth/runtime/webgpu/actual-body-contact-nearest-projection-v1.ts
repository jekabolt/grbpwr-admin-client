/* global GPUShaderModuleDescriptor */

import {
  ACTUAL_BODY_CONTACT_NEAREST_CANDIDATE_ABI_V1,
  ACTUAL_BODY_CONTACT_NEAREST_CANDIDATE_WGSL_V1,
} from './actual-body-contact-nearest-candidate-v1';
import { ACTUAL_BODY_CONTACT_PORTABLE_WGSL_V1 } from './actual-body-contact-portable-kernel-v1';
import { hashActualBodyTriangleMeshContactSourceV2 } from './actual-body-triangle-mesh-contact-kernel-v2';

const abi = ACTUAL_BODY_CONTACT_NEAREST_CANDIDATE_ABI_V1;
const portable = ACTUAL_BODY_CONTACT_PORTABLE_WGSL_V1;
const entryPoint = 'projectActualBodyContactNearestV1';

function sourceSection(source: string, start: string, end: string): string {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from + start.length);
  if (from < 0 || to < 0) throw new Error('A shared body contact shader section is missing.');
  return source.slice(from, to).trimEnd();
}

/** Run the existing portable correction on the nearest result from this frame's query. */
export const ACTUAL_BODY_CONTACT_NEAREST_PROJECTION_WGSL_V1 = /* wgsl */ `
${sourceSection(portable, 'struct ContactParams', 'struct ClosestPointResult')}
${sourceSection(ACTUAL_BODY_CONTACT_NEAREST_CANDIDATE_WGSL_V1, 'struct Hit', 'struct Feature')}
@group(0) @binding(0) var<storage, read_write> clothPositions: array<vec4<f32>>;
@group(0) @binding(1) var<storage, read_write> previousPositions: array<vec4<f32>>;
@group(0) @binding(2) var<storage, read> hits: array<Hit>;
@group(0) @binding(3) var<uniform> params: ContactParams;
@group(0) @binding(4) var<storage, read_write> diagnostics: ContactDiagnostics;
${sourceSection(portable, 'fn finiteScalar', 'fn bodyPosition')}

@compute @workgroup_size(${abi.workgroupSize})
fn ${entryPoint}(@builtin(global_invocation_id) invocation: vec3<u32>) {
  let particleIndex = invocation.x;
  if (particleIndex >= params.particleCount) { return; }
  let hit = hits[particleIndex];
  let particle = clothPositions[particleIndex];
  if (hit.ordinalStatusWork.y == ${abi.status.fixed}u && particle.w == 0.0) { return; }
  let previous = previousPositions[particleIndex];
  let nearestPoint = hit.pointAndScore.xyz;
  let nearestNormal = hit.normal.xyz;
  if (hit.ordinalStatusWork.y != ${abi.status.found}u ||
      hit.ordinalStatusWork.x >= params.bodyTriangleCount ||
      !finiteVec3(nearestPoint) || !finiteVec3(nearestNormal) ||
      !finiteVec3(particle.xyz) || !finiteVec3(previous.xyz) ||
      !finiteScalar(particle.w) || particle.w <= 0.0 ||
      bitcast<u32>(previous.w) != bitcast<u32>(particle.w)) {
    atomicAdd(&diagnostics.invalidParticleCount, 1u);
    return;
  }
  ${sourceSection(portable, 'let signedClearanceM', '\n}')}
}
`.trim();

export async function stagedNearestBodyContactShadersV1() {
  const job = async (code: string, entry: string, expectedSha256: string) => {
    const descriptor: GPUShaderModuleDescriptor = { code };
    const sha256 = await hashActualBodyTriangleMeshContactSourceV2(code);
    if (sha256 !== expectedSha256)
      throw new Error('The staged body shader differs from its fixed source.');
    return [descriptor, { entryPoint: entry, sha256 }] as const;
  };
  const [bodyQuery, bodyContact] = await Promise.all([
    job(
      ACTUAL_BODY_CONTACT_NEAREST_CANDIDATE_WGSL_V1,
      abi.entryPoint,
      'cb046309371f66da2f8ed0b37f1172a53ece8e6d8aee95143eb5cb2cdf447376',
    ),
    job(
      ACTUAL_BODY_CONTACT_NEAREST_PROJECTION_WGSL_V1,
      entryPoint,
      '04c03d0285a04be20ad4a60df45bf969a34c16b7c26365d10cd83419820f5f2a',
    ),
  ]);
  return { bodyQuery, bodyContact };
}
