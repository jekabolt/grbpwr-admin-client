import {
  buildPatternImportDxfProductPhaseEAuthoringCatalogV1,
  type PatternImportDxfProductPhaseEAuthoringCatalogResultV1,
  type PatternImportDxfProductPhaseEAuthoringCatalogV1,
} from 'lib/cloth/domain/pattern-import-dxf-product-phase-e-authoring-catalog-v1';
import {
  selectPatternImportDxfProductDraftPhaseDSizeV1,
  type PatternImportDxfProductDraftPhaseDSelectionResultV1,
} from 'lib/cloth/domain/pattern-import-dxf-product-draft-phase-d-selection-v1';
import {
  projectPatternImportDxfProductPhaseEAssemblyV1,
  type PatternImportDxfProductPhaseEAssemblyProjectionResultV1,
  type PatternImportDxfProductPhaseEAssemblyProjectionV1,
} from 'lib/pattern-import/dxf-product-phase-e-assembly-workbench-v1';
import {
  PATTERN_IMPORT_DXF_PRODUCT_WRITER_REPLAY_CARRIER_V1,
  type CardDraft,
} from 'lib/pattern-import/types';

import type { PatternImportDxfPhaseECardSessionV1 } from '../phase-e-workbench-card-session-v1';

export const PATTERN_IMPORT_DXF_PHASE_E_CAD_TABLE_ZERO_OPERATION_FRESH_PREPARATION_V1 =
  'pattern-import-dxf-phase-e-cad-table-zero-operation-fresh-preparation/1' as const;

export const PATTERN_IMPORT_DXF_PHASE_E_CAD_TABLE_ZERO_OPERATION_FRESH_PREPARATION_CLAIMS_V1 =
  Object.freeze({
    existingCardSessionRequired: true,
    explicitMaterialScopeRequired: true,
    explicitSizeTokenRequired: true,
    writerReplayRequired: true,
    currentImportGenerationRequired: true,
    existingPhaseDSelectionReused: true,
    existingAuthoringCatalogReused: true,
    existingProjectionReused: true,
    selectedOperationRequired: false,
    storedSeamRequired: false,
    proposalCreated: false,
    authoringOperationIdCreated: false,
    rawDxfExposed: false,
    readsNetwork: false,
    writesForm: false,
    writesNetwork: false,
    productionMounted: false,
    productionReady: false,
  } as const);

type DraftSelection = Extract<PatternImportDxfProductDraftPhaseDSelectionResultV1, { ok: true }>;
type PhaseDSelection = DraftSelection['selection'];

export type PatternImportDxfPhaseECadTableZeroOperationFreshChoiceV1 = Readonly<{
  scopeKey: string;
  label: string;
  fabricPurpose: string;
  bomLineKey: string;
  isInterlining: boolean;
  sizes: readonly Readonly<{
    sizeToken: string;
    sizeId: number;
    label: string;
    rank: number;
  }>[];
}>;

export type PatternImportDxfPhaseECadTableZeroOperationFreshBlockerV1 = Readonly<{
  code:
    | 'fresh-session-invalid'
    | 'fresh-session-generation-stale'
    | 'phase-d-authority-unavailable'
    | 'material-scope-invalid'
    | 'material-scope-unavailable'
    | 'writer-replay-unavailable'
    | 'writer-replay-binding-stale'
    | 'size-token-invalid'
    | 'size-token-unavailable'
    | 'phase-d-selection-unavailable'
    | 'authoring-catalog-unavailable'
    | 'preparation-binding-stale'
    | 'projection-unavailable'
    | 'fresh-preparation-failed';
  detail: string;
}>;

export type PatternImportDxfPhaseECadTableZeroOperationFreshChoicesResultV1 =
  | Readonly<{
      ok: true;
      techCardId: number;
      importGeneration: number;
      choices: readonly PatternImportDxfPhaseECadTableZeroOperationFreshChoiceV1[];
      blocker: null;
      claims: typeof PATTERN_IMPORT_DXF_PHASE_E_CAD_TABLE_ZERO_OPERATION_FRESH_PREPARATION_CLAIMS_V1;
    }>
  | Readonly<{
      ok: false;
      techCardId: number | null;
      importGeneration: number | null;
      choices: readonly [];
      blocker: PatternImportDxfPhaseECadTableZeroOperationFreshBlockerV1;
      claims: typeof PATTERN_IMPORT_DXF_PHASE_E_CAD_TABLE_ZERO_OPERATION_FRESH_PREPARATION_CLAIMS_V1;
    }>;

