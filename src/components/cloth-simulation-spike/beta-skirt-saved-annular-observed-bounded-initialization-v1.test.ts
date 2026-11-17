import { describe, expect, it, vi } from 'vitest';
import { withObservedPlacementGarmentSourceV1 } from 'lib/cloth/domain/pattern-import-dxf-product-saved-annular-observed-placement-garment-v1.test-fixture';
import * as garmentApi from 'lib/cloth/domain/pattern-import-dxf-product-saved-annular-observed-placement-garment-v1';
import {
  DXF_PRODUCT_TWO_PANEL_SKIRT_GARMENT_SEMANTICS_REQUEST_V1,
  buildDxfProductTwoPanelSkirtGarmentSemanticsV1,
  disposeDxfProductTwoPanelSkirtGarmentSemanticsV1,
} from 'lib/cloth/domain/dxf-product-two-panel-skirt-garment-semantics-v1';
import { OBSERVED_BOUNDED_RADIAL_INITIALIZATION_POLICY_V1 } from 'lib/cloth/domain/observed-bounded-radial-initialization-v1';
import { createObservedPlacementPairCubeBodyFixtureV1 } from './beta-skirt-saved-annular-observed-placement-displayed-body-product-placement-v1.test-fixture';
import { projectSavedModelObservedPlacementTargetV1 } from './saved-model-observed-placement-target-v1';
import * as pairApi from './beta-skirt-saved-annular-observed-placement-displayed-body-product-placement-v1';
import * as worldApi from './beta-skirt-saved-annular-observed-placement-displayed-body-world-initial-preflight-v1';
import * as runtimeApi from './beta-skirt-saved-annular-observed-placement-runtime-source-v1';
import { getSavedModelDisplayedTriangleBodyLifetimeV2 } from 'components/managers/models/components/saved-model-displayed-triangle-body-owner-v2';
import { deferredSessionValue } from 'components/managers/models/components/saved-model-displayed-triangle-body-session-v2.test-fixture';

// Only nominal station assets, persisted transport and the existing cube host observation are
// fixtures. DXF/AO, D0, V3 read, mapping, V5, section/contact/signed, seam-aware world and source
// gates all execute genuinely. No geometry is tuned, and no actual V11/V9 or GPU pass is claimed.
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

type Source = Parameters<Parameters<typeof withObservedPlacementGarmentSourceV1>[0]>[0];
type Policy = Source['state']['current']['placementAuthoring']['semantics']['policy'];
type Body = Awaited<ReturnType<typeof createObservedPlacementPairCubeBodyFixtureV1>>;
type GarmentOwner = garmentApi.PatternImportDxfProductSavedAnnularObservedPlacementGarmentOwnerV1;
type GarmentProjection =
  garmentApi.PatternImportDxfProductSavedAnnularObservedPlacementGarmentProjectionV1;
type Pair = Extract<
  Awaited<
    ReturnType<
      typeof pairApi.buildBetaSkirtSavedAnnularObservedPlacementDisplayedBodyProductPlacementV1
    >
  >,
  { ok: true }
>;

function policy(): Policy {
  return {
    ...OBSERVED_BOUNDED_RADIAL_INITIALIZATION_POLICY_V1,
    mapping: {
      id: 'canonical-medium-authored-annular-mapping',
      revision: 'canonical-medium-authored-annular-mapping-v1',
      kind: 'authored-annular-sector-conical',
    },
    authoredClearanceM: 0.008,
    clothThicknessM: 0.002,
    retention: {
      id: 'canonical-medium-waist-boundary-support',
      revision: 'canonical-medium-waist-boundary-support-v1',
      kind: 'waist-boundary-support',
    },
  };
}

async function projectGarment(owner: GarmentOwner): Promise<GarmentProjection> {
  const projected =
    await garmentApi.projectPatternImportDxfProductSavedAnnularObservedPlacementGarmentV1(owner);
  if (!projected) throw new Error('Expected current genuine saved garment.');
  return projected;
}

