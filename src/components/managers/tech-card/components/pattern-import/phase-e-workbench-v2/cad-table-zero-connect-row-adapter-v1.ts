import type { TechCardFormData } from '../../schema';

import type { PatternImportDxfPhaseECadCommandAuthoringDraftRowV1 } from './cad-command-draft-authoring-handoff-v1';
import {
  PATTERN_IMPORT_DXF_PHASE_E_CAD_TABLE_ZERO_CONNECT_CANDIDATE_V1,
  PATTERN_IMPORT_DXF_PHASE_E_CAD_TABLE_ZERO_CONNECT_SESSION_CLAIMS_V1,
  PATTERN_IMPORT_DXF_PHASE_E_CAD_TABLE_ZERO_CONNECT_SESSION_V1,
  type PatternImportDxfPhaseECadTableZeroConnectCandidateV1,
  type PatternImportDxfPhaseECadTableZeroConnectSessionV1,
} from './cad-table-zero-connect-session-v1';
import {
  PATTERN_IMPORT_DXF_PHASE_E_FROM_SCRATCH_OPERATION_FORM_BOUNDARY_V1,
  PATTERN_IMPORT_DXF_PHASE_E_FROM_SCRATCH_OPERATION_IDENTITY_CLAIMS_V1,
  PATTERN_IMPORT_DXF_PHASE_E_FROM_SCRATCH_OPERATION_IDENTITY_POLICY_V1,
  type PatternImportDxfPhaseEFromScratchOperationIdentityPlanV1,
  type PatternImportDxfPhaseEFromScratchOperationIdentityRowCandidateV1,
} from './from-scratch-operation-identity-policy-v1';

export const PATTERN_IMPORT_DXF_PHASE_E_ZERO_CONNECT_ROW_ADAPTER_V1 =
  'pattern-import-dxf-phase-e-zero-connect-row-adapter/1' as const;

/**
 * This boundary only proves and translates data. OperationsField remains the sole form writer and
 * the card save owner remains the sole persistence writer.
 */
export const PATTERN_IMPORT_DXF_PHASE_E_ZERO_CONNECT_ROW_ADAPTER_CLAIMS_V1 = Object.freeze({
  candidateAndCurrentSessionRequired: true,
  fromScratchIdentityPlanRequired: true,
  stableSessionIdBecomesHistoryKey: true,
  operationNumberRemainsZeroBeforeWriter: true,
  authoringOperationIdRemainsNullBeforeWriter: true,
  existingOperationsFieldWriterRequired: true,
  formMutationPerformed: false,
  networkWritePerformed: false,
  createsAssemblyAuthority: false,
  createsPersistedIdentity: false,
  productionReady: false,
} as const);

type CardOperationFormRow = NonNullable<TechCardFormData['operations']>[number];
type SchemaBackedDraftFields = Required<
  Pick<
    CardOperationFormRow,
    'historyKey' | 'operationNumber' | 'draft' | 'operationType' | 'zone' | 'work' | 'note'
  >
>;

/**
 * The small, schema-backed override accepted by the existing `newOperationRow` writer. The writer
 * supplies every remaining RHF field from its one `emptyOperation` definition.
 */
export type PatternImportDxfPhaseEZeroConnectCardOperationRowV1 = Readonly<
  Omit<
    PatternImportDxfPhaseECadCommandAuthoringDraftRowV1 & SchemaBackedDraftFields,
    'inputKeys' | 'operationNumber'
  > & {
    operationNumber: 0;
    inputKeys: readonly [string, string];
  }
>;

export type PatternImportDxfPhaseEZeroConnectRowAdapterRequestV1 = Readonly<{
  candidate: PatternImportDxfPhaseECadTableZeroConnectCandidateV1;
  /** The current session, not the snapshot from which a caller once built the candidate. */
  session: PatternImportDxfPhaseECadTableZeroConnectSessionV1;
  identityPlan: PatternImportDxfPhaseEFromScratchOperationIdentityPlanV1;
  existingHistoryKeys: readonly string[];
}>;

