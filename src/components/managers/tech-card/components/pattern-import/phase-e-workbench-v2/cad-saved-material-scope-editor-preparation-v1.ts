import type { common_TechCard } from 'api/proto-http/admin';
import {
  bindingScopes,
  scopeKeyOfBinding,
} from 'components/managers/tech-card/components/bom-purpose';
import { rollGoodsScopes } from 'components/managers/tech-card/components/piece-block-refs';
import type { PatternImportDxfProductPhaseEAuthoringCatalogV1 } from 'lib/cloth/domain/pattern-import-dxf-product-phase-e-authoring-catalog-v1';
import type { DxfProductPhaseDSizeSelectionResultV1 } from 'lib/pattern-import/dxf-product-phase-d-size-selection-v1';
import type { PatternImportDxfProductPhaseEAssemblyProjectionV1 } from 'lib/pattern-import/dxf-product-phase-e-assembly-workbench-v1';
import { PATTERN_IMPORT_DXF_PRODUCT_WRITER_REPLAY_CARRIER_V1 } from 'lib/pattern-import/types';

import {
  buildPatternImportDxfPhaseECadSavedPreparedMaterialScopesCatalogV1,
  type PatternImportDxfPhaseECadMaterialScopeCatalogResultV1,
} from './cad-material-scope-catalog-v1';
import { createPatternImportDxfPhaseECadTableZeroOperationGenerationOwnerV1 } from './cad-table-zero-operation-generation-owner-v1';
import {
  listPatternImportDxfPhaseECadTableZeroOperationSavedChoicesV1,
  preparePatternImportDxfPhaseECadTableZeroOperationSavedV1,
} from './cad-table-zero-operation-saved-preparation-v1';
import {
  PATTERN_IMPORT_DXF_PHASE_E_DRAFT_CAD_COMPILE_SOURCE_V1,
  type PatternImportDxfPhaseEDraftCadCompileSourceV1,
} from './draft-cad-compile-source-v1';
import type { PatternImportDxfPhaseEZeroOperationSavedCardAuthorityRuntimeV1 } from './zero-operation-saved-card-authority-v1';

export const PATTERN_IMPORT_DXF_PHASE_E_CAD_SAVED_MATERIAL_SCOPE_EDITOR_PREPARATION_V1 =
  'pattern-import-dxf-phase-e-cad-saved-material-scope-editor-preparation/1' as const;

export const PATTERN_IMPORT_DXF_PHASE_E_CAD_SAVED_MATERIAL_SCOPE_EDITOR_PREPARATION_CLAIMS_V1 =
  Object.freeze({
    activeSavedPreparationReused: true,
    everyOtherSavedScopeExactPrepared: true,
    activeScopeFirst: true,
    rawDxfExposed: false,
    cardDraftExposed: false,
    privateAuthoringAuthorityExposed: false,
    partialPreparedSetPublished: false,
    finalCurrentCardReadRequired: true,
    independentDraftCadSessionPerScopeRequired: true,
    crossScopeSeamingAvailable: false,
    pressAuthoringAvailable: false,
  } as const);

type SuccessfulSelection = Extract<DxfProductPhaseDSizeSelectionResultV1, { ok: true }>;

export type PatternImportDxfPhaseECadSavedMaterialScopeEditorMetadataV1 = Readonly<{
  scopeKey: string;
  label: string;
  fabricPurpose: string;
  bomLineKey: string;
  isInterlining: boolean;
  filename: string;
  writerReplaySchemaVersion: string;
  pieceLineKeys: readonly string[];
  blockNames: readonly string[];
}>;

export type PatternImportDxfPhaseECadSavedPreparedMaterialScopeEditorV1 = Readonly<{
  metadata: PatternImportDxfPhaseECadSavedMaterialScopeEditorMetadataV1;
  scopeKey: string;
  sizeToken: string;
  sourceRevision: number;
  selection: SuccessfulSelection;
  catalog: PatternImportDxfProductPhaseEAuthoringCatalogV1;
  projection: PatternImportDxfProductPhaseEAssemblyProjectionV1;
  compileSource: PatternImportDxfPhaseEDraftCadCompileSourceV1;
}>;

