import type { PatternImportDxfPhaseESavedAssemblyTransportOperationV1 } from './saved-assembly-authority-transport-v1';
import {
  verifyPatternImportDxfPhaseEGoldenCardReconstructionV1,
  type PatternImportDxfPhaseEGoldenCardReconstructionSnapshotV1,
} from './golden-card-reconstruction-v1';
import {
  PATTERN_IMPORT_DXF_PHASE_E_STITCH_VISUAL_V1,
  type PatternImportDxfPhaseEStitchVisualV1,
} from './stitch-visual-v1';

export const PATTERN_IMPORT_DXF_PHASE_E_GOLDEN_WHOLE_CARD_BASELINE_V1 =
  'pattern-import-dxf-phase-e-golden-whole-card-baseline/1' as const;
export const PATTERN_IMPORT_DXF_PHASE_E_GOLDEN_WHOLE_CARD_COVERAGE_RECEIPT_V1 =
  'pattern-import-dxf-phase-e-golden-whole-card-coverage-receipt/1' as const;

const STABLE_REF = /^[A-Za-z0-9][A-Za-z0-9._:/#-]{0,255}$/;
const MAX_TEXT_BYTES = 4_096;
const MAX_OPERATIONS = 8_192;
const encoder = new TextEncoder();

export type PatternImportDxfPhaseEGoldenWholeCardCurrentOperationV1 = Readonly<{
  operationNumber: number;
  work: string;
  inputKeys: readonly string[];
  outputUnitKey: string;
  outputUnitName: string;
  seamKeys: readonly string[];
  /** Read-only styling projection built from the current GetTechCard operation and BOM. */
  stitch: PatternImportDxfPhaseEStitchVisualV1 | null;
}>;

/**
 * One caller-sanitized exact selected-operation document. V1 deliberately keeps each source
 * catalog independent instead of pretending that several saved DXF rows share one catalog hash.
 */
export type PatternImportDxfPhaseEGoldenWholeCardExactSelectedOperationProjectionV1 = Readonly<{
  operationNumber: number;
  snapshot: PatternImportDxfPhaseEGoldenCardReconstructionSnapshotV1;
}>;

export type PatternImportDxfPhaseEGoldenWholeCardBaselineRequestV1 = Readonly<{
  /** Caller-owned opaque reference. Numeric production card IDs are not accepted separately. */
  cardRef: string;
  /** Full structural operation list from one transactional saved-assembly snapshot. */
  snapshotOperations: readonly PatternImportDxfPhaseESavedAssemblyTransportOperationV1[];
  /** Full current-card operation list after projection to structural fields and stitch styling. */
  currentOperations: readonly PatternImportDxfPhaseEGoldenWholeCardCurrentOperationV1[];
  /** Zero or more already-sanitized exact selected-operation documents. */
  exactSelectedOperationProjections: readonly PatternImportDxfPhaseEGoldenWholeCardExactSelectedOperationProjectionV1[];
}>;

export type PatternImportDxfPhaseEGoldenWholeCardExactCoverageReasonV1 =
  | 'operation-has-no-seams'
  | 'one-seam-exact-projection-unsupported'
  | 'two-seam-exact-projection-not-provided'
  | 'exact-selected-operation-projection-provided'
  | 'multi-seam-exact-projection-unsupported';

export type PatternImportDxfPhaseEGoldenWholeCardOperationCoverageV1 = Readonly<{
  operationNumber: number;
  seamCount: number;
  status: 'not-applicable' | 'unsupported' | 'missing' | 'exact';
  reason: PatternImportDxfPhaseEGoldenWholeCardExactCoverageReasonV1;
}>;

export type PatternImportDxfPhaseEGoldenWholeCardBaselineOperationV1 = Readonly<{
  operationNumber: number;
  work: string;
  inputKeys: readonly string[];
  outputUnitKey: string;
  outputUnitName: string;
  seamKeys: readonly string[];
  stitch: PatternImportDxfPhaseEStitchVisualV1 | null;
  exactCoverage: PatternImportDxfPhaseEGoldenWholeCardOperationCoverageV1;
}>;

export type PatternImportDxfPhaseEGoldenWholeCardBaselineV1 = Readonly<{
  schemaVersion: typeof PATTERN_IMPORT_DXF_PHASE_E_GOLDEN_WHOLE_CARD_BASELINE_V1;
  cardRef: string;
  operations: readonly PatternImportDxfPhaseEGoldenWholeCardBaselineOperationV1[];
  /** Partitioned exact documents; no combined catalog or topology hash is inferred. */
  exactSelectedOperationProjections: readonly PatternImportDxfPhaseEGoldenWholeCardExactSelectedOperationProjectionV1[];
}>;

export const PATTERN_IMPORT_DXF_PHASE_E_GOLDEN_WHOLE_CARD_BASELINE_CLAIMS_V1 = Object.freeze({
  callerSuppliedSanitizedCardRefRequired: true,
  oneTransactionalSnapshotOperationListRequired: true,
  fullCurrentCardOperationListRequired: true,
  operationNumbersUniqueOnBothSides: true,
  everyCurrentOperationJoinedExactlyOnce: true,
  orderedStructuralSubsetExactMatched: true,
  exactSelectedOperationDocumentsOptional: true,
  exactSelectedOperationDocumentsRemainPartitioned: true,
  zeroSeamOperationExactTopologyNotApplicable: true,
  oneSeamOperationExactTopologyUnsupported: true,
  exactlyTwoSeamsRequiredForExactProjection: true,
  multiSeamOperationExactTopologyUnsupported: true,
  perOperationCoverageReceiptAvailable: true,
  networkUsed: false,
  productionFixtureBundled: false,
  productionIdsRequired: false,
  createsTopologyAuthority: false,
  createsAssemblyAuthority: false,
  createsPersistenceModel: false,
  productionReady: false,
} as const);

export type PatternImportDxfPhaseEGoldenWholeCardCoverageReceiptV1 = Readonly<{
  schemaVersion: typeof PATTERN_IMPORT_DXF_PHASE_E_GOLDEN_WHOLE_CARD_COVERAGE_RECEIPT_V1;
  cardRef: string;
  exactCoverageStatus: 'not-applicable' | 'partial' | 'complete';
  structuralOperationCount: number;
  stylingOperationCount: number;
  seamBearingOperationCount: number;
  exactEligibleOperationCount: number;
  exactOperationCount: number;
  missingExactOperationCount: number;
  unsupportedExactOperationCount: number;
  operations: readonly PatternImportDxfPhaseEGoldenWholeCardOperationCoverageV1[];
  claims: typeof PATTERN_IMPORT_DXF_PHASE_E_GOLDEN_WHOLE_CARD_BASELINE_CLAIMS_V1;
}>;

export type PatternImportDxfPhaseEGoldenWholeCardBaselineBlockerCodeV1 =
  | 'invalid-request'
  | 'invalid-card-ref'
  | 'snapshot-operation-number-duplicate'
  | 'current-operation-number-duplicate'
  | 'current-operation-missing'
  | 'current-operation-unexpected'
  | 'structural-operation-mismatch'
  | 'exact-projection-operation-number-duplicate'
  | 'exact-projection-operation-missing'
  | 'exact-projection-cardinality-unsupported'
  | 'exact-projection-invalid'
  | 'exact-projection-card-ref-mismatch'
  | 'exact-projection-structural-mismatch'
  | 'exact-projection-styling-mismatch';

export type PatternImportDxfPhaseEGoldenWholeCardBaselineBlockerV1 = Readonly<{
  code: PatternImportDxfPhaseEGoldenWholeCardBaselineBlockerCodeV1;
  detail: string;
}>;

export type PatternImportDxfPhaseEGoldenWholeCardBaselineResultV1 =
  | Readonly<{
      ok: true;
      baseline: PatternImportDxfPhaseEGoldenWholeCardBaselineV1;
      coverage: PatternImportDxfPhaseEGoldenWholeCardCoverageReceiptV1;
      blocker: null;
    }>
  | Readonly<{
      ok: false;
      baseline: null;
      coverage: null;
      blocker: PatternImportDxfPhaseEGoldenWholeCardBaselineBlockerV1;
    }>;

type NormalizedOperation = Omit<
  PatternImportDxfPhaseEGoldenWholeCardBaselineOperationV1,
  'stitch' | 'exactCoverage'
>;

class BaselineFailure extends Error {
  constructor(
    readonly code: PatternImportDxfPhaseEGoldenWholeCardBaselineBlockerCodeV1,
    detail: string,
  ) {
    super(detail);
    this.name = 'PatternImportDxfPhaseEGoldenWholeCardBaselineFailureV1';
  }
}

function fail(
  code: PatternImportDxfPhaseEGoldenWholeCardBaselineBlockerCodeV1,
  detail: string,
): never {
  throw new BaselineFailure(code, detail);
}

function deepFreeze<T>(value: T, seen = new Set<object>()): T {
  if (!value || typeof value !== 'object' || seen.has(value) || Object.isFrozen(value))
    return value;
  seen.add(value);
  for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child, seen);
  return Object.freeze(value);
}

