import type { PatternImportDxfPhaseEDraftCadGeometryCompileArtifactV1 } from './draft-cad-geometry-compile-v1';
import {
  createPatternImportDxfPhaseECadSemanticCompiledCorrelationV1,
  createPatternImportDxfPhaseECadSemanticReimportReceiptFromCorrelationV1,
  type PatternImportDxfPhaseECadSemanticCompiledCorrelationV1,
  type PatternImportDxfPhaseECadSemanticOperationCompileBlockerV1,
  type PatternImportDxfPhaseECadSemanticReimportReceiptV1,
} from './cad-command-semantic-operation-compile-v1';

export const PATTERN_IMPORT_DXF_PHASE_E_CAD_SEMANTIC_REIMPORT_SESSION_OWNER_V1 =
  'pattern-import-dxf-phase-e-cad-semantic-reimport-session-owner/1' as const;

export const PATTERN_IMPORT_DXF_PHASE_E_CAD_SEMANTIC_REIMPORT_SESSION_OWNER_CLAIMS_V1 =
  Object.freeze({
    cardLifetimeMemoryOnly: true,
    survivesReload: false,
    rawDxfRetained: false,
    confirmedFreshImportRequired: true,
    newerImportGenerationRequired: true,
    compiledAndFreshHashesMustMatch: true,
    freshCatalogAndSelectionHashesRequired: true,
    writesNetwork: false,
    writesOperations: false,
  } as const);

export type PatternImportDxfPhaseECadSemanticReimportSessionSnapshotV1 = Readonly<{
  schemaVersion: typeof PATTERN_IMPORT_DXF_PHASE_E_CAD_SEMANTIC_REIMPORT_SESSION_OWNER_V1;
  revision: number;
  correlations: readonly PatternImportDxfPhaseECadSemanticCompiledCorrelationV1[];
  receipts: readonly PatternImportDxfPhaseECadSemanticReimportReceiptV1[];
  blocker: PatternImportDxfPhaseECadSemanticOperationCompileBlockerV1 | null;
  claims: typeof PATTERN_IMPORT_DXF_PHASE_E_CAD_SEMANTIC_REIMPORT_SESSION_OWNER_CLAIMS_V1;
}>;

const EMPTY = Object.freeze([]) as readonly never[];
const states = new Map<
  number,
  {
    revision: number;
    correlations: Map<
      string,
      Readonly<{
        correlation: PatternImportDxfPhaseECadSemanticCompiledCorrelationV1;
        confirmedImportGenerationAtCompile: number;
      }>
    >;
    receipts: Map<string, PatternImportDxfPhaseECadSemanticReimportReceiptV1>;
    blocker: PatternImportDxfPhaseECadSemanticOperationCompileBlockerV1 | null;
  }
>();
const listeners = new Map<number, Set<() => void>>();

function keyOf(correlation: PatternImportDxfPhaseECadSemanticCompiledCorrelationV1): string {
  return [
    correlation.sourceRevision,
    correlation.scope.scopeKey,
    correlation.scope.sizeToken,
    correlation.source.catalogCanonicalSha256,
    correlation.source.sizeSelectionCanonicalSha256,
  ].join('\u0000');
}

function stateOf(techCardId: number) {
  const current = states.get(techCardId);
  if (current) return current;
  const created = {
    revision: 0,
    correlations: new Map<
      string,
      Readonly<{
        correlation: PatternImportDxfPhaseECadSemanticCompiledCorrelationV1;
        confirmedImportGenerationAtCompile: number;
      }>
    >(),
    receipts: new Map<string, PatternImportDxfPhaseECadSemanticReimportReceiptV1>(),
    blocker: null,
  };
  states.set(techCardId, created);
  return created;
}

function publish(techCardId: number): void {
  const state = stateOf(techCardId);
  state.revision += 1;
  for (const listener of listeners.get(techCardId) ?? []) listener();
}

export function subscribePatternImportDxfPhaseECadSemanticReimportSessionV1(
  techCardId: number | undefined,
  listener: () => void,
): () => void {
  if (!techCardId || !Number.isSafeInteger(techCardId) || techCardId < 1) return () => {};
  const current = listeners.get(techCardId) ?? new Set<() => void>();
  current.add(listener);
  listeners.set(techCardId, current);
  return () => {
    current.delete(listener);
    if (!current.size) listeners.delete(techCardId);
  };
}

