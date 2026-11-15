import type { WorkCatalog } from '../../operation-work';

import type { PatternImportDxfPhaseECadTableCurrentOperationV1 } from './cad-table-draft-operation-planner-v1';
import type {
  PatternImportDxfPhaseECadCommandAuthoringHandoffRequestV1,
  PatternImportDxfPhaseECadCommandAuthoringDraftRowV1,
} from './cad-command-draft-authoring-handoff-v1';
import { noteOfPatternImportDxfPhaseECadCommandDraftV1 } from './cad-command-draft-authoring-handoff-v1';
import {
  compilePatternImportDxfPhaseECadSemanticOperationsV1,
  type PatternImportDxfPhaseECadSemanticOperationCompileBlockerV1,
  type PatternImportDxfPhaseECadSemanticReimportReceiptV1,
} from './cad-command-semantic-operation-compile-v1';
import type { PatternImportDxfPhaseECadCommandDraftV1 } from './cad-table-draft-operation-session-bridge-v1';

export const PATTERN_IMPORT_DXF_PHASE_E_CAD_SEMANTIC_OPERATION_UPGRADE_V1 =
  'pattern-import-dxf-phase-e-cad-semantic-operation-upgrade/1' as const;

export const PATTERN_IMPORT_DXF_PHASE_E_CAD_SEMANTIC_OPERATION_UPGRADE_CLAIMS_V1 = Object.freeze({
  existingRowsUpdatedByHistoryKey: true,
  appendsRows: false,
  duplicateHistoryKeyFailsClosed: true,
  pendingMarkerRequired: true,
  exactReceiptRequired: true,
  reloadCanReconstructPendingEvidence: false,
  requestsAutosave: false,
  writesNetwork: false,
} as const);

export type PatternImportDxfPhaseECadSemanticPendingUpgradeV1 = Readonly<{
  schemaVersion: typeof PATTERN_IMPORT_DXF_PHASE_E_CAD_SEMANTIC_OPERATION_UPGRADE_V1;
  sourceRevision: number;
  currentOperation: PatternImportDxfPhaseECadTableCurrentOperationV1;
  drafts: readonly PatternImportDxfPhaseECadCommandDraftV1[];
  historyKeys: readonly string[];
}>;

export type PatternImportDxfPhaseECadSemanticUpgradeLiveRowV1 = Readonly<{
  historyKey?: string;
  draft?: boolean;
  operationType?: string;
  work?: string;
  note?: string;
}>;

export type PatternImportDxfPhaseECadSemanticOperationUpgradeBlockerV1 = Readonly<{
  code:
    | 'cad-semantic-upgrade-pending-evidence-unavailable'
    | 'cad-semantic-upgrade-reimport-receipt-unavailable'
    | 'cad-semantic-upgrade-live-row-missing'
    | 'cad-semantic-upgrade-live-row-ambiguous'
    | 'cad-semantic-upgrade-live-row-ineligible'
    | PatternImportDxfPhaseECadSemanticOperationCompileBlockerV1['code'];
  detail: string;
}>;

export type PatternImportDxfPhaseECadSemanticOperationUpgradePlanV1 =
  | Readonly<{
      ok: true;
      status: 'ready';
      updates: readonly Readonly<{
        index: number;
        historyKey: string;
        operationType: PatternImportDxfPhaseECadCommandAuthoringDraftRowV1['operationType'];
        work: string;
        note: string;
      }>[];
      blocker: null;
      claims: typeof PATTERN_IMPORT_DXF_PHASE_E_CAD_SEMANTIC_OPERATION_UPGRADE_CLAIMS_V1;
    }>
  | Readonly<{
      ok: true;
      status: 'already-verified';
      updates: readonly [];
      blocker: null;
      claims: typeof PATTERN_IMPORT_DXF_PHASE_E_CAD_SEMANTIC_OPERATION_UPGRADE_CLAIMS_V1;
    }>
  | Readonly<{
      ok: false;
      status: 'blocked';
      updates: null;
      blocker: PatternImportDxfPhaseECadSemanticOperationUpgradeBlockerV1;
      claims: typeof PATTERN_IMPORT_DXF_PHASE_E_CAD_SEMANTIC_OPERATION_UPGRADE_CLAIMS_V1;
    }>;

function blocked(
  code: PatternImportDxfPhaseECadSemanticOperationUpgradeBlockerV1['code'],
  detail: string,
): Extract<PatternImportDxfPhaseECadSemanticOperationUpgradePlanV1, { ok: false }> {
  return Object.freeze({
    ok: false as const,
    status: 'blocked' as const,
    updates: null,
    blocker: Object.freeze({ code, detail }),
    claims: PATTERN_IMPORT_DXF_PHASE_E_CAD_SEMANTIC_OPERATION_UPGRADE_CLAIMS_V1,
  });
}

