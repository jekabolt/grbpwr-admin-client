/* global GPUShaderModuleDescriptor */

import {
  XPBD_BEND_RESET_WGSL_V1,
  XPBD_CONTINUUM_RESET_WGSL_V1,
  XPBD_DISTANCE_RESET_WGSL_V1,
  XPBD_SEAM_ALL_ACTIVE_RESET_WGSL_V1,
} from './xpbd-initialization-core-reset';

export const XPBD_DISTANCE_RESET_KERNEL_V1 = 'xpbd-distance-reset-kernel/v1' as const;
export const XPBD_SEAM_ALL_ACTIVE_RESET_KERNEL_V1 = 'xpbd-seam-all-active-reset-kernel/v1' as const;
export const XPBD_BEND_RESET_KERNEL_V1 = 'xpbd-bend-reset-kernel/v1' as const;
export const XPBD_CONTINUUM_RESET_KERNEL_V1 = 'xpbd-continuum-reset-kernel/v1' as const;

export const XPBD_DISTANCE_RESET_SOURCE_REVISION_V1 = 'xpbd-distance-reset-kernel-wgsl/1' as const;
export const XPBD_SEAM_ALL_ACTIVE_RESET_SOURCE_REVISION_V1 =
  'xpbd-seam-all-active-reset-kernel-wgsl/1' as const;
export const XPBD_BEND_RESET_SOURCE_REVISION_V1 = 'xpbd-bend-reset-kernel-wgsl/1' as const;
export const XPBD_CONTINUUM_RESET_SOURCE_REVISION_V1 =
  'xpbd-continuum-reset-kernel-wgsl/1' as const;

export const XPBD_DISTANCE_RESET_ENTRY_POINT_V1 = 'main' as const;
export const XPBD_SEAM_ALL_ACTIVE_RESET_ENTRY_POINT_V1 = 'main' as const;
export const XPBD_BEND_RESET_ENTRY_POINT_V1 = 'main' as const;
export const XPBD_CONTINUUM_RESET_ENTRY_POINT_V1 = 'main' as const;

export const XPBD_DISTANCE_RESET_SOURCE_SHA256_V1 =
  'a0d03f695642a636397d1612592010881332022f7c86ded3da25632ed44a127e' as const;
export const XPBD_SEAM_ALL_ACTIVE_RESET_SOURCE_SHA256_V1 =
  '491fb80290fa01b58c437e5c98197783d6f1755db6340803070ba3a88627a5c1' as const;
export const XPBD_BEND_RESET_SOURCE_SHA256_V1 =
  'a0d03f695642a636397d1612592010881332022f7c86ded3da25632ed44a127e' as const;
export const XPBD_CONTINUUM_RESET_SOURCE_SHA256_V1 =
  '76b1d4865069128a747a795207307f73acff533d88a63cf3360220c54ece6b2c' as const;

export type XpbdInitializationCoreResetKernelV1 =
  'distance' | 'seam-all-active' | 'bend' | 'continuum';

