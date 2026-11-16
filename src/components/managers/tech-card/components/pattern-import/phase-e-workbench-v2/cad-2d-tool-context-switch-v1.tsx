import { PatternImportDxfPhaseECadWorkbenchToolButtonV1 } from './cad-workbench-tool-button-v1';

export type PatternImportDxfPhaseECad2dToolContextV1 = 'assembly' | 'pattern';

export const PATTERN_IMPORT_DXF_PHASE_E_CAD_2D_TOOL_CONTEXT_SWITCH_CONTRACT_V1 = Object.freeze({
  oneContextButton: true,
  competingTopLevelModesHidden: true,
  assemblyIsDefaultWorkspace: true,
  patternEditingIsToolContext: true,
  unavailablePatternContextHidden: true,
  unavailablePatternContextFallsBackToAssembly: true,
} as const);

export function resolvePatternImportDxfPhaseECad2dAvailableToolContextV1(
  context: PatternImportDxfPhaseECad2dToolContextV1,
  patternAvailable: boolean,
): PatternImportDxfPhaseECad2dToolContextV1 {
  return patternAvailable ? context : 'assembly';
}

export function resolvePatternImportDxfPhaseECad2dToolContextToggleV1(
  context: PatternImportDxfPhaseECad2dToolContextV1,
): PatternImportDxfPhaseECad2dToolContextV1 {
  return context === 'assembly' ? 'pattern' : 'assembly';
}

/**
 * One rail action for entering/leaving pattern authoring. Assembly remains the workspace; pattern
 * editing behaves like a contextual CAD tool instead of a second competing top-level mode.
 */
export function PatternImportDxfPhaseECad2dToolContextSwitchV1({
  context,
  patternAvailable,
  onContextChange,
}: Readonly<{
  context: PatternImportDxfPhaseECad2dToolContextV1;
  patternAvailable: boolean;
  onContextChange: (context: PatternImportDxfPhaseECad2dToolContextV1) => void;
}>) {
  if (!patternAvailable) return null;
  const patternActive = context === 'pattern';
  return (
    <PatternImportDxfPhaseECadWorkbenchToolButtonV1
      icon='cut'
      label={patternActive ? 'Return to assembly tools' : 'Pattern tools'}
      active={patternActive}
      pressed={patternActive}
      dataAttributes={{ 'data-cad-2d-tool-context': context }}
      onClick={() =>
        onContextChange(resolvePatternImportDxfPhaseECad2dToolContextToggleV1(context))
      }
    />
  );
}
