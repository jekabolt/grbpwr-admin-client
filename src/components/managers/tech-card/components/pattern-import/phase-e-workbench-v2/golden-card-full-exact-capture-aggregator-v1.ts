import type { DxfProductSavedRowIdentityV1 } from 'lib/pattern-import/dxf-product-saved-reprocess-owner-v1';
import {
  PATTERN_IMPORT_DXF_PRODUCT_PHASE_E_EXACT_TOPOLOGY_BINDING_SEAL_V1,
  PATTERN_IMPORT_DXF_PRODUCT_PHASE_E_EXACT_TOPOLOGY_BINDING_V1,
  type PatternImportDxfProductPhaseEExactTopologySideBindingV1,
} from 'lib/cloth/domain/pattern-import-dxf-product-phase-e-exact-topology-binding-v1';

import {
  PATTERN_IMPORT_DXF_PHASE_E_GOLDEN_WHOLE_CARD_BASELINE_CLAIMS_V1,
  PATTERN_IMPORT_DXF_PHASE_E_GOLDEN_WHOLE_CARD_COVERAGE_RECEIPT_V1,
  type PatternImportDxfPhaseEGoldenWholeCardCoverageReceiptV1,
} from './golden-whole-card-baseline-v1';
import {
  PATTERN_IMPORT_DXF_PHASE_E_SERVER_TRANSACTIONAL_SAVED_ASSEMBLY_V1,
  type PatternImportDxfPhaseESavedRowAuthoritativeAssemblyEvidenceV1,
} from './saved-row-preparation-owner-v1';

export const PATTERN_IMPORT_DXF_PHASE_E_GOLDEN_CARD_FULL_EXACT_CAPTURE_GRAPH_V1 =
  'pattern-import-dxf-phase-e-golden-card-full-exact-capture-graph/1' as const;
export const PATTERN_IMPORT_DXF_PHASE_E_GOLDEN_CARD_FULL_EXACT_CAPTURE_AGGREGATOR_V1 =
  'pattern-import-dxf-phase-e-golden-card-full-exact-capture-aggregator/1' as const;

