import { beforeAll, describe, expect, it } from 'vitest';

import {
  createPatternImportDxfProductSavedCanonicalMediumAnnularSeedV1,
  withPatternImportDxfProductSavedCanonicalMediumAnnularSavedSessionInputsV2,
} from './pattern-import-dxf-product-saved-canonical-medium-annular-evidence-v1.test-fixture';
import {
  PATTERN_IMPORT_DXF_PRODUCT_SAVED_GARMENT_MESH_INGRESS_REQUEST_V1,
  buildPatternImportDxfProductSavedGarmentMeshIngressV1,
} from './pattern-import-dxf-product-saved-garment-mesh-ingress-v1';
import {
  PATTERN_IMPORT_DXF_PRODUCT_SAVED_CANONICAL_MEDIUM_LOCAL_FRAME_REFINEMENT_REQUEST_V2,
  createPatternImportDxfProductSavedGarmentMeshCompileSessionV1,
  type PatternImportDxfProductSavedRefinedCapabilityContextV1,
  type PatternImportDxfProductSavedRefinedCapabilityV1,
} from './pattern-import-dxf-product-saved-garment-mesh-compile-session-v1';

type Context = PatternImportDxfProductSavedRefinedCapabilityContextV1<undefined>;
type ProbeOwner = Readonly<{ id: number }>;
type ProbeResult = Readonly<{ status: 'synthetic-context-probe'; generation: number }>;

// Only the terminal capability is a synthetic row/lifecycle probe. Ingress, Composer V2,
// saved writer receipt and local-frame refinement use the existing real implementations.
function probe(onBuild?: (context: Context) => Promise<void>) {
  const contexts: Context[] = [];
  const alive = new Set<ProbeOwner>();
  const disposed: ProbeOwner[] = [];
  const capability: PatternImportDxfProductSavedRefinedCapabilityV1<
    undefined,
    ProbeResult,
    ProbeOwner,
    ProbeOwner
  > = {
    async build(context) {
      contexts.push(context);
      await onBuild?.(context);
      const owner = Object.freeze({ id: contexts.length });
      alive.add(owner);
      return {
        owner,
        result: { status: 'synthetic-context-probe', generation: context.generation },
      };
    },
    project: (owner) => (alive.has(owner) ? owner : null),
    dispose(owner) {
      if (!alive.delete(owner)) return false;
      disposed.push(owner);
      return true;
    },
  };
  return { contexts, alive, disposed, capability };
}
type Probe = ReturnType<typeof probe>;
type Session = ReturnType<
  typeof createPatternImportDxfProductSavedGarmentMeshCompileSessionV1<
    undefined,
    ProbeResult,
    ProbeOwner,
    ProbeOwner
  >
>;
let seed: Awaited<
  ReturnType<typeof createPatternImportDxfProductSavedCanonicalMediumAnnularSeedV1>
>;
beforeAll(async () => {
  seed = await createPatternImportDxfProductSavedCanonicalMediumAnnularSeedV1();
}, 60_000);

async function withRefined(
  capture: Probe,
  omitIngressRow: boolean,
  consume: (session: Session, generation: number) => Promise<void>,
) {
  await withPatternImportDxfProductSavedCanonicalMediumAnnularSavedSessionInputsV2(
    seed,
    async (source) => {
      const session = createPatternImportDxfProductSavedGarmentMeshCompileSessionV1<
        undefined,
        ProbeResult,
        ProbeOwner,
        ProbeOwner
      >({
        refinedCapability: capture.capability,
        ...(omitIngressRow
          ? {
              // Compatibility seam: genuine ingress, but its optional historical row is absent.
              buildIngress: async (
                ...args: Parameters<typeof buildPatternImportDxfProductSavedGarmentMeshIngressV1>
              ) => {
                const result = await buildPatternImportDxfProductSavedGarmentMeshIngressV1(...args);
                if (!result.ok) return result;
                const { sourceRow, ...withoutRow } = result;
                expect(sourceRow).toEqual(seed.row);
                return withoutRow;
              },
            }
          : {}),
      });
      try {
        const compiled = await session.consume({
          schemaVersion: PATTERN_IMPORT_DXF_PRODUCT_SAVED_GARMENT_MESH_INGRESS_REQUEST_V1,
          sourceOwner: source.sourceOwner,
          compositionRequest: source.compositionRequest,
          targetEdgeMm: source.targetEdgeMm,
        });
        if (!compiled.ok) throw new Error(JSON.stringify(compiled));
        let receipt = source.writerFrameReceipt;
        if (!omitIngressRow) {
          const derived = await session.deriveLatestSavedWriterFrameReceipt(compiled.generation);
          if (!derived.ok) throw new Error(JSON.stringify(derived));
          receipt = derived.receipt;
        }
        const refined = await session.advanceCanonicalMediumLocalFrameRefinement({
          schemaVersion:
            PATTERN_IMPORT_DXF_PRODUCT_SAVED_CANONICAL_MEDIUM_LOCAL_FRAME_REFINEMENT_REQUEST_V2,
          expectedGeneration: compiled.generation,
          writerFrameReceipt: receipt,
        });
        if (!refined.ok) throw new Error(JSON.stringify(refined));
        await consume(session, compiled.generation);
      } finally {
        session.dispose();
      }
    },
  );
}

