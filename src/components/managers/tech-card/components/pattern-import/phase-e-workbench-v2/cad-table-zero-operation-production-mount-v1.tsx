import type { common_TechCard } from 'api/proto-http/admin';
import { isGenerated } from 'lib/fusing-dxf/generated-pattern';
import {
  useSizeNames,
  useSizeOrdering,
} from 'components/managers/model/components/use-size-systems';
import { useTechCard } from 'components/managers/tech-cards/components/useTechCardQuery';
import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import { CalloutBox, Select, Text } from 'ui';

import {
  readPatternImportDxfPhaseECardSessionV1,
  subscribePatternImportDxfPhaseECardSessionV1,
  type PatternImportDxfPhaseECardSessionV1,
} from '../phase-e-workbench-card-session-v1';
import {
  createPatternImportDxfPhaseEZeroConnectAuthoringRefreshOwnerV1,
  type PatternImportDxfPhaseEZeroConnectAuthoringHandoffOwnerV1,
  type PatternImportDxfPhaseEZeroConnectAuthoringRefreshOwnerV1,
} from './cad-table-zero-connect-authoring-handoff-v1';
import {
  PatternImportDxfPhaseECadTableZeroConnectCanvasV1,
  useCadTableZeroCanvasOwner,
  selectCadTableAcceptedClothPieceV1,
} from './cad-table-zero-connect-canvas-v1';
import {
  CadTablePieceSelection,
  handleCadTablePieceSelectionKey,
} from './cad-table-piece-selection-panel-v1';
import { projectCadTablePieceFeatures } from './cad-table-piece-features-v1';
import {
  bindPatternImportDxfPhaseECadTableZeroOperationFreshToSavedAuthorityV1,
  capturePatternImportDxfPhaseECadTableZeroOperationSavedRebindExpectationV1,
  verifyPatternImportDxfPhaseECadTableZeroOperationSavedAuthorityRefreshV1,
  type PatternImportDxfPhaseECadTableZeroOperationAuthorityRebindExpectationV1,
} from './cad-table-zero-operation-authority-rebind-v1';
import {
  listPatternImportDxfPhaseECadTableZeroOperationFreshChoicesV1,
  preparePatternImportDxfPhaseECadTableZeroOperationFreshV1,
  type PatternImportDxfPhaseECadTableZeroOperationFreshBlockerV1,
  type PatternImportDxfPhaseECadTableZeroOperationFreshChoicesResultV1,
  type PatternImportDxfPhaseECadTableZeroOperationFreshPreparationResultV1,
} from './cad-table-zero-operation-fresh-preparation-v1';
import {
  createPatternImportDxfPhaseECadTableZeroOperationGenerationOwnerV1,
  isPatternImportDxfPhaseECadTableZeroOperationGenerationTicketCurrentV1,
  type PatternImportDxfPhaseECadTableZeroOperationGenerationTicketV1,
} from './cad-table-zero-operation-generation-owner-v1';
import {
  listPatternImportDxfPhaseECadTableZeroOperationSavedChoicesV1,
  preparePatternImportDxfPhaseECadTableZeroOperationSavedV1,
  type PatternImportDxfPhaseECadTableZeroOperationSavedBlockerV1,
  type PatternImportDxfPhaseECadTableZeroOperationSavedChoicesResultV1,
  type PatternImportDxfPhaseECadTableZeroOperationSavedPreparationResultV1,
} from './cad-table-zero-operation-saved-preparation-v1';
import {
  isPatternImportDxfPhaseEZeroConnectPreparedAuthorityV1,
  readPatternImportDxfPhaseEZeroConnectCurrentSavedReplayV1,
} from './cad-table-zero-connect-phase-e-authority-v1';
import { useGuardedPieceRename } from '../../guarded-piece-rename';
import {
  hasMatchingFreshPatternChoiceV1,
  routePatternImportDxfPhaseECadTableZeroOperationSourceV1,
  type PatternImportDxfPhaseECadTableZeroOperationSourceRouteV1,
} from './cad-table-zero-operation-source-routing-v1';
import { preparePatternImportDxfPhaseECadMannequinAllScopeStagingV1 } from './cad-mannequin-all-scope-staging-v1';
import type { PatternImportDxfPhaseECadMannequinDxfStagingSourceV1 } from './cad-mannequin-dxf-staging-v1';
import { preparePatternImportDxfPhaseECadMannequinSavedAllScopeStagingV1 } from './cad-mannequin-saved-all-scope-staging-v1';
import {
  PATTERN_IMPORT_DXF_PHASE_E_CAD_MANNEQUIN_PRODUCTION_SCENE_OVERLAY_BLOCKED_V1,
  PatternImportDxfPhaseECadMannequinModelPickerV1,
} from './cad-workbench-mannequin-model-picker-v1';
import {
  PatternImportDxfPhaseECadWorkbenchSplitShellV1,
  type PatternImportDxfPhaseECadWorkbenchOperationsModeV1,
  type PatternImportDxfPhaseECadWorkbenchSelectionV1,
} from './cad-workbench-split-shell-v1';
import type { CadWorkbenchPhysicalHostV1 } from './cad-workbench-physical-host-v1';
import {
  createPatternImportDxfPhaseEZeroOperationSavedCardAuthorityV1,
  type PatternImportDxfPhaseEZeroOperationSavedCardAuthorityRuntimeV1,
} from './zero-operation-saved-card-authority-v1';

const SavedGeneratedFusingView = lazy(() => import('./saved-generated-fusing-view'));

export const PATTERN_IMPORT_DXF_PHASE_E_CAD_TABLE_ZERO_OPERATION_PRODUCTION_MOUNT_V1 =
  'pattern-import-dxf-phase-e-cad-table-zero-operation-production-mount/1' as const;

export const PATTERN_IMPORT_DXF_PHASE_E_CAD_TABLE_ZERO_OPERATION_PRODUCTION_MOUNT_CLAIMS_V1 =
  Object.freeze({
    zeroOperationEntrySupported: true,
    operationIndependentSavedBrowseFallback: true,
    freshCardSessionRequired: false,
    operationIndependentSavedCardBootstrap: true,
    savedCardRowReadBeforeAndAfterReprocess: true,
    latestSavedCardReadAfterFreshPreparation: true,
    cachedSavedChoicesUsedForFreshFailover: false,
    savedCardByteLengthAndShaVerified: true,
    explicitReplayScopeAndSizeUsed: true,
    exactCatalogAndProjectionOnly: true, // Connect topology
    selectedOperationRequired: false,
    selectedSeamRequired: false,
    proposalCreated: false,
    authoringOperationIdCreated: false,
    existingOperationsFieldWriterOnly: true,
    authoringHandoffRequiresGenuinePreparedAuthority: true,
    createsSecondFormOwner: false,
    realTechCardModelPickerMountedInEveryState: true,
    blockedSavedDxfKeepsMannequinPane: true,
    allMaterialScopeStagingRequested: true,
    savedCurrentMaterialScopeStaged: true,
    savedAllMaterialScopeStagingRequested: true,
    existingSplitShellReused: true,
    rawDxfExposed: false,
    productionMounted: true,
  } as const);

