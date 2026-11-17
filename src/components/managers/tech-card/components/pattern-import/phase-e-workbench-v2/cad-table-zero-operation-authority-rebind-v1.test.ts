import { describe, expect, it } from 'vitest';

import { buildPatternImportDxfProductPhaseEAuthoringCatalogV1 } from 'lib/cloth/domain/pattern-import-dxf-product-phase-e-authoring-catalog-v1';
import { selectPatternImportDxfProductDraftPhaseDSizeV1 } from 'lib/cloth/domain/pattern-import-dxf-product-draft-phase-d-selection-v1';
import { createPatternImportDxfProductSavedRuntimeSeedV1Fixture } from 'lib/cloth/domain/pattern-import-dxf-product-garment-mesh-composer-v2.test-fixture';

import {
  bindPatternImportDxfPhaseECadTableZeroOperationFreshToSavedAuthorityV1,
  capturePatternImportDxfPhaseECadTableZeroOperationSavedRebindExpectationV1,
  verifyPatternImportDxfPhaseECadTableZeroOperationSavedAuthorityRefreshV1,
} from './cad-table-zero-operation-authority-rebind-v1';
import { capturePatternImportDxfPhaseEZeroConnectPreparedAuthorityV1 } from './cad-table-zero-connect-phase-e-authority-v1';
import type { PatternImportDxfPhaseECadTableZeroOperationFreshPreparationResultV1 } from './cad-table-zero-operation-fresh-preparation-v1';
import { createPatternImportDxfPhaseECadTableZeroOperationGenerationOwnerV1 } from './cad-table-zero-operation-generation-owner-v1';
import type { PatternImportDxfPhaseECadTableZeroOperationSavedPreparationResultV1 } from './cad-table-zero-operation-saved-preparation-v1';

type FreshPrepared = Extract<
  PatternImportDxfPhaseECadTableZeroOperationFreshPreparationResultV1,
  { ok: true }
>;
type SavedPrepared = Extract<
  PatternImportDxfPhaseECadTableZeroOperationSavedPreparationResultV1,
  { ok: true }
>;

async function saved(
  importGeneration = 37,
  rowOverrides: Record<string, unknown> = {},
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
  const row = Object.freeze({
    ...seed.row,
    sha256: selection.selection.pipeline.contentBinding!.sourceSha256,
    ...rowOverrides,
  });
  const owner = createPatternImportDxfPhaseECadTableZeroOperationGenerationOwnerV1();
  const generation = owner.beginFresh(
    `rebind:${importGeneration}:${row.cardLockVersion}`,
    importGeneration,
  );
  const authoringAuthority = capturePatternImportDxfPhaseEZeroConnectPreparedAuthorityV1({
    row,
    draft: seed.draft,
    selection: selection.selection,
    catalog: catalog.catalog,
    generation,
  });
  if (!authoringAuthority) throw new Error('The genuine saved authority fixture was rejected.');
  return Object.freeze({
    ok: true as const,
    techCardId: seed.draft.techCardId,
    scopeKey: 'main',
    sizeToken: 'M',
    preparationGeneration: generation.preparationGeneration,
    importGeneration,
    catalog: catalog.catalog,
    authoringAuthority,
  }) as unknown as SavedPrepared;
}

function fresh(current: SavedPrepared, importGeneration = 37): FreshPrepared {
  return {
    ok: true,
    techCardId: current.techCardId,
    importGeneration,
    scopeKey: current.scopeKey,
    sizeToken: current.sizeToken,
    selection: {
      selection: {
        pipeline: { contentBinding: { sourceSha256: current.authoringAuthority.row.sha256 } },
      },
    },
    catalog: {
      canonicalSha256: current.catalog.canonicalSha256,
      sizeSelectionCanonicalSha256: current.catalog.sizeSelectionCanonicalSha256,
      sourceFileId: current.catalog.sourceFileId,
    },
  } as unknown as FreshPrepared;
}

