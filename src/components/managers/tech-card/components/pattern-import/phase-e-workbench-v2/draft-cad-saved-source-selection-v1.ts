import { selectPatternImportDxfProductDraftPhaseDSizeV1 } from 'lib/cloth/domain/pattern-import-dxf-product-draft-phase-d-selection-v1';
import { buildPatternImportDxfProductPhaseEAuthoringCatalogV1 } from 'lib/cloth/domain/pattern-import-dxf-product-phase-e-authoring-catalog-v1';
import { projectPatternImportDxfProductPhaseEAssemblyV1 } from 'lib/pattern-import/dxf-product-phase-e-assembly-workbench-v1';
import type { DxfProductSavedRowIdentityV1 } from 'lib/pattern-import/dxf-product-saved-reprocess-owner-v1';
import type { CardDraft } from 'lib/pattern-import/types';
import type { PatternImportDxfPhaseEDraftCadSessionV1 } from './draft-cad-session-v1';

export function sameSavedDraftRowV1(
  a: DxfProductSavedRowIdentityV1,
  b: DxfProductSavedRowIdentityV1,
) {
  return (
    a.techCardId === b.techCardId &&
    a.scopeKey === b.scopeKey &&
    a.patternLineKey === b.patternLineKey &&
    a.revision === b.revision &&
    a.cardLockVersion === b.cardLockVersion &&
    a.sha256 === b.sha256 &&
    a.url === b.url &&
    a.sizeBytes === b.sizeBytes
  );
}

export async function selectMatchingSavedDraftV1(
  draft: CardDraft,
  scopeKey: string,
  sizeToken: string,
  session: PatternImportDxfPhaseEDraftCadSessionV1,
) {
  const chosen = await selectPatternImportDxfProductDraftPhaseDSizeV1(draft, scopeKey, sizeToken);
  if (!chosen.ok) return null;
  const selection = chosen.selection;
  if (
    selection.selection.selectedGeometrySha256 !== session.source.phaseD.selectedGeometrySha256 ||
    selection.selection.canonicalSha256 !== session.source.catalog.sizeSelectionCanonicalSha256 ||
    selection.phaseD.sourceSha256 !== session.source.phaseD.sourceSha256
  )
    return null;
  const catalog = await buildPatternImportDxfProductPhaseEAuthoringCatalogV1(
    draft,
    scopeKey,
    sizeToken,
  );
  if (!catalog.ok || catalog.catalog.canonicalSha256 !== session.source.catalog.canonicalSha256)
    return null;
  const projected = projectPatternImportDxfProductPhaseEAssemblyV1(catalog.catalog, selection);
  return projected.ok ? { selection, projection: projected.projection } : null;
}