describe('private refined compiler context exact saved row', () => {
  it('passes a detached frozen exact eight-field production row for each capability invocation', async () => {
    const capture = probe();
    await withRefined(capture, false, async (session, generation) => {
      expect(
        await session.advanceCanonicalMediumRefinedCapability(generation, undefined),
      ).toMatchObject({ ok: true, generation });
      const first = capture.contexts[0]!.currentSavedRow;
      expect(first).toEqual(seed.row);
      expect(first).not.toBe(seed.row);
      expect(Object.isFrozen(first)).toBe(true);
      expect(Object.keys(first!).sort()).toEqual([
        'cardLockVersion',
        'patternLineKey',
        'revision',
        'scopeKey',
        'sha256',
        'sizeBytes',
        'techCardId',
        'url',
      ]);
      expect(Reflect.set(first!, 'url', 'https://invalid.example/changed.dxf')).toBe(false);
      expect(Reflect.set(first!, 'sizeBytes', 1)).toBe(false);
      expect(first).toEqual(seed.row);
      expect(
        await session.advanceCanonicalMediumRefinedCapability(generation, undefined),
      ).toMatchObject({ ok: true });
      expect(capture.contexts[1]!.currentSavedRow).toEqual(seed.row);
      expect(capture.contexts[1]!.currentSavedRow).not.toBe(first);
      expect(capture.disposed).toHaveLength(1);
      expect(session.snapshot()).not.toHaveProperty('currentSavedRow');
      expect(session).not.toHaveProperty('currentSavedRow');
      expect(
        await session.advanceCanonicalMediumRefinedCapability(generation + 1, undefined),
      ).toMatchObject({ ok: false, blocker: { code: 'stale-generation' } });
      expect(capture.contexts).toHaveLength(2);
      expect(capture.alive.size).toBe(1);
    });
  }, 60_000);

  it('preserves null for old injected ingress without blocking an existing refined capability', async () => {
    const capture = probe();
    await withRefined(capture, true, async (session, generation) => {
      expect(
        await session.advanceCanonicalMediumRefinedCapability(generation, undefined),
      ).toMatchObject({ ok: true });
      expect(capture.contexts[0]!.currentSavedRow).toBeNull();
      expect(session.projectLatestRefinedCapability()).not.toBeNull();
    });
  }, 60_000);

  it('keeps the captured row exact but disposes a late child after the source session is disposed', async () => {
    let release!: () => void;
    let entered!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const started = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const capture = probe(async () => {
      entered();
      await gate;
    });
    await withRefined(capture, false, async (session, generation) => {
      const pending = session.advanceCanonicalMediumRefinedCapability(generation, undefined);
      await started;
      const capturedRow = capture.contexts[0]!.currentSavedRow;
      session.dispose();
      release();
      expect(await pending).toMatchObject({ ok: false, blocker: { code: 'session-disposed' } });
      expect(capturedRow).toEqual(seed.row);
      expect(Object.isFrozen(capturedRow)).toBe(true);
      expect(capture.disposed).toHaveLength(1);
      expect(capture.alive.size).toBe(0);
      expect(session.projectLatestRefinedCapability()).toBeNull();
    });
  }, 60_000);
});
