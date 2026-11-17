import { writeObservedPlacementEvidenceV1 } from '../../../tests/cloth/fixtures/observed-placement-v3/write-evidence';
import { describe, expect, it, vi } from 'vitest';
import {
  withObservedFirstSaveFixtureV3,
  withFirstSaveSourceV3,
} from './pattern-import-dxf-product-saved-annular-observed-placement-first-save-v3.test-fixture';
import {
  issuePatternImportDxfProductSavedAnnularObservedPlacementV3 as issue,
  createPatternImportDxfProductSavedAnnularObservedPlacementGarmentSessionV1 as create,
  buildPatternImportDxfProductSavedAnnularObservedPlacementGarmentObservedBodyPairV1 as pair,
  buildPatternImportDxfProductSavedAnnularObservedPlacementGarmentWorldInitialPreflightV1 as world,
} from './pattern-import-dxf-product-saved-annular-observed-placement-garment-session-v1';
import { createPatternImportDxfProductSavedAnnularGarmentSessionV1 } from './pattern-import-dxf-product-saved-annular-garment-session-v1';
import * as worldDomain from './beta-skirt-saved-annular-observed-placement-displayed-body-world-initial-preflight-v1';
import {
  buildBetaSkirtSavedAnnularObservedPlacementDisplayedBodyProductPlacementV1,
  projectBetaSkirtSavedAnnularObservedPlacementDisplayedBodyProductPlacementV1 as projectPair,
  getBetaSkirtSavedAnnularObservedPlacementDisplayedBodyProductPlacementLifetimeV1 as pairLife,
  disposeBetaSkirtSavedAnnularObservedPlacementDisplayedBodyProductPlacementV1 as disposePair,
} from './beta-skirt-saved-annular-observed-placement-displayed-body-product-placement-v1';
import { withObservedPlacementDisplayedBodyPairSourceV1 } from './beta-skirt-saved-annular-observed-placement-displayed-body-product-placement-v1.test-fixture';

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

