import { verbTokenToEnum, type WorkCatalog, type WorkItem } from '../../operation-work';

import type { PatternImportDxfPhaseECadTableCurrentOperationV1 } from './cad-table-draft-operation-planner-v1';
import type { PatternImportDxfPhaseECadCommandDraftV1 } from './cad-table-draft-operation-session-bridge-v1';
import type {
  PatternImportDxfPhaseEDraftCadCompiledFeatureV1,
  PatternImportDxfPhaseEDraftCadGeometryCompileArtifactV1,
} from './draft-cad-geometry-compile-v1';
import type { PatternImportDxfPhaseEDraftCadToolV1 } from './draft-cad-session-v1';

export const PATTERN_IMPORT_DXF_PHASE_E_CAD_SEMANTIC_REIMPORT_RECEIPT_V1 =
  'pattern-import-dxf-phase-e-cad-semantic-reimport-receipt/1' as const;

export const PATTERN_IMPORT_DXF_PHASE_E_CAD_SEMANTIC_OPERATION_COMPILE_CLAIMS_V1 = Object.freeze({
  sessionIntentDraftAppendable: true,
  sessionIntentAloneAcceptedAsPersistedGeometry: false,
  detachedCompileAloneAccepted: false,
  compiledDxfHashMustMatchReimportedSourceHash: true,
  ordinaryImportSemanticsPhaseDPhaseERequired: true,
  existingWorkCatalogRequired: true,
  existingOperationTypeVocabularyReused: true,
  tableLayoutMoveIsGeometryMutation: false,
  genericHandworkFallbackOnlyAfterExactReimport: true,
  writesDxf: false,
  writesNetwork: false,
  createsOperationOwner: false,
} as const);

type CompiledFeature = Readonly<
  Pick<PatternImportDxfPhaseEDraftCadCompiledFeatureV1, 'commandId' | 'tool' | 'output' | 'pieceId'>
>;

export type PatternImportDxfPhaseECadSemanticCompiledCorrelationV1 = Readonly<{
  sourceRevision: number;
  compiledDxfSha256: string;
  scope: Readonly<{ techCardId: number; scopeKey: string; sizeToken: string }>;
  source: Readonly<{
    catalogCanonicalSha256: string;
    sizeSelectionCanonicalSha256: string;
  }>;
  compiledFeatures: readonly CompiledFeature[];
}>;

/**
 * Owner evidence minted only after the detached compiler output has travelled through the ordinary
 * import → semantics → Phase-D → Phase-E path. It is intentionally not constructible from the CAD
 * session or compile UI receipt alone.
 */
export type PatternImportDxfPhaseECadSemanticReimportReceiptV1 = Readonly<{
  schemaVersion: typeof PATTERN_IMPORT_DXF_PHASE_E_CAD_SEMANTIC_REIMPORT_RECEIPT_V1;
  status: 'ordinary-reimport-confirmed';
  sourceRevision: number;
  compiledDxfSha256: string;
  reimported: Readonly<{
    techCardId: number;
    scopeKey: string;
    sizeToken: string;
    sourceFileId: string;
    sourceSha256: string;
    catalogCanonicalSha256: string;
    sizeSelectionCanonicalSha256: string;
  }>;
  source: Readonly<{
    catalogCanonicalSha256: string;
    sizeSelectionCanonicalSha256: string;
  }>;
  compiledFeatures: readonly CompiledFeature[];
  claims: typeof PATTERN_IMPORT_DXF_PHASE_E_CAD_SEMANTIC_OPERATION_COMPILE_CLAIMS_V1;
}>;

export type PatternImportDxfPhaseECadSemanticOperationRowV1 = Readonly<{
  historyKey: string;
  draft: true;
  operationType: NonNullable<PatternImportDxfPhaseECadTableCurrentOperationV1['operationType']>;
  zone: string;
  work: string;
  inputKeys: readonly [string];
  semanticTool: PatternImportDxfPhaseEDraftCadToolV1;
  semanticWorkSource: 'conservative-session-draft' | 'verified-reimport-work-catalog';
  persistenceStatus: 'persistence-pending' | 'verified-reimport';
}>;

