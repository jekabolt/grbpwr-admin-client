import { describe, expect, it } from 'vitest';

import {
  runBetaSkirtCanonicalMediumWebgpu16FrameContactV2,
  type BetaSkirtCanonicalMediumWebgpu16FrameContactRunnerOptionsV2,
} from './beta-skirt-canonical-medium-webgpu-16-frame-contact-runner-v2';
import type { BetaSkirtCanonicalMediumWebgpuRuntimeSourceOwnerV1 } from './beta-skirt-canonical-medium-webgpu-runtime-source-v1';

describe('canonical-medium WebGPU 16-frame exact-body contact runner hostile boundary', () => {
  it('rejects forged and decorated runtime-source owners before touching WebGPU', async () => {
    const gpu = Object.freeze({
      getPreferredCanvasFormat: () => {
        throw new Error('forged owner reached WebGPU');
      },
      requestAdapter: async () => {
        throw new Error('forged owner reached WebGPU');
      },
    }) as unknown as NonNullable<
      BetaSkirtCanonicalMediumWebgpu16FrameContactRunnerOptionsV2['gpu']
    >;
    for (const owner of [Object.freeze({}), Object.freeze({ report: {}, extra: true })]) {
      const result = await runBetaSkirtCanonicalMediumWebgpu16FrameContactV2(
        Object.freeze({}) as HTMLCanvasElement,
        owner as BetaSkirtCanonicalMediumWebgpuRuntimeSourceOwnerV1,
        { gpu },
      );
      expect(result).toEqual({
        ok: false,
        code: 'source-owner-unavailable',
        detail: 'A live canonical-medium runtime-source owner is required.',
      });
    }
  });
});