describe('private minted observed pair → world preflight', () => {
  it(
    'runs real first-save→private garment/pair→world and preserves exact seals/rest/82+498 state and blockers',
    async () =>
      withMintedPair(async (f, _s, p) => {
        const local = await f.session.projectLatestGarment(f.generation);
        if (!local?.projection.normalizedMaterial) throw new Error('Missing real local material.');
        const rest = new Uint8Array(
          local.projection.normalizedMaterial.normalizedV5.simulation.constraints.continuumStrain
            .triangleRestFrames,
        ).slice();
        const result = await world(f.session, request(f, p));
        if (!result.ok) throw new Error(JSON.stringify(result));
        try {
          expect(result).toMatchObject({ generation: f.generation, sourceContextBound: true });
          expect(result.report.bindings.garmentReportSha256).toBe(
            local.projection.report.canonicalSha256,
          );
          expect(result.report.bindings.pairReportSha256).toBe(p.report.reportSha256);
          expect(result.report.counts).toEqual({
            vertices: 580,
            triangles: 912,
            assemblyOrderSeamPairs: 34,
            zeroInverseMassPins: 82,
            positiveInverseMassParticles: 498,
          });
          expect(result.report.upstreamPair).toEqual(p.report);
          expect(result.report.blockers).toEqual(expect.arrayContaining([...p.report.blockers]));
          expect(result.report.claims).toMatchObject({
            runtimeAuthority: false,
            observedBodyTargetConfirmed: true,
          });
          const projection =
            await worldDomain.projectBetaSkirtSavedAnnularObservedPlacementDisplayedBodyWorldInitialPreflightV1(
              result.owner,
            );
          if (!projection) throw new Error('World projection failed.');
          expect(
            new Uint8Array(
              projection.normalizedV5.simulation.constraints.continuumStrain.triangleRestFrames,
            ),
          ).toEqual(rest);
          const inverseMass = Array.from(projection.initialWorldPositionsInvMassKg).filter(
            (_, i) => i % 4 === 3,
          );
          expect(inverseMass.filter((w) => Object.is(w, 0))).toHaveLength(82);
          expect(inverseMass.filter((w) => w > 0)).toHaveLength(498);
          writeObservedPlacementEvidenceV1(
            'cloth-world-session-first-save-report.json',
            JSON.stringify(
              {
                scope:
                  'Genuine private source/first-save/CAS/read/pair/world wiring; synthetic cube host, fixture transport/nominal assets only; no actual V9/backend/runtime acceptance',
                generation: result.generation,
                sourceContextBound: result.sourceContextBound,
                writes: f.put.mock.calls.length,
                report: result.report,
              },
              null,
              2,
            ),
          );
        } finally {
          worldDomain.disposeBetaSkirtSavedAnnularObservedPlacementDisplayedBodyWorldInitialPreflightV1(
            result.owner,
          );
        }
        expect(await projectPair(p.owner)).not.toBeNull();
        expect(await f.session.projectLatestGarment(f.generation)).not.toBeNull();
        expect(f.body.input.isCurrent()).toBe(true);
      }),
    90_000,
  );

  it(
    'authenticates session and exact minted pair, refuses wrong generation/seal and same-gen foreign capability without revocation',
    async () =>
      withMintedPair(async (f, s, p) => {
        let fields = 0;
        const hostile = new Proxy(
          {},
          {
            get() {
              fields++;
              throw new Error('get');
            },
            ownKeys() {
              fields++;
              throw new Error('keys');
            },
          },
        ) as never;
        const legacy = createPatternImportDxfProductSavedAnnularGarmentSessionV1();
        try {
          for (const session of [legacy, { ...f.session }, new Proxy(f.session, {}), null])
            expect(await world(session, hostile)).toMatchObject({
              ok: false,
              code: 'invalid-saved-garment-session',
            });
          expect(fields).toBe(0);
        } finally {
          legacy.dispose();
        }
        for (const owner of [{ ...p.owner }, new Proxy(p.owner, {})])
          expect(
            await world(f.session, { ...request(f, p), observedPairOwner: owner as never }),
          ).toMatchObject({ ok: false, code: 'unissued-observed-pair' });
        expect(
          await world(f.session, { ...request(f, p), expectedGeneration: f.generation + 1 }),
        ).toMatchObject({ ok: false, code: 'stale-generation' });
        expect(
          await world(f.session, { ...request(f, p), expectedPairReportSha256: 'f'.repeat(64) }),
        ).toMatchObject({ ok: false, code: 'pair-report-mismatch' });
        await withFirstSaveSourceV3(async (source) => {
          const other = create();
          try {
            const compiled = await other.consume(source);
            if (!compiled.ok) throw new Error(JSON.stringify(compiled));
            expect(compiled.generation).toBe(f.generation);
            expect(
              (
                await other.advanceSavedGarment({
                  expectedGeneration: compiled.generation,
                  readCurrentPlacement: s.freshRead,
                })
              ).ok,
            ).toBe(true);
            expect(await world(other, request(f, p))).toMatchObject({
              ok: false,
              code: 'unissued-observed-pair',
            });
          } finally {
            other.dispose();
          }
        });
        await withObservedPlacementDisplayedBodyPairSourceV1(async (source) => {
          const raw =
            await buildBetaSkirtSavedAnnularObservedPlacementDisplayedBodyProductPlacementV1({
              ...source.pairRequest,
              hostCompileGeneration: f.generation,
            });
          if (!raw.ok) throw new Error(JSON.stringify(raw));
          try {
            expect(
              await world(f.session, {
                expectedGeneration: f.generation,
                observedPairOwner: raw.owner,
                expectedPairReportSha256: raw.report.reportSha256,
              }),
            ).toMatchObject({ ok: false, code: 'unissued-observed-pair' });
          } finally {
            disposePair(raw.owner);
          }
        });
        expect(pairLife(p.owner)).not.toBeNull();
        expect(await f.session.projectLatestGarment(f.generation)).not.toBeNull();
      }),
    90_000,
  );

  it(
    'releases minted registry entries on same-generation replacement and pair disposal',
    async () =>
      withMintedPair(async (f, s, p) => {
        const before = await world(f.session, request(f, p));
        if (!before.ok) throw new Error(JSON.stringify(before));
        expect(
          (
            await f.session.advanceSavedGarment({
              expectedGeneration: f.generation,
              readCurrentPlacement: s.freshRead,
            })
          ).ok,
        ).toBe(true);
        expect(
          worldDomain.getBetaSkirtSavedAnnularObservedPlacementDisplayedBodyWorldInitialPreflightLifetimeV1(
            before.owner,
          ),
        ).toBeNull();
        expect(await world(f.session, request(f, p))).toMatchObject({
          ok: false,
          code: 'unissued-observed-pair',
        });
        const next = await pair(f.session, {
          expectedGeneration: f.generation,
          displayedBodyOwner: f.body.bodyOwner,
          displayedBodyBinding: f.body.binding,
        });
        if (!next.ok) throw new Error(JSON.stringify(next));
        disposePair(next.owner);
        expect(await world(f.session, request(f, next))).toMatchObject({
          ok: false,
          code: 'unissued-observed-pair',
        });
        expect(await f.session.projectLatestGarment(f.generation)).not.toBeNull();
        expect(f.body.input.isCurrent()).toBe(true);
      }),
    90_000,
  );

  it(
    'uses native caller/child links; cancellation disposes only owned preflight and permits reuse of borrowed pair',
    async () =>
      withMintedPair(async (f, _s, p) => {
        let ownReads = 0;
        const poison = (signal: AbortSignal) => {
          for (const key of ['aborted', 'addEventListener', 'removeEventListener'])
            Object.defineProperty(signal, key, {
              configurable: true,
              get() {
                ownReads++;
                throw new Error('Own signal member must not execute.');
              },
            });
        };
        const caller = new AbortController();
        poison(caller.signal);
        const result = await world(f.session, request(f, p), caller.signal);
        if (!result.ok) throw new Error(JSON.stringify(result));
        poison(
          worldDomain.getBetaSkirtSavedAnnularObservedPlacementDisplayedBodyWorldInitialPreflightLifetimeV1(
            result.owner,
          )!,
        );
        caller.abort();
        expect(
          worldDomain.getBetaSkirtSavedAnnularObservedPlacementDisplayedBodyWorldInitialPreflightLifetimeV1(
            result.owner,
          ),
        ).toBeNull();
        expect(ownReads).toBe(0);
        expect(await projectPair(p.owner)).not.toBeNull();
        expect(f.body.input.isCurrent()).toBe(true);
        const retry = await world(f.session, request(f, p));
        if (!retry.ok) throw new Error(JSON.stringify(retry));
        worldDomain.disposeBetaSkirtSavedAnnularObservedPlacementDisplayedBodyWorldInitialPreflightV1(
          retry.owner,
        );
      }),
    90_000,
  );

  it(
    'discards a genuine late world child when its private source is replaced',
    async () =>
      withMintedPair(async (f, _s, p) => {
        const real =
          worldDomain.buildBetaSkirtSavedAnnularObservedPlacementDisplayedBodyWorldInitialPreflightV1;
        const entered = deferred<void>();
        const release = deferred<void>();
        let child: Extract<Awaited<ReturnType<typeof real>>, { ok: true }> | null = null;
        const spy = vi
          .spyOn(
            worldDomain,
            'buildBetaSkirtSavedAnnularObservedPlacementDisplayedBodyWorldInitialPreflightV1',
          )
          .mockImplementation(async (value, signal) => {
            const result = await real(value, signal);
            if (result.ok) child = result;
            entered.resolve();
            await release.promise;
            return result;
          });
        try {
          const pending = world(f.session, request(f, p));
          await entered.promise;
          expect(child).not.toBeNull();
          await withFirstSaveSourceV3(async (source) => {
            const replacement = await f.session.consume(source);
            if (!replacement.ok) throw new Error(JSON.stringify(replacement));
            expect(replacement.generation).toBe(f.generation + 1);
            release.resolve();
            expect(await pending).toMatchObject({ ok: false, sourceContextBound: true });
          });
          expect(
            worldDomain.getBetaSkirtSavedAnnularObservedPlacementDisplayedBodyWorldInitialPreflightLifetimeV1(
              child!.owner,
            ),
          ).toBeNull();
          expect(f.body.input.isCurrent()).toBe(true);
        } finally {
          release.resolve();
          spy.mockRestore();
        }
      }),
    90_000,
  );

  it(
    'rechecks cancellation after genuine host polls following the final async builder continuation',
    async () =>
      withMintedPair(async (f, _s, p) => {
        const real =
          worldDomain.buildBetaSkirtSavedAnnularObservedPlacementDisplayedBodyWorldInitialPreflightV1;
        const caller = new AbortController();
        let polls = 0;
        let child: Extract<Awaited<ReturnType<typeof real>>, { ok: true }> | null = null;
        const spy = vi
          .spyOn(
            worldDomain,
            'buildBetaSkirtSavedAnnularObservedPlacementDisplayedBodyWorldInitialPreflightV1',
          )
          .mockImplementation(async (value, signal) => {
            const result = await real(value, signal);
            if (result.ok) {
              child = result;
              f.body.hooks.beforeReadObservation = () => {
                polls++;
                caller.abort();
              };
            }
            return result;
          });
        try {
          expect(await world(f.session, request(f, p), caller.signal)).toMatchObject({
            ok: false,
            code: 'session-cancelled',
          });
          expect(polls).toBeGreaterThan(0);
          expect(child).not.toBeNull();
          expect(
            worldDomain.getBetaSkirtSavedAnnularObservedPlacementDisplayedBodyWorldInitialPreflightLifetimeV1(
              child!.owner,
            ),
          ).toBeNull();
        } finally {
          f.body.hooks.beforeReadObservation = undefined;
          spy.mockRestore();
        }
        expect(await projectPair(p.owner)).not.toBeNull();
        expect(f.body.input.isCurrent()).toBe(true);
      }),
    90_000,
  );
});
