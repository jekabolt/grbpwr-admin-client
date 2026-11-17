import { describe, expect, it, vi } from 'vitest';

import type { PieceGeom } from 'lib/assembly-skeleton/types';
import {
  PATTERN_IMPORT_DXF_PRODUCT_PHASE_E_AUTHORING_CATALOG_V1,
  type PatternImportDxfProductPhaseEAuthoringCatalogV1,
} from 'lib/cloth/domain/pattern-import-dxf-product-phase-e-authoring-catalog-v1';
import {
  PATTERN_IMPORT_DXF_PRODUCT_PHASE_E_ASSEMBLY_PROJECTION_V1,
  type PatternImportDxfProductPhaseEAssemblyProjectionV1,
} from 'lib/pattern-import/dxf-product-phase-e-assembly-workbench-v1';

import { PATTERN_IMPORT_DXF_PHASE_E_FROM_SCRATCH_OPERATION_IDENTITY_POLICY_V1 } from './from-scratch-operation-identity-policy-v1';
import {
  activatePatternImportDxfPhaseEZeroConnectPostSaveLifecycleV1,
  createPatternImportDxfPhaseEZeroConnectPostSaveLifecycleOwnerV1,
  deactivatePatternImportDxfPhaseEZeroConnectPostSaveLifecycleV1,
  PATTERN_IMPORT_DXF_PHASE_E_ZERO_CONNECT_POST_SAVE_OWNER_V1,
  planPatternImportDxfPhaseEZeroConnectOperationSeamAttachV1,
  refreshPatternImportDxfPhaseEZeroConnectSeamLinkAuthorityV1,
  resolvePatternImportDxfPhaseEZeroConnectCurrentPostSaveAttemptV1,
  type PatternImportDxfPhaseEZeroConnectPendingHandoffV1,
  type PatternImportDxfPhaseEZeroConnectPostSaveLifecycleSlotV1,
} from './cad-table-zero-connect-post-save-owner-v1';
import {
  completePatternImportDxfPhaseEZeroConnectPostSaveSeamLinkV1,
  executePatternImportDxfPhaseEZeroConnectStrictSeamWriteOnceV1,
  preparePatternImportDxfPhaseEZeroConnectPostSaveSeamLinkV1,
  type PatternImportDxfPhaseEZeroConnectPostSaveSeamLinkInputV1,
} from './cad-table-zero-connect-post-save-seam-link-v1';
import { reuseExactKeys } from '../../assembly-seams/seams-store';
import {
  PATTERN_IMPORT_DXF_PHASE_E_CAD_TABLE_ZERO_CONNECT_CANDIDATE_V1,
  PATTERN_IMPORT_DXF_PHASE_E_CAD_TABLE_ZERO_CONNECT_SESSION_CLAIMS_V1,
  type PatternImportDxfPhaseECadTableZeroConnectCandidateV1,
} from './cad-table-zero-connect-session-v1';
import {
  buildPatternImportDxfPhaseEStoredSeamExactSideCrosswalkV1,
  buildPatternImportDxfPhaseEZeroConnectStoredSeamCrosswalkV1,
} from './cad-table-zero-connect-stored-seam-crosswalk-v1';

const CATALOG_SHA = 'a'.repeat(64);
const SELECTION_SHA = 'b'.repeat(64);
const HISTORY_KEY = 'connect:post-save';

function vertices(pieceId: string) {
  return [0, 1, 2, 3].map((ordinal) => ({
    ordinal,
    vertexId: `${pieceId}:v${ordinal}`,
    normalizedArc: ordinal / 4,
  }));
}

