import { writeObservedPlacementEvidenceV1 } from '../../../tests/cloth/fixtures/observed-placement-v3/write-evidence';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { withObservedPlacementDisplayedBodyPairSourceV1 } from './beta-skirt-saved-annular-observed-placement-displayed-body-product-placement-v1.test-fixture';
import * as pairApi from './beta-skirt-saved-annular-observed-placement-displayed-body-product-placement-v1';
import * as garmentApi from 'lib/cloth/domain/pattern-import-dxf-product-saved-annular-observed-placement-garment-v1';
import * as legacyGarment from 'lib/cloth/domain/pattern-import-dxf-product-saved-annular-garment-v1';
import * as legacyPair from './beta-skirt-saved-annular-displayed-body-product-placement-v1';
import * as legacyWorld from './beta-skirt-saved-annular-displayed-body-world-initial-preflight-v1';
import * as witnesses from './beta-skirt-canonical-medium-confined-ao-seam-contact-witness-v2';
import { getSavedModelDisplayedTriangleBodyLifetimeV2 } from 'components/managers/models/components/saved-model-displayed-triangle-body-owner-v2';
import { deferredSessionValue } from 'components/managers/models/components/saved-model-displayed-triangle-body-session-v2.test-fixture';
import {
  BETA_SKIRT_SAVED_ANNULAR_OBSERVED_PLACEMENT_DISPLAYED_BODY_WORLD_INITIAL_PREFLIGHT_V1 as VERSION,
  buildBetaSkirtSavedAnnularObservedPlacementDisplayedBodyWorldInitialPreflightV1 as build,
  projectBetaSkirtSavedAnnularObservedPlacementDisplayedBodyWorldInitialPreflightV1 as project,
  getBetaSkirtSavedAnnularObservedPlacementDisplayedBodyWorldInitialPreflightLifetimeV1 as lifetime,
  disposeBetaSkirtSavedAnnularObservedPlacementDisplayedBodyWorldInitialPreflightV1 as dispose,
  type BetaSkirtSavedAnnularObservedPlacementDisplayedBodyWorldInitialPreflightRequestV1 as Request,
} from './beta-skirt-saved-annular-observed-placement-displayed-body-world-initial-preflight-v1';

// Nominal stations and persisted transport are fixture inputs, as is the observed closed cube.
// Genuine producer/adopter/V3 read/garment/pair plus ALL CPU geometry/material kernels execute.
// This does not qualify an actual V9 viewport or runtime source.
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
afterEach(() => vi.restoreAllMocks());

type Source = Parameters<Parameters<typeof withObservedPlacementDisplayedBodyPairSourceV1>[0]>[0];
type Pair = Extract<
  Awaited<
    ReturnType<
      typeof pairApi.buildBetaSkirtSavedAnnularObservedPlacementDisplayedBodyProductPlacementV1
    >
  >,
  { ok: true }
>;
async function withSources<T>(
  consume: (context: Source & { pair: Pair; request: Request }) => Promise<T>,
) {
  return withObservedPlacementDisplayedBodyPairSourceV1(async (source) => {
    const pair =
      await pairApi.buildBetaSkirtSavedAnnularObservedPlacementDisplayedBodyProductPlacementV1(
        source.pairRequest,
      );
    if (!pair.ok) throw new Error(JSON.stringify(pair));
    try {
      return await consume({
        ...source,
        pair,
        request: {
          schemaVersion: VERSION,
          savedAnnularObservedPlacementGarmentOwner: source.garmentOwner,
          observedPairOwner: pair.owner,
          expected: {
            garmentReportSha256: source.garmentOwner.report.canonicalSha256,
            pairReportSha256: pair.report.reportSha256,
          },
        },
      });
    } finally {
      pairApi.disposeBetaSkirtSavedAnnularObservedPlacementDisplayedBodyProductPlacementV1(
        pair.owner,
      );
    }
  });
}

