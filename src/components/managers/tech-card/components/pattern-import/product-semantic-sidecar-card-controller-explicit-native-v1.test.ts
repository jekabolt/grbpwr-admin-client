import { describe, expect, it, vi } from 'vitest';

import { buildPatternImportDxfProductPhaseEAuthoringCatalogV1 } from 'lib/cloth/domain/pattern-import-dxf-product-phase-e-authoring-catalog-v1';
import { createPatternImportDxfProductSavedRuntimeSeedV1Fixture } from 'lib/cloth/domain/pattern-import-dxf-product-garment-mesh-composer-v2.test-fixture';
import { PATTERN_IMPORT_DXF_PRODUCT_SIDECAR_CARD_RUNTIME_V1 } from 'lib/cloth/domain/pattern-import-dxf-product-semantic-sidecar-card-runtime-v1';
import { selectPatternImportDxfProductDraftPhaseDSizeV1 } from 'lib/cloth/domain/pattern-import-dxf-product-draft-phase-d-selection-v1';
import { DXF_NATIVE_SEWING_REPLAY_V1 } from 'lib/pattern-import/dxf-native-sewing-replay-v1';
import {
  createPatternImportDxfProductPhaseEAssemblyWorkbenchStateV1,
  projectPatternImportDxfProductPhaseEAssemblyV1,
  proposePatternImportDxfProductPhaseEAssemblyV1,
} from 'lib/pattern-import/dxf-product-phase-e-assembly-workbench-v1';
import type { CardDraft } from 'lib/pattern-import/types';

import {
  PATTERN_IMPORT_DXF_PRODUCT_SIDECAR_CARD_CONTROLLER_V1,
  createPatternImportDxfProductSidecarCardControllerV1,
} from './product-semantic-sidecar-card-controller-v1';

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
  const sourceSha256 = seed.draft.dxfProvenance!.contentBinding!.sourceSha256;
  const nativePipeline = {
    ...structuredClone(seed.draft.dxfProvenance!),
    explicitNativeTestMarker: true,
  };
  const replay = seed.draft.dxfPhaseDReplay;
  if (!replay?.replayReady) throw new Error('The test seed has no ready Phase-D replay.');
  const draft: CardDraft = {
    ...seed.draft,
    dxfNativeSewingReplay: {
      schemaVersion: DXF_NATIVE_SEWING_REPLAY_V1,
      replayReady: true,
      pipeline: nativePipeline,
      replay: structuredClone(replay),
      blockers: [],
      claims: {
        sourceSurface: 'explicit-native-drawn-sewing',
        successfulReplayExtraOriginalByteDecodePasses: 1,
        nativeAuthorityMinted: false,
        writerExportShaBound: false,
        sourceGeometryInferred: false,
        offsetGeometryAccepted: false,
        storedSeamAuthorityUsed: false,
        productionReady: false,
      },
    },
  };
  const seam = seed.assembly.seams[0]!;
  const operation = { ...seed.assembly.ops[0]!, seamKeys: [seam.seamKey] };
  const existingAssembly = {
    operations: [
      {
        authoringOperationId: null,
        number: operation.number,
        work: operation.work,
        phaseEKind: 'stitch' as const,
        inputKeys: operation.inputKeys,
        outputUnitKey: operation.outputUnitKey,
        outputUnitName: operation.outputUnitName,
        seamKeys: operation.seamKeys,
      },
    ],
    seams: [
      {
        seamKey: seam.seamKey,
        confirmed: seam.confirmed,
        stale: seam.stale,
        kind: seam.kind,
        direction: seam.direction,
        anchoredSize: seam.anchoredSize,
        sideA: seam.sideA,
        sideB: seam.sideB,
      },
    ],
    selectedSeamKey: seam.seamKey,
  };
  return {
    seed,
    draft,
    selection: selection.selection,
    catalog: catalog.catalog,
    existingAssembly,
    sourceSha256,
  };
}

