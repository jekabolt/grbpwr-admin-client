import {
  PATTERN_IMPORT_DXF_PRODUCT_PHASE_E_EXACT_TOPOLOGY_BINDING_V1,
  type PatternImportDxfProductPhaseEExactTopologySideBindingV1,
} from 'lib/cloth/domain/pattern-import-dxf-product-phase-e-exact-topology-binding-v1';
import type { DxfProductSavedRowIdentityV1 } from 'lib/pattern-import/dxf-product-saved-reprocess-owner-v1';
import type { ReactNode } from 'react';

import type { TopstitchBomLine } from '../../topstitch-lines';
import type { PatternImportDxfPhaseECadMannequinDxfStagingSelectionV1 } from './cad-mannequin-dxf-staging-v1';
import type { PatternImportDxfPhaseECadMannequinDxfStagingSourceV1 } from './cad-mannequin-dxf-staging-v1';
import {
  buildPatternImportDxfPhaseECadMannequinSceneOverlayFromExactAuthorityV2,
  type PatternImportDxfPhaseECadMannequinSceneExactAuthorityV2,
} from './cad-mannequin-scene-overlay-adapter-v1';
import { bridgePatternImportDxfPhaseECadMannequinSceneOverlayToRendererV1 } from './cad-mannequin-scene-overlay-renderer-bridge-v1';
import type { PatternImportDxfPhaseECadMannequinSceneOverlayCapabilityV1 } from './cad-workbench-mannequin-model-picker-v1';
import type { PatternImportDxfPhaseEGoldenCardFullExactConnectionV1 } from './golden-card-full-exact-capture-aggregator-v1';
import {
  PATTERN_IMPORT_DXF_PHASE_E_SAVED_ROW_PREPARED_V1,
  type PatternImportDxfPhaseESavedRowPreparedV1,
} from './saved-row-preparation-owner-v1';
import type { PatternImportDxfPhaseEStitchVisualV1 } from './stitch-visual-v1';

export const PATTERN_IMPORT_DXF_PHASE_E_CAD_MANNEQUIN_SAVED_TWO_SEAM_SCENE_OVERLAY_V1 =
  'pattern-import-dxf-phase-e-cad-mannequin-saved-two-seam-scene-overlay/1' as const;

export const PATTERN_IMPORT_DXF_PHASE_E_CAD_MANNEQUIN_SAVED_TWO_SEAM_SCENE_OVERLAY_CLAIMS_V1 =
  Object.freeze({
    verifiedSavedExactCarrierOnly: true,
    fullExactCaptureGraphSynthesized: false,
    savedRowEightFieldsRechecked: true,
    selectedOperationBindingRechecked: true,
    serverAssemblyRevisionRechecked: true,
    serverTopologySha256Rechecked: true,
    catalogCanonicalSha256Rechecked: true,
    exactTwoSeamFourSideCoverageRequired: true,
    preparedProjectionIdentityRechecked: true,
    savedPreparationGenerationUsedAsRendererFreshnessOnly: true,
    freshImportGenerationAuthorityClaimed: false,
    operationOwnerCreated: false,
    geometryOwnerCreated: false,
    clothOwnerCreated: false,
    pinAuthorityAvailable: false,
  } as const);

export type PatternImportDxfPhaseECadMannequinSavedTwoSeamSceneOverlayBlockerV1 = Readonly<{
  code:
    | 'prepared-context-invalid'
    | 'saved-row-binding-mismatch'
    | 'selected-operation-binding-mismatch'
    | 'assembly-revision-binding-mismatch'
    | 'topology-hash-binding-mismatch'
    | 'catalog-hash-binding-mismatch'
    | 'exact-side-coverage-invalid'
    | 'staging-binding-mismatch'
    | 'scene-overlay-invalid'
    | 'renderer-bridge-invalid';
  detail: string;
}>;

