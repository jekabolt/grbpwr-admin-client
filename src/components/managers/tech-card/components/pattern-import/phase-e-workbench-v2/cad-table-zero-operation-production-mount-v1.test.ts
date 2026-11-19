import { resolveStrictSeamUpsertReceipt } from '../../assembly-seams/use-seam-decisions';
import type { common_TechCard } from 'api/proto-http/admin';
import { describe, expect, it, vi } from 'vitest';
import { fromWire, toWire, type StoredPose, type StoredSeam } from 'lib/seams';

import { buildPatternImportDxfProductPhaseEAuthoringCatalogV1 } from 'lib/cloth/domain/pattern-import-dxf-product-phase-e-authoring-catalog-v1';
import { selectPatternImportDxfProductDraftPhaseDSizeV1 } from 'lib/cloth/domain/pattern-import-dxf-product-draft-phase-d-selection-v1';
import { createPatternImportDxfProductSavedRuntimeSeedV1Fixture } from 'lib/cloth/domain/pattern-import-dxf-product-garment-mesh-composer-v2.test-fixture';
import { projectPatternImportDxfProductPhaseEAssemblyV1 } from 'lib/pattern-import/dxf-product-phase-e-assembly-workbench-v1';

import { derivePatternImportDxfPhaseECadTableConnectEdgeSegmentsV1 } from './cad-table-connect-edge-segments-v1';
import {
  capturePatternImportDxfPhaseECadTableZeroOperationSavedRebindExpectationV1,
  verifyPatternImportDxfPhaseECadTableZeroOperationSavedAuthorityRefreshV1,
} from './cad-table-zero-operation-authority-rebind-v1';
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
  preparePatternImportDxfPhaseEZeroConnectPostSaveSeamLinkV1,
  preparePatternImportDxfPhaseEZeroConnectStoredSeamV1,
} from './cad-table-zero-connect-post-save-seam-link-v1';
import {
  capturePatternImportDxfPhaseEZeroConnectExistingOperationPendingV1,
  executePatternImportDxfPhaseEZeroConnectExistingOperationAttachOnceV1,
  readPatternImportDxfPhaseEZeroConnectExistingOperationAttachOnceV1,
  revalidatePatternImportDxfPhaseEZeroConnectExistingOperationPendingV1,
  verifyPatternImportDxfPhaseEZeroConnectExistingOperationReadbackV1,
} from './cad-table-zero-connect-existing-operation-attach-v1';
import {
  canReleasePatternImportDxfPhaseEZeroConnectExistingLinkedN1V1,
  capturePatternImportDxfPhaseEZeroConnectExistingLinkedN1PendingV1,
  resolvePatternImportDxfPhaseELinkedN1MetadataResumeDirectionV1,
  executePatternImportDxfPhaseEZeroConnectExistingLinkedN1WriteOnceV1,
  preparePatternImportDxfPhaseEZeroConnectExistingLinkedN1RebindV1,
  readPatternImportDxfPhaseEZeroConnectExistingLinkedN1WriteOnceV1,
  resolvePatternImportDxfPhaseEZeroConnectExistingLinkedN1TargetV1,
  verifyPatternImportDxfPhaseEZeroConnectExistingLinkedN1ReadbackV1,
} from './cad-table-zero-connect-existing-linked-operation-rebind-v1';
import {
  createPatternImportDxfPhaseECadTableZeroOperationAuthoringRefreshV1,
  currentCadTableSavedReviewSizeV1,
  resolveCadTableSavedReviewSizeV1,
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

const FRESH_DETAIL = 'The current DXF workspace is not ready yet.';
const INTERNAL_FRESH_DETAIL =
  'A current positive Phase-E card session and its detached draft are required.';

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
  savedSizes = [
    { sizeId: 45, sizeToken: 'M', label: 'm_48ta_m' },
    { sizeId: 46, sizeToken: 'L', label: 'l_50ta_m' },
  ],
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
    savedSizes,
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
          version: 3,
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

describe('the verified saved review grade in Pattern set', () => {
  const xs = { sizeId: 7, sizeToken: 'XS', label: 'XS', rank: 0 };
  const m = { sizeId: 45, sizeToken: 'M', label: 'M', rank: 1 };
  const l = { sizeId: 46, sizeToken: 'L', label: 'L', rank: 2 };

  it('moves ordinary XS to verified M, allows an explicit override and resets it for a new review', async () => {
    const prepared = await genuineSavedPrepared();
    const card = savedCardWithRow(prepared);
    card.techCard!.sizeIds = [xs.sizeId, m.sizeId, l.sizeId];
    const review = {
      row: prepared.authoringAuthority.row,
      operationNumber: 170,
      sizeId: m.sizeId,
      sizeToken: m.sizeToken,
    };
    const size = currentCadTableSavedReviewSizeV1(review, card, 170);
    expect(size).toBe(review);

    const choices = [xs, m, l];
    const previousXs = { sizeId: xs.sizeId, review: null };
    expect(resolveCadTableSavedReviewSizeV1(choices, previousXs, null)).toEqual({
      selectedSize: xs,
      matchesReview: false,
    });
    expect(resolveCadTableSavedReviewSizeV1(choices, previousXs, size)).toEqual({
      selectedSize: m,
      matchesReview: true,
    });
    const explicitXs = { sizeId: xs.sizeId, review: size };
    expect(resolveCadTableSavedReviewSizeV1(choices, explicitXs, size)).toEqual({
      selectedSize: xs,
      matchesReview: false,
    });
    expect(
      resolveCadTableSavedReviewSizeV1(choices, { sizeId: m.sizeId, review: size }, size),
    ).toEqual({
      selectedSize: m,
      matchesReview: true,
    });
    expect(resolveCadTableSavedReviewSizeV1(choices, explicitXs, { ...review })).toEqual({
      selectedSize: m,
      matchesReview: true,
    });
    expect(resolveCadTableSavedReviewSizeV1(choices, explicitXs, null).selectedSize).toBe(xs);
  });

  it('refuses moved saved authorities and does not substitute another ID with the same size name', async () => {
    const prepared = await genuineSavedPrepared();
    const card = savedCardWithRow(prepared);
    card.techCard!.sizeIds = [xs.sizeId, m.sizeId];
    const review = {
      row: prepared.authoringAuthority.row,
      operationNumber: 170,
      sizeId: m.sizeId,
      sizeToken: m.sizeToken,
    };
    expect(currentCadTableSavedReviewSizeV1(review, card, 171)).toBeNull();
    expect(currentCadTableSavedReviewSizeV1(review, { ...card, lockVersion: 13 }, 170)).toBeNull();
    expect(
      currentCadTableSavedReviewSizeV1(
        { ...review, row: { ...review.row, revision: 99 } },
        card,
        170,
      ),
    ).toBeNull();
    expect(
      currentCadTableSavedReviewSizeV1(
        { ...review, row: { ...review.row, patternLineKey: 'other' } },
        card,
        170,
      ),
    ).toBeNull();
    const sameNameWrongId = { ...m, sizeId: 77 };
    expect(resolveCadTableSavedReviewSizeV1([xs, sameNameWrongId], null, review)).toEqual({
      selectedSize: xs,
      matchesReview: false,
    });
  });
});

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
    expect(JSON.stringify(routed)).not.toContain(INTERNAL_FRESH_DETAIL);
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
    expect(JSON.stringify(routed)).not.toContain(INTERNAL_FRESH_DETAIL);
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
      preparationBlocker: { code: 'fresh-session-invalid', detail: INTERNAL_FRESH_DETAIL },
      currentSavedCardGate: {
        ok: true,
        techCard: cachedCardWithoutRow(techCardId),
        hasCompleteSavedDxfRow: false,
        choices,
      },
    });

    expect(blocker).toMatchObject({ code: 'saved-pattern-unavailable' });
    expect(JSON.stringify(blocker)).not.toContain(FRESH_DETAIL);
    expect(JSON.stringify(blocker)).not.toContain(INTERNAL_FRESH_DETAIL);
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

  it('never renders a fresh-session blocker when the authoritative saved-card read fails', () => {
    const techCardId = 6;
    const savedReadBlocker = {
      ok: false as const,
      techCard: null,
      hasCompleteSavedDxfRow: null,
      choices: {
        ok: false as const,
        techCardId,
        choices: Object.freeze([]) as readonly [],
        blocker: {
          code: 'saved-card-current-read-failed' as const,
          detail: 'The current saved card could not be read before opening the table.',
        },
      },
    };
    const blocker = resolvePatternImportDxfPhaseECadTableZeroOperationVisibleBlockerV1({
      techCardId,
      savedCardGateLoading: false,
      preparationBlocker: { code: 'fresh-session-invalid', detail: FRESH_DETAIL },
      currentSavedCardGate: savedReadBlocker,
    });

    expect(blocker).toMatchObject({ code: 'saved-card-current-read-failed' });
    expect(JSON.stringify(blocker)).not.toContain(FRESH_DETAIL);
  });

  it('keeps the internal fresh-session blocker hidden until the saved-card gate settles', () => {
    const blocker = resolvePatternImportDxfPhaseECadTableZeroOperationVisibleBlockerV1({
      techCardId: 6,
      savedCardGateLoading: false,
      preparationBlocker: { code: 'fresh-session-invalid', detail: FRESH_DETAIL },
      currentSavedCardGate: null,
    });

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
    expect(
      routePatternImportDxfPhaseECadTableAfterCurrentSavedCardGateV1({
        techCardId,
        freshChoices: freshChoices(techCardId + 1),
        cachedSavedChoices: cachedChoices,
        currentSavedCardGate: gate,
      }),
    ).toMatchObject({ mode: 'saved', choices: { ok: false } });
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

async function genuineZeroConnectRequest() {
  const { prepared, authority } = await genuineControllerAuthority();
  const segments = derivePatternImportDxfPhaseECadTableConnectEdgeSegmentsV1(prepared.projection);
  const first = segments[0]!;
  const second = segments.find(({ pieceId }) => pieceId !== first.pieceId)!;
  type GenuineRequest = Parameters<
    Extract<
      import('./cad-table-zero-connect-authoring-handoff-v1').PatternImportDxfPhaseEZeroConnectAuthoringHandoffOwnerV1,
      { status: 'available' }
    >['ingest']
  >[0];
  let request: GenuineRequest | null = null;
  const handoff = {
    status: 'available' as const,
    ingest: (current: NonNullable<typeof request>) => {
      request = current;
      return {
        ok: true as const,
        inserted: 0 as const,
        historyKey: 'existing-op',
        sessionRevision: current.session.revision,
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
  selectPatternImportDxfPhaseECadTableZeroConnectControllerEdgeV1(
    state,
    authority,
    second,
    'reverse',
    handoff,
  );
  const capturedRequest = request as unknown as GenuineRequest | null;
  if (!capturedRequest) throw new Error('The genuine zero-connect request was not captured.');
  return { prepared, request: capturedRequest };
}

describe('existing saved empty operation zero-connect attach', () => {
  it('preserves the existing AO history key and prepares exact anchors from the gesture', async () => {
    const { prepared, request } = await genuineZeroConnectRequest();
    const inputKeys = request.candidate.connection.sides.map(({ pieceLineKey }) => pieceLineKey);
    const savedCard = savedCardWithRow(prepared);
    savedCard.techCard!.operations = [{ operationNumber: 41, inputKeys, seamKeys: [] } as never];
    const captured = capturePatternImportDxfPhaseEZeroConnectExistingOperationPendingV1({
      request,
      techCardId: prepared.techCardId,
      selectedIndex: 0,
      liveOperations: [{ historyKey: 'existing-op', operationNumber: 41, inputKeys, seamKeys: [] }],
      savedCard,
      seamWriterCardId: prepared.techCardId,
      seamWriterLockVersion: savedCard.lockVersion,
    });
    if (!captured.ok) throw new Error(captured.blocker.detail);
    expect(captured.pending.historyKey).not.toBe(request.candidate.operation.sessionOperationId);
    const geometry = {
      candidate: request.candidate,
      catalog: request.catalog,
      projection: request.projection,
      direction: 'reversed' as const,
      nameOf: (lineKey: string) => lineKey,
      grainDeg: null,
    };
    expect(
      preparePatternImportDxfPhaseEZeroConnectPostSaveSeamLinkV1({
        ...geometry,
        savedOperation: {
          status: 'same-session-saved-draft-operation',
          historyKey: captured.pending.historyKey,
          operationNumber: 41,
        },
      }),
    ).toMatchObject({ ok: false, blocker: { code: 'saved-operation-correlation-mismatch' } });
    const result = preparePatternImportDxfPhaseEZeroConnectStoredSeamV1(geometry);
    expect(result).toMatchObject({
      ok: true,
      storedSeam: {
        direction: 'reversed',
        anchoredSize: prepared.sizeToken,
        sideA: [{ piece: inputKeys[0] }],
        sideB: [{ piece: inputKeys[1] }],
      },
    });
  });

  it('captures only the exact empty saved operation and rejects live or saved drift', async () => {
    const { prepared, request } = await genuineZeroConnectRequest();
    const inputKeys = request.candidate.connection.sides.map(({ pieceLineKey }) => pieceLineKey);
    const liveOperations = [
      { historyKey: 'existing-op', operationNumber: 41, inputKeys, seamKeys: [] },
    ];
    const savedCard = savedCardWithRow(prepared);
    savedCard.techCard!.operations = [{ operationNumber: 41, inputKeys, seamKeys: [] } as never];
    const captured = capturePatternImportDxfPhaseEZeroConnectExistingOperationPendingV1({
      request,
      techCardId: prepared.techCardId,
      selectedIndex: 0,
      liveOperations,
      savedCard,
      seamWriterCardId: prepared.techCardId,
      seamWriterLockVersion: savedCard.lockVersion,
    });

    expect(captured).toMatchObject({
      ok: true,
      operationIndex: 0,
      pending: { operationNumber: 41, historyKey: 'existing-op' },
    });
    if (!captured.ok) throw new Error(captured.blocker.detail);
    expect(
      revalidatePatternImportDxfPhaseEZeroConnectExistingOperationPendingV1(captured.pending, {
        techCardId: prepared.techCardId,
        selectedIndex: 0,
        liveOperations: [{ ...liveOperations[0]!, seamKeys: ['stale-seam'] }],
        savedCard,
        seamWriterCardId: prepared.techCardId,
        seamWriterLockVersion: savedCard.lockVersion,
      }),
    ).toMatchObject({ ok: false, blocker: { code: 'existing-operation-not-empty' } });
    savedCard.techCard!.operations = [
      { operationNumber: 41, inputKeys, seamKeys: [] } as never,
      { operationNumber: 41, inputKeys, seamKeys: [] } as never,
    ];
    expect(
      revalidatePatternImportDxfPhaseEZeroConnectExistingOperationPendingV1(captured.pending, {
        techCardId: prepared.techCardId,
        selectedIndex: 0,
        liveOperations,
        savedCard,
        seamWriterCardId: prepared.techCardId,
        seamWriterLockVersion: savedCard.lockVersion,
      }),
    ).toMatchObject({ ok: false, blocker: { code: 'existing-operation-ambiguous' } });
  });

  it('issues one atomic writer call and requires a fresh exact operation-link readback', async () => {
    const { prepared, request } = await genuineZeroConnectRequest();
    const inputKeys = request.candidate.connection.sides.map(({ pieceLineKey }) => pieceLineKey);
    const savedCard = savedCardWithRow(prepared);
    savedCard.techCard!.operations = [{ operationNumber: 41, inputKeys, seamKeys: [] } as never];
    const captured = capturePatternImportDxfPhaseEZeroConnectExistingOperationPendingV1({
      request,
      techCardId: prepared.techCardId,
      selectedIndex: 0,
      liveOperations: [{ historyKey: 'existing-op', operationNumber: 41, inputKeys, seamKeys: [] }],
      savedCard,
      seamWriterCardId: prepared.techCardId,
      seamWriterLockVersion: savedCard.lockVersion,
    });
    if (!captured.ok) throw new Error(captured.blocker.detail);
    const atomicWrite = vi.fn(async () => ({ ok: true as const, key: 'seam-final' }));
    expect(
      readPatternImportDxfPhaseEZeroConnectExistingOperationAttachOnceV1(captured.pending, 'same'),
    ).toBeUndefined();
    const first = executePatternImportDxfPhaseEZeroConnectExistingOperationAttachOnceV1(
      captured.pending,
      'same',
      atomicWrite,
    );
    const second = executePatternImportDxfPhaseEZeroConnectExistingOperationAttachOnceV1(
      captured.pending,
      'same',
      atomicWrite,
    );
    const conflicting = executePatternImportDxfPhaseEZeroConnectExistingOperationAttachOnceV1(
      captured.pending,
      'reversed',
      atomicWrite,
    );
    expect(first).not.toBeNull();
    expect(second).not.toBeNull();
    expect(conflicting).toBeNull();
    expect(
      readPatternImportDxfPhaseEZeroConnectExistingOperationAttachOnceV1(captured.pending, 'same'),
    ).toBe(first);
    await expect(first!).resolves.toEqual({ ok: true, key: 'seam-final' });
    await expect(second!).resolves.toEqual({ ok: true, key: 'seam-final' });
    expect(atomicWrite).toHaveBeenCalledOnce();

    const freshCard = savedCardWithRow(prepared);
    freshCard.lockVersion = (savedCard.lockVersion ?? 0) + 1;
    const expectedSeam: StoredSeam = {
      seamKey: 'submitted-seam',
      status: 'confirmed',
      kind: 'edge',
      direction: 'same',
      source: 'manual',
      sideA: [
        {
          piece: inputKeys[0]!,
          samples: [[0, 0]],
          perimShare: 0.5,
          lenMm: 120,
          notches: 0,
          turnDeg: 0,
          range: [0, 1],
          edgeHint: 'front:v0-v1',
          contourSig: 'front-contour',
        },
      ],
      sideB: [
        {
          piece: inputKeys[1]!,
          samples: [[1, 0]],
          perimShare: 0.5,
          lenMm: 120,
          notches: 0,
          turnDeg: 0,
          range: [0, 1],
          edgeHint: 'back:v1-v0',
          contourSig: 'back-contour',
        },
      ],
      anchoredSize: 'M',
      note: '2D table exact connection',
    };
    freshCard.seams = [toWire({ ...expectedSeam, seamKey: 'seam-final' })] as never;
    freshCard.techCard!.operations = [
      { operationNumber: 41, inputKeys, seamKeys: ['seam-final'] } as never,
    ];
    expect(
      verifyPatternImportDxfPhaseEZeroConnectExistingOperationReadbackV1({
        pending: captured.pending,
        accepted: { ok: true, key: 'seam-final' },
        expectedSeam,
        freshCard,
      }),
    ).toMatchObject({ ok: true, seamKey: 'seam-final' });
    expect(
      verifyPatternImportDxfPhaseEZeroConnectExistingOperationReadbackV1({
        pending: captured.pending,
        accepted: { ok: false, why: 'the server answer was lost' },
        expectedSeam,
        freshCard,
      }),
    ).toMatchObject({ ok: true, seamKey: 'seam-final' });
    freshCard.seams = [];
    expect(
      verifyPatternImportDxfPhaseEZeroConnectExistingOperationReadbackV1({
        pending: captured.pending,
        accepted: { ok: true, key: 'seam-final' },
        expectedSeam,
        freshCard,
      }),
    ).toMatchObject({
      ok: false,
      blocker: { code: 'existing-operation-readback-mismatch' },
    });
    freshCard.seams = [toWire({ ...expectedSeam, seamKey: 'seam-final' })] as never;
    freshCard.techCard!.operations![0]!.seamKeys = ['seam-final', 'duplicate'];
    expect(
      verifyPatternImportDxfPhaseEZeroConnectExistingOperationReadbackV1({
        pending: captured.pending,
        accepted: { ok: true, key: 'seam-final' },
        expectedSeam,
        freshCard,
      }),
    ).toMatchObject({
      ok: false,
      blocker: { code: 'existing-operation-readback-mismatch' },
    });
    freshCard.techCard!.operations![0]!.seamKeys = ['seam-final'];
    freshCard.seams = [
      toWire({ ...expectedSeam, seamKey: 'seam-final', direction: 'reversed' }),
    ] as never;
    expect(
      verifyPatternImportDxfPhaseEZeroConnectExistingOperationReadbackV1({
        pending: captured.pending,
        accepted: { ok: true, key: 'seam-final' },
        expectedSeam,
        freshCard,
      }),
    ).toMatchObject({
      ok: false,
      blocker: { code: 'existing-operation-readback-mismatch' },
    });
    freshCard.seams = [
      toWire({
        ...expectedSeam,
        seamKey: 'seam-final',
        sideA: expectedSeam.sideB,
        sideB: expectedSeam.sideA,
      }),
    ] as never;
    expect(
      verifyPatternImportDxfPhaseEZeroConnectExistingOperationReadbackV1({
        pending: captured.pending,
        accepted: { ok: true, key: 'seam-final' },
        expectedSeam,
        freshCard,
      }),
    ).toMatchObject({
      ok: false,
      blocker: { code: 'existing-operation-readback-mismatch' },
    });
  });
});

describe('existing saved one-physical-seam operation exact rebind', () => {
  async function existingLinkedN1Fixture() {
    const { prepared, request } = await genuineZeroConnectRequest();
    const inputKeys = request.candidate.connection.sides.map(({ pieceLineKey }) => pieceLineKey);
    const seam: StoredSeam = {
      seamKey: 'existing-edge',
      status: 'confirmed',
      kind: 'edge',
      direction: 'same',
      source: 'manual',
      sideA: [
        {
          piece: inputKeys[0]!,
          samples: [[0, 0]],
          perimShare: 0.5,
          lenMm: 120,
          notches: 0,
          turnDeg: 0,
          range: [0, 1],
          edgeHint: 'legacy-a',
          contourSig: 'legacy-a-contour',
          placement: { xMm: 0, yMm: 1, rotDeg: 5, flip: false },
          layer: 'over',
        },
      ],
      sideB: [
        {
          piece: inputKeys[1]!,
          samples: [[1, 0]],
          perimShare: 0.5,
          lenMm: 120,
          notches: 0,
          turnDeg: 0,
          range: [0, 1],
          edgeHint: 'legacy-b',
          contourSig: 'legacy-b-contour',
        },
      ],
      anchoredSize: '',
      note: 'legacy exact connection',
    };
    const pose: StoredPose = {
      ...seam,
      seamKey: 'existing-pose',
      kind: 'pose',
      sideA: [
        {
          ...seam.sideA[0]!,
          placement: { xMm: 10, yMm: 20, rotDeg: 5, flip: false },
        },
      ],
      sideB: [seam.sideB[0]!],
      note: 'keep this placement row',
    };
    const savedOperations = Array.from({ length: 71 }, (_, index) => {
      const operationNumber = (index + 1) * 10;
      return {
        operationNumber,
        inputKeys: operationNumber === 30 ? inputKeys : [],
        seamKeys: operationNumber === 30 ? [seam.seamKey, pose.seamKey] : [],
      };
    });
    const liveOperations = savedOperations.map((operation) => ({
      ...structuredClone(operation),
      historyKey: `operation-${operation.operationNumber}`,
    }));
    const savedCard = savedCardWithRow(prepared);
    savedCard.techCard!.operations = structuredClone(savedOperations) as never;
    savedCard.seams = [toWire(seam), toWire(pose)] as never;
    return {
      prepared,
      request,
      inputKeys,
      seam,
      pose,
      savedOperations,
      liveOperations,
      savedCard,
      selectedIndex: 2,
    };
  }

  it('captures one physical seam while preserving its linked placement row and all 71 operations', async () => {
    const fixture = await existingLinkedN1Fixture();
    const captured = capturePatternImportDxfPhaseEZeroConnectExistingLinkedN1PendingV1({
      request: fixture.request,
      techCardId: fixture.prepared.techCardId,
      selectedIndex: fixture.selectedIndex,
      liveOperations: fixture.liveOperations,
      savedCard: fixture.savedCard,
      currentRows: [fixture.seam, fixture.pose],
      seamWriterCardId: fixture.prepared.techCardId,
      seamWriterLockVersion: fixture.savedCard.lockVersion,
    });

    expect(captured).toMatchObject({
      ok: true,
      operationIndex: 2,
      pending: {
        target: {
          operationNumber: 30,
          seamKey: 'existing-edge',
          orderedRowKeys: ['existing-edge', 'existing-pose'],
          operationCount: 71,
        },
      },
    });
    if (!captured.ok) throw new Error(captured.blocker.detail);
    const exact = preparePatternImportDxfPhaseEZeroConnectExistingLinkedN1RebindV1(
      captured.pending,
      'reversed',
      { nameOf: (key) => key, grainDeg: null },
    );
    expect(exact).toMatchObject({
      ok: true,
      receipt: {
        storedSeam: {
          sideA: [{ layer: 'over', placement: fixture.seam.sideA[0]?.placement }],
          seamKey: fixture.seam.seamKey,
          anchoredSize: 'M',
        },
      },
    });
  });

  it('rejects a legacy numeric spelling shared with another card rank and invalidates pending authority on rank drift', async () => {
    const original = await genuineSavedPrepared();
    const rank = { sizeId: 45, sizeToken: 'M', label: 'm_48ta_m' };
    const competing = await genuineSavedPrepared(37, 12, [
      rank,
      { sizeId: 35, sizeToken: '48', label: '48' },
    ]);
    expect(original.authoringAuthority.selectedRank).toEqual({
      sizeId: 45,
      spellings: ['48', 'm'],
    });
    expect(competing.authoringAuthority.selectedRank).toEqual({ sizeId: 45, spellings: ['m'] });
    const ambiguous = await genuineSavedPrepared(37, 12, [
      rank,
      { sizeId: 39, sizeToken: 'M', label: 'm_38ta_f' },
    ]);
    expect(ambiguous.authoringAuthority.selectedRank.spellings).toHaveLength(0);
    const otherId = await genuineSavedPrepared(37, 12, [{ ...rank, sizeId: 39 }]);
    const expected =
      capturePatternImportDxfPhaseECadTableZeroOperationSavedRebindExpectationV1(original);
    for (const wrong of [competing, ambiguous, otherId])
      expect(
        verifyPatternImportDxfPhaseECadTableZeroOperationSavedAuthorityRefreshV1(expected, wrong)
          .ok,
      ).toBe(false);
  });

  it('rebinds a stale anchored seam only from its original rank and unique operation owner', async () => {
    const fixture = await existingLinkedN1Fixture();
    const rank = fixture.request.catalog.sizeToken;
    const staleSeam = { ...fixture.seam, anchoredSize: rank, stale: true };
    const card = structuredClone(fixture.savedCard);
    card.seams = [{ ...toWire(staleSeam), stale: true }, toWire(fixture.pose)] as never;
    const inputs = {
      request: fixture.request,
      techCardId: fixture.prepared.techCardId,
      selectedIndex: fixture.selectedIndex,
      liveOperations: fixture.liveOperations,
      savedCard: card,
      currentRows: [staleSeam, fixture.pose],
      seamWriterCardId: fixture.prepared.techCardId,
      seamWriterLockVersion: card.lockVersion,
    };
    const capture = capturePatternImportDxfPhaseEZeroConnectExistingLinkedN1PendingV1;
    const captured = capture(inputs);
    if (!captured.ok) throw new Error(captured.blocker.detail);
    const context = { nameOf: (key: string) => key, grainDeg: null };
    expect(
      resolvePatternImportDxfPhaseELinkedN1MetadataResumeDirectionV1(
        captured.pending,
        card,
        context,
      ),
    ).toBeNull();
    const rebind = preparePatternImportDxfPhaseEZeroConnectExistingLinkedN1RebindV1(
      captured.pending,
      'reversed',
      context,
    );
    if (!rebind.ok) throw new Error(rebind.blocker.detail);
    expect(rebind.receipt.storedSeam).toMatchObject({
      seamKey: staleSeam.seamKey,
      anchoredSize: rank,
      direction: 'reversed',
    });
    expect(rebind.receipt.storedSeam.sideA[0]!.contourSig).not.toBe(staleSeam.sideA[0]!.contourSig);
    expect(rebind.receipt.storedSeam.sideB[0]!.contourSig).not.toBe(staleSeam.sideB[0]!.contourSig);
    for (const spelling of ['m', '48', '<M>']) {
      const legacy = { ...staleSeam, anchoredSize: spelling };
      const saved = structuredClone(card);
      saved.seams![0]!.anchoredSize = spelling;
      expect(capture({ ...inputs, currentRows: [legacy, fixture.pose], savedCard: saved }).ok).toBe(
        true,
      );
    }
    const wrongRank = { ...staleSeam, anchoredSize: 'L' };
    expect(rank).toBe('M');
    const other = structuredClone(card);
    other.seams![0]!.anchoredSize = wrongRank.anchoredSize;
    expect(
      capture({ ...inputs, currentRows: [wrongRank, fixture.pose], savedCard: other }),
    ).toMatchObject({
      ok: false,
      blocker: { code: 'existing-linked-n1-source-size-invalid' },
    });
    const conflicting = structuredClone(card);
    conflicting.techCard!.operations![0]!.seamKeys = [staleSeam.seamKey.toUpperCase()];
    const localConflict = structuredClone(fixture.liveOperations);
    localConflict[0]!.seamKeys = [staleSeam.seamKey];
    for (const conflict of [{ savedCard: conflicting }, { liveOperations: localConflict }])
      expect(capture({ ...inputs, ...conflict })).toMatchObject({
        ok: false,
        blocker: { code: 'existing-linked-n1-seam-ambiguous' },
      });
  });

  it('fails closed on stale CAS, row-key drift, input reorder, or a second physical seam', async () => {
    const fixture = await existingLinkedN1Fixture();
    const base = {
      techCardId: fixture.prepared.techCardId,
      selectedIndex: fixture.selectedIndex,
      liveOperations: fixture.liveOperations,
      savedCard: fixture.savedCard,
      currentRows: [fixture.seam, fixture.pose],
      seamWriterCardId: fixture.prepared.techCardId,
      seamWriterLockVersion: fixture.savedCard.lockVersion,
    };
    expect(
      resolvePatternImportDxfPhaseEZeroConnectExistingLinkedN1TargetV1({
        ...base,
        seamWriterLockVersion: (fixture.savedCard.lockVersion ?? 0) - 1,
      }),
    ).toMatchObject({ ok: false, blocker: { code: 'existing-linked-n1-writer-stale' } });
    expect(
      resolvePatternImportDxfPhaseEZeroConnectExistingLinkedN1TargetV1({
        ...base,
        liveOperations: fixture.liveOperations.map((operation, index) =>
          index === fixture.selectedIndex
            ? { ...operation, seamKeys: ['other-edge', fixture.pose.seamKey] }
            : operation,
        ),
      }),
    ).toMatchObject({ ok: false, blocker: { code: 'existing-linked-n1-operation-not-n1' } });
    expect(
      resolvePatternImportDxfPhaseEZeroConnectExistingLinkedN1TargetV1({
        ...base,
        liveOperations: fixture.liveOperations.map((operation, index) =>
          index === fixture.selectedIndex
            ? { ...operation, inputKeys: [...fixture.inputKeys].reverse() }
            : operation,
        ),
      }),
    ).toMatchObject({ ok: false, blocker: { code: 'existing-linked-n1-input-mismatch' } });
    const secondPhysical = { ...fixture.seam, seamKey: 'second-edge' };
    const savedWithSecond = structuredClone(fixture.savedCard);
    savedWithSecond.seams = [
      toWire(fixture.seam),
      toWire(fixture.pose),
      toWire(secondPhysical),
    ] as never;
    savedWithSecond.techCard!.operations![fixture.selectedIndex]!.seamKeys = [
      fixture.seam.seamKey,
      fixture.pose.seamKey,
      secondPhysical.seamKey,
    ];
    expect(
      resolvePatternImportDxfPhaseEZeroConnectExistingLinkedN1TargetV1({
        ...base,
        savedCard: savedWithSecond,
        currentRows: [fixture.seam, fixture.pose, secondPhysical],
        liveOperations: fixture.liveOperations.map((operation, index) =>
          index === fixture.selectedIndex
            ? {
                ...operation,
                seamKeys: [fixture.seam.seamKey, fixture.pose.seamKey, secondPhysical.seamKey],
              }
            : operation,
        ),
      }),
    ).toMatchObject({ ok: false, blocker: { code: 'existing-linked-n1-operation-not-n1' } });
  });

  it('retains one writer, rejects a direction race, and verifies exact readback without changing order', async () => {
    const fixture = await existingLinkedN1Fixture();
    const captured = capturePatternImportDxfPhaseEZeroConnectExistingLinkedN1PendingV1({
      request: fixture.request,
      techCardId: fixture.prepared.techCardId,
      selectedIndex: fixture.selectedIndex,
      liveOperations: fixture.liveOperations,
      savedCard: fixture.savedCard,
      currentRows: [fixture.seam, fixture.pose],
      seamWriterCardId: fixture.prepared.techCardId,
      seamWriterLockVersion: fixture.savedCard.lockVersion,
    });
    if (!captured.ok) throw new Error(captured.blocker.detail);
    const persisted = { ...fixture.seam, anchoredSize: 'M', direction: 'reversed' as const };
    const accepted = Object.freeze({
      ok: true as const,
      row: persisted,
      seamKey: persisted.seamKey,
      lockVersion: (fixture.savedCard.lockVersion ?? 0) + 1,
      outcome: 'verified-echo' as const,
      blocker: null,
    });
    const write = vi.fn(async () => accepted);
    const first = executePatternImportDxfPhaseEZeroConnectExistingLinkedN1WriteOnceV1(
      captured.pending,
      'reversed',
      write,
    );
    const same = executePatternImportDxfPhaseEZeroConnectExistingLinkedN1WriteOnceV1(
      captured.pending,
      'reversed',
      write,
    );
    const conflicting = executePatternImportDxfPhaseEZeroConnectExistingLinkedN1WriteOnceV1(
      captured.pending,
      'same',
      write,
    );
    expect(first).toBe(same);
    expect(conflicting).toBeNull();
    expect(
      readPatternImportDxfPhaseEZeroConnectExistingLinkedN1WriteOnceV1(
        captured.pending,
        'reversed',
      ),
    ).toBe(first);
    expect(canReleasePatternImportDxfPhaseEZeroConnectExistingLinkedN1V1(captured.pending)).toBe(
      false,
    );
    await expect(first!).resolves.toBe(accepted);
    expect(canReleasePatternImportDxfPhaseEZeroConnectExistingLinkedN1V1(captured.pending)).toBe(
      true,
    );
    expect(write).toHaveBeenCalledOnce();

    const freshCard = structuredClone(fixture.savedCard);
    freshCard.lockVersion = accepted.lockVersion;
    freshCard.seams = [toWire(persisted), toWire(fixture.pose)] as never;
    expect(
      verifyPatternImportDxfPhaseEZeroConnectExistingLinkedN1ReadbackV1({
        pending: captured.pending,
        accepted,
        expectedSeam: persisted,
        freshCard,
      }),
    ).toMatchObject({ ok: true, seamKey: fixture.seam.seamKey, operationNumber: 30 });
    // Source-fingerprint staleness is a server read verdict. The seam key, anchors and accepted lock can all agree.
    const staleWire = { ...toWire(persisted), stale: true };
    const staleEcho = resolveStrictSeamUpsertReceipt(
      [persisted],
      [staleWire],
      accepted.lockVersion,
    );
    expect(staleEcho).toMatchObject({ ok: false, outcome: 'acknowledged-unverified' });

    const staleReadback = verifyPatternImportDxfPhaseEZeroConnectExistingLinkedN1ReadbackV1({
      pending: captured.pending,
      accepted,
      expectedSeam: persisted,
      freshCard: {
        ...freshCard,
        seams: [staleWire, toWire(fixture.pose)] as NonNullable<common_TechCard['seams']>,
      },
    });
    expect(staleReadback).toMatchObject({
      ok: false,
      blocker: { code: 'existing-linked-n1-readback-mismatch' },
    });
    freshCard.techCard!.operations![0]!.inputKeys = ['unexpected'];
    expect(
      verifyPatternImportDxfPhaseEZeroConnectExistingLinkedN1ReadbackV1({
        pending: captured.pending,
        accepted,
        expectedSeam: persisted,
        freshCard,
      }),
    ).toMatchObject({ ok: false, blocker: { code: 'existing-linked-n1-readback-mismatch' } });
  });

  it('verifies a metadata-only continuation only for the exact saved anchors at the capture lock', async () => {
    const fixture = await existingLinkedN1Fixture();
    const { savedCard, selectedIndex, liveOperations } = fixture;
    savedCard.techCard!.operations![selectedIndex]!.seamKeys = [fixture.seam.seamKey];
    liveOperations[selectedIndex]!.seamKeys = [fixture.seam.seamKey];
    const capture = (seam: StoredSeam) => {
      savedCard.seams = [toWire(seam)] as never;
      const stored = fromWire(savedCard.seams![0]!);
      if (!stored) throw new Error('Expected a persisted exact seam.');
      const captured = capturePatternImportDxfPhaseEZeroConnectExistingLinkedN1PendingV1({
        request: fixture.request,
        techCardId: fixture.prepared.techCardId,
        selectedIndex,
        liveOperations,
        savedCard,
        currentRows: [stored],
        seamWriterCardId: fixture.prepared.techCardId,
        seamWriterLockVersion: savedCard.lockVersion,
      });
      if (!captured.ok) throw new Error(captured.blocker.detail);
      return captured.pending;
    };
    const prepared = preparePatternImportDxfPhaseEZeroConnectExistingLinkedN1RebindV1(
      capture(fixture.seam),
      'reversed',
      { nameOf: (key) => key, grainDeg: null },
    );
    if (!prepared.ok) throw new Error(prepared.blocker.detail);
    const seam = prepared.receipt.storedSeam;
    const pending = capture(seam);
    const verify = (card: typeof savedCard) =>
      verifyPatternImportDxfPhaseEZeroConnectExistingLinkedN1ReadbackV1({
        mode: 'resume-metadata',
        pending,
        expectedSeam: seam,
        freshCard: card,
      });
    expect(verify(savedCard)).toMatchObject({
      ok: true,
      cardLockVersion: savedCard.lockVersion,
      seamKey: fixture.seam.seamKey,
    });
    expect(verify({ ...savedCard, lockVersion: savedCard.lockVersion! + 1 }).ok).toBe(false);
    const edited = structuredClone(savedCard);
    edited.seams![0]!.sideB!.parts![0]!.lenMm! += 1;
    expect(verify(edited).ok).toBe(false);
    const unanchored = structuredClone(savedCard);
    unanchored.seams![0]!.anchoredSize = '';
    expect(verify(unanchored).ok).toBe(false);
    expect(
      readPatternImportDxfPhaseEZeroConnectExistingLinkedN1WriteOnceV1(pending, 'reversed'),
    ).toBeUndefined();
  });

  it('releases a not-attempted writer so the user can cancel or retry safely', async () => {
    const fixture = await existingLinkedN1Fixture();
    const captured = capturePatternImportDxfPhaseEZeroConnectExistingLinkedN1PendingV1({
      request: fixture.request,
      techCardId: fixture.prepared.techCardId,
      selectedIndex: fixture.selectedIndex,
      liveOperations: fixture.liveOperations,
      savedCard: fixture.savedCard,
      currentRows: [fixture.seam, fixture.pose],
      seamWriterCardId: fixture.prepared.techCardId,
      seamWriterLockVersion: fixture.savedCard.lockVersion,
    });
    if (!captured.ok) throw new Error(captured.blocker.detail);
    const refused = Object.freeze({
      ok: false as const,
      rows: Object.freeze([]) as readonly [],
      seamKeys: Object.freeze([]) as readonly [],
      outcome: 'not-attempted' as const,
      blocker: Object.freeze({
        code: 'write-failed' as const,
        detail: 'The saved card moved before the request.',
      }),
    });
    const first = executePatternImportDxfPhaseEZeroConnectExistingLinkedN1WriteOnceV1(
      captured.pending,
      'same',
      async () => refused,
    );
    await expect(first!).resolves.toBe(refused);
    await Promise.resolve();
    expect(
      readPatternImportDxfPhaseEZeroConnectExistingLinkedN1WriteOnceV1(captured.pending, 'same'),
    ).toBeUndefined();
  });
});

describe('zero-operation production mount fresh-to-saved race failover', () => {
  it('re-reads the saved card after fresh preparation when the row appeared after Host routing', async () => {
    const original = await genuineSavedPrepared();
    const latestCard = savedCardWithRow(original);
    const sizeNameById = new Map([[7, 'M']]);
    const savedChoices = listPatternImportDxfPhaseECadTableZeroOperationSavedChoicesV1(
      latestCard,
      (ids) => ids,
      sizeNameById,
    );
    if (!savedChoices.ok) throw new Error(savedChoices.blocker.detail);
    const prepared = { ...original, choices: savedChoices.choices };
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
      choices: savedChoices.choices,
      selection: {
        selection: {
          pipeline: {
            contentBinding: { sourceSha256: prepared.authoringAuthority.row.sha256 },
          },
        },
      },
      catalog: prepared.catalog,
    } as unknown as FreshPrepared;
    const row = prepared.authoringAuthority.row;
    const evidence = {
      techCardId: row.techCardId,
      scopeKey: row.scopeKey,
      patternLineKey: row.patternLineKey,
      dxfSha256: row.sha256,
      patternVersion: 3,
      cardLockVersion: row.cardLockVersion,
    };
    const loadDocumentEvidence = vi.fn(async () => ({
      ok: true as const,
      evidence,
      blocker: null,
    }));
    const hostResolution = await preparePatternImportDxfPhaseECadTableZeroOperationSavedFailoverV1({
      fresh: freshPrepared,
      loadDocumentEvidence,
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
    expect(loadDocumentEvidence.mock.invocationCallOrder[0]).toBeLessThan(
      prepareSaved.mock.invocationCallOrder[0],
    );
    if (!hostResolution) throw new Error('Expected the independently prepared saved row');
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

    expect(loadDocumentEvidence).toHaveBeenCalledWith('main');
    const result = {
      result: prepared,
      resolvedSavedCard: latestCard,
      authoringPrepared: prepared,
      rebindExpectation:
        capturePatternImportDxfPhaseECadTableZeroOperationSavedRebindExpectationV1(prepared),
      resolvedSource: 'saved' as const,
    };
    const document = { ok: true as const, evidence, blocker: null };
    const resolveSource = resolvePatternImportDxfPhaseECadTableZeroOperationAfterFreshV1;
    for (const change of [
      { patternLineKey: 'same-bytes-replacement-row' },
      { patternVersion: 4 },
      { scopeKey: 'lining' },
      { techCardId: row.techCardId + 1 },
      { cardLockVersion: row.cardLockVersion + 1 },
      { dxfSha256: '0'.repeat(64) },
    ]) {
      expect(
        resolveSource(freshPrepared, result, {
          ok: true,
          evidence: { ...evidence, ...change },
          blocker: null,
        }),
      ).toBe(result);
    }
    expect(resolveSource(freshPrepared, result, null)).toBe(result);
    expect(
      resolveSource(freshPrepared, result, {
        ok: false,
        evidence: null,
        blocker: { code: 'confirmed-pattern-row-unavailable', detail: 'Row revision changed' },
      }),
    ).toBe(result);
    expect(resolveSource({ ...freshPrepared, choices: [] }, result, document)).toBe(result);
    expect(resolveSource({ ...freshPrepared, importGeneration: 38 }, result, document)).toBe(
      result,
    );

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
      document,
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
    const prepareSaved = vi.fn(
      async (_request: { sourceSurface?: 'explicit-native-drawn-sewing' }) => refreshed,
    );
    const owner = createPatternImportDxfPhaseECadTableZeroOperationAuthoringRefreshV1({
      prepared,
      expectation,
      savedAuthority: { resolveLatestCard } as never,
      preparationKey: 'card:6:main:M',
      orderSizeIds: (ids) => ids,
      sizeNameById: new Map([[7, 'M']]),
      sourceSurface: 'explicit-native-drawn-sewing',
      prepareSaved: prepareSaved as never,
    });

    expect(owner).not.toBeNull();
    const result = await owner!.refresh(new AbortController().signal);
    expect(resolveLatestCard).toHaveBeenCalledWith(
      prepared.authoringAuthority.row,
      expect.any(AbortSignal),
    );
    expect(prepareSaved).toHaveBeenCalledOnce();
    expect(prepareSaved.mock.calls[0]?.[0]).toMatchObject({
      sourceSurface: 'explicit-native-drawn-sewing',
    });
    expect(result).toMatchObject({
      ok: true,
      authority: refreshed.authoringAuthority,
      importGeneration: 37,
      blocker: null,
    });
  });

  it('refreshes the same captured lock before an existing operation writes its seam', async () => {
    const prepared = await genuineSavedPrepared(37, 12);
    const refreshed = await genuineSavedPrepared(37, 12);
    const expectation =
      capturePatternImportDxfPhaseECadTableZeroOperationSavedRebindExpectationV1(prepared);
    const resolveExactCurrentCard = vi.fn(async () => ({
      techCard: savedCardWithRow(refreshed),
      row: refreshed.authoringAuthority.row,
    }));
    const resolveLatestCard = vi.fn();
    const prepareSaved = vi.fn(async () => refreshed);
    const owner = createPatternImportDxfPhaseECadTableZeroOperationAuthoringRefreshV1({
      prepared,
      expectation,
      savedAuthority: { resolveExactCurrentCard, resolveLatestCard } as never,
      preparationKey: 'card:6:main:M',
      orderSizeIds: (ids) => ids,
      sizeNameById: new Map([[7, 'M']]),
      sourceSurface: 'explicit-native-drawn-sewing',
      prepareSaved: prepareSaved as never,
    });
    const signal = new AbortController().signal;

    await expect(owner!.refresh(signal, 'current')).resolves.toMatchObject({
      ok: true,
      authority: refreshed.authoringAuthority,
    });
    expect(resolveExactCurrentCard).toHaveBeenCalledWith(prepared.authoringAuthority.row, signal);
    expect(resolveLatestCard).not.toHaveBeenCalled();
    expect(prepareSaved).toHaveBeenCalledOnce();
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