type Prepared =
  | Extract<PatternImportDxfPhaseECadTableZeroOperationFreshPreparationResultV1, { ok: true }>
  | Extract<PatternImportDxfPhaseECadTableZeroOperationSavedPreparationResultV1, { ok: true }>;

type SavedPrepared = Extract<
  PatternImportDxfPhaseECadTableZeroOperationSavedPreparationResultV1,
  { ok: true }
>;

type PreparationResult =
  | PatternImportDxfPhaseECadTableZeroOperationFreshPreparationResultV1
  | PatternImportDxfPhaseECadTableZeroOperationSavedPreparationResultV1;

type PreparationState =
  | Readonly<{
      status: 'idle';
      key: string;
      result: null;
      authoringPrepared: null;
      rebindExpectation: null;
      resolvedSource: null;
      resolvedSavedCard: null;
    }>
  | Readonly<{
      status: 'loading';
      key: string;
      result: null;
      authoringPrepared: null;
      rebindExpectation: null;
      resolvedSource: null;
      resolvedSavedCard: null;
    }>
  | Readonly<{
      status: 'settled';
      key: string;
      result: PreparationResult;
      authoringPrepared: SavedPrepared | null;
      rebindExpectation: PatternImportDxfPhaseECadTableZeroOperationAuthorityRebindExpectationV1 | null;
      resolvedSource: 'fresh' | 'saved';
      resolvedSavedCard: common_TechCard | null;
    }>;

type MannequinStagingState = Readonly<{
  key: string;
  sources: readonly PatternImportDxfPhaseECadMannequinDxfStagingSourceV1[];
  blocked: boolean;
}>;

const IDENTITY_SIZE_ORDER = (ids: number[]) => ids;
const EMPTY_SIZE_NAMES = new Map<number, string>();

export type PatternImportDxfPhaseECadTableZeroOperationMannequinContextV1 = Readonly<{
  sources: readonly PatternImportDxfPhaseECadMannequinDxfStagingSourceV1[];
  activeScopeKey: string | null;
  stagingBlocked: boolean;
  acceptedCloth?: CadWorkbenchPhysicalHostV1['acceptedCloth'];
}>;

type SavedFailoverResult = Readonly<{
  result: PatternImportDxfPhaseECadTableZeroOperationSavedPreparationResultV1;
  resolvedSavedCard: common_TechCard;
  authoringPrepared: SavedPrepared | null;
  rebindExpectation: PatternImportDxfPhaseECadTableZeroOperationAuthorityRebindExpectationV1 | null;
  resolvedSource: 'saved';
}>;

export type PatternImportDxfPhaseECurrentSavedCardGateResultV1 = Readonly<
  | {
      ok: true;
      techCard: common_TechCard;
      hasCompleteSavedDxfRow: boolean;
      choices: PatternImportDxfPhaseECadTableZeroOperationSavedChoicesResultV1;
    }
  | {
      ok: false;
      techCard: null;
      hasCompleteSavedDxfRow: null;
      choices: Extract<
        PatternImportDxfPhaseECadTableZeroOperationSavedChoicesResultV1,
        { ok: false }
      >;
    }
>;

type CurrentSavedCardGateState = Readonly<
  | { status: 'idle'; key: string; result: null }
  | { status: 'loading'; key: string; result: null }
  | {
      status: 'settled';
      key: string;
      result: PatternImportDxfPhaseECurrentSavedCardGateResultV1;
    }
>;

function currentSavedCardReadFailed(
  techCardId: number,
  detail: string,
): Extract<PatternImportDxfPhaseECadTableZeroOperationSavedChoicesResultV1, { ok: false }> {
  return Object.freeze({
    ok: false as const,
    techCardId,
    choices: Object.freeze([]) as readonly [],
    blocker: Object.freeze({
      code: 'saved-card-current-read-failed' as const,
      detail,
    }),
  });
}

/** Reads the current positive card independently before a cached miss may admit fresh authority. */
export async function readPatternImportDxfPhaseECurrentSavedCardGateV1(input: {
  techCardId: number;
  savedAuthority: PatternImportDxfPhaseEZeroOperationSavedCardAuthorityRuntimeV1;
  orderSizeIds: (ids: number[]) => number[];
  sizeNameById: ReadonlyMap<number, string>;
  signal: AbortSignal;
}): Promise<PatternImportDxfPhaseECurrentSavedCardGateResultV1> {
  try {
    const techCard = await input.savedAuthority.resolveCurrentCard(input.techCardId, input.signal);
    if (input.signal.aborted)
      return Object.freeze({
        ok: false as const,
        techCard: null,
        hasCompleteSavedDxfRow: null,
        choices: currentSavedCardReadFailed(
          input.techCardId,
          'The independent current saved card read was cancelled.',
        ),
      });
    return Object.freeze({
      ok: true as const,
      techCard,
      hasCompleteSavedDxfRow: (techCard.techCard?.patterns ?? []).some(
        ({ lineKey, url, downloadUrl }) => Boolean(lineKey && url && downloadUrl),
      ),
      choices: listPatternImportDxfPhaseECadTableZeroOperationSavedChoicesV1(
        techCard,
        input.orderSizeIds,
        input.sizeNameById,
      ),
    });
  } catch {
    return Object.freeze({
      ok: false as const,
      techCard: null,
      hasCompleteSavedDxfRow: null,
      choices: currentSavedCardReadFailed(
        input.techCardId,
        input.signal.aborted
          ? 'The independent current saved card read was cancelled.'
          : 'The current saved card could not be read before opening the table.',
      ),
    });
  }
}

/** A positive existing card may use fresh authority only after one successful current-card read. */
export function routePatternImportDxfPhaseECadTableAfterCurrentSavedCardGateV1(input: {
  techCardId: number | null;
  freshChoices: PatternImportDxfPhaseECadTableZeroOperationFreshChoicesResultV1;
  cachedSavedChoices: PatternImportDxfPhaseECadTableZeroOperationSavedChoicesResultV1;
  currentSavedCardGate: PatternImportDxfPhaseECurrentSavedCardGateResultV1 | null;
}): PatternImportDxfPhaseECadTableZeroOperationSourceRouteV1 {
  if (!input.techCardId || input.cachedSavedChoices.ok)
    return routePatternImportDxfPhaseECadTableZeroOperationSourceV1(
      input.freshChoices,
      input.cachedSavedChoices,
    );
  if (!input.currentSavedCardGate)
    return Object.freeze({ mode: 'saved' as const, choices: input.cachedSavedChoices });
  if (!input.currentSavedCardGate.ok)
    return Object.freeze({ mode: 'saved' as const, choices: input.currentSavedCardGate.choices });
  if (
    input.currentSavedCardGate.hasCompleteSavedDxfRow ||
    input.freshChoices.techCardId !== input.techCardId
  )
    return Object.freeze({ mode: 'saved' as const, choices: input.currentSavedCardGate.choices });
  return routePatternImportDxfPhaseECadTableZeroOperationSourceV1(
    input.freshChoices,
    input.currentSavedCardGate.choices,
  );
}

