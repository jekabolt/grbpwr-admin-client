import { savedWorkbenchBindingScopeKeyV1 } from './saved-workbench-scope-v1';
import type { common_TechCard } from 'api/proto-http/admin';
import { bindingScopes } from 'components/managers/tech-card/components/bom-purpose';
import { rollGoodsScopes } from 'components/managers/tech-card/components/piece-block-refs';
import { readPatternImportDxfProductPhaseEPreparedPieceOrdinalsV1 } from 'lib/pattern-import/dxf-product-phase-e-assembly-workbench-v1';

import type { PatternImportDxfPhaseECadMannequinDxfStagingSourceV1 } from './cad-mannequin-dxf-staging-v1';
import { createPatternImportDxfPhaseECadTableZeroOperationGenerationOwnerV1 } from './cad-table-zero-operation-generation-owner-v1';
import {
  listPatternImportDxfPhaseECadTableZeroOperationSavedChoicesV1,
  preparePatternImportDxfPhaseECadTableZeroOperationSavedV1,
} from './cad-table-zero-operation-saved-preparation-v1';
import {
  isPatternImportDxfPhaseEZeroConnectPreparedAuthorityV1,
  type PatternImportDxfPhaseEZeroConnectPreparedAuthorityV1,
} from './cad-table-zero-connect-phase-e-authority-v1';
import {
  assertExactZeroOperationSavedPatternRowV1,
  type PatternImportDxfPhaseEZeroOperationSavedCardAuthorityRuntimeV1,
} from './zero-operation-saved-card-authority-v1';

export const PATTERN_IMPORT_DXF_PHASE_E_CAD_MANNEQUIN_SAVED_ALL_SCOPE_STAGING_V1 =
  'pattern-import-dxf-phase-e-cad-mannequin-saved-all-scope-staging/1' as const;

export const PATTERN_IMPORT_DXF_PHASE_E_CAD_MANNEQUIN_SAVED_ALL_SCOPE_STAGING_CLAIMS_V1 =
  Object.freeze({
    currentSavedCardRequired: true,
    everyCurrentSavedDxfScopeRequired: true,
    rollGoodsSlotsWithoutSavedDxfIgnored: true,
    exactSavedRowPreparationOnly: true,
    activeScopePresentedFirst: true,
    staleCardOrRowFailsClosed: true,
    abortOrSupersessionFailsClosed: true,
    partialProjectionPresentedAsComplete: false,
    createsAssemblyAuthority: false,
    createsWriter: false,
  } as const);

export type PatternImportDxfPhaseECadMannequinSavedAllScopeStagingBlockerV1 = Readonly<{
  code:
    | 'saved-material-scope-set-invalid'
    | 'saved-material-scope-preparation-blocked'
    | 'saved-material-scope-staging-cancelled';
  detail: string;
}>;

export type PatternImportDxfPhaseECadMannequinSavedAllScopeStagingResultV1 =
  | Readonly<{
      ok: true;
      sources: readonly PatternImportDxfPhaseECadMannequinDxfStagingSourceV1[];
      blocker: null;
    }>
  | Readonly<{
      ok: false;
      sources: readonly PatternImportDxfPhaseECadMannequinDxfStagingSourceV1[];
      blocker: PatternImportDxfPhaseECadMannequinSavedAllScopeStagingBlockerV1;
    }>;

type PrepareSaved = typeof preparePatternImportDxfPhaseECadTableZeroOperationSavedV1;
type StagingSources = readonly PatternImportDxfPhaseECadMannequinDxfStagingSourceV1[];
type PreparedAuthority = PatternImportDxfPhaseEZeroConnectPreparedAuthorityV1;

const preparedLaneOrdinals = new WeakMap<StagingSources, readonly number[]>();

/** Ordinals apply only to the complete immutable source set opened by the saved owner. */
export function readSavedAllScopeStagingLaneOrdinalsV1(
  sources: StagingSources,
): readonly number[] | null {
  return preparedLaneOrdinals.get(sources) ?? null;
}

function blocked(
  current: PatternImportDxfPhaseECadMannequinDxfStagingSourceV1,
  blocker: PatternImportDxfPhaseECadMannequinSavedAllScopeStagingBlockerV1,
): PatternImportDxfPhaseECadMannequinSavedAllScopeStagingResultV1 {
  return Object.freeze({
    ok: false as const,
    sources: Object.freeze([current]),
    blocker: Object.freeze(blocker),
  });
}

function uniqueNonEmpty(values: readonly string[]): boolean {
  return values.every((value) => value.trim().length > 0) && new Set(values).size === values.length;
}

