import type { common_TechCard } from 'api/proto-http/admin';

import {
  buildPatternImportDxfPhaseESavedCardProductionProjectionV1,
  type PatternImportDxfPhaseESavedCardProjectionBlockerV1,
} from './saved-card-production-projection-v1';
import {
  PATTERN_IMPORT_DXF_PHASE_E_SAVED_ASSEMBLY_TRANSPORT_REQUEST_V1,
  type PatternImportDxfPhaseESavedAssemblyTransportRequestV1,
} from './saved-assembly-authority-transport-v1';

export const PATTERN_IMPORT_DXF_PHASE_E_GOLDEN_CARD_SNAPSHOT_CANDIDATE_SET_V1 =
  'pattern-import-dxf-phase-e-golden-card-snapshot-candidate-set/1' as const;
export const PATTERN_IMPORT_DXF_PHASE_E_GOLDEN_CARD_SNAPSHOT_SELECTION_V1 =
  'pattern-import-dxf-phase-e-golden-card-snapshot-selection/1' as const;

export const PATTERN_IMPORT_DXF_PHASE_E_GOLDEN_CARD_SNAPSHOT_SELECTION_CLAIMS_V1 = Object.freeze({
  loadedTechCardOnly: true,
  allSavedOperationsEnumerated: true,
  existingSavedCardProjectionReused: true,
  exactTwoSeamCandidatesOnly: true,
  exactSavedRowEightFieldIdentityRequired: true,
  currentCardLockBound: true,
  selectedOperationUiStateUsed: false,
  nearestFilenameOrDisplayFallbackUsed: false,
  singleCandidateAutoSelected: false,
  explicitSelectionReceiptRequired: true,
  receiptBindsSavedRowEightFieldsAndOperation: true,
  receiptRevalidatedAgainstCurrentCandidateSet: true,
  networkUsed: false,
  productionWriteUsed: false,
  createsAuthority: false,
  productionReady: false,
} as const);

export type PatternImportDxfPhaseEGoldenCardSnapshotCandidateV1 = Readonly<{
  candidateId: string;
  selectedOperationNumber: number;
  pieceLineKeys: readonly [string, string];
  label: string;
  snapshotRequest: PatternImportDxfPhaseESavedAssemblyTransportRequestV1;
}>;

export type PatternImportDxfPhaseEGoldenCardSnapshotCandidateRejectionV1 = Readonly<{
  operationIndex: number;
  operationNumber: number | null;
  code: PatternImportDxfPhaseESavedCardProjectionBlockerV1['code'] | 'operation-number-invalid';
  detail: string;
}>;

export type PatternImportDxfPhaseEGoldenCardSnapshotCandidateSetV1 = Readonly<{
  schemaVersion: typeof PATTERN_IMPORT_DXF_PHASE_E_GOLDEN_CARD_SNAPSHOT_CANDIDATE_SET_V1;
  status: 'ready' | 'blocked';
  techCardId: number | null;
  expectedCardLockVersion: number | null;
  candidates: readonly PatternImportDxfPhaseEGoldenCardSnapshotCandidateV1[];
  rejections: readonly PatternImportDxfPhaseEGoldenCardSnapshotCandidateRejectionV1[];
  blocker: Readonly<{
    code: 'saved-card-unavailable' | 'saved-card-identity-invalid' | 'no-eligible-snapshot';
    detail: string;
  }> | null;
  claims: typeof PATTERN_IMPORT_DXF_PHASE_E_GOLDEN_CARD_SNAPSHOT_SELECTION_CLAIMS_V1;
}>;

export type PatternImportDxfPhaseEGoldenCardSnapshotCandidateSetInputV1 = Readonly<{
  techCard: common_TechCard | null | undefined;
  orderSizeIds: (ids: number[]) => number[];
  sizeNameById: ReadonlyMap<number, string>;
}>;

export type PatternImportDxfPhaseEGoldenCardSnapshotSelectionReceiptV1 = Readonly<{
  schemaVersion: typeof PATTERN_IMPORT_DXF_PHASE_E_GOLDEN_CARD_SNAPSHOT_SELECTION_V1;
  status: 'explicit-selection';
  candidateId: string;
  snapshotRequest: PatternImportDxfPhaseESavedAssemblyTransportRequestV1;
}>;

export type PatternImportDxfPhaseEGoldenCardSnapshotSelectionBlockerV1 = Readonly<{
  code:
    | 'candidate-set-blocked'
    | 'candidate-selection-required'
    | 'candidate-not-found'
    | 'invalid-selection-receipt'
    | 'selection-drift';
  detail: string;
}>;

