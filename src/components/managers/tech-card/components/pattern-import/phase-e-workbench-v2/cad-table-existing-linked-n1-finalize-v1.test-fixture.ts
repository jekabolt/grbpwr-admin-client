import type {
  AdminService,
  common_TechCard,
  TechCardPatternSemanticSidecar,
} from 'api/proto-http/admin';
import { buildPatternImportDxfProductPhaseEAuthoringCatalogV1 } from 'lib/cloth/domain/pattern-import-dxf-product-phase-e-authoring-catalog-v1';
import {
  matchesPatternImportDxfProductCommitReplaySourceV1,
  replayCommittedPatternImportDxfProductScopeV1,
} from 'lib/cloth/domain/pattern-import-dxf-product-commit-replay-v1';
import { PATTERN_IMPORT_DXF_PRODUCT_SEMANTIC_SIDECAR_MEDIA_TYPE_V1 } from 'lib/cloth/domain/pattern-import-dxf-product-semantic-sidecar-v1';
import { toWire, type EdgeAnchor } from 'lib/seams';
import { expect, vi } from 'vitest';

import { createPatternImportNativeSewingAuthoringViewV1 } from '../native-sewing-authoring-view-v1';
import type { PatternImportDxfPhaseECardSessionV1 } from '../phase-e-workbench-card-session-v1';
import { finalizePatternImportDxfPhaseEExistingLinkedN1V1 } from './cad-table-existing-linked-n1-finalize-v1';

type SidecarService = Pick<
  AdminService,
  'GetTechCardPatternSemanticSidecar' | 'PutTechCardPatternSemanticSidecar'
>;

