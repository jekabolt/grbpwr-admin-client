import { writeObservedPlacementEvidenceV1 } from '../../../tests/cloth/fixtures/observed-placement-v3/write-evidence';
import { expect, it, vi } from 'vitest';
import {
  createPatternImportDxfProductSavedCanonicalMediumAnnularSeedV1,
  withPatternImportDxfProductSavedCanonicalMediumAnnularSavedSessionInputsV2,
} from 'lib/cloth/domain/pattern-import-dxf-product-saved-canonical-medium-annular-evidence-v1.test-fixture';
import {
  PATTERN_IMPORT_DXF_PRODUCT_SAVED_GARMENT_MESH_INGRESS_REQUEST_V1,
  type PatternImportDxfProductSavedGarmentMeshIngressRequestV1,
} from 'lib/cloth/domain/pattern-import-dxf-product-saved-garment-mesh-ingress-v1';
import {
  getSavedModelDisplayedTriangleBodyLifetimeV2,
  projectSavedModelDisplayedTriangleBodyV2,
} from 'components/managers/models/components/saved-model-displayed-triangle-body-owner-v2';
import { withObservedPlacementDisplayedBodyPairSourceV1 } from './beta-skirt-saved-annular-observed-placement-displayed-body-product-placement-v1.test-fixture';
import {
  getBetaSkirtSavedAnnularObservedPlacementDisplayedBodyProductPlacementLifetimeV1 as lifetime,
  disposeBetaSkirtSavedAnnularObservedPlacementDisplayedBodyProductPlacementV1 as dispose,
  projectBetaSkirtSavedAnnularObservedPlacementDisplayedBodyProductPlacementV1 as project,
  type BetaSkirtSavedAnnularObservedPlacementDisplayedBodyProductPlacementOwnerV1,
} from './beta-skirt-saved-annular-observed-placement-displayed-body-product-placement-v1';
import {
  createPatternImportDxfProductSavedAnnularObservedPlacementGarmentSessionV1,
  buildPatternImportDxfProductSavedAnnularObservedPlacementGarmentObservedBodyPairV1,
} from './pattern-import-dxf-product-saved-annular-observed-placement-garment-session-v1';

// Only nominal asset/station ports are synthetic. Real source compiler/receipt/local frame,
// V3 reader, garment, captured cube input/adopter, fixed dispatcher, section/collision/V42 execute.
// A synthetic closed cube is host-observation evidence only, never actual V9/viewport/runtime.
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

async function withSource<T>(
  consume: (request: PatternImportDxfProductSavedGarmentMeshIngressRequestV1) => Promise<T>,
) {
  const seed = await createPatternImportDxfProductSavedCanonicalMediumAnnularSeedV1();
  return withPatternImportDxfProductSavedCanonicalMediumAnnularSavedSessionInputsV2(
    seed,
    ({ sourceOwner, compositionRequest, targetEdgeMm }) =>
      consume({
        schemaVersion: PATTERN_IMPORT_DXF_PRODUCT_SAVED_GARMENT_MESH_INGRESS_REQUEST_V1,
        sourceOwner,
        compositionRequest,
        targetEdgeMm,
      }),
  );
}

