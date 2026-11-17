import { afterEach, describe, expect, it, vi } from 'vitest';
import { abortableAdminService } from 'api/api';
import {
  createPatternImportDxfProductSavedPlacementContextV1,
  createPatternImportDxfProductSavedPlacementProductionContextV1,
} from 'components/managers/tech-card/components/pattern-import/phase-e-workbench-v2/saved-placement-context-v1';
import { createSavedModelDisplayedTriangleBodySessionV2 } from 'components/managers/models/components/saved-model-displayed-triangle-body-session-v2';
import { createSavedObservedPhysicalHostV1 } from './saved-observed-physical-host-v1';
import { prepareObservedHostTransportV1 } from './saved-observed-physical-host-v1.test-fixture';
import {
  withFirstSaveSourceV3,
  withObservedFirstSaveFixtureV3,
} from './pattern-import-dxf-product-saved-annular-observed-placement-first-save-v3.test-fixture';

// Real compiler/local-frame, issuer, context, CAS/fresh read, garment/pair/world/runtime gates.
// Only AO/storage RPC and synthetic cube/nominal station assets are fixtures. No GPU admission.
vi.mock('api/api', () => ({ abortableAdminService: vi.fn() }));
vi.mock(
  'components/managers/tech-card/components/pattern-import/phase-e-workbench-v2/saved-placement-context-v1',
  async (original) => ({
    ...(await original<
      typeof import('components/managers/tech-card/components/pattern-import/phase-e-workbench-v2/saved-placement-context-v1')
    >()),
    createPatternImportDxfProductSavedPlacementProductionContextV1: vi.fn(),
  }),
);
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
afterEach(() => vi.clearAllMocks());

