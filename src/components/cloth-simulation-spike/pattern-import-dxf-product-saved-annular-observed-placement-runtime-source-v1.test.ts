import { describe, expect, it, vi } from 'vitest';
import {
  withObservedFirstSaveFixtureV3,
  withFirstSaveSourceV3,
} from './pattern-import-dxf-product-saved-annular-observed-placement-first-save-v3.test-fixture';
import {
  issuePatternImportDxfProductSavedAnnularObservedPlacementV3 as issue,
  buildPatternImportDxfProductSavedAnnularObservedPlacementGarmentObservedBodyPairV1 as pair,
  buildPatternImportDxfProductSavedAnnularObservedPlacementGarmentWorldInitialPreflightV1 as world,
  buildPatternImportDxfProductSavedAnnularObservedPlacementRuntimeSourceV1 as runtime,
  projectPatternImportDxfProductSavedAnnularObservedPlacementMeshV1 as mesh,
} from './pattern-import-dxf-product-saved-annular-observed-placement-garment-session-v1';
import { createPatternImportDxfProductSavedAnnularGarmentSessionV1 } from './pattern-import-dxf-product-saved-annular-garment-session-v1';
import * as worldDomain from './beta-skirt-saved-annular-observed-placement-displayed-body-world-initial-preflight-v1';
import {
  projectBetaSkirtSavedAnnularObservedPlacementDisplayedBodyProductPlacementV1 as projectPair,
  getBetaSkirtSavedAnnularObservedPlacementDisplayedBodyProductPlacementLifetimeV1 as pairLife,
  disposeBetaSkirtSavedAnnularObservedPlacementDisplayedBodyProductPlacementV1 as disposePair,
} from './beta-skirt-saved-annular-observed-placement-displayed-body-product-placement-v1';
import * as runtimeDomain from './beta-skirt-saved-annular-observed-placement-runtime-source-v1';
import { getSavedModelDisplayedTriangleBodyLifetimeV2 } from 'components/managers/models/components/saved-model-displayed-triangle-body-owner-v2';

vi.mock('api/api', () => ({ abortableAdminService: vi.fn() }));
// Genuine compiler/issuer/CAS/read/body owners and all world diagnostics. Only transport,
// synthetic closed-cube host observation and nominal asset/station ports are fixtures.
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
type F = Parameters<Parameters<typeof withObservedFirstSaveFixtureV3>[0]>[0];
type Paired = Extract<Awaited<ReturnType<typeof pair>>, { ok: true }>;
type Saver = Awaited<ReturnType<F['bindSaver']>>;
async function withMintedPair<T>(consume: (f: F, s: Saver, paired: Paired) => Promise<T>) {
  return withObservedFirstSaveFixtureV3(async (f) => {
    const issued = await issue(f.session, {
      ...f.intent,
      displayedBodyOwner: f.body.bodyOwner,
      displayedBodyBinding: f.body.binding,
    });
    if (!issued.ok) throw new Error(JSON.stringify(issued));
    const s = await f.bindSaver(issued.owner);
    const saved = await s.saver.save(s.saveRequest);
    if (!saved.ok) throw new Error(JSON.stringify(saved));
    const advanced = await f.session.advanceSavedGarment({
      expectedGeneration: f.generation,
      readCurrentPlacement: s.freshRead,
    });
    if (!advanced.ok) throw new Error(JSON.stringify(advanced));
    const paired = await pair(f.session, {
      expectedGeneration: f.generation,
      displayedBodyOwner: f.body.bodyOwner,
      displayedBodyBinding: f.body.binding,
    });
    if (!paired.ok) throw new Error(JSON.stringify(paired));
    try {
      return await consume(f, s, paired);
    } finally {
      disposePair(paired.owner);
    }
  });
}
const request = (f: F, p: Paired) => ({
  expectedGeneration: f.generation,
  observedPairOwner: p.owner,
  expectedPairReportSha256: p.report.reportSha256,
});
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((accept) => {
    resolve = accept;
  });
  return { promise, resolve };
}

