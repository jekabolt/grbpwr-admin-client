import { abortableAdminService } from 'api/api';
import type { common_TechCard } from 'api/proto-http/admin';
import { mapTechCardToForm } from 'components/managers/tech-card/components/schema';

import {
  buildPatternImportDxfPhaseEGoldenWholeCardBaselineV1,
  type PatternImportDxfPhaseEGoldenWholeCardBaselineResultV1,
  type PatternImportDxfPhaseEGoldenWholeCardCurrentOperationV1,
  type PatternImportDxfPhaseEGoldenWholeCardExactSelectedOperationProjectionV1,
} from './golden-whole-card-baseline-v1';
import { createPatternImportDxfPhaseESavedAssemblySnapshotProductionRpcV1 } from './saved-assembly-snapshot-production-rpc-v1';
import {
  PATTERN_IMPORT_DXF_PHASE_E_SAVED_ASSEMBLY_TRANSPORT_REQUEST_V1,
  type PatternImportDxfPhaseESavedAssemblyTransportRequestV1,
  type PatternImportDxfPhaseESavedAssemblyTransportResponseV1,
} from './saved-assembly-authority-transport-v1';
import { buildPatternImportDxfPhaseEStitchVisualV1 } from './stitch-visual-v1';

export const PATTERN_IMPORT_DXF_PHASE_E_GOLDEN_WHOLE_CARD_LIVE_READER_V1 =
  'pattern-import-dxf-phase-e-golden-whole-card-live-reader/1' as const;

export const PATTERN_IMPORT_DXF_PHASE_E_GOLDEN_WHOLE_CARD_LIVE_READER_CLAIMS_V1 = Object.freeze({
  getTechCardReadOnly: true,
  savedAssemblySnapshotReadOnly: true,
  expectedCardLockVersionRequired: true,
  currentCardLockVersionMatchedBeforeSnapshotRead: true,
  injectedCurrentCardSupported: true,
  injectedReaderStartsGetTechCardRead: false,
  pureAuthoritativeReadProjectorAvailable: true,
  fullCurrentCardOperationsProjected: true,
  canonicalTechCardFormMapperReused: true,
  canonicalStitchVisualBuilderReused: true,
  transactionalSnapshotOperationsReused: true,
  exactSelectedOperationDocumentsRemainCallerOwned: true,
  rawTechCardRetained: false,
  rawSnapshotRetained: false,
  dxfUrlRetained: false,
  productionIdsRetained: false,
  networkWritesUsed: false,
  createsTopologyAuthority: false,
  createsAssemblyAuthority: false,
  createsPersistenceModel: false,
  uiIntegrated: false,
  productionReady: false,
} as const);

export type PatternImportDxfPhaseEGoldenWholeCardLiveReaderRequestV1 = Readonly<{
  /** Sanitized caller-owned identity; do not pass a production numeric id here. */
  cardRef: string;
  snapshotRequest: PatternImportDxfPhaseESavedAssemblyTransportRequestV1;
  exactSelectedOperationProjections?: readonly PatternImportDxfPhaseEGoldenWholeCardExactSelectedOperationProjectionV1[];
}>;

export type PatternImportDxfPhaseEGoldenWholeCardLiveReaderDepsV1 = Readonly<{
  readTechCard: (techCardId: number, signal: AbortSignal) => Promise<common_TechCard | undefined>;
  readSavedAssemblySnapshot: (
    request: PatternImportDxfPhaseESavedAssemblyTransportRequestV1,
    signal: AbortSignal,
  ) => Promise<PatternImportDxfPhaseESavedAssemblyTransportResponseV1>;
}>;

export type PatternImportDxfPhaseEGoldenWholeCardInjectedLiveReaderDepsV1 = Readonly<{
  readSavedAssemblySnapshot: (
    request: PatternImportDxfPhaseESavedAssemblyTransportRequestV1,
    signal: AbortSignal,
  ) => Promise<PatternImportDxfPhaseESavedAssemblyTransportResponseV1>;
}>;

