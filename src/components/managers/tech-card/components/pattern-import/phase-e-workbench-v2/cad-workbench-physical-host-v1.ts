import type { ReactNode } from 'react';
import type { MeasurementSurfaceAcceptedClothV1 } from 'components/shared/measurement-watertight-surface-v1-stage';
import type { DxfGarmentObservedBoundaryEdgeV1 } from 'components/cloth-simulation-spike/dxf-garment-observed-unsewn-edges-v1';
import type {
  SavedGenericDurablePhysicalPreviewHitV1,
  SavedGenericDurablePhysicalPreviewPieceV1,
  SavedGenericDurablePhysicalPreviewScopeV1,
  SavedGenericDurablePhysicalPreviewSeamV1,
  SavedGenericDurablePhysicalPreviewSelectedSideV1,
} from 'components/cloth-simulation-spike/saved-generic-durable-physical-host-v1';
import type { PatternImportDxfPhaseECadWorkbenchSlotContextV1 } from './cad-workbench-split-shell-v1';
import type { ModelDisplayedTriangleBodyOwnedInputV1 } from 'components/cloth-simulation-spike/model-displayed-triangle-body-input-v1';
import type {
  CadMannequinArrangementBindingsV1,
  CadMannequinArrangementPieceV1,
} from './cad-mannequin-arrangement-document-v1';
import type { PatternImportDxfProductPhaseEAssemblyProjectionV1 } from 'lib/pattern-import/dxf-product-phase-e-assembly-workbench-v1';

export type CadWorkbenchMannequinArrangementSaveV1 = Readonly<{
  scopeKey: string;
  projection: PatternImportDxfProductPhaseEAssemblyProjectionV1;
  mannequin: CadMannequinArrangementBindingsV1['mannequin'];
  pieces: readonly CadMannequinArrangementPieceV1[];
  annotationSource?: Readonly<{ identity: string; revision: string; sha256: string }>;
}>;

export type CadWorkbenchPhysicalPreviewInteractionV1 = Readonly<{
  scope: SavedGenericDurablePhysicalPreviewScopeV1;
  selectedPiece: SavedGenericDurablePhysicalPreviewPieceV1 | null;
  savedSeam?: SavedGenericDurablePhysicalPreviewSeamV1;
  selectedSide?: SavedGenericDurablePhysicalPreviewSelectedSideV1;
  selectedEdge?: DxfGarmentObservedBoundaryEdgeV1;
  onPick: (hit: SavedGenericDurablePhysicalPreviewHitV1) => void;
}>;

export function bindCadWorkbenchPhysicalPreviewSelectionV1(
  scope: SavedGenericDurablePhysicalPreviewScopeV1 | null,
  operationNumber: number,
  focusSelection: PatternImportDxfPhaseECadWorkbenchSlotContextV1['focusSelection'],
  selection: PatternImportDxfPhaseECadWorkbenchSlotContextV1['selection'] = null,
  savedSeam?: SavedGenericDurablePhysicalPreviewSeamV1,
): CadWorkbenchPhysicalPreviewInteractionV1 | null {
  if (!scope) return null;
  return {
    scope,
    savedSeam,
    selectedSide:
      savedSeam &&
      selection?.seamId === savedSeam.seamId &&
      selection.operationNumber === savedSeam.operationNumber &&
      selection.seamSideIndex != null
        ? { seam: savedSeam, sideIndex: selection.seamSideIndex }
        : undefined,
    selectedEdge:
      selection?.operationNumber === operationNumber ? selection.boundaryEdge : undefined,
    selectedPiece:
      selection?.scopeKey && selection.pieceId && selection.pieceLineKey
        ? {
            scopeKey: selection.scopeKey,
            pieceId: selection.pieceId,
            pieceLineKey: selection.pieceLineKey,
          }
        : null,
    onPick(hit) {
      if (hit.kind === 'garment')
        focusSelection({
          operationNumber,
          scopeKey: hit.scopeKey,
          pieceId: hit.pieceId,
          pieceLineKey: hit.pieceLineKey,
          ...(hit.seamSide && {
            seamId: hit.seamSide.seamId,
            seamSideIndex: hit.seamSide.sideIndex,
          }),
        });
    },
  };
}

/** One mounted CAD route supplies the current picker input and its in-viewport cloth preview. */
export type CadWorkbenchPhysicalHostV1 = Readonly<{
  onDisplayedBodyInputV1: (input: ModelDisplayedTriangleBodyOwnedInputV1 | null) => void;
  acceptedCloth?: MeasurementSurfaceAcceptedClothV1;
  arrangementSourceKey?: string;
  onReadSavedMannequinModelId?: (signal: AbortSignal) => Promise<number | null>;
  onSaveMannequinArrangement?: (
    input: CadWorkbenchMannequinArrangementSaveV1,
    signal: AbortSignal,
  ) => Promise<void>;
  onReadMannequinArrangement?: (
    input: Omit<CadWorkbenchMannequinArrangementSaveV1, 'pieces'>,
    signal: AbortSignal,
  ) => Promise<readonly CadMannequinArrangementPieceV1[] | null>;
  viewport?: (interaction: CadWorkbenchPhysicalPreviewInteractionV1 | null) => ReactNode;
  /** Transitional read-only compatibility for the separate zero-operation route. */
  panel?: ReactNode;
}>;