async function withSource<T>(
  consume: (
    context: Source & { body: Body; garmentOwner: GarmentOwner; baseline: GarmentProjection },
  ) => Promise<T>,
  authoredPolicy = policy(),
): Promise<T> {
  return withObservedPlacementGarmentSourceV1(async (source) => {
    const body = await createObservedPlacementPairCubeBodyFixtureV1();
    let garmentOwner: GarmentOwner | null = null;
    try {
      const target = await projectSavedModelObservedPlacementTargetV1(body.bodyOwner, body.binding);
      if (!target.ok) throw new Error(target.detail);
      source.state.current = {
        ...source.state.current,
        placementAuthoring: {
          ...source.state.current.placementAuthoring,
          observedTarget: { target: target.target, canonicalSha256: target.canonicalSha256 },
        },
      };
      const old =
        await garmentApi.buildPatternImportDxfProductSavedAnnularObservedPlacementGarmentV1(
          source.request,
        );
      if (!old.ok) throw new Error(JSON.stringify(old));
      let baseline: GarmentProjection;
      try {
        baseline = await projectGarment(old.owner);
      } finally {
        garmentApi.disposePatternImportDxfProductSavedAnnularObservedPlacementGarmentV1(old.owner);
      }
      // This is a new explicit saved intent, with its own genuine D0 seal, not a mutation of any
      // issued garment owner or geometry. Acceptance, roles, spans and mapping inputs stay exact.
      const semantics = source.state.current.placementAuthoring.semantics;
      const d0 = await buildDxfProductTwoPanelSkirtGarmentSemanticsV1({
        schemaVersion: DXF_PRODUCT_TWO_PANEL_SKIRT_GARMENT_SEMANTICS_REQUEST_V1,
        origin: 'verified-saved-row',
        expectedComposerCanonicalSha256:
          source.request.composerV2Owner.snapshot.seal.canonicalSha256,
        composerOwner: source.request.composerV2Owner,
        garment: semantics.garment,
        policy: authoredPolicy,
      });
      if (!d0.ok) throw new Error(JSON.stringify(d0));
      try {
        source.state.current = {
          ...source.state.current,
          placementAuthoring: {
            ...source.state.current.placementAuthoring,
            semantics: {
              ...semantics,
              policy: authoredPolicy,
              originalCanonicalSha256: d0.snapshot.seal.canonicalSha256,
            },
          },
        };
      } finally {
        disposeDxfProductTwoPanelSkirtGarmentSemanticsV1(d0.owner);
      }
      const built =
        await garmentApi.buildPatternImportDxfProductSavedAnnularObservedPlacementGarmentV1(
          source.request,
        );
      if (!built.ok) throw new Error(JSON.stringify(built));
      garmentOwner = built.owner;
      return await consume({ ...source, body, garmentOwner, baseline });
    } finally {
      if (garmentOwner)
        garmentApi.disposePatternImportDxfProductSavedAnnularObservedPlacementGarmentV1(
          garmentOwner,
        );
      body.dispose();
    }
  });
}

function pairRequest(garmentOwner: GarmentOwner, body: Body) {
  return {
    schemaVersion:
      pairApi.BETA_SKIRT_SAVED_ANNULAR_OBSERVED_PLACEMENT_DISPLAYED_BODY_PRODUCT_PLACEMENT_V1,
    savedAnnularObservedPlacementGarmentOwner: garmentOwner,
    displayedBodyOwner: body.bodyOwner,
    displayedBodyBinding: body.binding,
    hostCompileGeneration: 17,
  } as const;
}
function worldRequest(garmentOwner: GarmentOwner, pair: Pair) {
  return {
    schemaVersion:
      worldApi.BETA_SKIRT_SAVED_ANNULAR_OBSERVED_PLACEMENT_DISPLAYED_BODY_WORLD_INITIAL_PREFLIGHT_V1,
    savedAnnularObservedPlacementGarmentOwner: garmentOwner,
    observedPairOwner: pair.owner,
    expected: {
      garmentReportSha256: garmentOwner.report.canonicalSha256,
      pairReportSha256: pair.report.reportSha256,
    },
  } as const;
}

const GENUINE_SOURCE_TIMEOUT_MS = 15_000;

