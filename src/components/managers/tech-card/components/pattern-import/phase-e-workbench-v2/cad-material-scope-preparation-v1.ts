import type { PatternImportDxfProductPhaseEAuthoringCatalogV1 } from 'lib/cloth/domain/pattern-import-dxf-product-phase-e-authoring-catalog-v1';
import type { PatternImportDxfProductDraftPhaseDSelectionResultV1 } from 'lib/cloth/domain/pattern-import-dxf-product-draft-phase-d-selection-v1';
import type { DxfProductPhaseDSizeSelectionResultV1 } from 'lib/pattern-import/dxf-product-phase-d-size-selection-v1';
import type { PatternImportDxfProductPhaseEAssemblyProjectionV1 } from 'lib/pattern-import/dxf-product-phase-e-assembly-workbench-v1';

import type { PatternImportDxfPhaseECardSessionV1 } from '../phase-e-workbench-card-session-v1';
import {
  derivePatternImportDxfPhaseEDocumentAuthorityV1,
  type PatternImportDxfPhaseEDocumentAuthorityV1,
  type PatternImportDxfPhaseEDocumentEvidenceV1,
} from '../phase-e-workbench-document-authority-v1';
import {
  buildPatternImportDxfPhaseECadMaterialScopeCatalogV1,
  type PatternImportDxfPhaseECadMaterialScopeCatalogResultV1,
} from './cad-material-scope-catalog-v1';
import {
  createPatternImportDxfPhaseEDraftCadCompileSourceV1,
  type PatternImportDxfPhaseEDraftCadCompileSourceV1,
} from './draft-cad-compile-source-v1';

export const PATTERN_IMPORT_DXF_PHASE_E_CAD_MATERIAL_SCOPE_PREPARATION_V1 =
  'pattern-import-dxf-phase-e-cad-material-scope-preparation/1' as const;

export const PATTERN_IMPORT_DXF_PHASE_E_CAD_MATERIAL_SCOPE_PREPARATION_CLAIMS_V1 = Object.freeze({
  existingCardSessionOwnerReused: true,
  existingPhaseDSelectionReused: true,
  existingCatalogAndProjectionReused: true,
  existingDocumentEvidenceOwnerReused: true,
  verifiedWriterReplayRequiredForEveryScope: true,
  rawDxfExposed: false,
  createsWriter: false,
  performsDirectNetwork: false,
  requestsAutosave: false,
  createsCrossScopeSeamAuthority: false,
  crossScopeSeamingAvailable: false,
  publishesPartialPreparedSet: false,
  savedReloadMultipleRowOwnerRequired: true,
  productionMounted: true,
} as const);

type SuccessfulSelection = Extract<DxfProductPhaseDSizeSelectionResultV1, { ok: true }>;

export type PatternImportDxfPhaseECadPreparedMaterialScopeV1 = Readonly<{
  scopeKey: string;
  sizeToken: string;
  sourceRevision: number;
  selection: SuccessfulSelection;
  catalog: PatternImportDxfProductPhaseEAuthoringCatalogV1;
  projection: PatternImportDxfProductPhaseEAssemblyProjectionV1;
  documentEvidence: PatternImportDxfPhaseEDocumentEvidenceV1;
  documentAuthority: PatternImportDxfPhaseEDocumentAuthorityV1;
  compileSource: PatternImportDxfPhaseEDraftCadCompileSourceV1;
}>;

export type PatternImportDxfPhaseECadMaterialScopePreparationBlockerV1 = Readonly<{
  scopeKey: string | null;
  code:
    | 'material-scope-catalog-unavailable'
    | 'material-scope-session-stale'
    | 'material-scope-compile-source-unavailable'
    | 'material-scope-active-binding-stale'
    | 'material-scope-phase-d-unavailable'
    | 'material-scope-authoring-catalog-unavailable'
    | 'material-scope-document-evidence-unavailable'
    | 'material-scope-document-evidence-stale'
    | 'material-scope-document-authority-unavailable'
    | 'material-scope-projection-unavailable'
    | 'material-scope-preparation-failed'
    | 'cross-material-seaming-owner-unavailable';
  detail: string;
}>;

