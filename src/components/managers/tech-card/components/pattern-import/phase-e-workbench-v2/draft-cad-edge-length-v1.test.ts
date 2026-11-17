import { buildPatternImportDxfProductPhaseEAuthoringCatalogV1 } from 'lib/cloth/domain/pattern-import-dxf-product-phase-e-authoring-catalog-v1';
import { selectPatternImportDxfProductDraftPhaseDSizeV1 } from 'lib/cloth/domain/pattern-import-dxf-product-draft-phase-d-selection-v1';
import { createPatternImportDxfProductSavedRuntimeSeedV1Fixture } from 'lib/cloth/domain/pattern-import-dxf-product-garment-mesh-composer-v2.test-fixture';
import { parseDxf } from 'lib/nesting/dxf/parse';
import { entityToChain } from 'lib/nesting/dxf/entities';
import { projectPatternImportDxfProductPhaseEAssemblyV1 } from 'lib/pattern-import/dxf-product-phase-e-assembly-workbench-v1';
import { expect, it } from 'vitest';

import { createPatternImportDxfPhaseEBoundDraftCadSessionV1 } from './draft-cad-binding-v1';
import {
  buildPatternImportDxfPhaseEDraftCadCanvasDartBasesV1,
  recordPatternImportDxfPhaseEDraftCadCanvasBoundaryPickV1,
} from './draft-cad-canvas-v1';
import { createPatternImportDxfPhaseEDraftCadCompileSourceV1 } from './draft-cad-compile-source-v1';
import { compilePatternImportDxfPhaseEDraftCadGeometryV1 } from './draft-cad-geometry-compile-v1';
import {
  redoPatternImportDxfPhaseEDraftCadSessionV1,
  undoPatternImportDxfPhaseEDraftCadSessionV1,
} from './draft-cad-session-v1';

async function setup() {
  const { draft } = await createPatternImportDxfProductSavedRuntimeSeedV1Fixture();
  const selected = await selectPatternImportDxfProductDraftPhaseDSizeV1(draft, 'main', 'M');
  const catalog = await buildPatternImportDxfProductPhaseEAuthoringCatalogV1(draft, 'main', 'M');
  if (!selected.ok || !catalog.ok) throw new Error('The saved pattern fixture is unavailable.');
  const { selection } = selected;
  const projected = projectPatternImportDxfProductPhaseEAssemblyV1(catalog.catalog, selection);
  if (!projected.ok) throw new Error('The pattern projection is unavailable.');
  const { projection } = projected;
  const bound = createPatternImportDxfPhaseEBoundDraftCadSessionV1({
    source: {
      phaseD: {
        sourceFileId: selection.phaseD.source.sourceFileId,
        sourceSha256: selection.phaseD.sourceSha256,
        selectedGeometrySha256: selection.selection.selectedGeometrySha256,
      },
      catalog: catalog.catalog,
      revision: 1,
    },
    projection,
  });
  const compileSource = createPatternImportDxfPhaseEDraftCadCompileSourceV1(draft);
  if (!bound.ok || !compileSource) throw new Error('The Draft session is unavailable.');
  const [edge] = buildPatternImportDxfPhaseEDraftCadCanvasDartBasesV1(bound.session, projection, 0);
  if (!edge) throw new Error('The fixture has no exact editable edge.');
  return { session: bound.session, projection, selection, compileSource, draft, edge };
}

