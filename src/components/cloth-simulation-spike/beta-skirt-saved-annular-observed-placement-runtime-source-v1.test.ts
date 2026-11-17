import { getEventListeners } from 'node:events';
import { describe, expect, it, vi } from 'vitest';
import {
  BETA_SKIRT_SAVED_ANNULAR_OBSERVED_PLACEMENT_RUNTIME_SOURCE_V1 as VERSION,
  buildBetaSkirtSavedAnnularObservedPlacementRuntimeSourceV1 as build,
  projectBetaSkirtSavedAnnularObservedPlacementRuntimeSourceV1 as project,
  getBetaSkirtSavedAnnularObservedPlacementRuntimeSourceLifetimeV1 as lifetime,
  disposeBetaSkirtSavedAnnularObservedPlacementRuntimeSourceV1 as dispose,
  type BetaSkirtSavedAnnularObservedPlacementRuntimeSourceRequestV1 as Request,
} from './beta-skirt-saved-annular-observed-placement-runtime-source-v1';
import { runBetaSkirtSavedAnnularObservedPlacement16FrameContactV1 } from './beta-skirt-saved-annular-observed-placement-16-frame-contact-v1';
import { withObservedPlacementDisplayedBodyPairSourceV1 } from './beta-skirt-saved-annular-observed-placement-displayed-body-product-placement-v1.test-fixture';
import * as pairApi from './beta-skirt-saved-annular-observed-placement-displayed-body-product-placement-v1';
import * as worldApi from './beta-skirt-saved-annular-observed-placement-displayed-body-world-initial-preflight-v1';
import { getPatternImportDxfProductSavedAnnularObservedPlacementGarmentLifetimeV1 as garmentLifetime } from 'lib/cloth/domain/pattern-import-dxf-product-saved-annular-observed-placement-garment-v1';
import { getSavedModelDisplayedTriangleBodyLifetimeV2 as bodyLifetime } from 'components/managers/models/components/saved-model-displayed-triangle-body-owner-v2';

// Nominal station assets, transport and cube observation are declared fixtures only.
// Source registries and all garment/section/collision/signed/world kernels remain genuine.
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

type Source = Parameters<Parameters<typeof withObservedPlacementDisplayedBodyPairSourceV1>[0]>[0];
async function withSources<T>(
  consume: (value: Source & { request: Request; parents: AbortSignal[] }) => Promise<T>,
) {
  return withObservedPlacementDisplayedBodyPairSourceV1(async (source) => {
    const pair =
      await pairApi.buildBetaSkirtSavedAnnularObservedPlacementDisplayedBodyProductPlacementV1(
        source.pairRequest,
      );
    if (!pair.ok) throw new Error(JSON.stringify(pair));
    let world: Extract<
      Awaited<
        ReturnType<
          typeof worldApi.buildBetaSkirtSavedAnnularObservedPlacementDisplayedBodyWorldInitialPreflightV1
        >
      >,
      { ok: true }
    > | null = null;
    try {
      const built =
        await worldApi.buildBetaSkirtSavedAnnularObservedPlacementDisplayedBodyWorldInitialPreflightV1(
          {
            schemaVersion:
              worldApi.BETA_SKIRT_SAVED_ANNULAR_OBSERVED_PLACEMENT_DISPLAYED_BODY_WORLD_INITIAL_PREFLIGHT_V1,
            savedAnnularObservedPlacementGarmentOwner: source.garmentOwner,
            observedPairOwner: pair.owner,
            expected: {
              garmentReportSha256: source.garmentOwner.report.canonicalSha256,
              pairReportSha256: pair.report.reportSha256,
            },
          },
        );
      if (!built.ok) throw new Error(JSON.stringify(built));
      world = built;
      const request: Request = {
        schemaVersion: VERSION,
        garmentOwner: source.garmentOwner,
        pairOwner: pair.owner,
        worldInitialOwner: world.owner,
        expected: {
          garmentReportSha256: source.garmentOwner.report.canonicalSha256,
          pairReportSha256: pair.report.reportSha256,
          worldReportSha256: world.report.reportSha256,
        },
      };
      return await consume({
        ...source,
        request,
        parents: [
          garmentLifetime(source.garmentOwner)!,
          pairApi.getBetaSkirtSavedAnnularObservedPlacementDisplayedBodyProductPlacementLifetimeV1(
            pair.owner,
          )!,
          worldApi.getBetaSkirtSavedAnnularObservedPlacementDisplayedBodyWorldInitialPreflightLifetimeV1(
            world.owner,
          )!,
        ],
      });
    } finally {
      if (world)
        worldApi.disposeBetaSkirtSavedAnnularObservedPlacementDisplayedBodyWorldInitialPreflightV1(
          world.owner,
        );
      pairApi.disposeBetaSkirtSavedAnnularObservedPlacementDisplayedBodyProductPlacementV1(
        pair.owner,
      );
    }
  });
}

