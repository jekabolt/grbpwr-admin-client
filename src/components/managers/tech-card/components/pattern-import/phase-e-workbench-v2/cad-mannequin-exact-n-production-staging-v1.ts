import type { PatternImportDxfProductPhaseEAuthoringCatalogV1 } from 'lib/cloth/domain/pattern-import-dxf-product-phase-e-authoring-catalog-v1';

import type { PatternImportDxfPhaseECardSessionV1 } from '../phase-e-workbench-card-session-v1';
import {
  preparePatternImportDxfPhaseECadMannequinAllScopeStagingV1,
  type PatternImportDxfPhaseECadMannequinAllScopeStagingResultV1,
} from './cad-mannequin-all-scope-staging-v1';
import type { PatternImportDxfPhaseECadMannequinDxfStagingSourceV1 } from './cad-mannequin-dxf-staging-v1';
import {
  listPatternImportDxfPhaseECadTableZeroOperationFreshChoicesV1,
  preparePatternImportDxfPhaseECadTableZeroOperationFreshV1,
  type PatternImportDxfPhaseECadTableZeroOperationFreshChoicesResultV1,
  type PatternImportDxfPhaseECadTableZeroOperationFreshPreparationResultV1,
} from './cad-table-zero-operation-fresh-preparation-v1';
import type { PatternImportDxfPhaseEExactNAssemblyOrderSessionV2 } from './exact-n-seam-production-mount-v2';
import type { PatternImportDxfPhaseEGoldenCardCatalogV1 } from './golden-card-reconstruction-v1';

export const PATTERN_IMPORT_DXF_PHASE_E_CAD_MANNEQUIN_EXACT_N_PRODUCTION_STAGING_V1 =
  'pattern-import-dxf-phase-e-cad-mannequin-exact-n-production-staging/1' as const;

export const PATTERN_IMPORT_DXF_PHASE_E_CAD_MANNEQUIN_EXACT_N_PRODUCTION_STAGING_CLAIMS_V1 =
  Object.freeze({
    existingCardSessionOwnerReused: true,
    existingFreshScopeSizePreparationReused: true,
    existingAllScopeStagingOwnerReused: true,
    restoredScopeIdentityRequired: true,
    catalogAndSizeHashesExactMatched: true,
    catalogTopologyExactMatched: true,
    sourceFileIdentityExactMatched: true,
    oneExactSizeCandidateRequired: true,
    snapshotCoordinatesUsed: false,
    geometrySynthesized: false,
    partialScopeSetAccepted: false,
  } as const);

export type PatternImportDxfPhaseECadMannequinExactNProductionStagingBlockerV1 = Readonly<{
  code:
    | 'card-session-unavailable'
    | 'card-session-stale'
    | 'production-feed-unavailable'
    | 'active-material-scope-unavailable'
    | 'exact-size-binding-unavailable'
    | 'exact-size-binding-ambiguous'
    | 'all-scope-staging-unavailable'
    | 'staging-binding-stale';
  detail: string;
}>;

export type PatternImportDxfPhaseECadMannequinExactNProductionStagingResultV1 =
  | Readonly<{
      ok: true;
      status: 'available';
      staging: Readonly<{
        techCardId: number;
        importGeneration: number;
        activeScopeKey: string;
        sizeToken: string;
        sources: readonly PatternImportDxfPhaseECadMannequinDxfStagingSourceV1[];
      }>;
      blocker: null;
      claims: typeof PATTERN_IMPORT_DXF_PHASE_E_CAD_MANNEQUIN_EXACT_N_PRODUCTION_STAGING_CLAIMS_V1;
    }>
  | Readonly<{
      ok: false;
      status: 'blocked';
      staging: null;
      blocker: PatternImportDxfPhaseECadMannequinExactNProductionStagingBlockerV1;
      claims: typeof PATTERN_IMPORT_DXF_PHASE_E_CAD_MANNEQUIN_EXACT_N_PRODUCTION_STAGING_CLAIMS_V1;
    }>;

export type PatternImportDxfPhaseECadMannequinExactNProductionStagingDependenciesV1 = Readonly<{
  listChoices: typeof listPatternImportDxfPhaseECadTableZeroOperationFreshChoicesV1;
  prepareActive: typeof preparePatternImportDxfPhaseECadTableZeroOperationFreshV1;
  prepareAllScopes: typeof preparePatternImportDxfPhaseECadMannequinAllScopeStagingV1;
}>;

