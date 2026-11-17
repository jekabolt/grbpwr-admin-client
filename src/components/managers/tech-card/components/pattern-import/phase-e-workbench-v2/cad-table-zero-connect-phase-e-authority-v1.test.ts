import { describe, expect, it } from 'vitest';

import { buildPatternImportDxfProductPhaseEAuthoringCatalogV1 } from 'lib/cloth/domain/pattern-import-dxf-product-phase-e-authoring-catalog-v1';
import { selectPatternImportDxfProductDraftPhaseDSizeV1 } from 'lib/cloth/domain/pattern-import-dxf-product-draft-phase-d-selection-v1';
import { createPatternImportDxfProductSavedRuntimeSeedV1Fixture } from 'lib/cloth/domain/pattern-import-dxf-product-garment-mesh-composer-v2.test-fixture';

import {
  capturePatternImportDxfPhaseEZeroConnectPreparedAuthorityV1,
  isPatternImportDxfPhaseEZeroConnectPreparedAuthorityV1,
  type PatternImportDxfPhaseEZeroConnectPreparedAuthorityV1,
} from './cad-table-zero-connect-phase-e-authority-v1';
import { createPatternImportDxfPhaseECadTableZeroOperationGenerationOwnerV1 } from './cad-table-zero-operation-generation-owner-v1';

async function fixture() {
  const seed = await createPatternImportDxfProductSavedRuntimeSeedV1Fixture();
  const selection = await selectPatternImportDxfProductDraftPhaseDSizeV1(seed.draft, 'main', 'M');
  if (!selection.ok) throw new Error(selection.blockers[0].detail);
  const catalog = await buildPatternImportDxfProductPhaseEAuthoringCatalogV1(
    seed.draft,
    'main',
    'M',
  );
  if (!catalog.ok) throw new Error(catalog.blockers[0].detail);
  const row = Object.freeze({
    ...seed.row,
    sha256: selection.selection.pipeline.contentBinding!.sourceSha256,
  });
  return { seed, selection: selection.selection, catalog: catalog.catalog, row };
}

describe('zero-connect prepared authority', () => {
  it('retains a genuine opaque authority bound to the current generation', async () => {
    const current = await fixture();
    const owner = createPatternImportDxfPhaseECadTableZeroOperationGenerationOwnerV1();
    const authority = capturePatternImportDxfPhaseEZeroConnectPreparedAuthorityV1({
      row: current.row,
      draft: current.seed.draft,
      selection: current.selection,
      catalog: current.catalog,
      generation: owner.beginFresh('prepared-authority', 12),
    });

    expect(authority).toMatchObject({
      row: current.row,
      preparationGeneration: 1,
      importGeneration: 12,
    });
    expect(isPatternImportDxfPhaseEZeroConnectPreparedAuthorityV1(authority)).toBe(true);
    expect(
      isPatternImportDxfPhaseEZeroConnectPreparedAuthorityV1({
        ...(authority as PatternImportDxfPhaseEZeroConnectPreparedAuthorityV1),
      }),
    ).toBe(false);
  });

  it('rejects a stale preparation generation', async () => {
    const current = await fixture();
    const owner = createPatternImportDxfPhaseECadTableZeroOperationGenerationOwnerV1();
    const stale = owner.beginSaved('prepared-authority:first');
    owner.beginSaved('prepared-authority:second');

    expect(
      capturePatternImportDxfPhaseEZeroConnectPreparedAuthorityV1({
        row: current.row,
        draft: current.seed.draft,
        selection: current.selection,
        catalog: current.catalog,
        generation: stale,
      }),
    ).toBeNull();
  });

  it('rejects source SHA drift instead of retaining a nearest saved row', async () => {
    const current = await fixture();
    const owner = createPatternImportDxfPhaseECadTableZeroOperationGenerationOwnerV1();

    expect(
      capturePatternImportDxfPhaseEZeroConnectPreparedAuthorityV1({
        row: { ...current.row, sha256: 'f'.repeat(64) },
        draft: current.seed.draft,
        selection: current.selection,
        catalog: current.catalog,
        generation: owner.beginSaved('prepared-authority:sha-drift'),
      }),
    ).toBeNull();
  });
});
