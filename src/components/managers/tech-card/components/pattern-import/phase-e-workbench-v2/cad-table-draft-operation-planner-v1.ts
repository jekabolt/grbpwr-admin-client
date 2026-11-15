import type { TechCardOperation } from 'api/proto-http/common';
import type { DxfMaterialAssignmentV1 } from 'lib/cloth/domain/dxf-assembly-handoff-v1';
import type { PatternImportDxfProductPhaseEExistingAssemblyOperationV1 } from 'lib/pattern-import/dxf-product-phase-e-assembly-workbench-v1';

import {
  createPatternImportDxfPhaseEDraftOperationFromConnectionV1,
  PATTERN_IMPORT_DXF_PHASE_E_DRAFT_OPERATION_APPLY_ADAPTER_V1,
  type PatternImportDxfPhaseEDraftOperationConnectionIntentV1,
  type PatternImportDxfPhaseEDraftOperationSourceCatalogV1,
  type PatternImportDxfPhaseEDraftOperationV1,
} from './draft-operation-from-connection-v1';
import {
  PATTERN_IMPORT_DXF_PHASE_E_GOLDEN_CARD_ZERO_SEAM_ACTION_V1,
  type PatternImportDxfPhaseEGoldenCardZeroSeamActionV1,
} from './golden-card-zero-seam-operation-producer-v1';
import type { PatternImportDxfPhaseEStitchVisualV1 } from './stitch-visual-v1';

export const PATTERN_IMPORT_DXF_PHASE_E_CAD_TABLE_DRAFT_OPERATION_PLAN_V1 =
  'pattern-import-dxf-phase-e-cad-table-draft-operation-plan/1' as const;

export const PATTERN_IMPORT_DXF_PHASE_E_CAD_TABLE_DRAFT_OPERATION_PLANNER_CLAIMS_V1 = Object.freeze(
  {
    sessionOnly: true,
    existingAssemblyOperationOwnerReused: true,
    existingStitchVisualOwnerReused: true,
    existingMaterialAndBomReferencesReused: true,
    existingExactConnectionDraftHelperReused: true,
    zeroOneAndMultiConnectionRoutesExplicit: true,
    assemblyOrderNumberDefinesPlanOrder: true,
    assemblyInputOutputDependenciesDerived: true,
    incompleteCurrentOperationFieldsExplicit: true,
    unsupportedProcessKindsTypedBlocked: true,
    createsPersistedIdentity: false,
    createsOperationAuthority: false,
    createsStitchOrBomAuthority: false,
    writesPersistence: false,
    applyEligible: false,
    productionReady: false,
  } as const,
);

export type PatternImportDxfPhaseECadTableProcessKindV1 =
  'sew' | 'connect' | 'cut' | 'dart' | 'spread' | 'gather' | 'pleat' | 'press' | 'iron' | 'finish';

/** Read-only projection of the fields already owned by the selected TechCardOperation row. */
export type PatternImportDxfPhaseECadTableCurrentOperationV1 = Readonly<
  Pick<
    TechCardOperation,
    | 'operationNumber'
    | 'operationType'
    | 'zone'
    | 'bomLineKeys'
    | 'seamClass'
    | 'machineType'
    | 'pressEquipment'
    | 'inputKeys'
    | 'outputUnitKey'
    | 'outputUnitName'
    | 'stitching'
    | 'trim'
    | 'press'
    | 'clean'
    | 'inspect'
    | 'wetProcessKind'
    | 'work'
    | 'seamKeys'
  >
>;

export type PatternImportDxfPhaseECadTableIncompleteFieldV1 =
  | 'zone'
  | 'machineType'
  | 'bomLineKeys'
  | 'stitching.fullnessRatio'
  | 'trim.action'
  | 'pressEquipment'
  | 'press.action'
  | 'press.toward'
  | 'clean.kind'
  | 'inspect.coverageMode'
  | 'wetProcessKind';

