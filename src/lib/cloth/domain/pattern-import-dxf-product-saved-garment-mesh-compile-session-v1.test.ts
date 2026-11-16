import { describe, expect, it, vi } from 'vitest';

import {
  PATTERN_IMPORT_DXF_PRODUCT_GARMENT_MESH_NATIVE_INGRESS_CLAIMS_V1,
  PATTERN_IMPORT_DXF_PRODUCT_GARMENT_MESH_NATIVE_INGRESS_REPORT_V1,
} from './pattern-import-dxf-product-garment-mesh-native-ingress-v1';
import { createPatternImportDxfProductGarmentMeshComposerRequestV2Fixture } from './pattern-import-dxf-product-garment-mesh-composer-v2.test-fixture';
import { createPatternImportDxfProductSavedGarmentMeshCompileSessionV1 } from './pattern-import-dxf-product-saved-garment-mesh-compile-session-v1';
import {
  PATTERN_IMPORT_DXF_PRODUCT_SAVED_GARMENT_MESH_INGRESS_CLAIMS_V1,
  PATTERN_IMPORT_DXF_PRODUCT_SAVED_GARMENT_MESH_INGRESS_V1,
} from './pattern-import-dxf-product-saved-garment-mesh-ingress-v1';

function report() {
  return Object.freeze({
    schemaVersion: PATTERN_IMPORT_DXF_PRODUCT_GARMENT_MESH_NATIVE_INGRESS_REPORT_V1,
    status: 'composer-request-ready' as const,
    bindings: Object.freeze({
      sourceFileId: 'fixture/source',
      sourceSha256: '1'.repeat(64),
      handoffCanonicalSha256: '2'.repeat(64),
      compositionCanonicalSha256: '3'.repeat(64),
      aggregateCanonicalSha256: '4'.repeat(64),
      sourceNativeAuthoritySha256: '5'.repeat(64),
      nativeStraightEdgesSha256: '6'.repeat(64),
    }),
    counts: Object.freeze({
      pieceCount: 2 as const,
      contourCount: 2 as const,
      seamCount: 2 as const,
      nativePathCount: 2 as const,
    }),
    claims: PATTERN_IMPORT_DXF_PRODUCT_GARMENT_MESH_NATIVE_INGRESS_CLAIMS_V1,
  });
}

