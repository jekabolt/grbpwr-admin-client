import { describe, expect, it } from 'vitest';
import {
  createPatternImportDxfProductSavedCanonicalMediumAnnularSeedV1,
  withPatternImportDxfProductSavedCanonicalMediumAnnularSavedSessionInputsV2,
} from 'lib/cloth/domain/pattern-import-dxf-product-saved-canonical-medium-annular-evidence-v1.test-fixture';
import {
  PATTERN_IMPORT_DXF_PRODUCT_SAVED_GARMENT_MESH_INGRESS_REQUEST_V1,
  type PatternImportDxfProductSavedGarmentMeshIngressRequestV1,
} from 'lib/cloth/domain/pattern-import-dxf-product-saved-garment-mesh-ingress-v1';
import { withObservedPlacementGarmentSourceV1 } from 'lib/cloth/domain/pattern-import-dxf-product-saved-annular-observed-placement-garment-v1.test-fixture';
import {
  buildPatternImportDxfProductSavedAnnularGarmentObservedBodyPairV1,
  createPatternImportDxfProductSavedAnnularGarmentSessionV1,
} from './pattern-import-dxf-product-saved-annular-garment-session-v1';
import {
  buildPatternImportDxfProductSavedAnnularObservedPlacementGarmentObservedBodyPairV1 as pair,
  createPatternImportDxfProductSavedAnnularObservedPlacementGarmentSessionV1 as create,
  PATTERN_IMPORT_DXF_PRODUCT_SAVED_ANNULAR_OBSERVED_PLACEMENT_GARMENT_SESSION_V1,
} from './pattern-import-dxf-product-saved-annular-observed-placement-garment-session-v1';

// Genuine compiler/receipt/local frame/D0/garment/Placement V3 reader. The reused host observation
// is a synthetic triangle and storage transport is fixture-only: no actual V9/runtime claim.
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

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((accept) => {
    resolve = accept;
  });
  return { promise, resolve };
}