export type PatternImportDxfPhaseECadMaterialScopePreparationResultV1 =
  | Readonly<{
      ok: true;
      catalog: Extract<PatternImportDxfPhaseECadMaterialScopeCatalogResultV1, { ok: true }>;
      scopes: readonly PatternImportDxfPhaseECadPreparedMaterialScopeV1[];
      crossScopeSeamingAvailable: false;
      crossScopeSeamingBlocker: PatternImportDxfPhaseECadMaterialScopePreparationBlockerV1;
      blocker: null;
      claims: typeof PATTERN_IMPORT_DXF_PHASE_E_CAD_MATERIAL_SCOPE_PREPARATION_CLAIMS_V1;
    }>
  | Readonly<{
      ok: false;
      catalog: PatternImportDxfPhaseECadMaterialScopeCatalogResultV1 | null;
      scopes: readonly [];
      crossScopeSeamingAvailable: false;
      crossScopeSeamingBlocker: PatternImportDxfPhaseECadMaterialScopePreparationBlockerV1;
      blocker: PatternImportDxfPhaseECadMaterialScopePreparationBlockerV1;
      claims: typeof PATTERN_IMPORT_DXF_PHASE_E_CAD_MATERIAL_SCOPE_PREPARATION_CLAIMS_V1;
    }>;

export type PatternImportDxfPhaseECadMaterialScopePreparationDependenciesV1 = Readonly<{
  select: (
    draft: PatternImportDxfPhaseECardSessionV1['draft'],
    scopeKey: string,
    sizeToken: string,
  ) => Promise<PatternImportDxfProductDraftPhaseDSelectionResultV1>;
  buildCatalog: (
    draft: PatternImportDxfPhaseECardSessionV1['draft'],
    scopeKey: string,
    sizeToken: string,
  ) => Promise<
    | Readonly<{ ok: true; catalog: PatternImportDxfProductPhaseEAuthoringCatalogV1 }>
    | Readonly<{
        ok: false;
        catalog: null;
        blockers: readonly Readonly<{ code: string; detail: string }>[];
      }>
  >;
  project: (
    catalog: PatternImportDxfProductPhaseEAuthoringCatalogV1,
    selection: SuccessfulSelection,
  ) =>
    | Readonly<{ ok: true; projection: PatternImportDxfProductPhaseEAssemblyProjectionV1 }>
    | Readonly<{
        ok: false;
        projection: null;
        blockers: readonly Readonly<{ code: string; detail: string }>[];
      }>;
  deriveAuthority: typeof derivePatternImportDxfPhaseEDocumentAuthorityV1;
}>;

const crossScopeBlocker = Object.freeze({
  scopeKey: null,
  code: 'cross-material-seaming-owner-unavailable' as const,
  detail:
    'Material scopes can be edited independently, but sewing across them requires one atomic cross-scope topology owner.',
});

function blocked(
  blocker: PatternImportDxfPhaseECadMaterialScopePreparationBlockerV1,
  catalog: PatternImportDxfPhaseECadMaterialScopeCatalogResultV1 | null = null,
): PatternImportDxfPhaseECadMaterialScopePreparationResultV1 {
  return Object.freeze({
    ok: false as const,
    catalog,
    scopes: Object.freeze([]) as readonly [],
    crossScopeSeamingAvailable: false as const,
    crossScopeSeamingBlocker: crossScopeBlocker,
    blocker: Object.freeze(blocker),
    claims: PATTERN_IMPORT_DXF_PHASE_E_CAD_MATERIAL_SCOPE_PREPARATION_CLAIMS_V1,
  });
}

