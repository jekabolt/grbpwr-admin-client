import {
  buildDxfGarmentAssemblyExplicitPlacementStageV1,
  DXF_GARMENT_ASSEMBLY_EXPLICIT_PLACEMENT_STAGE_V1,
} from 'lib/cloth/domain/dxf-garment-assembly-explicit-placement-stage-v1';
import { validateSealedSimulationPackageV5V1 } from 'lib/cloth/compiler/simulation-package-v5-integrity';
import { abortableAdminService } from 'api/api';
import { createSavedFullAssemblyCompileSessionV1 } from './saved-full-assembly-compile-session-v1';
import {
  savedThreePanelCompileRequestV1,
  fullAssemblyFixtureWireV1,
} from './saved-full-assembly-compile-session-v1.test-fixture';
import { describe, expect, it, vi } from 'vitest';
import {
  createSavedThreePanelFixtureV1,
  digestFullAssemblyFixture,
} from './saved-full-assembly-compile-session-v1.test-fixture';
import { createPatternImportDxfPhaseEForeignSavedDxfReprocessHostV1 } from './foreign-saved-dxf-reprocess-host-v1';
import {
  createDxfProductSavedForeignNativeReprocessOwnerV1,
  consumeDxfProductSavedNativeCompilerSourceV1,
  DXF_PRODUCT_SAVED_NATIVE_COMPILER_SOURCE_REQUEST_V1,
} from 'lib/pattern-import/dxf-product-saved-native-reprocess-owner-v1';
import { DXF_PRODUCT_SAVED_FOREIGN_REPROCESS_REQUEST_V1 } from 'lib/pattern-import/dxf-product-saved-foreign-reprocess-owner-v1';
import { writeDxfDetailed } from 'lib/pattern-import/write';
import { Session } from 'lib/pattern-import/worker/session';
import type { PatternImportOpenFile, StageName, StageIO } from 'lib/pattern-import/types';
import type { ImportClient, StageProgress } from '../client';
vi.mock('api/api', () => ({ abortableAdminService: vi.fn() }));
// Only transport is in-process: actual Session, source decoder, foreign replay and private owner.
class InProcessClient implements ImportClient {
  readonly kind = 'worker' as const;
  private readonly sessions = new Map<number, Session>();
  private next = 1;
  private cancelled = false;
  async open(files: PatternImportOpenFile[]) {
    const sessionId = this.next++;
    const s = new Session(sessionId, files);
    this.sessions.set(sessionId, s);
    return { sessionId, files: s.files };
  }
  async run<S extends StageName>(
    sessionId: number,
    stage: S,
    input: StageIO[S]['in'],
    progress?: (p: StageProgress) => void,
  ): Promise<StageIO[S]['out']> {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error('missing worker session');
    return session.runStage(stage, input, {
      checkCancel: () => {
        if (this.cancelled) throw new DOMException('cancelled', 'AbortError');
      },
      progress: (done, total, note) => progress?.({ done, total, note }),
    });
  }
  cancel() {
    this.cancelled = true;
  }
  async close(sessionId: number) {
    this.sessions.get(sessionId)?.close();
    this.sessions.delete(sessionId);
  }
  dispose() {
    for (const s of this.sessions.values()) s.close();
    this.sessions.clear();
  }
}

