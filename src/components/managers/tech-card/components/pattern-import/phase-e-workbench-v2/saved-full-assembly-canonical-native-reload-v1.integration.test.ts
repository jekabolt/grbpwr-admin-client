import {
  DXF_GARMENT_PHYSICAL_INITIALIZATION_V1,
  DXF_GARMENT_PHYSICAL_INITIALIZATION_CONVENTION_V1,
  encodeDxfGarmentPhysicalInitializationV1,
  fingerprintDxfExactAssemblyGraphV1,
} from 'lib/cloth/domain/dxf-garment-physical-initialization-v1';
import { createObservedPlacementPairCubeBodyFixtureV1 } from 'components/cloth-simulation-spike/beta-skirt-saved-annular-observed-placement-displayed-body-product-placement-v1.test-fixture';
import { projectSavedModelObservedPlacementTargetV1 } from 'components/cloth-simulation-spike/saved-model-observed-placement-target-v1';
import {
  readSavedFullAssemblySnapshotV1,
  projectSavedFullAssemblySnapshotV1,
  disposeSavedFullAssemblySnapshotV1,
} from './saved-full-assembly-snapshot-production-v1';
import {
  buildSavedFullAssemblyPhysicalComponentV1,
  projectSavedFullAssemblyAoOnlySnapshotV1,
  encodeSavedFullAssemblyPhysicalComponentV1,
  decodeSavedFullAssemblyPhysicalComponentV1,
} from './saved-full-assembly-physical-component-v1';
import capturedOperations from 'lib/cloth/domain/test-fixtures/recorded-terminal-press-operations.json';
import {
  readRecordedAssemblyOrder,
  RECORDED_TERMINAL_PRESS_PROFILE,
} from 'lib/cloth/domain/dxf-recorded-terminal-press-v1';
import { canonicalizePatternImportDxfPhaseESavedAssemblyValueV1 as canonical } from './saved-assembly-topology-hash-v1';
import { expect, it, vi } from 'vitest';
import { abortableAdminService } from 'api/api';
import type { GetTechCardSavedAssemblySnapshotRequest } from 'api/proto-http/admin';
import { Session } from 'lib/pattern-import/worker/session';
import type { PatternImportOpenFile, StageName, StageIO } from 'lib/pattern-import/types';
import type { ImportClient } from '../client';
import { writeDxfDetailed } from 'lib/pattern-import/write';
import { createDxfProductSavedNativeReprocessOwnerV1 } from 'lib/pattern-import/dxf-product-saved-native-reprocess-owner-v1';
import { DXF_PRODUCT_SAVED_REPROCESS_REQUEST_V1 } from 'lib/pattern-import/dxf-product-saved-reprocess-owner-v1';
import { createPatternImportDxfPhaseESavedDxfReprocessHostV1 } from './saved-dxf-reprocess-host-v1';
import { createSavedFullAssemblyCompileSessionV1 } from './saved-full-assembly-compile-session-v1';
import {
  createSavedThreePanelFixtureV1,
  digestFullAssemblyFixture,
  fullAssemblyFixtureWireV1,
  savedThreePanelCompileRequestV1,
} from './saved-full-assembly-compile-session-v1.test-fixture';
vi.mock('api/api', () => ({ abortableAdminService: vi.fn() }));
vi.mock('lib/cloth/body/measurement-open-reference-display-v1', async (original) => ({
  ...(await original<typeof import('lib/cloth/body/measurement-open-reference-display-v1')>()),
  loadMakeHumanOpenReferenceBasisV1: async () => ({ kind: 'female' }),
}));
vi.mock('lib/cloth/body/makehuman-torso-shape-delta-bundle-v1', () => ({
  loadMakeHumanTorsoShapeDeltaBundleV1: async () => ({}),
}));
vi.mock('lib/cloth/body/makehuman-uniform-waist-hip-modes-v1', () => ({
  createMakeHumanUniformWaistHipModesV1: () => ({
    basisKind: 'female',
    modes: [
      { measurementKey: 'waistCircumferenceMm', stationOriginM: [0, 1.2, 0] },
      { measurementKey: 'hipCircumferenceMm', stationOriginM: [0, 1, 0] },
    ],
  }),
}));
async function freshSnapshot(row: Parameters<typeof readSavedFullAssemblySnapshotV1>[0]['row']) {
  const receipt = await readSavedFullAssemblySnapshotV1({ row, seedOperationNumber: 10 });
  try {
    return projectSavedFullAssemblySnapshotV1(receipt);
  } finally {
    disposeSavedFullAssemblySnapshotV1(receipt);
  }
}
class DirectClient implements ImportClient {
  readonly kind = 'worker' as const;
  private next = 1;
  private sessions = new Map<number, Session>();
  async open(files: PatternImportOpenFile[]) {
    const sessionId = this.next++;
    const session = new Session(sessionId, files);
    this.sessions.set(sessionId, session);
    return { sessionId, files: session.files };
  }
  async run<S extends StageName>(
    sessionId: number,
    stage: S,
    input: StageIO[S]['in'],
  ): Promise<StageIO[S]['out']> {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error('Missing in-process worker session.');
    return session.runStage(stage, input, { checkCancel() {}, progress() {} });
  }
  cancel() {}
  async close(sessionId: number) {
    this.sessions.get(sessionId)?.close();
    this.sessions.delete(sessionId);
  }
  dispose() {
    for (const session of this.sessions.values()) session.close();
    this.sessions.clear();
  }
}

