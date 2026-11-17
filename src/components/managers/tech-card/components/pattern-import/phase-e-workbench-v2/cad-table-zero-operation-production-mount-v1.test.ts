import type { common_TechCard } from 'api/proto-http/admin';
import { describe, expect, it, vi } from 'vitest';

import { buildPatternImportDxfProductPhaseEAuthoringCatalogV1 } from 'lib/cloth/domain/pattern-import-dxf-product-phase-e-authoring-catalog-v1';
import { selectPatternImportDxfProductDraftPhaseDSizeV1 } from 'lib/cloth/domain/pattern-import-dxf-product-draft-phase-d-selection-v1';
import { createPatternImportDxfProductSavedRuntimeSeedV1Fixture } from 'lib/cloth/domain/pattern-import-dxf-product-garment-mesh-composer-v2.test-fixture';

import { capturePatternImportDxfPhaseECadTableZeroOperationSavedRebindExpectationV1 } from './cad-table-zero-operation-authority-rebind-v1';
import { capturePatternImportDxfPhaseEZeroConnectPreparedAuthorityV1 } from './cad-table-zero-connect-phase-e-authority-v1';
import type { PatternImportDxfPhaseECadTableZeroOperationFreshPreparationResultV1 } from './cad-table-zero-operation-fresh-preparation-v1';
import { createPatternImportDxfPhaseECadTableZeroOperationGenerationOwnerV1 } from './cad-table-zero-operation-generation-owner-v1';
import {
  isPatternImportDxfPhaseECadTableZeroOperationAuthoringReadyV1,
  preparePatternImportDxfPhaseECadTableZeroOperationSavedFailoverV1,
  resolvePatternImportDxfPhaseECadTableZeroOperationAfterFreshV1,
} from './cad-table-zero-operation-production-mount-v1';
import { listPatternImportDxfPhaseECadTableZeroOperationSavedChoicesV1 } from './cad-table-zero-operation-saved-preparation-v1';
import type { PatternImportDxfPhaseECadTableZeroOperationSavedPreparationResultV1 } from './cad-table-zero-operation-saved-preparation-v1';
import { routePatternImportDxfPhaseECadTableZeroOperationSourceV1 } from './cad-table-zero-operation-source-routing-v1';

const FRESH_DETAIL = 'A current positive Phase-E card session and its detached draft are required.';

type SavedPrepared = Extract<
  PatternImportDxfPhaseECadTableZeroOperationSavedPreparationResultV1,
  { ok: true }
>;
type FreshPrepared = Extract<
  PatternImportDxfPhaseECadTableZeroOperationFreshPreparationResultV1,
  { ok: true }
>;

async function genuineSavedPrepared(importGeneration = 37): Promise<SavedPrepared> {
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
    cardLockVersion: 12,
  });
  const owner = createPatternImportDxfPhaseECadTableZeroOperationGenerationOwnerV1();
  const generation = owner.beginFresh('production-mount:genuine', importGeneration);
  const authoringAuthority = capturePatternImportDxfPhaseEZeroConnectPreparedAuthorityV1({
    row,
    draft: seed.draft,
    selection: selection.selection,
    catalog: catalog.catalog,
    generation,
  });
  if (!authoringAuthority) throw new Error('The production mount fixture authority was rejected.');
  return Object.freeze({
    ok: true as const,
    techCardId: seed.draft.techCardId,
    scopeKey: 'main',
    sizeToken: 'M',
    preparationGeneration: generation.preparationGeneration,
    importGeneration,
    choices: Object.freeze([]),
    catalog: catalog.catalog,
    projection: Object.freeze({}),
    authoringAuthority,
    blocker: null,
  }) as unknown as SavedPrepared;
}

function savedCardWithRow(prepared: SavedPrepared): common_TechCard {
  const row = prepared.authoringAuthority.row;
  return {
    id: prepared.techCardId,
    lockVersion: row.cardLockVersion,
    techCard: {
      sizeIds: [7],
      bomItems: [
        {
          lineKey: 'bom-main',
          name: 'Main fabric',
          section: 'TECH_CARD_BOM_SECTION_FABRIC',
          purpose: 'main',
        },
      ],
      patterns: [
        {
          lineKey: row.patternLineKey,
          fabricPurpose: 'main',
          url: row.url,
          downloadUrl: '/api/p/token/download',
          sizeBytes: row.sizeBytes,
          sha256: row.sha256,
          savedRowRevision: row.revision,
          filename: 'main.dxf',
        },
      ],
      pieces: [],
      pieceDxfAliases: { items: [] },
    },
  } as unknown as common_TechCard;
}

function cachedCardWithoutRow(techCardId: number): common_TechCard {
  return {
    id: techCardId,
    lockVersion: 10,
    techCard: {
      sizeIds: [7],
      bomItems: [
        {
          lineKey: 'bom-main',
          name: 'Main fabric',
          section: 'TECH_CARD_BOM_SECTION_FABRIC',
          purpose: 'main',
        },
      ],
      patterns: [],
      pieces: [],
      pieceDxfAliases: { items: [] },
    },
  } as unknown as common_TechCard;
}