async function defaultDependencies(): Promise<PatternImportDxfPhaseECadMaterialScopePreparationDependenciesV1> {
  const [selection, catalog, projection] = await Promise.all([
    import('lib/cloth/domain/pattern-import-dxf-product-draft-phase-d-selection-v1'),
    import('lib/cloth/domain/pattern-import-dxf-product-phase-e-authoring-catalog-v1'),
    import('lib/pattern-import/dxf-product-phase-e-assembly-workbench-v1'),
  ]);
  return Object.freeze({
    select: selection.selectPatternImportDxfProductDraftPhaseDSizeV1,
    buildCatalog: catalog.buildPatternImportDxfProductPhaseEAuthoringCatalogV1,
    project: projection.projectPatternImportDxfProductPhaseEAssemblyV1,
    deriveAuthority: derivePatternImportDxfPhaseEDocumentAuthorityV1,
  });
}

function activeBindingCurrent(
  techCardId: number,
  sourceRevision: number,
  active: PatternImportDxfPhaseECadPreparedMaterialScopeV1,
): boolean {
  return (
    active.sourceRevision === sourceRevision &&
    active.documentEvidence.techCardId === techCardId &&
    active.documentEvidence.scopeKey === active.scopeKey &&
    active.documentAuthority.evidence.techCardId === techCardId &&
    active.documentAuthority.evidence.scopeKey === active.scopeKey &&
    active.documentAuthority.sizeSelectionCanonicalSha256 ===
      active.selection.selection.canonicalSha256 &&
    active.documentAuthority.catalogCanonicalSha256 === active.catalog.canonicalSha256 &&
    active.projection.expectedCatalogCanonicalSha256 === active.catalog.canonicalSha256 &&
    active.projection.sizeSelectionCanonicalSha256 === active.selection.selection.canonicalSha256
  );
}

/**
 * Prepares every BOM-bound scope through the same fresh card-session owner. The function never
 * reads raw DXF text and publishes no partial multi-scope result: one stale scope keeps the linked
 * slots read-only while the already prepared Assembly scope remains usable by its caller.
 */
