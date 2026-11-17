import type { PatternImportDxfProductPhaseEAssemblyProjectionV1 } from 'lib/pattern-import/dxf-product-phase-e-assembly-workbench-v1';

import {
  buildPatternImportDxfPhaseECadMannequinSceneOverlayFromExactAuthorityV2,
  type PatternImportDxfPhaseECadMannequinSceneExactAuthorityV2,
} from './cad-mannequin-scene-overlay-adapter-v1';
import { bridgePatternImportDxfPhaseECadMannequinSceneOverlayToRendererV1 } from './cad-mannequin-scene-overlay-renderer-bridge-v1';
import {
  readPatternImportDxfPhaseEZeroConnectSavedSceneProjectionV1,
  type PatternImportDxfPhaseEZeroConnectPreparedAuthorityV1,
} from './cad-table-zero-connect-phase-e-authority-v1';
import type { PatternImportDxfPhaseECadMannequinSceneOverlayCapabilityV1 } from './cad-workbench-mannequin-model-picker-v1';
import { matchesPatternImportDxfProductExactNSessionSavedBindingV1 } from './durable-exact-session-current-v1';
import type { PatternImportDxfPhaseEExactNAssemblyOrderSessionV2 } from './exact-n-seam-production-mount-v2';
import { resolvePatternImportDxfProductExactNSeamWorkbenchHostV2 } from './exact-n-seam-workbench-host-v2';
import type { PatternImportDxfPhaseEGoldenCardFullExactConnectionV1 } from './golden-card-full-exact-capture-aggregator-v1';

function blocked(detail: string): PatternImportDxfPhaseECadMannequinSceneOverlayCapabilityV1 {
  return Object.freeze({
    status: 'blocked' as const,
    bridge: null,
    blocker: Object.freeze({
      code: 'authoritative-saved-exact-binding-invalid' as const,
      detail,
    }),
  });
}

/** Stages the one restored seam of one verified saved DXF row for display. */
export function buildPatternImportDxfPhaseECadMannequinSavedOneSeamSceneOverlayV1({
  session,
  prepared,
  projection,
  focusedPieceId,
}: Readonly<{
  session: PatternImportDxfPhaseEExactNAssemblyOrderSessionV2;
  prepared: PatternImportDxfPhaseEZeroConnectPreparedAuthorityV1;
  projection: PatternImportDxfProductPhaseEAssemblyProjectionV1;
  focusedPieceId: string | null;
}>): PatternImportDxfPhaseECadMannequinSceneOverlayCapabilityV1 {
  const resolved = resolvePatternImportDxfProductExactNSeamWorkbenchHostV2({
    selectionOwner: session.selectionOwner,
    current: session.current,
    activeSeamIndex: 0,
  });
  if (session.productionFeed || !resolved.ok || resolved.model.seamCount !== 1)
    return blocked('One verified durable seam in the selected saved operation is required.');

  const savedProjection = readPatternImportDxfPhaseEZeroConnectSavedSceneProjectionV1(prepared);
  const { row, serverAssemblyRevision, assemblyTopologySha256, catalogCanonicalSha256 } =
    resolved.model.state.bindings;
  const { operation, seams } = resolved.model.choices;
  const seam = seams[0]!;
  const operationNumber = operation.sourceOperationNumber;
  if (
    !savedProjection ||
    projection !== savedProjection ||
    prepared.catalogCanonicalSha256 !== catalogCanonicalSha256 ||
    !matchesPatternImportDxfProductExactNSessionSavedBindingV1(
      session,
      prepared.row,
      operationNumber,
      [seam.seamId],
    )
  )
    return blocked(
      'The restored seam and its displayed Phase-D projection bind different saved rows.',
    );

  const connection: PatternImportDxfPhaseEGoldenCardFullExactConnectionV1 = Object.freeze({
    connectionRef: seam.seamId,
    operationNumber,
    authoringOperationId: operation.authoringOperationId,
    row,
    serverTopologySha256: assemblyTopologySha256,
    catalogCanonicalSha256,
    sides: seam.sides,
  });
  const exactConnections = Object.freeze([connection]);
  const context = {
    techCardId: row.techCardId,
    cardRef: `tech-card:${row.techCardId}`,
    cardLockVersion: row.cardLockVersion,
    serverAssemblyRevision,
    importGeneration: prepared.preparationGeneration,
  };
  const authority: PatternImportDxfPhaseECadMannequinSceneExactAuthorityV2 = {
    ...context,
    operations: [{ operationNumber, seamKeys: operation.seamIds, exactConnections }],
    connections: exactConnections,
  };
  const scene = buildPatternImportDxfPhaseECadMannequinSceneOverlayFromExactAuthorityV2({
    current: context,
    staging: {
      techCardId: row.techCardId,
      importGeneration: context.importGeneration,
      sources: [{ scopeKey: row.scopeKey, label: row.scopeKey, projection: savedProjection }],
    },
    authority,
    activeOperationNumber: operationNumber,
    selection: { scopeKey: row.scopeKey, pieceId: focusedPieceId, seamId: seam.seamId },
    stitchVisuals: [],
    bomItems: [],
  });
  if (!scene.ok) return blocked(scene.blocker.detail);
  if (scene.overlay.edgeHighlights.length !== 2)
    return blocked('The restored seam sides are unavailable in the exact saved projection.');
  const bridge = bridgePatternImportDxfPhaseECadMannequinSceneOverlayToRendererV1(scene.overlay);
  if (!bridge.ok) return blocked(bridge.blocker.detail);
  return Object.freeze({ status: 'available' as const, bridge: bridge.bridge, blocker: null });
}
