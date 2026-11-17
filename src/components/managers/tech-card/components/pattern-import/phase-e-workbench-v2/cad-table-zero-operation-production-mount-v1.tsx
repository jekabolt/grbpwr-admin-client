import type { common_TechCard } from 'api/proto-http/admin';
import {
  useSizeNames,
  useSizeOrdering,
} from 'components/managers/model/components/use-size-systems';
import { useTechCard } from 'components/managers/tech-cards/components/useTechCardQuery';
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import { CalloutBox, Select } from 'ui';

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
import { PatternImportDxfPhaseECadTableZeroConnectCanvasV1 } from './cad-table-zero-connect-canvas-v1';
import {
  bindPatternImportDxfPhaseECadTableZeroOperationFreshToSavedAuthorityV1,
  capturePatternImportDxfPhaseECadTableZeroOperationSavedRebindExpectationV1,
  verifyPatternImportDxfPhaseECadTableZeroOperationSavedAuthorityRefreshV1,
  type PatternImportDxfPhaseECadTableZeroOperationAuthorityRebindExpectationV1,
} from './cad-table-zero-operation-authority-rebind-v1';
import {
  listPatternImportDxfPhaseECadTableZeroOperationFreshChoicesV1,
  preparePatternImportDxfPhaseECadTableZeroOperationFreshV1,
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
  type PatternImportDxfPhaseECadTableZeroOperationSavedPreparationResultV1,
} from './cad-table-zero-operation-saved-preparation-v1';
import { isPatternImportDxfPhaseEZeroConnectPreparedAuthorityV1 } from './cad-table-zero-connect-phase-e-authority-v1';
import { routePatternImportDxfPhaseECadTableZeroOperationSourceV1 } from './cad-table-zero-operation-source-routing-v1';
import { preparePatternImportDxfPhaseECadMannequinAllScopeStagingV1 } from './cad-mannequin-all-scope-staging-v1';
import type { PatternImportDxfPhaseECadMannequinDxfStagingSourceV1 } from './cad-mannequin-dxf-staging-v1';
import {
  PATTERN_IMPORT_DXF_PHASE_E_CAD_MANNEQUIN_PRODUCTION_SCENE_OVERLAY_BLOCKED_V1,
  PatternImportDxfPhaseECadMannequinModelPickerV1,
} from './cad-workbench-mannequin-model-picker-v1';
import {
  PatternImportDxfPhaseECadWorkbenchSplitShellV1,
  type PatternImportDxfPhaseECadWorkbenchOperationsModeV1,
  type PatternImportDxfPhaseECadWorkbenchSelectionV1,
} from './cad-workbench-split-shell-v1';
import {
  createPatternImportDxfPhaseEZeroOperationSavedCardAuthorityV1,
  type PatternImportDxfPhaseEZeroOperationSavedCardAuthorityRuntimeV1,
} from './zero-operation-saved-card-authority-v1';

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
    exactCatalogAndProjectionOnly: true,
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
}>;

type SavedFailoverResult = Readonly<{
  result: PatternImportDxfPhaseECadTableZeroOperationSavedPreparationResultV1;
  resolvedSavedCard: common_TechCard;
  authoringPrepared: SavedPrepared | null;
  rebindExpectation: PatternImportDxfPhaseECadTableZeroOperationAuthorityRebindExpectationV1 | null;
  resolvedSource: 'saved';
}>;

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
    async refresh(signal: AbortSignal) {
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
        const latest = await savedAuthority.resolveLatestCard(selector, signal);
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
          },
          signal,
        );
        if (!isCurrent(attempt, generationTicket, signal))
          return failed('The saved DXF authoring authority refresh was cancelled or superseded.');
        if (!refreshed.ok) return failed(refreshed.blocker.detail);
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
 * Recovers from a fresh-session race only when the current saved card exposes the exact same
 * scope/size choice. The saved preparation remains the source rendered by the canvas and staged
 * beside the mannequin; the stale fresh blocker is never returned after failover was attempted.
 */
export async function preparePatternImportDxfPhaseECadTableZeroOperationSavedFailoverV1(input: {
  fresh: PatternImportDxfPhaseECadTableZeroOperationFreshPreparationResultV1;
  expectedCommit: Readonly<{ techCardId: number; previousLockVersion: number }>;
  savedAuthority: PatternImportDxfPhaseEZeroOperationSavedCardAuthorityRuntimeV1 | null;
  orderSizeIds: (ids: number[]) => number[];
  sizeNameById: ReadonlyMap<number, string>;
  scopeKey: string;
  sizeToken: string;
  generation: PatternImportDxfPhaseECadTableZeroOperationGenerationTicketV1;
  signal: AbortSignal;
  prepareSaved?: typeof preparePatternImportDxfPhaseECadTableZeroOperationSavedV1;
}): Promise<SavedFailoverResult | null> {
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
  return Object.freeze({
    result: saved,
    resolvedSavedCard: latestSavedCard,
    authoringPrepared: saved.ok ? saved : null,
    rebindExpectation: saved.ok
      ? capturePatternImportDxfPhaseECadTableZeroOperationSavedRebindExpectationV1(saved)
      : null,
    resolvedSource: 'saved' as const,
  });
}

