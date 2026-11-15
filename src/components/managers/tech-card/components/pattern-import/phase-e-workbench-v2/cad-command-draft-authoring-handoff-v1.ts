import type { WorkCatalog } from '../../operation-work';

import type { PatternImportDxfPhaseECadTableCurrentOperationV1 } from './cad-table-draft-operation-planner-v1';
import {
  compilePatternImportDxfPhaseECadSemanticOperationsV1,
  type PatternImportDxfPhaseECadSemanticOperationCompileBlockerV1,
  type PatternImportDxfPhaseECadSemanticOperationRowV1,
  type PatternImportDxfPhaseECadSemanticReimportReceiptV1,
} from './cad-command-semantic-operation-compile-v1';
import {
  PATTERN_IMPORT_DXF_PHASE_E_CAD_COMMAND_DRAFT_PLAN_V1,
  type PatternImportDxfPhaseECadCommandDraftResultV1,
  type PatternImportDxfPhaseECadCommandDraftV1,
} from './cad-table-draft-operation-session-bridge-v1';

export const PATTERN_IMPORT_DXF_PHASE_E_CAD_COMMAND_AUTHORING_HANDOFF_V1 =
  'pattern-import-dxf-phase-e-cad-command-authoring-handoff/1' as const;

export const PATTERN_IMPORT_DXF_PHASE_E_CAD_COMMAND_AUTHORING_HANDOFF_CLAIMS_V1 = Object.freeze({
  existingOperationsFieldIsSoleWriter: true,
  appendsOneAtomicBatch: true,
  createsNetworkWriter: false,
  requestsAutosave: false,
  stableDraftIdsBecomeHistoryKeys: true,
  dependenciesAndParametersRetainedInNote: true,
  exactReimportReceiptRequiredForVerifiedSemantics: true,
  sessionOnlyDraftAppendRetained: true,
  workCatalogSemanticsReused: true,
  genericHandworkAlwaysUsed: false,
  sourceBecomesImmutableAfterAcceptedHandoff: true,
  productionReady: false,
} as const);

export type PatternImportDxfPhaseECadCommandAuthoringDraftRowV1 = Readonly<{
  historyKey: string;
  draft: true;
  operationType: PatternImportDxfPhaseECadSemanticOperationRowV1['operationType'];
  zone: string;
  work: string;
  inputKeys: readonly [string];
  note: string;
}>;

export type PatternImportDxfPhaseECadCommandAuthoringHandoffRequestV1 = Readonly<{
  schemaVersion: typeof PATTERN_IMPORT_DXF_PHASE_E_CAD_COMMAND_AUTHORING_HANDOFF_V1;
  sourceRevision: number;
  operationRef: string;
  operationNumber: number;
  assemblyRevision: string;
  selectedDraftIds: readonly string[];
  candidates: PatternImportDxfPhaseECadCommandDraftResultV1;
}>;

export type PatternImportDxfPhaseECadCommandAuthoringHandoffBlockerV1 = Readonly<{
  code:
    | 'authoring-owner-unavailable'
    | 'authoring-owner-frozen'
    | 'authoring-source-immutable'
    | 'authoring-source-stale'
    | 'authoring-assembly-stale'
    | 'authoring-operation-mismatch'
    | 'authoring-selection-empty'
    | 'authoring-candidate-duplicate'
    | 'authoring-candidate-missing'
    | 'authoring-dependency-orphan'
    | 'authoring-mapping-unsupported'
    | PatternImportDxfPhaseECadSemanticOperationCompileBlockerV1['code'];
  detail: string;
}>;

export type PatternImportDxfPhaseECadCommandAuthoringHandoffResultV1 =
  | Readonly<{
      ok: true;
      inserted: number;
      draftOperationIds: readonly string[];
      sourceRevision: number;
      blocker: null;
    }>
  | Readonly<{
      ok: false;
      inserted: 0;
      draftOperationIds: readonly [];
      sourceRevision: number | null;
      blocker: PatternImportDxfPhaseECadCommandAuthoringHandoffBlockerV1;
    }>;