const DEFAULT_DEPENDENCIES = Object.freeze({
  listChoices: listPatternImportDxfPhaseECadTableZeroOperationFreshChoicesV1,
  prepareActive: preparePatternImportDxfPhaseECadTableZeroOperationFreshV1,
  prepareAllScopes: preparePatternImportDxfPhaseECadMannequinAllScopeStagingV1,
}) satisfies PatternImportDxfPhaseECadMannequinExactNProductionStagingDependenciesV1;

function blocked(
  code: PatternImportDxfPhaseECadMannequinExactNProductionStagingBlockerV1['code'],
  detail: string,
): PatternImportDxfPhaseECadMannequinExactNProductionStagingResultV1 {
  return Object.freeze({
    ok: false as const,
    status: 'blocked' as const,
    staging: null,
    blocker: Object.freeze({ code, detail: detail.slice(0, 2_048) }),
    claims: PATTERN_IMPORT_DXF_PHASE_E_CAD_MANNEQUIN_EXACT_N_PRODUCTION_STAGING_CLAIMS_V1,
  });
}

function sameCatalogTopology(
  prepared: PatternImportDxfProductPhaseEAuthoringCatalogV1,
  snapshot: PatternImportDxfPhaseEGoldenCardCatalogV1,
): boolean {
  if (prepared.pieces.length !== snapshot.pieces.length) return false;
  return prepared.pieces.every((piece, pieceIndex) => {
    const expected = snapshot.pieces[pieceIndex];
    return (
      expected?.pieceId === piece.pieceId &&
      expected.pieceLineKey === piece.pieceLineKey &&
      expected.contours.length === piece.contours.length &&
      piece.contours.every((contour, contourIndex) => {
        const expectedContour = expected.contours[contourIndex];
        return (
          expectedContour?.contourId === contour.contourId &&
          expectedContour.role === contour.role &&
          expectedContour.geometry.kind === contour.geometry.kind &&
          (expectedContour.geometry.kind !== 'cut-loop' ||
            contour.geometry.kind !== 'cut-loop' ||
            expectedContour.geometry.index === contour.geometry.index) &&
          expectedContour.closed === contour.closed &&
          expectedContour.boundaryVertices.length === contour.boundaryVertices.length &&
          contour.boundaryVertices.every((vertex, vertexIndex) => {
            const expectedVertex = expectedContour.boundaryVertices[vertexIndex];
            return (
              expectedVertex?.ordinal === vertex.ordinal &&
              expectedVertex.vertexId === vertex.vertexId &&
              expectedVertex.normalizedArc === vertex.normalizedArc
            );
          })
        );
      })
    );
  });
}

function activePreparationMatches(
  result: Extract<
    PatternImportDxfPhaseECadTableZeroOperationFreshPreparationResultV1,
    { ok: true }
  >,
  session: PatternImportDxfPhaseEExactNAssemblyOrderSessionV2,
  snapshotCatalog: PatternImportDxfPhaseEGoldenCardCatalogV1,
): boolean {
  return (
    result.scopeKey === session.current.row.scopeKey &&
    result.catalog.canonicalSha256 === session.current.catalogCanonicalSha256 &&
    result.catalog.canonicalSha256 === snapshotCatalog.canonicalSha256 &&
    result.catalog.sizeSelectionCanonicalSha256 === snapshotCatalog.sizeSelectionCanonicalSha256 &&
    result.catalog.sourceFileId === snapshotCatalog.sourceFileId &&
    sameCatalogTopology(result.catalog, snapshotCatalog)
  );
}

/**
 * Reopens the current card's existing raw-free Phase-D preparation owner and finds the one scope /
 * size whose catalog exactly matches the verified Exact-N production snapshot. Snapshot topology
 * is only a binding check; all renderable millimetre coordinates come from the existing projection.
 */
