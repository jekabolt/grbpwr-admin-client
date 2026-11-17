import { BETA_SKIRT_G3B2_PREVIEW_MANNEQUIN_REQUEST_V1 } from 'components/cloth-simulation-spike/beta-skirt-g3b2-preview-mannequin-request-v1';
import type { BetaSkirtG3b2PreviewMannequinResultV1 } from 'components/cloth-simulation-spike/beta-skirt-g3b2-preview-mannequin-contract-v1';
import { createPatternImportDxfProductSavedCanonicalMediumAuthoredInputV1Fixture } from 'components/cloth-simulation-spike/pattern-import-dxf-product-saved-canonical-medium-actual-body-session-v1.test-fixture';
import {
  createPatternImportDxfProductSavedPlacementRequestV1Fixture,
  readPatternImportDxfProductSavedPlacementV1Fixture,
} from 'components/cloth-simulation-spike/pattern-import-dxf-product-saved-placement-authored-input-v1.test-fixture';

import { projectPatternImportDxfProductGarmentMeshComposerV2 } from './pattern-import-dxf-product-garment-mesh-composer-v2';
import {
  createPatternImportDxfProductSavedCanonicalMediumAnnularSeedV1,
  withPatternImportDxfProductSavedCanonicalMediumAnnularPlacementInputsV2,
  type PatternImportDxfProductSavedCanonicalMediumAnnularPlacementInputsV2,
} from './pattern-import-dxf-product-saved-canonical-medium-annular-evidence-v1.test-fixture';
import {
  PATTERN_IMPORT_DXF_PRODUCT_SAVED_ANNULAR_GARMENT_V1,
  type PatternImportDxfProductSavedAnnularGarmentRequestV1,
} from './pattern-import-dxf-product-saved-annular-garment-v1';

type PlacementRequest = Awaited<
  ReturnType<typeof createPatternImportDxfProductSavedPlacementRequestV1Fixture>
>;

// This creates persisted test intent, not a body owner or actual-display admission. The production
// producer below has no body input. All mesh, D0, mapping, self/orientation and V5 kernels are real.
export async function withLegacySavedAnnularGarmentSourceV1<T>(
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