type World = Extract<Awaited<ReturnType<typeof world>>, { ok: true }>;
async function withMintedWorld<T>(consume: (f: F, s: Saver, p: Paired, w: World) => Promise<T>) {
  return withMintedPair(async (f, s, p) => {
    const w = await world(f.session, request(f, p));
    if (!w.ok) throw new Error(JSON.stringify(w));
    try {
      return await consume(f, s, p, w);
    } finally {
      worldDomain.disposeBetaSkirtSavedAnnularObservedPlacementDisplayedBodyWorldInitialPreflightV1(
        w.owner,
      );
    }
  });
}
const runtimeRequest = (f: F, p: Paired, w: World) => ({
  ...request(f, p),
  worldInitialOwner: w.owner,
  expectedWorldReportSha256: w.report.reportSha256,
});
const worldLife = (w: World) =>
  worldDomain.getBetaSkirtSavedAnnularObservedPlacementDisplayedBodyWorldInitialPreflightLifetimeV1(
    w.owner,
  );

describe('private minted garment/pair/world → observed runtime source', () => {
  it('preserves the genuine cube physical refusal and all private seals without minting a source', async () => {
    await withMintedWorld(async (f, _s, p, w) => {
      const before = await f.session.projectLatestGarment(f.generation);
      if (!before?.projection.normalizedMaterial) throw new Error('Missing retained material.');
      const rest = new Uint8Array(
        before.projection.normalizedMaterial.normalizedV5.simulation.constraints.continuumStrain.triangleRestFrames,
      ).slice();
      const result = await runtime(f.session, runtimeRequest(f, p, w));
      expect(result).toMatchObject({
        ok: false,
        owner: null,
        generation: f.generation,
        sourceContextBound: true,
        code: 'source-physical-gate-blocked',
      });
      if (result.ok || !result.report) throw new Error(JSON.stringify(result));
      expect(result.report.bindings).toMatchObject({
        garmentReportSha256: before.projection.report.canonicalSha256,
        pairReportSha256: p.report.reportSha256,
        worldReportSha256: w.report.reportSha256,
      });
      expect(result.report.upstreamPair).toEqual(p.report);
      expect(result.report.upstreamWorld).toEqual(w.report);
      expect(result.report.blockers.length).toBeGreaterThan(0);
      const after = await f.session.projectLatestGarment(f.generation);
      expect(
        new Uint8Array(
          after!.projection.normalizedMaterial!.normalizedV5.simulation.constraints.continuumStrain.triangleRestFrames,
        ),
      ).toEqual(rest);
      expect(pairLife(p.owner)).not.toBeNull();
      expect(worldLife(w)).not.toBeNull();
      expect(f.body.input.isCurrent()).toBe(true);
    });
  }, 120_000);

  it('authenticates sessions, exact minted pair/world relationship, generation and both report seals', async () => {
    await withMintedWorld(async (f, _s, p, w) => {
      let reads = 0;
      const hostile = new Proxy(
        {},
        {
          get() {
            reads++;
            throw new Error('get');
          },
          ownKeys() {
            reads++;
            throw new Error('keys');
          },
        },
      ) as never;
      const legacy = createPatternImportDxfProductSavedAnnularGarmentSessionV1();
      try {
        for (const session of [legacy, { ...f.session }, new Proxy(f.session, {}), null])
          expect(await runtime(session, hostile)).toMatchObject({
            ok: false,
            code: 'invalid-saved-garment-session',
          });
        expect(reads).toBe(0);
      } finally {
        legacy.dispose();
      }
      for (const candidate of [{ ...w.owner }, new Proxy(w.owner, {})])
        expect(
          await runtime(f.session, {
            ...runtimeRequest(f, p, w),
            worldInitialOwner: candidate as never,
          }),
        ).toMatchObject({ ok: false, code: 'unissued-world-preflight' });
      expect(
        await runtime(f.session, {
          ...runtimeRequest(f, p, w),
          observedPairOwner: { ...p.owner } as never,
        }),
      ).toMatchObject({ ok: false, code: 'unissued-observed-pair' });
      expect(
        await runtime(f.session, {
          ...runtimeRequest(f, p, w),
          expectedGeneration: f.generation + 1,
        }),
      ).toMatchObject({ ok: false, code: 'stale-generation' });
      expect(
        await runtime(f.session, {
          ...runtimeRequest(f, p, w),
          expectedPairReportSha256: 'f'.repeat(64),
        }),
      ).toMatchObject({ ok: false, code: 'pair-report-mismatch' });
      expect(
        await runtime(f.session, {
          ...runtimeRequest(f, p, w),
          expectedWorldReportSha256: 'f'.repeat(64),
        }),
      ).toMatchObject({ ok: false, code: 'world-report-mismatch' });
      const otherPair = await pair(f.session, {
        expectedGeneration: f.generation,
        displayedBodyOwner: f.body.bodyOwner,
        displayedBodyBinding: f.body.binding,
      });
      if (!otherPair.ok) throw new Error(JSON.stringify(otherPair));
      try {
        expect(await runtime(f.session, runtimeRequest(f, otherPair, w))).toMatchObject({
          ok: false,
          code: 'world-pair-mismatch',
        });
      } finally {
        disposePair(otherPair.owner);
      }
      expect(worldLife(w)).not.toBeNull();
      expect(pairLife(p.owner)).not.toBeNull();
    });
  }, 120_000);

  it('forgets disposed world and pair records while retaining the borrowed garment source', async () => {
    await withMintedWorld(async (f, _s, p, w) => {
      worldDomain.disposeBetaSkirtSavedAnnularObservedPlacementDisplayedBodyWorldInitialPreflightV1(
        w.owner,
      );
      expect(await runtime(f.session, runtimeRequest(f, p, w))).toMatchObject({
        ok: false,
        code: 'unissued-world-preflight',
      });
      expect(pairLife(p.owner)).not.toBeNull();
      const next = await world(f.session, request(f, p));
      if (!next.ok) throw new Error(JSON.stringify(next));
      disposePair(p.owner);
      expect(worldLife(next)).toBeNull();
      expect(await runtime(f.session, runtimeRequest(f, p, next))).toMatchObject({
        ok: false,
        code: 'unissued-observed-pair',
      });
      expect(await f.session.projectLatestGarment(f.generation)).not.toBeNull();
      expect(await mesh(f.session, f.generation)).not.toBeNull();
      expect(f.body.input.isCurrent()).toBe(true);
    });
  }, 120_000);

  it('rejects children after same-generation garment replacement and compiler generation replacement', async () => {
    await withMintedWorld(async (f, s, p, w) => {
      expect(
        (
          await f.session.advanceSavedGarment({
            expectedGeneration: f.generation,
            readCurrentPlacement: s.freshRead,
          })
        ).ok,
      ).toBe(true);
      expect(worldLife(w)).toBeNull();
      expect(await runtime(f.session, runtimeRequest(f, p, w))).toMatchObject({
        ok: false,
        code: 'unissued-observed-pair',
      });
      await withFirstSaveSourceV3(async (source) => {
        const next = await f.session.consume(source);
        if (!next.ok) throw new Error(JSON.stringify(next));
        expect(next.generation).toBe(f.generation + 1);
        expect(await runtime(f.session, runtimeRequest(f, p, w))).toMatchObject({
          ok: false,
          code: 'stale-generation',
        });
        expect(await mesh(f.session, f.generation)).toBeNull();
        expect(await mesh(f.session, next.generation)).not.toBeNull();
      });
      expect(f.body.input.isCurrent()).toBe(true);
    });
  }, 120_000);

  it('cancels a pending fresh borrowed-body read without revoking its pair/world/body/garment', async () => {
    await withMintedWorld(async (f, _s, p, w) => {
      const entered = deferred<void>(),
        release = deferred<void>();
      f.body.hooks.beforeReadModel = async () => {
        entered.resolve();
        await release.promise;
      };
      const caller = new AbortController();
      let ownReads = 0;
      for (const key of ['aborted', 'addEventListener', 'removeEventListener'])
        Object.defineProperty(caller.signal, key, {
          get() {
            ownReads++;
            throw new Error('Caller member');
          },
        });
      const pending = runtime(f.session, runtimeRequest(f, p, w), caller.signal);
      await entered.promise;
      caller.abort();
      expect(await pending).toMatchObject({
        ok: false,
        code: 'session-cancelled',
        sourceContextBound: true,
      });
      expect(ownReads).toBe(0);
      expect(worldLife(w)).not.toBeNull();
      expect(pairLife(p.owner)).not.toBeNull();
      expect(
        getSavedModelDisplayedTriangleBodyLifetimeV2(f.body.bodyOwner, f.body.binding),
      ).not.toBeNull();
      f.body.hooks.beforeReadModel = undefined;
      release.resolve();
      expect(await projectPair(p.owner)).not.toBeNull();
      expect(await f.session.projectLatestGarment(f.generation)).not.toBeNull();
      expect(f.body.input.isCurrent()).toBe(true);
    });
  }, 120_000);

  it('discards a genuine delayed physical report after cancellation without cancelling borrowed parents', async () => {
    await withMintedWorld(async (f, _s, p, w) => {
      const real = runtimeDomain.buildBetaSkirtSavedAnnularObservedPlacementRuntimeSourceV1;
      const entered = deferred<void>(),
        release = deferred<void>();
      const caller = new AbortController();
      let physicalReport = false;
      const spy = vi
        .spyOn(runtimeDomain, 'buildBetaSkirtSavedAnnularObservedPlacementRuntimeSourceV1')
        .mockImplementation(async (input, signal) => {
          const result = await real(input, signal);
          physicalReport = !result.ok && !!result.report;
          entered.resolve();
          await release.promise;
          return result;
        });
      try {
        const pending = runtime(f.session, runtimeRequest(f, p, w), caller.signal);
        await entered.promise;
        expect(physicalReport).toBe(true);
        caller.abort();
        expect(await pending).toMatchObject({ ok: false, code: 'session-cancelled' });
        expect(worldLife(w)).not.toBeNull();
        expect(pairLife(p.owner)).not.toBeNull();
      } finally {
        release.resolve();
        spy.mockRestore();
      }
    });
  }, 120_000);

  it('rechecks terminal cancellation after the genuine builder final host callback', async () => {
    await withMintedWorld(async (f, _s, p, w) => {
      const real = runtimeDomain.buildBetaSkirtSavedAnnularObservedPlacementRuntimeSourceV1;
      const caller = new AbortController();
      let polls = 0;
      const spy = vi
        .spyOn(runtimeDomain, 'buildBetaSkirtSavedAnnularObservedPlacementRuntimeSourceV1')
        .mockImplementation(async (input, signal) => {
          const result = await real(input, signal);
          f.body.hooks.beforeReadObservation = () => {
            polls++;
            caller.abort();
          };
          return result;
        });
      try {
        expect(await runtime(f.session, runtimeRequest(f, p, w), caller.signal)).toMatchObject({
          ok: false,
          code: 'session-cancelled',
        });
        expect(polls).toBeGreaterThan(0);
      } finally {
        f.body.hooks.beforeReadObservation = undefined;
        spy.mockRestore();
      }
      expect(worldLife(w)).not.toBeNull();
      expect(pairLife(p.owner)).not.toBeNull();
      expect(f.body.input.isCurrent()).toBe(true);
    });
  }, 120_000);

  it('projects exact detached compiler spans before issuance and refuses stale, cancelled or forged sessions', async () => {
    await withObservedFirstSaveFixtureV3(async (f) => {
      const a = await mesh(f.session, f.generation);
      if (!a) throw new Error('No private compiler projection.');
      expect(a.generation).toBe(f.generation);
      expect(a.projection.composerCanonicalSha256).toBe(
        f.session.snapshot().composerCanonicalSha256,
      );
      expect(a.projection.mesh.boundarySamples.length).toBeGreaterThan(0);
      expect(
        a.projection.mesh.boundarySamples.every(
          (s) => typeof s.sourceCurveId === 'string' && s.sourceCurveId.length > 0,
        ),
      ).toBe(true);
      const original = a.projection.mesh.restPositions2Mm.slice();
      a.projection.mesh.restPositions2Mm.fill(98765);
      a.projection.mesh.triangles.fill(0);
      a.projection.triangleMaterialFrames2.fill(0);
      const b = await f.session.projectLatestMesh(f.generation);
      expect(b?.projection.mesh.restPositions2Mm).toEqual(original);
      expect(b?.projection.mesh.triangles.some((v) => v !== 0)).toBe(true);
      expect(await mesh({ ...f.session }, f.generation)).toBeNull();
      expect(await mesh(new Proxy(f.session, {}), f.generation)).toBeNull();
      expect(await mesh(f.session, f.generation + 1)).toBeNull();
      const caller = new AbortController();
      const pending = mesh(f.session, f.generation, caller.signal);
      caller.abort();
      expect(await pending).toBeNull();
      expect(await mesh(f.session, f.generation)).not.toBeNull();
      f.session.dispose();
      expect(await mesh(f.session, f.generation)).toBeNull();
    });
  }, 120_000);
});
