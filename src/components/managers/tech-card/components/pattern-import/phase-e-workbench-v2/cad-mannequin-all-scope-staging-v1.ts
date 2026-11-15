import type { CardDraft } from 'lib/pattern-import/types';

import type { PatternImportDxfPhaseECadMannequinDxfStagingSourceV1 } from './cad-mannequin-dxf-staging-v1';

export const PATTERN_IMPORT_DXF_PHASE_E_CAD_MANNEQUIN_ALL_SCOPE_STAGING_CLAIMS_V1 = Object.freeze({
  everyCurrentMaterialScopeRequested: true,
  exactPhaseDReplayOnly: true,
  currentPreparedProjectionReused: true,
  rawDxfParsed: false,
  createsGeometryOwner: false,
  createsAssemblyAuthority: false,
  tableLayoutStateRead: false,
  tableLayoutStateMutated: false,
  partialProjectionPresentedAsComplete: false,
  duplicateMaterialScopesRejected: true,
  importGenerationBound: true,
} as const);

export type PatternImportDxfPhaseECadMannequinMaterialScopeV1 = Readonly<{
  scopeKey: string;
  label: string;
}>;

export type PatternImportDxfPhaseECadMannequinAllScopeStagingResultV1 =
  | Readonly<{
      ok: true;
      sources: readonly PatternImportDxfPhaseECadMannequinDxfStagingSourceV1[];
      blocker: null;
    }>
  | Readonly<{
      ok: false;
      sources: readonly PatternImportDxfPhaseECadMannequinDxfStagingSourceV1[];
      blocker: Readonly<{ code: 'material-scope-projection-blocked'; detail: string }>;
    }>;

function blocked(
  source: PatternImportDxfPhaseECadMannequinDxfStagingSourceV1,
  scopeKey: string,
  detail: string,
): PatternImportDxfPhaseECadMannequinAllScopeStagingResultV1 {
  return Object.freeze({
    ok: false as const,
    sources: Object.freeze([source]),
    blocker: Object.freeze({
      code: 'material-scope-projection-blocked' as const,
      detail: `Material slot ${scopeKey} could not be staged from exact Phase-D replay: ${detail}`,
    }),
  });
}

function uniqueNonEmpty(values: readonly string[]): boolean {
  return values.every((value) => value.trim().length > 0) && new Set(values).size === values.length;
}

export function collectPatternImportDxfPhaseECadMannequinPreparedScopeStagingV1(
  input: Readonly<{
    techCardId: number;
    importGeneration: number;
    catalogScopes: readonly PatternImportDxfPhaseECadMannequinMaterialScopeV1[];
    preparedScopes: readonly Readonly<{
      scopeKey: string;
      sourceRevision: number;
      documentEvidence: Readonly<{ techCardId: number; scopeKey: string }>;
      projection: PatternImportDxfPhaseECadMannequinDxfStagingSourceV1['projection'];
    }>[];
    current: PatternImportDxfPhaseECadMannequinDxfStagingSourceV1;
  }>,
): PatternImportDxfPhaseECadMannequinAllScopeStagingResultV1 {
  const catalogKeys = input.catalogScopes.map(({ scopeKey }) => scopeKey);
  const preparedKeys = input.preparedScopes.map(({ scopeKey }) => scopeKey);
  if (
    !Number.isSafeInteger(input.techCardId) ||
    input.techCardId <= 0 ||
    !Number.isSafeInteger(input.importGeneration) ||
    input.importGeneration <= 0 ||
    !uniqueNonEmpty(catalogKeys) ||
    !uniqueNonEmpty(preparedKeys) ||
    catalogKeys.length !== preparedKeys.length ||
    catalogKeys.some((scopeKey) => !preparedKeys.includes(scopeKey)) ||
    !catalogKeys.includes(input.current.scopeKey)
  )
    return blocked(
      input.current,
      input.current.scopeKey || 'unknown',
      'material scope set is missing, duplicated or does not include the active scope',
    );

  const preparedByScope = new Map(input.preparedScopes.map((scope) => [scope.scopeKey, scope]));
  const sources: PatternImportDxfPhaseECadMannequinDxfStagingSourceV1[] = [];
  for (const catalogScope of input.catalogScopes) {
    const prepared = preparedByScope.get(catalogScope.scopeKey);
    const pieceKeys =
      prepared?.projection.pieces.map(
        ({ pieceId, pieceLineKey }) => `${pieceId}\u0000${pieceLineKey}`,
      ) ?? [];
    if (
      !prepared ||
      prepared.sourceRevision !== input.importGeneration ||
      prepared.documentEvidence.techCardId !== input.techCardId ||
      prepared.documentEvidence.scopeKey !== prepared.scopeKey ||
      !uniqueNonEmpty(pieceKeys)
    )
      return blocked(
        input.current,
        catalogScope.scopeKey,
        'prepared projection is stale, duplicated or bound to another card/scope',
      );
    sources.push(
      Object.freeze({
        scopeKey: prepared.scopeKey,
        label: catalogScope.label,
        projection: prepared.projection,
      }),
    );
  }
  return Object.freeze({ ok: true as const, sources: Object.freeze(sources), blocker: null });
}