export type PatternImportDxfPhaseEGoldenWholeCardLiveReaderBlockerCodeV1 =
  | 'invalid-host'
  | 'invalid-request'
  | 'cancelled'
  | 'tech-card-read-failed'
  | 'tech-card-missing'
  | 'tech-card-identity-mismatch'
  | 'tech-card-lock-version-mismatch'
  | 'current-card-projection-failed'
  | 'snapshot-read-failed'
  | 'snapshot-projection-failed';

export type PatternImportDxfPhaseEGoldenWholeCardLiveReaderResultV1 =
  | Readonly<{
      ok: true;
      schemaVersion: typeof PATTERN_IMPORT_DXF_PHASE_E_GOLDEN_WHOLE_CARD_LIVE_READER_V1;
      baseline: Extract<PatternImportDxfPhaseEGoldenWholeCardBaselineResultV1, { ok: true }>;
      blocker: null;
      claims: typeof PATTERN_IMPORT_DXF_PHASE_E_GOLDEN_WHOLE_CARD_LIVE_READER_CLAIMS_V1;
    }>
  | Readonly<{
      ok: false;
      schemaVersion: typeof PATTERN_IMPORT_DXF_PHASE_E_GOLDEN_WHOLE_CARD_LIVE_READER_V1;
      baseline: Extract<
        PatternImportDxfPhaseEGoldenWholeCardBaselineResultV1,
        { ok: false }
      > | null;
      blocker: Readonly<{
        code: PatternImportDxfPhaseEGoldenWholeCardLiveReaderBlockerCodeV1;
        detail: string;
      }> | null;
      claims: typeof PATTERN_IMPORT_DXF_PHASE_E_GOLDEN_WHOLE_CARD_LIVE_READER_CLAIMS_V1;
    }>;

export type PatternImportDxfPhaseEGoldenWholeCardLiveReaderV1 = Readonly<{
  schemaVersion: typeof PATTERN_IMPORT_DXF_PHASE_E_GOLDEN_WHOLE_CARD_LIVE_READER_V1;
  read: (
    request: PatternImportDxfPhaseEGoldenWholeCardLiveReaderRequestV1,
    signal: AbortSignal,
  ) => Promise<PatternImportDxfPhaseEGoldenWholeCardLiveReaderResultV1>;
  claims: typeof PATTERN_IMPORT_DXF_PHASE_E_GOLDEN_WHOLE_CARD_LIVE_READER_CLAIMS_V1;
}>;

export type PatternImportDxfPhaseEGoldenWholeCardInjectedLiveReaderV1 = Readonly<{
  schemaVersion: typeof PATTERN_IMPORT_DXF_PHASE_E_GOLDEN_WHOLE_CARD_LIVE_READER_V1;
  read: (
    request: PatternImportDxfPhaseEGoldenWholeCardLiveReaderRequestV1,
    techCard: common_TechCard | undefined,
    signal: AbortSignal,
  ) => Promise<PatternImportDxfPhaseEGoldenWholeCardLiveReaderResultV1>;
  claims: typeof PATTERN_IMPORT_DXF_PHASE_E_GOLDEN_WHOLE_CARD_LIVE_READER_CLAIMS_V1;
}>;

function blocked(
  code: PatternImportDxfPhaseEGoldenWholeCardLiveReaderBlockerCodeV1,
  detail: string,
): PatternImportDxfPhaseEGoldenWholeCardLiveReaderResultV1 {
  return Object.freeze({
    ok: false as const,
    schemaVersion: PATTERN_IMPORT_DXF_PHASE_E_GOLDEN_WHOLE_CARD_LIVE_READER_V1,
    baseline: null,
    blocker: Object.freeze({ code, detail }),
    claims: PATTERN_IMPORT_DXF_PHASE_E_GOLDEN_WHOLE_CARD_LIVE_READER_CLAIMS_V1,
  });
}

function cancelled(signal: AbortSignal) {
  return signal.aborted ? blocked('cancelled', 'The whole-card golden read was cancelled.') : null;
}