type VisibleBlocker =
  | PatternImportDxfPhaseECadTableZeroOperationFreshBlockerV1
  | PatternImportDxfPhaseECadTableZeroOperationSavedBlockerV1;

/** Keeps a positive saved card from ever exposing a fresh-session admission failure. */
export function resolvePatternImportDxfPhaseECadTableZeroOperationVisibleBlockerV1(input: {
  techCardId: number | null;
  savedCardGateLoading: boolean;
  preparationBlocker: VisibleBlocker | null;
  currentSavedCardGate: PatternImportDxfPhaseECurrentSavedCardGateResultV1 | null;
}): VisibleBlocker | null {
  if (input.savedCardGateLoading) return null;
  if (input.techCardId && input.preparationBlocker?.code === 'fresh-session-invalid') {
    if (!input.currentSavedCardGate) return null;
    return input.currentSavedCardGate.choices.ok
      ? null
      : input.currentSavedCardGate.choices.blocker;
  }
  return input.preparationBlocker;
}

/** Prevents the live OperationsField handoff from seeing structural or drifted saved authority. */
export function isPatternImportDxfPhaseECadTableZeroOperationAuthoringReadyV1(
  prepared: SavedPrepared | null,
  expectation: PatternImportDxfPhaseECadTableZeroOperationAuthorityRebindExpectationV1 | null,
): boolean {
  return Boolean(
    prepared &&
      expectation &&
      isPatternImportDxfPhaseEZeroConnectPreparedAuthorityV1(prepared.authoringAuthority) &&
      verifyPatternImportDxfPhaseECadTableZeroOperationSavedAuthorityRefreshV1(
        expectation,
        prepared,
      ).ok,
  );
}

/** Creates the one-shot fresh saved-authority reader retained with a zero-connect draft. */
export function createPatternImportDxfPhaseECadTableZeroOperationAuthoringRefreshV1(input: {
  prepared: SavedPrepared | null;
  expectation: PatternImportDxfPhaseECadTableZeroOperationAuthorityRebindExpectationV1 | null;
  savedAuthority: PatternImportDxfPhaseEZeroOperationSavedCardAuthorityRuntimeV1 | null;
  preparationKey: string;
  orderSizeIds: (ids: number[]) => number[];
  sizeNameById: ReadonlyMap<number, string>;
  sourceSurface?: 'explicit-native-drawn-sewing';
  prepareSaved?: typeof preparePatternImportDxfPhaseECadTableZeroOperationSavedV1;
}): PatternImportDxfPhaseEZeroConnectAuthoringRefreshOwnerV1 | null {
  const { prepared, expectation, savedAuthority } = input;
  if (
    !prepared ||
    !expectation ||
    !savedAuthority ||
    !isPatternImportDxfPhaseECadTableZeroOperationAuthoringReadyV1(prepared, expectation)
  )
    return null;
  const selector = prepared.authoringAuthority.row;
  const failed = (detail: string) =>
    Object.freeze({
      ok: false as const,
      authority: null,
      preparationGeneration: null,
      importGeneration: null,
      blocker: Object.freeze({
        code: 'fresh-saved-authority-unavailable' as const,
        detail,
      }),
    });
  const generationOwner = createPatternImportDxfPhaseECadTableZeroOperationGenerationOwnerV1();
  let nextAttempt = 0;
  let activeAttempt = 0;
  let activeTicket: PatternImportDxfPhaseECadTableZeroOperationGenerationTicketV1 | null = null;
  let consumed = false;
  let disposed = false;
  const isCurrent = (
    attempt: number,
    ticket: PatternImportDxfPhaseECadTableZeroOperationGenerationTicketV1,
    signal: AbortSignal,
  ) =>
    !disposed &&
    !consumed &&
    !signal.aborted &&
    activeAttempt === attempt &&
    activeTicket === ticket &&
    isPatternImportDxfPhaseECadTableZeroOperationGenerationTicketCurrentV1(ticket);
  const refreshOwner = Object.freeze({
    async refresh(signal: AbortSignal, lock: 'current' | 'advanced' = 'advanced') {
      if (disposed || consumed)
        return failed('The saved DXF authoring authority capability is already consumed.');
      const attempt = nextAttempt + 1;
      if (!Number.isSafeInteger(attempt) || attempt <= 0) {
        disposed = true;
        generationOwner.dispose();
        return failed('The saved DXF authoring authority capability is disposed.');
      }
      nextAttempt = attempt;
      if (activeTicket) generationOwner.invalidate(activeTicket);
      const refreshKey = `${input.preparationKey}:authoring-refresh`;
      let generationTicket: PatternImportDxfPhaseECadTableZeroOperationGenerationTicketV1 | null =
        null;
      try {
        generationTicket =
          expectation.source === 'fresh-card-session'
            ? generationOwner.beginFresh(refreshKey, expectation.importGeneration)
            : generationOwner.beginSaved(refreshKey);
        activeAttempt = attempt;
        activeTicket = generationTicket;
        if (!isCurrent(attempt, generationTicket, signal))
          return failed('The saved DXF authoring authority refresh was cancelled.');
        const latest = await (lock === 'current'
          ? savedAuthority.resolveExactCurrentCard(selector, signal)
          : savedAuthority.resolveLatestCard(selector, signal));
        if (!isCurrent(attempt, generationTicket, signal))
          return failed('The saved DXF authoring authority refresh was cancelled or superseded.');
        const refreshed = await (
          input.prepareSaved ?? preparePatternImportDxfPhaseECadTableZeroOperationSavedV1
        )(
          {
            techCard: latest.techCard,
            orderSizeIds: input.orderSizeIds,
            sizeNameById: input.sizeNameById,
            scopeKey: selector.scopeKey,
            sizeToken: prepared.sizeToken,
            authority: savedAuthority,
            generation: generationTicket,
            ...(input.sourceSurface ? { sourceSurface: input.sourceSurface } : {}),
          },
          signal,
        );
        if (!isCurrent(attempt, generationTicket, signal))
          return failed('The saved DXF authoring authority refresh was cancelled or superseded.');
        if (!refreshed.ok) return failed(refreshed.blocker.detail);
        if (refreshed.authoringAuthority.row.cardLockVersion !== latest.row.cardLockVersion)
          return failed('The saved card lock moved during the exact DXF authority refresh.');
        const verified = verifyPatternImportDxfPhaseECadTableZeroOperationSavedAuthorityRefreshV1(
          expectation,
          refreshed,
        );
        if (!verified.ok) return failed(verified.blocker.detail);
        if (!isCurrent(attempt, generationTicket, signal))
          return failed('The saved DXF authoring authority refresh was cancelled or superseded.');
        consumed = true;
        disposed = true;
        generationOwner.invalidate(generationTicket);
        activeTicket = null;
        activeAttempt = 0;
        generationOwner.dispose();
        return Object.freeze({
          ok: true as const,
          authority: refreshed.authoringAuthority,
          preparationGeneration: refreshed.preparationGeneration,
          importGeneration: refreshed.importGeneration,
          blocker: null,
        });
      } catch (error) {
        return failed(
          error instanceof Error
            ? error.message
            : 'The saved DXF authoring authority could not be refreshed.',
        );
      } finally {
        if (generationTicket && activeTicket === generationTicket) {
          generationOwner.invalidate(generationTicket);
          activeTicket = null;
          activeAttempt = 0;
        }
      }
    },
  });
  return createPatternImportDxfPhaseEZeroConnectAuthoringRefreshOwnerV1({
    authority: prepared.authoringAuthority,
    expectation,
    catalog: prepared.catalog,
    projection: prepared.projection,
    refreshOwner,
  });
}

