import type {
  createPatternImportDxfProductSidecarCardRuntimeV1,
  PatternImportDxfProductSidecarCardRuntimeOptionsV1,
} from 'lib/cloth/domain/pattern-import-dxf-product-semantic-sidecar-card-runtime-v1';
import type { selectPatternImportDxfProductDraftPhaseDSizeV1 } from 'lib/cloth/domain/pattern-import-dxf-product-draft-phase-d-selection-v1';
import type {
  PatternImportDxfProductPhaseEAuthoringCatalogResultV1,
  PatternImportDxfProductPhaseEAuthoringCatalogV1,
} from 'lib/cloth/domain/pattern-import-dxf-product-phase-e-authoring-catalog-v1';
import type { PatternImportDxfProductPhaseEAuthoringChoicesV1 } from 'lib/cloth/domain/pattern-import-dxf-product-phase-e-authoring-producer-v1';
import type { PatternImportDxfProductSidecarRetrySnapshotV1 } from 'lib/cloth/domain/pattern-import-dxf-product-semantic-sidecar-retry-owner-v1';
import type {
  createPatternImportDxfProductPhaseEAssemblyWorkbenchStateV1,
  PatternImportDxfProductPhaseEAssemblyProjectionV1,
  PatternImportDxfProductPhaseEAssemblyProposalV1,
  PatternImportDxfProductPhaseEAssemblyWorkbenchStateV1,
  PatternImportDxfProductPhaseEExistingAssemblyProposalInputV1,
  projectPatternImportDxfProductPhaseEAssemblyV1,
  proposePatternImportDxfProductPhaseEAssemblyV1,
} from 'lib/pattern-import/dxf-product-phase-e-assembly-workbench-v1';
import type { PatternImportDxfProductExpectedSavedRowV1 } from 'lib/cloth/domain/pattern-import-dxf-product-mapping-composition-v1';
import type { ApplyResult, CardDraft } from 'lib/pattern-import/types';
import { createPatternImportNativeSewingAuthoringViewV1 } from './native-sewing-authoring-view-v1';
import {
  derivePatternImportDxfPhaseEDocumentAuthorityV1,
  type PatternImportDxfPhaseEDocumentEvidenceV1,
} from './phase-e-workbench-document-authority-v1';

export const PATTERN_IMPORT_DXF_PRODUCT_SIDECAR_CARD_CONTROLLER_V1 =
  'pattern-import-dxf-product-sidecar-card-controller/1' as const;
export const PATTERN_IMPORT_DXF_PRODUCT_SIDECAR_CARD_CONTROLLER_SNAPSHOT_V1 =
  'pattern-import-dxf-product-sidecar-card-controller-snapshot/1' as const;

type BaseCardRuntime = ReturnType<typeof createPatternImportDxfProductSidecarCardRuntimeV1>;
type CardRuntime = BaseCardRuntime &
  Readonly<{
    /** Explicit lazy-runtime seam; absent runtimes fail closed instead of importing the selector. */
    selectAuthoringPhaseD?: (
      draft: CardDraft,
      scopeKey: string,
      sizeToken: string,
    ) => Promise<Awaited<ReturnType<typeof selectPatternImportDxfProductDraftPhaseDSizeV1>>>;
  }>;
type ConfirmedApply = Extract<ApplyResult, { ok: true }> & {
  commitReceipt: NonNullable<Extract<ApplyResult, { ok: true }>['commitReceipt']>;
};
type RuntimeAuthorChoicesResult = Awaited<ReturnType<CardRuntime['produceCompileAndAuthorPhaseE']>>;

export type PatternImportDxfProductSidecarCardRuntimeModuleV1 = Readonly<{
  PATTERN_IMPORT_DXF_PRODUCT_SIDECAR_CARD_RUNTIME_V1: PatternImportDxfProductSidecarCardRuntimeOptionsV1['schemaVersion'];
  createPatternImportDxfProductSidecarCardRuntimeV1: typeof createPatternImportDxfProductSidecarCardRuntimeV1;
}>;

export type PatternImportDxfProductPhaseEWorkbenchModuleV1 = Readonly<{
  proposePatternImportDxfProductPhaseEAssemblyV1: typeof proposePatternImportDxfProductPhaseEAssemblyV1;
  projectPatternImportDxfProductPhaseEAssemblyV1: typeof projectPatternImportDxfProductPhaseEAssemblyV1;
  createPatternImportDxfProductPhaseEAssemblyWorkbenchStateV1: typeof createPatternImportDxfProductPhaseEAssemblyWorkbenchStateV1;
}>;

export type PatternImportDxfProductPhaseEWorkbenchEntryRequestV1 = Readonly<{
  /** Explicit opt-in only. Omitted preserves the original import surface. */
  sourceSurface?: 'explicit-native-drawn-sewing';
  scopeKey: string;
  sizeToken: string;
  /** Monotonic identity of the confirmed import registration that opened this workbench. */
  importGeneration: number;
  /** Fresh authoritative saved-row evidence; never reconstructed from operation display data. */
  documentEvidence: PatternImportDxfPhaseEDocumentEvidenceV1;
  /** Selected by the existing Assembly Order view; never derived from a display index. */
  selectedOperationNumber: number;
  existingAssembly: PatternImportDxfProductPhaseEExistingAssemblyProposalInputV1;
}>;