export type PatternImportDxfPhaseECadTableOperationIntentV1 = Readonly<{
  processKind: PatternImportDxfPhaseECadTableProcessKindV1;
  stage: number;
  operation: PatternImportDxfProductPhaseEExistingAssemblyOperationV1;
  current: PatternImportDxfPhaseECadTableCurrentOperationV1;
  stitch: PatternImportDxfPhaseEStitchVisualV1 | null;
  materials: readonly DxfMaterialAssignmentV1[];
  /** Retained exact edge intents in the same order as operation.seamKeys. */
  connections: readonly PatternImportDxfPhaseEDraftOperationConnectionIntentV1[];
}>;

type ZeroConnectionRoute = Readonly<{
  cardinality: 'zero';
  action: PatternImportDxfPhaseEGoldenCardZeroSeamActionV1;
  drafts: readonly [];
}>;

type OneConnectionRoute = Readonly<{
  cardinality: 'one';
  action: null;
  drafts: readonly [PatternImportDxfPhaseEDraftOperationV1];
}>;

type MultiConnectionRoute = Readonly<{
  cardinality: 'multi';
  /** Reuses the existing operation identity; the planner never mints a transaction identity. */
  transactionId: string;
  action: null;
  drafts: readonly [
    PatternImportDxfPhaseEDraftOperationV1,
    PatternImportDxfPhaseEDraftOperationV1,
    ...PatternImportDxfPhaseEDraftOperationV1[],
  ];
}>;

export type PatternImportDxfPhaseECadTableDraftOperationRouteV1 =
  ZeroConnectionRoute | OneConnectionRoute | MultiConnectionRoute;

export type PatternImportDxfPhaseECadTablePlannedOperationV1 = Readonly<{
  operationRef: string;
  operationNumber: number;
  order: number;
  stage: number;
  processKind: Exclude<PatternImportDxfPhaseECadTableProcessKindV1, 'dart' | 'spread' | 'pleat'>;
  dependsOnOperationRefs: readonly string[];
  readiness: 'complete-session-draft' | 'incomplete-current-operation';
  incompleteFields: readonly PatternImportDxfPhaseECadTableIncompleteFieldV1[];
  /** Detached read-only evidence; this is not a second TechCardOperation owner. */
  current: PatternImportDxfPhaseECadTableCurrentOperationV1;
  route: PatternImportDxfPhaseECadTableDraftOperationRouteV1;
  apply: Readonly<{
    eligible: false;
    boundary: typeof PATTERN_IMPORT_DXF_PHASE_E_DRAFT_OPERATION_APPLY_ADAPTER_V1;
  }>;
}>;

export type PatternImportDxfPhaseECadTableDraftOperationPlanV1 = Readonly<{
  schemaVersion: typeof PATTERN_IMPORT_DXF_PHASE_E_CAD_TABLE_DRAFT_OPERATION_PLAN_V1;
  status: 'session-only-draft-plan';
  source: Readonly<{
    catalogCanonicalSha256: string;
    sizeSelectionCanonicalSha256: string;
    sourceFileId: string;
  }>;
  operations: readonly PatternImportDxfPhaseECadTablePlannedOperationV1[];
  apply: Readonly<{
    eligible: false;
    boundary: typeof PATTERN_IMPORT_DXF_PHASE_E_DRAFT_OPERATION_APPLY_ADAPTER_V1;
  }>;
  claims: typeof PATTERN_IMPORT_DXF_PHASE_E_CAD_TABLE_DRAFT_OPERATION_PLANNER_CLAIMS_V1;
}>;

export type PatternImportDxfPhaseECadTableDraftOperationPlannerBlockerV1 = Readonly<{
  code:
    | 'invalid-plan-input'
    | 'operation-identity-required'
    | 'operation-owner-mismatch'
    | 'operation-order-invalid'
    | 'dependency-unresolved'
    | 'dependency-output-conflict'
    | 'unsupported-process-kind'
    | 'process-contract-mismatch'
    | 'connection-cardinality-mismatch'
    | 'connection-identity-conflict'
    | 'stitch-bom-owner-mismatch'
    | 'connection-draft-rejected';
  detail: string;
  operationNumber: number | null;
  processKind: PatternImportDxfPhaseECadTableProcessKindV1 | null;
}>;

