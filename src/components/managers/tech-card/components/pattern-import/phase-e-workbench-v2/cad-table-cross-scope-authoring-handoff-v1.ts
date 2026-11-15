import type { PieceGeom } from 'lib/assembly-skeleton/types';
import type { StoredSeam, StoredSeamDirection } from 'lib/seams';

import type { StrictSeamUpsertResult } from '../../assembly-seams/use-seam-decisions';
import type { PatternImportDxfPhaseECadMaterialScopePreparationResultV1 } from './cad-material-scope-preparation-v1';
import {
  buildPatternImportDxfPhaseECadTableCrossScopeConnectCandidateV1,
  type PatternImportDxfPhaseECadTableCrossScopeConnectCandidateV1,
  type PatternImportDxfPhaseECadTableCrossScopeConnectSideV1,
} from './cad-table-cross-scope-connect-v1';
import {
  completePatternImportDxfPhaseECadTableCrossScopeStoredSeamV1,
  planPatternImportDxfPhaseECadTableCrossScopeOperationAttachV1,
  preparePatternImportDxfPhaseECadTableCrossScopeStoredSeamV1,
  type PatternImportDxfPhaseECadTableCrossScopeOperationV1,
  type PatternImportDxfPhaseECadTableCrossScopeStoredSeamBlockerV1,
} from './cad-table-cross-scope-stored-seam-owner-v1';

export const PATTERN_IMPORT_DXF_PHASE_E_CAD_TABLE_CROSS_SCOPE_AUTHORING_HANDOFF_V1 =
  'pattern-import-dxf-phase-e-cad-table-cross-scope-authoring-handoff/1' as const;

export const PATTERN_IMPORT_DXF_PHASE_E_CAD_TABLE_CROSS_SCOPE_AUTHORING_HANDOFF_CLAIMS_V1 =
  Object.freeze({
    existingOperationsFieldIsSoleOperationOwner: true,
    existingStrictSeamWriterReused: true,
    positiveSavedOperationNumberRequired: true,
    currentHistoryKeyRequired: true,
    exactTwoInputKeysRequired: true,
    currentPieceGeomPerSideRequired: true,
    strictEchoRequired: true,
    submittedSeamKeyAcceptedAsFinal: false,
    syntheticOperationIdCreated: false,
    autosaveRequested: false,
    secondFormOwnerCreated: false,
  } as const);

export type PatternImportDxfPhaseECadTableCrossScopeAuthoringHandoffRequestV1 = Readonly<{
  schemaVersion: typeof PATTERN_IMPORT_DXF_PHASE_E_CAD_TABLE_CROSS_SCOPE_AUTHORING_HANDOFF_V1;
  expectedOperationNumber: number;
  candidate: PatternImportDxfPhaseECadTableCrossScopeConnectCandidateV1;
  preparation: PatternImportDxfPhaseECadMaterialScopePreparationResultV1;
  direction: Extract<StoredSeamDirection, 'same' | 'reversed'>;
}>;

export type PatternImportDxfPhaseECadTableCrossScopeAuthoringHandoffBlockerV1 = Readonly<{
  code:
    | PatternImportDxfPhaseECadTableCrossScopeStoredSeamBlockerV1['code']
    | 'cross-scope-authoring-owner-unavailable'
    | 'cross-scope-authoring-owner-frozen'
    | 'cross-scope-authoring-request-invalid'
    | 'cross-scope-authoring-card-mismatch'
    | 'cross-scope-authoring-operation-mismatch';
  detail: string;
}>;

export type PatternImportDxfPhaseECadTableCrossScopeAuthoringHandoffResultV1 =
  | Readonly<{
      ok: true;
      operationIndex: number;
      operationNumber: number;
      historyKey: string;
      seamKey: string;
      seamKeys: readonly string[];
      blocker: null;
      claims: typeof PATTERN_IMPORT_DXF_PHASE_E_CAD_TABLE_CROSS_SCOPE_AUTHORING_HANDOFF_CLAIMS_V1;
    }>
  | Readonly<{
      ok: false;
      operationIndex: null;
      operationNumber: number | null;
      historyKey: string | null;
      seamKey: null;
      seamKeys: null;
      blocker: PatternImportDxfPhaseECadTableCrossScopeAuthoringHandoffBlockerV1;
      claims: typeof PATTERN_IMPORT_DXF_PHASE_E_CAD_TABLE_CROSS_SCOPE_AUTHORING_HANDOFF_CLAIMS_V1;
    }>;

