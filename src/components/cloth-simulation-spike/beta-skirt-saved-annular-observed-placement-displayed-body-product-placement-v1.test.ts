import { writeObservedPlacementEvidenceV1 } from '../../../tests/cloth/fixtures/observed-placement-v3/write-evidence';
import { describe, expect, it } from 'vitest';
import {
  ports,
  setup,
  deferred,
} from './beta-skirt-saved-annular-displayed-body-product-placement-v1.test-fixture';
import {
  createObservedPlacementPairCubeBodyFixtureV1,
  withObservedPlacementDisplayedBodyPairSourceV1,
} from './beta-skirt-saved-annular-observed-placement-displayed-body-product-placement-v1.test-fixture';
import {
  BETA_SKIRT_SAVED_ANNULAR_OBSERVED_PLACEMENT_DISPLAYED_BODY_PRODUCT_PLACEMENT_V1,
  buildBetaSkirtSavedAnnularObservedPlacementDisplayedBodyProductPlacementV1 as build,
  projectBetaSkirtSavedAnnularObservedPlacementDisplayedBodyProductPlacementV1 as project,
  getBetaSkirtSavedAnnularObservedPlacementDisplayedBodyProductPlacementLifetimeV1 as lifetime,
  disposeBetaSkirtSavedAnnularObservedPlacementDisplayedBodyProductPlacementV1 as dispose,
} from './beta-skirt-saved-annular-observed-placement-displayed-body-product-placement-v1';
import * as current from './beta-skirt-personalized-displayed-body-product-placement-v2';
import {
  buildPatternImportDxfProductSavedAnnularGarmentV1,
  disposePatternImportDxfProductSavedAnnularGarmentV1,
} from 'lib/cloth/domain/pattern-import-dxf-product-saved-annular-garment-v1';
import {
  projectPatternImportDxfProductSavedAnnularObservedPlacementGarmentV1 as projectGarment,
  getPatternImportDxfProductSavedAnnularObservedPlacementGarmentLifetimeV1 as garmentLifetime,
} from 'lib/cloth/domain/pattern-import-dxf-product-saved-annular-observed-placement-garment-v1';
import {
  getSavedModelDisplayedTriangleBodyLifetimeV2,
  projectSavedModelDisplayedTriangleBodyV2,
} from 'components/managers/models/components/saved-model-displayed-triangle-body-owner-v2';