describe('private observed-placement saved garment session', () => {
  it('uses actual private generation, genuine V3 target and unchanged private-only surface', async () => {
    await withObservedPlacementGarmentSourceV1(async ({ request, state }) => {
      const session = create();
      try {
        await withSource(async (source) => {
          expect((await session.consume(source)).ok).toBe(true);
        });
        await withSource(async (source) => {
          const compiled = await session.consume(source);
          if (!compiled.ok) throw new Error(JSON.stringify(compiled));
          expect(compiled.generation).toBe(2);
          expect(Object.keys(session).sort()).toEqual([
            'advanceSavedGarment',
            'consume',
            'dispose',
            'projectLatestGarment',
            'projectLatestMesh',
            'snapshot',
          ]);
          expect(session.snapshot().schemaVersion).toBe(
            PATTERN_IMPORT_DXF_PRODUCT_SAVED_ANNULAR_OBSERVED_PLACEMENT_GARMENT_SESSION_V1,
          );
          const stale = await session.advanceSavedGarment({
            expectedGeneration: 1,
            readCurrentPlacement: request.readCurrentPlacement,
          });
          expect(stale).toMatchObject({ ok: false, code: 'stale-generation' });
          const built = await session.advanceSavedGarment({
            expectedGeneration: compiled.generation,
            readCurrentPlacement: request.readCurrentPlacement,
          });
          if (!built.ok) throw new Error(JSON.stringify(built));
          expect(built.generation).toBe(compiled.generation);
          expect(built.report.persistedPlacement.authoring.observedTarget).toEqual(
            state.current.placementAuthoring.observedTarget,
          );
          expect(built.report.claims).toMatchObject({
            bodyTargetConsumed: false,
            runtimeAuthority: false,
          });
          const projected = await session.projectLatestGarment(compiled.generation);
          expect(projected?.projection.report.canonicalSha256).toBe(built.report.canonicalSha256);
          expect(state.reads).toBeGreaterThanOrEqual(3);
          expect(await session.projectLatestGarment(1)).toBeNull();
          expect(await session.projectLatestGarment(compiled.generation)).not.toBeNull();
        });
      } finally {
        session.dispose();
      }
    });
  }, 60_000);

  it('authenticates exact session partition before any caller fields', async () => {
    const observed = create();
    const legacy = createPatternImportDxfProductSavedAnnularGarmentSessionV1();
    let touched = 0;
    const hostile = new Proxy(
      {},
      {
        get() {
          touched++;
          throw new Error('read');
        },
        ownKeys() {
          touched++;
          throw new Error('keys');
        },
      },
    ) as never;
    try {
      for (const forged of [{ ...observed }, new Proxy(observed, {}), legacy, null]) {
        expect(await pair(forged, hostile)).toMatchObject({
          ok: false,
          sourceContextBound: false,
          code: 'invalid-saved-garment-session',
        });
      }
      expect(
        await buildPatternImportDxfProductSavedAnnularGarmentObservedBodyPairV1(observed, hostile),
      ).toMatchObject({ ok: false, code: 'invalid-saved-garment-session' });
      expect(touched).toBe(0);
    } finally {
      observed.dispose();
      legacy.dispose();
    }
  });

  it('rejects genuine V2 and copied V3 reads, then permits an explicit genuine V3 advance', async () => {
    await withObservedPlacementGarmentSourceV1(async ({ request, historicalRequest }) =>
      withSource(async (source) => {
        const session = create();
        try {
          const compiled = await session.consume(source);
          if (!compiled.ok) throw new Error(JSON.stringify(compiled));
          const v3 = await request.readCurrentPlacement();
          for (const readCurrentPlacement of [
            historicalRequest.readCurrentPlacement,
            async () => ({ ...v3 }),
          ]) {
            expect(
              (
                await session.advanceSavedGarment({
                  expectedGeneration: compiled.generation,
                  readCurrentPlacement: readCurrentPlacement as never,
                })
              ).ok,
            ).toBe(false);
            expect(await session.projectLatestGarment(compiled.generation)).toBeNull();
          }
          expect(
            (
              await session.advanceSavedGarment({
                expectedGeneration: compiled.generation,
                readCurrentPlacement: request.readCurrentPlacement,
              })
            ).ok,
          ).toBe(true);
        } finally {
          session.dispose();
        }
      }),
    );
  }, 60_000);

  it('discards a late verified read after cancellation, preserves source, and revokes on replacement', async () => {
    await withObservedPlacementGarmentSourceV1(async ({ request }) =>
      withSource(async (source) => {
        const session = create();
        const sourceLife = new AbortController();
        try {
          const compiled = await session.consume(source, sourceLife.signal);
          if (!compiled.ok) throw new Error(JSON.stringify(compiled));
          const pause = deferred<void>();
          const entered = deferred<void>();
          const caller = new AbortController();
          const pending = session.advanceSavedGarment(
            {
              expectedGeneration: compiled.generation,
              readCurrentPlacement: async () => {
                entered.resolve();
                await pause.promise;
                return request.readCurrentPlacement();
              },
            },
            caller.signal,
          );
          await entered.promise;
          caller.abort();
          pause.resolve();
          expect((await pending).ok).toBe(false);
          expect(await session.projectLatestGarment(compiled.generation)).toBeNull();
          expect(
            (
              await session.advanceSavedGarment({
                expectedGeneration: compiled.generation,
                readCurrentPlacement: request.readCurrentPlacement,
              })
            ).ok,
          ).toBe(true);
          sourceLife.abort();
          expect(await session.projectLatestGarment(compiled.generation)).toBeNull();
          await withSource(async (replacement) => {
            const next = await session.consume(replacement);
            if (!next.ok) throw new Error(JSON.stringify(next));
            expect(next.generation).toBe(compiled.generation + 1);
            expect(
              (
                await session.advanceSavedGarment({
                  expectedGeneration: next.generation,
                  readCurrentPlacement: request.readCurrentPlacement,
                })
              ).ok,
            ).toBe(true);
          });
        } finally {
          session.dispose();
        }
      }),
    );
  }, 60_000);
});
