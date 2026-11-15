import type { PatternImportDxfProductPhaseEAssemblyProjectionV1 } from 'lib/pattern-import/dxf-product-phase-e-assembly-workbench-v1';

import {
  createPatternImportDxfPhaseEDraftCadSessionV1,
  type PatternImportDxfPhaseEDraftCadSessionResultV1,
  type PatternImportDxfPhaseEDraftCadSourceV1,
} from './draft-cad-session-v1';

export const PATTERN_IMPORT_DXF_PHASE_E_DRAFT_CAD_BINDING_V1 =
  'pattern-import-dxf-phase-e-draft-cad-binding/1' as const;

export type PatternImportDxfPhaseEDraftCadBindingInputV1 = Readonly<{
  source: PatternImportDxfPhaseEDraftCadSourceV1;
  projection: PatternImportDxfProductPhaseEAssemblyProjectionV1;
}>;

export const PATTERN_IMPORT_DXF_PHASE_E_DRAFT_CAD_BINDING_CLAIMS_V1 = Object.freeze({
  existingPhaseDSourceRequired: true,
  existingCatalogRequired: true,
  existingProjectionRequired: true,
  allSourceHashesExactMatched: true,
  createsDocumentModel: false,
  createsCoordinateAuthority: false,
  createsPersistenceModel: false,
  productionReady: false,
} as const);

function blocked(detail: string): PatternImportDxfPhaseEDraftCadSessionResultV1 {
  return Object.freeze({
    ok: false as const,
    session: null,
    blocker: Object.freeze({ code: 'invalid-source-binding' as const, detail }),
  });
}

/**
 * Opens Pattern/Draft against the same immutable Phase-D/catalog/projection identity already used
 * by Assembly Order. This adapter deliberately has no alternate source or persistence fallback.
 */
export function createPatternImportDxfPhaseEBoundDraftCadSessionV1(
  input: PatternImportDxfPhaseEDraftCadBindingInputV1,
): PatternImportDxfPhaseEDraftCadSessionResultV1 {
  const { source, projection } = input;
  if (
    source.phaseD.sourceFileId !== projection.sourceFileId ||
    source.catalog.canonicalSha256 !== projection.expectedCatalogCanonicalSha256 ||
    source.catalog.sizeSelectionCanonicalSha256 !== projection.sizeSelectionCanonicalSha256
  )
    return blocked(
      'Pattern/Draft requires the exact Phase-D source, authoring catalog and Assembly projection already open in Assembly Order.',
    );

  return createPatternImportDxfPhaseEDraftCadSessionV1(source);
}