describe('zero-operation production mount fresh-to-saved race failover', () => {
  it('re-reads the saved card after fresh preparation when the row appeared after Host routing', async () => {
    const prepared = await genuineSavedPrepared();
    const latestCard = savedCardWithRow(prepared);
    const sizeNameById = new Map([[7, 'M']]);
    const cachedChoices = listPatternImportDxfPhaseECadTableZeroOperationSavedChoicesV1(
      cachedCardWithoutRow(prepared.techCardId),
      (ids) => ids,
      sizeNameById,
    );
    const freshChoices = Object.freeze({
      ok: true as const,
      techCardId: prepared.techCardId,
      importGeneration: 37,
      choices: Object.freeze([
        Object.freeze({
          scopeKey: 'main',
          sizes: Object.freeze([Object.freeze({ sizeToken: 'M' })]),
        }),
      ]),
      blocker: null,
    }) as never;
    expect(cachedChoices.ok).toBe(false);
    expect(
      routePatternImportDxfPhaseECadTableZeroOperationSourceV1(freshChoices, cachedChoices),
    ).toMatchObject({ mode: 'fresh' });

    const resolveLatestCommittedCard = vi.fn(async () => latestCard);
    const prepareSaved = vi.fn(async ({ techCard }: { techCard: common_TechCard }) => {
      expect(techCard).toBe(latestCard);
      return prepared;
    });
    const owner = createPatternImportDxfPhaseECadTableZeroOperationGenerationOwnerV1();
    const freshPrepared = {
      ok: true,
      techCardId: prepared.techCardId,
      importGeneration: 37,
      scopeKey: 'main',
      sizeToken: 'M',
      selection: {
        selection: {
          pipeline: {
            contentBinding: { sourceSha256: prepared.authoringAuthority.row.sha256 },
          },
        },
      },
      catalog: prepared.catalog,
    } as unknown as FreshPrepared;
    const result = await preparePatternImportDxfPhaseECadTableZeroOperationSavedFailoverV1({
      fresh: freshPrepared,
      expectedCommit: { techCardId: prepared.techCardId, previousLockVersion: 10 },
      savedAuthority: { resolveLatestCommittedCard } as never,
      orderSizeIds: (ids) => ids,
      sizeNameById,
      scopeKey: 'main',
      sizeToken: 'M',
      generation: owner.beginFresh('host-route-then-readback', 37),
      signal: new AbortController().signal,
      prepareSaved: prepareSaved as never,
    });

    expect(resolveLatestCommittedCard).toHaveBeenCalledOnce();
    expect(prepareSaved).toHaveBeenCalledOnce();
    const hostResolution = resolvePatternImportDxfPhaseECadTableZeroOperationAfterFreshV1(
      freshPrepared,
      result,
    );
    expect(hostResolution).toMatchObject({
      result: { ok: true, importGeneration: 37 },
      resolvedSavedCard: { lockVersion: 12 },
      resolvedSource: 'fresh',
      authoringPrepared: { authoringAuthority: prepared.authoringAuthority },
      rebindExpectation: { source: 'fresh-card-session', importGeneration: 37 },
    });
    expect(
      isPatternImportDxfPhaseECadTableZeroOperationAuthoringReadyV1(
        hostResolution.authoringPrepared,
        hostResolution.rebindExpectation,
      ),
    ).toBe(true);

    const failedFreshResolution = resolvePatternImportDxfPhaseECadTableZeroOperationAfterFreshV1(
      {
        ok: false,
        techCardId: prepared.techCardId,
        importGeneration: 37,
        scopeKey: 'main',
        sizeToken: 'M',
        blocker: { code: 'fresh-session-invalid', detail: FRESH_DETAIL },
      } as never,
      result,
    );
    expect(failedFreshResolution).toMatchObject({ resolvedSource: 'saved', result: { ok: true } });
    expect(JSON.stringify(failedFreshResolution)).not.toContain(FRESH_DETAIL);
  });

  it('keeps authoring disabled for structural or drifted authority', async () => {
    const prepared = await genuineSavedPrepared();
    const expectation =
      capturePatternImportDxfPhaseECadTableZeroOperationSavedRebindExpectationV1(prepared);
    expect(
      isPatternImportDxfPhaseECadTableZeroOperationAuthoringReadyV1(prepared, expectation),
    ).toBe(true);
    expect(
      isPatternImportDxfPhaseECadTableZeroOperationAuthoringReadyV1(
        {
          ...prepared,
          authoringAuthority: { ...prepared.authoringAuthority },
        } as never,
        expectation,
      ),
    ).toBe(false);
    expect(
      isPatternImportDxfPhaseECadTableZeroOperationAuthoringReadyV1(prepared, {
        ...expectation,
        sourceFileId: 'drifted-source',
      }),
    ).toBe(false);
  });
});
