export const PATTERN_IMPORT_DXF_PHASE_E_FROM_SCRATCH_OPERATION_IDENTITY_POLICY_V1 =
  'pattern-import-dxf-phase-e-from-scratch-operation-identity-policy/1' as const;
export const PATTERN_IMPORT_DXF_PHASE_E_FROM_SCRATCH_OPERATION_FORM_BOUNDARY_V1 =
  'tech-card-operations-field-row-from-create/1' as const;

/**
 * Existing owner facts proved by `operationSchema`, `OperationsField.newOperationRow` and
 * `mapFormToTechCardInsert`. This policy only exposes their boundary; it does not create another
 * form writer or persistence model.
 */
export const PATTERN_IMPORT_DXF_PHASE_E_FROM_SCRATCH_OPERATION_IDENTITY_CLAIMS_V1 = Object.freeze({
  temporaryIdentityIsSessionOnly: true,
  temporaryIdentityMapsToExistingHistoryKey: true,
  historyKeyOmittedFromWire: true,
  newFormRowOperationNumberIsZero: true,
  operationNumberAssignedByServerPosition: true,
  operationNumberMayChangeAfterGeneratedInsertionOrRenumber: true,
  stablePersistedOperationIdPresentOnCurrentWireOperation: false,
  persistentIdentityMintedByClient: false,
  deterministicOrderRequired: true,
  dependenciesMustReferenceEarlierSessionOperations: true,
  nondecreasingStageRequired: true,
  existingOperationsFieldWriterRequired: true,
  formMutationPerformed: false,
  networkWritePerformed: false,
  applyEligible: false,
  createsOperationAuthority: false,
  createsPersistenceModel: false,
  productionReady: false,
} as const);

export type PatternImportDxfPhaseEFromScratchOperationIdentityDraftV1 = Readonly<{
  sessionOperationId: string;
  order: number;
  stage: number;
  dependsOn: readonly string[];
  /** Must remain unassigned until the existing card save owner writes the ordered operation list. */
  operationNumber: 0;
  /** A from-scratch session may not pretend that it already owns a persisted operation identity. */
  authoringOperationId: null;
}>;

export type PatternImportDxfPhaseEFromScratchOperationIdentityRowCandidateV1 = Readonly<{
  sessionOperationId: string;
  historyKey: string;
  operationNumber: 0;
  authoringOperationId: null;
  insertIndex: number;
  order: number;
  stage: number;
  dependsOn: readonly string[];
}>;

export type PatternImportDxfPhaseEFromScratchOperationIdentityBlockerCodeV1 =
  | 'invalid-envelope'
  | 'invalid-existing-operation-count'
  | 'invalid-session-operation'
  | 'session-operation-id-collision'
  | 'operation-order-invalid'
  | 'operation-stage-order-invalid'
  | 'operation-dependency-invalid'
  | 'client-persisted-identity-forbidden'
  | 'existing-form-writer-required'
  | 'stable-persisted-operation-receipt-unavailable';

export type PatternImportDxfPhaseEFromScratchOperationIdentityBlockerV1 = Readonly<{
  code: PatternImportDxfPhaseEFromScratchOperationIdentityBlockerCodeV1;
  field: string;
  detail: string;
}>;

export type PatternImportDxfPhaseEFromScratchOperationIdentityPlanV1 = Readonly<{
  schemaVersion: typeof PATTERN_IMPORT_DXF_PHASE_E_FROM_SCRATCH_OPERATION_IDENTITY_POLICY_V1;
  status: 'session-plan-ready-apply-blocked';
  rows: readonly PatternImportDxfPhaseEFromScratchOperationIdentityRowCandidateV1[];
  apply: Readonly<{
    eligible: false;
    boundary: typeof PATTERN_IMPORT_DXF_PHASE_E_FROM_SCRATCH_OPERATION_FORM_BOUNDARY_V1;
    requiredOwner: 'existing-tech-card-form-and-save-owner';
    requiredReceipt: Readonly<{
      serverAssignedOperationNumber: true;
      stablePersistedOperationId: true;
      cardLockVersion: true;
      orderedOperationSetFingerprint: true;
    }>;
    blockers: readonly PatternImportDxfPhaseEFromScratchOperationIdentityBlockerV1[];
  }>;
  claims: typeof PATTERN_IMPORT_DXF_PHASE_E_FROM_SCRATCH_OPERATION_IDENTITY_CLAIMS_V1;
}>;

