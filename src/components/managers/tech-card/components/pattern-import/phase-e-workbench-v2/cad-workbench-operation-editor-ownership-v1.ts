export const PATTERN_IMPORT_DXF_PHASE_E_CAD_WORKBENCH_OPERATION_EDITOR_OWNERSHIP_V1 =
  'pattern-import-dxf-phase-e-cad-workbench-operation-editor-ownership/1' as const;

export const PATTERN_IMPORT_DXF_PHASE_E_CAD_WORKBENCH_OPERATION_EDITOR_OWNERSHIP_CLAIMS_V1 =
  Object.freeze({
    existingOperationsFieldOwnerReused: true,
    existingReactHookFormOwnerReused: true,
    existingUseFieldArrayOwnerReused: true,
    selectedOperationEditorRenderedOnce: true,
    duplicateFieldRegistrationCreated: false,
    secondOperationStoreCreated: false,
    selectedIndexSharedWithCadEntry: true,
    inlineEditorUnmountedWhileWorkbenchOwnsEditor: true,
    editorReturnsInlineWhenWorkbenchCloses: true,
    createsPersistenceAuthority: false,
    productionReady: false,
  } as const);

export type PatternImportDxfPhaseECadWorkbenchOperationEditorPlacementV1 =
  | 'none'
  | 'inline'
  | 'workbench';

export type PatternImportDxfPhaseECadWorkbenchOperationEditorOwnershipV1 = Readonly<{
  schemaVersion: typeof PATTERN_IMPORT_DXF_PHASE_E_CAD_WORKBENCH_OPERATION_EDITOR_OWNERSHIP_V1;
  placement: PatternImportDxfPhaseECadWorkbenchOperationEditorPlacementV1;
  renderInline: boolean;
  renderInWorkbench: boolean;
  selectedIndex: number | null;
  claims: typeof PATTERN_IMPORT_DXF_PHASE_E_CAD_WORKBENCH_OPERATION_EDITOR_OWNERSHIP_CLAIMS_V1;
}>;

/**
 * Chooses the one place where the existing selected-operation editor is rendered. This function
 * owns no form, field array, selection or persistence state; `OperationsField` remains the single
 * owner and supplies the same editor node to the chosen location.
 */
export function resolvePatternImportDxfPhaseECadWorkbenchOperationEditorOwnershipV1(
  selectedIndex: number,
  workbenchOpen: boolean,
): PatternImportDxfPhaseECadWorkbenchOperationEditorOwnershipV1 {
  const validSelectedIndex = Number.isSafeInteger(selectedIndex) && selectedIndex >= 0;
  const placement: PatternImportDxfPhaseECadWorkbenchOperationEditorPlacementV1 =
    !validSelectedIndex ? 'none' : workbenchOpen ? 'workbench' : 'inline';
  return Object.freeze({
    schemaVersion: PATTERN_IMPORT_DXF_PHASE_E_CAD_WORKBENCH_OPERATION_EDITOR_OWNERSHIP_V1,
    placement,
    renderInline: placement === 'inline',
    renderInWorkbench: placement === 'workbench',
    selectedIndex: validSelectedIndex ? selectedIndex : null,
    claims: PATTERN_IMPORT_DXF_PHASE_E_CAD_WORKBENCH_OPERATION_EDITOR_OWNERSHIP_CLAIMS_V1,
  });
}
