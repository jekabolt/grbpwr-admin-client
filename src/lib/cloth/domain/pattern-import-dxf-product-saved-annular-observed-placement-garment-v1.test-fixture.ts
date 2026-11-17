import { Buffer } from 'node:buffer';
import { withLegacySavedAnnularGarmentSourceV1 } from './pattern-import-dxf-product-saved-annular-garment-port.test-fixture';
import {
  DXF_PRODUCT_TWO_PANEL_SKIRT_GARMENT_SEMANTICS_REQUEST_V1,
  buildDxfProductTwoPanelSkirtGarmentSemanticsV1,
  disposeDxfProductTwoPanelSkirtGarmentSemanticsV1,
} from './dxf-product-two-panel-skirt-garment-semantics-v1';
import {
  PATTERN_IMPORT_DXF_PRODUCT_MULTISEAM_PLACEMENT_SIDECAR_REQUEST_V3,
  buildPatternImportDxfProductMultiseamPlacementSidecarV3,
  encodePatternImportDxfProductMultiseamPlacementSidecarV3,
  type PatternImportDxfProductMultiseamPlacementSidecarRequestV3,
} from './pattern-import-dxf-product-multiseam-placement-sidecar-v3';
import {
  PATTERN_IMPORT_DXF_PRODUCT_MULTISEAM_PLACEMENT_SIDECAR_READ_REQUEST_V3,
  readPatternImportDxfProductMultiseamPlacementSidecarV3,
} from './pattern-import-dxf-product-multiseam-placement-sidecar-read-v3';
import {
  PATTERN_IMPORT_DXF_PRODUCT_SAVED_ANNULAR_OBSERVED_PLACEMENT_GARMENT_V1,
  type PatternImportDxfProductSavedAnnularObservedPlacementGarmentRequestV1,
} from './pattern-import-dxf-product-saved-annular-observed-placement-garment-v1';
import {
  adoptSavedModelDisplayedTriangleBodyV2,
  createSavedModelDisplayedTriangleBodyOwnerV2,
  disposeSavedModelDisplayedTriangleBodyOwnerV2,
} from 'components/managers/models/components/saved-model-displayed-triangle-body-owner-v2';
import { sessionFixture } from 'components/managers/models/components/saved-model-displayed-triangle-body-session-v2.test-fixture';
import { projectSavedModelObservedPlacementTargetV1 } from 'components/cloth-simulation-spike/saved-model-observed-placement-target-v1';

// Fixture transport only. Genuine V3 codec/read registry and every garment kernel execute.
// Host observation is a synthetic triangle; this test never claims actual V9 or runtime admission.
async function freshObservedPlacement(
  request: PatternImportDxfProductMultiseamPlacementSidecarRequestV3,
  signal?: AbortSignal,
) {
  const built = await buildPatternImportDxfProductMultiseamPlacementSidecarV3(request);
  if (!built.ok) throw new Error(JSON.stringify(built.blockers));
  const encoded = encodePatternImportDxfProductMultiseamPlacementSidecarV3(built.owner);
  if (!encoded.ok) throw new Error('Unissued storage owner.');
  const row = built.document.bindings.row;
  const expectedRow = {
    techCardId: row.techCardId,
    scopeKey: row.scopeKey,
    patternLineKey: row.patternLineKey,
    revision: row.revision,
    cardLockVersion: row.cardLockVersion,
    url: row.patternUrl,
    sizeBytes: 1024,
    sha256: row.dxfSha256,
  };
  const read = await readPatternImportDxfProductMultiseamPlacementSidecarV3(
    {
      schemaVersion: PATTERN_IMPORT_DXF_PRODUCT_MULTISEAM_PLACEMENT_SIDECAR_READ_REQUEST_V3,
      expectedRow,
      expectedBindings: built.document.bindings,
    },
    {
      getSidecar: async () => ({
        status: 'found',
        row: {
          techCardId: row.techCardId,
          patternLineKey: row.patternLineKey,
          dxfSha256: row.dxfSha256,
          patternVersion: row.patternVersion,
          sidecarSha256: encoded.canonicalSha256,
          mediaType: built.document.mediaType,
          byteLength: encoded.canonicalByteLength,
          sidecarBytes: Buffer.from(encoded.bytes).toString('base64'),
          postSaveReceiptSha256: row.postSaveReceiptSha256,
          cardLockVersion: row.cardLockVersion,
          savedRowRevision: row.revision,
          createdAt: undefined,
          createdBy: 'explicit-observed-test-intent',
        },
      }),
      readCurrentEvidence: async () => ({
        row: expectedRow,
        topology: built.document.bindings.topology,
      }),
    },
    signal,
  );
  if (!read.ok) throw new Error(JSON.stringify(read.blockers));
  return read.owner;
}