export type PatternImportDxfPhaseECadMannequinSavedTwoSeamSceneOverlayResultV1 =
  | Readonly<{
      ok: true;
      capability: Extract<
        PatternImportDxfPhaseECadMannequinSceneOverlayCapabilityV1,
        { status: 'available' }
      >;
      blocker: null;
      claims: typeof PATTERN_IMPORT_DXF_PHASE_E_CAD_MANNEQUIN_SAVED_TWO_SEAM_SCENE_OVERLAY_CLAIMS_V1;
    }>
  | Readonly<{
      ok: false;
      capability: Extract<
        PatternImportDxfPhaseECadMannequinSceneOverlayCapabilityV1,
        { status: 'blocked' }
      >;
      blocker: PatternImportDxfPhaseECadMannequinSavedTwoSeamSceneOverlayBlockerV1;
      claims: typeof PATTERN_IMPORT_DXF_PHASE_E_CAD_MANNEQUIN_SAVED_TWO_SEAM_SCENE_OVERLAY_CLAIMS_V1;
    }>;

export type PatternImportDxfPhaseECadMannequinSavedTwoSeamSceneOverlayRequestV1 = Readonly<{
  prepared: PatternImportDxfPhaseESavedRowPreparedV1;
  sources: readonly PatternImportDxfPhaseECadMannequinDxfStagingSourceV1[];
  selection?: PatternImportDxfPhaseECadMannequinDxfStagingSelectionV1 | null;
  stitchVisual?: PatternImportDxfPhaseEStitchVisualV1 | null;
  bomItems: readonly TopstitchBomLine[];
}>;

export type PatternImportDxfPhaseECadMannequinSavedTwoSeamProductionMountPropsV1 = Readonly<{
  request: PatternImportDxfPhaseECadMannequinSavedTwoSeamSceneOverlayRequestV1 | null;
  fallback: PatternImportDxfPhaseECadMannequinSceneOverlayCapabilityV1;
  children: (capability: PatternImportDxfPhaseECadMannequinSceneOverlayCapabilityV1) => ReactNode;
}>;

const SHA256 = /^[0-9a-f]{64}$/;

function blocked(
  code: PatternImportDxfPhaseECadMannequinSavedTwoSeamSceneOverlayBlockerV1['code'],
  detail: string,
): PatternImportDxfPhaseECadMannequinSavedTwoSeamSceneOverlayResultV1 {
  const blocker = Object.freeze({ code, detail });
  return Object.freeze({
    ok: false as const,
    capability: Object.freeze({
      status: 'blocked' as const,
      bridge: null,
      blocker: Object.freeze({
        code: 'authoritative-saved-exact-binding-invalid' as const,
        detail,
      }),
    }),
    blocker,
    claims: PATTERN_IMPORT_DXF_PHASE_E_CAD_MANNEQUIN_SAVED_TWO_SEAM_SCENE_OVERLAY_CLAIMS_V1,
  });
}

function sameRow(left: DxfProductSavedRowIdentityV1, right: DxfProductSavedRowIdentityV1) {
  return (
    left.techCardId === right.techCardId &&
    left.scopeKey === right.scopeKey &&
    left.patternLineKey === right.patternLineKey &&
    left.revision === right.revision &&
    left.cardLockVersion === right.cardLockVersion &&
    left.url === right.url &&
    left.sizeBytes === right.sizeBytes &&
    left.sha256 === right.sha256
  );
}

function exactConnection(
  prepared: PatternImportDxfPhaseESavedRowPreparedV1,
  seamId: string,
  sides: readonly PatternImportDxfProductPhaseEExactTopologySideBindingV1[],
): PatternImportDxfPhaseEGoldenCardFullExactConnectionV1 | null {
  if (
    sides.length !== 2 ||
    sides[0]?.sideIndex !== 0 ||
    sides[1]?.sideIndex !== 1 ||
    sides.some((side) => side.seamId !== seamId)
  )
    return null;
  const bindings = prepared.exactTopology.carrier.bindings;
  const orderedSides = Object.freeze([sides[0]!, sides[1]!]) as readonly [
    PatternImportDxfProductPhaseEExactTopologySideBindingV1,
    PatternImportDxfProductPhaseEExactTopologySideBindingV1,
  ];
  return Object.freeze({
    connectionRef: seamId,
    operationNumber: bindings.selectedOperation.sourceOperationNumber,
    authoringOperationId: bindings.selectedOperation.authoringOperationId,
    row: bindings.row,
    serverTopologySha256: bindings.assemblyTopologySha256,
    catalogCanonicalSha256: bindings.catalogCanonicalSha256,
    sides: orderedSides,
  });
}