function boundedText(value: unknown, path: string, allowEmpty = false): string {
  if (
    typeof value !== 'string' ||
    (!allowEmpty && value.length === 0) ||
    value.length > MAX_TEXT_BYTES ||
    encoder.encode(value).byteLength > MAX_TEXT_BYTES
  )
    fail('invalid-request', `${path} must be a bounded string.`);
  return value;
}

function textArray(value: unknown, path: string): readonly string[] {
  if (!Array.isArray(value) || value.length > MAX_OPERATIONS)
    fail('invalid-request', `${path} must be a bounded array.`);
  return Object.freeze(value.map((entry, index) => boundedText(entry, `${path}[${index}]`)));
}

function positiveOperationNumber(value: unknown, path: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 1)
    fail('invalid-request', `${path} must be a positive safe integer.`);
  return value as number;
}

function normalizedStructure(value: unknown, path: string): NormalizedOperation {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    fail('invalid-request', `${path} must be an operation record.`);
  const operation = value as Partial<PatternImportDxfPhaseESavedAssemblyTransportOperationV1>;
  return Object.freeze({
    operationNumber: positiveOperationNumber(operation.operationNumber, `${path}.operationNumber`),
    work: boundedText(operation.work, `${path}.work`),
    inputKeys: textArray(operation.inputKeys, `${path}.inputKeys`),
    outputUnitKey: boundedText(operation.outputUnitKey, `${path}.outputUnitKey`, true),
    outputUnitName: boundedText(operation.outputUnitName, `${path}.outputUnitName`, true),
    seamKeys: textArray(operation.seamKeys, `${path}.seamKeys`),
  });
}

