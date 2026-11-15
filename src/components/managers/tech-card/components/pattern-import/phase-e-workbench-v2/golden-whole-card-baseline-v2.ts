import {
  verifyPatternImportDxfPhaseEGoldenCardReconstructionV1,
  type PatternImportDxfPhaseEGoldenCardReconstructionSnapshotV1,
} from './golden-card-reconstruction-v1';
import {
  buildPatternImportDxfPhaseEGoldenWholeCardBaselineV1,
  type PatternImportDxfPhaseEGoldenWholeCardBaselineBlockerCodeV1,
  type PatternImportDxfPhaseEGoldenWholeCardBaselineOperationV1,
  type PatternImportDxfPhaseEGoldenWholeCardBaselineRequestV1,
  type PatternImportDxfPhaseEGoldenWholeCardExactSelectedOperationProjectionV1,
} from './golden-whole-card-baseline-v1';

export const PATTERN_IMPORT_DXF_PHASE_E_GOLDEN_WHOLE_CARD_BASELINE_V2 =
  'pattern-import-dxf-phase-e-golden-whole-card-baseline/2' as const;
export const PATTERN_IMPORT_DXF_PHASE_E_GOLDEN_WHOLE_CARD_COVERAGE_RECEIPT_V2 =
  'pattern-import-dxf-phase-e-golden-whole-card-coverage-receipt/2' as const;

const MAX_OPERATIONS = 8_192;

export type PatternImportDxfPhaseEGoldenWholeCardExactOperationProjectionV2 =
  PatternImportDxfPhaseEGoldenWholeCardExactSelectedOperationProjectionV1;

export type PatternImportDxfPhaseEGoldenWholeCardBaselineRequestV2 = Omit<
  PatternImportDxfPhaseEGoldenWholeCardBaselineRequestV1,
  'exactSelectedOperationProjections'
> &
  Readonly<{
    /** One caller-sanitized, self-checking, single-operation snapshot per covered operation. */
    exactOperationProjections: readonly PatternImportDxfPhaseEGoldenWholeCardExactOperationProjectionV2[];
  }>;

export type PatternImportDxfPhaseEGoldenWholeCardExactCoverageReasonV2 =
  | 'operation-has-no-seams'
  | 'exact-operation-projection-not-provided'
  | 'exact-operation-projection-supplied-and-verified';

export type PatternImportDxfPhaseEGoldenWholeCardOperationCoverageV2 = Readonly<{
  operationNumber: number;
  seamCount: number;
  status: 'not-applicable' | 'missing' | 'exact';
  reason: PatternImportDxfPhaseEGoldenWholeCardExactCoverageReasonV2;
}>;

export type PatternImportDxfPhaseEGoldenWholeCardBaselineOperationV2 = Omit<
  PatternImportDxfPhaseEGoldenWholeCardBaselineOperationV1,
  'exactCoverage'
> &
  Readonly<{ exactCoverage: PatternImportDxfPhaseEGoldenWholeCardOperationCoverageV2 }>;

export type PatternImportDxfPhaseEGoldenWholeCardBaselineV2 = Readonly<{
  schemaVersion: typeof PATTERN_IMPORT_DXF_PHASE_E_GOLDEN_WHOLE_CARD_BASELINE_V2;
  cardRef: string;
  operations: readonly PatternImportDxfPhaseEGoldenWholeCardBaselineOperationV2[];
  /** Exact documents remain per-operation partitions; their catalogs are never merged. */
  exactOperationProjections: readonly PatternImportDxfPhaseEGoldenWholeCardExactOperationProjectionV2[];
}>;

export const PATTERN_IMPORT_DXF_PHASE_E_GOLDEN_WHOLE_CARD_BASELINE_CLAIMS_V2 = Object.freeze({
  callerSuppliedSanitizedCardRefRequired: true,
  v1StructuralAndStylingJoinReused: true,
  callerSuppliedPerOperationSnapshotsRequiredForExactCoverage: true,
  snapshotSelfCheckRequired: true,
  snapshotCardRefExactMatched: true,
  snapshotContainsExactlyOneOperation: true,
  orderedStructureSeamKeysConnectionsAndStitchExactMatched: true,
  everyPositiveSeamCardinalityEligible: true,
  missingSnapshotNeverReportedUnsupported: true,
  exactOperationDocumentsRemainPartitioned: true,
  zeroSeamOperationExactTopologyNotApplicable: true,
  networkUsed: false,
  networkWriteAvailable: false,
  productionPayloadRetained: false,
  createsTopologyAuthority: false,
  createsAssemblyAuthority: false,
  createsPersistenceModel: false,
  productionReady: false,
} as const);

