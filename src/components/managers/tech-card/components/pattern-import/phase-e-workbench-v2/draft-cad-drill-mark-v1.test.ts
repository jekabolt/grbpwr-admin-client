import { buildPatternImportDxfProductPhaseEAuthoringCatalogV1 } from 'lib/cloth/domain/pattern-import-dxf-product-phase-e-authoring-catalog-v1';
import { selectPatternImportDxfProductDraftPhaseDSizeV1 } from 'lib/cloth/domain/pattern-import-dxf-product-draft-phase-d-selection-v1';
import { createPatternImportDxfProductSavedRuntimeSeedV1Fixture } from 'lib/cloth/domain/pattern-import-dxf-product-garment-mesh-composer-v2.test-fixture';
import { parseDxf } from 'lib/nesting/dxf/parse';
import { projectPatternImportDxfProductPhaseEAssemblyV1 } from 'lib/pattern-import/dxf-product-phase-e-assembly-workbench-v1';
import { expect, it } from 'vitest';

import { createPatternImportDxfPhaseEBoundDraftCadSessionV1 } from './draft-cad-binding-v1';
import { recordPatternImportDxfPhaseEDraftCadCanvasPointV1 } from './draft-cad-canvas-v1';
import { createPatternImportDxfPhaseEDraftCadCompileSourceV1 } from './draft-cad-compile-source-v1';
import { compilePatternImportDxfPhaseEDraftCadGeometryV1 } from './draft-cad-geometry-compile-v1';

it('writes the normal Draft canvas drill mark as one additional native drill in the selected size', async () => {
  const { draft } = await createPatternImportDxfProductSavedRuntimeSeedV1Fixture();
  const selection = await selectPatternImportDxfProductDraftPhaseDSizeV1(draft, 'main', 'M');
  const catalog = await buildPatternImportDxfProductPhaseEAuthoringCatalogV1(draft, 'main', 'M');
  if (!selection.ok || !catalog.ok) throw new Error('The saved pattern fixture is unavailable.');
  const projected = projectPatternImportDxfProductPhaseEAssemblyV1(
    catalog.catalog,
    selection.selection,
  );
  if (!projected.ok) throw new Error('The current pattern projection is unavailable.');
  const { projection } = projected;
  const bound = createPatternImportDxfPhaseEBoundDraftCadSessionV1({
    source: {
      phaseD: {
        sourceFileId: selection.selection.phaseD.source.sourceFileId,
        sourceSha256: selection.selection.phaseD.sourceSha256,
        selectedGeometrySha256: selection.selection.selection.selectedGeometrySha256,
      },
      catalog: catalog.catalog,
      revision: 1,
    },
    projection,
  });
  const compileSource = createPatternImportDxfPhaseEDraftCadCompileSourceV1(draft);
  if (!bound.ok || !compileSource) throw new Error('The Draft session is unavailable.');
  const piece = projection.pieces[0]!;
  const boundary = piece.contours[0]!.vertices;
  const pointMm = {
    x: boundary.reduce((x, v) => x + v.pointMm.x, 0) / boundary.length,
    y: boundary.reduce((y, v) => y + v.pointMm.y, 0) / boundary.length,
  };
  const edited = recordPatternImportDxfPhaseEDraftCadCanvasPointV1({
    session: bound.session,
    projection,
    activePieceIndex: 0,
    activeTool: 'mark',
    pointMm,
    pendingPoints: [],
    sequence: 0,
  });
  expect(edited.recorded).toBe(true);
  expect(edited.session.history[0]?.commands[0]).toMatchObject({
    tool: 'mark',
    payload: { kind: 'drill', pointMm },
  });
  const compiled = compilePatternImportDxfPhaseEDraftCadGeometryV1({
    session: edited.session,
    projection,
    selection: selection.selection,
    compileSource,
  });
  if (!compiled.ok) throw new Error(JSON.stringify(compiled.blockers));
  const { artifact } = compiled;
  expect(artifact.compiledFeatures).toMatchObject([
    { tool: 'mark', pieceId: piece.pieceId, sizeToken: 'M', output: 'drill' },
  ]);
  const sourceBlock = draft.scopes[0]!.manifest.blocks.find(
    (block) => block.identity === piece.pieceId && block.sizeToken === 'M',
  )!;
  const emittedBlock = artifact.manifest.blocks.find(
    (block) => block.identity === piece.pieceId && block.sizeToken === 'M',
  )!;
  expect(emittedBlock.drills).toBe(sourceBlock.drills + 1);
  const decoded = parseDxf(new TextEncoder().encode(artifact.dxfText).buffer, 'mm');
  const rawMarks = decoded.dxf.blocks[emittedBlock.block]?.entities.filter(
    (entity) => entity.type === 'POINT' && entity.layer === '13',
  );
  expect(rawMarks).toHaveLength(emittedBlock.drills);
  expect(artifact.manifest.blocks.filter((block) => block.block !== emittedBlock.block)).toEqual(
    draft.scopes[0]!.manifest.blocks.filter((block) => block.block !== sourceBlock.block),
  );
});