export type PatternImportDxfPhaseECadSemanticOperationCompileBlockerV1 = Readonly<{
  code:
    | 'cad-semantic-session-only-reimport-required'
    | 'cad-semantic-reimport-receipt-invalid'
    | 'cad-semantic-reimport-command-missing'
    | 'cad-semantic-reimport-command-ambiguous'
    | 'cad-semantic-reimport-output-mismatch'
    | 'cad-semantic-work-mapping-unavailable';
  detail: string;
  draftOperationId: string | null;
}>;

export type PatternImportDxfPhaseECadProductiveGestureAuditV1 =
  | Readonly<{
      ok: true;
      gesture: 'point' | 'rectangle' | 'circle' | 'ellipse' | 'cut';
      commandTool: 'add-point' | 'rectangle' | 'circle' | 'ellipse' | 'cut';
      blocker: null;
    }>
  | Readonly<{
      ok: false;
      gesture: 'move';
      commandTool: null;
      blocker: PatternImportDxfPhaseECadSemanticOperationCompileBlockerV1;
    }>;

export type PatternImportDxfPhaseECadSemanticOperationCompileResultV1 =
  | Readonly<{
      ok: true;
      rows: readonly PatternImportDxfPhaseECadSemanticOperationRowV1[];
      receipt: PatternImportDxfPhaseECadSemanticReimportReceiptV1 | null;
      persistence:
        | Readonly<{
            status: 'persistence-pending';
            blocker: PatternImportDxfPhaseECadSemanticOperationCompileBlockerV1;
          }>
        | Readonly<{ status: 'verified-reimport'; blocker: null }>;
      blocker: null;
      claims: typeof PATTERN_IMPORT_DXF_PHASE_E_CAD_SEMANTIC_OPERATION_COMPILE_CLAIMS_V1;
    }>
  | Readonly<{
      ok: false;
      rows: null;
      receipt: null;
      persistence: null;
      blocker: PatternImportDxfPhaseECadSemanticOperationCompileBlockerV1;
      claims: typeof PATTERN_IMPORT_DXF_PHASE_E_CAD_SEMANTIC_OPERATION_COMPILE_CLAIMS_V1;
    }>;

export type PatternImportDxfPhaseECadSemanticReimportReceiptResultV1 =
  | Readonly<{
      ok: true;
      receipt: PatternImportDxfPhaseECadSemanticReimportReceiptV1;
      blocker: null;
    }>
  | Readonly<{
      ok: false;
      receipt: null;
      blocker: PatternImportDxfPhaseECadSemanticOperationCompileBlockerV1;
    }>;

export type PatternImportDxfPhaseECadSemanticCompiledCorrelationResultV1 =
  | Readonly<{
      ok: true;
      correlation: PatternImportDxfPhaseECadSemanticCompiledCorrelationV1;
      blocker: null;
    }>
  | Readonly<{
      ok: false;
      correlation: null;
      blocker: PatternImportDxfPhaseECadSemanticOperationCompileBlockerV1;
    }>;

const SHA256 = /^[0-9a-f]{64}$/;

function deepFreeze<T>(value: T, seen = new Set<object>()): T {
  if (!value || typeof value !== 'object' || seen.has(value) || Object.isFrozen(value))
    return value;
  seen.add(value);
  for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child, seen);
  return Object.freeze(value);
}

function blocker(
  code: PatternImportDxfPhaseECadSemanticOperationCompileBlockerV1['code'],
  detail: string,
  draftOperationId: string | null = null,
): PatternImportDxfPhaseECadSemanticOperationCompileBlockerV1 {
  return Object.freeze({ code, detail, draftOperationId });
}

