import type { ReactNode } from 'react';
import type { PatternImportDxfProductPhaseEAuthoringCatalogV1 } from 'lib/cloth/domain/pattern-import-dxf-product-phase-e-authoring-catalog-v1';
import type { PatternImportDxfProductPhaseEAssemblyProjectionV1 } from 'lib/pattern-import/dxf-product-phase-e-assembly-workbench-v1';
import type { CadTablePieceFeaturesByKey } from './cad-table-piece-features-v1';
import {
  activatePatternImportDxfPhaseECadTableZeroCanvasPieceV1,
  PatternImportDxfPhaseECadTableZeroConnectCanvasV1,
  useCadTableZeroCanvasOwner,
} from './cad-table-zero-connect-canvas-v1';
import {
  CadTablePieceSelectionPanel,
  handleCadTablePieceSelectionKey,
} from './cad-table-piece-selection-panel-v1';

import {
  PatternImportDxfPhaseECadWorkbenchSplitShellV1,
  type PatternImportDxfPhaseECadWorkbenchSlotContextV1,
  type PatternImportDxfPhaseECadWorkbenchSlotV1,
} from './cad-workbench-split-shell-v1';
import {
  buildPatternImportDxfPhaseECadMannequinProductionSceneOverlayV2,
  type PatternImportDxfPhaseECadMannequinProductionSceneOverlayRequestV2,
} from './cad-mannequin-production-scene-overlay-adapter-v2';
import { bridgePatternImportDxfPhaseECadMannequinSceneOverlayToRendererV1 } from './cad-mannequin-scene-overlay-renderer-bridge-v1';
import type { PatternImportDxfPhaseECadMannequinSceneOverlayCapabilityV1 } from './cad-workbench-mannequin-model-picker-v1';
import { cadWorkbenchOperationSeamOrdinal } from './cad-workbench-seam-ordinal-v1';
import type { PatternImportDxfProductExactNSeamUiSelectionOwnerV2 } from './exact-n-seam-atomic-ui-selection-v2';
import type { PatternImportDxfPhaseEGoldenCardProductionV2SnapshotFeedV1 } from './golden-card-production-v2-snapshot-feed-v1';
import {
  PatternImportDxfProductExactNSeamWorkbenchHostV2,
  resolvePatternImportDxfProductExactNSeamWorkbenchHostV2,
  type PatternImportDxfProductExactNSeamWorkbenchCurrentBindingsV2,
  type PatternImportDxfProductExactNSeamWorkbenchHostResultV2,
} from './exact-n-seam-workbench-host-v2';

export const PATTERN_IMPORT_DXF_PRODUCT_EXACT_N_SEAM_PRODUCTION_MOUNT_V2 =
  'pattern-import-dxf-product-exact-n-seam-production-mount/2' as const;

export const PATTERN_IMPORT_DXF_PRODUCT_EXACT_N_SEAM_PRODUCTION_MOUNT_CLAIMS_V2 = Object.freeze({
  compositeV4AtomicSelectionOwnerRequired: true,
  freshCurrentBindingsReverifiedByHost: true,
  exactOneOrGreaterThanTwoOnly: true,
  exactTwoRemainsOnV3V1: true,
  existingSplitShellReused: true,
  existingMannequinSlotReused: true,
  existingAssemblyOrderWindowReused: true,
  exactProductionSceneOverlayAdapterReused: true,
  exactSceneOverlayRendererBridgeReused: true,
  missingSceneInputsFailClosed: true,
  activeSeamPointerCallerOwned: true,
  readOnlyHost: true,
  exactNEditOrApplyControlsRendered: false,
  topologyAnnotationAuthoringSlotAvailable: true,
  topologyAnnotationPersistenceCallerOwned: true,
  createsSecondWriter: false,
  fixtureAuthorityAccepted: false,
  persistencePerformed: false,
  networkPerformed: false,
  fakeFallbackRendered: false,
} as const);

