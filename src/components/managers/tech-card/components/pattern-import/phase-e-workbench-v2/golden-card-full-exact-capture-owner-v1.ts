import type { DxfProductSavedRowIdentityV1 } from 'lib/pattern-import/dxf-product-saved-reprocess-owner-v1';

import {
  aggregatePatternImportDxfPhaseEGoldenCardFullExactCaptureV1,
  type PatternImportDxfPhaseEGoldenCardFullExactCaptureBlockerCodeV1,
  type PatternImportDxfPhaseEGoldenCardFullExactCaptureGraphV1,
} from './golden-card-full-exact-capture-aggregator-v1';
import type { PatternImportDxfPhaseEGoldenCardSnapshotCandidateV1 } from './golden-card-snapshot-selection-v1';
import { PATTERN_IMPORT_DXF_PHASE_E_GOLDEN_CARD_SUITE_PROFILES_V1 } from './golden-card-suite-profiles-v1';
import {
  PATTERN_IMPORT_DXF_PHASE_E_GOLDEN_WHOLE_CARD_COVERAGE_RECEIPT_V1,
  type PatternImportDxfPhaseEGoldenWholeCardCoverageReceiptV1,
} from './golden-whole-card-baseline-v1';
import type { PatternImportDxfPhaseESavedRowAuthoritativeAssemblyEvidenceV1 } from './saved-row-preparation-owner-v1';
import { PATTERN_IMPORT_DXF_PHASE_E_SAVED_ASSEMBLY_TRANSPORT_REQUEST_V1 } from './saved-assembly-authority-transport-v1';

export const PATTERN_IMPORT_DXF_PHASE_E_GOLDEN_CARD_FULL_EXACT_CAPTURE_OWNER_V1 =
  'pattern-import-dxf-phase-e-golden-card-full-exact-capture-owner/1' as const;

