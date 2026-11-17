import { beforeAll, describe, expect, it, vi } from 'vitest';

import {
  createPatternImportDxfProductSavedCanonicalMediumAnnularSeedV1,
  withPatternImportDxfProductSavedCanonicalMediumAnnularPlacementInputsV2,
  withPatternImportDxfProductSavedCanonicalMediumAnnularSavedSessionInputsV2,
} from 'lib/cloth/domain/pattern-import-dxf-product-saved-canonical-medium-annular-evidence-v1.test-fixture';
import {
  PATTERN_IMPORT_DXF_PRODUCT_SAVED_GARMENT_MESH_INGRESS_REQUEST_V1,
  type PatternImportDxfProductSavedGarmentMeshIngressRequestV1,
} from 'lib/cloth/domain/pattern-import-dxf-product-saved-garment-mesh-ingress-v1';
import { projectPatternImportDxfProductGarmentMeshComposerV2 } from 'lib/cloth/domain/pattern-import-dxf-product-garment-mesh-composer-v2';
import * as garmentDomain from 'lib/cloth/domain/pattern-import-dxf-product-saved-annular-garment-v1';

import { BETA_SKIRT_G3B2_PREVIEW_MANNEQUIN_REQUEST_V1 } from './beta-skirt-g3b2-preview-mannequin-request-v1';
import type { BetaSkirtG3b2PreviewMannequinResultV1 } from './beta-skirt-g3b2-preview-mannequin-contract-v1';
import { createPatternImportDxfProductSavedCanonicalMediumAuthoredInputV1Fixture } from './pattern-import-dxf-product-saved-canonical-medium-actual-body-session-v1.test-fixture';
import {
  createPatternImportDxfProductSavedPlacementRequestV1Fixture,
  readPatternImportDxfProductSavedPlacementV1Fixture,
} from './pattern-import-dxf-product-saved-placement-authored-input-v1.test-fixture';
import {
  buildPatternImportDxfProductSavedAnnularGarmentObservedBodyPairV1,
  createPatternImportDxfProductSavedAnnularGarmentSessionV1,
  type PatternImportDxfProductSavedAnnularGarmentObservedBodyPairRequestV1,
  type PatternImportDxfProductSavedAnnularGarmentSessionV1,
} from './pattern-import-dxf-product-saved-annular-garment-session-v1';

type PlacementRequest = Awaited<
  ReturnType<typeof createPatternImportDxfProductSavedPlacementRequestV1Fixture>
>;
type Placement = Awaited<ReturnType<typeof readPatternImportDxfProductSavedPlacementV1Fixture>>;
let seed: Awaited<
  ReturnType<typeof createPatternImportDxfProductSavedCanonicalMediumAnnularSeedV1>
>;
let placementRequest: PlacementRequest;

beforeAll(async () => {
  seed = await createPatternImportDxfProductSavedCanonicalMediumAnnularSeedV1();
  // Prior explicit persisted test intent. This independent authoring owner is disposed before the
  // session tests: no owner, receipt or diagnostic port is injected into the session under test.
  await withPatternImportDxfProductSavedCanonicalMediumAnnularPlacementInputsV2(
    seed,
    async (input) => {
      const projection = projectPatternImportDxfProductGarmentMeshComposerV2(
        input.composerV2Owner,
      )!;
      const mannequin = {
        status: 'ready',
        composition: { displayBinding: BETA_SKIRT_G3B2_PREVIEW_MANNEQUIN_REQUEST_V1 },
      } as unknown as Extract<BetaSkirtG3b2PreviewMannequinResultV1, { status: 'ready' }>;
      const authored = createPatternImportDxfProductSavedCanonicalMediumAuthoredInputV1Fixture({
        composerSnapshot: input.composerV2Owner.snapshot,
        composerProjection: projection,
        mannequin,
      });
      placementRequest = await createPatternImportDxfProductSavedPlacementRequestV1Fixture({
        composerSnapshot: input.composerV2Owner.snapshot,
        composerProjection: projection,
        compositionRequest: input.compositionRequest,
        savedRow: seed.row,
        authored,
      });
    },
  );
}, 60_000);

