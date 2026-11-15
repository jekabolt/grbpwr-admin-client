import {
  resolvePatternImportDxfPhaseECadWorkbenchStitchEditorHandoffV1,
  type PatternImportDxfPhaseECadWorkbenchStitchEditorContextV1,
  type PatternImportDxfPhaseECadWorkbenchStitchEditorFieldV1,
} from './cad-workbench-stitch-editor-handoff-v1';

export const PATTERN_IMPORT_DXF_PHASE_E_CAD_WORKBENCH_STITCH_ROUTE_INTENT_V1 =
  'pattern-import-dxf-phase-e-cad-workbench-stitch-route-intent/1' as const;

export const PATTERN_IMPORT_DXF_PHASE_E_CAD_WORKBENCH_STITCH_ROUTE_INTENT_CLAIMS_V1 = Object.freeze(
  {
    existingParamsPreserved: true,
    sourceParamsMutated: false,
    navigationPerformed: false,
    existingOperationEditorTargeted: true,
    secondFormOwnerCreated: false,
    autosaveRequested: false,
    networkRequested: false,
  } as const,
);

export type PatternImportDxfPhaseECadWorkbenchStitchEditCapabilityV1 =
  | Readonly<{ editable: true; blocker: null }>
  | Readonly<{
      editable: false;
      blocker: Readonly<{
        code: 'operation-frozen' | 'field-unsupported';
        detail: string;
      }>;
    }>;

export type PatternImportDxfPhaseECadWorkbenchStitchEditCapabilitiesV1 = Readonly<
  Partial<
    Record<
      PatternImportDxfPhaseECadWorkbenchStitchEditorFieldV1,
      PatternImportDxfPhaseECadWorkbenchStitchEditCapabilityV1
    >
  >
>;

export type PatternImportDxfPhaseECadWorkbenchStitchRouteIntentV1 =
  | Readonly<{
      ok: true;
      schemaVersion: typeof PATTERN_IMPORT_DXF_PHASE_E_CAD_WORKBENCH_STITCH_ROUTE_INTENT_V1;
      field: PatternImportDxfPhaseECadWorkbenchStitchEditorFieldV1;
      search: string;
      blocker: null;
      claims: typeof PATTERN_IMPORT_DXF_PHASE_E_CAD_WORKBENCH_STITCH_ROUTE_INTENT_CLAIMS_V1;
    }>
  | Readonly<{
      ok: false;
      schemaVersion: typeof PATTERN_IMPORT_DXF_PHASE_E_CAD_WORKBENCH_STITCH_ROUTE_INTENT_V1;
      field: PatternImportDxfPhaseECadWorkbenchStitchEditorFieldV1;
      search: null;
      blocker: Readonly<{
        code: 'operation-frozen' | 'field-unsupported';
        detail: string;
      }>;
      claims: typeof PATTERN_IMPORT_DXF_PHASE_E_CAD_WORKBENCH_STITCH_ROUTE_INTENT_CLAIMS_V1;
    }>;

export const patternImportDxfPhaseECadWorkbenchStitchEditableV1 =
  (): PatternImportDxfPhaseECadWorkbenchStitchEditCapabilityV1 =>
    Object.freeze({ editable: true as const, blocker: null });

export function patternImportDxfPhaseECadWorkbenchStitchBlockedV1(
  code: 'operation-frozen' | 'field-unsupported',
  detail: string,
): PatternImportDxfPhaseECadWorkbenchStitchEditCapabilityV1 {
  return Object.freeze({ editable: false as const, blocker: Object.freeze({ code, detail }) });
}

const STITCH_EDITOR_FIELDS = Object.freeze([
  'type',
  'density',
  'gauge',
  'offset',
  'thread',
] as const satisfies readonly PatternImportDxfPhaseECadWorkbenchStitchEditorFieldV1[]);

/**
 * Projects the existing OperationEditor resolver into presentation capabilities. Keeping this
 * projection next to the route planner prevents the workbench from rendering a click target which
 * the one real editor would immediately reject.
 */
export function derivePatternImportDxfPhaseECadWorkbenchStitchEditCapabilitiesV1(
  context: PatternImportDxfPhaseECadWorkbenchStitchEditorContextV1,
): PatternImportDxfPhaseECadWorkbenchStitchEditCapabilitiesV1 {
  return Object.freeze(
    Object.fromEntries(
      STITCH_EDITOR_FIELDS.map((field) => {
        const handoff = resolvePatternImportDxfPhaseECadWorkbenchStitchEditorHandoffV1(
          field,
          context,
        );
        return [
          field,
          handoff.ok
            ? patternImportDxfPhaseECadWorkbenchStitchEditableV1()
            : patternImportDxfPhaseECadWorkbenchStitchBlockedV1(
                handoff.blocker.code === 'operation-frozen'
                  ? 'operation-frozen'
                  : 'field-unsupported',
                handoff.blocker.detail,
              ),
        ];
      }),
    ),
  );
}

/**
 * Plans a query-only handoff to the existing OperationEditor. The caller remains responsible for
 * applying `search` through its router; this function neither navigates nor mutates its input.
 */
export function planPatternImportDxfPhaseECadWorkbenchStitchRouteIntentV1(
  input: Readonly<{
    current: URLSearchParams | string;
    field: PatternImportDxfPhaseECadWorkbenchStitchEditorFieldV1;
    capability: PatternImportDxfPhaseECadWorkbenchStitchEditCapabilityV1 | null | undefined;
  }>,
): PatternImportDxfPhaseECadWorkbenchStitchRouteIntentV1 {
  const capability = input.capability;
  if (!capability?.editable) {
    const blocker = capability?.blocker ?? {
      code: 'field-unsupported' as const,
      detail: 'The selected operation does not expose this stitch field.',
    };
    return Object.freeze({
      ok: false as const,
      schemaVersion: PATTERN_IMPORT_DXF_PHASE_E_CAD_WORKBENCH_STITCH_ROUTE_INTENT_V1,
      field: input.field,
      search: null,
      blocker: Object.freeze(blocker),
      claims: PATTERN_IMPORT_DXF_PHASE_E_CAD_WORKBENCH_STITCH_ROUTE_INTENT_CLAIMS_V1,
    });
  }
  const next = new URLSearchParams(
    typeof input.current === 'string' ? input.current : input.current.toString(),
  );
  next.set('stitch', input.field);
  return Object.freeze({
    ok: true as const,
    schemaVersion: PATTERN_IMPORT_DXF_PHASE_E_CAD_WORKBENCH_STITCH_ROUTE_INTENT_V1,
    field: input.field,
    search: next.toString(),
    blocker: null,
    claims: PATTERN_IMPORT_DXF_PHASE_E_CAD_WORKBENCH_STITCH_ROUTE_INTENT_CLAIMS_V1,
  });
}