export type PatternImportDxfPhaseECadSavedMaterialScopeEditorActiveV1 = Readonly<{
  scopeKey: string;
  sizeToken: string;
  sourceRevision: number;
  selection: SuccessfulSelection;
  catalog: PatternImportDxfProductPhaseEAuthoringCatalogV1;
  projection: PatternImportDxfProductPhaseEAssemblyProjectionV1;
  compileSource: PatternImportDxfPhaseEDraftCadCompileSourceV1;
}>;

export type PatternImportDxfPhaseECadSavedMaterialScopeEditorPreparationBlockerV1 = Readonly<{
  scopeKey: string | null;
  code:
    | 'saved-editor-scope-set-invalid'
    | 'saved-editor-active-binding-stale'
    | 'saved-editor-scope-preparation-blocked'
    | 'saved-editor-catalog-unavailable'
    | 'saved-editor-preparation-cancelled'
    | 'saved-editor-card-stale'
    | 'saved-editor-preparation-failed';
  detail: string;
}>;

export type PatternImportDxfPhaseECadSavedMaterialScopeEditorPreparationResultV1 =
  | Readonly<{
      ok: true;
      techCardId: number;
      sizeToken: string;
      catalog: Extract<PatternImportDxfPhaseECadMaterialScopeCatalogResultV1, { ok: true }>;
      scopes: readonly PatternImportDxfPhaseECadSavedPreparedMaterialScopeEditorV1[];
      crossScopeSeamingAvailable: false;
      pressAuthoringAvailable: false;
      blocker: null;
      claims: typeof PATTERN_IMPORT_DXF_PHASE_E_CAD_SAVED_MATERIAL_SCOPE_EDITOR_PREPARATION_CLAIMS_V1;
    }>
  | Readonly<{
      ok: false;
      techCardId: number | null;
      sizeToken: string | null;
      catalog: null;
      scopes: readonly [];
      crossScopeSeamingAvailable: false;
      pressAuthoringAvailable: false;
      blocker: PatternImportDxfPhaseECadSavedMaterialScopeEditorPreparationBlockerV1;
      claims: typeof PATTERN_IMPORT_DXF_PHASE_E_CAD_SAVED_MATERIAL_SCOPE_EDITOR_PREPARATION_CLAIMS_V1;
    }>;

type PrepareSaved = typeof preparePatternImportDxfPhaseECadTableZeroOperationSavedV1;

function blocked(
  techCard: common_TechCard | null | undefined,
  sizeToken: string,
  issue: PatternImportDxfPhaseECadSavedMaterialScopeEditorPreparationBlockerV1,
): PatternImportDxfPhaseECadSavedMaterialScopeEditorPreparationResultV1 {
  return Object.freeze({
    ok: false as const,
    techCardId: techCard?.id ?? null,
    sizeToken: sizeToken || null,
    catalog: null,
    scopes: Object.freeze([]) as readonly [],
    crossScopeSeamingAvailable: false as const,
    pressAuthoringAvailable: false as const,
    blocker: Object.freeze(issue),
    claims: PATTERN_IMPORT_DXF_PHASE_E_CAD_SAVED_MATERIAL_SCOPE_EDITOR_PREPARATION_CLAIMS_V1,
  });
}

function uniqueNonEmpty(values: readonly string[]): boolean {
  return values.every((value) => value.trim().length > 0) && new Set(values).size === values.length;
}