function savedScopeOrder(techCard: common_TechCard): readonly string[] {
  const materialScopes = rollGoodsScopes(techCard.techCard?.bomItems ?? []);
  const patterns = techCard.techCard?.patterns ?? [];
  const bindings = bindingScopes(materialScopes, patterns);
  return patterns.map((row) =>
    savedWorkbenchBindingScopeKeyV1(row.fabricPurpose, row.bomLineKey, bindings),
  );
}

function currentPreparedOrdinals(
  sources: StagingSources,
  prepared: ReadonlyMap<string, PreparedAuthority>,
  techCard: common_TechCard,
  scopeOrder: readonly string[],
  sizeToken: string,
  sizeId: number | undefined,
): readonly number[] | null {
  const currentOrder = savedScopeOrder(techCard);
  if (
    !sizeId ||
    !uniqueNonEmpty(scopeOrder) ||
    scopeOrder.length !== sources.length ||
    currentOrder.length !== scopeOrder.length ||
    scopeOrder.some((scope, index) => currentOrder[index] !== scope) ||
    !uniqueNonEmpty(
      sources.flatMap(({ projection }) =>
        projection.pieces.map(({ pieceLineKey }) => pieceLineKey),
      ),
    )
  )
    return null;

  const ordinalsByScope = new Map<string, readonly number[]>();
  let offset = 0;
  for (const scope of scopeOrder) {
    const source = sources.find(({ scopeKey }) => scopeKey === scope);
    const origin = prepared.get(scope);
    if (!source || !isPatternImportDxfPhaseEZeroConnectPreparedAuthorityV1(origin)) return null;
    const { projection } = source;
    if (
      !Object.isFrozen(source) ||
      !Object.isFrozen(projection) ||
      !Object.isFrozen(projection.pieces) ||
      origin.row.scopeKey !== scope ||
      origin.row.cardLockVersion !== techCard.lockVersion ||
      origin.row.techCardId !== techCard.id ||
      origin.selectedRank.sizeId !== sizeId ||
      projection.sourceFileId !== origin.sourceFileId ||
      projection.expectedCatalogCanonicalSha256 !== origin.catalogCanonicalSha256 ||
      projection.sizeSelectionCanonicalSha256 !== origin.sizeSelectionCanonicalSha256 ||
      projection.sizeToken !== sizeToken
    )
      return null;
    assertExactZeroOperationSavedPatternRowV1(techCard, origin.row);
    const ordinals = readPatternImportDxfProductPhaseEPreparedPieceOrdinalsV1(projection, scope);
    if (!ordinals) return null;
    ordinalsByScope.set(
      scope,
      ordinals.map((ordinal) => ordinal + offset),
    );
    offset += ordinals.length;
  }
  return Object.freeze(sources.flatMap(({ scopeKey }) => ordinalsByScope.get(scopeKey)!));
}

/**
 * Reconstructs every current saved DXF material slot for the mannequin. The active prepared
 * projection is retained as the first source; every other scope goes through the same current-row,
 * byte-exact saved preparation used by the zero-operation table. A missing, ambiguous, stale or
 * cancelled scope returns only the active source, so a partial garment is never labelled complete.
 */