export type PatternImportDxfPhaseECadTableZeroOperationFreshPreparationResultV1 =
  | Readonly<{
      ok: true;
      techCardId: number;
      importGeneration: number;
      scopeKey: string;
      sizeToken: string;
      choices: readonly PatternImportDxfPhaseECadTableZeroOperationFreshChoiceV1[];
      selection: DraftSelection;
      catalog: PatternImportDxfProductPhaseEAuthoringCatalogV1;
      projection: PatternImportDxfProductPhaseEAssemblyProjectionV1;
      blocker: null;
      claims: typeof PATTERN_IMPORT_DXF_PHASE_E_CAD_TABLE_ZERO_OPERATION_FRESH_PREPARATION_CLAIMS_V1;
    }>
  | Readonly<{
      ok: false;
      techCardId: number | null;
      importGeneration: number | null;
      scopeKey: string | null;
      sizeToken: string | null;
      choices: readonly PatternImportDxfPhaseECadTableZeroOperationFreshChoiceV1[];
      selection: null;
      catalog: null;
      projection: null;
      blocker: PatternImportDxfPhaseECadTableZeroOperationFreshBlockerV1;
      claims: typeof PATTERN_IMPORT_DXF_PHASE_E_CAD_TABLE_ZERO_OPERATION_FRESH_PREPARATION_CLAIMS_V1;
    }>;

export type PatternImportDxfPhaseECadTableZeroOperationFreshPreparationDependenciesV1 = Readonly<{
  select: (
    draft: CardDraft,
    scopeKey: string,
    sizeToken: string,
  ) => Promise<PatternImportDxfProductDraftPhaseDSelectionResultV1>;
  buildCatalog: (
    draft: CardDraft,
    scopeKey: string,
    sizeToken: string,
  ) => Promise<PatternImportDxfProductPhaseEAuthoringCatalogResultV1>;
  project: (
    catalog: PatternImportDxfProductPhaseEAuthoringCatalogV1,
    selection: PhaseDSelection,
  ) => PatternImportDxfProductPhaseEAssemblyProjectionResultV1;
}>;