function preparedBindingCurrent(
  techCardId: number,
  sizeToken: string,
  prepared: PatternImportDxfPhaseECadSavedMaterialScopeEditorActiveV1,
): boolean {
  const compileScopes = prepared.compileSource.scopes.filter(
    ({ target }) => target.scopeKey === prepared.scopeKey,
  );
  return (
    Number.isSafeInteger(prepared.sourceRevision) &&
    prepared.sourceRevision > 0 &&
    prepared.compileSource.schemaVersion ===
      PATTERN_IMPORT_DXF_PHASE_E_DRAFT_CAD_COMPILE_SOURCE_V1 &&
    prepared.compileSource.techCardId === techCardId &&
    compileScopes.length === 1 &&
    compileScopes[0]?.writerReplay?.schemaVersion ===
      PATTERN_IMPORT_DXF_PRODUCT_WRITER_REPLAY_CARRIER_V1 &&
    prepared.sizeToken === sizeToken &&
    prepared.selection.selection.scopeKey === prepared.scopeKey &&
    prepared.selection.selection.sizeToken === sizeToken &&
    prepared.catalog.techCardId === techCardId &&
    prepared.catalog.scopeKey === prepared.scopeKey &&
    prepared.catalog.sizeToken === sizeToken &&
    prepared.catalog.sourceFileId === prepared.selection.phaseD.source.sourceFileId &&
    prepared.catalog.sizeSelectionCanonicalSha256 ===
      prepared.selection.selection.canonicalSha256 &&
    prepared.projection.sourceFileId === prepared.catalog.sourceFileId &&
    prepared.projection.sizeToken === sizeToken &&
    prepared.projection.expectedCatalogCanonicalSha256 === prepared.catalog.canonicalSha256 &&
    prepared.projection.sizeSelectionCanonicalSha256 ===
      prepared.selection.selection.canonicalSha256
  );
}

function metadataOf(
  choice: Extract<
    ReturnType<typeof listPatternImportDxfPhaseECadTableZeroOperationSavedChoicesV1>,
    { ok: true }
  >['choices'][number],
  prepared: PatternImportDxfPhaseECadSavedMaterialScopeEditorActiveV1,
  filename: string,
): PatternImportDxfPhaseECadSavedMaterialScopeEditorMetadataV1 | null {
  const scope = prepared.compileSource.scopes.filter(
    ({ target }) => target.scopeKey === choice.scopeKey,
  );
  if (
    scope.length !== 1 ||
    scope[0]?.writerReplay?.schemaVersion !== PATTERN_IMPORT_DXF_PRODUCT_WRITER_REPLAY_CARRIER_V1
  )
    return null;
  return Object.freeze({
    scopeKey: choice.scopeKey,
    label: choice.label,
    fabricPurpose: choice.fabricPurpose,
    bomLineKey: choice.bomLineKey,
    isInterlining: choice.isInterlining,
    filename,
    writerReplaySchemaVersion: scope[0].writerReplay.schemaVersion,
    pieceLineKeys: Object.freeze([
      ...new Set(prepared.catalog.pieces.map(({ pieceLineKey }) => pieceLineKey)),
    ]),
    blockNames: Object.freeze([...new Set(prepared.catalog.pieces.map(({ pieceId }) => pieceId))]),
  });
}

/**
 * Prepares a complete raw-free saved material-scope editor set. The already verified active scope
 * is reused; all other scopes pass through the exact saved-row preparation. No partial set escapes.
 */
