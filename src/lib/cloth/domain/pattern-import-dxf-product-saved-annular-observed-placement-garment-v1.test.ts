import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { sha256Hex } from 'lib/features/sha256';
import { withObservedPlacementGarmentSourceV1 } from './pattern-import-dxf-product-saved-annular-observed-placement-garment-v1.test-fixture';
import {
  buildPatternImportDxfProductSavedAnnularObservedPlacementGarmentV1 as build,
  projectPatternImportDxfProductSavedAnnularObservedPlacementGarmentV1 as project,
  getPatternImportDxfProductSavedAnnularObservedPlacementGarmentLifetimeV1 as lifetime,
  disposePatternImportDxfProductSavedAnnularObservedPlacementGarmentV1 as dispose,
} from './pattern-import-dxf-product-saved-annular-observed-placement-garment-v1';
import {
  projectPatternImportDxfProductSavedAnnularGarmentV1 as legacyProject,
  disposePatternImportDxfProductSavedAnnularGarmentV1 as legacyDispose,
} from './pattern-import-dxf-product-saved-annular-garment-v1';
import { projectPatternImportDxfProductGarmentMeshComposerV2 } from './pattern-import-dxf-product-garment-mesh-composer-v2';
import { patternImportDxfProductPlacementWireCodecV1 } from './pattern-import-dxf-product-multiseam-placement-sidecar-v2';

const baseline = JSON.parse(
  readFileSync(
    new URL(
      './pattern-import-dxf-product-saved-annular-garment-v1.legacy-baseline.json',
      import.meta.url,
    ),
    'utf8',
  ),
) as { buffers: Record<string, string> };
const sha = (value: ArrayBufferView | ArrayBuffer) =>
  createHash('sha256')
    .update(
      value instanceof ArrayBuffer
        ? new Uint8Array(value)
        : new Uint8Array(value.buffer, value.byteOffset, value.byteLength),
    )
    .digest('hex');

describe('fresh observed Placement V3 to genuine body-free saved garment (fixture transport)', () => {
  it('consumes real V3 read and D0 owners with exact legacy geometry/rest, retaining V9 pose without A coercion', async () => {
    await withObservedPlacementGarmentSourceV1(async ({ request, state, semanticsSha }) => {
      const built = await build(request);
      expect(built, JSON.stringify(built)).toMatchObject({ ok: true });
      if (!built.ok) throw new Error(built.detail);
      try {
        expect(built.report.bindings.semanticsCanonicalSha256).toBe(semanticsSha);
        expect(built.report.persistedPlacement.authoring.semantics).not.toHaveProperty('body');
        expect(
          built.report.persistedPlacement.authoring.observedTarget.target.pose.document.pose
            .headYawDeg,
        ).toBe(7);
        expect(built.report.claims).toMatchObject({
          bodyTargetConsumed: false,
          bodyAdmissionAuthority: false,
          runtimeAuthority: false,
        });
        expect(built.report.decision).toBe('garment-local-material-qualified');
        expect(state.reads).toBe(2);
        const p = await project(built.owner);
        if (!p?.normalizedMaterial) throw new Error('Missing genuine material.');
        expect({
          localXYZ: sha(p.mapping.positions3M),
          topology: sha(p.mapping.normalizedTriangles),
          seamPairs: sha(p.mapping.seamPairs),
          pins: sha(p.mapping.pinnedWaistVertexIndices),
          physicalXYZW: sha(p.normalizedMaterial.initialPhysicalPositionsInvMassKg),
          restFrames: sha(
            p.normalizedMaterial.normalizedV5.simulation.constraints.continuumStrain
              .triangleRestFrames,
          ),
        }).toEqual(baseline.buffers);
        expect(await legacyProject(built.owner)).toBeNull();
        expect(legacyDispose(built.owner)).toBe(false);
        expect(await project({ ...built.owner })).toBeNull();
        expect(await project(new Proxy(built.owner, {}))).toBeNull();
        expect(lifetime(built.owner)?.aborted).toBe(false);
      } finally {
        dispose(built.owner);
      }
      expect(
        projectPatternImportDxfProductGarmentMeshComposerV2(request.composerV2Owner),
      ).not.toBeNull();
    });
  }, 60000);

  it('refuses copied V3 read owners and genuine historical V2 owners at the observed entry', async () => {
    await withObservedPlacementGarmentSourceV1(async ({ request, historicalRequest }) => {
      const v3 = await request.readCurrentPlacement();
      expect(v3).not.toBeNull();
      for (const readCurrentPlacement of [
        async () => ({ ...v3 }),
        historicalRequest.readCurrentPlacement,
      ]) {
        expect(await build({ ...request, readCurrentPlacement })).toMatchObject({
          ok: false,
          code: 'placement-read-blocked',
        });
      }
      expect(
        projectPatternImportDxfProductGarmentMeshComposerV2(request.composerV2Owner),
      ).not.toBeNull();
    });
  }, 60000);

  it('revokes the garment after a fresh saved target change without touching the source', async () => {
    await withObservedPlacementGarmentSourceV1(async ({ request, state }) => {
      const built = await build(request);
      if (!built.ok) throw new Error(built.detail);
      const signal = lifetime(built.owner)!;
      const before = state.current.placementAuthoring.observedTarget.target;
      const target = {
        ...before,
        displayedModel: {
          ...before.displayedModel,
          modelContentRevision: before.displayedModel.modelContentRevision + '-changed',
        },
      };
      const canonicalSha256 = await sha256Hex(
        new TextEncoder().encode(
          patternImportDxfProductPlacementWireCodecV1.canonical([target.kind, target]),
        ),
      );
      state.current = {
        ...state.current,
        placementAuthoring: {
          ...state.current.placementAuthoring,
          observedTarget: { target, canonicalSha256 },
        },
      };
      expect(await project(built.owner)).toBeNull();
      expect(signal.aborted).toBe(true);
      expect(
        projectPatternImportDxfProductGarmentMeshComposerV2(request.composerV2Owner),
      ).not.toBeNull();
    });
  }, 60000);

  it('cancels only a caller read and retains source lifetime cancellation after successful return', async () => {
    await withObservedPlacementGarmentSourceV1(async ({ request }) => {
      const parent = new AbortController();
      const built = await build(request, parent.signal);
      if (!built.ok) throw new Error(built.detail);
      const signal = lifetime(built.owner)!;
      const read = new AbortController();
      read.abort();
      expect(await project(built.owner, read.signal)).toBeNull();
      expect(signal.aborted).toBe(false);
      expect(await project(built.owner)).not.toBeNull();
      parent.abort();
      expect(signal.aborted).toBe(true);
      expect(await project(built.owner)).toBeNull();
      expect(
        projectPatternImportDxfProductGarmentMeshComposerV2(request.composerV2Owner),
      ).not.toBeNull();
    });
  }, 60000);

  it('does not publish a child cancelled during its final fresh persisted read', async () => {
    await withObservedPlacementGarmentSourceV1(async ({ request }) => {
      const parent = new AbortController();
      let reads = 0;
      const result = await build(
        {
          ...request,
          readCurrentPlacement: async (signal?: AbortSignal) => {
            const value = await request.readCurrentPlacement(signal);
            if (++reads === 2) parent.abort();
            return value;
          },
        },
        parent.signal,
      );
      expect(result).toMatchObject({ ok: false, code: 'cancelled' });
      expect(
        projectPatternImportDxfProductGarmentMeshComposerV2(request.composerV2Owner),
      ).not.toBeNull();
    });
  }, 60000);
});