export async function preparePatternImportDxfPhaseECadMaterialScopesV1(
  input: Readonly<{
    cardSession: PatternImportDxfPhaseECardSessionV1;
    expectedImportGeneration: number;
    sizeToken: string;
    active: Omit<PatternImportDxfPhaseECadPreparedMaterialScopeV1, 'compileSource'>;
  }>,
  dependencies?: PatternImportDxfPhaseECadMaterialScopePreparationDependenciesV1,
): Promise<PatternImportDxfPhaseECadMaterialScopePreparationResultV1> {
  const { cardSession } = input;
  if (
    cardSession.importGeneration !== input.expectedImportGeneration ||
    cardSession.techCardId !== cardSession.draft.techCardId
  )
    return blocked({
      scopeKey: input.active.scopeKey,
      code: 'material-scope-session-stale',
      detail: 'The current card import generation changed before material-scope preparation.',
    });
  const catalog = buildPatternImportDxfPhaseECadMaterialScopeCatalogV1(cardSession.draft);
  if (!catalog.ok)
    return blocked(
      {
        scopeKey: null,
        code: 'material-scope-catalog-unavailable',
        detail: catalog.blocker.detail,
      },
      catalog,
    );
  const compileSource = createPatternImportDxfPhaseEDraftCadCompileSourceV1(cardSession.draft);
  if (!compileSource)
    return blocked(
      {
        scopeKey: null,
        code: 'material-scope-compile-source-unavailable',
        detail: 'The current card draft has no detached writer-replay compile source.',
      },
      catalog,
    );
  const active = Object.freeze({ ...input.active, compileSource });
  if (
    !catalog.scopes.some(({ scopeKey }) => scopeKey === active.scopeKey) ||
    !activeBindingCurrent(cardSession.techCardId, input.expectedImportGeneration, active)
  )
    return blocked(
      {
        scopeKey: active.scopeKey,
        code: 'material-scope-active-binding-stale',
        detail: 'The active material scope no longer matches its exact Phase-D/catalog document.',
      },
      catalog,
    );

  const deps = dependencies ?? (await defaultDependencies());
  const prepared: PatternImportDxfPhaseECadPreparedMaterialScopeV1[] = [active];
  for (const scope of catalog.scopes) {
    if (scope.scopeKey === active.scopeKey) continue;
    try {
      const selected = await deps.select(cardSession.draft, scope.scopeKey, input.sizeToken);
      if (!selected.ok)
        return blocked(
          {
            scopeKey: scope.scopeKey,
            code: 'material-scope-phase-d-unavailable',
            detail: selected.blockers[0]?.detail ?? 'Exact Phase-D selection is unavailable.',
          },
          catalog,
        );
      const catalogResult = await deps.buildCatalog(
        cardSession.draft,
        scope.scopeKey,
        input.sizeToken,
      );
      if (!catalogResult.ok)
        return blocked(
          {
            scopeKey: scope.scopeKey,
            code: 'material-scope-authoring-catalog-unavailable',
            detail: catalogResult.blockers[0]?.detail ?? 'The exact catalog is unavailable.',
          },
          catalog,
        );
      const evidenceResult = await cardSession.loadDocumentEvidence(scope.scopeKey);
      if (!evidenceResult.ok)
        return blocked(
          {
            scopeKey: scope.scopeKey,
            code: 'material-scope-document-evidence-unavailable',
            detail: evidenceResult.blocker.detail,
          },
          catalog,
        );
      if (
        evidenceResult.evidence.techCardId !== cardSession.techCardId ||
        evidenceResult.evidence.scopeKey !== scope.scopeKey ||
        cardSession.importGeneration !== input.expectedImportGeneration
      )
        return blocked(
          {
            scopeKey: scope.scopeKey,
            code: 'material-scope-document-evidence-stale',
            detail: 'The saved DXF evidence belongs to a stale card or material scope.',
          },
          catalog,
        );
      const authorityResult = await deps.deriveAuthority(
        evidenceResult.evidence,
        selected.selection.selection.canonicalSha256,
        catalogResult.catalog.canonicalSha256,
      );
      if (!authorityResult.ok)
        return blocked(
          {
            scopeKey: scope.scopeKey,
            code: 'material-scope-document-authority-unavailable',
            detail: authorityResult.blockers[0].detail,
          },
          catalog,
        );
      const projectionResult = deps.project(catalogResult.catalog, selected.selection);
      if (!projectionResult.ok)
        return blocked(
          {
            scopeKey: scope.scopeKey,
            code: 'material-scope-projection-unavailable',
            detail: projectionResult.blockers[0]?.detail ?? 'The exact projection is unavailable.',
          },
          catalog,
        );
      prepared.push(
        Object.freeze({
          scopeKey: scope.scopeKey,
          sizeToken: input.sizeToken,
          sourceRevision: input.expectedImportGeneration,
          selection: selected.selection,
          catalog: catalogResult.catalog,
          projection: projectionResult.projection,
          documentEvidence: evidenceResult.evidence,
          documentAuthority: authorityResult.authority,
          compileSource,
        }),
      );
    } catch (error) {
      return blocked(
        {
          scopeKey: scope.scopeKey,
          code: 'material-scope-preparation-failed',
          detail:
            error instanceof Error
              ? `Material scope preparation failed: ${error.message}`
              : 'Material scope preparation failed.',
        },
        catalog,
      );
    }
  }
  return Object.freeze({
    ok: true as const,
    catalog,
    scopes: Object.freeze(prepared),
    crossScopeSeamingAvailable: false as const,
    crossScopeSeamingBlocker: crossScopeBlocker,
    blocker: null,
    claims: PATTERN_IMPORT_DXF_PHASE_E_CAD_MATERIAL_SCOPE_PREPARATION_CLAIMS_V1,
  });
}