/** Table layout movement is deliberately audited out: it changes arrangement, not pattern data. */
export function auditPatternImportDxfPhaseECadProductiveGestureV1(
  gesture: 'move' | 'point' | 'rectangle' | 'circle' | 'ellipse' | 'cut',
): PatternImportDxfPhaseECadProductiveGestureAuditV1 {
  if (gesture === 'move')
    return Object.freeze({
      ok: false as const,
      gesture,
      commandTool: null,
      blocker: blocker(
        'cad-semantic-session-only-reimport-required',
        'Moving a piece on the table is session layout only and does not create pattern geometry or an Assembly Order operation.',
      ),
    });
  return Object.freeze({
    ok: true as const,
    gesture,
    commandTool: gesture === 'point' ? ('add-point' as const) : gesture,
    blocker: null,
  }) as PatternImportDxfPhaseECadProductiveGestureAuditV1;
}

function blocked(
  code: PatternImportDxfPhaseECadSemanticOperationCompileBlockerV1['code'],
  detail: string,
  draftOperationId: string | null = null,
): Extract<PatternImportDxfPhaseECadSemanticOperationCompileResultV1, { ok: false }> {
  return Object.freeze({
    ok: false as const,
    rows: null,
    receipt: null,
    persistence: null,
    blocker: blocker(code, detail, draftOperationId),
    claims: PATTERN_IMPORT_DXF_PHASE_E_CAD_SEMANTIC_OPERATION_COMPILE_CLAIMS_V1,
  });
}

function hex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * Correlates the actual detached DXF bytes with a caller-owned fresh re-import binding. This helper
 * does no I/O and cannot create the re-import evidence it consumes.
 */
export async function createPatternImportDxfPhaseECadSemanticReimportReceiptV1(
  input: Readonly<{
    artifact: PatternImportDxfPhaseEDraftCadGeometryCompileArtifactV1;
    reimported: PatternImportDxfPhaseECadSemanticReimportReceiptV1['reimported'];
  }>,
  crypto: Pick<Crypto, 'subtle'> | undefined = globalThis.crypto,
): Promise<PatternImportDxfPhaseECadSemanticReimportReceiptResultV1> {
  const { artifact, reimported } = input;
  const correlated = await createPatternImportDxfPhaseECadSemanticCompiledCorrelationV1(
    artifact,
    crypto,
  );
  if (!correlated.ok)
    return Object.freeze({ ok: false as const, receipt: null, blocker: correlated.blocker });
  return createPatternImportDxfPhaseECadSemanticReimportReceiptFromCorrelationV1({
    correlation: correlated.correlation,
    reimported,
  });
}

/**
 * Projects a compiler artifact into the exact, raw-free correlation that may survive only for the
 * current card session. The DXF string and detached writer job are dropped before publication.
 */