/**
 * Derives mannequin-side silhouettes for every material slot from the card's existing Phase-D
 * replay carrier. This is a read-only projection: it never parses replacement DXF, authors a seam
 * or creates another geometry owner. Any missing scope fails closed to the already prepared source
 * instead of presenting a partial multi-scope set as complete.
 */
export async function preparePatternImportDxfPhaseECadMannequinAllScopeStagingV1(
  input: Readonly<{
    draft: CardDraft;
    techCardId: number;
    expectedImportGeneration: number;
    currentImportGeneration: number;
    scopes: readonly PatternImportDxfPhaseECadMannequinMaterialScopeV1[];
    sizeToken: string;
    current: PatternImportDxfPhaseECadMannequinDxfStagingSourceV1;
  }>,
): Promise<PatternImportDxfPhaseECadMannequinAllScopeStagingResultV1> {
  const scopeKeys = input.scopes.map(({ scopeKey }) => scopeKey);
  const distinctScopes = input.scopes;
  if (
    !input.draft ||
    input.draft.techCardId !== input.techCardId ||
    !Number.isSafeInteger(input.expectedImportGeneration) ||
    input.expectedImportGeneration <= 0 ||
    input.currentImportGeneration !== input.expectedImportGeneration ||
    !input.sizeToken.trim() ||
    !input.current.scopeKey.trim() ||
    !uniqueNonEmpty(scopeKeys) ||
    !distinctScopes.some(({ scopeKey }) => scopeKey === input.current.scopeKey)
  )
    return blocked(input.current, input.current.scopeKey || 'unknown', 'invalid staging request');

  if (distinctScopes.length === 1)
    return Object.freeze({
      ok: true as const,
      sources: Object.freeze([input.current]),
      blocker: null,
    });

  try {
    const [selectionModule, catalogModule, projectionModule] = await Promise.all([
      import('lib/cloth/domain/pattern-import-dxf-product-draft-phase-d-selection-v1'),
      import('lib/cloth/domain/pattern-import-dxf-product-phase-e-authoring-catalog-v1'),
      import('lib/pattern-import/dxf-product-phase-e-assembly-workbench-v1'),
    ]);
    const sources: PatternImportDxfPhaseECadMannequinDxfStagingSourceV1[] = [];
    for (const scope of distinctScopes) {
      if (scope.scopeKey === input.current.scopeKey) {
        sources.push(input.current);
        continue;
      }
      const [selected, catalog] = await Promise.all([
        selectionModule.selectPatternImportDxfProductDraftPhaseDSizeV1(
          input.draft,
          scope.scopeKey,
          input.sizeToken,
        ),
        catalogModule.buildPatternImportDxfProductPhaseEAuthoringCatalogV1(
          input.draft,
          scope.scopeKey,
          input.sizeToken,
        ),
      ]);
      if (input.currentImportGeneration !== input.expectedImportGeneration)
        return blocked(input.current, scope.scopeKey, 'import generation changed during staging');
      if (!selected.ok)
        return blocked(
          input.current,
          scope.scopeKey,
          `${selected.blockers[0].code}: ${selected.blockers[0].detail}`,
        );
      if (!catalog.ok)
        return blocked(
          input.current,
          scope.scopeKey,
          `${catalog.blockers[0].code}: ${catalog.blockers[0].detail}`,
        );
      const projection = projectionModule.projectPatternImportDxfProductPhaseEAssemblyV1(
        catalog.catalog,
        selected.selection,
      );
      if (!projection.ok)
        return blocked(
          input.current,
          scope.scopeKey,
          `${projection.blockers[0].code}: ${projection.blockers[0].detail}`,
        );
      sources.push(
        Object.freeze({
          scopeKey: scope.scopeKey,
          label: scope.label,
          projection: projection.projection,
        }),
      );
    }
    return Object.freeze({ ok: true as const, sources: Object.freeze(sources), blocker: null });
  } catch (error) {
    return blocked(
      input.current,
      input.current.scopeKey,
      error instanceof Error ? error.message : 'unexpected projection failure',
    );
  }
}