export type PatternImportDxfPhaseECadTableDraftOperationPlannerResultV1 =
  | Readonly<{
      ok: true;
      plan: PatternImportDxfPhaseECadTableDraftOperationPlanV1;
      blocker: null;
    }>
  | Readonly<{
      ok: false;
      plan: null;
      blocker: PatternImportDxfPhaseECadTableDraftOperationPlannerBlockerV1;
    }>;

const STABLE_ID = /^[A-Za-z0-9][A-Za-z0-9._:/#-]{0,255}$/;
const SHA256 = /^[0-9a-f]{64}$/;
const PROCESS_KINDS = new Set<PatternImportDxfPhaseECadTableProcessKindV1>([
  'sew',
  'connect',
  'cut',
  'dart',
  'spread',
  'gather',
  'pleat',
  'press',
  'iron',
  'finish',
]);
const CONNECTION_PROCESSES = new Set<PatternImportDxfPhaseECadTableProcessKindV1>([
  'sew',
  'connect',
  'gather',
]);
const FINISH_OPERATION_TYPES = new Set([
  'TECH_CARD_OPERATION_TYPE_THREAD_TRIM',
  'TECH_CARD_OPERATION_TYPE_CLEAN',
  'TECH_CARD_OPERATION_TYPE_INSPECT',
  'TECH_CARD_OPERATION_TYPE_FOLD',
  'TECH_CARD_OPERATION_TYPE_PACK',
  'TECH_CARD_OPERATION_TYPE_WET_PROCESS',
]);
const PRESS_OPERATION_TYPES = new Set([
  'TECH_CARD_OPERATION_TYPE_PRESS',
  'TECH_CARD_OPERATION_TYPE_PRESS_OPEN',
  'TECH_CARD_OPERATION_TYPE_FUSING',
]);

function deepFreeze<T>(value: T, seen = new Set<object>()): T {
  if (!value || typeof value !== 'object' || seen.has(value) || Object.isFrozen(value))
    return value;
  seen.add(value);
  for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child, seen);
  return Object.freeze(value);
}

function blocked(
  code: PatternImportDxfPhaseECadTableDraftOperationPlannerBlockerV1['code'],
  detail: string,
  intent: PatternImportDxfPhaseECadTableOperationIntentV1 | null = null,
): PatternImportDxfPhaseECadTableDraftOperationPlannerResultV1 {
  return Object.freeze({
    ok: false as const,
    plan: null,
    blocker: Object.freeze({
      code,
      detail,
      operationNumber: intent?.operation?.number ?? null,
      processKind: intent?.processKind ?? null,
    }),
  });
}