/**
 * The production route can only obtain this session from the existing
 * Composite V4 transaction -> restore -> projection -> atomic-selection chain. The owner is
 * opaque and the mount rechecks the fresh card/Assembly/catalog/plan tuple before rendering.
 */
export type PatternImportDxfPhaseEExactNAssemblyOrderSessionV2 = Readonly<{
  selectionOwner: PatternImportDxfProductExactNSeamUiSelectionOwnerV2;
  current: PatternImportDxfProductExactNSeamWorkbenchCurrentBindingsV2;
  /** Sanitized caller-owned reconstruction evidence; never derived from rendered UI state. */
  productionFeed?: PatternImportDxfPhaseEGoldenCardProductionV2SnapshotFeedV1;
}>;

export type PatternImportDxfProductExactNSeamProductionSceneOverlayInputV2 = Pick<
  PatternImportDxfPhaseECadMannequinProductionSceneOverlayRequestV2,
  'staging' | 'stitchVisuals' | 'bomItems'
>;

export type PatternImportDxfProductExactNSeamProductionMannequinContextV2 =
  PatternImportDxfPhaseECadWorkbenchSlotContextV1 &
    Readonly<{ sceneOverlay: PatternImportDxfPhaseECadMannequinSceneOverlayCapabilityV1 }>;

export type PatternImportDxfProductExactNSeamProductionMannequinSlotV2 =
  | ReactNode
  | ((context: PatternImportDxfProductExactNSeamProductionMannequinContextV2) => ReactNode);

export type PatternImportDxfProductExactNDesktopGeometryV2 = Readonly<{
  catalog: PatternImportDxfProductPhaseEAuthoringCatalogV1;
  projection: PatternImportDxfProductPhaseEAssemblyProjectionV1;
  annotationSource: Readonly<{ identity: string; revision: string; sha256: string }> | null;
  pieceFeatures?: CadTablePieceFeaturesByKey;
}>;

export function matchesPatternImportDxfProductExactNDesktopGeometryV2(
  geometry: PatternImportDxfProductExactNDesktopGeometryV2 | null,
  session: PatternImportDxfPhaseEExactNAssemblyOrderSessionV2,
): geometry is PatternImportDxfProductExactNDesktopGeometryV2 {
  if (!geometry) return false;
  const { catalog, projection } = geometry;
  return (
    catalog.techCardId === session.current.row.techCardId &&
    catalog.scopeKey === session.current.row.scopeKey &&
    catalog.canonicalSha256 === session.current.catalogCanonicalSha256 &&
    projection.expectedCatalogCanonicalSha256 === catalog.canonicalSha256 &&
    projection.sizeSelectionCanonicalSha256 === catalog.sizeSelectionCanonicalSha256 &&
    projection.sourceFileId === catalog.sourceFileId &&
    projection.sizeToken === catalog.sizeToken
  );
}

export type PatternImportDxfProductExactNSeamProductionMountPropsV2 = Readonly<{
  session: PatternImportDxfPhaseEExactNAssemblyOrderSessionV2;
  activeSeamIndex: number;
  onActiveSeamIndexChange: (index: number) => void;
  mannequin: PatternImportDxfProductExactNSeamProductionMannequinSlotV2;
  operationsPanel: PatternImportDxfPhaseECadWorkbenchSlotV1;
  desktopGeometry?: PatternImportDxfProductExactNDesktopGeometryV2 | null;
  objectSidebar?: PatternImportDxfPhaseECadWorkbenchSlotV1;
  sceneOverlayInput?: PatternImportDxfProductExactNSeamProductionSceneOverlayInputV2 | null;
  sceneOverlayBlocker?: Readonly<{ code: string; detail: string }> | null;
  /** Mounted only by the caller that owns the genuine V4/V5 annotation transaction. */
  topologyAnnotationAuthoring?: ReactNode;
}>;