describe('bounded observed initialization with genuine saved source and unchanged synthetic cube', () => {
  it(
    'independently replays the blocked bounded recipe while preserving all local rest, material, topology, seams and masses',
    async () => {
      await withSource(async ({ body, garmentOwner, baseline }) => {
        const garment = await projectGarment(garmentOwner);
        expect(garment.mapping.positions3M).toEqual(baseline.mapping.positions3M);
        expect(garment.mapping.normalizedTriangles).toEqual(baseline.mapping.normalizedTriangles);
        expect(garment.mapping.seamPairs).toEqual(baseline.mapping.seamPairs);
        expect(garment.mapping.pinnedWaistVertexIndices).toEqual(
          baseline.mapping.pinnedWaistVertexIndices,
        );
        expect(garment.normalizedMaterial).not.toBeNull();
        expect(garment.normalizedMaterial!.normalizedV5).toEqual(
          baseline.normalizedMaterial!.normalizedV5,
        );
        expect(garment.normalizedMaterial!.initialPhysicalPositionsInvMassKg).toEqual(
          baseline.normalizedMaterial!.initialPhysicalPositionsInvMassKg,
        );
        expect(garment.report.bindings.placementSidecarSha256).not.toBe(
          baseline.report.bindings.placementSidecarSha256,
        );
        expect(garment.report.bindings.semanticsCanonicalSha256).not.toBe(
          baseline.report.bindings.semanticsCanonicalSha256,
        );
        const pair =
          await pairApi.buildBetaSkirtSavedAnnularObservedPlacementDisplayedBodyProductPlacementV1(
            pairRequest(garmentOwner, body),
          );
        if (!pair.ok) throw new Error(JSON.stringify(pair));
        try {
          if (!('boundedRadialInitialization' in pair.report.candidate))
            throw new Error('Expected explicitly bounded recipe.');
          const recipe = pair.report.candidate.boundedRadialInitialization;
          expect(recipe.policy).toEqual(OBSERVED_BOUNDED_RADIAL_INITIALIZATION_POLICY_V1);
          expect(recipe.requiredRadialScale).toBeGreaterThan(1.01);
          expect(recipe.radialScale).toBe(1);
          expect(recipe.applied).toBe(false);
          expect(recipe.passed).toBe(false);
          expect(recipe.blockers).toContain('radial-scale-over-budget');
          expect(recipe.blockers).toContain('candidate-section-clearance-not-met');
          expect(recipe.float32SafetyMarginM).toBeGreaterThanOrEqual(0.000001);
          expect(recipe.baselineSection.ok).toBe(true);
          expect(recipe.candidateSection).toEqual(recipe.baselineSection);
          expect(pair.report.candidate.uniformScale).toBeNull();
          expect(pair.report.claims).toMatchObject({
            rigidTranslationOnly: false,
            garmentScaleChanged: false,
            explicitBoundedRadialInitialization: true,
          });
          expect(pair.report.blockers).toContain('radial-scale-over-budget');
          expect(pair.report.blockers).toContain('section-authored-clearance-not-met');
          const world =
            await worldApi.buildBetaSkirtSavedAnnularObservedPlacementDisplayedBodyWorldInitialPreflightV1(
              worldRequest(garmentOwner, pair),
            );
          if (!world.ok) throw new Error(JSON.stringify(world));
          try {
            expect(world.report.rigidPlacement).toBeNull();
            expect(world.report.boundedRadialPlacement).toMatchObject({
              float32RecipeReplayedByteExactly: true,
              recipe,
            });
            expect(world.report.worldInitialChecksPassed).toBe(false);
            expect(world.report.counts).toEqual({
              vertices: 580,
              triangles: 912,
              assemblyOrderSeamPairs: 34,
              zeroInverseMassPins: 82,
              positiveInverseMassParticles: 498,
            });
            expect(world.report.selfIntersection).toMatchObject({
              excludedConfinedAuthenticatedAoSeamCount: 182,
              residualBlockingCount: 0,
              passed: true,
            });
            expect(world.report.physicalState).toMatchObject({
              maximumWorldSeamGapM: 0,
              localRestAndMaterialUnchanged: true,
              localPackageSealValidated: true,
            });
            const projected =
              await worldApi.projectBetaSkirtSavedAnnularObservedPlacementDisplayedBodyWorldInitialPreflightV1(
                world.owner,
              );
            expect(projected).not.toBeNull();
            expect(projected!.localPositions3M).toEqual(baseline.mapping.positions3M);
            expect(projected!.normalizedV5).toEqual(baseline.normalizedMaterial!.normalizedV5);
            expect(projected!.assemblyOrderSeamPairs).toEqual(baseline.mapping.seamPairs);
            expect(projected!.waistPinVertexIndices).toEqual(
              baseline.mapping.pinnedWaistVertexIndices,
            );
            const translation = pair.report.candidate.translationM;
            for (let vertex = 0; vertex < 580; vertex++) {
              for (let axis = 0; axis < 3; axis++)
                expect(
                  Object.is(
                    projected!.initialWorldPositionsInvMassKg[vertex * 4 + axis],
                    Math.fround(
                      baseline.mapping.positions3M[vertex * 3 + axis]! + translation[axis]!,
                    ),
                  ),
                ).toBe(true);
              expect(
                Object.is(
                  projected!.initialWorldPositionsInvMassKg[vertex * 4 + 3],
                  baseline.normalizedMaterial!.initialPhysicalPositionsInvMassKg[vertex * 4 + 3],
                ),
              ).toBe(true);
            }
            const fresh =
              await worldApi.projectBetaSkirtSavedAnnularObservedPlacementDisplayedBodyWorldInitialPreflightV1(
                world.owner,
              );
            expect(fresh!.report).toEqual(world.report);
            expect(fresh!.initialWorldPositionsInvMassKg).toEqual(
              projected!.initialWorldPositionsInvMassKg,
            );
            const runtime =
              await runtimeApi.buildBetaSkirtSavedAnnularObservedPlacementRuntimeSourceV1({
                schemaVersion:
                  runtimeApi.BETA_SKIRT_SAVED_ANNULAR_OBSERVED_PLACEMENT_RUNTIME_SOURCE_V1,
                garmentOwner,
                pairOwner: pair.owner,
                worldInitialOwner: world.owner,
                expected: {
                  ...worldRequest(garmentOwner, pair).expected,
                  worldReportSha256: world.report.reportSha256,
                },
              });
            expect(runtime).toMatchObject({
              ok: false,
              owner: null,
              code: 'source-physical-gate-blocked',
            });
            expect(runtime.report!.gates).toMatchObject({
              sectionClear: false,
              worldInitialClear: false,
              fixedActualBodyWorkload: false,
              independentWorldReplayMatched: false,
            });
            expect(runtime.report!.blockers).toContain('radial-scale-over-budget');
            expect(runtime.report!.claims).toMatchObject({
              diagnosticGpuInputQualified: false,
              framesExecuted: false,
              runtimeAuthority: false,
            });
            expect((await projectGarment(garmentOwner)).normalizedMaterial!.normalizedV5).toEqual(
              baseline.normalizedMaterial!.normalizedV5,
            );
          } finally {
            worldApi.disposeBetaSkirtSavedAnnularObservedPlacementDisplayedBodyWorldInitialPreflightV1(
              world.owner,
            );
          }
        } finally {
          pairApi.disposeBetaSkirtSavedAnnularObservedPlacementDisplayedBodyProductPlacementV1(
            pair.owner,
          );
        }
      });
    },
    GENUINE_SOURCE_TIMEOUT_MS,
  );

  it.each(['reserved-revision', 'recipe-clearance'] as const)(
    'fails closed on saved %s instead of falling back to rigid',
    async (kind) => {
      const authored = policy();
      const invalid =
        kind === 'reserved-revision'
          ? { ...authored, revision: 'observed-body-bounded-radial-initialization-v999' }
          : { ...authored, authoredClearanceM: 0.007 };
      await withSource(async ({ body, garmentOwner }) => {
        const result =
          await pairApi.buildBetaSkirtSavedAnnularObservedPlacementDisplayedBodyProductPlacementV1(
            pairRequest(garmentOwner, body),
          );
        expect(result).toMatchObject({ ok: false, owner: null });
        if (result.ok) throw new Error('An unknown reserved recipe must not issue a pair.');
        expect(result.detail).toMatch(
          kind === 'reserved-revision' ? /Unsupported.*policy revision/ : /exact authored recipe/,
        );
        expect(body.input.isCurrent()).toBe(true);
        expect(await projectGarment(garmentOwner)).not.toBeNull();
      }, invalid);
    },
    GENUINE_SOURCE_TIMEOUT_MS,
  );

  it(
    'locally cancels a pending bounded replay, rejects wrong report binding and revokes on persisted intent drift',
    async () => {
      await withSource(async ({ body, garmentOwner, state }) => {
        const pair =
          await pairApi.buildBetaSkirtSavedAnnularObservedPlacementDisplayedBodyProductPlacementV1(
            pairRequest(garmentOwner, body),
          );
        if (!pair.ok) throw new Error(JSON.stringify(pair));
        try {
          const request = worldRequest(garmentOwner, pair);
          expect(
            await worldApi.buildBetaSkirtSavedAnnularObservedPlacementDisplayedBodyWorldInitialPreflightV1(
              { ...request, expected: { ...request.expected, pairReportSha256: 'f'.repeat(64) } },
            ),
          ).toMatchObject({ ok: false, code: 'binding-mismatch' });
          const parents = [
            garmentApi.getPatternImportDxfProductSavedAnnularObservedPlacementGarmentLifetimeV1(
              garmentOwner,
            )!,
            pairApi.getBetaSkirtSavedAnnularObservedPlacementDisplayedBodyProductPlacementLifetimeV1(
              pair.owner,
            )!,
            getSavedModelDisplayedTriangleBodyLifetimeV2(body.bodyOwner, body.binding)!,
          ];
          const entered = deferredSessionValue<void>();
          const held = deferredSessionValue<void>();
          body.hooks.beforeReadModel = async () => {
            entered.resolve();
            await held.promise;
          };
          const abort = new AbortController();
          const pending =
            worldApi.buildBetaSkirtSavedAnnularObservedPlacementDisplayedBodyWorldInitialPreflightV1(
              request,
              abort.signal,
            );
          await entered.promise;
          abort.abort();
          expect(await pending).toMatchObject({ ok: false, code: 'cancelled' });
          for (const parent of parents) expect(parent.aborted).toBe(false);
          body.hooks.beforeReadModel = undefined;
          held.resolve();
          const world =
            await worldApi.buildBetaSkirtSavedAnnularObservedPlacementDisplayedBodyWorldInitialPreflightV1(
              request,
            );
          if (!world.ok) throw new Error(JSON.stringify(world));
          try {
            const child =
              worldApi.getBetaSkirtSavedAnnularObservedPlacementDisplayedBodyWorldInitialPreflightLifetimeV1(
                world.owner,
              )!;
            state.current = {
              ...state.current,
              placementAuthoring: {
                ...state.current.placementAuthoring,
                semantics: {
                  ...state.current.placementAuthoring.semantics,
                  policy: {
                    ...state.current.placementAuthoring.semantics.policy,
                    revision: 'observed-body-bounded-radial-initialization-v999',
                  },
                },
              },
            };
            expect(
              await worldApi.projectBetaSkirtSavedAnnularObservedPlacementDisplayedBodyWorldInitialPreflightV1(
                world.owner,
              ),
            ).toBeNull();
            expect(child.aborted).toBe(true);
            expect(body.input.isCurrent()).toBe(true);
            expect(parents[2].aborted).toBe(false);
          } finally {
            worldApi.disposeBetaSkirtSavedAnnularObservedPlacementDisplayedBodyWorldInitialPreflightV1(
              world.owner,
            );
          }
        } finally {
          pairApi.disposeBetaSkirtSavedAnnularObservedPlacementDisplayedBodyProductPlacementV1(
            pair.owner,
          );
        }
      });
    },
    GENUINE_SOURCE_TIMEOUT_MS,
  );
});