it.each([false, true])(
  'reopens genuine DXF bytes and compiles native sewing with recorded production press = %s',
  async (includePress) => {
    let seed = await createSavedThreePanelFixtureV1(2);
    const oldSha = seed.row.sha256;
    const job = structuredClone(seed.job);
    for (const piece of job.pieces) {
      piece.allowance = { ...piece.allowance, meaning: 'both', allowanceMm: 10 };
      for (const size of piece.sizes) {
        const xs = size.cut.map(({ x }) => x),
          ys = size.cut.map(({ y }) => y);
        const left = Math.min(...xs) + 10,
          right = Math.max(...xs) - 10;
        const bottom = Math.min(...ys) + 10,
          top = Math.max(...ys) - 10;
        size.seam = [
          { x: left, y: bottom },
          { x: right, y: bottom },
          { x: right, y: top },
          { x: left, y: top },
        ];
      }
    }
    // Same canonical writer called by Apply; embedded manifest is intentionally retained.
    const written = writeDxfDetailed(job, { now: () => new Date(seed.written.manifest.createdAt) });
    const bytes = Uint8Array.from(written.dxfText, (c) => c.charCodeAt(0));
    seed = {
      ...seed,
      job,
      written,
      bytes,
      row: {
        ...seed.row,
        revision: seed.row.revision + 1,
        sizeBytes: bytes.length,
        sha256: await digestFullAssemblyFixture(bytes),
      },
    };
    expect(seed.row.sha256).not.toBe(oldSha);
    const operations = includePress
      ? [
          {
            ...capturedOperations[0],
            ...seed.operations[0],
            pieceLineKeys: [...seed.operations[0].inputKeys],
          },
          structuredClone(capturedOperations[1]),
        ]
      : seed.operations;
    const recordedOrder = readRecordedAssemblyOrder(operations, canonical(operations));
    expect(!!recordedOrder).toBe(includePress);
    vi.mocked(abortableAdminService).mockImplementation(
      () =>
        ({
          GetTechCardSavedAssemblySnapshot: (request: GetTechCardSavedAssemblySnapshotRequest) =>
            fullAssemblyFixtureWireV1(seed, request.selectedOperationNumber!, operations),
        }) as unknown as ReturnType<typeof abortableAdminService>,
    );
    const host = createPatternImportDxfPhaseESavedDxfReprocessHostV1({
      nativeSewingReplay: true,
      resolveCard: async () => ({
        card: structuredClone(seed.card),
        cardLockVersion: seed.row.cardLockVersion,
      }),
      readAuthoritativeRow: async () => ({ row: seed.row, downloadUrl: seed.row.url }),
      createClient: () => new DirectClient(),
      fetch: async () =>
        new Response(bytes.slice(), {
          status: 200,
          headers: { 'content-length': String(bytes.length) },
        }),
    });
    const owner = createDxfProductSavedNativeReprocessOwnerV1(host);
    const compiler = createSavedFullAssemblyCompileSessionV1();
    try {
      const native = await owner.run({
        schemaVersion: DXF_PRODUCT_SAVED_REPROCESS_REQUEST_V1,
        row: seed.row,
      });
      expect(native.ok).toBe(true);
      if (!native.ok) throw new Error(JSON.stringify(native.blockers));
      const sewing = native.nativeSewingReplay;
      expect(sewing?.replayReady).toBe(true);
      if (!sewing?.replayReady) throw new Error('Native sewing carrier required');
      expect(sewing.pipeline.contentBinding?.sourceSha256).toBe(seed.row.sha256);
      expect(sewing.replay.carrier.sourceSha256).toBe(seed.row.sha256);
      const catalogDraft = {
        ...native.draft,
        dxfProvenance: sewing.pipeline,
        dxfPhaseDReplay: sewing.replay,
      };
      const request = await savedThreePanelCompileRequestV1(seed, {
        native: { ...native, draft: catalogDraft },
        dispose: () => owner.dispose(),
      });
      const result = await compiler.consume({
        ...request,
        intent: { ...request.intent, ...(recordedOrder ? { productionOrder: recordedOrder } : {}) },
        sourceRequest: { ...request.sourceRequest, draft: native.draft },
      });
      expect(result.compiled, JSON.stringify(result.blockers)).toBe(true);
      if (!result.compiled) throw new Error(JSON.stringify(result.blockers));
      if (includePress) {
        expect(result.graph?.profile).toBe(RECORDED_TERMINAL_PRESS_PROFILE);
        expect(result.graph?.productionOrder).toEqual(recordedOrder);
        expect(result.graph?.operations.map((op) => op.sourceOperationNumber)).toEqual([10]);
        const graph = result.graph!;
        expect(JSON.parse(graph.productionOrder![1].canonicalSourceOperation)).toEqual(
          capturedOperations[1],
        );
        const before = await freshSnapshot(seed.row);
        const assemblySnapshot = projectSavedFullAssemblyAoOnlySnapshotV1(before);
        const context = { graph, assemblySnapshot };
        const fingerprint = await fingerprintDxfExactAssemblyGraphV1(context);
        const body = await createObservedPlacementPairCubeBodyFixtureV1();
        const target = await projectSavedModelObservedPlacementTargetV1(
          body.bodyOwner,
          body.binding,
        );
        body.dispose();
        if (!target.ok || !result.compileResult?.compiled)
          throw new Error('CPU target/compile fixture missing.');
        const graphCanonicalSha256 = fingerprint.canonicalSha256;
        const compileInputSha256 = result.compileResult.artifact.sourceEvidence.inputSha256;
        const initialization = await encodeDxfGarmentPhysicalInitializationV1({
          ...context,
          document: {
            schemaVersion: DXF_GARMENT_PHYSICAL_INITIALIZATION_V1,
            graphCanonicalSha256,
            compileInputSha256,
            convention: DXF_GARMENT_PHYSICAL_INITIALIZATION_CONVENTION_V1,
            placements: graph.pieces.map((p, i) => ({
              pieceId: p.pieceId,
              sourceOriginM: [i * 0.15, 0, 0],
              rotationRowMajor: [1, 0, 0, 0, 1, 0, 0, 0, 1],
              translationM: [i * 0.1, 0, 0],
            })),
            observedTarget: { target: target.target, canonicalSha256: target.canonicalSha256 },
            support: 'none',
            replayProfile: 'garment-material-contact-replay/1',
          },
        });
        const component = await buildSavedFullAssemblyPhysicalComponentV1({
          bindings: { row: seed.row, serverAssemblyRevision: before.serverAssemblyRevision },
          graph,
          graphCanonicalSha256,
          compileInputSha256,
          physicalInitializationBytes: initialization.bytes,
          assemblySnapshot: before,
        });
        if (!component.ok) throw new Error(JSON.stringify(component.blockers));
        const encoded = encodeSavedFullAssemblyPhysicalComponentV1(component.owner);
        if (!encoded.ok) throw new Error(encoded.code);
        const reread = await decodeSavedFullAssemblyPhysicalComponentV1(
          encoded.bytes,
          await freshSnapshot(seed.row),
        );
        if (!reread.ok) throw new Error(JSON.stringify(reread.blockers));
        expect(reread.document.graph.productionOrder).toEqual(recordedOrder);
        Object.assign(operations[1], { note: 'changed after save' });
        expect(
          (
            await decodeSavedFullAssemblyPhysicalComponentV1(
              encoded.bytes,
              await freshSnapshot(seed.row),
            )
          ).ok,
        ).toBe(false);
      } else {
        expect(result.graph).not.toHaveProperty('productionOrder');
      }
      expect(result.evidence?.writerSha256).toBe(seed.row.sha256);
      expect(result.graph?.source.handoffSource.exportSha256).toBe(seed.row.sha256);
      expect(result.graph?.source.handoffSource.exporterId).toBe(
        'grbpwr.saved-native-drawn-sewing',
      );
      expect(result.graph?.source.handoffSource.provenanceKind).toBe('untrusted-product');
    } finally {
      compiler.dispose();
      owner.dispose();
      host.dispose();
    }
  },
);