export type PatternImportDxfPhaseEZeroConnectRowAdapterBlockerV1 = Readonly<{
  code:
    | 'zero-connect-envelope-unsupported'
    | 'zero-connect-candidate-foreign'
    | 'zero-connect-source-stale'
    | 'zero-connect-session-stale'
    | 'zero-connect-identity-plan-stale'
    | 'zero-connect-candidate-duplicate'
    | 'zero-connect-row-mapping-unsupported';
  detail: string;
}>;

export type PatternImportDxfPhaseEZeroConnectRowAdapterResultV1 =
  | Readonly<{
      ok: true;
      row: PatternImportDxfPhaseEZeroConnectCardOperationRowV1;
      identity: PatternImportDxfPhaseEFromScratchOperationIdentityRowCandidateV1;
      sessionRevision: number;
      blocker: null;
      claims: typeof PATTERN_IMPORT_DXF_PHASE_E_ZERO_CONNECT_ROW_ADAPTER_CLAIMS_V1;
    }>
  | Readonly<{
      ok: false;
      row: null;
      identity: null;
      sessionRevision: number | null;
      blocker: PatternImportDxfPhaseEZeroConnectRowAdapterBlockerV1;
      claims: typeof PATTERN_IMPORT_DXF_PHASE_E_ZERO_CONNECT_ROW_ADAPTER_CLAIMS_V1;
    }>;

