export const PATTERN_IMPORT_DXF_PHASE_E_CAD_WORKBENCH_STITCH_EDITOR_HANDOFF_V1 =
  'pattern-import-dxf-phase-e-cad-workbench-stitch-editor-handoff/1' as const;

export const PATTERN_IMPORT_DXF_PHASE_E_CAD_WORKBENCH_STITCH_EDITOR_HANDOFF_CLAIMS_V1 =
  Object.freeze({
    existingOperationEditorOwnerReused: true,
    existingReactHookFormOwnerReused: true,
    duplicateFieldRegistrationCreated: false,
    secondFormOwnerCreated: false,
    autosaveRequested: false,
    networkRequested: false,
    colorwaySelectionPersistsBom: false,
    colorwaySelectionPreviewOnly: true,
  } as const);

export type PatternImportDxfPhaseECadWorkbenchStitchEditorFieldV1 =
  'type' | 'density' | 'gauge' | 'offset' | 'thread';

export type PatternImportDxfPhaseECadWorkbenchStitchEditorTargetV1 =
  'type' | 'density' | 'gauge' | 'gauge-prerequisite' | 'offset' | 'thread';

export type PatternImportDxfPhaseECadWorkbenchStitchEditorHandoffV1 =
  | Readonly<{
      ok: true;
      schemaVersion: typeof PATTERN_IMPORT_DXF_PHASE_E_CAD_WORKBENCH_STITCH_EDITOR_HANDOFF_V1;
      field: PatternImportDxfPhaseECadWorkbenchStitchEditorFieldV1;
      target: PatternImportDxfPhaseECadWorkbenchStitchEditorTargetV1;
      openSetup: boolean;
      prerequisite: 'set-needle-count-at-least-two' | 'choose-offset-bearing-stitch-type' | null;
      claims: typeof PATTERN_IMPORT_DXF_PHASE_E_CAD_WORKBENCH_STITCH_EDITOR_HANDOFF_CLAIMS_V1;
    }>
  | Readonly<{
      ok: false;
      schemaVersion: typeof PATTERN_IMPORT_DXF_PHASE_E_CAD_WORKBENCH_STITCH_EDITOR_HANDOFF_V1;
      field: PatternImportDxfPhaseECadWorkbenchStitchEditorFieldV1;
      target: null;
      openSetup: false;
      prerequisite: null;
      blocker: Readonly<{
        code:
          'operation-frozen' | 'field-not-owned-by-operation' | 'topstitch-thread-bom-line-missing';
        detail: string;
      }>;
      claims: typeof PATTERN_IMPORT_DXF_PHASE_E_CAD_WORKBENCH_STITCH_EDITOR_HANDOFF_CLAIMS_V1;
    }>;

export type PatternImportDxfPhaseECadWorkbenchStitchEditorContextV1 = Readonly<{
  frozen: boolean;
  showTopstitch: boolean;
  showSewingOverrides: boolean;
  showNeedleFacts: boolean;
  needleCount: number;
  topstitchModeTakesWidth: boolean;
  topstitchModeInSetup: boolean;
  topstitchOffsetInSetup: boolean;
  topstitchOperation: boolean;
  eligibleTopstitchThreadCount: number;
}>;

const ready = (
  field: PatternImportDxfPhaseECadWorkbenchStitchEditorFieldV1,
  target: PatternImportDxfPhaseECadWorkbenchStitchEditorTargetV1,
  openSetup: boolean,
  prerequisite: 'set-needle-count-at-least-two' | 'choose-offset-bearing-stitch-type' | null = null,
): Extract<PatternImportDxfPhaseECadWorkbenchStitchEditorHandoffV1, { ok: true }> =>
  Object.freeze({
    ok: true as const,
    schemaVersion: PATTERN_IMPORT_DXF_PHASE_E_CAD_WORKBENCH_STITCH_EDITOR_HANDOFF_V1,
    field,
    target,
    openSetup,
    prerequisite,
    claims: PATTERN_IMPORT_DXF_PHASE_E_CAD_WORKBENCH_STITCH_EDITOR_HANDOFF_CLAIMS_V1,
  });