export type PatternImportDxfPhaseEFromScratchOperationIdentityResultV1 =
  | Readonly<{
      ok: true;
      plan: PatternImportDxfPhaseEFromScratchOperationIdentityPlanV1;
      blockers: null;
    }>
  | Readonly<{
      ok: false;
      plan: null;
      blockers: readonly PatternImportDxfPhaseEFromScratchOperationIdentityBlockerV1[];
    }>;

const STABLE_ID = /^[A-Za-z0-9][A-Za-z0-9._:/#-]{0,255}$/;
const ENVELOPE_KEYS = Object.freeze(['drafts', 'existingOperationCount']);
const DRAFT_KEYS = Object.freeze([
  'authoringOperationId',
  'dependsOn',
  'operationNumber',
  'order',
  'sessionOperationId',
  'stage',
]);

function record(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function exactKeys(value: unknown, expected: readonly string[]): boolean {
  return (
    record(value) &&
    Object.keys(value).sort().join('\u0000') === [...expected].sort().join('\u0000')
  );
}

function blocker(
  code: PatternImportDxfPhaseEFromScratchOperationIdentityBlockerCodeV1,
  field: string,
  detail: string,
): PatternImportDxfPhaseEFromScratchOperationIdentityBlockerV1 {
  return Object.freeze({ code, field, detail });
}

function blocked(
  code: PatternImportDxfPhaseEFromScratchOperationIdentityBlockerCodeV1,
  field: string,
  detail: string,
): PatternImportDxfPhaseEFromScratchOperationIdentityResultV1 {
  return Object.freeze({
    ok: false as const,
    plan: null,
    blockers: Object.freeze([blocker(code, field, detail)]),
  });
}

function inspect(input: unknown): PatternImportDxfPhaseEFromScratchOperationIdentityResultV1 {
  if (!exactKeys(input, ENVELOPE_KEYS))
    return blocked(
      'invalid-envelope',
      'input',
      'The from-scratch identity policy accepts one exact plain-data envelope.',
    );
  const envelope = input as Record<string, unknown>;
  if (
    !Number.isSafeInteger(envelope.existingOperationCount) ||
    (envelope.existingOperationCount as number) < 0
  )
    return blocked(
      'invalid-existing-operation-count',
      'input.existingOperationCount',
      'The current form operation count must be one explicit nonnegative integer.',
    );
  if (!Array.isArray(envelope.drafts) || envelope.drafts.length === 0)
    return blocked(
      'invalid-session-operation',
      'input.drafts',
      'At least one session-only operation identity is required.',
    );

  const drafts: PatternImportDxfPhaseEFromScratchOperationIdentityDraftV1[] = [];
  const ids: string[] = [];
  for (let index = 0; index < envelope.drafts.length; index += 1) {
    const draft = envelope.drafts[index] as Record<string, unknown>;
    const sessionOperationId = draft.sessionOperationId;
    const order = draft.order;
    const stage = draft.stage;
    const dependsOn = draft.dependsOn;
    if (
      !exactKeys(draft, DRAFT_KEYS) ||
      typeof sessionOperationId !== 'string' ||
      !STABLE_ID.test(sessionOperationId) ||
      typeof order !== 'number' ||
      !Number.isSafeInteger(order) ||
      typeof stage !== 'number' ||
      !Number.isSafeInteger(stage) ||
      stage < 0 ||
      !Array.isArray(dependsOn) ||
      !dependsOn.every((dependency: unknown) =>
        typeof dependency === 'string' ? STABLE_ID.test(dependency) : false,
      )
    )
      return blocked(
        'invalid-session-operation',
        `input.drafts[${index}]`,
        'Every draft requires one stable temporary ID, explicit order/stage and stable dependencies.',
      );
    if (draft.operationNumber !== 0 || draft.authoringOperationId !== null)
      return blocked(
        'client-persisted-identity-forbidden',
        `input.drafts[${index}]`,
        'A from-scratch session must keep operationNumber zero and authoringOperationId null.',
      );
    const admitted = draft as unknown as PatternImportDxfPhaseEFromScratchOperationIdentityDraftV1;
    drafts.push(admitted);
    ids.push(admitted.sessionOperationId);
  }

  if (new Set(ids).size !== ids.length)
    return blocked(
      'session-operation-id-collision',
      'input.drafts',
      'Session operation identities must be unique.',
    );

  for (let index = 0; index < drafts.length; index += 1) {
    const draft = drafts[index];
    if (draft.order !== index)
      return blocked(
        'operation-order-invalid',
        `input.drafts[${index}].order`,
        'Session operation order must be contiguous and exact-match action sequence.',
      );
    if (index > 0 && draft.stage < drafts[index - 1].stage)
      return blocked(
        'operation-stage-order-invalid',
        `input.drafts[${index}].stage`,
        'Session operation stages must be nondecreasing in action order.',
      );
    const precedingIds = new Set(ids.slice(0, index));
    if (
      new Set(draft.dependsOn).size !== draft.dependsOn.length ||
      draft.dependsOn.some((dependency: string) => !precedingIds.has(dependency))
    )
      return blocked(
        'operation-dependency-invalid',
        `input.drafts[${index}].dependsOn`,
        'Dependencies must be unique references to earlier operations in the same session.',
      );
  }

  const existingOperationCount = envelope.existingOperationCount as number;
  const rows = drafts.map((draft, index) =>
    Object.freeze({
      sessionOperationId: draft.sessionOperationId,
      historyKey: draft.sessionOperationId,
      operationNumber: 0 as const,
      authoringOperationId: null,
      insertIndex: existingOperationCount + index,
      order: draft.order,
      stage: draft.stage,
      dependsOn: Object.freeze([...draft.dependsOn]),
    }),
  );
  const applyBlockers = Object.freeze([
    blocker(
      'existing-form-writer-required',
      'plan.apply.boundary',
      'The session plan must be translated by OperationsField.rowFromCreate and its existing form/save owner.',
    ),
    blocker(
      'stable-persisted-operation-receipt-unavailable',
      'plan.apply.requiredReceipt.stablePersistedOperationId',
      'The current wire operation returns a positional number but no stable persisted operation ID for post-save reconciliation.',
    ),
  ]);
  return Object.freeze({
    ok: true as const,
    plan: Object.freeze({
      schemaVersion: PATTERN_IMPORT_DXF_PHASE_E_FROM_SCRATCH_OPERATION_IDENTITY_POLICY_V1,
      status: 'session-plan-ready-apply-blocked' as const,
      rows: Object.freeze(rows),
      apply: Object.freeze({
        eligible: false as const,
        boundary: PATTERN_IMPORT_DXF_PHASE_E_FROM_SCRATCH_OPERATION_FORM_BOUNDARY_V1,
        requiredOwner: 'existing-tech-card-form-and-save-owner' as const,
        requiredReceipt: Object.freeze({
          serverAssignedOperationNumber: true as const,
          stablePersistedOperationId: true as const,
          cardLockVersion: true as const,
          orderedOperationSetFingerprint: true as const,
        }),
        blockers: applyBlockers,
      }),
      claims: PATTERN_IMPORT_DXF_PHASE_E_FROM_SCRATCH_OPERATION_IDENTITY_CLAIMS_V1,
    }),
    blockers: null,
  });
}

/**
 * Builds a deterministic session-only identity plan. A structurally valid plan is intentionally
 * still Apply-blocked: the existing form writer can carry the temporary `historyKey`, but the wire
 * omits it and returns no stable persisted operation identity after server renumbering.
 */
export function buildPatternImportDxfPhaseEFromScratchOperationIdentityPolicyV1(
  input: unknown,
): PatternImportDxfPhaseEFromScratchOperationIdentityResultV1 {
  try {
    return inspect(input);
  } catch {
    return blocked(
      'invalid-envelope',
      'input',
      'The from-scratch identity envelope must be readable detached plain data without hostile accessors.',
    );
  }
}
