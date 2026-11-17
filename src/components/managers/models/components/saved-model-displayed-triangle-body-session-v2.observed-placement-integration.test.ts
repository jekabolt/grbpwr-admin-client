import { writeObservedPlacementEvidenceV1 } from '../../../../../tests/cloth/fixtures/observed-placement-v3/write-evidence';
import { describe, expect, it, vi } from 'vitest';
import {
  createPatternImportDxfProductSavedCanonicalMediumAnnularSeedV1,
  withPatternImportDxfProductSavedCanonicalMediumAnnularSavedSessionInputsV2,
} from 'lib/cloth/domain/pattern-import-dxf-product-saved-canonical-medium-annular-evidence-v1.test-fixture';
import { PATTERN_IMPORT_DXF_PRODUCT_SAVED_GARMENT_MESH_INGRESS_REQUEST_V1 } from 'lib/cloth/domain/pattern-import-dxf-product-saved-garment-mesh-ingress-v1';
import {
  createPatternImportDxfProductSavedAnnularObservedPlacementGarmentSessionV1,
  type PatternImportDxfProductSavedAnnularObservedPlacementGarmentSessionV1,
  type PatternImportDxfProductSavedAnnularObservedPlacementGarmentConsumeResultV1,
} from 'components/cloth-simulation-spike/pattern-import-dxf-product-saved-annular-observed-placement-garment-session-v1';
import { withObservedPlacementDisplayedBodyPairSourceV1 } from 'components/cloth-simulation-spike/beta-skirt-saved-annular-observed-placement-displayed-body-product-placement-v1.test-fixture';
import {
  getBetaSkirtSavedAnnularObservedPlacementDisplayedBodyProductPlacementLifetimeV1,
  projectBetaSkirtSavedAnnularObservedPlacementDisplayedBodyProductPlacementV1,
} from 'components/cloth-simulation-spike/beta-skirt-saved-annular-observed-placement-displayed-body-product-placement-v1';
import {
  buildCurrentSavedModelDisplayedTriangleBodyGarmentPairV1,
  buildCurrentSavedModelDisplayedTriangleBodyObservedPlacementGarmentPairV1,
  createSavedModelDisplayedTriangleBodySessionV2,
} from './saved-model-displayed-triangle-body-session-v2';

// Three nominal asset/station ports and the cube/model/transport are explicit CPU fixtures.
// Compiler, writer receipt, V3 fresh-read registry, body input/adoption, garment/pair kernels and
// both fixed private dispatchers are genuine. No actual V9, viewport or runtime acceptance.
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

type Compiled = Extract<
  PatternImportDxfProductSavedAnnularObservedPlacementGarmentConsumeResultV1,
  { ok: true }
>;
async function withFreshCompile<T>(
  source: PatternImportDxfProductSavedAnnularObservedPlacementGarmentSessionV1,
  consume: (result: Compiled) => Promise<T>,
) {
  const seed = await createPatternImportDxfProductSavedCanonicalMediumAnnularSeedV1();
  return withPatternImportDxfProductSavedCanonicalMediumAnnularSavedSessionInputsV2(
    seed,
    async (input) => {
      const compiled = await source.consume({
        schemaVersion: PATTERN_IMPORT_DXF_PRODUCT_SAVED_GARMENT_MESH_INGRESS_REQUEST_V1,
        sourceOwner: input.sourceOwner,
        compositionRequest: input.compositionRequest,
        targetEdgeMm: input.targetEdgeMm,
      });
      if (!compiled.ok) throw new Error(JSON.stringify(compiled));
      return consume(compiled);
    },
  );
}