export function readPatternImportDxfPhaseECadSemanticReimportSessionV1(
  techCardId: number | undefined,
): PatternImportDxfPhaseECadSemanticReimportSessionSnapshotV1 {
  const current = techCardId ? states.get(techCardId) : null;
  return Object.freeze({
    schemaVersion: PATTERN_IMPORT_DXF_PHASE_E_CAD_SEMANTIC_REIMPORT_SESSION_OWNER_V1,
    revision: current?.revision ?? 0,
    correlations: current
      ? Object.freeze([...current.correlations.values()].map(({ correlation }) => correlation))
      : EMPTY,
    receipts: current ? Object.freeze([...current.receipts.values()]) : EMPTY,
    blocker: current?.blocker ?? null,
    claims: PATTERN_IMPORT_DXF_PHASE_E_CAD_SEMANTIC_REIMPORT_SESSION_OWNER_CLAIMS_V1,
  });
}

/** Hashes then immediately drops raw compiler output before publishing card-session evidence. */
export async function stagePatternImportDxfPhaseECadSemanticCompiledArtifactV1(
  artifact: PatternImportDxfPhaseEDraftCadGeometryCompileArtifactV1,
  owner: Readonly<{ confirmedImportGenerationAtCompile: number }>,
  crypto?: Pick<Crypto, 'subtle'>,
): Promise<boolean> {
  const correlated = await createPatternImportDxfPhaseECadSemanticCompiledCorrelationV1(
    artifact,
    crypto,
  );
  const techCardId = artifact.scope.techCardId;
  if (!Number.isSafeInteger(techCardId) || techCardId < 1) return false;
  if (
    !Number.isSafeInteger(owner.confirmedImportGenerationAtCompile) ||
    owner.confirmedImportGenerationAtCompile < 0
  )
    return false;
  const state = stateOf(techCardId);
  if (!correlated.ok) {
    state.blocker = correlated.blocker;
    publish(techCardId);
    return false;
  }
  state.correlations.set(
    keyOf(correlated.correlation),
    Object.freeze({
      correlation: correlated.correlation,
      confirmedImportGenerationAtCompile: owner.confirmedImportGenerationAtCompile,
    }),
  );
  state.blocker = null;
  publish(techCardId);
  return true;
}

/**
 * Accepts only a fresh, already-confirmed ordinary import generation. A reload has no compiled
 * correlation in this owner and therefore cannot invent a verified receipt from saved rows.
 */
export function confirmPatternImportDxfPhaseECadSemanticFreshReimportV1(
  input: Readonly<{
    importGeneration: number;
    reimported: PatternImportDxfPhaseECadSemanticReimportReceiptV1['reimported'];
  }>,
): readonly PatternImportDxfPhaseECadSemanticReimportReceiptV1[] {
  const { reimported, importGeneration } = input;
  const state = states.get(reimported.techCardId);
  if (!state) return EMPTY;
  const confirmed: PatternImportDxfPhaseECadSemanticReimportReceiptV1[] = [];
  let mismatch: PatternImportDxfPhaseECadSemanticOperationCompileBlockerV1 | null = null;
  for (const entry of state.correlations.values()) {
    const { correlation, confirmedImportGenerationAtCompile } = entry;
    if (
      correlation.scope.scopeKey !== reimported.scopeKey ||
      correlation.scope.sizeToken !== reimported.sizeToken ||
      importGeneration <= confirmedImportGenerationAtCompile
    )
      continue;
    const result = createPatternImportDxfPhaseECadSemanticReimportReceiptFromCorrelationV1({
      correlation,
      reimported,
    });
    if (!result.ok) {
      mismatch = result.blocker;
      continue;
    }
    const key = keyOf(correlation);
    if (!state.receipts.has(key)) {
      state.receipts.set(key, result.receipt);
      confirmed.push(result.receipt);
    }
  }
  state.blocker = mismatch;
  if (confirmed.length || mismatch) publish(reimported.techCardId);
  return Object.freeze(confirmed);
}

/** Test/card teardown only; production never reconstructs evidence after this boundary. */
export function clearPatternImportDxfPhaseECadSemanticReimportSessionV1(
  techCardId: number | undefined,
): void {
  if (!techCardId) return;
  if (!states.delete(techCardId)) return;
  for (const listener of listeners.get(techCardId) ?? []) listener();
}