function authority(): {
  catalog: PatternImportDxfProductPhaseEAuthoringCatalogV1;
  projection: PatternImportDxfProductPhaseEAssemblyProjectionV1;
} {
  const pieces = ['front', 'back'].map((pieceId) => ({
    pieceId,
    pieceLineKey: `piece-${pieceId}`,
    contours: [
      {
        contourId: `${pieceId}:sewing`,
        role: 'sewing-boundary' as const,
        geometry: { kind: 'seam' as const },
        closed: true,
        boundaryVertices: vertices(pieceId),
      },
    ],
  }));
  return {
    catalog: {
      schemaVersion: PATTERN_IMPORT_DXF_PRODUCT_PHASE_E_AUTHORING_CATALOG_V1,
      techCardId: 11,
      scopeKey: 'main',
      sizeToken: 'M',
      sourceFileId: 'source-11',
      sizeSelectionCanonicalSha256: SELECTION_SHA,
      pieces,
      requiredExplicitFields: [
        'documentId-and-revision',
        'physical-surface',
        'two-seam-sides-and-anchor-ranges',
        'side-directions',
        'mapping-and-length-ratio',
        'operation-stage-and-order',
        'immutable-material-revisions',
        'tolerances',
      ],
      canonicalSha256: CATALOG_SHA,
      geometryCoordinatesExposed: false,
      rawDxfExposed: false,
      assemblyInferred: false,
      productionReady: false,
    },
    projection: {
      schemaVersion: PATTERN_IMPORT_DXF_PRODUCT_PHASE_E_ASSEMBLY_PROJECTION_V1,
      expectedCatalogCanonicalSha256: CATALOG_SHA,
      sizeSelectionCanonicalSha256: SELECTION_SHA,
      sourceFileId: 'source-11',
      sizeToken: 'M',
      joinMode: 'catalog-ordinal-to-phase-d-point',
      pieces: pieces.map((piece) => ({
        pieceId: piece.pieceId,
        pieceLineKey: piece.pieceLineKey,
        contours: [
          {
            contourId: piece.contours[0]!.contourId,
            role: 'sewing-boundary' as const,
            closed: true,
            vertices: vertices(piece.pieceId).map((vertex, index) => ({
              ...vertex,
              pointMm: [
                { x: 0, y: 0 },
                { x: 100, y: 0 },
                { x: 100, y: 100 },
                { x: 0, y: 100 },
              ][index]!,
            })),
          },
        ],
        cameraMm: { minX: 0, minY: 0, maxX: 100, maxY: 100, padding: 0 },
      })),
      geometryPlacementApplied: false,
    },
  };
}

function candidate(): PatternImportDxfPhaseECadTableZeroConnectCandidateV1 {
  const side = (pieceId: string, direction: 'forward' | 'reverse') => ({
    pieceId,
    pieceLineKey: `piece-${pieceId}`,
    contourId: `${pieceId}:sewing`,
    boundaryVertexIds: [`${pieceId}:v0`, `${pieceId}:v1`] as const,
    direction,
  });
  return {
    schemaVersion: PATTERN_IMPORT_DXF_PHASE_E_CAD_TABLE_ZERO_CONNECT_CANDIDATE_V1,
    status: 'session-only-operation-candidate',
    source: {
      catalogCanonicalSha256: CATALOG_SHA,
      sizeSelectionCanonicalSha256: SELECTION_SHA,
      sourceFileId: 'source-11',
      scopeKey: 'main',
      sizeToken: 'M',
    },
    operation: {
      sessionOperationId: HISTORY_KEY,
      order: 0,
      stage: 0,
      dependsOn: [],
      operationNumber: 0,
      authoringOperationId: null,
    },
    connection: {
      intentId: HISTORY_KEY,
      mapping: 'equal',
      lengthRatio: 1,
      sides: [side('front', 'forward'), side('back', 'reverse')],
    },
    apply: {
      eligible: false,
      boundary: PATTERN_IMPORT_DXF_PHASE_E_FROM_SCRATCH_OPERATION_IDENTITY_POLICY_V1,
    },
    claims: PATTERN_IMPORT_DXF_PHASE_E_CAD_TABLE_ZERO_CONNECT_SESSION_CLAIMS_V1,
  };
}

function input(): PatternImportDxfPhaseEZeroConnectPostSaveSeamLinkInputV1 {
  return {
    savedOperation: {
      status: 'same-session-saved-draft-operation',
      historyKey: HISTORY_KEY,
      operationNumber: 7,
    },
    candidate: candidate(),
    ...authority(),
    direction: 'same',
    nameOf: (pieceLineKey) => pieceLineKey,
    grainDeg: null,
  };
}

