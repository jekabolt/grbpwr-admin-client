/* global GPUShaderModuleDescriptor */

import {
  ACTUAL_BODY_TRIANGLE_MESH_CONTACT_ENTRY_POINT_V2,
  ACTUAL_BODY_TRIANGLE_MESH_CONTACT_WGSL_V2,
  hashActualBodyTriangleMeshContactSourceV2,
} from './actual-body-triangle-mesh-contact-kernel-v2';

export const ACTUAL_BODY_CONTACT_PORTABLE_ENTRY_POINT_V1 =
  'projectActualBodyTriangleMeshContactPortableV1';

const storagePointerHelper = `fn saturatingIncrement(counter: ptr<storage, atomic<u32>, read_write>) {
  loop {
    let current = atomicLoad(counter);
    if (current == 0xffffffffu) { return; }
    let result = atomicCompareExchangeWeak(counter, current, current + 1u);
    if (result.exchanged) { return; }
  }
}
`;
const storagePointerCalls = /saturatingIncrement\(&diagnostics\.(\w+)\);/g;
const original = ACTUAL_BODY_TRIANGLE_MESH_CONTACT_WGSL_V2;
if (
  !original.includes(storagePointerHelper) ||
  [...original.matchAll(storagePointerCalls)].length !== 13
)
  throw new Error('The fixed body contact counter callsites changed.');

/** Same V2 geometry, numeric policy and buffers. The counters use baseline WGSL built-in pointers. */
export const ACTUAL_BODY_CONTACT_PORTABLE_WGSL_V1 = original
  .replace(storagePointerHelper, '')
  .replace(
    storagePointerCalls,
    (_, field: string) => `{
      loop {
        let current = atomicLoad(&diagnostics.${field});
        if (current == 0xffffffffu) { break; }
        let result = atomicCompareExchangeWeak(&diagnostics.${field}, current, current + 1u);
        if (result.exchanged) { break; }
      }
    }`,
  )
  .replace(
    ACTUAL_BODY_TRIANGLE_MESH_CONTACT_ENTRY_POINT_V2,
    ACTUAL_BODY_CONTACT_PORTABLE_ENTRY_POINT_V1,
  );

export const ACTUAL_BODY_CONTACT_PORTABLE_SOURCE_SHA256_V1 =
  '49c610800d4999f1a6e78add78c21d02d2b765611963655a5f18788587154c98';

export async function getActualBodyContactPortablePipelineIdentityV1() {
  const sha256 = await hashActualBodyTriangleMeshContactSourceV2(
    ACTUAL_BODY_CONTACT_PORTABLE_WGSL_V1,
  );
  if (sha256 !== ACTUAL_BODY_CONTACT_PORTABLE_SOURCE_SHA256_V1)
    throw new Error('The portable body contact shader differs from its fixed source.');
  return { entryPoint: ACTUAL_BODY_CONTACT_PORTABLE_ENTRY_POINT_V1, sha256 };
}

export function actualBodyContactPortableShaderDescriptorV1(): GPUShaderModuleDescriptor {
  return { label: 'Portable exact body contact', code: ACTUAL_BODY_CONTACT_PORTABLE_WGSL_V1 };
}