function sceneOverlayBlocked(
  detail: string,
): PatternImportDxfPhaseECadMannequinSceneOverlayCapabilityV1 {
  return Object.freeze({
    status: 'blocked' as const,
    bridge: null,
    blocker: Object.freeze({
      code: 'authoritative-scene-overlay-invalid' as const,
      detail: detail.slice(0, 2_048),
    }),
  });
}

export function resolvePatternImportDxfProductExactNSeamProductionSceneOverlayV2(
  session: PatternImportDxfPhaseEExactNAssemblyOrderSessionV2,
  activeSeamIndex: number,
  input: PatternImportDxfProductExactNSeamProductionSceneOverlayInputV2 | null | undefined,
  unavailableBlocker?: Readonly<{ code: string; detail: string }> | null,
  focusedPieceId?: string | null,
): PatternImportDxfPhaseECadMannequinSceneOverlayCapabilityV1 {
  if (!input)
    return sceneOverlayBlocked(
      unavailableBlocker
        ? `${unavailableBlocker.code}: ${unavailableBlocker.detail}`
        : 'exact-n-coordinate-staging-unavailable: The current Exact-N mount has no exact all-scope coordinate staging and current stitch/BOM scene input.',
    );
  const resolved = resolvePatternImportDxfProductExactNSeamProductionMountV2(
    session,
    activeSeamIndex,
  );
  if (!resolved.ok)
    return sceneOverlayBlocked(
      `The current Exact-N production selection is unavailable: ${resolved.blockers[0].code}.`,
    );
  const activeSeam = resolved.model.state.seams[activeSeamIndex];
  const scene = buildPatternImportDxfPhaseECadMannequinProductionSceneOverlayV2({
    session,
    importGeneration: input.staging.importGeneration,
    staging: input.staging,
    selection: {
      pieceId: focusedPieceId === undefined ? activeSeam.sides[0]?.pieceId ?? null : focusedPieceId,
      seamId: activeSeam.seamId,
    },
    stitchVisuals: input.stitchVisuals,
    bomItems: input.bomItems,
  });
  if (!scene.ok) return sceneOverlayBlocked(`${scene.blocker.code}: ${scene.blocker.detail}`);
  const bridge = bridgePatternImportDxfPhaseECadMannequinSceneOverlayToRendererV1(scene.overlay);
  if (!bridge.ok) return sceneOverlayBlocked(`${bridge.blocker.code}: ${bridge.blocker.detail}`);
  return Object.freeze({ status: 'available' as const, bridge: bridge.bridge, blocker: null });
}

export function resolvePatternImportDxfProductExactNSeamProductionMountV2(
  session: PatternImportDxfPhaseEExactNAssemblyOrderSessionV2,
  activeSeamIndex: number,
): PatternImportDxfProductExactNSeamWorkbenchHostResultV2 {
  return resolvePatternImportDxfProductExactNSeamWorkbenchHostV2({
    selectionOwner: session.selectionOwner,
    current: session.current,
    activeSeamIndex,
  });
}

/**
 * Layout-only production boundary. It never prepares, restores, persists or edits exact-N data;
 * invalid/stale/forged inputs render nothing, leaving the caller to show the typed blocker.
 */