describe('foreign native source capability', () => {
  it('retains original saved bytes as native identity and independently replayed writer as separate evidence', async () => {
    const seed = await createSavedThreePanelFixtureV1(2);
    const authoredJob = structuredClone(seed.job);
    for (const piece of authoredJob.pieces) {
      piece.allowance = { ...piece.allowance, meaning: 'both', allowanceMm: 10 };
      for (const size of piece.sizes) {
        const xs = size.cut.map((v) => v.x),
          ys = size.cut.map((v) => v.y);
        const minX = Math.min(...xs),
          maxX = Math.max(...xs),
          minY = Math.min(...ys),
          maxY = Math.max(...ys);
        size.seam = [
          { x: minX + 10, y: minY + 10 },
          { x: maxX - 10, y: minY + 10 },
          { x: maxX - 10, y: maxY - 10 },
          { x: minX + 10, y: maxY - 10 },
        ];
      }
    }
    const bare = writeDxfDetailed(authoredJob, {
      now: () => new Date(seed.written.manifest.createdAt),
      embed: null,
    });
    const bytes = new TextEncoder().encode(bare.dxfText);
    const row = {
      ...seed.row,
      sizeBytes: bytes.length,
      sha256: await digestFullAssemblyFixture(bytes),
    };
    const host = createPatternImportDxfPhaseEForeignSavedDxfReprocessHostV1({
      nativeSewingReplay: true,
      resolveCard: async () => ({
        card: structuredClone(seed.card),
        cardLockVersion: row.cardLockVersion,
      }),
      readAuthoritativeRow: async () => ({ row, downloadUrl: row.url }),
      createClient: () => new InProcessClient(),
      fetch: (async () =>
        new Response(bytes.slice(), {
          status: 200,
          headers: { 'content-length': String(bytes.length) },
        })) as typeof fetch,
    });
    let rebuilt: Awaited<ReturnType<typeof host.reprocess>> | undefined;
    const owner = createDxfProductSavedForeignNativeReprocessOwnerV1({
      ...host,
      reprocess: async (...args) => {
        rebuilt = await host.reprocess(...args);
        return rebuilt;
      },
    });
    try {
      const result = await owner.run({
        schemaVersion: DXF_PRODUCT_SAVED_FOREIGN_REPROCESS_REQUEST_V1,
        row,
      });
      expect(
        result.ok,
        JSON.stringify({
          blockers: result.blockers,
          pipeline: rebuilt?.draft.dxfProvenance,
          replay: rebuilt?.draft.dxfPhaseDReplay,
        }),
      ).toBe(true);
      if (!result.ok) throw new Error('Foreign native source missing.');
      expect(result.claims.sourceDecodePasses).toBe(3);
      const request = {
        schemaVersion: DXF_PRODUCT_SAVED_NATIVE_COMPILER_SOURCE_REQUEST_V1,
        sourceFileId: result.sourceFileId,
        sourceSha256: row.sha256,
        techCardId: row.techCardId,
        scopeKey: row.scopeKey,
        patternLineKey: row.patternLineKey,
        cardLockVersion: row.cardLockVersion,
        draft: result.draft,
      };
      expect(
        consumeDxfProductSavedNativeCompilerSourceV1({ ...result.sourceOwner }, request).ok,
      ).toBe(false);
      expect(
        consumeDxfProductSavedNativeCompilerSourceV1(result.sourceOwner, {
          ...request,
          sourceSha256: seed.row.sha256,
        }).ok,
      ).toBe(false);
      const consumed = consumeDxfProductSavedNativeCompilerSourceV1(result.sourceOwner, request);
      expect(consumed.ok).toBe(true);
      if (!consumed.ok) throw new Error('Source unavailable.');
      expect(consumed.value.nativeRead.read.doc.file.sha256).toBe(row.sha256);
      expect(
        consumed.value.nativeSewingReplay?.replayReady,
        JSON.stringify(consumed.value.nativeSewingReplay?.blockers),
      ).toBe(true);
      expect(Object.isFrozen(consumed.value.nativeSewingReplay)).toBe(true);
      expect(consumed.value.reconstruction).toMatchObject({
        kind: 'foreign-saved-dxf',
        originalSourceSha256: row.sha256,
      });
      expect(consumed.value.reconstruction?.canonicalWriterSha256).toMatch(/^[0-9a-f]{64}$/);
      expect(consumed.value.reconstruction?.canonicalWriterSha256).not.toBe(row.sha256);
      expect(Object.isFrozen(consumed.value.reconstruction)).toBe(true);
      expect(consumeDxfProductSavedNativeCompilerSourceV1(result.sourceOwner, request).ok).toBe(
        false,
      );
      // The public catalog view is content only; restore the exact original draft identity
      // for the one-shot source request before the real compiler consumes the private owner.
      const fresh = await owner.run({
        schemaVersion: DXF_PRODUCT_SAVED_FOREIGN_REPROCESS_REQUEST_V1,
        row,
      });
      if (!fresh.ok || !fresh.nativeSewingReplay?.replayReady)
        throw new Error('Fresh native sewing replay required.');
      const foreignSeed = { ...seed, row, bytes };
      vi.mocked(abortableAdminService).mockImplementation(
        () =>
          ({
            GetTechCardSavedAssemblySnapshot: async (request: {
              selectedOperationNumber?: number;
            }) => fullAssemblyFixtureWireV1(foreignSeed, request.selectedOperationNumber!),
          }) as unknown as ReturnType<typeof abortableAdminService>,
      );
      const catalogDraft = {
        ...fresh.draft,
        dxfProvenance: fresh.nativeSewingReplay.pipeline,
        dxfPhaseDReplay: fresh.nativeSewingReplay.replay,
      };
      const compileRequest = await savedThreePanelCompileRequestV1(foreignSeed, {
        native: { ...fresh, draft: catalogDraft },
        dispose: () => {},
      });
      const compiler = createSavedFullAssemblyCompileSessionV1();
      try {
        const compiled = await compiler.consume({
          ...compileRequest,
          sourceRequest: { ...compileRequest.sourceRequest, draft: fresh.draft },
        });
        expect(compiled.compiled, JSON.stringify(compiled.blockers)).toBe(true);
        // Drawn sewing lines are separated by their real allowances before explicit placement.
        // Keep the existing preactivation gate unchanged; the real compiled artifact remains usable.
        expect(compiled.sealed).toBe(false);
        expect(compiled.blockers.some((b) => b.detail.includes('incoherent-rest-pair'))).toBe(true);
        expect(compiled.evidence?.sourceSurface).toBe('explicit-native-drawn-sewing');
        expect(compiled.evidence?.sourceCutHandoffSha256).toBeNull();
        expect(compiled.evidence?.zeroAllowanceEquivalence).toEqual([]);
        expect(compiled.graph?.source.nativeDxfSha256).toBe(row.sha256);
        expect(compiled.graph?.source.handoffSource.exportSha256).toBe(row.sha256);
        expect(compiled.evidence?.writerSha256).not.toBe(row.sha256);
        if (!compiled.compileRequest || !compiled.compileResult?.compiled)
          throw new Error('Actual compile artifact required.');
        // Authored fixture layout: 100 mm panels, 50 mm writer spacing, 10 mm allowance.
        // Move BACK by exactly -70 mm to join its drawn left seam to FRONT's right seam.
        // Constants are fixture intent, never fitted from a successful seal or nearest geometry.
        const placed = await buildDxfGarmentAssemblyExplicitPlacementStageV1({
          schemaVersion: DXF_GARMENT_ASSEMBLY_EXPLICIT_PLACEMENT_STAGE_V1,
          sourceRequest: compiled.compileRequest,
          sourceArtifact: compiled.compileResult.artifact,
          expectedSourceInputSha256: compiled.compileResult.artifact.sourceEvidence.inputSha256,
          placements: [
            {
              pieceId: 'FRONT',
              sourceOriginM: [0, 0, 0],
              rotationRowMajor: [1, 0, 0, 0, 1, 0, 0, 0, 1],
              translationM: [0, 0, 0],
            },
            {
              pieceId: 'BACK',
              sourceOriginM: [0.15, 0, 0],
              rotationRowMajor: [1, 0, 0, 0, 1, 0, 0, 0, 1],
              translationM: [0.08, 0, 0],
            },
          ],
        });
        expect(placed.ok, JSON.stringify(placed.blockers)).toBe(true);
        if (!placed.ok || !placed.artifact.sealedSimulation)
          throw new Error(JSON.stringify(placed.blockers));
        expect(
          (await validateSealedSimulationPackageV5V1(placed.artifact.sealedSimulation)).ok,
        ).toBe(true);
        expect(placed.artifact.placedSimulation.material).toEqual(
          compiled.compileResult.artifact.compiledSimulation.material,
        );
        expect(placed.artifact.placedSimulation.constraints).toEqual(
          compiled.compileResult.artifact.compiledSimulation.constraints,
        );
      } finally {
        compiler.dispose();
      }
      const cancelled = await owner.run(
        { schemaVersion: DXF_PRODUCT_SAVED_FOREIGN_REPROCESS_REQUEST_V1, row },
        (progress) => {
          if (progress.stage === 'revalidate' && progress.done === 100) owner.cancel();
        },
      );
      expect(cancelled).toMatchObject({
        ok: false,
        sourceOwner: null,
        blockers: [{ code: 'cancelled' }],
      });
    } finally {
      owner.dispose();
      host.dispose();
    }
  }, 120000);
});