/** Applies the Host's fail-closed fresh/saved decision only after the independent saved read. */
export function resolvePatternImportDxfPhaseECadTableZeroOperationAfterFreshV1(
  fresh: PatternImportDxfPhaseECadTableZeroOperationFreshPreparationResultV1,
  latestSaved: SavedFailoverResult | null,
) {
  if (!latestSaved)
    return Object.freeze({
      result: fresh,
      authoringPrepared: null,
      rebindExpectation: null,
      resolvedSource: 'fresh' as const,
      resolvedSavedCard: null,
    });
  if (!fresh.ok) return latestSaved;
  if (!latestSaved.result.ok)
    return Object.freeze({
      result: fresh,
      authoringPrepared: null,
      rebindExpectation: null,
      resolvedSource: 'fresh' as const,
      resolvedSavedCard: latestSaved.resolvedSavedCard,
    });
  const rebound = bindPatternImportDxfPhaseECadTableZeroOperationFreshToSavedAuthorityV1(
    fresh,
    latestSaved.result,
  );
  return Object.freeze({
    result: fresh,
    authoringPrepared: rebound.ok ? latestSaved.result : null,
    rebindExpectation: rebound.ok ? rebound.expectation : null,
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
  defaultOperationsMode = 'collapsed',
}: Readonly<{
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
  defaultOperationsMode?: PatternImportDxfPhaseECadWorkbenchOperationsModeV1;
}>) {
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
  const sourceRoute = useMemo(
    () => routePatternImportDxfPhaseECadTableZeroOperationSourceV1(freshChoices, savedChoices),
    [freshChoices, savedChoices],
  );
  const { choices } = sourceRoute;
  const useFreshSession = sourceRoute.mode === 'fresh';
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
  const preparationKey =
    useFreshSession && cardSession
      ? `fresh:${cardSession.techCardId}:${generation}:${scopeKey}:${sizeToken}`
      : `saved:${savedCard?.id ?? 0}:${savedCard?.lockVersion ?? -1}:${scopeKey}:${sizeToken}`;
  const [preparation, setPreparation] = useState<PreparationState>(() => ({
    status: 'idle',
    key: '',
    result: null,
    authoringPrepared: null,
    rebindExpectation: null,
    resolvedSource: null,
    resolvedSavedCard: null,
  }));
  const preparationGenerationOwner = useMemo(
    createPatternImportDxfPhaseECadTableZeroOperationGenerationOwnerV1,
    [],
  );
  useEffect(
    () => () => {
      preparationGenerationOwner.dispose();
    },
    [preparationGenerationOwner],
  );

  useEffect(() => {
    if (!choices.ok || !scopeKey || !sizeToken) {
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
    if (!useFreshSession && !savedAuthority) {
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
        return resolvePatternImportDxfPhaseECadTableZeroOperationAfterFreshV1(fresh, latestSaved);
      }
      const saved = await preparePatternImportDxfPhaseECadTableZeroOperationSavedV1(
        {
          techCard: savedCard,
          orderSizeIds,
          sizeNameById,
          scopeKey,
          sizeToken,
          authority: savedAuthority!,
          generation: generationTicket,
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
        resolvedSavedCard: savedCard,
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
    };
  }, [
    cardSession,
    choices.ok,
    generation,
    orderSizeIds,
    preparationGenerationOwner,
    preparationKey,
    savedAuthority,
    savedCard,
    scopeKey,
    sizeNameById,
    sizeToken,
    useFreshSession,
  ]);

  const currentPreparation = preparation.key === preparationKey ? preparation : null;
  const prepared =
    currentPreparation?.status === 'settled' && currentPreparation.result?.ok
      ? (currentPreparation.result as Prepared)
      : null;
  const resolvedSource = currentPreparation?.resolvedSource ?? null;
  const resolvedSavedCard = currentPreparation?.resolvedSavedCard ?? savedCard;
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
  const authoringAuthorityRefresh = useMemo(
    () =>
      createPatternImportDxfPhaseECadTableZeroOperationAuthoringRefreshV1({
        prepared: authoringPrepared,
        expectation: rebindExpectation,
        savedAuthority,
        preparationKey,
        orderSizeIds,
        sizeNameById,
      }),
    [
      authoringPrepared,
      orderSizeIds,
      preparationKey,
      rebindExpectation,
      savedAuthority,
      sizeNameById,
    ],
  );
  const authoringReady =
    isPatternImportDxfPhaseECadTableZeroOperationAuthoringReadyV1(
      authoringPrepared,
      rebindExpectation,
    ) && authoringAuthorityRefresh !== null;
  const blocker = !choices.ok
    ? choices.blocker
    : currentPreparation?.status === 'settled' && currentPreparation.result?.ok === false
      ? currentPreparation.result.blocker
      : null;

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
  const mannequinStagingKey = currentMannequinSource
    ? resolvedSource === 'fresh' && cardSession
      ? `fresh:${cardSession.techCardId}:${generation}:${currentMannequinSource.scopeKey}:${sizeToken}`
      : `saved:${resolvedSavedCard?.id ?? 0}:${resolvedSavedCard?.lockVersion ?? -1}:${currentMannequinSource.scopeKey}:${sizeToken}`
    : '';
  const [mannequinStaging, setMannequinStaging] = useState<MannequinStagingState | null>(null);
  useEffect(() => {
    const resolvedChoices =
      resolvedSource === 'saved' && resolvedSavedChoices.ok ? resolvedSavedChoices : choices;
    if (!resolvedChoices.ok || !currentMannequinSource || !mannequinStagingKey) {
      setMannequinStaging(null);
      return;
    }
    let current = true;
    const controller = new AbortController();
    if (resolvedSource === 'fresh' && cardSession) {
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
      void (async () => {
        const sources: PatternImportDxfPhaseECadMannequinDxfStagingSourceV1[] = [
          currentMannequinSource,
        ];
        let blocked = false;
        for (const choice of resolvedChoices.choices) {
          if (!current || choice.scopeKey === currentMannequinSource.scopeKey) continue;
          const stagingGenerationOwner =
            createPatternImportDxfPhaseECadTableZeroOperationGenerationOwnerV1();
          const stagingGeneration = stagingGenerationOwner.beginSaved(
            `${mannequinStagingKey}:scope:${choice.scopeKey}`,
          );
          const saved = await preparePatternImportDxfPhaseECadTableZeroOperationSavedV1(
            {
              techCard: resolvedSavedCard,
              orderSizeIds,
              sizeNameById,
              scopeKey: choice.scopeKey,
              sizeToken,
              authority: savedAuthority,
              generation: stagingGeneration,
            },
            controller.signal,
          );
          stagingGenerationOwner.dispose();
          if (!saved.ok) {
            blocked = true;
            continue;
          }
          sources.push(
            Object.freeze({
              scopeKey: saved.scopeKey,
              label: choice.label,
              projection: saved.projection,
            }),
          );
        }
        if (!current) return;
        setMannequinStaging(
          Object.freeze({ key: mannequinStagingKey, sources: Object.freeze(sources), blocked }),
        );
      })();
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
    resolvedSource,
  ]);
  const mannequinSources = currentMannequinSource
    ? mannequinStaging?.key === mannequinStagingKey
      ? mannequinStaging.sources
      : Object.freeze([currentMannequinSource])
    : Object.freeze([]);

  return (
    <PatternImportDxfPhaseECadWorkbenchSplitShellV1
      selection={selection}
      defaultOperationsMode={defaultOperationsMode}
      desktop={
        <section
          data-cad-zero-operation-production-host-v1=''
          data-cad-zero-operation-selected-authority='absent'
          data-cad-zero-operation-proposal='absent'
          className='min-w-0 overflow-hidden border border-borderColor bg-bgColor'
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

          {blocker && (
            <div data-cad-zero-operation-blocker={blocker.code}>
              <CalloutBox tone='error' className='m-2 text-small'>
                <b>2D table unavailable.</b> {blocker.detail}
              </CalloutBox>
            </div>
          )}

          {prepared && (
            <PatternImportDxfPhaseECadTableZeroConnectCanvasV1
              catalog={prepared.catalog}
              projection={prepared.projection}
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
  zeroConnectAuthoringHandoff,
  disabled = false,
  selection,
  operationsPanel,
  defaultOperationsMode,
}: Readonly<{
  techCardId?: number;
  zeroConnectAuthoringHandoff?: PatternImportDxfPhaseEZeroConnectAuthoringHandoffOwnerV1;
  disabled?: boolean;
  selection?: PatternImportDxfPhaseECadWorkbenchSelectionV1;
  operationsPanel?: ReactNode;
  defaultOperationsMode?: PatternImportDxfPhaseECadWorkbenchOperationsModeV1;
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
      cardSession={cardSession}
      zeroConnectAuthoringHandoff={zeroConnectAuthoringHandoff}
      disabled={disabled}
      savedCard={savedCard.data ?? null}
      orderSizeIds={orderSizeIds}
      sizeNameById={sizeNameById}
      savedAuthority={savedAuthority}
      selection={selection}
      operationsPanel={operationsPanel}
      defaultOperationsMode={defaultOperationsMode}
      mannequin={({ sources, activeScopeKey }) => (
        <PatternImportDxfPhaseECadMannequinModelPickerV1
          disabled={disabled}
          patternPieceScene={{
            sources,
            activeScopeKey,
            sceneOverlay:
              PATTERN_IMPORT_DXF_PHASE_E_CAD_MANNEQUIN_PRODUCTION_SCENE_OVERLAY_BLOCKED_V1,
          }}
        />
      )}
    />
  );
}