const STABLE_REF = /^[A-Za-z0-9][A-Za-z0-9._:/#-]{0,255}$/;
const SHA256 = /^[0-9a-f]{64}$/;
const MAX_CANDIDATES = 8_192;
const encoder = new TextEncoder();

export const PATTERN_IMPORT_DXF_PHASE_E_GOLDEN_CARD_FULL_EXACT_CAPTURE_OWNER_CLAIMS_V1 =
  Object.freeze({
    injectedFixedLockReaderRequired: true,
    existingSnapshotCandidatesReused: true,
    selectedBetaCardsOnly: true,
    eligibleOperationsReadInNumberOrder: true,
    readsSequentialAndFailFast: true,
    externalAbortSignalRequired: true,
    monotonicGenerationGuard: true,
    newerCaptureSupersedesOlderCapture: true,
    fixedTechCardLockAndAssemblyRevisionRevalidated: true,
    partialEvidenceNeverAggregated: true,
    aggregatorReused: true,
    rawEvidenceReturned: false,
    networkImplementationIncluded: false,
    writerAvailable: false,
    uiIntegrated: false,
    productionIntegrationPointReady: true,
    productionReady: true,
  } as const);

export type PatternImportDxfPhaseEGoldenCardFullExactCaptureOwnerRequestV1 = Readonly<{
  cardRef: string;
  expectedTechCardId: number;
  expectedCardLockVersion: number;
  expectedServerAssemblyRevision: string;
  coverageTemplate: PatternImportDxfPhaseEGoldenWholeCardCoverageReceiptV1;
  candidates: readonly PatternImportDxfPhaseEGoldenCardSnapshotCandidateV1[];
}>;

export type PatternImportDxfPhaseEGoldenCardFullExactCaptureReadV1 = (
  expected: Readonly<{
    row: DxfProductSavedRowIdentityV1;
    selectedOperationNumber: number;
  }>,
  signal: AbortSignal,
) => Promise<PatternImportDxfPhaseESavedRowAuthoritativeAssemblyEvidenceV1>;

export type PatternImportDxfPhaseEGoldenCardFullExactCaptureOwnerBlockerCodeV1 =
  | 'invalid-request'
  | 'card-not-in-beta-suite'
  | 'profile-lock-mismatch'
  | 'owner-disposed'
  | 'cancelled'
  | 'capture-superseded'
  | 'candidate-identity-duplicate'
  | 'candidate-card-mismatch'
  | 'candidate-lock-mismatch'
  | 'candidate-coverage-incomplete'
  | 'snapshot-read-failed'
  | 'saved-row-mismatch'
  | 'selected-operation-mismatch'
  | 'tech-card-mismatch'
  | 'card-lock-mismatch'
  | 'server-assembly-revision-mismatch'
  | PatternImportDxfPhaseEGoldenCardFullExactCaptureBlockerCodeV1;

export type PatternImportDxfPhaseEGoldenCardFullExactCaptureOwnerBlockerV1 = Readonly<{
  code: PatternImportDxfPhaseEGoldenCardFullExactCaptureOwnerBlockerCodeV1;
  detail: string;
  operationNumbers: readonly number[];
}>;

export type PatternImportDxfPhaseEGoldenCardFullExactCaptureOwnerResultV1 =
  | Readonly<{
      ok: true;
      schemaVersion: typeof PATTERN_IMPORT_DXF_PHASE_E_GOLDEN_CARD_FULL_EXACT_CAPTURE_OWNER_V1;
      generation: number;
      completedOperationNumbers: readonly number[];
      graph: PatternImportDxfPhaseEGoldenCardFullExactCaptureGraphV1;
      coverage: PatternImportDxfPhaseEGoldenWholeCardCoverageReceiptV1;
      authoritativeBaseline: null;
      blocker: null;
      claims: typeof PATTERN_IMPORT_DXF_PHASE_E_GOLDEN_CARD_FULL_EXACT_CAPTURE_OWNER_CLAIMS_V1;
    }>
  | Readonly<{
      ok: false;
      schemaVersion: typeof PATTERN_IMPORT_DXF_PHASE_E_GOLDEN_CARD_FULL_EXACT_CAPTURE_OWNER_V1;
      generation: number | null;
      completedOperationNumbers: readonly number[];
      graph: null;
      coverage: PatternImportDxfPhaseEGoldenWholeCardCoverageReceiptV1 | null;
      authoritativeBaseline: null;
      blocker: PatternImportDxfPhaseEGoldenCardFullExactCaptureOwnerBlockerV1;
      claims: typeof PATTERN_IMPORT_DXF_PHASE_E_GOLDEN_CARD_FULL_EXACT_CAPTURE_OWNER_CLAIMS_V1;
    }>;

export type PatternImportDxfPhaseEGoldenCardFullExactCaptureOwnerV1 = Readonly<{
  schemaVersion: typeof PATTERN_IMPORT_DXF_PHASE_E_GOLDEN_CARD_FULL_EXACT_CAPTURE_OWNER_V1;
  capture: (
    request: PatternImportDxfPhaseEGoldenCardFullExactCaptureOwnerRequestV1,
    signal: AbortSignal,
  ) => Promise<PatternImportDxfPhaseEGoldenCardFullExactCaptureOwnerResultV1>;
  cancel: () => void;
  dispose: () => void;
  claims: typeof PATTERN_IMPORT_DXF_PHASE_E_GOLDEN_CARD_FULL_EXACT_CAPTURE_OWNER_CLAIMS_V1;
}>;

type Ticket = {
  generation: number;
  controller: AbortController;
  invalidatedBy: 'cancelled' | 'superseded' | 'disposed' | null;
};

function blocked(
  code: PatternImportDxfPhaseEGoldenCardFullExactCaptureOwnerBlockerCodeV1,
  detail: string,
  generation: number | null,
  completedOperationNumbers: readonly number[] = [],
  operationNumbers: readonly number[] = [],
  coverage: PatternImportDxfPhaseEGoldenWholeCardCoverageReceiptV1 | null = null,
): PatternImportDxfPhaseEGoldenCardFullExactCaptureOwnerResultV1 {
  return Object.freeze({
    ok: false as const,
    schemaVersion: PATTERN_IMPORT_DXF_PHASE_E_GOLDEN_CARD_FULL_EXACT_CAPTURE_OWNER_V1,
    generation,
    completedOperationNumbers: Object.freeze([...completedOperationNumbers]),
    graph: null,
    coverage,
    authoritativeBaseline: null,
    blocker: Object.freeze({
      code,
      detail,
      operationNumbers: Object.freeze([...operationNumbers]),
    }),
    claims: PATTERN_IMPORT_DXF_PHASE_E_GOLDEN_CARD_FULL_EXACT_CAPTURE_OWNER_CLAIMS_V1,
  });
}

function rowFromCandidate(
  candidate: PatternImportDxfPhaseEGoldenCardSnapshotCandidateV1,
): DxfProductSavedRowIdentityV1 {
  const request = candidate.snapshotRequest;
  return Object.freeze({
    techCardId: request.techCardId,
    scopeKey: request.scopeKey,
    patternLineKey: request.patternLineKey,
    revision: request.expectedSavedRowRevision,
    cardLockVersion: request.expectedCardLockVersion,
    url: request.expectedUrl,
    sizeBytes: request.expectedSizeBytes,
    sha256: request.expectedSha256,
  });
}

function sameRow(left: DxfProductSavedRowIdentityV1, right: DxfProductSavedRowIdentityV1): boolean {
  return (
    left.techCardId === right.techCardId &&
    left.scopeKey === right.scopeKey &&
    left.patternLineKey === right.patternLineKey &&
    left.revision === right.revision &&
    left.cardLockVersion === right.cardLockVersion &&
    left.url === right.url &&
    left.sizeBytes === right.sizeBytes &&
    left.sha256 === right.sha256
  );
}

type CapturedRequest = Readonly<{
  cardRef: string;
  expectedTechCardId: number;
  expectedCardLockVersion: number;
  expectedServerAssemblyRevision: string;
  coverageTemplate: PatternImportDxfPhaseEGoldenWholeCardCoverageReceiptV1;
  candidates: readonly Readonly<{
    selectedOperationNumber: number;
    row: DxfProductSavedRowIdentityV1;
  }>[];
}>;

function captureRequest(request: PatternImportDxfPhaseEGoldenCardFullExactCaptureOwnerRequestV1):
  | Readonly<{ ok: true; request: CapturedRequest }>
  | Readonly<{
      ok: false;
      code: PatternImportDxfPhaseEGoldenCardFullExactCaptureOwnerBlockerCodeV1;
      detail: string;
      operationNumbers: readonly number[];
    }> {
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
      request.coverageTemplate?.schemaVersion !==
        PATTERN_IMPORT_DXF_PHASE_E_GOLDEN_WHOLE_CARD_COVERAGE_RECEIPT_V1 ||
      request.coverageTemplate.cardRef !== request.cardRef ||
      !Array.isArray(request.coverageTemplate.operations) ||
      !Array.isArray(request.candidates) ||
      request.candidates.length > MAX_CANDIDATES
    )
      return {
        ok: false,
        code: 'invalid-request',
        detail: 'A bounded fixed-lock capture owner request is required.',
        operationNumbers: [],
      };

    const profile = PATTERN_IMPORT_DXF_PHASE_E_GOLDEN_CARD_SUITE_PROFILES_V1.find(
      ({ facts }) => facts.techCardId === request.expectedTechCardId,
    );
    if (!profile || profile.cardRef !== request.cardRef)
      return {
        ok: false,
        code: 'card-not-in-beta-suite',
        detail: 'Only pinned production cards 6 and 11 are admitted by this capture owner.',
        operationNumbers: [],
      };
    if (request.expectedCardLockVersion !== profile.facts.cardVersion)
      return {
        ok: false,
        code: 'profile-lock-mismatch',
        detail: `Pinned card ${request.expectedTechCardId} requires lock ${profile.facts.cardVersion}.`,
        operationNumbers: [],
      };

    const unsupported = request.coverageTemplate.operations
      .filter(({ seamCount }) => seamCount === 1 || seamCount > 2)
      .map(({ operationNumber }) => operationNumber)
      .sort((left, right) => left - right);
    if (unsupported.length)
      return {
        ok: false,
        code: 'operation-cardinality-unsupported',
        detail: `Existing exact carriers cannot prove one- or multi-seam operations: ${unsupported.join(', ')}.`,
        operationNumbers: unsupported,
      };

    const eligible = request.coverageTemplate.operations
      .filter(({ seamCount }) => seamCount === 2)
      .map(({ operationNumber }) => operationNumber)
      .sort((left, right) => left - right);
    if (!eligible.length)
      return {
        ok: false,
        code: 'snapshot-missing',
        detail: 'The whole-card coverage receipt has no exact two-seam operation to read.',
        operationNumbers: [],
      };
    if (new Set(eligible).size !== eligible.length)
      return {
        ok: false,
        code: 'candidate-identity-duplicate',
        detail: 'Eligible operation identities are not unique.',
        operationNumbers: eligible,
      };

    const candidateByOperation = new Map<
      number,
      PatternImportDxfPhaseEGoldenCardSnapshotCandidateV1
    >();
    const candidateIds = new Set<string>();
    for (const candidate of request.candidates) {
      if (
        !candidate ||
        !Number.isSafeInteger(candidate.selectedOperationNumber) ||
        candidate.selectedOperationNumber < 1 ||
        candidate.snapshotRequest?.schemaVersion !==
          PATTERN_IMPORT_DXF_PHASE_E_SAVED_ASSEMBLY_TRANSPORT_REQUEST_V1 ||
        candidate.snapshotRequest.selectedOperationNumber !== candidate.selectedOperationNumber
      )
        return {
          ok: false,
          code: 'invalid-request',
          detail: 'A saved snapshot candidate identity is invalid.',
          operationNumbers: [],
        };
      if (
        candidateByOperation.has(candidate.selectedOperationNumber) ||
        typeof candidate.candidateId !== 'string' ||
        !candidate.candidateId ||
        candidateIds.has(candidate.candidateId)
      )
        return {
          ok: false,
          code: 'candidate-identity-duplicate',
          detail: `Operation ${candidate.selectedOperationNumber} has duplicate snapshot candidates.`,
          operationNumbers: [candidate.selectedOperationNumber],
        };
      candidateIds.add(candidate.candidateId);
      candidateByOperation.set(candidate.selectedOperationNumber, candidate);
    }

    const missing = eligible.filter(
      (operationNumber) => !candidateByOperation.has(operationNumber),
    );
    const unexpected = [...candidateByOperation.keys()].filter(
      (operationNumber) => !eligible.includes(operationNumber),
    );
    if (missing.length || unexpected.length)
      return {
        ok: false,
        code: 'candidate-coverage-incomplete',
        detail: missing.length
          ? `Snapshot candidates are missing for operations: ${missing.join(', ')}.`
          : `Unexpected snapshot candidates were supplied for operations: ${unexpected.join(', ')}.`,
        operationNumbers: missing.length ? missing : unexpected,
      };

    const candidates: CapturedRequest['candidates'] = eligible.map((operationNumber) => {
      const candidate = candidateByOperation.get(operationNumber)!;
      const snapshotRequest = candidate.snapshotRequest;
      if (snapshotRequest.techCardId !== request.expectedTechCardId)
        throw Object.freeze({
          code: 'candidate-card-mismatch' as const,
          operationNumber,
        });
      if (snapshotRequest.expectedCardLockVersion !== request.expectedCardLockVersion)
        throw Object.freeze({
          code: 'candidate-lock-mismatch' as const,
          operationNumber,
        });
      if (
        !STABLE_REF.test(snapshotRequest.scopeKey) ||
        !STABLE_REF.test(snapshotRequest.patternLineKey) ||
        !Number.isSafeInteger(snapshotRequest.expectedSavedRowRevision) ||
        snapshotRequest.expectedSavedRowRevision < 0 ||
        typeof snapshotRequest.expectedUrl !== 'string' ||
        !Number.isSafeInteger(snapshotRequest.expectedSizeBytes) ||
        snapshotRequest.expectedSizeBytes < 1 ||
        !SHA256.test(snapshotRequest.expectedSha256)
      )
        throw Object.freeze({ code: 'invalid-request' as const, operationNumber });
      return Object.freeze({
        selectedOperationNumber: operationNumber,
        row: rowFromCandidate(candidate),
      });
    });

    return Object.freeze({
      ok: true as const,
      request: Object.freeze({
        cardRef: request.cardRef,
        expectedTechCardId: request.expectedTechCardId,
        expectedCardLockVersion: request.expectedCardLockVersion,
        expectedServerAssemblyRevision: request.expectedServerAssemblyRevision,
        coverageTemplate: structuredClone(request.coverageTemplate),
        candidates: Object.freeze(candidates),
      }),
    });
  } catch (error) {
    const candidateError = error as { code?: unknown; operationNumber?: unknown };
    if (
      (candidateError.code === 'candidate-card-mismatch' ||
        candidateError.code === 'candidate-lock-mismatch' ||
        candidateError.code === 'invalid-request') &&
      Number.isSafeInteger(candidateError.operationNumber)
    )
      return {
        ok: false,
        code: candidateError.code,
        detail:
          candidateError.code === 'candidate-card-mismatch'
            ? 'A snapshot candidate belongs to another tech card.'
            : candidateError.code === 'candidate-lock-mismatch'
              ? 'A snapshot candidate belongs to another card lock.'
              : 'A snapshot candidate row identity is invalid.',
        operationNumbers: [candidateError.operationNumber as number],
      };
    return {
      ok: false,
      code: 'invalid-request',
      detail: 'The fixed-lock capture request could not be inspected safely.',
      operationNumbers: [],
    };
  }
}

