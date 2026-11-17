import { writeObservedPlacementEvidenceV1 } from '../../../../../tests/cloth/fixtures/observed-placement-v3/write-evidence';
import { Buffer } from 'node:buffer';
import { describe, expect, it, vi } from 'vitest';
import {
  withObservedFirstSaveFixtureV3,
  withFirstSaveSourceV3,
} from 'components/cloth-simulation-spike/pattern-import-dxf-product-saved-annular-observed-placement-first-save-v3.test-fixture';
import {
  getObservedPlacementSidecarIssuedLifetimeV3,
  projectObservedPlacementSidecarIssuedV3,
} from 'components/cloth-simulation-spike/observed-placement-sidecar-issuer-v3';
import {
  getBetaSkirtSavedAnnularObservedPlacementDisplayedBodyProductPlacementLifetimeV1,
  projectBetaSkirtSavedAnnularObservedPlacementDisplayedBodyProductPlacementV1,
} from 'components/cloth-simulation-spike/beta-skirt-saved-annular-observed-placement-displayed-body-product-placement-v1';
import { decodePatternImportDxfProductCompositeSidecarV3 } from 'lib/cloth/domain/pattern-import-dxf-product-composite-sidecar-v3';
import {
  getBetaSkirtSavedAnnularObservedPlacementDisplayedBodyWorldInitialPreflightLifetimeV1,
  projectBetaSkirtSavedAnnularObservedPlacementDisplayedBodyWorldInitialPreflightV1,
} from 'components/cloth-simulation-spike/beta-skirt-saved-annular-observed-placement-displayed-body-world-initial-preflight-v1';
import {
  createSavedModelDisplayedTriangleBodySessionV2,
  issueCurrentSavedModelObservedPlacementV3,
} from './saved-model-displayed-triangle-body-session-v2';

// Actual owners, private compiler/row/D0/issuer, existing CAS transaction and fresh V3 verifier.
// Only cube/model/RPC storage and nominal station assets are fixtures; no backend/native acceptance.
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

