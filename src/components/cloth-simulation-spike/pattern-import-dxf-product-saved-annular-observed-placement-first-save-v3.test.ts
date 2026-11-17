import { Buffer } from 'node:buffer';
import { writeObservedPlacementEvidenceV1 } from '../../../tests/cloth/fixtures/observed-placement-v3/write-evidence';
import { describe, expect, it, vi } from 'vitest';
import * as d0 from 'lib/cloth/domain/dxf-product-two-panel-skirt-garment-semantics-v1';
import {
  decodePatternImportDxfProductCompositeSidecarV3,
  readPatternImportDxfProductCompositeComponentBytesV3,
} from 'lib/cloth/domain/pattern-import-dxf-product-composite-sidecar-v3';
import { getSavedModelDisplayedTriangleBodyLifetimeV2 } from 'components/managers/models/components/saved-model-displayed-triangle-body-owner-v2';
import { createPatternImportDxfProductSavedAnnularGarmentSessionV1 } from './pattern-import-dxf-product-saved-annular-garment-session-v1';
import {
  issuePatternImportDxfProductSavedAnnularObservedPlacementV3 as issue,
  createPatternImportDxfProductSavedAnnularObservedPlacementGarmentSessionV1,
  buildPatternImportDxfProductSavedAnnularObservedPlacementGarmentObservedBodyPairV1 as pair,
} from './pattern-import-dxf-product-saved-annular-observed-placement-garment-session-v1';
import * as issuer from './observed-placement-sidecar-issuer-v3';
import { withObservedFirstSaveFixtureV3 } from './pattern-import-dxf-product-saved-annular-observed-placement-first-save-v3.test-fixture';
import { disposeBetaSkirtSavedAnnularObservedPlacementDisplayedBodyProductPlacementV1 } from './beta-skirt-saved-annular-observed-placement-displayed-body-product-placement-v1';

vi.mock('api/api', () => ({ abortableAdminService: vi.fn() }));
// Only nominal assets/stations and synthetic closed-cube observation/storage transport are fixtures.
// Compiler, D0, observed capture/adopter, issuer, CAS codec/reader, garment and pair gates are real.
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
const request = (f: F) => ({
  ...f.intent,
  displayedBodyOwner: f.body.bodyOwner,
  displayedBodyBinding: f.body.binding,
});
async function issued(f: F, signal?: AbortSignal) {
  const result = await issue(f.session, request(f), signal);
  if (!result.ok) throw new Error(JSON.stringify(result));
  return result;
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((accept) => {
    resolve = accept;
  });
  return { promise, resolve };
}