function nullableText(value: unknown, path: string): string | null {
  return value === null ? null : boundedText(value, path);
}

function nullableFinite(
  value: unknown,
  path: string,
  minimum: number,
  integer = false,
): number | null {
  if (value === null) return null;
  if (
    typeof value !== 'number' ||
    !Number.isFinite(value) ||
    value < minimum ||
    (integer && !Number.isSafeInteger(value))
  )
    fail('invalid-request', `${path} must be null or a valid number.`);
  return value;
}

function record(value: unknown, path: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    fail('invalid-request', `${path} must be a record.`);
  return value as Record<string, unknown>;
}

function normalizeStitch(
  value: unknown,
  path: string,
): PatternImportDxfPhaseEStitchVisualV1 | null {
  if (value === null) return null;
  const stitchVisual = record(value, path);
  if (stitchVisual.schemaVersion !== PATTERN_IMPORT_DXF_PHASE_E_STITCH_VISUAL_V1)
    fail('invalid-request', `${path}.schemaVersion is unsupported.`);
  const seam = record(stitchVisual.seam, `${path}.seam`);
  const stitch = record(stitchVisual.stitch, `${path}.stitch`);
  const topstitch = record(stitchVisual.topstitch, `${path}.topstitch`);
  const machine = record(stitchVisual.machine, `${path}.machine`);
  const thread = record(stitchVisual.thread, `${path}.thread`);
  return deepFreeze({
    schemaVersion: PATTERN_IMPORT_DXF_PHASE_E_STITCH_VISUAL_V1,
    seam: {
      kind: nullableText(seam.kind, `${path}.seam.kind`),
      classValue: nullableText(seam.classValue, `${path}.seam.classValue`),
      classLabel: nullableText(seam.classLabel, `${path}.seam.classLabel`),
    },
    stitch: {
      densityPerCm: nullableFinite(stitch.densityPerCm, `${path}.stitch.densityPerCm`, 0),
      widthMm: nullableFinite(stitch.widthMm, `${path}.stitch.widthMm`, 0),
    },
    topstitch: {
      mode: nullableText(topstitch.mode, `${path}.topstitch.mode`),
      modeLabel: nullableText(topstitch.modeLabel, `${path}.topstitch.modeLabel`),
      offsetMm: nullableFinite(topstitch.offsetMm, `${path}.topstitch.offsetMm`, 0),
      offsetLabel: nullableText(topstitch.offsetLabel, `${path}.topstitch.offsetLabel`),
      rows: nullableFinite(topstitch.rows, `${path}.topstitch.rows`, 1, true),
    },
    machine: {
      needleGaugeMm: nullableFinite(machine.needleGaugeMm, `${path}.machine.needleGaugeMm`, 0),
      rowSpacingMm: nullableFinite(machine.rowSpacingMm, `${path}.machine.rowSpacingMm`, 0),
    },
    thread: {
      bomLineKey: nullableText(thread.bomLineKey, `${path}.thread.bomLineKey`),
    },
  });
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
  const source = value as Record<string, unknown>;
  return `{${Object.keys(source)
    .filter((key) => source[key] !== undefined)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonical(source[key])}`)
    .join(',')}}`;
}

function sameOrdered(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function structuralMismatch(left: NormalizedOperation, right: NormalizedOperation): string | null {
  if (left.work !== right.work) return 'work';
  if (!sameOrdered(left.inputKeys, right.inputKeys)) return 'inputKeys';
  if (left.outputUnitKey !== right.outputUnitKey) return 'outputUnitKey';
  if (left.outputUnitName !== right.outputUnitName) return 'outputUnitName';
  if (!sameOrdered(left.seamKeys, right.seamKeys)) return 'seamKeys';
  return null;
}

function coverageFor(
  operationNumber: number,
  seamCount: number,
  exact: boolean,
): PatternImportDxfPhaseEGoldenWholeCardOperationCoverageV1 {
  if (seamCount === 0)
    return Object.freeze({
      operationNumber,
      seamCount,
      status: 'not-applicable' as const,
      reason: 'operation-has-no-seams' as const,
    });
  if (seamCount === 1)
    return Object.freeze({
      operationNumber,
      seamCount,
      status: 'unsupported' as const,
      reason: 'one-seam-exact-projection-unsupported' as const,
    });
  if (seamCount > 2)
    return Object.freeze({
      operationNumber,
      seamCount,
      status: 'unsupported' as const,
      reason: 'multi-seam-exact-projection-unsupported' as const,
    });
  return Object.freeze(
    exact
      ? {
          operationNumber,
          seamCount,
          status: 'exact' as const,
          reason: 'exact-selected-operation-projection-provided' as const,
        }
      : {
          operationNumber,
          seamCount,
          status: 'missing' as const,
          reason: 'two-seam-exact-projection-not-provided' as const,
        },
  );
}

function blocked(
  code: PatternImportDxfPhaseEGoldenWholeCardBaselineBlockerCodeV1,
  detail: string,
): PatternImportDxfPhaseEGoldenWholeCardBaselineResultV1 {
  return Object.freeze({
    ok: false as const,
    baseline: null,
    coverage: null,
    blocker: Object.freeze({ code, detail }),
  });
}

/**
 * Builds a detached read-only whole-card baseline. It joins styling onto the complete structural
 * snapshot and records exact topology only where an existing selected-operation document exists.
 * It never fetches, persists, confirms, merges catalogs or creates topology authority.
 */
export function buildPatternImportDxfPhaseEGoldenWholeCardBaselineV1(
  request: PatternImportDxfPhaseEGoldenWholeCardBaselineRequestV1,
): PatternImportDxfPhaseEGoldenWholeCardBaselineResultV1 {
  try {
    if (!request || typeof request !== 'object' || Array.isArray(request))
      fail('invalid-request', 'Whole-card baseline request must be a record.');
    if (typeof request.cardRef !== 'string' || !STABLE_REF.test(request.cardRef))
      fail('invalid-card-ref', 'A caller-sanitized stable card reference is required.');
    if (
      !Array.isArray(request.snapshotOperations) ||
      request.snapshotOperations.length === 0 ||
      request.snapshotOperations.length > MAX_OPERATIONS ||
      !Array.isArray(request.currentOperations) ||
      request.currentOperations.length > MAX_OPERATIONS ||
      !Array.isArray(request.exactSelectedOperationProjections) ||
      request.exactSelectedOperationProjections.length > MAX_OPERATIONS
    )
      fail('invalid-request', 'Whole-card operation collections are invalid or out of bounds.');

    const snapshotOperations = request.snapshotOperations.map((operation, index) =>
      normalizedStructure(operation, `snapshotOperations[${index}]`),
    );
    const snapshotByNumber = new Map<number, NormalizedOperation>();
    for (const operation of snapshotOperations) {
      if (snapshotByNumber.has(operation.operationNumber))
        fail(
          'snapshot-operation-number-duplicate',
          `Snapshot operation ${operation.operationNumber} is duplicated.`,
        );
      snapshotByNumber.set(operation.operationNumber, operation);
    }

    const currentByNumber = new Map<
      number,
      Readonly<{
        structure: NormalizedOperation;
        stitch: PatternImportDxfPhaseEStitchVisualV1 | null;
      }>
    >();
    request.currentOperations.forEach((operation, index) => {
      const structure = normalizedStructure(operation, `currentOperations[${index}]`);
      if (currentByNumber.has(structure.operationNumber))
        fail(
          'current-operation-number-duplicate',
          `Current-card operation ${structure.operationNumber} is duplicated.`,
        );
      currentByNumber.set(
        structure.operationNumber,
        Object.freeze({
          structure,
          stitch: normalizeStitch(operation.stitch, `currentOperations[${index}].stitch`),
        }),
      );
    });

    for (const snapshotOperation of snapshotOperations) {
      const current = currentByNumber.get(snapshotOperation.operationNumber);
      if (!current)
        fail(
          'current-operation-missing',
          `Current card is missing snapshot operation ${snapshotOperation.operationNumber}.`,
        );
      const mismatch = structuralMismatch(snapshotOperation, current.structure);
      if (mismatch)
        fail(
          'structural-operation-mismatch',
          `Operation ${snapshotOperation.operationNumber} differs at ${mismatch}.`,
        );
    }
    for (const operationNumber of currentByNumber.keys())
      if (!snapshotByNumber.has(operationNumber))
        fail(
          'current-operation-unexpected',
          `Current card contains operation ${operationNumber}, absent from the snapshot.`,
        );

    const exactByNumber = new Map<
      number,
      PatternImportDxfPhaseEGoldenWholeCardExactSelectedOperationProjectionV1
    >();
    request.exactSelectedOperationProjections.forEach((projection, index) => {
      if (!projection || typeof projection !== 'object' || Array.isArray(projection))
        fail('exact-projection-invalid', `Exact projection ${index} must be a record.`);
      const operationNumber = positiveOperationNumber(
        projection.operationNumber,
        `exactSelectedOperationProjections[${index}].operationNumber`,
      );
      if (exactByNumber.has(operationNumber))
        fail(
          'exact-projection-operation-number-duplicate',
          `Exact projection for operation ${operationNumber} is duplicated.`,
        );
      const structural = snapshotByNumber.get(operationNumber);
      const current = currentByNumber.get(operationNumber);
      if (!structural || !current)
        fail(
          'exact-projection-operation-missing',
          `Exact projection operation ${operationNumber} is absent from the joined card.`,
        );
      if (structural.seamKeys.length !== 2)
        fail(
          'exact-projection-cardinality-unsupported',
          `Operation ${operationNumber} has ${structural.seamKeys.length} seams; exact selected-operation V1 requires exactly two.`,
        );

      let snapshot: PatternImportDxfPhaseEGoldenCardReconstructionSnapshotV1;
      try {
        snapshot = structuredClone(projection.snapshot);
      } catch {
        fail(
          'exact-projection-invalid',
          `Exact projection ${operationNumber} is not detached plain data.`,
        );
      }
      const selfCheck = verifyPatternImportDxfPhaseEGoldenCardReconstructionV1(snapshot, snapshot);
      if (!selfCheck.ok)
        fail(
          'exact-projection-invalid',
          `Exact projection ${operationNumber} is not a valid sanitized reconstruction snapshot.`,
        );
      if (snapshot.cardRef !== request.cardRef)
        fail(
          'exact-projection-card-ref-mismatch',
          `Exact projection ${operationNumber} uses another sanitized card reference.`,
        );
      if (snapshot.operations.length !== 1)
        fail(
          'exact-projection-invalid',
          `Exact projection ${operationNumber} must contain exactly one selected operation.`,
        );
      const projectedOperation = snapshot.operations[0];
      const projectedStructure = normalizedStructure(
        {
          operationNumber: projectedOperation.card.number,
          work: projectedOperation.card.work,
          inputKeys: projectedOperation.card.inputKeys,
          outputUnitKey: projectedOperation.card.outputUnitKey,
          outputUnitName: projectedOperation.card.outputUnitName,
          seamKeys: projectedOperation.card.seamKeys,
        },
        `exactSelectedOperationProjections[${index}].snapshot.operations[0]`,
      );
      const mismatch =
        projectedStructure.operationNumber !== operationNumber
          ? 'operationNumber'
          : structuralMismatch(structural, projectedStructure);
      if (mismatch)
        fail(
          'exact-projection-structural-mismatch',
          `Exact projection ${operationNumber} differs from the whole-card snapshot at ${mismatch}.`,
        );
      if (canonical(projectedOperation.stitch) !== canonical(current.stitch))
        fail(
          'exact-projection-styling-mismatch',
          `Exact projection ${operationNumber} has stale stitch styling.`,
        );
      exactByNumber.set(operationNumber, deepFreeze({ operationNumber, snapshot }));
    });

    const operationCoverage = snapshotOperations.map((operation) =>
      coverageFor(
        operation.operationNumber,
        operation.seamKeys.length,
        exactByNumber.has(operation.operationNumber),
      ),
    );
    const operations = snapshotOperations.map((operation, index) =>
      Object.freeze({
        ...operation,
        stitch: currentByNumber.get(operation.operationNumber)!.stitch,
        exactCoverage: operationCoverage[index],
      }),
    );
    const exactSelectedOperationProjections = snapshotOperations.flatMap((operation) => {
      const exact = exactByNumber.get(operation.operationNumber);
      return exact ? [exact] : [];
    });
    const seamBearingOperationCount = operationCoverage.filter(
      ({ seamCount }) => seamCount > 0,
    ).length;
    const exactEligibleOperationCount = operationCoverage.filter(
      ({ seamCount }) => seamCount === 2,
    ).length;
    const exactOperationCount = operationCoverage.filter(({ status }) => status === 'exact').length;
    const missingExactOperationCount = operationCoverage.filter(
      ({ status }) => status === 'missing',
    ).length;
    const unsupportedExactOperationCount = operationCoverage.filter(
      ({ status }) => status === 'unsupported',
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
        schemaVersion: PATTERN_IMPORT_DXF_PHASE_E_GOLDEN_WHOLE_CARD_BASELINE_V1,
        cardRef: request.cardRef,
        operations,
        exactSelectedOperationProjections,
      }),
      coverage: deepFreeze({
        schemaVersion: PATTERN_IMPORT_DXF_PHASE_E_GOLDEN_WHOLE_CARD_COVERAGE_RECEIPT_V1,
        cardRef: request.cardRef,
        exactCoverageStatus,
        structuralOperationCount: operations.length,
        stylingOperationCount: operations.length,
        seamBearingOperationCount,
        exactEligibleOperationCount,
        exactOperationCount,
        missingExactOperationCount,
        unsupportedExactOperationCount,
        operations: operationCoverage,
        claims: PATTERN_IMPORT_DXF_PHASE_E_GOLDEN_WHOLE_CARD_BASELINE_CLAIMS_V1,
      }),
      blocker: null,
    });
  } catch (error) {
    if (error instanceof BaselineFailure) return blocked(error.code, error.message);
    return blocked('invalid-request', 'Whole-card baseline request could not be inspected safely.');
  }
}