const STABLE_REF = /^[A-Za-z0-9][A-Za-z0-9._:/#-]{0,255}$/;
const SHA256 = /^[0-9a-f]{64}$/;
const MAX_OPERATIONS = 8_192;
const MAX_SNAPSHOTS = 8_192;
const encoder = new TextEncoder();

export const PATTERN_IMPORT_DXF_PHASE_E_GOLDEN_CARD_FULL_EXACT_CAPTURE_CLAIMS_V1 = Object.freeze({
  callerSuppliedVerifiedSavedSnapshotsRequired: true,
  expectedTechCardLockAndAssemblyRevisionRequired: true,
  fullOperationGraphExactMatchedAcrossSnapshots: true,
  operationSeamIdentitiesUnique: true,
  selectedOperationIdentitiesUnique: true,
  exactSideIdentitiesUnique: true,
  zeroSeamOperationsRequireNoExactSnapshot: true,
  exactlyTwoSeamsPerExactSnapshotRequired: true,
  oneSeamOperationsUnsupported: true,
  multiSeamOperationsUnsupported: true,
  completeExactCoverageRequired: true,
  existingStylingCoverageReceiptRequired: true,
  unifiedCatalogCreated: false,
  materialBomColorwayAuthorityCreated: false,
  authoritativeReconstructionBaselineCreated: false,
  networkUsed: false,
  networkWriteAvailable: false,
  uiIntegrated: false,
  productionReady: false,
} as const);

export type PatternImportDxfPhaseEGoldenCardFullExactConnectionV1 = Readonly<{
  connectionRef: string;
  operationNumber: number;
  authoringOperationId: string;
  row: DxfProductSavedRowIdentityV1;
  serverTopologySha256: string;
  catalogCanonicalSha256: string;
  sides: readonly [
    PatternImportDxfProductPhaseEExactTopologySideBindingV1,
    PatternImportDxfProductPhaseEExactTopologySideBindingV1,
  ];
}>;

export type PatternImportDxfPhaseEGoldenCardFullExactOperationV1 = Readonly<{
  operationNumber: number;
  work: string;
  inputKeys: readonly string[];
  outputUnitKey: string;
  outputUnitName: string;
  seamKeys: readonly string[];
  exactConnections: readonly PatternImportDxfPhaseEGoldenCardFullExactConnectionV1[];
}>;

export type PatternImportDxfPhaseEGoldenCardFullExactCaptureGraphV1 = Readonly<{
  schemaVersion: typeof PATTERN_IMPORT_DXF_PHASE_E_GOLDEN_CARD_FULL_EXACT_CAPTURE_GRAPH_V1;
  cardRef: string;
  techCardId: number;
  cardLockVersion: number;
  serverAssemblyRevision: string;
  operations: readonly PatternImportDxfPhaseEGoldenCardFullExactOperationV1[];
  connections: readonly PatternImportDxfPhaseEGoldenCardFullExactConnectionV1[];
  claims: typeof PATTERN_IMPORT_DXF_PHASE_E_GOLDEN_CARD_FULL_EXACT_CAPTURE_CLAIMS_V1;
}>;

export type PatternImportDxfPhaseEGoldenCardFullExactCaptureRequestV1 = Readonly<{
  cardRef: string;
  expectedTechCardId: number;
  expectedCardLockVersion: number;
  expectedServerAssemblyRevision: string;
  /** Styling/structure join already produced by the current GetTechCard + snapshot live reader. */
  coverageTemplate: PatternImportDxfPhaseEGoldenWholeCardCoverageReceiptV1;
  /** Results returned by the existing verified fixed-lock authoritative snapshot adapter. */
  operationSnapshots: readonly PatternImportDxfPhaseESavedRowAuthoritativeAssemblyEvidenceV1[];
}>;

export type PatternImportDxfPhaseEGoldenCardFullExactCaptureBlockerCodeV1 =
  | 'invalid-request'
  | 'snapshot-missing'
  | 'tech-card-mismatch'
  | 'card-lock-mismatch'
  | 'server-assembly-revision-mismatch'
  | 'operation-graph-mismatch'
  | 'operation-identity-duplicate'
  | 'output-unit-identity-duplicate'
  | 'seam-identity-duplicate'
  | 'selected-operation-missing'
  | 'selected-operation-duplicate'
  | 'exact-binding-mismatch'
  | 'exact-side-identity-invalid'
  | 'exact-side-identity-duplicate'
  | 'coverage-template-mismatch'
  | 'operation-cardinality-unsupported'
  | 'operation-coverage-incomplete';

export type PatternImportDxfPhaseEGoldenCardFullExactCaptureBlockerV1 = Readonly<{
  code: PatternImportDxfPhaseEGoldenCardFullExactCaptureBlockerCodeV1;
  detail: string;
  operationNumbers: readonly number[];
}>;

export type PatternImportDxfPhaseEGoldenCardFullExactCaptureResultV1 =
  | Readonly<{
      ok: true;
      schemaVersion: typeof PATTERN_IMPORT_DXF_PHASE_E_GOLDEN_CARD_FULL_EXACT_CAPTURE_AGGREGATOR_V1;
      graph: PatternImportDxfPhaseEGoldenCardFullExactCaptureGraphV1;
      coverage: PatternImportDxfPhaseEGoldenWholeCardCoverageReceiptV1;
      authoritativeBaseline: null;
      blocker: null;
      claims: typeof PATTERN_IMPORT_DXF_PHASE_E_GOLDEN_CARD_FULL_EXACT_CAPTURE_CLAIMS_V1;
    }>
  | Readonly<{
      ok: false;
      schemaVersion: typeof PATTERN_IMPORT_DXF_PHASE_E_GOLDEN_CARD_FULL_EXACT_CAPTURE_AGGREGATOR_V1;
      graph: null;
      coverage: PatternImportDxfPhaseEGoldenWholeCardCoverageReceiptV1 | null;
      authoritativeBaseline: null;
      blocker: PatternImportDxfPhaseEGoldenCardFullExactCaptureBlockerV1;
      claims: typeof PATTERN_IMPORT_DXF_PHASE_E_GOLDEN_CARD_FULL_EXACT_CAPTURE_CLAIMS_V1;
    }>;

type Operation =
  PatternImportDxfPhaseESavedRowAuthoritativeAssemblyEvidenceV1['assembly']['ops'][number];

function deepFreeze<T>(value: T, seen = new Set<object>()): T {
  if (!value || typeof value !== 'object' || seen.has(value) || Object.isFrozen(value))
    return value;
  seen.add(value);
  for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child, seen);
  return Object.freeze(value);
}