export type PatternImportDxfPhaseEGoldenWholeCardCoverageReceiptV2 = Readonly<{
  schemaVersion: typeof PATTERN_IMPORT_DXF_PHASE_E_GOLDEN_WHOLE_CARD_COVERAGE_RECEIPT_V2;
  cardRef: string;
  exactCoverageStatus: 'not-applicable' | 'partial' | 'complete';
  structuralOperationCount: number;
  stylingOperationCount: number;
  seamBearingOperationCount: number;
  exactEligibleOperationCount: number;
  exactOperationCount: number;
  missingExactOperationCount: number;
  operations: readonly PatternImportDxfPhaseEGoldenWholeCardOperationCoverageV2[];
  claims: typeof PATTERN_IMPORT_DXF_PHASE_E_GOLDEN_WHOLE_CARD_BASELINE_CLAIMS_V2;
}>;

export type PatternImportDxfPhaseEGoldenWholeCardBaselineBlockerCodeV2 =
  | Exclude<
      PatternImportDxfPhaseEGoldenWholeCardBaselineBlockerCodeV1,
      'exact-projection-cardinality-unsupported'
    >
  | 'exact-projection-operation-not-seam-bearing'
  | 'exact-projection-connection-order-mismatch';

export type PatternImportDxfPhaseEGoldenWholeCardBaselineBlockerV2 = Readonly<{
  code: PatternImportDxfPhaseEGoldenWholeCardBaselineBlockerCodeV2;
  detail: string;
}>;

export type PatternImportDxfPhaseEGoldenWholeCardBaselineResultV2 =
  | Readonly<{
      ok: true;
      baseline: PatternImportDxfPhaseEGoldenWholeCardBaselineV2;
      coverage: PatternImportDxfPhaseEGoldenWholeCardCoverageReceiptV2;
      blocker: null;
    }>
  | Readonly<{
      ok: false;
      baseline: null;
      coverage: null;
      blocker: PatternImportDxfPhaseEGoldenWholeCardBaselineBlockerV2;
    }>;

class BaselineV2Failure extends Error {
  constructor(
    readonly code: PatternImportDxfPhaseEGoldenWholeCardBaselineBlockerCodeV2,
    detail: string,
  ) {
    super(detail);
    this.name = 'PatternImportDxfPhaseEGoldenWholeCardBaselineFailureV2';
  }
}

function fail(
  code: PatternImportDxfPhaseEGoldenWholeCardBaselineBlockerCodeV2,
  detail: string,
): never {
  throw new BaselineV2Failure(code, detail);
}

function blocked(
  code: PatternImportDxfPhaseEGoldenWholeCardBaselineBlockerCodeV2,
  detail: string,
): PatternImportDxfPhaseEGoldenWholeCardBaselineResultV2 {
  return Object.freeze({
    ok: false as const,
    baseline: null,
    coverage: null,
    blocker: Object.freeze({ code, detail }),
  });
}

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
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .filter((key) => record[key] !== undefined)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonical(record[key])}`)
    .join(',')}}`;
}