describe('first issuance in private source session (genuine chain; fixture host/transport only)', () => {
  it(
    'starts without Placement, issues privately, writes one existing CAS, fresh-reads then advances real V3 garment/pair',
    async () =>
      withObservedFirstSaveFixtureV3(async (f) => {
        expect(f.initialComponentKinds).toEqual([
          'semantic-product-v1',
          'phase-e-exact-topology-v1',
        ]);
        expect(await f.session.projectLatestGarment(f.generation)).toBeNull();
        expect(f.get).not.toHaveBeenCalled();
        expect(f.put).not.toHaveBeenCalled();
        const result = await issued(f);
        expect(result).toMatchObject({ generation: f.generation, sourceContextBound: true });
        expect(result.owner.claims).toMatchObject({
          persisted: false,
          bodyAdmission: false,
          runtimeAdmission: false,
        });
        expect(f.session.snapshot()).toMatchObject({
          status: 'observed-placement-issued',
          issuedPlacementCanonicalSha256: result.owner.seal.canonicalSha256,
          garmentReportSha256: null,
        });
        expect(await f.session.projectLatestGarment(f.generation)).toBeNull();
        expect(issuer.getObservedPlacementSidecarIssuedLifetimeV3(result.owner)).not.toBeNull();
        const s = await f.bindSaver(result.owner);
        expect(s.projected.document.placementAuthoring.semantics).not.toHaveProperty('body');
        expect(s.projected.document.placementAuthoring.observedTarget).toEqual({
          target: f.target.target,
          canonicalSha256: f.target.canonicalSha256,
        });
        const saved = await s.saver.save(s.saveRequest);
        expect(saved, JSON.stringify(saved)).toMatchObject({ ok: true, writeOutcome: 'verified' });
        expect(f.put).toHaveBeenCalledTimes(1);
        expect(f.put.mock.calls[0]![0].expectedPreviousSidecarSha256).toBe(f.initialSha);
        const envelope = await decodePatternImportDxfProductCompositeSidecarV3(
          Uint8Array.from(Buffer.from(f.storage.stored.sidecarBytes, 'base64')),
        );
        if (!envelope.ok) throw new Error(JSON.stringify(envelope));
        expect(envelope.document.components.map((c) => c.kind)).toEqual([
          'semantic-product-v1',
          'multiseam-placement-v3',
          'phase-e-exact-topology-v1',
        ]);
        expect(
          readPatternImportDxfProductCompositeComponentBytesV3(
            envelope.owner,
            'semantic-product-v1',
          ),
        ).toEqual(f.semanticBytes);
        expect(
          readPatternImportDxfProductCompositeComponentBytesV3(
            envelope.owner,
            'phase-e-exact-topology-v1',
          ),
        ).toEqual(f.exactBytes);
        const advanced = await f.session.advanceSavedGarment({
          expectedGeneration: f.generation,
          readCurrentPlacement: s.freshRead,
        });
        if (!advanced.ok) throw new Error(JSON.stringify(advanced));
        expect(issuer.getObservedPlacementSidecarIssuedLifetimeV3(result.owner)).toBeNull();
        expect(advanced.report.persistedPlacement.authoring.observedTarget.target).toEqual(
          f.target.target,
        );
        const paired = await pair(f.session, {
          expectedGeneration: f.generation,
          displayedBodyOwner: f.body.bodyOwner,
          displayedBodyBinding: f.body.binding,
        });
        if (!paired.ok) throw new Error(JSON.stringify(paired));
        writeObservedPlacementEvidenceV1(
          'cloth-first-save-session-chain-report.json',
          JSON.stringify(
            {
              scope:
                'Genuine private compiler/issuer/CAS/fresh reader/garment/pair; fixture transport and synthetic cube/nominal stations only. No mounted V9, backend or runtime acceptance.',
              compileGeneration: f.generation,
              bodyGeneration: f.body.binding.generation,
              initialComponents: f.initialComponentKinds,
              initialOuterSha256: f.initialSha,
              issuedSeal: result.owner.seal,
              savedSeal: saved.ok ? saved.owner.seal : null,
              finalOuterSha256: f.storage.stored.sidecarSha256,
              writes: f.put.mock.calls.length,
              report: paired.report,
            },
            null,
            2,
          ),
        );
        try {
          expect(paired.report.claims).toMatchObject({
            observedBodyTargetConfirmed: true,
            runtimeAuthority: false,
          });
          expect(paired.report.blockers).toContain('solver-source-admission-not-issued');
          expect(paired.report.blockers).not.toContain('unconfirmed-observed-body-target');
        } finally {
          disposeBetaSkirtSavedAnnularObservedPlacementDisplayedBodyProductPlacementV1(
            paired.owner,
          );
        }
        expect(f.get.mock.calls.length).toBeGreaterThan(2);
      }),
    90_000,
  );

  it('refuses wrong session kinds/proxies before request access; legacy snapshot shape stays unchanged', async () => {
    const observed = createPatternImportDxfProductSavedAnnularObservedPlacementGarmentSessionV1();
    const legacy = createPatternImportDxfProductSavedAnnularGarmentSessionV1();
    let calls = 0;
    const hostile = new Proxy(
      {},
      {
        get() {
          calls++;
          throw new Error('read');
        },
        ownKeys() {
          calls++;
          throw new Error('keys');
        },
      },
    ) as never;
    try {
      for (const value of [legacy, { ...observed }, new Proxy(observed, {}), null])
        expect(await issue(value, hostile)).toMatchObject({
          ok: false,
          generation: 0,
          sourceContextBound: false,
          code: 'invalid-saved-garment-session',
        });
      expect(calls).toBe(0);
      expect(legacy.snapshot()).not.toHaveProperty('issuedPlacementCanonicalSha256');
    } finally {
      observed.dispose();
      legacy.dispose();
    }
  });

  it(
    'captures confirmed intent synchronously and promptly releases private D0 on external issued disposal',
    async () =>
      withObservedFirstSaveFixtureV3(async (f) => {
        const spy = vi.spyOn(d0, 'disposeDxfProductTwoPanelSkirtGarmentSemanticsV1');
        try {
          const mutable = {
            ...request(f),
            garment: structuredClone(f.intent.garment),
            annularParameters: structuredClone(f.intent.annularParameters),
          };
          const pending = issue(f.session, mutable);
          Object.assign(mutable.garment, { frontPieceId: 'caller-changed' });
          mutable.confirmedTargetSha256 = 'f'.repeat(64);
          const result = await pending;
          if (!result.ok) throw new Error(JSON.stringify(result));
          const projection = await issuer.projectObservedPlacementSidecarIssuedV3(result.owner);
          expect(projection?.document.placementAuthoring.semantics.garment.frontPieceId).toBe(
            f.intent.garment.frontPieceId,
          );
          expect(
            await issue(f.session, { ...request(f), expectedGeneration: f.generation + 1 }),
          ).toMatchObject({ ok: false, code: 'stale-generation' });
          expect(issuer.getObservedPlacementSidecarIssuedLifetimeV3(result.owner)).not.toBeNull();
          expect(spy).not.toHaveBeenCalled();
          issuer.disposeObservedPlacementSidecarIssuedV3(result.owner);
          // Before any session poll: its genuine issued-lifetime listener already disposed owned D0.
          expect(spy).toHaveBeenCalledTimes(1);
          expect(
            d0.getDxfProductTwoPanelSkirtGarmentSemanticsLifetimeV1(spy.mock.calls[0]![0]),
          ).toBeNull();
          expect(f.body.input.isCurrent()).toBe(true);
          expect(
            getSavedModelDisplayedTriangleBodyLifetimeV2(f.body.bodyOwner, f.body.binding),
          ).not.toBeNull();
          expect((await issued(f)).ok).toBe(true);
        } finally {
          spy.mockRestore();
        }
      }),
    60_000,
  );

  it(
    'cleans real late-issued children on local cancellation and permits retry without revoking borrowed body',
    async () =>
      withObservedFirstSaveFixtureV3(async (f) => {
        const real = issuer.issueObservedPlacementSidecarV3;
        const entered = deferred<void>();
        const release = deferred<void>();
        let child: issuer.ObservedPlacementSidecarIssuedOwnerV3 | null = null;
        const spy = vi
          .spyOn(issuer, 'issueObservedPlacementSidecarV3')
          .mockImplementation(async (input, signal) => {
            const result = await real(input, signal);
            if (result.ok) child = result.owner;
            entered.resolve();
            await release.promise;
            return result;
          });
        const controller = new AbortController();
        try {
          const pending = issue(f.session, request(f), controller.signal);
          await entered.promise;
          expect(child).not.toBeNull();
          controller.abort();
          release.resolve();
          expect(await pending).toMatchObject({ ok: false, code: 'session-cancelled' });
          expect(issuer.getObservedPlacementSidecarIssuedLifetimeV3(child)).toBeNull();
          expect(f.body.input.isCurrent()).toBe(true);
        } finally {
          release.resolve();
          spy.mockRestore();
        }
        expect((await issued(f)).ok).toBe(true);
      }),
    60_000,
  );

  it(
    'rejects changed target/row and keeps exact source available for explicit reissue',
    async () =>
      withObservedFirstSaveFixtureV3(async (f) => {
        expect(
          await issue(f.session, { ...request(f), confirmedTargetSha256: 'f'.repeat(64) }),
        ).toMatchObject({ ok: false, sourceContextBound: true });
        const original = f.evidenceState.current;
        f.evidenceState.current = {
          ...original,
          row: { ...original.row, cardLockVersion: original.row.cardLockVersion + 1 },
        };
        expect(await issue(f.session, request(f))).toMatchObject({
          ok: false,
          sourceContextBound: true,
        });
        f.evidenceState.current = original;
        expect((await issued(f)).ok).toBe(true);
        expect(f.put).not.toHaveBeenCalled();
      }),
    60_000,
  );

  it(
    'links native caller and issued lifetimes despite hostile own signal members',
    async () =>
      withObservedFirstSaveFixtureV3(async (f) => {
        const caller = new AbortController();
        let ownReads = 0;
        const poison = (signal: AbortSignal) => {
          for (const key of ['addEventListener', 'removeEventListener', 'aborted'])
            Object.defineProperty(signal, key, {
              configurable: true,
              get() {
                ownReads++;
                throw new Error('Caller signal member must not be read.');
              },
            });
        };
        poison(caller.signal);
        const result = await issued(f, caller.signal);
        const lifetime = issuer.getObservedPlacementSidecarIssuedLifetimeV3(result.owner)!;
        poison(lifetime);
        const spy = vi.spyOn(d0, 'disposeDxfProductTwoPanelSkirtGarmentSemanticsV1');
        try {
          caller.abort();
          expect(issuer.getObservedPlacementSidecarIssuedLifetimeV3(result.owner)).toBeNull();
          expect(spy).toHaveBeenCalledTimes(1);
          expect(ownReads).toBe(0);
          expect(f.body.input.isCurrent()).toBe(true);
          expect(() => f.session.dispose()).not.toThrow();
        } finally {
          spy.mockRestore();
        }
      }),
    60_000,
  );

  it(
    'cancels an already dispatched CAS through issued lifetime and preserves unknown write outcome',
    async () =>
      withObservedFirstSaveFixtureV3(async (f) => {
        const controller = new AbortController();
        const result = await issued(f, controller.signal);
        const s = await f.bindSaver(result.owner);
        const entered = deferred<void>();
        f.put.mockImplementationOnce(async () => {
          entered.resolve();
          await new Promise<void>((resolve) => {
            s.transportSignal()!.addEventListener('abort', () => resolve(), { once: true });
          });
          throw new DOMException('cancelled', 'AbortError');
        });
        const pending = s.saver.save(s.saveRequest);
        await Promise.race([
          entered.promise,
          pending.then((result) => {
            throw new Error('CAS returned before PUT: ' + JSON.stringify(result));
          }),
        ]);
        controller.abort();
        expect(await pending).toMatchObject({ ok: false, writeOutcome: 'unknown' });
        expect(f.put).toHaveBeenCalledTimes(1);
        expect(f.body.input.isCurrent()).toBe(true);
        expect(issuer.getObservedPlacementSidecarIssuedLifetimeV3(result.owner)).toBeNull();
      }),
    60_000,
  );
});
