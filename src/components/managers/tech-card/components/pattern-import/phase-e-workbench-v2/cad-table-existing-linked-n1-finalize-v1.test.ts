import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildPatternImportDxfProductPhaseEAuthoringCatalogV1 } from 'lib/cloth/domain/pattern-import-dxf-product-phase-e-authoring-catalog-v1';
import { createPatternImportDxfProductSavedRuntimeSeedV1Fixture } from 'lib/cloth/domain/pattern-import-dxf-product-garment-mesh-composer-v2.test-fixture';
import {
  createPatternImportDxfProductPhaseEAssemblyWorkbenchStateV1,
  proposePatternImportDxfProductPhaseEAssemblyV1,
} from 'lib/pattern-import/dxf-product-phase-e-assembly-workbench-v1';

import { derivePatternImportDxfPhaseEDocumentAuthorityV1 } from '../phase-e-workbench-document-authority-v1';
import { finalizePatternImportDxfPhaseEExistingLinkedN1V1 } from './cad-table-existing-linked-n1-finalize-v1';

const ports = vi.hoisted(() => ({
  readSession: vi.fn(),
  resolveSession: vi.fn(),
  prepareSource: vi.fn(),
  prepareNative: vi.fn(),
}));
vi.mock('../phase-e-workbench-card-session-v1', () => ({
  readPatternImportDxfPhaseECardSessionV1: ports.readSession,
}));
vi.mock('../phase-e-workbench/assembly-order-entry', () => ({
  buildPatternImportDxfPhaseEAssemblyOrderSourceV1: () => ({ selectedSeamKey: 'side-open' }),
  resolvePatternImportDxfPhaseEAssemblyOrderSessionV1: ports.resolveSession,
  preparePatternImportDxfPhaseEAssemblyOrderEntryV1: ports.prepareSource,
  runPatternImportDxfPhaseEAssemblyOrderSerializedPrepareV1: ports.prepareNative,
}));

async function fixture() {
  const seed = await createPatternImportDxfProductSavedRuntimeSeedV1Fixture();
  const loaded = await buildPatternImportDxfProductPhaseEAuthoringCatalogV1(
    seed.draft,
    'main',
    'M',
  );
  if (!loaded.ok) throw new Error(loaded.blockers[0].detail);
  const catalog = loaded.catalog;
  const seam = seed.assembly.seams[0]!;
  const existingAssembly = {
    operations: [
      {
        ...seed.assembly.ops[0]!,
        authoringOperationId: null,
        phaseEKind: 'stitch' as const,
        seamKeys: [seam.seamKey],
      },
    ],
    seams: [seam],
    selectedSeamKey: seam.seamKey,
  };
  const proposed = proposePatternImportDxfProductPhaseEAssemblyV1(catalog, existingAssembly);
  if (!proposed.ok) throw new Error(proposed.blockers[0].detail);
  const proposal = proposed.proposal;
  const row = seed.row;
  const readback = {
    ok: true as const,
    seamKey: seam.seamKey,
    operationNumber: 120,
    cardLockVersion: row.cardLockVersion + 1,
    blocker: null,
  };
  const evidence = {
    techCardId: row.techCardId,
    scopeKey: row.scopeKey,
    patternLineKey: row.patternLineKey,
    dxfSha256: row.sha256,
    patternVersion: 3,
    cardLockVersion: readback.cardLockVersion,
  };
  const authority = await derivePatternImportDxfPhaseEDocumentAuthorityV1(
    evidence,
    catalog.sizeSelectionCanonicalSha256,
    catalog.canonicalSha256,
  );
  if (!authority.ok) throw new Error(authority.blockers[0].detail);
  const gesture = {
    mapping: 'equal',
    lengthRatio: 1,
    sides: proposal.sides.map(({ pieceId, pieceLineKey }) => {
      const contour = catalog.pieces.find((piece) => piece.pieceId === pieceId)!.contours[0]!;
      return {
        pieceId,
        pieceLineKey,
        contourId: contour.contourId,
        boundaryVertexIds: contour.boundaryVertices.slice(0, 2).map(({ vertexId }) => vertexId),
        direction: 'forward',
      };
    }),
  };
  const pending = {
    target: {
      techCardId: row.techCardId,
      capturedCardLockVersion: row.cardLockVersion,
      operationNumber: 120,
      seamKey: seam.seamKey,
      orderedRowKeys: [seam.seamKey],
    },
    sourceSizeToken: 'M',
    request: { authoringAuthority: { row }, catalog, candidate: { connection: gesture } },
  } as unknown as Parameters<typeof finalizePatternImportDxfPhaseEExistingLinkedN1V1>[0]['pending'];
  const verifiedSha = 'a'.repeat(64);
  const submitChoices = vi.fn().mockResolvedValue({
    authorityStatus: 'accepted',
    attachmentStatus: 'verified',
    verifiedAttachment: { cardLockVersion: readback.cardLockVersion, sidecarSha256: verifiedSha },
    blockers: [],
  });
  const loadDocumentEvidence = vi.fn().mockResolvedValue({ ok: true, evidence });
  const freshSession = {
    sizeToken: 'M',
    scopeKey: row.scopeKey,
    loadDocumentEvidence,
    submitChoices,
  };
  ports.readSession.mockReturnValue({ importGeneration: 44 });
  ports.resolveSession.mockReturnValue({ ok: true, freshSession });
  ports.prepareSource.mockReturnValue({
    ok: true,
    request: { scopeKey: row.scopeKey, sizeToken: 'M', importGeneration: 44, existingAssembly },
  });
  ports.prepareNative.mockResolvedValue({
    ok: true,
    catalog,
    proposal,
    initialState: createPatternImportDxfProductPhaseEAssemblyWorkbenchStateV1(
      catalog,
      proposal,
      authority.authority,
      44,
    ),
  });
  const persist = vi.fn().mockResolvedValue({ ok: true });
  const context = {
    pending,
    profile: { id: 'browser-medium-isotropic-diagnostic', revision: '1' },
    direction: 'reversed',
    readback,
    freshCard: {
      id: row.techCardId,
      lockVersion: readback.cardLockVersion,
      techCard: { operations: [{ operationNumber: 120 }] },
    } as Parameters<typeof finalizePatternImportDxfPhaseEExistingLinkedN1V1>[0]['freshCard'],
    signal: new AbortController().signal,
    isCurrent: () => true,
    persist,
  } as const;
  return {
    context,
    row,
    evidence,
    verifiedSha,
    gesture,
    catalog,
    submitChoices,
    loadDocumentEvidence,
    persist,
  };
}