it.each(['start', 'end'] as const)(
  'sets the exact native edge length with its %s endpoint fixed and retains the other pieces',
  async (fixed) => {
    const { session, projection, selection, compileSource, draft, edge } = await setup();
    const [first] = projection.pieces;
    const dx = edge.toMm.x - edge.fromMm.x;
    const dy = edge.toMm.y - edge.fromMm.y;
    const lengthMm = Math.hypot(dx, dy) * 0.8;
    const edit = recordPatternImportDxfPhaseEDraftCadCanvasBoundaryPickV1({
      session,
      projection,
      activeTool: 'edge-length',
      activePieceIndex: 0,
      baseKey: edge.key,
      sequence: 0,
      resize: { fixed, lengthMm },
    });
    expect(edit.recorded).toBe(true);
    expect(edit.session.history[0]?.commands[0]).toMatchObject({
      tool: 'edge-length',
      payload: { sizeToken: 'M', lengthMm, fixed },
    });
    const previous = undoPatternImportDxfPhaseEDraftCadSessionV1(edit.session);
    if (!previous.ok) throw new Error(previous.blocker.detail);
    expect(previous.session.cursor).toBe(0);
    const next = redoPatternImportDxfPhaseEDraftCadSessionV1(previous.session);
    if (!next.ok) throw new Error(next.blocker.detail);
    const compiled = compilePatternImportDxfPhaseEDraftCadGeometryV1({
      session: next.session,
      projection,
      selection,
      compileSource,
    });
    if (!compiled.ok) throw new Error(JSON.stringify(compiled.blockers));
    const { artifact } = compiled;
    const original = draft.scopes[0]!.writerReplay!.job.pieces;
    const output = artifact.compiledJob.pieces;
    const source = original.find(({ identity }) => identity === first?.pieceId)!;
    const resized = output.find(({ identity }) => identity === first?.pieceId)!;
    const sourceSize = source.sizes.find(({ sizeToken }) => sizeToken === 'M')!;
    const editedSize = resized.sizes.find(({ sizeToken }) => sizeToken === 'M')!;
    const stablePoint = fixed === 'start' ? edge.fromMm : edge.toMm;
    const movedPoint = fixed === 'start' ? edge.toMm : edge.fromMm;
    const replacedIndex = sourceSize.cut.findIndex(
      ({ x, y }) => x === movedPoint.x && y === movedPoint.y,
    );
    expect(replacedIndex).toBeGreaterThanOrEqual(0);
    expect(editedSize.cut.map((point, index) => index !== replacedIndex && point)).toEqual(
      sourceSize.cut.map((point, index) => index !== replacedIndex && point),
    );
    const after = editedSize.cut[replacedIndex]!;
    expect(Math.hypot(after.x - stablePoint.x, after.y - stablePoint.y)).toBeCloseTo(lengthMm);
    expect(output.filter(({ identity }) => identity !== first?.pieceId)).toEqual(
      original.filter(({ identity }) => identity !== first?.pieceId),
    );
    const written = artifact.manifest.blocks.find(
      ({ identity, sizeToken }) => identity === first?.pieceId && sizeToken === 'M',
    )!;
    const decoded = parseDxf(new TextEncoder().encode(artifact.dxfText).buffer, 'mm');
    const cuts = decoded.dxf.blocks[written.block]!.entities.filter(
      ({ layer, type }) => layer === '1' && (type === 'POLYLINE' || type === 'LWPOLYLINE'),
    ).map((entity) => entityToChain(entity, 1, 0.001));
    expect(cuts).toHaveLength(1);
    const points = cuts[0]!.pts;
    expect(
      points.some(({ x, y }, i) => {
        const b = points[(i + 1) % points.length]!;
        return Math.abs(Math.hypot(x - b.x, y - b.y) - lengthMm) < 0.001;
      }),
    ).toBe(true);
  },
);

it('refuses a missing exact edge or a collapsed length before recording anything', async () => {
  const { session, projection, edge } = await setup();
  const input = {
    session,
    projection,
    activeTool: 'edge-length',
    activePieceIndex: 0,
    sequence: 0,
  } as const;
  for (const [baseKey, lengthMm] of [
    ['removed', 100],
    [edge.key, 0],
  ] as const) {
    const result = recordPatternImportDxfPhaseEDraftCadCanvasBoundaryPickV1({
      ...input,
      baseKey,
      resize: { fixed: 'end', lengthMm },
    });
    expect(result.recorded).toBe(false);
    expect(result.session).toBe(session);
  }
});
