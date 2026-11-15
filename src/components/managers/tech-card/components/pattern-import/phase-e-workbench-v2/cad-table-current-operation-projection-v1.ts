import type { TechCardFormData } from 'components/managers/tech-card/components/schema';

import type { PatternImportDxfPhaseECadTableCurrentOperationV1 } from './cad-table-draft-operation-planner-v1';

type FormOperation = NonNullable<TechCardFormData['operations']>[number];
type CurrentOperation = PatternImportDxfPhaseECadTableCurrentOperationV1;

export const PATTERN_IMPORT_DXF_PHASE_E_CAD_TABLE_CURRENT_OPERATION_PROJECTION_V1 =
  'pattern-import-dxf-phase-e-cad-table-current-operation-projection/1' as const;

export const PATTERN_IMPORT_DXF_PHASE_E_CAD_TABLE_CURRENT_OPERATION_PROJECTION_CLAIMS_V1 =
  Object.freeze({
    readsExistingReactHookFormRow: true,
    createsFormOwner: false,
    registersFormFields: false,
    writesFormFields: false,
    createsOperationAuthority: false,
    productionReady: false,
  } as const);

function optionalDecimal(value: string | undefined): Readonly<{ value: string }> | undefined {
  const normalized = value?.trim() ?? '';
  return normalized ? Object.freeze({ value: normalized }) : undefined;
}

/**
 * Projects the live flat RHF row into the nested wire-shaped fields consumed by the pure planner.
 * It deliberately does not register, set or persist any form value.
 */
export function projectPatternImportDxfPhaseECadTableCurrentOperationV1(
  operation: FormOperation,
): PatternImportDxfPhaseECadTableCurrentOperationV1 {
  const stitching: NonNullable<CurrentOperation['stitching']> = {
    needleCount: operation.needleCount ?? 0,
    needleGaugeMm: optionalDecimal(operation.needleGaugeMm),
    seamSecuring: (operation.seamSecuring || 'TECH_CARD_SEAM_SECURING_UNKNOWN') as NonNullable<
      CurrentOperation['stitching']
    >['seamSecuring'],
    rowSpacingMm: optionalDecimal(operation.rowSpacingMm),
    fullnessRatio: optionalDecimal(operation.fullnessRatio),
    bindingStyle: (operation.bindingStyle || 'TECH_CARD_BINDING_STYLE_UNKNOWN') as NonNullable<
      CurrentOperation['stitching']
    >['bindingStyle'],
    labelAttachStitch: (operation.labelAttachStitch ||
      'TECH_CARD_LABEL_ATTACH_STITCH_UNKNOWN') as NonNullable<
      CurrentOperation['stitching']
    >['labelAttachStitch'],
  };
  const trim: NonNullable<CurrentOperation['trim']> = {
    action: (operation.trimAction || 'TECH_CARD_TRIM_ACTION_UNKNOWN') as NonNullable<
      CurrentOperation['trim']
    >['action'],
    residualAllowanceMm: optionalDecimal(operation.residualAllowanceMm),
  };
  const press: NonNullable<CurrentOperation['press']> = {
    action: (operation.pressAction || 'TECH_CARD_PRESS_ACTION_UNKNOWN') as NonNullable<
      CurrentOperation['press']
    >['action'],
    toward: (operation.pressToward || 'TECH_CARD_PRESS_TOWARD_UNKNOWN') as NonNullable<
      CurrentOperation['press']
    >['toward'],
  };

  return Object.freeze({
    operationNumber: operation.operationNumber ?? 0,
    operationType: (operation.operationType ||
      'TECH_CARD_OPERATION_TYPE_UNKNOWN') as CurrentOperation['operationType'],
    zone: (operation.zone || 'TECH_CARD_GARMENT_ZONE_UNKNOWN') as CurrentOperation['zone'],
    bomLineKeys: Object.freeze(
      (operation.bomLineKeys ?? []).map((key) => key.trim()).filter(Boolean),
    ) as string[],
    seamClass: (operation.seamClass ||
      'TECH_CARD_SEAM_CLASS_UNKNOWN') as CurrentOperation['seamClass'],
    machineType: (operation.machineType ||
      'TECH_CARD_MACHINE_TYPE_UNKNOWN') as CurrentOperation['machineType'],
    pressEquipment: (operation.pressEquipment ||
      'TECH_CARD_PRESS_EQUIPMENT_UNKNOWN') as CurrentOperation['pressEquipment'],
    inputKeys: Object.freeze(
      (operation.inputKeys ?? []).map((key) => key.trim()).filter(Boolean),
    ) as string[],
    outputUnitKey: (operation.outputUnitKey ?? '').trim(),
    outputUnitName: (operation.outputUnitName ?? '').trim(),
    stitching,
    trim,
    press,
    clean: Object.freeze({
      kind: (operation.cleaningKind || 'TECH_CARD_CLEANING_KIND_UNKNOWN') as NonNullable<
        CurrentOperation['clean']
      >['kind'],
    }),
    inspect: Object.freeze({
      coverageMode: (operation.coverageMode || 'TECH_CARD_INSPECT_COVERAGE_UNKNOWN') as NonNullable<
        CurrentOperation['inspect']
      >['coverageMode'],
    }),
    wetProcessKind: (operation.wetProcessKind ||
      'TECH_CARD_WET_PROCESS_KIND_UNKNOWN') as CurrentOperation['wetProcessKind'],
    work: (operation.work ?? '').trim(),
    seamKeys: Object.freeze(
      (operation.seamKeys ?? []).map((key) => key.trim()).filter(Boolean),
    ) as string[],
  });
}
