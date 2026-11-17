import type { common_TechCard } from 'api/proto-http/admin';
import type { CardDraft } from 'lib/pattern-import/types';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  exactRun: vi.fn(),
  exactCancel: vi.fn(),
  exactDispose: vi.fn(),
  createExactOwner: vi.fn(),
  foreignRun: vi.fn(),
  foreignCancel: vi.fn(),
  foreignDispose: vi.fn(),
  createForeignOwner: vi.fn(),
  createExactHost: vi.fn(() => ({ kind: 'exact-host' })),
  createForeignHost: vi.fn(() => ({ kind: 'foreign-host' })),
  resolveCapability: vi.fn(),
  select: vi.fn(),
  catalog: vi.fn(),
  projection: vi.fn(),
  compileSource: vi.fn(),
}));

vi.mock('lib/pattern-import/dxf-product-saved-reprocess-owner-v1', async (load) => {
  const actual =
    await load<typeof import('lib/pattern-import/dxf-product-saved-reprocess-owner-v1')>();
  return { ...actual, createDxfProductSavedReprocessOwnerV1: mocks.createExactOwner };
});

vi.mock('lib/pattern-import/dxf-product-saved-foreign-reprocess-owner-v1', async (load) => {
  const actual =
    await load<typeof import('lib/pattern-import/dxf-product-saved-foreign-reprocess-owner-v1')>();
  return { ...actual, createDxfProductSavedForeignReprocessOwnerV1: mocks.createForeignOwner };
});

vi.mock('./saved-dxf-reprocess-host-v1', async (load) => {
  const actual = await load<typeof import('./saved-dxf-reprocess-host-v1')>();
  return {
    ...actual,
    createPatternImportDxfPhaseESavedDxfReprocessHostV1: mocks.createExactHost,
  };
});

vi.mock('./foreign-saved-dxf-reprocess-host-v1', async (load) => {
  const actual = await load<typeof import('./foreign-saved-dxf-reprocess-host-v1')>();
  return {
    ...actual,
    createPatternImportDxfPhaseEForeignSavedDxfReprocessHostV1: mocks.createForeignHost,
  };
});

vi.mock('./zero-operation-saved-dxf-capability-v1', async (load) => {
  const actual = await load<typeof import('./zero-operation-saved-dxf-capability-v1')>();
  return {
    ...actual,
    resolvePatternImportDxfPhaseEZeroOperationSavedDxfCapabilityV1: mocks.resolveCapability,
  };
});

vi.mock('lib/cloth/domain/pattern-import-dxf-product-draft-phase-d-selection-v1', async (load) => {
  const actual =
    await load<
      typeof import('lib/cloth/domain/pattern-import-dxf-product-draft-phase-d-selection-v1')
    >();
  return { ...actual, selectPatternImportDxfProductDraftPhaseDSizeV1: mocks.select };
});

vi.mock(
  'lib/cloth/domain/pattern-import-dxf-product-phase-e-authoring-catalog-v1',
  async (load) => {
    const actual =
      await load<
        typeof import('lib/cloth/domain/pattern-import-dxf-product-phase-e-authoring-catalog-v1')
      >();
    return { ...actual, buildPatternImportDxfProductPhaseEAuthoringCatalogV1: mocks.catalog };
  },
);

vi.mock('lib/pattern-import/dxf-product-phase-e-assembly-workbench-v1', async (load) => {
  const actual =
    await load<typeof import('lib/pattern-import/dxf-product-phase-e-assembly-workbench-v1')>();
  return { ...actual, projectPatternImportDxfProductPhaseEAssemblyV1: mocks.projection };
});

vi.mock('./draft-cad-compile-source-v1', async (load) => {
  const actual = await load<typeof import('./draft-cad-compile-source-v1')>();
  return {
    ...actual,
    createPatternImportDxfPhaseEDraftCadCompileSourceV1: mocks.compileSource,
  };
});

import { preparePatternImportDxfPhaseECadTableZeroOperationSavedV1 } from './cad-table-zero-operation-saved-preparation-v1';
import { createPatternImportDxfPhaseECadTableZeroOperationGenerationOwnerV1 } from './cad-table-zero-operation-generation-owner-v1';

const MAIN = 'TECH_CARD_BOM_PURPOSE_MAIN';
const SHA = 'a'.repeat(64);
const SELECTION_SHA = 'b'.repeat(64);
const CATALOG_SHA = 'c'.repeat(64);
const ROW = Object.freeze({
  techCardId: 156,
  scopeKey: 'main',
  patternLineKey: 'pattern-main',
  revision: 1,
  cardLockVersion: 3,
  url: 'https://objects.example/main.dxf',
  sizeBytes: 2048,
  sha256: SHA,
});

