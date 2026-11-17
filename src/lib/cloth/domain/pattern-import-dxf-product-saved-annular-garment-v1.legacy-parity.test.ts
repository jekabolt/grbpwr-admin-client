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
      expect(JSON.stringify(result, null, 2) + '\n').toBe(
        readFileSync(
          new URL(
            './pattern-import-dxf-product-saved-annular-garment-v1.legacy-baseline.json',
            import.meta.url,
          ),
          'utf8',
        ),
      );
    } finally {
      disposePatternImportDxfProductSavedAnnularGarmentV1(built.owner);
    }
  });
}, 60000);