describe('linked N1 post-save continuation', () => {
  beforeEach(() => vi.clearAllMocks());

  it('reprepares at the seam-write lock and carries the same directed native span through verified V1 to V4', async () => {
    const test = await fixture();
    await expect(finalizePatternImportDxfPhaseEExistingLinkedN1V1(test.context)).resolves.toEqual({
      ok: true,
    });
    expect(ports.prepareNative).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        sourceSurface: 'explicit-native-drawn-sewing',
        documentEvidence: test.evidence,
      }),
    );
    const a = test.gesture.sides[0]!;
    const b = test.gesture.sides[1]!;
    expect(test.submitChoices).toHaveBeenCalledWith(
      test.catalog,
      expect.objectContaining({
        seam: expect.objectContaining({
          sides: [
            expect.objectContaining({ anchors: a.boundaryVertexIds, direction: 'forward' }),
            expect.objectContaining({
              anchors: b.boundaryVertexIds,
              direction: 'reverse',
            }),
          ],
        }),
        materials: [
          expect.objectContaining({
            id: 'browser-medium-isotropic-diagnostic-material',
            materialRevision: '1',
          }),
        ],
      }),
      expect.objectContaining({ savedRowRevision: test.row.revision }),
    );
    expect(test.persist).toHaveBeenCalledWith(
      expect.objectContaining({
        row: { ...test.row, cardLockVersion: test.evidence.cardLockVersion },
        verifiedSemanticSha256: test.verifiedSha,
        sides: [
          expect.objectContaining({ boundaryVertexIds: a.boundaryVertexIds }),
          expect.objectContaining({
            boundaryVertexIds: b.boundaryVertexIds,
            direction: 'reverse',
          }),
        ],
      }),
      test.context.signal,
    );
  });

  it.each([
    { cardLockVersion: 11 },
    { dxfSha256: '0'.repeat(64) },
    { scopeKey: 'fabric:other' },
    { patternLineKey: 'pattern:other' },
  ])('refuses moved document evidence %j before prepare or write', async (change) => {
    const test = await fixture();
    test.loadDocumentEvidence.mockResolvedValue({
      ok: true,
      evidence: { ...test.evidence, ...change },
    });
    await expect(
      finalizePatternImportDxfPhaseEExistingLinkedN1V1(test.context),
    ).resolves.toMatchObject({
      ok: false,
      blocker: { code: 'existing-linked-n1-finalize-source-moved' },
    });
    expect(ports.prepareNative).not.toHaveBeenCalled();
    expect(test.submitChoices).not.toHaveBeenCalled();
    expect(test.persist).not.toHaveBeenCalled();
  });

  it('never promotes Semantic V1 verified at another lock to Composite V4', async () => {
    const test = await fixture();
    test.submitChoices.mockResolvedValue({
      authorityStatus: 'accepted',
      attachmentStatus: 'verified',
      verifiedAttachment: {
        cardLockVersion: test.evidence.cardLockVersion + 1,
        sidecarSha256: test.verifiedSha,
      },
      blockers: [],
    });
    await expect(
      finalizePatternImportDxfPhaseEExistingLinkedN1V1(test.context),
    ).resolves.toMatchObject({
      ok: false,
      blocker: { code: 'existing-linked-n1-semantic-unverified' },
    });
    expect(test.persist).not.toHaveBeenCalled();
  });

  it('retries only the durable write once exact Semantic V1 has been verified', async () => {
    const test = await fixture();
    test.persist.mockResolvedValueOnce({ ok: false, blocker: { code: 'retry', detail: 'retry' } });
    await expect(
      finalizePatternImportDxfPhaseEExistingLinkedN1V1(test.context),
    ).resolves.toMatchObject({
      ok: false,
      blocker: { code: 'retry' },
    });
    await expect(finalizePatternImportDxfPhaseEExistingLinkedN1V1(test.context)).resolves.toEqual({
      ok: true,
    });
    expect(test.submitChoices).toHaveBeenCalledTimes(1);
    expect(test.persist).toHaveBeenCalledTimes(2);
    expect(test.persist.mock.calls[1]![0]).toBe(test.persist.mock.calls[0]![0]);
  });
});