export async function preparePatternImportDxfPhaseECadSavedMaterialScopeEditorsV1(
  input: Readonly<{
    techCard: common_TechCard;
    orderSizeIds: (ids: number[]) => number[];
    sizeNameById: ReadonlyMap<number, string>;
    sizeToken: string;
    active: PatternImportDxfPhaseECadSavedMaterialScopeEditorActiveV1;
    authority: PatternImportDxfPhaseEZeroOperationSavedCardAuthorityRuntimeV1;
    signal: AbortSignal;
    prepareSaved?: PrepareSaved;
  }>,
): Promise<PatternImportDxfPhaseECadSavedMaterialScopeEditorPreparationResultV1> {
  const fail = (issue: PatternImportDxfPhaseECadSavedMaterialScopeEditorPreparationBlockerV1) =>
    blocked(input.techCard, input.sizeToken, issue);
  const materialScopes = rollGoodsScopes(input.techCard.techCard?.bomItems ?? []);
  const patterns = input.techCard.techCard?.patterns ?? [];
  const bindings = bindingScopes(materialScopes, patterns);
  const expectedScopeKeys = Array.from(
    new Set(
      patterns.map((pattern) =>
        scopeKeyOfBinding(pattern.fabricPurpose, pattern.bomLineKey, bindings),
      ),
    ),
  );
  const choices = listPatternImportDxfPhaseECadTableZeroOperationSavedChoicesV1(
    input.techCard,
    input.orderSizeIds,
    input.sizeNameById,
  );
  const choiceKeys = choices.ok ? choices.choices.map(({ scopeKey }) => scopeKey) : [];
  const filenameByScope = new Map(
    patterns.map((pattern) => [
      scopeKeyOfBinding(pattern.fabricPurpose, pattern.bomLineKey, bindings),
      pattern.filename?.trim() ?? '',
    ]),
  );
  if (
    !input.sizeToken.trim() ||
    !uniqueNonEmpty(expectedScopeKeys) ||
    !uniqueNonEmpty(choiceKeys) ||
    expectedScopeKeys.length !== choiceKeys.length ||
    expectedScopeKeys.some((scopeKey) => !choiceKeys.includes(scopeKey)) ||
    !choiceKeys.includes(input.active.scopeKey)
  )
    return fail({
      scopeKey: null,
      code: 'saved-editor-scope-set-invalid',
      detail:
        choices.ok === false
          ? choices.blocker.detail
          : 'The current saved material scope set is missing, duplicated, ambiguous or does not include the active scope.',
    });
  if (
    !choices.ok ||
    !input.techCard.id ||
    !preparedBindingCurrent(input.techCard.id, input.sizeToken, input.active)
  )
    return fail({
      scopeKey: input.active.scopeKey,
      code: 'saved-editor-active-binding-stale',
      detail: 'The active saved material editor no longer matches its exact card, scope and size.',
    });
  if (input.signal.aborted)
    return fail({
      scopeKey: null,
      code: 'saved-editor-preparation-cancelled',
      detail: 'Saved material-scope editor preparation was cancelled before reconstruction.',
    });

  const activeChoice = choices.choices.find(({ scopeKey }) => scopeKey === input.active.scopeKey)!;
  const activeMetadata = metadataOf(
    activeChoice,
    input.active,
    filenameByScope.get(activeChoice.scopeKey) ?? '',
  );
  if (!activeMetadata)
    return fail({
      scopeKey: input.active.scopeKey,
      code: 'saved-editor-active-binding-stale',
      detail: 'The active saved material editor has no exact detached writer replay.',
    });
  const prepared: PatternImportDxfPhaseECadSavedPreparedMaterialScopeEditorV1[] = [
    Object.freeze({
      metadata: activeMetadata,
      scopeKey: input.active.scopeKey,
      sizeToken: input.active.sizeToken,
      sourceRevision: input.active.sourceRevision,
      selection: input.active.selection,
      catalog: input.active.catalog,
      projection: input.active.projection,
      compileSource: input.active.compileSource,
    }),
  ];
  const prepareSaved =
    input.prepareSaved ?? preparePatternImportDxfPhaseECadTableZeroOperationSavedV1;

  for (const choice of choices.choices) {
    if (choice.scopeKey === input.active.scopeKey) continue;
    if (input.signal.aborted)
      return fail({
        scopeKey: choice.scopeKey,
        code: 'saved-editor-preparation-cancelled',
        detail: `Saved material slot ${choice.scopeKey} was cancelled before reconstruction.`,
      });
    const generationOwner = createPatternImportDxfPhaseECadTableZeroOperationGenerationOwnerV1();
    try {
      const generation = generationOwner.beginSaved(
        `saved-editor:${input.techCard.id}:${input.techCard.lockVersion}:${input.sizeToken}:${choice.scopeKey}`,
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
        return fail({
          scopeKey: choice.scopeKey,
          code: 'saved-editor-preparation-cancelled',
          detail: `Saved material slot ${choice.scopeKey} was cancelled during reconstruction.`,
        });
      if (!saved.ok)
        return fail({
          scopeKey: choice.scopeKey,
          code: 'saved-editor-scope-preparation-blocked',
          detail: `Saved material slot ${choice.scopeKey} could not be reconstructed: ${saved.blocker.detail}`,
        });
      const next: PatternImportDxfPhaseECadSavedMaterialScopeEditorActiveV1 = Object.freeze({
        scopeKey: saved.scopeKey,
        sizeToken: saved.sizeToken,
        sourceRevision: saved.preparationGeneration,
        selection: saved.selection,
        catalog: saved.catalog,
        projection: saved.projection,
        compileSource: saved.draftCadCompileSource,
      });
      if (!preparedBindingCurrent(input.techCard.id, input.sizeToken, next))
        return fail({
          scopeKey: choice.scopeKey,
          code: 'saved-editor-scope-preparation-blocked',
          detail: `Saved material slot ${choice.scopeKey} returned a stale Draft CAD binding.`,
        });
      const metadata = metadataOf(choice, next, filenameByScope.get(choice.scopeKey) ?? '');
      if (!metadata)
        return fail({
          scopeKey: choice.scopeKey,
          code: 'saved-editor-scope-preparation-blocked',
          detail: `Saved material slot ${choice.scopeKey} has no exact detached writer replay.`,
        });
      prepared.push(Object.freeze({ ...next, metadata }));
    } catch (error) {
      return fail({
        scopeKey: choice.scopeKey,
        code: input.signal.aborted
          ? 'saved-editor-preparation-cancelled'
          : 'saved-editor-preparation-failed',
        detail:
          error instanceof Error
            ? `Saved material slot ${choice.scopeKey} could not be reconstructed: ${error.message}`
            : `Saved material slot ${choice.scopeKey} could not be reconstructed.`,
      });
    } finally {
      generationOwner.dispose();
    }
  }

  try {
    const current = await input.authority.resolveCurrentCard(input.techCard.id, input.signal);
    if (
      input.signal.aborted ||
      current.id !== input.techCard.id ||
      current.lockVersion !== input.techCard.lockVersion
    )
      return fail({
        scopeKey: null,
        code: input.signal.aborted
          ? 'saved-editor-preparation-cancelled'
          : 'saved-editor-card-stale',
        detail: input.signal.aborted
          ? 'Saved material-scope editor preparation was cancelled before publication.'
          : 'The saved card changed before the complete material editor set was published.',
      });
  } catch (error) {
    return fail({
      scopeKey: null,
      code: input.signal.aborted ? 'saved-editor-preparation-cancelled' : 'saved-editor-card-stale',
      detail:
        error instanceof Error
          ? `The saved card could not be revalidated: ${error.message}`
          : 'The saved card could not be revalidated.',
    });
  }

  const catalog = buildPatternImportDxfPhaseECadSavedPreparedMaterialScopesCatalogV1({
    techCardId: input.techCard.id,
    scopes: prepared.map(({ metadata, catalog }) => ({
      scope: metadata,
      pieces: catalog.pieces,
    })),
  });
  if (!catalog.ok)
    return fail({
      scopeKey: null,
      code: 'saved-editor-catalog-unavailable',
      detail: catalog.blocker.detail,
    });
  return Object.freeze({
    ok: true as const,
    techCardId: input.techCard.id,
    sizeToken: input.sizeToken,
    catalog,
    scopes: Object.freeze(prepared),
    crossScopeSeamingAvailable: false as const,
    pressAuthoringAvailable: false as const,
    blocker: null,
    claims: PATTERN_IMPORT_DXF_PHASE_E_CAD_SAVED_MATERIAL_SCOPE_EDITOR_PREPARATION_CLAIMS_V1,
  });
}