export type PatternImportDxfPhaseECadTableCrossScopeAuthoringHandoffOwnerV1 =
  | Readonly<{
      status: 'available';
      link: (
        request: PatternImportDxfPhaseECadTableCrossScopeAuthoringHandoffRequestV1,
      ) => Promise<PatternImportDxfPhaseECadTableCrossScopeAuthoringHandoffResultV1>;
    }>
  | Readonly<{
      status: 'unavailable';
      blocker: PatternImportDxfPhaseECadTableCrossScopeAuthoringHandoffBlockerV1;
    }>;

export type PatternImportDxfPhaseECadTableCrossScopeAuthoringRequestBuildResultV1 =
  | Readonly<{
      ok: true;
      request: PatternImportDxfPhaseECadTableCrossScopeAuthoringHandoffRequestV1;
      blocker: null;
    }>
  | Readonly<{
      ok: false;
      request: null;
      blocker: PatternImportDxfPhaseECadTableCrossScopeAuthoringHandoffBlockerV1;
    }>;

/** Exact workbench gesture → one operation-bound request; no operation identity is fabricated. */
export function buildPatternImportDxfPhaseECadTableCrossScopeAuthoringRequestV1(
  input: Readonly<{
    preparation: PatternImportDxfPhaseECadMaterialScopePreparationResultV1;
    techCardId: number;
    importGeneration: number;
    sizeToken: string;
    expectedOperationNumber: number;
    direction: 'same' | 'reversed';
    sides: readonly [
      PatternImportDxfPhaseECadTableCrossScopeConnectSideV1,
      PatternImportDxfPhaseECadTableCrossScopeConnectSideV1,
    ];
  }>,
): PatternImportDxfPhaseECadTableCrossScopeAuthoringRequestBuildResultV1 {
  if (!Number.isSafeInteger(input.expectedOperationNumber) || input.expectedOperationNumber <= 0)
    return Object.freeze({
      ok: false as const,
      request: null,
      blocker: Object.freeze({
        code: 'cross-scope-authoring-operation-mismatch' as const,
        detail: 'Save the selected Assembly Order operation before linking material scopes.',
      }),
    });
  const candidate = buildPatternImportDxfPhaseECadTableCrossScopeConnectCandidateV1({
    preparation: input.preparation,
    techCardId: input.techCardId,
    importGeneration: input.importGeneration,
    sizeToken: input.sizeToken,
    mapping: 'equal',
    lengthRatio: 1,
    sides: input.sides,
  });
  if (!candidate.ok)
    return Object.freeze({
      ok: false as const,
      request: null,
      blocker: Object.freeze({
        code: 'cross-scope-authoring-request-invalid' as const,
        detail: candidate.blocker.detail,
      }),
    });
  return Object.freeze({
    ok: true as const,
    request: Object.freeze({
      schemaVersion: PATTERN_IMPORT_DXF_PHASE_E_CAD_TABLE_CROSS_SCOPE_AUTHORING_HANDOFF_V1,
      expectedOperationNumber: input.expectedOperationNumber,
      candidate: candidate.candidate,
      preparation: input.preparation,
      direction: input.direction,
    }),
    blocker: null,
  });
}

function refused(
  blocker: PatternImportDxfPhaseECadTableCrossScopeAuthoringHandoffBlockerV1,
  operation?: PatternImportDxfPhaseECadTableCrossScopeOperationV1 | null,
): Extract<PatternImportDxfPhaseECadTableCrossScopeAuthoringHandoffResultV1, { ok: false }> {
  return Object.freeze({
    ok: false as const,
    operationIndex: null,
    operationNumber: operation?.operationNumber ?? null,
    historyKey: operation?.historyKey ?? null,
    seamKey: null,
    seamKeys: null,
    blocker,
    claims: PATTERN_IMPORT_DXF_PHASE_E_CAD_TABLE_CROSS_SCOPE_AUTHORING_HANDOFF_CLAIMS_V1,
  });
}

