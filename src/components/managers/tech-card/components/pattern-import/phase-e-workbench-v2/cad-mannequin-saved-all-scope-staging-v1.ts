import { savedWorkbenchBindingScopeKeyV1 } from './saved-workbench-scope-v1';
import type { common_TechCard } from 'api/proto-http/admin';
import { bindingScopes } from 'components/managers/tech-card/components/bom-purpose';
import { rollGoodsScopes } from 'components/managers/tech-card/components/piece-block-refs';

import type { PatternImportDxfPhaseECadMannequinDxfStagingSourceV1 } from './cad-mannequin-dxf-staging-v1';
import { createPatternImportDxfPhaseECadTableZeroOperationGenerationOwnerV1 } from './cad-table-zero-operation-generation-owner-v1';
import {
  listPatternImportDxfPhaseECadTableZeroOperationSavedChoicesV1,
  preparePatternImportDxfPhaseECadTableZeroOperationSavedV1,
} from './cad-table-zero-operation-saved-preparation-v1';
import type { PatternImportDxfPhaseEZeroOperationSavedCardAuthorityRuntimeV1 } from './zero-operation-saved-card-authority-v1';

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
    authority: PatternImportDxfPhaseEZeroOperationSavedCardAuthorityRuntimeV1;
    preparationKey: string;
    signal: AbortSignal;
    prepareSaved?: PrepareSaved;
  }>,
): Promise<PatternImportDxfPhaseECadMannequinSavedAllScopeStagingResultV1> {
  const materialScopes = rollGoodsScopes(input.techCard.techCard?.bomItems ?? []);
  const patterns = input.techCard.techCard?.patterns ?? [];
  const bindings = bindingScopes(materialScopes, patterns);
  const expectedScopeKeys = Array.from(
    new Set(
      patterns.map((pattern) =>
        savedWorkbenchBindingScopeKeyV1(pattern.fabricPurpose, pattern.bomLineKey, bindings),
      ),
    ),
  );
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
  return Object.freeze({
    ok: true as const,
    sources: Object.freeze(sources),
    blocker: null,
  });
}
