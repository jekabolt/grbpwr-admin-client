import { describe, expect, it, vi } from 'vitest';
import { withObservedFirstSaveFixtureV3 } from 'components/cloth-simulation-spike/pattern-import-dxf-product-saved-annular-observed-placement-first-save-v3.test-fixture';
import { issuePatternImportDxfProductSavedAnnularObservedPlacementV3 } from 'components/cloth-simulation-spike/pattern-import-dxf-product-saved-annular-observed-placement-garment-session-v1';
import {
  PATTERN_IMPORT_DXF_PRODUCT_MULTISEAM_PLACEMENT_SIDECAR_READ_REQUEST_V3,
  isPatternImportDxfProductMultiseamPlacementSidecarVerifiedReadOwnerV3,
} from 'lib/cloth/domain/pattern-import-dxf-product-multiseam-placement-sidecar-read-v3';
import { createPatternImportDxfProductCompositeObservedPlacementProductionSaverV3 } from './composite-placement-save-v1';
import { createPatternImportDxfProductCompositePlacementProductionReaderV1 } from './composite-placement-read-v1';

const production = vi.hoisted(() => ({ createClient: vi.fn() }));
vi.mock('api/api', () => ({ abortableAdminService: production.createClient }));
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

// Genuine source/issuer/codecs/CAS/fresh-reader. Only generated transport, the observed cube,
// and nominal station assets are fixtures; this does not prove a backend write or mounted body.
describe('observed placement production adapters', () => {
  it('shares the generated abortable client for one CAS and fresh V3 restore, refusing invalid issuance before transport', async () => {
    production.createClient.mockReset();
    await withObservedFirstSaveFixtureV3(async (f) => {
      const issued = await issuePatternImportDxfProductSavedAnnularObservedPlacementV3(f.session, {
        ...f.intent,
        displayedBodyOwner: f.body.bodyOwner,
        displayedBodyBinding: f.body.binding,
      });
      if (!issued.ok) throw new Error(JSON.stringify(issued));
      const bound = await f.bindSaver(issued.owner);
      production.createClient.mockImplementation(bound.host.createClient);
      const saver = createPatternImportDxfProductCompositeObservedPlacementProductionSaverV3(
        bound.host.readCurrentEvidence,
      );
      const forged = await saver.save({
        ...bound.saveRequest,
        placementOwner: { ...issued.owner },
      });
      expect(forged).toMatchObject({ ok: false, writeOutcome: 'not-attempted' });
      expect(production.createClient).not.toHaveBeenCalled();
      const cancelled = new AbortController();
      cancelled.abort();
      expect(await saver.save(bound.saveRequest, cancelled.signal)).toMatchObject({
        ok: false,
        writeOutcome: 'not-attempted',
      });
      expect(production.createClient).not.toHaveBeenCalled();

      const saved = await saver.save(bound.saveRequest);
      expect(saved, JSON.stringify(saved)).toMatchObject({ ok: true, writeOutcome: 'verified' });
      if (!saved.ok) throw new Error(JSON.stringify(saved));
      expect(
        isPatternImportDxfProductMultiseamPlacementSidecarVerifiedReadOwnerV3(saved.owner),
      ).toBe(true);
      expect(f.put).toHaveBeenCalledTimes(1);
      expect(f.put.mock.calls[0]![0].expectedPreviousSidecarSha256).toBe(f.initialSha);
      const readsBeforeRestore = f.get.mock.calls.length;
      const reader = createPatternImportDxfProductCompositePlacementProductionReaderV1(
        async () => ({
          row: bound.current.authority.row,
          topology: bound.current.placementBindings.topology,
          serverAssemblyRevision: bound.current.authority.serverAssemblyRevision,
        }),
      );
      const restored = await reader.readObserved(
        {
          schemaVersion: PATTERN_IMPORT_DXF_PRODUCT_MULTISEAM_PLACEMENT_SIDECAR_READ_REQUEST_V3,
          expectedRow: bound.current.authority.row,
          expectedBindings: bound.current.placementBindings,
        },
        bound.current.authority.serverAssemblyRevision,
      );
      expect(restored, JSON.stringify(restored)).toMatchObject({ ok: true });
      if (!restored.ok) throw new Error(JSON.stringify(restored));
      expect(
        isPatternImportDxfProductMultiseamPlacementSidecarVerifiedReadOwnerV3(restored.owner),
      ).toBe(true);
      expect(restored.owner.seal.canonicalSha256).toBe(issued.owner.seal.canonicalSha256);
      expect(restored.owner).not.toBe(saved.owner);
      expect(f.get.mock.calls.length).toBeGreaterThan(readsBeforeRestore);
      expect(f.put).toHaveBeenCalledTimes(1);
      expect(
        production.createClient.mock.calls.every(([signal]) => signal instanceof AbortSignal),
      ).toBe(true);
    });
  }, 120_000);
});