describe('private V3 compile → observed body consumer chain (synthetic cube host)', () => {
  it('uses real private generation and exact durable target, then revokes only descendants', async () => {
    await withObservedPlacementDisplayedBodyPairSourceV1(async (fixture) => {
      const source = createPatternImportDxfProductSavedAnnularObservedPlacementGarmentSessionV1();
      const body = createSavedModelDisplayedTriangleBodySessionV2(fixture.body.readCurrentModel);
      try {
        await body.observe(fixture.body.input);
        await withFreshCompile(source, async () =>
          withFreshCompile(source, async (compiled) => {
            expect(compiled.generation).toBe(2);
            expect(body.getSnapshot().generation).toBe(1);
            const advanced = await source.advanceSavedGarment({
              expectedGeneration: compiled.generation,
              readCurrentPlacement: fixture.garmentRequest.readCurrentPlacement,
            });
            if (!advanced.ok) throw new Error(JSON.stringify(advanced));
            const before = await source.projectLatestGarment(compiled.generation);
            if (!before?.projection.normalizedMaterial) throw new Error('Local material missing.');
            const rest = new Uint8Array(
              before.projection.normalizedMaterial.normalizedV5.simulation.constraints.continuumStrain.triangleRestFrames,
            ).slice();
            expect(
              await buildCurrentSavedModelDisplayedTriangleBodyGarmentPairV1(
                body,
                source,
                compiled.generation,
              ),
            ).toMatchObject({ ok: false, sourceContextBound: false });
            expect(
              await buildCurrentSavedModelDisplayedTriangleBodyObservedPlacementGarmentPairV1(
                body,
                source,
                1,
              ),
            ).toMatchObject({ ok: false, generation: 2, code: 'stale-generation' });
            const pair =
              await buildCurrentSavedModelDisplayedTriangleBodyObservedPlacementGarmentPairV1(
                body,
                source,
                compiled.generation,
              );
            if (!pair.ok) throw new Error(JSON.stringify(pair));
            expect(pair.sourceContextBound).toBe(true);
            expect(pair.generation).toBe(2);
            expect(pair.report.hostCompileBinding.generation).toBe(2);
            expect(pair.report.bodyBinding.generation).toBe(1);
            expect(pair.report.source).toMatchObject({
              kind: 'saved-annular-observed-placement-garment-v1',
              garmentReportSha256: advanced.report.canonicalSha256,
              placementSidecarSha256: advanced.report.bindings.placementSidecarSha256,
              persistedTargetDisposition: 'fresh-observed-target-matched',
              observedTarget: { canonicalSha256: fixture.target.canonicalSha256 },
            });
            expect(pair.report.claims).toMatchObject({
              observedBodyTargetConfirmed: true,
              runtimeAuthority: false,
            });
            expect(pair.report.blockers).not.toContain('unconfirmed-observed-body-target');
            expect(pair.report.blockers).toContain('solver-source-admission-not-issued');
            const projected =
              await projectBetaSkirtSavedAnnularObservedPlacementDisplayedBodyProductPlacementV1(
                pair.owner,
              );
            expect(projected?.assemblyOrderSeamPairs).toEqual(before.projection.mapping.seamPairs);
            expect(projected?.waistPinVertexIndices).toEqual(
              before.projection.mapping.pinnedWaistVertexIndices,
            );
            const lifetime =
              getBetaSkirtSavedAnnularObservedPlacementDisplayedBodyProductPlacementLifetimeV1(
                pair.owner,
              )!;
            expect(lifetime.aborted).toBe(false);
            await body.observe(null);
            expect(lifetime.aborted).toBe(true);
            expect(
              await projectBetaSkirtSavedAnnularObservedPlacementDisplayedBodyProductPlacementV1(
                pair.owner,
              ),
            ).toBeNull();
            const retained = await source.projectLatestGarment(compiled.generation);
            expect(retained?.projection.report.canonicalSha256).toBe(
              advanced.report.canonicalSha256,
            );
            expect(
              new Uint8Array(
                retained!.projection.normalizedMaterial!.normalizedV5.simulation.constraints.continuumStrain.triangleRestFrames,
              ),
            ).toEqual(rest);
            expect(fixture.body.input.isCurrent()).toBe(true);
            await body.observe(fixture.body.input);
            const replacement = await body.buildCurrentObservedPlacementGarmentPair(
              source,
              compiled.generation,
            );
            if (!replacement.ok) throw new Error(JSON.stringify(replacement));
            expect(replacement.report.source.observedTarget.canonicalSha256).toBe(
              fixture.target.canonicalSha256,
            );
            // The consumer advances its epoch; a newly allocated adopter starts its own local
            // generation at1. Neither counter belongs in the persisted stable target identity.
            expect(body.getSnapshot().generation).toBe(3);
            expect(replacement.report.bodyBinding.generation).toBe(1);
            const replacementLifetime =
              getBetaSkirtSavedAnnularObservedPlacementDisplayedBodyProductPlacementLifetimeV1(
                replacement.owner,
              )!;
            const bodyBefore = body.getSnapshot();
            await withFreshCompile(source, async (third) => {
              expect(third.generation).toBe(3);
              expect(replacementLifetime.aborted).toBe(true);
              expect(body.getSnapshot()).toBe(bodyBefore);
              expect((await body.projectCurrentBody()).status).toBe('projected');
            });
            expect(fixture.state.reads).toBeGreaterThan(8);
            writeObservedPlacementEvidenceV1(
              'cloth-observed-v3-private-consumer-integration-report.json',
              JSON.stringify(
                {
                  provenance: {
                    actualV9: false,
                    viewportAcceptance: false,
                    backendTransport: false,
                    runtimeAdmission: false,
                    body: 'explicit synthetic cube through genuine producer/adopter',
                    compiler: 'genuine default saved compiler and receipt',
                    read: 'genuine V3 verifier over fixture transport',
                  },
                  sourceGeneration: compiled.generation,
                  firstBodyGeneration: pair.report.bodyBinding.generation,
                  reboundBodyGeneration: replacement.report.bodyBinding.generation,
                  reboundConsumerGeneration: body.getSnapshot().generation,
                  durableTargetSha: fixture.target.canonicalSha256,
                  placementReads: fixture.state.reads,
                  lifecycle: {
                    firstChildRevoked: lifetime.aborted,
                    replacementChildRevoked: replacementLifetime.aborted,
                    borrowedBodyInputCurrent: fixture.body.input.isCurrent(),
                  },
                  firstPairReport: pair.report,
                  reboundPairReport: replacement.report,
                },
                null,
                2,
              ) + '\n',
            );
          }),
        );
      } finally {
        source.dispose();
        body.dispose();
      }
    });
  }, 120_000);
});
