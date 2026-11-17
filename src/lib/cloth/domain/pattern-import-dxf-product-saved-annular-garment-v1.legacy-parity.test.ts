import { expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

import { withLegacySavedAnnularGarmentSourceV1 as setup } from './pattern-import-dxf-product-saved-annular-garment-port.test-fixture';
import {
  buildPatternImportDxfProductSavedAnnularGarmentV1,
  disposePatternImportDxfProductSavedAnnularGarmentV1,
  projectPatternImportDxfProductSavedAnnularGarmentV1,
} from './pattern-import-dxf-product-saved-annular-garment-v1';

it('preserves original legacy garment report bytes and all six physical buffer digests', async () => {
  await setup(async ({ request }) => {
    const built = await buildPatternImportDxfProductSavedAnnularGarmentV1(request);
    expect(built.ok).toBe(true);
    if (!built.ok) throw new Error(built.detail);
    try {
      const p = await projectPatternImportDxfProductSavedAnnularGarmentV1(built.owner);
      if (!p?.normalizedMaterial) throw new Error('Missing genuine normalized material');
      const sha = (b: ArrayBufferView | ArrayBuffer) =>
        createHash('sha256')
          .update(
            b instanceof ArrayBuffer
              ? new Uint8Array(b)
              : new Uint8Array(b.buffer, b.byteOffset, b.byteLength),
          )
          .digest('hex');
      const result = {
        report: built.report,
        buffers: {
          localXYZ: sha(p.mapping.positions3M),
          topology: sha(p.mapping.normalizedTriangles),
          seamPairs: sha(p.mapping.seamPairs),
          pins: sha(p.mapping.pinnedWaistVertexIndices),
          physicalXYZW: sha(p.normalizedMaterial.initialPhysicalPositionsInvMassKg),
          restFrames: sha(
            p.normalizedMaterial.normalizedV5.simulation.constraints.continuumStrain
              .triangleRestFrames,
          ),
        },
      };
      // Repository formatting may reflow JSON arrays. Restore its original serialization, then
      // pin the historical bytes before comparing the full report and all physical buffer hashes.
      const baseline =
        JSON.stringify(
          JSON.parse(
            readFileSync(
              new URL(
                './pattern-import-dxf-product-saved-annular-garment-v1.legacy-baseline.json',
                import.meta.url,
              ),
              'utf8',
            ),
          ),
          null,
          2,
        ) + '\n';
      expect(createHash('sha256').update(baseline).digest('hex')).toBe(
        'e965a0c2fa6684be6f80d9ef8b023fe21e47030d7162d9fba5dbb8ac387f4639',
      );
      expect(JSON.stringify(result, null, 2) + '\n').toBe(baseline);
    } finally {
      disposePatternImportDxfProductSavedAnnularGarmentV1(built.owner);
    }
  });
}, 60000);