export type PatternImportDxfProductPhaseEWorkbenchEntryResultV1 =
  | Readonly<{
      ok: true;
      stage: 'ready';
      catalog: PatternImportDxfProductPhaseEAuthoringCatalogV1;
      proposal: PatternImportDxfProductPhaseEAssemblyProposalV1;
      projection: PatternImportDxfProductPhaseEAssemblyProjectionV1;
      initialState: PatternImportDxfProductPhaseEAssemblyWorkbenchStateV1;
      blockers: readonly [];
    }>
  | Readonly<{
      ok: false;
      stage:
        | 'preflight'
        | 'phase-d-selection'
        | 'catalog'
        | 'proposal'
        | 'projection'
        | 'workbench-load';
      catalog: PatternImportDxfProductPhaseEAuthoringCatalogV1 | null;
      proposal: PatternImportDxfProductPhaseEAssemblyProposalV1 | null;
      projection: PatternImportDxfProductPhaseEAssemblyProjectionV1 | null;
      initialState: null;
      blockers: readonly Readonly<{ code: string; detail: string }>[];
    }>;

export type PatternImportDxfProductPhaseEAuthorChoicesResultV1 =
  | RuntimeAuthorChoicesResult
  | Readonly<{
      ok: false;
      stage: 'prepared-context';
      produce: null;
      compile: null;
      author: null;
      blockers: readonly [
        Readonly<{
          code: 'phase-e-prepared-context-unavailable' | 'phase-e-prepared-context-mismatch';
          detail: string;
        }>,
      ];
    }>;

export type PatternImportDxfProductSidecarCardControllerSnapshotV1 = Readonly<{
  schemaVersion: typeof PATTERN_IMPORT_DXF_PRODUCT_SIDECAR_CARD_CONTROLLER_SNAPSHOT_V1;
  techCardId: number | null;
  phase: 'idle' | 'loading' | 'ready' | 'failed' | 'disposed';
  attachmentSnapshots: readonly PatternImportDxfProductSidecarRetrySnapshotV1[];
  failureCode: 'runtime-load-failed' | null;
  runtimeChunkLoaded: boolean;
  explicitAuthorityAuthored: boolean;
  survivesPageReload: false;
  productCardChoiceCollectorConfigured: true;
  productionReady: false;
}>;

export type PatternImportDxfProductSidecarCardControllerOptionsV1 = Readonly<{
  schemaVersion: typeof PATTERN_IMPORT_DXF_PRODUCT_SIDECAR_CARD_CONTROLLER_V1;
  techCardId?: number;
  service: PatternImportDxfProductSidecarCardRuntimeOptionsV1['service'];
  loadRuntime?: () => Promise<PatternImportDxfProductSidecarCardRuntimeModuleV1>;
  loadWorkbench?: () => Promise<PatternImportDxfProductPhaseEWorkbenchModuleV1>;
  onAttachmentSnapshot?: (snapshot: PatternImportDxfProductSidecarRetrySnapshotV1) => void;
  crypto?: Pick<Crypto, 'subtle'>;
}>;

export const PATTERN_IMPORT_DXF_PRODUCT_SIDECAR_CARD_CONTROLLER_CONTRACT_V1 = Object.freeze({
  runtimeChunkLoadedBeforeExplicitAuthoring: false,
  postSaveWithoutAuthoredAuthorityLoadsRuntimeChunk: false,
  explicitWorkbenchEntryRequiresFreshPhaseDReplay: true,
  explicitWorkbenchProjectionRequiresFreshSelectionSeal: true,
  phaseDSelectorLivesOnlyInLazyRuntime: true,
  explicitWorkbenchEntryUsesExistingAssemblyReadOnly: true,
  explicitWorkbenchEntryStartsFromSelectedExistingOperation: true,
  exactTwoPieceOneEqualSeamV1: true,
  explicitNativeSewingSourceRequiresVerifiedReplay: true,
  originalImportAndNativeSewingCatalogsNeverCrossMapped: true,
  strictV1SeamDerivedOperationIdentityOwnedByWorkbench: true,
  stableServerOperationIdentityRequiredBeforeSubmit: false,
  operationNumberAcceptedAsImmutableAuthority: false,
  clientHistoryKeyAcceptedAsImmutableAuthority: false,
  documentIdAndRevisionRemainExplicitChoices: false,
  documentIdAndRevisionDeterministicallyPrefilled: true,
  documentIdAndRevisionStillRequireExplicitConfirmation: true,
  freehandDocumentRevisionAcceptedAsAuthority: false,
  lastPreparedProposalBindingRequiredBeforeSubmit: true,
  monotonicImportGenerationRequiredBeforeSubmit: true,
  preparedProposalFingerprintAndPiecePairBindingRequired: true,
  preparedProposalBoundToTechCard: true,
  preparedProposalContextConsumedOnSubmitAttempt: true,
  explicitChoiceProducerRequired: true,
  successfulSubmitRoute: 'runtime.produceCompileAndAuthorPhaseE',
  refusedChoicesPersistAuthority: false,
  cardRowsUsedAsAssemblyAuthority: false,
  confirmedSaveRequiredBeforeAttachment: true,
  authoredAuthorityBoundToExactConfirmedCommit: true,
  exactCommitBindingRequiredBeforeAttachment: true,
  differentConfirmedCommitInvalidatesAuthoredAuthority: true,
  confirmedCommitIdentityIncludesUploadedSha256: true,
  attachmentFailureChangesApplyResult: false,
  retryStateOwnedForCardLifetime: true,
  survivesPageReload: false,
  productCardChoiceCollectorConfigured: true,
  productionReady: false,
} as const);

