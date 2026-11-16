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
import type { PatternImportDxfPhaseEZeroConnectAuthoringHandoffOwnerV1 } from './cad-table-zero-connect-authoring-handoff-v1';
import { PatternImportDxfPhaseECadTableZeroConnectCanvasV1 } from './cad-table-zero-connect-canvas-v1';
import {
  listPatternImportDxfPhaseECadTableZeroOperationFreshChoicesV1,
  preparePatternImportDxfPhaseECadTableZeroOperationFreshV1,
  type PatternImportDxfPhaseECadTableZeroOperationFreshPreparationResultV1,
} from './cad-table-zero-operation-fresh-preparation-v1';
import {
  listPatternImportDxfPhaseECadTableZeroOperationSavedChoicesV1,
  preparePatternImportDxfPhaseECadTableZeroOperationSavedV1,
  type PatternImportDxfPhaseECadTableZeroOperationSavedPreparationResultV1,
} from './cad-table-zero-operation-saved-preparation-v1';
import { preparePatternImportDxfPhaseECadMannequinAllScopeStagingV1 } from './cad-mannequin-all-scope-staging-v1';
import type { PatternImportDxfPhaseECadMannequinDxfStagingSourceV1 } from './cad-mannequin-dxf-staging-v1';
import {
  PATTERN_IMPORT_DXF_PHASE_E_CAD_MANNEQUIN_PRODUCTION_SCENE_OVERLAY_BLOCKED_V1,
  PatternImportDxfPhaseECadMannequinModelPickerV1,
} from './cad-workbench-mannequin-model-picker-v1';
import { PatternImportDxfPhaseECadWorkbenchSplitShellV1 } from './cad-workbench-split-shell-v1';
import {
  createPatternImportDxfPhaseEZeroOperationSavedCardAuthorityV1,
  type PatternImportDxfPhaseEZeroOperationSavedCardAuthorityRuntimeV1,
} from './zero-operation-saved-card-authority-v1';

export const PATTERN_IMPORT_DXF_PHASE_E_CAD_TABLE_ZERO_OPERATION_PRODUCTION_MOUNT_V1 =
  'pattern-import-dxf-phase-e-cad-table-zero-operation-production-mount/1' as const;

