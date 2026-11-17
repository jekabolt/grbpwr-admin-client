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

it('reopens a genuine manifest-bearing writer revision with native sewing IDs bound to its saved bytes and compiles', async () => {
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
  vi.mocked(abortableAdminService).mockImplementation(
    () =>
      ({
        GetTechCardSavedAssemblySnapshot: (request: GetTechCardSavedAssemblySnapshotRequest) =>
          fullAssemblyFixtureWireV1(seed, request.selectedOperationNumber!),
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
      sourceRequest: { ...request.sourceRequest, draft: native.draft },
    });
    expect(result.compiled, JSON.stringify(result.blockers)).toBe(true);
    if (!result.compiled) throw new Error(JSON.stringify(result.blockers));
    expect(result.evidence?.writerSha256).toBe(seed.row.sha256);
    expect(result.graph?.source.handoffSource.exportSha256).toBe(seed.row.sha256);
    expect(result.graph?.source.handoffSource.exporterId).toBe('grbpwr.saved-native-drawn-sewing');
  } finally {
    compiler.dispose();
    owner.dispose();
    host.dispose();
  }
});