/**
 * Prepare the current saved scope and size. The confirmed session may supply the displayed
 * geometry only when it still matches this independently reprocessed row and catalog.
 */
export async function preparePatternImportDxfPhaseECadTableZeroOperationSavedFailoverV1(input: {
  fresh: PatternImportDxfPhaseECadTableZeroOperationFreshPreparationResultV1;
  expectedCommit: Readonly<{ techCardId: number; previousLockVersion: number }>;
  loadDocumentEvidence: PatternImportDxfPhaseECardSessionV1['loadDocumentEvidence'];
  savedAuthority: PatternImportDxfPhaseEZeroOperationSavedCardAuthorityRuntimeV1 | null;
  orderSizeIds: (ids: number[]) => number[];
  sizeNameById: ReadonlyMap<number, string>;
  scopeKey: string;
  sizeToken: string;
  generation: PatternImportDxfPhaseECadTableZeroOperationGenerationTicketV1;
  signal: AbortSignal;
  prepareSaved?: typeof preparePatternImportDxfPhaseECadTableZeroOperationSavedV1;
}) {
  if (
    !input.savedAuthority ||
    input.signal.aborted ||
    input.fresh.techCardId !== input.expectedCommit.techCardId ||
    (input.fresh.scopeKey !== null && input.fresh.scopeKey !== input.scopeKey) ||
    (input.fresh.sizeToken !== null && input.fresh.sizeToken !== input.sizeToken)
  )
    return null;
  let latestSavedCard: common_TechCard;
  try {
    latestSavedCard = await input.savedAuthority.resolveLatestCommittedCard(
      input.expectedCommit,
      input.signal,
    );
  } catch {
    return null;
  }
  const latestSavedChoices = listPatternImportDxfPhaseECadTableZeroOperationSavedChoicesV1(
    latestSavedCard,
    input.orderSizeIds,
    input.sizeNameById,
  );
  const matchingSavedChoice = latestSavedChoices.ok
    ? latestSavedChoices.choices.find(
        (choice) =>
          choice.scopeKey === input.scopeKey &&
          choice.sizes.some((size) => size.sizeToken === input.sizeToken),
      )
    : null;
  if (!matchingSavedChoice || input.signal.aborted) return null;
  // Check the session's original receipt, row revision, display version and aliases before the
  // independent saved preparation. A concurrent replacement then falls back to the current row.
  const document = input.fresh.ok
    ? await input.loadDocumentEvidence(input.scopeKey).catch(() => null)
    : null;
  const saved = await (
    input.prepareSaved ?? preparePatternImportDxfPhaseECadTableZeroOperationSavedV1
  )(
    {
      techCard: latestSavedCard,
      orderSizeIds: input.orderSizeIds,
      sizeNameById: input.sizeNameById,
      scopeKey: input.scopeKey,
      sizeToken: input.sizeToken,
      authority: input.savedAuthority,
      generation: input.generation,
    },
    input.signal,
  );
  return resolvePatternImportDxfPhaseECadTableZeroOperationAfterFreshV1(
    input.fresh,
    Object.freeze({
      result: saved,
      resolvedSavedCard: latestSavedCard,
      authoringPrepared: saved.ok ? saved : null,
      rebindExpectation: saved.ok
        ? capturePatternImportDxfPhaseECadTableZeroOperationSavedRebindExpectationV1(saved)
        : null,
      resolvedSource: 'saved' as const,
    }),
    document,
  );
}

/** Applies the Host's fail-closed fresh/saved decision only after the independent saved read. */
export function resolvePatternImportDxfPhaseECadTableZeroOperationAfterFreshV1(
  fresh: PatternImportDxfPhaseECadTableZeroOperationFreshPreparationResultV1,
  latestSaved: SavedFailoverResult,
  document: Awaited<ReturnType<PatternImportDxfPhaseECardSessionV1['loadDocumentEvidence']>> | null,
) {
  if (!fresh.ok || !latestSaved.result.ok) return latestSaved;
  if (
    !hasMatchingFreshPatternChoiceV1(
      fresh,
      latestSaved.result,
      fresh.techCardId,
      fresh.scopeKey,
      fresh.sizeToken,
    )
  )
    return latestSaved;
  const rebound = bindPatternImportDxfPhaseECadTableZeroOperationFreshToSavedAuthorityV1(
    fresh,
    latestSaved.result,
  );
  if (!rebound.ok) return latestSaved;
  const row = latestSaved.result.authoringAuthority.row;
  const pattern = latestSaved.resolvedSavedCard.techCard?.patterns?.find(
    ({ lineKey }) => lineKey === row.patternLineKey,
  );
  if (
    !document?.ok ||
    document.evidence.patternVersion !== pattern?.version ||
    document.evidence.techCardId !== row.techCardId ||
    document.evidence.scopeKey !== row.scopeKey ||
    document.evidence.patternLineKey !== row.patternLineKey ||
    document.evidence.dxfSha256 !== row.sha256 ||
    document.evidence.cardLockVersion !== row.cardLockVersion
  )
    return latestSaved;
  return Object.freeze({
    result: fresh,
    authoringPrepared: latestSaved.result,
    rebindExpectation: rebound.expectation,
    resolvedSource: 'fresh' as const,
    resolvedSavedCard: latestSaved.resolvedSavedCard,
  });
}

/**
 * The zero-row view has no selected Assembly operation to borrow. It accepts either the confirmed
 * import session or an operation-independent, revalidated saved-row authority plus the existing
 * OperationsField handoff. Neither path invents an operation or geometry.
 */