function canonical(value: unknown): string {
  if (value === null || typeof value === 'boolean' || typeof value === 'string')
    return JSON.stringify(value);
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || Object.is(value, -0)) throw new TypeError('invalid number');
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (!value || typeof value !== 'object') throw new TypeError('invalid value');
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) throw new TypeError('non-plain value');
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .filter((key) => record[key] !== undefined)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonical(record[key])}`)
    .join(',')}}`;
}

function sameRow(left: DxfProductSavedRowIdentityV1, right: DxfProductSavedRowIdentityV1): boolean {
  return canonical(left) === canonical(right);
}

function blocked(
  code: PatternImportDxfPhaseEGoldenCardFullExactCaptureBlockerCodeV1,
  detail: string,
  operationNumbers: readonly number[] = [],
  coverage: PatternImportDxfPhaseEGoldenWholeCardCoverageReceiptV1 | null = null,
): PatternImportDxfPhaseEGoldenCardFullExactCaptureResultV1 {
  return Object.freeze({
    ok: false as const,
    schemaVersion: PATTERN_IMPORT_DXF_PHASE_E_GOLDEN_CARD_FULL_EXACT_CAPTURE_AGGREGATOR_V1,
    graph: null,
    coverage,
    authoritativeBaseline: null,
    blocker: Object.freeze({
      code,
      detail,
      operationNumbers: Object.freeze([...operationNumbers]),
    }),
    claims: PATTERN_IMPORT_DXF_PHASE_E_GOLDEN_CARD_FULL_EXACT_CAPTURE_CLAIMS_V1,
  });
}

function operationGraphIssue(operations: readonly Operation[]): Readonly<{
  code:
    | 'operation-identity-duplicate'
    | 'output-unit-identity-duplicate'
    | 'seam-identity-duplicate'
    | 'invalid-request';
  detail: string;
}> | null {
  if (!Array.isArray(operations) || operations.length === 0 || operations.length > MAX_OPERATIONS)
    return {
      code: 'invalid-request',
      detail: 'The persisted operation graph is empty or unbounded.',
    };
  const operationNumbers = new Set<number>();
  const seamKeys = new Set<string>();
  const outputKeys = new Set<string>();
  for (const operation of operations) {
    if (
      !operation ||
      !Number.isSafeInteger(operation.number) ||
      operation.number < 1 ||
      typeof operation.work !== 'string' ||
      encoder.encode(operation.work).byteLength > 4_096 ||
      !Array.isArray(operation.inputKeys) ||
      operation.inputKeys.some(
        (key: unknown) => typeof key !== 'string' || encoder.encode(key).byteLength > 4_096,
      ) ||
      typeof operation.outputUnitKey !== 'string' ||
      typeof operation.outputUnitName !== 'string' ||
      !Array.isArray(operation.seamKeys)
    )
      return { code: 'invalid-request', detail: 'The persisted operation graph is malformed.' };
    if (operationNumbers.has(operation.number))
      return {
        code: 'operation-identity-duplicate',
        detail: `Operation ${operation.number} is duplicated.`,
      };
    operationNumbers.add(operation.number);
    if (operation.outputUnitKey) {
      if (outputKeys.has(operation.outputUnitKey))
        return {
          code: 'output-unit-identity-duplicate',
          detail: `Output unit ${operation.outputUnitKey} is owned more than once.`,
        };
      outputKeys.add(operation.outputUnitKey);
    }
    const localSeams = new Set<string>();
    for (const seamKey of operation.seamKeys) {
      if (typeof seamKey !== 'string' || !STABLE_REF.test(seamKey))
        return { code: 'invalid-request', detail: 'A persisted seam identity is invalid.' };
      if (localSeams.has(seamKey) || seamKeys.has(seamKey))
        return { code: 'seam-identity-duplicate', detail: `Seam ${seamKey} is not unique.` };
      localSeams.add(seamKey);
      seamKeys.add(seamKey);
    }
  }
  return null;
}