export type PatternImportDxfPhaseECadCommandAuthoringHandoffOwnerV1 =
  | Readonly<{
      status: 'available';
      operationNumber: number;
      assemblyRevision: string;
      ingest: (
        request: PatternImportDxfPhaseECadCommandAuthoringHandoffRequestV1,
      ) => PatternImportDxfPhaseECadCommandAuthoringHandoffResultV1;
    }>
  | Readonly<{
      status: 'unavailable';
      blocker: PatternImportDxfPhaseECadCommandAuthoringHandoffBlockerV1;
    }>;

type PrepareInput = Readonly<{
  request: PatternImportDxfPhaseECadCommandAuthoringHandoffRequestV1;
  currentOperation: PatternImportDxfPhaseECadTableCurrentOperationV1;
  existingHistoryKeys: readonly string[];
  workCatalog: WorkCatalog;
  /** Owner evidence only. Session/compile UI state is intentionally insufficient. */
  reimportReceipt: PatternImportDxfPhaseECadSemanticReimportReceiptV1 | null;
}>;

export type PatternImportDxfPhaseECadCommandAuthoringPreparationV1 =
  | Readonly<{
      ok: true;
      rows: readonly PatternImportDxfPhaseECadCommandAuthoringDraftRowV1[];
      draftOperationIds: readonly string[];
      blocker: null;
    }>
  | Readonly<{
      ok: false;
      rows: null;
      draftOperationIds: readonly [];
      blocker: PatternImportDxfPhaseECadCommandAuthoringHandoffBlockerV1;
    }>;

function blocked(
  code: PatternImportDxfPhaseECadCommandAuthoringHandoffBlockerV1['code'],
  detail: string,
): Extract<PatternImportDxfPhaseECadCommandAuthoringPreparationV1, { ok: false }> {
  return Object.freeze({
    ok: false as const,
    rows: null,
    draftOperationIds: Object.freeze([]) as readonly [],
    blocker: Object.freeze({ code, detail }),
  });
}

/** Exact local revision of the live Assembly Order row consumed by the CAD plan. */
export function revisionOfPatternImportDxfPhaseECadCommandAuthoringOperationV1(
  operation: PatternImportDxfPhaseECadTableCurrentOperationV1,
): string {
  return JSON.stringify(operation);
}

export function noteOfPatternImportDxfPhaseECadCommandDraftV1(
  draft: PatternImportDxfPhaseECadCommandDraftV1,
  semantic: PatternImportDxfPhaseECadSemanticOperationRowV1,
  receipt: PatternImportDxfPhaseECadSemanticReimportReceiptV1 | null,
): string {
  const dependencies = draft.dependsOnDraftIds.length ? draft.dependsOnDraftIds.join(', ') : 'none';
  const parameters = draft.parameters.length
    ? draft.parameters.map(({ label, value }) => `${label}: ${value}`).join(' · ')
    : 'none';
  return [
    `CAD pattern edit · ${draft.label}`,
    `Draft ID: ${draft.draftOperationId}`,
    `Source: revision ${draft.sourceRevision} · ${draft.transactionLabel}`,
    `Target: ${draft.target.pieceLineKey} (${draft.target.pieceId})`,
    `Semantic: ${semantic.semanticTool} → ${semantic.work}`,
    receipt
      ? `Persistence: verified re-import ${receipt.reimported.sourceFileId} · ${receipt.compiledDxfSha256}`
      : 'Persistence: pending · session-only draft; compile and re-import through the ordinary import boundary',
    `Depends on: ${dependencies}`,
    `Parameters: ${parameters}`,
  ].join('\n');
}

/**
 * Revalidates a selected batch at the existing form owner boundary. Nothing is written unless the
 * complete batch passes; the caller then gives the returned rows to one `useFieldArray.append`.
 */