const STABLE_ID = /^[A-Za-z0-9][A-Za-z0-9._:/#-]{0,255}$/;
const SHA256 = /^[0-9a-f]{64}$/;
const REQUEST_KEYS = Object.freeze(['candidate', 'existingHistoryKeys', 'identityPlan', 'session']);
const SOURCE_KEYS = Object.freeze([
  'catalogCanonicalSha256',
  'scopeKey',
  'sizeSelectionCanonicalSha256',
  'sizeToken',
  'sourceFileId',
]);
const OPERATION_KEYS = Object.freeze([
  'authoringOperationId',
  'dependsOn',
  'operationNumber',
  'order',
  'sessionOperationId',
  'stage',
]);
const SIDE_KEYS = Object.freeze([
  'boundaryVertexIds',
  'contourId',
  'direction',
  'pieceId',
  'pieceLineKey',
]);

function record(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function exactKeys(value: unknown, keys: readonly string[]): boolean {
  return (
    record(value) && Object.keys(value).sort().join('\u0000') === [...keys].sort().join('\u0000')
  );
}

function stableId(value: unknown): value is string {
  return typeof value === 'string' && STABLE_ID.test(value);
}

function blocked(
  code: PatternImportDxfPhaseEZeroConnectRowAdapterBlockerV1['code'],
  detail: string,
  sessionRevision: number | null = null,
): Extract<PatternImportDxfPhaseEZeroConnectRowAdapterResultV1, { ok: false }> {
  return Object.freeze({
    ok: false as const,
    row: null,
    identity: null,
    sessionRevision,
    blocker: Object.freeze({ code, detail }),
    claims: PATTERN_IMPORT_DXF_PHASE_E_ZERO_CONNECT_ROW_ADAPTER_CLAIMS_V1,
  });
}

function sourceValid(
  value: unknown,
): value is PatternImportDxfPhaseECadTableZeroConnectSessionV1['source'] {
  if (!exactKeys(value, SOURCE_KEYS)) return false;
  const source = value as Record<string, unknown>;
  return (
    typeof source.catalogCanonicalSha256 === 'string' &&
    SHA256.test(source.catalogCanonicalSha256) &&
    typeof source.sizeSelectionCanonicalSha256 === 'string' &&
    SHA256.test(source.sizeSelectionCanonicalSha256) &&
    stableId(source.sourceFileId) &&
    stableId(source.scopeKey) &&
    stableId(source.sizeToken)
  );
}

function sourcePrint(source: PatternImportDxfPhaseECadTableZeroConnectSessionV1['source']): string {
  return [
    source.catalogCanonicalSha256,
    source.sizeSelectionCanonicalSha256,
    source.sourceFileId,
    source.scopeKey,
    source.sizeToken,
  ].join('\u0000');
}

function operationValid(
  value: unknown,
): value is PatternImportDxfPhaseECadTableZeroConnectSessionV1['operation'] {
  if (!exactKeys(value, OPERATION_KEYS)) return false;
  const operation = value as Record<string, unknown>;
  return (
    stableId(operation.sessionOperationId) &&
    Number.isSafeInteger(operation.order) &&
    (operation.order as number) >= 0 &&
    Number.isSafeInteger(operation.stage) &&
    (operation.stage as number) >= 0 &&
    Array.isArray(operation.dependsOn) &&
    new Set(operation.dependsOn).size === operation.dependsOn.length &&
    operation.dependsOn.every(stableId) &&
    operation.operationNumber === 0 &&
    operation.authoringOperationId === null
  );
}

function operationPrint(
  operation: PatternImportDxfPhaseECadTableZeroConnectSessionV1['operation'],
): string {
  return JSON.stringify({
    sessionOperationId: operation.sessionOperationId,
    order: operation.order,
    stage: operation.stage,
    dependsOn: operation.dependsOn,
    operationNumber: operation.operationNumber,
    authoringOperationId: operation.authoringOperationId,
  });
}

function sideValid(value: unknown): boolean {
  if (!exactKeys(value, SIDE_KEYS)) return false;
  const side = value as Record<string, unknown>;
  return (
    stableId(side.pieceId) &&
    stableId(side.pieceLineKey) &&
    stableId(side.contourId) &&
    (side.direction === 'forward' || side.direction === 'reverse') &&
    Array.isArray(side.boundaryVertexIds) &&
    side.boundaryVertexIds.length === 2 &&
    side.boundaryVertexIds.every(stableId) &&
    side.boundaryVertexIds[0] !== side.boundaryVertexIds[1]
  );
}

function sidePrint(value: unknown): string {
  const side =
    value as PatternImportDxfPhaseECadTableZeroConnectCandidateV1['connection']['sides'][number];
  return JSON.stringify({
    pieceId: side.pieceId,
    pieceLineKey: side.pieceLineKey,
    contourId: side.contourId,
    boundaryVertexIds: side.boundaryVertexIds,
    direction: side.direction,
  });
}

function sessionAndCandidateIssue(
  session: PatternImportDxfPhaseECadTableZeroConnectSessionV1,
  candidate: PatternImportDxfPhaseECadTableZeroConnectCandidateV1,
): PatternImportDxfPhaseEZeroConnectRowAdapterBlockerV1 | null {
  if (
    session.schemaVersion !== PATTERN_IMPORT_DXF_PHASE_E_CAD_TABLE_ZERO_CONNECT_SESSION_V1 ||
    session.status !== 'ready' ||
    !Number.isSafeInteger(session.revision) ||
    session.revision < 0 ||
    session.claims !== PATTERN_IMPORT_DXF_PHASE_E_CAD_TABLE_ZERO_CONNECT_SESSION_CLAIMS_V1 ||
    !sourceValid(session.source) ||
    !operationValid(session.operation) ||
    !Array.isArray(session.sides) ||
    session.sides.length !== 2 ||
    !session.sides.every(sideValid) ||
    !['equal', 'eased', 'gathered'].includes(session.mapping) ||
    !Number.isFinite(session.lengthRatio) ||
    session.lengthRatio <= 0 ||
    (session.mapping === 'equal' && session.lengthRatio !== 1)
  )
    return Object.freeze({
      code: 'zero-connect-session-stale' as const,
      detail:
        'The current zero-connect session is incomplete or no longer a supported ready session.',
    });

  if (
    candidate.schemaVersion !== PATTERN_IMPORT_DXF_PHASE_E_CAD_TABLE_ZERO_CONNECT_CANDIDATE_V1 ||
    candidate.status !== 'session-only-operation-candidate' ||
    candidate.apply?.eligible !== false ||
    candidate.apply?.boundary !==
      PATTERN_IMPORT_DXF_PHASE_E_FROM_SCRATCH_OPERATION_IDENTITY_POLICY_V1 ||
    candidate.claims !== PATTERN_IMPORT_DXF_PHASE_E_CAD_TABLE_ZERO_CONNECT_SESSION_CLAIMS_V1 ||
    !sourceValid(candidate.source) ||
    !operationValid(candidate.operation) ||
    !record(candidate.connection) ||
    !stableId(candidate.connection.intentId) ||
    candidate.connection.intentId !== candidate.operation.sessionOperationId ||
    !['equal', 'eased', 'gathered'].includes(candidate.connection.mapping) ||
    !Number.isFinite(candidate.connection.lengthRatio) ||
    candidate.connection.lengthRatio <= 0 ||
    !Array.isArray(candidate.connection.sides) ||
    candidate.connection.sides.length !== 2 ||
    !candidate.connection.sides.every(sideValid)
  )
    return Object.freeze({
      code: 'zero-connect-candidate-foreign' as const,
      detail: 'The zero-connect candidate does not use the supported exact session-only schema.',
    });

  if (sourcePrint(candidate.source) !== sourcePrint(session.source))
    return Object.freeze({
      code: 'zero-connect-source-stale' as const,
      detail: 'The exact DXF source changed after this zero-connect candidate was prepared.',
    });

  if (
    operationPrint(candidate.operation) !== operationPrint(session.operation) ||
    candidate.connection.intentId !== session.operation.sessionOperationId ||
    candidate.connection.mapping !== session.mapping ||
    candidate.connection.lengthRatio !== session.lengthRatio ||
    candidate.connection.sides.some(
      (side, index) => sidePrint(side) !== sidePrint(session.sides[index]),
    )
  )
    return Object.freeze({
      code: 'zero-connect-session-stale' as const,
      detail: 'The current zero-connect session changed after this candidate was prepared.',
    });

  const [sideA, sideB] = candidate.connection.sides;
  if (sideA.pieceId === sideB.pieceId || sideA.pieceLineKey === sideB.pieceLineKey)
    return Object.freeze({
      code: 'zero-connect-candidate-foreign' as const,
      detail: 'A zero-connect draft must connect two distinct exact card pieces.',
    });
  return null;
}

function inspectIdentityPlan(
  plan: PatternImportDxfPhaseEFromScratchOperationIdentityPlanV1,
  operation: PatternImportDxfPhaseECadTableZeroConnectSessionV1['operation'],
):
  | Readonly<{
      ok: true;
      identity: PatternImportDxfPhaseEFromScratchOperationIdentityRowCandidateV1;
    }>
  | Readonly<{
      ok: false;
      code: 'zero-connect-identity-plan-stale' | 'zero-connect-candidate-duplicate';
      detail: string;
    }> {
  if (
    !plan ||
    plan.schemaVersion !== PATTERN_IMPORT_DXF_PHASE_E_FROM_SCRATCH_OPERATION_IDENTITY_POLICY_V1 ||
    plan.status !== 'session-plan-ready-apply-blocked' ||
    plan.apply?.eligible !== false ||
    plan.apply?.boundary !== PATTERN_IMPORT_DXF_PHASE_E_FROM_SCRATCH_OPERATION_FORM_BOUNDARY_V1 ||
    plan.apply?.requiredOwner !== 'existing-tech-card-form-and-save-owner' ||
    plan.claims?.temporaryIdentityMapsToExistingHistoryKey !==
      PATTERN_IMPORT_DXF_PHASE_E_FROM_SCRATCH_OPERATION_IDENTITY_CLAIMS_V1.temporaryIdentityMapsToExistingHistoryKey ||
    plan.claims?.newFormRowOperationNumberIsZero !== true ||
    plan.claims?.formMutationPerformed !== false ||
    plan.claims?.networkWritePerformed !== false ||
    !Array.isArray(plan.rows) ||
    !plan.rows.length
  )
    return Object.freeze({
      ok: false as const,
      code: 'zero-connect-identity-plan-stale' as const,
      detail: 'The from-scratch identity plan is absent, stale or uses another writer boundary.',
    });

  const seenIds = new Set<string>();
  const seenHistoryKeys = new Set<string>();
  const precedingIds = new Set<string>();
  const firstInsertIndex = plan.rows[0]?.insertIndex;
  let previousStage = -1;
  for (let index = 0; index < plan.rows.length; index += 1) {
    const row = plan.rows[index];
    if (
      !row ||
      !stableId(row.sessionOperationId) ||
      !stableId(row.historyKey) ||
      row.historyKey !== row.sessionOperationId ||
      row.operationNumber !== 0 ||
      row.authoringOperationId !== null ||
      !Number.isSafeInteger(row.insertIndex) ||
      row.insertIndex < 0 ||
      row.insertIndex !== (firstInsertIndex ?? -1) + index ||
      row.order !== index ||
      !Number.isSafeInteger(row.stage) ||
      row.stage < previousStage ||
      !Array.isArray(row.dependsOn) ||
      new Set(row.dependsOn).size !== row.dependsOn.length ||
      row.dependsOn.some((dependency: string) => !precedingIds.has(dependency))
    )
      return Object.freeze({
        ok: false as const,
        code: 'zero-connect-identity-plan-stale' as const,
        detail:
          'The from-scratch identity plan no longer has one contiguous dependency-safe row set.',
      });
    if (seenIds.has(row.sessionOperationId) || seenHistoryKeys.has(row.historyKey))
      return Object.freeze({
        ok: false as const,
        code: 'zero-connect-candidate-duplicate' as const,
        detail: `The identity plan contains duplicate session operation ${row.sessionOperationId}.`,
      });
    seenIds.add(row.sessionOperationId);
    seenHistoryKeys.add(row.historyKey);
    precedingIds.add(row.sessionOperationId);
    previousStage = row.stage;
  }

  const matches = plan.rows.filter(
    ({ sessionOperationId }) => sessionOperationId === operation.sessionOperationId,
  );
  if (matches.length !== 1)
    return Object.freeze({
      ok: false as const,
      code:
        matches.length > 1
          ? ('zero-connect-candidate-duplicate' as const)
          : ('zero-connect-identity-plan-stale' as const),
      detail:
        matches.length > 1
          ? `The identity plan contains duplicate session operation ${operation.sessionOperationId}.`
          : `The identity plan no longer contains session operation ${operation.sessionOperationId}.`,
    });
  const identity = matches[0]!;
  if (
    identity.order !== operation.order ||
    identity.stage !== operation.stage ||
    JSON.stringify(identity.dependsOn) !== JSON.stringify(operation.dependsOn) ||
    identity.operationNumber !== operation.operationNumber ||
    identity.authoringOperationId !== operation.authoringOperationId
  )
    return Object.freeze({
      ok: false as const,
      code: 'zero-connect-identity-plan-stale' as const,
      detail: 'The identity plan row no longer matches the current zero-connect session operation.',
    });
  return Object.freeze({ ok: true as const, identity });
}

function noteOf(candidate: PatternImportDxfPhaseECadTableZeroConnectCandidateV1): string {
  const side = (
    label: 'A' | 'B',
    value: PatternImportDxfPhaseECadTableZeroConnectCandidateV1['connection']['sides'][number],
  ) =>
    `Side ${label}: ${value.pieceLineKey} · ${value.contourId} · ${value.boundaryVertexIds[0]} → ${value.boundaryVertexIds[1]} · ${value.direction}`;
  const dependencies = candidate.operation.dependsOn.length
    ? candidate.operation.dependsOn.join(', ')
    : 'none';
  return [
    'CAD assembly connection · draft',
    `Session operation: ${candidate.operation.sessionOperationId}`,
    `Mapping: ${candidate.connection.mapping} · ratio ${candidate.connection.lengthRatio}`,
    side('A', candidate.connection.sides[0]),
    side('B', candidate.connection.sides[1]),
    `Depends on: ${dependencies}`,
  ].join('\n');
}

function inspect(input: unknown): PatternImportDxfPhaseEZeroConnectRowAdapterResultV1 {
  if (!exactKeys(input, REQUEST_KEYS))
    return blocked(
      'zero-connect-envelope-unsupported',
      'The row adapter accepts one exact detached candidate/session/identity-plan envelope.',
    );
  const request = input as unknown as PatternImportDxfPhaseEZeroConnectRowAdapterRequestV1;
  if (!Array.isArray(request.existingHistoryKeys) || !request.existingHistoryKeys.every(stableId))
    return blocked(
      'zero-connect-envelope-unsupported',
      'Existing operation history keys must be one explicit stable-ID list.',
    );

  const issue = sessionAndCandidateIssue(request.session, request.candidate);
  if (issue) return blocked(issue.code, issue.detail, request.session?.revision ?? null);

  const identityResult = inspectIdentityPlan(request.identityPlan, request.session.operation);
  if (!identityResult.ok)
    return blocked(identityResult.code, identityResult.detail, request.session.revision);
  const identity = identityResult.identity;
  if (request.existingHistoryKeys.includes(identity.historyKey))
    return blocked(
      'zero-connect-candidate-duplicate',
      `Assembly Order already contains zero-connect draft ${identity.historyKey}.`,
      request.session.revision,
    );

  const [sideA, sideB] = request.candidate.connection.sides;
  const row: PatternImportDxfPhaseEZeroConnectCardOperationRowV1 = Object.freeze({
    historyKey: identity.historyKey,
    operationNumber: 0 as const,
    draft: true as const,
    operationType: 'TECH_CARD_OPERATION_TYPE_HANDWORK' as const,
    zone: 'TECH_CARD_GARMENT_ZONE_OTHER',
    work: '' as const,
    inputKeys: Object.freeze([sideA.pieceLineKey, sideB.pieceLineKey]) as readonly [string, string],
    note: noteOf(request.candidate),
  });
  if (
    row.historyKey !== request.session.operation.sessionOperationId ||
    row.operationNumber !== 0 ||
    row.inputKeys.some((pieceLineKey) => !stableId(pieceLineKey))
  )
    return blocked(
      'zero-connect-row-mapping-unsupported',
      'The exact connection cannot be represented as an existing Assembly Order draft row.',
      request.session.revision,
    );

  return Object.freeze({
    ok: true as const,
    row,
    identity: Object.freeze({
      ...identity,
      dependsOn: Object.freeze([...identity.dependsOn]),
    }),
    sessionRevision: request.session.revision,
    blocker: null,
    claims: PATTERN_IMPORT_DXF_PHASE_E_ZERO_CONNECT_ROW_ADAPTER_CLAIMS_V1,
  });
}

/**
 * Converts one still-current zero-connect candidate into a schema-backed override for the existing
 * OperationsField row factory. No callback is accepted, so this function cannot write form or
 * persistence state. Foreign, stale and duplicate evidence fails closed with `row: null`.
 */
export function preparePatternImportDxfPhaseEZeroConnectCardOperationRowV1(
  input: unknown,
): PatternImportDxfPhaseEZeroConnectRowAdapterResultV1 {
  try {
    return inspect(input);
  } catch {
    return blocked(
      'zero-connect-envelope-unsupported',
      'The row adapter envelope must be readable detached plain data without hostile accessors.',
    );
  }
}