export function PatternImportDxfPhaseECadTableZeroOperationHostV1({
  techCardId,
  cardSession,
  zeroConnectAuthoringHandoff,
  mannequin,
  disabled = false,
  savedCard = null,
  orderSizeIds = IDENTITY_SIZE_ORDER,
  sizeNameById = EMPTY_SIZE_NAMES,
  savedAuthority = null,
  selection = Object.freeze({ operationNumber: null }),
  operationsPanel = null,
  acceptedCloth,
  defaultOperationsMode = 'collapsed',
  sourceSurface,
}: Readonly<{
  techCardId?: number;
  cardSession: PatternImportDxfPhaseECardSessionV1 | null;
  zeroConnectAuthoringHandoff?: PatternImportDxfPhaseEZeroConnectAuthoringHandoffOwnerV1;
  mannequin: (context: PatternImportDxfPhaseECadTableZeroOperationMannequinContextV1) => ReactNode;
  disabled?: boolean;
  savedCard?: common_TechCard | null;
  orderSizeIds?: (ids: number[]) => number[];
  sizeNameById?: ReadonlyMap<number, string>;
  savedAuthority?: PatternImportDxfPhaseEZeroOperationSavedCardAuthorityRuntimeV1 | null;
  selection?: PatternImportDxfPhaseECadWorkbenchSelectionV1;
  operationsPanel?: ReactNode;
  acceptedCloth?: CadWorkbenchPhysicalHostV1['acceptedCloth'];
  defaultOperationsMode?: PatternImportDxfPhaseECadWorkbenchOperationsModeV1;
  sourceSurface?: 'explicit-native-drawn-sewing';
}>) {
  const savePieceRename = useGuardedPieceRename();
  const generation = cardSession?.importGeneration ?? 0;
  const freshChoices = useMemo(
    () => listPatternImportDxfPhaseECadTableZeroOperationFreshChoicesV1(cardSession, generation),
    [cardSession, generation],
  );
  const savedChoices = useMemo(
    () =>
      listPatternImportDxfPhaseECadTableZeroOperationSavedChoicesV1(
        savedCard,
        orderSizeIds,
        sizeNameById,
      ),
    [orderSizeIds, savedCard, sizeNameById],
  );
  const positiveTechCardId = useMemo(() => {
    for (const candidate of [techCardId, savedCard?.id, cardSession?.techCardId])
      if (Number.isSafeInteger(candidate) && Number(candidate) > 0) return Number(candidate);
    return null;
  }, [cardSession?.techCardId, savedCard?.id, techCardId]);
  const savedCardGateKey =
    positiveTechCardId && !savedChoices.ok
      ? `${positiveTechCardId}:${savedCard?.lockVersion ?? -1}:${savedChoices.blocker.code}`
      : '';
  const [savedCardGate, setSavedCardGate] = useState<CurrentSavedCardGateState>(() => ({
    status: 'idle',
    key: '',
    result: null,
  }));
  useEffect(() => {
    if (!savedCardGateKey || !positiveTechCardId || savedChoices.ok) {
      setSavedCardGate((current) =>
        current.status === 'idle' && current.key === ''
          ? current
          : { status: 'idle', key: '', result: null },
      );
      return;
    }
    if (!savedAuthority) {
      setSavedCardGate({
        status: 'settled',
        key: savedCardGateKey,
        result: Object.freeze({
          ok: false as const,
          techCard: null,
          hasCompleteSavedDxfRow: null,
          choices: currentSavedCardReadFailed(
            positiveTechCardId,
            'The independent saved-card authority is unavailable.',
          ),
        }),
      });
      return;
    }
    let current = true;
    const controller = new AbortController();
    setSavedCardGate({ status: 'loading', key: savedCardGateKey, result: null });
    void readPatternImportDxfPhaseECurrentSavedCardGateV1({
      techCardId: positiveTechCardId,
      savedAuthority,
      orderSizeIds,
      sizeNameById,
      signal: controller.signal,
    }).then((result) => {
      if (current) setSavedCardGate({ status: 'settled', key: savedCardGateKey, result });
    });
    return () => {
      current = false;
      controller.abort();
    };
  }, [
    orderSizeIds,
    positiveTechCardId,
    savedAuthority,
    savedCardGateKey,
    savedChoices.ok,
    sizeNameById,
  ]);
  const currentSavedCardGate =
    savedCardGate.key === savedCardGateKey && savedCardGate.status === 'settled'
      ? savedCardGate.result
      : null;
  const savedCardGateLoading =
    Boolean(savedCardGateKey) &&
    (savedCardGate.key !== savedCardGateKey || savedCardGate.status !== 'settled');
  const sourceRoute = useMemo(
    () =>
      routePatternImportDxfPhaseECadTableAfterCurrentSavedCardGateV1({
        techCardId: positiveTechCardId,
        freshChoices,
        cachedSavedChoices: savedChoices,
        currentSavedCardGate,
      }),
    [currentSavedCardGate, freshChoices, positiveTechCardId, savedChoices],
  );
  const effectiveSavedCard =
    !savedChoices.ok && currentSavedCardGate?.ok ? currentSavedCardGate.techCard : savedCard;
  const explicitSavedChoices =
    !savedChoices.ok && currentSavedCardGate?.ok ? currentSavedCardGate.choices : savedChoices;
  const choices = sourceSurface ? explicitSavedChoices : sourceRoute.choices;
  const [chosenScopeKey, setChosenScopeKey] = useState('');
  const [chosenSizeToken, setChosenSizeToken] = useState('');
  const defaultScope = choices.ok ? choices.choices[0] : undefined;
  const selectedScope = choices.ok
    ? choices.choices.find(({ scopeKey }) => scopeKey === chosenScopeKey) ?? defaultScope
    : undefined;
  const scopeKey = selectedScope?.scopeKey ?? '';
  const selectedSize =
    selectedScope?.sizes.find(({ sizeToken }) => sizeToken === chosenSizeToken) ??
    selectedScope?.sizes[0];
  const sizeToken = selectedSize?.sizeToken ?? '';
  const useFreshSession = hasMatchingFreshPatternChoiceV1(
    freshChoices,
    choices,
    positiveTechCardId,
    scopeKey,
    sizeToken,
    sourceSurface,
  );
  const generatedRows =
    selectedScope?.isInterlining && !useFreshSession
      ? effectiveSavedCard?.techCard?.patterns?.filter((pattern) => pattern.bomLineKey === scopeKey)
      : undefined;
  const generatedFusing = Boolean(generatedRows?.length === 1 && isGenerated(generatedRows[0]!));
  const preparationKey =
    useFreshSession && cardSession
      ? `fresh:${cardSession.techCardId}:${generation}:${effectiveSavedCard?.lockVersion ?? -1}:${scopeKey}:${sizeToken}`
      : `saved:${effectiveSavedCard?.id ?? 0}:${effectiveSavedCard?.lockVersion ?? -1}:${scopeKey}:${sizeToken}:${sourceSurface ?? 'default'}`;
  const [preparation, setPreparation] = useState<PreparationState>(() => ({
    status: 'idle',
    key: '',
    result: null,
    authoringPrepared: null,
    rebindExpectation: null,
    resolvedSource: null,
    resolvedSavedCard: null,
  }));
  useEffect(() => {
    if (!choices.ok || !scopeKey || !sizeToken || generatedFusing) {
      setPreparation({
        status: 'idle',
        key: preparationKey,
        result: null,
        authoringPrepared: null,
        rebindExpectation: null,
        resolvedSource: null,
        resolvedSavedCard: null,
      });
      return;
    }
    if (!savedAuthority) {
      setPreparation({
        status: 'idle',
        key: preparationKey,
        result: null,
        authoringPrepared: null,
        rebindExpectation: null,
        resolvedSource: null,
        resolvedSavedCard: null,
      });
      return;
    }
    let current = true;
    const controller = new AbortController();
    // The owner belongs to this preparation attempt. A component-wide memo is unsafe in React
    // StrictMode because its effect cleanup is intentionally replayed while the same memoized
    // object remains mounted, leaving the next setup with an already disposed owner.
    const preparationGenerationOwner =
      createPatternImportDxfPhaseECadTableZeroOperationGenerationOwnerV1();
    const generationTicket =
      useFreshSession && cardSession
        ? preparationGenerationOwner.beginFresh(preparationKey, generation)
        : preparationGenerationOwner.beginSaved(preparationKey);
    setPreparation({
      status: 'loading',
      key: preparationKey,
      result: null,
      authoringPrepared: null,
      rebindExpectation: null,
      resolvedSource: null,
      resolvedSavedCard: null,
    });
    void (async () => {
      if (useFreshSession && cardSession) {
        const fresh = await preparePatternImportDxfPhaseECadTableZeroOperationFreshV1({
          cardSession,
          expectedImportGeneration: generation,
          scopeKey,
          sizeToken,
        });
        const latestSaved = await preparePatternImportDxfPhaseECadTableZeroOperationSavedFailoverV1(
          {
            fresh,
            loadDocumentEvidence: cardSession.loadDocumentEvidence,
            expectedCommit: {
              techCardId: cardSession.confirmedApply.commitReceipt.techCardId,
              previousLockVersion: cardSession.confirmedApply.commitReceipt.previousLockVersion,
            },
            savedAuthority,
            orderSizeIds,
            sizeNameById,
            scopeKey,
            sizeToken,
            generation: generationTicket,
            signal: controller.signal,
          },
        );
        if (latestSaved) return latestSaved;
        // Every registered session follows a saved import. A deleted or unreachable row cannot authorize it.
      }
      const saved = await preparePatternImportDxfPhaseECadTableZeroOperationSavedV1(
        {
          techCard: effectiveSavedCard,
          orderSizeIds,
          sizeNameById,
          scopeKey,
          sizeToken,
          authority: savedAuthority,
          generation: generationTicket,
          ...(sourceSurface ? { sourceSurface } : {}),
        },
        controller.signal,
      );
      return Object.freeze({
        result: saved,
        authoringPrepared: saved.ok ? saved : null,
        rebindExpectation: saved.ok
          ? capturePatternImportDxfPhaseECadTableZeroOperationSavedRebindExpectationV1(saved)
          : null,
        resolvedSource: 'saved' as const,
        resolvedSavedCard: effectiveSavedCard,
      });
    })().then(
      ({ result, authoringPrepared, rebindExpectation, resolvedSource, resolvedSavedCard }) => {
        if (current)
          setPreparation({
            status: 'settled',
            key: preparationKey,
            result,
            authoringPrepared,
            rebindExpectation,
            resolvedSource,
            resolvedSavedCard,
          });
      },
    );
    return () => {
      current = false;
      controller.abort();
      preparationGenerationOwner.invalidate(generationTicket);
      preparationGenerationOwner.dispose();
    };
  }, [
    cardSession,
    choices.ok,
    generatedFusing,
    effectiveSavedCard,
    generation,
    orderSizeIds,
    preparationKey,
    savedAuthority,
    scopeKey,
    sizeNameById,
    sizeToken,
    sourceSurface,
    useFreshSession,
  ]);

  const currentPreparation =
    !generatedFusing && preparation.key === preparationKey ? preparation : null;
  const prepared =
    currentPreparation?.status === 'settled' && currentPreparation.result?.ok
      ? (currentPreparation.result as Prepared)
      : null;
  const tableSessionOwner = useCadTableZeroCanvasOwner(prepared?.projection ?? null);
  const resolvedSource = currentPreparation?.resolvedSource ?? null;
  type SelectClothPiece = NonNullable<
    NonNullable<CadWorkbenchPhysicalHostV1['acceptedCloth']>['onSelectPiece']
  >;
  const selectClothPieceRef = useRef<SelectClothPiece | null>(null);
  useLayoutEffect(() => {
    if (
      disabled ||
      resolvedSource !== 'saved' ||
      !tableSessionOwner ||
      !prepared ||
      !('authoringAuthority' in prepared)
    )
      return;
    const { row } = prepared.authoringAuthority;
    selectClothPieceRef.current = (hit) =>
      tableSessionOwner.update((session) =>
        selectCadTableAcceptedClothPieceV1(session, row, prepared.projection, hit),
      );
    return () => {
      selectClothPieceRef.current = null;
    };
  }, [disabled, prepared, resolvedSource, tableSessionOwner]);
  const selectableCloth = useMemo(
    () =>
      acceptedCloth?.ranges.some(({ sourcePiece }) => sourcePiece)
        ? Object.freeze({
            ...acceptedCloth,
            onSelectPiece: ((hit) => selectClothPieceRef.current?.(hit)) satisfies SelectClothPiece,
          })
        : acceptedCloth,
    [acceptedCloth],
  );
  const pieceFeatures = useMemo(() => {
    if (!prepared) return undefined;
    const scopes =
      'draftCadCompileSource' in prepared
        ? prepared.draftCadCompileSource.scopes
        : cardSession?.draft.scopes;
    return (
      scopes &&
      projectCadTablePieceFeatures(
        prepared.catalog,
        prepared.projection,
        scopes,
        selectedScope?.label,
      )
    );
  }, [cardSession, prepared, selectedScope?.label]);
  const resolvedSavedCard = currentPreparation?.resolvedSavedCard ?? effectiveSavedCard;
  const resolvedSavedChoices = useMemo(
    () =>
      listPatternImportDxfPhaseECadTableZeroOperationSavedChoicesV1(
        resolvedSavedCard,
        orderSizeIds,
        sizeNameById,
      ),
    [orderSizeIds, resolvedSavedCard, sizeNameById],
  );
  const authoringPrepared =
    currentPreparation?.status === 'settled' ? currentPreparation.authoringPrepared : null;
  const rebindExpectation =
    currentPreparation?.status === 'settled' ? currentPreparation.rebindExpectation : null;
  const renameAuthority = authoringPrepared?.authoringAuthority;
  const currentSavedPieceMetadata =
    renameAuthority &&
    renameAuthority.row.cardLockVersion === resolvedSavedCard?.lockVersion &&
    readPatternImportDxfPhaseEZeroConnectCurrentSavedReplayV1(renameAuthority)
      ? resolvedSavedCard?.techCard?.pieces
      : undefined;
  const renamePiece =
    !disabled &&
    selection.operationNumber == null &&
    savePieceRename &&
    renameAuthority &&
    resolvedSavedCard?.techCard &&
    !resolvedSavedCard.techCard.operations?.length &&
    !resolvedSavedCard.seams?.length &&
    !resolvedSavedCard.pieceFolds?.length &&
    currentSavedPieceMetadata
      ? {
          row: renameAuthority.row,
          save: savePieceRename,
        }
      : undefined;
  const authoringAuthorityRefresh = useMemo(
    () =>
      createPatternImportDxfPhaseECadTableZeroOperationAuthoringRefreshV1({
        prepared: authoringPrepared,
        expectation: rebindExpectation,
        savedAuthority,
        preparationKey,
        orderSizeIds,
        sizeNameById,
        sourceSurface,
      }),
    [
      authoringPrepared,
      orderSizeIds,
      preparationKey,
      rebindExpectation,
      savedAuthority,
      sizeNameById,
      sourceSurface,
    ],
  );
  const authoringReady =
    isPatternImportDxfPhaseECadTableZeroOperationAuthoringReadyV1(
      authoringPrepared,
      rebindExpectation,
    ) && authoringAuthorityRefresh !== null;
  const preparationBlocker = !choices.ok
    ? choices.blocker
    : currentPreparation?.status === 'settled' && currentPreparation.result?.ok === false
      ? currentPreparation.result.blocker
      : null;
  const blocker = resolvePatternImportDxfPhaseECadTableZeroOperationVisibleBlockerV1({
    techCardId: positiveTechCardId,
    savedCardGateLoading,
    preparationBlocker,
    currentSavedCardGate,
  });

  const currentMannequinSource =
    useMemo<PatternImportDxfPhaseECadMannequinDxfStagingSourceV1 | null>(
      () =>
        prepared
          ? Object.freeze({
              scopeKey: prepared.scopeKey,
              label:
                prepared.choices.find(({ scopeKey: candidate }) => candidate === prepared.scopeKey)
                  ?.label ?? prepared.scopeKey,
              projection: prepared.projection,
            })
          : null,
      [prepared],
    );
  const stageFromSession =
    resolvedSource === 'fresh' &&
    resolvedSavedChoices.ok &&
    resolvedSavedChoices.choices.length === 1;
  const mannequinStagingKey = currentMannequinSource
    ? stageFromSession && cardSession
      ? `fresh:${cardSession.techCardId}:${generation}:${currentMannequinSource.scopeKey}:${sizeToken}`
      : `saved:${resolvedSavedCard?.id ?? 0}:${resolvedSavedCard?.lockVersion ?? -1}:${currentMannequinSource.scopeKey}:${sizeToken}`
    : '';
  const [mannequinStaging, setMannequinStaging] = useState<MannequinStagingState | null>(null);
  useEffect(() => {
    const resolvedChoices = resolvedSavedChoices.ok ? resolvedSavedChoices : choices;
    if (!resolvedChoices.ok || !currentMannequinSource || !mannequinStagingKey) {
      setMannequinStaging(null);
      return;
    }
    let current = true;
    const controller = new AbortController();
    if (stageFromSession && cardSession) {
      void preparePatternImportDxfPhaseECadMannequinAllScopeStagingV1({
        draft: cardSession.draft,
        techCardId: cardSession.techCardId,
        expectedImportGeneration: generation,
        currentImportGeneration: cardSession.importGeneration,
        scopes: resolvedChoices.choices.map(({ scopeKey: candidate, label }) => ({
          scopeKey: candidate,
          label,
        })),
        sizeToken,
        current: currentMannequinSource,
      }).then((result) => {
        if (!current) return;
        setMannequinStaging(
          Object.freeze({
            key: mannequinStagingKey,
            sources: result.sources,
            blocked: !result.ok,
          }),
        );
      });
    } else if (resolvedSavedCard && savedAuthority) {
      void preparePatternImportDxfPhaseECadMannequinSavedAllScopeStagingV1({
        techCard: resolvedSavedCard,
        orderSizeIds,
        sizeNameById,
        sizeToken,
        current: currentMannequinSource,
        authority: savedAuthority,
        preparationKey: mannequinStagingKey,
        signal: controller.signal,
      }).then((result) => {
        if (!current) return;
        setMannequinStaging(
          Object.freeze({
            key: mannequinStagingKey,
            sources: result.sources,
            blocked: !result.ok,
          }),
        );
      });
    } else {
      setMannequinStaging(null);
    }
    return () => {
      current = false;
      controller.abort();
    };
  }, [
    cardSession,
    choices,
    currentMannequinSource,
    generation,
    mannequinStagingKey,
    orderSizeIds,
    savedAuthority,
    resolvedSavedCard,
    resolvedSavedChoices,
    sizeNameById,
    sizeToken,
    stageFromSession,
  ]);
  const mannequinSources = currentMannequinSource
    ? mannequinStaging?.key === mannequinStagingKey
      ? mannequinStaging.sources
      : Object.freeze([currentMannequinSource])
    : Object.freeze([]);

  return (
    <PatternImportDxfPhaseECadWorkbenchSplitShellV1
      selection={selection}
      objectSidebar={
        prepared && tableSessionOwner ? (
          <CadTablePieceSelection
            owner={tableSessionOwner}
            projection={prepared.projection}
            features={pieceFeatures}
            savedPieces={currentSavedPieceMetadata}
            renamePiece={renamePiece}
          />
        ) : null
      }
      onContentKeyDown={(event) => {
        if (tableSessionOwner) handleCadTablePieceSelectionKey(event, tableSessionOwner);
      }}
      defaultOperationsMode={defaultOperationsMode}
      desktop={
        <section
          data-cad-zero-operation-production-host-v1=''
          data-cad-zero-operation-geometry-source={
            prepared ? resolvedSource ?? undefined : undefined
          }
          data-cad-zero-operation-selected-authority='absent'
          data-cad-zero-operation-proposal='absent'
          className={`min-w-0 overflow-hidden border border-borderColor bg-bgColor ${generatedFusing ? 'flex h-full min-h-0 flex-col' : ''}`}
        >
          {choices.ok && (
            <div className='flex min-h-9 flex-wrap items-center gap-2 border-b border-borderColor px-2 py-1'>
              <span className='text-micro font-bold uppercase tracking-group text-labelColor'>
                Pattern set
              </span>
              <span data-cad-zero-operation-material-scope=''>
                <Select
                  name='cad-zero-operation-material-scope'
                  size='sm'
                  value={scopeKey}
                  items={choices.choices.map((choice) => ({
                    value: choice.scopeKey,
                    label: choice.label,
                  }))}
                  onValueChange={(value) => {
                    setChosenScopeKey(value);
                    setChosenSizeToken('');
                  }}
                  readOnly={disabled}
                />
              </span>
              <span data-cad-zero-operation-size=''>
                <Select
                  name='cad-zero-operation-size'
                  size='sm'
                  value={sizeToken}
                  items={(selectedScope?.sizes ?? []).map((size) => ({
                    value: size.sizeToken,
                    label: size.label,
                  }))}
                  onValueChange={setChosenSizeToken}
                  readOnly={disabled}
                />
              </span>
              {currentPreparation?.status === 'loading' && (
                <span className='text-micro text-labelColor'>opening exact saved geometry…</span>
              )}
            </div>
          )}

          {generatedFusing &&
            effectiveSavedCard &&
            savedAuthority &&
            selectedSize &&
            selectedScope && (
              <Suspense
                fallback={
                  <Text component='p' size='micro' role='status'>
                    Reading saved fusing…
                  </Text>
                }
              >
                <SavedGeneratedFusingView
                  key={JSON.stringify([
                    preparationKey,
                    generatedRows?.[0]?.lineKey,
                    generatedRows?.[0]?.savedRowRevision,
                    generatedRows?.[0]?.sha256,
                  ])}
                  techCard={effectiveSavedCard}
                  scope={selectedScope}
                  size={selectedSize}
                  authority={savedAuthority}
                  orderSizeIds={orderSizeIds}
                  sizeNameById={sizeNameById}
                />
              </Suspense>
            )}
          {!generatedFusing && blocker && (
            <div data-cad-zero-operation-blocker={blocker.code}>
              <CalloutBox tone='error' className='m-2 text-small'>
                <b>2D table unavailable.</b> {blocker.detail}
              </CalloutBox>
            </div>
          )}

          {prepared && tableSessionOwner && (
            <PatternImportDxfPhaseECadTableZeroConnectCanvasV1
              catalog={prepared.catalog}
              projection={prepared.projection}
              pieceFeatures={pieceFeatures}
              tableSessionOwner={tableSessionOwner}
              authoringAuthority={authoringReady ? authoringPrepared?.authoringAuthority : null}
              authoringAuthorityRefresh={authoringReady ? authoringAuthorityRefresh : null}
              zeroConnectAuthoringHandoff={authoringReady ? zeroConnectAuthoringHandoff : undefined}
              disabled={disabled || !authoringReady}
            />
          )}
        </section>
      }
      mannequin={mannequin({
        sources: mannequinSources,
        activeScopeKey: currentMannequinSource?.scopeKey ?? null,
        stagingBlocked: mannequinStaging?.key === mannequinStagingKey && mannequinStaging.blocked,
        acceptedCloth: selectableCloth,
      })}
      operationsPanel={
        operationsPanel ?? (
          <div className='space-y-1 p-3' data-cad-zero-operation-current-operation='absent'>
            <p className='text-micro font-bold uppercase'>No current operation</p>
            <p className='text-micro text-labelColor'>
              Connect two exact edges on the table to create the first Assembly Order draft.
            </p>
          </div>
        )
      }
    />
  );
}