/** Captures exact candidate evidence only at the accepted immediate handoff boundary. */
export function capturePatternImportDxfPhaseECadSemanticPendingUpgradeV1(
  request: PatternImportDxfPhaseECadCommandAuthoringHandoffRequestV1,
  currentOperation: PatternImportDxfPhaseECadTableCurrentOperationV1,
): PatternImportDxfPhaseECadSemanticPendingUpgradeV1 | null {
  if (!request.candidates.ok || !request.selectedDraftIds.length) return null;
  const byId = new Map(request.candidates.drafts.map((draft) => [draft.draftOperationId, draft]));
  const drafts = request.selectedDraftIds.map((id) => byId.get(id));
  if (
    drafts.some((draft) => !draft) ||
    new Set(request.selectedDraftIds).size !== request.selectedDraftIds.length ||
    drafts.some(
      (draft) =>
        draft?.sourceRevision !== request.sourceRevision ||
        draft.operationNumber !== currentOperation.operationNumber,
    )
  )
    return null;
  return Object.freeze({
    schemaVersion: PATTERN_IMPORT_DXF_PHASE_E_CAD_SEMANTIC_OPERATION_UPGRADE_V1,
    sourceRevision: request.sourceRevision,
    currentOperation: structuredClone(currentOperation),
    drafts: Object.freeze(drafts.map((draft) => structuredClone(draft!))),
    historyKeys: Object.freeze([...request.selectedDraftIds]),
  });
}

/** Plans one in-place batch. The sole form owner applies returned indices without appending. */
export function planPatternImportDxfPhaseECadSemanticOperationUpgradeV1(
  input: Readonly<{
    pending: PatternImportDxfPhaseECadSemanticPendingUpgradeV1 | null;
    receipt: PatternImportDxfPhaseECadSemanticReimportReceiptV1 | null;
    liveRows: readonly PatternImportDxfPhaseECadSemanticUpgradeLiveRowV1[];
    workCatalog: WorkCatalog;
  }>,
): PatternImportDxfPhaseECadSemanticOperationUpgradePlanV1 {
  const { pending, receipt } = input;
  if (!pending)
    return blocked(
      'cad-semantic-upgrade-pending-evidence-unavailable',
      'Exact same-session CAD draft evidence is unavailable; a reload cannot reconstruct it.',
    );
  if (!receipt)
    return blocked(
      'cad-semantic-upgrade-reimport-receipt-unavailable',
      'Compile and confirm the generated DXF through the ordinary import pipeline in this card session.',
    );
  const semantic = compilePatternImportDxfPhaseECadSemanticOperationsV1({
    drafts: pending.drafts,
    currentOperation: pending.currentOperation,
    workCatalog: input.workCatalog,
    reimportReceipt: receipt,
  });
  if (!semantic.ok) return blocked(semantic.blocker.code, semantic.blocker.detail);
  const semanticByKey = new Map(semantic.rows.map((row) => [row.historyKey, row]));
  const updates: Extract<
    PatternImportDxfPhaseECadSemanticOperationUpgradePlanV1,
    { ok: true; status: 'ready' }
  >['updates'][number][] = [];
  let alreadyVerified = 0;
  for (const draft of pending.drafts) {
    const matches = input.liveRows
      .map((row, index) => ({ row, index }))
      .filter(({ row }) => row.historyKey === draft.draftOperationId);
    if (!matches.length)
      return blocked(
        'cad-semantic-upgrade-live-row-missing',
        `Assembly Order no longer contains CAD draft ${draft.draftOperationId}.`,
      );
    if (matches.length !== 1)
      return blocked(
        'cad-semantic-upgrade-live-row-ambiguous',
        `Assembly Order contains CAD draft ${draft.draftOperationId} more than once.`,
      );
    const { row, index } = matches[0]!;
    const semanticRow = semanticByKey.get(draft.draftOperationId);
    if (!semanticRow)
      return blocked(
        'cad-semantic-upgrade-live-row-ineligible',
        `Verified semantics are unavailable for CAD draft ${draft.draftOperationId}.`,
      );
    const note = noteOfPatternImportDxfPhaseECadCommandDraftV1(draft, semanticRow, receipt);
    if (
      row.draft === true &&
      row.operationType === semanticRow.operationType &&
      row.work === semanticRow.work &&
      row.note === note
    ) {
      alreadyVerified += 1;
      continue;
    }
    if (
      row.draft !== true ||
      !row.note?.includes(`Draft ID: ${draft.draftOperationId}`) ||
      !row.note.includes('Persistence: pending · session-only draft')
    )
      return blocked(
        'cad-semantic-upgrade-live-row-ineligible',
        `CAD draft ${draft.draftOperationId} was edited, ratified or no longer has its pending persistence marker.`,
      );
    updates.push(
      Object.freeze({
        index,
        historyKey: draft.draftOperationId,
        operationType: semanticRow.operationType,
        work: semanticRow.work,
        note,
      }),
    );
  }
  if (alreadyVerified === pending.drafts.length)
    return Object.freeze({
      ok: true as const,
      status: 'already-verified' as const,
      updates: Object.freeze([]) as readonly [],
      blocker: null,
      claims: PATTERN_IMPORT_DXF_PHASE_E_CAD_SEMANTIC_OPERATION_UPGRADE_CLAIMS_V1,
    });
  if (alreadyVerified)
    return blocked(
      'cad-semantic-upgrade-live-row-ineligible',
      'Only part of the exact CAD batch is already verified; the upgrade refuses a partial rewrite.',
    );
  return Object.freeze({
    ok: true as const,
    status: 'ready' as const,
    updates: Object.freeze(updates),
    blocker: null,
    claims: PATTERN_IMPORT_DXF_PHASE_E_CAD_SEMANTIC_OPERATION_UPGRADE_CLAIMS_V1,
  });
}
