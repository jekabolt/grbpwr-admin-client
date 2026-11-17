import { writeFileSync } from 'node:fs';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import * as garmentModule from 'lib/cloth/domain/pattern-import-dxf-product-saved-annular-garment-v1';
import { projectPatternImportDxfProductGarmentMeshComposerV2 } from 'lib/cloth/domain/pattern-import-dxf-product-garment-mesh-composer-v2';
import {
  createPatternImportDxfProductSavedCanonicalMediumAnnularSeedV1,
  withPatternImportDxfProductSavedCanonicalMediumAnnularPlacementInputsV2,
} from 'lib/cloth/domain/pattern-import-dxf-product-saved-canonical-medium-annular-evidence-v1.test-fixture';
import { validateSealedSimulationPackageV5V1 } from 'lib/cloth/compiler/simulation-package-v5-integrity';
import { createPatternImportDxfProductSavedCanonicalMediumAuthoredInputV1Fixture } from './pattern-import-dxf-product-saved-canonical-medium-actual-body-session-v1.test-fixture';
import {
  createPatternImportDxfProductSavedPlacementRequestV1Fixture,
  readPatternImportDxfProductSavedPlacementV1Fixture,
} from './pattern-import-dxf-product-saved-placement-authored-input-v1.test-fixture';
import { BETA_SKIRT_G3B2_PREVIEW_MANNEQUIN_REQUEST_V1 } from './beta-skirt-g3b2-preview-mannequin-request-v1';
import type { BetaSkirtG3b2PreviewMannequinResultV1 } from './beta-skirt-g3b2-preview-mannequin-contract-v1';
import {
  sessionFixture,
  deferredSessionValue,
} from '../managers/models/components/saved-model-displayed-triangle-body-session-v2.test-fixture';
import { buildModelDisplayedTriangleBodyInputV1 } from './model-displayed-triangle-body-input-v1';
import {
  adoptSavedModelDisplayedTriangleBodyV2,
  createSavedModelDisplayedTriangleBodyOwnerV2,
  disposeSavedModelDisplayedTriangleBodyOwnerV2,
  getSavedModelDisplayedTriangleBodyLifetimeV2,
} from '../managers/models/components/saved-model-displayed-triangle-body-owner-v2';
import * as pairModule from './beta-skirt-saved-annular-displayed-body-product-placement-v1';
import * as witnessModule from './beta-skirt-canonical-medium-confined-ao-seam-contact-witness-v2';
import * as envelopeModule from './beta-skirt-coherent-envelope-quality-evidence-v1';
import {
  BETA_SKIRT_SAVED_ANNULAR_DISPLAYED_BODY_WORLD_INITIAL_PREFLIGHT_V1,
  buildBetaSkirtSavedAnnularDisplayedBodyWorldInitialPreflightV1 as build,
  projectBetaSkirtSavedAnnularDisplayedBodyWorldInitialPreflightV1 as project,
  getBetaSkirtSavedAnnularDisplayedBodyWorldInitialPreflightLifetimeV1 as lifetime,
  disposeBetaSkirtSavedAnnularDisplayedBodyWorldInitialPreflightV1 as dispose,
  type BetaSkirtSavedAnnularDisplayedBodyWorldInitialPreflightRequestV1,
} from './beta-skirt-saved-annular-displayed-body-world-initial-preflight-v1';

// Instrument native registrations before production captures the intrinsics. Observed targets
// alone are counted; wrappers delegate unchanged and are restored after this test file.
const listenerAudit = vi.hoisted(() => {
  const add = EventTarget.prototype.addEventListener;
  const remove = EventTarget.prototype.removeEventListener;
  const records = new WeakMap<EventTarget, { adds: number; removes: number; live: Set<unknown> }>();
  function trackedAdd(this: EventTarget, ...args: Parameters<typeof add>) {
    const record = records.get(this);
    if (record && args[0] === 'abort') {
      record.adds++;
      record.live.add(args[1]);
    }
    return Reflect.apply(add, this, args);
  }
  function trackedRemove(this: EventTarget, ...args: Parameters<typeof remove>) {
    const record = records.get(this);
    if (record && args[0] === 'abort') {
      record.removes++;
      record.live.delete(args[1]);
    }
    return Reflect.apply(remove, this, args);
  }
  EventTarget.prototype.addEventListener = trackedAdd;
  EventTarget.prototype.removeEventListener = trackedRemove;
  return {
    watch: (target: EventTarget) => {
      const record = { adds: 0, removes: 0, live: new Set<unknown>() };
      records.set(target, record);
      return record;
    },
    restore: () => {
      EventTarget.prototype.addEventListener = add;
      EventTarget.prototype.removeEventListener = remove;
    },
  };
});
afterAll(() => listenerAudit.restore());