describe('zero-operation saved authority rebind', () => {
  it('rebinds a fresh preparation only to a genuine opaque saved authority', async () => {
    const current = await saved();
    expect(
      bindPatternImportDxfPhaseECadTableZeroOperationFreshToSavedAuthorityV1(
        fresh(current),
        current,
      ),
    ).toMatchObject({
      ok: true,
      expectation: { source: 'fresh-card-session', importGeneration: 37 },
    });

    const structuralClone = {
      ...current,
      authoringAuthority: { ...current.authoringAuthority },
    } as never;
    expect(
      bindPatternImportDxfPhaseECadTableZeroOperationFreshToSavedAuthorityV1(
        fresh(current),
        structuralClone,
      ),
    ).toMatchObject({ ok: false, blocker: { code: 'fresh-saved-identity-mismatch' } });
  });

  it('rejects source/hash drift and catalog drift', async () => {
    const current = await saved();
    const wrongSource = fresh(current) as {
      selection: { selection: { pipeline: { contentBinding: { sourceSha256: string } } } };
    };
    wrongSource.selection.selection.pipeline.contentBinding.sourceSha256 = 'd'.repeat(64);
    expect(
      bindPatternImportDxfPhaseECadTableZeroOperationFreshToSavedAuthorityV1(
        wrongSource as never,
        current,
      ),
    ).toMatchObject({ ok: false, blocker: { code: 'fresh-saved-identity-mismatch' } });

    const wrongCatalog = fresh(current) as { catalog: { canonicalSha256: string } };
    wrongCatalog.catalog.canonicalSha256 = 'e'.repeat(64);
    expect(
      bindPatternImportDxfPhaseECadTableZeroOperationFreshToSavedAuthorityV1(
        wrongCatalog as never,
        current,
      ),
    ).toMatchObject({ ok: false, blocker: { code: 'fresh-saved-identity-mismatch' } });
  });

  it('preserves the fresh epoch through ordinary-save lock advance and refuses a stale epoch', async () => {
    const current = await saved();
    const bound = bindPatternImportDxfPhaseECadTableZeroOperationFreshToSavedAuthorityV1(
      fresh(current),
      current,
    );
    if (!bound.ok) throw new Error(bound.blocker.detail);
    expect(
      verifyPatternImportDxfPhaseECadTableZeroOperationSavedAuthorityRefreshV1(
        bound.expectation,
        await saved(37, { cardLockVersion: current.authoringAuthority.row.cardLockVersion + 1 }),
      ),
    ).toMatchObject({ ok: true });
    expect(
      verifyPatternImportDxfPhaseECadTableZeroOperationSavedAuthorityRefreshV1(
        bound.expectation,
        await saved(38, { cardLockVersion: current.authoringAuthority.row.cardLockVersion + 1 }),
      ),
    ).toMatchObject({ ok: false, blocker: { code: 'saved-refresh-identity-mismatch' } });
  });

  it('lets saved-open refresh acquire a newer local generation but not a structural row clone', async () => {
    const current = await saved(2);
    const expected =
      capturePatternImportDxfPhaseECadTableZeroOperationSavedRebindExpectationV1(current);
    expect(
      verifyPatternImportDxfPhaseECadTableZeroOperationSavedAuthorityRefreshV1(
        expected,
        await saved(9, { cardLockVersion: current.authoringAuthority.row.cardLockVersion + 1 }),
      ),
    ).toMatchObject({ ok: true });
    const structural = await saved(10, {
      cardLockVersion: current.authoringAuthority.row.cardLockVersion + 1,
    });
    expect(
      verifyPatternImportDxfPhaseECadTableZeroOperationSavedAuthorityRefreshV1(expected, {
        ...structural,
        authoringAuthority: {
          ...structural.authoringAuthority,
          row: { ...structural.authoringAuthority.row },
        },
      } as never),
    ).toMatchObject({ ok: false, blocker: { code: 'saved-refresh-identity-mismatch' } });
  });
});