function invalidationResult(
  ticket: Ticket,
  currentGeneration: number,
  completed: readonly number[],
): PatternImportDxfPhaseEGoldenCardFullExactCaptureOwnerResultV1 | null {
  if (ticket.invalidatedBy === 'disposed')
    return blocked(
      'owner-disposed',
      'The capture owner was disposed.',
      ticket.generation,
      completed,
    );
  if (ticket.invalidatedBy === 'superseded' || ticket.generation !== currentGeneration)
    return blocked(
      'capture-superseded',
      'A newer full-card capture superseded this generation.',
      ticket.generation,
      completed,
    );
  if (ticket.invalidatedBy === 'cancelled' || ticket.controller.signal.aborted)
    return blocked(
      'cancelled',
      'The full-card capture was cancelled.',
      ticket.generation,
      completed,
    );
  return null;
}

/**
 * Production-ready orchestration seam over an injected verified read capability. The owner itself
 * contains no generated client, RPC binding, cache, UI or persistence path.
 */
export function createPatternImportDxfPhaseEGoldenCardFullExactCaptureOwnerV1(
  readAuthoritativeAssembly: PatternImportDxfPhaseEGoldenCardFullExactCaptureReadV1,
): PatternImportDxfPhaseEGoldenCardFullExactCaptureOwnerV1 {
  if (typeof readAuthoritativeAssembly !== 'function')
    throw new TypeError('An injected fixed-lock authoritative snapshot reader is required.');

  let generation = 0;
  let active: Ticket | null = null;
  let disposed = false;

  const invalidate = (reason: Ticket['invalidatedBy']) => {
    if (!active) return;
    active.invalidatedBy = reason;
    active.controller.abort();
    active = null;
  };

  return Object.freeze({
    schemaVersion: PATTERN_IMPORT_DXF_PHASE_E_GOLDEN_CARD_FULL_EXACT_CAPTURE_OWNER_V1,
    claims: PATTERN_IMPORT_DXF_PHASE_E_GOLDEN_CARD_FULL_EXACT_CAPTURE_OWNER_CLAIMS_V1,
    async capture(request, signal) {
      if (disposed) return blocked('owner-disposed', 'The capture owner was disposed.', null);
      const captured = captureRequest(request);
      if (!captured.ok)
        return blocked(captured.code, captured.detail, null, [], captured.operationNumbers, null);
      if (
        !signal ||
        typeof signal !== 'object' ||
        typeof signal.addEventListener !== 'function' ||
        typeof signal.removeEventListener !== 'function'
      )
        return blocked('invalid-request', 'A caller-owned AbortSignal is required.', null);

      invalidate('superseded');
      generation += 1;
      const ticket: Ticket = {
        generation,
        controller: new AbortController(),
        invalidatedBy: null,
      };
      active = ticket;
      const cancelFromCaller = () => {
        if (ticket.invalidatedBy === null) ticket.invalidatedBy = 'cancelled';
        ticket.controller.abort();
      };
      if (signal.aborted) cancelFromCaller();
      else signal.addEventListener('abort', cancelFromCaller, { once: true });

      const completed: number[] = [];
      const evidence: PatternImportDxfPhaseESavedRowAuthoritativeAssemblyEvidenceV1[] = [];
      try {
        for (const candidate of captured.request.candidates) {
          const invalidated = invalidationResult(ticket, generation, completed);
          if (invalidated) return invalidated;
          let snapshot: PatternImportDxfPhaseESavedRowAuthoritativeAssemblyEvidenceV1;
          try {
            snapshot = await readAuthoritativeAssembly(
              Object.freeze({
                row: candidate.row,
                selectedOperationNumber: candidate.selectedOperationNumber,
              }),
              ticket.controller.signal,
            );
          } catch {
            const afterFailure = invalidationResult(ticket, generation, completed);
            if (afterFailure) return afterFailure;
            return blocked(
              'snapshot-read-failed',
              `The fixed-lock snapshot read failed at operation ${candidate.selectedOperationNumber}.`,
              ticket.generation,
              completed,
              [candidate.selectedOperationNumber],
            );
          }
          const afterRead = invalidationResult(ticket, generation, completed);
          if (afterRead) return afterRead;
          if (!snapshot || snapshot.selectedOperationNumber !== candidate.selectedOperationNumber)
            return blocked(
              'selected-operation-mismatch',
              `The reader returned another operation for ${candidate.selectedOperationNumber}.`,
              ticket.generation,
              completed,
              [candidate.selectedOperationNumber],
            );
          if (snapshot.row.techCardId !== captured.request.expectedTechCardId)
            return blocked(
              'tech-card-mismatch',
              'The reader returned another tech card.',
              ticket.generation,
              completed,
              [candidate.selectedOperationNumber],
            );
          if (snapshot.row.cardLockVersion !== captured.request.expectedCardLockVersion)
            return blocked(
              'card-lock-mismatch',
              'The reader returned a stale card lock.',
              ticket.generation,
              completed,
              [candidate.selectedOperationNumber],
            );
          if (!sameRow(snapshot.row, candidate.row))
            return blocked(
              'saved-row-mismatch',
              `Operation ${candidate.selectedOperationNumber} returned a stale or foreign saved row.`,
              ticket.generation,
              completed,
              [candidate.selectedOperationNumber],
            );
          if (snapshot.serverAssemblyRevision !== captured.request.expectedServerAssemblyRevision)
            return blocked(
              'server-assembly-revision-mismatch',
              'The reader returned a stale or mixed Assembly revision.',
              ticket.generation,
              completed,
              [candidate.selectedOperationNumber],
            );
          evidence.push(snapshot);
          completed.push(candidate.selectedOperationNumber);
        }

        const invalidated = invalidationResult(ticket, generation, completed);
        if (invalidated) return invalidated;
        const aggregated = aggregatePatternImportDxfPhaseEGoldenCardFullExactCaptureV1({
          cardRef: captured.request.cardRef,
          expectedTechCardId: captured.request.expectedTechCardId,
          expectedCardLockVersion: captured.request.expectedCardLockVersion,
          expectedServerAssemblyRevision: captured.request.expectedServerAssemblyRevision,
          coverageTemplate: captured.request.coverageTemplate,
          operationSnapshots: evidence,
        });
        if (!aggregated.ok)
          return blocked(
            aggregated.blocker.code,
            aggregated.blocker.detail,
            ticket.generation,
            completed,
            aggregated.blocker.operationNumbers,
            aggregated.coverage,
          );
        return Object.freeze({
          ok: true as const,
          schemaVersion: PATTERN_IMPORT_DXF_PHASE_E_GOLDEN_CARD_FULL_EXACT_CAPTURE_OWNER_V1,
          generation: ticket.generation,
          completedOperationNumbers: Object.freeze([...completed]),
          graph: aggregated.graph,
          coverage: aggregated.coverage,
          authoritativeBaseline: null,
          blocker: null,
          claims: PATTERN_IMPORT_DXF_PHASE_E_GOLDEN_CARD_FULL_EXACT_CAPTURE_OWNER_CLAIMS_V1,
        });
      } finally {
        signal.removeEventListener('abort', cancelFromCaller);
        if (active === ticket) active = null;
      }
    },
    cancel() {
      invalidate('cancelled');
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      invalidate('disposed');
    },
  });
}