const NOT_REQUESTED = Object.freeze({
  status: 'not-requested' as const,
  key: null,
  snapshot: null,
  attempt: null,
  blocker: null,
});

const defaultLoadRuntime = async (): Promise<PatternImportDxfProductSidecarCardRuntimeModuleV1> => {
  const [runtimeModule, selectionModule] = await Promise.all([
    import('lib/cloth/domain/pattern-import-dxf-product-semantic-sidecar-card-runtime-v1'),
    import('lib/cloth/domain/pattern-import-dxf-product-draft-phase-d-selection-v1'),
  ]);
  return Object.freeze({
    PATTERN_IMPORT_DXF_PRODUCT_SIDECAR_CARD_RUNTIME_V1:
      runtimeModule.PATTERN_IMPORT_DXF_PRODUCT_SIDECAR_CARD_RUNTIME_V1,
    createPatternImportDxfProductSidecarCardRuntimeV1: (
      runtimeOptions: Parameters<typeof createPatternImportDxfProductSidecarCardRuntimeV1>[0],
    ) => {
      const created =
        runtimeModule.createPatternImportDxfProductSidecarCardRuntimeV1(runtimeOptions);
      return Object.freeze({
        ...created,
        selectAuthoringPhaseD: (draft: CardDraft, scopeKey: string, sizeToken: string) =>
          selectionModule.selectPatternImportDxfProductDraftPhaseDSizeV1(
            draft,
            scopeKey,
            sizeToken,
            runtimeOptions.crypto,
          ),
      });
    },
  });
};
const defaultLoadWorkbench = () =>
  import('lib/pattern-import/dxf-product-phase-e-assembly-workbench-v1');

function preparedContextBlocked(
  code: Extract<
    PatternImportDxfProductPhaseEAuthorChoicesResultV1,
    { stage: 'prepared-context' }
  >['blockers'][0]['code'],
  detail: string,
): PatternImportDxfProductPhaseEAuthorChoicesResultV1 {
  return Object.freeze({
    ok: false as const,
    stage: 'prepared-context' as const,
    produce: null,
    compile: null,
    author: null,
    blockers: Object.freeze([Object.freeze({ code, detail })]) as readonly [
      Readonly<{ code: typeof code; detail: string }>,
    ],
  });
}

function entryBlocked(
  stage: Extract<PatternImportDxfProductPhaseEWorkbenchEntryResultV1, { ok: false }>['stage'],
  code: string,
  detail: string,
  catalog: PatternImportDxfProductPhaseEAuthoringCatalogV1 | null = null,
  proposal: PatternImportDxfProductPhaseEAssemblyProposalV1 | null = null,
  projection: PatternImportDxfProductPhaseEAssemblyProjectionV1 | null = null,
): PatternImportDxfProductPhaseEWorkbenchEntryResultV1 {
  return Object.freeze({
    ok: false as const,
    stage,
    catalog,
    proposal,
    projection,
    initialState: null,
    blockers: Object.freeze([Object.freeze({ code, detail })]),
  });
}

function attachmentKey(snapshot: PatternImportDxfProductSidecarRetrySnapshotV1): string {
  return `${snapshot.techCardId}:${snapshot.scopeKey}:${snapshot.patternLineKey.toUpperCase()}`;
}

const SHA256 = /^[0-9a-f]{64}$/i;

function confirmedCommitIdentityOf(draft: CardDraft, apply: ConfirmedApply): string | null {
  const receipt = apply?.commitReceipt;
  if (
    apply?.ok !== true ||
    !receipt ||
    receipt.schemaVersion !== 'pattern-import-apply-commit-receipt/1' ||
    receipt.techCardId !== draft.techCardId ||
    !Number.isSafeInteger(receipt.previousLockVersion) ||
    receipt.previousLockVersion < 0 ||
    !Array.isArray(receipt.scopes) ||
    !receipt.scopes.length ||
    !Array.isArray(apply.uploaded)
  )
    return null;
  const scopes = receipt.scopes
    .map((scope) => {
      if (
        !scope.scopeKey ||
        !scope.patternLineKey ||
        !scope.patternUrl ||
        !Number.isSafeInteger(scope.patternSizeId) ||
        scope.patternSizeId < 0 ||
        !Array.isArray(scope.pieceLineKeys) ||
        !scope.pieceLineKeys.length ||
        scope.pieceLineKeys.some((pieceLineKey) => !pieceLineKey) ||
        !Array.isArray(scope.aliases) ||
        !scope.aliases.length ||
        scope.aliases.some(
          (alias) => alias.scopeKey !== scope.scopeKey || !alias.blockName || !alias.pieceLineKey,
        )
      )
        return null;
      const uploaded = apply.uploaded.filter(
        (row) =>
          row.scopeKey === scope.scopeKey &&
          row.url === scope.patternUrl &&
          typeof row.sha256 === 'string' &&
          SHA256.test(row.sha256),
      );
      if (uploaded.length !== 1) return null;
      return {
        scopeKey: scope.scopeKey,
        patternLineKey: scope.patternLineKey,
        patternUrl: scope.patternUrl,
        patternSizeId: scope.patternSizeId,
        uploadedSha256: uploaded[0].sha256?.toLowerCase(),
        pieceLineKeys: [...scope.pieceLineKeys].sort(),
        aliases: scope.aliases
          .map(({ scopeKey, blockName, pieceLineKey }) => ({ scopeKey, blockName, pieceLineKey }))
          .sort((left, right) =>
            `${left.scopeKey}\u0000${left.blockName}\u0000${left.pieceLineKey}`.localeCompare(
              `${right.scopeKey}\u0000${right.blockName}\u0000${right.pieceLineKey}`,
            ),
          ),
      };
    })
    .sort((left, right) =>
      `${left?.scopeKey ?? ''}\u0000${left?.patternLineKey ?? ''}\u0000${left?.patternUrl ?? ''}`.localeCompare(
        `${right?.scopeKey ?? ''}\u0000${right?.patternLineKey ?? ''}\u0000${right?.patternUrl ?? ''}`,
      ),
    );
  if (scopes.some((scope) => scope === null)) return null;
  if (new Set(scopes.map((scope) => scope?.scopeKey)).size !== scopes.length) return null;
  return JSON.stringify({
    techCardId: receipt.techCardId,
    previousLockVersion: receipt.previousLockVersion,
    scopes,
  });
}

