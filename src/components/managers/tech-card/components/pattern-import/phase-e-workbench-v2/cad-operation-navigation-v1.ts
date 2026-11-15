export const PATTERN_IMPORT_DXF_PHASE_E_CAD_OPERATION_NAVIGATION_V1 =
  'pattern-import-dxf-phase-e-cad-operation-navigation/1' as const;

export type PatternImportDxfPhaseECadOperationStatusV1 = Readonly<{
  missing: boolean;
  broken: boolean;
  problem: boolean;
  draft: boolean;
  review: boolean;
}>;

export type PatternImportDxfPhaseECadOperationReferenceV1 = Readonly<{
  key: string;
  label: string;
}>;

export type PatternImportDxfPhaseECadOperationNavigationItemV1 = Readonly<{
  index: number;
  operationNumber: number;
  title: string;
  work: string | null;
  typeLabel: string | null;
  status: PatternImportDxfPhaseECadOperationStatusV1;
  context: Readonly<{
    inputs: readonly PatternImportDxfPhaseECadOperationReferenceV1[];
    seamKeys: readonly string[];
    output: PatternImportDxfPhaseECadOperationReferenceV1 | null;
    bomRefs: readonly PatternImportDxfPhaseECadOperationReferenceV1[];
    warnings: readonly string[];
  }>;
}>;

/**
 * Read-only navigation projection built by OperationsField, the sole RHF/useFieldArray owner.
 * It deliberately carries no mutator and no persisted operation identity of its own.
 */
export type PatternImportDxfPhaseECadOperationNavigationV1 = Readonly<{
  schemaVersion: typeof PATTERN_IMPORT_DXF_PHASE_E_CAD_OPERATION_NAVIGATION_V1;
  selectedIndex: number;
  items: readonly PatternImportDxfPhaseECadOperationNavigationItemV1[];
}>;

export type PatternImportDxfPhaseECadOperationSwitchDirectionV1 = 'previous' | 'next';

export function resolvePatternImportDxfPhaseECadOperationSwitchIndexV1(
  navigation: PatternImportDxfPhaseECadOperationNavigationV1,
  direction: PatternImportDxfPhaseECadOperationSwitchDirectionV1,
): number | null {
  if (!navigation.items.length) return null;
  const selectedPosition = navigation.items.findIndex(
    ({ index }) => index === navigation.selectedIndex,
  );
  if (selectedPosition < 0) return navigation.items[0].index;
  const nextPosition = direction === 'previous' ? selectedPosition - 1 : selectedPosition + 1;
  return navigation.items[nextPosition]?.index ?? null;
}