describe('persisted V3 observed target → genuine pair; explicit synthetic cube/transport', () => {
  it('matches fresh target, executes real section/collision/signed kernels and retains physical blockers', async () => {
    await withObservedPlacementDisplayedBodyPairSourceV1(
      async ({ pairRequest, garmentOwner, body, target, state }) => {
        ports.realDiagnostics = true;
        const before = (await projectGarment(garmentOwner))!;
        const rest = new Uint8Array(
          before.normalizedMaterial!.normalizedV5.simulation.constraints.continuumStrain.triangleRestFrames,
        ).slice();
        const result = await build(pairRequest);
        if (!result.ok) throw new Error(JSON.stringify(result));
        try {
          const projected = await project(result.owner);
          expect(projected).not.toBeNull();
          const report = result.report;
          expect(report.source).toMatchObject({
            kind: 'saved-annular-observed-placement-garment-v1',
            mappedOriginM: [0, 0, 0],
            persistedTargetDisposition: 'fresh-observed-target-matched',
            observedTarget: {
              target: target.target,
              canonicalSha256: target.canonicalSha256,
            },
          });
          expect(report.claims).toMatchObject({
            persistedObservedTargetMatched: true,
            observedBodyTargetConfirmed: true,
            runtimeAuthority: false,
            viewportAuthorityAuthenticated: false,
          });
          expect(report.blockers).not.toContain('unconfirmed-observed-body-target');
          expect(report.blockers).toContain('solver-source-admission-not-issued');
          expect(report.blockers.length).toBeGreaterThan(1);
          expect(report.collisionReport).not.toBeNull();
          expect(report.collisionReport?.version).not.toBe('synthetic-test-port');
          expect(report.signedRefresh ?? report.signedRefreshFailure).not.toBeNull();
          expect(report.sectionCompatibility.ok).toBe(true);
          expect(ports.collisionCalls).toBeGreaterThan(0);
          expect(ports.sectionCalls).toBe(1);
          expect(ports.signedCalls).toBe(1);
          expect(projected!.collisionInput.bodyPositionsM).toEqual(
            body.state.observation!.displayMesh.positions,
          );
          expect(projected!.assemblyOrderSeamPairs).toEqual(before.mapping.seamPairs);
          expect(projected!.waistPinVertexIndices).toHaveLength(82);
          expect(projected!.collisionInput.garmentPositionsM).toEqual(
            Float32Array.from(before.mapping.positions3M, (value, i) =>
              Math.fround(value + report.candidate.translationM[i % 3]!),
            ),
          );
          const after = (await projectGarment(garmentOwner))!;
          expect(after.mapping.positions3M).toEqual(before.mapping.positions3M);
          expect(
            new Uint8Array(
              after.normalizedMaterial!.normalizedV5.simulation.constraints.continuumStrain.triangleRestFrames,
            ),
          ).toEqual(rest);
          expect(state.reads).toBeGreaterThan(8);
          expect(
            await current.projectBetaSkirtPersonalizedDisplayedBodyProductPlacementV2(result.owner),
          ).toBeNull();
          expect(
            await current.projectBetaSkirtSavedAnnularDisplayedBodyProductPlacementV1(result.owner),
          ).toBeNull();
          expect(
            current.disposeBetaSkirtSavedAnnularDisplayedBodyProductPlacementV1(result.owner),
          ).toBe(false);
          expect(lifetime(result.owner)?.aborted).toBe(false);
          writeObservedPlacementEvidenceV1(
            'cloth-observed-placement-pair-real-cpu-synthetic-body-20261117.json',
            JSON.stringify(
              {
                evidence: {
                  garment: 'genuine-DXF-AO-D0-local-frame-saved-PlacementV3',
                  body: 'genuine-producer-adopter-with-synthetic-neutral-cube-host-observation',
                  persistedTransport: 'fixture',
                  nominalStations: 'synthetic-test-metadata',
                  kernels: 'real-CPU-section-CollisionV2-V42',
                  viewportOrActualV9Qualification: false,
                },
                report,
              },
              null,
              2,
            ) + '\n',
          );
        } finally {
          dispose(result.owner);
        }
        expect(
          getSavedModelDisplayedTriangleBodyLifetimeV2(body.bodyOwner, body.binding)?.aborted,
        ).toBe(false);
      },
    );
  });

  it('rejects another genuine model target before executing diagnostics', async () => {
    await withObservedPlacementDisplayedBodyPairSourceV1(async ({ pairRequest }) => {
      const other = await createObservedPlacementPairCubeBodyFixtureV1(732);
      try {
        expect(
          await build({
            ...pairRequest,
            displayedBodyOwner: other.bodyOwner,
            displayedBodyBinding: other.binding,
          }),
        ).toMatchObject({ ok: false, code: 'observed-target-mismatch' });
        expect(ports.collisionCalls).toBe(0);
        expect(
          getSavedModelDisplayedTriangleBodyLifetimeV2(other.bodyOwner, other.binding)?.aborted,
        ).toBe(false);
      } finally {
        other.dispose();
      }
    });
  });

  it('revokes on fresh persisted target change and model updatedAt drift', async () => {
    await withObservedPlacementDisplayedBodyPairSourceV1(async ({ pairRequest, state, body }) => {
      const result = await build(pairRequest);
      if (!result.ok) throw new Error(JSON.stringify(result));
      const live = lifetime(result.owner)!;
      state.current = {
        ...state.current,
        placementAuthoring: {
          ...state.current.placementAuthoring,
          observedTarget: {
            ...state.current.placementAuthoring.observedTarget,
            canonicalSha256: 'a'.repeat(64),
          },
        },
      };
      expect(await project(result.owner)).toBeNull();
      expect(live.aborted).toBe(true);
      expect(
        getSavedModelDisplayedTriangleBodyLifetimeV2(body.bodyOwner, body.binding)?.aborted,
      ).toBe(false);
    });
    await withObservedPlacementDisplayedBodyPairSourceV1(async ({ pairRequest, body }) => {
      const result = await build(pairRequest);
      if (!result.ok) throw new Error(JSON.stringify(result));
      const live = lifetime(result.owner)!;
      body.state.model!.updatedAt += '-changed';
      expect(await project(result.owner)).toBeNull();
      expect(live.aborted).toBe(true);
    });
  });

  it('cancels pending genuine body reads locally without revoking borrowed sources', async () => {
    await withObservedPlacementDisplayedBodyPairSourceV1(
      async ({ pairRequest, body, garmentOwner }) => {
        const parentBody = getSavedModelDisplayedTriangleBodyLifetimeV2(
          body.bodyOwner,
          body.binding,
        )!;
        const parentGarment = garmentLifetime(garmentOwner)!;
        let entered = deferred();
        let held = deferred();
        body.hooks.beforeReadModel = async () => {
          entered.resolve();
          await held.promise;
        };
        const abort = new AbortController();
        const pending = build(pairRequest, abort.signal);
        await entered.promise;
        abort.abort();
        expect(await pending).toMatchObject({ ok: false, code: 'cancelled' });
        expect(parentBody.aborted).toBe(false);
        expect(parentGarment.aborted).toBe(false);
        body.hooks.beforeReadModel = undefined;
        held.resolve();
        expect(
          await projectSavedModelDisplayedTriangleBodyV2(body.bodyOwner, body.binding),
        ).toMatchObject({ status: 'projected' });
        const result = await build(pairRequest);
        if (!result.ok) throw new Error(JSON.stringify(result));
        const child = lifetime(result.owner)!;
        entered = deferred();
        held = deferred();
        body.hooks.beforeReadModel = async () => {
          entered.resolve();
          await held.promise;
        };
        const readAbort = new AbortController();
        const read = project(result.owner, readAbort.signal);
        await entered.promise;
        readAbort.abort();
        expect(await read).toBeNull();
        expect(child.aborted).toBe(true);
        expect(parentBody.aborted).toBe(false);
        expect(parentGarment.aborted).toBe(false);
        body.hooks.beforeReadModel = undefined;
        held.resolve();
        expect(
          await projectSavedModelDisplayedTriangleBodyV2(body.bodyOwner, body.binding),
        ).toMatchObject({ status: 'projected' });
        expect(await projectGarment(garmentOwner)).not.toBeNull();
      },
    );
  });

  it('rejects source replacement after diagnostics and synchronous caller abort inside lifetime polling', async () => {
    await withObservedPlacementDisplayedBodyPairSourceV1(async ({ pairRequest, state }) => {
      ports.collisionHook = async () => {
        state.current = {
          ...state.current,
          placementAuthoring: {
            ...state.current.placementAuthoring,
            authoredImportGeneration: state.current.placementAuthoring.authoredImportGeneration + 1,
          },
        };
      };
      expect(await build(pairRequest)).toMatchObject({
        ok: false,
        owner: null,
      });
    });
    ports.collisionHook = null;
    await withObservedPlacementDisplayedBodyPairSourceV1(async ({ pairRequest, body }) => {
      const abort = new AbortController();
      const result = await build(pairRequest, abort.signal);
      if (!result.ok) throw new Error(JSON.stringify(result));
      const child = lifetime(result.owner)!;
      body.hooks.beforeReadObservation = () => abort.abort();
      expect(lifetime(result.owner)).toBeNull();
      expect(child.aborted).toBe(true);
      body.hooks.beforeReadObservation = undefined;
      expect(body.input.isCurrent()).toBe(true);
    });
  });

  it('rejects forged carriers, accessors and old owner kinds without invoking getters', async () => {
    let reads = 0;
    const fake = Object.defineProperty({}, 'report', {
      get() {
        reads++;
        throw new Error('getter invoked');
      },
    });
    const value = {
      schemaVersion:
        BETA_SKIRT_SAVED_ANNULAR_OBSERVED_PLACEMENT_DISPLAYED_BODY_PRODUCT_PLACEMENT_V1,
      savedAnnularObservedPlacementGarmentOwner: fake,
      displayedBodyOwner: fake,
      displayedBodyBinding: {},
      hostCompileGeneration: 1,
    };
    expect(await build(value)).toMatchObject({ ok: false });
    expect(
      await build(
        Object.defineProperty({ ...value }, 'hostCompileGeneration', {
          enumerable: true,
          get() {
            reads++;
            return 1;
          },
        }),
      ),
    ).toMatchObject({ ok: false, code: 'invalid-input' });
    expect(await build({ ...value, savedAnnularGarmentOwner: fake })).toMatchObject({
      ok: false,
      code: 'invalid-input',
    });
    expect(await project(fake)).toBeNull();
    expect(lifetime(fake)).toBeNull();
    expect(dispose(fake)).toBe(false);
    expect(reads).toBe(0);
    expect(ports.collisionCalls).toBe(0);
  });

  it('preserves complete old canonical and genuine historical reports/buffers against captured evaluator', async () => {
    const baselineId: string = 'cloth-observed-pair-original';
    const original = (await import(/* @vite-ignore */ baselineId)) as typeof current;
    const synthetic = setup();
    const oldCanonical = await original.buildBetaSkirtPersonalizedDisplayedBodyProductPlacementV2(
      synthetic.request,
    );
    const newCanonical = await current.buildBetaSkirtPersonalizedDisplayedBodyProductPlacementV2(
      synthetic.request,
    );
    if (!oldCanonical.ok || !newCanonical.ok) throw new Error('Canonical parity setup failed.');
    expect(JSON.stringify(newCanonical.report)).toBe(JSON.stringify(oldCanonical.report));
    expect(
      await current.projectBetaSkirtPersonalizedDisplayedBodyProductPlacementV2(newCanonical.owner),
    ).toEqual(
      await original.projectBetaSkirtPersonalizedDisplayedBodyProductPlacementV2(
        oldCanonical.owner,
      ),
    );
    expect(await project(newCanonical.owner)).toBeNull();
    expect(dispose(newCanonical.owner)).toBe(false);
    current.disposeBetaSkirtPersonalizedDisplayedBodyProductPlacementV2(newCanonical.owner);
    original.disposeBetaSkirtPersonalizedDisplayedBodyProductPlacementV2(oldCanonical.owner);
    await withObservedPlacementDisplayedBodyPairSourceV1(async ({ historicalRequest, body }) => {
      const garment = await buildPatternImportDxfProductSavedAnnularGarmentV1(historicalRequest);
      if (!garment.ok) throw new Error(JSON.stringify(garment));
      const request = {
        schemaVersion: current.BETA_SKIRT_SAVED_ANNULAR_DISPLAYED_BODY_PRODUCT_PLACEMENT_V1,
        savedAnnularGarmentOwner: garment.owner,
        displayedBodyOwner: body.bodyOwner,
        displayedBodyBinding: body.binding,
        hostCompileGeneration: 17,
      };
      try {
        const oldPair =
          await original.buildBetaSkirtSavedAnnularDisplayedBodyProductPlacementV1(request);
        const newPair =
          await current.buildBetaSkirtSavedAnnularDisplayedBodyProductPlacementV1(request);
        if (!oldPair.ok || !newPair.ok) throw new Error('Historical parity setup failed.');
        expect(JSON.stringify(newPair.report)).toBe(JSON.stringify(oldPair.report));
        expect(
          await current.projectBetaSkirtSavedAnnularDisplayedBodyProductPlacementV1(newPair.owner),
        ).toEqual(
          await original.projectBetaSkirtSavedAnnularDisplayedBodyProductPlacementV1(oldPair.owner),
        );
        expect(
          await build({
            schemaVersion:
              BETA_SKIRT_SAVED_ANNULAR_OBSERVED_PLACEMENT_DISPLAYED_BODY_PRODUCT_PLACEMENT_V1,
            savedAnnularObservedPlacementGarmentOwner: garment.owner,
            displayedBodyOwner: body.bodyOwner,
            displayedBodyBinding: body.binding,
            hostCompileGeneration: 17,
          }),
        ).toMatchObject({ ok: false, code: 'saved-garment-unavailable' });
        expect(await project(newPair.owner)).toBeNull();
        expect(dispose(newPair.owner)).toBe(false);
        current.disposeBetaSkirtSavedAnnularDisplayedBodyProductPlacementV1(newPair.owner);
        original.disposeBetaSkirtSavedAnnularDisplayedBodyProductPlacementV1(oldPair.owner);
      } finally {
        disposePatternImportDxfProductSavedAnnularGarmentV1(garment.owner);
      }
    });
  });
});