const blocked = (
  field: PatternImportDxfPhaseECadWorkbenchStitchEditorFieldV1,
  code: Extract<
    PatternImportDxfPhaseECadWorkbenchStitchEditorHandoffV1,
    { ok: false }
  >['blocker']['code'],
  detail: string,
): Extract<PatternImportDxfPhaseECadWorkbenchStitchEditorHandoffV1, { ok: false }> =>
  Object.freeze({
    ok: false as const,
    schemaVersion: PATTERN_IMPORT_DXF_PHASE_E_CAD_WORKBENCH_STITCH_EDITOR_HANDOFF_V1,
    field,
    target: null,
    openSetup: false as const,
    prerequisite: null,
    blocker: Object.freeze({ code, detail }),
    claims: PATTERN_IMPORT_DXF_PHASE_E_CAD_WORKBENCH_STITCH_EDITOR_HANDOFF_CLAIMS_V1,
  });

/**
 * Resolves a click on the read-only stitch context into the one existing OperationEditor. This is
 * only navigation: the target remains the registered RHF control and this contract never writes a
 * value, asks for save, or treats the preview colorway as a BOM edit.
 */
export function resolvePatternImportDxfPhaseECadWorkbenchStitchEditorHandoffV1(
  field: PatternImportDxfPhaseECadWorkbenchStitchEditorFieldV1,
  context: PatternImportDxfPhaseECadWorkbenchStitchEditorContextV1,
): PatternImportDxfPhaseECadWorkbenchStitchEditorHandoffV1 {
  if (context.frozen)
    return blocked(
      field,
      'operation-frozen',
      'The selected operation is read-only, so its stitch specification cannot be edited.',
    );

  switch (field) {
    case 'type':
      return context.showTopstitch
        ? ready(field, 'type', context.topstitchModeInSetup)
        : blocked(
            field,
            'field-not-owned-by-operation',
            'This operation does not expose a topstitch type control.',
          );
    case 'density':
      return context.showSewingOverrides
        ? ready(field, 'density', true)
        : blocked(
            field,
            'field-not-owned-by-operation',
            'This operation does not own a stitch-density override.',
          );
    case 'gauge':
      if (!context.showNeedleFacts)
        return blocked(
          field,
          'field-not-owned-by-operation',
          'This operation does not own multi-needle stitching controls.',
        );
      return context.needleCount >= 2
        ? ready(field, 'gauge', true)
        : ready(field, 'gauge-prerequisite', true, 'set-needle-count-at-least-two');
    case 'offset':
      if (!context.showTopstitch)
        return blocked(
          field,
          'field-not-owned-by-operation',
          'This operation does not expose topstitch offset controls.',
        );
      return context.topstitchModeTakesWidth
        ? ready(field, 'offset', context.topstitchOffsetInSetup)
        : ready(field, 'type', context.topstitchModeInSetup, 'choose-offset-bearing-stitch-type');
    case 'thread':
      if (!context.topstitchOperation)
        return blocked(
          field,
          'field-not-owned-by-operation',
          'Thread selection is available here only for a topstitch operation.',
        );
      return context.eligibleTopstitchThreadCount > 0
        ? ready(field, 'thread', false)
        : blocked(
            field,
            'topstitch-thread-bom-line-missing',
            'Add a TOPSTITCH_THREAD BOM line before choosing the operation thread.',
          );
  }
}

export function parsePatternImportDxfPhaseECadWorkbenchStitchEditorFieldV1(
  value: string | null | undefined,
): PatternImportDxfPhaseECadWorkbenchStitchEditorFieldV1 | null {
  return value === 'type' ||
    value === 'density' ||
    value === 'gauge' ||
    value === 'offset' ||
    value === 'thread'
    ? value
    : null;
}