function sideIssue(side: PatternImportDxfProductPhaseEExactTopologySideBindingV1): string | null {
  if (
    !side ||
    !STABLE_REF.test(side.seamId) ||
    (side.sideIndex !== 0 && side.sideIndex !== 1) ||
    !STABLE_REF.test(side.pieceLineKey) ||
    !STABLE_REF.test(side.pieceId) ||
    !STABLE_REF.test(side.contourId) ||
    !Array.isArray(side.boundaryVertexIds) ||
    side.boundaryVertexIds.length !== 2 ||
    !side.boundaryVertexIds.every((value) => STABLE_REF.test(value)) ||
    side.boundaryVertexIds[0] === side.boundaryVertexIds[1] ||
    (side.direction !== 'forward' && side.direction !== 'reverse')
  )
    return 'An exact side identity is malformed.';
  return null;
}

function coverageFrom(
  cardRef: string,
  template: PatternImportDxfPhaseEGoldenWholeCardCoverageReceiptV1,
  operations: readonly Operation[],
  capturedOperationNumbers: ReadonlySet<number>,
): PatternImportDxfPhaseEGoldenWholeCardCoverageReceiptV1 | null {
  if (
    template?.schemaVersion !== PATTERN_IMPORT_DXF_PHASE_E_GOLDEN_WHOLE_CARD_COVERAGE_RECEIPT_V1 ||
    template.cardRef !== cardRef ||
    !Array.isArray(template.operations) ||
    template.structuralOperationCount !== operations.length ||
    template.stylingOperationCount !== operations.length ||
    template.operations.length !== operations.length
  )
    return null;
  const templateByNumber = new Map(
    template.operations.map((entry) => [entry.operationNumber, entry]),
  );
  const receipts = operations.map((operation) => {
    const templateEntry = templateByNumber.get(operation.number);
    if (!templateEntry || templateEntry.seamCount !== (operation.seamKeys?.length ?? 0))
      return null;
    const seamCount = operation.seamKeys?.length ?? 0;
    if (seamCount === 0)
      return Object.freeze({
        operationNumber: operation.number,
        seamCount,
        status: 'not-applicable' as const,
        reason: 'operation-has-no-seams' as const,
      });
    if (seamCount === 1)
      return Object.freeze({
        operationNumber: operation.number,
        seamCount,
        status: 'unsupported' as const,
        reason: 'one-seam-exact-projection-unsupported' as const,
      });
    if (seamCount > 2)
      return Object.freeze({
        operationNumber: operation.number,
        seamCount,
        status: 'unsupported' as const,
        reason: 'multi-seam-exact-projection-unsupported' as const,
      });
    return capturedOperationNumbers.has(operation.number)
      ? Object.freeze({
          operationNumber: operation.number,
          seamCount,
          status: 'exact' as const,
          reason: 'exact-selected-operation-projection-provided' as const,
        })
      : Object.freeze({
          operationNumber: operation.number,
          seamCount,
          status: 'missing' as const,
          reason: 'two-seam-exact-projection-not-provided' as const,
        });
  });
  if (receipts.some((entry) => entry === null)) return null;
  const exactReceipts = receipts as Exclude<(typeof receipts)[number], null>[];
  const seamBearingOperationCount = exactReceipts.filter(({ seamCount }) => seamCount > 0).length;
  const exactEligibleOperationCount = exactReceipts.filter(
    ({ seamCount }) => seamCount === 2,
  ).length;
  const exactOperationCount = exactReceipts.filter(({ status }) => status === 'exact').length;
  const missingExactOperationCount = exactReceipts.filter(
    ({ status }) => status === 'missing',
  ).length;
  const unsupportedExactOperationCount = exactReceipts.filter(
    ({ status }) => status === 'unsupported',
  ).length;
  return deepFreeze({
    schemaVersion: PATTERN_IMPORT_DXF_PHASE_E_GOLDEN_WHOLE_CARD_COVERAGE_RECEIPT_V1,
    cardRef,
    exactCoverageStatus:
      seamBearingOperationCount === 0
        ? ('not-applicable' as const)
        : exactOperationCount === seamBearingOperationCount
          ? ('complete' as const)
          : ('partial' as const),
    structuralOperationCount: operations.length,
    stylingOperationCount: template.stylingOperationCount,
    seamBearingOperationCount,
    exactEligibleOperationCount,
    exactOperationCount,
    missingExactOperationCount,
    unsupportedExactOperationCount,
    operations: exactReceipts,
    claims: PATTERN_IMPORT_DXF_PHASE_E_GOLDEN_WHOLE_CARD_BASELINE_CLAIMS_V1,
  });
}