function freshPlacement() {
  return readPatternImportDxfProductSavedPlacementV1Fixture(placementRequest);
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((accept) => {
    resolve = accept;
  });
  return { promise, resolve };
}
async function withSource<T>(
  consume: (request: PatternImportDxfProductSavedGarmentMeshIngressRequestV1) => Promise<T>,
): Promise<T> {
  return withPatternImportDxfProductSavedCanonicalMediumAnnularSavedSessionInputsV2(
    seed,
    async ({ sourceOwner, compositionRequest, targetEdgeMm }) =>
      consume({
        schemaVersion: PATTERN_IMPORT_DXF_PRODUCT_SAVED_GARMENT_MESH_INGRESS_REQUEST_V1,
        sourceOwner,
        compositionRequest,
        targetEdgeMm,
      }),
  );
}
async function withCompiled<T>(
  consume: (
    session: PatternImportDxfProductSavedAnnularGarmentSessionV1,
    generation: number,
    request: PatternImportDxfProductSavedGarmentMeshIngressRequestV1,
  ) => Promise<T>,
): Promise<T> {
  return withSource(async (request) => {
    const session = createPatternImportDxfProductSavedAnnularGarmentSessionV1();
    try {
      const compiled = await session.consume(request);
      if (!compiled.ok) throw new Error(JSON.stringify(compiled));
      return await consume(session, compiled.generation, request);
    } finally {
      session.dispose();
    }
  });
}
async function advance(
  session: PatternImportDxfProductSavedAnnularGarmentSessionV1,
  generation: number,
  signal?: AbortSignal,
) {
  const result = await session.advanceSavedGarment(
    { expectedGeneration: generation, readCurrentPlacement: freshPlacement },
    signal,
  );
  if (!result.ok) throw new Error(JSON.stringify(result));
  return result;
}

// These ports exercise cancellation/registry dispatch only. The saved compiler/garment remain
// genuine, but no synthetic pair below is evidence of body, collision or runtime qualification.
async function withSyntheticPair<T>(
  consume: (ports: {
    calls: Array<{ input: Record<string, unknown>; signal: AbortSignal }>;
    children: Map<object, AbortController>;
    controls: {
      waitBeforeReturn: Promise<void> | null;
      fail: boolean;
      started: (() => void) | null;
    };
    dispose: (owner: object) => boolean;
  }) => Promise<T>,
): Promise<T> {
  const pair = await import('./beta-skirt-saved-annular-displayed-body-product-placement-v1');
  const calls: Array<{ input: Record<string, unknown>; signal: AbortSignal }> = [];
  const children = new Map<object, AbortController>();
  const controls: {
    waitBeforeReturn: Promise<void> | null;
    fail: boolean;
    started: (() => void) | null;
  } = { waitBeforeReturn: null, fail: false, started: null };
  const dispose = (owner: unknown) => {
    const child = owner && typeof owner === 'object' ? children.get(owner) : null;
    if (!child || child.signal.aborted) return false;
    child.abort();
    return true;
  };
  const build = vi
    .spyOn(pair, 'buildBetaSkirtSavedAnnularDisplayedBodyProductPlacementV1')
    .mockImplementation(async (input, signal) => {
      if (!signal) throw new Error('Expected retained private handoff signal.');
      calls.push({ input: input as Record<string, unknown>, signal });
      controls.started?.();
      if (controls.waitBeforeReturn) await controls.waitBeforeReturn;
      if (controls.fail) throw new Error('Synthetic pair build failure.');
      const owner = Object.freeze({ syntheticPairLifecycleOnly: true });
      const controller = new AbortController();
      const abort = () => controller.abort();
      signal.addEventListener('abort', abort, { once: true });
      controller.signal.addEventListener(
        'abort',
        () => signal.removeEventListener('abort', abort),
        { once: true },
      );
      children.set(owner, controller);
      if (signal.aborted) controller.abort();
      return {
        ok: true,
        owner,
        report: { syntheticPairLifecycleOnly: true, runtimeAuthority: false },
      } as never;
    });
  const lifetime = vi
    .spyOn(pair, 'getBetaSkirtSavedAnnularDisplayedBodyProductPlacementLifetimeV1')
    .mockImplementation((owner) =>
      owner && typeof owner === 'object' ? children.get(owner)?.signal ?? null : null,
    );
  const disposer = vi
    .spyOn(pair, 'disposeBetaSkirtSavedAnnularDisplayedBodyProductPlacementV1')
    .mockImplementation(dispose);
  try {
    return await consume({ calls, children, controls, dispose });
  } finally {
    for (const child of children.values()) child.abort();
    build.mockRestore();
    lifetime.mockRestore();
    disposer.mockRestore();
  }
}
function syntheticBodyRequest(
  expectedGeneration: number,
): PatternImportDxfProductSavedAnnularGarmentObservedBodyPairRequestV1 {
  return {
    expectedGeneration,
    displayedBodyOwner: {} as never,
    displayedBodyBinding: { generation: 999 } as never,
  };
}