describe('strict observed runtime source; genuine DXF/owners, declared synthetic cube and transport', () => {
  it('retains exact physical blockers, world182/0 and82/498/34 proof without minting GPU authority', async () => {
    await withSources(async ({ request, parents, body }) => {
      const before = parents.map((p) => getEventListeners(p, 'abort').length);
      const result = await build(request);
      expect(result.ok).toBe(false);
      expect(result.owner).toBeNull();
      if (result.ok || !result.report) throw new Error(JSON.stringify(result));
      expect(result.code).toBe('source-physical-gate-blocked');
      expect(result.report.gates).toMatchObject({
        persistedObservedTargetMatched: true,
        worldInitialClear: true,
        sectionClear: false,
        exactBodyContactClear: false,
        signedContactSetEmpty: false,
        fixedActualBodyWorkload: false,
        independentWorldReplayMatched: false,
      });
      expect(result.report.counts).toEqual({
        vertices: 580,
        triangles: 912,
        assemblyOrderSeamPairs: 34,
        zeroInverseMassPins: 82,
        positiveInverseMassParticles: 498,
      });
      expect(result.report.upstreamWorld.selfIntersection).toMatchObject({
        excludedConfinedAuthenticatedAoSeamCount: 182,
        residualBlockingCount: 0,
        passed: true,
      });
      expect(
        result.report.upstreamPair.collisionReport?.intersections
          .bodyGarmentTriangleIntersectionCount,
      ).toBe(8);
      expect(result.report.upstreamPair.signedRefresh?.contacts).toHaveLength(1);
      expect(result.report.blockers).toContain('section-authored-clearance-not-met');
      expect(result.report.blockers).toContain('body-contact-clearance-not-met');
      expect(result.report.blockers).toContain('signed-body-contact-set-not-empty');
      expect(result.report.claims).toMatchObject({
        diagnosticGpuInputQualified: false,
        framesExecuted: false,
        runtimeAuthority: false,
      });
      expect(result.report.bindings.localRestPositionsInvMassKgSha256).not.toBe(
        result.report.bindings.worldPositionsInvMassKgSha256,
      );
      let gpuTouches = 0;
      const options = Object.defineProperty({}, 'gpu', {
        get() {
          gpuTouches++;
          throw new Error('blocked report cannot reach GPU');
        },
      });
      expect(
        await runBetaSkirtSavedAnnularObservedPlacement16FrameContactV1(
          {} as HTMLCanvasElement,
          result.report,
          options,
        ),
      ).toMatchObject({ ok: false, code: 'source-owner-unavailable' });
      expect(gpuTouches).toBe(0);
      expect(await project(result.report)).toBeNull();
      expect(lifetime(result.report)).toBeNull();
      expect(dispose(result.report)).toBe(false);
      expect(parents.map((p) => getEventListeners(p, 'abort').length)).toEqual(before);
      expect(bodyLifetime(body.bodyOwner, body.binding)).not.toBeNull();
    });
  });
  it('rejects exact receipt substitutions and detached owner lookalikes without leaking parent listeners', async () => {
    await withSources(async ({ request, parents }) => {
      const before = parents.map((p) => getEventListeners(p, 'abort').length);
      for (const field of [
        'garmentReportSha256',
        'pairReportSha256',
        'worldReportSha256',
      ] as const) {
        const result = await build({
          ...request,
          expected: { ...request.expected, [field]: 'f'.repeat(64) },
        });
        expect(result).toMatchObject({
          ok: false,
          owner: null,
          code: 'source-binding-unavailable',
        });
      }
      expect(await build({ ...request, pairOwner: {} })).toMatchObject({ ok: false, owner: null });
      expect(parents.map((p) => getEventListeners(p, 'abort').length)).toEqual(before);
    });
  });
  it('cancels a pending fresh read locally, observing its late outcome while preserving borrowed body/garment/world', async () => {
    await withSources(async ({ request, parents, body }) => {
      const before = parents.map((p) => getEventListeners(p, 'abort').length);
      let release = () => {};
      let entered = () => {};
      const waiting = new Promise<void>((r) => {
        release = r;
      });
      const started = new Promise<void>((r) => {
        entered = r;
      });
      body.hooks.beforeReadModel = async () => {
        entered();
        await waiting;
      };
      const controller = new AbortController();
      const pending = build(request, controller.signal);
      await started;
      controller.abort();
      const result = await pending;
      expect(result).toMatchObject({ ok: false, owner: null });
      body.hooks.beforeReadModel = undefined;
      release();
      await Promise.resolve();
      expect(bodyLifetime(body.bodyOwner, body.binding)).not.toBeNull();
      expect(parents.every((p) => !p.aborted)).toBe(true);
      expect(parents.map((p) => getEventListeners(p, 'abort').length)).toEqual(before);
    });
  });
  it('fails closed on synchronous source-reader cancellation and native-invalid signals', async () => {
    await withSources(async ({ request, parents, body }) => {
      const before = parents.map((p) => getEventListeners(p, 'abort').length);
      const controller = new AbortController();
      body.hooks.beforeReadObservation = () => controller.abort();
      expect(await build(request, controller.signal)).toMatchObject({ ok: false, owner: null });
      body.hooks.beforeReadObservation = undefined;
      expect(await build(request, { aborted: false } as AbortSignal)).toMatchObject({
        ok: false,
        owner: null,
      });
      expect(parents.map((p) => getEventListeners(p, 'abort').length)).toEqual(before);
      expect(bodyLifetime(body.bodyOwner, body.binding)).not.toBeNull();
    });
  });
  it('does not execute request accessors or forged owner methods', async () => {
    let calls = 0;
    const request = Object.defineProperty({}, 'schemaVersion', {
      enumerable: true,
      get() {
        calls++;
        throw new Error('never');
      },
    });
    expect(await build(request)).toMatchObject({ ok: false, owner: null });
    const fake = Object.defineProperty({}, 'report', {
      get() {
        calls++;
        throw new Error('never');
      },
    });
    expect(await project(fake)).toBeNull();
    expect(lifetime(fake)).toBeNull();
    expect(dispose(fake)).toBe(false);
    expect(calls).toBe(0);
  });
});