function exactConnections(
  evidence: PatternImportDxfPhaseESavedRowAuthoritativeAssemblyEvidenceV1,
  operation: Operation,
):
  | Readonly<{
      ok: true;
      connections: readonly PatternImportDxfPhaseEGoldenCardFullExactConnectionV1[];
    }>
  | Readonly<{
      ok: false;
      code: 'exact-binding-mismatch' | 'exact-side-identity-invalid';
      detail: string;
    }> {
  const carrier = evidence.exactTopology?.carrier;
  const binding = carrier?.bindings;
  const selected = binding?.selectedOperation;
  if (
    evidence.schemaVersion !== PATTERN_IMPORT_DXF_PHASE_E_SERVER_TRANSACTIONAL_SAVED_ASSEMBLY_V1 ||
    evidence.origin !== 'server-transactional-saved-assembly' ||
    carrier?.schemaVersion !== PATTERN_IMPORT_DXF_PRODUCT_PHASE_E_EXACT_TOPOLOGY_BINDING_V1 ||
    carrier.status !== 'exact-phase-e-topology-authoring-binding' ||
    evidence.exactTopology.seal?.schemaVersion !==
      PATTERN_IMPORT_DXF_PRODUCT_PHASE_E_EXACT_TOPOLOGY_BINDING_SEAL_V1 ||
    !sameRow(binding.row, evidence.row) ||
    binding.serverAssemblyRevision !== evidence.serverAssemblyRevision ||
    binding.assemblyTopologySha256 !== evidence.serverTopologySha256 ||
    selected.sourceOperationNumber !== evidence.selectedOperationNumber ||
    !STABLE_REF.test(selected.authoringOperationId) ||
    !Array.isArray(selected.seamIds) ||
    selected.seamIds.length !== 2 ||
    operation.seamKeys?.length !== 2 ||
    selected.seamIds[0] !== operation.seamKeys[0] ||
    selected.seamIds[1] !== operation.seamKeys[1] ||
    !SHA256.test(binding.catalogCanonicalSha256) ||
    !Array.isArray(carrier.sides) ||
    carrier.sides.length !== 4
  )
    return {
      ok: false,
      code: 'exact-binding-mismatch',
      detail: `Operation ${operation.number} exact carrier does not match its fixed-lock snapshot.`,
    };

  const connections: PatternImportDxfPhaseEGoldenCardFullExactConnectionV1[] = [];
  for (const seamId of operation.seamKeys) {
    const sides = [...carrier.sides.filter((side) => side.seamId === seamId)].sort(
      (left, right) => left.sideIndex - right.sideIndex,
    );
    if (
      sides.length !== 2 ||
      sides.some((side) => sideIssue(side)) ||
      sides[0].sideIndex !== 0 ||
      sides[1].sideIndex !== 1 ||
      sides[0].pieceId === sides[1].pieceId
    )
      return {
        ok: false,
        code: 'exact-side-identity-invalid',
        detail: `Operation ${operation.number} seam ${seamId} does not bind two ordered exact sides.`,
      };
    connections.push(
      deepFreeze({
        connectionRef: seamId,
        operationNumber: operation.number,
        authoringOperationId: selected.authoringOperationId,
        row: structuredClone(evidence.row),
        serverTopologySha256: evidence.serverTopologySha256,
        catalogCanonicalSha256: binding.catalogCanonicalSha256,
        sides: [structuredClone(sides[0]), structuredClone(sides[1])] as const,
      }),
    );
  }
  return Object.freeze({ ok: true as const, connections: Object.freeze(connections) });
}