describe('private saved annular garment compile-session composition', () => {
  it('runs default ingress→compile→real receipt→saved local frame→D0→mapping→material without a body', async () => {
    await withSource(async (request) => {
      const session = createPatternImportDxfProductSavedAnnularGarmentSessionV1();
      try {
        expect(Object.keys(session).sort()).toEqual([
          'advanceSavedGarment',
          'consume',
          'dispose',
          'projectLatestGarment',
          'snapshot',
        ]);
        const compiled = await session.consume(request);
        expect(compiled, JSON.stringify(compiled)).toMatchObject({
          ok: true,
          generation: 1,
          compile: {
            claims: {
              savedIngressImplementation: 'production-default',
              savedSourceOwnerConsumedByIngress: true,
            },
          },
          localFrame: { ok: true, claims: { canonical580v912tTopologyParityEstablished: true } },
        });
        if (!compiled.ok) throw new Error(compiled.detail);
        expect(session.snapshot()).toMatchObject({
          status: 'local-frame-ready',
          generation: compiled.generation,
        });
        const built = await advance(session, compiled.generation);
        expect(built).toMatchObject({
          generation: compiled.generation,
          report: {
            decision: 'garment-local-material-qualified',
            mappingSpec: { waistCenterM: [0, 0, 0] },
            selfOrientation: {
              counts: {
                vertexCount: 580,
                triangleCount: 912,
                pinnedWaistVertexCount: 82,
                seamPairCount: 34,
              },
            },
            normalizedMaterial: {
              claims: {
                normalizedTopologySolverMaterialCompatibilityEstablished: true,
                runtimeAuthority: false,
              },
            },
          },
          claims: {
            sourceAndGarmentOwnersStayedPrivate: true,
            worldPlacementAuthority: false,
            runtimeAuthority: false,
          },
        });
        const projected = await session.projectLatestGarment(compiled.generation);
        expect(projected?.generation).toBe(compiled.generation);
        expect(projected?.projection.normalizedMaterial).not.toBeNull();
        projected!.projection.mapping.positions3M.fill(88);
        expect(
          (await session.projectLatestGarment(compiled.generation))?.projection.mapping
            .positions3M[0],
        ).not.toBe(88);
        expect(session.snapshot()).toMatchObject({
          generation: compiled.generation,
          status: 'garment-local-material-qualified',
          garmentReportSha256: built.report.canonicalSha256,
        });
      } finally {
        session.dispose();
      }
      expect(session.snapshot()).toMatchObject({
        disposed: true,
        status: 'disposed',
        garmentReportSha256: null,
      });
    });
  }, 60_000);

  it('stale expectations and already-aborted reads/advances leave the current garment intact', async () => {
    await withCompiled(async (session, generation) => {
      const result = await advance(session, generation);
      const read = vi.fn(freshPlacement);
      expect(
        await session.advanceSavedGarment({
          expectedGeneration: generation + 1,
          readCurrentPlacement: read,
        }),
      ).toMatchObject({ ok: false, code: 'stale-generation', generation });
      const controller = new AbortController();
      controller.abort();
      expect(
        await session.advanceSavedGarment(
          { expectedGeneration: generation, readCurrentPlacement: read },
          controller.signal,
        ),
      ).toMatchObject({ ok: false, code: 'session-cancelled' });
      expect(await session.projectLatestGarment(generation + 1)).toBeNull();
      expect(await session.projectLatestGarment(generation, controller.signal)).toBeNull();
      expect(read).not.toHaveBeenCalled();
      expect(
        (await session.projectLatestGarment(generation))?.projection.report.canonicalSha256,
      ).toBe(result.report.canonicalSha256);
      expect(session.snapshot().status).toBe('garment-local-material-qualified');
    });
  }, 60_000);

  it('advance-signal cancellation revokes its returned garment and leaves the compiled source retryable', async () => {
    await withCompiled(async (session, generation) => {
      const controller = new AbortController();
      const before = session.snapshot();
      await advance(session, generation, controller.signal);
      controller.abort();
      expect(session.snapshot()).toMatchObject({
        status: 'blocked',
        garmentReportSha256: null,
        generation,
      });
      expect(await session.projectLatestGarment(generation)).toBeNull();
      const repeated = await advance(session, generation);
      expect(repeated.generation).toBe(generation);
      expect(session.snapshot().composerV3CanonicalSha256).toBe(before.composerV3CanonicalSha256);
      expect(await session.projectLatestGarment(generation)).not.toBeNull();
    });
  }, 60_000);

  it('an admitted invalid replacement revokes the old garment without inventing a compiler generation', async () => {
    await withCompiled(async (session, generation) =>
      withSource(async (replacement) => {
        await advance(session, generation);
        const invalid = {
          ...replacement,
          compositionRequest: {
            ...replacement.compositionRequest,
            invalidReplacement: () => undefined,
          },
        } as typeof replacement;
        expect(await session.consume(invalid)).toMatchObject({
          ok: false,
          code: 'invalid-input',
          generation,
        });
        expect(session.snapshot()).toMatchObject({
          status: 'blocked',
          generation,
          garmentReportSha256: null,
        });
        expect(await session.projectLatestGarment(generation)).toBeNull();
        expect(
          await session.advanceSavedGarment({
            expectedGeneration: generation,
            readCurrentPlacement: freshPlacement,
          }),
        ).toMatchObject({ ok: false, code: 'session-not-ready' });
        // Invalid detachment did not consume the new one-shot source; real compile increments next.
        expect(await session.consume(replacement)).toMatchObject({
          ok: true,
          generation: generation + 1,
        });
      }),
    );
  }, 60_000);

  it('keeps disposed state if revoking an old pending read synchronously disposes the session', async () => {
    await withCompiled(async (session, generation) =>
      withSource(async (replacement) => {
        let pause = false;
        const started = deferred<void>();
        const resume = deferred<Placement>();
        expect(
          (
            await session.advanceSavedGarment({
              expectedGeneration: generation,
              readCurrentPlacement: (signal) => {
                if (pause) {
                  signal?.addEventListener('abort', () => session.dispose(), { once: true });
                  started.resolve();
                  return resume.promise;
                }
                return freshPlacement();
              },
            })
          ).ok,
        ).toBe(true);
        pause = true;
        const projected = session.projectLatestGarment(generation);
        await started.promise;
        expect(await session.consume(replacement)).toMatchObject({
          ok: false,
          code: 'session-disposed',
        });
        resume.resolve(await freshPlacement());
        expect(await projected).toBeNull();
        expect(session.snapshot()).toMatchObject({
          disposed: true,
          status: 'disposed',
          garmentReportSha256: null,
        });
      }),
    );
  }, 60_000);

  it('busy-refused source replacement does not consume or revoke either source', async () => {
    await withCompiled(async (session, generation) =>
      withSource(async (replacement) => {
        const started = deferred<void>();
        const resume = deferred<Placement>();
        let reads = 0;
        const pending = session.advanceSavedGarment({
          expectedGeneration: generation,
          readCurrentPlacement: () => {
            reads += 1;
            if (reads === 1) {
              started.resolve();
              return resume.promise;
            }
            return freshPlacement();
          },
        });
        await started.promise;
        expect(await session.consume(replacement)).toMatchObject({
          ok: false,
          code: 'session-busy',
          generation,
        });
        expect(session.snapshot()).toMatchObject({ generation, status: 'building-garment' });
        resume.resolve(await freshPlacement());
        expect(await pending).toMatchObject({ ok: true, generation });
        expect(await session.projectLatestGarment(generation)).not.toBeNull();
        // This exact one-shot replacement remains consumable after the refused attempt.
        const accepted = await session.consume(replacement);
        expect(accepted, JSON.stringify(accepted)).toMatchObject({
          ok: true,
          generation: generation + 1,
        });
      }),
    );
  }, 60_000);

  it('accepted replacement immediately aborts an outstanding read and binds the next actual compiler generation', async () => {
    await withCompiled(async (session, generation) =>
      withSource(async (replacement) => {
        let pauseRead = false;
        let readSignal: AbortSignal | undefined;
        const started = deferred<void>();
        const resume = deferred<Placement>();
        const built = await session.advanceSavedGarment({
          expectedGeneration: generation,
          readCurrentPlacement: (signal) => {
            if (pauseRead) {
              readSignal = signal;
              started.resolve();
              return resume.promise;
            }
            return freshPlacement();
          },
        });
        expect(built.ok).toBe(true);
        pauseRead = true;
        const projected = session.projectLatestGarment(generation);
        await started.promise;
        const replacing = session.consume(replacement);
        expect(readSignal?.aborted).toBe(true);
        expect(session.snapshot().garmentReportSha256).toBeNull();
        resume.resolve(await freshPlacement());
        expect(await projected).toBeNull();
        expect(await replacing).toMatchObject({ ok: true, generation: generation + 1 });
        const next = await advance(session, generation + 1);
        expect(next.generation).toBe(generation + 1);
        expect((await session.projectLatestGarment(generation + 1))?.generation).toBe(
          generation + 1,
        );
        expect(await session.projectLatestGarment(generation)).toBeNull();
      }),
    );
  }, 60_000);

  it('cancels a pending read alone without revoking the shared current garment', async () => {
    await withCompiled(async (session, generation) => {
      let pause = false;
      const started = deferred<void>();
      const resume = deferred<Placement>();
      const built = await session.advanceSavedGarment({
        expectedGeneration: generation,
        readCurrentPlacement: () => {
          if (pause) {
            started.resolve();
            return resume.promise;
          }
          return freshPlacement();
        },
      });
      if (!built.ok) throw new Error(built.detail);
      pause = true;
      const caller = new AbortController();
      const pending = session.projectLatestGarment(generation, caller.signal);
      await started.promise;
      caller.abort();
      resume.resolve(await freshPlacement());
      expect(await pending).toBeNull();
      pause = false;
      expect(
        (await session.projectLatestGarment(generation))?.projection.report.canonicalSha256,
      ).toBe(built.report.canonicalSha256);
    });
  }, 60_000);

  it('fresh persisted placement loss revokes the private garment', async () => {
    await withCompiled(async (session, generation) => {
      let available = true;
      expect(
        (
          await session.advanceSavedGarment({
            expectedGeneration: generation,
            readCurrentPlacement: () => (available ? freshPlacement() : Promise.resolve(null)),
          })
        ).ok,
      ).toBe(true);
      available = false;
      expect(await session.projectLatestGarment(generation)).toBeNull();
      expect(session.snapshot()).toMatchObject({ status: 'blocked', garmentReportSha256: null });
    });
  }, 60_000);

  it('pre-aborted consume preserves its one-shot source; disposing during default compile refuses late publication', async () => {
    await withSource(async (request) => {
      const session = createPatternImportDxfProductSavedAnnularGarmentSessionV1();
      const caller = new AbortController();
      caller.abort();
      expect(await session.consume(request, caller.signal)).toMatchObject({
        ok: false,
        code: 'session-cancelled',
        generation: 0,
      });
      const pending = session.consume(request);
      session.dispose();
      expect(await pending).toMatchObject({ ok: false, code: 'session-disposed', generation: 1 });
      expect(session.snapshot()).toMatchObject({
        disposed: true,
        status: 'disposed',
        garmentReportSha256: null,
      });
      expect(await session.projectLatestGarment(1)).toBeNull();
    });
  }, 60_000);

  it('consume signal remains the source lifetime after return and a fresh source can replace it', async () => {
    await withSource(async (request) =>
      withSource(async (replacement) => {
        const session = createPatternImportDxfProductSavedAnnularGarmentSessionV1();
        const caller = new AbortController();
        try {
          expect(await session.consume(request, caller.signal)).toMatchObject({
            ok: true,
            generation: 1,
          });
          await advance(session, 1);
          caller.abort();
          expect(await session.projectLatestGarment(1)).toBeNull();
          expect(
            await session.advanceSavedGarment({
              expectedGeneration: 1,
              readCurrentPlacement: freshPlacement,
            }),
          ).toMatchObject({ ok: false, code: 'session-not-ready' });
          expect(await session.consume(replacement)).toMatchObject({ ok: true, generation: 2 });
          expect((await advance(session, 2)).generation).toBe(2);
        } finally {
          session.dispose();
        }
      }),
    );
  }, 60_000);

  it('dispose aborts pending garment work and cleans a genuine late child', async () => {
    await withCompiled(async (session, generation) => {
      const real = garmentDomain.buildPatternImportDxfProductSavedAnnularGarmentV1;
      const started = deferred<void>();
      const resume = deferred<void>();
      let capturedSignal: AbortSignal | undefined;
      let child: garmentDomain.PatternImportDxfProductSavedAnnularGarmentOwnerV1 | null = null;
      // Only delay publication of a real fully built owner; no diagnostic acceptance is mocked.
      const spy = vi
        .spyOn(garmentDomain, 'buildPatternImportDxfProductSavedAnnularGarmentV1')
        .mockImplementation(async (request, signal) => {
          capturedSignal = signal;
          const result = await real(request, signal);
          if (result.ok) child = result.owner;
          started.resolve();
          await resume.promise;
          return result;
        });
      try {
        const pending = session.advanceSavedGarment({
          expectedGeneration: generation,
          readCurrentPlacement: freshPlacement,
        });
        await started.promise;
        expect(child).not.toBeNull();
        session.dispose();
        expect(capturedSignal?.aborted).toBe(true);
        expect(
          garmentDomain.getPatternImportDxfProductSavedAnnularGarmentLifetimeV1(child),
        ).toBeNull();
        resume.resolve();
        expect(await pending).toMatchObject({ ok: false, code: 'session-disposed' });
        expect(session.snapshot()).toMatchObject({ status: 'disposed', garmentReportSha256: null });
      } finally {
        resume.resolve();
        spy.mockRestore();
      }
    });
  }, 60_000);
});