describe('observed physical host reaches actual runtime admission', () => {
  it.each(['panel-stop', 'caller-abort'] as const)(
    'preserves the source/preview cancellation boundary on first local-frame publication: %s',
    async (action) => {
      await withObservedFirstSaveFixtureV3(async (f) => {
        const body = createSavedModelDisplayedTriangleBodySessionV2(f.body.readCurrentModel);
        await body.observe(f.body.input);
        const host = createSavedObservedPhysicalHostV1({ row: f.seed.row, bodySession: body });
        const caller = new AbortController();
        let firstReady = false;
        let compilingPublications = 0;
        let publishedCompile: ReturnType<typeof host.latestCompile> = null;
        const unsubscribe = host.subscribe(() => {
          const snapshot = host.getSnapshot();
          if (snapshot.status === 'compiling') compilingPublications += 1;
          if (snapshot.status !== 'local-frame-ready' || firstReady) return;
          // Arm once before the reentrant call: stop may publish the same ready status itself.
          firstReady = true;
          publishedCompile = host.latestCompile();
          // This is the actual host publication seam used by panel effect cleanup. It does not
          // simulate React or claim browser acceptance; the DXF compiler and source are genuine.
          if (action === 'panel-stop') host.stop();
          else caller.abort();
        });
        try {
          await withFirstSaveSourceV3(async (request) => {
            vi.mocked(
              createPatternImportDxfProductSavedPlacementProductionContextV1,
            ).mockImplementation((input) => {
              const prepared = prepareObservedHostTransportV1(f, request, input.compiled);
              return createPatternImportDxfProductSavedPlacementContextV1(input, {
                readSavedAssemblySnapshot: async () => (await prepared)(),
              });
            });
            await host.downstream.ready(caller.signal);
            const pending = host.downstream.consume(request, caller.signal);
            if (action === 'panel-stop') {
              const result = await pending;
              expect(result.ok).toBe(true);
              expect(host.getSnapshot().status).toBe('local-frame-ready');
              expect(caller.signal.aborted).toBe(false);
            } else {
              await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
              expect(caller.signal.aborted).toBe(true);
            }
            expect(firstReady).toBe(true);
            expect(publishedCompile).not.toBeNull();
            expect(host.latestCompile()).toEqual(publishedCompile);
            expect(compilingPublications).toBe(1);
            await host.waitUntilIdle(new AbortController().signal);
            // An unrelated pane cleanup must not require replaying the consumed saved source.
            // Conversely, explicit cancellation must never make that source reusable.
            await expect(
              host.downstream.consume(request, new AbortController().signal),
            ).rejects.toThrow('new cloth source');
            expect(compilingPublications).toBe(1);
            expect(host.latestCompile()).toEqual(publishedCompile);
            expect(f.put).not.toHaveBeenCalled();
          });
        } finally {
          unsubscribe();
          host.dispose();
          expect(body.getSnapshot().status).toBe('observed-body-bound');
          body.dispose();
        }
      });
    },
    120_000,
  );

  it('uses one source handoff, saves once, reloads exact placement and retains the physical refusal', async () => {
    await withObservedFirstSaveFixtureV3(async (f) => {
      const body = createSavedModelDisplayedTriangleBodySessionV2(f.body.readCurrentModel);
      await body.observe(f.body.input);
      const host = createSavedObservedPhysicalHostV1({ row: f.seed.row, bodySession: body });
      try {
        await withFirstSaveSourceV3(async (request) => {
          vi.mocked(abortableAdminService).mockReturnValue({
            GetTechCardPatternSemanticSidecar: f.get,
            PutTechCardPatternSemanticSidecar: f.put,
          } as unknown as ReturnType<typeof abortableAdminService>);
          vi.mocked(
            createPatternImportDxfProductSavedPlacementProductionContextV1,
          ).mockImplementation((input) => {
            const prepared = prepareObservedHostTransportV1(f, request, input.compiled);
            return createPatternImportDxfProductSavedPlacementContextV1(input, {
              readSavedAssemblySnapshot: async () => (await prepared)(),
            });
          });
          const signal = new AbortController().signal;
          await host.downstream.ready(signal);
          const compiled = await host.downstream.consume(request, signal);
          expect(compiled.ok).toBe(true);
          expect('compile' in compiled).toBe(false);
          expect(host.getSnapshot().status).toBe('local-frame-ready');
          // A cancelled view effect may still be unwinding when its replacement mounts.
          const abandoned = new AbortController();
          const oldRead = host.authoring(abandoned.signal).then(
            () => 'resolved',
            () => 'cancelled',
          );
          abandoned.abort();
          host.stop();
          await host.waitUntilIdle(signal);
          expect(await oldRead).toBe('cancelled');
          const authoring = await host.authoring();
          expect(authoring.target.canonicalSha256).toBe(f.target.canonicalSha256);
          expect(authoring.metadata.existingObservedPlacement).toBeNull();
          const saved = await host.savePlacement({
            garment: f.garment,
            policy: f.policy,
            annularParameters: f.annularParameters,
            confirmedTargetSha256: authoring.target.canonicalSha256,
          });
          expect(saved.ok).toBe(true);
          expect(f.put).toHaveBeenCalledTimes(1);
          expect(await host.reloadPlacement()).toBe(true);
          const runtime = await host.buildRuntime();
          expect(runtime.ok).toBe(false);
          expect('owner' in runtime).toBe(false);
          expect(runtime.report?.gates).toMatchObject({
            worldInitialClear: true,
            sectionClear: false,
            exactBodyContactClear: false,
            signedContactSetEmpty: false,
          });
          expect(runtime.report?.claims.framesExecuted).toBe(false);
          expect(host.getSnapshot().status).toBe('blocked');
          expect((await body.projectCurrentBody()).status).toBe('projected');
          await expect(host.downstream.consume(request, signal)).rejects.toThrow(
            'new cloth source',
          );
          expect(f.put).toHaveBeenCalledTimes(1);
          const originalPut = f.put.getMockImplementation()!;
          f.put.mockImplementationOnce(async (request) => {
            await originalPut(request);
            throw new Error('Connection lost after the server committed the placement.');
          });
          const intent = {
            garment: f.garment,
            policy: f.policy,
            annularParameters: f.annularParameters,
            confirmedTargetSha256: authoring.target.canonicalSha256,
          };
          await expect(host.savePlacement(intent)).rejects.toThrow('not verified');
          expect(host.getSnapshot()).toMatchObject({
            requiresReload: true,
            writeOutcome: 'unknown',
            runtimeReport: null,
            frame16Report: null,
          });
          await expect(host.savePlacement(intent)).rejects.toThrow('Reload saved placement');
          expect(f.put).toHaveBeenCalledTimes(2);
          expect(await host.reloadPlacement()).toBe(true);
          expect(host.getSnapshot().requiresReload).toBe(false);
        });
      } finally {
        host.dispose();
        expect(body.getSnapshot().status).toBe('observed-body-bound');
        body.dispose();
      }
    });
  }, 120_000);
});