export async function preparePatternImportDxfPhaseECadMannequinExactNProductionStagingV1(
  input: Readonly<{
    session: PatternImportDxfPhaseEExactNAssemblyOrderSessionV2;
    cardSession: PatternImportDxfPhaseECardSessionV1 | null;
  }>,
  dependencies: PatternImportDxfPhaseECadMannequinExactNProductionStagingDependenciesV1 = DEFAULT_DEPENDENCIES,
): Promise<PatternImportDxfPhaseECadMannequinExactNProductionStagingResultV1> {
  const { cardSession, session } = input;
  if (!cardSession)
    return blocked(
      'card-session-unavailable',
      'The current Exact-N operation has no fresh card-session coordinate owner.',
    );
  if (
    cardSession.techCardId !== session.current.row.techCardId ||
    cardSession.draft.techCardId !== session.current.row.techCardId ||
    !Number.isSafeInteger(cardSession.importGeneration) ||
    cardSession.importGeneration < 1
  )
    return blocked(
      'card-session-stale',
      'The fresh card session belongs to another card or invalid import generation.',
    );
  const feed = session.productionFeed;
  const operationNumber = session.current.selectedOperation.sourceOperationNumber;
  const projections =
    feed?.exactOperationProjections.filter(
      ({ operationNumber: candidate }) => candidate === operationNumber,
    ) ?? [];
  if (
    !feed ||
    feed.techCardId !== cardSession.techCardId ||
    projections.length !== 1 ||
    projections[0].snapshot.cardRef !== feed.cardRef
  )
    return blocked(
      'production-feed-unavailable',
      'The current operation has no unique card-bound Exact-N production snapshot.',
    );
  const snapshotCatalog = projections[0].snapshot.catalog;
  const choices: PatternImportDxfPhaseECadTableZeroOperationFreshChoicesResultV1 =
    dependencies.listChoices(cardSession, cardSession.importGeneration);
  if (!choices.ok)
    return blocked(
      'active-material-scope-unavailable',
      `${choices.blocker.code}: ${choices.blocker.detail}`,
    );
  const activeScopes = choices.choices.filter(
    ({ scopeKey }) => scopeKey === session.current.row.scopeKey,
  );
  if (activeScopes.length !== 1)
    return blocked(
      'active-material-scope-unavailable',
      'The restored saved-DXF material scope does not resolve uniquely in the current card session.',
    );

  const matches: Extract<
    PatternImportDxfPhaseECadTableZeroOperationFreshPreparationResultV1,
    { ok: true }
  >[] = [];
  for (const size of activeScopes[0].sizes) {
    const prepared = await dependencies.prepareActive({
      cardSession,
      expectedImportGeneration: cardSession.importGeneration,
      scopeKey: activeScopes[0].scopeKey,
      sizeToken: size.sizeToken,
    });
    if (prepared.ok && activePreparationMatches(prepared, session, snapshotCatalog))
      matches.push(prepared);
  }
  if (matches.length === 0)
    return blocked(
      'exact-size-binding-unavailable',
      'No current Phase-D scope/size projection exactly matches the restored catalog, size and source bindings.',
    );
  if (matches.length !== 1)
    return blocked(
      'exact-size-binding-ambiguous',
      'More than one current Phase-D size resolves to the restored catalog binding.',
    );
  const active = matches[0];
  const current = Object.freeze({
    scopeKey: active.scopeKey,
    label: activeScopes[0].label,
    projection: active.projection,
  });
  const allScopes: PatternImportDxfPhaseECadMannequinAllScopeStagingResultV1 =
    await dependencies.prepareAllScopes({
      draft: cardSession.draft,
      techCardId: cardSession.techCardId,
      expectedImportGeneration: cardSession.importGeneration,
      currentImportGeneration: cardSession.importGeneration,
      scopes: choices.choices.map(({ scopeKey, label }) => ({ scopeKey, label })),
      sizeToken: active.sizeToken,
      current,
    });
  if (!allScopes.ok)
    return blocked(
      'all-scope-staging-unavailable',
      `${allScopes.blocker.code}: ${allScopes.blocker.detail}`,
    );
  const activeSources = allScopes.sources.filter(
    ({ scopeKey }) => scopeKey === session.current.row.scopeKey,
  );
  if (
    activeSources.length !== 1 ||
    activeSources[0].projection.expectedCatalogCanonicalSha256 !==
      session.current.catalogCanonicalSha256 ||
    activeSources[0].projection.sizeSelectionCanonicalSha256 !==
      snapshotCatalog.sizeSelectionCanonicalSha256 ||
    activeSources[0].projection.sourceFileId !== snapshotCatalog.sourceFileId
  )
    return blocked(
      'staging-binding-stale',
      'The prepared all-scope set no longer contains the exact restored scope/catalog/source binding.',
    );
  return Object.freeze({
    ok: true as const,
    status: 'available' as const,
    staging: Object.freeze({
      techCardId: cardSession.techCardId,
      importGeneration: cardSession.importGeneration,
      activeScopeKey: session.current.row.scopeKey,
      sizeToken: active.sizeToken,
      sources: allScopes.sources,
    }),
    blocker: null,
    claims: PATTERN_IMPORT_DXF_PHASE_E_CAD_MANNEQUIN_EXACT_N_PRODUCTION_STAGING_CLAIMS_V1,
  });
}
