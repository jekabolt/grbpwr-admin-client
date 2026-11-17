import { describe, expect, it, vi } from 'vitest';

import { BETA_SKIRT_G3B2_PREVIEW_MANNEQUIN_REQUEST_V1 } from 'components/cloth-simulation-spike/beta-skirt-g3b2-preview-mannequin-request-v1';
import type { BetaSkirtG3b2PreviewMannequinResultV1 } from 'components/cloth-simulation-spike/beta-skirt-g3b2-preview-mannequin-contract-v1';
import { createPatternImportDxfProductSavedCanonicalMediumAuthoredInputV1Fixture } from 'components/cloth-simulation-spike/pattern-import-dxf-product-saved-canonical-medium-actual-body-session-v1.test-fixture';
import {
  createPatternImportDxfProductSavedPlacementRequestV1Fixture,
  readPatternImportDxfProductSavedPlacementV1Fixture,
} from 'components/cloth-simulation-spike/pattern-import-dxf-product-saved-placement-authored-input-v1.test-fixture';

import {
  projectPatternImportDxfProductGarmentMeshComposerV2,
  disposePatternImportDxfProductGarmentMeshComposerV2,
} from './pattern-import-dxf-product-garment-mesh-composer-v2';
import {
  createPatternImportDxfProductSavedCanonicalMediumAnnularSeedV1,
  withPatternImportDxfProductSavedCanonicalMediumAnnularPlacementInputsV2,
  type PatternImportDxfProductSavedCanonicalMediumAnnularPlacementInputsV2,
} from './pattern-import-dxf-product-saved-canonical-medium-annular-evidence-v1.test-fixture';
import {
  PATTERN_IMPORT_DXF_PRODUCT_SAVED_ANNULAR_GARMENT_V1,
  buildPatternImportDxfProductSavedAnnularGarmentV1,
  disposePatternImportDxfProductSavedAnnularGarmentV1,
  getPatternImportDxfProductSavedAnnularGarmentLifetimeV1,
  projectPatternImportDxfProductSavedAnnularGarmentV1,
  type PatternImportDxfProductSavedAnnularGarmentRequestV1,
} from './pattern-import-dxf-product-saved-annular-garment-v1';
import * as selfKernel from './dxf-product-two-panel-skirt-canonical-medium-self-orientation-v2';
import * as materialKernel from './dxf-product-two-panel-skirt-canonical-medium-normalized-v5-solver-bridge-v1';
import * as savedLocalProjection from './pattern-import-dxf-product-saved-local-frame-garment-mesh-composer-v2';

type PlacementRequest = Awaited<
  ReturnType<typeof createPatternImportDxfProductSavedPlacementRequestV1Fixture>
>;
type Mutable<T> = { -readonly [K in keyof T]: T[K] extends object ? Mutable<T[K]> : T[K] };

// This creates persisted test intent, not a body owner or actual-display admission. The production
// producer below has no body input. All mesh, D0, mapping, self/orientation and V5 kernels are real.
async function setup<T>(
  consume: (input: {
    request: PatternImportDxfProductSavedAnnularGarmentRequestV1;
    placementRequest: PlacementRequest;
    inputs: PatternImportDxfProductSavedCanonicalMediumAnnularPlacementInputsV2;
    readCount: () => number;
  }) => Promise<T>,
): Promise<T> {
  const seed = await createPatternImportDxfProductSavedCanonicalMediumAnnularSeedV1();
  return withPatternImportDxfProductSavedCanonicalMediumAnnularPlacementInputsV2(
    seed,
    async (inputs) => {
      const projection = projectPatternImportDxfProductGarmentMeshComposerV2(
        inputs.composerV2Owner,
      )!;
      const mannequin = {
        status: 'ready',
        composition: { displayBinding: BETA_SKIRT_G3B2_PREVIEW_MANNEQUIN_REQUEST_V1 },
      } as unknown as Extract<BetaSkirtG3b2PreviewMannequinResultV1, { status: 'ready' }>;
      const authored = createPatternImportDxfProductSavedCanonicalMediumAuthoredInputV1Fixture({
        composerSnapshot: inputs.composerV2Owner.snapshot,
        composerProjection: projection,
        mannequin,
      });
      const placementRequest = await createPatternImportDxfProductSavedPlacementRequestV1Fixture({
        composerSnapshot: inputs.composerV2Owner.snapshot,
        composerProjection: projection,
        compositionRequest: inputs.compositionRequest,
        savedRow: seed.row,
        authored,
      });
      let reads = 0;
      return consume({
        inputs,
        placementRequest,
        readCount: () => reads,
        request: {
          schemaVersion: PATTERN_IMPORT_DXF_PRODUCT_SAVED_ANNULAR_GARMENT_V1,
          composerV2Owner: inputs.composerV2Owner,
          savedLocalFrameOwner: inputs.composerV3Owner,
          compositionRequest: inputs.compositionRequest,
          writerFrameReceipt: inputs.writerFrameReceipt,
          readCurrentPlacement: async () => {
            reads += 1;
            return readPatternImportDxfProductSavedPlacementV1Fixture(placementRequest);
          },
        },
      });
    },
  );
}

