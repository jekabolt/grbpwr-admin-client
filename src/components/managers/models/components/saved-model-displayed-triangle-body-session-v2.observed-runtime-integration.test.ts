import { describe, expect, it, vi } from 'vitest';
import { writeObservedPlacementEvidenceV1 } from '../../../../../tests/cloth/fixtures/observed-placement-v3/write-evidence';
import {
  withFirstSaveSourceV3,
  withObservedFirstSaveFixtureV3,
} from 'components/cloth-simulation-spike/pattern-import-dxf-product-saved-annular-observed-placement-first-save-v3.test-fixture';
import { getBetaSkirtSavedAnnularObservedPlacementDisplayedBodyWorldInitialPreflightLifetimeV1 } from 'components/cloth-simulation-spike/beta-skirt-saved-annular-observed-placement-displayed-body-world-initial-preflight-v1';
import { createSavedModelDisplayedTriangleBodySessionV2 } from './saved-model-displayed-triangle-body-session-v2';

// Real private source/row/D0/issuer/CAS/read/garment/pair/world/runtime-source gates.
// Only persisted model/transport, cube observation and nominal station assets are fixtures.
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

describe('private consumer reaches genuine observed runtime-source gates', () => {
  it('retains physical refusal after real first-save and leaves unrelated world, garment and body current', async () => {
    await withObservedFirstSaveFixtureV3(async (f) => {
      const body = createSavedModelDisplayedTriangleBodySessionV2(f.body.readCurrentModel);
      try {
        await body.observe(f.body.input);
        const target = await body.projectCurrentPlacementTarget();
        if (!target.ok) throw new Error(target.detail);
        await withFirstSaveSourceV3(async (input) => {
          const compiled = await f.session.consume(input);
          if (!compiled.ok) throw new Error(JSON.stringify(compiled));
          expect(compiled.generation).toBe(2);
          expect(body.getSnapshot().generation).toBe(1);
          const issued = await body.issueCurrentObservedPlacementV3(f.session, {
            ...f.intent,
            expectedGeneration: compiled.generation,
            confirmedTargetSha256: target.canonicalSha256,
          });
          if (!issued.ok) throw new Error(JSON.stringify(issued));
          const save = await f.bindSaver(issued.owner);
          const persisted = await save.saver.save(save.saveRequest);
          if (!persisted.ok) throw new Error(JSON.stringify(persisted));
          expect(f.put).toHaveBeenCalledTimes(1);
          const garment = await f.session.advanceSavedGarment({
            expectedGeneration: compiled.generation,
            readCurrentPlacement: save.freshRead,
          });
          if (!garment.ok) throw new Error(JSON.stringify(garment));
          const unrelatedWorld = await body.buildCurrentObservedPlacementWorldInitialPreflight(
            f.session,
            compiled.generation,
          );
          if (!unrelatedWorld.ok) throw new Error(JSON.stringify(unrelatedWorld));
          const unrelatedLife =
            getBetaSkirtSavedAnnularObservedPlacementDisplayedBodyWorldInitialPreflightLifetimeV1(
              unrelatedWorld.owner,
            )!;
          const result = await body.buildCurrentObservedPlacementRuntimeSource(
            f.session,
            compiled.generation,
          );
          expect(result, JSON.stringify(result)).toMatchObject({
            ok: false,
            owner: null,
            generation: 2,
            sourceContextBound: true,
          });
          if (result.ok)
            throw new Error('A physically blocked cube must not mint runtime authority.');
          expect(result.report).toBeDefined();
          expect(result.report?.gates).toMatchObject({
            worldInitialClear: true,
            // Independent replay is intentionally deferred until the physical prerequisites pass.
            independentWorldReplayMatched: false,
            sectionClear: false,
            exactBodyContactClear: false,
            signedContactSetEmpty: false,
          });
          expect(result.report?.claims).toMatchObject({
            diagnosticGpuInputQualified: false,
            framesExecuted: false,
            runtimeAuthority: false,
          });
          expect(result.report?.counts).toMatchObject({
            zeroInverseMassPins: 82,
            positiveInverseMassParticles: 498,
            assemblyOrderSeamPairs: 34,
          });
          expect(result.report?.upstreamPair.source.observedTarget.canonicalSha256).toBe(
            target.canonicalSha256,
          );
          expect(unrelatedLife.aborted).toBe(false);
          expect(
            (await f.session.projectLatestGarment(compiled.generation))?.projection.report
              .canonicalSha256,
          ).toBe(garment.report.canonicalSha256);
          expect((await body.projectCurrentBody()).status).toBe('projected');
          expect(f.body.input.isCurrent()).toBe(true);
          writeObservedPlacementEvidenceV1(
            'cloth-observed-runtime-consumer-blocked-cube-report.json',
            JSON.stringify(
              {
                scope:
                  'Real source-to-runtime admission; synthetic cube/model/transport/nominal stations. Physical refusal, no backend/viewport/GPU acceptance.',
                sourceGeneration: compiled.generation,
                bodyConsumerGeneration: body.getSnapshot().generation,
                writes: f.put.mock.calls.length,
                unrelatedWorldPreserved: !unrelatedLife.aborted,
                result,
              },
              null,
              2,
            ) + '\n',
          );
        });
      } finally {
        body.dispose();
      }
    });
  }, 120_000);
});