export type PatternImportDxfPhaseEGoldenCardSnapshotSelectionResultV1 =
  | Readonly<{
      ok: true;
      receipt: PatternImportDxfPhaseEGoldenCardSnapshotSelectionReceiptV1;
      snapshotRequest: PatternImportDxfPhaseESavedAssemblyTransportRequestV1;
      blocker: null;
    }>
  | Readonly<{
      ok: false;
      receipt: null;
      snapshotRequest: null;
      blocker: PatternImportDxfPhaseEGoldenCardSnapshotSelectionBlockerV1;
    }>;

const RECEIPT_KEYS = Object.freeze(['candidateId', 'schemaVersion', 'snapshotRequest', 'status']);
const REQUEST_KEYS = Object.freeze([
  'expectedCardLockVersion',
  'expectedSavedRowRevision',
  'expectedSha256',
  'expectedSizeBytes',
  'expectedUrl',
  'patternLineKey',
  'schemaVersion',
  'scopeKey',
  'selectedOperationNumber',
  'techCardId',
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

function blockedSet(
  code: NonNullable<PatternImportDxfPhaseEGoldenCardSnapshotCandidateSetV1['blocker']>['code'],
  detail: string,
): PatternImportDxfPhaseEGoldenCardSnapshotCandidateSetV1 {
  return Object.freeze({
    schemaVersion: PATTERN_IMPORT_DXF_PHASE_E_GOLDEN_CARD_SNAPSHOT_CANDIDATE_SET_V1,
    status: 'blocked' as const,
    techCardId: null,
    expectedCardLockVersion: null,
    candidates: Object.freeze([]),
    rejections: Object.freeze([]),
    blocker: Object.freeze({ code, detail }),
    claims: PATTERN_IMPORT_DXF_PHASE_E_GOLDEN_CARD_SNAPSHOT_SELECTION_CLAIMS_V1,
  });
}

function blockedSelection(
  code: PatternImportDxfPhaseEGoldenCardSnapshotSelectionBlockerV1['code'],
  detail: string,
): PatternImportDxfPhaseEGoldenCardSnapshotSelectionResultV1 {
  return Object.freeze({
    ok: false as const,
    receipt: null,
    snapshotRequest: null,
    blocker: Object.freeze({ code, detail }),
  });
}

function requestFromRow(
  row: Extract<
    ReturnType<typeof buildPatternImportDxfPhaseESavedCardProductionProjectionV1>,
    { ok: true }
  >['row'],
  selectedOperationNumber: number,
): PatternImportDxfPhaseESavedAssemblyTransportRequestV1 {
  return Object.freeze({
    schemaVersion: PATTERN_IMPORT_DXF_PHASE_E_SAVED_ASSEMBLY_TRANSPORT_REQUEST_V1,
    techCardId: row.techCardId,
    scopeKey: row.scopeKey,
    patternLineKey: row.patternLineKey,
    expectedSavedRowRevision: row.revision,
    expectedCardLockVersion: row.cardLockVersion,
    expectedUrl: row.url,
    expectedSizeBytes: row.sizeBytes,
    expectedSha256: row.sha256,
    selectedOperationNumber,
  });
}

function candidateId(request: PatternImportDxfPhaseESavedAssemblyTransportRequestV1): string {
  return [
    `operation:${request.selectedOperationNumber}`,
    `scope:${encodeURIComponent(request.scopeKey)}`,
    `row:${encodeURIComponent(request.patternLineKey)}`,
  ].join('|');
}

function requestEqual(
  left: PatternImportDxfPhaseESavedAssemblyTransportRequestV1,
  right: PatternImportDxfPhaseESavedAssemblyTransportRequestV1,
): boolean {
  return REQUEST_KEYS.every(
    (key) => left[key as keyof typeof left] === right[key as keyof typeof right],
  );
}

/**
 * Enumerates exact snapshot candidates from every saved operation. The current UI selection is not
 * an input, and even a unique result remains unselected until an explicit receipt is created.
 */
export function buildPatternImportDxfPhaseEGoldenCardSnapshotCandidateSetV1(
  input: PatternImportDxfPhaseEGoldenCardSnapshotCandidateSetInputV1,
): PatternImportDxfPhaseEGoldenCardSnapshotCandidateSetV1 {
  try {
    const techCard = input.techCard;
    if (!techCard?.techCard)
      return blockedSet('saved-card-unavailable', 'The current saved card is not loaded.');
    if (
      !Number.isSafeInteger(techCard.id) ||
      !techCard.id ||
      techCard.id < 1 ||
      !Number.isSafeInteger(techCard.lockVersion) ||
      techCard.lockVersion == null ||
      techCard.lockVersion < 0
    )
      return blockedSet(
        'saved-card-identity-invalid',
        'A positive saved card id and non-negative card lock are required.',
      );

    const operations = techCard.techCard.operations ?? [];
    const candidates: PatternImportDxfPhaseEGoldenCardSnapshotCandidateV1[] = [];
    const rejections: PatternImportDxfPhaseEGoldenCardSnapshotCandidateRejectionV1[] = [];
    const visited = new Set<number>();
    for (const [operationIndex, operation] of operations.entries()) {
      const operationNumber = operation.operationNumber;
      if (!Number.isSafeInteger(operationNumber) || !operationNumber || operationNumber < 1) {
        rejections.push(
          Object.freeze({
            operationIndex,
            operationNumber: null,
            code: 'operation-number-invalid' as const,
            detail: 'A saved operation without one positive stable number cannot own a snapshot.',
          }),
        );
        continue;
      }
      if (visited.has(operationNumber)) continue;
      visited.add(operationNumber);

      let projected: ReturnType<typeof buildPatternImportDxfPhaseESavedCardProductionProjectionV1>;
      try {
        projected = buildPatternImportDxfPhaseESavedCardProductionProjectionV1({
          techCard,
          selectedOperationNumber: operationNumber,
          orderSizeIds: input.orderSizeIds,
          sizeNameById: input.sizeNameById,
        });
      } catch {
        rejections.push(
          Object.freeze({
            operationIndex,
            operationNumber,
            code: 'saved-card-unavailable' as const,
            detail: 'The saved operation projection could not be inspected safely.',
          }),
        );
        continue;
      }
      if (!projected.ok) {
        rejections.push(
          Object.freeze({
            operationIndex,
            operationNumber,
            code: projected.blockers[0].code,
            detail: projected.blockers[0].detail,
          }),
        );
        continue;
      }
      const snapshotRequest = requestFromRow(projected.row, operationNumber);
      candidates.push(
        Object.freeze({
          candidateId: candidateId(snapshotRequest),
          selectedOperationNumber: operationNumber,
          pieceLineKeys: Object.freeze([...projected.pieceLineKeys]) as readonly [string, string],
          label: `Operation ${operationNumber} · ${snapshotRequest.scopeKey} · ${snapshotRequest.patternLineKey} r${snapshotRequest.expectedSavedRowRevision}`,
          snapshotRequest,
        }),
      );
    }

    candidates.sort((left, right) => left.selectedOperationNumber - right.selectedOperationNumber);
    if (candidates.length === 0)
      return Object.freeze({
        schemaVersion: PATTERN_IMPORT_DXF_PHASE_E_GOLDEN_CARD_SNAPSHOT_CANDIDATE_SET_V1,
        status: 'blocked' as const,
        techCardId: techCard.id,
        expectedCardLockVersion: techCard.lockVersion,
        candidates: Object.freeze([]),
        rejections: Object.freeze(rejections),
        blocker: Object.freeze({
          code: 'no-eligible-snapshot' as const,
          detail: 'No saved operation has one exact current two-seam snapshot identity.',
        }),
        claims: PATTERN_IMPORT_DXF_PHASE_E_GOLDEN_CARD_SNAPSHOT_SELECTION_CLAIMS_V1,
      });

    return Object.freeze({
      schemaVersion: PATTERN_IMPORT_DXF_PHASE_E_GOLDEN_CARD_SNAPSHOT_CANDIDATE_SET_V1,
      status: 'ready' as const,
      techCardId: techCard.id,
      expectedCardLockVersion: techCard.lockVersion,
      candidates: Object.freeze(candidates),
      rejections: Object.freeze(rejections),
      blocker: null,
      claims: PATTERN_IMPORT_DXF_PHASE_E_GOLDEN_CARD_SNAPSHOT_SELECTION_CLAIMS_V1,
    });
  } catch {
    return blockedSet(
      'saved-card-unavailable',
      'The current saved card candidate set could not be inspected safely.',
    );
  }
}

/** Creates a detached explicit receipt. No candidate, including a unique one, is auto-selected. */
export function selectPatternImportDxfPhaseEGoldenCardSnapshotCandidateV1(
  set: PatternImportDxfPhaseEGoldenCardSnapshotCandidateSetV1,
  selectedCandidateId: string | null | undefined,
): PatternImportDxfPhaseEGoldenCardSnapshotSelectionResultV1 {
  try {
    if (set.status !== 'ready')
      return blockedSelection(
        'candidate-set-blocked',
        set.blocker?.detail ?? 'The snapshot candidate set is blocked.',
      );
    if (!selectedCandidateId)
      return blockedSelection(
        'candidate-selection-required',
        'Choose one exact saved operation snapshot explicitly.',
      );
    const matches = set.candidates.filter(({ candidateId: id }) => id === selectedCandidateId);
    if (matches.length !== 1)
      return blockedSelection(
        'candidate-not-found',
        'The chosen snapshot candidate is not unique in the current saved card.',
      );
    const selected = matches[0];
    const snapshotRequest = Object.freeze({ ...selected.snapshotRequest });
    const receipt = Object.freeze({
      schemaVersion: PATTERN_IMPORT_DXF_PHASE_E_GOLDEN_CARD_SNAPSHOT_SELECTION_V1,
      status: 'explicit-selection' as const,
      candidateId: selected.candidateId,
      snapshotRequest,
    });
    return Object.freeze({ ok: true as const, receipt, snapshotRequest, blocker: null });
  } catch {
    return blockedSelection(
      'candidate-set-blocked',
      'The snapshot candidate set could not be inspected safely.',
    );
  }
}

/**
 * Revalidates a prior explicit choice against a freshly rebuilt set. This is the only helper that
 * releases a transport request to card-level preflight after a render or card refresh.
 */
export function resolvePatternImportDxfPhaseEGoldenCardSnapshotSelectionV1(
  set: PatternImportDxfPhaseEGoldenCardSnapshotCandidateSetV1,
  receipt: unknown,
): PatternImportDxfPhaseEGoldenCardSnapshotSelectionResultV1 {
  try {
    if (set.status !== 'ready')
      return blockedSelection(
        'candidate-set-blocked',
        set.blocker?.detail ?? 'The snapshot candidate set is blocked.',
      );
    if (!exactKeys(receipt, RECEIPT_KEYS))
      return blockedSelection(
        'invalid-selection-receipt',
        'An exact detached snapshot selection receipt is required.',
      );
    const receiptRecord = receipt as Record<string, unknown>;
    if (
      receiptRecord.schemaVersion !==
        PATTERN_IMPORT_DXF_PHASE_E_GOLDEN_CARD_SNAPSHOT_SELECTION_V1 ||
      receiptRecord.status !== 'explicit-selection' ||
      typeof receiptRecord.candidateId !== 'string' ||
      !exactKeys(receiptRecord.snapshotRequest, REQUEST_KEYS)
    )
      return blockedSelection(
        'invalid-selection-receipt',
        'An exact detached snapshot selection receipt is required.',
      );
    const snapshotRequestRecord = receiptRecord.snapshotRequest as Record<string, unknown>;
    if (
      snapshotRequestRecord.schemaVersion !==
      PATTERN_IMPORT_DXF_PHASE_E_SAVED_ASSEMBLY_TRANSPORT_REQUEST_V1
    )
      return blockedSelection(
        'invalid-selection-receipt',
        'An exact detached snapshot selection receipt is required.',
      );
    const matches = set.candidates.filter(
      ({ candidateId: id }) => id === receiptRecord.candidateId,
    );
    if (matches.length !== 1)
      return blockedSelection(
        'candidate-not-found',
        'The selected operation and saved row are absent from the current candidate set.',
      );
    const selected = matches[0];
    const snapshotRequest =
      snapshotRequestRecord as unknown as PatternImportDxfPhaseESavedAssemblyTransportRequestV1;
    if (!requestEqual(selected.snapshotRequest, snapshotRequest))
      return blockedSelection(
        'selection-drift',
        'The saved row, card lock or selected operation changed after the explicit choice.',
      );
    return Object.freeze({
      ok: true as const,
      receipt: receipt as unknown as PatternImportDxfPhaseEGoldenCardSnapshotSelectionReceiptV1,
      snapshotRequest: selected.snapshotRequest,
      blocker: null,
    });
  } catch {
    return blockedSelection(
      'invalid-selection-receipt',
      'The snapshot selection receipt could not be inspected safely.',
    );
  }
}