// Only station metadata is synthetic. Genuine DXF/AO/compiler/garment, displayed-input producer,
// body adopter and pair owners execute normally, including real section/CollisionV2/V42 kernels.
// The observed mesh is an explicit cube fixture: this is NOT viewport or actual V9 qualification.
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

async function withSources<T>(
  consume: (context: {
    request: BetaSkirtSavedAnnularDisplayedBodyWorldInitialPreflightRequestV1;
    garment: garmentModule.PatternImportDxfProductSavedAnnularGarmentOwnerV1;
    pair: pairModule.BetaSkirtSavedAnnularDisplayedBodyProductPlacementOwnerV1;
    pairReport: pairModule.BetaSkirtSavedAnnularDisplayedBodyProductPlacementReportV1;
    bodyLifetime: AbortSignal;
    holdModel: () => {
      entered: Promise<void>;
      release: () => void;
      signal: () => AbortSignal | undefined;
    };
    driftModel: () => void;
    driftPlacement: () => void;
    observeHostReads: (hook: (() => void) | null) => void;
  }) => Promise<T>,
): Promise<T> {
  const seed = await createPatternImportDxfProductSavedCanonicalMediumAnnularSeedV1();
  return withPatternImportDxfProductSavedCanonicalMediumAnnularPlacementInputsV2(
    seed,
    async (inputs) => {
      const composer = projectPatternImportDxfProductGarmentMeshComposerV2(inputs.composerV2Owner)!;
      const historicalIntent = {
        status: 'ready',
        composition: { displayBinding: BETA_SKIRT_G3B2_PREVIEW_MANNEQUIN_REQUEST_V1 },
      } as unknown as Extract<BetaSkirtG3b2PreviewMannequinResultV1, { status: 'ready' }>;
      const authored = createPatternImportDxfProductSavedCanonicalMediumAuthoredInputV1Fixture({
        composerSnapshot: inputs.composerV2Owner.snapshot,
        composerProjection: composer,
        mannequin: historicalIntent,
      });
      const placement = await createPatternImportDxfProductSavedPlacementRequestV1Fixture({
        composerSnapshot: inputs.composerV2Owner.snapshot,
        composerProjection: composer,
        compositionRequest: inputs.compositionRequest,
        savedRow: seed.row,
        authored,
      });
      let placementDrift = false;
      const changed = structuredClone(placement);
      const changedPlacement = {
        ...changed,
        placementAuthoring: {
          ...changed.placementAuthoring,
          semantics: {
            ...changed.placementAuthoring.semantics,
            body: {
              ...changed.placementAuthoring.semantics.body,
              bodyRevision: changed.placementAuthoring.semantics.body.bodyRevision + '-changed',
            },
          },
        },
      };
      const builtGarment = await garmentModule.buildPatternImportDxfProductSavedAnnularGarmentV1({
        schemaVersion: garmentModule.PATTERN_IMPORT_DXF_PRODUCT_SAVED_ANNULAR_GARMENT_V1,
        composerV2Owner: inputs.composerV2Owner,
        savedLocalFrameOwner: inputs.composerV3Owner,
        compositionRequest: inputs.compositionRequest,
        writerFrameReceipt: inputs.writerFrameReceipt,
        readCurrentPlacement: () =>
          readPatternImportDxfProductSavedPlacementV1Fixture(
            placementDrift ? changedPlacement : placement,
          ),
      });
      if (!builtGarment.ok) throw new Error(builtGarment.detail);
      const observed = await sessionFixture();
      observed.input.dispose();
      const positions = new Float32Array([
        -0.1, 0, -0.1, 0.1, 0, -0.1, 0.1, 2, -0.1, -0.1, 2, -0.1, -0.1, 0, 0.1, 0.1, 0, 0.1, 0.1, 2,
        0.1, -0.1, 2, 0.1,
      ]);
      const triangles = new Uint32Array([
        0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7, 0, 1, 5, 0, 5, 4, 3, 7, 6, 3, 6, 2, 0, 4, 7, 0, 7, 3, 1,
        2, 6, 1, 6, 5,
      ]);
      const observation = {
        ...observed.state.observation!,
        displayMesh: {
          positions,
          indices: triangles,
          vertexCount: 8,
          triangleCount: 12,
          byteLength: positions.byteLength + triangles.byteLength,
        },
      };
      observed.state.observation = observation;
      let hostReadHook: (() => void) | null = null;
      const producer = await buildModelDisplayedTriangleBodyInputV1({
        readCurrentSnapshot: () => {
          hostReadHook?.();
          return observed.state.observation;
        },
        expected: observation,
      });
      if (!producer.ok) throw new Error(producer.detail);
      const bodyOwner = createSavedModelDisplayedTriangleBodyOwnerV2();
      type Model = typeof observed.state.model;
      let held: ReturnType<typeof deferredSessionValue<Model>> | null = null;
      let entered = deferredSessionValue<void>();
      let readerSignal: AbortSignal | undefined;
      const adopted = await adoptSavedModelDisplayedTriangleBodyV2(bodyOwner, {
        displayedInput: producer.input,
        expectedDisplayedIdentity: producer.input.project()!.identity,
        expectedPersistedModel: {
          id: observed.state.model!.id!,
          updatedAt: observed.state.model!.updatedAt!,
        },
        readCurrentModel: async (signal) => {
          readerSignal = signal;
          if (held) {
            entered.resolve();
            return held.promise;
          }
          return observed.state.model;
        },
      });
      if (adopted.status !== 'committed') throw new Error(JSON.stringify(adopted));
      const builtPair = await pairModule.buildBetaSkirtSavedAnnularDisplayedBodyProductPlacementV1({
        schemaVersion: pairModule.BETA_SKIRT_SAVED_ANNULAR_DISPLAYED_BODY_PRODUCT_PLACEMENT_V1,
        savedAnnularGarmentOwner: builtGarment.owner,
        displayedBodyOwner: bodyOwner,
        displayedBodyBinding: adopted.snapshot.binding,
        hostCompileGeneration: 31,
      });
      if (!builtPair.ok) throw new Error(builtPair.detail);
      try {
        return await consume({
          request: {
            schemaVersion: BETA_SKIRT_SAVED_ANNULAR_DISPLAYED_BODY_WORLD_INITIAL_PREFLIGHT_V1,
            savedAnnularGarmentOwner: builtGarment.owner,
            observedPairOwner: builtPair.owner,
            expected: {
              garmentReportSha256: builtGarment.report.canonicalSha256,
              pairReportSha256: builtPair.report.reportSha256,
            },
          },
          garment: builtGarment.owner,
          pair: builtPair.owner,
          pairReport: builtPair.report,
          bodyLifetime: getSavedModelDisplayedTriangleBodyLifetimeV2(
            bodyOwner,
            adopted.snapshot.binding,
          )!,
          holdModel: () => {
            held = deferredSessionValue<Model>();
            entered = deferredSessionValue<void>();
            const gate = held;
            return {
              entered: entered.promise,
              signal: () => readerSignal,
              release: () => {
                held = null;
                gate.resolve(observed.state.model);
              },
            };
          },
          driftModel: () => {
            observed.state.model = { ...observed.state.model!, updatedAt: '2026-11-18T00:00:00Z' };
          },
          driftPlacement: () => {
            placementDrift = true;
          },
          observeHostReads: (hook) => {
            hostReadHook = hook;
          },
        });
      } finally {
        const pendingRead = held as ReturnType<typeof deferredSessionValue<Model>> | null;
        pendingRead?.resolve(observed.state.model);
        pairModule.disposeBetaSkirtSavedAnnularDisplayedBodyProductPlacementV1(builtPair.owner);
        disposeSavedModelDisplayedTriangleBodyOwnerV2(bodyOwner);
        producer.input.dispose();
        garmentModule.disposePatternImportDxfProductSavedAnnularGarmentV1(builtGarment.owner);
      }
    },
  );
}

