import { buildPatternImportDxfProductPhaseEAuthoringCatalogV1 } from 'lib/cloth/domain/pattern-import-dxf-product-phase-e-authoring-catalog-v1';
import { selectPatternImportDxfProductDraftPhaseDSizeV1 } from 'lib/cloth/domain/pattern-import-dxf-product-draft-phase-d-selection-v1';
import { createPatternImportDxfProductSavedRuntimeSeedV1Fixture } from 'lib/cloth/domain/pattern-import-dxf-product-garment-mesh-composer-v2.test-fixture';
import { projectPatternImportDxfProductPhaseEAssemblyV1 } from 'lib/pattern-import/dxf-product-phase-e-assembly-workbench-v1';
import { describe, expect, it, vi } from 'vitest';

import { capturePatternImportDxfPhaseECadTableZeroOperationSavedRebindExpectationV1 } from './cad-table-zero-operation-authority-rebind-v1';
import { createPatternImportDxfPhaseECadTableZeroOperationGenerationOwnerV1 } from './cad-table-zero-operation-generation-owner-v1';
import { createPatternImportDxfPhaseECadTableZeroOperationAuthoringRefreshV1 } from './cad-table-zero-operation-production-mount-v1';
import {
  listPatternImportDxfPhaseECadTableZeroOperationSavedChoicesV1,
  type PatternImportDxfPhaseECadTableZeroOperationSavedPreparationResultV1,
} from './cad-table-zero-operation-saved-preparation-v1';
import { capturePatternImportDxfPhaseEZeroConnectPreparedAuthorityV1 } from './cad-table-zero-connect-phase-e-authority-v1';
import { buildPatternImportDxfPhaseEForeignSavedAliasIdentityOverridesV1 } from './foreign-saved-dxf-alias-identity-adapter-v1';
import {
  PATTERN_IMPORT_DXF_PHASE_E_GOLDEN_SAVED_CARD_FIXTURES_V1,
  clonePatternImportDxfPhaseEGoldenSavedCardV1,
} from './golden-card-6-11-saved-card-fixtures-v1';
import { createPatternImportDxfPhaseEZeroOperationSavedCardAuthorityV1 } from './zero-operation-saved-card-authority-v1';
import { buildPatternImportDxfPhaseESavedCardContextV1 } from './saved-card-production-projection-v1';

const ORDER_SIZE_IDS = (ids: number[]) => [...ids];
type SavedPrepared = Extract<
  PatternImportDxfPhaseECadTableZeroOperationSavedPreparationResultV1,
  { ok: true }
>;

function exactScopeNames(techCardId: 6 | 11): readonly string[] {
  return techCardId === 6
    ? ['TECH_CARD_BOM_PURPOSE_MAIN', 'TECH_CARD_BOM_PURPOSE_POCKETING']
    : ['TECH_CARD_BOM_PURPOSE_MAIN', 'TECH_CARD_BOM_PURPOSE_LINING'];
}

async function genuineSavedPrepared(
  importGeneration = 73,
  cardLockVersion = 12,
): Promise<SavedPrepared> {
  const seed = await createPatternImportDxfProductSavedRuntimeSeedV1Fixture();
  const selection = await selectPatternImportDxfProductDraftPhaseDSizeV1(seed.draft, 'main', 'M');
  if (!selection.ok) throw new Error(selection.blockers[0].detail);
  const catalog = await buildPatternImportDxfProductPhaseEAuthoringCatalogV1(
    seed.draft,
    'main',
    'M',
  );
  if (!catalog.ok) throw new Error(catalog.blockers[0].detail);
  const projection = projectPatternImportDxfProductPhaseEAssemblyV1(
    catalog.catalog,
    selection.selection,
  );
  if (!projection.ok) throw new Error(projection.blockers[0].detail);
  const row = Object.freeze({
    ...seed.row,
    sha256: selection.selection.pipeline.contentBinding!.sourceSha256,
    cardLockVersion,
  });
  const generationOwner = createPatternImportDxfPhaseECadTableZeroOperationGenerationOwnerV1();
  const generation = generationOwner.beginFresh('saved-card-contract:refresh', importGeneration);
  const authoringAuthority = capturePatternImportDxfPhaseEZeroConnectPreparedAuthorityV1({
    row,
    draft: seed.draft,
    selection: selection.selection,
    catalog: catalog.catalog,
    generation,
  });
  if (!authoringAuthority) throw new Error('The genuine saved fixture authority was rejected.');
  return Object.freeze({
    ok: true as const,
    techCardId: seed.draft.techCardId,
    scopeKey: 'main',
    sizeToken: 'M',
    preparationGeneration: generation.preparationGeneration,
    importGeneration,
    choices: Object.freeze([]),
    catalog: catalog.catalog,
    projection: projection.projection,
    authoringAuthority,
    blocker: null,
  }) as unknown as SavedPrepared;
}

