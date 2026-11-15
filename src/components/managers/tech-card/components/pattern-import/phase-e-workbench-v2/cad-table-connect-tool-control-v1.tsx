import { PatternImportDxfPhaseECadWorkbenchToolButtonV1 } from './cad-workbench-tool-button-v1';

export type PatternImportDxfPhaseECadTableConnectToolPhaseV1 =
  'idle' | 'select-first-edge' | 'select-second-edge' | 'review';

export const PATTERN_IMPORT_DXF_PHASE_E_CAD_TABLE_CONNECT_TOOL_CONTROL_CONTRACT_V1 = Object.freeze({
  oneRailAction: true,
  createsTopLevelWorkspaceMode: false,
  activeActionCancelsDraft: true,
  exactEdgeSelectionRemainsCallerOwned: true,
  connectionDraftRemainsCallerOwned: true,
  createsPersistenceOwner: false,
} as const);

export function labelPatternImportDxfPhaseECadTableConnectToolV1(
  phase: PatternImportDxfPhaseECadTableConnectToolPhaseV1,
): string {
  switch (phase) {
    case 'select-first-edge':
      return 'Cancel · choose first edge';
    case 'select-second-edge':
      return 'Cancel · choose matching edge';
    case 'review':
      return 'Cancel edge connection';
    default:
      return 'Connect edges';
  }
}

/**
 * Compact rail affordance only. The exact topology session and draft stay with the caller, so this
 * control cannot mint a seam, Assembly Order row or persistence capability on its own.
 */
export function PatternImportDxfPhaseECadTableConnectToolControlV1({
  phase,
  disabled = false,
  onStart,
  onCancel,
}: Readonly<{
  phase: PatternImportDxfPhaseECadTableConnectToolPhaseV1;
  disabled?: boolean;
  onStart: () => void;
  onCancel: () => void;
}>) {
  const active = phase !== 'idle';
  return (
    <div data-cad-connect-tool-phase={phase} aria-live='polite'>
      <PatternImportDxfPhaseECadWorkbenchToolButtonV1
        icon='dart'
        label={labelPatternImportDxfPhaseECadTableConnectToolV1(phase)}
        active={active}
        pressed={active}
        disabled={disabled}
        dataAttributes={{ 'data-cad-connect-tool': active ? 'active' : 'idle' }}
        onClick={active ? onCancel : onStart}
      />
    </div>
  );
}