it('binds actual private compile generation to genuine observed V3 pair and preserves borrowed peers on replacement', async () => {
  await withObservedPlacementDisplayedBodyPairSourceV1(
    async ({ body, target, garmentRequest, state }) => {
      const session = createPatternImportDxfProductSavedAnnularObservedPlacementGarmentSessionV1();
      const children: BetaSkirtSavedAnnularObservedPlacementDisplayedBodyProductPlacementOwnerV1[] =
        [];
      try {
        await withSource(async (first) => {
          expect((await session.consume(first)).ok).toBe(true);
          await withSource(async (second) => {
            const compiled = await session.consume(second);
            if (!compiled.ok) throw new Error(JSON.stringify(compiled));
            expect(compiled.generation).toBe(2);
            expect(body.binding.generation).toBe(1);
            const advanced = await session.advanceSavedGarment({
              expectedGeneration: compiled.generation,
              readCurrentPlacement: garmentRequest.readCurrentPlacement,
            });
            if (!advanced.ok) throw new Error(JSON.stringify(advanced));
            expect(advanced.report.bindings.composerV2CanonicalSha256).toBe(
              compiled.compile.composerSnapshot.seal.canonicalSha256,
            );
            const request = {
              expectedGeneration: compiled.generation,
              displayedBodyOwner: body.bodyOwner,
              displayedBodyBinding: body.binding,
            };
            expect(
              await buildPatternImportDxfProductSavedAnnularObservedPlacementGarmentObservedBodyPairV1(
                session,
                { ...request, expectedGeneration: body.binding.generation },
              ),
            ).toMatchObject({ ok: false, code: 'stale-generation' });
            const caller = new AbortController();
            const paired =
              await buildPatternImportDxfProductSavedAnnularObservedPlacementGarmentObservedBodyPairV1(
                session,
                request,
                caller.signal,
              );
            if (!paired.ok) throw new Error(JSON.stringify(paired));
            children.push(paired.owner);
            expect(paired).toMatchObject({
              generation: compiled.generation,
              sourceContextBound: true,
            });
            expect(paired.report.hostCompileBinding).toEqual({
              generation: compiled.generation,
              provenance: 'host-compile-session-supplied',
              authenticatedByGarmentOwner: false,
            });
            expect(paired.report.source.garmentReport.canonicalSha256).toBe(
              advanced.report.canonicalSha256,
            );
            expect(paired.report.source.observedTarget).toEqual({
              target: target.target,
              canonicalSha256: target.canonicalSha256,
            });
            expect(paired.report.claims).toMatchObject({
              persistedObservedTargetMatched: true,
              observedBodyTargetConfirmed: true,
              runtimeAuthority: false,
            });
            expect(paired.report.blockers).not.toContain('unconfirmed-observed-body-target');
            expect(paired.report.blockers).toContain('solver-source-admission-not-issued');
            expect(await project(paired.owner)).not.toBeNull();
            writeObservedPlacementEvidenceV1(
              'cloth-observed-placement-session-pair-report.json',
              JSON.stringify(
                {
                  scope:
                    'genuine owner/compiler/reader/pair wiring; synthetic cube and nominal asset/station ports; no actual V9, viewport, GPU or runtime admission',
                  compileGeneration: compiled.generation,
                  bodyGeneration: body.binding.generation,
                  report: paired.report,
                },
                null,
                2,
              ),
            );
            caller.abort();
            expect(lifetime(paired.owner)).toBeNull();
            expect(await session.projectLatestGarment(compiled.generation)).not.toBeNull();
            expect(
              getSavedModelDisplayedTriangleBodyLifetimeV2(body.bodyOwner, body.binding),
            ).not.toBeNull();
            const next =
              await buildPatternImportDxfProductSavedAnnularObservedPlacementGarmentObservedBodyPairV1(
                session,
                request,
              );
            if (!next.ok) throw new Error(JSON.stringify(next));
            children.push(next.owner);
            await withSource(async (third) => {
              const replacement = await session.consume(third);
              if (!replacement.ok) throw new Error(JSON.stringify(replacement));
              expect(replacement.generation).toBe(3);
              expect(lifetime(next.owner)).toBeNull();
              expect(
                await projectSavedModelDisplayedTriangleBodyV2(body.bodyOwner, body.binding),
              ).not.toBeNull();
              expect(
                (
                  await session.advanceSavedGarment({
                    expectedGeneration: replacement.generation,
                    readCurrentPlacement: garmentRequest.readCurrentPlacement,
                  })
                ).ok,
              ).toBe(true);
              const final =
                await buildPatternImportDxfProductSavedAnnularObservedPlacementGarmentObservedBodyPairV1(
                  session,
                  { ...request, expectedGeneration: replacement.generation },
                );
              if (!final.ok) throw new Error(JSON.stringify(final));
              children.push(final.owner);
              body.input.dispose();
              expect(lifetime(final.owner)).toBeNull();
              expect(await session.projectLatestGarment(replacement.generation)).not.toBeNull();
              expect(state.reads).toBeGreaterThan(10);
            });
          });
        });
      } finally {
        for (const child of children) dispose(child);
        session.dispose();
      }
    },
  );
}, 90_000);