describe('cards 6 and 11 sanitized saved-card production contracts', () => {
  it.each(PATTERN_IMPORT_DXF_PHASE_E_GOLDEN_SAVED_CARD_FIXTURES_V1)(
    'admits the exact saved material scopes for card $techCardId',
    (fixture) => {
      const choices = listPatternImportDxfPhaseECadTableZeroOperationSavedChoicesV1(
        fixture.card,
        ORDER_SIZE_IDS,
        fixture.sizeNameById,
      );

      expect(fixture.provenance).toEqual(
        expect.objectContaining({
          kind: 'sanitized-production-contract',
          syntheticAuthority: true,
          capturedProductionSnapshot: false,
        }),
      );
      expect(choices.ok).toBe(true);
      if (!choices.ok) return;
      expect(choices.choices.map(({ scopeKey }) => scopeKey)).toEqual(
        exactScopeNames(fixture.techCardId),
      );
      expect(
        choices.choices.map(({ sizes }) => sizes.map(({ label, rank }) => ({ label, rank }))),
      ).toEqual(
        fixture.scopes.map(() =>
          [...fixture.sizeNameById.values()].map((label, rank) => ({ label, rank })),
        ),
      );
    },
  );

  it.each(PATTERN_IMPORT_DXF_PHASE_E_GOLDEN_SAVED_CARD_FIXTURES_V1)(
    'reads current rows and verifies strict immutable lock advance for card $techCardId',
    async (fixture) => {
      const currentRuntime = createPatternImportDxfPhaseEZeroOperationSavedCardAuthorityV1({
        orderSizeIds: ORDER_SIZE_IDS,
        sizeNameById: fixture.sizeNameById,
        readTechCard: vi.fn(async () => fixture.card),
      });
      const signal = new AbortController().signal;

      await expect(currentRuntime.resolveCurrentCard(fixture.techCardId, signal)).resolves.toBe(
        fixture.card,
      );
      for (const scope of fixture.scopes)
        await expect(currentRuntime.resolveCurrentRow(scope.row, signal)).resolves.toMatchObject({
          row: scope.row,
        });

      const afterSaveRuntime = createPatternImportDxfPhaseEZeroOperationSavedCardAuthorityV1({
        orderSizeIds: ORDER_SIZE_IDS,
        sizeNameById: fixture.sizeNameById,
        readTechCard: vi.fn(async () => fixture.afterSaveCard),
      });
      for (const scope of fixture.scopes)
        await expect(afterSaveRuntime.resolveLatestCard(scope.row, signal)).resolves.toMatchObject({
          techCard: { lockVersion: fixture.afterSaveLockVersion },
          row: { ...scope.row, cardLockVersion: fixture.afterSaveLockVersion },
        });

      for (const lockVersion of [fixture.cardLockVersion, fixture.cardLockVersion - 1]) {
        const nonAdvanced = clonePatternImportDxfPhaseEGoldenSavedCardV1(fixture.card);
        nonAdvanced.lockVersion = lockVersion;
        const nonAdvancedRuntime = createPatternImportDxfPhaseEZeroOperationSavedCardAuthorityV1({
          orderSizeIds: ORDER_SIZE_IDS,
          sizeNameById: fixture.sizeNameById,
          readTechCard: vi.fn(async () => nonAdvanced),
        });
        await expect(
          nonAdvancedRuntime.resolveLatestCard(fixture.scopes[0].row, signal),
        ).rejects.toThrow(/strictly advance/i);
      }
    },
  );

  it.each(PATTERN_IMPORT_DXF_PHASE_E_GOLDEN_SAVED_CARD_FIXTURES_V1)(
    'binds every foreign source family one-to-one for card $techCardId',
    (fixture) => {
      const context = buildPatternImportDxfPhaseESavedCardContextV1(
        fixture.card,
        ORDER_SIZE_IDS,
        fixture.sizeNameById,
      );
      for (const scope of fixture.scopes) {
        const result = buildPatternImportDxfPhaseEForeignSavedAliasIdentityOverridesV1({
          scopeKey: scope.scopeKey,
          mappedSourceRanks: [0, 1, 2, 3, 4],
          families: scope.sourceFamilies,
          aliases: context.existingAliases ?? [],
          pieces: context.existingPieces,
        });
        expect(result.ok).toBe(true);
        if (!result.ok) continue;
        expect(result.bindings).toHaveLength(scope.sourceIdentities.length);
        expect(
          new Set(result.bindings.map(({ sourceBlockIdentity }) => sourceBlockIdentity)).size,
        ).toBe(scope.sourceIdentities.length);
        expect(new Set(result.bindings.map(({ pieceLineKey }) => pieceLineKey)).size).toBe(
          scope.sourceIdentities.length,
        );
      }
    },
  );

  it('preserves card 11 purpose-first LINING over its hostile legacy POCKETING line', async () => {
    const fixture = PATTERN_IMPORT_DXF_PHASE_E_GOLDEN_SAVED_CARD_FIXTURES_V1[1];
    const lining = fixture.scopes.find(
      ({ scopeKey }) => scopeKey === 'TECH_CARD_BOM_PURPOSE_LINING',
    )!;
    const pattern = fixture.card.techCard!.patterns!.find(
      ({ lineKey }) => lineKey === lining.patternLineKey,
    )!;
    expect(pattern.bomLineKey).toBe('01M1PKT1CN2GHWTZ978AD2Z34J');
    expect(pattern.fabricPurpose).toBe('TECH_CARD_BOM_PURPOSE_LINING');

    for (const drift of [undefined, 'TECH_CARD_BOM_PURPOSE_POCKETING']) {
      const hostile = clonePatternImportDxfPhaseEGoldenSavedCardV1(fixture.card);
      const hostilePattern = hostile.techCard!.patterns!.find(
        ({ lineKey }) => lineKey === lining.patternLineKey,
      )!;
      hostilePattern.fabricPurpose = drift as typeof hostilePattern.fabricPurpose;
      const choices = listPatternImportDxfPhaseECadTableZeroOperationSavedChoicesV1(
        hostile,
        ORDER_SIZE_IDS,
        fixture.sizeNameById,
      );
      expect(
        choices.ok && choices.choices.some(({ scopeKey }) => scopeKey === lining.scopeKey),
      ).toBe(false);
      const runtime = createPatternImportDxfPhaseEZeroOperationSavedCardAuthorityV1({
        orderSizeIds: ORDER_SIZE_IDS,
        sizeNameById: fixture.sizeNameById,
        readTechCard: vi.fn(async () => hostile),
      });
      await expect(
        runtime.resolveCurrentRow(lining.row, new AbortController().signal),
      ).rejects.toThrow(/no unique exact saved DXF row/i);
    }
  });

  it('requires the explicit card 11 PCK_BACK_L_1 to PCK_BACK_R alias', () => {
    const fixture = PATTERN_IMPORT_DXF_PHASE_E_GOLDEN_SAVED_CARD_FIXTURES_V1[1];
    const lining = fixture.scopes.find(
      ({ scopeKey }) => scopeKey === 'TECH_CARD_BOM_PURPOSE_LINING',
    )!;
    const exact = lining.aliases.find(({ blockName }) => blockName === 'PCK_BACK_L_1');
    expect(fixture.pieces.find(({ lineKey }) => lineKey === exact?.pieceLineKey)?.name).toBe(
      'PCK_BACK_R',
    );
  });

  it.each(['missing', 'duplicate', 'cross-scope'] as const)(
    'fails closed on a %s stored alias',
    (mode) => {
      const fixture = PATTERN_IMPORT_DXF_PHASE_E_GOLDEN_SAVED_CARD_FIXTURES_V1[0];
      const scope = fixture.scopes[0];
      const hostile = clonePatternImportDxfPhaseEGoldenSavedCardV1(fixture.card);
      const items = hostile.techCard!.pieceDxfAliases!.items!;
      const target = items.find(
        ({ blockName, fabricPurpose }) =>
          blockName === scope.sourceIdentities[0] && fabricPurpose === scope.scopeKey,
      )!;
      if (mode === 'missing')
        hostile.techCard!.pieceDxfAliases!.items = items.filter((alias) => alias !== target);
      else if (mode === 'duplicate') items.push({ ...target });
      else {
        const otherScope = fixture.scopes[1];
        target.fabricPurpose = otherScope.scopeKey as typeof target.fabricPurpose;
        target.bomLineKey = otherScope.bomLineKey;
      }
      const context = buildPatternImportDxfPhaseESavedCardContextV1(
        hostile,
        ORDER_SIZE_IDS,
        fixture.sizeNameById,
      );
      const result = buildPatternImportDxfPhaseEForeignSavedAliasIdentityOverridesV1({
        scopeKey: scope.scopeKey,
        mappedSourceRanks: [0, 1, 2, 3, 4],
        families: scope.sourceFamilies,
        aliases: context.existingAliases ?? [],
        pieces: context.existingPieces,
      });
      expect(result).toMatchObject({
        ok: false,
        blocker: {
          code: mode === 'duplicate' ? 'scope-alias-ambiguous' : 'scope-alias-missing',
        },
      });
    },
  );

  it.each(['revision', 'sha256'] as const)(
    'rejects saved row %s drift after save',
    async (field) => {
      const fixture = PATTERN_IMPORT_DXF_PHASE_E_GOLDEN_SAVED_CARD_FIXTURES_V1[0];
      const scope = fixture.scopes[0];
      const hostile = clonePatternImportDxfPhaseEGoldenSavedCardV1(fixture.afterSaveCard);
      const pattern = hostile.techCard!.patterns!.find(
        ({ lineKey }) => lineKey === scope.patternLineKey,
      )!;
      if (field === 'revision') pattern.savedRowRevision = scope.row.revision + 1;
      else pattern.sha256 = 'f'.repeat(64);
      const runtime = createPatternImportDxfPhaseEZeroOperationSavedCardAuthorityV1({
        orderSizeIds: ORDER_SIZE_IDS,
        sizeNameById: fixture.sizeNameById,
        readTechCard: vi.fn(async () => hostile),
      });
      await expect(
        runtime.resolveLatestCard(scope.row, new AbortController().signal),
      ).rejects.toThrow(/saved DXF row changed/i);
    },
  );

  it('refreshes genuine authoring authority only through the injected strict saved preparation', async () => {
    const prepared = await genuineSavedPrepared(73, 12);
    const refreshed = await genuineSavedPrepared(73, 13);
    const expectation =
      capturePatternImportDxfPhaseECadTableZeroOperationSavedRebindExpectationV1(prepared);
    const fixtureCard = PATTERN_IMPORT_DXF_PHASE_E_GOLDEN_SAVED_CARD_FIXTURES_V1[0].afterSaveCard;
    const prepareSaved = vi.fn(async () => refreshed);
    const resolveLatestCard = vi.fn(async () => ({
      techCard: fixtureCard,
      row: refreshed.authoringAuthority.row,
    }));
    const owner = createPatternImportDxfPhaseECadTableZeroOperationAuthoringRefreshV1({
      prepared,
      expectation,
      savedAuthority: { resolveLatestCard } as never,
      preparationKey: 'saved-card-contract:authoring-refresh',
      orderSizeIds: ORDER_SIZE_IDS,
      sizeNameById: new Map([[7, 'M']]),
      prepareSaved: prepareSaved as never,
    });

    expect(owner).not.toBeNull();
    await expect(owner!.refresh(new AbortController().signal)).resolves.toMatchObject({
      ok: true,
      authority: refreshed.authoringAuthority,
    });
    expect(resolveLatestCard).toHaveBeenCalledWith(
      prepared.authoringAuthority.row,
      expect.any(AbortSignal),
    );
    expect(prepareSaved).toHaveBeenCalledWith(
      expect.objectContaining({ techCard: fixtureCard }),
      expect.any(AbortSignal),
    );
  });
});