describe('private observed-body pair handoff (synthetic pair lifecycle ports)', () => {
  it('authenticates the session before reading request fields or invoking caller methods', async () => {
    const session = createPatternImportDxfProductSavedAnnularGarmentSessionV1();
    let access = 0;
    const hostile = Object.defineProperty({}, 'displayedBodyOwner', {
      get() {
        access += 1;
        throw new Error('private owner disclosure');
      },
    });
    const steal = vi.fn();
    const proxy = new Proxy(session, {
      get() {
        access += 1;
        throw new Error('structural method invocation');
      },
    });
    for (const forged of [{ buildObservedBodyPair: steal }, { ...session }, proxy]) {
      expect(
        await buildPatternImportDxfProductSavedAnnularGarmentObservedBodyPairV1(
          forged,
          hostile as never,
        ),
      ).toMatchObject({
        ok: false,
        generation: 0,
        sourceContextBound: false,
        code: 'invalid-saved-garment-session',
      });
    }
    expect(access).toBe(0);
    expect(steal).not.toHaveBeenCalled();
    session.dispose();
  });

  it('derives actual private generation and keeps stale/refused calls from revoking the current child', async () => {
    await withCompiled(async (session, generation) =>
      withSource(async (replacement) =>
        withSyntheticPair(async ({ calls, children }) => {
          expect((await session.consume(replacement)).ok).toBe(true);
          const current = generation + 1;
          await advance(session, current);
          const result = await buildPatternImportDxfProductSavedAnnularGarmentObservedBodyPairV1(
            session,
            syntheticBodyRequest(current),
          );
          expect(result).toMatchObject({ ok: true, generation: current, sourceContextBound: true });
          if (!result.ok) throw new Error(result.detail);
          expect(calls[0]!.input.hostCompileGeneration).toBe(current);
          expect(calls[0]!.input.displayedBodyBinding).toEqual({ generation: 999 });
          expect(
            garmentDomain.getPatternImportDxfProductSavedAnnularGarmentLifetimeV1(
              calls[0]!.input.savedAnnularGarmentOwner,
            ),
          ).not.toBeNull();
          const aborted = new AbortController();
          aborted.abort();
          expect(
            await buildPatternImportDxfProductSavedAnnularGarmentObservedBodyPairV1(
              session,
              syntheticBodyRequest(generation),
            ),
          ).toMatchObject({
            ok: false,
            generation: current,
            sourceContextBound: false,
            code: 'stale-generation',
          });
          expect(
            await buildPatternImportDxfProductSavedAnnularGarmentObservedBodyPairV1(
              session,
              syntheticBodyRequest(current),
              aborted.signal,
            ),
          ).toMatchObject({ ok: false, code: 'session-cancelled', sourceContextBound: false });
          expect(
            await buildPatternImportDxfProductSavedAnnularGarmentObservedBodyPairV1(session, {
              ...syntheticBodyRequest(current),
              hostCompileGeneration: 888,
            } as never),
          ).toMatchObject({ ok: false, code: 'invalid-input', sourceContextBound: false });
          expect(calls).toHaveLength(1);
          expect(children.get(result.owner)?.signal.aborted).toBe(false);
          expect(await session.projectLatestGarment(current)).not.toBeNull();
        }),
      ),
    );
  }, 60_000);

  it('retains caller cancellation after return and never disposes the borrowed garment', async () => {
    await withCompiled(async (session, generation) =>
      withSyntheticPair(async ({ children }) => {
        await advance(session, generation);
        const caller = new AbortController();
        const result = await buildPatternImportDxfProductSavedAnnularGarmentObservedBodyPairV1(
          session,
          syntheticBodyRequest(generation),
          caller.signal,
        );
        if (!result.ok) throw new Error(result.detail);
        caller.abort();
        expect(children.get(result.owner)?.signal.aborted).toBe(true);
        expect(await session.projectLatestGarment(generation)).not.toBeNull();
      }),
    );
  }, 60_000);

  it('accepted source replacement aborts pending pair work and disposes its late child', async () => {
    await withCompiled(async (session, generation) =>
      withSource(async (replacement) =>
        withSyntheticPair(async ({ calls, children, controls }) => {
          await advance(session, generation);
          const started = deferred<void>();
          const resume = deferred<void>();
          controls.started = () => started.resolve();
          controls.waitBeforeReturn = resume.promise;
          const pending = buildPatternImportDxfProductSavedAnnularGarmentObservedBodyPairV1(
            session,
            syntheticBodyRequest(generation),
          );
          await started.promise;
          expect(
            await buildPatternImportDxfProductSavedAnnularGarmentObservedBodyPairV1(
              session,
              syntheticBodyRequest(generation),
            ),
          ).toMatchObject({ ok: false, code: 'session-busy' });
          const replacing = session.consume(replacement);
          expect(calls[0]!.signal.aborted).toBe(true);
          resume.resolve();
          expect(await pending).toMatchObject({
            ok: false,
            generation,
            sourceContextBound: true,
            code: 'session-cancelled',
          });
          expect([...children.values()].every((child) => child.signal.aborted)).toBe(true);
          expect(await replacing).toMatchObject({ ok: true, generation: generation + 1 });
        }),
      ),
    );
  }, 60_000);

  it('parent disposal revokes a returned pair; explicit child disposal removes caller bridges', async () => {
    await withCompiled(async (session, generation) =>
      withSyntheticPair(async ({ children, dispose }) => {
        await advance(session, generation);
        const caller = new AbortController();
        const added = vi.spyOn(EventTarget.prototype, 'addEventListener');
        const removed = vi.spyOn(EventTarget.prototype, 'removeEventListener');
        try {
          const first = await buildPatternImportDxfProductSavedAnnularGarmentObservedBodyPairV1(
            session,
            syntheticBodyRequest(generation),
            caller.signal,
          );
          if (!first.ok) throw new Error(first.detail);
          const bridges = added.mock.calls.flatMap((args, index) =>
            added.mock.contexts[index] === caller.signal && args[0] === 'abort' ? [args[1]] : [],
          );
          expect(bridges).toHaveLength(1);
          dispose(first.owner);
          expect(
            removed.mock.calls.flatMap((args, index) =>
              removed.mock.contexts[index] === caller.signal && args[0] === 'abort'
                ? [args[1]]
                : [],
            ),
          ).toEqual(bridges);
          const second = await buildPatternImportDxfProductSavedAnnularGarmentObservedBodyPairV1(
            session,
            syntheticBodyRequest(generation),
          );
          if (!second.ok) throw new Error(second.detail);
          session.dispose();
          expect(children.get(second.owner)?.signal.aborted).toBe(true);
        } finally {
          added.mockRestore();
          removed.mockRestore();
        }
      }),
    );
  }, 60_000);

  it('preserves a real build failure instead of misclassifying cleanup abort as cancellation', async () => {
    await withCompiled(async (session, generation) =>
      withSyntheticPair(async ({ controls }) => {
        await advance(session, generation);
        controls.fail = true;
        expect(
          await buildPatternImportDxfProductSavedAnnularGarmentObservedBodyPairV1(
            session,
            syntheticBodyRequest(generation),
          ),
        ).toMatchObject({
          ok: false,
          generation,
          sourceContextBound: true,
          code: 'saved-observed-pair-handoff-failed',
          detail: 'Synthetic pair build failure.',
        });
        expect(await session.projectLatestGarment(generation)).not.toBeNull();
      }),
    );
  }, 60_000);
});