const RESET_KERNELS = Object.freeze({
  distance: Object.freeze({
    version: XPBD_DISTANCE_RESET_KERNEL_V1,
    sourceRevision: XPBD_DISTANCE_RESET_SOURCE_REVISION_V1,
    entryPoint: XPBD_DISTANCE_RESET_ENTRY_POINT_V1,
    sourceSha256: XPBD_DISTANCE_RESET_SOURCE_SHA256_V1,
    source: XPBD_DISTANCE_RESET_WGSL_V1,
    label: 'XPBD distance reset V1',
  }),
  'seam-all-active': Object.freeze({
    version: XPBD_SEAM_ALL_ACTIVE_RESET_KERNEL_V1,
    sourceRevision: XPBD_SEAM_ALL_ACTIVE_RESET_SOURCE_REVISION_V1,
    entryPoint: XPBD_SEAM_ALL_ACTIVE_RESET_ENTRY_POINT_V1,
    sourceSha256: XPBD_SEAM_ALL_ACTIVE_RESET_SOURCE_SHA256_V1,
    source: XPBD_SEAM_ALL_ACTIVE_RESET_WGSL_V1,
    label: 'XPBD seam all-active reset V1',
  }),
  bend: Object.freeze({
    version: XPBD_BEND_RESET_KERNEL_V1,
    sourceRevision: XPBD_BEND_RESET_SOURCE_REVISION_V1,
    entryPoint: XPBD_BEND_RESET_ENTRY_POINT_V1,
    sourceSha256: XPBD_BEND_RESET_SOURCE_SHA256_V1,
    source: XPBD_BEND_RESET_WGSL_V1,
    label: 'XPBD bend reset V1',
  }),
  continuum: Object.freeze({
    version: XPBD_CONTINUUM_RESET_KERNEL_V1,
    sourceRevision: XPBD_CONTINUUM_RESET_SOURCE_REVISION_V1,
    entryPoint: XPBD_CONTINUUM_RESET_ENTRY_POINT_V1,
    sourceSha256: XPBD_CONTINUUM_RESET_SOURCE_SHA256_V1,
    source: XPBD_CONTINUUM_RESET_WGSL_V1,
    label: 'XPBD continuum reset V1',
  }),
} as const);

export const XPBD_INITIALIZATION_CORE_RESET_KERNEL_IDENTITIES_V1 = Object.freeze(
  Object.entries(RESET_KERNELS).map(([logicalName, definition]) =>
    Object.freeze({
      logicalName: logicalName as XpbdInitializationCoreResetKernelV1,
      version: definition.version,
      sourceRevision: definition.sourceRevision,
      entryPoint: definition.entryPoint,
      sourceSha256: definition.sourceSha256,
    }),
  ),
);

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('');
}

export async function hashXpbdInitializationCoreResetSourceV1(
  source: string,
  options: Readonly<{ crypto?: Pick<Crypto, 'subtle'> | null }> = {},
): Promise<string> {
  const crypto = Object.prototype.hasOwnProperty.call(options, 'crypto')
    ? options.crypto
    : globalThis.crypto;
  if (!crypto?.subtle)
    throw new Error('XPBD initialization core reset identity requires Web Crypto SHA-256.');
  const encoded = new TextEncoder().encode(source);
  const owned = new Uint8Array(encoded.byteLength);
  owned.set(encoded);
  return bytesToHex(new Uint8Array(await crypto.subtle.digest('SHA-256', owned.buffer)));
}

export async function verifyXpbdInitializationCoreResetSourceV1(
  logicalName: XpbdInitializationCoreResetKernelV1,
  source: string,
  options: Readonly<{ crypto?: Pick<Crypto, 'subtle'> | null }> = {},
) {
  const definition = RESET_KERNELS[logicalName];
  const sha256 = await hashXpbdInitializationCoreResetSourceV1(source, options);
  if (sha256 !== definition.sourceSha256)
    throw new Error(`${definition.label} source differs from its pinned identity.`);
  return Object.freeze({
    logicalName,
    version: definition.version,
    sourceRevision: definition.sourceRevision,
    sha256,
    entryPoint: definition.entryPoint,
  });
}

export function xpbdInitializationCoreResetShaderDescriptorV1(
  logicalName: XpbdInitializationCoreResetKernelV1,
): GPUShaderModuleDescriptor {
  const definition = RESET_KERNELS[logicalName];
  return { label: definition.label, code: definition.source };
}

export function getXpbdInitializationCoreResetPipelineIdentityV1(
  logicalName: XpbdInitializationCoreResetKernelV1,
  options: Readonly<{ crypto?: Pick<Crypto, 'subtle'> | null }> = {},
) {
  const definition = RESET_KERNELS[logicalName];
  return verifyXpbdInitializationCoreResetSourceV1(logicalName, definition.source, options);
}