function sameOrdered(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function structureIssue(
  expected: PatternImportDxfPhaseEGoldenWholeCardBaselineOperationV1,
  snapshot: PatternImportDxfPhaseEGoldenCardReconstructionSnapshotV1,
): string | null {
  const projected = snapshot.operations[0]?.card;
  if (!projected || projected.number !== expected.operationNumber) return 'operationNumber';
  if (projected.work !== expected.work) return 'work';
  if (!sameOrdered(projected.inputKeys, expected.inputKeys)) return 'inputKeys';
  if (projected.outputUnitKey !== expected.outputUnitKey) return 'outputUnitKey';
  if (projected.outputUnitName !== expected.outputUnitName) return 'outputUnitName';
  if (!sameOrdered(projected.seamKeys, expected.seamKeys)) return 'seamKeys';
  return null;
}

function coverageFor(
  operation: PatternImportDxfPhaseEGoldenWholeCardBaselineOperationV1,
  exact: boolean,
): PatternImportDxfPhaseEGoldenWholeCardOperationCoverageV2 {
  const seamCount = operation.seamKeys.length;
  if (seamCount === 0)
    return Object.freeze({
      operationNumber: operation.operationNumber,
      seamCount,
      status: 'not-applicable' as const,
      reason: 'operation-has-no-seams' as const,
    });
  return Object.freeze(
    exact
      ? {
          operationNumber: operation.operationNumber,
          seamCount,
          status: 'exact' as const,
          reason: 'exact-operation-projection-supplied-and-verified' as const,
        }
      : {
          operationNumber: operation.operationNumber,
          seamCount,
          status: 'missing' as const,
          reason: 'exact-operation-projection-not-provided' as const,
        },
  );
}

function validateExactProjection(
  cardRef: string,
  operation: PatternImportDxfPhaseEGoldenWholeCardBaselineOperationV1,
  projection: PatternImportDxfPhaseEGoldenWholeCardExactOperationProjectionV2,
  index: number,
): PatternImportDxfPhaseEGoldenWholeCardExactOperationProjectionV2 {
  if (!projection || typeof projection !== 'object' || Array.isArray(projection))
    fail('exact-projection-invalid', `Exact projection ${index} must be a record.`);
  if (!Number.isSafeInteger(projection.operationNumber) || projection.operationNumber < 1)
    fail('exact-projection-invalid', `Exact projection ${index} operation number is invalid.`);
  if (operation.seamKeys.length === 0)
    fail(
      'exact-projection-operation-not-seam-bearing',
      `Operation ${operation.operationNumber} has no seams and cannot consume exact topology.`,
    );

  let snapshot: PatternImportDxfPhaseEGoldenCardReconstructionSnapshotV1;
  try {
    snapshot = structuredClone(projection.snapshot);
  } catch {
    fail(
      'exact-projection-invalid',
      `Exact projection ${operation.operationNumber} is not detached plain data.`,
    );
  }
  const selfCheck = verifyPatternImportDxfPhaseEGoldenCardReconstructionV1(snapshot, snapshot);
  if (!selfCheck.ok) {
    const projected = Array.isArray(snapshot.operations) ? snapshot.operations[0] : undefined;
    const connectionRefs = Array.isArray(snapshot.connections)
      ? snapshot.connections.map(({ connectionRef }) => connectionRef)
      : [];
    if (
      projected &&
      snapshot.operations.length === 1 &&
      (!sameOrdered(projected.assembly.seamIds, operation.seamKeys) ||
        !sameOrdered(connectionRefs, operation.seamKeys))
    )
      fail(
        'exact-projection-connection-order-mismatch',
        `Exact projection ${operation.operationNumber} does not contain its exact ordered seam connections.`,
      );
    fail(
      'exact-projection-invalid',
      `Exact projection ${operation.operationNumber} failed reconstruction self-check.`,
    );
  }
  if (snapshot.cardRef !== cardRef)
    fail(
      'exact-projection-card-ref-mismatch',
      `Exact projection ${operation.operationNumber} uses another sanitized card reference.`,
    );
  if (snapshot.operations.length !== 1)
    fail(
      'exact-projection-invalid',
      `Exact projection ${operation.operationNumber} must contain exactly one operation.`,
    );
  const mismatch = structureIssue(operation, snapshot);
  if (mismatch)
    fail(
      'exact-projection-structural-mismatch',
      `Exact projection ${operation.operationNumber} differs from the whole-card snapshot at ${mismatch}.`,
    );
  const projectedOperation = snapshot.operations[0];
  const orderedConnections = snapshot.connections.map(({ connectionRef }) => connectionRef);
  if (
    !sameOrdered(projectedOperation.assembly.seamIds, operation.seamKeys) ||
    !sameOrdered(orderedConnections, operation.seamKeys) ||
    snapshot.connections.some(
      ({ operationRef }) => operationRef !== projectedOperation.operationRef,
    )
  )
    fail(
      'exact-projection-connection-order-mismatch',
      `Exact projection ${operation.operationNumber} does not contain its exact ordered seam connections.`,
    );
  if (canonical(projectedOperation.stitch) !== canonical(operation.stitch))
    fail(
      'exact-projection-styling-mismatch',
      `Exact projection ${operation.operationNumber} has stale stitch styling.`,
    );
  return deepFreeze({ operationNumber: operation.operationNumber, snapshot });
}

/**
 * V2 keeps V1's structural/current-card join and replaces only the two-seam eligibility rule.
 * Every seam-bearing operation is exact iff its own detached reconstruction snapshot verifies.
 */
export function buildPatternImportDxfPhaseEGoldenWholeCardBaselineV2(
  request: PatternImportDxfPhaseEGoldenWholeCardBaselineRequestV2,
): PatternImportDxfPhaseEGoldenWholeCardBaselineResultV2 {
  try {
    if (
      !request ||
      typeof request !== 'object' ||
      Array.isArray(request) ||
      !Array.isArray(request.exactOperationProjections) ||
      request.exactOperationProjections.length > MAX_OPERATIONS
    )
      fail('invalid-request', 'Whole-card V2 request or exact projection collection is invalid.');

    const joined = buildPatternImportDxfPhaseEGoldenWholeCardBaselineV1({
      cardRef: request.cardRef,
      snapshotOperations: request.snapshotOperations,
      currentOperations: request.currentOperations,
      exactSelectedOperationProjections: [],
    });
    if (!joined.ok) {
      if (joined.blocker.code === 'exact-projection-cardinality-unsupported')
        fail('invalid-request', joined.blocker.detail);
      fail(joined.blocker.code, joined.blocker.detail);
    }

    const operationByNumber = new Map(
      joined.baseline.operations.map(
        (operation) => [operation.operationNumber, operation] as const,
      ),
    );
    const exactByNumber = new Map<
      number,
      PatternImportDxfPhaseEGoldenWholeCardExactOperationProjectionV2
    >();
    request.exactOperationProjections.forEach((projection, index) => {
      const operationNumber = projection?.operationNumber;
      if (!Number.isSafeInteger(operationNumber) || (operationNumber as number) < 1)
        fail('exact-projection-invalid', `Exact projection ${index} operation number is invalid.`);
      if (exactByNumber.has(operationNumber))
        fail(
          'exact-projection-operation-number-duplicate',
          `Exact projection for operation ${operationNumber} is duplicated.`,
        );
      const operation = operationByNumber.get(operationNumber);
      if (!operation)
        fail(
          'exact-projection-operation-missing',
          `Exact projection operation ${operationNumber} is absent from the joined card.`,
        );
      exactByNumber.set(
        operationNumber,
        validateExactProjection(request.cardRef, operation, projection, index),
      );
    });

    const operationCoverage = joined.baseline.operations.map((operation) =>
      coverageFor(operation, exactByNumber.has(operation.operationNumber)),
    );
    const operations = joined.baseline.operations.map((operation, index) =>
      Object.freeze({
        operationNumber: operation.operationNumber,
        work: operation.work,
        inputKeys: operation.inputKeys,
        outputUnitKey: operation.outputUnitKey,
        outputUnitName: operation.outputUnitName,
        seamKeys: operation.seamKeys,
        stitch: operation.stitch,
        exactCoverage: operationCoverage[index],
      }),
    );
    const exactOperationProjections = joined.baseline.operations.flatMap((operation) => {
      const exact = exactByNumber.get(operation.operationNumber);
      return exact ? [exact] : [];
    });
    const seamBearingOperationCount = operationCoverage.filter(
      ({ seamCount }) => seamCount > 0,
    ).length;
    const exactOperationCount = operationCoverage.filter(({ status }) => status === 'exact').length;
    const missingExactOperationCount = operationCoverage.filter(
      ({ status }) => status === 'missing',
    ).length;
    const exactCoverageStatus =
      seamBearingOperationCount === 0
        ? ('not-applicable' as const)
        : exactOperationCount === seamBearingOperationCount
          ? ('complete' as const)
          : ('partial' as const);

    return Object.freeze({
      ok: true as const,
      baseline: deepFreeze({
        schemaVersion: PATTERN_IMPORT_DXF_PHASE_E_GOLDEN_WHOLE_CARD_BASELINE_V2,
        cardRef: request.cardRef,
        operations,
        exactOperationProjections,
      }),
      coverage: deepFreeze({
        schemaVersion: PATTERN_IMPORT_DXF_PHASE_E_GOLDEN_WHOLE_CARD_COVERAGE_RECEIPT_V2,
        cardRef: request.cardRef,
        exactCoverageStatus,
        structuralOperationCount: operations.length,
        stylingOperationCount: operations.length,
        seamBearingOperationCount,
        exactEligibleOperationCount: seamBearingOperationCount,
        exactOperationCount,
        missingExactOperationCount,
        operations: operationCoverage,
        claims: PATTERN_IMPORT_DXF_PHASE_E_GOLDEN_WHOLE_CARD_BASELINE_CLAIMS_V2,
      }),
      blocker: null,
    });
  } catch (error) {
    if (error instanceof BaselineV2Failure) return blocked(error.code, error.message);
    return blocked('invalid-request', 'Whole-card V2 request could not be inspected safely.');
  }
}