function sameOrdered(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function enumSet(value: unknown): value is string {
  return typeof value === 'string' && !!value && !value.endsWith('_UNKNOWN');
}

function decimalPositive(value: { value?: string } | null | undefined): boolean {
  const parsed = Number(value?.value);
  return Number.isFinite(parsed) && parsed > 0;
}

function sourceValid(catalog: PatternImportDxfPhaseEDraftOperationSourceCatalogV1): boolean {
  if (
    !catalog ||
    !SHA256.test(catalog.canonicalSha256 ?? '') ||
    !SHA256.test(catalog.sizeSelectionCanonicalSha256 ?? '') ||
    !STABLE_ID.test(catalog.sourceFileId ?? '') ||
    !Array.isArray(catalog.pieces) ||
    !catalog.pieces.length
  )
    return false;
  const identities = catalog.pieces.map((piece) =>
    piece && STABLE_ID.test(piece.pieceId ?? '') && STABLE_ID.test(piece.pieceLineKey ?? '')
      ? `${piece.pieceId}\u0000${piece.pieceLineKey}`
      : '',
  );
  return identities.every(Boolean) && new Set(identities).size === identities.length;
}

function intentShapeValid(intent: PatternImportDxfPhaseECadTableOperationIntentV1): boolean {
  const operation = intent?.operation;
  return (
    !!intent &&
    PROCESS_KINDS.has(intent.processKind) &&
    !!operation &&
    Number.isSafeInteger(operation.number) &&
    operation.number > 0 &&
    typeof operation.work === 'string' &&
    !!operation.work.trim() &&
    Array.isArray(operation.inputKeys) &&
    operation.inputKeys.every((key) => STABLE_ID.test(key)) &&
    typeof operation.outputUnitKey === 'string' &&
    (!operation.outputUnitKey || STABLE_ID.test(operation.outputUnitKey)) &&
    typeof operation.outputUnitName === 'string' &&
    Array.isArray(operation.seamKeys) &&
    operation.seamKeys.every((key) => STABLE_ID.test(key)) &&
    !!intent.current &&
    Array.isArray(intent.materials) &&
    Array.isArray(intent.connections) &&
    intent.connections.every(
      (connection) => !!connection && STABLE_ID.test(connection.intentId ?? ''),
    )
  );
}

function currentMatchesOwner(intent: PatternImportDxfPhaseECadTableOperationIntentV1): boolean {
  const { current, operation } = intent;
  return (
    current.operationNumber === operation.number &&
    current.work?.trim() === operation.work.trim() &&
    sameOrdered(current.inputKeys ?? [], operation.inputKeys) &&
    (current.outputUnitKey ?? '') === operation.outputUnitKey &&
    (current.outputUnitName ?? '') === operation.outputUnitName &&
    sameOrdered(current.seamKeys ?? [], operation.seamKeys)
  );
}

function incompleteFor(
  intent: PatternImportDxfPhaseECadTableOperationIntentV1,
): PatternImportDxfPhaseECadTableIncompleteFieldV1[] {
  const fields: PatternImportDxfPhaseECadTableIncompleteFieldV1[] = [];
  const current = intent.current;
  if (!enumSet(current.zone)) fields.push('zone');
  if (CONNECTION_PROCESSES.has(intent.processKind)) {
    if (!enumSet(current.machineType)) fields.push('machineType');
    if (!intent.stitch?.thread.bomLineKey) fields.push('bomLineKeys');
    if (intent.processKind === 'gather' && !decimalPositive(current.stitching?.fullnessRatio))
      fields.push('stitching.fullnessRatio');
  }
  if (intent.processKind === 'cut' && !enumSet(current.trim?.action)) fields.push('trim.action');
  if (intent.processKind === 'press' || intent.processKind === 'iron') {
    if (!enumSet(current.pressEquipment)) fields.push('pressEquipment');
    if (
      current.operationType === 'TECH_CARD_OPERATION_TYPE_PRESS' &&
      !enumSet(current.press?.action)
    )
      fields.push('press.action');
    if (
      current.press?.action === 'TECH_CARD_PRESS_ACTION_TO_ONE_SIDE' &&
      !enumSet(current.press.toward)
    )
      fields.push('press.toward');
  }
  if (intent.processKind === 'press' && current.operationType === 'TECH_CARD_OPERATION_TYPE_FUSING')
    if (!(current.bomLineKeys ?? []).length) fields.push('bomLineKeys');
  if (intent.processKind === 'finish') {
    if (current.operationType === 'TECH_CARD_OPERATION_TYPE_CLEAN' && !enumSet(current.clean?.kind))
      fields.push('clean.kind');
    if (
      current.operationType === 'TECH_CARD_OPERATION_TYPE_INSPECT' &&
      !enumSet(current.inspect?.coverageMode)
    )
      fields.push('inspect.coverageMode');
    if (
      current.operationType === 'TECH_CARD_OPERATION_TYPE_WET_PROCESS' &&
      !enumSet(current.wetProcessKind)
    )
      fields.push('wetProcessKind');
  }
  return fields;
}

function processIssue(
  intent: PatternImportDxfPhaseECadTableOperationIntentV1,
): PatternImportDxfPhaseECadTableDraftOperationPlannerBlockerV1 | null {
  const { processKind, current, operation, connections, stitch } = intent;
  if (processKind === 'dart' || processKind === 'spread' || processKind === 'pleat')
    return {
      code: 'unsupported-process-kind',
      detail: `${processKind} has no compatible current Assembly Order topology/process contract; the planner will not infer one.`,
      operationNumber: operation.number,
      processKind,
    };
  if (CONNECTION_PROCESSES.has(processKind)) {
    if (
      operation.phaseEKind !== 'stitch' ||
      current.operationType !== 'TECH_CARD_OPERATION_TYPE_MACHINE' ||
      !stitch
    )
      return {
        code: 'process-contract-mismatch',
        detail: `${processKind} requires the retained stitch operation, MACHINE fields and existing stitch visual owner.`,
        operationNumber: operation.number,
        processKind,
      };
    if (
      !connections.length ||
      !sameOrdered(
        operation.seamKeys,
        connections.map((item) => item.intentId),
      )
    )
      return {
        code: 'connection-cardinality-mismatch',
        detail: 'Connection count and order must exact-match the retained operation seamKeys.',
        operationNumber: operation.number,
        processKind,
      };
    if (processKind === 'gather' && connections.some(({ mapping }) => mapping !== 'gathered'))
      return {
        code: 'process-contract-mismatch',
        detail: 'Gather requires every retained exact connection to use the gathered mapping.',
        operationNumber: operation.number,
        processKind,
      };
    return null;
  }
  if (operation.phaseEKind !== null || connections.length || operation.seamKeys.length)
    return {
      code: 'connection-cardinality-mismatch',
      detail: `${processKind} is a zero-connection process and cannot own or synthesize seam keys.`,
      operationNumber: operation.number,
      processKind,
    };
  if (processKind === 'cut' && current.operationType !== 'TECH_CARD_OPERATION_TYPE_TRIM')
    return {
      code: 'process-contract-mismatch',
      detail: 'Cut requires the current TechCardOperation TRIM contract.',
      operationNumber: operation.number,
      processKind,
    };
  if (
    (processKind === 'press' || processKind === 'iron') &&
    !PRESS_OPERATION_TYPES.has(current.operationType ?? '')
  )
    return {
      code: 'process-contract-mismatch',
      detail: `${processKind} requires the current PRESS, PRESS_OPEN or FUSING operation contract.`,
      operationNumber: operation.number,
      processKind,
    };
  if (processKind === 'iron' && current.operationType === 'TECH_CARD_OPERATION_TYPE_FUSING')
    return {
      code: 'process-contract-mismatch',
      detail: 'Iron intent cannot represent a FUSING operation owned by the current row.',
      operationNumber: operation.number,
      processKind,
    };
  if (
    processKind === 'iron' &&
    enumSet(current.pressEquipment) &&
    current.pressEquipment !== 'TECH_CARD_PRESS_EQUIPMENT_IRON'
  )
    return {
      code: 'process-contract-mismatch',
      detail: 'Iron intent cannot overwrite a different press equipment owned by the current row.',
      operationNumber: operation.number,
      processKind,
    };
  if (processKind === 'finish' && !FINISH_OPERATION_TYPES.has(current.operationType ?? ''))
    return {
      code: 'process-contract-mismatch',
      detail:
        'Finish requires a current thread-trim, clean, inspect, fold, pack or wet-process contract.',
      operationNumber: operation.number,
      processKind,
    };
  return null;
}

function zeroGraphKind(
  processKind: Exclude<PatternImportDxfPhaseECadTableProcessKindV1, 'dart' | 'spread' | 'pleat'>,
): 'place' | 'release-support' {
  return processKind === 'cut' ? 'release-support' : 'place';
}

/**
 * Maps current table intents to detached ordered Draft Operations. It validates and routes only;
 * Apply remains owned by the existing import/semantics boundary.
 */
export function planPatternImportDxfPhaseECadTableDraftOperationsV1(
  catalog: PatternImportDxfPhaseEDraftOperationSourceCatalogV1,
  rawIntents: readonly PatternImportDxfPhaseECadTableOperationIntentV1[],
): PatternImportDxfPhaseECadTableDraftOperationPlannerResultV1 {
  let intents: PatternImportDxfPhaseECadTableOperationIntentV1[];
  try {
    intents = [...structuredClone(rawIntents)];
  } catch {
    return blocked('invalid-plan-input', 'The CAD table plan must be detached cloneable data.');
  }
  if (!sourceValid(catalog) || !Array.isArray(intents) || !intents.length)
    return blocked(
      'invalid-plan-input',
      'The CAD table planner requires one current exact catalog and at least one operation intent.',
    );
  if (intents.some((intent) => !intentShapeValid(intent)))
    return blocked(
      'invalid-plan-input',
      'Every table intent requires one retained operation, current field projection and connection list.',
    );

  intents.sort((left, right) => left.operation.number - right.operation.number);
  const operationRefs = new Set<string>();
  const operationNumbers = new Set<number>();
  const connectionRefs = new Set<string>();
  let previousStage = -1;
  for (const intent of intents) {
    const operationRef = intent.operation?.authoringOperationId;
    if (!operationRef || !STABLE_ID.test(operationRef))
      return blocked(
        'operation-identity-required',
        'The planner reuses one retained operation identity and never falls back to its number.',
        intent,
      );
    if (
      operationRefs.has(operationRef) ||
      operationNumbers.has(intent.operation.number) ||
      !Number.isSafeInteger(intent.stage) ||
      intent.stage < previousStage
    )
      return blocked(
        'operation-order-invalid',
        'Operation identities and numbers must be unique and stages nondecreasing in Assembly Order.',
        intent,
      );
    if (!currentMatchesOwner(intent))
      return blocked(
        'operation-owner-mismatch',
        'The current TechCardOperation fields no longer exact-match the retained Assembly operation.',
        intent,
      );
    for (const connection of intent.connections) {
      if (connectionRefs.has(connection.intentId))
        return blocked(
          'connection-identity-conflict',
          'Every retained exact connection identity may occur once in the session plan.',
          intent,
        );
      connectionRefs.add(connection.intentId);
    }
    const issue = processIssue(intent);
    if (issue)
      return Object.freeze({ ok: false as const, plan: null, blocker: Object.freeze(issue) });
    operationRefs.add(operationRef);
    operationNumbers.add(intent.operation.number);
    previousStage = intent.stage;
  }

  const pieceLineKeys = new Set(catalog.pieces.map(({ pieceLineKey }) => pieceLineKey));
  const outputOwners = new Map<string, string>();
  const planned: PatternImportDxfPhaseECadTablePlannedOperationV1[] = [];
  for (const [order, intent] of intents.entries()) {
    const operationRef = intent.operation.authoringOperationId!;
    const dependencies: string[] = [];
    for (const inputKey of intent.operation.inputKeys) {
      if (pieceLineKeys.has(inputKey)) continue;
      const owner = outputOwners.get(inputKey);
      if (!owner)
        return blocked(
          'dependency-unresolved',
          `Input ${inputKey} is neither a current catalog piece nor an earlier planned output.`,
          intent,
        );
      if (!dependencies.includes(owner)) dependencies.push(owner);
    }
    if (intent.operation.outputUnitKey) {
      const priorOwner = outputOwners.get(intent.operation.outputUnitKey);
      if (
        pieceLineKeys.has(intent.operation.outputUnitKey) ||
        (priorOwner && !intent.operation.inputKeys.includes(intent.operation.outputUnitKey))
      )
        return blocked(
          'dependency-output-conflict',
          `Output ${intent.operation.outputUnitKey} conflicts with an existing piece or unconsumed unit.`,
          intent,
        );
      outputOwners.set(intent.operation.outputUnitKey, operationRef);
    }

    let route: PatternImportDxfPhaseECadTableDraftOperationRouteV1;
    if (!intent.connections.length) {
      const processKind = intent.processKind as Exclude<
        PatternImportDxfPhaseECadTableProcessKindV1,
        'dart' | 'spread' | 'pleat'
      >;
      route = {
        cardinality: 'zero',
        action: {
          schemaVersion: PATTERN_IMPORT_DXF_PHASE_E_GOLDEN_CARD_ZERO_SEAM_ACTION_V1,
          status: 'session-only-table-action',
          source: {
            catalogCanonicalSha256: catalog.canonicalSha256,
            sizeSelectionCanonicalSha256: catalog.sizeSelectionCanonicalSha256,
            sourceFileId: catalog.sourceFileId,
          },
          stage: intent.stage,
          graphKind: zeroGraphKind(processKind),
          operation: structuredClone(intent.operation),
          apply: {
            eligible: false,
            boundary: PATTERN_IMPORT_DXF_PHASE_E_DRAFT_OPERATION_APPLY_ADAPTER_V1,
          },
        },
        drafts: [],
      };
    } else {
      const threadBomLineKey = intent.stitch!.thread.bomLineKey;
      if (threadBomLineKey && !(intent.current.bomLineKeys ?? []).includes(threadBomLineKey))
        return blocked(
          'stitch-bom-owner-mismatch',
          `Stitch thread ${threadBomLineKey} is not retained by the current operation BOM owner.`,
          intent,
        );
      const drafts: PatternImportDxfPhaseEDraftOperationV1[] = [];
      for (const connection of intent.connections) {
        const result = createPatternImportDxfPhaseEDraftOperationFromConnectionV1({
          catalog,
          // Reuse the retained connection identity; no extra persisted or session ID is minted.
          draftOperationId: connection.intentId,
          stage: intent.stage,
          connection,
          references: {
            operation: intent.operation,
            stitch: intent.stitch!,
            materials: intent.materials,
          },
        });
        if (!result.ok)
          return blocked(
            'connection-draft-rejected',
            `Existing exact connection helper rejected ${connection.intentId}: ${result.blocker.detail}`,
            intent,
          );
        drafts.push(result.draft);
      }
      route =
        drafts.length === 1
          ? { cardinality: 'one', action: null, drafts: [drafts[0]!] }
          : {
              cardinality: 'multi',
              transactionId: operationRef,
              action: null,
              drafts: drafts as [
                PatternImportDxfPhaseEDraftOperationV1,
                PatternImportDxfPhaseEDraftOperationV1,
                ...PatternImportDxfPhaseEDraftOperationV1[],
              ],
            };
    }
    const incompleteFields = incompleteFor(intent);
    planned.push({
      operationRef,
      operationNumber: intent.operation.number,
      order,
      stage: intent.stage,
      processKind:
        intent.processKind as PatternImportDxfPhaseECadTablePlannedOperationV1['processKind'],
      dependsOnOperationRefs: dependencies,
      readiness: incompleteFields.length
        ? 'incomplete-current-operation'
        : 'complete-session-draft',
      incompleteFields,
      current: structuredClone(intent.current),
      route,
      apply: {
        eligible: false,
        boundary: PATTERN_IMPORT_DXF_PHASE_E_DRAFT_OPERATION_APPLY_ADAPTER_V1,
      },
    });
  }

  return Object.freeze({
    ok: true as const,
    plan: deepFreeze({
      schemaVersion: PATTERN_IMPORT_DXF_PHASE_E_CAD_TABLE_DRAFT_OPERATION_PLAN_V1,
      status: 'session-only-draft-plan' as const,
      source: {
        catalogCanonicalSha256: catalog.canonicalSha256,
        sizeSelectionCanonicalSha256: catalog.sizeSelectionCanonicalSha256,
        sourceFileId: catalog.sourceFileId,
      },
      operations: planned,
      apply: {
        eligible: false as const,
        boundary: PATTERN_IMPORT_DXF_PHASE_E_DRAFT_OPERATION_APPLY_ADAPTER_V1,
      },
      claims: PATTERN_IMPORT_DXF_PHASE_E_CAD_TABLE_DRAFT_OPERATION_PLANNER_CLAIMS_V1,
    }),
    blocker: null,
  });
}