describe('saved garment mesh compile session V1', () => {
  it('runs genuine Composer V2, retains its owner privately and exposes only mutable projections', async () => {
    const request = await createPatternImportDxfProductGarmentMeshComposerRequestV2Fixture();
    const buildIngress = vi.fn(async () => ({
      ok: true as const,
      schemaVersion: PATTERN_IMPORT_DXF_PRODUCT_SAVED_GARMENT_MESH_INGRESS_V1,
      request,
      report: report(),
      blockers: Object.freeze([]) as readonly [],
      claims: PATTERN_IMPORT_DXF_PRODUCT_SAVED_GARMENT_MESH_INGRESS_CLAIMS_V1,
    }));
    const session = createPatternImportDxfProductSavedGarmentMeshCompileSessionV1({ buildIngress });

    const result = await session.consume({} as never);

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.blockers[0].detail);
    expect(result.claims).toMatchObject({
      savedIngressImplementation: 'injected-test-seam',
      savedSourceOwnerConsumedByIngress: false,
      composerV2Executed: true,
      genuineComposerOwnerValidated: true,
      composerOwnerPrivatelyRetained: true,
      tableOwnsPhysicalMesh: false,
      runtimeAuthority: false,
      productionAuthority: false,
    });
    expect(buildIngress).toHaveBeenCalledOnce();
    const projectionA = session.projectLatest();
    const projectionB = session.projectLatest();
    expect(projectionA).not.toBeNull();
    expect(projectionB).not.toBeNull();
    expect(projectionA?.composerCanonicalSha256).toBe(result.composerSnapshot.seal.canonicalSha256);
    expect(projectionA?.phase2ArtifactSha256).toBe(
      result.composerSnapshot.seals.phase2ArtifactSha256,
    );
    expect(projectionA?.mesh.restPositions2Mm).not.toBe(projectionB?.mesh.restPositions2Mm);
    expect(projectionA?.mesh.triangles).not.toBe(projectionB?.mesh.triangles);
    expect(session.snapshot()).toMatchObject({ status: 'ready', generation: 1, disposed: false });

    session.dispose();
    expect(session.projectLatest()).toBeNull();
    expect(session.snapshot()).toMatchObject({ status: 'disposed', disposed: true });
    await expect(session.consume({} as never)).resolves.toMatchObject({
      ok: false,
      blockers: [{ code: 'session-disposed' }],
    });
  });

  it('revokes the old owner before a new blocked attempt can leave stale geometry current', async () => {
    const request = await createPatternImportDxfProductGarmentMeshComposerRequestV2Fixture(2);
    let attempt = 0;
    const session = createPatternImportDxfProductSavedGarmentMeshCompileSessionV1({
      buildIngress: async () => {
        attempt += 1;
        if (attempt === 1)
          return {
            ok: true as const,
            schemaVersion: PATTERN_IMPORT_DXF_PRODUCT_SAVED_GARMENT_MESH_INGRESS_V1,
            request,
            report: report(),
            blockers: Object.freeze([]) as readonly [],
            claims: PATTERN_IMPORT_DXF_PRODUCT_SAVED_GARMENT_MESH_INGRESS_CLAIMS_V1,
          };
        return {
          ok: false as const,
          schemaVersion: PATTERN_IMPORT_DXF_PRODUCT_SAVED_GARMENT_MESH_INGRESS_V1,
          request: null,
          report: null,
          blockers: Object.freeze([
            Object.freeze({ code: 'invalid-input' as const, detail: 'new source blocked' }),
          ]),
          claims: {} as never,
        };
      },
    });

    await expect(session.consume({} as never)).resolves.toMatchObject({ ok: true, generation: 1 });
    expect(session.projectLatest()).not.toBeNull();
    await expect(session.consume({} as never)).resolves.toMatchObject({
      ok: false,
      generation: 2,
      blockers: [{ code: 'saved-ingress-blocked' }],
      claims: { staleComposerOwnerRetainedAfterNewAttempt: false },
    });
    expect(session.projectLatest()).toBeNull();
    expect(session.snapshot()).toMatchObject({ status: 'blocked', generation: 2 });
  });

  it('fails closed on concurrent consumption without revoking the active attempt twice', async () => {
    let release: ((value: never) => void) | undefined;
    const pending = new Promise<never>((resolve) => {
      release = resolve;
    });
    const session = createPatternImportDxfProductSavedGarmentMeshCompileSessionV1({
      buildIngress: () => pending,
    });

    const first = session.consume({} as never);
    await expect(session.consume({} as never)).resolves.toMatchObject({
      ok: false,
      blockers: [{ code: 'session-busy' }],
    });
    release?.({
      ok: false,
      request: null,
      report: null,
      blockers: [{ code: 'invalid-input', detail: 'stopped' }],
      claims: {},
    } as never);
    await expect(first).resolves.toMatchObject({
      ok: false,
      generation: 1,
      blockers: [{ code: 'saved-ingress-blocked' }],
    });
  });

  it('never publishes an owner after cancellation or disposal crosses an async ingress boundary', async () => {
    const request = await createPatternImportDxfProductGarmentMeshComposerRequestV2Fixture(3);
    const success = {
      ok: true as const,
      schemaVersion: PATTERN_IMPORT_DXF_PRODUCT_SAVED_GARMENT_MESH_INGRESS_V1,
      request,
      report: report(),
      blockers: Object.freeze([]) as readonly [],
      claims: PATTERN_IMPORT_DXF_PRODUCT_SAVED_GARMENT_MESH_INGRESS_CLAIMS_V1,
    };

    let releaseCancelled: ((value: typeof success) => void) | undefined;
    const cancelledIngress = new Promise<typeof success>((resolve) => {
      releaseCancelled = resolve;
    });
    const cancelledSession = createPatternImportDxfProductSavedGarmentMeshCompileSessionV1({
      buildIngress: () => cancelledIngress,
    });
    const controller = new AbortController();
    const cancelled = cancelledSession.consume({} as never, controller.signal);
    controller.abort();
    releaseCancelled?.(success);
    await expect(cancelled).resolves.toMatchObject({
      ok: false,
      blockers: [{ code: 'session-cancelled' }],
    });
    expect(cancelledSession.projectLatest()).toBeNull();
    expect(cancelledSession.snapshot()).toMatchObject({ status: 'blocked', running: false });

    let releaseDisposed: ((value: typeof success) => void) | undefined;
    const disposedIngress = new Promise<typeof success>((resolve) => {
      releaseDisposed = resolve;
    });
    const disposedSession = createPatternImportDxfProductSavedGarmentMeshCompileSessionV1({
      buildIngress: () => disposedIngress,
    });
    const disposed = disposedSession.consume({} as never);
    disposedSession.dispose();
    releaseDisposed?.(success);
    await expect(disposed).resolves.toMatchObject({
      ok: false,
      blockers: [{ code: 'session-disposed' }],
    });
    expect(disposedSession.projectLatest()).toBeNull();
    expect(disposedSession.snapshot()).toMatchObject({ status: 'disposed', running: false });
  });
});