export async function createPatternImportDxfPhaseECadSemanticCompiledCorrelationV1(
  artifact: PatternImportDxfPhaseEDraftCadGeometryCompileArtifactV1,
  crypto: Pick<Crypto, 'subtle'> | undefined = globalThis.crypto,
): Promise<PatternImportDxfPhaseECadSemanticCompiledCorrelationResultV1> {
  if (
    artifact?.status !== 'compiled-reimport-required' ||
    artifact.reimport.boundary !== 'ordinary-import-semantics-phase-d-phase-e' ||
    artifact.reimport.applyEligible !== false ||
    !crypto?.subtle ||
    typeof crypto.subtle.digest !== 'function' ||
    !SHA256.test(artifact.source.catalogCanonicalSha256) ||
    !SHA256.test(artifact.source.sizeSelectionCanonicalSha256) ||
    !Number.isSafeInteger(artifact.source.revision) ||
    artifact.source.revision < 1
  )
    return Object.freeze({
      ok: false as const,
      correlation: null,
      blocker: blocker(
        'cad-semantic-reimport-receipt-invalid',
        'An exact compiled-output binding is required.',
      ),
    });

  let compiledDxfSha256: string;
  try {
    const encoded = new TextEncoder().encode(artifact.dxfText);
    compiledDxfSha256 = hex(
      new Uint8Array(await crypto.subtle.digest('SHA-256', encoded.slice().buffer)),
    );
  } catch {
    return Object.freeze({
      ok: false as const,
      correlation: null,
      blocker: blocker(
        'cad-semantic-reimport-receipt-invalid',
        'The detached compiled DXF hash could not be verified.',
      ),
    });
  }

  const compiledFeatures = artifact.compiledFeatures.map(
    ({ commandId, tool, output, pieceId }) => ({ commandId, tool, output, pieceId }),
  );
  if (
    compiledFeatures.length === 0 ||
    new Set(compiledFeatures.map(({ commandId }) => commandId)).size !== compiledFeatures.length
  )
    return Object.freeze({
      ok: false as const,
      correlation: null,
      blocker: blocker(
        'cad-semantic-reimport-receipt-invalid',
        'Compiled feature command identities must be present and unique.',
      ),
    });

  return deepFreeze({
    ok: true as const,
    correlation: {
      sourceRevision: artifact.source.revision,
      compiledDxfSha256,
      scope: { ...artifact.scope },
      source: {
        catalogCanonicalSha256: artifact.source.catalogCanonicalSha256,
        sizeSelectionCanonicalSha256: artifact.source.sizeSelectionCanonicalSha256,
      },
      compiledFeatures,
    },
    blocker: null,
  });
}

/** Mints a receipt only from a raw-free compiled correlation and a confirmed fresh import. */
export function createPatternImportDxfPhaseECadSemanticReimportReceiptFromCorrelationV1(input: {
  correlation: PatternImportDxfPhaseECadSemanticCompiledCorrelationV1;
  reimported: PatternImportDxfPhaseECadSemanticReimportReceiptV1['reimported'];
}): PatternImportDxfPhaseECadSemanticReimportReceiptResultV1 {
  const { correlation, reimported } = input;
  if (
    reimported.techCardId !== correlation.scope.techCardId ||
    reimported.scopeKey !== correlation.scope.scopeKey ||
    reimported.sizeToken !== correlation.scope.sizeToken ||
    !reimported.sourceFileId ||
    !SHA256.test(reimported.sourceSha256) ||
    !SHA256.test(reimported.catalogCanonicalSha256) ||
    !SHA256.test(reimported.sizeSelectionCanonicalSha256) ||
    correlation.compiledDxfSha256 !== reimported.sourceSha256
  )
    return Object.freeze({
      ok: false as const,
      receipt: null,
      blocker: blocker(
        'cad-semantic-reimport-receipt-invalid',
        'The confirmed fresh re-import source does not exact-match the compiled DXF correlation.',
      ),
    });
  return deepFreeze({
    ok: true as const,
    receipt: {
      schemaVersion: PATTERN_IMPORT_DXF_PHASE_E_CAD_SEMANTIC_REIMPORT_RECEIPT_V1,
      status: 'ordinary-reimport-confirmed' as const,
      sourceRevision: correlation.sourceRevision,
      compiledDxfSha256: correlation.compiledDxfSha256,
      reimported: { ...reimported },
      source: { ...correlation.source },
      compiledFeatures: correlation.compiledFeatures.map((feature) => ({ ...feature })),
      claims: PATTERN_IMPORT_DXF_PHASE_E_CAD_SEMANTIC_OPERATION_COMPILE_CLAIMS_V1,
    },
    blocker: null,
  });
}

type SemanticMapping = Readonly<{
  workToken: 'hand_work' | 'other';
  expectedOperationType: 'TECH_CARD_OPERATION_TYPE_HANDWORK' | 'TECH_CARD_OPERATION_TYPE_OTHER';
  expectedOutput: PatternImportDxfPhaseEDraftCadCompiledFeatureV1['output'] | null;
}>;