/**
 * Projects the current card through the same form mapper and stitch adapter used by Assembly
 * Order. Structural fields deliberately come from the wire operation so pose seam keys are not
 * removed by the editing form's seam/pose split before the transactional join.
 */
export function projectPatternImportDxfPhaseEGoldenWholeCardCurrentOperationsV1(
  techCard: common_TechCard,
): readonly PatternImportDxfPhaseEGoldenWholeCardCurrentOperationV1[] {
  const wireOperations = techCard.techCard?.operations ?? [];
  const form = mapTechCardToForm(techCard);
  const formOperations = form.operations ?? [];
  if (wireOperations.length !== formOperations.length)
    throw new TypeError('The current-card operation mapper changed operation cardinality.');

  return Object.freeze(
    wireOperations.map((operation, index) => {
      const formOperation = formOperations[index];
      const operationNumber = operation.operationNumber ?? 0;
      if (formOperation.operationNumber !== operationNumber)
        throw new TypeError('The current-card operation mapper changed operation identity.');
      return Object.freeze({
        operationNumber,
        work: operation.work ?? '',
        inputKeys: Object.freeze([...(operation.inputKeys ?? [])]),
        outputUnitKey: operation.outputUnitKey ?? '',
        outputUnitName: operation.outputUnitName ?? '',
        seamKeys: Object.freeze([...(operation.seamKeys ?? [])]),
        stitch: buildPatternImportDxfPhaseEStitchVisualV1({
          operation: formOperation,
          bomItems: form.bomItems ?? [],
          cardDefaultSeamClass: form.construction?.defaultSeamClass,
        }),
      });
    }),
  );
}

function validRequest(request: PatternImportDxfPhaseEGoldenWholeCardLiveReaderRequestV1): boolean {
  try {
    return (
      !!request &&
      typeof request === 'object' &&
      !Array.isArray(request) &&
      typeof request.cardRef === 'string' &&
      !!request.snapshotRequest &&
      request.snapshotRequest.schemaVersion ===
        PATTERN_IMPORT_DXF_PHASE_E_SAVED_ASSEMBLY_TRANSPORT_REQUEST_V1 &&
      Number.isSafeInteger(request.snapshotRequest.techCardId) &&
      request.snapshotRequest.techCardId > 0 &&
      Number.isSafeInteger(request.snapshotRequest.expectedCardLockVersion) &&
      request.snapshotRequest.expectedCardLockVersion >= 0 &&
      Number.isSafeInteger(request.snapshotRequest.selectedOperationNumber) &&
      request.snapshotRequest.selectedOperationNumber > 0 &&
      (request.exactSelectedOperationProjections === undefined ||
        Array.isArray(request.exactSelectedOperationProjections))
    );
  } catch {
    return false;
  }
}

type CurrentOperationProjectionResultV1 =
  | Readonly<{
      ok: true;
      currentOperations: readonly PatternImportDxfPhaseEGoldenWholeCardCurrentOperationV1[];
      result: null;
    }>
  | Readonly<{
      ok: false;
      currentOperations: null;
      result: PatternImportDxfPhaseEGoldenWholeCardLiveReaderResultV1;
    }>;

function projectCurrentCardForRequest(
  request: PatternImportDxfPhaseEGoldenWholeCardLiveReaderRequestV1,
  techCard: common_TechCard | undefined,
): CurrentOperationProjectionResultV1 {
  try {
    if (!techCard)
      return Object.freeze({
        ok: false as const,
        currentOperations: null,
        result: blocked('tech-card-missing', 'The current tech card is unavailable.'),
      });
    if (techCard.id !== request.snapshotRequest.techCardId)
      return Object.freeze({
        ok: false as const,
        currentOperations: null,
        result: blocked(
          'tech-card-identity-mismatch',
          'The current tech-card read returned a different card.',
        ),
      });
    if (techCard.lockVersion !== request.snapshotRequest.expectedCardLockVersion)
      return Object.freeze({
        ok: false as const,
        currentOperations: null,
        result: blocked(
          'tech-card-lock-version-mismatch',
          'The current card moved from the saved-row lock version.',
        ),
      });
    return Object.freeze({
      ok: true as const,
      currentOperations: projectPatternImportDxfPhaseEGoldenWholeCardCurrentOperationsV1(techCard),
      result: null,
    });
  } catch {
    return Object.freeze({
      ok: false as const,
      currentOperations: null,
      result: blocked(
        'current-card-projection-failed',
        'The current card cannot be projected into the golden baseline.',
      ),
    });
  }
}

