import type * as LimbSubsetRuntimeModuleV1 from './measurement-open-reference-limb-subset-runtime-v1';

export const MEASUREMENT_OPEN_REFERENCE_LIMB_SUBSET_RUNTIME_LOADER_V1 =
  'measurement-open-reference-limb-subset-runtime-loader/v1' as const;

export type MeasurementOpenReferenceLimbSubsetRuntimeModuleV1 = typeof LimbSubsetRuntimeModuleV1;

let runtimeModulePromise: Promise<MeasurementOpenReferenceLimbSubsetRuntimeModuleV1> | null = null;

/**
 * Literal dynamic import admitted by receipt 77 only after explicit A-rest BUILD with at least one
 * optional robust limb value. The runtime remains absent from the body barrel.
 */
export function loadMeasurementOpenReferenceLimbSubsetRuntimeModuleV1(): Promise<MeasurementOpenReferenceLimbSubsetRuntimeModuleV1> {
  runtimeModulePromise ??= import('./measurement-open-reference-limb-subset-runtime-v1').catch(
    (reason: unknown) => {
      runtimeModulePromise = null;
      throw reason;
    },
  );
  return runtimeModulePromise;
}
