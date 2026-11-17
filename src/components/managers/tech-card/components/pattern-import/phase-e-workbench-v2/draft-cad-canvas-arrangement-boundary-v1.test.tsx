import type { ComponentProps } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it, vi } from 'vitest';
import { buildPatternImportDxfProductPhaseEAuthoringCatalogV1 } from 'lib/cloth/domain/pattern-import-dxf-product-phase-e-authoring-catalog-v1';
import { selectPatternImportDxfProductDraftPhaseDSizeV1 } from 'lib/cloth/domain/pattern-import-dxf-product-draft-phase-d-selection-v1';
import { createPatternImportDxfProductSavedRuntimeSeedV1Fixture } from 'lib/cloth/domain/pattern-import-dxf-product-garment-mesh-composer-v2.test-fixture';
import { projectPatternImportDxfProductPhaseEAssemblyV1 } from 'lib/pattern-import/dxf-product-phase-e-assembly-workbench-v1';
import type { SheetViewport } from '../sheet-viewport';
import { createPatternImportDxfPhaseEDraftCadArrangementScopeV1 } from './draft-cad-arrangement-v1';
import { createPatternImportDxfPhaseEBoundDraftCadSessionV1 } from './draft-cad-binding-v1';
import { PatternImportDxfPhaseEDraftCadCanvasV1 } from './draft-cad-canvas-v1';
import { createPatternImportDxfPhaseEDraftCadTopologySessionV1 } from './draft-cad-topology-session-v1';

let sheet: ComponentProps<typeof SheetViewport>;
vi.mock('../sheet-viewport', async (importOriginal) => {
  const real = await importOriginal<typeof import('../sheet-viewport')>();
  return {
    ...real,
    SheetViewport: (props: typeof sheet) => {
      sheet = props;
      return <real.SheetViewport {...props} />;
    },
  };
});

it('keeps Arrange rotation, flip and translation out of exact geometry picks and edits', async () => {
  const seed = await createPatternImportDxfProductSavedRuntimeSeedV1Fixture();
  const selected = await selectPatternImportDxfProductDraftPhaseDSizeV1(seed.draft, 'main', 'M');
  const catalog = await buildPatternImportDxfProductPhaseEAuthoringCatalogV1(
    seed.draft,
    'main',
    'M',
  );
  if (!selected.ok || !catalog.ok) throw new Error('Expected exact fixture geometry');
  const projected = projectPatternImportDxfProductPhaseEAssemblyV1(
    catalog.catalog,
    selected.selection,
  );
  if (!projected.ok) throw new Error('Expected the exact projection');
  const bound = createPatternImportDxfPhaseEBoundDraftCadSessionV1({
    source: {
      phaseD: {
        sourceFileId: selected.selection.phaseD.source.sourceFileId,
        sourceSha256: selected.selection.phaseD.sourceSha256,
        selectedGeometrySha256: selected.selection.selection.selectedGeometrySha256,
      },
      catalog: catalog.catalog,
      revision: 1,
    },
    projection: projected.projection,
  });
  if (!bound.ok) throw new Error(bound.blocker.detail);
  const pieceId = bound.session.source.catalog.pieces[0]!.pieceId;
  const geometryBefore = structuredClone(projected.projection);
  const onSessionChange =
    vi.fn<ComponentProps<typeof PatternImportDxfPhaseEDraftCadCanvasV1>['onSessionChange']>();
  const props: ComponentProps<typeof PatternImportDxfPhaseEDraftCadCanvasV1> = {
    session: bound.session,
    projection: projected.projection,
    activeTool: 'notch',
    activePieceIndex: 0,
    activeTopologyTool: null,
    topologySession: createPatternImportDxfPhaseEDraftCadTopologySessionV1(
      catalog.catalog.canonicalSha256,
    ),
    arrangement: {
      ...createPatternImportDxfPhaseEDraftCadArrangementScopeV1('main'),
      selectedPieceIds: [pieceId],
      transforms: { [pieceId]: { x: 31, y: -17, quarterTurns: 1, flipX: true } },
    },
    onSessionChange,
    onTopologyAnchor: vi.fn(),
  };
  const editing = renderToStaticMarkup(<PatternImportDxfPhaseEDraftCadCanvasV1 {...props} />);
  const untouched = renderToStaticMarkup(
    <PatternImportDxfPhaseEDraftCadCanvasV1 {...props} arrangement={null} />,
  );
  expect(editing).toEqual(untouched);
  const exactKey = editing.match(/data-draft-cad-exact-edge="([^"]+)"/)?.[1];
  expect(exactKey).toBeTruthy();
  const arranged = renderToStaticMarkup(
    <PatternImportDxfPhaseEDraftCadCanvasV1 {...props} arrangeActive />,
  );
  expect(arranged).toContain('translate(31 17) rotate(-90 ');
  expect(arranged).not.toContain('data-draft-cad-exact-edge-options');
  sheet.onPick?.(exactKey!, { shiftKey: false });
  expect(props.onSessionChange).not.toHaveBeenCalled();
  renderToStaticMarkup(<PatternImportDxfPhaseEDraftCadCanvasV1 {...props} />);
  sheet.onPick?.(exactKey!, { shiftKey: false });
  expect(onSessionChange).toHaveBeenCalledOnce();
  const afterArrange = onSessionChange.mock.calls[0]![0];
  renderToStaticMarkup(<PatternImportDxfPhaseEDraftCadCanvasV1 {...props} arrangement={null} />);
  sheet.onPick?.(exactKey!, { shiftKey: false });
  expect(onSessionChange.mock.calls[1]![0].history).toEqual(afterArrange.history);
  expect(afterArrange.source).toEqual(bound.session.source);
  expect(projected.projection).toEqual(geometryBefore);
});
