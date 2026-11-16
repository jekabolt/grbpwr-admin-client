import { describe, expect, it } from 'vitest';

import { loadMeasurementOpenReferenceLimbSubsetRuntimeModuleV1 } from './measurement-open-reference-limb-subset-runtime-loader-v1';

describe('measurement open-reference limb subset runtime loader v1', () => {
  it('loads one cached code-only runtime module through the literal dynamic boundary', async () => {
    const firstRequest = loadMeasurementOpenReferenceLimbSubsetRuntimeModuleV1();
    const secondRequest = loadMeasurementOpenReferenceLimbSubsetRuntimeModuleV1();
    expect(secondRequest).toBe(firstRequest);

    const module = await firstRequest;
    expect(module.createMeasurementOpenReferenceLimbSubsetRuntimeV1).toBeTypeOf('function');
    expect(module.MEASUREMENT_OPEN_REFERENCE_LIMB_SUBSET_KEYS_V1).toEqual([
      'bicepCircumferenceMm',
      'wristCircumferenceMm',
      'thighCircumferenceMm',
      'calfCircumferenceMm',
      'ankleCircumferenceMm',
    ]);
  });
});