export function preparePatternImportDxfPhaseECadCommandAuthoringHandoffV1(
  input: PrepareInput,
): PatternImportDxfPhaseECadCommandAuthoringPreparationV1 {
  const { request, currentOperation } = input;
  if (
    request.schemaVersion !== PATTERN_IMPORT_DXF_PHASE_E_CAD_COMMAND_AUTHORING_HANDOFF_V1 ||
    request.candidates.schemaVersion !== PATTERN_IMPORT_DXF_PHASE_E_CAD_COMMAND_DRAFT_PLAN_V1 ||
    !request.candidates.ok
  )
    return blocked(
      'authoring-mapping-unsupported',
      'The CAD candidate plan is blocked or uses an unsupported handoff schema.',
    );
  if (request.operationNumber !== currentOperation.operationNumber || request.operationNumber <= 0)
    return blocked(
      'authoring-operation-mismatch',
      'The selected Assembly Order operation changed before the handoff.',
    );
  if (
    request.assemblyRevision !==
    revisionOfPatternImportDxfPhaseECadCommandAuthoringOperationV1(currentOperation)
  )
    return blocked(
      'authoring-assembly-stale',
      'The Assembly Order row changed after these CAD candidates were prepared.',
    );
  if (!Number.isSafeInteger(request.sourceRevision) || request.sourceRevision < 1)
    return blocked('authoring-source-stale', 'The CAD source revision is invalid.');
  if (!request.selectedDraftIds.length)
    return blocked('authoring-selection-empty', 'Choose at least one Pattern edit to hand off.');

  const candidates = request.candidates.drafts;
  const byId = new Map<string, PatternImportDxfPhaseECadCommandDraftV1>();
  for (const candidate of candidates) {
    if (byId.has(candidate.draftOperationId))
      return blocked(
        'authoring-candidate-duplicate',
        `Duplicate CAD draft identity ${candidate.draftOperationId}.`,
      );
    byId.set(candidate.draftOperationId, candidate);
  }
  const selected = new Set<string>();
  for (const id of request.selectedDraftIds) {
    if (selected.has(id))
      return blocked('authoring-candidate-duplicate', `CAD draft ${id} was selected twice.`);
    selected.add(id);
  }
  const existing = new Set(input.existingHistoryKeys.filter(Boolean));
  const selectedDrafts: PatternImportDxfPhaseECadCommandDraftV1[] = [];
  for (const id of request.selectedDraftIds) {
    const draft = byId.get(id);
    if (!draft)
      return blocked('authoring-candidate-missing', `CAD draft ${id} is no longer current.`);
    if (
      draft.sourceRevision !== request.sourceRevision ||
      draft.operationNumber !== request.operationNumber ||
      draft.operationRef !== request.operationRef
    )
      return blocked(
        'authoring-source-stale',
        `CAD draft ${id} belongs to another source or Assembly operation revision.`,
      );
    if (existing.has(id))
      return blocked(
        'authoring-candidate-duplicate',
        `Assembly Order already contains CAD draft ${id}.`,
      );
    if (draft.dependsOnDraftIds.some((dependency) => !selected.has(dependency)))
      return blocked(
        'authoring-dependency-orphan',
        `${draft.label} requires its Cut dependency in the same atomic batch.`,
      );
    if (!['construct', 'detail', 'dart', 'cut', 'spread'].includes(draft.processKind))
      return blocked(
        'authoring-mapping-unsupported',
        `${draft.processKind} has no existing Assembly Order draft mapping.`,
      );
    selectedDrafts.push(draft);
  }
  const semantic = compilePatternImportDxfPhaseECadSemanticOperationsV1({
    drafts: selectedDrafts,
    currentOperation,
    workCatalog: input.workCatalog,
    reimportReceipt: input.reimportReceipt,
  });
  if (!semantic.ok) return blocked(semantic.blocker.code, semantic.blocker.detail);
  const semanticByHistoryKey = new Map(semantic.rows.map((row) => [row.historyKey, row]));
  const rows: PatternImportDxfPhaseECadCommandAuthoringDraftRowV1[] = [];
  for (const draft of selectedDrafts) {
    const semanticRow = semanticByHistoryKey.get(draft.draftOperationId);
    if (!semanticRow)
      return blocked(
        'authoring-mapping-unsupported',
        `CAD draft ${draft.draftOperationId} has no exact semantic operation row.`,
      );
    rows.push(
      Object.freeze({
        historyKey: draft.draftOperationId,
        draft: true as const,
        operationType: semanticRow.operationType,
        zone: semanticRow.zone,
        work: semanticRow.work,
        inputKeys: Object.freeze([draft.target.pieceLineKey]) as readonly [string],
        note: noteOfPatternImportDxfPhaseECadCommandDraftV1(draft, semanticRow, semantic.receipt),
      }),
    );
  }
  return Object.freeze({
    ok: true as const,
    rows: Object.freeze(rows),
    draftOperationIds: Object.freeze(rows.map(({ historyKey }) => historyKey)),
    blocker: null,
  });
}