function card(): common_TechCard {
  return {
    id: 156,
    lockVersion: 3,
    techCard: {
      sizeIds: [2],
      bomItems: [
        {
          lineKey: 'bom-main',
          name: 'Main fabric',
          section: 'TECH_CARD_BOM_SECTION_FABRIC',
          purpose: MAIN,
        },
      ],
      patterns: [
        {
          lineKey: ROW.patternLineKey,
          fabricPurpose: MAIN,
          url: ROW.url,
          downloadUrl: '/api/p/token/download',
          sizeBytes: ROW.sizeBytes,
          sha256: ROW.sha256,
          savedRowRevision: ROW.revision,
          filename: 'main.dxf',
        },
      ],
      pieces: [],
      pieceDxfAliases: { items: [] },
    },
  } as unknown as common_TechCard;
}

const exactDraft = { techCardId: 156, marker: 'exact' } as unknown as CardDraft;
const foreignDraft = { techCardId: 156, marker: 'foreign' } as unknown as CardDraft;

function request(sourceSurface?: 'explicit-native-drawn-sewing') {
  const generationOwner = createPatternImportDxfPhaseECadTableZeroOperationGenerationOwnerV1();
  return {
    ...(sourceSurface ? { sourceSurface } : {}),
    techCard: card(),
    orderSizeIds: (ids: number[]) => [...ids],
    sizeNameById: new Map([[2, 'M']]),
    scopeKey: 'main',
    sizeToken: 'M',
    authority: {
      authority: { kind: 'authority' },
      resolveCard: vi.fn(),
      resolveCurrentRow: vi.fn(async () => ({ row: ROW, downloadUrl: '/api/p/token/download' })),
    },
    generation: generationOwner.beginSaved('foreign-fallback-test'),
  } as never;
}

function exactFailure(code: string, detail = `exact:${code}`) {
  return {
    ok: false as const,
    blockers: [{ code, detail }],
    row: ROW,
    sourceFileId: 'source',
    draft: null,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.createExactOwner.mockReturnValue({
    run: mocks.exactRun,
    cancel: mocks.exactCancel,
    dispose: mocks.exactDispose,
  });
  mocks.createForeignOwner.mockReturnValue({
    run: mocks.foreignRun,
    cancel: mocks.foreignCancel,
    dispose: mocks.foreignDispose,
  });
  mocks.resolveCapability.mockReturnValue({
    ok: true,
    row: ROW,
    authority: { readAuthoritativeRow: vi.fn() },
    blockers: [],
  });
  mocks.select.mockResolvedValue({
    ok: true,
    selection: {
      ok: true,
      selection: { scopeKey: 'main', sizeToken: 'M', canonicalSha256: SELECTION_SHA },
      pipeline: { contentBinding: { sourceSha256: SHA, sourceFileId: 'source' } },
      phaseD: { source: { sourceFileId: 'source' } },
    },
  });
  mocks.catalog.mockResolvedValue({
    ok: true,
    catalog: {
      techCardId: 156,
      scopeKey: 'main',
      sizeToken: 'M',
      sourceFileId: 'source',
      sizeSelectionCanonicalSha256: SELECTION_SHA,
      canonicalSha256: CATALOG_SHA,
    },
  });
  mocks.projection.mockReturnValue({ ok: true, projection: { kind: 'projection' } });
  mocks.compileSource.mockReturnValue({
    schemaVersion: 'pattern-import-dxf-phase-e-draft-cad-compile-source/1',
    techCardId: 156,
    scopes: [],
    dxfProvenance: null,
    dxfPhaseDReplay: null,
  });
});