describe('V3 observed world-initial preflight, genuine chain with explicit synthetic body', () => {
  it('retains real seam-aware accounting, physical W and local rest with every upstream physical blocker', async () => {
    await withSources(async ({ request, pair, garmentOwner }) => {
      const garment =
        (await garmentApi.projectPatternImportDxfProductSavedAnnularObservedPlacementGarmentV1(
          garmentOwner,
        ))!;
      const restBefore = new Uint8Array(
        garment.normalizedMaterial!.normalizedV5.simulation.constraints.continuumStrain.triangleRestFrames,
      ).slice();
      const result = await build(request);
      if (!result.ok) throw new Error(JSON.stringify(result));
      try {
        expect(result.report.sourceKind).toBe('saved-annular-observed-placement-garment-v1');
        expect(result.report.upstreamPair).toEqual(pair.report);
        expect(result.report.claims).toMatchObject({
          observedBodyTargetConfirmed: true,
          persistedObservedTargetMatched: true,
          sourceAuthority: false,
          initializationAuthority: false,
          runtimeAuthority: false,
          solverExecuted: false,
          physicalStressOrPaComputed: false,
        });
        expect(result.report.blockers).not.toContain('unconfirmed-observed-body-target');
        for (const blocker of pair.report.blockers)
          expect(result.report.blockers).toContain(blocker);
        expect(result.report.counts).toEqual({
          vertices: 580,
          triangles: 912,
          assemblyOrderSeamPairs: 34,
          zeroInverseMassPins: 82,
          positiveInverseMassParticles: 498,
        });
        expect(result.report.selfIntersection).toMatchObject({
          excludedConfinedAuthenticatedAoSeamCount: 182,
          residualBlockingCount: 0,
          exactRawExcludedResidualAccounting: true,
          passed: true,
        });
        expect(result.report.orientation).toMatchObject({
          normalReversalCount: 0,
          candidateDegenerateTriangleCount: 0,
          passed: true,
        });
        expect(result.report.physicalState.maximumWorldSeamGapM).toBe(0);
        const projected = (await project(result.owner))!;
        expect(projected.localPositions3M).toEqual(garment.mapping.positions3M);
        expect(
          new Uint8Array(
            projected.normalizedV5.simulation.constraints.continuumStrain.triangleRestFrames,
          ),
        ).toEqual(restBefore);
        const pins = new Set(projected.waistPinVertexIndices);
        for (let vertex = 0; vertex < 580; vertex++) {
          expect(projected.initialWorldPositionsInvMassKg[vertex * 4 + 3]).toBe(
            garment.normalizedMaterial!.initialPhysicalPositionsInvMassKg[vertex * 4 + 3],
          );
          if (pins.has(vertex))
            expect(Object.is(projected.initialWorldPositionsInvMassKg[vertex * 4 + 3], 0)).toBe(
              true,
            );
        }
        projected.initialWorldPositionsInvMassKg.fill(0);
        expect(
          (await project(result.owner))!.initialWorldPositionsInvMassKg.some((x) => x > 0),
        ).toBe(true);
        expect(
          await legacyWorld.projectBetaSkirtSavedAnnularDisplayedBodyWorldInitialPreflightV1(
            result.owner,
          ),
        ).toBeNull();
        expect(
          legacyWorld.disposeBetaSkirtSavedAnnularDisplayedBodyWorldInitialPreflightV1(
            result.owner,
          ),
        ).toBe(false);
        expect(lifetime(result.owner)?.aborted).toBe(false);
        writeObservedPlacementEvidenceV1(
          'cloth-observed-world-preflight-real-cpu-synthetic-body-20261117.json',
          JSON.stringify(
            {
              evidence: {
                source: 'genuine-DXF-AO-V3-garment-observed-pair',
                body: 'synthetic-neutral-cube-through-genuine-producer-adopter',
                transportAndNominalStations: 'fixtures',
                kernels: 'real-CPU',
                viewportActualV9Qualified: false,
                runtimeQualified: false,
              },
              report: result.report,
            },
            null,
            2,
          ) + '\n',
        );
      } finally {
        dispose(result.owner);
      }
    });
  });

  it('rejects detached target fields/hash/source seals and exact F32/W/pin substitutions', async () => {
    await withSources(async ({ request }) => {
      const actualPair =
        pairApi.projectBetaSkirtSavedAnnularObservedPlacementDisplayedBodyProductPlacementV1;
      const actualGarment =
        garmentApi.projectPatternImportDxfProductSavedAnnularObservedPlacementGarmentV1;
      const pairMutations = [
        (p: NonNullable<Awaited<ReturnType<typeof actualPair>>>) => {
          (p.report.source.observedTarget as { canonicalSha256: string }).canonicalSha256 =
            'b'.repeat(64);
        },
        (p: NonNullable<Awaited<ReturnType<typeof actualPair>>>) => {
          (p.report.source.observedTarget.target.displayedModel as { modelId: string }).modelId =
            'tech-card-base-model:732';
        },
        (p: NonNullable<Awaited<ReturnType<typeof actualPair>>>) => {
          (p.report.source as { placementSidecarSha256: string }).placementSidecarSha256 =
            'c'.repeat(64);
        },
        (p: NonNullable<Awaited<ReturnType<typeof actualPair>>>) => {
          p.collisionInput.garmentPositionsM[0] += 0.001;
        },
      ];
      for (const change of pairMutations) {
        const spy = vi
          .spyOn(
            pairApi,
            'projectBetaSkirtSavedAnnularObservedPlacementDisplayedBodyProductPlacementV1',
          )
          .mockImplementation(async (...args) => {
            const p = structuredClone(await actualPair(...args));
            if (p) change(p);
            return p;
          });
        expect(await build(request)).toMatchObject({ ok: false, owner: null });
        spy.mockRestore();
      }
      for (const field of ['mass', 'pins'] as const) {
        const spy = vi
          .spyOn(garmentApi, 'projectPatternImportDxfProductSavedAnnularObservedPlacementGarmentV1')
          .mockImplementation(async (...args) => {
            const g = structuredClone(await actualGarment(...args));
            if (g) {
              if (field === 'mass') g.normalizedMaterial!.initialPhysicalPositionsInvMassKg[3] = 1;
              else g.mapping.pinnedWaistVertexIndices[0] = g.mapping.pinnedWaistVertexIndices[1];
            }
            return g;
          });
        expect(await build(request)).toMatchObject({ ok: false, owner: null });
        spy.mockRestore();
      }
      expect(
        await build({
          ...request,
          expected: { ...request.expected, pairReportSha256: 'f'.repeat(64) },
        }),
      ).toMatchObject({ ok: false, code: 'binding-mismatch' });
    });
  });

  it('locally cancels pending build/read and preserves genuine borrowed pair, body and garment', async () => {
    await withSources(async ({ request, body, pair, garmentOwner }) => {
      const parentPair =
        pairApi.getBetaSkirtSavedAnnularObservedPlacementDisplayedBodyProductPlacementLifetimeV1(
          pair.owner,
        )!;
      const parentBody = getSavedModelDisplayedTriangleBodyLifetimeV2(
        body.bodyOwner,
        body.binding,
      )!;
      const parentGarment =
        garmentApi.getPatternImportDxfProductSavedAnnularObservedPlacementGarmentLifetimeV1(
          garmentOwner,
        )!;
      let entered = deferredSessionValue<void>();
      let held = deferredSessionValue<void>();
      body.hooks.beforeReadModel = async () => {
        entered.resolve();
        await held.promise;
      };
      const abort = new AbortController();
      const pending = build(request, abort.signal);
      await entered.promise;
      abort.abort();
      expect(await pending).toMatchObject({ ok: false, code: 'cancelled' });
      for (const parent of [parentPair, parentBody, parentGarment])
        expect(parent.aborted).toBe(false);
      body.hooks.beforeReadModel = undefined;
      held.resolve();
      const result = await build(request);
      if (!result.ok) throw new Error(JSON.stringify(result));
      const child = lifetime(result.owner)!;
      entered = deferredSessionValue<void>();
      held = deferredSessionValue<void>();
      body.hooks.beforeReadModel = async () => {
        entered.resolve();
        await held.promise;
      };
      const readAbort = new AbortController();
      const pendingRead = project(result.owner, readAbort.signal);
      await entered.promise;
      readAbort.abort();
      expect(await pendingRead).toBeNull();
      expect(child.aborted).toBe(true);
      for (const parent of [parentPair, parentBody, parentGarment])
        expect(parent.aborted).toBe(false);
      body.hooks.beforeReadModel = undefined;
      held.resolve();
      expect(
        await pairApi.projectBetaSkirtSavedAnnularObservedPlacementDisplayedBodyProductPlacementV1(
          pair.owner,
        ),
      ).not.toBeNull();
    });
  });

  it('fails closed on synchronous host reentrancy and source expiry during awaited world witness', async () => {
    await withSources(async ({ request, body, pair }) => {
      const abort = new AbortController();
      const result = await build(request, abort.signal);
      if (!result.ok) throw new Error(JSON.stringify(result));
      const child = lifetime(result.owner)!;
      body.hooks.beforeReadObservation = () => abort.abort();
      expect(lifetime(result.owner)).toBeNull();
      expect(child.aborted).toBe(true);
      body.hooks.beforeReadObservation = undefined;
      expect(
        pairApi.getBetaSkirtSavedAnnularObservedPlacementDisplayedBodyProductPlacementLifetimeV1(
          pair.owner,
        )?.aborted,
      ).toBe(false);
      const original = witnesses.evaluateBetaSkirtCanonicalMediumConfinedContactPairV2;
      const spy = vi
        .spyOn(witnesses, 'evaluateBetaSkirtCanonicalMediumConfinedContactPairV2')
        .mockImplementation(async (input) => {
          const result = await original(input);
          pairApi.disposeBetaSkirtSavedAnnularObservedPlacementDisplayedBodyProductPlacementV1(
            pair.owner,
          );
          return result;
        });
      expect(await build(request)).toMatchObject({ ok: false, owner: null });
      spy.mockRestore();
      expect(body.input.isCurrent()).toBe(true);
    });
  });

  it.each(['model', 'persisted-target'] as const)(
    'revokes on fresh %s replacement',
    async (mode) => {
      await withSources(async ({ request, body, state }) => {
        const result = await build(request);
        if (!result.ok) throw new Error(JSON.stringify(result));
        const child = lifetime(result.owner)!;
        if (mode === 'model') body.state.model!.updatedAt += '-replaced';
        else
          state.current = {
            ...state.current,
            placementAuthoring: {
              ...state.current.placementAuthoring,
              observedTarget: {
                ...state.current.placementAuthoring.observedTarget,
                canonicalSha256: 'f'.repeat(64),
              },
            },
          };
        expect(await project(result.owner)).toBeNull();
        expect(child.aborted).toBe(true);
      });
    },
  );

  it('rejects structural/old owner carriers and invalid signals without invoking caller getters', async () => {
    let reads = 0;
    const fake = Object.defineProperty({}, 'report', {
      get() {
        reads++;
        throw new Error('must not run');
      },
    });
    expect(
      await build({
        schemaVersion: VERSION,
        savedAnnularObservedPlacementGarmentOwner: fake,
        observedPairOwner: fake,
        expected: { garmentReportSha256: 'a'.repeat(64), pairReportSha256: 'b'.repeat(64) },
      }),
    ).toMatchObject({ ok: false, code: 'source-owner-unavailable' });
    expect(await project(fake)).toBeNull();
    expect(lifetime(fake)).toBeNull();
    expect(dispose(fake)).toBe(false);
    await withSources(async ({ request }) => {
      const signal = Object.defineProperty({}, 'aborted', {
        get() {
          reads++;
          return false;
        },
      }) as AbortSignal;
      expect(await build(request, signal)).toMatchObject({ ok: false, code: 'invalid-input' });
      const result = await build(request);
      if (!result.ok) throw new Error(JSON.stringify(result));
      expect(await project(result.owner, signal)).toBeNull();
      expect(lifetime(result.owner)?.aborted).toBe(false);
      dispose(result.owner);
    });
    expect(reads).toBe(0);
  });

  it('preserves legacy full report and all arrays against captured original evaluator', async () => {
    const baselineId: string = 'cloth-world-preflight-original';
    const original = (await import(/* @vite-ignore */ baselineId)) as typeof legacyWorld;
    await withObservedPlacementDisplayedBodyPairSourceV1(async ({ historicalRequest, body }) => {
      const garment =
        await legacyGarment.buildPatternImportDxfProductSavedAnnularGarmentV1(historicalRequest);
      if (!garment.ok) throw new Error(JSON.stringify(garment));
      try {
        const pair = await legacyPair.buildBetaSkirtSavedAnnularDisplayedBodyProductPlacementV1({
          schemaVersion: legacyPair.BETA_SKIRT_SAVED_ANNULAR_DISPLAYED_BODY_PRODUCT_PLACEMENT_V1,
          savedAnnularGarmentOwner: garment.owner,
          displayedBodyOwner: body.bodyOwner,
          displayedBodyBinding: body.binding,
          hostCompileGeneration: 17,
        });
        if (!pair.ok) throw new Error(JSON.stringify(pair));
        try {
          const request = {
            schemaVersion:
              legacyWorld.BETA_SKIRT_SAVED_ANNULAR_DISPLAYED_BODY_WORLD_INITIAL_PREFLIGHT_V1,
            savedAnnularGarmentOwner: garment.owner,
            observedPairOwner: pair.owner,
            expected: {
              garmentReportSha256: garment.report.canonicalSha256,
              pairReportSha256: pair.report.reportSha256,
            },
          };
          const old =
            await original.buildBetaSkirtSavedAnnularDisplayedBodyWorldInitialPreflightV1(request);
          const next =
            await legacyWorld.buildBetaSkirtSavedAnnularDisplayedBodyWorldInitialPreflightV1(
              request,
            );
          if (!old.ok || !next.ok) throw new Error('Legacy parity build failed.');
          expect(JSON.stringify(next.report)).toBe(JSON.stringify(old.report));
          expect(
            await legacyWorld.projectBetaSkirtSavedAnnularDisplayedBodyWorldInitialPreflightV1(
              next.owner,
            ),
          ).toEqual(
            await original.projectBetaSkirtSavedAnnularDisplayedBodyWorldInitialPreflightV1(
              old.owner,
            ),
          );
          expect(await project(next.owner)).toBeNull();
          expect(dispose(next.owner)).toBe(false);
          expect(
            await build({
              schemaVersion: VERSION,
              savedAnnularObservedPlacementGarmentOwner: garment.owner,
              observedPairOwner: pair.owner,
              expected: request.expected,
            }),
          ).toMatchObject({ ok: false, code: 'source-owner-unavailable' });
          legacyWorld.disposeBetaSkirtSavedAnnularDisplayedBodyWorldInitialPreflightV1(next.owner);
          original.disposeBetaSkirtSavedAnnularDisplayedBodyWorldInitialPreflightV1(old.owner);
        } finally {
          legacyPair.disposeBetaSkirtSavedAnnularDisplayedBodyProductPlacementV1(pair.owner);
        }
      } finally {
        legacyGarment.disposePatternImportDxfProductSavedAnnularGarmentV1(garment.owner);
      }
    });
  });
});