function buildFromProjectedReads(
  request: PatternImportDxfPhaseEGoldenWholeCardLiveReaderRequestV1,
  currentOperations: readonly PatternImportDxfPhaseEGoldenWholeCardCurrentOperationV1[],
  snapshot: PatternImportDxfPhaseESavedAssemblyTransportResponseV1,
): PatternImportDxfPhaseEGoldenWholeCardLiveReaderResultV1 {
  try {
    const baseline = buildPatternImportDxfPhaseEGoldenWholeCardBaselineV1({
      cardRef: request.cardRef,
      snapshotOperations: snapshot.operations,
      currentOperations,
      exactSelectedOperationProjections: request.exactSelectedOperationProjections ?? [],
    });
    if (!baseline.ok)
      return Object.freeze({
        ok: false as const,
        schemaVersion: PATTERN_IMPORT_DXF_PHASE_E_GOLDEN_WHOLE_CARD_LIVE_READER_V1,
        baseline,
        blocker: null,
        claims: PATTERN_IMPORT_DXF_PHASE_E_GOLDEN_WHOLE_CARD_LIVE_READER_CLAIMS_V1,
      });
    return Object.freeze({
      ok: true as const,
      schemaVersion: PATTERN_IMPORT_DXF_PHASE_E_GOLDEN_WHOLE_CARD_LIVE_READER_V1,
      baseline,
      blocker: null,
      claims: PATTERN_IMPORT_DXF_PHASE_E_GOLDEN_WHOLE_CARD_LIVE_READER_CLAIMS_V1,
    });
  } catch {
    return blocked(
      'snapshot-projection-failed',
      'The saved Assembly snapshot could not be inspected safely.',
    );
  }
}

/**
 * Pure projection from two already-authoritative reads. This is the integration seam for an owner
 * that already holds GetTechCard: it performs no RPC, cache mutation or persistence and retains
 * neither raw response in the returned baseline.
 */
export function buildPatternImportDxfPhaseEGoldenWholeCardFromAuthoritativeReadsV1(
  request: PatternImportDxfPhaseEGoldenWholeCardLiveReaderRequestV1,
  techCard: common_TechCard | undefined,
  snapshot: PatternImportDxfPhaseESavedAssemblyTransportResponseV1,
): PatternImportDxfPhaseEGoldenWholeCardLiveReaderResultV1 {
  if (!validRequest(request))
    return blocked('invalid-request', 'A valid whole-card golden read request is required.');
  const projected = projectCurrentCardForRequest(request, techCard);
  if (!projected.ok) return projected.result;
  return buildFromProjectedReads(request, projected.currentOperations, snapshot);
}

/**
 * Read owner for a card payload already held by the parent screen. It starts only the existing
 * saved-snapshot read, and only after card id/lock/projection gates have passed.
 */