export async function preparePatternImportDxfPhaseECadMannequinSavedAllScopeStagingV1(
  input: Readonly<{
    techCard: common_TechCard;
    orderSizeIds: (ids: number[]) => number[];
    sizeNameById: ReadonlyMap<number, string>;
    sizeToken: string;
    current: PatternImportDxfPhaseECadMannequinDxfStagingSourceV1;
    currentAuthority?: PreparedAuthority;
    authority: PatternImportDxfPhaseEZeroOperationSavedCardAuthorityRuntimeV1;
    preparationKey: string;
    signal: AbortSignal;
    prepareSaved?: PrepareSaved;
  }>,
): Promise<PatternImportDxfPhaseECadMannequinSavedAllScopeStagingResultV1> {
  const scopeOrder = savedScopeOrder(input.techCard);
  const expectedScopeKeys = Array.from(new Set(scopeOrder));
  const choices = listPatternImportDxfPhaseECadTableZeroOperationSavedChoicesV1(
    input.techCard,
    input.orderSizeIds,
    input.sizeNameById,
  );
  const choiceKeys = choices.ok ? choices.choices.map(({ scopeKey }) => scopeKey) : [];
  if (
    !input.sizeToken.trim() ||
    !input.current.scopeKey.trim() ||
    !input.preparationKey.trim() ||
    input.preparationKey.length > 4_096 ||
    !uniqueNonEmpty(expectedScopeKeys) ||
    !uniqueNonEmpty(choiceKeys) ||
    expectedScopeKeys.length !== choiceKeys.length ||
    expectedScopeKeys.some((scopeKey) => !choiceKeys.includes(scopeKey)) ||
    !choiceKeys.includes(input.current.scopeKey)
  )
    return blocked(input.current, {
      code: 'saved-material-scope-set-invalid',
      detail:
        choices.ok === false
          ? choices.blocker.detail
          : 'The current saved material scope set is missing, duplicated, ambiguous or does not include the active scope.',
    });
  if (input.signal.aborted)
    return blocked(input.current, {
      code: 'saved-material-scope-staging-cancelled',
      detail: 'Saved material-scope staging was cancelled before reconstruction.',
    });

  const sources: PatternImportDxfPhaseECadMannequinDxfStagingSourceV1[] = [input.current];
  const prepared = new Map<string, PreparedAuthority>();
  const prepareSaved =
    input.prepareSaved ?? preparePatternImportDxfPhaseECadTableZeroOperationSavedV1;
  for (const choice of choices.choices) {
    if (choice.scopeKey === input.current.scopeKey) continue;
    if (input.signal.aborted)
      return blocked(input.current, {
        code: 'saved-material-scope-staging-cancelled',
        detail: `Saved material slot ${choice.scopeKey} was cancelled before reconstruction.`,
      });
    const generationOwner = createPatternImportDxfPhaseECadTableZeroOperationGenerationOwnerV1();
    try {
      const generation = generationOwner.beginSaved(
        `${input.preparationKey}:scope:${choice.scopeKey}`,
      );
      const saved = await prepareSaved(
        {
          techCard: input.techCard,
          orderSizeIds: input.orderSizeIds,
          sizeNameById: input.sizeNameById,
          scopeKey: choice.scopeKey,
          sizeToken: input.sizeToken,
          authority: input.authority,
          generation,
        },
        input.signal,
      );
      if (input.signal.aborted)
        return blocked(input.current, {
          code: 'saved-material-scope-staging-cancelled',
          detail: `Saved material slot ${choice.scopeKey} was cancelled during reconstruction.`,
        });
      if (!saved.ok)
        return blocked(input.current, {
          code: 'saved-material-scope-preparation-blocked',
          detail: `Saved material slot ${choice.scopeKey} could not be reconstructed: ${saved.blocker.detail}`,
        });
      prepared.set(choice.scopeKey, saved.authoringAuthority);
      sources.push(
        Object.freeze({
          scopeKey: saved.scopeKey,
          label: choice.label,
          projection: saved.projection,
        }),
      );
    } catch (error) {
      return blocked(input.current, {
        code: input.signal.aborted
          ? 'saved-material-scope-staging-cancelled'
          : 'saved-material-scope-preparation-blocked',
        detail:
          error instanceof Error
            ? `Saved material slot ${choice.scopeKey} could not be reconstructed: ${error.message}`
            : `Saved material slot ${choice.scopeKey} could not be reconstructed.`,
      });
    } finally {
      generationOwner.dispose();
    }
  }
  const completeSources = Object.freeze(sources);
  if (
    sources.length > 1 &&
    isPatternImportDxfPhaseEZeroConnectPreparedAuthorityV1(input.currentAuthority) &&
    input.currentAuthority.row.techCardId === input.techCard.id &&
    input.currentAuthority.row.cardLockVersion === input.techCard.lockVersion
  ) {
    prepared.set(input.current.scopeKey, input.currentAuthority);
    try {
      const { techCard } = await input.authority.resolveExactCurrentCard(
        input.currentAuthority.row,
        input.signal,
      );
      const selectedSize = choices.choices[0]?.sizes.find(
        ({ sizeToken }) => sizeToken === input.sizeToken,
      );
      const ordinals = currentPreparedOrdinals(
        completeSources,
        prepared,
        techCard,
        scopeOrder,
        input.sizeToken,
        selectedSize?.sizeId,
      );
      if (!input.signal.aborted && ordinals) preparedLaneOrdinals.set(completeSources, ordinals);
    } catch {
      // Keep the established scene order if this optional presentation binding cannot be proven.
    }
  }
  if (input.signal.aborted)
    return blocked(input.current, {
      code: 'saved-material-scope-staging-cancelled',
      detail: 'Saved material-scope staging was cancelled before publication.',
    });
  return Object.freeze({
    ok: true as const,
    sources: completeSources,
    blocker: null,
  });
}