const STABLE_ID = /^[A-Za-z0-9][A-Za-z0-9._:/#-]{0,255}$/;
const SHA256 = /^[0-9a-f]{64}$/;

const DEFAULT_DEPENDENCIES = Object.freeze({
  select: selectPatternImportDxfProductDraftPhaseDSizeV1,
  buildCatalog: buildPatternImportDxfProductPhaseEAuthoringCatalogV1,
  project: projectPatternImportDxfProductPhaseEAssemblyV1,
}) satisfies PatternImportDxfPhaseECadTableZeroOperationFreshPreparationDependenciesV1;

function blocker(
  code: PatternImportDxfPhaseECadTableZeroOperationFreshBlockerV1['code'],
  detail: string,
): PatternImportDxfPhaseECadTableZeroOperationFreshBlockerV1 {
  return Object.freeze({ code, detail });
}

function sessionCurrent(
  cardSession: PatternImportDxfPhaseECardSessionV1 | null | undefined,
  expectedImportGeneration: number,
): PatternImportDxfPhaseECadTableZeroOperationFreshBlockerV1 | null {
  if (
    !cardSession ||
    !Number.isSafeInteger(cardSession.techCardId) ||
    cardSession.techCardId <= 0 ||
    !cardSession.draft ||
    cardSession.draft.techCardId !== cardSession.techCardId ||
    !Number.isSafeInteger(cardSession.importGeneration) ||
    cardSession.importGeneration <= 0
  )
    return blocker('fresh-session-invalid', 'The current DXF workspace is not ready yet.');
  if (
    !Number.isSafeInteger(expectedImportGeneration) ||
    expectedImportGeneration <= 0 ||
    cardSession.importGeneration !== expectedImportGeneration
  )
    return blocker(
      'fresh-session-generation-stale',
      'The confirmed DXF import generation changed before zero-operation preparation.',
    );
  if (
    !cardSession.draft.dxfProvenance?.pipelineIntegrated ||
    !cardSession.draft.dxfProvenance.carrier ||
    !cardSession.draft.dxfProvenance.contentBinding ||
    !cardSession.draft.dxfPhaseDReplay?.replayReady ||
    !cardSession.draft.dxfPhaseDReplay.carrier
  )
    return blocker(
      'phase-d-authority-unavailable',
      'The fresh session has no successful public Phase-D authority and detached replay carrier.',
    );
  return null;
}

function choicesBlocked(
  cardSession: PatternImportDxfPhaseECardSessionV1 | null | undefined,
  issue: PatternImportDxfPhaseECadTableZeroOperationFreshBlockerV1,
): PatternImportDxfPhaseECadTableZeroOperationFreshChoicesResultV1 {
  return Object.freeze({
    ok: false as const,
    techCardId: cardSession?.techCardId ?? null,
    importGeneration: cardSession?.importGeneration ?? null,
    choices: Object.freeze([]) as readonly [],
    blocker: issue,
    claims: PATTERN_IMPORT_DXF_PHASE_E_CAD_TABLE_ZERO_OPERATION_FRESH_PREPARATION_CLAIMS_V1,
  });
}

/** Lists only exact writer-replay scope/size inputs; it does not prepare geometry or read network. */
export function listPatternImportDxfPhaseECadTableZeroOperationFreshChoicesV1(
  cardSession: PatternImportDxfPhaseECardSessionV1 | null | undefined,
  expectedImportGeneration: number,
): PatternImportDxfPhaseECadTableZeroOperationFreshChoicesResultV1 {
  const issue = sessionCurrent(cardSession, expectedImportGeneration);
  if (issue || !cardSession)
    return choicesBlocked(
      cardSession,
      issue ?? blocker('fresh-session-invalid', 'A current Phase-E card session is required.'),
    );

  const scopeKeys = cardSession.draft.scopes.map(({ target }) => target.scopeKey.trim());
  if (
    !scopeKeys.length ||
    scopeKeys.some((scopeKey) => !STABLE_ID.test(scopeKey)) ||
    new Set(scopeKeys).size !== scopeKeys.length
  )
    return choicesBlocked(
      cardSession,
      blocker(
        'material-scope-invalid',
        'Every fresh DXF material scope must have one distinct stable scope identity.',
      ),
    );

  const choices: PatternImportDxfPhaseECadTableZeroOperationFreshChoiceV1[] = [];
  for (const scope of cardSession.draft.scopes) {
    const replay = scope.writerReplay;
    if (replay?.schemaVersion !== PATTERN_IMPORT_DXF_PRODUCT_WRITER_REPLAY_CARRIER_V1)
      return choicesBlocked(
        cardSession,
        blocker(
          'writer-replay-unavailable',
          `Material scope ${scope.target.scopeKey} has no exact writer replay carrier.`,
        ),
      );
    if (
      replay.job.techCardId !== cardSession.techCardId ||
      replay.job.scope.scopeKey !== scope.target.scopeKey
    )
      return choicesBlocked(
        cardSession,
        blocker(
          'writer-replay-binding-stale',
          `Material scope ${scope.target.scopeKey} has a writer replay bound to another card or scope.`,
        ),
      );
    const sizeTokens = replay.job.sizes.map(({ token }) => token.trim());
    if (
      !sizeTokens.length ||
      sizeTokens.some((sizeToken) => !STABLE_ID.test(sizeToken)) ||
      new Set(sizeTokens).size !== sizeTokens.length
    )
      return choicesBlocked(
        cardSession,
        blocker(
          'size-token-invalid',
          `Material scope ${scope.target.scopeKey} has no distinct stable writer size tokens.`,
        ),
      );
    choices.push(
      Object.freeze({
        scopeKey: scope.target.scopeKey,
        label: scope.target.label.trim() || scope.target.scopeKey,
        fabricPurpose: scope.target.fabricPurpose,
        bomLineKey: scope.target.bomLineKey,
        isInterlining: scope.target.isInterlining,
        sizes: Object.freeze(
          replay.job.sizes.map((size) =>
            Object.freeze({
              sizeToken: size.token,
              sizeId: size.sizeId,
              label: size.name.trim() || size.token,
              rank: size.rank,
            }),
          ),
        ),
      }),
    );
  }

  return Object.freeze({
    ok: true as const,
    techCardId: cardSession.techCardId,
    importGeneration: cardSession.importGeneration,
    choices: Object.freeze(choices),
    blocker: null,
    claims: PATTERN_IMPORT_DXF_PHASE_E_CAD_TABLE_ZERO_OPERATION_FRESH_PREPARATION_CLAIMS_V1,
  });
}

function preparationBlocked(
  input: Readonly<{
    cardSession: PatternImportDxfPhaseECardSessionV1 | null | undefined;
    scopeKey?: string;
    sizeToken?: string;
    choices?: readonly PatternImportDxfPhaseECadTableZeroOperationFreshChoiceV1[];
  }>,
  issue: PatternImportDxfPhaseECadTableZeroOperationFreshBlockerV1,
): PatternImportDxfPhaseECadTableZeroOperationFreshPreparationResultV1 {
  return Object.freeze({
    ok: false as const,
    techCardId: input.cardSession?.techCardId ?? null,
    importGeneration: input.cardSession?.importGeneration ?? null,
    scopeKey: input.scopeKey ?? null,
    sizeToken: input.sizeToken ?? null,
    choices: Object.freeze([...(input.choices ?? [])]),
    selection: null,
    catalog: null,
    projection: null,
    blocker: issue,
    claims: PATTERN_IMPORT_DXF_PHASE_E_CAD_TABLE_ZERO_OPERATION_FRESH_PREPARATION_CLAIMS_V1,
  });
}

function preparedBindingsCurrent(
  cardSession: PatternImportDxfPhaseECardSessionV1,
  expectedImportGeneration: number,
  scopeKey: string,
  sizeToken: string,
  selection: DraftSelection,
  catalog: PatternImportDxfProductPhaseEAuthoringCatalogV1,
): boolean {
  const selectedEnvelope = selection.selection;
  const selected = selectedEnvelope.selection;
  const binding = selectedEnvelope.pipeline.contentBinding;
  return (
    sessionCurrent(cardSession, expectedImportGeneration) === null &&
    selectedEnvelope.ok === true &&
    selected.scopeKey === scopeKey &&
    selected.sizeToken === sizeToken &&
    SHA256.test(selected.canonicalSha256) &&
    SHA256.test(selected.selectedGeometrySha256) &&
    catalog.techCardId === cardSession.techCardId &&
    catalog.scopeKey === scopeKey &&
    catalog.sizeToken === sizeToken &&
    catalog.sizeSelectionCanonicalSha256 === selected.canonicalSha256 &&
    catalog.sourceFileId === selectedEnvelope.phaseD.source.sourceFileId &&
    catalog.sourceFileId === binding?.sourceFileId &&
    binding.selectedGeometrySha256 === selected.selectedGeometrySha256 &&
    SHA256.test(catalog.canonicalSha256)
  );
}

/**
 * Fresh zero-operation preparation. The explicit scope and size are replayed through the existing
 * Phase-D/catalog/projection owners; no Assembly row, StoredSeam or proposal participates.
 */
export async function preparePatternImportDxfPhaseECadTableZeroOperationFreshV1(
  input: Readonly<{
    cardSession: PatternImportDxfPhaseECardSessionV1 | null | undefined;
    expectedImportGeneration: number;
    scopeKey: string;
    sizeToken: string;
  }>,
  dependencies: PatternImportDxfPhaseECadTableZeroOperationFreshPreparationDependenciesV1 = DEFAULT_DEPENDENCIES,
): Promise<PatternImportDxfPhaseECadTableZeroOperationFreshPreparationResultV1> {
  const choices = listPatternImportDxfPhaseECadTableZeroOperationFreshChoicesV1(
    input.cardSession,
    input.expectedImportGeneration,
  );
  if (!choices.ok) return preparationBlocked(input, choices.blocker);
  if (!input.cardSession)
    return preparationBlocked(
      input,
      blocker('fresh-session-invalid', 'A current Phase-E card session is required.'),
    );
  const scopeKey = input.scopeKey.trim();
  const sizeToken = input.sizeToken.trim();
  if (!STABLE_ID.test(scopeKey))
    return preparationBlocked(
      { ...input, choices: choices.choices },
      blocker('material-scope-invalid', 'Choose one explicit stable material scope.'),
    );
  const scope = choices.choices.find((candidate) => candidate.scopeKey === scopeKey);
  if (!scope)
    return preparationBlocked(
      { ...input, scopeKey, choices: choices.choices },
      blocker('material-scope-unavailable', 'The selected material scope is not current.'),
    );
  if (!STABLE_ID.test(sizeToken))
    return preparationBlocked(
      { ...input, scopeKey, sizeToken, choices: choices.choices },
      blocker('size-token-invalid', 'Choose one explicit stable writer size token.'),
    );
  if (!scope.sizes.some((size) => size.sizeToken === sizeToken))
    return preparationBlocked(
      { ...input, scopeKey, sizeToken, choices: choices.choices },
      blocker('size-token-unavailable', 'The selected size is not current in this material scope.'),
    );

  try {
    const [selected, catalogResult] = await Promise.all([
      dependencies.select(input.cardSession.draft, scopeKey, sizeToken),
      dependencies.buildCatalog(input.cardSession.draft, scopeKey, sizeToken),
    ]);
    const generationIssue = sessionCurrent(input.cardSession, input.expectedImportGeneration);
    if (generationIssue)
      return preparationBlocked(
        { ...input, scopeKey, sizeToken, choices: choices.choices },
        generationIssue,
      );
    if (!selected.ok)
      return preparationBlocked(
        { ...input, scopeKey, sizeToken, choices: choices.choices },
        blocker(
          'phase-d-selection-unavailable',
          selected.blockers[0]?.detail ?? 'Exact Phase-D size selection is unavailable.',
        ),
      );
    if (!catalogResult.ok)
      return preparationBlocked(
        { ...input, scopeKey, sizeToken, choices: choices.choices },
        blocker(
          'authoring-catalog-unavailable',
          catalogResult.blockers[0]?.detail ?? 'Exact authoring catalog is unavailable.',
        ),
      );
    if (
      !preparedBindingsCurrent(
        input.cardSession,
        input.expectedImportGeneration,
        scopeKey,
        sizeToken,
        selected,
        catalogResult.catalog,
      )
    )
      return preparationBlocked(
        { ...input, scopeKey, sizeToken, choices: choices.choices },
        blocker(
          'preparation-binding-stale',
          'The selected Phase-D envelope and catalog no longer share the current card, scope, size and hashes.',
        ),
      );
    const projected = dependencies.project(catalogResult.catalog, selected.selection);
    if (!projected.ok)
      return preparationBlocked(
        { ...input, scopeKey, sizeToken, choices: choices.choices },
        blocker(
          'projection-unavailable',
          projected.blockers[0]?.detail ?? 'Exact Phase-D projection is unavailable.',
        ),
      );
    if (
      sessionCurrent(input.cardSession, input.expectedImportGeneration) ||
      projected.projection.expectedCatalogCanonicalSha256 !==
        catalogResult.catalog.canonicalSha256 ||
      projected.projection.sizeSelectionCanonicalSha256 !==
        selected.selection.selection.canonicalSha256 ||
      projected.projection.sourceFileId !== catalogResult.catalog.sourceFileId ||
      projected.projection.sizeToken !== sizeToken
    )
      return preparationBlocked(
        { ...input, scopeKey, sizeToken, choices: choices.choices },
        blocker(
          'preparation-binding-stale',
          'The exact projection changed from the current selected Phase-D and catalog hashes.',
        ),
      );
    return Object.freeze({
      ok: true as const,
      techCardId: input.cardSession.techCardId,
      importGeneration: input.cardSession.importGeneration,
      scopeKey,
      sizeToken,
      choices: choices.choices,
      selection: selected,
      catalog: catalogResult.catalog,
      projection: projected.projection,
      blocker: null,
      claims: PATTERN_IMPORT_DXF_PHASE_E_CAD_TABLE_ZERO_OPERATION_FRESH_PREPARATION_CLAIMS_V1,
    });
  } catch (error) {
    return preparationBlocked(
      { ...input, scopeKey, sizeToken, choices: choices.choices },
      blocker(
        'fresh-preparation-failed',
        error instanceof Error
          ? `Fresh zero-operation preparation failed: ${error.message}`
          : 'Fresh zero-operation preparation failed.',
      ),
    );
  }
}
