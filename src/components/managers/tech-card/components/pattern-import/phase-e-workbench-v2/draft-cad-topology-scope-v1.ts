import {
  createPatternImportDxfPhaseEDraftCadTopologySessionV1,
  type PatternImportDxfPhaseEDraftCadTopologySessionV1,
} from './draft-cad-topology-session-v1';

export const PATTERN_IMPORT_DXF_PHASE_E_DRAFT_CAD_TOPOLOGY_SCOPE_V1 =
  'pattern-import-dxf-phase-e-draft-cad-topology-scope/1' as const;

export const PATTERN_IMPORT_DXF_PHASE_E_DRAFT_CAD_TOPOLOGY_SCOPE_CLAIMS_V1 = Object.freeze({
  callerOwnedPerMaterialScope: true,
  sourceIdentityExactMatchRequired: true,
  staleScopeOnlyReset: true,
  annotationsNeverTransferredAcrossScopes: true,
  remountRetentionRequiresCallerOwner: true,
  backendPersistenceClaimed: false,
  assemblyOperationsMutated: false,
  cadGeometryMutated: false,
  cadHistoryMutated: false,
} as const);

export type PatternImportDxfPhaseEDraftCadTopologyScopeV1 = Readonly<{
  schemaVersion: typeof PATTERN_IMPORT_DXF_PHASE_E_DRAFT_CAD_TOPOLOGY_SCOPE_V1;
  scopeKey: string;
  sourceIdentity: string;
  session: PatternImportDxfPhaseEDraftCadTopologySessionV1;
}>;

export type PatternImportDxfPhaseEDraftCadTopologyByScopeV1 = Readonly<
  Record<string, PatternImportDxfPhaseEDraftCadTopologyScopeV1>
>;

const STABLE_SCOPE = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,255}$/;

export function createPatternImportDxfPhaseEDraftCadTopologyScopeV1(
  scopeKey: string,
  sourceIdentity: string,
): PatternImportDxfPhaseEDraftCadTopologyScopeV1 {
  if (!STABLE_SCOPE.test(scopeKey) || !sourceIdentity)
    throw new TypeError('Topology retention requires one stable scope and source identity.');
  return Object.freeze({
    schemaVersion: PATTERN_IMPORT_DXF_PHASE_E_DRAFT_CAD_TOPOLOGY_SCOPE_V1,
    scopeKey,
    sourceIdentity,
    session: createPatternImportDxfPhaseEDraftCadTopologySessionV1(sourceIdentity),
  });
}

/**
 * Restores only an exact scope/source pair. A stale catalog/projection/source resets this scope,
 * while every sibling scope remains untouched in the caller-owned map.
 */
export function reconcilePatternImportDxfPhaseEDraftCadTopologyScopeV1(
  current: PatternImportDxfPhaseEDraftCadTopologyScopeV1 | null | undefined,
  scopeKey: string,
  sourceIdentity: string,
): PatternImportDxfPhaseEDraftCadTopologyScopeV1 {
  if (
    !current ||
    current.schemaVersion !== PATTERN_IMPORT_DXF_PHASE_E_DRAFT_CAD_TOPOLOGY_SCOPE_V1 ||
    current.scopeKey !== scopeKey ||
    current.sourceIdentity !== sourceIdentity ||
    current.session.sourceIdentity !== sourceIdentity
  )
    return createPatternImportDxfPhaseEDraftCadTopologyScopeV1(scopeKey, sourceIdentity);
  return current;
}

/** Publishes one exact session without reading or rewriting any sibling material scope. */
export function publishPatternImportDxfPhaseEDraftCadTopologyScopeV1(
  current: PatternImportDxfPhaseEDraftCadTopologyScopeV1,
  session: PatternImportDxfPhaseEDraftCadTopologySessionV1,
): PatternImportDxfPhaseEDraftCadTopologyScopeV1 {
  if (session.sourceIdentity !== current.sourceIdentity)
    return createPatternImportDxfPhaseEDraftCadTopologyScopeV1(
      current.scopeKey,
      current.sourceIdentity,
    );
  return Object.freeze({ ...current, session });
}

export function updatePatternImportDxfPhaseEDraftCadTopologyScopeMapV1(
  current: PatternImportDxfPhaseEDraftCadTopologyByScopeV1,
  scope: PatternImportDxfPhaseEDraftCadTopologyScopeV1,
): PatternImportDxfPhaseEDraftCadTopologyByScopeV1 {
  return Object.freeze({ ...current, [scope.scopeKey]: scope });
}

export function reconcilePatternImportDxfPhaseEDraftCadTopologyScopeMapV1(
  current: PatternImportDxfPhaseEDraftCadTopologyByScopeV1,
  scopeKey: string,
  sourceIdentity: string,
): Readonly<{
  map: PatternImportDxfPhaseEDraftCadTopologyByScopeV1;
  scope: PatternImportDxfPhaseEDraftCadTopologyScopeV1;
}> {
  const previous = current[scopeKey];
  const scope = reconcilePatternImportDxfPhaseEDraftCadTopologyScopeV1(
    previous,
    scopeKey,
    sourceIdentity,
  );
  return Object.freeze({
    map:
      scope === previous
        ? current
        : updatePatternImportDxfPhaseEDraftCadTopologyScopeMapV1(current, scope),
    scope,
  });
}