export function PatternImportDxfProductExactNSeamProductionMountV2({
  session,
  activeSeamIndex,
  onActiveSeamIndexChange,
  mannequin,
  operationsPanel,
  desktopGeometry = null,
  objectSidebar,
  sceneOverlayInput = null,
  sceneOverlayBlocker = null,
  topologyAnnotationAuthoring = null,
}: PatternImportDxfProductExactNSeamProductionMountPropsV2): ReactNode {
  const resolved = resolvePatternImportDxfProductExactNSeamProductionMountV2(
    session,
    activeSeamIndex,
  );
  const exactDesktop =
    resolved.ok &&
    !topologyAnnotationAuthoring &&
    resolved.model.seamCount === 1 &&
    matchesPatternImportDxfProductExactNDesktopGeometryV2(desktopGeometry, session)
      ? desktopGeometry
      : null;
  const tableSessionOwner = useCadTableZeroCanvasOwner(exactDesktop?.projection ?? null);
  if (!resolved.ok) return null;
  const activeSeam = resolved.model.state.seams[activeSeamIndex];
  const operation = resolved.model.state.bindings.selectedOperation;
  const seamOrdinal = cadWorkbenchOperationSeamOrdinal(operation.seamIds, activeSeam.seamId);
  const selectedPieceKeys = tableSessionOwner?.session.layout.selectedPieceKeys ?? [];
  const activePiece =
    selectedPieceKeys.length === 1
      ? tableSessionOwner?.session.layout.pieces.find(
          ({ identity }) => identity.key === selectedPieceKeys[0],
        )
      : null;
  const selection = Object.freeze({
    operationNumber: session.current.selectedOperation.sourceOperationNumber,
    pieceId: exactDesktop
      ? activePiece?.identity.pieceId ?? null
      : activeSeam.sides[0]?.pieceId ?? null,
    seamId: activeSeam.seamId,
  });
  const sceneOverlay = resolvePatternImportDxfProductExactNSeamProductionSceneOverlayV2(
    session,
    activeSeamIndex,
    sceneOverlayInput,
    sceneOverlayBlocker,
    exactDesktop ? selection.pieceId : undefined,
  );
  const mannequinSlot: PatternImportDxfPhaseECadWorkbenchSlotV1 =
    typeof mannequin === 'function'
      ? (context) => mannequin(Object.freeze({ ...context, sceneOverlay }))
      : mannequin;

  return (
    <PatternImportDxfPhaseECadWorkbenchSplitShellV1
      objectSidebar={
        objectSidebar ??
        (exactDesktop && tableSessionOwner ? (
          <CadTablePieceSelectionPanel
            owner={tableSessionOwner}
            projection={exactDesktop.projection}
            features={exactDesktop.pieceFeatures}
          />
        ) : null)
      }
      onContentKeyDown={(event) => {
        if (tableSessionOwner) handleCadTablePieceSelectionKey(event, tableSessionOwner);
      }}
      selection={selection}
      onSelectionFocus={({ selection: nextSelection }) => {
        if (nextSelection?.pieceId && tableSessionOwner) {
          const matches = tableSessionOwner.session.layout.pieces.filter(
            ({ identity }) => identity.pieceId === nextSelection.pieceId,
          );
          if (matches.length === 1)
            tableSessionOwner.update((current) =>
              activatePatternImportDxfPhaseECadTableZeroCanvasPieceV1(
                current,
                matches[0]!.identity.key,
                false,
              ),
            );
        }
        if (!nextSelection?.seamId) return;
        const nextIndex = resolved.model.state.seams.findIndex(
          ({ seamId }) => seamId === nextSelection.seamId,
        );
        if (nextIndex >= 0) onActiveSeamIndexChange(nextIndex);
      }}
      desktop={
        exactDesktop && tableSessionOwner && seamOrdinal !== null ? (
          <PatternImportDxfPhaseECadTableZeroConnectCanvasV1
            catalog={exactDesktop.catalog}
            projection={exactDesktop.projection}
            pieceFeatures={exactDesktop.pieceFeatures}
            tableSessionOwner={tableSessionOwner}
            savedSeam={{
              seamId: activeSeam.seamId,
              operationNumber: operation.sourceOperationNumber,
              ordinal: seamOrdinal,
              sides: activeSeam.sides,
            }}
            disabled
          />
        ) : (
          <PatternImportDxfProductExactNSeamWorkbenchHostV2
            selectionOwner={session.selectionOwner}
            current={session.current}
            activeSeamIndex={activeSeamIndex}
            onActiveSeamIndexChange={onActiveSeamIndexChange}
            operationWindow={topologyAnnotationAuthoring}
          />
        )
      }
      mannequin={mannequinSlot}
      operationsPanel={operationsPanel}
    />
  );
}