describe('genuine saved garment-only annular ownership', () => {
  it('runs actual D0, mapping, self/orientation and material kernels without a body owner', async () => {
    await setup(async ({ request, readCount, placementRequest }) => {
      const result = await buildPatternImportDxfProductSavedAnnularGarmentV1(request);
      expect(result, JSON.stringify(result)).toMatchObject({ ok: true });
      if (!result.ok) throw new Error(result.detail);
      try {
        expect(readCount()).toBe(2);
        expect(result.report).toMatchObject({
          decision: 'garment-local-material-qualified',
          mappingFrame: 'garment-local-waist-origin',
          mappingSpec: { waistCenterM: [0, 0, 0] },
          selfOrientation: {
            decision: 'PASS_PRODUCT_SELF_AND_ORIENTATION_DIAGNOSTIC',
            counts: {
              vertexCount: 580,
              triangleCount: 912,
              seamPairCount: 34,
              pinnedWaistVertexCount: 82,
            },
          },
          normalizedMaterial: {
            claims: {
              normalizedTopologySolverMaterialCompatibilityEstablished: true,
              runtimeAuthority: false,
            },
          },
          claims: {
            bodyTargetConsumed: false,
            bodyAdmissionAuthority: false,
            runtimeAuthority: false,
          },
        });
        expect(result.report.persistedPlacement.authoring.semantics.body).toEqual(
          placementRequest.placementAuthoring.semantics.body,
        );
        const first = await projectPatternImportDxfProductSavedAnnularGarmentV1(result.owner);
        expect(first?.mapping.pinnedWaistVertexIndices).toHaveLength(82);
        expect(first?.mapping.positions3M).toHaveLength(580 * 3);
        expect(first?.normalizedMaterial?.initialPhysicalPositionsInvMassKg).toHaveLength(580 * 4);
        first!.mapping.positions3M.fill(77);
        first!.mapping.pinnedWaistVertexIndices.fill(2);
        const second = await projectPatternImportDxfProductSavedAnnularGarmentV1(result.owner);
        expect(second?.mapping.positions3M[0]).not.toBe(77);
        expect(second?.mapping.pinnedWaistVertexIndices.some((pin) => pin !== 2)).toBe(true);
        expect(
          await projectPatternImportDxfProductSavedAnnularGarmentV1({ ...result.owner }),
        ).toBeNull();
        expect(
          await projectPatternImportDxfProductSavedAnnularGarmentV1(new Proxy(result.owner, {})),
        ).toBeNull();
        const lifetime = getPatternImportDxfProductSavedAnnularGarmentLifetimeV1(result.owner)!;
        expect(lifetime.aborted).toBe(false);
        expect(disposePatternImportDxfProductSavedAnnularGarmentV1(result.owner)).toBe(true);
        expect(lifetime.aborted).toBe(true);
        expect(await projectPatternImportDxfProductSavedAnnularGarmentV1(result.owner)).toBeNull();
        expect(
          projectPatternImportDxfProductGarmentMeshComposerV2(request.composerV2Owner),
        ).not.toBeNull();
      } finally {
        disposePatternImportDxfProductSavedAnnularGarmentV1(result.owner);
      }
    });
  }, 60_000);

  it('rejects accessor requests without invoking getters and unissued capabilities', async () => {
    let gets = 0;
    const value = Object.defineProperty({}, 'composerV2Owner', {
      enumerable: true,
      get: () => {
        gets += 1;
        throw new Error('getter');
      },
    });
    expect(await buildPatternImportDxfProductSavedAnnularGarmentV1(value)).toMatchObject({
      ok: false,
      code: 'invalid-input',
    });
    expect(gets).toBe(0);
    expect(
      await buildPatternImportDxfProductSavedAnnularGarmentV1({
        schemaVersion: PATTERN_IMPORT_DXF_PRODUCT_SAVED_ANNULAR_GARMENT_V1,
        composerV2Owner: {},
        savedLocalFrameOwner: {},
        compositionRequest: {},
        writerFrameReceipt: {},
        readCurrentPlacement: async () => null,
      }),
    ).toMatchObject({ ok: false, code: 'source-owner-unavailable' });
  });

  it('rejects ambiguous provenance even when distinct coordinates could disambiguate it', async () => {
    await setup(async ({ request }) => {
      const original =
        savedLocalProjection.projectPatternImportDxfProductSavedLocalFrameGarmentMeshComposerV2;
      // Deliberately corrupt only the detached projection in this hostile-port test; the build
      // must not use geometry to choose between two vertices carrying one exact source identity.
      const spy = vi
        .spyOn(
          savedLocalProjection,
          'projectPatternImportDxfProductSavedLocalFrameGarmentMeshComposerV2',
        )
        .mockImplementation((owner) => {
          const projected = original(owner);
          if (!projected) return null;
          const samples = projected.composerV3.mesh.boundarySamples;
          const first = samples[0]!;
          const other = samples.find((sample) => sample.vertexIndex !== first.vertexIndex)!;
          return {
            ...projected,
            composerV3: {
              ...projected.composerV3,
              mesh: {
                ...projected.composerV3.mesh,
                boundarySamples: [...samples, { ...first, vertexIndex: other.vertexIndex }],
              },
            },
          };
        });
      try {
        expect(await buildPatternImportDxfProductSavedAnnularGarmentV1(request)).toMatchObject({
          ok: false,
          code: 'boundary-provenance-mismatch',
          detail: 'V3 provenance is not unique.',
        });
      } finally {
        spy.mockRestore();
      }
    });
  }, 60_000);

  it('rejects missing/caller-shaped placement, tampered receipt, selected geometry and explicit waist roles', async () => {
    await setup(async ({ request, placementRequest }) => {
      expect(
        await buildPatternImportDxfProductSavedAnnularGarmentV1({
          ...request,
          readCurrentPlacement: async () => null,
        }),
      ).toMatchObject({ ok: false, code: 'placement-read-blocked' });
      const genuine = await request.readCurrentPlacement();
      expect(
        await buildPatternImportDxfProductSavedAnnularGarmentV1({
          ...request,
          readCurrentPlacement: async () => ({ ...genuine }),
        }),
      ).toMatchObject({ ok: false, code: 'placement-read-blocked' });
      const receipt = structuredClone(request.writerFrameReceipt) as Mutable<
        typeof request.writerFrameReceipt
      >;
      receipt.pieces[0].sourceApexMm[0] += 1;
      expect(
        await buildPatternImportDxfProductSavedAnnularGarmentV1({
          ...request,
          writerFrameReceipt: receipt,
        }),
      ).toMatchObject({ ok: false, code: 'receipt-binding-mismatch' });
      const foreign = structuredClone(placementRequest) as Mutable<PlacementRequest>;
      foreign.bindings.source.selectedGeometrySha256 = 'a'.repeat(64);
      expect(
        await buildPatternImportDxfProductSavedAnnularGarmentV1({
          ...request,
          readCurrentPlacement: () => readPatternImportDxfProductSavedPlacementV1Fixture(foreign),
        }),
      ).toMatchObject({ ok: false, code: 'placement-binding-mismatch' });
      const roles = structuredClone(placementRequest) as Mutable<PlacementRequest>;
      roles.placementAuthoring.semantics.garment.boundaries[0].waist.boundaryVertexIndices[0] = 0;
      expect(
        await buildPatternImportDxfProductSavedAnnularGarmentV1({
          ...request,
          readCurrentPlacement: () => readPatternImportDxfProductSavedPlacementV1Fixture(roles),
        }),
      ).toMatchObject({ ok: false, code: 'explicit-semantics-blocked' });
    });
  }, 60_000);

  it('cancels a pending fresh read without disposing borrowed sources', async () => {
    await setup(async ({ request }) => {
      const controller = new AbortController();
      let finish!: (value: Awaited<ReturnType<typeof request.readCurrentPlacement>>) => void;
      const pending = buildPatternImportDxfProductSavedAnnularGarmentV1(
        {
          ...request,
          readCurrentPlacement: () =>
            new Promise((resolve) => {
              finish = resolve;
            }),
        },
        controller.signal,
      );
      controller.abort();
      finish(await request.readCurrentPlacement());
      expect(await pending).toMatchObject({ ok: false, code: 'cancelled' });
      expect(
        projectPatternImportDxfProductGarmentMeshComposerV2(request.composerV2Owner),
      ).not.toBeNull();
    });
  }, 60_000);

  it('rejects source revocation during the initial asynchronous read', async () => {
    await setup(async ({ request }) => {
      const result = await buildPatternImportDxfProductSavedAnnularGarmentV1({
        ...request,
        readCurrentPlacement: async () => {
          const placement = await request.readCurrentPlacement();
          disposePatternImportDxfProductGarmentMeshComposerV2(request.composerV2Owner);
          return placement;
        },
      });
      expect(result).toMatchObject({ ok: false, code: 'source-owner-unavailable' });
    });
  }, 60_000);

  it('revokes after return on external abort, retaining borrowed owners', async () => {
    await setup(async ({ request }) => {
      const controller = new AbortController();
      const result = await buildPatternImportDxfProductSavedAnnularGarmentV1(
        request,
        controller.signal,
      );
      if (!result.ok) throw new Error(result.detail);
      const lifetime = getPatternImportDxfProductSavedAnnularGarmentLifetimeV1(result.owner)!;
      controller.abort();
      expect(lifetime.aborted).toBe(true);
      expect(await projectPatternImportDxfProductSavedAnnularGarmentV1(result.owner)).toBeNull();
      expect(disposePatternImportDxfProductSavedAnnularGarmentV1(result.owner)).toBe(false);
      expect(
        projectPatternImportDxfProductGarmentMeshComposerV2(request.composerV2Owner),
      ).not.toBeNull();
    });
  }, 60_000);

  it('fresh projection refuses changed placement and revokes the lifetime', async () => {
    await setup(async ({ request, placementRequest }) => {
      let changed = false;
      const replacement = structuredClone(placementRequest) as Mutable<PlacementRequest>;
      replacement.placementAuthoring.semantics.body.bodyRevision += '-new-intent';
      const result = await buildPatternImportDxfProductSavedAnnularGarmentV1({
        ...request,
        readCurrentPlacement: () =>
          changed
            ? readPatternImportDxfProductSavedPlacementV1Fixture(replacement)
            : request.readCurrentPlacement(),
      });
      if (!result.ok) throw new Error(result.detail);
      const lifetime = getPatternImportDxfProductSavedAnnularGarmentLifetimeV1(result.owner)!;
      changed = true;
      expect(await projectPatternImportDxfProductSavedAnnularGarmentV1(result.owner)).toBeNull();
      expect(lifetime.aborted).toBe(true);
    });
  }, 60_000);

  it('does not publish an owner if the source is revoked in the final fresh-read microtask gap', async () => {
    await setup(async ({ request }) => {
      let reads = 0;
      let revoked = false;
      const result = await buildPatternImportDxfProductSavedAnnularGarmentV1({
        ...request,
        readCurrentPlacement: async () => {
          const placement = await request.readCurrentPlacement();
          reads += 1;
          if (reads === 2)
            queueMicrotask(() =>
              queueMicrotask(() => {
                revoked = disposePatternImportDxfProductGarmentMeshComposerV2(
                  request.composerV2Owner,
                );
              }),
            );
          return placement;
        },
      });
      expect(reads).toBe(2);
      expect(revoked).toBe(true);
      expect(result).toMatchObject({ ok: false, code: 'source-owner-unavailable' });
    });
  }, 60_000);

  it('does not project stale mapping if the source is revoked in the fresh-read microtask gap', async () => {
    await setup(async ({ request }) => {
      let revokeOnRead = false;
      const result = await buildPatternImportDxfProductSavedAnnularGarmentV1({
        ...request,
        readCurrentPlacement: async () => {
          const placement = await request.readCurrentPlacement();
          if (revokeOnRead)
            queueMicrotask(() =>
              queueMicrotask(() => {
                disposePatternImportDxfProductGarmentMeshComposerV2(request.composerV2Owner);
              }),
            );
          return placement;
        },
      });
      if (!result.ok) throw new Error(result.detail);
      const lifetime = getPatternImportDxfProductSavedAnnularGarmentLifetimeV1(result.owner)!;
      revokeOnRead = true;
      expect(await projectPatternImportDxfProductSavedAnnularGarmentV1(result.owner)).toBeNull();
      expect(lifetime.aborted).toBe(true);
    });
  }, 60_000);

  it.each(['self', 'material'] as const)(
    'disposes the genuine %s child when aborted as its async builder resolves',
    async (stage) => {
      await setup(async ({ request }) => {
        const controller = new AbortController();
        let selfChild: selfKernel.DxfProductTwoPanelSkirtCanonicalMediumSelfOrientationOwnerV2 | null =
          null;
        let materialChild: materialKernel.DxfProductTwoPanelSkirtCanonicalMediumNormalizedV5SolverBridgeOwnerV1 | null =
          null;
        const originalSelf =
          selfKernel.buildDxfProductTwoPanelSkirtCanonicalMediumSelfOrientationV2;
        const originalMaterial =
          materialKernel.buildDxfProductTwoPanelSkirtCanonicalMediumNormalizedV5SolverBridgeV1;
        const selfSpy = vi
          .spyOn(selfKernel, 'buildDxfProductTwoPanelSkirtCanonicalMediumSelfOrientationV2')
          .mockImplementation(async (...args) => {
            const built = await originalSelf(...args);
            if (built.ok) {
              selfChild = built.owner;
              if (stage === 'self') controller.abort();
            }
            return built;
          });
        const materialSpy = vi
          .spyOn(
            materialKernel,
            'buildDxfProductTwoPanelSkirtCanonicalMediumNormalizedV5SolverBridgeV1',
          )
          .mockImplementation(async (...args) => {
            const built = await originalMaterial(...args);
            if (built.ok) {
              materialChild = built.owner;
              if (stage === 'material') controller.abort();
            }
            return built;
          });
        try {
          expect(
            await buildPatternImportDxfProductSavedAnnularGarmentV1(request, controller.signal),
          ).toMatchObject({ ok: false, code: 'cancelled' });
          expect(selfChild).not.toBeNull();
          expect(
            selfKernel.projectDxfProductTwoPanelSkirtCanonicalMediumSelfOrientationV2(selfChild),
          ).toBeNull();
          if (stage === 'material') {
            expect(materialChild).not.toBeNull();
            expect(
              materialKernel.projectDxfProductTwoPanelSkirtCanonicalMediumNormalizedV5SolverBridgeV1(
                materialChild,
              ),
            ).toBeNull();
          }
          expect(
            projectPatternImportDxfProductGarmentMeshComposerV2(request.composerV2Owner),
          ).not.toBeNull();
        } finally {
          selfSpy.mockRestore();
          materialSpy.mockRestore();
        }
      });
    },
    60_000,
  );

  it('cancels one projection without invalidating a current shared garment', async () => {
    await setup(async ({ request }) => {
      const result = await buildPatternImportDxfProductSavedAnnularGarmentV1(request);
      if (!result.ok) throw new Error(result.detail);
      try {
        const controller = new AbortController();
        controller.abort();
        expect(
          await projectPatternImportDxfProductSavedAnnularGarmentV1(
            result.owner,
            controller.signal,
          ),
        ).toBeNull();
        expect(getPatternImportDxfProductSavedAnnularGarmentLifetimeV1(result.owner)?.aborted).toBe(
          false,
        );
        expect(
          await projectPatternImportDxfProductSavedAnnularGarmentV1(result.owner),
        ).not.toBeNull();
      } finally {
        disposePatternImportDxfProductSavedAnnularGarmentV1(result.owner);
      }
    });
  }, 60_000);
});