function legacyFrontGeometry(): PieceGeom {
  return {
    pieceKey: 'piece-front',
    name: 'Front',
    hand: null,
    cloth: null,
    rs: [
      [0, 0],
      [100, 0],
    ],
    corners: [0, 1],
    notchIdx: [],
    edges: [
      {
        id: 'piece-front#legacy',
        pieceKey: 'piece-front',
        k: 0,
        s: 0,
        e: 1,
        pts: [
          [0, 0],
          [100, 0],
        ],
        lenMm: 100,
        chordMm: 100,
        turnDeg: 0,
        notchesMm: [],
        kind: 'edge',
      },
    ],
    rect: false,
    areaMm2: 0,
    perimMm: 100,
    twinOf: [],
  };
}

describe('zero-connect post-save exact StoredSeam link', () => {
  it('derives the strict StoredSeam command without legacy skeleton authority', () => {
    const prepared = preparePatternImportDxfPhaseEZeroConnectPostSaveSeamLinkV1(input());

    expect(prepared).toMatchObject({
      ok: true,
      receipt: {
        storedSeam: {
          anchoredSize: 'M',
          sideA: [
            {
              piece: 'piece-front',
              edgeHint: 'piece-front#dxf:front%3Asewing:front%3Av0>front%3Av1',
              lenMm: 100,
            },
          ],
          sideB: [
            {
              piece: 'piece-back',
              edgeHint: 'piece-back#dxf:back%3Asewing:back%3Av0>back%3Av1',
              lenMm: 100,
            },
          ],
        },
        nextCommand: {
          kind: 'strict-seam-upsert',
          requiredOutcome: 'verified-echo',
          acceptSubmittedKeyAsFinal: false,
        },
      },
    });
  });

  it('accepts only the verified echoed seam key and unchanged semantics', () => {
    const prepared = preparePatternImportDxfPhaseEZeroConnectPostSaveSeamLinkV1(input());
    if (!prepared.ok) throw new Error(prepared.blocker.detail);
    const echoed = { ...prepared.receipt.storedSeam, seamKey: 'server-final-key' };

    expect(
      completePatternImportDxfPhaseEZeroConnectPostSaveSeamLinkV1(prepared.receipt, {
        ok: true,
        rows: [echoed],
        seamKeys: [echoed.seamKey],
        lockVersion: 42,
        outcome: 'verified-echo',
        blocker: null,
      }),
    ).toMatchObject({
      ok: true,
      receipt: { finalSeamKey: 'server-final-key', seamWriteLockVersion: 42 },
    });
    expect(
      completePatternImportDxfPhaseEZeroConnectPostSaveSeamLinkV1(prepared.receipt, {
        ok: true,
        rows: [{ ...echoed, stale: true }],
        seamKeys: [echoed.seamKey],
        lockVersion: 42,
        outcome: 'verified-echo',
        blocker: null,
      }),
    ).toMatchObject({ ok: false, blocker: { code: 'strict-seam-receipt-mismatch' } });
  });

  it('refuses to attach the echoed key after the live operation moved', () => {
    const prepared = preparePatternImportDxfPhaseEZeroConnectPostSaveSeamLinkV1(input());
    if (!prepared.ok) throw new Error(prepared.blocker.detail);
    const echoed = { ...prepared.receipt.storedSeam, seamKey: 'server-final-key' };
    const completed = completePatternImportDxfPhaseEZeroConnectPostSaveSeamLinkV1(
      prepared.receipt,
      {
        ok: true,
        rows: [echoed],
        seamKeys: [echoed.seamKey],
        lockVersion: 42,
        outcome: 'verified-echo',
        blocker: null,
      },
    );
    if (!completed.ok) throw new Error(completed.blocker.detail);

    expect(
      planPatternImportDxfPhaseEZeroConnectOperationSeamAttachV1(
        [{ historyKey: HISTORY_KEY, operationNumber: 8, seamKeys: [] }],
        completed.receipt,
      ),
    ).toMatchObject({
      ok: false,
      blocker: { code: 'zero-connect-seam-link-operation-changed' },
    });
  });

  it('rejects echoes whose exact anchor samples, contour or length changed', () => {
    const prepared = preparePatternImportDxfPhaseEZeroConnectPostSaveSeamLinkV1(input());
    if (!prepared.ok) throw new Error(prepared.blocker.detail);
    const expected = prepared.receipt.storedSeam;
    const firstAnchor = expected.sideA[0]!;
    const mutations = [
      {
        ...expected,
        seamKey: 'server-mutated-samples',
        sideA: [
          {
            ...firstAnchor,
            samples: firstAnchor.samples.map(([u, v], index) =>
              index === 0 ? ([u + 0.01, v] as [number, number]) : ([u, v] as [number, number]),
            ),
          },
        ],
      },
      {
        ...expected,
        seamKey: 'server-mutated-contour',
        sideA: [{ ...firstAnchor, contourSig: `${firstAnchor.contourSig}:changed` }],
      },
      {
        ...expected,
        seamKey: 'server-mutated-length',
        sideA: [{ ...firstAnchor, lenMm: firstAnchor.lenMm + 0.1 }],
      },
    ];

    for (const echoed of mutations)
      expect(
        completePatternImportDxfPhaseEZeroConnectPostSaveSeamLinkV1(prepared.receipt, {
          ok: true,
          rows: [echoed],
          seamKeys: [echoed.seamKey],
          lockVersion: 42,
          outcome: 'verified-echo',
          blocker: null,
        }),
      ).toMatchObject({ ok: false, blocker: { code: 'strict-seam-receipt-mismatch' } });
  });

  it('reuses a stored key only for full exact anchor identity, independent of A/B order', () => {
    const prepared = preparePatternImportDxfPhaseEZeroConnectPostSaveSeamLinkV1(input());
    if (!prepared.ok) throw new Error(prepared.blocker.detail);
    const stored = { ...prepared.receipt.storedSeam, seamKey: 'stored-key' };
    const retry = { ...prepared.receipt.storedSeam, seamKey: 'retry-key' };
    const swapped = { ...retry, sideA: retry.sideB, sideB: retry.sideA };
    const changed = {
      ...retry,
      sideA: [{ ...retry.sideA[0]!, contourSig: `${retry.sideA[0]!.contourSig}:changed` }],
    };
    const otherSize = { ...retry, anchoredSize: 'L' };

    expect(reuseExactKeys([retry], [stored])[0]!.seamKey).toBe('stored-key');
    expect(reuseExactKeys([swapped], [stored])[0]!.seamKey).toBe('stored-key');
    expect(reuseExactKeys([changed], [stored])[0]!.seamKey).toBe('retry-key');
    expect(reuseExactKeys([otherSize], [stored])[0]!.seamKey).toBe('retry-key');
  });

  it('runs the strict seam RPC once for concurrent attempts on one pending identity', async () => {
    const prepared = preparePatternImportDxfPhaseEZeroConnectPostSaveSeamLinkV1(input());
    if (!prepared.ok) throw new Error(prepared.blocker.detail);
    const echoed = { ...prepared.receipt.storedSeam, seamKey: 'server-final-key' };
    const upsert = vi.fn(async () => ({
      ok: true as const,
      rows: [echoed],
      seamKeys: [echoed.seamKey],
      lockVersion: 42,
      outcome: 'verified-echo' as const,
      blocker: null,
    }));
    const pendingIdentity = {};

    const first = executePatternImportDxfPhaseEZeroConnectStrictSeamWriteOnceV1(
      pendingIdentity,
      prepared.receipt,
      upsert,
    );
    const second = executePatternImportDxfPhaseEZeroConnectStrictSeamWriteOnceV1(
      pendingIdentity,
      prepared.receipt,
      upsert,
    );

    await expect(first).resolves.toMatchObject({ ok: true });
    await expect(second).resolves.toMatchObject({ ok: true });
    expect(upsert).toHaveBeenCalledTimes(1);
  });

  it('evicts only a safe not-attempted gate before one successful strict RPC retry', async () => {
    const prepared = preparePatternImportDxfPhaseEZeroConnectPostSaveSeamLinkV1(input());
    if (!prepared.ok) throw new Error(prepared.blocker.detail);
    const echoed = { ...prepared.receipt.storedSeam, seamKey: 'server-final-key' };
    const upsert = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false as const,
        rows: [] as const,
        seamKeys: [] as const,
        outcome: 'not-attempted' as const,
        blocker: { code: 'write-in-flight' as const, detail: 'safe local gate' },
      })
      .mockResolvedValueOnce({
        ok: true as const,
        rows: [echoed],
        seamKeys: [echoed.seamKey],
        lockVersion: 42,
        outcome: 'verified-echo' as const,
        blocker: null,
      });
    const pendingIdentity = {};

    await expect(
      executePatternImportDxfPhaseEZeroConnectStrictSeamWriteOnceV1(
        pendingIdentity,
        prepared.receipt,
        upsert,
      ),
    ).resolves.toMatchObject({ ok: false });
    await expect(
      executePatternImportDxfPhaseEZeroConnectStrictSeamWriteOnceV1(
        pendingIdentity,
        prepared.receipt,
        upsert,
      ),
    ).resolves.toMatchObject({ ok: true });
    await expect(
      executePatternImportDxfPhaseEZeroConnectStrictSeamWriteOnceV1(
        pendingIdentity,
        prepared.receipt,
        upsert,
      ),
    ).resolves.toMatchObject({ ok: true });
    expect(upsert).toHaveBeenCalledTimes(2);
  });

  it.each(['unknown', 'acknowledged-unverified'] as const)(
    'retains an at-most-once %s write outcome',
    async (outcome) => {
      const prepared = preparePatternImportDxfPhaseEZeroConnectPostSaveSeamLinkV1(input());
      if (!prepared.ok) throw new Error(prepared.blocker.detail);
      const upsert = vi.fn().mockResolvedValue({
        ok: false as const,
        rows: [] as const,
        seamKeys: [] as const,
        outcome,
        blocker: { code: 'write-failed' as const, detail: 'write outcome is not safely retryable' },
      });
      const pendingIdentity = {};

      await executePatternImportDxfPhaseEZeroConnectStrictSeamWriteOnceV1(
        pendingIdentity,
        prepared.receipt,
        upsert,
      );
      await executePatternImportDxfPhaseEZeroConnectStrictSeamWriteOnceV1(
        pendingIdentity,
        prepared.receipt,
        upsert,
      );
      expect(upsert).toHaveBeenCalledTimes(1);
    },
  );

  it('installs a fresh usable lifecycle after a StrictMode effect cleanup replay', () => {
    const pending = Object.freeze({
      status: 'in-memory-awaiting-save-direction-and-seam-link',
      candidate: candidate(),
    }) as unknown as PatternImportDxfPhaseEZeroConnectPendingHandoffV1;
    const slot: PatternImportDxfPhaseEZeroConnectPostSaveLifecycleSlotV1 = { current: null };
    const first = activatePatternImportDxfPhaseEZeroConnectPostSaveLifecycleV1(slot, pending);
    const staleTicket = first.begin(pending);
    if (!staleTicket) throw new Error('expected first setup ticket');

    deactivatePatternImportDxfPhaseEZeroConnectPostSaveLifecycleV1(slot, first);
    const replayed = activatePatternImportDxfPhaseEZeroConnectPostSaveLifecycleV1(slot, pending);
    const currentTicket = replayed.begin(pending);
    if (!currentTicket) throw new Error('expected replay setup ticket');

    expect(staleTicket.signal.aborted).toBe(true);
    expect(first.isCurrent(staleTicket, pending)).toBe(false);
    expect(slot.current).toBe(replayed);
    expect(replayed.isCurrent(currentTicket, pending)).toBe(true);
  });

  it('aborts superseded, replaced and disposed post-save attempts', () => {
    const pending = Object.freeze({
      status: 'in-memory-awaiting-save-direction-and-seam-link',
      candidate: candidate(),
    }) as unknown as PatternImportDxfPhaseEZeroConnectPendingHandoffV1;
    const replacement = Object.freeze({
      status: 'in-memory-awaiting-save-direction-and-seam-link',
      candidate: candidate(),
    }) as unknown as PatternImportDxfPhaseEZeroConnectPendingHandoffV1;
    const owner = createPatternImportDxfPhaseEZeroConnectPostSaveLifecycleOwnerV1();
    owner.bindCurrent(pending);
    const slow = owner.begin(pending);
    const fast = owner.begin(pending);
    if (!slow || !fast) throw new Error('expected lifecycle tickets');

    expect(slow.signal.aborted).toBe(true);
    expect(owner.isCurrent(slow, pending)).toBe(false);
    expect(owner.isCurrent(fast, pending)).toBe(true);
    expect(
      resolvePatternImportDxfPhaseEZeroConnectCurrentPostSaveAttemptV1({
        lifecycle: owner,
        ticket: fast,
        pending,
        currentPending: pending,
        operations: [
          {
            historyKey: HISTORY_KEY,
            operationNumber: 7,
            inputKeys: ['piece-front', 'piece-back'],
          },
        ],
      }),
    ).toMatchObject({ ok: true });
    expect(
      resolvePatternImportDxfPhaseEZeroConnectCurrentPostSaveAttemptV1({
        lifecycle: owner,
        ticket: fast,
        pending,
        currentPending: pending,
        operations: [
          {
            historyKey: HISTORY_KEY,
            operationNumber: 7,
            inputKeys: ['piece-back', 'piece-front'],
          },
        ],
      }),
    ).toMatchObject({ ok: false, blocker: { code: 'zero-connect-seam-link-operation-changed' } });
    owner.bindCurrent(replacement);
    expect(fast.signal.aborted).toBe(true);
    expect(owner.isCurrent(fast, pending)).toBe(false);

    owner.bindCurrent(replacement);
    const final = owner.begin(replacement);
    if (!final) throw new Error('expected replacement ticket');
    owner.bindCurrent(null);
    expect(final.signal.aborted).toBe(true);

    owner.bindCurrent(replacement);
    const disposed = owner.begin(replacement);
    if (!disposed) throw new Error('expected disposable ticket');
    owner.dispose();
    expect(disposed.signal.aborted).toBe(true);
    expect(owner.begin(replacement)).toBeNull();
  });

  it('rejects stale exact source authority before producing a write command', () => {
    const current = input();
    expect(
      preparePatternImportDxfPhaseEZeroConnectPostSaveSeamLinkV1({
        ...current,
        projection: { ...current.projection, sourceFileId: 'foreign-source' },
      }),
    ).toMatchObject({ ok: false, blocker: { code: 'exact-anchor-source-stale' } });
  });

  it('rejects a structural refresh function before any seam writer can run', async () => {
    const current = input();
    const refresh = vi.fn();
    const result = await refreshPatternImportDxfPhaseEZeroConnectSeamLinkAuthorityV1(
      {
        schemaVersion: PATTERN_IMPORT_DXF_PHASE_E_ZERO_CONNECT_POST_SAVE_OWNER_V1,
        candidate: current.candidate,
        catalog: current.catalog,
        projection: current.projection,
        authoringAuthority: Object.freeze({ opaque: 'foreign' }) as never,
        authoringAuthorityRefresh: Object.freeze({ refresh }) as never,
        direction: 'same',
      },
      new AbortController().signal,
    );

    expect(result).toMatchObject({
      ok: false,
      blocker: { code: 'zero-connect-seam-link-authority-unavailable' },
    });
    expect(refresh).not.toHaveBeenCalled();
  });

  it('preserves legacy geometric fallback for the existing cross-scope side owner only', () => {
    const current = authority();
    const side = candidate().connection.sides[0];
    const legacyGeometry = [legacyFrontGeometry()];

    expect(
      buildPatternImportDxfPhaseEStoredSeamExactSideCrosswalkV1({
        side,
        ...current,
        geometry: legacyGeometry,
        geometrySizeToken: 'M',
      }),
    ).toMatchObject({ ok: true, side: { parts: [{ target: 'piece-front#legacy' }] } });
    expect(
      buildPatternImportDxfPhaseEZeroConnectStoredSeamCrosswalkV1({
        candidate: candidate(),
        ...current,
        geometry: legacyGeometry,
        geometrySizeToken: 'M',
      }),
    ).toMatchObject({
      ok: false,
      blocker: { code: 'legacy-skeleton-exact-identity-unavailable' },
    });
  });
});
