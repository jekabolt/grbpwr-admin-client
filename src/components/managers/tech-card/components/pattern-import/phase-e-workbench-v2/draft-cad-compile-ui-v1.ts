import {
  compilePatternImportDxfPhaseEDraftCadGeometryV1,
  type PatternImportDxfPhaseEDraftCadGeometryCompileBlockerV1,
  type PatternImportDxfPhaseEDraftCadGeometryCompileInputV1,
  type PatternImportDxfPhaseEDraftCadGeometryCompileResultV1,
} from './draft-cad-geometry-compile-v1';
import type { PatternImportDxfPhaseEDraftCadToolV1 } from './draft-cad-session-v1';

export const PATTERN_IMPORT_DXF_PHASE_E_DRAFT_CAD_COMPILE_UI_V1 =
  'pattern-import-dxf-phase-e-draft-cad-compile-ui/1' as const;

export const PATTERN_IMPORT_DXF_PHASE_E_DRAFT_CAD_COMPILE_UI_CLAIMS_V1 = Object.freeze({
  explicitUserActionRequired: true,
  supportedSubsetOnly: true,
  typedBlockersRendered: true,
  receiptSessionOnly: true,
  receiptExplicitlyReleaseable: true,
  rawDxfTextStoredInUiState: false,
  rawDxfTextLogged: false,
  productionWritePerformed: false,
  applyAuthorityCreated: false,
  productionReady: false,
} as const);

export type PatternImportDxfPhaseEDraftCadCompileUiStateV1 =
  | Readonly<{
      schemaVersion: typeof PATTERN_IMPORT_DXF_PHASE_E_DRAFT_CAD_COMPILE_UI_V1;
      status: 'blocked';
      blockers: readonly PatternImportDxfPhaseEDraftCadGeometryCompileBlockerV1[];
      releaseable: true;
      claims: typeof PATTERN_IMPORT_DXF_PHASE_E_DRAFT_CAD_COMPILE_UI_CLAIMS_V1;
    }>
  | Readonly<{
      schemaVersion: typeof PATTERN_IMPORT_DXF_PHASE_E_DRAFT_CAD_COMPILE_UI_V1;
      status: 'compiled-reimport-required';
      receipt: Readonly<{
        sourceRevision: number;
        techCardId: number;
        scopeKey: string;
        sizeToken: string;
        featureCount: number;
        tools: readonly Readonly<{
          tool: PatternImportDxfPhaseEDraftCadToolV1;
          count: number;
        }>[];
        warningCount: number;
        reimportBoundary: 'ordinary-import-semantics-phase-d-phase-e';
        applyEligible: false;
      }>;
      blockers: readonly [];
      releaseable: true;
      claims: typeof PATTERN_IMPORT_DXF_PHASE_E_DRAFT_CAD_COMPILE_UI_CLAIMS_V1;
    }>;

type GeometryCompiler = (
  input: PatternImportDxfPhaseEDraftCadGeometryCompileInputV1,
) => PatternImportDxfPhaseEDraftCadGeometryCompileResultV1;

function deepFreeze<T>(value: T, seen = new Set<object>()): T {
  if (!value || typeof value !== 'object' || seen.has(value) || Object.isFrozen(value))
    return value;
  seen.add(value);
  for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child, seen);
  return Object.freeze(value);
}

/** Runs the compiler and immediately projects away DXF text and the detached writer job. */
export function executePatternImportDxfPhaseEDraftCadCompileUiActionV1(
  input: PatternImportDxfPhaseEDraftCadGeometryCompileInputV1,
  compile: GeometryCompiler = compilePatternImportDxfPhaseEDraftCadGeometryV1,
  onCompiledArtifact?: (
    artifact: Extract<
      PatternImportDxfPhaseEDraftCadGeometryCompileResultV1,
      { ok: true }
    >['artifact'],
  ) => void,
): PatternImportDxfPhaseEDraftCadCompileUiStateV1 {
  const result = compile(input);
  if (!result.ok)
    return deepFreeze({
      schemaVersion: PATTERN_IMPORT_DXF_PHASE_E_DRAFT_CAD_COMPILE_UI_V1,
      status: 'blocked' as const,
      blockers: result.blockers.map((blocker) => ({ ...blocker })),
      releaseable: true as const,
      claims: PATTERN_IMPORT_DXF_PHASE_E_DRAFT_CAD_COMPILE_UI_CLAIMS_V1,
    });

  onCompiledArtifact?.(result.artifact);

  const counts = new Map<PatternImportDxfPhaseEDraftCadToolV1, number>();
  for (const { tool } of result.artifact.compiledFeatures)
    counts.set(tool, (counts.get(tool) ?? 0) + 1);
  return deepFreeze({
    schemaVersion: PATTERN_IMPORT_DXF_PHASE_E_DRAFT_CAD_COMPILE_UI_V1,
    status: 'compiled-reimport-required' as const,
    receipt: {
      sourceRevision: result.artifact.source.revision,
      techCardId: result.artifact.scope.techCardId,
      scopeKey: result.artifact.scope.scopeKey,
      sizeToken: result.artifact.scope.sizeToken,
      featureCount: result.artifact.compiledFeatures.length,
      tools: [...counts].map(([tool, count]) => ({ tool, count })),
      warningCount: result.artifact.warnings.length,
      reimportBoundary: result.artifact.reimport.boundary,
      applyEligible: false as const,
    },
    blockers: [] as const,
    releaseable: true as const,
    claims: PATTERN_IMPORT_DXF_PHASE_E_DRAFT_CAD_COMPILE_UI_CLAIMS_V1,
  });
}