describe('product semantic controller explicit native sewing source', () => {
  it('uses one verified native view for selection, catalog and authoring', async () => {
    const current = await fixture();
    const seenDrafts: unknown[] = [];
    const author = vi.fn(async (draft: unknown) => {
      seenDrafts.push(draft);
      return { ok: true as const } as never;
    });
    const runtime = {
      selectAuthoringPhaseD: vi.fn(async (draft: unknown) => {
        seenDrafts.push(draft);
        return { ok: true as const, selection: current.selection };
      }),
      buildAuthoringCatalog: vi.fn(async (draft: unknown) => {
        seenDrafts.push(draft);
        return { ok: true as const, catalog: current.catalog };
      }),
      produceCompileAndAuthorPhaseE: author,
      afterConfirmedSave: vi.fn(),
      retryAttachment: vi.fn(),
      readAttachment: vi.fn(),
      dispose: vi.fn(),
    };
    const controller = createPatternImportDxfProductSidecarCardControllerV1({
      schemaVersion: PATTERN_IMPORT_DXF_PRODUCT_SIDECAR_CARD_CONTROLLER_V1,
      techCardId: current.draft.techCardId,
      service: {} as never,
      loadRuntime: async () => ({
        PATTERN_IMPORT_DXF_PRODUCT_SIDECAR_CARD_RUNTIME_V1,
        createPatternImportDxfProductSidecarCardRuntimeV1: () => runtime as never,
      }),
      loadWorkbench: async () => ({
        proposePatternImportDxfProductPhaseEAssemblyV1,
        projectPatternImportDxfProductPhaseEAssemblyV1,
        createPatternImportDxfProductPhaseEAssemblyWorkbenchStateV1,
      }),
    });
    const entry = await controller.preparePhaseEWorkbench(current.draft, {
      sourceSurface: 'explicit-native-drawn-sewing',
      scopeKey: 'main',
      sizeToken: 'M',
      importGeneration: 9,
      documentEvidence: {
        techCardId: current.draft.techCardId,
        scopeKey: 'main',
        patternLineKey: 'pattern:main',
        dxfSha256: current.sourceSha256,
        patternVersion: 7,
        cardLockVersion: 12,
      },
      selectedOperationNumber: current.existingAssembly.operations[0]!.number,
      existingAssembly: current.existingAssembly,
    });
    expect(entry.ok).toBe(true);
    if (!entry.ok) throw new Error(entry.blockers[0].detail);
    expect(seenDrafts).toHaveLength(2);
    expect(
      seenDrafts.every(
        (draft) =>
          (draft as { dxfProvenance?: { explicitNativeTestMarker?: boolean } }).dxfProvenance
            ?.explicitNativeTestMarker === true,
      ),
    ).toBe(true);
    const contours = entry.catalog.pieces.map((piece) => piece.contours[0]!);
    const choices = {
      schemaVersion: 'pattern-import-dxf-product-phase-e-authoring-choices/1' as const,
      expectedCatalogCanonicalSha256: entry.catalog.canonicalSha256,
      expectedProposalFingerprint: entry.proposal.deterministicFingerprint,
      importGeneration: 9,
      documentId: entry.initialState.documentId,
      revision: entry.initialState.revision,
      physicalSurface: { mode: 'sewing-surface' as const, seamAllowancePhysical: false as const },
      seam: {
        id: entry.proposal.seam.id,
        operationId: entry.proposal.operation.authoringOperationId!,
        mapping: 'equal' as const,
        lengthRatio: 1 as const,
        sides: [
          {
            pieceId: entry.proposal.sides[0].pieceId,
            contourId: contours[0].contourId,
            anchors: [
              contours[0].boundaryVertices[0]!.vertexId,
              contours[0].boundaryVertices[1]!.vertexId,
            ] as const,
            direction: 'forward' as const,
          },
          {
            pieceId: entry.proposal.sides[1].pieceId,
            contourId: contours[1].contourId,
            anchors: [
              contours[1].boundaryVertices[0]!.vertexId,
              contours[1].boundaryVertices[1]!.vertexId,
            ] as const,
            direction: 'reverse' as const,
          },
        ] as const,
      },
      operations: [
        {
          id: entry.proposal.operation.authoringOperationId!,
          stage: 0,
          order: entry.proposal.operation.order,
          kind: 'stitch' as const,
          seamIds: [entry.proposal.seam.id],
        },
      ],
      materials: [
        {
          id: 'visual-medium-woven',
          materialRevision: '1',
          pieceIds: entry.proposal.sides.map(({ pieceId }) => pieceId),
        },
      ],
      tolerance: { endpointMm: 0.001, fullLengthMm: 0.001, fullLengthRelative: 0.000001 },
    };
    await expect(controller.authorChoices(current.draft, entry.catalog, choices)).resolves.toEqual({
      ok: true,
    });
    expect(author).toHaveBeenCalledOnce();
    expect(
      (author.mock.calls[0]![0] as { dxfProvenance?: { explicitNativeTestMarker?: boolean } })
        .dxfProvenance?.explicitNativeTestMarker,
    ).toBe(true);
  });

  it('rejects a native replay that is not bound to the current saved row', async () => {
    const current = await fixture();
    const runtime = {
      selectAuthoringPhaseD: vi.fn(async () => ({
        ok: true as const,
        selection: current.selection,
      })),
      buildAuthoringCatalog: vi.fn(async () => ({ ok: true as const, catalog: current.catalog })),
      produceCompileAndAuthorPhaseE: vi.fn(),
      afterConfirmedSave: vi.fn(),
      retryAttachment: vi.fn(),
      readAttachment: vi.fn(),
      dispose: vi.fn(),
    };
    const controller = createPatternImportDxfProductSidecarCardControllerV1({
      schemaVersion: PATTERN_IMPORT_DXF_PRODUCT_SIDECAR_CARD_CONTROLLER_V1,
      techCardId: current.draft.techCardId,
      service: {} as never,
      loadRuntime: async () => ({
        PATTERN_IMPORT_DXF_PRODUCT_SIDECAR_CARD_RUNTIME_V1,
        createPatternImportDxfProductSidecarCardRuntimeV1: () => runtime as never,
      }),
    });
    const result = await controller.preparePhaseEWorkbench(current.draft, {
      sourceSurface: 'explicit-native-drawn-sewing',
      scopeKey: 'main',
      sizeToken: 'M',
      importGeneration: 9,
      documentEvidence: {
        techCardId: current.draft.techCardId,
        scopeKey: 'main',
        patternLineKey: 'pattern:main',
        dxfSha256: 'f'.repeat(64),
        patternVersion: 7,
        cardLockVersion: 12,
      },
      selectedOperationNumber: current.existingAssembly.operations[0]!.number,
      existingAssembly: current.existingAssembly,
    });
    expect(result).toMatchObject({
      ok: false,
      stage: 'catalog',
      blockers: [{ code: 'explicit-native-sewing-source-row-mismatch' }],
    });
  });
});