function confirmedCommitBlocked(
  code:
    | 'confirmed-commit-identity-unavailable'
    | 'phase-e-authority-not-bound-to-confirmed-commit'
    | 'phase-e-authority-invalidated-by-new-commit',
  detail: string,
) {
  return Object.freeze({
    status: 'blocked' as const,
    key: null,
    snapshot: null,
    attempt: null,
    blocker: Object.freeze({ code, detail }),
  });
}

/**
 * Card-lifetime lazy owner. It keeps the heavy cloth/sidecar chain out of the initial card chunk
 * and does not even load it for a normal DXF save unless explicit Phase-E authoring was started.
 */
export function createPatternImportDxfProductSidecarCardControllerV1(
  options: PatternImportDxfProductSidecarCardControllerOptionsV1,
) {
  if (
    !options ||
    options.schemaVersion !== PATTERN_IMPORT_DXF_PRODUCT_SIDECAR_CARD_CONTROLLER_V1 ||
    !options.service
  )
    throw new TypeError('Exact product sidecar card-controller options are required.');
  if (
    options.techCardId !== undefined &&
    (!Number.isSafeInteger(options.techCardId) || options.techCardId <= 0)
  )
    throw new TypeError('The product sidecar card-controller tech-card identity is invalid.');
  const techCardId = options.techCardId ?? null;

  const listeners = new Set<() => void>();
  const attachmentSnapshots = new Map<string, PatternImportDxfProductSidecarRetrySnapshotV1>();
  let runtime: CardRuntime | null = null;
  let runtimePromise: Promise<CardRuntime> | null = null;
  let workbench: PatternImportDxfProductPhaseEWorkbenchModuleV1 | null = null;
  let workbenchPromise: Promise<PatternImportDxfProductPhaseEWorkbenchModuleV1> | null = null;
  type AuthoringContext = Readonly<{
    techCardId: number;
    importGeneration: number;
    catalogCanonicalSha256: string;
    sizeSelectionCanonicalSha256: string;
    proposalFingerprint: string;
    pieceBindings: readonly [string, string];
    operationId: string;
    operationOrder: number;
    seamId: string;
    documentId: string;
    revision: string;
    sourceSurface: 'default-import' | 'explicit-native-drawn-sewing';
  }>;
  let preparedAuthoringContext: AuthoringContext | null = null;
  let authoredContext: AuthoringContext | null = null;
  let disposed = false;
  let authored = false;
  let authoredCommitIdentity: string | null = null;
  let snapshot: PatternImportDxfProductSidecarCardControllerSnapshotV1 = Object.freeze({
    schemaVersion: PATTERN_IMPORT_DXF_PRODUCT_SIDECAR_CARD_CONTROLLER_SNAPSHOT_V1,
    techCardId,
    phase: 'idle' as const,
    attachmentSnapshots: Object.freeze([]),
    failureCode: null,
    runtimeChunkLoaded: false,
    explicitAuthorityAuthored: false,
    survivesPageReload: false as const,
    productCardChoiceCollectorConfigured: true as const,
    productionReady: false as const,
  });

  const publish = (
    phase: PatternImportDxfProductSidecarCardControllerSnapshotV1['phase'],
    failureCode: PatternImportDxfProductSidecarCardControllerSnapshotV1['failureCode'] = null,
  ) => {
    if (disposed && phase !== 'disposed') return;
    snapshot = Object.freeze({
      schemaVersion: PATTERN_IMPORT_DXF_PRODUCT_SIDECAR_CARD_CONTROLLER_SNAPSHOT_V1,
      techCardId,
      phase,
      attachmentSnapshots: Object.freeze([...attachmentSnapshots.values()]),
      failureCode,
      runtimeChunkLoaded: runtime !== null,
      explicitAuthorityAuthored: authored,
      survivesPageReload: false as const,
      productCardChoiceCollectorConfigured: true as const,
      productionReady: false as const,
    });
    for (const listener of listeners) {
      try {
        listener();
      } catch {
        // Rendering is not persistence authority and cannot change controller state.
      }
    }
  };

  const onAttachmentSnapshot = (value: PatternImportDxfProductSidecarRetrySnapshotV1) => {
    if (disposed) return;
    attachmentSnapshots.set(attachmentKey(value), value);
    publish('ready');
    try {
      options.onAttachmentSnapshot?.(value);
    } catch {
      // External observability is fail-open just like the underlying post-save host callback.
    }
  };

  const ensureRuntime = async (): Promise<CardRuntime> => {
    if (disposed) throw new Error('The product sidecar card controller is disposed.');
    if (runtime) return runtime;
    if (runtimePromise) return runtimePromise;
    publish('loading');
    const loader = options.loadRuntime ?? defaultLoadRuntime;
    const pending = loader()
      .then((module) => {
        if (
          !module ||
          typeof module.createPatternImportDxfProductSidecarCardRuntimeV1 !== 'function'
        )
          throw new TypeError('The product sidecar runtime module is invalid.');
        const created = module.createPatternImportDxfProductSidecarCardRuntimeV1({
          schemaVersion: module.PATTERN_IMPORT_DXF_PRODUCT_SIDECAR_CARD_RUNTIME_V1,
          service: options.service,
          onSnapshot: onAttachmentSnapshot,
          crypto: options.crypto,
        });
        if (disposed) {
          created.dispose();
          throw new Error('The product sidecar card controller is disposed.');
        }
        runtime = created;
        publish('ready');
        return created;
      })
      .catch((error: unknown) => {
        runtimePromise = null;
        if (!disposed) publish('failed', 'runtime-load-failed');
        throw error;
      });
    runtimePromise = pending;
    return pending;
  };

  const ensureWorkbench = async (): Promise<PatternImportDxfProductPhaseEWorkbenchModuleV1> => {
    if (disposed) throw new Error('The product sidecar card controller is disposed.');
    if (workbench) return workbench;
    if (workbenchPromise) return workbenchPromise;
    const loader = options.loadWorkbench ?? defaultLoadWorkbench;
    const pending = loader()
      .then((module) => {
        if (
          !module ||
          typeof module.proposePatternImportDxfProductPhaseEAssemblyV1 !== 'function' ||
          typeof module.projectPatternImportDxfProductPhaseEAssemblyV1 !== 'function' ||
          typeof module.createPatternImportDxfProductPhaseEAssemblyWorkbenchStateV1 !== 'function'
        )
          throw new TypeError('The product Phase-E workbench module is invalid.');
        if (disposed) throw new Error('The product sidecar card controller is disposed.');
        workbench = module;
        return module;
      })
      .catch((error: unknown) => {
        workbenchPromise = null;
        throw error;
      });
    workbenchPromise = pending;
    return pending;
  };

  const requireCard = (draft: CardDraft) => {
    if (techCardId !== null && draft.techCardId !== techCardId)
      throw new Error('The product sidecar card controller cannot cross card lifetimes.');
  };

  const sourceDraft = (
    draft: CardDraft,
    sourceSurface: 'default-import' | 'explicit-native-drawn-sewing',
  ): CardDraft => {
    if (sourceSurface === 'default-import') return draft;
    return createPatternImportNativeSewingAuthoringViewV1(
      draft,
      draft.dxfNativeSewingReplay,
      draft.dxfProvenance?.contentBinding?.sourceSha256 ?? '',
    );
  };

  const preparePhaseEWorkbench = async (
    draft: CardDraft,
    request: PatternImportDxfProductPhaseEWorkbenchEntryRequestV1,
  ): Promise<PatternImportDxfProductPhaseEWorkbenchEntryResultV1> => {
    requireCard(draft);
    if (disposed) throw new Error('The product sidecar card controller is disposed.');
    preparedAuthoringContext = null;
    if (
      !draft.dxfProvenance?.pipelineIntegrated ||
      !draft.dxfPhaseDReplay?.replayReady ||
      !draft.dxfPhaseDReplay.carrier
    )
      return entryBlocked(
        'preflight',
        'phase-d-prerequisites-unavailable',
        'A successful public Phase-D carrier and exact non-stale replay are required.',
      );
    if (
      !request?.scopeKey ||
      !request.sizeToken ||
      !request.documentEvidence ||
      request.documentEvidence.techCardId !== draft.techCardId ||
      request.documentEvidence.scopeKey !== request.scopeKey ||
      !Number.isSafeInteger(request.importGeneration) ||
      request.importGeneration <= 0 ||
      !Number.isSafeInteger(request.selectedOperationNumber) ||
      request.selectedOperationNumber <= 0 ||
      !request.existingAssembly?.selectedSeamKey ||
      !Array.isArray(request.existingAssembly.operations) ||
      !Array.isArray(request.existingAssembly.seams)
    )
      return entryBlocked(
        'preflight',
        'explicit-entry-request-invalid',
        'Explicit scope, size, import generation, verified saved-row document evidence, selected existing operation/seam, operations and seams are required.',
      );

    const requestedSourceSurface = request.sourceSurface ?? 'default-import';
    let authoringDraft: CardDraft;
    try {
      authoringDraft = sourceDraft(draft, requestedSourceSurface);
    } catch (error) {
      return entryBlocked(
        'preflight',
        'explicit-native-sewing-source-unavailable',
        error instanceof Error
          ? error.message
          : 'The exact native sewing source is unavailable for this confirmed import.',
      );
    }

    const activeRuntime = await ensureRuntime();
    if (typeof activeRuntime.selectAuthoringPhaseD !== 'function')
      return entryBlocked(
        'phase-d-selection',
        'fresh-phase-d-selector-unavailable',
        'The lazy runtime does not expose the required fresh Phase-D selection owner.',
      );
    let selected: Awaited<ReturnType<typeof selectPatternImportDxfProductDraftPhaseDSizeV1>>;
    try {
      selected = await activeRuntime.selectAuthoringPhaseD(
        authoringDraft,
        request.scopeKey,
        request.sizeToken,
      );
    } catch (error) {
      return entryBlocked(
        'phase-d-selection',
        'fresh-phase-d-selection-failed',
        error instanceof Error ? error.message : 'Fresh Phase-D selection failed.',
      );
    }
    if (!selected.ok)
      return entryBlocked(
        'phase-d-selection',
        selected.blockers[0].code,
        selected.blockers[0].detail,
      );

    const catalogResult: PatternImportDxfProductPhaseEAuthoringCatalogResultV1 =
      await activeRuntime.buildAuthoringCatalog(
        authoringDraft,
        request.scopeKey,
        request.sizeToken,
      );
    if (!catalogResult.ok)
      return entryBlocked(
        'catalog',
        catalogResult.blockers[0].code,
        catalogResult.blockers[0].detail,
      );
    const catalog = catalogResult.catalog;
    if (
      requestedSourceSurface === 'explicit-native-drawn-sewing' &&
      catalog.pieces.some(
        ({ contours }) =>
          !contours.some(({ role }) => role === 'sewing-boundary') ||
          contours.some(({ role }) => role === 'cut-boundary'),
      )
    )
      return entryBlocked(
        'catalog',
        'explicit-native-sewing-catalog-invalid',
        'The explicit native source must expose sewing-boundary contours without cut-boundary substitution.',
        catalog,
      );
    if (
      requestedSourceSurface === 'explicit-native-drawn-sewing' &&
      request.documentEvidence.dxfSha256 !==
        authoringDraft.dxfProvenance?.contentBinding?.sourceSha256
    )
      return entryBlocked(
        'catalog',
        'explicit-native-sewing-source-row-mismatch',
        'The native sewing replay must be rebuilt from the exact current saved DXF row.',
        catalog,
      );
    const documentAuthorityResult = await derivePatternImportDxfPhaseEDocumentAuthorityV1(
      request.documentEvidence,
      selected.selection.selection.canonicalSha256,
      catalog.canonicalSha256,
      options.crypto ?? globalThis.crypto,
    );
    if (!documentAuthorityResult.ok)
      return entryBlocked(
        'catalog',
        documentAuthorityResult.blockers[0].code,
        documentAuthorityResult.blockers[0].detail,
        catalog,
      );
    const documentAuthority = documentAuthorityResult.authority;

    let module: PatternImportDxfProductPhaseEWorkbenchModuleV1;
    try {
      module = await ensureWorkbench();
    } catch (error) {
      return entryBlocked(
        'workbench-load',
        'workbench-load-failed',
        error instanceof Error ? error.message : 'The Phase-E workbench could not be loaded.',
        catalog,
      );
    }
    const proposed = module.proposePatternImportDxfProductPhaseEAssemblyV1(
      catalog,
      request.existingAssembly,
    );
    if (!proposed.ok)
      return entryBlocked(
        'proposal',
        proposed.blockers[0].code,
        proposed.blockers[0].detail,
        catalog,
      );
    const proposal = proposed.proposal;
    if (proposal.operation.sourceOperationNumber !== request.selectedOperationNumber)
      return entryBlocked(
        'proposal',
        'selected-operation-owner-mismatch',
        'The selected existing operation must be the sole owner of the selected existing seam.',
        catalog,
        proposal,
      );
    const projected = module.projectPatternImportDxfProductPhaseEAssemblyV1(
      catalog,
      selected.selection,
    );
    if (!projected.ok)
      return entryBlocked(
        'projection',
        projected.blockers[0].code,
        projected.blockers[0].detail,
        catalog,
        proposal,
      );
    const projection = projected.projection;
    let initialState: PatternImportDxfProductPhaseEAssemblyWorkbenchStateV1;
    try {
      initialState = module.createPatternImportDxfProductPhaseEAssemblyWorkbenchStateV1(
        catalog,
        proposal,
        documentAuthority,
        request.importGeneration,
      );
    } catch (error) {
      return entryBlocked(
        'proposal',
        'workbench-state-refused',
        error instanceof Error ? error.message : 'The exact workbench state was refused.',
        catalog,
        proposal,
        projection,
      );
    }
    if (!proposal.operation.authoringOperationId)
      return entryBlocked(
        'proposal',
        'authoring-operation-id-unavailable',
        'The admitted pure V1 proposal must expose its seam-derived or explicit operation ID.',
        catalog,
        proposal,
        projection,
      );
    if (disposed) throw new Error('The product sidecar card controller is disposed.');
    preparedAuthoringContext = Object.freeze({
      techCardId: draft.techCardId,
      importGeneration: request.importGeneration,
      catalogCanonicalSha256: catalog.canonicalSha256,
      sizeSelectionCanonicalSha256: catalog.sizeSelectionCanonicalSha256,
      proposalFingerprint: proposal.deterministicFingerprint,
      pieceBindings: Object.freeze(
        proposal.sides.map(({ pieceId, pieceLineKey }) => `${pieceId}\u0000${pieceLineKey}`).sort(),
      ) as readonly [string, string],
      operationId: proposal.operation.authoringOperationId,
      operationOrder: proposal.operation.order,
      seamId: proposal.seam.id,
      documentId: documentAuthority.documentId,
      revision: documentAuthority.revision,
      sourceSurface: requestedSourceSurface,
    });
    return Object.freeze({
      ok: true as const,
      stage: 'ready' as const,
      catalog,
      proposal,
      projection,
      initialState,
      blockers: Object.freeze([]) as readonly [],
    });
  };

  return Object.freeze({
    schemaVersion: PATTERN_IMPORT_DXF_PRODUCT_SIDECAR_CARD_CONTROLLER_V1,
    getSnapshot: () => snapshot,
    subscribe: (listener: () => void) => {
      if (disposed) return () => {};
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    buildAuthoringCatalog: async (draft: CardDraft, scopeKey: string, sizeToken: string) => {
      requireCard(draft);
      return (await ensureRuntime()).buildAuthoringCatalog(draft, scopeKey, sizeToken);
    },
    preparePhaseEWorkbench,
    authorChoices: async (
      draft: CardDraft,
      catalog: PatternImportDxfProductPhaseEAuthoringCatalogV1,
      choices: PatternImportDxfProductPhaseEAuthoringChoicesV1,
    ): Promise<PatternImportDxfProductPhaseEAuthorChoicesResultV1> => {
      if (disposed) throw new Error('The product sidecar card controller is disposed.');
      requireCard(draft);
      const prepared = preparedAuthoringContext;
      preparedAuthoringContext = null;
      if (!prepared)
        return preparedContextBlocked(
          'phase-e-prepared-context-unavailable',
          'Phase-E choices require the last successful workbench preparation for this card controller.',
        );
      const operation =
        Array.isArray(choices.operations) && choices.operations.length === 1
          ? choices.operations[0]
          : null;
      const choicePieceBindings = Array.isArray(choices.seam?.sides)
        ? choices.seam.sides
            .map(({ pieceId }) => {
              const matches = catalog.pieces.filter((piece) => piece.pieceId === pieceId);
              return matches.length === 1 ? `${pieceId}\u0000${matches[0].pieceLineKey}` : null;
            })
            .filter((value): value is string => value !== null)
            .sort()
        : [];
      if (
        draft.techCardId !== prepared.techCardId ||
        catalog.canonicalSha256 !== prepared.catalogCanonicalSha256 ||
        choices.expectedCatalogCanonicalSha256 !== prepared.catalogCanonicalSha256 ||
        choices.expectedProposalFingerprint !== prepared.proposalFingerprint ||
        choices.importGeneration !== prepared.importGeneration ||
        choicePieceBindings.length !== 2 ||
        new Set(choicePieceBindings).size !== 2 ||
        choicePieceBindings[0] !== prepared.pieceBindings[0] ||
        choicePieceBindings[1] !== prepared.pieceBindings[1] ||
        !operation ||
        operation.id !== prepared.operationId ||
        operation.order !== prepared.operationOrder ||
        !Array.isArray(operation.seamIds) ||
        operation.seamIds.length !== 1 ||
        operation.seamIds[0] !== prepared.seamId ||
        choices.documentId !== prepared.documentId ||
        choices.revision !== prepared.revision ||
        !choices.seam ||
        choices.seam.id !== prepared.seamId ||
        choices.seam.operationId !== prepared.operationId
      )
        return preparedContextBlocked(
          'phase-e-prepared-context-mismatch',
          'Catalog, bound document revision, sole operation and seam choices must exact-match the last admitted pure V1 proposal.',
        );
      if (
        prepared.sourceSurface === 'explicit-native-drawn-sewing' &&
        (choices.physicalSurface.mode !== 'sewing-surface' ||
          choices.physicalSurface.seamAllowancePhysical !== false)
      )
        return preparedContextBlocked(
          'phase-e-prepared-context-mismatch',
          'Native sewing paths require the explicit sewing-surface physical choice.',
        );
      let authoringDraft: CardDraft;
      try {
        authoringDraft = sourceDraft(draft, prepared.sourceSurface);
      } catch (error) {
        return preparedContextBlocked(
          'phase-e-prepared-context-mismatch',
          error instanceof Error
            ? error.message
            : 'The native sewing source moved before semantic authoring.',
        );
      }
      const result = await (
        await ensureRuntime()
      ).produceCompileAndAuthorPhaseE(authoringDraft, catalog, choices);
      if (disposed) throw new Error('The product sidecar card controller is disposed.');
      authored = result.ok;
      authoredContext = result.ok ? prepared : null;
      authoredCommitIdentity = null;
      publish('ready');
      return result;
    },
    bindAuthoredAuthorityToConfirmedCommit: (draft: CardDraft, apply: ConfirmedApply) => {
      if (disposed) throw new Error('The product sidecar card controller is disposed.');
      requireCard(draft);
      if (!authored) return NOT_REQUESTED;
      const commitIdentity = confirmedCommitIdentityOf(draft, apply);
      if (!commitIdentity) {
        authored = false;
        authoredContext = null;
        authoredCommitIdentity = null;
        preparedAuthoringContext = null;
        attachmentSnapshots.clear();
        publish('ready');
        return confirmedCommitBlocked(
          'confirmed-commit-identity-unavailable',
          'Phase-E authority requires one genuine confirmed commit receipt with the exact uploaded SHA-256 for every scope.',
        );
      }
      if (authoredCommitIdentity === null) {
        authoredCommitIdentity = commitIdentity;
        return Object.freeze({ status: 'bound' as const, blocker: null });
      }
      if (authoredCommitIdentity === commitIdentity)
        return Object.freeze({ status: 'unchanged' as const, blocker: null });
      authored = false;
      authoredContext = null;
      authoredCommitIdentity = null;
      preparedAuthoringContext = null;
      attachmentSnapshots.clear();
      publish('ready');
      return confirmedCommitBlocked(
        'phase-e-authority-invalidated-by-new-commit',
        'A different confirmed DXF commit requires fresh Phase-E authoring before attachment.',
      );
    },
    afterConfirmedSave: async (
      draft: CardDraft,
      apply: ConfirmedApply,
      expectedSavedRow?: PatternImportDxfProductExpectedSavedRowV1,
    ) => {
      if (disposed) throw new Error('The product sidecar card controller is disposed.');
      requireCard(draft);
      if (!runtime && !runtimePromise) {
        preparedAuthoringContext = null;
        authoredCommitIdentity = null;
        authoredContext = null;
        return NOT_REQUESTED;
      }
      if (!authored) {
        preparedAuthoringContext = null;
        authoredCommitIdentity = null;
        authoredContext = null;
        return NOT_REQUESTED;
      }
      const commitIdentity = confirmedCommitIdentityOf(draft, apply);
      if (!commitIdentity) {
        authored = false;
        authoredContext = null;
        authoredCommitIdentity = null;
        preparedAuthoringContext = null;
        attachmentSnapshots.clear();
        publish('ready');
        return confirmedCommitBlocked(
          'confirmed-commit-identity-unavailable',
          'Phase-E authority requires one genuine confirmed commit receipt with the exact uploaded SHA-256 for every scope.',
        );
      }
      if (authoredCommitIdentity === null)
        return confirmedCommitBlocked(
          'phase-e-authority-not-bound-to-confirmed-commit',
          'Bind the authored Phase-E authority to this exact confirmed commit before attachment.',
        );
      if (authoredCommitIdentity !== commitIdentity) {
        authored = false;
        authoredContext = null;
        authoredCommitIdentity = null;
        preparedAuthoringContext = null;
        attachmentSnapshots.clear();
        publish('ready');
        return confirmedCommitBlocked(
          'phase-e-authority-invalidated-by-new-commit',
          'A different confirmed DXF commit requires fresh Phase-E authoring before attachment.',
        );
      }
      let authoringDraft: CardDraft;
      try {
        authoringDraft = sourceDraft(draft, authoredContext?.sourceSurface ?? 'default-import');
      } catch (error) {
        authored = false;
        authoredContext = null;
        authoredCommitIdentity = null;
        preparedAuthoringContext = null;
        attachmentSnapshots.clear();
        publish('ready');
        return confirmedCommitBlocked(
          'phase-e-authority-invalidated-by-new-commit',
          error instanceof Error
            ? error.message
            : 'The native sewing source moved before semantic attachment.',
        );
      }
      if (expectedSavedRow?.firstAttachmentSavedRowRevision !== undefined) {
        const prepared = authoredContext;
        const authority = prepared
          ? await derivePatternImportDxfPhaseEDocumentAuthorityV1(
              expectedSavedRow,
              prepared.sizeSelectionCanonicalSha256,
              prepared.catalogCanonicalSha256,
              options.crypto ?? globalThis.crypto,
            )
          : null;
        if (
          prepared?.sourceSurface !== 'explicit-native-drawn-sewing' ||
          !authority?.ok ||
          authority.authority.revision !== prepared.revision ||
          authority.authority.documentId !== prepared.documentId ||
          authoredContext !== prepared ||
          !authored ||
          authoredCommitIdentity !== commitIdentity
        )
          return confirmedCommitBlocked(
            'phase-e-authority-invalidated-by-new-commit',
            'The first Semantic V1 attachment requires the current prepared native drawing.',
          );
      }
      return (await ensureRuntime()).afterConfirmedSave(authoringDraft, apply, expectedSavedRow);
    },
    retryAttachment: async (key: string) =>
      runtime
        ? runtime.retryAttachment(key)
        : runtimePromise
          ? (await runtimePromise).retryAttachment(key)
          : null,
    readAttachment: (key: string) => runtime?.readAttachment(key) ?? null,
    dispose: () => {
      if (disposed) return;
      disposed = true;
      runtime?.dispose();
      runtime = null;
      runtimePromise = null;
      workbench = null;
      workbenchPromise = null;
      preparedAuthoringContext = null;
      attachmentSnapshots.clear();
      listeners.clear();
      authored = false;
      authoredContext = null;
      authoredCommitIdentity = null;
      publish('disposed');
    },
  });
}