function mappingFor(tool: PatternImportDxfPhaseEDraftCadToolV1): SemanticMapping {
  if (tool === 'cut')
    return {
      // A pattern split is not the factory's trim-allowance operation. The existing vocabulary can
      // prove only OTHER here; the exact CAD tool remains in the note and semanticTool field.
      workToken: 'other',
      expectedOperationType: 'TECH_CARD_OPERATION_TYPE_OTHER',
      expectedOutput: 'split',
    };
  if (tool === 'add-point')
    return {
      workToken: 'other',
      expectedOperationType: 'TECH_CARD_OPERATION_TYPE_OTHER',
      expectedOutput: 'boundary-point',
    };
  if (tool === 'pen' || tool === 'rectangle' || tool === 'circle' || tool === 'ellipse')
    return {
      workToken: 'hand_work',
      expectedOperationType: 'TECH_CARD_OPERATION_TYPE_HANDWORK',
      expectedOutput: 'piece-create',
    };
  return {
    workToken: 'hand_work',
    expectedOperationType: 'TECH_CARD_OPERATION_TYPE_HANDWORK',
    expectedOutput: null,
  };
}

function exactWork(catalog: WorkCatalog, mapping: SemanticMapping): WorkItem | null {
  const item = catalog.byToken.get(mapping.workToken);
  return item && !item.retired && verbTokenToEnum(item.verb) === mapping.expectedOperationType
    ? item
    : null;
}

/**
 * Produces semantic Assembly Order rows only after an exact ordinary re-import receipt. Canvas
 * layout movement intentionally has no command here: it is arrangement state, not pattern geometry.
 */
