import { expect, it } from 'vitest';
import { createPatternImportDxfPhaseESavedGarmentMeshProductionOwnerV1 } from 'components/managers/tech-card/components/pattern-import/phase-e-workbench/assembly-order-entry';
import {
  createPatternImportDxfProductSavedCanonicalMediumAnnularSeedV1,
  withPatternImportDxfProductSavedCanonicalMediumAnnularSavedSessionInputsV2,
} from 'lib/cloth/domain/pattern-import-dxf-product-saved-canonical-medium-annular-evidence-v1.test-fixture';
import { PATTERN_IMPORT_DXF_PRODUCT_SAVED_GARMENT_MESH_INGRESS_REQUEST_V1 } from 'lib/cloth/domain/pattern-import-dxf-product-saved-garment-mesh-ingress-v1';
import { decodePatternImportDxfProductCompositeSidecarV3 } from 'lib/cloth/domain/pattern-import-dxf-product-composite-sidecar-v3';
import {
  adminService,
  abortableAdminService,
  authService,
  requestHandler,
  createSavedObservedProductTransportV1,
  installSavedObservedProductTransportV1,
  readFixtureObservedModelV1,
  readFixtureModelTransportStatsV1,
} from './saved-observed-product-panel-v1.fixture-transport';

it('serves detached named model data on every ListModels/GetModel read, never a body or pose DTO', async () => {
  const before = readFixtureModelTransportStatsV1();
  const listed = await adminService.ListModels();
  const first = await adminService.GetModel({ id: 900731 });
  expect(first.model).toEqual(readFixtureObservedModelV1());
  expect(first.model.model?.name).toMatch(/^Fixture observed/);
  first.model.model!.measurements![0].valueMm = 1;
  listed.models[0].updatedAt = 'changed';
  const second = await adminService.GetModel({ id: 900731 });
  expect(second.model).toEqual(readFixtureObservedModelV1());
  expect(Object.keys(second.model)).not.toContain('displayMesh');
  expect(readFixtureModelTransportStatsV1()).toEqual({
    modelListReads: before.modelListReads + 1,
    freshModelReads: before.freshModelReads + 2,
  });
  await expect(adminService.GetModel({ id: 731 })).rejects.toThrow(
    'Unexpected fixture model identity',
  );
});
it('fails explicitly for every unsupported RPC and local cancellation, never falls through to a server', () => {
  expect(() => Reflect.get(adminService, 'GetModelMannequinPose')({ id: 900731 })).toThrow(
    'Unexpected fixture RPC',
  );
  expect(() => Reflect.get(authService, 'Login')({})).toThrow('Unexpected fixture RPC');
  expect(() => requestHandler()).toThrow('Remote requests are disabled');
});
it('prepares real exact DXF/AO Composite bytes and refuses stale CAS without fabricating any placement/body', async () => {
  const owner = createPatternImportDxfPhaseESavedGarmentMeshProductionOwnerV1();
  const signal = new AbortController().signal;
  try {
    const seed = await createPatternImportDxfProductSavedCanonicalMediumAnnularSeedV1();
    await owner.downstream.ready(signal);
    await withPatternImportDxfProductSavedCanonicalMediumAnnularSavedSessionInputsV2(
      seed,
      async (input) => {
        await owner.downstream.consume(
          {
            schemaVersion: PATTERN_IMPORT_DXF_PRODUCT_SAVED_GARMENT_MESH_INGRESS_REQUEST_V1,
            sourceOwner: input.sourceOwner,
            compositionRequest: input.compositionRequest,
            targetEdgeMm: input.targetEdgeMm,
          },
          signal,
        );
        const compiled = owner.latestCompile();
        if (!compiled) throw new Error('Real compiler did not produce its owner.');
        const transport = await createSavedObservedProductTransportV1(
          seed,
          compiled.composerSnapshot,
          input.compositionRequest,
        );
        installSavedObservedProductTransportV1(transport);
        const request = {
          techCardId: seed.row.techCardId,
          scopeKey: seed.row.scopeKey,
          patternLineKey: seed.row.patternLineKey,
        };
        const first = await transport.GetTechCardPatternSemanticSidecar(request);
        const bytes = Uint8Array.from(atob(first.semanticSidecar.sidecarBytes!), (character) =>
          character.charCodeAt(0),
        );
        const decoded = await decodePatternImportDxfProductCompositeSidecarV3(bytes);
        expect(decoded.ok).toBe(true);
        if (!decoded.ok) throw new Error('Real Composite decoder refused fixture.');
        expect(decoded.observedPlacementDocument).toBeNull();
        expect(decoded.placementDocument).toBeNull();
        first.semanticSidecar.sidecarSha256 = 'changed';
        expect(
          (await transport.GetTechCardPatternSemanticSidecar(request)).semanticSidecar
            .sidecarSha256,
        ).toBe(transport.stats().initialOuterSha256);
        await expect(
          transport.PutTechCardPatternSemanticSidecar({
            ...request,
            expectedPreviousSidecarSha256: '0'.repeat(64),
            selectedOperationNumber: compiled.composerSnapshot.assembly.sourceOperationNumber,
            expectedDxfSha256: seed.row.sha256,
            expectedPatternVersion: 4,
            expectedPostSaveReceiptSha256: first.semanticSidecar.postSaveReceiptSha256!,
            mediaType: first.semanticSidecar.mediaType!,
            sidecarBytes: first.semanticSidecar.sidecarBytes!,
            sidecarSha256: first.semanticSidecar.sidecarSha256!,
          }),
        ).rejects.toThrow('Fixture Composite CAS refused');
        const stopped = new AbortController();
        stopped.abort();
        await expect(
          abortableAdminService(stopped.signal).GetTechCardPatternSemanticSidecar(request),
        ).rejects.toThrow('Fixture RPC cancelled');
        expect(transport.stats()).toMatchObject({
          writes: 0,
          observedPlacement: null,
          placementSaved: false,
        });
      },
    );
  } finally {
    owner.dispose();
  }
}, 120_000);