describe('saved-annular observed world initial preflight (declared synthetic cube body)', () => {
  it('executes genuine source + real seam-aware kernels, retaining immutable local V5 and every upstream blocker', async () => {
    await withSources(async ({ request, garment, pairReport }) => {
      const before =
        await garmentModule.projectPatternImportDxfProductSavedAnnularGarmentV1(garment);
      const result = await build(request);
      expect(result.ok, JSON.stringify(result)).toBe(true);
      if (!result.ok) return;
      try {
        expect(result.report.counts).toEqual({
          vertices: 580,
          triangles: 912,
          assemblyOrderSeamPairs: 34,
          zeroInverseMassPins: 82,
          positiveInverseMassParticles: 498,
        });
        expect(result.report.upstreamPair).toEqual(pairReport);
        expect(result.report.blockers).toEqual(expect.arrayContaining([...pairReport.blockers]));
        expect(result.report.blockers).toContain('unconfirmed-observed-body-target');
        expect(result.report.claims).toMatchObject({
          sourceAuthority: false,
          runtimeAuthority: false,
          initializationAuthority: false,
          observedBodyTargetConfirmed: false,
        });
        const self = result.report.selfIntersection;
        expect(self.oracle?.intersectionCount).toBeGreaterThan(0);
        expect(self.witnesses.length).toBe(self.oracle?.intersectionCount);
        expect(self.exactRawExcludedResidualAccounting).toBe(true);
        expect(self.excludedConfinedAuthenticatedAoSeamCount + self.residualBlockingCount).toBe(
          self.oracle?.intersectionCount,
        );
        for (const witness of self.witnesses) {
          if (witness.disposition === 'excluded-confined-authenticated-ao-seam-touching') {
            expect(witness.oracleKind).toBe('touching');
            expect(witness.features.length).toBeGreaterThan(0);
            expect(witness.features.every((feature) => feature.confinedCarrier !== null)).toBe(
              true,
            );
          }
        }
        expect(result.report.envelope?.topology.triangleIndexOrderPreserved).toBe(true);
        expect(result.report.orientation.passed).toBe(true);
        const p = await project(result.owner);
        expect(p).not.toBeNull();
        expect(p!.normalizedV5).toEqual(before!.normalizedMaterial!.normalizedV5);
        expect(await validateSealedSimulationPackageV5V1(p!.normalizedV5)).toMatchObject({
          ok: true,
        });
        expect(p!.localPositions3M).toEqual(before!.mapping.positions3M);
        expect(p!.initialWorldPositionsInvMassKg).not.toEqual(
          p!.normalizedV5.simulation.mesh.restPositionsInvMass,
        );
        for (let i = 0; i < 580; i++) {
          expect(p!.initialWorldPositionsInvMassKg[i * 4 + 3]).toBe(
            before!.normalizedMaterial!.initialPhysicalPositionsInvMassKg[i * 4 + 3],
          );
          for (let axis = 0; axis < 3; axis++)
            expect(p!.initialWorldPositionsInvMassKg[i * 4 + axis]).toBe(
              Math.fround(
                before!.mapping.positions3M[i * 3 + axis] + pairReport.candidate.translationM[axis],
              ),
            );
        }
        p!.initialWorldPositionsInvMassKg.fill(99);
        new Uint8Array(
          p!.normalizedV5.simulation.constraints.continuumStrain.triangleRestFrames,
        ).fill(99);
        const again = await project(result.owner);
        expect(again!.normalizedV5).toEqual(before!.normalizedMaterial!.normalizedV5);
        expect(again!.initialWorldPositionsInvMassKg[0]).not.toBe(99);
        const after =
          await garmentModule.projectPatternImportDxfProductSavedAnnularGarmentV1(garment);
        expect(after).toEqual(before);
        if (process.env.CLOTH_WORLD_PREFLIGHT_EVIDENCE_PATH)
          writeFileSync(
            process.env.CLOTH_WORLD_PREFLIGHT_EVIDENCE_PATH,
            JSON.stringify(
              {
                evidence: {
                  garmentAndPairOwners: 'genuine',
                  body: 'synthetic-cube-through-genuine-producer-and-adopter',
                  stationMetadata: 'synthetic',
                  selfEnvelopeCollisionKernels: 'real-cpu',
                  actualV9OrViewportQualified: false,
                },
                report: result.report,
              },
              null,
              2,
            ),
          );
      } finally {
        dispose(result.owner);
      }
    });
  }, 120_000);

  it('rejects forged owners/accessors and expected seal substitution without invoking them', async () => {
    const getter = vi.fn(() => {
      throw new Error('must not run');
    });
    expect(
      await build({
        get schemaVersion() {
          return getter();
        },
      }),
    ).toMatchObject({ ok: false, code: 'invalid-input' });
    expect(getter).not.toHaveBeenCalled();
    await withSources(async ({ request, pair }) => {
      for (const bad of [
        { ...request, expected: { ...request.expected, pairReportSha256: 'a'.repeat(64) } },
        { ...request, expected: { ...request.expected, garmentReportSha256: 'b'.repeat(64) } },
        { ...request, savedAnnularGarmentOwner: { project: getter } },
        { ...request, observedPairOwner: { project: getter } },
        { ...request, hostCompileGeneration: 100 },
      ])
        expect(await build(bad)).toMatchObject({ ok: false, owner: null });
      expect(getter).not.toHaveBeenCalled();
      expect(
        pairModule.getBetaSkirtSavedAnnularDisplayedBodyProductPlacementLifetimeV1(pair)?.aborted,
      ).toBe(false);
    });
  }, 120_000);

  it('rejects detached source float32, W, pin, seam, rest-frame and package-seal tampering', async () => {
    await withSources(async ({ request, pair }) => {
      const originalGarment = garmentModule.projectPatternImportDxfProductSavedAnnularGarmentV1;
      const originalPair = pairModule.projectBetaSkirtSavedAnnularDisplayedBodyProductPlacementV1;
      type G = NonNullable<Awaited<ReturnType<typeof originalGarment>>>;
      type P = NonNullable<Awaited<ReturnType<typeof originalPair>>>;
      const variants: Array<{ name: string; garment?: (p: G) => void; pair?: (p: P) => void }> = [
        {
          name: 'world f32',
          pair: (p) => {
            p.collisionInput.garmentPositionsM[0] += 0.001;
          },
        },
        {
          name: 'free W',
          garment: (p) => {
            const pinSet = new Set(p.mapping.pinnedWaistVertexIndices);
            const v = Array.from({ length: 580 }, (_, i) => i).find((i) => !pinSet.has(i))!;
            p.normalizedMaterial!.initialPhysicalPositionsInvMassKg[v * 4 + 3] = 1;
            p.normalizedMaterial!.normalizedV5.simulation.mesh.restPositionsInvMass[v * 4 + 3] = 1;
          },
        },
        {
          name: 'negative-zero pin',
          garment: (p) => {
            const v = p.mapping.pinnedWaistVertexIndices[0];
            p.normalizedMaterial!.initialPhysicalPositionsInvMassKg[v * 4 + 3] = -0;
            p.normalizedMaterial!.normalizedV5.simulation.mesh.restPositionsInvMass[v * 4 + 3] = -0;
          },
        },
        {
          name: 'pin substitution',
          pair: (p) => {
            p.waistPinVertexIndices[0] = p.waistPinVertexIndices[1];
          },
        },
        {
          name: 'seam substitution',
          pair: (p) => {
            p.assemblyOrderSeamPairs[0] = p.assemblyOrderSeamPairs[1];
          },
        },
        {
          name: 'immutable rest frame',
          garment: (p) => {
            new Uint8Array(
              p.normalizedMaterial!.normalizedV5.simulation.constraints.continuumStrain
                .triangleRestFrames,
            )[0] ^= 1;
          },
        },
        {
          name: 'seal substitution',
          garment: (p) => {
            const packageValue = p.normalizedMaterial!.normalizedV5;
            Object.assign(packageValue, {
              seal: { ...packageValue.seal, aggregateSha256: '0'.repeat(64) },
            });
          },
        },
      ];
      for (const variant of variants) {
        let altered = false;
        const g = vi
          .spyOn(garmentModule, 'projectPatternImportDxfProductSavedAnnularGarmentV1')
          .mockImplementation(async (...args) => {
            const p = await originalGarment(...args);
            if (p && !altered && variant.garment) {
              altered = true;
              variant.garment(p);
            }
            return p;
          });
        const p = vi
          .spyOn(pairModule, 'projectBetaSkirtSavedAnnularDisplayedBodyProductPlacementV1')
          .mockImplementation(async (...args) => {
            const projection = await originalPair(...args);
            if (projection && !altered && variant.pair) {
              altered = true;
              variant.pair(projection);
            }
            return projection;
          });
        try {
          expect(await build(request), variant.name).toMatchObject({ ok: false, owner: null });
          expect(altered, variant.name).toBe(true);
        } finally {
          g.mockRestore();
          p.mockRestore();
        }
        expect(
          pairModule.getBetaSkirtSavedAnnularDisplayedBodyProductPlacementLifetimeV1(pair)?.aborted,
          variant.name,
        ).toBe(false);
      }
    });
  }, 120_000);

  it('retains real reports and blocks explicit orientation failure or residual witness instead of accepting raw seam count', async () => {
    await withSources(async ({ request }) => {
      // Fault injection only into completed real diagnostic reports; never physics evidence.
      const realEnvelope = envelopeModule.evaluateBetaSkirtCoherentEnvelopeQualityV1;
      const envelope = vi
        .spyOn(envelopeModule, 'evaluateBetaSkirtCoherentEnvelopeQualityV1')
        .mockImplementation((input) => {
          const value = realEnvelope(input);
          return {
            ...value,
            triangle: value.triangle && { ...value.triangle, normalReversalCount: 1 },
          };
        });
      const realWitness = witnessModule.evaluateBetaSkirtCanonicalMediumConfinedContactPairV2;
      let ordinal = 0;
      const witness = vi
        .spyOn(witnessModule, 'evaluateBetaSkirtCanonicalMediumConfinedContactPairV2')
        .mockImplementation(async (input) => {
          const value = await realWitness(input);
          ordinal++;
          return ordinal === 1
            ? {
                ...value,
                disposition: 'residual-touching-non-confined-feature',
                confinedToAuthenticatedAoSeam: false,
              }
            : value;
        });
      try {
        const result = await build(request);
        expect(result.ok, JSON.stringify(result)).toBe(true);
        if (!result.ok) return;
        try {
          expect(result.report.worldInitialChecksPassed).toBe(false);
          expect(result.report.selfIntersection.residualBlockingCount).toBeGreaterThan(0);
          expect(result.report.selfIntersection.exactRawExcludedResidualAccounting).toBe(true);
          expect(result.report.blockers).toContain('world-self-contact-not-clear');
          expect(result.report.blockers).toContain('world-initial-orientation-blocked');
          expect(result.report.envelope).not.toBeNull();
          expect(await project(result.owner)).not.toBeNull();
        } finally {
          dispose(result.owner);
        }
      } finally {
        witness.mockRestore();
        envelope.mockRestore();
      }
    });
  }, 120_000);

  it('cancels pending build and projection locally, preserving genuine borrowed pair/body/garment', async () => {
    await withSources(async ({ request, holdModel, pair, garment, bodyLifetime }) => {
      const held = holdModel();
      const cancel = new AbortController();
      const pending = build(request, cancel.signal);
      await held.entered;
      cancel.abort();
      expect(await pending).toMatchObject({ ok: false, code: 'cancelled' });
      expect(held.signal()).toBe(bodyLifetime);
      expect(bodyLifetime.aborted).toBe(false);
      expect(
        pairModule.getBetaSkirtSavedAnnularDisplayedBodyProductPlacementLifetimeV1(pair)?.aborted,
      ).toBe(false);
      held.release();
      const result = await build(request);
      if (!result.ok) throw new Error(JSON.stringify(result));
      const childLifetime = lifetime(result.owner)!;
      const next = holdModel();
      const stopRead = new AbortController();
      const projected = project(result.owner, stopRead.signal);
      await next.entered;
      stopRead.abort();
      expect(await projected).toBeNull();
      expect(childLifetime.aborted).toBe(true);
      expect(bodyLifetime.aborted).toBe(false);
      expect(
        pairModule.getBetaSkirtSavedAnnularDisplayedBodyProductPlacementLifetimeV1(pair)?.aborted,
      ).toBe(false);
      expect(
        garmentModule.getPatternImportDxfProductSavedAnnularGarmentLifetimeV1(garment)?.aborted,
      ).toBe(false);
      next.release();
      expect(
        await pairModule.projectBetaSkirtSavedAnnularDisplayedBodyProductPlacementV1(pair),
      ).not.toBeNull();
    });
  }, 120_000);

  it('keeps build caller linkage after return and disposes only its own child', async () => {
    await withSources(async ({ request, pair }) => {
      const signal = new AbortController();
      const result = await build(request, signal.signal);
      if (!result.ok) throw new Error(JSON.stringify(result));
      const child = lifetime(result.owner)!;
      signal.abort();
      expect(child.aborted).toBe(true);
      expect(await project(result.owner)).toBeNull();
      expect(
        pairModule.getBetaSkirtSavedAnnularDisplayedBodyProductPlacementLifetimeV1(pair)?.aborted,
      ).toBe(false);
      const again = await build(request);
      if (!again.ok) throw new Error(JSON.stringify(again));
      expect(dispose(again.owner)).toBe(true);
      expect(dispose(again.owner)).toBe(false);
      expect(lifetime(again.owner)).toBeNull();
    });
  }, 120_000);

  it('rejects structural signals before any parent link and removes the exact caller listener on disposal', async () => {
    await withSources(async ({ request, garment, pair }) => {
      const garmentSignal =
        garmentModule.getPatternImportDxfProductSavedAnnularGarmentLifetimeV1(garment)!;
      const pairSignal =
        pairModule.getBetaSkirtSavedAnnularDisplayedBodyProductPlacementLifetimeV1(pair)!;
      const garmentLinks = listenerAudit.watch(garmentSignal);
      const pairLinks = listenerAudit.watch(pairSignal);
      const getter = vi.fn(() => false);
      const fake = {
        get aborted() {
          return getter();
        },
      } as unknown as AbortSignal;
      expect(await build(request, fake)).toMatchObject({ ok: false, code: 'invalid-input' });
      expect(getter).not.toHaveBeenCalled();
      expect(garmentLinks.adds).toBe(0);
      expect(pairLinks.adds).toBe(0);
      expect(garmentLinks.live.size).toBe(0);
      expect(pairLinks.live.size).toBe(0);
      const caller = new AbortController();
      const callerLinks = listenerAudit.watch(caller.signal);
      const result = await build(request, caller.signal);
      if (!result.ok) throw new Error(JSON.stringify(result));
      expect(callerLinks.adds).toBe(1);
      expect(callerLinks.removes).toBe(0);
      expect(callerLinks.live.size).toBe(1);
      expect(await project(result.owner, fake)).toBeNull();
      expect(getter).not.toHaveBeenCalled();
      expect(lifetime(result.owner)?.aborted).toBe(false);
      dispose(result.owner);
      expect(callerLinks.removes).toBe(1);
      expect(callerLinks.live.size).toBe(0);
      expect(garmentLinks.live.size).toBe(0);
      expect(pairLinks.live.size).toBe(0);
      expect(pairSignal.aborted).toBe(false);
      expect(garmentSignal.aborted).toBe(false);
    });
  }, 120_000);

  it('rechecks its own lifetime after genuine host-reader reentrancy at final mint and lifetime query', async () => {
    await withSources(async ({ request, observeHostReads, pair, bodyLifetime }) => {
      // Count the actual genuine reader calls in a successful unchanged source path, then abort
      // from the corresponding final callback. There are no synthetic owner/projector ports.
      let reads = 0;
      observeHostReads(() => {
        reads++;
      });
      const baseline = await build(request);
      if (!baseline.ok) throw new Error(JSON.stringify(baseline));
      const finalRead = reads;
      expect(finalRead).toBeGreaterThan(0);
      dispose(baseline.owner);
      const caller = new AbortController();
      reads = 0;
      let fired = false;
      observeHostReads(() => {
        if (++reads === finalRead) {
          fired = true;
          observeHostReads(null);
          caller.abort();
        }
      });
      expect(await build(request, caller.signal)).toMatchObject({
        ok: false,
        owner: null,
        code: 'cancelled',
      });
      expect(fired).toBe(true);
      expect(bodyLifetime.aborted).toBe(false);
      expect(
        pairModule.getBetaSkirtSavedAnnularDisplayedBodyProductPlacementLifetimeV1(pair)?.aborted,
      ).toBe(false);
      const nextCaller = new AbortController();
      const next = await build(request, nextCaller.signal);
      if (!next.ok) throw new Error(JSON.stringify(next));
      observeHostReads(() => {
        observeHostReads(null);
        nextCaller.abort();
      });
      expect(lifetime(next.owner)).toBeNull();
      expect(await project(next.owner)).toBeNull();
      expect(bodyLifetime.aborted).toBe(false);
      expect(
        pairModule.getBetaSkirtSavedAnnularDisplayedBodyProductPlacementLifetimeV1(pair)?.aborted,
      ).toBe(false);
    });
  }, 120_000);

  it('does not mint an owner if the borrowed pair is revoked during an awaited contact proof', async () => {
    await withSources(async ({ request, pair, bodyLifetime, garment }) => {
      const realWitness = witnessModule.evaluateBetaSkirtCanonicalMediumConfinedContactPairV2;
      let entered = false;
      const spy = vi
        .spyOn(witnessModule, 'evaluateBetaSkirtCanonicalMediumConfinedContactPairV2')
        .mockImplementation(async (input) => {
          const witness = await realWitness(input);
          entered = true;
          pairModule.disposeBetaSkirtSavedAnnularDisplayedBodyProductPlacementV1(pair);
          return witness;
        });
      try {
        expect(await build(request)).toMatchObject({ ok: false, owner: null, code: 'cancelled' });
        expect(entered).toBe(true);
        expect(bodyLifetime.aborted).toBe(false);
        expect(
          garmentModule.getPatternImportDxfProductSavedAnnularGarmentLifetimeV1(garment)?.aborted,
        ).toBe(false);
      } finally {
        spy.mockRestore();
      }
    });
  }, 120_000);

  it('retains partial contact and envelope failures as blocked diagnostics without dropping the original pair report', async () => {
    await withSources(async ({ request, pairReport }) => {
      const realWitness = witnessModule.evaluateBetaSkirtCanonicalMediumConfinedContactPairV2;
      let ordinal = 0;
      const witness = vi
        .spyOn(witnessModule, 'evaluateBetaSkirtCanonicalMediumConfinedContactPairV2')
        .mockImplementation(async (input) => {
          if (++ordinal === 2) throw new Error('Explicit synthetic diagnostic budget fault.');
          return realWitness(input);
        });
      const realEnvelope = envelopeModule.evaluateBetaSkirtCoherentEnvelopeQualityV1;
      const envelope = vi
        .spyOn(envelopeModule, 'evaluateBetaSkirtCoherentEnvelopeQualityV1')
        .mockImplementation((input) => {
          const report = realEnvelope(input);
          return {
            ...report,
            status: 'blocked-structural-evidence',
            blockers: ['candidate-zero-length-edge'],
          };
        });
      try {
        const result = await build(request);
        if (!result.ok) throw new Error(JSON.stringify(result));
        try {
          expect(result.report.selfIntersection.oracle?.intersectionCount).toBeGreaterThan(1);
          expect(result.report.selfIntersection.witnesses).toHaveLength(1);
          expect(result.report.selfIntersection.witnessFailure?.detail).toContain(
            'synthetic diagnostic budget',
          );
          expect(result.report.selfIntersection.exactRawExcludedResidualAccounting).toBe(false);
          expect(result.report.selfIntersection.passed).toBe(false);
          expect(result.report.worldInitialChecksPassed).toBe(false);
          expect(result.report.upstreamPair).toEqual(pairReport);
          expect(result.report.blockers).toEqual(
            expect.arrayContaining([
              ...pairReport.blockers,
              'world-self-contact-not-clear',
              'world-initial-envelope-blocked',
            ]),
          );
          expect(await project(result.owner)).not.toBeNull();
        } finally {
          dispose(result.owner);
        }
      } finally {
        witness.mockRestore();
        envelope.mockRestore();
      }
    });
  }, 120_000);

  it.each(['model', 'placement'] as const)(
    'revokes retained diagnostics when fresh %s identity drifts',
    async (kind) => {
      await withSources(async ({ request, driftModel, driftPlacement }) => {
        const result = await build(request);
        if (!result.ok) throw new Error(JSON.stringify(result));
        const child = lifetime(result.owner)!;
        if (kind === 'model') driftModel();
        else driftPlacement();
        expect(await project(result.owner)).toBeNull();
        expect(child.aborted).toBe(true);
        expect(lifetime(result.owner)).toBeNull();
        expect(result.report.claims.runtimeAuthority).toBe(false); // Historical receipt survives.
      });
    },
    120_000,
  );
});