/**
 * Aggregates already-verified fixed-lock reads. It never reads, decodes, hashes, writes or invents
 * the catalog/material/styling authority needed for a full reconstruction baseline.
 */
export function aggregatePatternImportDxfPhaseEGoldenCardFullExactCaptureV1(
  request: PatternImportDxfPhaseEGoldenCardFullExactCaptureRequestV1,
): PatternImportDxfPhaseEGoldenCardFullExactCaptureResultV1 {
  try {
    if (
      !request ||
      typeof request !== 'object' ||
      !STABLE_REF.test(request.cardRef ?? '') ||
      !Number.isSafeInteger(request.expectedTechCardId) ||
      request.expectedTechCardId < 1 ||
      !Number.isSafeInteger(request.expectedCardLockVersion) ||
      request.expectedCardLockVersion < 0 ||
      typeof request.expectedServerAssemblyRevision !== 'string' ||
      !request.expectedServerAssemblyRevision ||
      encoder.encode(request.expectedServerAssemblyRevision).byteLength > 512 ||
      !Array.isArray(request.operationSnapshots) ||
      request.operationSnapshots.length > MAX_SNAPSHOTS
    )
      return blocked(
        'invalid-request',
        'A bounded fixed-lock full-card capture request is required.',
      );
    if (request.operationSnapshots.length === 0)
      return blocked(
        'snapshot-missing',
        'At least one verified exact operation snapshot is required.',
      );

    const first = request.operationSnapshots[0]!;
    const operations: readonly Operation[] = first.assembly.ops;
    const graphIssue = operationGraphIssue(operations);
    if (graphIssue) return blocked(graphIssue.code, graphIssue.detail);
    const canonicalOperations = canonical(operations);
    const operationByNumber = new Map<number, Operation>(
      operations.map((operation): [number, Operation] => [operation.number, operation]),
    );
    const selectedNumbers = new Set<number>();
    const authoringOperationIds = new Set<string>();
    const exactEdgeIdentities = new Set<string>();
    const connectionByOperation = new Map<
      number,
      readonly PatternImportDxfPhaseEGoldenCardFullExactConnectionV1[]
    >();

    for (const evidence of request.operationSnapshots) {
      if (evidence?.row?.techCardId !== request.expectedTechCardId)
        return blocked(
          'tech-card-mismatch',
          'An exact operation snapshot belongs to another tech card.',
          [evidence?.selectedOperationNumber].filter(Number.isSafeInteger) as number[],
        );
      if (evidence.row.cardLockVersion !== request.expectedCardLockVersion)
        return blocked(
          'card-lock-mismatch',
          `Operation ${evidence.selectedOperationNumber} was read at card lock ${evidence.row.cardLockVersion}, expected ${request.expectedCardLockVersion}.`,
          [evidence.selectedOperationNumber],
        );
      if (evidence.serverAssemblyRevision !== request.expectedServerAssemblyRevision)
        return blocked(
          'server-assembly-revision-mismatch',
          `Operation ${evidence.selectedOperationNumber} belongs to a stale or mixed Assembly revision.`,
          [evidence.selectedOperationNumber],
        );
      if (canonical(evidence.assembly.ops) !== canonicalOperations)
        return blocked(
          'operation-graph-mismatch',
          `Operation ${evidence.selectedOperationNumber} carries a different persisted operation graph.`,
          [evidence.selectedOperationNumber],
        );
      if (selectedNumbers.has(evidence.selectedOperationNumber))
        return blocked(
          'selected-operation-duplicate',
          `Operation ${evidence.selectedOperationNumber} has more than one exact snapshot.`,
          [evidence.selectedOperationNumber],
        );
      const operation = operationByNumber.get(evidence.selectedOperationNumber);
      if (!operation)
        return blocked(
          'selected-operation-missing',
          `Selected operation ${evidence.selectedOperationNumber} is absent from the persisted graph.`,
          [evidence.selectedOperationNumber],
        );
      selectedNumbers.add(evidence.selectedOperationNumber);
      const exact = exactConnections(evidence, operation);
      if (!exact.ok) return blocked(exact.code, exact.detail, [evidence.selectedOperationNumber]);
      const authoringOperationId = exact.connections[0]?.authoringOperationId;
      if (!authoringOperationId || authoringOperationIds.has(authoringOperationId))
        return blocked(
          'selected-operation-duplicate',
          'Exact authoring operation identities must be unique.',
          [evidence.selectedOperationNumber],
        );
      authoringOperationIds.add(authoringOperationId);
      for (const connection of exact.connections)
        for (const side of connection.sides) {
          const edgeIdentity = canonical({
            pieceId: side.pieceId,
            pieceLineKey: side.pieceLineKey,
            contourId: side.contourId,
            boundaryVertexIds: side.boundaryVertexIds,
          });
          if (exactEdgeIdentities.has(edgeIdentity))
            return blocked(
              'exact-side-identity-duplicate',
              `An exact catalog edge is bound more than once at operation ${evidence.selectedOperationNumber}.`,
              [evidence.selectedOperationNumber],
            );
          exactEdgeIdentities.add(edgeIdentity);
        }
      connectionByOperation.set(evidence.selectedOperationNumber, exact.connections);
    }

    const coverage = coverageFrom(
      request.cardRef,
      request.coverageTemplate,
      operations,
      selectedNumbers,
    );
    if (!coverage)
      return blocked(
        'coverage-template-mismatch',
        'The existing whole-card styling/structure coverage receipt does not match this operation graph.',
      );
    const unsupported = coverage.operations
      .filter(({ status }) => status === 'unsupported')
      .map(({ operationNumber }) => operationNumber);
    if (unsupported.length)
      return blocked(
        'operation-cardinality-unsupported',
        `Existing exact carriers cannot prove one- or multi-seam operations: ${unsupported.join(', ')}.`,
        unsupported,
        coverage,
      );
    const missing = coverage.operations
      .filter(({ status }) => status === 'missing')
      .map(({ operationNumber }) => operationNumber);
    if (missing.length)
      return blocked(
        'operation-coverage-incomplete',
        `Exact operation snapshots are missing for: ${missing.join(', ')}.`,
        missing,
        coverage,
      );
    if (coverage.exactCoverageStatus !== 'complete')
      return blocked(
        'operation-coverage-incomplete',
        'The fixed-lock exact operation coverage is not complete.',
        [],
        coverage,
      );

    const graphOperations: readonly PatternImportDxfPhaseEGoldenCardFullExactOperationV1[] =
      operations.map((operation) =>
        deepFreeze({
          operationNumber: operation.number,
          work: operation.work,
          inputKeys: structuredClone(operation.inputKeys),
          outputUnitKey: operation.outputUnitKey,
          outputUnitName: operation.outputUnitName,
          seamKeys: structuredClone(operation.seamKeys ?? []),
          exactConnections: connectionByOperation.get(operation.number) ?? [],
        }),
      );
    const connections = graphOperations.flatMap(({ exactConnections }) => exactConnections);
    const graph = deepFreeze({
      schemaVersion: PATTERN_IMPORT_DXF_PHASE_E_GOLDEN_CARD_FULL_EXACT_CAPTURE_GRAPH_V1,
      cardRef: request.cardRef,
      techCardId: request.expectedTechCardId,
      cardLockVersion: request.expectedCardLockVersion,
      serverAssemblyRevision: request.expectedServerAssemblyRevision,
      operations: graphOperations,
      connections,
      claims: PATTERN_IMPORT_DXF_PHASE_E_GOLDEN_CARD_FULL_EXACT_CAPTURE_CLAIMS_V1,
    });
    return Object.freeze({
      ok: true as const,
      schemaVersion: PATTERN_IMPORT_DXF_PHASE_E_GOLDEN_CARD_FULL_EXACT_CAPTURE_AGGREGATOR_V1,
      graph,
      coverage,
      authoritativeBaseline: null,
      blocker: null,
      claims: PATTERN_IMPORT_DXF_PHASE_E_GOLDEN_CARD_FULL_EXACT_CAPTURE_CLAIMS_V1,
    });
  } catch {
    return blocked(
      'invalid-request',
      'The fixed-lock exact capture could not be inspected safely.',
    );
  }
}
