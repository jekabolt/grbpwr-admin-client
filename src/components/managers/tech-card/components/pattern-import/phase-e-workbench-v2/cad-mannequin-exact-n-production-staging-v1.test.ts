import { expect, it } from 'vitest';
import { selectPatternImportDxfProductDraftPhaseDSizeV1 } from 'lib/cloth/domain/pattern-import-dxf-product-draft-phase-d-selection-v1';
import { buildPatternImportDxfProductPhaseEAuthoringCatalogV1 } from 'lib/cloth/domain/pattern-import-dxf-product-phase-e-authoring-catalog-v1';
import { createPatternImportDxfProductSavedRuntimeSeedV1Fixture } from 'lib/cloth/domain/pattern-import-dxf-product-garment-mesh-composer-v2.test-fixture';
import { projectPatternImportDxfProductPhaseEAssemblyV1 } from 'lib/pattern-import/dxf-product-phase-e-assembly-workbench-v1';

import { bindPatternImportDxfPhaseECadMannequinAnnotationSourceV1 } from './cad-mannequin-exact-n-production-staging-v1';

it('binds an arrangement source from exact saved Phase-D geometry without a fresh card session', async () => {
  const { draft, row } = await createPatternImportDxfProductSavedRuntimeSeedV1Fixture();
  const selection = await selectPatternImportDxfProductDraftPhaseDSizeV1(draft, 'main', 'M');
  const built = await buildPatternImportDxfProductPhaseEAuthoringCatalogV1(draft, 'main', 'M');
  if (!selection.ok || !built.ok) throw new Error('The fixture must prepare saved Phase D.');
  const { catalog } = built;
  const projected = projectPatternImportDxfProductPhaseEAssemblyV1(catalog, selection.selection);
  if (!projected.ok) throw new Error(projected.blockers[0].detail);

  const source = bindPatternImportDxfPhaseECadMannequinAnnotationSourceV1(
    selection.selection,
    catalog,
    projected.projection,
    row.revision,
  );
  expect(source).toEqual({
    identity: expect.stringContaining(catalog.canonicalSha256),
    revision: String(row.revision),
    sha256: selection.selection.pipeline.contentBinding?.sourceSha256,
  });
  expect(
    bindPatternImportDxfPhaseECadMannequinAnnotationSourceV1(
      selection.selection,
      catalog,
      { ...projected.projection, expectedCatalogCanonicalSha256: '0'.repeat(64) },
      row.revision,
    ),
  ).toBeNull();
});