/** Production subscription shell; the host never reads or writes the operation form itself. */
export function PatternImportDxfPhaseECadTableZeroOperationProductionMountV1({
  techCardId,
  physicalHost,
  zeroConnectAuthoringHandoff,
  disabled = false,
  selection,
  operationsPanel,
  defaultOperationsMode,
  sourceSurface,
}: Readonly<{
  techCardId?: number;
  physicalHost?: CadWorkbenchPhysicalHostV1;
  zeroConnectAuthoringHandoff?: PatternImportDxfPhaseEZeroConnectAuthoringHandoffOwnerV1;
  disabled?: boolean;
  selection?: PatternImportDxfPhaseECadWorkbenchSelectionV1;
  operationsPanel?: ReactNode;
  defaultOperationsMode?: PatternImportDxfPhaseECadWorkbenchOperationsModeV1;
  sourceSurface?: 'explicit-native-drawn-sewing';
}>) {
  const subscribe = useCallback(
    (listener: () => void) => subscribePatternImportDxfPhaseECardSessionV1(techCardId, listener),
    [techCardId],
  );
  const read = useCallback(() => readPatternImportDxfPhaseECardSessionV1(techCardId), [techCardId]);
  const cardSession = useSyncExternalStore(subscribe, read, read);
  const savedCard = useTechCard(techCardId);
  const orderSizeIds = useSizeOrdering();
  const sizeNameById = useSizeNames();
  const savedAuthority = useMemo(
    () =>
      createPatternImportDxfPhaseEZeroOperationSavedCardAuthorityV1({
        orderSizeIds,
        sizeNameById,
      }),
    [orderSizeIds, sizeNameById],
  );

  return (
    <PatternImportDxfPhaseECadTableZeroOperationHostV1
      techCardId={techCardId}
      cardSession={cardSession}
      zeroConnectAuthoringHandoff={zeroConnectAuthoringHandoff}
      disabled={disabled}
      savedCard={savedCard.data ?? null}
      orderSizeIds={orderSizeIds}
      sizeNameById={sizeNameById}
      savedAuthority={savedAuthority}
      selection={selection}
      operationsPanel={operationsPanel}
      acceptedCloth={physicalHost?.acceptedCloth}
      defaultOperationsMode={defaultOperationsMode}
      sourceSurface={sourceSurface}
      mannequin={({ sources, activeScopeKey, stagingBlocked, acceptedCloth }) => (
        <div className='flex h-full min-h-0 flex-col'>
          {physicalHost?.panel ? <div className='shrink-0'>{physicalHost.panel}</div> : null}
          <div className='min-h-0 flex-1'>
            <PatternImportDxfPhaseECadMannequinModelPickerV1
              disabled={disabled}
              onDisplayedBodyInputV1={physicalHost?.onDisplayedBodyInputV1}
              acceptedCloth={acceptedCloth}
              onSaveMannequinArrangement={physicalHost?.onSaveMannequinArrangement}
              onReadMannequinArrangement={physicalHost?.onReadMannequinArrangement}
              onReadSavedMannequinModelId={physicalHost?.onReadSavedMannequinModelId}
              arrangementSourceKey={physicalHost?.arrangementSourceKey}
              patternPieceScene={{
                sources,
                activeScopeKey,
                sceneOverlay:
                  PATTERN_IMPORT_DXF_PHASE_E_CAD_MANNEQUIN_PRODUCTION_SCENE_OVERLAY_BLOCKED_V1,
              }}
            />
          </div>
          {stagingBlocked ? (
            <details
              className='shrink-0 border-t border-hairline px-2 py-1'
              data-cad-mannequin-pattern-status='partial'
            >
              <summary className='cursor-pointer text-micro text-labelColor'>
                Pattern display status · active set only
              </summary>
              <Text component='p' size='micro' variant='label' className='pt-1'>
                Some saved pattern sets could not be opened. The active set remains available.
              </Text>
            </details>
          ) : null}
        </div>
      )}
    />
  );
}