/**
 * Adapts the already verified Composite V3 two-seam carrier into renderer primitives. It does not
 * create a card-wide graph: one selected saved operation and its four sealed sides are the entire
 * accepted authority boundary.
 */
export function buildPatternImportDxfPhaseECadMannequinSavedTwoSeamSceneOverlayV1(
  request: PatternImportDxfPhaseECadMannequinSavedTwoSeamSceneOverlayRequestV1,
): PatternImportDxfPhaseECadMannequinSavedTwoSeamSceneOverlayResultV1 {
  const prepared = request?.prepared;
  const carrier = prepared?.exactTopology?.carrier;
  if (
    !prepared ||
    prepared.schemaVersion !== PATTERN_IMPORT_DXF_PHASE_E_SAVED_ROW_PREPARED_V1 ||
    prepared.origin !== 'verified-saved-row' ||
    !Number.isSafeInteger(prepared.preparationGeneration) ||
    prepared.preparationGeneration < 1 ||
    carrier?.schemaVersion !== PATTERN_IMPORT_DXF_PRODUCT_PHASE_E_EXACT_TOPOLOGY_BINDING_V1
  )
    return blocked(
      'prepared-context-invalid',
      'A verified saved-row preparation with one exact Composite V3 carrier is required.',
    );

  const bindings = carrier.bindings;
  if (
    !sameRow(prepared.row, bindings.row) ||
    !sameRow(prepared.documentAuthority.row, bindings.row)
  )
    return blocked(
      'saved-row-binding-mismatch',
      'The exact carrier, saved preparation and document authority disagree on saved-row identity.',
    );
  if (
    prepared.selectedOperationNumber !== bindings.selectedOperation.sourceOperationNumber ||
    prepared.proposal.operation.sourceOperationNumber !==
      bindings.selectedOperation.sourceOperationNumber ||
    prepared.proposal.operation.authoringOperationId !==
      bindings.selectedOperation.authoringOperationId ||
    prepared.proposal.operation.seamIds.length !== 2 ||
    bindings.selectedOperation.seamIds.length !== 2 ||
    prepared.proposal.operation.seamIds.some(
      (seamId, index) => seamId !== bindings.selectedOperation.seamIds[index],
    )
  )
    return blocked(
      'selected-operation-binding-mismatch',
      'The selected operation or its ordered two-seam identity differs from the sealed carrier.',
    );
  if (
    prepared.serverAssemblyRevision !== bindings.serverAssemblyRevision ||
    prepared.documentAuthority.serverAssemblyRevision !== bindings.serverAssemblyRevision
  )
    return blocked(
      'assembly-revision-binding-mismatch',
      'The saved preparation no longer matches the sealed server Assembly revision.',
    );
  if (
    !SHA256.test(bindings.assemblyTopologySha256) ||
    prepared.assemblyTopologySha256 !== bindings.assemblyTopologySha256 ||
    prepared.documentAuthority.assemblyTopologySha256 !== bindings.assemblyTopologySha256
  )
    return blocked(
      'topology-hash-binding-mismatch',
      'The saved preparation no longer matches the sealed Assembly topology hash.',
    );
  if (
    !SHA256.test(bindings.catalogCanonicalSha256) ||
    prepared.catalog.canonicalSha256 !== bindings.catalogCanonicalSha256 ||
    prepared.documentAuthority.catalogCanonicalSha256 !== bindings.catalogCanonicalSha256 ||
    prepared.projection.expectedCatalogCanonicalSha256 !== bindings.catalogCanonicalSha256
  )
    return blocked(
      'catalog-hash-binding-mismatch',
      'The prepared projection and exact carrier disagree on catalog identity.',
    );

  const seamIds = bindings.selectedOperation.seamIds;
  const connections: PatternImportDxfPhaseEGoldenCardFullExactConnectionV1[] = [];
  for (const seamId of seamIds) {
    const connection = exactConnection(
      prepared,
      seamId,
      carrier.sides.filter((side) => side.seamId === seamId),
    );
    if (!connection)
      return blocked(
        'exact-side-coverage-invalid',
        `Sealed seam ${seamId} does not have one ordered A/B side pair.`,
      );
    connections.push(connection);
  }
  if (carrier.sides.length !== 4 || new Set(carrier.sides.map(({ seamId }) => seamId)).size !== 2)
    return blocked(
      'exact-side-coverage-invalid',
      'The sealed two-seam carrier must contain exactly four sides and no unrelated seam.',
    );

  const boundSources = request.sources.filter(
    ({ scopeKey, projection }) =>
      scopeKey === prepared.scopeKey &&
      projection.sourceFileId === prepared.projection.sourceFileId &&
      projection.sizeToken === prepared.sizeToken &&
      projection.expectedCatalogCanonicalSha256 === bindings.catalogCanonicalSha256 &&
      projection.sizeSelectionCanonicalSha256 === prepared.projection.sizeSelectionCanonicalSha256,
  );
  if (boundSources.length !== 1)
    return blocked(
      'staging-binding-mismatch',
      'Exactly one staged scope must match the verified saved projection identity.',
    );

  const cardRef = `tech-card:${prepared.row.techCardId}`;
  const authority: PatternImportDxfPhaseECadMannequinSceneExactAuthorityV2 = Object.freeze({
    techCardId: prepared.row.techCardId,
    cardRef,
    cardLockVersion: prepared.row.cardLockVersion,
    serverAssemblyRevision: prepared.serverAssemblyRevision,
    operations: Object.freeze([
      Object.freeze({
        operationNumber: prepared.selectedOperationNumber,
        seamKeys: Object.freeze([...seamIds]),
        exactConnections: Object.freeze(connections),
      }),
    ]),
    connections: Object.freeze(connections),
  });
  const overlay = buildPatternImportDxfPhaseECadMannequinSceneOverlayFromExactAuthorityV2({
    current: {
      techCardId: prepared.row.techCardId,
      cardRef,
      cardLockVersion: prepared.row.cardLockVersion,
      serverAssemblyRevision: prepared.serverAssemblyRevision,
      importGeneration: prepared.preparationGeneration,
    },
    staging: {
      techCardId: prepared.row.techCardId,
      importGeneration: prepared.preparationGeneration,
      sources: request.sources,
    },
    authority,
    activeOperationNumber: prepared.selectedOperationNumber,
    selection: request.selection,
    stitchVisuals: request.stitchVisual
      ? Object.freeze([
          Object.freeze({
            operationNumber: prepared.selectedOperationNumber,
            visual: request.stitchVisual,
          }),
        ])
      : Object.freeze([]),
    bomItems: request.bomItems,
  });
  if (!overlay.ok) return blocked('scene-overlay-invalid', overlay.blocker.detail);
  const bridged = bridgePatternImportDxfPhaseECadMannequinSceneOverlayToRendererV1(overlay.overlay);
  if (!bridged.ok) return blocked('renderer-bridge-invalid', bridged.blocker.detail);
  return Object.freeze({
    ok: true as const,
    capability: Object.freeze({
      status: 'available' as const,
      bridge: bridged.bridge,
      blocker: null,
    }),
    blocker: null,
    claims: PATTERN_IMPORT_DXF_PHASE_E_CAD_MANNEQUIN_SAVED_TWO_SEAM_SCENE_OVERLAY_CLAIMS_V1,
  });
}

/** Production render boundary used by the saved exact-two mannequin branch. */
export function PatternImportDxfPhaseECadMannequinSavedTwoSeamProductionMountV1({
  request,
  fallback,
  children,
}: PatternImportDxfPhaseECadMannequinSavedTwoSeamProductionMountPropsV1): ReactNode {
  return children(
    request
      ? buildPatternImportDxfPhaseECadMannequinSavedTwoSeamSceneOverlayV1(request).capability
      : fallback,
  );
}