describe('zero-operation saved preparation foreign fallback', () => {
  it('requests native sewing explicitly and refuses absent replay without selecting cut geometry', async () => {
    mocks.exactRun.mockResolvedValue(exactFailure('foreign-saved-dxf-detected'));
    mocks.foreignRun.mockResolvedValue({ ok: true, draft: foreignDraft, blockers: [] });
    const result = await preparePatternImportDxfPhaseECadTableZeroOperationSavedV1(
      request('explicit-native-drawn-sewing'),
    );
    expect(result.ok).toBe(false);
    expect(mocks.createForeignHost).toHaveBeenCalledWith(
      expect.objectContaining({ nativeSewingReplay: true }),
    );
    expect(mocks.select).not.toHaveBeenCalled();
    expect(mocks.catalog).not.toHaveBeenCalled();
  });

  it('uses an exact reconstructed draft without constructing the foreign path', async () => {
    mocks.exactRun.mockResolvedValue({ ok: true, draft: exactDraft, blockers: [] });

    const result = await preparePatternImportDxfPhaseECadTableZeroOperationSavedV1(request());

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.selection.selection.scopeKey).toBe('main');
    expect(result.draftCadCompileSource).toMatchObject({ techCardId: 156 });
    expect(mocks.createForeignHost).not.toHaveBeenCalled();
    expect(mocks.createForeignOwner).not.toHaveBeenCalled();
    expect(mocks.select).toHaveBeenCalledWith(exactDraft, 'main', 'M');
    expect(mocks.catalog).toHaveBeenCalledWith(exactDraft, 'main', 'M');
    expect(mocks.compileSource).toHaveBeenCalledWith(exactDraft);
    expect(mocks.exactDispose).toHaveBeenCalledOnce();
  });

  it('uses the foreign-derived draft only after the exact host identifies a manifest-absent file', async () => {
    mocks.exactRun.mockResolvedValue(exactFailure('foreign-saved-dxf-detected'));
    mocks.foreignRun.mockResolvedValue({ ok: true, draft: foreignDraft, blockers: [] });

    const result = await preparePatternImportDxfPhaseECadTableZeroOperationSavedV1(request());

    expect(result.ok).toBe(true);
    expect(mocks.createForeignHost).toHaveBeenCalledOnce();
    expect(mocks.foreignRun).toHaveBeenCalledWith({
      schemaVersion: 'dxf-product-saved-foreign-reprocess-request/1',
      row: ROW,
    });
    expect(mocks.select).toHaveBeenCalledWith(foreignDraft, 'main', 'M');
    expect(mocks.catalog).toHaveBeenCalledWith(foreignDraft, 'main', 'M');
    expect(mocks.foreignDispose).toHaveBeenCalledOnce();
  });

  it('does not reinterpret a generic exact reprocess failure as a foreign file', async () => {
    mocks.exactRun.mockResolvedValue(exactFailure('saved-dxf-reprocess-failed'));

    const result = await preparePatternImportDxfPhaseECadTableZeroOperationSavedV1(request());

    expect(result).toMatchObject({
      ok: false,
      blocker: { code: 'saved-row-reprocess-blocked', detail: 'exact:saved-dxf-reprocess-failed' },
    });
    expect(mocks.createForeignHost).not.toHaveBeenCalled();
    expect(mocks.createForeignOwner).not.toHaveBeenCalled();
    expect(mocks.foreignRun).not.toHaveBeenCalled();
  });

  it('does not reinterpret an exact SHA/authority failure as a foreign file', async () => {
    mocks.exactRun.mockResolvedValue(exactFailure('saved-row-sha256-mismatch'));

    const result = await preparePatternImportDxfPhaseECadTableZeroOperationSavedV1(request());

    expect(result).toMatchObject({
      ok: false,
      blocker: { code: 'saved-row-reprocess-blocked', detail: 'exact:saved-row-sha256-mismatch' },
    });
    expect(mocks.createForeignHost).not.toHaveBeenCalled();
    expect(mocks.foreignRun).not.toHaveBeenCalled();
    expect(mocks.select).not.toHaveBeenCalled();
  });

  it('does not start the foreign owner when cancellation lands after exact classification', async () => {
    const controller = new AbortController();
    mocks.exactRun.mockImplementation(async () => {
      controller.abort();
      return exactFailure('foreign-saved-dxf-detected');
    });

    const result = await preparePatternImportDxfPhaseECadTableZeroOperationSavedV1(
      request(),
      controller.signal,
    );

    expect(result).toMatchObject({ ok: false, blocker: { code: 'saved-preparation-cancelled' } });
    expect(mocks.createForeignOwner).not.toHaveBeenCalled();
    expect(mocks.foreignRun).not.toHaveBeenCalled();
    expect(mocks.foreignDispose).not.toHaveBeenCalled();
    expect(mocks.select).not.toHaveBeenCalled();
  });

  it('publishes preparation cancellation when the foreign reconstruction is aborted', async () => {
    const controller = new AbortController();
    mocks.exactRun.mockResolvedValue(exactFailure('foreign-saved-dxf-detected'));
    mocks.foreignRun.mockImplementation(async () => {
      controller.abort();
      return exactFailure('cancelled');
    });

    const result = await preparePatternImportDxfPhaseECadTableZeroOperationSavedV1(
      request(),
      controller.signal,
    );

    expect(result).toMatchObject({ ok: false, blocker: { code: 'saved-preparation-cancelled' } });
    expect(mocks.foreignRun).toHaveBeenCalledOnce();
    expect(mocks.foreignDispose).toHaveBeenCalledOnce();
    expect(mocks.select).not.toHaveBeenCalled();
  });

  it('rejects a preparation superseded while exact reconstruction is running', async () => {
    const generationOwner = createPatternImportDxfPhaseECadTableZeroOperationGenerationOwnerV1();
    const first = generationOwner.beginSaved('saved-refresh:first');
    mocks.exactRun.mockImplementation(async () => {
      generationOwner.beginSaved('saved-refresh:second');
      return { ok: true, draft: exactDraft, blockers: [] };
    });

    const result = await preparePatternImportDxfPhaseECadTableZeroOperationSavedV1({
      ...(request() as object),
      generation: first,
    } as never);

    expect(result).toMatchObject({
      ok: false,
      preparationGeneration: null,
      importGeneration: null,
      blocker: { code: 'saved-preparation-generation-stale' },
    });
    expect(mocks.createForeignHost).not.toHaveBeenCalled();
    expect(mocks.foreignRun).not.toHaveBeenCalled();
  });
});