export function compilePatternImportDxfPhaseECadSemanticOperationsV1(
  input: Readonly<{
    drafts: readonly PatternImportDxfPhaseECadCommandDraftV1[];
    currentOperation: PatternImportDxfPhaseECadTableCurrentOperationV1;
    workCatalog: WorkCatalog;
    reimportReceipt: PatternImportDxfPhaseECadSemanticReimportReceiptV1 | null;
  }>,
): PatternImportDxfPhaseECadSemanticOperationCompileResultV1 {
  const receipt = input.reimportReceipt;
  const first = input.drafts[0];
  if (!first)
    return blocked(
      'cad-semantic-reimport-receipt-invalid',
      'At least one exact CAD draft is required for semantic compilation.',
    );
  if (
    first.operationNumber !== input.currentOperation.operationNumber ||
    input.drafts.some(
      (draft) =>
        draft.sourceRevision !== first.sourceRevision ||
        draft.operationNumber !== first.operationNumber ||
        draft.operationRef !== first.operationRef ||
        draft.sourceCatalogCanonicalSha256 !== first.sourceCatalogCanonicalSha256 ||
        draft.sourceSizeSelectionCanonicalSha256 !== first.sourceSizeSelectionCanonicalSha256,
    )
  )
    return blocked(
      'cad-semantic-reimport-receipt-invalid',
      'Selected CAD drafts do not share one exact source and current operation binding.',
    );
  if (!receipt) {
    const mapping: SemanticMapping = {
      workToken: 'hand_work',
      expectedOperationType: 'TECH_CARD_OPERATION_TYPE_HANDWORK',
      expectedOutput: null,
    };
    const work = exactWork(input.workCatalog, mapping);
    if (!work)
      return blocked(
        'cad-semantic-work-mapping-unavailable',
        'Work catalog token hand_work does not provide the expected conservative draft type.',
      );
    const rows = input.drafts.map((draft) =>
      Object.freeze({
        historyKey: draft.draftOperationId,
        draft: true as const,
        operationType: mapping.expectedOperationType,
        zone: input.currentOperation.zone || 'TECH_CARD_GARMENT_ZONE_OTHER',
        work: work.token,
        inputKeys: Object.freeze([draft.target.pieceLineKey]) as readonly [string],
        semanticTool: draft.tool,
        semanticWorkSource: 'conservative-session-draft' as const,
        persistenceStatus: 'persistence-pending' as const,
      }),
    );
    const boundary = blocker(
      'cad-semantic-session-only-reimport-required',
      'Draft appended; geometry persistence remains pending until compiled DXF is re-imported through import → semantics → Phase-D → Phase-E.',
    );
    return Object.freeze({
      ok: true as const,
      rows: Object.freeze(rows),
      receipt: null,
      persistence: Object.freeze({ status: 'persistence-pending' as const, blocker: boundary }),
      blocker: null,
      claims: PATTERN_IMPORT_DXF_PHASE_E_CAD_SEMANTIC_OPERATION_COMPILE_CLAIMS_V1,
    });
  }
  if (
    receipt.schemaVersion !== PATTERN_IMPORT_DXF_PHASE_E_CAD_SEMANTIC_REIMPORT_RECEIPT_V1 ||
    receipt.status !== 'ordinary-reimport-confirmed' ||
    !SHA256.test(receipt.compiledDxfSha256) ||
    receipt.compiledDxfSha256 !== receipt.reimported.sourceSha256 ||
    receipt.sourceRevision !== first.sourceRevision ||
    receipt.source.catalogCanonicalSha256 !== first.sourceCatalogCanonicalSha256 ||
    receipt.source.sizeSelectionCanonicalSha256 !== first.sourceSizeSelectionCanonicalSha256 ||
    first.operationNumber !== input.currentOperation.operationNumber
  )
    return blocked(
      'cad-semantic-reimport-receipt-invalid',
      'The semantic handoff does not exact-match the compiled source, fresh re-import or current operation.',
    );

  const byCommand = new Map<string, CompiledFeature[]>();
  for (const feature of receipt.compiledFeatures) {
    const current = byCommand.get(feature.commandId) ?? [];
    current.push(feature);
    byCommand.set(feature.commandId, current);
  }
  const rows: PatternImportDxfPhaseECadSemanticOperationRowV1[] = [];
  for (const draft of input.drafts) {
    const matches = byCommand.get(draft.commandId) ?? [];
    if (!matches.length)
      return blocked(
        'cad-semantic-reimport-command-missing',
        `Fresh re-import evidence does not contain command ${draft.commandId}.`,
        draft.draftOperationId,
      );
    if (matches.length !== 1)
      return blocked(
        'cad-semantic-reimport-command-ambiguous',
        `Fresh re-import evidence contains command ${draft.commandId} more than once.`,
        draft.draftOperationId,
      );
    const feature = matches[0]!;
    const mapping = mappingFor(draft.tool);
    if (
      feature.tool !== draft.tool ||
      (mapping.expectedOutput !== null && feature.output !== mapping.expectedOutput)
    )
      return blocked(
        'cad-semantic-reimport-output-mismatch',
        `Compiled output ${feature.output} cannot prove ${draft.tool} semantics.`,
        draft.draftOperationId,
      );
    const work = exactWork(input.workCatalog, mapping);
    if (!work)
      return blocked(
        'cad-semantic-work-mapping-unavailable',
        `Work catalog token ${mapping.workToken} does not provide the expected operation type.`,
        draft.draftOperationId,
      );
    rows.push(
      Object.freeze({
        historyKey: draft.draftOperationId,
        draft: true as const,
        operationType: mapping.expectedOperationType,
        zone: input.currentOperation.zone || 'TECH_CARD_GARMENT_ZONE_OTHER',
        work: work.token,
        inputKeys: Object.freeze([draft.target.pieceLineKey]) as readonly [string],
        semanticTool: draft.tool,
        semanticWorkSource: 'verified-reimport-work-catalog' as const,
        persistenceStatus: 'verified-reimport' as const,
      }),
    );
  }

  return Object.freeze({
    ok: true as const,
    rows: Object.freeze(rows),
    receipt,
    persistence: Object.freeze({ status: 'verified-reimport' as const, blocker: null }),
    blocker: null,
    claims: PATTERN_IMPORT_DXF_PHASE_E_CAD_SEMANTIC_OPERATION_COMPILE_CLAIMS_V1,
  });
}