describe('genuine private first-save consumer chain with fixture transport', () => {
  it('starts without Placement, performs one existing CAS and restores exact V3 through private owners', async () => {
    await withObservedFirstSaveFixtureV3(async (f) => {
      expect(f.initialComponentKinds).not.toContain('multiseam-placement-v2');
      expect(f.initialComponentKinds).not.toContain('multiseam-placement-v3');
      const body = createSavedModelDisplayedTriangleBodySessionV2(f.body.readCurrentModel);
      try {
        await body.observe(f.body.input);
        const target = await body.projectCurrentPlacementTarget();
        if (!target.ok) throw new Error(target.detail);
        expect(target.canonicalSha256).toBe(f.target.canonicalSha256);
        await withFirstSaveSourceV3(async (input) => {
          const compiled = await f.session.consume(input);
          if (!compiled.ok) throw new Error(JSON.stringify(compiled));
          expect(compiled.generation).toBe(2);
          expect(body.getSnapshot().generation).toBe(1);
          expect(await f.session.projectLatestGarment(compiled.generation)).toBeNull();
          const issued = await issueCurrentSavedModelObservedPlacementV3(body, f.session, {
            ...f.intent,
            expectedGeneration: compiled.generation,
            confirmedTargetSha256: target.canonicalSha256,
          });
          if (!issued.ok) throw new Error(JSON.stringify(issued));
          expect(issued.generation).toBe(2);
          expect(issued.sourceContextBound).toBe(true);
          const issuedLifetime = getObservedPlacementSidecarIssuedLifetimeV3(issued.owner)!;
          expect(issuedLifetime.aborted).toBe(false);
          const save = await f.bindSaver(issued.owner);
          const stored = await save.saver.save(save.saveRequest);
          if (!stored.ok) throw new Error(JSON.stringify(stored));
          expect(stored.writeOutcome).toBe('verified');
          expect(f.put).toHaveBeenCalledTimes(1);
          expect(f.get.mock.calls.length).toBeGreaterThanOrEqual(2);
          const outer = await decodePatternImportDxfProductCompositeSidecarV3(
            new Uint8Array(Buffer.from(f.storage.stored.sidecarBytes!, 'base64')),
          );
          if (!outer.ok) throw new Error(JSON.stringify(outer));
          expect(
            outer.document.components.filter((c) => c.kind === 'multiseam-placement-v3'),
          ).toHaveLength(1);
          expect(outer.document.components.some((c) => c.kind === 'multiseam-placement-v2')).toBe(
            false,
          );
          const advanced = await f.session.advanceSavedGarment({
            expectedGeneration: compiled.generation,
            readCurrentPlacement: save.freshRead,
          });
          if (!advanced.ok) throw new Error(JSON.stringify(advanced));
          expect(issuedLifetime.aborted).toBe(true);
          expect(await projectObservedPlacementSidecarIssuedV3(issued.owner)).toBeNull();
          expect(advanced.report.persistedPlacement.authoring.observedTarget.canonicalSha256).toBe(
            target.canonicalSha256,
          );
          const pair = await body.buildCurrentObservedPlacementGarmentPair(
            f.session,
            compiled.generation,
          );
          if (!pair.ok) throw new Error(JSON.stringify(pair));
          expect(pair.sourceContextBound).toBe(true);
          expect(pair.report.claims).toMatchObject({
            observedBodyTargetConfirmed: true,
            runtimeAuthority: false,
          });
          expect(pair.report.source.observedTarget.canonicalSha256).toBe(target.canonicalSha256);
          expect(pair.report.blockers).toContain('solver-source-admission-not-issued');
          const pairLifetime =
            getBetaSkirtSavedAnnularObservedPlacementDisplayedBodyProductPlacementLifetimeV1(
              pair.owner,
            )!;
          const projected =
            await projectBetaSkirtSavedAnnularObservedPlacementDisplayedBodyProductPlacementV1(
              pair.owner,
            );
          expect(projected).not.toBeNull();
          const world = await body.buildCurrentObservedPlacementWorldInitialPreflight(
            f.session,
            compiled.generation,
          );
          if (!world.ok) throw new Error(JSON.stringify(world));
          expect(world).toMatchObject({ generation: 2, sourceContextBound: true });
          expect(world.report.bindings.garmentReportSha256).toBe(advanced.report.canonicalSha256);
          expect(world.report.worldInitialChecksPassed).toBe(true);
          expect(world.report.counts).toMatchObject({
            assemblyOrderSeamPairs: 34,
            zeroInverseMassPins: 82,
            positiveInverseMassParticles: 498,
          });
          expect(world.report.upstreamPair.source.observedTarget.canonicalSha256).toBe(
            target.canonicalSha256,
          );
          expect(world.report.claims.runtimeAuthority).toBe(false);
          expect(world.report.blockers).toContain('solver-source-admission-not-issued');
          const worldProjection =
            await projectBetaSkirtSavedAnnularObservedPlacementDisplayedBodyWorldInitialPreflightV1(
              world.owner,
            );
          expect(worldProjection?.initialWorldPositionsInvMassKg.length).toBe(580 * 4);
          expect(worldProjection?.localPositions3M.length).toBe(580 * 3);
          const worldLifetime =
            getBetaSkirtSavedAnnularObservedPlacementDisplayedBodyWorldInitialPreflightLifetimeV1(
              world.owner,
            )!;
          expect(worldLifetime.aborted).toBe(false);
          await body.observe(null);
          expect(worldLifetime.aborted).toBe(true);
          expect(
            await projectBetaSkirtSavedAnnularObservedPlacementDisplayedBodyWorldInitialPreflightV1(
              world.owner,
            ),
          ).toBeNull();
          expect(pairLifetime.aborted).toBe(true);
          expect(
            (await f.session.projectLatestGarment(compiled.generation))?.projection.report
              .canonicalSha256,
          ).toBe(advanced.report.canonicalSha256);
          expect(f.body.input.isCurrent()).toBe(true);
          writeObservedPlacementEvidenceV1(
            'cloth-observed-first-save-world-consumer-chain-report-20261117.json',
            JSON.stringify(
              {
                provenance: {
                  source: 'genuine saved compiler/private exact row and D0',
                  body: 'genuine capture/adoption over synthetic cube',
                  storage: 'existing CAS and fresh read over fixture RPC',
                  backendAcceptance: false,
                  actualV9: false,
                  runtimeAdmission: false,
                },
                sourceGeneration: compiled.generation,
                bodyConsumerGenerationAtIssue: 1,
                initialComponentKinds: f.initialComponentKinds,
                finalComponentKinds: outer.document.components.map((c) => c.kind),
                putCalls: f.put.mock.calls.length,
                getCalls: f.get.mock.calls.length,
                writeOutcome: stored.writeOutcome,
                targetSha: target.canonicalSha256,
                outerSha: f.storage.stored.sidecarSha256,
                issuerRevokedAfterAdvance: issuedLifetime.aborted,
                pairRevokedAfterBodyRemoval: pairLifetime.aborted,
                worldPreflightRevokedAfterBodyRemoval: worldLifetime.aborted,
                worldPreflightReport: world.report,
                garmentReport: advanced.report,
                pairReport: pair.report,
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