export function createPatternImportDxfPhaseEGoldenWholeCardInjectedLiveReaderV1(
  deps: PatternImportDxfPhaseEGoldenWholeCardInjectedLiveReaderDepsV1,
): PatternImportDxfPhaseEGoldenWholeCardInjectedLiveReaderV1 {
  if (!deps || typeof deps !== 'object' || typeof deps.readSavedAssemblySnapshot !== 'function')
    throw new TypeError('An injected whole-card saved-snapshot reader is required.');
  const readSavedAssemblySnapshot = deps.readSavedAssemblySnapshot;
  return Object.freeze({
    schemaVersion: PATTERN_IMPORT_DXF_PHASE_E_GOLDEN_WHOLE_CARD_LIVE_READER_V1,
    claims: PATTERN_IMPORT_DXF_PHASE_E_GOLDEN_WHOLE_CARD_LIVE_READER_CLAIMS_V1,
    async read(request, techCard, signal) {
      if (!validRequest(request))
        return blocked('invalid-request', 'A valid whole-card golden read request is required.');
      const alreadyCancelled = cancelled(signal);
      if (alreadyCancelled) return alreadyCancelled;

      const projected = projectCurrentCardForRequest(request, techCard);
      if (!projected.ok) return projected.result;

      let snapshot: PatternImportDxfPhaseESavedAssemblyTransportResponseV1;
      try {
        snapshot = await readSavedAssemblySnapshot(request.snapshotRequest, signal);
      } catch {
        return (
          cancelled(signal) ??
          blocked('snapshot-read-failed', 'The saved Assembly snapshot could not be read.')
        );
      }
      const afterSnapshotRead = cancelled(signal);
      if (afterSnapshotRead) return afterSnapshotRead;
      return buildFromProjectedReads(request, projected.currentOperations, snapshot);
    },
  });
}

/**
 * Composes the two existing read owners into a detached whole-card baseline. It does not cache,
 * mutate, persist or expose either raw response. The snapshot RPC remains the structural authority;
 * GetTechCard contributes the current operation styling and is lock-matched before that RPC runs.
 */
export function createPatternImportDxfPhaseEGoldenWholeCardLiveReaderV1(
  deps: PatternImportDxfPhaseEGoldenWholeCardLiveReaderDepsV1,
): PatternImportDxfPhaseEGoldenWholeCardLiveReaderV1 {
  if (
    !deps ||
    typeof deps !== 'object' ||
    typeof deps.readTechCard !== 'function' ||
    typeof deps.readSavedAssemblySnapshot !== 'function'
  )
    throw new TypeError('Whole-card golden read dependencies are required.');

  const readTechCard = deps.readTechCard;
  const injected = createPatternImportDxfPhaseEGoldenWholeCardInjectedLiveReaderV1({
    readSavedAssemblySnapshot: deps.readSavedAssemblySnapshot,
  });

  return Object.freeze({
    schemaVersion: PATTERN_IMPORT_DXF_PHASE_E_GOLDEN_WHOLE_CARD_LIVE_READER_V1,
    claims: PATTERN_IMPORT_DXF_PHASE_E_GOLDEN_WHOLE_CARD_LIVE_READER_CLAIMS_V1,
    async read(request, signal) {
      if (!validRequest(request))
        return blocked('invalid-request', 'A valid whole-card golden read request is required.');
      const alreadyCancelled = cancelled(signal);
      if (alreadyCancelled) return alreadyCancelled;

      let techCard: common_TechCard | undefined;
      try {
        techCard = await readTechCard(request.snapshotRequest.techCardId, signal);
      } catch {
        return (
          cancelled(signal) ??
          blocked('tech-card-read-failed', 'The current tech card could not be read.')
        );
      }
      return injected.read(request, techCard, signal);
    },
  });
}

/** Production read binding. It exposes only GetTechCard and the existing saved-snapshot bridge. */
export function createPatternImportDxfPhaseEGoldenWholeCardProductionLiveReaderV1(
  selectedOperationNumber: number,
): PatternImportDxfPhaseEGoldenWholeCardLiveReaderV1 {
  const snapshot =
    createPatternImportDxfPhaseESavedAssemblySnapshotProductionRpcV1(selectedOperationNumber);
  return createPatternImportDxfPhaseEGoldenWholeCardLiveReaderV1({
    async readTechCard(techCardId, signal) {
      const response = await abortableAdminService(signal).GetTechCard({
        id: techCardId,
        vatCountryCode: undefined,
      });
      return response.techCard;
    },
    readSavedAssemblySnapshot: snapshot.bridge.readSavedAssemblySnapshot,
  });
}
