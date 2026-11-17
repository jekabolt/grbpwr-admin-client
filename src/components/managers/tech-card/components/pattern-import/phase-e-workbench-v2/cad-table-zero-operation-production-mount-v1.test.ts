import type { common_TechCard } from 'api/proto-http/admin';
import { describe, expect, it, vi } from 'vitest';

import { buildPatternImportDxfProductPhaseEAuthoringCatalogV1 } from 'lib/cloth/domain/pattern-import-dxf-product-phase-e-authoring-catalog-v1';
import { selectPatternImportDxfProductDraftPhaseDSizeV1 } from 'lib/cloth/domain/pattern-import-dxf-product-draft-phase-d-selection-v1';
import { createPatternImportDxfProductSavedRuntimeSeedV1Fixture } from 'lib/cloth/domain/pattern-import-dxf-product-garment-mesh-composer-v2.test-fixture';
import { projectPatternImportDxfProductPhaseEAssemblyV1 } from 'lib/pattern-import/dxf-product-phase-e-assembly-workbench-v1';

import { derivePatternImportDxfPhaseECadTableConnectEdgeSegmentsV1 } from './cad-table-connect-edge-segments-v1';
import { capturePatternImportDxfPhaseECadTableZeroOperationSavedRebindExpectationV1 } from './cad-table-zero-operation-authority-rebind-v1';
import {
  createPatternImportDxfPhaseECadTableZeroConnectControllerStateV1,
  selectPatternImportDxfPhaseECadTableZeroConnectControllerEdgeV1,
  startPatternImportDxfPhaseECadTableZeroConnectControllerV1,
} from './cad-table-zero-connect-controller-v1';
import { capturePatternImportDxfPhaseEZeroConnectPreparedAuthorityV1 } from './cad-table-zero-connect-phase-e-authority-v1';
import type { PatternImportDxfPhaseECadTableZeroOperationFreshPreparationResultV1 } from './cad-table-zero-operation-fresh-preparation-v1';
import { createPatternImportDxfPhaseECadTableZeroOperationGenerationOwnerV1 } from './cad-table-zero-operation-generation-owner-v1';
import { createPatternImportDxfPhaseEZeroConnectPendingHandoffV1 } from './cad-table-zero-connect-post-save-owner-v1';
import {
  createPatternImportDxfPhaseECadTableZeroOperationAuthoringRefreshV1,
  isPatternImportDxfPhaseECadTableZeroOperationAuthoringReadyV1,
  preparePatternImportDxfPhaseECadTableZeroOperationSavedFailoverV1,
  readPatternImportDxfPhaseECurrentSavedCardGateV1,
  resolvePatternImportDxfPhaseECadTableZeroOperationAfterFreshV1,
  resolvePatternImportDxfPhaseECadTableZeroOperationVisibleBlockerV1,
  routePatternImportDxfPhaseECadTableAfterCurrentSavedCardGateV1,
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

async function genuineSavedPrepared(
  importGeneration = 37,
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
    projection: projection.projection,
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

function freshChoices(techCardId: number, ok = true) {
  return ok
    ? (Object.freeze({
        ok: true as const,
        techCardId,
        importGeneration: 37,
        choices: Object.freeze([
          Object.freeze({
            scopeKey: 'main',
            sizes: Object.freeze([Object.freeze({ sizeToken: 'M' })]),
          }),
        ]),
        blocker: null,
      }) as never)
    : (Object.freeze({
        ok: false as const,
        techCardId,
        importGeneration: null,
        choices: Object.freeze([]),
        blocker: Object.freeze({ code: 'fresh-session-invalid', detail: FRESH_DETAIL }),
      }) as never);
}

describe('zero-operation current saved-card gate', () => {
  it('replaces a stale cached projection with the independently read saved DXF', async () => {
    const prepared = await genuineSavedPrepared();
    const currentCard = savedCardWithRow(prepared);
    const sizeNameById = new Map([[7, 'M']]);
    const cachedChoices = listPatternImportDxfPhaseECadTableZeroOperationSavedChoicesV1(
      cachedCardWithoutRow(prepared.techCardId),
      (ids) => ids,
      sizeNameById,
    );
    const resolveCurrentCard = vi.fn(async () => currentCard);

    const gate = await readPatternImportDxfPhaseECurrentSavedCardGateV1({
      techCardId: prepared.techCardId,
      savedAuthority: { resolveCurrentCard } as never,
      orderSizeIds: (ids) => ids,
      sizeNameById,
      signal: new AbortController().signal,
    });
    const routed = routePatternImportDxfPhaseECadTableAfterCurrentSavedCardGateV1({
      techCardId: prepared.techCardId,
      freshChoices: freshChoices(prepared.techCardId),
      cachedSavedChoices: cachedChoices,
      currentSavedCardGate: gate,
    });

    expect(resolveCurrentCard).toHaveBeenCalledOnce();
    expect(gate).toMatchObject({ ok: true, techCard: currentCard, choices: { ok: true } });
    expect(routed).toMatchObject({ mode: 'saved', choices: { ok: true } });
  });

  it('opens a saved DXF after reload without any Phase-E card session', async () => {
    const prepared = await genuineSavedPrepared();
    const currentCard = savedCardWithRow(prepared);
    const sizeNameById = new Map([[7, 'M']]);
    const cachedChoices = listPatternImportDxfPhaseECadTableZeroOperationSavedChoicesV1(
      null,
      (ids) => ids,
      sizeNameById,
    );
    const gate = await readPatternImportDxfPhaseECurrentSavedCardGateV1({
      techCardId: prepared.techCardId,
      savedAuthority: { resolveCurrentCard: vi.fn(async () => currentCard) } as never,
      orderSizeIds: (ids) => ids,
      sizeNameById,
      signal: new AbortController().signal,
    });

    const routed = routePatternImportDxfPhaseECadTableAfterCurrentSavedCardGateV1({
      techCardId: prepared.techCardId,
      freshChoices: freshChoices(prepared.techCardId, false),
      cachedSavedChoices: cachedChoices,
      currentSavedCardGate: gate,
    });

    expect(routed).toMatchObject({ mode: 'saved', choices: { ok: true } });
    expect(JSON.stringify(routed)).not.toContain(FRESH_DETAIL);
  });

  it('reports the authoritative saved-row blocker when the current card has no DXF', async () => {
    const techCardId = 6;
    const sizeNameById = new Map([[7, 'M']]);
    const cachedChoices = listPatternImportDxfPhaseECadTableZeroOperationSavedChoicesV1(
      null,
      (ids) => ids,
      sizeNameById,
    );
    const gate = await readPatternImportDxfPhaseECurrentSavedCardGateV1({
      techCardId,
      savedAuthority: {
        resolveCurrentCard: vi.fn(async () => cachedCardWithoutRow(techCardId)),
      } as never,
      orderSizeIds: (ids) => ids,
      sizeNameById,
      signal: new AbortController().signal,
    });
    const routed = routePatternImportDxfPhaseECadTableAfterCurrentSavedCardGateV1({
      techCardId,
      freshChoices: freshChoices(techCardId, false),
      cachedSavedChoices: cachedChoices,
      currentSavedCardGate: gate,
    });

    expect(gate).toMatchObject({ ok: true, choices: { ok: false } });
    expect(routed).toMatchObject({
      mode: 'saved',
      choices: { ok: false, blocker: { code: 'saved-pattern-unavailable' } },
    });
    expect(JSON.stringify(routed)).not.toContain(FRESH_DETAIL);
  });

  it('remaps the final fresh-session blocker to the authoritative saved-pattern blocker', () => {
    const techCardId = 6;
    const choices = listPatternImportDxfPhaseECadTableZeroOperationSavedChoicesV1(
      cachedCardWithoutRow(techCardId),
      (ids) => ids,
      new Map([[7, 'M']]),
    );
    const blocker = resolvePatternImportDxfPhaseECadTableZeroOperationVisibleBlockerV1({
      techCardId,
      savedCardGateLoading: false,
      preparationBlocker: { code: 'fresh-session-invalid', detail: FRESH_DETAIL },
      currentSavedCardGate: {
        ok: true,
        techCard: cachedCardWithoutRow(techCardId),
        hasCompleteSavedDxfRow: false,
        choices,
      },
    });

    expect(blocker).toMatchObject({ code: 'saved-pattern-unavailable' });
    expect(JSON.stringify(blocker)).not.toContain(FRESH_DETAIL);
  });

  it('never renders a fresh-session blocker after the current card proves a saved row exists', async () => {
    const prepared = await genuineSavedPrepared();
    const techCard = savedCardWithRow(prepared);
    const choices = listPatternImportDxfPhaseECadTableZeroOperationSavedChoicesV1(
      techCard,
      (ids) => ids,
      new Map([[7, 'M']]),
    );
    const blocker = resolvePatternImportDxfPhaseECadTableZeroOperationVisibleBlockerV1({
      techCardId: prepared.techCardId,
      savedCardGateLoading: false,
      preparationBlocker: { code: 'fresh-session-invalid', detail: FRESH_DETAIL },
      currentSavedCardGate: { ok: true, techCard, hasCompleteSavedDxfRow: true, choices },
    });

    expect(choices.ok).toBe(true);
    expect(blocker).toBeNull();
  });

  it('admits a valid fresh session only after the current card proves it has no saved DXF', async () => {
    const techCardId = 6;
    const sizeNameById = new Map([[7, 'M']]);
    const cachedChoices = listPatternImportDxfPhaseECadTableZeroOperationSavedChoicesV1(
      cachedCardWithoutRow(techCardId),
      (ids) => ids,
      sizeNameById,
    );
    const pendingRoute = routePatternImportDxfPhaseECadTableAfterCurrentSavedCardGateV1({
      techCardId,
      freshChoices: freshChoices(techCardId),
      cachedSavedChoices: cachedChoices,
      currentSavedCardGate: null,
    });
    const gate = await readPatternImportDxfPhaseECurrentSavedCardGateV1({
      techCardId,
      savedAuthority: {
        resolveCurrentCard: vi.fn(async () => cachedCardWithoutRow(techCardId)),
      } as never,
      orderSizeIds: (ids) => ids,
      sizeNameById,
      signal: new AbortController().signal,
    });
    const admittedRoute = routePatternImportDxfPhaseECadTableAfterCurrentSavedCardGateV1({
      techCardId,
      freshChoices: freshChoices(techCardId),
      cachedSavedChoices: cachedChoices,
      currentSavedCardGate: gate,
    });

    expect(pendingRoute).toMatchObject({ mode: 'saved' });
    expect(admittedRoute).toMatchObject({ mode: 'fresh' });
  });

  it('does not admit fresh when the current card has a complete saved row but saved choices are blocked', async () => {
    const prepared = await genuineSavedPrepared();
    const withRow = savedCardWithRow(prepared);
    const currentCard = {
      ...withRow,
      techCard: { ...withRow.techCard!, sizeIds: [] },
    } as common_TechCard;
    const cachedChoices = listPatternImportDxfPhaseECadTableZeroOperationSavedChoicesV1(
      null,
      (ids) => ids,
      new Map([[7, 'M']]),
    );
    const gate = await readPatternImportDxfPhaseECurrentSavedCardGateV1({
      techCardId: prepared.techCardId,
      savedAuthority: {
        resolveCurrentCard: vi.fn(async () => currentCard),
      } as never,
      orderSizeIds: (ids) => ids,
      sizeNameById: new Map([[7, 'M']]),
      signal: new AbortController().signal,
    });
    const routed = routePatternImportDxfPhaseECadTableAfterCurrentSavedCardGateV1({
      techCardId: prepared.techCardId,
      freshChoices: freshChoices(prepared.techCardId),
      cachedSavedChoices: cachedChoices,
      currentSavedCardGate: gate,
    });

    expect(gate).toMatchObject({
      ok: true,
      hasCompleteSavedDxfRow: true,
      choices: { ok: false, blocker: { code: 'size-token-unavailable' } },
    });
    expect(routed).toMatchObject({
      mode: 'saved',
      choices: { ok: false, blocker: { code: 'size-token-unavailable' } },
    });
  });

  it('keeps fresh blocked when the independent read is aborted', async () => {
    const techCardId = 6;
    const sizeNameById = new Map([[7, 'M']]);
    const controller = new AbortController();
    controller.abort();
    const cachedChoices = listPatternImportDxfPhaseECadTableZeroOperationSavedChoicesV1(
      cachedCardWithoutRow(techCardId),
      (ids) => ids,
      sizeNameById,
    );
    const gate = await readPatternImportDxfPhaseECurrentSavedCardGateV1({
      techCardId,
      savedAuthority: {
        resolveCurrentCard: vi.fn(async () => cachedCardWithoutRow(techCardId)),
      } as never,
      orderSizeIds: (ids) => ids,
      sizeNameById,
      signal: controller.signal,
    });
    const routed = routePatternImportDxfPhaseECadTableAfterCurrentSavedCardGateV1({
      techCardId,
      freshChoices: freshChoices(techCardId),
      cachedSavedChoices: cachedChoices,
      currentSavedCardGate: gate,
    });

    expect(gate).toMatchObject({
      ok: false,
      choices: { blocker: { code: 'saved-card-current-read-failed' } },
    });
    expect(routed).toMatchObject({ mode: 'saved' });
  });
});

async function genuineControllerAuthority() {
  const prepared = await genuineSavedPrepared(37, 12);
  const refreshed = await genuineSavedPrepared(37, 13);
  const expectation =
    capturePatternImportDxfPhaseECadTableZeroOperationSavedRebindExpectationV1(prepared);
  const refreshOwner = createPatternImportDxfPhaseECadTableZeroOperationAuthoringRefreshV1({
    prepared,
    expectation,
    savedAuthority: {
      resolveLatestCard: vi.fn(async () => ({
        techCard: savedCardWithRow(refreshed),
        row: refreshed.authoringAuthority.row,
      })),
    } as never,
    preparationKey: 'card:6:main:M',
    orderSizeIds: (ids) => ids,
    sizeNameById: new Map([[7, 'M']]),
    prepareSaved: vi.fn(async () => refreshed) as never,
  });
  if (!refreshOwner) throw new Error('The opaque refresh capability was not minted.');
  return {
    prepared,
    authority: Object.freeze({
      catalog: prepared.catalog,
      projection: prepared.projection,
      authoringAuthority: prepared.authoringAuthority,
      authoringAuthorityRefresh: refreshOwner,
    }),
  };
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

  it('refreshes through a strictly newer saved row and returns only the new genuine token', async () => {
    const prepared = await genuineSavedPrepared(37, 12);
    const refreshed = await genuineSavedPrepared(37, 13);
    const expectation =
      capturePatternImportDxfPhaseECadTableZeroOperationSavedRebindExpectationV1(prepared);
    const resolveLatestCard = vi.fn(async () => ({
      techCard: savedCardWithRow(refreshed),
      row: refreshed.authoringAuthority.row,
    }));
    const prepareSaved = vi.fn(async () => refreshed);
    const owner = createPatternImportDxfPhaseECadTableZeroOperationAuthoringRefreshV1({
      prepared,
      expectation,
      savedAuthority: { resolveLatestCard } as never,
      preparationKey: 'card:6:main:M',
      orderSizeIds: (ids) => ids,
      sizeNameById: new Map([[7, 'M']]),
      prepareSaved: prepareSaved as never,
    });

    expect(owner).not.toBeNull();
    const result = await owner!.refresh(new AbortController().signal);
    expect(resolveLatestCard).toHaveBeenCalledWith(
      prepared.authoringAuthority.row,
      expect.any(AbortSignal),
    );
    expect(prepareSaved).toHaveBeenCalledOnce();
    expect(result).toMatchObject({
      ok: true,
      authority: refreshed.authoringAuthority,
      importGeneration: 37,
      blocker: null,
    });
  });

  it('fails closed before reading when refresh is aborted and rejects structural authority', async () => {
    const prepared = await genuineSavedPrepared(37, 12);
    const refreshed = await genuineSavedPrepared(37, 13);
    const expectation =
      capturePatternImportDxfPhaseECadTableZeroOperationSavedRebindExpectationV1(prepared);
    const resolveLatestCard = vi.fn(async () => ({
      techCard: savedCardWithRow(refreshed),
      row: refreshed.authoringAuthority.row,
    }));
    const prepareSaved = vi.fn(async () => ({
      ...refreshed,
      authoringAuthority: { ...refreshed.authoringAuthority },
    }));
    const owner = createPatternImportDxfPhaseECadTableZeroOperationAuthoringRefreshV1({
      prepared,
      expectation,
      savedAuthority: { resolveLatestCard } as never,
      preparationKey: 'card:6:main:M',
      orderSizeIds: (ids) => ids,
      sizeNameById: new Map([[7, 'M']]),
      prepareSaved: prepareSaved as never,
    });
    const controller = new AbortController();
    controller.abort();
    await expect(owner!.refresh(controller.signal)).resolves.toMatchObject({
      ok: false,
      blocker: { code: 'fresh-saved-authority-unavailable' },
    });
    expect(resolveLatestCard).not.toHaveBeenCalled();

    const drifted = await owner!.refresh(new AbortController().signal);
    expect(drifted).toMatchObject({
      ok: false,
      blocker: { code: 'fresh-saved-authority-unavailable' },
    });
  });

  it('rejects a prepared token that resolves after its signal was aborted', async () => {
    const prepared = await genuineSavedPrepared(37, 12);
    const refreshed = await genuineSavedPrepared(37, 13);
    const expectation =
      capturePatternImportDxfPhaseECadTableZeroOperationSavedRebindExpectationV1(prepared);
    let releasePreparation: ((value: SavedPrepared) => void) | null = null;
    const delayedPreparation = new Promise<SavedPrepared>((resolve) => {
      releasePreparation = resolve;
    });
    const prepareSaved = vi.fn(async () => delayedPreparation);
    const owner = createPatternImportDxfPhaseECadTableZeroOperationAuthoringRefreshV1({
      prepared,
      expectation,
      savedAuthority: {
        resolveLatestCard: vi.fn(async () => ({
          techCard: savedCardWithRow(refreshed),
          row: refreshed.authoringAuthority.row,
        })),
      } as never,
      preparationKey: 'card:6:main:M',
      orderSizeIds: (ids) => ids,
      sizeNameById: new Map([[7, 'M']]),
      prepareSaved: prepareSaved as never,
    });
    const controller = new AbortController();
    const pending = owner!.refresh(controller.signal);
    await vi.waitFor(() => expect(prepareSaved).toHaveBeenCalledOnce());
    controller.abort();
    releasePreparation!(refreshed);

    await expect(pending).resolves.toMatchObject({
      ok: false,
      authority: null,
      blocker: { code: 'fresh-saved-authority-unavailable' },
    });
  });

  it('lets only the latest concurrent refresh return authority and consumes it once', async () => {
    const prepared = await genuineSavedPrepared(37, 12);
    const refreshed = await genuineSavedPrepared(37, 13);
    const expectation =
      capturePatternImportDxfPhaseECadTableZeroOperationSavedRebindExpectationV1(prepared);
    let releaseSlow: ((value: SavedPrepared) => void) | null = null;
    const slowPreparation = new Promise<SavedPrepared>((resolve) => {
      releaseSlow = resolve;
    });
    let preparationCalls = 0;
    const prepareSaved = vi.fn(async () => {
      preparationCalls += 1;
      return preparationCalls === 1 ? slowPreparation : refreshed;
    });
    const owner = createPatternImportDxfPhaseECadTableZeroOperationAuthoringRefreshV1({
      prepared,
      expectation,
      savedAuthority: {
        resolveLatestCard: vi.fn(async () => ({
          techCard: savedCardWithRow(refreshed),
          row: refreshed.authoringAuthority.row,
        })),
      } as never,
      preparationKey: 'card:6:main:M',
      orderSizeIds: (ids) => ids,
      sizeNameById: new Map([[7, 'M']]),
      prepareSaved: prepareSaved as never,
    });
    const slow = owner!.refresh(new AbortController().signal);
    await vi.waitFor(() => expect(prepareSaved).toHaveBeenCalledTimes(1));
    const fast = owner!.refresh(new AbortController().signal);

    await expect(fast).resolves.toMatchObject({
      ok: true,
      authority: refreshed.authoringAuthority,
    });
    releaseSlow!(refreshed);
    await expect(slow).resolves.toMatchObject({ ok: false, authority: null });
    await expect(owner!.refresh(new AbortController().signal)).resolves.toMatchObject({
      ok: false,
      authority: null,
      blocker: { code: 'fresh-saved-authority-unavailable' },
    });
  });

  it('captures one exact edge-pair request, appends once and selects the appended row', async () => {
    const { prepared, authority } = await genuineControllerAuthority();
    const segments = derivePatternImportDxfPhaseECadTableConnectEdgeSegmentsV1(prepared.projection);
    const first = segments[0]!;
    const second = segments.find(({ pieceId }) => pieceId !== first.pieceId)!;
    let appendCount = 0;
    let selectedIndex = -1;
    let capturedRequest:
      | Parameters<
          Extract<
            import('./cad-table-zero-connect-authoring-handoff-v1').PatternImportDxfPhaseEZeroConnectAuthoringHandoffOwnerV1,
            { status: 'available' }
          >['ingest']
        >[0]
      | null = null;
    const handoff = {
      status: 'available' as const,
      ingest: (request: NonNullable<typeof capturedRequest>) => {
        capturedRequest = request;
        const pending = createPatternImportDxfPhaseEZeroConnectPendingHandoffV1({
          historyKey: request.candidate.operation.sessionOperationId,
          request,
        });
        if (!pending)
          return {
            ok: false as const,
            inserted: 0 as const,
            historyKey: null,
            sessionRevision: request.session.revision,
            blocker: {
              code: 'zero-connect-authoring-write-refused' as const,
              detail: 'Rejected test request.',
            },
          };
        selectedIndex = appendCount;
        appendCount += 1;
        return {
          ok: true as const,
          inserted: 1 as const,
          historyKey: pending.historyKey,
          sessionRevision: request.session.revision,
          blocker: null,
        };
      },
    };
    let state = startPatternImportDxfPhaseECadTableZeroConnectControllerV1(
      createPatternImportDxfPhaseECadTableZeroConnectControllerStateV1(),
      authority,
    );
    state = selectPatternImportDxfPhaseECadTableZeroConnectControllerEdgeV1(
      state,
      authority,
      first,
      'forward',
      handoff,
    );
    state = selectPatternImportDxfPhaseECadTableZeroConnectControllerEdgeV1(
      state,
      authority,
      second,
      'reverse',
      handoff,
    );

    expect(state.handoffResult).toMatchObject({ ok: true, inserted: 1 });
    expect(appendCount).toBe(1);
    expect(selectedIndex).toBe(0);
    expect(capturedRequest).not.toBeNull();
  });

  it('rejects genuine authority with a fake refresh and a foreign coherent request', async () => {
    const { prepared, authority } = await genuineControllerAuthority();
    const segments = derivePatternImportDxfPhaseECadTableConnectEdgeSegmentsV1(prepared.projection);
    const first = segments[0]!;
    const second = segments.find(({ pieceId }) => pieceId !== first.pieceId)!;
    const ingest = vi.fn();
    const handoff = { status: 'available' as const, ingest };
    const fakeAuthority = {
      ...authority,
      authoringAuthorityRefresh: { refresh: vi.fn() } as never,
    };
    let state = startPatternImportDxfPhaseECadTableZeroConnectControllerV1(
      createPatternImportDxfPhaseECadTableZeroConnectControllerStateV1(),
      fakeAuthority,
    );
    state = selectPatternImportDxfPhaseECadTableZeroConnectControllerEdgeV1(
      state,
      fakeAuthority,
      first,
      'forward',
      handoff,
    );
    state = selectPatternImportDxfPhaseECadTableZeroConnectControllerEdgeV1(
      state,
      fakeAuthority,
      second,
      'reverse',
      handoff,
    );
    expect(ingest).not.toHaveBeenCalled();
    expect(state.handoffResult).toMatchObject({ ok: false, inserted: 0 });

    let genuineRequest: unknown = null;
    const capture = {
      status: 'available' as const,
      ingest: (request: unknown) => {
        genuineRequest = request;
        return {
          ok: true as const,
          inserted: 1 as const,
          historyKey: 'captured',
          sessionRevision: 2,
          blocker: null,
        };
      },
    } as never;
    state = startPatternImportDxfPhaseECadTableZeroConnectControllerV1(
      createPatternImportDxfPhaseECadTableZeroConnectControllerStateV1(),
      authority,
    );
    state = selectPatternImportDxfPhaseECadTableZeroConnectControllerEdgeV1(
      state,
      authority,
      first,
      'forward',
      capture,
    );
    selectPatternImportDxfPhaseECadTableZeroConnectControllerEdgeV1(
      state,
      authority,
      second,
      'reverse',
      capture,
    );
    expect(genuineRequest).not.toBeNull();
    const request = genuineRequest as Parameters<
      typeof createPatternImportDxfPhaseEZeroConnectPendingHandoffV1
    >[0]['request'];
    const foreignRequests = [
      {
        ...request,
        candidate: {
          ...request.candidate,
          source: { ...request.candidate.source, sourceFileId: 'foreign-source' },
        },
      },
      {
        ...request,
        session: {
          ...request.session,
          source: { ...request.session.source, scopeKey: 'foreign-scope' },
        },
      },
      {
        ...request,
        catalog: {
          ...request.catalog,
          canonicalSha256: 'f'.repeat(64),
          sizeSelectionCanonicalSha256: 'e'.repeat(64),
        },
      },
      {
        ...request,
        projection: {
          ...request.projection,
          sourceFileId: 'foreign-source',
          sizeSelectionCanonicalSha256: 'd'.repeat(64),
        },
      },
      {
        ...request,
        candidate: structuredClone(request.candidate),
        session: structuredClone(request.session),
        projection: structuredClone(request.projection),
      },
    ] as readonly (typeof request)[];
    for (const foreignRequest of foreignRequests)
      expect(
        createPatternImportDxfPhaseEZeroConnectPendingHandoffV1({
          historyKey: request.candidate.operation.sessionOperationId,
          request: foreignRequest,
        }),
      ).toBeNull();
  });
});