/** Genuine V1 runtime and writer replay after Apply; only the server storage and V4 handoff are test doubles. */
export async function verifyLinkedN1FromGenuineImportFixture(
  card: common_TechCard,
  session: PatternImportDxfPhaseECardSessionV1,
  service: SidecarService,
): Promise<void> {
  const saved = card.techCard!.patterns![0]!;
  const row = {
    techCardId: card.id!,
    scopeKey: 'main',
    patternLineKey: saved.lineKey!,
    revision: saved.savedRowRevision!,
    cardLockVersion: card.lockVersion!,
    url: saved.url!,
    sizeBytes: saved.sizeBytes!,
    sha256: saved.sha256!,
  };
  const mutableDraft = structuredClone(session.draft);
  const mutableApply = structuredClone(session.confirmedApply);
  const originalManifest = session.draft.scopes[0]!.manifest;
  const pendingReplay = replayCommittedPatternImportDxfProductScopeV1(
    mutableDraft,
    mutableApply,
    row.scopeKey,
  );
  Object.assign(mutableDraft.scopes[0]!.manifest.source.files[0]!, { sha256: '0'.repeat(64) });
  Object.assign(mutableApply.commitReceipt.scopes[0]!, { patternLineKey: 'moved' });
  const replay = await pendingReplay;
  if (!replay.ok) throw new Error(replay.blockers[0].detail);
  expect(replay.evidence.patternLineKey).toBe(row.patternLineKey);
  expect(
    matchesPatternImportDxfProductCommitReplaySourceV1(
      replay,
      originalManifest,
      row.sha256,
      row.sha256,
    ),
  ).toBe(true);
  expect(
    matchesPatternImportDxfProductCommitReplaySourceV1(
      replay,
      mutableDraft.scopes[0]!.manifest,
      row.sha256,
      row.sha256,
    ),
  ).toBe(false);
  expect(
    matchesPatternImportDxfProductCommitReplaySourceV1(
      structuredClone(replay),
      originalManifest,
      row.sha256,
      row.sha256,
    ),
  ).toBe(false);
  const native = createPatternImportNativeSewingAuthoringViewV1(
    session.draft,
    session.draft.dxfNativeSewingReplay,
    row.sha256,
  );
  const result = await buildPatternImportDxfProductPhaseEAuthoringCatalogV1(native, 'main', 'M');
  if (!result.ok) throw new Error(result.blockers[0].detail);
  const catalog = result.catalog;
  expect(catalog.pieces).toHaveLength(2);
  const sides = catalog.pieces.map(({ pieceId, pieceLineKey, contours }) => {
    const contour = contours.find(({ role }) => role === 'sewing-boundary');
    if (!contour) throw new Error('Sewing boundary was not reconstructed from saved DXF.');
    return {
      pieceId,
      pieceLineKey,
      contourId: contour.contourId,
      boundaryVertexIds: contour.boundaryVertices.slice(0, 2).map(({ vertexId }) => vertexId),
      direction: 'forward',
    };
  });
  const [a, b] = sides;
  const seamKey = '01M6ERWDX90SM4KQB2QZGAFYAX';
  const operationNumber = 150;
  const anchor = (piece: string): EdgeAnchor => ({
    piece,
    edgeHint: `${piece}#1`,
    contourSig: '0123456789abcdef',
    perimShare: 0.25,
    lenMm: 80,
    notches: 0,
    turnDeg: 0,
    range: [0, 1],
    samples: [
      [0, 0],
      [0, 0.25],
      [0, 0.5],
      [0, 0.75],
      [0, 1],
    ],
  });
  Object.assign(card.techCard!, {
    operations: [
      {
        operationNumber,
        work: 'join_lockstitch',
        inputKeys: [a!.pieceLineKey, b!.pieceLineKey],
        seamKeys: [seamKey],
      },
    ],
  });
  card.seams = [
    toWire({
      seamKey,
      status: 'confirmed',
      kind: 'edge',
      direction: 'reversed',
      source: 'manual',
      sideA: [anchor(a!.pieceLineKey)],
      sideB: [anchor(b!.pieceLineKey)],
      anchoredSize: 'M',
      note: '',
    }) as NonNullable<common_TechCard['seams']>[number],
  ];
  card.lockVersion = row.cardLockVersion + 1;
  const pending = {
    target: {
      techCardId: row.techCardId,
      capturedCardLockVersion: row.cardLockVersion,
      operationNumber,
      seamKey,
      orderedRowKeys: [seamKey],
    },
    sourceSizeToken: 'M',
    request: {
      authoringAuthority: { row },
      catalog,
      candidate: { connection: { mapping: 'equal', lengthRatio: 1, sides } },
    },
  } as unknown as Parameters<typeof finalizePatternImportDxfPhaseEExistingLinkedN1V1>[0]['pending'];
  const durable =
    vi.fn<Parameters<typeof finalizePatternImportDxfPhaseEExistingLinkedN1V1>[0]['persist']>();
  durable.mockResolvedValue({
    ok: false,
    session: null,
    compositeOperationBindingId: null,
    blocker: {
      code: 'test-durable-transport',
      detail: 'V4 persistence has a separate coverage boundary.',
    },
  });
  const context = {
    pending,
    profile: { id: 'browser-medium-isotropic-diagnostic', revision: '1' },
    direction: 'reversed',
    readback: {
      ok: true,
      seamKey,
      operationNumber,
      cardLockVersion: card.lockVersion,
      blocker: null,
    },
    freshCard: card,
    isCurrent: () => true,
    signal: new AbortController().signal,
    persist: durable,
  } as const;

  const conflicting = {
    techCardId: row.techCardId,
    patternLineKey: row.patternLineKey,
    sidecarSha256: 'a'.repeat(64),
    mediaType: 'existing durable carrier',
  } as TechCardPatternSemanticSidecar;
  let stored: TechCardPatternSemanticSidecar | undefined = conflicting;
  let loseReply = false;
  const puts = vi.mocked(service.PutTechCardPatternSemanticSidecar);
  vi.mocked(service.GetTechCardPatternSemanticSidecar).mockImplementation(async () => ({
    semanticSidecar: stored,
  }));
  puts.mockImplementation(async (request) => {
    expect(request.expectedCardLockVersion).toBe(card.lockVersion);
    expect(request.expectedSavedRowRevision).toBe(saved.savedRowRevision);
    expect(request.expectedPatternVersion).toBe(saved.version);
    expect(request.expectedDxfSha256).toBe(saved.sha256);
    expect(request.mediaType).toBe(PATTERN_IMPORT_DXF_PRODUCT_SEMANTIC_SIDECAR_MEDIA_TYPE_V1);
    if (request.expectedPreviousSidecarSha256 !== (stored?.sidecarSha256 ?? ''))
      throw new Error('Sidecar CAS conflict.');
    stored = {
      techCardId: request.techCardId,
      patternLineKey: request.patternLineKey,
      cardLockVersion: request.expectedCardLockVersion,
      savedRowRevision: request.expectedSavedRowRevision,
      patternVersion: request.expectedPatternVersion,
      dxfSha256: request.expectedDxfSha256,
      postSaveReceiptSha256: request.expectedPostSaveReceiptSha256,
      mediaType: request.mediaType,
      byteLength: atob(request.sidecarBytes!).length,
      sidecarBytes: request.sidecarBytes,
      sidecarSha256: request.sidecarSha256,
      createdAt: undefined,
      createdBy: undefined,
    };
    if (loseReply) {
      loseReply = false;
      throw new Error('The committed response was lost.');
    }
    return { semanticSidecar: stored };
  });
  const conflict = await finalizePatternImportDxfPhaseEExistingLinkedN1V1(context);
  expect(conflict).toMatchObject({ ok: false, blocker: { code: 'attachment-attempt-blocked' } });
  expect(puts, JSON.stringify(conflict)).toHaveBeenCalledTimes(1);
  expect(stored).toBe(conflicting);
  expect(durable).not.toHaveBeenCalled();

  stored = undefined;
  const readStored = () => stored;
  loseReply = true;
  puts.mockClear();
  const attached = await finalizePatternImportDxfPhaseEExistingLinkedN1V1(context);
  expect(attached, JSON.stringify(attached)).toMatchObject({
    ok: false,
    blocker: { code: 'test-durable-transport' },
  });
  expect(puts.mock.calls.map(([request]) => request.expectedPreviousSidecarSha256)).toEqual([
    '',
    readStored()?.sidecarSha256,
  ]);
  expect(durable).toHaveBeenCalledWith(
    expect.objectContaining({
      row: { ...row, cardLockVersion: card.lockVersion },
      verifiedSemanticSha256: readStored()?.sidecarSha256,
      seamKey,
      selectedOperationNumber: operationNumber,
    }),
    context.signal,
  );
}