export async function withObservedPlacementGarmentSourceV1<T>(
  consume: (input: {
    request: PatternImportDxfProductSavedAnnularObservedPlacementGarmentRequestV1;
    state: { current: PatternImportDxfProductMultiseamPlacementSidecarRequestV3; reads: number };
    semanticsSha: string;
    historicalRequest: Parameters<
      Parameters<typeof withLegacySavedAnnularGarmentSourceV1>[0]
    >[0]['request'];
  }) => Promise<T>,
): Promise<T> {
  return withLegacySavedAnnularGarmentSourceV1(
    async ({ request: historicalRequest, placementRequest }) => {
      const observed = await sessionFixture(731, 7);
      const body = createSavedModelDisplayedTriangleBodyOwnerV2();
      let cleanupD0 = () => {};
      try {
        const adopted = await adoptSavedModelDisplayedTriangleBodyV2(body, {
          displayedInput: observed.input,
          expectedDisplayedIdentity: observed.input.project()!.identity,
          expectedPersistedModel: {
            id: observed.state.model!.id!,
            updatedAt: observed.state.model!.updatedAt!,
          },
          readCurrentModel: async () => structuredClone(observed.state.model),
        });
        if (adopted.status !== 'committed') throw new Error(JSON.stringify(adopted));
        const d0 = await buildDxfProductTwoPanelSkirtGarmentSemanticsV1({
          schemaVersion: DXF_PRODUCT_TWO_PANEL_SKIRT_GARMENT_SEMANTICS_REQUEST_V1,
          origin: 'verified-saved-row',
          composerOwner: historicalRequest.composerV2Owner,
          expectedComposerCanonicalSha256:
            historicalRequest.composerV2Owner.snapshot.seal.canonicalSha256,
          garment: placementRequest.placementAuthoring.semantics.garment,
          policy: placementRequest.placementAuthoring.semantics.policy,
        });
        if (!d0.ok) throw new Error(JSON.stringify(d0));
        cleanupD0 = () => {
          disposeDxfProductTwoPanelSkirtGarmentSemanticsV1(d0.owner);
        };
        const target = await projectSavedModelObservedPlacementTargetV1(
          body,
          adopted.snapshot.binding,
        );
        if (!target.ok) throw new Error(target.detail);
        const current: PatternImportDxfProductMultiseamPlacementSidecarRequestV3 = {
          schemaVersion: PATTERN_IMPORT_DXF_PRODUCT_MULTISEAM_PLACEMENT_SIDECAR_REQUEST_V3,
          bindings: placementRequest.bindings,
          placementAuthoring: {
            authoredOrigin: placementRequest.placementAuthoring.authoredOrigin,
            authoredImportGeneration: placementRequest.placementAuthoring.authoredImportGeneration,
            semantics: {
              schemaVersion: DXF_PRODUCT_TWO_PANEL_SKIRT_GARMENT_SEMANTICS_REQUEST_V1,
              garment: placementRequest.placementAuthoring.semantics.garment,
              policy: placementRequest.placementAuthoring.semantics.policy,
              originalCanonicalSha256: d0.snapshot.seal.canonicalSha256,
            },
            annular: placementRequest.placementAuthoring.annular,
            observedTarget: { target: target.target, canonicalSha256: target.canonicalSha256 },
          },
        };
        const state = { current, reads: 0 };
        return await consume({
          state,
          semanticsSha: d0.snapshot.seal.canonicalSha256,
          historicalRequest,
          request: {
            ...historicalRequest,
            schemaVersion: PATTERN_IMPORT_DXF_PRODUCT_SAVED_ANNULAR_OBSERVED_PLACEMENT_GARMENT_V1,
            readCurrentPlacement: async (signal) => {
              state.reads++;
              return freshObservedPlacement(state.current, signal);
            },
          },
        });
      } finally {
        cleanupD0();
        disposeSavedModelDisplayedTriangleBodyOwnerV2(body);
        observed.input.dispose();
      }
    },
  );
}