/**
 * Production ingress orchestration. OperationsField supplies its real selected row, current saved
 * geometry, strict writer and a fresh read of all rows after the non-atomic seam RPC.
 */
export async function executePatternImportDxfPhaseECadTableCrossScopeAuthoringHandoffV1(
  input: Readonly<{
    request: PatternImportDxfPhaseECadTableCrossScopeAuthoringHandoffRequestV1;
    techCardId: number;
    selectedOperation: PatternImportDxfPhaseECadTableCrossScopeOperationV1 | null;
    geometry: readonly PieceGeom[];
    geometrySizeToken: string;
    nameOf: (pieceLineKey: string) => string;
    grainDeg: ReadonlyMap<string, number> | null;
    strictUpsert: (rows: readonly StoredSeam[]) => Promise<StrictSeamUpsertResult>;
    readOperations: () => readonly PatternImportDxfPhaseECadTableCrossScopeOperationV1[];
  }>,
): Promise<PatternImportDxfPhaseECadTableCrossScopeAuthoringHandoffResultV1> {
  const { request, selectedOperation } = input;
  if (
    request?.schemaVersion !==
      PATTERN_IMPORT_DXF_PHASE_E_CAD_TABLE_CROSS_SCOPE_AUTHORING_HANDOFF_V1 ||
    !Number.isSafeInteger(request.expectedOperationNumber) ||
    request.expectedOperationNumber <= 0 ||
    (request.direction !== 'same' && request.direction !== 'reversed')
  )
    return refused({
      code: 'cross-scope-authoring-request-invalid',
      detail: 'Choose one saved operation and an explicit same/reversed seam direction.',
    });
  if (
    !Number.isSafeInteger(input.techCardId) ||
    input.techCardId <= 0 ||
    request.candidate.techCardId !== input.techCardId ||
    (request.preparation.ok && request.preparation.catalog.techCardId !== input.techCardId)
  )
    return refused({
      code: 'cross-scope-authoring-card-mismatch',
      detail: 'The exact material authorities do not belong to the current tech card.',
    });
  if (!selectedOperation || selectedOperation.operationNumber !== request.expectedOperationNumber)
    return refused(
      {
        code: 'cross-scope-authoring-operation-mismatch',
        detail: 'The selected Assembly Order operation changed before cross-scope linking.',
      },
      selectedOperation,
    );
  const prepared = preparePatternImportDxfPhaseECadTableCrossScopeStoredSeamV1({
    candidate: request.candidate,
    preparation: request.preparation,
    operation: selectedOperation,
    geometry: input.geometry,
    geometrySizeToken: input.geometrySizeToken,
    direction: request.direction,
    nameOf: input.nameOf,
    grainDeg: input.grainDeg,
  });
  if (!prepared.ok) return refused(prepared.blocker, selectedOperation);
  const strictReceipt = await input.strictUpsert([...prepared.receipt.nextCommand.rows]);
  const completed = completePatternImportDxfPhaseECadTableCrossScopeStoredSeamV1(
    prepared.receipt,
    strictReceipt,
  );
  if (!completed.ok) return refused(completed.blocker, selectedOperation);
  const attach = planPatternImportDxfPhaseECadTableCrossScopeOperationAttachV1(
    input.readOperations(),
    completed.receipt,
  );
  if (!attach.ok) return refused(attach.blocker, selectedOperation);
  return Object.freeze({
    ok: true as const,
    operationIndex: attach.operationIndex,
    operationNumber: selectedOperation.operationNumber,
    historyKey: selectedOperation.historyKey,
    seamKey: completed.receipt.finalSeamKey,
    seamKeys: attach.seamKeys,
    blocker: null,
    claims: PATTERN_IMPORT_DXF_PHASE_E_CAD_TABLE_CROSS_SCOPE_AUTHORING_HANDOFF_CLAIMS_V1,
  });
}