export const PATTERN_IMPORT_DXF_PHASE_E_CAD_TABLE_ZERO_OPERATION_PRODUCTION_MOUNT_CLAIMS_V1 =
  Object.freeze({
    operationsLengthMustBeZero: true,
    freshCardSessionRequired: false,
    operationIndependentSavedCardBootstrap: true,
    savedCardRowReadBeforeAndAfterReprocess: true,
    savedCardByteLengthAndShaVerified: true,
    explicitReplayScopeAndSizeUsed: true,
    exactCatalogAndProjectionOnly: true,
    selectedOperationRequired: false,
    selectedSeamRequired: false,
    proposalCreated: false,
    authoringOperationIdCreated: false,
    existingOperationsFieldWriterOnly: true,
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

type PreparationResult =
  | PatternImportDxfPhaseECadTableZeroOperationFreshPreparationResultV1
  | PatternImportDxfPhaseECadTableZeroOperationSavedPreparationResultV1;

type PreparationState =
  | Readonly<{ status: 'idle'; key: string; result: null }>
  | Readonly<{ status: 'loading'; key: string; result: null }>
  | Readonly<{
      status: 'settled';
      key: string;
      result: PreparationResult;
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
  savedOnly = false,
  savedCard = null,
  orderSizeIds = IDENTITY_SIZE_ORDER,
  sizeNameById = EMPTY_SIZE_NAMES,
  savedAuthority = null,
}: Readonly<{
  cardSession: PatternImportDxfPhaseECardSessionV1 | null;
  zeroConnectAuthoringHandoff?: PatternImportDxfPhaseEZeroConnectAuthoringHandoffOwnerV1;
  mannequin: (context: PatternImportDxfPhaseECadTableZeroOperationMannequinContextV1) => ReactNode;
  disabled?: boolean;
  savedOnly?: boolean;
  savedCard?: common_TechCard | null;
  orderSizeIds?: (ids: number[]) => number[];
  sizeNameById?: ReadonlyMap<number, string>;
  savedAuthority?: PatternImportDxfPhaseEZeroOperationSavedCardAuthorityRuntimeV1 | null;
}>) {
  const generation = cardSession?.importGeneration ?? 0;
  const choices = useMemo(
    () =>
      cardSession
        ? listPatternImportDxfPhaseECadTableZeroOperationFreshChoicesV1(cardSession, generation)
        : savedOnly
          ? listPatternImportDxfPhaseECadTableZeroOperationSavedChoicesV1(
              savedCard,
              orderSizeIds,
              sizeNameById,
            )
          : listPatternImportDxfPhaseECadTableZeroOperationFreshChoicesV1(null, generation),
    [cardSession, generation, orderSizeIds, savedCard, savedOnly, sizeNameById],
  );
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
  const preparationKey = cardSession
    ? `fresh:${cardSession.techCardId}:${generation}:${scopeKey}:${sizeToken}`
    : `saved:${savedCard?.id ?? 0}:${savedCard?.lockVersion ?? -1}:${scopeKey}:${sizeToken}`;
  const [preparation, setPreparation] = useState<PreparationState>(() => ({
    status: 'idle',
    key: '',
    result: null,
  }));

  useEffect(() => {
    if (!choices.ok || !scopeKey || !sizeToken) {
      setPreparation({ status: 'idle', key: preparationKey, result: null });
      return;
    }
    if (!cardSession && (!savedOnly || !savedAuthority)) {
      setPreparation({ status: 'idle', key: preparationKey, result: null });
      return;
    }
    let current = true;
    const controller = new AbortController();
    setPreparation({ status: 'loading', key: preparationKey, result: null });
    const next = cardSession
      ? preparePatternImportDxfPhaseECadTableZeroOperationFreshV1({
          cardSession,
          expectedImportGeneration: generation,
          scopeKey,
          sizeToken,
        })
      : preparePatternImportDxfPhaseECadTableZeroOperationSavedV1(
          {
            techCard: savedCard,
            orderSizeIds,
            sizeNameById,
            scopeKey,
            sizeToken,
            authority: savedAuthority!,
          },
          controller.signal,
        );
    void next.then((result) => {
      if (current) setPreparation({ status: 'settled', key: preparationKey, result });
    });
    return () => {
      current = false;
      controller.abort();
    };
  }, [
    cardSession,
    choices.ok,
    generation,
    orderSizeIds,
    preparationKey,
    savedAuthority,
    savedCard,
    savedOnly,
    scopeKey,
    sizeNameById,
    sizeToken,
  ]);

  const currentPreparation = preparation.key === preparationKey ? preparation : null;
  const prepared =
    currentPreparation?.status === 'settled' && currentPreparation.result?.ok
      ? (currentPreparation.result as Prepared)
      : null;
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
    ? cardSession
      ? `fresh:${cardSession.techCardId}:${generation}:${currentMannequinSource.scopeKey}:${sizeToken}`
      : `saved:${savedCard?.id ?? 0}:${savedCard?.lockVersion ?? -1}:${currentMannequinSource.scopeKey}:${sizeToken}`
    : '';
  const [mannequinStaging, setMannequinStaging] = useState<MannequinStagingState | null>(null);
  useEffect(() => {
    if (!choices.ok || !currentMannequinSource || !mannequinStagingKey) {
      setMannequinStaging(null);
      return;
    }
    let current = true;
    const controller = new AbortController();
    if (cardSession) {
      void preparePatternImportDxfPhaseECadMannequinAllScopeStagingV1({
        draft: cardSession.draft,
        techCardId: cardSession.techCardId,
        expectedImportGeneration: generation,
        currentImportGeneration: cardSession.importGeneration,
        scopes: choices.choices.map(({ scopeKey: candidate, label }) => ({
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
    } else if (savedOnly && savedCard && savedAuthority) {
      void (async () => {
        const sources: PatternImportDxfPhaseECadMannequinDxfStagingSourceV1[] = [
          currentMannequinSource,
        ];
        let blocked = false;
        for (const choice of choices.choices) {
          if (!current || choice.scopeKey === currentMannequinSource.scopeKey) continue;
          const saved = await preparePatternImportDxfPhaseECadTableZeroOperationSavedV1(
            {
              techCard: savedCard,
              orderSizeIds,
              sizeNameById,
              scopeKey: choice.scopeKey,
              sizeToken,
              authority: savedAuthority,
            },
            controller.signal,
          );
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
    savedCard,
    savedOnly,
    sizeNameById,
    sizeToken,
  ]);
  const mannequinSources = currentMannequinSource
    ? mannequinStaging?.key === mannequinStagingKey
      ? mannequinStaging.sources
      : Object.freeze([currentMannequinSource])
    : Object.freeze([]);

  return (
    <PatternImportDxfPhaseECadWorkbenchSplitShellV1
      selection={{ operationNumber: null }}
      defaultOperationsMode='collapsed'
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
              zeroConnectAuthoringHandoff={zeroConnectAuthoringHandoff}
              disabled={disabled}
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
        <div className='space-y-1 p-3' data-cad-zero-operation-current-operation='absent'>
          <p className='text-micro font-bold uppercase'>No current operation</p>
          <p className='text-micro text-labelColor'>
            Connect two exact edges on the table to create the first Assembly Order draft.
          </p>
        </div>
      }
    />
  );
}

/** Production subscription shell; the host never reads or writes the operation form itself. */
export function PatternImportDxfPhaseECadTableZeroOperationProductionMountV1({
  techCardId,
  zeroConnectAuthoringHandoff,
  disabled = false,
  savedOnly = false,
}: Readonly<{
  techCardId?: number;
  zeroConnectAuthoringHandoff?: PatternImportDxfPhaseEZeroConnectAuthoringHandoffOwnerV1;
  disabled?: boolean;
  savedOnly?: boolean;
}>) {
  const subscribe = useCallback(
    (listener: () => void) => subscribePatternImportDxfPhaseECardSessionV1(techCardId, listener),
    [techCardId],
  );
  const read = useCallback(() => readPatternImportDxfPhaseECardSessionV1(techCardId), [techCardId]);
  const cardSession = useSyncExternalStore(subscribe, read, read);
  const savedCard = useTechCard(savedOnly ? techCardId : undefined);
  const orderSizeIds = useSizeOrdering();
  const sizeNameById = useSizeNames();
  const savedAuthority = useMemo(
    () =>
      savedOnly
        ? createPatternImportDxfPhaseEZeroOperationSavedCardAuthorityV1({
            orderSizeIds,
            sizeNameById,
          })
        : null,
    [orderSizeIds, savedOnly, sizeNameById],
  );

  return (
    <PatternImportDxfPhaseECadTableZeroOperationHostV1
      cardSession={cardSession}
      zeroConnectAuthoringHandoff={zeroConnectAuthoringHandoff}
      disabled={disabled}
      savedOnly={savedOnly}
      savedCard={savedCard.data ?? null}
      orderSizeIds={orderSizeIds}
      sizeNameById={sizeNameById}
      savedAuthority={savedAuthority}
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
